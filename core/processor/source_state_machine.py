from __future__ import annotations

import re
import time
from collections import deque
from dataclasses import dataclass
from difflib import SequenceMatcher

from core.processor.types import TextAnalysisResult


def _normalize_family(text: str) -> str:
    cleaned = str(text or "").strip()
    cleaned = re.sub(r"^[A-ZÀ-ÿ\.\s'\"-]*:\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned.lower()).strip()
    return cleaned


@dataclass(slots=True)
class SourceDecision:
    should_emit: bool
    state: str
    reason: str
    similarity: float
    family_changed: bool
    selected_text: str | None = None
    memory_hit: bool = False
    memory_age_ms: float = 0.0
    memory_reason: str = ""


@dataclass(slots=True)
class DirtyMemoryEntry:
    family: str
    text: str
    health: int
    recognized: int
    suspicious: int
    broken: int
    connected_noise_runs: int
    seen_at: float
    hit_count: int = 1


class SourceStateMachine:
    def __init__(
        self,
        hold_window_ms: int = 1600,
        memory_ttl_ms: int = 180000,
        memory_limit: int = 24,
    ) -> None:
        self.hold_window_ms = max(300, int(hold_window_ms))
        self.memory_ttl_ms = max(10000, int(memory_ttl_ms))
        self.memory_limit = max(8, int(memory_limit))
        self.reset()

    def configure(self, *, hold_window_ms: int | None = None) -> None:
        if hold_window_ms is not None:
            self.hold_window_ms = max(300, int(hold_window_ms))

    def reset(self) -> None:
        self.state = "NEW_SOURCE"
        self.last_family = ""
        self.last_text = ""
        self.last_seen_at = 0.0
        self.last_emit_at = 0.0
        self.last_health = 0
        self.last_recognized = 0
        self.last_suspicious = 0
        self.last_broken = 0
        self.last_connected_noise = 0
        self.confirm_count = 0
        self.pending_text = ""
        self.pending_family = ""
        self.pending_health = 0
        self.pending_recognized = 0
        self.pending_suspicious = 0
        self.pending_broken = 0
        self.recent_dirty_family_order: deque[str] = deque()
        self.recent_dirty_families: dict[str, DirtyMemoryEntry] = {}

    def consider(
        self, text: str, analysis: TextAnalysisResult, *, now: float | None = None
    ) -> SourceDecision:
        now = float(now if now is not None else time.monotonic())
        family = _normalize_family(text)
        current_health = analysis["health_score"]
        current_recognized = analysis["recognized_count"]
        current_suspicious = analysis["suspicious_tokens"]
        current_broken = analysis["broken_token_count"]
        current_connected_noise = analysis["connected_noise_runs"]
        tip2_suspect = analysis["tip2_suspect"]
        memory_entry, memory_similarity = self._find_dirty_memory_match(family, now)
        memory_hit = memory_entry is not None
        memory_age_ms = (
            ((now - memory_entry.seen_at) * 1000.0) if memory_entry is not None else 0.0
        )
        memory_reason = ""

        if not family:
            return SourceDecision(False, self.state, "empty_family", 0.0, False)

        if memory_entry is not None and self._should_block_from_memory(
            memory_entry,
            current_health=current_health,
            current_recognized=current_recognized,
            current_suspicious=current_suspicious,
            current_broken=current_broken,
            current_connected_noise=current_connected_noise,
            similarity=memory_similarity,
        ):
            memory_entry.hit_count += 1
            self.state = "DIRTIER_VARIANT"
            memory_reason = "session_dirty_memory_block"
            return SourceDecision(
                False,
                self.state,
                memory_reason,
                memory_similarity,
                False,
                text,
                True,
                memory_age_ms,
                memory_reason,
            )

        if self.pending_family and family == self.pending_family:
            similarity = SequenceMatcher(a=self.pending_family, b=family).ratio()
            self._refresh_pending(
                text,
                family,
                current_health,
                current_recognized,
                current_suspicious,
                current_broken,
                now,
            )
            self.confirm_count += 1
            if tip2_suspect and self.confirm_count < 2:
                self.state = "CONFIRMING"
                return SourceDecision(
                    False,
                    self.state,
                    "tip2_confirming_wait",
                    similarity,
                    False,
                    None,
                    memory_hit,
                    memory_age_ms,
                    memory_reason,
                )
            selected = self.pending_text or text
            self._accept(
                selected,
                family,
                self.pending_health or current_health,
                self.pending_recognized or current_recognized,
                self.pending_suspicious or current_suspicious,
                self.pending_broken or current_broken,
                current_connected_noise,
                now,
            )
            self.state = "HELD"
            self._remember_dirty_family(
                selected,
                family,
                self.pending_health or current_health,
                self.pending_recognized or current_recognized,
                self.pending_suspicious or current_suspicious,
                self.pending_broken or current_broken,
                analysis["connected_noise_runs"],
                now,
            )
            return SourceDecision(
                True,
                self.state,
                "tip2_confirmed_best",
                similarity,
                False,
                selected,
                memory_hit,
                memory_age_ms,
                memory_reason,
            )

        if not self.last_family:
            if tip2_suspect:
                self._remember_pending(
                    text,
                    family,
                    current_health,
                    current_recognized,
                    current_suspicious,
                    current_broken,
                    now,
                )
                self.state = "CONFIRMING"
                return SourceDecision(
                    False,
                    self.state,
                    "tip2_hold_first_sighting",
                    1.0,
                    True,
                    None,
                    memory_hit,
                    memory_age_ms,
                    memory_reason,
                )
            self._accept(
                text,
                family,
                current_health,
                current_recognized,
                current_suspicious,
                current_broken,
                current_connected_noise,
                now,
            )
            self.state = "NEW_SOURCE"
            self._clear_dirty_family(family)
            return SourceDecision(
                True,
                self.state,
                "new_source",
                1.0,
                True,
                text,
                memory_hit,
                memory_age_ms,
                memory_reason,
            )

        similarity = SequenceMatcher(a=self.last_family, b=family).ratio()
        family_changed = not self._is_same_family(self.last_family, family, similarity)
        if family_changed:
            if tip2_suspect:
                self._remember_pending(
                    text,
                    family,
                    current_health,
                    current_recognized,
                    current_suspicious,
                    current_broken,
                    now,
                )
                self.state = "CONFIRMING"
                return SourceDecision(
                    False,
                    self.state,
                    "tip2_hold_family_change",
                    similarity,
                    True,
                    None,
                    memory_hit,
                    memory_age_ms,
                    memory_reason,
                )
            self._accept(
                text,
                family,
                current_health,
                current_recognized,
                current_suspicious,
                current_broken,
                current_connected_noise,
                now,
            )
            self.state = "NEW_SOURCE"
            self._clear_dirty_family(family)
            return SourceDecision(
                True,
                self.state,
                "family_changed",
                similarity,
                True,
                text,
                memory_hit,
                memory_age_ms,
                memory_reason,
            )

        self.last_seen_at = now
        self.confirm_count += 1

        if self._should_protect_previous_better_source(
            current_health=current_health,
            current_recognized=current_recognized,
            current_suspicious=current_suspicious,
            current_broken=current_broken,
            current_connected_noise=current_connected_noise,
            similarity=similarity,
            family=family,
        ):
            self.state = "HELD"
            return SourceDecision(
                False,
                self.state,
                "protected_previous_better_source",
                similarity,
                False,
                None,
                memory_hit,
                memory_age_ms,
                memory_reason,
            )

        if self._is_dirtier_variant(
            current_health=current_health,
            current_recognized=current_recognized,
            current_suspicious=current_suspicious,
            current_broken=current_broken,
            current_connected_noise=current_connected_noise,
            similarity=similarity,
            family=family,
        ):
            self.state = "DIRTIER_VARIANT"
            self._remember_dirty_family(
                text,
                family,
                current_health,
                current_recognized,
                current_suspicious,
                current_broken,
                current_connected_noise,
                now,
            )
            return SourceDecision(
                False,
                self.state,
                "dirtier_variant",
                similarity,
                False,
                None,
                memory_hit,
                memory_age_ms,
                memory_reason,
            )

        if family == self.last_family:
            if self._is_meaningful_upgrade(
                family, current_health, current_recognized, current_broken
            ):
                self._accept(
                    text,
                    family,
                    current_health,
                    current_recognized,
                    current_suspicious,
                    current_broken,
                    current_connected_noise,
                    now,
                )
                self.state = "HELD"
                self._clear_dirty_family(family)
                return SourceDecision(
                    True,
                    self.state,
                    "meaningful_upgrade",
                    similarity,
                    False,
                    text,
                    memory_hit,
                    memory_age_ms,
                    memory_reason,
                )
            if self._within_hold_window(now):
                self.state = "SLEEPING"
                return SourceDecision(
                    False,
                    self.state,
                    "same_family_hold",
                    similarity,
                    False,
                    None,
                    memory_hit,
                    memory_age_ms,
                    memory_reason,
                )
            self.state = "HELD"
            return SourceDecision(
                False,
                self.state,
                "same_family_idle",
                similarity,
                False,
                None,
                memory_hit,
                memory_age_ms,
                memory_reason,
            )

        self._accept(
            text,
            family,
            current_health,
            current_recognized,
            current_suspicious,
            current_broken,
            current_connected_noise,
            now,
        )
        self.state = "CONFIRMING"
        self._clear_dirty_family(family)
        return SourceDecision(
            True,
            self.state,
            "family_refresh",
            similarity,
            False,
            text,
            memory_hit,
            memory_age_ms,
            memory_reason,
        )

    def _within_hold_window(self, now: float) -> bool:
        return ((now - self.last_emit_at) * 1000.0) < self.hold_window_ms

    def _accept(
        self,
        text: str,
        family: str,
        health: int,
        recognized: int,
        suspicious: int,
        broken: int,
        connected_noise: int,
        now: float,
    ) -> None:
        self.last_text = text
        self.last_family = family
        self.last_seen_at = now
        self.last_emit_at = now
        self.last_health = health
        self.last_recognized = recognized
        self.last_suspicious = suspicious
        self.last_broken = broken
        self.last_connected_noise = connected_noise
        self.confirm_count = 1
        self._clear_pending()

    def _remember_pending(
        self,
        text: str,
        family: str,
        health: int,
        recognized: int,
        suspicious: int,
        broken: int,
        now: float,
    ) -> None:
        self.pending_text = text
        self.pending_family = family
        self.pending_health = health
        self.pending_recognized = recognized
        self.pending_suspicious = suspicious
        self.pending_broken = broken
        self.last_seen_at = now
        self.confirm_count = 1

    def _refresh_pending(
        self,
        text: str,
        family: str,
        health: int,
        recognized: int,
        suspicious: int,
        broken: int,
        now: float,
    ) -> None:
        if family != self.pending_family:
            self._remember_pending(
                text, family, health, recognized, suspicious, broken, now
            )
            return
        better = False
        if (
            health >= self.pending_health + 6
            and recognized >= self.pending_recognized
            and broken <= self.pending_broken
        ):
            better = True
        elif recognized > self.pending_recognized and broken <= self.pending_broken:
            better = True
        elif broken < self.pending_broken and health >= self.pending_health - 4:
            better = True
        if better:
            self.pending_text = text
            self.pending_health = health
            self.pending_recognized = recognized
            self.pending_suspicious = suspicious
            self.pending_broken = broken

    def _clear_pending(self) -> None:
        self.pending_text = ""
        self.pending_family = ""
        self.pending_health = 0
        self.pending_recognized = 0
        self.pending_suspicious = 0
        self.pending_broken = 0

    def _remember_dirty_family(
        self,
        text: str,
        family: str,
        health: int,
        recognized: int,
        suspicious: int,
        broken: int,
        connected_noise_runs: int,
        now: float,
    ) -> None:
        entry = DirtyMemoryEntry(
            family=family,
            text=text,
            health=health,
            recognized=recognized,
            suspicious=suspicious,
            broken=broken,
            connected_noise_runs=connected_noise_runs,
            seen_at=now,
        )
        if family in self.recent_dirty_families:
            try:
                self.recent_dirty_family_order.remove(family)
            except ValueError:
                pass
        self.recent_dirty_families[family] = entry
        self.recent_dirty_family_order.append(family)
        self._prune_dirty_memory(now)

    def _clear_dirty_family(self, family: str) -> None:
        if family not in self.recent_dirty_families:
            return
        self.recent_dirty_families.pop(family, None)
        try:
            self.recent_dirty_family_order.remove(family)
        except ValueError:
            pass

    def _prune_dirty_memory(self, now: float) -> None:
        ttl_seconds = self.memory_ttl_ms / 1000.0
        while self.recent_dirty_family_order:
            head = self.recent_dirty_family_order[0]
            entry = self.recent_dirty_families.get(head)
            if entry is None:
                self.recent_dirty_family_order.popleft()
                continue
            if (now - entry.seen_at) <= ttl_seconds and len(
                self.recent_dirty_families
            ) <= self.memory_limit:
                break
            self.recent_dirty_family_order.popleft()
            self.recent_dirty_families.pop(head, None)

    def _find_dirty_memory_match(
        self, family: str, now: float
    ) -> tuple[DirtyMemoryEntry | None, float]:
        self._prune_dirty_memory(now)
        best_entry: DirtyMemoryEntry | None = None
        best_similarity = 0.0
        for known_family in self.recent_dirty_family_order:
            entry = self.recent_dirty_families.get(known_family)
            if entry is None:
                continue
            similarity = SequenceMatcher(a=known_family, b=family).ratio()
            if similarity >= 0.86 and similarity > best_similarity:
                best_entry = entry
                best_similarity = similarity
        return best_entry, best_similarity

    def _should_block_from_memory(
        self,
        entry: DirtyMemoryEntry,
        *,
        current_health: int,
        current_recognized: int,
        current_suspicious: int,
        current_broken: int,
        current_connected_noise: int,
        similarity: float,
    ) -> bool:
        if similarity < 0.86:
            return False
        if (
            current_broken == 0
            and current_suspicious == 0
            and current_connected_noise == 0
        ):
            return False
        improved = (
            current_health >= entry.health + 10
            or current_recognized > entry.recognized
            or current_broken < entry.broken
            or current_connected_noise < entry.connected_noise_runs
        )
        if improved:
            return False
        if (
            current_health <= entry.health + 4
            and current_suspicious >= entry.suspicious
        ):
            return True
        if (
            current_broken >= entry.broken
            and current_connected_noise >= entry.connected_noise_runs
        ):
            return True
        return False

    def _is_same_family(self, previous: str, current: str, similarity: float) -> bool:
        shorter = min(len(previous), len(current))
        if shorter >= 80:
            threshold = 0.68
        elif shorter >= 48:
            threshold = 0.72
        elif shorter >= 24:
            threshold = 0.78
        else:
            threshold = 0.82
        return similarity >= threshold

    def _is_dirtier_variant(
        self,
        *,
        current_health: int,
        current_recognized: int,
        current_suspicious: int,
        current_broken: int,
        current_connected_noise: int,
        similarity: float,
        family: str,
    ) -> bool:
        if similarity < 0.72:
            return False
        if current_health + 6 < self.last_health:
            if (
                current_recognized <= self.last_recognized
                and current_suspicious >= self.last_suspicious
            ):
                return True
            if current_broken > self.last_broken:
                return True
        if (
            family == self.last_family
            and current_health <= self.last_health - 4
            and current_broken > self.last_broken
        ):
            return True
        if (
            family == self.last_family
            and current_connected_noise > self.last_connected_noise
            and current_health <= self.last_health
        ):
            return True
        return False

    def _should_protect_previous_better_source(
        self,
        *,
        current_health: int,
        current_recognized: int,
        current_suspicious: int,
        current_broken: int,
        current_connected_noise: int,
        similarity: float,
        family: str,
    ) -> bool:
        if family != self.last_family:
            return False
        if similarity < 0.90:
            return False
        if self.last_health < 84:
            return False
        if current_health >= self.last_health - 6:
            return False
        if current_recognized < self.last_recognized:
            return True
        if current_broken > self.last_broken:
            return True
        if current_suspicious > self.last_suspicious:
            return True
        if current_connected_noise > self.last_connected_noise:
            return True
        return False

    def _is_meaningful_upgrade(
        self, family: str, health: int, recognized: int, broken: int
    ) -> bool:
        if family == self.last_family:
            if (
                health >= self.last_health + 8
                and recognized >= self.last_recognized
                and broken <= self.last_broken
            ):
                return True
            return False
        if self.last_family in family and len(family) >= len(self.last_family) + 8:
            return True
        return False
