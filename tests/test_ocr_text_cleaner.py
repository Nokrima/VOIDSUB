from core.processor.ocr_text_cleaner import clean_ocr_source_detailed


def test_clean_ocr_source_detailed():
    res = clean_ocr_source_detailed("  Hello   World  ")
    assert res["text"] == "Hello World"

    res2 = clean_ocr_source_detailed("H3ll0 W0rld!")
    assert res2["text"] != ""
