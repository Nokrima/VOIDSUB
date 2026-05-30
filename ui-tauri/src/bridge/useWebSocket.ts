import { useEffect } from 'react';
import { onEvent, wsClient } from './websocket';

export interface TranslationPreview {
  original_text: string;
  translated_text: string;
}

export interface OverlaySettingsState {
  mode: 'waterfall' | 'jump' | 'fixed';
  font_family: string;
  font_size: number;
  font_color: string;
  font_bold: boolean;
  alpha: number;
  bg_visible: boolean;
}

export interface OcrFrameStat {
  engine: string;
  scene_selected: string;
  detected_scene: string;
  quality: number;
  result: 'accepted' | 'rejected' | 'no_text';
  reason: string;
  signal: number;
  variant: string;
}

export interface TranslationState {
  running: boolean;
  loading?: boolean;
  engine?: string;
  reason?: string;
  message?: string;
}

export interface RegionState {
  region: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
}

export interface AppSettings {
  ocr_engine: string;
  translation_engine: string;
  ocr_scene_mode: string;
  [key: string]: unknown;
}

export interface HardwareResult {
  recommended_engine: string;
  available_engines: string[];
  engine_details?: Record<string, { available: boolean; reason: string; repair_available?: boolean; repair_kind?: string | null }>;
  cpu: { name: string; cores: number; threads: number };
  gpu: { available: boolean; name: string };
  ram_gb: number;
  cuda_available: boolean;
  winrt_available?: boolean;
}

export interface OfflineStatusResult {
  available: boolean;
  busy?: boolean;
  selected_model?: 'opus_mt_en_tr' | 'nllb';
  models_ready?: Record<string, boolean>;
  active_install_model?: string | null;
  active_model?: string | null;
  active_action?: 'install' | 'remove' | null;
  queued_models?: string[];
  state?: string;
  percent?: number;
  detail?: string;
  bytes_label?: string;
  model_details?: Record<string, unknown>;
}

export interface ErrorPayload {
  message?: string;
  reason?: string;
  scope?: string;
  [key: string]: unknown;
}

export interface EngineRepairResult {
  success: boolean;
  engine: string;
  message?: string;
}

export interface FallbackPayload {
  from: string;
  to: string;
  reason?: string;
}

export interface AppWebSocketBindings {
  onSettings: (data: AppSettings) => void;
  onHardware: (data: HardwareResult) => void;
  onOverlaySettings: (data: OverlaySettingsState) => void;
  onOfflineStatus: (data: OfflineStatusResult) => void;
  onTranslation: (data: TranslationPreview) => void;
  onTranslationState: (data: TranslationState) => void;
  onEngineDenied: (data: ErrorPayload) => void;
  onSettingsSaveFailed: (data: ErrorPayload) => void;
  onEngineRepair: (data: EngineRepairResult) => void;
  onOfflineError: (data: ErrorPayload) => void;
  onOfflineComplete: () => void;
  onTranslationFallback: (data: FallbackPayload) => void;
  onOcrRuntimeFallback: (data: FallbackPayload) => void;
  onFrameStat: (data: OcrFrameStat) => void;
  onRegionSelected: (data: RegionState) => void;
  onRegionCancelled: () => void;
  onRegionFailed: (data: ErrorPayload) => void;
  onCalibrationRegionSelected?: (data: RegionState) => void;
  onCalibrationRegionCancelled?: () => void;
  onCalibrationRegionFailed?: (data: ErrorPayload) => void;
  onAsyncError: (data: ErrorPayload) => void;
}

export const translationReasonMessage = (reason: unknown) => {
  const code = String(reason ?? '').trim();
  if (!code) return null;
  const knownMessages: Record<string, string> = {
    engine_unavailable: 'Seçili motor başlatılamadı. Farklı bir motor seçip tekrar deneyin.',
    region_required: 'Çevrilecek alan seçimi yapılmadı.',
  };
  return knownMessages[code] ?? code;
};

