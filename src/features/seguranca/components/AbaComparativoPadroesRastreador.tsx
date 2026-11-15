import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Scale,
  SlidersHorizontal,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  Zap,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  Play,
  Pause,
  Layers,
  Clock,
  Compass,
  FileText,
  Save,
  Check,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  FastForward,
  Gauge,
  Wifi,
  Radio,
  Sliders,
  Car,
  Bike,
  AlertOctagon,
  FlaskConical,
  Square,
  Loader2,
  Medal,
  Target,
  Copy,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  VALORES_PADRAO_CANONICO_J16,
  obterConfigPadraoSistemaJ16,
  STORAGE_KEY_CONFIG_PADRAO_SISTEMA,
} from "../lib/rastreadorJ16Constantes";

import {
  type ParametrosPadraoComparativo,
  type PerfilUsoOperacional,
  TETO_FRANQUIA_M2M_MB,
  TETO_SEGURO_ENGENHARIA_MB,
  CONSUMO_BASAL_FIXO_OPERADORA_MB,
  PRESETS_COMPARATIVOS,
  calcularDiagnosticoTelecomRepouso,
  type DiagnosticoTelecomRepouso,
} from "../lib/comparativoPadroesConstantes";
import {
  type ResultadoAutoOtimizador,
  type PontoTrajetoFisico,
  diferencaAngular,
  gerarCicloViarioHolistico,
  calcularMetricasFisicasJ16,
  executarRefinamentoFinoJ16,
} from "../lib/autoOtimizadorJ16Engine";
import { ModalScriptComandosDispositivo } from "./ModalScriptComandosDispositivo";
import {
  gerarScriptComandosDispositivoJ16,
  copiarComandosDispositivo,
} from "../lib/comandosDispositivoHelper";

export type {
  ParametrosPadraoComparativo,
  PerfilUsoOperacional,
  ResultadoAutoOtimizador,
  PontoTrajetoFisico,
};

