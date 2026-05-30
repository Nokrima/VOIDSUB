from __future__ import annotations

import re
import unicodedata

# Only remove symbols that are very unlikely to be legitimate subtitle content.
_JUNK_SYMBOLS = "\u2022\u25cf\u25aa\u25ab\u25a0\u25a1\u25c6\u25c7\u25cb\u25cf\u2043\u00b7\u2027\u2219\u25e6\u25d8\u25d9\u25cc"
_NOISE_CHARS = set("|^`~\u00a9\u00ae\u2122\u00a7\u00b0")

_BROKEN_UTF8_TOKENS = (
    "\u00c3\u0192\u00c2\u00a2\u00c3\u00a2\u20ac\u0161\u00c2\u00ac\u00c3\u201a\u00c2\u00a2",
    "\u00c3\u00a2\u20ac\u0161\u00c2\u00ac\u00c3\u201a\u00c2\u00a2",
    "\u00c3\u00a2\u20ac\u00a2",
    "\u00c3\u201a\u00e2\u20ac\u00a2",
    "\u00c3\u00af\u00c2\u00bf\u00c2\u00bd",
    "\ufffd",
)

_BROKEN_UTF8_MAP = {
    "\u00c3\u00a2\u20ac\u0161\u00c2\u00ac\u00c3\u201a\u00c2\u00a2": " ",
    "\u00c3\u00a2\u20ac\u201e\u00a2": "'",
    "\u00c3\u00a2\u20ac\u0153": '"',
    "\u00c3\u00a2\u20ac\u009d": '"',
    "\u00c3\u00a2\u20ac\u201d": "\u2014",
    "\u00c3\u00a2\u20ac\u201c": "\u2013",
    "\u00c3\u0192\u00c2\u00b6": "\u00f6",
    "\u00c3\u0192\u00c2\u00a9": "\u00e9",
    "\u00c3\u0192 ": "\u00e0",
    "\u00c3\u0192\u00c2\u00b8": "\u00f8",
    "\u00c3\u0192\u00c2\u00a4": "\u00e4",
    "\u00c3\u0192\u00c2\u00bc": "\u00fc",
    "\u00c3\u201a\u00c5\u00bd": "",
    "\u00c3\u00a2\u20ac\u017e\u00c2\u00a2": "",
    "\u00c3\u201a\u00c2\u00a9": "",
}

_OCR_KNOWN_JOINS = {
    "forshot": "for shot",
    "isoffline": "is offline",
    "helpme": "help me",
    "huntdefeat": "hunt defeat",
    "doyoucopy": "do you copy",
    "youcopy": "you copy",
    "wehave": "we have",
    "backand": "back and",
    "frombeneath": "from beneath",
}

_SAFE_SPLIT_WORDS = {
    "a",
    "all",
    "an",
    "and",
    "answer",
    "are",
    "at",
    "be",
    "but",
    "by",
    "can",
    "do",
    "else",
    "find",
    "for",
    "from",
    "get",
    "give",
    "go",
    "had",
    "has",
    "have",
    "he",
    "her",
    "him",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "know",
    "make",
    "me",
    "my",
    "now",
    "of",
    "on",
    "one",
    "or",
    "out",
    "she",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "they",
    "this",
    "to",
    "up",
    "us",
    "was",
    "we",
    "what",
    "when",
    "where",
    "who",
    "why",
    "will",
    "with",
    "would",
    "you",
    "your",
}


