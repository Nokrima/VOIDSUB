"""
TextQualityScorer: OCR metnini 0-100 arasinda puanlar.
Kisa ama temiz altyazi satirlarini fazla ezmeden degerlendirmeye calisir.
"""

from __future__ import annotations

import re


class TextQualityScorer:
    VOWELS = set("aeiouyAEIOUYaeiıioöuüAEIİOÖUÜ")

    @classmethod
    def score(cls, text: str) -> int:
        if not text:
            return 0

        cleaned = text.strip()
        length = len(cleaned)
        if length < 3:
            return 0

        alpha_count = sum(char.isalpha() for char in cleaned)
        vowel_count = sum(1 for char in cleaned if char in cls.VOWELS)
        vowel_ratio = vowel_count / length
        alpha_ratio = alpha_count / length
        digit_ratio = sum(char.isdigit() for char in cleaned) / length
        punctuation_ratio = (
            sum(not char.isalnum() and not char.isspace() for char in cleaned) / length
        )

        repeat_penalty = 0
        for index in range(length - 2):
            if cleaned[index] == cleaned[index + 1] == cleaned[index + 2]:
                repeat_penalty += 15

        tokens = [token for token in re.split(r"\s+", cleaned) if token]
        short_token_penalty = (
            12
            if len(tokens) >= 3
            and sum(len(token) <= 2 for token in tokens) >= max(2, len(tokens) // 2)
            else 0
        )

        base_score = 100
        if vowel_ratio < 0.10 and alpha_ratio >= 0.35:
            base_score -= 40
        if digit_ratio > 0.42:
            base_score -= 18
        if punctuation_ratio > 0.30:
            base_score -= 15
        if re.search(r"[A-Za-z]{2,}\d{2,}[A-Za-z]{2,}", cleaned):
            base_score -= 12

        if (
            length <= 12
            and alpha_count >= 2
            and digit_ratio < 0.25
            and punctuation_ratio < 0.35
        ):
            base_score = max(base_score, 60 if length > 5 else 54)
        if 3 <= length <= 8 and alpha_count >= 2 and punctuation_ratio < 0.28:
            base_score = max(base_score, 58)
        if len(tokens) <= 2 and alpha_count >= 3:
            short_token_penalty = max(0, short_token_penalty - 10)

        return max(0, min(100, base_score - repeat_penalty - short_token_penalty))
