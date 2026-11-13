import { createFileRoute } from "@tanstack/react-router";
import { ModuloTemasPage } from "@/features/theme/components/ModuloTemasPage";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/configuracao/temas")({
  component: TemasRoute,
});

function TemasRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "temas")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Personalização de Temas"
        mensagem="O módulo de temas e personalização visual não foi atribuído ao seu perfil."
      />
    );
  }

  return <ModuloTemasPage />;
}
