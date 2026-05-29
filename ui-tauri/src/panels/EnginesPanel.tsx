import React, { useEffect, useState, useRef } from 'react';
import { onEvent, send, useWebSocket, wsClient } from '../bridge/websocket';
import { PanelStage } from './PanelStage';
import { useAppContext } from '../context/AppContext';


import {
  HardwareResult,
  AppSettingsPayload,
  TranslationStatePayload,
  OcrFrameStatPayload,
  OfflineStatusPayload,
  OfflineModelAction,
  lastHardware,
  lastSettings,
  lastOfflineStatus,
  lastFrameStat,
  lastTranslationState,
  normalizeOfflineStatus,
  buildOfflineActionMap,
  G,
  MotorDurumu,
} from './engines/EnginesHelpers';

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

  // CUDA Plugin State
  const [cudaAction, setCudaAction] = useState<OfflineModelAction | null>(null);
  const [cudaCompleted, setCudaCompleted] = useState(false);
  const [cudaRequiresRestart, setCudaRequiresRestart] = useState(false);


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

    // CUDA Plugin Events
    const offCudaProgress = onEvent('cuda_progress', (data: any) => {
      setCudaAction({
        type: 'install',
        progress: data.percent ?? 0,
        detail: data.detail ?? '',
        stage: data.stage ?? 'downloading',
        bytes_label: data.bytes_label ?? ''
      });
    });
    const offCudaComplete = onEvent('cuda_complete', () => {
      setCudaAction(null);
      setCudaCompleted(true);
      setCudaRequiresRestart(true);
      window.setTimeout(() => setCudaCompleted(false), 3000);
      notify('success', 'CUDA başarıyla kuruldu! Aktif olması için VOIDSUB\'ı yeniden başlatın.');
    });
    const offCudaCancel = onEvent('cuda_cancelled', () => {
      setCudaAction(null);
    });
    const offCudaError = onEvent('cuda_error', (data: any) => {
      setCudaAction(null);
      notify('error', String(data?.message ?? 'CUDA indirme hatası.'));
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
      offCudaProgress();
      offCudaComplete();
      offCudaCancel();
      offCudaError();
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
      { label: 'CUDA', value: cudaRequiresRestart ? 'Yeniden Başlatın' : (hardware?.cuda_available ? 'Aktif' : 'Yok'), state: cudaRequiresRestart ? 'ok' : (hardware?.cuda_available ? 'ok' : 'warn') },
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
      { id: 'm2', name: 'CUDA Desteği', subtitle: cudaRequiresRestart ? 'Aktif olması için uygulamayı yeniden başlatın' : (hardware?.cuda_available ? 'GPU hızlandırma açık' : 'CPU moduna düşecek'), status: cudaRequiresRestart ? 'installed' : (hardware?.cuda_available ? 'installed' : 'available') },
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

  // CUDA Handlers
  const handleCudaDownload = () => {
    injectInfoLog('UI-015', 'CUDA indirme tetiklendi!');
    notify('info', 'CUDA indirmesi başlatılıyor (Bu işlem internet hızına göre zaman alabilir)...');
    send('download_cuda');
  };
  const handleCudaCancel = () => {
    setCudaAction(null);
    notify('warning', 'CUDA indirmesi iptal edildi.');
    send('cancel_cuda');
  };
  const handleCudaRemove = () => {
    injectInfoLog('UI-016', 'CUDA kaldiriliyor...');
    notify('warning', 'CUDA paketleri sistemden kaldırılıyor...');
    send('remove_cuda');
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
        cudaAction={cudaAction}
        cudaCompleted={cudaCompleted}
        onCudaDownload={handleCudaDownload}
        onCudaCancel={handleCudaCancel}
        onCudaRemove={handleCudaRemove}
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



