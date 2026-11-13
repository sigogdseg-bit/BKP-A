import { createFileRoute } from "@tanstack/react-router";
import { DispositivosView } from "@/features/seguranca/components/DispositivosView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/dispositivos")({
  component: DispositivosRoute,
});

function DispositivosRoute() {
  const { session } = useAuth();

  if (!session?.isAdmin) {
    return (
      <AcessoModuloRestrito
        moduloNome="Dispositivos Autorizados"
        mensagem="O módulo de gerenciamento de dispositivos e confiança móvel é de governança exclusiva de Administradores."
      />
    );
  }

  return <DispositivosView />;
}
