"""
TERCUMAN'T V2 - ANA CEKIRDEK (main.py)
ISLEV: Sistem guvenligini denetler, kopruyu kurar ve pipeline'i baslatir.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path


def ensure_project_venv() -> None:
    project_root = Path(__file__).resolve().parent
    venv_python = project_root / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        return

    current_python = Path(sys.executable).resolve()
    if current_python == venv_python.resolve():
        return

    os.execv(str(venv_python), [str(venv_python), *sys.argv])


ensure_project_venv()

from core.bridge import BridgeServer
from core.capture import ScreenCapturer
from core.errors import PREFIX_SYS, get_logger, log_error, log_event, set_bridge_emitter, setup_crash_handler
from core.modern_overlay import ModernOverlay
from core.processor.pipeline import TranslationPipeline
from core.runtime_cleanup import cleanup_runtime_artifacts, cleanup_startup_artifacts

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

async def main() -> None:
    setup_crash_handler()
    cleanup_startup_artifacts()
    print("\n[SISTEM] Python Core motoru uyaniyor. Lutfen bekleyin...")
    logger = get_logger()
    log_event(
        PREFIX_SYS,
        "070",
        (
            "Python core startup: "
            f"executable={sys.executable}, cwd={Path.cwd()}, argv={sys.argv}, "
            f"project_root={Path(__file__).resolve().parent}"
        ),
    )

    print("[SISTEM] Ana donanim taramasi yapiliyor...")
    capturer = ScreenCapturer()
    log_event(
        PREFIX_SYS,
        "071",
        (
            "Capture bootstrap complete: "
            f"backend={getattr(capturer, '_backend', 'unknown')}, "
            f"state={getattr(capturer, '_capture_state', 'unknown')}, "
            f"runtime_error={getattr(capturer, '_runtime_error', None)!r}"
        ),
    )
    bridge = BridgeServer(worker=None)
    native_overlay = ModernOverlay()
    set_bridge_emitter(bridge.send)

    pipeline = TranslationPipeline(bridge=bridge, capturer=capturer)
    pipeline.update_config(
        engine_id=bridge.settings["app"].get("ocr_engine"),
        translation_engine=bridge.settings["app"].get("translation_engine"),
        performance_tier=bridge.settings["app"].get("performance_tier"),
        scene_mode=bridge.settings["app"].get("ocr_scene_mode"),
        src_language=bridge.settings["app"].get("src_language"),
        tgt_language=bridge.settings["app"].get("tgt_language"),
    )
    bridge.attach_worker(pipeline)
    bridge.attach_native_overlay(native_overlay)
    native_overlay.apply_settings(bridge.settings.get("overlay", {}))

    try:
        print(f"[AKTIF] WebSocket Santrali {bridge.host}:{bridge.port} uzerinde dinleniyor.")
        print("[SISTEM] UI baglantisi bekleniyor...\n")
        log_event(PREFIX_SYS, "072", f"[Ağ İletişimi] -> SİSTEM KÖPRÜSÜ BAŞLATILIYOR | Host: {bridge.host} | Port: {bridge.port}")
        await bridge.start()
    except Exception as exc:
        print(f"[HATA] Sunucu baslatilamadi: {exc}")
        log_error(PREFIX_SYS, "073", f"[Sistem Köprüsü] -> BAŞLATILAMADI | Hata: {type(exc).__name__}: {exc}", "Sunucu baslatilamadi.")
    finally:
        logger.info(f"[{PREFIX_SYS}-074] [Sistem Çekirdeği] -> KAPANIŞ İSTENDİ | Temizlik başlıyor...")
        cleanup_runtime_artifacts()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[SISTEM] Guvenli sekilde kapatiliyor...")
