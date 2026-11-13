import { createFileRoute } from "@tanstack/react-router";
import { RevendedoresView } from "@/features/revendedores/components/RevendedoresView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/revendedores")({
  component: RevendedoresRoute,
});

function RevendedoresRoute() {
  const { session } = useAuth();

  if (!session?.isSuperAdmin && !session?.isAdmin) {
    return (
      <AcessoModuloRestrito
        moduloNome="Rede de Revendedores e Vendedores"
        mensagem="O módulo de governança comercial é reservado à administração e SuperADM."
      />
    );
  }

  return <RevendedoresView />;
}
