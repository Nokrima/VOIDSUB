import React, { useEffect, useMemo, useRef, useState } from 'react';
import { clearEventHistory, getEventHistory, onEvent } from '../bridge/websocket';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  prefix: string;
  code?: string;
  message: string;
}

type LogFilter = 'ALL' | 'ERROR' | 'WARNING' | 'INFO';

const fontFamily = '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

let _logCounter = 0;

const colors = {
  panelBg: 'transparent',
  glass: 'rgba(5,9,14,0.7)',
  border: 'rgba(255,255,255,0.06)',
  textStrong: '#fff',
  textMuted: 'rgba(255,255,255,0.4)',
  textBody: 'rgba(255,255,255,0.7)',
  red: '#f87171',
  amber: '#fbbf24',
  blue: '#38bdf8',
  accent: 'rgba(125, 211, 252, 0.9)'
};

const glassCardStyle: React.CSSProperties = {
  position: 'relative',
  background: colors.glass,
  border: `1px solid ${colors.border}`,
  borderRadius: 20,
  overflow: 'hidden',
  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
};

const scrollbarStyles = `
  .log-panel-scroll::-webkit-scrollbar { width: 6px; }
  .log-panel-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 3px; }
  .log-panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
  .log-panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(125,211,252,0.3); }
  @keyframes conceptBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
`;

const getLevelBadgeStyle = (level: LogEntry['level']): React.CSSProperties => {
  if (level === 'ERROR') return { color: colors.red };
  if (level === 'WARNING') return { color: colors.amber };
  if (level === 'INFO') return { color: colors.blue };
  return { color: 'rgba(255,255,255,0.5)' };
};

const toLogEntry = (data: any): LogEntry => ({
  id: `${data.timestamp ?? 'x'}-${data.code ?? 'x'}-${++_logCounter}`,
  timestamp: String(data.timestamp ?? '--:--:--').substring(11, 23) || String(data.timestamp),
  level: String(data.level ?? 'INFO').toUpperCase() as LogEntry['level'],
  prefix: String(data.prefix ?? 'SYS'),
  code: typeof data.code === 'string' ? data.code : undefined,
  message: String(data.message ?? ''),
});



