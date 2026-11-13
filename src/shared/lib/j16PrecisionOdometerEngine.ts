/**
 * Motor Físico-Matemático de Odometria de Precisão Absoluta (Rastreador J16 / Protocolo GT06)
 * =========================================================================================
 * Geodésia Elipsoidal WGS-84, Reconstrução Diferencial de Curvas (Arco vs. Corda),
 * Fusão Doppler Cinemática e Travas Anti-Drift (Zero KM Fantasma).
 *
 * Implementação conforme especificação canônica HUNTER-GUARDIAN / DJR-NEW.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. TABELA LOOKUP CRC-ITU / CCITT (Polinômio 0x1021 / X.25)
// ─────────────────────────────────────────────────────────────────────────────

export const CRC_ITU_LOOKUP_TABLE = new Uint16Array([
  0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf, 0x8c48, 0x9dc1, 0xaf5a, 0xbed3,
  0xca6c, 0xdbe5, 0xe97e, 0xf8f7, 0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e,
  0x9cc9, 0x8d40, 0xbfdb, 0xae52, 0xdaed, 0xcb64, 0xf9ff, 0xe876, 0x2102, 0x308b, 0x0210, 0x1399,
  0x6726, 0x76af, 0x4434, 0x55bd, 0xad4a, 0xbcc3, 0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5,
  0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c, 0xbdcb, 0xac42, 0x9ed9, 0x8f50,
  0xfbef, 0xea66, 0xd8fd, 0xc974, 0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9, 0x2732, 0x36bb,
  0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3, 0x5285, 0x430c, 0x7197, 0x601e,
  0x14a1, 0x0528, 0x37b3, 0x263a, 0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72,
  0x6306, 0x728f, 0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9, 0xef4e, 0xfec7, 0xcc5c, 0xddd5,
  0xa96a, 0xb8e3, 0x8a78, 0x9bf1, 0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738,
  0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862, 0x9af9, 0x8b70, 0x8408, 0x9581, 0xa71a, 0xb693,
  0xc22c, 0xd3a5, 0xe13e, 0xf0b7, 0x0840, 0x19c9, 0x2b52, 0x3ad3, 0x4e64, 0x5fed, 0x6d76, 0x7cff,
  0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036, 0x18c1, 0x0948, 0x3bd3, 0x2a5a,
  0x5ee5, 0x4f6c, 0x7df7, 0x6c7e, 0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
  0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd, 0xb58b, 0xa402, 0x9699, 0x8710,
  0xf3af, 0xe226, 0xd0bd, 0xc134, 0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c,
  0xc60c, 0xd785, 0xe51e, 0xf497, 0x8028, 0x91a1, 0xa33a, 0xb2b3, 0x4a44, 0x5bcd, 0x6956, 0x78df,
  0x0c60, 0x1de9, 0x2f72, 0x3efb, 0xd68d, 0xc704, 0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232,
  0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a, 0xe70e, 0xf687, 0xc41c, 0xd595,
  0xa12a, 0xb0a3, 0x8238, 0x93b1, 0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb, 0x0e70, 0x1ff9,
  0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330, 0x7bc7, 0x6a4e, 0x58d5, 0x495c,
  0x3de3, 0x2c6a, 0x1ef1, 0x0f78,
]);

/**
 * Calcula o Checksum CRC-ITU (16 bits) utilizando a tabela oficial lookup.
 */
export function calcularCrcItu(buffer: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = ((crc << 8) ^ CRC_ITU_LOOKUP_TABLE[((crc >>> 8) ^ buffer[i]) & 0xff]) & 0xffff;
  }
  return ~crc & 0xffff;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARSER BINÁRIO J16 (GT06)
// ─────────────────────────────────────────────────────────────────────────────

export interface J16DecodedBase {
  protocolo: number;
  serialNumber: number;
  crcValido: boolean;
  rawBytes: Uint8Array;
}

export interface J16LoginPacket extends J16DecodedBase {
  tipoPacote: "LOGIN";
  imei: string;
}

