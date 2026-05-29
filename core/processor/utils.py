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

from typing import Protocol, Any, TYPE_CHECKING
from collections import deque
import logging
import asyncio

if TYPE_CHECKING:
    from core.processor.translation_queue import TranslationQueueService
    from core.processor.overlay_publisher import OverlayPublisherService

class IPipelineState(Protocol):
    logger: logging.Logger
    raw_translation_flow_enabled: bool
    is_running: bool
    bridge: Any
    tr_cache: Any
    translator: Any
    offline_translator: Any
    translation_engine: str
    offline_model_key: str
    tgt_language: str
    src_language: str
    performance_tier: str
    ocr_scene_mode: str
    
    translation_queue: "TranslationQueueService"
    overlay_publisher: "OverlayPublisherService"
    
    slot_manager: Any
    source_state: Any
    
    _translation_request_id: int
    _pending_translations: deque
    _active_translation_task: asyncio.Task | None
    _active_translation_source: str
    _last_translated_text: str
    _last_translated_emit_time: float
    _last_emitted_source_text: str
    _last_emitted_source_time: float
    
    _last_stat_emit_time: float
    _reused_frame_count: int
    _last_perf_stats: dict
    last_text: str
    _last_emit_time: float
    _last_raw_source_text: str
    _last_raw_source_time: float
    
    def _log_trl(self, code: str, msg: str) -> None: ...
    def _log_ui(self, code: str, msg: str) -> None: ...
    def _log_ocr(self, code: str, msg: str) -> None: ...
    def _log_perf(self, frame_to_overlay: float, ocr_duration: float, trl_duration: float) -> None: ...
    def _log_debug(self, prefix: str, code: str, msg: str) -> None: ...
    
    def _normalize_translated_text(self, text: str) -> str: ...
    def _should_skip_translated_emit(self, text: str, source: str) -> bool: ...
    def _should_keep_stale_translation(self, text: str) -> bool: ...
    def _runtime_engine_id(self) -> str: ...
    def _capture_delay(self) -> float: ...
    def _translate_pending_loop(self) -> Any: ...
    def _should_skip_raw_source_repeat(self, text: str) -> bool: ...
    def _evaluate_tip2_best_variant_gate(self, analysis: dict) -> dict: ...
    def _should_skip_regressive_emit(self, text: str) -> bool: ...
    def _should_skip_family_repeat(self, text: str) -> bool: ...
    def _get_cached_translation(self, text: str) -> str | None: ...
    def _cache_key_for_source(self, text: str, source: str) -> str: ...