export const LogPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [logs, setLogs] = useState<LogEntry[]>(() => getEventHistory('log_entry').map(toLogEntry));
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const [prefixFilter, setPrefixFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [newLogIds, setNewLogIds] = useState<string[]>([]);
  const lastLogRef = useRef<{ key: string; at: number } | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  useEffect(() => {
    // Sadece test/önizleme amacıyla mock veri basıyoruz
    if (import.meta.env.DEV && logs.length === 0) {
      const mockLogs: LogEntry[] = [
        { id: 'mock-1', timestamp: new Date(Date.now() - 15000).toISOString().substring(11, 23), level: 'INFO', prefix: 'CORE', code: 'INIT', message: 'Tercüment_v2 çekirdeği başlatılıyor...' },
        { id: 'mock-2', timestamp: new Date(Date.now() - 14500).toISOString().substring(11, 23), level: 'INFO', prefix: 'SYS', code: 'MEM_ALLOC', message: 'Bellek yönetimi aktif (Max: 512MB)' },
        { id: 'mock-4', timestamp: new Date(Date.now() - 12800).toISOString().substring(11, 23), level: 'INFO', prefix: 'WS', code: 'READY', message: 'İstemci bağlantısı başarıyla sağlandı.' },
        { id: 'mock-5', timestamp: new Date(Date.now() - 8000).toISOString().substring(11, 23), level: 'WARNING', prefix: 'OCR', code: 'LOW_CONFIDENCE', message: 'Seçili bölgedeki metin okunabilirliği düşük (%62). Aydınlatma koşullarını kontrol edin.' },
        { id: 'mock-6', timestamp: new Date(Date.now() - 2500).toISOString().substring(11, 23), level: 'ERROR', prefix: 'API', code: 'REQ_TIMEOUT', message: 'Çeviri servisine yapılan istek 5000ms içinde yanıt vermedi.' },
        { id: 'mock-7', timestamp: new Date(Date.now() - 2000).toISOString().substring(11, 23), level: 'INFO', prefix: 'API', code: 'FALLBACK', message: 'Yedek çeviri havuzuna geçiliyor...' },
      ];
      setLogs(mockLogs);
    }

    const unsubscribe = onEvent('log_entry', (data: any) => {
      const nextLog = toLogEntry(data);
      const dedupeKey = `${nextLog.level}|${nextLog.prefix}|${nextLog.code ?? ''}|${nextLog.message}`;
      const now = Date.now();
      if (lastLogRef.current && lastLogRef.current.key === dedupeKey && now - lastLogRef.current.at < 1800) {
        return;
      }
      lastLogRef.current = { key: dedupeKey, at: now };
      setLogs((prevLogs) => {
        const nextLogs = [...prevLogs, nextLog];
        return nextLogs.length > 500 ? nextLogs.slice(nextLogs.length - 500) : nextLogs;
      });
      setNewLogIds((prev) => [...prev, nextLog.id]);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (newLogIds.length === 0) return;
    const timeoutId = window.setTimeout(() => setNewLogIds([]), 220);
    return () => window.clearTimeout(timeoutId);
  }, [newLogIds]);

  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) return;
    const container = logContainerRef.current;
    window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!logContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const knownPrefixes = useMemo(() => Array.from(new Set(logs.map((log) => log.prefix))).sort(), [logs]);
  const filteredLogs = logs.filter((log) => (filter === 'ALL' || log.level === filter) && (!prefixFilter || log.prefix === prefixFilter));

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) {
      if (selectedIds.includes(id)) {
        setSelectedIds(selectedIds.filter(x => x !== id));
      } else {
        setSelectedIds([...selectedIds, id]);
      }
    } else {
      if (selectedIds.length === 1 && selectedIds[0] === id) {
        setSelectedIds([]);
      } else {
        setSelectedIds([id]);
      }
    }
  };

  const handleCopy = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    let logsToCopy: LogEntry[] = [];
    
    if (selectedIds.includes(id)) {
      logsToCopy = logs.filter(l => selectedIds.includes(l.id));
    } else {
      logsToCopy = logs.filter(l => l.id === id);
      setSelectedIds([id]);
    }

    const textToCopy = logsToCopy.map(l => `[${l.timestamp}] [${l.level}] ${l.prefix !== 'SYS' ? `[${l.prefix}] ` : ''}${l.code ? `[${l.code}] ` : ''}${l.message}`).join('\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedRowId(id);
      setTimeout(() => setCopiedRowId(null), 1500);
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: embedded ? '0' : '20px 24px', boxSizing: 'border-box', background: embedded ? 'transparent' : colors.panelBg, position: 'relative', contain: embedded ? 'layout paint style' : undefined }}>
      <style>{scrollbarStyles}</style>

      {/* Terminal Container */}
      <div ref={logContainerRef} onScroll={handleScroll} className="log-panel-scroll app-glass" style={{ ...glassCardStyle, flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', scrollBehavior: 'auto', padding: 0, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', borderRadius: 20 }}>
        
        {/* Terminal Header (Filtreleme Barı) */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, minHeight: 32, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(5,9,14,0.95)', backdropFilter: 'blur(8px)', flexWrap: 'wrap', gap: 8 }}>
          
          {/* Sol Kısım: Filtreler */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {(['ALL', 'ERROR', 'WARNING', 'INFO'] as const).map(item => {
                const isActive = filter === item;
                const activeColor = item === 'ERROR' ? colors.red : item === 'WARNING' ? colors.amber : item === 'INFO' ? colors.blue : '#fff';
                return (
                  <button 
                    key={item} 
                    onClick={() => setFilter(item)}
                    style={{ 
                      background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', 
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                      color: isActive ? activeColor : 'rgba(255,255,255,0.3)',
                      cursor: 'pointer', transition: 'all 0.2s',
                      textShadow: isActive ? `0 0 8px ${activeColor}` : 'none',
                      padding: '4px 8px', borderRadius: 6,
                      outline: 'none'
                    }}
                    onMouseEnter={e => !isActive && (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                    onMouseLeave={e => !isActive && (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                  >
                    {item === 'ALL' ? 'TÜMÜ' : item}
                  </button>
                );
              })}
            </div>

            {knownPrefixes.length > 0 && (
              <>
                <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {knownPrefixes.map(item => {
                    const isActive = prefixFilter === item;
                    return (
                      <button 
                        key={item} 
                        onClick={() => setPrefixFilter(current => current === item ? '' : item)}
                        style={{ 
                          background: isActive ? 'rgba(167, 139, 250, 0.15)' : 'transparent', border: 'none', 
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                          color: isActive ? 'rgba(167, 139, 250, 0.9)' : 'rgba(255,255,255,0.3)',
                          cursor: 'pointer', transition: 'all 0.2s',
                          padding: '4px 6px', borderRadius: 4, outline: 'none'
                        }}
                        onMouseEnter={e => !isActive && (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                        onMouseLeave={e => !isActive && (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          
          {/* Sağ Kısım: Gösterilen Sayısı ve Temizle Butonu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif' }}>
              Gösterilen: {filteredLogs.length}
            </span>
            <button 
              style={{ background: 'transparent', border: 'none', color: '#7dd3fc', fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: 0.7, transition: 'opacity 0.2s ease', fontFamily: '"Inter", sans-serif' }} 
              onMouseEnter={e => e.currentTarget.style.opacity = '1'} 
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'} 
              onClick={() => { setLogs([]); clearEventHistory('log_entry'); }}
            >
              TEMİZLE
            </button>
          </div>
        </div>

        {/* Log Lines */}
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 2, fontFamily, flex: 1 }} onClick={() => setSelectedIds([])}>
          {filteredLogs.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24, boxSizing: 'border-box' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Bu seviyede gösterilecek kayıt yok...</div>
            </div>
          ) : (
            <div>
              {filteredLogs.map((log) => {
                const isSelected = selectedIds.includes(log.id);
                const isHovered = hoveredId === log.id;
                const isCopied = copiedRowId === log.id;
                const isLastSelected = selectedIds.length > 0 && selectedIds[selectedIds.length - 1] === log.id;
                const showCopyIcon = isCopied || isHovered || isLastSelected;

                return (
                  <div 
                    key={log.id} 
                    onMouseEnter={() => setHoveredId(log.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => { e.stopPropagation(); handleRowClick(e, log.id); }}
                    style={{ 
                      display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.5, padding: '4px 8px', borderRadius: 6,
                      background: isSelected ? 'rgba(125, 211, 252, 0.1)' : isHovered ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                      border: isSelected ? '1px solid rgba(125, 211, 252, 0.2)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 0.1s ease', alignItems: 'flex-start'
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginTop: 1 }}>[{log.timestamp}]</span>
                    
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', marginTop: 1 }}>
                      <span style={{ ...getLevelBadgeStyle(log.level), width: 44, fontWeight: 600 }}>{log.level}</span>
                      {log.prefix !== 'SYS' && <span style={{ color: 'rgba(167, 139, 250, 0.8)', fontWeight: 600 }}>[{log.prefix}]</span>}
                      {log.code && <span style={{ color: 'rgba(255,255,255,0.4)' }}>[{log.code}]</span>}
                    </div>

                    <div style={{ width: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, opacity: showCopyIcon ? 1 : 0, transition: 'opacity 0.2s' }}>
                      <button 
                        onClick={(e) => handleCopy(e, log.id)}
                        style={{ background: 'transparent', border: 'none', color: isCopied ? '#4ade80' : '#7dd3fc', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        title="Kopyala"
                      >
                        {isCopied ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        )}
                      </button>
                    </div>

                    <span style={{ color: log.level === 'ERROR' ? '#fca5a5' : log.level === 'WARNING' ? '#fde68a' : 'rgba(255,255,255,0.7)', wordBreak: 'break-all', marginTop: 1 }}>
                      {log.message}
                    </span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          )}
          {/* Blinking Cursor */}
          {filteredLogs.length > 0 && (
            <div style={{ display: 'flex', gap: 12, fontSize: 11, lineHeight: 1.5, marginTop: 4, paddingLeft: 8 }}>
              <span style={{ width: 8, height: 14, background: '#7dd3fc', animation: 'conceptBlink 1s step-end infinite' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
