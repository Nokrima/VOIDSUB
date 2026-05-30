import core.processor.pipeline as pipe_mod


class ConfigPatcher:
    def __init__(self):
        self.original_methods = {}
        self.original_qt = None

    def apply(self, pipeline, overrides: dict) -> None:
        self.restore(pipeline)
        if not pipeline or not overrides:
            return

        if "quality_threshold" in overrides:
            self.original_qt = getattr(pipe_mod, "QUALITY_THRESHOLD", 40)
            pipe_mod.QUALITY_THRESHOLD = int(overrides["quality_threshold"])

        if "variant_budget" in overrides:
            self.original_methods["profile_value"] = pipeline._profile_value

            def patched_profile_value(key, default=None):
                if key == "variant_budget":
                    return int(overrides["variant_budget"])
                return self.original_methods["profile_value"](key, default)

            pipeline._profile_value = patched_profile_value

        if "stabilizer_min_samples" in overrides:
            self.original_methods["stabilizer_push"] = pipeline.stabilizer.push

            def patched_stabilizer_push(text, min_samples=None, force=False):
                if not force or min_samples is None:
                    min_samples = int(overrides["stabilizer_min_samples"])
                return self.original_methods["stabilizer_push"](
                    text, min_samples=min_samples, force=force
                )

            pipeline.stabilizer.push = patched_stabilizer_push

        if "scene_fit_threshold" in overrides:
            self.original_methods["should_skip"] = pipeline._should_skip_refine

            def patched_should_skip(frame_id, payload):
                scene_fit = 0.45
                if payload:
                    scene_fit = payload.get("scene_fit", 0.45)
                    diff = float(overrides["scene_fit_threshold"]) - 0.42
                    payload["scene_fit"] = max(0.0, scene_fit - diff)
                result = self.original_methods["should_skip"](frame_id, payload)
                if payload:
                    payload["scene_fit"] = scene_fit
                return result

            pipeline._should_skip_refine = patched_should_skip

        if "min_text_chars" in overrides:
            self.original_methods["fast_accept"] = pipeline._is_fast_accept

            def patched_fast_accept(payload):
                text_len = len(str(payload.get("text", "")).strip())
                if text_len < int(overrides["min_text_chars"]):
                    return False
                return self.original_methods["fast_accept"](payload)

            pipeline._is_fast_accept = patched_fast_accept

    def restore(self, pipeline) -> None:
        if not pipeline:
            return
        if self.original_qt is not None:
            pipe_mod.QUALITY_THRESHOLD = self.original_qt
            self.original_qt = None

        for key, method in self.original_methods.items():
            if key == "profile_value":
                pipeline._profile_value = method
            elif key == "stabilizer_push":
                pipeline.stabilizer.push = method
            elif key == "should_skip":
                pipeline._should_skip_refine = method
            elif key == "fast_accept":
                pipeline._is_fast_accept = method

        self.original_methods.clear()
