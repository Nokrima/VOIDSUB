$ErrorActionPreference = "Stop"

$PYTHON_VERSION = "3.11.8"
$PYTHON_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION/python-$PYTHON_VERSION-embed-amd64.zip"
$PIP_URL = "https://bootstrap.pypa.io/get-pip.py"

$BUILD_DIR = "$PSScriptRoot\..\build"
$PLUGIN_DIR = "$BUILD_DIR\virel-easyocr-plugin"
$ZIP_FILE = "$BUILD_DIR\virel-easyocr-plugin.zip"

Write-Host "Virel V2 - EasyOCR & PyTorch Taşınabilir Eklenti Paketleyici" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Klasörleri Hazırla
if (Test-Path $PLUGIN_DIR) {
    Write-Host "Eski kalıntılar temizleniyor..." -ForegroundColor Yellow
    Remove-Item -Path $PLUGIN_DIR -Recurse -Force
}
if (Test-Path $ZIP_FILE) {
    Remove-Item -Path $ZIP_FILE -Force
}
New-Item -ItemType Directory -Path $PLUGIN_DIR | Out-Null

# 2. Taşınabilir Python İndir
Write-Host "1. Taşınabilir Python ($PYTHON_VERSION) indiriliyor..." -ForegroundColor Green
Invoke-WebRequest -Uri $PYTHON_URL -OutFile "$BUILD_DIR\python-embed.zip"

Write-Host "2. Python dosyaları çıkartılıyor..." -ForegroundColor Green
Expand-Archive -Path "$BUILD_DIR\python-embed.zip" -DestinationPath $PLUGIN_DIR -Force

# 3. Pip'i Aktif Et (Embedded Python için site import kilidini açmalıyız)
Write-Host "3. Pip kurulumu ve konfigürasyon yapılıyor..." -ForegroundColor Green
$pthFile = Get-ChildItem -Path $PLUGIN_DIR -Filter "python*._pth" | Select-Object -First 1
$pthContent = Get-Content -Path $pthFile.FullName
$pthContent = $pthContent -replace "#import site", "import site"
Set-Content -Path $pthFile.FullName -Value $pthContent

Invoke-WebRequest -Uri $PIP_URL -OutFile "$PLUGIN_DIR\get-pip.py"
& "$PLUGIN_DIR\python.exe" "$PLUGIN_DIR\get-pip.py"

# 4. Bağımlılıkları Kur
Write-Host "4. PyTorch ve EasyOCR Kuruluyor... (Bu işlem 3-5 GB indirebilir, lütfen bekleyin!)" -ForegroundColor Magenta
# CUDA 12.1 destekli PyTorch ve EasyOCR kuruyoruz (Ayrı index URL kullanarak)
& "$PLUGIN_DIR\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
& "$PLUGIN_DIR\python.exe" -m pip install easyocr

# 5. Gereksiz Dosyaları Temizle (ZIP boyutunu küçültmek için)
Write-Host "5. İndirme kalıntıları temizleniyor..." -ForegroundColor Yellow
Remove-Item -Path "$PLUGIN_DIR\get-pip.py" -Force
Remove-Item -Path "$BUILD_DIR\python-embed.zip" -Force

# 6. Eklenti Worker (İşçi) Dosyasını Oluştur
Write-Host "6. EasyOCR Worker bağlantı dosyası hazırlanıyor..." -ForegroundColor Green
$WORKER_CODE = @"
import sys
import json
import base64
import easyocr
import io
from PIL import Image
import torch

reader = easyocr.Reader(['en', 'ru'], gpu=torch.cuda.is_available())

while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
            
        data = json.loads(line)
        if data.get("command") == "read":
            image_bytes = base64.b64decode(data["image"])
            image = Image.open(io.BytesIO(image_bytes))
            
            results = reader.readtext(image, detail=1)
            formatted = [[bbox, text, int(prob * 100)] for bbox, text, prob in results]
            
            response = {"status": "ok", "data": formatted}
            print(json.dumps(response), flush=True)
            
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
"@
Set-Content -Path "$PLUGIN_DIR\easyocr-worker.py" -Value $WORKER_CODE -Encoding UTF8

# 7. ZIP Olarak Sıkıştır
Write-Host "7. Tüm sistem ZIP olarak sıkıştırılıyor... (Bu işlem birkaç dakika sürebilir)" -ForegroundColor Green
$ZIP_BASE = "$BUILD_DIR\virel-easyocr-plugin"
& "$PSScriptRoot\..\.venv\Scripts\python.exe" -c "import shutil; shutil.make_archive(r'$ZIP_BASE', 'zip', r'$PLUGIN_DIR')"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "TAMAMLANDI! Plugin dosyası şu adreste hazır:" -ForegroundColor Green
Write-Host $ZIP_FILE -ForegroundColor White
Write-Host "Bu .zip dosyasını HuggingFace'e yükleyebilirsiniz." -ForegroundColor Yellow
