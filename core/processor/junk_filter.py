"""JunkFilter: OCR ciktisini cop, yari-kirli ve kopuk parca diye ayirir."""

from __future__ import annotations

import re

from core.errors import PREFIX_OCR, log_event
from core.processor.types import TextAnalysisResult

COMMON_ENGLISH_WORDS = {
    "the",
    "be",
    "to",
    "of",
    "and",
    "a",
    "in",
    "that",
    "have",
    "i",
    "it",
    "for",
    "not",
    "on",
    "with",
    "he",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "his",
    "by",
    "from",
    "they",
    "we",
    "say",
    "her",
    "she",
    "or",
    "an",
    "will",
    "my",
    "one",
    "all",
    "would",
    "there",
    "their",
    "what",
    "so",
    "up",
    "out",
    "if",
    "about",
    "who",
    "get",
    "which",
    "go",
    "me",
    "when",
    "make",
    "can",
    "like",
    "time",
    "no",
    "just",
    "him",
    "know",
    "take",
    "people",
    "into",
    "year",
    "your",
    "good",
    "some",
    "could",
    "them",
    "see",
    "other",
    "than",
    "then",
    "now",
    "look",
    "only",
    "come",
    "its",
    "over",
    "think",
    "also",
    "back",
    "after",
    "use",
    "two",
    "how",
    "our",
    "work",
    "first",
    "well",
    "way",
    "even",
    "new",
    "want",
    "because",
    "any",
    "these",
    "give",
    "day",
    "most",
    "us",
    "is",
    "was",
    "are",
    "been",
    "being",
    "has",
    "had",
    "does",
    "did",
    "should",
    "may",
    "might",
    "must",
    "going",
    "tell",
    "ask",
    "answer",
    "help",
    "call",
    "play",
    "find",
    "try",
    "feel",
    "move",
    "live",
    "open",
    "close",
    "walk",
    "talk",
    "listen",
    "wait",
    "stand",
    "sit",
    "run",
    "drive",
    "write",
    "read",
    "show",
    "bad",
    "big",
    "small",
    "long",
    "short",
    "high",
    "low",
    "old",
    "right",
    "left",
    "top",
    "bottom",
    "hot",
    "cold",
    "yes",
    "ok",
    "okay",
    "hello",
    "hi",
    "bye",
    "thanks",
    "please",
    "sorry",
    "watch",
    "hear",
    "need",
    "love",
    "hate",
    "believe",
    "understand",
    "remember",
    "forget",
    "learn",
    "teach",
    "speak",
    "communicate",
    "explain",
    "describe",
    "receive",
    "bring",
    "carry",
    "hold",
    "pick",
    "drop",
    "throw",
    "catch",
    "hit",
    "kick",
    "push",
    "pull",
    "touch",
    "grab",
    "release",
    "turn",
    "point",
    "follow",
    "lead",
    "meet",
    "greet",
    "welcome",
    "visit",
    "stay",
    "leave",
    "arrive",
    "enter",
    "exit",
    "climb",
    "jump",
    "fall",
    "break",
    "fix",
    "build",
    "destroy",
    "create",
    "form",
    "shape",
    "cut",
    "press",
    "stretch",
    "twist",
    "roll",
    "spin",
    "shake",
    "wave",
    "swing",
    "sleep",
    "wake",
    "rise",
    "kneel",
    "reach",
    "raise",
    "lift",
    "man",
    "woman",
    "child",
    "person",
    "boy",
    "girl",
    "baby",
    "adult",
    "father",
    "mother",
    "parent",
    "brother",
    "sister",
    "family",
    "friend",
    "enemy",
    "doctor",
    "nurse",
    "teacher",
    "student",
    "soldier",
    "captain",
    "chief",
    "leader",
    "boss",
    "worker",
    "hunter",
    "merchant",
    "house",
    "home",
    "room",
    "door",
    "window",
    "wall",
    "floor",
    "roof",
    "kitchen",
    "bedroom",
    "bathroom",
    "office",
    "store",
    "school",
    "church",
    "street",
    "road",
    "path",
    "gate",
    "bridge",
    "river",
    "mountain",
    "forest",
    "field",
    "garden",
    "farm",
    "city",
    "town",
    "village",
    "country",
    "money",
    "gold",
    "silver",
    "coin",
    "bank",
    "price",
    "cost",
    "value",
    "trade",
    "buy",
    "sell",
    "pay",
    "spend",
    "save",
    "earn",
    "lose",
    "win",
    "profit",
    "food",
    "drink",
    "eat",
    "cook",
    "bake",
    "boil",
    "bread",
    "meat",
    "fish",
    "chicken",
    "milk",
    "cheese",
    "apple",
    "banana",
    "orange",
    "fruit",
    "vegetable",
    "rice",
    "corn",
    "bean",
    "potato",
    "carrot",
    "onion",
    "salt",
    "pepper",
    "sugar",
    "water",
    "wine",
    "beer",
    "coffee",
    "tea",
    "music",
    "song",
    "dance",
    "art",
    "paint",
    "draw",
    "book",
    "paper",
    "pen",
    "pencil",
    "color",
    "red",
    "blue",
    "green",
    "yellow",
    "black",
    "white",
    "gray",
    "brown",
    "pink",
    "purple",
    "light",
    "dark",
    "bright",
    "clear",
    "cloudy",
    "sunny",
    "rainy",
    "windy",
    "snow",
    "rain",
    "wind",
    "storm",
    "fire",
    "air",
    "earth",
    "stone",
    "rock",
    "sand",
    "dirt",
    "dust",
    "smoke",
    "fog",
    "car",
    "truck",
    "bus",
    "train",
    "ship",
    "boat",
    "plane",
    "bike",
    "horse",
    "weapon",
    "sword",
    "gun",
    "bow",
    "arrow",
    "shield",
    "armor",
    "tool",
    "knife",
    "axe",
    "hammer",
    "rope",
    "chain",
    "lock",
    "key",
    "number",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "hundred",
    "thousand",
    "million",
    "second",
    "third",
    "fourth",
    "fifth",
    "last",
    "true",
    "false",
    "real",
    "fake",
    "whole",
    "half",
    "quarter",
    "plus",
    "minus",
    "game",
    "score",
    "point",
    "level",
    "round",
    "match",
    "here",
    "where",
    "why",
    "same",
    "different",
    "such",
    "another",
    "warning",
    "protocol",
    "integrity",
    "suit",
}

