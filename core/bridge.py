import asyncio
import json
import difflib
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

import websockets

from config.defaults import APP_VERSION, DEFAULT_READING_SPEED_CPS, SETTINGS_FILE, WEBSOCKET_HOST, WEBSOCKET_PORT
from core.errors import (
    PREFIX_CFG,
    PREFIX_SYS,
    PREFIX_TRL,
    get_logger,
    log_error,
    log_event,
    set_log_level,
)
from core.hardware import HardwareDetector
from core.debug.session_recorder import SessionRecorder
from core.processor.post_processor import chunk_for_display, clean_translation, estimate_display_chunk_size

logger = get_logger()
LEGACY_SETTINGS_FILE = Path(__file__).resolve().parent.parent / "config" / "settings.json"

def _clip_log_text(text: str, limit: int = 160) -> str:
    normalized = " ".join((text or "").split())
    return normalized if len(normalized) <= limit else f"{normalized[:limit]}..."

DEFAULT_SETTINGS = {
    "app": {
        "minimize_to_tray": False,
        "start_on_login": False,
        "restore_window_after_region_selection": True,
        "overlay_snap_to_region": True,
        "log_level": "error",
        "onboarding_completed": False,
        "ocr_engine": "easy",
        "translation_engine": "auto",
        "offline_model_key": "opus_mt_en_tr",
        "performance_tier": "standard",
        "ocr_filters_enabled": True,
        "raw_translation_flow_enabled": False,
        "ocr_scene_mode": "striped",
        "quality_threshold": 40,
        "min_text_chars": 5,
        "stabilizer_min_samples": 2,
        "scene_fit_threshold": 0.42,
        "variant_budget": 4,
        "clahe_clip_striped": 2.0,
        "clahe_clip_floating": 3.5,
        "bilateral_d": 9,
        "white_v_min": 110,
        "floating_gaussian_c": 8,
        "floating_mean_c": 6,
        "reading_speed_cps": DEFAULT_READING_SPEED_CPS,
        "last_region": None,
        "last_calibration_region": None,
        "src_language": "auto",
        "tgt_language": "tr",
        "active_calibration_profile_id": None,
        "custom_calibration_profiles": [],
        "shortcuts": {
            "start_stop": "F8",
            "select_region": "F9",
            "temporary_region": "F10",
            "hide_overlay": "F11",
        },
    },
    "overlay": {
        "mode": "fixed",
        "font_family": "Tahoma",
        "font_size": 18,
        "font_color": "#FDE68A",
        "font_bold": False,
        "alpha": 0.5,
        "bg_visible": True,
        "anim": "fade",
        "shadow": False,
    },
}

VALID_SOURCE_LANGUAGES = {"auto", "en", "tr"}
VALID_TARGET_LANGUAGES = {"tr", "en"}
VALID_OFFLINE_MODEL_KEYS = {"opus_mt_en_tr", "nllb"}
VALID_PROFILE_MODES = {"striped", "floating"}
VALID_PROFILE_BASE_TIERS = {"economy", "standard", "performance", "maximum"}
PROFILE_OVERLAY_KEYS = {"mode", "font_family", "font_size", "font_color", "font_bold", "alpha", "bg_visible", "anim", "shadow"}
PROFILE_APP_OVERRIDE_KEYS = {
    "minimize_to_tray",
    "log_level",
    "reading_speed_cps",
    "src_language",
    "tgt_language",
    "shortcuts",
    "restore_window_after_region_selection",
    "start_on_login",
}
PROFILE_SHORTCUT_KEYS = {"start_stop", "select_region", "hide_overlay", "temporary_region"}


