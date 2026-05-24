from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from config.defaults import DIAGNOSTICS_DIR


class OCRDiagnostics:
    """Persist selected OCR cases to disk for replay and debugging."""

    def __init__(self) -> None:
        self.enabled = os.getenv("VIREL_OCR_DIAGNOSTICS", "0") == "1"
        self.root = Path(DIAGNOSTICS_DIR)

    def record(self, phase: str, engine: str, scene_mode: str, frame: np.ndarray, processed: np.ndarray, text: str, score: int, metadata: dict[str, Any] | None = None) -> None:
        if not self.enabled:
            return
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        target = self.root / f"{timestamp}-{phase}-{engine}-{scene_mode}"
        target.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(target / "frame.png"), frame)
        cv2.imwrite(str(target / "processed.png"), processed)
        with open(target / "payload.json", "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "phase": phase,
                    "engine": engine,
                    "scene_mode": scene_mode,
                    "text": text,
                    "score": score,
                    "metadata": metadata or {},
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
