export interface HardwareResult {
  recommended_engine: string;
  available_engines: string[];
  engine_details?: Record<
    string,
    {
      available: boolean;
      reason: string;
      repair_available?: boolean;
      repair_kind?: string | null;
    }
  >;
  cpu: { name: string; cores: number; threads: number };
  gpu: { available: boolean; name: string };
  ram_gb: number;
  cuda_available: boolean;
  winrt_available?: boolean;
}

export interface AppSettingsPayload {
  ocr_engine?: string;
}

export interface TranslationStatePayload {
  running?: boolean;
  engine?: string;
}

export interface OcrFrameStatPayload {
  engine: string;
  quality: number;
  result: "accepted" | "rejected" | "no_text";
  reason: string;
}

export interface OfflineModelDetails {
  state?: string;
  percent?: number;
  detail?: string;
  bytes_label?: string;
  [key: string]: unknown;
}

export interface OfflineStatusPayload {
  available: boolean;
  busy?: boolean;
  selected_model?: "opus_mt_en_tr" | "nllb";
  models_ready?: Record<string, boolean>;
  active_install_model?: string | null;
  active_model?: string | null;
  active_action?: "install" | "remove" | null;
  queued_models?: string[];
  state?: string;
  percent?: number;
  detail?: string;
  bytes_label?: string;
  model_details?: Record<string, OfflineModelDetails>;
}

export type OfflineModelAction = {
  type: "install" | "remove";
  progress: number;
  detail: string;
  stage: string;
  bytes_label: string;
};

export interface EngineHardwareInfo {
  cpu: string;
  gpu: string;
  ram: string;
  activeEngine: string;
  cuda_available?: boolean;
  engine_details?: Record<string, { reason?: string; [key: string]: unknown }>;
}

export interface HealthCheckItem {
  label: string;
  value: string;
  state: "ok" | "warn" | "error";
}

export interface EngineModelItem {
  id: string;
  name: string;
  subtitle: string;
  status: "active" | "available" | "installed";
}

export interface PerfEstimateItem {
  fps: string;
  latency: string;
  gpuUsage: string;
  fpsBar: number;
  latencyBar: number;
  gpuBar: number;
}

export interface OfflineLangModelItem {
  id: string;
  name: string;
  desc: string;
  size: string;
  status: "active" | "installed" | "available";
}

// --- Component ---

export interface MotorDurumuProps {
  height?: number | string;
  hardwareInfo: EngineHardwareInfo;
  healthChecks: Record<string, HealthCheckItem[]>;
  models: Record<string, EngineModelItem[]>;
  perfEstimate: Record<string, PerfEstimateItem>;
  onEngineSelect: (engineId: string) => void;
  selectedEngineId: string;
  isAvailable: (engineId: string) => boolean;
  modelActions: Record<string, OfflineModelAction>;
  offlineLangModels: OfflineLangModelItem[];
  offlineBusy: boolean;
  completedModelId?: string | null;
  onLangDownload: (modelId: string) => void;
  onLangCancelDownload: (modelId: string) => void;
  onLangRequestRemove: (modelId: string) => void;
  onEasyocrDownload: () => void;
  onEasyocrCancel: () => void;
  onEasyocrRemove: () => void;
  onRefreshHardware?: () => void;
  isScanning?: boolean;
  easyocrAction: OfflineModelAction | null;
  easyocrCompleted: boolean;
  cudaAction: OfflineModelAction | null;
  cudaCompleted: boolean;
  onCudaDownload: () => void;
  onCudaCancel: () => void;
  onCudaRemove: () => void;
}

export type EngineInfoKey =
  | "overview"
  | "engine_selection"
  | "engine_models"
  | "translation_models"
  | "winonly"
  | "easy"
  | "w1"
  | "w2"
  | "w3"
  | "m1"
  | "m2"
  | "m3"
  | "opus_mt_en_tr"
  | "nllb";
