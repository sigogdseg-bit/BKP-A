import { createFileRoute } from "@tanstack/react-router";
import { FuncionariosView } from "@/features/funcionarios/components/FuncionariosView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  component: FuncionariosRoute,
});

function FuncionariosRoute() {
  const { session, carregando } = useAuth();

  if (carregando) {
    return (
      <div className="py-20 flex justify-center items-center">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Acesso exclusivo a Clientes Titulares e Administradores
  if (!session?.isCliente && !session?.isAdmin && !session?.isSuperAdmin) {
    return (
      <AcessoModuloRestrito
        moduloNome="Gestão de Funcionários"
        mensagem="O módulo de gerenciamento de colaboradores e permissões é de acesso exclusivo de clientes titulares e administradores."
      />
    );
  }

  return <FuncionariosView />;
}
