from __future__ import annotations

from core.errors import PREFIX_CFG, log_event


def recommend_device(hardware_result: dict) -> dict:
    gpu = hardware_result.get("gpu", {}) if isinstance(hardware_result, dict) else {}
    vram_mb = int(gpu.get("vram_mb", 0) or 0)
    gpu_available = bool(gpu.get("available", False))
    cuda_available = (
        bool(hardware_result.get("cuda_available", False))
        if isinstance(hardware_result, dict)
        else False
    )
    cpu_threads = int(
        (
            hardware_result.get("cpu", {}) if isinstance(hardware_result, dict) else {}
        ).get("threads", 4)
        or 4
    )

    if gpu_available and cuda_available and vram_mb >= 4000:
        return {
            "device": "cuda",
            "compute_type": "int8_float16",
            "inter_threads": 1,
            "intra_threads": 1,
            "reason": "GPU with sufficient VRAM detected",
        }
    if gpu_available and cuda_available and 2000 <= vram_mb < 4000:
        return {
            "device": "cuda",
            "compute_type": "int8",
            "inter_threads": 1,
            "intra_threads": 1,
            "reason": "GPU detected, limited VRAM, using int8 to reduce memory",
        }

    safe_threads = max(1, min(6, (cpu_threads // 2) - 1))
    return {
        "device": "cpu",
        "compute_type": "int8",
        "inter_threads": 1,
        "intra_threads": safe_threads,
        "reason": "No GPU or insufficient VRAM, using CPU",
    }


def log_device_decision(advice: dict) -> None:
    device = str(advice.get("device", "cpu"))
    reason = str(advice.get("reason", "unknown"))
    log_event(PREFIX_CFG, "005", f"Device selected: {device} ({reason})")
