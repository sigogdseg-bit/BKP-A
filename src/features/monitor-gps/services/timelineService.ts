import { supabase } from "@/integrations/supabase/client";
import { canonicalGpsOdometryEngine } from "@/shared/lib/gpsOdometryEngine";
import { isCicloViagemReal } from "./gpsService";

export interface EventoTimeline {
  id: string;
  veiculo_id: string;
  tipo:
    | "ignicao_ligada"
    | "ignicao_desligada"
    | "deslocamento_iniciado"
    | "parada_estacionado"
    | "entrada_area"
    | "saida_area"
    | "excesso_velocidade"
    | "perda_comunicacao"
    | "retorno_comunicacao"
    | "baixa_tensao"
    | "anomalia"
    | "desvio_rota";
  titulo: string;
  descricao: string;
  severidade: "info" | "aviso" | "critico";
  latitude?: number | null;
  longitude?: number | null;
  velocidade?: number | null;
  detalhes?: any;
  data_hora: string;
}

export interface CicloViagemConsolidado {
  id: string;
  veiculoId: string;
  numeroCiclo: number;
  inicioAt: string;
  fimAt: string | null;
  duracaoMinutos: number;
  duracaoFormatada: string;
  kmPercorrido: number;
  velocidadeMedia: number;
  velocidadeMaxima: number;
  minutosEmMovimento: number;
  minutosEmMovimentoFormatado: string;
  minutosMarchaLenta: number;
  minutosMarchaLentaFormatado: string;
  emAndamento: boolean;
  tempoEstacionadoAnteriorMinutos?: number;
  tempoEstacionadoAnteriorFormatado?: string;
  eventos: EventoTimeline[];
  pontoInicial?: { latitude: number; longitude: number };
  pontoFinal?: { latitude: number; longitude: number };
}

export interface ResumoDiarioVeiculo {
  dataReferencia: string;
  totalViagens: number;
  kmTotalPercorrido: number;
  minutosEmMovimento: number;
  minutosMarchaLenta: number;
  minutosParado: number;
  tempoEmMovimentoFormatado: string;
  tempoMarchaLentaFormatado: string;
  tempoParadoFormatado: string;
  velocidadeMaximaDia: number;
  excessosVelocidade: number;
  saidasArea: number;
  perdasComunicacao: number;
  anomalias: number;
}

