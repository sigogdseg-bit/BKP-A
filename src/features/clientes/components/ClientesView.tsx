import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Plus,
  Search,
  Edit3,
  Shield,
  Clock,
  CheckCircle2,
  Wrench,
  MapPin,
  History,
  FileDown,
  FileCheck,
  RefreshCw,
  FileText,
  CreditCard,
  Trash2,
  AlertTriangle,
  Activity,
  ShieldAlert,
  Link2,
  Car,
  Sparkles,
  AlertCircle,
  Layers,
  LayoutGrid,
  List,
  Eye,
  X,
  MessageSquare,
} from "lucide-react";
import type { Cliente, StatusCliente, TipoRenovacaoContrato } from "../types";
import {
  carregarClientes,
  renovarContratoCliente,
  excluirCliente,
} from "../services/clienteService";
import { emitirContratoPrestacaoServicosPdf } from "../services/contratoPdfService";
import { NovoClienteModal } from "./NovoClienteModal";
import { HistoricoClienteModal } from "./HistoricoClienteModal";
import { ModalParcelasContratoCliente } from "./ModalParcelasContratoCliente";
import { ModalContratosCliente } from "./ModalContratosCliente";
import { ClienteVeiculosAnalyticsModal } from "./ClienteVeiculosAnalyticsModal";
import { ModalGerenciarBloqueioAdmin } from "./ModalGerenciarBloqueioAdmin";
import { ModalConviteCliente } from "./ModalConviteCliente";
import { ModalDistribuirInstalacoesVeiculos } from "./ModalDistribuirInstalacoesVeiculos";
import { ModalEnviarWhatsappCliente } from "./ModalEnviarWhatsappCliente";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { TiltCard } from "@/shared/components/TiltCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import { toast } from "sonner";

export const isInstalacaoRealizada = (cliente: {
  status?: string;
  status_agendamento?: string | null;
  veiculos_resumo?: Array<{ placa?: string; pendente_aprovacao_operador?: boolean }>;
}): boolean => {
  if (cliente.status === "aguardando_instalacao") return false;
  if (
    cliente.status_agendamento === "aguardando_agendamento" ||
    cliente.status_agendamento === "agendado"
  ) {
    return false;
  }
  if (cliente.status_agendamento === "concluido") return true;
  if (cliente.status === "ativo") return true;
  if (
    cliente.veiculos_resumo &&
    cliente.veiculos_resumo.length > 0 &&
    cliente.veiculos_resumo.every(
      (v) =>
        !v.pendente_aprovacao_operador &&
        v.placa &&
        v.placa !== "A DEFINIR" &&
        v.placa !== "SEM PLACA" &&
        v.placa !== "SEMPLACA",
    )
  ) {
    return true;
  }
  return false;
};

