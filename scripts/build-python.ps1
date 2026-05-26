$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$nuitka = Join-Path $repoRoot ".venv\Scripts\nuitka.bat"
if (-not (Test-Path $nuitka)) {
    Write-Host "[!] Nuitka bulunamadi. Kuruluyor..." -ForegroundColor Yellow
    & $venvPython -m pip install nuitka zstandard
}

Write-Host "[1/3] Eski derleme dosyalari temizleniyor..." -ForegroundColor Cyan
if (Test-Path "main.build") { Remove-Item "main.build" -Recurse -Force }
if (Test-Path "main.dist") { Remove-Item "main.dist" -Recurse -Force }
if (Test-Path "virel-core.exe") { Remove-Item "virel-core.exe" -Force }

Write-Host "[2/3] Python Cekirdegi Nuitka ile derleniyor (Makine koduna donusum)..." -ForegroundColor Cyan
Write-Host "UYARI: Bu islem C++ derlemesi yaptigi icin 10-30 dakika surebilir. Lutfen bekleyin." -ForegroundColor Yellow

# Nuitka ile derleme komutu
# --standalone: Uygulamayi calismasi icin gereken her seyle paketler
# --onefile: Tek bir exe dosyasi uretir
# --windows-console-mode=disable: Arka planda calismasi icin konsolu gizler
# --enable-plugin=pyside6: Arayuz kutuphanesi icin sart
& $venvPython -m nuitka --standalone --onefile `
    --windows-console-mode=disable `
    --enable-plugin=pyside6 `
    --enable-plugin=tk-inter `
    --include-package=ctranslate2 `
    --include-package=tokenizers `
    --include-package=deep_translator `
    --nofollow-import-to=torch,torchvision,torchaudio,easyocr,tensorboard,matplotlib,scipy,sklearn,pandas,jupyter `
    --output-filename=virel-core.exe `
    --assume-yes-for-downloads `
    main.py

if (-not $?) {
    Write-Host "[X] Nuitka derlemesi sirasinda hata olustu!" -ForegroundColor Red
    exit 1
}

Write-Host "[3/3] Tauri Sidecar entegrasyonu yapiliyor..." -ForegroundColor Cyan
$targetExe = Join-Path $repoRoot "virel-core.exe"
$tauriDir = Join-Path $repoRoot "ui-tauri\src-tauri"
$sidecarName = "virel-core-x86_64-pc-windows-msvc.exe"
$sidecarPath = Join-Path $tauriDir $sidecarName

if (Test-Path $sidecarPath) {
    Remove-Item $sidecarPath -Force
}

Copy-Item $targetExe -Destination $sidecarPath

Write-Host "=========================================" -ForegroundColor Green
Write-Host "Basariyla tamamlandi! Virel V2 Cekirdegi Tauri sidecar olarak hazirlandi." -ForegroundColor Green
Write-Host "Sidecar Yolu: $sidecarPath" -ForegroundColor DarkGray
Write-Host "Sira 'npm run tauri build' komutu ile arayuzu paketlemekte." -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Green
