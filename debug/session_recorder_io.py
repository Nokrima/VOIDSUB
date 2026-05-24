"""session_recorder_io — Frame kodlama ve payload olusturma yardimcilari."""
from __future__ import annotations

import base64
from typing import Any

import cv2
import numpy as np

THUMB_W, THUMB_H = 1280, 720

def encode_frame(frame: Any) -> str:
    """numpy goruntusunu 1280x720 PNG thumbnailina cevirerek base64 string dondurur.

    Hatada bos string doner — cagirici kontrol etmek zorunda degil.
    """
    try:
        if not isinstance(frame, np.ndarray) or frame.size == 0:
            return ""
        img = frame.copy()
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        h, w = img.shape[:2]
        if w > THUMB_W or h > THUMB_H:
            scale = min(THUMB_W / w, THUMB_H / h)
            img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".png", img)
        if not ok:
            return ""
        return base64.b64encode(buf.tobytes()).decode("ascii")
    except Exception:
        return ""


def build_payload(events: list[dict]) -> dict:
    """Olay listesinden debug_session_result WebSocket payload'unu olusturur.

    Returns:
        total_frames, accepted, rejected sayilari ve events listesi.
    """
    accepted = sum(1 for e in events if e["decision"] == "accepted")
    return {
        "total_frames": len(events),
        "accepted": accepted,
        "rejected": len(events) - accepted,
        "events": events,
    }
