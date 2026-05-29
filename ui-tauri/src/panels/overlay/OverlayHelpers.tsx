import React, { useEffect, useState, useRef } from 'react';
import { ValueRail } from '../../components/ValueRail';

export type OverlaySettings = {
  mode: 'fixed';
  font_family: string;
  font_size: number;
  font_color: string;
  font_bold: boolean;
  alpha: number;
  bg_visible: boolean;
};
export type TextAnim = 'fade' | 'slide' | 'blur' | 'none';

export const FONTS = ['Segoe UI', 'Arial', 'Tahoma', 'Verdana', 'Trebuchet MS'];
export const COLORS = [
  { hex: '#FFFFFF', label: 'Beyaz' },
  { hex: '#F59E0B', label: 'Turuncu' },
  { hex: '#FDE68A', label: 'Amber' },
  { hex: '#E7F0FF', label: 'Buz' },
];
export const ANIMS: { id: TextAnim; label: string; icon: string }[] = [
  { id: 'fade', label: 'Solma', icon: 'M12 2v20M2 12h20' },
  { id: 'slide', label: 'Kayma', icon: 'M5 12h14M12 5l7 7-7 7' },
  { id: 'blur', label: 'Odak', icon: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M4 12a8 8 0 1 0 16 0' },
  { id: 'none', label: 'Anında', icon: 'M6 12h12' },
];

// ── Style tokens ──────────────────────────────────────────────────────────────
export const LS: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(191,215,242,0.72)', fontWeight: 700 };
export const TS: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' };
export const SS: React.CSSProperties = { fontSize: 10.5, color: 'rgba(159,183,207,0.48)', fontWeight: 400, lineHeight: 1.35 };
export const SH: React.CSSProperties = { borderRadius: 18, background: 'rgba(5,9,14,0.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)', minHeight: 0, overflow: 'hidden' };
export const pageTitleStyle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, color: 'rgba(125,211,252,0.55)', margin: 0 };
export const pageSubStyle: React.CSSProperties = { fontSize: 13, fontWeight: 400, color: 'rgba(159,183,207,0.55)', marginTop: 4 };

// ── Primitive SVG icon ────────────────────────────────────────────────────────
export const G = ({ p }: { p: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
    <path d={p} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const ShiftArrow = ({ direction = 'up' }: { direction?: 'up' | 'down' }) => (
  <G p={direction === 'up' ? 'M8 14.5 12 10.5l4 4' : 'M8 9.5 12 13.5l4-4'} />
);

// ── Blk card ─────────────────────────────────────────────────────────────────
export const Blk = ({
  label, title, icon, children, style, hideTitle,
}: {
  label: string;
  title: React.ReactNode;
  icon: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  hideTitle?: boolean;
}) => {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...SH, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: hov ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)' : SH.boxShadow,
        transition: 'box-shadow 180ms ease',
        ...style
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 22, minHeight: 22, flexShrink: 0 }}>
        <div style={LS}>{label}</div>
        <div style={{ color: 'rgba(172,214,255,0.82)' }}><G p={icon} /></div>
      </div>
      {!hideTitle ? <div style={TS}>{title}</div> : null}
      {children && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>{children}</div>}
    </div>
  );
};

// ── Toggle ────────────────────────────────────────────────────────────────────
export const Toggle = ({ on, toggle, iOff, iOn }: { on: boolean; toggle: () => void; iOff: string; iOn: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', gap: 8 }}>
    <button type="button" onClick={() => { if (on) toggle(); }} style={{ border: 'none', background: 'transparent', padding: 0, cursor: on ? 'pointer' : 'default', color: on ? 'rgba(159,183,207,0.56)' : '#7dd3fc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 180ms ease' }}><G p={iOff} /></button>
    <button type="button" onClick={toggle} aria-pressed={on} style={{ border: 'none', padding: 0, cursor: 'pointer', position: 'relative', height: 28, borderRadius: 999, background: 'linear-gradient(180deg,rgba(7,11,17,0.88),rgba(4,8,13,0.94))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03),0 0 0 1px rgba(255,255,255,0.02)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 1.5, bottom: 1.5, left: on ? 'calc(50%)' : 2, width: 'calc(50% - 2px)', borderRadius: 999, background: 'linear-gradient(180deg,rgba(125,211,252,0.28),rgba(125,211,252,0.14))', transition: 'left 220ms ease' }} />
    </button>
    <button type="button" onClick={() => { if (!on) toggle(); }} style={{ border: 'none', background: 'transparent', padding: 0, cursor: on ? 'default' : 'pointer', color: on ? '#7dd3fc' : 'rgba(159,183,207,0.56)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 180ms ease' }}><G p={iOn} /></button>
  </div>
);

// ── Bar ───────────────────────────────────────────────────────────────────────
export const Bar = ({ ratio, onDrag }: { ratio: number; onDrag?: (r: number) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const pd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onDrag) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => { const r = ref.current; if (!r) return; const rc = r.getBoundingClientRect(); onDrag(Math.min(1, Math.max(0, (ev.clientX - rc.left) / rc.width))); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); mv(e.nativeEvent as PointerEvent);
  };
  const pw = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!onDrag) return;
    e.preventDefault();
    onDrag(Math.min(1, Math.max(0, ratio + (e.deltaY > 0 ? -0.05 : 0.05))));
  };
  return (
    <div ref={ref} onPointerDown={onDrag ? pd : undefined} onWheel={onDrag ? pw : undefined} style={{ padding: '10px 0', margin: '-10px 0', cursor: onDrag ? 'ew-resize' : 'default', userSelect: 'none' }}>
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,rgba(125,211,252,0.50),rgba(125,211,252,0.80))', transition: 'width 120ms ease' }} />
      </div>
    </div>
  );
};

