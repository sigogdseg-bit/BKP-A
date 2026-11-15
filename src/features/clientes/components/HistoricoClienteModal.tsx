import { useState, useEffect, useMemo, useCallback } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  History,
  Search,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Headphones,
  Wrench,
  ShieldAlert,
  CreditCard,
  Lock,
  DollarSign,
  Car,
  FileText,
  RefreshCw,
  Calendar,
  ExternalLink,
} from "lucide-react";
import type {
  Cliente,
  CategoriaHistoricoCliente,
  HistoricoClienteCompleto,
  ItemHistoricoCliente,
} from "../types";
import {
  carregarHistoricoCliente,
  filtrarEOrdenarHistorico,
} from "../services/historicoClienteService";

interface HistoricoClienteModalProps {
  cliente: Cliente;
  onFechar: () => void;
}

export function HistoricoClienteModal({ cliente, onFechar }: HistoricoClienteModalProps) {
  const [carregando, setCarregando] = useState(true);
  const [dadosHistorico, setDadosHistorico] = useState<HistoricoClienteCompleto | null>(null);
  const [categoria, setCategoria] = useState<CategoriaHistoricoCliente>("todos");
  const [ordem, setOrdem] = useState<"recente" | "antigo">("recente");
  const [busca, setBusca] = useState("");

  const toggleCategoria = (cat: CategoriaHistoricoCliente) => {
    setCategoria((atual) => (atual === cat ? "todos" : cat));
  };

  const irParaModulo = (e: React.MouseEvent, rota: string) => {
    e.stopPropagation();
    onFechar();
    window.location.href = rota;
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    const dados = await carregarHistoricoCliente(cliente.id);
    setDadosHistorico(dados);
    setCarregando(false);
  }, [cliente.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itensFiltrados = useMemo(() => {
    if (!dadosHistorico) return [];
    return filtrarEOrdenarHistorico(dadosHistorico.itens, categoria, ordem, busca);
  }, [dadosHistorico, categoria, ordem, busca]);

  const resumo = dadosHistorico?.resumo;

  const renderIconeCategoria = (item: ItemHistoricoCliente) => {
    switch (item.categoria) {
      case "pagamento":
        return item.severidade === "sucesso" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <CreditCard className="h-4 w-4 text-sky-400" />
        );
      case "atraso":
        return <AlertTriangle className="h-4 w-4 text-rose-400" />;
      case "chamado":
        return <Headphones className="h-4 w-4 text-purple-400" />;
      case "instalacao":
        return <Wrench className="h-4 w-4 text-amber-400" />;
      case "agendamento":
        return <Calendar className="h-4 w-4 text-sky-400" />;
      case "bloqueio_seguranca":
        return <Lock className="h-4 w-4 text-rose-400" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const formatarDataHora = (dataStr: string) => {
    if (!dataStr) return "--/--/----";
    try {
      if (dataStr.includes("T")) {
        const d = new Date(dataStr);
        return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      }
      return dataStr.split("-").reverse().join("/");
    } catch {
      return dataStr;
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-in fade-in duration-200 select-none">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-5xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#fbf2e9]/80 dark:bg-slate-950/50 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <History className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    {cliente.nome_razao_social}
                  </h2>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      cliente.status === "ativo"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                        : cliente.status === "bloqueado"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {cliente.status === "aguardando_instalacao"
                      ? "Aguardando Instalação"
                      : cliente.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 shadow-xs">
                    Plano {cliente.plano}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Histórico consolidado 360° · Chamados, Instalações, Pagamentos, Atrasos e
                  Bloqueios
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={carregar}
                disabled={carregando}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                title="Atualizar histórico"
              >
                <RefreshCw
                  className={`h-4 w-4 ${carregando ? "animate-spin text-emerald-600 dark:text-emerald-400" : ""}`}
                />
              </button>
              <button
                onClick={onFechar}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Resumo Executivo (KPIs e Infográficos Ativos com Filtragem e Navegação) */}
          {resumo && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-3 sm:p-4 bg-white/40 dark:bg-slate-950/30 border-b border-slate-300/60 dark:border-slate-800 shrink-0 text-xs font-mono">
              {/* 1. Total Liquidado -> Filtro Pagamento / Módulo Financeiro */}
              <div
                onClick={() => toggleCategoria("pagamento")}
                title="Clique para filtrar por pagamentos · Ícone abre Financeiro"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleCategoria("pagamento")}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group ${
                  categoria === "pagamento"
                    ? "bg-emerald-500/15 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-white dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800/80 hover:border-emerald-500/40 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                    Total Liquidado
                    {categoria === "pagamento" && (
                      <span className="ml-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">
                        (Ativo)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => irParaModulo(e, "/financeiro")}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                    title="Abrir Módulo Financeiro"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm block mt-0.5">
                  R$ {resumo.totalValorPago.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                  {resumo.totalPagamentosRealizados} fatura(s)
                </span>
              </div>

              {/* 2. Total em Atraso -> Filtro Atraso / Módulo Financeiro Inadimplentes */}
              <div
                onClick={() => toggleCategoria("atraso")}
                title="Clique para filtrar por atrasos · Ícone abre Financeiro"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleCategoria("atraso")}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group ${
                  categoria === "atraso"
                    ? "bg-rose-500/20 border-rose-500/80 ring-2 ring-rose-500/40 shadow-rose-500/10"
                    : resumo.totalMensalidadesAtrasadas > 0
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:border-rose-500/60"
                      : "bg-white dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800/80 text-slate-500 dark:text-slate-400 hover:border-slate-400 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                    Em Atraso
                    {categoria === "atraso" && (
                      <span className="ml-1 text-[9px] text-rose-600 dark:text-rose-400 font-bold">
                        (Ativo)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => irParaModulo(e, "/financeiro")}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition"
                    title="Abrir Módulo Financeiro"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <span
                  className={`font-bold text-sm block mt-0.5 ${
                    resumo.totalMensalidadesAtrasadas > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  R$ {resumo.totalValorEmAtraso.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                  {resumo.totalMensalidadesAtrasadas > 0
                    ? `${resumo.maiorAtrasoDias} dias máx.`
                    : "Em dia"}
                </span>
              </div>

              {/* 3. Chamados -> Filtro Chamado / Módulo Atendimento */}
              <div
                onClick={() => toggleCategoria("chamado")}
                title="Clique para filtrar por chamados · Ícone abre Atendimento"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleCategoria("chamado")}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group ${
                  categoria === "chamado"
                    ? "bg-purple-500/20 border-purple-500/80 ring-2 ring-purple-500/40 shadow-purple-500/10 text-purple-700 dark:text-purple-300"
                    : "bg-white dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800/80 hover:border-purple-500/40 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                    Atendimentos
                    {categoria === "chamado" && (
                      <span className="ml-1 text-[9px] text-purple-600 dark:text-purple-400 font-bold">
                        (Ativo)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => irParaModulo(e, "/atendimento")}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition"
                    title="Abrir Módulo de Atendimento"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-purple-600 dark:text-purple-400 font-bold text-sm block mt-0.5">
                  {resumo.totalChamadosAtendimento}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                  {resumo.chamadosAbertos > 0
                    ? `${resumo.chamadosAbertos} aberto(s)`
                    : "Nenhum pendente"}
                </span>
              </div>

              {/* 4. Instalações -> Filtro Instalação / Módulo Instalações */}
              <div
                onClick={() => toggleCategoria("instalacao")}
                title="Clique para filtrar por instalações · Ícone abre Instalações"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleCategoria("instalacao")}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group ${
                  categoria === "instalacao"
                    ? "bg-amber-500/20 border-amber-500/80 ring-2 ring-amber-500/40 shadow-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "bg-white dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800/80 hover:border-amber-500/40 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                    Instalações
                    {categoria === "instalacao" && (
                      <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400 font-bold">
                        (Ativo)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => irParaModulo(e, "/instalacao")}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition"
                    title="Abrir Módulo de Instalações"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-amber-600 dark:text-amber-400 font-bold text-sm block mt-0.5">
                  {resumo.totalInstalacoes}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                  {resumo.instalacoesConcluidas} concluída(s)
                </span>
              </div>

              {/* 5. Agendamentos e Procedimentos -> Filtro Agendamento / Módulo Instalações */}
              <div
                onClick={() => toggleCategoria("agendamento")}
                title="Clique para filtrar por agendamentos e procedimentos · Ícone abre Instalações"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleCategoria("agendamento")}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group ${
                  categoria === "agendamento"
                    ? "bg-sky-500/20 border-sky-500/80 ring-2 ring-sky-500/40 shadow-sky-500/10 text-sky-700 dark:text-sky-300"
                    : "bg-white dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800/80 hover:border-sky-500/40 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                    Agendamentos
                    {categoria === "agendamento" && (
                      <span className="ml-1 text-[9px] text-sky-600 dark:text-sky-400 font-bold">
                        (Ativo)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => irParaModulo(e, "/instalacao")}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition"
                    title="Abrir Módulo de Instalações"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-sky-600 dark:text-sky-400 font-bold text-sm block mt-0.5">
                  {resumo.totalAgendamentos || 0}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                  {(resumo.totalSolicitacoesEndereco || 0) > 0
                    ? `${resumo.totalSolicitacoesEndereco} solicitação(ões)`
                    : "Procedimentos"}
                </span>
              </div>

              {/* 6. Segurança / Bloqueios -> Filtro Bloqueio / Central de Segurança */}
              <div
                onClick={() => toggleCategoria("bloqueio_seguranca")}
                title="Clique para filtrar por bloqueios · Ícone abre Central de Segurança"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleCategoria("bloqueio_seguranca")}
                className={`p-2.5 rounded-xl border col-span-2 sm:col-span-1 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg relative group ${
                  categoria === "bloqueio_seguranca"
                    ? "bg-rose-500/20 border-rose-500/80 ring-2 ring-rose-500/40 shadow-rose-500/10 text-rose-700 dark:text-rose-300"
                    : resumo.bloqueiosAtivos > 0
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:border-rose-500/60"
                      : "bg-white dark:bg-slate-900/80 border-slate-300/60 dark:border-slate-800/80 text-emerald-600 dark:text-emerald-400 hover:border-slate-400 shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">
                    Segurança
                    {categoria === "bloqueio_seguranca" && (
                      <span className="ml-1 text-[9px] text-rose-600 dark:text-rose-400 font-bold">
                        (Ativo)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => irParaModulo(e, "/configuracao/central-seguranca")}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 transition"
                    title="Abrir Central de Segurança"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <span className="font-bold text-sm block mt-0.5">
                  {resumo.bloqueiosAtivos > 0
                    ? `${resumo.bloqueiosAtivos} Bloqueio(s)`
                    : "Liberado"}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans mt-0.5">
                  {resumo.statusAcessoCliente === "bloqueado"
                    ? "Conta suspensa"
                    : "Acesso liberado"}
                </span>
              </div>
            </div>
          )}

          {/* Barra de Filtros e Ordenação */}
          <div className="p-3 sm:p-4 border-b border-slate-300/60 dark:border-slate-800/80 bg-white/40 dark:bg-slate-950/20 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
            {/* Busca Textual */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar em todo o histórico..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-xs"
              />
            </div>

            {/* Filtros de Categoria e Ordenação */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto text-xs">
              {/* Seletor de Categoria */}
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaHistoricoCliente)}
                className="px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
              >
                <option value="todos">
                  Todos os Eventos ({dadosHistorico?.itens.length || 0})
                </option>
                <option value="pagamento">Pagamentos e Faturas</option>
                <option value="atraso">Atrasos no Pagamento</option>
                <option value="chamado">Chamados de Suporte</option>
                <option value="instalacao">Instalações e Ordens</option>
                <option value="agendamento">Agendamentos e Procedimentos</option>
                <option value="bloqueio_seguranca">Bloqueios e Segurança</option>
              </select>

              {/* Alternador de Ordenação */}
              <button
                onClick={() => setOrdem(ordem === "recente" ? "antigo" : "recente")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-semibold shadow-xs"
                title="Inverter ordem cronológica"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{ordem === "recente" ? "Mais Recentes" : "Mais Antigos"}</span>
              </button>
            </div>
          </div>

          {/* Linha do Tempo (Corpo Rolável) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
            {carregando ? (
              <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-emerald-600 dark:text-emerald-400" />
                <div>Consolidando histórico completo do cliente...</div>
              </div>
            ) : itensFiltrados.length === 0 ? (
              <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs bg-white/60 dark:bg-slate-950/40 rounded-2xl border border-slate-300/60 dark:border-slate-800/80 p-6 space-y-2 shadow-xs">
                <Clock className="h-8 w-8 mx-auto text-slate-400" />
                <div className="text-slate-800 dark:text-slate-200 font-bold text-sm">
                  Nenhum registro encontrado
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-xs max-w-sm mx-auto">
                  Não há eventos correspondentes à categoria ou termo de busca selecionado.
                </p>
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-300/80 dark:border-slate-800 ml-4 sm:ml-6 pl-4 sm:pl-6 space-y-4">
                {itensFiltrados.map((item) => {
                  const isPerigo = item.severidade === "perigo";
                  const isAlerta = item.severidade === "alerta";
                  const isSucesso = item.severidade === "sucesso";

                  return (
                    <div key={item.id} className="relative group">
                      {/* Marcador na Linha do Tempo */}
                      <div
                        className={`absolute -left-[27px] sm:-left-[35px] top-3 h-7 w-7 rounded-xl flex items-center justify-center border shadow-xs transition ${
                          isPerigo
                            ? "bg-rose-100 dark:bg-rose-950 border-rose-400 dark:border-rose-500 text-rose-600 dark:text-rose-400"
                            : isAlerta
                              ? "bg-amber-100 dark:bg-amber-950 border-amber-400 dark:border-amber-500 text-amber-600 dark:text-amber-400"
                              : isSucesso
                                ? "bg-emerald-100 dark:bg-emerald-950 border-emerald-400 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {renderIconeCategoria(item)}
                      </div>

                      {/* Card de Conteúdo do Evento */}
                      <div
                        className={`p-3.5 sm:p-4 rounded-2xl border transition shadow-xs ${
                          isPerigo
                            ? "bg-rose-500/10 dark:bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50"
                            : isAlerta
                              ? "bg-amber-500/10 dark:bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50"
                              : isSucesso
                                ? "bg-emerald-500/10 dark:bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/50"
                                : "bg-white dark:bg-slate-900/70 border-slate-300/60 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                              {item.titulo}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                isPerigo
                                  ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                                  : isAlerta
                                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                    : isSucesso
                                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700"
                              }`}
                            >
                              {item.categoria.replace("_", " ")}
                            </span>
                          </div>

                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            <span>{formatarDataHora(item.data)}</span>
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {item.descricao}
                        </p>

                        {/* Metadados Extras e Detalhes */}
                        {item.detalhes && (
                          <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {item.detalhes.valor !== undefined && (
                              <span className="text-slate-800 dark:text-slate-200">
                                Valor:{" "}
                                <strong className="text-emerald-600 dark:text-emerald-400">
                                  R$ {item.detalhes.valor.toFixed(2)}
                                </strong>
                              </span>
                            )}
                            {item.detalhes.diasAtraso !== undefined && (
                              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                Tempo de atraso: {item.detalhes.diasAtraso} dias
                              </span>
                            )}
                            {item.detalhes.protocolo && (
                              <span>Protocolo: #{item.detalhes.protocolo}</span>
                            )}
                            {item.detalhes.placa && (
                              <span>
                                Placa:{" "}
                                <strong className="text-slate-800 dark:text-slate-200">
                                  {item.detalhes.placa}
                                </strong>
                              </span>
                            )}
                            {item.detalhes.responsavel && (
                              <span>Técnico: {item.detalhes.responsavel}</span>
                            )}
                            {item.detalhes.dataAgendamento && (
                              <span className="text-sky-600 dark:text-sky-400 font-semibold">
                                Marcado:{" "}
                                {item.detalhes.dataAgendamento.split("-").reverse().join("/")}
                                {item.detalhes.horaAgendamento
                                  ? ` às ${item.detalhes.horaAgendamento}h`
                                  : ""}
                              </span>
                            )}
                            {item.detalhes.endereco && (
                              <span className="text-slate-700 dark:text-slate-300">
                                Local: {item.detalhes.endereco}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rodapé Informativo */}
          <div className="p-3 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 bg-[#fbf2e9]/80 dark:bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
            <div>Total de {itensFiltrados.length} evento(s) listado(s) no histórico.</div>
            <button
              onClick={onFechar}
              className="px-4 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300/70 dark:border-slate-700 text-xs font-semibold transition shadow-xs"
            >
              Fechar Histórico
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
