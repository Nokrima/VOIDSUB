import React from 'react';

type SceneMode = 'floating' | 'striped';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'rgba(191, 215, 242, 0.72)',
  fontWeight: 700,
};

const infoTitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#9fb7cf',
  fontWeight: 500,
  lineHeight: 1.45,
  letterSpacing: '-0.01em',
};

const shellStyle: React.CSSProperties = {
  borderRadius: 18,
  background: 'rgba(5, 9, 14, 0.42)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
  minHeight: 0,
  overflow: 'hidden',
};

const LayerGlyph = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 18, height: 18 }}>
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function SceneModeBlock({
  sceneType,
  setSceneType,
  disabled = false,
}: {
  sceneType: SceneMode;
  setSceneType: (value: SceneMode) => void;
  disabled?: boolean;
}) {
  const isFloating = sceneType === 'floating';
  const sceneModeName = isFloating ? 'Saha Metni' : 'Altyazı Şeridi';
  const sceneModeBest = isFloating ? 'HUD ve sahne üstü yazılarda güçlü' : 'Sabit diyalog ve alt bantta güçlü';


  return (
    <div
      style={{
        ...shellStyle,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        opacity: !disabled ? 1 : 0.48,
        background: !disabled ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
        transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
      }}
    >
      <style>{`@keyframes conceptATextSwap{0%{opacity:0;transform:translate3d(0,8px,0);filter:blur(3px)}100%{opacity:1;transform:translate3d(0,0,0);filter:blur(0)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={labelStyle}>Sahne Tipi</div>
        <div style={{ color: 'rgba(172, 214, 255, 0.82)' }}>
          <LayerGlyph path="M4 7h16M4 12h16M4 17h10" />
        </div>
      </div>
      <div
        key={isFloating ? 'floating' : 'striped'}
        style={{ ...infoTitleStyle, marginTop: 8, animation: 'conceptATextSwap 200ms ease both' }}
      >
        {sceneModeName}
        <span style={{ display: 'block', marginTop: 3, fontSize: 11, fontWeight: 400, color: 'rgba(159,183,207,0.48)', lineHeight: 1.45 }}>
          {sceneModeBest}
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          color: 'rgba(216, 231, 248, 0.82)',
          flex: 1,
        }}
      >
        <div
          style={{
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 36px',
              alignItems: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            <button
              type="button"
              onClick={() => setSceneType('floating')}
              aria-pressed={isFloating}
              aria-label="Saha Metni"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                width: 36,
                height: 36,
                color: isFloating ? '#7dd3fc' : 'rgba(159, 183, 207, 0.56)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 180ms ease',
              }}
            >
              <LayerGlyph path="M6 6.5h12M6 10.5h9M6 14.5h12M6 18.5h7" />
            </button>
            <button
              type="button"
              onClick={() => setSceneType(isFloating ? 'striped' : 'floating')}
              aria-label="Sahne tipini değiştir"
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
                  left: isFloating ? 2 : 'calc(50%)',
                  width: 'calc(50% - 2px)',
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, rgba(125,211,252,0.28), rgba(125,211,252,0.14))',
                  transition: 'left 220ms ease',
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => setSceneType('striped')}
              aria-pressed={!isFloating}
              aria-label="Altyazı Şeridi"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                width: 36,
                height: 36,
                color: isFloating ? 'rgba(159, 183, 207, 0.56)' : '#7dd3fc',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 180ms ease',
              }}
            >
              <LayerGlyph path="M4 8h16M4 12h16M4 16h16" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
