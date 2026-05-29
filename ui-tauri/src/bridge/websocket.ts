import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Tauri runtime global — not typed in @tauri-apps/api, safe to declare here.
declare global { interface Window { __TAURI_INTERNALS__?: unknown } }

let WS_URL = 'ws://127.0.0.1:27491'; // Fallback / Dev default
let socket: WebSocket | null = null;
let isConnecting = false;
let reconnectTimeout: ReturnType<typeof setTimeout>;

// Bağlantı kesildiğinde biriken mesajlar için güvenlik sınırı.
// Bu limiti aşan paketler sessizce atılır (backpressure).
const MAX_PENDING = 64;
const pendingMessages: string[] = [];

import type {
  AppSettings,
  HardwareResult,
  OverlaySettingsState,
  OfflineStatusResult,
  TranslationPreview,
  TranslationState,
  ErrorPayload,
  EngineRepairResult,
  FallbackPayload,
  OcrFrameStat,
  RegionState
} from './useWebSocket';



export interface RegionSelectedPayload {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  preview_image?: string;
}

export interface WebSocketEventMap {
  'hello': { message: string; hw_info: HardwareResult | Record<string, unknown> };
  'app_settings': { settings: AppSettings | Record<string, unknown> };
  'saved_regions_update': { regions: Record<string, unknown> };
  'app_settings_loaded': AppSettings;
  'hardware_result': HardwareResult;
  'overlay_settings_loaded': OverlaySettingsState;
  'offline_model_status': OfflineStatusResult;
  'new_translation': TranslationPreview;
  'translation_state': TranslationState;
  'engine_change_denied': ErrorPayload;
  'settings_save_failed': ErrorPayload;
  'engine_repair_result': EngineRepairResult;
  'offline_model_error': ErrorPayload;
  'offline_model_complete': Record<string, unknown>;
  'translation_engine_fallback': FallbackPayload;
  'ocr_engine_runtime_fallback': FallbackPayload;
  'ocr_frame_stat': OcrFrameStat;
  'region_selected': RegionState;
  'region_selection_cancelled': void;
  'region_selection_failed': ErrorPayload;
  'async_error': ErrorPayload;
  'log_entry': Record<string, unknown>;
  
  // Outbound / Misc
  'get_settings': void;
  'get_hardware': void;
  'get_offline_status': void;
  'get_overlay_settings': void;
  'update_settings': Record<string, unknown>;
  'save_settings': Record<string, unknown>;
  'change_engine': { engine: string };
  'change_ocr_scene_mode': { mode: string };
  'download_offline_models': { model: string };
  'cancel_offline_models': { model?: string } | void;
  'remove_offline_models': { model: string };
  'offline_model_progress': Record<string, unknown>;
  'offline_model_cancelled': Record<string, unknown>;
  'download_easyocr': void;
  'cancel_easyocr': void;
  'remove_easyocr': void;
  'easyocr_plugin_progress': Record<string, unknown>;
  'easyocr_plugin_complete': Record<string, unknown>;
  'easyocr_plugin_cancelled': Record<string, unknown>;
  'easyocr_plugin_error': Record<string, unknown>;
  'download_cuda': void;
  'cancel_cuda': void;
  'remove_cuda': void;
  'cuda_progress': Record<string, unknown>;
  'cuda_complete': Record<string, unknown>;
  'cuda_cancelled': Record<string, unknown>;
  'cuda_error': Record<string, unknown>;
  'save_overlay_settings': Record<string, unknown>;
  'clear_overlay': void;
  'test_overlay_push': void;
  'request_debug_preview': void;
  'confirm_debug_region': void;
  'set_capture_region': Record<string, unknown>;
  'clear_capture_region': void;
  'request_region_selection': void;
  'repair_engine': { engine: string };
  'shutdown_core': void;
  'start_translation': void;
  'stop_translation': void;
  'set_runtime_region': Record<string, unknown>;
  'calibration_select_region': void;
  'calibration_region_selected': RegionSelectedPayload;
  'calibration_region_cancelled': void;
  'calibration_region_failed': ErrorPayload;
  'temporary_region_state': Record<string, unknown>;
  'temporary_region_selected': RegionSelectedPayload;
  'temporary_region_cancelled': void;
  'temporary_region_failed': ErrorPayload;
  'shortcut_feedback': Record<string, unknown>;
  'toggle_overlay_visibility': void;
  'toggle_temporary_region': void;
  'calibration_preview_request': Record<string, unknown>;
  'calibration_preview_result': Record<string, unknown>;
}