class BridgeServer:
    def __init__(self, worker: Any = None, host: str = WEBSOCKET_HOST, port: int = WEBSOCKET_PORT):
        self.host = host
        self.port = port
        self.worker = worker
        self.native_overlay = None
        self.clients = set()
        self.scanner = HardwareDetector()
        self.loop = None
        self.shutdown_event: asyncio.Event | None = None
        self.settings = self._load_settings()
        self._region_selector_running = False
        self._region_selector_mode = "primary"
        self._session_recorder = SessionRecorder(self)
        self._has_selected_region = False
        self._primary_runtime_region = None
        self._temporary_region = None
        self._temporary_region_active = False
        from core.ocr.easyocr_manager import EasyOCRManager
        from core.cuda_manager import CudaManager
        import os
        app_data = Path(os.environ.get('LOCALAPPDATA', 'C:/')) / 'VoidSub'
        self.easyocr_manager = EasyOCRManager(app_data / 'plugins', self)
        self.cuda_manager = CudaManager(self)
        set_log_level(self.settings["app"].get("log_level", "info"))
        log_event(
            PREFIX_SYS,
            "021",
            (
                "Settings loaded: "
                f"app={json.dumps(self.settings.get('app', {}), ensure_ascii=False, sort_keys=True)} "
                f"overlay={json.dumps(self.settings.get('overlay', {}), ensure_ascii=False, sort_keys=True)}"
            ),
        )
        if hasattr(self.worker, "update_config"):
            self.worker.update_config(
                engine_id=self.settings["app"].get("ocr_engine"),
                translation_engine=self.settings["app"].get("translation_engine"),
                offline_model_key=self.settings["app"].get("offline_model_key"),
                performance_tier=self.settings["app"].get("performance_tier"),
                ocr_filters_enabled=self.settings["app"].get("ocr_filters_enabled"),
                raw_translation_flow_enabled=self.settings["app"].get("raw_translation_flow_enabled"),
                scene_mode=self.settings["app"].get("ocr_scene_mode"),
                quality_threshold=self.settings["app"].get("quality_threshold"),
                min_text_chars=self.settings["app"].get("min_text_chars"),
                stabilizer_min_samples=self.settings["app"].get("stabilizer_min_samples"),
                scene_fit_threshold=self.settings["app"].get("scene_fit_threshold"),
                variant_budget=self.settings["app"].get("variant_budget"),
                clahe_clip_striped=self.settings["app"].get("clahe_clip_striped"),
                clahe_clip_floating=self.settings["app"].get("clahe_clip_floating"),
                bilateral_d=self.settings["app"].get("bilateral_d"),
                white_v_min=self.settings["app"].get("white_v_min"),
                floating_gaussian_c=self.settings["app"].get("floating_gaussian_c"),
                floating_mean_c=self.settings["app"].get("floating_mean_c"),
                calibration_profile_active=bool(self.settings["app"].get("active_calibration_profile_id")),
                src_language=self.settings["app"].get("src_language"),
                tgt_language=self.settings["app"].get("tgt_language"),
            )
        self._restore_saved_regions()

    def attach_worker(self, worker: Any) -> None:
        self.worker = worker
        log_event(PREFIX_SYS, "023", f"Worker attached: worker_type={type(worker).__name__}")
        if hasattr(self.worker, "update_config"):
            self.worker.update_config(
                engine_id=self.settings["app"].get("ocr_engine"),
                translation_engine=self.settings["app"].get("translation_engine"),
                offline_model_key=self.settings["app"].get("offline_model_key"),
                performance_tier=self.settings["app"].get("performance_tier"),
                ocr_filters_enabled=self.settings["app"].get("ocr_filters_enabled"),
                raw_translation_flow_enabled=self.settings["app"].get("raw_translation_flow_enabled"),
                scene_mode=self.settings["app"].get("ocr_scene_mode"),
                quality_threshold=self.settings["app"].get("quality_threshold"),
                min_text_chars=self.settings["app"].get("min_text_chars"),
                stabilizer_min_samples=self.settings["app"].get("stabilizer_min_samples"),
                scene_fit_threshold=self.settings["app"].get("scene_fit_threshold"),
                variant_budget=self.settings["app"].get("variant_budget"),
                clahe_clip_striped=self.settings["app"].get("clahe_clip_striped"),
                clahe_clip_floating=self.settings["app"].get("clahe_clip_floating"),
                bilateral_d=self.settings["app"].get("bilateral_d"),
                white_v_min=self.settings["app"].get("white_v_min"),
                floating_gaussian_c=self.settings["app"].get("floating_gaussian_c"),
                floating_mean_c=self.settings["app"].get("floating_mean_c"),
                calibration_profile_active=bool(self.settings["app"].get("active_calibration_profile_id")),
                src_language=self.settings["app"].get("src_language"),
                tgt_language=self.settings["app"].get("tgt_language"),
            )
        self._restore_saved_regions()

    def _normalize_region(self, region: Any) -> dict[str, Any] | None:
        if not isinstance(region, dict):
            return None
        try:
            normalized = {
                "top": int(region.get("top", 0)),
                "left": int(region.get("left", 0)),
                "width": int(region.get("width", 0)),
                "height": int(region.get("height", 0)),
            }
        except (TypeError, ValueError):
            return None
        if normalized["width"] <= 0 or normalized["height"] <= 0:
            return None
        return normalized

    def _prepare_runtime_region(self, region: Any) -> dict[str, Any] | None:
        normalized = self._normalize_region(region)
        if normalized is None:
            log_event(PREFIX_SYS, "024", "Runtime region prepare: normalized=None", level="debug")
            return None
        log_event(PREFIX_SYS, "024", f"Runtime region prepare: normalized={normalized}", level="debug")
        return normalized

    def _restore_saved_regions(self) -> None:
        raw_region = self._normalize_region(self.settings["app"].get("last_region"))
        log_event(PREFIX_SYS, "025", f"Restore saved region: raw_region={raw_region}", level="debug")
        region = self._prepare_runtime_region(raw_region)
        self._has_selected_region = region is not None
        if region:
            self._primary_runtime_region = dict(region)
            log_event(PREFIX_SYS, "026", f"Restore applying region: region={region}, worker_ready={hasattr(self.worker, 'update_config')}", level="debug")
            if raw_region != region:
                self.settings["app"]["last_region"] = region
                self._save_settings()
            if hasattr(self.worker, "update_config"):
                self.worker.update_config(region=region)
            else:
                log_event(PREFIX_SYS, "027", "Restore region deferred: worker has no update_config", level="debug")
        else:
            log_event(PREFIX_SYS, "026", "Restore applying region: no_saved_region", level="debug")
        calibration_region = self._normalize_region(self.settings["app"].get("last_calibration_region"))
        if calibration_region:
            self._session_recorder.preview_region = calibration_region
            capturer = getattr(self.worker, "capturer", None)
            if capturer is not None and hasattr(capturer, "capture_region"):
                try:
                    self._session_recorder.preview_frame = capturer.capture_region(calibration_region)
                except Exception as exc:
                    log_error(PREFIX_CFG, "003", f"[Kalibrasyon] -> YÜKLEME HATASI | Hata: {exc}", "Kayitli kalibrasyon goruntusu yuklenemedi.")

    def persist_target_region(self, region: Any) -> None:
        normalized = self._normalize_region(region)
        if normalized is None:
            return
        self._has_selected_region = True
        self._primary_runtime_region = dict(normalized)
        self.settings["app"]["last_region"] = normalized
        self._save_settings()

    def _emit_temporary_region_state(self) -> None:
        payload = {
            "active": self._temporary_region_active,
            "region": dict(self._temporary_region) if isinstance(self._temporary_region, dict) else None,
        }
        self.send("temporary_region_state", payload)

    def _activate_temporary_region(self, region: dict[str, Any]) -> None:
        normalized = self._prepare_runtime_region(region)
        if normalized is None:
            self.send("temporary_region_failed", {"message": "Gecici alan gecersiz."})
            return
        self._temporary_region = dict(normalized)
        self._temporary_region_active = True
        if hasattr(self.worker, "update_config"):
            self.worker.update_config(region=normalized)
        self._emit_temporary_region_state()
        self.send("temporary_region_selected", {"region": normalized})

    def _deactivate_temporary_region(self) -> None:
        if not self._temporary_region_active:
            self._emit_temporary_region_state()
            return
        self._temporary_region_active = False
        self._temporary_region = None
        restore_region = self._prepare_runtime_region(self._primary_runtime_region or self.settings["app"].get("last_region"))
        if isinstance(restore_region, dict) and hasattr(self.worker, "update_config"):
            self.worker.update_config(region=restore_region)
        self._emit_temporary_region_state()
        self.send("temporary_region_cancelled", {"message": "Gecici ceviri alani kapatildi."})

    def persist_calibration_region(self, region: Any, frame: Any = None) -> None:
        normalized = self._normalize_region(region)
        if normalized is None:
            return
        self.settings["app"]["last_calibration_region"] = normalized
        self._session_recorder.preview_region = normalized
        if frame is not None:
            self._session_recorder.preview_frame = frame
        self._save_settings()

    def _emit_saved_regions(self) -> None:
        region = self._prepare_runtime_region(self.settings["app"].get("last_region"))
        if region:
            self.send("region_selected", {"region": region})
        calibration_region = self._normalize_region(self.settings["app"].get("last_calibration_region"))
        frame = getattr(self._session_recorder, "preview_frame", None)
        if calibration_region and frame is not None:
            from core.debug.session_recorder_preview import numpy_to_base64

            self.send("calibration_region_selected", {
                "x1": calibration_region["left"],
                "y1": calibration_region["top"],
                "x2": calibration_region["left"] + calibration_region["width"],
                "y2": calibration_region["top"] + calibration_region["height"],
                "preview_image": numpy_to_base64(frame),
            })

    def send(self, event, data=None, **kwargs):
        self._dispatch_native_overlay(event, data if data is not None else kwargs)
        if not self.clients or not self.loop:
            return

        payload = data if data is not None else kwargs
        message = json.dumps({"event": event, "data": payload})
        asyncio.run_coroutine_threadsafe(self._broadcast(message), self.loop)

    def _emit_app_settings(self) -> None:
        self.send("app_settings_loaded", {**self.settings["app"], "app_version": APP_VERSION})

    def attach_native_overlay(self, overlay: Any) -> None:
        self.native_overlay = overlay
        if self.native_overlay is None:
            return
        self.native_overlay.start()
        log_event(
            PREFIX_SYS,
            "038",
            "Native overlay baslatildi.",
            throttle_key="native_overlay_start",
            throttle_seconds=2.0,
        )
        self.native_overlay.apply_settings(self.settings.get("overlay"))
        if hasattr(self.native_overlay, "update_snap_to_region"):
            self.native_overlay.update_snap_to_region(bool(self.settings.get("app", {}).get("overlay_snap_to_region", True)))
        region = getattr(self.worker, "target_region", None)
        if region:
            self.native_overlay.set_region(region)

    def _dispatch_native_overlay(self, event: str, payload: Any) -> None:
        if self.native_overlay is None:
            return
        if not hasattr(self, "_last_pushed_text"):
            self._last_pushed_text = ""
        if event == "new_translation" and isinstance(payload, dict):
            raw_flow_enabled = bool(self.settings["app"].get("raw_translation_flow_enabled"))
            translated_text = str(payload.get("translated_text") or "")
            if not raw_flow_enabled:
                translated_text = translated_text.strip()
            if translated_text:
                translation_source = str(payload.get("translation_source") or "").strip().lower()
                profile = "maximum" if self.settings["app"].get("performance_tier") == "maximum" else "basic"
                display_mode = str(self.settings.get("overlay", {}).get("mode", "fixed"))
                font_size = int(self.settings.get("overlay", {}).get("font_size", 18))
                base_speed = int(self.settings["app"].get("reading_speed_cps", DEFAULT_READING_SPEED_CPS))
                reading_speed = base_speed
                min_display_ms = 900 if translation_source == "offline" else 1200
                chunks = [translated_text] # Chunking is disabled as per user request to fit all text dynamically
                
                # Check for duplicate consecutive text or minor corrections
                if translated_text == self._last_pushed_text:
                    if hasattr(self.native_overlay, "keep_alive"):
                        self.native_overlay.keep_alive()
                else:
                    similarity = 0.0
                    if self._last_pushed_text:
                        similarity = difflib.SequenceMatcher(None, translated_text, self._last_pushed_text).ratio()
                        
                    self._last_pushed_text = translated_text
                    
                    if similarity >= 0.70 and hasattr(self.native_overlay, "update_sequence"):
                        # Sadece ufak stabilizasyon düzeltmesi, animasyonsuz anında güncelle
                        self.native_overlay.update_sequence(chunks, mode=display_mode, reading_speed=reading_speed, min_display_ms=min_display_ms)
                    else:
                        # Tamamen yeni metin, baştan animasyonla göster
                        self.native_overlay.push_sequence(chunks, mode=display_mode, reading_speed=reading_speed, min_display_ms=min_display_ms)
        elif event == "overlay_settings_loaded" and isinstance(payload, dict):
            self.native_overlay.apply_settings(payload)
        elif event == "translation_state" and isinstance(payload, dict):
            if payload.get("running"):
                self.native_overlay.show()
            else:
                self.native_overlay.hide()
        elif event == "region_selected" and isinstance(payload, dict):
            region = payload.get("region")
            if isinstance(region, dict):
                self.native_overlay.set_region(region)

    async def _broadcast(self, message):
        if self.clients:
            await asyncio.gather(*[client.send(message) for client in self.clients], return_exceptions=True)

    async def _run_engine_repair(self, engine_id: str) -> None:
        log_event(PREFIX_SYS, "031", f"Motor onarimi basladi: {engine_id}")
        try:
            result = await asyncio.to_thread(self.scanner.repair_engine, engine_id)
            self.send("engine_repair_result", result)
            self.send("hardware_result", self.scanner.scan_system())
            log_event(PREFIX_SYS, "032", f"Motor onarimi tamamlandi: {engine_id}")
        except Exception as exc:
            log_error(PREFIX_SYS, "003", f"[Motor Onarımı] -> ONARIM BAŞARISIZ | Hata: {exc}", "Motor onarimi tamamlanamadi.")
            self.send(
                "engine_repair_result",
                {
                    "success": False,
                    "engine": engine_id,
                    "message": "Motor onarimi sirasinda bir hata olustu.",
                },
            )

    async def handler(self, websocket):
        self.clients.add(websocket)
        logger.info(f"[{PREFIX_SYS}] Arayuz baglantisi saglandi.")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    event = data.get("event")
                    payload = data.get("data", {})
                    log_event(
                        PREFIX_SYS,
                        "022",
                        f"WebSocket message received: event={event!r}, payload={_clip_log_text(json.dumps(payload, ensure_ascii=False))}",
                        level="debug",
                    )

                    if event == "start_translation":
                        if not self._has_selected_region:
                            self.send("translation_state", {"running": False, "reason": "region_required"})
                            continue
                        log_event(
                            PREFIX_SYS,
                            "028",
                            "Ceviri dongusu baslatma istegi alindi.",
                            throttle_key="start_translation",
                            throttle_seconds=0.5,
                        )
                        if hasattr(self.worker, "start_loop"):
                            asyncio.create_task(self.worker.start_loop())

                    elif event == "stop_translation":
                        log_event(
                            PREFIX_SYS,
                            "029",
                            "Ceviri dongusu durdurma istegi alindi.",
                            throttle_key="stop_translation",
                            throttle_seconds=0.5,
                        )
                        self._session_recorder.stop_session()
                        if hasattr(self.worker, "stop"):
                            self.worker.stop()

                    elif event == "get_hardware":
                        log_event(
                            PREFIX_SYS,
                            "030",
                            "Donanim taramasi istendi.",
                            throttle_key="hardware_scan",
                            throttle_seconds=1.0,
                        )
                        def _scan():
                            try:
                                res = self.scanner.scan_system()
                                if self.loop and not self.loop.is_closed():
                                    self.loop.call_soon_threadsafe(self.send, "hardware_result", res)
                            except Exception:
                                pass
                        
                        import threading
                        threading.Thread(target=_scan, daemon=True).start()

                    elif event == "repair_engine":
                        engine_id = payload.get("engine")
                        if (
                            engine_id
                            and getattr(self.worker, "is_running", False)
                            and getattr(self.worker, "active_engine", None) != engine_id
                        ):
                            self.send(
                                "engine_change_denied",
                                {"reason": "Ceviri aktifken motor degistirilemez. Once donguyu durdurun."},
                            )
                            continue
                        if engine_id:
                            asyncio.create_task(self._run_engine_repair(str(engine_id)))

                    elif event == "get_offline_status":
                        offline_engine = getattr(self.worker, "offline_engine", getattr(self.worker, "offline_translator", None))
                        if offline_engine is not None:
                            self.send("offline_model_status", offline_engine.get_status())

                    elif event == "download_offline_models":
                        if hasattr(self.worker, "offline_translator"):
                            requested_models = payload.get("models")
                            if isinstance(requested_models, list):
                                self.worker.offline_translator.download_models(requested_models)
                            else:
                                self.worker.offline_translator.download_models(payload.get("model"))

                    elif event == "download_easyocr":
                        self.easyocr_manager.start()
                    elif event == "cancel_easyocr":
                        self.easyocr_manager.cancel()
                    elif event == "remove_easyocr":
                        self.easyocr_manager.remove()
                    elif event == "download_cuda":
                        self.cuda_manager.start()
                    elif event == "cancel_cuda":
                        self.cuda_manager.cancel()
                    elif event == "remove_cuda":
                        self.cuda_manager.remove()
                    elif event == "get_cuda_status":
                        self.cuda_manager._send_status()
                    elif event == "cancel_offline_models":
                        offline_engine = getattr(self.worker, "offline_engine", getattr(self.worker, "offline_translator", None))
                        if offline_engine is not None:
                            offline_engine.cancel_download()

                    elif event == "remove_offline_models":
                        if hasattr(self.worker, "offline_translator"):
                            self.worker.offline_translator.remove_models(payload.get("model"))

                    elif event == "update_region":
                        region = self._prepare_runtime_region(payload.get("region"))
                        log_event(PREFIX_CFG, "006", f"Yeni tarama alani alindi: {region}")
                        if isinstance(region, dict) and hasattr(self.worker, "update_config"):
                            self.worker.update_config(region=region)
                        self.persist_target_region(region)
                        self.send("region_selected", {"region": region})

                    elif event == "set_runtime_region":
                        region = self._prepare_runtime_region(payload.get("region"))
                        if isinstance(region, dict) and hasattr(self.worker, "update_config"):
                            self.worker.update_config(region=region)
                            self._has_selected_region = True
                            self._primary_runtime_region = dict(region)
                            if self.native_overlay is not None:
                                self.native_overlay.set_region(region)

                    elif event == "request_region_selection":
                        if self._temporary_region_active:
                            self.send("region_selection_failed", {"message": "Gecici alan aktifken ana tarama alani degistirilemez."})
                            continue
                        if not self._region_selector_running:
                            self._region_selector_running = True
                            self._region_selector_mode = "primary"
                            asyncio.create_task(self._run_native_region_selector())

                    elif event == "toggle_temporary_region":
                        if self._temporary_region_active:
                            self._deactivate_temporary_region()
                            continue
                        if not self._has_selected_region:
                            self.send("temporary_region_failed", {"message": "Once ana tarama alani secilmelidir."})
                            continue
                        if not self._region_selector_running:
                            self._region_selector_running = True
                            self._region_selector_mode = "temporary"
                            asyncio.create_task(self._run_native_region_selector())

                    elif event == "change_engine":
                        engine_id = payload.get("engine")
                        log_event(PREFIX_CFG, "007", f"Motor degistirme istegi: {engine_id}")

                        if hasattr(self.worker, "update_config"):
                            self.worker.update_config(engine_id=engine_id)

                        if engine_id:
                            self.settings["app"]["ocr_engine"] = engine_id
                            if self._save_settings():
                                self._emit_app_settings()
                            else:
                                self.send(
                                    "settings_save_failed",
                                    {"scope": "app", "message": "Motor tercihi kaydedilemedi."},
                                )

                    elif event == "change_ocr_scene_mode":
                        scene_mode = payload.get("mode")
                        if scene_mode in {"striped", "floating"}:
                            if hasattr(self.worker, "update_config"):
                                self.worker.update_config(scene_mode=scene_mode)
                            self.settings["app"]["ocr_scene_mode"] = scene_mode
                            if self._save_settings():
                                self._emit_app_settings()
                            else:
                                self.send(
                                    "settings_save_failed",
                                    {"scope": "app", "message": "OCR sahne modu kaydedilemedi."},
                                )

                    elif event == "save_settings":
                        previous = deepcopy(self.settings["app"])
                        next_payload = self._merge_dict(self.settings["app"], payload)
                        next_payload.pop("app_version", None)
                        if next_payload.get("src_language") not in VALID_SOURCE_LANGUAGES:
                            next_payload["src_language"] = "auto"
                        if next_payload.get("tgt_language") not in VALID_TARGET_LANGUAGES:
                            next_payload["tgt_language"] = "tr"
                        if next_payload.get("offline_model_key") not in VALID_OFFLINE_MODEL_KEYS:
                            next_payload["offline_model_key"] = "opus_mt_en_tr"
                        if (
                            next_payload.get("translation_engine") == "offline"
                            and next_payload.get("offline_model_key") == "opus_mt_en_tr"
                            and next_payload.get("src_language") != "en"
                        ):
                            next_payload["src_language"] = "en"
                        next_payload["custom_calibration_profiles"] = self._normalize_custom_profiles(
                            next_payload.get("custom_calibration_profiles")
                        )
                        self.settings["app"] = next_payload
                        set_log_level(self.settings["app"].get("log_level", "info"))

                        if self.native_overlay is not None and hasattr(self.native_overlay, "update_snap_to_region"):
                            self.native_overlay.update_snap_to_region(bool(self.settings["app"].get("overlay_snap_to_region", True)))

                        if hasattr(self.worker, "update_config"):
                            config_updates = {}
                            if previous.get("translation_engine") != self.settings["app"].get("translation_engine"):
                                config_updates["translation_engine"] = self.settings["app"].get(
                                    "translation_engine"
                                )
                            if previous.get("offline_model_key") != self.settings["app"].get("offline_model_key"):
                                config_updates["offline_model_key"] = self.settings["app"].get(
                                    "offline_model_key"
                                )
                            if previous.get("performance_tier") != self.settings["app"].get("performance_tier"):
                                config_updates["performance_tier"] = self.settings["app"].get(
                                    "performance_tier"
                                )
                            if previous.get("ocr_filters_enabled") != self.settings["app"].get(
                                "ocr_filters_enabled"
                            ):
                                config_updates["ocr_filters_enabled"] = self.settings["app"].get(
                                    "ocr_filters_enabled"
                                )
                            if previous.get("raw_translation_flow_enabled") != self.settings["app"].get(
                                "raw_translation_flow_enabled"
                            ):
                                config_updates["raw_translation_flow_enabled"] = self.settings["app"].get(
                                    "raw_translation_flow_enabled"
                                )
                            if previous.get("quality_threshold") != self.settings["app"].get(
                                "quality_threshold"
                            ):
                                config_updates["quality_threshold"] = self.settings["app"].get(
                                    "quality_threshold"
                                )
                            if previous.get("min_text_chars") != self.settings["app"].get("min_text_chars"):
                                config_updates["min_text_chars"] = self.settings["app"].get(
                                    "min_text_chars"
                                )
                            if previous.get("stabilizer_min_samples") != self.settings["app"].get(
                                "stabilizer_min_samples"
                            ):
                                config_updates["stabilizer_min_samples"] = self.settings["app"].get(
                                    "stabilizer_min_samples"
                                )
                            if previous.get("scene_fit_threshold") != self.settings["app"].get("scene_fit_threshold"):
                                config_updates["scene_fit_threshold"] = self.settings["app"].get("scene_fit_threshold")
                            if previous.get("variant_budget") != self.settings["app"].get("variant_budget"):
                                config_updates["variant_budget"] = self.settings["app"].get("variant_budget")
                            if previous.get("clahe_clip_striped") != self.settings["app"].get("clahe_clip_striped"):
                                config_updates["clahe_clip_striped"] = self.settings["app"].get("clahe_clip_striped")
                            if previous.get("clahe_clip_floating") != self.settings["app"].get("clahe_clip_floating"):
                                config_updates["clahe_clip_floating"] = self.settings["app"].get("clahe_clip_floating")
                            if previous.get("bilateral_d") != self.settings["app"].get("bilateral_d"):
                                config_updates["bilateral_d"] = self.settings["app"].get("bilateral_d")
                            if previous.get("white_v_min") != self.settings["app"].get("white_v_min"):
                                config_updates["white_v_min"] = self.settings["app"].get("white_v_min")
                            if previous.get("floating_gaussian_c") != self.settings["app"].get("floating_gaussian_c"):
                                config_updates["floating_gaussian_c"] = self.settings["app"].get("floating_gaussian_c")
                            if previous.get("floating_mean_c") != self.settings["app"].get("floating_mean_c"):
                                config_updates["floating_mean_c"] = self.settings["app"].get("floating_mean_c")
                            if previous.get("active_calibration_profile_id") != self.settings["app"].get("active_calibration_profile_id"):
                                config_updates["calibration_profile_active"] = bool(self.settings["app"].get("active_calibration_profile_id"))
                            if previous.get("src_language") != self.settings["app"].get("src_language"):
                                config_updates["src_language"] = self.settings["app"].get("src_language")
                            if previous.get("tgt_language") != self.settings["app"].get("tgt_language"):
                                config_updates["tgt_language"] = self.settings["app"].get("tgt_language")
                            self.worker.update_config(**config_updates)

                        if previous.get("translation_engine") != self.settings["app"].get("translation_engine"):
                            log_event(
                                PREFIX_CFG,
                                "009",
                                f"Ceviri servisi: {self.settings['app'].get('translation_engine')}",
                            )
                        if previous.get("performance_tier") != self.settings["app"].get("performance_tier"):
                            log_event(
                                PREFIX_CFG,
                                "010",
                                f"Performans kademesi: {self.settings['app'].get('performance_tier')}",
                            )
                        if previous.get("log_level") != self.settings["app"].get("log_level"):
                            log_event(
                                PREFIX_CFG,
                                "011",
                                f"Kayit ayrinti seviyesi: {self.settings['app'].get('log_level')}",
                            )
                        
                        # Shortcut'lar değişmişse Frontend'e bildir
                        if previous.get("shortcuts") != self.settings["app"].get("shortcuts"):
                            shortcuts_text = ", ".join(
                                f"{k}={v}" 
                                for k, v in (self.settings["app"].get("shortcuts") or {}).items()
                            )
                            log_event(PREFIX_CFG, "020", f"Tuş atamaları: {shortcuts_text}")

                        if self._save_settings():
                            # Skip emit eğer flag set'se (tuş güncellenmesi için)
                            if not payload.get("_skip_emit"):
                                self._emit_app_settings()
                        else:
                            self.send(
                                "settings_save_failed",
                                {"scope": "app", "message": "Uygulama ayarlari kaydedilemedi."},
                            )

                    elif event == "save_overlay_settings":
                        log_event(
                            PREFIX_CFG,
                            "008",
                            "Ceviri Katmani ayarlari kaydedildi.",
                            throttle_key="save_overlay_settings",
                            throttle_seconds=0.25,
                        )
                        self.settings["overlay"] = self._merge_dict(self.settings["overlay"], payload)
                        if self.native_overlay is not None and hasattr(self.native_overlay, "apply_settings"):
                            self.native_overlay.apply_settings(self.settings["overlay"])
                        if self._save_settings():
                            self.send("overlay_settings_loaded", self.settings["overlay"])
                        else:
                            self.send(
                                "settings_save_failed",
                                {"scope": "overlay", "message": "Ceviri Katmani ayarlari kaydedilemedi."},
                            )

                    elif event == "toggle_overlay_visibility":
                        if self.native_overlay is not None:
                            self.native_overlay.toggle()
                            
                    elif event == "test_overlay_push":
                        if self.native_overlay is not None:
                            self.native_overlay.push_sequence(
                                [str(payload.get("text", "Örnek Çeviri Metni"))],
                                mode=str(self.settings["overlay"].get("mode", "fixed")),
                                reading_speed=int(self.settings["app"].get("reading_speed_cps", 60))
                            )

                    elif event == "clear_overlay":
                        if self.native_overlay is not None and hasattr(self.native_overlay, "clear"):
                            self.native_overlay.clear()

                    elif event == "shutdown":
                        log_event(PREFIX_SYS, "099", "Arayuzden guvenli kapanis (graceful shutdown) sinyali alindi.")
                        if self.worker is not None and hasattr(self.worker, "shutdown"):
                            self.worker.shutdown()
                        # Exit the event loop gracefully
                        if self.shutdown_event is not None:
                            self.shutdown_event.set()
                        
                    elif event == "get_settings":
                        self._emit_app_settings()
                        self.send("overlay_settings_loaded", self.settings["overlay"])
                        self._emit_saved_regions()
                        self._emit_temporary_region_state()

                    elif event == "debug_session_start":
                        if hasattr(self.worker, "diagnostics"):
                            self._session_recorder.start_session(self.worker)
                        else:
                            self.send("debug_session_result", {"error": "Pipeline hazir degil."})

                    elif event == "debug_session_stop":
                        self._session_recorder.stop_session()

                    elif event == "debug_config_update":
                        self._session_recorder.config_update(payload)

                    elif event == "debug_config_reset":
                        self._session_recorder.config_reset()

                    elif event in {"debug_select_region", "calibration_select_region"}:
                        self._session_recorder.select_region()

                    elif event in {"debug_preview_request", "calibration_preview_request"}:
                        self._session_recorder.preview_request(payload)

                    elif event == "debug_region_clear":
                        self._session_recorder.region_clear()

                    elif event == "shutdown_core":
                        log_event(
                            PREFIX_SYS,
                            "039",
                            "Arayuz istegiyle Python core kapatiliyor.",
                            level="warning",
                        )
                        if hasattr(self.worker, "offline_translator"):
                            self.worker.offline_translator.cancel_download()
                        if hasattr(self.worker, "stop"):
                            self.worker.stop()
                        if self.shutdown_event is not None:
                            self.shutdown_event.set()

                except json.JSONDecodeError:
                    log_error(PREFIX_SYS, "002", "[WebSocket] -> BOZUK VERİ PAKETİ | Detay: JSON Parse Error", "Alinan mesaj JSON olarak okunamadi.")
                except Exception as exc:
                    log_error(PREFIX_SYS, "004", f"[WebSocket İstemcisi] -> MESAJ İŞLEME HATASI | Hata: {exc}", "Gelen istemci mesaji islenirken hata olustu.")
                    if locals().get("event") == "get_hardware":
                        self.send("hardware_error", {"message": "Donanım taraması başarısız oldu"})

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"[{PREFIX_SYS}] Arayuz baglantisi kesildi.")
        finally:
            self.clients.discard(websocket)

    async def start(self):
        self.loop = asyncio.get_running_loop()
        self.shutdown_event = asyncio.Event()
        server = await websockets.serve(self.handler, self.host, self.port)
        
        # İşletim sisteminin atadığı dinamik portu (veya statik portu) yakala
        self.port = server.sockets[0].getsockname()[1]
        
        # Tauri'nin (Rust) yakalayabilmesi için özel formatta konsola bas ve flush et
        sys.stdout.write(f"[[VOIDSUB_WS_PORT:{self.port}]]\n")
        sys.stdout.flush()
        
        await self.shutdown_event.wait()
        server.close()
        await server.wait_closed()

    def _load_settings(self) -> dict:
        settings = deepcopy(DEFAULT_SETTINGS)
        try:
            if not SETTINGS_FILE.exists() and LEGACY_SETTINGS_FILE.exists():
                SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
                SETTINGS_FILE.write_text(LEGACY_SETTINGS_FILE.read_text(encoding="utf-8"), encoding="utf-8")
            if SETTINGS_FILE.exists():
                with open(SETTINGS_FILE, "r", encoding="utf-8") as file:
                    loaded = json.load(file)
                incoming_app = loaded.get("app", {})
                filtered_app = {
                    key: value
                    for key, value in incoming_app.items()
                    if key in settings["app"]
                }
                settings["app"] = self._merge_dict(settings["app"], filtered_app)
                incoming_overlay = loaded.get("overlay", {})
                filtered_overlay = {
                    key: value
                    for key, value in incoming_overlay.items()
                    if key in settings["overlay"]
                }
                settings["overlay"] = self._merge_dict(settings["overlay"], filtered_overlay)
                settings["app"]["custom_calibration_profiles"] = self._normalize_custom_profiles(
                    settings["app"].get("custom_calibration_profiles")
                )
                if settings["app"].get("ocr_engine") not in {"easy", "winonly"}:
                    settings["app"]["ocr_engine"] = "easy"
                if settings["app"].get("ocr_scene_mode") not in {"striped", "floating"}:
                    settings["app"]["ocr_scene_mode"] = "striped"
                if settings["app"].get("src_language") not in VALID_SOURCE_LANGUAGES:
                    settings["app"]["src_language"] = "auto"
                if settings["app"].get("tgt_language") not in VALID_TARGET_LANGUAGES:
                    settings["app"]["tgt_language"] = "tr"
                if settings["app"].get("offline_model_key") not in VALID_OFFLINE_MODEL_KEYS:
                    settings["app"]["offline_model_key"] = "opus_mt_en_tr"
                if (
                    settings["app"].get("translation_engine") == "offline"
                    and settings["app"].get("offline_model_key") == "opus_mt_en_tr"
                    and settings["app"].get("src_language") != "en"
                ):
                    settings["app"]["src_language"] = "en"
            else:
                self._save_settings_payload(settings)
        except Exception as exc:
            log_error(PREFIX_CFG, "001", f"[Ayarlar Yöneticisi] -> OKUMA HATASI | Hata: {exc}", "Ayarlar okunamadi, varsayilanlara donuldu.")
        return settings

    def _save_settings(self) -> bool:
        return self._save_settings_payload(self.settings)

    def _save_settings_payload(self, payload: dict) -> bool:
        import os
        try:
            if isinstance(payload.get("app"), dict):
                payload["app"]["custom_calibration_profiles"] = self._normalize_custom_profiles(
                    payload["app"].get("custom_calibration_profiles")
                )
            SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            temp_path = SETTINGS_FILE.with_suffix(".tmp")
            with open(temp_path, "w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False, indent=2)
            os.replace(temp_path, SETTINGS_FILE)
            return True
        except Exception as exc:
            log_error(PREFIX_CFG, "002", f"[Ayarlar Yöneticisi] -> KAYIT HATASI | Hata: {exc}", "Ayarlar kaydedilemedi.")
            return False

    def _merge_dict(self, base: dict, incoming: dict) -> dict:
        merged = deepcopy(base)
        for key, value in incoming.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._merge_dict(merged[key], value)
            else:
                merged[key] = value
        return merged

    def _normalize_custom_profiles(self, profiles: Any) -> list[dict[str, Any]]:
        if not isinstance(profiles, list):
            return []

        normalized_profiles: list[dict[str, Any]] = []
        for profile in profiles:
            normalized = self._normalize_custom_profile(profile)
            if normalized is not None:
                normalized_profiles.append(normalized)
        return normalized_profiles

    def _normalize_custom_profile(self, profile: Any) -> dict[str, Any] | None:
        if not isinstance(profile, dict):
            return None

        profile_id = str(profile.get("id") or "").strip()
        if not profile_id:
            return None

        name = str(profile.get("name") or "").strip() or "Ozel Profil"
        mode = str(profile.get("mode") or "striped").strip().lower()
        if mode not in VALID_PROFILE_MODES:
            mode = "striped"
        base_tier = str(profile.get("base_tier") or "standard").strip().lower()
        if base_tier not in VALID_PROFILE_BASE_TIERS:
            base_tier = "standard"

        values = profile.get("values")
        if not isinstance(values, dict):
            values = {}
        else:
            values = {
                key: value
                for key, value in values.items()
                if isinstance(key, str) and isinstance(value, (int, float, bool)) and not isinstance(value, str)
            }

        normalized: dict[str, Any] = {
            "id": profile_id,
            "name": name,
            "mode": mode,
            "base_tier": base_tier,
            "values": values,
        }

        overlay_overrides = self._normalize_profile_overlay_overrides(profile.get("overlay_overrides"))
        if overlay_overrides:
            normalized["overlay_overrides"] = overlay_overrides

        app_overrides = self._normalize_profile_app_overrides(profile.get("app_overrides"))
        if app_overrides:
            normalized["app_overrides"] = app_overrides

        return normalized

    def _normalize_profile_overlay_overrides(self, overrides: Any) -> dict[str, Any]:
        if not isinstance(overrides, dict):
            return {}

        normalized = {
            str(key): value
            for key, value in overrides.items()
            if key in PROFILE_OVERLAY_KEYS
        }
        if normalized.get("mode") != "fixed":
            normalized.pop("mode", None)
        return normalized

    def _normalize_profile_app_overrides(self, overrides: Any) -> dict[str, Any]:
        if not isinstance(overrides, dict):
            return {}

        normalized: dict[str, Any] = {}
        for key, value in overrides.items():
            if key not in PROFILE_APP_OVERRIDE_KEYS:
                continue
            if key == "src_language":
                normalized[key] = value if value in VALID_SOURCE_LANGUAGES else "auto"
            elif key == "tgt_language":
                normalized[key] = value if value in VALID_TARGET_LANGUAGES else "tr"
            elif key == "shortcuts":
                if isinstance(value, dict):
                    normalized_shortcuts = {
                        shortcut_key: shortcut_value
                        for shortcut_key, shortcut_value in value.items()
                        if shortcut_key in PROFILE_SHORTCUT_KEYS and isinstance(shortcut_value, str) and shortcut_value.strip()
                    }
                    if normalized_shortcuts:
                        normalized[key] = normalized_shortcuts
            else:
                normalized[key] = value
        return normalized

    async def _run_native_region_selector(self) -> None:
        python_executable = Path(sys.executable)
        
        is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
        if is_compiled:
            cmd = [str(python_executable), "--region-selector"]
        else:
            selector_script = Path(__file__).resolve().parent / "native_region_selector.py"
            cmd = [str(python_executable), str(selector_script)]

        creation_flags = 0
        if sys.platform == "win32":
            import subprocess
            creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        def _run_selector() -> subprocess.CompletedProcess:
            import subprocess
            return subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=creation_flags,
                timeout=120,
            )

        try:
            result = await asyncio.to_thread(_run_selector)
        except Exception as exc:
            self.send("region_selection_failed", {"message": f"Tarama alani secimi baslatilamadi: {exc}"})
            self._region_selector_running = False
            return

        self._region_selector_running = False

        stdout = (result.stdout or "").strip().splitlines()
        payload = {}
        if stdout:
            try:
                payload = json.loads(stdout[-1])
            except json.JSONDecodeError:
                payload = {}

        region = self._prepare_runtime_region(payload.get("region"))
        if isinstance(region, dict):
            log_event(PREFIX_CFG, "006", f"Yeni tarama alani alindi: {region}")
            if self._region_selector_mode == "temporary":
                self._activate_temporary_region(region)
            else:
                if hasattr(self.worker, "update_config"):
                    self.worker.update_config(region=region)
                self.persist_target_region(region)
                self.send("region_selected", {"region": region})
            return

        if payload.get("cancelled"):
            if self._region_selector_mode == "temporary":
                self.send("temporary_region_cancelled", {"message": "Gecici alan secimi iptal edildi."})
                self._emit_temporary_region_state()
            else:
                self.send("region_selection_cancelled", {"message": "Tarama alani secimi iptal edildi."})
            return

        if self._region_selector_mode == "temporary":
            self.send("temporary_region_failed", {"message": "Gecici alan secimi tamamlanamadi."})
            self._emit_temporary_region_state()
            return
        self.send("region_selection_failed", {"message": "Tarama alani secimi tamamlanamadi."})


