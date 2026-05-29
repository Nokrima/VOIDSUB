from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from config.defaults import DIAGNOSTICS_DIR
from core.errors import get_logger


class OCRDiagnostics:
    """Persist selected OCR cases to disk for replay and debugging."""

    def __init__(self) -> None:
        self.logger = get_logger()
        self.enabled = os.getenv("VOIDSUB_OCR_DIAGNOSTICS", "0") == "1"
        self.root = Path(DIAGNOSTICS_DIR)
        self.max_folders = 50
        self.max_age_days = 7
        self.max_mb = 100 # Maximum 100MB
        if self.enabled:
            self._cleanup_old_diagnostics()

    def _cleanup_old_diagnostics(self) -> None:
        if not self.root.exists():
            return
            
        now = time.time()
        try:
            dirs = [d for d in self.root.iterdir() if d.is_dir()]
        except Exception:
            return
            
        valid_dirs = []
        for d in dirs:
            try:
                age_days = (now - d.stat().st_mtime) / (24 * 3600)
                if age_days > self.max_age_days:
                    shutil.rmtree(d)
                else:
                    valid_dirs.append(d)
            except Exception as e:
                self.logger.error(f"[DIAG] Klasor silinirken hata: {e}")

        if len(valid_dirs) > self.max_folders:
            valid_dirs.sort(key=lambda x: x.stat().st_mtime)
            to_delete = valid_dirs[:-self.max_folders]
            valid_dirs = valid_dirs[-self.max_folders:]
            for d in to_delete:
                try:
                    shutil.rmtree(d)
                except Exception as e:
                    self.logger.error(f"[DIAG] Klasor silinirken hata: {e}")

        # Boyut Limiti Temizligi
        def get_dir_size(path: Path) -> int:
            return sum(f.stat().st_size for f in path.rglob('*') if f.is_file())

        valid_dirs.sort(key=lambda x: x.stat().st_mtime)
        total_size = sum(get_dir_size(d) for d in valid_dirs)
        max_bytes = self.max_mb * 1024 * 1024

        while total_size > max_bytes and valid_dirs:
            oldest = valid_dirs.pop(0)
            try:
                size = get_dir_size(oldest)
                shutil.rmtree(oldest)
                total_size -= size
            except Exception as e:
                self.logger.error(f"[DIAG] Klasor silinirken hata: {e}")

    def record(self, phase: str, engine: str, scene_mode: str, frame: np.ndarray, processed: np.ndarray, text: str, score: int, metadata: dict[str, Any] | None = None) -> None:
        if not self.enabled:
            return
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        target = self.root / f"{timestamp}-{phase}-{engine}-{scene_mode}"
        target.mkdir(parents=True, exist_ok=True)
        try:
            target.chmod(0o700) # Sadece gecerli kullanici (Gizlilik)
        except Exception:
            pass
        cv2.imwrite(str(target / "frame.png"), frame)
        cv2.imwrite(str(target / "processed.png"), processed)
        payload_path = target / "payload.json"
        tmp_path = payload_path.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as handle:
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
        os.replace(tmp_path, payload_path)
