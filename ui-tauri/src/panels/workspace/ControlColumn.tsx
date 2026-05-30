import React, { useState } from "react";
import { ValueRail } from "../../components/ValueRail";

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

const shellStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "rgba(5, 9, 14, 0.42)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  minHeight: 0,
};

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

export interface ControlColumnProps {
  isTranslating: boolean;
  currentPerformance: string;
  previousPerformance: string | null;
  nextPerformance: string | null;
  shiftPerformance: (dir: -1 | 1) => void;
  performanceArrowHover: "up" | "down" | null;
  setPerformanceArrowHover: (v: "up" | "down" | null) => void;
  currentMotor: string;
  previousMotor: string | null;
  nextMotor: string | null;
  shiftMotor: (dir: -1 | 1) => void;
  motorArrowHover: "up" | "down" | null;
  setMotorArrowHover: (v: "up" | "down" | null) => void;
  activeService: string;
  previousService: string | null;
  nextService: string | null;
  shiftService: (dir: -1 | 1) => void;
  serviceArrowHover: "up" | "down" | null;
  setServiceArrowHover: (v: "up" | "down" | null) => void;
  activeModel: string;
  previousModel: string | null;
  nextModel: string | null;
  shiftModel: (dir: -1 | 1) => void;
  modelEnabled: boolean;
  modelArrowHover: "up" | "down" | null;
  setModelArrowHover: (v: "up" | "down" | null) => void;
  sourceLanguage: string;
  targetLanguage: string;
  shiftSourceLanguage: (dir: -1 | 1) => void;
  shiftTargetLanguage: (dir: -1 | 1) => void;
  swapLanguages: () => void;
  languageArrowHover:
    | "source-up"
    | "source-down"
    | "target-up"
    | "target-down"
    | null;
  setLanguageArrowHover: (
    v: "source-up" | "source-down" | "target-up" | "target-down" | null,
  ) => void;
  languageSwapHover: boolean;
  setLanguageSwapHover: (v: boolean) => void;
}

