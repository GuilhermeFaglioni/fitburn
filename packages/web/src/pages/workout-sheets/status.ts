import { WorkoutSheetStatus, type WorkoutSheetStatusName } from "@fitburn/contracts";

/** O nome de cada status nos seletores e o selo em caixa alta das listas. */
export const STATUS_LABEL: Record<WorkoutSheetStatusName, string> = {
  [WorkoutSheetStatus.ACTIVE]: "Ativa",
  [WorkoutSheetStatus.COMPLETED]: "Concluída",
  [WorkoutSheetStatus.ARCHIVED]: "Arquivada",
};

export function statusBadge(status: WorkoutSheetStatusName): string {
  return STATUS_LABEL[status].toUpperCase();
}
