from __future__ import annotations

import ctypes
import ctypes.wintypes
import json
import sys
import tkinter as tk


SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79
GA_ROOT = 2


class NativeRegionSelector:
    def __init__(self) -> None:
        self.start_x: int | None = None
        self.start_y: int | None = None
        self.rect_id: int | None = None
        self.bounds = self._virtual_bounds()

        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes("-alpha", 0.22)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="black")
        self.root.geometry(
            f"{self.bounds['width']}x{self.bounds['height']}+{self.bounds['left']}+{self.bounds['top']}"
        )
        self.root.after(10, self.root.focus_set)

        self.canvas = tk.Canvas(self.root, cursor="cross", bg="black", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        self._label("Tarama Alanı", 0.05, ("Segoe UI", 12, "bold"), "#E5EEF9")
        self._label("Metnin olduğu alanı sol tıklayıp sürükleyerek seç.", 0.08, ("Segoe UI", 11), "#D4E0EF")
        self._label("İptal için sağ tık veya ESC", 0.103, ("Segoe UI", 10), "#92A4BC")

        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Button-3>", lambda _e: self.cancel())
        self.root.bind("<Escape>", lambda _e: self.cancel())

    def emit(self, payload: dict) -> None:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    def on_press(self, event: tk.Event) -> None:
        self.start_x = self.root.winfo_pointerx()
        self.start_y = self.root.winfo_pointery()
        if self.rect_id:
            self.canvas.delete(self.rect_id)
        self.rect_id = self.canvas.create_rectangle(
            event.x,
            event.y,
            event.x,
            event.y,
            outline="#5EA7FF",
            width=2,
            fill="#5EA7FF",
            stipple="gray25",
        )

    def on_drag(self, event: tk.Event) -> None:
        if self.rect_id and self.start_x is not None and self.start_y is not None:
            origin_x = self.start_x - self.bounds["left"]
            origin_y = self.start_y - self.bounds["top"]
            self.canvas.coords(self.rect_id, origin_x, origin_y, event.x, event.y)

    def on_release(self, _event: tk.Event) -> None:
        if self.start_x is None or self.start_y is None:
            self.cancel()
            return
        end_x = self.root.winfo_pointerx()
        end_y = self.root.winfo_pointery()
        left, right = sorted((self.start_x, end_x))
        top, bottom = sorted((self.start_y, end_y))
        width = right - left
        height = bottom - top
        self.root.destroy()
        if width <= 30 or height <= 15:
            self.emit({"cancelled": True})
            return
        region = {"left": left, "top": top, "width": width, "height": height}
        self.emit({"region": region})

    def cancel(self) -> None:
        self.root.destroy()
        self.emit({"cancelled": True})

    def run(self) -> None:
        self.root.mainloop()

    def _label(self, text: str, rely: float, font: tuple[str, int, str] | tuple[str, int], color: str) -> None:
        tk.Label(self.root, text=text, font=font, bg="black", fg=color, padx=18, pady=10 if rely == 0.05 else 0).place(relx=0.5, rely=rely, anchor="center")

    def _virtual_bounds(self) -> dict[str, int]:
        user32 = ctypes.windll.user32
        return {
            "left": int(user32.GetSystemMetrics(SM_XVIRTUALSCREEN)),
            "top": int(user32.GetSystemMetrics(SM_YVIRTUALSCREEN)),
            "width": int(user32.GetSystemMetrics(SM_CXVIRTUALSCREEN)),
            "height": int(user32.GetSystemMetrics(SM_CYVIRTUALSCREEN)),
        }

    def _capture_window_anchor(self, left: int, top: int, width: int, height: int) -> dict | None:
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        point = ctypes.wintypes.POINT()
        point.x = left + width // 2
        point.y = top + height // 2
        hwnd = user32.WindowFromPoint(point)
        if not hwnd:
            return None
        hwnd = user32.GetAncestor(hwnd, GA_ROOT)
        rect = ctypes.wintypes.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return None
        window_left, window_top = int(rect.left), int(rect.top)
        window_width = int(rect.right - rect.left)
        window_height = int(rect.bottom - rect.top)
        if window_width <= 0 or window_height <= 0:
            return None
        if left < window_left or top < window_top or left + width > rect.right or top + height > rect.bottom:
            return None
        title_buffer = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, title_buffer, len(title_buffer))
        class_buffer = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, class_buffer, len(class_buffer))
        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        return {
            "hwnd": int(hwnd),
            "offset_left": left - window_left,
            "offset_top": top - window_top,
            "width": width,
            "height": height,
            "pid": int(pid.value),
            "title": title_buffer.value,
            "class_name": class_buffer.value,
            "window_left": window_left,
            "window_top": window_top,
            "window_width": window_width,
            "window_height": window_height,
        }


if __name__ == "__main__":
    NativeRegionSelector().run()
