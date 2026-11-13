import { createFileRoute } from "@tanstack/react-router";
import { InstalacoesView } from "@/features/instalacoes/components/InstalacoesView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/instalacao")({
  component: InstalacaoRoute,
});

function InstalacaoRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "instalacao")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Instalações Técnicas"
        mensagem="O módulo de ordens de serviço e instalações não foi atribuído ao seu usuário."
      />
    );
  }

  return <InstalacoesView />;
}