export type EventHandler<T = unknown> = (data: T) => void;

class TypedEventRegistry {
  private listeners: { [K in keyof WebSocketEventMap]?: Set<EventHandler<WebSocketEventMap[K]>> } = {};

  public add<K extends keyof WebSocketEventMap>(event: K, handler: EventHandler<WebSocketEventMap[K]>) {
    if (!this.listeners[event]) {
      // @ts-expect-error - TS cannot verify generic mapped type assignment
      this.listeners[event] = new Set();
    }
    // Using a non-null assertion or safe access to avoid generic casting of the handler itself
    this.listeners[event]!.add(handler);

    return () => {
      const set = this.listeners[event];
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          delete this.listeners[event];
        }
      }
    };
  }

  public dispatch<K extends keyof WebSocketEventMap>(event: K, payload: WebSocketEventMap[K]) {
    const set = this.listeners[event];
    if (set) {
      set.forEach((handler) => handler(payload));
    }
  }
}

const registry = new TypedEventRegistry();
const eventHistory: Record<string, unknown[]> = {};

const pushEventHistory = <K extends keyof WebSocketEventMap>(event: K, payload: WebSocketEventMap[K]) => {
  const limit = event === 'log_entry' ? 500 : 12;
  const next = [...(eventHistory[event] ?? []), payload];
  eventHistory[event] = next.slice(-limit);
};

export const injectEvent = <K extends keyof WebSocketEventMap>(event: K, payload: WebSocketEventMap[K]) => {
  pushEventHistory(event, payload);
  registry.dispatch(event, payload);
};

export const getEventHistory = <K extends keyof WebSocketEventMap>(event: K): WebSocketEventMap[K][] => {
  return [...(eventHistory[event] ?? [])] as WebSocketEventMap[K][];
};

export const clearEventHistory = (event?: keyof WebSocketEventMap) => {
  if (event) {
    delete eventHistory[event];
    return;
  }

  Object.keys(eventHistory).forEach((key) => {
    delete eventHistory[key];
  });
};

const flushPendingMessages = () => {
  while (pendingMessages.length > 0 && socket?.readyState === WebSocket.OPEN) {
    const message = pendingMessages.shift();
    if (message) {
      socket.send(message);
    }
  }
};

const validatePayload = (eventName: string, payload: Record<string, unknown>): boolean => {
  switch (eventName) {
    case 'hello':
      return 'message' in payload && 'hw_info' in payload;
    case 'app_settings':
      return 'settings' in payload;
    case 'saved_regions_update':
      return 'regions' in payload;
    case 'hardware_result':
      return 'cpu' in payload && 'gpu' in payload && 'ram_gb' in payload && Array.isArray(payload.available_engines);
    case 'app_settings_loaded':
      return 'performance_tier' in payload;
    case 'translation_state':
      return 'running' in payload;
    case 'calibration_region_selected':
    case 'region_selected':
    case 'temporary_region_selected':
      return 'x1' in payload && 'y1' in payload && 'x2' in payload && 'y2' in payload;
    case 'new_translation':
      return 'translated_text' in payload;
    case 'ocr_frame_stat':
      return 'fps' in payload;
    case 'engine_change_denied':
    case 'settings_save_failed':
    case 'offline_model_error':
    case 'async_error':
    case 'region_selection_failed':
    case 'calibration_region_failed':
    case 'temporary_region_failed':
    case 'easyocr_plugin_error':
    case 'cuda_error':
      return 'error' in payload;
    case 'translation_engine_fallback':
    case 'ocr_engine_runtime_fallback':
      return 'engine' in payload && 'reason' in payload;
    case 'log_entry':
      return 'message' in payload || 'level' in payload;
    case 'overlay_settings_loaded':
    case 'offline_model_status':
    case 'engine_repair_result':
    case 'offline_model_complete':
    case 'offline_model_progress':
    case 'offline_model_cancelled':
    case 'easyocr_plugin_progress':
    case 'easyocr_plugin_complete':
    case 'easyocr_plugin_cancelled':
    case 'cuda_progress':
    case 'cuda_complete':
    case 'cuda_cancelled':
    case 'region_selection_cancelled':
    case 'calibration_region_cancelled':
    case 'temporary_region_state':
    case 'temporary_region_cancelled':
    case 'shortcut_feedback':
    case 'calibration_preview_result':
      return true;
    default:
      return false; // Outbound-only or unknown events are rejected
  }
};

