import { supabase } from "@/integrations/supabase/client";

export interface AnomaliaDetectada {
  id: string;
  veiculo_id: string;
  tipo:
    | "horario_incomum"
    | "duracao_incomum"
    | "velocidade_fora_padrao"
    | "permanencia_incomum"
    | "deslocamento_atipico"
    | "suspeita_jammer"
    | "descarga_parasita_bateria";
  titulo: string;
  descricao: string;
  dadosReferencia: {
    valorObservado: string | number;
    padraoHistorico: string | number;
    unidade?: string;
  };
  relevancia: "baixa" | "media" | "alta" | "critica";
  dataHora: string;
}

export interface BaselineHistoricoVeiculo {
  totalViagensAnalisadas: number;
  duracaoMediaMinutos: number;
  velocidadeMediaGeral: number;
  velocidadeMaximaTipica: number;
  horariosMaisFrequentes: number[]; // horas do dia [6, 7, 8, 18, 19]
}

/**
 * Calcula o perfil estatístico base do veículo com base nas últimas viagens
 */
export async function calcularBaselineHistorico(
  veiculoId: string,
): Promise<BaselineHistoricoVeiculo> {
  try {
    const { data: viagens, error } = await supabase
      .from("viagens_trajetos")
      .select("inicio_at, fim_at, km_percorrido, velocidade_media, velocidade_maxima")
      .eq("veiculo_id", veiculoId)
      .order("inicio_at", { ascending: false })
      .limit(60);

    if (error || !viagens || viagens.length === 0) {
      return {
        totalViagensAnalisadas: 0,
        duracaoMediaMinutos: 30,
        velocidadeMediaGeral: 45,
        velocidadeMaximaTipica: 90,
        horariosMaisFrequentes: [7, 8, 9, 12, 13, 17, 18, 19],
      };
    }

    let somaDuracao = 0;
    let somaVelMedia = 0;
    let maxVelTotal = 0;
    const contagemHoras: Record<number, number> = {};

    for (const v of viagens) {
      const vMedia = Number(v.velocidade_media) || 0;
      const vMax = Number(v.velocidade_maxima) || 0;
      somaVelMedia += vMedia;
      if (vMax > maxVelTotal) maxVelTotal = vMax;

      if (v.inicio_at && v.fim_at) {
        const ms = new Date(v.fim_at).getTime() - new Date(v.inicio_at).getTime();
        if (ms > 0) {
          somaDuracao += ms / (1000 * 60);
        }
      }

      if (v.inicio_at) {
        const hora = new Date(v.inicio_at).getHours();
        contagemHoras[hora] = (contagemHoras[hora] || 0) + 1;
      }
    }

    const n = viagens.length;
    const duracaoMedia = Math.round(somaDuracao / n) || 30;
    const velMedia = Math.round(somaVelMedia / n) || 45;

    // Horários com frequência >= 10% das viagens
    const horasFreq = Object.entries(contagemHoras)
      .filter(([_, qtd]) => qtd >= Math.max(1, Math.round(n * 0.1)))
      .map(([h]) => Number(h));

    return {
      totalViagensAnalisadas: n,
      duracaoMediaMinutos: duracaoMedia,
      velocidadeMediaGeral: velMedia,
      velocidadeMaximaTipica: Math.round(maxVelTotal * 0.95) || 90,
      horariosMaisFrequentes: horasFreq.length > 0 ? horasFreq : [7, 8, 12, 17, 18],
    };
  } catch {
    return {
      totalViagensAnalisadas: 0,
      duracaoMediaMinutos: 30,
      velocidadeMediaGeral: 45,
      velocidadeMaximaTipica: 90,
      horariosMaisFrequentes: [7, 8, 12, 17, 18],
    };
  }
}

/**
 * Avalia anomalias comportamentais comparando o estado/viagem atual com o histórico
 */
