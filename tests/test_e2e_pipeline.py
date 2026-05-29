import logging
logging.basicConfig(level=logging.DEBUG)
import pytest  # pyright: ignore[reportMissingImports]
import asyncio
from unittest.mock import MagicMock, AsyncMock
from core.processor.pipeline import TranslationPipeline
import time

@pytest.mark.asyncio
async def test_e2e_pipeline_loop(caplog):
    caplog.set_level(logging.DEBUG)
    bridge_mock = MagicMock()
    
    # Fake capturer that returns exactly one frame and then blocks
    class FakeCapturer:
        def __init__(self):
            self.called = False
            self.get_last_resolved_region = lambda: {"top":0, "left":0, "width":100, "height":100}
        
        def capture_region(self, region):
            if not self.called:
                self.called = True
                import numpy as np
                return np.zeros((100, 100, 3), dtype=np.uint8)
            else:
                # Block indefinitely to stop the loop from busy-spinning
                time.sleep(1.0)
                return None
                
    capturer_mock = FakeCapturer()
    
    pipeline = TranslationPipeline(bridge=bridge_mock, capturer=capturer_mock)
    
    # Mock OCR and Translators
    class FakeOCR:
        def is_ready(self): return True
        def process(self, *args, **kwargs): return ("Detected Hello", 90)
    setattr(pipeline, "ocr_engine", FakeOCR())
    pipeline._activate_engine = MagicMock(return_value=True)
    pipeline._get_engine_instance = MagicMock(return_value=pipeline.ocr_engine)
    import numpy as np
    fake_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame_id_counter = [0]
    def next_frame():
        frame_id_counter[0] += 1
        return (frame_id_counter[0], fake_frame, {"top":0,"left":0,"width":100,"height":100}, {"captured_monotonic": 0.0})
    pipeline._take_latest_frame = MagicMock(side_effect=next_frame)
    pipeline._read_fast_then_refine = MagicMock(return_value={
        "text": "Detected Hello", 
        "quality": 90,
        "variant": "base",
        "scene_mode": "dark",
        "result_count": 1,
        "processed": fake_frame,
        "signal": 1.0
    })
    def fake_translate(text): return ("Merhaba çeviri", "google")
    setattr(pipeline.translation_queue, "_translate_text", fake_translate)
    pipeline.offline_translator = MagicMock()
    pipeline.ocr_filters_enabled = False
    pipeline.diagnostics = MagicMock()
    pipeline.performance_monitor = MagicMock()
    pipeline.loop_interval = 0.01
    
    # We will run the pipeline loop in a background task and wait slightly
    task = asyncio.create_task(pipeline.start_loop())
    
    # Wait until it processes the first frame (capture -> queue -> translation)
    calls = []
    for _ in range(10):
        await asyncio.sleep(0.1)
        print("take latest called?", pipeline._take_latest_frame.called)
        calls = [call for call in bridge_mock.send.mock_calls if call.args[0] == "new_translation"]
        if len(calls) > 0:
            break
            
    # Stop the pipeline
    pipeline.is_running = False
    await task

    print("BRIDGE CALLS:", bridge_mock.send.mock_calls)
    if hasattr(pipeline, "ocr_engine") and pipeline.ocr_engine is not None:
        print("IS READY:", pipeline.ocr_engine.is_ready())
    else:
        print("IS READY: False")
    print("Take latest frame called?", pipeline._take_latest_frame.called)
    assert len(calls) > 0, "No translation was emitted over bridge"
    payload = calls[0].args[1] if hasattr(calls[0], "args") else calls[0][1]
    assert payload["original_text"] == "Detected Hello"
    assert payload["translated_text"] == "Merhaba çeviri"
    assert payload["translation_source"] == "google"
    assert "correlation_id" in payload
    assert payload["correlation_id"] != ""
