import { ShieldCheck, Lock, EyeOff, Loader2 } from "lucide-react";
import { APP_NOME } from "@/shared/lib/version";

interface OverlayPrivacidadeVeiculoProps {
  placa?: string;
  marcaModelo?: string;
  clienteNome?: string;
  contexto?: "mapa" | "cockpit" | "metricas";
  compacto?: boolean;
  podeAlterar?: boolean;
  onAlternarPrivacidade?: () => void;
  carregandoAlteracao?: boolean;
  bloqueioAdministrativo?: boolean;
  isMotorista?: boolean;
  onAbrirModalBloqueio?: () => void;
}

export function OverlayPrivacidadeVeiculo({
  placa,
  marcaModelo,
  clienteNome,
  contexto = "mapa",
  compacto = false,
  podeAlterar = false,
  onAlternarPrivacidade,
  carregandoAlteracao = false,
  bloqueioAdministrativo = false,
  isMotorista = false,
  onAbrirModalBloqueio,
}: OverlayPrivacidadeVeiculoProps) {
  return (
    <div
      data-testid="overlay-privacidade-veiculo"
      className="absolute inset-0 z-[1500] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md select-none transition-all duration-300 p-4"
    >
      <div className="rounded-3xl border border-rose-500/40 dark:border-rose-500/40 bg-[#f0f4f9] dark:bg-slate-900 p-6 text-center shadow-[10px_10px_28px_#c3cfe2] dark:shadow-2xl max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
          <span
            className={`h-3 w-3 rounded-full ${bloqueioAdministrativo ? "bg-rose-500" : "bg-amber-500"} animate-pulse shrink-0`}
          />
          {bloqueioAdministrativo
            ? `${APP_NOME} — Modo Privado Restrito`
            : `${APP_NOME} — Modo de Privacidade Ativo`}
        </div>

        <div
          className={`mt-3 inline-flex items-center justify-center w-12 h-12 rounded-2xl ${bloqueioAdministrativo ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20" : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"} mx-auto`}
        >
          {bloqueioAdministrativo ? <Lock className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
        </div>

        <div className="mt-3 space-y-1">
          {placa && (
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Veículo: <span className="font-mono text-amber-600 dark:text-amber-400">{placa}</span>
              {marcaModelo ? ` • ${marcaModelo}` : ""}
            </div>
          )}
          {clienteNome && (
            <div className="text-xs text-slate-500 dark:text-slate-400">Cliente: {clienteNome}</div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {bloqueioAdministrativo
            ? isMotorista
              ? "A visualização da localização dos veículos está temporariamente suspensa para a sua frota. Contate o administrador da sua empresa."
              : "A visualização da localização dos rastreadores entrou em modo privado restrito. Regularize sua mensalidade ou contate o SIGO Guardião."
            : contexto === "mapa"
              ? "A localização geográfica no mapa e a movimentação deste veículo estão sob sigilo de privacidade."
              : "O cockpit operacional, as métricas e a telemetria deste veículo estão sob sigilo de privacidade."}
        </p>

        {bloqueioAdministrativo ? (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80">
            {onAbrirModalBloqueio && (
              <button
                type="button"
                onClick={onAbrirModalBloqueio}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-md transition"
              >
                <Lock className="w-4 h-4" />
                {isMotorista ? "Informações de Acesso" : "Regularizar / Contatar SIGO"}
              </button>
            )}
          </div>
        ) : podeAlterar && onAlternarPrivacidade ? (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onAlternarPrivacidade}
              disabled={carregandoAlteracao}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md transition disabled:opacity-50"
            >
              {carregandoAlteracao ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando alteração...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Desmarcar Privacidade
                </>
              )}
            </button>
            <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
              Permite que operadores da central também vejam o mapa deste veículo.
            </p>
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Privacidade Ativa
          </div>
        )}
      </div>
    </div>
  );
}