export interface J16LocationPacket extends J16DecodedBase {
  tipoPacote: "LOCATION" | "ALARM";
  dataHoraUtc: Date;
  timestampSegundos: number;
  timestampMs: number;
  satelites: number;
  latitude: number;
  longitude: number;
  velocidadeKmh: number;
  velocidadeMs: number;
  cursoGraus: number; // Azimute (0° a 360°)
  gpsFixed: boolean; // Bit 4 do Course Status (Fix Válido)
  isDifferentialGps: boolean;
  isWest: boolean;
  isNorth: boolean;
  ignicaoAcc?: boolean; // ACC do terminal (quando presente em 0x16)
  alarmeTipo?: number;
}

export interface J16HeartbeatPacket extends J16DecodedBase {
  tipoPacote: "HEARTBEAT";
  ignicaoAcc: boolean; // Bit 1 do Terminal Information (1=Ligado, 0=Desligado)
  defesaArmada: boolean;
  alimentacaoConectada: boolean;
  bateriaNivel: number;
  gsmSinalNivel: number;
}

export interface J16OtherPacket extends J16DecodedBase {
  tipoPacote: "OUTRO";
}

export type J16ParsedPacket =
  J16LoginPacket | J16LocationPacket | J16HeartbeatPacket | J16OtherPacket;

/**
 * Parser de frames binários brutos do protocolo Concox/J16 (GT06).
 */
export class J16BinaryParser {
  private static imeiCachePorSerial = new Map<number, string>();
  private static accCachePorImei = new Map<string, boolean>();

  public static registrarAcc(imei: string, acc: boolean): void {
    this.accCachePorImei.set(imei, acc);
  }

  public static obterAcc(imei: string): boolean | undefined {
    return this.accCachePorImei.get(imei);
  }

  public static parse(data: Uint8Array): J16ParsedPacket | null {
    if (data.length < 10) return null;

    // 1. Start Bit: 0x78 0x78 ou 0x79 0x79 (extended)
    const start1 = data[0];
    const start2 = data[1];
    if ((start1 !== 0x78 || start2 !== 0x78) && (start1 !== 0x79 || start2 !== 0x79)) {
      return null;
    }

    // 2. Stop Bit: 0x0D 0x0A
    const stop1 = data[data.length - 2];
    const stop2 = data[data.length - 1];
    if (stop1 !== 0x0d || stop2 !== 0x0a) {
      return null;
    }

    // 3. Validação do CRC-ITU (2 bytes antes dos Stop Bits)
    const crcRecebido = (data[data.length - 4] << 8) | data[data.length - 3];
    const dadosParaCrc = data.subarray(2, data.length - 4);
    const crcCalculado = calcularCrcItu(dadosParaCrc);
    if (crcCalculado !== crcRecebido) {
      return null; // Checksum falhou, rejeita imediatamente
    }

    const isExtended = start1 === 0x79 && start2 === 0x79;
    const offsetProtocolo = isExtended ? 4 : 3;
    const protocolo = data[offsetProtocolo];
    const offsetPayload = isExtended ? 5 : 4;

    // Extrai Information Serial Number (2 bytes antes do CRC)
    const serialNumber = (data[data.length - 6] << 8) | data[data.length - 5];

    // ── PROTOCOLO 0x01: LOGIN (IMEI) ──────────────────────────────────────────
    if (protocolo === 0x01) {
      let imei = "";
      for (let i = 0; i < 8; i++) {
        const byte = data[offsetPayload + i];
        imei += ((byte >> 4) & 0x0f).toString(16);
        imei += (byte & 0x0f).toString(16);
      }
      if (imei.startsWith("0")) imei = imei.substring(1);
      this.imeiCachePorSerial.set(serialNumber, imei);

      return {
        tipoPacote: "LOGIN",
        protocolo,
        serialNumber,
        crcValido: true,
        imei,
        rawBytes: data,
      };
    }

    // ── PROTOCOLO 0x13: HEARTBEAT (STATUS / ACC) ──────────────────────────────
    if (protocolo === 0x13) {
      const termInfo = data[offsetPayload];
      const ignicaoAcc = (termInfo & 0x02) !== 0; // Bit 1 = ACC Alto
      const defesaArmada = (termInfo & 0x01) !== 0;
      const alimentacaoConectada = (termInfo & 0x04) !== 0;
      const bateriaNivel = data[offsetPayload + 1];
      const gsmSinalNivel = data[offsetPayload + 2];

      return {
        tipoPacote: "HEARTBEAT",
        protocolo,
        serialNumber,
        crcValido: true,
        ignicaoAcc,
        defesaArmada,
        alimentacaoConectada,
        bateriaNivel,
        gsmSinalNivel,
        rawBytes: data,
      };
    }

    // ── PROTOCOLO 0x12 (LOCATION) e 0x16 (ALARM) ──────────────────────────────
    if (protocolo === 0x12 || protocolo === 0x16) {
      const ano = 2000 + data[offsetPayload];
      const mes = data[offsetPayload + 1];
      const dia = data[offsetPayload + 2];
      const hora = data[offsetPayload + 3];
      const minuto = data[offsetPayload + 4];
      const segundo = data[offsetPayload + 5];

      const dataHoraUtc = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo));
      const timestampMs = dataHoraUtc.getTime();
      const timestampSegundos = Math.floor(timestampMs / 1000);

