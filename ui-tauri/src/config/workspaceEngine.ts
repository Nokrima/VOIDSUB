export type ConceptAEngineId = 'easy' | 'winonly';

export type ConceptAEngineOption = {
  id: ConceptAEngineId;
  label: string;
};

export const workspaceEngineLabels: Record<ConceptAEngineId, string> = {
  easy: 'EasyOCR',
  winonly: 'WinOCR',
};

export const workspaceEngineOrder: ConceptAEngineId[] = ['winonly', 'easy'];

export const workspaceEngineOptions: ConceptAEngineOption[] = workspaceEngineOrder.map((id) => ({
  id,
  label: workspaceEngineLabels[id],
}));
