import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CalibrationInfoContent,
  CalibrationAreaMode,
} from "../CalibrationTypes";
import { labelStyle, shellStyle } from "../CalibrationConfig";
import { qualityColor, qualityLabel } from "../CalibrationUtils";
import { LayerGlyph } from "./BaseBlocks";

export const InfoButton = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    data-calibration-action-button="true"
    data-calibration-info-toggle="true"
    aria-pressed={enabled}
    aria-label="Kalibrasyon bilgi modu"
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
    style={{
      width: 24,
      height: 24,
      border: "none",
      borderRadius: 0,
      padding: 0,
      background: "transparent",
      color: enabled ? "#dff8ff" : "rgba(172,214,255,0.82)",
      boxShadow: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: enabled ? 1 : 0.78,
      filter: enabled ? "drop-shadow(0 0 8px rgba(56,189,248,0.34))" : "none",
      transition: "color 180ms ease, opacity 180ms ease, filter 180ms ease",
    }}
  >
    <LayerGlyph path="M12 17v-6M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </button>
);

export const CalibrationHeaderIconButton = ({
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
      data-calibration-action-button="true"
      aria-label={label}
      title={label}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => {
        setHov(false);
        setPrs(false);
      }}
      onMouseDown={() => setPrs(true)}
      onMouseUp={() => setPrs(false)}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: 24,
        height: 24,
        border: "none",
        borderRadius: 6,
        padding: 0,
        background: prs
          ? "rgba(255,255,255,0.03)"
          : hov
            ? "rgba(255,255,255,0.06)"
            : "transparent",
        color: tone,
        boxShadow: hov ? "inset 0 0 0 1px rgba(255,255,255,0.04)" : "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: prs ? 0.6 : hov ? 1 : 0.82,
        transform: prs ? "scale(0.90)" : "scale(1)",
        filter: hov && !prs ? `drop-shadow(0 0 8px ${tone})` : "none",
        transition: "all 120ms ease",
      }}
    >
      <LayerGlyph path={icon} />
    </button>
  );
};

export const CalibrationHeaderActions = ({
  profileVisible,
  infoEnabled,
  onSave,
  onDelete,
  onReset,
  onToggleInfo,
}: {
  profileVisible: boolean;
  infoEnabled: boolean;
  onSave: () => void;
  onDelete: () => void;
  onReset: () => void;
  onToggleInfo: () => void;
}) => {
  const [actionsMounted, setActionsMounted] = useState(profileVisible);
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    if (profileVisible) {
      setActionsMounted(true);
      const frame = window.requestAnimationFrame(() => setActionsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setActionsVisible(false);
    const timeout = window.setTimeout(() => setActionsMounted(false), 170);
    return () => window.clearTimeout(timeout);
  }, [profileVisible]);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 7,
        width: 117,
        minWidth: 117,
        height: 24,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          width: 86,
          height: 24,
          maxWidth: 86,
          opacity: actionsVisible ? 1 : 0,
          transform: actionsVisible
            ? "translateY(0) scale(1)"
            : "translateY(4px) scale(0.985)",
          filter: actionsVisible
            ? "blur(0px) saturate(1)"
            : "blur(3px) saturate(0.92)",
          clipPath: actionsVisible
            ? "inset(0% 0% 0% 0% round 999px)"
            : "inset(10% 8% 10% 8% round 999px)",
          overflow: "hidden",
          pointerEvents: actionsVisible ? "auto" : "none",
          transition:
            "opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease",
          willChange: "opacity, transform, filter, clip-path",
        }}
      >
        {actionsMounted ? (
          <>
            <CalibrationHeaderIconButton
              label="Profili Kaydet"
              icon="M5 4.5h10l4 4V19.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15Z M8 4.5v5h6v-5 M9 16h6"
              tone="rgba(134,239,172,0.88)"
              onClick={onSave}
            />
            <CalibrationHeaderIconButton
              label="Varsayılana Dön"
              icon="M4 7v5h5M4.8 12A7.2 7.2 0 1 0 7 6.8"
              tone="rgba(252,211,77,0.90)"
              onClick={onReset}
            />
            <CalibrationHeaderIconButton
              label="Profili Sil"
              icon="M6 7h12M9.5 7V5.5h5V7m-6 3v6m3-6v6m3-6v6M8 7l.7 10.1a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L16 7"
              tone="rgba(252,165,165,0.88)"
              onClick={onDelete}
            />
          </>
        ) : null}
      </div>
      <InfoButton enabled={infoEnabled} onToggle={onToggleInfo} />
    </div>
  );
};

