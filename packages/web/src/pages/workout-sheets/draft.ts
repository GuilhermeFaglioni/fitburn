import { WorkoutSheetStatus, type WorkoutSheet, type WorkoutSheetStatusName } from "@fitburn/contracts";

export type ExerciseField = "name" | "sets" | "reps" | "load" | "duration" | "distance" | "notes";

export interface ExerciseDraft extends Record<ExerciseField, string> {
  /** Identidade da linha na tela, para reordenar sem perder o que foi digitado. */
  key: number;
}

/** O que o editor tem na tela: os campos da ficha e as linhas de exercício, como digitados. */
export interface SheetDraft {
  title: string;
  notes: string;
  status: WorkoutSheetStatusName;
  rows: ExerciseDraft[];
}

/** Os campos de cada exercício, na ordem da tela. */
export const EXERCISE_FIELDS: readonly ExerciseField[] = [
  "name",
  "sets",
  "reps",
  "load",
  "duration",
  "distance",
  "notes",
];

/** O rascunho que o editor mostra ao abrir: em branco para uma ficha nova, ou os dados carregados da ficha. */
export function draftFromSheet(editing: WorkoutSheet | null): SheetDraft {
  return {
    title: editing?.title ?? "",
    notes: editing?.notes ?? "",
    status: editing?.status ?? WorkoutSheetStatus.ACTIVE,
    rows: (editing?.exercises ?? []).map((exercise, index) => ({
      key: index + 1,
      name: exercise.name,
      sets: exercise.sets ?? "",
      reps: exercise.reps ?? "",
      load: exercise.load ?? "",
      duration: exercise.duration ?? "",
      distance: exercise.distance ?? "",
      notes: exercise.notes ?? "",
    })),
  };
}

/**
 * O editor tem alterações não salvas? Compara o que está na tela com o rascunho inicial (o da ficha carregada, ou o
 * em branco de uma ficha nova): qualquer campo diferente, status alterado, exercício adicionado, removido ou
 * reordenado conta. A chave da linha (identidade na tela) não entra na comparação. Os textos são comparados como
 * digitados, sem `trim`: na dúvida, pergunta antes de descartar.
 */
export function isDraftDirty(initial: SheetDraft, current: SheetDraft): boolean {
  if (
    initial.title !== current.title ||
    initial.notes !== current.notes ||
    initial.status !== current.status ||
    initial.rows.length !== current.rows.length
  ) {
    return true;
  }
  return current.rows.some((row, index) => {
    const original = initial.rows[index]!;
    return EXERCISE_FIELDS.some((field) => row[field] !== original[field]);
  });
}
