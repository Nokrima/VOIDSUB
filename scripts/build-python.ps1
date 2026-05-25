$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$pyinstaller = Join-Path $repoRoot ".venv\Scripts\pyinstaller.exe"

if (-not (Test-Path $pyinstaller)) {
    Write-Host "[!] PyInstaller bulunamadi. Kuruluyor..." -ForegroundColor Yellow
    & $venvPython -m pip install pyinstaller
}

Write-Host "[1/3] Eski derleme dosyalari temizleniyor..." -ForegroundColor Cyan
if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
if (Test-Path "virel-core.spec") { Remove-Item "virel-core.spec" -Force }

Write-Host "[2/3] Python Cekirdegi donduruluyor (Freezing)..." -ForegroundColor Cyan
Write-Host "Bu islem bilgisayarinizin hizina gore 1-5 dakika surebilir. Lutfen bekleyin." -ForegroundColor Yellow

# PyInstaller ile derleme komutu
# --onefile: Tek bir exe yapar
# --windowed: Konsol penceresini gizler (Arka plan servisi icin sart)
# --name: Cikti adini virel-core yapar
# --collect-all: Yapay zeka ve arayuz modullerinin icindeki DLL'leri zorla pakete dahil eder
& $pyinstaller --noconfirm --log-level=WARN `
    --onefile `
    --windowed `
    --name "virel-core" `
    --collect-all ctranslate2 `
    --collect-all tokenizers `
    --collect-all PySide6 `
    --collect-all deep_translator `
    --hidden-import deep_translator `
    main.py

if (-not $?) {
    Write-Host "[X] Derleme sirasinda hata olustu!" -ForegroundColor Red
    exit 1
}

Write-Host "[3/3] Tauri Sidecar entegrasyonu yapiliyor..." -ForegroundColor Cyan
$targetExe = Join-Path $repoRoot "dist\virel-core.exe"
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
