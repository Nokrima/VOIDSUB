import { CalibrationRuntimeValues } from "../../config/calibrationPresets";
import {
  CalibrationControlKey,
  CalibrationControlConfig,
  ConceptCalibrationSnapshot,
  CalibrationValues,
} from "./CalibrationTypes";
import { calibrationControls } from "./CalibrationConfig";

export const conceptValuesFromRuntime = (
  values: Partial<CalibrationRuntimeValues>,
): CalibrationValues => ({
  sensitivity: Number(
    values.quality_threshold ?? calibrationControls.sensitivity.initial,
  ),
  characters: Number(
    values.min_text_chars ?? calibrationControls.characters.initial,
  ),
  balance: Number(
    values.stabilizer_min_samples ?? calibrationControls.balance.initial,
  ),
  attempts: Number(
    values.variant_budget ?? calibrationControls.attempts.initial,
  ),
  match: Math.round(Number(values.scene_fit_threshold ?? 0.42) * 100),
  claheStriped: Number(
    values.clahe_clip_striped ?? calibrationControls.claheStriped.initial,
  ),
  clahePlain: Number(
    values.clahe_clip_floating ?? calibrationControls.clahePlain.initial,
  ),
  whiteThreshold: Number(
    values.white_v_min ?? calibrationControls.whiteThreshold.initial,
  ),
  bilateral: Number(
    values.bilateral_d ?? calibrationControls.bilateral.initial,
  ),
  gaussianC: Number(
    values.floating_gaussian_c ?? calibrationControls.gaussianC.initial,
  ),
  meanC: Number(values.floating_mean_c ?? calibrationControls.meanC.initial),
});

export const runtimeValuesFromConcept = (
  values: CalibrationValues,
  ocrFiltersEnabled: boolean,
): CalibrationRuntimeValues => ({
  quality_threshold: Number(values.sensitivity),
  min_text_chars: Number(values.characters),
  stabilizer_min_samples: Number(values.balance),
  variant_budget: Number(values.attempts),
  scene_fit_threshold: Number(values.match) / 100,
  clahe_clip_striped: Number(values.claheStriped),
  clahe_clip_floating: Number(values.clahePlain),
  white_v_min: Number(values.whiteThreshold),
  bilateral_d: Number(values.bilateral),
  floating_gaussian_c: Number(values.gaussianC),
  floating_mean_c: Number(values.meanC),
  ocr_filters_enabled: ocrFiltersEnabled,
});

export const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const calibrationValuesMatch = (
  left: CalibrationValues,
  right: CalibrationValues,
) =>
  Object.keys(calibrationControls).every(
    (key) =>
      left[key as CalibrationControlKey] ===
      right[key as CalibrationControlKey],
  );

export const calibrationSnapshotsMatch = (
  left: ConceptCalibrationSnapshot,
  right: ConceptCalibrationSnapshot,
) =>
  left.ocrFiltersEnabled === right.ocrFiltersEnabled &&
  calibrationValuesMatch(left.values, right.values);

export const normalizeCalibrationValue = (
  rawValue: number,
  item: CalibrationControlConfig,
) => {
  const stepped =
    Math.round((rawValue - item.min) / item.step) * item.step + item.min;
  return Number(
    clampNumber(stepped, item.min, item.max).toFixed(item.decimals ?? 0),
  );
};

export const formatCalibrationValue = (
  value: number,
  item: CalibrationControlConfig,
) => {
  const displayValue =
    item.decimals !== undefined ? value.toFixed(item.decimals) : String(value);
  return `${displayValue} ${item.unit}`;
};

export const qualityColor = (s: number) =>
  s >= 80 ? "#86efac" : s >= 55 ? "#fcd34d" : "#fca5a5";

export const qualityLabel = (s: number) =>
  s >= 80 ? "\u0130yi" : s >= 55 ? "Orta" : "Zay\u0131f";
