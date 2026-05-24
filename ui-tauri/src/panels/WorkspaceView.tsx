import React, { useEffect, useState } from 'react';
import { PanelStage } from './PanelStage';
import { ValueRail } from '../components/home/HomePanelShared';
import { useAppContext } from '../context/AppContext';
import { wsClient } from '../bridge/websocket';
import { motion } from 'framer-motion';
import { conceptABasePerformanceOptions, type ConceptAPerformanceOption } from './workspacePerformance';
import { type ConceptAEngineOption, workspaceEngineLabels } from './workspaceEngine';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'rgba(191, 215, 242, 0.72)',
  fontWeight: 700,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  color: '#f4f8ff',
  fontWeight: 650,
  letterSpacing: '-0.02em',
};

const infoTitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#9fb7cf',
  fontWeight: 500,
  lineHeight: 1.45,
  letterSpacing: '-0.01em',
};

const shellStyle: React.CSSProperties = {
  borderRadius: 18,
  background: 'rgba(5, 9, 14, 0.42)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
  minHeight: 0,
};

const textPreviewBlockStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflow: 'hidden',
};

const textPreviewFrameStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  fontSize: 14.75,
  lineHeight: 1.74,
  color: 'rgba(241, 247, 255, 0.92)',
  whiteSpace: 'pre-wrap',
  animation: 'conceptATextSwap 320ms ease',
  overflowY: 'auto',
  overflowX: 'hidden',
  wordBreak: 'break-word',
};

const emptyPreviewStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 8,
  color: 'rgba(216, 231, 248, 0.72)',
  fontSize: 13,
  lineHeight: 1.55,
};

let hasReceivedTranslationPreviewThisRun = false;

