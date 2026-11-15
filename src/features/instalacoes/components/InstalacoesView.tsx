import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CreditCard,
  Filter,
  DollarSign,
  Car,
  Radio,
  User,
  RotateCcw,
  Check,
  ChevronRight,
  Sparkles,
  QrCode,
  Calendar,
  MapPin,
  MessageCircle,
  Boxes,
  ScanLine,
  Camera,
  ExternalLink,
  Send,
  LayoutGrid,
  List,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Instalacao } from "../types";
import {
  carregarInstalacoes,
  marcarPagamentoInstalacao,
  calcularResumoRepasse,
  obterDemandasInstaladorCompleto,
  instaladorSolicitarEnderecoCliente,
  formatarLabelTipoVeiculo,
  formatarTituloVeiculoInstalacao,
  ehInstalacaoDiretaSemInstalador,
  formatarDataConclusaoCurta,
} from "../services/instalacaoService";
import { NovaInstalacaoModal } from "./NovaInstalacaoModal";
import { ModalSolicitarRemanejamento } from "./ModalSolicitarRemanejamento";
import { DetalhesHistoricoInstalacaoModal } from "./DetalhesHistoricoInstalacaoModal";
import { ModalPagamentoPixInstalacao } from "./ModalPagamentoPixInstalacao";
import { ModalAgendamentoInstalacao } from "./ModalAgendamentoInstalacao";
import { ModalDadosInstalador } from "./ModalDadosInstalador";
import { ModalFinalizarInstalacaoTecnica } from "./ModalFinalizarInstalacaoTecnica";
import { CameraBarcodeScannerModal } from "@/shared/components/CameraBarcodeScannerModal";
import { TiltCard } from "@/shared/components/TiltCard";
import { instaladorConfirmarKit } from "@/features/estoque/services/rastreadorChipService";
import { temKitDisponibilizado, ehPlaceholderImei } from "../utils/kitDisponibilizado";

export type AbaInstalacao =
  "a_agendar" | "a_instalar" | "instalados" | "ordens" | "agendamentos" | "financeiro";

