/**
 * useWorkspaceState
 *
 * Encapsulates all state, derived values and action handlers for WorkspaceView.
 * The component itself becomes a pure render layer consuming this hook.
 */
import { useEffect, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { wsClient } from '../../bridge/websocket';
import { type ConceptAPerformanceOption } from '../../config/workspacePerformance';
import { type ConceptAEngineOption, workspaceEngineLabels } from '../../config/workspaceEngine';

const serviceLabels = {
  auto: 'Auto',
  google: 'Google',
  offline: 'Offline',
} as const;

const offlineModelLabels = {
  opus_mt_en_tr: 'Opus MT',
  nllb: 'NLLB',
} as const;

type ServiceKey = 'auto' | 'google' | 'offline';
type OfflineModelKey = 'opus_mt_en_tr' | 'nllb';

const languageOrder = ['EN', 'TR'] as const;

/** Module-level flag — resets on app reload, survives re-renders */
let hasReceivedTranslationPreviewThisRun = false;

export interface WorkspaceStateProps {
  performanceOptions: ConceptAPerformanceOption[];
  currentPerformanceId: string;
  onPerformanceChange?: (nextId: string) => void;
  engineOptions: ConceptAEngineOption[];
  currentEngineId: string;
  onEngineChange?: (nextId: string) => void;
}

export function useWorkspaceState({
  performanceOptions,
  currentPerformanceId,
  onPerformanceChange,
  engineOptions,
  currentEngineId,
  onEngineChange,
}: WorkspaceStateProps) {
  const {
    translationPreview,
    settings,
    offlineStatus,
    hasSelectedRegion,
    isTranslating,
    isLoadingEngine,
    handleStartRegionSelect,
    handleToggleTranslation,
    notify,
  } = useAppContext();

  const [sceneType, setSceneType] = useState<'floating' | 'striped'>('striped');
  const [hasSeenTranslationPreview, setHasSeenTranslationPreview] = useState(hasReceivedTranslationPreviewThisRun);
  const [performanceArrowHover, setPerformanceArrowHover] = useState<'up' | 'down' | null>(null);
  const [motorArrowHover, setMotorArrowHover] = useState<'up' | 'down' | null>(null);
  const [serviceArrowHover, setServiceArrowHover] = useState<'up' | 'down' | null>(null);
  const [modelArrowHover, setModelArrowHover] = useState<'up' | 'down' | null>(null);
  const [sourceLanguageIndex, setSourceLanguageIndex] = useState(0);
  const [targetLanguageIndex, setTargetLanguageIndex] = useState(1);
  const [languageArrowHover, setLanguageArrowHover] = useState<
    'source-up' | 'source-down' | 'target-up' | 'target-down' | null
  >(null);
  const [languageSwapHover, setLanguageSwapHover] = useState(false);

  // --- Derived: scene ---
  const isFloating = sceneType === 'floating';
  const sceneModeName = isFloating ? 'Saha Metni' : 'Altyazı Şeridi';
  const sceneModeBest = isFloating ? 'HUD ve sahne üstü yazılarda güçlü' : 'Sabit diyalog ve alt bantta güçlü';

  // --- Derived: service ---
  const availableServices = (offlineStatus?.available ? ['auto', 'google', 'offline'] : ['auto', 'google']) as ServiceKey[];
  const requestedService: ServiceKey =
    settings?.translation_engine === 'offline' || settings?.translation_engine === 'google'
      ? settings.translation_engine
      : 'auto';
  const safeService = availableServices.includes(requestedService) ? requestedService : 'auto';
  const offlineModelOrder: OfflineModelKey[] = ['opus_mt_en_tr', 'nllb'];
  const safeOfflineModel: OfflineModelKey = settings?.offline_model_key === 'nllb' ? 'nllb' : 'opus_mt_en_tr';
  const serviceIndex = Math.max(0, availableServices.findIndex((item) => item === safeService));
  const activeService = serviceLabels[safeService];
  const modelEnabled = safeService === 'offline';
  const modelIndex = Math.max(0, offlineModelOrder.findIndex((item) => item === safeOfflineModel));
  const activeModel = offlineModelLabels[safeOfflineModel];

  // --- Derived: performance ---
  const currentPerformanceIndex = performanceOptions.findIndex((item) => item.id === currentPerformanceId);
  const safePerformanceIndex =
    currentPerformanceIndex >= 0
      ? currentPerformanceIndex
      : Math.max(0, performanceOptions.findIndex((item) => item.id === 'Performans'));
  const currentPerformance = performanceOptions[safePerformanceIndex]?.name ?? 'Performans';
  const previousPerformance =
    performanceOptions[(safePerformanceIndex - 1 + performanceOptions.length) % performanceOptions.length]?.name ?? null;
  const nextPerformance = performanceOptions[(safePerformanceIndex + 1) % performanceOptions.length]?.name ?? null;

  // --- Derived: motor ---
  const currentMotorIndex = engineOptions.findIndex((item) => item.id === currentEngineId);
  const safeMotorIndex = currentMotorIndex >= 0 ? currentMotorIndex : 0;
  const currentMotor = engineOptions[safeMotorIndex]?.label ?? workspaceEngineLabels.easy;
  const previousMotor =
    engineOptions.length > 1
      ? engineOptions[(safeMotorIndex - 1 + engineOptions.length) % engineOptions.length]?.label ?? null
      : null;
  const nextMotor =
    engineOptions.length > 1
      ? engineOptions[(safeMotorIndex + 1) % engineOptions.length]?.label ?? null
      : null;

  // --- Derived: service nav ---
  const previousService =
    availableServices.length > 1
      ? serviceLabels[availableServices[(serviceIndex - 1 + availableServices.length) % availableServices.length]]
      : null;
  const nextService =
    availableServices.length > 1
      ? serviceLabels[availableServices[(serviceIndex + 1) % availableServices.length]]
      : null;

  // --- Derived: model nav ---
  const previousModel =
    offlineModelOrder.length > 1
      ? offlineModelLabels[offlineModelOrder[(modelIndex - 1 + offlineModelOrder.length) % offlineModelOrder.length]]
      : null;
  const nextModel =
    offlineModelOrder.length > 1
      ? offlineModelLabels[offlineModelOrder[(modelIndex + 1) % offlineModelOrder.length]]
      : null;

  // --- Derived: language ---
  const sourceLanguage = languageOrder[sourceLanguageIndex];
  const targetLanguage = languageOrder[targetLanguageIndex];

  // --- Derived: status ---
  type SessionStatus = 'idle' | 'active' | 'loading' | 'error';
  const scanStatus: SessionStatus = hasSelectedRegion ? 'active' : 'idle';
  const motorStatus: SessionStatus = isLoadingEngine ? 'loading' : engineOptions.length > 0 ? 'active' : 'error';
  const loopStatus: SessionStatus = isLoadingEngine ? 'loading' : isTranslating ? 'active' : 'idle';
  const regionActionLabel = hasSelectedRegion ? 'Alan Seçildi' : 'Alan Seç';
  const translationActionLabel = isLoadingEngine
    ? 'Motor Yükleniyor...'
    : isTranslating
    ? 'Çeviriyi Durdur'
    : 'Çeviri Başlat';

  // --- Derived: preview ---
  const sourcePreviewText = translationPreview?.original_text?.trim() ?? '';
  const translatedPreviewText = translationPreview?.translated_text?.trim() ?? '';
  const shouldShowSourcePreviewHelp = !hasSeenTranslationPreview && !sourcePreviewText;
  const shouldShowTargetPreviewHelp = !hasSeenTranslationPreview && !translatedPreviewText;

  // --- Effects ---
  useEffect(() => {
    setSceneType(settings?.ocr_scene_mode === 'floating' ? 'floating' : 'striped');
  }, [settings?.ocr_scene_mode]);

  useEffect(() => {
    if (!translatedPreviewText || hasReceivedTranslationPreviewThisRun) return;
    hasReceivedTranslationPreviewThisRun = true;
    setHasSeenTranslationPreview(true);
  }, [translatedPreviewText]);

  useEffect(() => {
    const src = settings?.src_language === 'tr' ? 'TR' : 'EN';
    const tgt = settings?.tgt_language === 'en' ? 'EN' : 'TR';
    setSourceLanguageIndex(languageOrder.findIndex((item) => item === src));
    setTargetLanguageIndex(languageOrder.findIndex((item) => item === tgt));
  }, [settings?.src_language, settings?.tgt_language]);

  // --- Actions ---
  const saveLanguageSettings = (nextSource: 'EN' | 'TR', nextTarget: 'EN' | 'TR') => {
    wsClient.send('save_settings', {
      src_language: nextSource === 'TR' ? 'tr' : 'en',
      tgt_language: nextTarget === 'EN' ? 'en' : 'tr',
    });
  };

  const applySceneType = (nextSceneType: 'floating' | 'striped') => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken sahne tipi değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken sahne tipi değiştirilemez', 'settings_lock');
    if (nextSceneType === sceneType) return;
    setSceneType(nextSceneType);
    wsClient.send('change_ocr_scene_mode', { mode: nextSceneType });
    wsClient.send('save_settings', { ocr_scene_mode: nextSceneType });
  };

  const shiftPerformance = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken performans ayarı değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken performans ayarı değiştirilemez', 'settings_lock');
    if (performanceOptions.length === 0) return;
    const nextIndex = (safePerformanceIndex + dir + performanceOptions.length) % performanceOptions.length;
    onPerformanceChange?.(performanceOptions[nextIndex].id);
  };

  const shiftMotor = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken OCR motoru değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken OCR motoru değiştirilemez', 'settings_lock');
    if (engineOptions.length === 0) return;
    const nextIndex = (safeMotorIndex + dir + engineOptions.length) % engineOptions.length;
    const nextEngine = engineOptions[nextIndex];
    if (nextEngine) onEngineChange?.(nextEngine.id);
  };

  const shiftService = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken çeviri servisi değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken çeviri servisi değiştirilemez', 'settings_lock');
    const nextIndex = (serviceIndex + dir + availableServices.length) % availableServices.length;
    const nextServiceId = availableServices[nextIndex];
    wsClient.send(
      'save_settings',
      nextServiceId === 'offline'
        ? {
            translation_engine: nextServiceId,
            src_language: safeOfflineModel === 'opus_mt_en_tr' ? 'en' : (settings?.src_language === 'tr' ? 'tr' : 'en'),
          }
        : { translation_engine: nextServiceId },
    );
  };

  const shiftModel = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken çevrimdışı model değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken çevrimdışı model değiştirilemez', 'settings_lock');
    if (!modelEnabled) return;
    const nextIndex = (modelIndex + dir + offlineModelOrder.length) % offlineModelOrder.length;
    const nextModelId = offlineModelOrder[nextIndex];
    wsClient.send(
      'save_settings',
      nextModelId === 'opus_mt_en_tr'
        ? { offline_model_key: nextModelId, src_language: 'en' }
        : { offline_model_key: nextModelId },
    );
  };

  const shiftSourceLanguage = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken dil değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken dil değiştirilemez', 'settings_lock');
    const nextIndex = (sourceLanguageIndex + dir + languageOrder.length) % languageOrder.length;
    const nextSource = languageOrder[nextIndex];
    setSourceLanguageIndex(nextIndex);
    saveLanguageSettings(nextSource, targetLanguage);
  };

  const shiftTargetLanguage = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken dil değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken dil değiştirilemez', 'settings_lock');
    const nextIndex = (targetLanguageIndex + dir + languageOrder.length) % languageOrder.length;
    const nextTarget = languageOrder[nextIndex];
    setTargetLanguageIndex(nextIndex);
    saveLanguageSettings(sourceLanguage, nextTarget);
  };

  const swapLanguages = () => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken dil değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken dil değiştirilemez', 'settings_lock');
    const nextSource = targetLanguage;
    const nextTarget = sourceLanguage;
    setSourceLanguageIndex(targetLanguageIndex);
    setTargetLanguageIndex(sourceLanguageIndex);
    saveLanguageSettings(nextSource, nextTarget);
  };

  return {
    // Context passthrough
    translationPreview,
    settings,
    hasSelectedRegion,
    isTranslating,
    isLoadingEngine,
    handleStartRegionSelect,
    handleToggleTranslation,
    // Scene
    sceneType,
    isFloating,
    sceneModeName,
    sceneModeBest,
    applySceneType,
    // Performance
    currentPerformance,
    previousPerformance,
    nextPerformance,
    shiftPerformance,
    performanceArrowHover,
    setPerformanceArrowHover,
    // Motor
    currentMotor,
    previousMotor,
    nextMotor,
    shiftMotor,
    motorArrowHover,
    setMotorArrowHover,
    // Service
    activeService,
    previousService,
    nextService,
    shiftService,
    serviceArrowHover,
    setServiceArrowHover,
    // Model
    activeModel,
    previousModel,
    nextModel,
    shiftModel,
    modelEnabled,
    modelArrowHover,
    setModelArrowHover,
    // Language
    sourceLanguage,
    targetLanguage,
    shiftSourceLanguage,
    shiftTargetLanguage,
    swapLanguages,
    languageArrowHover,
    setLanguageArrowHover,
    languageSwapHover,
    setLanguageSwapHover,
    // Status
    scanStatus,
    motorStatus,
    loopStatus,
    regionActionLabel,
    translationActionLabel,
    // Preview
    sourcePreviewText,
    translatedPreviewText,
    shouldShowSourcePreviewHelp,
    shouldShowTargetPreviewHelp,
  };
}
