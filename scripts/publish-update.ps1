$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────
# publish-update.ps1 — Tauri build sonrasi calistirilir.
# Yapilan isler:
#  1. Tauri'nin urettigi .nsis.zip + .sig dosyalarini bulur
#  2. latest.json manifest'ini olusturur / gunceller
#  3. virel-updater reposunu gunceller ve push eder
# ─────────────────────────────────────────────────────────────

param (
    [string]$Version = "",
    [string]$Notes   = "Hata düzeltmeleri ve performans iyileştirmeleri."
)

$repoRoot      = Split-Path $PSScriptRoot -Parent
$tauriConf     = Join-Path $repoRoot "ui-tauri\src-tauri\tauri.conf.json"
$bundleDir     = Join-Path $repoRoot "ui-tauri\src-tauri\target\release\bundle\nsis"
$updaterRepo   = "https://github.com/Nokrima/virel-updater.git"
$updaterDir    = Join-Path $env:TEMP "virel-updater-publish"

# 1. Versiyon bilgisini tauri.conf.json'dan oku (parametre verilmediyse)
if (-not $Version) {
    $conf    = Get-Content $tauriConf -Raw | ConvertFrom-Json
    $Version = $conf.version
}
Write-Host "[*] Yayimlanacak surum: v$Version" -ForegroundColor Cyan

# 2. Tauri'nin urettigi zip ve sig dosyalarini bul
$zipFile = Get-ChildItem $bundleDir -Filter "*.nsis.zip"   | Select-Object -First 1
$sigFile = Get-ChildItem $bundleDir -Filter "*.nsis.zip.sig" | Select-Object -First 1

if (-not $zipFile) {
    Write-Host "[X] .nsis.zip dosyasi bulunamadi: $bundleDir" -ForegroundColor Red
    exit 1
}

$signature = ""
if ($sigFile) {
    $signature = Get-Content $sigFile.FullName -Raw
    $signature = $signature.Trim()
}

# 3. GitHub Release URL'si (zip dosyasini releases'e yuklemeniz gerekiyor)
$downloadUrl = "https://github.com/Nokrima/Virel/releases/download/v$Version/$($zipFile.Name)"

Write-Host "[*] Indirme URL: $downloadUrl" -ForegroundColor DarkGray

# 4. latest.json olustur
$latestJson = @{
    version  = $Version
    notes    = $Notes
    pub_date = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url       = $downloadUrl
        }
    }
} | ConvertTo-Json -Depth 5

# 5. virel-updater reposunu klonla (veya guncelle) ve push et
if (Test-Path $updaterDir) {
    Remove-Item $updaterDir -Recurse -Force
}
git clone $updaterRepo $updaterDir --depth 1 --quiet

$latestJson | Out-File -FilePath (Join-Path $updaterDir "latest.json") -Encoding utf8 -Force

Push-Location $updaterDir
    git add latest.json
    git commit -m "chore: update manifest to v$Version"
    git push origin main
Pop-Location

Remove-Item $updaterDir -Recurse -Force

Write-Host "=========================================" -ForegroundColor Green
Write-Host "[+] virel-updater/latest.json -> v$Version guncellendi!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
