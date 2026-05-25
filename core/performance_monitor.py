from __future__ import annotations

import os
import subprocess
import threading
import time
from typing import Any

from core.errors import PREFIX_SYS, get_logger, log_event


class PerformanceMonitor:
    """Lightweight runtime sampler for process and capture pipeline health."""

    def __init__(self, bridge: Any, pipeline: Any, sample_interval: float = 1.0) -> None:
        self.logger = get_logger()
        self.bridge = bridge
        self.pipeline = pipeline
        self.sample_interval = max(0.5, float(sample_interval))
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._process = None
        self._gpu_probe_available = self._detect_nvidia_smi()
        self._last_gpu_sample_at = 0.0
        self._last_gpu_stats: dict[str, int | None] = {"util_percent": None, "vram_used_mb": None}
        try:
            import psutil

            self._psutil = psutil
            self._process = psutil.Process(os.getpid())
        except Exception as exc:
            self._psutil = None
            self.logger.warning(f"[{PREFIX_SYS}-080] Performance monitor psutil hazir degil: {exc}")

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker, name="performance-monitor", daemon=True)
        self._thread.start()
        log_event(PREFIX_SYS, "081", "Performans monitoru baslatildi.", level="debug")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        self._thread = None

    def snapshot(self) -> dict[str, Any]:
        cpu_percent = None
        ram_mb = None
        thread_count = None
        if self._process is not None:
            try:
                cpu_percent = round(float(self._process.cpu_percent(interval=None)), 1)
                ram_mb = round(float(self._process.memory_info().rss) / (1024 * 1024), 1)
                thread_count = int(self._process.num_threads())
            except Exception as exc:
                self.logger.debug(f"[{PREFIX_SYS}-083] Process statistics fetch failed: {exc}")

        gpu_stats = self._read_gpu_stats()
        latest_probe = getattr(self.pipeline, "_latest_capture_probe", None) or {}
        last_perf = getattr(self.pipeline, "_last_perf_stats", {}) or {}
        return {
            "timestamp": time.time(),
            "process": {
                "cpu_percent": cpu_percent,
                "ram_mb": ram_mb,
                "threads": thread_count,
            },
            "gpu": gpu_stats,
            "pipeline": {
                "running": bool(getattr(self.pipeline, "is_running", False)),
                "engine": str(getattr(self.pipeline, "active_engine", "")),
                "translation_engine": str(getattr(self.pipeline, "translation_engine", "")),
                "tier": str(getattr(self.pipeline, "performance_tier", "")),
                "pending_translations": len(getattr(self.pipeline, "_pending_translations", [])),
                "latest_frame_id": int(getattr(self.pipeline, "_latest_frame_id", 0)),
                "processed_frame_id": int(getattr(self.pipeline, "_processed_frame_id", 0)),
                "reused_frame_count": int(getattr(self.pipeline, "_reused_frame_count", 0)),
                "capture_state": str(getattr(getattr(self.pipeline, "capturer", None), "_capture_state", "unknown")),
                "capture_ms": round(float(latest_probe.get("capture_ms", 0.0)), 1) if latest_probe else 0.0,
                "frame_shape": list(latest_probe.get("shape", ())) if latest_probe else [],
                "last_latency_ms": round(float(last_perf.get("frame_to_overlay_ms", 0.0)), 1) if last_perf else 0.0,
                "last_ocr_ms": round(float(last_perf.get("ocr_ms", 0.0)), 1) if last_perf else 0.0,
                "last_translation_ms": round(float(last_perf.get("translation_ms", 0.0)), 1) if last_perf else 0.0,
                "dynamic_capture_delay_ms": round(float(getattr(self.pipeline, "_capture_delay", lambda: 0.0)()) * 1000, 1),
            },
        }

    def _worker(self) -> None:
        if self._process is not None:
            try:
                self._process.cpu_percent(interval=None)
            except Exception as exc:
                self.logger.debug(f"[{PREFIX_SYS}-084] Process initial cpu_percent failed: {exc}")
        while not self._stop_event.wait(self.sample_interval):
            try:
                self.bridge.send("performance_stats", self.snapshot())
            except Exception as exc:
                self.logger.debug(f"[{PREFIX_SYS}-082] Performance sample emit atlandi: {exc}")

    def _detect_nvidia_smi(self) -> bool:
        try:
            cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=1.2,
                check=False,
                creationflags=cflags,
            )
            return result.returncode == 0
        except Exception as exc:
            self.logger.debug(f"[{PREFIX_SYS}-085] nvidia-smi detect failed: {exc}")
            return False

    def _read_gpu_stats(self) -> dict[str, int | None]:
        if not self._gpu_probe_available:
            return dict(self._last_gpu_stats)
        now = time.monotonic()
        if now - self._last_gpu_sample_at < 2.5:
            return dict(self._last_gpu_stats)
        self._last_gpu_sample_at = now
        try:
            cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=1.2,
                check=False,
                creationflags=cflags,
            )
            if result.returncode != 0:
                return dict(self._last_gpu_stats)
            first_line = next((line.strip() for line in result.stdout.splitlines() if line.strip()), "")
            if not first_line:
                return dict(self._last_gpu_stats)
            parts = [p.strip() for p in first_line.split(",")]
            util = int(parts[0]) if len(parts) >= 1 and parts[0].isdigit() else None
            vram = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else None
            self._last_gpu_stats = {"util_percent": util, "vram_used_mb": vram}
        except Exception as exc:
            self.logger.debug(f"[{PREFIX_SYS}-086] nvidia-smi stats fetch failed: {exc}")
        return dict(self._last_gpu_stats)
