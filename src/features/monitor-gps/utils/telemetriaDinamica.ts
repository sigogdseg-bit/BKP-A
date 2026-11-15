import { calcularDistanciaMetrosGps } from "../services/gpsService";
import type { PosicaoHistorico } from "../types";

export interface TelemetriaDinamicaCalculada {
  velocidade: number; // km/h real apurado pelo GPS
  odometroKm: number; // km total (odômetro real do veículo)
  kmPercorridoTrajeto: number; // km acumulado no trajeto
  inclinacaoGraus: number | null; // graus físicos do sensor (null se o hardware não reportar)
  forcaG: number | null; // Força G de impacto reportada pelo hardware (null se sem impacto)
  dataHora: string;
  ignicao: boolean;
}

export interface OpcoesCalculoTelemetria {
  odometroBase?: number;
  distanciaAcumuladaMetros?: number;
}

/**
 * Apura os dados reais e estritos de telemetria do ponto sem inventar grandezas sintéticas.
 * Conforme a Regra Pétrea 1 (ANTI-MOCK ABSOLUTO): se o hardware J16 não transmitir
 * giroscópio de 6 eixos ou acelerômetro contínuo, os campos permanecem null ("—" / Sem leitura).
 */
export function calcularTelemetriaPonto(
  pontoAtual:
    | PosicaoHistorico
    | {
        latitude: number;
        longitude: number;
        velocidade: number;
        data_hora_gps: string;
        rumo?: number;
        inclinacao_graus?: number;
        vibracao_g?: number;
        odometro?: number;
        ignicao?: boolean;
      },
  pontoAnterior?:
    | PosicaoHistorico
    | {
        latitude: number;
        longitude: number;
        velocidade: number;
        data_hora_gps: string;
        rumo?: number;
        inclinacao_graus?: number;
        vibracao_g?: number;
        odometro?: number;
        ignicao?: boolean;
      }
    | null,
  opcoes?: OpcoesCalculoTelemetria,
): TelemetriaDinamicaCalculada {
  const velAtual = Math.max(0, Number(pontoAtual.velocidade) || 0);
  const ignicao = pontoAtual.ignicao ?? velAtual > 2;
  const dataHora = pontoAtual.data_hora_gps || new Date().toISOString();

  // Odômetro e KM percorrido real
  const kmTrajeto = opcoes?.distanciaAcumuladaMetros ? opcoes.distanciaAcumuladaMetros / 1000 : 0;

  let odometroEfetivo: number;
  if (pontoAtual.odometro && Number(pontoAtual.odometro) > 0) {
    odometroEfetivo = Number(pontoAtual.odometro);
  } else if (opcoes?.odometroBase && opcoes.odometroBase > 0) {
    odometroEfetivo = Number((opcoes.odometroBase + kmTrajeto).toFixed(1));
  } else {
    odometroEfetivo = Number(kmTrajeto.toFixed(1));
  }

  // Leituras estritas de hardware (somente valores reais transmitidos pelo rastreador)
  const hardwareG =
    typeof pontoAtual.vibracao_g === "number" && pontoAtual.vibracao_g > 0
      ? Number(pontoAtual.vibracao_g)
      : null;

  const hardwareInclinacao =
    typeof pontoAtual.inclinacao_graus === "number" && Math.abs(pontoAtual.inclinacao_graus) > 0
      ? Number(pontoAtual.inclinacao_graus)
      : null;

  return {
    velocidade: Math.round(velAtual),
    odometroKm: odometroEfetivo,
    kmPercorridoTrajeto: Number(kmTrajeto.toFixed(2)),
    inclinacaoGraus: hardwareInclinacao,
    forcaG: hardwareG,
    dataHora,
    ignicao,
  };
}

/**
 * Pré-calcula a telemetria estrita de todos os pontos de um trajeto com odômetro cumulativo.
 */
export function enriquecerPontosComTelemetria(
  pontos: PosicaoHistorico[],
  odometroBase?: number,
): Array<PosicaoHistorico & { telemetriaDinamica: TelemetriaDinamicaCalculada }> {
  let distanciaAcumulada = 0;

  return pontos.map((ponto, i) => {
    const anterior = i > 0 ? pontos[i - 1] : null;

    if (anterior) {
      const dMetros = calcularDistanciaMetrosGps(
        anterior.latitude,
        anterior.longitude,
        ponto.latitude,
        ponto.longitude,
      );
      if (dMetros > 0 && dMetros < 5000) {
        distanciaAcumulada += dMetros;
      }
    }

    const telemetria = calcularTelemetriaPonto(ponto, anterior, {
      odometroBase,
      distanciaAcumuladaMetros: distanciaAcumulada,
    });

    return {
      ...ponto,
      inclinacao_graus: telemetria.inclinacaoGraus ?? undefined,
      vibracao_g: telemetria.forcaG ?? undefined,
      telemetriaDinamica: telemetria,
    };
  });
}

