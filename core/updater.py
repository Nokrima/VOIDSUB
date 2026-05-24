"""
Güncelleme Gözcüsü (AutoUpdater): GitHub release kontrolü ve installer indirme akışlarını yönetir.
KURAL: Asla zorla güncelleme yapmaz, kullanıcıya seçim şansı bırakır.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import threading
from typing import Any

import requests

from config.defaults import APP_VERSION, GITHUB_REPO
from core.errors import PREFIX_UPD, get_logger


def _parse_version(raw_version: str) -> tuple[int, ...]:
    cleaned = (raw_version or "").strip().lower().removeprefix("v")
    parts = []
    for chunk in cleaned.split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def _is_newer_version(latest_version: str, current_version: str) -> bool:
    latest = _parse_version(latest_version)
    current = _parse_version(current_version)
    width = max(len(latest), len(current))
    latest += (0,) * (width - len(latest))
    current += (0,) * (width - len(current))
    return latest != current


def _select_installer_asset(release_data: dict[str, Any]) -> dict[str, Any] | None:
    assets = release_data.get("assets") or []
    preferred_suffixes = (".exe", ".msi")
    for asset in assets:
        name = str(asset.get("name", "")).lower()
        if name.endswith(preferred_suffixes):
            return asset
    return assets[0] if assets else None


def _select_checksum_asset(release_data: dict[str, Any], installer_name: str) -> dict[str, Any] | None:
    assets = release_data.get("assets") or []
    lowered = installer_name.lower()
    checksum_names = {
        f"{lowered}.sha256",
        f"{lowered}.sha256sum",
        f"{lowered}.sha256.txt",
    }
    for asset in assets:
        name = str(asset.get("name", "")).lower()
        if name in checksum_names:
            return asset
    return None


def _extract_sha256(text: str) -> str | None:
    for token in (text or "").replace("\n", " ").split():
        cleaned = token.strip().lower()
        if len(cleaned) == 64 and all(ch in "0123456789abcdef" for ch in cleaned):
            return cleaned
    return None


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _user_facing_update_error(exc: Exception) -> str:
    if isinstance(exc, requests.Timeout):
        return "Güncelleme kontrolü zaman aşımına uğradı. Lütfen tekrar deneyin."
    if isinstance(exc, requests.ConnectionError):
        return "GitHub'a bağlanılamadı. İnternet bağlantınızı kontrol edin."
    if isinstance(exc, requests.HTTPError):
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 404:
            return "Herhangi bir GitHub release bulunamadı."
        if status_code == 403:
            return "GitHub API sınırına ulaşıldı veya erişim reddedildi. Daha sonra tekrar deneyin."
        if status_code and status_code >= 500:
            return "GitHub tarafında geçici bir sorun oluştu. Daha sonra tekrar deneyin."
    return "Güncelleme kontrolü şu anda tamamlanamıyor."


class AutoUpdater:
    @classmethod
    def check_for_updates(cls, bridge) -> None:
        def _check() -> None:
            logger = get_logger()
            try:
                url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
                response = requests.get(
                    url,
                    timeout=8,
                    headers={"Accept": "application/vnd.github+json", "User-Agent": "Virel-V2-Updater"},
                )
                response.raise_for_status()
                data = response.json()

                latest_version = str(data.get("tag_name", "")).replace("v", "").strip()
                if not latest_version:
                    bridge.send("update_error", msg="GitHub release etiketi bulunamadı.")
                    return

                installer_asset = _select_installer_asset(data)
                asset_url = ""
                asset_name = ""
                if installer_asset:
                    asset_url = str(installer_asset.get("browser_download_url", "")).strip()
                    asset_name = str(installer_asset.get("name", "")).strip()
                    asset_digest = str(installer_asset.get("digest", "")).strip()
                    checksum_asset = _select_checksum_asset(data, asset_name)
                    checksum_url = str(checksum_asset.get("browser_download_url", "")).strip() if checksum_asset else ""
                else:
                    asset_digest = ""
                    checksum_url = ""

                if _is_newer_version(latest_version, APP_VERSION):
                    if not asset_url:
                        bridge.send(
                            "update_error",
                            msg="Yeni sürüm bulundu fakat indirilebilir kurulum dosyası release içinde yok.",
                        )
                        return

                    bridge.send(
                        "update_available",
                        version=latest_version,
                        current_version=APP_VERSION,
                        url=asset_url,
                        asset_name=asset_name,
                        digest=asset_digest,
                        checksum_url=checksum_url,
                    )
                    return

                bridge.send("update_not_available", version=APP_VERSION)
            except Exception as exc:
                logger.debug(f"[{PREFIX_UPD}-002] Güncelleme kontrolü başarısız: {exc}")
                bridge.send("update_error", msg=_user_facing_update_error(exc))

        threading.Thread(target=_check, daemon=True).start()

    @classmethod
    def download_and_install(cls, asset_url: str, bridge, digest: str = "", checksum_url: str = "") -> None:
        def _download() -> None:
            logger = get_logger()
            try:
                if not asset_url:
                    bridge.send("update_error", msg="İndirilebilir güncelleme dosyası bulunamadı.")
                    return

                bridge.send("update_progress", percent=5)
                response = requests.get(asset_url, stream=True, timeout=15)
                response.raise_for_status()

                installer_path = os.path.join(os.environ.get("TEMP", ""), "Virel_Update.exe")
                total_size = int(response.headers.get("content-length", 0))

                with open(installer_path, "wb") as file:
                    downloaded = 0
                    for chunk in response.iter_content(chunk_size=8192):
                        if not chunk:
                            continue
                        file.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = int((downloaded / total_size) * 100)
                            bridge.send("update_progress", percent=percent)

                if not os.path.exists(installer_path) or os.path.getsize(installer_path) == 0:
                    bridge.send("update_error", msg="Güncelleme dosyası indirilemedi veya boş geldi.")
                    return

                expected_sha256 = ""
                if digest.startswith("sha256:"):
                    expected_sha256 = digest.split(":", 1)[1].strip().lower()
                elif len(digest) == 64:
                    expected_sha256 = digest.strip().lower()
                elif checksum_url:
                    checksum_response = requests.get(
                        checksum_url,
                        timeout=10,
                        headers={"Accept": "text/plain", "User-Agent": "Virel-V2-Updater"},
                    )
                    checksum_response.raise_for_status()
                    expected_sha256 = _extract_sha256(checksum_response.text) or ""

                if not expected_sha256:
                    bridge.send("update_error", msg="Güncelleme doğrulama verisi bulunamadı. Kurulum güvenlik nedeniyle başlatılmadı.")
                    return

                actual_sha256 = _sha256_file(installer_path)
                if actual_sha256 != expected_sha256:
                    bridge.send("update_error", msg="İndirilen güncelleme dosyası doğrulanamadı. Kurulum iptal edildi.")
                    return

                bridge.send("update_complete")
                
                # Modern, sessiz kurulum ve otomatik yeniden baslatma scripti
                bat_path = os.path.join(os.environ.get("TEMP", ""), "virel_update.bat")
                with open(bat_path, "w") as bat_file:
                    bat_file.write(f"""@echo off
echo Guncelleme uygulaniyor, lutfen bekleyin...
timeout /t 3 /nobreak > NUL
start /wait "" "{installer_path}" /S
echo Guncelleme tamamlandi. Uygulama yeniden baslatiliyor...
timeout /t 1 /nobreak > NUL
start "" "%LOCALAPPDATA%\\Virel V2\\virel.exe"
del "%~f0"
""")
                
                subprocess.Popen(["cmd.exe", "/c", bat_path], creationflags=subprocess.CREATE_NO_WINDOW)
                
                # Ana uygulamayi hemen kapat ki dosyalar guncellenebilsin
                os._exit(0)
            except Exception as exc:
                logger.error(f"[{PREFIX_UPD}-003] İndirme başarısız: {exc}")
                bridge.send("update_error", msg="İndirme veya doğrulama başarısız oldu. Bağlantıyı ya da release dosyasını kontrol edin.")

        threading.Thread(target=_download, daemon=True).start()
