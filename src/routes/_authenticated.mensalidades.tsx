import { createFileRoute } from "@tanstack/react-router";
import { MensalidadesView } from "@/features/mensalidades/components/MensalidadesView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/mensalidades")({
  component: MensalidadesRoute,
});

function MensalidadesRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "mensalidades")) {
    return (
      <AcessoModuloRestrito
        moduloNome={session?.isCliente ? "Mensalidade" : "Mensalidades e Cobrança"}
        mensagem="O módulo de faturas não está liberado para o seu usuário."
      />
    );
  }

  return <MensalidadesView />;
}
