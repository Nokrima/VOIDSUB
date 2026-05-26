import React, { useRef, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { PanelStage } from './PanelStage';
import { getEventHistory, onEvent, useWebSocket } from '../bridge/websocket';

import { ValueRail } from '../components/ValueRail';

type OverlaySettings = { mode: 'fixed'; font_family: string; font_size: number; font_color: string; font_bold: boolean; alpha: number; bg_visible: boolean; };
type AppSettingsLite = { reading_speed_cps?: number };
type TextAnim = 'fade' | 'slide' | 'blur' | 'none';



const FONTS = ['Segoe UI', 'Arial', 'Tahoma', 'Verdana', 'Trebuchet MS'];
const COLORS = [{ hex: '#FFFFFF', label: 'Beyaz' }, { hex: '#F59E0B', label: 'Turuncu' }, { hex: '#FDE68A', label: 'Amber' }, { hex: '#E7F0FF', label: 'Buz' }];
const ANIMS: { id: TextAnim; label: string; icon: string }[] = [
  { id: 'fade', label: 'Solma', icon: 'M12 2v20M2 12h20' },
  { id: 'slide', label: 'Kayma', icon: 'M5 12h14M12 5l7 7-7 7' },
  { id: 'blur', label: 'Odak', icon: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M4 12a8 8 0 1 0 16 0' },
  { id: 'none', label: 'Anında', icon: 'M6 12h12' },
];

// tokens
const LS: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(191,215,242,0.72)', fontWeight: 700 };
const TS: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.01em' };
const SS: React.CSSProperties = { fontSize: 10.5, color: 'rgba(159,183,207,0.48)', fontWeight: 400, lineHeight: 1.35 };
const SH: React.CSSProperties = { borderRadius: 18, background: 'rgba(5,9,14,0.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)', minHeight: 0, overflow: 'hidden' };
const pageTitleStyle: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, color: 'rgba(125,211,252,0.55)', margin: 0 };
const pageSubStyle: React.CSSProperties = { fontSize: 13, fontWeight: 400, color: 'rgba(159,183,207,0.55)', marginTop: 4 };

const G = ({ p }: { p: string }) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}><path d={p} strokeLinecap="round" strokeLinejoin="round" /></svg>);
const ShiftArrow = ({ direction = 'up' }: { direction?: 'up' | 'down' }) => (<G p={direction === 'up' ? 'M8 14.5 12 10.5l4 4' : 'M8 9.5 12 13.5l4-4'} />);

const Blk = ({ label, title, icon, children, style, hideTitle }: { label: string; title: React.ReactNode; icon: string; children?: React.ReactNode; style?: React.CSSProperties; hideTitle?: boolean }) => {
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
        <div style={{ color: 'rgba(172,214,255,0.82)' }}>
          <G p={icon} />
        </div>
      </div>
      {!hideTitle ? <div style={TS}>{title}</div> : null}
      {children && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>{children}</div>}
    </div>
  );
};

