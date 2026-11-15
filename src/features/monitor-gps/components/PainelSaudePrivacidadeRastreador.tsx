import { useState } from "react";
import {
  Radio,
  HeartPulse,
  BatteryCharging,
  Compass,
  Lock,
  RefreshCw,
  EyeOff,
  Signal,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import { testarComunicacaoRastreador } from "../services/gpsService";
import { SaudeRastreadorModal } from "./SaudeRastreadorModal";
import { APP_NOME } from "@/shared/lib/version";
import { toast } from "sonner";

interface PainelSaudePrivacidadeRastreadorProps {
  veiculo: VeiculoGps;
  statusComunicacao?: {
    ativo: boolean;
    rotulo: string;
    detalhe: string;
    minutos: number | null;
  };
}

export function PainelSaudePrivacidadeRastreador({
  veiculo,
  statusComunicacao,
}: PainelSaudePrivacidadeRastreadorProps) {
  const [testandoCom, setTestandoCom] = useState(false);
  const [ultimoPing, setUltimoPing] = useState<number | null>(null);
  const [modalSaudeAberto, setModalSaudeAberto] = useState(false);

  const handleTestarComunicacao = async () => {
    setTestandoCom(true);
    const toastId = toast.loading(`Disparando ping de teste para o rastreador ${veiculo.placa}...`);
    try {
      const res = await testarComunicacaoRastreador(veiculo.id);
      setUltimoPing(res.latenciaMs);
      if (res.ativo) {
        toast.success(res.mensagem, { id: toastId, duration: 4000 });
      } else {
        toast.warning(res.mensagem, { id: toastId, duration: 5000 });
      }
    } catch {
      toast.dismiss(toastId);
      toast.error("Falha ao comunicar com o rastreador.");
    } finally {
      setTestandoCom(false);
    }
  };

  const bateriaRastreador =
    veiculo.bateria_rastreador_pct !== undefined && veiculo.bateria_rastreador_pct !== null
      ? Number(veiculo.bateria_rastreador_pct)
      : null;

  const satelites =
    veiculo.satelites !== undefined && veiculo.satelites !== null && Number(veiculo.satelites) > 0
      ? Number(veiculo.satelites)
      : null;

  return (
    <div
      data-testid="painel-saude-privacidade"
      className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto w-full"
    >
      {/* Banner de Proteção de Privacidade Ativa */}
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <EyeOff className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {APP_NOME} — Modo de Privacidade Ativo
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Localização geográfica, rotas e métricas de velocidade estão sob sigilo. Exibindo
                estritamente a saúde do rastreador, latência e sinal.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold shrink-0">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Privacidade Ativa</span>
          </div>
        </div>
      </div>

      {/* Grid de Diagnóstico Operacional do Rastreador */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Status de Conectividade e Ping em Tempo Real */}
        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Signal className="h-4 w-4 text-orange-500" /> CONEXÃO E PING
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                statusComunicacao?.ativo
                  ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
              }`}
            >
              {statusComunicacao?.ativo ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          <div>
            <div className="text-2xl font-black font-mono text-slate-800 dark:text-slate-100">
              {ultimoPing !== null ? `${ultimoPing} ms` : "—"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {statusComunicacao?.detalhe || "Status de sinal avaliado em tempo real."}
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestarComunicacao}
            disabled={testandoCom}
            className="w-full py-2.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {testandoCom ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Testando Latência...</span>
              </>
            ) : (
              <>
                <Radio className="h-3.5 w-3.5" />
                <span>Testar Sinal e Latência</span>
              </>
            )}
          </button>
        </div>

        {/* Card 2: Carga da Bateria Interna do Rastreador */}
        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <BatteryCharging className="h-4 w-4 text-sky-500" /> BATERIA INTERNA
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
              HARDWARE
            </span>
          </div>

          <div>
            <div className="text-2xl font-black font-mono text-slate-800 dark:text-slate-100">
              {bateriaRastreador !== null ? `${bateriaRastreador}%` : "Sem leitura"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {bateriaRastreador !== null
                ? "Bateria de backup interna do dispositivo rastreador."
                : "Hardware não reportou nível de carga de backup."}
            </div>
          </div>

          {/* Barra de progresso de bateria estrita (Anti-Mock) */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
            {bateriaRastreador !== null ? (
              <div
                className={`h-full transition-all duration-500 ${
                  bateriaRastreador > 30 ? "bg-orange-500" : "bg-rose-500"
                }`}
                style={{ width: `${bateriaRastreador}%` }}
              />
            ) : (
              <div className="h-full bg-slate-300 dark:bg-slate-700 w-0" />
            )}
          </div>
        </div>

        {/* Card 3: Fix Orbital e Satélites GNSS */}
        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-orange-500" /> SINAL GNSS / GPS
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30">
              ORBITAL
            </span>
          </div>

          <div>
            <div className="text-2xl font-black font-mono text-slate-800 dark:text-slate-100">
              {satelites !== null ? `${satelites} satélites` : "Sem leitura"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {satelites !== null
                ? "Sincronização com constelação de satélites GPS/GLONASS."
                : "Aguardando fix de satélites ou dado não transmitido."}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalSaudeAberto(true)}
            className="w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-xs cursor-pointer"
          >
            <HeartPulse className="h-3.5 w-3.5 text-orange-500" />
            <span>Diagnóstico Completo</span>
          </button>
        </div>
      </div>

      {modalSaudeAberto && (
        <SaudeRastreadorModal veiculo={veiculo} onFechar={() => setModalSaudeAberto(false)} />
      )}
    </div>
  );
}
