import { type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, useMemo, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Sidebar, type PageType } from './components/sidebar';
import { WorkspacePanel } from './panels/WorkspacePanel';
import { OverlayPanel } from './panels/OverlayPanel';
import { EnginesPanel } from './panels/EnginesPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import Onboarding from './components/Onboarding';
import StartupIntro from './components/intro/StartupIntro';
import { usePanelTransition } from './usePanelTransition';
import { AppProvider, useAppContext } from './context/AppContext';
import { Toaster } from './components/Toaster';
import { FORCE_ONBOARDING_TEST, FORCE_PROFILE_INTRO_LOOP, FORCE_PROFILE_INTRO_TEST } from './config/debugFlags';

const appWindow = getCurrentWindow();
const TOOLBAR_META_EXPANDED_WIDTH = 102;

function ToolbarGlyph({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 14, height: 14 }}>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppShell() {
  const {
    activePage,
    setActivePage,
    settings,
    forceOnboardingBypassed,
    setForceOnboardingBypassed,
    setShowStartupIntro,
    userProfile,
    runtimeEngine,
    notices,
    dismissNotice,
    startupProfileLines,
    shouldRenderStartupIntro,
    hasCustomizedSettings,
  } = useAppContext();
  const [profileIntroLoopKey, setProfileIntroLoopKey] = useState(0);
  const [toolbarMetaOpen, setToolbarMetaOpen] = useState<Record<string, boolean>>({});
  const [conceptATab, setConceptATab] = useState<'workspace' | 'calibration'>('workspace');
  const { displayPanel, phase } = usePanelTransition(activePage);
  const activeDisplayPanel = displayPanel as PageType;
  const showConceptTabs = activeDisplayPanel === 'canvasA';
  const compactMeta = useMemo(() => {
    const performanceLabels: Record<string, string> = {
      economy: 'Ekonomi',
      standard: 'Standart',
      performance: 'Performans',
      maximum: 'Maksimum',
    };
    const serviceLabels: Record<string, string> = {
      auto: 'Auto',
      google: 'Google',
      offline: 'Offline',
    };
    const engineLabels: Record<string, string> = {
      easy: 'EasyOCR',
      winonly: 'WinOCR',
    };
    const languageLabels: Record<string, string> = {
      auto: 'AUTO',
      en: 'EN',
      tr: 'TR',
    };

    const src = languageLabels[settings?.src_language ?? 'auto'] ?? String(settings?.src_language ?? 'AUTO').toUpperCase();
    const tgt = languageLabels[settings?.tgt_language ?? 'tr'] ?? String(settings?.tgt_language ?? 'TR').toUpperCase();
    const engineKey = runtimeEngine ?? settings?.ocr_engine ?? 'easy';
    const serviceKey = settings?.translation_engine ?? 'auto';
    const performanceKey = settings?.performance_tier ?? 'standard';

    return [
      {
        key: 'lang',
        title: 'Dil',
        value: `${src} → ${tgt}`,
        accent: 'rgba(125, 211, 252, 0.9)',
        path: 'M4 6.5h7M4 12h9M4 17.5h6M15 6.5h5M17.5 4v5M15 17.5h5',
      },
      {
        key: 'svc',
        title: 'Servis',
        value: serviceLabels[serviceKey] ?? String(serviceKey),
        accent: serviceKey === 'offline' ? 'rgba(167, 139, 250, 0.92)' : 'rgba(134, 239, 172, 0.92)',
        path: 'M5 7.5h14M7 12h10M9 16.5h6',
      },
      {
        key: 'eng',
        title: 'Motor',
        value: engineLabels[engineKey] ?? String(engineKey),
        accent: 'rgba(96, 165, 250, 0.92)',
        path: 'M10 3h4l1 2 2 1 2-1 2 4-1 2 1 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 1-2-1-2 2-4 2 1 2-1 1-2Z',
      },
      {
        key: 'perf',
        title: 'Performans',
        value: performanceLabels[performanceKey] ?? String(performanceKey),
        accent: performanceKey === 'maximum' ? 'rgba(251, 146, 60, 0.92)' : 'rgba(125, 211, 252, 0.9)',
        path: 'M5 17V9m5 8V5m5 12v-6m4 6V7',
      },
    ];
  }, [runtimeEngine, settings?.ocr_engine, settings?.performance_tier, settings?.src_language, settings?.tgt_language, settings?.translation_engine]);

  const renderPanel = useMemo(
    () =>
      ({
        canvasA: <WorkspacePanel activeTab={conceptATab} />,
        canvasB: <OverlayPanel />,
        canvasC: <EnginesPanel />,
        canvasSettings: <SettingsPanel />,
      }) as Record<PageType, ReactNode>,
    [conceptATab],
  );

  const getPanelStyle = (_page: PageType): CSSProperties => {
    return {
      width: '100%',
      height: '100%',
      transition: 'opacity 120ms ease',
      opacity: phase === 'out' ? 0 : 1,
      willChange: 'opacity',
    };
  };

  const handleToolbarPointerDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-window-drag="true"]',
      )
    ) {
      return;
    }
    appWindow.startDragging().catch(() => undefined);
  };

  const startupIntroMode = hasCustomizedSettings ? 'profileMode' : 'defaultMode';
  if (!settings && !(FORCE_ONBOARDING_TEST && !forceOnboardingBypassed)) return <StartupIntro mode="defaultMode" hold minimal onComplete={() => undefined} />;
  if (FORCE_PROFILE_INTRO_TEST) {
    return <StartupIntro key={profileIntroLoopKey} mode="profileMode" profileName={userProfile?.display_name ?? null} avatarDataUrl={userProfile?.avatar_data_url ?? null} profileLines={startupProfileLines} onComplete={() => { if (FORCE_PROFILE_INTRO_LOOP) setProfileIntroLoopKey((current) => current + 1); }} />;
  }
  if ((FORCE_ONBOARDING_TEST && !forceOnboardingBypassed) || !settings?.onboarding_completed) {
    return <Onboarding onComplete={() => { setForceOnboardingBypassed(true); setActivePage('canvasA'); }} />;
  }
  if (shouldRenderStartupIntro) {
    return <StartupIntro mode={startupIntroMode} profileName={userProfile?.display_name ?? null} avatarDataUrl={userProfile?.avatar_data_url ?? null} profileLines={startupProfileLines} onComplete={() => setShowStartupIntro(false)} />;
  }

  return (
    <div className="app-shell font-sans">
      <div className="app-scale-frame">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />
        <div className="app-main transition-colors duration-300">
          <div className="glass-panel relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-none">
            <div
              className="app-toolbar w-full shrink-0 gap-3 justify-start"
              onMouseLeave={() => setToolbarMetaOpen({})}
              onClick={() => setToolbarMetaOpen({})}
              onMouseDown={handleToolbarPointerDown}
              style={{
                position: 'absolute',
                inset: '0 0 auto 0',
                zIndex: 10,
                background: 'rgba(10, 14, 22, 0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottomColor: 'rgba(255, 255, 255, 0.05)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
              }}
            >
              <div className="relative z-[1] flex min-w-0 flex-1 items-center gap-3">
                <div
                  style={{
                    width: 'min(432px, calc(50% - 184px))',
                    minWidth: '236px',
                    padding: '0 10px 0 4px',
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    gap: '8px',
                    overflow: 'hidden',
                    flex: '0 0 auto',
                  }}
                >
                  {compactMeta.map((item, index) => (
                    <div
                      key={item.key}
                      title={`${item.title}: ${item.value}`}
                      aria-label={`${item.title}: ${item.value}`}
                      onMouseEnter={() => setToolbarMetaOpen((current) => ({ ...current, [item.key]: true }))}
                      style={{
                        width: toolbarMetaOpen[item.key] ? `${TOOLBAR_META_EXPANDED_WIDTH}px` : '30px',
                        height: '30px',
                        borderRadius: '999px',
                        color: toolbarMetaOpen[item.key] ? '#ffffff' : 'rgba(255, 255, 255, 0.65)',
                        background: toolbarMetaOpen[item.key] ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: toolbarMetaOpen[item.key] 
                          ? '1px solid rgba(255, 255, 255, 0.1)' 
                          : '1px solid transparent',
                        boxShadow: toolbarMetaOpen[item.key]
                          ? '0 4px 12px rgba(0,0,0,0.2)'
                          : 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        position: 'relative',
                        overflow: 'hidden',
                        flex: '0 0 auto',
                        opacity: activeDisplayPanel !== 'canvasA' ? 1 : 0,
                        transform: activeDisplayPanel !== 'canvasA' ? 'translateY(0) scale(1)' : 'translateY(-2px) scale(0.965)',
                        filter: activeDisplayPanel !== 'canvasA' ? 'blur(0px)' : 'blur(2.5px) saturate(0.86)',
                        clipPath: activeDisplayPanel !== 'canvasA'
                          ? 'inset(0% 0% 0% 0% round 999px)'
                          : 'inset(22% 12% 22% 12% round 999px)',
                        transition: `width 240ms cubic-bezier(.22,1,.36,1), opacity 180ms ease ${index * 45}ms, filter 220ms ease ${index * 45}ms, transform 240ms cubic-bezier(.22,1,.36,1) ${index * 45}ms, clip-path 240ms cubic-bezier(.22,1,.36,1) ${index * 45}ms, color 180ms ease ${index * 45}ms, background 180ms ease ${index * 45}ms, box-shadow 180ms ease ${index * 45}ms`,
                        willChange: 'opacity, transform, filter, clip-path, width',
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flex: '0 0 30px',
                          color: toolbarMetaOpen[item.key] ? item.accent : 'rgba(255, 255, 255, 0.6)',
                          filter: toolbarMetaOpen[item.key] 
                            ? `drop-shadow(0 0 8px ${item.accent.replace('0.9', '0.4').replace('0.92', '0.4')})`
                            : 'none',
                        }}
                      >
                        <ToolbarGlyph path={item.path} />
                      </div>
                      <span
                        style={{
                          paddingRight: 10,
                          color: '#ffffff',
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'clip',
                          opacity: toolbarMetaOpen[item.key] ? 1 : 0,
                          transform: toolbarMetaOpen[item.key] ? 'translateX(0) scale(1)' : 'translateX(-6px) scale(0.985)',
                          filter: toolbarMetaOpen[item.key] ? 'blur(0px)' : 'blur(2px) saturate(0.9)',
                          clipPath: toolbarMetaOpen[item.key]
                            ? 'inset(0% 0% 0% 0%)'
                            : 'inset(18% 100% 18% 0%)',
                          transition: 'opacity 180ms ease, filter 220ms ease, transform 240ms cubic-bezier(.22,1,.36,1), clip-path 240ms cubic-bezier(.22,1,.36,1)',
                          willChange: 'opacity, transform, filter, clip-path',
                        }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute left-1/2 z-[2] flex min-w-0 -translate-x-1/2 items-center justify-center" style={{ overflow: 'visible' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: !showConceptTabs ? 'translateX(-50%) translateY(-50%) scale(1)' : 'translateX(-50%) translateY(-52%) scale(0.965)',
                      opacity: !showConceptTabs ? 1 : 0,
                      filter: !showConceptTabs ? 'blur(0px)' : 'blur(2.5px) saturate(0.86)',
                      clipPath: !showConceptTabs
                        ? 'inset(0% 0% 0% 0% round 999px)'
                        : 'inset(22% 12% 22% 12% round 999px)',
                      transition:
                        'opacity 180ms ease, filter 220ms ease, transform 240ms cubic-bezier(.22,1,.36,1), clip-path 240ms cubic-bezier(.22,1,.36,1)',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      willChange: 'opacity, transform, filter, clip-path',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <span
                      style={{
                        paddingLeft: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.28em',
                        color: '#afc7ea',
                        opacity: 0.85,
                      }}
                    >
                      Virel
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.22em',
                        color: 'rgba(255,255,255,0.44)',
                      }}
                    >
                      Desktop Core
                    </span>
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-grid',
                      gridTemplateColumns: '1fr 1fr',
                      alignItems: 'center',
                      minWidth: '280px',
                      borderRadius: '999px',
                      background: 'linear-gradient(180deg, rgba(4, 8, 14, 0.82), rgba(8, 12, 18, 0.76))',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.34), inset 0 -1px 0 rgba(255,255,255,0.03)',
                      padding: '4px',
                      opacity: showConceptTabs ? 1 : 0,
                      transform: showConceptTabs ? 'translateY(0) scale(1)' : 'translateY(-2px) scale(0.965)',
                      filter: showConceptTabs ? 'blur(0px)' : 'blur(2.5px) saturate(0.86)',
                      clipPath: 'inset(0% 0% 0% 0% round 999px)',
                      transition:
                        'opacity 180ms ease, filter 220ms ease, transform 240ms cubic-bezier(.22,1,.36,1), clip-path 240ms cubic-bezier(.22,1,.36,1)',
                      pointerEvents: showConceptTabs ? 'auto' : 'none',
                      overflow: 'hidden',
                      willChange: 'opacity, transform, filter, clip-path',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '4px',
                        bottom: '4px',
                        left: conceptATab === 'calibration' ? 'calc(50% + 2px)' : '4px',
                        width: 'calc(50% - 6px)',
                        borderRadius: '999px',
                        background: 'linear-gradient(180deg, rgba(119, 205, 255, 0.14), rgba(119, 205, 255, 0.09))',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(119, 205, 255, 0.06)',
                        transition: 'left 220ms cubic-bezier(.2,.8,.2,1)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setConceptATab('workspace')}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        borderRadius: '999px',
                        border: 'none',
                        padding: '7px 12px',
                        background: 'transparent',
                        color: conceptATab === 'calibration' ? 'rgba(214, 231, 248, 0.66)' : '#ecf7ff',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Çalışma Alanı
                    </button>
                    <button
                      type="button"
                      onClick={() => setConceptATab('calibration')}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        borderRadius: '999px',
                        border: 'none',
                        padding: '7px 12px',
                        background: 'transparent',
                        color: conceptATab === 'calibration' ? '#ecf7ff' : 'rgba(214, 231, 248, 0.66)',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Kalibrasyon
                    </button>
                  </div>
                </div>
                <div style={{ flex: '1 1 auto', minWidth: 0 }} />
              </div>
              <div
                className="app-toolbar-controls"
                style={{
                  position: 'relative',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: '0',
                  paddingRight: '0',
                  alignSelf: 'stretch',
                }}
              >
                <button
                  className="window-chrome-button window-chrome-minimize"
                  type="button"
                  onClick={() => appWindow.minimize().catch(() => undefined)}
                  title="Küçült"
                >
                  <span className="window-chrome-glyph">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect y="4.5" width="10" height="1" fill="currentColor" />
                    </svg>
                  </span>
                </button>
                <button
                  className="window-chrome-button window-chrome-close"
                  type="button"
                  onClick={() => appWindow.close().catch(() => undefined)}
                  title="Kapat"
                >
                  <span className="window-chrome-glyph">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </button>
              </div>
            </div>
            
            {/* Yeni Modern Toaster Modülü */}
            {notices.length > 0 && <Toaster notices={notices} dismissNotice={dismissNotice} />}

            <div
              className="relative min-h-0 flex-1 w-full overflow-hidden"
              style={{
                marginTop: 0,
                marginLeft: -1,
                marginRight: -1,
                width: 'calc(100% + 2px)',
              }}
            >
              {(Object.keys(renderPanel) as PageType[]).map((page) => {
                const isVisible = page === activeDisplayPanel;
                return <div key={page} style={{ ...getPanelStyle(page), position: 'absolute', inset: 0, pointerEvents: isVisible ? 'auto' : 'none', visibility: isVisible ? 'visible' : 'hidden', zIndex: isVisible ? 1 : 0 }}>{renderPanel[page]}</div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

