import React, { type CSSProperties, useEffect, useState } from 'react';
import { WorkspaceView } from './WorkspaceView';
import { CalibrationView } from './CalibrationView';
import {
  conceptABasePerformanceOptions,
  getConceptABasePerformanceIdFromSettings,
  getSettingsPerformanceKeyFromConceptA,
  type ConceptAPerformanceOption,
} from '../config/workspacePerformance';
import { useAppContext } from '../context/AppContext';
import { wsClient } from '../bridge/websocket';
import { workspaceEngineOptions, type ConceptAEngineId, type ConceptAEngineOption } from '../config/workspaceEngine';

type ConceptATab = 'workspace' | 'calibration';

export type WorkspacePanelProps = {
  activeTab?: ConceptATab;
};

export const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ activeTab = 'workspace' }) => {
  const { settings, hardware, runtimeEngine } = useAppContext();
  const [displayedTab, setDisplayedTab] = useState<ConceptATab>(activeTab);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const [performanceOptions, setPerformanceOptions] = useState<ConceptAPerformanceOption[]>(conceptABasePerformanceOptions);
  const [currentPerformanceId, setCurrentPerformanceId] = useState<string>('Performans');
  const [currentEngineId, setCurrentEngineId] = useState<ConceptAEngineId>('easy');
  const lastRequestedTabRef = React.useRef<ConceptATab>(activeTab);

  const engineOptions = React.useMemo<ConceptAEngineOption[]>(() => {
    const available = new Set((hardware?.available_engines ?? []).filter((engine): engine is ConceptAEngineId =>
      engine === 'easy' || engine === 'winonly',
    ));
    const filtered = workspaceEngineOptions.filter((option) => available.has(option.id));
    if (filtered.length > 0) return filtered;
    return workspaceEngineOptions.filter((option) => option.id === currentEngineId);
  }, [currentEngineId, hardware?.available_engines]);

  useEffect(() => {
    const nextEngine = runtimeEngine ?? settings?.ocr_engine ?? 'easy';
    if (nextEngine === 'easy' || nextEngine === 'winonly') {
      setCurrentEngineId(nextEngine);
    }
  }, [runtimeEngine, settings?.ocr_engine]);

  useEffect(() => {
    const nextBaseId = getConceptABasePerformanceIdFromSettings(settings?.performance_tier);
    const customProfileId = settings?.active_calibration_profile_id;
    if (customProfileId && performanceOptions.some((item) => item.id === customProfileId)) {
      setCurrentPerformanceId(customProfileId);
      return;
    }
    setCurrentPerformanceId(nextBaseId);
  }, [performanceOptions, settings?.active_calibration_profile_id, settings?.performance_tier]);

  const handleEngineChange = (nextId: string) => {
    if (nextId !== 'easy' && nextId !== 'winonly') return;
    if (nextId === currentEngineId) return;
    setCurrentEngineId(nextId);
    wsClient.send('change_engine', { engine: nextId });
  };

  const handlePerformanceChange = (nextId: string) => {
    setCurrentPerformanceId(nextId);
    const nextOption = performanceOptions.find((item) => item.id === nextId);
    if (!nextOption) return;
    wsClient.send('save_settings', {
      performance_tier: getSettingsPerformanceKeyFromConceptA(nextOption.baseTier),
      active_calibration_profile_id: nextOption.isBase ? null : nextOption.id,
    });
  };

  useEffect(() => {
    if (lastRequestedTabRef.current === activeTab) return;
    lastRequestedTabRef.current = activeTab;

    setPhase('out');
    const t1 = window.setTimeout(() => {
      setDisplayedTab(activeTab);
      setPhase('in');
    }, 120);
    const t2 = window.setTimeout(() => {
      setPhase('idle');
    }, 240);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [activeTab]);

  const panelStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    transition: 'opacity 160ms ease',
    opacity: phase === 'out' ? 0.04 : 1,
    willChange: 'opacity',
  };

  const content = (
    <>
      <div style={{ position: 'absolute', inset: 0, visibility: displayedTab === 'calibration' ? 'visible' : 'hidden', pointerEvents: displayedTab === 'calibration' ? 'auto' : 'none', opacity: displayedTab === 'calibration' ? 1 : 0 }}>
        <CalibrationView
          currentPerformanceId={currentPerformanceId}
          onPerformanceChange={handlePerformanceChange}
          onPerformanceOptionsChange={setPerformanceOptions}
          engineOptions={engineOptions}
          currentEngineId={currentEngineId}
          onEngineChange={handleEngineChange}
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, visibility: displayedTab === 'workspace' ? 'visible' : 'hidden', pointerEvents: displayedTab === 'workspace' ? 'auto' : 'none', opacity: displayedTab === 'workspace' ? 1 : 0 }}>
        <WorkspaceView
          performanceOptions={performanceOptions}
          currentPerformanceId={currentPerformanceId}
          onPerformanceChange={handlePerformanceChange}
          engineOptions={engineOptions}
          currentEngineId={currentEngineId}
          onEngineChange={handleEngineChange}
        />
      </div>
    </>
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(5,9,14,0.98), rgba(3,6,10,1))',
      }}
    >
      <div
        style={{
          ...panelStyle,
          position: 'absolute',
          inset: 0,
        }}
      >
        {content}
      </div>
    </div>
  );
};
