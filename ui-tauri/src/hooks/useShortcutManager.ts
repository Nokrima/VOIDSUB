/**
 * useShortcutManager — Merkezi kısayol yöneticisi hook'u.
 *
 * Tüm global kısayol aksiyonları bu hook üzerinden geçer.
 * - Rust global-shortcut-triggered event'i dinler (TEK giriş noktası)
 * - Ön koşul kontrolü yapar, uygun aksiyonu çalıştırır
 * - Feedback (active/success/error) yönetir
 * - Düzenleme modu için suspend/resume desteği sunar
 * - Settings yüklendiğinde Rust'a güncel kısayolları gönderir
 */

import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { wsClient } from '../bridge/websocket';
import type { AppShortcutsDefaultsShape } from '../config/uiDefaults';

const appWindow = getCurrentWindow();

export type ShortcutAction = keyof AppShortcutsDefaultsShape;
export type ShortcutFeedbackState = 'idle' | 'active' | 'success' | 'error';

// ── Aksiyon etiketleri (Türkçe UI ve log mesajları için) ──
const ACTION_LABELS: Record<ShortcutAction, string> = {
  start_stop: 'Çeviri Başlat/Durdur',
  select_region: 'Bölge Seç',
  hide_overlay: 'Katman Gizle/Göster',
  temporary_region: 'Geçici Alan',
};

// ── Sistem tuşları — kullanıcı bunları atayamaz ──
const BLOCKED_KEYS = new Set([
  'Alt+F4', 'Ctrl+W', 'Ctrl+Q', 'Alt+Tab', 'Ctrl+Alt+Delete',
  'Ctrl+Shift+Q', // uygulama shutdown kısayolu
]);

interface ShortcutManagerDeps {
  /** Mevcut kısayol ayarları */
  shortcuts: AppShortcutsDefaultsShape | undefined;
  /** Çeviri aktif mi? */
  isTranslating: boolean;
  /** Tarama alanı seçili mi? */
  hasSelectedRegion: boolean;
  /** Geçici alan aktif mi? (ref üzerinden) */
  temporaryRegionActiveRef: React.RefObject<boolean>;
  /** Region seçimi sonrası pencereyi restore et */
  restoreAfterRegionSelectionRef: React.MutableRefObject<boolean>;
  /** Geçici alan seçiminden sonra çeviriyi devam ettir */
  resumeTranslationAfterTempSelectRef: React.MutableRefObject<boolean>;
  /** Bildirim göster */
  notify: (tone: 'info' | 'success' | 'warning' | 'error', message: string, dedupeKey?: string) => void;
}

// ── Feedback emitter ──
function emitShortcutFeedback(
  action: ShortcutAction,
  state: ShortcutFeedbackState,
  message?: string,
) {
  const timestamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
  wsClient.injectEvent('shortcut_feedback', { shortcut: action, state, timestamp, message });

  // Log: her tetiklenme
  if (state === 'active') {
    wsClient.injectEvent('log_entry', {
      timestamp,
      level: 'DEBUG',
      prefix: 'SHORTCUT',
      code: 'SK-001',
      message: `Kısayol tetiklendi: ${ACTION_LABELS[action]}`,
    });
  }

  // Log: başarı
  if (state === 'success') {
    wsClient.injectEvent('log_entry', {
      timestamp,
      level: 'INFO',
      prefix: 'SHORTCUT',
      code: 'SK-002',
      message: `Kısayol başarılı: ${ACTION_LABELS[action]}`,
    });
  }

  // Log + notice: hata
  if (state === 'error' && message) {
    wsClient.injectEvent('log_entry', {
      timestamp,
      level: 'WARNING',
      prefix: 'SHORTCUT',
      code: 'SK-003',
      message: `Kısayol engellendi: ${ACTION_LABELS[action]} — ${message}`,
    });
  }
}

