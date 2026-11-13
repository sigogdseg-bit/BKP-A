import { createFileRoute } from "@tanstack/react-router";
import { LogsView } from "@/features/seguranca/components/LogsView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/configuracao/logs")({
  component: LogsRoute,
});

function LogsRoute() {
  const { session } = useAuth();

  if (!session?.isAdmin && !session?.isOperador) {
    return (
      <AcessoModuloRestrito
        moduloNome="Auditoria Forense e Logs"
        mensagem="O acesso a logs de auditoria e conferência de integridade de documentos é restrito a Operadores e Administradores."
      />
    );
  }

  return <LogsView />;
}
