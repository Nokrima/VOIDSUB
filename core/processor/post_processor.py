from __future__ import annotations

import re

from core.errors import PREFIX_TRL, log_event


def clean_translation(text: str, profile: str = "basic") -> str:
    cleaned = re.sub(r"\s+", " ", str(text).strip())
    for broken, fixed in ((" .", "."), (" ,", ","), (" ?", "?"), (" !", "!")):
        cleaned = cleaned.replace(broken, fixed)
    cleaned = re.sub(r"(?<=[A-Za-z0-9])[;:](?=$)", ".", cleaned)
    if cleaned:
        cleaned = cleaned[:1].upper() + cleaned[1:]
    return cleaned


def estimate_display_chunk_size(mode: str = "fixed", font_size: int = 18) -> int:
    base = 140 if mode == "waterfall" else 220 if mode == "fixed" else 90
    size_penalty = max(0, int(font_size) - 18) * 3
    return max(55, min(260, base - size_penalty))


def filter_offline_output(text: str, source_text: str = "") -> str | None:
    cleaned = clean_translation(text)
    if not cleaned:
        log_event(PREFIX_TRL, "009", f"Offline output filtered: {str(text)[:40]!r}", level="debug")
        return None
    words = cleaned.lower().split()
    if source_text and len(cleaned) > len(str(source_text).strip()) * 3:
        log_event(PREFIX_TRL, "009", f"Offline output filtered: {cleaned[:40]!r}", level="debug")
        return None
    if len(words) >= 6:
        triples = [" ".join(words[i:i + 3]) for i in range(len(words) - 2)]
        if len(triples) != len(set(triples)):
            log_event(PREFIX_TRL, "009", f"Offline output filtered: {cleaned[:40]!r}", level="debug")
            return None
    if len(words) >= 8:
        phrases = [" ".join(words[i:i + 4]) for i in range(len(words) - 3)]
        if len(phrases) != len(set(phrases)):
            log_event(PREFIX_TRL, "009", f"Offline output filtered: {cleaned[:40]!r}", level="debug")
            return None
    if re.search(r"(.{8,}?)\s+\1", cleaned, re.IGNORECASE):
        log_event(PREFIX_TRL, "009", f"Offline output filtered: {cleaned[:40]!r}", level="debug")
        return None
    return cleaned


def chunk_for_display(text: str, max_chars: int = 150, cleanup: bool = True) -> list[str]:
    cleaned = clean_translation(text) if cleanup else re.sub(r"\s+", " ", str(text).strip())
    if not cleaned or len(cleaned) <= max_chars:
        return [cleaned] if cleaned else []
    chunks: list[str] = []
    remaining = cleaned
    sentence_grace = max(18, min(90, max_chars // 2))
    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining.strip())
            break
        split_at = -1
        search_limit = min(len(remaining), max_chars + sentence_grace)
        for token in (". ", "! ", "? ", "; ", ": ", ", "):
            pos = remaining.rfind(token, 0, search_limit + 1)
            split_at = max(split_at, pos + len(token) - 1 if pos >= 0 else -1)
        if split_at > max_chars:
            chunks.append(remaining[:split_at].strip())
            remaining = remaining[split_at:].strip()
            continue
        if split_at < max_chars // 2:
            split_at = remaining.rfind(" ", 0, max_chars + 1)
        if split_at < max_chars // 2:
            split_at = max_chars
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    return [chunk for chunk in chunks if chunk]
