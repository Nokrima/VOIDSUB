from __future__ import annotations

import importlib.util
import json
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from importlib import metadata
from pathlib import Path

from core.errors import PREFIX_TRL, log_error, log_event

DEFAULT_MODEL_KEY = "opus_mt_en_tr"
RUNTIME_PROFILE_FILE = "runtime_profile.json"
PACKAGE_NAMES = ("ctranslate2", "transformers", "sentencepiece", "huggingface_hub", "safetensors")
MIN_TORCH_VERSION = (2, 6)
LEGACY_MODEL_FOLDERS = ("nllb-1.3b-tmp",)
LEGACY_PROFILE_FILES = ("nllb-1.3b.runtime.pending.json",)

MODEL_SPECS: dict[str, dict] = {
    "opus_mt_en_tr": {
        "key": "opus_mt_en_tr",
        "label": "Opus EN->TR",
        "repo_id": "Helsinki-NLP/opus-mt-tc-big-en-tr",
        "folder": "offline-model-slot",
        "tmp_suffix": "-tmp",
        "pending_profile": "offline-model-slot.runtime.pending.json",
        "preferred_weight_files": ("model.safetensors", "pytorch_model.bin"),
        "required_files": (
            "config.json",
            "generation_config.json",
            "source.spm",
            "special_tokens_map.json",
            "target.spm",
            "tokenizer_config.json",
            "vocab.json",
        ),
        "tokenizer_files": (
            "generation_config.json",
            "source.spm",
            "special_tokens_map.json",
            "target.spm",
            "tokenizer_config.json",
            "vocab.json",
        ),
        "ready_files": (
            "model.bin",
            "config.json",
            "source.spm",
            "target.spm",
            "tokenizer_config.json",
            "vocab.json",
        ),
        "runtime_kind": "opus",
    },
    "nllb": {
        "key": "nllb",
        "label": "NLLB 1.3B",
        "repo_id": "facebook/nllb-200-distilled-1.3B",
        "folder": "nllb-1.3b",
        "tmp_suffix": "-tmp",
        "pending_profile": "nllb-1.3b.runtime.pending.json",
        "preferred_weight_files": ("model.safetensors", "pytorch_model.bin"),
        "required_files": (
            ".gitattributes",
            "config.json",
            "generation_config.json",
            "README.md",
            "sentencepiece.bpe.model",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ),
        "tokenizer_files": (
            "generation_config.json",
            "sentencepiece.bpe.model",
            "special_tokens_map.json",
            "tokenizer.json",
            "tokenizer_config.json",
        ),
        "ready_files": (
            "model.bin",
            "shared_vocabulary.json",
            "tokenizer_config.json",
        ),
        "runtime_kind": "nllb",
    },
}


