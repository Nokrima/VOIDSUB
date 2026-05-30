"""
Bulut Çevirmeni (GoogleTranslationEngine): İnternet üzerinden çeviri yapan ana motorumuz.
V1 İyileştirmesi: Sadece kendi işini yapar. Hata anında Offline'a geçme (fallback) işi artık Pipeline'dadır.
"""

import time
from core.translation.base import TranslationEngine
from core.translation.cache import TranslationCache
from core.errors import get_logger, PREFIX_TRL


class GoogleTranslationEngine(TranslationEngine):
    # DEĞİŞTİRME: Motor başlatılırken hafıza deposunu (cache) mecburi olarak teslim alır.
    def __init__(self, cache: TranslationCache):
        self.logger = get_logger()
        self.cache = cache
        self._is_ready = True

    @property
    def name(self) -> str:
        return "🌐 Google Translate"

    def translate(self, text: str, src: str, tgt: str) -> tuple[str, str]:
        """
        DEĞİŞTİRME: Önce hafızaya (cache) bakar, bulamazsa internete (Google) gider.
        Hata alırsa 2 kere tekrar dener (0.4 sn arayla).
        Döndürdüğü ikinci değer, çevirinin nereden geldiğini UI'ye bildirmek içindir ('cache' veya 'google').
        """
        if not text or not text.strip():
            return "", "none"

        # 1. Aşama: Depoya Sor (Bedava ve anında çalışır)
        cache_key = self._cache_key(text, src, tgt)
        cached_result = self.cache.get(cache_key, exact_only=True)
        if cached_result:
            return cached_result, "cache"

        # 2. Aşama: Google'a Git (Maliyetli ve gecikmeli çalışır)
        # KURAL 03: Çıplak except yasak, hatayı Kara Kutu'ya yaz.
        retries = 2
        delay = 0.4

        try:
            from deep_translator import GoogleTranslator

            translator = GoogleTranslator(source=src, target=tgt)
        except Exception as e:
            self.logger.error(
                f"[{PREFIX_TRL}-001] deep_translator moduelue yuklenemedi: {e}"
            )
            return text, "error"

        for attempt in range(retries + 1):
            try:
                translated = translator.translate(text)
                if translated:
                    # Başarılı çeviriyi hemen depoya kaydet ki bir daha sormayalım
                    self.cache.put(
                        cache_key, translated, confidence=1.0, source="google"
                    )
                    return translated, "google"
            except Exception as e:
                if attempt < retries:
                    self.logger.warning(
                        f"[{PREFIX_TRL}-002] Google yanit vermedi, tekrar deneniyor ({attempt + 1}/{retries}): {e}"
                    )
                    time.sleep(delay)
                else:
                    self.logger.error(
                        f"[{PREFIX_TRL}-003] Google Çeviri tamamen çöktü: {e}"
                    )

        return text, "error"

    def is_available(self) -> bool:
        """Şimdilik her zaman True dönüyor, ileride ping atılarak internet kontrolü eklenebilir."""
        return self._is_ready

    def _cache_key(self, text: str, src: str, tgt: str) -> str:
        return f"google:{src}:{tgt}:{text}"