export function useAppWebSocket(bindings: AppWebSocketBindings) {
  useEffect(() => {
    wsClient.connect();

    const unsubscribeSettings = onEvent('app_settings', (data) => bindings.onSettings((data as any).settings as AppSettings));
    const unsubscribeSettingsLegacy = onEvent('app_settings_loaded', (data) => bindings.onSettings(data as AppSettings));
    
    const unsubscribeHello = onEvent('hello', (data) => {
      const payload = data as Record<string, any>;
      if (payload && payload.hw_info) {
        bindings.onHardware(payload.hw_info as HardwareResult);
      }
    });
    const unsubscribeHardwareLegacy = onEvent('hardware_result', bindings.onHardware);
    
    const unsubscribeOverlaySettings = onEvent('overlay_settings_loaded', bindings.onOverlaySettings);
    const unsubscribeOfflineStatus = onEvent('offline_model_status', bindings.onOfflineStatus);
    const unsubscribeTranslation = onEvent('new_translation', (data) => bindings.onTranslation(data as TranslationPreview));
    const unsubscribeTranslationState = onEvent('translation_state', bindings.onTranslationState);
    const unsubscribeEngineDenied = onEvent('engine_change_denied', bindings.onEngineDenied);
    const unsubscribeSettingsSaveFailed = onEvent('settings_save_failed', bindings.onSettingsSaveFailed);
    const unsubscribeEngineRepair = onEvent('engine_repair_result', bindings.onEngineRepair);
    const unsubscribeOfflineError = onEvent('offline_model_error', bindings.onOfflineError);
    const unsubscribeOfflineComplete = onEvent('offline_model_complete', bindings.onOfflineComplete);
    const unsubscribeTranslationFallback = onEvent('translation_engine_fallback', bindings.onTranslationFallback);
    const unsubscribeOcrRuntimeFallback = onEvent('ocr_engine_runtime_fallback', bindings.onOcrRuntimeFallback);
    const unsubscribeFrameStat = onEvent('ocr_frame_stat', (data) => bindings.onFrameStat(data as OcrFrameStat));
    const unsubscribeRegionSelected = onEvent('region_selected', bindings.onRegionSelected);
    const unsubscribeRegionCancelled = onEvent('region_selection_cancelled', bindings.onRegionCancelled);
    const unsubscribeRegionFailed = onEvent('region_selection_failed', bindings.onRegionFailed);
    const unsubscribeAsyncError = onEvent('async_error', bindings.onAsyncError);

    const unsubscribeCalibrationSelected = onEvent('calibration_region_selected', (payload) => bindings.onCalibrationRegionSelected?.(payload));
    const unsubscribeCalibrationCancelled = onEvent('calibration_region_cancelled', () => bindings.onCalibrationRegionCancelled?.());
    const unsubscribeCalibrationFailed = onEvent('calibration_region_failed', (payload) => bindings.onCalibrationRegionFailed?.(payload));

    const unsubscribeNativeRegionSelection = onEvent('native_region_selection', (payload: any) => {
      const status = payload.status;
      if (status === 'completed') {
        bindings.onRegionSelected(payload);
      } else if (status === 'cancelled') {
        bindings.onRegionCancelled();
      } else if (status === 'failed') {
        bindings.onRegionFailed(payload);
      }
    });

    wsClient.send('get_settings');
    wsClient.send('get_hardware');
    wsClient.send('get_offline_status');

    return () => {
      unsubscribeSettings();
      unsubscribeSettingsLegacy();
      unsubscribeHello();
      unsubscribeHardwareLegacy();
      unsubscribeOverlaySettings();
      unsubscribeOfflineStatus();
      unsubscribeTranslation();
      unsubscribeTranslationState();
      unsubscribeEngineDenied();
      unsubscribeSettingsSaveFailed();
      unsubscribeEngineRepair();
      unsubscribeOfflineError();
      unsubscribeOfflineComplete();
      unsubscribeTranslationFallback();
      unsubscribeOcrRuntimeFallback();
      unsubscribeFrameStat();
      unsubscribeRegionSelected();
      unsubscribeRegionCancelled();
      unsubscribeRegionFailed();
      unsubscribeCalibrationSelected();
      unsubscribeCalibrationCancelled();
      unsubscribeCalibrationFailed();
      unsubscribeNativeRegionSelection();
      unsubscribeAsyncError();
      wsClient.disconnect();
    };
  }, []);
}
