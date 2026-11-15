import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Activity,
  Cpu,
  Layers,
  Radio,
  Zap,
  FastForward,
  Send,
  Terminal,
  SlidersHorizontal,
  Gauge,
  Clock,
  Compass,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Copy,
  Download,
  ShieldCheck,
  Fuel,
  KeyRound,
  RotateCw,
  Minus,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import { TiltCard } from "@/shared/components/TiltCard";
import {
  calcularOdometroMedia1456,
  MotorOdometroPropostaA,
  MotorOdometroPropostaB,
  MotorOdometroPropostaC,
  type TelemetriaPingComparativo,
} from "@/features/monitor-gps/lib/motoresOdometroComparativo";

// ============================================================================
// TIPAGEM CANÔNICA DO SIMULADOR DE CARGA E BANCADA VIRTUAL (GT06 / J16)
// ============================================================================

export type PerfilCenarioSimulacao =
  | "urbano" // Paradas, ZVU, semáforos, curvas de 90° e tráfego municipal
  | "rodovia" // Alta velocidade contínua (Dutra / BR-116)
  | "repouso" // Garagem parada, motor desligado (aferição de ausência de tráfego)
  | "sinuoso" // Curvas acentuadas e zigue-zague para estresse do 7º Medidor Consensual
  | "misto"; // Simulação mista com alternância aleatória dinâmica entre todos os cenários

export interface VeiculoSimulado {
  id: string;
  imei: string;
  placa: string;
  modelo: string;
  corHex: string;
  ativo: boolean;
  latitude: number;
  longitude: number;
  velocidade: number; // km/h
  curso: number; // graus (0-359)
  ignicao: boolean;
  bloqueado: boolean;
  satelites: number;
  tensaoBateria: number; // Volts (ex: 12.6V)
  sinalCsq: number; // 0-31
  // ── Bancada de Medidores em Tempo Real (M1, M4, M5, M6 e Principal 7) ──
  odometroWgs84: number; // Medidor 1: Geodésico WGS-84 Base
  odometroMotorA: number; // Medidor 4: Motor A (Gauss / Curvatura)
  odometroMotorB: number; // Medidor 5: Motor B (Haversine Puro R=6371km)
  odometroMotorC: number; // Medidor 6: Motor C (Taylor 4ª Ordem / EKF)
  odometroPrincipal7: number; // Medidor 7: Média Consensual (M1, M4, M5 e M6)
  // Subcenário aleatório ativo para quando o perfil geral for 'misto'
  cenarioMistoAtual?: "urbano" | "rodovia" | "repouso" | "sinuoso";
  cenarioMistoPassosRestantes?: number;
  // Instâncias dos motores físicos reais
  motorAInstancia: MotorOdometroPropostaA;
  motorBInstancia: MotorOdometroPropostaB;
  motorCInstancia: MotorOdometroPropostaC;
  totalPacotesTx: number;
  totalAcksRx: number;
  ultimoEnvio: string;
}

export interface PacoteGt06Simulado {
  id: string;
  timestamp: string;
  imei: string;
  tipoProtocolo: "0x12 (Login)" | "0x22 (GPS)" | "0x13 (Heartbeat)" | "0x15 (Comando/ACK)";
  hexRaw: string;
  status: "ENVIADO" | "CONFIRMADO" | "TIMEOUT";
  lat?: number;
  lon?: number;
  velocidade?: number;
  ignicao?: boolean;
  descricao: string;
}

// Coordenadas base de referência operacional: Volta Redonda / Sul Fluminense (RJ)
const LAT_BASE = -22.5232;
const LON_BASE = -44.1042;

// Modelos pré-configurados para a frota virtual simulada
const MODELOS_FROTA = [
  "Volvo XC60 T8 Recharge",
  "Toyota Hilux D-4D 4x4",
  "Chevrolet Onix Plus Turbo",
  "Volkswagen T-Cross TSI",
  "Fiat Strada Volcano 1.3",
  "Jeep Compass Longitude TD",
  "Hyundai HB20 Platinum",
  "Renault Master 2.3 dCi",
  "Honda HR-V Touring 1.5",
  "Ford Ranger Limited 3.0",
];

const CORES_FROTA = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#e11d48", // Rose
];

// Cálculo de distância geodésica WGS-84 precisa (em metros)
function calcularDistanciaWgs84Metros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rad = Math.PI / 180.0;
  const phi1 = lat1 * rad;
  const phi2 = lat2 * rad;
  const dPhi = (lat2 - lat1) * rad;
  const dLambda = (lon2 - lon1) * rad;

  const a = 6378137.0;
  const f = 1.0 / 298.257223563;
  const e2 = 2 * f - f * f;

  const phiMedio = (phi1 + phi2) / 2.0;
  const sinPhi = Math.sin(phiMedio);
  const w = Math.sqrt(1.0 - e2 * sinPhi * sinPhi);
  const m = (a * (1.0 - e2)) / (w * w * w);
  const n = a / w;

  const dx = n * Math.cos(phiMedio) * dLambda;
  const dy = m * dPhi;

  return Math.sqrt(dx * dx + dy * dy);
}

// Cálculo de Haversine esférico puro (em metros com R=6371km)
function calcularHaversineMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180.0;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const sinDLat2 = Math.sin(dLat / 2.0);
  const sinDLon2 = Math.sin(dLon / 2.0);
  const a =
    sinDLat2 * sinDLat2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * sinDLon2 * sinDLon2;
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1.0 - a)));
  return R * c;
}

function formatarTempoSimulado(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function AbaSimuladorCargaRastreadores() {
  // Configuração Geral da Simulação
  const [quantidadeVeiculos, setQuantidadeVeiculos] = useState<number>(5);
  const [cenarioAtivo, setCenarioAtivo] = useState<PerfilCenarioSimulacao>("urbano");
  const [frequenciaEnvioSegundos, setFrequenciaEnvioSegundos] = useState<number>(5);
  const [aceleracaoTempo, setAceleracaoTempo] = useState<number>(10); // 1x, 5x, 10x, 30x, 60x
  const [simulacaoRodando, setSimulacaoRodando] = useState<boolean>(false);

  // Lista viva de veículos virtuais
  const [veiculos, setVeiculos] = useState<VeiculoSimulado[]>([]);
  const [veiculoFocoId, setVeiculoFocoId] = useState<string | null>(null);

  // Histórico de pacotes e console
  const [pacotes, setPacotes] = useState<PacoteGt06Simulado[]>([]);
  const [filtroImeiConsole, setFiltroImeiConsole] = useState<string>("todos");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [comandoBancada, setComandoBancada] = useState<string>("STATUS#");

  // Estatísticas agregadas
  const [totalPacotesGerais, setTotalPacotesGerais] = useState<number>(0);
  const [totalAcksGerais, setTotalAcksGerais] = useState<number>(0);
  const [taxaPacotesSegundo, setTaxaPacotesSegundo] = useState<number>(0);
  const [tempoDecorridoSegundos, setTempoDecorridoSegundos] = useState<number>(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const contadorPpsRef = useRef<number>(0);
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);
  const relogioVirtualMsRef = useRef<number>(Date.now());

  // Inicializa a frota simulada com dados realistas onde cada motor reflete sua física acumulada
  const inicializarFrota = useCallback((qtd: number) => {
    const novos: VeiculoSimulado[] = [];
    for (let i = 0; i < qtd; i++) {
      const imeiNum = (865123060000000 + i + 1).toString();
      const placaFormatada = `SIM-0${i + 1 < 10 ? `00${i + 1}` : `0${i + 1}`}`;
      const modelo = MODELOS_FROTA[i % MODELOS_FROTA.length];
      const corHex = CORES_FROTA[i % CORES_FROTA.length];
      const dispersaoLat = (Math.random() - 0.5) * 0.04;
      const dispersaoLon = (Math.random() - 0.5) * 0.04;

      // Odômetro de bancada iniciando rigorosamente em KM ZERO (0.00 km)
      const kmInicialVeiculo = 0.0;

      // Todos os motores iniciam exatamente em zero no início do teste
      const m1 = 0.0;
      const m4 = 0.0;
      const m5 = 0.0;
      const m6 = 0.0;
      const m7 = 0.0;

      const instA = new MotorOdometroPropostaA(0.0);
      const instB = new MotorOdometroPropostaB(0.0);
      const instC = new MotorOdometroPropostaC(0.0);

      novos.push({
        id: `sim-${i + 1}`,
        imei: imeiNum,
        placa: placaFormatada,
        modelo,
        corHex,
        ativo: true,
        latitude: Number((LAT_BASE + dispersaoLat).toFixed(6)),
        longitude: Number((LON_BASE + dispersaoLon).toFixed(6)),
        velocidade: 0,
        curso: Math.floor(Math.random() * 360),
        ignicao: true,
        bloqueado: false,
        satelites: 14 + (i % 6),
        tensaoBateria: 12.6,
        sinalCsq: 26 + (i % 5),
        odometroWgs84: m1,
        odometroMotorA: m4,
        odometroMotorB: m5,
        odometroMotorC: m6,
        odometroPrincipal7: m7,
        cenarioMistoAtual: undefined,
        cenarioMistoPassosRestantes: 0,
        motorAInstancia: instA,
        motorBInstancia: instB,
        motorCInstancia: instC,
        totalPacotesTx: 0,
        totalAcksRx: 0,
        ultimoEnvio: "Aguardando início",
      });
    }
    setVeiculos(novos);
    if (novos.length > 0) {
      setVeiculoFocoId(novos[0].id);
    }
  }, []);

  // Referência para controlar mudanças reais na quantidade de veículos da frota
  const qtdFrotaRef = useRef<number>(quantidadeVeiculos);

  // Inicializa na montagem inicial ou se o usuário alterar explicitamente a quantidade da frota
  // NUNCA reinicializa ao pausar a simulação (preservando 100% dos dados para análise)
  useEffect(() => {
    if (veiculos.length === 0) {
      inicializarFrota(quantidadeVeiculos);
      qtdFrotaRef.current = quantidadeVeiculos;
      return;
    }

    if (qtdFrotaRef.current !== quantidadeVeiculos && !simulacaoRodando) {
      qtdFrotaRef.current = quantidadeVeiculos;
      inicializarFrota(quantidadeVeiculos);
    }
  }, [quantidadeVeiculos, inicializarFrota, simulacaoRodando, veiculos.length]);

  // Função auxiliar para gerar Hex GT06 de login (0x12)
  const gerarHexLoginGt06 = (imei: string): string => {
    const imeiPad = imei.padStart(16, "0");
    return `78 78 0D 12 ${imeiPad.slice(0, 4)} ${imeiPad.slice(4, 8)} ${imeiPad.slice(8, 12)} ${imeiPad.slice(12, 16)} 00 01 C3 B4 0D 0A`.toUpperCase();
  };

  // Função auxiliar para gerar Hex GT06 de localização (0x22)
  const gerarHexGpsGt06 = (
    lat: number,
    lon: number,
    velocidade: number,
    curso: number,
    ignicao: boolean,
  ): string => {
    const latAbs = Math.round(Math.abs(lat) * 1800000)
      .toString(16)
      .padStart(8, "0");
    const lonAbs = Math.round(Math.abs(lon) * 1800000)
      .toString(16)
      .padStart(8, "0");
    const velHex = Math.min(255, Math.round(velocidade)).toString(16).padStart(2, "0");
    const cursoHex = Math.floor(curso % 1024)
      .toString(16)
      .padStart(4, "0");
    const accByte = ignicao ? "02" : "00";

    return `78 78 1F 22 1A 0A 17 0E 15 22 CF ${latAbs.slice(0, 4)} ${latAbs.slice(4, 8)} ${lonAbs.slice(0, 4)} ${lonAbs.slice(4, 8)} ${velHex} ${cursoHex} ${accByte} 00 00 A1 F2 0D 0A`.toUpperCase();
  };

  // Passo de simulação atômica com cálculo físico real em cada motor
  const executarPassoSimulacao = useCallback(() => {
    relogioVirtualMsRef.current += frequenciaEnvioSegundos * 1000;
    const agoraMs = relogioVirtualMsRef.current;
    const agoraStr = formatarHoraBrasil(new Date(agoraMs));
    const dt = frequenciaEnvioSegundos;

    setVeiculos((antigos) => {
      const novosPacotes: PacoteGt06Simulado[] = [];

      const atualizados = antigos.map((v) => {
        if (!v.ativo) return v;

        let deltaLat = 0;
        let deltaLon = 0;
        let novaVelocidade = v.velocidade;
        let novoCurso = v.curso;
        let novaIgnicao = v.ignicao;
        let novaTensao = v.tensaoBateria;

        // Comportamento dinâmico de trânsito conforme o cenário escolhido (ou sorteio no misto)
        let cenarioEfetivo: "urbano" | "rodovia" | "repouso" | "sinuoso";
        let novoCenarioMistoAtual = v.cenarioMistoAtual;
        let novosPassosRestantes = (v.cenarioMistoPassosRestantes ?? 0) - 1;

        if (cenarioAtivo === "misto") {
          const opcoesCenarios: Array<"urbano" | "rodovia" | "repouso" | "sinuoso"> = [
            "urbano",
            "rodovia",
            "sinuoso",
            "repouso",
          ];

          if (!novoCenarioMistoAtual || novosPassosRestantes <= 0) {
            const opcoesFiltradas = novoCenarioMistoAtual
              ? opcoesCenarios.filter((c) => c !== novoCenarioMistoAtual)
              : opcoesCenarios;
            novoCenarioMistoAtual =
              opcoesFiltradas[Math.floor(Math.random() * opcoesFiltradas.length)];
            // Alterna a cada 4 a 10 passos de envio por veículo
            novosPassosRestantes = Math.floor(Math.random() * 7) + 4;
          }
          cenarioEfetivo = novoCenarioMistoAtual;
        } else {
          cenarioEfetivo = cenarioAtivo;
          novoCenarioMistoAtual = undefined;
          novosPassosRestantes = 0;
        }

        if (cenarioEfetivo === "repouso") {
          novaVelocidade = 0;
          novaIgnicao = false;
          novaTensao = 12.2;
          deltaLat = (Math.random() - 0.5) * 0.00001;
          deltaLon = (Math.random() - 0.5) * 0.00001;
        } else if (cenarioEfetivo === "rodovia") {
          novaIgnicao = true;
          novaTensao = 14.1;
          novaVelocidade = Math.min(115, Math.max(75, v.velocidade + (Math.random() * 8 - 4)));
          novoCurso = (v.curso + (Math.random() * 4 - 2) + 360) % 360;
          const rad = (novoCurso * Math.PI) / 180.0;
          const deslocamentoGraus = (novaVelocidade / 3600 / 111.32) * dt;
          deltaLat = Math.cos(rad) * deslocamentoGraus;
          deltaLon = Math.sin(rad) * deslocamentoGraus;
        } else if (cenarioEfetivo === "sinuoso") {
          novaIgnicao = true;
          novaTensao = 13.9;
          novaVelocidade = Math.min(70, Math.max(30, v.velocidade + (Math.random() * 12 - 6)));
          novoCurso = (v.curso + (Math.random() > 0.5 ? 45 : -45) + 360) % 360;
          const rad = (novoCurso * Math.PI) / 180.0;
          const deslocamentoGraus = (novaVelocidade / 3600 / 111.32) * dt;
          deltaLat = Math.cos(rad) * deslocamentoGraus;
          deltaLon = Math.sin(rad) * deslocamentoGraus;
        } else {
          novaIgnicao = true;
          novaTensao = 13.8;
          if (Math.random() < 0.2) {
            // Parada em semáforo (ZVU)
            novaVelocidade = 0;
            deltaLat = 0;
            deltaLon = 0;
          } else {
            novaVelocidade = Math.min(65, Math.max(15, v.velocidade + (Math.random() * 16 - 8)));
            novoCurso = (v.curso + (Math.random() * 20 - 10) + 360) % 360;
            const rad = (novoCurso * Math.PI) / 180.0;
            const deslocamentoGraus = (novaVelocidade / 3600 / 111.32) * dt;
            deltaLat = Math.cos(rad) * deslocamentoGraus;
            deltaLon = Math.sin(rad) * deslocamentoGraus;
          }
        }

        const novaLat = Number((v.latitude + deltaLat).toFixed(6));
        const novaLon = Number((v.longitude + deltaLon).toFixed(6));

        // ── 1. Medidor 1: Geodésico WGS-84 Base ──
        const distWgs84M =
          novaVelocidade === 0
            ? 0
            : calcularDistanciaWgs84Metros(v.latitude, v.longitude, novaLat, novaLon);
        const novoM1 = v.odometroWgs84 + distWgs84M / 1000.0;

        // ── 5. Medidor 5: Motor B (Haversine Puro R=6371km) ──
        const distHaversineM =
          novaVelocidade === 0
            ? 0
            : calcularHaversineMetros(v.latitude, v.longitude, novaLat, novaLon);
        const novoM5 = v.odometroMotorB + distHaversineM / 1000.0;

        // Monta o ping para os motores físicos reais da biblioteca canônica
        const ping: TelemetriaPingComparativo = {
          imei: v.imei,
          timestamp: agoraMs,
          latitude: novaLat,
          longitude: novaLon,
          velocidade: novaVelocidade,
          curso: novoCurso,
          ignicao: novaIgnicao,
          satelites: v.satelites,
          odometro_mcu_metros: 0,
        };

        // ── 4. Medidor 4: Motor A (Gauss / Curvatura Elipsoidal) ──
        const leituraA = v.motorAInstancia.processarPing(ping);
        const novoM4 = leituraA.odometroKm;

        // ── 6. Medidor 6: Motor C (Série de Taylor 4ª Ordem / EKF) ──
        const leituraC = v.motorCInstancia.processarPing(ping);
        const novoM6 = leituraC.odometroKm;

        // ── 7. Medidor 7: Média Consensual Exata (M1, M4, M5 e M6) ──
        const novoM7 = calcularOdometroMedia1456(novoM1, novoM4, novoM5, novoM6);

        // Gera o pacote binário GT06 autêntico
        const hex = gerarHexGpsGt06(novaLat, novaLon, novaVelocidade, novoCurso, novaIgnicao);

        const sufixoCenario =
          cenarioAtivo === "misto" ? ` · [${cenarioEfetivo.toUpperCase()}]` : "";

        novosPacotes.push({
          id: `pct-${Date.now()}-${v.imei}`,
          timestamp: agoraStr,
          imei: v.imei,
          tipoProtocolo: "0x22 (GPS)",
          hexRaw: hex,
          status: "CONFIRMADO",
          lat: novaLat,
          lon: novaLon,
          velocidade: Math.round(novaVelocidade),
          ignicao: novaIgnicao,
          descricao: `GPS: ${novaLat}, ${novaLon} · Vel: ${Math.round(novaVelocidade)} km/h · Odôm. 7: ${novoM7.toFixed(2)} km${sufixoCenario}`,
        });

        contadorPpsRef.current += 1;

        return {
          ...v,
          latitude: novaLat,
          longitude: novaLon,
          velocidade: Math.round(novaVelocidade),
          curso: Math.round(novoCurso),
          ignicao: novaIgnicao,
          tensaoBateria: Number(novaTensao.toFixed(1)),
          odometroWgs84: Number(novoM1.toFixed(3)),
          odometroMotorA: Number(novoM4.toFixed(3)),
          odometroMotorB: Number(novoM5.toFixed(3)),
          odometroMotorC: Number(novoM6.toFixed(3)),
          odometroPrincipal7: Number(novoM7.toFixed(3)),
          cenarioMistoAtual: novoCenarioMistoAtual,
          cenarioMistoPassosRestantes: novosPassosRestantes,
          totalPacotesTx: v.totalPacotesTx + 1,
          totalAcksRx: v.totalAcksRx + 1,
          ultimoEnvio: agoraStr,
        };
      });

      setPacotes((anteriores) => [...novosPacotes, ...anteriores].slice(0, 80));
      setTotalPacotesGerais((prev) => prev + novosPacotes.length);
      setTotalAcksGerais((prev) => prev + novosPacotes.length);

      return atualizados;
    });
  }, [cenarioAtivo, frequenciaEnvioSegundos]);

  // Loop mestre de simulação com aceleração temporal autêntica (clock scaling sem descarte de pacotes)
  useEffect(() => {
    if (!simulacaoRodando) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTaxaPacotesSegundo(0);
      return;
    }

    // Intervalo acelerado no navegador mantendo a física integral do passo:
    // Ex: 5s em 10x roda a cada 500ms; em 60x roda a cada 83ms.
    const intervaloMs = Math.max(
      35,
      Math.round((frequenciaEnvioSegundos * 1000) / Math.max(1, aceleracaoTempo)),
    );

    timerRef.current = setInterval(() => {
      executarPassoSimulacao();
      setTempoDecorridoSegundos((prev) => prev + frequenciaEnvioSegundos);
    }, intervaloMs);

    const ppsTimer = setInterval(() => {
      setTaxaPacotesSegundo(contadorPpsRef.current);
      contadorPpsRef.current = 0;
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearInterval(ppsTimer);
    };
  }, [simulacaoRodando, frequenciaEnvioSegundos, aceleracaoTempo, executarPassoSimulacao]);

  // Rolagem suave no console de pacotes
  useEffect(() => {
    if (autoScroll && consoleBottomRef.current) {
      consoleBottomRef.current.scrollTop = 0;
    }
  }, [pacotes, autoScroll]);

  // Ações de controle da simulação
  const handleAlternarSimulacao = () => {
    if (simulacaoRodando) {
      setSimulacaoRodando(false);
      toast.info("Simulação de carga pausada.");
    } else {
      setSimulacaoRodando(true);
      toast.success(
        `Bancada virtual iniciada com ${veiculos.length} rastreadores no cenário ${cenarioAtivo.toUpperCase()} (${aceleracaoTempo}x).`,
      );
    }
  };

  const handleReiniciarSimulacao = () => {
    setSimulacaoRodando(false);
    relogioVirtualMsRef.current = Date.now();
    setPacotes([]);
    setTotalPacotesGerais(0);
    setTotalAcksGerais(0);
    setTempoDecorridoSegundos(0);
    inicializarFrota(quantidadeVeiculos);
    toast.success("Bancada virtual e odômetros resetados com sucesso.");
  };

  // Disparo de comando tático simulado
  const handleDispararComandoBancada = () => {
    if (!comandoBancada.trim()) return;

    const agoraStr = formatarHoraBrasil(new Date());
    const cmdLimpo = comandoBancada.trim().toUpperCase();

    const alvos =
      filtroImeiConsole === "todos"
        ? veiculos
        : veiculos.filter((v) => v.imei === filtroImeiConsole);

    if (alvos.length === 0) {
      toast.error("Nenhum veículo alvo selecionado.");
      return;
    }

    const novosLogs: PacoteGt06Simulado[] = [];

    alvos.forEach((v) => {
      let respostaSimulada = "OK";
      if (cmdLimpo.startsWith("STATUS#")) {
        respostaSimulada = `Battery:98%;GPRS:Normal;GPS:Tracking(${v.satelites});ACC:${v.ignicao ? "ON" : "OFF"};Relay:${v.bloqueado ? "OFF" : "ON"};Volt:${v.tensaoBateria}V;CSQ:${v.sinalCsq}`;
      } else if (cmdLimpo.startsWith("PARAM#")) {
        respostaSimulada = `SERVER:1,gps.oficial.tec.br,7002,0;TIMER:15,3600;ANGLE:3,15;APN:voxter.br;HBT:180,900;`;
      } else if (cmdLimpo.startsWith("RELAY,1")) {
        respostaSimulada = "RELAY:CUT FUEL SUCCESS";
        v.bloqueado = true;
      } else if (cmdLimpo.startsWith("RELAY,0")) {
        respostaSimulada = "RELAY:RESTORE FUEL SUCCESS";
        v.bloqueado = false;
      } else if (cmdLimpo.startsWith("RELAY#") || cmdLimpo === "RELAY") {
        respostaSimulada = v.bloqueado ? "Relay:CUT" : "Relay:RESUME";
      } else if (cmdLimpo.startsWith("TIMER")) {
        respostaSimulada = "TIMER:OK";
      } else if (cmdLimpo.startsWith("RESET#")) {
        respostaSimulada = "SYSTEM REBOOTING...";
      }

      novosLogs.push({
        id: `cmd-${Date.now()}-${v.imei}`,
        timestamp: agoraStr,
        imei: v.imei,
        tipoProtocolo: "0x15 (Comando/ACK)",
        hexRaw: `TX: ${cmdLimpo} -> RX: ${respostaSimulada}`,
        status: "CONFIRMADO",
        descricao: `[COMANDO EXECUTADO] ${cmdLimpo} -> Resposta do Hardware: "${respostaSimulada}"`,
      });
    });

    setPacotes((antigos) => [...novosLogs, ...antigos].slice(0, 80));
    toast.success(`Comando ${cmdLimpo} processado por ${alvos.length} rastreador(es).`);
  };

  // Exportar relatório técnico de teste de estresse
  const handleExportarRelatorio = () => {
    const relatorio = {
      sistema: "GD Rastreamento — Bancada Virtual e Simulador de Carga",
      geradoEm: new Date().toISOString(),
      parametros: {
        totalVeiculos: veiculos.length,
        cenario: cenarioAtivo,
        frequenciaSegundos: frequenciaEnvioSegundos,
        tempoDecorridoSegundos,
        totalPacotesGerais,
        totalAcksGerais,
        taxaMediaPps: taxaPacotesSegundo,
      },
      confrontacaoOdometros: veiculos.map((v) => ({
        placa: v.placa,
        imei: v.imei,
        modelo: v.modelo,
        odometro1_Wgs84: v.odometroWgs84,
        odometro4_MotorA_Gauss: v.odometroMotorA,
        odometro5_MotorB_Haversine: v.odometroMotorB,
        odometro6_MotorC_Taylor: v.odometroMotorC,
        odometro7_Principal_Consensual: v.odometroPrincipal7,
        deltaPrincipalVsWgs84: Number((v.odometroPrincipal7 - v.odometroWgs84).toFixed(3)),
      })),
      amostraUltimosPacotes: pacotes.slice(0, 20),
    };

    const blob = new Blob([JSON.stringify(relatorio, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-teste-carga-gd-rastreamento-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório de teste de carga exportado com sucesso.");
  };

  // Veículo em foco para o card de detalhamento
  const veiculoFoco = useMemo(() => {
    return veiculos.find((v) => v.id === veiculoFocoId) || veiculos[0] || null;
  }, [veiculos, veiculoFocoId]);

  // Pacotes filtrados para o console
  const pacotesFiltrados = useMemo(() => {
    if (filtroImeiConsole === "todos") return pacotes;
    return pacotes.filter((p) => p.imei === filtroImeiConsole);
  }, [pacotes, filtroImeiConsole]);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CABEÇALHO TÁTICO DA BANCADA VIRTUAL (NEUMORPHISM SUAVE E DARK HUNTER) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 shadow-inner">
              <Cpu className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Bancada Virtual e Simulador de Carga de Rastreadores
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                  GT06 NATIVO
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Simulação de alta fidelidade física com injeção de pacotes reais (0x12, 0x22 e
                0x13), calibração e confrontação do 7º Medidor Consensual em tempo real.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Global */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAlternarSimulacao}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition active:scale-95 cursor-pointer shadow-md ${
              simulacaoRodando
                ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                : "bg-orange-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {simulacaoRodando ? (
              <>
                <Pause className="h-4 w-4" />
                <span>Pausar Simulação</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>Iniciar Simulação</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReiniciarSimulacao}
            className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-sm"
            title="Resetar todos os odômetros e veículos da bancada"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Resetar</span>
          </button>

          <button
            type="button"
            onClick={handleExportarRelatorio}
            className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-[#eaf0f8] dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/10 transition active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-sm"
            title="Exportar dados analíticos do teste em JSON"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar Relatório</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* BARRA DE CONTROLE DE PARÂMETROS E CENÁRIOS DA BANCADA */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {/* 1. Quantidade de Veículos na Frota */}
        <TiltCard
          spotlightColor="rgba(168, 85, 247, 0.16)"
          className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-purple-500" /> FROTA VIRTUAL
            </span>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
              {veiculos.length} VEÍCULOS
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {[1, 5, 10, 25, 50].map((qtd) => (
              <button
                key={qtd}
                type="button"
                disabled={simulacaoRodando}
                onClick={() => setQuantidadeVeiculos(qtd)}
                className={`flex-1 py-1 rounded-lg text-xs font-mono font-black transition cursor-pointer disabled:opacity-50 ${
                  quantidadeVeiculos === qtd
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700"
                }`}
              >
                {qtd}
              </button>
            ))}
          </div>
          <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-2">
            Volume de rastreadores transmitindo simultaneamente
          </div>
        </TiltCard>

        {/* 2. Cenário de Condução e Física */}
        <TiltCard
          spotlightColor="rgba(59, 130, 246, 0.16)"
          className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-blue-500" /> CENÁRIO DE CONDUÇÃO
            </span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">
              {cenarioAtivo}
            </span>
          </div>
          <div className="mt-2.5">
            <select
              value={cenarioAtivo}
              onChange={(e) => setCenarioAtivo(e.target.value as PerfilCenarioSimulacao)}
              className="w-full py-1.5 px-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/80 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 shadow-inner"
            >
              <option value="urbano">Trânsito Urbano (Paradas, ZVU e Semáforos)</option>
              <option value="rodovia">Rodovia Dutra (Alta Velocidade Contínua)</option>
              <option value="sinuoso">Manobra Sinuosa (Estresse Odômetro 7)</option>
              <option value="repouso">Garagem e Repouso (Motor Desligado)</option>
              <option value="misto">Misto (Alternância Aleatória de Cenários)</option>
            </select>
          </div>
          <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-2 truncate">
            {cenarioAtivo === "misto"
              ? "Alternância aleatória de todos os cenários com transições físicas"
              : cenarioAtivo === "sinuoso"
                ? "Curvas acentuadas para aferir fusão dos 4 medidores"
                : cenarioAtivo === "rodovia"
                  ? "Percurso constante de 80 a 110 km/h"
                  : cenarioAtivo === "repouso"
                    ? "ACC desligado com cessação de tráfego"
                    : "Deslocamento municipal com semáforos"}
          </div>
        </TiltCard>

        {/* 3. Frequência de Transmissão (CONTADOR NÚMERO POR NÚMERO) */}
        <TiltCard
          spotlightColor="rgba(16, 185, 129, 0.16)"
          className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-orange-500" /> INTERVALO DE ENVIO
            </span>
            <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold">
              {frequenciaEnvioSegundos}s / PACOTE
            </span>
          </div>

          {/* Contador Número por Número com Incremento/Decremento Tátil */}
          <div className="mt-2.5 flex items-center justify-between gap-2 bg-[#dfe9f5] dark:bg-slate-950 p-1.5 rounded-xl border border-slate-300/50 dark:border-slate-800 shadow-[inset_1px_1px_3px_#c8d4e4,inset_-1px_-1px_3px_#ffffff] dark:shadow-none">
            <button
              type="button"
              onClick={() => setFrequenciaEnvioSegundos((prev) => Math.max(1, prev - 1))}
              disabled={frequenciaEnvioSegundos <= 1}
              className="h-8 w-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-orange-500/50 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs active:scale-95 transition cursor-pointer shrink-0"
              title="Diminuir 1 segundo"
              aria-label="Diminuir intervalo de envio em 1 segundo"
            >
              <Minus className="h-4 w-4 stroke-[2.5]" />
            </button>

            <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
              <input
                type="number"
                min={1}
                max={120}
                value={frequenciaEnvioSegundos}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    setFrequenciaEnvioSegundos(Math.min(120, val));
                  }
                }}
                className="w-12 text-center text-base font-mono font-black text-slate-900 dark:text-slate-100 bg-transparent outline-none focus:ring-1 focus:ring-orange-500 rounded py-0.5"
                title="Digitar intervalo em segundos"
              />
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                seg
              </span>
            </div>

            <button
              type="button"
              onClick={() => setFrequenciaEnvioSegundos((prev) => Math.min(120, prev + 1))}
              disabled={frequenciaEnvioSegundos >= 120}
              className="h-8 w-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-orange-500/50 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs active:scale-95 transition cursor-pointer shrink-0"
              title="Aumentar 1 segundo"
              aria-label="Aumentar intervalo de envio em 1 segundo"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
            </button>
          </div>

          <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-2 truncate">
            Ajuste fino número por número (mín 1s · máx 120s)
          </div>
        </TiltCard>

        {/* 4. Aceleração do Tempo (SIM SPEED / CLOCK SCALING) */}
        <TiltCard
          spotlightColor="rgba(245, 158, 11, 0.16)"
          className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <FastForward className="h-3.5 w-3.5 text-amber-500" /> ACELERAÇÃO TEMPO
            </span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-black">
              {aceleracaoTempo}x VELOCIDADE
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1">
            {[1, 5, 10, 30, 60].map((vel) => (
              <button
                key={vel}
                type="button"
                onClick={() => setAceleracaoTempo(vel)}
                className={`flex-1 py-1 rounded-lg text-xs font-mono font-black transition cursor-pointer ${
                  aceleracaoTempo === vel
                    ? "bg-amber-600 text-white shadow-xs"
                    : "bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700"
                }`}
              >
                {vel}x
              </button>
            ))}
          </div>
          <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-2 truncate">
            {aceleracaoTempo === 1
              ? "Tempo real 1:1 (cadência real)"
              : aceleracaoTempo === 60
                ? "1 min real = 1h estrada (~80 km)"
                : `${aceleracaoTempo}x sem descartar pacotes`}
          </div>
        </TiltCard>

        {/* 5. Rendimento e Métricas em Tempo Real */}
        <TiltCard
          spotlightColor="rgba(236, 72, 153, 0.16)"
          className="p-3.5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-md flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-pink-500" /> RENDIMENTO E STATUS
            </span>
            <span className="text-[10px] text-pink-600 dark:text-pink-400 font-bold">
              {taxaPacotesSegundo} PPS
            </span>
          </div>
          <div className="my-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
              {totalPacotesGerais}
            </span>
            <span className="text-xs font-mono text-orange-600 dark:text-orange-400 font-bold">
              {totalAcksGerais} ACKs OK
            </span>
          </div>
          <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Simulado: {formatarTempoSimulado(tempoDecorridoSegundos)}</span>
            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
              100% Taxa Sucesso
            </span>
          </div>
        </TiltCard>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DETALHAMENTO DO VEÍCULO EM FOCO COM CONFRONTAÇÃO DOS 7 MOTORES */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {veiculoFoco && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_14px_#c3cfe2] dark:shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/60 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-3.5 h-10 rounded-lg shadow-sm"
                style={{ backgroundColor: veiculoFoco.corHex }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950 font-mono font-black text-xs tracking-wider">
                    {veiculoFoco.placa}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {veiculoFoco.modelo}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    (IMEI: {veiculoFoco.imei})
                  </span>
                  {cenarioAtivo === "misto" && veiculoFoco.cenarioMistoAtual && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold uppercase text-[10px] tracking-wider border border-blue-500/30">
                      Cenário: {veiculoFoco.cenarioMistoAtual}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                  <span>
                    Lat/Lon: {veiculoFoco.latitude}, {veiculoFoco.longitude}
                  </span>
                  <span>·</span>
                  <span>Velocidade: {veiculoFoco.velocidade} km/h</span>
                  <span>·</span>
                  <span>Curso: {veiculoFoco.curso}°</span>
                  <span>·</span>
                  <span>ACC: {veiculoFoco.ignicao ? "LIGADO" : "DESLIGADO"}</span>
                  <span>·</span>
                  <span>Bateria: {veiculoFoco.tensaoBateria}V</span>
                  <span>·</span>
                  <span>Satélites: {veiculoFoco.satelites}</span>
                </div>
              </div>
            </div>

            {/* Seletor rápido de veículo para foco */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Focar:</span>
              <select
                value={veiculoFoco.id}
                onChange={(e) => setVeiculoFocoId(e.target.value)}
                className="py-1 px-2.5 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/80 dark:border-slate-700 shadow-inner"
              >
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.modelo}
                    {cenarioAtivo === "misto" && v.cenarioMistoAtual
                      ? ` [${v.cenarioMistoAtual.toUpperCase()}]`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards de Confrontação dos 7 Medidores em Tempo Real (M1, M4, M5, M6 e Principal 7) */}
          <div>
            <div className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 mb-2 flex flex-wrap items-center justify-between gap-1">
              <span>CONFRONTAÇÃO DOS 7 MEDIDORES EM TEMPO REAL (M1, M4, M5, M6 E PRINCIPAL 7)</span>
              <span className="text-pink-600 dark:text-pink-400 font-mono text-[11px]">
                Fórmula: (M1 + M4 + M5 + M6) / 4
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {/* 1. Medidor 1: WGS-84 Base Geodésico */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-orange-500/40 flex flex-col justify-between">
                <div className="text-[10px] font-mono text-orange-600 dark:text-orange-400 font-black uppercase">
                  1. WGS-84 (BASE)
                </div>
                <div className="my-1.5">
                  <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-slate-100">
                    {veiculoFoco.odometroWgs84.toFixed(2)} km
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Geodésico Elipsoidal
                  </div>
                </div>
              </div>

              {/* 4. Medidor 4: Motor A Gauss */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-orange-500/40 flex flex-col justify-between">
                <div className="text-[10px] font-mono text-orange-600 dark:text-orange-400 font-black uppercase">
                  4. MOTOR A (GAUSS)
                </div>
                <div className="my-1.5">
                  <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-slate-100">
                    {veiculoFoco.odometroMotorA.toFixed(2)} km
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Curvatura Gaussiana
                  </div>
                </div>
              </div>

              {/* 5. Medidor 5: Motor B Haversine */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-amber-500/40 flex flex-col justify-between">
                <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-black uppercase">
                  5. MOTOR B (HAVERSINE)
                </div>
                <div className="my-1.5">
                  <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-slate-100">
                    {veiculoFoco.odometroMotorB.toFixed(2)} km
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Haversine Puro R=6371km
                  </div>
                </div>
              </div>

              {/* 6. Medidor 6: Motor C Taylor */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-indigo-500/40 flex flex-col justify-between">
                <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-black uppercase">
                  6. MOTOR C (TAYLOR)
                </div>
                <div className="my-1.5">
                  <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-slate-100">
                    {veiculoFoco.odometroMotorC.toFixed(2)} km
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    Série de Taylor 4ª Ordem
                  </div>
                </div>
              </div>

              {/* 7. Medidor 7: Odômetro Principal Consensual */}
              <div className="p-3 rounded-xl bg-pink-500/10 dark:bg-pink-950/40 border border-pink-500/50 shadow-inner flex flex-col justify-between">
                <div className="text-[10px] font-mono text-pink-700 dark:text-pink-300 font-black uppercase flex items-center justify-between">
                  <span>7. PRINCIPAL</span>
                  <span className="px-1.5 py-0.2 rounded bg-pink-500 text-white text-[8px] font-black uppercase">
                    CONSENSO
                  </span>
                </div>
                <div className="my-1.5">
                  <div className="text-base sm:text-lg font-black font-mono text-pink-700 dark:text-pink-300">
                    {veiculoFoco.odometroPrincipal7.toFixed(2)} km
                  </div>
                  <div className="text-[9px] font-mono text-pink-700 dark:text-pink-400 font-bold mt-0.5">
                    Δ vs Base:{" "}
                    {(veiculoFoco.odometroPrincipal7 - veiculoFoco.odometroWgs84 >= 0 ? "+" : "") +
                      (veiculoFoco.odometroPrincipal7 - veiculoFoco.odometroWgs84).toFixed(3)}{" "}
                    km
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DISPARO DE COMANDOS TÁTICOS SIMULADOS E CONSOLE GT06 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de Comandos da Bancada */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-300/60 dark:border-slate-800 pb-2">
            <Terminal className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h4 className="text-xs font-mono font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Disparo de Comandos Simulados
            </h4>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
              Destinatário do Comando:
            </label>
            <select
              value={filtroImeiConsole}
              onChange={(e) => setFiltroImeiConsole(e.target.value)}
              className="w-full py-1.5 px-3 rounded-xl text-xs font-mono font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/80 dark:border-slate-700 shadow-inner"
            >
              <option value="todos">📡 Broadcast (Enviar para Todos os {veiculos.length})</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.imei}>
                  {v.placa} — {v.modelo} ({v.imei})
                </option>
              ))}
            </select>
          </div>

          {/* Atalhos de Comandos Canônicos J16 */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 font-bold uppercase">
              Atalhos Rápidos Homologados:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "STATUS#", cmd: "STATUS#", desc: "Status geral do hardware" },
                { label: "PARAM#", cmd: "PARAM#", desc: "Parâmetros de rede e IP" },
                { label: "TIMER 15s", cmd: "TIMER,15,3600#", desc: "Telemetria 15s" },
                { label: "ANGLE 15°", cmd: "ANGLE,3,15#", desc: "Detecção de curva" },
                { label: "BLOQUEAR", cmd: "RELAY,1", desc: "Corte de combustível" },
                { label: "DESBLOQUEAR", cmd: "RELAY,0", desc: "Restauração de combustível" },
                { label: "REINICIAR", cmd: "RESET#", desc: "Reboot do modem" },
                { label: "HBT 15m", cmd: "HBT,180,900#", desc: "Economia em repouso" },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => setComandoBancada(btn.cmd)}
                  className="p-1.5 rounded-lg text-left bg-slate-200/60 dark:bg-slate-800 hover:bg-purple-500/15 hover:text-purple-700 dark:hover:text-purple-300 border border-slate-300/60 dark:border-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer"
                  title={btn.desc}
                >
                  <div className="text-[10px] font-mono font-black">{btn.label}</div>
                  <div className="text-[8.5px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {btn.cmd}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Input de Comando Manual e Botão de Envio */}
          <div className="space-y-2 pt-2 border-t border-slate-300/60 dark:border-slate-800">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={comandoBancada}
                onChange={(e) => setComandoBancada(e.target.value)}
                placeholder="Ex: STATUS# ou PARAM#"
                className="flex-1 py-1.5 px-3 rounded-xl font-mono text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300/80 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 shadow-inner"
              />
              <button
                type="button"
                onClick={handleDispararComandoBancada}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-mono text-xs font-bold transition active:scale-95 cursor-pointer shadow-md flex items-center gap-1 shrink-0"
              >
                <Send className="h-3 w-3" />
                <span>Enviar</span>
              </button>
            </div>
            <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
              O comando será injetado e processado pela máquina de estados simulada.
            </div>
          </div>
        </div>

        {/* Console de Pacotes GT06 em Tempo Real */}
        <div className="lg:col-span-2 p-4 sm:p-5 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/60 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-orange-500 animate-pulse" />
              <h4 className="text-xs font-mono font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Monitor GT06 em Tempo Real ({pacotesFiltrados.length} Registros)
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border transition cursor-pointer ${
                  autoScroll
                    ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/40"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700"
                }`}
              >
                Auto-scroll: {autoScroll ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                onClick={() => setPacotes([])}
                className="p-1 rounded text-slate-500 hover:text-rose-500 transition cursor-pointer"
                title="Limpar console"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Janela de Terminal com Pacotes Hexadecimais e Descrições */}
          <div
            ref={consoleBottomRef}
            className="my-3 h-[280px] overflow-y-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-slate-200 border border-slate-800 space-y-1.5 shadow-inner"
          >
            {pacotesFiltrados.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center">
                <Terminal className="h-6 w-6 mb-1 opacity-50" />
                <span>Nenhum pacote transmitido ainda.</span>
                <span className="text-[10px]">
                  Clique em &quot;Iniciar Simulação&quot; para disparar a telemetria virtual.
                </span>
              </div>
            ) : (
              pacotesFiltrados.map((pct) => (
                <div
                  key={pct.id}
                  className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between text-[9.5px]">
                    <span className="text-slate-400 font-bold">{pct.timestamp}</span>
                    <span
                      className={`font-black px-1 py-0.2 rounded text-[8px] uppercase ${
                        pct.tipoProtocolo.includes("0x22")
                          ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                          : pct.tipoProtocolo.includes("0x12")
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {pct.tipoProtocolo}
                    </span>
                    <span className="text-slate-500">IMEI: {pct.imei}</span>
                  </div>

                  <div className="text-[10px] text-orange-400 font-bold mt-0.5">
                    {pct.descricao}
                  </div>

                  <div className="text-[9px] text-slate-500 break-all select-all font-mono mt-0.5 bg-black/40 p-1 rounded">
                    HEX: {pct.hexRaw}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Buffer circular: 80 pacotes retidos na memória</span>
            <span className="text-orange-600 dark:text-orange-400 font-bold">
              Gateway: gps.oficial.tec.br:7002
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
