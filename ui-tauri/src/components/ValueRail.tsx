import { useEffect, useRef, useState } from "react";

type RailSize = "full" | "compact" | "mini";

/** Vertical step between items — mirrors OverlayPanel font wheel spacing */
const RAIL_STEP_PX: Record<RailSize, number> = {
  full: 26,
  compact: 22,
  mini: 22,
};

const railBandClass: Record<RailSize, string> = {
  full: "pointer-events-none absolute inset-x-0 top-1/2 h-[34px] -translate-y-1/2 rounded-[12px] bg-[linear-gradient(90deg,rgba(96,165,250,0.04),rgba(96,165,250,0.14),rgba(96,165,250,0.04))] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12),0_0_22px_rgba(96,165,250,0.06)]",
  compact:
    "pointer-events-none absolute inset-x-0 top-1/2 h-[28px] -translate-y-1/2 rounded-[10px] bg-[linear-gradient(90deg,rgba(96,165,250,0.04),rgba(96,165,250,0.14),rgba(96,165,250,0.04))] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)]",
  mini: "pointer-events-none absolute inset-x-0 top-1/2 h-[28px] -translate-y-1/2 rounded-[10px] bg-[linear-gradient(90deg,rgba(96,165,250,0.04),rgba(96,165,250,0.14),rgba(96,165,250,0.04))] shadow-[inset_0_0_0_1px_rgba(96,165,250,0.12)]",
};

const railOuterClass: Record<RailSize, string> = {
  full: "relative min-w-0 overflow-hidden px-1 text-center",
  compact: "relative min-w-0 overflow-hidden px-1 text-center",
  mini: "mt-1.5 relative overflow-hidden px-0.5 text-center flex-1",
};

const railInputClass: Record<RailSize, string> = {
  full: "w-full bg-transparent text-[1.05rem] font-semibold text-white text-center outline-none",
  compact:
    "w-full bg-transparent text-[0.88rem] font-semibold text-white text-center outline-none",
  mini: "w-full bg-transparent text-[0.88rem] font-semibold text-white text-center outline-none",
};

const RAIL_HEIGHT_PX: Record<RailSize, number> = {
  full: 68,
  compact: 56,
  mini: 56,
};
const RAIL_ACTIVE_FONT: Record<RailSize, string> = {
  full: "1.05rem",
  compact: "0.88rem",
  mini: "0.88rem",
};
const RAIL_CAP_FONT: Record<RailSize, string> = {
  full: "10px",
  compact: "9px",
  mini: "9px",
};
const RAIL_CAP_TRACKING: Record<RailSize, string> = {
  full: "0.22em",
  compact: "0.18em",
  mini: "0.18em",
};

export const ValueRail = ({
  size,
  label,
  previousValue,
  activeValue,
  nextValue,
  onActiveDoubleClick,
  isEditing = false,
  editingValue = "",
  onEditingChange,
  onEditingCommit,
  maxLength = 18,
}: {
  size: RailSize;
  label?: string;
  previousValue: string | null;
  activeValue: string;
  nextValue: string | null;
  onActiveDoubleClick?: () => void;
  isEditing?: boolean;
  editingValue?: string;
  onEditingChange?: (value: string) => void;
  onEditingCommit?: () => void;
  maxLength?: number;
}) => {
  const step = RAIL_STEP_PX[size];

  // Track scroll direction for slide animation — exactly like OverlayPanel font wheel
  const prevActiveRef = useRef(activeValue);
  const prevNextRef = useRef(nextValue);
  const [slideKey, setSlideKey] = useState(0);
  const [slideDir, setSlideDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (activeValue !== prevActiveRef.current) {
      // new active was old next → wheel scrolled down → new item slides UP into view
      // new active was old prev → wheel scrolled up  → new item slides DOWN into view
      const wasNext = activeValue === prevNextRef.current;
      setSlideDir(wasNext ? "up" : "down");
      setSlideKey((k) => k + 1);
    }
    prevActiveRef.current = activeValue;
    prevNextRef.current = nextValue;
  }, [activeValue, nextValue]);

  const items = [
    { id: "prev", value: previousValue ?? "—", offset: -step, isActive: false },
    { id: `active-${slideKey}`, value: activeValue, offset: 0, isActive: true },
    { id: "next", value: nextValue ?? "—", offset: step, isActive: false },
  ];

  const rail = (
    <div className={railOuterClass[size]}>
      {isEditing ? (
        <input
          autoFocus
          value={editingValue}
          onChange={(event) => onEditingChange?.(event.target.value)}
          onBlur={() => onEditingCommit?.()}
          onKeyDown={(event) => {
            if (event.key === "Enter") onEditingCommit?.();
          }}
          className={railInputClass[size]}
          maxLength={maxLength}
        />
      ) : (
        /* Band AND items share the same positioned ancestor → perfect vertical alignment */
        <div
          style={{
            position: "relative",
            height: RAIL_HEIGHT_PX[size],
            width: "100%",
          }}
        >
          {/* Selection highlight band — same reference box as items */}
          <div className={railBandClass[size]} />
          {items.map(({ id, value, offset, isActive }) => (
            /*
             * POSITIONING wrapper: always at the correct vertical center.
             * Never plays any animation — transform here must not be overridden.
             */
            <div
              key={id}
              onDoubleClick={
                isActive ? () => onActiveDoubleClick?.() : undefined
              }
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "50%",
                transform: `translateY(calc(-50% + ${offset}px))`,
                pointerEvents: isActive ? "auto" : "none",
              }}
            >
              {/*
               * VISUAL wrapper: holds text styles + slide animation for active item.
               * Animation only moves this inner div ±10px relative to already-centered parent
               * → does NOT touch the parent's centering transform.
               */}
              <div
                key={isActive ? `v-${slideKey}` : undefined}
                style={{
                  textAlign: "center",
                  fontSize: isActive
                    ? RAIL_ACTIVE_FONT[size]
                    : RAIL_CAP_FONT[size],
                  fontWeight: isActive ? 700 : 600,
                  color: isActive
                    ? "rgba(255,255,255,0.96)"
                    : "rgba(255,255,255,0.22)",
                  letterSpacing: isActive ? undefined : RAIL_CAP_TRACKING[size],
                  textTransform: isActive ? undefined : ("uppercase" as const),
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  padding: "0 4px",
                  /* Slide animation ONLY on the active item, keyed by slideKey so it replays */
                  animation: isActive
                    ? `${slideDir === "up" ? "rail-slide-up" : "rail-slide-down"} 160ms ease both`
                    : undefined,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!label) return rail;

  return (
    <div className="flex flex-col min-w-0">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/26">
        {label}
      </div>
      {rail}
    </div>
  );
};
