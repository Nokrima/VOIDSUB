import pytest
import time
from pathlib import Path
from unittest.mock import MagicMock

from core.translation.offline_model_manager import OfflineModelManager

@pytest.fixture
def mock_bridge():
    return MagicMock()

@pytest.fixture
def manager(tmp_path, mock_bridge):
    mgr = OfflineModelManager(models_dir=tmp_path, bridge=mock_bridge)
    # Avoid spawning threads during tests
    return mgr

def test_offline_model_cancel_cleans_up(manager, mock_bridge):
    # Setup state
    manager._install_started_at = time.monotonic()
    
    # Mock step to trigger cancellation
    def fake_ensure():
        manager._cancel.set()
        manager._raise_if_cancelled()
        
    manager._ensure_packages = MagicMock(side_effect=fake_ensure)
    
    # Create fake tmp_dir to ensure it gets deleted
    manager.tmp_dir.mkdir(parents=True, exist_ok=True)
    assert manager.tmp_dir.exists()
    
    # Run the worker synchronously
    manager._install_worker()
    
    # Verification
    assert manager.state == "idle"
    assert not manager.tmp_dir.exists()
    
    # Ensure bridge send offline_model_status
    calls = [call for call in mock_bridge.send.mock_calls if call.args[0] == "offline_model_status"]
    assert len(calls) > 0

def test_offline_model_network_error_emits_error(manager, mock_bridge):
    manager._install_started_at = time.monotonic()
    
    # Mock step to trigger unexpected error (like network timeout)
    manager._ensure_packages = MagicMock(side_effect=Exception("Connection Timeout"))
    
    # Run the worker
    manager._install_worker()
    
    # Verification
    assert manager.state == "failed"
    assert manager.detail == "Connection Timeout"
    
    # Ensure bridge emits error
    error_calls = [call for call in mock_bridge.send.mock_calls if call.args[0] == "offline_model_error"]
    assert len(error_calls) == 1
    payload = error_calls[0].args[1]
    assert payload["message"] == "Connection Timeout"
    assert payload["model"] == manager.model_key