export const ControlColumn: React.FC<ControlColumnProps> = ({
  isTranslating,
  currentPerformance,
  previousPerformance,
  nextPerformance,
  shiftPerformance,
  performanceArrowHover,
  setPerformanceArrowHover,
  currentMotor,
  previousMotor,
  nextMotor,
  shiftMotor,
  motorArrowHover,
  setMotorArrowHover,
  activeService,
  previousService,
  nextService,
  shiftService,
  serviceArrowHover,
  setServiceArrowHover,
  activeModel,
  previousModel,
  nextModel,
  shiftModel,
  modelEnabled,
  modelArrowHover,
  setModelArrowHover,
  sourceLanguage,
  targetLanguage,
  shiftSourceLanguage,
  shiftTargetLanguage,
  swapLanguages,
  languageArrowHover,
  setLanguageArrowHover,
  languageSwapHover,
  setLanguageSwapHover,
}) => {
  const languageOrder = ["EN", "TR"] as const;
  const sourceLanguageIndex = languageOrder.findIndex(
    (l) => l === sourceLanguage,
  );
  const targetLanguageIndex = languageOrder.findIndex(
    (l) => l === targetLanguage,
  );
  return (
    <div
      style={{
        minHeight: 0,
        borderRadius: 24,
        background: "rgba(255,255,255,0.045)",
        display: "grid",
        gridTemplateRows: "repeat(5, minmax(0, 1fr))",
        padding: "14px",
        gap: 14,
      }}
    >
      <LayerBlock
        label="Performans"
        title="Performans"
        icon="M5 17V9m5 8V5m5 12v-6m4 6V7"
        hideTitle
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
            onWheel={(event) => {
              shiftPerformance(event.deltaY > 0 ? 1 : -1);
            }}
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "stretch",
              userSelect: "none",
              width: "100%",
              overflow: "visible",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateRows: "16px minmax(0, auto) 16px",
                alignItems: "center",
                justifyItems: "center",
                gap: 2,
                maxHeight: "100%",
              }}
            >
              <button
                type="button"
                onClick={() => shiftPerformance(-1)}
                onMouseEnter={() => setPerformanceArrowHover("up")}
                onMouseLeave={() => setPerformanceArrowHover(null)}
                aria-label="Önceki performans"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    performanceArrowHover === "up"
                      ? "#7dd3fc"
                      : "rgba(159, 183, 207, 0.64)",
                  cursor: "pointer",
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition:
                    "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform:
                    performanceArrowHover === "up"
                      ? "translateY(-1px)"
                      : "none",
                  opacity: performanceArrowHover === "up" ? 1 : 0.82,
                }}
              >
                <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
              </button>
              <div style={{ width: "100%" }}>
                <ValueRail
                  size="mini"
                  previousValue={previousPerformance}
                  activeValue={currentPerformance}
                  nextValue={nextPerformance}
                />
              </div>
              <button
                type="button"
                onClick={() => shiftPerformance(1)}
                onMouseEnter={() => setPerformanceArrowHover("down")}
                onMouseLeave={() => setPerformanceArrowHover(null)}
                aria-label="Sonraki performans"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    performanceArrowHover === "down"
                      ? "#7dd3fc"
                      : "rgba(159, 183, 207, 0.64)",
                  cursor: "pointer",
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition:
                    "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform:
                    performanceArrowHover === "down"
                      ? "translateY(1px)"
                      : "none",
                  opacity: performanceArrowHover === "down" ? 1 : 0.82,
                }}
              >
                <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
              </button>
            </div>
          </div>
        }
      />
      <LayerBlock
        label="Motor"
        title="Motor"
        icon="M10 3h4l1 2 2 1 2-1 2 4-1 2 1 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 1-2-1-2 2-4 2 1 2-1 1-2Z"
        hideTitle
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
            onWheel={(event) => {
              shiftMotor(event.deltaY > 0 ? 1 : -1);
            }}
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "stretch",
              userSelect: "none",
              width: "100%",
              overflow: "visible",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateRows: "16px minmax(0, auto) 16px",
                alignItems: "center",
                justifyItems: "center",
                gap: 2,
                maxHeight: "100%",
              }}
            >
              <button
                type="button"
                onClick={() => shiftMotor(-1)}
                onMouseEnter={() => setMotorArrowHover("up")}
                onMouseLeave={() => setMotorArrowHover(null)}
                aria-label="Önceki motor"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    motorArrowHover === "up"
                      ? "#7dd3fc"
                      : "rgba(159, 183, 207, 0.64)",
                  cursor: "pointer",
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition:
                    "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform:
                    motorArrowHover === "up" ? "translateY(-1px)" : "none",
                  opacity: motorArrowHover === "up" ? 1 : 0.82,
                }}
              >
                <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
              </button>
              <div style={{ width: "100%" }}>
                <ValueRail
                  size="mini"
                  previousValue={previousMotor}
                  activeValue={currentMotor}
                  nextValue={nextMotor}
                />
              </div>
              <button
                type="button"
                onClick={() => shiftMotor(1)}
                onMouseEnter={() => setMotorArrowHover("down")}
                onMouseLeave={() => setMotorArrowHover(null)}
                aria-label="Sonraki motor"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    motorArrowHover === "down"
                      ? "#7dd3fc"
                      : "rgba(159, 183, 207, 0.64)",
                  cursor: "pointer",
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition:
                    "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform:
                    motorArrowHover === "down" ? "translateY(1px)" : "none",
                  opacity: motorArrowHover === "down" ? 1 : 0.82,
                }}
              >
                <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
              </button>
            </div>
          </div>
        }
      />
      <LayerBlock
        label="Dil"
        title="Dil"
        icon="M4 6.5h7M4 12h9M4 17.5h6M15 6.5h5M17.5 4v5M15 17.5h5"
        hideTitle
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
              userSelect: "none",
              width: "100%",
              overflow: "visible",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 32px minmax(0, 1fr)",
                alignItems: "center",
                gap: 6,
                overflow: "visible",
              }}
            >
              <div
                onWheel={(event) => {
                  shiftSourceLanguage(event.deltaY > 0 ? 1 : -1);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  minWidth: 0,
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateRows: "16px minmax(0, auto) 16px",
                    alignItems: "center",
                    justifyItems: "center",
                    gap: 0,
                    overflow: "visible",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Önceki kaynak dil"
                    onClick={() => shiftSourceLanguage(-1)}
                    onMouseEnter={() => setLanguageArrowHover("source-up")}
                    onMouseLeave={() => setLanguageArrowHover(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color:
                        languageArrowHover === "source-up"
                          ? "#7dd3fc"
                          : "rgba(159, 183, 207, 0.64)",
                      width: 20,
                      height: 16,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition:
                        "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                      transform:
                        languageArrowHover === "source-up"
                          ? "translateY(-1px)"
                          : "none",
                      opacity: languageArrowHover === "source-up" ? 1 : 0.82,
                    }}
                  >
                    <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                  </button>
                  <div
                    style={{
                      width: "100%",
                      transform: "scale(0.94)",
                      transformOrigin: "center center",
                    }}
                  >
                    <ValueRail
                      size="mini"
                      previousValue={
                        languageOrder[
                          (sourceLanguageIndex - 1 + languageOrder.length) %
                            languageOrder.length
                        ]
                      }
                      activeValue={sourceLanguage}
                      nextValue={
                        languageOrder[
                          (sourceLanguageIndex + 1) % languageOrder.length
                        ]
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Sonraki kaynak dil"
                    onClick={() => shiftSourceLanguage(1)}
                    onMouseEnter={() => setLanguageArrowHover("source-down")}
                    onMouseLeave={() => setLanguageArrowHover(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color:
                        languageArrowHover === "source-down"
                          ? "#7dd3fc"
                          : "rgba(159, 183, 207, 0.64)",
                      width: 20,
                      height: 16,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition:
                        "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                      transform:
                        languageArrowHover === "source-down"
                          ? "translateY(1px)"
                          : "none",
                      opacity: languageArrowHover === "source-down" ? 1 : 0.82,
                    }}
                  >
                    <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={swapLanguages}
                onMouseEnter={() => setLanguageSwapHover(true)}
                onMouseLeave={() => setLanguageSwapHover(false)}
                aria-label="Dilleri değiştir"
                style={{
                  border: "none",
                  background: languageSwapHover
                    ? "linear-gradient(180deg, rgba(125,211,252,0.18), rgba(125,211,252,0.09))"
                    : "transparent",
                  boxShadow: languageSwapHover
                    ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px rgba(125,211,252,0.05)"
                    : "none",
                  color: languageSwapHover ? "#7dd3fc" : "#9fb7cf",
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition:
                    "background 160ms ease, color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform: languageSwapHover
                    ? "rotate(180deg) scale(1.04)"
                    : "scale(1)",
                  opacity: languageSwapHover ? 1 : 0.92,
                }}
              >
                <LayerGlyph path="M7 8.5h9m0 0-2.5-2.5M16 8.5 13.5 11M17 15.5H8m0 0 2.5 2.5M8 15.5 10.5 13" />
              </button>
              <div
                onWheel={(event) => {
                  shiftTargetLanguage(event.deltaY > 0 ? 1 : -1);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  minWidth: 0,
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateRows: "16px minmax(0, auto) 16px",
                    alignItems: "center",
                    justifyItems: "center",
                    gap: 0,
                    overflow: "visible",
                  }}
                >
                  <button
                    type="button"
                    aria-label="Önceki hedef dil"
                    onClick={() => shiftTargetLanguage(-1)}
                    onMouseEnter={() => setLanguageArrowHover("target-up")}
                    onMouseLeave={() => setLanguageArrowHover(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color:
                        languageArrowHover === "target-up"
                          ? "#7dd3fc"
                          : "rgba(159, 183, 207, 0.64)",
                      width: 20,
                      height: 16,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition:
                        "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                      transform:
                        languageArrowHover === "target-up"
                          ? "translateY(-1px)"
                          : "none",
                      opacity: languageArrowHover === "target-up" ? 1 : 0.82,
                    }}
                  >
                    <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                  </button>
                  <div
                    style={{
                      width: "100%",
                      transform: "scale(0.94)",
                      transformOrigin: "center center",
                    }}
                  >
                    <ValueRail
                      size="mini"
                      previousValue={
                        languageOrder[
                          (targetLanguageIndex - 1 + languageOrder.length) %
                            languageOrder.length
                        ]
                      }
                      activeValue={targetLanguage}
                      nextValue={
                        languageOrder[
                          (targetLanguageIndex + 1) % languageOrder.length
                        ]
                      }
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Sonraki hedef dil"
                    onClick={() => shiftTargetLanguage(1)}
                    onMouseEnter={() => setLanguageArrowHover("target-down")}
                    onMouseLeave={() => setLanguageArrowHover(null)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color:
                        languageArrowHover === "target-down"
                          ? "#7dd3fc"
                          : "rgba(159, 183, 207, 0.64)",
                      width: 20,
                      height: 16,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition:
                        "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                      transform:
                        languageArrowHover === "target-down"
                          ? "translateY(1px)"
                          : "none",
                      opacity: languageArrowHover === "target-down" ? 1 : 0.82,
                    }}
                  >
                    <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        }
      />
      <LayerBlock
        label="Servis"
        title="Servis"
        icon="M5 7.5h14M7 12h10M9 16.5h6"
        hideTitle
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
            onWheel={(event) => {
              shiftService(event.deltaY > 0 ? 1 : -1);
            }}
            style={{
              minHeight: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "stretch",
              userSelect: "none",
              width: "100%",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                display: "grid",
                gridTemplateRows: "16px minmax(0, auto) 16px",
                alignItems: "center",
                justifyItems: "center",
                gap: 2,
                maxHeight: "100%",
              }}
            >
              <button
                type="button"
                onClick={() => shiftService(-1)}
                onMouseEnter={() => setServiceArrowHover("up")}
                onMouseLeave={() => setServiceArrowHover(null)}
                aria-label="Önceki servis"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    serviceArrowHover === "up"
                      ? "#7dd3fc"
                      : "rgba(159, 183, 207, 0.64)",
                  cursor: "pointer",
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition:
                    "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform:
                    serviceArrowHover === "up" ? "translateY(-1px)" : "none",
                  opacity: serviceArrowHover === "up" ? 1 : 0.82,
                }}
              >
                <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
              </button>
              <div style={{ width: "100%" }}>
                <ValueRail
                  size="mini"
                  previousValue={previousService}
                  activeValue={activeService}
                  nextValue={nextService}
                />
              </div>
              <button
                type="button"
                onClick={() => shiftService(1)}
                onMouseEnter={() => setServiceArrowHover("down")}
                onMouseLeave={() => setServiceArrowHover(null)}
                aria-label="Sonraki servis"
                style={{
                  border: "none",
                  background: "transparent",
                  color:
                    serviceArrowHover === "down"
                      ? "#7dd3fc"
                      : "rgba(159, 183, 207, 0.64)",
                  cursor: "pointer",
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition:
                    "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                  transform:
                    serviceArrowHover === "down" ? "translateY(1px)" : "none",
                  opacity: serviceArrowHover === "down" ? 1 : 0.82,
                }}
              >
                <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
              </button>
            </div>
          </div>
        }
      />
      <LayerBlock
        label="Model"
        title="Model"
        icon="M6 7h12M6 12h12M6 17h8"
        hideTitle
        interactive={!isTranslating && modelEnabled}
        style={{
          opacity: modelEnabled && !isTranslating ? 1 : 0.48,
          background:
            modelEnabled && !isTranslating
              ? shellStyle.background
              : "rgba(5, 9, 14, 0.22)",
          transition:
            "opacity 280ms ease, background 280ms ease, box-shadow 180ms ease",
        }}
        sample={
          <div
            style={{
              width: "100%",
              height: "100%",
              alignSelf: "stretch",
              position: "relative",
            }}
          >
            <div
              onWheel={(event) => {
                if (modelEnabled && previousModel != null)
                  shiftModel(event.deltaY > 0 ? 1 : -1);
              }}
              style={{
                minHeight: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "stretch",
                userSelect: "none",
                width: "100%",
                overflow: "visible",
              }}
            >
              <div
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateRows: "16px minmax(0, auto) 16px",
                  alignItems: "center",
                  justifyItems: "center",
                  gap: 2,
                  maxHeight: "100%",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (modelEnabled && previousModel != null) shiftModel(-1);
                  }}
                  onMouseEnter={() => {
                    if (modelEnabled && previousModel != null)
                      setModelArrowHover("up");
                  }}
                  onMouseLeave={() => setModelArrowHover(null)}
                  aria-label="Önceki model"
                  style={{
                    border: "none",
                    background: "transparent",
                    color:
                      modelArrowHover === "up" && previousModel != null
                        ? "#7dd3fc"
                        : "rgba(159, 183, 207, 0.64)",
                    cursor:
                      modelEnabled && previousModel != null
                        ? "pointer"
                        : "default",
                    padding: 0,
                    height: 14,
                    width: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                    transform:
                      modelArrowHover === "up" && previousModel != null
                        ? "translateY(-1px)"
                        : "none",
                    opacity:
                      modelArrowHover === "up" && previousModel != null
                        ? 1
                        : 0.82,
                  }}
                >
                  <LayerGlyph path="M8 14.5 12 10.5l4 4" size={16} />
                </button>
                <div style={{ width: "100%" }}>
                  <ValueRail
                    size="mini"
                    previousValue={previousModel}
                    activeValue={activeModel}
                    nextValue={nextModel}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (modelEnabled && previousModel != null) shiftModel(1);
                  }}
                  onMouseEnter={() => {
                    if (modelEnabled && previousModel != null)
                      setModelArrowHover("down");
                  }}
                  onMouseLeave={() => setModelArrowHover(null)}
                  aria-label="Sonraki model"
                  style={{
                    border: "none",
                    background: "transparent",
                    color:
                      modelArrowHover === "down" && previousModel != null
                        ? "#7dd3fc"
                        : "rgba(159, 183, 207, 0.64)",
                    cursor:
                      modelEnabled && previousModel != null
                        ? "pointer"
                        : "default",
                    padding: 0,
                    height: 14,
                    width: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "color 160ms ease, transform 160ms ease, opacity 160ms ease",
                    transform:
                      modelArrowHover === "down" && previousModel != null
                        ? "translateY(1px)"
                        : "none",
                    opacity:
                      modelArrowHover === "down" && previousModel != null
                        ? 1
                        : 0.82,
                  }}
                >
                  <LayerGlyph path="M8 9.5 12 13.5l4-4" size={16} />
                </button>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
};
