import React from 'react';
import { PanelStage } from './PanelStage';
import { conceptABasePerformanceOptions, type ConceptAPerformanceOption } from '../config/workspacePerformance';
import { type ConceptAEngineOption } from '../config/workspaceEngine';
import { useWorkspaceState } from './workspace/useWorkspaceState';
import { PreviewColumn } from './workspace/PreviewColumn';
import { ControlColumn } from './workspace/ControlColumn';
import { SessionColumn } from './workspace/SessionColumn';

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
  const ws = useWorkspaceState({
    performanceOptions,
    currentPerformanceId,
    onPerformanceChange,
    engineOptions,
    currentEngineId,
    onEngineChange,
  });

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
    <div style={{
      position: 'relative',
      zIndex: 1,
      height: '100%',
      padding: '62px 20px 18px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        height: '100%',
        minHeight: 0,
        borderRadius: 0,
        background: 'transparent',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        boxShadow: 'none',
        display: 'block',
        overflow: 'hidden',
      }}>
        <div style={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 220px 220px',
          gap: 16,
          height: '100%',
          padding: '14px',
        }}>
          {/* Column 1 — Text Preview */}
          <div style={{
            minHeight: 0,
            borderRadius: 24,
            background: 'rgba(255,255,255,0.045)',
            display: 'grid',
            gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
            padding: '16px',
            gap: 14,
          }}>
            <PreviewColumn
              sourcePreviewText={ws.sourcePreviewText}
              translatedPreviewText={ws.translatedPreviewText}
              shouldShowSourcePreviewHelp={ws.shouldShowSourcePreviewHelp}
              shouldShowTargetPreviewHelp={ws.shouldShowTargetPreviewHelp}
            />
          </div>

          {/* Column 2 — Controls */}
          <div style={{
            minHeight: 0,
            borderRadius: 24,
            background: 'rgba(255,255,255,0.045)',
            display: 'grid',
            gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
            padding: '14px',
            gap: 14,
          }}>
            <ControlColumn
              isTranslating={ws.isTranslating}
              currentPerformance={ws.currentPerformance}
              previousPerformance={ws.previousPerformance}
              nextPerformance={ws.nextPerformance}
              shiftPerformance={ws.shiftPerformance}
              performanceArrowHover={ws.performanceArrowHover}
              setPerformanceArrowHover={ws.setPerformanceArrowHover}
              currentMotor={ws.currentMotor}
              previousMotor={ws.previousMotor}
              nextMotor={ws.nextMotor}
              shiftMotor={ws.shiftMotor}
              motorArrowHover={ws.motorArrowHover}
              setMotorArrowHover={ws.setMotorArrowHover}
              activeService={ws.activeService}
              previousService={ws.previousService}
              nextService={ws.nextService}
              shiftService={ws.shiftService}
              serviceArrowHover={ws.serviceArrowHover}
              setServiceArrowHover={ws.setServiceArrowHover}
              activeModel={ws.activeModel}
              previousModel={ws.previousModel}
              nextModel={ws.nextModel}
              shiftModel={ws.shiftModel}
              modelEnabled={ws.modelEnabled}
              modelArrowHover={ws.modelArrowHover}
              setModelArrowHover={ws.setModelArrowHover}
              sourceLanguage={ws.sourceLanguage}
              targetLanguage={ws.targetLanguage}
              shiftSourceLanguage={ws.shiftSourceLanguage}
              shiftTargetLanguage={ws.shiftTargetLanguage}
              swapLanguages={ws.swapLanguages}
              languageArrowHover={ws.languageArrowHover}
              setLanguageArrowHover={ws.setLanguageArrowHover}
              languageSwapHover={ws.languageSwapHover}
              setLanguageSwapHover={ws.setLanguageSwapHover}
            />
          </div>

          {/* Column 3 — Session */}
          <div style={{
            minHeight: 0,
            borderRadius: 24,
            background: 'rgba(255,255,255,0.045)',
            display: 'grid',
            gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
            padding: '14px',
            gap: 14,
          }}>
            <SessionColumn
              isTranslating={ws.isTranslating}
              isLoadingEngine={ws.isLoadingEngine}
              isFloating={ws.isFloating}
              sceneModeName={ws.sceneModeName}
              sceneModeBest={ws.sceneModeBest}
              applySceneType={ws.applySceneType}
              scanStatus={ws.scanStatus}
              motorStatus={ws.motorStatus}
              loopStatus={ws.loopStatus}
              regionActionLabel={ws.regionActionLabel}
              translationActionLabel={ws.translationActionLabel}
              handleStartRegionSelect={ws.handleStartRegionSelect}
              handleToggleTranslation={ws.handleToggleTranslation}
            />
          </div>
        </div>
      </div>
    </div>
  </PanelStage>
  );
};