export interface AbaComparativoPadroesRastreadorProps {
  onAplicarParametrosCanonicos?: (params: ParametrosPadraoComparativo) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL: ABA COMPARATIVO DE PADRÕES (A vs B)
// ─────────────────────────────────────────────────────────────────────────────

export function AbaComparativoPadroesRastreador({
  onAplicarParametrosCanonicos,
}: AbaComparativoPadroesRastreadorProps = {}) {
  // Carrega parâmetros oficiais do padrão atual homologado do sistema
  const configOficial = useMemo<ParametrosPadraoComparativo>(() => {
    const salva = obterConfigPadraoSistemaJ16();
    return {
      nome: "Padrão Oficial do Sistema (Baseline)",
      timerMovimento: Math.min(300, Math.max(5, Number(salva.valores.timerMovimento) || 30)),
      timerParado: Math.min(3600, Math.max(60, Number(salva.valores.timerParado) || 3600)),
      anguloHabilitado: salva.checkboxes.anguloHabilitar ?? true,
      anguloGrau: Math.min(90, Math.max(5, Number(salva.valores.anguloGrau) || 20)),
      anguloIntervalo: Math.min(60, Math.max(10, Number(salva.valores.anguloIntervalo) || 10)),
      hbtLigado: Math.min(300, Math.max(30, Number(salva.valores.hbtLigado) || 300)),
      hbtDesligado: Math.min(600, Math.max(60, Number(salva.valores.hbtDesligado) || 300)),
      modoEconomiaParada: salva.checkboxes.economiaParada ?? true,
      sensibilidadeGSensor: 3,
      pacoteEstendidoIexvol: salva.checkboxes.voltagemOdometroIexvol ?? true,
    };
  }, []);

  // Estado dos dois padrões comparados
  const [padraoA, setPadraoA] = useState<ParametrosPadraoComparativo>(configOficial);
  const [padraoB, setPadraoB] = useState<ParametrosPadraoComparativo>({
    ...configOficial,
    nome: "Padrão Candidato (Customizado)",
    timerMovimento: 10,
    anguloGrau: 10,
    anguloIntervalo: 10,
    hbtLigado: 300,
    hbtDesligado: 300,
    timerParado: 3600,
  });

  // Estados para o Modal de Comandos de Hardware para Dispositivos
  const [modalComandosAberto, setModalComandosAberto] = useState(false);
  const [padraoParaComandos, setPadraoParaComandos] =
    useState<ParametrosPadraoComparativo>(padraoB);

  // Cópia rápida direta de comandos para implementar no dispositivo
  const handleCopiarComandosRapido = useCallback(async (params: ParametrosPadraoComparativo) => {
    const comandos = gerarScriptComandosDispositivoJ16(params);
    const res = await copiarComandosDispositivo(comandos, "linhas");
    if (res.sucesso) {
      toast.success(
        `${res.total} comandos de hardware para o dispositivo copiados para a área de transferência!`,
      );
    } else {
      toast.error("Erro ao copiar comandos para a área de transferência.");
    }
  }, []);

  const handleAbrirModalComandos = useCallback((params: ParametrosPadraoComparativo) => {
    setPadraoParaComandos(params);
    setModalComandosAberto(true);
  }, []);

  const handleUsarNosParametrosCanonicos = useCallback(
    (params: ParametrosPadraoComparativo) => {
      if (onAplicarParametrosCanonicos) {
        onAplicarParametrosCanonicos(params);
      } else {
        toast.info(
          `Parâmetros do "${params.nome}" prontos para aplicação nos parâmetros canônicos.`,
        );
      }
    },
    [onAplicarParametrosCanonicos],
  );

  // Perfil de uso operacional da frota para projeção mensal real
  const [perfilUso, setPerfilUso] = useState<PerfilUsoOperacional>({
    horasMovimentoPorDia: 4,
    diasPorMes: 30,
    cenarioTrajeto: "urbano",
    tipoVeiculo: "carro",
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ESTADO DO AUTO-OTIMIZADOR DE COMBINAÇÕES DE PARÂMETROS
  // ───────────────────────────────────────────────────────────────────────────
  const [autoOtimizadorAtivo, setAutoOtimizadorAtivo] = useState(false);
  const [autoOtimizadorProgresso, setAutoOtimizadorProgresso] = useState(0);
  const [autoOtimizadorTotal, setAutoOtimizadorTotal] = useState(0);
  const [autoOtimizadorDescartadas, setAutoOtimizadorDescartadas] = useState(0);
  const [autoOtimizadorValidas, setAutoOtimizadorValidas] = useState(0);
  const [autoOtimizadorModo, setAutoOtimizadorModo] = useState<"completa" | "refinamento">(
    "completa",
  );
  const [autoOtimizadorResultados, setAutoOtimizadorResultados] = useState<
    ResultadoAutoOtimizador[]
  >([]);
  const [autoOtimizadorMelhor, setAutoOtimizadorMelhor] = useState<ResultadoAutoOtimizador | null>(
    null,
  );
  const autoOtimizadorCancelRef = useRef(false);
  const [autoOtimizadorHorasDia, setAutoOtimizadorHorasDia] = useState(8);

  // Disparo automático do teste de pista nos 2 veículos (Passo 3) após conclusão da auto-otimização
  const [iniciarDueloAutomatico, setIniciarDueloAutomatico] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // MOTOR DO AUTO-OTIMIZADOR: VARREDURA UNIVERSAL DE TODOS OS 10 PARÂMETROS
  // COM DESCARTE COMPULSÓRIO DE ABERRAÇÕES E ERROS JÁ CONHECIDOS
  // ───────────────────────────────────────────────────────────────────────────
  const executarAutoOtimizador = useCallback(async () => {
    autoOtimizadorCancelRef.current = false;
    setAutoOtimizadorAtivo(true);
    setAutoOtimizadorResultados([]);
    setAutoOtimizadorMelhor(null);
    setAutoOtimizadorDescartadas(0);
    setAutoOtimizadorValidas(0);

    // Perfil de uso para o teste: horas/dia configurável pelo operador
    const perfilTeste: PerfilUsoOperacional = {
      horasMovimentoPorDia: autoOtimizadorHorasDia,
      diasPorMes: 30,
      cenarioTrajeto: perfilUso.cenarioTrajeto,
      tipoVeiculo: perfilUso.tipoVeiculo,
    };

    // Valores discretos de varredura para TODOS os 10 parâmetros
    let timersMov: number[] = [];
    let angulosHabs: boolean[] = [];
    let angulosGraus: number[] = [];
    let filtrosCurva: number[] = [];
    let hbtsLigados: number[] = [];
    let hbtsDesligados: number[] = [];
    let timersParados: number[] = [];
    let modosGaragem: boolean[] = [];
    let sensores: number[] = [];
    let pacotesEstendidos: boolean[] = [];

    if (autoOtimizadorModo === "completa") {
      // VARREDURA UNIVERSAL DE TODAS AS PROBABILIDADES (INCREMENTO DE 1 EM 1):
      timersMov = [];
      for (let t = 10; t <= 30; t++) timersMov.push(t); // 21 valores (10s a 30s)
      angulosHabs = [true, false];
      angulosGraus = [];
      for (let a = 8; a <= 25; a++) angulosGraus.push(a); // 18 valores (8° a 25°)
      filtrosCurva = [];
      for (let f = 10; f <= 20; f++) filtrosCurva.push(f); // 11 valores (10s a 20s - mínimo 10s do firmware J16)
      hbtsLigados = [60, 90, 120, 150, 180, 210, 240, 270, 300];
      hbtsDesligados = [120, 180, 240, 300, 360, 420, 480, 540, 600];
      timersParados = [300, 600, 900, 1200, 1800, 2400, 3000, 3600]; // Teto máximo de 3600s (1h) do comando TIMER homologado Voxter
      modosGaragem = [true, false];
      sensores = [1, 2, 3, 4, 5];
      pacotesEstendidos = [true, false];
    } else {
      // REFINAMENTO FINO EM TORNO DO PADRÃO B ATUAL (PASSOS CANÔNICOS INTEIROS):
      const gerarFaixa = (base: number, min: number, max: number, step: number, stepsRange = 5) => {
        const valores: number[] = [];
        for (let i = -stepsRange; i <= stepsRange; i++) {
          const v = base + i * step;
          if (v >= min && v <= max) valores.push(v);
        }
        if (!valores.includes(base) && base >= min && base <= max) valores.push(base);
        return [...new Set(valores)].sort((a, b) => a - b);
      };

      timersMov = gerarFaixa(padraoB.timerMovimento, 5, 60, 1, 5);
      angulosHabs = [padraoB.anguloHabilitado];
      angulosGraus = gerarFaixa(padraoB.anguloGrau, 5, 35, 1, 5);
      filtrosCurva = gerarFaixa(padraoB.anguloIntervalo, 10, 30, 1, 5);
      hbtsLigados = gerarFaixa(padraoB.hbtLigado, 30, 300, 30, 2);
      hbtsDesligados = gerarFaixa(padraoB.hbtDesligado, 60, 600, 60, 2);
      timersParados = gerarFaixa(padraoB.timerParado, 60, 3600, 120, 2);
      modosGaragem = [padraoB.modoEconomiaParada];
      sensores = gerarFaixa(padraoB.sensibilidadeGSensor, 1, 5, 1, 2);
      pacotesEstendidos = [padraoB.pacoteEstendidoIexvol];
    }

    // Contagem precisa de todas as combinações do espaço cartesiano
    const combinacoesAngulares = angulosHabs.reduce((acc, hab) => {
      return acc + (hab ? angulosGraus.length * filtrosCurva.length : 1);
    }, 0);

    const totalCombinacoes =
      timersMov.length *
      combinacoesAngulares *
      hbtsLigados.length *
      hbtsDesligados.length *
      timersParados.length *
      modosGaragem.length *
      sensores.length *
      pacotesEstendidos.length;

    setAutoOtimizadorTotal(totalCombinacoes);

    toast.info(
      `Auto-Otimizador iniciado (${autoOtimizadorModo === "completa" ? "Varredura Universal dos 10 Parâmetros" : "Refinamento ±5"}): ${totalCombinacoes.toLocaleString()} combinações a testar. Perfil: ${autoOtimizadorHorasDia}h/dia.`,
    );

    const resultadosValidos: ResultadoAutoOtimizador[] = [];
    let processadas = 0;
    let descartadasCount = 0;
    let validasCount = 0;
    let ultimoUltimoPctReportado = 0;

    // Cálculo físico real utilizando o motor canônico J16
    const calcularInline = (p: ParametrosPadraoComparativo) =>
      calcularMetricasFisicasJ16(p, perfilTeste);

    // Processamento em lotes não-bloqueantes para manter 60 FPS na UI
    const BATCH_SIZE = 250000;
    let batch: ResultadoAutoOtimizador[] = [];

    for (const modoGaragem of modosGaragem) {
      for (const pacoteEstendido of pacotesEstendidos) {
        for (const sensor of sensores) {
          for (const timerParado of timersParados) {
            for (const hbtDesligado of hbtsDesligados) {
              for (const hbtLigado of hbtsLigados) {
                for (const anguloHab of angulosHabs) {
                  const angulosLista = anguloHab ? angulosGraus : [0];
                  const filtrosLista = anguloHab ? filtrosCurva : [0];

                  for (const angulo of angulosLista) {
                    for (const filtro of filtrosLista) {
                      for (const timerMov of timersMov) {
                        if (autoOtimizadorCancelRef.current) {
                          toast.warning("Auto-Otimizador cancelado pelo usuário.");
                          setAutoOtimizadorAtivo(false);
                          return;
                        }

                        processadas++;

                        // FILTRAGEM RIGOROSA DE ABERRAÇÕES E ERROS CONHECIDOS DO HARDWARE J16:
                        // 1. Falta de economia em repouso (SENDS=0 drena bateria e dados)
                        const semModoGaragem = !modoGaragem;
                        // 2. G-Sensor hiper-sensível (dispara falsos acordares de garagem)
                        const sensorInstavel = sensor <= 2;
                        // 3. Ausência de inflexão (corta esquinas e quarteirões)
                        const semInflexao = !anguloHab;
                        // 4. Jitter de reta (descartado dinamicamente se r.pingsEspuriosRetaDia > 0 no teste de pista)
                        const temJitterReta = false;
                        // 5. Ângulo cego (perde curvas viárias reais e rotatórias)
                        const perdeCurvasCriticas = anguloHab && angulo > 20;
                        // 5. Incoerência de filtro (filtro >= timerMov asfixia a curva)
                        const filtroIncoerente = anguloHab && filtro >= timerMov;
                        // 6. Filtro muito curto (filtro < 5s duplica pings na mesma curva)
                        const filtroCurto = anguloHab && filtro < 5;
                        // 7. Timer de movimento fora da faixa operacional segura
                        const timerInadequado = timerMov < 12 || timerMov > 22;
                        // 8. Heartbeat ligado muito rápido (<90s redundante) ou muito lento (>240s risco queda NAT)
                        const hbtMovInadequado = hbtLigado < 90 || hbtLigado > 240;
                        // 9. Timer parado muito frequente (< 1800s na garagem)
                        const timerParadoInadequado = timerParado < 1800;
                        // 10. Heartbeat repouso muito rápido (< 240s parado)
                        const hbtParadoInadequado = hbtDesligado < 240;
                        // 11. Pacote básico sem odômetro MCU
                        const semMcu = !pacoteEstendido;

                        const ehAberracaoConhecida =
                          semModoGaragem ||
                          sensorInstavel ||
                          semInflexao ||
                          perdeCurvasCriticas ||
                          filtroIncoerente ||
                          filtroCurto ||
                          timerInadequado ||
                          hbtMovInadequado ||
                          timerParadoInadequado ||
                          hbtParadoInadequado ||
                          semMcu;

                        if (ehAberracaoConhecida) {
                          descartadasCount++;
                        } else {
                          // Parâmetros aprovados estruturalmente: submete ao motor de cálculo físico
                          const candidato: ParametrosPadraoComparativo = {
                            ...padraoB,
                            timerMovimento: timerMov,
                            timerParado,
                            anguloHabilitado: anguloHab,
                            anguloGrau: angulo,
                            anguloIntervalo: filtro,
                            hbtLigado,
                            hbtDesligado,
                            modoEconomiaParada: modoGaragem,
                            sensibilidadeGSensor: sensor,
                            pacoteEstendidoIexvol: pacoteEstendido,
                          };

                          const r = calcularInline(candidato);

                          // Descarte por Ruído de Reta Comprovado no Teste Empírico:
                          if (r.pingsEspuriosRetaDia > 0) {
                            descartadasCount++;
                          } else if (
                            r.estourouFranquia ||
                            r.violouMargemSeguranca ||
                            r.mbTotaisMes > 16.0
                          ) {
                            descartadasCount++;
                          } else {
                            validasCount++;
                            batch.push(r);
                          }
                        }

                        if (processadas % BATCH_SIZE === 0) {
                          if (batch.length > 0) {
                            resultadosValidos.push(...batch);
                            batch = [];
                          }
                          const pctAtual = Math.round((processadas / totalCombinacoes) * 100);
                          if (pctAtual > ultimoUltimoPctReportado) {
                            ultimoUltimoPctReportado = pctAtual;
                            setAutoOtimizadorProgresso(pctAtual);
                            setAutoOtimizadorDescartadas(descartadasCount);
                            setAutoOtimizadorValidas(validasCount);
                          }
                          await new Promise<void>((resolve) => setTimeout(resolve, 0));
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Processar batch restante
    if (batch.length > 0) {
      resultadosValidos.push(...batch);
    }

    setAutoOtimizadorProgresso(100);
    setAutoOtimizadorDescartadas(descartadasCount);
    setAutoOtimizadorValidas(validasCount);

    // Ordenar as combinações aprovadas: Priorizar MÁXIMA QUALIDADE dentro da margem segura
    resultadosValidos.sort((a, b) => {
      if (b.scoreQualidadeTotal !== a.scoreQualidadeTotal) {
        return b.scoreQualidadeTotal - a.scoreQualidadeTotal;
      }
      if (a.mbTotaisMes !== b.mbTotaisMes) {
        return a.mbTotaisMes - b.mbTotaisMes;
      }
      return b.curvasDetectadasPct - a.curvasDetectadasPct;
    });

    // Montagem do Top 10 com estratégias de pista distintas (timerMov, angulo, filtro, sensor)
    const top10Distintos: ResultadoAutoOtimizador[] = [];
    const chavesDistintas = new Set<string>();

    for (const item of resultadosValidos) {
      const chave = `${item.timerMovimento}-${item.anguloGrau}-${item.anguloIntervalo}-${item.sensibilidadeGSensor}`;
      if (!chavesDistintas.has(chave)) {
        chavesDistintas.add(chave);
        top10Distintos.push(item);
        if (top10Distintos.length >= 10) break;
      }
    }

    while (top10Distintos.length < 10 && top10Distintos.length < resultadosValidos.length) {
      top10Distintos.push(resultadosValidos[top10Distintos.length]);
    }

    const campeao = resultadosValidos[0] || null;
    let campeaoRefinado = campeao;
    if (campeao) {
      const paramsBase: ParametrosPadraoComparativo = {
        ...padraoB,
        nome: "Campeão Base Varredura",
        timerMovimento: campeao.timerMovimento,
        timerParado: campeao.timerParado,
        anguloHabilitado: campeao.anguloHabilitado,
        anguloGrau: campeao.anguloGrau,
        anguloIntervalo: campeao.anguloIntervalo,
        hbtLigado: campeao.hbtLigado,
        hbtDesligado: campeao.hbtDesligado,
        modoEconomiaParada: campeao.modoEconomiaParada,
        sensibilidadeGSensor: campeao.sensibilidadeGSensor,
        pacoteEstendidoIexvol: campeao.pacoteEstendidoIexvol,
      };
      campeaoRefinado = executarRefinamentoFinoJ16(paramsBase, perfilTeste);
    }

    // Top 10 com o Campeão Refinado encabeçando obrigatoriamente a 1ª colocação (🥇)
    const top10ComRefinado: ResultadoAutoOtimizador[] = [];
    if (campeaoRefinado) {
      top10ComRefinado.push(campeaoRefinado);
    }
    const chaveRefinado = campeaoRefinado
      ? `${campeaoRefinado.timerMovimento}-${campeaoRefinado.anguloGrau}-${campeaoRefinado.anguloIntervalo}-${campeaoRefinado.sensibilidadeGSensor}`
      : "";
    for (const item of top10Distintos) {
      const chave = `${item.timerMovimento}-${item.anguloGrau}-${item.anguloIntervalo}-${item.sensibilidadeGSensor}`;
      if (chave !== chaveRefinado && top10ComRefinado.length < 10) {
        top10ComRefinado.push(item);
      }
    }

    setAutoOtimizadorResultados(top10ComRefinado);
    setAutoOtimizadorMelhor(campeaoRefinado);
    setAutoOtimizadorAtivo(false);

    if (top10Distintos.length > 0 && campeaoRefinado) {
      // 1. No A: garantir rigorosamente o Padrão Atual do Sistema
      setPadraoA(configOficial);

      // 2. No B: salvar o resultado campeão refinado do auto-otimizador
      setPadraoB((prev) => ({
        ...prev,
        nome: `Padrão Candidato Refinado (${campeaoRefinado.timerMovimento}s / ${campeaoRefinado.anguloGrau}° / ${campeaoRefinado.anguloIntervalo}s)`,
        timerMovimento: campeaoRefinado.timerMovimento,
        timerParado: campeaoRefinado.timerParado,
        anguloHabilitado: campeaoRefinado.anguloHabilitado,
        anguloGrau: campeaoRefinado.anguloGrau,
        anguloIntervalo: campeaoRefinado.anguloIntervalo,
        hbtLigado: campeaoRefinado.hbtLigado,
        hbtDesligado: campeaoRefinado.hbtDesligado,
        modoEconomiaParada: campeaoRefinado.modoEconomiaParada,
        sensibilidadeGSensor: campeaoRefinado.sensibilidadeGSensor,
        pacoteEstendidoIexvol: campeaoRefinado.pacoteEstendidoIexvol,
      }));

      // 3. Rodar os testes nos 2 veículos na bancada de pista simultaneamente
      setIniciarDueloAutomatico(true);

      toast.success(
        `Auto-Otimização concluída! Padrão A cravado no Oficial do Sistema e Padrão B atualizado com o Campeão Refinado (${campeaoRefinado.timerMovimento}s / ${campeaoRefinado.anguloGrau}° / ${campeaoRefinado.anguloIntervalo}s / HBT ${campeaoRefinado.hbtLigado}s · ${campeaoRefinado.mbTotaisMes} MB). Teste de pista em execução nos 2 veículos!`,
      );
    } else {
      toast.warning(
        `Auto-Otimizador concluído: ${processadas.toLocaleString()} combinações testadas. Todas foram descartadas pelos critérios de segurança/jitter com ${autoOtimizadorHorasDia}h/dia.`,
      );
    }
  }, [configOficial, padraoB, perfilUso, autoOtimizadorHorasDia, autoOtimizadorModo]);

  const handleAplicarMelhorCombinacao = useCallback(() => {
    if (!autoOtimizadorMelhor) return;
    setPadraoA(configOficial);
    setPadraoB((prev) => ({
      ...prev,
      nome: `Padrão Candidato Refinado (${autoOtimizadorMelhor.timerMovimento}s / ${autoOtimizadorMelhor.anguloGrau}° / ${autoOtimizadorMelhor.anguloIntervalo}s)`,
      timerMovimento: autoOtimizadorMelhor.timerMovimento,
      timerParado: autoOtimizadorMelhor.timerParado,
      anguloHabilitado: autoOtimizadorMelhor.anguloHabilitado,
      anguloGrau: autoOtimizadorMelhor.anguloGrau,
      anguloIntervalo: autoOtimizadorMelhor.anguloIntervalo,
      hbtLigado: autoOtimizadorMelhor.hbtLigado,
      hbtDesligado: autoOtimizadorMelhor.hbtDesligado,
      modoEconomiaParada: autoOtimizadorMelhor.modoEconomiaParada,
      sensibilidadeGSensor: autoOtimizadorMelhor.sensibilidadeGSensor,
      pacoteEstendidoIexvol: autoOtimizadorMelhor.pacoteEstendidoIexvol,
    }));
    setIniciarDueloAutomatico(true);
    toast.success(
      `Melhor combinação aplicada ao Padrão B com Padrão A no Oficial do Sistema: Timer ${autoOtimizadorMelhor.timerMovimento}s / Ângulo ${autoOtimizadorMelhor.anguloGrau}° / Filtro ${autoOtimizadorMelhor.anguloIntervalo}s / HBT ${autoOtimizadorMelhor.hbtLigado}s / SENDS=1 / G-Sensor L${autoOtimizadorMelhor.sensibilidadeGSensor}. Teste de pista em execução nos 2 veículos!`,
    );
  }, [autoOtimizadorMelhor, configOficial]);

  // Estados da simulação ativa simultânea com física contínua
  const [simulacaoAoVivo, setSimulacaoAoVivo] = useState<boolean>(false);
  const [aceleracaoTempo, setAceleracaoTempo] = useState<number>(30); // 1x, 10x, 30x, 60x
  const [tempoSimuladoSegundos, setTempoSimuladoSegundos] = useState<number>(0);

  // Estado da física contínua compartilhada (velocidade gradual, inércia, guinada e ruído de reta)
  const fisicaCompartilhadaRef = useRef({
    velocidadeKmH: 0,
    aceleracaoAtualMs2: 0,
    cursoRealGraus: 90.0, // Direção leste
    estadoConducao: "INERCIA_REPOUSO" as
      "ACELERANDO" | "CRUZEIRO_RETA" | "FRENANDO" | "INERCIA_REPOUSO" | "CURVA_CONTINUA",
    ultimoCursoPingA: 90.0,
    ultimoCursoPingB: 90.0,
    ultimoEstavaEmCurvaA: false,
    ultimoEstavaEmCurvaB: false,
    tempoUltimoPingCurvaA: 0,
    tempoUltimoPingCurvaB: 0,
    ruidoRetaAcumuladoGraus: 0,
  });

  // Métricas acumuladas da simulação ao vivo
  const [veiculoASim, setVeiculoASim] = useState({
    odometroKm: 0,
    pacotesGps: 0,
    pacotesHbt: 0,
    pingsCurvaReais: 0,
    pingsEspuriosReta: 0,
    bytesTotais: 0,
  });

  const [veiculoBSim, setVeiculoBSim] = useState({
    odometroKm: 0,
    pacotesGps: 0,
    pacotesHbt: 0,
    pingsCurvaReais: 0,
    pingsEspuriosReta: 0,
    bytesTotais: 0,
  });

  // Telemetria instantânea para exibição visual dos efeitos físicos
  const [telemetriaFisicaVisual, setTelemetriaFisicaVisual] = useState({
    velocidade: 0,
    aceleracao: 0,
    cursoInstantaneo: 90.0,
    oscilacaoRetaGraus: 0,
    estado: "Inércia / Repouso (ZVU)",
  });

  const timerSimRef = useRef<NodeJS.Timeout | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // FONTE ÚNICA DE VERDADE: MOTOR FÍSICO HOLÍSTICO CANÔNICO J16
  // Garante que o Quadro 1, Quadro 2 e Quadro 3 falem rigorosamente a mesma língua
  // ───────────────────────────────────────────────────────────────────────────

  const metricasA = useMemo(
    () => calcularMetricasFisicasJ16(padraoA, perfilUso),
    [padraoA, perfilUso],
  );
  const metricasB = useMemo(
    () => calcularMetricasFisicasJ16(padraoB, perfilUso),
    [padraoB, perfilUso],
  );

  const diagTelecomA = useMemo<DiagnosticoTelecomRepouso>(
    () =>
      calcularDiagnosticoTelecomRepouso(
        padraoA.hbtDesligado,
        padraoA.timerParado,
        24 - perfilUso.horasMovimentoPorDia,
      ),
    [padraoA.hbtDesligado, padraoA.timerParado, perfilUso.horasMovimentoPorDia],
  );
  const diagTelecomB = useMemo<DiagnosticoTelecomRepouso>(
    () =>
      calcularDiagnosticoTelecomRepouso(
        padraoB.hbtDesligado,
        padraoB.timerParado,
        24 - perfilUso.horasMovimentoPorDia,
      ),
    [padraoB.hbtDesligado, padraoB.timerParado, perfilUso.horasMovimentoPorDia],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // DIAGNÓSTICO COMPARATIVO COM TRAVA RÍGIDA DE ENGENHARIA (20% DE BUFFER)
  // ───────────────────────────────────────────────────────────────────────────

  const diagnostico = useMemo(() => {
    const problemasA: string[] = [];
    const problemasB: string[] = [];
    const vantagensA: string[] = [];
    const vantagensB: string[] = [];

    // Alertas de Telecom em Repouso
    if (diagTelecomA.riscoEstouroRepouso) {
      problemasA.push(diagTelecomA.alertaMensagem);
    } else {
      vantagensA.push(
        `Repouso Celular Seguro: ${diagTelecomA.transmissoesRepousoPorDia} transmissões/dia (${diagTelecomA.mbRepousoPorDia} MB/dia / ${diagTelecomA.mbRepousoPorMes} MB/mês em repouso).`,
      );
    }
    if (diagTelecomB.riscoEstouroRepouso) {
      problemasB.push(diagTelecomB.alertaMensagem);
    } else {
      vantagensB.push(
        `Repouso Celular Seguro: ${diagTelecomB.transmissoesRepousoPorDia} transmissões/dia (${diagTelecomB.mbRepousoPorDia} MB/dia / ${diagTelecomB.mbRepousoPorMes} MB/mês em repouso).`,
      );
    }

    // Problemas Padrão A
    if (metricasA.estourouFranquia) {
      problemasA.push(
        `Estouro da Franquia de 20 MB: projeção de ${metricasA.mbTotaisMes} MB/mês (${metricasA.percentualFranquia}%). Risco iminente de corte do chip.`,
      );
    } else if (metricasA.violouMargemSeguranca) {
      problemasA.push(
        `Margem de Segurança Insuficiente: consome ${metricasA.mbTotaisMes} MB (> 16 MB). Dias de trânsito intenso ultrapassarão os 20 MB.`,
      );
    }

    // Problemas Padrão B
    if (metricasB.estourouFranquia) {
      problemasB.push(
        `ESTOURO CRÍTICO DE FRANQUIA: Projeção de ${metricasB.mbTotaisMes} MB/mês ultrapassa o teto contratual de 20.0 MB. A operadora bloqueará a linha.`,
      );
    } else if (metricasB.violouMargemSeguranca) {
      problemasB.push(
        `MARGEM DE RISCO ELEVADA: Consumo de ${metricasB.mbTotaisMes} MB opera acima de 80% da franquia. Deixa apenas ${(20.0 - metricasB.mbTotaisMes).toFixed(2)} MB de folga total.`,
      );
    }

    // Sensibilidade de ruído e transição suave na faixa fina 11°-12°
    const verificarJitterResidual = (p: ParametrosPadraoComparativo) => p.anguloGrau <= 12;
    if (padraoB.anguloHabilitado && verificarJitterResidual(padraoB)) {
      if (perfilUso.tipoVeiculo === "moto") {
        problemasB.push(
          `JITTER SEVERO EM MOTO: Equilíbrio giroscópico e corredor de moto geram oscilações de até ±14° na reta, disparando cerca de ${metricasB.pingsEspuriosRetaDia} pings falsos/dia com ângulo de ${padraoB.anguloGrau}°.`,
        );
      } else {
        problemasB.push(
          `JITTER ANGULAR NA RETA: Ângulo de ${padraoB.anguloGrau}° sofre com desvios de buraco, vento e camber da pista, disparando cerca de ${metricasB.pingsEspuriosRetaDia} pings falsos por dia em linha reta.`,
        );
      }
    }

    if (!padraoB.modoEconomiaParada) {
      if (perfilUso.tipoVeiculo === "moto") {
        problemasB.push(
          `RISCO ELÉTRICO CRÍTICO: Bateria de moto (5Ah a 9Ah) é drenada em poucos dias com SENDS=0 (GPS ativo na garagem). Risco iminente de não ligar a moto.`,
        );
      } else {
        problemasB.push(
          `MODO GARAGEM INEFICIENTE: SENDS=0 mantém o GPS ativo parado, consumindo megabytes à toa com o veículo na garagem.`,
        );
      }
    }

    if (!padraoB.anguloHabilitado) {
      problemasB.push(
        `INSUFICIÊNCIA GEOMÉTRICA: Inflexão desativada corta esquinas de 90° em diagonal através de quarteirões e subestima a quilometragem.`,
      );
    }

    // Vantagens Padrão A
    if (!metricasA.violouMargemSeguranca) {
      vantagensA.push(
        `Margem de Segurança Confortável: consome ${metricasA.mbTotaisMes} MB/mês, mantendo ${(20.0 - metricasA.mbTotaisMes).toFixed(2)} MB de folga para imprevistos e trânsito intenso.`,
      );
    }
    if (padraoA.anguloGrau === 15) {
      vantagensA.push(
        `Filtro Angular Imune a Ruído: ângulo de 15° ignora micro-oscilações de reta e aciona estritamente em curvas reais.`,
      );
    }

    // Vantagens Padrão B (somente se não tiver problemas/vícios técnicos graves)
    if (!metricasB.violouMargemSeguranca && problemasB.length === 0) {
      vantagensB.push(
        `Operação dentro da margem segura: ${metricasB.mbTotaisMes} MB/mês com folga de ${(20.0 - metricasB.mbTotaisMes).toFixed(2)} MB.`,
      );
    }
    if (metricasB.scoreQualidadeTotal > metricasA.scoreQualidadeTotal && problemasB.length === 0) {
      vantagensB.push(
        `Fidelidade visual ${metricasB.scoreQualidadeTotal - metricasA.scoreQualidadeTotal} pontos superior ao Padrão A.`,
      );
    }
    if (
      padraoB.anguloHabilitado &&
      padraoB.anguloGrau >= 15 &&
      padraoB.anguloGrau <= 18 &&
      problemasB.length === 0
    ) {
      vantagensB.push(
        `Filtro Angular Otimizado: ângulo de ${padraoB.anguloGrau}° opera no sweet spot viário, garantindo imunidade a ruídos de pista e fidelidade plena em curvas reais.`,
      );
    }

    // Veredito com Trava de Engenharia e Integridade Técnica
    let campeaoEconomia = "EMPATE";
    if (metricasA.mbTotaisMes < metricasB.mbTotaisMes) campeaoEconomia = "PADRÃO A";
    else if (metricasB.mbTotaisMes < metricasA.mbTotaisMes) campeaoEconomia = "PADRÃO B";

    let campeaoQualidade = "EMPATE";
    if (metricasA.scoreQualidadeTotal > metricasB.scoreQualidadeTotal)
      campeaoQualidade = "PADRÃO A";
    else if (metricasB.scoreQualidadeTotal > metricasA.scoreQualidadeTotal)
      campeaoQualidade = "PADRÃO B";

    let vereditoEquilibrio = "PADRÃO A (MANTENHA O ATUAL)";
    let justificativaVeredito = "";

    // HIERARQUIA DE DECISÃO TÉCNICA E SEGURANÇA:
    // 1. Estouro de Franquia Contratual (20 MB)
    if (metricasB.estourouFranquia) {
      vereditoEquilibrio = "PADRÃO A (RECOMENDADO · B REJEITADO POR ESTOURO)";
      justificativaVeredito = `O Padrão B viola o teto contratual de 20 MB (${metricasB.mbTotaisMes} MB projetados com custos basais). Risco total de cancelamento da linha M2M. Mantenha o Padrão A.`;
    }
    // 2. Violação do Buffer de 20% (Teto Seguro de 16 MB)
    else if (metricasB.violouMargemSeguranca) {
      vereditoEquilibrio = "PADRÃO A (RECOMENDADO · B REJEITADO POR RISCO)";
      justificativaVeredito = `O Padrão B consome ${metricasB.mbTotaisMes} MB/mês (acima do teto seguro de 16 MB). A folga de apenas ${(20.0 - metricasB.mbTotaisMes).toFixed(2)} MB será devorada em congestionamentos. Mantenha o Padrão A.`;
    }
    // 3. Detecção de Vícios Técnicos e Riscos no Padrão B (Ex: Jitter de Reta, Falta de Modo Garagem)
    else if (problemasB.length > 0) {
      vereditoEquilibrio = "PADRÃO A (RECOMENDADO · B REJEITADO POR VÍCIO)";
      justificativaVeredito = `O Padrão B foi sumariamente REJEITADO por vícios técnicos detectados (${problemasB[0].replace(/:.*/, "")}). O Padrão A homologado permanece como o único padrão seguro e estável.`;
    }
    // 4. Aprovação Genuína do Padrão B (Zero Vícios + Dentro da Margem Segura + Qualidade Superior)
    else if (
      metricasB.scoreQualidadeTotal > metricasA.scoreQualidadeTotal &&
      !metricasB.violouMargemSeguranca &&
      problemasB.length === 0
    ) {
      vereditoEquilibrio = "PADRÃO B (APROVADO COM MARGEM)";
      justificativaVeredito = `O Padrão B entrega mais qualidade viária (${metricasB.scoreQualidadeTotal} pts), sem vícios técnicos e respeita a margem de segurança de engenharia (${metricasB.mbTotaisMes} MB <= 16 MB).`;
    } else if (
      metricasB.mbTotaisMes < metricasA.mbTotaisMes &&
      metricasB.scoreQualidadeTotal >= 75 &&
      problemasB.length === 0
    ) {
      vereditoEquilibrio = "PADRÃO B (ECONÔMICO HOMOLOGADO)";
      justificativaVeredito = `O Padrão B reduz custos de dados mantendo estabilidade e fidelidade viária comprovadas.`;
    } else {
      vereditoEquilibrio = "PADRÃO A (PRESERVADO)";
      justificativaVeredito =
        "O Padrão A homologado é a configuração historicamente comprovada que une blindagem contra estouro de franquia e fidelidade de odômetro.";
    }

    return {
      problemasA,
      problemasB,
      vantagensA,
      vantagensB,
      campeaoEconomia,
      campeaoQualidade,
      vereditoEquilibrio,
      justificativaVeredito,
    };
  }, [metricasA, metricasB, padraoA, padraoB, perfilUso.tipoVeiculo, diagTelecomA, diagTelecomB]);

  // ───────────────────────────────────────────────────────────────────────────
  // DADOS ESTRUTURADOS PARA OS GRÁFICOS DE BARRAS VERTICAIS PARAMÉTRICOS
  // (COM APONTAMENTO DE ERROS, FALHAS E RISCOS DE CARRO E MOTO)
  // ───────────────────────────────────────────────────────────────────────────

  const graficosVerticaisParametros = useMemo(() => {
    const isMoto = perfilUso.tipoVeiculo === "moto";

    return [
      {
        id: "timer-mov",
        nome: "Timer Movimento",
        unidade: "s",
        valorA: padraoA.timerMovimento,
        valorB: padraoB.timerMovimento,
        textoA: `${padraoA.timerMovimento}s`,
        textoB: `${padraoB.timerMovimento}s`,
        alturaPctA: Math.min(100, Math.max(12, (padraoA.timerMovimento / 60) * 100)),
        alturaPctB: Math.min(100, Math.max(12, (padraoB.timerMovimento / 60) * 100)),
        tipo: padraoB.timerMovimento < 10 ? "falha" : padraoB.timerMovimento > 30 ? "alerta" : "ok",
        diagnostico:
          padraoB.timerMovimento < 10
            ? "FALHA: Tempestade de pacotes na rede M2M"
            : padraoB.timerMovimento > 30
              ? "ALERTA: Perda de esquinas rápidas em cruzamentos"
              : "OK: Amostragem temporal equilibrada",
      },
      {
        id: "angulo-curva",
        nome: "Ângulo de Curva",
        unidade: "°",
        valorA: padraoA.anguloHabilitado ? padraoA.anguloGrau : 0,
        valorB: padraoB.anguloHabilitado ? padraoB.anguloGrau : 0,
        textoA: padraoA.anguloHabilitado ? `${padraoA.anguloGrau}°` : "OFF",
        textoB: padraoB.anguloHabilitado ? `${padraoB.anguloGrau}°` : "OFF",
        alturaPctA: Math.min(
          100,
          Math.max(12, ((padraoA.anguloHabilitado ? padraoA.anguloGrau : 0) / 35) * 100),
        ),
        alturaPctB: Math.min(
          100,
          Math.max(12, ((padraoB.anguloHabilitado ? padraoB.anguloGrau : 0) / 35) * 100),
        ),
        tipo:
          !padraoB.anguloHabilitado || padraoB.anguloGrau <= 12
            ? "falha"
            : padraoB.anguloGrau <= 14
              ? "alerta"
              : padraoB.anguloGrau <= 18
                ? "ok"
                : padraoB.anguloGrau <= 22
                  ? "ok"
                  : "alerta",
        diagnostico: !padraoB.anguloHabilitado
          ? "FALHA: Ângulo OFF (corta curvas em quarteirões)"
          : padraoB.anguloGrau <= 10
            ? isMoto
              ? `FALHA CRÍTICA: Moto no corredor gera ${metricasB.pingsEspuriosRetaDia} pings falsos/dia`
              : `FALHA CRÍTICA: Camber viário gera ${metricasB.pingsEspuriosRetaDia} pings falsos/dia`
            : padraoB.anguloGrau <= 14
              ? `ALERTA: ${padraoB.anguloGrau}° sofre com oscilações residuais de asfalto`
              : padraoB.anguloGrau <= 18
                ? `IDEAL: ${padraoB.anguloGrau}° no Sweet Spot (zero jitter na reta e captura curvas viárias)`
                : padraoB.anguloGrau <= 22
                  ? `BOM: ${padraoB.anguloGrau}° captura manobras e esquinas fechadas`
                  : "ALERTA: Ignora curvas suaves e rotatórias",
      },
      {
        id: "filtro-curva",
        nome: "Filtro de Curva",
        unidade: "s",
        valorA: padraoA.anguloIntervalo,
        valorB: padraoB.anguloIntervalo,
        textoA: `${padraoA.anguloIntervalo}s`,
        textoB: `${padraoB.anguloIntervalo}s`,
        alturaPctA: Math.min(100, Math.max(12, (padraoA.anguloIntervalo / 20) * 100)),
        alturaPctB: Math.min(100, Math.max(12, (padraoB.anguloIntervalo / 20) * 100)),
        tipo:
          padraoB.anguloIntervalo < 6 ? "alerta" : padraoB.anguloIntervalo > 15 ? "alerta" : "ok",
        diagnostico:
          padraoB.anguloIntervalo < 6
            ? "ALERTA: Pings repetidos na mesma curva"
            : padraoB.anguloIntervalo > 15
              ? "ALERTA: Ignora curvas consecutivas em S"
              : "OK: Janela equilibrada de filtro",
      },
      {
        id: "modo-garagem",
        nome: "Modo Garagem",
        unidade: "",
        valorA: padraoA.modoEconomiaParada ? 1 : 0,
        valorB: padraoB.modoEconomiaParada ? 1 : 0,
        textoA: padraoA.modoEconomiaParada ? "SENDS=1" : "SENDS=0",
        textoB: padraoB.modoEconomiaParada ? "SENDS=1" : "SENDS=0",
        alturaPctA: 100,
        alturaPctB: padraoB.modoEconomiaParada ? 100 : 25,
        tipo: !padraoB.modoEconomiaParada ? "falha" : "ok",
        diagnostico: !padraoB.modoEconomiaParada
          ? isMoto
            ? "FALHA GRAVE: Descarrega bateria de 7Ah da moto"
            : "FALHA: GPS ativo parado (dreno contínuo)"
          : "OK: Dormência e preservação de bateria",
      },
      {
        id: "consumo-m2m",
        nome: "Consumo M2M",
        unidade: "MB",
        valorA: metricasA.mbTotaisMes,
        valorB: metricasB.mbTotaisMes,
        textoA: `${metricasA.mbTotaisMes} MB`,
        textoB: `${metricasB.mbTotaisMes} MB`,
        alturaPctA: Math.min(100, Math.max(12, (metricasA.mbTotaisMes / 25) * 100)),
        alturaPctB: Math.min(100, Math.max(12, (metricasB.mbTotaisMes / 25) * 100)),
        tipo: metricasB.estourouFranquia
          ? "falha"
          : metricasB.violouMargemSeguranca
            ? "falha"
            : "ok",
        diagnostico: metricasB.estourouFranquia
          ? "FALHA CRÍTICA: Estouro da franquia de 20 MB"
          : metricasB.violouMargemSeguranca
            ? "FALHA: Viola teto seguro de 16 MB (80%)"
            : "OK: Opera dentro da margem de segurança",
      },
      {
        id: "pings-falsos",
        nome: "Pings Falsos / Dia",
        unidade: "pings",
        valorA: metricasA.pingsEspuriosRetaDia,
        valorB: metricasB.pingsEspuriosRetaDia,
        textoA: `${metricasA.pingsEspuriosRetaDia}/dia`,
        textoB: `${metricasB.pingsEspuriosRetaDia}/dia`,
        alturaPctA: 6,
        alturaPctB: Math.min(
          100,
          Math.max(
            8,
            (metricasB.pingsEspuriosRetaDia / Math.max(120, metricasB.pingsEspuriosRetaDia)) * 100,
          ),
        ),
        tipo: metricasB.pingsEspuriosRetaDia > 0 ? "falha" : "ok",
        diagnostico:
          metricasB.pingsEspuriosRetaDia > 0
            ? `FALHA SEVERA: ${metricasB.pingsEspuriosRetaDia} disparos falsos/dia na reta`
            : "ZERO JITTER: Imunidade a oscilações viárias",
      },
      {
        id: "qualidade-rota",
        nome: "Qualidade Viária",
        unidade: "pts",
        valorA: metricasA.scoreQualidadeTotal,
        valorB: metricasB.scoreQualidadeTotal,
        textoA: `${metricasA.scoreQualidadeTotal} pts`,
        textoB: `${metricasB.scoreQualidadeTotal} pts`,
        alturaPctA: metricasA.scoreQualidadeTotal,
        alturaPctB: metricasB.scoreQualidadeTotal,
        tipo:
          metricasB.scoreQualidadeTotal < 70
            ? "falha"
            : metricasB.pingsEspuriosRetaDia > 0
              ? "alerta"
              : "ok",
        diagnostico:
          metricasB.scoreQualidadeTotal < 70
            ? "QUALIDADE BAIXA: Trajeto geométrico degradado"
            : metricasB.pingsEspuriosRetaDia > 0
              ? "QUALIDADE POLUÍDA: Penalizado por ruído de reta"
              : "ALTA FIDELIDADE: Rota limpa e odômetro exato",
      },
    ];
  }, [padraoA, padraoB, metricasA, metricasB, perfilUso.tipoVeiculo]);

  // ───────────────────────────────────────────────────────────────────────────
  // LOOP DA SIMULAÇÃO AO VIVO COM FÍSICA CONTÍNUA REALISTA
  // (ACELERAÇÃO GRADUAL, INÉRCIA ZVU, GUINADA NO TEMPO E RUÍDO DE RETA)
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!simulacaoAoVivo) {
      if (timerSimRef.current) clearInterval(timerSimRef.current);
      return;
    }

    const intervaloMs = Math.max(40, Math.round(1000 / Math.max(1, aceleracaoTempo)));
    const trajeto = gerarCicloViarioHolistico(perfilUso.tipoVeiculo);

    timerSimRef.current = setInterval(() => {
      setTempoSimuladoSegundos((prev) => {
        const t = prev + 1; // Avança 1 segundo de estrada física
        const f = fisicaCompartilhadaRef.current;
        const pt = trajeto[t % 300];

        f.velocidadeKmH = pt.vel;
        f.cursoRealGraus = pt.curso;
        f.ruidoRetaAcumuladoGraus = pt.curso - 90.0;

        const deslocamentoMetros = (pt.vel / 3.6) * 1.0;

        // Alinhamento físico de largada na virada de volta do circuito (elimina artefato de wrap-around)
        if (t % 300 === 0) {
          f.ultimoCursoPingA = pt.curso;
          f.ultimoCursoPingB = pt.curso;
          f.ultimoEstavaEmCurvaA = false;
          f.ultimoEstavaEmCurvaB = false;
        }

        // ── DISPARO NO VEÍCULO A (PADRÃO HOMOLOGADO) ──
        setVeiculoASim((va) => {
          const isMovimento = pt.vel > 3 && pt.ignicao;
          let disparouTimer = false;
          if (isMovimento && t % Math.max(1, padraoA.timerMovimento) === 0) {
            disparouTimer = true;
            f.ultimoCursoPingA = pt.curso;
            f.ultimoEstavaEmCurvaA = pt.emCurva || pt.emRotatoria || pt.emManobra;
          } else if (!isMovimento) {
            const timerRep = padraoA.modoEconomiaParada ? padraoA.timerParado : 600;
            if (t % Math.max(60, timerRep) === 0) disparouTimer = true;
          }

          let disparouCurvaA = false;
          let disparouEspurioA = false;

          if (padraoA.anguloHabilitado && isMovimento && pt.vel > 5 && pt.sats >= 3) {
            const deltaThetaA = diferencaAngular(pt.curso, f.ultimoCursoPingA);
            const tempoDesdeUltimoCurvaA = t - f.tempoUltimoPingCurvaA;

            if (
              deltaThetaA >= padraoA.anguloGrau &&
              tempoDesdeUltimoCurvaA >= padraoA.anguloIntervalo
            ) {
              disparouCurvaA = true;
              f.ultimoCursoPingA = pt.curso;
              f.tempoUltimoPingCurvaA = t;

              const pontoEmCurva = pt.emCurva || pt.emRotatoria || pt.emManobra;
              // Disparo só é considerado espúrio se não for curva nem desengate/conclusão de curva anterior
              if (!pontoEmCurva && !f.ultimoEstavaEmCurvaA) {
                disparouEspurioA = true;
              }
              f.ultimoEstavaEmCurvaA = pontoEmCurva;
            }
          }

          const deveDispararHbt = isMovimento
            ? t % Math.max(10, padraoA.hbtLigado) === 0
            : t % Math.max(30, padraoA.hbtDesligado) === 0;

          const pingsGps = (disparouTimer ? 1 : 0) + (disparouCurvaA ? 1 : 0);
          const pingsHbt = deveDispararHbt ? 1 : 0;
          const bytes = pingsGps * (padraoA.pacoteEstendidoIexvol ? 104 : 94) + pingsHbt * 65;

          return {
            ...va,
            odometroKm: va.odometroKm + deslocamentoMetros / 1000,
            pacotesGps: va.pacotesGps + pingsGps,
            pacotesHbt: va.pacotesHbt + pingsHbt,
            pingsCurvaReais: va.pingsCurvaReais + (disparouCurvaA && !disparouEspurioA ? 1 : 0),
            pingsEspuriosReta: va.pingsEspuriosReta + (disparouEspurioA ? 1 : 0),
            bytesTotais: va.bytesTotais + bytes,
          };
        });

        // ── DISPARO NO VEÍCULO B (PADRÃO CANDIDATO) ──
        setVeiculoBSim((vb) => {
          const isMovimento = pt.vel > 3 && pt.ignicao;
          let disparouTimer = false;
          if (isMovimento && t % Math.max(1, padraoB.timerMovimento) === 0) {
            disparouTimer = true;
            f.ultimoCursoPingB = pt.curso;
            f.ultimoEstavaEmCurvaB = pt.emCurva || pt.emRotatoria || pt.emManobra;
          } else if (!isMovimento) {
            const timerRep = padraoB.modoEconomiaParada ? padraoB.timerParado : 600;
            if (t % Math.max(60, timerRep) === 0) disparouTimer = true;
          }

          let disparouCurvaB = false;
          let disparouEspurioB = false;

          if (padraoB.anguloHabilitado && isMovimento && pt.vel > 5 && pt.sats >= 3) {
            const deltaThetaB = diferencaAngular(pt.curso, f.ultimoCursoPingB);
            const tempoDesdeUltimoCurvaB = t - f.tempoUltimoPingCurvaB;

            if (
              deltaThetaB >= padraoB.anguloGrau &&
              tempoDesdeUltimoCurvaB >= padraoB.anguloIntervalo
            ) {
              disparouCurvaB = true;
              f.ultimoCursoPingB = pt.curso;
              f.tempoUltimoPingCurvaB = t;

              const pontoEmCurva = pt.emCurva || pt.emRotatoria || pt.emManobra;
              // Disparo só é considerado espúrio se não for curva nem desengate/conclusão de curva anterior
              if (!pontoEmCurva && !f.ultimoEstavaEmCurvaB) {
                disparouEspurioB = true;
              }
              f.ultimoEstavaEmCurvaB = pontoEmCurva;
            }
          }

          const deveDispararHbt = isMovimento
            ? t % Math.max(10, padraoB.hbtLigado) === 0
            : t % Math.max(30, padraoB.hbtDesligado) === 0;

          const pingsGps = (disparouTimer ? 1 : 0) + (disparouCurvaB ? 1 : 0);
          const pingsHbt = deveDispararHbt ? 1 : 0;
          const bytes = pingsGps * (padraoB.pacoteEstendidoIexvol ? 104 : 94) + pingsHbt * 65;

          return {
            ...vb,
            odometroKm: vb.odometroKm + deslocamentoMetros / 1000,
            pacotesGps: vb.pacotesGps + pingsGps,
            pacotesHbt: vb.pacotesHbt + pingsHbt,
            pingsCurvaReais: vb.pingsCurvaReais + (disparouCurvaB && !disparouEspurioB ? 1 : 0),
            pingsEspuriosReta: vb.pingsEspuriosReta + (disparouEspurioB ? 1 : 0),
            bytesTotais: vb.bytesTotais + bytes,
          };
        });

        // Atualiza mostrador visual de telemetria física multimodal
        setTelemetriaFisicaVisual({
          velocidade: Math.round(pt.vel),
          aceleracao: Number((pt.vel > 0 ? 1.2 : 0).toFixed(2)),
          cursoInstantaneo: Number(pt.curso.toFixed(1)),
          oscilacaoRetaGraus: Number((pt.curso - 90).toFixed(1)),
          estado: pt.estado,
        });

        return t;
      });
    }, intervaloMs);

    return () => {
      if (timerSimRef.current) clearInterval(timerSimRef.current);
    };
  }, [simulacaoAoVivo, aceleracaoTempo, padraoA, padraoB, perfilUso.tipoVeiculo]);

  // Controles de Simulação ao Vivo
  const handleAlternarSimulacaoAoVivo = () => {
    if (simulacaoAoVivo) {
      setSimulacaoAoVivo(false);
      toast.info("Simulação comparativa pausada.");
    } else {
      setSimulacaoAoVivo(true);
      toast.success(
        `Simulação com física contínua ativa (${aceleracaoTempo}x): oscilações de reta, frenagens e inércia ZVU.`,
      );
    }
  };

  const handleReiniciarSimulacaoAoVivo = () => {
    setSimulacaoAoVivo(false);
    setTempoSimuladoSegundos(0);
    fisicaCompartilhadaRef.current = {
      velocidadeKmH: 0,
      aceleracaoAtualMs2: 0,
      cursoRealGraus: 90.0,
      estadoConducao: "INERCIA_REPOUSO",
      ultimoCursoPingA: 90.0,
      ultimoCursoPingB: 90.0,
      tempoUltimoPingCurvaA: 0,
      tempoUltimoPingCurvaB: 0,
      ultimoEstavaEmCurvaA: false,
      ultimoEstavaEmCurvaB: false,
      ruidoRetaAcumuladoGraus: 0,
    };
    setVeiculoASim({
      odometroKm: 0,
      pacotesGps: 0,
      pacotesHbt: 0,
      pingsCurvaReais: 0,
      pingsEspuriosReta: 0,
      bytesTotais: 0,
    });
    setVeiculoBSim({
      odometroKm: 0,
      pacotesGps: 0,
      pacotesHbt: 0,
      pingsCurvaReais: 0,
      pingsEspuriosReta: 0,
      bytesTotais: 0,
    });
    setTelemetriaFisicaVisual({
      velocidade: 0,
      aceleracao: 0,
      cursoInstantaneo: 90.0,
      oscilacaoRetaGraus: 0,
      estado: "Inércia / Repouso (ZVU)",
    });
    toast.success("Bancada de simulação física reiniciada em zero.");
  };

  // Disparo automático do teste de pista nos 2 veículos (Passo 3) após conclusão da auto-otimização
  useEffect(() => {
    if (iniciarDueloAutomatico && !autoOtimizadorAtivo) {
      setIniciarDueloAutomatico(false);
      handleReiniciarSimulacaoAoVivo();
      setAceleracaoTempo(10);
      setSimulacaoAoVivo(true);
      toast.success(
        "Padrão A (Oficial do Sistema) e Padrão B (Resultado Campeão Refinado) alocados! Teste de Bancada A vs B iniciado automaticamente na pista virtual.",
      );
    }
  }, [iniciarDueloAutomatico, autoOtimizadorAtivo]);

  // Homologar Padrão B como novo Oficial (com Trava Rígida de Engenharia em 16.0 MB)
  const handleAplicarPadraoBComoOficial = () => {
    if (metricasB.violouMargemSeguranca) {
      toast.error(
        `Operação bloqueada pela Diretriz de Engenharia: o Padrão B projeta ${metricasB.mbTotaisMes} MB/mês, violando o teto seguro de 16.0 MB (80% da franquia). Risco inaceitável de corte de conectividade em dias de trânsito intenso.`,
      );
      return;
    }

    try {
      const atual = obterConfigPadraoSistemaJ16();
      const novoSalvo = {
        valores: {
          ...atual.valores,
          timerMovimento: padraoB.timerMovimento.toString(),
          timerParado: padraoB.timerParado.toString(),
          anguloGrau: padraoB.anguloGrau.toString(),
          anguloIntervalo: padraoB.anguloIntervalo.toString(),
          hbtLigado: padraoB.hbtLigado.toString(),
          hbtDesligado: padraoB.hbtDesligado.toString(),
        },
        checkboxes: {
          ...atual.checkboxes,
          anguloHabilitar: padraoB.anguloHabilitado,
          economiaParada: padraoB.modoEconomiaParada,
          voltagemOdometroIexvol: padraoB.pacoteEstendidoIexvol,
        },
      };

      localStorage.setItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA, JSON.stringify(novoSalvo));
      setPadraoA({
        ...padraoB,
        nome: "Padrão Oficial do Sistema (Atualizado)",
      });
      toast.success("Novo padrão homologado com sucesso dentro da margem segura!");
    } catch (err) {
      toast.error("Erro ao salvar nova configuração padrão.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CABEÇALHO DO MÓDULO COMPARATIVO */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Comparativo de Padrões de Rastreamento (Teste A/B)
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                  TETO 20 MB/MÊS · BUFFER 20%
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Simulação com dinâmica física contínua: aceleração gradual, inércia ZVU, guinada em
                curva e jitter na reta
              </p>
            </div>
          </div>
        </div>

        {/* Presets de Carregamento Rápido */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 mr-1">
            Presets para B:
          </span>
          {PRESETS_COMPARATIVOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPadraoB(p.params);
                toast.success(`Preset "${p.nome}" aplicado no Padrão B.`);
              }}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer shadow-xs"
              title={p.descricao}
            >
              {p.rotuloCurto}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPadraoB({ ...padraoA, nome: "Cópia do Padrão A" });
              toast.info("Padrão A copiado integralmente para o Padrão B.");
            }}
            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
            title="Copiar Padrão A para B"
          >
            Copiar A ➔ B
          </button>
          <button
            type="button"
            onClick={() => {
              setPadraoA(configOficial);
              toast.success("Padrão A restaurado para a configuração oficial homologada.");
            }}
            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-300/70 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition cursor-pointer shadow-xs"
            title="Restaurar Padrão A para o Padrão Oficial do Sistema"
          >
            Restaurar Padrão no A
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* REGUA DE EXECUÇÃO: OS 5 PASSOS CANÔNICOS EM SEQUÊNCIA ESTABILIZADA */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-300/50 dark:border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Sliders className="h-4 w-4" />
            </span>
            <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">
              Esteira de Homologação de Padrões J16 (5 Passos Sequenciais)
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
            Processo contínuo com convergência de pista e modo canônico
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 font-mono text-xs">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-800 dark:text-cyan-300">
            <div className="flex items-center justify-between">
              <span className="font-black text-[11px]">Passo 1</span>
              <FlaskConical className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="font-bold text-[11px] mt-0.5">Auto-Otimizador Fino</div>
            <div className="text-[9px] text-cyan-600/80 dark:text-cyan-400/80 mt-0.5 leading-tight">
              Varredura + refinamento fino automático
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-800 dark:text-blue-300">
            <div className="flex items-center justify-between">
              <span className="font-black text-[11px]">Passo 2</span>
              <Scale className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="font-bold text-[11px] mt-0.5">Alocação A vs B</div>
            <div className="text-[9px] text-blue-600/80 dark:text-blue-400/80 mt-0.5 leading-tight">
              Oficial (A) vs Candidato Refinado (B)
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-800 dark:text-purple-300">
            <div className="flex items-center justify-between">
              <span className="font-black text-[11px]">Passo 3</span>
              <Zap className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="font-bold text-[11px] mt-0.5">Bancada em Pista</div>
            <div className="text-[9px] text-purple-600/80 dark:text-purple-400/80 mt-0.5 leading-tight">
              Veículo 1 vs Veículo 2 simultâneos
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300">
            <div className="flex items-center justify-between">
              <span className="font-black text-[11px]">Passo 4</span>
              <Activity className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="font-bold text-[11px] mt-0.5">Gráficos Estabilizados</div>
            <div className="text-[9px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 leading-tight">
              Convergência invariante com o tempo
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center justify-between">
              <span className="font-black text-[11px]">Passo 5</span>
              <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="font-bold text-[11px] mt-0.5">Modo Canônico</div>
            <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 leading-tight">
              Inserir no sistema e copiar comandos
            </div>
          </div>
        </div>
      </div>

      {/* AUTO-OTIMIZADOR DE COMBINAÇÕES DE PARÂMETROS                      */}
      {/* Teste automatizado de todas as combinações ±5 por parâmetro       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border-2 border-cyan-500/40 dark:border-cyan-500/30 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                PASSO 1: Auto-Otimizador de Parâmetros com Refinamento Fino Automático
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
                  BRUTE-FORCE {autoOtimizadorModo === "completa" ? "VARREDURA TOTAL" : "±5"} ·{" "}
                  {autoOtimizadorHorasDia}H/DIA{" "}
                  {autoOtimizadorHorasDia <= 2
                    ? "(USO REAL)"
                    : autoOtimizadorHorasDia === 8
                      ? "(ESTRESSE MÁXIMO)"
                      : ""}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {autoOtimizadorModo === "completa"
                  ? "Varre todas as combinações do hardware J16, descarta ruídos de reta e executa o Refinamento Fino no final automaticamente (sem etapas manuais)."
                  : "Refina parâmetros locais em torno do Padrão B atual, eliminando ruídos conhecidos com calibração automática."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de Modo de Varredura */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-300/60 dark:border-slate-700">
              <button
                type="button"
                disabled={autoOtimizadorAtivo}
                onClick={() => setAutoOtimizadorModo("completa")}
                title="Varredura Universal completa com Refinamento Fino automático no final"
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  autoOtimizadorModo === "completa"
                    ? "bg-cyan-500 text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Completa + Refinamento Fino
              </button>
              <button
                type="button"
                disabled={autoOtimizadorAtivo}
                onClick={() => setAutoOtimizadorModo("refinamento")}
                title="Refina apenas a vizinhança do Padrão B atual"
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  autoOtimizadorModo === "refinamento"
                    ? "bg-cyan-500 text-slate-950 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Refinamento Rápido ±5
              </button>
            </div>

            {/* Seletor de Horas por Dia com Destaque de Uso Real vs Estresse Máximo */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-300/60 dark:border-slate-700">
              <Clock className="h-3.5 w-3.5 text-cyan-500 ml-1" />
              {[2, 4, 6, 8, 10, 12, 16].map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={autoOtimizadorAtivo}
                  onClick={() => setAutoOtimizadorHorasDia(h)}
                  title={
                    h === 2
                      ? "2h/dia: Média real de veículos comuns particulares (~4 MB/mês)"
                      : h === 8
                        ? "8h/dia: Estresse máximo para frotas pesadas e viaturas (~15 MB/mês)"
                        : `${h} horas de movimento diário`
                  }
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    autoOtimizadorHorasDia === h
                      ? "bg-cyan-500 text-slate-950 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  {h}h{h === 2 ? " (Real)" : h === 8 ? " (Estresse)" : ""}
                </button>
              ))}
            </div>

            {autoOtimizadorAtivo ? (
              <button
                type="button"
                onClick={() => {
                  autoOtimizadorCancelRef.current = true;
                }}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-red-500 hover:bg-red-600 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Square className="h-3.5 w-3.5" />
                <span>Cancelar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={executarAutoOtimizador}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-cyan-600 hover:bg-cyan-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Target className="h-3.5 w-3.5" />
                <span>Iniciar Teste Completo (Varredura + Refinamento Automático)</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Progresso e Estatísticas de Descarte de Aberrações */}
        {(autoOtimizadorAtivo || autoOtimizadorProgresso > 0) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                {autoOtimizadorAtivo && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500" />
                )}
                {autoOtimizadorAtivo
                  ? "Processando e filtrando aberrações..."
                  : "Varredura Concluída"}
              </span>
              <span className="font-black text-cyan-600 dark:text-cyan-400">
                {autoOtimizadorProgresso}% ({autoOtimizadorTotal.toLocaleString()} combinações)
              </span>
            </div>
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  autoOtimizadorAtivo
                    ? "bg-linear-to-r from-cyan-500 to-cyan-400 animate-pulse"
                    : "bg-linear-to-r from-emerald-500 to-emerald-400"
                }`}
                style={{ width: `${autoOtimizadorProgresso}%` }}
              />
            </div>

            {/* Painel de Triagem: Testadas vs Descartadas vs Aprovadas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-xs">
              <div className="p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Total Avaliadas:</span>
                <span className="font-black text-slate-800 dark:text-slate-200">
                  {autoOtimizadorTotal.toLocaleString()}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 flex items-center justify-between">
                <span className="text-red-600 dark:text-red-400 text-[11px] flex items-center gap-1">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Aberrações Descartadas:
                </span>
                <span className="font-black text-red-600 dark:text-red-400">
                  {autoOtimizadorDescartadas.toLocaleString()}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between">
                <span className="text-emerald-700 dark:text-emerald-300 text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprovadas e Analisadas:
                </span>
                <span className="font-black text-emerald-700 dark:text-emerald-300">
                  {autoOtimizadorValidas.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Resultado Campeão */}
        {autoOtimizadorMelhor && !autoOtimizadorAtivo && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Medal className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-300 uppercase">
                  🏆 Melhor Combinação Encontrada
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleAplicarMelhorCombinacao}
                  className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Aplica esta combinação vencedora no Padrão B para simulação"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>Aplicar no Padrão B</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const paramsMelhor: ParametrosPadraoComparativo = {
                      ...padraoB,
                      nome: "Melhor Combinação Auto-Otimizada",
                      timerMovimento: autoOtimizadorMelhor.timerMovimento,
                      timerParado: autoOtimizadorMelhor.timerParado,
                      anguloHabilitado: autoOtimizadorMelhor.anguloHabilitado,
                      anguloGrau: autoOtimizadorMelhor.anguloGrau,
                      anguloIntervalo: autoOtimizadorMelhor.anguloIntervalo,
                      hbtLigado: autoOtimizadorMelhor.hbtLigado,
                      hbtDesligado: autoOtimizadorMelhor.hbtDesligado,
                      modoEconomiaParada: autoOtimizadorMelhor.modoEconomiaParada,
                      sensibilidadeGSensor: autoOtimizadorMelhor.sensibilidadeGSensor,
                      pacoteEstendidoIexvol: autoOtimizadorMelhor.pacoteEstendidoIexvol,
                    };
                    handleUsarNosParametrosCanonicos(paramsMelhor);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-purple-600 hover:bg-purple-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Carrega esta combinação diretamente nos Parâmetros Canônicos do Sistema"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Usar nos Parâmetros Canônicos</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const paramsMelhor: ParametrosPadraoComparativo = {
                      ...padraoB,
                      nome: "Melhor Combinação Auto-Otimizada",
                      timerMovimento: autoOtimizadorMelhor.timerMovimento,
                      timerParado: autoOtimizadorMelhor.timerParado,
                      anguloHabilitado: autoOtimizadorMelhor.anguloHabilitado,
                      anguloGrau: autoOtimizadorMelhor.anguloGrau,
                      anguloIntervalo: autoOtimizadorMelhor.anguloIntervalo,
                      hbtLigado: autoOtimizadorMelhor.hbtLigado,
                      hbtDesligado: autoOtimizadorMelhor.hbtDesligado,
                      modoEconomiaParada: autoOtimizadorMelhor.modoEconomiaParada,
                      sensibilidadeGSensor: autoOtimizadorMelhor.sensibilidadeGSensor,
                      pacoteEstendidoIexvol: autoOtimizadorMelhor.pacoteEstendidoIexvol,
                    };
                    handleCopiarComandosRapido(paramsMelhor);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-black uppercase bg-cyan-600 hover:bg-cyan-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Copia os comandos desta combinação para implementar no dispositivo"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar Comandos</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const paramsMelhor: ParametrosPadraoComparativo = {
                      ...padraoB,
                      nome: "Melhor Combinação Auto-Otimizada",
                      timerMovimento: autoOtimizadorMelhor.timerMovimento,
                      timerParado: autoOtimizadorMelhor.timerParado,
                      anguloHabilitado: autoOtimizadorMelhor.anguloHabilitado,
                      anguloGrau: autoOtimizadorMelhor.anguloGrau,
                      anguloIntervalo: autoOtimizadorMelhor.anguloIntervalo,
                      hbtLigado: autoOtimizadorMelhor.hbtLigado,
                      hbtDesligado: autoOtimizadorMelhor.hbtDesligado,
                      modoEconomiaParada: autoOtimizadorMelhor.modoEconomiaParada,
                      sensibilidadeGSensor: autoOtimizadorMelhor.sensibilidadeGSensor,
                      pacoteEstendidoIexvol: autoOtimizadorMelhor.pacoteEstendidoIexvol,
                    };
                    handleAbrirModalComandos(paramsMelhor);
                  }}
                  className="p-1.5 rounded-xl border border-emerald-500/40 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 transition cursor-pointer"
                  title="Ver script detalhado de comandos"
                >
                  <Terminal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Timer Mov</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  {autoOtimizadorMelhor.timerMovimento}s
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Ângulo Curva</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  {autoOtimizadorMelhor.anguloGrau}°
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Filtro Curva</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  {autoOtimizadorMelhor.anguloIntervalo}s
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">HBT Ligado</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  {autoOtimizadorMelhor.hbtLigado}s
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">HBT Repouso</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  {autoOtimizadorMelhor.hbtDesligado}s
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Timer Garagem</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  {autoOtimizadorMelhor.timerParado}s
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Modo SENDS</span>
                <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {autoOtimizadorMelhor.modoEconomiaParada ? "SENDS=1" : "SENDS=0"}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">G-Sensor</span>
                <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                  L{autoOtimizadorMelhor.sensibilidadeGSensor}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">
                  Score Composto
                </span>
                <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {autoOtimizadorMelhor.scoreComposto}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Qualidade</span>
                <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {autoOtimizadorMelhor.scoreQualidadeTotal}/100
                </div>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
                <span className="text-[9px] font-mono text-slate-500 uppercase">Consumo</span>
                <div className="text-xl font-black font-mono text-purple-600 dark:text-purple-400">
                  {autoOtimizadorMelhor.mbTotaisMes} MB
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabela Top 10 Resultados */}
        {autoOtimizadorResultados.length > 0 && !autoOtimizadorAtivo && (
          <div className="space-y-2">
            <h4 className="text-xs font-mono font-black text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              Top {autoOtimizadorResultados.length} Melhores Combinações (Zero Jitter + Margem
              Segura)
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    <th className="px-2 py-1.5 text-left font-black">#</th>
                    <th className="px-2 py-1.5 text-center font-black">Timer Mov</th>
                    <th className="px-2 py-1.5 text-center font-black">Ângulo</th>
                    <th className="px-2 py-1.5 text-center font-black">Filtro</th>
                    <th className="px-2 py-1.5 text-center font-black">HBT Lig</th>
                    <th className="px-2 py-1.5 text-center font-black">HBT Rep</th>
                    <th className="px-2 py-1.5 text-center font-black">Timer Garagem</th>
                    <th className="px-2 py-1.5 text-center font-black">SENDS</th>
                    <th className="px-2 py-1.5 text-center font-black">Sensor</th>
                    <th className="px-2 py-1.5 text-center font-black">MB/Mês</th>
                    <th className="px-2 py-1.5 text-center font-black">Qualidade</th>
                    <th className="px-2 py-1.5 text-center font-black">Score</th>
                    <th className="px-2 py-1.5 text-center font-black">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {autoOtimizadorResultados.map((r, idx) => (
                    <tr
                      key={`${r.timerMovimento}-${r.anguloGrau}-${r.anguloIntervalo}-${r.hbtLigado}-${r.hbtDesligado}-${r.timerParado}-${r.sensibilidadeGSensor}`}
                      className={`border-t border-slate-100 dark:border-slate-800 transition ${
                        idx === 0
                          ? "bg-emerald-50 dark:bg-emerald-900/20"
                          : "bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <td className="px-2 py-1.5 text-left">
                        {idx === 0 ? (
                          <span className="text-amber-500 font-black">🥇</span>
                        ) : idx === 1 ? (
                          <span className="text-slate-400 font-black">🥈</span>
                        ) : idx === 2 ? (
                          <span className="text-amber-700 font-black">🥉</span>
                        ) : (
                          <span className="text-slate-400">{idx + 1}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold">{r.timerMovimento}s</td>
                      <td className="px-2 py-1.5 text-center font-bold">{r.anguloGrau}°</td>
                      <td className="px-2 py-1.5 text-center font-bold">{r.anguloIntervalo}s</td>
                      <td className="px-2 py-1.5 text-center font-bold">{r.hbtLigado}s</td>
                      <td className="px-2 py-1.5 text-center font-bold">{r.hbtDesligado}s</td>
                      <td className="px-2 py-1.5 text-center font-bold">{r.timerParado}s</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          {r.modoEconomiaParada ? "SENDS=1" : "SENDS=0"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-bold">
                        L{r.sensibilidadeGSensor}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={`font-bold ${
                            r.mbTotaisMes <= 12
                              ? "text-emerald-600 dark:text-emerald-400"
                              : r.mbTotaisMes <= 16
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {r.mbTotaisMes}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span
                          className={`font-bold ${
                            r.scoreQualidadeTotal >= 80
                              ? "text-emerald-600 dark:text-emerald-400"
                              : r.scoreQualidadeTotal >= 60
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {r.scoreQualidadeTotal}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-black">
                          {r.scoreComposto}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPadraoA(configOficial);
                              setPadraoB((prev) => ({
                                ...prev,
                                nome: `Padrão Candidato Refinado #${idx + 1} (${r.timerMovimento}s / ${r.anguloGrau}° / ${r.anguloIntervalo}s)`,
                                timerMovimento: r.timerMovimento,
                                timerParado: r.timerParado,
                                anguloHabilitado: r.anguloHabilitado,
                                anguloGrau: r.anguloGrau,
                                anguloIntervalo: r.anguloIntervalo,
                                hbtLigado: r.hbtLigado,
                                hbtDesligado: r.hbtDesligado,
                                modoEconomiaParada: r.modoEconomiaParada,
                                sensibilidadeGSensor: r.sensibilidadeGSensor,
                                pacoteEstendidoIexvol: r.pacoteEstendidoIexvol,
                              }));
                              setIniciarDueloAutomatico(true);
                              toast.success(
                                `Combinação #${idx + 1} aplicada ao Padrão B com Padrão A no Oficial do Sistema. Teste iniciado nos 2 veículos na pista virtual!`,
                              );
                            }}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/40 transition cursor-pointer"
                            title="Aplica ao Padrão B e roda teste nos 2 veículos"
                          >
                            Aplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const paramsLinha: ParametrosPadraoComparativo = {
                                ...padraoB,
                                nome: `Combinação #${idx + 1} (Score ${r.scoreComposto})`,
                                timerMovimento: r.timerMovimento,
                                timerParado: r.timerParado,
                                anguloHabilitado: r.anguloHabilitado,
                                anguloGrau: r.anguloGrau,
                                anguloIntervalo: r.anguloIntervalo,
                                hbtLigado: r.hbtLigado,
                                hbtDesligado: r.hbtDesligado,
                                modoEconomiaParada: r.modoEconomiaParada,
                                sensibilidadeGSensor: r.sensibilidadeGSensor,
                                pacoteEstendidoIexvol: r.pacoteEstendidoIexvol,
                              };
                              handleCopiarComandosRapido(paramsLinha);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer"
                            title="Copiar comandos para o dispositivo"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 pt-1">
              Score Composto = (Qualidade × 0.6) + ((100 - % Franquia) × 0.4). Critério de admissão:
              zero pings falsos na reta + consumo dentro da margem segura de 16 MB (80% da franquia)
              com perfil de {autoOtimizadorHorasDia}h/dia.
            </p>
          </div>
        )}

        {/* Mensagem de nenhum resultado se o otimizador terminou sem resultados válidos */}
        {autoOtimizadorResultados.length === 0 &&
          !autoOtimizadorAtivo &&
          autoOtimizadorProgresso === 100 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>
                Nenhuma combinação atendeu aos critérios rígidos (zero jitter + dentro de 16 MB com{" "}
                {autoOtimizadorHorasDia}h/dia). Tente ajustar os valores base do Padrão B ou reduzir
                o perfil de horas antes de otimizar.
              </span>
            </div>
          )}
      </div>

      {/* PASSO 2: CONFIGURAÇÃO DOS PADRÕES (VEÍCULO A · OFICIAL vs VEÍCULO B · CANDIDATO REFINADO) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* COLUNA 1: PADRÃO A (BASELINE OFICIAL) */}
        <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border-2 border-blue-500/40 dark:border-blue-500/30 shadow-[5px_5px_12px_#c3cfe2] dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                PADRÃO A: {padraoA.nome}
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-blue-500/20 text-blue-700 dark:text-blue-300">
              OFICIAL HOMOLOGADO
            </span>
          </div>

          {/* Parâmetros Editáveis do Padrão A */}
          <div className="space-y-3">
            {/* 1. Timer em Movimento */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Timer em Movimento (ignição ON):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={padraoA.timerMovimento}
                  onChange={(e) =>
                    setPadraoA((prev) => ({ ...prev, timerMovimento: Number(e.target.value) }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  {padraoA.timerMovimento}s
                </span>
              </div>
            </div>

            {/* 2. Inflexão de Curva (Ângulo) */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2 font-mono font-bold text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={padraoA.anguloHabilitado}
                  onChange={(e) =>
                    setPadraoA((prev) => ({ ...prev, anguloHabilitado: e.target.checked }))
                  }
                  className="rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                Inflexão de Curva (Ângulo):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="35"
                  step="1"
                  disabled={!padraoA.anguloHabilitado}
                  value={padraoA.anguloGrau}
                  onChange={(e) =>
                    setPadraoA((prev) => ({ ...prev, anguloGrau: Number(e.target.value) }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer disabled:opacity-40"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  {padraoA.anguloHabilitado ? `${padraoA.anguloGrau}°` : "OFF"}
                </span>
              </div>
            </div>

            {/* 3. Janela de Estabilização de Curva */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Janela de Filtro de Curva:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="1"
                  disabled={!padraoA.anguloHabilitado}
                  value={padraoA.anguloIntervalo}
                  onChange={(e) =>
                    setPadraoA((prev) => ({
                      ...prev,
                      anguloIntervalo: Math.min(60, Math.max(10, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer disabled:opacity-40"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  {padraoA.anguloIntervalo}s
                </span>
              </div>
            </div>

            {/* 4. Modo de Economia em Repouso (SENDS) */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Economia em Repouso (SENDS):
              </span>
              <label className="flex items-center gap-2 font-mono font-bold cursor-pointer text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={padraoA.modoEconomiaParada}
                  onChange={(e) =>
                    setPadraoA((prev) => ({ ...prev, modoEconomiaParada: e.target.checked }))
                  }
                  className="rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                {padraoA.modoEconomiaParada ? "SENDS=1 (Ativo)" : "SENDS=0 (Contínuo)"}
              </label>
            </div>

            {/* 5. Heartbeat Movimento */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Heartbeat em Movimento:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="30"
                  max="300"
                  step="10"
                  value={padraoA.hbtLigado}
                  onChange={(e) =>
                    setPadraoA((prev) => ({
                      ...prev,
                      hbtLigado: Math.min(300, Math.max(30, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  {padraoA.hbtLigado}s
                </span>
              </div>
            </div>

            {/* 6. Heartbeat em Repouso */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Heartbeat Parado (Repouso):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={padraoA.hbtDesligado}
                  onChange={(e) =>
                    setPadraoA((prev) => ({
                      ...prev,
                      hbtDesligado: Math.min(600, Math.max(60, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  {padraoA.hbtDesligado}s
                </span>
              </div>
            </div>

            {/* 7. Timer em Repouso / Garagem */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Timer na Garagem (Repouso):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="60"
                  max="3600"
                  step="60"
                  value={padraoA.timerParado}
                  onChange={(e) =>
                    setPadraoA((prev) => ({
                      ...prev,
                      timerParado: Math.min(3600, Math.max(60, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  {padraoA.timerParado}s
                </span>
              </div>
            </div>

            {/* 8. Sensibilidade G-Sensor */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Sensibilidade G-Sensor:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={padraoA.sensibilidadeGSensor}
                  onChange={(e) =>
                    setPadraoA((prev) => ({
                      ...prev,
                      sensibilidadeGSensor: Number(e.target.value),
                    }))
                  }
                  className="w-24 accent-blue-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-blue-600 dark:text-blue-400">
                  L{padraoA.sensibilidadeGSensor}
                </span>
              </div>
            </div>

            {/* 9. Telemetria MCU / Odômetro */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Telemetria Estendida (MCU):
              </span>
              <label className="flex items-center gap-2 font-mono font-bold cursor-pointer text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={padraoA.pacoteEstendidoIexvol}
                  onChange={(e) =>
                    setPadraoA((prev) => ({ ...prev, pacoteEstendidoIexvol: e.target.checked }))
                  }
                  className="rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                {padraoA.pacoteEstendidoIexvol ? "0x94 MCU (104b)" : "Básico (94b)"}
              </label>
            </div>
          </div>

          {/* Cards de Métricas do Padrão A */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-300/60 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Consumo Total (com Basal)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
                  {metricasA.mbTotaisMes} MB
                </span>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    metricasA.violouMargemSeguranca
                      ? "text-red-500"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {metricasA.percentualFranquia}% de 20MB
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                Variável: {metricasA.mbVariavelMes} MB + Basal: 2.8 MB
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Fidelidade dos Dados
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
                  {metricasA.scoreQualidadeTotal} / 100
                </span>
                <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                  {metricasA.curvasDetectadasPct}% curvas OK
                </span>
              </div>
              <div
                className={`text-[9px] font-mono mt-0.5 ${
                  metricasA.pingsEspuriosRetaDia > 0
                    ? "text-amber-600 dark:text-amber-400 font-bold"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {metricasA.pingsEspuriosRetaDia > 0
                  ? `Jitter na reta: ~${metricasA.pingsEspuriosRetaDia} pings falsos/dia`
                  : "Ruído na reta: 0 pings espúrios"}
              </div>
            </div>
          </div>
        </div>

        {/* COLUNA 2: PADRÃO B (CANDIDATO / PERSONALIZADO) */}
        <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border-2 border-purple-500/40 dark:border-purple-500/30 shadow-[5px_5px_12px_#c3cfe2] dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                PADRÃO B: {padraoB.nome}
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-purple-500/20 text-purple-700 dark:text-purple-300">
              CANDIDATO A HOMOLOGAÇÃO
            </span>
          </div>

          {/* Parâmetros Editáveis do Padrão B */}
          <div className="space-y-3">
            {/* 1. Timer em Movimento */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Timer em Movimento (ignição ON):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="1"
                  value={padraoB.timerMovimento}
                  onChange={(e) =>
                    setPadraoB((prev) => ({ ...prev, timerMovimento: Number(e.target.value) }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  {padraoB.timerMovimento}s
                </span>
              </div>
            </div>

            {/* 2. Inflexão de Curva (Ângulo) */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2 font-mono font-bold text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={padraoB.anguloHabilitado}
                  onChange={(e) =>
                    setPadraoB((prev) => ({ ...prev, anguloHabilitado: e.target.checked }))
                  }
                  className="rounded text-purple-600 accent-purple-600 cursor-pointer"
                />
                Inflexão de Curva (Ângulo):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="35"
                  step="1"
                  disabled={!padraoB.anguloHabilitado}
                  value={padraoB.anguloGrau}
                  onChange={(e) =>
                    setPadraoB((prev) => ({ ...prev, anguloGrau: Number(e.target.value) }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer disabled:opacity-40"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  {padraoB.anguloHabilitado ? `${padraoB.anguloGrau}°` : "OFF"}
                </span>
              </div>
            </div>

            {/* 3. Janela de Estabilização de Curva */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Janela de Filtro de Curva:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="1"
                  disabled={!padraoB.anguloHabilitado}
                  value={padraoB.anguloIntervalo}
                  onChange={(e) =>
                    setPadraoB((prev) => ({
                      ...prev,
                      anguloIntervalo: Math.min(60, Math.max(10, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer disabled:opacity-40"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  {padraoB.anguloIntervalo}s
                </span>
              </div>
            </div>

            {/* 4. Modo de Economia em Repouso (SENDS) */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Economia em Repouso (SENDS):
              </span>
              <label className="flex items-center gap-2 font-mono font-bold cursor-pointer text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={padraoB.modoEconomiaParada}
                  onChange={(e) =>
                    setPadraoB((prev) => ({ ...prev, modoEconomiaParada: e.target.checked }))
                  }
                  className="rounded text-purple-600 accent-purple-600 cursor-pointer"
                />
                {padraoB.modoEconomiaParada ? "SENDS=1 (Ativo)" : "SENDS=0 (Contínuo)"}
              </label>
            </div>

            {/* 5. Heartbeat Movimento */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Heartbeat em Movimento:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="30"
                  max="300"
                  step="10"
                  value={padraoB.hbtLigado}
                  onChange={(e) =>
                    setPadraoB((prev) => ({
                      ...prev,
                      hbtLigado: Math.min(300, Math.max(30, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  {padraoB.hbtLigado}s
                </span>
              </div>
            </div>

            {/* 6. Heartbeat em Repouso */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Heartbeat Parado (Repouso):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={padraoB.hbtDesligado}
                  onChange={(e) =>
                    setPadraoB((prev) => ({
                      ...prev,
                      hbtDesligado: Math.min(600, Math.max(60, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  {padraoB.hbtDesligado}s
                </span>
              </div>
            </div>

            {/* 7. Timer em Repouso / Garagem */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Timer na Garagem (Repouso):
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="60"
                  max="3600"
                  step="60"
                  value={padraoB.timerParado}
                  onChange={(e) =>
                    setPadraoB((prev) => ({
                      ...prev,
                      timerParado: Math.min(3600, Math.max(60, Number(e.target.value))),
                    }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  {padraoB.timerParado}s
                </span>
              </div>
            </div>

            {/* 8. Sensibilidade G-Sensor */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Sensibilidade G-Sensor:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={padraoB.sensibilidadeGSensor}
                  onChange={(e) =>
                    setPadraoB((prev) => ({
                      ...prev,
                      sensibilidadeGSensor: Number(e.target.value),
                    }))
                  }
                  className="w-24 accent-purple-600 cursor-pointer"
                />
                <span className="w-12 text-right font-mono font-black text-purple-600 dark:text-purple-400">
                  L{padraoB.sensibilidadeGSensor}
                </span>
              </div>
            </div>

            {/* 9. Telemetria MCU / Odômetro */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                Telemetria Estendida (MCU):
              </span>
              <label className="flex items-center gap-2 font-mono font-bold cursor-pointer text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={padraoB.pacoteEstendidoIexvol}
                  onChange={(e) =>
                    setPadraoB((prev) => ({ ...prev, pacoteEstendidoIexvol: e.target.checked }))
                  }
                  className="rounded text-purple-600 accent-purple-600 cursor-pointer"
                />
                {padraoB.pacoteEstendidoIexvol ? "0x94 MCU (104b)" : "Básico (94b)"}
              </label>
            </div>
          </div>

          {/* Cards de Métricas do Padrão B */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-300/60 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Consumo Total (com Basal)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono text-purple-600 dark:text-purple-400">
                  {metricasB.mbTotaisMes} MB
                </span>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    metricasB.violouMargemSeguranca
                      ? "text-red-500 font-black animate-pulse"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {metricasB.percentualFranquia}% de 20MB
                </span>
              </div>
              <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                Variável: {metricasB.mbVariavelMes} MB + Basal: 2.8 MB
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Fidelidade dos Dados
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
                  {metricasB.scoreQualidadeTotal} / 100
                </span>
                <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400">
                  {metricasB.curvasDetectadasPct}% curvas OK
                </span>
              </div>
              <div
                className={`text-[9px] font-mono mt-0.5 ${
                  metricasB.pingsEspuriosRetaDia > 0
                    ? "text-amber-600 dark:text-amber-400 font-bold"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {metricasB.pingsEspuriosRetaDia > 0
                  ? `Jitter na reta: ~${metricasB.pingsEspuriosRetaDia} pings falsos/dia`
                  : "Ruído na reta: 0 pings espúrios"}
              </div>
            </div>
          </div>

          {/* Ações de Implementação e Uso do Padrão B */}
          <div className="pt-2 border-t border-purple-500/20 flex flex-col sm:flex-row items-center gap-2">
            <button
              type="button"
              onClick={() => handleUsarNosParametrosCanonicos(padraoB)}
              className="w-full sm:flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold font-mono transition active:scale-95 cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              title="Carrega estes parâmetros na aba de Parâmetros Canônicos do Sistema para testes ou envio aos rastreadores"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Usar nos Parâmetros Canônicos</span>
            </button>

            <button
              type="button"
              onClick={() => handleCopiarComandosRapido(padraoB)}
              className="w-full sm:w-auto py-2 px-3 rounded-xl border border-purple-500/40 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-bold font-mono transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              title="Copia os comandos do Padrão B para implementação física no dispositivo"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Copiar Comandos</span>
            </button>

            <button
              type="button"
              onClick={() => handleAbrirModalComandos(padraoB)}
              className="w-full sm:w-auto py-2 px-3 rounded-xl border border-purple-500/40 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-bold font-mono transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              title="Ver detalhes dos comandos para o dispositivo"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Ver Comandos</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* GRÁFICOS COMPARATIVOS: CONSUMO vs MARGEM DE SEGURANÇA E FIDELIDADE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* GRÁFICO 1: CONSUMO MENSAL PROJETADO vs MARGEM DE 16 MB E TETO DE 20 MB */}
        <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_12px_#c3cfe2] dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Activity className="h-4 w-4 text-pink-500" />
              GRÁFICO DE CONSUMO M2M (TETO 20 MB/MÊS)
            </h4>
            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
              Com Custo Basal da Operadora (+2.8 MB)
            </span>
          </div>

          <div className="space-y-4 pt-1">
            {/* Barra do Padrão A */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  Padrão A (Oficial Homologado)
                </span>
                <span className="font-black text-slate-800 dark:text-slate-200">
                  {metricasA.mbTotaisMes} MB ({metricasA.percentualFranquia}%)
                </span>
              </div>
              <div className="h-5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metricasA.violouMargemSeguranca
                      ? "bg-red-500"
                      : "bg-linear-to-r from-blue-500 to-blue-600"
                  }`}
                  style={{ width: `${Math.min(100, (metricasA.mbTotaisMes / 25) * 100)}%` }}
                />
                {/* Linha Amarela: Limite Seguro de 16 MB (64% da escala até 25MB) */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                  style={{ left: "64%" }}
                  title="Buffer de Segurança: 16.0 MB (80%)"
                />
                {/* Linha Vermelha: Teto Estrito de 20 MB (80% da escala até 25MB) */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                  style={{ left: "80%" }}
                  title="Teto Franquia: 20.0 MB"
                />
              </div>
            </div>

            {/* Barra do Padrão B */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  Padrão B (Candidato)
                </span>
                <span className="font-black text-slate-800 dark:text-slate-200">
                  {metricasB.mbTotaisMes} MB ({metricasB.percentualFranquia}%)
                </span>
              </div>
              <div className="h-5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metricasB.estourouFranquia
                      ? "bg-red-600 animate-pulse"
                      : metricasB.violouMargemSeguranca
                        ? "bg-amber-500"
                        : "bg-linear-to-r from-purple-500 to-purple-600"
                  }`}
                  style={{ width: `${Math.min(100, (metricasB.mbTotaisMes / 25) * 100)}%` }}
                />
                {/* Linha Amarela: Limite Seguro de 16 MB */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                  style={{ left: "64%" }}
                  title="Buffer de Segurança: 16.0 MB (80%)"
                />
                {/* Linha Vermelha: Teto Estrito de 20 MB */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                  style={{ left: "80%" }}
                  title="Teto Franquia: 20.0 MB"
                />
              </div>
            </div>

            {/* Legenda Informativa */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                Linha Amarela = Limite Seguro com Buffer 20% (16.0 MB)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                Linha Vermelha = Franquia Máxima (20.0 MB)
              </span>
            </div>
          </div>
        </div>

        {/* GRÁFICO 2: FIDELIDADE E QUALIDADE DOS DADOS (SCORE 0 a 100) */}
        <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_12px_#c3cfe2] dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              GRÁFICO DE QUALIDADE DOS DADOS (FIDELIDADE VIÁRIA)
            </h4>
            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
              Escala 0 a 100
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {/* Comparativo de Resolução em Curvas */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1 text-slate-600 dark:text-slate-400">
                <span>Resolução em Curvas Viárias (Vértices 90°):</span>
                <span>
                  A: <b className="text-blue-500">{metricasA.curvasDetectadasPct}%</b> vs B:{" "}
                  <b className="text-purple-500">{metricasB.curvasDetectadasPct}%</b>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${metricasA.curvasDetectadasPct}%` }}
                  />
                </div>
                <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${metricasB.curvasDetectadasPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Comparativo de Resolução Temporal */}
            <div>
              <div className="flex justify-between text-xs font-mono mb-1 text-slate-600 dark:text-slate-400">
                <span>Granularidade Temporal (Paradas e Semáforos):</span>
                <span>
                  A: <b className="text-blue-500">{metricasA.scoreTemporal}/35</b> vs B:{" "}
                  <b className="text-purple-500">{metricasB.scoreTemporal}/35</b>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${(metricasA.scoreTemporal / 35) * 100}%` }}
                  />
                </div>
                <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full"
                    style={{ width: `${(metricasB.scoreTemporal / 35) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Score Final Ponderado */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around text-center">
              <div>
                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-bold uppercase">
                  Score Padrão A
                </span>
                <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {metricasA.scoreQualidadeTotal}{" "}
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>

              <div className="h-8 w-px bg-slate-300 dark:bg-slate-800" />

              <div>
                <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 font-bold uppercase">
                  Score Padrão B
                </span>
                <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {metricasB.scoreQualidadeTotal}{" "}
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* PREMISSA DE TELECOMUNICAÇÃO M2M: REPOUSO NA GARAGEM vs CONDUÇÃO */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_12px_#c3cfe2] dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-300/60 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Radio className="h-4 w-4" />
            </span>
            <div>
              <h4 className="text-xs font-mono font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                PREMISSA DE TELECOMUNICAÇÃO M2M (REPOUSO CELULAR NA GARAGEM)
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Comprovado no Lara
                </span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Na operadora celular, cada rajada de rádio em repouso fatura ~4 KB (Sinalização RRC
                + TCP/IP + CDR). O veículo parado consome ~1,45 MB/dia se o Heartbeat for de 240s.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <Wifi className="h-3.5 w-3.5 text-sky-500" />
            <span>
              IP Fixo Dedicado: <b className="text-slate-800 dark:text-slate-200">167.234.233.82</b>{" "}
              (Zero DNS)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Confrontação Padrão A */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Padrão A: {padraoA.nome}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                HBT Desligado: {padraoA.hbtDesligado}s ({Math.round(padraoA.hbtDesligado / 60)} min)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[9px] font-mono text-slate-400 block">Pings Repouso/Dia</span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">
                  {diagTelecomA.transmissoesRepousoPorDia}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[9px] font-mono text-slate-400 block">
                  Consumo Repouso/Dia
                </span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">
                  {diagTelecomA.mbRepousoPorDia} MB
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[9px] font-mono text-slate-400 block">
                  Projeção Mês Garagem
                </span>
                <span
                  className={`text-sm font-black font-mono ${diagTelecomA.riscoEstouroRepouso ? "text-red-500" : "text-emerald-500"}`}
                >
                  {diagTelecomA.mbRepousoPorMes} MB
                </span>
              </div>
            </div>

            <p
              className={`text-[10px] font-mono leading-relaxed p-2 rounded-lg ${diagTelecomA.riscoEstouroRepouso ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"}`}
            >
              {diagTelecomA.alertaMensagem}
            </p>
          </div>

          {/* Confrontação Padrão B */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                Padrão B: {padraoB.nome}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                HBT Desligado: {padraoB.hbtDesligado}s ({Math.round(padraoB.hbtDesligado / 60)} min)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[9px] font-mono text-slate-400 block">Pings Repouso/Dia</span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">
                  {diagTelecomB.transmissoesRepousoPorDia}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[9px] font-mono text-slate-400 block">
                  Consumo Repouso/Dia
                </span>
                <span className="text-sm font-black font-mono text-slate-800 dark:text-slate-200">
                  {diagTelecomB.mbRepousoPorDia} MB
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/40">
                <span className="text-[9px] font-mono text-slate-400 block">
                  Projeção Mês Garagem
                </span>
                <span
                  className={`text-sm font-black font-mono ${diagTelecomB.riscoEstouroRepouso ? "text-red-500" : "text-emerald-500"}`}
                >
                  {diagTelecomB.mbRepousoPorMes} MB
                </span>
              </div>
            </div>

            <p
              className={`text-[10px] font-mono leading-relaxed p-2 rounded-lg ${diagTelecomB.riscoEstouroRepouso ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"}`}
            >
              {diagTelecomB.alertaMensagem}
            </p>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BANCADA DINÂMICA DE TESTE SIMULTÂNEO COM DINÂMICA VEICULAR */}
      {/* POSICIONADA NO TOPO ACIMA DOS PADRÕES A E B COM TELEMETRIA AO VIVO */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-300/60 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                PASSO 3: Bancada Dinâmica de Teste Físico em Pista (Veículo 1 vs Veículo 2)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Simula oscilação contínua na reta (camber e vento), frenagem gradual até semáforo
                (ZVU) e guinada no espaço-tempo
              </p>
            </div>
          </div>

          {/* Controles de Simulação */}
          <div className="flex items-center gap-2">
            {/* Seletor de Aceleração do Tempo */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-300/60 dark:border-slate-700">
              <FastForward className="h-3.5 w-3.5 text-amber-500 ml-1" />
              {[1, 10, 30, 60].map((vel) => (
                <button
                  key={vel}
                  type="button"
                  onClick={() => setAceleracaoTempo(vel)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-black transition cursor-pointer ${
                    aceleracaoTempo === vel
                      ? "bg-amber-500 text-slate-950 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  {vel}x
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAlternarSimulacaoAoVivo}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
                simulacaoAoVivo
                  ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {simulacaoAoVivo ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>{simulacaoAoVivo ? "Pausar" : "Iniciar Teste Físico"}</span>
            </button>

            <button
              type="button"
              onClick={handleReiniciarSimulacaoAoVivo}
              className="p-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              title="Zerar simulação"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Premissas da Frota (Segunda Imagem: TRÂNSITO e VEÍCULO) ACIMA dos Veículos 1 e 2 */}
        <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between flex-wrap gap-3 min-h-[48px]">
          <div className="flex flex-wrap items-center gap-3">
            {/* Horas em Movimento */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                TRÂNSITO:
              </span>
              <div className="flex items-center gap-1">
                {[2, 4, 8, 12, 16].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setPerfilUso((prev) => ({ ...prev, horasMovimentoPorDia: h }))}
                    className={`px-2 py-1 rounded-lg text-xs font-mono font-black transition cursor-pointer ${
                      perfilUso.horasMovimentoPorDia === h
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                    }`}
                  >
                    {h}h/dia
                  </button>
                ))}
              </div>
            </div>

            {/* Seletor de Tipo de Veículo (Carro vs Moto) */}
            <div className="flex items-center gap-2 border-l border-slate-300/60 dark:border-slate-800 pl-3">
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                VEÍCULO:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPerfilUso((prev) => ({ ...prev, tipoVeiculo: "carro" }));
                    toast.info("Modo Carro ativo (oscilações viárias típicas de ±4° a ±8°).");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black transition cursor-pointer flex items-center gap-1.5 ${
                    perfilUso.tipoVeiculo === "carro"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                  }`}
                >
                  <Car className="h-3.5 w-3.5" />
                  <span>Carro</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerfilUso((prev) => ({ ...prev, tipoVeiculo: "moto" }));
                    toast.warning(
                      "Modo Moto ativo! Equilíbrio de corredor e inclinações geram oscilações de até ±14° na reta.",
                    );
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black transition cursor-pointer flex items-center gap-1.5 ${
                    perfilUso.tipoVeiculo === "moto"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                  }`}
                >
                  <Bike className="h-3.5 w-3.5" />
                  <span>Moto</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Painéis dos Dois Veículos Virtuais Confrontados (VEÍCULO 1 · PADRÃO A vs VEÍCULO 2 · PADRÃO B) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Veículo A (Padrão Oficial) */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-blue-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                VEÍCULO 1 · PADRÃO A ({padraoA.timerMovimento}s / {padraoA.anguloGrau}°)
              </span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Filtro Angular:{" "}
                {padraoA.anguloHabilitado
                  ? `${padraoA.anguloGrau}° (${padraoA.anguloIntervalo}s)`
                  : "OFF"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                <span className="text-[9px] text-slate-500">Odômetro</span>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {veiculoASim.odometroKm.toFixed(2)} km
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                <span className="text-[9px] text-slate-500">Pacotes Tx</span>
                <div className="text-sm font-black text-blue-600 dark:text-blue-400">
                  {veiculoASim.pacotesGps + veiculoASim.pacotesHbt}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                <span className="text-[9px] text-slate-500">Bytes Rede</span>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {(veiculoASim.bytesTotais / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>
                Pings em Curvas Reais: <b>{veiculoASim.pingsCurvaReais}</b>
              </span>
              <span
                className={
                  veiculoASim.pingsEspuriosReta === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 font-bold"
                }
              >
                Pings Falsos na Reta: <b>{veiculoASim.pingsEspuriosReta}</b>{" "}
                {veiculoASim.pingsEspuriosReta === 0 ? "(Zero jitter)" : "(Jitter detectado)"}
              </span>
            </div>
          </div>

          {/* Veículo B (Padrão Candidato) */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-purple-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
                VEÍCULO 2 · PADRÃO B ({padraoB.timerMovimento}s / {padraoB.anguloGrau}°)
              </span>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Limiar Angular:{" "}
                {padraoB.anguloHabilitado
                  ? `${padraoB.anguloGrau}° (${padraoB.anguloIntervalo}s)`
                  : "OFF"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                <span className="text-[9px] text-slate-500">Odômetro</span>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {veiculoBSim.odometroKm.toFixed(2)} km
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                <span className="text-[9px] text-slate-500">Pacotes Tx</span>
                <div className="text-sm font-black text-purple-600 dark:text-purple-400">
                  {veiculoBSim.pacotesGps + veiculoBSim.pacotesHbt}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900/50">
                <span className="text-[9px] text-slate-500">Bytes Rede</span>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {(veiculoBSim.bytesTotais / 1024).toFixed(1)} KB
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>
                Pings em Curvas Reais: <b>{veiculoBSim.pingsCurvaReais}</b>
              </span>
              <span
                className={
                  veiculoBSim.pingsEspuriosReta === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 font-bold"
                }
              >
                Pings Falsos na Reta: <b>{veiculoBSim.pingsEspuriosReta}</b>{" "}
                {veiculoBSim.pingsEspuriosReta === 0 ? "(Zero jitter)" : "(Jitter detectado)"}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetria Física Dinâmica da Pista (ABAIXO dos Veículos 1 e 2) */}
        <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between flex-wrap gap-3 min-h-[48px]">
          <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
            <div className="flex items-center gap-1.5 min-w-[105px]">
              <Gauge className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Vel:</span>
              <b className="text-slate-900 dark:text-slate-100 font-mono">
                {telemetriaFisicaVisual.velocidade} km/h
              </b>
            </div>

            <div className="flex items-center gap-1.5 min-w-[85px]">
              <Compass className="h-4 w-4 text-purple-500 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Rumo:</span>
              <b className="text-slate-900 dark:text-slate-100 font-mono">
                {telemetriaFisicaVisual.cursoInstantaneo}°
              </b>
            </div>

            <div className="flex items-center gap-1.5 min-w-[210px]">
              <Activity className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Estado:</span>
              <span
                className="font-bold text-amber-600 dark:text-amber-400"
                title={telemetriaFisicaVisual.estado}
              >
                {telemetriaFisicaVisual.estado}
              </span>
            </div>
          </div>
        </div>

        {/* Chips dos 10 Cenários de Teste Holístico da Pista */}
        <div className="flex items-center gap-1.5 flex-wrap px-1 text-[10px] font-mono">
          <span className="text-slate-400 font-bold uppercase tracking-wider">Cenários:</span>
          {[
            { nome: "Reta Asfalto", tMin: 0, tMax: 30 },
            { nome: "Aclive (+35m)", tMin: 31, tMax: 60 },
            { nome: "Declive (-35m)", tMin: 61, tMax: 90 },
            { nome: "Rotatória 360°", tMin: 91, tMax: 132 },
            { nome: "Túnel GNSS", tMin: 133, tMax: 160 },
            { nome: "Esquina 90°", tMin: 161, tMax: 190 },
            { nome: "Estrada de Chão", tMin: 191, tMax: 220 },
            { nome: "ZVU Para-e-Anda", tMin: 221, tMax: 250 },
            { nome: "Baliza e Ré", tMin: 251, tMax: 280 },
            { nome: "Garagem ACC OFF", tMin: 281, tMax: 300 },
          ].map((c) => {
            const tModulo = tempoSimuladoSegundos % 300;
            const ativo = tModulo >= c.tMin && tModulo <= c.tMax && tempoSimuladoSegundos > 0;
            return (
              <span
                key={c.nome}
                className={`px-2 py-0.5 rounded-md font-bold transition-all duration-300 ${
                  ativo
                    ? "bg-blue-600 text-white shadow-xs scale-105"
                    : "bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                {c.nome}
              </span>
            );
          })}
        </div>

        {/* PLACAR DE CONFRONTO DA PROVA DE PISTA ABAIXO DA TELEMETRIA */}
        <div className="p-3 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-300/80 dark:border-slate-700 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="font-bold text-slate-900 dark:text-slate-100">
              RESULTADO DO DUELO DE PISTA:
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {tempoSimuladoSegundos === 0
                ? "Bancada pronta. Inicie o teste físico para confrontar os disparos em curvas e na reta."
                : veiculoASim.pingsEspuriosReta > 0 && veiculoBSim.pingsEspuriosReta === 0
                  ? `Veículo 2 venceu com 0 pings falsos na reta contra ${veiculoASim.pingsEspuriosReta} disparos indevidos do Veículo 1 (Jitter filtrado com sucesso).`
                  : veiculoBSim.pingsEspuriosReta > 0 && veiculoASim.pingsEspuriosReta === 0
                    ? `Veículo 1 venceu com 0 pings falsos na reta contra ${veiculoBSim.pingsEspuriosReta} disparos indevidos do Veículo 2 (Jitter detectado no candidato).`
                    : veiculoASim.pingsEspuriosReta > 0 && veiculoBSim.pingsEspuriosReta > 0
                      ? `Empate com ruído: Veículo 1 teve ${veiculoASim.pingsEspuriosReta} pings falsos e Veículo 2 teve ${veiculoBSim.pingsEspuriosReta} pings falsos na reta.`
                      : "Ambos os padrões mantiveram estabilidade na reta sem disparos espúrios (Filtros operando com estabilidade)."}
            </span>
          </div>

          <div className="text-[11px] font-bold text-right shrink-0">
            {tempoSimuladoSegundos === 0 ? (
              <span className="text-slate-400 dark:text-slate-500">Aguardando telemetria...</span>
            ) : veiculoBSim.bytesTotais > veiculoASim.bytesTotais ? (
              <span className="text-red-500">
                Veículo 2 gastou +
                {(
                  ((veiculoBSim.bytesTotais - veiculoASim.bytesTotais) /
                    Math.max(1, veiculoASim.bytesTotais)) *
                  100
                ).toFixed(0)}
                % mais dados de rede
              </span>
            ) : (
              <span className="text-blue-500">Consumo de rede equilibrado</span>
            )}
          </div>
        </div>

        {/* Resumo do Tempo e da Dinâmica Física */}
        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
          <span>
            Tempo Simulado:{" "}
            <b>
              {Math.floor(tempoSimuladoSegundos / 60)}m {tempoSimuladoSegundos % 60}s
            </b>{" "}
            (Velocidade {aceleracaoTempo}x)
          </span>
          <span className="text-slate-500">
            Física ativa: aceleração gradual, inércia ZVU e micro-oscilações de asfalto
            sincronizadas
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* GRÁFICOS DE BARRAS VERTICAIS PARAMÉTRICOS (PADRÃO A vs SIMULADO B) */}
      {/* POSICIONADO ACIMA DO PADRÃO A E B COM APONTAMENTO DE ERROS E FALHAS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-xl space-y-4">
        {/* Selo de Estabilização Estatística Invariante com o Tempo */}
        <div className="p-3 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 font-mono text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2">
            {tempoSimuladoSegundos >= 60 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
            )}
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100 mr-2">
                {tempoSimuladoSegundos >= 60 ? "TESTE ESTABILIZADO:" : "CONVERGÊNCIA EM ANDAMENTO:"}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {tempoSimuladoSegundos >= 60
                  ? `Convergência estatística atingida (${Math.floor(tempoSimuladoSegundos / 60)}m ${tempoSimuladoSegundos % 60}s simulados). As taxas por km, taxas horárias e projeção mensal estão consolidadas e permanecerão invariantes mesmo após horas adicionais de teste.`
                  : `Coletando telemetria contínua da pista (${tempoSimuladoSegundos}s / 60s). Os gráficos convergirão para o regime permanente após 60 segundos de circuito.`}
              </span>
            </div>
          </div>
          <div className="text-[11px] font-bold shrink-0">
            {tempoSimuladoSegundos >= 60 ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                Invariante no Tempo
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                Alimentando Gráficos...
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-300/60 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                PASSO 4: Comparativo Visual de Parâmetros (Padrão Oficial vs Simulado) e Telemetria
                Estabilizada
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  {perfilUso.tipoVeiculo === "moto" ? (
                    <>
                      <Bike className="h-3 w-3" />
                      Física de Moto Ativa
                    </>
                  ) : (
                    <>
                      <Car className="h-3 w-3" />
                      Física de Carro Ativa
                    </>
                  )}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Gráficos verticais de barras comparativas com diagnóstico de integridade física e
                apontamento direto de falhas
              </p>
            </div>
          </div>

          {/* Legenda das Barras Verticais */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
              <span className="w-3 h-3 rounded bg-blue-500 inline-block shadow-xs" />
              Padrão A (Oficial)
            </span>
            <span className="flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400">
              <span className="w-3 h-3 rounded bg-purple-500 inline-block shadow-xs" />
              Simulado B (Candidato)
            </span>
          </div>
        </div>

        {/* Grade com os 7 Parâmetros em Gráficos de Barra Verticais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {graficosVerticaisParametros.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between space-y-2 shadow-xs"
            >
              {/* Nome do Parâmetro */}
              <div className="text-center border-b border-slate-100 dark:border-slate-700/60 pb-1.5">
                <span className="text-[11px] font-mono font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight line-clamp-1">
                  {item.nome}
                </span>
              </div>

              {/* Área do Gráfico de Barra Vertical */}
              <div className="h-32 flex items-end justify-center gap-3 px-2 py-1 bg-slate-50 dark:bg-slate-900/40 rounded-lg relative">
                {/* Linha de Referência se for Consumo M2M */}
                {item.id === "consumo-m2m" && (
                  <>
                    <div
                      className="absolute left-0 right-0 border-b border-dashed border-amber-400 z-10"
                      style={{ bottom: "64%" }}
                      title="Margem Segura: 16 MB"
                    />
                    <div
                      className="absolute left-0 right-0 border-b border-dashed border-red-500 z-10"
                      style={{ bottom: "80%" }}
                      title="Teto Franquia: 20 MB"
                    />
                  </>
                )}

                {/* Coluna Padrão A */}
                <div className="flex flex-col items-center flex-1 h-full justify-end">
                  <span className="text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400 mb-1 text-center whitespace-nowrap">
                    {item.textoA}
                  </span>
                  <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-t h-full flex items-end overflow-hidden">
                    <div
                      className="w-full bg-linear-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-500 shadow-xs"
                      style={{ height: `${item.alturaPctA}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono font-bold text-slate-500 mt-1">A</span>
                </div>

                {/* Coluna Simulado B */}
                <div className="flex flex-col items-center flex-1 h-full justify-end">
                  <span
                    className={`text-[9px] font-mono font-bold mb-1 text-center whitespace-nowrap ${
                      item.tipo === "falha"
                        ? "text-red-500 font-black"
                        : item.tipo === "alerta"
                          ? "text-amber-500 font-black"
                          : "text-purple-600 dark:text-purple-400"
                    }`}
                  >
                    {item.textoB}
                  </span>
                  <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-t h-full flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-t transition-all duration-500 shadow-xs ${
                        item.tipo === "falha"
                          ? "bg-linear-to-t from-red-600 to-red-400 animate-pulse"
                          : item.tipo === "alerta"
                            ? "bg-linear-to-t from-amber-600 to-amber-400"
                            : "bg-linear-to-t from-purple-600 to-purple-400"
                      }`}
                      style={{ height: `${item.alturaPctB}%` }}
                    />
                  </div>
                  <span
                    className={`text-[9px] font-mono font-bold mt-1 ${
                      item.tipo === "falha"
                        ? "text-red-500"
                        : item.tipo === "alerta"
                          ? "text-amber-500"
                          : "text-slate-500"
                    }`}
                  >
                    B
                  </span>
                </div>
              </div>

              {/* Apontamento de Erros e Falhas */}
              <div
                className={`p-1.5 rounded-lg border text-[10px] font-mono leading-tight flex items-start gap-1 min-h-[46px] ${
                  item.tipo === "falha"
                    ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                    : item.tipo === "alerta"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {item.tipo === "falha" ? (
                  <AlertOctagon className="h-3 w-3 mt-0.5 shrink-0 text-red-500" />
                ) : item.tipo === "alerta" ? (
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500" />
                )}
                <span>{item.diagnostico}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* PASSO 5: VEREDITO FINAL CONSOLIDADO & MODO CANÔNICO */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* BLOCO 1: PROBLEMAS E RISCOS DETECTADOS */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-red-500/30 dark:border-red-500/20 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono font-black text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span>PROBLEMAS E RISCOS DETECTADOS</span>
          </div>

          <div className="space-y-2 text-xs">
            {diagnostico.problemasB.length > 0 ? (
              diagnostico.problemasB.map((prob, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 font-mono text-[11px] flex items-start gap-2"
                >
                  <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
                  <span>
                    <b>Padrão B:</b> {prob}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Nenhum risco detectado no Padrão B (dentro da margem de segurança).</span>
              </div>
            )}

            {diagnostico.problemasA.length > 0 &&
              diagnostico.problemasA.map((prob, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[11px] flex items-start gap-2"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    <b>Padrão A:</b> {prob}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* BLOCO 2: VANTAGENS IDENTIFICADAS */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border border-emerald-500/30 dark:border-emerald-500/20 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>VANTAGENS E PONTOS POSITIVOS</span>
          </div>

          <div className="space-y-2 text-xs">
            {diagnostico.vantagensA.map((vant, i) => (
              <div
                key={i}
                className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 font-mono text-[11px] flex items-start gap-2"
              >
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                <span>
                  <b>Padrão A:</b> {vant}
                </span>
              </div>
            ))}

            {diagnostico.vantagensB.map((vant, i) => (
              <div
                key={i}
                className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] flex items-start gap-2"
              >
                <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                <span>
                  <b>Padrão B:</b> {vant}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* BLOCO 3: VEREDITO OFICIAL COM TRAVA RÍGIDA DE ENGENHARIA */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-900 border-2 border-amber-500/50 dark:border-amber-500/40 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-black text-amber-600 dark:text-amber-400">
              <Trophy className="h-4 w-4" />
              <span>VEREDITO DO TESTE COMPARATIVO</span>
            </div>

            <div className="mt-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-500/20 text-xs space-y-2">
              <div className="flex justify-between font-mono">
                <span className="text-slate-500 dark:text-slate-400">Mais Econômico:</span>
                <b className="text-emerald-600 dark:text-emerald-400">
                  {diagnostico.campeaoEconomia}
                </b>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-500 dark:text-slate-400">Maior Fidelidade:</span>
                <b className="text-purple-600 dark:text-purple-400">
                  {diagnostico.campeaoQualidade}
                </b>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase font-bold">
                  Recomendação Técnica:
                </span>
                <div
                  className={`text-sm font-black font-mono mt-0.5 ${
                    diagnostico.vereditoEquilibrio.includes("REJEITADO")
                      ? "text-red-600 dark:text-red-400"
                      : diagnostico.vereditoEquilibrio.includes("APROVADO")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {diagnostico.vereditoEquilibrio}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-mono mt-1 leading-tight">
                  {diagnostico.justificativaVeredito}
                </p>
              </div>
            </div>
          </div>

          {/* Ações de Uso e Implementação do Padrão */}
          <div className="space-y-2 pt-1">
            {/* 1. Usar nos Parâmetros Canônicos do Sistema (para testes e envio) */}
            <button
              type="button"
              onClick={() => handleUsarNosParametrosCanonicos(padraoB)}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-700 text-white transition active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2"
              title="Carrega estes parâmetros diretamente na aba de Parâmetros Canônicos do Sistema"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Usar nos Parâmetros Canônicos</span>
            </button>

            {/* 2. Copiar Comandos para Implementar no Dispositivo */}
            <button
              type="button"
              onClick={() => handleAbrirModalComandos(padraoB)}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider border border-purple-500/40 hover:bg-purple-500/10 text-purple-700 dark:text-purple-300 transition active:scale-95 cursor-pointer shadow-xs flex items-center justify-center gap-2"
              title="Abre os comandos prontos para copiar e programar os dispositivos"
            >
              <Copy className="h-4 w-4" />
              <span>Copiar Comandos do Dispositivo</span>
            </button>

            {/* 3. Botão de Adotar Padrão B como Padrão do Sistema (Bloqueado se violar margem de segurança ou tiver problemas) */}
            <button
              type="button"
              disabled={metricasB.violouMargemSeguranca || diagnostico.problemasB.length > 0}
              onClick={handleAplicarPadraoBComoOficial}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-2 ${
                metricasB.violouMargemSeguranca || diagnostico.problemasB.length > 0
                  ? "bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  : "bg-amber-500 hover:bg-amber-600 text-slate-950"
              }`}
            >
              {metricasB.violouMargemSeguranca ? (
                <>
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  <span>Bloqueado (Viola Margem de 20%)</span>
                </>
              ) : diagnostico.problemasB.length > 0 ? (
                <>
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  <span>Bloqueado (Padrão B com Vícios Detectados)</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Homologar Padrão B no Sistema</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}

      {/* Modal Canônico de Visualização e Cópia de Comandos para Dispositivos */}
      <ModalScriptComandosDispositivo
        aberto={modalComandosAberto}
        onFechar={() => setModalComandosAberto(false)}
        padrao={padraoParaComandos}
        onAplicarParametrosCanonicos={onAplicarParametrosCanonicos}
      />
    </div>
  );
}
