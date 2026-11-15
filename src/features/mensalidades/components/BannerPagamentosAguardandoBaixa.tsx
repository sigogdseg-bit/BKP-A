import { useState, useEffect } from "react";
import {
  DollarSign,
  CheckCircle2,
  Eye,
  Clock,
  AlertTriangle,
  FileText,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  obterMensalidadesAguardandoBaixa,
  darBaixaPagamento,
  formatarCompetenciaMensalidade,
  formatarParcelaMensalidade,
} from "../services/mensalidadeService";
import type { MensalidadeItem } from "../types";
import { ModalPortal } from "@/shared/components/ModalPortal";

export function BannerPagamentosAguardandoBaixa() {
  const [faturasPendentes, setFaturasPendentes] = useState<MensalidadeItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [faturaVisualizar, setFaturaVisualizar] = useState<MensalidadeItem | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const carregarPendencias = async () => {
    try {
      const lista = await obterMensalidadesAguardandoBaixa();
      setFaturasPendentes(lista);
    } catch (err) {
      console.warn("Aviso ao buscar pagamentos informados:", err);
    }
  };

  useEffect(() => {
    carregarPendencias();

    // Sincronização em tempo real para reatividade imediata
    const canal = supabase
      .channel("hunter_mensalidades_aguardando_baixa_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensalidades",
        },
        () => {
          carregarPendencias();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  if (faturasPendentes.length === 0) {
    return null;
  }

  const primeira = faturasPendentes[0];
  const qtdTotal = faturasPendentes.length;
  const nomeCliente = primeira.clientes?.nome_razao_social || "Cliente";
  const refTexto =
    primeira.mes_referencia === 0
      ? `Adesão (${primeira.ano_referencia})`
      : formatarCompetenciaMensalidade(primeira.mes_referencia, primeira.ano_referencia);
  const parcelaPrimeira =
    primeira.mes_referencia === 0
      ? ""
      : formatarParcelaMensalidade(primeira.numero_parcela, primeira.total_parcelas);
  const parcelaVisualizar =
    faturaVisualizar && faturaVisualizar.mes_referencia !== 0
      ? formatarParcelaMensalidade(faturaVisualizar.numero_parcela, faturaVisualizar.total_parcelas)
      : "";
  const valorTexto = `R$ ${Number(primeira.valor || 0)
    .toFixed(2)
    .replace(".", ",")}`;

  const handleConfirmarBaixa = async (m: MensalidadeItem) => {
    if (
      !window.confirm(
        `Confirmar a baixa definitiva de pagamento para ${m.clientes?.nome_razao_social || "Cliente"} no valor de R$ ${Number(m.valor).toFixed(2)}?`,
      )
    ) {
      return;
    }

    setProcessandoId(m.id);
    try {
      const ok = await darBaixaPagamento(m.id);
      if (ok) {
        toast.success("Baixa de pagamento confirmada com sucesso!");
        setFaturaVisualizar(null);
        await carregarPendencias();
      } else {
        toast.error("Erro ao registrar a baixa da mensalidade.");
      }
    } catch {
      toast.error("Falha ao confirmar baixa de pagamento.");
    } finally {
      setProcessandoId(null);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-3 sm:px-4 py-2 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-md animate-fadeIn select-none border-b border-orange-500/40">
        <div className="flex items-center gap-2 overflow-hidden w-full sm:w-auto">
          <div className="h-6 w-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
            <DollarSign className="h-4 w-4 text-white" />
          </div>
          <div className="truncate">
            <span className="font-bold uppercase tracking-wider text-[10px] bg-white/20 px-1.5 py-0.5 rounded-md mr-1.5">
              {qtdTotal === 1 ? "Pagamento Informado" : `${qtdTotal} Pagamentos Informados`}
            </span>
            <span className="text-white/95 text-xs">
              <strong>{nomeCliente}</strong> informou pagamento de <strong>{valorTexto}</strong>{" "}
              (Ref: {refTexto}
              {parcelaPrimeira ? ` · Parcela ${parcelaPrimeira}` : ""}).
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          <button
            onClick={() => setFaturaVisualizar(primeira)}
            className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] flex items-center gap-1 transition shadow-xs"
            title="Conferir comprovante e detalhes do pagamento informado"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Conferir Comprovante</span>
          </button>

          <button
            onClick={() => handleConfirmarBaixa(primeira)}
            disabled={processandoId === primeira.id}
            className="px-3 py-1 rounded-lg bg-white text-orange-800 hover:bg-orange-50 font-black text-[11px] flex items-center gap-1 transition shadow-md disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-orange-600" />
            <span>{processandoId === primeira.id ? "Gravando..." : "Confirmar Baixa"}</span>
          </button>
        </div>
      </div>

      {/* Modal de Detalhes e Visualização de Comprovante */}
      {faturaVisualizar && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-300/60 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Conferência de Pagamento Informado
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Verifique as informações do cliente antes de confirmar a baixa
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setFaturaVisualizar(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Dados da Fatura */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Cliente Titular:</span>
                  <strong className="text-slate-900 dark:text-slate-100 font-bold">
                    {faturaVisualizar.clientes?.nome_razao_social || "Cliente"}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">
                    Competência / Referência:
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>
                      {faturaVisualizar.mes_referencia === 0
                        ? `Taxa de Adesão (${faturaVisualizar.ano_referencia})`
                        : formatarCompetenciaMensalidade(
                            faturaVisualizar.mes_referencia,
                            faturaVisualizar.ano_referencia,
                          )}
                    </span>
                    {parcelaVisualizar && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-mono text-[10px]">
                        Parcela {parcelaVisualizar}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Vencimento Registrado:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {faturaVisualizar.data_vencimento
                      ? faturaVisualizar.data_vencimento.split("-").reverse().join("/")
                      : "--/--/----"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400 font-semibold">
                    Valor Original da Cobrança:
                  </span>
                  <span className="text-base font-black font-mono text-orange-600 dark:text-orange-400">
                    R${" "}
                    {Number(faturaVisualizar.valor || 0)
                      .toFixed(2)
                      .replace(".", ",")}
                  </span>
                </div>
                {faturaVisualizar.pagamento_informado_obs && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">
                      Observações do Cliente:
                    </span>
                    <p className="italic bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      {faturaVisualizar.pagamento_informado_obs}
                    </p>
                  </div>
                )}
              </div>

              {/* Visualizador de Comprovante Anexo */}
              {faturaVisualizar.comprovante_url &&
              faturaVisualizar.comprovante_url !== "informado_sem_anexo" ? (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Comprovante Anexado:
                  </span>
                  {faturaVisualizar.comprovante_url.startsWith("data:image/") ||
                  faturaVisualizar.comprovante_url.startsWith("http") ? (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 p-1 flex items-center justify-center max-h-64">
                      <img
                        src={faturaVisualizar.comprovante_url}
                        alt="Comprovante de Pagamento"
                        className="max-h-60 max-w-full object-contain rounded-xl"
                      />
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-orange-500 shrink-0" />
                      <span className="truncate">
                        Comprovante anexado pelo cliente (
                        {faturaVisualizar.comprovante_url.slice(0, 40)}...)
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    O cliente informou o pagamento sem anexo de foto. Confira o extrato bancário
                    antes de dar a baixa.
                  </span>
                </div>
              )}

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setFaturaVisualizar(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmarBaixa(faturaVisualizar)}
                  disabled={processandoId === faturaVisualizar.id}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-md shadow-orange-500/20 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmar Baixa Definitiva</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