export function avaliarComportamentoVeiculo(
  baseline: BaselineHistoricoVeiculo,
  dadosViagemAtual: {
    inicioAt: Date;
    duracaoMinutosAtual?: number;
    velocidadeAtual?: number;
  },
): AnomaliaDetectada | null {
  if (baseline.totalViagensAnalisadas < 3) {
    // Poucos dados históricos para determinar comportamento com precisão
    return null;
  }

  const horaInicio = dadosViagemAtual.inicioAt.getHours();

  // 1. Anomalia de Horário Incomum: Início de viagem em horário da madrugada sem precedentes
  if (horaInicio >= 0 && horaInicio <= 4 && !baseline.horariosMaisFrequentes.includes(horaInicio)) {
    return {
      id: `anomalia_hora_${Date.now()}`,
      veiculo_id: "",
      tipo: "horario_incomum",
      titulo: "Comportamento fora do padrão: Horário incomum",
      descricao: `Veículo em utilização às ${dadosViagemAtual.inicioAt.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })}, horário não frequente no histórico de viagens.`,
      dadosReferencia: {
        valorObservado: `${horaInicio}h`,
        padraoHistorico: baseline.horariosMaisFrequentes.join("h, ") + "h",
      },
      relevancia: "media",
      dataHora: dadosViagemAtual.inicioAt.toISOString(),
    };
  }

  // 2. Anomalia de Duração Incomum: Viagem com duração mais de 3x superior à média
  if (
    dadosViagemAtual.duracaoMinutosAtual &&
    dadosViagemAtual.duracaoMinutosAtual > baseline.duracaoMediaMinutos * 3 &&
    dadosViagemAtual.duracaoMinutosAtual > 90
  ) {
    return {
      id: `anomalia_dur_${Date.now()}`,
      veiculo_id: "",
      tipo: "duracao_incomum",
      titulo: "Comportamento fora do padrão: Duração incomum",
      descricao: `Viagem em andamento há ${Math.round(
        dadosViagemAtual.duracaoMinutosAtual,
      )} min, valor consideravelmente superior à média histórica do veículo (${
        baseline.duracaoMediaMinutos
      } min).`,
      dadosReferencia: {
        valorObservado: `${Math.round(dadosViagemAtual.duracaoMinutosAtual)} min`,
        padraoHistorico: `${baseline.duracaoMediaMinutos} min`,
      },
      relevancia: "baixa",
      dataHora: new Date().toISOString(),
    };
  }

  // 3. Velocidade muito acima do padrão registrado
  if (
    dadosViagemAtual.velocidadeAtual &&
    dadosViagemAtual.velocidadeAtual > baseline.velocidadeMaximaTipica + 30
  ) {
    return {
      id: `anomalia_vel_${Date.now()}`,
      veiculo_id: "",
      tipo: "velocidade_fora_padrao",
      titulo: "Comportamento fora do padrão: Velocidade atípica",
      descricao: `Velocidade registrada de ${dadosViagemAtual.velocidadeAtual} km/h, acima do padrão usual do veículo (${baseline.velocidadeMaximaTipica} km/h).`,
      dadosReferencia: {
        valorObservado: `${dadosViagemAtual.velocidadeAtual} km/h`,
        padraoHistorico: `${baseline.velocidadeMaximaTipica} km/h`,
      },
      relevancia: "alta",
      dataHora: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Detecta suspeita de utilização de Jammer (bloqueador de sinal GPS/GSM)
 * ou corte abrupto de fiação/alimentação da bateria.
 *
 * Regra Tática: Se o veículo estava em trânsito (velocidade > 10 km/h ou ignição ligada),
 * e a transmissão de telemetria cessa sem o pacote de desligamento por mais de timeoutMinutos (padrão: 3 min).
 */
export function detectarSuspeitaJammer(
  veiculo: {
    id: string;
    placa?: string;
    marca_modelo?: string;
    ignicao: boolean;
    velocidade: number;
    latitude: number;
    longitude: number;
    ultima_atualizacao: string;
  },
  agora = new Date(),
  timeoutMinutos = 10,
): {
  suspeita: boolean;
  minutosSemSinal: number;
  ultimaVelocidade: number;
  anomalia?: AnomaliaDetectada;
} {
  if (!veiculo.ultima_atualizacao) {
    return { suspeita: false, minutosSemSinal: 0, ultimaVelocidade: veiculo.velocidade || 0 };
  }

  const ultimaData = new Date(veiculo.ultima_atualizacao);
  if (isNaN(ultimaData.getTime())) {
    return { suspeita: false, minutosSemSinal: 0, ultimaVelocidade: veiculo.velocidade || 0 };
  }

  const diffMs = agora.getTime() - ultimaData.getTime();
  const minutosSemSinal = Math.floor(diffMs / (1000 * 60));

  // O veículo estava em trânsito comprovado na via (ignição ligada E velocidade expressiva >= 20 km/h)
  // Ignora velocidades residuais, estacionamento, manobras ou oscilação comum de sinal GSM urbana
  const estavaEmTransito =
    veiculo.ignicao === true && veiculo.velocidade !== undefined && veiculo.velocidade >= 20;

  if (estavaEmTransito && minutosSemSinal >= timeoutMinutos) {
    const anomalia: AnomaliaDetectada = {
      id: `jammer_${veiculo.id}_${Date.now()}`,
      veiculo_id: veiculo.id,
      tipo: "suspeita_jammer",
      titulo: "ALERTA MÁXIMO: Suspeita de Jammer / Silenciamento Súbito",
      descricao: `O veículo ${veiculo.placa || ""} perdeu contato abruptamente enquanto estava em trânsito (${
        veiculo.velocidade ? `${veiculo.velocidade} km/h` : "ignição ligada"
      }). Ausência de pacotes há ${minutosSemSinal} min sem evento de desligamento normal. Suspeita de bloqueador de sinal celular/GPS ou corte de energia.`,
      dadosReferencia: {
        valorObservado: `${minutosSemSinal} min sem sinal`,
        padraoHistorico: `Último estado: ${veiculo.velocidade || 0} km/h (ignição ${
          veiculo.ignicao ? "ligada" : "desligada"
        })`,
      },
      relevancia: "critica",
      dataHora: ultimaData.toISOString(),
    };

    return {
      suspeita: true,
      minutosSemSinal,
      ultimaVelocidade: veiculo.velocidade || 0,
      anomalia,
    };
  }

  return {
    suspeita: false,
    minutosSemSinal,
    ultimaVelocidade: veiculo.velocidade || 0,
  };
}

/**
 * Detecta alerta preditivo de descarga parasita na bateria principal do veículo (12V ou 24V).
 * Avalia quando o veículo está estacionado (ignição desligada) por tempo prolongado
 * e a voltagem apresenta queda anômala contínua (ex: queda > 0.45V ou tensão < 11.9V).
 */
export function detectarDescargaParasitaBateria(
  veiculo: {
    id: string;
    placa?: string;
    ignicao: boolean;
    bateria_veiculo_v?: number | null;
  },
  historicoVoltagem: Array<{
    dataHora: string | Date;
    voltagem: number;
    ignicao: boolean;
  }>,
): {
  detectado: boolean;
  tensaoAtual: number;
  tensaoInicial: number;
  quedaVolts: number;
  horasEstacionado: number;
  anomalia?: AnomaliaDetectada;
} {
  const tensaoAtual = Number(veiculo.bateria_veiculo_v) || 0;
  if (tensaoAtual <= 0 || historicoVoltagem.length < 2) {
    return {
      detectado: false,
      tensaoAtual,
      tensaoInicial: tensaoAtual,
      quedaVolts: 0,
      horasEstacionado: 0,
    };
  }

  // Filtra apenas pontos com ignição desligada para isolar descarga puramente parasita
  const pontosEstacionado = historicoVoltagem.filter(
    (p) => !p.ignicao && p.voltagem > 5 && p.voltagem < 32,
  );
  if (pontosEstacionado.length < 2) {
    return {
      detectado: false,
      tensaoAtual,
      tensaoInicial: tensaoAtual,
      quedaVolts: 0,
      horasEstacionado: 0,
    };
  }

  // Ponto mais antigo estacionado vs mais recente
  const primeiroPonto = pontosEstacionado[0];
  const ultimoPonto = pontosEstacionado[pontosEstacionado.length - 1];

  const tPrimeiro = new Date(primeiroPonto.dataHora).getTime();
  const tUltimo = new Date(ultimoPonto.dataHora).getTime();
  const horasEstacionado = Math.max(0, Math.round((tUltimo - tPrimeiro) / (1000 * 60 * 60)));

  const tensaoInicial = primeiroPonto.voltagem;
  const quedaVolts = Math.round((tensaoInicial - tensaoAtual) * 100) / 100;

  // Critérios Preditivos:
  // 1. Queda >= 0.45V em mais de 12 horas estacionado
  // 2. Ou voltagem atual abaixo de 11.8V (para baterias 12V normais)
  const ehCritico = tensaoAtual > 9.0 && tensaoAtual <= 11.6;
  const ehAlerta =
    (quedaVolts >= 0.45 && horasEstacionado >= 12) || (tensaoAtual > 9.0 && tensaoAtual <= 11.9);

  if (ehAlerta || ehCritico) {
    return {
      detectado: true,
      tensaoAtual,
      tensaoInicial,
      quedaVolts,
      horasEstacionado,
      anomalia: {
        id: `anomalia_bateria_${veiculo.id}_${Date.now()}`,
        veiculo_id: veiculo.id,
        tipo: "descarga_parasita_bateria",
        titulo: ehCritico
          ? "Alerta Crítico: Bateria com Risco Iminente de Não Partida"
          : "Alerta Preditivo: Descarga Parasita de Bateria Detectada",
        descricao: `A bateria do veículo ${veiculo.placa || ""} apresentou queda de ${tensaoInicial.toFixed(1)}V para ${tensaoAtual.toFixed(1)}V (${quedaVolts > 0 ? "-" + quedaVolts.toFixed(1) + "V" : "tensão baixa"}) após ${horasEstacionado}h estacionado. Verifique possíveis consumidores em stand-by.`,
        dadosReferencia: {
          valorObservado: `${tensaoAtual.toFixed(1)}V`,
          padraoHistorico: `${tensaoInicial.toFixed(1)}V (nominal: 12.6V)`,
          unidade: "V",
        },
        relevancia: ehCritico ? "critica" : "alta",
        dataHora: new Date().toISOString(),
      },
    };
  }

  return { detectado: false, tensaoAtual, tensaoInicial, quedaVolts, horasEstacionado };
}
