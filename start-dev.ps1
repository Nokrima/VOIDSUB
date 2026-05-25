$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$pythonExe = Join-Path $repoRoot ".venv\Scripts\python.exe"
$uiDir = Join-Path $repoRoot "ui-tauri"
$WS_PORT = 27491

# Ekranı temizle ve başlık ekle
Clear-Host
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      Virel V2 - Gelistirme Modu         " -ForegroundColor White -BackgroundColor DarkCyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $pythonExe)) {
    Write-Host "[HATA] Python virtual environment bulunamadi: $pythonExe" -ForegroundColor Red
    Write-Host "Lutfen 'python -m venv .venv' komutu ile kurulumu tamamlayin." -ForegroundColor Yellow
    exit 1
}

# 1. Arka Planda Önceki Zombi İşlemleri Temizle
Write-Host "[-] Eski zombi islemler ve port kilitleri temizleniyor..." -ForegroundColor Gray

# Tauri pencerelerini kapat
Get-Process -Name "ui-tauri" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "virel-core" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Portu dinleyen önceki python'u bul ve yoked
$existingPython = Get-NetTCPConnection -LocalPort $WS_PORT -State Listen -ErrorAction SilentlyContinue
if ($existingPython) {
    try {
        $proc = Get-Process -Id $existingPython.OwningProcess -ErrorAction SilentlyContinue
        if ($proc.ProcessName -match "python|virel") {
            Write-Host "    -> Asili kalmis cekirdek kapatiliyor (PID: $($proc.Id))..." -ForegroundColor DarkYellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

Start-Sleep -Seconds 1 # Portun tam bosa cikmasi icin kisa bekleme

# 2. Python Çekirdeğini Başlat
Write-Host "[1/2] Virel V2 Cekirdegi (Python) baslatiliyor..." -ForegroundColor Cyan
$pythonJob = Start-Process -FilePath $pythonExe -ArgumentList "main.py" -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru

# Port'un açılmasını bekle
$timeout = 15
$portReady = $false
Write-Host "[*] Python WebSocket (Port $WS_PORT) baglantisi bekleniyor..." -ForegroundColor DarkGray
while ($timeout -gt 0) {
    if (Get-NetTCPConnection -LocalPort $WS_PORT -State Listen -ErrorAction SilentlyContinue) {
        $portReady = $true
        break
    }
    Start-Sleep -Seconds 1
    $timeout--
}

if (-not $portReady) {
    Write-Host "[HATA] Python cekirdegi baslatilamadi veya port $WS_PORT acilamadi!" -ForegroundColor Red
    Write-Host "Muhtemel Sebep: Hata ayiklama(debugger) portlariyla cakisiyor veya proje coktu." -ForegroundColor Yellow
    if ($null -ne $pythonJob -and -not $pythonJob.HasExited) {
        Stop-Process -Id $pythonJob.Id -Force
    }
    exit 1
}
Write-Host "[+] Python Cekirdegi Hazir! (Port: $WS_PORT)" -ForegroundColor Green

# 3. Tauri (Arayüz) Başlat
try {
    Write-Host "[2/2] Arayuz (Tauri) baslatiliyor..." -ForegroundColor Cyan
    Write-Host ""
    Set-Location $uiDir
    # Çakışmaları önlemek için Rust hedef klasörünü geçici bir yere yönlendiriyoruz.
    $env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA "Virel\cargo-target"
    
    # Tauri dev modunda "externalBin" dosyalarini fiziksel olarak arar (kullanmasa bile).
    # Hizli gelistirme icin saniyesinde bos/sahte exe uretip Tauri'yi kandiriyoruz.
    $dummySidecar = Join-Path $repoRoot "ui-tauri\src-tauri\virel-core-x86_64-pc-windows-msvc.exe"
    $dummyRedist = Join-Path $repoRoot "ui-tauri\src-tauri\bin\vc_redist.x64.exe"
    if (-not (Test-Path $dummySidecar)) { New-Item -Path $dummySidecar -ItemType File -Force | Out-Null }
    if (-not (Test-Path $dummyRedist)) { New-Item -Path $dummyRedist -ItemType File -Force | Out-Null }

    # Tauri uygulamasını çalıştır
    npm run tauri dev
}
finally {
    # 4. Kapanış ve Temizlik
    Write-Host ""
    Write-Host "[*] Uygulama kapaniyor, arka plan islemleri temizleniyor..." -ForegroundColor Yellow
    
    # Python'u kapat
    if ($null -ne $pythonJob -and -not $pythonJob.HasExited) {
        Stop-Process -Id $pythonJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    Set-Location $repoRoot
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "   Gelistirme Oturumu Sonlandirildi.     " -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Cyan
}
