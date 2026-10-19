import { SetMetadata } from "@nestjs/common";

export const ALLOW_DURING_ONBOARDING = "allow-during-onboarding";

/** Marca uma rota autenticada que deve continuar acessível com etapas pendentes. */
export const AllowDuringOnboarding = () => SetMetadata(ALLOW_DURING_ONBOARDING, true);
