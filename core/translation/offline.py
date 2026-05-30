from __future__ import annotations

import json
import gc
import re
import warnings
import threading
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

from core.errors import PREFIX_SYS, PREFIX_TRL, get_logger, log_event
from core.hardware import HardwareDetector
from core.hardware_advisor import log_device_decision, recommend_device
from core.translation.base import TranslationEngine
from core.translation.cache import TranslationCache
from core.translation.offline_model_manager import (
    DEFAULT_MODEL_KEY,
    MODEL_SPECS,
    OfflineModelManager,
)

LANGUAGE_CODES = {"tr": "tur_Latn", "en": "eng_Latn", "ru": "rus_Cyrl"}
OFFLINE_RUNTIME_PROFILE_REVISION = 2
OFFLINE_RUNTIME_PROFILES = {
    "economy": {
        "name": "economy",
        "beam_size": 2,
        "repetition_penalty": 1.02,
        "no_repeat_ngram_size": 2,
        "length_ratio": 1.8,
        "max_decoding_cap": 220,
    },
    "standard": {
        "name": "standard",
        "beam_size": 3,
        "repetition_penalty": 1.06,
        "no_repeat_ngram_size": 2,
        "length_ratio": 2.1,
        "max_decoding_cap": 300,
    },
    "performance": {
        "name": "performance",
        "beam_size": 4,
        "repetition_penalty": 1.08,
        "no_repeat_ngram_size": 3,
        "length_ratio": 2.4,
        "max_decoding_cap": 380,
    },
    "maximum": {
        "name": "maximum",
        "beam_size": 5,
        "repetition_penalty": 1.05,
        "no_repeat_ngram_size": 3,
        "length_ratio": 2.8,
        "max_decoding_cap": 448,
    },
}


