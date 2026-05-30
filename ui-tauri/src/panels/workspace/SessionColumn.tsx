import React, { useState } from "react";
import { motion } from "framer-motion";

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "rgba(191, 215, 242, 0.72)",
  fontWeight: 700,
};

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  color: "#f4f8ff",
  fontWeight: 650,
  letterSpacing: "-0.02em",
};

const infoTitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#9fb7cf",
  fontWeight: 500,
  lineHeight: 1.45,
  letterSpacing: "-0.01em",
};

const shellStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "rgba(5, 9, 14, 0.42)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  minHeight: 0,
};

type SessionStatus = "idle" | "active" | "loading" | "error";
const statusColor = (s: SessionStatus) =>
  s === "active"
    ? "#86efac"
    : s === "loading"
      ? "#7dd3fc"
      : s === "idle"
        ? "#fcd34d"
        : "#fca5a5";
const statusLabel = (
  s: SessionStatus,
  active: string,
  idle: string,
  error: string,
  loading?: string,
) =>
  s === "active"
    ? active
    : s === "loading"
      ? (loading ?? active)
      : s === "idle"
        ? idle
        : error;

const LayerGlyph = ({ path, size = 18 }: { path: string; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    style={{ width: size, height: size }}
  >
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LayerBlock = ({
  label,
  title,
  icon,
  sample,
  hideTitle = false,
  titleStyleOverride,
  style,
  interactive = false,
}: {
  label: string;
  title: React.ReactNode;
  icon: string;
  sample?: React.ReactNode;
  hideTitle?: boolean;
  titleStyleOverride?: React.CSSProperties;
  style?: React.CSSProperties;
  interactive?: boolean;
}) => {
  const [blockHovered, setBlockHovered] = useState(false);
  const glowActive = interactive && blockHovered;
  return (
    <div
      onMouseEnter={interactive ? () => setBlockHovered(true) : undefined}
      onMouseLeave={interactive ? () => setBlockHovered(false) : undefined}
      style={{
        ...shellStyle,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: glowActive
          ? "inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)"
          : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transition: "box-shadow 180ms ease",
        ...style,
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
        <div style={labelStyle}>{label}</div>
        <div
          style={{
            color: "rgba(172, 214, 255, 0.82)",
            filter: glowActive
              ? "drop-shadow(0 0 6px rgba(125,211,252,0.42))"
              : "none",
            transition: "filter 180ms ease",
          }}
        >
          <LayerGlyph path={icon} />
        </div>
      </div>
      {!hideTitle ? (
        <div style={{ ...titleStyle, ...titleStyleOverride, marginTop: 8 }}>
          {title}
        </div>
      ) : null}
      {sample ? (
        <div
          style={{
            marginTop: hideTitle ? 0 : 10,
            color: "rgba(216, 231, 248, 0.82)",
            flex: hideTitle ? 1 : undefined,
            display: hideTitle ? "flex" : undefined,
            alignItems: hideTitle ? "center" : undefined,
            minHeight: 0,
            overflow: "visible",
          }}
        >
          {sample}
        </div>
      ) : null}
    </div>
  );
};

export interface SessionColumnProps {
  isTranslating: boolean;
  isLoadingEngine: boolean;
  isFloating: boolean;
  sceneModeName: string;
  sceneModeBest: string;
  applySceneType: (t: "floating" | "striped") => void;
  scanStatus: "idle" | "active" | "loading" | "error";
  motorStatus: "idle" | "active" | "loading" | "error";
  loopStatus: "idle" | "active" | "loading" | "error";
  regionActionLabel: string;
  translationActionLabel: string;
  handleStartRegionSelect: () => void;
  handleToggleTranslation: () => void;
}

export const SessionColumn: React.FC<SessionColumnProps> = ({
  isTranslating,
  isLoadingEngine,
  isFloating,
  sceneModeName,
  sceneModeBest,
  applySceneType,
  scanStatus,
  motorStatus,
  loopStatus,
  regionActionLabel,
  translationActionLabel,
  handleStartRegionSelect,
  handleToggleTranslation,
}) => (
  <div
    style={{
      minHeight: 0,
      borderRadius: 24,
      background: "rgba(255,255,255,0.045)",
      display: "grid",
      gridTemplateRows: "repeat(3, minmax(0, 1fr))",
      padding: "14px",
      gap: 14,
    }}
  >
    <LayerBlock
      label="Oturum Durumu"
      title="Oturum Durumu"
      icon="M12 4a8 8 0 1 0 8 8M12 8v4l2.5 2.5"
      hideTitle
      sample={
        <div
          style={{
            display: "grid",
            alignContent: "center",
            gap: 10,
            minHeight: "100%",
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
            <div style={{ display: "grid", gap: 6, flex: 1 }}>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a9bdd8",
                  fontWeight: 700,
                }}
              >
                Tarama Alanı
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
                color: statusColor(scanStatus),
                flexShrink: 0,
              }}
            >
              {statusLabel(scanStatus, "Hazır", "Bekleniyor", "Hata")}
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
            <div style={{ display: "grid", gap: 6, flex: 1 }}>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a9bdd8",
                  fontWeight: 700,
                }}
              >
                Motor
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
                color: statusColor(motorStatus),
                flexShrink: 0,
              }}
            >
              {statusLabel(
                motorStatus,
                "Aktif Motor",
                "Aktif Motor",
                "Aktif Motor",
                "Yükleniyor...",
              )}
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
            <div style={{ display: "grid", gap: 6, flex: 1 }}>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a9bdd8",
                  fontWeight: 700,
                }}
              >
                Çeviri Döngüsü
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
                color: statusColor(loopStatus),
                flexShrink: 0,
              }}
            >
              {statusLabel(
                loopStatus,
                "Çevriliyor",
                "Bekleniyor",
                "Durdu",
                "Başlatılıyor...",
              )}
            </span>
          </div>
        </div>
      }
    />
    <LayerBlock
      label="Çeviri Kontrolü"
      title="Alanı seç, ardından Çeviriyi başlat."
      icon="M8 6.5v11l8-5.5-8-5.5Z"
      titleStyleOverride={infoTitleStyle}
      sample={
        <div
          style={{
            minHeight: "100%",
            display: "grid",
            alignContent: "center",
            gap: 10,
          }}
        >
          <motion.button
            type="button"
            onClick={() => handleStartRegionSelect()}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            style={{
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 999,
              background:
                scanStatus === "active"
                  ? "rgba(134,239,172,0.08)"
                  : "rgba(255,255,255,0.04)",
              backdropFilter: "blur(12px)",
              boxShadow:
                scanStatus === "active"
                  ? "0 12px 24px rgba(134,239,172,0.1)"
                  : "0 12px 24px rgba(0,0,0,0.12)",
              padding: "10px 18px",
              color: scanStatus === "active" ? "#ecfff2" : "#eef6ff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              width: "100%",
            }}
          >
            {regionActionLabel}
          </motion.button>
          <motion.button
            type="button"
            onClick={isLoadingEngine ? undefined : handleToggleTranslation}
            whileHover={{ scale: isLoadingEngine ? 1 : 1.015 }}
            whileTap={{ scale: isLoadingEngine ? 1 : 0.985 }}
            style={{
              border: isTranslating
                ? "1px solid rgba(248,113,113,0.15)"
                : isLoadingEngine
                  ? "1px solid rgba(252, 211, 77, 0.25)"
                  : "1px solid rgba(125,211,252,0.15)",
              borderRadius: 999,
              background: isTranslating
                ? "rgba(248,113,113,0.08)"
                : isLoadingEngine
                  ? "rgba(252, 211, 77, 0.08)"
                  : "rgba(125,211,252,0.08)",
              backdropFilter: "blur(12px)",
              boxShadow: isTranslating
                ? "0 12px 24px rgba(248,113,113,0.12)"
                : isLoadingEngine
                  ? "0 12px 24px rgba(252, 211, 77, 0.12)"
                  : "0 12px 24px rgba(125,211,252,0.12)",
              color: isLoadingEngine ? "#fef3c7" : "#f4f9ff",
              padding: 0,
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              cursor: isLoadingEngine ? "wait" : "pointer",
              width: "100%",
              position: "relative",
              overflow: "hidden",
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isLoadingEngine && (
              <motion.div
                initial={{ width: "0%", opacity: 0 }}
                animate={{ width: "90%", opacity: 1 }}
                transition={{ duration: 4.5, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, rgba(252, 211, 77, 0.0) 0%, rgba(252, 211, 77, 0.38) 100%)",
                  zIndex: 0,
                  borderRadius: 999,
                }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>
              {translationActionLabel}
            </span>
          </motion.button>
        </div>
      }
    />
    <LayerBlock
      label="Sahne Tipi"
      title={
        <div
          key={isFloating ? "floating" : "striped"}
          style={{ animation: "conceptATextSwap 200ms ease both" }}
        >
          <span>{sceneModeName}</span>
          <span
            style={{
              display: "block",
              marginTop: 3,
              fontSize: 11,
              fontWeight: 400,
              color: "rgba(159,183,207,0.48)",
              lineHeight: 1.45,
            }}
          >
            {sceneModeBest}
          </span>
        </div>
      }
      icon="M4 7h16M4 12h16M4 17h10"
      titleStyleOverride={infoTitleStyle}
      interactive={!isTranslating}
      style={{
        opacity: !isTranslating ? 1 : 0.48,
        background: !isTranslating
          ? shellStyle.background
          : "rgba(5, 9, 14, 0.22)",
        transition:
          "opacity 280ms ease, background 280ms ease, box-shadow 180ms ease",
      }}
      sample={
        <div
          style={{
            minHeight: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "40px minmax(0, 116px) 40px",
              alignItems: "center",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => applySceneType("floating")}
              aria-pressed={isFloating}
              aria-label="Saha Metni"
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                width: 40,
                height: 40,
                borderRadius: 999,
                color: isFloating ? "#7dd3fc" : "rgba(159, 183, 207, 0.56)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                justifySelf: "center",
                transition:
                  "color 180ms ease, transform 180ms ease, opacity 180ms ease",
                transform: isFloating ? "translateY(-1px)" : "none",
                opacity: isFloating ? 1 : 0.82,
              }}
            >
              <LayerGlyph path="M6 6.5h12M6 10.5h9M6 14.5h12M6 18.5h7" />
            </button>
            <button
              type="button"
              onClick={() =>
                applySceneType(isFloating ? "striped" : "floating")
              }
              aria-label="Sahne tipini değiştir"
              style={{
                border: "none",
                padding: 0,
                cursor: "pointer",
                position: "relative",
                width: "100%",
                height: 30,
                borderRadius: 999,
                background:
                  "linear-gradient(180deg, rgba(7,11,17,0.88), rgba(4,8,13,0.94))",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -1px 0 rgba(0,0,0,0.34), 0 0 0 1px rgba(255,255,255,0.02)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 1.5,
                  bottom: 1.5,
                  left: isFloating ? 2 : "calc(50% + 0px)",
                  width: "calc(50% - 2px)",
                  borderRadius: 999,
                  background:
                    "linear-gradient(180deg, rgba(125,211,252,0.28), rgba(125,211,252,0.14))",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.08), 0 0 20px rgba(125,211,252,0.08)",
                  transition:
                    "left 220ms ease, background 180ms ease, box-shadow 180ms ease",
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => applySceneType("striped")}
              aria-pressed={!isFloating}
              aria-label="Altyazı Şeridi"
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                cursor: "pointer",
                width: 40,
                height: 40,
                borderRadius: 999,
                color: isFloating ? "rgba(159, 183, 207, 0.56)" : "#7dd3fc",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                justifySelf: "center",
                transition:
                  "color 180ms ease, transform 180ms ease, opacity 180ms ease",
                transform: isFloating ? "none" : "translateY(-1px)",
                opacity: isFloating ? 0.82 : 1,
              }}
            >
              <LayerGlyph path="M4 8h16M4 12h16M4 16h16" />
            </button>
          </div>
        </div>
      }
    />
  </div>
);
