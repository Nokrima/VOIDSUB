"""
Windows OCR motoru.
"""
from __future__ import annotations

import asyncio
import re
import threading
import time
import unicodedata
from typing import Any

import cv2
import numpy as np

from core.errors import PREFIX_OCR, get_logger
from core.ocr.base import OCREngine


class WindowsOCREngine(OCREngine):
    def __init__(self):
        super().__init__()
        self.logger = get_logger()
        self.engine: Any = None
        self.source_language = "auto"
        self.language_tag = "en-US"
        self.loop: asyncio.AbstractEventLoop | None = None
        self.thread: threading.Thread | None = None
        self.ready_event = threading.Event()
        self.read_lock = threading.Lock()
        self.start_error: str | None = None
        self.last_error_message = ""
        self.last_error_time = 0.0

    @property
    def name(self) -> str:
        return "Windows OCR"

    def start(self) -> bool:
        if self.thread and self.thread.is_alive() and self.loop and self.engine is not None:
            self._is_ready = True
            return True

        self.logger.info(
            f"[{PREFIX_OCR}-043] Windows OCR start requested: source_language={self.source_language}, language_tag={self.language_tag}"
        )
        self.ready_event.clear()
        self.start_error = None
        self.thread = threading.Thread(target=self._worker_main, name="winocr-loop", daemon=True)
        self.thread.start()
        self.ready_event.wait(timeout=3.0)

        if self.engine is None:
            if self.start_error:
                self.logger.error(self.start_error)
            else:
                self.logger.error(f"[{PREFIX_OCR}-043] Windows OCR start failed: engine=None, start_error=None")
            return False

        self._is_ready = True
        self.logger.info(f"[{PREFIX_OCR}-044] Windows OCR ready: language_tag={self.language_tag}")
        return True

    def _worker_main(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self.loop = loop
        language_tag = self.language_tag
        try:
            from winrt.windows.globalization import Language
            import winrt.windows.foundation  # noqa: F401
            import winrt.windows.foundation.collections  # noqa: F401
            import winrt.windows.storage.streams  # noqa: F401
            from winrt.windows.media.ocr import OcrEngine

            available = [lang.language_tag for lang in OcrEngine.available_recognizer_languages]
            self.logger.info(
                f"[{PREFIX_OCR}-045] Windows OCR language probe: requested={language_tag}, available={available}"
            )
            self.engine = OcrEngine.try_create_from_language(Language(language_tag))
            if not self.engine:
                self.start_error = f"[{PREFIX_OCR}-001] Windows OCR dil paketi eksik: {language_tag}"
                return
            self.ready_event.set()
            loop.run_forever()
        except ImportError:
            self.start_error = f"[{PREFIX_OCR}-002] WinRT (Windows API) paketi bulunamadi."
        except Exception as exc:
            self.start_error = f"[{PREFIX_OCR}-046] Windows OCR worker failed: {type(exc).__name__}: {exc}"
        finally:
            self.ready_event.set()
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()

    def read(self, image: np.ndarray) -> list[tuple]:
        if not self._is_ready or self.engine is None or self.loop is None:
            return []

        if not self.read_lock.acquire(timeout=2.6):
            return []
        try:
            future = asyncio.run_coroutine_threadsafe(self._async_read(image.copy()), self.loop)
            return future.result(timeout=2.5)
        except Exception as exc:
            message = str(exc)
            now = time.monotonic()
            if message != self.last_error_message or now - self.last_error_time >= 2.0:
                self.logger.error(f"[{PREFIX_OCR}-003] Okuma sırasında hata: {message}")
                self.last_error_message = message
                self.last_error_time = now
            return []
        finally:
            self.read_lock.release()

    async def _async_read(self, image: np.ndarray) -> list[tuple]:
        from winrt.windows.graphics.imaging import BitmapPixelFormat, SoftwareBitmap

        bgra_image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
        height, width = bgra_image.shape[:2]

        bitmap = SoftwareBitmap(BitmapPixelFormat.BGRA8, width, height)
        bitmap.copy_from_buffer(bgra_image.tobytes())  # type: ignore[arg-type]

        result = await self.engine.recognize_async(bitmap)  # type: ignore[union-attr]

        lines: list[tuple] = []
        if result and result.lines:
            for line in result.lines:
                normalized = self._normalize_line(str(line.text))
                if normalized:
                    lines.append((None, normalized, 100))
        return self._filter_lines(lines)

    def _normalize_line(self, text: str) -> str:
        cleaned = unicodedata.normalize("NFKC", text).strip()
        cleaned = cleaned.replace("．．．", "…").replace("...", "…")
        bar_chars = r"[|¦ǀ∣❘⎪]"
        cleaned = re.sub(rf"(?<=[a-zçğıöşü]){bar_chars}+(?=[a-zçğıöşü])", "ı", cleaned)
        cleaned = re.sub(rf"{bar_chars}+", "I", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned)
        cleaned = re.sub(r"([、。！？…ー])\1{1,}", r"\1", cleaned)
        return cleaned.strip(" -_|~")

    def _filter_lines(self, lines: list[tuple]) -> list[tuple]:
        if not lines:
            return []

        unique: list[tuple] = []
        seen: set[str] = set()
        for line in lines:
            text = str(line[1]).strip()
            if not text or text in seen:
                continue
            seen.add(text)
            unique.append(line)

        has_kanji = any(self._kanji_count(str(line[1])) > 0 for line in unique)
        if not has_kanji:
            return unique

        filtered = [line for line in unique if not self._is_probable_reading_line(str(line[1]))]
        return filtered or unique

    def _kanji_count(self, text: str) -> int:
        return len(re.findall(r"[\u4e00-\u9fff]", text))

    def _is_probable_reading_line(self, text: str) -> bool:
        total = max(len(text), 1)
        kanji = self._kanji_count(text)
        hiragana = len(re.findall(r"[\u3040-\u309f]", text))
        katakana = len(re.findall(r"[\u30a0-\u30ff]", text))
        punctuation = len(re.findall(r"[、。！？…ー「」『』]", text))
        kana_ratio = (hiragana + katakana) / total
        return kanji == 0 and punctuation == 0 and total <= 14 and kana_ratio >= 0.85

    def stop(self) -> None:
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self.loop.stop)
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.thread = None
        self.loop = None
        self.engine = None
        self._is_ready = False

    def _find_best_language(self, requested: str) -> str:
        try:
            from winrt.windows.media.ocr import OcrEngine
            available = [lang.language_tag for lang in OcrEngine.available_recognizer_languages]
            if not available:
                return "en-US"
            
            available_lower = [t.lower() for t in available]
            
            if requested == "en":
                for idx, t in enumerate(available_lower):
                    if t.startswith("en"):
                        return available[idx]
            if requested == "ru":
                for idx, t in enumerate(available_lower):
                    if t.startswith("ru"):
                        return available[idx]
                        
            # Auto fallback priority: English -> Russian -> Japanese -> System Default
            for idx, t in enumerate(available_lower):
                if t.startswith("en"):
                    return available[idx]
            for idx, t in enumerate(available_lower):
                if t.startswith("ru"):
                    return available[idx]
            for idx, t in enumerate(available_lower):
                if t.startswith("ja"):
                    return available[idx]
            
            return available[0] # WHATEVER is available
        except Exception:
            return "en-US"

    def configure_source_language(self, source_language: str) -> None:
        next_tag = self._find_best_language(source_language)
        if source_language == self.source_language and next_tag == self.language_tag:
            return
        
        self.source_language = source_language
        self.language_tag = next_tag
        if self.thread and self.thread.is_alive():
            self.stop()
        else:
            self.engine = None
            self._is_ready = False

    def system_check(self) -> dict:
        status = {
            "available": False,
            "reason": "",
            "requirements": "Windows 10/11",
            "critical_component": "winrt",
            "cpu_ok": True,
            "gpu_ok": True,
            "ram_ok": True,
        }
        try:
            from winrt.windows.globalization import Language
            import winrt.windows.foundation  # noqa: F401
            import winrt.windows.foundation.collections  # noqa: F401
            import winrt.windows.storage.streams  # noqa: F401
            from winrt.windows.media.ocr import OcrEngine

            available = [lang.language_tag for lang in OcrEngine.available_recognizer_languages]
            if not available:
                status["available"] = False
                status["reason"] = "Sistemde hiçbir Windows OCR dil paketi kurulu değil!"
                return status

            check_tag = self.language_tag if self.language_tag else available[0]
            status["available"] = OcrEngine.try_create_from_language(Language(check_tag)) is not None
            if not status["available"]:
                status["reason"] = f"Windows OCR paketi başlatılamadı: {check_tag}"
        except ImportError:
            status["reason"] = "Windows API (WinRT) eksik veya uyumsuz."
        return status
