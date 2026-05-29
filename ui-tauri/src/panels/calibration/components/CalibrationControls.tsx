import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {ValueRail} from '../../../components/ValueRail';
import type { CalibrationRuntimeValues } from '../../../config/calibrationPresets';
import type { HoverState, CalibrationPreviewResult, CalibrationControlKey, CalibrationControlConfig, ConceptCalibrationSnapshot, CalibrationValues, ConceptCalibrationDraftProfile, CalibrationInfoKey, CalibrationInfoContent, ImprovementMode, CalibrationAreaMode } from '../CalibrationTypes';
import {labelStyle, shellStyle, calibrationGroupTitleStyle, calibrationHintTextStyle} from '../CalibrationConfig';
import {clampNumber, normalizeCalibrationValue, formatCalibrationValue} from '../CalibrationUtils';
import {LayerGlyph} from './BaseBlocks';
import {CalibrationAreaBlock} from './CalibrationLayout';

export const CalibrationSliderControl = ({
  item,
  value,
  onChange,
  onInfoFocus,
  disabled = false,
}: {
  item: CalibrationControlConfig;
  value: number;
  onChange: (key: CalibrationControlKey, value: number) => void;
  onInfoFocus?: (key: CalibrationInfoKey) => void;
  disabled?: boolean;
}) => {
  const percent = item.max > item.min ? clampNumber(((value - item.min) / (item.max - item.min)) * 100, 0, 100) : 0;
  const setFromClientX = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = rect.width > 0 ? clampNumber((clientX - rect.left) / rect.width, 0, 1) : 0;
    onChange(item.key, normalizeCalibrationValue(item.min + ratio * (item.max - item.min), item));
  };
  const adjustByStep = (direction: -1 | 1) => {
    onChange(item.key, normalizeCalibrationValue(value + direction * item.step, item));
  };

  return (
    <div
      data-calibration-info-hotspot="true"
      onMouseEnter={() => onInfoFocus?.(item.key)}
      onWheel={(event) => {
        if (disabled) return;
        event.preventDefault();
        onInfoFocus?.(item.key);
        adjustByStep(event.deltaY > 0 ? -1 : 1);
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: disabled ? 0.42 : 1,
        filter: disabled ? 'saturate(0.62)' : 'saturate(1)',
        transition: 'opacity 180ms ease, filter 180ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#e2eefb', letterSpacing: '-0.01em' }}>{item.label}</div>
        <div style={{ fontSize: 11, fontWeight: 750, color: '#dbeafe', letterSpacing: '0.055em', textTransform: 'uppercase' }}>
          {formatCalibrationValue(value, item)}
        </div>
      </div>
      <div
        role="slider"
        aria-label={item.label}
        aria-valuemin={item.min}
        aria-valuemax={item.max}
        aria-valuenow={value}
        tabIndex={0}
        onFocus={() => onInfoFocus?.(item.key)}
        onKeyDown={(event) => {
          if (disabled) return;
          onInfoFocus?.(item.key);
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            adjustByStep(-1);
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            adjustByStep(1);
          }
        }}
        onMouseDown={(event) => {
          if (disabled) return;
          onInfoFocus?.(item.key);
          const track = event.currentTarget;
          setFromClientX(event.clientX, track);

          const handleMouseMove = (moveEvent: MouseEvent) => {
            setFromClientX(moveEvent.clientX, track);
          };
          const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
          };

          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
        }}
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.095), rgba(255,255,255,0.055))',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(255,255,255,0.045)',
          overflow: 'visible',
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${percent}%`,
            top: 0,
            bottom: 0,
            borderRadius: 999,
            background: disabled ? 'rgba(148,163,184,0.22)' : `linear-gradient(90deg, ${item.accentStart}, ${item.accentEnd})`,
            boxShadow: disabled ? 'none' : `0 0 18px ${item.glow}`,
            transition: 'width 120ms ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${percent}%`,
            top: '50%',
            width: 14,
            height: 14,
            borderRadius: 999,
            transform: 'translate(-50%, -50%)',
            background: disabled ? 'linear-gradient(180deg, #b7c1ce, #748194)' : 'linear-gradient(180deg, #f8fbff, #b9cce3)',
            boxShadow: disabled ? '0 4px 10px rgba(0,0,0,0.22), 0 0 0 3px rgba(15,23,42,0.82)' : `0 5px 14px rgba(0,0,0,0.32), 0 0 0 3px rgba(15,23,42,0.82), 0 0 18px ${item.glow}`,
            transition: 'left 120ms ease',
          }}
        />
      </div>
    </div>
  );
};


export const CalibrationGroupSection = ({
  title,
  description,
  children,
  infoKey,
  onInfoFocus,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  infoKey?: CalibrationInfoKey;
  onInfoFocus?: (key: CalibrationInfoKey) => void;
}) => (
  <div
    data-calibration-info-hotspot={infoKey ? 'true' : undefined}
    onMouseEnter={() => {
      if (infoKey) onInfoFocus?.(infoKey);
    }}
    style={{ minWidth: 0, display: 'grid', alignContent: 'start', gap: 12 }}
  >
    <div style={calibrationGroupTitleStyle}>{title}</div>
    <div style={calibrationHintTextStyle}>{description}</div>
    {children}
  </div>
);


