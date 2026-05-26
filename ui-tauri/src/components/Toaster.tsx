import { motion, AnimatePresence } from 'framer-motion';

interface NoticeItem {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
  dedupeKey?: string;
}

interface ToasterProps {
  notices: NoticeItem[];
  dismissNotice: (id: number) => void;
}

function NoticeIcon({ tone }: { tone: NoticeItem['tone'] }) {
  const iconProps = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    width: "18",
    height: "18",
  };

  switch (tone) {
    case 'error':
      return (
        <svg {...iconProps} className="text-red-400">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...iconProps} className="text-amber-400">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'success':
      return (
        <svg {...iconProps} className="text-emerald-400">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg {...iconProps} className="text-blue-400">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

const TONE_STYLES = {
  info: {
    bg: 'bg-[rgba(16,32,54,0.7)]',
    border: 'border-[rgba(59,130,246,0.3)]',
    text: 'text-blue-50',
    glow: 'shadow-[0_8px_32px_rgba(59,130,246,0.15)]',
  },
  success: {
    bg: 'bg-[rgba(16,40,32,0.7)]',
    border: 'border-[rgba(16,185,129,0.3)]',
    text: 'text-emerald-50',
    glow: 'shadow-[0_8px_32px_rgba(16,185,129,0.15)]',
  },
  warning: {
    bg: 'bg-[rgba(48,32,16,0.7)]',
    border: 'border-[rgba(245,158,11,0.3)]',
    text: 'text-amber-50',
    glow: 'shadow-[0_8px_32px_rgba(245,158,11,0.15)]',
  },
  error: {
    bg: 'bg-[rgba(54,16,24,0.7)]',
    border: 'border-[rgba(239,68,68,0.4)]',
    text: 'text-red-50',
    glow: 'shadow-[0_8px_32px_rgba(239,68,68,0.25)]',
  },
};

export function Toaster({ notices, dismissNotice }: ToasterProps) {
  return (
    <div className="pointer-events-none fixed right-5 top-16 z-[9999] flex w-[340px] max-w-[calc(100%-2rem)] flex-col gap-3">
      <AnimatePresence mode="sync">
        {notices.map((notice) => {
          const config = TONE_STYLES[notice.tone] || TONE_STYLES.info;

          return (
            <motion.div
              layout
              key={notice.id}
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 350, damping: 25, mass: 0.8 }}
              className={`
                pointer-events-auto relative overflow-hidden rounded-2xl border ${config.border} ${config.bg} p-4 
                ${config.glow} backdrop-blur-2xl flex items-start gap-3.5
              `}
              style={{
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 20px rgba(0,0,0,0.5)`,
              }}
            >
              <div className="mt-[3px] shrink-0 drop-shadow-[0_0_8px_currentColor]">
                <NoticeIcon tone={notice.tone} />
              </div>
              
              <div 
                className={`flex-1 text-[13px] leading-[1.5] font-semibold tracking-wide ${config.text} drop-shadow-md`}
                style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
              >
                {notice.message.split('!').map((part, index, arr) => (
                  <span key={index}>
                    {part}
                    {index < arr.length - 1 && <strong className="font-bold">!</strong>}
                  </span>
                ))}
              </div>
              
              <button
                onClick={() => dismissNotice(notice.id)}
                className="shrink-0 p-1.5 -mr-2 -mt-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
                aria-label="Kapat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
