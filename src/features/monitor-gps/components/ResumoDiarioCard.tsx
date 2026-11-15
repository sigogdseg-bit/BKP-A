import { useState, useEffect, useCallback } from "react";
import { Route, Clock, Gauge, AlertCircle, ShieldAlert, Sparkles, RefreshCw } from "lucide-react";
import { TiltCard } from "@/shared/components/TiltCard";
import { calcularResumoDiario, type ResumoDiarioVeiculo } from "../services/timelineService";

interface ResumoDiarioCardProps {
  veiculoId: string;
  onAbrirTimeline?: () => void;
}

export function ResumoDiarioCard({ veiculoId, onAbrirTimeline }: ResumoDiarioCardProps) {
  const [resumo, setResumo] = useState<ResumoDiarioVeiculo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await calcularResumoDiario(veiculoId);
      setResumo(dados);
    } catch {
      // Silencioso
    } finally {
      setCarregando(false);
    }
  }, [veiculoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando && !resumo) {
    return (
      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/80 animate-pulse text-xs text-slate-400">
        Carregando resumo do dia...
      </div>
    );
  }

  if (!resumo) return null;

  return (
    <TiltCard
      maxTilt={5}
      spotlightColor="rgba(16, 185, 129, 0.35)"
      className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-500/5 dark:from-slate-950/60 dark:to-emerald-950/20 border border-slate-200 dark:border-slate-800 flex flex-col gap-2.5 shadow-sm"
    >
      {/* Cabeçalho do Card */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
          <Sparkles className="h-3.5 w-3.5 text-orange-500" />
          <span>Resumo de Hoje ({resumo.dataReferencia})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={carregar}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title="Atualizar resumo"
          >
            <RefreshCw className={`h-3 w-3 ${carregando ? "animate-spin" : ""}`} />
          </button>
          {onAbrirTimeline && (
            <button
              onClick={onAbrirTimeline}
              className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline px-1.5 py-0.5"
            >
              Ver Timeline →
            </button>
          )}
        </div>
      </div>

      {/* Grid com os 4 Indicadores Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center">
        {/* 1. Viagens Realizadas */}
        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase">
            Viagens
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-slate-100 mt-0.5">
            {resumo.totalViagens}
          </div>
        </div>

        {/* 2. Quilometragem Total */}
        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase">
            Distância
          </div>
          <div className="text-sm font-black text-orange-600 dark:text-orange-400 mt-0.5">
            {resumo.kmTotalPercorrido} <span className="text-[9px] font-normal">km</span>
          </div>
        </div>

        {/* 3. Tempo em Movimento */}
        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase">
            Rodando
          </div>
          <div className="text-sm font-bold text-sky-600 dark:text-sky-400 mt-0.5">
            {resumo.tempoEmMovimentoFormatado}
          </div>
        </div>

        {/* 4. Tempo Estacionado */}
        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase">
            Estacionado
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-0.5">
            {resumo.tempoParadoFormatado}
          </div>
        </div>
      </div>

      {/* Alertas e Eventos Ocorridos Hoje */}
      {(resumo.excessosVelocidade > 0 ||
        resumo.saidasArea > 0 ||
        resumo.perdasComunicacao > 0 ||
        resumo.anomalias > 0) && (
        <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px] font-medium text-slate-600 dark:text-slate-400">
          {resumo.excessosVelocidade > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              {resumo.excessosVelocidade} excesso(s)
            </span>
          )}
          {resumo.saidasArea > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" />
              {resumo.saidasArea} saída(s) de área
            </span>
          )}
          {resumo.anomalias > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {resumo.anomalias} anomalia(s)
            </span>
          )}
        </div>
      )}
    </TiltCard>
  );
}
