import React, { useState, useEffect } from 'react';
import { PanelStage } from './PanelStage';
import { LogPanel } from './LogPanel';
import { getEventHistory, onEvent, send, useWebSocket } from '../bridge/websocket';
import { useAppContext } from '../context/AppContext';
import { validateShortcutKey, suspendHotkeys, resumeHotkeys, syncHotkeysToRust, type ShortcutAction } from '../hooks/useShortcutManager';

const colors = {
  bgGlass: 'rgba(255,255,255,0.015)',
  borderGlass: '1px solid rgba(255,255,255,0.05)',
  accent: 'rgba(125,211,252,0.9)',
  textPrimary: '#fff',
  textMuted: 'rgba(159,183,207,0.55)'
};

const TS = {
  boxTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(191,215,242,0.72)' }
};

const G = ({ p, stroke = colors.accent }: { p: string; stroke?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" style={{ width: 16, height: 16 }}>
    <path d={p} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsRow = ({ label, active, onChange }: { label: string, active: boolean, onChange: (v: boolean) => void }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onChange(!active)}
      style={{ 
        display: 'flex', alignItems: 'center', padding: '6px 8px', 
        cursor: 'pointer', transition: 'all 0.2s ease',
        background: 'transparent',
        borderRadius: 8,
        margin: '0 -4px'
      }}
    >
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: hovered ? '#fff' : 'rgba(255,255,255,0.6)', transition: 'color 0.2s ease' }}>
        {label}
      </span>
      <button
        type="button"
        style={{
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          position: 'relative',
          width: 44,
          height: 24,
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(7,11,17,0.88), rgba(4,8,13,0.94))',
          boxShadow: hovered 
            ? 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.05)'
            : 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.02)',
          overflow: 'hidden',
          pointerEvents: 'none', // parent onClick handles the toggle
          transition: 'box-shadow 0.2s ease'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: active ? 'calc(100% - 22px)' : 2,
            width: 20,
            borderRadius: 999,
            background: active 
              ? (hovered ? 'linear-gradient(180deg, rgba(125,211,252,0.68), rgba(125,211,252,0.24))' : 'linear-gradient(180deg, rgba(125,211,252,0.48), rgba(125,211,252,0.14))')
              : (hovered ? 'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12))' : 'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))'),
            boxShadow: active 
              ? (hovered ? 'inset 0 1px 0 rgba(255,255,255,0.38), 0 0 16px rgba(125,211,252,0.38)' : 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 12px rgba(125,211,252,0.18)')
              : (hovered ? 'inset 0 1px 0 rgba(255,255,255,0.15)' : 'inset 0 1px 0 rgba(255,255,255,0.08)'),
            transition: 'left 220ms ease, background 180ms ease, box-shadow 180ms ease',
          }}
        />
      </button>
    </div>
  );
};



