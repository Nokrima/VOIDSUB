import React, { useState } from "react";

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

const textPreviewBlockStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
};

const textPreviewFrameStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  fontSize: 14.75,
  lineHeight: 1.74,
  color: "rgba(241, 247, 255, 0.92)",
  whiteSpace: "pre-wrap",
  animation: "conceptATextSwap 320ms ease",
  overflowY: "auto",
  overflowX: "hidden",
  wordBreak: "break-word",
};

const emptyPreviewStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 8,
  color: "rgba(216, 231, 248, 0.72)",
  fontSize: 13,
  lineHeight: 1.55,
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

export interface PreviewColumnProps {
  sourcePreviewText: string;
  translatedPreviewText: string;
  shouldShowSourcePreviewHelp: boolean;
  shouldShowTargetPreviewHelp: boolean;
}

export const PreviewColumn: React.FC<PreviewColumnProps> = ({
  sourcePreviewText,
  translatedPreviewText,
  shouldShowSourcePreviewHelp,
  shouldShowTargetPreviewHelp,
}) => (
  <div
    style={{
      minHeight: 0,
      borderRadius: 24,
      background: "rgba(255,255,255,0.045)",
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
      padding: "16px",
      gap: 14,
    }}
  >
    <LayerBlock
      label="Metin Önizleme"
      title="Metin Önizleme"
      icon="M6 5.5h12M6 10h12M6 14.5h8M6 19h10"
      hideTitle
      sample={
        <div style={textPreviewBlockStyle}>
          {sourcePreviewText ? (
            <div
              key={`source-${sourcePreviewText}`}
              style={textPreviewFrameStyle}
            >
              {sourcePreviewText}
            </div>
          ) : shouldShowSourcePreviewHelp ? (
            <div style={emptyPreviewStyle}>
              <div
                style={{ fontSize: 13.5, fontWeight: 650, color: "#eef6ff" }}
              >
                Henüz okuma başlamadı.
              </div>
              <div>
                Çeviri alanını seçip çeviriyi başlattığında yakalanan metin
                burada görünecek.
              </div>
            </div>
          ) : null}
        </div>
      }
    />
    <LayerBlock
      label="Çeviri Sonucu"
      title="Çeviri Sonucu"
      icon="M5 7h6m3 0h5M5 12h14M5 17h9"
      hideTitle
      sample={
        <div style={textPreviewBlockStyle}>
          {translatedPreviewText ? (
            <div
              key={`target-${translatedPreviewText}`}
              style={textPreviewFrameStyle}
            >
              {translatedPreviewText}
            </div>
          ) : shouldShowTargetPreviewHelp ? (
            <div style={emptyPreviewStyle}>
              <div
                style={{ fontSize: 13.5, fontWeight: 650, color: "#eef6ff" }}
              >
                Çeviri sonucu bekleniyor.
              </div>
              <div>
                İlk çeviri geldikten sonra bu bilgilendirme bu oturum boyunca
                tekrar gösterilmeyecek.
              </div>
            </div>
          ) : null}
        </div>
      }
    />
  </div>
);
