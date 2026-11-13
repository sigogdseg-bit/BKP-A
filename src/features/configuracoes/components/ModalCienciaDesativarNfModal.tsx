import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X, CheckSquare, Square, ShieldAlert } from "lucide-react";

interface ModalCienciaDesativarNfModalProps {
  aberto: boolean;
  carregando: boolean;
  onFechar: () => void;
  onConfirmar: () => void;
}

export function ModalCienciaDesativarNfModal({
  aberto,
  carregando,
  onFechar,
  onConfirmar,
}: ModalCienciaDesativarNfModalProps) {
  const [cienteMarcado, setCienteMarcado] = useState(false);

  if (!aberto) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ciencia-expurgo-nf"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/40 max-h-[90vh] my-auto flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-rose-100 dark:border-rose-950/40 flex items-center justify-between bg-rose-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="titulo-ciencia-expurgo-nf"
                className="text-sm sm:text-base font-bold text-rose-700 dark:text-rose-400"
              >
                Aviso de Expurgo de Notas Fiscais
              </h2>
              <p className="text-[11px] opacity-70">Termo de ciência para desativação de alertas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={carregando}
            aria-label="Fechar termo de ciência"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com rolagem interna */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs sm:text-sm text-slate-700 dark:text-slate-300">
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex gap-3 text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div className="space-y-1.5 text-xs">
              <p className="font-bold">Exclusão definitiva em 48 horas sem aviso</p>
              <p className="opacity-90 leading-relaxed">
                Ao desativar os alertas, você declara expressa ciência de que qualquer Nota Fiscal
                incluída no sistema pelo motorista ou manutenção terá o prazo improrrogável de{" "}
                <strong>48 horas</strong> para download.
              </p>
              <p className="opacity-90 leading-relaxed">
                Decorrido este prazo sem que o download tenha sido efetuado, o arquivo será{" "}
                <strong>
                  excluído definitivamente do armazenamento seguro sem possibilidade de recuperação
                </strong>{" "}
                e sem emissão de lembretes no WhatsApp ou notificações no sistema.
              </p>
            </div>
          </div>

          {/* Checkbox de Ciência Obrigatória */}
          <button
            type="button"
            onClick={() => setCienteMarcado(!cienteMarcado)}
            className="w-full text-left flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer select-none"
          >
            <div className="mt-0.5 text-rose-600 dark:text-rose-400 shrink-0">
              {cienteMarcado ? (
                <CheckSquare className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5 opacity-40" />
              )}
            </div>
            <span className="text-xs font-semibold leading-relaxed">
              Declaro expressa ciência de que as Notas Fiscais não baixadas em até 48 horas serão
              excluídas definitivamente e de forma irreversível do sistema.
            </span>
          </button>
        </div>

        {/* Rodapé sempre visível */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onFechar}
            disabled={carregando}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!cienteMarcado || carregando}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              cienteMarcado && !carregando
                ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-600/20"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
            }`}
          >
            {carregando ? "Registrando..." : "Confirmar e Desativar Alertas"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
