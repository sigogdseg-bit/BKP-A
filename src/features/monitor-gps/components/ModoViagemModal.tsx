import { useState, useEffect, useRef } from "react";
import {
  X,
  Navigation,
  Play,
  Square,
  Clock,
  Gauge,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Award,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import { formatarMinutosParaHorasEMinutos } from "../services/timelineService";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { toast } from "sonner";

interface ModoViagemModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
}

export function ModoViagemModal({ veiculo, onFechar }: ModoViagemModalProps) {
  const [viagemAtiva, setViagemAtiva] = useState(false);
  const [segundosDecorridos, setSegundosDecorridos] = useState(0);
  const [kmInicial, setKmInicial] = useState(veiculo.odometro || 0);
  const [velocidadeMaxima, setVelocidadeMaxima] = useState(0);
  const [somaVelocidades, setSomaVelocidades] = useState(0);
  const [contagemLeituras, setContagemLeituras] = useState(0);
  const [resumoFinal, setResumoFinal] = useState<{
    duracaoSegundos: number;
    kmPercorrido: number;
    velocidadeMedia: number;
    velocidadeMaxima: number;
  } | null>(null);

  const timerRef = useRef<any>(null);

  // Iniciar Modo Viagem
  const iniciarViagem = () => {
    setKmInicial(veiculo.odometro || 0);
    setSegundosDecorridos(0);
    setVelocidadeMaxima(veiculo.velocidade || 0);
    setSomaVelocidades(veiculo.velocidade || 0);
    setContagemLeituras(1);
    setResumoFinal(null);
    setViagemAtiva(true);
    toast.success(`Modo Viagem iniciado para o veículo ${veiculo.placa}!`);
  };

  // Timer contínuo
  useEffect(() => {
    if (viagemAtiva) {
      timerRef.current = setInterval(() => {
        setSegundosDecorridos((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [viagemAtiva]);

  // Atualização em tempo real de velocidade e odômetro conforme o veículo transmite
  useEffect(() => {
    if (!viagemAtiva) return;

    const vel = veiculo.velocidade || 0;
    setVelocidadeMaxima((prev) => Math.max(prev, vel));
    setSomaVelocidades((s) => s + vel);
    setContagemLeituras((c) => c + 1);
  }, [veiculo.velocidade, veiculo.odometro, viagemAtiva]);

  const finalizarViagem = () => {
    const kmAtual = veiculo.odometro || kmInicial;
    const kmPercorrido = Math.max(0, kmAtual - kmInicial);
    const velMedia = contagemLeituras > 0 ? Math.round(somaVelocidades / contagemLeituras) : 0;

    setResumoFinal({
      duracaoSegundos: segundosDecorridos,
      kmPercorrido: Math.round(kmPercorrido),
      velocidadeMedia: velMedia,
      velocidadeMaxima,
    });

    setViagemAtiva(false);
    toast.success("Viagem concluída com sucesso! Resumo gerado.");
  };

  // Formata HH:MM:SS
  const formatarTempo = (totalSegundos: number) => {
    const h = Math.floor(totalSegundos / 3600);
    const m = Math.floor((totalSegundos % 3600) / 60);
    const s = totalSegundos % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(
      2,
      "0",
    )}`;
  };

  const kmParcial = Math.max(0, (veiculo.odometro || kmInicial) - kmInicial);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto">
        <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-md max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto overflow-y-auto shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl animate-in fade-in zoom-in-95 duration-150 pb-safe">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500">
                <Navigation className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Modo Viagem
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {veiculo.placa}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Acompanhamento em tempo real com métricas da viagem ativa
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-5 space-y-4">
            {!resumoFinal ? (
              <>
                {/* Cockpit da Viagem Ativa */}
                <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {viagemAtiva ? "Viagem em Andamento" : "Pronto para Iniciar"}
                  </span>

                  {/* Tempo da Viagem */}
                  <div className="text-3xl sm:text-4xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
                    {formatarTempo(segundosDecorridos)}
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>Velocidade Atual: {veiculo.velocidade || 0} km/h</span>
                  </div>
                </div>

                {/* Indicadores Dinâmicos */}
                <div className="grid grid-cols-2 gap-2.5 font-mono text-center">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">
                      Distância Parcial
                    </span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      {Math.round(kmParcial).toLocaleString("pt-BR")}{" "}
                      <span className="text-xs font-normal">km</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">
                      Velocidade Máxima
                    </span>
                    <span className="text-lg font-black text-amber-500">
                      {velocidadeMaxima} <span className="text-xs font-normal">km/h</span>
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                {!viagemAtiva ? (
                  <button
                    onClick={iniciarViagem}
                    className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 active:scale-98"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Iniciar Modo Viagem</span>
                  </button>
                ) : (
                  <button
                    onClick={finalizarViagem}
                    className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-wider bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20 transition flex items-center justify-center gap-2 active:scale-98"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    <span>Concluir e Gerar Resumo</span>
                  </button>
                )}
              </>
            ) : (
              /* Resumo Final da Viagem Concluída */
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center gap-3">
                  <Award className="h-7 w-7 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">Resumo da Viagem Concluída</div>
                    <div className="text-xs opacity-90">
                      Métricas consolidadas do percurso realizado
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 font-mono text-center">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">
                      Tempo Total
                    </span>
                    <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {formatarTempo(resumoFinal.duracaoSegundos)}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">
                      Distância
                    </span>
                    <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.round(resumoFinal.kmPercorrido).toLocaleString("pt-BR")} km
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">
                      Velocidade Média
                    </span>
                    <span className="text-base font-bold text-sky-600 dark:text-sky-400">
                      {resumoFinal.velocidadeMedia} km/h
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block font-sans uppercase">
                      Velocidade Máx
                    </span>
                    <span className="text-base font-bold text-amber-500">
                      {resumoFinal.velocidadeMaxima} km/h
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setResumoFinal(null)}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
                >
                  Nova Viagem
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
