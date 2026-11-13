import { createFileRoute } from "@tanstack/react-router";
import { AtendimentoView } from "@/features/atendimento/components/AtendimentoView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/atendimento")({
  component: AtendimentoRoute,
});

function AtendimentoRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "atendimento")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Atendimento e Suporte"
        mensagem="O canal de atendimento não foi liberado para o seu perfil."
      />
    );
  }

  return <AtendimentoView />;
}
