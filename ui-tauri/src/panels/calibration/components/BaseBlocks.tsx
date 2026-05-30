import React, { useEffect, useRef, useState } from 'react';
import { ValueRail } from '../../../components/ValueRail';
import { HoverState } from '../CalibrationTypes';
import { labelStyle, titleStyle, shellStyle } from '../CalibrationConfig';

export const LayerGlyph = ({ path, size = 18 }: { path: string, size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: size, height: size }}>
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


export const ShiftArrow = ({ direction = 'up', size = 18 }: { direction?: 'up' | 'down', size?: number }) => (
  <LayerGlyph path={direction === 'up' ? 'M8 14.5 12 10.5l4 4' : 'M8 9.5 12 13.5l4-4'} size={size} />
);


export const SkeletonBlock = ({
  label,
  title,
  icon,
  style,
  hideTitle = false,
  sample,
  headerAction,
  interactive = false,
}: {
  label: string;
  title: React.ReactNode;
  icon: string;
  style?: React.CSSProperties;
  hideTitle?: boolean;
  sample?: React.ReactNode;
  headerAction?: React.ReactNode;
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
        position: 'relative',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 0,
        boxShadow: glowActive
          ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 180ms ease',
        ...style,
      }}
    >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 24, minHeight: 24 }}>
      <div style={labelStyle}>{label}</div>
      {!headerAction ? (
        <div style={{ color: 'rgba(172, 214, 255, 0.82)' }}>
          <LayerGlyph path={icon} />
        </div>
      ) : null}
    </div>
    {headerAction ? (
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          color: 'rgba(172, 214, 255, 0.82)',
          zIndex: 3,
        }}
      >
        {headerAction}
      </div>
    ) : null}
    {!hideTitle ? <div style={{ ...titleStyle, marginTop: 8 }}>{title}</div> : null}
    {sample ? (
      <div
        style={{
          marginTop: hideTitle ? 0 : 10,
          flex: hideTitle ? 1 : undefined,
          display: hideTitle ? 'flex' : undefined,
          alignItems: hideTitle ? 'center' : undefined,
          justifyContent: hideTitle ? 'center' : undefined,
          minHeight: 0,
          height: hideTitle ? '100%' : undefined,
          width: '100%'
        }}
      >
        {sample}
      </div>
    ) : null}
  </div>
  );
};


export const MiniRailBlock = ({
  label,
  icon,
  previousValue,
  activeValue,
  nextValue,
  onShift,
  hover,
  setHover,
  onDoubleClickActiveValue,
  isEditingValue,
  onRenameSubmit,
  onRenameCancel,
  disabled = false,
}: {
  label: string;
  icon: string;
  previousValue: string | null;
  activeValue: string;
  nextValue: string | null;
  onShift: (dir: -1 | 1) => void;
  hover: HoverState;
  setHover: (value: HoverState) => void;
  onDoubleClickActiveValue?: () => void;
  isEditingValue?: boolean;
  onRenameSubmit?: (newName: string) => void;
  onRenameCancel?: () => void;
  disabled?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editVal, setEditVal] = useState(activeValue);

  useEffect(() => {
    if (isEditingValue) {
      setEditVal(activeValue);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    }
  }, [isEditingValue, activeValue]);

  const handleCommit = () => {
    if (!isEditingValue) return;
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== activeValue) {
      onRenameSubmit?.(trimmed);
    } else {
      onRenameCancel?.();
    }
  };

  return (
    <SkeletonBlock
      label={label}
      title={label}
      icon={icon}
      hideTitle
      interactive={!disabled}
      style={{
        opacity: !disabled ? 1 : 0.48,
        background: !disabled ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
        transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
      }}
      sample={
        <div
          onWheel={(event) => {
            if (isEditingValue) return;
            onShift(event.deltaY > 0 ? 1 : -1);
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
          {isEditingValue ? (
            <input
              ref={inputRef}
              type="text"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommit();
                } else if (e.key === 'Escape') {
                  onRenameCancel?.();
                }
              }}
              onBlur={handleCommit}
              maxLength={24}
              style={{
                width: '100%',
                background: 'rgba(5, 9, 14, 0.6)',
                border: '1px solid rgba(125,211,252,0.4)',
                borderRadius: 4,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center',
                padding: '4px 8px',
                outline: 'none',
                boxShadow: '0 0 8px rgba(125,211,252,0.2)',
              }}
            />
          ) : (
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
                onClick={() => onShift(-1)}
                onMouseEnter={() => setHover('up')}
                onMouseLeave={() => setHover(null)}
                aria-label={`${label} yukarı`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: hover === 'up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                  cursor: 'pointer',
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                  transform: hover === 'up' ? 'translateY(-1px)' : 'none',
                  opacity: hover === 'up' ? 1 : 0.82,
                }}
              >
                <ShiftArrow direction="up" size={16} />
              </button>
              <div style={{ width: '100%' }} onDoubleClick={() => onDoubleClickActiveValue?.()}>
                <ValueRail size="mini" previousValue={previousValue} activeValue={activeValue} nextValue={nextValue} />
              </div>
              <button
                type="button"
                onClick={() => onShift(1)}
                onMouseEnter={() => setHover('down')}
                onMouseLeave={() => setHover(null)}
                aria-label={`${label} aşağı`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: hover === 'down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                  cursor: 'pointer',
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                  transform: hover === 'down' ? 'translateY(1px)' : 'none',
                  opacity: hover === 'down' ? 1 : 0.82,
                }}
              >
                <ShiftArrow direction="down" size={16} />
              </button>
            </div>
          )}
        </div>
      }
    />
  );
};


