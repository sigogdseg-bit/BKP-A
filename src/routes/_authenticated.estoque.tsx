import { createFileRoute } from "@tanstack/react-router";
import { EstoqueView } from "@/features/estoque/components/EstoqueView";
import { useAuth } from "@/features/auth/context/AuthContext";
import { podeAcessarModulo } from "@/shared/lib/permissoesModulos";
import { AcessoModuloRestrito } from "@/shared/components/AcessoModuloRestrito";
import { RefreshCw, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estoque")({
  component: EstoqueRoute,
  errorComponent: EstoqueErrorFallback,
});

function EstoqueErrorFallback({ error, reset }: { error: any; reset: () => void }) {
  // Se for erro de chunk obsoleto apos deploy (Vite dynamic import), recarrega automaticamente
  if (
    typeof window !== "undefined" &&
    (error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Importing a module script failed") ||
      error?.message?.includes("error loading dynamically imported module"))
  ) {
    window.location.reload();
    return null;
  }

  return (
    <div className="p-6 max-w-lg mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
        Estoque e Suprimentos
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Ocorreu uma instabilidade temporaria ao carregar a interface de estoque.
      </p>
      <div className="pt-2">
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            } else {
              reset();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Recarregar Modulo</span>
        </button>
      </div>
    </div>
  );
}

function EstoqueRoute() {
  const { session } = useAuth();

  if (!podeAcessarModulo(session, "estoque")) {
    return (
      <AcessoModuloRestrito
        moduloNome="Estoque e Suprimentos"
        mensagem="O módulo de estoque não foi liberado para o seu usuário. Solicite a liberação ao administrador."
      />
    );
  }

  return <EstoqueView />;
}
