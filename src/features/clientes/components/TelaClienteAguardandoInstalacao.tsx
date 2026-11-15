import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wrench,
  Calendar,
  Clock,
  MapPin,
  Phone,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  LogOut,
  RefreshCw,
  Navigation,
  Car,
  Plus,
  Send,
  CheckCircle2,
  Bell,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { TiltCard } from "@/shared/components/TiltCard";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  clienteObterMeusVeiculosInstalacao,
  clienteInformarEnderecoInstalacao,
  type VeiculoInstalacaoCliente,
} from "@/features/instalacoes/services/instalacaoService";
import { APP_NOME } from "@/shared/lib/version";
import { ModalClienteSolicitarVeiculo } from "./ModalClienteSolicitarVeiculo";
import {
  solicitarPermissaoNotificacao,
  dispararNotificacaoNativaAlerta,
} from "@/shared/lib/webPushService";

import {
  enviarNotificacaoViaBd,
  tocarAlertaSonoroTatico,
  foiNotificacaoProcessada,
} from "@/shared/lib/notificacoesBdService";

interface TelaClienteAguardandoInstalacaoProps {
  onInstalacaoConcluida?: () => void;
}

export function TelaClienteAguardandoInstalacao({
  onInstalacaoConcluida,
}: TelaClienteAguardandoInstalacaoProps) {
  const { session, logout, recarregarSessao } = useAuth();
  const [veiculos, setVeiculos] = useState<VeiculoInstalacaoCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [modalVeiculoAberto, setModalVeiculoAberto] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<
    "todos" | "agendados" | "pendentes" | "concluidos"
  >("todos");

  // Estado para os inputs de endereço individuais por instalacao_id
  const [enderecosInput, setEnderecosInput] = useState<Record<string, string>>({});
  const [salvandoEndereco, setSalvandoEndereco] = useState<Record<string, boolean>>({});
  const [permissaoNotif, setPermissaoNotif] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "denied";
  });

  const handleAtivarNotificacoes = async () => {
    const res = await solicitarPermissaoNotificacao(session?.clienteId);
    setPermissaoNotif(res);
    if (res === "granted") {
      toast.success("Notificações em tempo real ativadas com sucesso!");
    } else {
      toast.info(
        "Permissão não concedida. Você pode habilitar notificações nas configurações do navegador.",
      );
    }
  };

  const carregarDadosVeiculos = useCallback(async () => {
    if (!session?.userId && !session?.clienteId) return;
    try {
      setAtualizando(true);
      const lista = await clienteObterMeusVeiculosInstalacao(session.userId, session.clienteId);
      setVeiculos(lista);

      // Pré-preenche inputs com endereços já informados
      const mapaEnd: Record<string, string> = {};
      lista.forEach((v) => {
        if (v.endereco_cliente_informado) {
          mapaEnd[v.instalacao_id] = v.endereco_cliente_informado;
        }
      });
      setEnderecosInput((prev) => ({ ...mapaEnd, ...prev }));

      // Se todas as instalações estiverem concluídas, recarrega sessão
      if (lista.length > 0 && lista.every((v) => v.status_instalacao === "concluida")) {
        await recarregarSessao();
        if (onInstalacaoConcluida) {
          onInstalacaoConcluida();
        }
      }
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [session?.userId, onInstalacaoConcluida, recarregarSessao]);

  useEffect(() => {
    carregarDadosVeiculos();

    if (!session?.userId) return;

    // Realtime nas tabelas instalacoes, clientes e notificacoes_sistema para reação instantânea entre dispositivos
    const canalInstalacoes = supabase
      .channel(`hunter_cliente_veics_inst_${session.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "instalacoes",
        },
        () => {
          carregarDadosVeiculos();
        },
      )
      .on("broadcast", { event: "hunter_agendamento_atualizado" }, () => {
        carregarDadosVeiculos();
      })
      .on("broadcast", { event: "hunter_endereco_solicitado" }, () => {
        carregarDadosVeiculos();
      })
      .subscribe();

    const canalClientes = supabase
      .channel(`hunter_cliente_cadastro_inst_${session.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes",
          filter: `user_id=eq.${session.userId}`,
        },
        () => {
          carregarDadosVeiculos();
        },
      )
      .subscribe();

    const canalNotificacoes = supabase
      .channel(`hunter_cliente_notif_inst_${session.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes_sistema",
        },
        (payload) => {
          const notif = payload.new as any;
          if (notif) {
            // REGRA: Anti-eco — remetente nunca recebe sua própria notificação
            if (session?.userId && notif.remetente_user_id === session.userId) return;

            // REGRA: Apenas processa se for direcionado a este cliente/usuário
            const ehParaMim =
              (session?.userId && notif.destinatario_user_id === session.userId) ||
              (session?.clienteId && notif.destinatario_cliente_id === session.clienteId);
            if (!ehParaMim) return;

            // REGRA: Se o serviço global notificacoesBdService já processou/exibiu, não duplica som ou toast
            if (foiNotificacaoProcessada(notif)) {
              carregarDadosVeiculos();
              return;
            }

            tocarAlertaSonoroTatico(notif.tipo || "agendamento");
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate([300, 150, 300]);
            }
            toast.success(notif.titulo || "📅 Nova Notificação do Técnico", {
              description: notif.mensagem,
              duration: 8000,
            });
            if (session?.userId) {
              dispararNotificacaoNativaAlerta({
                titulo: notif.titulo || "📅 Agendamento de Instalação",
                mensagem: notif.mensagem,
                tipo: notif.tipo || "agendamento",
                placa: notif.placa,
                url: notif.url || "/login",
                destinatarioClienteId: session.clienteId,
                destinatarioUserId: session.userId,
              }).catch(() => {});
            }
          }
          carregarDadosVeiculos();
        },
      )
      .subscribe();

    const onNovaNotificacao = () => {
      // O serviço global notificacoesBdService já executou áudio, vibração e toast único.
      // O componente reage apenas recarregando os dados veiculares.
      carregarDadosVeiculos();
    };

    const onAtualizarDemandas = () => {
      carregarDadosVeiculos();
    };

    window.addEventListener("hunter:atualizar_demandas", onAtualizarDemandas);
    window.addEventListener("hunter:nova_notificacao", onNovaNotificacao);

    return () => {
      supabase.removeChannel(canalInstalacoes);
      supabase.removeChannel(canalClientes);
      supabase.removeChannel(canalNotificacoes);
      window.removeEventListener("hunter:atualizar_demandas", onAtualizarDemandas);
      window.removeEventListener("hunter:nova_notificacao", onNovaNotificacao);
    };
  }, [carregarDadosVeiculos, session?.userId, session?.clienteId]);

  const handleEnviarEndereco = async (instalacaoId: string, placa: string) => {
    const end = (enderecosInput[instalacaoId] || "").trim();
    if (!end || end.length < 5) {
      toast.error("Informe o endereço completo onde o veículo estará.");
      return;
    }

    setSalvandoEndereco((prev) => ({ ...prev, [instalacaoId]: true }));
    try {
      const res = await clienteInformarEnderecoInstalacao(instalacaoId, end);
      if (res.success) {
        toast.success(`Endereço do veículo ${placa} enviado com sucesso ao técnico!`);
        // A RPC cliente_informar_endereco_instalacao já grava atomicamente no BD
        // e notifica técnico e operadores. Não duplicamos envio no frontend.
        await carregarDadosVeiculos();
      } else {
        // Fallback defensivo caso a RPC não execute com sucesso
        const vAlvo = veiculos.find((v) => v.instalacao_id === instalacaoId);
        if (vAlvo?.instalador_id) {
          enviarNotificacaoViaBd({
            destinatarioUserId: vAlvo.instalador_id,
            titulo: `📍 Endereço Informado pelo Cliente: ${placa}`,
            mensagem: `O cliente informou o local para o veículo ${placa}: ${end}. Disponível para agendamento presencial.`,
            tipo: "agendamento",
            url: "/instalacao",
            placa,
          }).catch(() => {});
        }
        toast.error(res.message);
      }
    } finally {
      setSalvandoEndereco((prev) => ({ ...prev, [instalacaoId]: false }));
    }
  };

  const abrirGoogleMaps = (endereco?: string | null) => {
    if (!endereco) return;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(endereco)}`;
    window.open(url, "_blank");
  };

  const ligarInstalador = (telefone?: string | null) => {
    if (!telefone) return;
    const tel = telefone.replace(/\D/g, "");
    window.location.href = `tel:${tel}`;
  };

  const totalAgendados = useMemo(
    () => veiculos.filter((v) => Boolean(v.data_agendamento)).length,
    [veiculos],
  );
  const totalPendentesEndereco = useMemo(
    () =>
      veiculos.filter((v) => Boolean(v.solicita_endereco_cliente && !v.endereco_cliente_informado))
        .length,
    [veiculos],
  );
  const totalConcluidos = useMemo(
    () => veiculos.filter((v) => v.status_instalacao === "concluida").length,
    [veiculos],
  );

  const veiculosExibidos = useMemo(() => {
    if (filtroStatus === "agendados") return veiculos.filter((v) => Boolean(v.data_agendamento));
    if (filtroStatus === "pendentes")
      return veiculos.filter((v) =>
        Boolean(v.solicita_endereco_cliente && !v.endereco_cliente_informado),
      );
    if (filtroStatus === "concluidos")
      return veiculos.filter((v) => v.status_instalacao === "concluida");
    return veiculos;
  }, [veiculos, filtroStatus]);

  return (
    <div className="space-y-4 max-w-6xl mx-auto select-none pb-28">
      {/* 1. Header Canônico GD Rastreamento */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs shrink-0">
            <Wrench className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 truncate">
                Instalação dos Rastreadores Veiculares
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Acompanhamento Tático
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Acompanhe individualmente o agendamento de cada veículo da sua frota e as etapas de
              ativação física.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/onboarding/acompanhamento"
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition shadow-xs cursor-pointer active:scale-95"
            title="Acompanhe a esteira de 6 etapas de ativação do seu rastreador"
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span>Etapas de Ativação</span>
          </a>

          <button
            type="button"
            onClick={() => setModalVeiculoAberto(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20 cursor-pointer active:scale-95"
            title="Solicitar instalação de mais um veículo para a sua frota"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Adicionar Veículo</span>
          </button>

          <button
            type="button"
            onClick={carregarDadosVeiculos}
            disabled={atualizando}
            title="Atualizar status"
            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-xs transition cursor-pointer active:scale-95"
          >
            <RefreshCw className={`h-4 w-4 ${atualizando ? "animate-spin text-amber-500" : ""}`} />
          </button>
        </div>
      </div>

      {/* 2. Balões Estatísticos Interativos com TiltCard e Filtro Bidirecional (Regra Pétrea) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(245, 158, 11, 0.25)"
          onClick={() => setFiltroStatus("todos")}
          className={`bg-[#fbf2e9] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95 ${
            filtroStatus === "todos"
              ? "border-amber-500 ring-2 ring-amber-500/20"
              : "border-slate-300/60 dark:border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Total Veículos</span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Car className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {veiculos.length}
            </p>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block mt-0.5">
              Cadastrados na conta
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(59, 130, 246, 0.25)"
          onClick={() => setFiltroStatus(filtroStatus === "agendados" ? "todos" : "agendados")}
          className={`bg-[#fbf2e9] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95 ${
            filtroStatus === "agendados"
              ? "border-blue-500 ring-2 ring-blue-500/20"
              : "border-slate-300/60 dark:border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Agendados</span>
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {totalAgendados}
            </p>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
              Com data confirmada
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(234, 88, 12, 0.25)"
          onClick={() => setFiltroStatus(filtroStatus === "pendentes" ? "todos" : "pendentes")}
          className={`bg-[#fbf2e9] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95 ${
            filtroStatus === "pendentes"
              ? "border-orange-500 ring-2 ring-orange-500/20"
              : "border-slate-300/60 dark:border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">
              Endereço Pendente
            </span>
            <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {totalPendentesEndereco}
            </p>
            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold block mt-0.5">
              Aguardando envio
            </span>
          </div>
        </TiltCard>

        <TiltCard
          maxTilt={4}
          spotlightColor="rgba(16, 185, 129, 0.25)"
          onClick={() => setFiltroStatus(filtroStatus === "concluidos" ? "todos" : "concluidos")}
          className={`bg-[#fbf2e9] dark:bg-slate-900/70 border rounded-2xl p-3.5 flex flex-col justify-between shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_12px_#b8c6da] transition cursor-pointer active:scale-95 ${
            filtroStatus === "concluidos"
              ? "border-emerald-500 ring-2 ring-emerald-500/20"
              : "border-slate-300/60 dark:border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[10.5px] font-bold uppercase tracking-wider">Concluídos</span>
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {totalConcluidos}
            </p>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block mt-0.5">
              GPS ativado
            </span>
          </div>
        </TiltCard>
      </div>

      {/* Banner de ativação de notificações nativas caso ainda não concedidas */}
      {permissaoNotif !== "granted" &&
        typeof window !== "undefined" &&
        "Notification" in window && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Ative as Notificações em Tempo Real
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Receba avisos instantâneos no seu navegador ou celular quando o técnico agendar ou
                  solicitar a localização.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAtivarNotificacoes}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Ativar Notificações</span>
            </button>
          </div>
        )}

      {carregando ? (
        <div className="p-8 rounded-3xl bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl text-center space-y-3">
          <div className="h-8 w-8 mx-auto rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Localizando veículos e agendamentos atribuídos à sua conta...
          </p>
        </div>
      ) : veiculos.length === 0 ? (
        <TiltCard
          maxTilt={2}
          glowRgb="16, 185, 129"
          className="rounded-3xl bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 p-6 sm:p-10 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl text-center space-y-6"
        >
          <div className="h-16 w-16 mx-auto rounded-3xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-md">
            <Car className="h-8 w-8 text-amber-500" />
          </div>

          <div className="space-y-2 max-w-xl mx-auto">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
              Nenhum veículo em processo de instalação física
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Se você acabou de assinar o plano ou contratou novos rastreadores, a central da GD
              Rastreamento Guardião está atribuindo os técnicos para a sua frota.
            </p>
          </div>

          {/* Stepper Visual das 6 Etapas de Ativação Canônica */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/70 dark:bg-slate-800/60 border border-slate-300/50 dark:border-slate-700/60 text-left max-w-2xl mx-auto space-y-3 shadow-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span>Fluxo Canônico de Ativação (6 Etapas de Conexão Física e Transmissão)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  1. Cadastro
                </span>
                <p className="text-slate-500 text-[10px]">Aprovado no sistema</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <span className="font-bold text-amber-600 dark:text-amber-400">2. Técnico</span>
                <p className="text-slate-500 text-[10px]">Atribuição do técnico</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <span className="font-bold text-sky-600 dark:text-sky-400">3. Endereço</span>
                <p className="text-slate-500 text-[10px]">Confirmação de agenda</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  4. Instalação
                </span>
                <p className="text-slate-500 text-[10px]">Montagem no veículo</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <span className="font-bold text-purple-600 dark:text-purple-400">5. Teste 4G</span>
                <p className="text-slate-500 text-[10px]">Transmissão e sensores</p>
              </div>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  6. Liberação
                </span>
                <p className="text-slate-500 text-[10px]">Sinal GPS liberado</p>
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={() => setModalVeiculoAberto(true)}
              className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider transition inline-flex items-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Solicitar Novo Veículo Agora</span>
            </button>
          </div>
        </TiltCard>
      ) : veiculosExibidos.length === 0 ? (
        <div className="p-8 rounded-3xl bg-[#fbf2e9] dark:bg-slate-900/80 border border-slate-300/60 dark:border-slate-800 text-center space-y-3 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
          <Filter className="h-8 w-8 mx-auto text-slate-400" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Nenhum veículo encontrado para o filtro selecionado
          </h4>
          <button
            type="button"
            onClick={() => setFiltroStatus("todos")}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-bold transition hover:bg-amber-500/30 cursor-pointer active:scale-95"
          >
            Mostrar Todos os Veículos
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {veiculosExibidos.map((v) => {
            const isAgendado = Boolean(v.data_agendamento);
            const dataFormatada = v.data_agendamento
              ? v.data_agendamento.split("-").reverse().join("/")
              : "";
            const precisaEndereco = Boolean(v.solicita_endereco_cliente);
            const jaInformouEndereco = Boolean(v.endereco_cliente_informado);
            const isLocalVeiculo = v.local_tipo === "local_veiculo" || v.local_tipo === "domicilio";
            const enderecoEfetivo = isLocalVeiculo
              ? v.local_endereco || v.endereco_cliente_informado
              : v.local_endereco || v.instalador_endereco;

            return (
              <div
                key={v.instalacao_id}
                className="p-5 sm:p-7 rounded-3xl bg-white/95 dark:bg-slate-900/95 border border-slate-300/70 dark:border-slate-800 shadow-[6px_6px_24px_#c3cfe2] dark:shadow-2xl backdrop-blur-md space-y-5 transition-all"
              >
                {/* Topo do Card do Veículo */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    {/* Mini Placa Mercosul Canônica */}
                    <div className="border border-slate-700 bg-white rounded-md shadow-xs overflow-hidden w-24 shrink-0">
                      <div className="bg-[#003399] px-1 py-0.5 flex items-center justify-between">
                        <span className="text-[7px] text-white font-black tracking-wider leading-none">
                          BRASIL
                        </span>
                      </div>
                      <div className="py-0.5 text-center font-mono font-black text-slate-950 text-xs tracking-wider">
                        {v.placa}
                      </div>
                    </div>

                    <div>
                      <h2 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>
                          {v.marca} {v.modelo}
                        </span>
                        {v.ano && (
                          <span className="text-xs text-slate-400 font-normal">({v.ano})</span>
                        )}
                      </h2>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                        Cor: {v.cor || "Padrão"} • Tipo: {v.tipo_veiculo}
                      </span>
                    </div>
                  </div>

                  {/* Badge de Status Específico deste Veículo */}
                  <div>
                    {v.status_instalacao === "concluida" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Instalação Concluída
                      </span>
                    ) : precisaEndereco ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 animate-pulse">
                        <MapPin className="h-3.5 w-3.5" />
                        Endereço Solicitado pelo Técnico
                      </span>
                    ) : isAgendado ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        <Calendar className="h-3.5 w-3.5" />
                        Instalação Agendada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                        <Clock className="h-3.5 w-3.5" />
                        Aguardando Agendamento
                      </span>
                    )}
                  </div>
                </div>

                {/* ALERTA INTERATIVO: Técnico Solicitou Endereço para este Veículo */}
                {precisaEndereco && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-sky-500/10 border-2 border-sky-500/40 text-slate-800 dark:text-slate-100 space-y-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-300 shrink-0 mt-0.5">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs sm:text-sm font-black text-sky-950 dark:text-sky-200">
                          Informe o endereço onde este veículo estará para a instalação física
                        </h4>
                        <p className="text-xs text-sky-900/80 dark:text-sky-300/80 leading-relaxed">
                          O técnico <strong className="font-bold">{v.instalador_nome}</strong> irá
                          até o local do veículo para realizar a instalação presencial. Digite o
                          endereço completo abaixo (rua, número, bairro, cidade e ponto de
                          referência).
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                      <input
                        type="text"
                        value={enderecosInput[v.instalacao_id] || ""}
                        onChange={(e) =>
                          setEnderecosInput((prev) => ({
                            ...prev,
                            [v.instalacao_id]: e.target.value,
                          }))
                        }
                        placeholder="Ex: Rua Dom Antônio Cabral, 225, São Luiz, Volta Redonda/RJ (Portão 2)"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-sky-400/60 dark:border-sky-500/40 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-500 transition shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => handleEnviarEndereco(v.instalacao_id, v.placa)}
                        disabled={salvandoEndereco[v.instalacao_id]}
                        className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                      >
                        {salvandoEndereco[v.instalacao_id] ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        <span>Enviar Endereço de Instalação</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Informação se o cliente já enviou endereço e aguarda confirmação de data */}
                {!precisaEndereco && jaInformouEndereco && !isAgendado && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-300 font-medium">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <span>Endereço de atendimento enviado ao técnico: </span>
                      <strong className="font-bold underline">
                        {v.endereco_cliente_informado}
                      </strong>
                      <span>
                        . O técnico definirá o horário e você receberá uma notificação imediata.
                      </span>
                    </div>
                  </div>
                )}

                {/* Grade de 3 Cards Táticos de Informação para este Veículo */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Card 1: Técnico Responsável */}
                  <div className="p-3.5 rounded-2xl bg-[#fbf2e9]/60 dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800/80 flex flex-col justify-between space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                      <span>Técnico Responsável</span>
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {v.instalador_nome || "Técnico em Atribuição"}
                      </div>
                      {v.instalador_telefone ? (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                          Tel: {v.instalador_telefone}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Contato via central
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Data e Horário */}
                  <div className="p-3.5 rounded-2xl bg-[#fbf2e9]/60 dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800/80 flex flex-col justify-between space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                      <span>Data e Horário</span>
                    </span>
                    {isAgendado ? (
                      <div>
                        <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {dataFormatada}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                          Horário: {v.hora_agendamento || "--:--"}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>Em definição pelo técnico</span>
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Você será notificado
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 3: Local de Atendimento */}
                  <div className="p-3.5 rounded-2xl bg-[#fbf2e9]/60 dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800/80 flex flex-col justify-between space-y-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                      <span>Local do Atendimento</span>
                    </span>
                    <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200 line-clamp-2">
                      {isLocalVeiculo
                        ? enderecoEfetivo || "Endereço no local do veículo aguardando envio"
                        : enderecoEfetivo || "Oficina do técnico em confirmação"}
                    </div>
                  </div>
                </div>

                {/* Caixa de Orientação e Botões de Ação para este Veículo */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    {isAgendado ? (
                      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <span>
                      {isAgendado
                        ? `Atendimento agendado para ${dataFormatada} às ${v.hora_agendamento}.`
                        : "Aguardando confirmação de agenda pelo técnico responsável."}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {enderecoEfetivo && !isLocalVeiculo && (
                      <button
                        type="button"
                        onClick={() => abrirGoogleMaps(enderecoEfetivo)}
                        className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-300/70 dark:border-slate-700 shadow-xs cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-amber-500" />
                        <span>Traçar Rota no Mapa</span>
                      </button>
                    )}

                    {v.instalador_telefone && (
                      <button
                        type="button"
                        onClick={() => ligarInstalador(v.instalador_telefone)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        <span>Ligar para o Instalador</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Solicitação de Novo Veículo */}
      <ModalClienteSolicitarVeiculo
        aberto={modalVeiculoAberto}
        clienteIdProp={session?.clienteId}
        onFechar={() => setModalVeiculoAberto(false)}
        onSucesso={() => {
          carregarDadosVeiculos();
        }}
      />
    </div>
  );
}
