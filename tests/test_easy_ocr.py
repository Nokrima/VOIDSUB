import json
import queue
import subprocess
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from core.ocr.easy_ocr import EasyOCREngine


def test_easyocr_worker_timeout():
    engine = EasyOCREngine()
    engine.plugin_python = MagicMock()
    engine.worker_proc = MagicMock()
    engine._is_ready = True

    # Simulate timeout by making _stdout_q.get raise queue.Empty
    engine._stdout_q = MagicMock()
    engine._stdout_q.get.side_effect = queue.Empty

    engine.stop = MagicMock()

    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)
    result = engine._read_worker_mode(fake_image)

    assert result == []
    engine.stop.assert_called_once()
    assert engine.worker_proc.stdin.write.called
    assert engine.worker_proc.stdin.flush.called


def test_easyocr_worker_invalid_json():
    engine = EasyOCREngine()
    engine.plugin_python = MagicMock()
    engine.worker_proc = MagicMock()
    engine._is_ready = True

    # Simulate invalid JSON response
    engine._stdout_q = MagicMock()
    engine._stdout_q.get.return_value = "invalid json{"

    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)
    result = engine._read_worker_mode(fake_image)

    assert result == []


def test_easyocr_worker_stop():
    engine = EasyOCREngine()
    mock_proc = MagicMock()
    engine.worker_proc = mock_proc

    # Fill queue to ensure it gets drained
    engine._stdout_q.put("some data")

    engine.stop()

    mock_proc.terminate.assert_called_once()
    mock_proc.wait.assert_called_once_with(timeout=1.0)
    assert engine.worker_proc is None
    assert engine._is_ready is False
    assert engine._stdout_q.empty()


@patch("core.ocr.easy_ocr.subprocess.Popen")
@patch("core.ocr.easy_ocr.threading.Thread")
def test_easyocr_worker_start(mock_thread, mock_popen):
    engine = EasyOCREngine()
    
    # Mock plugin_python path so _start_worker_mode succeeds
    mock_path = MagicMock()
    mock_path.parent.__truediv__.return_value.exists.return_value = True
    engine.plugin_python = mock_path
    
    result = engine._start_worker_mode()
    
    assert result is True
    assert engine._is_ready is True
    assert engine.use_gpu is True
    assert mock_popen.called
    assert mock_thread.call_count == 2
