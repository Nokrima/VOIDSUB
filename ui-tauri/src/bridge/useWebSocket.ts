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
  [key: string]: any;
}

export interface HardwareResult {
  cpu_model?: string;
  ram_gb?: number;
  gpu_available?: boolean;
  [key: string]: any;
}

export interface AppWebSocketBindings {
  onSettings: (data: AppSettings) => void;
  onHardware: (data: HardwareResult) => void;
  onOverlaySettings: (data: OverlaySettingsState) => void;
  onOfflineStatus: (data: any) => void;
  onTranslation: (data: TranslationPreview) => void;
  onTranslationState: (data: TranslationState) => void;
  onEngineDenied: (data: any) => void;
  onSettingsSaveFailed: (data: any) => void;
  onEngineRepair: (data: any) => void;
  onOfflineError: (data: any) => void;
  onOfflineComplete: () => void;
  onTranslationFallback: (data: any) => void;
  onOcrRuntimeFallback: (data: any) => void;
  onFrameStat: (data: OcrFrameStat) => void;
  onRegionSelected: (data: RegionState) => void;
  onRegionCancelled: (data: any) => void;
  onRegionFailed: (data: any) => void;
  onAsyncError: (data: any) => void;
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

    const unsubscribeSettings = onEvent('app_settings_loaded', bindings.onSettings);
    const unsubscribeHardware = onEvent('hardware_result', bindings.onHardware);
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

    wsClient.send('get_settings');
    wsClient.send('get_hardware');
    wsClient.send('get_offline_status');

    return () => {
      unsubscribeSettings();
      unsubscribeHardware();
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
      unsubscribeAsyncError();
      wsClient.disconnect();
    };
  }, []);
}
