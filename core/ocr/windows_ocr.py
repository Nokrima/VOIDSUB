import asyncio
import json
import multiprocessing as mp
import queue
import re
import subprocess
import sys
import threading
import time
import unicodedata
from typing import Any

import cv2
import numpy as np

from core.errors import PREFIX_OCR, get_logger
from core.ocr.base import OCREngine


def _get_winrt_languages() -> list[str]:
    try:
        from winrt.windows.media.ocr import OcrEngine
        return [lang.language_tag for lang in OcrEngine.available_recognizer_languages]
    except Exception:
        return []


def _winocr_worker(
    task_queue: mp.Queue,
    result_queue: mp.Queue,
    error_queue: mp.Queue,
    ready_event: Any,
    language_tag: str,
) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        from winrt.windows.globalization import Language
        import winrt.windows.foundation  # noqa: F401
        import winrt.windows.foundation.collections  # noqa: F401
        import winrt.windows.storage.streams  # noqa: F401
        from winrt.windows.media.ocr import OcrEngine

        engine = OcrEngine.try_create_from_language(Language(language_tag))
        if not engine:
            error_queue.put(f"[{PREFIX_OCR}-001] Windows OCR dil paketi eksik: {language_tag}")
            ready_event.set()
            return

        ready_event.set()

        async def process_tasks():
            from winrt.windows.graphics.imaging import BitmapPixelFormat, SoftwareBitmap

            while True:
                task = await asyncio.to_thread(task_queue.get)
                if task is None:
                    break

                try:
                    image = task
                    bgra_image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
                    height, width = bgra_image.shape[:2]

                    bitmap = SoftwareBitmap(BitmapPixelFormat.BGRA8, width, height)
                    bitmap.copy_from_buffer(bgra_image.tobytes())  # type: ignore[arg-type]

                    result = await engine.recognize_async(bitmap)  # type: ignore[union-attr]

                    lines = []
                    if result and result.lines:
                        for line in result.lines:
                            lines.append(line.text)
                    result_queue.put({"success": True, "lines": lines})
                except Exception as e:
                    result_queue.put({"success": False, "error": str(e)})

        loop.run_until_complete(process_tasks())
    except ImportError:
        error_queue.put(f"[{PREFIX_OCR}-002] WinRT (Windows API) paketi bulunamadi.")
        ready_event.set()
    except Exception as exc:
        error_queue.put(f"[{PREFIX_OCR}-046] Windows OCR worker failed: {type(exc).__name__}: {exc}")
        ready_event.set()
    finally:
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        loop.close()


class WindowsOCREngine(OCREngine):
    def __init__(self):
        super().__init__()
        self.logger = get_logger()
        self.source_language = "auto"
        self.language_tag = "en-US"
        self.process: mp.Process | None = None
        self.task_queue: mp.Queue | None = None
        self.result_queue: mp.Queue | None = None
        self.error_queue: mp.Queue | None = None
        self.ready_event: Any = None
        self.read_lock = threading.Lock()
        self.start_error: str | None = None
        self.last_error_message = ""
        self.last_error_time = 0.0

    @property
    def name(self) -> str:
        return "Windows OCR"

    def start(self) -> bool:
        if self.process and self.process.is_alive():
            self._is_ready = True
            return True

        self.logger.info(
            f"[{PREFIX_OCR}-043] Windows OCR start requested: source_language={self.source_language}, language_tag={self.language_tag}"
        )
        self.start_error = None
        self.task_queue = mp.Queue(maxsize=30)
        self.result_queue = mp.Queue(maxsize=30)
        self.error_queue = mp.Queue(maxsize=30)
        self.ready_event = mp.Event()

        self.process = mp.Process(
            target=_winocr_worker,
            args=(self.task_queue, self.result_queue, self.error_queue, self.ready_event, self.language_tag),
            name="winocr-worker",
            daemon=True,
        )
        self.process.start()
        self.ready_event.wait(timeout=5.0)

        if not self.error_queue.empty():
            self.start_error = self.error_queue.get()
            self.logger.error(self.start_error)
            self.stop()
            return False

        if not self.process.is_alive():
            self.logger.error(f"[{PREFIX_OCR}-043] Windows OCR start failed: worker process died silently")
            self.stop()
            return False

        self._is_ready = True
        self.logger.info(f"[{PREFIX_OCR}-044] Windows OCR ready: language_tag={self.language_tag}")
        return True

    def read(self, image: np.ndarray) -> list[tuple]:
        if not self._is_ready or self.process is None or self.task_queue is None or self.result_queue is None:
            return []

        if not self.read_lock.acquire(timeout=2.6):
            return []
        try:
            while not self.result_queue.empty():
                self.result_queue.get_nowait()

            self.task_queue.put(image.copy())

            result = self.result_queue.get(timeout=2.5)
            if not result.get("success"):
                message = result.get("error")
                now = time.monotonic()
                if message != self.last_error_message or now - self.last_error_time >= 2.0:
                    self.logger.error(f"[{PREFIX_OCR}-003] Okuma sırasında hata: {message}")
                    self.last_error_message = message
                    self.last_error_time = now
                return []

            raw_lines = result.get("lines", [])
            lines: list[tuple] = []
            for text in raw_lines:
                normalized = self._normalize_line(text)
                if normalized:
                    lines.append((None, normalized, 100))
            return self._filter_lines(lines)

        except queue.Empty:
            return []
        except Exception as exc:
            message = str(exc)
            now = time.monotonic()
            if message != self.last_error_message or now - self.last_error_time >= 2.0:
                self.logger.error(f"[{PREFIX_OCR}-003] Okuma sırasında IPC hatası: {message}")
                self.last_error_message = message
                self.last_error_time = now
            return []
        finally:
            self.read_lock.release()

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
        if self.task_queue is not None:
            try:
                self.task_queue.put(None)
            except Exception:
                pass
        if self.process and self.process.is_alive():
            self.process.join(timeout=1.0)
            if self.process.is_alive():
                self.process.terminate()
        self.process = None
        self.task_queue = None
        self.result_queue = None
        self.error_queue = None
        self.engine = None
        self._is_ready = False

    def _find_best_language(self, requested: str) -> str:
        available = _get_winrt_languages()
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

        for idx, t in enumerate(available_lower):
            if t.startswith("en"):
                return available[idx]
        for idx, t in enumerate(available_lower):
            if t.startswith("ru"):
                return available[idx]
        for idx, t in enumerate(available_lower):
            if t.startswith("ja"):
                return available[idx]

        return available[0]

    def configure_source_language(self, source_language: str) -> None:
        next_tag = self._find_best_language(source_language)
        if source_language == self.source_language and next_tag == self.language_tag:
            return

        self.source_language = source_language
        self.language_tag = next_tag
        if self.process and self.process.is_alive():
            self.stop()
        else:
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
        
        available = _get_winrt_languages()
        if not available:
            status["available"] = False
            status["reason"] = "Sistemde hiçbir Windows OCR dil paketi kurulu değil!"
            return status

        check_tag = self.language_tag if self.language_tag else available[0]
        
        try:
            from winrt.windows.globalization import Language
            from winrt.windows.media.ocr import OcrEngine
            engine = OcrEngine.try_create_from_language(Language(check_tag))
            if engine is not None:
                status["available"] = True
            else:
                status["reason"] = f"Windows OCR paketi başlatılamadı: {check_tag}"
        except Exception as e:
            status["reason"] = f"Windows API (WinRT) eksik veya uyumsuz: {e}"

        return status