export const connect = async () => {
  if (socket?.readyState === WebSocket.OPEN || isConnecting) {
    return;
  }

  isConnecting = true;

  try {
    if (window.__TAURI_INTERNALS__) {
      const dynamicPort = await invoke<string>('wait_for_backend');
      console.log(`[Tauri] backend hazir, port: ${dynamicPort}`);
      WS_URL = `ws://127.0.0.1:${dynamicPort}`;
    }
  } catch (err) {
    console.error("Backend beklenirken hata:", err);
    isConnecting = false;
    // Hata mesajını UI'a taşı
    injectEvent('log_entry', { level: 'error', prefix: 'SYS', code: '000', message: String(err) });
    return; // Backend başlamadıysa bağlanmaya çalışma
  }

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log(`Python Core ile baglanti kuruldu (${WS_URL}).`);
    isConnecting = false;
    clearTimeout(reconnectTimeout);
    flushPendingMessages();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const eventName = data.event;
      const payload = data.data ?? {};

      if (!eventName || typeof eventName !== 'string') {
        return;
      }

      // Basic runtime guard
      if (typeof payload !== 'object' || payload === null) {
        console.warn(`[WS] Geçersiz payload formatı (${eventName}). Nesne bekleniyordu.`);
        return;
      }

      if (!validatePayload(eventName, payload as Record<string, unknown>)) {
        console.warn(`[WS] Runtime doğrulama hatası. Olay: ${eventName}, Payload:`, payload);
        return;
      }

      const validEvent = eventName as keyof WebSocketEventMap;
      const validPayload = payload as WebSocketEventMap[keyof WebSocketEventMap];

      pushEventHistory(validEvent, validPayload);
      registry.dispatch(validEvent, validPayload);
    } catch (err) {
      console.error('Gelen paket bozuk:', err);
    }
  };

  socket.onclose = () => {
    console.log('Baglanti koptu. 3 saniye icinde tekrar deneniyor...');
    socket = null;
    isConnecting = false;
    reconnectTimeout = setTimeout(connect, 3000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket hatasi:', err);
    socket?.close();
  };
};

export const disconnect = () => {
  clearTimeout(reconnectTimeout);
  if (socket) {
    socket.onclose = null;
    socket.close(1000, 'ui_disconnect');
    socket = null;
  }
  isConnecting = false;
  pendingMessages.length = 0;
};

export const send = <K extends keyof WebSocketEventMap>(event: K, data?: Record<string, unknown>) => {
  const message = JSON.stringify({ event, data: data ?? {} });

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(message);
    return;
  }

  if (socket?.readyState === WebSocket.CONNECTING || isConnecting || socket === null) {
    if (pendingMessages.length >= MAX_PENDING) {
      console.warn('[WS] Pending queue dolu (%d/%d), mesaj atlandı: %s', pendingMessages.length, MAX_PENDING, event);
      return;
    }
    pendingMessages.push(message);
    return;
  }

  console.warn('Bağlantı hazır değil. Paket gönderilemedi:', event);
};

export const onEvent = <K extends keyof WebSocketEventMap>(event: K, handler: EventHandler<WebSocketEventMap[K]>) => {
  return registry.add(event, handler);
};

export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkConnection = setInterval(() => {
      setIsConnected(socket?.readyState === WebSocket.OPEN);
    }, 1000);

    return () => clearInterval(checkConnection);
  }, []);

  return { send, onEvent, isConnected };
};

export const wsClient = {
  connect,
  disconnect,
  send,
  onEvent,
  getEventHistory,
  clearEventHistory,
  injectEvent,
};
