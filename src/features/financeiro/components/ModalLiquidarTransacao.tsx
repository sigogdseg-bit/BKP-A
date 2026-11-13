import { useEffect, useState } from "react";
import {
  X,
  Building2,
  UserCheck,
  UserCog,
  AlertCircle,
  Loader2,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { FontePagamentoTransacao, StatusRessarcimento, TransacaoFinanceira } from "../types";
import {
  listarResponsaveisPagamento,
  podeLiquidarPeloCliente,
} from "../services/financeiroService";
import { ModalPortal } from "@/shared/components/ModalPortal";

export interface ConfirmacaoLiquidacaoPayload {
  modo: "empresa" | "cliente";
  fontePagamento: FontePagamentoTransacao;
  responsavelPagamentoId?: string | null;
  responsavelPagamentoNome?: string | null;
  statusRessarcimento?: StatusRessarcimento;
}

interface ModalLiquidarTransacaoProps {
  transacao: TransacaoFinanceira | null;
  aberto: boolean;
  responsaveisDisponiveis?: { id: string; nome: string; role: string }[];
  onFechar: () => void;
  onConfirmar: (transacaoId: string, payload: ConfirmacaoLiquidacaoPayload) => Promise<void>;
}

export function ModalLiquidarTransacao({
  transacao,
  aberto,
  responsaveisDisponiveis: responsaveisProp,
  onFechar,
  onConfirmar,
}: ModalLiquidarTransacaoProps) {
  const [salvando, setSalvando] = useState(false);
  const [mostrarPainelAdm, setMostrarPainelAdm] = useState(false);
  const [responsavelPagamentoId, setResponsavelPagamentoId] = useState("");
  const [responsavelPagamentoNome, setResponsavelPagamentoNome] = useState("");
  const [statusRessarcimento, setStatusRessarcimento] = useState<StatusRessarcimento>("pendente");
  const [responsaveisLocais, setResponsaveisLocais] = useState<
    { id: string; nome: string; role: string }[]
  >(responsaveisProp || []);

  useEffect(() => {
    if (responsaveisProp && responsaveisProp.length > 0) {
      setResponsaveisLocais(responsaveisProp);
    }
  }, [responsaveisProp]);

  useEffect(() => {
    if (!aberto) return;
    if (!responsaveisProp || responsaveisProp.length === 0) {
      listarResponsaveisPagamento().then((lista) => {
        if (lista && lista.length > 0) {
          setResponsaveisLocais(lista);
        }
      });
    }
  }, [aberto, responsaveisProp]);

  useEffect(() => {
    if (!aberto || !transacao) return;
    const jaAdm = transacao.fonte_pagamento === "operador_adm";
    setMostrarPainelAdm(jaAdm);
    setResponsavelPagamentoId(transacao.responsavel_pagamento_id || "");
    setResponsavelPagamentoNome(transacao.responsavel_pagamento_nome || "");
    setStatusRessarcimento(
      transacao.status_ressarcimento === "ressarcido" ? "ressarcido" : "pendente",
    );
  }, [aberto, transacao]);

  if (!aberto || !transacao) return null;

  const isSaida = transacao.tipo === "saida";
  const isRepasseInstalador = podeLiquidarPeloCliente(transacao);
  const valorFormatado = Number(transacao.valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleLiquidarEmpresa = async () => {
    try {
      setSalvando(true);
      await onConfirmar(transacao.id, {
        modo: "empresa",
        fontePagamento: "caixa_empresa",
        responsavelPagamentoId: null,
        responsavelPagamentoNome: null,
        statusRessarcimento: "nao_aplicavel",
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  };

  const handleLiquidarAdm = async () => {
    const nomeLimpo = responsavelPagamentoNome.trim();
    if (!responsavelPagamentoId && !nomeLimpo) {
      toast.error("Selecione qual ADM ou operador pagou esta despesa.");
      return;
    }

    const membroSelecionado = responsaveisLocais.find((r) => r.id === responsavelPagamentoId);
    const nomeFinal = nomeLimpo || membroSelecionado?.nome || "ADM / Operador";

    try {
      setSalvando(true);
      await onConfirmar(transacao.id, {
        modo: "empresa",
        fontePagamento: "operador_adm",
        responsavelPagamentoId: responsavelPagamentoId || null,
        responsavelPagamentoNome: nomeFinal,
        statusRessarcimento: statusRessarcimento === "ressarcido" ? "ressarcido" : "pendente",
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  };

  const handleLiquidarCliente = async () => {
    if (!isRepasseInstalador) return;
    try {
      setSalvando(true);
      await onConfirmar(transacao.id, {
        modo: "cliente",
        fontePagamento: "caixa_empresa",
        statusRessarcimento: "nao_aplicavel",
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div
          className="relative w-full max-w-lg bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho do Modal */}
          <div className="p-4 sm:p-5 border-b border-slate-300/70 dark:border-slate-800/80 flex items-center justify-between bg-white/70 dark:bg-slate-950/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight">
                  Liquidação de Lançamento
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isSaida
                    ? "Escolha de qual caixa saiu o pagamento e confirme a baixa"
                    : "Confirme o recebimento no caixa da empresa"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition disabled:opacity-50"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4 max-h-[calc(85vh-130px)] overflow-y-auto custom-scrollbar">
            {/* Card com Detalhes da Transação */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/80 dark:bg-slate-950/60 border border-slate-300/70 dark:border-slate-800/80 space-y-2 shadow-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {transacao.categoria.replace(/_/g, " ")}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    isSaida
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  }`}
                >
                  {isSaida ? (
                    <ArrowDownCircle className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowUpCircle className="h-2.5 w-2.5" />
                  )}
                  {isSaida ? "Saída / Despesa" : "Entrada / Receita"}
                </span>
              </div>

              <div className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200 break-words">
                {transacao.descricao}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/70 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Competência: {transacao.data_competencia?.split("-").reverse().join("/")}
                </span>
                <span
                  className={`font-black font-mono text-sm sm:text-base ${
                    isSaida
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {isSaida ? "- " : "+ "}R$ {valorFormatado}
                </span>
              </div>
            </div>

            {/* Aviso Explicativo Contextual */}
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-300 text-[11px]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-sky-600 dark:text-sky-400" />
              <span>
                {isRepasseInstalador
                  ? "Selecione se o repasse ao instalador saiu do Caixa da Empresa, se foi adiantado por um ADM ou Operador, ou se o cliente pagou diretamente ao instalador."
                  : isSaida
                    ? "Selecione obrigatoriamente de qual caixa saiu o valor desta despesa: Caixa da Empresa ou pago por algum ADM / Operador."
                    : "Confirme abaixo a entrada deste recebimento no Caixa da Empresa."}
              </span>
            </div>

            {/* Opções de Liquidação */}
            <div className="space-y-3">
              {/* Opção 1: Caixa da Empresa (Liquidar pela Empresa) */}
              <div
                onClick={() => !salvando && handleLiquidarEmpresa()}
                className={`group p-3.5 sm:p-4 rounded-2xl bg-white/90 dark:bg-slate-950/70 border border-slate-300/80 dark:border-slate-800/80 hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-md transition cursor-pointer flex items-start gap-3.5 ${
                  salvando ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 group-hover:bg-emerald-500 group-hover:text-slate-950 transition">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                      {isSaida
                        ? "Liquidar pela Empresa (Caixa da Empresa)"
                        : "Confirmar Recebimento (Caixa da Empresa)"}
                    </span>
                    <span
                      className={`font-bold font-mono text-xs ${
                        isSaida
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {isSaida ? "- " : "+ "}R$ {valorFormatado}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {isSaida
                      ? "O pagamento foi feito diretamente pelo Caixa da Empresa. O valor será debitado normalmente no livro-caixa e no fluxo financeiro."
                      : "O valor entrou no Caixa da Empresa e será contabilizado como receita realizada."}
                  </p>
                </div>
              </div>

              {/* Opção 2 (Somente Saídas/Despesas): Pago por ADM / Operador */}
              {isSaida && (
                <div
                  className={`rounded-2xl bg-white/90 dark:bg-slate-950/70 border transition ${
                    mostrarPainelAdm
                      ? "border-indigo-500 shadow-md ring-1 ring-indigo-500/30"
                      : "border-slate-300/80 dark:border-slate-800/80 hover:border-indigo-500/60 hover:shadow-md"
                  } ${salvando ? "opacity-60 pointer-events-none" : ""}`}
                >
                  <div
                    onClick={() => !salvando && setMostrarPainelAdm((prev) => !prev)}
                    className="p-3.5 sm:p-4 cursor-pointer flex items-start gap-3.5 group"
                  >
                    <div className="p-2.5 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition">
                      <UserCog className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                          Pago por ADM / Operador
                        </span>
                        <span className="font-bold font-mono text-xs text-rose-600 dark:text-rose-400">
                          - R$ {valorFormatado}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Um administrador ou operador efetuou o pagamento com recurso próprio.
                        Registra o responsável e o controle de ressarcimento pela empresa.
                      </p>
                    </div>
                  </div>

                  {mostrarPainelAdm && (
                    <div className="px-3.5 sm:px-4 pb-4 pt-3 border-t border-indigo-500/20 space-y-3 bg-indigo-500/5 rounded-b-2xl">
                      <div>
                        <label className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-200 mb-1.5">
                          Qual ADM / Operador realizou este pagamento? *
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={responsavelPagamentoId}
                            onChange={(e) => {
                              const selId = e.target.value;
                              setResponsavelPagamentoId(selId);
                              const item = responsaveisLocais.find((r) => r.id === selId);
                              if (item) {
                                setResponsavelPagamentoNome(item.nome);
                              }
                            }}
                            className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-indigo-500/40 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">Selecione o ADM / Operador...</option>
                            {responsaveisLocais.map((resp) => (
                              <option key={resp.id} value={resp.id}>
                                {resp.nome} ({resp.role.toUpperCase()})
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Ou digite o nome do responsável..."
                            value={responsavelPagamentoNome}
                            onChange={(e) => setResponsavelPagamentoNome(e.target.value)}
                            className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-indigo-500/40 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-200 mb-1.5">
                          Situação do Ressarcimento pela Empresa
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setStatusRessarcimento("pendente")}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition border text-left ${
                              statusRessarcimento === "pendente"
                                ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/50 shadow-xs"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800"
                            }`}
                          >
                            Pendente de Ressarcimento
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusRessarcimento("ressarcido")}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition border text-left ${
                              statusRessarcimento === "ressarcido"
                                ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/50 shadow-xs"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800"
                            }`}
                          >
                            Já Ressarcido / Quitado
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={salvando}
                        onClick={handleLiquidarAdm}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {salvando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        <span>Confirmar Liquidação pelo ADM / Operador</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Opção 3 (ESTRITAMENTE Repasse de Instalação ao Instalador): Liquidado pelo Cliente */}
              {isRepasseInstalador && (
                <div
                  onClick={() => !salvando && handleLiquidarCliente()}
                  className={`group p-3.5 sm:p-4 rounded-2xl bg-white/90 dark:bg-slate-950/70 border-2 border-sky-400/60 dark:border-sky-500/50 hover:border-sky-500 hover:shadow-md transition cursor-pointer flex items-start gap-3.5 ${
                    salvando ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  <div className="p-2.5 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0 group-hover:bg-sky-500 group-hover:text-slate-950 transition">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition">
                          Liquidado pelo Cliente
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                          Zero Impacto
                        </span>
                      </div>
                      <span className="font-bold font-mono text-xs text-slate-600 dark:text-slate-300">
                        R$ 0,00
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      O cliente pagou a taxa de instalação diretamente ao técnico instalador. O
                      valor fica{" "}
                      <strong className="text-slate-800 dark:text-slate-200">zerado</strong> e{" "}
                      <strong className="text-slate-800 dark:text-slate-200">NÃO altera</strong> o
                      saldo nem o fluxo financeiro da empresa.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé do Modal */}
          <div className="p-4 sm:p-5 border-t border-slate-300/70 dark:border-slate-800/80 flex items-center justify-end gap-2 bg-white/70 dark:bg-slate-950/40">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            {salvando && (
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                <span>Processando liquidação...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
