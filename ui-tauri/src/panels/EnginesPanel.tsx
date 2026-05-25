import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { getEventHistory, onEvent, send, useWebSocket, wsClient } from '../bridge/websocket';
import { PanelStage } from './PanelStage';
import { useAppContext } from '../context/AppContext';

// --- Types & Data Interfaces ---
interface HardwareResult {
  recommended_engine: string;
  available_engines: string[];
  engine_details?: Record<string, { available: boolean; reason: string; repair_available?: boolean; repair_kind?: string | null }>;
  cpu: { name: string; cores: number; threads: number };
  gpu: { available: boolean; name: string };
  ram_gb: number;
  cuda_available: boolean;
  winrt_available?: boolean;
}
interface AppSettingsPayload { ocr_engine?: string; }
interface TranslationStatePayload { running?: boolean; engine?: string; }
interface OcrFrameStatPayload {
  engine: string;
  quality: number;
  result: 'accepted' | 'rejected' | 'no_text';
  reason: string;
}
interface OfflineStatusPayload {
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
  model_details?: Record<string, any>;
}

type OfflineModelAction = {
  type: 'install' | 'remove';
  progress: number;
  detail: string;
  stage: string;
  bytes_label: string;
};

const getLast = <T,>(items: T[]) => (items.length > 0 ? items[items.length - 1] : undefined);
const lastHardware = () => (getLast(getEventHistory('hardware_result')) as HardwareResult | undefined) ?? null;
const lastSettings = () => (getLast(getEventHistory('app_settings_loaded')) as AppSettingsPayload | undefined) ?? {};
const lastOfflineStatus = () => (getLast(getEventHistory('offline_model_status')) as OfflineStatusPayload | undefined) ?? null;
const lastFrameStat = () => (getLast(getEventHistory('ocr_frame_stat')) as OcrFrameStatPayload | undefined) ?? null;
const lastTranslationState = () => (getLast(getEventHistory('translation_state')) as TranslationStatePayload | undefined) ?? {};