export function formatarMinutosParaHorasEMinutos(minutos: number): string {
  if (minutos < 1) return "0 min";
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h === 0) return `${m} min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Registra um evento no feed cronológico do veículo
 */
export async function registrarEventoVeiculo(params: {
  veiculoId: string;
  clienteId?: string | null;
  tipo: EventoTimeline["tipo"];
  titulo: string;
  descricao: string;
  severidade?: EventoTimeline["severidade"];
  latitude?: number | null;
  longitude?: number | null;
  velocidade?: number | null;
  detalhes?: any;
  dataHora?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from("eventos_veiculo").insert({
      veiculo_id: params.veiculoId,
      cliente_id: params.clienteId || null,
      tipo: params.tipo,
      titulo: params.titulo,
      descricao: params.descricao,
      severidade: params.severidade || "info",
      latitude: params.latitude || null,
      longitude: params.longitude || null,
      velocidade: params.velocidade || null,
      detalhes: params.detalhes || null,
      data_hora: params.dataHora || new Date().toISOString(),
    });

    return !error;
  } catch {
    return false;
  }
}

/**
 * Carrega a timeline cronológica do veículo para a data especificada (ou hoje)
 */
export async function carregarTimelineVeiculo(
  veiculoId: string,
  dataFiltro = new Date(),
): Promise<EventoTimeline[]> {
  try {
    const inicioDia = new Date(dataFiltro);
    inicioDia.setHours(0, 0, 0, 0);

    const fimDia = new Date(dataFiltro);
    fimDia.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("eventos_veiculo")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .gte("data_hora", inicioDia.toISOString())
      .lte("data_hora", fimDia.toISOString())
      .order("data_hora", { ascending: false })
      .limit(100);

    if (error || !data) return [];
    return data as EventoTimeline[];
  } catch {
    return [];
  }
}

/**
 * Calcula o resumo consolidado do dia para o veículo com tempo rodando e marcha lenta
 */
export async function calcularResumoDiario(
  veiculoId: string,
  dataFiltro = new Date(),
): Promise<ResumoDiarioVeiculo> {
  const dataRefStr = dataFiltro.toLocaleDateString("pt-BR");

  const inicioDia = new Date(dataFiltro);
  inicioDia.setHours(0, 0, 0, 0);

  const fimDia = new Date(dataFiltro);
  fimDia.setHours(23, 59, 59, 999);

  try {
    // 1. Viagens do dia
    const { data: viagens } = await supabase
      .from("viagens_trajetos")
      .select("id, km_percorrido, inicio_at, fim_at, velocidade_maxima")
      .eq("veiculo_id", veiculoId)
      .gte("inicio_at", inicioDia.toISOString())
      .lte("inicio_at", fimDia.toISOString())
      .order("inicio_at", { ascending: true });

    let kmTotal = 0;
    let minutosMovimento = 0;
    let minutosMarchaLenta = 0;
    let velMaxDia = 0;

    const viagensReais = (viagens || []).filter(isCicloViagemReal);

    if (viagensReais.length > 0) {
      for (const v of viagensReais) {
        kmTotal += Number(v.km_percorrido) || 0;
        if (v.velocidade_maxima && Number(v.velocidade_maxima) > velMaxDia) {
          velMaxDia = Number(v.velocidade_maxima);
        }

        if (v.inicio_at) {
          const fimViagem = v.fim_at ? new Date(v.fim_at) : new Date();
          const diffMs = fimViagem.getTime() - new Date(v.inicio_at).getTime();
          const duracaoMinTotal = diffMs > 0 ? Math.round(diffMs / (1000 * 60)) : 0;

          // Busca telemetria rápida dessa viagem para separar trânsito vs marcha lenta
          const { data: pontos } = await supabase
            .from("telemetria_posicoes")
            .select("velocidade, ignicao, data_hora_gps")
            .eq("veiculo_id", veiculoId)
            .gte("data_hora_gps", v.inicio_at)
            .lte("data_hora_gps", fimViagem.toISOString())
            .order("data_hora_gps", { ascending: true });

          if (pontos && pontos.length > 1) {
            let ptsMov = 0;
            let ptsIdling = 0;
            for (const p of pontos) {
              if (Number(p.velocidade || 0) > 3) {
                ptsMov++;
              } else if (p.ignicao) {
                ptsIdling++;
              }
            }
            const totalPts = ptsMov + ptsIdling;
            if (totalPts > 0) {
              const mov = Math.round((ptsMov / totalPts) * duracaoMinTotal);
              const ocioso = Math.max(0, duracaoMinTotal - mov);
              minutosMovimento += mov;
              minutosMarchaLenta += ocioso;
            } else {
              minutosMovimento += duracaoMinTotal;
            }
          } else {
            // Sem pontos suficientes, assume tempo de viagem como movimento
            minutosMovimento += duracaoMinTotal;
          }
        }
      }
    }

    // 2. Eventos do dia
    const { data: eventos } = await supabase
      .from("eventos_veiculo")
      .select("tipo, severidade")
      .eq("veiculo_id", veiculoId)
      .gte("data_hora", inicioDia.toISOString())
      .lte("data_hora", fimDia.toISOString());

    let excessos = 0;
    let saidas = 0;
    let perdas = 0;
    let anomalias = 0;

    if (eventos) {
      for (const ev of eventos) {
        if (ev.tipo === "excesso_velocidade") excessos++;
        if (ev.tipo === "saida_area") saidas++;
        if (ev.tipo === "perda_comunicacao") perdas++;
        if (ev.tipo === "anomalia") anomalias++;
      }
    }

    // Minutos decorridos no dia até o momento (máximo 1440 min = 24h)
    const minutosAteAgora = Math.min(
      1440,
      Math.max(1, Math.floor((dataFiltro.getTime() - inicioDia.getTime()) / (1000 * 60))),
    );

    // Blindagem cinemática: a soma de tempo em movimento e marcha lenta jamais excede os minutos do dia
    minutosMovimento = Math.min(minutosMovimento, minutosAteAgora);
    minutosMarchaLenta = Math.min(
      minutosMarchaLenta,
      Math.max(0, minutosAteAgora - minutosMovimento),
    );
    const minutosParadoDesligado = Math.max(
      0,
      minutosAteAgora - (minutosMovimento + minutosMarchaLenta),
    );

    return {
      dataReferencia: dataRefStr,
      totalViagens: viagens?.length || 0,
      kmTotalPercorrido: Math.round(kmTotal),
      minutosEmMovimento: minutosMovimento,
      minutosMarchaLenta,
      minutosParado: minutosParadoDesligado,
      tempoEmMovimentoFormatado: formatarMinutosParaHorasEMinutos(minutosMovimento),
      tempoMarchaLentaFormatado: formatarMinutosParaHorasEMinutos(minutosMarchaLenta),
      tempoParadoFormatado: formatarMinutosParaHorasEMinutos(minutosParadoDesligado),
      velocidadeMaximaDia: velMaxDia,
      excessosVelocidade: excessos,
      saidasArea: saidas,
      perdasComunicacao: perdas,
      anomalias,
    };
  } catch (err) {
    console.warn("Erro ao calcular resumo diário:", err);
    return {
      dataReferencia: dataRefStr,
      totalViagens: 0,
      kmTotalPercorrido: 0,
      minutosEmMovimento: 0,
      minutosMarchaLenta: 0,
      minutosParado: 0,
      tempoEmMovimentoFormatado: "0 min",
      tempoMarchaLentaFormatado: "0 min",
      tempoParadoFormatado: "0 min",
      velocidadeMaximaDia: 0,
      excessosVelocidade: 0,
      saidasArea: 0,
      perdasComunicacao: 0,
      anomalias: 0,
    };
  }
}

/**
 * Carrega a lista de ciclos executivos de viagem de um veículo para a data informada
 */
export async function carregarCiclosViagem(
  veiculoId: string,
  dataFiltro = new Date(),
): Promise<CicloViagemConsolidado[]> {
  const inicioDia = new Date(dataFiltro);
  inicioDia.setHours(0, 0, 0, 0);

  const fimDia = new Date(dataFiltro);
  fimDia.setHours(23, 59, 59, 999);

  try {
    // 1. Busca as viagens do dia
    const { data: viagens, error: errViagens } = await supabase
      .from("viagens_trajetos")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .gte("inicio_at", inicioDia.toISOString())
      .lte("inicio_at", fimDia.toISOString())
      .order("inicio_at", { ascending: true });

    if (errViagens || !viagens || viagens.length === 0) {
      return [];
    }

    const viagensReais = viagens.filter(isCicloViagemReal);
    if (viagensReais.length === 0) {
      return [];
    }

    // 2. Busca eventos do dia para associar a cada ciclo
    const { data: eventos } = await supabase
      .from("eventos_veiculo")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .gte("data_hora", inicioDia.toISOString())
      .lte("data_hora", fimDia.toISOString())
      .order("data_hora", { ascending: true });

    const ciclos: CicloViagemConsolidado[] = [];

    for (let i = 0; i < viagensReais.length; i++) {
      const v = viagensReais[i];
      const dataInicio = new Date(v.inicio_at);
      const dataFim = v.fim_at ? new Date(v.fim_at) : null;
      const emAndamento = !v.fim_at || v.status === "em_andamento";

      const agora = new Date();
      const refFim = dataFim || agora;
      const diffMs = Math.max(0, refFim.getTime() - dataInicio.getTime());
      const duracaoMinTotal = Math.max(1, Math.round(diffMs / (1000 * 60)));

      // 3. Busca pontos de GPS do ciclo para telemetria fina de trânsito vs marcha lenta
      const { data: pontos } = await supabase
        .from("telemetria_posicoes")
        .select("latitude, longitude, velocidade, ignicao, data_hora_gps")
        .eq("veiculo_id", veiculoId)
        .gte("data_hora_gps", v.inicio_at)
        .lte("data_hora_gps", refFim.toISOString())
        .order("data_hora_gps", { ascending: true });

      let minutosMov = 0;
      let minutosIdling = 0;
      let pontoInicial: { latitude: number; longitude: number } | undefined;
      let pontoFinal: { latitude: number; longitude: number } | undefined;
      let kmCalculado = Number(v.km_percorrido) || 0;
      let velMax = Number(v.velocidade_maxima) || 0;

      if (pontos && pontos.length > 0) {
        pontoInicial = {
          latitude: pontos[0].latitude,
          longitude: pontos[0].longitude,
        };
        pontoFinal = {
          latitude: pontos[pontos.length - 1].latitude,
          longitude: pontos[pontos.length - 1].longitude,
        };

        // Motor de Odometria GPS de Alta Precisão (WGS-84 + Anti-Drift + Zero Fatores Fixos)
        const odometriaViagem = canonicalGpsOdometryEngine.processTrajectory(
          pontos.map((p) => ({
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            speedKmh: Number(p.velocidade || 0),
            timestamp: p.data_hora_gps,
            ignition: p.ignicao,
          })),
        );

        const kmOdometria = odometriaViagem.distanceProcessedKm;
        if (odometriaViagem.maxSpeedKmh > velMax) velMax = odometriaViagem.maxSpeedKmh;

        let ptsMov = 0;
        let ptsIdling = 0;
        for (const pt of pontos) {
          const vel = Number(pt.velocidade || 0);
          if (vel > 2.5) {
            ptsMov++;
          } else if (pt.ignicao) {
            ptsIdling++;
          }
        }

        // Se o valor gravado na viagem for nulo ou próximo de zero, adota a odometria WGS-84
        if (kmCalculado <= 0.05 && kmOdometria > 0) {
          kmCalculado = kmOdometria;
        } else if (kmOdometria > 0) {
          // Preserva a fidelidade do motor geodésico
          kmCalculado = kmOdometria;
        }

        const totalPontos = ptsMov + ptsIdling;
        if (totalPontos > 0) {
          minutosMov = Math.round((ptsMov / totalPontos) * duracaoMinTotal);
          minutosIdling = Math.max(0, duracaoMinTotal - minutosMov);
        } else {
          minutosMov = duracaoMinTotal;
        }
      } else {
        minutosMov = duracaoMinTotal;
      }

      // 4. Filtra eventos que ocorreram dentro deste ciclo
      const eventosCiclo = (eventos || []).filter((ev) => {
        const evTime = new Date(ev.data_hora).getTime();
        return evTime >= dataInicio.getTime() && evTime <= refFim.getTime();
      }) as EventoTimeline[];

      // 5. Calcula tempo que ficou estacionado antes deste ciclo começar
      let tempoEstacionadoAnteriorMin: number | undefined;
      let tempoEstacionadoAnteriorFmt: string | undefined;

      if (i > 0) {
        const viagemAnterior = viagens[i - 1];
        if (viagemAnterior.fim_at) {
          const fimAnt = new Date(viagemAnterior.fim_at).getTime();
          const diffParado = Math.max(0, dataInicio.getTime() - fimAnt);
          tempoEstacionadoAnteriorMin = Math.round(diffParado / (1000 * 60));
          tempoEstacionadoAnteriorFmt = formatarMinutosParaHorasEMinutos(
            tempoEstacionadoAnteriorMin,
          );
        }
      }

      ciclos.push({
        id: v.id,
        veiculoId: v.veiculo_id,
        numeroCiclo: i + 1,
        inicioAt: v.inicio_at,
        fimAt: v.fim_at,
        duracaoMinutos: duracaoMinTotal,
        duracaoFormatada: formatarMinutosParaHorasEMinutos(duracaoMinTotal),
        kmPercorrido: Number(kmCalculado.toFixed(3)),
        velocidadeMedia: Math.round(
          Number(v.velocidade_media) ||
            (kmCalculado > 0 ? kmCalculado / (duracaoMinTotal / 60) : 0),
        ),
        velocidadeMaxima: velMax,
        minutosEmMovimento: minutosMov,
        minutosEmMovimentoFormatado: formatarMinutosParaHorasEMinutos(minutosMov),
        minutosMarchaLenta: minutosIdling,
        minutosMarchaLentaFormatado: formatarMinutosParaHorasEMinutos(minutosIdling),
        emAndamento,
        tempoEstacionadoAnteriorMinutos: tempoEstacionadoAnteriorMin,
        tempoEstacionadoAnteriorFormatado: tempoEstacionadoAnteriorFmt,
        eventos: eventosCiclo,
        pontoInicial,
        pontoFinal,
      });
    }

    // Retorna ordenado do mais recente para o mais antigo (padrão de timeline moderna)
    return ciclos.reverse();
  } catch (err) {
    console.warn("Erro ao carregar ciclos de viagem:", err);
    return [];
  }
}
