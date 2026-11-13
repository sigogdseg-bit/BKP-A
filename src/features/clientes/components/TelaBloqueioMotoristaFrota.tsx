import { useState } from "react";
import { Lock, LogOut, RefreshCw, ShieldAlert, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { APP_NOME } from "@/shared/lib/version";

interface TelaBloqueioMotoristaFrotaProps {
  onVerificarNovamente: () => Promise<void>;
}

export function TelaBloqueioMotoristaFrota({
  onVerificarNovamente,
}: TelaBloqueioMotoristaFrotaProps) {
  const { session, logout } = useAuth();
  const [verificando, setVerificando] = useState(false);

  const handleChecarLiberacao = async () => {
    setVerificando(true);
    try {
      await onVerificarNovamente();
      toast.info("Verificando se o acesso da frota foi liberado...");
    } catch {
      toast.error("Erro ao verificar liberação de acesso.");
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 select-none animate-fadeIn">
      <div className="w-full max-w-md bg-[#eaf0f8] dark:bg-slate-900/90 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-6 text-slate-800 dark:text-slate-100 text-center">
        {/* Ícone de Alerta */}
        <div className="h-16 w-16 mx-auto rounded-3xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
          <ShieldAlert className="h-8 w-8" />
        </div>

        {/* Badge e Título */}
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            Acesso Temporariamente Suspenso
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            Frota Indisponível
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
            Olá,{" "}
            <strong className="text-slate-800 dark:text-slate-200">
              {session?.nome || "Motorista"}
            </strong>
            . O acesso aos veículos e telemetria da frota está temporariamente suspenso no{" "}
            {APP_NOME}.
          </p>
        </div>

        {/* Caixa de Orientação Direta */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 flex items-center gap-3.5 text-left shadow-xs">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100 block">
              Próximo Passo
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              Contate o administrador da sua empresa para liberação do acesso.
            </p>
          </div>
        </div>

        {/* Ações: Verificar e Sair */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={handleChecarLiberacao}
            disabled={verificando}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${verificando ? "animate-spin" : ""}`} />
            <span>{verificando ? "Consultando Liberação..." : "Verificar Novamente"}</span>
          </button>

          <button
            onClick={() => logout()}
            className="w-full py-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition border border-slate-300/70 dark:border-slate-800 shadow-xs"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair da Conta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