export function InstalacoesView() {
  const { session } = useAuth();
  const isAdmOuSuper = session?.isAdmin || session?.isSuperAdmin;
  const isOperador = session?.isOperador;
  const isInstalador = session?.isInstalador;
  const podeCriarDemandaInstalacao = isAdmOuSuper || isOperador;

  const [abaAtiva, setAbaAtiva] = useState<AbaInstalacao>(isInstalador ? "a_instalar" : "ordens");
  const [instalacoes, setInstalacoes] = useState<Instalacao[]>([]);
  const [clientesAgendamento, setClientesAgendamento] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Sincronizar aba ativa para instaladores ao carregar sessão
  useEffect(() => {
    if (isInstalador) {
      setAbaAtiva((prev) => (prev === "ordens" || prev === "agendamentos" ? "a_instalar" : prev));
    }
  }, [isInstalador]);

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroPagamento, setFiltroPagamento] = useState<string>("todos");
  const [filtroInstaladorId, setFiltroInstaladorId] = useState<string>("todos");
  const [modoExibicao, setModoExibicao] = useState<"cards" | "lista">(() => {
    if (typeof window !== "undefined") {
      const salvo = localStorage.getItem("hunter_instalacoes_modo_exibicao");
      if (salvo === "cards" || salvo === "lista") return salvo;
    }
    return "cards";
  });

  // Modais
  const [modalNovaAberto, setModalNovaAberto] = useState(false);
  const [modalRemanejamentoAberto, setModalRemanejamentoAberto] = useState(false);
  const [instalacaoEdicao, setInstalacaoEdicao] = useState<Instalacao | null>(null);
  const [instalacaoDetalhes, setInstalacaoDetalhes] = useState<Instalacao | null>(null);
  const [instalacaoPagamentoPix, setInstalacaoPagamentoPix] = useState<Instalacao | null>(null);
  const [modalAgendamentoCliente, setModalAgendamentoCliente] = useState<any | null>(null);
  const [clientePreSelecionadoId, setClientePreSelecionadoId] = useState<string | null>(null);
  const [modalDadosInstaladorAberto, setModalDadosInstaladorAberto] = useState(false);
  const [conferindoKitInstalacao, setConferindoKitInstalacao] = useState<Instalacao | null>(null);
  const [instalacaoFinalizarTecnica, setInstalacaoFinalizarTecnica] = useState<Instalacao | null>(
    null,
  );

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      // 1. Prioridade máxima: Tentar carregar via RPC canônica com SECURITY DEFINER
      // Essa RPC executa no PostgreSQL e retorna imediatamente ordens e clientes atribuídos ao instalador sem risco de RLS
      const alvoId = isInstalador
        ? session?.userId
        : filtroInstaladorId !== "todos"
          ? filtroInstaladorId
          : undefined;

      const rpcResult = await obterDemandasInstaladorCompleto(alvoId);
      if (rpcResult && rpcResult.success) {
        setInstalacoes(rpcResult.ordens || []);
        setClientesAgendamento(rpcResult.agendamentos || []);
        return;
      }

      // 2. Fallback resiliente direto via tabelas caso a RPC ainda não tenha sido aplicada no banco
      const filtros: any = {};
      if (filtroInstaladorId !== "todos") filtros.instaladorId = filtroInstaladorId;

      if (isInstalador && session?.userId) {
        filtros.instaladorId = session.userId;
      }

      let queryClientes = supabase.from("clientes").select(
        `
          id,
          nome_razao_social,
          documento,
          telefone,
          email,
          status,
          status_agendamento,
          data_agendamento,
          hora_agendamento,
          instalador_id,
          instalador:instalador_id (id, nome, endereco_instalacao),
          veiculos (id, placa, modelo)
        `,
      );

      if (isInstalador && session?.userId) {
        queryClientes = queryClientes.eq("instalador_id", session.userId);
      } else {
        queryClientes = queryClientes.or(
          "status.eq.aguardando_instalacao,status_agendamento.is.null,status_agendamento.neq.concluido",
        );
      }

      queryClientes = queryClientes.order("created_at", { ascending: false });

      const [dados, { data: cData }] = await Promise.all([
        carregarInstalacoes(filtros),
        queryClientes,
      ]);

      setInstalacoes(dados);

      if (isInstalador) {
        const temAgendadas = dados.some(
          (d) => d.status !== "concluida" && Boolean(d.data_agendamento),
        );
        const temAAgendar = dados.some((d) => d.status !== "concluida" && !d.data_agendamento);
        if (!temAgendadas && temAAgendar) {
          setAbaAtiva((prev) => (prev === "a_instalar" ? "a_agendar" : prev));
        }
      }

      // Unificar clientes: se houver alguma ordem em dados cujo cliente_id não esteja em cData,
      // resgatar do banco para que o instalador consiga agendar sem depender de status estrito
      const mapaClientes = new Map<string, any>();
      (cData || []).forEach((c) => {
        if (c?.id) mapaClientes.set(c.id, c);
      });

      const ordensNaoConcluidas = dados.filter((d) => d.status !== "concluida");
      const idsClientesFaltantes = ordensNaoConcluidas
        .map((o) => o.cliente_id)
        .filter((id): id is string => Boolean(id) && !mapaClientes.has(id));

      if (idsClientesFaltantes.length > 0) {
        const { data: faltantes } = await supabase
          .from("clientes")
          .select(
            `
            id,
            nome_razao_social,
            documento,
            telefone,
            email,
            status,
            status_agendamento,
            data_agendamento,
            hora_agendamento,
            instalador_id,
            instalador:instalador_id (id, nome, endereco_instalacao),
            veiculos (id, placa, modelo)
          `,
          )
          .in("id", Array.from(new Set(idsClientesFaltantes)));

        (faltantes || []).forEach((c) => {
          if (c?.id) mapaClientes.set(c.id, c);
        });
      }

      setClientesAgendamento(Array.from(mapaClientes.values()));
    } finally {
      setCarregando(false);
    }
  }, [filtroInstaladorId, isInstalador, session?.userId]);

  useEffect(() => {
    carregarDados();

    // Inscrição Realtime nos canais de instalações, clientes, veículos e notificações para atualização imediata
    const canalInstalacoes = supabase
      .channel("hunter_instalacoes_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "instalacoes" }, () => {
        carregarDados();
      })
      .subscribe();

    const canalClientes = supabase
      .channel("hunter_instalacoes_clientes_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => {
        carregarDados();
      })
      .subscribe();

    const canalVeiculos = supabase
      .channel("hunter_instalacoes_veiculos_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "veiculos" }, () => {
        carregarDados();
      })
      .subscribe();

    const canalNotificacoes = supabase
      .channel("hunter_instalacoes_notificacoes_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes_sistema" },
        () => {
          carregarDados();
        },
      )
      .subscribe();

    const onAtualizarDemandas = () => {
      carregarDados();
    };

    window.addEventListener("hunter:atualizar_demandas", onAtualizarDemandas);
    window.addEventListener("hunter:nova_notificacao", onAtualizarDemandas);

    return () => {
      supabase.removeChannel(canalInstalacoes);
      supabase.removeChannel(canalClientes);
      supabase.removeChannel(canalVeiculos);
      supabase.removeChannel(canalNotificacoes);
      window.removeEventListener("hunter:atualizar_demandas", onAtualizarDemandas);
      window.removeEventListener("hunter:nova_notificacao", onAtualizarDemandas);
    };
  }, [carregarDados]);

  // Lista de instaladores únicos para filtro administrativo
  const listaInstaladores = useMemo(() => {
    const mapa = new Map<string, string>();
    instalacoes.forEach((inst) => {
      if (inst.instalador_id && inst.instalador_nome) {
        mapa.set(inst.instalador_id, inst.instalador_nome);
      }
    });
    return Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome }));
  }, [instalacoes]);

  // Filtro de status, pagamento e busca local
  const instalacoesFiltradas = useMemo(() => {
    let lista = instalacoes;

    // Filtro por status
    if (filtroStatus !== "todos") {
      if (filtroStatus === "com_pendencia") {
        lista = lista.filter(
          (inst) =>
            inst.status === "concluida_com_pendencia" ||
            inst.status === "nao_instalado" ||
            (inst.status as string) !== "concluida",
        );
      } else {
        lista = lista.filter((inst) => (inst.status as string) === filtroStatus);
      }
    }

    // Filtro por pagamento
    if (filtroPagamento !== "todos") {
      lista = lista.filter((inst) => inst.status_pagamento === filtroPagamento);
    }

    const b = busca.trim().toLowerCase();
    if (!b) return lista;

    return lista.filter(
      (inst) =>
        inst.placa?.toLowerCase().includes(b) ||
        inst.marca?.toLowerCase().includes(b) ||
        inst.modelo?.toLowerCase().includes(b) ||
        (inst.cliente_nome && inst.cliente_nome.toLowerCase().includes(b)) ||
        inst.rastreador_imei?.toLowerCase().includes(b),
    );
  }, [instalacoes, filtroStatus, filtroPagamento, busca]);

  const formatarMoeda = (val: number | string | null | undefined): string => {
    const num = Number(val) || 0;
    return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const totalAInstalar = useMemo(() => {
    return instalacoes.filter((i) => i.status !== "concluida" && Boolean(i.data_agendamento))
      .length;
  }, [instalacoes]);

  const ordensComRastreadorProntas = useMemo(() => {
    return instalacoes.filter(
      (i) =>
        i.status !== "concluida" &&
        Boolean(i.data_agendamento) &&
        Boolean(
          i.rastreador_imei &&
          i.rastreador_imei !== "AGUARDANDO ESTOQUE" &&
          i.rastreador_imei !== "PENDENTE" &&
          i.rastreador_imei !== "A DEFINIR" &&
          i.rastreador_imei !== "SEM RASTREADOR",
        ),
    ).length;
  }, [instalacoes]);

  const ordensAguardandoRastreador = useMemo(() => {
    return instalacoes.filter((i) => i.status !== "concluida" && !temKitDisponibilizado(i)).length;
  }, [instalacoes]);

  const totalAAgendar = useMemo(() => {
    return instalacoes.filter((i) => i.status !== "concluida" && !i.data_agendamento).length;
  }, [instalacoes]);

  const totalInstalados = useMemo(() => {
    return instalacoes.filter((i) => i.status === "concluida").length;
  }, [instalacoes]);

  // Lista de ordens filtradas de acordo com a aba do instalador ou do operador
  const ordensExibidas = useMemo(() => {
    let base = instalacoesFiltradas;
    if (isInstalador) {
      if (abaAtiva === "a_agendar") {
        base = base.filter((i) => i.status !== "concluida" && !i.data_agendamento);
      } else if (abaAtiva === "a_instalar") {
        base = base.filter((i) => i.status !== "concluida" && Boolean(i.data_agendamento));
      } else if (abaAtiva === "instalados") {
        base = base.filter((i) => i.status === "concluida");
      }
    }
    return base;
  }, [instalacoesFiltradas, isInstalador, abaAtiva]);

  // Resumo Financeiro com previsão de agendamentos
  const resumoFinanceiro = useMemo(() => {
    const valorUnitario =
      session?.valor_instalacao_sem_bloqueador !== undefined &&
      session?.valor_instalacao_sem_bloqueador !== null
        ? Number(session.valor_instalacao_sem_bloqueador)
        : session?.valorPorInstalacao !== undefined && session?.valorPorInstalacao !== null
          ? Number(session.valorPorInstalacao)
          : 0;
    // O resumo no topo deve sempre computar a base de instalações global (respeitando o instalador selecionado)
    return calcularResumoRepasse(instalacoes, clientesAgendamento, valorUnitario);
  }, [
    instalacoes,
    clientesAgendamento,
    session?.valor_instalacao_sem_bloqueador,
    session?.valorPorInstalacao,
  ]);

  const handleMarcarPagamento = async (id: string, novoStatus: "pago" | "pendente") => {
    const ok = await marcarPagamentoInstalacao(id, novoStatus);
    if (ok.success) {
      toast.success(ok.message);
      carregarDados();
    } else {
      toast.error(ok.message);
    }
  };

  const getStatusBadge = (status: string, dataAgendamento?: string | null) => {
    switch (status) {
      case "concluida":
        return {
          label: "Concluída",
          icone: CheckCircle2,
          classe: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        };
      case "concluida_com_pendencia":
        return {
          label: "Com Pendência",
          icone: AlertTriangle,
          classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        };
      case "nao_instalado":
        return {
          label: "Não Instalado",
          icone: AlertTriangle,
          classe: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
        };
      case "agendada":
        return dataAgendamento
          ? {
              label: "Agendada",
              icone: Clock,
              classe: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
            }
          : {
              label: "A Agendar",
              icone: Calendar,
              classe: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
            };
      default:
        return {
          label: status,
          icone: Clock,
          classe: "bg-slate-500/15 text-slate-400 border-slate-500/30",
        };
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 select-none animate-fadeIn">
      {/* 1. Header do Módulo de Instalação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-[#fbf2e9] dark:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                  Instalação de Equipamentos
                </h1>
                {isInstalador && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                    Instalador Técnico
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isInstalador
                  ? `Bem-vindo, ${session?.nome}. Registro de instalações físicas e apuração de repasses.`
                  : "Controle de instalações físicas de rastreadores J16, histórico e conciliação de repasses."}
              </p>
            </div>
          </div>
        </div>

        {/* Ações do Header */}
        <div className="flex items-center gap-2 flex-wrap">
          {isInstalador && session?.userId && (
            <button
              onClick={() => setModalDadosInstaladorAberto(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#fbf2e9] dark:bg-slate-800 hover:bg-[#dfe7f2] dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 font-bold text-xs border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
            >
              <CreditCard className="h-4 w-4" />
              <span>Meus Dados e PIX</span>
            </button>
          )}

          {podeCriarDemandaInstalacao && (
            <>
              <button
                onClick={() => setModalRemanejamentoAberto(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#fbf2e9] dark:bg-slate-800 hover:bg-[#dfe7f2] dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 font-bold text-xs border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
                title="Emitir ordem de retirada de equipamento ou remanejamento com 2 chamadas"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Troca / Retirada</span>
              </button>

              <button
                onClick={() => {
                  setInstalacaoEdicao(null);
                  setModalNovaAberto(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none active:shadow-[inset_2px_2px_4px_#047857] transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Nova Instalação</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Banner de Pendências Exclusivo do Instalador */}
      {isInstalador && (totalAAgendar > 0 || totalAInstalar > 0) && (
        <div className="bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/40 dark:border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-800 dark:text-amber-300 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100">
                {totalAAgendar > 0
                  ? `${totalAAgendar} veículo(s) aguardando agendamento de data e local`
                  : ordensComRastreadorProntas > 0
                    ? `${ordensComRastreadorProntas} veículo(s) com rastreador disponível prontos para instalação técnica`
                    : `${ordensAguardandoRastreador} veículo(s) agendados aguardando definição de rastreador pelo operador`}
              </h3>
              <p className="text-xs font-semibold text-amber-900/90 dark:text-amber-300/90 mt-0.5">
                {totalAAgendar > 0
                  ? "Defina o dia, horário e local (oficina ou local do veículo) para atender os veículos atribuídos."
                  : ordensComRastreadorProntas > 0
                    ? "Compareça ou receba os veículos com agendamento confirmado e kit conferido para realizar a instalação física."
                    : "O operador precisa vincular um rastreador em estoque a este veículo antes de iniciar a conferência física e instalação."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Alternador de Abas Canônico Tático (Padrão de Alto Contraste Hunter-Guardian) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl w-full sm:w-fit">
        {isInstalador ? (
          <>
            <button
              type="button"
              onClick={() => setAbaAtiva("a_agendar")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "a_agendar"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <Calendar className="h-4 w-4 shrink-0" />
              <span>A Agendar</span>
              {totalAAgendar > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500 text-white animate-pulse shrink-0">
                  {totalAAgendar}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("a_instalar")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "a_instalar"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <Wrench className="h-4 w-4 shrink-0" />
              <span>A Instalar</span>
              {totalAInstalar > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500 text-white shrink-0">
                  {totalAInstalar}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("instalados")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "instalados"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Instalados</span>
              {totalInstalados > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500 text-white shrink-0">
                  {totalInstalados}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("financeiro")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "financeiro"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              <span>Extrato Financeiro</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAbaAtiva("ordens")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "ordens"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <Wrench className="h-4 w-4 shrink-0" />
              <span>Ordens</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  abaAtiva === "ordens"
                    ? "bg-slate-800 text-slate-200 dark:bg-slate-950/40 dark:text-slate-950"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                {instalacoesFiltradas.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("agendamentos")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "agendamentos"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Agendamentos</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  abaAtiva === "agendamentos"
                    ? "bg-slate-800 text-slate-200 dark:bg-slate-950/40 dark:text-slate-950"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                {clientesAgendamento.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva("financeiro")}
              className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center gap-2 cursor-pointer ${
                abaAtiva === "financeiro"
                  ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
              }`}
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              <span>Repasses Financeiros</span>
            </button>
          </>
        )}
      </div>

      {/* 3. Infográficos Ativos (Visão do Instalador: A Receber, Recebido, Agendados, A Agendar) */}
      {isInstalador ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1: A Receber (R$) */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(245, 158, 11, 0.35)"
            onClick={() => {
              setAbaAtiva("ordens");
              setFiltroPagamento((prev) => (prev === "pendente" ? "todos" : "pendente"));
            }}
            role="button"
            tabIndex={0}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              abaAtiva === "ordens" && filtroPagamento === "pendente"
                ? "bg-amber-500/15 border-amber-500/80 ring-2 ring-amber-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block">
                A Receber
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400 truncate block mt-1">
              R$ {formatarMoeda(resumoFinanceiro.aReceber ?? resumoFinanceiro.valorTotalPendente)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Pendentes de pagamento</span>
          </TiltCard>

          {/* Card 2: Recebido (R$) */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(16, 185, 129, 0.35)"
            onClick={() => {
              setAbaAtiva("ordens");
              setFiltroPagamento((prev) => (prev === "pago" ? "todos" : "pago"));
            }}
            role="button"
            tabIndex={0}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              abaAtiva === "ordens" && filtroPagamento === "pago"
                ? "bg-emerald-500/15 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-emerald-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                Recebido
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 truncate block mt-1">
              R$ {formatarMoeda(resumoFinanceiro.recebido ?? resumoFinanceiro.valorTotalPago)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Quitados pelo operador</span>
          </TiltCard>

          {/* Card 3: A Instalar */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(14, 165, 233, 0.35)"
            onClick={() => setAbaAtiva("a_instalar")}
            role="button"
            tabIndex={0}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              abaAtiva === "a_instalar"
                ? "bg-sky-500/15 border-sky-500/80 ring-2 ring-sky-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-sky-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 block">
                A Instalar
              </span>
              <Wrench className="h-4 w-4 text-sky-500" />
            </div>
            <span className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400 block mt-1">
              {totalAInstalar}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Data/hora confirmada</span>
          </TiltCard>

          {/* Card 4: A Agendar */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(244, 63, 94, 0.35)"
            onClick={() => setAbaAtiva("a_agendar")}
            role="button"
            tabIndex={0}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              abaAtiva === "a_agendar"
                ? "bg-rose-500/15 border-rose-500/80 ring-2 ring-rose-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-rose-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 block">
                A Agendar
              </span>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <span className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400 block mt-1">
              {totalAAgendar}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Aguardando agendamento</span>
          </TiltCard>
        </div>
      ) : (
        /* Visão Administrativa / Operador */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Total de Instalações */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(148, 163, 184, 0.35)"
            onClick={() => {
              setFiltroStatus("todos");
              setFiltroPagamento("todos");
              setAbaAtiva("ordens");
            }}
            title="Clique para ver todas as ordens de instalação"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("todos")}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              filtroStatus === "todos" && filtroPagamento === "todos" && abaAtiva === "ordens"
                ? "bg-emerald-500/10 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-slate-400 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                Total de Instalações
              </span>
              {filtroStatus === "todos" && filtroPagamento === "todos" && abaAtiva === "ordens" && (
                <span className="text-[9px] text-emerald-500 font-bold uppercase">(Ativo)</span>
              )}
            </div>
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
              {resumoFinanceiro.totalInstalacoes}
            </span>
          </TiltCard>

          {/* Concluídas Plenas */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(16, 185, 129, 0.35)"
            onClick={() => {
              setFiltroStatus((st) => (st === "concluida" ? "todos" : "concluida"));
              setAbaAtiva("ordens");
            }}
            title="Clique para filtrar ordens concluídas"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("concluida")}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              filtroStatus === "concluida" && abaAtiva === "ordens"
                ? "bg-emerald-500/15 border-emerald-500/80 ring-2 ring-emerald-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-emerald-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                Concluídas Plenas
              </span>
              {filtroStatus === "concluida" && (
                <span className="text-[9px] text-emerald-500 font-bold uppercase">(Ativo)</span>
              )}
            </div>
            <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {resumoFinanceiro.totalConcluidas}
            </span>
          </TiltCard>

          {/* Pendências / Não Inst. */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(245, 158, 11, 0.35)"
            onClick={() => {
              setFiltroStatus((st) => (st === "com_pendencia" ? "todos" : "com_pendencia"));
              setAbaAtiva("ordens");
            }}
            title="Clique para filtrar ordens com pendências ou não instaladas"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setFiltroStatus("com_pendencia")}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              filtroStatus === "com_pendencia" && abaAtiva === "ordens"
                ? "bg-amber-500/15 border-amber-500/80 ring-2 ring-amber-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-amber-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block">
                Pendências / Não Inst.
              </span>
              {filtroStatus === "com_pendencia" && (
                <span className="text-[9px] text-amber-500 font-bold uppercase">(Ativo)</span>
              )}
            </div>
            <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
              {resumoFinanceiro.totalPendencias + resumoFinanceiro.totalNaoInstaladas}
            </span>
          </TiltCard>

          {/* Repasses Pendentes */}
          <TiltCard
            maxTilt={6}
            spotlightColor="rgba(14, 165, 233, 0.35)"
            onClick={() => setAbaAtiva("financeiro")}
            title="Clique para abrir a aba de repasses financeiros"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setAbaAtiva("financeiro")}
            className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
              abaAtiva === "financeiro"
                ? "bg-sky-500/15 border-sky-500/80 ring-2 ring-sky-500/30 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none"
                : "bg-[#fbf2e9] dark:bg-slate-900 border-slate-300/60 dark:border-slate-800 hover:border-sky-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 block">
                Total a Pagar (Pendente)
              </span>
              {abaAtiva === "financeiro" && (
                <span className="text-[9px] text-sky-500 font-bold uppercase">(Ativo)</span>
              )}
            </div>
            <span className="text-xl sm:text-2xl font-black font-mono text-sky-600 dark:text-sky-400 truncate block">
              R$ {formatarMoeda(resumoFinanceiro.valorTotalPendente)}
            </span>
            {(resumoFinanceiro.valorPrevistoAgendadas || 0) > 0 && (
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5 truncate">
                Previsto em abertas: R$ {formatarMoeda(resumoFinanceiro.valorPrevistoAgendadas)}
              </span>
            )}
          </TiltCard>
        </div>
      )}

      {/* 4. Barra de Filtros e Busca */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por placa, modelo, cliente ou IMEI..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {/* Filtro Status da Instalação */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="todos">Todos os Status</option>
            <option value="concluida">Concluída</option>
            <option value="com_pendencia">Pendências / Não Inst.</option>
            <option value="concluida_com_pendencia">Com Pendência</option>
            <option value="nao_instalado">Não Instalado</option>
            <option value="agendada">Agendada</option>
          </select>

          {/* Filtro de Pagamento */}
          <select
            value={filtroPagamento}
            onChange={(e) => setFiltroPagamento(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="todos">Todos os Pagamentos</option>
            <option value="pendente">Pendente de Pagamento</option>
            <option value="pago">Pago / Quitado</option>
          </select>

          {/* Filtro por Instalador (Apenas para Administrador) */}
          {isAdmOuSuper && listaInstaladores.length > 0 && (
            <select
              value={filtroInstaladorId}
              onChange={(e) => setFiltroInstaladorId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#fbf2e9] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="todos">Todos os Instaladores</option>
              {listaInstaladores.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.nome}
                </option>
              ))}
            </select>
          )}

          {/* Alternador de Visualização Cards / Lista */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/80 dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none shrink-0">
            <button
              type="button"
              onClick={() => {
                setModoExibicao("cards");
                localStorage.setItem("hunter_instalacoes_modo_exibicao", "cards");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                modoExibicao === "cards"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Exibir ordens em formato de Cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModoExibicao("lista");
                localStorage.setItem("hunter_instalacoes_modo_exibicao", "lista");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                modoExibicao === "lista"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Exibir ordens em formato de Lista"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Conteúdo da Aba de Ordens de Instalação (com visão A Agendar, A Instalar e Instalados) */}
      {(abaAtiva === "ordens" ||
        abaAtiva === "a_agendar" ||
        abaAtiva === "a_instalar" ||
        abaAtiva === "instalados") && (
        <div className="space-y-3">
          {carregando ? (
            <div className="text-center py-12 text-xs text-slate-500 font-mono">
              Carregando ordens de instalação...
            </div>
          ) : ordensExibidas.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
              {abaAtiva === "a_agendar"
                ? "Nenhum veículo aguardando agendamento de data no momento."
                : abaAtiva === "a_instalar"
                  ? "Nenhum veículo com agendamento pendente para instalação."
                  : abaAtiva === "instalados"
                    ? "Nenhum veículo concluído encontrado com os filtros selecionados."
                    : "Nenhuma ordem de instalação encontrada com os filtros selecionados."}
            </div>
          ) : modoExibicao === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {ordensExibidas.map((inst) => {
                const s = getStatusBadge(inst.status, inst.data_agendamento);
                const IconeStatus = s.icone;
                const temRastreadorDefinido = temKitDisponibilizado(inst);
                const tituloVeiculo = formatarTituloVeiculoInstalacao(inst);
                const tipoVeiculoLabel = formatarLabelTipoVeiculo((inst as any).tipo_veiculo);
                const ehDireta = ehInstalacaoDiretaSemInstalador(inst);
                const dataConclusaoCurta = formatarDataConclusaoCurta(
                  inst.concluida_at || inst.updated_at,
                );

                return (
                  <div
                    key={inst.id}
                    className="relative overflow-hidden p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-[2px_2px_8px_rgba(0,0,0,0.04)] hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col justify-between space-y-3"
                  >
                    {/* Topo do Card: Placa, Serviço e Status sem cortes */}
                    <div>
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-xs">
                              {inst.placa}
                            </span>
                            {inst.tipo_servico === "retirada" ? (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                Retirada
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                                Instalação
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                              {tipoVeiculoLabel}
                            </span>
                            {inst.ordem_vinculada_id && (
                              <span
                                className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30"
                                title="Ordem vinculada à troca casada de veículo"
                              >
                                Troca Casada
                              </span>
                            )}
                          </div>
                          <h3
                            className="font-bold text-xs text-slate-800 dark:text-slate-200 mt-1.5 truncate"
                            title={tituloVeiculo}
                          >
                            {tituloVeiculo}
                          </h3>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span
                            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-xs ${s.classe}`}
                          >
                            <IconeStatus className="h-3 w-3" />
                            <span>{s.label}</span>
                          </span>
                        </div>
                      </div>

                      {/* Informações Estruturadas em Blocos Táteis */}
                      <div className="mt-3 space-y-2 text-xs">
                        {/* 1. Bloco Operacional (Cliente e Técnico) */}
                        <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <User className="h-3 w-3 text-slate-400" />
                              <span>Cliente:</span>
                            </span>
                            <span
                              className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[170px]"
                              title={inst.cliente_nome}
                            >
                              {inst.cliente_nome}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Wrench className="h-3 w-3 text-slate-400" />
                              <span>{ehDireta ? "Responsável:" : "Instalador:"}</span>
                            </span>
                            <span
                              className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[170px]"
                              title={
                                ehDireta
                                  ? `${inst.instalador_nome} (Instalação Direta)`
                                  : inst.instalador_nome
                              }
                            >
                              {ehDireta ? `${inst.instalador_nome} (Direta)` : inst.instalador_nome}
                            </span>
                          </div>
                        </div>

                        {/* 2. Bloco Hardware, Kit e Local Físico */}
                        <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Radio className="h-3 w-3 text-sky-500" />
                              <span>Rastreador IMEI:</span>
                            </span>
                            {temRastreadorDefinido && !ehPlaceholderImei(inst.rastreador_imei) ? (
                              <span className="font-mono text-sky-600 dark:text-sky-400 font-bold text-[11px] bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                                {inst.rastreador_imei}
                              </span>
                            ) : temRastreadorDefinido ? (
                              <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 font-mono bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full">
                                KIT ATRIBUÍDO
                              </span>
                            ) : (
                              <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                AGUARDANDO ESTOQUE
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                Kit:
                              </span>
                              {!temRastreadorDefinido ? (
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                                  Aguardando
                                </span>
                              ) : inst.kit_confirmado_instalador ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Conferido
                                </span>
                              ) : inst.status === "concluida" ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Instalado (Direto)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md animate-pulse">
                                  <AlertTriangle className="h-3 w-3" />
                                  Pendente
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                Bloqueador:
                              </span>
                              {(inst as any).com_bloqueador || inst.bloqueador_instalado ? (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
                                  Sim
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                                  Não
                                </span>
                              )}
                            </div>
                          </div>

                          {((inst as any).posicao_instalacao ||
                            (inst as any).posicaoInstalacao) && (
                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                Onde Instalou:
                              </span>
                              <span
                                className="font-medium text-slate-800 dark:text-slate-200 text-[11px] truncate max-w-[170px]"
                                title={
                                  (inst as any).posicao_instalacao ||
                                  (inst as any).posicaoInstalacao
                                }
                              >
                                {(inst as any).posicao_instalacao ||
                                  (inst as any).posicaoInstalacao}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {(inst as any).tipo_veiculo === "maquina" ||
                              (inst as any).tipo_veiculo === "trator" ||
                              Number((inst as any).horimetro_inicial || 0) > 0
                                ? "Horímetro Operação:"
                                : inst.tipo_servico === "retirada"
                                  ? "KM na Retirada:"
                                  : "KM / Odômetro:"}
                            </span>
                            {(inst as any).tipo_veiculo === "maquina" ||
                            (inst as any).tipo_veiculo === "trator" ||
                            Number((inst as any).horimetro_inicial || 0) > 0 ? (
                              <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                                {Number((inst as any).horimetro_inicial || 0).toFixed(1)} h
                              </span>
                            ) : (
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                                {inst.km_instalacao} km
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 3. Bloco Agendamento e Repasse Financeiro */}
                        <div className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/60 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-amber-500" />
                              <span>Agendamento:</span>
                            </span>
                            {inst.data_agendamento ? (
                              <span className="font-mono text-sky-600 dark:text-sky-400 font-bold text-[10px] flex items-center gap-1">
                                {inst.data_agendamento.split("-").reverse().join("/")}{" "}
                                {inst.hora_agendamento || ""}
                              </span>
                            ) : inst.status === "concluida" ? (
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                <span>
                                  {dataConclusaoCurta
                                    ? `Concluída em ${dataConclusaoCurta}`
                                    : "Instalação Direta"}
                                </span>
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-bold text-[10px] animate-pulse">
                                Aguardando Data/Hora
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-emerald-500" />
                              <span>Atendimento:</span>
                            </span>
                            {inst.local_tipo === "local_veiculo" ? (
                              <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 flex items-center gap-1">
                                <Car className="h-3 w-3" />
                                <span>No Local</span>
                              </span>
                            ) : ehDireta &&
                              inst.status === "concluida" &&
                              !inst.data_agendamento ? (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                <span>Instalação Direta</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <Wrench className="h-3 w-3 text-amber-500" />
                                <span>Na Oficina</span>
                              </span>
                            )}
                          </div>

                          {/* Endereço detalhado se local_veiculo */}
                          {inst.local_tipo === "local_veiculo" && (
                            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs space-y-1">
                              {inst.endereco_cliente_informado || inst.local_endereco ? (
                                <>
                                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      <span>Endereço de Atendimento:</span>
                                    </span>
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                        inst.local_endereco ||
                                          inst.endereco_cliente_informado ||
                                          "",
                                      )}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
                                    >
                                      <span>Ver no Maps</span>
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                  </div>
                                  <div className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                                    {inst.local_endereco || inst.endereco_cliente_informado}
                                  </div>
                                </>
                              ) : inst.solicita_endereco_cliente ? (
                                <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 text-[11px]">
                                  <Clock className="h-3.5 w-3.5 shrink-0 animate-spin" />
                                  <span>
                                    Aguardando cliente informar endereço (Solicitação enviada)
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                    Endereço não informado
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const res = await instaladorSolicitarEnderecoCliente(inst.id);
                                      if (res.success) {
                                        toast.success(
                                          "Solicitação de endereço enviada ao cliente com sucesso!",
                                        );
                                        carregarDados();
                                      } else {
                                        toast.error(res.message);
                                      }
                                    }}
                                    className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold transition flex items-center gap-1 shadow-xs"
                                  >
                                    <Send className="h-2.5 w-2.5" />
                                    <span>Solicitar Endereço</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                              Mão de Obra:
                            </span>
                            <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 font-mono">
                              {Number(inst.valor_instalacao || 0) > 0
                                ? `R$ ${Number(inst.valor_instalacao).toFixed(2).replace(".", ",")}`
                                : "Isenta (R$ 0,00)"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Motivo de pendência / recusa em destaque */}
                      {inst.motivo_pendencia_recusa && (
                        <div className="mt-2 p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-mono leading-tight">
                          <span className="font-bold">Motivo:</span> {inst.motivo_pendencia_recusa}
                        </div>
                      )}
                    </div>

                    {/* Rodapé do Card com Ações Táteis e Específicas */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setInstalacaoDetalhes(inst)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold border border-slate-200/80 dark:border-slate-700/60 transition flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Clock className="h-3 w-3" />
                        <span>Histórico</span>
                      </button>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Se A AGENDAR: Botão Direto para Definir Data/Horário deste Veículo (SOMENTE SE TEM KIT DISPONIBILIZADO) */}
                        {inst.status !== "concluida" &&
                          !inst.data_agendamento &&
                          temRastreadorDefinido && (
                            <button
                              type="button"
                              onClick={() => {
                                const c = clientesAgendamento.find(
                                  (item) => item.id === inst.cliente_id,
                                );
                                setModalAgendamentoCliente({
                                  id: inst.cliente_id,
                                  user_id: c?.user_id || (inst as any).cliente_user_id || null,
                                  userId: c?.user_id || (inst as any).cliente_user_id || null,
                                  nome_razao_social: inst.cliente_nome,
                                  telefone: inst.cliente_telefone || null,
                                  data_agendamento: null,
                                  hora_agendamento: null,
                                  status_agendamento: "aguardando_agendamento",
                                  instalacaoId: inst.id,
                                  veiculoPlaca: inst.placa,
                                  veiculoModelo: tituloVeiculo,
                                  localTipo: inst.local_tipo,
                                  localEndereco: inst.local_endereco,
                                  solicitaEnderecoCliente: inst.solicita_endereco_cliente,
                                  enderecoClienteInformado: inst.endereco_cliente_informado,
                                  temKitDisponibilizado: true,
                                  rastreadorImei: inst.rastreador_imei,
                                  instalador: {
                                    id: inst.instalador_id,
                                    nome: inst.instalador_nome,
                                    endereco_instalacao: c?.instalador?.endereco_instalacao || null,
                                  },
                                });
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Definir data, horário e local de atendimento deste veículo"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              <span>Agendar Data</span>
                            </button>
                          )}

                        {/* Se A AGENDAR MAS SEM KIT: Aviso explicativo que aguarda o operador */}
                        {inst.status !== "concluida" &&
                          !inst.data_agendamento &&
                          !temRastreadorDefinido && (
                            <span
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-semibold border border-slate-200 dark:border-slate-700/60 flex items-center gap-1"
                              title="O operador precisa disponibilizar o kit/rastreador para liberar o agendamento de data"
                            >
                              <Clock className="h-3 w-3 text-amber-500" />
                              <span>Aguardando Kit do Operador</span>
                            </span>
                          )}

                        {/* Se JÁ AGENDADO: Botão de Reagendar */}
                        {inst.status !== "concluida" && inst.data_agendamento && (
                          <button
                            type="button"
                            onClick={() => {
                              const c = clientesAgendamento.find(
                                (item) => item.id === inst.cliente_id,
                              );
                              setModalAgendamentoCliente({
                                id: inst.cliente_id,
                                user_id: c?.user_id || (inst as any).cliente_user_id || null,
                                userId: c?.user_id || (inst as any).cliente_user_id || null,
                                nome_razao_social: inst.cliente_nome,
                                telefone: inst.cliente_telefone || null,
                                data_agendamento: inst.data_agendamento,
                                hora_agendamento: inst.hora_agendamento,
                                status_agendamento: "agendado",
                                instalacaoId: inst.id,
                                veiculoPlaca: inst.placa,
                                veiculoModelo: tituloVeiculo,
                                localTipo: inst.local_tipo,
                                localEndereco: inst.local_endereco,
                                solicitaEnderecoCliente: inst.solicita_endereco_cliente,
                                enderecoClienteInformado: inst.endereco_cliente_informado,
                                temKitDisponibilizado: temRastreadorDefinido,
                                rastreadorImei: inst.rastreador_imei,
                                instalador: {
                                  id: inst.instalador_id,
                                  nome: inst.instalador_nome,
                                  endereco_instalacao: c?.instalador?.endereco_instalacao || null,
                                },
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold border border-slate-200/80 dark:border-slate-700/60 transition flex items-center gap-1 cursor-pointer"
                            title="Alterar data, horário ou local de atendimento deste veículo"
                          >
                            <Calendar className="h-3 w-3 text-amber-500" />
                            <span>Reagendar</span>
                          </button>
                        )}

                        {/* FLUXO OBRIGATÓRIO DE INSTALAÇÃO: */}
                        {/* 1. SE NÃO HÁ RASTREADOR DEFINIDO PELO OPERADOR */}
                        {inst.status !== "concluida" && !temRastreadorDefinido && (
                          <span
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 border border-amber-500/30"
                            title="O operador precisa vincular um kit em estoque a este veículo antes de liberar o agendamento de data e instalação"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Aguardando Estoque</span>
                          </span>
                        )}

                        {/* 2. SE HÁ RASTREADOR MAS O KIT NÃO FOI CONFERIDO (IMEI): Exige conferência física com câmera ou digitação */}
                        {inst.status !== "concluida" &&
                          temRastreadorDefinido &&
                          !inst.kit_confirmado_instalador && (
                            <button
                              type="button"
                              onClick={() => setConferindoKitInstalacao(inst)}
                              className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-black transition flex items-center gap-1.5 shadow-md shadow-sky-500/20 animate-pulse cursor-pointer"
                              title="Aponte a câmera para ler o código de barras ou digite o IMEI para conferir o kit físico antes de instalar"
                            >
                              <ScanLine className="h-3.5 w-3.5" />
                              <span>Conferir Kit</span>
                            </button>
                          )}

                        {/* 3. SE TEM RASTREADOR DEFINIDO E O KIT JÁ FOI CONFERIDO PELO INSTALADOR: Libera Realizar Instalação */}
                        {inst.status !== "concluida" &&
                          temRastreadorDefinido &&
                          inst.kit_confirmado_instalador && (
                            <button
                              type="button"
                              onClick={() => setInstalacaoFinalizarTecnica(inst)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 animate-pulse cursor-pointer"
                              title="Abrir tela com modelos em desenho a mão e realizar fotos obrigatórias da instalação"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              <span>Realizar Instalação</span>
                            </button>
                          )}

                        {/* Pagamento PIX (se administrador e concluído pendente) */}
                        {isAdmOuSuper &&
                          inst.status === "concluida" &&
                          inst.status_pagamento !== "pago" && (
                            <button
                              type="button"
                              onClick={() => setInstalacaoPagamentoPix(inst)}
                              className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Pagar Repasse via PIX QR Code"
                            >
                              <QrCode className="h-3 w-3" />
                              <span>PIX</span>
                            </button>
                          )}

                        {/* Apenas para Operador ou Administrador alterar insumos do almoxarifado (Proibido para Instalador) */}
                        {podeCriarDemandaInstalacao && !isInstalador && (
                          <button
                            type="button"
                            onClick={() => {
                              setInstalacaoEdicao(inst);
                              setModalNovaAberto(true);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#fbf2e9] hover:bg-[#dfe7f2] dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold border border-slate-300/60 dark:border-slate-700 transition flex items-center gap-1 shadow-xs cursor-pointer"
                            title="Editar insumos e materiais do estoque (Acesso restrito ao Operador/Administrador)"
                          >
                            <Boxes className="h-3 w-3 text-amber-500" />
                            <span>Editar Insumos</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#fbf2e9] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none overflow-hidden">
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-slate-300/70 dark:border-slate-800/80 bg-slate-200/50 dark:bg-slate-950/50 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      <th className="py-3 px-3.5">Placa e Veículo</th>
                      <th className="py-3 px-3">Cliente e Instalador</th>
                      <th className="py-3 px-3">Rastreador e Kit</th>
                      <th className="py-3 px-3">Status e Agendamento</th>
                      <th className="py-3 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300/50 dark:divide-slate-800/60 text-xs">
                    {ordensExibidas.map((inst) => {
                      const s = getStatusBadge(inst.status, inst.data_agendamento);
                      const IconeStatus = s.icone;
                      const temRastreadorDefinido = temKitDisponibilizado(inst);
                      const tituloVeiculo = formatarTituloVeiculoInstalacao(inst);
                      const tipoVeiculoLabel = formatarLabelTipoVeiculo((inst as any).tipo_veiculo);
                      const ehDireta = ehInstalacaoDiretaSemInstalador(inst);
                      const dataConclusaoCurta = formatarDataConclusaoCurta(
                        inst.concluida_at || inst.updated_at,
                      );
                      const ehMaquina =
                        (inst as any).tipo_veiculo === "maquina" ||
                        (inst as any).tipo_veiculo === "trator" ||
                        Number((inst as any).horimetro_inicial || 0) > 0;
                      const localFisico =
                        (inst as any).posicao_instalacao || (inst as any).posicaoInstalacao;

                      return (
                        <tr
                          key={inst.id}
                          className="hover:bg-white/80 dark:hover:bg-slate-800/50 transition"
                        >
                          {/* Placa e Veículo */}
                          <td className="py-3 px-3.5 align-top">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-xs px-2 py-0.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-xs">
                                {inst.placa}
                              </span>
                              {inst.tipo_servico === "retirada" ? (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                  Retirada
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                                  Instalação
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                                {tipoVeiculoLabel}
                              </span>
                              {inst.ordem_vinculada_id && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                                  Troca Casada
                                </span>
                              )}
                            </div>
                            <div
                              className="font-bold text-xs text-slate-800 dark:text-slate-200 mt-1 truncate max-w-[230px]"
                              title={tituloVeiculo}
                            >
                              {tituloVeiculo}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                              {ehMaquina
                                ? `Horímetro: ${Number((inst as any).horimetro_inicial || 0).toFixed(1)} h`
                                : `KM: ${inst.km_instalacao} km`}
                            </div>
                          </td>

                          {/* Cliente e Instalador */}
                          <td className="py-3 px-3 align-top space-y-1">
                            <div
                              className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[190px]"
                              title={inst.cliente_nome}
                            >
                              {inst.cliente_nome}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1 truncate max-w-[190px]">
                              <Wrench className="h-3 w-3 text-slate-400 shrink-0" />
                              <span
                                title={
                                  ehDireta
                                    ? `${inst.instalador_nome} (Instalação Direta)`
                                    : inst.instalador_nome
                                }
                              >
                                {ehDireta
                                  ? `${inst.instalador_nome} (Direta)`
                                  : inst.instalador_nome}
                              </span>
                            </div>
                            <div className="text-[11px] font-black font-mono text-emerald-600 dark:text-emerald-400">
                              Mão de obra:{" "}
                              {Number(inst.valor_instalacao || 0) > 0
                                ? `R$ ${Number(inst.valor_instalacao).toFixed(2).replace(".", ",")}`
                                : "Isenta (R$ 0,00)"}
                            </div>
                          </td>

                          {/* Rastreador e Kit */}
                          <td className="py-3 px-3 align-top space-y-1.5">
                            <div>
                              {temRastreadorDefinido && !ehPlaceholderImei(inst.rastreador_imei) ? (
                                <span className="font-mono text-sky-600 dark:text-sky-400 font-bold text-[11px] bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 inline-block">
                                  {inst.rastreador_imei}
                                </span>
                              ) : temRastreadorDefinido ? (
                                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 font-mono bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full inline-block">
                                  KIT ATRIBUÍDO
                                </span>
                              ) : (
                                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full inline-block">
                                  AGUARDANDO ESTOQUE
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              {!temRastreadorDefinido ? (
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                                  Kit: Aguardando
                                </span>
                              ) : inst.kit_confirmado_instalador ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Kit Conferido
                                </span>
                              ) : inst.status === "concluida" ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Kit Instalado (Direto)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                                  <AlertTriangle className="h-3 w-3" />
                                  Kit Pendente
                                </span>
                              )}

                              {(inst as any).com_bloqueador || inst.bloqueador_instalado ? (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
                                  Bloqueador: Sim
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                                  Bloqueador: Não
                                </span>
                              )}
                            </div>

                            {localFisico && (
                              <div
                                className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-[190px]"
                                title={localFisico}
                              >
                                Local: {localFisico}
                              </div>
                            )}
                          </td>

                          {/* Status e Agendamento */}
                          <td className="py-3 px-3 align-top space-y-1.5">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-xs ${s.classe}`}
                            >
                              <IconeStatus className="h-3 w-3" />
                              <span>{s.label}</span>
                            </span>

                            <div>
                              {inst.data_agendamento ? (
                                <div className="font-mono text-sky-600 dark:text-sky-400 font-bold text-[10px]">
                                  {inst.data_agendamento.split("-").reverse().join("/")}{" "}
                                  {inst.hora_agendamento || ""}
                                </div>
                              ) : inst.status === "concluida" ? (
                                <div className="font-mono text-emerald-600 dark:text-emerald-400 font-bold text-[10px] inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                  <span>
                                    {dataConclusaoCurta
                                      ? `Concluída em ${dataConclusaoCurta}`
                                      : "Instalação Direta"}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                                  Aguardando Data/Hora
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              {inst.local_tipo === "local_veiculo" ? (
                                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 inline-flex items-center gap-1">
                                  <Car className="h-3 w-3" />
                                  <span>No Local</span>
                                </span>
                              ) : ehDireta &&
                                inst.status === "concluida" &&
                                !inst.data_agendamento ? (
                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                  <span>Instalação Direta</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                  <Wrench className="h-3 w-3 text-amber-500" />
                                  <span>Na Oficina</span>
                                </span>
                              )}

                              {inst.local_tipo === "local_veiculo" &&
                                (inst.endereco_cliente_informado || inst.local_endereco) && (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                      inst.local_endereco || inst.endereco_cliente_informado || "",
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5"
                                    title={inst.local_endereco || inst.endereco_cliente_informado}
                                  >
                                    <span>Maps</span>
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                )}
                            </div>
                          </td>

                          {/* Ações */}
                          <td className="py-3 px-3 align-top">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setInstalacaoDetalhes(inst)}
                                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold border border-slate-200/80 dark:border-slate-700/60 transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                              >
                                <Clock className="h-3 w-3" />
                                <span>Histórico</span>
                              </button>

                              {inst.status !== "concluida" &&
                                !inst.data_agendamento &&
                                temRastreadorDefinido && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const c = clientesAgendamento.find(
                                        (item) => item.id === inst.cliente_id,
                                      );
                                      setModalAgendamentoCliente({
                                        id: inst.cliente_id,
                                        user_id:
                                          c?.user_id || (inst as any).cliente_user_id || null,
                                        userId: c?.user_id || (inst as any).cliente_user_id || null,
                                        nome_razao_social: inst.cliente_nome,
                                        telefone: inst.cliente_telefone || null,
                                        data_agendamento: null,
                                        hora_agendamento: null,
                                        status_agendamento: "aguardando_agendamento",
                                        instalacaoId: inst.id,
                                        veiculoPlaca: inst.placa,
                                        veiculoModelo: tituloVeiculo,
                                        localTipo: inst.local_tipo,
                                        localEndereco: inst.local_endereco,
                                        solicitaEnderecoCliente: inst.solicita_endereco_cliente,
                                        enderecoClienteInformado: inst.endereco_cliente_informado,
                                        temKitDisponibilizado: true,
                                        rastreadorImei: inst.rastreador_imei,
                                        instalador: {
                                          id: inst.instalador_id,
                                          nome: inst.instalador_nome,
                                          endereco_instalacao:
                                            c?.instalador?.endereco_instalacao || null,
                                        },
                                      });
                                    }}
                                    className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>Agendar Data</span>
                                  </button>
                                )}

                              {inst.status !== "concluida" && inst.data_agendamento && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const c = clientesAgendamento.find(
                                      (item) => item.id === inst.cliente_id,
                                    );
                                    setModalAgendamentoCliente({
                                      id: inst.cliente_id,
                                      user_id: c?.user_id || (inst as any).cliente_user_id || null,
                                      userId: c?.user_id || (inst as any).cliente_user_id || null,
                                      nome_razao_social: inst.cliente_nome,
                                      telefone: inst.cliente_telefone || null,
                                      data_agendamento: inst.data_agendamento,
                                      hora_agendamento: inst.hora_agendamento,
                                      status_agendamento: "agendado",
                                      instalacaoId: inst.id,
                                      veiculoPlaca: inst.placa,
                                      veiculoModelo: tituloVeiculo,
                                      localTipo: inst.local_tipo,
                                      localEndereco: inst.local_endereco,
                                      solicitaEnderecoCliente: inst.solicita_endereco_cliente,
                                      enderecoClienteInformado: inst.endereco_cliente_informado,
                                      temKitDisponibilizado: temRastreadorDefinido,
                                      rastreadorImei: inst.rastreador_imei,
                                      instalador: {
                                        id: inst.instalador_id,
                                        nome: inst.instalador_nome,
                                        endereco_instalacao:
                                          c?.instalador?.endereco_instalacao || null,
                                      },
                                    });
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold border border-slate-200/80 dark:border-slate-700/60 transition inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Calendar className="h-3 w-3 text-amber-500" />
                                  <span>Reagendar</span>
                                </button>
                              )}

                              {inst.status !== "concluida" &&
                                temRastreadorDefinido &&
                                !inst.kit_confirmado_instalador && (
                                  <button
                                    type="button"
                                    onClick={() => setConferindoKitInstalacao(inst)}
                                    className="px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-black transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <ScanLine className="h-3.5 w-3.5" />
                                    <span>Conferir Kit</span>
                                  </button>
                                )}

                              {inst.status !== "concluida" &&
                                temRastreadorDefinido &&
                                inst.kit_confirmado_instalador && (
                                  <button
                                    type="button"
                                    onClick={() => setInstalacaoFinalizarTecnica(inst)}
                                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <Camera className="h-3.5 w-3.5" />
                                    <span>Realizar Instalação</span>
                                  </button>
                                )}

                              {isAdmOuSuper &&
                                inst.status === "concluida" &&
                                inst.status_pagamento !== "pago" && (
                                  <button
                                    type="button"
                                    onClick={() => setInstalacaoPagamentoPix(inst)}
                                    className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                  >
                                    <QrCode className="h-3 w-3" />
                                    <span>PIX</span>
                                  </button>
                                )}

                              {podeCriarDemandaInstalacao && !isInstalador && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInstalacaoEdicao(inst);
                                    setModalNovaAberto(true);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-bold border border-slate-300/60 dark:border-slate-700 transition inline-flex items-center gap-1 shadow-xs cursor-pointer"
                                >
                                  <Boxes className="h-3 w-3 text-amber-500" />
                                  <span>Editar Insumos</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5.5. Conteúdo da Aba: Agendamentos de Instalação */}
      {abaAtiva === "agendamentos" && (
        <div className="space-y-4">
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  <span>Agendamentos de Instalação Presencial</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isInstalador
                    ? "Defina o dia e horário para atender os clientes atribuídos à sua oficina. Ao salvar no banco de dados, o cliente vê instantaneamente no app."
                    : "Visão geral de clientes cadastrados e situação de agendamento presencial com os instaladores credenciados."}
                </p>
              </div>

              {session?.enderecoInstalacao && isInstalador && (
                <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                  <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate max-w-xs font-medium">
                    Sua Oficina: {session.enderecoInstalacao}
                  </span>
                </div>
              )}
            </div>

            {clientesAgendamento.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500 font-mono">
                Nenhum cliente aguardando agendamento ou instalação.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {clientesAgendamento.map((c) => {
                  const isAgendado = c.status_agendamento === "agendado" && c.data_agendamento;
                  const isConcluido = c.status === "ativo";
                  const endOficina =
                    c.instalador?.endereco_instalacao ||
                    (isInstalador ? session?.enderecoInstalacao : null);
                  const ordensDoCliente = instalacoes.filter(
                    (i) => i.cliente_id === c.id && i.status !== "concluida",
                  );
                  const temKitCliente =
                    ordensDoCliente.length > 0
                      ? ordensDoCliente.some((o) => temKitDisponibilizado(o))
                      : Boolean(
                          (c as any).kit_determinado_id ||
                          c.veiculos?.some(
                            (v: any) =>
                              v.rastreador_id ||
                              (v.rastreador_imei && !ehPlaceholderImei(v.rastreador_imei)),
                          ),
                        );
                  const ordemComKit =
                    ordensDoCliente.find((o) => temKitDisponibilizado(o)) ||
                    (temKitCliente
                      ? ({
                          id: ordensDoCliente[0]?.id || `auto-${c.id}`,
                          placa: c.veiculos?.[0]?.placa || "A DEFINIR",
                          marca: "Veículo",
                          modelo: c.veiculos?.[0]?.modelo || "Veículo",
                          rastreador_imei:
                            c.veiculos?.[0]?.rastreador_imei || ordensDoCliente[0]?.rastreador_imei,
                        } as any)
                      : undefined);

                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-3xl bg-slate-50/60 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {c.nome_razao_social}
                            </h4>
                            {c.documento && (
                              <span className="text-[10px] text-slate-500 font-mono block">
                                Doc: {c.documento}
                              </span>
                            )}
                          </div>

                          <div className="shrink-0">
                            {isConcluido ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                Instalado
                              </span>
                            ) : isAgendado ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>Agendado</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                                Aguardando Data/Hora
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Dados de contato e técnico */}
                        <div className="mt-2 text-xs space-y-1 text-slate-600 dark:text-slate-300">
                          {c.telefone && (
                            <div className="flex items-center gap-1 text-[11px] font-mono">
                              <span className="text-slate-400">Tel:</span>
                              <strong className="text-slate-800 dark:text-slate-200">
                                {c.telefone}
                              </strong>
                            </div>
                          )}

                          {isAdmOuSuper && c.instalador?.nome && (
                            <div className="flex items-center gap-1 text-[11px]">
                              <Wrench className="h-3 w-3 text-emerald-500" />
                              <span className="text-slate-400">Técnico:</span>
                              <strong className="text-slate-800 dark:text-slate-200">
                                {c.instalador.nome}
                              </strong>
                            </div>
                          )}

                          {endOficina && (
                            <div className="flex items-start gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <MapPin className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{endOficina}</span>
                            </div>
                          )}
                        </div>

                        {/* Card do Agendamento */}
                        <div className="mt-3 p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                          {isAgendado ? (
                            <div className="text-xs space-y-0.5">
                              <div className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400">
                                Horário Confirmado
                              </div>
                              <div className="font-bold font-mono text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <span>📅 {c.data_agendamento.split("-").reverse().join("/")}</span>
                                <span>⏰ {c.hora_agendamento || "--:--"}</span>
                              </div>
                            </div>
                          ) : !temKitCliente ? (
                            <div className="text-xs text-amber-600 dark:text-amber-400">
                              <span className="font-bold">Aguardando Kit:</span> O operador precisa
                              vincular e disponibilizar o kit no almoxarifado antes de agendar a
                              data.
                            </div>
                          ) : (
                            <div className="text-xs text-amber-600 dark:text-amber-400">
                              <span className="font-bold">Pendente:</span> Defina o dia e horário
                              para que o cliente saiba quando comparecer.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação do Card */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-1.5 flex-wrap">
                        {temKitCliente ? (
                          <button
                            onClick={() => {
                              setModalAgendamentoCliente({
                                ...c,
                                user_id: c.user_id,
                                userId: c.user_id,
                                instalacaoId: ordemComKit?.id,
                                veiculoPlaca: ordemComKit?.placa,
                                veiculoModelo: ordemComKit
                                  ? `${ordemComKit.marca} ${ordemComKit.modelo}`
                                  : undefined,
                                temKitDisponibilizado: true,
                                rastreadorImei: ordemComKit?.rastreador_imei,
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{isAgendado ? "Alterar Data/Hora" : "Definir Agendamento"}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 font-bold text-xs flex items-center gap-1.5 cursor-not-allowed opacity-75 border border-slate-200 dark:border-slate-800"
                            title="Agendamento bloqueado: aguardando operador disponibilizar kit em estoque"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            <span>Aguardando Kit</span>
                          </button>
                        )}

                        {podeCriarDemandaInstalacao && !isInstalador ? (
                          <button
                            onClick={() => {
                              setClientePreSelecionadoId(c.id);
                              setInstalacaoEdicao(null);
                              setModalNovaAberto(true);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                            title="Atendimento de almoxarifado e baixa de insumos"
                          >
                            <Boxes className="h-3.5 w-3.5" />
                            <span>Ajustar Insumos / Estoque</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const ordem = instalacoes.find(
                                (i) => i.cliente_id === c.id && i.status !== "concluida",
                              );
                              if (ordem) {
                                setInstalacaoFinalizarTecnica(ordem);
                              } else {
                                setAbaAtiva("a_instalar");
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                            title="Realizar atendimento fotográfico e finalizar instalação"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            <span>Realizar Instalação</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Conteúdo da Aba 2: Relatório Financeiro de Repasses */}
      {abaAtiva === "financeiro" && (
        <div className="space-y-4">
          <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">
                  {isInstalador
                    ? "Extrato de Repasses do Instalador"
                    : "Relatório de Conciliação e Pagamentos a Instaladores"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isInstalador
                    ? "Acompanhe seus créditos por instalação física concluída."
                    : "Auditoria e autorização de pagamento para os técnicos credenciados."}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono font-bold">
                <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                  Pago: R$ {formatarMoeda(resumoFinanceiro.valorTotalPago)}
                </span>
                <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                  Pendente: R$ {formatarMoeda(resumoFinanceiro.valorTotalPendente)}
                </span>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Veículo / Placa</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  {isAdmOuSuper && <th className="py-2.5 px-3">Instalador</th>}
                  <th className="py-2.5 px-3">Status Instalação</th>
                  <th className="py-2.5 px-3 text-right">Valor Repasse</th>
                  <th className="py-2.5 px-3 text-center">Status Pagto</th>
                  {isAdmOuSuper && <th className="py-2.5 px-3 text-right">Ação ADM</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {instalacoesFiltradas.length === 0 && clientesAgendamento.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmOuSuper ? 8 : 7}
                      className="py-8 text-center text-slate-500 text-xs font-sans"
                    >
                      Nenhum registro de repasse ou agendamento para exibir.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* 1. Ordens de Instalação Físicas Registradas */}
                    {instalacoesFiltradas.map((inst) => {
                      const isPago = inst.status_pagamento === "pago";
                      const ehIsentaDireta =
                        Number(inst.valor_instalacao || 0) <= 0 &&
                        (inst.status === "concluida" || ehInstalacaoDiretaSemInstalador(inst));
                      const s = getStatusBadge(inst.status, inst.data_agendamento);

                      return (
                        <tr
                          key={inst.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="py-2.5 px-3 text-slate-500">
                            {new Date(inst.created_at).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-slate-100">
                            {inst.placa} ({formatarTituloVeiculoInstalacao(inst)})
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                            {inst.cliente_nome || "—"}
                          </td>
                          {isAdmOuSuper && (
                            <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                              {ehInstalacaoDiretaSemInstalador(inst)
                                ? `${inst.instalador_nome || "—"} (Direta)`
                                : inst.instalador_nome || "—"}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-sans">
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {s.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                            {ehIsentaDireta
                              ? "Isenta (R$ 0,00)"
                              : `R$ ${formatarMoeda(inst.valor_instalacao)}`}
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            {ehIsentaDireta ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30">
                                Isenta (Direta)
                              </span>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  isPago
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                }`}
                              >
                                {isPago ? "Pago" : "Pendente"}
                              </span>
                            )}
                          </td>
                          {isAdmOuSuper && (
                            <td className="py-2.5 px-3 text-right font-sans">
                              {ehIsentaDireta ? (
                                <span className="text-[11px] text-slate-400">Sem repasse</span>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  {!isPago && (
                                    <button
                                      onClick={() => setInstalacaoPagamentoPix(inst)}
                                      className="px-2.5 py-1 rounded-xl text-[11px] font-bold transition bg-purple-600 hover:bg-purple-500 text-white shadow-xs flex items-center gap-1"
                                      title="Pagar Repasse via PIX QR Code"
                                    >
                                      <QrCode className="h-3 w-3" />
                                      <span>PIX</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleMarcarPagamento(inst.id, isPago ? "pendente" : "pago")
                                    }
                                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition ${
                                      isPago
                                        ? "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300"
                                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                                    }`}
                                  >
                                    {isPago ? "Reverter" : "Marcar Pago"}
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}

                    {/* 2. Serviços Agendados e em Pré-agendamento */}
                    {clientesAgendamento.map((c) => {
                      const temAgendamento =
                        c.status_agendamento === "agendado" && !!c.data_agendamento;
                      const veiculo = c.veiculos?.[0];
                      const veiculoTexto = veiculo
                        ? `${veiculo.placa} (${veiculo.modelo || "Rastreador"})`
                        : null;

                      const valorPrevisto =
                        session?.valorPorInstalacao && session.valorPorInstalacao > 0
                          ? session.valorPorInstalacao
                          : 50;

                      return (
                        <tr
                          key={`agendamento-${c.id}`}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                            temAgendamento ? "bg-sky-500/5" : "bg-amber-500/5"
                          }`}
                        >
                          <td className="py-2.5 px-3 text-slate-400">
                            {temAgendamento ? (
                              c.data_agendamento.split("-").reverse().join("/")
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                                Aguardando Agendamento
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-bold">
                            {veiculoTexto ? (
                              <span className="text-slate-900 dark:text-slate-100">
                                {veiculoTexto}
                              </span>
                            ) : temAgendamento ? (
                              <span className="text-sky-600 dark:text-sky-400">
                                Agendamento Confirmado
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-normal italic">
                                Aguardando Agendamento
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-700 dark:text-slate-200 font-semibold">
                            {c.nome_razao_social}
                          </td>
                          {isAdmOuSuper && (
                            <td className="py-2.5 px-3 font-sans text-slate-600 dark:text-slate-300">
                              {c.instalador?.nome || session?.nome || "—"}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-sans">
                            {temAgendamento ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                                Agendado / Previsto
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                Aguardando Agendamento
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-black ${
                              temAgendamento
                                ? "text-sky-600 dark:text-sky-400"
                                : "text-slate-400 dark:text-slate-500 font-normal italic text-[11px]"
                            }`}
                          >
                            {temAgendamento ? `R$ ${valorPrevisto.toFixed(2)}` : "A definir"}
                          </td>
                          <td className="py-2.5 px-3 text-center font-sans">
                            {temAgendamento ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                Aguardando Instalação
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30">
                                Não Agendado
                              </span>
                            )}
                          </td>
                          {isAdmOuSuper && (
                            <td className="py-2.5 px-3 text-right font-sans">
                              <span className="text-[11px] text-slate-400">
                                {temAgendamento ? "Após Conclusão" : "Definir Data"}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Modais de Ação */}
      {modalNovaAberto && (
        <NovaInstalacaoModal
          instalacaoParaEdicao={instalacaoEdicao}
          clientePreSelecionadoId={clientePreSelecionadoId}
          onSalvo={() => {
            setModalNovaAberto(false);
            setInstalacaoEdicao(null);
            setClientePreSelecionadoId(null);
            carregarDados();
          }}
          onFechar={() => {
            setModalNovaAberto(false);
            setInstalacaoEdicao(null);
            setClientePreSelecionadoId(null);
          }}
        />
      )}

      {modalRemanejamentoAberto && (
        <ModalSolicitarRemanejamento
          aberto={modalRemanejamentoAberto}
          onClose={() => setModalRemanejamentoAberto(false)}
          onSucesso={() => {
            setModalRemanejamentoAberto(false);
            carregarDados();
          }}
        />
      )}

      {modalAgendamentoCliente && (
        <ModalAgendamentoInstalacao
          cliente={{
            id: modalAgendamentoCliente.id,
            nome: modalAgendamentoCliente.nome_razao_social || modalAgendamentoCliente.nome,
            user_id: modalAgendamentoCliente.user_id || modalAgendamentoCliente.userId || null,
            userId: modalAgendamentoCliente.userId || modalAgendamentoCliente.user_id || null,
            telefone: modalAgendamentoCliente.telefone,
            data_agendamento: modalAgendamentoCliente.data_agendamento,
            hora_agendamento: modalAgendamentoCliente.hora_agendamento,
            status_agendamento: modalAgendamentoCliente.status_agendamento,
          }}
          instalacaoId={modalAgendamentoCliente.instalacaoId}
          veiculoPlaca={modalAgendamentoCliente.veiculoPlaca}
          veiculoModelo={modalAgendamentoCliente.veiculoModelo}
          enderecoInstalador={
            modalAgendamentoCliente.instalador?.endereco_instalacao ||
            session?.enderecoInstalacao ||
            null
          }
          localTipoAtual={modalAgendamentoCliente.localTipo}
          localEnderecoAtual={modalAgendamentoCliente.localEndereco}
          solicitaEnderecoClienteAtual={modalAgendamentoCliente.solicitaEnderecoCliente}
          enderecoClienteInformadoAtual={modalAgendamentoCliente.enderecoClienteInformado}
          temKitDisponibilizado={modalAgendamentoCliente.temKitDisponibilizado}
          rastreadorImei={modalAgendamentoCliente.rastreadorImei}
          onSalvo={() => {
            setModalAgendamentoCliente(null);
            carregarDados();
          }}
          onFechar={() => setModalAgendamentoCliente(null)}
        />
      )}

      {instalacaoDetalhes && (
        <DetalhesHistoricoInstalacaoModal
          instalacao={instalacaoDetalhes}
          onReabrir={(inst) => {
            setInstalacaoDetalhes(null);
            setInstalacaoEdicao(inst);
            setModalNovaAberto(true);
          }}
          onFechar={() => setInstalacaoDetalhes(null)}
        />
      )}

      {instalacaoPagamentoPix && (
        <ModalPagamentoPixInstalacao
          instalacao={instalacaoPagamentoPix}
          todasInstalacoesDoInstalador={instalacoes}
          onFechar={() => setInstalacaoPagamentoPix(null)}
          onPagamentoConcluido={() => {
            setInstalacaoPagamentoPix(null);
            carregarDados();
          }}
        />
      )}

      {modalDadosInstaladorAberto && session?.userId && (
        <ModalDadosInstalador
          open={modalDadosInstaladorAberto}
          onClose={() => setModalDadosInstaladorAberto(false)}
          instaladorId={session.userId}
          onDadosAtualizados={() => {
            carregarDados();
          }}
        />
      )}

      {conferindoKitInstalacao && (
        <CameraBarcodeScannerModal
          open={Boolean(conferindoKitInstalacao)}
          onClose={() => setConferindoKitInstalacao(null)}
          onScanSucesso={async (codigo) => {
            const alvo = conferindoKitInstalacao;
            setConferindoKitInstalacao(null);
            const res = await instaladorConfirmarKit(alvo.id, codigo);
            if (res.success) {
              toast.success(res.message || "Kit conferido com sucesso!");
              carregarDados();
            } else {
              toast.error(res.message);
            }
          }}
          titulo="Conferir Kit de Instalação (IMEI)"
          subtitulo={`Aponte a câmera para o código de barras do rastreador do veículo placa ${conferindoKitInstalacao.placa} ou digite o IMEI.`}
          valorEsperado={conferindoKitInstalacao.rastreador_imei}
        />
      )}

      {/* Modal de Finalização Técnica e Comprovação Fotográfica Guiada (Estilo Esboço a Mão) */}
      {instalacaoFinalizarTecnica && (
        <ModalFinalizarInstalacaoTecnica
          aberto={Boolean(instalacaoFinalizarTecnica)}
          instalacao={instalacaoFinalizarTecnica}
          onFechar={() => setInstalacaoFinalizarTecnica(null)}
          onConcluido={() => {
            setInstalacaoFinalizarTecnica(null);
            carregarDados();
          }}
        />
      )}
    </div>
  );
}
