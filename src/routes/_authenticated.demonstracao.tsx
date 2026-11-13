import { createFileRoute } from "@tanstack/react-router";
import { DemonstracaoHubView } from "@/features/demonstracao/components/DemonstracaoHubView";

export const Route = createFileRoute("/_authenticated/demonstracao")({
  component: DemonstracaoHubView,
});
