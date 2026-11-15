import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  X,
  Clock,
  Navigation,
  Key,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Zap,
  Gauge,
  Calendar,
  AlertCircle,
  MapPin,
  RefreshCw,
  Play,
  Flame,
  Hourglass,
  Route,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import {
  carregarTimelineVeiculo,
  carregarCiclosViagem,
  calcularResumoDiario,
  type EventoTimeline,
  type CicloViagemConsolidado,
  type ResumoDiarioVeiculo,
} from "../services/timelineService";
import { RefazerTrajetoModal } from "./RefazerTrajetoModal";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { formatarDistanciaViagem } from "../utils/formatadoresViagem";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ehAlertaRestritoEquipeTecnica } from "../constants/alertasCatalogo";

interface TimelineVeiculoDrawerProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
  onReproduzirCiclo?: (viagemId: string) => void;
}

export function TimelineVeiculoDrawer({
  veiculo,
  onFechar,
  onReproduzirCiclo,
}: TimelineVeiculoDrawerProps) {
  const { session } = useAuth();
  const isEquipeTecnica = Boolean(session?.isSuperAdmin || session?.isAdmin || session?.isOperador);
  const [modoVisualizacao, setModoVisualizacao] = useState<"ciclos" | "logs">("ciclos");
  const [ciclos, setCiclos] = useState<CicloViagemConsolidado[]>([]);
  const [eventos, setEventos] = useState<EventoTimeline[]>([]);
  const [resumo, setResumo] = useState<ResumoDiarioVeiculo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [cicloExpandidoId, setCicloExpandidoId] = useState<string | null>(null);
  const [viagemPlaybackId, setViagemPlaybackId] = useState<string | null>(null);

  const [dataSelecionada, setDataSelecionada] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const carregar = useCallback(
    async (dataIso: string) => {
      setCarregando(true);
      try {
        const dataFiltro = new Date(`${dataIso}T12:00:00`);
        const [listaEventos, listaCiclos, resumoDiario] = await Promise.all([
          carregarTimelineVeiculo(veiculo.id, dataFiltro),
          carregarCiclosViagem(veiculo.id, dataFiltro),
          calcularResumoDiario(veiculo.id, dataFiltro),
        ]);
        const eventosVisiveis = listaEventos.filter(
          (ev) => isEquipeTecnica || !ehAlertaRestritoEquipeTecnica(ev.tipo),
        );
        const ciclosVisiveis = listaCiclos.map((ciclo) => ({
          ...ciclo,
          eventos: (ciclo.eventos || []).filter(
            (ev) => isEquipeTecnica || !ehAlertaRestritoEquipeTecnica(ev.tipo),
          ),
        }));
        setEventos(eventosVisiveis);
        setCiclos(ciclosVisiveis);
        setResumo(resumoDiario);
      } catch (err) {
        console.warn("Erro ao carregar dados da timeline:", err);
        setEventos([]);
        setCiclos([]);
      } finally {
        setCarregando(false);
      }
    },
    [veiculo.id, isEquipeTecnica],
  );

  useEffect(() => {
    carregar(dataSelecionada);

    // Reatividade via Supabase Realtime para viagens e eventos
    const canal = supabase
      .channel(`timeline_full_${veiculo.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "eventos_veiculo",
          filter: `veiculo_id=eq.${veiculo.id}`,
        },
        () => {
          carregar(dataSelecionada);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "viagens_trajetos",
          filter: `veiculo_id=eq.${veiculo.id}`,
        },
        () => {
          carregar(dataSelecionada);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregar, dataSelecionada, veiculo.id]);

  const handleReproduzir = (viagemId: string) => {
    if (onReproduzirCiclo) {
      onReproduzirCiclo(viagemId);
    } else {
      setViagemPlaybackId(viagemId);
    }
  };

  const getIconeEvento = (tipo: EventoTimeline["tipo"]) => {
    switch (tipo) {
      case "ignicao_ligada":
        return <Key className="h-4 w-4 text-orange-500" />;
      case "ignicao_desligada":
        return <Key className="h-4 w-4 text-slate-400" />;
      case "deslocamento_iniciado":
        return <Navigation className="h-4 w-4 text-sky-500" />;
      case "parada_estacionado":
        return <MapPin className="h-4 w-4 text-amber-500" />;
      case "entrada_area":
        return <ShieldCheck className="h-4 w-4 text-orange-500" />;
      case "saida_area":
        return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      case "excesso_velocidade":
        return <Gauge className="h-4 w-4 text-amber-500" />;
      case "perda_comunicacao":
        return <Radio className="h-4 w-4 text-rose-500" />;
      case "retorno_comunicacao":
        return <Radio className="h-4 w-4 text-emerald-500" />;
      case "baixa_tensao":
        return <Zap className="h-4 w-4 text-rose-500" />;
      case "desvio_rota":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "anomalia":
        return <AlertCircle className="h-4 w-4 text-purple-500" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 pb-safe">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Timeline Executiva de Viagens
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {veiculo.placa}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Consolidação inteligente de ciclos de deslocamento e telemetria
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Subheader: Filtro de Data e Alternador de Abas */}
          <div className="px-4 py-3 bg-[#eaf0f8]/80 dark:bg-slate-950/40 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Calendar className="h-4 w-4 text-orange-500" />
              <input
                type="date"
                value={dataSelecionada}
                onChange={(e) => setDataSelecionada(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
              />
              <button
                onClick={() => carregar(dataSelecionada)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Atualizar"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Alternador de Abas: Ciclos de Viagem vs Logs Detalhados */}
            <div className="flex items-center bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold">
              <button
                onClick={() => setModoVisualizacao("ciclos")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  modoVisualizacao === "ciclos"
                    ? "bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Route className="h-3.5 w-3.5" />
                <span>Ciclos de Viagem ({ciclos.length})</span>
              </button>
              <button
                onClick={() => setModoVisualizacao("logs")}
                className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  modoVisualizacao === "logs"
                    ? "bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>Logs ({eventos.length})</span>
              </button>
            </div>
          </div>

          {/* Resumo Diário Consolidado (Sempre visível no topo da listagem) */}
          {resumo && (
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-500/5 via-sky-500/5 to-transparent border-b border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center font-mono">
                <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-sans uppercase">Ciclos</div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {resumo.totalViagens}
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-sans uppercase">Distância</div>
                  <div className="text-sm font-black text-orange-600 dark:text-orange-400">
                    {formatarDistanciaViagem(resumo.kmTotalPercorrido)}
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-sans uppercase">Em Trânsito</div>
                  <div className="text-sm font-bold text-sky-600 dark:text-sky-400">
                    {resumo.tempoEmMovimentoFormatado}
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <div className="text-[10px] text-slate-500 font-sans uppercase">Marcha Lenta</div>
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {resumo.tempoMarchaLentaFormatado}
                  </div>
                </div>

                <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-slate-500 font-sans uppercase">Estacionado</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {resumo.tempoParadoFormatado}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Área com Scroll */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {carregando ? (
              <div className="text-center py-16 text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-orange-500" />
                <span>Carregando telemetria e ciclos de viagem...</span>
              </div>
            ) : modoVisualizacao === "ciclos" ? (
              // =============================================================
              // MODO 1: CICLOS DE VIAGEM CONSOLIDADOS (VISÃO EXECUTIVA)
              // =============================================================
              ciclos.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-xs">
                  Nenhum ciclo de ignição ou deslocamento registrado para o veículo {veiculo.placa}{" "}
                  nesta data.
                </div>
              ) : (
                <div className="space-y-4">
                  {ciclos.map((ciclo) => {
                    const horaInicio = new Date(ciclo.inicioAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const horaFim = ciclo.fimAt
                      ? new Date(ciclo.fimAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Agora";

                    const isExpandido = cicloExpandidoId === ciclo.id;

                    return (
                      <div key={ciclo.id} className="space-y-3">
                        {/* Marcador de Tempo Estacionado ANTERIOR a este ciclo */}
                        {ciclo.tempoEstacionadoAnteriorFormatado && (
                          <div className="flex items-center justify-center my-2">
                            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60 flex items-center gap-1.5 shadow-2xs">
                              <Hourglass className="h-3 w-3 text-slate-400" />
                              Veículo Estacionado por {ciclo.tempoEstacionadoAnteriorFormatado}{" "}
                              (chave desligada)
                            </span>
                          </div>
                        )}

                        {/* Card Executivo do Ciclo de Viagem */}
                        <div
                          className={`rounded-2xl border transition-all shadow-sm overflow-hidden ${
                            ciclo.emAndamento
                              ? "bg-orange-500/5 dark:bg-orange-950/20 border-orange-500/40"
                              : "bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800"
                          }`}
                        >
                          {/* Topo do Card */}
                          <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800/60 flex-wrap">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`h-8 w-8 rounded-xl flex items-center justify-center ${
                                  ciclo.emAndamento
                                    ? "bg-orange-500 text-white animate-pulse"
                                    : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                                }`}
                              >
                                <Navigation className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                                    Ciclo #{ciclo.numeroCiclo}
                                  </span>
                                  {ciclo.emAndamento ? (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-500 text-white animate-pulse">
                                      Em Andamento
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                      Concluído
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  {horaInicio} às {horaFim} ({ciclo.duracaoFormatada})
                                </div>
                              </div>
                            </div>

                            {/* Botão de Reproduzir Trajeto no Mapa */}
                            <button
                              onClick={() => handleReproduzir(ciclo.id)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 active:scale-95 transition shadow-sm flex items-center gap-1.5 cursor-pointer ml-auto"
                              title="Reproduzir este ciclo completo no mapa com player interativo"
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                              <span>Reproduzir no Mapa</span>
                            </button>
                          </div>

                          {/* Grid com os 4 Pilares do Ciclo */}
                          <div className="p-3.5 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
                            {/* 1. Quilometragem */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80">
                              <div className="text-[10px] text-slate-500 font-sans uppercase">
                                Distância Real
                              </div>
                              <div className="text-base font-black text-orange-600 dark:text-orange-400 mt-0.5">
                                {formatarDistanciaViagem(ciclo.kmPercorrido)}
                              </div>
                            </div>

                            {/* 2. Tempo em Trânsito */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80">
                              <div className="text-[10px] text-slate-500 font-sans uppercase">
                                Em Movimento
                              </div>
                              <div className="text-base font-bold text-sky-600 dark:text-sky-400 mt-0.5">
                                {ciclo.minutosEmMovimentoFormatado}
                              </div>
                            </div>

                            {/* 3. Marcha Lenta (Idling) */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80">
                              <div className="text-[10px] text-slate-500 font-sans uppercase flex items-center justify-center gap-1">
                                <Flame className="h-3 w-3 text-amber-500" />
                                Marcha Lenta
                              </div>
                              <div className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                {ciclo.minutosMarchaLentaFormatado}
                              </div>
                            </div>

                            {/* 4. Velocidades */}
                            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80">
                              <div className="text-[10px] text-slate-500 font-sans uppercase">
                                Vel. Máx / Média
                              </div>
                              <div className="text-base font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                {ciclo.velocidadeMaxima}{" "}
                                <span className="text-[10px] text-slate-400">
                                  / {ciclo.velocidadeMedia} km/h
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Seção de Eventos Dentro Deste Ciclo */}
                          {ciclo.eventos.length > 0 && (
                            <div className="px-3.5 pb-3 sm:px-4 sm:pb-3.5">
                              <button
                                onClick={() => setCicloExpandidoId(isExpandido ? null : ciclo.id)}
                                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                  <span>
                                    {ciclo.eventos.length} ocorrência(s) registrada(s) neste ciclo
                                  </span>
                                </span>
                                {isExpandido ? (
                                  <ChevronUp className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400" />
                                )}
                              </button>

                              {isExpandido && (
                                <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-amber-500/40 animate-in fade-in duration-150">
                                  {ciclo.eventos.map((ev) => (
                                    <div
                                      key={ev.id}
                                      className="text-xs flex items-center justify-between p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/60"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-[11px] font-bold text-orange-600 dark:text-orange-400">
                                          {new Date(ev.data_hora).toLocaleTimeString("pt-BR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200">
                                          {ev.titulo}
                                        </span>
                                      </div>
                                      {ev.velocidade !== undefined && ev.velocidade !== null && (
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                          {ev.velocidade} km/h
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : // =============================================================
            // MODO 2: LOGS DE AUDITORIA (VISÃO CRONOLÓGICA DETALHADA)
            // =============================================================
            eventos.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs">
                Nenhum log registrado para o veículo {veiculo.placa} nesta data.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {eventos.map((ev) => {
                  const horaFormatada = new Date(ev.data_hora).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div key={ev.id} className="relative group">
                      {/* Marcador na Linha */}
                      <div className="absolute -left-6 mt-1 flex items-center justify-center w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 group-hover:border-orange-500 transition shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-orange-500 transition" />
                      </div>

                      {/* Card do Evento */}
                      <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3 hover:border-slate-300 dark:hover:border-slate-700 transition">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-orange-600 dark:text-orange-400">
                              {horaFormatada}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-slate-100">
                              {getIconeEvento(ev.tipo)}
                              <span>{ev.titulo}</span>
                            </div>
                          </div>

                          {ev.velocidade !== undefined && ev.velocidade !== null && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {ev.velocidade} km/h
                            </span>
                          )}
                        </div>

                        {ev.descricao && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {ev.descricao}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Interno de Playback do Ciclo (se acionado diretamente) */}
      {viagemPlaybackId && (
        <RefazerTrajetoModal
          veiculo={veiculo}
          viagemInicialId={viagemPlaybackId}
          onFechar={() => setViagemPlaybackId(null)}
        />
      )}
    </ModalPortal>
  );
}
