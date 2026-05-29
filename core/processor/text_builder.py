from __future__ import annotations

import re
from statistics import median
from typing import Any


def normalize_text(text: Any) -> str:
    cleaned = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", str(text))
    cleaned = re.sub(r"(?:(?<=\s)|^)[\[\]!](?=\s+[A-Za-z])", "I", cleaned)
    bar_chars = r"[|¦ǀ∣❘⎪]"
    cleaned = re.sub(rf"(?<=[a-zçğıöşü]){bar_chars}+(?=[a-zçğıöşü])", "ı", cleaned)
    cleaned = re.sub(rf"{bar_chars}+", "I", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def group_by_line(boxes: list[dict[str, Any]], y_tolerance: int = 12) -> list[list[dict[str, Any]]]:
    if boxes:
        heights = [max(1.0, float(item.get("y2", item["cy"])) - float(item.get("y1", item["cy"]))) for item in boxes]
        median_height = sorted(heights)[len(heights) // 2]
        y_tolerance = max(y_tolerance, int(min(26.0, max(10.0, median_height * 0.65))))
    groups: list[list[dict[str, Any]]] = []
    for box in sorted(boxes, key=lambda item: (item["cy"], item["x"])):
        for group in groups:
            if abs(group[0]["cy"] - box["cy"]) <= y_tolerance:
                group.append(box)
                break
        else:
            groups.append([box])
    return sorted(groups, key=lambda group: min(item["cy"] for item in group))


def detect_speaker_label(line_boxes: list[dict[str, Any]]) -> tuple[str | None, list[dict[str, Any]]]:
    if line_boxes and re.match(r"^[A-Za-z\u00C0-\u017E]+:$", line_boxes[0]["text"]):
        return line_boxes[0]["text"], line_boxes[1:]
    return None, line_boxes


def _entry(result: Any, fallback_y: int) -> dict[str, Any] | None:
    text = normalize_text(result.get("text") if isinstance(result, dict) else (result[1] if len(result) > 1 else ""))
    if not text:
        return None
    bbox = result.get("bbox") if isinstance(result, dict) else result[0]
    if isinstance(bbox, tuple) and len(bbox) == 4:
        x1, y1, x2, y2 = map(float, bbox)
    elif isinstance(bbox, list) and bbox:
        xs = [float(p[0]) for p in bbox if isinstance(p, (list, tuple)) and len(p) >= 2]
        ys = [float(p[1]) for p in bbox if isinstance(p, (list, tuple)) and len(p) >= 2]
        x1, y1, x2, y2 = (min(xs), min(ys), max(xs), max(ys)) if xs and ys else (0.0, float(fallback_y), 0.0, float(fallback_y))
    else:
        x1, y1, x2, y2 = 0.0, float(fallback_y), 0.0, float(fallback_y)
    confidence = 0.0
    if not isinstance(result, dict) and len(result) > 2 and isinstance(result[2], (int, float)):
        confidence = max(0.0, min(1.0, float(result[2]) / 100.0))
    return {
        "text": text,
        "x": x1,
        "x1": x1,
        "x2": x2,
        "cx": (x1 + x2) / 2,
        "cy": (y1 + y2) / 2,
        "y1": y1,
        "y2": y2,
        "confidence": confidence,
    }


def _merge_line_boxes(line_boxes: list[dict[str, Any]]) -> str:
    merged: list[str] = []
    previous_text = ""
    for item in line_boxes:
        current = item["text"].strip()
        if not current:
            continue
        if previous_text and current == previous_text:
            continue
        if merged and current.lower() == merged[-1].lower():
            continue
        if merged:
            last = merged[-1]
            current_norm = normalize_text(current).lower()
            last_norm = normalize_text(last).lower()
            if current_norm and last_norm:
                if current_norm in last_norm:
                    previous_text = current
                    continue
                if last_norm in current_norm:
                    merged[-1] = current
                    previous_text = current
                    continue
        merged.append(current)
        previous_text = current
    return " ".join(merged).strip()


def _dedupe_lines(lines: list[str]) -> list[str]:
    deduped: list[str] = []
    for line in lines:
        normalized = normalize_text(line).lower()
        if not normalized:
            continue
        replaced = False
        for index, existing in enumerate(deduped):
            existing_norm = normalize_text(existing).lower()
            if normalized == existing_norm or normalized in existing_norm:
                replaced = True
                break
            if existing_norm in normalized:
                deduped[index] = line
                replaced = True
                break
        if not replaced:
            deduped.append(line)
    return deduped


def _block_gap_threshold(line_boxes: list[dict[str, Any]]) -> float:
    widths = [max(1.0, float(item["x2"]) - float(item["x1"])) for item in line_boxes]
    heights = [max(1.0, float(item["y2"]) - float(item["y1"])) for item in line_boxes]
    median_width = median(widths) if widths else 32.0
    median_height = median(heights) if heights else 18.0
    return max(22.0, min(140.0, median_width * 0.9 + median_height * 0.7))


def _split_line_blocks(line_boxes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(line_boxes, key=lambda item: item["x1"])
    if not ordered:
        return []
    gap_threshold = _block_gap_threshold(ordered)
    blocks: list[list[dict[str, Any]]] = [[ordered[0]]]
    previous = ordered[0]
    for item in ordered[1:]:
        gap = float(item["x1"]) - float(previous["x2"])
        if gap > gap_threshold:
            blocks.append([item])
        else:
            blocks[-1].append(item)
        previous = item
    merged_blocks: list[dict[str, Any]] = []
    for block in blocks:
        block_text = _merge_line_boxes(block)
        if not block_text:
            continue
        merged_blocks.append(
            {
                "text": block_text,
                "x1": min(float(item["x1"]) for item in block),
                "x2": max(float(item["x2"]) for item in block),
                "cx": (min(float(item["x1"]) for item in block) + max(float(item["x2"]) for item in block)) / 2,
                "y1": min(float(item["y1"]) for item in block),
                "y2": max(float(item["y2"]) for item in block),
                "cy": sum(float(item["cy"]) for item in block) / len(block),
                "confidence": sum(float(item.get("confidence", 0.0)) for item in block) / max(len(block), 1),
            }
        )
    return merged_blocks


def _horizontal_overlap_ratio(a: dict[str, Any], b: dict[str, Any]) -> float:
    overlap = max(0.0, min(float(a["x2"]), float(b["x2"])) - max(float(a["x1"]), float(b["x1"])))
    if overlap <= 0:
        return 0.0
    span = min(max(1.0, float(a["x2"]) - float(a["x1"])), max(1.0, float(b["x2"]) - float(b["x1"])))
    return overlap / span


def _block_score(block: dict[str, Any]) -> float:
    text = normalize_text(str(block.get("text", "")))
    alpha_count = sum(char.isalpha() for char in text)
    digit_count = sum(char.isdigit() for char in text)
    punctuation_count = sum((not char.isalnum()) and (not char.isspace()) for char in text)
    alpha_ratio = alpha_count / max(len(text), 1)
    confidence = float(block.get("confidence", 0.0))
    score = len(text) * 0.55 + alpha_count * 0.7 + confidence * 12.0
    if alpha_ratio >= 0.55:
        score += 8.0
    if digit_count and digit_count / max(len(text), 1) > 0.35:
        score -= 10.0
    if punctuation_count and punctuation_count / max(len(text), 1) > 0.25:
        score -= 6.0
    return score


def _select_dominant_block_family(lines: list[list[dict[str, Any]]], region: Any) -> set[tuple[int, int]]:
    families: list[dict[str, Any]] = []
    line_width = float(region.get("width", 0)) if isinstance(region, dict) else 0.0
    for line_index, blocks in enumerate(lines):
        for block_index, block in enumerate(blocks):
            matched_family: dict[str, Any] | None = None
            for family in families:
                overlap = _horizontal_overlap_ratio(block, family)
                center_delta = abs(float(block["cx"]) - float(family["cx"]))
                if overlap >= 0.35 or center_delta <= max(42.0, float(family["width"]) * 0.45):
                    matched_family = family
                    break
            if matched_family is None:
                matched_family = {
                    "cx": float(block["cx"]),
                    "x1": float(block["x1"]),
                    "x2": float(block["x2"]),
                    "width": max(1.0, float(block["x2"]) - float(block["x1"])),
                    "members": [],
                }
                families.append(matched_family)
            matched_family["members"].append((line_index, block_index, block))
            matched_family["cx"] = sum(float(member[2]["cx"]) for member in matched_family["members"]) / len(matched_family["members"])
            matched_family["x1"] = min(float(member[2]["x1"]) for member in matched_family["members"])
            matched_family["x2"] = max(float(member[2]["x2"]) for member in matched_family["members"])
            matched_family["width"] = max(1.0, float(matched_family["x2"]) - float(matched_family["x1"]))

    if not families:
        return set()

    def family_score(family: dict[str, Any]) -> float:
        members = family["members"]
        coverage = len({member[0] for member in members})
        score = sum(_block_score(member[2]) for member in members) + coverage * 9.0
        if line_width > 0 and float(family["width"]) >= line_width * 0.45:
            score += 6.0
        return score

    best_family = max(families, key=family_score)
    selected = {(line_index, block_index) for line_index, block_index, _ in best_family["members"]}

    # Ayni satirdaki konusmaci etiketi bloklarini geri bagla.
    for line_index, blocks in enumerate(lines):
        line_selected = [index for current_line, index in selected if current_line == line_index]
        if not line_selected:
            continue
        first_selected = min(line_selected)
        for block_index, block in enumerate(blocks[:first_selected]):
            if re.match(r"^[A-Za-z\u00C0-\u017E.']+:$", str(block.get("text", "")).strip()):
                selected.add((line_index, block_index))
    return selected


def build_detected_text(ocr_results: list[Any], scene_mode: str, region: Any) -> str:
    _ = scene_mode
    _ = region
    boxes = [entry for index, result in enumerate(ocr_results) if (entry := _entry(result, index * 14)) is not None]
    if not boxes:
        return ""
    lines: list[str] = []
    grouped_lines = [sorted(line, key=lambda item: item["x1"]) for line in group_by_line(boxes)]

    for line in grouped_lines:
        ordered = sorted(line, key=lambda item: item["x1"])
        speaker, rest = detect_speaker_label(ordered)
        body = _merge_line_boxes(rest)
        if speaker and body:
            lines.append(f"{speaker} {body}")
        elif speaker:
            lines.append(speaker)
        elif body:
            lines.append(body)
    lines = _dedupe_lines([line for line in lines if line])
    return "\n".join(lines).strip()

