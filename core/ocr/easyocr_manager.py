from __future__ import annotations

import json
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

from core.errors import PREFIX_OCR, log_error, log_event

EASYOCR_PLUGIN_REPO = "Nokrima/Virel-Plugins"
EASYOCR_RELEASE_TAG = "latest"  # Veya "v1.0"
EASYOCR_ASSET_NAME = "virel-easyocr-plugin.zip"

class EasyOCRManager:
    def __init__(self, plugins_dir: Path, bridge=None):
        self.plugins_dir = plugins_dir
        self.bridge = bridge
        self.plugin_dir = plugins_dir / "easyocr"
        self.tmp_dir = plugins_dir / "easyocr-tmp"
        
        self.state = "idle"
        self.percent = 0
        self.detail = "EasyOCR eklentisi bekleniyor."
        self.bytes_label = ""
        
        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._install_started_at = 0.0

    def get_status(self) -> dict:
        ready = self._is_ready()
        busy = self.state in {"planning", "downloading", "extracting", "verifying", "remove"}
        return {
            "plugin": "easyocr",
            "label": "EasyOCR Yapay Zeka Motoru",
            "available": ready,
            "busy": busy,
            "plugin_dir": str(self.plugin_dir),
            "state": "ready" if ready and not busy else self.state,
            "percent": 100 if ready and not busy else self.percent,
            "detail": "Eklenti hazır." if ready and not busy else self.detail,
            "bytes_label": self.bytes_label,
        }

    def start(self, bridge=None) -> None:
        if bridge is not None:
            self.bridge = bridge
        if self._is_ready():
            log_event(PREFIX_OCR, "080", "[EasyOCR Kurulumu] -> ATLANDI | Eklenti zaten hazir")
            self._send_status()
            return
        if self._thread and self._thread.is_alive():
            log_event(PREFIX_OCR, "081", "[EasyOCR Kurulumu] -> REDDEDILDI | Kurulum suruyor", level="warning")
            self._send_status()
            return
        
        self._cancel.clear()
        self._thread = threading.Thread(target=self._install_worker, name="easyocr-plugin-install", daemon=True)
        self._thread.start()

    def cancel(self) -> None:
        self._cancel.set()
        self.state = "idle"
        self.percent = 0
        self.detail = "Kurulum iptal edildi."
        self.bytes_label = ""
        log_event(PREFIX_OCR, "082", "[EasyOCR Kurulumu] -> IPTAL EDILDI", level="warning")
        self._send("easyocr_plugin_cancelled", {"message": "EasyOCR kurulumu iptal edildi."})
        self._send_status()

    def remove(self) -> None:
        log_event(PREFIX_OCR, "083", "[EasyOCR Kaldirma] -> BASLADI")
        self._cancel.set()
        self.state = "remove"
        self.percent = 0
        self.detail = "Eklenti kaldırılıyor."
        self.bytes_label = ""
        self._send_progress()
        
        if self.tmp_dir.exists():
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        if self.plugin_dir.exists():
            shutil.rmtree(self.plugin_dir, ignore_errors=True)
            
        self._reset_idle_state()
        log_event(PREFIX_OCR, "084", "[EasyOCR Kaldirma] -> TAMAMLANDI")
        self._send_status()

    def _install_worker(self) -> None:
        self._install_started_at = time.monotonic()
        try:
            self.plugins_dir.mkdir(parents=True, exist_ok=True)
            log_event(PREFIX_OCR, "085", "[EasyOCR Kurulumu] -> BASLADI")
            
            self._prepare_workspace()
            self._raise_if_cancelled()
            
            # 1. GitHub API uzerinden indirme linkini bul
            self._set_stage("planning", 5, "İndirme bağlantısı aranıyor")
            download_url, size = self._get_download_info()
            self._raise_if_cancelled()
            
            # 2. Dosyayi indir
            self._download_file(download_url, size)
            self._raise_if_cancelled()
            
            # 3. Zip'ten cikar
            self._extract_plugin()
            self._raise_if_cancelled()
            
            # 4. Dogrula
            self._verify_plugin()
            
            if self.tmp_dir.exists():
                shutil.rmtree(self.tmp_dir, ignore_errors=True)
                
            self.state = "ready"
            self.percent = 100
            self.detail = "EasyOCR Eklentisi hazır."
            self.bytes_label = ""
            
            elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000)
            log_event(PREFIX_OCR, "086", f"[EasyOCR Kurulumu] -> TAMAMLANDI | Sure(ms): {elapsed_ms}")
            self._send_status()
            self._send("easyocr_plugin_complete", {"percent": 100, "elapsed_ms": elapsed_ms})
            
        except RuntimeError as exc:
            if str(exc) == "cancelled" or self._cancel.is_set():
                if self.tmp_dir.exists():
                    shutil.rmtree(self.tmp_dir, ignore_errors=True)
                self._reset_idle_state()
                self._send_status()
                return
            self._fail(str(exc))
        except Exception as exc:
            self._fail(str(exc))

    def _prepare_workspace(self) -> None:
        if self.tmp_dir.exists():
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        if self.plugin_dir.exists():
            shutil.rmtree(self.plugin_dir, ignore_errors=True)
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    def _get_download_info(self) -> tuple[str, int]:
        import urllib.request
        
        # Direkt HuggingFace baglantisi
        url = "https://huggingface.co/Nokrima/virel-easyocr-plugin/resolve/main/virel-easyocr-plugin.zip"
        
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Virel-V2"})
            with urllib.request.urlopen(req, timeout=10) as response:
                total_bytes = int(response.headers.get('Content-Length', 0))
            return url, total_bytes
        except Exception as exc:
            raise RuntimeError(f"Indirme bilgisi alinamadi: {exc}")

    def _download_file(self, url: str, total_bytes: int) -> None:
        import urllib.request
        
        zip_path = self.tmp_dir / EASYOCR_ASSET_NAME


        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Virel-V2"})
            with urllib.request.urlopen(req, timeout=15) as response:
                total_size = int(response.headers.get("content-length", total_bytes))
                downloaded = 0
                
                with open(zip_path, "wb") as f:
                    while True:
                        self._raise_if_cancelled()
                        chunk = response.read(8192 * 4)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        self.percent = 10 + int((downloaded / total_size) * 70) if total_size > 0 else 50
                        self.detail = f"{EASYOCR_ASSET_NAME} indiriliyor"
                        self.bytes_label = f"{self._format_bytes(downloaded)} / {self._format_bytes(total_size)}"
                        self._send_progress()
        except RuntimeError as e:
            if str(e) == "Indirme iptal edildi.":
                raise e
            raise RuntimeError(f"Indirme basarisiz: {e}")
        except Exception as exc:
            raise RuntimeError(f"Indirme basarisiz: {exc}")

    def _extract_plugin(self) -> None:
        self._set_stage("extracting", 85, "Eklenti çıkartılıyor...")
        import zipfile
        
        zip_path = self.tmp_dir / EASYOCR_ASSET_NAME
        if not zip_path.exists():
            raise RuntimeError("Indirilen zip dosyasi bulunamadi.")
            
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(self.plugin_dir)
        except RuntimeError as e:
            if str(e) == "Indirme iptal edildi.":
                raise e
            raise RuntimeError(f"Zip cikartma hatasi: {e}")
        except Exception as exc:
            raise RuntimeError(f"Zip cikartma hatasi: {exc}")

    def _verify_plugin(self) -> None:
        self._set_stage("verifying", 95, "Eklenti doğrulanıyor...")
        # Ileride gercek worker.exe adini buraya girecegiz
        worker_exe = self.plugin_dir / "easyocr-worker.exe"
        if not worker_exe.exists():
            raise RuntimeError("easyocr-worker.exe bulunamadi!")

    def _is_ready(self) -> bool:
        return (self.plugin_dir / "easyocr-worker.exe").exists()

    def _reset_idle_state(self) -> None:
        ready = self._is_ready()
        self.state = "ready" if ready else "idle"
        self.percent = 100 if ready else 0
        self.detail = "Eklenti hazır." if ready else "EasyOCR eklentisi bekleniyor."
        self.bytes_label = ""

    def _raise_if_cancelled(self) -> None:
        if self._cancel.is_set():
            raise RuntimeError("cancelled")

    def _set_stage(self, state: str, percent: int, detail: str) -> None:
        self.state = state
        self.percent = max(0, min(100, int(percent)))
        self.detail = detail
        if state != "downloading":
            self.bytes_label = ""
        self._send_progress()
        self._send_status()

    def _send_progress(self) -> None:
        self._send(
            "easyocr_plugin_progress",
            {
                "stage": self.state,
                "percent": self.percent,
                "detail": self.detail,
                "bytes_label": self.bytes_label,
            },
        )

    def _send_status(self) -> None:
        self._send("easyocr_plugin_status", self.get_status())

    def _fail(self, message: str) -> None:
        self.state = "failed"
        self.percent = 0
        self.detail = message
        self.bytes_label = ""
        log_error(PREFIX_OCR, "088", f"[EasyOCR Kurulumu] -> HATA: {message}", "Eklenti kurulumu tamamlanamadı.")
        self._send("easyocr_plugin_error", {"message": message})
        self._send_status()

    def _send(self, event: str, data: dict) -> None:
        if self.bridge is not None:
            self.bridge.send(event, data)

    def _format_bytes(self, value: int) -> str:
        size = float(max(value, 0))
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024.0 or unit == "GB":
                return f"{size:.1f}{unit}" if unit != "B" else f"{int(size)}B"
            size /= 1024.0
        return f"{int(value)}B"
