import cv2
import numpy as np

from core.processor.image_processor import ImageProcessor


class ConfigurableImageProcessor(ImageProcessor):
    """Canli kalibrasyon icin goruntu isleme parametrelerini override eden islemci."""

    def __init__(self, config: dict) -> None:
        super().__init__()
        self.cfg = config

    def _build_text_mask(self, image: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        v_min = int(self.cfg.get("white_v_min", 110))
        white = cv2.inRange(hsv, np.array([0, 0, v_min]), np.array([180, 65, 255]))
        yellow = cv2.inRange(hsv, np.array([15, 60, 130]), np.array([45, 255, 255]))
        mask = cv2.bitwise_or(white, yellow)
        return cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)

    def _process_floating(
        self, enhanced: np.ndarray, text_mask: np.ndarray
    ) -> np.ndarray:
        gauss_c = int(self.cfg.get("floating_gaussian_c", 8))
        mean_c = int(self.cfg.get("floating_mean_c", 6))

        adaptive_gauss = cv2.adaptiveThreshold(
            enhanced,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            gauss_c,
        )
        adaptive_mean = cv2.adaptiveThreshold(
            enhanced, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 25, mean_c
        )

        combined = cv2.bitwise_or(adaptive_gauss, adaptive_mean)
        processed = cv2.morphologyEx(
            combined, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)
        )
        if float(np.mean(text_mask > 0)) >= 0.0015:
            processed = cv2.max(processed, text_mask)
        return cv2.morphologyEx(processed, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    def process(
        self, image: np.ndarray, scene_mode: str = "striped"
    ) -> tuple[np.ndarray, int]:
        try:
            height, width = image.shape[:2]
            is_large_frame = width > 600 or height > 360
            if is_large_frame:
                max_w = 960
                if width > max_w:
                    scale = max_w / width
                    img_resized = cv2.resize(
                        image,
                        (max_w, max(int(height * scale), 1)),
                        interpolation=cv2.INTER_AREA,
                    )
                else:
                    img_resized = image.copy()
            else:
                img_resized = cv2.resize(
                    image, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC
                )

            gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
            d = int(self.cfg.get("bilateral_d", 9))
            blur = cv2.bilateralFilter(gray, d, 75, 75)

            clip_limit = (
                float(self.cfg.get("clahe_clip_floating", 3.5))
                if scene_mode == "floating"
                else float(self.cfg.get("clahe_clip_striped", 2.0))
            )
            tile_size = 10 if scene_mode == "floating" else 8
            clahe = cv2.createCLAHE(
                clipLimit=clip_limit, tileGridSize=(tile_size, tile_size)
            )
            enhanced = clahe.apply(blur)
            text_mask = self._build_text_mask(img_resized)

            contrast = float(np.std(enhanced))
            bright_ratio = float(np.mean(enhanced > 170))
            dark_ratio = float(np.mean(enhanced < 85))

            if scene_mode == "striped":
                processed = self._process_striped(enhanced, text_mask)
            elif scene_mode == "floating":
                processed = self._process_floating(enhanced, text_mask)
            elif contrast < 38:
                processed = self._process_floating(enhanced, text_mask)
            elif bright_ratio > 0.18 and dark_ratio > 0.36:
                processed = self._process_striped(enhanced, text_mask)
            else:
                processed = cv2.fastNlMeansDenoising(enhanced, None, 10, 7, 21)
                processed = cv2.morphologyEx(
                    processed, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8)
                )

            if scene_mode == "striped" and float(np.mean(text_mask > 0)) < 0.003:
                # Semi-transparent subtitle bands often need stronger local separation.
                boosted = cv2.addWeighted(
                    enhanced, 1.35, cv2.GaussianBlur(enhanced, (0, 0), 1.0), -0.35, 0
                )
                processed = cv2.max(
                    processed,
                    cv2.threshold(boosted, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[
                        1
                    ],
                )

            bg_intensity = int(np.mean(processed) > 127)
            return processed, bg_intensity
        except Exception as exc:
            self.logger.error(f"[DBG-012] Goruntu isleme hatasi: {exc}")
            return image, 1