/**
 * Gera o layout canônico em HTML do balão informativo de telemetria para popups 2D e 3D.
 * Exibe fielmente a velocidade, odômetro e horário daquele momento, indicando com
 * integridade caso o rastreador J16 não possua sensor contínuo de inclinação/giroscópio.
 */
export function gerarHtmlBalaoTelemetria(
  telemetria: TelemetriaDinamicaCalculada,
  indice: number,
  total: number,
): string {
  const d = new Date(telemetria.dataHora);
  const dataFormatada = d.toLocaleDateString("pt-BR");
  const horaFormatada = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dataHoraMomento = `${horaFormatada} · ${dataFormatada}`;
  const odometroFmt = telemetria.odometroKm.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return `
    <div class="hunter-telemetria-popup" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-width: 230px; max-width: 280px; padding: 4px; color: #0F172A; text-align: left; box-sizing: border-box;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #10B981; padding-bottom: 6px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10B981; box-shadow: 0 0 8px #10B981;"></span>
          <span style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #047857;">MÉTRICA DO TRAJETO</span>
        </div>
        <span style="font-family: monospace; font-size: 10px; font-weight: 800; background: #F1F5F9; color: #334155; padding: 2px 7px; border-radius: 6px; border: 1px solid #CBD5E1;">
          Ponto ${indice + 1}/${total}
        </span>
      </div>

      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 11px; color: #64748B; font-weight: 700; display: flex; align-items: center; gap: 4px;">
          <span>🕒</span> Horário:
        </span>
        <span style="font-family: monospace; font-size: 12px; font-weight: 900; color: #0F172A;">
          ${dataHoraMomento}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-family: monospace;">
        <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 8px; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.04em;">Velocidade</div>
          <div style="font-size: 16px; font-weight: 900; color: #065F46; line-height: 1.2; margin-top: 2px;">
            ${telemetria.velocidade} <span style="font-size: 10px; font-weight: 700;">km/h</span>
          </div>
          <div style="font-size: 8px; color: #047857; margin-top: 2px; font-weight: 700;">GPS Real</div>
        </div>

        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px 8px;">
          <div style="font-size: 9px; font-weight: 800; color: #1D4ED8; text-transform: uppercase; letter-spacing: 0.04em;">Hodômetro</div>
          <div style="font-size: 13px; font-weight: 900; color: #1E40AF; line-height: 1.2; margin-top: 2px; white-space: nowrap;">
            ${odometroFmt} <span style="font-size: 9px; font-weight: 700;">km</span>
          </div>
          <div style="font-size: 8px; color: #1D4ED8; margin-top: 2px; font-weight: 700;">Odometria</div>
        </div>

        <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-size: 9px; font-weight: 800; color: #B45309; text-transform: uppercase; letter-spacing: 0.04em;">Inclinação</div>
            <div style="font-size: ${telemetria.inclinacaoGraus !== null ? "15px" : "11px"}; font-weight: 900; color: #92400E; line-height: 1.2; margin-top: 2px;">
              ${telemetria.inclinacaoGraus !== null ? `${telemetria.inclinacaoGraus}°` : "Sem registro"}
            </div>
          </div>
          <div style="font-size: 7.5px; color: #B45309; margin-top: 3px; font-weight: 600; line-height: 1.1;">
            ${telemetria.inclinacaoGraus !== null ? "Sensor Físico" : "Registrada apenas em rampa acentuada ou capotamento"}
          </div>
        </div>

        <div style="background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-size: 9px; font-weight: 800; color: #BE123C; text-transform: uppercase; letter-spacing: 0.04em;">Força G</div>
            <div style="font-size: ${telemetria.forcaG !== null ? "15px" : "11px"}; font-weight: 900; color: #9F1239; line-height: 1.2; margin-top: 2px;">
              ${telemetria.forcaG !== null ? `${telemetria.forcaG.toFixed(2)} G` : "Sem registro"}
            </div>
          </div>
          <div style="font-size: 7.5px; color: #BE123C; margin-top: 3px; font-weight: 600; line-height: 1.1;">
            ${telemetria.forcaG !== null ? "Alerta Impacto" : "Registrada apenas em colisão, impacto ou desaceleração severa"}
          </div>
        </div>
      </div>

      <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #CBD5E1; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: space-between; color: #475569;">
        <span style="color: #047857;">📡 Registro GPS Real</span>
        <span>🔑 ${telemetria.ignicao ? "Ignição Ligada" : "Ignição Desligada"}</span>
      </div>
    </div>
  `;
}

