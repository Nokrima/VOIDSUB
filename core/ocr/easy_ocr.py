"""
GPU Canavarı (EasyOCREngine): Derin öğrenme tabanlı, ağır ama güçlü OCR motoru.
VoidSub iyileştirmesi: derlemeler için taşınabilir worker (subprocess) mimarisi eklendi.
"""
from __future__ import annotations

import base64
import json
import os
import queue
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any
import cv2
import numpy as np

from core.errors import PREFIX_OCR, get_logger
from core.ocr.base import OCREngine


class EasyOCREngine(OCREngine):
    def __init__(self):
        super().__init__()
        self.logger = get_logger()
        self.reader: Any = None
        self.worker_proc: subprocess.Popen | None = None
        self._stdout_q = queue.Queue(maxsize=30)
        self.source_language = "auto"
        self.lang_list = ["en", "ru"]
        self.use_gpu = False
        self.is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
        self.plugin_python = self._get_plugin_python()

    @property
    def name(self) -> str:
        return "EasyOCR GPU" if self.use_gpu else "EasyOCR CPU"

    def _get_plugin_python(self) -> Path | None:
        app_data = Path(os.environ.get('LOCALAPPDATA', 'C:/')) / 'VoidSub'
        python_exe = app_data / 'plugins' / 'easyocr' / 'python.exe'
        return python_exe if python_exe.exists() else None

    def start(self) -> bool:
        self.start_error = None
        
        # 1. Eğer eklenti varsa WORKER modunda başlat (Nuitka için ZORUNLU)
        if self.plugin_python:
            return self._start_worker_mode()

        # 2. Eğer eklenti yoksa ama derlenmiş bir uygulama ise, çalışamaz.
        if self.is_compiled:
            self.start_error = "EasyOCR eklentisi (taşınabilir Python) bulunamadı. Lütfen eklentiyi indirin."
            self.logger.error(f"[{PREFIX_OCR}-033] {self.start_error}")
            return False

        # 3. Geliştirici ortamındaysa yerel kütüphaneyi dene
        return self._start_native_mode()

    def _start_worker_mode(self) -> bool:
        try:
            if not self.plugin_python:
                self.start_error = "plugin_python None."
                return False
                
            worker_script = self.plugin_python.parent / "easyocr-worker.py"
            if not worker_script.exists():
                self.start_error = "easyocr-worker.py bulunamadı!"
                return False

            self.logger.info(f"[{PREFIX_OCR}-032] EasyOCR Worker başlatılıyor: {self.plugin_python}")
            cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
            self.worker_proc = subprocess.Popen(
                [str(self.plugin_python), str(worker_script)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                creationflags=cflags
            )
            
            # Stderr'i okuyup loglamak ve buffer'i temiz tutmak (Deadlock engelleme)
            def stderr_reader(proc):
                for line in iter(proc.stderr.readline, ''):
                    if line:
                        self.logger.warning(f"[{PREFIX_OCR}-WRK-ERR] {line.strip()}")
                proc.stderr.close()

            # Stdout'u kuyruga almak (Timeout desteklemek icin)
            def stdout_reader(proc, q):
                for line in iter(proc.stdout.readline, ''):
                    q.put(line)

            threading.Thread(target=stderr_reader, args=(self.worker_proc,), daemon=True).start()
            threading.Thread(target=stdout_reader, args=(self.worker_proc, self._stdout_q), daemon=True).start()

            # GPU kontrolünü worker'dan almak zordur, şimdilik varsayılan true/false atayabiliriz
            # (Worker kodu gpu=torch.cuda.is_available() yapıyor)
            self.use_gpu = True 
            self._is_ready = True
            self.logger.info(f"[{PREFIX_OCR}-047] EasyOCR Worker hazır.")
            return True
        except Exception as exc:
            self.start_error = f"{type(exc).__name__}: {exc}"
            self.logger.error(f"[{PREFIX_OCR}-048] EasyOCR Worker start failed: {exc}")
            return False

    def _start_native_mode(self) -> bool:
        try:
            import torch
            import easyocr
            self.use_gpu = torch.cuda.is_available()
            self.logger.info(f"[{PREFIX_OCR}-032] EasyOCR Native {self.lang_list} dilleriyle yükleniyor (GPU: {self.use_gpu})")
            self.reader = easyocr.Reader(self.lang_list, gpu=self.use_gpu)
            self._is_ready = True
            return True
        except ImportError:
            self.start_error = "EasyOCR kütüphanesi veya PyTorch bulunamadı."
            return False
        except Exception as exc:
            self.start_error = f"{type(exc).__name__}: {exc}"
            return False

    def read(self, image: np.ndarray) -> list[tuple]:
        if not self._is_ready:
            return []

        if self.worker_proc:
            return self._read_worker_mode(image)
        elif self.reader:
            return self._read_native_mode(image)
        return []

    def _read_worker_mode(self, image: np.ndarray) -> list[tuple]:
        try:
            ok, encoded = cv2.imencode('.png', image)
            if not ok:
                return []
            img_b64 = base64.b64encode(encoded.tobytes()).decode('ascii')
            payload = json.dumps({"command": "read", "image": img_b64}) + "\n"
            
            if self.worker_proc.stdin:
                self.worker_proc.stdin.write(payload)
                self.worker_proc.stdin.flush()
            
            try:
                response_line = self._stdout_q.get(timeout=15.0)
            except queue.Empty:
                self.logger.error(f"[{PREFIX_OCR}-034] EasyOCR Worker yanit vermedi (Timeout). Yeniden baslatiliyor...")
                self.stop()
                return []
                
            if not response_line:
                return []
                
            response = json.loads(response_line)
            if response.get("status") == "ok":
                return [(item[0], item[1], item[2]) for item in response.get("data", [])]
            else:
                self.logger.error(f"[{PREFIX_OCR}-034] EasyOCR Worker Hatası: {response.get('message')}")
                return []
        except Exception as exc:
            self.logger.error(f"[{PREFIX_OCR}-034] EasyOCR Worker iletişim hatası: {exc}")
            return []

    def _read_native_mode(self, image: np.ndarray) -> list[tuple]:
        try:
            results = self.reader.readtext(image, detail=1)
            return [(bbox, text, int(prob * 100)) for bbox, text, prob in results]
        except Exception as exc:
            self.logger.error(f"[{PREFIX_OCR}-034] EasyOCR okuma sırasında çöktü: {exc}")
            return []

    def stop(self) -> None:
        self._is_ready = False
        if self.worker_proc:
            try:
                self.worker_proc.terminate()
                self.worker_proc.wait(timeout=1.0)
            except Exception:
                pass
            self.worker_proc = None
            
        # Kuyrugu temizle
        while not self._stdout_q.empty():
            try:
                self._stdout_q.get_nowait()
            except queue.Empty:
                break
            
        self.reader = None
        if self.use_gpu and not self.is_compiled:
            try:
                import torch
                torch.cuda.empty_cache()
            except ImportError:
                pass

    def configure_source_language(self, source_language: str) -> None:
        normalized = str(source_language or "auto").strip().lower()
        if normalized == "en":
            lang_list = ["en"]
        elif normalized == "ru":
            lang_list = ["ru", "en"]
        else:
            normalized = "auto"
            lang_list = ["en", "ru"]
        if normalized == self.source_language and lang_list == self.lang_list:
            return
        self.source_language = normalized
        self.lang_list = lang_list
        if self.reader is not None or self.worker_proc is not None:
            self.stop()
        else:
            self._is_ready = False

    def system_check(self) -> dict:
        status = {
            "available": False,
            "reason": "",
            "requirements": "GPU (Önerilen)",
            "critical_component": "easyocr",
            "cpu_ok": True,
            "gpu_ok": self.use_gpu,
            "ram_ok": True,
        }
        
        if self.plugin_python:
            status["available"] = True
            return status
            
        if self.is_compiled:
            status["reason"] = "EasyOCR Eklentisi eksik. Ayarlardan indirin."
            return status
            
        try:
            import easyocr  # noqa: F401
            status["available"] = True
            if not self.use_gpu:
                status["reason"] = "GPU yok. CPU modu aşırı yavaş çalışacaktır."
        except ImportError:
            status["reason"] = "PyTorch veya EasyOCR kütüphaneleri eksik."
            
        return status
