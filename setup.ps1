<#
.SYNOPSIS
VoidSub - Otomatik Kurulum Betiği

.DESCRIPTION
Bu betik, projeyi sıfırdan klonladığınızda veya yeni bir bilgisayara taşıdığınızda tüm bağımlılıkları tek tuşla kurar:
1. Python sanal ortamını (.venv) oluşturur.
2. requirements.txt dosyasındaki tüm paketleri tam sürümleriyle kurar.
3. ui-tauri (Node.js/React) klasörüne girip npm bağımlılıklarını kurar.
#>

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      VoidSub - Kurulum Sihirbazı       " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Python Sanal Ortam Kurulumu
Write-Host "`n[1/3] Python sanal ortamı (.venv) oluşturuluyor..." -ForegroundColor Yellow
if (-not (Test-Path ".venv")) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Hata: Python sanal ortamı oluşturulamadı. Sisteminizde Python'un kurulu olduğundan emin olun." -ForegroundColor Red
        exit 1
    }
    Write-Host "[+] Sanal ortam (.venv) başarıyla oluşturuldu." -ForegroundColor Green
} else {
    Write-Host "[*] Sanal ortam zaten mevcut, atlanıyor." -ForegroundColor DarkGray
}

# 2. Python Bağımlılıkları
Write-Host "`n[2/3] Python modülleri kuruluyor (requirements.txt)..." -ForegroundColor Yellow
$pipPath = if (Test-Path ".venv\Scripts\pip.exe") { ".venv\Scripts\pip.exe" } else { ".venv\bin\pip" }
& $pipPath install --upgrade pip
& $pipPath install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Hata: Python bağımlılıkları kurulurken sorun oluştu." -ForegroundColor Red
    exit 1
}
Write-Host "[+] Tüm Python modülleri başarıyla kuruldu." -ForegroundColor Green

# 3. Node.js (Tauri) Bağımlılıkları
Write-Host "`n[3/3] Arayüz bağımlılıkları (Node.js) kuruluyor..." -ForegroundColor Yellow
if (Test-Path "ui-tauri") {
    Push-Location "ui-tauri"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Hata: Node.js bağımlılıkları kurulamadı. Sisteminizde Node.js (npm) kurulu mu?" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "[+] Arayüz bağımlılıkları başarıyla kuruldu." -ForegroundColor Green
} else {
    Write-Host "[-] 'ui-tauri' klasörü bulunamadı, arayüz kurulumu atlanıyor." -ForegroundColor Yellow
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host " [+] KURULUM TAMAMLANDI! " -ForegroundColor Green
Write-Host " Projeyi başlatmak için şu komutu kullanabilirsiniz: .\start-dev.ps1" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan
