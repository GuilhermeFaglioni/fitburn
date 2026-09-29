import { z } from "zod";

export const WorkoutSheetStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
} as const;
export type WorkoutSheetStatusName = (typeof WorkoutSheetStatus)[keyof typeof WorkoutSheetStatus];
export const workoutSheetStatusSchema = z.enum(
  Object.values(WorkoutSheetStatus) as [WorkoutSheetStatusName, ...WorkoutSheetStatusName[]],
);

/** O máximo de exercícios de uma ficha: um limite de sanidade, não uma regra de negócio. */
export const MAX_WORKOUT_EXERCISES = 100;

const titleSchema = z
  .string()
  .trim()
  .min(1, "O título da ficha é obrigatório.")
  .max(120, "O título pode ter no máximo 120 caracteres.");
const notesSchema = z
  .string()
  .trim()
  .max(2000, "As observações podem ter no máximo 2000 caracteres.");

/** Texto livre e curto de um campo do exercício ("4", "10-12", "40kg", "45s", "2km"). */
const shortText = (label: string) =>
  z.string().trim().max(40, `${label} pode ter no máximo 40 caracteres.`).optional();

/**
 * Um exercício da ficha: só o nome é obrigatório, o resto é texto livre. Um
 * campo em branco vale como "não informado". A ordem é a da lista.
 */
export const workoutExerciseInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "O nome do exercício é obrigatório.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  sets: shortText("O campo séries"),
  reps: shortText("O campo repetições"),
  load: shortText("A carga"),
  duration: shortText("O tempo"),
  distance: shortText("A distância"),
  notes: z
    .string()
    .trim()
    .max(500, "As observações podem ter no máximo 500 caracteres.")
    .optional(),
});
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseInputSchema>;

const exercisesSchema = z
  .array(workoutExerciseInputSchema)
  .max(MAX_WORKOUT_EXERCISES, `Uma ficha pode ter no máximo ${MAX_WORKOUT_EXERCISES} exercícios.`);

export const createWorkoutSheetRequestSchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
  title: titleSchema,
  notes: notesSchema.optional(),
  status: workoutSheetStatusSchema.optional(),
  exercises: exercisesSchema.optional(),
});
export type CreateWorkoutSheetRequest = z.infer<typeof createWorkoutSheetRequestSchema>;

/**
 * `exercises`, quando enviado, substitui a lista inteira (a ordem é a do
 * array); omitido, os exercícios ficam como estão. `null` limpa as observações.
 */
export const updateWorkoutSheetRequestSchema = z.object({
  title: titleSchema.optional(),
  notes: notesSchema.nullable().optional(),
  status: workoutSheetStatusSchema.optional(),
  exercises: exercisesSchema.optional(),
});
export type UpdateWorkoutSheetRequest = z.infer<typeof updateWorkoutSheetRequestSchema>;

export const workoutSheetsQuerySchema = z.object({
  clientId: z.string().min(1, "Selecione um cliente."),
});
export type WorkoutSheetsQuery = z.infer<typeof workoutSheetsQuerySchema>;

export const workoutExerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  sets: z.string().nullable(),
  reps: z.string().nullable(),
  load: z.string().nullable(),
  duration: z.string().nullable(),
  distance: z.string().nullable(),
  notes: z.string().nullable(),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export const workoutSheetSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: workoutSheetStatusSchema,
  /** Nome de quem montou a ficha. */
  authorName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Na ordem em que o professor os montou. */
  exercises: z.array(workoutExerciseSchema),
});
export type WorkoutSheet = z.infer<typeof workoutSheetSchema>;
