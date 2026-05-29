import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { getEventHistory, wsClient } from '../../bridge/websocket';


// --- Types & Data Interfaces ---
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
export interface AppSettingsPayload { ocr_engine?: string; }
export interface TranslationStatePayload { running?: boolean; engine?: string; }
export interface OcrFrameStatPayload {
  engine: string;
  quality: number;
  result: 'accepted' | 'rejected' | 'no_text';
  reason: string;
}
export interface OfflineModelDetails {
  state?: string;
  percent?: number;
  detail?: string;
  bytes_label?: string;
  [key: string]: unknown;
}

export interface OfflineStatusPayload {
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
  model_details?: Record<string, OfflineModelDetails>;
}

export type OfflineModelAction = {
  type: 'install' | 'remove';
  progress: number;
  detail: string;
  stage: string;
  bytes_label: string;
};

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
export const colors = {
  accent: '#7dd3fc',
  success: '#86efac',
  error: '#f87171',
  warning: '#fcd34d',
  muted: 'rgba(159,183,207,0.6)',
  textPrimary: '#fff',
  bgGlass: 'rgba(255,255,255,0.03)',
  borderGlass: '1px solid rgba(255,255,255,0.05)',
};

export const TS = {
  boxTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(191,215,242,0.72)' },
  pageTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.18em', fontWeight: 700, color: 'rgba(125,211,252,0.55)', margin: 0 },
  pageSub: { fontSize: 13, fontWeight: 400, color: 'rgba(159,183,207,0.55)', marginTop: 4 },
  primary: { color: colors.textPrimary, fontWeight: 600, fontSize: 13 },
};

