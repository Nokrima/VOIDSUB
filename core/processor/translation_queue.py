import asyncio
import time
import uuid
import re
from typing import TYPE_CHECKING
from core.errors import PREFIX_SYS, log_event
from core.processor.utils import _clip_log_text

if TYPE_CHECKING:
    from core.processor.utils import IPipelineState

class TranslationQueueMixin:
    async def _translate_pending_loop(self: "IPipelineState") -> None:
        while self._pending_translations:
            # Drain the queue to eliminate latency from intermediate OCR updates.
            # If there are multiple queued translations, only the most recent one matters.
            while len(self._pending_translations) > 1:
                skipped = self._pending_translations.popleft()
                self._log_trl("015", f"Queue drain: skipped request_id={skipped[1]}")
                
            text, request_id, queued_at_monotonic, frame_started_monotonic, ocr_duration_ms, correlation_id = self._pending_translations.popleft()
            loop = asyncio.get_running_loop()
            try:
                self._active_translation_source = text
                queue_wait_ms = (time.monotonic() - queued_at_monotonic) * 1000
                self.logger.info(f"[OCR-035] translate_in: {_clip_log_text(text)}")
                self._log_trl(
                    "001",
                    (
                        f"Translation requested: request_id={request_id}, text={_clip_log_text(text)}, "
                        f"queue_wait_ms={queue_wait_ms:.1f}"
                    ),
                    correlation_id=correlation_id,
                )
                translation_started = time.perf_counter()
                if self.raw_translation_flow_enabled:
                    effective_src = self._resolve_translation_source_language(text, log_decision=True)
                    google_task = loop.run_in_executor(None, self._translate_with_engine, "google", text, effective_src)
                    offline_task = loop.run_in_executor(None, self._translate_with_engine, "offline", text, effective_src)
                    google_result, offline_result = await asyncio.gather(google_task, offline_task, return_exceptions=True)
                    if isinstance(google_result, Exception):
                        self.logger.error(f"[{PREFIX_SYS}-046] [Google Çeviri] -> GÖREV HATASI (HAM MOD) | Detay: {google_result}")
                        google_result = (text, "error")
                    if isinstance(offline_result, Exception):
                        self.logger.error(f"[{PREFIX_SYS}-046] [Offline Çeviri] -> GÖREV HATASI (HAM MOD) | Detay: {offline_result}")
                        offline_result = (text, "offline_error")
                    self._log_trl(
                        "013",
                        (
                            f"Raw flow dual translation: google_source={google_result[1]!r}, "
                            f"offline_source={offline_result[1]!r}, google_text={_clip_log_text(google_result[0])}, "
                            f"offline_text={_clip_log_text(offline_result[0])}"
                        ),
                        correlation_id=correlation_id,
                    )
                    translated_text, source = self._select_translation_result(
                        google_result=google_result,
                        offline_result=offline_result,
                    )
                else:
                    translated_text, source = await loop.run_in_executor(None, self._translate_text, text)
                translation_duration_ms = (time.perf_counter() - translation_started) * 1000
                self.logger.info(f"[OCR-036] translate_out ({source}): {_clip_log_text(translated_text)}")
                self._log_trl(
                    "002",
                    (
                        f"Translation result: request_id={request_id}, source={source}, "
                        f"duration_ms={translation_duration_ms:.1f}, text={_clip_log_text(translated_text)}"
                    ),
                    correlation_id=correlation_id,
                )
            except Exception as exc:
                self.logger.error(f"[{PREFIX_SYS}-046] [Asenkron Çeviri Görevi] -> GÖREV HATASI | Detay: {exc}")
                self._active_translation_source = ""
                continue
            if not self.raw_translation_flow_enabled and request_id != self._translation_request_id:
                if not self._should_keep_stale_translation(text):
                    log_event(PREFIX_SYS, "034", "[Çeviri Senkronizasyonu] -> DÜŞÜRÜLDÜ (DROP) | Geç kalan çeviri", throttle_key="stale_drop", throttle_seconds=1.0)
                    self._active_translation_source = ""
                    continue
            if source == "error" or not translated_text or not self.is_running:
                self._log_trl(
                    "003",
                    (
                        f"Output filter: decision=BLOCKED, request_id={request_id}, source={source}, "
                        f"running={self.is_running}, translated_text={_clip_log_text(translated_text)}, reason=empty_or_error"
                    ),
                    correlation_id=correlation_id,
                )
                if source == "error" and self.is_running:
                    from core.errors import emit_bridge_event
                    self.is_running = False
                    emit_bridge_event("translation_state", {
                        "running": False,
                        "reason": "engine_unavailable",
                        "message": "İnternet bağlantısı koptu veya çeviri motoru yanıt vermiyor."
                    })
                self._active_translation_source = ""
                continue
            if self._should_skip_translated_emit(translated_text, source):
                cache_key = self._cache_key_for_source(text, source)
                if cache_key and not self.raw_translation_flow_enabled:
                    self.tr_cache.mark_bad(cache_key)
                log_event(
                    PREFIX_SYS,
                    "035",
                    "Ayni ceviri tekrar bastirildi.",
                    throttle_key="translated_repeat_drop",
                    throttle_seconds=0.7,
                    level="debug",
                )
                self._log_trl(
                    "004",
                    (
                        f"Output filter: decision=BLOCKED, request_id={request_id}, source={source}, "
                        f"reason=same_last, cache_key={_clip_log_text(cache_key)}, translated_text={_clip_log_text(translated_text)}"
                    ),
                    correlation_id=correlation_id,
                )
                self._active_translation_source = ""
                continue
            self._log_trl(
                "005",
                (
                    f"Output filter: decision=PASSED, request_id={request_id}, source={source}, "
                    f"translated_text={_clip_log_text(translated_text)}"
                ),
                correlation_id=correlation_id,
            )
            if self.raw_translation_flow_enabled:
                self._log_trl(
                    "012",
                    (
                        f"Raw flow output bypass: request_id={request_id}, source={source}, "
                        "translated_repeat_filter=guarded, overlay_chunking=single"
                    ),
                    correlation_id=correlation_id,
                )
            self._last_translated_text = self._normalize_translated_text(translated_text)
            self._last_translated_emit_time = time.monotonic()
            self._last_emitted_source_text = text
            self._last_emitted_source_time = self._last_translated_emit_time
            frame_to_overlay_ms = (time.monotonic() - frame_started_monotonic) * 1000
            self._log_ui(
                "001",
                (
                    f"Overlay update: source={source}, original_text={_clip_log_text(text)}, "
                    f"translated_text={_clip_log_text(translated_text)}, display_mode=single, chunk_count=1"
                ),
                correlation_id=correlation_id,
            )
            self._log_ui(
                "002",
                f"Overlay chunk: index=1/1, text={_clip_log_text(translated_text)}, display_duration_ms={frame_to_overlay_ms:.1f}",
                correlation_id=correlation_id,
            )
            self._log_perf(frame_to_overlay_ms, ocr_duration_ms, translation_duration_ms, correlation_id=correlation_id)
            self.bridge.send(
                "new_translation",
                {
                    "id": str(uuid.uuid4()),
                    "original_text": text,
                    "translated_text": translated_text,
                    "translation_source": source,
                    "timestamp": time.time(),
                    "correlation_id": correlation_id,
                },
            )
            self._active_translation_source = ""
        self._active_translation_task = None
        self._active_translation_source = ""

    def _translate_with_engine(self: "IPipelineState", engine_kind: str, detected_text: str, effective_src: str) -> tuple[str, str]:
        if engine_kind == "offline":
            return self.offline_translator.translate(detected_text, effective_src, self.tgt_language)
        return self.translator.translate(detected_text, src=effective_src, tgt=self.tgt_language)

    def _select_translation_result(
        self: "IPipelineState",
        *,
        google_result: tuple[str, str] | None,
        offline_result: tuple[str, str] | None,
    ) -> tuple[str, str]:
        preferred_order = ["google", "offline"] if self.translation_engine != "offline" else ["offline", "google"]
        candidates = {
            "google": google_result,
            "offline": offline_result,
        }
        accepted_sources = {
            "google": {"google", "cache"},
            "offline": {"offline"},
        }
        soft_sources = {"offline_unavailable", "offline_unsupported", "offline_error", "error", "none"}

        for engine_kind in preferred_order:
            result = candidates.get(engine_kind)
            if result and result[1] in accepted_sources[engine_kind] and result[0]:
                return result

        for engine_kind in preferred_order:
            result = candidates.get(engine_kind)
            if result and result[1] not in soft_sources and result[0]:
                return result

        for engine_kind in preferred_order:
            result = candidates.get(engine_kind)
            if result and result[0]:
                return result

        return "", "error"

    def _translate_text(self: "IPipelineState", detected_text: str) -> tuple[str, str]:
        effective_src = self._resolve_translation_source_language(detected_text, log_decision=True)
        if self.translation_engine == "offline":
            offline_engine = "offline-nllb" if self.offline_model_key == "nllb" else "offline-opus"
            self._log_trl(
                "006",
                (
                    f"Engine selected: engine={offline_engine}, reason=translation_engine_offline, "
                    f"src={effective_src}, tgt={self.tgt_language}, model_key={self.offline_model_key}"
                ),
            )
            return self.offline_translator.translate(detected_text, effective_src, self.tgt_language)

        self._log_trl(
            "007",
            (
                f"Engine selected: engine=google, reason=translation_engine_{self.translation_engine}, "
                f"src={effective_src}, tgt={self.tgt_language}"
            ),
        )
        translated_text, source = self.translator.translate(detected_text, src=effective_src, tgt=self.tgt_language)
        if source == "error":
            if self.offline_translator.is_available():
                fallback_text, fallback_source = self.offline_translator.translate(detected_text, effective_src, self.tgt_language)
                if fallback_source == "offline":
                    fallback_engine = "offline-nllb" if self.offline_model_key == "nllb" else "offline-opus"
                    self._log_trl(
                        "008",
                        (
                            f"Engine fallback: from=google, to={fallback_engine}, reason=google_error, "
                            f"src={effective_src}, tgt={self.tgt_language}"
                        ),
                    )
                    from core.errors import emit_bridge_event
                    emit_bridge_event("translation_engine_fallback", {"from": "google", "to": "offline", "reason": "google_error"})
                    emit_bridge_event("log_entry", {
                        "timestamp": "", "level": "WARNING", "prefix": "TRL", "code": "TRL-003",
                        "message": "İnternet bağlantısı kurulamıyor. Çevrimdışı moda geçiliyor."
                    })
                    return fallback_text, fallback_source
            else:
                from core.errors import emit_bridge_event
                emit_bridge_event("translation_state", {
                    "running": False,
                    "reason": "engine_unavailable",
                    "message": "İnternet bağlantısı kurulamıyor ve Çevrimdışı motor kurulu değil."
                })
        return translated_text, source

    def _get_cached_translation(self: "IPipelineState", text: str) -> str | None:
        effective_src = self._resolve_translation_source_language(text)
        google_key = f"google:{effective_src}:{self.tgt_language}:{text}"
        if self.translation_engine == "google":
            return self.tr_cache.get(google_key, exact_only=True)
        if self.translation_engine == "offline":
            return None
        return self.tr_cache.get(google_key, exact_only=True)

    def _cache_key_for_source(self: "IPipelineState", text: str, source: str) -> str:
        prefix = "offline" if "offline" in str(source or "").lower() else "google"
        return f"{prefix}:{self._resolve_translation_source_language(text)}:{self.tgt_language}:{text}"

    def _resolve_translation_source_language(self: "IPipelineState", text: str, *, log_decision: bool = False) -> str:
        if self.src_language != "auto":
            return self.src_language
        detected = self._detect_text_language(text)
        if log_decision:
            log_event(
                PREFIX_SYS,
                "036",
                f"Otomatik kaynak algisi: {detected.upper()} | OCR tepkisi: {self._describe_source_reaction()}",
                throttle_key=f"source_detect_{detected}",
                throttle_seconds=0.8,
            )
        return detected

    def _detect_text_language(self: "IPipelineState", text: str) -> str:
        compact = str(text or "").strip()
        cyrillic_count = len(re.findall(r"[\u0400-\u04FF]", compact))
        latin_count = len(re.findall(r"[A-Za-z]", compact))
        if cyrillic_count >= 2 and cyrillic_count >= max(2, latin_count):
            return "ru"
        return "en"

    def _describe_source_reaction(self: "IPipelineState") -> str:
        runtime_engine = self._runtime_engine_id()
        if runtime_engine == "easy":
            return "easy=en+ru karma OCR"
        if runtime_engine == "winonly":
            return "winonly tek dil secimiyle sinirli"
        return runtime_engine

