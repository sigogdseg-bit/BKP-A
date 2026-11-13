import { createFileRoute } from "@tanstack/react-router";
import { ManutencaoView } from "@/features/manutencao/components/ManutencaoView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/manutencao")({
  component: ManutencaoRoute,
});

function ManutencaoRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "manutencao")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Manutenção Preventiva e Revisões"
        mensagem="O módulo de manutenção veicular não foi atribuído ao seu usuário."
      />
    );
  }

  return <ManutencaoView />;
}
