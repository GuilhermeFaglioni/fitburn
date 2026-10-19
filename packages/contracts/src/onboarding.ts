import { z } from "zod";
import { onboardingRequirementSchema } from "./auth.js";

export const LegalDocumentType = {
  PRIVACY_POLICY: "PRIVACY_POLICY",
  TERMS_OF_USE: "TERMS_OF_USE",
} as const;

export const legalDocumentTypeSchema = z.enum([
  LegalDocumentType.PRIVACY_POLICY,
  LegalDocumentType.TERMS_OF_USE,
]);
export type LegalDocumentType = z.infer<typeof legalDocumentTypeSchema>;

export const legalDocumentResponseSchema = z.object({
  type: legalDocumentTypeSchema,
  title: z.string(),
  version: z.string(),
  requiresNewManifestation: z.boolean(),
  content: z.string(),
});
export type LegalDocumentResponse = z.infer<typeof legalDocumentResponseSchema>;

export const userManifestationTypeSchema = z.enum([
  "PRIVACY_ACKNOWLEDGED",
  "TERMS_ACCEPTED",
  "CONSENT_RANKING",
]);
export type UserManifestationType = z.infer<typeof userManifestationTypeSchema>;

export const userManifestationActionSchema = z.enum(["GRANTED", "REVOKED"]);
export type UserManifestationAction = z.infer<typeof userManifestationActionSchema>;

export const userManifestationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: userManifestationTypeSchema,
  version: z.string().nullable(),
  action: userManifestationActionSchema,
  createdAt: z.string().datetime({ offset: true }),
});
export type UserManifestation = z.infer<typeof userManifestationSchema>;

export const onboardingManifestationResponseSchema = z.object({
  manifestation: userManifestationSchema,
  onboardingPending: z.array(onboardingRequirementSchema),
});
export type OnboardingManifestationResponse = z.infer<typeof onboardingManifestationResponseSchema>;