const LayerGlyph = ({ path, size = 18 }: { path: string, size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: size, height: size }}>
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LayerBlock = ({
  label,
  title,
  icon,
  sample,
  hideTitle = false,
  titleStyleOverride,
  style,
  interactive = false,
}: {
  label: string;
  title: React.ReactNode;
  icon: string;
  sample?: React.ReactNode;
  hideTitle?: boolean;
  titleStyleOverride?: React.CSSProperties;
  style?: React.CSSProperties;
  interactive?: boolean;
}) => {
  const [blockHovered, setBlockHovered] = useState(false);
  const glowActive = interactive && blockHovered;
  return (
    <div
      onMouseEnter={interactive ? () => setBlockHovered(true) : undefined}
      onMouseLeave={interactive ? () => setBlockHovered(false) : undefined}
      style={{
        ...shellStyle,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: glowActive
          ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 180ms ease',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={labelStyle}>{label}</div>
        <div style={{
          color: 'rgba(172, 214, 255, 0.82)',
          filter: glowActive ? 'drop-shadow(0 0 6px rgba(125,211,252,0.42))' : 'none',
          transition: 'filter 180ms ease',
        }}>
          <LayerGlyph path={icon} />
        </div>
      </div>
      {!hideTitle ? <div style={{ ...titleStyle, ...titleStyleOverride, marginTop: 8 }}>{title}</div> : null}
      {sample ? (
        <div
          style={{
            marginTop: hideTitle ? 0 : 10,
            color: 'rgba(216, 231, 248, 0.82)',
            flex: hideTitle ? 1 : undefined,
            display: hideTitle ? 'flex' : undefined,
            alignItems: hideTitle ? 'center' : undefined,
            minHeight: 0,
            overflow: 'visible',
          }}
        >
          {sample}
        </div>
      ) : null}
    </div>
  );
};

type SessionStatus = 'idle' | 'active' | 'loading' | 'error';
const statusColor = (s: SessionStatus) =>
  s === 'active' ? '#86efac' : s === 'loading' ? '#7dd3fc' : s === 'idle' ? '#fcd34d' : '#fca5a5';
const statusLabel = (s: SessionStatus, active: string, idle: string, error: string, loading?: string) =>
  s === 'active' ? active : s === 'loading' ? (loading ?? active) : s === 'idle' ? idle : error;

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

export const WorkspaceView: React.FC<{
  performanceOptions?: ConceptAPerformanceOption[];
  currentPerformanceId?: string;
  onPerformanceChange?: (nextId: string) => void;
  engineOptions?: ConceptAEngineOption[];
  currentEngineId?: string;
  onEngineChange?: (nextId: string) => void;
}> = ({
  performanceOptions = conceptABasePerformanceOptions,
  currentPerformanceId = 'Performans',
  onPerformanceChange,
  engineOptions = [],
  currentEngineId = 'easy',
  onEngineChange,
}) => {
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
  const languageOrder = ['EN', 'TR'] as const;
  const [sourceLanguageIndex, setSourceLanguageIndex] = useState(0);
  const [targetLanguageIndex, setTargetLanguageIndex] = useState(1);
  const [languageArrowHover, setLanguageArrowHover] = useState<'source-up' | 'source-down' | 'target-up' | 'target-down' | null>(null);
  const [languageSwapHover, setLanguageSwapHover] = useState(false);
  const isFloating = sceneType === 'floating';
  const sceneModeName = isFloating ? 'Saha Metni' : 'Altyazı Şeridi';
  const sceneModeBest = isFloating ? 'HUD ve sahne üstü yazılarda güçlü' : 'Sabit diyalog ve alt bantta güçlü';
  const availableServices = React.useMemo<ServiceKey[]>(
    () => (offlineStatus?.available ? ['auto', 'google', 'offline'] : ['auto', 'google']),
    [offlineStatus?.available],
  );
  const requestedService: ServiceKey = settings?.translation_engine === 'offline' || settings?.translation_engine === 'google'
    ? settings.translation_engine
    : 'auto';
  const safeService = availableServices.includes(requestedService)
    ? requestedService
    : 'auto';
  const offlineModelOrder: OfflineModelKey[] = ['opus_mt_en_tr', 'nllb'];
  const safeOfflineModel: OfflineModelKey = settings?.offline_model_key === 'nllb' ? 'nllb' : 'opus_mt_en_tr';
  const serviceIndex = Math.max(0, availableServices.findIndex((item) => item === safeService));
  const activeService = serviceLabels[safeService];
  const modelEnabled = safeService === 'offline';
  const modelIndex = Math.max(0, offlineModelOrder.findIndex((item) => item === safeOfflineModel));
  const activeModel = offlineModelLabels[safeOfflineModel];
  const currentPerformanceIndex = performanceOptions.findIndex((item) => item.id === currentPerformanceId);
  const safePerformanceIndex = currentPerformanceIndex >= 0 ? currentPerformanceIndex : Math.max(0, performanceOptions.findIndex((item) => item.id === 'Performans'));
  const currentPerformance = performanceOptions[safePerformanceIndex]?.name ?? 'Performans';
  const previousPerformance = performanceOptions[(safePerformanceIndex - 1 + performanceOptions.length) % performanceOptions.length]?.name ?? null;
  const nextPerformance = performanceOptions[(safePerformanceIndex + 1) % performanceOptions.length]?.name ?? null;
  const shiftPerformance = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken performans ayarı değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken performans ayarı değiştirilemez', 'settings_lock');
    if (performanceOptions.length === 0) return;
    const nextIndex = (safePerformanceIndex + dir + performanceOptions.length) % performanceOptions.length;
    onPerformanceChange?.(performanceOptions[nextIndex].id);
  };
  const currentMotorIndex = engineOptions.findIndex((item) => item.id === currentEngineId);
  const safeMotorIndex = currentMotorIndex >= 0 ? currentMotorIndex : 0;
  const currentMotor = engineOptions[safeMotorIndex]?.label ?? workspaceEngineLabels.easy;
  const previousMotor = engineOptions.length > 1
    ? engineOptions[(safeMotorIndex - 1 + engineOptions.length) % engineOptions.length]?.label ?? null
    : null;
  const nextMotor = engineOptions.length > 1
    ? engineOptions[(safeMotorIndex + 1) % engineOptions.length]?.label ?? null
    : null;
  const shiftMotor = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken OCR motoru değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken OCR motoru değiştirilemez', 'settings_lock');
    if (engineOptions.length === 0) return;
    const nextIndex = (safeMotorIndex + dir + engineOptions.length) % engineOptions.length;
    const nextEngine = engineOptions[nextIndex];
    if (nextEngine) onEngineChange?.(nextEngine.id);
  };
  const previousService = availableServices.length > 1
    ? serviceLabels[availableServices[(serviceIndex - 1 + availableServices.length) % availableServices.length]]
    : null;
  const nextService = availableServices.length > 1
    ? serviceLabels[availableServices[(serviceIndex + 1) % availableServices.length]]
    : null;
  const shiftService = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken çeviri servisi değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken çeviri servisi değiştirilemez', 'settings_lock');
    const nextIndex = (serviceIndex + dir + availableServices.length) % availableServices.length;
    const nextServiceId = availableServices[nextIndex];
    wsClient.send('save_settings', nextServiceId === 'offline'
      ? {
        translation_engine: nextServiceId,
        src_language: safeOfflineModel === 'opus_mt_en_tr' ? 'en' : (settings?.src_language === 'tr' ? 'tr' : 'en'),
      }
      : { translation_engine: nextServiceId });
  };
  const previousModel = offlineModelOrder.length > 1
    ? offlineModelLabels[offlineModelOrder[(modelIndex - 1 + offlineModelOrder.length) % offlineModelOrder.length]]
    : null;
  const nextModel = offlineModelOrder.length > 1
    ? offlineModelLabels[offlineModelOrder[(modelIndex + 1) % offlineModelOrder.length]]
    : null;
  const shiftModel = (dir: -1 | 1) => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken çevrimdışı model değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken çevrimdışı model değiştirilemez', 'settings_lock');
    if (!modelEnabled) return;
    const nextIndex = (modelIndex + dir + offlineModelOrder.length) % offlineModelOrder.length;
    const nextModelId = offlineModelOrder[nextIndex];
    wsClient.send('save_settings', nextModelId === 'opus_mt_en_tr'
      ? { offline_model_key: nextModelId, src_language: 'en' }
      : { offline_model_key: nextModelId });
  };
  const sourceLanguage = languageOrder[sourceLanguageIndex];
  const targetLanguage = languageOrder[targetLanguageIndex];
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
  const scanStatus: SessionStatus = hasSelectedRegion ? 'active' : 'idle';
  const motorStatus: SessionStatus = isLoadingEngine ? 'loading' : engineOptions.length > 0 ? 'active' : 'error';
  const loopStatus: SessionStatus = isLoadingEngine ? 'loading' : isTranslating ? 'active' : 'idle';
  const regionActionLabel = hasSelectedRegion ? 'Alan Seçildi' : 'Alan Seç';
  const translationActionLabel = isLoadingEngine ? 'Motor Yükleniyor...' : isTranslating ? 'Çeviriyi Durdur' : 'Çeviri Başlat';

  useEffect(() => {
    setSceneType(settings?.ocr_scene_mode === 'floating' ? 'floating' : 'striped');
  }, [settings?.ocr_scene_mode]);

  const applySceneType = (nextSceneType: 'floating' | 'striped') => {
    if (isLoadingEngine) return notify('warning', 'Motor yüklenirken sahne tipi değiştirilemez', 'settings_lock');
    if (isTranslating) return notify('warning', 'Çeviri aktifken sahne tipi değiştirilemez', 'settings_lock');
    if (nextSceneType === sceneType) return;
    setSceneType(nextSceneType);
    wsClient.send('change_ocr_scene_mode', { mode: nextSceneType });
    wsClient.send('save_settings', { ocr_scene_mode: nextSceneType });
  };

  const sourcePreviewText = translationPreview?.original_text?.trim() ?? '';
  const translatedPreviewText = translationPreview?.translated_text?.trim() ?? '';
  const shouldShowSourcePreviewHelp = !hasSeenTranslationPreview && !sourcePreviewText;
  const shouldShowTargetPreviewHelp = !hasSeenTranslationPreview && !translatedPreviewText;

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

  const saveLanguageSettings = (nextSource: 'EN' | 'TR', nextTarget: 'EN' | 'TR') => {
    wsClient.send('save_settings', {
      src_language: nextSource === 'TR' ? 'tr' : 'en',
      tgt_language: nextTarget === 'EN' ? 'en' : 'tr',
    });
  };

  return (
  <PanelStage
    css={`
      @keyframes conceptAGridShift {
        0% { transform: translate3d(0, 0, 0); }
        100% { transform: translate3d(32px, 22px, 0); }
      }
      @keyframes conceptASweep {
        0% { transform: translate3d(-30%, 0, 0); opacity: 0; }
        20% { opacity: 0.14; }
        80% { opacity: 0.14; }
        100% { transform: translate3d(30%, 0, 0); opacity: 0; }
      }
      @keyframes conceptATextSwap {
        0% { opacity: 0; transform: translate3d(0, 10px, 0); filter: blur(4px); }
        100% { opacity: 1; transform: translate3d(0, 0, 0); filter: blur(0); }
      }
    `}
    layers={[
      {
        inset: 0,
        background: 'linear-gradient(180deg, rgba(5,9,14,0.98), rgba(3,6,10,1))',
      },
      {
        inset: '-10%',
        backgroundImage:
          'linear-gradient(rgba(123,211,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(123,211,255,0.08) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(circle at center, rgba(0,0,0,0.88), transparent 84%)',
        opacity: 0.22,
        animation: 'conceptAGridShift 18s linear infinite',
      },
      {
        inset: '-20%',
        background: 'linear-gradient(100deg, transparent 38%, rgba(90,200,255,0.18) 50%, transparent 62%)',
        filter: 'blur(18px)',
        animation: 'conceptASweep 7s ease-in-out infinite',
      },
    ]}
  >
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        height: '100%',
        padding: '62px 20px 18px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          height: '100%',
          minHeight: 0,
          borderRadius: 0,
          background: 'transparent',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          boxShadow: 'none',
          display: 'block',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 220px 220px',
            gap: 16,
            height: '100%',
            padding: '14px',
          }}
        >
          <div
            style={{
              minHeight: 0,
              borderRadius: 24,
              background: 'rgba(255,255,255,0.045)',
              display: 'grid',
              gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
              padding: '16px',
              gap: 14,
            }}
          >
            <LayerBlock
              label="Metin Önizleme"
              title="Metin Önizleme"
              icon="M6 5.5h12M6 10h12M6 14.5h8M6 19h10"
              hideTitle
              sample={
                <div style={textPreviewBlockStyle}>
                  {sourcePreviewText ? (
                    <div key={`source-${sourcePreviewText}`} style={textPreviewFrameStyle}>
                      {sourcePreviewText}
                    </div>
                  ) : shouldShowSourcePreviewHelp ? (
                    <div style={emptyPreviewStyle}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: '#eef6ff' }}>Henüz okuma başlamadı.</div>
                      <div>Çeviri alanını seçip çeviriyi başlattığında yakalanan metin burada görünecek.</div>
                    </div>
                  ) : null}
                </div>
              }
            />
            <LayerBlock
              label="Çeviri Sonucu"
              title="Çeviri Sonucu"
              icon="M5 7h6m3 0h5M5 12h14M5 17h9"
              hideTitle
              sample={
                <div style={textPreviewBlockStyle}>
                  {translatedPreviewText ? (
                    <div key={`target-${translatedPreviewText}`} style={textPreviewFrameStyle}>
                      {translatedPreviewText}
                    </div>
                  ) : shouldShowTargetPreviewHelp ? (
                    <div style={emptyPreviewStyle}>
                      <div style={{ fontSize: 13.5, fontWeight: 650, color: '#eef6ff' }}>Çeviri sonucu bekleniyor.</div>
                      <div>İlk çeviri geldikten sonra bu bilgilendirme bu oturum boyunca tekrar gösterilmeyecek.</div>
                    </div>
                  ) : null}
                </div>
              }
            />
          </div>

          <div
            style={{
              minHeight: 0,
              borderRadius: 24,
              background: 'rgba(255,255,255,0.045)',
              display: 'grid',
              gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
              padding: '14px',
              gap: 14,
            }}
          >
            <LayerBlock
              label="Performans"
              title="Performans"
              icon="M5 17V9m5 8V5m5 12v-6m4 6V7"
              hideTitle
              interactive={!isTranslating}
              style={{
                opacity: !isTranslating ? 1 : 0.48,
                background: !isTranslating ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
                transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
              }}
              sample={
                <div
                  onWheel={(event) => {
                    event.preventDefault();
                    shiftPerformance(event.deltaY > 0 ? 1 : -1);
                  }}
                  style={{
                    minHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'stretch',
                    userSelect: 'none',
                    width: '100%',
                    overflow: 'visible',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateRows: '16px minmax(0, auto) 16px',
                      alignItems: 'center',
                      justifyItems: 'center',
                      gap: 2,
                      maxHeight: '100%',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => shiftPerformance(-1)}
                      onMouseEnter={() => setPerformanceArrowHover('up')}
                      onMouseLeave={() => setPerformanceArrowHover(null)}
                      aria-label="Önceki performans"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: performanceArrowHover === 'up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                        cursor: 'pointer',
                        padding: 0,
                        height: 16,
                        width: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: performanceArrowHover === 'up' ? 'translateY(-1px)' : 'none',
                        opacity: performanceArrowHover === 'up' ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                    </button>
                    <div style={{ width: '100%' }}>
                      <ValueRail
                        size="mini"
                        previousValue={previousPerformance}
                        activeValue={currentPerformance}
                        nextValue={nextPerformance}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => shiftPerformance(1)}
                      onMouseEnter={() => setPerformanceArrowHover('down')}
                      onMouseLeave={() => setPerformanceArrowHover(null)}
                      aria-label="Sonraki performans"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: performanceArrowHover === 'down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                        cursor: 'pointer',
                        padding: 0,
                        height: 16,
                        width: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: performanceArrowHover === 'down' ? 'translateY(1px)' : 'none',
                        opacity: performanceArrowHover === 'down' ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                    </button>
                  </div>
                </div>
              }
            />
            <LayerBlock
              label="Motor"
              title="Motor"
              icon="M10 3h4l1 2 2 1 2-1 2 4-1 2 1 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 1-2-1-2 2-4 2 1 2-1 1-2Z"
              hideTitle
              interactive={!isTranslating}
              style={{
                opacity: !isTranslating ? 1 : 0.48,
                background: !isTranslating ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
                transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
              }}
              sample={
                <div
                  onWheel={(event) => {
                    event.preventDefault();
                    shiftMotor(event.deltaY > 0 ? 1 : -1);
                  }}
                  style={{
                    minHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'stretch',
                    userSelect: 'none',
                    width: '100%',
                    overflow: 'visible',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateRows: '16px minmax(0, auto) 16px',
                      alignItems: 'center',
                      justifyItems: 'center',
                      gap: 2,
                      maxHeight: '100%',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => shiftMotor(-1)}
                      onMouseEnter={() => setMotorArrowHover('up')}
                      onMouseLeave={() => setMotorArrowHover(null)}
                      aria-label="Önceki motor"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: motorArrowHover === 'up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                        cursor: 'pointer',
                        padding: 0,
                        height: 16,
                        width: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: motorArrowHover === 'up' ? 'translateY(-1px)' : 'none',
                        opacity: motorArrowHover === 'up' ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                    </button>
                    <div style={{ width: '100%' }}>
                      <ValueRail
                        size="mini"
                        previousValue={previousMotor}
                        activeValue={currentMotor}
                        nextValue={nextMotor}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => shiftMotor(1)}
                      onMouseEnter={() => setMotorArrowHover('down')}
                      onMouseLeave={() => setMotorArrowHover(null)}
                      aria-label="Sonraki motor"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: motorArrowHover === 'down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                        cursor: 'pointer',
                        padding: 0,
                        height: 16,
                        width: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: motorArrowHover === 'down' ? 'translateY(1px)' : 'none',
                        opacity: motorArrowHover === 'down' ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                    </button>
                  </div>
                </div>
              }
            />
            <LayerBlock
              label="Dil"
              title="Dil"
              icon="M4 6.5h7M4 12h9M4 17.5h6M15 6.5h5M17.5 4v5M15 17.5h5"
              hideTitle
              interactive={!isTranslating}
              style={{
                opacity: !isTranslating ? 1 : 0.48,
                background: !isTranslating ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
                transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
              }}
              sample={
                <div
                  style={{
                    minHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    userSelect: 'none',
                    width: '100%',
                    overflow: 'visible',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 32px minmax(0, 1fr)',
                      alignItems: 'center',
                      gap: 6,
                      overflow: 'visible',
                    }}
                  >
                    <div
                      onWheel={(event) => {
                        event.preventDefault();
                        shiftSourceLanguage(event.deltaY > 0 ? 1 : -1);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0,
                        minWidth: 0,
                        overflow: 'visible',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          display: 'grid',
                          gridTemplateRows: '16px minmax(0, auto) 16px',
                          alignItems: 'center',
                          justifyItems: 'center',
                          gap: 0,
                          overflow: 'visible',
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Önceki kaynak dil"
                          onClick={() => shiftSourceLanguage(-1)}
                          onMouseEnter={() => setLanguageArrowHover('source-up')}
                          onMouseLeave={() => setLanguageArrowHover(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: languageArrowHover === 'source-up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                            width: 20,
                            height: 16,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                            transform: languageArrowHover === 'source-up' ? 'translateY(-1px)' : 'none',
                            opacity: languageArrowHover === 'source-up' ? 1 : 0.82,
                          }}
                        >
                          <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                        </button>
                        <div style={{ width: '100%', transform: 'scale(0.94)', transformOrigin: 'center center' }}>
                          <ValueRail
                            size="mini"
                            previousValue={languageOrder[(sourceLanguageIndex - 1 + languageOrder.length) % languageOrder.length]}
                            activeValue={sourceLanguage}
                            nextValue={languageOrder[(sourceLanguageIndex + 1) % languageOrder.length]}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label="Sonraki kaynak dil"
                          onClick={() => shiftSourceLanguage(1)}
                          onMouseEnter={() => setLanguageArrowHover('source-down')}
                          onMouseLeave={() => setLanguageArrowHover(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: languageArrowHover === 'source-down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                            width: 20,
                            height: 16,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                            transform: languageArrowHover === 'source-down' ? 'translateY(1px)' : 'none',
                            opacity: languageArrowHover === 'source-down' ? 1 : 0.82,
                          }}
                        >
                          <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={swapLanguages}
                      onMouseEnter={() => setLanguageSwapHover(true)}
                      onMouseLeave={() => setLanguageSwapHover(false)}
                      aria-label="Dilleri değiştir"
                      style={{
                        border: 'none',
                        background: languageSwapHover
                          ? 'linear-gradient(180deg, rgba(125,211,252,0.18), rgba(125,211,252,0.09))'
                          : 'transparent',
                        boxShadow: languageSwapHover
                          ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px rgba(125,211,252,0.05)'
                          : 'none',
                        color: languageSwapHover ? '#7dd3fc' : '#9fb7cf',
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition:
                          'background 160ms ease, color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: languageSwapHover ? 'rotate(180deg) scale(1.04)' : 'scale(1)',
                        opacity: languageSwapHover ? 1 : 0.92,
                      }}
                    >
                      <LayerGlyph path="M7 8.5h9m0 0-2.5-2.5M16 8.5 13.5 11M17 15.5H8m0 0 2.5 2.5M8 15.5 10.5 13" />
                    </button>
                    <div
                      onWheel={(event) => {
                        event.preventDefault();
                        shiftTargetLanguage(event.deltaY > 0 ? 1 : -1);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0,
                        minWidth: 0,
                        overflow: 'visible',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          display: 'grid',
                          gridTemplateRows: '16px minmax(0, auto) 16px',
                          alignItems: 'center',
                          justifyItems: 'center',
                          gap: 0,
                          overflow: 'visible',
                        }}
                      >
                        <button
                          type="button"
                          aria-label="Önceki hedef dil"
                          onClick={() => shiftTargetLanguage(-1)}
                          onMouseEnter={() => setLanguageArrowHover('target-up')}
                          onMouseLeave={() => setLanguageArrowHover(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: languageArrowHover === 'target-up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                            width: 20,
                            height: 16,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                            transform: languageArrowHover === 'target-up' ? 'translateY(-1px)' : 'none',
                            opacity: languageArrowHover === 'target-up' ? 1 : 0.82,
                          }}
                        >
                          <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                        </button>
                        <div style={{ width: '100%', transform: 'scale(0.94)', transformOrigin: 'center center' }}>
                          <ValueRail
                            size="mini"
                            previousValue={languageOrder[(targetLanguageIndex - 1 + languageOrder.length) % languageOrder.length]}
                            activeValue={targetLanguage}
                            nextValue={languageOrder[(targetLanguageIndex + 1) % languageOrder.length]}
                          />
                        </div>
                        <button
                          type="button"
                          aria-label="Sonraki hedef dil"
                          onClick={() => shiftTargetLanguage(1)}
                          onMouseEnter={() => setLanguageArrowHover('target-down')}
                          onMouseLeave={() => setLanguageArrowHover(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: languageArrowHover === 'target-down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                            width: 20,
                            height: 16,
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                            transform: languageArrowHover === 'target-down' ? 'translateY(1px)' : 'none',
                            opacity: languageArrowHover === 'target-down' ? 1 : 0.82,
                          }}
                        >
                          <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              }
            />
            <LayerBlock
              label="Servis"
              title="Servis"
              icon="M5 7.5h14M7 12h10M9 16.5h6"
              hideTitle
              interactive={!isTranslating}
              style={{
                opacity: !isTranslating ? 1 : 0.48,
                background: !isTranslating ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
                transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
              }}
              sample={
                <div
                  onWheel={(event) => {
                    event.preventDefault();
                    shiftService(event.deltaY > 0 ? 1 : -1);
                  }}
                  style={{
                    minHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'stretch',
                    userSelect: 'none',
                    width: '100%',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      display: 'grid',
                      gridTemplateRows: '16px minmax(0, auto) 16px',
                      alignItems: 'center',
                      justifyItems: 'center',
                      gap: 2,
                      maxHeight: '100%',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => shiftService(-1)}
                      onMouseEnter={() => setServiceArrowHover('up')}
                      onMouseLeave={() => setServiceArrowHover(null)}
                      aria-label="Önceki servis"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: serviceArrowHover === 'up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                        cursor: 'pointer',
                        padding: 0,
                        height: 16,
                        width: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: serviceArrowHover === 'up' ? 'translateY(-1px)' : 'none',
                        opacity: serviceArrowHover === 'up' ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                    </button>
                    <div style={{ width: '100%' }}>
                      <ValueRail
                        size="mini"
                        previousValue={previousService}
                        activeValue={activeService}
                        nextValue={nextService}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => shiftService(1)}
                      onMouseEnter={() => setServiceArrowHover('down')}
                      onMouseLeave={() => setServiceArrowHover(null)}
                      aria-label="Sonraki servis"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: serviceArrowHover === 'down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                        cursor: 'pointer',
                        padding: 0,
                        height: 16,
                        width: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                        transform: serviceArrowHover === 'down' ? 'translateY(1px)' : 'none',
                        opacity: serviceArrowHover === 'down' ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                    </button>
                  </div>
                </div>
              }
            />
            <LayerBlock
              label="Model"
              title="Model"
              icon="M6 7h12M6 12h12M6 17h8"
              hideTitle
              interactive={!isTranslating && modelEnabled}
              style={{
                opacity: (modelEnabled && !isTranslating) ? 1 : 0.48,
                background: (modelEnabled && !isTranslating) ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
                transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
              }}
              sample={
                 <div style={{ width: '100%', height: '100%', alignSelf: 'stretch', position: 'relative' }}>
                  <div
                    onWheel={(event) => {
                      event.preventDefault();
                      if (modelEnabled && offlineModelOrder.length > 1) shiftModel(event.deltaY > 0 ? 1 : -1);
                    }}
                    style={{
                      minHeight: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'stretch',
                      userSelect: 'none',
                      width: '100%',
                      overflow: 'visible',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        display: 'grid',
                        gridTemplateRows: '16px minmax(0, auto) 16px',
                        alignItems: 'center',
                        justifyItems: 'center',
                        gap: 2,
                        maxHeight: '100%',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => { if (modelEnabled && offlineModelOrder.length > 1) shiftModel(-1); }}
                        onMouseEnter={() => { if (modelEnabled && offlineModelOrder.length > 1) setModelArrowHover('up'); }}
                        onMouseLeave={() => setModelArrowHover(null)}
                        aria-label="Önceki model"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: modelArrowHover === 'up' && offlineModelOrder.length > 1 ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                          cursor: modelEnabled && offlineModelOrder.length > 1 ? 'pointer' : 'default',
                          padding: 0,
                          height: 14,
                          width: 22,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                          transform: modelArrowHover === 'up' && offlineModelOrder.length > 1 ? 'translateY(-1px)' : 'none',
                          opacity: modelArrowHover === 'up' && offlineModelOrder.length > 1 ? 1 : 0.82,
                        }}
                      >
                        <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                      </button>
                      <div style={{ width: '100%' }}>
                        <ValueRail
                          size="mini"
                          previousValue={previousModel}
                          activeValue={activeModel}
                          nextValue={nextModel}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { if (modelEnabled && offlineModelOrder.length > 1) shiftModel(1); }}
                        onMouseEnter={() => { if (modelEnabled && offlineModelOrder.length > 1) setModelArrowHover('down'); }}
                        onMouseLeave={() => setModelArrowHover(null)}
                        aria-label="Sonraki model"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: modelArrowHover === 'down' && offlineModelOrder.length > 1 ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                          cursor: modelEnabled && offlineModelOrder.length > 1 ? 'pointer' : 'default',
                          padding: 0,
                          height: 14,
                          width: 22,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                          transform: modelArrowHover === 'down' && offlineModelOrder.length > 1 ? 'translateY(1px)' : 'none',
                          opacity: modelArrowHover === 'down' && offlineModelOrder.length > 1 ? 1 : 0.82,
                        }}
                      >
                        <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                      </button>
                    </div>
                  </div>
                </div>

              }
            />
          </div>

          <div
            style={{
              minHeight: 0,
              borderRadius: 24,
              background: 'rgba(255,255,255,0.045)',
              display: 'grid',
              gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
              padding: '14px',
              gap: 14,
            }}
          >
            <LayerBlock
              label="Oturum Durumu"
              title="Oturum Durumu"
              icon="M12 4a8 8 0 1 0 8 8M12 8v4l2.5 2.5"
              hideTitle
              sample={
                <div
                  style={{
                    display: 'grid',
                    alignContent: 'center',
                    gap: 10,
                    minHeight: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6, flex: 1 }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a9bdd8', fontWeight: 700 }}>
                        Tarama Alanı
                      </span>
                      <div
                        style={{
                          height: 1,
                          background: 'linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: statusColor(scanStatus), flexShrink: 0 }}>
                      {statusLabel(scanStatus, 'Hazır', 'Bekleniyor', 'Hata')}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6, flex: 1 }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a9bdd8', fontWeight: 700 }}>
                        Motor
                      </span>
                      <div
                        style={{
                          height: 1,
                          background: 'linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: statusColor(motorStatus), flexShrink: 0 }}>
                      {statusLabel(motorStatus, currentMotor, currentMotor, currentMotor, 'Yükleniyor...')}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6, flex: 1 }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a9bdd8', fontWeight: 700 }}>
                        Çeviri Döngüsü
                      </span>
                      <div
                        style={{
                          height: 1,
                          background: 'linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: statusColor(loopStatus), flexShrink: 0 }}>
                      {statusLabel(loopStatus, 'Çevriliyor', 'Bekleniyor', 'Durdu', 'Başlatılıyor...')}
                    </span>
                  </div>
                </div>
              }
            />
            <LayerBlock
              label="Çeviri Kontrolü"
              title="Alanı seç, ardından Çeviriyi başlat."
              icon="M8 6.5v11l8-5.5-8-5.5Z"
              titleStyleOverride={infoTitleStyle}
              sample={
                <div
                  style={{
                    minHeight: '100%',
                    display: 'grid',
                    alignContent: 'center',
                    gap: 10,
                  }}
                >
                  <motion.button
                    type="button"
                    onClick={() => { handleStartRegionSelect().catch(() => undefined); }}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    style={{
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 999,
                      background: hasSelectedRegion
                        ? 'rgba(134,239,172,0.08)'
                        : 'rgba(255,255,255,0.04)',
                      backdropFilter: 'blur(12px)',
                      boxShadow: hasSelectedRegion
                        ? '0 12px 24px rgba(134,239,172,0.1)'
                        : '0 12px 24px rgba(0,0,0,0.12)',
                      padding: '10px 18px',
                      color: hasSelectedRegion ? '#ecfff2' : '#eef6ff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                    }}
                  >
                    {regionActionLabel}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={isLoadingEngine ? undefined : handleToggleTranslation}
                    whileHover={{ scale: isLoadingEngine ? 1 : 1.015 }}
                    whileTap={{ scale: isLoadingEngine ? 1 : 0.985 }}
                    style={{
                      border: isTranslating ? '1px solid rgba(248,113,113,0.15)' : isLoadingEngine ? '1px solid rgba(252, 211, 77, 0.25)' : '1px solid rgba(125,211,252,0.15)',
                      borderRadius: 999,
                      background: isTranslating
                        ? 'rgba(248,113,113,0.08)'
                        : isLoadingEngine
                        ? 'rgba(252, 211, 77, 0.08)'
                        : 'rgba(125,211,252,0.08)',
                      backdropFilter: 'blur(12px)',
                      boxShadow: isTranslating
                        ? '0 12px 24px rgba(248,113,113,0.12)'
                        : isLoadingEngine
                        ? '0 12px 24px rgba(252, 211, 77, 0.12)'
                        : '0 12px 24px rgba(125,211,252,0.12)',
                      color: isLoadingEngine ? '#fef3c7' : '#f4f9ff',
                      padding: 0,
                      fontSize: 13,
                      fontWeight: 600,
                      textAlign: 'center',
                      cursor: isLoadingEngine ? 'wait' : 'pointer',
                      width: '100%',
                      position: 'relative',
                      overflow: 'hidden',
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isLoadingEngine && (
                      <motion.div
                        initial={{ width: '0%', opacity: 0 }}
                        animate={{ width: '90%', opacity: 1 }}
                        transition={{ duration: 4.5, ease: 'easeOut' }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          height: '100%',
                          background: 'linear-gradient(90deg, rgba(252, 211, 77, 0.0) 0%, rgba(252, 211, 77, 0.38) 100%)',
                          zIndex: 0,
                          borderRadius: 999,
                        }}
                      />
                    )}
                    <span style={{ position: 'relative', zIndex: 1 }}>{translationActionLabel}</span>
                  </motion.button>
                </div>
              }
            />
            <LayerBlock
              label="Sahne Tipi"
              title={
                <div
                  key={isFloating ? 'floating' : 'striped'}
                  style={{ animation: 'conceptATextSwap 200ms ease both' }}
                >
                  <span>{sceneModeName}</span>
                  <span style={{ display: 'block', marginTop: 3, fontSize: 11, fontWeight: 400, color: 'rgba(159,183,207,0.48)', lineHeight: 1.45 }}>
                    {sceneModeBest}
                  </span>
                </div>
              }
              icon="M4 7h16M4 12h16M4 17h10"
              titleStyleOverride={infoTitleStyle}
              interactive={!isTranslating}
              style={{
                opacity: !isTranslating ? 1 : 0.48,
                background: !isTranslating ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
                transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
              }}
              sample={
                <div
                  style={{
                    minHeight: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      display: 'grid',
                      gridTemplateColumns: '40px minmax(0, 116px) 40px',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => applySceneType('floating')}
                      aria-pressed={isFloating}
                      aria-label="Saha Metni"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        color: isFloating ? '#7dd3fc' : 'rgba(159, 183, 207, 0.56)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        justifySelf: 'center',
                        transition: 'color 180ms ease, transform 180ms ease, opacity 180ms ease',
                        transform: isFloating ? 'translateY(-1px)' : 'none',
                        opacity: isFloating ? 1 : 0.82,
                      }}
                    >
                      <LayerGlyph path="M6 6.5h12M6 10.5h9M6 14.5h12M6 18.5h7" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applySceneType(isFloating ? 'striped' : 'floating')}
                      aria-label="Sahne tipini değiştir"
                      style={{
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        position: 'relative',
                        width: '100%',
                        height: 30,
                        borderRadius: 999,
                        background: 'linear-gradient(180deg, rgba(7,11,17,0.88), rgba(4,8,13,0.94))',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.02)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 1.5,
                          bottom: 1.5,
                          left: isFloating ? 2 : 'calc(50% + 0px)',
                          width: 'calc(50% - 2px)',
                          borderRadius: 999,
                          background: 'linear-gradient(180deg, rgba(125,211,252,0.28), rgba(125,211,252,0.14))',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 20px rgba(125,211,252,0.08)',
                          transition: 'left 220ms ease, background 180ms ease, box-shadow 180ms ease',
                        }}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => applySceneType('striped')}
                      aria-pressed={!isFloating}
                      aria-label="Altyazı Şeridi"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        color: isFloating ? 'rgba(159, 183, 207, 0.56)' : '#7dd3fc',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        justifySelf: 'center',
                        transition: 'color 180ms ease, transform 180ms ease, opacity 180ms ease',
                        transform: isFloating ? 'none' : 'translateY(-1px)',
                        opacity: isFloating ? 0.82 : 1,
                      }}
                    >
                      <LayerGlyph path="M4 8h16M4 12h16M4 16h16" />
                    </button>
                  </div>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  </PanelStage>
);

};
