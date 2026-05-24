"""
Virel V2 - Evrensel Sabitler
Bu dosya projenin konfigurasyon merkezidir. Sadece sabitleri icerir.
"""
import os
from pathlib import Path

APP_NAME = "Virel"
APP_VERSION = "2.5.0"
GITHUB_REPO = "Nokrima/Virel-Releases"

BASE_DIR = Path(__file__).parent.parent
_appdata_root = Path(os.getenv("APPDATA", str(Path.home() / "AppData" / "Roaming")))
SETTINGS_FILE = _appdata_root / APP_NAME / "settings.json"
LOG_FILE = BASE_DIR / "logs" / "app.log"
MODELS_DIR = BASE_DIR / "models"
DIAGNOSTICS_DIR = BASE_DIR / "logs" / "ocr_diagnostics"
BENCHMARKS_DIR = BASE_DIR / "logs" / "ocr_benchmarks"

WEBSOCKET_HOST = "127.0.0.1"
WEBSOCKET_PORT = 27491

LOG_MAX_BYTES = 5 * 1024 * 1024
LOG_BACKUP_COUNT = 3
QUALITY_THRESHOLD = 40
DEFAULT_READING_SPEED_CPS = 60

PERFORMANCE_TIERS = {
    "economy": {
        "target_ms": 500,
        "active_target_ms": 220,
        "variant_budget": 2,
        "active_variant_budget": 1,
        "active_quality_relax": 4,
        "fast_text_len": 8,
        "fast_quality_floor": 34,
    },
    "standard": {
        "target_ms": 340,
        "active_target_ms": 170,
        "variant_budget": 3,
        "active_variant_budget": 2,
        "active_quality_relax": 6,
        "fast_text_len": 8,
        "fast_quality_floor": 36,
    },
    "performance": {
        "target_ms": 220,
        "active_target_ms": 120,
        "variant_budget": 4,
        "active_variant_budget": 2,
        "active_quality_relax": 7,
        "fast_text_len": 9,
        "fast_quality_floor": 34,
    },
    "maximum": {
        "target_ms": 160,
        "active_target_ms": 95,
        "variant_budget": 5,
        "active_variant_budget": 3,
        "active_quality_relax": 4,
        "min_slot_samples": 2,
        "fast_text_len": 10,
        "fast_quality_floor": 32,
    },
}

PERFORMANCE_TIER_ENGINE_OVERRIDES = {
    "easy": {
        "standard": {
            "target_ms": 300,
            "active_target_ms": 160,
            "active_quality_relax": 5,
            "fast_text_len": 8,
            "fast_quality_floor": 36,
        },
        "performance": {
            "target_ms": 210,
            "active_target_ms": 115,
            "active_variant_budget": 3,
            "active_quality_relax": 6,
            "fast_text_len": 9,
            "fast_quality_floor": 35,
        },
        "maximum": {
            "target_ms": 150,
            "active_target_ms": 90,
            "active_quality_relax": 8,
            "fast_text_len": 10,
            "fast_quality_floor": 33,
        },
    },
    "winonly": {
        "economy": {
            "target_ms": 540,
            "active_target_ms": 240,
            "variant_budget": 1,
            "active_variant_budget": 1,
            "active_quality_relax": 2,
            "fast_text_len": 7,
            "fast_quality_floor": 41,
        },
        "standard": {
            "target_ms": 340,
            "active_target_ms": 180,
            "variant_budget": 2,
            "active_variant_budget": 1,
            "active_quality_relax": 4,
            "fast_text_len": 8,
            "fast_quality_floor": 39,
        },
        "performance": {
            "target_ms": 220,
            "active_target_ms": 130,
            "variant_budget": 3,
            "active_variant_budget": 2,
            "active_quality_relax": 5,
            "fast_text_len": 8,
            "fast_quality_floor": 37,
        },
        "maximum": {
            "target_ms": 150,
            "active_target_ms": 100,
            "variant_budget": 4,
            "active_variant_budget": 2,
            "active_quality_relax": 4,
            "min_slot_samples": 2,
            "fast_text_len": 9,
            "fast_quality_floor": 36,
        },
    },

}

TRANSLATION_SERVICE_TIER_OVERRIDES = {
    "google": {
        "economy": {
            "translated_repeat_window_ms": 180,
        },
        "standard": {
            "translated_repeat_window_ms": 220,
        },
        "performance": {
            "translated_repeat_window_ms": 260,
        },
        "maximum": {
            "translated_repeat_window_ms": 320,
        },
    },
    "auto": {
        "economy": {
            "translated_repeat_window_ms": 180,
        },
        "standard": {
            "translated_repeat_window_ms": 220,
        },
        "performance": {
            "translated_repeat_window_ms": 260,
        },
        "maximum": {
            "translated_repeat_window_ms": 320,
        },
    },
    "offline": {
        "economy": {
            "target_ms": 560,
            "active_target_ms": 175,
            "active_quality_relax": 2,
            "fast_text_len": 7,
            "fast_quality_floor": 41,
            "translated_repeat_window_ms": 1500,
            "min_slot_samples": 3,
            "source_family_hold_ms": 1900,
        },
        "standard": {
            "target_ms": 320,
            "active_target_ms": 112,
            "active_quality_relax": 4,
            "fast_text_len": 8,
            "fast_quality_floor": 38,
            "translated_repeat_window_ms": 1050,
            "min_slot_samples": 3,
            "source_family_hold_ms": 1550,
        },
        "performance": {
            "target_ms": 220,
            "active_target_ms": 82,
            "active_quality_relax": 5,
            "fast_text_len": 8,
            "fast_quality_floor": 37,
            "translated_repeat_window_ms": 850,
            "min_slot_samples": 2,
            "source_family_hold_ms": 1400,
        },
        "maximum": {
            "target_ms": 140,
            "active_target_ms": 64,
            "active_quality_relax": 5,
            "min_slot_samples": 2,
            "fast_text_len": 9,
            "fast_quality_floor": 36,
            "translated_repeat_window_ms": 720,
            "source_family_hold_ms": 1250,
        },
    },
}


def get_performance_tier_profile(engine_id: str | None, tier_name: str | None, translation_engine: str | None = None) -> dict:
    normalized_tier = (tier_name or "standard").strip().lower()
    base_profile = PERFORMANCE_TIERS.get(normalized_tier, PERFORMANCE_TIERS["standard"]).copy()
    normalized_engine = (engine_id or "").strip().lower()
    engine_overrides = PERFORMANCE_TIER_ENGINE_OVERRIDES.get(normalized_engine, {})
    base_profile.update(engine_overrides.get(normalized_tier, {}))
    normalized_translation_engine = (translation_engine or "auto").strip().lower()
    service_overrides = TRANSLATION_SERVICE_TIER_OVERRIDES.get(normalized_translation_engine, {})
    base_profile.update(service_overrides.get(normalized_tier, {}))
    return base_profile

DEFAULT_OCR_FILTERS_ENABLED = True
DEFAULT_RAW_TRANSLATION_FLOW_ENABLED = False