      const satInfo = data[offsetPayload + 6];
      const satelites = satInfo & 0x0f; // low-nibble

      // Latitude e Longitude (4 bytes cada UInt32BE) / 1.800.000
      const rawLat =
        ((data[offsetPayload + 7] << 24) |
          (data[offsetPayload + 8] << 16) |
          (data[offsetPayload + 9] << 8) |
          data[offsetPayload + 10]) >>>
        0;

      const rawLon =
        ((data[offsetPayload + 11] << 24) |
          (data[offsetPayload + 12] << 16) |
          (data[offsetPayload + 13] << 8) |
          data[offsetPayload + 14]) >>>
        0;

      const velocidadeKmh = data[offsetPayload + 15];
      const velocidadeMs = velocidadeKmh / 3.6;

      // Course / Status (2 bytes: byte1 e byte2)
      const b1 = data[offsetPayload + 16];
      const b2 = data[offsetPayload + 17];

      const isDifferentialGps = (b1 & 0x20) >> 5 === 1;
      const gpsFixed = (b1 & 0x10) !== 0; // Bit 4: 1 = Fix Válido, 0 = Sem fix
      const isWest = (b1 & 0x08) !== 0; // Bit 3: 0 = Leste (+), 1 = Oeste (-)
      const isNorth = (b1 & 0x04) !== 0; // Bit 2: 1 = Norte (+), 0 = Sul (-)

      // Azimute / Rumo: 10 bits formados por Bits 1 e 0 de b1 e 8 bits de b2
      const cursoGraus = ((b1 & 0x03) << 8) | b2;

      let latitude = rawLat / 1800000.0;
      let longitude = rawLon / 1800000.0;

      if (!isNorth) latitude = -latitude;
      if (isWest) longitude = -longitude;

      let ignicaoAcc: boolean | undefined;
      let alarmeTipo: number | undefined;

      if (protocolo === 0x16) {
        // No pacote 0x16, o byte seguinte ao status é o Terminal Information
        const termInfo = data[offsetPayload + 18];
        ignicaoAcc = (termInfo & 0x02) !== 0;
        alarmeTipo = data[offsetPayload + 19];
      }

