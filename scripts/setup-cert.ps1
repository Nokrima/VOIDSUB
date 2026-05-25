$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Virel V2 - Self-Signed Cert Generator  " -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan

$certSubject = "CN=Virel V2 Developer"

# Daha önce ayni isimde sertifika var mi kontrol et
$existingCert = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq $certSubject } | Select-Object -First 1

if ($existingCert) {
    Write-Host "[*] Zaten '$certSubject' adinda bir sertifika mevcut. Onu kullanacagiz." -ForegroundColor Yellow
    $cert = $existingCert
} else {
    Write-Host "[1/3] Yeni Kod Imzalama Sertifikasi (Code Signing) olusturuluyor..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate -Subject $certSubject -Type CodeSigningCert -CertStoreLocation "Cert:\CurrentUser\My"
    Write-Host "[+] Sertifika basariyla olusturuldu! Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
}

Write-Host "[2/3] Sertifika 'Guvenilen Kok Sertifika Yetkilileri'ne (Trusted Root) ekleniyor..." -ForegroundColor Cyan
try {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store "Root", "CurrentUser"
    $store.Open("ReadWrite")
    $store.Add($cert)
    $store.Close()
    Write-Host "[+] Sertifika sisteme guvenilir olarak tanitildi!" -ForegroundColor Green
} catch {
    Write-Host "[X] Sertifika guvenilir listesine eklenirken hata olustu. (Yonetici izni gerekebilir)" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

Write-Host "[3/3] Derleme araclari icin ortam hazirlaniyor..." -ForegroundColor Cyan
# Signtool veya Tauri'nin bu sertifikayi bulabilmesi icin Thumbprint'i bir dosyaya veya degiskene kaydedebiliriz
$thumbprintFile = Join-Path $PSScriptRoot "cert_thumbprint.txt"
$cert.Thumbprint | Out-File -FilePath $thumbprintFile -Encoding UTF8
Write-Host "[+] Thumbprint '$thumbprintFile' dosyasina kaydedildi." -ForegroundColor Green

Write-Host "=========================================" -ForegroundColor Green
Write-Host "Sertifika islemleri tamamlandi. Artik derlenen .exe dosyalari"
Write-Host "bu bilgisayarda Windows Defender tarafindan engellenmeyecek." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
