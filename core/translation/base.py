"""
Çeviri Motorlarının Anayasası (TranslationEngine): Tüm çeviri motorlarının şablonu.
KURAL 02: Her public fonksiyon docstring içerir. 
Bu dosya 'Soyut Sınıf' mantığıyla çalışır, diğer çevirmenler bundan türer.
"""
from abc import ABC, abstractmethod

class TranslationEngine(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Motorun UI'de görünecek yaka kartı (isim ve ikon)."""
        pass

    @abstractmethod
    def translate(self, text: str, src: str, tgt: str) -> tuple[str, str]:
        """
        Asıl Çeviri İşlemi: Metni alır, çevirir ve kaynağını döndürür.
        Format: ('Çevrilmiş Metin', 'google' veya 'cache')
        Tauri UI (Arayüz) bu ikinci değeri kullanarak "Bu çeviri internetten mi geldi hafızadan mı?" diye anlayabilir.
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Motorun şu an çeviri yapmaya uygun olup olmadığını (örn: internet var mı) söyler."""
        pass