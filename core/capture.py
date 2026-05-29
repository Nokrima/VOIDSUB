from __future__ import annotations

import base64
import ctypes
import ctypes.wintypes
import threading
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from core.errors import PREFIX_SYS, get_logger, log_error

Direct3D11CaptureFramePool = None
GraphicsCaptureAccess = None
GraphicsCaptureAccessKind = None
GraphicsCaptureItem = None
GraphicsCaptureSession = None
DirectXPixelFormat = None
create_direct3d11_device_from_dxgi_device = None
BitmapAlphaMode = None
BitmapPixelFormat = None
SoftwareBitmap = None
Buffer = None

D3D_DRIVER_TYPE_HARDWARE = 1
D3D11_CREATE_DEVICE_BGRA_SUPPORT = 0x20
D3D_FEATURE_LEVEL_11_1 = 0xB100
D3D_FEATURE_LEVEL_11_0 = 0xB000
SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79


class GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_uint32),
        ("Data2", ctypes.c_uint16),
        ("Data3", ctypes.c_uint16),
        ("Data4", ctypes.c_ubyte * 8),
    ]


class IUnknown(ctypes.Structure):
    _fields_ = [("lpVtbl", ctypes.POINTER(ctypes.c_void_p))]


IID_IDXGIDevice = GUID(
    0x54EC77FA,
    0x1377,
    0x44E6,
    (ctypes.c_ubyte * 8)(0x8C, 0x32, 0x88, 0xFD, 0x5F, 0x44, 0xC8, 0x4C),
)

def _load_winrt_runtime() -> bool:
    global Direct3D11CaptureFramePool
    global GraphicsCaptureAccess
    global GraphicsCaptureAccessKind
    global GraphicsCaptureItem
    global GraphicsCaptureSession
    global DirectXPixelFormat
    global create_direct3d11_device_from_dxgi_device
    global BitmapAlphaMode
    global BitmapPixelFormat
    global SoftwareBitmap
    global Buffer

    if GraphicsCaptureSession is not None:
        return True

    try:
        import sys
        import winrt
        from winrt.windows.graphics.capture import (
            Direct3D11CaptureFramePool as _Direct3D11CaptureFramePool,
            GraphicsCaptureAccess as _GraphicsCaptureAccess,
            GraphicsCaptureAccessKind as _GraphicsCaptureAccessKind,
            GraphicsCaptureItem as _GraphicsCaptureItem,
            GraphicsCaptureSession as _GraphicsCaptureSession,
        )
        from winrt.windows.graphics.directx import DirectXPixelFormat as _DirectXPixelFormat
        from winrt.windows.graphics.directx.direct3d11.interop import (
            create_direct3d11_device_from_dxgi_device as _create_direct3d11_device_from_dxgi_device,
        )
        from winrt.windows.graphics.imaging import (
            BitmapAlphaMode as _BitmapAlphaMode,
            BitmapPixelFormat as _BitmapPixelFormat,
            SoftwareBitmap as _SoftwareBitmap,
        )
        from winrt.windows.storage.streams import Buffer as _Buffer

        if getattr(sys, "frozen", False) or "__compiled__" in globals():
            overlay_root = Path(sys.executable).parent / "core" / "ocr" / "_winrt_overlay" / "winrt"
        else:
            overlay_root = Path(__file__).resolve().parent / "ocr" / "_winrt_overlay" / "winrt"

        if overlay_root.exists() and str(overlay_root) not in winrt.__path__:
            winrt.__path__.append(str(overlay_root))

        Direct3D11CaptureFramePool = _Direct3D11CaptureFramePool
        GraphicsCaptureAccess = _GraphicsCaptureAccess
        GraphicsCaptureAccessKind = _GraphicsCaptureAccessKind
        GraphicsCaptureItem = _GraphicsCaptureItem
        GraphicsCaptureSession = _GraphicsCaptureSession
        DirectXPixelFormat = _DirectXPixelFormat
        create_direct3d11_device_from_dxgi_device = _create_direct3d11_device_from_dxgi_device
        BitmapAlphaMode = _BitmapAlphaMode
        BitmapPixelFormat = _BitmapPixelFormat
        SoftwareBitmap = _SoftwareBitmap
        Buffer = _Buffer
        return True
    except Exception as exc:
        log_error(PREFIX_SYS, "076", str(exc), "WinRT runtime yuklenemedi.")
        return False


