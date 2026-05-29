import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { onEvent, wsClient } from '../bridge/websocket';
import { motion } from 'framer-motion';

import { PanelStage } from './PanelStage';

import { SceneModeBlock } from './SceneModeBlock';
import { conceptABasePerformanceTiers, getSettingsPerformanceKeyFromConceptA, type ConceptAPerformanceOption, type ConceptAPerformanceTier } from '../config/workspacePerformance';
import type { AppCustomCalibrationProfile, AppPerformanceTier } from '../config/uiDefaults';
import { type ConceptAEngineOption, workspaceEngineLabels } from '../config/workspaceEngine';
import { applyOcrFilterOverride, getCalibrationPreset, toRuntimeCalibrationPayload, type CalibrationRuntimeValues, type PerformanceTier } from '../config/calibrationPresets';



import {
  HoverState,
  CalibrationPreviewResult,
  previewShellStyle,
  SkeletonBlock,
  MiniRailBlock,
  calibrationGroupTitleStyle,
  CalibrationControlKey,
  ConceptCalibrationSnapshot,
  CalibrationValues,
  ConceptCalibrationDraftProfile,
  CalibrationInfoKey,
  calibrationControls,
  initialCalibrationValues,
  conceptValuesFromRuntime,
  runtimeValuesFromConcept,
  calibrationSnapshotsMatch,
  calibrationInfoContent,
  CalibrationHeaderActions,
  ImprovementToggleBlock,
  CalibrationAreaBlock,
  CalibrationInfoDock,
  CalibrationSliderControl,
  CalibrationGroupSection,
  calibrationSettingsGridStyle,
} from './calibration';

