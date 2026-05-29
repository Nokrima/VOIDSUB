import pytest
import asyncio
from unittest.mock import MagicMock
from core.processor.pipeline import TranslationPipeline

@pytest.mark.asyncio
async def test_pipeline_mixin_smoke():
    bridge_mock = MagicMock()
    capturer_mock = MagicMock()
    
    pipeline = TranslationPipeline(bridge=bridge_mock, capturer=capturer_mock)
    
    # Simulate a translation being queued
    pipeline._translation_request_id = 1
    pipeline._pending_translations.append(
        ("Hello world", 1, 0.0, 0.0, 0.0)
    )
    
    # Mock translation engine methods to prevent real network calls
    pipeline._translate_with_engine = MagicMock(return_value=("Merhaba dünya", "google"))
    pipeline._select_translation_result = MagicMock(return_value=("Merhaba dünya", "google"))
    pipeline._translate_text = MagicMock(return_value=("Merhaba dünya", "google"))
    pipeline._should_skip_translated_emit = MagicMock(return_value=False)
    
    pipeline.is_running = True
    
    # Run the loop (it will break when queue is empty because of `while self._pending_translations:`)
    await pipeline._translate_pending_loop()
    
    # The queue should be empty now
    assert len(pipeline._pending_translations) == 0
    
    # It should have emitted a new translation
    from unittest.mock import ANY
    bridge_mock.send.assert_any_call("new_translation", ANY)
    
    # Verify the payload structure
    translation_call = [call for call in bridge_mock.send.mock_calls if call.args[0] == "new_translation"][0]
    payload = translation_call.args[1]
    assert payload["original_text"] == "Hello world"
    assert payload["translated_text"] == "Merhaba dünya"
