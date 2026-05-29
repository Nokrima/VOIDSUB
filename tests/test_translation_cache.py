import pytest
from core.translation.cache import TranslationCache

def test_translation_cache():
    cache = TranslationCache(capacity=10)
    cache.put("key1", "value1")
    assert cache.get("key1") == "value1"
    
    # Test bad mark
    cache.mark_bad("key1")
    assert cache.get("key1") is None

    # Test capacity eviction
    for i in range(15):
        cache.put(f"k{i}", f"v{i}")
        
    assert cache.get("k0") is None # Evicted
    assert cache.get("k14") == "v14" # Still in cache
