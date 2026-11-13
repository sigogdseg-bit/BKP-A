import { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  CheckCircle2,
  Clock,
  Plus,
  FileText,
  FileSpreadsheet,
  RotateCcw,
  Trash2,
  PieChart,
  Percent,
  StopCircle,
  AlertCircle,
  ShieldAlert,
  Calendar,
  BarChart3,
  Pencil,
  Receipt,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { TiltCard } from "@/shared/components/TiltCard";
import { formatarParcelaMensalidade } from "@/features/mensalidades/services/mensalidadeService";
import {
  listarTransacoes,
  listarClientesInadimplentes,
  calcularResumoFluxoCaixa,
  calcularDREOperacional,
  calcularResumoRessarcimento,
  efetivarRessarcimento,
  exportarRelatorioRessarcimentoPDF,
  exportarRelatorioRessarcimentoExcel,
  listarResponsaveisPagamento,
  atualizarStatusTransacao,
  excluirTransacao,
  exportarRelatorioPDF,
  exportarRelatorioExcel,
  encerrarDespesaRecorrente,
} from "../services/financeiroService";
import { calcularSaldoAnteriorTransportado } from "../services/projecaoFinanceiraService";
import { formatarValorMoeda } from "../services/cambioService";
import type {
  TransacaoFinanceira,
  FiltrosFinanceiro,
  ClienteInadimplente,
  ResumoRessarcimento,
} from "../types";
import { APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";
import { ModalNovaTransacao } from "./ModalNovaTransacao";
import {
  ModalLiquidarTransacao,
  type ConfirmacaoLiquidacaoPayload,
} from "./ModalLiquidarTransacao";
import { ClientesInadimplentesTab } from "./ClientesInadimplentesTab";
import { EstatisticasFinanceirasTab } from "./EstatisticasFinanceirasTab";
import { PropostasTab } from "./PropostasTab";

export function FinanceiroView() {
  const { session } = useAuth();
  const isOperador = Boolean(session?.role === "operador" && !session?.isAdmin);
  const podeVerCustosEFornecedores = Boolean(session?.isSuperAdmin || session?.isAdmin);
  const [abaAtiva, setAbaAtiva] = useState<
    "fluxo" | "inadimplentes" | "estatisticas" | "propostas"
  >(() => (session?.role === "operador" && !session?.isAdmin ? "inadimplentes" : "fluxo"));
  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [inadimplentes, setInadimplentes] = useState<ClienteInadimplente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalNovo, setModalNovo] = useState(false);
  const [transacaoParaEditar, setTransacaoParaEditar] = useState<TransacaoFinanceira | null>(null);
  const [transacaoParaLiquidar, setTransacaoParaLiquidar] = useState<TransacaoFinanceira | null>(
    null,
  );
  const [exportando, setExportando] = useState(false);

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const [filtros, setFiltros] = useState<FiltrosFinanceiro>({
    busca: "",
    periodo: "mes_atual",
    mes: String(mesAtual),
    ano: String(anoAtual),
    tipo: "todos",
    categoria: "todas",
    status: "todos",
    fonte_pagamento: "todas",
    responsavel_pagamento_id: "",
    status_ressarcimento: "todos",
  });

  const [responsaveisDisponiveis, setResponsaveisDisponiveis] = useState<
    { id: string; nome: string; role: string }[]
  >([]);

  useEffect(() => {
    listarResponsaveisPagamento().then((res) => {
      if (res && res.length > 0) {
        setResponsaveisDisponiveis(res);
      }
    });
  }, []);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    const anoCorrente = new Date().getFullYear();
    anos.add(anoCorrente);
    anos.add(anoCorrente + 1);
    anos.add(anoCorrente - 1);
    transacoes.forEach((t) => {
      if (t.data_competencia) {
        const ano = parseInt(t.data_competencia.split("-")[0], 10);
        if (!isNaN(ano) && ano > 2000) anos.add(ano);
      }
    });
    return Array.from(anos).sort((a, b) => b - a);
  }, [transacoes]);

  const MESES = [
    { valor: "todos", rotulo: "Todos os Meses" },
    { valor: "1", rotulo: "01 - Janeiro" },
    { valor: "2", rotulo: "02 - Fevereiro" },
    { valor: "3", rotulo: "03 - Marco" },
    { valor: "4", rotulo: "04 - Abril" },
    { valor: "5", rotulo: "05 - Maio" },
    { valor: "6", rotulo: "06 - Junho" },
    { valor: "7", rotulo: "07 - Julho" },
    { valor: "8", rotulo: "08 - Agosto" },
    { valor: "9", rotulo: "09 - Setembro" },
    { valor: "10", rotulo: "10 - Outubro" },
    { valor: "11", rotulo: "11 - Novembro" },
    { valor: "12", rotulo: "12 - Dezembro" },
  ];

  const handleMudarPeriodo = (novoPeriodo: string) => {
    const dHoje = new Date();
    const aAtual = dHoje.getFullYear();
    const mAtual = dHoje.getMonth() + 1;

    if (novoPeriodo === "mes_atual") {
      setFiltros((prev) => ({
        ...prev,
        periodo: "mes_atual",
        ano: String(aAtual),
        mes: String(mAtual),
      }));
    } else if (novoPeriodo === "mes_proximo") {
      const prox = new Date(aAtual, mAtual, 1);
      setFiltros((prev) => ({
        ...prev,
        periodo: "mes_proximo",
        ano: String(prox.getFullYear()),
        mes: String(prox.getMonth() + 1),
      }));
    } else if (novoPeriodo === "ano_atual") {
      setFiltros((prev) => ({
        ...prev,
        periodo: "ano_atual",
        ano: String(aAtual),
        mes: "todos",
      }));
    } else if (novoPeriodo === "todos") {
      setFiltros((prev) => ({
        ...prev,
        periodo: "todos",
        ano: "todos",
        mes: "todos",
      }));
    } else {
      setFiltros((prev) => ({
        ...prev,
        periodo: novoPeriodo,
      }));
    }
  };

  const handleMudarMes = (novoMes: string) => {
    setFiltros((prev) => {
      const novoFiltro = { ...prev, mes: novoMes };
      const dHoje = new Date();
      const aAtual = dHoje.getFullYear();
      const mAtual = dHoje.getMonth() + 1;
      const prox = new Date(aAtual, mAtual, 1);

      if (novoMes === String(mAtual) && (prev.ano === String(aAtual) || !prev.ano)) {
        novoFiltro.periodo = "mes_atual";
      } else if (
        novoMes === String(prox.getMonth() + 1) &&
        prev.ano === String(prox.getFullYear())
      ) {
        novoFiltro.periodo = "mes_proximo";
      } else if (novoMes === "todos" && (prev.ano === String(aAtual) || !prev.ano)) {
        novoFiltro.periodo = "ano_atual";
      } else if (novoMes === "todos" && prev.ano === "todos") {
        novoFiltro.periodo = "todos";
      } else {
        novoFiltro.periodo = "personalizado";
      }
      return novoFiltro;
    });
  };

  const handleMudarAno = (novoAno: string) => {
    setFiltros((prev) => {
      const novoFiltro = { ...prev, ano: novoAno };
      const dHoje = new Date();
      const aAtual = dHoje.getFullYear();
      const mAtual = dHoje.getMonth() + 1;
      const prox = new Date(aAtual, mAtual, 1);

      if ((prev.mes === String(mAtual) || !prev.mes) && novoAno === String(aAtual)) {
        novoFiltro.periodo = "mes_atual";
      } else if (
        prev.mes === String(prox.getMonth() + 1) &&
        novoAno === String(prox.getFullYear())
      ) {
        novoFiltro.periodo = "mes_proximo";
      } else if (prev.mes === "todos" && novoAno === String(aAtual)) {
        novoFiltro.periodo = "ano_atual";
      } else if (prev.mes === "todos" && novoAno === "todos") {
        novoFiltro.periodo = "todos";
      } else {
        novoFiltro.periodo = "personalizado";
      }
      return novoFiltro;
    });
  };

  const carregar = async () => {
    setCarregando(true);
    try {
      const [dadosTrans, dadosInad] = await Promise.all([
        listarTransacoes(),
        listarClientesInadimplentes(),
      ]);
      setTransacoes(dadosTrans);
      setInadimplentes(dadosInad);
    } catch (err) {
      console.error("Falha ao carregar livro-caixa ou inadimplentes:", err);
    } finally {
      setCarregando(false);
    }
  };

  const handleLiquidarMensalidade = async (mensalidadeId: string) => {
    const { error } = await supabase
      .from("mensalidades")
      .update({
        status: "pago",
        data_pagamento: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", mensalidadeId);

    if (error) {
      throw error;
    }
  };

  useEffect(() => {
    carregar();

    // Sincronizacao em tempo real via canais do Supabase Realtime
    const canalTrans = supabase
      .channel("hunter_financeiro_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transacoes_financeiras" },
        () => carregar(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "mensalidades" }, () =>
        carregar(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "instalacoes" }, () =>
        carregar(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalTrans);
    };
  }, []);

  const handleLiquidar = (t: TransacaoFinanceira) => {
    setTransacaoParaLiquidar(t);
  };

  const handleConfirmarLiquidacao = async (id: string, payload: ConfirmacaoLiquidacaoPayload) => {
    const isCliente = payload.modo === "cliente";
    const ok = await atualizarStatusTransacao(id, "concluido", {
      liquidadoPeloCliente: isCliente,
      fontePagamento: payload.fontePagamento,
      responsavelPagamentoId: payload.responsavelPagamentoId,
      responsavelPagamentoNome: payload.responsavelPagamentoNome,
      statusRessarcimento: payload.statusRessarcimento,
    });
    if (ok) {
      if (isCliente) {
        toast.success(
          "Lançamento liquidado como pago diretamente pelo cliente (R$ 0,00) sem impacto no financeiro!",
        );
      } else if (payload.fontePagamento === "operador_adm") {
        const respNome = payload.responsavelPagamentoNome || "ADM / Operador";
        const sitMsg =
          payload.statusRessarcimento === "ressarcido"
            ? "já ressarcido"
            : "pendente de ressarcimento";
        toast.success(`Despesa liquidada por ${respNome} (${sitMsg})!`);
      } else {
        toast.success("Transação liquidada com sucesso pela empresa!");
      }
      carregar();
    } else {
      toast.error("Erro ao liquidar transação.");
    }
  };

  const handleReabrir = async (id: string) => {
    if (!window.confirm("Deseja reverter esta transacao para pendente?")) return;
    const ok = await atualizarStatusTransacao(id, "pendente");
    if (ok) {
      toast.success("Transacao reaberta como pendente.");
      carregar();
    } else {
      toast.error("Erro ao alterar status.");
    }
  };

  const handleExcluir = async (id: string) => {
    if (!window.confirm("Deseja excluir este lancamento do livro-caixa?")) return;
    const ok = await excluirTransacao(id);
    if (ok) {
      toast.success("Lancamento removido com sucesso.");
      carregar();
    } else {
      toast.error("Erro ao excluir lancamento.");
    }
  };

  const handleEncerrarRecorrencia = async (recorrenciaId: string) => {
    if (
      !window.confirm(
        "Deseja encerrar esta recorrência? Todas as prestações futuras não quitadas serão excluídas do sistema e o histórico já quitado será preservado.",
      )
    )
      return;
    const res = await encerrarDespesaRecorrente(recorrenciaId);
    if (res && res.success) {
      toast.success(res.message);
      carregar();
    } else {
      toast.error(res?.message || "Erro ao encerrar recorrência.");
    }
  };

  // Filtragem
  const filtradas = useMemo(() => {
    const hojeData = new Date();
    const aAtual = hojeData.getFullYear();
    const mAtual = hojeData.getMonth() + 1;
    const mesStr = `${aAtual}-${String(mAtual).padStart(2, "0")}`;
    const anoStr = `${aAtual}`;

    const proxData = new Date(aAtual, mAtual, 1);
    const proximoMesStr = `${proxData.getFullYear()}-${String(proxData.getMonth() + 1).padStart(
      2,
      "0",
    )}`;

    return transacoes.filter((t) => {
      // Filtro de busca
      if (filtros.busca) {
        const termo = filtros.busca.toLowerCase();
        const matchDesc = t.descricao.toLowerCase().includes(termo);
        const matchCli = t.clientes?.nome_razao_social?.toLowerCase().includes(termo);
        const matchInst = t.instalador?.nome?.toLowerCase().includes(termo);
        if (!matchDesc && !matchCli && !matchInst) return false;
      }

      // Filtro por Ano e Mes especificos
      if (t.data_competencia) {
        const partes = t.data_competencia.split("-");
        const anoTrans = partes[0];
        const mesTrans = String(parseInt(partes[1], 10));

        if (filtros.ano && filtros.ano !== "todos" && anoTrans !== filtros.ano) {
          return false;
        }

        if (filtros.mes && filtros.mes !== "todos" && mesTrans !== filtros.mes) {
          return false;
        }
      }

      // Salvaguarda caso periodo seja informado sem ano/mes definidos
      if (!filtros.ano && !filtros.mes) {
        if (filtros.periodo === "mes_atual") {
          if (!t.data_competencia.startsWith(mesStr)) return false;
        } else if (filtros.periodo === "mes_proximo") {
          if (!t.data_competencia.startsWith(proximoMesStr)) return false;
        } else if (filtros.periodo === "ano_atual") {
          if (!t.data_competencia.startsWith(anoStr)) return false;
        }
      }

      // Regra Hunter: Operador não deve ver fornecedor nem valores de custos
      if (!podeVerCustosEFornecedores && t.tipo === "saida") return false;

      // Filtro de tipo
      if (filtros.tipo !== "todos" && t.tipo !== filtros.tipo) return false;

      // Filtro de categoria
      if (filtros.categoria !== "todas" && t.categoria !== filtros.categoria) return false;

      // Filtro de status
      if (filtros.status !== "todos" && t.status !== filtros.status) return false;

      // Filtro de Origem da Verba (Caixa da Empresa vs Operador/ADM)
      if (filtros.fonte_pagamento && filtros.fonte_pagamento !== "todas") {
        if (t.tipo !== "saida") return false;
        if (t.fonte_pagamento !== filtros.fonte_pagamento) return false;
      }

      // Filtro de Responsável específico
      if (filtros.responsavel_pagamento_id) {
        if (t.tipo !== "saida") return false;
        const matchId = t.responsavel_pagamento_id === filtros.responsavel_pagamento_id;
        const matchNome = t.responsavel_pagamento_nome === filtros.responsavel_pagamento_id;
        if (!matchId && !matchNome) return false;
      }

      // Filtro de Situação de Ressarcimento
      if (filtros.status_ressarcimento && filtros.status_ressarcimento !== "todos") {
        if (t.tipo !== "saida" || t.fonte_pagamento !== "operador_adm") return false;
        if (t.status_ressarcimento !== filtros.status_ressarcimento) return false;
      }

      return true;
    });
  }, [transacoes, filtros, podeVerCustosEFornecedores]);

  const saldoAnteriorTransportado = useMemo(() => {
    return calcularSaldoAnteriorTransportado(transacoes, filtros.ano, filtros.mes);
  }, [transacoes, filtros.ano, filtros.mes]);

  const resumo = useMemo(() => {
    return calcularResumoFluxoCaixa(filtradas, saldoAnteriorTransportado);
  }, [filtradas, saldoAnteriorTransportado]);

  const dre = useMemo(() => {
    return calcularDREOperacional(filtradas);
  }, [filtradas]);

  const resumoRessarcimento = useMemo(() => {
    return calcularResumoRessarcimento(filtradas);
  }, [filtradas]);

  const handleRessarcir = async (transacao: TransacaoFinanceira) => {
    const nomeResp = transacao.responsavel_pagamento_nome || "operador/administrador";
    const valorFmt = formatarValorMoeda(transacao.valor, "BRL");
    if (
      !window.confirm(
        `Confirmar ressarcimento de ${valorFmt} para ${nomeResp}?\n\nEsta despesa será marcada como quitada com o responsável.`,
      )
    ) {
      return;
    }

    const res = await efetivarRessarcimento(transacao.id);
    if (res.success) {
      toast.success(res.message);
      carregar();
    } else {
      toast.error(res.message);
    }
  };

  const handleExportarRessarcimentoPDF = async () => {
    setExportando(true);
    try {
      const respNome =
        responsaveisDisponiveis.find((r) => r.id === filtros.responsavel_pagamento_id)?.nome ||
        filtros.responsavel_pagamento_id;
      await exportarRelatorioRessarcimentoPDF(
        filtradas,
        session?.nome || "Administração",
        respNome,
      );
      toast.success("Relatório de Ressarcimento em PDF gerado com sucesso!");
    } catch (err) {
      console.error("Erro ao exportar PDF de ressarcimento:", err);
      toast.error("Falha na geração do PDF de ressarcimento.");
    } finally {
      setExportando(false);
    }
  };

  const handleExportarRessarcimentoExcel = async () => {
    try {
      const respNome =
        responsaveisDisponiveis.find((r) => r.id === filtros.responsavel_pagamento_id)?.nome ||
        filtros.responsavel_pagamento_id;
      await exportarRelatorioRessarcimentoExcel(filtradas, respNome);
      toast.success("Planilha de Ressarcimentos exportada com sucesso!");
    } catch (err) {
      console.error("Erro ao exportar Excel de ressarcimento:", err);
      toast.error("Falha na geração da planilha de ressarcimento.");
    }
  };

  const handleExportarPDF = async () => {
    setExportando(true);
    try {
      await exportarRelatorioPDF(filtradas, resumo, dre, session?.nome || "Administração");
      toast.success("Relatorio PDF Oficial gerado com sucesso!");
    } catch (err) {
      console.error("Erro ao exportar PDF:", err);
      toast.error("Falha na geracao do PDF.");
    } finally {
      setExportando(false);
    }
  };

  const handleExportarExcel = async () => {
    setExportando(true);
    try {
      await exportarRelatorioExcel(filtradas, resumo, dre);
      toast.success("Planilha Excel gerada com sucesso!");
    } catch (err) {
      console.error("Erro ao exportar Excel:", err);
      toast.error("Falha na geracao da planilha Excel.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
              {isOperador
                ? "Gestão Financeira — Inadimplentes e Propostas"
                : "Gestão Financeira e Fluxo de Caixa"}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {isOperador
                ? "Cobrança de clientes inadimplentes e elaboração de propostas comerciais"
                : "Controle unificado de receitas, despesas, repasses, conciliação e DRE"}
            </p>
          </div>
        </div>

        {!isOperador && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportarPDF}
              disabled={exportando || filtradas.length === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 shadow-xs"
            >
              <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>PDF Oficial</span>
            </button>

            <button
              onClick={handleExportarExcel}
              disabled={exportando || filtradas.length === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 shadow-xs"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Excel</span>
            </button>

            {podeVerCustosEFornecedores && (
              <button
                onClick={handleExportarRessarcimentoPDF}
                disabled={exportando}
                title="Emitir Relatório de Ressarcimento de Despesas com Termo de Quitação"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-950 border border-indigo-500/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition disabled:opacity-50 shadow-xs"
              >
                <Receipt className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Ressarcimentos (PDF)</span>
              </button>
            )}

            <button
              onClick={() => {
                setTransacaoParaEditar(null);
                setModalNovo(true);
              }}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Lançamento</span>
            </button>
          </div>
        )}
      </div>

      {/* Seletor de Abas Responsivo Sem Rolagem Horizontal */}
      <div
        className={`grid ${
          isOperador ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
        } gap-2 p-1.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none w-full`}
      >
        {!isOperador && (
          <button
            onClick={() => setAbaAtiva("fluxo")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition min-h-[44px] text-center ${
              abaAtiva === "fluxo"
                ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50"
            }`}
          >
            <Wallet className="h-4 w-4 shrink-0" />
            <span>Livro-Caixa</span>
          </button>
        )}

        <button
          onClick={() => setAbaAtiva("inadimplentes")}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition min-h-[44px] text-center ${
            abaAtiva === "inadimplentes"
              ? "bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50"
          }`}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Inadimplentes</span>
          {inadimplentes.length > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                abaAtiva === "inadimplentes"
                  ? "bg-rose-700 text-white shadow-xs"
                  : "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40"
              }`}
            >
              {inadimplentes.length}
            </span>
          )}
        </button>

        {!isOperador && (
          <button
            onClick={() => setAbaAtiva("estatisticas")}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition min-h-[44px] text-center ${
              abaAtiva === "estatisticas"
                ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50"
            }`}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>Estatísticas</span>
          </button>
        )}

        <button
          onClick={() => setAbaAtiva("propostas")}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition min-h-[44px] text-center ${
            abaAtiva === "propostas"
              ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/50"
          }`}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span>Montar Proposta</span>
        </button>
      </div>

      {abaAtiva === "propostas" ? (
        <PropostasTab />
      ) : abaAtiva === "inadimplentes" || isOperador ? (
        <ClientesInadimplentesTab
          clientesInadimplentes={inadimplentes}
          carregando={carregando}
          onAtualizar={carregar}
          onLiquidarMensalidade={handleLiquidarMensalidade}
          chavePixPadrao={APP_CHAVE_PIX_PADRAO}
        />
      ) : abaAtiva === "estatisticas" ? (
        <EstatisticasFinanceirasTab
          transacoes={
            podeVerCustosEFornecedores ? transacoes : transacoes.filter((t) => t.tipo !== "saida")
          }
          onSelecionarMes={(ano, mes) => {
            setFiltros((prev) => ({
              ...prev,
              ano: String(ano),
              mes: String(mes),
              periodo: "personalizado",
            }));
            setAbaAtiva("fluxo");
          }}
        />
      ) : (
        <>
          {/* Cards de Resumo Executivo (Infográficos Ativos com Filtros) */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              podeVerCustosEFornecedores ? "lg:grid-cols-5" : "lg:grid-cols-2"
            } gap-3`}
          >
            {/* Saldo em Caixa */}
            <TiltCard
              maxTilt={6}
              spotlightColor="rgba(16, 185, 129, 0.35)"
              onClick={() => setFiltros((f) => ({ ...f, tipo: "todos", status: "todos" }))}
              title="Clique para ver todas as movimentações de caixa"
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" && setFiltros((f) => ({ ...f, tipo: "todos", status: "todos" }))
              }
              className={`p-4 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                filtros.tipo === "todos" && filtros.status === "todos"
                  ? "bg-emerald-500/10 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                  : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-slate-400 dark:hover:border-slate-700 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
              }`}
            >
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs mb-1">
                <span className="flex items-center gap-1 font-semibold">
                  <span>
                    {podeVerCustosEFornecedores ? "Saldo em Caixa" : "Receitas Realizadas"}
                  </span>
                  {filtros.tipo === "todos" && filtros.status === "todos" && (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold uppercase">
                      (Ativo)
                    </span>
                  )}
                </span>
                <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div
                  className={`text-xl sm:text-2xl font-black font-mono ${
                    resumo.saldoAtual >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  R${" "}
                  {podeVerCustosEFornecedores
                    ? resumo.saldoAtual.toFixed(2)
                    : resumo.entradasRealizadas.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 flex flex-col gap-0.5 border-t border-slate-300/60 dark:border-slate-800/60 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span>{podeVerCustosEFornecedores ? "Líquido do mês:" : "Total do mês:"}</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                      R${" "}
                      {podeVerCustosEFornecedores
                        ? (resumo.entradasRealizadas - resumo.saidasRealizadas).toFixed(2)
                        : resumo.entradasRealizadas.toFixed(2)}
                    </span>
                  </div>
                  {podeVerCustosEFornecedores && saldoAnteriorTransportado !== 0 && (
                    <div className="flex items-center justify-between text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                      <span>Caixa Anterior:</span>
                      <span className="font-mono">
                        {saldoAnteriorTransportado >= 0 ? "+" : ""}R${" "}
                        {saldoAnteriorTransportado.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {resumo.saldoProjetadoFinal !== undefined && (
                    <div className="flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400/90 font-semibold">
                      <span>
                        {podeVerCustosEFornecedores ? "Projetado Fim Mês:" : "Previsão a Receber:"}
                      </span>
                      <span className="font-mono">
                        R${" "}
                        {podeVerCustosEFornecedores
                          ? resumo.saldoProjetadoFinal.toFixed(2)
                          : (resumo.entradasRealizadas + resumo.entradasPrevistas).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </TiltCard>

            {/* Entradas */}
            <TiltCard
              maxTilt={6}
              spotlightColor="rgba(16, 185, 129, 0.35)"
              onClick={() =>
                setFiltros((f) => ({ ...f, tipo: f.tipo === "entrada" ? "todos" : "entrada" }))
              }
              title="Clique para filtrar apenas entradas (receitas)"
              role="button"
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                setFiltros((f) => ({ ...f, tipo: f.tipo === "entrada" ? "todos" : "entrada" }))
              }
              className={`p-4 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                filtros.tipo === "entrada"
                  ? "bg-emerald-500/15 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                  : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-emerald-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
              }`}
            >
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs mb-1">
                <span className="font-semibold flex items-center gap-1">
                  <span>Entradas (Receitas)</span>
                  {filtros.tipo === "entrada" && (
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-300 font-bold uppercase">
                      (Ativo)
                    </span>
                  )}
                </span>
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  R$ {resumo.entradasRealizadas.toFixed(2)}
                </div>
                <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 flex items-center gap-1">
                  <span>+ R$ {resumo.entradasPrevistas.toFixed(2)} a receber</span>
                </div>
              </div>
            </TiltCard>

            {/* Saídas e Resultado (Restritos à Administração) */}
            {podeVerCustosEFornecedores && (
              <>
                {/* Saidas */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(244, 63, 94, 0.35)"
                  onClick={() =>
                    setFiltros((f) => ({ ...f, tipo: f.tipo === "saida" ? "todos" : "saida" }))
                  }
                  title="Clique para filtrar apenas saídas (despesas)"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    setFiltros((f) => ({ ...f, tipo: f.tipo === "saida" ? "todos" : "saida" }))
                  }
                  className={`p-4 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                    filtros.tipo === "saida"
                      ? "bg-rose-500/15 border-rose-500/80 ring-2 ring-rose-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-rose-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                  }`}
                >
                  <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs mb-1">
                    <span className="font-semibold flex items-center gap-1">
                      <span>Saídas (Despesas)</span>
                      {filtros.tipo === "saida" && (
                        <span className="text-[9px] text-rose-600 dark:text-rose-300 font-bold uppercase">
                          (Ativo)
                        </span>
                      )}
                    </span>
                    <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-black font-mono text-rose-600 dark:text-rose-400">
                      R$ {resumo.saidasRealizadas.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5 flex items-center gap-1">
                      <span>- R$ {resumo.saidasPrevistas.toFixed(2)} a pagar</span>
                    </div>
                  </div>
                </TiltCard>

                {/* Margem Operacional */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(14, 165, 233, 0.35)"
                  onClick={() =>
                    setFiltros((f) => ({
                      ...f,
                      status: f.status === "concluido" ? "todos" : "concluido",
                    }))
                  }
                  title="Clique para filtrar apenas transações concluídas / realizadas"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    setFiltros((f) => ({
                      ...f,
                      status: f.status === "concluido" ? "todos" : "concluido",
                    }))
                  }
                  className={`p-4 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                    filtros.status === "concluido"
                      ? "bg-sky-500/15 border-sky-500/80 ring-2 ring-sky-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-sky-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                  }`}
                >
                  <div className="flex items-center justify-between text-sky-600 dark:text-sky-400 text-xs mb-1">
                    <span className="font-semibold flex items-center gap-1">
                      <span>Resultado Operacional</span>
                      {filtros.status === "concluido" && (
                        <span className="text-[9px] text-sky-600 dark:text-sky-300 font-bold uppercase">
                          (Realizado)
                        </span>
                      )}
                    </span>
                    <Percent className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-black font-mono text-sky-600 dark:text-sky-400">
                      {dre.margemOperacionalPercentual.toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-sky-600/80 dark:text-sky-400/80 mt-0.5">
                      Lucro: R$ {dre.lucroOperacionalLiquido.toFixed(2)}
                    </div>
                  </div>
                </TiltCard>

                {/* Card A Ressarcir a Operadores / ADM */}
                <TiltCard
                  maxTilt={6}
                  spotlightColor="rgba(245, 158, 11, 0.35)"
                  onClick={() =>
                    setFiltros((f) => ({
                      ...f,
                      tipo:
                        f.tipo === "saida" &&
                        f.fonte_pagamento === "operador_adm" &&
                        f.status_ressarcimento === "pendente"
                          ? "todos"
                          : "saida",
                      fonte_pagamento:
                        f.fonte_pagamento === "operador_adm" &&
                        f.status_ressarcimento === "pendente"
                          ? "todas"
                          : "operador_adm",
                      status_ressarcimento:
                        f.status_ressarcimento === "pendente" ? "todos" : "pendente",
                    }))
                  }
                  title="Clique para filtrar apenas despesas pendentes de ressarcimento"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    setFiltros((f) => ({
                      ...f,
                      tipo:
                        f.tipo === "saida" &&
                        f.fonte_pagamento === "operador_adm" &&
                        f.status_ressarcimento === "pendente"
                          ? "todos"
                          : "saida",
                      fonte_pagamento:
                        f.fonte_pagamento === "operador_adm" &&
                        f.status_ressarcimento === "pendente"
                          ? "todas"
                          : "operador_adm",
                      status_ressarcimento:
                        f.status_ressarcimento === "pendente" ? "todos" : "pendente",
                    }))
                  }
                  className={`p-4 rounded-2xl border flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                    filtros.fonte_pagamento === "operador_adm" &&
                    filtros.status_ressarcimento === "pendente"
                      ? "bg-amber-500/15 border-amber-500/80 ring-2 ring-amber-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                      : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-amber-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                  }`}
                >
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs mb-1">
                    <span className="font-semibold flex items-center gap-1">
                      <span>A Ressarcir (Equipe)</span>
                      {filtros.fonte_pagamento === "operador_adm" &&
                        filtros.status_ressarcimento === "pendente" && (
                          <span className="text-[9px] text-amber-600 dark:text-amber-300 font-bold uppercase">
                            (Filtrado)
                          </span>
                        )}
                    </span>
                    <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                      R$ {resumoRessarcimento.totalPendente.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 flex items-center justify-between">
                      <span>{resumoRessarcimento.quantidadePendente} a reembolsar</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        R$ {resumoRessarcimento.totalRessarcido.toFixed(2)} quitado
                      </span>
                    </div>
                  </div>
                </TiltCard>
              </>
            )}
          </div>

          {/* DRE Operacional Simplificado (Restrito à Administração) */}
          {podeVerCustosEFornecedores && (
            <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/40 border border-slate-300/60 dark:border-slate-800/80 space-y-3 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <PieChart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Demonstrativo do Resultado do Exercício (DRE Operacional)</span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Valores Liquidados
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-300/60 dark:border-slate-800/70 shadow-xs">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">
                    1. Receita Bruta
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    R$ {dre.receitaBruta.toFixed(2)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-300/60 dark:border-slate-800/70 shadow-xs">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">
                    2. Repasses Instalador
                  </span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    - R$ {dre.custoInstalacoes.toFixed(2)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-300/60 dark:border-slate-800/70 shadow-xs">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">
                    3. Conectividade M2M
                  </span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    - R$ {dre.custoConectividade.toFixed(2)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-300/60 dark:border-slate-800/70 shadow-xs">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase">
                    4. Outras Despesas
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    - R$ {dre.despesasOperacionais.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Filtros e Busca */}
          <div className="flex flex-col xl:flex-row items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/40 border border-slate-300/60 dark:border-slate-800/80 p-3 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
            <div className="relative w-full xl:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar transação, cliente ou técnico..."
                value={filtros.busca}
                onChange={(e) => setFiltros((prev) => ({ ...prev, busca: e.target.value }))}
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto text-xs">
              {/* Seletor de Atalho de Período */}
              <select
                value={filtros.periodo}
                onChange={(e) => handleMudarPeriodo(e.target.value)}
                title="Atalho de Período"
                className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
              >
                <option value="mes_atual">Mês Atual</option>
                <option value="mes_proximo">Planejamento Próximo Mês</option>
                <option value="ano_atual">Ano Atual</option>
                <option value="todos">Todo o Histórico</option>
                {filtros.periodo === "personalizado" && (
                  <option value="personalizado">Período Personalizado</option>
                )}
              </select>

              {/* Seletor de Mês */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-300/70 dark:border-slate-800 text-xs shadow-xs">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={filtros.mes || "todos"}
                  onChange={(e) => handleMudarMes(e.target.value)}
                  title="Filtrar por Mês"
                  className="bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none cursor-pointer"
                >
                  {MESES.map((m) => (
                    <option
                      key={m.valor}
                      value={m.valor}
                      className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                    >
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seletor de Ano */}
              <div className="bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-300/70 dark:border-slate-800 text-xs shadow-xs">
                <select
                  value={filtros.ano || "todos"}
                  onChange={(e) => handleMudarAno(e.target.value)}
                  title="Filtrar por Ano"
                  className="bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none cursor-pointer font-mono"
                >
                  <option
                    value="todos"
                    className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                  >
                    Todos os Anos
                  </option>
                  {anosDisponiveis.map((a) => (
                    <option
                      key={a}
                      value={String(a)}
                      className="bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200"
                    >
                      Ano {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo */}
              <select
                value={filtros.tipo}
                onChange={(e) => setFiltros((prev) => ({ ...prev, tipo: e.target.value as any }))}
                className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="entrada">Apenas Entradas</option>
                <option value="saida">Apenas Saídas</option>
              </select>

              {/* Status */}
              <select
                value={filtros.status}
                onChange={(e) => setFiltros((prev) => ({ ...prev, status: e.target.value }))}
                className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
              >
                <option value="todos">Todas as Situações</option>
                <option value="concluido">Liquidado / Pago</option>
                <option value="pendente">A Liquidar / Pendente</option>
              </select>

              {/* Categoria */}
              <select
                value={filtros.categoria}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, categoria: e.target.value as any }))
                }
                className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs font-medium"
              >
                <option value="todas">Todas as Categorias</option>
                <option value="mensalidade">Mensalidades</option>
                <option value="repasse_revendedor">Repasse Franquia / Revendedor</option>
                <option value="repasse_vendedor">Comissão Vendedor</option>
                <option value="repasse_instalador">Repasse Instalador</option>
                <option value="chips_conectividade">Chips de Conectividade</option>
                <option value="infraestrutura_servidores">Infraestrutura e Servidores</option>
                <option value="aquisicao_equipamentos">Aquisição de Equipamentos</option>
                <option value="despesa_administrativa">Despesas Administrativas</option>
                <option value="outros">Outros</option>
              </select>

              {/* Origem da Verba */}
              {podeVerCustosEFornecedores && (
                <select
                  value={filtros.fonte_pagamento || "todas"}
                  onChange={(e) =>
                    setFiltros((prev) => ({
                      ...prev,
                      fonte_pagamento: e.target.value as any,
                      responsavel_pagamento_id:
                        e.target.value === "caixa_empresa" ? "" : prev.responsavel_pagamento_id,
                    }))
                  }
                  title="Origem da Verba"
                  className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs font-medium"
                >
                  <option value="todas">Origem: Todas</option>
                  <option value="caixa_empresa">🏢 Caixa da Empresa</option>
                  <option value="operador_adm">👤 Operador / ADM</option>
                </select>
              )}

              {/* Filtro de Ressarcimento */}
              {podeVerCustosEFornecedores && filtros.fonte_pagamento === "operador_adm" && (
                <select
                  value={filtros.status_ressarcimento || "todos"}
                  onChange={(e) =>
                    setFiltros((prev) => ({
                      ...prev,
                      status_ressarcimento: e.target.value as any,
                    }))
                  }
                  title="Situação do Ressarcimento"
                  className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-amber-500/50 rounded-xl text-xs text-amber-700 dark:text-amber-300 font-bold focus:outline-none focus:border-amber-500 shadow-xs"
                >
                  <option value="todos">Reembolso: Todos</option>
                  <option value="pendente">⏳ Pendentes (A Ressarcir)</option>
                  <option value="ressarcido">✅ Já Ressarcidos</option>
                </select>
              )}

              {/* Filtro por Membro da Equipe (Operador/ADM) */}
              {podeVerCustosEFornecedores && filtros.fonte_pagamento === "operador_adm" && (
                <select
                  value={filtros.responsavel_pagamento_id || ""}
                  onChange={(e) =>
                    setFiltros((prev) => ({
                      ...prev,
                      responsavel_pagamento_id: e.target.value,
                    }))
                  }
                  title="Filtrar por Responsável"
                  className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-indigo-500/40 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 shadow-xs"
                >
                  <option value="">Todos os Responsáveis</option>
                  {responsaveisDisponiveis.map((resp) => (
                    <option key={resp.id} value={resp.id}>
                      {resp.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Lista de Transações */}
          <div className="space-y-2">
            {carregando ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Carregando livro-caixa...
              </div>
            ) : filtradas.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-6 space-y-2 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
                <div>Nenhuma movimentação financeira encontrada para o filtro selecionado.</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Cadastre lançamentos avulsos, parcelados ou recorrentes para alimentar o fluxo de
                  caixa e planejamento.
                </div>
              </div>
            ) : (
              filtradas.map((t) => {
                const isEntrada = t.tipo === "entrada";
                const isLiquidado = t.status === "concluido";

                return (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] dark:hover:border-slate-700 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isEntrada
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {isEntrada ? (
                          <ArrowDownLeft className="h-5 w-5" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {t.descricao}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isLiquidado
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {isLiquidado ? "Liquidado" : "Pendente"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                            {t.categoria.replace("_", " ")}
                          </span>

                          {/* Badge Moeda USD */}
                          {t.moeda === "USD" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              USD
                            </span>
                          )}

                          {/* Badge Modalidade Parcelada / Mensalidade */}
                          {(t.modalidade === "parcelada" ||
                            (t.categoria === "mensalidade" &&
                              Boolean(t.parcela_atual && t.total_parcelas))) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                              Parcela{" "}
                              {formatarParcelaMensalidade(
                                t.parcela_atual || 1,
                                t.total_parcelas || 1,
                              ) || `${t.parcela_atual || 1}/${t.total_parcelas || 1}`}
                            </span>
                          )}

                          {/* Badge Modalidade Recorrente */}
                          {t.modalidade === "recorrente" &&
                            (t.recorrencia_ativa !== false ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 inline-flex items-center gap-1">
                                <span className="text-xs font-black">∞</span> Recorrente Contínuo
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700">
                                Recorrência Encerrada
                              </span>
                            ))}

                          {/* Badges de Origem da Verba e Ressarcimento (Apenas para Saídas) */}
                          {!isEntrada && t.fonte_pagamento === "operador_adm" && (
                            <>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                                👤 Pago por: {t.responsavel_pagamento_nome || "Operador/ADM"}
                              </span>
                              {t.status_ressarcimento === "pendente" ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
                                  ⏳ A Ressarcir
                                </span>
                              ) : t.status_ressarcimento === "ressarcido" ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                  ✓ Ressarcido
                                </span>
                              ) : null}
                            </>
                          )}
                          {/* Badge de Liquidado pelo Cliente */}
                          {t.liquidado_pelo_cliente && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                              Liquidado pelo Cliente
                            </span>
                          )}
                          {!isEntrada &&
                            t.fonte_pagamento === "caixa_empresa" &&
                            !t.liquidado_pelo_cliente && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                                🏢 Caixa
                              </span>
                            )}

                          {/* Badges de Parceiros (Revendedor e Vendedor) */}
                          {t.categoria === "repasse_revendedor" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              🏢 Franquia: {t.revendedores?.nome || "Revendedor"}
                              {t.revendedores?.chave_pix && (
                                <span className="font-mono text-[9px] text-slate-500">
                                  (PIX: {t.revendedores.chave_pix})
                                </span>
                              )}
                            </span>
                          )}
                          {t.categoria === "repasse_vendedor" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1">
                              👤 Vendedor: {t.vendedores?.nome || "Vendedor"}
                              {t.vendedores?.chave_pix && (
                                <span className="font-mono text-[9px] text-slate-500">
                                  (PIX: {t.vendedores.chave_pix})
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>
                            Competência:{" "}
                            <strong className="text-slate-800 dark:text-slate-200">
                              {t.data_competencia.split("-").reverse().join("/")}
                            </strong>
                          </span>
                          {t.data_pagamento && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">
                                Efetivado em:{" "}
                                {new Date(t.data_pagamento).toLocaleDateString("pt-BR")}
                              </span>
                            </>
                          )}
                          {t.observacoes && (
                            <>
                              <span>·</span>
                              <span className="text-slate-500 dark:text-slate-400 italic text-[11px]">
                                {t.observacoes}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-300/60 dark:border-slate-800/80">
                      <div className="text-right">
                        {t.moeda === "USD" && t.valor_moeda_original && (
                          <div className="text-[11px] font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            US$ {Number(t.valor_moeda_original).toFixed(2)}
                            {t.cotacao_moeda && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-1">
                                (Câmbio R$ {Number(t.cotacao_moeda).toFixed(2)})
                              </span>
                            )}
                          </div>
                        )}
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                          {t.moeda === "USD" ? "Valor Convertido (BRL)" : "Valor"}
                        </span>
                        <span
                          className={`text-base font-black font-mono ${
                            t.liquidado_pelo_cliente || (isLiquidado && Number(t.valor) === 0)
                              ? "text-slate-500 dark:text-slate-400"
                              : isEntrada
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {t.liquidado_pelo_cliente || (isLiquidado && Number(t.valor) === 0)
                            ? "R$ 0,00"
                            : `${isEntrada ? "+" : "-"} R$ ${Number(t.valor).toFixed(2)}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isLiquidado ? (
                          <button
                            onClick={() => handleLiquidar(t)}
                            title="Confirmar Liquidação"
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow"
                          >
                            Liquidar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReabrir(t.id)}
                            title="Reabrir como pendente"
                            className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}

                        {/* Botão Rápido de Ressarcimento ao Operador/ADM */}
                        {!isEntrada &&
                          t.fonte_pagamento === "operador_adm" &&
                          t.status_ressarcimento === "pendente" && (
                            <button
                              onClick={() => handleRessarcir(t)}
                              title="Registrar ressarcimento e quitação deste valor com o responsável"
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow flex items-center gap-1 shrink-0"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              <span>Ressarcir</span>
                            </button>
                          )}

                        {/* Botão de Encerrar Recorrência Futura */}
                        {t.modalidade === "recorrente" &&
                          t.recorrencia_id &&
                          t.recorrencia_ativa !== false && (
                            <button
                              onClick={() => handleEncerrarRecorrencia(t.recorrencia_id!)}
                              title="Encerrar Recorrência Futura"
                              className="p-1.5 rounded-xl text-xs text-rose-500 hover:bg-rose-500/10 transition flex items-center gap-1"
                            >
                              <StopCircle className="h-4 w-4 text-rose-500" />
                              <span className="text-[10px] hidden md:inline font-bold">
                                Encerrar
                              </span>
                            </button>
                          )}

                        {/* Edição apenas para transações avulsas / manuais */}
                        {!t.mensalidade_id && !t.instalacao_id && (
                          <button
                            onClick={() => {
                              setTransacaoParaEditar(t);
                              setModalNovo(true);
                            }}
                            title="Editar lançamento"
                            className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-sky-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}

                        {/* Exclusão apenas para transações avulsas manuais */}
                        {!t.mensalidade_id && !t.instalacao_id && (
                          <button
                            onClick={() => handleExcluir(t.id)}
                            title="Excluir lançamento avulso"
                            className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Modal Novo / Editar Lancamento */}
      {modalNovo && (
        <ModalNovaTransacao
          podeRegistrarDespesas={podeVerCustosEFornecedores}
          transacaoParaEditar={transacaoParaEditar}
          onFechar={() => {
            setModalNovo(false);
            setTransacaoParaEditar(null);
          }}
          onSucesso={(nova) => {
            setModalNovo(false);
            setTransacaoParaEditar(null);
            if (nova) {
              const tipoStr = String(nova.tipo);
              const statusStr = String(nova.status);

              const tipoNormalizado: "entrada" | "saida" =
                tipoStr === "saida" || tipoStr === "despesa" ? "saida" : "entrada";
              let statusNormalizado: "pendente" | "concluido" | "cancelado" = "pendente";
              if (statusStr === "concluido" || statusStr === "pago") {
                statusNormalizado = "concluido";
              } else if (statusStr === "cancelado" || statusStr === "estornado") {
                statusNormalizado = "cancelado";
              }

              const itemFormatado: TransacaoFinanceira = {
                ...nova,
                tipo: tipoNormalizado,
                status: statusNormalizado,
                valor: Number(nova.valor || 0),
                clientes: null,
                instalador: null,
              };

              setTransacoes((prev) => [
                itemFormatado,
                ...prev.filter((p) => p.id !== itemFormatado.id),
              ]);
            }
            carregar();
          }}
        />
      )}

      {/* Modal de Confirmação de Liquidação com Escolha de Caixa ou Liquidado pelo Cliente */}
      {transacaoParaLiquidar && (
        <ModalLiquidarTransacao
          transacao={transacaoParaLiquidar}
          aberto={Boolean(transacaoParaLiquidar)}
          responsaveisDisponiveis={responsaveisDisponiveis}
          onFechar={() => setTransacaoParaLiquidar(null)}
          onConfirmar={handleConfirmarLiquidacao}
        />
      )}
    </div>
  );
}