// ── LayerHeaderIconButton ─────────────────────────────────────────────────────
export const LayerHeaderIconButton = ({
  label, icon, tone, onClick,
}: {
  label: string;
  icon: string;
  tone: string;
  onClick: () => void;
}) => {
  const [hov, setHov] = useState(false);
  const [prs, setPrs] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPrs(false); }}
      onMouseDown={() => setPrs(true)}
      onMouseUp={() => setPrs(false)}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      style={{
        width: 24, height: 24, border: 'none', borderRadius: 6, padding: 0,
        background: prs ? 'rgba(255,255,255,0.03)' : (hov ? 'rgba(255,255,255,0.06)' : 'transparent'),
        color: tone,
        boxShadow: hov ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        opacity: prs ? 0.6 : (hov ? 1 : 0.78),
        transform: prs ? 'scale(0.90)' : 'scale(1)',
        filter: hov && !prs ? `drop-shadow(0 0 8px ${tone})` : 'none',
        transition: 'all 120ms ease',
      }}
    >
      <G p={icon} />
    </button>
  );
};

// ── LayerHeaderActions ────────────────────────────────────────────────────────
export const LayerHeaderActions = ({
  visible, onSave, onDelete, onReset,
}: {
  visible: boolean;
  onSave: () => void;
  onDelete: () => void;
  onReset: () => void;
}) => {
  const [mounted, setMounted] = useState(visible);
  const [animVisible, setAnimVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setAnimVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setAnimVisible(false);
    const timeout = window.setTimeout(() => setMounted(false), 170);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, width: 86, height: 24, maxWidth: 86,
      opacity: animVisible ? 1 : 0,
      transform: animVisible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.985)',
      filter: animVisible ? 'blur(0px) saturate(1)' : 'blur(3px) saturate(0.92)',
      clipPath: animVisible ? 'inset(0% 0% 0% 0% round 999px)' : 'inset(10% 8% 10% 8% round 999px)',
      overflow: 'hidden', pointerEvents: animVisible ? 'auto' : 'none',
      transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease',
      willChange: 'opacity, transform, filter, clip-path',
    }}>
      {mounted ? (
        <>
          <LayerHeaderIconButton label="Profili Kaydet" icon="M5 4.5h10l4 4V19.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15Z M8 4.5v5h6v-5 M9 16h6" tone="rgba(134,239,172,0.88)" onClick={onSave} />
          <LayerHeaderIconButton label="Varsayılana Dön" icon="M4 7v5h5M4.8 12A7.2 7.2 0 1 0 7 6.8" tone="rgba(252,211,77,0.90)" onClick={onReset} />
          <LayerHeaderIconButton label="Profili Sil" icon="M6 7h12M9.5 7V5.5h5V7m-6 3v6m3-6v6m3-6v6M8 7l.7 10.1a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L16 7" tone="rgba(252,165,165,0.88)" onClick={onDelete} />
        </>
      ) : null}
    </div>
  );
};

// ── FontPicker ─────────────────────────────────────────────────────────────────
export const FontPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => {
  const fi = Math.max(0, FONTS.indexOf(value));
  return (
    <div
      onWheel={(e) => {
        e.preventDefault();
        onChange(FONTS[Math.min(FONTS.length - 1, Math.max(0, fi + (e.deltaY > 0 ? 1 : -1)))]);
      }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'stretch', userSelect: 'none', width: '100%', minHeight: '100%', overflow: 'hidden' }}
    >
      <div style={{ width: '100%', display: 'grid', gridTemplateRows: '14px minmax(0, auto) 14px', alignItems: 'center', justifyItems: 'center', gap: 2, maxHeight: '100%' }}>
        <button type="button" onClick={() => onChange(FONTS[Math.max(0, fi - 1)])} style={{ border: 'none', background: 'transparent', color: 'rgba(159, 183, 207, 0.64)', cursor: 'pointer', padding: 0, height: 14, width: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 160ms ease' }}>
          <ShiftArrow direction="up" />
        </button>
        <div style={{ width: '100%' }}>
          <ValueRail size="mini" previousValue={fi > 0 ? FONTS[fi - 1] : null} activeValue={FONTS[fi]} nextValue={fi < FONTS.length - 1 ? FONTS[fi + 1] : null} />
        </div>
        <button type="button" onClick={() => onChange(FONTS[Math.min(FONTS.length - 1, fi + 1)])} style={{ border: 'none', background: 'transparent', color: 'rgba(159, 183, 207, 0.64)', cursor: 'pointer', padding: 0, height: 14, width: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 160ms ease' }}>
          <ShiftArrow direction="down" />
        </button>
      </div>
    </div>
  );
};

// ── AnimPicker ────────────────────────────────────────────────────────────────
export const AnimPicker = ({
  value,
  onChange,
}: {
  value: TextAnim;
  onChange: (next: TextAnim) => void;
}) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 6, height: '100%', minHeight: 0 }}>
    {ANIMS.map(a => (
      <button
        key={a.id}
        type="button"
        onClick={() => onChange(a.id)}
        title={a.label}
        style={{
          borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 0,
          background: value === a.id ? 'rgba(125,211,252,0.12)' : 'rgba(255,255,255,0.04)',
          color: value === a.id ? 'rgba(125,211,252,0.90)' : 'rgba(159,183,207,0.50)',
          boxShadow: value === a.id ? 'inset 0 0 0 1px rgba(125,211,252,0.28)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          transition: 'background 160ms ease,color 160ms ease,box-shadow 160ms ease',
        }}>
        <G p={a.icon} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }}>{a.label.toUpperCase()}</span>
      </button>
    ))}
  </div>
);