// ── Kısayol validasyonu (düzenleme sırasında kullanılır) ──
export function validateShortcutKey(
  newKey: string,
  currentAction: ShortcutAction,
  allShortcuts: AppShortcutsDefaultsShape,
): { valid: boolean; error?: string } {
  // Boş tuş engeli
  if (!newKey || !newKey.trim()) {
    return { valid: false, error: 'Kısayol tuşu boş olamaz.' };
  }

  // Sistem tuşu engeli
  if (BLOCKED_KEYS.has(newKey)) {
    return { valid: false, error: `${newKey} sistem tuşu olduğu için atanamaz.` };
  }

  // Çakışma kontrolü
  for (const [action, assignedKey] of Object.entries(allShortcuts)) {
    if (action === currentAction) continue;
    if (assignedKey.toUpperCase() === newKey.toUpperCase()) {
      return {
        valid: false,
        error: `Bu tuş zaten "${ACTION_LABELS[action as ShortcutAction]}" işlemine atanmış.`,
      };
    }
  }

  return { valid: true };
}

// ── Düzenleme modu: Rust hotkey'leri duraklat/devam ettir ──
export async function suspendHotkeys(): Promise<void> {
  try {
    await invoke('suspend_hotkeys');
  } catch (err) {
    console.warn('[ShortcutManager] suspend_hotkeys failed:', err);
  }
}

export async function resumeHotkeys(): Promise<void> {
  try {
    await invoke('resume_hotkeys');
  } catch (err) {
    console.warn('[ShortcutManager] resume_hotkeys failed:', err);
  }
}

