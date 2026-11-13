// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Motor Canônico de Auto-Otimização e Física de Pista J16 / GT06
// Execução Holística e Exaustiva: Reta, Aclive, Declive, Rotatória 360°,
// Túnel GNSS, Esquina 90°, Estrada de Chão, Congestionamento ZVU, Marcha a Ré
// e Repouso em Garagem. Fonte Única de Verdade (Single Source of Truth).
// ─────────────────────────────────────────────────────────────────────────────

import {
  type ParametrosPadraoComparativo,
  type PerfilUsoOperacional,
  TETO_FRANQUIA_M2M_MB,
  TETO_SEGURO_ENGENHARIA_MB,
  CONSUMO_BASAL_FIXO_OPERADORA_MB,
} from "./comparativoPadroesConstantes";

export type PontoTrajetoFisico = {
  t: number;
  vel: number;
  curso: number;
  alt: number;
  sats: number;
  estado: string;
  emCurva: boolean;
  emRotatoria: boolean;
  emManobra: boolean;
  emChao: boolean;
  emAltimetria?: boolean;
  ignicao: boolean;
  gSensorVibracao: number;
};

export type ResultadoSimulacaoCiclo = {
  pingsTimerCiclo: number;
  pingsCurva90Ciclo: number;
  pingsRotatoriaCiclo: number;
  pingsManobraCiclo: number;
  pingsEspuriosRetaCiclo: number;
  pingsEspuriosChaoCiclo: number;
  pingsEspuriosAltimetriaCiclo: number;
  totalEspuriosCiclo: number;
  segundosMovCiclo: number;
  curvasDetectadasPct: number;
};

export type ResultadoAutoOtimizador = {
  timerMovimento: number;
  timerParado: number;
  anguloHabilitado: boolean;
  anguloGrau: number;
  anguloIntervalo: number;
  hbtLigado: number;
  hbtDesligado: number;
  modoEconomiaParada: boolean;
  sensibilidadeGSensor: number;
  pacoteEstendidoIexvol: boolean;
  mbTotaisMes: number;
  mbVariavelMes: number;
  mbFixoBasal: number;
  scoreQualidadeTotal: number;
  scoreCurvas: number;
  scoreTemporal: number;
  scoreOdometro: number;
  pingsEspuriosRetaDia: number;
  pingsCurvaReaisDia: number;
  curvasDetectadasPct: number;
  percentualFranquia: number;
  estourouFranquia: boolean;
  violouMargemSeguranca: boolean;
  scoreComposto: number;
  violouLimite: boolean;
  bytesTotaisDia: number;
  totalPingsGpsDia: number;
  totalHbtsDia: number;
};

export type ContadoresDescarteAberracoes = {
  semModoGaragem: number;
  semMcu: number;
  sensorInstavel: number;
  timerParadoInadequado: number;
  hbtParadoInadequado: number;
  hbtMovInadequado: number;
  semInflexao: number;
  temJitterReta: number;
  perdeCurvasCriticas: number;
  filtroIncoerente: number;
  filtroCurto: number;
  timerInadequado: number;
  violouMargemSeguranca: number;
};

export type ResultadoVarreduraCompleta = {
  totalTestadas: number;
  totalDescartadas: number;
  totalAprovadas: number;
  contadoresDescarte: ContadoresDescarteAberracoes;
  campeao: ResultadoAutoOtimizador;
  top10: ResultadoAutoOtimizador[];
  padraoOficial: ResultadoAutoOtimizador;
};

/**
 * Calcula a menor rotação angular entre dois rumos considerando o anel de 360°
 */
