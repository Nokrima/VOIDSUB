import base64
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
import numpy as np
import cv2

from core.errors import get_logger
from core.debug.preview_config_img import ConfigurableImageProcessor

logger = get_logger()


def numpy_to_base64(img: np.ndarray) -> str:
    """Numpy goruntusunu PNG base64 formatina cevirir."""
    if not isinstance(img, np.ndarray) or img.size == 0:
        return ""
    if img.ndim == 2:
        encode_img = img
    else:
        encode_img = img
    ok, buffer = cv2.imencode(".png", encode_img)
    if not ok:
        return ""
    return base64.b64encode(buffer.tobytes()).decode("utf-8")


class PreviewHandler:
    """Canli kalibrasyon arayuzu icin anlik ekran goruntusunu isleyen sinif."""

    def __init__(self, recorder: Any):
        self.recorder = recorder
        self.bridge = recorder.bridge

    def select_region(self) -> None:
        """Kullanicidan bir tarama alani secmesini ister."""
        asyncio.create_task(self._select_region_async())

    async def _select_region_async(self) -> None:
        try:
            exe = sys.executable
            script = Path(__file__).resolve().parents[1] / "native_region_selector.py"
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

            def run_subprocess():
                return subprocess.run(
                    [exe, str(script)],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    creationflags=flags,
                    timeout=120,
                )

            result = await asyncio.to_thread(run_subprocess)
            stdout = (result.stdout or "").strip().splitlines()
            payload = json.loads(stdout[-1]) if stdout else {}

            region = payload.get("region")
            if isinstance(region, dict):
                pipeline = getattr(self.bridge, "worker", None)
                if not pipeline:
                    logger.error("[DBG-010] Pipeline not available for capture.")
                    self.bridge.send(
                        "calibration_region_failed",
                        {"message": "Çeviri motoru hazır değil."},
                    )
                    return
                frame = await asyncio.to_thread(
                    pipeline.capturer.capture_region, region
                )
                if frame is None:
                    logger.error("[DBG-010] Failed to capture region frame.")
                    self.bridge.send(
                        "calibration_region_failed",
                        {
                            "message": "Ekran yakalanamadı. Lütfen modülleri kontrol edin (Örn: winrt paketi bozuk)."
                        },
                    )
                    return
                self.recorder.preview_region = region
                self.recorder.preview_frame = frame
                if hasattr(self.bridge, "persist_calibration_region"):
                    self.bridge.persist_calibration_region(region, frame)
                self.bridge.send(
                    "calibration_region_selected",
                    {
                        "x1": region.get("left", 0),
                        "y1": region.get("top", 0),
                        "x2": region.get("left", 0) + region.get("width", 0),
                        "y2": region.get("top", 0) + region.get("height", 0),
                        "preview_image": numpy_to_base64(frame),
                    },
                )
                return
            if payload.get("cancelled"):
                self.bridge.send(
                    "calibration_region_cancelled",
                    {
                        "message": "Kalibrasyon alanı seçimi iptal edildi.",
                    },
                )
                return
            self.bridge.send(
                "calibration_region_failed",
                {
                    "message": "Kalibrasyon alanı seçimi tamamlanamadı.",
                },
            )
        except Exception as exc:
            logger.error(f"[DBG-010] Region error: {exc}", exc_info=True)
            self.bridge.send(
                "calibration_region_failed",
                {
                    "message": f"Kalibrasyon alanı seçimi başlatılamadı: {exc}",
                },
            )

    def sync_region(self, region: dict) -> None:
        """Verilen bir bölgeyi kalibrasyon için eşitler ve anlık kare yakalar."""
        asyncio.create_task(self._sync_region_async(region))

    async def _sync_region_async(self, region: dict) -> None:
        try:
            pipeline = getattr(self.bridge, "worker", None)
            if not pipeline:
                return
            frame = await asyncio.to_thread(pipeline.capturer.capture_region, region)
            if frame is None:
                return
            self.recorder.preview_region = region
            self.recorder.preview_frame = frame
            if hasattr(self.bridge, "persist_calibration_region"):
                self.bridge.persist_calibration_region(region, frame)
            self.bridge.send(
                "calibration_region_selected",
                {
                    "x1": region.get("left", 0),
                    "y1": region.get("top", 0),
                    "x2": region.get("left", 0) + region.get("width", 0),
                    "y2": region.get("top", 0) + region.get("height", 0),
                    "preview_image": numpy_to_base64(frame),
                },
            )
        except Exception as exc:
            logger.error(f"[DBG-012] Sync region error: {exc}", exc_info=True)

    def request_preview(self, payload: dict) -> None:
        """Gonderilen config parametreleri ile anlik isleme uygular."""
        asyncio.create_task(self._request_preview_async(payload))

    async def _request_preview_async(self, payload: dict) -> None:
        if getattr(self.recorder, "preview_frame", None) is None:
            logger.warning("[DBG-011] No region frame to preview")
            return

        config = payload.get("config", {})
        pipeline = getattr(self.bridge, "worker", None)

        if not pipeline:
            self.bridge.send(
                "calibration_preview_result", {"error": "Pipeline hazir degil."}
            )
            return

        def _process() -> dict:
            started_at = time.perf_counter()
            frame = self.recorder.preview_frame
            scene_mode = str(
                payload.get("scene_mode")
                or getattr(pipeline, "ocr_scene_mode", "striped")
            )
            if scene_mode not in {"striped", "floating"}:
                scene_mode = "striped"
            img_proc = ConfigurableImageProcessor(config)

            filters_enabled = bool(
                payload.get(
                    "ocr_filters_enabled",
                    getattr(pipeline, "ocr_filters_enabled", True),
                )
            )
            if filters_enabled:
                processed_preview, _ = img_proc.process(frame, scene_mode)
            else:
                processed_preview = img_proc.prepare_raw(frame)

            d_mode, sc_scores, variants = img_proc.process_variants(
                frame, scene_mode, filters_enabled
            )
            engine_ready = bool(pipeline.ocr_engine and pipeline.ocr_engine.is_ready())
            if not engine_ready:
                return {
                    "decision": "rejected",
                    "rejection_reason": "ocr_engine_not_ready",
                    "quality_score": 0,
                    "detected_text": "",
                    "scene_mode": scene_mode,
                    "processed_image": numpy_to_base64(processed_preview),
                    "ham_kare": numpy_to_base64(frame),
                    "time_ms": (time.perf_counter() - started_at) * 1000,
                }
            if not variants:
                return {
                    "decision": "rejected",
                    "rejection_reason": "no_variants",
                    "quality_score": 0,
                    "detected_text": "",
                    "scene_mode": scene_mode,
                    "processed_image": numpy_to_base64(processed_preview),
                    "ham_kare": numpy_to_base64(frame),
                    "time_ms": (time.perf_counter() - started_at) * 1000,
                }

            best_payload = None
            preview_budget = max(
                1,
                int(
                    config.get(
                        "variant_budget",
                        getattr(pipeline, "variant_budget_override", None)
                        or pipeline._variant_budget(),
                    )
                ),
            )
            for index, variant in enumerate(variants[:preview_budget], start=1):
                variant_payload = pipeline._read_variant(
                    frame, index, variant, d_mode, sc_scores
                )
                if variant_payload and pipeline._is_better_payload(
                    variant_payload, best_payload
                ):
                    best_payload = variant_payload

            ocr_text = str(best_payload["text"]) if best_payload else ""

            from core.processor.quality import TextQualityScorer

            quality = TextQualityScorer.score(ocr_text)

            decision, reason = "accepted", None
            text_len = len(ocr_text.strip())
            if text_len < int(config.get("min_text_chars", 5)):
                decision, reason = "rejected", "min_text_chars"
            elif quality < int(config.get("quality_threshold", 40)):
                decision, reason = "rejected", "quality"

            return {
                "decision": decision,
                "rejection_reason": reason,
                "quality_score": quality,
                "detected_text": ocr_text,
                "scene_mode": scene_mode,
                "processed_image": numpy_to_base64(processed_preview),
                "ham_kare": numpy_to_base64(frame),
                "time_ms": (time.perf_counter() - started_at) * 1000,
            }

        try:
            result = await asyncio.to_thread(_process)
            self.bridge.send("calibration_preview_result", result)
        except Exception as exc:
            logger.error(f"[DBG-011] Preview hatasi: {exc}", exc_info=True)
            self.bridge.send("calibration_preview_result", {"error": str(exc)})
