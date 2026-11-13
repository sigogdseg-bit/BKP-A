import { createFileRoute } from "@tanstack/react-router";
import { ClientesView } from "@/features/clientes/components/ClientesView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { GpsMonitorView } from "@/features/monitor-gps/components/GpsMonitorView";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesRoute,
});

function ClientesRoute() {
  const { session } = useAuth();

  if (session?.isCliente) {
    return <GpsMonitorView />;
  }

  if (!podeAcessarModulo(session, "clientes")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Clientes e Planos"
        mensagem="O módulo de gestão comercial e carteira de clientes não foi atribuído ao seu usuário."
      />
    );
  }

  return <ClientesView />;
}