export const ImprovementToggleBlock = ({
  filtersEnabled,
  onToggleFilters,
  rawFlowEnabled,
  onToggleRawFlow,
  disabled = false,
}: {
  filtersEnabled: boolean;
  onToggleFilters: () => void;
  rawFlowEnabled: boolean;
  onToggleRawFlow: () => void;
  disabled?: boolean;
}) => {
  const [mode, setMode] = useState<ImprovementMode>('filters');
  const [displayMode, setDisplayMode] = useState<ImprovementMode>('filters');
  const [contentVisible, setContentVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (mode === displayMode) return undefined;
    setContentVisible(false);
    const t = window.setTimeout(() => {
      setDisplayMode(mode);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 110);
    return () => window.clearTimeout(t);
  }, [mode, displayMode]);

  const toggleCard = () => setMode((current) => (current === 'filters' ? 'rawFlow' : 'filters'));
  const isFiltersMode = displayMode === 'filters';
  const activeEnabled = isFiltersMode ? filtersEnabled : rawFlowEnabled;
  const headerLabel = isFiltersMode ? 'İyileştirme' : 'Ham Akış';
  const headerIcon = isFiltersMode
    ? 'M4 7h16M7 12h10M9 17h6'
    : 'M5 7h14M5 12h14M5 17h14';
  const title = isFiltersMode
    ? (filtersEnabled ? 'Geliştirilmiş Okuma' : 'Doğal Kare Okuması')
    : (rawFlowEnabled ? 'Ham Çeviri Akışı' : 'Filtrelenmiş Çeviri Akışı');
  const subtitle = isFiltersMode
    ? (filtersEnabled ? 'Ön işleme katmanları görüntüyü okumaya hazırlar.' : 'Görüntü doğrudan OCR katmanına gönderilir.')
    : (rawFlowEnabled ? 'Metin, ek filtreler olmadan doğrudan çeviriye gider.' : 'Kalite ve tekrar denetimleri çeviri akışını düzenler.');
  const offIcon = isFiltersMode ? 'M4 7h16M4 12h16M4 17h16' : 'M4 6h16M6 12h12M8 18h8';
  const onIcon = isFiltersMode ? 'M4 7h16M7 12h10M10 17h4' : 'M5 7h14M5 12h14M5 17h14';
  const actionToggle = isFiltersMode ? onToggleFilters : onToggleRawFlow;

  return (
    <div
      onClick={toggleCard}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...shellStyle,
        position: 'relative',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: hovered
          ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 180ms ease, opacity 280ms ease, background 280ms ease',
        opacity: !disabled ? 1 : 0.48,
        background: !disabled ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 24, minHeight: 24 }}>
        <div style={{ ...labelStyle, opacity: contentVisible ? 1 : 0, transition: 'opacity 160ms ease' }}>
          {headerLabel}
        </div>
        <div
          style={{
            color: 'rgba(172,214,255,0.82)',
            opacity: contentVisible ? 1 : 0,
            filter: hovered ? 'drop-shadow(0 0 6px rgba(125,211,252,0.42))' : 'none',
            transition: 'opacity 160ms ease, filter 180ms ease',
          }}
        >
          <LayerGlyph path={headerIcon} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 0 }}>
        <div
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? 'translateY(0)' : 'translateY(5px)',
            filter: contentVisible ? 'blur(0px)' : 'blur(2px)',
            transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease',
            willChange: 'opacity, transform, filter',
            display: 'grid',
            alignContent: 'center',
            gap: 14,
            width: '100%',
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.45, letterSpacing: '-0.01em' }}>
              {title}
            </span>
            <span style={{ fontSize: 11, fontWeight: 400, lineHeight: 1.45, color: 'rgba(159,183,207,0.48)', maxWidth: 260 }}>
              {subtitle}
            </span>
            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(169,189,216,0.28) 0%, rgba(169,189,216,0.12) 40%, rgba(169,189,216,0) 100%)' }} />
          </div>

          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 36px',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => { if (activeEnabled) actionToggle(); }}
              aria-label={`${headerLabel} kapat`}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: activeEnabled ? 'pointer' : 'default',
                width: 36,
                height: 36,
                color: activeEnabled ? 'rgba(159, 183, 207, 0.56)' : '#7dd3fc',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 180ms ease',
              }}
            >
              <LayerGlyph path={offIcon} />
            </button>
            <button
              type="button"
              onClick={actionToggle}
              aria-pressed={activeEnabled}
              aria-label={headerLabel}
              style={{
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                position: 'relative',
                width: '100%',
                height: 28,
                borderRadius: 999,
                background: 'linear-gradient(180deg,rgba(7,11,17,0.88),rgba(4,8,13,0.94))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03),0 0 0 1px rgba(255,255,255,0.02)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 1.5,
                  bottom: 1.5,
                  left: activeEnabled ? 'calc(50%)' : 2,
                  width: 'calc(50% - 2px)',
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, rgba(125,211,252,0.28), rgba(125,211,252,0.14))',
                  transition: 'left 220ms ease',
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => { if (!activeEnabled) actionToggle(); }}
              aria-label={`${headerLabel} ac`}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: activeEnabled ? 'default' : 'pointer',
                width: 36,
                height: 36,
                color: activeEnabled ? '#7dd3fc' : 'rgba(159, 183, 207, 0.56)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 180ms ease',
              }}
            >
              <LayerGlyph path={onIcon} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CalibrationAreaBlock ────────────────────────────────────────────────────

