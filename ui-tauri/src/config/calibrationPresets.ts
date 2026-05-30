export type SceneMode = "striped" | "floating";
export type PerformanceTier =
  | "economy"
  | "standard"
  | "performance"
  | "maximum";

export interface CalibrationRuntimeValues {
  quality_threshold: number;
  min_text_chars: number;
  scene_fit_threshold: number;
  variant_budget: number;
  stabilizer_min_samples: number;
  clahe_clip_striped: number;
  clahe_clip_floating: number;
  bilateral_d: number;
  white_v_min: number;
  floating_gaussian_c: number;
  floating_mean_c: number;
  ocr_filters_enabled: boolean;
}

const CALIBRATION_PRESETS: Record<
  SceneMode,
  Record<PerformanceTier, CalibrationRuntimeValues>
> = {
  striped: {
    economy: {
      quality_threshold: 38,
      min_text_chars: 12,
      scene_fit_threshold: 0.52,
      variant_budget: 2,
      stabilizer_min_samples: 3,
      clahe_clip_striped: 1.5,
      clahe_clip_floating: 2.5,
      bilateral_d: 5,
      white_v_min: 118,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: true,
    },
    standard: {
      quality_threshold: 36,
      min_text_chars: 12,
      scene_fit_threshold: 0.48,
      variant_budget: 3,
      stabilizer_min_samples: 3,
      clahe_clip_striped: 1.8,
      clahe_clip_floating: 2.8,
      bilateral_d: 7,
      white_v_min: 112,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: true,
    },
    performance: {
      quality_threshold: 34,
      min_text_chars: 11,
      scene_fit_threshold: 0.45,
      variant_budget: 4,
      stabilizer_min_samples: 2,
      clahe_clip_striped: 2.0,
      clahe_clip_floating: 3.0,
      bilateral_d: 7,
      white_v_min: 108,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: true,
    },
    maximum: {
      quality_threshold: 33,
      min_text_chars: 10,
      scene_fit_threshold: 0.42,
      variant_budget: 6,
      stabilizer_min_samples: 2,
      clahe_clip_striped: 2.2,
      clahe_clip_floating: 3.2,
      bilateral_d: 7,
      white_v_min: 102,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: true,
    },
  },
  floating: {
    economy: {
      quality_threshold: 39,
      min_text_chars: 12,
      scene_fit_threshold: 0.46,
      variant_budget: 2,
      stabilizer_min_samples: 3,
      clahe_clip_striped: 1.5,
      clahe_clip_floating: 2.5,
      bilateral_d: 5,
      white_v_min: 118,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: false,
    },
    standard: {
      quality_threshold: 37,
      min_text_chars: 12,
      scene_fit_threshold: 0.44,
      variant_budget: 3,
      stabilizer_min_samples: 3,
      clahe_clip_striped: 1.8,
      clahe_clip_floating: 2.8,
      bilateral_d: 7,
      white_v_min: 112,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: false,
    },
    performance: {
      quality_threshold: 35,
      min_text_chars: 11,
      scene_fit_threshold: 0.42,
      variant_budget: 4,
      stabilizer_min_samples: 2,
      clahe_clip_striped: 2.0,
      clahe_clip_floating: 3.0,
      bilateral_d: 7,
      white_v_min: 108,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: false,
    },
    maximum: {
      quality_threshold: 34,
      min_text_chars: 10,
      scene_fit_threshold: 0.4,
      variant_budget: 6,
      stabilizer_min_samples: 2,
      clahe_clip_striped: 2.2,
      clahe_clip_floating: 3.2,
      bilateral_d: 7,
      white_v_min: 102,
      floating_gaussian_c: 8,
      floating_mean_c: 6,
      ocr_filters_enabled: false,
    },
  },
};

export const getCalibrationPreset = (
  mode: SceneMode,
  tier: PerformanceTier,
): CalibrationRuntimeValues => ({ ...CALIBRATION_PRESETS[mode][tier] });

export const applyOcrFilterOverride = (
  values: CalibrationRuntimeValues,
  ocrFiltersEnabled: boolean,
): CalibrationRuntimeValues => ({
  ...values,
  ocr_filters_enabled: ocrFiltersEnabled,
});

export const toRuntimeCalibrationPayload = (
  values: CalibrationRuntimeValues,
) => ({
  ocr_filters_enabled: values.ocr_filters_enabled,
  quality_threshold: values.quality_threshold,
  min_text_chars: values.min_text_chars,
  stabilizer_min_samples: values.stabilizer_min_samples,
  scene_fit_threshold: values.scene_fit_threshold,
  variant_budget: values.variant_budget,
  clahe_clip_striped: values.clahe_clip_striped,
  clahe_clip_floating: values.clahe_clip_floating,
  bilateral_d: values.bilateral_d,
  white_v_min: values.white_v_min,
  floating_gaussian_c: values.floating_gaussian_c,
  floating_mean_c: values.floating_mean_c,
});
