param(
    [switch]$Clean,
    [switch]$AddDefenderExclusion
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MainPy = Join-Path $RepoRoot "main.py"
$BuildRoot = Join-Path $RepoRoot "build\nuitka"
$DistDir = Join-Path $BuildRoot "main.dist"
$BuiltExe = Join-Path $DistDir "main.exe"
$TauriRoot = Join-Path $RepoRoot "ui-tauri\src-tauri"
$SidecarName = "voidsub-core"

Write-Host "[build-python] VOIDSUB Python core build basliyor." -ForegroundColor Cyan
Write-Host "[build-python] Repo: $RepoRoot"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-DefenderExclusion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    try {
        $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
        $preferences = Get-MpPreference
        return @($preferences.ExclusionPath) | ForEach-Object {
            if ($_ -ne $null) {
                [System.IO.Path]::GetFullPath($_).TrimEnd("\")
            }
        } | Where-Object { $_ -ieq $resolvedPath } | Select-Object -First 1
    } catch {
        Write-Host "[build-python] Defender exclusion kontrolu yapilamadi: $($_.Exception.Message)" -ForegroundColor Yellow
        return $null
    }
}

$BuildRootFullPath = [System.IO.Path]::GetFullPath($BuildRoot)
$DefenderCommand = "Add-MpPreference -ExclusionPath `"$BuildRootFullPath`""

Write-Host "[build-python] Windows Defender exclusion kontrol ediliyor..." -ForegroundColor Cyan
$ExistingDefenderExclusion = Test-DefenderExclusion -Path $BuildRootFullPath

if ($AddDefenderExclusion) {
    if (-not (Test-IsAdministrator)) {
        throw "[build-python] -AddDefenderExclusion icin PowerShell'i yonetici olarak calistirin. Manuel komut: $DefenderCommand"
    }

    if ($ExistingDefenderExclusion) {
        Write-Host "[build-python] Defender exclusion zaten mevcut: $BuildRootFullPath" -ForegroundColor Green
    } else {
        Write-Host "[build-python] Defender exclusion ekleniyor: $BuildRootFullPath" -ForegroundColor Yellow
        Add-MpPreference -ExclusionPath $BuildRootFullPath
        Write-Host "[build-python] Defender exclusion eklendi." -ForegroundColor Green
    }
} elseif ($ExistingDefenderExclusion) {
    Write-Host "[build-python] Defender exclusion mevcut: $BuildRootFullPath" -ForegroundColor Green
} else {
    Write-Host "[build-python] Uyari: build cikti klasoru Defender istisnasinda degil." -ForegroundColor Yellow
    Write-Host "[build-python] Defender build'i yavaslatir veya false-positive uretirse yonetici PowerShell ile calistirin:"
    Write-Host "[build-python] $DefenderCommand"
    Write-Host "[build-python] Alternatif: .\scripts\build-python.ps1 -AddDefenderExclusion" -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath $MainPy)) {
    throw "[build-python] main.py bulunamadi: $MainPy"
}

if ($Clean -and (Test-Path -LiteralPath $BuildRoot)) {
    Write-Host "[build-python] Eski Nuitka build klasoru temizleniyor: $BuildRoot" -ForegroundColor Yellow
    Remove-Item -LiteralPath $BuildRoot -Recurse -Force
}

Write-Host "[build-python] Rust target triple okunuyor..." -ForegroundColor Cyan
$TargetTriple = (& rustc -Vv | Select-String "^host:" | ForEach-Object { $_.Line.Split(" ", 2)[1].Trim() })
if (-not $TargetTriple) {
    throw "[build-python] rustc host target triple okunamadi."
}

$SidecarExe = Join-Path $TauriRoot "$SidecarName-$TargetTriple.exe"
Write-Host "[build-python] Tauri sidecar hedefi: $SidecarExe"

$NuitkaArgs = @(
    "--mode=standalone",
    "--enable-plugin=pyside6",
    "--include-package=websockets",
    "--include-package=winrt",
    "--include-package=winrt.windows.graphics.capture",
    "--include-package=winrt.windows.graphics.directx",
    "--include-package=winrt.windows.graphics.directx.direct3d11",
    "--include-package=winrt.windows.graphics.directx.direct3d11.interop",
    "--include-package=winrt.windows.graphics.imaging",
    "--include-package=winrt.windows.storage.streams",
    "--include-package=ctranslate2",
    "--include-package=tokenizers",
    "--include-package=deep_translator",
    "--nofollow-import-to=torch",
    "--nofollow-import-to=torchvision",
    "--nofollow-import-to=torchaudio",
    "--nofollow-import-to=easyocr",
    "--nofollow-import-to=tensorboard",
    "--nofollow-import-to=matplotlib",
    "--nofollow-import-to=scipy",
    "--nofollow-import-to=sklearn",
    "--nofollow-import-to=pandas",
    "--nofollow-import-to=jupyter",
    "--output-dir=$BuildRoot",
    $MainPy
)

Write-Host "[build-python] Nuitka standalone derlemesi calistiriliyor. Onefile kullanilmiyor." -ForegroundColor Cyan
Write-Host "[build-python] Komut: python -m nuitka $($NuitkaArgs -join ' ')"
python -m nuitka @NuitkaArgs

if (-not (Test-Path -LiteralPath $BuiltExe)) {
    throw "[build-python] Nuitka cikti exe bulunamadi: $BuiltExe"
}

Write-Host "[build-python] Tauri sidecar ve dist klasoru kopyalaniyor..." -ForegroundColor Cyan
$TargetDistDir = Join-Path $TauriRoot "voidsub-core-dist"
if (Test-Path -LiteralPath $TargetDistDir) {
    Remove-Item -LiteralPath $TargetDistDir -Recurse -Force
}
Copy-Item -LiteralPath $DistDir -Destination $TargetDistDir -Recurse -Force
Copy-Item -LiteralPath $BuiltExe -Destination $SidecarExe -Force

Write-Host "[build-python] Derleme tamamlandi." -ForegroundColor Green
Write-Host "[build-python] Nuitka dist: $DistDir"
Write-Host "[build-python] Tauri sidecar: $SidecarExe"
