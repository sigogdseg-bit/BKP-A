// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Modal Canônico de Confirmação para Desligar Privacidade
// Exigência canônica: desligar privacidade requer confirmação explícita
// ─────────────────────────────────────────────────────────────────────────────

import { ShieldAlert, AlertTriangle, X } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface ModalConfirmarDesligarPrivacidadeProps {
  aberto: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
  placa?: string;
  identificador?: string;
  carregando?: boolean;
}

export function ModalConfirmarDesligarPrivacidade({
  aberto,
  onFechar,
  onConfirmar,
  placa,
  identificador,
  carregando = false,
}: ModalConfirmarDesligarPrivacidadeProps) {
  if (!aberto) return null;

  const alvo = placa
    ? `veículo (${placa})`
    : identificador
      ? `veículo ${identificador}`
      : "veículo";

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-200 select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget && !carregando) onFechar();
        }}
      >
        <div className="relative w-full max-w-md bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl my-auto max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-y-auto flex flex-col space-y-4 sm:space-y-5">
          {/* Botão Fechar */}
          <button
            type="button"
            onClick={onFechar}
            disabled={carregando}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Ícone de Alerta */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-sm">
              <ShieldAlert className="h-6 w-6 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                Desativar Modo de Privacidade?
              </h3>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                Confirmação Obrigatória
              </span>
            </div>
          </div>

          {/* Explicação da Ação */}
          <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 text-xs text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
            <p>
              Você está prestes a desligar a proteção de privacidade do <strong>{alvo}</strong>.
            </p>
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Ao desativar, a localização geográfica exata em tempo real, trajetos e telemetria
                ficarão
                <strong> visíveis na plataforma de auto-monitoramento</strong>.
              </span>
            </p>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={carregando}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700 transition cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              Cancelar (Manter Sigilo)
            </button>

            <button
              type="button"
              onClick={onConfirmar}
              disabled={carregando}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 shadow-md shadow-amber-600/20 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              {carregando ? <span>Desativando...</span> : <span>Confirmar e Desativar</span>}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
