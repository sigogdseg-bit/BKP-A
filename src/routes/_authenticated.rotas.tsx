import { createFileRoute } from "@tanstack/react-router";
import { RotasInteligentesView } from "@/features/rotas/components/RotasInteligentesView";

export const Route = createFileRoute("/_authenticated/rotas")({
  component: RotasInteligentesView,
});