const Toggle = ({ on, toggle, iOff, iOn }: { on: boolean; toggle: () => void; iOff: string; iOn: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', gap: 8 }}>
    <button type="button" onClick={() => { if (on) toggle(); }} style={{ border: 'none', background: 'transparent', padding: 0, cursor: on ? 'pointer' : 'default', color: on ? 'rgba(159,183,207,0.56)' : '#7dd3fc', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 180ms ease' }}><G p={iOff} /></button>
    <button type="button" onClick={toggle} aria-pressed={on} style={{ border: 'none', padding: 0, cursor: 'pointer', position: 'relative', height: 28, borderRadius: 999, background: 'linear-gradient(180deg,rgba(7,11,17,0.88),rgba(4,8,13,0.94))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03),0 0 0 1px rgba(255,255,255,0.02)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 1.5, bottom: 1.5, left: on ? 'calc(50%)' : 2, width: 'calc(50% - 2px)', borderRadius: 999, background: 'linear-gradient(180deg,rgba(125,211,252,0.28),rgba(125,211,252,0.14))', transition: 'left 220ms ease' }} />
    </button>
    <button type="button" onClick={() => { if (!on) toggle(); }} style={{ border: 'none', background: 'transparent', padding: 0, cursor: on ? 'default' : 'pointer', color: on ? '#7dd3fc' : 'rgba(159,183,207,0.56)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 180ms ease' }}><G p={iOn} /></button>
  </div>
);

const Bar = ({ ratio, onDrag }: { ratio: number; onDrag?: (r: number) => void }) => {
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
    const step = 0.05;
    onDrag(Math.min(1, Math.max(0, ratio + (e.deltaY > 0 ? -step : step))));
  };
  return (
    <div ref={ref} onPointerDown={onDrag ? pd : undefined} onWheel={onDrag ? pw : undefined} style={{ padding: '10px 0', margin: '-10px 0', cursor: onDrag ? 'ew-resize' : 'default', userSelect: 'none' }}>
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,rgba(125,211,252,0.50),rgba(125,211,252,0.80))', transition: 'width 120ms ease' }} />
      </div>
    </div>
  );
};



const LayerHeaderIconButton = ({
  label,
  icon,
  tone,
  onClick,
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
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: 24,
        height: 24,
        border: 'none',
        borderRadius: 6,
        padding: 0,
        background: prs ? 'rgba(255,255,255,0.03)' : (hov ? 'rgba(255,255,255,0.06)' : 'transparent'),
        color: tone,
        boxShadow: hov ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
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

const LayerHeaderActions = ({
  visible,
  onSave,
  onDelete,
  onReset,
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
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        width: 86,
        height: 24,
        maxWidth: 86,
        opacity: animVisible ? 1 : 0,
        transform: animVisible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.985)',
        filter: animVisible ? 'blur(0px) saturate(1)' : 'blur(3px) saturate(0.92)',
        clipPath: animVisible ? 'inset(0% 0% 0% 0% round 999px)' : 'inset(10% 8% 10% 8% round 999px)',
        overflow: 'hidden',
        pointerEvents: animVisible ? 'auto' : 'none',
        transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease',
        willChange: 'opacity, transform, filter, clip-path',
      }}
    >
      {mounted ? (
        <>
          <LayerHeaderIconButton
            label="Profili Kaydet"
            icon="M5 4.5h10l4 4V19.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15Z M8 4.5v5h6v-5 M9 16h6"
            tone="rgba(134,239,172,0.88)"
            onClick={onSave}
          />
          <LayerHeaderIconButton
            label="Varsayılana Dön"
            icon="M4 7v5h5M4.8 12A7.2 7.2 0 1 0 7 6.8"
            tone="rgba(252,211,77,0.90)"
            onClick={onReset}
          />
          <LayerHeaderIconButton
            label="Profili Sil"
            icon="M6 7h12M9.5 7V5.5h5V7m-6 3v6m3-6v6m3-6v6M8 7l.7 10.1a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L16 7"
            tone="rgba(252,165,165,0.88)"
            onClick={onDelete}
          />
        </>
      ) : null}
    </div>
  );
};

export const OverlayPanel: React.FC = () => {
  const { send, isConnected } = useWebSocket();
  const { notify, activePage } = useAppContext();
  type TransProfile = {
    id: string;
    name: string;
    isBase: boolean;
    data: {
      cur: OverlaySettings;
      spd: number;
      shadow: boolean;
      anim: string;
    }
  };

  const defaultProfiles: TransProfile[] = [
    { id: 'default', name: 'Varsayılan', isBase: true, data: { cur: { mode: 'fixed', font_family: 'Arial', font_size: 18, font_color: '#E7F0FF', font_bold: false, alpha: 0.5, bg_visible: false }, spd: 60, shadow: false, anim: 'fade' } },
    { id: 'cinema', name: 'Dizi ve Film', isBase: true, data: { cur: { mode: 'fixed', font_family: 'Tahoma', font_size: 22, font_color: '#F59E0B', font_bold: true, alpha: 0.5, bg_visible: false }, spd: 60, shadow: true, anim: 'slide' } },
    { id: 'game', name: 'Oyun Modu', isBase: true, data: { cur: { mode: 'fixed', font_family: 'Trebuchet MS', font_size: 20, font_color: '#FFFFFF', font_bold: true, alpha: 0.7, bg_visible: true }, spd: 75, shadow: true, anim: 'none' } },
    { id: 'focus', name: 'Okuma Odaklı', isBase: true, data: { cur: { mode: 'fixed', font_family: 'Segoe UI', font_size: 24, font_color: '#FDE68A', font_bold: true, alpha: 0.85, bg_visible: true }, spd: 45, shadow: false, anim: 'fade' } },
    { id: 'minimal', name: 'Sade Görünüm', isBase: true, data: { cur: { mode: 'fixed', font_family: 'Verdana', font_size: 14, font_color: '#FFFFFF', font_bold: false, alpha: 0.5, bg_visible: false }, spd: 90, shadow: false, anim: 'none' } },
  ];

  const [profiles, setProfiles] = useState<TransProfile[]>(() => {
    try {
      const saved = localStorage.getItem('voidsub_overlay_profiles');
      return saved ? JSON.parse(saved) : defaultProfiles;
    } catch {
      return defaultProfiles;
    }
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    return localStorage.getItem('voidsub_overlay_active_profile') || 'default';
  });

  useEffect(() => {
    localStorage.setItem('voidsub_overlay_profiles', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem('voidsub_overlay_active_profile', activeProfileId);
  }, [activeProfileId]);
  const [isRenamingProfile, setIsRenamingProfile] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeProfileIndex = profiles.findIndex(p => p.id === activeProfileId) >= 0 ? profiles.findIndex(p => p.id === activeProfileId) : 0;
  const activeProfile = profiles[activeProfileIndex];

  const baseCur = activeProfile.data.cur;
  const baseSpd = activeProfile.data.spd;
  const baseShadow = activeProfile.data.shadow;
  const baseAnim = activeProfile.data.anim;

  const [cur, setCur] = useState<OverlaySettings>(baseCur);
  const [spd, setSpd] = useState(baseSpd);
  const [shadow, setShadow] = useState(baseShadow);
  const [anim, setAnim] = useState(baseAnim);
  const [isVisible, setIsVisible] = useState(true);
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  const shiftProfile = (dir: -1 | 1) => {
    if (isRenamingProfile) return;
    const nextIdx = (activeProfileIndex + dir + profiles.length) % profiles.length;
    const nextProf = profiles[nextIdx];
    setActiveProfileId(nextProf.id);
    setCur(nextProf.data.cur);
    setSpd(nextProf.data.spd);
    setShadow(nextProf.data.shadow);
    setAnim(nextProf.data.anim);
    send('save_overlay_settings', nextProf.data.cur);
  };

  const handleRenameCommit = () => {
    if (!isRenamingProfile) return;
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== activeProfile.name) {
      setProfiles(prev => prev.map(p => p.id === activeProfile.id ? { ...p, name: trimmed } : p));
    }
    setIsRenamingProfile(false);
  };

  const isCustom =
    cur.font_family !== baseCur.font_family ||
    cur.font_size !== baseCur.font_size ||
    cur.font_bold !== baseCur.font_bold ||
    cur.font_color !== baseCur.font_color ||
    cur.bg_visible !== baseCur.bg_visible ||
    cur.alpha !== baseCur.alpha ||
    spd !== baseSpd ||
    shadow !== baseShadow ||
    anim !== baseAnim;

  useEffect(() => {
    if (isConnected && getEventHistory('overlay_settings_loaded').length === 0) send('get_settings');
    const u1 = onEvent('overlay_settings_loaded', (d) => setCur({ ...(d as OverlaySettings), mode: 'fixed' }));
    const u2 = onEvent('app_settings_loaded', (d) => setSpd(Number((d as AppSettingsLite).reading_speed_cps ?? 60)));
    const u3 = onEvent('translation_state', (d) => {
        if ((d as any).running) setIsPreviewActive(false);
    });
    return () => { u1(); u2(); u3(); };
  }, [isConnected, send]);

  useEffect(() => {
    const t = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => setIsVisible(true), 600);
    }, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (activePage !== 'canvasB' && isPreviewActive) {
      setIsPreviewActive(false);
      send('clear_overlay');
    }
  }, [activePage, isPreviewActive, send]);

  useEffect(() => {
    if (!isPreviewActive) {
      send('clear_overlay');
      return;
    }
    let toggle = false;
    const texts = [
        "Bu canlı bir çeviri önizlemesidir, panel ayarları buraya yansır.",
        "Örnek metin ekranınızın ayarladığınız köşesinde belirir."
    ];
    const sendPreview = () => {
        send('test_overlay_push', { text: texts[toggle ? 1 : 0] });
        toggle = !toggle;
    };
    sendPreview();
    const interval = setInterval(sendPreview, 3500);
    return () => {
      clearInterval(interval);
      send('clear_overlay');
    };
  }, [isPreviewActive, send]);

  const updAnim = (v: TextAnim) => { setAnim(v); send('save_overlay_settings', { ...cur, anim: v, shadow }); };
  const updShadow = (v: boolean) => { setShadow(v); send('save_overlay_settings', { ...cur, anim, shadow: v }); };

  const upd = <K extends keyof OverlaySettings>(k: K, v: OverlaySettings[K]) =>
    setCur(p => { if (p[k] === v) return p; const n = { ...p, [k]: v }; send('save_overlay_settings', { ...n, anim, shadow }); return n; });
  const updSpd = (v: number) => { const n = Math.min(90, Math.max(0, v)); setSpd(n); send('save_settings', { reading_speed_cps: n }); };

  const fi = Math.max(0, FONTS.indexOf(cur.font_family));
  const opa = Math.round(cur.alpha * 100);
  const previewShadow = shadow ? '0 4px 14px rgba(0,0,0,0.90)' : 'none';

  return (
    <PanelStage css={`
      @keyframes cBLine{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(0,28px,0)}}
      @keyframes cBFlow{0%{transform:translate3d(-30%,0,0);opacity:0}18%{opacity:.13}82%{opacity:.13}100%{transform:translate3d(30%,0,0);opacity:0}}
      @keyframes cBGlow{0%,100%{opacity:.60}50%{opacity:1}}
      @keyframes cASwap{0%{opacity:0;transform:translate3d(0,8px,0);filter:blur(3px)}100%{opacity:1;transform:translate3d(0,0,0);filter:blur(0)}}
    `} layers={[
        { inset: 0, background: 'linear-gradient(180deg,rgba(5,9,14,0.98),rgba(3,6,10,1))' },
        { inset: '-10%', backgroundImage: 'linear-gradient(rgba(251,191,36,0.07) 1px,transparent 1px)', backgroundSize: '100% 32px', opacity: 0.5, maskImage: 'linear-gradient(180deg,transparent 8%,rgba(0,0,0,0.70) 30%,rgba(0,0,0,0.70) 70%,transparent 92%)', animation: 'cBLine 6s linear infinite' },
        { inset: '-20%', background: 'radial-gradient(circle at 22% 58%,rgba(251,191,36,0.14),transparent 34%),radial-gradient(circle at 76% 38%,rgba(56,130,220,0.12),transparent 30%),radial-gradient(circle at 50% 82%,rgba(168,85,247,0.08),transparent 26%)', filter: 'blur(32px)', animation: 'cBGlow 8s ease-in-out infinite' },
        { inset: '-20%', background: 'linear-gradient(90deg,transparent 38%,rgba(251,191,36,0.10) 50%,transparent 62%)', filter: 'blur(22px)', animation: 'cBFlow 9s ease-in-out infinite' },
      ]}>
      <div style={{ position: 'relative', zIndex: 1, height: '100%', padding: '62px 34px 32px', boxSizing: 'border-box', display: 'grid', gridTemplateRows: 'auto 1fr', gap: 16, minHeight: 0 }}>
        <div>
          <h1 style={pageTitleStyle}>Çeviri Katmanı</h1>
          <div style={pageSubStyle}>Ekran üzeri metin görünümünü yapılandır</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 220px minmax(0,1fr)', gap: 14, minHeight: 0, alignItems: 'stretch' }}>

          {/* ── SOL: Yazı ayarları ── */}
          <div style={{ minHeight: 0, borderRadius: 24, background: 'rgba(255,255,255,0.045)', padding: '14px', display: 'grid', gridTemplateRows: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
            <Blk label="Yazı Tipi" icon="M4 7h16M7 12h10M9 17h6" title={<div />} hideTitle>
              <div
                onWheel={(e) => {
                  e.preventDefault();
                  const nextIndex = Math.min(FONTS.length - 1, Math.max(0, fi + (e.deltaY > 0 ? 1 : -1)));
                  upd('font_family', FONTS[nextIndex]);
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'stretch', userSelect: 'none', width: '100%', minHeight: '100%', overflow: 'hidden' }}
              >
                <div style={{ width: '100%', display: 'grid', gridTemplateRows: '14px minmax(0, auto) 14px', alignItems: 'center', justifyItems: 'center', gap: 2, maxHeight: '100%' }}>
                  <button type="button" onClick={() => {
                    const nextIndex = Math.max(0, fi - 1);
                    upd('font_family', FONTS[nextIndex]);
                  }} style={{ border: 'none', background: 'transparent', color: 'rgba(159, 183, 207, 0.64)', cursor: 'pointer', padding: 0, height: 14, width: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease' }}>
                    <ShiftArrow direction="up" />
                  </button>
                  <div style={{ width: '100%' }}>
                    <ValueRail size="mini"
                      previousValue={fi > 0 ? FONTS[fi - 1] : null}
                      activeValue={FONTS[fi]}
                      nextValue={fi < FONTS.length - 1 ? FONTS[fi + 1] : null}
                    />
                  </div>
                  <button type="button" onClick={() => {
                    const nextIndex = Math.min(FONTS.length - 1, fi + 1);
                    upd('font_family', FONTS[nextIndex]);
                  }} style={{ border: 'none', background: 'transparent', color: 'rgba(159, 183, 207, 0.64)', cursor: 'pointer', padding: 0, height: 14, width: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease' }}>
                    <ShiftArrow direction="down" />
                  </button>
                </div>
              </div>
            </Blk>

            <Blk label="Yazı Boyutu" icon="M4 12h16M4 6h16M4 18h10"
              title={<div key={cur.font_size} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>{cur.font_size} px</span><span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>12 – 32 px</span></div>}>
              <Bar ratio={(cur.font_size - 12) / 20} onDrag={r => upd('font_size', Math.round(12 + r * 20))} />
            </Blk>

            <Blk label="Yazı Kalınlığı" icon="M6 4h8a4 4 0 0 1 0 8H6ZM6 12h9a4 4 0 0 1 0 8H6Z"
              title={<div key={String(cur.font_bold)} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>{cur.font_bold ? 'Kalın' : 'Normal'}</span><span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>{cur.font_bold ? 'Ağır ağırlık' : 'Standart ağırlık'}</span></div>}>
              <Toggle on={cur.font_bold} toggle={() => upd('font_bold', !cur.font_bold)} iOff="M4 7h16M4 12h16M4 17h16" iOn="M6 4h8a4 4 0 0 1 0 8H6ZM6 12h9a4 4 0 0 1 0 8H6Z" />
            </Blk>

            <Blk label="Yazı Gölgesi" icon="M12 8c-1.5 0-3 .8-3 2.5S10.5 16 12 16s3-1.5 3-4"
              title={<div key={String(shadow)} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>{shadow ? 'Aktif' : 'Pasif'}</span><span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>{shadow ? 'Metin derinliği' : 'Düz metin'}</span></div>}>
              <Toggle on={shadow} toggle={() => updShadow(!shadow)} iOff="M4 7h16M4 12h16M4 17h16" iOn="M3 12h18M6 8l-3 4 3 4M18 8l3 4-3 4" />
            </Blk>
          </div>

          {/* ── ORTA: Arkaplan ve Efektler ── */}
          <div style={{ minHeight: 0, borderRadius: 24, background: 'rgba(255,255,255,0.045)', padding: '14px', display: 'grid', gridTemplateRows: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
            <Blk label="Yazı Rengi" icon="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Z"
              title={<div key={cur.font_color} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>{COLORS.find(c => c.hex === cur.font_color)?.label ?? 'Özel'}</span><span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>Metin rengi</span></div>}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {COLORS.map(({ hex, label }) => (
                  <button key={hex} type="button" onClick={() => upd('font_color', hex)} aria-label={label}
                    style={{ height: 30, borderRadius: 10, border: 'none', cursor: 'pointer', background: hex, boxShadow: cur.font_color === hex ? '0 0 0 2px rgba(125,211,252,0.70),0 0 12px rgba(125,211,252,0.20)' : '0 0 0 1px rgba(255,255,255,0.10)', transition: 'box-shadow 160ms ease' }} />
                ))}
              </div>
            </Blk>

            <Blk label="Altyazı Akışı" icon="M13 2L3 14h9l-1 8 10-12h-9l1-8Z"
              title={<div key={spd} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>{spd <= 0 ? 'Kalıcı (Sabit)' : spd <= 30 ? 'Ağır Çekim' : spd <= 45 ? 'Yavaş' : spd <= 60 ? 'Standart' : spd <= 75 ? 'Hızlı' : 'Çok Hızlı'}</span>
                <span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>{spd <= 0 ? 'Yeni metin gelene kadar' : `${spd} Harf / Saniye`}</span>
              </div>}>
              <Bar ratio={spd <= 0 ? 0 : (spd - 30) / 60} onDrag={r => {
                  const val = Math.round((30 + r * 60) / 5) * 5;
                  updSpd(r < 0.05 ? 0 : val);
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {[0, 30, 45, 60, 90].map(v => (
                  <button key={v} type="button" onClick={() => updSpd(v)}
                    style={{ background: spd === v ? 'rgba(125,211,252,0.14)' : 'transparent', border: 'none', borderRadius: 6, padding: '3px 6px', color: spd === v ? 'rgba(125,211,252,0.90)' : 'rgba(159,183,207,0.45)', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'background 160ms ease,color 160ms ease' }}>{v === 0 ? '∞' : v}</button>
                ))}
              </div>
            </Blk>

            <Blk label="Arkaplan" icon="M4 6h16v12H4z"
              title={<div key={String(cur.bg_visible)} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>{cur.bg_visible ? 'Görünür' : 'Gizli'}</span><span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>{cur.bg_visible ? 'Bant modu aktif' : 'Yalnızca metin'}</span></div>}>
              <Toggle on={cur.bg_visible} toggle={() => upd('bg_visible', !cur.bg_visible)} iOff="M21 3H3v18h18V3z" iOn="M3 3h18v18H3z" />
            </Blk>

            <Blk label="Saydamlık" icon="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3Z"
              title={<div key={opa} style={{ animation: 'cASwap 200ms ease both', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: 'rgba(159, 183, 207, 0.85)', fontSize: 12, fontWeight: 600 }}>%{opa}</span><span style={{ fontSize: 12, color: 'rgba(159,183,207,0.45)' }}>{cur.bg_visible ? 'Arkaplan opaklığı' : 'Arkaplan kapalı'}</span></div>}
              style={{ opacity: cur.bg_visible ? 1 : 0.45, pointerEvents: cur.bg_visible ? 'auto' : 'none', transition: 'opacity 200ms ease' }}>
              <Bar ratio={cur.alpha} onDrag={r => upd('alpha', Math.round(r * 100) / 100)} />
            </Blk>
          </div>

          {/* ── SAĞ: L Panel (Canlı Önizleme ve Animasyon tek kabukta) ── */}
          <div style={{ minHeight: 0, borderRadius: 24, background: 'rgba(255,255,255,0.045)', display: 'flex', flexDirection: 'column', padding: '14px', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 24 }}>
                <div style={LS}>Canlı Önizleme</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, minWidth: 117, height: 24 }}>
                  <LayerHeaderActions
                    visible={isCustom}
                    onSave={() => {
                      if (activeProfile.isBase) {
                        if (profiles.length >= 6) {
                          notify('error', 'Maksimum 5 özel tasarım limitine ulaştınız.', 'concept_layer_action');
                          return;
                        }
                        const newId = `trans-${Date.now()}`;
                        const newName = `Özel Tasarım ${profiles.length}`;
                        const newData = { cur, spd, shadow, anim };
                        setProfiles(prev => [...prev, { id: newId, name: newName, isBase: false, data: newData }]);
                        setActiveProfileId(newId);
                        notify('success', 'Yeni tasarım profili başarıyla oluşturuldu.', 'concept_layer_action');
                      } else {
                        const newData = { cur, spd, shadow, anim };
                        setProfiles(prev => prev.map(p => p.id === activeProfile.id ? { ...p, data: newData } : p));
                        notify('success', 'Tasarım profili güncellendi.', 'concept_layer_action');
                      }
                    }}
                    onDelete={() => {
                      if (!activeProfile.isBase) {
                        setProfiles(prev => prev.filter(p => p.id !== activeProfile.id));
                        setActiveProfileId('default');
                        const def = profiles.find(p => p.isBase)!.data;
                        setCur(def.cur); setSpd(def.spd); setShadow(def.shadow); setAnim(def.anim);
                        notify('info', 'Özel tasarım silindi. Varsayılan şablona dönüldü.', 'concept_layer_action');
                      } else {
                        const def = activeProfile.data;
                        setCur(def.cur); setSpd(def.spd); setShadow(def.shadow); setAnim(def.anim);
                        notify('info', 'Değişiklikler silindi. Varsayılan değerlere dönüldü.', 'concept_layer_action');
                      }
                    }}
                    onReset={() => {
                      setCur(baseCur);
                      setSpd(baseSpd);
                      setShadow(baseShadow);
                      setAnim(baseAnim);
                      send('save_overlay_settings', baseCur);
                      notify('info', 'Değişiklikler iptal edildi ve son kaydedilen duruma dönüldü.', 'concept_layer_action');
                    }}
                  />
                  <button type="button" onClick={() => setIsPreviewActive(p => !p)} style={{ border: 'none', padding: 0, background: 'transparent', cursor: 'pointer', color: isPreviewActive ? 'rgba(134,239,172,1)' : 'rgba(172,214,255,0.82)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, transition: 'color 200ms ease, transform 200ms ease', filter: isPreviewActive ? 'drop-shadow(0 0 6px rgba(134,239,172,0.4))' : 'none', transform: isPreviewActive ? 'scale(1.1)' : 'scale(1)' }}>
                    <G p={isPreviewActive ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" : "M3 8h18M3 12h18M3 16h18"} />
                  </button>
                </div>
              </div>
              <div style={TS}>Metin önizlemesi<span style={SS}>Gerçek konum yansıtılmaz</span></div>
              <div style={{ flex: 1, borderRadius: 14, background: 'linear-gradient(180deg,rgba(4,8,13,0.72),rgba(2,5,9,0.86))', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%,rgba(251,191,36,0.06),transparent 55%)', pointerEvents: 'none' }} />

                <div style={{ position: 'relative', textAlign: 'center', width: '82%' }}>
                  {anim === 'slide' ? (
                    <>
                      {/* Eski Metin */}
                      <div style={{
                        position: 'absolute', width: '100%', left: 0, bottom: 0,
                        padding: cur.bg_visible ? '18px 28px' : '0',
                        background: cur.bg_visible ? `linear-gradient(180deg, rgba(12,16,24,${Math.max(cur.alpha, 0.05)}), rgba(4,8,14,${Math.max(cur.alpha, 0.05)}))` : 'transparent',
                        borderRadius: 18,
                        backdropFilter: cur.bg_visible ? 'blur(16px)' : 'none',
                        transition: 'opacity 500ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                        opacity: isVisible ? 0 : 1,
                        transform: isVisible ? 'translate3d(0, -110%, 0)' : 'translate3d(0, 0, 0)',
                      }}>
                        <div style={{ fontSize: cur.font_size, fontFamily: cur.font_family, color: cur.font_color, fontWeight: cur.font_bold ? 800 : 500, textShadow: previewShadow, lineHeight: 1.35 }}>
                          Önceki çeviri satırı...
                        </div>
                      </div>
                      
                      {/* Yeni Metin */}
                      <div style={{
                        position: 'relative', width: '100%',
                        padding: cur.bg_visible ? '18px 28px' : '0',
                        background: cur.bg_visible ? `linear-gradient(180deg, rgba(12,16,24,${Math.max(cur.alpha, 0.05)}), rgba(4,8,14,${Math.max(cur.alpha, 0.05)}))` : 'transparent',
                        borderRadius: 18,
                        backdropFilter: cur.bg_visible ? 'blur(16px)' : 'none',
                        transition: 'opacity 500ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                        opacity: isVisible ? 1 : 0,
                        transform: isVisible ? 'translate3d(0, 0, 0)' : 'translate3d(0, 50%, 0)',
                      }}>
                        <div style={{ fontSize: cur.font_size, fontFamily: cur.font_family, color: cur.font_color, fontWeight: cur.font_bold ? 800 : 500, textShadow: previewShadow, lineHeight: 1.35 }}>
                          Yeni çeviri burada öne çıkar.
                        </div>
                        <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(159,183,207,0.35)', fontWeight: 600, letterSpacing: '0.08em' }}>
                          GEÇİŞ · {ANIMS.find(a => a.id === anim)?.label.toUpperCase()}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{
                      padding: cur.bg_visible ? '18px 28px' : '0',
                      background: cur.bg_visible ? `linear-gradient(180deg, rgba(12,16,24,${Math.max(cur.alpha, 0.05)}), rgba(4,8,14,${Math.max(cur.alpha, 0.05)}))` : 'transparent',
                      borderRadius: 18,
                      backdropFilter: cur.bg_visible ? 'blur(16px)' : 'none',
                      transition: anim === 'none' ? 'background 200ms, padding 200ms, backdrop-filter 200ms' : 'opacity 500ms ease, transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 500ms ease, background 200ms, padding 200ms, backdrop-filter 200ms',
                      opacity: isVisible || anim === 'none' ? 1 : 0,
                      transform: !isVisible && anim === 'slide' ? 'translate3d(0, 16px, 0)' : 'translate3d(0,0,0)',
                      filter: !isVisible && anim === 'blur' ? 'blur(6px)' : 'blur(0)'
                    }}>
                      <div style={{ fontSize: cur.font_size, fontFamily: cur.font_family, color: cur.font_color, fontWeight: cur.font_bold ? 800 : 500, textShadow: previewShadow, lineHeight: 1.35 }}>
                        Yeni çeviri burada öne çıkar.
                      </div>
                      <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(159,183,207,0.35)', fontWeight: 600, letterSpacing: '0.08em' }}>
                        GEÇİŞ · {ANIMS.find(a => a.id === anim)?.label.toUpperCase()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <Blk label="Özel Tasarımlar" icon="M4 6h16M4 12h16M4 18h7" hideTitle title={<div />}>
                <div
                  onWheel={(e) => {
                    if (isRenamingProfile) return;
                    e.preventDefault();
                    shiftProfile(e.deltaY > 0 ? 1 : -1);
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'stretch', userSelect: 'none', width: '100%', minHeight: '100%', overflow: 'hidden' }}
                >
                  {isRenamingProfile ? (
                    <input
                      ref={renameInputRef}
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameCommit();
                        if (e.key === 'Escape') setIsRenamingProfile(false);
                      }}
                      onBlur={handleRenameCommit}
                      maxLength={24}
                      style={{ width: '100%', background: 'rgba(5,9,14,0.6)', border: '1px solid rgba(125,211,252,0.4)', borderRadius: 4, color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '4px 8px', outline: 'none', boxShadow: '0 0 8px rgba(125,211,252,0.2)' }}
                    />
                  ) : (
                    <div style={{ width: '100%', display: 'grid', gridTemplateRows: '14px minmax(0, auto) 14px', alignItems: 'center', justifyItems: 'center', gap: 2, maxHeight: '100%' }}>
                      <button type="button" onClick={() => shiftProfile(-1)} style={{ border: 'none', background: 'transparent', color: 'rgba(159, 183, 207, 0.64)', cursor: 'pointer', padding: 0, height: 14, width: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease' }}>
                        <ShiftArrow direction="up" />
                      </button>
                      <div style={{ width: '100%' }} onDoubleClick={() => {
                        if (!activeProfile.isBase) {
                          setRenameVal(activeProfile.name);
                          setIsRenamingProfile(true);
                          setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 0);
                        }
                      }}>
                        <ValueRail size="mini"
                          previousValue={profiles[(activeProfileIndex - 1 + profiles.length) % profiles.length].name}
                          activeValue={activeProfile.name}
                          nextValue={profiles[(activeProfileIndex + 1) % profiles.length].name}
                        />
                      </div>
                      <button type="button" onClick={() => shiftProfile(1)} style={{ border: 'none', background: 'transparent', color: 'rgba(159, 183, 207, 0.64)', cursor: 'pointer', padding: 0, height: 14, width: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease' }}>
                        <ShiftArrow direction="down" />
                      </button>
                    </div>
                  )}
                </div>
              </Blk>

              <Blk label="Geçiş Efekti" icon="M5 12h14M12 5l7 7-7 7" hideTitle title={<div />}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 6, height: '100%', minHeight: 0 }}>
                  {ANIMS.map(a => (
                    <button key={a.id} type="button" onClick={() => updAnim(a.id as TextAnim)} title={a.label}
                      style={{
                        borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 0,
                        background: anim === a.id ? 'rgba(125,211,252,0.12)' : 'rgba(255,255,255,0.04)',
                        color: anim === a.id ? 'rgba(125,211,252,0.90)' : 'rgba(159,183,207,0.50)',
                        boxShadow: anim === a.id ? 'inset 0 0 0 1px rgba(125,211,252,0.28)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                        transition: 'background 160ms ease,color 160ms ease,box-shadow 160ms ease'
                      }}>
                      <G p={a.icon} />
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }}>{a.label.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              </Blk>
            </div>
          </div>
        </div>
      </div>
    </PanelStage>
  );
};
