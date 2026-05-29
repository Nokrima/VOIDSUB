import {getEventHistory} from '../../bridge/websocket';
import type { HardwareResult, AppSettingsPayload, TranslationStatePayload, OcrFrameStatPayload, OfflineModelDetails, OfflineStatusPayload, OfflineModelAction, EngineHardwareInfo, HealthCheckItem, EngineModelItem, PerfEstimateItem, OfflineLangModelItem, MotorDurumuProps, EngineInfoKey } from './EnginesTypes';
import {EngineInfoDock} from './components/EngineInfoDock';
import {MotorDurumu} from './components/MotorDurumu';

export const getLast = <T,>(items: T[]) => (items.length > 0 ? items[items.length - 1] : undefined);

export const lastHardware = () => (getLast(getEventHistory('hardware_result')) as HardwareResult | undefined) ?? null;

export const lastSettings = () => (getLast(getEventHistory('app_settings_loaded')) as AppSettingsPayload | undefined) ?? {};

export const lastOfflineStatus = () => (getLast(getEventHistory('offline_model_status')) as OfflineStatusPayload | undefined) ?? null;

export const lastFrameStat = () => (getLast(getEventHistory('ocr_frame_stat')) as OcrFrameStatPayload | undefined) ?? null;

export const lastTranslationState = () => (getLast(getEventHistory('translation_state')) as TranslationStatePayload | undefined) ?? {};


export const normalizeOfflineStatus = (status: OfflineStatusPayload | null): OfflineStatusPayload | null => {
  if (!status) return null;
  const normalizedModelsReady = typeof status.models_ready === 'object' && status.models_ready
    ? status.models_ready
    : {};
  const activeModel = typeof status.active_model === 'string' && status.active_model
    ? status.active_model
    : typeof status.active_install_model === 'string' && status.active_install_model
      ? status.active_install_model
      : null;
  const state = String(status.state ?? '').trim().toLowerCase();
  const inferredAction: OfflineStatusPayload['active_action'] =
    state === 'remove'
      ? 'remove'
      : activeModel && (Boolean(status.busy) || state.length > 0)
        ? 'install'
        : null;
  return {
    ...status,
    models_ready: normalizedModelsReady,
    active_model: activeModel,
    active_install_model: activeModel,
    active_action: status.active_action ?? inferredAction,
  };
};


export const buildOfflineActionMap = (status: OfflineStatusPayload | null): Record<string, OfflineModelAction> => {
  if (!status) return {};
  const map: Record<string, OfflineModelAction> = {};
  
  if (status.model_details) {
    for (const [modelId, details] of Object.entries(status.model_details)) {
      if (details.state === 'paused') {
        map[modelId] = {
          type: 'install',
          progress: Math.max(0, Math.min(100, Number(details.percent ?? 0))),
          detail: 'İndirme duraklatıldı.',
          stage: 'paused',
          bytes_label: details.bytes_label || '',
        };
      }
    }
  }

  if (status.queued_models && status.queued_models.length > 0) {
    status.queued_models.forEach(modelId => {
      if (!map[modelId]) {
        const details = status.model_details?.[modelId] || {};
        map[modelId] = {
          type: 'install',
          progress: Math.max(0, Math.min(100, Number(details.percent ?? 0))),
          detail: 'Sırada bekliyor...',
          stage: 'queued',
          bytes_label: details.bytes_label || '',
        };
      }
    });
  }

  if (status.active_model && status.active_action) {
    map[status.active_model] = {
      type: status.active_action,
      progress: Math.max(0, Math.min(100, Number(status.percent ?? 0))),
      detail: status.detail || (status.active_action === 'remove' ? 'Kaldırılıyor...' : 'Kurulum sürüyor...'),
      stage: status.state || (status.active_action === 'remove' ? 'remove' : 'downloading'),
      bytes_label: status.bytes_label || '',
    };
  }
  
  return map;
};

// --- Style Tokens ---

