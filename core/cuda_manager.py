from __future__ import annotations

import json
import re
import socket
import subprocess
import sys
import threading
import time
from importlib import metadata
from pathlib import Path

from core.errors import PREFIX_SYS, log_error, log_event

MIN_TORCH_VERSION = (2, 6)

class CudaManager:
    def __init__(self, bridge=None):
        self.bridge = bridge
        self.state = "idle"
        self.percent = 0
        self.detail = "CUDA kurulumu bekleniyor."
        self.bytes_label = ""
        self.active_proc: subprocess.Popen | None = None
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._install_started_at = 0.0

    def get_status(self) -> dict:
        ready = self._is_ready()
        busy = self.state in {"downloading", "installing"}
        return {
            "available": ready,
            "busy": busy,
            "state": "ready" if ready and not busy else self.state,
            "percent": 100 if ready and not busy else self.percent,
            "detail": "CUDA hızlandırma modülü hazır." if ready and not busy else self.detail,
            "bytes_label": self.bytes_label,
        }

    def start(self, bridge=None) -> None:
        if bridge is not None:
            self.bridge = bridge
        if self._is_ready():
            log_event(PREFIX_SYS, "090", "[CUDA Kurulumu] -> ATLANDI | Zaten kurulu")
            self._send_status()
            return
        if self._thread and self._thread.is_alive():
            log_event(PREFIX_SYS, "091", "[CUDA Kurulumu] -> REDDEDİLDİ | Kurulum zaten sürüyor", level="warning")
            self._send_status()
            return
            
        self._cancel.clear()
        self._thread = threading.Thread(target=self._install_worker, name="cuda-install-worker", daemon=True)
        self._thread.start()

    def remove(self) -> None:
        if not self._is_ready():
            return
        if self._thread and self._thread.is_alive():
            return
        
        self._cancel.clear()
        self._thread = threading.Thread(target=self._remove_worker, name="cuda-remove-worker", daemon=True)
        self._thread.start()

    def cancel(self) -> None:
        self._cancel.set()
        if self.active_proc and self.active_proc.poll() is None:
            self.active_proc.terminate()
        self.state = "idle"
        self.percent = 0
        self.detail = "Kurulum iptal edildi."
        self.bytes_label = ""
        log_event(PREFIX_SYS, "092", "[CUDA Kurulumu] -> İPTAL EDİLDİ", level="warning")
        self._send("cuda_cancelled", {"message": "CUDA indirmesi iptal edildi."})
        self._send_status()

    def _install_worker(self) -> None:
        self._install_started_at = time.monotonic()
        try:
            log_event(PREFIX_SYS, "093", "[CUDA Kurulumu] -> BAŞLADI")
            
            is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
            if is_compiled:
                raise RuntimeError("Derlenmiş sürümde CUDA doğrudan pip ile kurulamaz. Lütfen ayarlardan EasyOCR eklentisini indirin.")

            self._set_stage("downloading", 5, "NVIDIA CUDA paketleri aranıyor...")
            
            # Use PyTorch with CUDA 12.4
            command = [
                sys.executable,
                "-m",
                "pip",
                "install",
                "torch", "torchvision", "torchaudio",
                "--index-url", "https://download.pytorch.org/whl/cu124",
                "--upgrade"
            ]
            
            self._run_process(command, "CUDA paketi indirilemedi veya kurulamadı")
            
            self._raise_if_cancelled()
            
            self.state = "ready"
            self.percent = 100
            self.detail = "CUDA hızlandırması başarıyla kuruldu."
            self.bytes_label = ""
            elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000)
            log_event(PREFIX_SYS, "094", f"[CUDA Kurulumu] -> TAMAMLANDI | Süre(ms): {elapsed_ms}")
            self._send_status()
            self._send("cuda_complete", {"percent": 100, "elapsed_ms": elapsed_ms})
            
        except RuntimeError as exc:
            if str(exc) == "cancelled" or self._cancel.is_set():
                self._reset_idle_state()
                self._send_status()
                return
            self._fail(str(exc))
        except Exception as exc:
            self._fail(str(exc))
        finally:
            self.active_proc = None

    def _remove_worker(self) -> None:
        self._install_started_at = time.monotonic()
        try:
            log_event(PREFIX_SYS, "098", "[CUDA Kaldırma] -> BAŞLADI")
            self._set_stage("remove", 10, "CUDA kütüphaneleri sistemden kaldırılıyor...")
            
            command = [
                sys.executable,
                "-m",
                "pip",
                "uninstall",
                "-y",
                "torch", "torchvision", "torchaudio"
            ]
            
            self._run_process(command, "CUDA paketi kaldırılamadı")
            
            self._raise_if_cancelled()
            
            self.state = "idle"
            self.percent = 0
            self.detail = "CUDA sistemden tamamen kaldırıldı."
            self.bytes_label = ""
            elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000)
            log_event(PREFIX_SYS, "099", f"[CUDA Kaldırma] -> TAMAMLANDI | Süre(ms): {elapsed_ms}")
            self._send_status()
            self._send("cuda_complete", {"percent": 0, "elapsed_ms": elapsed_ms})
            
        except RuntimeError as exc:
            if str(exc) == "cancelled" or self._cancel.is_set():
                self._reset_idle_state()
                self._send_status()
                return
            self._fail(str(exc))
        except Exception as exc:
            self._fail(str(exc))
        finally:
            self.active_proc = None

    def _run_process(self, command: list[str], failure_message: str) -> None:
        import collections
        
        cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.active_proc = subprocess.Popen(
            command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True, 
            encoding="utf-8", 
            errors="replace", 
            creationflags=cflags
        )
        
        stderr_deque = collections.deque(maxlen=30)
        
        def _read_stream(stream, is_stdout):
            if not stream:
                return
            for line in iter(stream.readline, ""):
                if not line:
                    break
                line_str = line.strip()
                if line_str:
                    if is_stdout:
                        # Parse pip output for progress
                        if "Downloading" in line_str or "Downloading torch" in line_str:
                            self._set_stage("downloading", 20, "Dosyalar indiriliyor (Bağlantı hızına göre sürebilir)")
                            m = re.search(r'\(([\d.]+\s*[MkmG]B)\)', line_str, re.IGNORECASE)
                            if m:
                                self.bytes_label = f"~ {m.group(1)}"
                            
                            self.detail = line_str[:60] + ("..." if len(line_str) > 60 else "")
                            self._send_progress()
                        elif "Installing collected packages" in line_str:
                            self._set_stage("installing", 80, "Sisteme entegre ediliyor (1-2 dakika sürebilir)...")
                        log_event(PREFIX_SYS, "095", f"[CUDA PIP] -> {line_str}")
                    else:
                        stderr_deque.append(line_str)
            stream.close()

        t_out = threading.Thread(target=_read_stream, args=(self.active_proc.stdout, True), daemon=True)
        t_err = threading.Thread(target=_read_stream, args=(self.active_proc.stderr, False), daemon=True)
        t_out.start()
        t_err.start()

        while self.active_proc.poll() is None:
            if self._cancel.is_set():
                self.active_proc.terminate()
                try:
                    self.active_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.active_proc.kill()
                raise RuntimeError("cancelled")
            time.sleep(0.5)
            
        t_out.join(timeout=1)
        t_err.join(timeout=1)
        
        if self.active_proc.returncode != 0:
            for line in list(stderr_deque):
                log_event(PREFIX_SYS, "096", f"[CUDA Kurulum Hatası] -> {line}", level="error")
            raise RuntimeError(f"{failure_message}: exit code {self.active_proc.returncode}")

    def _is_ready(self) -> bool:
        try:
            import torch
            # Sadece torch'un kurulu olması yetmez, cuda_is_available olması gerekir.
            # Fakat eger indirmeyi biz cu124 ile yapmissak ve ekran karti yoksa da is_available False donebilir.
            # O yuzden CUDA destekli versiyonu (mesela "+cu" versiyonunu) kurup kurmadigimizi kontrol etmeliyiz.
            if "cu" in torch.__version__:
                return True
            return torch.cuda.is_available()
        except ImportError:
            return False

    def _reset_idle_state(self) -> None:
        ready = self._is_ready()
        self.state = "ready" if ready else "idle"
        self.percent = 100 if ready else 0
        self.detail = "CUDA hazır." if ready else "CUDA kurulumu bekleniyor."
        self.bytes_label = ""

    def _raise_if_cancelled(self) -> None:
        if self._cancel.is_set():
            raise RuntimeError("cancelled")

    def _set_stage(self, state: str, percent: int, detail: str) -> None:
        self.state = state
        self.percent = max(0, min(100, percent))
        self.detail = detail
        self._send_progress()
        self._send_status()

    def _send_progress(self) -> None:
        self._send(
            "cuda_progress",
            {
                "stage": self.state,
                "percent": self.percent,
                "detail": self.detail,
                "bytes_label": self.bytes_label,
            },
        )

    def _send_status(self) -> None:
        self._send("cuda_status", self.get_status())

    def _fail(self, message: str) -> None:
        elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000) if self._install_started_at else 0
        self.state = "failed"
        self.percent = 0
        self.detail = message
        self.bytes_label = ""
        log_error(PREFIX_SYS, "097", f"[CUDA Kurulumu] -> BAŞARISIZ | Süre: {elapsed_ms} | Hata: {message}", "CUDA indirilemedi.")
        self._send("cuda_error", {"message": message, "elapsed_ms": elapsed_ms})
        self._send_status()

    def _send(self, event: str, data: dict) -> None:
        if self.bridge is not None:
            self.bridge.send(event, data)
