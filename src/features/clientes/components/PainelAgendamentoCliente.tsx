import { useState, useEffect, useCallback } from "react";
import {
  Wrench,
  Calendar,
  Clock,
  MapPin,
  Phone,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { obterAgendamentoCliente } from "../services/clienteService";
import { APP_NOME } from "@/shared/lib/version";
import type { AgendamentoClienteInfo } from "../types";

export function PainelAgendamentoCliente() {
  const { session } = useAuth();
  const [agendamento, setAgendamento] = useState<AgendamentoClienteInfo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [minimizado, setMinimizado] = useState(false);
  const [fechado, setFechado] = useState(false);

  const carregar = useCallback(async () => {
    if (!session?.userId && !session?.email && !session?.clienteId) return;
    try {
      const info = await obterAgendamentoCliente(session.userId, session.email, session.clienteId);
      setAgendamento(info);
    } finally {
      setCarregando(false);
    }
  }, [session?.userId, session?.email, session?.clienteId]);

  useEffect(() => {
    carregar();

    const canal = supabase
      .channel(`hunter_cliente_agendamento_${session?.userId || session?.email || "geral"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes",
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
          table: "instalacoes",
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
          table: "veiculos",
        },
        () => {
          carregar();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes_sistema",
        },
        () => {
          carregar();
        },
      )
      .subscribe();

    const onAtualizar = () => {
      carregar();
    };

    window.addEventListener("hunter:atualizar_demandas", onAtualizar);
    window.addEventListener("hunter:nova_notificacao", onAtualizar);

    return () => {
      supabase.removeChannel(canal);
      window.removeEventListener("hunter:atualizar_demandas", onAtualizar);
      window.removeEventListener("hunter:nova_notificacao", onAtualizar);
    };
  }, [carregar, session?.userId, session?.email]);

  if (carregando || fechado) {
    return null;
  }

  // Se nao houver agendamento pendente, nao precisa exibir
  if (!agendamento || agendamento.status_agendamento === "concluido") {
    return null;
  }

  const isAgendado =
    agendamento.status_agendamento === "agendado" && Boolean(agendamento.data_agendamento);

  const dataFormatada = agendamento.data_agendamento
    ? agendamento.data_agendamento.split("-").reverse().join("/")
    : "";

  const abrirGoogleMaps = () => {
    if (!agendamento.instalador_endereco) return;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(
      agendamento.instalador_endereco,
    )}`;
    window.open(url, "_blank");
  };

  const ligarInstalador = () => {
    if (!agendamento.instalador_telefone) return;
    const tel = agendamento.instalador_telefone.replace(/\D/g, "");
    window.location.href = `tel:${tel}`;
  };

  // Modo minimizado: Pill discreto superior
  if (minimizado) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#fbf2e9] dark:bg-slate-950/90 border border-amber-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl select-none animate-fadeIn text-slate-800 dark:text-slate-100">
        <div className="flex items-center gap-2 text-xs">
          <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="font-bold text-slate-900 dark:text-slate-200">Novo Agendamento:</span>
          <span className="text-amber-700 dark:text-amber-400 font-medium">
            {isAgendado
              ? `${dataFormatada} às ${agendamento.hora_agendamento}`
              : "Aguardando definição"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimizado(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            title="Expandir aviso de agendamento"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFechado(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            title="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-[#fbf2e9] dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-950 dark:to-slate-950 border border-amber-500/40 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl space-y-4 select-none animate-fadeIn text-slate-800 dark:text-slate-100">
      {/* Topo do Card com Status e Botoes de Controle */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-300/60 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                Levar Novo Veículo para Instalar Rastreador
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                  isAgendado
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 animate-pulse"
                }`}
              >
                {isAgendado ? "Instalação Agendada" : "Levar Novo Veículo para Instalar"}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              Atenção: Você possui veículo com instalação física pendente. Compareça com o veículo
              até a oficina credenciada para a instalação do rastreador ${APP_NOME} e ativação no
              sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMinimizado(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            title="Minimizar aviso"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFechado(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            title="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grade de Detalhes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Técnico / Instalador */}
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Wrench className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>Técnico Responsável</span>
          </span>
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            {agendamento.instalador_nome || "Técnico em Atribuição"}
          </div>
          {agendamento.instalador_telefone ? (
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
              Tel: {agendamento.instalador_telefone}
            </div>
          ) : null}
        </div>

        {/* Data e Horário */}
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Calendar className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>Data e Horário</span>
          </span>
          {isAgendado ? (
            <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {dataFormatada} às {agendamento.hora_agendamento || "--:--"}
            </div>
          ) : (
            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Aguardando definição</span>
            </div>
          )}
        </div>

        {/* Local / Endereço */}
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-950/80 border border-slate-300/60 dark:border-slate-800 space-y-1 shadow-xs">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <MapPin className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>Local da Oficina</span>
          </span>
          <div className="text-[11px] font-medium text-slate-800 dark:text-slate-200 line-clamp-2">
            {agendamento.instalador_endereco || "Endereço em confirmação"}
          </div>
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
        {agendamento.instalador_endereco ? (
          <button
            type="button"
            onClick={abrirGoogleMaps}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 text-xs font-bold transition flex items-center gap-1.5 shadow-xs border border-slate-300/70 dark:border-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>Ver Rota no Google Maps</span>
          </button>
        ) : null}

        {agendamento.instalador_telefone ? (
          <button
            type="button"
            onClick={ligarInstalador}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Ligar para o Instalador</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
