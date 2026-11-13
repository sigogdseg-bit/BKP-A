import { useState, useMemo } from "react";
import {
  X,
  Copy,
  Check,
  Terminal,
  Cpu,
  SlidersHorizontal,
  FileCode,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { type ParametrosPadraoComparativo } from "../lib/comparativoPadroesConstantes";
import {
  gerarScriptComandosDispositivoJ16,
  formatarComandosParaCopia,
} from "../lib/comandosDispositivoHelper";

interface ModalScriptComandosDispositivoProps {
  aberto: boolean;
  onFechar: () => void;
  padrao: ParametrosPadraoComparativo;
  onAplicarParametrosCanonicos?: (params: ParametrosPadraoComparativo) => void;
}

export function ModalScriptComandosDispositivo({
  aberto,
  onFechar,
  padrao,
  onAplicarParametrosCanonicos,
}: ModalScriptComandosDispositivoProps) {
  const [copiadoGeral, setCopiadoGeral] = useState(false);
  const [copiadoSms, setCopiadoSms] = useState(false);
  const [comandoCopiadoIdx, setComandoCopiadoIdx] = useState<number | null>(null);

  const comandos = useMemo(() => {
    return gerarScriptComandosDispositivoJ16(padrao);
  }, [padrao]);

  if (!aberto) return null;

  const handleCopiarLinhas = async () => {
    const texto = formatarComandosParaCopia(comandos, "linhas");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoGeral(true);
      toast.success(
        `${comandos.length} comandos copiados para a área de transferência (1 por linha)!`,
      );
      setTimeout(() => setCopiadoGeral(false), 2500);
    } catch {
      toast.error("Erro ao copiar comandos para a área de transferência.");
    }
  };

  const handleCopiarSms = async () => {
    const texto = formatarComandosParaCopia(comandos, "sms_concatenado");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoSms(true);
      toast.success("Comandos copiados em formato SMS concatenado (;)");
      setTimeout(() => setCopiadoSms(false), 2500);
    } catch {
      toast.error("Erro ao copiar comandos concatenados.");
    }
  };

  const handleCopiarIndividual = async (cmd: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setComandoCopiadoIdx(idx);
      toast.success(`Comando copiado: ${cmd}`);
      setTimeout(() => setComandoCopiadoIdx(null), 2000);
    } catch {
      toast.error("Erro ao copiar comando.");
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto select-none">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] my-auto flex flex-col overflow-hidden shadow-[6px_6px_16px_#c3cfe2] dark:shadow-2xl">
          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between bg-[#eaf0f8]/95 dark:bg-slate-950/60 shrink-0">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                <Terminal className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Comandos de Hardware para Dispositivos J16 / GT06
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  Origem: {padrao.nome} · Sequência pronta para terminal serial, SMS e bancada
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Fechar janela"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Resumo Rápido dos Parâmetros Configurados */}
          <div className="px-5 py-3 bg-cyan-500/5 dark:bg-cyan-950/20 border-b border-cyan-500/10 flex items-center gap-2 flex-wrap text-xs font-mono shrink-0">
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
              Timer: {padrao.timerMovimento}s / {padrao.timerParado}s
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
              Ângulo:{" "}
              {padrao.anguloHabilitado
                ? `${padrao.anguloGrau}° (${padrao.anguloIntervalo}s)`
                : "OFF"}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
              Heartbeat: {padrao.hbtLigado}s / {padrao.hbtDesligado}s
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
              Economia: {padrao.modoEconomiaParada ? "SENDS=1" : "SENDS=0"}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold">
              G-Sensor: Nível {padrao.sensibilidadeGSensor}
            </span>
          </div>

          {/* Corpo com Rolagem Interna */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3 grow">
            <div className="space-y-2">
              {comandos.map((c, idx) => (
                <div
                  key={c.cmd}
                  className="p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3 shadow-xs hover:border-cyan-500/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-sm text-cyan-600 dark:text-cyan-400 select-all">
                          {c.cmd}
                        </span>
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                          {c.nome}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {c.descricao}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopiarIndividual(c.cmd, idx)}
                    className="p-2 rounded-xl text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer shrink-0"
                    title="Copiar comando individual"
                  >
                    {comandoCopiadoIdx === idx ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Aviso Técnico de Aplicação Física */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-black">
                  Instruções de Aplicação no Dispositivo:
                </strong>
                Envie os comandos em ordem sequencial através do Terminal USB (Bancada), SMS
                corporativo ou console de telemetria. O comando final RESET reinicia a MCU e grava
                os novos parâmetros na memória não volátil flash do rastreador.
              </div>
            </div>
          </div>

          {/* Rodapé com Botões de Ação */}
          <div className="p-4 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/95 dark:bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {onAplicarParametrosCanonicos && (
                <button
                  type="button"
                  onClick={() => {
                    onAplicarParametrosCanonicos(padrao);
                    onFechar();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Usar nos Parâmetros Canônicos</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleCopiarSms}
                className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-200/50 dark:hover:bg-slate-800 text-xs font-bold font-mono text-slate-700 dark:text-slate-300 transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                title="Copiar comandos concatenados por ponto e vírgula"
              >
                {copiadoSms ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <FileCode className="h-4 w-4" />
                )}
                <span>Copiar SMS (;)</span>
              </button>

              <button
                type="button"
                onClick={handleCopiarLinhas}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-black uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                {copiadoGeral ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span>Copiar Todos os Comandos</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