export const CalibrationAreaBlock = ({
  translationActive,
  hasCalibrationRegion,
  qualityScore,
  qualityText,
}: {
  translationActive: boolean;
  hasCalibrationRegion: boolean;
  qualityScore: number | null;
  qualityText: string | null;
}) => {
  const [mode, setMode] = useState<CalibrationAreaMode>("status");
  const [displayMode, setDisplayMode] = useState<CalibrationAreaMode>("status");
  const [contentVisible, setContentVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const resolvedQualityScore =
    typeof qualityScore === "number"
      ? Math.max(0, Math.min(100, Math.round(qualityScore)))
      : null;
  const resolvedQualityText =
    qualityText?.trim() || "Henüz kalite analizi sonucu oluşmadı.";

  useEffect(() => {
    if (hasCalibrationRegion) {
      const t = window.setTimeout(() => setMode("quality"), 340);
      return () => window.clearTimeout(t);
    } else {
      const t = window.setTimeout(() => setMode("status"), 340);
      return () => window.clearTimeout(t);
    }
  }, [hasCalibrationRegion]);

  useEffect(() => {
    if (mode === displayMode) return undefined;
    setContentVisible(false);
    const t = window.setTimeout(() => {
      setDisplayMode(mode);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 110);
    return () => window.clearTimeout(t);
  }, [mode, displayMode]);

  const isAreaReady = hasCalibrationRegion;
  const color = qualityColor(resolvedQualityScore ?? 0);
  const qlabel =
    resolvedQualityScore === null
      ? "Bekliyor"
      : qualityLabel(resolvedQualityScore);
  const toggle = () => setMode((m) => (m === "status" ? "quality" : "status"));

  const headerIcon =
    displayMode === "status"
      ? "M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6"
      : "M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3Z";
  const headerLabel =
    displayMode === "status" ? "Kalibrasyon Alanı" : "Kalite Analizi";

  return (
    <div
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...shellStyle,
        position: "relative",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        cursor: "pointer",
        userSelect: "none",
        boxShadow: hovered
          ? "inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)"
          : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transition: "box-shadow 180ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          height: 24,
          minHeight: 24,
        }}
      >
        <div
          style={{
            ...labelStyle,
            opacity: contentVisible ? 1 : 0,
            transition: "opacity 160ms ease",
          }}
        >
          {headerLabel}
        </div>
        <div
          style={{
            color: "rgba(172,214,255,0.82)",
            opacity: contentVisible ? 1 : 0,
            filter: hovered
              ? "drop-shadow(0 0 6px rgba(125,211,252,0.42))"
              : "none",
            transition: "opacity 160ms ease, filter 180ms ease",
          }}
        >
          <LayerGlyph path={headerIcon} />
        </div>
      </div>

      <div
        style={{ flex: 1, display: "flex", alignItems: "center", minHeight: 0 }}
      >
        <div
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(5px)",
            filter: contentVisible ? "blur(0px)" : "blur(2px)",
            transition:
              "opacity 160ms ease, transform 160ms ease, filter 160ms ease",
            willChange: "opacity, transform, filter",
            display: "grid",
            alignContent: "center",
            gap: displayMode === "status" ? 14 : 12,
            width: "100%",
          }}
        >
          {displayMode === "status" ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 5, flex: 1 }}>
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#a9bdd8",
                      fontWeight: 700,
                    }}
                  >
                    Kalibrasyon Alanı
                  </span>
                  <div
                    style={{
                      height: 1,
                      background:
                        "linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isAreaReady ? "#9ae6b4" : "#fca5a5",
                    flexShrink: 0,
                  }}
                >
                  {isAreaReady ? "Seçili" : "Seçilmedi"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "grid", gap: 5, flex: 1 }}>
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#a9bdd8",
                      fontWeight: 700,
                    }}
                  >
                    Çeviri Durumu
                  </span>
                  <div
                    style={{
                      height: 1,
                      background:
                        "linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)",
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: translationActive
                      ? "#7dd3fc"
                      : "rgba(159,183,207,0.55)",
                    flexShrink: 0,
                  }}
                >
                  {translationActive ? "Aktif" : "Pasif"}
                </span>
              </div>
            </>
          ) : (
            <>
              <div
                style={{ display: "flex", alignItems: "flex-start", gap: 12 }}
              >
                <div
                  style={{
                    position: "relative",
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                  }}
                >
                  <svg
                    viewBox="0 0 44 44"
                    style={{
                      width: 44,
                      height: 44,
                      transform: "rotate(-90deg)",
                      display: "block",
                      overflow: "visible",
                    }}
                  >
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke={color}
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 18}`}
                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - (resolvedQualityScore ?? 0) / 100)}`}
                      opacity="0.18"
                      style={{
                        transition:
                          "stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1), stroke 400ms ease, opacity 400ms ease",
                      }}
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke="rgba(255,255,255,0.07)"
                      strokeWidth="3.5"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      stroke={color}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 18}`}
                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - (resolvedQualityScore ?? 0) / 100)}`}
                      style={{
                        transition:
                          "stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1), stroke 400ms ease",
                      }}
                    />
                  </svg>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color,
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                        transition: "color 400ms ease",
                      }}
                    >
                      {resolvedQualityScore ?? "--"}
                    </span>
                    <span
                      style={{
                        fontSize: 7.5,
                        fontWeight: 700,
                        color,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        transition: "color 400ms ease",
                        opacity: 0.82,
                      }}
                    >
                      {qlabel}
                    </span>
                  </div>
                </div>
                <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10.5,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#a9bdd8",
                        fontWeight: 700,
                      }}
                    >
                      Metin
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        letterSpacing: "0.10em",
                        textTransform: "uppercase",
                        color: "rgba(125,211,252,0.62)",
                        fontWeight: 800,
                      }}
                    >
                      Canlı
                    </span>
                  </div>
                  <div
                    style={{
                      height: 1,
                      background:
                        "linear-gradient(90deg, rgba(169,189,216,0.28) 0%, rgba(169,189,216,0.10) 60%, rgba(169,189,216,0) 100%)",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 10.5,
                      lineHeight: 1.52,
                      color: "rgba(191,215,242,0.75)",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      maxHeight: "6.1em",
                    }}
                  >
                    {resolvedQualityText}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const CalibrationInfoDock = ({
  info,
  visible,
}: {
  info: CalibrationInfoContent;
  visible: boolean;
}) => {
  const [displayInfo, setDisplayInfo] = useState(info);
  const [contentVisible, setContentVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);

  useEffect(() => {
    if (info.title === displayInfo.title) return undefined;

    setContentVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayInfo(info);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 90);

    return () => window.clearTimeout(timeout);
  }, [displayInfo.title, info]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;

    const updateHeight = () => {
      setDockHeight(node.scrollHeight + 24);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayInfo]);

  return (
    <div
      data-calibration-info-panel="true"
      style={{
        position: "absolute",
        right: 18,
        bottom: 34,
        width: 262,
        maxWidth: "calc(100% - 36px)",
        zIndex: 18,
        borderRadius: 16,
        border: "1px solid rgba(125,211,252,0.20)",
        background:
          "linear-gradient(180deg, rgba(10,18,29,0.96), rgba(7,13,21,0.93))",
        boxShadow:
          "0 22px 54px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)",
        padding: "12px 13px",
        pointerEvents: "auto",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        height: dockHeight ?? undefined,
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateY(0) scale(1)"
          : "translateY(6px) scale(0.985)",
        filter: visible ? "blur(0px) saturate(1)" : "blur(3px) saturate(0.92)",
        clipPath: visible
          ? "inset(0% 0% 0% 0% round 16px)"
          : "inset(8% 6% 8% 6% round 16px)",
        transition:
          "opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease, height 180ms ease",
        willChange: "opacity, transform, filter, clip-path, height",
      }}
    >
      <div
        ref={contentRef}
        style={{
          opacity: contentVisible ? 1 : 0,
          transform: contentVisible ? "translateY(0)" : "translateY(4px)",
          filter: contentVisible ? "blur(0px)" : "blur(2px)",
          transition:
            "opacity 130ms ease, transform 130ms ease, filter 130ms ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: "#e2eefb",
              fontWeight: 750,
              letterSpacing: "-0.01em",
            }}
          >
            {displayInfo.title}
          </div>
          <div
            style={{
              fontSize: 9.5,
              color: "rgba(125,211,252,0.78)",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Bilgi
          </div>
        </div>
        <div
          style={{
            marginTop: 8,
            display: "grid",
            gap: 6,
            fontSize: 11,
            lineHeight: 1.5,
            color: "rgba(191,215,242,0.84)",
          }}
        >
          <div>
            <span
              aria-label="Ne"
              title="Ne"
              style={{ color: "#93c5fd", fontWeight: 800 }}
            >
              ◎
            </span>{" "}
            {displayInfo.what}
          </div>
          <div>
            <span
              aria-label="Düşük"
              title="Düşük"
              style={{ color: "#86efac", fontWeight: 800 }}
            >
              ←
            </span>{" "}
            {displayInfo.lower}
          </div>
          <div>
            <span
              aria-label="Yüksek"
              title="Yüksek"
              style={{ color: "#fcd34d", fontWeight: 800 }}
            >
              →
            </span>{" "}
            {displayInfo.higher}
          </div>
          <div>
            <span
              aria-label="Mod"
              title="Mod"
              style={{ color: "#c4b5fd", fontWeight: 800 }}
            >
              ✦
            </span>{" "}
            {displayInfo.mode}
          </div>
        </div>
      </div>
    </div>
  );
};
