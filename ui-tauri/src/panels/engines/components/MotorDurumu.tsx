import React, { useEffect, useState } from "react";
import { wsClient } from "../../../bridge/websocket";
import { MotorDurumuProps, EngineInfoKey } from "../EnginesTypes";
import { colors, TS, G, engineInfoContent } from "../EnginesConfig";
import { ICheck, IWarn, IFail } from "./StatusIcons";
import { InfoButton, EngineInfoDock } from "./EngineInfoDock";

export const MotorDurumu: React.FC<MotorDurumuProps> = ({
  height = "100%",
  hardwareInfo,
  healthChecks,
  models,
  perfEstimate,
  onEngineSelect,
  selectedEngineId,
  isAvailable,
  offlineLangModels,
  offlineBusy,
  modelActions,
  completedModelId,
  onLangDownload,
  onLangCancelDownload,
  onLangRequestRemove,
  onEasyocrDownload,
  onEasyocrCancel,
  onEasyocrRemove,
  onRefreshHardware,
  isScanning,
  easyocrAction,
  easyocrCompleted,
  cudaAction,
  cudaCompleted,
  onCudaDownload,
  onCudaCancel,
  onCudaRemove,
}) => {
  const currentEngineId = selectedEngineId;
  const currentChecks = healthChecks[currentEngineId] || [];
  const currentModels = models[currentEngineId] || [];
  const perf = perfEstimate[currentEngineId] || {
    fps: "--",
    latency: "--",
    gpuUsage: "--",
    fpsBar: 0,
    latencyBar: 0,
    gpuBar: 0,
  };

  const [infoEnabled, setInfoEnabled] = useState(false);
  const [activeInfoKey, setActiveInfoKey] = useState<EngineInfoKey>("overview");
  const [infoDockMounted, setInfoDockMounted] = useState(false);
  const [infoDockVisible, setInfoDockVisible] = useState(false);
  const [dynamicInfo, setDynamicInfo] = useState<
    (typeof engineInfoContent)["overview"] | null
  >(null);

  useEffect(() => {
    if (!infoEnabled) return undefined;
    const closeOnEmptyClick = (e: MouseEvent) => {
      if (e.button === 2) {
        setInfoEnabled(false);
        setActiveInfoKey("overview");
        setDynamicInfo(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          '[data-info-hotspot="true"], [data-info-toggle="true"], [data-info-panel="true"]',
        )
      )
        return;
      setInfoEnabled(false);
      setActiveInfoKey("overview");
      setDynamicInfo(null);
    };
    window.addEventListener("mousedown", closeOnEmptyClick);
    return () => window.removeEventListener("mousedown", closeOnEmptyClick);
  }, [infoEnabled]);

  useEffect(() => {
    if (infoEnabled) {
      setInfoDockMounted(true);
      const frame = window.requestAnimationFrame(() =>
        setInfoDockVisible(true),
      );
      return () => window.cancelAnimationFrame(frame);
    }
    setInfoDockVisible(false);
    const timeout = window.setTimeout(() => setInfoDockMounted(false), 170);
    return () => window.clearTimeout(timeout);
  }, [infoEnabled]);

  const focusInfo = (
    key: EngineInfoKey | (typeof engineInfoContent)["overview"],
  ) => {
    if (infoEnabled) {
      if (typeof key === "string") {
        setActiveInfoKey(key as EngineInfoKey);
        setDynamicInfo(null);
      } else {
        setDynamicInfo(key);
      }
    }
  };

  const enginesData = [
    {
      id: "winonly",
      name: "Windows OCR",
      purpose:
        "Gömülü Windows API kullanarak net metinleri ve UI öğelerini sıfır gecikmeyle yakalar.",
      reqs: "WİN 10/11 YEREL OKUYUCU",
      speed: "ÇOK HIZLI / SIFIR YÜK",
      icon: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
      deps: [{ label: "Paket", ok: isAvailable("winonly") }],
    },
    {
      id: "easy",
      name: "EasyOCR",
      purpose:
        "Derin öğrenme modelleri ile oyundaki zorlu fontları yüksek doğrulukla analiz eder.",
      reqs: "CUDA DESTEKLİ GPU (4GB+)",
      speed: "DENGELİ / YÜKSEK İSABET",
      icon: "M13 10V3L4 14h7v7l9-11h-7z",
      deps: [
        {
          label: "CUDA",
          ok: hardwareInfo?.cuda_available,
          warn: !hardwareInfo?.cuda_available,
          warnText: "CPU",
        },
        { label: "Model", ok: isAvailable("easy") },
      ],
    },
  ];

  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        height,
        padding: "62px 34px 32px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "hidden",
      }}
    >
      {/* 1. PAGE HEADER */}
      <div style={{ flexShrink: 0 }}>
        <h1 style={TS.pageTitle}>MOTOR DURUMU</h1>
        <div style={TS.pageSub}>
          Motorların bağımlılık sağlığı, model durumu ve performans tahmini.
        </div>
      </div>

      {/* 2. HARDWARE SUMMARY ROW (Unified Bar) */}
      <div
        style={{
          background: colors.bgGlass,
          border: colors.borderGlass,
          borderRadius: 20,
          padding: "12px 16px",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          flexShrink: 0,
          gap: 16,
        }}
      >
        {[
          {
            label: "CPU",
            val: hardwareInfo.cpu,
            sub: "İşlemci Birimi",
            bLabel: "AKTİF",
            bColor: colors.success,
          },
          {
            label: "GPU",
            val: hardwareInfo.gpu,
            sub: "Grafik Birimi",
            bLabel: "AKTİF",
            bColor: colors.success,
          },
          {
            label: "RAM",
            val: hardwareInfo.ram,
            sub: "Sistem Belleği",
            bLabel: "AKTİF",
            bColor: colors.success,
          },
          {
            label: "AKTİF MOTOR",
            val: hardwareInfo.activeEngine.toUpperCase(),
            sub: "Seçili Motor",
            bLabel: "AKTİF",
            bColor: colors.accent,
          },
        ].map((c, i) => (
          <React.Fragment key={i}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", height: 22 }}
              >
                <div style={TS.boxTitle}>{c.label}</div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  fontSize: 12.5,
                  color: "#9fb7cf",
                  fontWeight: 500,
                  lineHeight: 1.35,
                  letterSpacing: "-0.01em",
                }}
              >
                <div
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.val}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(159,183,207,0.45)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.sub}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: c.bColor,
                      flexShrink: 0,
                    }}
                  >
                    {c.bLabel}
                  </div>
                </div>
              </div>
            </div>
            {i < 3 && (
              <div
                style={{
                  width: 1,
                  background: "rgba(255,255,255,0.06)",
                  flexShrink: 0,
                  margin: "0 4px",
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 3. MAIN BODY */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
          minHeight: 0,
          marginTop: -6,
        }}
      >
        {/* Left Column - Engine List */}
        <div
          data-info-hotspot="true"
          onMouseEnter={() => focusInfo("engine_selection")}
          style={{
            flex: 1,
            background: colors.bgGlass,
            border: colors.borderGlass,
            borderRadius: 20,
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            opacity: isScanning ? 0.6 : 1,
            pointerEvents: isScanning ? "none" : "auto",
            transition: "opacity 200ms ease",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginBottom: 2,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 22,
              }}
            >
              <div style={TS.boxTitle}>MOTOR SEÇİMİ</div>
              <InfoButton
                enabled={infoEnabled}
                onToggle={() => setInfoEnabled(!infoEnabled)}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: "#9fb7cf",
                fontWeight: 500,
                lineHeight: 1.35,
                letterSpacing: "-0.01em",
              }}
            >
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                Aktif Motor
              </span>
              <span style={{ fontSize: 11, color: "rgba(159,183,207,0.45)" }}>
                Optimum okuyucuyu belirle
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flex: 1,
            }}
          >
            {enginesData.map((eng) => {
              const isSelected = selectedEngineId === eng.id;
              const isReady = isAvailable(eng.id);
              return (
                <div
                  key={eng.id}
                  className="engine-card"
                  data-info-hotspot="true"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    focusInfo(eng.id as EngineInfoKey);
                  }}
                  onClick={() => onEngineSelect(eng.id)}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 12,
                    padding: "10px 14px",
                    cursor: "pointer",
                    background: isSelected
                      ? "rgba(125,211,252,0.08)"
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isSelected ? (isReady ? "rgba(125,211,252,0.2)" : "rgba(248,113,113,0.3)") : "rgba(255,255,255,0.03)"}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    boxShadow: isSelected
                      ? `inset 0 0 0 1px ${isReady ? "rgba(125,211,252,0.15)" : "rgba(248,113,113,0.15)"}, 0 0 20px ${isReady ? "rgba(125,211,252,0.08)" : "rgba(248,113,113,0.08)"}`
                      : "none",
                    opacity: 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {eng.name}
                      {eng.id === "easy" && !hardwareInfo?.cuda_available && (
                        <span
                          style={{
                            fontSize: 8,
                            background: "rgba(252,211,77,0.15)",
                            color: "#fcd34d",
                            padding: "1px 5px",
                            borderRadius: 4,
                          }}
                        >
                          CPU MODU
                        </span>
                      )}
                    </div>
                    {isSelected && isReady && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          background: "rgba(56,189,248,0.15)",
                          color: "#38bdf8",
                          padding: "2px 6px",
                          borderRadius: 6,
                          letterSpacing: "0.04em",
                        }}
                      >
                        AKTİF
                      </span>
                    )}
                    {isSelected && !isReady && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          background: "rgba(248,113,113,0.15)",
                          color: "#f87171",
                          padding: "2px 6px",
                          borderRadius: 6,
                          letterSpacing: "0.04em",
                          animation: "removeBlink 1s infinite alternate",
                        }}
                      >
                        İNDİRME GEREKLİ
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(159,183,207,0.45)",
                      lineHeight: 1.35,
                      opacity: isReady ? 1 : 0.6,
                    }}
                  >
                    {eng.purpose}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "rgba(191,215,242,0.5)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                      }}
                    >
                      {eng.reqs}
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: isSelected
                          ? isReady
                            ? colors.accent
                            : colors.error
                          : colors.success,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {isReady ? eng.speed : "EKSİK EKLENTİ"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column - Panel A (Split) & B */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              columnGap: 8,
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Panel A1: Sistem Sağlığı */}
            <div
              style={{
                width: "100%",
                minWidth: 0,
                background: colors.bgGlass,
                border: colors.borderGlass,
                borderRadius: 20,
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                opacity: isScanning ? 0.6 : 1,
                transition: "opacity 200ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 22,
                  }}
                >
                  <div style={TS.boxTitle}>SİSTEM SAĞLIĞI</div>
                  <div style={{ color: "rgba(172,214,255,0.82)" }}>
                    <G p="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "#9fb7cf",
                    fontWeight: 500,
                    lineHeight: 1.35,
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span
                    style={{
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {enginesData.find((e) => e.id === currentEngineId)?.name}
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  flex: 1,
                }}
              >
                {currentChecks.map((chk, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 8,
                        background: "rgba(255,255,255,0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {chk.state === "ok" ? (
                        <ICheck />
                      ) : chk.state === "warn" ? (
                        <IWarn />
                      ) : (
                        <IFail />
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        minWidth: 0,
                        maxWidth: "100%",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: colors.muted,
                          lineHeight: 1.3,
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {chk.label}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          lineHeight: 1.35,
                          color:
                            chk.state === "ok"
                              ? colors.success
                              : chk.state === "warn"
                                ? colors.warning
                                : colors.error,
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {chk.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel A2: Motor Modelleri */}
            <div
              className="engine-block"
              data-info-hotspot="true"
              onMouseEnter={() => focusInfo("engine_models")}
              style={{
                width: "100%",
                minWidth: 0,
                background: colors.bgGlass,
                border: colors.borderGlass,
                borderRadius: 20,
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                opacity: isScanning ? 0.6 : 1,
                pointerEvents: isScanning ? "none" : "auto",
                transition: "opacity 200ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 22,
                  }}
                >
                  <div style={TS.boxTitle}>MOTOR MODELLERİ</div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <div style={{ color: "rgba(172,214,255,0.82)" }}>
                      <G p="M12 2l10 6-10 6-10-6 10-6z" />
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "#9fb7cf",
                    fontWeight: 500,
                    lineHeight: 1.35,
                    letterSpacing: "-0.01em",
                  }}
                >
                  <span
                    style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}
                  >
                    OCR Verileri
                  </span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  flex: 1,
                }}
              >
                {currentModels.map((mdl) => {
                  let action = modelActions[mdl.id];
                  let isCompleted = false;

                  // EasyOCR özel plugin aksiyonlarını bağla
                  if (mdl.id === "m1") {
                    action = easyocrAction || action;
                    isCompleted = easyocrCompleted;
                  }

                  // CUDA özel aksiyonlarını bağla
                  if (mdl.id === "m2") {
                    action = cudaAction || action;
                    isCompleted = cudaCompleted;
                  }

                  const hasActionButton =
                    !!action ||
                    mdl.id === "m1" || // m1 always has either download or remove
                    mdl.id === "m2" || // m2 has download
                    (mdl.id === "w1" &&
                      currentEngineId === "winonly" &&
                      mdl.status === "available") ||
                    (mdl.id === "w2" && currentEngineId === "winonly");

                  return (
                    <div
                      key={mdl.id}
                      className={`item-feedback ${hasActionButton ? "has-action" : ""}`}
                      data-info-hotspot="true"
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        focusInfo(mdl.id as EngineInfoKey);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        padding: "6px 8px",
                        margin: "0 -8px",
                        borderRadius: 10,
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {action && (
                        <div
                          style={{
                            position: "absolute",
                            inset: "0 auto 0 0",
                            width: `${action.progress}%`,
                            background:
                              action.type === "install"
                                ? "rgba(56, 189, 248, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                            transition: "width 200ms ease",
                            zIndex: 0,
                            borderRight: `1px solid ${action.type === "install" ? "rgba(56, 189, 248, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                          }}
                        />
                      )}
                      <div
                        style={{
                          position: "relative",
                          zIndex: 1,
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background:
                              mdl.status === "active" ||
                              mdl.status === "installed"
                                ? colors.success
                                : colors.error,
                            flexShrink: 0,
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              color: colors.textPrimary,
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {mdl.name}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 4,
                              alignItems: "center",
                              fontSize: 9,
                            }}
                          >
                            {action ? (
                              <>
                                <span
                                  style={{
                                    color:
                                      action.type === "install"
                                        ? colors.accent
                                        : colors.error,
                                    fontWeight: 600,
                                  }}
                                >
                                  {action.detail}
                                </span>
                                {action.bytes_label && (
                                  <span style={{ color: colors.muted }}>
                                    ({action.bytes_label})
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: colors.muted }}>
                                {isCompleted
                                  ? "Kurulum tamamlandı"
                                  : mdl.subtitle}
                              </span>
                            )}
                          </div>
                        </div>
                        <div
                          style={{
                            marginLeft: "auto",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            position: "relative",
                            minWidth: 28,
                            minHeight: 28,
                            justifyContent: "center",
                          }}
                        >
                          {action ? (
                            <>
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color:
                                    action.type === "install"
                                      ? colors.accent
                                      : colors.error,
                                }}
                              >
                                %{action.progress}
                              </span>
                              {mdl.id === "m1" && action.type === "install" && (
                                <button
                                  className="model-action-icon action-stop"
                                  title="İndirmeyi durdur"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEasyocrCancel();
                                  }}
                                >
                                  <G p="M6 6h12v12H6z" stroke="currentColor" />
                                </button>
                              )}
                              {mdl.id === "m2" && action.type === "install" && (
                                <button
                                  className="model-action-icon action-stop"
                                  title="İndirmeyi durdur"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCudaCancel();
                                  }}
                                >
                                  <G p="M6 6h12v12H6z" stroke="currentColor" />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {mdl.status === "active" && (
                                <span
                                  className="model-state-text"
                                  style={{
                                    position: "absolute",
                                    right: 8,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: colors.success,
                                  }}
                                >
                                  AKTİF
                                </span>
                              )}
                              {mdl.status === "installed" && (
                                <span
                                  className="model-state-text"
                                  style={{
                                    position: "absolute",
                                    right: 8,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: colors.muted,
                                  }}
                                >
                                  KURULU
                                </span>
                              )}

                              {mdl.id === "m1" &&
                                mdl.status === "available" && (
                                  <button
                                    className="model-action-icon action-download"
                                    title="EasyOCR Eklentisini İndir"
                                    data-info-hotspot="true"
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      focusInfo({
                                        title:
                                          "Gelişmiş Görüntü Analizi Kurulumu",
                                        desc: "Motorun olağanüstü isabetle çalışmasını sağlayacak olan ana analiz modülüdür.",
                                        detail1:
                                          "Bağlantı hızınıza göre kısa bir indirme süreci gerektirir.",
                                        detail2:
                                          "Tamamen arka planda kurulur ve sizi asla bekletmez.",
                                        detail3:
                                          "Kurulum sürerken uygulamanın açık kalmasına özen gösterin.",
                                      });
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEasyocrDownload();
                                    }}
                                  >
                                    <G
                                      p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4"
                                      stroke="currentColor"
                                    />
                                  </button>
                                )}
                              {mdl.id === "m2" &&
                                mdl.status === "available" && (
                                  <button
                                    className="model-action-icon action-download"
                                    title="CUDA Hızlandırmasını İndir"
                                    data-info-hotspot="true"
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      focusInfo({
                                        title: "Donanım Hızlandırma Kurulumu",
                                        desc: "Analiz hızınızı maksimuma çıkarmak için ekran kartınızın tam potansiyelini açığa çıkarır.",
                                        detail1:
                                          "Yaklaşık 2-3 GB boyutunda devasa bir performans paketidir.",
                                        detail2:
                                          "Sadece NVIDIA marka donanımlarda aktifleşerek gecikmeyi milisaniyelere indirir.",
                                        detail3:
                                          "Arka planda sessizce kurulur ve sisteme dahil olur.",
                                      });
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCudaDownload();
                                    }}
                                  >
                                    <G
                                      p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4"
                                      stroke="currentColor"
                                    />
                                  </button>
                                )}
                              {mdl.id === "m1" &&
                                (mdl.status === "installed" ||
                                  mdl.status === "active") && (
                                  <button
                                    className="model-action-icon action-remove"
                                    title="EasyOCR Eklentisini Kaldır"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEasyocrRemove();
                                    }}
                                  >
                                    <G
                                      p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      stroke="currentColor"
                                    />
                                  </button>
                                )}
                              {mdl.id === "m2" &&
                                (mdl.status === "installed" ||
                                  mdl.status === "active") && (
                                  <button
                                    className="model-action-icon action-remove"
                                    title="CUDA Hızlandırmasını Sistemden Kaldır"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCudaRemove();
                                    }}
                                  >
                                    <G
                                      p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      stroke="currentColor"
                                    />
                                  </button>
                                )}
                              {mdl.id === "w1" &&
                                currentEngineId === "winonly" &&
                                mdl.status === "available" && (
                                  <button
                                    className="model-action-icon action-download"
                                    title="Dil Paketini Kur (Ayarlar)"
                                    data-info-hotspot="true"
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      focusInfo({
                                        title: "Sistem Onarımı",
                                        desc: `Tespit Edilen Hata: ${hardwareInfo?.engine_details?.winonly?.reason || "Gerekli dil paketi bulunamadı."}`,
                                        detail1:
                                          "Windows 10/11 sisteminizin yerleşik tarayıcısı şu an pasif durumda.",
                                        detail2:
                                          "Tıklayarak doğrudan Windows Dil Ayarları menüsüne ışınlanabilirsiniz.",
                                        detail3:
                                          "İlgili paket eklendikten sonra bu bildirim kalıcı olarak kaybolacaktır.",
                                      });
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      wsClient.send("repair_engine", {
                                        engine: "winonly",
                                      });
                                    }}
                                  >
                                    <G
                                      p="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                                      stroke="currentColor"
                                    />
                                  </button>
                                )}
                              {mdl.id === "w2" &&
                                currentEngineId === "winonly" && (
                                  <button
                                    className="model-action-icon action-download"
                                    title="Dili Kurdum, Tekrar Dene"
                                    data-info-hotspot="true"
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      focusInfo({
                                        title: "Sistemi Yeniden Tara",
                                        desc: "Windows ayarlarında yaptığınız değişiklikleri anında algılayıp uygulamanızı hazır hale getirir.",
                                        detail1:
                                          "Eksik paketi kurduktan sonra bu butona tıklayarak donanımınızı güncelleyebilirsiniz.",
                                        detail2:
                                          "Uygulamayı yeniden başlatmanıza gerek kalmadan kesintisiz deneyime devam edin.",
                                        detail3:
                                          "Her şey tamamsa yeşil ışığı göreceksiniz.",
                                      });
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onRefreshHardware) {
                                        onRefreshHardware();
                                      } else {
                                        wsClient.send("get_hardware");
                                      }
                                    }}
                                  >
                                    <G
                                      p="M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
                                      stroke="currentColor"
                                    />
                                  </button>
                                )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Panel B: Çeviri Dil Modelleri */}
          <div
            className="engine-block"
            data-info-hotspot="true"
            onMouseEnter={() => focusInfo("translation_models")}
            style={{
              flex: 1,
              background: colors.bgGlass,
              border: colors.borderGlass,
              borderRadius: 20,
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                marginBottom: 2,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  height: 22,
                }}
              >
                <div style={TS.boxTitle}>ÇEVİRİ DİL MODELLERİ</div>
                <div
                  style={{ color: "rgba(172,214,255,0.82)", display: "flex" }}
                >
                  <G p="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z M2 12h20" />
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  color: "#9fb7cf",
                  fontWeight: 500,
                  lineHeight: 1.35,
                  letterSpacing: "-0.01em",
                }}
              >
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                  Offline Çeviri Motorları
                </span>
                <span style={{ fontSize: 11, color: "rgba(159,183,207,0.45)" }}>
                  Yüklü dil paketleri
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
              }}
            >
              {offlineLangModels.map((lang) => {
                const action = modelActions[lang.id];
                const completed = completedModelId === lang.id;
                const isInstalled =
                  lang.status === "active" || lang.status === "installed";

                const iconPath = completed
                  ? null
                  : action?.type === "remove"
                    ? "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    : action?.type === "install"
                      ? "M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"
                      : isInstalled
                        ? "M5 13l4 4L19 7"
                        : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4";

                const iconStroke =
                  action?.type === "remove"
                    ? colors.error
                    : action?.type === "install"
                      ? colors.warning
                      : isInstalled
                        ? colors.success
                        : colors.accent;

                const iconBg =
                  action?.type === "remove"
                    ? "rgba(248,113,113,0.12)"
                    : action?.type === "install"
                      ? "rgba(252,211,77,0.10)"
                      : isInstalled
                        ? "rgba(134,239,172,0.10)"
                        : "rgba(125,211,252,0.08)";

                const detailText = action
                  ? action.type === "remove"
                    ? "Kaldırılıyor..."
                    : action.detail || "İndiriliyor..."
                  : completed
                    ? "Kurulum tamamlandı"
                    : lang.size;

                const detailColor = action
                  ? action.type === "remove"
                    ? colors.error
                    : colors.warning
                  : completed
                    ? colors.success
                    : colors.muted;

                return (
                  <div
                    key={lang.id}
                    className={`lang-row${completed ? " item-completed" : ""}`}
                    data-info-hotspot="true"
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      focusInfo(lang.id as EngineInfoKey);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 8px",
                      margin: "0 -8px",
                      borderRadius: 12,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {/* Arka plan progress şeridi */}
                    {action && (
                      <div
                        style={{
                          position: "absolute",
                          inset: "0 auto 0 0",
                          width: `${action.progress}%`,
                          background:
                            action.type === "install"
                              ? "rgba(252,211,77,0.10)"
                              : "rgba(239,68,68,0.08)",
                          transition: "width 300ms cubic-bezier(0.4,0,0.2,1)",
                          zIndex: 0,
                          borderRight: `1px solid ${action.type === "install" ? "rgba(252,211,77,0.35)" : "rgba(239,68,68,0.35)"}`,
                        }}
                      />
                    )}

                    <div
                      style={{
                        position: "relative",
                        zIndex: 1,
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      {/* İkon */}
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 10,
                          background: iconBg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "background 200ms ease",
                        }}
                      >
                        {completed ? (
                          <ICheck />
                        ) : iconPath ? (
                          <G p={iconPath} stroke={iconStroke} />
                        ) : (
                          <ICheck />
                        )}
                      </div>

                      {/* İsim + detay alt yazısı */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: colors.textPrimary,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {lang.name}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 5,
                            alignItems: "center",
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              flexShrink: 0,
                            }}
                          >
                            {lang.desc}
                          </span>
                          {action && action.detail ? (
                            <>
                              <span
                                style={{
                                  fontSize: 9,
                                  color: "rgba(255,255,255,0.18)",
                                  flexShrink: 0,
                                }}
                              >
                                ·
                              </span>
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color:
                                    action.type === "install"
                                      ? action.stage === "paused" ||
                                        action.stage === "queued"
                                        ? colors.muted
                                        : colors.warning
                                      : colors.error,
                                  flexShrink: 0,
                                  textTransform: "uppercase" as const,
                                  letterSpacing: "0.05em",
                                }}
                              >
                                {action.stage === "packages"
                                  ? "Paket"
                                  : action.stage === "converting"
                                    ? "Dönüştürme"
                                    : action.stage === "verifying"
                                      ? "Doğrulama"
                                      : action.stage === "remove"
                                        ? "Siliniyor"
                                        : action.stage === "paused"
                                          ? "Duraklatıldı"
                                          : action.stage === "queued"
                                            ? "Sırada"
                                            : "İndir"}
                              </span>
                              <span
                                style={{
                                  fontSize: 9,
                                  color: "rgba(255,255,255,0.18)",
                                  flexShrink: 0,
                                }}
                              >
                                ›
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  color:
                                    action.stage === "paused" ||
                                    action.stage === "queued"
                                      ? "rgba(159,183,207,0.55)"
                                      : "rgba(191,215,242,0.72)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap" as const,
                                }}
                              >
                                {action.detail}
                              </span>
                            </>
                          ) : (
                            <>
                              <span
                                style={{
                                  fontSize: 9,
                                  color: "rgba(255,255,255,0.18)",
                                  flexShrink: 0,
                                }}
                              >
                                •
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  color: detailColor,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {detailText}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Sağ: durum özeti ve hover aksiyon ikonu */}
                      <div
                        style={{
                          marginLeft: "auto",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        {action?.type === "install" ? (
                          <>
                            {action.bytes_label && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "rgba(191,215,242,0.55)",
                                  whiteSpace: "nowrap" as const,
                                }}
                              >
                                {action.bytes_label}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color:
                                  action.stage === "paused" ||
                                  action.stage === "queued"
                                    ? colors.muted
                                    : colors.warning,
                              }}
                            >
                              %{action.progress}
                            </span>
                            {action.stage === "paused" ||
                            action.stage === "queued" ? (
                              <button
                                className="model-action-icon action-download"
                                title="Öncelikli olarak indir"
                                aria-label="Modeli indir"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onLangDownload(lang.id);
                                }}
                              >
                                <G
                                  p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4"
                                  stroke="currentColor"
                                />
                              </button>
                            ) : (
                              <button
                                className="model-action-icon action-stop"
                                title="İndirmeyi durdur"
                                aria-label="İndirmeyi durdur"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onLangCancelDownload(lang.id);
                                }}
                              >
                                <G p="M6 6h12v12H6z" stroke="currentColor" />
                              </button>
                            )}
                          </>
                        ) : action?.type === "remove" ? (
                          <span
                            className="model-state-icon model-state-removing"
                            title="Kaldırılıyor"
                          >
                            <G
                              p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              stroke="currentColor"
                            />
                          </span>
                        ) : isInstalled ? (
                          <>
                            <button
                              className="model-action-icon action-remove"
                              disabled={offlineBusy}
                              title="Modeli kaldır"
                              aria-label="Modeli kaldır"
                              onClick={(e) => {
                                e.stopPropagation();
                                onLangRequestRemove(lang.id);
                              }}
                            >
                              <G
                                p="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                stroke="currentColor"
                              />
                            </button>
                          </>
                        ) : (
                          <button
                            className="model-action-icon action-download"
                            title={
                              offlineBusy
                                ? "Öncelikli olarak indir"
                                : "Modeli indir"
                            }
                            aria-label="Modeli indir"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLangDownload(lang.id);
                            }}
                          >
                            <G
                              p="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-3 3m0 0l-3-3m3 3V4"
                              stroke="currentColor"
                            />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM BAR */}
      <div
        style={{
          flexShrink: 0,
          background: colors.bgGlass,
          border: colors.borderGlass,
          borderRadius: 20,
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {[
          {
            label: "TAHMİNİ FPS",
            val: perf.fps,
            pct: perf.fpsBar,
            fill: colors.success,
            glow: "rgba(134,239,172,0.4)",
            icon: "M13 10V3L4 14h7v7l9-11h-7z",
          },
          {
            label: "GECİKME (LATENCY)",
            val: perf.latency,
            pct: perf.latencyBar,
            fill: colors.warning,
            glow: "rgba(252,211,77,0.4)",
            icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
          },
          {
            label: "GPU YÜKÜ",
            val: perf.gpuUsage,
            pct: perf.gpuBar,
            fill: colors.accent,
            glow: "rgba(125,211,252,0.4)",
            icon: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z M9 9h6v6H9z",
          },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "30%",
              padding: "0 8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    color: m.fill,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <path
                      d={m.icon}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(191,215,242,0.72)",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                  }}
                >
                  {m.label}
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  textShadow: `0 0 12px ${m.glow}`,
                }}
              >
                {m.val}
              </div>
            </div>
            <div
              style={{
                width: "100%",
                height: 4,
                background: "rgba(255,255,255,0.06)",
                borderRadius: 2,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${m.pct}%`,
                  height: "100%",
                  background: m.fill,
                  borderRadius: 2,
                  boxShadow: `0 0 8px ${m.glow}`,
                  transition: "width 400ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {infoDockMounted && (
        <EngineInfoDock
          info={dynamicInfo || engineInfoContent[activeInfoKey]}
          visible={infoDockVisible}
        />
      )}
    </div>
  );
};

// --- App Integration Wrapper ---
