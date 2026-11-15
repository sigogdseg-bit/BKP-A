import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ShieldAlert,
  Lock,
  CheckCircle2,
  RefreshCw,
  X,
  Radio,
  MapPin,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { atualizarBloqueioAdministrativoCliente } from "../services/clienteService";
import type { Cliente, StatusBloqueioManual } from "../types";

interface ModalGerenciarBloqueioAdminProps {
  aberto: boolean;
  onFechar: () => void;
  cliente: Cliente | null;
  onSalvo: () => void;
}

export function ModalGerenciarBloqueioAdmin({
  aberto,
  onFechar,
  cliente,
  onSalvo,
}: ModalGerenciarBloqueioAdminProps) {
  const [statusLocalizacao, setStatusLocalizacao] = useState<StatusBloqueioManual>("automatico");
  const [statusAcesso, setStatusAcesso] = useState<StatusBloqueioManual>("automatico");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (cliente) {
      setStatusLocalizacao(cliente.status_bloqueio_localizacao || "automatico");
      setStatusAcesso(cliente.status_bloqueio_acesso || "automatico");
      setMotivo(cliente.motivo_bloqueio_manual || "");
    }
  }, [cliente, aberto]);

  if (!aberto || !cliente) return null;

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const res = await atualizarBloqueioAdministrativoCliente(cliente.id, {
        status_bloqueio_localizacao: statusLocalizacao,
        status_bloqueio_acesso: statusAcesso,
        motivo: motivo.trim() || undefined,
      });

      if (res.success) {
        toast.success("Bloqueios administrativos atualizados com sucesso!");
        onSalvo();
        onFechar();
      } else {
        toast.error(res.message || "Erro ao salvar bloqueios.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Falha na comunicação com o servidor.");
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto bg-slate-950/85 backdrop-blur-md select-none animate-fadeIn">
      <div className="w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col overflow-y-auto text-slate-800 dark:text-slate-100 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-300/60 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Controle de Bloqueio Administrativo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliente:{" "}
                <strong className="text-slate-700 dark:text-slate-200">
                  {cliente.nome_razao_social}
                </strong>
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 1. Bloqueio de Visualização da Localização */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              Visualização de Localização (Modo Privado)
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Define se o cliente e seus motoristas vinculados podem visualizar os rastreadores no
            mapa.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStatusLocalizacao("automatico")}
              className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                statusLocalizacao === "automatico"
                  ? "bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Automático</span>
                {statusLocalizacao === "automatico" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-normal">
                Bloqueia após 5 dias de atraso
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusLocalizacao("bloqueado")}
              className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                statusLocalizacao === "bloqueado"
                  ? "bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Forçar Bloqueio</span>
                {statusLocalizacao === "bloqueado" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-normal">
                Oculta mapa imediatamente
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusLocalizacao("liberado")}
              className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                statusLocalizacao === "liberado"
                  ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300 ring-1 ring-orange-500"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Liberar Visualização</span>
                {statusLocalizacao === "liberado" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-normal">
                Permite ver mesmo em atraso
              </span>
            </button>
          </div>
        </div>

        {/* 2. Bloqueio Total de Login / Acesso */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              Acesso ao Sistema (Login)
            </h4>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Define se o cliente e seus motoristas podem fazer login e navegar na plataforma.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setStatusAcesso("automatico")}
              className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                statusAcesso === "automatico"
                  ? "bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Automático</span>
                {statusAcesso === "automatico" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-normal">
                Bloqueia após 7 dias de atraso
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusAcesso("bloqueado")}
              className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                statusAcesso === "bloqueado"
                  ? "bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Forçar Bloqueio</span>
                {statusAcesso === "bloqueado" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-normal">
                Impede login imediatamente
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusAcesso("liberado")}
              className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition ${
                statusAcesso === "liberado"
                  ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300 ring-1 ring-orange-500"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Liberar Acesso</span>
                {statusAcesso === "liberado" && <CheckCircle2 className="h-3.5 w-3.5" />}
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-normal">
                Permite login mesmo em atraso
              </span>
            </button>
          </div>
        </div>

        {/* Motivo / Justificativa Administrativa */}
        <div className="space-y-1 text-left">
          <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            Justificativa / Observação Administrativa (Opcional):
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ex: Concedida tolerância de 3 dias mediante acordo de pagamento via Pix..."
            className="w-full text-xs p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 shadow-xs"
          />
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${salvando ? "animate-spin" : ""}`} />
            <span>{salvando ? "Salvando..." : "Salvar Configuração"}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
