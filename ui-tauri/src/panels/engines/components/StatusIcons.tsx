import { colors } from "../EnginesConfig";
export const ICheck = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={colors.success}
    strokeWidth="2.5"
    style={{ width: 12, height: 12 }}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IWarn = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={colors.warning}
    strokeWidth="2.5"
    style={{ width: 12, height: 12 }}
  >
    <path d="M12 2L2 22h20L12 2zM12 16v-6M12 20h.01" />
  </svg>
);

export const IFail = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={colors.error}
    strokeWidth="2.5"
    style={{ width: 12, height: 12 }}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
