import { WorkoutSheetStatus, type WorkoutSheetStatusName } from "@fitburn/contracts";
import type { BadgeTone } from "../../components/ui/Badge";

/** O nome de cada status nos seletores e o selo em caixa alta das listas. */
export const STATUS_LABEL: Record<WorkoutSheetStatusName, string> = {
  [WorkoutSheetStatus.ACTIVE]: "Ativa",
  [WorkoutSheetStatus.COMPLETED]: "Concluída",
  [WorkoutSheetStatus.ARCHIVED]: "Arquivada",
};

export function statusBadge(status: WorkoutSheetStatusName): string {
  return STATUS_LABEL[status].toUpperCase();
}

/** O tom do `Badge` de cada status: só a ficha ativa ganha destaque; o significado vai sempre no texto. */
export const STATUS_TONE: Record<WorkoutSheetStatusName, BadgeTone> = {
  [WorkoutSheetStatus.ACTIVE]: "ok",
  [WorkoutSheetStatus.COMPLETED]: "neutral",
  [WorkoutSheetStatus.ARCHIVED]: "neutral",
};
