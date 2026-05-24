"""session_recorder - OCR pipeline oturumunu kaydeder ve raporlar."""
from __future__ import annotations

import datetime
from typing import Any

from core.errors import PREFIX_SYS, get_logger
from debug.session_recorder_io import build_payload, encode_frame
from debug.session_recorder_config import ConfigPatcher

logger = get_logger()


class SessionRecorder:
    """Pipeline diagnostics.record metodunu gecici olarak yakalar ve kareleri UI'a akitir."""

    def __init__(self, bridge: Any) -> None:
        self.bridge = bridge
        self._original_record: Any = None
        self._pipeline: Any = None
        self._index_counter = 0
        self._active = False
        self.config_overrides = {}
        self._patcher = ConfigPatcher()
        self.preview_region = None
        self.preview_frame = None

        from debug.session_recorder_preview import PreviewHandler

        self._preview_handler = PreviewHandler(self)

    def select_region(self) -> None:
        self._preview_handler.select_region()

    def preview_request(self, payload: dict) -> None:
        self._preview_handler.request_preview(payload)

    def region_clear(self) -> None:
        self.preview_region = None
        self.preview_frame = None
        logger.info("[DBG-012] Preview region cleared.")

    def config_update(self, payload: dict) -> None:
        key = payload.get("key")
        value = payload.get("value")
        if not key or value is None:
            return
        self.config_overrides[key] = value
        logger.info(f"[DBG-001] Config override: {key}={value}")
        if self._active and self._pipeline:
            self._patcher.apply(self._pipeline, self.config_overrides)

    def config_reset(self) -> None:
        self.config_overrides.clear()
        if self._active and self._pipeline:
            self._patcher.restore(self._pipeline)
        logger.info("[DBG-002] Config overrides reset.")

    def start_session(self, pipeline: Any) -> None:
        if self._active:
            logger.warning(f"[{PREFIX_SYS}-801] Debug oturumu zaten devam ediyor, yoksayildi.")
            return
        self._pipeline = pipeline
        self._index_counter = 0
        self._original_record = pipeline.diagnostics.record
        pipeline.diagnostics.record = self._patched_record
        self._patcher.apply(pipeline, self.config_overrides)
        self._active = True
        logger.info(f"[{PREFIX_SYS}-800] Debug oturumu canli akis modunda baslatildi.")

    def stop_session(self) -> None:
        if not self._active:
            return
        self._active = False
        try:
            if self._pipeline is not None:
                self._patcher.restore(self._pipeline)
                if self._original_record is not None:
                    self._pipeline.diagnostics.record = self._original_record
            logger.info(f"[{PREFIX_SYS}-802] Debug oturumu tamamlandi.")
        except Exception as exc:
            logger.error(f"[{PREFIX_SYS}-803] Debug oturumu kapatma hatasi: {exc}")
        finally:
            self._original_record = None
            self._pipeline = None

    def _patched_record(
        self,
        decision: str,
        engine: str,
        scene_mode: str,
        raw_frame: Any,
        processed_frame: Any,
        text: str,
        quality: int,
        extra: dict | None = None,
    ) -> None:
        if self._original_record:
            self._original_record(decision, engine, scene_mode, raw_frame, processed_frame, text, quality, extra)

        if not self._active:
            return

        reason = (extra or {}).get("reason") if decision == "rejected" else None
        if reason is None and decision == "rejected":
            reason = "quality"

        event = {
            "index": self._index_counter,
            "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
            "decision": decision,
            "engine": engine,
            "scene_mode": scene_mode,
            "detected_text": text or "",
            "quality_score": int(quality),
            "rejection_reason": reason,
            "frame_image": encode_frame(raw_frame),
            "processed_image": encode_frame(processed_frame),
        }
        self._index_counter += 1

        payload = build_payload([event])
        self.bridge.send("debug_session_result", payload)