export function ClientesView() {
  const { session } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [modalNovo, setModalNovo] = useState(false);
  const [modalConviteAberto, setModalConviteAberto] = useState(false);
  const [clienteEdicao, setClienteEdicao] = useState<Cliente | null>(null);
  const [clienteHistorico, setClienteHistorico] = useState<Cliente | null>(null);
  const [clienteRenovacao, setClienteRenovacao] = useState<Cliente | null>(null);
  const [clienteAnalytics, setClienteAnalytics] = useState<Cliente | null>(null);
  const [tipoRenovacaoModal, setTipoRenovacaoModal] =
    useState<TipoRenovacaoContrato>("mesma_vigencia");
  const [mesesRenovacaoModal, setMesesRenovacaoModal] = useState<number>(12);
  const [renovando, setRenovando] = useState(false);
  const [clienteParcelas, setClienteParcelas] = useState<Cliente | null>(null);
  const [clienteContratosModal, setClienteContratosModal] = useState<Cliente | null>(null);
  const [clienteGerenciarBloqueio, setClienteGerenciarBloqueio] = useState<Cliente | null>(null);
  const [clienteParaExcluir, setClienteParaExcluir] = useState<Cliente | null>(null);
  const [clienteDistribuir, setClienteDistribuir] = useState<Cliente | null>(null);
  const [excluindoCliente, setExcluindoCliente] = useState(false);
  const [modoExibicao, setModoExibicao] = useState<"cards" | "lista">(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("hunter_clientes_modo_exibicao") as "cards" | "lista") || "cards"
      );
    }
    return "cards";
  });
  const [clienteCardModal, setClienteCardModal] = useState<Cliente | null>(null);
  const [clienteWhatsapp, setClienteWhatsapp] = useState<Cliente | null>(null);

  // Sincroniza o card modal com os clientes recarregados
  useEffect(() => {
    setClienteCardModal((prev) => {
      if (!prev) return null;
      return clientes.find((c) => c.id === prev.id) || null;
    });
  }, [clientes]);

  const handleConfirmarRenovacao = async () => {
    if (!clienteRenovacao) return;
    setRenovando(true);
    try {
      const res = await renovarContratoCliente({
        clienteId: clienteRenovacao.id,
        tipoRenovacao: tipoRenovacaoModal,
        mesesAdicionais:
          tipoRenovacaoModal === "tempo_personalizado" ? mesesRenovacaoModal : undefined,
      });

      if (res.success) {
        toast.success(res.message);
        setClienteRenovacao(null);
        recarregar();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao renovar contrato.");
    } finally {
      setRenovando(false);
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!clienteParaExcluir) return;
    setExcluindoCliente(true);
    try {
      const res = await excluirCliente(clienteParaExcluir.id);
      if (res.success) {
        toast.success(res.message || "Cliente excluído com sucesso.");
        setClienteParaExcluir(null);
        recarregar();
      } else {
        toast.error(res.message || "Não foi possível excluir o cliente.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao excluir cliente.");
    } finally {
      setExcluindoCliente(false);
    }
  };

  const recarregar = async () => {
    setCarregando(true);
    const lista = await carregarClientes();
    setClientes(lista);
    setCarregando(false);
  };

  useEffect(() => {
    recarregar();

    if (
      typeof window !== "undefined" &&
      sessionStorage.getItem("sigo_abrir_novo_cliente") === "1"
    ) {
      sessionStorage.removeItem("sigo_abrir_novo_cliente");
      setClienteEdicao(null);
      setModalNovo(true);
    }

    const canal = supabase
      .channel("hunter_clientes_realtime_view")
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, () => {
        recarregar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "instalacoes" }, () => {
        recarregar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "veiculos" }, () => {
        recarregar();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const contadores = useMemo(() => {
    let aguardandoC = 0;
    let aguardandoV = 0;
    let ativosC = 0;
    let ativosV = 0;
    let bloqueadosC = 0;
    let bloqueadosV = 0;
    let pendentesC = 0;
    let pendentesV = 0;
    let totalV = 0;

    for (const c of clientes) {
      const vCount =
        c.veiculos_count !== undefined && c.veiculos_count !== null
          ? Number(c.veiculos_count)
          : Array.isArray(c.veiculos_resumo)
            ? c.veiculos_resumo.length
            : 0;

      totalV += vCount;

      if (c.pendente_configuracao_operador) {
        pendentesC++;
        pendentesV += vCount;
      }
      const instalacaoRealizada = isInstalacaoRealizada(c);
      const isAg =
        !instalacaoRealizada &&
        (c.status === "aguardando_instalacao" ||
          c.status_agendamento === "aguardando_agendamento" ||
          c.status_agendamento === "agendado");

      if (isAg) {
        aguardandoC++;
        aguardandoV += vCount;
      }
      if (c.status === "ativo") {
        ativosC++;
        ativosV += vCount;
      }
      if (c.status === "bloqueado") {
        bloqueadosC++;
        bloqueadosV += vCount;
      }
    }

    return {
      total: clientes.length,
      totalV,
      aguardando: aguardandoC,
      aguardandoV,
      ativos: ativosC,
      ativosV,
      bloqueados: bloqueadosC,
      bloqueadosV,
      pendentes: pendentesC,
      pendentesV,
    };
  }, [clientes]);

  const filtrados = useMemo(() => {
    return clientes.filter((c) => {
      const matchBusca =
        !busca ||
        c.nome_razao_social.toLowerCase().includes(busca.toLowerCase()) ||
        (c.documento && c.documento.includes(busca)) ||
        (c.telefone && c.telefone.includes(busca)) ||
        (c.email && c.email.toLowerCase().includes(busca.toLowerCase())) ||
        (c.veiculos_resumo &&
          c.veiculos_resumo.some(
            (v) =>
              v.placa?.toLowerCase().includes(busca.toLowerCase()) ||
              v.modelo?.toLowerCase().includes(busca.toLowerCase()),
          ));

      let matchStatus = true;
      if (filtroStatus === "pendentes") {
        matchStatus = !!c.pendente_configuracao_operador;
      } else if (filtroStatus === "aguardando_instalacao") {
        matchStatus =
          !isInstalacaoRealizada(c) &&
          (c.status === "aguardando_instalacao" ||
            c.status_agendamento === "aguardando_agendamento" ||
            c.status_agendamento === "agendado");
      } else if (filtroStatus !== "todos") {
        matchStatus = c.status === filtroStatus;
      }

      return matchBusca && matchStatus;
    });
  }, [clientes, busca, filtroStatus]);

  const renderCardCliente = (cliente: Cliente, emModal = false) => {
    const temVeiculosAtivos = Boolean(
      cliente.veiculos_resumo &&
      cliente.veiculos_resumo.length > 0 &&
      cliente.veiculos_resumo.every((v) => !v.pendente_aprovacao_operador),
    );

    const instalacaoRealizada = isInstalacaoRealizada(cliente);
    const isAguardando =
      !instalacaoRealizada &&
      (cliente.status === "aguardando_instalacao" ||
        cliente.status_agendamento === "aguardando_agendamento" ||
        cliente.status_agendamento === "agendado");

    const corSpotlight =
      cliente.pendente_configuracao_operador || isAguardando
        ? "rgba(245, 158, 11, 0.32)"
        : cliente.status === "cancelado" ||
            cliente.status_bloqueio_acesso === "bloqueado" ||
            cliente.status_bloqueio_localizacao === "bloqueado"
          ? "rgba(244, 63, 94, 0.32)"
          : "rgba(16, 185, 129, 0.32)";

    return (
      <TiltCard
        key={cliente.id}
        maxTilt={emModal ? 2 : 5}
        spotlightColor={corSpotlight}
        enableTilt={!emModal}
        className={`bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 ${
          emModal
            ? "shadow-none"
            : "shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] dark:hover:border-slate-700"
        } transition`}
      >
        <div>
          {/* Topo do Card: Nome e Botões de Ação Rápidos (Desacoplados de Badges para Evitar Quebras) */}
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 line-clamp-1 break-words">
                {cliente.nome_razao_social || "Cliente sem identificação"}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                {cliente.documento && (
                  <span className="font-mono font-medium">Doc: {cliente.documento}</span>
                )}
                {cliente.telefone && <span>Tel: {cliente.telefone}</span>}
                {cliente.email && (
                  <span className="truncate max-w-[180px] sm:max-w-[220px]">
                    Email: {cliente.email}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              <button
                type="button"
                onClick={() => setClienteWhatsapp(cliente)}
                className="h-7 w-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition border border-emerald-500/30 shadow-xs cursor-pointer active:scale-95"
                title="Enviar mensagem via WhatsApp para este cliente"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setClienteEdicao(cliente);
                  setModalNovo(true);
                }}
                className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition border border-slate-300/70 dark:border-slate-700/70 shadow-xs cursor-pointer active:scale-95"
                title="Editar cadastro do cliente"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
              {session?.isAdmin && (
                <button
                  type="button"
                  onClick={() => setClienteParaExcluir(cliente)}
                  className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800/90 hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 flex items-center justify-center transition border border-rose-500/30 shadow-xs cursor-pointer active:scale-95"
                  title="Excluir cadastro do cliente"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Linha de Badges de Status, Plano e Bloqueios em Linha Própria */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {cliente.pendente_configuracao_operador && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse">
                <AlertCircle className="h-3 w-3" />
                <span>Pendente Operador</span>
              </span>
            )}
            {isAguardando ? (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Clock className="h-3 w-3" />
                <span>Instalação</span>
              </span>
            ) : cliente.status === "ativo" ? (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" />
                <span>Ativo</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                {cliente.status}
              </span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                cliente.plano === "master"
                  ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                  : cliente.plano === "pro"
                    ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
              }`}
            >
              {cliente.plano}
            </span>
            {cliente.status_bloqueio_localizacao === "bloqueado" && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                Loc: Bloqueada
              </span>
            )}
            {cliente.status_bloqueio_localizacao === "liberado" && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Loc: Liberada
              </span>
            )}
            {cliente.status_bloqueio_acesso === "bloqueado" && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                Login: Bloqueado
              </span>
            )}
            {cliente.status_bloqueio_acesso === "liberado" && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Login: Liberado
              </span>
            )}
          </div>

          {cliente.pendente_configuracao_operador && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 my-2.5 space-y-2 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Pendente Aprovação do Operador</span>
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-amber-500/20 rounded-md text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  Auto-Cadastro
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                Cliente realizou auto-cadastro via link. Defina o valor da mensalidade, plano e
                atribua o instalador de cada veículo.
              </p>
              <button
                type="button"
                onClick={() => setClienteDistribuir(cliente)}
                className="w-full h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <Sparkles className="h-4 w-4" />
                <span>Aprovar e Atribuir Instalador</span>
              </button>
            </div>
          )}

          {/* Veículos Cadastrados no Cliente */}
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-600 dark:text-slate-400 font-semibold">
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <Car className="h-4 w-4 text-emerald-500" />
                <span>Veículos Cadastrados ({cliente.veiculos_count || 0})</span>
              </span>
              <button
                type="button"
                onClick={() => setClienteDistribuir(cliente)}
                className="px-2.5 py-1 rounded-xl text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
                title="Distribuir instalador, kit de comodato e gerar OSs por veículo"
              >
                <Layers className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Distribuir Veículos e OSs</span>
              </button>
            </div>

            {cliente.veiculos_resumo && cliente.veiculos_resumo.length > 0 ? (
              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-0.5 custom-scrollbar">
                {cliente.veiculos_resumo.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between bg-white/90 dark:bg-slate-950/80 border border-slate-300/70 dark:border-slate-800 px-2.5 py-1.5 rounded-xl text-xs shadow-xs gap-2"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      <div className="inline-flex flex-col items-center justify-center bg-white dark:bg-slate-900 border border-slate-400/70 dark:border-slate-700 rounded-md px-1.5 py-0.5 shrink-0 shadow-2xs">
                        <span className="text-[6.5px] font-black tracking-widest text-blue-600 dark:text-blue-400 uppercase leading-none">
                          BRASIL
                        </span>
                        <span className="font-mono font-black text-[10.5px] text-slate-900 dark:text-slate-100 leading-tight">
                          {v.placa || "SEM PLACA"}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {v.modelo}
                      </span>
                    </div>
                    {v.pendente_aprovacao_operador ? (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                        Pendente
                      </span>
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 shrink-0">
                        Ativo
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-white/50 dark:bg-slate-950/40 px-3 py-2 rounded-xl border border-dashed border-slate-300/80 dark:border-slate-800/80">
                <span className="text-[11px] text-slate-400 italic">Nenhum veículo vinculado</span>
                <button
                  type="button"
                  onClick={() => setClienteDistribuir(cliente)}
                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 underline cursor-pointer"
                >
                  + Vincular agora
                </button>
              </div>
            )}
          </div>

          {cliente.instalador_nome && (
            <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-2 bg-white/80 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-300/60 dark:border-slate-800/60 space-y-1 shadow-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span>Instalador: {cliente.instalador_nome}</span>
              </div>
              {cliente.instalador_endereco && (
                <div className="flex items-start gap-1.5 text-slate-500 dark:text-slate-400 text-[10px]">
                  <MapPin className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500 mt-0.5" />
                  <span className="line-clamp-1">{cliente.instalador_endereco}</span>
                </div>
              )}
              <div className="text-[10px]">
                {cliente.status_agendamento === "concluido" ||
                temVeiculosAtivos ||
                (cliente.status === "ativo" &&
                  cliente.status_agendamento !== "agendado" &&
                  cliente.status_agendamento !== "aguardando_agendamento") ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500 dark:text-emerald-400" />
                    <span>Instalação realizada com sucesso</span>
                  </span>
                ) : cliente.status_agendamento === "agendado" && cliente.data_agendamento ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Agendado para {cliente.data_agendamento.split("-").reverse().join("/")} às{" "}
                    {cliente.hora_agendamento || "--:--"}
                  </span>
                ) : isInstalacaoRealizada(cliente) ? null : (
                  <span className="text-amber-600 dark:text-amber-400">
                    Aguardando agendamento de data e horário pelo instalador
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Informações de Retenção, Financeiras e Vigência */}
        <div className="pt-2 border-t border-slate-300/60 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-white/80 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-300/60 dark:border-slate-800/60 shadow-xs">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
              Vigência
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
              {cliente.meses_contrato || 12} meses
            </span>
          </div>
          <div className="bg-white/80 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-300/60 dark:border-slate-800/60 shadow-xs">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
              Vencimento
            </span>
            <span className="text-slate-800 dark:text-slate-200 font-bold font-mono">
              Dia {cliente.dia_vencimento || 10}
            </span>
          </div>
          <div className="bg-white/80 dark:bg-slate-950/60 p-2 rounded-xl border border-slate-300/60 dark:border-slate-800/60 shadow-xs">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium">
              Mensalidade
            </span>
            <span className="text-sky-600 dark:text-sky-400 font-bold font-mono">
              {cliente.pendente_configuracao_operador && !cliente.valor_mensalidade
                ? "Pendente"
                : `R$ ${(cliente.valor_mensalidade || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>

        {/* Botões de Ação do Card */}
        <div className="space-y-1.5 pt-2.5 border-t border-slate-300/60 dark:border-slate-800/60">
          {/* Linha 1: Gestão Contratual e Financeira */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => setClienteContratosModal(cliente)}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-white/80 dark:bg-slate-800/80 hover:bg-emerald-500/10 border border-emerald-500/30 transition shadow-xs active:scale-95 cursor-pointer"
              title="Gerenciar Contratos, Assinaturas, Envio ao Cliente e Selos de Autenticidade"
            >
              <FileCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Contratos</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setClienteRenovacao(cliente);
                setTipoRenovacaoModal(cliente.tipo_renovacao || "mesma_vigencia");
                setMesesRenovacaoModal(cliente.meses_renovacao || cliente.meses_contrato || 12);
              }}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-slate-300/70 dark:border-slate-700/70 transition shadow-xs active:scale-95 cursor-pointer"
              title="Renovar vigência do contrato e gerar novas parcelas"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" />
              <span>Renovar</span>
            </button>

            <button
              type="button"
              onClick={() => setClienteParcelas(cliente)}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-slate-300/70 dark:border-slate-700/70 transition shadow-xs active:scale-95 cursor-pointer"
              title="Ver parcelas contratadas, quitadas, em atraso e futuras"
            >
              <CreditCard className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
              <span>Parcelas</span>
            </button>

            <button
              type="button"
              onClick={() => setClienteDistribuir(cliente)}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 transition shadow-xs active:scale-95 cursor-pointer"
              title="Distribuir instalador credenciado, kit de comodato e ordens de serviço por veículo"
            >
              <Layers className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>OSs e Kits</span>
            </button>
          </div>

          {/* Linha 2: Frota, Auditoria e Governança */}
          <div
            className={
              session?.isAdmin || session?.role === "operador" || session?.isSuperAdmin
                ? "grid grid-cols-3 gap-1.5"
                : "grid grid-cols-2 gap-1.5"
            }
          >
            <button
              type="button"
              onClick={() => setClienteHistorico(cliente)}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-300/70 dark:border-slate-700/70 transition shadow-xs active:scale-95 cursor-pointer"
              title="Ver histórico de chamados, instalações, pagamentos e bloqueios"
            >
              <History className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
              <span>Histórico</span>
            </button>

            <button
              type="button"
              onClick={() => setClienteAnalytics(cliente)}
              className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-slate-300/70 dark:border-slate-700/70 transition shadow-xs active:scale-95 cursor-pointer"
              title="Ver Analytics de Frota (Veículos)"
            >
              <Activity className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-400" />
              <span>Frota</span>
            </button>

            {(session?.isAdmin || session?.role === "operador" || session?.isSuperAdmin) && (
              <button
                type="button"
                onClick={() => setClienteGerenciarBloqueio(cliente)}
                className="flex items-center justify-center gap-1.5 min-h-[36px] px-2 rounded-xl text-[11px] font-bold bg-white/80 dark:bg-slate-800/80 hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition shadow-xs active:scale-95 cursor-pointer"
                title="Gerenciar bloqueios administrativos de localização e login"
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Bloqueios</span>
              </button>
            )}
          </div>
        </div>
      </TiltCard>
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto select-none pb-28">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 truncate">
              Gestão de Clientes e Planos
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Controle de contratos, planos (Básico, Pro, Master), auto-cadastro e retenção
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setModalConviteAberto(true)}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition shadow-xs w-full sm:w-auto cursor-pointer"
            title="Gerar link de convite para o cliente se auto-cadastrar"
          >
            <Link2 className="h-4 w-4 shrink-0" />
            <span>Link Auto-Cadastro</span>
          </button>

          <button
            onClick={() => {
              setClienteEdicao(null);
              setModalNovo(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 w-full sm:w-auto cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Cadastrar Cliente</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros com Ergonomia Mobile e Tablet */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#eaf0f8]/80 dark:bg-slate-900/50 p-2.5 sm:p-3 rounded-2xl border border-slate-300/60 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2 w-full lg:w-auto flex-1 min-w-0">
          <div className="relative w-full min-w-0 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, placa, modelo, CPF/CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none focus:outline-none focus:border-emerald-500 min-h-[38px]"
            />
          </div>

          {/* Alternador de Visualização Cards / Lista */}
          <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-950 p-1 rounded-xl border border-slate-300/70 dark:border-slate-800 shrink-0 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setModoExibicao("cards");
                localStorage.setItem("hunter_clientes_modo_exibicao", "cards");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                modoExibicao === "cards"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Exibir clientes em formato de Cards"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModoExibicao("lista");
                localStorage.setItem("hunter_clientes_modo_exibicao", "lista");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer active:scale-95 ${
                modoExibicao === "lista"
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
              title="Exibir clientes em formato de Lista Compacta"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 no-scrollbar touch-pan-x flex-nowrap shrink-0">
          {[
            { id: "todos", label: `Todos (${contadores.total}C/${contadores.totalV}V)` },
            ...(contadores.pendentes > 0
              ? [
                  {
                    id: "pendentes",
                    label: `Pendentes Operador (${contadores.pendentes}C/${contadores.pendentesV}V)`,
                    destaque: true,
                  },
                ]
              : []),
            {
              id: "aguardando_instalacao",
              label: `Aguardando Instalação (${contadores.aguardando}C/${contadores.aguardandoV}V)`,
            },
            { id: "ativo", label: `Ativos (${contadores.ativosV}V)` },
            { id: "bloqueado", label: `Bloqueados (${contadores.bloqueadosV}V)` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroStatus(filtroStatus === f.id ? "todos" : f.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition min-h-[36px] flex items-center justify-center shrink-0 cursor-pointer active:scale-95 ${
                filtroStatus === f.id
                  ? (f as any).destaque
                    ? "bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/50 shadow-xs font-bold"
                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 shadow-xs font-bold"
                  : (f as any).destaque
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 shadow-xs"
                    : "bg-white/90 dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-xs"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-8 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
          Carregando clientes...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs bg-[#eaf0f8] dark:bg-slate-900/30 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-8 space-y-1.5 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
          <div className="text-slate-800 dark:text-slate-300 font-semibold text-sm">
            {busca
              ? `Nenhum cliente encontrado para "${busca}".`
              : filtroStatus === "aguardando_instalacao"
                ? "Nenhum cliente aguardando agendamento ou instalação no momento."
                : filtroStatus === "ativo"
                  ? "Nenhum cliente ativo encontrado."
                  : filtroStatus === "bloqueado"
                    ? "Nenhum cliente bloqueado encontrado."
                    : "Nenhum cliente cadastrado."}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            {filtroStatus === "aguardando_instalacao"
              ? "Todos os clientes cadastrados já possuem instalações concluídas ou não há novos agendamentos pendentes."
              : "Cadastre novos clientes através do botão acima."}
          </div>
        </div>
      ) : modoExibicao === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((cliente) => renderCardCliente(cliente, false))}
        </div>
      ) : (
        <div className="bg-[#eaf0f8] dark:bg-slate-900/70 border border-slate-300/60 dark:border-slate-800 rounded-2xl shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-300/70 dark:border-slate-800/80 bg-slate-200/50 dark:bg-slate-950/50 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  <th className="py-3 px-3.5">Cliente</th>
                  <th className="py-3 px-3">Status / Plano</th>
                  <th className="py-3 px-3">Veículos</th>
                  <th className="py-3 px-3">Instalador / Agendamento</th>
                  <th className="py-3 px-3">Mensalidade</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300/50 dark:divide-slate-800/60 text-xs">
                {filtrados.map((cliente) => {
                  const instalacaoRealizada = isInstalacaoRealizada(cliente);
                  const isAguardando =
                    !instalacaoRealizada &&
                    (cliente.status === "aguardando_instalacao" ||
                      cliente.status_agendamento === "aguardando_agendamento" ||
                      cliente.status_agendamento === "agendado");

                  return (
                    <tr
                      key={cliente.id}
                      onClick={() => setClienteCardModal(cliente)}
                      className="hover:bg-white/80 dark:hover:bg-slate-800/50 transition cursor-pointer group"
                      title="Clique para abrir o card individual deste cliente"
                    >
                      {/* Cliente (Nome e Contato) */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition truncate max-w-[200px] sm:max-w-[260px]">
                          {cliente.nome_razao_social || "Cliente sem identificação"}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                          {cliente.documento && (
                            <span className="font-mono">Doc: {cliente.documento}</span>
                          )}
                          {cliente.telefone && <span>Tel: {cliente.telefone}</span>}
                          {cliente.email && (
                            <span className="truncate max-w-[150px]">Email: {cliente.email}</span>
                          )}
                        </div>
                      </td>

                      {/* Status / Plano */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isAguardando ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              <Clock className="h-2.5 w-2.5" />
                              <span>Instalação</span>
                            </span>
                          ) : cliente.status === "ativo" ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              <span>Ativo</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                              {cliente.status}
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              cliente.plano === "master"
                                ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                                : cliente.plano === "pro"
                                  ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30"
                                  : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                            }`}
                          >
                            {cliente.plano}
                          </span>
                        </div>
                      </td>

                      {/* Veículos */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-[220px]">
                          <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <Car className="h-3 w-3 text-emerald-500" />
                            <span>{cliente.veiculos_count || 0}</span>
                          </span>
                          {cliente.veiculos_resumo && cliente.veiculos_resumo.length > 0 ? (
                            cliente.veiculos_resumo.slice(0, 2).map((v) => (
                              <span
                                key={v.id}
                                className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs"
                              >
                                {v.placa || "S/ PLACA"}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Nenhum</span>
                          )}
                          {cliente.veiculos_resumo && cliente.veiculos_resumo.length > 2 && (
                            <span className="text-[9px] font-bold text-slate-400">
                              +{cliente.veiculos_resumo.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Instalador / Agendamento */}
                      <td className="py-2.5 px-3">
                        {cliente.instalador_nome ? (
                          <div>
                            <div className="font-semibold text-[11px] text-slate-800 dark:text-slate-200 flex items-center gap-1">
                              <Wrench className="h-3 w-3 text-emerald-500" />
                              <span className="truncate max-w-[130px]">
                                {cliente.instalador_nome}
                              </span>
                            </div>
                            {(() => {
                              if (
                                cliente.status_agendamento === "agendado" &&
                                cliente.data_agendamento
                              ) {
                                return (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                      {cliente.data_agendamento.split("-").reverse().join("/")}{" "}
                                      {cliente.hora_agendamento || ""}
                                    </span>
                                  </div>
                                );
                              }
                              if (cliente.status_agendamento === "concluido") {
                                return (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                      Concluído
                                    </span>
                                  </div>
                                );
                              }
                              if (isInstalacaoRealizada(cliente)) {
                                // Se foi realizada a instalação sem agendar, suprime automaticamente "A agendar"
                                return null;
                              }
                              return (
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  <span className="text-amber-600 dark:text-amber-400">
                                    A agendar
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Não atribuído</span>
                        )}
                      </td>

                      {/* Mensalidade / Vencimento */}
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-[11px] text-sky-600 dark:text-sky-400">
                          {cliente.pendente_configuracao_operador && !cliente.valor_mensalidade
                            ? "Pendente"
                            : `R$ ${(cliente.valor_mensalidade || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Dia {cliente.dia_vencimento || 10} • {cliente.meses_contrato || 12}m
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setClienteCardModal(cliente)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 transition shadow-xs cursor-pointer active:scale-95"
                            title="Abrir card individual completo"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Ver Card</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setClienteContratosModal(cliente)}
                            className="h-7 w-7 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center transition border border-sky-500/30 shadow-xs cursor-pointer active:scale-95"
                            title="Gerenciar Contratos e Autenticidade"
                          >
                            <FileCheck className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setClienteWhatsapp(cliente)}
                            className="h-7 w-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition border border-emerald-500/30 shadow-xs cursor-pointer active:scale-95"
                            title="Enviar mensagem via WhatsApp para este cliente"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setClienteEdicao(cliente);
                              setModalNovo(true);
                            }}
                            className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition border border-slate-300/70 dark:border-slate-700 shadow-xs cursor-pointer active:scale-95"
                            title="Editar cadastro do cliente"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>

                          {session?.isAdmin && (
                            <button
                              type="button"
                              onClick={() => setClienteParaExcluir(cliente)}
                              className="h-7 w-7 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-500/10 text-rose-500 hover:text-rose-600 flex items-center justify-center transition border border-rose-500/30 shadow-xs cursor-pointer active:scale-95"
                              title="Excluir cadastro do cliente"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

      {/* Modal de Renovação de Contrato */}
      {clienteRenovacao && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
              <div className="p-4 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/80 dark:bg-slate-950/60 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
                    <RefreshCw className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Renovação de Contrato
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                      {clienteRenovacao.nome_razao_social}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setClienteRenovacao(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800/80 text-xs space-y-1 shadow-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Vigência Atual:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {clienteRenovacao.meses_contrato || 12} meses
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Mensalidade Pactuada:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      R$ {Number(clienteRenovacao.valor_mensalidade || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Foro Eleito:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Comarca de Volta Redonda/RJ
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Modalidade de Renovação
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setTipoRenovacaoModal("mesma_vigencia")}
                      className={`w-full p-2.5 rounded-xl border text-left transition shadow-xs ${
                        tipoRenovacaoModal === "mesma_vigencia"
                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
                          : "bg-white dark:bg-slate-950/40 border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Pelo Mesmo Período
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Renova por mais {clienteRenovacao.meses_contrato || 12} meses e gera novo
                        lote de parcelas
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoRenovacaoModal("mensal_ate_cancelamento")}
                      className={`w-full p-2.5 rounded-xl border text-left transition shadow-xs ${
                        tipoRenovacaoModal === "mensal_ate_cancelamento"
                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
                          : "bg-white dark:bg-slate-950/40 border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Mês a Mês Contínuo
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Recorrente mês a mês automaticamente até formalização de cancelamento
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTipoRenovacaoModal("tempo_personalizado")}
                      className={`w-full p-2.5 rounded-xl border text-left transition shadow-xs ${
                        tipoRenovacaoModal === "tempo_personalizado"
                          ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
                          : "bg-white dark:bg-slate-950/40 border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Informar Novo Período
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Especificar quantidade personalizada de meses para renovação
                      </div>
                    </button>
                  </div>

                  {tipoRenovacaoModal === "tempo_personalizado" && (
                    <div className="mt-3 p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 flex items-center justify-between shadow-xs">
                      <span className="text-xs text-slate-700 dark:text-slate-300">
                        Meses de Renovação:
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={mesesRenovacaoModal}
                        onChange={(e) =>
                          setMesesRenovacaoModal(Math.max(1, Number(e.target.value)))
                        }
                        className="w-24 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-200 text-center font-bold focus:outline-none focus:border-emerald-500 shadow-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-300/60 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setClienteRenovacao(null)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmarRenovacao}
                    disabled={renovando}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${renovando ? "animate-spin" : ""}`} />
                    <span>{renovando ? "Renovando..." : "Confirmar e Gerar Parcelas"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal de Confirmação de Exclusão de Cliente */}
      {clienteParaExcluir && (
        <ModalPortal>
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
              <div className="p-4 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/80 dark:bg-slate-950/60 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Excluir Cliente
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                      Ação destrutiva e irreversível
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 text-xs">
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>Atenção: Remoção Permanente</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Você está prestes a excluir permanentemente o cliente{" "}
                    <b className="font-semibold text-rose-900 dark:text-rose-200">
                      {clienteParaExcluir.nome_razao_social}
                    </b>
                    {clienteParaExcluir.documento && ` (${clienteParaExcluir.documento})`}.
                  </p>
                </div>

                <div className="bg-white/80 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-300/60 dark:border-slate-800/60 space-y-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    Esta operação executará automaticamente:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-500 dark:text-slate-400">
                    <li>Exclusão de veículos e liberação de rastreadores vinculados.</li>
                    <li>Exclusão do histórico de viagens, telemetrias e agendamentos.</li>
                    <li>Cancelamento das parcelas contratuais e transações financeiras.</li>
                    <li>Remoção da conta de login e acesso ao sistema.</li>
                  </ul>
                </div>
              </div>

              <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 flex justify-end gap-2 bg-[#eaf0f8]/80 dark:bg-slate-950/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setClienteParaExcluir(null)}
                  disabled={excluindoCliente}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarExclusao}
                  disabled={excluindoCliente}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Trash2 className={`h-3.5 w-3.5 ${excluindoCliente ? "animate-spin" : ""}`} />
                  <span>{excluindoCliente ? "Excluindo..." : "Confirmar Exclusão"}</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {modalNovo && (
        <NovoClienteModal
          clienteEdicao={clienteEdicao}
          onFechar={() => {
            setModalNovo(false);
            setClienteEdicao(null);
          }}
          onSucesso={() => {
            setModalNovo(false);
            setClienteEdicao(null);
            recarregar();
          }}
        />
      )}

      {clienteHistorico && (
        <HistoricoClienteModal
          cliente={clienteHistorico}
          onFechar={() => setClienteHistorico(null)}
        />
      )}

      {clienteParcelas && (
        <ModalParcelasContratoCliente
          cliente={clienteParcelas}
          onFechar={() => setClienteParcelas(null)}
        />
      )}

      {/* Modal de Gestão de Contratos Assinados, Hashes Forenses e Autenticidade */}
      {clienteContratosModal && (
        <ModalContratosCliente
          cliente={clienteContratosModal}
          isOpen={Boolean(clienteContratosModal)}
          onClose={() => setClienteContratosModal(null)}
          usuarioEmissor={session?.nome || "Administração"}
          onContratoAtualizado={recarregar}
        />
      )}

      {/* Modal de Analytics */}
      {clienteAnalytics && (
        <ClienteVeiculosAnalyticsModal
          cliente={clienteAnalytics}
          onFechar={() => setClienteAnalytics(null)}
        />
      )}

      {/* Modal de Gestão de Bloqueios Administrativos (Localização e Acesso) */}
      <ModalGerenciarBloqueioAdmin
        aberto={Boolean(clienteGerenciarBloqueio)}
        onFechar={() => setClienteGerenciarBloqueio(null)}
        cliente={clienteGerenciarBloqueio}
        onSalvo={recarregar}
      />

      {/* Modal de Convite / Link de Auto-Cadastro de Cliente */}
      <ModalConviteCliente
        aberto={modalConviteAberto}
        onFechar={() => setModalConviteAberto(false)}
      />

      {/* Modal de Gestão de Frota e Distribuição de Instalações e Kits por Veículo */}
      {clienteDistribuir && (
        <ModalDistribuirInstalacoesVeiculos
          clienteId={clienteDistribuir.id}
          clienteNome={clienteDistribuir.nome_razao_social}
          instaladorPadraoId={clienteDistribuir.instalador_id}
          aberto={Boolean(clienteDistribuir)}
          onFechar={() => setClienteDistribuir(null)}
          onSucesso={() => {
            setClienteDistribuir(null);
            recarregar();
          }}
        />
      )}

      {/* Modal do Card Individual de Cliente (ao clicar na lista) */}
      {clienteCardModal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150"
            onClick={() => setClienteCardModal(null)}
          >
            <div
              className="relative w-full max-w-xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] overflow-y-auto my-auto rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 shadow-2xl space-y-3.5 text-slate-800 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-300/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Card Individual do Cliente
                    </span>
                    <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
                      {clienteCardModal.nome_razao_social}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClienteCardModal(null)}
                  className="h-8 w-8 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center justify-center border border-slate-300/70 dark:border-slate-700 transition cursor-pointer"
                  title="Fechar card"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div>{renderCardCliente(clienteCardModal, true)}</div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal para Envio de Mensagens via WhatsApp pelo Operador */}
      <ModalEnviarWhatsappCliente
        aberto={Boolean(clienteWhatsapp)}
        onClose={() => setClienteWhatsapp(null)}
        cliente={clienteWhatsapp}
        operadorNome={session?.nome || session?.email || "Operador GD Rastreamento"}
      />
    </div>
  );
}
