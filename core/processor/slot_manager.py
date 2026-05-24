from __future__ import annotations

import re
from difflib import SequenceMatcher

from core.processor.junk_filter import JunkFilter


class SlotManager:
    _MINIMUM_UPGRADE_QUALITY = 55
    _OPEN_ENDED_WORDS = {
        "with", "and", "or", "but", "that", "the", "a", "an",
        "to", "for", "of", "in", "on", "at", "by", "from",
        "which", "who", "as", "so", "yet", "nor", "because",
    }

    def __init__(self) -> None:
        self.reset()

    def push(self, text: str, quality: int) -> str:
        candidate = str(text or "").strip()
        if len(candidate) < 4:
            return "rejected"

        normalized = self._normalize(candidate)
        if not normalized:
            return "rejected"
        analysis = JunkFilter.analyze_text(candidate)

        if not self._slot_text:
            self._open_new_slot(candidate, normalized, quality, analysis)
            return "new_slot"

        if not self._is_same_family(normalized, self._slot_normalized):
            self._open_new_slot(candidate, normalized, quality, analysis)
            return "new_slot"

        if self._is_fragment(normalized, self._slot_normalized):
            self._slot_sample_count += 1
            return "held"

        if self._is_upgrade(candidate, normalized, quality, analysis):
            self._slot_text = candidate
            self._slot_normalized = normalized
            self._slot_quality = int(quality)
            self._slot_length = len(candidate)
            self._slot_is_complete = self._check_complete(candidate)
            self._slot_is_open_ended = self._ends_open_ended(candidate)
            self._slot_line_count = max(1, candidate.count("\n") + 1)
            self._slot_health = int(analysis.get("health_score", 0))
            self._slot_recognized = int(analysis.get("recognized_count", 0))
            self._slot_suspicious = int(analysis.get("suspicious_tokens", 0))
            self._slot_broken = int(analysis.get("broken_token_count", 0))
            self._slot_sample_count += 1
            return "upgraded"

        self._slot_sample_count += 1
        return "held"

    def get_slot(self) -> str:
        return self._slot_text

    def get_sample_count(self) -> int:
        return self._slot_sample_count

    def get_normalized_slot(self) -> str:
        return self._slot_normalized

    def get_required_samples(self) -> int:
        # Uzun metinlerin rastgele gürültü (noise) olma ihtimali çok düşüktür.
        # Filtreli akışın yavaşlamaması için uzun yazılarda bekleme süresini (sample) minimumda (1) tutmalıyız.
        # Sadece çok kısa yazılarda gürültü ihtimaline karşı 2 frame teyit isteyeceğiz.
        base = 1
        if self._slot_length < 20 and self._slot_line_count == 1:
            base = 2
            
        if self._slot_is_open_ended:
            # Cümle "and, but" gibi bağlaçlarla veya yarım bitiyorsa cümlenin tamamlanmasını 
            # beklemek için sadece +1 kare bekleme ekliyoruz (eskisi gibi 5 kare değil).
            return base + 1
            
        return base

    def get_slot_debug(self) -> dict[str, int | bool]:
        return {
            "quality": self._slot_quality,
            "health": self._slot_health,
            "recognized": self._slot_recognized,
            "suspicious": self._slot_suspicious,
            "broken": self._slot_broken,
            "complete": self._slot_is_complete,
            "open_ended": self._slot_is_open_ended,
            "length": self._slot_length,
        }

    def is_stable(self) -> bool:
        return self._slot_sample_count >= self.get_required_samples()

    def reset(self) -> None:
        self._slot_text = ""
        self._slot_normalized = ""
        self._slot_quality = 0
        self._slot_length = 0
        self._slot_is_complete = False
        self._slot_is_open_ended = False
        self._slot_sample_count = 0
        self._slot_line_count = 0
        self._slot_health = 0
        self._slot_recognized = 0
        self._slot_suspicious = 0
        self._slot_broken = 0

    def _normalize(self, text: str) -> str:
        cleaned = text.strip().lower()
        cleaned = re.sub(r"\s+", " ", cleaned)
        cleaned = re.sub(r"[^\w\s]", "", cleaned, flags=re.UNICODE)
        return cleaned.strip()

    def _open_new_slot(self, text: str, normalized: str, quality: int, analysis: dict[str, object]) -> None:
        self._slot_text = text
        self._slot_normalized = normalized
        self._slot_quality = int(quality)
        self._slot_length = len(text)
        self._slot_is_complete = self._check_complete(text)
        self._slot_is_open_ended = self._ends_open_ended(text)
        self._slot_line_count = max(1, text.count("\n") + 1)
        self._slot_health = int(analysis.get("health_score", 0))
        self._slot_recognized = int(analysis.get("recognized_count", 0))
        self._slot_suspicious = int(analysis.get("suspicious_tokens", 0))
        self._slot_broken = int(analysis.get("broken_token_count", 0))
        self._slot_sample_count = 1

    def _is_same_family(self, norm_new: str, norm_slot: str) -> bool:
        if not norm_new or not norm_slot:
            return False
        if norm_new == norm_slot:
            return True
        similarity = SequenceMatcher(a=norm_slot, b=norm_new).ratio()
        shorter = min(len(norm_new), len(norm_slot))
        if shorter >= 80:
            threshold = 0.68
        elif shorter >= 48:
            threshold = 0.72
        elif shorter >= 24:
            threshold = 0.78
        else:
            threshold = 0.82
        return similarity >= threshold

    def _is_fragment(self, norm_new: str, norm_slot: str) -> bool:
        if not norm_new or not norm_slot:
            return False
        if self._slot_is_complete and len(norm_new) < len(norm_slot):
            similarity = SequenceMatcher(a=norm_slot, b=norm_new).ratio()
            return similarity >= 0.68
        if len(norm_new) >= len(norm_slot) * 0.78:
            return False
        if norm_new in norm_slot:
            return True
        similarity = SequenceMatcher(a=norm_slot, b=norm_new).ratio()
        return similarity >= 0.82

    def _is_upgrade(self, text: str, normalized: str, quality: int, analysis: dict[str, object]) -> bool:
        normalized_length = len(normalized)
        if int(quality) < self._MINIMUM_UPGRADE_QUALITY:
            return False
        candidate_complete = self._check_complete(text)
        candidate_open_ended = self._ends_open_ended(text)
        candidate_health = int(analysis.get("health_score", 0))
        candidate_recognized = int(analysis.get("recognized_count", 0))
        candidate_suspicious = int(analysis.get("suspicious_tokens", 0))
        candidate_broken = int(analysis.get("broken_token_count", 0))
        if self._slot_is_complete and not candidate_complete:
            return False
        if candidate_complete and not self._slot_is_complete:
            return True
        if self._is_tail_completion_upgrade(text, candidate_health, candidate_recognized, candidate_suspicious, candidate_broken):
            return True
        if candidate_recognized >= self._slot_recognized + 2 and candidate_broken <= self._slot_broken and candidate_suspicious <= self._slot_suspicious:
            return True
        if candidate_recognized > self._slot_recognized and candidate_health >= self._slot_health and candidate_broken <= self._slot_broken:
            return True
        if normalized_length > len(self._slot_normalized) + 2 and candidate_health >= self._slot_health:
            return True
        if normalized_length > len(self._slot_normalized) and candidate_broken < self._slot_broken:
            return True
        if normalized_length >= len(self._slot_normalized) and candidate_suspicious < self._slot_suspicious:
            return True
        if normalized_length >= len(self._slot_normalized) and candidate_health >= self._slot_health + 6:
            return True
        if normalized_length >= len(self._slot_normalized) and candidate_broken == self._slot_broken and candidate_complete and not candidate_open_ended and self._slot_is_open_ended:
            return True
        if abs(normalized_length - len(self._slot_normalized)) <= 4 and int(quality) > self._slot_quality + 5:
            return True
        if normalized_length <= len(self._slot_normalized):
            return False
        return False

    def _is_tail_completion_upgrade(
        self,
        text: str,
        candidate_health: int,
        candidate_recognized: int,
        candidate_suspicious: int,
        candidate_broken: int,
    ) -> bool:
        candidate_words = re.findall(r"\w+", str(text or "").strip(), flags=re.UNICODE)
        slot_words = re.findall(r"\w+", str(self._slot_text or "").strip(), flags=re.UNICODE)
        if len(candidate_words) < 3 or len(slot_words) < 3:
            return False
        candidate_tail = candidate_words[-2:]
        slot_tail = slot_words[-2:]
        if candidate_tail == slot_tail:
            return False
        candidate_tail_len = sum(len(word) for word in candidate_tail)
        slot_tail_len = sum(len(word) for word in slot_tail)
        if candidate_tail_len <= slot_tail_len:
            return False
        if candidate_health + 4 < self._slot_health:
            return False
        if candidate_broken > self._slot_broken or candidate_suspicious > self._slot_suspicious:
            return False
        if candidate_recognized + 1 < self._slot_recognized:
            return False
        if candidate_tail[-1].lower() in self._OPEN_ENDED_WORDS:
            return False
        return True

    def _check_complete(self, text: str) -> bool:
        stripped = str(text or "").strip()
        if not re.search(r"[?.!…]$", stripped):
            return False
        tokens = re.findall(r"\w+", stripped, flags=re.UNICODE)
        if len(tokens) < 4:
            return False
        return tokens[-1].lower() not in self._OPEN_ENDED_WORDS

    def _ends_open_ended(self, text: str) -> bool:
        tokens = re.findall(r"\w+", str(text or "").strip(), flags=re.UNICODE)
        if not tokens:
            return False
        return tokens[-1].lower() in self._OPEN_ENDED_WORDS
