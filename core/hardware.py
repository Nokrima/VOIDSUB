"""
Donanım ve güvenlik tarayıcısı.
"""
from __future__ import annotations

import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from importlib.util import find_spec

import psutil

from config.defaults import BASE_DIR, BENCHMARKS_DIR
from core.errors import PREFIX_SYS, get_logger, log_error, log_event
from core.ocr.windows_ocr import WindowsOCREngine


class HardwareDetector:
    def __init__(self):
        self.logger = get_logger()
    def scan_system(self) -> dict:
        self.logger.info(f"[{PREFIX_SYS}-049] Donanım taraması başlatıldı...")

        ram_total_bytes = psutil.virtual_memory().total
        ram_gb = max(1, int((ram_total_bytes + (1024 ** 3) - 1) / (1024 ** 3)))
        cpu_info = self._scan_cpu()
        gpu_info = self._scan_gpu()
        has_winrt = self._can_start_windows_ocr()
        has_easyocr = find_spec("easyocr") is not None
        log_event(
            PREFIX_SYS,
            "069",
            (
                "OCR engine readiness summary: "
                f"winonly={has_winrt}, easy={has_easyocr}"
            ),
        )

        available_engines = []
        if has_winrt:
            available_engines.append("winonly")
        if has_easyocr:
            available_engines.append("easy")
        engine_details = {
            "winonly": {
                "available": has_winrt,
                "reason": "Windows OCR ve gerekli dil paketi hazır."
                if has_winrt
                else "Windows OCR bileşeni veya İngilizce dil paketi hazır değil.",
                "repair_available": not has_winrt,
                "repair_kind": "guided" if not has_winrt else None,
            },
            "easy": {
                "available": has_easyocr,
                "reason": "EasyOCR hazır. GPU yoksa da daha yavaş modda çalışabilir."
                if has_easyocr
                else "EasyOCR paketi bulunamadı.",
                "repair_available": not has_easyocr,
                "repair_kind": "auto" if not has_easyocr else None,
            },
        }

        benchmark_recommendation = self._read_benchmark_recommendation(available_engines)
        if benchmark_recommendation:
            recommended = benchmark_recommendation
        elif gpu_info["available"] and ram_gb >= 8 and "easy" in available_engines:
            recommended = "easy"
        elif "winonly" in available_engines:
            recommended = "winonly"
        elif available_engines:
            recommended = available_engines[0]
        else:
            recommended = ""

        self.logger.info(f"[{PREFIX_SYS}-050] Rapor: {ram_gb}GB RAM, GPU: {gpu_info['name']}")

        # Check actual CUDA availability via torch, not just GPU detection
        cuda_available = self._check_cuda_available()

        return {
            "gpu": gpu_info,
            "cpu": cpu_info,
            "cuda_available": cuda_available,
            "winrt_available": has_winrt,
            "ram_gb": ram_gb,
            "recommended_engine": recommended,
            "available_engines": available_engines,
            "engine_details": engine_details,
        }

    def _read_benchmark_recommendation(self, available_engines: list[str]) -> str:
        benchmark_file = Path(BENCHMARKS_DIR) / "latest.json"
        if not benchmark_file.exists():
            return ""
        try:
            with open(benchmark_file, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
            candidate = str(payload.get("recommended_engine") or "").strip()
            return candidate if candidate in available_engines else ""
        except Exception as exc:
            log_error(PREFIX_SYS, "058", f"[Donanım Benchmark] -> OKUMA BAŞARISIZ | Hata: {exc}", "Benchmark onerisi okunamadi.")
            return ""

    def repair_engine(self, engine_id: str) -> dict:
        if engine_id == "easy":
            return self._repair_easyocr()
        if engine_id == "winonly":
            return self._open_windows_language_settings(engine_id)
        return {
            "engine": engine_id,
            "success": False,
            "retryable": False,
            "message": "Bu motor için otomatik onarım desteği yok.",
        }

    def _repair_easyocr(self) -> dict:
        try:
            cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            command = [sys.executable, "-m", "pip", "install", "easyocr"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=900, check=False, creationflags=cflags)
            if result.returncode == 0 and find_spec("easyocr") is not None:
                return {
                    "engine": "easy",
                    "success": True,
                    "retryable": False,
                    "message": "EasyOCR bağımlılığı kuruldu. Motor yeniden kontrol edildi.",
                }
            return {
                "engine": "easy",
                "success": False,
                "retryable": False,
                "message": "EasyOCR onarımı tamamlanamadı. Paket kurulumu başarısız oldu.",
            }
        except Exception as exc:
            log_error(PREFIX_SYS, "055", f"[EasyOCR] -> ONARIM HATASI | Hata: {exc}", "EasyOCR onarımı sırasında hata oluştu.")
            return {
                "engine": "easy",
                "success": False,
                "retryable": False,
                "message": "EasyOCR onarımı başlatılamadı.",
            }

    def _open_windows_language_settings(self, engine_id: str) -> dict:
        try:
            os.startfile("ms-settings:regionlanguage")
            return {
                "engine": engine_id,
                "success": False,
                "retryable": False,
                "message": "Windows dil ayarları açıldı. Gerekli dil paketini kurduktan sonra motorları yeniden tara.",
            }
        except Exception as exc:
            log_error(PREFIX_SYS, "056", f"[Windows Dil Ayarları] -> AÇILAMADI | Hata: {exc}", "Windows dil ayarları açılamadı.")
            return {
                "engine": engine_id,
                "success": False,
                "retryable": False,
                "message": "Windows dil ayarları açılamadı. Gerekli paketleri elle kontrol edin.",
            }

    def _scan_gpu(self) -> dict:
        gpu_info = {"available": False, "name": "Bulunamadi veya Desteklenmiyor", "vram_mb": 0}
        try:
            cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                capture_output=True,
                text=True,
                check=True,
                creationflags=cflags,
            )
            raw_line = result.stdout.strip().split("\n")[0]
            parts = [part.strip() for part in raw_line.split(",", 1)]
            gpu_name = parts[0]
            try:
                vram_mb = int((parts[1] if len(parts) > 1 else "0").split()[0])
            except (ValueError, IndexError) as exc:
                vram_mb = 0
                try:
                    import torch
                    if torch.cuda.is_available():
                        vram_mb = int(torch.cuda.get_device_properties(0).total_memory / (1024**2))
                except Exception:
                    pass
                if vram_mb == 0:
                    log_error(PREFIX_SYS, "018", f"[GPU Bellek] -> VRAM OKUMA HATASI | Aksiyon: 0 Varsayıldı | Hata: {exc}", "GPU belleği okunamadı, 0 varsayıldı.")
            gpu_info = {"available": True, "name": gpu_name, "vram_mb": vram_mb}
        except FileNotFoundError:
            self.logger.warning(f"[{PREFIX_SYS}-051] NVIDIA GPU bulunamadı.")
        except subprocess.CalledProcessError as exc:
            log_error(PREFIX_SYS, "052", f"[NVIDIA Sürücüsü] -> YANIT VERMİYOR | Hata: {exc}", "GPU sürücüsü yanıt vermiyor.")
        except Exception as exc:
            log_error(PREFIX_SYS, "053", f"[Donanım Taraması] -> BİLİNMEYEN HATA | Hata: {exc}", "Bilinmeyen donanım tarama hatası.")
        return gpu_info

    def _scan_cpu(self) -> dict:
        cpu_name = platform.processor() or platform.uname().processor or "Bilinmiyor"
        return {
            "name": cpu_name,
            "cores": psutil.cpu_count(logical=False) or 0,
            "threads": psutil.cpu_count(logical=True) or 0,
        }

    def _can_start_windows_ocr(self) -> bool:
        if find_spec("winrt.windows.media.ocr") is None:
            log_event(PREFIX_SYS, "069", "Windows OCR probe: winrt.windows.media.ocr module missing", level="warning")
            return False
            
        try:
            from winrt.windows.graphics.imaging import BitmapPixelFormat, SoftwareBitmap  # noqa: F401
        except ImportError as e:
            log_event(PREFIX_SYS, "069", f"Windows OCR probe: screen capture dependencies missing ({e})", level="warning")
            return False

        try:
            engine = WindowsOCREngine()
            log_event(
                PREFIX_SYS,
                "069",
                (
                    "Windows OCR probe: "
                    f"source_language={engine.source_language}, language_tag={engine.language_tag}"
                ),
                level="debug",
            )
            started = engine.start()
            
            # Eger basariyla baslamissa ama Ingilizce yerine (orn. Turkce'ye) fallback yapmissa,
            # Windows OCR'i "eksik" (hatali) kabul et! Cunku oyunlari Ingilizce okuyacagiz.
            if started and not engine.language_tag.lower().startswith("en"):
                log_event(
                    PREFIX_SYS,
                    "070",
                    f"Windows OCR started with fallback language {engine.language_tag} instead of English. Marking as failed.",
                    level="warning",
                )
                return False

            log_event(
                PREFIX_SYS,
                "069",
                (
                    "Windows OCR probe result: "
                    f"started={started}, language_tag={engine.language_tag}, start_error={engine.start_error!r}"
                ),
                level="debug" if started else "warning",
            )
            if started:
                engine.stop()
            return started
        except Exception as exc:
            log_error(PREFIX_SYS, "054", f"[Windows OCR] -> HAZIRLIK KONTROLÜ BAŞARISIZ | Hata: {exc}", "Windows OCR hazırlık kontrolü başarısız.")
            return False

    def _check_cuda_available(self) -> bool:
        """Check if CUDA runtime is actually available via torch."""
        try:
            import torch
            result = torch.cuda.is_available()
            self.logger.info(f"[{PREFIX_SYS}-060] CUDA runtime check: {result}")
            return result
        except ImportError:
            self.logger.debug(f"[{PREFIX_SYS}-061] PyTorch not installed, CUDA unavailable")
            return False
        except Exception as exc:
            self.logger.warning(f"[{PREFIX_SYS}-062] [CUDA Kontrolü] -> KONTROL HATASI | Detay: {exc}")
            return False