class OfflineModelManager:
    def __init__(self, models_dir: Path, model_key: str = DEFAULT_MODEL_KEY, bridge=None):
        self.models_dir = models_dir
        self.bridge = bridge
        self.model_key = self._normalize_model_key(model_key)
        self.spec = MODEL_SPECS[self.model_key]
        self.model_dir = models_dir / str(self.spec["folder"])
        self.tmp_dir = models_dir / f"{self.spec['folder']}{self.spec['tmp_suffix']}"
        self.pending_profile_path = models_dir / str(self.spec["pending_profile"])
        self.runtime_profile_path = self.model_dir / RUNTIME_PROFILE_FILE
        self.state = "idle"
        self.percent = 0
        self.detail = "Yerel model kurulumu bekleniyor."
        self.bytes_label = ""
        self.active_proc: subprocess.Popen | None = None
        self._cancel = threading.Event()
        self._pause = threading.Event()
        self._thread: threading.Thread | None = None
        self._install_started_at = 0.0

    def set_model_key(self, model_key: str) -> None:
        normalized = self._normalize_model_key(model_key)
        if normalized == self.model_key:
            return
        self.model_key = normalized
        self.spec = MODEL_SPECS[self.model_key]
        self.model_dir = self.models_dir / str(self.spec["folder"])
        self.tmp_dir = self.models_dir / f"{self.spec['folder']}{self.spec['tmp_suffix']}"
        self.pending_profile_path = self.models_dir / str(self.spec["pending_profile"])
        self.runtime_profile_path = self.model_dir / RUNTIME_PROFILE_FILE
        self._reset_idle_state()

    def get_status(self) -> dict:
        ready = self._is_ready()
        busy = self.state in {"packages", "planning", "downloading", "converting", "verifying", "remove"}
        return {
            "model": self.model_key,
            "label": self.spec["label"],
            "available": ready,
            "busy": busy,
            "packages_ready": self._packages_ready(),
            "models_ready": {self.model_key: ready},
            "models_dir": str(self.models_dir),
            "model_dir": str(self.model_dir),
            "state": "ready" if ready and not busy else self.state,
            "percent": 100 if ready and not busy else self.percent,
            "detail": "Model hazır." if ready and not busy else self.detail,
            "bytes_label": self.bytes_label,
        }

    def verify_integrity(self) -> bool:
        """MD5 Hash kontrolü yapar. Eger checksums.json yoksa (eski kurulum) True döner."""
        checksum_path = self.model_dir / "checksums.json"
        if not checksum_path.exists():
            return True
        try:
            import hashlib
            expected = json.loads(checksum_path.read_text(encoding="utf-8"))
            for name, expected_hash in expected.items():
                file_path = self.model_dir / name
                if not file_path.exists():
                    log_error(PREFIX_TRL, "090", f"[Model Bütünlüğü] -> EKSİK DOSYA | Detay: {name} bulunamadı", "Model dosyasi silinmis!")
                    self._handle_corrupt_model()
                    return False
                md5 = hashlib.md5()
                with open(file_path, "rb") as f:
                    for chunk in iter(lambda: f.read(4096 * 1024), b""):
                        md5.update(chunk)
                if md5.hexdigest() != expected_hash:
                    log_error(PREFIX_TRL, "091", f"[Model Bütünlüğü] -> BOZUK DOSYA | Detay: {name} (MD5 uyuşmazlığı)", "Model dosyasi bozulmus (MD5 uyusmazligi)!")
                    self._handle_corrupt_model()
                    return False
            return True
        except Exception as exc:
            log_error(PREFIX_TRL, "092", f"[Model Bütünlüğü] -> KONTROL HATASI | Hata: {exc}", "Model butunlugu dogrulanamadi.")
            self._handle_corrupt_model()
            return False

    def _handle_corrupt_model(self) -> None:
        from core.errors import emit_bridge_event
        log_event(PREFIX_TRL, "060", f"[Model Yöneticisi] Model bozuk/eksik tespit edildi, yeniden indirme başlatılıyor: {self.model_key}")
        emit_bridge_event("log_entry", {
            "timestamp": "", "level": "ERROR", "prefix": "TRL", "code": "TRL-060",
            "message": "Model dosyaları eksik veya bozuk. Yeniden indiriliyor."
        })
        emit_bridge_event("translation_state", {
            "running": False,
            "reason": "engine_unavailable",
            "message": "Model dosyaları bozuk. Yeniden indiriliyor."
        })
        # Kaldırıp yeniden indirmeyi başlat
        self.remove()
        threading.Timer(1.0, self.start).start()

    def recover(self) -> None:
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._delete_legacy_artifacts()
        # if self.tmp_dir.exists():
        #     shutil.rmtree(self.tmp_dir, ignore_errors=True)
        #     log_event(PREFIX_TRL, "060", f"[Sistem Temizliği] -> TEMİZLENDİ | Yarım kalan geçici klasör: {self.tmp_dir}", level="warning")
        if self.model_dir.exists() and not self._is_ready():
            shutil.rmtree(self.model_dir, ignore_errors=True)
            log_event(PREFIX_TRL, "061", f"[Sistem Temizliği] -> TEMİZLENDİ | Eksik runtime klasörü: {self.model_dir}", level="warning")
        self._reset_idle_state()
        self._send_status()

    def start(self, bridge=None) -> None:
        if bridge is not None:
            self.bridge = bridge
        if self._is_ready():
            log_event(PREFIX_TRL, "041", f"[Model Kurulumu] -> ATLANDI | Model zaten hazır: {self.model_key}")
            self._send_status()
            return
        if self._thread and self._thread.is_alive():
            log_event(PREFIX_TRL, "042", f"[Model Kurulumu] -> REDDEDİLDİ | Kurulum zaten sürüyor: {self.model_key}", level="warning")
            self._send_status()
            return
        self._cancel.clear()
        self._pause.clear()
        self._thread = threading.Thread(target=self._install_worker, name=f"offline-model-install-{self.model_key}", daemon=True)
        self._thread.start()

    def cancel(self) -> None:
        self._cancel.set()
        if self.active_proc and self.active_proc.poll() is None:
            self.active_proc.terminate()
        self.state = "idle"
        self.percent = 0
        self.detail = "Kurulum iptal edildi."
        self.bytes_label = ""
        log_event(PREFIX_TRL, "056", f"[Model Kurulumu] -> İPTAL EDİLDİ | Model: {self.model_key}", level="warning")
        self._send("offline_model_cancelled", {"message": f"{self.spec['label']} kurulumu iptal edildi.", "model": self.model_key})
        self._send_status()

    def pause(self) -> None:
        self._pause.set()
        if self.active_proc and self.active_proc.poll() is None:
            self.active_proc.terminate()
        self.state = "paused"
        self.detail = "İndirme duraklatıldı."
        log_event(PREFIX_TRL, "056", f"[Model Kurulumu] -> DURAKLATILDI | Model: {self.model_key}", level="info")
        self._send("offline_model_paused", {"message": f"{self.spec['label']} kurulumu duraklatıldı.", "model": self.model_key})
        self._send_status()

    def remove(self) -> None:
        started_at = time.monotonic()
        log_event(PREFIX_TRL, "054", f"[Model Kaldırma] -> BAŞLADI | Model: {self.model_key} | Klasör: {self.model_dir}")
        self._cancel.set()
        self._pause.clear()
        if self.active_proc and self.active_proc.poll() is None:
            self.active_proc.terminate()
        self.state = "remove"
        self.percent = 0
        self.detail = "Model kaldırılıyor."
        self.bytes_label = ""
        self._send_progress()
        self._delete_legacy_artifacts()
        self._delete_path(self.tmp_dir)
        self._delete_path(self.model_dir)
        self.pending_profile_path.unlink(missing_ok=True)
        self._reset_idle_state()
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        log_event(PREFIX_TRL, "055", f"[Model Kaldırma] -> TAMAMLANDI | Model: {self.model_key} | Süre(ms): {elapsed_ms}")
        self._send_status()

    def save_runtime_profile(self, profile: dict) -> None:
        target = self.runtime_profile_path if self.model_dir.exists() else self.pending_profile_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(profile, ensure_ascii=True, indent=2), encoding="utf-8")

    def load_runtime_profile(self) -> dict | None:
        for candidate in (self.runtime_profile_path, self.pending_profile_path):
            if not candidate.exists():
                continue
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except Exception as exc:
                log_event(PREFIX_TRL, "078", f"Runtime profili okunamadi: model={self.model_key} path={candidate} error={exc}", level="warning")
        return None

    def _install_worker(self) -> None:
        self._install_started_at = time.monotonic()
        try:
            self.models_dir.mkdir(parents=True, exist_ok=True)
            self._delete_legacy_artifacts()
            log_event(PREFIX_TRL, "040", f"[Model Kurulumu] -> BAŞLADI | Model: {self.model_key} | Repo: {self.spec['repo_id']}")
            self._ensure_packages()
            self._raise_if_cancelled()
            self._prepare_workspace()
            files = self._build_download_plan()
            self._download_files(files)
            self._raise_if_cancelled()
            self._convert_model()
            self._copy_tokenizer_files()
            self._raise_if_cancelled()
            self._verify_model()
            self._promote_pending_runtime_profile()
            self._delete_path(self.tmp_dir)
            self.state = "ready"
            self.percent = 100
            self.detail = "Model hazır."
            self.bytes_label = ""
            elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000)
            log_event(PREFIX_TRL, "059", f"[Model Kurulumu] -> TAMAMLANDI | Model: {self.model_key} | Süre(ms): {elapsed_ms}")
            self._send_status()
            self._send("offline_model_complete", {"percent": 100, "model": self.model_key, "elapsed_ms": elapsed_ms})
        except RuntimeError as exc:
            if str(exc) == "paused" or self._pause.is_set():
                self.state = "paused"
                self.detail = "İndirme duraklatıldı."
                self._send_status()
                return
            if str(exc) == "cancelled" or self._cancel.is_set():
                self._delete_path(self.tmp_dir)
                self._reset_idle_state()
                self._send_status()
                return
            self._fail(str(exc))
        except Exception as exc:
            self._fail(str(exc))
        finally:
            self.active_proc = None

    def _get_plugin_python(self) -> Path | None:
        import os
        app_data = Path(os.environ.get('LOCALAPPDATA', 'C:/')) / 'Virel V2'
        python_exe = app_data / 'plugins' / 'easyocr' / 'python.exe'
        return python_exe if python_exe.exists() else None

    def _ensure_packages(self) -> None:
        self._set_stage("packages", 4, "Paketler kontrol ediliyor")
        
        is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
        if is_compiled:
            plugin_python = self._get_plugin_python()
            if not plugin_python:
                raise RuntimeError("Çevrimdışı modelleri indirebilmek ve dönüştürebilmek için önce Ayarlar'dan EasyOCR Eklentisini indirmeniz gerekmektedir (PyTorch barındırır).")
            # Plugin içinde transformers ve ctranslate2 olduğundan emin olalım
            self._install_package_args(["ctranslate2", "transformers", "sentencepiece", "huggingface_hub", "safetensors"], "Eklenti içine dönüştürücü paketleri kurulamadı")
            return

        missing = [name for name in PACKAGE_NAMES if importlib.util.find_spec(name) is None]
        torch_ready = importlib.util.find_spec("torch") is not None and self._torch_version_ready()
        log_event(PREFIX_TRL, "043", f"[Paket Yöneticisi] -> KONTROL EDİLDİ | Model: {self.model_key} | Eksik: {missing} | Torch: {torch_ready}")
        if missing:
            self._install_package_args([*missing], "Temel Python paketleri kurulamadı")
        if not torch_ready:
            self._install_package_args(["torch>=2.6"], "PyTorch kurulumu/güncellemesi tamamlanamadı")

    def _install_package_args(self, packages: list[str], failure_message: str) -> None:
        log_event(PREFIX_TRL, "044", f"[Paket Yöneticisi] -> KURULUM BAŞLADI | Paketler: {packages}")
        
        is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
        executable = str(self._get_plugin_python()) if is_compiled else sys.executable
        
        command = [executable, "-m", "pip", "install", "--upgrade", *packages]
        self._run_process(command, failure_message, log_stdout=False)
        log_event(PREFIX_TRL, "045", f"[Paket Yöneticisi] -> KURULUM TAMAMLANDI | Paketler: {packages}")

    def _prepare_workspace(self) -> None:
        # self._delete_path(self.tmp_dir)
        self._delete_path(self.model_dir)
        self.tmp_dir.mkdir(parents=True, exist_ok=True)
        self._set_stage("planning", 8, "Dosya planı hazırlanıyor")
        log_event(PREFIX_TRL, "046", f"[Çalışma Alanı] -> HAZIRLANDI | Geçici Klasör: {self.tmp_dir}")

    def _build_download_plan(self) -> list[dict]:
        from huggingface_hub import HfApi

        repo_id = str(self.spec["repo_id"])
        info = HfApi().model_info(repo_id, files_metadata=True)
        siblings = {str(getattr(item, "rfilename", "")): int(getattr(item, "size", 0) or 0) for item in getattr(info, "siblings", [])}
        weight_file = next((name for name in self.spec["preferred_weight_files"] if name in siblings), None)
        if not weight_file:
            raise RuntimeError(f"Agirlik dosyasi bulunamadi: {self.spec['preferred_weight_files']}")
        names = [*self.spec["required_files"], weight_file]
        missing = [name for name in names if name not in siblings]
        if missing:
            raise RuntimeError(f"Repo dosya plani eksik: {', '.join(missing)}")
        files = [{"name": name, "size": siblings.get(name, 0)} for name in names]
        total_bytes = sum(item["size"] for item in files)
        log_event(
            PREFIX_TRL,
            "047",
            f"Dosya plani hazir: model={self.model_key} files={[item['name'] for item in files]} total={self._format_bytes(total_bytes)}",
        )
        return files

    def _download_files(self, files: list[dict]) -> None:
        total = max(sum(int(item.get("size", 0) or 0) for item in files), 1)
        downloaded = 0
        for index, item in enumerate(files, start=1):
            self._raise_if_cancelled()
            name = str(item["name"])
            size = int(item.get("size", 0) or 0)
            percent = 10 + int((downloaded / total) * 50)
            self._set_stage("downloading", percent, f"{name} indiriliyor... ({index}/{len(files)})")
            log_event(PREFIX_TRL, "048", f"[Model İndirme] -> İNDİRİLİYOR | Dosya: {name} ({index}/{len(files)}) | Boyut: {self._format_bytes(size) if size else 'Bilinmiyor'}")
            started_at = time.monotonic()
            try:
                self._download_file(name, size)
            except Exception as exc:
                log_error(PREFIX_TRL, "049", f"[Model İndirme] -> İNDİRME BAŞARISIZ | Model: {self.model_key} | Dosya: {name} | Hata: {exc}", "Offline model dosyasi indirilemedi.")
                raise
            elapsed_ms = int((time.monotonic() - started_at) * 1000)
            resolved = self.tmp_dir / name
            downloaded += size if size else (resolved.stat().st_size if resolved.exists() else 0)
            self.bytes_label = f"{self._format_bytes(min(downloaded, total))} / {self._format_bytes(total)}"
            log_event(PREFIX_TRL, "050", f"[Model İndirme] -> İNDİRİLDİ | Dosya: {name} | Süre(ms): {elapsed_ms}")
        self._verify_download_plan(files)

    def _download_file(self, filename: str, total_bytes: int) -> None:
        is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
        executable = str(self._get_plugin_python()) if is_compiled else sys.executable
        
        command = [
            executable,
            "-c",
            (
                "from huggingface_hub import hf_hub_download; "
                f"hf_hub_download(repo_id={self.spec['repo_id']!r}, filename={filename!r}, local_dir={str(self.tmp_dir)!r})"
            ),
        ]
        watch_path = self.tmp_dir
        while True:
            try:
                self._run_process(command, f"Model dosyası indirilemedi: {filename}", watch_path=watch_path, total_bytes=total_bytes)
                return
            except RuntimeError:
                if self._cancel.is_set():
                    raise RuntimeError("cancelled")
                if self._internet_available():
                    raise
                log_event(PREFIX_TRL, "051", f"[Ağ Bağlantısı] -> BEKLENİYOR | İnternet koptu, yeniden deneniyor...", level="warning")
                self.detail = f"Bağlantı bekleniyor: {filename}"
                self.bytes_label = ""
                self._send_progress()
                self._wait_for_internet()

    def _verify_download_plan(self, files: list[dict]) -> None:
        missing = [str(item["name"]) for item in files if not (self.tmp_dir / str(item["name"])).exists()]
        if missing:
            raise RuntimeError(f"Indirilen model dosyalari eksik: {', '.join(missing)}")
        log_event(PREFIX_TRL, "052", f"[Model İndirme] -> DOĞRULANDI | Toplam Dosya: {len(files)}")

    def _convert_model(self) -> None:
        self._set_stage("converting", 68, "CTranslate2 dönüşümü")
        copy_files = [name for name in self.spec["tokenizer_files"] if (self.tmp_dir / name).exists()]
        command = [
            str(self._converter_path()),
            "--model",
            str(self.tmp_dir),
            "--output_dir",
            str(self.model_dir),
            "--quantization",
            "int8",
            "--force",
            "--low_cpu_mem_usage",
        ]
        if copy_files:
            command.extend(["--copy_files", *copy_files])
        log_event(PREFIX_TRL, "053", f"[Model Dönüşümü] -> BAŞLADI | Model: {self.model_key} | Komut: {' '.join(command)}")
        started_at = time.monotonic()
        try:
            self._run_process(command, "Model dönüşümü tamamlanamadı", log_stdout=True)
        except Exception as exc:
            self._log_dir_snapshot(self.tmp_dir, "convert_failure_tmp")
            self._log_dir_snapshot(self.model_dir, "convert_failure_model")
            log_error(PREFIX_TRL, "057", f"[Model Dönüşümü] -> DÖNÜŞÜM BAŞARISIZ | Model: {self.model_key} | Hata: {exc}", "Offline model donusumu tamamlanamadi.")
            raise
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        log_event(PREFIX_TRL, "058", f"[Model Dönüşümü] -> TAMAMLANDI | Süre(ms): {elapsed_ms}")

    def _copy_tokenizer_files(self) -> None:
        self.model_dir.mkdir(parents=True, exist_ok=True)
        for name in tuple(self.spec["tokenizer_files"]):
            source = self.tmp_dir / name
            target = self.model_dir / name
            if source.exists() and not target.exists():
                shutil.copy2(source, target)
                log_event(PREFIX_TRL, "062", f"[Model Dönüşümü] -> KOPYALANDI | Dosya: {name}")

    def _verify_model(self) -> None:
        self._set_stage("verifying", 92, "Runtime doğrulaması")
        missing = [name for name in tuple(self.spec["ready_files"]) if not (self.model_dir / name).exists()]
        if missing:
            raise RuntimeError(f"Eksik runtime dosyalari: {', '.join(missing)}")
        log_event(PREFIX_TRL, "063", f"[Model Doğrulama] -> DOĞRULANDI | İstenen Dosyalar: {self.spec['ready_files']}")
        import hashlib

        if self.spec["runtime_kind"] == "opus":
            from transformers import MarianTokenizer
            tokenizer = MarianTokenizer.from_pretrained(str(self.model_dir), use_fast=False)
        else:
            from transformers import AutoTokenizer
            tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir), src_lang="eng_Latn", use_fast=False)

        import ctranslate2
        translator = ctranslate2.Translator(
            str(self.model_dir),
            device="cpu",
            compute_type="int8",
            inter_threads=1,
            intra_threads=1,
        )

        del translator
        del tokenizer
        
        # Calculate and save MD5 checksums
        self._set_stage("verifying", 95, "MD5 Bütünlük kontrolü hazırlanıyor")
        checksums = {}
        for name in self.spec["ready_files"]:
            file_path = self.model_dir / name
            if file_path.exists():
                md5 = hashlib.md5()
                with open(file_path, "rb") as f:
                    for chunk in iter(lambda: f.read(4096 * 1024), b""):
                        md5.update(chunk)
                checksums[name] = md5.hexdigest()
        
        checksum_path = self.model_dir / "checksums.json"
        checksum_path.write_text(json.dumps(checksums, indent=2), encoding="utf-8")
        
        log_event(PREFIX_TRL, "064", f"[Model Doğrulama] -> BAŞARILI & MD5 OLUŞTURULDU | Model: {self.model_key}")

    def _promote_pending_runtime_profile(self) -> None:
        if not self.pending_profile_path.exists():
            return
        self.model_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.pending_profile_path, self.runtime_profile_path)
        self.pending_profile_path.unlink(missing_ok=True)
        log_event(PREFIX_TRL, "065", f"[Çalışma Profili] -> UYGULANDI | Model: {self.model_key}")

    def _set_stage(self, state: str, percent: int, detail: str) -> None:
        self.state = state
        self.percent = max(0, min(100, percent))
        self.detail = detail
        if state != "downloading":
            self.bytes_label = ""
        self._send_progress()
        self._send_status()

    def _send_progress(self) -> None:
        self._send(
            "offline_model_progress",
            {
                "stage": self.state,
                "percent": self.percent,
                "model": self.model_key,
                "detail": self.detail,
                "bytes_label": self.bytes_label,
            },
        )

    def _send_status(self) -> None:
        self._send("offline_model_status", self.get_status())

    def _run_process(
        self,
        command: list[str],
        failure_message: str,
        *,
        watch_path: Path | None = None,
        total_bytes: int = 0,
        log_stdout: bool = False,
    ) -> None:
        import collections
        import threading
        
        base_bytes = self._measure_path(watch_path) if watch_path is not None else 0
        cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        
        self.active_proc = subprocess.Popen(
            command, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True, 
            encoding="utf-8", 
            errors="replace", 
            creationflags=cflags
        )
        
        stdout_deque = collections.deque(maxlen=30)
        stderr_deque = collections.deque(maxlen=30)
        
        def _read_stream(stream, out_queue, is_stdout):
            if not stream:
                return
            for line in iter(stream.readline, ""):
                if not line:
                    break
                line_str = line.strip()
                if line_str:
                    out_queue.append(line_str)
                    if is_stdout and log_stdout:
                        log_event(PREFIX_TRL, "068", f"[Sistem Süreci] -> ÇIKTI (STDOUT) | {line_str}")
            stream.close()

        t_out = threading.Thread(target=_read_stream, args=(self.active_proc.stdout, stdout_deque, True), daemon=True)
        t_err = threading.Thread(target=_read_stream, args=(self.active_proc.stderr, stderr_deque, False), daemon=True)
        t_out.start()
        t_err.start()

        while self.active_proc.poll() is None:
            if self._cancel.is_set():
                self.active_proc.terminate()
                try:
                    self.active_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.active_proc.kill()
                    self.active_proc.wait(timeout=5)
                log_event(PREFIX_TRL, "072", f"[Sistem Süreci] -> DURDURULDU (İPTAL) | Komut: {' '.join(command)}", level="warning")
                raise RuntimeError("cancelled")
            if self._pause.is_set():
                self.active_proc.terminate()
                try:
                    self.active_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.active_proc.kill()
                    self.active_proc.wait(timeout=5)
                raise RuntimeError("paused")
            if watch_path is not None and total_bytes > 0:
                current_bytes = max(0, self._measure_path(watch_path) - base_bytes)
                current_bytes = min(current_bytes, total_bytes)
                self.bytes_label = f"{self._format_bytes(current_bytes)} / {self._format_bytes(total_bytes)}"
                self._send_progress()
            time.sleep(0.25)
            
        t_out.join(timeout=1)
        t_err.join(timeout=1)
        
        if self.active_proc.returncode != 0:
            for line in list(stderr_deque):
                log_event(PREFIX_TRL, "067", f"[Sistem Süreci] -> ÇIKTI (STDERR) | {line}", level="error")
            raise RuntimeError(f"{failure_message}: exit code {self.active_proc.returncode}")

    def _packages_ready(self) -> bool:
        try:
            return (
                all(importlib.util.find_spec(name) is not None for name in PACKAGE_NAMES)
                and importlib.util.find_spec("torch") is not None
                and self._torch_version_ready()
            )
        except ImportError:
            # Nuitka '--nofollow-import-to' ile derlendiginde, haric tutulan 
            # moduller icin find_spec ImportError firlatir.
            return False

    def _torch_version_ready(self) -> bool:
        version = self._torch_version_label()
        if not version:
            return False
        numeric_parts = self._parse_version(version)
        return tuple(numeric_parts[:2]) >= MIN_TORCH_VERSION

    def _torch_version_label(self) -> str:
        try:
            return metadata.version("torch")
        except metadata.PackageNotFoundError:
            return ""

    def _parse_version(self, raw_version: str) -> list[int]:
        version_text = raw_version.split("+", 1)[0]
        numeric_parts: list[int] = []
        for chunk in version_text.split("."):
            match = re.match(r"(\d+)", chunk)
            if not match:
                break
            numeric_parts.append(int(match.group(1)))
        while len(numeric_parts) < 2:
            numeric_parts.append(0)
        return numeric_parts

    def _is_ready(self) -> bool:
        return all((self.model_dir / name).exists() for name in tuple(self.spec["ready_files"]))

    def _reset_idle_state(self) -> None:
        ready = self._is_ready()
        self.state = "ready" if ready else "idle"
        self.percent = 100 if ready else 0
        self.detail = "Model hazır." if ready else "Yerel model kurulumu bekleniyor."
        self.bytes_label = ""

    def _raise_if_cancelled(self) -> None:
        if self._cancel.is_set():
            raise RuntimeError("cancelled")
        if self._pause.is_set():
            raise RuntimeError("paused")

    def _delete_legacy_artifacts(self) -> None:
        for folder_name in LEGACY_MODEL_FOLDERS:
            shutil.rmtree(self.models_dir / folder_name, ignore_errors=True)
        for file_name in LEGACY_PROFILE_FILES:
            (self.models_dir / file_name).unlink(missing_ok=True)

    def _delete_path(self, path: Path) -> None:
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)

    def _converter_path(self) -> Path | str:
        is_compiled = getattr(sys, "frozen", False) or "__compiled__" in globals()
        if is_compiled:
            plugin_python = self._get_plugin_python()
            if plugin_python:
                converter = plugin_python.parent / "Scripts" / "ct2-transformers-converter.exe"
                if converter.exists():
                    return converter
        
        converter = Path(sys.executable).with_name("ct2-transformers-converter.exe")
        return converter if converter.exists() else "ct2-transformers-converter"

    def _internet_available(self) -> bool:
        for host, port in (("huggingface.co", 443), ("1.1.1.1", 53)):
            try:
                with socket.create_connection((host, port), timeout=2.0):
                    return True
            except OSError:
                continue
        return False

    def _wait_for_internet(self) -> None:
        while not self._cancel.is_set():
            if self._internet_available():
                return
            time.sleep(2.0)
        raise RuntimeError("cancelled")

    def _measure_path(self, path: Path | None) -> int:
        if path is None or not path.exists():
            return 0
        if path.is_file():
            return path.stat().st_size
        total = 0
        for item in path.rglob("*"):
            if item.is_file():
                total += item.stat().st_size
        return total

    def _format_bytes(self, value: int) -> str:
        size = float(max(value, 0))
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024.0 or unit == "GB":
                return f"{size:.1f}{unit}" if unit != "B" else f"{int(size)}B"
            size /= 1024.0
        return f"{value}B"

    def _clip_lines(self, text: str, limit: int) -> list[str]:
        if not text.strip():
            return []
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return lines[-limit:]

    def _fail(self, message: str) -> None:
        import shutil
        elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000) if self._install_started_at else 0
        self.state = "failed"
        self.percent = 0
        self.detail = message
        self.bytes_label = ""
        self._log_dir_snapshot(self.tmp_dir, "failure_tmp")
        if self.tmp_dir.exists():
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        # We do not delete model_dir here to preserve potentially working legacy models
        # self._log_dir_snapshot(self.model_dir, "failure_model")
        log_error(PREFIX_TRL, "069", f"[Model Kurulumu] -> KURULUM BAŞARISIZ | Model: {self.model_key} | Süre(ms): {elapsed_ms} | Hata: {message}", "Yerel model kurulumu tamamlanamadı.")
        self._send("offline_model_error", {"message": message, "model": self.model_key, "elapsed_ms": elapsed_ms})
        self._send_status()

    def _send(self, event: str, data: dict) -> None:
        if self.bridge is not None:
            self.bridge.send(event, data)

    def _log_dir_snapshot(self, directory: Path, label: str) -> None:
        if not directory.exists():
            log_event(PREFIX_TRL, "070", f"[Sistem Temizliği] -> KLASÖR BULUNAMADI | Hedef: {directory} | Etiket: {label}", level="warning")
            return
        items: list[str] = []
        for item in sorted(directory.iterdir(), key=lambda p: p.name.lower()):
            if item.is_file():
                items.append(f"{item.name} ({self._format_bytes(item.stat().st_size)})")
            else:
                items.append(f"{item.name}/")
        log_event(PREFIX_TRL, "071", f"[Sistem Temizliği] -> SİLİNDİ | İçerik: {', '.join(items) if items else 'boş'} | Etiket: {label}")

    def _normalize_model_key(self, model_key: str | None) -> str:
        normalized = (model_key or DEFAULT_MODEL_KEY).strip().lower()
        return normalized if normalized in MODEL_SPECS else DEFAULT_MODEL_KEY
