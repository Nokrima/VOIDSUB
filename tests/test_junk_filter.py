import pytest  # pyright: ignore[reportMissingImports]
from core.processor.junk_filter import JunkFilter

def test_is_junk():
    assert JunkFilter.is_junk("") == True
    assert JunkFilter.is_junk("  ") == True
    assert JunkFilter.is_junk("---") == True
    assert JunkFilter.is_junk("Hello World") == False
    assert JunkFilter.is_junk("!!!???,,,") == True

def test_analyze_text():
    health = JunkFilter.analyze_text("Normal sentence.")
    assert health["health_score"] > 80
    
    health_bad = JunkFilter.analyze_text("Xyz qwe12!@#")
    assert health_bad["health_score"] < 100