      return {
        tipoPacote: protocolo === 0x16 ? "ALARM" : "LOCATION",
        protocolo,
        serialNumber,
        crcValido: true,
        dataHoraUtc,
        timestampSegundos,
        timestampMs,
        satelites,
        latitude,
        longitude,
        velocidadeKmh,
        velocidadeMs,
        cursoGraus,
        gpsFixed,
        isDifferentialGps,
        isWest,
        isNorth,
        ignicaoAcc,
        alarmeTipo,
        rawBytes: data,
      };
    }

    return {
      tipoPacote: "OUTRO",
      protocolo,
      serialNumber,
      crcValido: true,
      rawBytes: data,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. MODELAGEM MATEMÁTICA E FÍSICA WGS-84 (GEODÉSIA + CURVAS + FUSÃO DOPPLER)
// ─────────────────────────────────────────────────────────────────────────────

export interface KinematicPoint {
  t: number; // Unix timestamp em segundos
  latitude: number; // Graus decimais
  longitude: number; // Graus decimais
  speedKmh: number; // Velocidade em km/h
  speedMs: number; // Velocidade em m/s
  courseDegrees: number; // Curso em graus (0° a 360°)
  satellites: number;
  gpsFixed: boolean;
  ignition: boolean;
}

export interface StepDistanceResult {
  deltaDistanceMeters: number;
  deltaDistanceKm: number;
  cordaMeters: number;
  superficieMeters: number;
  arcoMeters: number;
  cinematicaMeters: number;
  fusaoAplicada: boolean;
  curvaCompensada: boolean;
  ganhoCurvaPercentual: number;
  descarteMotivo?: string;
}

export class Wgs84PhysicsEngine {
  // Constantes Elipsoidais WGS-84
  public static readonly A = 6378137.0; // Semieixo maior da Terra em metros
  public static readonly E2 = 0.00669437999014; // Primeira excentricidade ao quadrado
  public static readonly R_MEDIO_TERRA = 6371008.8; // Raio volumétrico médio da Terra

  /**
   * Raio de Curvatura Meridional (M) no sentido Norte-Sul para latitude média phi_m (em radianos)
   */
  public static raioCurvaturaMeridional(phiM: number): number {
    const sinPhi = Math.sin(phiM);
    const w = Math.sqrt(1 - this.E2 * sinPhi * sinPhi);
    return (this.A * (1 - this.E2)) / (w * w * w);
  }

  /**
   * Raio de Curvatura Primeiro Vertical (N) no sentido Leste-Oeste para latitude média phi_m (em radianos)
   */
  public static raioCurvaturaPrimeiroVertical(phiM: number): number {
    const sinPhi = Math.sin(phiM);
    const w = Math.sqrt(1 - this.E2 * sinPhi * sinPhi);
    return this.A / w;
  }

  /**
   * Distância Geodésica Elipsoidal de Corda no Plano Tangencial Local ENU (East-North-Up)
   */
  public static calcularDistanciaCordaWgs84(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = Math.PI / 180.0;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const lam1 = lon1 * toRad;
    const lam2 = lon2 * toRad;

    const phiM = (phi1 + phi2) / 2.0;
    const deltaPhi = phi2 - phi1;
    const deltaLam = lam2 - lam1;

    const M = this.raioCurvaturaMeridional(phiM);
    const N = this.raioCurvaturaPrimeiroVertical(phiM);

    const deltaYNorte = M * deltaPhi;
    const deltaXLeste = N * Math.cos(phiM) * deltaLam;

    return Math.sqrt(deltaXLeste * deltaXLeste + deltaYNorte * deltaYNorte);
  }

  /**
   * Compensação de Altitude Orbital e Relevo
   */
  public static compensarAltitudeRelevo(dCorda: number, altitudeMetros: number = 600.0): number {
    if (dCorda <= 0) return 0;
    return dCorda * (1.0 + altitudeMetros / this.R_MEDIO_TERRA);
  }

  /**
   * Reconstrução Física de Curvas (Arco vs. Corda pelo Curso θ)
   * Formulação: d_arco = d_superficie * (Δθ / 2) / sin(Δθ / 2)
   */
  public static reconstruirArcoCurva(
    dSuperficie: number,
    curso1: number,
    curso2: number,
    deltaTSegundos: number,
  ): { dArco: number; curvaCompensada: boolean; ganhoPercentual: number } {
    if (dSuperficie <= 0) {
      return { dArco: 0, curvaCompensada: false, ganhoPercentual: 0 };
    }

    // Menor diferença angular em graus no intervalo [0, 180]
    const difGraus = Math.abs(curso2 - curso1);
    const deltaThetaGraus = Math.min(difGraus, 360.0 - difGraus);
    const deltaThetaRad = (deltaThetaGraus * Math.PI) / 180.0;

    // Critério físico: curva detectada se 0.05 rad (~2.86°) < Δθ <= 2π/3 (~120°) e Δt <= 45s
    const limiteSuperior = (2.0 * Math.PI) / 3.0;
    if (deltaThetaRad > 0.05 && deltaThetaRad <= limiteSuperior && deltaTSegundos <= 45) {
      const halfTheta = deltaThetaRad / 2.0;
      const sinHalfTheta = Math.sin(halfTheta);
      if (sinHalfTheta > 1e-6) {
        const dArco = dSuperficie * (halfTheta / sinHalfTheta);
        const ganho = ((dArco - dSuperficie) / dSuperficie) * 100.0;
        return { dArco, curvaCompensada: true, ganhoPercentual: ganho };
      }
    }

    return { dArco: dSuperficie, curvaCompensada: false, ganhoPercentual: 0 };
  }

  /**
   * Fusão Sensorial Cinemática (Posição GPS + Velocidade Doppler via Regra do Trapézio)
   */
  public static fundirComDoppler(
    dArco: number,
    v1Ms: number,
    v2Ms: number,
    deltaTSegundos: number,
  ): { dFusao: number; dCinematica: number; fusaoAplicada: boolean } {
    const dCinematica = ((v1Ms + v2Ms) / 2.0) * deltaTSegundos;

    if (deltaTSegundos <= 30 && dArco > 0) {
      const epsilon = Math.abs(dArco - dCinematica) / dArco;
      // Divergência relativa <= 15% -> combina as duas medições
      if (epsilon <= 0.15) {
        const dFusao = 0.75 * dArco + 0.25 * dCinematica;
        return { dFusao, dCinematica, fusaoAplicada: true };
      }
    }

    return { dFusao: dArco, dCinematica, fusaoAplicada: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MOTOR FÍSICO-MATEMÁTICO PRINCIPAL (J16PrecisionOdometerEngine)
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleOdometerState {
  veiculoId: string;
  odometroBaseKm: number;
  odometroAtualKm: number;
  odometroPainelRealKm?: number;
  distanciaAcumuladaFisicaMetros: number;
  fatorCalibracaoK: number; // Fator K (típico 1.005 a 1.025)
  ultimoPonto?: KinematicPoint;
  ultimoTimestampMs?: number;
  totalPontosProcessados: number;
  totalPontosRejeitadosDrift: number;
  distanciaDriftEvitadaMetros: number;
  distanciaRecuperadaCurvasMetros: number;
  ultimaSincronizacaoEm?: string;
  altitudePadraoMetros: number;
}

export interface J16PrecisionOdometerConfig {
  veiculoId: string;
  odometroBaseKm?: number;
  fatorCalibracaoK?: number;
  altitudePadraoMetros?: number;
}

export class J16PrecisionOdometerEngine {
  private estado: VehicleOdometerState;

  constructor(
    veiculoIdOrConfig: string | J16PrecisionOdometerConfig,
    odometroBaseKm: number = 0,
    fatorK: number = 1.015,
    altitudePadraoMetros: number = 600.0,
  ) {
    let id: string;
    let baseKm = odometroBaseKm;
    let k = fatorK;
    let alt = altitudePadraoMetros;

    if (typeof veiculoIdOrConfig === "object" && veiculoIdOrConfig !== null) {
      id = veiculoIdOrConfig.veiculoId;
      if (veiculoIdOrConfig.odometroBaseKm !== undefined) {
        baseKm = veiculoIdOrConfig.odometroBaseKm;
      }
      if (veiculoIdOrConfig.fatorCalibracaoK !== undefined) {
        k = veiculoIdOrConfig.fatorCalibracaoK;
      }
      if (veiculoIdOrConfig.altitudePadraoMetros !== undefined) {
        alt = veiculoIdOrConfig.altitudePadraoMetros;
      }
    } else {
      id = String(veiculoIdOrConfig);
    }

    this.estado = {
      veiculoId: id,
      odometroBaseKm: baseKm,
      odometroAtualKm: baseKm,
      distanciaAcumuladaFisicaMetros: 0,
      fatorCalibracaoK: Math.max(0.95, Math.min(1.1, k)),
      totalPontosProcessados: 0,
      totalPontosRejeitadosDrift: 0,
      distanciaDriftEvitadaMetros: 0,
      distanciaRecuperadaCurvasMetros: 0,
      altitudePadraoMetros: alt,
    };
  }

  public getEstado(): Readonly<VehicleOdometerState> {
    return { ...this.estado };
  }

  /**
   * Processa a transição entre o ponto anterior e o novo ponto de telemetria
   * aplicando rigorosamente as 5 travas físicas anti-drift e o motor WGS-84.
   */
  public processarPonto(pontoAtual: KinematicPoint): StepDistanceResult {
    this.estado.totalPontosProcessados++;
    const pAnterior = this.estado.ultimoPonto;

    // Se é o primeiro ponto aceito, inicializa a referência
    if (!pAnterior) {
      if (pontoAtual.gpsFixed && pontoAtual.satellites >= 4) {
        this.estado.ultimoPonto = pontoAtual;
        this.estado.ultimoTimestampMs = pontoAtual.t * 1000;
      }
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: 0,
        superficieMeters: 0,
        arcoMeters: 0,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo: "Primeiro ponto de ancoragem estabelecido",
      };
    }

    const deltaT = pontoAtual.t - pAnterior.t;

    // ── TRAVA 1: Ordenação Cronológica e Buffer ──────────────────────────────
    if (deltaT <= 0) {
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: 0,
        superficieMeters: 0,
        arcoMeters: 0,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo:
          deltaT === 0 ? "Pacote duplicado no mesmo timestamp" : "Pacote fora de ordem temporal",
      };
    }

    // ── TRAVA 2: Validação de Fixação Orbital ────────────────────────────────
    if (!pontoAtual.gpsFixed || pontoAtual.satellites < 4) {
      this.estado.totalPontosRejeitadosDrift++;
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: 0,
        superficieMeters: 0,
        arcoMeters: 0,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo: "Sem fixação orbital confiável (Fix=false ou satélites < 4)",
      };
    }

    // ── TRAVA 3: Trava Eletromecânica de Repouso (Estática) ───────────────────
    if (!pontoAtual.ignition && pontoAtual.speedKmh <= 3.0) {
      const dDrift = Wgs84PhysicsEngine.calcularDistanciaCordaWgs84(
        pAnterior.latitude,
        pAnterior.longitude,
        pontoAtual.latitude,
        pontoAtual.longitude,
      );
      this.estado.distanciaDriftEvitadaMetros += dDrift;
      this.estado.totalPontosRejeitadosDrift++;
      this.estado.ultimoPonto = { ...pontoAtual, speedKmh: 0, speedMs: 0 };
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: dDrift,
        superficieMeters: dDrift,
        arcoMeters: dDrift,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo: "Veículo estacionado (ACC desligado e velocidade <= 3 km/h)",
      };
    }

    if (pAnterior.speedMs === 0 && pontoAtual.speedMs === 0) {
      const dDrift = Wgs84PhysicsEngine.calcularDistanciaCordaWgs84(
        pAnterior.latitude,
        pAnterior.longitude,
        pontoAtual.latitude,
        pontoAtual.longitude,
      );
      this.estado.distanciaDriftEvitadaMetros += dDrift;
      this.estado.totalPontosRejeitadosDrift++;
      this.estado.ultimoPonto = pontoAtual;
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: dDrift,
        superficieMeters: dDrift,
        arcoMeters: dDrift,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo: "Ambos os pontos em repouso estrito (v1 = 0 e v2 = 0)",
      };
    }

    // ── CÁLCULO WGS-84 DE CORDA ──────────────────────────────────────────────
    const dCorda = Wgs84PhysicsEngine.calcularDistanciaCordaWgs84(
      pAnterior.latitude,
      pAnterior.longitude,
      pontoAtual.latitude,
      pontoAtual.longitude,
    );

    // ── TRAVA 4: Limites Físicos de Cinemática Veicular (Anti-Multipath) ──────
    const vImplicita = dCorda / deltaT;
    const aLongitudinal = (pontoAtual.speedMs - pAnterior.speedMs) / deltaT;

    const limiteVelocidadeExcedido = vImplicita > 65.0; // > 234 km/h
    const limiteAceleracaoExcedido = aLongitudinal > 9.8 || aLongitudinal < -14.0;

    if (limiteVelocidadeExcedido || limiteAceleracaoExcedido) {
      this.estado.totalPontosRejeitadosDrift++;
      this.estado.distanciaDriftEvitadaMetros += dCorda;

      // Salto absurdo / teletransporte (vImplicita > 100 m/s ou > 360 km/h): Descarte total
      if (vImplicita > 100.0) {
        return {
          deltaDistanceMeters: 0,
          deltaDistanceKm: 0,
          cordaMeters: dCorda,
          superficieMeters: dCorda,
          arcoMeters: dCorda,
          cinematicaMeters: 0,
          fusaoAplicada: false,
          curvaCompensada: false,
          ganhoCurvaPercentual: 0,
          descarteMotivo: `Multipath severo / Salto absurdo descartado (vImp=${(vImplicita * 3.6).toFixed(0)} km/h)`,
        };
      }

      // Se deltaT <= 15s e velocidade plausível, substitui por integração cinemática Doppler pura
      if (deltaT <= 15) {
        const dCinematicaPura = ((pAnterior.speedMs + pontoAtual.speedMs) / 2.0) * deltaT;
        const dFinalMeters = dCinematicaPura;
        const dFinalKm = (dFinalMeters / 1000.0) * this.estado.fatorCalibracaoK;

        this.estado.distanciaAcumuladaFisicaMetros += dFinalMeters;
        this.estado.odometroAtualKm += dFinalKm;
        this.estado.ultimoPonto = pontoAtual;

        return {
          deltaDistanceMeters: dFinalMeters,
          deltaDistanceKm: dFinalKm,
          cordaMeters: dCorda,
          superficieMeters: dCorda,
          arcoMeters: dCorda,
          cinematicaMeters: dCinematicaPura,
          fusaoAplicada: true,
          curvaCompensada: false,
          ganhoCurvaPercentual: 0,
          descarteMotivo: "Multipath detectado: coordenada substituída por integração Doppler pura",
        };
      }

      // Descarte total do salto
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: dCorda,
        superficieMeters: dCorda,
        arcoMeters: dCorda,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo: `Salto cinemático irreal (vImp=${vImplicita.toFixed(1)}m/s, aLong=${aLongitudinal.toFixed(1)}m/s²)`,
      };
    }

    // ── TRAVA 5: Zona Morta de Ruído Branco (Deadzone) ────────────────────────
    if (dCorda < 5.0 && pontoAtual.speedKmh < 5.0) {
      this.estado.distanciaDriftEvitadaMetros += dCorda;
      this.estado.totalPontosRejeitadosDrift++;
      this.estado.ultimoPonto = pontoAtual;
      return {
        deltaDistanceMeters: 0,
        deltaDistanceKm: 0,
        cordaMeters: dCorda,
        superficieMeters: dCorda,
        arcoMeters: dCorda,
        cinematicaMeters: 0,
        fusaoAplicada: false,
        curvaCompensada: false,
        ganhoCurvaPercentual: 0,
        descarteMotivo: "Zona morta de ruído GPS (< 5m e < 5km/h)",
      };
    }

    // ── CÁLCULO WGS-84 COMPLETO: SUPERFÍCIE, ARCO E FUSÃO DOPPLER ────────────
    const dSuperficie = Wgs84PhysicsEngine.compensarAltitudeRelevo(
      dCorda,
      this.estado.altitudePadraoMetros,
    );

    const { dArco, curvaCompensada, ganhoPercentual } = Wgs84PhysicsEngine.reconstruirArcoCurva(
      dSuperficie,
      pAnterior.courseDegrees,
      pontoAtual.courseDegrees,
      deltaT,
    );

    if (curvaCompensada) {
      this.estado.distanciaRecuperadaCurvasMetros += dArco - dSuperficie;
    }

    const { dFusao, dCinematica, fusaoAplicada } = Wgs84PhysicsEngine.fundirComDoppler(
      dArco,
      pAnterior.speedMs,
      pontoAtual.speedMs,
      deltaT,
    );

    // ── CALIBRAÇÃO MECÂNICA FINAL COM FATOR K ────────────────────────────────
    const deltaKmFinal = (dFusao / 1000.0) * this.estado.fatorCalibracaoK;

    this.estado.distanciaAcumuladaFisicaMetros += dFusao;
    this.estado.odometroAtualKm += deltaKmFinal;
    this.estado.ultimoPonto = pontoAtual;
    this.estado.ultimoTimestampMs = pontoAtual.t * 1000;

    return {
      deltaDistanceMeters: dFusao,
      deltaDistanceKm: deltaKmFinal,
      cordaMeters: dCorda,
      superficieMeters: dSuperficie,
      arcoMeters: dArco,
      cinematicaMeters: dCinematica,
      fusaoAplicada,
      curvaCompensada,
      ganhoCurvaPercentual: ganhoPercentual,
    };
  }

  /**
   * Algoritmo de Aprendizado Contínuo (Auto-Tuning) do Fator K do Pneu/Painel.
   * Acionado quando o usuário insere uma aferição real do painel após >= 100 km.
   */
  public autoCalibrarPainel(
    odometroPainelRealKm: number,
    distanciaFisicaPercorridaKm: number,
  ): {
    fatorKAnterior: number;
    fatorKObservado: number;
    fatorKNovo: number;
    sucesso: boolean;
    motivo?: string;
  } {
    if (distanciaFisicaPercorridaKm < 100.0) {
      return {
        fatorKAnterior: this.estado.fatorCalibracaoK,
        fatorKObservado: 1.0,
        fatorKNovo: this.estado.fatorCalibracaoK,
        sucesso: false,
        motivo: "Exige percurso mínimo de 100 km para convergência estatística do pneu",
      };
    }

    const diferencaPainelKm = odometroPainelRealKm - this.estado.odometroBaseKm;
    if (diferencaPainelKm <= 0) {
      return {
        fatorKAnterior: this.estado.fatorCalibracaoK,
        fatorKObservado: 1.0,
        fatorKNovo: this.estado.fatorCalibracaoK,
        sucesso: false,
        motivo: "Odômetro real deve ser superior ao odômetro base de sincronização",
      };
    }

    const kObservado = diferencaPainelKm / distanciaFisicaPercorridaKm;

    // Amortecimento exponencial: 70% observação recente + 30% fator anterior
    const kAtual = this.estado.fatorCalibracaoK;
    let kNovo = 0.7 * kObservado + 0.3 * kAtual;

    // Clamping no intervalo de segurança mecânica [0.95, 1.10]
    kNovo = Math.max(0.95, Math.min(1.1, kNovo));

    const fatorKAnterior = this.estado.fatorCalibracaoK;
    this.estado.fatorCalibracaoK = kNovo;
    this.estado.odometroPainelRealKm = odometroPainelRealKm;
    this.estado.odometroAtualKm = odometroPainelRealKm; // Sincroniza valor oficial
    this.estado.odometroBaseKm = odometroPainelRealKm;
    this.estado.distanciaAcumuladaFisicaMetros = 0;
    this.estado.ultimaSincronizacaoEm = new Date().toISOString();

    return {
      fatorKAnterior,
      fatorKObservado: kObservado,
      fatorKNovo: kNovo,
      sucesso: true,
    };
  }

  public setOdometroManual(novoOdometroKm: number): void {
    this.estado.odometroBaseKm = novoOdometroKm;
    this.estado.odometroAtualKm = novoOdometroKm;
    this.estado.distanciaAcumuladaFisicaMetros = 0;
    this.estado.ultimaSincronizacaoEm = new Date().toISOString();
  }
}
