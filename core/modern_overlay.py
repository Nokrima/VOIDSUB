from __future__ import annotations
"""Native PySide6 subtitle overlay."""

import ctypes
import queue
import threading
from collections import deque

from typing import TYPE_CHECKING, Any, cast

if TYPE_CHECKING:
    from PySide6.QtWidgets import QApplication, QWidget
    from PySide6.QtCore import Qt, QTimer, Signal, QObject, QRect, QRectF, QPoint
    from PySide6.QtGui import QPainter, QColor, QFont, QPainterPath, QPen, QFontMetrics
else:
    try:
        from PySide6.QtWidgets import QApplication, QWidget
        from PySide6.QtCore import Qt, QTimer, Signal, QObject, QRect, QRectF, QPoint
        from PySide6.QtGui import QPainter, QColor, QFont, QPainterPath, QPen, QFontMetrics
    except ImportError:
        class _MissingPySide6:
            def __init__(self, *args, **kwargs):
                raise RuntimeError("PySide6 kullanilabilir degil.")

        class _MissingQt:
            FramelessWindowHint = 0
            WindowStaysOnTopHint = 0
            Tool = 0
            WindowDoesNotAcceptFocus = 0
            WA_TranslucentBackground = 0
            LeftButton = 0
            RightButton = 0
            NoPen = 0
            AlignCenter = 0
            AlignLeft = 0
            AlignTop = 0
            TextWordWrap = 0

        class _MissingSignal:
            def __init__(self, *args, **kwargs):
                pass

            def connect(self, *args, **kwargs):
                pass

            def emit(self, *args, **kwargs):
                pass

        class QObject:
            pass

        class QWidget:
            pass

        QApplication = _MissingPySide6
        QTimer = _MissingPySide6
        Signal = _MissingSignal
        Qt = _MissingQt()
        QRect = _MissingPySide6
        QRectF = _MissingPySide6
        QPoint = _MissingPySide6
        QPainter = _MissingPySide6
        QColor = _MissingPySide6
        QFont = _MissingPySide6
        QPainterPath = _MissingPySide6
        QPen = _MissingPySide6
        QFontMetrics = _MissingPySide6

import win32gui
import win32con

from core.errors import PREFIX_SYS, get_logger, log_error

SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79
GWL_EXSTYLE = -20
SWP_NOMOVE = 0x0002
SWP_NOSIZE = 0x0001
SWP_NOZORDER = 0x0004
SWP_FRAMECHANGED = 0x0020

class OverlaySignals(QObject):
    set_style = Signal(str, int, str, bool) # type: ignore
    set_mode = Signal(str)
    set_region = Signal(object)
    set_snap_to_region = Signal(bool)
    apply_settings = Signal(dict)
    show_window = Signal()
    hide_window = Signal()
    toggle_window = Signal()
    push = Signal(str, int)
    prepare_capture = Signal()
    finish_capture = Signal(bool)
    drag_started = Signal(int, int)
    drag_moved = Signal(int, int)
    drag_released = Signal()
    drag_reset = Signal()
    clear = Signal()
    keep_alive = Signal()
    update_last = Signal(str, int)
    display_changed = Signal()

