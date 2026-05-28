from __future__ import annotations

"""Repo icindeki gecici calisma artifaktlarini temizler."""

import shutil
from pathlib import Path

from config.defaults import BASE_DIR, DIAGNOSTICS_DIR, USER_DATA_DIR
from core.errors import PREFIX_SYS, log_error, log_event


def _remove_file(path: Path) -> None:
    if not path.exists():
        return
    try:
        path.unlink()
        log_event(PREFIX_SYS, "010", f"[Sistem Temizliği] -> DOSYA TEMİZLENDİ | Dosya: {path.name}")
    except Exception as exc:
        log_error(PREFIX_SYS, "010", f"[Sistem Temizliği] -> DOSYA SİLİNEMEDİ | Detay: {path.name} | Hata: {exc}", f"Gecici dosya silinemedi: {path.name}")


def _remove_tree(path: Path) -> None:
    if not path.exists():
        return
    try:
        shutil.rmtree(path)
        log_event(PREFIX_SYS, "011", f"[Sistem Temizliği] -> KLASÖR TEMİZLENDİ | Klasör: {path.name}")
    except Exception as exc:
        log_error(PREFIX_SYS, "011", f"[Sistem Temizliği] -> KLASÖR SİLİNEMEDİ | Detay: {path.name} | Hata: {exc}", f"Gecici klasor silinemedi: {path.name}")


def cleanup_startup_artifacts() -> None:
    logs_dir = USER_DATA_DIR / "logs"
    for file_name in (
        "python-core.stdout.log",
        "python-core.stderr.log",
        "native_overlay_probe.png",
        "native_overlay_probe_after_fix.png",
    ):
        _remove_file(logs_dir / file_name)
        
    # Ağ portunu (5678) işgal eden zombi süreçleri temizle
    try:
        import subprocess
        cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        output = subprocess.check_output("netstat -ano | findstr :5678", shell=True, text=True, creationflags=cflags)
        for line in output.splitlines():
            if "LISTENING" in line:
                parts = line.strip().split()
                if len(parts) >= 5:
                    pid = parts[-1]
                    subprocess.run(f"taskkill /PID {pid} /F", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=cflags)
                    log_event(PREFIX_SYS, "012", f"[Ağ Temizliği] -> ZOMBİ İŞLEM (ZOMBIE) TEMİZLENDİ | Port: 5678 | PID: {pid}")
    except Exception:
        pass


def cleanup_runtime_artifacts() -> None:
    logs_dir = USER_DATA_DIR / "logs"
    for file_name in (
        "python-core.stdout.log",
        "python-core.stderr.log",
        "native_overlay_probe.png",
        "native_overlay_probe_after_fix.png",
    ):
        _remove_file(logs_dir / file_name)

    _remove_tree(Path(DIAGNOSTICS_DIR))

    pycache_removed = 0
    for pycache_dir in BASE_DIR.rglob("__pycache__"):
        if pycache_dir.exists():
            try:
                shutil.rmtree(pycache_dir)
                pycache_removed += 1
            except Exception as exc:
                log_error(PREFIX_SYS, "011", f"[Sistem Temizliği (Cache)] -> ÖNBELLEK SİLİNEMEDİ | Detay: {pycache_dir.name} | Hata: {exc}", f"Gecici klasor silinemedi: {pycache_dir.name}")
    if pycache_removed:
        log_event(PREFIX_SYS, "011", f"[Sistem Temizliği (Cache)] -> ÖNBELLEK TEMİZLENDİ | Adet: {pycache_removed}")
