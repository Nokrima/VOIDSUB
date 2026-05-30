from typing import TypedDict


class TextAnalysisResult(TypedDict):
    cleaned: str
    tokens: list[str]
    recognized_words: list[str]
    recognized_count: int
    recognized_ratio: float
    alpha_ratio: float
    digit_ratio: float
    vowel_ratio: float
    mojibake_count: int
    mojibake_ratio: float
    suspicious_symbol_ratio: float
    suspicious_tokens: int
    suspicious_token_list: list[str]
    broken_token_count: int
    broken_tokens: list[str]
    tail_broken_tokens: list[str]
    joined_word_hits: list[str]
    merged_token_hits: list[str]
    minor_merge_hits: list[str]
    malformed_common_word_hits: list[str]
    connected_noise_runs: int
    connected_noise_tokens: list[str]
    proper_name_like: bool
    looks_like_sentence: bool
    unknown_long_alpha_count: int
    speaker_prefix_suspicious: bool
    health_score: int
    health_verdict: str
    tip2_suspect: bool


class RegionDict(TypedDict, total=False):
    top: int
    left: int
    width: int
    height: int
