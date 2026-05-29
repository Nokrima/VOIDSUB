import re
import logging
from core.errors import get_logger

logger = get_logger()

def _clip_log_text(text: str, limit: int = 160) -> str:
    import sys
    if getattr(sys, 'frozen', False) and logger.level > logging.DEBUG:
        return "*** [REDACTED] ***"
    normalized = " ".join((text or "").split())
    return normalized if len(normalized) <= limit else f"{normalized[:limit]}..."

def _quick_normalize(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "").strip().lower())
    cleaned = re.sub(r"[^\w\s]", "", cleaned, flags=re.UNICODE)
    return cleaned.strip()

def _strip_speaker(text: str) -> str:
    return re.sub(r"^[A-ZÇĞİÖŞÜa-zçğıöşü\.\•\s]*:\s*", "", str(text or "").strip())

def redact_sensitive_fields(payload: dict | str) -> dict | str:
    import sys
    if not getattr(sys, 'frozen', False) or logger.level <= logging.DEBUG:
        return payload
    
    if isinstance(payload, str):
        return "*** [REDACTED] ***"
    
    if isinstance(payload, dict):
        redacted_payload = payload.copy()
        sensitive_keys = {"original_text", "translated_text", "raw_texts", "cache_key", "source_text", "text", "selected"}
        for k, v in redacted_payload.items():
            if k in sensitive_keys and v:
                redacted_payload[k] = "*** [REDACTED] ***"
            elif isinstance(v, dict):
                redacted_payload[k] = redact_sensitive_fields(v)
        return redacted_payload
    return payload