class OverlayWidget(QWidget):
    def __init__(self, controller: "ModernOverlay"):
        super().__init__()
        self.controller = controller
        
        self.setWindowFlags(
            Qt.FramelessWindowHint | # type: ignore
            Qt.WindowStaysOnTopHint | # type: ignore
            Qt.Tool | # type: ignore
            Qt.WindowDoesNotAcceptFocus # type: ignore
        )
        self.setAttribute(Qt.WA_TranslucentBackground, True) # type: ignore
        self.setMouseTracking(True)
        
        self._apply_clickthrough(True)

    def _apply_clickthrough(self, enabled: bool):
        hwnd = self.winId()
        ex_style = win32gui.GetWindowLong(hwnd, GWL_EXSTYLE)
        
        # Tam şeffaf kısımlar fareyi geçirir, yarı saydam ve dolu alanlar (metin/kart) tıklanabilir olur.
        # Bu sayede kullanıcı sürükleyip bırakabilir.
        ex_style &= ~win32con.WS_EX_TRANSPARENT
        ex_style |= win32con.WS_EX_LAYERED | win32con.WS_EX_NOACTIVATE | win32con.WS_EX_TOPMOST
            
        win32gui.SetWindowLong(hwnd, GWL_EXSTYLE, ex_style)
        win32gui.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED)

    def set_clickthrough(self, enabled: bool):
        self._apply_clickthrough(enabled)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton: # type: ignore
            self._drag_ignored = False
            self.controller._drag_active = True
            self.controller.signals.drag_started.emit(event.globalPosition().x(), event.globalPosition().y())
        elif event.button() == Qt.RightButton: # type: ignore
            self._drag_ignored = True
            self.controller._drag_active = False
            self.controller.signals.drag_reset.emit()

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.LeftButton and not getattr(self, "_drag_ignored", False): # type: ignore
            self.controller.signals.drag_moved.emit(event.globalPosition().x(), event.globalPosition().y())

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton: # type: ignore
            self._drag_ignored = False
            self.controller._drag_active = False
            self.controller.signals.drag_released.emit()

    def enterEvent(self, event):
        self.controller.hover_active = True
        self.update()
        
    def leaveEvent(self, event):
        self.controller.hover_active = False
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing) # type: ignore
        painter.setRenderHint(QPainter.TextAntialiasing) # type: ignore
        self.controller._draw(painter)

    def nativeEvent(self, eventType, message):
        try:
            import ctypes.wintypes
            msg = ctypes.wintypes.MSG.from_address(message.__int__())
            if msg.message == 0x007E:  # WM_DISPLAYCHANGE
                self.controller.signals.display_changed.emit()
        except Exception:
            pass
        return super().nativeEvent(eventType, message)