def clean_ocr_source_detailed(text: str) -> dict[str, object]:
    cleaned = str(text or "")
    if not cleaned:
        return {"text": "", "changed": False, "steps": []}
    original = cleaned
    steps: list[str] = []
    minor_merge_fixes: list[str] = []

    without_controls = "".join(ch for ch in cleaned if unicodedata.category(ch) != "Cc")
    if without_controls != cleaned:
        steps.append("control_chars_removed")
        cleaned = without_controls

    for broken, fixed in _BROKEN_UTF8_MAP.items():
        updated = cleaned.replace(broken, fixed)
        if updated != cleaned:
            steps.append("utf8_map_fix")
            cleaned = updated

    for token in _BROKEN_UTF8_TOKENS:
        updated = cleaned.replace(token, " ")
        if updated != cleaned:
            steps.append("utf8_token_removed")
            cleaned = updated

    updated = cleaned.replace("\u2026", "...")
    if updated != cleaned:
        steps.append("ellipsis_normalized")
        cleaned = updated

    # Remove standalone bullet-like junk symbols.
    updated = re.sub(f"[{re.escape(_JUNK_SYMBOLS)}]+", " ", cleaned)
    if updated != cleaned:
        steps.append("junk_symbols_removed")
        cleaned = updated
    updated = "".join(" " if ch in _NOISE_CHARS else ch for ch in cleaned)
    if updated != cleaned:
        steps.append("noise_chars_removed")
        cleaned = updated

    # Drop standalone euro sign if it is not attached to a number.
    updated = re.sub(r"(?<!\d)\u20ac(?!\d)", " ", cleaned)
    if updated != cleaned:
        steps.append("standalone_euro_removed")
        cleaned = updated

    # Drop pipe-like OCR garbage when it appears as a standalone mark.
    updated = re.sub(r"(?<![A-Za-z0-9])\|(?![A-Za-z0-9])", " ", cleaned)
    if updated != cleaned:
        steps.append("standalone_pipe_removed")
        cleaned = updated

    # Drop standalone @ but preserve email-like text.
    updated = re.sub(r"(?<![A-Za-z0-9])@(?![A-Za-z0-9])", " ", cleaned)
    if updated != cleaned:
        steps.append("standalone_at_removed")
        cleaned = updated

    # Remove a very small set of embedded junk symbols inside words.
    updated = re.sub(r"(?<=[A-Za-z])[%@#\\{}](?=[A-Za-z])", "", cleaned)
    if updated != cleaned:
        steps.append("embedded_noise_removed")
        cleaned = updated

    # Convert word-initial OCR 0 -> O only when the next character is alphabetic.
    updated = re.sub(r"(?<!\d)0(?=[A-Za-z])", "O", cleaned)
    if updated != cleaned:
        steps.append("leading_zero_fixed")
        cleaned = updated

    # Split glued tokens conservatively when OCR fuses words across case or punctuation boundaries.
    updated = re.sub(r"(?<=[a-z])(?=[A-Z][a-z])", " ", cleaned)
    if updated != cleaned:
        steps.append("camel_split")
        cleaned = updated
    updated = re.sub(r"(?<=[A-Za-z])(?=[0-9])", " ", cleaned)
    if updated != cleaned:
        steps.append("alpha_digit_split")
        cleaned = updated
    updated = re.sub(r"(?<=[0-9])(?=[A-Za-z])", " ", cleaned)
    if updated != cleaned:
        steps.append("digit_alpha_split")
        cleaned = updated
    updated = re.sub(r"(?<=[.!?])(?=[A-Za-z])", " ", cleaned)
    if updated != cleaned:
        steps.append("punctuation_word_split")
        cleaned = updated

    def _replace_known_joins(match: re.Match[str]) -> str:
        word = match.group(0)
        fixed = _OCR_KNOWN_JOINS.get(word.lower())
        if fixed is None:
            return word
        return fixed.upper() if word.isupper() else fixed

    updated = re.sub(
        r"\b(?:forshot|isoffline|helpme|huntdefeat)\b",
        _replace_known_joins,
        cleaned,
        flags=re.IGNORECASE,
    )
    if updated != cleaned:
        steps.append("known_join_fixed")
        cleaned = updated
    updated = re.sub(
        r"\b(?:doyoucopy|youcopy|wehave|backand|frombeneath)\b",
        _replace_known_joins,
        cleaned,
        flags=re.IGNORECASE,
    )
    if updated != cleaned:
        steps.append("tip2_join_fixed")
        cleaned = updated

    def _split_safe_minor_merge(match: re.Match[str]) -> str:
        word = match.group(0)
        lowered = word.lower()
        for split_at in range(4, len(lowered) - 2):
            left = lowered[:split_at]
            right = lowered[split_at:]
            if left in _SAFE_SPLIT_WORDS and right in _SAFE_SPLIT_WORDS:
                fixed = f"{left} {right}"
                minor_merge_fixes.append(f"{word}->{fixed}")
                return fixed
        return word

    updated = re.sub(
        r"\b[a-z]{7,14}\b",
        _split_safe_minor_merge,
        cleaned,
    )
    if updated != cleaned:
        steps.append("minor_merge_split")
        cleaned = updated

    cleaned = re.sub(r" {2,}", " ", cleaned).strip()
    if cleaned != original and not steps:
        steps.append("normalized")
    return {
        "text": cleaned,
        "changed": cleaned != original,
        "steps": steps,
        "minor_merge_fixes": minor_merge_fixes,
    }


def clean_ocr_source(text: str) -> str:
    return str(clean_ocr_source_detailed(text)["text"])
