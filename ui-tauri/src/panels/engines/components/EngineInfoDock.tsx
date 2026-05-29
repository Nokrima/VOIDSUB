import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { G, engineInfoContent } from '../EnginesConfig';
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
        transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease, height 180ms ease' }}
    >
      <div
        ref={contentRef}
        style={{
          opacity: contentVisible ? 1 : 0, transform: contentVisible ? 'translateY(0)' : 'translateY(4px)',
          filter: contentVisible ? 'blur(0px)' : 'blur(2px)', transition: 'opacity 130ms ease, transform 130ms ease, filter 130ms ease' }}
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


