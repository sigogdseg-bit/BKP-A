import { createFileRoute } from "@tanstack/react-router";
import { FrotaAnalyticsView } from "@/features/frota/components/FrotaAnalyticsView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/frota")({
  component: FrotaRoute,
});

function FrotaRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "frota")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Analytics e Desempenho da Frota"
        mensagem="O módulo de telemetria e desempenho da frota não foi liberado para o seu usuário."
      />
    );
  }

  return <FrotaAnalyticsView />;
}
