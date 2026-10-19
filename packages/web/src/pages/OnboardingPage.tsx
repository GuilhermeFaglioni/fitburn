import {
  OnboardingRequirement,
  type OnboardingRequirement as Requirement,
} from "@fitburn/contracts";
import { useAuth } from "../lib/auth/AuthContext";
import { ProfilePage } from "./ProfilePage";

const REQUIREMENT_LABELS: Record<Requirement, string> = {
  PASSWORD_CHANGE: "Troque sua senha",
  PRIVACY_ACKNOWLEDGEMENT: "Leia a política de privacidade",
  TERMS_ACCEPTANCE: "Aceite os termos de uso",
};

/** Roteia as etapas pendentes na ordem entregue pela API. */
export function OnboardingPage() {
  const { user } = useAuth();
  if (!user) return null;

  const [currentRequirement] = user.onboardingPending;
  if (currentRequirement === OnboardingRequirement.PASSWORD_CHANGE) {
    return <ProfilePage requiredPasswordChange />;
  }

  return (
    <main id="conteudo" tabIndex={-1} className="fb-profile">
      <h1 className="fb-profile__title">Conclua as etapas de onboarding</h1>
      <p>Há etapas obrigatórias pendentes para esta conta:</p>
      <ul>
        {user.onboardingPending.map((requirement) => (
          <li key={requirement}>{REQUIREMENT_LABELS[requirement]}</li>
        ))}
      </ul>
    </main>
  );
}
