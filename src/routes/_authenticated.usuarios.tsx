import { createFileRoute } from "@tanstack/react-router";
import { UsuariosView } from "@/features/seguranca/components/UsuariosView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosRoute,
});

function UsuariosRoute() {
  const { session, carregando } = useAuth();

  if (carregando) {
    return (
      <div className="py-20 flex justify-center items-center">
        <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Acesso estrito a Administradores e SuperADM
  if (!session?.isAdmin) {
    return (
      <AcessoModuloRestrito
        moduloNome="Gestão de Usuários e Acessos"
        mensagem="O módulo de gerenciamento de contas, credenciais e atribuição de permissões é de governança exclusiva de Administradores."
      />
    );
  }

  return <UsuariosView />;
}
