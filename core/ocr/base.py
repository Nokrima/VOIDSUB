"""
Motorların Anayasası (OCREngine): Tüm OCR motorlarının uyması gereken şablon.
KURAL 02: Her public fonksiyon docstring içerir. 
Bu dosya 'Soyut Sınıf' mantığıyla çalışır, diğer motorlar bundan türer.
"""
from abc import ABC, abstractmethod
import numpy as np

class OCREngine(ABC):
    def __init__(self):
        # DEĞİŞTİRME: Motorun mesaiye hazır olup olmadığını tutan bayrak.
        self._is_ready = False

    @property
    @abstractmethod
    def name(self) -> str:
        """DEĞİŞTİRME: Motorun UI'de görünecek yaka kartı (isim ve ikon)."""
        pass

    @abstractmethod
    def start(self) -> bool:
        """
        Mesai Başlangıcı: Motoru ayağa kaldırır, modelleri yükler veya döngüleri başlatır.
        Başarılı olursa True dönmelidir.
        """
        pass

    @abstractmethod
    def read(self, image: np.ndarray) -> list[tuple]:
        """
        Asıl İşlem: Ekran görüntüsünü alır ve okuduğu metinleri koordinatlarıyla döndürür.
        Format: [(None, 'Okunan Metin', 95), ...] (Kutu, Metin, Güven Skoru)
        """
        pass

    @abstractmethod
    def stop(self) -> None:
        """Mesai Bitimi: Hafızayı temizler, döngüleri kapatır."""
        pass

    @abstractmethod
    def system_check(self) -> dict:
        """
        DEĞİŞTİRME: UI (Arayüz) için motorun sağlık raporunu çıkartır.
        Zorunlu Sözlük Formatı: 
        {available: bool, reason: str, requirements: str, critical_component: str, cpu_ok: bool, gpu_ok: bool, ram_ok: bool}
        """
        pass

    def is_ready(self) -> bool:
        """(Değiştirilemez Beton İşlev) Motorun anlık çalışma durumunu söyler."""
        return self._is_ready

    def configure_source_language(self, source_language: str) -> None:
        """Varsayılan olarak hiçbir şey yapmaz; motor isterse dil profiline göre kendini ayarlar."""
        return None
