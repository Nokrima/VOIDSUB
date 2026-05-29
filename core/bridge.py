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
    PREFIX_OCR, PREFIX_SYS, PREFIX_CFG, PREFIX_TRL,
    log_event, log_error, set_bridge_emitter, emit_bridge_event
)
from core.hardware import HardwareDetector
from core.debug.session_recorder import SessionRecorder

def _clip_log_text(text: str, limit: int = 160) -> str:
    if not text:
        return text
    s = text.replace('\n', ' ').strip()
    return s if len(s) <= limit else s[:limit] + "..."

class SettingsStore:
    def __init__(self, logger):
        self.logger = logger
        self.app_settings = self.load()
        self.app_settings["app_version"] = APP_VERSION

    def load(self) -> dict:
        if not SETTINGS_FILE.exists():
            return {}
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            self.logger.error(f"[SYSTEM] Ayarlar yüklenemedi: {e}")
            return {}

    def save(self) -> bool:
        try:
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(self.app_settings, f, indent=4)
            return True
        except Exception as e:
            self.logger.error(f"[SYSTEM] Ayarlar kaydedilemedi: {e}")
            return False

    def merge_payload(self, payload: dict) -> bool:
        self.app_settings = self._merge_dict(self.app_settings, payload)
        if "custom_profiles" in self.app_settings:
            self.app_settings["custom_profiles"] = self._normalize_custom_profiles(self.app_settings["custom_profiles"])
        return self.save()

    def _merge_dict(self, base: dict, incoming: dict) -> dict:
        result = deepcopy(base)
        for key, value in incoming.items():
            if isinstance(value, dict) and key in result and isinstance(result[key], dict):
                result[key] = self._merge_dict(result[key], value)
            else:
                result[key] = deepcopy(value)
        return result

    def _normalize_custom_profiles(self, profiles: Any) -> list[dict[str, Any]]:
        if not isinstance(profiles, list):
            return []
        normalized = []
        for p in profiles:
            norm = self._normalize_custom_profile(p)
            if norm:
                normalized.append(norm)
        return normalized

    def _normalize_custom_profile(self, profile: Any) -> dict[str, Any] | None:
        if not isinstance(profile, dict) or not profile.get("id") or not profile.get("name"):
            return None
        return {
            "id": str(profile["id"]),
            "name": str(profile["name"]),
            "is_custom": True,
            "engine_id": str(profile.get("engine_id", "easy")),
            "description": str(profile.get("description", "")),
            "is_disabled": bool(profile.get("is_disabled", False)),
            "overlay_overrides": self._normalize_profile_overlay_overrides(profile.get("overlay_overrides", {})),
            "app_overrides": self._normalize_profile_app_overrides(profile.get("app_overrides", {})),
        }

    def _normalize_profile_overlay_overrides(self, overrides: Any) -> dict[str, Any]:
        if not isinstance(overrides, dict):
            return {}
        result = {}
        if "font_size" in overrides: result["font_size"] = int(overrides["font_size"])
        if "font_weight" in overrides: result["font_weight"] = int(overrides["font_weight"])
        if "bg_opacity" in overrides: result["bg_opacity"] = float(overrides["bg_opacity"])
        if "text_color" in overrides: result["text_color"] = str(overrides["text_color"])
        if "bg_color" in overrides: result["bg_color"] = str(overrides["bg_color"])
        return result

    def _normalize_profile_app_overrides(self, overrides: Any) -> dict[str, Any]:
        if not isinstance(overrides, dict):
            return {}
        result = {}
        if "translation_engine" in overrides: result["translation_engine"] = str(overrides["translation_engine"])
        if "src_language" in overrides: result["src_language"] = str(overrides["src_language"])
        if "tgt_language" in overrides: result["tgt_language"] = str(overrides["tgt_language"])
        if "performance_preset" in overrides: result["performance_preset"] = str(overrides["performance_preset"])
        return result


