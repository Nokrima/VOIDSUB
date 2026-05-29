import asyncio
import time
import uuid
import re
from difflib import SequenceMatcher
from typing import TYPE_CHECKING
from core.errors import PREFIX_SYS, PREFIX_CFG, log_event
from core.processor.junk_filter import JunkFilter
from core.processor.utils import _clip_log_text, _quick_normalize, _strip_speaker

if TYPE_CHECKING:
    from core.processor.utils import IPipelineState

class OverlayPublisherMixin:
    def _emit_translation(self: "IPipelineState", stabilized_text: str, *, frame_started_monotonic: float | None = None, ocr_duration_ms: float = 0.0) -> None:
        if not stabilized_text:
            return
        if self.raw_translation_flow_enabled:
            if self._should_skip_raw_source_repeat(stabilized_text):
                self._log_trl(
                    "014",
                    (
                        f"Raw flow enqueue blocked: reason=same_source_repeat, "
                        f"source_text={stabilized_text!r}"
                    ),
                )
                return
            self._log_trl(
                "011",
                (
                    f"Raw flow enqueue: source_text={stabilized_text!r}, "
                    "cache=off, stabilizer=off, source_state=off, repeat_family=off"
                ),
            )
            self.last_text = stabilized_text
            self._last_emit_time = time.monotonic()
            self._translation_request_id += 1
            queued_at_monotonic = time.monotonic()
            self._pending_translations.append(
                (
                    stabilized_text,
                    self._translation_request_id,
                    queued_at_monotonic,
                    frame_started_monotonic or queued_at_monotonic,
                    ocr_duration_ms,
                )
            )
            self._last_raw_source_text = self._normalize_translated_text(stabilized_text)
            self._last_raw_source_time = queued_at_monotonic
            if self._active_translation_task is None or self._active_translation_task.done():
                self._active_translation_task = asyncio.create_task(self._translate_pending_loop())
            return
        state_analysis = JunkFilter.analyze_text(stabilized_text)
        state_decision = self.source_state.consider(stabilized_text, state_analysis, now=time.monotonic())
        selected_text = state_decision.selected_text or stabilized_text
        selected_analysis = JunkFilter.analyze_text(selected_text)
        self._log_ocr(
            "027",
            (
                f"Source state: action={'EMIT' if state_decision.should_emit else 'SKIP'}, "
                f"state={state_decision.state}, reason={state_decision.reason}, "
                f"similarity={state_decision.similarity:.2f}, family_changed={state_decision.family_changed}, "
                f"health={state_analysis['health_score']}, verdict={state_analysis['health_verdict']}, "
                f"broken={state_analysis['broken_token_count']}, connected_noise={state_analysis['connected_noise_runs']}, "
                f"tip2={state_analysis['tip2_suspect']}, memory_hit={state_decision.memory_hit}, "
                f"memory_age_ms={state_decision.memory_age_ms:.1f}, memory_reason={state_decision.memory_reason!r}, "
                f"text={stabilized_text!r}, selected={selected_text!r}"
            ),
        )
        if state_decision.memory_hit:
            self._log_ocr(
                "030",
                (
                    f"Session memory: action=HIT, reason={state_decision.memory_reason}, "
                    f"age_ms={state_decision.memory_age_ms:.1f}, text={stabilized_text!r}"
                ),
            )
        tip2_gate = self._evaluate_tip2_best_variant_gate(selected_analysis)
        if bool(selected_analysis.get("tip2_suspect")) or state_decision.reason == "tip2_confirmed_best":
            self._log_ocr(
                "029",
                (
                    f"Tip2 best-variant gate: action={'WOULD_EMIT' if tip2_gate['would_emit'] else 'WOULD_SKIP'}, "
                    f"reason={tip2_gate['reason']}, health={selected_analysis['health_score']}, "
                    f"verdict={selected_analysis['health_verdict']}, suspicious={selected_analysis['suspicious_tokens']}, "
                    f"broken={selected_analysis['broken_token_count']}, connected_noise={selected_analysis['connected_noise_runs']}, "
                    f"recognized_ratio={selected_analysis['recognized_ratio']:.2f}, unknown_long={selected_analysis['unknown_long_alpha_count']}, "
                    f"speaker_prefix_suspicious={selected_analysis['speaker_prefix_suspicious']}, "
                    f"joined={selected_analysis['joined_word_hits']}, merged={selected_analysis['merged_token_hits']}, "
                    f"minor_merge={selected_analysis['minor_merge_hits']}, tail_broken={selected_analysis['tail_broken_tokens']}, "
                    f"text={selected_text!r}"
                ),
            )
        if state_decision.should_emit and state_decision.reason == "tip2_confirmed_best" and not bool(tip2_gate["would_emit"]):
            self._log_ocr(
                "031",
                (
                    f"Tip2 emit blocked: reason={tip2_gate['reason']}, "
                    f"health={selected_analysis['health_score']}, suspicious={selected_analysis['suspicious_tokens']}, "
                    f"broken={selected_analysis['broken_token_count']}, connected_noise={selected_analysis['connected_noise_runs']}, "
                    f"recognized_ratio={selected_analysis['recognized_ratio']:.2f}, unknown_long={selected_analysis['unknown_long_alpha_count']}, "
                    f"minor_merge={selected_analysis['minor_merge_hits']}, "
                    f"text={selected_text!r}"
                ),
            )
            return
        if not state_decision.should_emit:
            return
        if selected_text != stabilized_text:
            self._log_ocr(
                "028",
                (
                    f"Tip2 emit selection: original={stabilized_text!r}, selected={selected_text!r}, "
                    f"reason={state_decision.reason}, state={state_decision.state}"
                ),
            )
        stabilized_text = selected_text
        if stabilized_text == self.last_text:
            return
        if self._should_skip_regressive_emit(stabilized_text):
            return
        current_normalized = re.sub(r"\s+", " ", _strip_speaker(stabilized_text).lower()).strip()
        last_normalized = re.sub(r"\s+", " ", _strip_speaker(str(self.last_text or "")).lower()).strip()
        if current_normalized and current_normalized == last_normalized:
            return
        if self._should_skip_family_repeat(stabilized_text):
            return
        self.last_text = stabilized_text
        self._last_emit_time = time.monotonic()
        cached_translation = self._get_cached_translation(stabilized_text)
        cache_key = self._cache_key_for_source(stabilized_text, "cache")
        if cached_translation:
            self._log_trl(
                "009",
                f"Cache hit: cache_key={cache_key!r}, source_text={stabilized_text!r}, translated_text={cached_translation!r}",
            )
            if self._active_translation_task is not None and not self._active_translation_task.done():
                log_event(
                    PREFIX_SYS,
                    "037",
                    "Aktif ceviri gorevi varken cache cikisi ertelendi.",
                    throttle_key="cache_emit_deferred",
                    throttle_seconds=0.5,
                    level="debug",
                )
                return
            self.logger.info(f"[OCR-037] cache_out: {_clip_log_text(cached_translation)}")
            frame_to_overlay_ms = ((time.monotonic() - frame_started_monotonic) * 1000) if frame_started_monotonic else 0.0
            self._log_trl(
                "005",
                f"Output filter: decision=PASSED, request_id=cache, source=cache, translated_text={cached_translation!r}",
            )
            self._log_ui(
                "001",
                (
                    f"Overlay update: source={self.translation_engine}-cache, original_text={stabilized_text!r}, "
                    f"translated_text={cached_translation!r}, display_mode=single, chunk_count=1"
                ),
            )
            self._log_ui(
                "002",
                f"Overlay chunk: index=1/1, text={cached_translation!r}, display_duration_ms={frame_to_overlay_ms:.1f}",
            )
            self._log_perf(frame_to_overlay_ms, ocr_duration_ms, 0.0)
            self.bridge.send(
                "new_translation",
                {
                    "id": str(uuid.uuid4()),
                    "original_text": stabilized_text,
                    "translated_text": cached_translation,
                    "translation_source": f"{self.translation_engine}-cache",
                    "timestamp": time.time(),
                },
            )
            return
        self._log_trl(
            "010",
            f"Cache miss: cache_key={cache_key!r}, source_text={stabilized_text!r}",
        )
        self._translation_request_id += 1
        slot_norm = self.slot_manager.get_normalized_slot() or _quick_normalize(stabilized_text)
        for pending_text, _, _, _, _ in self._pending_translations:
            pend_norm = _quick_normalize(pending_text)
            if slot_norm and pend_norm and SequenceMatcher(None, slot_norm, pend_norm).ratio() >= 0.85:
                return
        if self._pending_translations:
            pending_normalized = re.sub(r"\s+", " ", self._pending_translations[-1][0].strip().lower())
            if pending_normalized == current_normalized:
                return
        if self._pending_translations and self._pending_translations[-1][0] == stabilized_text:
            return
        queued_at_monotonic = time.monotonic()
        self._pending_translations.append(
            (
                stabilized_text,
                self._translation_request_id,
                queued_at_monotonic,
                frame_started_monotonic or queued_at_monotonic,
                ocr_duration_ms,
            )
        )
        if self._active_translation_task is None or self._active_translation_task.done():
            self._active_translation_task = asyncio.create_task(self._translate_pending_loop())

    def _emit_frame_stat(self: "IPipelineState", payload: dict | None, result: str, reason: str = "") -> None:
        """Throttled (max 1/sn) OCR cerceve tanilama eventi. UI'da gercek zamanli izleme saglar."""
        now = time.monotonic()
        if now - self._last_stat_emit_time < 0.85:
            return
        self._last_stat_emit_time = now
        self.bridge.send(
            "ocr_frame_stat",
            {
                "engine": self._runtime_engine_id(),
                "scene_selected": self.ocr_scene_mode,
                "detected_scene": payload.get("detected_scene_mode", "?") if payload else "?",
                "quality": int(payload.get("quality", 0)) if payload else 0,
                "result": result,          # accepted | rejected | no_text
                "reason": reason,          # quality | junk | "" (bos = kabul edildi)
                "signal": round(float(payload.get("signal", 0.0)), 1) if payload else 0.0,
                "variant": payload.get("variant", "-") if payload else "-",
                "capture_delay_ms": round(self._capture_delay() * 1000, 1),
                "queue_depth": len(self._pending_translations),
                "reused_frame_count": int(self._reused_frame_count),
            },
        )

    def _log_ui(self: "IPipelineState", code: str, message: str) -> None:
        self._log_debug("SYS", code, message)

    def _log_trl(self: "IPipelineState", code: str, message: str) -> None:
        self._log_debug("TRL", code, message)

    def _log_ocr(self: "IPipelineState", code: str, message: str) -> None:
        self._log_debug("OCR", code, message)

    def _log_perf(self: "IPipelineState", frame_to_overlay_ms: float, ocr_ms: float, translation_ms: float) -> None:
        overhead_ms = max(frame_to_overlay_ms - ocr_ms - translation_ms, 0.0)
        self._last_perf_stats = {
            "frame_to_overlay_ms": float(frame_to_overlay_ms),
            "ocr_ms": float(ocr_ms),
            "translation_ms": float(translation_ms),
            "overhead_ms": float(overhead_ms),
        }
        self._log_debug(
            "PERF",
            "001",
            (
                f"frame_to_overlay={frame_to_overlay_ms:.1f}ms, "
                f"ocr={ocr_ms:.1f}ms, translation={translation_ms:.1f}ms, "
                f"overhead={overhead_ms:.1f}ms"
            ),
        )

    def _log_translation_policy(self: "IPipelineState", tier: dict) -> None:
        repeat_window = int(tier.get("translated_repeat_window_ms", 0))
        log_event(
            PREFIX_CFG,
            "014",
            (
                f"Servis davranis politikasi aktif: {self.translation_engine}/"
                f"{self.performance_tier} | hedef={tier.get('target_ms')}ms | "
                f"hizli_metin={tier.get('fast_text_len')} | tekrar_penceresi={repeat_window}ms"
            ),
            throttle_key="translation_policy_cfg",
            throttle_seconds=0.2,
        )

