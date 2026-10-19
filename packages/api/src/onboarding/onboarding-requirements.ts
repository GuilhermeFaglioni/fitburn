import {
  OnboardingRequirement,
  type OnboardingRequirement as OnboardingRequirementName,
} from "@fitburn/contracts";

export interface OnboardingState {
  mustChangePassword: boolean;
  mustAcknowledgePrivacy?: boolean;
  mustAcceptTerms?: boolean;
}

/** Pendências ordenadas conforme a sequência de onboarding definida no produto. */
export function getOnboardingPending(state: OnboardingState): OnboardingRequirementName[] {
  const pending: OnboardingRequirementName[] = [];
  if (state.mustChangePassword) pending.push(OnboardingRequirement.PASSWORD_CHANGE);
  if (state.mustAcknowledgePrivacy) pending.push(OnboardingRequirement.PRIVACY_ACKNOWLEDGEMENT);
  if (state.mustAcceptTerms) pending.push(OnboardingRequirement.TERMS_ACCEPTANCE);
  return pending;
}