_ASCII_VOWELS = set("aeiouyAEIOUY")
_MOJIBAKE_RE = re.compile(r"[ÃÅÄÂÊËÎÏÔÛŸ�]")
_ENGLISH_WORD_RE = re.compile(r"\b[a-z']+\b")
_TOKEN_RE = re.compile(r"[A-Za-zÀ-ÿ0-9']+")
_CAMEL_TOKEN_RE = re.compile(r"[A-Z]?[a-z]+[A-Z][A-Za-z]*")
_DIGIT_ALPHA_TOKEN_RE = re.compile(r"(?=.*[A-Za-z])(?=.*\d)")
_CONSONANT_CLUSTER_RE = re.compile(r"[bcdfghjklmnpqrstvwxyz]{5,}", re.IGNORECASE)
_SUSPICIOUS_SYMBOL_RE = re.compile(r"[^A-Za-zÀ-ÿ0-9\s.,!?:;'\"%\-]")
_BROKEN_TOKEN_RE = re.compile(
    r"(?:[A-Za-z]{3,}[0-9][A-Za-z0-9]*|[A-Za-z]+(?:[A-Z][a-z]+){1,}|[A-Z]{2,}[a-z]{2,}[A-Za-z]*)"
)
_LOWER_TOKEN_RE = re.compile(r"[a-z']+")
_TIP2_SUSPECT_RE = re.compile(
    r"(?:youcopy|wehave|backand|frombeneath|cock[vx]|frohescort|hkd\b)", re.IGNORECASE
)
_ALPHA_ONLY_RE = re.compile(r"^[A-Za-z]+$")


