import { useState, useEffect, useRef, useCallback } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  X,
  AlertTriangle,
  Lock,
  Radio,
  Gauge,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PowerOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VeiculoGps } from "../types";
import {
  testarComunicacaoRastreador,
  tocarSomBloqueio,
  type ResultadoTesteComunicacao,
} from "../services/gpsService";
import { useAuth } from "@/features/auth/context/AuthContext";

interface ModalBloqueioSeguroVeiculoProps {
  veiculo: {
    id: string;
    placa: string;
    marca_modelo?: string;
    velocidade?: number;
    [key: string]: any;
  };
  onConfirmarBloqueio: (veiculoId: string, bloquear: boolean) => Promise<boolean | void>;
  onFechar: () => void;
}

type FaseProtocolo =
  | "confirmacao_inicial"
  | "fase1_espera_parada" // 20 min aguardando 0 km/h
  | "fase2_limite_10kmh" // 10 min aguardando < 10 km/h
  | "fase3_limite_20kmh" // aguardando < 20 km/h
  | "testando_comunicacao"
  | "bloqueio_concluido"
  | "falha_comunicacao_abortado";

export function ModalBloqueioSeguroVeiculo({
  veiculo,
  onConfirmarBloqueio,
  onFechar,
}: ModalBloqueioSeguroVeiculoProps) {
  const { session } = useAuth();
  // Sigilo Operacional: Informações sobre tipo/tecnologia de bloqueio (Relé, CAN/LIN, etc.)
  // são visíveis exclusivamente para Administradores e Operadores. Clientes e Motoristas não veem.
  const podeVerTipoBloqueador = Boolean(
    session?.isSuperAdmin || session?.isAdmin || session?.isOperador,
  );

  const [fase, setFase] = useState<FaseProtocolo>("confirmacao_inicial");
  const [velocidadeRealtime, setVelocidadeRealtime] = useState<number>(
    Number(veiculo.velocidade || 0),
  );
  const [tempoRestanteSegundos, setTempoRestanteSegundos] = useState<number>(1200); // 20 min padrão
  const [totalTempoFase, setTotalTempoFase] = useState<number>(1200);
  const [executandoBloqueio, setExecutandoBloqueio] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<ResultadoTesteComunicacao | null>(null);
  const [mensagemDiagnostico, setMensagemDiagnostico] = useState<string>("");

  const intervalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canalRealtimeRef = useRef<any>(null);

  // Formatação de cronômetro MM:SS
  const formatarTempo = (segundos: number) => {
    const mins = Math.floor(segundos / 60);
    const segs = segundos % 60;
    return `${String(mins).padStart(2, "0")}:${String(segs).padStart(2, "0")}`;
  };

  // Disparo do teste de comunicação rigoroso e emissão do bloqueio
  const despacharBloqueioSeguro = useCallback(
    async (motivo: string) => {
      if (session?.isAuditor || session?.isSuperAdminAuditor || session?.isReadOnly) {
        setFase("falha_comunicacao_abortado");
        setMensagemDiagnostico(
          "Ação bloqueada: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Proibido realizar bloqueio de veículos.",
        );
        toast.error("Perfil S.adm Auditor não possui autorização para bloquear veículos.");
        return;
      }
      setFase("testando_comunicacao");
      setMensagemDiagnostico(
        "Realizando teste obrigatório de comunicação e velocidade com o rastreador...",
      );

      if (veiculo.bloqueador_instalado === false) {
        setFase("falha_comunicacao_abortado");
        setMensagemDiagnostico(
          "ALERTA: Veículo cadastrado sem bloqueador instalado. Operação de bloqueio indisponível por segurança.",
        );
        toast.error("Este veículo não possui bloqueador instalado.");
        return;
      }

      try {
        const teste = await testarComunicacaoRastreador(veiculo.id);
        setResultadoTeste(teste);

        // Regra Inegociável: Se não houver comunicação confirmada ou latência/dados inconsistentes, não bloqueia
        if (!teste.ativo) {
          setFase("falha_comunicacao_abortado");
          setMensagemDiagnostico(
            "ALERTA DE SEGURANÇA: Rastreador sem comunicação ativa recente. Em cumprimento à regra de segurança humana e viária, o bloqueio foi categoricamente suspenso.",
          );
          toast.error(
            "Bloqueio suspenso: Teste de comunicação com o rastreador falhou. Risco operacional evitado.",
          );
          return;
        }

        // Busca telemetria fresca diretamente do banco para confirmação redundante
        const { data: vAtualizado } = await supabase
          .from("veiculos")
          .select("velocidade_atual, ultima_atualizacao, ignicao_status")
          .eq("id", veiculo.id)
          .maybeSingle();

        const velConfirmada = vAtualizado ? Number(vAtualizado.velocidade_atual || 0) : 999;

        // Valida se atende ao patamar da fase correspondente
        let velocidadePermitida = false;
        if (fase === "fase1_espera_parada" && velConfirmada === 0) {
          velocidadePermitida = true;
        } else if (fase === "fase2_limite_10kmh" && velConfirmada < 10) {
          velocidadePermitida = true;
        } else if (fase === "fase3_limite_20kmh" && velConfirmada < 20) {
          velocidadePermitida = true;
        } else if (velConfirmada === 0) {
          velocidadePermitida = true;
        }

        if (!velocidadePermitida) {
          setMensagemDiagnostico(
            `Velocidade aferida (${velConfirmada} km/h) acima do limite seguro. O protocolo retomará a vigilância.`,
          );
          // Volta para a fase de monitoramento correspondente
          setTimeout(() => {
            if (fase === "fase3_limite_20kmh") setFase("fase3_limite_20kmh");
            else if (fase === "fase2_limite_10kmh") setFase("fase2_limite_10kmh");
            else setFase("fase1_espera_parada");
          }, 2000);
          return;
        }

        // Executa o bloqueio
        setExecutandoBloqueio(true);
        tocarSomBloqueio();
        await onConfirmarBloqueio(veiculo.id, true);

        // Registra em auditoria forense detalhada
        await supabase.from("system_activity_logs").insert({
          acao: "BLOQUEIO_SEGURO_AUTOMATICO_HUNTER",
          detalhe: `Bloqueio seguro validado e executado para o veículo ${veiculo.placa}. Motivo: ${motivo}. Velocidade: ${velConfirmada} km/h. Latência teste: ${teste.latenciaMs}ms.`,
        });

        setFase("bloqueio_concluido");
        toast.success(
          `Veículo ${veiculo.placa} bloqueado com sucesso! Protocolo de segurança concluído.`,
        );

        setTimeout(() => {
          onFechar();
        }, 4000);
      } catch (err: any) {
        setFase("falha_comunicacao_abortado");
        setMensagemDiagnostico("Erro inesperado durante o teste do rastreador: " + err?.message);
      } finally {
        setExecutandoBloqueio(false);
      }
    },
    [veiculo.id, veiculo.placa, veiculo.bloqueador_instalado, fase, onConfirmarBloqueio, onFechar],
  );

  // Inscrição Realtime para escutar a telemetria do veículo em tempo real
  useEffect(() => {
    if (fase === "confirmacao_inicial" || fase === "bloqueio_concluido") return;

    const canal = supabase
      .channel(`hunter_bloqueio_veiculo_${veiculo.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "veiculos",
          filter: `id=eq.${veiculo.id}`,
        },
        (payload) => {
          const novo = payload.new as any;
          if (novo && novo.velocidade_atual !== undefined) {
            const vel = Number(novo.velocidade_atual || 0);
            setVelocidadeRealtime(vel);

            // Condição 1: Na Fase 1, se atingir 0 km/h (veículo parou)
            if (fase === "fase1_espera_parada" && vel === 0) {
              despacharBloqueioSeguro("Veículo parou completamente (0 km/h) na Fase 1");
            }
            // Condição 2: Na Fase 2, se atingir < 10 km/h
            else if (fase === "fase2_limite_10kmh" && vel < 10) {
              despacharBloqueioSeguro(`Veículo atingiu ${vel} km/h (< 10 km/h) na Fase 2`);
            }
            // Condição 3: Na Fase 3, se atingir < 20 km/h
            else if (fase === "fase3_limite_20kmh" && vel < 20) {
              despacharBloqueioSeguro(`Veículo atingiu ${vel} km/h (< 20 km/h) na Fase 3`);
            }
          }
        },
      )
      .subscribe();

    canalRealtimeRef.current = canal;

    return () => {
      if (canalRealtimeRef.current) {
        supabase.removeChannel(canalRealtimeRef.current);
      }
    };
  }, [veiculo.id, fase, despacharBloqueioSeguro]);

  // Temporizador regressivo para as Fases do Protocolo
  useEffect(() => {
    if (
      fase === "confirmacao_inicial" ||
      fase === "bloqueio_concluido" ||
      fase === "testando_comunicacao" ||
      fase === "falha_comunicacao_abortado"
    ) {
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      return;
    }

    intervalTimerRef.current = setInterval(() => {
      setTempoRestanteSegundos((prev) => {
        if (prev <= 1) {
          // Transição de Fase quando o cronômetro expira
          if (fase === "fase1_espera_parada") {
            // Se após 20 minutos não parar, avisa e passa para < 10 km/h com novo cronômetro de 10 min
            setFase("fase2_limite_10kmh");
            setTotalTempoFase(600); // 10 min
            toast.warning(
              "20 minutos decorridos sem parada total. O protocolo agora acionará o bloqueio assim que o veículo atingir velocidade inferior a 10 km/h.",
              { duration: 8000 },
            );
            return 600;
          } else if (fase === "fase2_limite_10kmh") {
            // Se após 10 minutos adicionais não atingir < 10 km/h, passa para < 20 km/h
            setFase("fase3_limite_20kmh");
            setTotalTempoFase(0);
            toast.warning(
              "10 minutos adicionais decorridos. O patamar de segurança foi escalonado para velocidade inferior a 20 km/h.",
              { duration: 8000 },
            );
            return 0;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    };
  }, [fase]);

  // Se já estiver em 0 km/h logo que entra na Fase 1, dispara a verificação
  const iniciarProtocolo = () => {
    setTempoRestanteSegundos(1200); // 20 min
    setTotalTempoFase(1200);
    setFase("fase1_espera_parada");

    // Se o veículo já estiver totalmente parado (0 km/h), inicia teste imediato
    if (velocidadeRealtime === 0) {
      despacharBloqueioSeguro("Veículo já se encontra parado (0 km/h)");
    }
  };

  const abortarProtocolo = () => {
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    if (canalRealtimeRef.current) supabase.removeChannel(canalRealtimeRef.current);
    toast.info("Protocolo de bloqueio seguro abortado pelo operador.");
    onFechar();
  };

  // Percentual de progresso do cronômetro
  const pctProgresso =
    totalTempoFase > 0 ? ((totalTempoFase - tempoRestanteSegundos) / totalTempoFase) * 100 : 100;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="relative w-full max-w-lg max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-[0_25px_60px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Barra superior de alerta */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 shrink-0" />

          {/* Cabeçalho Fixo */}
          <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 sm:p-3 rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 truncate">
                    Protocolo de Bloqueio Seguro
                  </h3>
                  {podeVerTipoBloqueador &&
                    (veiculo.bloqueador_instalado === false ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/30 shrink-0">
                        SEM BLOQUEADOR
                      </span>
                    ) : veiculo.tipo_bloqueador === "outro" ? (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0"
                        title={veiculo.bloqueador_detalhes || "Personalizado"}
                      >
                        {veiculo.bloqueador_detalhes
                          ? `OUTRO: ${veiculo.bloqueador_detalhes}`
                          : "OUTRO"}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                        RELÉ J16
                      </span>
                    ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                  Veículo:{" "}
                  <strong className="text-slate-800 dark:text-slate-200">{veiculo.placa}</strong> ·{" "}
                  {veiculo.marca_modelo}
                </p>
              </div>
            </div>
            <button
              onClick={abortarProtocolo}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
              title="Cancelar e fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Corpo com rolagem interna protegendo telas pequenas */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* ========================================================================= */}
            {/* ESTADO 1: CONFIRMAÇÃO INICIAL COM AVISO SOLENE DE SEGURANÇA */}
            {/* ========================================================================= */}
            {fase === "confirmacao_inicial" && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs sm:text-sm leading-relaxed space-y-2">
                  <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Norma Pétrea de Segurança Humana e Viária:</span>
                  </div>
                  <p>
                    Considerando o alto risco à vida ao bloquear um veículo em movimento, este
                    comando segue uma regra de cautela estrita e irrevogável:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs opacity-95">
                    <li>
                      O veículo <strong>NÃO</strong> é cortado imediatamente em alta velocidade.
                    </li>
                    <li>
                      Ao confirmar, abrirá um contador de <strong>20 minutos</strong> aguardando a
                      parada total do veículo (0 km/h).
                    </li>
                    <li>
                      Assim que parar, o sistema{" "}
                      <strong>testa a comunicação com o rastreador</strong> para confirmar
                      velocidade real antes de emitir o bloqueio.
                    </li>
                    <li>
                      Caso não pare em 20 min, o patamar escalona para <strong>&lt; 10 km/h</strong>{" "}
                      (10 min adicionais) e, subsequentemente, para <strong>&lt; 20 km/h</strong>.
                    </li>
                    <li>
                      Em caso de dúvida ou falha de telemetria, o bloqueio <strong>NÃO</strong> é
                      realizado.
                    </li>
                  </ul>
                </div>

                {/* Painel com velocidade e telemetria atual */}
                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-800 shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] dark:shadow-none">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                      Velocidade Atual Detectada
                    </span>
                    <span className="font-mono font-black text-lg sm:text-xl text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-teal-500" />
                      {velocidadeRealtime} km/h
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                      Condição Inicial de Corte
                    </span>
                    <span className="font-mono font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-1">
                      <Lock className="w-3.5 h-3.5" />
                      Parada Total (0 km/h)
                    </span>
                  </div>
                </div>

                {veiculo.bloqueador_instalado === false ? (
                  <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <span className="font-bold block">Veículo sem Bloqueador Instalado</span>
                      <span>
                        Este veículo foi cadastrado pelo instalador sem bloqueador de corte por
                        incompatibilidade com o tipo de veículo (veículo elétrico, híbrido, moto ou
                        particularidade do chicote elétrico). O comando de bloqueio remoto está
                        desabilitado por segurança viária.
                      </span>
                    </div>
                  </div>
                ) : podeVerTipoBloqueador ? (
                  <div className="p-3 rounded-xl bg-[#eaf0f8] dark:bg-slate-800/40 border border-slate-300/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-xs flex items-center justify-between">
                    <span className="font-medium text-slate-500 dark:text-slate-400">
                      Dispositivo Instalado:
                    </span>
                    <span className="font-bold font-mono">
                      {veiculo.tipo_bloqueador === "outro"
                        ? `Personalizado (${veiculo.bloqueador_detalhes || "Especificado"})`
                        : "Relé com Corte de Combustível"}
                    </span>
                  </div>
                ) : null}

                {/* Botões de Ação */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-300/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={abortarProtocolo}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={iniciarProtocolo}
                    disabled={veiculo.bloqueador_instalado === false}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition shadow-lg flex items-center gap-2 ${
                      veiculo.bloqueador_instalado === false
                        ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-50 shadow-none"
                        : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30 cursor-pointer active:scale-95"
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>Confirmar e Iniciar Protocolo</span>
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ESTADO 2: PROTOCOLO ATIVO (FASES 1, 2 OU 3 COM CRONÔMETRO REGRESSIVO) */}
            {/* ========================================================================= */}
            {(fase === "fase1_espera_parada" ||
              fase === "fase2_limite_10kmh" ||
              fase === "fase3_limite_20kmh") && (
              <div className="mt-5 space-y-4">
                {/* Banner de Fase Ativa */}
                <div
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
                    fase === "fase1_espera_parada"
                      ? "bg-teal-50 dark:bg-teal-950/20 border-teal-300 dark:border-teal-800 text-teal-900 dark:text-teal-200"
                      : fase === "fase2_limite_10kmh"
                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                        : "bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                  }`}
                >
                  <div>
                    <span className="font-black uppercase tracking-wider block text-[11px]">
                      {fase === "fase1_espera_parada" && "Fase 1: Aguardando Parada Total"}
                      {fase === "fase2_limite_10kmh" && "Fase 2: Escalonado para Menos de 10 km/h"}
                      {fase === "fase3_limite_20kmh" && "Fase 3: Escalonado para Menos de 20 km/h"}
                    </span>
                    <span className="text-xs opacity-90">
                      {fase === "fase1_espera_parada" &&
                        "O relé será acionado assim que o veículo parar (0 km/h)."}
                      {fase === "fase2_limite_10kmh" &&
                        "O relé será acionado assim que o veículo atingir velocidade < 10 km/h."}
                      {fase === "fase3_limite_20kmh" &&
                        "O relé será acionado assim que o veículo atingir velocidade < 20 km/h."}
                    </span>
                  </div>

                  <div className="px-2.5 py-1 rounded-xl bg-white/80 dark:bg-slate-900/80 font-mono font-black text-xs">
                    Alvo:{" "}
                    {fase === "fase1_espera_parada"
                      ? "0 km/h"
                      : fase === "fase2_limite_10kmh"
                        ? "< 10 km/h"
                        : "< 20 km/h"}
                  </div>
                </div>

                {/* Painel do Cronômetro Regressivo e Velocidade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Card Cronômetro */}
                  <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center text-center space-y-1 relative overflow-hidden shadow-inner">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                      <span>Janela de Segurança</span>
                    </div>
                    <div className="font-mono font-black text-3xl sm:text-4xl text-amber-400 tracking-tight">
                      {formatarTempo(tempoRestanteSegundos)}
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-amber-400 transition-all duration-1000"
                        style={{ width: `${pctProgresso}%` }}
                      />
                    </div>
                  </div>

                  {/* Card Velocímetro Realtime */}
                  <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-center space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                      <Gauge className="w-3.5 h-3.5 text-teal-500" />
                      <span>Velocidade em Tempo Real</span>
                    </div>
                    <div className="font-mono font-black text-3xl sm:text-4xl text-slate-900 dark:text-slate-100">
                      {velocidadeRealtime}{" "}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        km/h
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>Telemetria Realtime SIGO Guardião</span>
                    </div>
                  </div>
                </div>

                {/* Teste manual sob demanda para o operador */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <Radio className="w-4 h-4 text-teal-500" />
                    <span>Checagem contínua de link ativo com o rastreador</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      despacharBloqueioSeguro(
                        "Operador solicitou checagem e bloqueio imediato se atender aos parâmetros",
                      )
                    }
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 border border-teal-500/30 transition flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Testar Agora</span>
                  </button>
                </div>

                {/* Botão de Abortar */}
                <div className="pt-2 flex justify-between items-center border-t border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400">
                    Você pode abortar o protocolo a qualquer momento.
                  </span>
                  <button
                    type="button"
                    onClick={abortarProtocolo}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                    <span>Abortar Solicitação</span>
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ESTADO 3: TESTANDO COMUNICAÇÃO COM O RASTREADOR */}
            {/* ========================================================================= */}
            {fase === "testando_comunicacao" && (
              <div className="py-8 text-center space-y-4">
                <div className="relative inline-flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-teal-500/10 border-2 border-teal-500/30 flex items-center justify-center text-teal-500">
                    <Radio className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Testando Comunicação com o Rastreador
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    {mensagemDiagnostico ||
                      "Verificando integridade do sinal, latência de dados e confirmando velocidade de parada antes de emitir o comando de corte..."}
                  </p>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ESTADO 4: BLOQUEIO CONCLUÍDO COM SUCESSO */}
            {/* ========================================================================= */}
            {fase === "bloqueio_concluido" && (
              <div className="py-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center text-emerald-500 mx-auto">
                  <CheckCircle2 className="w-9 h-9" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    Veículo Bloqueado com Sucesso!
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                    O veículo <strong>{veiculo.placa}</strong> atingiu as condições estritas de
                    segurança, teve sua comunicação testada com sucesso e o relé J16 foi acionado.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onFechar}
                  className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-md"
                >
                  Concluir
                </button>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ESTADO 5: FALHA DE COMUNICAÇÃO - BLOQUEIO SUSPENSO / ABORTADO */}
            {/* ========================================================================= */}
            {fase === "falha_comunicacao_abortado" && (
              <div className="py-5 space-y-4">
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-800/80 text-rose-900 dark:text-rose-200 text-xs sm:text-sm space-y-2">
                  <div className="flex items-center gap-2 font-black text-rose-700 dark:text-rose-400">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>COMANDO DE BLOQUEIO RECUSADO POR SEGURANÇA</span>
                  </div>
                  <p className="leading-relaxed">
                    {mensagemDiagnostico ||
                      "O rastreador não respondeu com sinal recente suficiente ou há dúvida na aferição da velocidade real. Para proteger a vida dos ocupantes da via, o SIGO Guardião não emite corte elétrico sob dúvida."}
                  </p>
                  {resultadoTeste && (
                    <div className="text-[11px] font-mono bg-white/70 dark:bg-slate-900/80 p-2 rounded-lg border border-rose-300/40">
                      Diagnóstico: {resultadoTeste.mensagem}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={abortarProtocolo}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => setFase("fase1_espera_parada")}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
