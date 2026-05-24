"""
GPU Canavarı (EasyOCREngine): Derin öğrenme tabanlı, ağır ama güçlü OCR motoru.
V2 iyileştirmesi: RAM optimizasyonu sağlandı ve geçersiz dil kodu hatası giderildi.
"""
from __future__ import annotations

import numpy as np

from core.errors import PREFIX_OCR, get_logger
from core.ocr.base import OCREngine


class EasyOCREngine(OCREngine):
    def __init__(self):
        super().__init__()
        self.logger = get_logger()
        self.reader = None
        # "auto" modda Ingilizce varsayilan — belirsiz Japonca listesi kaldirildi.
        self.source_language = "auto"
        self.lang_list = ["en", "ru"]
        self.use_gpu = False
        try:
            import torch
            self.use_gpu = torch.cuda.is_available()
        except Exception as e:
            self.logger.warning(f"[{PREFIX_OCR}-050] PyTorch baslangic kontrolu atlandi (Bozuk DLL veya kilitli GPU): {e}")
            pass

    @property
    def name(self) -> str:
        """Arayüzde gösterilecek motor adı."""
        return "EasyOCR GPU" if self.use_gpu else "EasyOCR CPU"

    def start(self) -> bool:
        """
        Motoru hazırlar ve gerekli modelleri belleğe yükler.
        """
        self.start_error = None
        try:
            import torch
            import easyocr

            lang_list = list(self.lang_list)
            self.logger.info(
                f"[{PREFIX_OCR}-046] EasyOCR runtime probe: languages={lang_list}, gpu={self.use_gpu}, "
                f"torch_cuda={torch.version.cuda}, cuda_available={torch.cuda.is_available()}, "
                f"cuda_device_count={torch.cuda.device_count()}"
            )

            self.logger.info(f"[{PREFIX_OCR}-032] EasyOCR {lang_list} dilleriyle yükleniyor (GPU: {self.use_gpu})")

            self.reader = easyocr.Reader(lang_list, gpu=self.use_gpu)
            self._is_ready = True
            self.logger.info(f"[{PREFIX_OCR}-047] EasyOCR ready: languages={lang_list}, gpu={self.use_gpu}")
            return True

        except ImportError:
            self.start_error = "EasyOCR kütüphanesi veya PyTorch bulunamadı."
            self.logger.error(f"[{PREFIX_OCR}-033] EasyOCR kütüphanesi bulunamadı.")
            return False
        except Exception as exc:
            self.start_error = f"{type(exc).__name__}: {exc}"
            self.logger.error(f"[{PREFIX_OCR}-048] EasyOCR start failed: {type(exc).__name__}: {exc}")
            return False

    def read(self, image: np.ndarray) -> list[tuple]:
        """Görüntüyü okur ve kutu, metin, güven skoru döndürür."""
        if not self._is_ready or self.reader is None:
            return []

        try:
            results = self.reader.readtext(image, detail=1)
            return [(bbox, text, int(prob * 100)) for bbox, text, prob in results]  # type: ignore
        except Exception as exc:
            self.logger.error(f"[{PREFIX_OCR}-034] EasyOCR okuma sırasında çöktü: {exc}")
            err_str = str(exc).lower()
            if "memory" in err_str or "cuda" in err_str or "cublas" in err_str or "alloc" in err_str:
                from core.errors import emit_bridge_event
                self.use_gpu = False
                emit_bridge_event("translation_state", {
                    "running": False,
                    "reason": "engine_unavailable",
                    "message": "Ekran kartı belleği doldu. Çeviri CPU moduna geçiyor."
                })
            return []

    def stop(self) -> None:
        """Belleği temizler ve motoru kapatır."""
        self.reader = None
        if self.use_gpu:
            try:
                import torch
                torch.cuda.empty_cache()
            except ImportError:
                pass
        self._is_ready = False

    def configure_source_language(self, source_language: str) -> None:
        # "auto" dahil her durumda Ingilizce calis — belirsiz mod kaldirildi.
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
        if self.reader is not None:
            self.stop()
        else:
            self._is_ready = False

    def system_check(self) -> dict:
        """Arayüz için motorun sağlık raporunu üretir."""
        status = {
            "available": False,
            "reason": "",
            "requirements": "GPU (Önerilen)",
            "critical_component": "easyocr",
            "cpu_ok": True,
            "gpu_ok": self.use_gpu,
            "ram_ok": True,
        }
        try:
            import easyocr  # noqa: F401

            status["available"] = True
            if not self.use_gpu:
                status["reason"] = "GPU yok. CPU modu aşırı yavaş çalışacaktır."
        except ImportError:
            status["reason"] = "PyTorch veya EasyOCR kütüphaneleri eksik."
        return status
