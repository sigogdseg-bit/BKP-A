import { useState, useEffect } from "react";
import {
  DollarSign,
  Loader2,
  Plus,
  X,
  RefreshCw,
  Layers,
  Calendar,
  Globe,
  AlertTriangle,
  Pencil,
  Check,
  CreditCard,
  UserCheck,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import {
  criarTransacaoManual,
  atualizarTransacaoManual,
  buscarTransacaoSemelhante,
  listarResponsaveisPagamento,
} from "../services/financeiroService";
import {
  obterCotacaoDolarHoje,
  converterUsdParaBrl,
  formatarValorMoeda,
} from "../services/cambioService";
import { MoedaInput } from "@/shared/components/MoedaInput";
import { ModalPortal } from "@/shared/components/ModalPortal";
import type {
  CategoriaTransacao,
  StatusTransacao,
  TipoTransacao,
  TransacaoFinanceira,
  ModalidadeDespesa,
  MoedaTransacao,
  FontePagamentoTransacao,
  StatusRessarcimento,
} from "../types";

interface ModalNovaTransacaoProps {
  onFechar: () => void;
  onSucesso: (nova?: TransacaoFinanceira) => void;
  podeRegistrarDespesas?: boolean;
  transacaoParaEditar?: TransacaoFinanceira | null;
}

export function ModalNovaTransacao({
  onFechar,
  onSucesso,
  podeRegistrarDespesas = true,
  transacaoParaEditar = null,
}: ModalNovaTransacaoProps) {
  const isEdicao = Boolean(transacaoParaEditar);
  const dataHojeStr = new Date().toISOString().split("T")[0];

  const [tipo, setTipo] = useState<TipoTransacao>(() => {
    if (transacaoParaEditar) return transacaoParaEditar.tipo;
    return podeRegistrarDespesas ? "saida" : "entrada";
  });
  const [categoria, setCategoria] = useState<CategoriaTransacao>(() => {
    if (transacaoParaEditar) return transacaoParaEditar.categoria;
    return podeRegistrarDespesas ? "chips_conectividade" : "receita_avulsa";
  });
  const [descricao, setDescricao] = useState(() => transacaoParaEditar?.descricao || "");
  const [valor, setValor] = useState<number>(() => {
    if (!transacaoParaEditar) return 0;
    if (transacaoParaEditar.moeda === "USD" && transacaoParaEditar.valor_moeda_original) {
      return Number(transacaoParaEditar.valor_moeda_original);
    }
    return Number(transacaoParaEditar.valor || 0);
  });
  const [dataCompetencia, setDataCompetencia] = useState(
    () => transacaoParaEditar?.data_competencia || dataHojeStr,
  );
  const [dataVencimento, setDataVencimento] = useState(
    () =>
      transacaoParaEditar?.data_vencimento || transacaoParaEditar?.data_competencia || dataHojeStr,
  );
  const [status, setStatus] = useState<StatusTransacao>(
    () => transacaoParaEditar?.status || "concluido",
  );
  const [observacoes, setObservacoes] = useState(() => transacaoParaEditar?.observacoes || "");
  const [salvando, setSalvando] = useState(false);

  // Novos recursos: Moeda Estrangeira e Cotação
  const [moeda, setMoeda] = useState<MoedaTransacao>(() => transacaoParaEditar?.moeda || "BRL");
  const [cotacaoDolar, setCotacaoDolar] = useState<number>(
    () => Number(transacaoParaEditar?.cotacao_moeda) || 5.65,
  );
  const [carregandoCotacao, setCarregandoCotacao] = useState<boolean>(false);
  const [fonteCotacao, setFonteCotacao] = useState<string>("Padrão");

  // Novos recursos: Modalidade (Avulsa, Parcelada, Recorrente)
  const [modalidade, setModalidade] = useState<ModalidadeDespesa>(
    () => transacaoParaEditar?.modalidade || "avulsa",
  );
  const [quantidadeParcelas, setQuantidadeParcelas] = useState<number>(
    () => transacaoParaEditar?.total_parcelas || 10,
  );
  const [tipoValor, setTipoValor] = useState<"parcela" | "total">("parcela");

  // Origem da Verba (Caixa da Empresa vs Operador/ADM) e Ressarcimento
  const [fontePagamento, setFontePagamento] = useState<FontePagamentoTransacao | "">(() =>
    transacaoParaEditar ? transacaoParaEditar.fonte_pagamento || "caixa_empresa" : "",
  );
  const [responsavelPagamentoId, setResponsavelPagamentoId] = useState<string>(
    () => transacaoParaEditar?.responsavel_pagamento_id || "",
  );
  const [responsavelPagamentoNome, setResponsavelPagamentoNome] = useState<string>(
    () => transacaoParaEditar?.responsavel_pagamento_nome || "",
  );
  const [statusRessarcimento, setStatusRessarcimento] = useState<StatusRessarcimento>(
    () => transacaoParaEditar?.status_ressarcimento || "pendente",
  );
  const [dataRessarcimento, setDataRessarcimento] = useState<string>(() =>
    transacaoParaEditar?.data_ressarcimento
      ? transacaoParaEditar.data_ressarcimento.split("T")[0]
      : "",
  );
  const [responsaveisDisponiveis, setResponsaveisDisponiveis] = useState<
    { id: string; nome: string; role: string }[]
  >([]);

  // Escopo de sincronização para despesas ou receitas recorrentes:
  // "somente_esta" altera apenas o lançamento do mês atual; "todas_futuras" sincroniza este e todos os futuros
  const [escopoRecorrencia, setEscopoRecorrencia] = useState<"somente_esta" | "todas_futuras">(
    "todas_futuras",
  );

  const isRecorrente = Boolean(
    modalidade === "recorrente" ||
    transacaoParaEditar?.recorrencia_id ||
    transacaoParaEditar?.observacoes?.includes("[REC:") ||
    transacaoParaEditar?.descricao?.includes("(Recorrente)"),
  );

  useEffect(() => {
    listarResponsaveisPagamento().then((lista) => {
      if (lista && lista.length > 0) {
        setResponsaveisDisponiveis(lista);
      }
    });
  }, []);

  // Sincroniza campos quando uma transação para edição for carregada/alterada
  useEffect(() => {
    if (transacaoParaEditar) {
      setTipo(transacaoParaEditar.tipo);
      setCategoria(transacaoParaEditar.categoria);
      setDescricao(transacaoParaEditar.descricao || "");
      if (transacaoParaEditar.moeda === "USD" && transacaoParaEditar.valor_moeda_original) {
        setValor(Number(transacaoParaEditar.valor_moeda_original));
      } else {
        setValor(Number(transacaoParaEditar.valor || 0));
      }
      setDataCompetencia(transacaoParaEditar.data_competencia || dataHojeStr);
      setDataVencimento(
        transacaoParaEditar.data_vencimento || transacaoParaEditar.data_competencia || dataHojeStr,
      );
      setStatus(transacaoParaEditar.status || "concluido");
      setObservacoes(transacaoParaEditar.observacoes || "");
      setMoeda(transacaoParaEditar.moeda || "BRL");
      let modInicial = transacaoParaEditar.modalidade || "avulsa";
      if (
        modInicial === "avulsa" &&
        (transacaoParaEditar.recorrencia_id ||
          transacaoParaEditar.observacoes?.includes("[REC:") ||
          transacaoParaEditar.descricao?.includes("(Recorrente)"))
      ) {
        modInicial = "recorrente";
      }
      setModalidade(modInicial);
      if (transacaoParaEditar.total_parcelas) {
        setQuantidadeParcelas(transacaoParaEditar.total_parcelas);
      }
      setFontePagamento(transacaoParaEditar.fonte_pagamento || "caixa_empresa");
      setResponsavelPagamentoId(transacaoParaEditar.responsavel_pagamento_id || "");
      setResponsavelPagamentoNome(transacaoParaEditar.responsavel_pagamento_nome || "");
      setStatusRessarcimento(transacaoParaEditar.status_ressarcimento || "pendente");
      setDataRessarcimento(
        transacaoParaEditar.data_ressarcimento
          ? transacaoParaEditar.data_ressarcimento.split("T")[0]
          : "",
      );
    }
  }, [transacaoParaEditar, dataHojeStr]);

  // Carrega cotação do Dólar automaticamente quando selecionar USD
  const carregarCotacao = async () => {
    setCarregandoCotacao(true);
    try {
      const res = await obterCotacaoDolarHoje();
      if (res.cotacao > 0) {
        setCotacaoDolar(res.cotacao);
        setFonteCotacao(res.fonte);
      }
    } catch {
      // Ignora erro e mantém padrão
    } finally {
      setCarregandoCotacao(false);
    }
  };

  useEffect(() => {
    if (moeda === "USD") {
      carregarCotacao();
    }
  }, [moeda]);

  const valorBrlCalculado = moeda === "USD" ? converterUsdParaBrl(valor, cotacaoDolar) : valor;

  const handleTipoChange = (novoTipo: TipoTransacao) => {
    setTipo(novoTipo);
    if (novoTipo === "entrada") {
      setCategoria("receita_avulsa");
      setMoeda("BRL");
    } else {
      setCategoria("chips_conectividade");
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!descricao.trim()) {
      toast.error("Informe uma descrição para o lançamento.");
      return;
    }

    if (valor <= 0) {
      toast.error("O valor deve ser maior que zero.");
      return;
    }

    if (moeda === "USD" && (!cotacaoDolar || cotacaoDolar <= 0)) {
      toast.error("Informe uma cotação válida para o Dólar.");
      return;
    }

    if (tipo === "saida" && !fontePagamento) {
      toast.error(
        "Escolha de qual caixa sai esta despesa (Caixa da Empresa ou Pago por ADM / Operador).",
      );
      return;
    }

    const membroResp = responsaveisDisponiveis.find((r) => r.id === responsavelPagamentoId);
    const responsavelNomeFinal = responsavelPagamentoNome.trim() || membroResp?.nome || "";

    if (
      tipo === "saida" &&
      fontePagamento === "operador_adm" &&
      !responsavelPagamentoId &&
      !responsavelNomeFinal
    ) {
      toast.error("Selecione ou informe qual ADM / Operador pagou esta despesa.");
      return;
    }

    const fonteFinal: FontePagamentoTransacao =
      tipo === "saida" ? (fontePagamento as FontePagamentoTransacao) : "caixa_empresa";

    setSalvando(true);
    try {
      if (isEdicao && transacaoParaEditar) {
        // 1. Verificação preventiva contra lançamentos duplicados (ignorando o registro atual)
        const checkDuplicada = await buscarTransacaoSemelhante({
          tipo,
          descricao: descricao.trim(),
          valor: valorBrlCalculado,
          dataCompetencia,
          idIgnorar: transacaoParaEditar.id,
        });

        if (checkDuplicada.existe && checkDuplicada.transacao) {
          const tExist = checkDuplicada.transacao;
          const confirmou = window.confirm(
            `⚠️ ALERTA DE DUPLICIDADE DETECTADA!\n\nJá existe uma outra ${
              tipo === "saida" ? "despesa" : "receita"
            } cadastrada nesta mesma data (${dataCompetencia}) com a mesma descrição e valor:\n\n• "${
              tExist.descricao
            }" — ${formatarValorMoeda(tExist.valor, "BRL")}\n\nDeseja salvar as alterações mesmo assim?`,
          );
          if (!confirmou) {
            setSalvando(false);
            return;
          }
        }

        // 2. Atualização do lançamento existente
        const res = await atualizarTransacaoManual(transacaoParaEditar.id, {
          tipo,
          categoria,
          descricao: descricao.trim(),
          valor: valorBrlCalculado,
          data_competencia: dataCompetencia,
          data_vencimento: dataVencimento,
          status,
          observacoes: observacoes.trim() || undefined,
          moeda,
          valorMoedaOriginal: moeda === "USD" ? valor : undefined,
          cotacaoMoeda: moeda === "USD" ? cotacaoDolar : undefined,
          fonte_pagamento: fonteFinal,
          responsavel_pagamento_id:
            tipo === "saida" && fonteFinal === "operador_adm"
              ? responsavelPagamentoId || undefined
              : undefined,
          responsavel_pagamento_nome:
            tipo === "saida" && fonteFinal === "operador_adm"
              ? responsavelNomeFinal || undefined
              : undefined,
          status_ressarcimento:
            tipo === "saida" && fonteFinal === "operador_adm"
              ? statusRessarcimento
              : "nao_aplicavel",
          data_ressarcimento:
            tipo === "saida" &&
            fonteFinal === "operador_adm" &&
            statusRessarcimento === "ressarcido"
              ? dataRessarcimento || new Date().toISOString()
              : undefined,
          escopoRecorrencia: isRecorrente ? escopoRecorrencia : undefined,
        });

        if (res.success) {
          toast.success(res.message);
          onSucesso(res.transacao);
        } else {
          toast.error(res.message);
        }
      } else {
        // 1. Verificação preventiva contra lançamentos duplicados
        const checkDuplicada = await buscarTransacaoSemelhante({
          tipo,
          descricao: descricao.trim(),
          valor: valorBrlCalculado,
          dataCompetencia,
        });

        if (checkDuplicada.existe && checkDuplicada.transacao) {
          const tExist = checkDuplicada.transacao;
          const confirmou = window.confirm(
            `⚠️ ALERTA DE DUPLICIDADE DETECTADA!\n\nJá existe uma ${
              tipo === "saida" ? "despesa" : "receita"
            } cadastrada nesta mesma data (${dataCompetencia}) com a mesma descrição e valor:\n\n• "${
              tExist.descricao
            }" — ${formatarValorMoeda(tExist.valor, "BRL")}\n\nDeseja confirmar a inclusão mesmo assim como um lançamento duplicado?`,
          );
          if (!confirmou) {
            setSalvando(false);
            return;
          }
        }

        // 2. Registro do lançamento
        const res = await criarTransacaoManual({
          tipo,
          categoria,
          descricao: descricao.trim(),
          valor: valorBrlCalculado,
          data_competencia: dataCompetencia,
          data_vencimento: dataVencimento,
          status,
          observacoes: observacoes.trim() || undefined,
          modalidade,
          quantidadeParcelas: modalidade === "parcelada" ? quantidadeParcelas : undefined,
          tipoValor,
          moeda,
          valorMoedaOriginal: moeda === "USD" ? valor : undefined,
          cotacaoMoeda: moeda === "USD" ? cotacaoDolar : undefined,
          fonte_pagamento: fonteFinal,
          responsavel_pagamento_id:
            tipo === "saida" && fonteFinal === "operador_adm"
              ? responsavelPagamentoId || undefined
              : undefined,
          responsavel_pagamento_nome:
            tipo === "saida" && fonteFinal === "operador_adm"
              ? responsavelNomeFinal || undefined
              : undefined,
          status_ressarcimento:
            tipo === "saida" && fonteFinal === "operador_adm"
              ? statusRessarcimento
              : "nao_aplicavel",
          data_ressarcimento:
            tipo === "saida" &&
            fonteFinal === "operador_adm" &&
            statusRessarcimento === "ressarcido"
              ? dataRessarcimento || new Date().toISOString()
              : undefined,
        });

        if (res.success) {
          toast.success(res.message);
          onSucesso(res.transacao);
        } else {
          toast.error(res.message);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar transação.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden my-auto flex flex-col transition-colors">
          {/* Header Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div
                className={`h-10 w-10 rounded-2xl flex items-center justify-center shadow-xs shrink-0 ${
                  isEdicao
                    ? "bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400"
                    : "bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400"
                }`}
              >
                {isEdicao ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {isEdicao ? "Editar Lançamento" : "Novo Lançamento Avulso"}
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  {isEdicao
                    ? "Correção ou ajuste dos dados do lançamento no livro-caixa"
                    : "Registro manual de receita ou despesa no livro-caixa"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Formulario com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSalvar} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              {/* Alternador Tipo */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Tipo de Movimentação
                </label>
                {podeRegistrarDespesas ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleTipoChange("entrada")}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        tipo === "entrada"
                          ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40 shadow-xs"
                          : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      + Entrada (Receita)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTipoChange("saida")}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        tipo === "saida"
                          ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40 shadow-xs"
                          : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      - Saída (Despesa)
                    </button>
                  </div>
                ) : (
                  <div className="py-2 px-3 rounded-xl text-xs font-bold bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/40 shadow-xs inline-flex items-center gap-1.5">
                    <span>+ Entrada (Receita)</span>
                  </div>
                )}
              </div>

              {/* Origem da Verba — De qual caixa sai a despesa (Caixa da Empresa vs ADM/Operador) */}
              {tipo === "saida" && (
                <div
                  className={`p-3.5 rounded-2xl bg-white/70 dark:bg-slate-950/60 border space-y-3 shadow-xs ${
                    !fontePagamento
                      ? "border-amber-500/60 dark:border-amber-500/40"
                      : "border-slate-300/60 dark:border-slate-800"
                  }`}
                >
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>De qual caixa sai esta despesa? *</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFontePagamento("caixa_empresa");
                          setStatusRessarcimento("nao_aplicavel");
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                          fontePagamento === "caixa_empresa"
                            ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40 shadow-xs ring-1 ring-orange-500/30"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        Caixa da Empresa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFontePagamento("operador_adm");
                          if (statusRessarcimento === "nao_aplicavel") {
                            setStatusRessarcimento("pendente");
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition border ${
                          fontePagamento === "operador_adm"
                            ? "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/40 shadow-xs ring-1 ring-indigo-500/30"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        Pago por ADM / Operador
                      </button>
                    </div>
                    {!fontePagamento && (
                      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        Selecione obrigatoriamente se o valor sai do Caixa da Empresa ou se foi pago
                        por algum ADM / Operador.
                      </p>
                    )}
                  </div>

                  {fontePagamento === "operador_adm" && (
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-200 mb-1 flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>Quem realizou o pagamento? (Operador ou Administrador)</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <select
                            value={responsavelPagamentoId}
                            onChange={(e) => {
                              const selId = e.target.value;
                              setResponsavelPagamentoId(selId);
                              const item = responsaveisDisponiveis.find((r) => r.id === selId);
                              if (item) setResponsavelPagamentoNome(item.nome);
                            }}
                            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-500/40 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">Selecione o membro da equipe...</option>
                            {responsaveisDisponiveis.map((resp) => (
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
                            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-500/40 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-indigo-900 dark:text-indigo-200 mb-1">
                          Situação do Ressarcimento pela Empresa
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setStatusRessarcimento("pendente")}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                              statusRessarcimento === "pendente"
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50 shadow-xs"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800"
                            }`}
                          >
                            ⏳ Pendente de Ressarcimento (A Devolver)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusRessarcimento("ressarcido");
                              if (!dataRessarcimento) {
                                setDataRessarcimento(new Date().toISOString().split("T")[0]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                              statusRessarcimento === "ressarcido"
                                ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/50 shadow-xs"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800"
                            }`}
                          >
                            ✅ Já Ressarcido / Quitado
                          </button>
                        </div>
                      </div>

                      {statusRessarcimento === "ressarcido" && (
                        <div className="flex items-center gap-2 pt-1 border-t border-indigo-500/20">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            Data do Ressarcimento:
                          </span>
                          <input
                            type="date"
                            value={dataRessarcimento}
                            onChange={(e) => setDataRessarcimento(e.target.value)}
                            className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-indigo-500/40 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Moeda Estrangeira (Dólar USD) — Apenas para Despesas */}
              {tipo === "saida" && (
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      <span>Moeda do Lançamento</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setMoeda("BRL")}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition border ${
                          moeda === "BRL"
                            ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        BRL (R$)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoeda("USD")}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition border ${
                          moeda === "USD"
                            ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        USD (US$)
                      </button>
                    </div>
                  </div>

                  {moeda === "USD" && (
                    <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="text-[11px] font-sans">
                          Cotação Comercial do Dólar ({fonteCotacao}):
                        </span>
                        <button
                          type="button"
                          onClick={carregarCotacao}
                          disabled={carregandoCotacao}
                          className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:text-sky-500 font-bold"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${carregandoCotacao ? "animate-spin" : ""}`}
                          />
                          <span>Atualizar Cotação</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                          1 US$ = R$
                        </span>
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          value={cotacaoDolar || ""}
                          onChange={(e) => setCotacaoDolar(Number(e.target.value))}
                          className="w-28 px-2 py-1 bg-white dark:bg-slate-900 border border-sky-500/40 rounded-lg text-xs text-slate-900 dark:text-sky-200 font-mono font-bold focus:outline-none focus:border-sky-500"
                        />
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                          (editável conforme fatura)
                        </span>
                      </div>

                      {valor > 0 && (
                        <div className="pt-1.5 border-t border-sky-500/20 flex items-center justify-between text-xs font-mono font-bold">
                          <span className="text-slate-700 dark:text-slate-300">
                            Total em Reais (BRL):
                          </span>
                          <span className="text-orange-600 dark:text-orange-400">
                            {formatarValorMoeda(valorBrlCalculado, "BRL")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Modalidade / Periodicidade do Lançamento (Receita ou Despesa) */}
              {isEdicao ? (
                <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 text-xs shadow-xs space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                    Modalidade do Lançamento
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {modalidade === "parcelada" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                        Parcelado ({transacaoParaEditar?.parcela_atual || 1}/
                        {transacaoParaEditar?.total_parcelas || 1})
                      </span>
                    )}
                    {isRecorrente && (
                      <div className="flex flex-col gap-2 w-full mt-1.5 p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-emerald-900 dark:text-orange-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Repeat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            <span className="text-xs font-bold">Lançamento Recorrente Mensal</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/40">
                            Recorrência Ativa
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                          Deseja aplicar as alterações de vencimento e valores apenas neste
                          pagamento ou em todos os futuros?
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setEscopoRecorrencia("somente_esta")}
                            className={`p-2 rounded-xl border text-left transition ${
                              escopoRecorrencia === "somente_esta"
                                ? "bg-white dark:bg-slate-900 border-orange-500 text-orange-700 dark:text-orange-300 shadow-xs ring-1 ring-orange-500 font-bold"
                                : "bg-white/60 dark:bg-slate-950/60 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                            }`}
                          >
                            <div className="text-xs flex items-center gap-1.5">
                              <span>{escopoRecorrencia === "somente_esta" ? "●" : "○"}</span>
                              <span>Somente este pagamento</span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal pl-4 mt-0.5">
                              Altera apenas este registro. Parcelas futuras mantêm a data original.
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEscopoRecorrencia("todas_futuras")}
                            className={`p-2 rounded-xl border text-left transition ${
                              escopoRecorrencia === "todas_futuras"
                                ? "bg-white dark:bg-slate-900 border-orange-500 text-orange-700 dark:text-orange-300 shadow-xs ring-1 ring-orange-500 font-bold"
                                : "bg-white/60 dark:bg-slate-950/60 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                            }`}
                          >
                            <div className="text-xs flex items-center gap-1.5">
                              <span>{escopoRecorrencia === "todas_futuras" ? "●" : "○"}</span>
                              <span>Este e todos os futuros</span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal pl-4 mt-0.5">
                              Altera este registro e sincroniza a nova data em todas as parcelas
                              futuras pendentes.
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                    {(modalidade === "avulsa" || !modalidade) && (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                          Avulso Pontual (1x)
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                          A edição atualizará os valores e dados deste lançamento específico.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Periodicidade do Lançamento
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setModalidade("avulsa")}
                      className={`py-2 px-2 rounded-xl border text-center transition ${
                        modalidade === "avulsa"
                          ? "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600 shadow-xs"
                          : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <div>Avulso (1x)</div>
                      <div className="text-[9px] text-slate-500 font-normal">Pontual único</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalidade("parcelada")}
                      className={`py-2 px-2 rounded-xl border text-center transition ${
                        modalidade === "parcelada"
                          ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40 shadow-xs"
                          : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <div>Parcelado</div>
                      <div className="text-[9px] text-slate-500 font-normal">
                        Prazo fixo (ex: 10x)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalidade("recorrente")}
                      className={`py-2 px-2 rounded-xl border text-center transition ${
                        modalidade === "recorrente"
                          ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40 shadow-xs"
                          : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300/70 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <div>Recorrente</div>
                      <div className="text-[9px] text-slate-500 font-normal">Mensal contínuo</div>
                    </button>
                  </div>

                  {/* Opções de Parcelamento */}
                  {modalidade === "parcelada" && (
                    <div className="p-3 rounded-2xl bg-white/70 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-2.5 text-xs shadow-xs">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase mb-1">
                            Quantidade de Parcelas
                          </label>
                          <input
                            type="number"
                            min={2}
                            max={60}
                            value={quantidadeParcelas}
                            onChange={(e) =>
                              setQuantidadeParcelas(
                                Math.max(2, Math.min(60, Number(e.target.value))),
                              )
                            }
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 font-bold font-mono focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase mb-1">
                            Forma de Cálculo
                          </label>
                          <select
                            value={tipoValor}
                            onChange={(e) => setTipoValor(e.target.value as any)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                          >
                            <option value="parcela">Valor por Parcela</option>
                            <option value="total">Valor Total do Lançamento</option>
                          </select>
                        </div>
                      </div>

                      {valor > 0 && (
                        <div className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-500/10 p-2 rounded-xl border border-sky-500/20">
                          Serão geradas <strong>{quantidadeParcelas} parcelas mensais</strong> de{" "}
                          <strong>
                            {formatarValorMoeda(
                              tipoValor === "total"
                                ? valorBrlCalculado / quantidadeParcelas
                                : valorBrlCalculado,
                              "BRL",
                            )}
                          </strong>{" "}
                          no planejamento financeiro.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Explicação de Lançamento Recorrente */}
                  {modalidade === "recorrente" && (
                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[11px] text-orange-700 dark:text-orange-300">
                      Lançamento contínuo e perpétuo (sem data final). Mantém automaticamente uma
                      janela rolante projetada de 12 meses futuros no fluxo de caixa, renovando-se
                      mês a mês de forma contínua até ser encerrado.
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value as CategoriaTransacao)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                  >
                    {tipo === "entrada" ? (
                      <>
                        <option value="mensalidade">Mensalidade de Cliente</option>
                        <option value="receita_avulsa">Receita Avulsa / Taxa</option>
                        <option value="outros">Outras Entradas</option>
                      </>
                    ) : (
                      <>
                        <option value="chips_conectividade">Chips M2M e Conectividade</option>
                        <option value="repasse_instalador">Repasse Técnico / Instalador</option>
                        <option value="infraestrutura_servidores">
                          Servidores e Nuvem (Cloud)
                        </option>
                        <option value="aquisicao_equipamentos">Aquisição de Rastreadores</option>
                        <option value="material_consumo">Materiais e Ferramentas</option>
                        <option value="despesa_administrativa">Despesas Administrativas</option>
                        <option value="outros">Outras Saídas</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    {moeda === "USD" ? "Valor em Dólar (US$)" : "Valor (R$)"}
                  </label>
                  <MoedaInput
                    value={valor || 0}
                    onChange={setValor}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500 font-mono font-bold shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Descrição do Lançamento
                </label>
                <input
                  type="text"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Fatura mensal operadora Vivo M2M, Compra de chicotes..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Data Competência
                  </label>
                  <input
                    type="date"
                    value={dataCompetencia}
                    onChange={(e) => setDataCompetencia(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 font-mono shadow-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Data Vencimento
                  </label>
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 font-mono shadow-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Situação
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StatusTransacao)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 shadow-xs"
                  >
                    <option value="concluido">Liquidado / Efetivado (Realizado)</option>
                    <option value="pendente">A Liquidar (Previsto / Pendente)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Observações (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Número de nota fiscal, comprovante ou observações contábeis..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-orange-500 resize-none shadow-xs"
                />
              </div>
            </div>

            {/* Rodapé Fixo de Ação */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    {isEdicao ? <Check className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                    <span>{isEdicao ? "Salvar Alterações" : "Confirmar Lançamento"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
