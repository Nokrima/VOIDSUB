# Architecture Decisions

## v2.0.0 Pipeline Architecture

**Date:** 2026-05-29
**Subject:** TranslationPipeline Decomposition

### Context
The `TranslationPipeline` class in `core/processor/pipeline.py` currently handles a large amount of state and orchestration logic (1600+ lines). To improve maintainability, it was planned to extract specific domains (Translation Queue management and Overlay Publishing) into separate modules.

### Decision
We have decided that the **Protocol boundary is sufficient** for `v2.0.0`. 
Instead of extracting `TranslationQueueService` and `OverlayPublisherService` as fully separated composition-based classes requiring complex state sharing (event loops, bridge instances, configuration objects), we are utilizing `TranslationQueueMixin` and `OverlayPublisherMixin` combined with Python `Protocol` interfaces.

### Rationale
- The Mixin approach successfully achieves physical file separation (`translation_queue.py` and `overlay_publisher.py`).
- The `Protocol` definitions enforce strict type boundaries without the overhead of deeply nested state passing.
- At this late hardening stage for v2.0.0, refactoring the highly concurrent, state-machine-driven `TranslationPipeline` to strict composition introduces an unacceptable risk of regression. 
- The current Mixin implementation is completely stable and passes all test gates.

### Status
Accepted for `v2.0.0`. Full Service Composition may be revisited in a future major iteration.
