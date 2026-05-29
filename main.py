"""
VoidSub - ANA CEKIRDEK (main.py)
ISLEV: Sistem guvenligini denetler, kopruyu kurar ve pipeline'i baslatir.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Embedded Python _pth dosyası sys.path hesaplamasını ezer.
# Scriptin bulunduğu 'app' klasörünü zorla sys.path'e ekliyoruz ki 'core' modülünü bulabilsin.
_current_dir = str(Path(__file__).resolve().parent)
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)

# Fix for WinError 1114 (DLL initialization failed)
# Force load torch and ctranslate2 DLLs into process memory before PySide6/OpenCV
try:
    import torch
    import ctranslate2
except ImportError:
    pass

# Nuitka kalıntıları temizlendi, artık Embedded Python mantığı kullanılıyor.

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


def ensure_project_venv() -> None:
    # Nuitka veya PyInstaller ile derlenmisse sanal ortam (venv) gecisini iptal et
    if "__compiled__" in globals() or getattr(sys, "frozen", False):
        return

    project_root = Path(__file__).resolve().parent
    venv_python = project_root / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        return

    current_python = Path(sys.executable).resolve()
    if current_python == venv_python.resolve():
        return

    os.execv(str(venv_python), [str(venv_python), *sys.argv])


ensure_project_venv()

# Konsol devre disi birakildiginda veya sidecar olarak calistiginda, hatalari "kara delige" (os.devnull)
# atmak yerine gercek bir log dosyasina yaz ki izini surebilelim.
try:
    from config.defaults import DOCS_DIR
    _log_dir = DOCS_DIR / "logs"
except Exception:
    _log_dir = Path(os.getenv("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "VoidSub" / "logs"
_log_dir.mkdir(parents=True, exist_ok=True)

if sys.stdout is None:
    sys.stdout = open(_log_dir / "python-core.stdout.log", "a", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(_log_dir / "python-core.stderr.log", "a", encoding="utf-8")

try:
    from core.bridge import BridgeServer
    from core.capture import ScreenCapturer
    from core.errors import PREFIX_SYS, get_logger, log_error, log_event, set_bridge_emitter, setup_crash_handler
    from core.modern_overlay import ModernOverlay
    from core.processor.pipeline import TranslationPipeline
    from core.runtime_cleanup import cleanup_runtime_artifacts, cleanup_startup_artifacts
except Exception as exc:
    import traceback
    with open(_log_dir / "fatal_crash.log", "a", encoding="utf-8") as f:
        f.write("\n--- TOP LEVEL IMPORT CRASH ---\n")
        f.write(traceback.format_exc())
    sys.exit(1)

if hasattr(sys.stdout, "reconfigure"):
    getattr(sys.stdout, "reconfigure")(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    getattr(sys.stderr, "reconfigure")(encoding="utf-8", errors="replace")


import signal

async def main() -> None:
    setup_crash_handler()
    cleanup_startup_artifacts()
    
    # Graceful Shutdown Sinyal Yakalayıcılar
    def handle_sigint(*args):
        print("\n[SISTEM] Kapanma sinyali (SIGINT/SIGTERM) alındı. Zombiler temizleniyor...")
        raise KeyboardInterrupt()

    try:
        signal.signal(signal.SIGINT, handle_sigint)
        signal.signal(signal.SIGTERM, handle_sigint)
        signal.signal(signal.SIGBREAK, handle_sigint)
    except Exception:
        pass

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

    bridge = BridgeServer(worker=None)
    set_bridge_emitter(bridge.send)
    bridge_task = None

    try:
        print(f"[AKTIF] WebSocket Santrali {bridge.host}:{bridge.port} uzerinde dinleniyor.")
        print("[SISTEM] UI baglantisi bekleniyor...\n")
        log_event(
            PREFIX_SYS,
            "072",
            f"[Ag Iletisimi] -> SISTEM KOPRUSU BASLATILIYOR | Host: {bridge.host} | Port: {bridge.port}",
        )
        bridge_task = asyncio.create_task(bridge.start())
        await asyncio.sleep(0)

        capturer = None
        native_overlay = None
        pipeline = None

        try:
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
        except Exception as exc:
            log_error(PREFIX_SYS, "071", f"Capture bootstrap failed: {type(exc).__name__}: {exc}", "Capture baslatilamadi.")
            bridge.send("capture_unavailable", {"message": str(exc), "error_type": type(exc).__name__})

        try:
            native_overlay = ModernOverlay()
            native_overlay.apply_settings(bridge.settings.get("overlay", {}))
        except Exception as exc:
            native_overlay = None
            log_error(PREFIX_SYS, "018", f"Overlay bootstrap failed: {type(exc).__name__}: {exc}", "Overlay baslatilamadi.")
            bridge.send("overlay_unavailable", {"message": str(exc), "error_type": type(exc).__name__})

        try:
            pipeline = TranslationPipeline(bridge=bridge, capturer=capturer)
            pipeline.update_config(
                engine_id=bridge.settings["app"].get("ocr_engine"),
                translation_engine=bridge.settings["app"].get("translation_engine"),
                performance_tier=bridge.settings["app"].get("performance_tier"),
                scene_mode=bridge.settings["app"].get("ocr_scene_mode"),
                src_language=bridge.settings["app"].get("src_language"),
                tgt_language=bridge.settings["app"].get("tgt_language"),
            )
        except Exception as exc:
            pipeline = None
            log_error(PREFIX_SYS, "073", f"Pipeline bootstrap failed: {type(exc).__name__}: {exc}", "Pipeline baslatilamadi.")
            bridge.send("pipeline_unavailable", {"message": str(exc), "error_type": type(exc).__name__})

        if pipeline is not None:
            bridge.attach_worker(pipeline)
        if native_overlay is not None:
            try:
                bridge.attach_native_overlay(native_overlay)
            except Exception as exc:
                log_error(PREFIX_SYS, "018", f"Overlay attach failed: {type(exc).__name__}: {exc}", "Overlay baglanamadi.")
                bridge.send("overlay_unavailable", {"message": str(exc), "error_type": type(exc).__name__})

        await bridge_task
    except Exception as exc:
        print(f"[HATA] Sunucu baslatilamadi: {exc}")
        log_error(PREFIX_SYS, "073", f"[Sistem Koprusu] -> BASLATILAMADI | Hata: {type(exc).__name__}: {exc}", "Sunucu baslatilamadi.")
    finally:
        logger.info(f"[{PREFIX_SYS}-074] [Sistem Cekirdegi] -> KAPANIS ISTENDI | Temizlik basliyor...")
        import psutil

        current_proc = psutil.Process()
        for child in current_proc.children(recursive=True):
            try:
                child.kill()
            except psutil.NoSuchProcess:
                pass
        cleanup_runtime_artifacts()


if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()

    if "--region-selector" in sys.argv:
        from core.native_region_selector import NativeRegionSelector

        NativeRegionSelector().run()
        sys.exit(0)

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[SISTEM] Guvenli sekilde kapatiliyor...")
    except Exception:
        import traceback
        from config.defaults import USER_DATA_DIR

        crash_log_path = USER_DATA_DIR / "logs" / "voidsub_fatal_crash.log"
        crash_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(crash_log_path, "w", encoding="utf-8") as f:
            f.write("FATAL CRASH!\n")
            f.write(traceback.format_exc())
