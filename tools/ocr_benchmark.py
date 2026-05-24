from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2

from config.defaults import BASE_DIR, BENCHMARKS_DIR
from core.ocr.easy_ocr import EasyOCREngine
from core.ocr.windows_ocr import WindowsOCREngine
from core.processor.image_processor import ImageProcessor
from core.processor.quality import TextQualityScorer


def build_engines():
    return {
        "winonly": WindowsOCREngine(),
        "easy": EasyOCREngine(),    }


def benchmark(image_dir: Path) -> dict:
    processor = ImageProcessor()
    image_paths = [path for path in sorted(image_dir.iterdir()) if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp"}]
    engines = build_engines()
    results: dict[str, dict] = {}

    for engine_id, engine in engines.items():
        if not engine.start():
            results[engine_id] = {"available": False, "avg_ms": None, "avg_score": 0, "samples": 0}
            continue
        total_ms = 0.0
        total_score = 0.0
        samples = 0
        for image_path in image_paths:
            image = cv2.imread(str(image_path))
            if image is None:
                continue
            variants = processor.process_variants(image, "striped") + processor.process_variants(image, "floating")
            best_score = 0
            started = time.perf_counter()
            for _, processed, _ in variants:
                ocr_frame = cv2.cvtColor(processed, cv2.COLOR_GRAY2BGR) if getattr(processed, "ndim", 0) == 2 else processed
                text = " ".join(str(item[1]).strip() for item in engine.read(ocr_frame) if len(item) >= 2).strip()
                best_score = max(best_score, TextQualityScorer.score(text))
            total_ms += (time.perf_counter() - started) * 1000
            total_score += best_score
            samples += 1
        engine.stop()
        results[engine_id] = {
            "available": True,
            "avg_ms": round(total_ms / max(1, samples), 2),
            "avg_score": round(total_score / max(1, samples), 2),
            "samples": samples,
        }

    ranked = sorted(
        [item for item in results.items() if item[1]["available"] and item[1]["samples"] > 0],
        key=lambda item: (item[1]["avg_score"], -item[1]["avg_ms"]),
        reverse=True,
    )
    recommended = ranked[0][0] if ranked else ""
    payload = {
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "image_dir": str(image_dir),
        "recommended_engine": recommended,
        "results": results,
    }
    BENCHMARKS_DIR.mkdir(parents=True, exist_ok=True)
    with open(BENCHMARKS_DIR / "latest.json", "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="OCR motorlarini ornek karelerle benchmark et.")
    parser.add_argument("image_dir", nargs="?", default=str(BASE_DIR / "logs" / "ocr_diagnostics"), help="Ornek karelerin bulundugu klasor")
    args = parser.parse_args()
    payload = benchmark(Path(args.image_dir))
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

