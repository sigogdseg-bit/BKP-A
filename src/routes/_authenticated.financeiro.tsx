import { createFileRoute } from "@tanstack/react-router";
import { FinanceiroView } from "@/features/financeiro/components/FinanceiroView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/financeiro")({
  component: FinanceiroRoute,
});

function FinanceiroRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "financeiro")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Gestão Financeira e Caixa"
        mensagem="O módulo financeiro não foi atribuído ao seu usuário. Solicite a liberação ao administrador."
      />
    );
  }

  return <FinanceiroView />;
}
