"""TranslationCache: Ceviri girdilerini kalite bilgisiyle LRU mantiginda saklar."""

from __future__ import annotations

import re
from collections import OrderedDict
from threading import Lock
from typing import TypedDict

from core.errors import PREFIX_CFG, log_event


class TranslationCacheEntry(TypedDict):
    translation: str
    confidence: float
    source: str


class TranslationCache:
    def __init__(self, capacity: int = 300):
        self.capacity = capacity
        self.cache: OrderedDict[str, TranslationCacheEntry] = OrderedDict()
        self.normalized_cache: OrderedDict[str, TranslationCacheEntry] = OrderedDict()
        self.lock = Lock()

    def get(self, text: str, exact_only: bool = False) -> str | None:
        with self.lock:
            entry = self._coerce(self.cache.get(text))
            if entry is not None:
                self.cache[text] = entry
                self.cache.move_to_end(text)
                return (
                    None
                    if float(entry["confidence"]) < 0.3
                    else str(entry["translation"])
                )
            if exact_only:
                return None
            normalized = self._normalize_key(text)
            entry = self._coerce(self.normalized_cache.get(normalized))
            if entry is None:
                return None
            self.normalized_cache[normalized] = entry
            self.normalized_cache.move_to_end(normalized)
            return (
                None if float(entry["confidence"]) < 0.3 else str(entry["translation"])
            )

    def put(
        self, text: str, translated: str, confidence: float = 1.0, source: str = ""
    ) -> None:
        entry: TranslationCacheEntry = {
            "translation": translated,
            "confidence": float(confidence),
            "source": str(source or ""),
        }
        with self.lock:
            self.cache[text] = entry
            self.cache.move_to_end(text)
            normalized = self._normalize_key(text)
            self.normalized_cache[normalized] = entry
            self.normalized_cache.move_to_end(normalized)
            while len(self.cache) > self.capacity:
                self.cache.popitem(last=False)
            while len(self.normalized_cache) > self.capacity:
                self.normalized_cache.popitem(last=False)

    def mark_bad(self, text: str) -> None:
        with self.lock:
            touched = False
            if text in self.cache:
                entry = self._coerce(self.cache[text]) or {
                    "translation": "",
                    "confidence": 0.0,
                    "source": "",
                }
                entry["confidence"] = 0.0
                self.cache[text] = entry
                touched = True
            normalized = self._normalize_key(text)
            if normalized in self.normalized_cache:
                entry = self._coerce(self.normalized_cache[normalized]) or {
                    "translation": "",
                    "confidence": 0.0,
                    "source": "",
                }
                entry["confidence"] = 0.0
                self.normalized_cache[normalized] = entry
                touched = True
        if touched:
            log_event(
                PREFIX_CFG, "004", f"Cache entry marked bad: {text[:20]}", level="debug"
            )

    def clear(self) -> None:
        with self.lock:
            self.cache.clear()
            self.normalized_cache.clear()

    def _normalize_key(self, text: str) -> str:
        cleaned = (
            str(text or "")
            .strip()
            .lower()
            .replace("’", "'")
            .replace("`", "'")
            .replace("´", "'")
        )
        cleaned = cleaned.replace("“", '"').replace("”", '"')
        return re.sub(r"\s+", " ", cleaned)

    def _coerce(self, entry: object) -> TranslationCacheEntry | None:
        if entry is None:
            return None
        if isinstance(entry, dict):
            return {
                "translation": str(entry.get("translation", "")),
                "confidence": float(entry.get("confidence", 1.0)),
                "source": str(entry.get("source", "")),
            }
        return {"translation": str(entry), "confidence": 1.0, "source": ""}
