import { z } from "zod";
import { userManifestationSchema } from "./onboarding.js";

/** Versão vigente do texto de consentimento de bioimpedância (D-042). Muda quando o texto muda. */
export const BIOIMPEDANCE_CONSENT_VERSION = "1";

export const bioimpedanceConsentRequestSchema = z.object({ consented: z.boolean() }).strict();
export type BioimpedanceConsentRequest = z.infer<typeof bioimpedanceConsentRequestSchema>;

export const bioimpedanceConsentResponseSchema = z.object({
  /** Consentimento vigente: a última manifestação é uma autorização. */
  consented: z.boolean(),
  /** Última manifestação do cliente (autorização ou revogação), ou nulo se nunca decidiu. */
  manifestation: userManifestationSchema.nullable(),
  /** Versão do texto que vale hoje; a tela mostra o texto desta versão. */
  currentVersion: z.string(),
});
export type BioimpedanceConsentResponse = z.infer<typeof bioimpedanceConsentResponseSchema>;