/**
 * Calcula o rumo de direção em graus (0° a 360°) de um ponto.
 * Se o hardware não tiver transmitido rumo ou for 0, calcula com base no vetor
 * de deslocamento em relação ao ponto seguinte ou anterior.
 */
export function calcularRumoPonto(
  pontoAtual: { latitude: number; longitude: number; rumo?: number },
  pontoProximo?: { latitude: number; longitude: number } | null,
  pontoAnterior?: { latitude: number; longitude: number } | null,
): number {
  if (
    typeof pontoAtual.rumo === "number" &&
    !isNaN(pontoAtual.rumo) &&
    pontoAtual.rumo > 0 &&
    pontoAtual.rumo <= 360
  ) {
    return Math.round(pontoAtual.rumo);
  }

  // Direção em direção ao próximo ponto
  if (pontoProximo) {
    const dLng = pontoProximo.longitude - pontoAtual.longitude;
    const dLat = pontoProximo.latitude - pontoAtual.latitude;
    if (Math.hypot(dLng, dLat) > 0.000005) {
      const rad = Math.atan2(dLng, dLat);
      const deg = (rad * 180) / Math.PI;
      return Math.round((deg + 360) % 360);
    }
  }

  // Direção originária do ponto anterior
  if (pontoAnterior) {
    const dLng = pontoAtual.longitude - pontoAnterior.longitude;
    const dLat = pontoAtual.latitude - pontoAnterior.latitude;
    if (Math.hypot(dLng, dLat) > 0.000005) {
      const rad = Math.atan2(dLng, dLat);
      const deg = (rad * 180) / Math.PI;
      return Math.round((deg + 360) % 360);
    }
  }

  return 0;
}

/**
 * Gera o layout canônico em HTML do balão informativo da parada com endereço completo.
 */
