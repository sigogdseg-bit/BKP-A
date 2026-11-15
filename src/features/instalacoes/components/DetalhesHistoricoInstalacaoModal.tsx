import { useState, useEffect } from "react";
import {
  X,
  Clock,
  Wrench,
  Car,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  User,
  CreditCard,
  FileText,
  Boxes,
} from "lucide-react";
import type { Instalacao, InstalacaoHistorico } from "../types";
import { carregarHistoricoInstalacao } from "../services/instalacaoService";
import { listarMovimentacoesEstoque } from "@/features/estoque/services/estoqueService";
import type { MovimentacaoEstoque } from "@/features/estoque/types";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface DetalhesHistoricoInstalacaoModalProps {
  instalacao: Instalacao;
  onReabrir: (instalacao: Instalacao) => void;
  onFechar: () => void;
}

export function DetalhesHistoricoInstalacaoModal({
  instalacao,
  onReabrir,
  onFechar,
}: DetalhesHistoricoInstalacaoModalProps) {
  const [historico, setHistorico] = useState<InstalacaoHistorico[]>([]);
  const [materiaisBaixados, setMateriaisBaixados] = useState<MovimentacaoEstoque[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([
      carregarHistoricoInstalacao(instalacao.id),
      listarMovimentacoesEstoque({ instalacaoId: instalacao.id, tipo: "saida" }),
    ]).then(([resHistorico, resMateriais]) => {
      setHistorico(resHistorico);
      setMateriaisBaixados(resMateriais);
      setCarregando(false);
    });
  }, [instalacao.id]);

  const formatarStatus = (st: string) => {
    switch (st) {
      case "concluida":
        return {
          label: "Concluída com Sucesso",
          cor: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
        };
      case "concluida_com_pendencia":
        return {
          label: "Concluída com Pendência",
          cor: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        };
      case "nao_instalado":
        return {
          label: "Não Instalado",
          cor: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        };
      default:
        return {
          label: st,
          cor: "bg-slate-500/15 text-slate-400 border-slate-500/30",
        };
    }
  };

  const statusAtual = formatarStatus(instalacao.status);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 my-auto">
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                <Wrench className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-sm px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                    {instalacao.placa}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusAtual.cor}`}
                  >
                    {statusAtual.label}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {instalacao.marca} {instalacao.modelo}{" "}
                  {instalacao.ano ? `(${instalacao.ano})` : ""}
                </h2>
              </div>
            </div>

            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Ficha Resumo do Atendimento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Cliente</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate block">
                {instalacao.cliente_nome}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                Instalador
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate block">
                {instalacao.instalador_nome}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                IMEI Rastreador
              </span>
              <span className="font-mono font-bold text-sky-600 dark:text-sky-400 truncate block">
                {instalacao.rastreador_imei}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                Odômetro / KM
              </span>
              <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                {instalacao.km_instalacao} km
              </span>
            </div>
          </div>

          {/* Repasse Financeiro */}
          <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-500" />
              <span className="text-slate-600 dark:text-slate-400 font-medium">
                Repasse da Instalação:
              </span>
              <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-sm">
                R$ {Number(instalacao.valor_instalacao).toFixed(2)}
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                instalacao.status_pagamento === "pago"
                  ? "bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                  : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              }`}
            >
              {instalacao.status_pagamento === "pago" ? "Repasse Pago" : "Pendente de Pagamento"}
            </span>
          </div>

          {/* Materiais e Insumos Baixados do Estoque */}
          {materiaisBaixados.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                  <Boxes className="h-3.5 w-3.5 text-amber-500" /> Insumos Baixados do Estoque
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                  {materiaisBaixados.length} materiais baixados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {materiaisBaixados.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div className="truncate mr-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 truncate block">
                        {m.item?.nome || "Material de Instalação"}
                      </span>
                      {m.item?.codigo_sku && (
                        <span className="text-[10px] font-mono text-slate-500">
                          SKU: {m.item.codigo_sku}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-xs shrink-0">
                      -{m.quantidade} {m.item?.unidade_medida || "un"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linha do Tempo / Histórico de Atendimentos Anteriores */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" /> Linha do Tempo e Atendimentos
              Anteriores
            </div>

            {carregando ? (
              <div className="text-center py-6 text-xs text-slate-500 font-mono">
                Carregando linha do tempo...
              </div>
            ) : historico.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                Nenhum histórico anterior registrado.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {historico.map((h, i) => {
                  const s = formatarStatus(h.status_atendimento);
                  return (
                    <div key={h.id} className="relative text-xs space-y-1">
                      {/* Marcador */}
                      <div
                        className={`absolute -left-6 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-950 ${
                          h.status_atendimento === "concluida"
                            ? "bg-orange-500"
                            : h.status_atendimento === "concluida_com_pendencia"
                              ? "bg-amber-500"
                              : "bg-rose-500"
                        }`}
                      />

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${s.cor}`}
                        >
                          {s.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(h.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      <div className="text-slate-700 dark:text-slate-300 font-medium">
                        Atendido por: <span className="font-bold">{h.instalador_nome}</span> · KM:{" "}
                        <span className="font-mono">{h.km_no_atendimento}</span>
                      </div>

                      {h.motivo && (
                        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-mono">
                          <span className="font-bold">Motivo/Pendência:</span> {h.motivo}
                        </div>
                      )}

                      {h.observacoes && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                          "{h.observacoes}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé de Ações */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onFechar}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center"
            >
              Fechar
            </button>

            {/* Botão de Reabertura */}
            <button
              type="button"
              onClick={() => {
                onFechar();
                onReabrir(instalacao);
              }}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reabrir Atendimento e Sanar Pendência</span>
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
