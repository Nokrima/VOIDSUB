import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { useAppWebSocket, translationReasonMessage, type OcrFrameStat, type OverlaySettingsState, type TranslationPreview } from '../bridge/useWebSocket';
import { onEvent, wsClient } from '../bridge/websocket';
import { FORCE_ONBOARDING_TEST } from '../config/debugFlags';
import { useShortcutManager } from '../hooks/useShortcutManager';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_OVERLAY_SETTINGS,
  type AppCustomCalibrationProfile,
  type AppShortcutsDefaultsShape,
} from '../config/uiDefaults';

const appWindow = getCurrentWindow();
const BOOT_KEY = 'main-window-bootstrapped-v2';

export interface AppSettingsState {
  minimize_to_tray: boolean;
  start_on_login?: boolean;
  restore_window_after_region_selection?: boolean;

  log_level: 'debug' | 'info' | 'warning' | 'error';
  onboarding_completed: boolean;
  ocr_engine: string;
  ocr_scene_mode?: 'striped' | 'floating';
  translation_engine?: 'auto' | 'google' | 'offline';
  offline_model_key?: 'opus_mt_en_tr' | 'nllb';
  performance_tier?: string;
  reading_speed_cps?: number;
  last_region?: { top: number; left: number; width: number; height: number } | null;
  last_calibration_region?: { top: number; left: number; width: number; height: number } | null;
  active_calibration_profile_id?: string | null;
  custom_calibration_profiles?: AppCustomCalibrationProfile[];
  ocr_filters_enabled?: boolean;
  raw_translation_flow_enabled?: boolean;
  src_language?: 'auto' | 'en' | 'tr';
  tgt_language?: 'tr' | 'en';
  app_version?: string;
  shortcuts: AppShortcutsDefaultsShape;
}

export interface UserProfileInfo {
  display_name: string;
  avatar_data_url: string | null;
}

interface HardwareSummary {
  available_engines?: string[];
}

interface OfflineStatusSummary {
  available: boolean;
  busy?: boolean;
  selected_model?: 'opus_mt_en_tr' | 'nllb';
  models_ready?: Record<string, boolean>;
}

interface NoticeItem {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
  dedupeKey?: string;
}

const VALID_OCR_ENGINES = new Set(['easy', 'winonly']);

