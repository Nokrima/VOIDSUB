param(
    [Parameter(Mandatory=$true, HelpMessage="Yeni versiyon numarasini girin (Orn: 2.4.1)")]
    [string]$NewVersion
)

$ErrorActionPreference = "Stop"

Write-Host "Virel V2 - Global Versiyon Guncelleyici" -ForegroundColor Cyan
Write-Host "Yeni Versiyon: $NewVersion" -ForegroundColor Yellow
Write-Host "-------------------------------------------"

# 1. config/defaults.py Guncelleme
$pythonConfig = "config\defaults.py"
if (Test-Path $pythonConfig) {
    (Get-Content $pythonConfig) -replace 'APP_VERSION = ".*"', "APP_VERSION = `"$NewVersion`"" | Set-Content $pythonConfig
    Write-Host "[OK] config/defaults.py guncellendi." -ForegroundColor Green
} else {
    Write-Host "[HATA] config/defaults.py bulunamadi!" -ForegroundColor Red
}

# 2. ui-tauri/package.json Guncelleme
$packageJson = "ui-tauri\package.json"
if (Test-Path $packageJson) {
    $json = Get-Content $packageJson | ConvertFrom-Json
    $json.version = $NewVersion
    $json | ConvertTo-Json -Depth 10 | Set-Content $packageJson
    Write-Host "[OK] ui-tauri/package.json guncellendi." -ForegroundColor Green
} else {
    Write-Host "[HATA] ui-tauri/package.json bulunamadi!" -ForegroundColor Red
}

# 3. ui-tauri/src-tauri/Cargo.toml Guncelleme
$cargoToml = "ui-tauri\src-tauri\Cargo.toml"
if (Test-Path $cargoToml) {
    (Get-Content $cargoToml) -replace '^version = ".*"', "version = `"$NewVersion`"" | Set-Content $cargoToml
    Write-Host "[OK] ui-tauri/src-tauri/Cargo.toml guncellendi." -ForegroundColor Green
} else {
    Write-Host "[HATA] Cargo.toml bulunamadi!" -ForegroundColor Red
}

Write-Host "-------------------------------------------"
Write-Host "Versiyon basariyla $NewVersion olarak ayarlandi!" -ForegroundColor Cyan
