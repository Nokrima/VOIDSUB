from __future__ import annotations

import cv2
import numpy as np

from core.errors import get_logger


class ImageProcessor:
    def __init__(self) -> None:
        self.logger = get_logger()
        self.clahe_clip_striped = 2.0
        self.clahe_clip_floating = 3.5
        self.bilateral_d = 9
        self.white_v_min = 110
        self.floating_gaussian_c = 8
        self.floating_mean_c = 6

    def update_runtime_config(
        self,
        clahe_clip_striped: float | None = None,
        clahe_clip_floating: float | None = None,
        bilateral_d: int | None = None,
        white_v_min: int | None = None,
        floating_gaussian_c: int | None = None,
        floating_mean_c: int | None = None,
    ) -> None:
        if clahe_clip_striped is not None:
            self.clahe_clip_striped = max(0.5, float(clahe_clip_striped))
        if clahe_clip_floating is not None:
            self.clahe_clip_floating = max(0.5, float(clahe_clip_floating))
        if bilateral_d is not None:
            d = max(1, int(bilateral_d))
            self.bilateral_d = d + 1 if d % 2 == 0 else d
        if white_v_min is not None:
            self.white_v_min = max(0, min(255, int(white_v_min)))
        if floating_gaussian_c is not None:
            self.floating_gaussian_c = max(0, int(floating_gaussian_c))
        if floating_mean_c is not None:
            self.floating_mean_c = max(0, int(floating_mean_c))

    def _background_intensity(self, image: np.ndarray) -> int:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        return int(np.mean(gray) > 127)

    def detect_scene_mode(self, image: np.ndarray) -> tuple[str, dict[str, float]]:
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            height = max(gray.shape[0], 1)

            white = cv2.inRange(hsv, np.array([0, 0, 110]), np.array([180, 65, 255]))
            yellow = cv2.inRange(hsv, np.array([15, 60, 130]), np.array([45, 255, 255]))
            text_mask = cv2.bitwise_or(white, yellow)
            text_ratio = float(np.mean(text_mask > 0))

            bottom = gray[int(height * 0.56) :, :]
            bottom_hsv = hsv[int(height * 0.56) :, :]
            bottom_dark_ratio = float(np.mean(bottom < 72)) if bottom.size else 0.0
            row_dark = np.mean(bottom < 72, axis=1) if bottom.size else np.array([0.0])
            dark_band_strength = float(np.max(row_dark)) if row_dark.size else 0.0
            low_sat_ratio = (
                float(np.mean(bottom_hsv[:, :, 1] < 38)) if bottom_hsv.size else 0.0
            )
            translucent_band_hint = (
                float(
                    np.mean((bottom_hsv[:, :, 1] < 46) & (bottom > 30) & (bottom < 140))
                )
                if bottom_hsv.size
                else 0.0
            )
            contrast = float(np.std(gray))

            striped_score = min(
                1.0,
                bottom_dark_ratio * 0.52
                + dark_band_strength * 0.42
                + low_sat_ratio * 0.16
                + translucent_band_hint * 0.28
                + min(text_ratio * 11.0, 0.5),
            )
            floating_score = min(
                1.0, min(text_ratio * 14.0, 0.6) + min(contrast / 58.0, 0.4)
            )

            if striped_score >= floating_score:
                return "striped", {"striped": striped_score, "floating": floating_score}
            return "floating", {"striped": striped_score, "floating": floating_score}
        except Exception as exc:
            self.logger.error(f"[SYS-006] Sahne modu tespiti basarisiz: {exc}")
            return "striped", {"striped": 0.5, "floating": 0.35}

    def _build_text_mask(self, image: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        white = cv2.inRange(
            hsv, np.array([0, 0, self.white_v_min]), np.array([180, 65, 255])
        )
        yellow = cv2.inRange(hsv, np.array([15, 60, 130]), np.array([45, 255, 255]))
        mask = cv2.bitwise_or(white, yellow)
        return cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)

    def _process_striped(
        self, enhanced: np.ndarray, text_mask: np.ndarray
    ) -> np.ndarray:
        processed = cv2.threshold(
            enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )[1]
        if float(np.mean(text_mask > 0)) >= 0.004:
            processed = cv2.max(processed, cv2.bitwise_and(processed, text_mask))
        return cv2.morphologyEx(processed, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    def _process_floating(
        self, enhanced: np.ndarray, text_mask: np.ndarray
    ) -> np.ndarray:
        # Birden fazla esikleme katmani birlestirerek sahne ustu metnini bulmaya calis.
        # Katman 1: Gaussian adaptif esikleme (yerel kontrast)
        adaptive_gauss = cv2.adaptiveThreshold(
            enhanced,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            self.floating_gaussian_c,
        )
        # Katman 2: Mean adaptif esikleme (daha buyuk pencere, farkli hassasiyet)
        adaptive_mean = cv2.adaptiveThreshold(
            enhanced,
            255,
            cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY,
            25,
            self.floating_mean_c,
        )
        # Iki esikleme sonucunun en iyi piksellerini birlesit.
        combined = cv2.bitwise_or(adaptive_gauss, adaptive_mean)
        processed = cv2.morphologyEx(
            combined, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)
        )
        # Renk bazli metin maskesi mevcutsa ekle (beyaz/sari altyazi renkleri).
        if float(np.mean(text_mask > 0)) >= 0.0015:
            processed = cv2.max(processed, text_mask)
        return cv2.morphologyEx(processed, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))

    def prepare_raw(self, image: np.ndarray) -> np.ndarray:
        height, width = image.shape[:2]

        # Geniş ama kısa (altyazı bandı gibi) alanları veya genel olarak küçük alanları OCR netliği için büyüt
        if height <= 160 or (width <= 600 and height <= 360):
            return cv2.resize(
                image, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC
            )

        # Aksi takdirde büyük karedir
        max_w = 1280
        if width > max_w:
            scale = max_w / width
            new_w = max_w
            new_h = max(int(height * scale), 1)
            return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return image.copy()

    def _focus_text_region(self, image: np.ndarray) -> np.ndarray:
        try:
            prepared = self.prepare_raw(image)
            gray = cv2.cvtColor(prepared, cv2.COLOR_BGR2GRAY)
            hsv = cv2.cvtColor(prepared, cv2.COLOR_BGR2HSV)
            height, width = gray.shape[:2]

            white_mask = cv2.inRange(
                hsv, np.array([0, 0, 120]), np.array([180, 70, 255])
            )
            yellow_mask = cv2.inRange(
                hsv, np.array([12, 50, 120]), np.array([48, 255, 255])
            )
            text_mask = cv2.bitwise_or(white_mask, yellow_mask)

            bright_mask = cv2.threshold(gray, 148, 255, cv2.THRESH_BINARY)[1]
            edge_mask = cv2.Canny(gray, 60, 140)
            merged = cv2.bitwise_or(text_mask, bright_mask)
            merged = cv2.bitwise_or(merged, edge_mask)
            merged = cv2.morphologyEx(
                merged, cv2.MORPH_CLOSE, np.ones((3, 9), np.uint8), iterations=2
            )

            coords = cv2.findNonZero(merged)
            if coords is None:
                return prepared

            x, y, w, h = cv2.boundingRect(coords)
            if w * h < max(900, int(width * height * 0.004)):
                return prepared

            pad_x = max(18, int(w * 0.12))
            pad_y = max(12, int(h * 0.45))
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(width, x + w + pad_x)
            y2 = min(height, y + h + pad_y)
            focused = prepared[y1:y2, x1:x2]
            if focused.size == 0:
                return prepared
            return focused
        except Exception as exc:
            self.logger.error(f"[SYS-008] Metin odak kirpmasi basarisiz: {exc}")
            return self.prepare_raw(image)

    def process(
        self, image: np.ndarray, scene_mode: str = "striped"
    ) -> tuple[np.ndarray, int]:
        try:
            height, width = image.shape[:2]

            # Boyut normalizasyonu:
            # Geniş ama kısa (altyazı bandı gibi) alanları veya genel olarak küçük alanları OCR netliği için büyüt
            if height <= 160 or (width <= 600 and height <= 360):
                img_resized = cv2.resize(
                    image, (width * 2, height * 2), interpolation=cv2.INTER_CUBIC
                )
            else:
                max_w = 1280
                if width > max_w:
                    scale = max_w / width
                    new_w = max_w
                    new_h = max(int(height * scale), 1)
                    img_resized = cv2.resize(
                        image, (new_w, new_h), interpolation=cv2.INTER_AREA
                    )
                else:
                    img_resized = image.copy()

            gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
            blur = cv2.bilateralFilter(gray, self.bilateral_d, 75, 75)
            # Floating modda kontrast takviyesini artir — oyun ici metin genellikle dusuk kontrastli.
            clip_limit = (
                self.clahe_clip_floating
                if scene_mode == "floating"
                else self.clahe_clip_striped
            )
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
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

            bg_intensity = int(np.mean(processed) > 127)
            return processed, bg_intensity
        except Exception as exc:
            self.logger.error(f"[SYS-005] Goruntu isleme hatasi: {exc}")
            return image, 1

    def process_variants(
        self,
        image: np.ndarray,
        scene_mode: str = "striped",
        filters_enabled: bool = True,
    ) -> tuple[str, dict[str, float], list[tuple[str, np.ndarray, int]]]:
        variants: list[tuple[str, np.ndarray, int]] = []
        detected_mode, scene_scores = self.detect_scene_mode(image)
        preferred_mode = (
            scene_mode if scene_mode in {"striped", "floating"} else detected_mode
        )
        raw_prepared = self.prepare_raw(image)
        raw_focused = (
            self._focus_text_region(image)
            if preferred_mode == "floating"
            else raw_prepared
        )

        if not filters_enabled:
            return (
                detected_mode,
                scene_scores,
                [
                    (
                        f"{preferred_mode}:raw-bgr",
                        raw_prepared,
                        self._background_intensity(raw_prepared),
                    ),
                ],
            )

        if preferred_mode == "floating":
            variants.append(
                (
                    f"{preferred_mode}:raw-bgr",
                    raw_prepared,
                    self._background_intensity(raw_prepared),
                )
            )
            if raw_focused.shape[:2] != raw_prepared.shape[:2] or not np.array_equal(
                raw_focused, raw_prepared
            ):
                variants.append(
                    (
                        f"{preferred_mode}:raw-focus",
                        raw_focused,
                        self._background_intensity(raw_focused),
                    )
                )

            try:
                gray_focus = cv2.cvtColor(raw_focused, cv2.COLOR_BGR2GRAY)
                clahe = cv2.createCLAHE(
                    clipLimit=max(1.0, self.clahe_clip_floating), tileGridSize=(8, 8)
                )
                gentle = clahe.apply(gray_focus)
                variants.append(
                    (
                        f"{preferred_mode}:raw-contrast",
                        gentle,
                        int(np.mean(gentle) > 127),
                    )
                )
            except Exception as exc:
                self.logger.error(f"[SYS-009] Raw contrast varyanti basarisiz: {exc}")

        mode_order: list[str] = []
        if scene_scores.get(detected_mode, 0.0) >= 0.58:
            mode_order.append(detected_mode)
        if preferred_mode not in mode_order:
            mode_order.append(preferred_mode)
        alternate_mode = "floating" if preferred_mode == "striped" else "striped"
        if alternate_mode not in mode_order:
            mode_order.append(alternate_mode)

        try:
            for index, mode in enumerate(mode_order):
                processed, bg = self.process(image, mode)
                role = "base" if index == 0 else "recovery"
                variants.append((f"{mode}:{role}", processed, bg))
                if getattr(processed, "ndim", 0) == 2:
                    stroke = cv2.morphologyEx(
                        processed, cv2.MORPH_GRADIENT, np.ones((2, 2), np.uint8)
                    )
                    variants.append(
                        (f"{mode}:stroke", stroke, int(np.mean(stroke) > 127))
                    )
                    tophat = cv2.morphologyEx(
                        processed, cv2.MORPH_TOPHAT, np.ones((3, 3), np.uint8)
                    )
                    variants.append(
                        (f"{mode}:tophat", tophat, int(np.mean(tophat) > 127))
                    )
                    blackhat = cv2.morphologyEx(
                        processed, cv2.MORPH_BLACKHAT, np.ones((3, 3), np.uint8)
                    )
                    variants.append(
                        (f"{mode}:blackhat", blackhat, int(np.mean(blackhat) > 127))
                    )
                    if mode == "striped":
                        inv = cv2.bitwise_not(processed)
                        variants.append(
                            (f"{mode}:inverse", inv, int(np.mean(inv) > 127))
                        )
                        band_emphasis = cv2.GaussianBlur(processed, (0, 0), 0.8)
                        band_emphasis = cv2.addWeighted(
                            processed, 1.45, band_emphasis, -0.45, 0
                        )
                        variants.append(
                            (
                                f"{mode}:band",
                                band_emphasis,
                                int(np.mean(band_emphasis) > 127),
                            )
                        )
                    if mode == "floating":
                        edge = cv2.Canny(processed, 40, 120)
                        variants.append(
                            (f"{mode}:edge", edge, int(np.mean(edge) > 127))
                        )
        except Exception as exc:
            self.logger.error(f"[SYS-007] OCR varyant hazirligi basarisiz: {exc}")

        deduped: list[tuple[str, np.ndarray, int]] = []
        fingerprints: set[bytes] = set()
        for label, processed, bg_intensity in variants:
            fingerprint = processed.tobytes()[:128]
            if fingerprint in fingerprints:
                continue
            fingerprints.add(fingerprint)
            deduped.append((label, processed, bg_intensity))
        return detected_mode, scene_scores, deduped

    def find_dialog_bubbles(
        self, image: np.ndarray, min_area: int = 4000
    ) -> list[tuple[int, int, int, int]]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(
            closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        return [
            cv2.boundingRect(contour)
            for contour in contours
            if cv2.contourArea(contour) > min_area
        ]  # type: ignore
