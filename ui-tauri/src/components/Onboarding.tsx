import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { onEvent, send } from '../bridge/websocket';

interface HardwareData {
  gpu: { available: boolean; name: string };
  cpu: { name: string; cores: number; threads: number };
  ram_gb: number;
  recommended_engine: string;
  available_engines: string[];
}

interface OnboardingProps {
  onComplete: (engine: string) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [hwData, setHwData] = useState<HardwareData | null>(null);
  const [selectedEngine, setSelectedEngine] = useState('easy');
  const [pendingFinish, setPendingFinish] = useState(false);
  const [welcomeActionReady, setWelcomeActionReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onEvent('hardware_result', (data) => {
      const payload = data as HardwareData;
      setHwData(payload);
      setSelectedEngine(payload.recommended_engine || payload.available_engines[0] || 'easy');
    });

    send('get_hardware');
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onEvent('app_settings_loaded', (data) => {
      if (!pendingFinish) {
        return;
      }
      if (data.onboarding_completed && data.ocr_engine === selectedEngine) {
        setPendingFinish(false);
        onComplete(selectedEngine);
      }
    });
    return () => unsubscribe();
  }, [onComplete, pendingFinish, selectedEngine]);

  useEffect(() => {
    const unsubscribe = onEvent('settings_save_failed', () => {
      setPendingFinish(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (step !== 1) {
      setWelcomeActionReady(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setWelcomeActionReady(true), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [step]);

  const slideVariants: Variants = {
    hidden: { opacity: 0, y: 36 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 260, damping: 28 },
    },
    exit: { opacity: 0, y: -26, transition: { duration: 0.18 } },
  };

  const tutorialStep = Math.max(step - 1, 0);
  const totalSteps = 4;
  const stepLabel = useMemo(
    () => ['Analiz', 'Motor', 'Özet', 'Tamam'][tutorialStep - 1] ?? 'Kurulum',
    [tutorialStep]
  );

  const finishOnboarding = () => {
    setPendingFinish(true);
    send('change_engine', { engine: selectedEngine });
    send('save_settings', { onboarding_completed: true, ocr_engine: selectedEngine });
  };

  const renderProgress = (
    <div className="mb-6 flex items-center justify-center gap-2">
      {[1, 2, 3, 4].map((index) => (
        <div key={index} className="flex items-center gap-2">
          <div
            className={`h-[6px] rounded-full transition-all duration-400 ease-out ${
              index < tutorialStep
                ? 'w-10 bg-[#86efac]'
                : index === tutorialStep
                  ? 'w-12 bg-[#7dd3fc] shadow-[0_0_12px_rgba(125,211,252,0.4)]'
                  : 'w-8 bg-white/10'
            }`}
          />
        </div>
      ))}
    </div>
  );

  const ActionButton = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="relative min-w-[200px] overflow-hidden rounded-[999px] border border-white/10 bg-[rgba(255,255,255,0.03)] px-10 py-3 text-base font-medium text-white shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-[18px] disabled:opacity-40"
      whileHover={disabled ? undefined : { scale: 1.01 }}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      animate={
        disabled
          ? undefined
          : {
              scale: [1, 1.035, 1],
              backgroundColor: [
                'rgba(255,255,255,0.03)',
                'rgba(255,255,255,0.05)',
                'rgba(255,255,255,0.03)',
              ],
            }
      }
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <span className="relative z-10">{children}</span>
    </motion.button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(46,132,255,0.16),transparent_28%),linear-gradient(180deg,#0b1120_0%,#06080d_100%)] text-slate-100">
      <div data-tauri-drag-region className="absolute inset-0 z-0" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[6%] top-[10%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(94,167,255,0.075)_0%,rgba(94,167,255,0.045)_26%,rgba(94,167,255,0.018)_50%,rgba(94,167,255,0.008)_66%,transparent_86%)] blur-[72px]"
          animate={{ x: [0, 20, -10, 0], y: [0, -12, 16, 0], scale: [1, 1.06, 0.98, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-[16%] top-[14%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(155,140,255,0.075)_0%,rgba(155,140,255,0.045)_24%,rgba(155,140,255,0.018)_48%,rgba(155,140,255,0.008)_64%,transparent_86%)] blur-[72px]"
          animate={{ x: [0, -18, 14, 0], y: [0, 10, -14, 0], scale: [1, 0.96, 1.05, 1] }}
          transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[14%] left-[16%] h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.068)_0%,rgba(244,114,182,0.04)_24%,rgba(244,114,182,0.016)_46%,rgba(244,114,182,0.007)_62%,transparent_84%)] blur-[72px]"
          animate={{ x: [0, 16, -12, 0], y: [0, -18, 8, 0], scale: [1, 1.04, 0.97, 1] }}
          transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[8%] right-[10%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,107,115,0.064)_0%,rgba(255,107,115,0.038)_24%,rgba(255,107,115,0.015)_48%,rgba(255,107,115,0.006)_64%,transparent_86%)] blur-[78px]"
          animate={{ x: [0, -22, 10, 0], y: [0, 12, -10, 0], scale: [1, 0.98, 1.05, 1] }}
          transition={{ duration: 23, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-center overflow-hidden text-center"
          >
            <motion.div
              className="pointer-events-none absolute inset-[-12%] bg-[radial-gradient(circle_at_18%_30%,rgba(94,167,255,0.08)_0%,rgba(94,167,255,0.035)_14%,rgba(94,167,255,0.012)_26%,transparent_48%),radial-gradient(circle_at_74%_34%,rgba(155,140,255,0.068)_0%,rgba(155,140,255,0.03)_14%,rgba(155,140,255,0.011)_26%,transparent_46%),radial-gradient(circle_at_62%_72%,rgba(244,114,182,0.056)_0%,rgba(244,114,182,0.024)_14%,rgba(244,114,182,0.009)_24%,transparent_46%),radial-gradient(circle_at_34%_78%,rgba(255,107,115,0.05)_0%,rgba(255,107,115,0.022)_14%,rgba(255,107,115,0.008)_24%,transparent_44%)]"
              animate={{
                transform: ['translate3d(0,0,0) scale(1)', 'translate3d(-10px,8px,0) scale(1.04)', 'translate3d(0,0,0) scale(1)'],
                opacity: [0.72, 1, 0.72],
              }}
              transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute bottom-[16%] left-1/2 h-14 w-[320px] -translate-x-1/2 rounded-full bg-[rgba(115,215,255,0.12)] blur-2xl"
              animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.94, 1.08, 0.94] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.h1
              className="pointer-events-none relative z-10 text-[58px] font-[500] tracking-[-0.045em] text-white"
              initial={{ opacity: 0, y: -30, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.2, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            >
              Hoş Geldiniz
            </motion.h1>
            <motion.div
              className="relative z-10 mt-20"
              initial={{ opacity: 0, y: 16, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 3, duration: 1, ease: 'easeOut' }}
              style={{ pointerEvents: welcomeActionReady ? 'auto' : 'none' }}
            >
              <ActionButton onClick={() => setStep(2)}>Başla</ActionButton>
            </motion.div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center"
          >
            <div className="pointer-events-auto w-full max-w-4xl px-6 py-8" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, backdropFilter: 'blur(16px)' }}>
              {renderProgress}
              <div className="text-center">
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'rgba(125,211,252,0.6)', textTransform: 'uppercase' }}>{tutorialStep}/{totalSteps} · {stepLabel}</div>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">Sistem Taranıyor</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Donanım, uygun motorlar ve ilk çalışma dengesi kontrol ediliyor.
                </p>
              </div>

              {hwData ? (
                <div className="mt-8 space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="text-left" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(191,215,242,0.6)', textTransform: 'uppercase' }}>RAM</div>
                      <div className="mt-2 text-xl font-bold text-white">{hwData.ram_gb} GB</div>
                    </div>
                    <div className="text-left" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(191,215,242,0.6)', textTransform: 'uppercase' }}>CPU</div>
                      <div className="mt-2 text-sm font-semibold text-white">{hwData.cpu.name}</div>
                      <div className="mt-1 text-[11px] font-medium text-slate-400">{hwData.cpu.cores} çekirdek / {hwData.cpu.threads} izlek</div>
                    </div>
                    <div className="text-left" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(191,215,242,0.6)', textTransform: 'uppercase' }}>GPU</div>
                      <div className="mt-2 text-sm font-semibold text-white">{hwData.gpu.name}</div>
                      <div className="mt-1 text-[11px] leading-[1.4] text-slate-400">
                        {hwData.gpu.available ? (
                          'Grafik hızlandırma hazır.'
                        ) : (
                          <div className="flex flex-col gap-1.5 mt-1 text-[10px]">
                            <span>Harici hızlandırma (CUDA) tespit edilmedi.</span>
                            <span>CPU modunda çeviri hızı nispeten yavaş olacaktır.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-center mt-6">
                    <ActionButton onClick={() => setStep(3)}>
                      {hwData.gpu.available ? 'Motor Seçimine Geç' : 'CPU Modunda Devam Et'}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <div className="mt-10 flex flex-col items-center justify-center py-8">
                  <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#7dd3fc]/30 border-t-[#7dd3fc]" />
                  <span className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Motorlar Doğrulanıyor...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center"
          >
            <div className="pointer-events-auto w-full max-w-4xl px-6 py-8" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, backdropFilter: 'blur(16px)' }}>
              {renderProgress}
              <div className="mb-6 text-center">
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'rgba(125,211,252,0.6)', textTransform: 'uppercase' }}>{tutorialStep}/{totalSteps} · {stepLabel}</div>
                <h2 className="mt-3 text-2xl font-bold text-white">İlk uygun motoru doğrula</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Kullanılabilir motorlar arasından ilk deneme için uygun olanı seçebilirsin.
                </p>
              </div>

              {hwData ? (
                <div className="mx-auto flex w-full flex-wrap justify-center gap-4">
                  {hwData.available_engines.map((engine) => (
                    <button
                      key={engine}
                      onClick={() => setSelectedEngine(engine)}
                      className="text-left transition-all"
                      style={{ 
                        flex: hwData.available_engines.length === 1 ? '0 1 320px' : '0 1 260px',
                        background: selectedEngine === engine ? 'rgba(125,211,252,0.08)' : 'rgba(255,255,255,0.02)', 
                        border: selectedEngine === engine ? '1px solid rgba(125,211,252,0.3)' : '1px solid rgba(255,255,255,0.04)', 
                        borderRadius: 16, 
                        padding: '16px',
                        boxShadow: selectedEngine === engine ? 'inset 0 0 0 1px rgba(125,211,252,0.1), 0 0 20px rgba(125,211,252,0.05)' : 'none'
                      }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: selectedEngine === engine ? '#7dd3fc' : 'rgba(191,215,242,0.5)', textTransform: 'uppercase' }}>
                        {hwData.recommended_engine === engine ? 'Önerilen Motor' : 'Seçilebilir'}
                      </div>
                      <div className="mt-2 text-lg font-bold uppercase tracking-wider text-white">
                        {engine}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-slate-400">
                        {engine === 'easy' ? 'Yapay zeka odaklı derin öğrenme motoru.' : 'Yerel Windows OCR motoru (hızlı).'}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-8 flex justify-center">
                <ActionButton onClick={() => setStep(4)} disabled={!hwData}>Devam Et</ActionButton>
              </div>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center"
          >
            <div className="pointer-events-auto w-full max-w-3xl px-6 py-8" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, backdropFilter: 'blur(16px)' }}>
              {renderProgress}
              <div className="text-center">
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'rgba(125,211,252,0.6)', textTransform: 'uppercase' }}>{tutorialStep}/{totalSteps} · {stepLabel}</div>
                <h2 className="mt-3 text-2xl font-bold text-white">Kurulum Özeti</h2>
                <p className="mx-auto mt-2 text-sm leading-6 text-slate-400">
                  İlk kurulum sonunda uygulanacak başlangıç tercihleri aşağıdaki gibi olacak.
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                <div className="flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(191,215,242,0.6)', textTransform: 'uppercase' }}>Seçilen motor</div>
                    <div className="mt-1 text-lg font-bold uppercase text-white">{selectedEngine}</div>
                  </div>
                  <div className="rounded-lg border border-[#86efac]/20 bg-[#86efac]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#86efac]">
                    Hazır
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(191,215,242,0.6)', textTransform: 'uppercase' }}>Başlangıç profili</div>
                    <div className="mt-1.5 text-[12px] leading-[1.5] text-slate-300">Güvenli varsayılanlar ve ilk test için performanslı ayarlar.</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(191,215,242,0.6)', textTransform: 'uppercase' }}>Sonraki adım</div>
                    <div className="mt-1.5 text-[12px] leading-[1.5] text-slate-300">Ana ekranda "Çeviriyi Başlat" tuşu ile test yapabilirsiniz.</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <ActionButton onClick={() => setStep(5)}>Kurulumu Bitir</ActionButton>
              </div>
            </div>
          </motion.div>
        )}

        {step === 5 && (
          <motion.div
            key="step5"
            variants={slideVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center"
          >
            <div className="pointer-events-auto w-full max-w-2xl px-6 py-10 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 24, backdropFilter: 'blur(16px)' }}>
              {renderProgress}
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'rgba(125,211,252,0.6)', textTransform: 'uppercase' }}>{tutorialStep}/{totalSteps} · {stepLabel}</div>
              <h2 className="mt-3 text-3xl font-bold text-white">Her şey hazır!</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Seçilen motor: <span className="font-bold uppercase text-[#86efac]">{selectedEngine}</span>
              </p>

              <div className="mt-8 flex justify-center">
                <ActionButton onClick={finishOnboarding}>Virel'i Başlat</ActionButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
