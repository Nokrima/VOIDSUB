"""Merkezi log, hata kodu ve UI log yayini yardimcilari."""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime
from logging.handlers import RotatingFileHandler
import sys
import threading
import traceback

from config.defaults import BASE_DIR, LOG_BACKUP_COUNT, LOG_FILE, LOG_MAX_BYTES

PREFIX_OCR = "OCR"
PREFIX_TRL = "TRL"
PREFIX_SYS = "SYS"
PREFIX_CFG = "CFG"

_logger: logging.Logger | None = None
_last_user_msg = ""
_bridge_emitter = None
_bridge_handler_attached = False
_throttle_registry: dict[str, float] = {}
_bridge_handler: logging.Handler | None = None
_file_handler: logging.Handler | None = None

_active_pipeline_state = "Bilinmiyor"
_last_active_module = "Bilinmiyor"

def update_crash_context(module: str | None = None, state: str | None = None) -> None:
    global _last_active_module, _active_pipeline_state
    if module is not None:
        _last_active_module = module
    if state is not None:
        _active_pipeline_state = state

LOG_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}


class BridgeLogHandler(logging.Handler):
    """Log kayitlarini UI tarafina kontrollu sekilde tasir."""

    def emit(self, record: logging.LogRecord) -> None:
        if _bridge_emitter is None:
            return

        try:
            message = record.getMessage()
            match = re.match(r"\[(?P<prefix>[A-Z]+)(?:-(?P<code>\d+))?\]\s*(?P<message>.*)", message)
            prefix = match.group("prefix") if match else PREFIX_SYS
            code = match.group("code") if match else None
            clean_message = match.group("message") if match else message
            _bridge_emitter(
                "log_entry",
                {
                    "timestamp": datetime.fromtimestamp(record.created).strftime("%H:%M:%S"),
                    "level": record.levelname,
                    "prefix": prefix,
                    "code": f"{prefix}-{code}" if code else prefix,
                    "message": clean_message,
                },
            )
        except Exception as exc:
            logging.getLogger("VoidSubCoreInternal").error("[SYS-001] [Log İletimi] -> İLETİM BAŞARISIZ | Hata: %s", exc)
            return


def _build_file_handler() -> RotatingFileHandler:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Log dosyasını her açılışta silmeyi kaldırdık ki eski hataları görebilelim!
    handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=LOG_MAX_BYTES,
        backupCount=LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s.%(msecs)03d - %(levelname)s - %(message)s",
            "%Y-%m-%d %H:%M:%S",
        )
    )
    return handler


def setup_logger(level: str = "info") -> logging.Logger:
    """Uygulama logger'ini kurar veya mevcut logger'i dondurur."""
    global _logger, _bridge_handler_attached, _bridge_handler, _file_handler
    desired_level = LOG_LEVELS.get(str(level).lower(), logging.INFO)
    if _logger is not None:
        _logger.setLevel(logging.DEBUG)
        if _bridge_handler is not None:
            _bridge_handler.setLevel(desired_level)
        if _file_handler is not None:
            _file_handler.setLevel(logging.DEBUG)
        return _logger

    _logger = logging.getLogger("VoidSubCore")
    _logger.setLevel(logging.DEBUG)
    _logger.propagate = False
    _file_handler = _build_file_handler()
    _logger.addHandler(_file_handler)
    if not _bridge_handler_attached:
        _bridge_handler = BridgeLogHandler()
        _bridge_handler.setLevel(desired_level)
        _logger.addHandler(_bridge_handler)
        _bridge_handler_attached = True
    return _logger


def get_logger() -> logging.Logger:
    """Merkezi logger ornegini dondurur."""
    return setup_logger()


def set_log_level(level: str) -> None:
    """Calisma aninda log seviyesini gunceller."""
    setup_logger(level)


def log_error(prefix: str, code: str, technical: str, user_msg: str) -> None:
    """Kodlu hata kaydi olusturur ve son kullanici mesajini saklar."""
    global _last_user_msg
    get_logger().error(f"[{prefix}-{code}] {technical}")
    _last_user_msg = user_msg


def log_event(
    prefix: str,
    code: str,
    message: str,
    *,
    level: str = "info",
    throttle_key: str | None = None,
    throttle_seconds: float = 0.0,
) -> None:
    """Spam'i sinirlayarak bilgi kaydi olusturur."""
    logger = get_logger()
    if throttle_key:
        now = time.monotonic()
        last_seen = _throttle_registry.get(throttle_key, 0.0)
        if now - last_seen < throttle_seconds:
            return
        _throttle_registry[throttle_key] = now

    level_name = str(level).lower()
    log_method = getattr(logger, level_name, logger.info)
    log_method(f"[{prefix}-{code}] {message}")


