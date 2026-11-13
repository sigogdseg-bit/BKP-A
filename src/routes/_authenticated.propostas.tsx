import { createFileRoute } from "@tanstack/react-router";
import { PropostasTab } from "@/features/financeiro/components/PropostasTab";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/propostas")({
  component: PropostasRoute,
});

function PropostasRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "propostas")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Propostas Comerciais"
        mensagem="Voce nao possui permissao para acessar o modulo de propostas comerciais."
      />
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-4 sm:py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-emerald-500" />
            Propostas Comerciais
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestao de propostas, calculos de margem de repasse, geracao de PDFs e envio ao cliente
          </p>
        </div>
      </div>
      <PropostasTab />
    </div>
  );
}