const normalizeOfflineStatus = (status: OfflineStatusPayload | null): OfflineStatusPayload | null => {
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

const buildOfflineActionMap = (status: OfflineStatusPayload | null): Record<string, OfflineModelAction> => {
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
const colors = {
  accent: '#7dd3fc',
  success: '#86efac',
  error: '#f87171',
  warning: '#fcd34d',
  muted: 'rgba(159,183,207,0.6)',
  textPrimary: '#fff',
  bgGlass: 'rgba(255,255,255,0.03)',
  borderGlass: '1px solid rgba(255,255,255,0.05)',
};

const TS = {
  boxTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(191,215,242,0.72)' },
  pageTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.18em', fontWeight: 700, color: 'rgba(125,211,252,0.55)', margin: 0 },
  pageSub: { fontSize: 13, fontWeight: 400, color: 'rgba(159,183,207,0.55)', marginTop: 4 },
  primary: { color: colors.textPrimary, fontWeight: 600, fontSize: 13 },
};

const G = ({ p, stroke = colors.accent }: { p: string; stroke?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" style={{ width: 18, height: 18 }}>
    <path d={p} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICheck = () => <svg viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" style={{ width: 12, height: 12 }}><polyline points="20 6 9 17 4 12" /></svg>;
const IWarn = () => <svg viewBox="0 0 24 24" fill="none" stroke={colors.warning} strokeWidth="2.5" style={{ width: 12, height: 12 }}><path d="M12 2L2 22h20L12 2zM12 16v-6M12 20h.01" /></svg>;
const IFail = () => <svg viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="2.5" style={{ width: 12, height: 12 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;

// --- MotorDurumu Component ---
interface MotorDurumuProps {
  height?: number | string;
  hardwareInfo: { cpu: string; gpu: string; ram: string; activeEngine: string; cuda_available?: boolean; engine_details?: any };
  healthChecks: Record<string, { label: string; value: string; state: 'ok' | 'warn' | 'error' }[]>;
  models: Record<string, { id: string; name: string; subtitle: string; status: 'active' | 'installed' | 'available' }[]>;
  perfEstimate: Record<string, any>;
  onEngineSelect: (engineId: string) => void;
  selectedEngineId: string;
  isAvailable: (engineId: string) => boolean;
  modelActions: Record<string, { type: 'install' | 'remove'; progress: number; detail: string; stage: string; bytes_label: string }>;
  offlineLangModels: { id: string; name: string; desc: string; size: string; status: 'active' | 'installed' | 'available' }[];
  offlineBusy: boolean;
  completedModelId?: string | null;
  onLangDownload: (modelId: string) => void;
  onLangCancelDownload: (modelId: string) => void;
  onLangRequestRemove: (modelId: string) => void;
  onEasyocrDownload: () => void;
  onEasyocrCancel: () => void;
  onEasyocrRemove: () => void;
  onRefreshHardware?: () => void;
  isScanning?: boolean;
  easyocrAction: OfflineModelAction | null;
  easyocrCompleted: boolean;
}

type EngineInfoKey = 'overview' | 'engine_selection' | 'engine_models' | 'translation_models' |
  'winonly' | 'easy' |
  'w1' | 'w2' | 'w3' | 'm1' | 'm2' | 'm3' |
  'l1' | 'l2' | 'l3';

const engineInfoContent: Record<EngineInfoKey, { title: string; desc: string; detail1: string; detail2: string; detail3: string; }> = {
  overview: {
    title: 'Motor Durumu',
    desc: 'Panel üzerindeki alanların üzerine gelerek detaylı bilgi alabilirsiniz.',
    detail1: 'Sol menüden aktif okuyucu motorunu seçebilirsiniz.',
    detail2: 'Sağ tarafta motorun bağımlılıkları ve modelleri bulunur.',
    detail3: 'Alttaki bar anlık performans tahminini gösterir.'
  },
  engine_selection: {
    title: 'Motor Seçimi',
    desc: 'Çeviri işlemini yapacak temel OCR ve işlem motorunu belirler.',
    detail1: 'WindowsOCR: Hızlı ve sisteme gömülüdür.',
    detail2: 'EasyOCR: Yüksek isabetli ve yapay zeka desteklidir.',
    detail3: ''
  },
  engine_models: {
    title: 'Motor Modelleri',
    desc: 'Seçili motorun çalışma yeteneğini sağlayan alt model ve ağ dosyalarıdır.',
    detail1: 'Bu dosyalar motorun görüntü işleme algoritmasını barındırır.',
    detail2: 'Bulut ibaresi olanlar indirilmeye hazırdır.',
    detail3: 'Sistem modelleri cihaza kurulu olarak gelir.'
  },
  translation_models: {
    title: 'Çeviri Dil Modelleri',
    desc: 'Çevrimdışı (offline) metin çevirisi yapacak olan MarianMT vb. ağlardır.',
    detail1: 'İnternet bağlantısına ihtiyaç duymadan çeviri yapar.',
    detail2: 'Dosya boyutları yüksektir (100MB+).',
    detail3: 'Birden fazla çeviri modeli aynı anda kurulu kalabilir.'
  },
  winonly: { title: 'WindowsOCR', desc: 'Windows içerisine gömülü çalışan varsayılan optik okuyucudur.', detail1: 'Kurulum veya indirme gerektirmez.', detail2: 'Sıfıra yakın performans yükü yaratır.', detail3: 'Standart ve net fontlarda çok başarılıdır.' },
  easy: { title: 'EasyOCR', desc: 'Görüntü işleme tabanlı yapay zeka okuyucu motorudur.', detail1: 'CUDA destekli ekran kartı gerektirir.', detail2: 'Oyun içi karmaşık fontları okuyabilir.', detail3: 'Performans tüketimi nispeten daha yüksektir.' },
  w1: { title: 'TR Paketi (Win)', desc: 'Windows için Türkçe dil paketi bağımlılığıdır.', detail1: 'Sistem dili veya OCR paketi olarak kurulur.', detail2: 'Gerekli dil paketleri ayarlardan yönetilebilir.', detail3: 'Aktif olduğunda anında çalışmaya başlar.' },
  w2: { title: 'EN Paketi (Win)', desc: 'Windows için İngilizce dil paketi bağımlılığıdır.', detail1: 'Buluttan indirilip sisteme entegre edilebilir.', detail2: 'Uluslararası oyunlarda temel dildir.', detail3: 'Çok hızlı sonuç döndürür.' },
  w3: { title: 'JA Paketi (Win)', desc: 'Windows için Japonca dil paketi bağımlılığıdır.', detail1: 'Özellikle Asya menşeili oyunlar için gereklidir.', detail2: 'Gelişmiş karakter algılama sunar.', detail3: 'İndirildikten sonra anında devreye girer.' },
  m1: { title: 'Tanıma Ağı (Easy)', desc: 'EasyOCR ana karakter tanıma yapay zeka modelidir.', detail1: 'Yüksek doğrulukla harfleri birleştirir.', detail2: 'Bellek üzerinde yer kaplar.', detail3: 'Sürekli aktif olarak çalışır.' },
  m2: { title: 'Algılama (Easy)', desc: 'Ekrandaki yazıların konumlarını bulan modeldir.', detail1: 'Yazı kutularını tespit eder.', detail2: 'Performanslı çalışması için CUDA önemlidir.', detail3: 'Tanıma ağından önce devreye girer.' },
  m3: { title: 'El Yazısı (Easy)', desc: 'El yazısı stiline sahip fontları okuma ağıdır.', detail1: 'Geleneksel RPG oyunlarında sıkça kullanılır.', detail2: 'Normal okuma ağından daha esnektir.', detail3: 'Gerektiğinde indirilebilir.' },
  l1: { title: 'EN -> TR Çeviri', desc: 'İngilizceden Türkçeye tam çevrimdışı çeviri yapan dev modeldir.', detail1: 'MarianMT makine çeviri ağını kullanır.', detail2: 'Tamamen yerel çalıştığı için internet gerektirmez.', detail3: 'Yaklaşık 142 MB depolama alanı kaplar.' },
  l2: { title: 'TR -> EN Çeviri', desc: 'Türkçeden İngilizceye çevrimdışı çeviri yapan makine modelidir.', detail1: 'MarianMT tabanlıdır ve internetsiz çalışır.', detail2: 'Tersine çeviri ihtiyacı olan kullanıcılar içindir.', detail3: 'Kurulduktan sonra anında kullanılabilir.' },
  l3: { title: 'JA -> TR Çeviri', desc: 'Japoncadan Türkçeye çeviri yapan deneysel bir ağ modelidir.', detail1: 'Fugumt mimarisi üzerine geliştirilmiştir.', detail2: 'Anime veya JRPG çevirilerinde kullanılır.', detail3: 'Deneysel olduğu için hatalı cümleler üretebilir.' }
};

const EngineInfoDock = ({ info, visible }: { info: typeof engineInfoContent['overview']; visible: boolean }) => {
  const [displayInfo, setDisplayInfo] = useState(info);
  const [contentVisible, setContentVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);

  useEffect(() => {
    if (info.title === displayInfo.title) return;
    setContentVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayInfo(info);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 90);
    return () => window.clearTimeout(timeout);
  }, [displayInfo.title, info]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const updateHeight = () => setDockHeight(node.scrollHeight + 24);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayInfo]);

  return (
    <div
      data-info-panel="true"
      style={{
        position: 'absolute', right: 18, bottom: 94, width: 262, maxWidth: 'calc(100% - 36px)',
        zIndex: 18, borderRadius: 16, border: '1px solid rgba(125,211,252,0.20)',
        background: 'linear-gradient(180deg, rgba(10,18,29,0.96), rgba(7,13,21,0.93))',
        boxShadow: '0 22px 54px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)',
        padding: '12px 13px', pointerEvents: 'auto', backdropFilter: 'blur(14px)',
        height: dockHeight ?? undefined, overflow: 'hidden',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.985)',
        filter: visible ? 'blur(0px) saturate(1)' : 'blur(3px) saturate(0.92)',
        clipPath: visible ? 'inset(0% 0% 0% 0% round 16px)' : 'inset(8% 6% 8% 6% round 16px)',
        transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease, height 180ms ease',
      }}
    >
      <div
        ref={contentRef}
        style={{
          opacity: contentVisible ? 1 : 0, transform: contentVisible ? 'translateY(0)' : 'translateY(4px)',
          filter: contentVisible ? 'blur(0px)' : 'blur(2px)', transition: 'opacity 130ms ease, transform 130ms ease, filter 130ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: '#e2eefb', fontWeight: 750, letterSpacing: '-0.01em' }}>{displayInfo.title}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(125,211,252,0.78)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>BİLGİ</div>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 11, lineHeight: 1.5, color: 'rgba(191,215,242,0.84)' }}>
          <div><span style={{ color: '#93c5fd', fontWeight: 800 }}>•</span> {displayInfo.desc}</div>
          <div><span style={{ color: '#86efac', fontWeight: 800 }}>•</span> {displayInfo.detail1}</div>
          <div><span style={{ color: '#fcd34d', fontWeight: 800 }}>•</span> {displayInfo.detail2}</div>
          <div><span style={{ color: '#c4b5fd', fontWeight: 800 }}>•</span> {displayInfo.detail3}</div>
        </div>
      </div>
    </div>
  );
};

const InfoButton = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
  <button
    type="button"
    data-info-toggle="true"
    aria-pressed={enabled}
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    style={{
      width: 20, height: 20, border: 'none', background: 'transparent',
      color: enabled ? '#dff8ff' : 'rgba(172,214,255,0.82)', padding: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      opacity: enabled ? 1 : 0.78, cursor: 'pointer',
      filter: enabled ? 'drop-shadow(0 0 8px rgba(56,189,248,0.34))' : 'none',
      transition: 'color 180ms ease, opacity 180ms ease, filter 180ms ease'
    }}
  >
    <G p="M12 17v-6M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </button>
);

const MotorDurumu: React.FC<MotorDurumuProps> = ({ height = '100%', hardwareInfo, healthChecks, models, perfEstimate, onEngineSelect, selectedEngineId, isAvailable, offlineLangModels, offlineBusy, modelActions, completedModelId, onLangDownload, onLangCancelDownload, onLangRequestRemove, onEasyocrDownload, onEasyocrCancel, onEasyocrRemove, onRefreshHardware, isScanning, easyocrAction, easyocrCompleted }) => {
  const currentEngineId = selectedEngineId;
  const currentChecks = healthChecks[currentEngineId] || [];
  const currentModels = models[currentEngineId] || [];
  const perf = perfEstimate[currentEngineId] || { fps: '--', latency: '--', gpuUsage: '--', fpsBar: 0, latencyBar: 0, gpuBar: 0 };

  const [infoEnabled, setInfoEnabled] = useState(false);
  const [activeInfoKey, setActiveInfoKey] = useState<EngineInfoKey>('overview');
  const [infoDockMounted, setInfoDockMounted] = useState(false);
  const [infoDockVisible, setInfoDockVisible] = useState(false);
  const [dynamicInfo, setDynamicInfo] = useState<typeof engineInfoContent['overview'] | null>(null);

  useEffect(() => {
    if (!infoEnabled) return undefined;
    const closeOnEmptyClick = (e: MouseEvent) => {
      if (e.button === 2) {
        setInfoEnabled(false);
        setActiveInfoKey('overview');
        setDynamicInfo(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-info-hotspot="true"], [data-info-toggle="true"], [data-info-panel="true"]')) return;
      setInfoEnabled(false);
      setActiveInfoKey('overview');
      setDynamicInfo(null);
    };
    window.addEventListener('mousedown', closeOnEmptyClick);
    return () => window.removeEventListener('mousedown', closeOnEmptyClick);
  }, [infoEnabled]);

  useEffect(() => {
    if (infoEnabled) {
      setInfoDockMounted(true);
      const frame = window.requestAnimationFrame(() => setInfoDockVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setInfoDockVisible(false);
    const timeout = window.setTimeout(() => setInfoDockMounted(false), 170);
    return () => window.clearTimeout(timeout);
  }, [infoEnabled]);

  const focusInfo = (key: EngineInfoKey | typeof engineInfoContent['overview']) => {
    if (infoEnabled) {
      if (typeof key === 'string') {
        setActiveInfoKey(key as EngineInfoKey);
        setDynamicInfo(null);
      } else {
        setDynamicInfo(key);
      }
    }
  };

  const enginesData = [
    { 
      id: 'winonly', name: 'Windows OCR', 
      purpose: 'Gömülü Windows API kullanarak net metinleri ve UI öğelerini sıfır gecikmeyle yakalar.',
      reqs: 'WİN 10/11 YEREL OKUYUCU', speed: 'ÇOK HIZLI / SIFIR YÜK',
      icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z', 
      deps: [{ label: 'Paket', ok: isAvailable('winonly') }] 
    },
    { 
      id: 'easy', name: 'EasyOCR', 
      purpose: 'Derin öğrenme modelleri ile oyundaki zorlu fontları yüksek doğrulukla analiz eder.',
      reqs: 'CUDA DESTEKLİ GPU (4GB+)', speed: 'DENGELİ / YÜKSEK İSABET',
      icon: 'M13 10V3L4 14h7v7l9-11h-7z', 
      deps: [
        { label: 'CUDA', ok: hardwareInfo?.cuda_available, warn: !hardwareInfo?.cuda_available, warnText: 'CPU' }, 
        { label: 'Model', ok: isAvailable('easy') }
      ] 
    },
  ];

  return (
    <div style={{ position: 'relative', zIndex: 1, width: '100%', height, padding: '62px 34px 32px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
      
      {/* 1. PAGE HEADER */}
      <div style={{ flexShrink: 0 }}>
        <h1 style={TS.pageTitle}>MOTOR DURUMU</h1>
        <div style={TS.pageSub}>Motorların bağımlılık sağlığı, model durumu ve performans tahmini.</div>
      </div>

      {/* 2. HARDWARE SUMMARY ROW (Unified Bar) */}
      <div style={{ background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '12px 16px', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>
        {[
          { label: 'CPU', val: hardwareInfo.cpu, sub: 'İşlemci Birimi', bLabel: 'AKTİF', bColor: colors.success },
          { label: 'GPU', val: hardwareInfo.gpu, sub: 'Grafik Birimi', bLabel: 'AKTİF', bColor: colors.success },
          { label: 'RAM', val: hardwareInfo.ram, sub: 'Sistem Belleği', bLabel: 'AKTİF', bColor: colors.success },
          { label: 'AKTİF MOTOR', val: hardwareInfo.activeEngine.toUpperCase(), sub: 'Seçili Motor', bLabel: 'AKTİF', bColor: colors.accent }
        ].map((c, i) => (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', height: 22 }}>
                <div style={TS.boxTitle}>{c.label}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.val}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'rgba(159,183,207,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.sub}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: c.bColor, flexShrink: 0 }}>{c.bLabel}</div>
                </div>
              </div>
            </div>
            {i < 3 && <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', flexShrink: 0, margin: '0 4px' }} />}
          </React.Fragment>
        ))}
      </div>

      {/* 3. MAIN BODY */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, minHeight: 0, marginTop: -6 }}>
        
        {/* Left Column - Engine List */}
        <div data-info-hotspot="true" onMouseEnter={() => focusInfo('engine_selection')} style={{ flex: 1, background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: isScanning ? 0.6 : 1, pointerEvents: isScanning ? 'none' : 'auto', transition: 'opacity 200ms ease' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 22 }}>
              <div style={TS.boxTitle}>MOTOR SEÇİMİ</div>
              <InfoButton enabled={infoEnabled} onToggle={() => setInfoEnabled(!infoEnabled)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Aktif Motor</span>
              <span style={{ fontSize: 11, color: 'rgba(159,183,207,0.45)' }}>Optimum okuyucuyu belirle</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {enginesData.map(eng => {
              const isSelected = selectedEngineId === eng.id;
              const isReady = isAvailable(eng.id);
              return (
                <div
                  key={eng.id}
                  className="engine-card"
                  data-info-hotspot="true"
                  onMouseEnter={(e) => { e.stopPropagation(); focusInfo(eng.id as EngineInfoKey); }}
                  onClick={() => onEngineSelect(eng.id)}
                  style={{
                    position: 'relative', overflow: 'hidden', borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
                    background: isSelected ? 'rgba(125,211,252,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? (isReady ? 'rgba(125,211,252,0.2)' : 'rgba(248,113,113,0.3)') : 'rgba(255,255,255,0.03)'}`,
                    display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: isSelected ? `inset 0 0 0 1px ${isReady ? 'rgba(125,211,252,0.15)' : 'rgba(248,113,113,0.15)'}, 0 0 20px ${isReady ? 'rgba(125,211,252,0.08)' : 'rgba(248,113,113,0.08)'}` : 'none',
                    opacity: 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {eng.name}
                        {eng.id === 'easy' && !hardwareInfo?.cuda_available && (
                          <span style={{ fontSize: 8, background: 'rgba(252,211,77,0.15)', color: '#fcd34d', padding: '1px 5px', borderRadius: 4 }}>CPU MODU</span>
                        )}
                      </div>
                      {isSelected && isReady && <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '2px 6px', borderRadius: 6, letterSpacing: '0.04em' }}>AKTİF</span>}
                      {isSelected && !isReady && <span style={{ fontSize: 9, fontWeight: 800, background: 'rgba(248,113,113,0.15)', color: '#f87171', padding: '2px 6px', borderRadius: 6, letterSpacing: '0.04em', animation: 'removeBlink 1s infinite alternate' }}>İNDİRME GEREKLİ</span>}
                    </div>
                  <div style={{ fontSize: 11, color: 'rgba(159,183,207,0.45)', lineHeight: 1.35, opacity: isReady ? 1 : 0.6 }}>{eng.purpose}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <div style={{ fontSize: 9, color: 'rgba(191,215,242,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{eng.reqs}</div>
                    <div style={{ fontSize: 9, color: isSelected ? (isReady ? colors.accent : colors.error) : colors.success, fontWeight: 700, letterSpacing: '0.02em' }}>
                      {isReady ? eng.speed : 'EKSİK EKLENTİ'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column - Panel A (Split) & B */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: 8, flex: 1, minHeight: 0 }}>
            {/* Panel A1: Sistem Sağlığı */}
            <div style={{ width: '100%', minWidth: 0, background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: isScanning ? 0.6 : 1, transition: 'opacity 200ms ease' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 22 }}>
                  <div style={TS.boxTitle}>SİSTEM SAĞLIĞI</div>
                  <div style={{ color: 'rgba(172,214,255,0.82)' }}><G p="M22 12h-4l-3 9L9 3l-3 9H2" /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{enginesData.find(e => e.id === currentEngineId)?.name}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {currentChecks.map((chk, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {chk.state === 'ok' ? <ICheck/> : chk.state === 'warn' ? <IWarn/> : <IFail/>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, maxWidth: '100%' }}>
                      <div style={{ fontSize: 10, color: colors.muted, lineHeight: 1.3, whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{chk.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.35, color: chk.state === 'ok' ? colors.success : chk.state === 'warn' ? colors.warning : colors.error, whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{chk.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel A2: Motor Modelleri */}
            <div className="engine-block" data-info-hotspot="true" onMouseEnter={() => focusInfo('engine_models')} style={{ width: '100%', minWidth: 0, background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: isScanning ? 0.6 : 1, pointerEvents: isScanning ? 'none' : 'auto', transition: 'opacity 200ms ease' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 22 }}>
                  <div style={TS.boxTitle}>MOTOR MODELLERİ</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ color: 'rgba(172,214,255,0.82)' }}><G p="M12 2l10 6-10 6-10-6 10-6z" /></div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>OCR Verileri</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {currentModels.map(mdl => {
                  let action = modelActions[mdl.id];
                  let isCompleted = false;
                  
                  // EasyOCR özel plugin aksiyonlarını bağla
                  if (mdl.id === 'm1') {
                     action = easyocrAction || action;
                     isCompleted = easyocrCompleted;
                  }

                  const hasActionButton = !!action || 
                    (mdl.id === 'm1') || // m1 always has either download or remove
                    (mdl.id === 'w1' && currentEngineId === 'winonly' && mdl.status === 'available') || 
                    (mdl.id === 'w2' && currentEngineId === 'winonly');

                  return (
                  <div key={mdl.id} className={`item-feedback ${hasActionButton ? 'has-action' : ''}`} data-info-hotspot="true" onMouseEnter={(e) => { e.stopPropagation(); focusInfo(mdl.id as EngineInfoKey); }} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 8px', margin: '0 -8px', borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
                    {action && (
                      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${action.progress}%`, background: action.type === 'install' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.12)', transition: 'width 200ms ease', zIndex: 0, borderRight: `1px solid ${action.type === 'install' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(239, 68, 68, 0.4)'}` }} />
                    )}
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: mdl.status === 'active' || mdl.status === 'installed' ? colors.success : colors.error, flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: colors.textPrimary, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mdl.name}</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 9 }}>
                          {action ? (
                             <>
                               <span style={{ color: action.type === 'install' ? colors.accent : colors.error, fontWeight: 600 }}>{action.detail}</span>
                               {action.bytes_label && <span style={{ color: colors.muted }}>({action.bytes_label})</span>}
                             </>
                          ) : (
                             <span style={{ color: colors.muted }}>{isCompleted ? 'Kurulum tamamlandı' : mdl.subtitle}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, position: 'relative', minWidth: 28, minHeight: 28, justifyContent: 'center' }}>
                        {action ? (
                           <>
                             <span style={{ fontSize: 9, fontWeight: 700, color: action.type === 'install' ? colors.accent : colors.error }}>%{action.progress}</span>
                             {mdl.id === 'm1' && action.type === 'install' && (
                               <button className="model-action-icon action-stop" title="İndirmeyi durdur" onClick={(e) => { e.stopPropagation(); onEasyocrCancel(); }}>
                                 <G p="M6 6h12v12H6z" stroke="currentColor" />
                               </button>
                             )}
                           </>
                        ) : (
                          <>
                            {mdl.status === 'active' && <span className="model-state-text" style={{ position: 'absolute', right: 8, fontSize: 9, fontWeight: 700, color: colors.success }}>AKTİF</span>}
                            {mdl.status === 'installed' && <span className="model-state-text" style={{ position: 'absolute', right: 8, fontSize: 9, fontWeight: 700, color: colors.muted }}>KURULU</span>}
                            
                            {mdl.id === 'm1' && mdl.status === 'available' && (
                              <button 
                                className="model-action-icon action-download" 
                                title="EasyOCR Eklentisini İndir" 
                                data-info-hotspot="true"
                                onMouseEnter={(e) => { 
                                  e.stopPropagation(); 
                                  focusInfo({
                                    title: 'EasyOCR İndirimi',
                                    desc: 'Seçili motorun sorunsuz çalışabilmesi için gerekli olan python eklentisidir.',
                                    detail1: 'İndirme işlemi boyut ve internetinize göre birkaç dakika sürebilir.',
                                    detail2: 'Tamamlandığında arka planda otomatik kurulur.',
                                    detail3: 'Kurulum sırasında uygulamayı kapatmamaya özen gösterin.'
                                  }); 
                                }}
                                onClick={(e) => { e.stopPropagation(); onEasyocrDownload(); }}
                              >
                                <G p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4" stroke="currentColor" />
                              </button>
                            )}
                            {mdl.id === 'm1' && (mdl.status === 'installed' || mdl.status === 'active') && (
                              <button 
                                className="model-action-icon action-remove" 
                                title="EasyOCR Eklentisini Kaldır"
                                onClick={(e) => { e.stopPropagation(); onEasyocrRemove(); }}
                              >
                                <G p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" />
                              </button>
                            )}
                            {mdl.id === 'w1' && currentEngineId === 'winonly' && mdl.status === 'available' && (
                              <button 
                                className="model-action-icon action-download" 
                                title="Dil Paketini Kur (Ayarlar)" 
                                data-info-hotspot="true"
                                onMouseEnter={(e) => { 
                                  e.stopPropagation(); 
                                  focusInfo({
                                    title: 'Sistem Onarımı',
                                    desc: `Tespit Edilen Hata: ${hardwareInfo?.engine_details?.winonly?.reason || 'Windows OCR dil paketi eksik.'}`,
                                    detail1: 'Windows 10/11 üzerinde OCR bileşeni yüklü değil.',
                                    detail2: 'Bu butona tıklayarak doğrudan Windows Dil Ayarları\'na gidebilirsiniz.',
                                    detail3: 'İlgili dil seçeneğini yüklediğinizde bu uyarı kalkacaktır.'
                                  }); 
                                }}
                                onClick={(e) => { e.stopPropagation(); wsClient.send('repair_engine', { engine: 'winonly' }); }}
                              >
                                <G p="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" />
                              </button>
                            )}
                            {mdl.id === 'w2' && currentEngineId === 'winonly' && (
                              <button 
                                className="model-action-icon action-download" 
                                title="Dili Kurdum, Tekrar Dene" 
                                data-info-hotspot="true"
                                onMouseEnter={(e) => { 
                                  e.stopPropagation(); 
                                  focusInfo({
                                    title: 'Motorları Yeniden Tara',
                                    desc: 'Windows OCR paketini kurduktan sonra değişiklikleri algılar.',
                                    detail1: 'Kurulumu tamamladıysanız bu tuş ile sistemi taratın.',
                                    detail2: 'Uygulamayı yeniden başlatmanıza gerek kalmaz.',
                                    detail3: 'Sorun çözüldüyse uyarılar kalkacaktır.'
                                  }); 
                                }}
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  if (onRefreshHardware) {
                                    onRefreshHardware();
                                  } else {
                                    wsClient.send('get_hardware'); 
                                  }
                                }}
                              >
                                <G p="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          </div>

          {/* Panel B: Çeviri Dil Modelleri */}
          <div className="engine-block" data-info-hotspot="true" onMouseEnter={() => focusInfo('translation_models')} style={{ flex: 1, background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 22 }}>
                <div style={TS.boxTitle}>ÇEVİRİ DİL MODELLERİ</div>
                <div style={{ color: 'rgba(172,214,255,0.82)', display: 'flex' }}><G p="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z M2 12h20" /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Offline Çeviri Motorları</span>
                <span style={{ fontSize: 11, color: 'rgba(159,183,207,0.45)' }}>Yüklü dil paketleri</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {offlineLangModels.map(lang => {
                const action = modelActions[lang.id];
                const completed = completedModelId === lang.id;
                const isInstalled = lang.status === 'active' || lang.status === 'installed';

                const iconPath = completed ? null
                  : action?.type === 'remove' ? 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                  : action?.type === 'install' ? 'M12 3v12m0 0l-4-4m4 4l4-4M5 19h14'
                  : isInstalled ? 'M5 13l4 4L19 7'
                  : 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4';

                const iconStroke = action?.type === 'remove' ? colors.error
                  : action?.type === 'install' ? colors.warning
                  : isInstalled ? colors.success : colors.accent;

                const iconBg = action?.type === 'remove' ? 'rgba(248,113,113,0.12)'
                  : action?.type === 'install' ? 'rgba(252,211,77,0.10)'
                  : isInstalled ? 'rgba(134,239,172,0.10)'
                  : 'rgba(125,211,252,0.08)';

                const detailText = action
                  ? (action.type === 'remove' ? 'Kaldırılıyor...' : action.detail || 'İndiriliyor...')
                  : completed ? 'Kurulum tamamlandı' : lang.size;

                const detailColor = action
                  ? (action.type === 'remove' ? colors.error : colors.warning)
                  : completed ? colors.success : colors.muted;

                return (
                  <div
                    key={lang.id}
                    className={`lang-row${completed ? ' item-completed' : ''}`}
                    data-info-hotspot="true"
                    onMouseEnter={(e) => { e.stopPropagation(); focusInfo(lang.id as EngineInfoKey); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', margin: '0 -8px', borderRadius: 12, position: 'relative', overflow: 'hidden' }}
                  >
                    {/* Arka plan progress şeridi */}
                    {action && (
                      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${action.progress}%`, background: action.type === 'install' ? 'rgba(252,211,77,0.10)' : 'rgba(239,68,68,0.08)', transition: 'width 300ms cubic-bezier(0.4,0,0.2,1)', zIndex: 0, borderRight: `1px solid ${action.type === 'install' ? 'rgba(252,211,77,0.35)' : 'rgba(239,68,68,0.35)'}` }} />
                    )}

                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', width: '100%', alignItems: 'center', gap: 10 }}>
                      {/* İkon */}
                      <div style={{ width: 28, height: 28, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 200ms ease' }}>
                        {completed ? <ICheck /> : iconPath ? <G p={iconPath} stroke={iconStroke} /> : <ICheck />}
                      </div>

                      {/* İsim + detay alt yazısı */}
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: colors.textPrimary, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lang.name}</div>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
                          <span style={{ fontSize: 10, color: colors.muted, flexShrink: 0 }}>{lang.desc}</span>
                          {action && action.detail ? (
                            <>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>·</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: action.type === 'install' ? (action.stage === 'paused' || action.stage === 'queued' ? colors.muted : colors.warning) : colors.error, flexShrink: 0, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                                {action.stage === 'packages' ? 'Paket' : action.stage === 'converting' ? 'Dönüştürme' : action.stage === 'verifying' ? 'Doğrulama' : action.stage === 'remove' ? 'Siliniyor' : action.stage === 'paused' ? 'Duraklatıldı' : action.stage === 'queued' ? 'Sırada' : 'İndir'}
                              </span>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>›</span>
                              <span style={{ fontSize: 10, color: action.stage === 'paused' || action.stage === 'queued' ? 'rgba(159,183,207,0.55)' : 'rgba(191,215,242,0.72)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{action.detail}</span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>•</span>
                              <span style={{ fontSize: 10, color: detailColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detailText}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Sağ: durum özeti ve hover aksiyon ikonu */}
                      <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                        {action?.type === 'install' ? (
                          <>
                            {action.bytes_label && <span style={{ fontSize: 10, color: 'rgba(191,215,242,0.55)', whiteSpace: 'nowrap' as const }}>{action.bytes_label}</span>}
                            <span style={{ fontSize: 10, fontWeight: 700, color: action.stage === 'paused' || action.stage === 'queued' ? colors.muted : colors.warning }}>%{action.progress}</span>
                            {action.stage === 'paused' || action.stage === 'queued' ? (
                              <button className="model-action-icon action-download" title="Öncelikli olarak indir" aria-label="Modeli indir" onClick={(e) => { e.stopPropagation(); onLangDownload(lang.id); }}>
                                <G p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4" stroke="currentColor" />
                              </button>
                            ) : (
                              <button className="model-action-icon action-stop" title="İndirmeyi durdur" aria-label="İndirmeyi durdur" onClick={(e) => { e.stopPropagation(); onLangCancelDownload(lang.id); }}>
                                <G p="M6 6h12v12H6z" stroke="currentColor" />
                              </button>
                            )}
                          </>
                        ) : action?.type === 'remove' ? (
                          <span className="model-state-icon model-state-removing" title="Kaldırılıyor"><G p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" /></span>
                        ) : isInstalled ? (
                          <>
                            <button className="model-action-icon action-remove" disabled={offlineBusy} title="Modeli kaldır" aria-label="Modeli kaldır" onClick={(e) => { e.stopPropagation(); onLangRequestRemove(lang.id); }}>
                              <G p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" />
                            </button>
                          </>
                        ) : (
                          <button className="model-action-icon action-download" title={offlineBusy ? "Öncelikli olarak indir" : "Modeli indir"} aria-label="Modeli indir" onClick={(e) => { e.stopPropagation(); onLangDownload(lang.id); }}>
                            <G p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4" stroke="currentColor" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM BAR */}
      <div style={{ flexShrink: 0, background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {[
          { label: 'TAHMİNİ FPS', val: perf.fps, pct: perf.fpsBar, fill: colors.success, glow: 'rgba(134,239,172,0.4)', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
          { label: 'GECİKME (LATENCY)', val: perf.latency, pct: perf.latencyBar, fill: colors.warning, glow: 'rgba(252,211,77,0.4)', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'GPU YÜKÜ', val: perf.gpuUsage, pct: perf.gpuBar, fill: colors.accent, glow: 'rgba(125,211,252,0.4)', icon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z M9 9h6v6H9z' }
        ].map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '30%', padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, color: m.fill, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '100%', height: '100%' }}>
                    <path d={m.icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(191,215,242,0.72)', fontWeight: 700, letterSpacing: '0.05em' }}>{m.label}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textShadow: `0 0 12px ${m.glow}` }}>{m.val}</div>
            </div>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: `${m.pct}%`, height: '100%', background: m.fill, borderRadius: 2, boxShadow: `0 0 8px ${m.glow}`, transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
            </div>
          </div>
        ))}
      </div>

      {infoDockMounted && <EngineInfoDock info={dynamicInfo || engineInfoContent[activeInfoKey]} visible={infoDockVisible} />}
    </div>
  );
};

// --- App Integration Wrapper ---
export const EnginesPanel: React.FC = () => {
  const { notify } = useAppContext();
  const { isConnected } = useWebSocket();
  const initialSettings = lastSettings();
  const initialTranslationState = lastTranslationState();
  const [hardware, setHardware] = useState<HardwareResult | null>(lastHardware);
  const [selectedEngine, setSelectedEngine] = useState(initialSettings.ocr_engine ?? 'easy');
  const [isTranslating, setIsTranslating] = useState(Boolean(initialTranslationState.running));
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatusPayload | null>(normalizeOfflineStatus(lastOfflineStatus()));
  const [frameStat, setFrameStat] = useState<OcrFrameStatPayload | null>(lastFrameStat);
  const [modelActions, setModelActions] = useState<Record<string, OfflineModelAction>>(() => buildOfflineActionMap(normalizeOfflineStatus(lastOfflineStatus())));
  const actionStartRef = useRef<Record<string, number>>({});
  const [completedModelId, setCompletedModelId] = useState<string | null>(null);
  const [confirmRemoveLangId, setConfirmRemoveLangId] = useState<string | null>(null);
  
  // EasyOCR Plugin State
  const [easyocrAction, setEasyocrAction] = useState<OfflineModelAction | null>(null);
  const [isHardwareScanning, setIsHardwareScanning] = useState(false);
  const [easyocrCompleted, setEasyocrCompleted] = useState(false);


  const confirmTimerRef = useRef<number | null>(null);

  const injectInfoLog = (code: string, message: string) => {
    wsClient.injectEvent('log_entry', {
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
      level: 'INFO',
      prefix: 'UI',
      code,
      message,
    });
  };

  useEffect(() => {
    if (isConnected && !lastHardware()) send('get_hardware');
    if (isConnected && !lastOfflineStatus()) send('get_offline_status');
    const offHardware = onEvent('hardware_result', (data) => {
      setHardware(data as HardwareResult);
      setIsHardwareScanning(false);
    });
    const offSettings = onEvent('app_settings_loaded', (data) => {
      const payload = data as AppSettingsPayload;
      if (payload.ocr_engine) setSelectedEngine(payload.ocr_engine);
    });
    const offTranslationState = onEvent('translation_state', (data) => {
      const payload = data as TranslationStatePayload;
      setIsTranslating(Boolean(payload.running));
      if (payload.running && payload.engine) {
        setSelectedEngine(payload.engine);
      }
    });
    const offOfflineStatus = onEvent('offline_model_status', (data) => {
      const normalized = normalizeOfflineStatus(data as OfflineStatusPayload);
      setOfflineStatus(normalized);
      setModelActions((current) => {
        const next = buildOfflineActionMap(normalized);
        return Object.keys(next).length > 0 || Object.keys(current).length === 0 ? next : {};
      });
    });
    const offOfflineProgress = onEvent('offline_model_progress', (data) => {
      const d = data as { model?: string; stage?: string; percent?: number; detail?: string; bytes_label?: string };
      const modelId = d.model ?? '';
      const stage = d.stage ?? 'downloading';
      const isRemove = stage === 'remove';
      if (modelId) {
        if (!actionStartRef.current[modelId]) actionStartRef.current[modelId] = Date.now();
        setModelActions(prev => ({
          ...prev,
          [modelId]: {
            type: isRemove ? 'remove' : 'install',
            progress: Number(d.percent ?? prev[modelId]?.progress ?? 0),
            detail: String(d.detail ?? prev[modelId]?.detail ?? ''),
            stage,
            bytes_label: String(d.bytes_label ?? prev[modelId]?.bytes_label ?? ''),
          },
        }));
      }
      setOfflineStatus((current) => current ? normalizeOfflineStatus({
        ...current,
        active_model: modelId || current.active_model,
        active_install_model: modelId || current.active_install_model,
        active_action: isRemove ? 'remove' : 'install',
        busy: true,
        percent: Number(d.percent ?? current.percent ?? 0),
        detail: String(d.detail ?? current.detail ?? ''),
        bytes_label: String(d.bytes_label ?? current.bytes_label ?? ''),
        state: stage,
      }) : current);
    });
    const offOfflineComplete = onEvent('offline_model_complete', (data) => {
      const model = String((data as { model?: string }).model ?? '');
      if (model) {
        setModelActions(prev => { const next = { ...prev }; delete next[model]; return next; });
        delete actionStartRef.current[model];
        setCompletedModelId(model);
        window.setTimeout(() => {
          setCompletedModelId((current) => current === model ? null : current);
        }, 3000);
      }
      send('get_offline_status');
    });
    const offOfflineCancelled = onEvent('offline_model_cancelled', (data) => {
      const model = String((data as { model?: string }).model ?? '');
      if (model) { setModelActions(prev => { const next = { ...prev }; delete next[model]; return next; }); delete actionStartRef.current[model]; }
      else { setModelActions({}); actionStartRef.current = {}; }
      send('get_offline_status');
    });
    const offOfflineError = onEvent('offline_model_error', (data) => {
      const model = String((data as { model?: string }).model ?? '');
      if (model) { setModelActions(prev => { const next = { ...prev }; delete next[model]; return next; }); delete actionStartRef.current[model]; }
      else { setModelActions({}); actionStartRef.current = {}; }
      send('get_offline_status');
    });
    const offFrameStat = onEvent('ocr_frame_stat', (data) => setFrameStat(data as OcrFrameStatPayload));
    
    // EasyOCR Plugin Events
    const offEasyProgress = onEvent('easyocr_plugin_progress', (data: any) => {
      const isRemove = data.stage === 'remove';
      setEasyocrAction({
        type: isRemove ? 'remove' : 'install',
        progress: data.percent ?? 0,
        detail: data.detail ?? '',
        stage: data.stage ?? 'downloading',
        bytes_label: data.bytes_label ?? ''
      });
    });
    const offEasyComplete = onEvent('easyocr_plugin_complete', () => {
      setEasyocrAction(null);
      setEasyocrCompleted(true);
      window.setTimeout(() => setEasyocrCompleted(false), 3000);
      send('get_hardware'); // Hardware'i yenile ki motoraktif dussun
    });
    const offEasyCancel = onEvent('easyocr_plugin_cancelled', () => {
      setEasyocrAction(null);
    });
    const offEasyError = onEvent('easyocr_plugin_error', (data: any) => {
      setEasyocrAction(null);
      notify('error', String(data?.detail ?? 'EasyOCR indirme hatasi.'));
    });

    return () => {
      offHardware();
      offSettings();
      offTranslationState();
      offOfflineStatus();
      offOfflineProgress();
      offOfflineComplete();
      offOfflineCancelled();
      offOfflineError();
      offFrameStat();
      offEasyProgress();
      offEasyComplete();
      offEasyCancel();
      offEasyError();
    };
  }, [isConnected]);

  useEffect(() => {
    if (!confirmRemoveLangId) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleLangCancelRemove();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmRemoveLangId]);

  const mockHardwareInfo = {
    cpu: hardware?.cpu.name || 'Bilinmiyor',
    gpu: hardware?.gpu.name || 'Bilinmiyor',
    ram: hardware?.ram_gb ? `${hardware.ram_gb} GB` : 'Bilinmiyor',
    activeEngine: selectedEngine
  };

  const realHealthChecks: Record<string, any> = {
    winonly: [
      { label: 'Windows API', value: hardware?.available_engines.includes('winonly') ? 'Hazır' : 'Eksik', state: hardware?.available_engines.includes('winonly') ? 'ok' : 'error' },
      { label: 'WinRT Capture', value: hardware?.winrt_available ? 'Hazır' : 'Eksik', state: hardware?.winrt_available ? 'ok' : 'error' },
      { label: 'Motor Durumu', value: hardware?.engine_details?.winonly?.reason || 'Durum bilgisi bekleniyor', state: hardware?.available_engines.includes('winonly') ? 'ok' : 'warn' },
    ],
    easy: [
      { label: 'CUDA', value: hardware?.cuda_available ? 'Aktif' : 'Yok', state: hardware?.cuda_available ? 'ok' : 'warn' },
      { label: 'Neural Ağlar', value: hardware?.available_engines.includes('easy') ? 'Mevcut' : 'Eksik', state: hardware?.available_engines.includes('easy') ? 'ok' : 'error' },
      { label: 'Motor Durumu', value: hardware?.engine_details?.easy?.reason || 'Durum bilgisi bekleniyor', state: hardware?.available_engines.includes('easy') ? 'ok' : 'warn' },
    ],
  };

  const realEngineModelsData: Record<string, any> = {
    winonly: [
      { id: 'w1', name: 'Windows OCR', subtitle: hardware?.engine_details?.winonly?.reason || 'Sistem OCR bileşeni', status: hardware?.available_engines.includes('winonly') ? 'active' : 'available' },
      { id: 'w2', name: 'WinRT Capture', subtitle: hardware?.winrt_available ? 'Ekran yakalama hazır' : 'Ekran yakalama eksik', status: hardware?.winrt_available ? 'installed' : 'available' },
    ],
    easy: [
      { id: 'm1', name: 'Easy Motoru', subtitle: hardware?.engine_details?.easy?.reason || 'OCR paketi kontrol ediliyor', status: hardware?.available_engines.includes('easy') ? 'active' : 'available' },
      { id: 'm2', name: 'CUDA Desteği', subtitle: hardware?.cuda_available ? 'GPU hızlandırma açık' : 'CPU moduna düşecek', status: hardware?.cuda_available ? 'installed' : 'available' },
    ],
  };

  const realOfflineLangModels: { id: string; name: string; desc: string; size: string; status: 'active' | 'installed' | 'available' }[] = [
    {
      id: 'opus_mt_en_tr',
      name: 'İngilizce → Türkçe',
      desc: 'Opus MT çevrimdışı çeviri',
      size: offlineStatus?.active_model === 'opus_mt_en_tr' && offlineStatus?.bytes_label ? offlineStatus.bytes_label : 'Yerel model',
      status: offlineStatus?.selected_model === 'opus_mt_en_tr' && offlineStatus?.models_ready?.opus_mt_en_tr ? 'active' : offlineStatus?.models_ready?.opus_mt_en_tr ? 'installed' : 'available',
    },
    {
      id: 'nllb',
      name: 'Çok Dilli → Türkçe',
      desc: 'NLLB çevrimdışı çeviri',
      size: offlineStatus?.active_model === 'nllb' && offlineStatus?.bytes_label ? offlineStatus.bytes_label : 'Yerel model',
      status: offlineStatus?.selected_model === 'nllb' && offlineStatus?.models_ready?.nllb ? 'active' : offlineStatus?.models_ready?.nllb ? 'installed' : 'available',
    },
  ];
  const removeTargetModel = confirmRemoveLangId
    ? realOfflineLangModels.find((model) => model.id === confirmRemoveLangId) ?? null
    : null;


  const handleLangDownload = (modelId: string) => {
    if (isTranslating) return;
    const activeModel = offlineStatus?.active_model ?? offlineStatus?.active_install_model;
    if (offlineStatus?.models_ready?.[modelId]) {
      injectInfoLog('UI-010', `Yerel model zaten kurulu: ${modelId}`);
      send('get_offline_status');
      return;
    }
    if (offlineStatus?.busy && activeModel && activeModel !== modelId) {
      injectInfoLog('UI-011', `Başka yerel model işlemi sürüyor: ${activeModel}`);
      send('get_offline_status');
      return;
    }
    send('download_offline_models', { models: [modelId] });
    injectInfoLog('UI-008', `Yerel model kurulumu başlatıldı: ${modelId}`);
  };

  const handleLangCancelDownload = (modelId: string) => {
    if (isTranslating) return;
    send('cancel_offline_models');
    injectInfoLog('UI-009', `Yerel model indirme iptal edildi: ${modelId}`);
  };

  const handleLangRequestRemove = (modelId: string) => {
    if (isTranslating) return;
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveLangId(modelId);
  };

  const handleLangCancelRemove = () => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveLangId(null);
  };

  const handleLangConfirmRemove = (modelId: string) => {
    if (isTranslating) return;
    if (offlineStatus?.busy) {
      injectInfoLog('UI-012', `Kaldırma bekletildi; aktif işlem var: ${modelId}`);
      return;
    }
    if (!offlineStatus?.models_ready?.[modelId]) {
      injectInfoLog('UI-013', `Kaldırma atlandı; model kurulu değil: ${modelId}`);
      setConfirmRemoveLangId(null);
      send('get_offline_status');
      return;
    }
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    setConfirmRemoveLangId(null);
    send('remove_offline_models', { model: modelId });
    injectInfoLog('UI-007', `Yerel model kaldırma başlatıldı: ${modelId}`);
  };

  const mockPerfEstimate: Record<string, any> = {
    winonly: { fps: '30+', latency: '< 45ms', gpuUsage: '~5%', fpsBar: 40, latencyBar: 60, gpuBar: 5 },
    easy: { fps: '60+', latency: '< 15ms', gpuUsage: '~25%', fpsBar: 95, latencyBar: 90, gpuBar: 25 },
  };

  const realPerfEstimate: Record<string, any> = {
    winonly: frameStat?.engine === 'winonly'
      ? { fps: frameStat.result === 'accepted' ? 'Canlı' : 'Beklemede', latency: `Kalite ${frameStat.quality}`, gpuUsage: hardware?.winrt_available ? 'Düşük' : '--', fpsBar: frameStat.result === 'accepted' ? 72 : 28, latencyBar: Math.max(10, Math.min(100, frameStat.quality)), gpuBar: 8 }
      : mockPerfEstimate.winonly,
    easy: frameStat?.engine === 'easy'
      ? { fps: frameStat.result === 'accepted' ? 'Canlı' : 'Beklemede', latency: `Kalite ${frameStat.quality}`, gpuUsage: hardware?.cuda_available ? 'Aktif' : 'CPU', fpsBar: frameStat.result === 'accepted' ? 86 : 34, latencyBar: Math.max(10, Math.min(100, frameStat.quality)), gpuBar: hardware?.cuda_available ? 48 : 12 }
      : mockPerfEstimate.easy,
  };

  // EasyOCR Handlers
  const handleEasyocrDownload = () => {
    injectInfoLog('UI-008', 'EasyOCR indirme tetiklendi!');
    notify('info', 'EasyOCR indirme baslatiliyor...');
    send('download_easyocr');
  };
  const handleEasyocrCancel = () => {
    setEasyocrAction(null);
    notify('warning', 'EasyOCR indirmesi iptal edildi.');
    send('cancel_easyocr');
  };
  const handleEasyocrRemove = () => {
    injectInfoLog('UI-010', 'EasyOCR kaldiriliyor...');
    notify('warning', 'EasyOCR eklentisi kaldirildi.');
    send('remove_easyocr');
  };

  return (
    <PanelStage css={`
        .engine-grid-bg {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(125, 211, 252, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125, 211, 252, 0.04) 1px, transparent 1px);
          background-size: 40px 40px;
          background-position: center center;
          mask-image: radial-gradient(circle at center, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 80%);
          -webkit-mask-image: radial-gradient(circle at center, rgba(0,0,0,1) 10%, rgba(0,0,0,0) 80%);
          filter: blur(2px);
          opacity: 0.3;
        }
        .engine-scanner-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.3), transparent);
          box-shadow: 0 0 20px rgba(125, 211, 252, 0.2);
          animation: scan 4s ease-in-out infinite alternate;
          opacity: 0.2;
          filter: blur(3px);
        }
        .engine-core-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.03) 0%, transparent 60%);
          animation: pulseGlow 4s ease-in-out infinite alternate;
          filter: blur(24px);
        }
        .item-feedback {
          transition: background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
          box-shadow: inset 0 0 0 1px transparent;
        }
        .item-feedback:active { transform: scale(0.985); }
        .item-feedback:hover {
          background: rgba(125, 211, 252, 0.07) !important;
          box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.22), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 14px rgba(125, 211, 252, 0.05) !important;
        }
        .lang-row {
          transition: background 140ms ease;
        }
        .lang-row:hover { background: rgba(125,211,252,0.05); }
        .model-action-icon {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04);
          color: rgba(191,215,242,0.72);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transform: translateX(5px) scale(0.94);
          pointer-events: none;
          transition: opacity 140ms ease, transform 140ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease;
        }
        .lang-row:hover .model-action-icon,
        .lang-row:focus-within .model-action-icon,
        .engine-card:hover .model-action-icon,
        .engine-card:focus-within .model-action-icon,
        .item-feedback:hover .model-action-icon,
        .item-feedback:focus-within .model-action-icon {
          opacity: 1;
          transform: translateX(0) scale(1);
          pointer-events: auto;
        }
        .model-action-icon:disabled {
          cursor: not-allowed;
          opacity: 0.24 !important;
        }
        .action-download:hover {
          background: rgba(56,189,248,0.16);
          border-color: rgba(56,189,248,0.42);
          color: #38bdf8;
        }
        .action-stop:hover {
          background: rgba(252,211,77,0.16);
          border-color: rgba(252,211,77,0.42);
          color: #fcd34d;
        }
        .action-remove:hover {
          background: rgba(248,113,113,0.14);
          border-color: rgba(248,113,113,0.42);
          color: #f87171;
        }
        .model-state-icon {
          width: 24px;
          height: 24px;
          border-radius: 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: 0.86;
        }
        .model-state-active,
        .model-state-installed {
          color: #86efac;
          background: rgba(134,239,172,0.08);
        }
        .model-state-removing {
          color: #f87171;
          background: rgba(248,113,113,0.10);
          animation: removeBlink 900ms ease-in-out infinite alternate;
        }
        @keyframes removeBlink {
          from { opacity: 0.46; }
          to { opacity: 1; }
        }
        .engine-card {
          transition: background 150ms ease, box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease;
        }
        .engine-card:hover {
          background: rgba(125, 211, 252, 0.08) !important;
          box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125, 211, 252, 0.06) !important;
          border-color: rgba(125, 211, 252, 0.28) !important;
        }
        .engine-card:active {
          transform: scale(0.97);
        }
        .model-state-text {
          transition: opacity 150ms ease, filter 150ms ease;
          opacity: 1;
        }
        .item-feedback.has-action:hover .model-state-text,
        .item-feedback.has-action:focus-within .model-state-text,
        .engine-card:hover .model-state-text,
        .engine-card:focus-within .model-state-text {
          opacity: 0 !important;
          pointer-events: none;
        }
        .block-action-btn {
          transition: opacity 160ms ease, filter 160ms ease;
          opacity: 0.72;
        }
        .block-action-btn:hover {
          opacity: 1;
          filter: drop-shadow(0 0 6px rgba(125,211,252,0.40));
        }
        .block-action-btn.hover-only {
          opacity: 0.40;
        }
        .block-action-btn.hover-only:hover {
          opacity: 0.90;
          filter: drop-shadow(0 0 6px rgba(248,113,113,0.40));
        }
        @keyframes completePulse {
          0%   { box-shadow: inset 0 0 0 1px rgba(134,239,172,0.60), 0 0 10px rgba(134,239,172,0.20); }
          50%  { box-shadow: inset 0 0 0 1px rgba(134,239,172,0.90), 0 0 20px rgba(134,239,172,0.35); }
          100% { box-shadow: inset 0 0 0 1px rgba(134,239,172,0.60), 0 0 10px rgba(134,239,172,0.20); }
        }
        .item-completed {
          animation: completePulse 1s ease-in-out 3;
        }
        @keyframes scan {
          0% { top: 10%; opacity: 0; }
          10% { opacity: 0.3; }
          90% { opacity: 0.3; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes pulseGlow {
          0% { opacity: 0.3; transform: scale(0.95); }
          100% { opacity: 0.8; transform: scale(1.05); }
        }
    `} layers={[
      { inset: 0, background: 'linear-gradient(180deg,rgba(5,9,14,0.98),rgba(3,6,10,1))' },
      { inset: 0, background: 'radial-gradient(circle at 70% -20%, rgba(56,130,220,0.06), transparent 50%), radial-gradient(circle at -20% 120%, rgba(74,222,128,0.04), transparent 50%)' }
    ]}>
      <div className="engine-grid-bg" />
      <div className="engine-core-glow" />
      <div className="engine-scanner-line" />
      
      <MotorDurumu
        height="100%"
        hardwareInfo={mockHardwareInfo}
        healthChecks={realHealthChecks}
        models={realEngineModelsData}
        offlineLangModels={realOfflineLangModels}
        offlineBusy={Boolean(offlineStatus?.busy || isTranslating)}
        modelActions={modelActions}
        completedModelId={completedModelId}
        perfEstimate={realPerfEstimate}
        selectedEngineId={selectedEngine}
        isAvailable={(id) => hardware?.available_engines.includes(id) ?? false}
        isScanning={isHardwareScanning}
        onEngineSelect={(id) => { setSelectedEngine(id); send('change_engine', { engine: id }); send('get_hardware'); }}
        onLangDownload={handleLangDownload}
        onLangCancelDownload={handleLangCancelDownload}
        onLangRequestRemove={handleLangRequestRemove}
        onEasyocrDownload={handleEasyocrDownload}
        onEasyocrCancel={handleEasyocrCancel}
        onEasyocrRemove={handleEasyocrRemove}
        onRefreshHardware={() => {
          setIsHardwareScanning(true);
          injectInfoLog('UI-015', 'Motorları yeniden tarama isteği gönderildi.');
          notify('info', 'Donanım ve motorlar yeniden taranıyor...');
          send('get_hardware');
        }}
        easyocrAction={easyocrAction}
        easyocrCompleted={easyocrCompleted}
      />

      {removeTargetModel ? (
        <div
          onClick={handleLangCancelRemove}
          style={{ position: 'absolute', inset: 0, zIndex: 120, display: 'grid', placeItems: 'center', background: 'rgba(4,7,12,0.48)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: 430, maxWidth: 'calc(100% - 32px)', borderRadius: 18, border: '1px solid rgba(248,113,113,0.28)', background: 'rgba(10,18,29,0.96)', boxShadow: '0 26px 70px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.06)', padding: 22, position: 'relative', overflow: 'hidden' }}
          >
            <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 1, background: 'linear-gradient(90deg, transparent, rgba(248,113,113,0.55), transparent)' }} />
            <div style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.28)' }}>
              <G p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" />
            </div>
            <div style={{ marginTop: 16, fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Model kaldırılsın mı?</div>
            <div style={{ marginTop: 9, fontSize: 13, lineHeight: 1.6, color: 'rgba(191,215,242,0.72)' }}>
              <strong style={{ color: '#fff' }}>{removeTargetModel.name}</strong> yerel diskten silinecek. Tekrar çevrimdışı kullanmak için modeli yeniden indirip dönüştürmen gerekecek.
            </div>
            <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={handleLangCancelRemove} style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(191,215,242,0.82)', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Vazgeç</button>
              <button type="button" disabled={Boolean(offlineStatus?.busy || isTranslating)} onClick={() => handleLangConfirmRemove(removeTargetModel.id)} style={{ border: '1px solid rgba(248,113,113,0.46)', background: 'rgba(248,113,113,0.18)', color: '#f87171', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: (offlineStatus?.busy || isTranslating) ? 'not-allowed' : 'pointer', opacity: (offlineStatus?.busy || isTranslating) ? 0.45 : 1 }}>Kaldır</button>
            </div>
          </div>
        </div>
      ) : null}

    </PanelStage>
  );
};



