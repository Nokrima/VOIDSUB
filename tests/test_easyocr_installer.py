import pytest  # pyright: ignore[reportMissingImports]
import zipfile
import time
from unittest.mock import MagicMock

from core.ocr.easyocr_manager import EasyOCRManager

@pytest.fixture
def mock_bridge():
    return MagicMock()

@pytest.fixture
def manager(tmp_path, mock_bridge):
    return EasyOCRManager(plugins_dir=tmp_path, bridge=mock_bridge)

def test_easyocr_bad_zip_error(manager, mock_bridge):
    manager._install_started_at = time.monotonic()
    
    manager._prepare_workspace = MagicMock()
    manager._get_download_info = MagicMock(return_value=("http://test", 100))
    manager._download_file = MagicMock()
    manager._verify_plugin = MagicMock()
    
    # Trigger BadZipFile exception
    def fake_extract():
        raise zipfile.BadZipFile("File is not a zip file")
        
    # The actual code catches BadZipFile and raises RuntimeError
    # We will test the worker's handling of this logic
    manager._extract_plugin = MagicMock(side_effect=RuntimeError("İndirilen zip dosyası bozuk veya bağlantı kopması nedeniyle eksik! Lütfen tekrar deneyin."))
    
    manager._install_worker()
    
    assert manager.state == "failed"
    error_calls = [c for c in mock_bridge.send.mock_calls if c.args[0] == "easyocr_plugin_error"]
    assert len(error_calls) == 1
    assert "İndirilen zip dosyası bozuk" in error_calls[0].args[1]["message"]

def test_easyocr_disk_error(manager, mock_bridge):
    manager._install_started_at = time.monotonic()
    
    manager._prepare_workspace = MagicMock()
    manager._get_download_info = MagicMock(return_value=("http://test", 100))
    manager._download_file = MagicMock()
    
    # Trigger generic OSError which is wrapped in RuntimeError
    manager._extract_plugin = MagicMock(side_effect=RuntimeError("Zip cikartma hatasi: No space left on device"))
    
    manager._install_worker()
    
    assert manager.state == "failed"
    error_calls = [c for c in mock_bridge.send.mock_calls if c.args[0] == "easyocr_plugin_error"]
    assert len(error_calls) == 1
    assert "No space left on device" in error_calls[0].args[1]["message"]
