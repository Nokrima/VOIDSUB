import React, { useEffect, useRef, useState } from 'react';

export type InfoBubbleLayout = {
  bubbleLeft: number;
  bubbleTop: number;
  bubbleWidth: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
};

export type CalibrationInfoDetail = {
  what: string;
  lower: string;
  higher: string;
  mode: string;
};

export type CalibrationSliderConfig = {
  k: string;
  l: string;
  min: number;
  max: number;
  step: number;
  c: string;
  dependsOnImageFilters?: boolean;
};

const INFO_BUBBLE_VIEWPORT_MARGIN = 8;
const INFO_BUBBLE_VERTICAL_GAP = 10;
const INFO_BUBBLE_HORIZONTAL_OFFSET = 3;
const INFO_BUBBLE_BOUNDARY_INSET = 3;
const INFO_BUBBLE_LEFT_ZONE_RATIO = 0.34;
const INFO_BUBBLE_ARROW_SIZE = 10;
const INFO_BUBBLE_ARROW_EDGE_PADDING = 8;
const INFO_BUBBLE_ARROW_OVERLAP = 1;

const INFO_BUBBLE_TEXT_LABELS = {
  what: '◎',
  lower: '←',
  higher: '→',
  mode: '✦',
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const computeInfoBubbleLayout = (
  rowRect: DOMRect,
  boundaryRect: DOMRect,
  triggerRect: DOMRect,
  bubbleWidth: number,
  bubbleHeight: number,
): InfoBubbleLayout => {
  const viewportMargin = INFO_BUBBLE_VIEWPORT_MARGIN;
  const triggerCenterX = triggerRect.left + (triggerRect.width / 2);
  const minBubbleLeft = Math.max(viewportMargin, boundaryRect.left + INFO_BUBBLE_BOUNDARY_INSET);
  const maxBubbleLeft = Math.max(
    minBubbleLeft,
    Math.min(window.innerWidth - bubbleWidth - viewportMargin, boundaryRect.right - bubbleWidth - INFO_BUBBLE_BOUNDARY_INSET),
  );
  const leftZoneThreshold = boundaryRect.left + (boundaryRect.width * INFO_BUBBLE_LEFT_ZONE_RATIO);
  const preferredBubbleLeft = triggerCenterX <= leftZoneThreshold
    ? minBubbleLeft
    : triggerRect.left - INFO_BUBBLE_HORIZONTAL_OFFSET;
  const clampedBubbleLeft = clamp(preferredBubbleLeft, minBubbleLeft, maxBubbleLeft);
  const bubbleLeft = clampedBubbleLeft - rowRect.left;
  const fitsBelow = triggerRect.bottom + INFO_BUBBLE_VERTICAL_GAP + bubbleHeight <= window.innerHeight - viewportMargin;
  const fitsAbove = triggerRect.top - INFO_BUBBLE_VERTICAL_GAP - bubbleHeight >= viewportMargin;
  const placement: 'top' | 'bottom' = !fitsBelow && fitsAbove ? 'top' : 'bottom';
  const bubbleTop = placement === 'bottom'
    ? triggerRect.bottom - rowRect.top + INFO_BUBBLE_VERTICAL_GAP
    : triggerRect.top - rowRect.top - bubbleHeight - INFO_BUBBLE_VERTICAL_GAP;
  const arrowLeft = clamp(
    triggerCenterX - clampedBubbleLeft - (INFO_BUBBLE_ARROW_SIZE / 2),
    INFO_BUBBLE_ARROW_EDGE_PADDING,
    bubbleWidth - INFO_BUBBLE_ARROW_EDGE_PADDING - INFO_BUBBLE_ARROW_SIZE,
  );

  return {
    bubbleLeft,
    bubbleTop,
    bubbleWidth,
    arrowLeft,
    placement,
  };
};

export const CalibrationInfoBubble = ({
  title,
  info,
  layout,
  bubbleRef,
}: {
  title: string;
  info: CalibrationInfoDetail;
  layout: InfoBubbleLayout;
  bubbleRef: React.RefObject<HTMLDivElement | null>;
}) => (
  <div
    data-info-bubble="true"
    className="anim-pop-in"
    style={{
      position: 'absolute',
      top: layout.bubbleTop,
      left: layout.bubbleLeft,
      width: layout.bubbleWidth,
      zIndex: 9800,
    }}
  >
    <div
      ref={bubbleRef}
      style={{
        position: 'relative',
        borderRadius: 16,
        border: '1px solid rgba(96,165,250,0.22)',
        background: 'rgba(15,23,42,0.98)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.34)',
        padding: '12px 12px 11px 12px',
        color: 'rgba(219,234,254,0.94)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: layout.placement === 'bottom' ? -(INFO_BUBBLE_ARROW_SIZE / 2) + INFO_BUBBLE_ARROW_OVERLAP : 'auto',
          bottom: layout.placement === 'top' ? -(INFO_BUBBLE_ARROW_SIZE / 2) + INFO_BUBBLE_ARROW_OVERLAP : 'auto',
          left: layout.arrowLeft,
          width: INFO_BUBBLE_ARROW_SIZE,
          height: INFO_BUBBLE_ARROW_SIZE,
          background: 'rgba(15,23,42,0.98)',
          borderLeft: layout.placement === 'bottom' ? '1px solid rgba(96,165,250,0.22)' : 'none',
          borderTop: layout.placement === 'bottom' ? '1px solid rgba(96,165,250,0.22)' : 'none',
          borderRight: layout.placement === 'top' ? '1px solid rgba(96,165,250,0.22)' : 'none',
          borderBottom: layout.placement === 'top' ? '1px solid rgba(96,165,250,0.22)' : 'none',
          transform: 'rotate(45deg)',
        }}
      />
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#dbeafe' }}>{title}</div>
      </div>
      <div style={{ display: 'grid', gap: 6, fontSize: 11, lineHeight: 1.55 }}>
        <div><span style={{ color: '#93c5fd', fontWeight: 700 }}>{INFO_BUBBLE_TEXT_LABELS.what}</span> {info.what}</div>
        <div><span style={{ color: '#93c5fd', fontWeight: 700 }}>{INFO_BUBBLE_TEXT_LABELS.lower}</span> {info.lower}</div>
        <div><span style={{ color: '#93c5fd', fontWeight: 700 }}>{INFO_BUBBLE_TEXT_LABELS.higher}</span> {info.higher}</div>
        <div><span style={{ color: '#93c5fd', fontWeight: 700 }}>{INFO_BUBBLE_TEXT_LABELS.mode}</span> {info.mode}</div>
      </div>
    </div>
  </div>
);

export const HomePanelTabButton = ({
  active,
  label,
  accentColor,
  textColor,
  mutedColor,
  onClick,
}: {
  active: boolean;
  label: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'flex-end',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${accentColor}` : '2px solid transparent',
      color: active ? textColor : mutedColor,
      padding: '8px 4px',
      minHeight: 28,
      lineHeight: 1,
      fontSize: 16,
      fontWeight: 600,
      transition: 'border-color var(--dur-fast) ease, color var(--dur-fast) ease',
    }}
  >
    {label}
  </button>
);

export const ZoomModal = ({
  zoomedImage,
  zoomScale,
  panOrigin,
  panStart,
  isPanning,
  setZoomScale,
  setPanOrigin,
  setIsPanning,
  setPanStart,
  onClose,
}: {
  zoomedImage: string;
  zoomScale: number;
  panOrigin: { x: number; y: number };
  panStart: { x: number; y: number };
  isPanning: boolean;
  setZoomScale: React.Dispatch<React.SetStateAction<number>>;
  setPanOrigin: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  setPanStart: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  onClose: () => void;
}) => (
  <div
    style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    onWheel={(e) => { e.preventDefault(); setZoomScale((s) => Math.max(0.5, Math.min(s + e.deltaY * -0.005, 5))); }}
    onMouseDown={(e) => { setIsPanning(true); setPanStart({ x: e.clientX - panOrigin.x, y: e.clientY - panOrigin.y }); }}
    onMouseMove={(e) => { if (isPanning) setPanOrigin({ x: e.clientX - panStart.x, y: e.clientY - panStart.y }); }}
    onMouseUp={() => setIsPanning(false)}
    onMouseLeave={() => setIsPanning(false)}
  >
    <button style={{ position: 'absolute', top: 20, right: 30, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>×</button>
    <img src={`data:image/png;base64,${zoomedImage}`} alt="Yakından" style={{ transform: `translate(${panOrigin.x}px, ${panOrigin.y}px) scale(${zoomScale})`, transition: isPanning ? 'none' : 'transform 0.1s', maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain', pointerEvents: 'none' }} />
  </div>
);

export const CalibrationSliderItem = ({
  item,
  value,
  percent,
  isDisabled,
  textColor,
  openInfoKey,
  info,
  infoBubbleLayout,
  infoRowRefs,
  infoTriggerRefs,
  infoBubbleRef,
  formatValue,
  onAdjustWheel,
  onToggleInfo,
  onStartDrag,
}: {
  item: CalibrationSliderConfig;
  value: number;
  percent: number;
  isDisabled: boolean;
  textColor: string;
  openInfoKey: string | null;
  info?: CalibrationInfoDetail;
  infoBubbleLayout: InfoBubbleLayout | null;
  infoRowRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  infoTriggerRefs: React.MutableRefObject<Record<string, HTMLSpanElement | null>>;
  infoBubbleRef: React.RefObject<HTMLDivElement | null>;
  formatValue: (key: string, value: number) => string;
  onAdjustWheel: (delta: number) => void;
  onToggleInfo: () => void;
  onStartDrag: (event: React.MouseEvent<HTMLDivElement>) => void;
}) => (
  <div
    onWheel={(event) => {
      if (isDisabled) return;
      event.preventDefault();
      onAdjustWheel(event.deltaY);
    }}
    style={{ minWidth: 0, padding: '2px 0 6px 0', opacity: isDisabled ? 0.42 : 1 }}
  >
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.76)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.l}
      </span>
      <div style={{ fontSize: 10.5, color: textColor, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {formatValue(item.k, value)}
      </div>
    </div>
    <div
      ref={(node) => { infoRowRefs.current[item.k] = node; }}
      style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '15px minmax(0,1fr)', alignItems: 'center', gap: 4, position: 'relative', overflow: 'visible' }}
    >
      <span
        ref={(node) => { infoTriggerRefs.current[item.k] = node; }}
        data-info-trigger="true"
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          onToggleInfo();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggleInfo();
          }
        }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', background: openInfoKey === item.k ? 'rgba(96,165,250,0.24)' : 'rgba(96,165,250,0.14)', border: '1px solid rgba(96,165,250,0.38)', fontSize: 9, color: '#93c5fd', flexShrink: 0, transition: 'background var(--dur-fast) ease, transform var(--dur-fast) ease' }}
      >
        i
      </span>
      <div
        onMouseDown={(event) => {
          if (isDisabled) return;
          onStartDrag(event);
        }}
        style={{ position: 'relative', height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}
      >
        <div style={{ width: `${percent}%`, height: '100%', background: item.c, borderRadius: 999, transition: 'width 140ms ease' }} />
      </div>
      {openInfoKey === item.k && info && infoBubbleLayout && (
        <CalibrationInfoBubble
          title={item.l}
          info={info}
          layout={infoBubbleLayout}
          bubbleRef={infoBubbleRef}
        />
      )}
    </div>
  </div>
);

type RailSize = 'full' | 'compact' | 'mini';

/** Vertical step between items — mirrors OverlayPanel font wheel spacing */
const RAIL_STEP_PX: Record<RailSize, number> = {
  full: 26,
  compact: 22,
  mini: 22,
};

const railBandClass: Record<RailSize, string> = {
  full: 'pointer-events-none absolute inset-x-0 top-1/2 h-[34px] -translate-y-1/2 rounded-[12px] bg-[linear-gradient(90deg,rgba(96,165,250,0.04),rgba(96,165,250,0.14),rgba(96,165,250,0.04))] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12),0_0_22px_rgba(96,165,250,0.06)]',
  compact: 'pointer-events-none absolute inset-x-0 top-1/2 h-[28px] -translate-y-1/2 rounded-[10px] bg-[linear-gradient(90deg,rgba(96,165,250,0.04),rgba(96,165,250,0.14),rgba(96,165,250,0.04))] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)]',
  mini: 'pointer-events-none absolute inset-x-0 top-1/2 h-[28px] -translate-y-1/2 rounded-[10px] bg-[linear-gradient(90deg,rgba(96,165,250,0.04),rgba(96,165,250,0.14),rgba(96,165,250,0.04))] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)]',
};

const railOuterClass: Record<RailSize, string> = {
  full: 'relative min-w-0 overflow-hidden px-1 text-center',
  compact: 'relative min-w-0 overflow-hidden px-1 text-center',
  mini: 'mt-1.5 relative overflow-hidden px-0.5 text-center flex-1',
};

const railInputClass: Record<RailSize, string> = {
  full: 'w-full bg-transparent text-[1.05rem] font-semibold text-white text-center outline-none',
  compact: 'w-full bg-transparent text-[0.88rem] font-semibold text-white text-center outline-none',
  mini: 'w-full bg-transparent text-[0.88rem] font-semibold text-white text-center outline-none',
};

const RAIL_HEIGHT_PX: Record<RailSize, number> = { full: 68, compact: 56, mini: 56 };
const RAIL_ACTIVE_FONT: Record<RailSize, string> = { full: '1.05rem', compact: '0.88rem', mini: '0.88rem' };
const RAIL_CAP_FONT:    Record<RailSize, string> = { full: '10px',     compact: '9px',      mini: '9px' };
const RAIL_CAP_TRACKING: Record<RailSize, string> = { full: '0.22em', compact: '0.18em', mini: '0.18em' };

export const ValueRail = ({
  size,
  label,
  previousValue,
  activeValue,
  nextValue,
  onActiveDoubleClick,
  isEditing = false,
  editingValue = '',
  onEditingChange,
  onEditingCommit,
  maxLength = 18,
}: {
  size: RailSize;
  label?: string;
  previousValue: string | null;
  activeValue: string;
  nextValue: string | null;
  onActiveDoubleClick?: () => void;
  isEditing?: boolean;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onEditingCommit?: () => void;
  maxLength?: number;
}) => {
  const step = RAIL_STEP_PX[size];

  // Track scroll direction for slide animation — exactly like OverlayPanel font wheel
  const prevActiveRef = useRef(activeValue);
  const prevNextRef   = useRef(nextValue);
  const [slideKey, setSlideKey] = useState(0);
  const [slideDir, setSlideDir] = useState<'up' | 'down'>('up');

  useEffect(() => {
    if (activeValue !== prevActiveRef.current) {
      // new active was old next → wheel scrolled down → new item slides UP into view
      // new active was old prev → wheel scrolled up  → new item slides DOWN into view
      const wasNext = activeValue === prevNextRef.current;
      setSlideDir(wasNext ? 'up' : 'down');
      setSlideKey((k) => k + 1);
    }
    prevActiveRef.current = activeValue;
    prevNextRef.current   = nextValue;
  }, [activeValue, nextValue]);

  const items = [
    { id: 'prev', value: previousValue ?? '—', offset: -step, isActive: false },
    { id: `active-${slideKey}`, value: activeValue,         offset: 0,     isActive: true  },
    { id: 'next', value: nextValue   ?? '—', offset:  step, isActive: false },
  ];

  const rail = (
    <div className={railOuterClass[size]}>
      {isEditing ? (
        <input
          autoFocus
          value={editingValue}
          onChange={(event) => onEditingChange?.(event.target.value)}
          onBlur={() => onEditingCommit?.()}
          onKeyDown={(event) => { if (event.key === 'Enter') onEditingCommit?.(); }}
          className={railInputClass[size]}
          maxLength={maxLength}
        />
      ) : (
        /* Band AND items share the same positioned ancestor → perfect vertical alignment */
        <div style={{ position: 'relative', height: RAIL_HEIGHT_PX[size], width: '100%' }}>
          {/* Selection highlight band — same reference box as items */}
          <div className={railBandClass[size]} />
          {items.map(({ id, value, offset, isActive }) => (
            /*
             * POSITIONING wrapper: always at the correct vertical center.
             * Never plays any animation — transform here must not be overridden.
             */
            <div
              key={id}
              onDoubleClick={isActive ? () => onActiveDoubleClick?.() : undefined}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: '50%',
                transform: `translateY(calc(-50% + ${offset}px))`,
                pointerEvents: isActive ? 'auto' : 'none',
              }}
            >
              {/*
               * VISUAL wrapper: holds text styles + slide animation for active item.
               * Animation only moves this inner div ±10px relative to already-centered parent
               * → does NOT touch the parent's centering transform.
               */}
              <div
                key={isActive ? `v-${slideKey}` : undefined}
                style={{
                  textAlign: 'center',
                  fontSize: isActive ? RAIL_ACTIVE_FONT[size] : RAIL_CAP_FONT[size],
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.22)',
                  letterSpacing: isActive ? undefined : RAIL_CAP_TRACKING[size],
                  textTransform: isActive ? undefined : 'uppercase' as const,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  padding: '0 4px',
                  /* Slide animation ONLY on the active item, keyed by slideKey so it replays */
                  animation: isActive
                    ? `${slideDir === 'up' ? 'rail-slide-up' : 'rail-slide-down'} 160ms ease both`
                    : undefined,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!label) return rail;

  return (
    <div className="flex flex-col min-w-0">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/26">{label}</div>
      {rail}
    </div>
  );
};