def set_bridge_emitter(emitter) -> None:
    """UI olay yayincisini logger'a baglar."""
    global _bridge_emitter
    _bridge_emitter = emitter

def emit_bridge_event(event: str, data: dict) -> None:
    """Merkezi uzerinden frontend'e ozel olay gonderir."""
    if _bridge_emitter:
        try:
            _bridge_emitter(event, data)
        except Exception:
            pass


def _get_hardware_snapshot() -> str:
    snapshot = "--- Donanım ve Sistem Durumu ---\n"
    try:
        import psutil
        process = psutil.Process()
        ram_percent = process.memory_percent()
        ram_mb = process.memory_info().rss / (1024 * 1024)
        snapshot += f"RAM Kullanımı: %{ram_percent:.1f} ({ram_mb:.1f} MB)\n"
    except Exception:
        snapshot += "RAM Kullanımı: Ölçülemedi (psutil yok veya hata)\n"
        
    try:
        import subprocess
        cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=1.0, check=False, creationflags=cflags
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if lines:
                parts = lines[0].split(',')
                if len(parts) >= 2:
                    snapshot += f"VRAM Kullanımı: {parts[1].strip()} MB (GPU Util: %{parts[0].strip()})\n"
        else:
            snapshot += "VRAM Kullanımı: NVIDIA GPU bulunamadı.\n"
    except Exception:
        snapshot += "VRAM Kullanımı: Ölçülemedi (nvidia-smi hatası)\n"
        
    snapshot += f"Aktif Pipeline Durumu: {_active_pipeline_state}\n"
    snapshot += f"Son Çalışan Modül: {_last_active_module}\n"
    return snapshot

def _crash_handler(exc_type, exc_value, exc_traceback) -> None:
    """Yakalanamayan olumcul hatalari (Sessiz cokmeleri) loglar."""
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    
    crash_log_path = BASE_DIR / "logs" / "fatal_crash.log"
    try:
        crash_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(crash_log_path, "a", encoding="utf-8") as f:
            f.write(f"\n--- FATAL CRASH @ {datetime.now().isoformat()} ---\n")
            f.write(_get_hardware_snapshot())
            f.write("\n--- Traceback ---\n")
            f.write("".join(traceback.format_exception(exc_type, exc_value, exc_traceback)))
            f.write("-" * 50 + "\n")
        get_logger().critical(f"[{PREFIX_SYS}-999] [Sistem Çekirdeği] -> ÖLÜMCÜL ÇÖKME (FATAL CRASH) | Dosya: {crash_log_path}")
    except Exception:
        pass
    finally:
        sys.__excepthook__(exc_type, exc_value, exc_traceback)


def _thread_crash_handler(args) -> None:
    """Thread icindeki sessiz cokmeleri yakalar."""
    _crash_handler(args.exc_type, args.exc_value, args.exc_traceback)


def _async_exception_handler(loop, context) -> None:
    """Async event loop icindeki hatalari yakalar."""
    exc = context.get('exception')
    msg = context.get('message', 'Bilinmeyen async hatası')
    
    if _bridge_emitter:
        try:
            _bridge_emitter("async_error", {"message": f"Kritik Hata: {msg}"})
            _bridge_emitter("log_entry", {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "level": "WARNING",
                "prefix": PREFIX_SYS,
                "code": f"{PREFIX_SYS}-998",
                "message": f"Async Hatası: {msg}",
            })
        except Exception:
            pass

    crash_log_path = BASE_DIR / "logs" / "fatal_crash.log"
    try:
        crash_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(crash_log_path, "a", encoding="utf-8") as f:
            f.write(f"\n--- ASYNC CRASH @ {datetime.now().isoformat()} ---\n")
            f.write(_get_hardware_snapshot())
            f.write(f"\nMessage: {msg}\n")
            if exc:
                f.write("\n--- Traceback ---\n")
                f.write("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
            f.write("-" * 50 + "\n")
        get_logger().critical(f"[{PREFIX_SYS}-998] [Sistem Çekirdeği] -> ASYNC ÇÖKME | Dosya: {crash_log_path}")
    except Exception:
        pass


def setup_crash_handler() -> None:
    """Tum bilinmeyen cokmeleri yakalamak icin global kancalari (hooks) kurar."""
    sys.excepthook = _crash_handler
    threading.excepthook = _thread_crash_handler
    try:
        import asyncio
        loop = asyncio.get_running_loop()
        loop.set_exception_handler(_async_exception_handler)
    except RuntimeError:
        pass

