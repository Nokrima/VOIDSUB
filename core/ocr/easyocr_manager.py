from __future__ import annotations

import shutil
import threading
import time
import os
from pathlib import Path

from core.errors import PREFIX_OCR, log_error, log_event

EASYOCR_PLUGIN_REPO = "Nokrima/VoidSub-Plugins"
EASYOCR_RELEASE_TAG = "latest"  # Veya "v1.0"
EASYOCR_ASSET_NAME = "virel-easyocr-plugin.zip"


class EasyOCRManager:
    def __init__(self, plugins_dir: Path, bridge=None):
        self.plugins_dir = plugins_dir
        self.bridge = bridge
        self.plugin_dir = plugins_dir / "easyocr"
        self.tmp_dir = plugins_dir / "easyocr-tmp"

        self.state = "idle"
        self.percent = 0
        self.detail = "EasyOCR eklentisi bekleniyor."
        self.bytes_label = ""

        self._cancel = threading.Event()
        self._thread: threading.Thread | None = None
        self._install_started_at = 0.0

    def get_status(self) -> dict:
        ready = self._is_ready()
        busy = self.state in {
            "planning",
            "downloading",
            "extracting",
            "verifying",
            "remove",
        }
        return {
            "plugin": "easyocr",
            "label": "EasyOCR Yapay Zeka Motoru",
            "available": ready,
            "busy": busy,
            "plugin_dir": str(self.plugin_dir),
            "state": "ready" if ready and not busy else self.state,
            "percent": 100 if ready and not busy else self.percent,
            "detail": "Eklenti hazır." if ready and not busy else self.detail,
            "bytes_label": self.bytes_label,
        }

    def start(self, bridge=None) -> None:
        if bridge is not None:
            self.bridge = bridge
        if self._is_ready():
            log_event(
                PREFIX_OCR, "080", "[EasyOCR Kurulumu] -> ATLANDI | Eklenti zaten hazir"
            )
            self._send_status()
            return
        if self._thread and self._thread.is_alive():
            log_event(
                PREFIX_OCR,
                "081",
                "[EasyOCR Kurulumu] -> REDDEDILDI | Kurulum suruyor",
                level="warning",
            )
            self._send_status()
            return

        self._cancel.clear()
        self._thread = threading.Thread(
            target=self._install_worker, name="easyocr-plugin-install", daemon=True
        )
        self._thread.start()

    def cancel(self) -> None:
        self._cancel.set()
        self.state = "idle"
        self.percent = 0
        self.detail = "Kurulum iptal edildi."
        self.bytes_label = ""
        log_event(
            PREFIX_OCR, "082", "[EasyOCR Kurulumu] -> IPTAL EDILDI", level="warning"
        )
        self._send(
            "easyocr_plugin_cancelled", {"message": "EasyOCR kurulumu iptal edildi."}
        )
        self._send_status()

    def remove(self) -> None:
        log_event(PREFIX_OCR, "083", "[EasyOCR Kaldirma] -> BASLADI")
        self._cancel.set()
        self.state = "remove"
        self.percent = 0
        self.detail = "Eklenti kaldırılıyor."
        self.bytes_label = ""
        self._send_progress()

        if self.tmp_dir.exists():
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        if self.plugin_dir.exists():
            shutil.rmtree(self.plugin_dir, ignore_errors=True)

        self._reset_idle_state()
        log_event(PREFIX_OCR, "084", "[EasyOCR Kaldirma] -> TAMAMLANDI")
        self._send_status()

    def _install_worker(self) -> None:
        self._install_started_at = time.monotonic()
        try:
            self.plugins_dir.mkdir(parents=True, exist_ok=True)
            log_event(PREFIX_OCR, "085", "[EasyOCR Kurulumu] -> BASLADI")

            self._prepare_workspace()
            self._raise_if_cancelled()

            # 1. GitHub API uzerinden indirme linkini bul
            self._set_stage("planning", 5, "İndirme bağlantısı aranıyor")
            download_url, size = self._get_download_info()
            self._raise_if_cancelled()

            # 2. Dosyayi indir
            self._download_file(download_url, size)
            self._raise_if_cancelled()

            # 3. Zip'ten cikar
            self._extract_plugin()
            self._raise_if_cancelled()

            # 4. Dogrula
            self._verify_plugin()

            if self.tmp_dir.exists():
                shutil.rmtree(self.tmp_dir, ignore_errors=True)

            self.state = "ready"
            self.percent = 100
            self.detail = "EasyOCR Eklentisi hazır."
            self.bytes_label = ""

            elapsed_ms = int((time.monotonic() - self._install_started_at) * 1000)
            log_event(
                PREFIX_OCR,
                "086",
                f"[EasyOCR Kurulumu] -> TAMAMLANDI | Sure(ms): {elapsed_ms}",
            )
            self._send_status()
            self._send(
                "easyocr_plugin_complete", {"percent": 100, "elapsed_ms": elapsed_ms}
            )

        except RuntimeError as exc:
            if str(exc) == "cancelled" or self._cancel.is_set():
                if self.tmp_dir.exists():
                    shutil.rmtree(self.tmp_dir, ignore_errors=True)
                self._reset_idle_state()
                self._send_status()
                return
            self._fail(str(exc))
        except Exception as exc:
            import traceback

            traceback_str = traceback.format_exc()
            log_error(
                PREFIX_OCR,
                "089",
                f"[EasyOCR Kurulumu] -> BEKLENMEYEN HATA:\n{traceback_str}",
                "Bilinmeyen bir hata oluştu.",
            )
            self._fail(str(exc))

    def _prepare_workspace(self) -> None:
        # DO NOT rmtree self.tmp_dir here to support resumable downloads.
        if self.plugin_dir.exists():
            shutil.rmtree(self.plugin_dir, ignore_errors=True)
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    def _get_download_info(self) -> tuple[str, int]:
        import urllib.request
        import urllib.error
        import os

        # Direkt HuggingFace baglantisi
        url = "https://huggingface.co/Nokrima/virel-easyocr-plugin/resolve/main/virel-easyocr-plugin.zip"

        try:
            headers = {"User-Agent": "VoidSub"}
            token = os.environ.get("HF_TOKEN")
            if not token:
                try:
                    from huggingface_hub import get_token

                    token = get_token()
                except ImportError:
                    pass
            if token:
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(url, method="HEAD", headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                total_bytes = int(response.headers.get("Content-Length", 0))
            return url, total_bytes
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                raise RuntimeError(
                    "İndirme izni reddedildi (401). Lütfen sistem ortam değişkenlerine 'HF_TOKEN' ekleyin veya HuggingFace CLI ile giriş yapın."
                )
            raise RuntimeError(f"Indirme bilgisi alinamadi: {exc}")
        except Exception as exc:
            raise RuntimeError(f"Indirme bilgisi alinamadi: {exc}")

    def _download_file(self, url: str, total_bytes: int) -> None:
        import urllib.request
        import time

        zip_path = self.tmp_dir / EASYOCR_ASSET_NAME
        max_retries = 5
        retry_delay = 2.0

        for attempt in range(max_retries):
            self._raise_if_cancelled()

            existing_size = 0
            if zip_path.exists():
                existing_size = zip_path.stat().st_size
                if total_bytes > 0 and existing_size > total_bytes:
                    zip_path.unlink()
                    existing_size = 0

            if total_bytes > 0 and existing_size == total_bytes:
                self.percent = 80
                self.detail = "İndirme tamamlandı, doğrulanıyor..."
                self.bytes_label = f"{self._format_bytes(existing_size)} / {self._format_bytes(total_bytes)}"
                self._send_progress()
                return

            import os

            headers = {"User-Agent": "VoidSub"}
            token = os.environ.get("HF_TOKEN")
            if not token:
                try:
                    from huggingface_hub import get_token

                    token = get_token()
                except ImportError:
                    pass
            if token:
                headers["Authorization"] = f"Bearer {token}"
            mode = "wb"
            if existing_size > 0:
                headers["Range"] = f"bytes={existing_size}-"
                mode = "ab"

            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=15) as response:
                    if response.status == 206:
                        downloaded = existing_size
                    else:
                        downloaded = 0
                        mode = "wb"

                    last_send = time.monotonic()
                    with open(zip_path, mode) as f:
                        while True:
                            self._raise_if_cancelled()
                            chunk = response.read(8192 * 16)  # 128KB chunks
                            if not chunk:
                                break
                            f.write(chunk)
                            downloaded += len(chunk)

                            now = time.monotonic()
                            if now - last_send > 0.2 or downloaded == total_bytes:
                                self.percent = (
                                    10 + int((downloaded / total_bytes) * 70)
                                    if total_bytes > 0
                                    else 50
                                )
                                self.detail = f"{EASYOCR_ASSET_NAME} indiriliyor"
                                self.bytes_label = f"{self._format_bytes(downloaded)} / {self._format_bytes(total_bytes)}"
                                self._send_progress()
                                last_send = now

                    if total_bytes > 0 and downloaded < total_bytes:
                        raise RuntimeError(
                            f"Bağlantı kesildi. İndirme eksik kaldı: {self._format_bytes(downloaded)} / {self._format_bytes(total_bytes)}"
                        )

                return  # Başarıyla tamamlandı

            except RuntimeError as e:
                if str(e) == "cancelled" or self._cancel.is_set():
                    raise e
                if "Bağlantı kesildi" in str(e) and attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                raise e
            except Exception as e:
                if "cancelled" in str(e) or self._cancel.is_set():
                    raise RuntimeError("cancelled")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                raise RuntimeError(
                    f"İndirme {max_retries} denemeden sonra başarısız oldu: {e}"
                )

    def _extract_plugin(self) -> None:
        self._set_stage(
            "extracting",
            85,
            "Eklenti çıkartılıyor... (Bu işlem birkaç dakika sürebilir)",
        )
        import zipfile
        import time

        zip_path = self.tmp_dir / EASYOCR_ASSET_NAME
        if not zip_path.exists():
            raise RuntimeError("Indirilen zip dosyasi bulunamadi!")

        try:
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                members = zip_ref.infolist()
                total_files = len(members)
                last_send = time.monotonic()

                for i, member in enumerate(members):
                    self._raise_if_cancelled()

                    # Zip Slip koruması
                    target_path = (self.plugin_dir / member.filename).resolve()
                    base_path = self.plugin_dir.resolve()
                    if (
                        os.path.commonpath([str(base_path), str(target_path)])
                        != str(base_path)
                        or ".." in member.filename
                        or member.filename.startswith("/")
                        or member.filename.startswith("\\")
                    ):
                        raise RuntimeError(
                            f"Güvenlik ihlali: Zip slip denemesi engellendi ({member.filename})"
                        )

                    zip_ref.extract(member, self.plugin_dir)

                    now = time.monotonic()
                    # Arayuzu ve loglari bogmamak icin her 0.3 saniyede bir veya son dosyada guncelle
                    if now - last_send > 0.3 or i == total_files - 1:
                        progress_percent = 85 + int((i / total_files) * 10)
                        self.percent = min(95, progress_percent)
                        self.detail = f"Dosyalar çıkartılıyor... ({i}/{total_files})"
                        self._send_progress()
                        log_event(
                            PREFIX_OCR,
                            "095",
                            f"[Zip Çıkartma] -> DEVAM EDİYOR | Dosya: {i}/{total_files} | Çıkartılan: {member.filename}",
                        )
                        last_send = now

        except zipfile.BadZipFile:
            raise RuntimeError(
                "İndirilen zip dosyası bozuk veya bağlantı kopması nedeniyle eksik! Lütfen tekrar deneyin."
            )
        except Exception as exc:
            raise RuntimeError(f"Zip cikartma hatasi: {exc}")

    def _verify_plugin(self) -> None:
        self._set_stage("verifying", 95, "Eklenti doğrulanıyor...")
        worker_exe = self.plugin_dir / "easyocr-worker.py"
        if not worker_exe.exists():
            raise RuntimeError("easyocr-worker.py bulunamadi!")

    def _is_ready(self) -> bool:
        return (self.plugin_dir / "easyocr-worker.py").exists()

    def _reset_idle_state(self) -> None:
        ready = self._is_ready()
        self.state = "ready" if ready else "idle"
        self.percent = 100 if ready else 0
        self.detail = "Eklenti hazır." if ready else "EasyOCR eklentisi bekleniyor."
        self.bytes_label = ""

    def _raise_if_cancelled(self) -> None:
        if self._cancel.is_set():
            raise RuntimeError("cancelled")

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
            "easyocr_plugin_progress",
            {
                "stage": self.state,
                "percent": self.percent,
                "detail": self.detail,
                "bytes_label": self.bytes_label,
            },
        )

    def _send_status(self) -> None:
        self._send("easyocr_plugin_status", self.get_status())

    def _fail(self, message: str) -> None:
        self.state = "failed"
        self.percent = 0
        self.detail = message
        self.bytes_label = ""
        log_error(
            PREFIX_OCR,
            "088",
            f"[EasyOCR Kurulumu] -> HATA: {message}",
            "Eklenti kurulumu tamamlanamadı.",
        )
        self._send("easyocr_plugin_error", {"message": message})
        self._send_status()

    def _send(self, event: str, data: dict) -> None:
        if self.bridge is not None:
            self.bridge.send(event, data)

    def _format_bytes(self, value: int) -> str:
        size = float(max(value, 0))
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024.0 or unit == "GB":
                return f"{size:.1f}{unit}" if unit != "B" else f"{int(size)}B"
            size /= 1024.0
        return f"{value}B"
