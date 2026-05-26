export type ConceptAPerformanceTier = 'Ekonomi' | 'Standart' | 'Performans' | 'Maksimum';
export type ConceptAPerformanceKey = 'economy' | 'standard' | 'performance' | 'maximum';

export type ConceptAPerformanceOption = {
  id: string;
  name: string;
  isBase: boolean;
  baseTier: ConceptAPerformanceTier;
};

export const workspacePerformanceKeyByTier: Record<ConceptAPerformanceTier, ConceptAPerformanceKey> = {
  Ekonomi: 'economy',
  Standart: 'standard',
  Performans: 'performance',
  Maksimum: 'maximum',
};

export const workspacePerformanceTierByKey: Record<ConceptAPerformanceKey, ConceptAPerformanceTier> = {
  economy: 'Ekonomi',
  standard: 'Standart',
  performance: 'Performans',
  maximum: 'Maksimum',
};

export const conceptABasePerformanceTiers: ConceptAPerformanceTier[] = [
  'Ekonomi',
  'Standart',
  'Performans',
  'Maksimum',
];

export const conceptABasePerformanceOptions: ConceptAPerformanceOption[] = conceptABasePerformanceTiers.map((tier) => ({
  id: tier,
  name: tier,
  isBase: true,
  baseTier: tier,
}));

export const getConceptABasePerformanceIdFromSettings = (key?: string | null) =>
  (key && key in workspacePerformanceTierByKey ? workspacePerformanceTierByKey[key as ConceptAPerformanceKey] : 'Standart');

export const getSettingsPerformanceKeyFromConceptA = (id: string) =>
  workspacePerformanceKeyByTier[(id in workspacePerformanceKeyByTier ? id : 'Standart') as ConceptAPerformanceTier];