// ── Rust'a güncel kısayolları gönder ──
export async function syncHotkeysToRust(shortcuts: AppShortcutsDefaultsShape): Promise<void> {
  try {
    await invoke('update_hotkeys', { shortcuts });
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    wsClient.injectEvent('log_entry', {
      timestamp,
      level: 'INFO',
      prefix: 'SHORTCUT',
      code: 'SK-010',
      message: `Tuş atamaları güncellendi: ${Object.entries(shortcuts).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    });
  } catch (err) {
    console.warn('[ShortcutManager] update_hotkeys failed:', err);
    wsClient.injectEvent('log_entry', {
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
      level: 'ERROR',
      prefix: 'SHORTCUT',
      code: 'SK-011',
      message: `Global hotkey kaydı başarısız: ${String(err)}`,
    });
  }
}

// ══════════════════════════════════════════════════════════
// ██  ANA HOOK  ██
// ══════════════════════════════════════════════════════════

export function useShortcutManager(deps: ShortcutManagerDeps) {
  const {
    shortcuts,
    isTranslating,
    hasSelectedRegion,
    temporaryRegionActiveRef,
    restoreAfterRegionSelectionRef,
    resumeTranslationAfterTempSelectRef,
    notify,
  } = deps;

  // Stale closure'ları önlemek için ref'ler
  const isTranslatingRef = useRef(isTranslating);
  const hasSelectedRegionRef = useRef(hasSelectedRegion);
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => { isTranslatingRef.current = isTranslating; }, [isTranslating]);
  useEffect(() => { hasSelectedRegionRef.current = hasSelectedRegion; }, [hasSelectedRegion]);
  useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);

  // ── Settings yüklendiğinde/değiştiğinde Rust'a güncel kısayolları gönder ──
  const lastSyncedRef = useRef<string>('');
  useEffect(() => {
    if (!shortcuts) return;
    const key = JSON.stringify(shortcuts);
    if (key === lastSyncedRef.current) return;
    lastSyncedRef.current = key;
    syncHotkeysToRust(shortcuts);
  }, [shortcuts]);

  // ── Aksiyon handler'ları (memoized) ──
  const handleStartStop = useCallback(() => {
    if (!isTranslatingRef.current && !hasSelectedRegionRef.current) {
      emitShortcutFeedback('start_stop', 'error', 'Tarama alanı seçilmeden çeviri başlatılamaz.');
      notify('warning', 'Tarama alanı seçilmeden çeviri başlatılamaz.', 'shortcut:start_stop:no_region');
      return;
    }
    emitShortcutFeedback('start_stop', 'active');
    wsClient.send(isTranslatingRef.current ? 'stop_translation' : 'start_translation');
    window.setTimeout(() => emitShortcutFeedback('start_stop', 'success'), 150);
  }, [notify]);

  const handleSelectRegion = useCallback(async () => {
    if (temporaryRegionActiveRef.current) {
      emitShortcutFeedback('select_region', 'error', 'Geçici alan aktifken ana tarama alanı değiştirilemez.');
      notify('warning', 'Geçici alan aktifken ana tarama alanı değiştirilemez.', 'shortcut:select_region:temp_active');
      return;
    }
    emitShortcutFeedback('select_region', 'active');
    if (isTranslatingRef.current) wsClient.send('stop_translation');
    restoreAfterRegionSelectionRef.current = true;
    await appWindow.hide().catch(() => { restoreAfterRegionSelectionRef.current = false; });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    wsClient.send('request_region_selection');
    window.setTimeout(() => emitShortcutFeedback('select_region', 'success'), 150);
  }, [notify, temporaryRegionActiveRef, restoreAfterRegionSelectionRef]);

  const handleHideOverlay = useCallback(() => {
    if (!isTranslatingRef.current) {
      emitShortcutFeedback('hide_overlay', 'error', 'Çeviri Katmanı gizleme için aktif çeviri gerekir.');
      notify('warning', 'Çeviri Katmanı gizleme için aktif çeviri gerekir.', 'shortcut:hide_overlay:no_translation');
      return;
    }
    emitShortcutFeedback('hide_overlay', 'active');
    wsClient.send('toggle_overlay_visibility');
    window.setTimeout(() => emitShortcutFeedback('hide_overlay', 'success'), 150);
  }, [notify]);

  const handleTemporaryRegion = useCallback(async () => {
    if (temporaryRegionActiveRef.current) {
      // Geçici alan zaten aktif — kapat
      emitShortcutFeedback('temporary_region', 'active');
      wsClient.send('toggle_temporary_region');
      window.setTimeout(() => emitShortcutFeedback('temporary_region', 'success'), 150);
      return;
    }
    if (!hasSelectedRegionRef.current) {
      emitShortcutFeedback('temporary_region', 'error', 'Geçici alan kullanmadan önce ana tarama alanı seçilmelidir.');
      notify('warning', 'Geçici alan kullanmadan önce ana tarama alanı seçilmelidir.', 'shortcut:temporary_region:no_region');
      return;
    }
    emitShortcutFeedback('temporary_region', 'active');
    resumeTranslationAfterTempSelectRef.current = isTranslatingRef.current;
    if (isTranslatingRef.current) wsClient.send('stop_translation');
    restoreAfterRegionSelectionRef.current = true;
    await appWindow.hide().catch(() => { restoreAfterRegionSelectionRef.current = false; });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    wsClient.send('toggle_temporary_region');
    window.setTimeout(() => emitShortcutFeedback('temporary_region', 'success'), 150);
  }, [notify, temporaryRegionActiveRef, hasSelectedRegionRef, resumeTranslationAfterTempSelectRef, restoreAfterRegionSelectionRef]);

  // ── Tauri global-shortcut-triggered listener — TEK giriş noktası ──
  useEffect(() => {
    const unlistenPromise = listen<string>('global-shortcut-triggered', async (event) => {
      const action = event.payload as ShortcutAction;

      // Düzenleme modunda yok say
      if (document.body.dataset.shortcutEditing === 'true') return;

      switch (action) {
        case 'start_stop':
          handleStartStop();
          break;
        case 'select_region':
          await handleSelectRegion();
          break;
        case 'hide_overlay':
          handleHideOverlay();
          break;
        case 'temporary_region':
          await handleTemporaryRegion();
          break;
        default:
          break;
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [handleStartStop, handleSelectRegion, handleHideOverlay, handleTemporaryRegion]);
}