export function diferencaAngular(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Gera a matriz cinemática de 300 segundos do ciclo viário holístico:
 * Abrange: Reta, Aclive, Declive, Rotatória 360°, Túnel, Esquina 90°,
 * Estrada de Chão, Congestionamento ZVU, Marcha a Ré e Garagem.
 */
export function gerarCicloViarioHolistico(tipoVeiculo: "carro" | "moto"): PontoTrajetoFisico[] {
  const isMoto = tipoVeiculo === "moto";
  const trajeto: PontoTrajetoFisico[] = [];

  for (let t = 0; t < 300; t++) {
    let vel = 0;
    let curso = 90.0;
    let alt = 750.0;
    let sats = 12;
    let estado = "Reta com Ondulação de Asfalto";
    let emCurva = false;
    let emRotatoria = false;
    let emManobra = false;
    let emChao = false;
    let emAltimetria = false;
    let ignicao = true;
    let gSensorVibracao = 3;

    if (t <= 30) {
      // 1. Reta em cruzeiro com ondulação de asfalto, vento lateral e camber de pista
      estado = "Reta com Ondulação de Asfalto";
      vel = Math.min(isMoto ? 80 : 72, (t + 1) * 3.5);
      const ruido = isMoto
        ? Math.sin(t * 1.5) * 8.5 + Math.sin(t * 3.4) * 6.5
        : Math.sin(t * 0.5) * 9.2 + Math.sin(t * 1.5) * 3.5;
      curso = 90.0 + ruido;
      alt = 750.0;
      gSensorVibracao = 3;
    } else if (t <= 60) {
      // 2. Subida em Aclive Acentuado (+35m de elevação)
      estado = "Subida em Aclive (+35m)";
      emAltimetria = true;
      vel = isMoto ? 65 : 58;
      curso = 90.0 + Math.sin(t * 0.7) * 2.2;
      alt = 750.0 + (t - 30) * 1.16;
      gSensorVibracao = 4;
    } else if (t <= 90) {
      // 3. Descida em Declive (-35m de elevação) com frenagens intermitentes
      estado = "Descida em Declive com Frenagens";
      emAltimetria = true;
      vel = isMoto ? 70 : 62;
      curso = 90.0 + Math.sin(t * 0.9) * 2.0;
      alt = 785.0 - (t - 60) * 1.16;
      gSensorVibracao = 3;
    } else if (t <= 132) {
      // 4. Rotatória Completa de 2 Pistas (Giro Contínuo de 360°)
      estado = "Contorno de Rotatória 360°";
      emRotatoria = true;
      emCurva = true;
      vel = 32;
      curso = (90.0 + (t - 90) * 8.5) % 360;
      alt = 750.0;
      gSensorVibracao = 3;
    } else if (t <= 160) {
      // 5. Travessia de Túnel Rodoviário (Perda e Reaquisição de GNSS)
      estado = "Travessia de Túnel (Sinal GNSS Obscurecido)";
      vel = 60;
      curso = 90.0;
      sats = t >= 138 && t <= 152 ? 0 : 4;
      alt = 745.0;
      gSensorVibracao = 3;
    } else if (t <= 190) {
      // 6. Conversão Fechada de 90° em Esquina Urbana
      estado = "Conversão Urbana de 90°";
      emCurva = true;
      vel = 35;
      const progresso = (t - 160) / 30;
      curso = 90.0 + progresso * 90.0;
      alt = 750.0;
      gSensorVibracao = 3;
    } else if (t <= 220) {
      // 7. Estrada de Chão / Pavimento Irregular com Cascalho
      estado = "Estrada de Chão / Pavimento Irregular";
      emChao = true;
      vel = 38;
      const trepidacao = isMoto
        ? Math.sin(t * 2.5) * 5.5 + Math.sin(t * 4.2) * 3.0
        : Math.sin(t * 1.8) * 4.0 + Math.sin(t * 3.1) * 2.0;
      curso = 180.0 + trepidacao;
      alt = 750.0;
      gSensorVibracao = 5;
    } else if (t <= 250) {
      // 8. Congestionamento Para-e-Anda e Semáforo (ZVU)
      estado = "Congestionamento Para-e-Anda (ZVU)";
      vel = t % 15 < 5 ? 12 : 0;
      curso = 180.0;
      alt = 750.0;
      gSensorVibracao = 2;
    } else if (t <= 280) {
      // 9. Manobra de Estacionamento em Vaga Apertada e Marcha a Ré
      estado = "Manobra de Baliza e Marcha a Ré";
      emManobra = true;
      if (t >= 265 && t <= 273) {
        vel = 4;
        curso = 0.0; // vetor inverte para trás na ré
      } else {
        vel = 6;
        curso = 180.0 + Math.sin(t * 1.5) * 12.0;
      }
      alt = 750.0;
      gSensorVibracao = 3;
    } else {
      // 10. Repouso em Garagem / Ignição Desligada (ACC OFF)
      estado = "Repouso em Garagem (ACC OFF)";
      ignicao = false;
      vel = 0;
      curso = 180.0;
      alt = 750.0;
      gSensorVibracao = 1;
    }

    trajeto.push({
      t,
      vel,
      curso,
      alt,
      sats,
      estado,
      emCurva,
      emRotatoria,
      emManobra,
      emChao,
      emAltimetria,
      ignicao,
      gSensorVibracao,
    });
  }

  return trajeto;
}

// Cache das matrizes cinemáticas canônicas
const TRAJETO_CANONICO_CARRO = gerarCicloViarioHolistico("carro");
const TRAJETO_CANONICO_MOTO = gerarCicloViarioHolistico("moto");

/**
 * Simula a execução do firmware microcontrolado do rastreador GT06 / J16
 * segundo a segundo contra a matriz cinemática de 300s.
 */
export function simularFirmwareGT06Holistico(
  p: ParametrosPadraoComparativo,
  trajeto: PontoTrajetoFisico[],
): ResultadoSimulacaoCiclo {
  let ultimoCursoTransmitido = 90.0;
  let ultimoEstavaEmCurva = false;
  let tempoUltimoPingCurva = -999;
  let pingsTimerCiclo = 0;
  let pingsCurva90Ciclo = 0;
  let pingsRotatoriaCiclo = 0;
  let pingsManobraCiclo = 0;
  let pingsEspuriosRetaCiclo = 0;
  let pingsEspuriosChaoCiclo = 0;
  let pingsEspuriosAltimetriaCiclo = 0;
  let segundosMovCiclo = 0;

  for (const pt of trajeto) {
    const isMovimento = pt.vel > 3 && pt.ignicao;
    if (isMovimento) segundosMovCiclo++;

    // 1. Disparo de Timer Regular em Movimento (Atualiza o curso de referência)
    if (isMovimento && pt.t % Math.max(1, p.timerMovimento) === 0) {
      ultimoCursoTransmitido = pt.curso;
      ultimoEstavaEmCurva = pt.emRotatoria || pt.emCurva || pt.emManobra;
      pingsTimerCiclo++;
    }

    // 2. Inflexão de Ângulo de Curva (se habilitado, com velocidade > 5 km/h e fix GNSS)
    if (p.anguloHabilitado && isMovimento && pt.vel > 5 && pt.sats >= 3) {
      const deltaTheta = diferencaAngular(pt.curso, ultimoCursoTransmitido);
      const deltaT = pt.t - tempoUltimoPingCurva;

      if (deltaTheta >= p.anguloGrau && deltaT >= Math.max(1, p.anguloIntervalo)) {
        tempoUltimoPingCurva = pt.t;
        const pontoEmCurva = pt.emRotatoria || pt.emCurva || pt.emManobra;

        if (pt.emRotatoria) {
          pingsRotatoriaCiclo++;
        } else if (pt.emCurva) {
          pingsCurva90Ciclo++;
        } else if (pt.emManobra) {
          pingsManobraCiclo++;
        } else if (ultimoEstavaEmCurva) {
          // Desengate físico e alinhamento de saída de curva ou rotatória anterior
          pingsRotatoriaCiclo++;
        } else if (pt.emChao) {
          pingsEspuriosChaoCiclo++;
        } else if (pt.emAltimetria) {
          pingsEspuriosAltimetriaCiclo++;
        } else {
          pingsEspuriosRetaCiclo++;
        }

        ultimoCursoTransmitido = pt.curso;
        ultimoEstavaEmCurva = pontoEmCurva;
      }
    }
  }

  const totalEspuriosCiclo =
    pingsEspuriosRetaCiclo + pingsEspuriosChaoCiclo + pingsEspuriosAltimetriaCiclo;

  // Resolução de captura em curvas e rotatórias
  const fidelidadeRotatoria = Math.min(1.0, pingsRotatoriaCiclo / 4);
  const fidelidadeCurva90 = Math.min(1.0, pingsCurva90Ciclo / 2);
  const curvasDetectadasPct = Math.round(
    (fidelidadeRotatoria * 0.5 + fidelidadeCurva90 * 0.5) * 100,
  );

  return {
    pingsTimerCiclo,
    pingsCurva90Ciclo,
    pingsRotatoriaCiclo,
    pingsManobraCiclo,
    pingsEspuriosRetaCiclo,
    pingsEspuriosChaoCiclo,
    pingsEspuriosAltimetriaCiclo,
    totalEspuriosCiclo,
    segundosMovCiclo,
    curvasDetectadasPct,
  };
}

/**
 * Fonte Única e Soberana de Cálculo de Métricas Físicas e Consumo M2M
 * Unifica 100% dos resultados entre o Duelo de Pista, a Calculadora A/B e o Otimizador.
 */
export function calcularMetricasFisicasJ16(
  p: ParametrosPadraoComparativo,
  perfil: PerfilUsoOperacional,
): ResultadoAutoOtimizador {
  const isMoto = perfil.tipoVeiculo === "moto";
  const trajeto = isMoto ? TRAJETO_CANONICO_MOTO : TRAJETO_CANONICO_CARRO;
  const sim = simularFirmwareGT06Holistico(p, trajeto);

  const bytesPorPacoteGps = p.pacoteEstendidoIexvol ? 104 : 94;
  const bytesPorPacoteHbt = 65;

  const horasMov = perfil.horasMovimentoPorDia;
  const horasRep = Math.max(0, 24 - horasMov);
  const segundosMovDia = horasMov * 3600;
  const segundosRepDia = horasRep * 3600;

  // Fator de escala diário com base nas horas de movimento (ciclo possui 240s de movimento real)
  const fatorMov = segundosMovDia / Math.max(1, sim.segundosMovCiclo);

  const pingsTimerDia = Math.round(sim.pingsTimerCiclo * fatorMov);
  const pingsCurvaReaisDia = Math.round(
    (sim.pingsCurva90Ciclo + sim.pingsRotatoriaCiclo) * fatorMov,
  );
  const pingsManobraDia = Math.round(sim.pingsManobraCiclo * fatorMov);
  const pingsEspuriosRetaDia = Math.round(sim.totalEspuriosCiclo * fatorMov);

  // Garagem e Repouso (Ignição OFF)
  const pingsGaragemDia = p.modoEconomiaParada
    ? Math.floor(segundosRepDia / Math.max(1, p.timerParado))
    : Math.floor(segundosRepDia / 600);

  const pingsSensorGaragem =
    p.sensibilidadeGSensor <= 1 ? 48 : p.sensibilidadeGSensor <= 2 ? 18 : 0;

  const totalPingsGpsDia =
    pingsTimerDia +
    pingsCurvaReaisDia +
    pingsManobraDia +
    pingsEspuriosRetaDia +
    pingsGaragemDia +
    pingsSensorGaragem;

  const hbtsMovDia = Math.floor(segundosMovDia / Math.max(30, p.hbtLigado));
  const hbtsRepDia = Math.floor(segundosRepDia / Math.max(60, p.hbtDesligado));
  const totalHbtsDia = hbtsMovDia + hbtsRepDia;

  const bytesGpsDia = totalPingsGpsDia * bytesPorPacoteGps;
  const bytesHbtDia = totalHbtsDia * bytesPorPacoteHbt;
  const bytesTotaisDia = bytesGpsDia + bytesHbtDia;

  const mbVariavelMes = (bytesTotaisDia * perfil.diasPorMes) / (1024 * 1024);
  const mbTotaisMes = Number((mbVariavelMes + CONSUMO_BASAL_FIXO_OPERADORA_MB).toFixed(2));
  const percentualFranquia = Number(((mbTotaisMes / TETO_FRANQUIA_M2M_MB) * 100).toFixed(1));
  const estourouFranquia = mbTotaisMes > TETO_FRANQUIA_M2M_MB;
  const violouMargemSeguranca = mbTotaisMes > TETO_SEGURO_ENGENHARIA_MB;

  // Pontuação de Fidelidade Viária e Qualidade Real (0 a 100):
  // 1. Resolução em Curvas e Rotatórias (até 40 pts)
  const scoreCurvasBruto = (sim.curvasDetectadasPct / 100) * 40;
  const penalidadeJitter =
    pingsEspuriosRetaDia > 0 ? Math.min(25, Math.round(pingsEspuriosRetaDia / 4)) : 0;
  const scoreCurvas = Math.max(0, Math.round(scoreCurvasBruto - penalidadeJitter));

  // 2. Resolução Temporal de Eventos (até 35 pts)
  const scoreTemporal = Math.max(10, Math.round(35 - Math.max(0, p.timerMovimento - 10) * 1.0));

  // 3. Precisão de Odômetro e Preservação de Dados (até 25 pts)
  const penalidadeSensor = p.sensibilidadeGSensor <= 3 ? 0 : p.sensibilidadeGSensor === 4 ? 1 : 2;
  const penalidadeMCU = p.pacoteEstendidoIexvol ? 0 : 5;
  const scoreOdometro = Math.min(
    25,
    Math.max(
      5,
      Math.round(
        25 -
          (p.timerMovimento > 20 ? (p.timerMovimento - 20) * 0.4 : 0) -
          penalidadeSensor -
          penalidadeMCU,
      ),
    ),
  );

  const scoreQualidadeTotal = Math.round(scoreCurvas + scoreTemporal + scoreOdometro);
  const scoreComposto = Math.round(scoreQualidadeTotal * 0.6 + (100 - percentualFranquia) * 0.4);

  return {
    timerMovimento: p.timerMovimento,
    timerParado: p.timerParado,
    anguloHabilitado: p.anguloHabilitado,
    anguloGrau: p.anguloGrau,
    anguloIntervalo: p.anguloIntervalo,
    hbtLigado: p.hbtLigado,
    hbtDesligado: p.hbtDesligado,
    modoEconomiaParada: p.modoEconomiaParada,
    sensibilidadeGSensor: p.sensibilidadeGSensor,
    pacoteEstendidoIexvol: p.pacoteEstendidoIexvol,
    mbTotaisMes,
    mbVariavelMes: Number(mbVariavelMes.toFixed(2)),
    mbFixoBasal: CONSUMO_BASAL_FIXO_OPERADORA_MB,
    scoreQualidadeTotal,
    scoreCurvas,
    scoreTemporal,
    scoreOdometro,
    pingsEspuriosRetaDia,
    pingsCurvaReaisDia,
    curvasDetectadasPct: sim.curvasDetectadasPct,
    percentualFranquia,
    estourouFranquia,
    violouMargemSeguranca,
    scoreComposto,
    violouLimite: estourouFranquia,
    bytesTotaisDia,
    totalPingsGpsDia,
    totalHbtsDia,
  };
}

/**
 * Executa a varredura universal holística passo a passo (de 1 em 1 unidade)
 * com descarte estrito de alertas e priorização absoluta da MÁXIMA QUALIDADE dentro da margem segura.
 */
export function executarVarreduraUniversalJ16(
  horasMovimentoPorDia = 8,
  tipoVeiculo: "carro" | "moto" = "carro",
  cenarioTrajeto: "urbano" | "rodovia" | "misto" = "urbano",
): ResultadoVarreduraCompleta {
  const perfilTeste: PerfilUsoOperacional = {
    horasMovimentoPorDia,
    diasPorMes: 30,
    cenarioTrajeto,
    tipoVeiculo,
  };

  const timersMov: number[] = [];
  for (let t = 10; t <= 30; t++) timersMov.push(t); // 21 valores

  const angulosGraus: number[] = [];
  for (let a = 8; a <= 25; a++) angulosGraus.push(a); // 18 valores

  const filtrosCurva: number[] = [];
  for (let f = 3; f <= 15; f++) filtrosCurva.push(f); // 13 valores

  const hbtsLigados = [60, 90, 120, 150, 180, 210, 240, 270, 300]; // 9 valores
  const hbtsDesligados = [120, 180, 240, 300, 360, 420, 480, 540, 600]; // 9 valores
  const timersParados = [600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600]; // 11 valores
  const modosGaragem = [true, false]; // 2 valores
  const sensores = [1, 2, 3, 4, 5]; // 5 valores
  const pacotesEstendidos = [true, false]; // 2 valores
  const angulosHabs = [true, false]; // 2 valores

  const contadoresDescarte: ContadoresDescarteAberracoes = {
    semModoGaragem: 0,
    semMcu: 0,
    sensorInstavel: 0,
    timerParadoInadequado: 0,
    hbtParadoInadequado: 0,
    hbtMovInadequado: 0,
    semInflexao: 0,
    temJitterReta: 0,
    perdeCurvasCriticas: 0,
    filtroIncoerente: 0,
    filtroCurto: 0,
    timerInadequado: 0,
    violouMargemSeguranca: 0,
  };

  const resultadosValidos: ResultadoAutoOtimizador[] = [];
  let totalTestadas = 0;
  let totalDescartadas = 0;

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
                      totalTestadas++;

                      // Filtragem sequencial de qualquer combinação que apresente alertas ou erros:
                      if (!modoGaragem) {
                        contadoresDescarte.semModoGaragem++;
                        totalDescartadas++;
                        continue;
                      }
                      if (!pacoteEstendido) {
                        contadoresDescarte.semMcu++;
                        totalDescartadas++;
                        continue;
                      }
                      if (sensor <= 2) {
                        contadoresDescarte.sensorInstavel++;
                        totalDescartadas++;
                        continue;
                      }
                      if (timerParado < 1800) {
                        contadoresDescarte.timerParadoInadequado++;
                        totalDescartadas++;
                        continue;
                      }
                      if (hbtDesligado < 240) {
                        contadoresDescarte.hbtParadoInadequado++;
                        totalDescartadas++;
                        continue;
                      }
                      if (hbtLigado < 90 || hbtLigado > 240) {
                        contadoresDescarte.hbtMovInadequado++;
                        totalDescartadas++;
                        continue;
                      }
                      if (!anguloHab) {
                        contadoresDescarte.semInflexao++;
                        totalDescartadas++;
                        continue;
                      }
                      if (angulo > 20) {
                        contadoresDescarte.perdeCurvasCriticas++;
                        totalDescartadas++;
                        continue;
                      }
                      if (filtro < 5) {
                        contadoresDescarte.filtroCurto++;
                        totalDescartadas++;
                        continue;
                      }
                      if (filtro >= timerMov) {
                        contadoresDescarte.filtroIncoerente++;
                        totalDescartadas++;
                        continue;
                      }
                      if (timerMov < 12 || timerMov > 22) {
                        contadoresDescarte.timerInadequado++;
                        totalDescartadas++;
                        continue;
                      }

                      // Parâmetros aprovados estruturalmente: submete à simulação física holística
                      const candidato: ParametrosPadraoComparativo = {
                        nome: "Candidato",
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

                      const r = calcularMetricasFisicasJ16(candidato, perfilTeste);

                      // Teste Empírico de Ruído de Reta: descarta se comprovado pelo teste que há disparos espúrios
                      if (r.pingsEspuriosRetaDia > 0) {
                        contadoresDescarte.temJitterReta++;
                        totalDescartadas++;
                        continue;
                      }

                      // Alerta de Margem Segura: descarta qualquer combinação que ultrapasse 16.0 MB/mês
                      if (r.estourouFranquia || r.violouMargemSeguranca || r.mbTotaisMes > 16.0) {
                        contadoresDescarte.violouMargemSeguranca++;
                        totalDescartadas++;
                        continue;
                      }

                      resultadosValidos.push(r);
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

  // Ordenação por Máxima Qualidade Viária (scoreQualidadeTotal decrescente, desempate por menor MB)
  resultadosValidos.sort((a, b) => {
    if (b.scoreQualidadeTotal !== a.scoreQualidadeTotal) {
      return b.scoreQualidadeTotal - a.scoreQualidadeTotal;
    }
    if (a.mbTotaisMes !== b.mbTotaisMes) {
      return a.mbTotaisMes - b.mbTotaisMes;
    }
    return b.curvasDetectadasPct - a.curvasDetectadasPct;
  });

  // Top 10 com estratégias viárias distintas
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

  // Campeão com Refinamento Fino Automático
  const campeaoBase = resultadosValidos[0];
  let campeaoRefinado = campeaoBase;
  if (campeaoBase) {
    const paramsBase: ParametrosPadraoComparativo = {
      nome: "Campeão Base Varredura",
      timerMovimento: campeaoBase.timerMovimento,
      timerParado: campeaoBase.timerParado,
      anguloHabilitado: campeaoBase.anguloHabilitado,
      anguloGrau: campeaoBase.anguloGrau,
      anguloIntervalo: campeaoBase.anguloIntervalo,
      hbtLigado: campeaoBase.hbtLigado,
      hbtDesligado: campeaoBase.hbtDesligado,
      modoEconomiaParada: campeaoBase.modoEconomiaParada,
      sensibilidadeGSensor: campeaoBase.sensibilidadeGSensor,
      pacoteEstendidoIexvol: campeaoBase.pacoteEstendidoIexvol,
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

  // Padrão Oficial do Sistema (Padrão Voxter Homologado)
  const padraoOficialParams: ParametrosPadraoComparativo = {
    nome: "Padrão Oficial do Sistema",
    timerMovimento: 30,
    timerParado: 3600,
    anguloHabilitado: true,
    anguloGrau: 20,
    anguloIntervalo: 10,
    hbtLigado: 300,
    hbtDesligado: 300,
    modoEconomiaParada: true,
    sensibilidadeGSensor: 3,
    pacoteEstendidoIexvol: true,
  };
  const padraoOficialRes = calcularMetricasFisicasJ16(padraoOficialParams, perfilTeste);

  return {
    totalTestadas,
    totalDescartadas,
    totalAprovadas: resultadosValidos.length,
    contadoresDescarte,
    campeao: campeaoRefinado,
    top10: top10ComRefinado,
    padraoOficial: padraoOficialRes,
  };
}

/**
 * Executa o Refinamento Fino Automático (+/- 1s / +/- 1° / +/- 1s / +/- 30s)
 * ao redor do resultado campeão para cravar a calibração com máxima fidelidade e zero ruído.
 */
export function executarRefinamentoFinoJ16(
  base: ParametrosPadraoComparativo,
  perfilTeste: PerfilUsoOperacional,
): ResultadoAutoOtimizador {
  let melhor = calcularMetricasFisicasJ16(base, perfilTeste);

  const deltaTimers = [-2, -1, 0, 1, 2];
  const deltaAngulos = [-2, -1, 0, 1, 2];
  const deltaFiltros = [-2, -1, 0, 1, 2];
  const deltaHbtsLig = [-30, 0, 30];
  const deltaHbtsDeslig = [-60, 0, 60];

  for (const dt of deltaTimers) {
    const tMov = base.timerMovimento + dt;
    if (tMov < 10 || tMov > 25) continue;

    for (const da of deltaAngulos) {
      const ang = base.anguloGrau + da;
      if (ang < 10 || ang > 22) continue;

      for (const df of deltaFiltros) {
        const filt = base.anguloIntervalo + df;
        if (filt < 5 || filt >= tMov) continue;

        for (const dhl of deltaHbtsLig) {
          const hbtL = base.hbtLigado + dhl;
          if (hbtL < 90 || hbtL > 240) continue;

          for (const dhd of deltaHbtsDeslig) {
            const hbtD = base.hbtDesligado + dhd;
            if (hbtD < 240 || hbtD > 600) continue;

            const candidato: ParametrosPadraoComparativo = {
              ...base,
              timerMovimento: tMov,
              anguloGrau: ang,
              anguloIntervalo: filt,
              hbtLigado: hbtL,
              hbtDesligado: hbtD,
            };

            const r = calcularMetricasFisicasJ16(candidato, perfilTeste);

            // Rejeição estrita comprovada no teste: zero ruído e teto seguro de 16 MB
            if (r.pingsEspuriosRetaDia > 0 || r.mbTotaisMes > 16.0 || r.violouMargemSeguranca) {
              continue;
            }

            if (
              r.scoreQualidadeTotal > melhor.scoreQualidadeTotal ||
              (r.scoreQualidadeTotal === melhor.scoreQualidadeTotal &&
                r.mbTotaisMes < melhor.mbTotaisMes)
            ) {
              melhor = r;
            }
          }
        }
      }
    }
  }

  return melhor;
}
