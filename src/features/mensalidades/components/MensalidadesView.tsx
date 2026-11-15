import { useState, useEffect, useMemo } from "react";
import {
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Sparkles,
  RotateCcw,
  Trash2,
  TrendingUp,
  QrCode,
  Calendar,
  Bell,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { carregarClientes } from "@/features/clientes/services/clienteService";
import type { Cliente } from "@/features/clientes/types";
import { calcularEncargosAtraso } from "../utils/encargosLegais";
import { APP_NOME, APP_CHAVE_PIX_PADRAO } from "@/shared/lib/version";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import {
  listarMensalidades,
  darBaixaPagamento,
  reabrirMensalidade,
  excluirMensalidade,
  atualizarVencimentoMensalidade,
  calcularResumoFinanceiro,
  formatarCompetenciaMensalidade,
  formatarParcelaMensalidade,
  verificarStatusFinanceiroCliente,
  resolverStatusFinanceiroCardCliente,
  type StatusFinanceiroCliente,
} from "../services/mensalidadeService";
import type { MensalidadeItem } from "../types";
import { ModalGerarMensalidades } from "./ModalGerarMensalidades";
import { ModalNovaMensalidade } from "./ModalNovaMensalidade";
import { ModalInformarPagamento } from "./ModalInformarPagamento";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { TiltCard } from "@/shared/components/TiltCard";

export function MensalidadesView() {
  const { session } = useAuth();
  const [mensalidades, setMensalidades] = useState<MensalidadeItem[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [statusFinanceiroCliente, setStatusFinanceiroCliente] =
    useState<StatusFinanceiroCliente | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [busca, setBusca] = useState("");
  const [modalGerarLote, setModalGerarLote] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [modalInformarItem, setModalInformarItem] = useState<MensalidadeItem | null>(null);
  const [modalEditarVencimento, setModalEditarVencimento] = useState<{
    mensalidade: MensalidadeItem;
    novaData: string;
    escopo: "somente_esta" | "todas_futuras";
  } | null>(null);
  const [salvandoVencimento, setSalvandoVencimento] = useState(false);
  const [modalPixItem, setModalPixItem] = useState<{
    mensalidade: MensalidadeItem;
    valorFinal: number;
    dataUrl: string;
    payload: string;
    diasAtraso?: number;
    totalEncargos?: number;
  } | null>(null);
  const [gerandoPixId, setGerandoPixId] = useState<string | null>(null);
  const [copiadoPix, setCopiadoPix] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      const clienteIdFiltro = session?.isCliente ? session?.clienteId || null : null;
      const [lista, listaCli, statusFin] = await Promise.all([
        listarMensalidades(clienteIdFiltro),
        !session?.isCliente ? carregarClientes() : Promise.resolve([]),
        session?.isCliente && session?.userId
          ? verificarStatusFinanceiroCliente(session.userId, session.clienteId, false)
          : Promise.resolve(null),
      ]);
      setMensalidades(lista);
      setClientes(listaCli);
      setStatusFinanceiroCliente(statusFin);
    } catch (err) {
      console.error("Erro ao carregar dados financeiros:", err);
    } finally {
      setCarregando(false);
    }
  };

  const abrirPixMensalidade = async (m: MensalidadeItem) => {
    setGerandoPixId(m.id);
    try {
      let valorCobrar = Number(m.valor);
      let diasAtraso = 0;
      let totalEncargos = 0;

      if (m.status === "vencido" && m.data_vencimento) {
        const enc = calcularEncargosAtraso(valorCobrar, m.data_vencimento);
        valorCobrar = enc.valorTotalAtualizado;
        diasAtraso = enc.diasAtraso;
        totalEncargos = enc.totalEncargos;
      }

      const txid = `MENS${m.id
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10)
        .toUpperCase()}`;
      const payload = gerarPayloadPix({
        chavePix: APP_CHAVE_PIX_PADRAO,
        nomeRecebedor: APP_NOME,
        cidadeRecebedor: "BRASIL",
        valor: valorCobrar,
        identificador: txid,
      });

      const dataUrl = await gerarQrCodePixDataUrl(payload);
      setModalPixItem({
        mensalidade: m,
        valorFinal: valorCobrar,
        dataUrl,
        payload,
        diasAtraso,
        totalEncargos,
      });
    } catch (err) {
      console.error("Erro ao gerar QR Code PIX da fatura:", err);
      toast.error("Falha ao gerar o QR Code PIX.");
    } finally {
      setGerandoPixId(null);
    }
  };

  const handleNotificarClienteMensalidade = async (
    m: MensalidadeItem,
    _payloadPixCustom?: string,
    valorCustom?: number,
  ) => {
    const isAtrasado = m.status === "vencido";
    let valorFinal = valorCustom ?? Number(m.valor);
    let diasAtraso = 0;

    if (isAtrasado && m.data_vencimento && !valorCustom) {
      const enc = calcularEncargosAtraso(Number(m.valor), m.data_vencimento);
      valorFinal = enc.valorTotalAtualizado;
      diasAtraso = enc.diasAtraso;
    }

    const competencia = formatarCompetenciaMensalidade(m.mes_referencia, m.ano_referencia);
    const parcelaFmt =
      m.mes_referencia === 0 ? "" : formatarParcelaMensalidade(m.numero_parcela, m.total_parcelas);
    const rotuloFatura = parcelaFmt ? `${competencia} · Parcela ${parcelaFmt}` : competencia;

    const primeiroNome = (m.clientes?.nome_razao_social || "Cliente").split(" ")[0];
    const titulo = isAtrasado
      ? `⚠️ Fatura Vencida (${rotuloFatura}) — ${APP_NOME}`
      : `📅 Vencimento do Plano (${rotuloFatura}) — ${APP_NOME}`;

    const mensagem = isAtrasado
      ? `Olá, ${primeiroNome}. Sua fatura de ${competencia}${parcelaFmt ? ` (Parcela ${parcelaFmt})` : ""} está vencida há ${diasAtraso} dias no valor atualizado de R$ ${valorFinal.toFixed(2)}. Acesse o painel para regularizar via PIX.`
      : `Olá, ${primeiroNome}. Sua fatura de ${competencia}${parcelaFmt ? ` (Parcela ${parcelaFmt})` : ""} com vencimento em ${m.data_vencimento?.split("-").reverse().join("/") || "breve"} no valor de R$ ${valorFinal.toFixed(2)} já está disponível para pagamento via PIX.`;

    const ok = await enviarNotificacaoViaBd({
      destinatarioClienteId: m.cliente_id,
      titulo,
      mensagem,
      tipo: "cobranca",
      url: "/faturas",
    });

    if (ok) {
      toast.success("Notificação imediata enviada ao cliente com sucesso!");
    } else {
      toast.error("Falha ao emitir notificação para o cliente.");
    }
  };

  useEffect(() => {
    carregar();

    // Sincronizacao em tempo real via Supabase Realtime
    const canal = supabase
      .channel("hunter_mensalidades_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensalidades",
        },
        () => {
          carregar();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes",
        },
        () => {
          if (session?.isCliente) {
            carregar();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [session?.isCliente, session?.clienteId, session?.userId]);

  const handleBaixa = async (id: string) => {
    if (!window.confirm("Confirmar baixa de pagamento para esta mensalidade?")) return;

    const ok = await darBaixaPagamento(id);
    if (ok) {
      toast.success("Pagamento confirmado com sucesso!");
      carregar();
    } else {
      toast.error("Erro ao registrar pagamento.");
    }
  };

  const handleReabrir = async (id: string, vencimento: string) => {
    if (!window.confirm("Deseja estornar e reabrir esta mensalidade como pendente?")) return;

    const ok = await reabrirMensalidade(id, vencimento);
    if (ok) {
      toast.success("Mensalidade reaberta com sucesso!");
      carregar();
    } else {
      toast.error("Erro ao reabrir mensalidade.");
    }
  };

  const handleExcluir = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta cobranca? Esta acao e irreversivel."))
      return;

    const ok = await excluirMensalidade(id);
    if (ok) {
      toast.success("Mensalidade excluida com sucesso!");
      carregar();
    } else {
      toast.error("Erro ao excluir mensalidade.");
    }
  };

  const handleSalvarVencimento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEditarVencimento) return;
    const { mensalidade, novaData, escopo } = modalEditarVencimento;
    if (!novaData) {
      toast.error("Informe a nova data de vencimento.");
      return;
    }

    setSalvandoVencimento(true);
    try {
      const res = await atualizarVencimentoMensalidade(mensalidade.id, novaData, escopo);
      if (res.success) {
        toast.success(res.message);
        setModalEditarVencimento(null);
        carregar();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar vencimento da cobrança.");
    } finally {
      setSalvandoVencimento(false);
    }
  };

  const resumo = useMemo(() => {
    return calcularResumoFinanceiro(mensalidades);
  }, [mensalidades]);

  const statusCardCliente = useMemo(() => {
    return resolverStatusFinanceiroCardCliente({
      statusFinanceiro: statusFinanceiroCliente,
      qtdVencido: resumo.qtdVencido,
    });
  }, [statusFinanceiroCliente, resumo.qtdVencido]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>();
    mensalidades.forEach((m) => {
      if (m.ano_referencia) anos.add(m.ano_referencia);
    });
    if (anos.size === 0) anos.add(new Date().getFullYear());
    return Array.from(anos).sort((a, b) => b - a);
  }, [mensalidades]);

  const filtrados = useMemo(() => {
    return mensalidades
      .filter((m) => {
        // Blindagem estrita: cliente autenticado visualiza somente suas próprias faturas
        if (session?.isCliente && session?.clienteId && m.cliente_id !== session.clienteId) {
          return false;
        }

        const matchBusca =
          !busca ||
          (m.clientes?.nome_razao_social &&
            m.clientes.nome_razao_social.toLowerCase().includes(busca.toLowerCase())) ||
          (m.clientes?.documento && m.clientes.documento.includes(busca)) ||
          (m.clientes?.telefone && m.clientes.telefone.includes(busca));

        const matchStatus = filtroStatus === "todos" || m.status === filtroStatus;
        const matchMes = filtroMes === "todos" || String(m.mes_referencia) === filtroMes;
        const matchAno = filtroAno === "todos" || String(m.ano_referencia) === filtroAno;
        return matchBusca && matchStatus && matchMes && matchAno;
      })
      .sort((a, b) => {
        // Ordena da mais próxima primeiro (data de vencimento ascendente)
        const dateA = a.data_vencimento || "";
        const dateB = b.data_vencimento || "";
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        return (a.clientes?.nome_razao_social || "").localeCompare(
          b.clientes?.nome_razao_social || "",
        );
      });
  }, [
    mensalidades,
    busca,
    filtroStatus,
    filtroMes,
    filtroAno,
    session?.isCliente,
    session?.clienteId,
  ]);

  const isAdm = !session?.isCliente;

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-xs">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
              {session?.isCliente ? "Mensalidade" : "Controle de Mensalidades e Vencimentos"}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {session?.isCliente
                ? "Faturas, 2ª via, comprovantes e chave PIX para pagamento"
                : "Gestão financeira de planos de rastreamento veicular"}
            </p>
          </div>
        </div>

        {isAdm && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setModalGerarLote(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/25 transition shadow-xs w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              <span>Gerar Mensalidades do Mês</span>
            </button>

            <button
              onClick={() => setModalNova(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-lg shadow-orange-500/20 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Mensalidade</span>
            </button>
          </div>
        )}
      </div>

      {/* Cards de Resumo Financeiro (KPIs) com Filtro Bidirecional Ativo */}
      <div
        className={`grid gap-3 ${
          session?.isCliente ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {/* Total Faturado e Recebido (Pago): Ocultos estritamente para o perfil Cliente */}
        {!session?.isCliente && (
          <>
            {/* Total Previsto */}
            <TiltCard
              onClick={() => setFiltroStatus("todos")}
              spotlightColor="rgba(59, 130, 246, 0.16)"
              className={`p-4 rounded-2xl border shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between cursor-pointer transition ${
                filtroStatus === "todos"
                  ? "border-blue-500/60 ring-2 ring-blue-500/20 bg-blue-500/5 dark:bg-blue-900/20"
                  : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-blue-400/50"
              }`}
            >
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-xs mb-1">
                <span className="font-semibold">Total Faturado</span>
                <TrendingUp className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-black font-mono text-slate-900 dark:text-slate-100">
                  R$ {resumo.totalPrevisto.toFixed(2)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {resumo.qtdTotal} cobranças cadastradas
                </div>
              </div>
            </TiltCard>

            {/* Total Recebido */}
            <TiltCard
              onClick={() => setFiltroStatus(filtroStatus === "pago" ? "todos" : "pago")}
              spotlightColor="rgba(16, 185, 129, 0.18)"
              className={`p-4 rounded-2xl border shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between cursor-pointer transition ${
                filtroStatus === "pago"
                  ? "border-orange-500/60 ring-2 ring-orange-500/20 bg-orange-500/5 dark:bg-emerald-900/20"
                  : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-orange-400/50"
              }`}
            >
              <div className="flex items-center justify-between text-orange-600 dark:text-orange-400 text-xs mb-1">
                <span className="font-semibold">Recebido (Pago)</span>
                <CheckCircle2 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-black font-mono text-orange-600 dark:text-orange-400">
                  R$ {resumo.totalRecebido.toFixed(2)}
                </div>
                <div className="text-[11px] text-orange-700 dark:text-orange-400/80 mt-0.5 font-medium">
                  {resumo.qtdRecebido} pagas
                </div>
              </div>
            </TiltCard>
            {/* Total Pendente (A Vencer): Oculto estritamente para o perfil Cliente */}
            <TiltCard
              onClick={() => setFiltroStatus(filtroStatus === "pendente" ? "todos" : "pendente")}
              spotlightColor="rgba(245, 158, 11, 0.18)"
              className={`p-4 rounded-2xl border shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between cursor-pointer transition ${
                filtroStatus === "pendente"
                  ? "border-amber-500/60 ring-2 ring-amber-500/20 bg-amber-500/5 dark:bg-amber-900/20"
                  : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-amber-400/50"
              }`}
            >
              <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs mb-1">
                <span className="font-semibold">A Vencer (Pendente)</span>
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="text-lg sm:text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                  R$ {resumo.totalPendente.toFixed(2)}
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-400/80 mt-0.5 font-medium">
                  {resumo.qtdPendente} pendentes
                </div>
              </div>
            </TiltCard>
          </>
        )}

        {/* Status Financeiro do Cliente (substitui A Vencer sem expor montante futuro a pagar) */}
        {session?.isCliente &&
          (() => {
            const isBloqueado = statusCardCliente.situacao === "bloqueado";
            const isAtrasado = statusCardCliente.situacao === "atrasado";
            const filtroAlvoCard = isBloqueado || isAtrasado ? "vencido" : "pago";
            const ativoNoFiltro = filtroStatus === filtroAlvoCard;
            const spotlight = isBloqueado
              ? "rgba(244, 63, 94, 0.18)"
              : isAtrasado
                ? "rgba(245, 158, 11, 0.18)"
                : "rgba(16, 185, 129, 0.18)";

            return (
              <TiltCard
                onClick={() => setFiltroStatus(ativoNoFiltro ? "todos" : filtroAlvoCard)}
                spotlightColor={spotlight}
                className={`p-4 rounded-2xl border shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between cursor-pointer transition ${
                  ativoNoFiltro
                    ? isBloqueado
                      ? "border-rose-500/60 ring-2 ring-rose-500/20 bg-rose-500/5 dark:bg-rose-900/20"
                      : isAtrasado
                        ? "border-amber-500/60 ring-2 ring-amber-500/20 bg-amber-500/5 dark:bg-amber-900/20"
                        : "border-orange-500/60 ring-2 ring-orange-500/20 bg-orange-500/5 dark:bg-emerald-900/20"
                    : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-slate-400/60"
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs mb-1 ${
                    isBloqueado
                      ? "text-rose-600 dark:text-rose-400"
                      : isAtrasado
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-orange-600 dark:text-orange-400"
                  }`}
                >
                  <span className="font-semibold">Status Financeiro</span>
                  {isBloqueado ? (
                    <Lock className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  ) : isAtrasado ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  )}
                </div>
                <div>
                  <div
                    className={`text-lg sm:text-xl font-black ${
                      isBloqueado
                        ? "text-rose-600 dark:text-rose-400"
                        : isAtrasado
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {statusCardCliente.label}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 font-medium ${
                      isBloqueado
                        ? "text-rose-700 dark:text-rose-400/80"
                        : isAtrasado
                          ? "text-amber-700 dark:text-amber-400/80"
                          : "text-orange-700 dark:text-orange-400/80"
                    }`}
                  >
                    {statusCardCliente.descricao}
                  </div>
                </div>
              </TiltCard>
            );
          })()}

        {/* Total Vencido */}
        <TiltCard
          onClick={() => setFiltroStatus(filtroStatus === "vencido" ? "todos" : "vencido")}
          spotlightColor="rgba(244, 63, 94, 0.18)"
          className={`p-4 rounded-2xl border shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex flex-col justify-between cursor-pointer transition ${
            filtroStatus === "vencido"
              ? "border-rose-500/60 ring-2 ring-rose-500/20 bg-rose-500/5 dark:bg-rose-900/20"
              : "bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 hover:border-rose-400/50"
          }`}
        >
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs mb-1">
            <span className="font-semibold">Em Atraso (Vencido)</span>
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-black font-mono text-rose-600 dark:text-rose-400">
              R$ {resumo.totalVencido.toFixed(2)}
            </div>
            <div className="text-[11px] text-rose-700 dark:text-rose-400/80 mt-0.5 font-medium">
              {resumo.qtdVencido} vencidas
            </div>
          </div>
        </TiltCard>
      </div>

      {/* Busca e Filtros com Consulta por Mês e Ano */}
      <div className="flex flex-col gap-3 bg-[#eaf0f8] dark:bg-slate-900/40 border border-slate-300/60 dark:border-slate-800/80 p-3.5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              placeholder={
                session?.isCliente
                  ? "Buscar por ano ou mês de referência..."
                  : "Buscar por cliente ou documento..."
              }
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Seletor de Mês de Competência */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-300/70 dark:border-slate-800 text-xs shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none">
              <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none cursor-pointer"
              >
                <option value="todos">Todos os Meses</option>
                <option value="0">Mês 0 - Adesão / Ativação</option>
                <option value="1">01 - Janeiro</option>
                <option value="2">02 - Fevereiro</option>
                <option value="3">03 - Março</option>
                <option value="4">04 - Abril</option>
                <option value="5">05 - Maio</option>
                <option value="6">06 - Junho</option>
                <option value="7">07 - Julho</option>
                <option value="8">08 - Agosto</option>
                <option value="9">09 - Setembro</option>
                <option value="10">10 - Outubro</option>
                <option value="11">11 - Novembro</option>
                <option value="12">12 - Dezembro</option>
              </select>
            </div>

            {/* Seletor de Ano */}
            <div className="bg-white dark:bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-300/70 dark:border-slate-800 text-xs shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none">
              <select
                value={filtroAno}
                onChange={(e) => setFiltroAno(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none cursor-pointer font-mono"
              >
                <option value="todos">Todos os Anos</option>
                {anosDisponiveis.map((a) => (
                  <option key={a} value={String(a)}>
                    Ano {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Filtros de Status */}
        <div className="flex flex-wrap items-center gap-1.5 w-full text-xs pt-2 border-t border-slate-300/50 dark:border-slate-800/40">
          {[
            { id: "todos", label: `Todos (${resumo.qtdTotal})` },
            { id: "pendente", label: `Pendente (${resumo.qtdPendente})` },
            { id: "pago", label: `Pago (${resumo.qtdRecebido})` },
            { id: "vencido", label: `Vencido (${resumo.qtdVencido})` },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setFiltroStatus(st.id)}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                filtroStatus === st.id
                  ? "bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-500/30 font-bold shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {carregando ? (
          <div className="py-12 text-center text-slate-500 text-xs">Carregando mensalidades...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-6 space-y-2 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
            <div>Nenhuma cobrança encontrada para os filtros selecionados.</div>
            {isAdm && (
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                Utilize o botão{" "}
                <span className="text-sky-600 dark:text-sky-400 font-bold">
                  "Gerar Mensalidades do Mês"
                </span>{" "}
                no topo para gerar automaticamente as cobranças para seus clientes ativos.
              </div>
            )}
          </div>
        ) : (
          filtrados.map((m) => {
            const isPago = m.status === "pago";
            const isVencido = m.status === "vencido";
            const isAdesao = m.mes_referencia === 0;
            const parcelaFmt = isAdesao
              ? ""
              : formatarParcelaMensalidade(m.numero_parcela, m.total_parcelas);

            const enc =
              isVencido && m.data_vencimento
                ? calcularEncargosAtraso(Number(m.valor), m.data_vencimento)
                : null;

            return (
              <div
                key={m.id}
                className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition bg-[#eaf0f8] dark:bg-slate-900/60 border-slate-300/60 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] dark:hover:border-slate-700 ${
                  isAdesao ? "border-purple-500/40" : ""
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      {m.clientes?.nome_razao_social || "Cliente"}
                    </span>
                    {isAdesao ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                        Taxa de Instalação e Ativação
                      </span>
                    ) : (
                      <>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isPago
                              ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30"
                              : isVencido
                                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                : "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {m.status}
                        </span>
                        {parcelaFmt && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                            Parcela {parcelaFmt}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>
                      Referência:{" "}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {isAdesao
                          ? `Adesão (${m.ano_referencia})`
                          : `${formatarCompetenciaMensalidade(m.mes_referencia, m.ano_referencia)}${parcelaFmt ? ` (${parcelaFmt})` : ""}`}
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Vencimento:{" "}
                      <span
                        className={`font-mono font-semibold ${isVencido ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-300"}`}
                      >
                        {m.data_vencimento
                          ? m.data_vencimento.split("-").reverse().join("/")
                          : "--/--/----"}
                      </span>
                    </span>
                    {isPago && m.data_pagamento && (
                      <>
                        <span>·</span>
                        <span className="text-orange-600 dark:text-orange-400 text-[11px] font-semibold">
                          Pago em: {new Date(m.data_pagamento).toLocaleDateString("pt-BR")}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Alerta de atraso com cálculo diário de juros e mora legal */}
                  {enc && enc.diasAtraso > 0 && (
                    <div className="mt-1.5 inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] font-mono text-rose-700 dark:text-rose-300">
                      <span>{enc.diasAtraso}d de atraso</span>
                      <span>·</span>
                      <span>
                        Hoje: <strong>R$ {enc.valorTotalAtualizado.toFixed(2)}</strong> (+R${" "}
                        {enc.totalEncargos.toFixed(2)} multa 2% e juros 1% a.m.)
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-300/60 dark:border-slate-800/80">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                      {enc ? "Valor Atualizado" : "Valor"}
                    </span>
                    <span
                      className={`text-sm font-black font-mono ${
                        isPago
                          ? "text-orange-600 dark:text-orange-400"
                          : isVencido
                            ? "text-rose-600 dark:text-rose-400"
                            : isAdesao
                              ? "text-purple-600 dark:text-purple-400"
                              : "text-slate-900 dark:text-slate-200"
                      }`}
                    >
                      R$ {enc ? enc.valorTotalAtualizado.toFixed(2) : Number(m.valor).toFixed(2)}
                    </span>
                    {enc && (
                      <span className="text-[10px] text-slate-500 block font-mono">
                        Original: R$ {Number(m.valor).toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isPago && (
                      <>
                        {isAdm ? (
                          <button
                            onClick={() => handleNotificarClienteMensalidade(m)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-sm flex items-center gap-1"
                            title="Emitir notificação imediata de fatura/vencimento para o cliente"
                          >
                            <Bell className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Notificar</span>
                          </button>
                        ) : // Opção para o cliente informar pagamento
                        m.comprovante_url ? (
                          <span
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-sky-500/15 border border-sky-500/30 text-sky-700 dark:text-sky-300 flex items-center gap-1"
                            title="Pagamento informado. Aguardando conferência e baixa pela administração."
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Aguardando Baixa</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => setModalInformarItem(m)}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow-sm flex items-center gap-1"
                            title="Informar que o pagamento desta fatura já foi realizado"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Informar Pagamento</span>
                          </button>
                        )}

                        <button
                          onClick={() => abrirPixMensalidade(m)}
                          disabled={gerandoPixId === m.id}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm flex items-center gap-1"
                          title="Ver QR Code PIX com valor atualizado do dia"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>{gerandoPixId === m.id ? "..." : "PIX"}</span>
                        </button>

                        {isAdm && (
                          <button
                            onClick={() =>
                              setModalEditarVencimento({
                                mensalidade: m,
                                novaData:
                                  m.data_vencimento || new Date().toISOString().split("T")[0],
                                escopo: "todas_futuras",
                              })
                            }
                            className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-sky-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                            title="Alterar data de vencimento desta cobrança"
                          >
                            <Calendar className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}

                    {isAdm && (
                      <>
                        {!isPago ? (
                          <button
                            onClick={() => handleBaixa(m.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-slate-950 transition shadow"
                          >
                            Baixar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReabrir(m.id, m.data_vencimento)}
                            title="Reabrir cobrança como pendente"
                            className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}

                        <button
                          onClick={() => handleExcluir(m.id)}
                          title="Excluir cobrança"
                          className="p-1.5 rounded-xl text-xs text-slate-500 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal QR Code PIX Individual com Recálculo Diário */}
      {modalPixItem && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-center max-h-[90vh] overflow-y-auto my-auto">
              <div className="flex items-center justify-between border-b border-slate-300/60 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pagamento PIX
                </span>
                <button
                  onClick={() => setModalPixItem(null)}
                  className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {modalPixItem.mensalidade.clientes?.nome_razao_social || `Cobrança ${APP_NOME}`}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {modalPixItem.mensalidade.mes_referencia === 0
                    ? "Taxa de Instalação e Ativação"
                    : `Competência ${formatarCompetenciaMensalidade(modalPixItem.mensalidade.mes_referencia, modalPixItem.mensalidade.ano_referencia)}${
                        formatarParcelaMensalidade(
                          modalPixItem.mensalidade.numero_parcela,
                          modalPixItem.mensalidade.total_parcelas,
                        )
                          ? ` · Parcela ${formatarParcelaMensalidade(
                              modalPixItem.mensalidade.numero_parcela,
                              modalPixItem.mensalidade.total_parcelas,
                            )}`
                          : ""
                      }`}
                </p>
              </div>

              {/* Detalhes de juros se houver atraso */}
              {modalPixItem.diasAtraso !== undefined && modalPixItem.diasAtraso > 0 && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-left text-[11px] font-mono space-y-0.5">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Valor Original:</span>
                    <span>R$ {Number(modalPixItem.mensalidade.valor).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 dark:text-rose-400">
                    <span>Multa 2% + Juros 1% a.m.:</span>
                    <span>+ R$ {modalPixItem.totalEncargos?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-800 dark:text-slate-200 font-bold pt-1 border-t border-rose-500/30">
                    <span>Total Atualizado:</span>
                    <span>R$ {modalPixItem.valorFinal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Imagem do QR Code */}
              <div className="bg-white p-3 rounded-2xl mx-auto w-fit shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-inner">
                <img
                  src={modalPixItem.dataUrl}
                  alt="QR Code PIX"
                  className="w-48 h-48 object-contain"
                />
              </div>

              <div className="text-xs font-mono font-black text-orange-600 dark:text-orange-400">
                R$ {modalPixItem.valorFinal.toFixed(2)}
              </div>

              {/* Código Copia e Cola */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(modalPixItem.payload);
                  setCopiadoPix(true);
                  toast.success("Código PIX Copia e Cola copiado!");
                  setTimeout(() => setCopiadoPix(false), 2000);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20"
              >
                <QrCode className="h-4 w-4" />
                <span>{copiadoPix ? "Copiado!" : "Copiar Código Copia e Cola"}</span>
              </button>

              {/* Disparo Direto de Notificação de Vencimento e PIX */}
              <button
                onClick={() =>
                  handleNotificarClienteMensalidade(
                    modalPixItem.mensalidade,
                    modalPixItem.payload,
                    modalPixItem.valorFinal,
                  )
                }
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <Bell className="h-4 w-4" />
                <span>Notificar Cliente Imediatamente</span>
              </button>

              {isAdm && (
                <button
                  onClick={() => {
                    const id = modalPixItem.mensalidade.id;
                    setModalPixItem(null);
                    handleBaixa(id);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs transition"
                >
                  Confirmar Baixa Imediata
                </button>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modais */}
      {modalGerarLote && (
        <ModalGerarMensalidades
          onFechar={() => setModalGerarLote(false)}
          onSucesso={() => {
            setModalGerarLote(false);
            carregar();
          }}
          totalClientesAptos={clientes.length}
        />
      )}

      {/* Modal Alterar Vencimento com Pergunta de Escopo */}
      {modalEditarVencimento && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-fadeIn select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl text-slate-800 dark:text-slate-100 max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-hidden my-auto flex flex-col transition-colors">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-900/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      Alterar Vencimento
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {modalEditarVencimento.mensalidade.clientes?.nome_razao_social || "Cliente"} ·
                      Competência{" "}
                      {modalEditarVencimento.mensalidade.mes_referencia === 0
                        ? "Adesão"
                        : `${formatarCompetenciaMensalidade(
                            modalEditarVencimento.mensalidade.mes_referencia,
                            modalEditarVencimento.mensalidade.ano_referencia,
                          )}${
                            formatarParcelaMensalidade(
                              modalEditarVencimento.mensalidade.numero_parcela,
                              modalEditarVencimento.mensalidade.total_parcelas,
                            )
                              ? ` · Parcela ${formatarParcelaMensalidade(
                                  modalEditarVencimento.mensalidade.numero_parcela,
                                  modalEditarVencimento.mensalidade.total_parcelas,
                                )}`
                              : ""
                          }`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalEditarVencimento(null)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>

              {/* Form com Rolagem Interna */}
              <form
                onSubmit={handleSalvarVencimento}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      Nova Data de Vencimento
                    </label>
                    <input
                      type="date"
                      value={modalEditarVencimento.novaData}
                      onChange={(e) =>
                        setModalEditarVencimento({
                          ...modalEditarVencimento,
                          novaData: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500 font-mono shadow-xs font-bold"
                      required
                    />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                      Vencimento atual:{" "}
                      {modalEditarVencimento.mensalidade.data_vencimento
                        ? modalEditarVencimento.mensalidade.data_vencimento
                            .split("-")
                            .reverse()
                            .join("/")
                        : "Não informado"}
                    </span>
                  </div>

                  {/* Pergunta de Escopo */}
                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 space-y-2 text-xs">
                    <span className="font-bold text-sky-900 dark:text-sky-200 block text-[11px] uppercase tracking-wider">
                      Deseja aplicar a alteração em:
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
                      Escolha se a mudança de data deve afetar apenas esta cobrança pontual ou
                      recalcular também todas as próximas mensalidades do cliente.
                    </p>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setModalEditarVencimento({
                            ...modalEditarVencimento,
                            escopo: "somente_esta",
                          })
                        }
                        className={`w-full p-2.5 rounded-xl border text-left transition ${
                          modalEditarVencimento.escopo === "somente_esta"
                            ? "bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-500 font-bold"
                            : "bg-white/60 dark:bg-slate-950/60 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <span>{modalEditarVencimento.escopo === "somente_esta" ? "●" : "○"}</span>
                          <span>Somente este pagamento</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal pl-4 mt-0.5">
                          Altera apenas esta fatura pontual. As próximas cobranças continuam na data
                          antiga.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setModalEditarVencimento({
                            ...modalEditarVencimento,
                            escopo: "todas_futuras",
                          })
                        }
                        className={`w-full p-2.5 rounded-xl border text-left transition ${
                          modalEditarVencimento.escopo === "todas_futuras"
                            ? "bg-white dark:bg-slate-900 border-sky-500 text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-500 font-bold"
                            : "bg-white/60 dark:bg-slate-950/60 border-slate-300/70 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <span>
                            {modalEditarVencimento.escopo === "todas_futuras" ? "●" : "○"}
                          </span>
                          <span>Este e todos os futuros</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal pl-4 mt-0.5">
                          Altera esta fatura, atualiza o dia de vencimento no cadastro do cliente e
                          recalcula todas as cobranças futuras pendentes.
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rodapé Fixo */}
                <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalEditarVencimento(null)}
                    disabled={salvandoVencimento}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoVencimento}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {salvandoVencimento ? "Salvando..." : "Confirmar Alteração"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {modalNova && (
        <ModalNovaMensalidade
          clientes={clientes}
          onFechar={() => setModalNova(false)}
          onSucesso={() => {
            setModalNova(false);
            carregar();
          }}
        />
      )}

      {modalInformarItem && (
        <ModalInformarPagamento
          mensalidade={modalInformarItem}
          clienteNome={session?.nome || modalInformarItem.clientes?.nome_razao_social}
          onFechar={() => setModalInformarItem(null)}
          onSucesso={() => {
            setModalInformarItem(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}