class NativeRegionSelector:
    def __init__(self, bridge):
        self.bridge = bridge

    async def run(self) -> None:
        self.bridge.send("log_entry", {"timestamp": "", "level": "INFO", "prefix": "UI", "code": "UI-100", "message": "Native region selector baslatiliyor."})
        self.bridge.send("native_region_selection", {"status": "started"})
        try:
            result = await asyncio.to_thread(self._run_subprocess)
            if result.returncode == 0 and result.stdout.strip():
                try:
                    region_data = json.loads(result.stdout.strip())
                    normalized = self.bridge._normalize_region(region_data)
                    if normalized:
                        if self.bridge.worker and getattr(self.bridge.worker.pipeline, "is_running", False):
                            self.bridge._activate_temporary_region(normalized)
                            self.bridge.send("native_region_selection", {"status": "completed", "is_temporary": True, "region": normalized})
                        else:
                            self.bridge.persist_target_region(normalized)
                            self.bridge.send("native_region_selection", {"status": "completed", "is_temporary": False, "region": normalized})
                    else:
                        self.bridge.send("native_region_selection", {"status": "failed", "error": "Invalid payload format"})
                except json.JSONDecodeError:
                    self.bridge.send("native_region_selection", {"status": "failed", "error": "Invalid JSON from selector"})
            else:
                self.bridge.send("native_region_selection", {"status": "cancelled" if result.returncode == 1 else "failed", "error": result.stderr.strip()})
        except Exception as e:
            self.bridge.logger.error(f"[SYSTEM] Native region selector error: {e}")
            self.bridge.send("native_region_selection", {"status": "failed", "error": str(e)})

    def _run_subprocess(self) -> subprocess.CompletedProcess:
        exe_path = Path("ui-tauri/src-tauri/target/release/voidsub.exe").resolve()
        cmd = [str(exe_path), "--selector-mode"] if exe_path.exists() else ["cargo", "run", "--release", "--", "--selector-mode"]
        cwd = exe_path.parent.parent.parent.parent if exe_path.exists() else Path("ui-tauri/src-tauri").resolve()
        return subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd), creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)


class OverlayDispatcher:
    def __init__(self, bridge):
        self.bridge = bridge

    def dispatch(self, event: str, payload: Any) -> None:
        overlay = self.bridge.native_overlay
        if not overlay: return
        try:
            if event == "translation_result":
                overlay.set_text(payload.get("translated_text", ""))
            elif event == "translation_state":
                if payload.get("running") and payload.get("loading"):
                    overlay.set_text("Çeviri Motoru Yükleniyor...")
                elif payload.get("running"):
                    overlay.set_text("Çeviri Bekleniyor...")
                else:
                    overlay.hide()
            elif event == "saved_regions_update":
                regions = payload.get("regions", {})
                runtime_region = None
                if self.bridge.temporary_region_active and self.bridge.temporary_region:
                    runtime_region = self.bridge.temporary_region
                elif "target" in regions:
                    runtime_region = regions["target"]
                elif "calibration" in regions:
                    runtime_region = regions["calibration"]
                if runtime_region:
                    overlay.set_region(runtime_region)
                else:
                    overlay.hide()
            elif event == "app_settings":
                settings = payload.get("settings", {})
                if "overlay_opacity" in settings: overlay.set_opacity(settings["overlay_opacity"])
                if "overlay_font_size" in settings: overlay.set_font_size(settings["overlay_font_size"])
                if "overlay_font_weight" in settings: overlay.set_font_weight(settings["overlay_font_weight"])
                if "overlay_text_color" in settings: overlay.set_text_color(settings["overlay_text_color"])
                if "overlay_bg_color" in settings: overlay.set_bg_color(settings["overlay_bg_color"])
        except Exception as e:
            self.bridge.logger.error(f"[OverlayDispatcher] Failed to dispatch '{event}': {e}")


class WebsocketBroadcaster:
    def __init__(self, logger):
        self.logger = logger
        self.clients = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def add_client(self, client):
        self.clients.add(client)

    def remove_client(self, client):
        self.clients.discard(client)

    def send(self, event: str, data: Any = None, **kwargs) -> None:
        if data is None: data = {}
        data.update(kwargs)
        if event not in ("translation_result", "diagnostics_update"):
            self.logger.debug(f"[WS] -> {event}: {_clip_log_text(str(data))}")
        payload = json.dumps({"event": event, "data": data}, ensure_ascii=False)
        if self.loop and self.loop.is_running():
            asyncio.run_coroutine_threadsafe(self._broadcast(payload), self.loop)

    async def _broadcast(self, message: str):
        if not self.clients: return
        dead_clients = set()
        for client in self.clients:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                dead_clients.add(client)
        self.clients -= dead_clients


