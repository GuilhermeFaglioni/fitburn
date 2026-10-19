import { z } from "zod";
import { profileSummarySchema, userStatusSchema } from "./auth.js";

export const createClientRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Nome completo é obrigatório."),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  birthDate: z.string().date("Data de nascimento inválida."),
  document: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const createStaffRequestSchema = z.object({
  fullName: z.string().trim().min(1, "Nome completo é obrigatório."),
  email: z.string().trim().email(),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  profileId: z.string().min(1, "Selecione um perfil de acesso."),
});
export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;

export const updateUserRequestSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
  document: z.string().trim().min(1).nullable().optional(),
  address: z.string().trim().min(1).nullable().optional(),
  profileId: z.string().min(1).optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  newPassword: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const userDetailSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  birthDate: z.string().nullable(),
  document: z.string().nullable(),
  address: z.string().nullable(),
  status: userStatusSchema,
  profile: z.object({ id: z.string(), name: z.string() }),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

/** Dados de clientes permitidos para leitores sem escopo total. */
export const clientProjectionSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
});
export type ClientProjection = z.infer<typeof clientProjectionSchema>;

/** Resposta completa ou reduzida de uma rota que pode devolver um cliente. */
export const clientUserResponseSchema = clientProjectionSchema.extend({
  birthDate: z.string().nullable().optional(),
  document: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  profile: profileSummarySchema.optional(),
});
export type ClientUserResponse = z.infer<typeof clientUserResponseSchema>;

export const userResponseSchema = z.union([userDetailSchema, clientUserResponseSchema]);
export type UserResponse = z.infer<typeof userResponseSchema>;

/**
 * Edição dos próprios dados pessoais (Minha conta). `.strict()`: perfil de
 * acesso, status e senha não fazem parte do contrato, então uma tentativa de
 * enviá-los é recusada em vez de ignorada em silêncio.
 */
export const updateOwnProfileRequestSchema = z
  .object({
    fullName: z.string().trim().min(1, "Nome completo é obrigatório.").optional(),
    email: z.string().trim().email("E-mail inválido.").optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    birthDate: z.string().date("Data de nascimento inválida.").nullable().optional(),
    document: z.string().trim().min(1).nullable().optional(),
    address: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileRequestSchema>;
