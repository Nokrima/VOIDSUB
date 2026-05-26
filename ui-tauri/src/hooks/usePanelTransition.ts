import { useEffect, useState } from 'react';

/**
 * Panel geçiş hook'u.
 *
 * Timing → global.css motion token'larıyla hizalı:
 *   out  120ms  = --motion-micro  (fade-out ve panel değişimi)
 *   in   240ms  = --motion-short × 1.3  (fade-in tamamlanması)
 *
 * Ambient / onboarding animasyonlar (3s-23s) farklı katmanda,
 * bu timing'i etkilemez.
 */
export function usePanelTransition(activePanel: string) {
  const [displayPanel, setDisplayPanel] = useState(activePanel);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');

  useEffect(() => {
    if (activePanel === displayPanel) {
      return;
    }

    const isCanvasPanel = (panel: string) => panel.startsWith('canvas');
    if (isCanvasPanel(activePanel) && isCanvasPanel(displayPanel)) {
      setDisplayPanel(activePanel);
      setPhase('in');
      const t = window.setTimeout(() => setPhase('idle'), 180);
      return () => window.clearTimeout(t);
    }

    setPhase('out');
    const t1 = window.setTimeout(() => {
      setDisplayPanel(activePanel);
      setPhase('in');
    }, 120);
    const t2 = window.setTimeout(() => setPhase('idle'), 240);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [activePanel, displayPanel]);

  return { displayPanel, phase };
}
