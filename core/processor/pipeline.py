from __future__ import annotations

import asyncio
import re
import sys
import time
import unicodedata
import uuid
from collections import deque
from difflib import SequenceMatcher
from typing import cast

import cv2
import numpy as np

from config.defaults import MODELS_DIR, QUALITY_THRESHOLD, get_performance_tier_profile
from core.errors import PREFIX_CFG, PREFIX_OCR, PREFIX_SYS, get_logger, log_event
from core.ocr.base import OCREngine
from core.processor.diagnostics import OCRDiagnostics
from core.processor.image_processor import ImageProcessor
from core.processor.junk_filter import JunkFilter
from core.processor.ocr_text_cleaner import clean_ocr_source_detailed
from core.processor.source_state_machine import SourceStateMachine
from core.processor.text_builder import build_detected_text
from core.processor.quality import TextQualityScorer
from core.processor.slot_manager import SlotManager
from core.processor.stabilizer import TextStabilizer
from core.performance_monitor import PerformanceMonitor
from core.translation.cache import TranslationCache
from core.translation.google import GoogleTranslationEngine
from core.translation.offline import OfflineTranslationEngine

logger = get_logger()

from core.processor.utils import _clip_log_text, _quick_normalize, _strip_speaker

from core.processor.translation_queue import TranslationQueueService
from core.processor.overlay_publisher import OverlayPublisherService

