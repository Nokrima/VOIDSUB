param (
    [string]$Version = "",
    [string]$Notes   = "Hata düzeltmeleri ve performans iyileştirmeleri."
)

$ErrorActionPreference = "Stop"

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

# 2. Tauri'nin urettigi exe ve sig dosyalarini bul
$exeFile = Get-ChildItem $bundleDir -Filter "*-setup.exe"   | Select-Object -First 1
$sigFile = Get-ChildItem $bundleDir -Filter "*-setup.exe.sig" | Select-Object -First 1

if (-not $exeFile) {
    Write-Host "[X] -setup.exe dosyasi bulunamadi: $bundleDir" -ForegroundColor Red
    exit 1
}

$signature = ""
if ($sigFile) {
    $signature = Get-Content $sigFile.FullName -Raw
    $signature = $signature.Trim()
}

# 3. GitHub Release URL'si (exe dosyasini virel-updater reposuna yuklemeniz gerekiyor)
$downloadUrl = "https://github.com/Nokrima/virel-updater/releases/download/v$Version/$($exeFile.Name)"

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
