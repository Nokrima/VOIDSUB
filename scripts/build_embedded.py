import os
import urllib.request
import zipfile
import subprocess
import shutil
import py_compile
import sys
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore

# --- Yapılandırma ---
PYTHON_VERSION = "3.11.9"
PYTHON_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"
GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"

# Dizin Yolları
# Betik scripts/ klasöründe olacağı için ROOT_DIR bir üst klasör olacaktır.
ROOT_DIR = Path(__file__).parent.parent.resolve()
DIST_DIR = ROOT_DIR / "dist"
EMBEDDED_DIR = DIST_DIR / "python_embedded"
APP_DIR = EMBEDDED_DIR / "app"

# Kopyalanacak proje kaynak dosyaları ve klasörleri
# (Kendi proje yapınıza göre burayı güncelleyebilirsiniz)
SOURCES_TO_COPY = [
    ROOT_DIR / "main.py",
    ROOT_DIR / "core",
    ROOT_DIR / "config",
]
REQUIREMENTS_FILE = ROOT_DIR / "requirements.txt"

def print_step(msg):
    print(f"\n[+] {msg}")

def download_file(url, dest):
    print(f"    Indiriliyor: {url}")
    try:
        urllib.request.urlretrieve(url, dest)
        print(f"    Indirme tamamlandi: {dest.name}")
    except Exception as e:
        print(f"    [Hata] Indirme basarisiz: {e}")
        exit(1)

def setup_embedded_python():
    print_step(f"Embedded Python {PYTHON_VERSION} Indiriliyor ve Cikariliyor...")
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    
    if EMBEDDED_DIR.exists():
        print("    Mevcut 'python_embedded' klasoru temizleniyor...")
        shutil.rmtree(EMBEDDED_DIR)
        
    EMBEDDED_DIR.mkdir(parents=True, exist_ok=True)
    
    zip_path = DIST_DIR / "python_embed.zip"
    download_file(PYTHON_URL, zip_path)
    
    print("    Arsiv cikartiliyor...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(EMBEDDED_DIR)
        
    zip_path.unlink() # Kalabalık yapmaması için zip'i siliyoruz

def enable_site_packages():
    print_step("Site-packages aktiflestiiriliyor (.pth dosyasi duzenleniyor)...")
    # Python 3.11 için dosya adı python311._pth olur. 
    # Genel bir yaklaşım için _pth dosyasını bulalım:
    pth_files = list(EMBEDDED_DIR.glob("*._pth"))
    if not pth_files:
        print("    [Hata] .pth dosyasi bulunamadi!")
        exit(1)
        
    pth_file = pth_files[0]
    content = pth_file.read_text(encoding="utf-8")
    
    if "#import site" in content:
        content = content.replace("#import site", "import site")
        pth_file.write_text(content, encoding="utf-8")
        print(f"    {pth_file.name} basariyla guncellendi (import site aktif).")
    else:
        print(f"    {pth_file.name} icinde '#import site' bulunamadi veya zaten aktif.")

def install_pip():
    print_step("Pip indiriliyor ve kuruluyor...")
    get_pip_path = EMBEDDED_DIR / "get-pip.py"
    download_file(GET_PIP_URL, get_pip_path)
    
    python_exe = EMBEDDED_DIR / "python.exe"
    print("    Pip kurulumu baslatiliyor (bu islem biraz surebilir)...")
    try:
        subprocess.run([str(python_exe), str(get_pip_path)], check=True)
        print("    Pip basariyla kuruldu.")
    except subprocess.CalledProcessError as e:
        print(f"    [Hata] Pip kurulamadi: {e}")
        exit(1)
    finally:
        if get_pip_path.exists():
            get_pip_path.unlink()

def install_requirements():
    if not REQUIREMENTS_FILE.exists():
        print_step("requirements.txt bulunamadi, bagimlilik yukleme adimi atlaniyor.")
        return
        
    print_step("Bagimliliklar (requirements.txt) yukleniyor...")
    python_exe = EMBEDDED_DIR / "python.exe"
    try:
        # --no-warn-script-location uyarısını susturmak için ekliyoruz
        subprocess.run(
            [str(python_exe), "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE), "--no-warn-script-location"], 
            check=True
        )
        print("    Bagimliliklar basariyla yuklendi.")
    except subprocess.CalledProcessError as e:
        print(f"    [Hata] Bagimliliklar yuklenirken bir sorun olustu: {e}")
        exit(1)

def copy_sources():
    print_step("Kaynak kodlar 'app' dizinine kopyalaniyor...")
    if APP_DIR.exists():
        shutil.rmtree(APP_DIR)
    APP_DIR.mkdir(parents=True, exist_ok=True)
    
    for src in SOURCES_TO_COPY:
        if not src.exists():
            print(f"    [Uyari] Kopyalanacak kaynak bulunamadi, atlaniyor: {src.name}")
            continue
            
        dest = APP_DIR / src.name
        if src.is_dir():
            # ignore parametresi ile gereksiz dosyaları (__pycache__ vb.) kopyalamayı engelleyebiliriz
            shutil.copytree(src, dest, ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.git'))
            print(f"    Klasor kopyalandi: {src.name}/")
        else:
            shutil.copy2(src, dest)
            print(f"    Dosya kopyalandi: {src.name}")

def compile_to_pyc():
    import compileall
    print_step("Python dosyalari (.py) bytecode'a (.pyc) derleniyor ve asillari siliniyor...")
    
    # Tüm .py dosyalarını .pyc olarak derle. legacy=True ile .pyc dosyaları __pycache__ yerine doğrudan aynı dizine yazılır.
    compileall.compile_dir(str(APP_DIR), force=True, legacy=True, quiet=1)
    
    # Orijinal .py dosyalarını temizle
    deleted_py_count = 0
    for py_file in APP_DIR.rglob("*.py"):
        try:
            py_file.unlink()
            deleted_py_count += 1
        except OSError:
            pass
            
    # Varsa __pycache__ klasörlerini temizle
    for pycache_dir in APP_DIR.rglob("__pycache__"):
        if pycache_dir.is_dir():
            shutil.rmtree(pycache_dir, ignore_errors=True)
            
    print(f"    Toplam {deleted_py_count} adet .py dosyasi .pyc formatina donusturuldu ve asillari silindi.")

def main():
    print("="*50)
    print("   Tauri Embedded Python Hazirlik Betigi Basladi   ")
    print("="*50)
    
    setup_embedded_python()
    enable_site_packages()
    install_pip()
    install_requirements()
    copy_sources()
    compile_to_pyc()
    
    print("\n" + "="*50)
    print("Islem basariyla tamamlandi!")
    print(f"Gelistirilmis ve derlenmis Python ortaminiz surada hazir:")
    print(f"-> {EMBEDDED_DIR}")
    print("="*50)

if __name__ == "__main__":
    main()
