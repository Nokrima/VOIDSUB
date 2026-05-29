import type { CalibrationRuntimeValues } from '../../config/calibrationPresets';

export type HoverState = 'up' | 'down' | null;


export interface CalibrationPreviewResult {
  error?: string;
  decision?: 'accepted' | 'rejected';
  rejection_reason?: string | null;
  quality_score?: number;
  detected_text?: string;
  processed_image?: string;
  time_ms?: number;
}


export type CalibrationControlKey =
  | 'sensitivity'
  | 'characters'
  | 'balance'
  | 'attempts'
  | 'match'
  | 'claheStriped'
  | 'clahePlain'
  | 'whiteThreshold'
  | 'bilateral'
  | 'gaussianC'
  | 'meanC';


export type CalibrationControlConfig = {
  key: CalibrationControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  initial: number;
  decimals?: number;
  accentStart: string;
  accentEnd: string;
  glow: string;
  dependsOnImageFilters?: boolean;
};


export type ConceptCalibrationSnapshot = {
  values: CalibrationValues;
  ocrFiltersEnabled: boolean;
};

export type CalibrationValues = Record<CalibrationControlKey, number>;

export type ConceptCalibrationDraftProfile = {
  id: string;
  name: string;
  snapshot: ConceptCalibrationSnapshot;
  savedSnapshot: ConceptCalibrationSnapshot | null;
  dirty: boolean;
  saved: boolean;
};

export type CalibrationInfoKey =
  | CalibrationControlKey
  | 'overview'
  | 'groupDecision'
  | 'groupFlow'
  | 'groupScene'
  | 'groupImage';


export type CalibrationInfoContent = {
  title: string;
  what: string;
  lower: string;
  higher: string;
  mode: string;
};


export type ImprovementMode = 'filters' | 'rawFlow';


export type CalibrationAreaMode = 'status' | 'quality';

