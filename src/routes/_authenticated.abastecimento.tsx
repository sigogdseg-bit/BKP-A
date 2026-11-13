import { createFileRoute } from "@tanstack/react-router";
import { AbastecimentoView } from "@/features/abastecimento/components/AbastecimentoView";

export const Route = createFileRoute("/_authenticated/abastecimento")({
  component: AbastecimentoView,
});