class TranslationPipeline:
    def __init__(self, bridge, capturer):
        self.logger = get_logger()
        self.bridge = bridge
        self.capturer = capturer
        self.logger.info(f"[{PREFIX_SYS}] Fabrika makineleri kuruluyor...")

        self._engine_instances: dict[str, OCREngine] = {}
        self.ocr_engine: OCREngine | None = None
        self.tr_cache = TranslationCache(capacity=300)
        self.translator = GoogleTranslationEngine(cache=self.tr_cache)
        self.offline_translator = OfflineTranslationEngine(cache=self.tr_cache, models_dir=MODELS_DIR, bridge=bridge)
        self.image_processor = ImageProcessor()
        self.diagnostics = OCRDiagnostics()
        self.stabilizer = TextStabilizer()
        self.slot_manager = SlotManager()
        self.translation_queue = TranslationQueueService(self)
        self.overlay_publisher = OverlayPublisherService(self)

        self.is_running = False
        self.active_engine = "easy"
        self.translation_engine = "auto"
        self.offline_model_key = "opus_mt_en_tr"
        self.performance_tier = "standard"
        if hasattr(self.offline_translator, "set_runtime_profile"):
            self.offline_translator.set_runtime_profile(self.performance_tier)
        if hasattr(self.offline_translator, "set_model_key"):
            self.offline_translator.set_model_key(self.offline_model_key)
        self.ocr_filters_enabled = True
        self.raw_translation_flow_enabled = False
        self.ocr_scene_mode = "striped"
        self.quality_threshold = QUALITY_THRESHOLD
        self.min_text_chars = 5
        self.stabilizer_min_samples = 2
        self.variant_budget_override: int | None = None
        self.scene_fit_threshold = 0.42
        self.calibration_profile_active = False
        self.loop_interval = max(0.04, float(self._profile_value("target_ms", 300)) / 1000)
        self.src_language = "auto"
        self.tgt_language = "tr"
        self.target_region = {"top": 800, "left": 500, "width": 800, "height": 200}

        self.last_text = ""
        self.last_detected_text = ""
        self.last_detected_quality = 0
        self.last_overlay_region = None
        self._last_frame_hash = b""
        self._last_emit_time = 0.0
        self._last_translated_text = ""
        self._last_translated_emit_time = 0.0
        self._last_emitted_source_text = ""
        self._last_emitted_source_time = 0.0
        self._last_raw_source_text = ""
        self._last_raw_source_time = 0.0
        self._subtitle_active_until = 0.0
        self._last_stat_emit_time = 0.0
        self._reused_frame_count = 0
        self._last_perf_stats: dict[str, float] = {}

        self._translation_request_id = 0
        self._active_translation_task: asyncio.Task | None = None
        self._pending_translations: deque[tuple[str, int, float, float, float]] = deque(maxlen=3)
        self._active_translation_source = ""
        self._ocr_candidate_history: deque[dict] = deque(maxlen=10)
        self._last_merge_confidence = 0.0

        self._capture_task: asyncio.Task | None = None
        self._latest_frame: np.ndarray | None = None
        self._latest_frame_id = 0
        self._processed_frame_id = 0
        self._latest_resolved_region: dict | None = None
        self._latest_capture_probe: dict | None = None
        self.performance_monitor = PerformanceMonitor(bridge=bridge, pipeline=self)
        self.source_state = SourceStateMachine(hold_window_ms=int(self._profile_value("source_family_hold_ms", 1600)))
        self.current_correlation_id = ""
        self._configure_ocr_source_profiles()

    def _log_debug(self, prefix: str, code: str, message: str, correlation_id: str = "") -> None:
        cid = correlation_id or getattr(self, "current_correlation_id", "")
        if getattr(sys, 'frozen', False):
            # Maskeleme regex'i: text='...', translated_text="..." gibi alanları bulur ve içini gizler.
            message = re.sub(
                r'(text|before|after|candidate|source|translated_text|raw_text|original_text|last_detected_text|last_text|current_text|raw_texts|google_text|offline_text|cache_key)=([\'"]).*?\2',
                r'\1=\2*** [REDACTED] ***\2',
                message
            )
        cid_str = f" [CID:{cid}]" if cid else ""
        self.logger.debug(f"[{prefix}-{code}]{cid_str} {message}")





    async def _startup_phase(self) -> bool:
        """Activate OCR engine and validate capture module. Returns False if startup fails."""
        runtime_engine = self._runtime_engine_id()
        log_event(
            PREFIX_SYS,
            "075",
            (
                "Start loop requested: "
                f"selected_engine={self.active_engine}, runtime_engine={runtime_engine}, "
                f"scene_mode={self.ocr_scene_mode}, translation_engine={self.translation_engine}, "
                f"region={self.target_region}, filters={self.ocr_filters_enabled}, "
                f"quality_threshold={self.quality_threshold}, min_text_chars={self.min_text_chars}"
            ),
        )
        self.bridge.send("translation_state", {"running": False, "loading": True, "engine": runtime_engine})
        await asyncio.sleep(0.05)
        started = await asyncio.get_running_loop().run_in_executor(None, self._activate_engine, runtime_engine)
        if not started:
            self.logger.error(f"[{PREFIX_SYS}-045] [OCR Motoru] -> BAŞLATILAMADI | Motor: {runtime_engine}")
            engine_obj = self._get_engine_instance(runtime_engine)
            start_error = getattr(engine_obj, 'start_error', None) if engine_obj else None
            self.bridge.send("translation_state", {
                "running": False,
                "reason": "engine_unavailable",
                "message": str(start_error) if start_error else None
            })
            return False
        if getattr(self.capturer, "_capture_state", "ready") == "unavailable":
            capture_err = getattr(self.capturer, "_runtime_error", "Bilinmeyen hata")
            self.logger.error(f"[{PREFIX_SYS}-045] [Ekran Yakalama] -> MODÜL BOZUK | Detay: {capture_err}")
            self.bridge.send("translation_state", {
                "running": False,
                "reason": "capture_unavailable",
                "message": str(capture_err)
            })
            return False
        self.is_running = True
        self.performance_monitor.start()
        self._notify_runtime_engine_fallback(runtime_engine)
        self.bridge.send("translation_state", {"running": True, "engine": runtime_engine})
        self.logger.info(f"[{PREFIX_SYS}-040] Ceviri hatti baslatildi. Motor: {runtime_engine}")
        if self.translation_engine == "offline" and hasattr(self.offline_translator, "warmup"):
            await asyncio.get_running_loop().run_in_executor(None, self.offline_translator.warmup)
        self._capture_task = asyncio.create_task(self._capture_loop())
        return True

    async def start_loop(self):
        if self.is_running:
            log_event(PREFIX_SYS, "075", "Start loop request ignored: pipeline already running", level="debug")
            return
        if not await self._startup_phase():
            return

        try:
            while self.is_running:
                try:
                    await self._run_loop_tick()
                except asyncio.CancelledError:
                    raise
                except Exception as loop_exc:
                    self.logger.error(f"[{PREFIX_SYS}-041] [Ana Çeviri Döngüsü İçi] -> AKSAMA | Hata: {loop_exc}")
                    await asyncio.sleep(max(1.0, self.loop_interval))
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            self.logger.error(f"[{PREFIX_SYS}-041] [Ana Çeviri Döngüsü] -> KESİNTİ/AKSAMA | Hata: {exc}")
            await asyncio.sleep(max(1.0, self.loop_interval))
        finally:
            if self._capture_task is not None:
                self._capture_task.cancel()
                try:
                    await self._capture_task
                except asyncio.CancelledError:
                    pass
                except Exception as exc:
                    self.logger.error(f"[{PREFIX_SYS}-048] [Ekran Yakalama] -> KAPATMA HATASI | Hata: {exc}")
                self._capture_task = None
            self.is_running = False
            self.performance_monitor.stop()
            self.bridge.send("translation_state", {"running": False})

    async def _run_loop_tick(self) -> None:
        """Execute one iteration of the main translation loop."""
        if self.ocr_engine is None or not self.ocr_engine.is_ready():
            runtime_engine = self._runtime_engine_id()
            self.bridge.send("translation_state", {"running": True, "loading": True, "engine": runtime_engine})
            await asyncio.sleep(0.05)
            started = await asyncio.get_running_loop().run_in_executor(None, self._activate_engine, runtime_engine)
            if not started:
                await asyncio.sleep(min(self.loop_interval, 0.05))
                return
            self._notify_runtime_engine_fallback(runtime_engine)
            self.bridge.send("translation_state", {"running": True, "engine": runtime_engine})

        snapshot = self._take_latest_frame()
        if snapshot is None:
            log_event(
                PREFIX_OCR, "049",
                (
                    "Frame wait: no captured frame available yet, "
                    f"latest_frame_id={self._latest_frame_id}, capture_state={getattr(self.capturer, '_capture_state', 'unknown')}, "
                    f"capture_error={getattr(self.capturer, '_runtime_error', None)!r}"
                ),
                level="debug", throttle_key="ocr_frame_wait_empty", throttle_seconds=1.0,
            )
            await asyncio.sleep(min(self.loop_interval, 0.015))
            return

        frame_id, frame, resolved_region, capture_probe = snapshot
        self.current_correlation_id = f"{frame_id}-{uuid.uuid4().hex[:8]}"
        frame_started_monotonic = float((capture_probe or {}).get("captured_monotonic", time.monotonic()))
        if frame_id <= self._processed_frame_id:
            del frame
            await asyncio.sleep(min(self.loop_interval, 0.012))
            return
        self._processed_frame_id = frame_id

        if resolved_region and resolved_region != self.last_overlay_region:
            self.last_overlay_region = dict(resolved_region)
            if getattr(self.bridge, "native_overlay", None) is not None:
                self.bridge.native_overlay.set_region(resolved_region)

        frame_hash = self._frame_hash(frame)
        if frame_hash == self._last_frame_hash and self.last_detected_text:
            reused_done = await self._handle_reused_frame(frame_id, frame, frame_started_monotonic)
            if reused_done:
                return
        self._last_frame_hash = frame_hash
        self._reused_frame_count = 0

        ocr_frame_done = await self._process_ocr_frame(
            frame_id, frame, resolved_region, frame_started_monotonic, ocr_duration_ms=None
        )
        if ocr_frame_done:
            await asyncio.sleep(0)
        else:
            await asyncio.sleep(min(self.loop_interval, 0.01))


    async def _handle_reused_frame(self, frame_id: int, frame, frame_started_monotonic: float) -> bool:
        """Handle a frame whose hash matches the last seen frame. Returns True if the frame was consumed."""
        if self.raw_translation_flow_enabled:
            self.overlay_publisher._log_ocr(
                "032",
                (
                    f"Raw flow frame reuse allowed: frame_id={frame_id}, reason=hash_match, "
                    f"text={self.last_detected_text!r}, quality={self.last_detected_quality}"
                ),
            )
            return False  # raw mode: fall through to normal OCR path
        self._reused_frame_count += 1
        self.overlay_publisher._log_ocr(
            "002",
            (
                f"Frame reused: frame_id={frame_id}, reason=hash_match, "
                f"last_detected_text={self.last_detected_text!r}, quality={self.last_detected_quality}"
            ),
        )
        self._mark_subtitle_activity()
        self.slot_manager.push(self.last_detected_text, self.last_detected_quality)
        min_slot_samples = self._required_slot_samples(self.last_detected_text, self.last_detected_quality)
        if self._should_skip_reused_frame_reprocess(min_slot_samples):
            self.overlay_publisher._log_ocr(
                "026",
                (
                    f"Static frame skipped: frame_id={frame_id}, repeat_count={self._reused_frame_count}, "
                    f"samples={self.slot_manager.get_sample_count()}, required={min_slot_samples}, "
                    f"last_text={self.last_text!r}"
                ),
            )
            del frame
            await asyncio.sleep(min(self.loop_interval, 0.01))
            return True
        if self.slot_manager.get_sample_count() >= min_slot_samples:
            stabilized_text = self.slot_manager.get_slot()
        else:
            stabilized_text = None
        if stabilized_text:
            self.overlay_publisher._emit_translation(stabilized_text, frame_started_monotonic=frame_started_monotonic, ocr_duration_ms=0.0)
        del frame
        await asyncio.sleep(min(self.loop_interval, 0.01))
        return True

    async def _run_ocr_with_timeout(self, frame, frame_id: int, resolved_region) -> tuple:
        """Run OCR with timeout. Returns (ocr_payload, ocr_duration_ms). payload=None on fail."""
        ocr_started = time.perf_counter()
        try:
            ocr_payload = await asyncio.wait_for(
                asyncio.to_thread(self._read_fast_then_refine, frame, frame_id),
                timeout=3.5,
            )
        except asyncio.TimeoutError:
            self.logger.error(f"[{PREFIX_OCR}-051] [OCR İşlemi] -> ZAMAN AŞIMI | Çerçeve ID: {frame_id}")
            ocr_payload = None
        ocr_duration_ms = (time.perf_counter() - ocr_started) * 1000
        return ocr_payload, ocr_duration_ms

    def _extract_detected_text(self, frame_id: int, ocr_payload: dict, ocr_duration_ms: float) -> tuple | None:
        """Cleanup OCR text and apply early-drop gates. Returns (detected_text, quality_score) or None."""
        raw_detected_text = str(ocr_payload["text"])
        clean_report = clean_ocr_source_detailed(raw_detected_text) if not self.raw_translation_flow_enabled else None
        detected_text = raw_detected_text if self.raw_translation_flow_enabled else str(clean_report["text"])
        if self.raw_translation_flow_enabled:
            self.overlay_publisher._log_ocr("033", f"Raw flow cleanup bypass: frame_id={frame_id}, raw_text={raw_detected_text!r}, cleaned_candidate=None")
            self.overlay_publisher._log_ocr("013", f"Source cleanup: frame_id={frame_id}, changed=False, steps=['skipped_raw_mode'], before={raw_detected_text!r}, after={detected_text!r}")
        else:
            self.overlay_publisher._log_ocr(
                "013",
                (f"Source cleanup: frame_id={frame_id}, changed={clean_report['changed']}, "
                 f"steps={clean_report['steps']}, minor_merge_fixes={clean_report.get('minor_merge_fixes', [])}, "
                 f"before={raw_detected_text!r}, after={detected_text!r}"),
            )
        quality_score = int(ocr_payload["quality"])
        self.overlay_publisher._log_ocr(
            "016",
            f"Final OCR text: frame_id={frame_id}, variant={ocr_payload['variant']}, scene_mode={ocr_payload['scene_mode']}, text={detected_text!r}, quality={quality_score}, ocr_ms={ocr_duration_ms:.1f}",
        )
        self._mark_subtitle_activity()
        if (not self.raw_translation_flow_enabled and frame_id != self._latest_frame_id
                and self._is_subtitle_active() and quality_score < max(self.quality_threshold + 6, 50)):
            return None
        if not self.raw_translation_flow_enabled and detected_text == self.last_text:
            return None
        if not self.raw_translation_flow_enabled and len(detected_text.strip()) < self._effective_min_text_chars():
            self.overlay_publisher._log_ocr("017", f"Min text chars gate: decision=REJECTED, frame_id={frame_id}, length={len(detected_text.strip())}, threshold={self._effective_min_text_chars()}, text={detected_text!r}")
            self.overlay_publisher._emit_frame_stat(ocr_payload, "rejected", "min_text_chars")
            return None
        return detected_text, quality_score

    def _run_junk_filter(self, frame_id: int, frame, ocr_payload: dict, detected_text: str, quality_score: int) -> bool:
        """Run junk filter. Returns True if rejected."""
        if self.raw_translation_flow_enabled:
            self.overlay_publisher._log_ocr("018", f"Junk filter: decision=BYPASSED, frame_id={frame_id}, text={detected_text!r}")
            self.overlay_publisher._log_ocr("014", f"Tip2 analysis: frame_id={frame_id}, decision=BYPASSED")
            return False
        junk_rejected = JunkFilter.is_junk(detected_text)
        text_health = JunkFilter.analyze_text(detected_text)
        self.overlay_publisher._log_ocr(
            "018",
            (f"Junk filter: decision={'REJECTED' if junk_rejected else 'ACCEPTED'}, "
             f"frame_id={frame_id}, text={detected_text!r}, health={text_health['health_score']}, verdict={text_health['health_verdict']}, "
             f"recognized={text_health['recognized_count']}, recognized_ratio={text_health['recognized_ratio']:.2f}, "
             f"suspicious={text_health['suspicious_tokens']}, broken={text_health['broken_token_count']}, "
             f"unknown_long={text_health['unknown_long_alpha_count']}, merged={text_health['merged_token_hits']}, "
             f"minor_merge={text_health['minor_merge_hits']}, speaker_prefix_suspicious={text_health['speaker_prefix_suspicious']}, tip2={text_health['tip2_suspect']}"),
        )
        self.overlay_publisher._log_ocr(
            "014",
            (f"Tip2 analysis: frame_id={frame_id}, candidate={text_health['tip2_suspect']}, "
             f"joined={text_health['joined_word_hits']}, tail_broken={text_health['tail_broken_tokens']}, "
             f"malformed_common={text_health['malformed_common_word_hits']}, merged={text_health['merged_token_hits']}, "
             f"minor_merge={text_health['minor_merge_hits']}, broken_tokens={text_health['broken_tokens']}, "
             f"suspicious_tokens={text_health['suspicious_token_list']}, connected_noise_runs={text_health['connected_noise_runs']}, "
             f"connected_noise_tokens={text_health['connected_noise_tokens']}, unknown_long={text_health['unknown_long_alpha_count']}, "
             f"speaker_prefix_suspicious={text_health['speaker_prefix_suspicious']}"),
        )
        if junk_rejected:
            self.diagnostics.record("rejected", self.active_engine, str(ocr_payload["scene_mode"]), frame,
                cast(np.ndarray, ocr_payload["processed"]), detected_text, quality_score,
                {"variant": ocr_payload["variant"], "result_count": ocr_payload["result_count"], "frame_id": frame_id, "reason": "junk"})
            self.overlay_publisher._emit_frame_stat(ocr_payload, "rejected", "junk")
        return junk_rejected

    def _run_quality_gate(self, frame_id: int, frame, ocr_payload: dict, detected_text: str, quality_score: int) -> bool:
        """Run quality gate. Returns True if rejected."""
        quality_threshold = self.quality_threshold
        quality_reason = "bypassed_raw_mode"
        quality_rejected = False
        if not self.raw_translation_flow_enabled:
            quality_threshold, quality_reason = self._quality_gate_context(detected_text, quality_score)
            quality_rejected = self._should_drop_for_quality(detected_text, quality_score)
        if self.raw_translation_flow_enabled:
            self.overlay_publisher._log_ocr("034", f"Raw flow gates bypassed: frame_id={frame_id}, min_chars=off, junk=off, quality=off, score={quality_score}, threshold={quality_threshold}")
        self.overlay_publisher._log_ocr(
            "019",
            f"Quality gate: decision={'REJECTED' if quality_rejected else 'ACCEPTED'}, frame_id={frame_id}, score={quality_score}, threshold={quality_threshold}, reason={quality_reason}, breakdown={self._quality_gate_breakdown(detected_text)!r}, text={detected_text!r}",
        )
        if quality_rejected:
            self.diagnostics.record("rejected", self.active_engine, str(ocr_payload["scene_mode"]), frame,
                cast(np.ndarray, ocr_payload["processed"]), detected_text, quality_score,
                {"variant": ocr_payload["variant"], "result_count": ocr_payload["result_count"], "frame_id": frame_id, "reason": "quality"})
            log_event(PREFIX_SYS, "033", "[Görüntü İşleme] -> ATLANDI | Düşük kalite OCR çıktısı", throttle_key="quality_skip", throttle_seconds=2.0)
            self.overlay_publisher._emit_frame_stat(ocr_payload, "rejected", "quality")
        return quality_rejected

    def _apply_text_gates(self, frame_id: int, frame, ocr_payload: dict, ocr_duration_ms: float):
        """Apply cleanup, junk and quality filters. Returns (detected_text, quality_score) or None if rejected."""
        result = self._extract_detected_text(frame_id, ocr_payload, ocr_duration_ms)
        if result is None:
            return None
        detected_text, quality_score = result
        if self._run_junk_filter(frame_id, frame, ocr_payload, detected_text, quality_score):
            return None
        if self._run_quality_gate(frame_id, frame, ocr_payload, detected_text, quality_score):
            return None
        return detected_text, quality_score

    def _run_stabilizer(self, frame_id: int, frame, ocr_payload: dict, detected_text: str,
                        quality_score: int, frame_started_monotonic: float, ocr_duration_ms: float) -> bool:
        """Push text through stabilizer slot and emit if stable. Returns True when done."""
        push_result = self.slot_manager.push(detected_text, quality_score)
        if push_result in ("new_slot", "rejected"):
            self._instability_count = getattr(self, "_instability_count", 0) + 1
            if self._instability_count > 5:
                from core.errors import emit_bridge_event
                self.overlay_publisher._log_ocr("060", "Ekran içeriği çok hızlı değişiyor (Flickering tespit edildi).")
                emit_bridge_event("log_entry", {"timestamp": "", "level": "INFO", "prefix": "OCR", "code": "OCR-060",
                                               "message": "Ekran içeriği çok hızlı değişiyor. Çeviri gecikmeli görünebilir."})
                emit_bridge_event("stability_warning", {})
                self._instability_count = 0
        elif push_result in ("upgraded", "held") and self.slot_manager.is_stable():
            self._instability_count = 0
        sample_count = self.slot_manager.get_sample_count()
        slot_debug = self.slot_manager.get_slot_debug()
        min_slot_samples = self._required_slot_samples(detected_text, quality_score)
        self.overlay_publisher._log_ocr(
            "020",
            (f"Stabilizer push: decision={push_result.upper()}, frame_id={frame_id}, "
             f"samples={sample_count}, required={min_slot_samples}, text={detected_text!r}, "
             f"slot_health={slot_debug['health']}, slot_recognized={slot_debug['recognized']}, slot_broken={slot_debug['broken']}, "
             f"slot_suspicious={slot_debug['suspicious']}, slot_complete={slot_debug['complete']}, slot_length={slot_debug['length']}"),
        )
        if push_result == "rejected":
            self.overlay_publisher._emit_frame_stat(ocr_payload, "rejected", "slot_rejected")
            del frame; del ocr_payload; return True
        if self.slot_manager.get_sample_count() < min_slot_samples:
            self.overlay_publisher._log_ocr("021", f"Stabilizer decision: ACCEPTED=NO, frame_id={frame_id}, samples={self.slot_manager.get_sample_count()}, required={min_slot_samples}, reason=slot_wait")
            self.overlay_publisher._emit_frame_stat(ocr_payload, "rejected", "slot_wait")
            del frame; del ocr_payload; return True
        stabilized_text = self.slot_manager.get_slot()
        if stabilized_text is None:
            self.overlay_publisher._log_ocr("022", f"Stabilizer decision: ACCEPTED=NO, frame_id={frame_id}, reason=stabilizer_none, text={detected_text!r}")
            self.diagnostics.record("rejected", self.active_engine, str(ocr_payload["scene_mode"]), frame,
                cast(np.ndarray, ocr_payload["processed"]), detected_text, quality_score,
                {"variant": ocr_payload["variant"], "result_count": ocr_payload["result_count"], "frame_id": frame_id, "reason": "stabilizer"})
            del frame; del ocr_payload; return True
        self.overlay_publisher._log_ocr("023", f"Stabilizer decision: ACCEPTED=YES, frame_id={frame_id}, samples={self.slot_manager.get_sample_count()}, required={min_slot_samples}, final_text={stabilized_text!r}")
        self.diagnostics.record("accepted", self.active_engine, str(ocr_payload["scene_mode"]), frame,
            cast(np.ndarray, ocr_payload["processed"]), stabilized_text, quality_score,
            {"variant": ocr_payload["variant"], "result_count": ocr_payload["result_count"], "frame_id": frame_id})
        self.overlay_publisher._emit_frame_stat(ocr_payload, "accepted")
        self.overlay_publisher._log_ocr("024", f"Final text queued for translation: frame_id={frame_id}, text={stabilized_text!r}, ocr_ms={ocr_duration_ms:.1f}")
        self.overlay_publisher._emit_translation(stabilized_text, frame_started_monotonic=frame_started_monotonic, ocr_duration_ms=ocr_duration_ms)
        del frame; del ocr_payload
        return True

    async def _process_ocr_frame(self, frame_id: int, frame, resolved_region, frame_started_monotonic: float, ocr_duration_ms) -> bool:
        """Orchestrate OCR -> text gates -> stabilizer -> emit. Returns True if frame was processed."""
        ocr_payload, ocr_duration_ms = await self._run_ocr_with_timeout(frame, frame_id, resolved_region)
        if not ocr_payload:
            del frame
            return False
        gate_result = self._apply_text_gates(frame_id, frame, ocr_payload, ocr_duration_ms)
        if gate_result is None:
            del frame; del ocr_payload
            return True
        detected_text, quality_score = gate_result
        self.last_detected_text = detected_text
        self.last_detected_quality = quality_score
        # Raw flow fast path
        if self.raw_translation_flow_enabled:
            self.overlay_publisher._emit_frame_stat(ocr_payload, "accepted")
            self.overlay_publisher._log_ocr("024", f"Raw flow queued for translation: frame_id={frame_id}, text={detected_text!r}, ocr_ms={ocr_duration_ms:.1f}")
            self.overlay_publisher._emit_translation(detected_text, frame_started_monotonic=frame_started_monotonic, ocr_duration_ms=ocr_duration_ms)
            del frame; del ocr_payload
            return True
        return self._run_stabilizer(frame_id, frame, ocr_payload, detected_text, quality_score, frame_started_monotonic, ocr_duration_ms)


    async def _capture_loop(self) -> None:
        while self.is_running:
            try:
                capture_started = time.perf_counter()
                # Mevcut akista her iki sahne modu da kullanicinin secili runtime bolgesiyle yakalanir.
                region_snapshot = dict(self._effective_capture_region())
                overlay = getattr(self.bridge, "native_overlay", None)
                overlay_hidden_for_capture = False
                if overlay is not None:
                    overlay_hidden_for_capture = await asyncio.to_thread(overlay.prepare_capture, region_snapshot)
                try:
                    frame = await asyncio.to_thread(self.capturer.capture_region, region_snapshot)
                finally:
                    if overlay is not None:
                        await asyncio.to_thread(overlay.finish_capture, overlay_hidden_for_capture)
                resolved_region = getattr(self.capturer, "get_last_resolved_region", lambda: None)()
                if frame is not None:
                    capture_ms = (time.perf_counter() - capture_started) * 1000
                    self._latest_frame = frame
                    self._latest_frame_id += 1
                    self._latest_resolved_region = dict(resolved_region) if isinstance(resolved_region, dict) else None
                    self._latest_capture_probe = {
                        "captured_at": time.time(),
                        "captured_monotonic": time.monotonic(),
                        "capture_ms": capture_ms,
                        "region": dict(region_snapshot),
                        "resolved_region": dict(resolved_region) if isinstance(resolved_region, dict) else None,
                        "shape": tuple(frame.shape),
                    }
                    self.overlay_publisher._log_ocr(
                        "001",
                        (
                            f"Frame captured: frame_id={self._latest_frame_id}, "
                            f"region={region_snapshot}, resolved_region={resolved_region}, "
                            f"shape={tuple(frame.shape)}, capture_ms={capture_ms:.1f}"
                        ),
                    )
                else:
                    log_event(
                        PREFIX_OCR,
                        "050",
                        (
                            "Capture returned no frame: "
                            f"region={region_snapshot}, resolved_region={resolved_region}, "
                            f"capture_state={getattr(self.capturer, '_capture_state', 'unknown')}, "
                            f"capture_error={getattr(self.capturer, '_runtime_error', None)!r}"
                        ),
                        level="debug",
                        throttle_key="capture_none_frame",
                        throttle_seconds=1.0,
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.logger.error(f"[{PREFIX_SYS}-047] [Ekran Yakalama Döngüsü] -> ÜRETİCİ AKSADI | Hata: {exc}")
            await asyncio.sleep(self._capture_delay())


    def stop(self):
        self.is_running = False
        self.performance_monitor.stop()
        self._translation_request_id += 1
        self._pending_translations.clear()
        self.tr_cache.clear()
        self._latest_frame = None
        self._latest_frame_id = 0
        self._processed_frame_id = 0
        self._reset_runtime_state(clear_stabilizer=True)
        if self.ocr_engine is not None:
            self.ocr_engine.stop()
        self.bridge.send("translation_state", {"running": False})
        self.logger.info(f"[{PREFIX_SYS}-042] Ceviri hatti guvenli sekilde durduruldu.")

    def update_config(
        self,
        engine_id=None,
        region=None,
        translation_engine=None,
        offline_model_key=None,
        performance_tier=None,
        ocr_filters_enabled=None,
        raw_translation_flow_enabled=None,
        scene_mode=None,
        quality_threshold=None,
        min_text_chars=None,
        stabilizer_min_samples=None,
        variant_budget=None,
        scene_fit_threshold=None,
        clahe_clip_striped=None,
        clahe_clip_floating=None,
        bilateral_d=None,
        white_v_min=None,
        floating_gaussian_c=None,
        floating_mean_c=None,
        calibration_profile_active=None,
        src_language=None,
        tgt_language=None,
    ):
        if engine_id and engine_id in ["winonly", "easy"]:
            if self.is_running and self.active_engine != engine_id:
                if self.ocr_engine is not None:
                    self.ocr_engine.stop()
                self.ocr_engine = None
                self._translation_request_id += 1
                self._pending_translations.clear()
                self._reset_runtime_state(clear_stabilizer=True)
            self.active_engine = engine_id
            self.loop_interval = max(0.04, float(self._profile_value("target_ms", 300)) / 1000)
            self.source_state.configure(hold_window_ms=int(self._profile_value("source_family_hold_ms", 1600)))
            self.logger.info(f"[{PREFIX_SYS}-043] Motor degisimi hatta uygulandi: {engine_id}")
        if region:
            self.target_region = region
            self.last_overlay_region = None
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._latest_frame = None
            self._latest_frame_id = 0
            self._processed_frame_id = 0
            self._reset_runtime_state(clear_stabilizer=True)
            self.logger.info(f"[{PREFIX_SYS}-044] Tarama bolgesi guncellendi.")
        if translation_engine:
            self.translation_engine = translation_engine
            if hasattr(self.offline_translator, "set_runtime_profile"):
                self.offline_translator.set_runtime_profile(self.performance_tier)
            if self.translation_engine == "offline" and hasattr(self.offline_translator, "warmup"):
                try:
                    asyncio.get_running_loop().run_in_executor(None, self.offline_translator.warmup)
                except RuntimeError:
                    pass
            log_event(PREFIX_CFG, "012", f"[Çeviri Ayarları] -> UYGULANDI | Motor: {translation_engine}", throttle_key="translation_engine_cfg", throttle_seconds=0.2)
            tier = get_performance_tier_profile(self.active_engine, self.performance_tier, self.translation_engine)
            self.loop_interval = max(0.04, float(tier["target_ms"]) / 1000)
            self.source_state.configure(hold_window_ms=int(tier.get("source_family_hold_ms", 1600)))
            self.overlay_publisher._log_translation_policy(tier)
        if offline_model_key is not None and hasattr(self.offline_translator, "set_model_key"):
            normalized_model_key = str(offline_model_key or "opus_mt_en_tr").strip().lower()
            if normalized_model_key != self.offline_model_key:
                self.offline_model_key = normalized_model_key
                self.offline_translator.set_model_key(normalized_model_key)
                if self.translation_engine == "offline" and hasattr(self.offline_translator, "warmup"):
                    try:
                        asyncio.get_running_loop().run_in_executor(None, self.offline_translator.warmup)
                    except RuntimeError:
                        pass
                self._translation_request_id += 1
                self._pending_translations.clear()
                self._reset_runtime_state(clear_stabilizer=True)
                log_event(
                    PREFIX_CFG,
                    "016",
                    f"Offline model secimi uygulandi: {normalized_model_key}",
                    throttle_key="offline_model_cfg",
                    throttle_seconds=0.2,
                )
        if performance_tier:
            self.performance_tier = performance_tier
            if hasattr(self.offline_translator, "set_runtime_profile"):
                self.offline_translator.set_runtime_profile(performance_tier)
            tier = get_performance_tier_profile(self.active_engine, performance_tier, self.translation_engine)
            self.loop_interval = max(0.04, float(tier["target_ms"]) / 1000)
            self.source_state.configure(hold_window_ms=int(tier.get("source_family_hold_ms", 1600)))
            log_event(PREFIX_CFG, "013", f"[Performans Profili] -> UYGULANDI | Seviye: {performance_tier} | Motor: {self.active_engine} | Hedef(ms): {tier['target_ms']}", throttle_key="performance_tier_cfg", throttle_seconds=0.2)
            self.overlay_publisher._log_translation_policy(tier)
        if ocr_filters_enabled is not None:
            self.ocr_filters_enabled = bool(ocr_filters_enabled)
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        if raw_translation_flow_enabled is not None:
            self.raw_translation_flow_enabled = bool(raw_translation_flow_enabled)
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
            log_event(
                PREFIX_CFG,
                "017",
                f"Ham akis modu: {'acik' if self.raw_translation_flow_enabled else 'kapali'}",
                throttle_key="raw_flow_cfg",
                throttle_seconds=0.2,
            )
        if scene_mode:
            self.ocr_scene_mode = scene_mode
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
            
        if quality_threshold is not None:
            self.quality_threshold = max(0, min(100, int(quality_threshold)))
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        if min_text_chars is not None:
            self.min_text_chars = max(0, int(min_text_chars))
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        if stabilizer_min_samples is not None:
            self.stabilizer_min_samples = max(1, int(stabilizer_min_samples))
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        if variant_budget is not None:
            self.variant_budget_override = max(1, int(variant_budget))
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        if scene_fit_threshold is not None:
            self.scene_fit_threshold = max(0.0, min(1.0, float(scene_fit_threshold)))
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        if calibration_profile_active is not None:
            self.calibration_profile_active = bool(calibration_profile_active)
            self._translation_request_id += 1
            self._pending_translations.clear()
            self._reset_runtime_state(clear_stabilizer=True)
        self.image_processor.update_runtime_config(
            clahe_clip_striped=clahe_clip_striped,
            clahe_clip_floating=clahe_clip_floating,
            bilateral_d=bilateral_d,
            white_v_min=white_v_min,
            floating_gaussian_c=floating_gaussian_c,
            floating_mean_c=floating_mean_c,
        )
        if src_language is not None:
            normalized_src = self._normalize_source_language(src_language)
            if normalized_src != self.src_language:
                self.src_language = normalized_src
                self._translation_request_id += 1
                self._pending_translations.clear()
                self._reset_runtime_state(clear_stabilizer=True)
                self._configure_ocr_source_profiles()
                if self.ocr_engine is not None:
                    self.ocr_engine.stop()
                self.ocr_engine = None
        if tgt_language is not None:
            normalized_tgt = self._normalize_target_language(tgt_language)
            if normalized_tgt != self.tgt_language:
                self.tgt_language = normalized_tgt
                self._translation_request_id += 1
                self._pending_translations.clear()
                self._reset_runtime_state(clear_stabilizer=False)

    def _get_engine_instance(self, engine_id: str) -> OCREngine | None:
        if engine_id not in self._engine_instances:
            if engine_id == "winonly":
                from core.ocr.windows_ocr import WindowsOCREngine
                self._engine_instances["winonly"] = WindowsOCREngine()
            elif engine_id == "easy":
                from core.ocr.easy_ocr import EasyOCREngine
                self._engine_instances["easy"] = EasyOCREngine()
            else:
                return None
        return self._engine_instances[engine_id]

    def _activate_engine(self, engine_id: str) -> bool:
        engine = self._get_engine_instance(engine_id)
        if engine is None:
            log_event(PREFIX_OCR, "051", f"[OCR Motoru Aktivasyonu] -> AKTİVASYON BAŞARISIZ | Bilinmeyen Motor: {engine_id}", level="error")
            return False
        log_event(
            PREFIX_OCR,
            "051",
            (
                "Engine activation requested: "
                f"engine={engine_id}, class={type(engine).__name__}, source_language={self.src_language}, "
                f"current_engine={type(self.ocr_engine).__name__ if self.ocr_engine is not None else None}"
            ),
        )
        engine.configure_source_language(self.src_language)
        log_event(
            PREFIX_OCR,
            "052",
            (
                "Engine source profile applied: "
                f"engine={engine_id}, source_language={getattr(engine, 'source_language', None)}, "
                f"language_tag={getattr(engine, 'language_tag', None)}, "
                f"lang_list={getattr(engine, 'lang_list', None)}"
            ),
            level="debug",
        )
        if self.ocr_engine is not engine:
            if self.ocr_engine is not None:
                log_event(PREFIX_OCR, "053", f"Stopping previous OCR engine: class={type(self.ocr_engine).__name__}", level="debug")
                self.ocr_engine.stop()
            self.ocr_engine = engine
        if self.ocr_engine is None:
            log_event(PREFIX_OCR, "051", f"[OCR Motoru Aktivasyonu] -> AKTİVASYON BAŞARISIZ | Motor Referansı Yok: {engine_id}", level="error")
            return False
        if self.ocr_engine.is_ready():
            log_event(PREFIX_OCR, "054", f"[OCR Motoru Aktivasyonu] -> ATLANDI | Zaten Hazır: {engine_id}")
            return True
        started = self.ocr_engine.start()
        log_event(
            PREFIX_OCR,
            "055",
            (
                "Engine activation result: "
                f"engine={engine_id}, started={started}, ready={self.ocr_engine.is_ready()}, "
                f"start_error={getattr(self.ocr_engine, 'start_error', None)!r}"
            ),
            level="info" if started else "error",
        )
        return started
    def _runtime_engine_id(self) -> str:
        return self.active_engine

    def _notify_runtime_engine_fallback(self, runtime_engine: str) -> None:
        if runtime_engine == self.active_engine:
            return
        self.bridge.send(
            "ocr_engine_runtime_fallback",
            {
                "selected": self.active_engine,
                "runtime": runtime_engine,
                "scene_mode": self.ocr_scene_mode,
            },
        )




    def _take_latest_frame(self) -> tuple[int, np.ndarray, dict | None, dict | None] | None:
        if self._latest_frame is None or self._latest_frame_id <= 0:
            return None
        return (
            self._latest_frame_id,
            self._latest_frame,  # Remove .copy() to save memory
            dict(self._latest_resolved_region) if isinstance(self._latest_resolved_region, dict) else None,
            dict(self._latest_capture_probe) if isinstance(self._latest_capture_probe, dict) else None,
        )

    def _read_fast_then_refine(self, frame: np.ndarray, frame_id: int) -> dict | None:
        if self.ocr_engine is None:
            log_event(PREFIX_OCR, "057", f"[OCR İşlemi] -> ATLANDI | Neden: Motor Yok | Çerçeve ID: {frame_id}", level="warning")
            return None

        detected_scene_mode, scene_scores, variants = self.image_processor.process_variants(frame, self.ocr_scene_mode, self.ocr_filters_enabled)
        self.overlay_publisher._log_ocr(
            "004",
            (
                f"Candidate prep: frame_id={frame_id}, engine={self.active_engine}, "
                f"detected_scene_mode={detected_scene_mode}, candidate_count={len(variants)}, "
                f"scene_scores={scene_scores}"
            ),
        )
        if not variants:
            log_event(
                PREFIX_OCR,
                "057",
                (
                    f"OCR read skipped: frame_id={frame_id}, reason=no_variants, "
                    f"scene_mode={self.ocr_scene_mode}, filters={self.ocr_filters_enabled}, scene_scores={scene_scores}"
                ),
                level="warning",
                throttle_key="ocr_no_variants",
                throttle_seconds=1.0,
            )
            return None

        fast_pass_budget = min(len(variants), self._fast_pass_budget())
        best_payload: dict | None = None

        for index in range(fast_pass_budget):
            payload = self._read_variant(frame, frame_id, variants[index], detected_scene_mode, scene_scores)
            if payload and self._is_better_payload(payload, best_payload):
                best_payload = payload
                self.overlay_publisher._log_ocr(
                    "005",
                    (
                        f"Candidate update: frame_id={frame_id}, phase=fast, selected_variant={payload['variant']}, "
                        f"quality={payload['quality']}, signal={payload['signal']:.2f}, scene_fit={payload['scene_fit']:.2f}"
                    ),
                )
            if payload and self._is_fast_accept(payload):
                self.overlay_publisher._log_ocr(
                    "006",
                    (
                        f"Candidate selected: frame_id={frame_id}, phase=fast_accept, variant={payload['variant']}, "
                        f"reason=fast_accept, quality={payload['quality']}, signal={payload['signal']:.2f}, "
                        f"scene_fit={payload['scene_fit']:.2f}"
                    ),
                )
                return payload

        if self._should_skip_refine(frame_id, best_payload):
            if best_payload is not None:
                self.overlay_publisher._log_ocr(
                    "007",
                    (
                        f"Candidate selected: frame_id={frame_id}, phase=skip_refine, variant={best_payload['variant']}, "
                        f"reason=skip_refine, quality={best_payload['quality']}, signal={best_payload['signal']:.2f}, "
                        f"scene_fit={best_payload['scene_fit']:.2f}"
                    ),
                )
            return best_payload

        refine_budget = min(len(variants), self._variant_budget())
        for index in range(fast_pass_budget, refine_budget):
            if self._latest_frame_id != frame_id and best_payload is not None and self._is_subtitle_active():
                break
            payload = self._read_variant(frame, frame_id, variants[index], detected_scene_mode, scene_scores)
            if payload and self._is_better_payload(payload, best_payload):
                best_payload = payload
                self.overlay_publisher._log_ocr(
                    "008",
                    (
                        f"Candidate update: frame_id={frame_id}, phase=refine, selected_variant={payload['variant']}, "
                        f"quality={payload['quality']}, signal={payload['signal']:.2f}, scene_fit={payload['scene_fit']:.2f}"
                    ),
                )
            if payload and self._is_fast_accept(payload):
                self.overlay_publisher._log_ocr(
                    "009",
                    (
                        f"Candidate selected: frame_id={frame_id}, phase=refine_fast_accept, variant={payload['variant']}, "
                        f"reason=fast_accept, quality={payload['quality']}, signal={payload['signal']:.2f}, "
                        f"scene_fit={payload['scene_fit']:.2f}"
                    ),
                )
                return payload
        if best_payload is not None:
            self.overlay_publisher._log_ocr(
                "010",
                (
                    f"Candidate selected: frame_id={frame_id}, phase=final, variant={best_payload['variant']}, "
                    f"reason=best_available, quality={best_payload['quality']}, signal={best_payload['signal']:.2f}, "
                    f"scene_fit={best_payload['scene_fit']:.2f}"
                ),
            )
        return best_payload

    def _read_variant(
        self,
        frame: np.ndarray,
        frame_id: int,
        variant: tuple[str, np.ndarray, int],
        detected_scene_mode: str,
        scene_scores: dict[str, float],
    ) -> dict | None:
        variant_label, processed_frame, _ = variant
        ocr_frame = processed_frame
        if getattr(processed_frame, "ndim", 0) == 2:
            ocr_frame = np.stack([processed_frame] * 3, axis=-1)
        ocr_results = self.ocr_engine.read(cast(np.ndarray, ocr_frame))
        if not ocr_results:
            self.overlay_publisher._log_ocr(
                "011",
                f"OCR result: frame_id={frame_id}, variant={variant_label}, engine={self.active_engine}, result_count=0",
            )
            return None
        raw_texts = [str(item[1]) for item in ocr_results if len(item) >= 2]
        avg_confidence = self._result_signal(ocr_results)
        self.overlay_publisher._log_ocr(
            "011",
            (
                f"OCR result: frame_id={frame_id}, variant={variant_label}, engine={self.active_engine}, "
                f"result_count={len(ocr_results)}, confidence={avg_confidence:.2f}, raw_texts={raw_texts!r}"
            ),
        )
        detected_text = self._build_detected_text(ocr_results)
        if not detected_text:
            self.overlay_publisher._log_ocr(
                "012",
                f"Text assembly result: frame_id={frame_id}, variant={variant_label}, text=''",
            )
            return None
        self.overlay_publisher._log_ocr(
            "012",
            f"Text assembly result: frame_id={frame_id}, variant={variant_label}, text={detected_text!r}",
        )

        scene_mode = variant_label.split(":", 1)[0]
        return {
            "variant": variant_label,
            "scene_mode": scene_mode,
            "detected_scene_mode": detected_scene_mode,
            "processed": processed_frame,
            "text": detected_text,
            "quality": TextQualityScorer.score(detected_text),
            "result_count": len(ocr_results),
            "signal": avg_confidence,
            "scene_fit": scene_scores.get(scene_mode, 0.45),
        }

    def _fast_pass_budget(self) -> int:
        if self.performance_tier == "maximum":
            return 2 if self._is_subtitle_active() else 1
        return 1

    def _should_skip_refine(self, frame_id: int, payload: dict | None) -> bool:
        if payload is None:
            return False
        quality_score = int(payload["quality"])
        scene_fit = float(payload.get("scene_fit", 0.45))
        if self._latest_frame_id != frame_id and self._is_subtitle_active():
            return True
        if self._is_subtitle_active() and quality_score >= max(self.quality_threshold - 8, 32) and scene_fit >= self.scene_fit_threshold:
            return True
        return quality_score >= max(self.quality_threshold - 2, 38) and scene_fit >= min(0.9, self.scene_fit_threshold + 0.10)

    def _is_fast_accept(self, payload: dict) -> bool:
        quality_score = int(payload["quality"])
        scene_fit = float(payload.get("scene_fit", 0.45))
        text_length = len(str(payload["text"]).strip())
        if self._is_subtitle_active():
            return (
                quality_score >= max(self.quality_threshold - int(self._profile_value("active_quality_relax", 8)), int(self._profile_value("fast_quality_floor", 30)))
                and scene_fit >= self.scene_fit_threshold
                and text_length <= int(self._profile_value("fast_text_len", 12)) + 6
            )
        return quality_score >= max(self.quality_threshold + 8, 58) and scene_fit >= min(0.85, self.scene_fit_threshold + 0.08)

    def _is_better_payload(self, candidate: dict, current: dict | None) -> bool:
        if current is None:
            return True
        candidate_key = (
            int(candidate["quality"]),
            float(candidate.get("scene_fit", 0.45)),
            float(candidate["signal"]),
            len(str(candidate["text"])),
            int(candidate["result_count"]),
        )
        current_key = (
            int(current["quality"]),
            float(current.get("scene_fit", 0.45)),
            float(current["signal"]),
            len(str(current["text"])),
            int(current["result_count"]),
        )
        return candidate_key > current_key

    def _result_signal(self, ocr_results: list[tuple]) -> float:
        confidences = [float(item[2]) for item in ocr_results if len(item) >= 3 and isinstance(item[2], (int, float))]
        if not confidences:
            return 42.0
        return sum(confidences) / len(confidences)

    def _build_detected_text(self, ocr_results: list[tuple]) -> str:
        return build_detected_text(ocr_results, self.ocr_scene_mode, self.target_region)


    def _evaluate_tip2_best_variant_gate(self, analysis: dict[str, object]) -> dict[str, object]:
        health = int(analysis.get("health_score", 0))
        suspicious = int(analysis.get("suspicious_tokens", 0))
        broken = int(analysis.get("broken_token_count", 0))
        connected_noise = int(analysis.get("connected_noise_runs", 0))
        recognized_ratio = float(analysis.get("recognized_ratio", 0.0))
        unknown_long = int(analysis.get("unknown_long_alpha_count", 0))
        speaker_prefix_suspicious = bool(analysis.get("speaker_prefix_suspicious", False))
        joined_hits = list(analysis.get("joined_word_hits", []))
        merged_hits = list(analysis.get("merged_token_hits", []))
        minor_merge_hits = list(analysis.get("minor_merge_hits", []))
        tail_broken = list(analysis.get("tail_broken_tokens", []))

        if speaker_prefix_suspicious and broken >= 1:
            return {"would_emit": False, "reason": "speaker_prefix_corruption"}
        if merged_hits and recognized_ratio < 0.45:
            return {"would_emit": False, "reason": "merged_token_low_ratio"}
        if unknown_long >= 2 and recognized_ratio < 0.42 and broken >= 1:
            return {"would_emit": False, "reason": "unknown_long_token_cluster"}
        if unknown_long >= 2 and recognized_ratio < 0.20:
            return {"would_emit": False, "reason": "very_low_recognition_long_text"}
        if minor_merge_hits and recognized_ratio < 0.68 and unknown_long >= 2:
            return {"would_emit": False, "reason": "minor_merge_cluster"}
        if unknown_long >= 1 and recognized_ratio < 0.40 and (broken >= 1 or merged_hits):
            return {"would_emit": False, "reason": "unknown_long_low_ratio"}
        if recognized_ratio < 0.34 and broken >= 1:
            return {"would_emit": False, "reason": "low_recognized_ratio"}
        if health >= 86 and suspicious <= 1 and broken <= 1 and connected_noise == 0 and unknown_long == 0 and not merged_hits and not minor_merge_hits:
            return {"would_emit": True, "reason": "healthy_best_variant"}
        if health < 78 and broken >= 2:
            return {"would_emit": False, "reason": "low_health_with_broken_tokens"}
        if health < 70:
            return {"would_emit": False, "reason": "low_health"}
        if connected_noise >= 2:
            return {"would_emit": False, "reason": "connected_noise_heavy"}
        if broken >= 3:
            return {"would_emit": False, "reason": "broken_token_heavy"}
        if suspicious >= 2 and broken >= 2:
            return {"would_emit": False, "reason": "suspicious_broken_combo"}
        if len(joined_hits) >= 2 and len(tail_broken) >= 1:
            return {"would_emit": False, "reason": "joined_tail_combo"}
        return {"would_emit": True, "reason": "soft_pass"}

    def _should_skip_regressive_emit(self, stabilized_text: str) -> bool:
        if not self.last_text or not self._is_subtitle_active():
            return False
        if time.monotonic() - self._last_emit_time > 1.4:
            return False
        previous = re.sub(r"\W+", " ", self.last_text.lower()).strip()
        current = re.sub(r"\W+", " ", stabilized_text.lower()).strip()
        if not previous or not current or current == previous:
            return False
        if current in previous and len(current) + 6 < len(previous):
            return True
        if previous in current:
            return False
        overlap = SequenceMatcher(a=previous, b=current).ratio()
        return len(current) < len(previous) * 0.58 and overlap < 0.55

    def _should_skip_reused_frame_reprocess(self, min_slot_samples: int) -> bool:
        sample_count = self.slot_manager.get_sample_count()
        if sample_count < min_slot_samples:
            return False
        if not self.last_text:
            return False
        last_analysis = JunkFilter.analyze_text(self.last_text)
        if (
            bool(last_analysis.get("tip2_suspect"))
            and int(last_analysis.get("broken_token_count", 0)) >= 1
            and (
                bool(last_analysis.get("speaker_prefix_suspicious"))
                or int(last_analysis.get("unknown_long_alpha_count", 0)) >= 2
                or float(last_analysis.get("recognized_ratio", 0.0)) < 0.42
            )
        ):
            return True
        state = getattr(self.source_state, "state", "")
        if state != "SLEEPING":
            return False
        last_detected_norm = _quick_normalize(self.last_detected_text)
        last_emitted_norm = _quick_normalize(self.last_text)
        if not last_detected_norm or not last_emitted_norm:
            return False
        return last_detected_norm == last_emitted_norm








    def _should_skip_family_repeat(self, stabilized_text: str) -> bool:
        if not self._last_emitted_source_text:
            return False
        hold_window_ms = int(self._profile_value("source_family_hold_ms", 1600))
        within_window = (time.monotonic() - self._last_emitted_source_time) * 1000 < hold_window_ms
        if not within_window:
            return False
        current_normalized = re.sub(r"\s+", " ", _strip_speaker(stabilized_text).lower()).strip()
        last_normalized = re.sub(r"\s+", " ", _strip_speaker(self._last_emitted_source_text).lower()).strip()
        if not current_normalized or not last_normalized:
            return False
        if current_normalized == last_normalized:
            return True
        shorter = min(len(current_normalized), len(last_normalized))
        if shorter >= 80:
            threshold = 0.68
        elif shorter >= 48:
            threshold = 0.72
        elif shorter >= 24:
            threshold = 0.78
        else:
            threshold = 0.82
        similarity = SequenceMatcher(a=last_normalized, b=current_normalized).ratio()
        if similarity < threshold:
            return False
        current_analysis = JunkFilter.analyze_text(stabilized_text)
        last_analysis = JunkFilter.analyze_text(self._last_emitted_source_text)
        current_health = int(current_analysis["health_score"])
        last_health = int(last_analysis["health_score"])
        current_recognized = int(current_analysis["recognized_count"])
        last_recognized = int(last_analysis["recognized_count"])
        current_mojibake = int(current_analysis["mojibake_count"])
        last_mojibake = int(last_analysis["mojibake_count"])
        current_suspicious = int(current_analysis["suspicious_tokens"])
        last_suspicious = int(last_analysis["suspicious_tokens"])
        if (
            current_health + 10 < last_health
            and current_recognized <= last_recognized
            and (current_mojibake > last_mojibake or current_suspicious > last_suspicious)
        ):
            self.overlay_publisher._log_ocr(
                "025",
                (
                    f"Family repeat blocked: reason=dirtier_variant, similarity={similarity:.2f}, "
                    f"current_health={current_health}, last_health={last_health}, "
                    f"current_text={stabilized_text!r}, last_text={self._last_emitted_source_text!r}"
                ),
            )
            return True
        if (
            current_health >= last_health + 12
            and current_recognized > last_recognized
            and len(current_normalized) >= len(last_normalized) - 4
        ):
            return False
        if self._is_meaningful_source_upgrade(current_normalized, last_normalized):
            return False
        return True

    def _is_meaningful_source_upgrade(self, current_normalized: str, last_normalized: str) -> bool:
        if not current_normalized or not last_normalized:
            return False
        if current_normalized == last_normalized:
            return False
        if current_normalized in last_normalized:
            return False
        if last_normalized in current_normalized:
            return len(current_normalized) >= len(last_normalized) + 8
        return len(current_normalized) >= len(last_normalized) + 12

    def _should_keep_stale_translation(self, translated_source_text: str) -> bool:
        latest_text = re.sub(r"\s+", " ", str(self.last_text or "").strip())
        if not latest_text:
            return False
        norm_translated = re.sub(r"\s+", " ", translated_source_text.strip().lower())
        norm_latest = re.sub(r"\s+", " ", latest_text.lower())
        if norm_translated == norm_latest:
            return True
        shorter = min(norm_translated, norm_latest, key=len)
        longer = max(norm_translated, norm_latest, key=len)
        if shorter and shorter in longer and len(shorter) >= len(longer) * 0.7:
            return True
        return False

    def _stabilize_text(self, detected_text: str, quality_score: int, repeated_frame: bool = False) -> str | None:
        cleaned = detected_text.strip()
        if not cleaned:
            return None
        line_count = max(1, cleaned.count("\n") + 1)
        if self.calibration_profile_active:
            base_min_samples = self._effective_stabilizer_min_samples()
            min_samples = base_min_samples
            if line_count >= 2:
                min_samples = max(min_samples, 3 if line_count == 2 else 4)
            return self.stabilizer.push(cleaned, min_samples=min_samples)

        text_length = len(cleaned)
        active_subtitle_mode = self._is_subtitle_active()
        fast_text_len = int(self._profile_value("fast_text_len", 12))
        fast_quality_floor = int(self._profile_value("fast_quality_floor", 30))
        active_quality_relax = int(self._profile_value("active_quality_relax", 8))
        base_min_samples = self._effective_stabilizer_min_samples()
        sentence_like = bool(re.search(r"[:.!?…]$", cleaned))

        if line_count == 1 and active_subtitle_mode and repeated_frame and text_length <= fast_text_len and quality_score >= max(self.quality_threshold - active_quality_relax, fast_quality_floor):
            return self.stabilizer.push(cleaned, min_samples=1, force=True)
        if line_count == 1 and text_length <= 8 and repeated_frame and sentence_like and quality_score >= max(self.quality_threshold - 4, 38):
            return self.stabilizer.push(cleaned, min_samples=1, force=True)
        if line_count == 1 and text_length <= 12 and repeated_frame and sentence_like and quality_score >= max(self.quality_threshold - 8, 30):
            return self.stabilizer.push(cleaned, min_samples=1, force=True)
        if line_count == 1 and quality_score >= max(self.quality_threshold + 22, 62):
            return self.stabilizer.push(cleaned, min_samples=1, force=True)
        if text_length <= 12:
            min_samples = 1 if repeated_frame and quality_score >= max(self.quality_threshold - 14, 22) else base_min_samples
            if line_count >= 2:
                min_samples = max(min_samples, 3 if line_count == 2 else 4)
            return self.stabilizer.push(cleaned, min_samples=min_samples)
        if repeated_frame and quality_score >= max(self.quality_threshold - 4, 34):
            min_samples = base_min_samples
            if line_count >= 2:
                min_samples = max(min_samples, 3 if line_count == 2 else 4)
            return self.stabilizer.push(cleaned, min_samples=min_samples)
        min_samples = base_min_samples
        if line_count >= 2:
            min_samples = max(min_samples, 3 if line_count == 2 else 4)
        return self.stabilizer.push(cleaned, min_samples=min_samples)

    def _should_drop_for_quality(self, text: str, quality_score: int) -> bool:
        threshold, reason = self._quality_gate_context(text, quality_score)
        return quality_score < threshold

    def _quality_gate_breakdown(self, text: str) -> str:
        stripped = text.strip()
        length = len(stripped)
        base = self.quality_threshold
        parts = [f"base={base}", f"len={length}"]
        if self.calibration_profile_active:
            parts.append("mode=calibration")
            return ", ".join(parts)
        if self._is_subtitle_active():
            active_relax = int(self._profile_value("active_quality_relax", 8))
            parts.append(f"subtitle_active_relax=-{active_relax}")
        if length <= 4:
            parts.append("length_bucket<=4")
        elif length <= 6:
            parts.append("length_bucket<=6")
        elif length <= 12:
            parts.append("length_bucket<=12")
        elif length <= 20:
            parts.append("length_bucket<=20")
        else:
            parts.append("length_bucket>20")
        return ", ".join(parts)

    def _quality_gate_context(self, text: str, quality_score: int) -> tuple[int, str]:
        stripped = text.strip()
        length = len(stripped)
        threshold = self.quality_threshold
        if self.calibration_profile_active:
            return threshold, 'calibration_profile'
        if self._is_subtitle_active():
            threshold = max(18, threshold - int(self._profile_value("active_quality_relax", 8)))
        if length <= 4:
            threshold = max(18, self.quality_threshold - 22)
        elif length <= 6:
            threshold = max(22, self.quality_threshold - 18)
        elif length <= 12:
            threshold = max(26, self.quality_threshold - 14)
        elif length <= 20:
            threshold = max(34, self.quality_threshold - 6)
        return threshold, "threshold_compare"

    def _frame_hash(self, frame: np.ndarray) -> bytes:
        return cv2.resize(frame, (32, 16), interpolation=cv2.INTER_NEAREST).tobytes()

    def _mark_subtitle_activity(self, duration: float = 0.9) -> None:
        self._subtitle_active_until = max(self._subtitle_active_until, time.monotonic() + duration)

    def _capture_delay(self) -> float:
        base_delay = min(self.loop_interval, float(self._profile_value("active_target_ms", 60)) / 1000) if self._is_subtitle_active() else self.loop_interval
        repeated = int(self._reused_frame_count)
        if repeated <= 0:
            return base_delay
        if self.raw_translation_flow_enabled:
            ceiling = max(base_delay, 0.18)
            extra_delay = min(0.12, repeated * 0.012)
        elif self._is_subtitle_active():
            ceiling = max(base_delay, 0.24)
            extra_delay = min(0.16, repeated * 0.015)
        else:
            ceiling = max(base_delay, 0.65)
            extra_delay = min(0.45, repeated * 0.035)
        return min(ceiling, base_delay + extra_delay)

    def _required_slot_samples(self, text: str, quality_score: int) -> int:
        required = max(
            self.slot_manager.get_required_samples(),
            int(self._profile_value("min_slot_samples", 1)),
            self.stabilizer_min_samples,
        )
        text_len = len(str(text or "").strip())
        if (
            not self.raw_translation_flow_enabled
            and self.ocr_scene_mode == "floating"
            and self.active_engine == "winonly"
            and quality_score >= 92
            and text_len >= 120
        ):
            return min(required, 2)
        return required

    def _is_subtitle_active(self) -> bool:
        return time.monotonic() < self._subtitle_active_until

    def _variant_budget(self) -> int:
        if self.variant_budget_override is not None:
            return self.variant_budget_override
        if self._is_subtitle_active():
            return int(self._profile_value("active_variant_budget", 2))
        return int(self._profile_value("variant_budget", 4))

    def _profile_value(self, key: str, default):
        tier = get_performance_tier_profile(self._runtime_engine_id(), self.performance_tier, self.translation_engine)
        return tier.get(key, default)


    def _normalize_translated_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", str(text or "").strip()).lower()

    def _should_skip_translated_emit(self, translated_text: str, source: str = "") -> bool:
        normalized = self._normalize_translated_text(translated_text)
        if not normalized or not self._last_translated_text:
            return False
        repeat_window_ms = int(self._profile_value("translated_repeat_window_ms", 220))
        if self.raw_translation_flow_enabled:
            repeat_window_ms = max(repeat_window_ms, 1200)
        elif "offline" in str(source or "").lower():
            return False
        within_window = (time.monotonic() - self._last_translated_emit_time) * 1000 < repeat_window_ms
        if not within_window:
            return False
        if normalized == self._last_translated_text:
            return True
        return False

    def _should_skip_raw_source_repeat(self, text: str) -> bool:
        normalized = self._normalize_translated_text(text)
        if not normalized:
            return False
        now = time.monotonic()
        if self._last_raw_source_text == normalized and (now - self._last_raw_source_time) * 1000 < 900:
            return True
        if self._pending_translations:
            pending_normalized = self._normalize_translated_text(self._pending_translations[-1][0])
            if pending_normalized == normalized:
                return True
        if self._active_translation_source and self._normalize_translated_text(self._active_translation_source) == normalized:
            return True
        return False
    def _effective_min_text_chars(self) -> int:
        return self.min_text_chars

    def _effective_stabilizer_min_samples(self) -> int:
        return self.stabilizer_min_samples

    def _normalize_source_language(self, source_language: str | None) -> str:
        return "en" if str(source_language or "").strip().lower() == "en" else "auto"

    def _normalize_target_language(self, target_language: str | None) -> str:
        return "en" if str(target_language or "").strip().lower() == "en" else "tr"

    def _configure_ocr_source_profiles(self) -> None:
        normalized = self._normalize_source_language(self.src_language)
        for engine in self._engine_instances.values():
            engine.configure_source_language(normalized)
        if normalized == "auto":
            log_event(
                PREFIX_CFG,
                "015",
                "Kaynak dili otomatik profil aktif: easy=en+ru, winonly=en->ru fallback.",
                throttle_key="source_auto_profile",
                throttle_seconds=1.0,
            )






    def _reset_runtime_state(self, clear_stabilizer: bool) -> None:
        self.last_text = ""
        self.last_detected_text = ""
        self.last_detected_quality = 0
        self._last_frame_hash = b""
        self._last_emit_time = 0.0
        self._last_translated_text = ""
        self._last_translated_emit_time = 0.0
        self._last_emitted_source_text = ""
        self._last_emitted_source_time = 0.0
        self._last_raw_source_text = ""
        self._last_raw_source_time = 0.0
        self._subtitle_active_until = 0.0
        self._reused_frame_count = 0
        self._ocr_candidate_history.clear()
        self._last_merge_confidence = 0.0
        self.source_state.reset()
        if clear_stabilizer:
            self.stabilizer.reset()
            self.slot_manager.reset()

    def _effective_capture_region(self) -> dict:
        """Sahne moduna gore yakalama bolgesini sec.
        Mevcut uygulamada capture katmani sade tutulur:
        - striped : kullanicinin secili runtime bolgesi
        - floating: kullanicinin secili runtime bolgesi

        OCR farki daha cok isleme / varyant / preset tarafinda olusur.
        """
        return self.target_region


    def _normalize_ocr_text(self, text: str) -> str:
        cleaned = unicodedata.normalize("NFKC", text).strip()
        cleaned = cleaned.replace("．．．", "…").replace("...", "…")
        cleaned = re.sub(r"(?:(?<=\s)|^)[\[\]!](?=\s+[A-Za-z])", "I", cleaned)
        bar_chars = r"[|¦ǀ∣❘⎪]"
        cleaned = re.sub(rf"(?<=[a-zçğıöşü]){bar_chars}+(?=[a-zçğıöşü])", "ı", cleaned)
        cleaned = re.sub(rf"{bar_chars}+", "I", cleaned)
        cleaned = re.sub(r"[`´‘’]+", "'", cleaned)
        cleaned = re.sub(r'[“”]+', '"', cleaned)
        cleaned = re.sub(r"[_~]{2,}", " ", cleaned)
        cleaned = re.sub(r"([^\w\s.,!?'\-:;/%])\1{1,}", r"\1", cleaned, flags=re.UNICODE)
        cleaned = re.sub(r"(?<=[A-Za-z0-9])[;:](?=$)", ".", cleaned)
        cleaned = re.sub(r"(?<=[A-Za-z])'\s*\$(?=\s*[A-Za-z])", "'s ", cleaned)
        cleaned = re.sub(r"'s\s+", "'s ", cleaned)
        cleaned = re.sub(r"(?<=[A-Za-z])\$(?=[A-Za-z])", "s", cleaned)
        cleaned = re.sub(r"(?<=[A-Za-z])\$\b", "s", cleaned)
        cleaned = re.sub(r"\b([Tt]hat|[Ii]t|[Ww]hat|[Ww]ho|[Tt]here|[Hh]ere)'\$", r"\1's", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_|~")
        return cleaned

    def _score_ocr_candidate(self, result: tuple, text: str) -> float:
        confidence = 0.6
        if len(result) >= 3 and isinstance(result[2], (int, float)):
            confidence = max(0.0, min(1.0, float(result[2]) / 100.0))

        bbox = result[0] if len(result) > 0 else None
        vertical_score = 0.82
        vertical_anchor = 0.50 if self.ocr_scene_mode == "floating" else 0.72
        center_y: float | None = None
        if isinstance(bbox, tuple) and len(bbox) == 4:
            _, y, _, h = bbox
            center_y = float(y) + float(h) / 2
        elif isinstance(bbox, list) and bbox:
            ys = [float(p[1]) for p in bbox if isinstance(p, (list, tuple)) and len(p) >= 2]
            if ys:
                center_y = (min(ys) + max(ys)) / 2
        if center_y is not None:
            relative_y = center_y / max(float(self.target_region.get("height", 1)), 1.0)
            vertical_score = max(0.35, 1.0 - abs(relative_y - vertical_anchor) * 0.9)

        length = len(text)
        length_score = 1.0 if 8 <= length <= 140 else 0.9 if 4 <= length <= 220 else 0.58
        dialogue_bonus = 0.12 if re.search(r"[:.!?…]$", text) else 0.0
        return confidence * 0.45 + vertical_score * 0.4 + length_score * 0.15 + dialogue_bonus

    def _extract_candidate_position(self, text: str, ocr_results: list[tuple]) -> tuple[float, float]:
        for result in ocr_results:
            if len(result) < 2 or self._normalize_ocr_text(cast(str, result[1])) != text:
                continue
            bbox = result[0]
            if isinstance(bbox, tuple) and len(bbox) == 4:
                x, y, _, _ = bbox
                return float(y), float(x)
            if isinstance(bbox, list) and bbox:
                xs = [float(point[0]) for point in bbox if isinstance(point, (list, tuple)) and len(point) >= 2]
                ys = [float(point[1]) for point in bbox if isinstance(point, (list, tuple)) and len(point) >= 2]
                if xs and ys:
                    return min(ys), min(xs)
        return (9999.0, 9999.0)

    def _score_candidate_completeness(self, text: str) -> float:
        compact = re.sub(r"\s+", " ", str(text or "").strip())
        if not compact:
            return -1.0
        alpha_count = sum(char.isalpha() for char in compact)
        digit_count = sum(char.isdigit() for char in compact)
        punctuation_count = sum((not char.isalnum()) and (not char.isspace()) for char in compact)
        alpha_ratio = alpha_count / max(len(compact), 1)
        digit_ratio = digit_count / max(len(compact), 1)
        punctuation_ratio = punctuation_count / max(len(compact), 1)
        score = 0.0
        if re.match(r"^[A-Z][A-Z0-9 .'-]{1,24}:", compact):
            score += 0.24
        if len(compact) >= 20:
            score += min(0.22, len(compact) / 240.0)
        if compact.endswith((".", "!", "?", "…", ":")):
            score += 0.12
        if alpha_ratio >= 0.55:
            score += 0.18
        if digit_ratio > 0.18:
            score -= 0.22
        if punctuation_ratio > 0.28:
            score -= 0.16
        if re.search(r"\b(?:SKIP|LOADING)\b", compact, flags=re.IGNORECASE):
            score -= 0.30
        return score

    def shutdown(self) -> None:
        self.is_running = False
        try:
            if hasattr(self.offline_translator, "unload_runtime"):
                self.offline_translator.unload_runtime()
        except Exception as exc:
            self.logger.error(f"[{PREFIX_SYS}-099] [Sistem Kapatma] -> OFFLINE TEMİZLİK HATASI | Detay: {exc}")