const ShortcutRow = ({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) => {
  const [hovered, setHovered] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [testState, setTestState] = React.useState<'idle' | 'pending' | 'success'>('idle');

  React.useEffect(() => {
    if (editing) {
      document.body.dataset.shortcutEditing = 'true';
      suspendHotkeys();
    } else {
      delete document.body.dataset.shortcutEditing;
      resumeHotkeys();
    }
    return () => {
      delete document.body.dataset.shortcutEditing;
      resumeHotkeys();
    };
  }, [editing]);

  // Fare tÃ„Â±klamasÃ„Â±yla dÃƒÂ¼zenlemeyi iptal etme
  React.useEffect(() => {
    if (!editing) return;
    const handleMouseDown = () => {
      setEditing(false);
    };
    // TÃ„Â±klamayÃ„Â± hemen yakalamamasÃ„Â± iÃƒÂ§in kÃƒÂ¼ÃƒÂ§ÃƒÂ¼k bir gecikme
    const timer = setTimeout(() => window.addEventListener('mousedown', handleMouseDown), 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [editing]);

  // Klavye olaylarÃ„Â±
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editing) {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
          setEditing(false);
          return;
        }

        let keyText = '';
        if (e.ctrlKey) keyText += 'Ctrl+';
        if (e.shiftKey) keyText += 'Shift+';
        if (e.altKey) keyText += 'Alt+';
        
        const keyName = e.key;
        if (keyName !== 'Control' && keyName !== 'Shift' && keyName !== 'Alt' && keyName !== 'Meta') {
          keyText += keyName.toUpperCase();
          
          onChange(keyText);
          setTestState('success');
          setEditing(false);
          setTimeout(() => setTestState('idle'), 2000);
        }
      } else {
        // Test kontrolÃƒÂ¼
        let keyText = '';
        if (e.ctrlKey) keyText += 'Ctrl+';
        if (e.shiftKey) keyText += 'Shift+';
        if (e.altKey) keyText += 'Alt+';
        const keyName = e.key;
        if (keyName !== 'Control' && keyName !== 'Shift' && keyName !== 'Alt' && keyName !== 'Meta') {
          keyText += keyName.toUpperCase();
          if (keyText === value.toUpperCase()) {
            setTestState('success');
            setTimeout(() => setTestState('idle'), 1500);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing, value, onChange]);

  // Duruma gÃƒÂ¶re stil
  const renderKeys = () => {
    if (editing) {
      return (
        <div style={{
          background: 'rgba(125,211,252,0.15)',
          border: '1px solid rgba(125,211,252,0.4)',
          boxShadow: '0 0 12px rgba(125,211,252,0.2)',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 10, fontWeight: 700, color: '#7dd3fc',
          animation: 'conceptBlink 1s infinite',
          letterSpacing: '0.05em'
        }}>
          YENİ TUŞ BEKLENİYOR
        </div>
      );
    }

    if (!value || typeof value !== 'string') {
      return <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Tuş atanmadı</div>;
    }

    const parts = value.split('+');
    let glowColor = 'transparent';
    if (testState === 'success') glowColor = 'rgba(52, 211, 153, 0.4)';
    else if (testState === 'pending') glowColor = 'rgba(251, 191, 36, 0.4)';

    let borderColor = 'rgba(255,255,255,0.1)';
    if (testState === 'success') borderColor = 'rgba(52, 211, 153, 0.6)';
    else if (testState === 'pending') borderColor = 'rgba(251, 191, 36, 0.6)';

    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {parts.map((p, i) => (
          <kbd key={i} style={{
            background: hovered ? 'rgba(30,35,40,0.8)' : 'rgba(15,18,22,0.8)',
            border: `1px solid ${borderColor}`,
            borderBottom: testState === 'idle' ? '2px solid rgba(0,0,0,0.6)' : `2px solid ${borderColor}`,
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 10,
            fontWeight: 700,
            color: testState === 'success' ? '#34d399' : testState === 'pending' ? '#fbbf24' : '#fff',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 10px ${glowColor}`,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            fontFamily: '"SF Pro Display", -apple-system, sans-serif',
            letterSpacing: '0.05em',
            display: 'inline-block',
            minWidth: 20,
            textAlign: 'center',
            transform: (hovered && testState === 'idle') ? 'translateY(-1px)' : 'none'
          }}>
            {p}
          </kbd>
        ))}
      </div>
    );
  };

  return (
    <div 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ 
        display: 'flex', alignItems: 'center', padding: '8px 10px', 
        background: 'transparent',
        borderRadius: 10, margin: '0 -4px', transition: 'background 0.2s ease',
        cursor: 'pointer'
      }}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ 
          width: 28, height: 28, borderRadius: 8, 
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: hovered ? '#7dd3fc' : 'rgba(255,255,255,0.4)', transition: 'color 0.2s ease'
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: hovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)', transition: 'color 0.2s ease' }}>
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 100 }}>
        {renderKeys()}
      </div>
    </div>
  );
};

import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

const VersionStatusBlock = () => {
  const { send, isConnected } = useWebSocket();
  const { notify } = useAppContext();
  const [checking, setChecking] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [updateInfo, setUpdateInfo] = React.useState<any>(null);
  const [hovered, setHovered] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState('...');

  React.useEffect(() => {
    getVersion().then(v => setAppVersion(`v${v}`)).catch(() => setAppVersion('v2.0.0'));
    const offErr = onEvent('update_error', (data: any) => {
      setChecking(false);
      setDownloading(false);
      notify('error', data.msg || 'Güncelleme hatası.', 'update_system');
    });
    
    const offAvail = onEvent('update_available', (data: any) => {
      setChecking(false);
      setUpdateInfo(data);
      notify('info', `Yeni sürüm (${data.version}) bulundu.`, 'update_system');
    });

    const offNotAvail = onEvent('update_not_available', () => {
      setChecking(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    });

    const offProg = onEvent('update_progress', (data: any) => {
      setProgress(data.percent || 0);
    });

    const offComp = onEvent('update_complete', () => {
      setDownloading(false);
      setProgress(100);
      notify('success', 'Güncelleme indi, yükleyici başlatılıyor...', 'update_system');
      setTimeout(() => setProgress(0), 3000);
    });

    return () => { offErr(); offAvail(); offNotAvail(); offProg(); offComp(); };
  }, [notify]);

  const handleCheck = () => {
    if (!isConnected) return;
    if (updateInfo) {
      setDownloading(true);
      setProgress(0);
      send('download_update', { url: updateInfo.url, digest: updateInfo.digest, checksum_url: updateInfo.checksum_url });
      setUpdateInfo(null);
      return;
    }
    setChecking(true);
    setSuccess(false);
    invoke('check_for_updates').catch((e: any) => {
      setChecking(false);
      notify('error', e?.toString() || 'Güncelleme kontrolü başlatılamadı.', 'update_system');
    });
  };

  let btnText = 'DENETLE';
  if (checking) btnText = 'DENETLENİYOR';
  else if (downloading) btnText = `%${progress} İNİYOR`;
  else if (updateInfo) btnText = 'GÜNCELLE';
  else if (success) btnText = 'GÜNCEL';

  let statusText = 'Sistem Güncel';
  if (checking) statusText = 'Denetleniyor...';
  else if (downloading) statusText = 'İndiriliyor...';
  else if (updateInfo) statusText = 'Yeni Sürüm Var!';
  
  let statusColor = 'rgba(159,183,207,0.7)';
  if (success) statusColor = '#34d399';
  else if (checking || downloading) statusColor = '#fbbf24';
  else if (updateInfo) statusColor = '#60a5fa';

  let dotColor = '#34d399';
  if (checking || downloading) dotColor = '#fbbf24';
  else if (updateInfo) dotColor = '#60a5fa';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px' }}>
      <style>{`@keyframes conceptSpin { 100% { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: updateInfo ? 'linear-gradient(135deg, rgba(96,165,250,0.2), rgba(96,165,250,0.05))' : 'linear-gradient(135deg, rgba(125,211,252,0.15), rgba(125,211,252,0.02))',
          border: updateInfo ? '1px solid rgba(96,165,250,0.4)' : '1px solid rgba(125,211,252,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: updateInfo ? '#60a5fa' : '#7dd3fc',
          boxShadow: updateInfo ? 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 16px rgba(96,165,250,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 16px rgba(125,211,252,0.1)',
          transition: 'all 0.3s ease'
        }}>
          {updateInfo ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, animation: 'conceptBlink 2s infinite' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>Virel V2</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ 
              width: 6, height: 6, borderRadius: 3, 
              background: dotColor, 
              boxShadow: `0 0 8px ${dotColor}99`, 
              transition: 'all 0.3s ease' 
            }} />
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 500, transition: 'color 0.3s ease' }}>
              {appVersion} • {statusText}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={handleCheck}
        disabled={!isConnected || checking || success || downloading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height: 32,
          padding: '0 16px',
          borderRadius: 16,
          background: success ? 'rgba(52, 211, 153, 0.1)' : updateInfo ? 'rgba(96,165,250,0.15)' : (checking || downloading) ? 'rgba(125,211,252,0.1)' : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          border: success ? '1px solid rgba(52, 211, 153, 0.4)' : updateInfo ? '1px solid rgba(96,165,250,0.5)' : (checking || downloading) ? '1px solid rgba(125,211,252,0.4)' : hovered ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.08)',
          color: success ? '#34d399' : updateInfo ? '#60a5fa' : (checking || downloading) ? '#7dd3fc' : hovered ? '#fff' : 'rgba(255,255,255,0.8)',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: (!isConnected || checking || success || downloading) ? 'default' : 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: success ? '0 0 12px rgba(52, 211, 153, 0.2)' : updateInfo ? '0 0 16px rgba(96,165,250,0.3)' : (checking || downloading) ? '0 0 12px rgba(125,211,252,0.2)' : 'none',
          outline: 'none',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {downloading && (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress}%`, background: 'rgba(125,211,252,0.15)', transition: 'width 0.3s linear' }} />
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg 
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" 
            style={{
              animation: (checking || downloading) ? 'conceptSpin 1s linear infinite' : 'none',
              transform: (!(checking || downloading) && hovered && !success && !updateInfo) ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.4s ease'
            }}
          >
            {success ? (
              <polyline points="20 6 9 17 4 12"></polyline>
            ) : updateInfo ? (
              <>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </>
            ) : downloading ? (
              <>
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
              </>
            ) : (
              <>
                <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              </>
            )}
          </svg>
          {btnText}
        </div>
      </button>
    </div>
  );
};

export const SettingsPanel: React.FC = () => {
  const { isConnected } = useWebSocket();
  const getAppSet = () => {
    const history = getEventHistory('app_settings_loaded') || [];
    return history.length > 0 ? history[history.length - 1] : {};
  };

  const [settings, setSettings] = useState<any>(getAppSet());

  useEffect(() => {
    if (isConnected) send('get_settings');
    const off = onEvent('app_settings_loaded', (data) => setSettings(data));
    return () => off();
  }, [isConnected]);

  const updateSetting = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
    send('save_settings', { [key]: value });
  };

  const startOnLogin = settings.start_on_login ?? false;
  const minimizeToTray = settings.minimize_to_tray ?? true;
  const restoreWindowAfterRegionSelection = settings.restore_window_after_region_selection ?? true;
  const overlaySnapToRegion = settings.overlay_snap_to_region ?? true;

  const shortcuts = settings.shortcuts ?? {
    start_stop: 'F8',
    select_region: 'F9',
    temporary_region: 'F10',
    hide_overlay: 'F11'
  };

  const { notify } = useAppContext();

  const updateShortcut = async (key: string, value: string) => {
    // Validasyon: çakışma + sistem tuşu + boş tuş kontrolü
    const validation = validateShortcutKey(value, key as ShortcutAction, shortcuts);
    if (!validation.valid) {
      notify('warning', validation.error!, `shortcut:conflict:${value}`);
      return;
    }
    
    const newShortcuts = { ...shortcuts, [key]: value };
    // Local state'i hemen güncelle
    setSettings((prev: any) => ({ ...prev, shortcuts: newShortcuts }));
    // Backend'e kaydet
    send('save_settings', { shortcuts: newShortcuts, _skip_emit: true });
    // Rust'a güncel kısayolları gönder (thread-safe channel üzerinden)
    await syncHotkeysToRust(newShortcuts);
  };

  return (
    <PanelStage css={`
      .settings-bg-grid {
        position: absolute;
        inset: 0;
        background-image: 
          linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: radial-gradient(circle at 50% 50%, black 20%, transparent 80%);
        -webkit-mask-image: radial-gradient(circle at 50% 50%, black 20%, transparent 80%);
      }
      .settings-dial {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 1px dashed rgba(125, 211, 252, 0.15);
        animation: concept-settings-dial-spin 60s linear infinite;
        pointer-events: none;
      }
      .settings-dial-inner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 1px solid rgba(125, 211, 252, 0.05);
        border-top: 1px solid rgba(125, 211, 252, 0.3);
        animation: concept-settings-dial-spin-reverse 40s linear infinite;
        pointer-events: none;
      }
      @keyframes concept-settings-dial-spin {
        from { transform: translate3d(-50%, -50%, 0) rotate(0deg); }
        to { transform: translate3d(-50%, -50%, 0) rotate(360deg); }
      }
      @keyframes concept-settings-dial-spin-reverse {
        from { transform: translate3d(-50%, -50%, 0) rotate(360deg); }
        to { transform: translate3d(-50%, -50%, 0) rotate(0deg); }
      }
      .settings-core-glow {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 50% 50%, rgba(125, 211, 252, 0.03) 0%, transparent 70%);
        pointer-events: none;
      }
    `} layers={[
      { inset: 0, background: 'linear-gradient(180deg, rgba(7, 10, 15, 0.98), rgba(4, 6, 9, 1))' },
      { inset: 0, background: 'radial-gradient(circle at 80% -20%, rgba(125, 211, 252, 0.04), transparent 50%), radial-gradient(circle at -20% 120%, rgba(167, 139, 250, 0.03), transparent 50%)' }
    ]}>
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(4px)', pointerEvents: 'none', opacity: 0.85 }}>
        <div className="settings-bg-grid" />
        <div className="settings-dial" style={{ width: 600, height: 600 }} />
        <div className="settings-dial" style={{ width: 800, height: 800, opacity: 0.5, animationDuration: '90s' }} />
        <div className="settings-dial-inner" style={{ width: 450, height: 450 }} />
        <div className="settings-dial-inner" style={{ width: 300, height: 300, borderTopColor: 'rgba(167, 139, 250, 0.3)', animationDuration: '25s' }} />
      </div>
      
      <div className="settings-core-glow" />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', padding: '62px 34px 32px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700, color: 'rgba(125,211,252,0.55)', margin: 0 }}>AYARLAR</h1>
          <div style={{ fontSize: 13, fontWeight: 400, color: 'rgba(159,183,207,0.55)', marginTop: 4 }}>
            Tercihlerinizi yapılandırın ve uygulama davranışını özelleştirin.
          </div>
        </div>

        {/* SKELETON LAYOUT */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, flex: 1, marginTop: 24, minHeight: 0 }}>
          
          {/* SOL KOLON (ORANTILI DAGILIM) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
            <div className="log-panel-scroll" style={{ background: colors.bgGlass, border: colors.borderGlass, borderRadius: 20, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 36, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable' as const }}>
              
              {/* UYGULAMA DAVRANISI */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...TS.boxTitle }}>
                  <G p="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" stroke="rgba(191,215,242,0.72)" />
                  <span>UYGULAMA DAVRANISI</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <SettingsRow label="Sistem başlatıldığında arka planda çalış" active={startOnLogin} onChange={(v) => updateSetting('start_on_login', v)} />
                  <SettingsRow label="Pencereyi kapatınca tepsiye küçült" active={minimizeToTray} onChange={(v) => updateSetting('minimize_to_tray', v)} />
                  <SettingsRow label="Tarama seçiminden sonra pencereyi öne getir" active={restoreWindowAfterRegionSelection} onChange={(v) => updateSetting('restore_window_after_region_selection', v)} />
                  <SettingsRow label="Katmanı tarama alanına hizala" active={overlaySnapToRegion} onChange={(v) => updateSetting('overlay_snap_to_region', v)} />
                </div>

              </div>



              {/* KISAYOLLAR */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...TS.boxTitle }}>
                  <G p="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 10h.01M11 10h.01M15 10h.01M7 14h10" stroke="rgba(191,215,242,0.72)" />
                  <span>KISAYOLLAR</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <ShortcutRow label="Çeviriyi Başlat / Durdur" value={shortcuts.start_stop} onChange={(v) => updateShortcut('start_stop', v)} />
                  <ShortcutRow label="Çeviri Bölgesi Seç" value={shortcuts.select_region} onChange={(v) => updateShortcut('select_region', v)} />
                  <ShortcutRow label="Geçici Alan Seçimi" value={shortcuts.temporary_region} onChange={(v) => updateShortcut('temporary_region', v)} />
                  <ShortcutRow label="Katmanı Gizle / Göster" value={shortcuts.hide_overlay} onChange={(v) => updateShortcut('hide_overlay', v)} />
                </div>
              </div>

              {/* SÜRÜM DURUMU */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...TS.boxTitle }}>
                  <G p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" stroke="rgba(191,215,242,0.72)" />
                  <span>SÜRÜM DURUMU</span>
                </div>
                <VersionStatusBlock />
              </div>

            </div>
          </div>

          {/* SAG KOLON (TERMINAL) */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <LogPanel embedded />
          </div>
        </div>
      </div>
    </PanelStage>
  );
};


