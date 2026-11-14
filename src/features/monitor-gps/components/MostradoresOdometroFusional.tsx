import React, { useState, useMemo, useEffect } from "react";
import {
  Gauge,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Compass,
  Zap,
  Activity,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react";
import {
  MotorOdometroPropostaA,
  MotorOdometroPropostaB,
  MotorOdometroPropostaC,
  gerarCenariosSimulacao,
  LeituraMostrador,
  CenarioSimulacao,
} from "../lib/motoresOdometroComparativo";

interface MostradoresOdometroFusionalProps {
  placaVeiculo?: string;
  odometroPainelReferenciaKm?: number;
}

export function MostradoresOdometroFusional({
  placaVeiculo = "AXH0E44",
  odometroPainelReferenciaKm = 183421.0,
}: MostradoresOdometroFusionalProps) {
  // Instâncias dos 3 motores
  const [motores, setMotores] = useState(() => ({
    a: new MotorOdometroPropostaA(odometroPainelReferenciaKm),
    b: new MotorOdometroPropostaB(odometroPainelReferenciaKm),
    c: new MotorOdometroPropostaC(odometroPainelReferenciaKm),
  }));

  const cenarios = useMemo(() => gerarCenariosSimulacao(), []);
  const [cenarioAtivoId, setCenarioAtivoId] = useState<string>("inicial");
  const [historicoAcoes, setHistoricoAcoes] = useState<string[]>([]);

  // Sincroniza dinamicamente se o odometroPainelReferenciaKm for alterado externamente
  useEffect(() => {
    if (
      typeof odometroPainelReferenciaKm === "number" &&
      !isNaN(odometroPainelReferenciaKm) &&
      odometroPainelReferenciaKm > 0
    ) {
      motores.a.equalizar(odometroPainelReferenciaKm);
      motores.b.equalizar(odometroPainelReferenciaKm);
      motores.c.equalizar(odometroPainelReferenciaKm);

      setLeituraA((prev) => ({
        ...prev,
        odometroKm: odometroPainelReferenciaKm,
        odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
        deltaMetros: 0,
        divergenciaPainelKm: 0.0,
      }));
      setLeituraB((prev) => ({
        ...prev,
        odometroKm: odometroPainelReferenciaKm,
        odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
        deltaMetros: 0,
        divergenciaPainelKm: 0.0,
      }));
      setLeituraC((prev) => ({
        ...prev,
        odometroKm: odometroPainelReferenciaKm,
        odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
        deltaMetros: 0,
        divergenciaPainelKm: 0.0,
      }));
    }
  }, [odometroPainelReferenciaKm, motores]);

  // Estados dos 3 mostradores
  const [leituraA, setLeituraA] = useState<LeituraMostrador>(() => {
    return {
      motorId: "a",
      titulo: "Mostrador A · Fusão Bayesiana 1D",
      subtitulo: "Reconstrução de Curvatura Gaussiana e ZVU Histerético",
      odometroKm: odometroPainelReferenciaKm,
      odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.000215,
      estadoZvu: "PARADO_ZVU",
      bloqueioMotivo: "ÂNCORA_INICIAL",
      pesos: { gnssOuArco: 52, cinematico: 28, mcuJ16: 20 },
      divergenciaPainelKm: 0.0,
    };
  });

  const [leituraB, setLeituraB] = useState<LeituraMostrador>(() => {
    return {
      motorId: "b",
      titulo: "Mostrador B · Haversine Esférico",
      subtitulo: "Doppler Trapezoidal e Variâncias Fixas Provisórias",
      odometroKm: odometroPainelReferenciaKm,
      odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.0,
      estadoZvu: "PARADO_ZVU",
      bloqueioMotivo: "ÂNCORA_INICIAL",
      pesos: { gnssOuArco: 57, cinematico: 25, mcuJ16: 18 },
      divergenciaPainelKm: 0.0,
    };
  });

  const [leituraC, setLeituraC] = useState<LeituraMostrador>(() => {
    return {
      motorId: "c",
      titulo: "Mostrador C · EKF 1D Canônico",
      subtitulo: "Expansão Taylor 4ª Ordem e ZVU 6 Regras (GD Rastreamento)",
      odometroKm: odometroPainelReferenciaKm,
      odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.00027267,
      estadoZvu: "PARADO_ZVU",
      bloqueioMotivo: "ÂNCORA_INICIAL",
      pesos: { gnssOuArco: 6, cinematico: 4, mcuJ16: 90 },
      divergenciaPainelKm: 0.0,
    };
  });

  const executarCenario = (cenario: CenarioSimulacao) => {
    setCenarioAtivoId(cenario.id);

    // Alimenta os 3 motores em paralelo com os pings do cenário
    let resA = leituraA;
    let resB = leituraB;
    let resC = leituraC;

    for (const ping of cenario.pings) {
      resA = motores.a.processarPing(ping);
      resB = motores.b.processarPing(ping);
      resC = motores.c.processarPing(ping);
    }

    setLeituraA(resA);
    setLeituraB(resB);
    setLeituraC(resC);

    const registro = `[${new Date().toLocaleTimeString("pt-BR")}] Simulação disparada: ${cenario.nome} → A: ${resA.odometroKm.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} km | B: ${resB.odometroKm.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} km | C: ${resC.odometroKm.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} km`;
    setHistoricoAcoes((prev) => [registro, ...prev.slice(0, 4)]);
  };

  const resetarMotores = () => {
    const novos = {
      a: new MotorOdometroPropostaA(odometroPainelReferenciaKm),
      b: new MotorOdometroPropostaB(odometroPainelReferenciaKm),
      c: new MotorOdometroPropostaC(odometroPainelReferenciaKm),
    };
    setMotores(novos);
    setCenarioAtivoId("inicial");

    setLeituraA({
      motorId: "a",
      titulo: "Mostrador A · Fusão Bayesiana 1D",
      subtitulo: "Reconstrução de Curvatura Gaussiana e ZVU Histerético",
      odometroKm: odometroPainelReferenciaKm,
      odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.000215,
      estadoZvu: "PARADO_ZVU",
      bloqueioMotivo: "RESET_ANCORA",
      pesos: { gnssOuArco: 52, cinematico: 28, mcuJ16: 20 },
      divergenciaPainelKm: 0.0,
    });

    setLeituraB({
      motorId: "b",
      titulo: "Mostrador B · Haversine Esférico",
      subtitulo: "Doppler Trapezoidal e Variâncias Fixas Provisórias",
      odometroKm: odometroPainelReferenciaKm,
      odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.0,
      estadoZvu: "PARADO_ZVU",
      bloqueioMotivo: "RESET_ANCORA",
      pesos: { gnssOuArco: 57, cinematico: 25, mcuJ16: 18 },
      divergenciaPainelKm: 0.0,
    });

    setLeituraC({
      motorId: "c",
      titulo: "Mostrador C · EKF 1D Canônico",
      subtitulo: "Expansão Taylor 4ª Ordem e ZVU 6 Regras (GD Rastreamento)",
      odometroKm: odometroPainelReferenciaKm,
      odometroMetros: Math.round(odometroPainelReferenciaKm * 1000),
      deltaMetros: 0,
      fatorCalibracaoK: 1.00027267,
      estadoZvu: "PARADO_ZVU",
      bloqueioMotivo: "RESET_ANCORA",
      pesos: { gnssOuArco: 6, cinematico: 4, mcuJ16: 90 },
      divergenciaPainelKm: 0.0,
    });

    setHistoricoAcoes((prev) => [
      `[${new Date().toLocaleTimeString("pt-BR")}] Motores sincronizados com o painel físico (${odometroPainelReferenciaKm.toLocaleString("pt-BR")} km)`,
      ...prev.slice(0, 4),
    ]);
  };

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100">
      {/* Banner Informativo Superior */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-100 to-sky-50 dark:from-slate-900/90 dark:to-sky-950/40 border border-slate-300/80 dark:border-sky-800/40 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>Laboratório de Odometria Fusional</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Veículo {placaVeiculo}
                </span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Verdade física do painel:{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {odometroPainelReferenciaKm.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}{" "}
                  km
                </strong>{" "}
                · Comparativo em tempo real das 3 propostas matemáticas
              </p>
            </div>
          </div>
          <button
            onClick={resetarMotores}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition shadow-sm cursor-pointer"
            title="Resetar motores para o valor do painel físico"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reancorar</span>
          </button>
        </div>
      </div>

      {/* OS 3 MOSTRADORES (A, B E C) LADO A LADO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* ================================================================= */}
        {/* MOSTRADOR A */}
        {/* ================================================================= */}
        <div className="flex flex-col rounded-2xl bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm hover:border-sky-400 dark:hover:border-sky-600 transition">
          {/* Header do Mostrador A */}
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                Mostrador A
              </span>
              <h5 className="text-xs font-black text-slate-900 dark:text-slate-100 mt-1">
                Fusão Bayesiana 1D
              </h5>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Arco Circular e ZVU Histerético
              </p>
            </div>
            <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-slate-800 text-sky-500">
              <Compass className="w-4 h-4" />
            </div>
          </div>

          {/* Display Digital Automotivo do Odômetro */}
          <div className="my-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-center relative overflow-hidden shadow-inner">
            <div className="absolute top-1 left-2 text-[9px] font-mono tracking-widest text-slate-500 uppercase">
              ODOMETER · KM
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-sky-400 pt-3 pb-1 select-all">
              {Math.floor(leituraA.odometroKm).toLocaleString("pt-BR")}
              <span className="text-lg text-sky-300/80">
                ,{(leituraA.odometroKm % 1).toFixed(3).substring(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono px-1 pt-1 border-t border-slate-900 text-slate-400">
              <span>{leituraA.odometroMetros.toLocaleString("pt-BR")} m</span>
              <span
                className={
                  leituraA.deltaMetros > 0 ? "text-emerald-400 font-bold" : "text-slate-500"
                }
              >
                {leituraA.deltaMetros > 0 ? `+${leituraA.deltaMetros.toFixed(1)} m` : "0.0 m"}
              </span>
            </div>
          </div>

          {/* Status ZVU e Detalhes */}
          <div className="space-y-2 text-xs flex-1">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Anti-KM Fantasma (ZVU)
              </span>
              <span
                className={`text-[11px] font-bold flex items-center gap-1 ${
                  leituraA.estadoZvu === "MOVIMENTO"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {leituraA.estadoZvu === "MOVIMENTO" ? (
                  <>
                    <Activity className="w-3 h-3" />
                    <span>Em Movimento</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    <span>ZVU Ativo (Trava)</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] px-1 text-slate-600 dark:text-slate-400">
              <span>Fator K (Calibração):</span>
              <strong className="font-mono text-slate-900 dark:text-slate-200">
                {leituraA.fatorCalibracaoK.toFixed(6)}
              </strong>
            </div>

            {/* Barras de Pesos de Fusão */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                <span>Pesos de Fusão Sensorial</span>
                <span>
                  A:{leituraA.pesos.gnssOuArco}% · C:{leituraA.pesos.cinematico}% · M:
                  {leituraA.pesos.mcuJ16}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden">
                <div
                  style={{ width: `${leituraA.pesos.gnssOuArco}%` }}
                  className="bg-sky-500"
                  title={`Arco GNSS: ${leituraA.pesos.gnssOuArco}%`}
                />
                <div
                  style={{ width: `${leituraA.pesos.cinematico}%` }}
                  className="bg-amber-500"
                  title={`Cinemático: ${leituraA.pesos.cinematico}%`}
                />
                <div
                  style={{ width: `${leituraA.pesos.mcuJ16}%` }}
                  className="bg-purple-500"
                  title={`MCU J16: ${leituraA.pesos.mcuJ16}%`}
                />
              </div>
            </div>

            <div className="p-2 rounded-lg bg-sky-50/60 dark:bg-sky-950/20 text-[10px] text-sky-800 dark:text-sky-300 leading-tight">
              Reconstrói curvas pelo arco trigonométrico S = d · (Δψ/2) / sen(Δψ/2), eliminando a
              corda linear em rodovias.
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* MOSTRADOR B */}
        {/* ================================================================= */}
        <div className="flex flex-col rounded-2xl bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm hover:border-amber-400 dark:hover:border-amber-600 transition">
          {/* Header do Mostrador B */}
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                Mostrador B
              </span>
              <h5 className="text-xs font-black text-slate-900 dark:text-slate-100 mt-1">
                Haversine Esférico
              </h5>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Doppler e Variâncias Fixas
              </p>
            </div>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-slate-800 text-amber-500">
              <Zap className="w-4 h-4" />
            </div>
          </div>

          {/* Display Digital Automotivo do Odômetro */}
          <div className="my-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-center relative overflow-hidden shadow-inner">
            <div className="absolute top-1 left-2 text-[9px] font-mono tracking-widest text-slate-500 uppercase">
              ODOMETER · KM
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-amber-400 pt-3 pb-1 select-all">
              {Math.floor(leituraB.odometroKm).toLocaleString("pt-BR")}
              <span className="text-lg text-amber-300/80">
                ,{(leituraB.odometroKm % 1).toFixed(3).substring(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono px-1 pt-1 border-t border-slate-900 text-slate-400">
              <span>{leituraB.odometroMetros.toLocaleString("pt-BR")} m</span>
              <span
                className={
                  leituraB.deltaMetros > 0 ? "text-emerald-400 font-bold" : "text-slate-500"
                }
              >
                {leituraB.deltaMetros > 0 ? `+${leituraB.deltaMetros.toFixed(1)} m` : "0.0 m"}
              </span>
            </div>
          </div>

          {/* Status ZVU e Detalhes */}
          <div className="space-y-2 text-xs flex-1">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Anti-KM Fantasma (ZVU)
              </span>
              <span
                className={`text-[11px] font-bold flex items-center gap-1 ${
                  leituraB.estadoZvu === "MOVIMENTO"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {leituraB.estadoZvu === "MOVIMENTO" ? (
                  <>
                    <Activity className="w-3 h-3" />
                    <span>Em Movimento</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    <span>ZVU Ativo (Trava)</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] px-1 text-slate-600 dark:text-slate-400">
              <span>Fator K (Calibração):</span>
              <strong className="font-mono text-slate-500">1.000000 (Fixo)</strong>
            </div>

            {/* Barras de Pesos de Fusão */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                <span>Pesos de Fusão Sensorial</span>
                <span>
                  G:{leituraB.pesos.gnssOuArco}% · D:{leituraB.pesos.cinematico}% · M:
                  {leituraB.pesos.mcuJ16}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden">
                <div
                  style={{ width: `${leituraB.pesos.gnssOuArco}%` }}
                  className="bg-sky-500"
                  title={`GNSS Haversine: ${leituraB.pesos.gnssOuArco}%`}
                />
                <div
                  style={{ width: `${leituraB.pesos.cinematico}%` }}
                  className="bg-amber-500"
                  title={`Doppler: ${leituraB.pesos.cinematico}%`}
                />
                <div
                  style={{ width: `${leituraB.pesos.mcuJ16}%` }}
                  className="bg-purple-500"
                  title={`MCU J16: ${leituraB.pesos.mcuJ16}%`}
                />
              </div>
            </div>

            <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 text-[10px] text-amber-800 dark:text-amber-300 leading-tight">
              Não possui reconstrução de curvatura: corta retas dentro de curvas fechadas e não
              recalibra dinamicamente o fator de escala de roda.
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* MOSTRADOR C */}
        {/* ================================================================= */}
        <div className="flex flex-col rounded-2xl bg-white dark:bg-slate-900/95 border-2 border-emerald-500/70 dark:border-emerald-500/60 p-3.5 shadow-md shadow-emerald-500/5 relative">
          <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            <span>Recomendado SIGO</span>
          </div>

          {/* Header do Mostrador C */}
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Mostrador C
              </span>
              <h5 className="text-xs font-black text-slate-900 dark:text-slate-100 mt-1">
                EKF 1D Canônico J16
              </h5>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Taylor 4ª Ordem e ZVU 6 Regras
              </p>
            </div>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-slate-800 text-emerald-500">
              <Cpu className="w-4 h-4" />
            </div>
          </div>

          {/* Display Digital Automotivo do Odômetro */}
          <div className="my-3 p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-center relative overflow-hidden shadow-inner">
            <div className="absolute top-1 left-2 text-[9px] font-mono tracking-widest text-emerald-500/80 uppercase">
              ODOMETER · KM (ALVO CANÔNICO)
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-emerald-400 pt-3 pb-1 select-all">
              {Math.floor(leituraC.odometroKm).toLocaleString("pt-BR")}
              <span className="text-lg text-emerald-300/80">
                ,{(leituraC.odometroKm % 1).toFixed(3).substring(2)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono px-1 pt-1 border-t border-slate-900 text-slate-400">
              <span>{leituraC.odometroMetros.toLocaleString("pt-BR")} m</span>
              <span
                className={
                  leituraC.deltaMetros > 0 ? "text-emerald-400 font-bold" : "text-slate-500"
                }
              >
                {leituraC.deltaMetros > 0 ? `+${leituraC.deltaMetros.toFixed(1)} m` : "0.0 m"}
              </span>
            </div>
          </div>

          {/* Status ZVU e Detalhes */}
          <div className="space-y-2 text-xs flex-1">
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Anti-KM Fantasma (ZVU)
              </span>
              <span
                className={`text-[11px] font-bold flex items-center gap-1 ${
                  leituraC.estadoZvu === "MOVIMENTO"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {leituraC.estadoZvu === "MOVIMENTO" ? (
                  <>
                    <Activity className="w-3 h-3" />
                    <span>Em Movimento</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    <span>6 Regras Físicas Ativas</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] px-1 text-slate-600 dark:text-slate-400">
              <span>Fator K (Pneu e Roda):</span>
              <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                {leituraC.fatorCalibracaoK.toFixed(8)}
              </strong>
            </div>

            {/* Barras de Pesos de Fusão */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                <span>Pesos de Fusão Sensorial</span>
                <span>
                  A:{leituraC.pesos.gnssOuArco}% · C:{leituraC.pesos.cinematico}% · M:
                  {leituraC.pesos.mcuJ16}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden">
                <div
                  style={{ width: `${leituraC.pesos.gnssOuArco}%` }}
                  className="bg-sky-500"
                  title={`Arco Gauss: ${leituraC.pesos.gnssOuArco}%`}
                />
                <div
                  style={{ width: `${leituraC.pesos.cinematico}%` }}
                  className="bg-amber-500"
                  title={`Cinemático: ${leituraC.pesos.cinematico}%`}
                />
                <div
                  style={{ width: `${leituraC.pesos.mcuJ16}%` }}
                  className="bg-emerald-500"
                  title={`MCU J16 (0x94): ${leituraC.pesos.mcuJ16}%`}
                />
              </div>
            </div>

            <div className="p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 text-[10px] text-emerald-800 dark:text-emerald-300 leading-tight">
              Fusão elipsoidal WGS-84, expansão de Taylor de 4ª ordem, compatível com estado
              persistido no banco Supabase e protocolo GT06 pacote 0x94.
            </div>
          </div>
        </div>
      </div>

      {/* PAINEL DE CONTROLE DE CENÁRIOS OPERACIONAIS */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <h5 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Simulador Interativo de Telemetria J16
            </h5>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Clique em um cenário para injetar pacotes e ver o comportamento
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {cenarios.map((cenario) => {
            const ativo = cenarioAtivoId === cenario.id;
            return (
              <button
                key={cenario.id}
                onClick={() => executarCenario(cenario)}
                className={`flex flex-col text-left p-2.5 rounded-xl border transition cursor-pointer ${
                  ativo
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-200 shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300"
                }`}
              >
                <span className="text-xs font-bold truncate">{cenario.nome}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {cenario.descricao}
                </span>
              </button>
            );
          })}
        </div>

        {/* Log de Disparos Recentes */}
        {historicoAcoes.length > 0 && (
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
              LOG DE TELEMETRIA EM TEMPO REAL
            </div>
            {historicoAcoes.map((linha, idx) => (
              <div key={idx} className="truncate text-slate-300">
                {linha}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TABELA COMPARATIVA DE CARACTERÍSTICAS TÉCNICAS */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="p-3">Característica / Critério</th>
              <th className="p-3">Proposta A (Bayesiana 1D)</th>
              <th className="p-3">Proposta B (Haversine Simples)</th>
              <th className="p-3 text-emerald-600 dark:text-emerald-400">
                Proposta C (EKF 1D SIGO)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px] text-slate-700 dark:text-slate-300">
            <tr>
              <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                Modelo Geodésico
              </td>
              <td className="p-3">WGS-84 Elipsoidal Gaussiano</td>
              <td className="p-3 text-amber-600 dark:text-amber-400">Esférico Simples (6371 km)</td>
              <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                WGS-84 Diferencial M(φ) e N(φ)
              </td>
            </tr>
            <tr>
              <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                Reconstrução de Curvatura
              </td>
              <td className="p-3">Arco circular trigonométrico (teto 18%)</td>
              <td className="p-3 text-red-500">Ausente (Corda linear)</td>
              <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                Taylor 4ª ordem + Arco (teto 22%)
              </td>
            </tr>
            <tr>
              <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                Anti-KM Fantasma (ZVU)
              </td>
              <td className="p-3">Histerese de 4 regras</td>
              <td className="p-3">3 paradas simples</td>
              <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                6 regras físicas estritas (ACC, Doppler, Glitch)
              </td>
            </tr>
            <tr>
              <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                Calibração com Painel Físico
              </td>
              <td className="p-3">EWMA com clamping [0.965, 1.035]</td>
              <td className="p-3 text-amber-600 dark:text-amber-400">
                Sobrescrita direta (K=1 fixo)
              </td>
              <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                EWMA adaptativo + Reconciliação histórica
              </td>
            </tr>
            <tr>
              <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                Persistência no Banco Supabase
              </td>
              <td className="p-3">In-memory / Standalone</td>
              <td className="p-3">In-memory</td>
              <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400">
                Interface EstadoPersistidoOdometro pronta
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
