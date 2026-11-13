import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface AcessoModuloRestritoProps {
  moduloNome?: string;
  mensagem?: string;
}

export function AcessoModuloRestrito({
  moduloNome = "Módulo do Sistema",
  mensagem = "Este módulo não está liberado para o seu perfil. Entre em contato com a administração para solicitar acesso.",
}: AcessoModuloRestritoProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-xl space-y-5">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Acesso Restrito
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">{moduloNome}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{mensagem}</p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link
            to="/inicio"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition shadow-sm"
          >
            <Home className="w-4 h-4" />
            Ir para Início
          </Link>
          <button
            onClick={() => window.history.back()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
