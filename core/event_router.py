import asyncio
import json
from copy import deepcopy
from typing import Any

from core.errors import (
    PREFIX_CFG,
    PREFIX_SYS,
    get_logger,
    log_event,
    set_log_level,
)

logger = get_logger()

class EventRouter:
    """Merkezi Event Yoneticisi: Spagetti event bloklarini ve state mutation'i engeller."""

    def __init__(self, bridge: Any):
        self.bridge = bridge
        self.routes = {}
        self._register_routes()

    def route(self, event_name: str, handler: callable):
        self.routes[event_name] = handler

    def _register_routes(self):
        self.route("start_translation", self.handle_start_translation)
        self.route("stop_translation", self.handle_stop_translation)
        self.route("get_hardware", self.handle_get_hardware)
        self.route("repair_engine", self.handle_repair_engine)
        self.route("get_offline_status", self.handle_get_offline_status)
        self.route("download_offline_models", self.handle_download_offline_models)
        self.route("download_easyocr", self.handle_download_easyocr)
        self.route("cancel_easyocr", self.handle_cancel_easyocr)
        self.route("remove_easyocr", self.handle_remove_easyocr)
        self.route("download_cuda", self.handle_download_cuda)
        self.route("cancel_cuda", self.handle_cancel_cuda)
        self.route("remove_cuda", self.handle_remove_cuda)
        self.route("get_cuda_status", self.handle_get_cuda_status)
        self.route("cancel_offline_models", self.handle_cancel_offline_models)
        self.route("remove_offline_models", self.handle_remove_offline_models)
        self.route("update_region", self.handle_update_region)
        self.route("set_runtime_region", self.handle_set_runtime_region)
        self.route("request_region_selection", self.handle_request_region_selection)
        self.route("toggle_temporary_region", self.handle_toggle_temporary_region)
        self.route("change_engine", self.handle_change_engine)
        self.route("change_ocr_scene_mode", self.handle_change_ocr_scene_mode)
        self.route("save_settings", self.handle_save_settings)
        self.route("save_overlay_settings", self.handle_save_overlay_settings)
        self.route("toggle_overlay_visibility", self.handle_toggle_overlay_visibility)
        self.route("test_overlay_push", self.handle_test_overlay_push)
        self.route("clear_overlay", self.handle_clear_overlay)
        self.route("shutdown", self.handle_shutdown)
        self.route("get_settings", self.handle_get_settings)
        self.route("debug_session_start", self.handle_debug_session_start)
        self.route("debug_session_stop", self.handle_debug_session_stop)
        self.route("debug_config_update", self.handle_debug_config_update)
        self.route("debug_config_reset", self.handle_debug_config_reset)
        self.route("debug_select_region", self.handle_debug_select_region)
        self.route("calibration_select_region", self.handle_debug_select_region)
        self.route("debug_preview_request", self.handle_debug_preview_request)
        self.route("calibration_preview_request", self.handle_debug_preview_request)
        self.route("debug_region_clear", self.handle_debug_region_clear)
        self.route("shutdown_core", self.handle_shutdown_core)

    async def dispatch(self, event: str, payload: dict):
        handler = self.routes.get(event)
        if not handler:
            return
        if asyncio.iscoroutinefunction(handler):
            await handler(payload)
        else:
            handler(payload)

    def handle_start_translation(self, payload: dict):
        if not self.bridge._has_selected_region:
            self.bridge.send("translation_state", {"running": False, "reason": "region_required"})
            return
        log_event(PREFIX_SYS, "028", "Ceviri dongusu baslatma istegi alindi.", throttle_key="start_translation", throttle_seconds=0.5)
        if hasattr(self.bridge.worker, "start_loop"):
            asyncio.create_task(self.bridge.worker.start_loop())

    def handle_stop_translation(self, payload: dict):
        log_event(PREFIX_SYS, "029", "Ceviri dongusu durdurma istegi alindi.", throttle_key="stop_translation", throttle_seconds=0.5)
        self.bridge._session_recorder.stop_session()
        if hasattr(self.bridge.worker, "stop"):
            self.bridge.worker.stop()

    def handle_get_hardware(self, payload: dict):
        log_event(PREFIX_SYS, "030", "Donanim taramasi istendi.", throttle_key="hardware_scan", throttle_seconds=1.0)
        def _scan():
            try:
                res = self.bridge.scanner.scan_system()
                if self.bridge.loop and not self.bridge.loop.is_closed():
                    self.bridge.loop.call_soon_threadsafe(self.bridge.send, "hardware_result", res)
            except Exception:
                pass
        import threading
        threading.Thread(target=_scan, daemon=True).start()

    def handle_repair_engine(self, payload: dict):
        engine_id = payload.get("engine")
        if engine_id and getattr(self.bridge.worker, "is_running", False) and getattr(self.bridge.worker, "active_engine", None) != engine_id:
            self.bridge.send("engine_change_denied", {"reason": "Ceviri aktifken motor degistirilemez. Once donguyu durdurun."})
            return
        if engine_id:
            asyncio.create_task(self.bridge._run_engine_repair(str(engine_id)))

    def handle_get_offline_status(self, payload: dict):
        offline_engine = getattr(self.bridge.worker, "offline_engine", getattr(self.bridge.worker, "offline_translator", None))
        if offline_engine is not None:
            self.bridge.send("offline_model_status", offline_engine.get_status())

    def handle_download_offline_models(self, payload: dict):
        if hasattr(self.bridge.worker, "offline_translator"):
            requested_models = payload.get("models")
            if isinstance(requested_models, list):
                self.bridge.worker.offline_translator.download_models(requested_models)
            else:
                self.bridge.worker.offline_translator.download_models(payload.get("model"))

    def handle_download_easyocr(self, payload: dict):
        self.bridge.easyocr_manager.start()

    def handle_cancel_easyocr(self, payload: dict):
        self.bridge.easyocr_manager.cancel()

    def handle_remove_easyocr(self, payload: dict):
        self.bridge.easyocr_manager.remove()

    def handle_download_cuda(self, payload: dict):
        self.bridge.cuda_manager.start()

    def handle_cancel_cuda(self, payload: dict):
        self.bridge.cuda_manager.cancel()

    def handle_remove_cuda(self, payload: dict):
        self.bridge.cuda_manager.remove()

    def handle_get_cuda_status(self, payload: dict):
        self.bridge.cuda_manager._send_status()

    def handle_cancel_offline_models(self, payload: dict):
        offline_engine = getattr(self.bridge.worker, "offline_engine", getattr(self.bridge.worker, "offline_translator", None))
        if offline_engine is not None:
            offline_engine.cancel_download()

    def handle_remove_offline_models(self, payload: dict):
        if hasattr(self.bridge.worker, "offline_translator"):
            self.bridge.worker.offline_translator.remove_models(payload.get("model"))

    def handle_update_region(self, payload: dict):
        region = self.bridge._prepare_runtime_region(payload.get("region"))
        log_event(PREFIX_CFG, "006", f"Yeni tarama alani alindi: {region}")
        if isinstance(region, dict) and hasattr(self.bridge.worker, "update_config"):
            self.bridge.worker.update_config(region=region)
        self.bridge.persist_target_region(region)
        self.bridge.send("region_selected", {"region": region})

    def handle_set_runtime_region(self, payload: dict):
        region = self.bridge._prepare_runtime_region(payload.get("region"))
        if isinstance(region, dict) and hasattr(self.bridge.worker, "update_config"):
            self.bridge.worker.update_config(region=region)
            self.bridge._has_selected_region = True
            self.bridge._primary_runtime_region = dict(region)
            if self.bridge.native_overlay is not None:
                self.bridge.native_overlay.set_region(region)

    def handle_request_region_selection(self, payload: dict):
        if self.bridge._temporary_region_active:
            self.bridge.send("region_selection_failed", {"message": "Gecici alan aktifken ana tarama alani degistirilemez."})
            return
        if not self.bridge._region_selector_running:
            self.bridge._region_selector_running = True
            self.bridge._region_selector_mode = "primary"
            asyncio.create_task(self.bridge._run_native_region_selector())

    def handle_toggle_temporary_region(self, payload: dict):
        if self.bridge._temporary_region_active:
            self.bridge._deactivate_temporary_region()
            return
        if not self.bridge._has_selected_region:
            self.bridge.send("temporary_region_failed", {"message": "Once ana tarama alani secilmelidir."})
            return
        if not self.bridge._region_selector_running:
            self.bridge._region_selector_running = True
            self.bridge._region_selector_mode = "temporary"
            asyncio.create_task(self.bridge._run_native_region_selector())

    def handle_change_engine(self, payload: dict):
        engine_id = payload.get("engine")
        log_event(PREFIX_CFG, "007", f"Motor degistirme istegi: {engine_id}")
        if hasattr(self.bridge.worker, "update_config"):
            self.bridge.worker.update_config(engine_id=engine_id)
        if engine_id:
            self.bridge.settings["app"]["ocr_engine"] = engine_id
            if self.bridge._save_settings():
                self.bridge._emit_app_settings()
            else:
                self.bridge.send("settings_save_failed", {"scope": "app", "message": "Motor tercihi kaydedilemedi."})

    def handle_change_ocr_scene_mode(self, payload: dict):
        from core.bridge import VALID_PROFILE_MODES
        scene_mode = payload.get("mode")
        if scene_mode in VALID_PROFILE_MODES:
            if hasattr(self.bridge.worker, "update_config"):
                self.bridge.worker.update_config(scene_mode=scene_mode)
            self.bridge.settings["app"]["ocr_scene_mode"] = scene_mode
            if self.bridge._save_settings():
                self.bridge._emit_app_settings()
            else:
                self.bridge.send("settings_save_failed", {"scope": "app", "message": "OCR sahne modu kaydedilemedi."})

    def handle_save_settings(self, payload: dict):
        from core.bridge import VALID_SOURCE_LANGUAGES, VALID_TARGET_LANGUAGES, VALID_OFFLINE_MODEL_KEYS
        previous = deepcopy(self.bridge.settings["app"])
        next_payload = self.bridge._merge_dict(self.bridge.settings["app"], payload)
        next_payload.pop("app_version", None)
        if next_payload.get("src_language") not in VALID_SOURCE_LANGUAGES:
            next_payload["src_language"] = "auto"
        if next_payload.get("tgt_language") not in VALID_TARGET_LANGUAGES:
            next_payload["tgt_language"] = "tr"
        if next_payload.get("offline_model_key") not in VALID_OFFLINE_MODEL_KEYS:
            next_payload["offline_model_key"] = "opus_mt_en_tr"
        if next_payload.get("translation_engine") == "offline" and next_payload.get("offline_model_key") == "opus_mt_en_tr" and next_payload.get("src_language") != "en":
            next_payload["src_language"] = "en"
        next_payload["custom_calibration_profiles"] = self.bridge._normalize_custom_profiles(next_payload.get("custom_calibration_profiles"))
        self.bridge.settings["app"] = next_payload
        set_log_level(self.bridge.settings["app"].get("log_level", "info"))

        if self.bridge.native_overlay is not None and hasattr(self.bridge.native_overlay, "update_snap_to_region"):
            self.bridge.native_overlay.update_snap_to_region(bool(self.bridge.settings["app"].get("overlay_snap_to_region", True)))

        if hasattr(self.bridge.worker, "update_config"):
            config_updates = {}
            for key in ["translation_engine", "offline_model_key", "performance_tier", "ocr_filters_enabled", "raw_translation_flow_enabled", "quality_threshold", "min_text_chars", "stabilizer_min_samples", "scene_fit_threshold", "variant_budget", "clahe_clip_striped", "clahe_clip_floating", "bilateral_d", "white_v_min", "floating_gaussian_c", "floating_mean_c", "src_language", "tgt_language"]:
                if previous.get(key) != self.bridge.settings["app"].get(key):
                    config_updates[key] = self.bridge.settings["app"].get(key)
            if previous.get("active_calibration_profile_id") != self.bridge.settings["app"].get("active_calibration_profile_id"):
                config_updates["calibration_profile_active"] = bool(self.bridge.settings["app"].get("active_calibration_profile_id"))
            self.bridge.worker.update_config(**config_updates)

        if previous.get("translation_engine") != self.bridge.settings["app"].get("translation_engine"):
            log_event(PREFIX_CFG, "009", f"Ceviri servisi: {self.bridge.settings['app'].get('translation_engine')}")
        if previous.get("performance_tier") != self.bridge.settings["app"].get("performance_tier"):
            log_event(PREFIX_CFG, "010", f"Performans kademesi: {self.bridge.settings['app'].get('performance_tier')}")
        if previous.get("log_level") != self.bridge.settings["app"].get("log_level"):
            log_event(PREFIX_CFG, "011", f"Kayit ayrinti seviyesi: {self.bridge.settings['app'].get('log_level')}")
        if previous.get("shortcuts") != self.bridge.settings["app"].get("shortcuts"):
            shortcuts_text = ", ".join(f"{k}={v}" for k, v in (self.bridge.settings["app"].get("shortcuts") or {}).items())
            log_event(PREFIX_CFG, "020", f"Tuş atamaları: {shortcuts_text}")

        if self.bridge._save_settings():
            if not payload.get("_skip_emit"):
                self.bridge._emit_app_settings()
        else:
            self.bridge.send("settings_save_failed", {"scope": "app", "message": "Uygulama ayarlari kaydedilemedi."})

    def handle_save_overlay_settings(self, payload: dict):
        log_event(PREFIX_CFG, "008", "Ceviri Katmani ayarlari kaydedildi.", throttle_key="save_overlay_settings", throttle_seconds=0.25)
        self.bridge.settings["overlay"] = self.bridge._merge_dict(self.bridge.settings["overlay"], payload)
        if self.bridge.native_overlay is not None and hasattr(self.bridge.native_overlay, "apply_settings"):
            self.bridge.native_overlay.apply_settings(self.bridge.settings["overlay"])
        if self.bridge._save_settings():
            self.bridge.send("overlay_settings_loaded", self.bridge.settings["overlay"])
        else:
            self.bridge.send("settings_save_failed", {"scope": "overlay", "message": "Ceviri Katmani ayarlari kaydedilemedi."})

    def handle_toggle_overlay_visibility(self, payload: dict):
        if self.bridge.native_overlay is not None:
            self.bridge.native_overlay.toggle()

    def handle_test_overlay_push(self, payload: dict):
        if self.bridge.native_overlay is not None:
            self.bridge.native_overlay.push_sequence([str(payload.get("text", "Örnek Çeviri Metni"))], mode=str(self.bridge.settings["overlay"].get("mode", "fixed")), reading_speed=int(self.bridge.settings["app"].get("reading_speed_cps", 60)))

    def handle_clear_overlay(self, payload: dict):
        if self.bridge.native_overlay is not None and hasattr(self.bridge.native_overlay, "clear"):
            self.bridge.native_overlay.clear()

    def handle_shutdown(self, payload: dict):
        log_event(PREFIX_SYS, "099", "Arayuzden guvenli kapanis (graceful shutdown) sinyali alindi.")
        if self.bridge.worker is not None and hasattr(self.bridge.worker, "shutdown"):
            self.bridge.worker.shutdown()
        if self.bridge.shutdown_event is not None:
            self.bridge.shutdown_event.set()

    def handle_get_settings(self, payload: dict):
        self.bridge._emit_app_settings()
        self.bridge.send("overlay_settings_loaded", self.bridge.settings["overlay"])
        self.bridge._emit_saved_regions()
        self.bridge._emit_temporary_region_state()

    def handle_debug_session_start(self, payload: dict):
        if hasattr(self.bridge.worker, "diagnostics"):
            self.bridge._session_recorder.start_session(self.bridge.worker)
        else:
            self.bridge.send("debug_session_result", {"error": "Pipeline hazir degil."})

    def handle_debug_session_stop(self, payload: dict):
        self.bridge._session_recorder.stop_session()

    def handle_debug_config_update(self, payload: dict):
        self.bridge._session_recorder.config_update(payload)

    def handle_debug_config_reset(self, payload: dict):
        self.bridge._session_recorder.config_reset()

    def handle_debug_select_region(self, payload: dict):
        self.bridge._session_recorder.select_region()

    def handle_debug_preview_request(self, payload: dict):
        self.bridge._session_recorder.preview_request(payload)

    def handle_debug_region_clear(self, payload: dict):
        self.bridge._session_recorder.region_clear()

    def handle_shutdown_core(self, payload: dict):
        log_event(PREFIX_SYS, "039", "Arayuz istegiyle Python core kapatiliyor.", level="warning")
        if hasattr(self.bridge.worker, "offline_translator"):
            self.bridge.worker.offline_translator.cancel_download()
        if hasattr(self.bridge.worker, "stop"):
            self.bridge.worker.stop()
        if self.bridge.shutdown_event is not None:
            self.bridge.shutdown_event.set()