export function gerarHtmlBalaoParada(
  parada: {
    ordem: number;
    latitude: number;
    longitude: number;
    inicio_at: string;
    fim_at: string;
    duracaoFormatada: string;
    endereco?: string;
  },
  endereco?: string,
): string {
  const enderecoTxt =
    endereco || parada.endereco || `${parada.latitude.toFixed(5)}, ${parada.longitude.toFixed(5)}`;
  const inicioFmt = new Date(parada.inicio_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const fimFmt = new Date(parada.fim_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dataFmt = new Date(parada.inicio_at).toLocaleDateString("pt-BR");

  return `
    <div class="hunter-parada-popup" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-width: 240px; max-width: 300px; padding: 4px; color: #0F172A; text-align: left; box-sizing: border-box;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #F59E0B; padding-bottom: 6px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #F59E0B; box-shadow: 0 0 8px #F59E0B;"></span>
          <span style="font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #B45309;">PARADA REGISTRADA</span>
        </div>
        <span style="font-family: monospace; font-size: 11px; font-weight: 900; background: #FEF3C7; color: #92400E; padding: 2px 8px; border-radius: 6px; border: 1px solid #FDE68A;">
          🅿️ Parada ${parada.ordem}
        </span>
      </div>

      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 11px; color: #B45309; font-weight: 700;">⏳ Tempo Parado:</span>
        <span style="font-family: monospace; font-size: 13px; font-weight: 900; color: #78350F;">
          ${parada.duracaoFormatada}
        </span>
      </div>

      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px; margin-bottom: 8px; font-size: 11px; line-height: 1.4;">
        <div style="font-weight: 800; color: #475569; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
          <span>📍</span> Endereço do Local:
        </div>
        <div style="font-weight: 700; color: #0F172A; word-break: break-word;">
          ${enderecoTxt}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-family: monospace; font-size: 11px; margin-bottom: 6px;">
        <div style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 4px 6px;">
          <div style="font-size: 9px; color: #64748B; font-weight: 700;">Início</div>
          <div style="font-weight: 900; color: #0F172A;">${inicioFmt}</div>
        </div>
        <div style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 4px 6px;">
          <div style="font-size: 9px; color: #64748B; font-weight: 700;">Retomada</div>
          <div style="font-weight: 900; color: #0F172A;">${fimFmt}</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #64748B; border-top: 1px dashed #CBD5E1; padding-top: 6px;">
        <span>📅 ${dataFmt}</span>
        <span style="font-family: monospace; font-size: 9px;">${parada.latitude.toFixed(5)}, ${parada.longitude.toFixed(5)}</span>
      </div>
    </div>
  `;
}

export interface InfoStatusPingReal {
  timestampFormatado: string;
  dataHoraFormatada: string;
  statusRotulo: string;
  modoDescricao: string;
  statusBadge:
    "ativo_rota" | "ativo_marcha_lenta" | "repouso_estacionado" | "sem_sinal" | "sem_leitura";
  corBadge: string;
  bgBadge: string;
  bordaBadge: string;
}

/**
 * Avalia com rigor absoluto e comprovação física o status e regime do último ping GPS recebido.
 * Proíbe terminantemente dados fictícios, contagens regressivas sintéticas ou barras simuladas.
 */
export function obterInfoPingReal(
  ultimaAtualizacao?: string | null,
  statusOperacional?: string,
  ignicao?: boolean,
  velocidade?: number,
  statusComunicacaoAtivo?: boolean,
): InfoStatusPingReal {
  if (!ultimaAtualizacao) {
    return {
      timestampFormatado: "Sem leitura",
      dataHoraFormatada: "Sem registro",
      statusRotulo: "SEM LEITURA",
      modoDescricao: "Nenhum pacote recebido",
      statusBadge: "sem_leitura",
      corBadge: "text-slate-500 dark:text-slate-400",
      bgBadge: "bg-slate-100 dark:bg-slate-800",
      bordaBadge: "border-slate-300 dark:border-slate-700",
    };
  }

  const d = new Date(ultimaAtualizacao);
  if (isNaN(d.getTime())) {
    return {
      timestampFormatado: "Registro inválido",
      dataHoraFormatada: "Data inválida",
      statusRotulo: "INVÁLIDO",
      modoDescricao: "Formato corrompido",
      statusBadge: "sem_leitura",
      corBadge: "text-rose-500",
      bgBadge: "bg-rose-500/10",
      bordaBadge: "border-rose-500/30",
    };
  }

  const horaFmt = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dataFmt = d.toLocaleDateString("pt-BR");

  const hoje = new Date();
  const ehHoje =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();

  const dataHoraFormatada = ehHoje ? `Hoje às ${horaFmt}` : `${dataFmt} às ${horaFmt}`;

  const vel = Number(velocidade) || 0;
  const isEmRota = statusOperacional === "em_rota" || vel > 2;

  // Sem sinal recente se explicitamente inativo
  if (statusComunicacaoAtivo === false) {
    return {
      timestampFormatado: horaFmt,
      dataHoraFormatada,
      statusRotulo: "SEM SINAL",
      modoDescricao: "Rastreador desconectado",
      statusBadge: "sem_sinal",
      corBadge: "text-rose-600 dark:text-rose-400",
      bgBadge: "bg-rose-500/15",
      bordaBadge: "border-rose-500/30",
    };
  }

  if (isEmRota) {
    return {
      timestampFormatado: horaFmt,
      dataHoraFormatada,
      statusRotulo: "EM TRÂNSITO",
      modoDescricao: "Transmissão ativa (15s)",
      statusBadge: "ativo_rota",
      corBadge: "text-orange-600 dark:text-orange-400",
      bgBadge: "bg-orange-500/15",
      bordaBadge: "border-orange-500/30",
    };
  }

  if (ignicao) {
    return {
      timestampFormatado: horaFmt,
      dataHoraFormatada,
      statusRotulo: "MARCHA LENTA",
      modoDescricao: "Motor ligado · Parado",
      statusBadge: "ativo_marcha_lenta",
      corBadge: "text-amber-600 dark:text-amber-400",
      bgBadge: "bg-amber-500/15",
      bordaBadge: "border-amber-500/30",
    };
  }

  return {
    timestampFormatado: horaFmt,
    dataHoraFormatada,
    statusRotulo: "ESTACIONADO",
    modoDescricao: "Ignição desligada",
    statusBadge: "repouso_estacionado",
    corBadge: "text-sky-600 dark:text-sky-400",
    bgBadge: "bg-sky-500/15",
    bordaBadge: "border-sky-500/30",
  };
}