class ScreenCapturer:
    _FRAME_HOLD_SECONDS = 0.35
    _CAPTURE_INSET_TOP_RATIO = 0.06
    _CAPTURE_INSET_SIDE_RATIO = 0.012
    _CAPTURE_INSET_BOTTOM_RATIO = 0.02
    _CAPTURE_INSET_TOP_MAX = 14
    _CAPTURE_INSET_SIDE_MAX = 12
    _CAPTURE_INSET_BOTTOM_MAX = 8

    def __init__(self):
        self.logger = get_logger()
        self._last_resolved_region = None
        self._latest_frame_bgra: np.ndarray | None = None
        self._latest_frame_bounds = self._virtual_bounds()
        self._latest_frame_time = 0.0
        self._latest_frame_seq = 0
        self._last_delivered_seq = 0
        self._frame_lock = threading.Lock()
        self._frame_ready = threading.Event()
        self._stop_event = threading.Event()
        self._capture_thread: threading.Thread | None = None
        self._runtime_error: str | None = None
        self._backend = "unavailable"
        self._capture_state = "unavailable"
        self.start_camera()

    def start_camera(self) -> bool:
        if self._capture_thread is not None and self._capture_thread.is_alive():
            return True
        if not _load_winrt_runtime():
            self._runtime_error = "WinRT runtime import failed"
            self._backend = "unavailable"
            self._set_capture_state("unavailable")
            return False
        try:
            supported = bool(GraphicsCaptureSession.is_supported())
        except Exception as exc:
            self._runtime_error = str(exc)
            self._backend = "unavailable"
            self._set_capture_state("unavailable")
            log_error(PREFIX_SYS, "014", str(exc), "WGC destek durumu sorgulanamadi.")
            return False
        self.logger.info(f"[{PREFIX_SYS}-075] WGC start requested: supported={supported}")
        if not supported:
            self._runtime_error = "Windows Graphics Capture unsupported"
            self._backend = "unavailable"
            self._set_capture_state("unavailable")
            log_error(PREFIX_SYS, "014", "Windows Graphics Capture unsupported", "WGC bu sistemde desteklenmiyor.")
            return False
        self._stop_event.clear()
        self._frame_ready.clear()
        self._runtime_error = None
        self._latest_frame_time = 0.0
        self._latest_frame_seq = 0
        self._last_delivered_seq = 0
        self._set_capture_state("starting")
        self._capture_thread = threading.Thread(target=self._capture_worker, name="wgc-capture", daemon=True)
        self._capture_thread.start()
        if not self._frame_ready.wait(timeout=3.0):
            reason = self._runtime_error or "WGC ilk kareyi uretemedi."
            log_error(
                PREFIX_SYS,
                "014",
                (
                    f"{reason}; state={self._capture_state}; "
                    f"thread_alive={self._capture_thread.is_alive() if self._capture_thread is not None else None}"
                ),
                "Windows Graphics Capture baslatilamadi.",
            )
            self._backend = "unavailable"
            self._set_capture_state("unavailable")
            return False
        self._backend = "wgc"
        self.logger.info(f"[{PREFIX_SYS}-059] Kamera basariyla calistirildi: wgc")
        return True

    def capture_region(self, region: dict) -> Optional[np.ndarray]:
        if not region or self._backend != "wgc":
            self.logger.debug(f"[{PREFIX_SYS}-076] Capture skipped: backend={self._backend}, region={region}")
            return None
        self._check_capture_health()
        resolved = self.resolve_region(region)
        with self._frame_lock:
            frame = self._latest_frame_bgra
            bounds = dict(self._latest_frame_bounds)
            frame_age = time.monotonic() - self._latest_frame_time if self._latest_frame_time > 0 else float("inf")
            frame_seq = self._latest_frame_seq
        if frame is None:
            self._set_capture_state("unavailable")
            self.logger.debug(f"[{PREFIX_SYS}-077] Capture unavailable: resolved={resolved}, bounds={bounds}, frame_seq={frame_seq}")
            return None
        self._set_capture_state("fresh", frame_age)
        left = int(resolved.get("left", 0)) - bounds["left"]
        top = int(resolved.get("top", 0)) - bounds["top"]
        width = int(resolved.get("width", 0))
        height = int(resolved.get("height", 0))
        inset_left, inset_top, inset_right, inset_bottom = self._capture_inset(width, height)
        left += inset_left
        top += inset_top
        width = max(1, width - inset_left - inset_right)
        height = max(1, height - inset_top - inset_bottom)
        x1 = max(left, 0)
        y1 = max(top, 0)
        x2 = min(left + width, frame.shape[1])
        y2 = min(top + height, frame.shape[0])
        if x2 <= x1 or y2 <= y1:
            self.logger.debug(
                f"[{PREFIX_SYS}-078] Capture empty crop: requested={region}, resolved={resolved}, "
                f"bounds={bounds}, crop=({left},{top},{x2},{y2}), frame_shape={frame.shape}"
            )
            return None
        cropped = frame[y1:y2, x1:x2]
        self._last_delivered_seq = frame_seq
        return cv2.cvtColor(cropped, cv2.COLOR_BGRA2BGR)

    def capture_virtual_desktop_png_data_url(self) -> Optional[str]:
        self._check_capture_health()
        with self._frame_lock:
            frame = None if self._latest_frame_bgra is None else self._latest_frame_bgra.copy()
        if frame is None:
            return None
        try:
            ok, encoded = cv2.imencode(".png", frame)
            if not ok:
                return None
            payload = base64.b64encode(encoded.tobytes()).decode("ascii")
            return f"data:image/png;base64,{payload}"
        except Exception as exc:
            log_error(PREFIX_SYS, "015", str(exc), "Secim onizleme goruntusu alinamadi.")
            return None

    def stop_camera(self) -> None:
        self._stop_event.set()
        if self._capture_thread is not None:
            self._capture_thread.join(timeout=2.0)
            self._capture_thread = None
        self._backend = "unavailable"
        self._set_capture_state("stopped")

    def resolve_region(self, region: dict) -> dict:
        next_region = dict(region) if isinstance(region, dict) else region
        bounds = self._virtual_bounds()
        v_left = bounds["left"]
        v_top = bounds["top"]
        v_right = v_left + bounds["width"]
        v_bottom = v_top + bounds["height"]
        
        next_region["left"] = max(v_left, min(int(next_region.get("left", 0)), v_right - 10))
        next_region["top"] = max(v_top, min(int(next_region.get("top", 0)), v_bottom - 10))
        next_region["width"] = max(10, min(int(next_region.get("width", 0)), v_right - next_region["left"]))
        next_region["height"] = max(10, min(int(next_region.get("height", 0)), v_bottom - next_region["top"]))

        self._last_resolved_region = dict(next_region) if isinstance(next_region, dict) else None
        return next_region

    def get_last_resolved_region(self) -> Optional[dict]:
        return dict(self._last_resolved_region) if isinstance(self._last_resolved_region, dict) else None

    def refresh_region_anchor(self, region: dict) -> dict:
        if not isinstance(region, dict):
            return region
        follow_window = region.get("follow_window")
        if not isinstance(follow_window, dict):
            self.logger.debug(f"[{PREFIX_SYS}-060] Region refresh bypassed: no_follow_window region={region}")
            return dict(region)
        resolved = self._resolve_window_region(follow_window)
        if not resolved:
            self.logger.debug(f"[{PREFIX_SYS}-061] Region refresh failed: follow_window={follow_window}, using_saved_region={region}")
            return dict(region)
        next_region = dict(region)
        next_region.update({
            "left": resolved["left"],
            "top": resolved["top"],
            "width": resolved["width"],
            "height": resolved["height"],
            "follow_window": resolved["follow_window"],
        })
        self.logger.debug(
            f"[{PREFIX_SYS}-062] Region refresh resolved: saved_region={region}, resolved_region={next_region}"
        )
        return next_region

    def get_capture_state(self) -> str:
        return self._capture_state

    def _capture_inset(self, width: int, height: int) -> tuple[int, int, int, int]:
        if width <= 0 or height <= 0:
            return (0, 0, 0, 0)
        side_inset = min(self._CAPTURE_INSET_SIDE_MAX, int(width * self._CAPTURE_INSET_SIDE_RATIO))
        top_inset = min(self._CAPTURE_INSET_TOP_MAX, int(height * self._CAPTURE_INSET_TOP_RATIO))
        bottom_inset = min(self._CAPTURE_INSET_BOTTOM_MAX, int(height * self._CAPTURE_INSET_BOTTOM_RATIO))
        if width - side_inset * 2 < 120:
            side_inset = max(0, (width - 120) // 2)
        if height - top_inset - bottom_inset < 48:
            total = max(0, height - 48)
            top_inset = min(top_inset, total)
            bottom_inset = min(bottom_inset, max(0, total - top_inset))
        return (side_inset, top_inset, side_inset, bottom_inset)

    def _capture_worker(self) -> None:
        pool = None
        session = None
        try:
            winrt_device = self._create_winrt_device()
            access = GraphicsCaptureAccess.request_access_async(GraphicsCaptureAccessKind.BORDERLESS).get()
            if int(access) != 4:
                raise RuntimeError(f"WGC erisim izni reddedildi: {int(access)}")
            item = GraphicsCaptureItem.try_create_from_display_id((0,))
            if item is None:
                raise RuntimeError("WGC ekran ogesi olusturulamadi.")
            pool = Direct3D11CaptureFramePool.create_free_threaded(
                winrt_device,
                DirectXPixelFormat.B8_G8_R8_A8_UINT_NORMALIZED,
                2,
                item.size,
            )
            session = pool.create_capture_session(item)
            session.is_cursor_capture_enabled = False
            session.is_border_required = False
            session.start_capture()
            while not self._stop_event.is_set():
                frame = pool.try_get_next_frame()
                if frame is None:
                    time.sleep(0.01)
                    continue
                with frame:
                    bitmap = SoftwareBitmap.create_copy_with_alpha_from_surface_async(
                        frame.surface,
                        BitmapAlphaMode.PREMULTIPLIED,
                    ).get()
                    try:
                        if bitmap.bitmap_pixel_format != BitmapPixelFormat.BGRA8:
                            converted = SoftwareBitmap.convert_with_alpha(bitmap, BitmapPixelFormat.BGRA8, BitmapAlphaMode.PREMULTIPLIED)
                            bitmap.close()
                            bitmap = converted
                        buffer = Buffer(bitmap.pixel_width * bitmap.pixel_height * 4)
                        bitmap.copy_to_buffer(buffer)
                        pixels = np.frombuffer(bytes(buffer), dtype=np.uint8).reshape((bitmap.pixel_height, bitmap.pixel_width, 4))
                        with self._frame_lock:
                            self._latest_frame_bgra = pixels.copy()
                            self._latest_frame_bounds = self._virtual_bounds()
                            self._latest_frame_time = time.monotonic()
                            self._latest_frame_seq += 1
                        self._frame_ready.set()
                        self._set_capture_state("fresh", 0.0)
                    finally:
                        bitmap.close()
                        del bitmap
                        del frame
        except Exception as exc:
            self._runtime_error = str(exc)
            log_error(PREFIX_SYS, "013", str(exc), "WGC ile goruntu alinamadi.")
        finally:
            if session is not None:
                session.close()
            if pool is not None:
                pool.close()

    def _check_capture_health(self) -> None:
        thread = self._capture_thread
        if thread is not None and thread.is_alive():
            return
        self._set_capture_state("worker_stopped")
        log_error(PREFIX_SYS, "012", self._runtime_error or "worker_stopped", "WGC worker durdu.")

    def _set_capture_state(self, state: str, frame_age: float | None = None) -> None:
        if state == self._capture_state:
            return
        self._capture_state = state
        if state in {"starting", "stopped", "unavailable", "worker_stopped"}:
            return

    def _create_winrt_device(self):
        d3d11_create_device = ctypes.windll.d3d11.D3D11CreateDevice
        d3d11_create_device.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_uint),
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_uint),
            ctypes.POINTER(ctypes.c_void_p),
        ]
        d3d11_create_device.restype = ctypes.c_long
        levels = (ctypes.c_uint * 2)(D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0)
        device = ctypes.c_void_p()
        context = ctypes.c_void_p()
        feature_level = ctypes.c_uint()
        hr = d3d11_create_device(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            levels,
            2,
            7,
            ctypes.byref(device),
            ctypes.byref(feature_level),
            ctypes.byref(context),
        )
        if hr != 0 or not device.value:
            raise RuntimeError(f"D3D11 cihaz olusturulamadi: 0x{hr & 0xFFFFFFFF:08X}")
        unknown = ctypes.cast(device, ctypes.POINTER(IUnknown))
        query_interface = ctypes.WINFUNCTYPE(
            ctypes.c_long,
            ctypes.POINTER(IUnknown),
            ctypes.POINTER(GUID),
            ctypes.POINTER(ctypes.c_void_p),
        )(unknown.contents.lpVtbl[0])
        dxgi_device = ctypes.c_void_p()
        hr = query_interface(unknown, ctypes.byref(IID_IDXGIDevice), ctypes.byref(dxgi_device))
        if hr != 0 or not dxgi_device.value:
            raise RuntimeError(f"IDXGIDevice alinamadi: 0x{hr & 0xFFFFFFFF:08X}")
        return create_direct3d11_device_from_dxgi_device(dxgi_device.value)

    def _virtual_bounds(self) -> dict[str, int]:
        user32 = ctypes.windll.user32
        return {
            "left": int(user32.GetSystemMetrics(SM_XVIRTUALSCREEN)),
            "top": int(user32.GetSystemMetrics(SM_YVIRTUALSCREEN)),
            "width": int(user32.GetSystemMetrics(SM_CXVIRTUALSCREEN)),
            "height": int(user32.GetSystemMetrics(SM_CYVIRTUALSCREEN)),
        }

    def _resolve_window_region(self, follow_window: dict) -> Optional[dict]:
        try:
            user32 = ctypes.windll.user32
            hwnd = self._resolve_follow_window_handle(follow_window)
            if hwnd <= 0 or not user32.IsWindow(hwnd):
                self.logger.debug(f"[{PREFIX_SYS}-063] Window region resolve: no_valid_hwnd follow_window={follow_window}")
                return None
            rect = ctypes.wintypes.RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                self.logger.debug(f"[{PREFIX_SYS}-064] Window region resolve: GetWindowRect failed hwnd={hwnd}")
                return None
            result = {
                "left": int(rect.left) + int(follow_window.get("offset_left", 0)),
                "top": int(rect.top) + int(follow_window.get("offset_top", 0)),
                "width": int(follow_window.get("width", 0)),
                "height": int(follow_window.get("height", 0)),
                "follow_window": self._build_follow_window_metadata(
                    hwnd=hwnd,
                    follow_window=follow_window,
                    rect=rect,
                ),
            }
            self.logger.debug(f"[{PREFIX_SYS}-065] Window region resolve: hwnd={hwnd}, result={result}")
            return result
        except Exception as exc:
            log_error(PREFIX_SYS, "016", str(exc), "Pencere bagli yakalama bolgesi cozulurken hata olustu.")
            return None

    def _resolve_follow_window_handle(self, follow_window: dict) -> int:
        user32 = ctypes.windll.user32
        hwnd = int(follow_window.get("hwnd", 0))
        if hwnd > 0 and user32.IsWindow(hwnd):
            if self._window_matches_metadata(hwnd, follow_window):
                self.logger.debug(f"[{PREFIX_SYS}-066] Follow window handle reused: hwnd={hwnd}, follow_window={follow_window}")
                return hwnd
            self.logger.debug(f"[{PREFIX_SYS}-067] Follow window handle mismatch: hwnd={hwnd}, follow_window={follow_window}")
        rebound = self._find_matching_window(follow_window)
        self.logger.debug(f"[{PREFIX_SYS}-068] Follow window rebound: old_hwnd={hwnd}, rebound_hwnd={rebound}, follow_window={follow_window}")
        return int(rebound or 0)

    def _window_matches_metadata(self, hwnd: int, follow_window: dict) -> bool:
        expected_pid = int(follow_window.get("pid", 0) or 0)
        expected_title = str(follow_window.get("title", "") or "").strip()
        expected_class = str(follow_window.get("class_name", "") or "").strip()
        if expected_pid <= 0 and not expected_title and not expected_class:
            return True
        meta = self._get_window_metadata(hwnd)
        if meta is None:
            return False
        if expected_pid > 0 and meta["pid"] != expected_pid:
            return False
        if expected_class and meta["class_name"] != expected_class:
            return False
        if expected_title and meta["title"] != expected_title:
            return False
        return True

    def _build_follow_window_metadata(self, hwnd: int, follow_window: dict, rect: ctypes.wintypes.RECT) -> dict:
        meta = self._get_window_metadata(hwnd) or {}
        return {
            "hwnd": int(hwnd),
            "offset_left": int(follow_window.get("offset_left", 0)),
            "offset_top": int(follow_window.get("offset_top", 0)),
            "width": int(follow_window.get("width", 0)),
            "height": int(follow_window.get("height", 0)),
            "pid": int(meta.get("pid", 0)),
            "title": str(meta.get("title", "") or ""),
            "class_name": str(meta.get("class_name", "") or ""),
            "window_left": int(rect.left),
            "window_top": int(rect.top),
            "window_width": int(rect.right - rect.left),
            "window_height": int(rect.bottom - rect.top),
        }

    def _get_window_metadata(self, hwnd: int) -> Optional[dict]:
        try:
            user32 = ctypes.windll.user32
            if hwnd <= 0 or not user32.IsWindow(hwnd):
                return None
            title_buffer = ctypes.create_unicode_buffer(512)
            user32.GetWindowTextW(hwnd, title_buffer, len(title_buffer))
            class_buffer = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, class_buffer, len(class_buffer))
            pid = ctypes.wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            return {
                "pid": int(pid.value),
                "title": title_buffer.value,
                "class_name": class_buffer.value,
            }
        except Exception as exc:
            log_error(PREFIX_SYS, "019", str(exc), f"Pencere metadatası alınırken hata (hwnd: {hwnd}).")
            return None

    def _find_matching_window(self, follow_window: dict) -> Optional[int]:
        user32 = ctypes.windll.user32
        expected_pid = int(follow_window.get("pid", 0) or 0)
        expected_title = str(follow_window.get("title", "") or "").strip()
        expected_class = str(follow_window.get("class_name", "") or "").strip()
        if expected_pid <= 0 and not expected_title and not expected_class:
            return None

        matches: list[tuple[int, int]] = []
        enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

        @enum_proc
        def _callback(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            meta = self._get_window_metadata(int(hwnd))
            if meta is None:
                return True
            score = 0
            if expected_pid > 0 and meta["pid"] == expected_pid:
                score += 4
            if expected_class and meta["class_name"] == expected_class:
                score += 2
            if expected_title and meta["title"] == expected_title:
                score += 2
            if score > 0:
                matches.append((score, int(hwnd)))
            return True

        user32.EnumWindows(_callback, 0)
        if not matches:
            return None
        matches.sort(key=lambda item: item[0], reverse=True)
        return matches[0][1]

    def get_full_window_bounds(self, region: dict) -> Optional[dict]:
        follow_window = region.get("follow_window")
        if not isinstance(follow_window, dict):
            return None
        try:
            user32 = ctypes.windll.user32
            hwnd = int(follow_window.get("hwnd", 0))
            if hwnd <= 0 or not user32.IsWindow(hwnd):
                return None
            rect = ctypes.wintypes.RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                return None
            win_w = max(rect.right - rect.left, 1)
            win_h = max(rect.bottom - rect.top, 1)
            skip_top = int(win_h * 0.10)
            keep_h = int(win_h * 0.70)
            return {
                "left": int(rect.left),
                "top": int(rect.top) + skip_top,
                "width": win_w,
                "height": keep_h,
            }
        except Exception as exc:
            log_error(PREFIX_SYS, "017", str(exc), "Tum pencere sinirlari alinamadi.")
            return None
