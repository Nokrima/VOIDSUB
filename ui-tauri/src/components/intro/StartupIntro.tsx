import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  OpeningVariantStyles,
  openingVariants,
  type OpeningVariantKey,
} from "./OpeningVariants";

interface StartupIntroProps {
  mode: OpeningVariantKey;
  onComplete: () => void;
  hold?: boolean;
  minimal?: boolean;
  profileName?: string | null;
  avatarDataUrl?: string | null;
  profileLines?: string[];
}

export default function StartupIntro({
  mode,
  onComplete,
  hold = false,
  minimal = false,
  profileName,
  avatarDataUrl,
  profileLines = [],
}: StartupIntroProps) {
  const [isExiting, setIsExiting] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const variant = useMemo(
    () =>
      openingVariants.find((item) => item.key === mode) ?? openingVariants[1],
    [mode],
  );
  const hasAvatar = Boolean(avatarDataUrl);
  const profileInitial = (profileName?.trim().charAt(0) || "S").toUpperCase();
  const renderedProfileLines =
    profileLines.length > 0
      ? profileLines.slice(0, 3)
      : ["Profil Hazır", "Varsayılan Mod", "Easy • TR"];
  const sharedProfileBarWidth = useMemo(() => {
    const baseWidth = 154;
    const longestLineLength = Math.max(
      ...renderedProfileLines.map((line) => line.length),
      14,
    );
    const maxExtraWidth = 28;
    const estimatedExtraWidth = Math.max(
      0,
      Math.min(maxExtraWidth, (longestLineLength - 14) * 2),
    );
    return baseWidth + estimatedExtraWidth;
  }, [renderedProfileLines]);

  const stageInitial =
    mode === "profileMode"
      ? { opacity: 0.76, filter: "blur(1px)" }
      : { opacity: 0.72, scale: 0.982, filter: "blur(2px)" };
  const stageAnimate =
    mode === "profileMode"
      ? {
          opacity: [0.76, 1, 0.88],
          filter: ["blur(1px)", "blur(0px)", "blur(0.4px)"],
        }
      : {
          opacity: [0.72, 1, 0.86],
          scale: [0.982, 1.014, 1],
          filter: ["blur(2px)", "blur(0px)", "blur(0.6px)"],
        };

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (hold) {
      return;
    }
    const exitId = window.setTimeout(() => setIsExiting(true), 2380);
    const timeoutId = window.setTimeout(() => onCompleteRef.current(), 2800);
    return () => {
      window.clearTimeout(exitId);
      window.clearTimeout(timeoutId);
    };
  }, [hold]);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-[linear-gradient(180deg,#0b1120_0%,#06080d_100%)] text-white"
      initial={{ opacity: 0 }}
      animate={isExiting ? { opacity: 0 } : { opacity: 1 }}
      transition={{
        duration: isExiting ? 0.32 : 0.42,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <OpeningVariantStyles />
      <div data-tauri-drag-region className="absolute inset-0 z-0" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(94,167,255,0.07)_0%,rgba(94,167,255,0.04)_26%,rgba(94,167,255,0.014)_52%,transparent_84%)] blur-[84px]"
          animate={{
            x: [0, 24, -12, 0],
            y: [0, -14, 18, 0],
            scale: [1, 1.05, 0.98, 1],
          }}
          transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[14%] top-[16%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(155,140,255,0.065)_0%,rgba(155,140,255,0.036)_24%,rgba(155,140,255,0.014)_50%,transparent_84%)] blur-[84px]"
          animate={{
            x: [0, -20, 16, 0],
            y: [0, 12, -16, 0],
            scale: [1, 0.96, 1.04, 1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[12%] left-[18%] h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.05)_0%,rgba(244,114,182,0.028)_24%,rgba(244,114,182,0.010)_48%,transparent_82%)] blur-[82px]"
          animate={{
            x: [0, 18, -10, 0],
            y: [0, -18, 10, 0],
            scale: [1, 1.03, 0.97, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {!minimal ? (
        <motion.div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          initial={stageInitial}
          animate={stageAnimate}
          transition={{
            duration: hold ? 5.6 : 2.8,
            ease: "easeOut",
            times: [0, 0.56, 1],
          }}
        >
          {mode === "defaultMode" ? (
            <div className="relative h-[300px] w-[520px]">
              <div className="absolute left-1/2 top-[22%] h-[132px] w-[316px] -translate-x-1/2">
                {[
                  { left: 18, top: 12, width: 102, height: 84, rotate: 8 },
                  { left: 108, top: 0, width: 106, height: 88, rotate: -10 },
                  { left: 206, top: 22, width: 94, height: 74, rotate: 8 },
                ].map((card, index) => (
                  <motion.div
                    key={index}
                    className="absolute rounded-[22px] border border-white/8"
                    style={{
                      left: card.left,
                      top: card.top,
                      width: card.width,
                      height: card.height,
                      background: `linear-gradient(180deg, ${variant.accent}${index === 1 ? "18" : "12"}, rgba(255,255,255,0.02))`,
                    }}
                    animate={{
                      y: [0, -8, 0],
                      rotate: [card.rotate, card.rotate + 4, card.rotate],
                      opacity: [0.78, 1, 0.78],
                    }}
                    transition={{
                      duration: 4.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: index * 0.16,
                    }}
                  />
                ))}
              </div>
              <div className="absolute bottom-[14%] left-0 right-0 flex justify-center text-center">
                <motion.div
                  className="text-[30px] font-semibold text-white"
                  style={{ letterSpacing: 0 }}
                  initial={{ opacity: 0, y: -30, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    delay: 0.2,
                    duration: 1.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  VOIDSUB
                </motion.div>
              </div>
            </div>
          ) : (
            <div className="relative h-[300px] w-[560px]">
              <div className="absolute left-1/2 top-1/2 h-[188px] w-[356px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/8 bg-[rgba(255,255,255,0.03)] [backface-visibility:hidden] [transform:translate3d(-50%,-50%,0)]">
                <motion.div
                  className="absolute inset-0"
                  animate={{
                    scale: [0.992, 1.012, 1],
                    y: [0, -2, 0],
                    opacity: [0.92, 1, 0.94],
                  }}
                  transition={{
                    duration: 2.8,
                    ease: "easeOut",
                    times: [0, 0.58, 1],
                  }}
                >
                  <motion.div
                    className="absolute left-[34px] top-[52px] grid h-[100px] w-[100px] place-items-center rounded-full text-[28px] font-bold text-white [backface-visibility:hidden] [transform:translate3d(0,0,0)]"
                    style={{
                      background: `linear-gradient(135deg, ${variant.accent}, rgba(255,255,255,0.68))`,
                      boxShadow: `0 18px 40px ${variant.accent}24`,
                    }}
                    animate={
                      hasAvatar
                        ? {
                            y: [0, -5, 0],
                            scale: [1, 1.025, 1],
                            opacity: [0.9, 1, 0.9],
                          }
                        : { y: [0, -4, 0], opacity: [0.92, 1, 0.92] }
                    }
                    transition={{
                      duration: 4.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    {avatarDataUrl ? (
                      <img
                        src={avatarDataUrl}
                        alt={profileName ?? "Profil"}
                        className="h-full w-full rounded-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <motion.span
                        className="select-none text-[30px] font-semibold tracking-[-0.02em] [backface-visibility:hidden] [transform:translate3d(0,0,0)]"
                        animate={{
                          y: [0, -1.5, 0],
                          opacity: [0.94, 1, 0.94],
                          filter: ["blur(0.2px)", "blur(0px)", "blur(0.2px)"],
                        }}
                        transition={{
                          duration: 4.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        {profileInitial}
                      </motion.span>
                    )}
                  </motion.div>
                  {renderedProfileLines.map((line, index) => {
                    const width = sharedProfileBarWidth;
                    const top = 46 + index * 38;
                    const isMiddle = index === 1;
                    const labelClass = isMiddle
                      ? "text-[12px] font-medium tracking-[0.06em] text-white/96"
                      : "text-[10px] font-normal tracking-[0.08em] text-white/74";
                    return (
                      <motion.div
                        key={`${line}-${index}`}
                        className="absolute left-[164px] flex h-[26px] items-center"
                        style={{ top, width }}
                        initial={{ opacity: 0, filter: "blur(10px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={{
                          delay: 0.46 + index * 0.14,
                          duration: 0.55,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <motion.div
                          className={`absolute left-1/2 top-1/2 h-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full ${isMiddle ? "" : "bg-white/10"}`}
                          style={{
                            width,
                            background: isMiddle
                              ? `${variant.accent}42`
                              : undefined,
                          }}
                          initial={{
                            width: 6,
                            opacity: 0.28,
                            x: "-50%",
                            y: "-50%",
                            scaleX: 0.08,
                          }}
                          animate={{
                            width,
                            opacity: isMiddle
                              ? [0.38, 0.78, 0.54]
                              : [0.22, 0.5, 0.32],
                            scaleX: 1,
                            y: ["-50%", isMiddle ? "-50%" : "-56%", "-50%"],
                          }}
                          transition={{
                            delay: 0.18 + index * 0.12,
                            duration: 0.72,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                        {!isMiddle ? (
                          <motion.div
                            className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/12"
                            initial={{ opacity: 0, scaleX: 0.12 }}
                            animate={{
                              opacity: [0.12, 0.3, 0.18],
                              scaleX: 1,
                              y: [0, index === 0 ? -1.5 : 1.5, 0],
                            }}
                            transition={{
                              delay: 0.28 + index * 0.12,
                              duration: 0.82,
                              ease: "easeOut",
                            }}
                          />
                        ) : null}
                        <motion.span
                          className={`relative z-10 block truncate pl-3 pr-3 ${labelClass}`}
                          initial={{ opacity: 0, filter: "blur(10px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          transition={{
                            delay: 0.52 + index * 0.14,
                            duration: 0.55,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          {line}
                        </motion.span>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            </div>
          )}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
