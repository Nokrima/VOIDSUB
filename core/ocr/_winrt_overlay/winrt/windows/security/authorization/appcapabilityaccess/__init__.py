from __future__ import annotations

import enum


class AppCapabilityAccessStatus(enum.IntEnum):
    DENIED_BY_SYSTEM = 0
    NOT_DECLARED_BY_APP = 1
    DENIED_BY_USER = 2
    USER_PROMPT_REQUIRED = 3
    ALLOWED = 4