class BridgeServer:
    def __init__(self, worker: Any = None, host: str = WEBSOCKET_HOST, port: int = WEBSOCKET_PORT):
        self.worker = worker
        self.host = host
        self.port = port
        self.saved_regions: dict[str, dict[str, Any] | None] = {"calibration": None, "target": None}
        self.temporary_region = None
        self.temporary_region_active = False
        
        # Helper modules
        from core.errors import get_logger
        self.logger = get_logger()
        self.store = SettingsStore(self.logger)
        self.broadcaster = WebsocketBroadcaster(self.logger)
        self.native_selector = NativeRegionSelector(self)
        self.overlay_dispatcher = OverlayDispatcher(self)
        self.native_overlay = None
        
        self.hw_detector = HardwareDetector()
        
        # Backward compatibility aliases
        self.app_settings = self.store.app_settings
        self.clients = self.broadcaster.clients
        
        set_bridge_emitter(self.send)
        self._restore_saved_regions()
        
    @property
    def settings(self) -> dict[str, Any]:
        return self.store.app_settings
        
    def attach_worker(self, worker: Any) -> None:
        self.worker = worker

    def attach_native_overlay(self, overlay: Any) -> None:
        self.native_overlay = overlay
        self.logger.info("[BridgeServer] Native overlay attached.")
        self.overlay_dispatcher.dispatch("app_settings", {"settings": self.store.app_settings})
        self._emit_saved_regions()
        if getattr(self.worker.pipeline, "is_running", False):
            self.overlay_dispatcher.dispatch("translation_state", {"running": True})

    def _normalize_region(self, region: Any) -> dict[str, Any] | None:
        if not isinstance(region, dict): return None
        try:
            x = int(region.get("left", region.get("x", 0)))
            y = int(region.get("top", region.get("y", 0)))
            w = int(region["width"])
            h = int(region["height"])
            
            if w <= 0 or h <= 0:
                return None
                
            import ctypes
            import sys
            
            if sys.platform == "win32":
                v_x = ctypes.windll.user32.GetSystemMetrics(76)
                v_y = ctypes.windll.user32.GetSystemMetrics(77)
                v_w = ctypes.windll.user32.GetSystemMetrics(78)
                v_h = ctypes.windll.user32.GetSystemMetrics(79)
            else:
                v_x, v_y, v_w, v_h = 0, 0, 1920, 1080
                
            x = max(v_x, min(x, v_x + v_w - 1))
            y = max(v_y, min(y, v_y + v_h - 1))
            
            if x + w > v_x + v_w:
                w = v_x + v_w - x
            if y + h > v_y + v_h:
                h = v_y + v_h - y
                
            return {"left": x, "top": y, "width": w, "height": h}
        except (KeyError, ValueError, TypeError):
            return None

    def _prepare_runtime_region(self, region: Any) -> dict[str, Any] | None:
        norm = self._normalize_region(region)
        if not norm: return None
        return {
            "x": norm["left"],
            "y": norm["top"],
            "width": norm["width"],
            "height": norm["height"],
            "auto_detect": False,
        }

    def _restore_saved_regions(self) -> None:
        settings = self.store.app_settings
        if "calibration_region" in settings:
            self.saved_regions["calibration"] = self._normalize_region(settings["calibration_region"])
        if "target_region" in settings:
            self.saved_regions["target"] = self._normalize_region(settings["target_region"])

    def persist_target_region(self, region: Any) -> None:
        norm = self._normalize_region(region)
        if norm:
            self.saved_regions["target"] = norm
            self.store.merge_payload({"target_region": norm})
            self._emit_saved_regions()

    def _emit_temporary_region_state(self) -> None:
        self.broadcaster.send("temporary_region_state", {
            "active": self.temporary_region_active,
            "region": self.temporary_region,
        })
        self._emit_saved_regions()

    def _activate_temporary_region(self, region: dict[str, Any]) -> None:
        self.temporary_region = region
        self.temporary_region_active = True
        self._emit_temporary_region_state()
        if self.worker and self.worker.pipeline:
            runtime_r = self._prepare_runtime_region(region)
            if runtime_r:
                self.worker.pipeline.update_target_region(runtime_r)

    def _deactivate_temporary_region(self) -> None:
        self.temporary_region = None
        self.temporary_region_active = False
        self._emit_temporary_region_state()
        if self.worker and self.worker.pipeline:
            runtime_r = self._prepare_runtime_region(self.saved_regions.get("target"))
            if runtime_r:
                self.worker.pipeline.update_target_region(runtime_r)

    def persist_calibration_region(self, region: Any, frame: Any = None) -> None:
        norm = self._normalize_region(region)
        if norm:
            self.saved_regions["calibration"] = norm
            self.store.merge_payload({"calibration_region": norm})
            self._emit_saved_regions()

    def _emit_saved_regions(self) -> None:
        self.broadcaster.send("saved_regions_update", {"regions": self.saved_regions})
        self.overlay_dispatcher.dispatch("saved_regions_update", {"regions": self.saved_regions})

    def send(self, event, data=None, **kwargs):
        self.broadcaster.send(event, data, **kwargs)
        self.overlay_dispatcher.dispatch(event, data or kwargs)

    def _emit_app_settings(self) -> None:
        self.send("app_settings", {"settings": self.store.app_settings})

    async def _run_engine_repair(self, engine_id: str) -> None:
        self.send("log_entry", {"timestamp": "", "level": "INFO", "prefix": "SYS", "code": "SYS-055", "message": f"{engine_id} için onarım başlatılıyor..."})
        try:
            if engine_id == "easy":
                from core.ocr.easy_ocr import EasyOCREngine
                import shutil
                if Path("easyocr_models").exists(): shutil.rmtree("easyocr_models", ignore_errors=True)
                EasyOCREngine()
                self.send("repair_result", {"engine": engine_id, "success": True})
            else:
                self.send("repair_result", {"engine": engine_id, "success": False, "error": "Not supported"})
        except Exception as e:
            self.send("repair_result", {"engine": engine_id, "success": False, "error": str(e)})

    async def handler(self, websocket):
        self.broadcaster.add_client(websocket)
        self.logger.info("[BridgeServer] Yeni istemci bağlandı.")
        self.send("hello", {"message": "VoidSub Core Bağlandı", "hw_info": self.hw_detector.scan_system()})
        self._emit_app_settings()
        self._emit_saved_regions()
        if self.temporary_region_active: self._emit_temporary_region_state()
        
        try:
            async for message in websocket:
                try:
                    payload = json.loads(message)
                    event = payload.get("event")
                    data = payload.get("data", {})
                    if event not in ("diagnostics_update"):
                        self.logger.debug(f"[WS] <- {event}: {_clip_log_text(str(data))}")
                        
                    if event == "save_settings":
                        if self.store.merge_payload(data):
                            self._emit_app_settings()
                            self.send("log_entry", {"timestamp": "", "level": "SUCCESS", "prefix": "SYS", "code": "SYS-041", "message": "Ayarlar kaydedildi."})
                        else:
                            self.send("log_entry", {"timestamp": "", "level": "ERROR", "prefix": "SYS", "code": "SYS-042", "message": "Ayarlar kaydedilemedi."})
                    elif event == "update_target_region":
                        self.persist_target_region(data)
                    elif event == "activate_temporary_region":
                        self._activate_temporary_region(data)
                    elif event == "deactivate_temporary_region":
                        self._deactivate_temporary_region()
                    elif event == "update_calibration_region":
                        self.persist_calibration_region(data)
                    elif event == "start_native_region_selection":
                        asyncio.create_task(self.native_selector.run())
                    elif event == "repair_engine":
                        asyncio.create_task(self._run_engine_repair(data.get("engine_id", "easy")))
                    elif event == "request_active_session":
                        rec_state = {"active": False, "duration": 0.0}
                        self.send("active_session_state", {
                            "running": getattr(self.worker.pipeline, "is_running", False) if self.worker else False,
                            "loading": getattr(self.worker, "_engine_loading", False) if self.worker else False,
                            "active_engine": self.store.app_settings.get("translation_engine", "easy"),
                            "recording": rec_state,
                        })
                except json.JSONDecodeError:
                    self.logger.warning("[BridgeServer] Gecersiz JSON.")
        except websockets.exceptions.ConnectionClosed:
            self.logger.info("[BridgeServer] Istemci ayrildi.")
        finally:
            self.broadcaster.remove_client(websocket)

    async def start(self):
        self.broadcaster.loop = asyncio.get_running_loop()
        server = await websockets.serve(self.handler, self.host, self.port)
        self.logger.info(f"[BridgeServer] WebSocket basladi: ws://{self.host}:{self.port}")
        await asyncio.Future()

