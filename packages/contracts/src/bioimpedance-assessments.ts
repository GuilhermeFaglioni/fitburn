import { z } from "zod";
import { assessmentMeasuresSchema, type AssessmentMeasures } from "./bioimpedance-catalog.js";

/** Avaliações de bioimpedância (B2): contratos de criar, editar, listar e ler. */

export const BioimpedanceSource = {
  FOTO_DO_LAUDO: "FOTO_DO_LAUDO",
  MANUAL: "MANUAL",
} as const;
export type BioimpedanceSourceName = (typeof BioimpedanceSource)[keyof typeof BioimpedanceSource];
export const bioimpedanceSourceSchema = z.enum([
  BioimpedanceSource.FOTO_DO_LAUDO,
  BioimpedanceSource.MANUAL,
]);
export const BIOIMPEDANCE_SOURCE_LABELS: Record<BioimpedanceSourceName, string> = {
  FOTO_DO_LAUDO: "Foto do laudo",
  MANUAL: "Manual",
};

const measuredAtSchema = z
  .string()
  .datetime({ offset: true, message: "Informe a data e a hora da avaliação." })
  .refine((value) => new Date(value).getTime() <= Date.now() + 5 * 60_000, {
    message: "A data da avaliação não pode estar no futuro.",
  });
const heightSchema = z
  .number()
  .min(80, "A altura mínima é 80 cm.")
  .max(250, "A altura máxima é 250 cm.");
const ageSchema = z.number().int().min(1, "Idade inválida.").max(120, "Idade inválida.");

export const createAssessmentRequestSchema = z
  .object({
    clientId: z.string().min(1, "Selecione um cliente."),
    measuredAt: measuredAtSchema,
    heightCm: heightSchema.optional(),
    age: ageSchema.optional(),
    source: bioimpedanceSourceSchema,
    measures: assessmentMeasuresSchema,
  })
  .strict();
export type CreateAssessmentRequest = z.infer<typeof createAssessmentRequestSchema>;

/** Correção de uma avaliação: origem e cliente não mudam; `measures` substitui o conjunto inteiro. */
export const updateAssessmentRequestSchema = z
  .object({
    measuredAt: measuredAtSchema.optional(),
    heightCm: heightSchema.nullable().optional(),
    age: ageSchema.nullable().optional(),
    measures: assessmentMeasuresSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nada para alterar." });
export type UpdateAssessmentRequest = z.infer<typeof updateAssessmentRequestSchema>;

export const assessmentsQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
  /** Só avaliações a partir desta data (ISO). */
  from: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AssessmentsQuery = z.infer<typeof assessmentsQuerySchema>;

export interface BioimpedanceAssessment {
  id: string;
  clientId: string;
  clientName: string;
  measuredAt: string;
  heightCm: number | null;
  age: number | null;
  source: BioimpedanceSourceName;
  /** Nome de quem registrou. */
  authorName: string;
  schemaVersion: number;
  measures: AssessmentMeasures;
  createdAt: string;
  updatedAt: string;
}

/** Motivo de a equipe não ver avaliações de um cliente (D-042). */
export const AssessmentsHiddenReason = {
  CONSENT_MISSING: "CONSENT_MISSING",
  CONSENT_REVOKED: "CONSENT_REVOKED",
} as const;
export type AssessmentsHiddenReasonName =
  (typeof AssessmentsHiddenReason)[keyof typeof AssessmentsHiddenReason];

export interface AssessmentsList {
  items: BioimpedanceAssessment[];
  /** Preenchido quando a lista veio vazia por falta de consentimento vigente do cliente consultado. */
  hiddenReason: AssessmentsHiddenReasonName | null;
}

/** Cliente do escopo, com a situação do consentimento (passo "Cliente" da Nova avaliação). */
export interface AssessmentClient {
  id: string;
  fullName: string;
  email: string;
  consented: boolean;
  /** Data da autorização vigente (ISO), quando houver. */
  consentedAt: string | null;
}