class JunkFilter:
    @classmethod
    def analyze_text(cls, text: str) -> TextAnalysisResult:
        cleaned = re.sub(r"\s+", " ", str(text or "").strip())
        visible = "".join(ch for ch in cleaned if not ch.isspace())
        visible_length = max(len(visible), 1)

        alpha_count = sum(ch.isalpha() for ch in visible)
        digit_count = sum(ch.isdigit() for ch in visible)
        alpha_ratio = alpha_count / visible_length
        digit_ratio = digit_count / visible_length
        vowel_count = sum(1 for ch in visible if ch in _ASCII_VOWELS)
        vowel_ratio = vowel_count / max(alpha_count, 1)
        mojibake_count = len(_MOJIBAKE_RE.findall(cleaned))
        mojibake_ratio = mojibake_count / visible_length
        suspicious_symbol_count = len(_SUSPICIOUS_SYMBOL_RE.findall(cleaned))
        suspicious_symbol_ratio = suspicious_symbol_count / visible_length

        tokens = _TOKEN_RE.findall(cleaned)
        recognized_words = [
            word
            for word in _ENGLISH_WORD_RE.findall(cleaned.lower())
            if word in COMMON_ENGLISH_WORDS
        ]
        recognized_count = len(recognized_words)
        recognized_ratio = recognized_count / max(len(tokens), 1)

        suspicious_tokens = 0
        broken_token_count = 0
        broken_tokens: list[str] = []
        suspicious_token_list: list[str] = []
        for token in tokens:
            if len(token) < 3:
                continue
            token_is_broken = False
            if _MOJIBAKE_RE.search(token):
                suspicious_tokens += 1
                if len(suspicious_token_list) < 6:
                    suspicious_token_list.append(token)
                token_is_broken = True
            elif _DIGIT_ALPHA_TOKEN_RE.search(token):
                suspicious_tokens += 1
                if len(suspicious_token_list) < 6:
                    suspicious_token_list.append(token)
                token_is_broken = True
            elif _CAMEL_TOKEN_RE.search(token):
                suspicious_tokens += 1
                if len(suspicious_token_list) < 6:
                    suspicious_token_list.append(token)
                token_is_broken = True
            elif (
                token.isalpha()
                and token.lower() not in COMMON_ENGLISH_WORDS
                and _CONSONANT_CLUSTER_RE.search(token)
            ):
                suspicious_tokens += 1
                if len(suspicious_token_list) < 6:
                    suspicious_token_list.append(token)
                token_is_broken = True
            elif _BROKEN_TOKEN_RE.search(token) and not token.isupper():
                token_is_broken = True
            if token_is_broken:
                broken_token_count += 1
                if len(broken_tokens) < 6:
                    broken_tokens.append(token)

        proper_name_like = cls._looks_like_name_sequence(tokens)
        looks_like_sentence = bool(
            cleaned and cleaned[0].isupper() and cleaned[-1] in ".!?:;,"
        )
        unknown_long_alpha_count = cls._count_unknown_long_alpha_tokens(tokens)
        speaker_prefix_suspicious = cls._is_suspicious_speaker_prefix(cleaned)
        tail_tokens = [token for token in tokens[-3:] if len(token) >= 3]
        tail_broken_tokens = [token for token in tail_tokens if token in broken_tokens]
        joined_word_hits = cls._find_joined_word_hits(tokens)
        merged_token_hits = cls._find_merged_token_hits(tokens)
        minor_merge_hits = cls._find_minor_merge_hits(tokens)
        connected_noise_runs, connected_noise_tokens = cls._find_connected_noise(
            tokens, broken_tokens, suspicious_token_list
        )
        malformed_common_word_hits = cls._find_malformed_common_word_hits(tokens)
        tip2_suspect = recognized_count >= 3 and (
            broken_token_count >= 1
            or len(joined_word_hits) >= 1
            or len(merged_token_hits) >= 1
            or len(minor_merge_hits) >= 1
            or (
                len(malformed_common_word_hits) >= 1
                and (broken_token_count >= 1 or suspicious_tokens >= 1)
            )
            or len(tail_broken_tokens) >= 1
            or connected_noise_runs >= 1
            or bool(_TIP2_SUSPECT_RE.search(cleaned))
        )

        health_score = 100
        if alpha_ratio < 0.55:
            health_score -= 45
        if mojibake_count:
            health_score -= min(36, mojibake_count * 12)
        if suspicious_symbol_ratio > 0.08:
            health_score -= 18
        if suspicious_tokens:
            health_score -= min(30, suspicious_tokens * 10)
        if broken_token_count:
            health_score -= min(20, broken_token_count * 6)
        if unknown_long_alpha_count >= 2 and broken_token_count >= 1:
            health_score -= min(18, unknown_long_alpha_count * 5)
        if (
            unknown_long_alpha_count >= 1
            and len(tokens) >= 6
            and recognized_ratio < 0.38
            and broken_token_count >= 1
        ):
            health_score -= 10
        if (
            unknown_long_alpha_count >= 2
            and len(tokens) >= 6
            and recognized_ratio < 0.22
        ):
            health_score -= min(18, unknown_long_alpha_count * 6)
        if speaker_prefix_suspicious and broken_token_count >= 1:
            health_score -= 16
        if merged_token_hits and len(tokens) >= 6 and recognized_ratio < 0.50:
            health_score -= min(20, len(merged_token_hits) * 8)
        if merged_token_hits and unknown_long_alpha_count >= 1 and len(tokens) >= 6:
            health_score -= 8
        if minor_merge_hits and len(tokens) >= 6:
            health_score -= min(10, len(minor_merge_hits) * 4)
        if malformed_common_word_hits and (
            broken_token_count >= 1 or suspicious_tokens >= 1
        ):
            health_score -= min(12, len(malformed_common_word_hits) * 6)
        if connected_noise_runs:
            health_score -= min(24, connected_noise_runs * 12)
        if recognized_count == 0 and len(tokens) >= 2 and not proper_name_like:
            health_score -= 12
        if (
            len(tokens) >= 6
            and recognized_ratio < 0.42
            and broken_token_count >= 1
            and not proper_name_like
        ):
            health_score -= 14
        if (
            vowel_ratio < 0.24
            and recognized_count == 0
            and len(tokens) >= 2
            and not proper_name_like
        ):
            health_score -= 15
        if proper_name_like:
            health_score += 8
        if looks_like_sentence:
            health_score += 6

        health_score = max(0, min(100, health_score))
        if (
            health_score > 75
            and suspicious_tokens == 0
            and broken_token_count == 0
            and not merged_token_hits
            and not minor_merge_hits
        ):
            health_verdict = "safe"
        elif health_score > 60 and suspicious_tokens <= 1 and broken_token_count <= 1:
            health_verdict = "suspicious"
        else:
            health_verdict = "risky"

        return {
            "cleaned": cleaned,
            "tokens": tokens,
            "recognized_words": recognized_words,
            "recognized_count": recognized_count,
            "recognized_ratio": recognized_ratio,
            "alpha_ratio": alpha_ratio,
            "digit_ratio": digit_ratio,
            "vowel_ratio": vowel_ratio,
            "mojibake_count": mojibake_count,
            "mojibake_ratio": mojibake_ratio,
            "suspicious_symbol_ratio": suspicious_symbol_ratio,
            "suspicious_tokens": suspicious_tokens,
            "suspicious_token_list": suspicious_token_list,
            "broken_token_count": broken_token_count,
            "broken_tokens": broken_tokens,
            "tail_broken_tokens": tail_broken_tokens,
            "joined_word_hits": joined_word_hits,
            "merged_token_hits": merged_token_hits,
            "minor_merge_hits": minor_merge_hits,
            "malformed_common_word_hits": malformed_common_word_hits,
            "connected_noise_runs": connected_noise_runs,
            "connected_noise_tokens": connected_noise_tokens,
            "proper_name_like": proper_name_like,
            "looks_like_sentence": looks_like_sentence,
            "unknown_long_alpha_count": unknown_long_alpha_count,
            "speaker_prefix_suspicious": speaker_prefix_suspicious,
            "health_score": health_score,
            "health_verdict": health_verdict,
            "tip2_suspect": tip2_suspect,
        }

    @classmethod
    def is_junk(cls, text: str) -> bool:
        cleaned = str(text or "").strip()

        def reject(reason: str, level: str = "debug") -> bool:
            log_event(
                PREFIX_OCR,
                "011",
                f"Junk rejected ({reason}): {cleaned[:48]!r}",
                level=level,
                throttle_key=f"junk_reject_{cleaned[:24]}",
                throttle_seconds=0.5,
            )
            return True

        if not cleaned or len(cleaned) < 3:
            return reject("too_short")
        if cleaned.isdigit() or len(cleaned) == 1:
            return reject("only_digit_or_single_char")

        analysis = cls.analyze_text(cleaned)
        alpha_ratio = analysis["alpha_ratio"]
        recognized_count = analysis["recognized_count"]
        suspicious_tokens = analysis["suspicious_tokens"]
        broken_token_count = analysis["broken_token_count"]
        mojibake_ratio = analysis["mojibake_ratio"]
        proper_name_like = analysis["proper_name_like"]
        looks_like_sentence = analysis["looks_like_sentence"]
        vowel_ratio = analysis["vowel_ratio"]
        health_score = analysis["health_score"]
        tokens = analysis["tokens"]

        if alpha_ratio < 0.55:
            return reject(f"Tip1_low_alpha_{int(alpha_ratio * 100)}%")
        if re.fullmatch(r"[\W_]+", cleaned):
            return reject("Tip1_only_symbols")
        if re.fullmatch(r"[A-Z\s]+\d*", cleaned):
            return reject("Tip1_all_caps_only")
        if re.search(
            r"\b(gameplay|walkthrough|subscribe|tutorial|episode|part\s+\d+|"
            r"dcbuginfo|fps:|debug|build:|version:|v\d+\.\d+(?:\.\d+)*)\b",
            cleaned,
            re.IGNORECASE,
        ):
            return reject("known_junk_pattern")
        if not re.search(r"[A-Za-zÀ-ÿ]", cleaned):
            return reject("no_letters")
        if mojibake_ratio > 0.08 and recognized_count <= 1 and not proper_name_like:
            return reject("mojibake_heavy")

        is_short = len(cleaned) < 30
        if is_short and recognized_count == 0 and not proper_name_like:
            return reject("Tip3_short_unrecognized")
        if (
            is_short
            and suspicious_tokens >= 1
            and recognized_count <= 1
            and not proper_name_like
            and not looks_like_sentence
        ):
            return reject("Tip3_short_dirty")
        if suspicious_tokens >= 3 and recognized_count <= 1 and not proper_name_like:
            return reject("suspicious_tokens")
        if (
            broken_token_count >= 3
            and recognized_count == 0
            and health_score < 45
            and not proper_name_like
        ):
            return reject("broken_tokens_heavy")
        if (
            len(tokens) >= 6
            and recognized_count >= 4
            and (
                (
                    len(analysis["merged_token_hits"]) >= 1
                    and analysis["recognized_ratio"] < 0.45
                )
                or (
                    len(analysis["malformed_common_word_hits"]) >= 2
                    and (broken_token_count >= 1 or suspicious_tokens >= 1)
                )
                or (broken_token_count >= 2 and suspicious_tokens >= 1)
                or (broken_token_count >= 1 and len(analysis["joined_word_hits"]) >= 2)
                or (analysis["speaker_prefix_suspicious"] and broken_token_count >= 1)
                or (
                    analysis["unknown_long_alpha_count"] >= 2
                    and analysis["recognized_ratio"] < 0.42
                )
            )
            and health_score < 92
            and not proper_name_like
        ):
            return reject("tip2_new_family_dirty")
        if (
            len(cleaned) >= 35
            and len(tokens) >= 6
            and analysis["unknown_long_alpha_count"] >= 1
            and analysis["recognized_ratio"] < 0.32
            and (broken_token_count >= 1 or suspicious_tokens >= 1)
            and health_score < 88
            and not proper_name_like
        ):
            return reject("long_unknown_token_cluster")
        if (
            len(cleaned) >= 40
            and len(tokens) >= 6
            and analysis["unknown_long_alpha_count"] >= 2
            and analysis["recognized_ratio"] < 0.20
            and recognized_count <= 1
            and health_score < 90
            and not proper_name_like
        ):
            return reject("very_low_recognition_long_text")
        if (
            recognized_count == 0
            and len(tokens) >= 2
            and not proper_name_like
            and vowel_ratio < 0.24
            and not looks_like_sentence
        ):
            return reject("letter_salad")

        if len(tokens) >= 3:
            short_tokens = sum(1 for token in tokens if len(token) <= 2)
            if short_tokens >= max(2, len(tokens) // 2):
                return reject("too_many_short_tokens")

        if is_short and recognized_count > 0 and not looks_like_sentence:
            log_event(
                PREFIX_OCR,
                "012",
                (
                    "Tip3_suspicious_but_accepted "
                    f"(recognized={analysis['recognized_words']}, health={analysis['health_score']}, "
                    f"verdict={analysis['health_verdict']}): {cleaned[:48]!r}"
                ),
                level="debug",
                throttle_key=f"junk_accept_suspicious_{cleaned[:24]}",
                throttle_seconds=1.0,
            )

        return False

    @classmethod
    def _find_joined_word_hits(cls, tokens: list[str]) -> list[str]:
        hits: list[str] = []
        for token in tokens:
            lowered = token.lower()
            if len(lowered) < 8 or not lowered.isalpha():
                continue
            if lowered in COMMON_ENGLISH_WORDS:
                continue
            subwords = _LOWER_TOKEN_RE.findall(lowered)
            if not subwords:
                continue
            if lowered in {"doyoucopy", "youcopy", "wehave", "backand", "frombeneath"}:
                hits.append(token)
                continue
            if len(hits) >= 4:
                break
        return hits

    @classmethod
    def _find_merged_token_hits(cls, tokens: list[str]) -> list[str]:
        hits: list[str] = []
        for token in tokens:
            normalized = token.lower().replace("'", "")
            if len(normalized) < 8 or not normalized.isalpha():
                continue
            if token.isupper():
                continue
            if token[:1].isupper() and token[1:].islower():
                continue
            if normalized in COMMON_ENGLISH_WORDS:
                continue
            for split_at in range(3, len(normalized) - 2):
                left = normalized[:split_at]
                right = normalized[split_at:]
                left_known = left in COMMON_ENGLISH_WORDS
                right_known = right in COMMON_ENGLISH_WORDS
                if not (left_known or right_known):
                    continue
                other = right if left_known else left
                if not cls._looks_wordlike_piece(other):
                    continue
                hits.append(token)
                break
            if len(hits) >= 6:
                break
        return hits

    @classmethod
    def _find_minor_merge_hits(cls, tokens: list[str]) -> list[str]:
        hits: list[str] = []
        for token in tokens:
            lowered = token.lower().replace("'", "")
            if len(lowered) < 7 or len(lowered) > 14 or not lowered.isalpha():
                continue
            if token.isupper():
                continue
            if lowered in COMMON_ENGLISH_WORDS:
                continue
            for split_at in range(4, len(lowered) - 2):
                left = lowered[:split_at]
                right = lowered[split_at:]
                if left in COMMON_ENGLISH_WORDS and right in COMMON_ENGLISH_WORDS:
                    hits.append(token)
                    break
            if len(hits) >= 6:
                break
        return hits

    @classmethod
    def _find_connected_noise(
        cls,
        tokens: list[str],
        broken_tokens: list[str],
        suspicious_token_list: list[str],
    ) -> tuple[int, list[str]]:
        noisy = set(broken_tokens) | set(suspicious_token_list)
        runs = 0
        current_run: list[str] = []
        captured: list[str] = []
        for token in tokens:
            if len(token) < 3:
                if len(current_run) >= 2:
                    runs += 1
                    if len(captured) < 6:
                        captured.append(" ".join(current_run[:3]))
                current_run = []
                continue
            if token in noisy:
                current_run.append(token)
                continue
            if len(current_run) >= 2:
                runs += 1
                if len(captured) < 6:
                    captured.append(" ".join(current_run[:3]))
            current_run = []
        if len(current_run) >= 2:
            runs += 1
            if len(captured) < 6:
                captured.append(" ".join(current_run[:3]))
        return runs, captured

    @classmethod
    def _find_malformed_common_word_hits(cls, tokens: list[str]) -> list[str]:
        hits: list[str] = []
        for token in tokens:
            lowered = token.lower()
            if len(lowered) < 7 or not _ALPHA_ONLY_RE.fullmatch(token):
                continue
            if token[:1].isupper() and token[1:].islower():
                continue
            if lowered in COMMON_ENGLISH_WORDS:
                continue
            for split_at in range(3, len(lowered) - 2):
                left = lowered[:split_at]
                right = lowered[split_at:]
                if left in COMMON_ENGLISH_WORDS and right in COMMON_ENGLISH_WORDS:
                    hits.append(token)
                    break
            if len(hits) >= 6:
                break
        return hits

    @classmethod
    def _looks_like_name_sequence(cls, tokens: list[str]) -> bool:
        alpha_tokens = [token for token in tokens if token.isalpha()]
        if len(alpha_tokens) == 1:
            token = alpha_tokens[0]
            return len(token) >= 6 and token[:1].isupper() and token[1:].islower()
        if len(alpha_tokens) < 2 or len(alpha_tokens) > 4:
            return False
        for token in alpha_tokens:
            if len(token) < 2:
                return False
            if _MOJIBAKE_RE.search(token):
                return False
            if not token[:1].isupper():
                return False
            if token[1:] and not token[1:].islower():
                return False
        return True

    @classmethod
    def _count_unknown_long_alpha_tokens(cls, tokens: list[str]) -> int:
        count = 0
        for token in tokens:
            if len(token) < 6 or not token.isalpha():
                continue
            if token.lower() in COMMON_ENGLISH_WORDS:
                continue
            if token[:1].isupper() and token[1:].islower():
                continue
            count += 1
        return count

    @classmethod
    def _is_suspicious_speaker_prefix(cls, text: str) -> bool:
        cleaned = str(text or "").strip()
        if ":" not in cleaned:
            return False
        prefix = cleaned.split(":", 1)[0].strip()
        if not prefix or len(prefix) > 28:
            return False
        if re.fullmatch(r"[A-Z0-9 .'\-]{2,28}", prefix):
            return False
        if re.fullmatch(r"[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}", prefix):
            return False
        return bool(re.search(r"[a-z]", prefix) and re.search(r"[A-Z]", prefix))

    @classmethod
    def _looks_wordlike_piece(cls, token: str) -> bool:
        if len(token) < 3 or not token.isalpha():
            return False
        if token in COMMON_ENGLISH_WORDS:
            return True
        vowel_count = sum(1 for ch in token if ch in "aeiouy")
        vowel_ratio = vowel_count / max(len(token), 1)
        if vowel_ratio < 0.20 or vowel_ratio > 0.80:
            return False
        if _CONSONANT_CLUSTER_RE.search(token):
            return False
        return True