type AppContextValue = {
  activePage: 'canvasA' | 'canvasB' | 'canvasC' | 'canvasSettings';
  setActivePage: (page: 'canvasA' | 'canvasB' | 'canvasC' | 'canvasSettings') => void;
  isTranslating: boolean;
  isLoadingEngine: boolean;
  hasSelectedRegion: boolean;
  settings: AppSettingsState | null;
  overlaySettings: OverlaySettingsState | null;
  hardware: HardwareSummary | null;
  offlineStatus: OfflineStatusSummary | null;
  forceOnboardingBypassed: boolean;
  setForceOnboardingBypassed: (value: boolean) => void;
  showStartupIntro: boolean;
  setShowStartupIntro: (value: boolean) => void;
  shellVisible: boolean;
  userProfile: UserProfileInfo | null;
  translationPreview: TranslationPreview | null;
  runtimeEngine: string | null;
  ocrFrameStat: OcrFrameStat | null;
  notices: NoticeItem[];
  dismissNotice: (id: number) => void;
  notify: (tone: 'info' | 'success' | 'warning' | 'error', message: string, dedupeKey?: string) => void;
  handleToggleTranslation: () => void;
  handleToggleTranslationWithRegion: (region: { top: number; left: number; width: number; height: number } | null | undefined, missingMessage: string) => void;
  handleStartRegionSelect: () => Promise<void>;
  handleStartCalibrationSelect: () => Promise<void>;
  startupProfileLines: string[];
  shouldRenderStartupIntro: boolean;
  hasCustomizedSettings: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePage, setActivePage] = useState<'canvasA' | 'canvasB' | 'canvasC' | 'canvasSettings'>('canvasA');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isLoadingEngine, setIsLoadingEngine] = useState(false);
  const [hasSelectedRegion, setHasSelectedRegion] = useState(false);
  const [settings, setSettings] = useState<AppSettingsState | null>(null);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettingsState | null>(null);
  const [hardware, setHardware] = useState<HardwareSummary | null>(null);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatusSummary | null>(null);
  const [forceOnboardingBypassed, setForceOnboardingBypassed] = useState(false);
  const [showStartupIntro, setShowStartupIntro] = useState(false);
  const [shellVisible, setShellVisible] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileInfo | null>(null);
  const [translationPreview, setTranslationPreview] = useState<TranslationPreview | null>(null);
  const [runtimeEngine, setRuntimeEngine] = useState<string | null>(null);
  const [ocrFrameStat, setOcrFrameStat] = useState<OcrFrameStat | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const noticeIdRef = useRef(0);
  // activeShortcutsRef kaldırıldı — useShortcutManager yönetiyor
  const startupIntroShownRef = useRef(false);
  const restoreAfterRegionSelectionRef = useRef(false);
  const calibrationRestorePendingRef = useRef(false);
  const resumeTranslationAfterTempSelectRef = useRef(false);
  const isTranslatingRef = useRef(false);
  const hasSelectedRegionRef = useRef(false);
  const temporaryRegionActiveRef = useRef(false);
  const suppressNextRegionToastRef = useRef(false);
  const restoredRegionNoticeShownRef = useRef(false);
  const restoreWindowSettingRef = useRef(true);

  const enqueueNotice = useCallback((tone: NoticeItem['tone'], message: string, dedupeKey?: string) => {
    setNotices((current) => {
      const filtered = dedupeKey ? current.filter((item) => item.dedupeKey !== dedupeKey) : current;
      const duplicate = filtered.find((item) => item.message === message);
      if (duplicate) return filtered;
      return [{ id: ++noticeIdRef.current, tone, message, dedupeKey }, ...filtered].slice(0, 5);
    });
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((item) => item.id !== id));
  }, []);

  const performAppShutdown = async () => {
    wsClient.send('shutdown_core');
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await appWindow.destroy().catch(() => undefined);
  };

  // matchesShortcut, isEditableTarget, emitShortcutFeedback kaldırıldı — useShortcutManager yönetiyor

  const handleToggleTranslation = () => {
    if (!isTranslating && !hasSelectedRegion) {
      enqueueNotice('warning', 'Çeviri başlatmadan önce bu oturumda tarama alanı seçilmelidir.');
      return;
    }
    wsClient.send(isTranslating ? 'stop_translation' : 'start_translation');
  };

  const handleToggleTranslationWithRegion = (
    region: { top: number; left: number; width: number; height: number } | null | undefined,
    missingMessage: string,
  ) => {
    if (isTranslating) {
      wsClient.send('stop_translation');
      return;
    }
    if (!region) {
      enqueueNotice('warning', missingMessage);
      return;
    }
    wsClient.send('set_runtime_region', { region });
    wsClient.send('start_translation');
  };

  const handleStartRegionSelect = async () => {
    if (isTranslating) wsClient.send('stop_translation');
    setTranslationPreview(null);
    restoreAfterRegionSelectionRef.current = true;
    await appWindow.hide().catch(() => { restoreAfterRegionSelectionRef.current = false; });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    wsClient.send('request_region_selection');
  };

  const handleStartCalibrationSelect = async () => {
    if (isTranslating) wsClient.send('stop_translation');
    calibrationRestorePendingRef.current = true;
    await appWindow.hide().catch(() => { calibrationRestorePendingRef.current = false; });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    wsClient.send('calibration_select_region');
  };


  const restoreAfterRegionSelection = async () => {
    if (!restoreAfterRegionSelectionRef.current) return;
    restoreAfterRegionSelectionRef.current = false;
    if (!restoreWindowSettingRef.current) return;
    await invoke('restore_main_window').catch(() => undefined);
    await appWindow.show().catch(() => undefined);
    await appWindow.unminimize().catch(() => undefined);
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    await appWindow.setFocus().catch(() => undefined);
  };

  useEffect(() => {
    invoke<UserProfileInfo>('get_user_profile_info')
      .then((payload) => setUserProfile(payload))
      .catch(() => setUserProfile(null));
  }, []);

  useAppWebSocket({
    onSettings: (data) => {
      const nextSettings = { ...data, ocr_engine: VALID_OCR_ENGINES.has(data.ocr_engine) ? data.ocr_engine : 'easy' };
      setSettings(nextSettings);
      restoreWindowSettingRef.current = nextSettings.restore_window_after_region_selection ?? true;
      if (nextSettings.last_region) {
        localStorage.setItem('has-selected-region', 'true');
        setHasSelectedRegion(true);
        if (!restoredRegionNoticeShownRef.current) {
          suppressNextRegionToastRef.current = true;
          restoredRegionNoticeShownRef.current = true;
          enqueueNotice('info', 'Son seçilen alandan devam ediliyor.');
        }
      } else {
        localStorage.removeItem('has-selected-region');
        setHasSelectedRegion(false);
        restoredRegionNoticeShownRef.current = false;
      }
    },
    onHardware: (data) => setHardware({ ...data, available_engines: (data.available_engines ?? []).filter((engine: string) => VALID_OCR_ENGINES.has(engine)) }),
    onOverlaySettings: (data) => setOverlaySettings(data as OverlaySettingsState),
    onOfflineStatus: (data) => setOfflineStatus({
      available: Boolean(data.available),
      busy: Boolean(data.busy),
      selected_model: (String(data.selected_model ?? 'opus_mt_en_tr').trim().toLowerCase() === 'nllb' ? 'nllb' : 'opus_mt_en_tr'),
      models_ready: typeof data.models_ready === 'object' && data.models_ready ? data.models_ready as Record<string, boolean> : {},
    }),
    onTranslation: (data) => {
      setTranslationPreview(data);
      setIsTranslating(true);
    },
    onTranslationState: (data) => {
      setIsTranslating(Boolean(data.running));
      setIsLoadingEngine(Boolean(data.loading));
      if (data.running) {
        setRuntimeEngine(typeof data.engine === 'string' ? data.engine : null);
        setTranslationPreview(null);
        return;
      }
      setRuntimeEngine(null);
      setTranslationPreview(null);
      
      const reasonKey = (data as { reason?: unknown }).reason;
      if (reasonKey === 'engine_unavailable') {
        setActivePage('canvasC');
        const errDetail = (data as { message?: unknown }).message;
        const msg = errDetail 
          ? `Seçili motor eksik veya bozuk! Detay: ${errDetail}`
          : 'Seçili motor eksik veya bozuk! Lütfen eksik bileşenleri indirin veya onarın.';
        enqueueNotice('error', msg, 'engine_unavailable_redirect');
      } else if (reasonKey === 'capture_unavailable') {
        setActivePage('canvasC');
        const errDetail = (data as { message?: unknown }).message || 'Bilinmeyen hata';
        enqueueNotice('error', `Kritik Uyarı: Ekran yakalama modülü bozuk! Detay: ${errDetail}`, 'capture_unavailable_redirect');
      } else {
        const reasonMessage = translationReasonMessage(reasonKey);
        if (reasonMessage) enqueueNotice('warning', reasonMessage, `translation_state:${reasonMessage}`);
      }
    },
    onEngineDenied: (data) => enqueueNotice('warning', String(data.reason ?? 'Seçilen motor açılamadı.')),
    onSettingsSaveFailed: (data) => {
      const message = String(data.message ?? 'Ayar değişikliği kaydedilemedi.');
      enqueueNotice('warning', message, `settings_save_failed:${message}`);
      wsClient.send('get_settings');
    },
    onEngineRepair: (data) => enqueueNotice(Boolean(data.success) ? 'success' : 'warning', String(data.message ?? 'Motor onarım sonucu alınamadı.')),
    onOfflineError: (data) => enqueueNotice('warning', String(data.message ?? 'Offline model işlemi tamamlanamadı.')),
    onOfflineComplete: () => enqueueNotice('success', 'Offline modeller kullanıma hazır.'),
    onTranslationFallback: (data) => enqueueNotice('warning', `${String(data.from ?? 'bilinmeyen')} yerine ${String(data.to ?? 'yedek motor')} kullanılıyor.`),
    onOcrRuntimeFallback: (data) => {
      const selected = String(data.selected ?? 'Seçili motor');
      const runtime = String(data.runtime ?? 'yedek motor');
      const sceneMode = String(data.scene_mode ?? '');
      const sceneLabel = sceneMode === 'floating' ? 'saha metni' : 'bu sahne';
      enqueueNotice('info', `${selected} ${sceneLabel} için uygun değil. ${runtime} kullanılıyor.`, `ocr_runtime_fallback:${selected}:${runtime}:${sceneMode}`);
    },
    onFrameStat: (data) => setOcrFrameStat(data),
    onRegionSelected: (data) => {
      restoreAfterRegionSelection().catch(() => undefined);
      const region = (data && typeof data === 'object' && 'region' in data) ? (data as { region?: unknown }).region : null;
      if (region && typeof region === 'object') {
        setSettings((current) => (current ? { ...current, last_region: region as AppSettingsState['last_region'] } : current));
      }
      localStorage.setItem('has-selected-region', 'true');
      setHasSelectedRegion(true);
      if (suppressNextRegionToastRef.current) {
        suppressNextRegionToastRef.current = false;
        return;
      }
      enqueueNotice('success', 'Tarama alanı güncellendi.');
    },
    onRegionCancelled: (data) => {
      restoreAfterRegionSelection().catch(() => undefined);
      enqueueNotice('info', String(data.message ?? 'Tarama alanı seçimi iptal edildi.'));
    },
    onRegionFailed: (data) => {
      restoreAfterRegionSelection().catch(() => undefined);
      enqueueNotice('warning', String(data.message ?? 'Tarama alanı seçimi başlatılamadı.'));
    },
    onAsyncError: (data) => {
      enqueueNotice('warning', String(data.message ?? 'Sistem hatası oluştu.'));
    },
  });



  useEffect(() => {
    let unlistenCloseRequested: (() => void) | undefined;
    let unlistenTrayExitRequested: (() => void) | undefined;

    const previousHtmlWindowMode = document.documentElement.dataset.windowMode;
    const previousWindowMode = document.body.dataset.windowMode;
    document.documentElement.dataset.windowMode = 'main';
    document.body.dataset.windowMode = 'main';

    const bootstrapped = sessionStorage.getItem(BOOT_KEY);
    if (!bootstrapped) {
      localStorage.removeItem('has-selected-region');
      sessionStorage.setItem(BOOT_KEY, 'true');
      setHasSelectedRegion(false);
      restoredRegionNoticeShownRef.current = false;
    } else {
      setHasSelectedRegion(false);
    }

    appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (settings?.minimize_to_tray) {
        await appWindow.hide().catch(() => undefined);
        return;
      }
      await performAppShutdown();
    }).then((unlisten) => { unlistenCloseRequested = unlisten; });

    listen('tray-exit-requested', async () => { await performAppShutdown(); }).then((unlisten) => { unlistenTrayExitRequested = unlisten; });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'has-selected-region') setHasSelectedRegion(event.newValue === 'true');
    };
    const handleContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('storage', handleStorage);
    document.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      document.documentElement.dataset.windowMode = previousHtmlWindowMode ?? '';
      document.body.dataset.windowMode = previousWindowMode ?? '';
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      unlistenCloseRequested?.();
      unlistenTrayExitRequested?.();
    };
  }, [settings?.minimize_to_tray]);

  useEffect(() => {
    if (settings?.start_on_login === undefined) return;
    
    const applyAutostart = async () => {
      try {
        const currentlyEnabled = await isEnabled();
        if (settings.start_on_login && !currentlyEnabled) {
          await enable();
        } else if (!settings.start_on_login && currentlyEnabled) {
          await disable();
        }
      } catch (e) {
        console.error('Failed to configure autostart:', e);
      }
    };
    
    applyAutostart();
  }, [settings?.start_on_login]);

  useEffect(() => {
    const restoreFromCalibration = async () => {
      if (!calibrationRestorePendingRef.current) return;
      calibrationRestorePendingRef.current = false;
      await invoke('restore_main_window').catch(() => undefined);
      await appWindow.show().catch(() => undefined);
      await appWindow.unminimize().catch(() => undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      await appWindow.setFocus().catch(() => undefined);
    };

    const offCalibrationRegion = onEvent('calibration_region_selected', () => {
      restoreFromCalibration().catch(() => undefined);
    });
    const offCalibrationCancel = onEvent('calibration_region_cancelled', (data: any) => {
      restoreFromCalibration().catch(() => undefined);
      enqueueNotice('info', String(data?.message ?? 'Kalibrasyon alanı seçimi iptal edildi.'));
    });
    const offCalibrationFailed = onEvent('calibration_region_failed', (data: any) => {
      restoreFromCalibration().catch(() => undefined);
      enqueueNotice('error', String(data?.message ?? 'Kalibrasyon alanı seçimi başarısız oldu.'));
    });
    return () => {
      offCalibrationRegion();
      offCalibrationCancel();
      offCalibrationFailed();
    };
  }, []);

  useEffect(() => {
    const offTempState = onEvent('temporary_region_state', (data: any) => {
      temporaryRegionActiveRef.current = Boolean(data?.active);
    });
    const offTempSelected = onEvent('temporary_region_selected', () => {
      temporaryRegionActiveRef.current = true;
      restoreAfterRegionSelection().catch(() => undefined);
      enqueueNotice('success', 'Geçici çeviri alanı etkinleştirildi.');
      if (resumeTranslationAfterTempSelectRef.current) {
        wsClient.send('start_translation');
      }
      resumeTranslationAfterTempSelectRef.current = false;
    });
    const offTempCancelled = onEvent('temporary_region_cancelled', (data: any) => {
      temporaryRegionActiveRef.current = false;
      restoreAfterRegionSelection().catch(() => undefined);
      enqueueNotice('info', String(data?.message ?? 'Geçici çeviri alanı kapatıldı.'));
      if (hasSelectedRegionRef.current && resumeTranslationAfterTempSelectRef.current) {
        wsClient.send('start_translation');
      }
      resumeTranslationAfterTempSelectRef.current = false;
    });
    const offTempFailed = onEvent('temporary_region_failed', (data: any) => {
      temporaryRegionActiveRef.current = false;
      restoreAfterRegionSelection().catch(() => undefined);
      enqueueNotice('warning', String(data?.message ?? 'Geçici çeviri alanı başlatılamadı.'));
      if (hasSelectedRegionRef.current && resumeTranslationAfterTempSelectRef.current) {
        wsClient.send('start_translation');
      }
      resumeTranslationAfterTempSelectRef.current = false;
    });
    return () => {
      offTempState();
      offTempSelected();
      offTempCancelled();
      offTempFailed();
    };
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timeoutIds = notices.map((notice) => window.setTimeout(() => dismissNotice(notice.id), 3800));
    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [notices]);

  useEffect(() => {
    if (!settings || settings.onboarding_completed) return;
    localStorage.removeItem('has-selected-region');
    sessionStorage.removeItem(BOOT_KEY);
    setHasSelectedRegion(false);
    startupIntroShownRef.current = false;
    setShowStartupIntro(false);
  }, [settings]);

  // Sistem başlangıcında ve motor değişimlerinde aktif motorun bağımlılıklarını kontrol et
  useEffect(() => {
    if (!settings || !hardware || !settings.onboarding_completed) return;
    const isEngineReady = hardware.available_engines?.includes(settings.ocr_engine);
    if (!isEngineReady) {
      setActivePage('canvasC');
      enqueueNotice('error', 'Kritik Uyarı: Seçili OCR motoru çalıştırılamıyor! Lütfen onarın veya indirin.', 'startup_engine_check');
    }
  }, [settings?.ocr_engine, hardware?.available_engines]);

  useEffect(() => {
    if (!settings || !offlineStatus || offlineStatus.available || settings.translation_engine !== 'offline') {
      return;
    }
    const nextSettings = { ...settings, translation_engine: 'auto' as const };
    setSettings(nextSettings);
    wsClient.send('save_settings', nextSettings);
  }, [offlineStatus, settings]);

  useEffect(() => {
    if (!settings || !settings.onboarding_completed || (FORCE_ONBOARDING_TEST && !forceOnboardingBypassed) || startupIntroShownRef.current) return;
    startupIntroShownRef.current = true;
    setShowStartupIntro(true);
  }, [settings, forceOnboardingBypassed]);

  useEffect(() => {
    const introActive = Boolean(settings && settings.onboarding_completed && !(FORCE_ONBOARDING_TEST && !forceOnboardingBypassed) && (showStartupIntro || !startupIntroShownRef.current));
    const onboardingActive = Boolean((FORCE_ONBOARDING_TEST && !forceOnboardingBypassed) || !settings?.onboarding_completed);
    if (!settings || introActive || onboardingActive) {
      setShellVisible(false);
      return;
    }
    setShellVisible(true);
  }, [settings, showStartupIntro, forceOnboardingBypassed]);

  // ── Ctrl+Shift+Q Acil Kapatma (kısayol sistemi dışında bağımsız) ──
  useEffect(() => {
    const handleEmergencyQuit = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'q') {
        event.preventDefault();
        wsClient.send('shutdown_core');
      }
    };
    document.addEventListener('keydown', handleEmergencyQuit, true);
    return () => document.removeEventListener('keydown', handleEmergencyQuit, true);
  }, []);

  // ── Merkezi Kısayol Yöneticisi ──
  // Ref senkronizasyonu — handleToggleTemporaryRegion ve useShortcutManager için gerekli
  useEffect(() => { isTranslatingRef.current = isTranslating; }, [isTranslating]);
  useEffect(() => { hasSelectedRegionRef.current = hasSelectedRegion; }, [hasSelectedRegion]);

  useShortcutManager({
    shortcuts: settings?.shortcuts,
    isTranslating,
    hasSelectedRegion,
    temporaryRegionActiveRef,
    restoreAfterRegionSelectionRef,
    resumeTranslationAfterTempSelectRef,
    notify: enqueueNotice,
  });

  const hasCustomizedSettings = Boolean(
    settings
    && (
      settings.minimize_to_tray !== DEFAULT_APP_SETTINGS.minimize_to_tray
      || settings.log_level !== DEFAULT_APP_SETTINGS.log_level
      || settings.translation_engine !== DEFAULT_APP_SETTINGS.translation_engine
      || settings.offline_model_key !== DEFAULT_APP_SETTINGS.offline_model_key
      || settings.performance_tier !== DEFAULT_APP_SETTINGS.performance_tier
      || settings.reading_speed_cps !== DEFAULT_APP_SETTINGS.reading_speed_cps
      || settings.ocr_filters_enabled !== DEFAULT_APP_SETTINGS.ocr_filters_enabled
      || settings.raw_translation_flow_enabled !== DEFAULT_APP_SETTINGS.raw_translation_flow_enabled
      || settings.active_calibration_profile_id !== DEFAULT_APP_SETTINGS.active_calibration_profile_id
      || JSON.stringify(settings.custom_calibration_profiles ?? []) !== JSON.stringify(DEFAULT_APP_SETTINGS.custom_calibration_profiles)
      || settings.src_language !== DEFAULT_APP_SETTINGS.src_language
      || settings.tgt_language !== DEFAULT_APP_SETTINGS.tgt_language
      || settings.shortcuts.start_stop !== DEFAULT_APP_SETTINGS.shortcuts.start_stop
      || settings.shortcuts.select_region !== DEFAULT_APP_SETTINGS.shortcuts.select_region
      || settings.shortcuts.hide_overlay !== DEFAULT_APP_SETTINGS.shortcuts.hide_overlay
      || settings.shortcuts.temporary_region !== DEFAULT_APP_SETTINGS.shortcuts.temporary_region
      || (overlaySettings ? (
        overlaySettings.mode !== DEFAULT_OVERLAY_SETTINGS.mode
        || overlaySettings.font_family !== DEFAULT_OVERLAY_SETTINGS.font_family
        || overlaySettings.font_size !== DEFAULT_OVERLAY_SETTINGS.font_size
        || overlaySettings.font_color !== DEFAULT_OVERLAY_SETTINGS.font_color
        || overlaySettings.font_bold !== DEFAULT_OVERLAY_SETTINGS.font_bold
        || overlaySettings.alpha !== DEFAULT_OVERLAY_SETTINGS.alpha
        || overlaySettings.bg_visible !== DEFAULT_OVERLAY_SETTINGS.bg_visible
      ) : false)
    )
  );

  const shouldRenderStartupIntro = Boolean(
    settings
    && settings.onboarding_completed
    && !(FORCE_ONBOARDING_TEST && !forceOnboardingBypassed)
    && (showStartupIntro || !startupIntroShownRef.current)
  );

  const startupProfileLines = [
    userProfile?.display_name || 'Yerel Oturum',
    hasCustomizedSettings ? 'Kişiselleştirilmiş Ayarlar' : 'Varsayılan Ayarlar',
    `${(settings?.ocr_engine ?? 'easy').toUpperCase()} • ${(settings?.src_language ?? 'auto').toUpperCase()} → ${(settings?.tgt_language ?? 'tr').toUpperCase()}`,
  ];

  const value = useMemo<AppContextValue>(() => ({
    activePage,
    setActivePage,
    isTranslating,
    isLoadingEngine,
    hasSelectedRegion,
    settings,
    overlaySettings,
    hardware,
    offlineStatus,
    forceOnboardingBypassed,
    setForceOnboardingBypassed,
    showStartupIntro,
    setShowStartupIntro,
    shellVisible,
    userProfile,
    translationPreview,
    runtimeEngine,
    ocrFrameStat,
    notices,
    dismissNotice,
    notify: enqueueNotice,
    handleToggleTranslation,
    handleToggleTranslationWithRegion,
    handleStartRegionSelect,
    handleStartCalibrationSelect,
    startupProfileLines,
    shouldRenderStartupIntro,
    hasCustomizedSettings,
  }), [
    activePage,
    forceOnboardingBypassed,
    hasCustomizedSettings,
    hasSelectedRegion,
    hardware,
    isTranslating,
    isLoadingEngine,
    notices,
    ocrFrameStat,
    overlaySettings,
    settings,
    shellVisible,
    shouldRenderStartupIntro,
    showStartupIntro,
    startupProfileLines,
    translationPreview,
    runtimeEngine,
    enqueueNotice,
    handleToggleTranslationWithRegion,
    userProfile,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}