export const G = ({ p, stroke = colors.accent }: { p: string; stroke?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" style={{ width: 18, height: 18 }}>
    <path d={p} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ICheck = () => <svg viewBox="0 0 24 24" fill="none" stroke={colors.success} strokeWidth="2.5" style={{ width: 12, height: 12 }}><polyline points="20 6 9 17 4 12" /></svg>;
export const IWarn = () => <svg viewBox="0 0 24 24" fill="none" stroke={colors.warning} strokeWidth="2.5" style={{ width: 12, height: 12 }}><path d="M12 2L2 22h20L12 2zM12 16v-6M12 20h.01" /></svg>;
export const IFail = () => <svg viewBox="0 0 24 24" fill="none" stroke={colors.error} strokeWidth="2.5" style={{ width: 12, height: 12 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;

export interface EngineHardwareInfo {
  cpu: string;
  gpu: string;
  ram: string;
  activeEngine: string;
  cuda_available?: boolean;
  engine_details?: Record<string, { reason?: string; [key: string]: unknown }>;
}

export interface HealthCheckItem {
  label: string;
  value: string;
  state: 'ok' | 'warn' | 'error';
}

export interface EngineModelItem {
  id: string;
  name: string;
  subtitle: string;
  status: 'active' | 'available' | 'installed';
}

export interface PerfEstimateItem {
  fps: string;
  latency: string;
  gpuUsage: string;
  fpsBar: number;
  latencyBar: number;
  gpuBar: number;
}

export interface OfflineLangModelItem {
  id: string;
  name: string;
  desc: string;
  size: string;
  status: 'active' | 'installed' | 'available';
}

// --- MotorDurumu Component ---
export interface MotorDurumuProps {
  height?: number | string;
  hardwareInfo: EngineHardwareInfo;
  healthChecks: Record<string, HealthCheckItem[]>;
  models: Record<string, EngineModelItem[]>;
  perfEstimate: Record<string, PerfEstimateItem>;
  onEngineSelect: (engineId: string) => void;
  selectedEngineId: string;
  isAvailable: (engineId: string) => boolean;
  modelActions: Record<string, OfflineModelAction>;
  offlineLangModels: OfflineLangModelItem[];
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
  cudaAction: OfflineModelAction | null;
  cudaCompleted: boolean;
  onCudaDownload: () => void;
  onCudaCancel: () => void;
  onCudaRemove: () => void;
}

export type EngineInfoKey = 'overview' | 'engine_selection' | 'engine_models' | 'translation_models' |
  'winonly' | 'easy' |
  'w1' | 'w2' | 'w3' | 'm1' | 'm2' | 'm3' |
  'opus_mt_en_tr' | 'nllb';

export const engineInfoContent: Record<EngineInfoKey, { title: string; desc: string; detail1: string; detail2: string; detail3: string; }> = {
  overview: {
    title: 'Sistem Paneli',
    desc: 'Uygulamanın tüm çeviri ve analiz altyapısını buradan yönetebilirsiniz.',
    detail1: 'İhtiyacınıza uygun metin tarama motorunu sol menüden seçin.',
    detail2: 'İlgili motorun eklentileri ve dil modelleri sağ tarafta listelenir.',
    detail3: 'Canlı performans değerleri (FPS, gecikme, GPU) alt kısımda yer alır.'
  },
  engine_selection: {
    title: 'Görüntü İşleme Motoru',
    desc: 'Ekrandaki yazıları algılayacak çekirdek teknolojiyi belirler.',
    detail1: 'WindowsOCR: Ek bir kurulum gerektirmez, ultra hızlı ve hafiftir.',
    detail2: 'Easy Motoru: Yapay zeka desteklidir, zorlu yazılar için kusursuz bir isabete sahiptir.',
    detail3: 'Seçiminiz anında devreye girerek sisteme entegre olur.'
  },
  engine_models: {
    title: 'Çekirdek Eklentileri',
    desc: 'Seçtiğiniz analiz motorunun gücünü artıran yan bileşenlerdir.',
    detail1: 'Sistem bileşenleri anında çalışmaya hazır şekilde gelir.',
    detail2: 'Bulut ikonuna sahip olanlar, tıklanarak arka planda sessizce kurulabilir.',
    detail3: 'Bu modüller donanımınızın potansiyelini sonuna kadar kullanmanızı sağlar.'
  },
  translation_models: {
    title: 'Yerel Çeviri Modelleri',
    desc: 'İnternet bağlantısı gerektirmeyen gelişmiş yapay zeka çeviri paketleridir.',
    detail1: 'Verileriniz cihaz dışına çıkmaz, %100 yerel ve gizli çalışır.',
    detail2: 'Donanımınıza uygun olanı seçtiğinizde inanılmaz bir hızla çeviri yaparlar.',
    detail3: 'Modüller tek tıkla indirilir ve istendiğinde cihazdan kaldırılabilir.'
  },
  winonly: { title: 'Windows Görsel Tarama', desc: 'Windows yerleşik donanım ivmelendirmesini kullanan standart analiz modülü.', detail1: 'Kusursuz bir şekilde entegredir, harici indirme veya kurulum gerektirmez.', detail2: 'Sistem kaynaklarını minimum düzeyde tüketerek oyun performansını korur.', detail3: 'Standart oyun fontlarında oldukça hızlı sonuç verir.' },
  easy: { title: 'Yapay Zeka Destekli Tarama', desc: 'Ekrandaki karmaşık fontları bile okuyabilen derin öğrenme modülü.', detail1: 'Stilize oyun metinlerinde veya kötü çözünürlüklerde hayat kurtarır.', detail2: 'Donanımınıza (GPU) yük bindirebilir ancak sonuçlar çok daha kesindir.', detail3: 'İleri düzey kullanıcılar ve okuması zor RPG oyunları için tasarlanmıştır.' },
  w1: { title: 'Türkçe Algılama Desteği', desc: 'Windows üzerinden Türkçe karakterlerin hatasız algılanmasını sağlar.', detail1: 'Cihazınızda zaten kuruluysa anında otomatik olarak devreye girer.', detail2: 'Eksikse, doğrudan Windows ayarlarından saniyeler içinde eklenebilir.', detail3: 'Oyun içi metinlerin dil bağımlılıklarını çözer.' },
  w2: { title: 'İngilizce Algılama Desteği', desc: 'Uluslararası oyunların temel dili olan İngilizce paketidir.', detail1: 'Sistemde her zaman aktif bulunması önerilen temel bir modüldür.', detail2: 'Olağanüstü hızlı bir tarama kapasitesi ve sıfır hata toleransı sunar.', detail3: 'Eksiksiz analiz ve çeviri zinciri için gereklidir.' },
  w3: { title: 'Japonca Algılama Desteği', desc: 'Asya menşeili oyunlar için geliştirilmiş karakter algılama paketi.', detail1: 'JRPG tarzı oyunlarda doğru metin analizi için zorunludur.', detail2: 'Gelişmiş Kanji ve Kana tanıma özelliklerini aktif eder.', detail3: 'Etkinleştirildiğinde Asya fontlarında yüksek başarı oranı sağlar.' },
  m1: { title: 'Gelişmiş Görüntü Analizi', desc: 'Ekrandaki metinleri algılayıp dijital verilere dönüştüren ana zeka motorudur.', detail1: 'Görüntü kalitesinden bağımsız olarak üst düzey bir okuma yeteneği sunar.', detail2: 'Tüm görüntü analiz görevlerinin kalbidir.', detail3: 'Tek tıkla indirilir ve arka planda sorunsuzca devreye girer.' },
  m2: { title: 'Donanım Hızlandırma (GPU)', desc: 'Ekran kartınızın gücünü serbest bırakarak analiz işlemlerini uçuşa geçirir.', detail1: 'Sadece uyumlu NVIDIA kartlarıyla tam performans (Süper hızlı) çalışır.', detail2: 'Sistem kaynaklarına nefes aldırır ve gecikmeyi milisaniyelere düşürür.', detail3: 'Eksik olduğunda sistem hız keserek işlemci (CPU) modunu tercih eder.' },
  m3: { title: 'Stilize Metin Modülü', desc: 'El yazısı stiline sahip karmaşık oyun fontlarını çözen ekstra paket.', detail1: 'Geleneksel RPG veya bağımsız (Indie) oyunlarda mükemmel çalışır.', detail2: 'Klasik okuma sistemlerinden daha farklı ve esnek bir algoritma kullanır.', detail3: 'Sadece ihtiyaç duyduğunuzda indirip aktif edebilirsiniz.' },
  opus_mt_en_tr: { title: 'Gelişmiş Çeviri Zekası (Hızlı)', desc: 'İngilizceden Türkçeye anında, kusursuz ve yerel çeviri sağlayan optimize ağ.', detail1: 'Hiçbir uzak sunucuya bağlanmaz, tamamen cihazınızda çalışır.', detail2: 'Yüksek hız ve mantıklı cümle kurulumları ile oyun diyalogları için idealdir.', detail3: 'İnternetiniz kopsa bile kesintisiz bir deneyim yaşatır.' },
  nllb: { title: 'Evrensel Çeviri Zekası (Ağır)', desc: 'Çok sayıda dili aynı anda algılayabilen, devasa bir çeviri beyni.', detail1: 'İngilizce dışındaki diğer küresel dilleri de yüksek başarıyla Türkçeye çevirir.', detail2: 'Dosya boyutu ve donanım gereksinimi diğer modellere kıyasla daha ağırdır.', detail3: 'Size en doğal ve akıcı çeviri deneyimini sunma garantisi verir.' }
};

export const EngineInfoDock = ({ info, visible }: { info?: typeof engineInfoContent['overview']; visible: boolean }) => {
  const safeInfo = info || engineInfoContent['overview'];
  const [displayInfo, setDisplayInfo] = useState(safeInfo);
  const [contentVisible, setContentVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);

  useEffect(() => {
    const nextInfo = info || engineInfoContent['overview'];
    if (nextInfo.title === displayInfo.title) return;
    setContentVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayInfo(nextInfo);
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

export const InfoButton = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
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

export const MotorDurumu: React.FC<MotorDurumuProps> = ({ height = '100%', hardwareInfo, healthChecks, models, perfEstimate, onEngineSelect, selectedEngineId, isAvailable, offlineLangModels, offlineBusy, modelActions, completedModelId, onLangDownload, onLangCancelDownload, onLangRequestRemove, onEasyocrDownload, onEasyocrCancel, onEasyocrRemove, onRefreshHardware, isScanning, easyocrAction, easyocrCompleted, cudaAction, cudaCompleted, onCudaDownload, onCudaCancel, onCudaRemove }) => {
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
                  
                  // CUDA özel aksiyonlarını bağla
                  if (mdl.id === 'm2') {
                     action = cudaAction || action;
                     isCompleted = cudaCompleted;
                  }

                  const hasActionButton = !!action || 
                    (mdl.id === 'm1') || // m1 always has either download or remove
                    (mdl.id === 'm2') || // m2 has download
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
                             {mdl.id === 'm2' && action.type === 'install' && (
                               <button className="model-action-icon action-stop" title="İndirmeyi durdur" onClick={(e) => { e.stopPropagation(); onCudaCancel(); }}>
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
                                    title: 'Gelişmiş Görüntü Analizi Kurulumu',
                                    desc: 'Motorun olağanüstü isabetle çalışmasını sağlayacak olan ana analiz modülüdür.',
                                    detail1: 'Bağlantı hızınıza göre kısa bir indirme süreci gerektirir.',
                                    detail2: 'Tamamen arka planda kurulur ve sizi asla bekletmez.',
                                    detail3: 'Kurulum sürerken uygulamanın açık kalmasına özen gösterin.'
                                  }); 
                                }}
                                onClick={(e) => { e.stopPropagation(); onEasyocrDownload(); }}
                              >
                                <G p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4" stroke="currentColor" />
                              </button>
                            )}
                            {mdl.id === 'm2' && mdl.status === 'available' && (
                              <button 
                                className="model-action-icon action-download" 
                                title="CUDA Hızlandırmasını İndir" 
                                data-info-hotspot="true"
                                onMouseEnter={(e) => { 
                                  e.stopPropagation(); 
                                  focusInfo({
                                    title: 'Donanım Hızlandırma Kurulumu',
                                    desc: 'Analiz hızınızı maksimuma çıkarmak için ekran kartınızın tam potansiyelini açığa çıkarır.',
                                    detail1: 'Yaklaşık 2-3 GB boyutunda devasa bir performans paketidir.',
                                    detail2: 'Sadece NVIDIA marka donanımlarda aktifleşerek gecikmeyi milisaniyelere indirir.',
                                    detail3: 'Arka planda sessizce kurulur ve sisteme dahil olur.'
                                  }); 
                                }}
                                onClick={(e) => { e.stopPropagation(); onCudaDownload(); }}
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
                            {mdl.id === 'm2' && (mdl.status === 'installed' || mdl.status === 'active') && (
                              <button 
                                className="model-action-icon action-remove" 
                                title="CUDA Hızlandırmasını Sistemden Kaldır"
                                onClick={(e) => { e.stopPropagation(); onCudaRemove(); }}
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
                                    desc: `Tespit Edilen Hata: ${hardwareInfo?.engine_details?.winonly?.reason || 'Gerekli dil paketi bulunamadı.'}`,
                                    detail1: 'Windows 10/11 sisteminizin yerleşik tarayıcısı şu an pasif durumda.',
                                    detail2: 'Tıklayarak doğrudan Windows Dil Ayarları menüsüne ışınlanabilirsiniz.',
                                    detail3: 'İlgili paket eklendikten sonra bu bildirim kalıcı olarak kaybolacaktır.'
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
                                    title: 'Sistemi Yeniden Tara',
                                    desc: 'Windows ayarlarında yaptığınız değişiklikleri anında algılayıp uygulamanızı hazır hale getirir.',
                                    detail1: 'Eksik paketi kurduktan sonra bu butona tıklayarak donanımınızı güncelleyebilirsiniz.',
                                    detail2: 'Uygulamayı yeniden başlatmanıza gerek kalmadan kesintisiz deneyime devam edin.',
                                    detail3: 'Her şey tamamsa yeşil ışığı göreceksiniz.'
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



