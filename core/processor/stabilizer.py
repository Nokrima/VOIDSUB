from __future__ import annotations


class TextStabilizer:
    """
    Geriye donuk uyumluluk kabugu.
    SlotManager artik sample toplama ve karar verme isini yonetir.
    """

    def push(
        self, text: str, min_samples: int | None = None, force: bool = False
    ) -> str | None:
        candidate = str(text or "").strip()
        if not candidate:
            return None
        if force:
            return candidate
        return None

    def reset(self) -> None:
        return None
