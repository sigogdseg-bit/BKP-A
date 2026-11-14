import { createFileRoute } from "@tanstack/react-router";
import { PainelRevendedorView } from "@/features/revendedores/components/PainelRevendedorView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/minha-franquia")({
  component: MinhaFranquiaRoute,
});

function MinhaFranquiaRoute() {
  const { session } = useAuth();

  if (!session?.isRevendedor && !session?.isSuperAdmin && !session?.isAdmin) {
    return (
      <AcessoModuloRestrito
        moduloNome="Minha Franquia e Equipe"
        mensagem="Este painel é de acesso exclusivo a revendedores autorizados da rede GD Rastreamento."
      />
    );
  }

  return <PainelRevendedorView />;
}
