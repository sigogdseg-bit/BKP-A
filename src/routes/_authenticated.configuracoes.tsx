import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracoesView } from "@/features/configuracoes/ConfiguracoesView";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesView,
});
