import { createFileRoute } from "@tanstack/react-router";
import { RastreadorJ16View } from "@/features/seguranca/components/RastreadorJ16View";
import { useAuth } from "@/features/auth/context/AuthContext";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";

export const Route = createFileRoute("/_authenticated/configuracao/rastreador-j16")({
  component: RastreadorJ16Route,
});

function RastreadorJ16Route() {
  const { session } = useAuth();

  const isSuperAdmin = Boolean(session?.isSuperAdmin);
  const isAuditor = Boolean(
    session?.isSuperAdminAuditor || session?.isAuditor || session?.role === "superadmin_auditor",
  );

  if (!isSuperAdmin && !isAuditor) {
    return (
      <AcessoModuloRestrito
        moduloNome="Rastreadores J16 4G"
        mensagem="O módulo de configuração de rastreadores J16 4G e comandos de infraestrutura é de governança do SuperADM e S.adm Auditor."
      />
    );
  }

  return <RastreadorJ16View />;
}