class OfflineTranslationEngine(TranslationEngine):
    MAX_INPUT_TOKENS = 448

    def __init__(self, cache: TranslationCache, models_dir: Path, bridge=None):
        self.logger = get_logger()
        self._load_lock = threading.Lock()
        self.cache = cache
        self.models_dir = models_dir
        self.bridge = bridge
        self._managers = {
            key: OfflineModelManager(models_dir=models_dir, model_key=key, bridge=self)
            for key in MODEL_SPECS
        }
        self._model_key = DEFAULT_MODEL_KEY
        self._translator_map: dict[str, object | None] = {
            key: None for key in MODEL_SPECS
        }
        self._tokenizer_map: dict[str, object | None] = {
            key: None for key in MODEL_SPECS
        }
        self._runtime_advice_map: dict[str, dict | None] = {
            key: None for key in MODEL_SPECS
        }
        self._warmed_up_map: dict[str, bool] = {key: False for key in MODEL_SPECS}
        self._install_queue: list[str] = []
        self._active_install_model: str | None = None
        for manager in self._managers.values():
            manager.recover()
        self._runtime_profile_name = "standard"
        self._runtime_profile = OFFLINE_RUNTIME_PROFILES["standard"].copy()
        self._load_saved_runtime_profile()

    @property
    def name(self) -> str:
        return f"Offline {MODEL_SPECS[self._model_key]['label']}"

    @property
    def model_dir(self) -> Path:
        return self._manager.model_dir

    @property
    def _manager(self) -> OfflineModelManager:
        return self._managers[self._model_key]

    def set_model_key(self, model_key: str | None) -> None:
        normalized = (model_key or DEFAULT_MODEL_KEY).strip().lower()
        if normalized not in MODEL_SPECS:
            normalized = DEFAULT_MODEL_KEY
        if normalized == self._model_key:
            return

        # Unload previous model to free VRAM
        if self._model_key != normalized:
            self.unload_runtime(self._model_key)

        self._model_key = normalized
        self._load_saved_runtime_profile()

    def is_available(self) -> bool:
        return bool(self.get_status().get("available", False))

    def translate(self, text: str, src: str, tgt: str) -> tuple[str, str]:
        if not text or not text.strip():
            return "", "none"
        if not self.is_available():
            return text, "offline_unavailable"

        effective_src = self._resolve_source_language(text, src)
        clean_text = re.sub(r"\s+", " ", text).strip()

        def _attempt() -> tuple[str, str]:
            self._load_runtime()
            if self._model_key == "opus_mt_en_tr":
                if tgt != "tr" or (src or "").strip().lower() not in {"en", "auto"}:
                    return text, "offline_unsupported"
                return self._run_opus_model(clean_text), "offline"
            if tgt != "tr" or effective_src not in {"en", "ru"}:
                return text, "offline_unsupported"
            return self._run_nllb_model(clean_text, effective_src, tgt), "offline"

        try:
            return _attempt()
        except Exception as exc:
            self.logger.error(
                f"[{PREFIX_TRL}-011] [Yerel Çeviri Motoru] -> ÇEVİRİ HATASI | Detay: {exc}"
            )
            from core.errors import emit_bridge_event

            emit_bridge_event(
                "log_entry",
                {
                    "timestamp": "",
                    "level": "ERROR",
                    "prefix": "TRL",
                    "code": "TRL-011",
                    "message": "Çeviri motoru yanıt vermiyor. Motor yeniden başlatılıyor.",
                },
            )

            try:
                self.unload_runtime()
                return _attempt()
            except Exception as retry_exc:
                self.logger.error(
                    f"[{PREFIX_TRL}-011] [Yerel Çeviri Motoru] -> YENİDEN BAŞLATMA BAŞARISIZ | Detay: {retry_exc}"
                )
                emit_bridge_event(
                    "translation_state",
                    {
                        "running": False,
                        "reason": "engine_unavailable",
                        "message": "Çevrimdışı motor çöktü ve kurtarılamadı.",
                    },
                )
                return text, "offline_error"

    def download_models(
        self, model_key: str | list[str] | tuple[str, ...] | None = None
    ) -> None:
        requested = self._normalize_model_list(model_key)
        requested = [
            key
            for key in requested
            if not self._managers[key].get_status().get("available")
        ]
        if not requested:
            message = "[Model İndirme] -> İPTAL EDİLDİ | Tüm modeller zaten kurulu."
            log_event(PREFIX_TRL, "041", message)
            if self.bridge is not None:
                self.bridge.send("offline_model_status", self.get_status())
            return

        busy_model = self._busy_model_key()
        install_order = sorted(requested, key=self._install_priority)
        target_model = install_order[0]

        if busy_model:
            if busy_model == target_model:
                return

            busy_state = self._managers[busy_model].state
            if busy_state in {"converting", "verifying", "remove"}:
                message = f"[Model İndirme] -> REDDEDİLDİ | {MODEL_SPECS[busy_model]['label']} şu an kritik kurulum aşamasında."
                self.logger.warning(f"[{PREFIX_TRL}-015] {message}")
                if self.bridge is not None:
                    self.bridge.send(
                        "offline_model_error", {"message": message, "model": busy_model}
                    )
                return
            else:
                message = f"[Model İndirme] -> DURAKLATILDI | {MODEL_SPECS[busy_model]['label']} öncelikli işlem için duraklatıldı."
                self.logger.info(f"[{PREFIX_TRL}-016] {message}")
                self._managers[busy_model].pause()

                if busy_model not in self._install_queue:
                    self._install_queue.insert(0, busy_model)
                for key in install_order[1:]:
                    if key not in self._install_queue and key != busy_model:
                        self._install_queue.append(key)

                self._active_install_model = target_model
                threading.Timer(
                    1.0, self._managers[target_model].start, args=[self]
                ).start()
                return

        # Kuyruğa yeni eklenenleri sıraya al
        for key in install_order[1:]:
            if key not in self._install_queue:
                self._install_queue.append(key)

        self._active_install_model = target_model
        self._managers[self._active_install_model].start(self)

    def cancel_download(self) -> None:
        self._install_queue = []
        busy_model = self._busy_model_key()
        if busy_model:
            self._active_install_model = busy_model
            self._managers[busy_model].cancel()
            return
        self._active_install_model = None
        log_event(PREFIX_TRL, "056", "[İndirme İptali] -> ATLANDI | Aktif işlem yok.")

    def get_status(self) -> dict:
        statuses = {
            key: manager.get_status() for key, manager in self._managers.items()
        }
        busy_model = next(
            (key for key, status in statuses.items() if status.get("busy")), None
        )
        selected = statuses[self._model_key]
        focus = statuses[busy_model] if busy_model else selected
        focus_state = str(focus.get("state", "idle"))
        active_model = busy_model or self._active_install_model
        active_action = (
            "remove"
            if focus_state == "remove" and active_model
            else "install"
            if active_model
            else None
        )
        return {
            "available": bool(selected.get("available", False)),
            "busy": bool(busy_model),
            "packages_ready": all(
                bool(status.get("packages_ready", False))
                for status in statuses.values()
            ),
            "models_ready": {
                key: bool(status.get("available", False))
                for key, status in statuses.items()
            },
            "models_dir": str(self.models_dir),
            "selected_model": self._model_key,
            "selected_label": MODEL_SPECS[self._model_key]["label"],
            "active_install_model": self._active_install_model or busy_model,
            "active_model": active_model,
            "active_action": active_action,
            "queued_models": list(self._install_queue),
            "model_details": statuses,
            "state": focus_state,
            "percent": int(focus.get("percent", 0) or 0),
            "detail": str(focus.get("detail", "")),
            "bytes_label": str(focus.get("bytes_label", "")),
        }

    def set_runtime_profile(self, performance_tier: str | None = None) -> None:
        normalized = (performance_tier or "standard").strip().lower()
        if normalized not in OFFLINE_RUNTIME_PROFILES:
            normalized = "standard"
        self._runtime_profile_name = normalized
        self._runtime_profile = OFFLINE_RUNTIME_PROFILES[normalized].copy()
        profile_to_save = {
            "revision": OFFLINE_RUNTIME_PROFILE_REVISION,
            **self._runtime_profile,
        }
        self._manager.save_runtime_profile(profile_to_save)
        self.logger.info(
            f"[{PREFIX_TRL}-018] Offline runtime profili uygulandi: {normalized} ({self._model_key})"
        )

    def remove_models(self, model_key: str | None = None) -> None:
        manager = self._pick_manager(model_key)
        self._translator_map[manager.model_key] = None
        self._tokenizer_map[manager.model_key] = None
        self._runtime_advice_map[manager.model_key] = None
        self._warmed_up_map[manager.model_key] = False
        manager.remove()

    def warmup(self) -> bool:
        if self._warmed_up_map[self._model_key] or not self.is_available():
            return self._warmed_up_map[self._model_key]
        try:
            self._load_runtime()
            if self._model_key == "opus_mt_en_tr":
                self._run_opus_model("Hello world.")
            else:
                self._run_nllb_model("Hello.", "en", "tr")
            self._warmed_up_map[self._model_key] = True
            return True
        except Exception as exc:
            self.logger.error(
                f"[{PREFIX_TRL}-012] [Yerel Çeviri Motoru] -> ISINMA (WARMUP) HATASI | Detay: {exc}"
            )
            return False

    def unload_runtime(self, model_key: str | None = None) -> None:
        target_key = model_key or self._model_key
        with self._load_lock:
            translator = self._translator_map.get(target_key)
            if translator is not None:
                self.logger.info(
                    f"[{PREFIX_TRL}-045] Offline translator bellekten temizleniyor: {target_key}"
                )
                if hasattr(translator, "unload_model"):
                    try:
                        translator.unload_model()  # type: ignore
                    except Exception:
                        pass
                self._translator_map[target_key] = None
                self._tokenizer_map[target_key] = None
                self._warmed_up_map[target_key] = False

                # Force Python Garbage Collection
                gc.collect()

                # If CUDA is available, try to empty cache
                try:
                    import torch

                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass

    def _load_runtime(self) -> None:
        with self._load_lock:
            if (
                self._translator_map[self._model_key] is not None
                and self._tokenizer_map[self._model_key] is not None
            ):
                return

            if not self._manager.verify_integrity():
                raise RuntimeError("model_corrupted")

            import ctranslate2
            from transformers import AutoTokenizer, MarianTokenizer
            from transformers.utils import logging as hf_logging

            self._log_runtime_probe("before_load")

            advice = self._runtime_advice_map[self._model_key]
            if advice is None:
                try:
                    advice = recommend_device(HardwareDetector().scan_system())
                    log_device_decision(advice)
                except Exception as exc:
                    self.logger.error(
                        f"[{PREFIX_SYS}-019] [Donanım Taraması] -> TARAMA BAŞARISIZ | Aksiyon: İşlemciye (CPU) Geçiliyor | Hata: {exc}"
                    )
                    from core.errors import emit_bridge_event

                    emit_bridge_event(
                        "log_entry",
                        {
                            "timestamp": "",
                            "level": "WARNING",
                            "prefix": "SYS",
                            "code": "SYS-019",
                            "message": "Ekran kartına erişilemiyor. İşlemci ile devam ediliyor — performans düşebilir.",
                        },
                    )
                    advice = {
                        "device": "cpu",
                        "compute_type": "int8",
                        "inter_threads": 1,
                        "intra_threads": 4,
                        "reason": "fallback after scan error",
                    }
                self._runtime_advice_map[self._model_key] = advice
            try:
                self.logger.info(
                    f"[{PREFIX_TRL}-033] Offline translator yukleniyor: model={self._model_key} "
                    f"device={advice['device']} compute={advice['compute_type']} model_dir={self.model_dir}"
                )
                self._translator_map[self._model_key] = ctranslate2.Translator(
                    str(self.model_dir),
                    device=advice["device"],
                    compute_type=advice["compute_type"],
                    inter_threads=advice["inter_threads"],
                    intra_threads=advice["intra_threads"],
                )
            except Exception as exc:
                if advice["device"] != "cpu":
                    self.logger.warning(
                        f"[{PREFIX_SYS}-020] CUDA yukleme basarisiz, CPU fallback: {exc}"
                    )
                    from core.errors import emit_bridge_event

                    emit_bridge_event(
                        "log_entry",
                        {
                            "timestamp": "",
                            "level": "WARNING",
                            "prefix": "SYS",
                            "code": "SYS-020",
                            "message": "Model ekran kartına yüklenemedi. İşlemci kullanılıyor.",
                        },
                    )
                    self._runtime_advice_map[self._model_key] = {
                        "device": "cpu",
                        "compute_type": "int8",
                        "inter_threads": 1,
                        "intra_threads": 4,
                        "reason": "cpu fallback",
                    }
                    self.logger.info(
                        f"[{PREFIX_TRL}-034] Offline translator CPU fallback deneniyor: model={self._model_key} model_dir={self.model_dir}"
                    )
                    self._translator_map[self._model_key] = ctranslate2.Translator(
                        str(self.model_dir),
                        device="cpu",
                        compute_type="int8",
                        inter_threads=1,
                        intra_threads=4,
                    )
                else:
                    raise
            with (
                warnings.catch_warnings(),
                redirect_stdout(StringIO()),
                redirect_stderr(StringIO()),
            ):
                previous_verbosity = hf_logging.get_verbosity()
                hf_logging.set_verbosity_error()
                try:
                    if self._model_key == "opus_mt_en_tr":
                        tokenizer = MarianTokenizer.from_pretrained(
                            str(self.model_dir), use_fast=False
                        )
                        self.logger.info(
                            f"[{PREFIX_TRL}-035] MarianTokenizer yuklendi: {type(tokenizer).__name__}"
                        )
                    else:
                        warnings.filterwarnings(
                            "ignore",
                            message=r"The tokenizer you are loading from '.*' with an incorrect regex pattern:.*",
                        )
                        tokenizer = AutoTokenizer.from_pretrained(
                            str(self.model_dir),
                            src_lang=LANGUAGE_CODES["en"],
                            use_fast=False,
                        )
                        self.logger.info(
                            f"[{PREFIX_TRL}-035] AutoTokenizer yuklendi: {type(tokenizer).__name__}"
                        )
                    self._tokenizer_map[self._model_key] = tokenizer
                finally:
                    hf_logging.set_verbosity(previous_verbosity)

    def _run_opus_model(self, text: str) -> str:
        tokenizer = self._tokenizer_map[self._model_key]
        translator = self._translator_map[self._model_key]
        if tokenizer is None or translator is None:
            raise RuntimeError("Offline runtime yuklenmedi")
        prefix_match = re.match(r"^([A-Z][A-Z0-9 .'-]{1,24}:\s*)(.+)$", text.strip())
        prefix = ""
        if prefix_match:
            prefix = prefix_match.group(1).strip()
            text = prefix_match.group(2).strip()
        source_ids = tokenizer.encode(
            text,
            add_special_tokens=True,
            truncation=True,
            max_length=self.MAX_INPUT_TOKENS,
        )  # type: ignore
        batch = [tokenizer.convert_ids_to_tokens(source_ids)]  # type: ignore
        profile = self._runtime_profile
        try:
            results = translator.translate_batch(  # type: ignore
                batch,
                beam_size=int(profile["beam_size"]),
                repetition_penalty=float(profile["repetition_penalty"]),
                no_repeat_ngram_size=int(profile["no_repeat_ngram_size"]),
                max_input_length=self.MAX_INPUT_TOKENS,
                max_decoding_length=min(
                    int(profile["max_decoding_cap"]),
                    max(96, int(len(source_ids) * float(profile["length_ratio"]))),
                ),
            )
        except Exception as exc:
            err_str = str(exc).lower()
            if (
                "memory" in err_str
                or "cuda" in err_str
                or "cublas" in err_str
                or "alloc" in err_str
            ):
                self.logger.warning(
                    f"[{PREFIX_TRL}-099] VRAM doldu (OOM). Model CPU'ya dusuruluyor! Detay: {exc}"
                )
                self.unload_runtime()
                self._runtime_advice_map[self._model_key] = {
                    "device": "cpu",
                    "compute_type": "int8",
                    "inter_threads": 1,
                    "intra_threads": 4,
                    "reason": "oom fallback",
                }
                self._load_runtime()
                translator = self._translator_map[self._model_key]
                results = translator.translate_batch(  # type: ignore
                    batch,
                    beam_size=int(profile["beam_size"]),
                    repetition_penalty=float(profile["repetition_penalty"]),
                    no_repeat_ngram_size=int(profile["no_repeat_ngram_size"]),
                    max_input_length=self.MAX_INPUT_TOKENS,
                    max_decoding_length=min(
                        int(profile["max_decoding_cap"]),
                        max(96, int(len(source_ids) * float(profile["length_ratio"]))),
                    ),
                )
            else:
                raise
        target_tokens = results[0].hypotheses[0]  # type: ignore
        target_ids = tokenizer.convert_tokens_to_ids(target_tokens)  # type: ignore
        translated = tokenizer.decode(target_ids, skip_special_tokens=True).strip()  # type: ignore
        return f"{prefix} {translated}".strip() if prefix else translated

    def _run_nllb_model(self, text: str, source_lang: str, target_lang: str) -> str:
        tokenizer = self._tokenizer_map[self._model_key]
        translator = self._translator_map[self._model_key]
        if tokenizer is None or translator is None:
            raise RuntimeError("Offline runtime yuklenmedi")
        prefix_match = re.match(r"^([A-Z][A-Z0-9 .'-]{1,24}:\s*)(.+)$", text.strip())
        prefix = ""
        if prefix_match:
            prefix = prefix_match.group(1).strip()
            text = prefix_match.group(2).strip()
        tokenizer.src_lang = LANGUAGE_CODES[source_lang]  # type: ignore
        source_ids = tokenizer.encode(
            text,
            add_special_tokens=True,
            truncation=True,
            max_length=self.MAX_INPUT_TOKENS,
        )  # type: ignore
        batch = [tokenizer.convert_ids_to_tokens(source_ids)]  # type: ignore
        profile = self._runtime_profile
        try:
            results = translator.translate_batch(  # type: ignore
                batch,
                target_prefix=[[LANGUAGE_CODES[target_lang]]],
                beam_size=int(profile["beam_size"]),
                repetition_penalty=float(profile["repetition_penalty"]),
                no_repeat_ngram_size=int(profile["no_repeat_ngram_size"]),
                max_input_length=self.MAX_INPUT_TOKENS,
                max_decoding_length=min(
                    int(profile["max_decoding_cap"]),
                    max(96, int(len(source_ids) * float(profile["length_ratio"]))),
                ),
            )
        except Exception as exc:
            err_str = str(exc).lower()
            if (
                "memory" in err_str
                or "cuda" in err_str
                or "cublas" in err_str
                or "alloc" in err_str
            ):
                self.logger.warning(
                    f"[{PREFIX_TRL}-099] VRAM doldu (OOM). Model CPU'ya dusuruluyor! Detay: {exc}"
                )
                self.unload_runtime()
                self._runtime_advice_map[self._model_key] = {
                    "device": "cpu",
                    "compute_type": "int8",
                    "inter_threads": 1,
                    "intra_threads": 4,
                    "reason": "oom fallback",
                }
                self._load_runtime()
                translator = self._translator_map[self._model_key]
                results = translator.translate_batch(  # type: ignore
                    batch,
                    target_prefix=[[LANGUAGE_CODES[target_lang]]],
                    beam_size=int(profile["beam_size"]),
                    repetition_penalty=float(profile["repetition_penalty"]),
                    no_repeat_ngram_size=int(profile["no_repeat_ngram_size"]),
                    max_input_length=self.MAX_INPUT_TOKENS,
                    max_decoding_length=min(
                        int(profile["max_decoding_cap"]),
                        max(96, int(len(source_ids) * float(profile["length_ratio"]))),
                    ),
                )
            else:
                raise
        target_tokens = results[0].hypotheses[0]  # type: ignore
        target_ids = tokenizer.convert_tokens_to_ids(target_tokens)  # type: ignore
        translated = tokenizer.decode(target_ids, skip_special_tokens=True).strip()  # type: ignore
        return f"{prefix} {translated}".strip() if prefix else translated

    def _resolve_source_language(self, text: str, src: str) -> str:
        normalized = (src or "auto").strip().lower()
        if normalized == "ru":
            return "ru"
        if normalized == "en":
            return "en"
        cyrillic_count = len(re.findall(r"[\u0400-\u04FF]", text))
        latin_count = len(re.findall(r"[A-Za-z]", text))
        return (
            "ru"
            if cyrillic_count >= 2 and cyrillic_count >= max(2, latin_count)
            else "en"
        )

    def _log_runtime_probe(self, label: str) -> None:
        try:
            files = (
                sorted(p.name for p in self.model_dir.iterdir())
                if self.model_dir.exists()
                else []
            )
            self.logger.info(
                f"[{PREFIX_TRL}-036] Runtime probe {label}: model={self._model_key} model_dir={self.model_dir} files={files}"
            )
            for name in ("config.json", "tokenizer_config.json"):
                path = self.model_dir / name
                if not path.exists():
                    self.logger.warning(
                        f"[{PREFIX_TRL}-037] Runtime probe {label}: eksik dosya {name}"
                    )
                    continue
                payload = json.loads(path.read_text(encoding="utf-8"))
                null_keys = sorted(
                    key for key, value in payload.items() if value is None
                )
                self.logger.info(
                    f"[{PREFIX_TRL}-038] Runtime probe {label}: {name} keys={sorted(payload.keys())} "
                    f"model_type={payload.get('model_type')!r} tokenizer_class={payload.get('tokenizer_class')!r} null_keys={null_keys}"
                )
        except Exception as exc:
            self.logger.warning(
                f"[{PREFIX_TRL}-039] Runtime probe {label} okunamadi: {exc}"
            )

    def _load_saved_runtime_profile(self) -> None:
        saved = self._manager.load_runtime_profile()
        if not isinstance(saved, dict):
            self._runtime_profile_name = "standard"
            self._runtime_profile = OFFLINE_RUNTIME_PROFILES["standard"].copy()
            return
        profile_name = str(saved.get("name", "standard")).strip().lower()
        if profile_name not in OFFLINE_RUNTIME_PROFILES:
            profile_name = "standard"
        profile = OFFLINE_RUNTIME_PROFILES[profile_name].copy()
        if int(saved.get("revision", 0) or 0) == OFFLINE_RUNTIME_PROFILE_REVISION:
            for key in (
                "beam_size",
                "repetition_penalty",
                "no_repeat_ngram_size",
                "length_ratio",
                "max_decoding_cap",
            ):
                if key in saved:
                    profile[key] = saved[key]
        self._runtime_profile_name = profile_name
        self._runtime_profile = profile

    def _busy_model_key(self) -> str | None:
        for key, manager in self._managers.items():
            if manager.get_status().get("busy"):
                return key
        return None

    def _pick_manager(self, model_key: str | None) -> OfflineModelManager:
        normalized = (model_key or self._model_key).strip().lower()
        if normalized not in self._managers:
            normalized = self._model_key
        return self._managers[normalized]

    def _normalize_model_list(
        self, model_key: str | list[str] | tuple[str, ...] | None
    ) -> list[str]:
        values = model_key if isinstance(model_key, (list, tuple)) else [model_key]
        normalized: list[str] = []
        for value in values:
            key = (value or "").strip().lower()
            if key in MODEL_SPECS and key not in normalized:
                normalized.append(key)
        return normalized

    def _install_priority(self, model_key: str) -> tuple[int, str]:
        order = {"opus_mt_en_tr": 0, "nllb": 1}
        return (order.get(model_key, 99), model_key)

    def send(self, event: str, data: dict) -> None:
        if self.bridge is None:
            return
        if event == "offline_model_status":
            self.bridge.send("offline_model_status", self.get_status())
            return
        if event == "offline_model_complete":
            completed_model = (
                str(data.get("model") or self._active_install_model or "")
                .strip()
                .lower()
            )
            self._active_install_model = None
            if self._install_queue:
                next_model = self._install_queue.pop(0)
                self._active_install_model = next_model
                completed_label = MODEL_SPECS.get(
                    completed_model, MODEL_SPECS[DEFAULT_MODEL_KEY]
                )["label"]
                next_label = MODEL_SPECS[next_model]["label"]
                self.bridge.send("offline_model_status", self.get_status())
                self.bridge.send(
                    "offline_model_progress",
                    {
                        "stage": "queue",
                        "percent": 100,
                        "model": completed_model,
                        "detail": f"{completed_label} hazır. Sıradaki kurulum: {next_label}",
                        "bytes_label": "",
                    },
                )
                self._managers[next_model].start(self)
            else:
                self.bridge.send(event, data)
                self.bridge.send("offline_model_status", self.get_status())
            return
        if event in {"offline_model_cancelled", "offline_model_error"}:
            self._install_queue = []
            self._active_install_model = None
        self.bridge.send(event, data)
        if event in {
            "offline_model_complete",
            "offline_model_cancelled",
            "offline_model_error",
        }:
            self.bridge.send("offline_model_status", self.get_status())
