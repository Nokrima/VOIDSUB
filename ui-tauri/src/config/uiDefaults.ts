export type AppPerformanceTier = 'economy' | 'standard' | 'performance' | 'maximum';
export type AppTranslationEngine = 'auto' | 'google' | 'offline';
export type OfflineModelKey = 'opus_mt_en_tr' | 'nllb';
export type AppLogLevel = 'debug' | 'info' | 'warning' | 'error';
export type AppSceneMode = 'striped' | 'floating';

export interface AppShortcutsDefaultsShape {
  start_stop: string;
  select_region: string;
  hide_overlay: string;
  temporary_region: string;
}

export interface AppProfileOverlayOverrides {
  mode?: 'fixed';
  font_family?: string;
  font_size?: number;
  font_color?: string;
  font_bold?: boolean;
  alpha?: number;
  bg_visible?: boolean;
}

export interface AppProfileSettingsOverrides {
  minimize_to_tray?: boolean;
  log_level?: AppLogLevel;
  reading_speed_cps?: number;
  src_language?: 'auto' | 'en' | 'tr';
  tgt_language?: 'tr' | 'en';
  shortcuts?: Partial<AppShortcutsDefaultsShape>;
  restore_window_after_region_selection?: boolean;
  start_on_login?: boolean;
}

export interface AppCustomCalibrationProfile {
  id: string;
  name: string;
  mode: AppSceneMode;
  base_tier: AppPerformanceTier;
  values: Record<string, number | boolean>;
  overlay_overrides?: AppProfileOverlayOverrides;
  app_overrides?: AppProfileSettingsOverrides;
}

export interface AppSettingsDefaultsShape {
  minimize_to_tray: boolean;
  log_level: AppLogLevel;
  onboarding_completed: boolean;
  ocr_engine: string;
  ocr_scene_mode: AppSceneMode;
  translation_engine: AppTranslationEngine;
  offline_model_key: OfflineModelKey;
  performance_tier: AppPerformanceTier;
  reading_speed_cps: number;
  last_region: { top: number; left: number; width: number; height: number } | null;
  last_calibration_region: { top: number; left: number; width: number; height: number } | null;
  active_calibration_profile_id: string | null;
  custom_calibration_profiles: AppCustomCalibrationProfile[];
  ocr_filters_enabled: boolean;
  raw_translation_flow_enabled: boolean;
  src_language: 'auto' | 'en' | 'tr';
  tgt_language: 'tr' | 'en';
  shortcuts: AppShortcutsDefaultsShape;
  restore_window_after_region_selection: boolean;
  overlay_snap_to_region: boolean;
}

export const DEFAULT_APP_SETTINGS = {
  minimize_to_tray: false,
  log_level: 'error',
  onboarding_completed: false,
  ocr_engine: 'easy',
  ocr_scene_mode: 'striped',
  translation_engine: 'auto',
  offline_model_key: 'opus_mt_en_tr',
  performance_tier: 'standard',
  reading_speed_cps: 60,
  last_region: null,
  last_calibration_region: null,
  active_calibration_profile_id: null,
  custom_calibration_profiles: [],
  ocr_filters_enabled: true,
  raw_translation_flow_enabled: false,
  src_language: 'auto',
  tgt_language: 'tr',
  shortcuts: {
    start_stop: 'F8',
    select_region: 'F9',
    temporary_region: 'F10',
    hide_overlay: 'F11',
  },
  restore_window_after_region_selection: true,
  overlay_snap_to_region: true,
} satisfies AppSettingsDefaultsShape;

export interface OverlaySettingsDefaultsShape {
  mode: 'fixed';
  font_family: string;
  font_size: number;
  font_color: string;
  font_bold: boolean;
  alpha: number;
  bg_visible: boolean;
}

export const DEFAULT_OVERLAY_SETTINGS = {
  mode: 'fixed',
  font_family: 'Tahoma',
  font_size: 18,
  font_color: '#FDE68A',
  font_bold: false,
  alpha: 0.5,
  bg_visible: true,
} satisfies OverlaySettingsDefaultsShape;