export const CalibrationView: React.FC<{
  currentPerformanceId?: string;
  onPerformanceChange?: (nextId: string) => void;
  onPerformanceOptionsChange?: (nextOptions: ConceptAPerformanceOption[]) => void;
  engineOptions?: ConceptAEngineOption[];
  currentEngineId?: string;
  onEngineChange?: (nextId: string) => void;
}> = ({
  currentPerformanceId: externalPerformanceId = 'Performans',
  onPerformanceChange,
  onPerformanceOptionsChange,
  engineOptions = [],
  currentEngineId = 'easy',
  onEngineChange,
}) => {
  const {
    notify,
    settings,
    isTranslating,
    handleStartCalibrationSelect,
  } = useAppContext();
  const [previewRegion, setPreviewRegion] = useState<{ x1: number; y1: number; x2: number; y2: number; image: string } | null>(null);
  const [previewResult, setPreviewResult] = useState<CalibrationPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef<number | null>(null);

  // ─── Zoom viewer state ─────────────────────────────────────────────────────
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [zoomAnimated, setZoomAnimated] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [targetRect, setTargetRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);

  const openZoom = (e: React.MouseEvent, src: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tw = Math.round(window.innerWidth * 0.90);
    const th = Math.round(window.innerHeight * 0.86);
    setOriginRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    setTargetRect({ top: Math.round((window.innerHeight - th) / 2), left: Math.round((window.innerWidth - tw) / 2), width: tw, height: th });
    setZoomedImage(src);
    setZoomScale(1);
    setPanX(0);
    setPanY(0);
    setIsDragging(false);
    setZoomAnimated(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setZoomAnimated(true)));
  };

  const closeZoom = () => {
    // 1) Image transform'u sıfırla (transition: 200ms),
    //    2) bir rAF sonra container origin'e dön (300ms),
    //    3) 320ms sonra DOM'dan kaldır
    setPanX(0);
    setPanY(0);
    setZoomScale(1);
    requestAnimationFrame(() => {
      setZoomAnimated(false);
      window.setTimeout(() => {
        setZoomedImage(null);
        setOriginRect(null);
      }, 320);
    });
  };

  useEffect(() => {
    if (!zoomedImage) return;
    const container = zoomContainerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.88 : 1.14;
      setZoomScale(s => {
        const next = Math.max(1, Math.min(10, s * delta));
        if (next <= 1) { setPanX(0); setPanY(0); }
        return next;
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomedImage]);

  useEffect(() => {
    if (!zoomedImage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeZoom(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedImage]);

  const [motorArrowHover, setMotorArrowHover] = useState<HoverState>(null);
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
    if (isTranslating) return notify('warning', 'Çeviri aktifken OCR motoru değiştirilemez', 'settings_lock');
    if (engineOptions.length === 0) return;
    const nextIndex = (safeMotorIndex + dir + engineOptions.length) % engineOptions.length;
    const nextEngine = engineOptions[nextIndex];
    if (nextEngine) onEngineChange?.(nextEngine.id);
  };

  const performanceList = React.useMemo(() => {
    const list: ConceptAPerformanceOption[] = [];
    for (const tier of conceptABasePerformanceTiers) {
      list.push({ id: tier, name: tier, isBase: true, baseTier: tier });
      const customs = settings?.custom_calibration_profiles?.filter(p => p.base_tier === getSettingsPerformanceKeyFromConceptA(tier)) || [];
      for (const custom of customs) {
        list.push({ id: custom.id, name: custom.name, isBase: false, baseTier: tier });
      }
    }
    return list;
  }, [settings?.custom_calibration_profiles]);

  const [performanceArrowHover, setPerformanceArrowHover] = useState<HoverState>(null);
  const lastLoadedPerfIdRef = useRef<string | null>(null);
  const currentPerfIndex = performanceList.findIndex(p => p.id === externalPerformanceId);
  const safePerfIndex = currentPerfIndex >= 0 ? currentPerfIndex : 2;

  const currentPerformance = performanceList[safePerfIndex].name;
  const previousPerformance = performanceList[(safePerfIndex - 1 + performanceList.length) % performanceList.length].name;
  const nextPerformance = performanceList[(safePerfIndex + 1) % performanceList.length].name;

  const [sceneType, setSceneType] = useState<'floating' | 'striped'>('striped');
  const [calibrationValues, setCalibrationValues] = useState<CalibrationValues>(initialCalibrationValues);
  const [ocrFiltersEnabled, setOcrFiltersEnabled] = useState(true);
  const [rawTranslationFlowEnabled, setRawTranslationFlowEnabled] = useState(false);
  const [calibrationDraftProfile, setCalibrationDraftProfile] = useState<ConceptCalibrationDraftProfile | null>(null);
  const [calibrationInfoEnabled, setCalibrationInfoEnabled] = useState(false);
  const [calibrationInfoDockMounted, setCalibrationInfoDockMounted] = useState(false);
  const [calibrationInfoDockVisible, setCalibrationInfoDockVisible] = useState(false);
  const [profileNameModal, setProfileNameModal] = useState<{ open: boolean, mode: 'create' | 'rename', initialValue: string } | null>(null);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [activeCalibrationInfoKey, setActiveCalibrationInfoKey] = useState<CalibrationInfoKey>('overview');
  const currentRuntimeValues = (values = calibrationValues, filtersEnabled = ocrFiltersEnabled) =>
    runtimeValuesFromConcept(values, filtersEnabled);
  const currentBaseRuntimeValues = (tier: ConceptAPerformanceTier, nextSceneType = sceneType, filtersEnabled?: boolean) => {
    const runtimeTier = getSettingsPerformanceKeyFromConceptA(tier) as PerformanceTier;
    return applyOcrFilterOverride(
      getCalibrationPreset(nextSceneType, runtimeTier),
      filtersEnabled ?? ocrFiltersEnabled,
    );
  };
  const requestPreview = (runtimeValues: CalibrationRuntimeValues) => {
    if (!previewRegion) return;
    setPreviewLoading(true);
    wsClient.send('calibration_preview_request', {
      config: runtimeValues,
      scene_mode: sceneType,
      ocr_filters_enabled: runtimeValues.ocr_filters_enabled,
    });
  };
  const schedulePreview = (runtimeValues: CalibrationRuntimeValues, immediate = false) => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (!previewRegion) return;
    if (immediate) {
      requestPreview(runtimeValues);
      return;
    }
    previewTimerRef.current = window.setTimeout(() => {
      requestPreview(runtimeValues);
      previewTimerRef.current = null;
    }, 220);
  };

  useEffect(() => {
    setSceneType(settings?.ocr_scene_mode === 'floating' ? 'floating' : 'striped');
  }, [settings?.ocr_scene_mode]);

  useEffect(() => {
    setOcrFiltersEnabled(settings?.ocr_filters_enabled ?? true);
  }, [settings?.ocr_filters_enabled]);

  useEffect(() => {
    setRawTranslationFlowEnabled(settings?.raw_translation_flow_enabled ?? false);
  }, [settings?.raw_translation_flow_enabled]);

  useEffect(() => {
    const offRegion = onEvent('calibration_region_selected', (data) => {
      if (data && data.preview_image) {
        setPreviewRegion({ x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2, image: data.preview_image });
        setPreviewResult(null);
        setPreviewLoading(true);
      }
    });
    const offPreview = onEvent('calibration_preview_result', (data: CalibrationPreviewResult) => {
      setPreviewResult(data);
      setPreviewLoading(false);
    });
    return () => {
      offRegion();
      offPreview();
    };
  }, []);

  useEffect(() => () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!previewRegion) return;
    requestPreview(currentRuntimeValues(calibrationValues, ocrFiltersEnabled));
  }, [previewRegion]);

  const applySceneType = (nextSceneType: 'floating' | 'striped') => {
    if (isTranslating) return notify('warning', 'Çeviri aktifken sahne tipi değiştirilemez', 'settings_lock');
    if (nextSceneType === sceneType) return;
    setSceneType(nextSceneType);
    wsClient.send('change_ocr_scene_mode', { mode: nextSceneType });
    wsClient.send('save_settings', { ocr_scene_mode: nextSceneType });
    schedulePreview(currentRuntimeValues(calibrationValues, ocrFiltersEnabled), true);
  };

  const shiftPerformance = (dir: -1 | 1) => {
    if (isTranslating) return notify('warning', 'Çeviri aktifken performans ayarı değiştirilemez', 'settings_lock');
    const nextIdx = (safePerfIndex + dir + performanceList.length) % performanceList.length;
    const nextObj = performanceList[nextIdx];
    onPerformanceChange?.(nextObj.id);

    if (nextObj.isBase) {
      const baseRuntimeValues = currentBaseRuntimeValues(nextObj.baseTier, sceneType);
      wsClient.send('save_settings', {
        active_calibration_profile_id: null,
        performance_tier: getSettingsPerformanceKeyFromConceptA(nextObj.baseTier),
        ...toRuntimeCalibrationPayload(baseRuntimeValues),
      });
      schedulePreview(baseRuntimeValues, true);
    } else {
      const customProfile = settings?.custom_calibration_profiles?.find(p => p.id === nextObj.id);
      if (customProfile) {
        const filtersEnabled = customProfile.values.ocr_filters_enabled as boolean;
        const runtime = runtimeValuesFromConcept(customProfile.values as CalibrationValues, filtersEnabled);
        wsClient.send('save_settings', {
          active_calibration_profile_id: customProfile.id,
          performance_tier: customProfile.base_tier,
          ...toRuntimeCalibrationPayload(runtime),
        });
        schedulePreview(runtime, true);
      }
    }
  };

  useEffect(() => {
    onPerformanceOptionsChange?.(performanceList);
  }, [onPerformanceOptionsChange, performanceList]);

  useEffect(() => {
    if (externalPerformanceId === lastLoadedPerfIdRef.current) return;

    const activeOption = performanceList.find((item) => item.id === externalPerformanceId);
    if (!activeOption) return;

    lastLoadedPerfIdRef.current = externalPerformanceId;

    if (activeOption.isBase) {
      const baseRuntimeValues = currentBaseRuntimeValues(activeOption.baseTier, sceneType);
      setCalibrationValues(conceptValuesFromRuntime(baseRuntimeValues));
      setCalibrationDraftProfile(null);
    } else {
      const customProfile = settings?.custom_calibration_profiles?.find(p => p.id === activeOption.id);
      if (customProfile) {
        setCalibrationValues(customProfile.values as CalibrationValues);
        if (customProfile.values.ocr_filters_enabled !== undefined) {
          setOcrFiltersEnabled(customProfile.values.ocr_filters_enabled as boolean);
        }
        setCalibrationDraftProfile({
          id: customProfile.id,
          name: customProfile.name,
          snapshot: { values: customProfile.values as CalibrationValues, ocrFiltersEnabled: customProfile.values.ocr_filters_enabled as boolean },
          savedSnapshot: { values: customProfile.values as CalibrationValues, ocrFiltersEnabled: customProfile.values.ocr_filters_enabled as boolean },
          dirty: false,
          saved: true,
        });
      }
    }
  }, [externalPerformanceId, performanceList, sceneType, settings?.custom_calibration_profiles]);

  const updateCalibrationProfileState = (nextSnapshot: ConceptCalibrationSnapshot) => {
    setCalibrationDraftProfile((currentProfile) => {
      const perfObj = performanceList[safePerfIndex];
      const initialSnapshot = { values: initialCalibrationValues, ocrFiltersEnabled: true };
      if (!currentProfile && calibrationSnapshotsMatch(nextSnapshot, initialSnapshot)) return null;

      if (!currentProfile) {
        return {
          id: perfObj.isBase ? `concept-${sceneType}-${Date.now()}` : perfObj.id,
          name: perfObj.isBase ? `${perfObj.name} (Özel)` : perfObj.name,
          snapshot: nextSnapshot,
          savedSnapshot: null,
          dirty: true,
          saved: false,
        };
      }

      const compareSnapshot = currentProfile.savedSnapshot ?? initialSnapshot;
      const dirty = !calibrationSnapshotsMatch(nextSnapshot, compareSnapshot);
      if (!currentProfile.saved && calibrationSnapshotsMatch(nextSnapshot, initialSnapshot)) return null;

      return {
        ...currentProfile,
        snapshot: nextSnapshot,
        dirty,
      };
    });
  };

  const updateCalibrationValue = (key: CalibrationControlKey, value: number) => {
    if (isTranslating) return notify('warning', 'Çeviri aktifken kalibrasyon ayarları değiştirilemez', 'settings_lock');
    setCalibrationValues((current) => {
      const nextValues = { ...current, [key]: value };
      updateCalibrationProfileState({ values: nextValues, ocrFiltersEnabled });
      const runtimeValues = currentRuntimeValues(nextValues, ocrFiltersEnabled);
      wsClient.send('save_settings', toRuntimeCalibrationPayload(runtimeValues));
      schedulePreview(runtimeValues);
      return nextValues;
    });
  };
  const toggleOcrFilters = () => {
    if (isTranslating) return notify('warning', 'Çeviri aktifken filtre ayarları değiştirilemez', 'settings_lock');
    setOcrFiltersEnabled((current) => {
      const nextEnabled = !current;
      updateCalibrationProfileState({ values: calibrationValues, ocrFiltersEnabled: nextEnabled });
      const runtimeValues = currentRuntimeValues(calibrationValues, nextEnabled);
      wsClient.send('save_settings', toRuntimeCalibrationPayload(runtimeValues));
      schedulePreview(runtimeValues, true);
      return nextEnabled;
    });
  };

  const toggleRawTranslationFlow = () => {
    if (isTranslating) return notify('warning', 'Çeviri aktifken ham akış ayarı değiştirilemez', 'settings_lock');
    setRawTranslationFlowEnabled((current) => {
      const nextEnabled = !current;
      wsClient.send('save_settings', { raw_translation_flow_enabled: nextEnabled });
      return nextEnabled;
    });
  };

  const saveCalibrationDraftProfile = () => {
    const perfObj = performanceList[safePerfIndex];
    if (perfObj.isBase) {
      const existingCount = (settings?.custom_calibration_profiles || []).filter(p => p.base_tier === getSettingsPerformanceKeyFromConceptA(perfObj.baseTier)).length;
      if (existingCount >= 2) {
        notify('error', `Bu performans kademesi için en fazla 2 özel profil oluşturabilirsiniz.`);
        return;
      }
    }
    const defaultName = perfObj.isBase ? `${perfObj.baseTier} (Özel)` : perfObj.name;
    setProfileNameInput(perfObj.isBase ? defaultName : perfObj.name);
    setProfileNameModal({ open: true, mode: perfObj.isBase ? 'create' : 'rename', initialValue: perfObj.isBase ? defaultName : perfObj.name });
  };

  const handleProfileModalSubmit = () => {
    if (!profileNameModal) return;
    const newName = profileNameInput.trim();
    if (!newName) return;
    
    const perfObj = performanceList[safePerfIndex];
    const currentProfiles = settings?.custom_calibration_profiles || [];
    
    if (profileNameModal.mode === 'create') {
      const newId = `custom-${Date.now()}`;
      const newSnapshot = { values: calibrationValues, ocrFiltersEnabled };
      const newProfile: AppCustomCalibrationProfile = {
        id: newId,
        name: newName,
        mode: sceneType,
        base_tier: getSettingsPerformanceKeyFromConceptA(perfObj.baseTier) as AppPerformanceTier,
        values: { ...newSnapshot.values, ocr_filters_enabled: newSnapshot.ocrFiltersEnabled },
      };
      wsClient.send('save_settings', {
        custom_calibration_profiles: [...currentProfiles, newProfile],
        active_calibration_profile_id: newId,
        performance_tier: getSettingsPerformanceKeyFromConceptA(perfObj.baseTier)
      });
      setCalibrationDraftProfile({
        id: newId,
        name: newName,
        snapshot: newSnapshot,
        savedSnapshot: newSnapshot,
        dirty: false,
        saved: true,
      });
      notify('success', 'Yeni performans profili başarıyla oluşturuldu ve kaydedildi.');
    } else if (profileNameModal.mode === 'rename') {
      if (!perfObj.isBase) {
        const newSnapshot = { values: calibrationValues, ocrFiltersEnabled };
        const updatedProfiles = currentProfiles.map(p => p.id === perfObj.id ? { 
          ...p, 
          name: newName,
          values: { ...newSnapshot.values, ocr_filters_enabled: newSnapshot.ocrFiltersEnabled }
        } : p);
        wsClient.send('save_settings', { custom_calibration_profiles: updatedProfiles });
        if (calibrationDraftProfile?.id === perfObj.id) {
          setCalibrationDraftProfile(curr => curr ? {
            ...curr,
            name: newName,
            snapshot: newSnapshot,
            savedSnapshot: newSnapshot,
            dirty: false,
            saved: true
          } : null);
        }
        notify('success', 'Özel profil başarıyla güncellendi.');
      }
    }
    setProfileNameModal(null);
  };

  const deleteCalibrationDraftProfile = () => {
    const perfObj = performanceList[safePerfIndex];
    if (!perfObj.isBase) {
      const currentProfiles = settings?.custom_calibration_profiles || [];
      const updatedProfiles = currentProfiles.filter(p => p.id !== perfObj.id);
      wsClient.send('save_settings', { 
        custom_calibration_profiles: updatedProfiles,
        active_calibration_profile_id: null,
        performance_tier: getSettingsPerformanceKeyFromConceptA(perfObj.baseTier)
      });
      setCalibrationDraftProfile(null);
      const baseRuntimeValues = currentBaseRuntimeValues(perfObj.baseTier, sceneType);
      const initialValues = conceptValuesFromRuntime(baseRuntimeValues);
      setCalibrationValues(initialValues);
      notify('info', 'Özel performans profili silindi. Varsayılan kademeye dönüldü.');
    }
  };

  const resetCalibrationDraftProfile = () => {
    const initialSnapshot = { values: initialCalibrationValues, ocrFiltersEnabled: true };
    const resetSnapshot = calibrationDraftProfile?.savedSnapshot ?? initialSnapshot;
    
    setCalibrationValues(resetSnapshot.values);
    setOcrFiltersEnabled(resetSnapshot.ocrFiltersEnabled);
    setCalibrationDraftProfile((current) => {
      if (!current?.savedSnapshot) {
        notify('info', 'Değişiklikler sıfırlandı.');
        return null;
      }

      notify('info', 'Değişiklikler iptal edildi ve son kaydedilen duruma dönüldü.');
      return {
        ...current,
        snapshot: resetSnapshot,
        dirty: false,
      };
    });
  };
  const focusCalibrationInfo = (key: CalibrationInfoKey) => {
    if (calibrationInfoEnabled) setActiveCalibrationInfoKey(key);
  };

  useEffect(() => {
    if (!calibrationInfoEnabled) return undefined;

    const closeOnEmptyClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          '[data-calibration-info-hotspot="true"], [data-calibration-action-button="true"], [data-calibration-info-panel="true"]',
        )
      ) {
        return;
      }

      setCalibrationInfoEnabled(false);
      setActiveCalibrationInfoKey('overview');
    };

    window.addEventListener('mousedown', closeOnEmptyClick);
    return () => window.removeEventListener('mousedown', closeOnEmptyClick);
  }, [calibrationInfoEnabled]);

  useEffect(() => {
    if (calibrationInfoEnabled) {
      setCalibrationInfoDockMounted(true);
      const frame = window.requestAnimationFrame(() => {
        setCalibrationInfoDockVisible(true);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    setCalibrationInfoDockVisible(false);
    const timeout = window.setTimeout(() => {
      setCalibrationInfoDockMounted(false);
    }, 170);

    return () => window.clearTimeout(timeout);
  }, [calibrationInfoEnabled]);

  useEffect(() => {
    if (calibrationInfoDockMounted) {
      return undefined;
    }

    setCalibrationInfoDockVisible(false);
    return undefined;
  }, [calibrationInfoDockMounted]);

  const activeCalibrationInfo = calibrationInfoContent[activeCalibrationInfoKey];
  const rawPreviewSrc = previewRegion?.image ? `data:image/png;base64,${previewRegion.image}` : null;
  const processedPreviewSrc = previewResult?.processed_image ? `data:image/png;base64,${previewResult.processed_image}` : null;
  const qualityScore = typeof previewResult?.quality_score === 'number' ? previewResult.quality_score : null;
  const previewIssue = previewResult?.error ?? previewResult?.rejection_reason ?? null;
  const qualityText = previewResult?.detected_text ?? (previewIssue ? `Önizleme sonucu: ${previewIssue}` : null);

  return (
    <>
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
          0% { opacity: 0; transform: translate3d(0, 8px, 0); filter: blur(3px); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); filter: blur(0); }
        }
        [data-calibration-action-button="true"]::after {
          content: '';
          position: absolute;
          inset: 1px;
          display: block;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(125,211,252,0.20), rgba(125,211,252,0.08) 46%, transparent 72%);
          opacity: 0;
          transform: scale(0.78);
          transition: opacity 160ms ease, transform 180ms ease;
          pointer-events: none;
          z-index: 0;
        }
        [data-calibration-action-button="true"]:hover::after {
          opacity: 1;
          transform: scale(1);
        }
        [data-calibration-action-button="true"]:hover {
          opacity: 1 !important;
          filter: drop-shadow(0 0 8px rgba(56,189,248,0.30)) !important;
        }
        [data-calibration-action-button="true"]:active {
          transform: none;
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
        {calibrationInfoDockMounted ? <CalibrationInfoDock info={activeCalibrationInfo} visible={calibrationInfoDockVisible} /> : null}
        <div
          style={{
            height: '100%',
            minHeight: 0,
            borderRadius: 0,
            background: 'transparent',
            display: 'block',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '220px minmax(0, 1fr) 220px',
              gap: 16,
              height: '100%',
              padding: '14px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                ...previewShellStyle,
                gridColumn: '1 / 2',
                display: 'grid',
                gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                padding: '14px',
                gap: 14,
              }}
            >
              <MiniRailBlock
                label="Seçili Motor"
                icon="M10 3h4l1 2 2 1 2-1 2 4-1 2 1 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 1-2-1-2 2-4 2 1 2-1 1-2Z"
                previousValue={previousMotor}
                activeValue={currentMotor}
                nextValue={nextMotor}
                onShift={shiftMotor}
                hover={motorArrowHover}
                setHover={setMotorArrowHover}
                disabled={isTranslating}
              />
              <MiniRailBlock
                label="Performans"
                icon="M5 17V9m5 8V5m5 12v-6m4 6V7"
                previousValue={previousPerformance}
                activeValue={currentPerformance}
                nextValue={nextPerformance}
                onShift={shiftPerformance}
                hover={performanceArrowHover}
                setHover={setPerformanceArrowHover}
                disabled={isTranslating}
                onDoubleClickActiveValue={() => {
                  const perfObj = performanceList[safePerfIndex];
                  if (!perfObj.isBase) {
                    setProfileNameInput(perfObj.name);
                    setProfileNameModal({ open: true, mode: 'rename', initialValue: perfObj.name });
                  }
                }}
                onRenameCancel={() => setProfileNameModal(null)}
              />
              <SceneModeBlock sceneType={sceneType} setSceneType={applySceneType} disabled={isTranslating} />
            </div>

            <div
              style={{
                ...previewShellStyle,
                gridColumn: '2 / 3',
                display: 'grid',
                gridTemplateRows: '220px minmax(0, 1fr)',
                padding: '16px',
                gap: 14,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, minHeight: 0 }}>
                <SkeletonBlock
                  label="Ham Kare"
                  title="Ham Kare"
                  icon="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6"
                  hideTitle
                  sample={
                    rawPreviewSrc ? (
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          borderRadius: 10,
                          cursor: 'zoom-in',
                        }}
                        onClick={(e) => openZoom(e, rawPreviewSrc)}
                        title="Ham kareyi büyüt"
                      >
                        <img
                          src={rawPreviewSrc}
                          alt="Ham Kare"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: 10 }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 16,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(125,211,252,0.30)" strokeWidth="1.4" style={{ width: 28, height: 28 }}>
                            <path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(159,183,207,0.60)', fontWeight: 500 }}>
                            Kalibrasyon için <span style={{ color: 'rgba(125,211,252,0.70)', fontWeight: 600 }}>Alan Seç</span> ile ham kareyi alın
                          </span>
                        </div>
                      </div>
                    )
                  }
                />
                <SkeletonBlock
                  label="İşlenmiş Kare"
                  title="İşlenmiş Kare"
                  icon="M5 8h14M5 12h10M5 16h8"
                  hideTitle
                  sample={
                    processedPreviewSrc ? (
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          borderRadius: 10,
                          cursor: 'zoom-in',
                        }}
                        onClick={(e) => openZoom(e, processedPreviewSrc)}
                        title="İşlenmiş kareyi büyüt"
                      >
                        <img
                          src={processedPreviewSrc}
                          alt="İşlenmiş Kare"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', borderRadius: 10, opacity: 0.95 }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 16,
                          textAlign: 'center',
                          color: 'rgba(159,183,207,0.60)',
                          fontSize: 11.5,
                          lineHeight: 1.5,
                        }}
                      >
                        {previewLoading
                          ? 'İşlenmiş kare hazırlanıyor...'
                          : previewIssue
                            ? previewIssue
                            : previewRegion
                              ? 'Çeviri akışı başladığında işlenmiş kare burada görünecek.'
                              : 'Önce kalibrasyon alanını seçin.'}
                      </div>
                    )
                  }
                />
              </div>
              <SkeletonBlock
                label="Kalibrasyon Ayarları"
                title="Kalibrasyon Ayarları"
                icon="M10 3h4l1 2 2 1 2-1 2 4-1 2 1 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 1-2-1-2 2-4 2 1 2-1 1-2Z"
                hideTitle
                style={{ height: '100%' }}
                headerAction={
                  <CalibrationHeaderActions
                    profileVisible={Boolean(calibrationDraftProfile?.dirty) || !performanceList[safePerfIndex].isBase}
                    infoEnabled={calibrationInfoEnabled}
                    onSave={saveCalibrationDraftProfile}
                    onDelete={deleteCalibrationDraftProfile}
                    onReset={resetCalibrationDraftProfile}
                    onToggleInfo={() => {
                      setCalibrationInfoEnabled((current) => {
                        const next = !current;
                        setActiveCalibrationInfoKey('overview');
                        return next;
                      });
                    }}
                  />
                }
                  sample={
                    <div style={calibrationSettingsGridStyle}>
                    <div
                      style={{
                        minWidth: 0,
                        display: 'grid',
                        gridAutoRows: 'min-content',
                        alignContent: 'center',
                        gap: 20,
                        paddingRight: 10,
                      }}
                    >
                      <CalibrationGroupSection
                        title="Okuma Kararı"
                        description="Temel kabul eşiği ve denge davranışı."
                        infoKey="groupDecision"
                        onInfoFocus={focusCalibrationInfo}
                      >
                        {(['sensitivity', 'characters', 'balance'] as const).map((key) => (
                          <CalibrationSliderControl
                            key={key}
                            item={calibrationControls[key]}
                            value={calibrationValues[key]}
                            onChange={updateCalibrationValue}
                            onInfoFocus={focusCalibrationInfo}
                            disabled={!ocrFiltersEnabled && Boolean(calibrationControls[key].dependsOnImageFilters)}
                          />
                        ))}
                      </CalibrationGroupSection>

                      <CalibrationGroupSection
                        title="İşleyiş"
                        description="Varyant tarama ve sahne uyum mantığı."
                        infoKey="groupFlow"
                        onInfoFocus={focusCalibrationInfo}
                      >
                        {(['attempts', 'match'] as const).map((key) => (
                          <CalibrationSliderControl
                            key={key}
                            item={calibrationControls[key]}
                            value={calibrationValues[key]}
                            onChange={updateCalibrationValue}
                            onInfoFocus={focusCalibrationInfo}
                            disabled={!ocrFiltersEnabled && Boolean(calibrationControls[key].dependsOnImageFilters)}
                          />
                        ))}
                      </CalibrationGroupSection>
                    </div>

                    <div
                      style={{
                        minWidth: 0,
                        display: 'grid',
                        gridAutoRows: 'min-content',
                        alignContent: 'center',
                        gap: 20,
                        paddingLeft: 10,
                        borderLeft: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <CalibrationGroupSection
                        title="Sahne ve Kontrast"
                        description="Şeritli ve şeritsiz sahne kontrast ayrımı."
                        infoKey="groupScene"
                        onInfoFocus={focusCalibrationInfo}
                      >
                        {(['claheStriped', 'clahePlain', 'whiteThreshold'] as const).map((key) => (
                          <CalibrationSliderControl
                            key={key}
                            item={calibrationControls[key]}
                            value={calibrationValues[key]}
                            onChange={updateCalibrationValue}
                            onInfoFocus={focusCalibrationInfo}
                            disabled={!ocrFiltersEnabled && Boolean(calibrationControls[key].dependsOnImageFilters)}
                          />
                        ))}
                      </CalibrationGroupSection>

                      <CalibrationGroupSection
                        title="Görüntü Ayarı"
                        description="Filtre çapı ve eşik işleme sabitleri."
                        infoKey="groupImage"
                        onInfoFocus={focusCalibrationInfo}
                      >
                        {(['bilateral', 'gaussianC', 'meanC'] as const).map((key) => (
                          <CalibrationSliderControl
                            key={key}
                            item={calibrationControls[key]}
                            value={calibrationValues[key]}
                            onChange={updateCalibrationValue}
                            onInfoFocus={focusCalibrationInfo}
                            disabled={!ocrFiltersEnabled && Boolean(calibrationControls[key].dependsOnImageFilters)}
                          />
                        ))}
                      </CalibrationGroupSection>
                    </div>
                  </div>
                }
              />
            </div>

            <div
              style={{
                ...previewShellStyle,
                gridColumn: '3 / 4',
                display: 'grid',
                gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
                padding: '14px',
                gap: 14,
              }}
            >
              <CalibrationAreaBlock
                translationActive={isTranslating}
                hasCalibrationRegion={Boolean(previewRegion)}
                qualityScore={qualityScore}
                qualityText={qualityText}
              />
              <SkeletonBlock
                label="Kalibrasyon Kontrolü"
                title="Alanı seç, ayarları canlı önizle."
                icon="M8 6.5v11l8-5.5-8-5.5Z"
                style={{ ...calibrationGroupTitleStyle }}
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
                      onClick={() => { handleStartCalibrationSelect().catch(() => undefined); }}
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      style={{
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 999,
                        background: 'rgba(255,255,255,0.04)',
                        backdropFilter: 'blur(12px)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
                        padding: '10px 18px',
                        color: '#eef6ff',
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
                      Alan Seç
                    </motion.button>
                    <div
                      style={{
                        color: previewRegion ? 'rgba(223, 247, 255, 0.8)' : 'rgba(159, 183, 207, 0.45)',
                        padding: '8px 4px',
                        fontSize: 11.5,
                        fontWeight: 500,
                        lineHeight: 1.5,
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        wordBreak: 'break-word',
                      }}
                    >
                      {previewRegion ? 'Canlı önizleme açık. Ayarları oynattıkça işlenmiş kare güncellenir.' : 'Önce bir kalibrasyon alanı seç.'}
                    </div>
                  </div>
                }
              />
              <ImprovementToggleBlock
                filtersEnabled={ocrFiltersEnabled}
                onToggleFilters={toggleOcrFilters}
                rawFlowEnabled={rawTranslationFlowEnabled}
                onToggleRawFlow={toggleRawTranslationFlow}
                disabled={isTranslating}
              />
            </div>
          </div>
        </div>
      </div>
    </PanelStage>
    {/* ─── Zoom Viewer Overlay — portal çıktısı (viewport koordinatları için) ─── */}
    {zoomedImage && originRect && targetRect && ReactDOM.createPortal(
      <div
        role="dialog"
        aria-modal="true"
        onClick={closeZoom}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: zoomAnimated ? 'rgba(4,8,13,0.90)' : 'rgba(4,8,13,0)',
          backdropFilter: zoomAnimated ? 'blur(16px)' : 'blur(0px)',
          WebkitBackdropFilter: zoomAnimated ? 'blur(16px)' : 'blur(0px)',
          transition: 'background 300ms ease, backdrop-filter 300ms ease',
          cursor: 'zoom-out',
        }}
      >
        <div
          ref={zoomContainerRef}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            if (zoomScale <= 1 || e.button !== 0) return;
            e.preventDefault();
            dragStartRef.current = { mx: e.clientX, my: e.clientY, px: panX, py: panY };
            setIsDragging(true);
          }}
          onMouseMove={(e) => {
            if (!dragStartRef.current) return;
            setPanX(dragStartRef.current.px + (e.clientX - dragStartRef.current.mx));
            setPanY(dragStartRef.current.py + (e.clientY - dragStartRef.current.my));
          }}
          onMouseUp={() => { dragStartRef.current = null; setIsDragging(false); }}
          onMouseLeave={() => { dragStartRef.current = null; setIsDragging(false); }}
          style={{
            position: 'fixed',
            top: zoomAnimated ? targetRect.top : originRect.top,
            left: zoomAnimated ? targetRect.left : originRect.left,
            width: zoomAnimated ? targetRect.width : originRect.width,
            height: zoomAnimated ? targetRect.height : originRect.height,
            borderRadius: zoomAnimated ? 18 : 10,
            overflow: 'hidden',
            boxShadow: zoomAnimated ? '0 40px 100px rgba(0,0,0,0.80)' : 'none',
            transition: [
              'top 300ms cubic-bezier(0.22,1,0.36,1)',
              'left 300ms cubic-bezier(0.22,1,0.36,1)',
              'width 300ms cubic-bezier(0.22,1,0.36,1)',
              'height 300ms cubic-bezier(0.22,1,0.36,1)',
              'border-radius 300ms ease',
              'box-shadow 300ms ease',
            ].join(', '),
            cursor: isDragging ? 'grabbing' : (zoomScale > 1.01 ? 'grab' : 'default'),
            userSelect: 'none',
          }}
        >
          <img
            src={zoomedImage}
            alt="Zoom"
            draggable={false}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
              transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)',
              pointerEvents: 'none',
            }}
          />
          <button
            type="button"
            onClick={closeZoom}
            aria-label="Kapat"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 34,
              height: 34,
              borderRadius: 999,
              border: 'none',
              background: 'rgba(5,9,14,0.82)',
              backdropFilter: 'blur(8px)',
              color: 'rgba(159,183,207,0.90)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.09)',
              fontSize: 15,
              opacity: zoomAnimated ? 1 : 0,
              transition: 'opacity 200ms ease 100ms',
              pointerEvents: 'all',
            }}
          >
            ✕
          </button>
          {zoomScale > 1.05 && (
            <div
              style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                background: 'rgba(5,9,14,0.76)',
                backdropFilter: 'blur(6px)',
                borderRadius: 8,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: 'rgba(125,211,252,0.80)',
                letterSpacing: '0.04em',
                pointerEvents: 'none',
              }}
            >
              {Math.round(zoomScale * 100)}%
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(5,9,14,0.72)',
              backdropFilter: 'blur(6px)',
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'rgba(159,183,207,0.55)',
              letterSpacing: '0.03em',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              opacity: zoomAnimated ? 1 : 0,
              transition: 'opacity 200ms ease 150ms',
            }}
          >
            Teker &middot; zoom &nbsp;&nbsp;|&nbsp;&nbsp; Sürükle &middot; kaydır &nbsp;&nbsp;|&nbsp;&nbsp; ESC &nbsp;kapat
          </div>
        </div>
      </div>,
      document.body,
    )}
      {profileNameModal && profileNameModal.open && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
          <div style={{ backgroundColor: 'rgba(20,25,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 24, width: 320, backdropFilter: 'blur(10px)' }}>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: '0 0 16px 0' }}>{profileNameModal.mode === 'create' ? 'Yeni Profil Oluştur' : 'Profili Yeniden Adlandır'}</h3>
            <input 
              autoFocus
              type="text" 
              value={profileNameInput} 
              onChange={e => setProfileNameInput(e.target.value)} 
              style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 12px', borderRadius: 6, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }}
              onKeyDown={e => { if (e.key === 'Enter') handleProfileModalSubmit(); if (e.key === 'Escape') setProfileNameModal(null); }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setProfileNameModal(null)} style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#9fb7cf', border: 'none', cursor: 'pointer', borderRadius: 6 }}>İptal</button>
              <button onClick={handleProfileModalSubmit} style={{ padding: '8px 16px', backgroundColor: '#7dd3fc', color: '#000', border: 'none', cursor: 'pointer', borderRadius: 6, fontWeight: 500 }}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
