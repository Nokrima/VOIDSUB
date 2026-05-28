$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$uiDir = Join-Path $repoRoot "ui-tauri"

# Ekranı temizle ve başlık ekle
Clear-Host
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      VoidSub - Üretim (Production) Testi" -ForegroundColor White -BackgroundColor DarkCyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[!] UYARI: Bu modda geliştirici torpili YOKTUR." -ForegroundColor Yellow
Write-Host "Python kaynak kodlarınız (.venv) DEĞİL, derlenmiş 'dist/python_embedded' motoru çalışacaktır." -ForegroundColor Yellow
Write-Host "Python'da değişiklik yaparsanız test etmeden önce derlemeniz gerekir!" -ForegroundColor Yellow
Write-Host ""

# Tauri pencerelerini kapat
Get-Process -Name "ui-tauri" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

try {
    Write-Host "[*] Arayüz başlatılıyor..." -ForegroundColor Cyan
    Set-Location $uiDir
    $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "VoidSub\cargo-target"
    
    # Tauri uygulamasını çalıştır
    npm run tauri dev
}
finally {
    Set-Location $repoRoot
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "   Üretim Testi Sonlandırıldı.           " -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
}
