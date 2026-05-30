import React, {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const fontFamily =
  "-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif";

interface PanelStageProps {
  css: string;
  layers: CSSProperties[];
  children?: ReactNode;
}

export const PanelStage: React.FC<PanelStageProps> = ({
  css,
  layers,
  children,
}) => {
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState === "visible",
  );

  useEffect(() => {
    const handleVisibilityChange = () =>
      setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 0,
        boxSizing: "border-box",
        background: "#0d1117",
        position: "relative",
        fontFamily,
      }}
    >
      <style>{css}</style>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {layers.map((layer, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              animationPlayState: pageVisible ? "running" : "paused",
              ...layer,
            }}
          />
        ))}
      </div>
      {children}
    </div>
  );
};