class ModernOverlay:
    """Shows translated subtitle text on a transparent GPU-accelerated PySide6 layer."""

    def __init__(self, width: int = 1280, y_ratio: float = 0.79) -> None:
        self.logger = get_logger()
        self.mode, self.lines = "fixed", deque(maxlen=3)
        self.font, self.size, self.color, self.bold = "Tahoma", 18, "#FDE68A", False
        self._computed_size = 18
        self.alpha = 0.5
        self.bg_visible = True
        self.anim = "fade"
        self.shadow = False
        self.visible = False
        self._started = False
        self._width = width
        self._y_ratio = y_ratio
        self._ready = threading.Event()
        self._hidden_by_user = False
        self._manual_position = False
        self._saved_manual_x = None
        self._saved_manual_y = None
        self._anim_timer = None
        self._anim_progress = 1.0
        self.hover_active = False
        self._last_region: dict | None = None
        self.snap_to_region = True
        self._hide_after_timer = None
        self._capture_restore_visible = False
        self._capture_suppressed = 0
        self._sequence_id = 0
        self._available = True
        self._drag_active = False
        
        self.w = width
        self.h = 180
        self.x = 0
        self.y = 0
        self.dx = 0
        self.dy = 0
        
        self.app: QApplication | None = None
        self.window: OverlayWidget | None = None
        self.signals: OverlaySignals | None = None

    def start(self) -> None:
        if not self._available: return
        if self._started: return
        self._started = True
        threading.Thread(target=self._bootstrap, daemon=True).start()
        self._ready.wait(timeout=2)

    def _bootstrap(self) -> None:
        try:
            if not QApplication.instance():
                self.app = QApplication([])
            else:
                self.app = QApplication.instance()
                
            self.signals = OverlaySignals()
            self.window = OverlayWidget(self)
            
            # Connect signals
            self.signals.set_style.connect(self._do_set_style)
            self.signals.set_mode.connect(self._do_set_mode)
            self.signals.set_region.connect(self._do_set_region)
            self.signals.set_snap_to_region.connect(self._do_set_snap_to_region)
            self.signals.apply_settings.connect(self._do_apply_settings)
            self.signals.show_window.connect(self._do_show)
            self.signals.hide_window.connect(self._do_hide)
            self.signals.toggle_window.connect(self._do_toggle)
            self.signals.push.connect(self._do_push)
            self.signals.prepare_capture.connect(self._do_prepare_capture)
            self.signals.finish_capture.connect(self._do_finish_capture)
            self.signals.drag_started.connect(self._drag_start)
            self.signals.drag_moved.connect(self._drag_move)
            self.signals.drag_released.connect(self._drag_release)
            self.signals.drag_reset.connect(self._drag_reset)
            self.signals.clear.connect(self._do_clear)
            self.signals.keep_alive.connect(self._do_keep_alive)
            self.signals.update_last.connect(self._do_update_last)
            self.signals.display_changed.connect(self._do_display_changed)
            
            self._hide_after_timer = QTimer()
            self._hide_after_timer.setSingleShot(True)
            self._hide_after_timer.timeout.connect(self._on_hide_timer)
            
            self._anim_timer = QTimer()
            self._anim_timer.timeout.connect(self._on_anim_tick)
            
            self._bounds_timer = QTimer()
            self._bounds_timer.timeout.connect(self._check_bounds)
            self._bounds_timer.start(2000)
            self._last_bounds = self._virtual_bounds()
            
            bounds = self._last_bounds
            self.w = min(self._width, max(520, bounds["width"] - 120))
            self.h = 180
            self.x = bounds["left"] + max(40, (bounds["width"] - self.w) // 2)
            self.y = bounds["top"] + int(bounds["height"] * self._y_ratio) - self.h // 2
            
            self.window.setGeometry(self.x, self.y, self.w, self.h)
            
            self._ready.set()
            if self.app:
                self.app.exec()
        except Exception as exc:
            self._available = False
            self._ready.set()
            log_error(PREFIX_SYS, "018", f"[Arayüz (Overlay)] -> BAŞLATILAMADI | Hata: {exc}", "Modern overlay baslatilamadi.")

    def _drag_start(self, x: int, y: int):
        self.dx, self.dy = x - self.x, y - self.y
        if self._hide_after_timer:
            self._hide_after_timer.stop() # Kullanıcı tuttuğunda kaybolmasını engelle

    def _drag_move(self, x: int, y: int):
        self.x = x - self.dx
        self.y = y - self.dy
        self._manual_position = True
        self._saved_manual_x = self.x
        self._saved_manual_y = self.y
        self.x, self.y = self._clamp_geometry(self.x, self.y, self.w, self.h)
        if self.window:
            self.window.setGeometry(self.x, self.y, self.w, self.h)

    def _drag_release(self):
        # Bırakıldıktan sonra, eğer kapatılmamışsa timer'ı baştan başlat (6 saniye)
        if self._hide_after_timer and not self._hidden_by_user and self.lines:
            self._hide_after_timer.setInterval(6000)
            self._hide_after_timer.start()

    def _drag_reset(self):
        self._manual_position = False
        self._saved_manual_x = None
        self._saved_manual_y = None
        if self._hide_after_timer:
            self._hide_after_timer.stop()
        self._place_near_region()
        self._render()

    def _check_bounds(self) -> None:
        if not self.window: return
        current_bounds = self._virtual_bounds()
        if current_bounds != getattr(self, "_last_bounds", None):
            self._last_bounds = current_bounds
            if not self._manual_position:
                self._place_near_region()
            else:
                self.x, self.y = self._clamp_geometry(self.x, self.y, self.w, self.h)
                self.window.setGeometry(self.x, self.y, self.w, self.h)

    def _virtual_bounds(self) -> dict[str, int]:
        user32 = ctypes.windll.user32
        left = int(user32.GetSystemMetrics(SM_XVIRTUALSCREEN))
        top = int(user32.GetSystemMetrics(SM_YVIRTUALSCREEN))
        width = int(user32.GetSystemMetrics(SM_CXVIRTUALSCREEN))
        height = int(user32.GetSystemMetrics(SM_CYVIRTUALSCREEN))
        if width <= 0 or height <= 0:
            return {"left": 0, "top": 0, "width": 1920, "height": 1080}
        return {"left": left, "top": top, "width": width, "height": height}

    def _clamp_geometry(self, x: int, y: int, width: int, height: int) -> tuple[int, int]:
        bounds = self._virtual_bounds()
        safe_x = 28
        safe_y = 24
        min_x = bounds["left"] + safe_x
        max_x = bounds["left"] + bounds["width"] - width - safe_x
        min_y = bounds["top"] + safe_y
        max_y = bounds["top"] + bounds["height"] - height - safe_y
        if max_x < min_x: max_x = min_x
        if max_y < min_y: max_y = min_y
        return max(min_x, min(x, max_x)), max(min_y, min(y, max_y))

    def _exact_text_height(self, text: str, width: int, size: int, weight: str) -> int:
        if not self.window: return size
        font = QFont(self.font, size)
        font.setBold(weight == "bold")
        metrics = QFontMetrics(font)
        # Using Qt.TextWordWrap to measure height
        rect = metrics.boundingRect(0, 0, width, 10000, Qt.AlignLeft | Qt.AlignTop | Qt.TextWordWrap, text) # type: ignore
        return rect.height()

    def _measure_window_width(self, texts: list[str], weight: str) -> int:
        bounds = self._virtual_bounds()
        if self.mode == "fixed":
            max_width = min(max(self._width, int(bounds["width"] * 0.9)), bounds["width"] - 32)
        else:
            max_width = min(self._width, bounds["width"] - 56)
            
        # Isolate snap_to_region width logic: prevent uncontrollable horizontal stretching
        if self.snap_to_region and self._last_region and not self._manual_position:
            region_width = int(self._last_region.get("width", bounds["width"]))
            snap_max_width = max(260, region_width + 40)
            max_width = min(max_width, snap_max_width)
            
        min_width = 260 if self.mode == "fixed" else 220
        longest = min_width
        
        for text in texts:
            size = max(10, self.size - 2) if self.mode == "jump" and text != texts[-1] else self.size
            font = QFont(self.font, size)
            font.setBold(weight == "bold")
            metrics = QFontMetrics(font)
            measured = metrics.horizontalAdvance(text) if "\n" not in text else max(metrics.horizontalAdvance(line) for line in text.splitlines())
            longest = max(longest, measured + 68)
        return min(max_width, max(min_width, longest))

    def _place_near_region(self) -> None:
        bounds = self._virtual_bounds()
        region_gap = 16
        safe_margin_x = 28
        target_width = min(self._width, max(220, min(self.w, bounds["width"] - (safe_margin_x * 2))))
        
        if self.snap_to_region and self._last_region and not self._manual_position:
            region = self._last_region
            region_left = int(region.get("left", bounds["left"]))
            region_top = int(region.get("top", bounds["top"]))
            region_width = max(240, int(region.get("width", target_width)))
            region_height = max(80, int(region.get("height", 180)))
            region_center_x = region_left + (region_width // 2)
            max_left_span = max(220, (region_center_x - (bounds["left"] + safe_margin_x)) * 2)
            max_right_span = max(220, ((bounds["left"] + bounds["width"] - safe_margin_x) - region_center_x) * 2)
            local_safe_width = max(220, min(bounds["width"] - (safe_margin_x * 2), max_left_span, max_right_span))
            target_width = min(max(220, target_width), local_safe_width)
            x = region_center_x - (target_width // 2)
            below_y = region_top + region_height + region_gap
            above_y = region_top - self.h - region_gap
            above_space = region_top - bounds["top"] - 24
            below_space = bounds["top"] + bounds["height"] - (region_top + region_height) - 24
            if above_space >= self.h + region_gap and above_space >= below_space:
                y = above_y
            elif below_space >= self.h + region_gap:
                y = below_y
            else:
                y = above_y if above_space >= below_space else below_y
        elif not self._manual_position:
            x = bounds["left"] + (bounds["width"] - target_width) // 2
            y = bounds["top"] + int(bounds["height"] * self._y_ratio) - self.h // 2
        else:
            x = self.x
            y = self.y
            
        self.w = target_width
        self.x, self.y = self._clamp_geometry(x, y, self.w, self.h)
        if self.window:
            self.window.setGeometry(self.x, self.y, self.w, self.h)

    def _render(self) -> None:
        if not self.window: return
        
        data = list(self.lines)[-3:]
        if not data:
            self.window.hide()
            return
            
        if self.mode == "fixed": data = data[-1:]
        elif self.mode == "jump": data = data[-2:]
        
        latest = data[-1]
        weight = "bold" if self.bold else "normal"
        self.w = self._measure_window_width(data, weight)
        bounds = self._virtual_bounds()
        max_overlay_height = max(120, min(800, int(bounds["height"] * 0.85)))
        
        card_width = min(self.w - 8, max(240, int(self.w * 0.985)))
        
        current_size = self.size
        total_content_height = 0
        
        while current_size >= 10:
            total_content_height = 0
            if self.mode == "fixed":
                text_height = self._exact_text_height(latest, card_width - 20, current_size, weight)
                total_content_height = text_height + 24
            elif self.mode == "jump":
                front_text_h = self._exact_text_height(latest, card_width - 20, current_size, weight)
                total_content_height = front_text_h + 24
                if len(data) > 1:
                    back_width = int(card_width * 0.88)
                    back_text_h = self._exact_text_height(data[-2], back_width - 20, max(10, current_size - 2), weight)
                    total_content_height += back_text_h + 16
            else: # waterfall
                palette = [("#7C8798", -4), ("#C7D0DB", -2), (self.color, 0)]
                for i, text in enumerate(data):
                    delta = palette[-len(data) + i][1]
                    size_val = max(10, current_size + delta)
                    local_width = int(card_width * (0.88 + (i / max(1, len(data) - 1)) * 0.12)) if len(data) > 1 else card_width
                    total_content_height += self._exact_text_height(text, local_width - 18, size_val, weight) + 16
                total_content_height += 8 # extra padding
                
            if total_content_height + 12 <= max_overlay_height or current_size == 10:
                break
            current_size -= 1
            
        self._computed_size = current_size
        self.h = min(max_overlay_height, total_content_height + 12)
        self._place_near_region()
        self.window.update()

    def _draw(self, painter: QPainter):
        if not self.lines: return
        data = list(self.lines)[-3:]
        if self.mode == "fixed": data = data[-1:]
        elif self.mode == "jump": data = data[-2:]
        if not data: return
        
        self._draw_tooltip(painter)
        
        latest = data[-1]
        cx = self.w // 2
        weight = "bold" if self.bold else "normal"
        
        painter.save()
        if self.anim == "slide" and self._anim_progress < 1.0:
            offset = int(16 * (1.0 - self._anim_progress))
            painter.translate(0, offset)
            painter.setOpacity(self._anim_progress)
        elif self.anim in ("fade", "blur") and self._anim_progress < 1.0:
            painter.setOpacity(self._anim_progress)
        
        def draw_card(left, top, right, bottom, color_str):
            if not self.bg_visible: return
            radius = max(12, min(22, (bottom - top) // 3, (right - left) // 8))
            path = QPainterPath()
            path.addRoundedRect(QRectF(left, top, right - left, bottom - top), radius, radius)
            # parse color and apply alpha
            c = QColor(color_str)
            c.setAlphaF(self.alpha)
            painter.fillPath(path, c)
            
        def draw_text(x, y, txt, width, fill, size, is_bold):
            font = QFont(self.font, size)
            font.setBold(is_bold)
            painter.setFont(font)
            rect = QRect(int(x - width/2), int(y - 1000), int(width), 2000)
            
            if self.anim == "blur" and self._anim_progress < 1.0:
                blur_amt = int(6 * (1.0 - self._anim_progress))
                if blur_amt > 0:
                    painter.setOpacity(self._anim_progress * 0.3)
                    painter.setPen(QColor(fill))
                    # Optimizasyon: Çok uzun metinlerde 8 katmanlı bulanıklık GPU'yu çökertebilir (TDR).
                    # Sadece 200 karakterden kısa metinlerde blur efektini uygula, aksi halde sadece fade kullan.
                    if len(txt) <= 200:
                        for bx, by in [(-blur_amt, -blur_amt), (blur_amt, -blur_amt), (-blur_amt, blur_amt), (blur_amt, blur_amt), (0, -blur_amt), (0, blur_amt), (-blur_amt, 0), (blur_amt, 0)]:
                            b_rect = QRect(int(x - width/2) + bx, int(y - 1000) + by, int(width), 2000)
                            painter.drawText(b_rect, Qt.AlignCenter | Qt.TextWordWrap, txt) # type: ignore
                    painter.setOpacity(self._anim_progress)
            
            if self.shadow:
                painter.setPen(QColor(0, 0, 0, 230))
                rect_shadow = QRect(int(x - width/2), int(y - 1000 + 3), int(width), 2000)
                painter.drawText(rect_shadow, Qt.AlignCenter | Qt.TextWordWrap, txt) # type: ignore
            painter.setPen(QColor(fill))
            painter.drawText(rect, Qt.AlignCenter | Qt.TextWordWrap, txt) # type: ignore

        if self.mode == "fixed":
            card_width = min(self.w - 8, max(240, int(self.w * 0.985)))
            card_left = (self.w - card_width) // 2
            card_top = 4
            card_bottom = self.h - 4
            draw_card(card_left, card_top, card_left + card_width, card_bottom, "#0A101A")
            draw_text(cx, (card_top + card_bottom) // 2, latest, card_width - 20, self.color, self._computed_size, self.bold)
            painter.restore()
            return

        if self.mode == "jump":
            card_width = min(self.w - 12, max(180, int(self.w * 0.95)))
            front_left = (self.w - card_width) // 2
            
            front_text_h = self._exact_text_height(latest, card_width - 20, self._computed_size, weight)
            front_h = front_text_h + 24
            
            front_bottom = self.h - 4
            front_top = front_bottom - front_h
            
            if len(data) > 1:
                back_top = 4
                draw_card(front_left, back_top, front_left + card_width, front_bottom, "#0B1220")
                back_width = int(card_width * 0.88)
                back_bottom = front_top - 6
                draw_text(cx, (back_top + back_bottom) // 2, data[-2], back_width - 20, "#9CA3AF", max(10, self._computed_size - 2), self.bold)
            else:
                draw_card(front_left, front_top, front_left + card_width, front_bottom, "#0B1220")
                
            draw_text(cx, (front_top + front_bottom) // 2, latest, card_width - 20, self.color, self._computed_size, self.bold)
            painter.restore()
            return

        card_width = min(self.w - 12, max(180, int(self.w * 0.95)))
        palette = [("#7C8798", -4), ("#C7D0DB", -2), (self.color, 0)]
        
        card_left = (self.w - card_width) // 2
        card_top = 6
        card_bottom = self.h - 6
        draw_card(card_left, card_top, card_left + card_width, card_bottom, "#0B1220")
        
        current_y = card_top + 8
        for i, text in enumerate(data):
            fill, delta = palette[-len(data) + i]
            size = max(10, self._computed_size + delta)
            local_width = int(card_width * (0.88 + (i / max(1, len(data) - 1)) * 0.12)) if len(data) > 1 else card_width
            
            text_h = self._exact_text_height(text, local_width - 18, size, weight)
            draw_text(cx, current_y + text_h // 2, text, local_width - 18, fill, size, self.bold)
            current_y += text_h + 16
            
        painter.restore()

    def _draw_tooltip(self, painter: QPainter):
        if self.hover_active and self.lines:
            painter.setPen(Qt.NoPen) # type: ignore
            painter.setBrush(QColor(0, 0, 0, 180))
            font_tooltip = QFont(self.font, 9)
            painter.setFont(font_tooltip)
            metrics_tooltip = QFontMetrics(font_tooltip)
            text_tooltip = "Sol tık: Sürükle | Sağ tık: Sıfırla"
            tw = metrics_tooltip.horizontalAdvance(text_tooltip)
            
            t_x = self.w - tw - 15
            t_y = 5
            painter.drawRoundedRect(t_x - 5, t_y, tw + 10, 22, 4, 4)
            painter.setPen(QColor("#FFFFFF"))
            painter.drawText(t_x, t_y + 15, text_tooltip)

    # API Methods wrapping Signals
    def set_style(self, font: str, size: int, color: str, bold: bool) -> None:
        if self.signals: self.signals.set_style.emit(font, size, color, bold)

    def set_mode(self, mode: str) -> None:
        if self.signals: self.signals.set_mode.emit(mode)

    def set_region(self, region: dict | None) -> None:
        if self.signals: self.signals.set_region.emit(region)

    def update_snap_to_region(self, snap: bool) -> None:
        if self.signals: self.signals.set_snap_to_region.emit(snap)

    def apply_settings(self, settings: dict | None) -> None:
        if self.signals: self.signals.apply_settings.emit(settings or {})

    def show(self) -> None:
        if self.signals: self.signals.show_window.emit()

    def hide(self) -> None:
        if self.signals: self.signals.hide_window.emit()

    def toggle(self) -> None:
        if self.signals: self.signals.toggle_window.emit()

    def prepare_capture(self, region: dict | None) -> bool:
        if not isinstance(region, dict) or not self.window: return False
        
        # Sürükleme esnasında pencereyi gizlemek, Windows'un sürükleme işlemini (drag event) iptal etmesine neden olur.
        if getattr(self, "_drag_active", False):
            return False
            
        capture_rect = (
            int(region.get("left", 0)), int(region.get("top", 0)),
            int(region.get("left", 0)) + int(region.get("width", 0)),
            int(region.get("top", 0)) + int(region.get("height", 0)),
        )
        overlay_rect = (self.x, self.y, self.x + self.w, self.y + self.h)
        def intersect(a, b): return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]
        
        if not intersect(capture_rect, overlay_rect) or not self.visible or self._hidden_by_user:
            return False
            
        if self.signals: self.signals.prepare_capture.emit()
        return True

    def finish_capture(self, was_hidden: bool) -> None:
        if was_hidden and self.signals:
            self.signals.finish_capture.emit(was_hidden)

    def push(self, text: str, duration_ms: int = 0) -> None:
        text = text.strip()
        if text and self.signals:
            self.signals.push.emit(text, duration_ms)

    def push_sequence(self, chunks: list[str], mode: str = "fixed", reading_speed: int = 60, min_display_ms: int = 1200) -> None:
        ready_chunks = [chunk.strip() for chunk in chunks if chunk.strip()]
        if not ready_chunks: return
        
        def calc_delay(txt):
            if (reading_speed or 60) <= 0:
                return 0
            return max((min_display_ms or 1200), int((len(txt) / max(1, (reading_speed or 60))) * 1000) + 3000)
            
        if mode == "jump":
            chunk = ready_chunks[-1]
            self.push(chunk, calc_delay(chunk))
            return
            
        def _show_next(index):
            if not self.window or index >= len(ready_chunks): return
            chunk = ready_chunks[index]
            delay = calc_delay(chunk)
            self.push(chunk, delay)
            QTimer.singleShot(delay, lambda: _show_next(index + 1))
            
        _show_next(0)
        
    def clear(self) -> None:
        if self.signals: self.signals.clear.emit()

    def keep_alive(self) -> None:
        if self.signals: self.signals.keep_alive.emit()

    def update_last(self, text: str, duration_ms: int = 0) -> None:
        text = text.strip()
        if text and self.signals:
            self.signals.update_last.emit(text, duration_ms)

    def update_sequence(self, chunks: list[str], mode: str = "fixed", reading_speed: int = 60, min_display_ms: int = 1200) -> None:
        ready_chunks = [chunk.strip() for chunk in chunks if chunk.strip()]
        if not ready_chunks: return
        chunk = ready_chunks[-1]
        
        if (reading_speed or 60) <= 0:
            delay = 0 # 0 means permanent
        else:
            delay = max((min_display_ms or 1200), int((len(chunk) / max(1, (reading_speed or 60))) * 1000) + 3000)
            
        self.update_last(chunk, delay)

    # Actual Slot Implementations running on Qt Thread
    def _do_set_style(self, font, size, color, bold):
        self.font = font or "Segoe UI"
        self.size = max(12, min(32, int(size)))
        self.color = color or "#FFFFFF"
        self.bold = bool(bold)
        self._render()

    def _do_set_mode(self, mode):
        self.mode = mode if mode in {"waterfall", "jump", "fixed"} else "waterfall"
        self._render()

    def _do_set_region(self, region):
        self._last_region = dict(region) if isinstance(region, dict) else None
        self._manual_position = False
        self._place_near_region()
        self._render()

    def _do_set_snap_to_region(self, snap: bool):
        self.snap_to_region = snap
        if not snap:
            if self._saved_manual_x is not None and self._saved_manual_y is not None:
                self._manual_position = True
                self.x = self._saved_manual_x
                self.y = self._saved_manual_y
            else:
                self._manual_position = False
        else:
            self._manual_position = False
            
        self._place_near_region()
        self._render()

    def _do_apply_settings(self, settings):
        print(f"[OVERLAY DEBUG] Applying settings: {settings}")
        self.font = str(settings.get("font_family") or self.font)
        self.size = max(12, min(32, int(settings.get("font_size", self.size))))
        self.color = str(settings.get("font_color") or self.color)
        self.bold = bool(settings.get("font_bold", self.bold))
        raw_alpha = float(settings.get("alpha", self.alpha))
        if raw_alpha > 1.0: raw_alpha = raw_alpha / 100.0
        self.alpha = max(0.0, min(1.0, raw_alpha))
        self.bg_visible = bool(settings.get("bg_visible", self.bg_visible))
        requested_mode = str(settings.get("mode") or self.mode)
        self.mode = requested_mode if requested_mode in {"waterfall", "jump", "fixed"} else "waterfall"
        self.anim = str(settings.get("anim", self.anim))
        self.shadow = bool(settings.get("shadow", self.shadow))
        print(f"[OVERLAY DEBUG] Computed: font={self.font}, size={self.size}, color={self.color}, alpha={self.alpha}, bg={self.bg_visible}, mode={self.mode}, anim={self.anim}, shadow={self.shadow}")
        self._render()

    def _do_show(self):
        self.visible = True
        self._hidden_by_user = False
        if self.window: self.window.show()

    def _do_hide(self):
        self.visible = False
        if self.window: self.window.hide()
        
    def _do_clear(self):
        self.lines.clear()
        if self.anim in ("fade", "slide", "blur"):
            self._anim_progress = 0.0
            if self._anim_timer:
                self._anim_timer.stop()
        self._render()

    def _do_toggle(self):
        if self.visible:
            self._hidden_by_user = True
            self._do_hide()
        else:
            self._hidden_by_user = False
            self._do_show()
            self._render()

    def _do_prepare_capture(self):
        self._capture_suppressed += 1
        if self._capture_suppressed == 1:
            self._capture_restore_visible = True
            self.visible = False
            self.window.hide()

    def _do_finish_capture(self, was_hidden: bool):
        if self._capture_suppressed <= 0: return
        self._capture_suppressed -= 1
        if self._capture_suppressed > 0: return
        if self._capture_restore_visible and not self._hidden_by_user and self.lines:
            self.visible = True
            self.window.show()
            self._render()
        self._capture_restore_visible = False

    def _do_push(self, text: str, duration_ms: int):
        self._sequence_id += 1
        self.lines.append(text)
        
        if self.anim in ("fade", "slide", "blur"):
            self._anim_progress = 0.0
            if self._anim_timer:
                self._anim_timer.start(16)
        else:
            self._anim_progress = 1.0

        if not self._hidden_by_user and self.window:
            self.visible = True
            self.window.show()
        self._render()
        
        if duration_ms == 0:
            # Permanent, do not start hide timer
            if self._hide_after_timer:
                self._hide_after_timer.stop()
        else:
            delay = duration_ms
            if self._hide_after_timer:
                self._hide_after_timer.stop()
                self._hide_after_timer.setInterval(delay)
                self._hide_after_timer.start()

    def _do_keep_alive(self):
        if self._hide_after_timer and self._hide_after_timer.isActive():
            self._hide_after_timer.start()

    def _do_update_last(self, text: str, duration_ms: int):
        if not self.lines:
            return self._do_push(text, duration_ms)
            
        self.lines[-1] = text
        self._render() # Render without animation
        
        if not self._hidden_by_user and self.window:
            self.visible = True
            self.window.show()
            
        if duration_ms == 0:
            if self._hide_after_timer:
                self._hide_after_timer.stop()
        else:
            delay = duration_ms
            if self._hide_after_timer:
                self._hide_after_timer.stop()
                self._hide_after_timer.setInterval(delay)
                self._hide_after_timer.start()

    def _on_hide_timer(self):
        if not self._hidden_by_user:
            self._do_hide()

    def _on_anim_tick(self):
        self._anim_progress += 0.12
        if self._anim_progress >= 1.0:
            self._anim_progress = 1.0
            if self._anim_timer:
                self._anim_timer.stop()
        self._render()

    def _do_display_changed(self):
        self.logger.info(f"[{PREFIX_SYS}-089] Ekran cozunurlugu veya duzeni degisti, overlay yeniden boyutlandiriliyor.")
        self._last_bounds = self._virtual_bounds()
        self._place_near_region()
        self._render()
