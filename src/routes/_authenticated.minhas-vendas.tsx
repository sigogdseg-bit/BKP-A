import { createFileRoute } from "@tanstack/react-router";
import { PainelVendedorView } from "@/features/revendedores/components/PainelVendedorView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/minhas-vendas")({
  component: MinhasVendasRoute,
});

function MinhasVendasRoute() {
  const { session } = useAuth();

  if (
    !session?.isVendedor &&
    !session?.isSuperAdmin &&
    !session?.isAdmin &&
    !session?.isRevendedor
  ) {
    return (
      <AcessoModuloRestrito
        moduloNome="Minhas Vendas e Clientes"
        mensagem="Este painel é de acesso exclusivo a vendedores autorizados."
      />
    );
  }

  return <PainelVendedorView />;
}
