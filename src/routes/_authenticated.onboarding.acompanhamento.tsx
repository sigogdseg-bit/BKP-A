import { createFileRoute } from "@tanstack/react-router";
import { OnboardingAcompanhamentoView } from "@/features/onboarding/components/OnboardingAcompanhamentoView";
import { useAuth } from "@/features/auth/context/AuthContext";

export const Route = createFileRoute("/_authenticated/onboarding/acompanhamento")({
  component: OnboardingAcompanhamentoRoute,
});

function OnboardingAcompanhamentoRoute() {
  return <OnboardingAcompanhamentoView />;
}
