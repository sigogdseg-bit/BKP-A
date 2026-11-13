/**
 * ============================================================================
 * SIGO GUARDIÃO - MOTORES COMPARATIVOS DE ODOMETRIA FUSIONAL (A, B E C)
 * Hardware Alvo: WanWay J16 4G (GT06 / Pacote 0x94) | Veículo: Volvo XC60 AXH0E44
 * Baseline Real do Painel Físico: 183.421,0 km
 * ============================================================================
 */

export interface TelemetriaPingComparativo {
  imei: string;
  timestamp: number; // Unix ms
  latitude: number; // Graus decimais WGS-84
  longitude: number; // Graus decimais WGS-84
  velocidade: number; // km/h
  curso: number; // 0° a 360°
  ignicao: boolean; // Fio laranja ACC
  satelites: number; // Quantidade de SVs
  odometro_mcu_metros: number; // Pacote 0x94 (GT06METER=1)
}

export interface LeituraMostrador {
  motorId: "a" | "b" | "c";
  titulo: string;
  subtitulo: string;
  odometroKm: number;
  odometroMetros: number;
  deltaMetros: number;
  fatorCalibracaoK: number;
  estadoZvu: "MOVIMENTO" | "PARADO_ZVU" | "SALTO_DESCARTADO";
  bloqueioMotivo?: string;
  pesos: {
    gnssOuArco: number; // 0 a 100%
    cinematico: number; // 0 a 100%
    mcuJ16: number; // 0 a 100%
  };
  divergenciaPainelKm: number; // Frente a 183.421,0 km
}

/**
 * ============================================================================
 * MEDIDOR 7 (ODÔMETRO PRINCIPAL DO SISTEMA): Média dos Medidores 1, 4, 5 e 6
 * ============================================================================
 * Calcula a média aritmética de alta precisão entre:
 *  - Medidor 1: WGS-84 Geodésico Elipsoidal
 *  - Medidor 4: Motor A Bayesiano 1D + Curvatura de Gauss
 *  - Medidor 5: Motor B Haversine Esférico R=6371km + Doppler
 *  - Medidor 6: Motor C EKF Canônico Taylor 4ª Ordem
 *
 * @param m1 Odômetro Principal WGS-84 (km)
 * @param m4 Odômetro Motor A Bayesiano 1D (km)
 * @param m5 Odômetro Motor B Haversine (km)
 * @param m6 Odômetro Motor C EKF Canônico (km)
 * @returns Quilometragem final calculada em tempo real (km)
 */
export function calcularOdometroMedia1456(
  m1: number | null | undefined,
  m4: number | null | undefined,
  m5: number | null | undefined,
  m6: number | null | undefined,
): number {
  const v1 = Number(m1) || 0;
  const v4 = m4 !== null && m4 !== undefined ? Number(m4) : v1;
  const v5 = m5 !== null && m5 !== undefined ? Number(m5) : v1;
  const v6 = m6 !== null && m6 !== undefined ? Number(m6) : v1;

  const soma = v1 + v4 + v5 + v6;
  return Number((soma / 4.0).toFixed(3));
}

// ============================================================================
// PROPOSTA A: Motor Bayesiano 1D + Arco Circular WGS-84 (Resposta 1)
// ============================================================================
export class MotorOdometroPropostaA {
  private static readonly WGS84_A = 6378137.0;
  private static readonly WGS84_E2 = 0.00669437999014;

  private odometroEstimadoMetros: number;
  private kCalib: number;
  private ultimoPing: TelemetriaPingComparativo | null = null;
  private contadorHisterese: number = 0;
  private ancoraPainelMetros: number;
  private ancoraEstimadorMetros: number;

  constructor(kmInicial: number = 183421.0, kCalibInicial: number = 1.000215) {
    this.odometroEstimadoMetros = kmInicial * 1000.0;
    this.kCalib = kCalibInicial;
    this.ancoraPainelMetros = this.odometroEstimadoMetros;
    this.ancoraEstimadorMetros = this.odometroEstimadoMetros;
  }

  public processarPing(ping: TelemetriaPingComparativo): LeituraMostrador {
    if (!this.ultimoPing) {
      this.ultimoPing = ping;
      return this.montar(0, "PARADO_ZVU", 0, 0, 0, "PING_INICIAL");
    }

    const dt = (ping.timestamp - this.ultimoPing.timestamp) / 1000.0;
    if (dt <= 0 || dt > 3600) {
      this.ultimoPing = ping;
      return this.montar(0, "SALTO_DESCARTADO", 0, 0, 0, "HIATO_TEMPORAL");
    }

    const dCorda = this.calcularCordaWGS84(
      this.ultimoPing.latitude,
      this.ultimoPing.longitude,
      ping.latitude,
      ping.longitude,
    );

    const emMovimento = this.avaliarZVU(ping, this.ultimoPing, dCorda, dt);
    if (!emMovimento) {
      this.ultimoPing = {
        ...ping,
        latitude: this.ultimoPing.latitude,
        longitude: this.ultimoPing.longitude,
      };
      return this.montar(0, "PARADO_ZVU", 0, 0, 0, "ZVU_RETENCAO_ESTATICA");
    }

    const dArco = this.reconstruirArco(
      dCorda,
      this.ultimoPing.curso,
      ping.curso,
      this.ultimoPing.velocidade,
      ping.velocidade,
    );
    const v0_ms = this.ultimoPing.velocidade / 3.6;
    const v1_ms = ping.velocidade / 3.6;
    const dCinematico = ((v0_ms + v1_ms) / 2.0) * dt;

    const dMcuBruto = ping.odometro_mcu_metros - this.ultimoPing.odometro_mcu_metros;
    let dMcu = dMcuBruto * 0.999744;
    const limiteFisico = Math.max(dArco * 1.35, 65.0 * dt);
    const mcuValido = dMcu > 0 && dMcu <= limiteFisico;
    if (!mcuValido) dMcu = dArco;

    const penalidadeSats = Math.max(1.0, 9.0 - Math.min(ping.satelites, 8));
    const deltaProa = this.calcularDeltaAngularRad(this.ultimoPing.curso, ping.curso);
    const aceleracaoAbs = Math.abs(v1_ms - v0_ms) / dt;

    const sigma2_arco =
      Math.pow(1.2 * penalidadeSats, 2) + Math.pow(0.12 * dArco * deltaProa, 2) + 1e-4;
    const sigma2_cin = Math.pow(0.35 * dt, 2) + Math.pow(0.45 * aceleracaoAbs * dt * dt, 2) + 1e-4;
    const divergenciaMcu = Math.abs(dMcu - dArco);
    const sigma2_mcu = mcuValido ? Math.pow(1.8, 2) + Math.pow(0.65 * divergenciaMcu, 2) : 1e12;

    const invArco = 1.0 / sigma2_arco;
    const invCin = 1.0 / sigma2_cin;
    const invMcu = 1.0 / sigma2_mcu;
    const somaInv = invArco + invCin + invMcu;

    const wArco = invArco / somaInv;
    const wCin = invCin / somaInv;
    const wMcu = invMcu / somaInv;

    const deltaFundido = wArco * dArco + wCin * dCinematico + wMcu * dMcu;
    const deltaReal = deltaFundido * this.kCalib;

    this.odometroEstimadoMetros += deltaReal;
    this.ultimoPing = ping;

    return this.montar(deltaReal, "MOVIMENTO", wArco, wCin, wMcu);
  }

  public equalizar(kmRealPainel: number): void {
    const metrosReais = kmRealPainel * 1000.0;
    const deltaPainel = metrosReais - this.ancoraPainelMetros;
    const deltaEstimador = this.odometroEstimadoMetros - this.ancoraEstimadorMetros;

    if (deltaPainel >= 5000.0 && deltaEstimador >= 5000.0) {
      const deltaPuro = deltaEstimador / this.kCalib;
      const kObs = Math.max(0.965, Math.min(1.035, deltaPainel / deltaPuro));
      this.kCalib = (1.0 - 0.25) * this.kCalib + 0.25 * kObs;
      this.ancoraPainelMetros = metrosReais;
      this.ancoraEstimadorMetros = metrosReais;
    }
    this.odometroEstimadoMetros = metrosReais;
  }

  private avaliarZVU(
    atual: TelemetriaPingComparativo,
    ant: TelemetriaPingComparativo,
    dCorda: number,
    dt: number,
  ): boolean {
    if (!atual.ignicao || atual.satelites < 4) {
      this.contadorHisterese = 0;
      return false;
    }
    const vMedia = (atual.velocidade + ant.velocidade) / 2.0;
    const deltaMcu = atual.odometro_mcu_metros - ant.odometro_mcu_metros;
    if (
      atual.velocidade < 2.2 &&
      vMedia < 1.8 &&
      dCorda < Math.max(3.5, 0.18 * dt) &&
      deltaMcu < 5.0
    ) {
      this.contadorHisterese = 0;
      return false;
    }
    if (atual.velocidade >= 3.0 || (dCorda >= 4.0 && deltaMcu >= 3.0)) {
      this.contadorHisterese++;
    } else {
      this.contadorHisterese = Math.max(0, this.contadorHisterese - 1);
    }
    return this.contadorHisterese >= 1;
  }

  private calcularCordaWGS84(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = Math.PI / 180.0;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const latM = (phi1 + phi2) / 2.0;

    const sLat = Math.sin(latM);
    const denom = Math.sqrt(1.0 - MotorOdometroPropostaA.WGS84_E2 * sLat * sLat);
    const M =
      (MotorOdometroPropostaA.WGS84_A * (1.0 - MotorOdometroPropostaA.WGS84_E2)) /
      Math.pow(denom, 3);
    const N = MotorOdometroPropostaA.WGS84_A / denom;

    const dy = M * dLat;
    const dx = N * Math.cos(latM) * dLon;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private reconstruirArco(dCorda: number, c1: number, c2: number, v1: number, v2: number): number {
    if (dCorda < 2.5 || (v1 < 6.0 && v2 < 6.0)) return dCorda;
    const dPsi = this.calcularDeltaAngularRad(c1, c2);
    if (dPsi < 0.035 || dPsi > 2.356) return dCorda;
    const meioPsi = dPsi / 2.0;
    const fator = meioPsi / Math.sin(meioPsi);
    return dCorda * Math.min(fator, 1.18);
  }

  private calcularDeltaAngularRad(a1: number, a2: number): number {
    const diff = Math.abs(a2 - a1) % 360.0;
    const menor = diff > 180.0 ? 360.0 - diff : diff;
    return menor * (Math.PI / 180.0);
  }

  private montar(
    deltaM: number,
    estado: "MOVIMENTO" | "PARADO_ZVU" | "SALTO_DESCARTADO",
    wArco: number,
    wCin: number,
    wMcu: number,
    motivo?: string,
  ): LeituraMostrador {
    const km = Number((this.odometroEstimadoMetros / 1000.0).toFixed(3));
    return {
      motorId: "a",
      titulo: "Mostrador A · Fusão Bayesiana 1D",
      subtitulo: "Reconstrução de Curvatura Gaussiana e ZVU Histerético",
      odometroKm: km,
      odometroMetros: Math.round(this.odometroEstimadoMetros),
      deltaMetros: Number(deltaM.toFixed(2)),
      fatorCalibracaoK: Number(this.kCalib.toFixed(6)),
      estadoZvu: estado,
      bloqueioMotivo: motivo,
      pesos: {
        gnssOuArco: Math.round(wArco * 100),
        cinematico: Math.round(wCin * 100),
        mcuJ16: Math.round(wMcu * 100),
      },
      divergenciaPainelKm: Number((km - 183421.0).toFixed(3)),
    };
  }
}

// ============================================================================
// PROPOSTA B: Haversine Simples + Doppler Trapezoidal (Resposta 2)
// ============================================================================
export class MotorOdometroPropostaB {
  private totalKm: number = 183421.0;
  private anterior?: TelemetriaPingComparativo;
  private mcuAnterior?: number;
  private paradoCount: number = 0;
  private movimentoCount: number = 0;
  private parado: boolean = false;
  private readonly R = { gnss: 0.0004, doppler: 0.0009, mcu: 0.0016 };

  constructor(kmInicial: number = 183421.0) {
    this.totalKm = kmInicial;
  }

  private haversine(a: TelemetriaPingComparativo, b: TelemetriaPingComparativo): number {
    const rad = (x: number) => (x * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  }

  public processarPing(ping: TelemetriaPingComparativo): LeituraMostrador {
    if (!this.anterior) {
      this.anterior = { ...ping };
      this.mcuAnterior = ping.odometro_mcu_metros;
      return this.montar(0, "PARADO_ZVU", 0, 0, 0, "INICIAL");
    }

    const dt = (ping.timestamp - this.anterior.timestamp) / 1000;
    if (dt <= 0 || dt > 300) {
      this.anterior = { ...ping };
      this.mcuAnterior = ping.odometro_mcu_metros;
      return this.montar(0, "SALTO_DESCARTADO", 0, 0, 0, "INTERVALO_INVALIDO");
    }

    const gnssRawKm = this.haversine(this.anterior, ping);
    const dopplerRawKm =
      (((Math.max(0, this.anterior.velocidade) + Math.max(0, ping.velocidade)) / 2) * dt) / 3600;
    const mcuRawKm =
      this.mcuAnterior !== undefined && ping.odometro_mcu_metros >= this.mcuAnterior
        ? (ping.odometro_mcu_metros - this.mcuAnterior) / 1000
        : 0;

    const qualidadeGNSS = ping.satelites >= 4;
    const evidenciaParada =
      ping.velocidade <= 2 && this.anterior.velocidade <= 2 && gnssRawKm <= 0.005 && qualidadeGNSS;

    if (evidenciaParada) {
      this.paradoCount++;
      this.movimentoCount = 0;
    } else {
      this.movimentoCount++;
      this.paradoCount = 0;
    }

    if (!ping.ignicao || this.paradoCount >= 3) {
      this.parado = true;
    }
    if (ping.ignicao && this.movimentoCount >= 2) {
      this.parado = false;
    }

    let distanciaKm = 0;
    let wGnss = 0;
    let wDop = 0;
    let wMcu = 0;

    if (!this.parado && ping.ignicao) {
      const limiteFisico = Math.max(0.03, dopplerRawKm * 2.5 + 0.02);
      const mcuValido = mcuRawKm <= limiteFisico;
      const gnssValido = qualidadeGNSS && gnssRawKm <= Math.max(0.05, dopplerRawKm * 2.5 + 0.02);

      const medidas: Array<{ d: number; r: number; tipo: "g" | "d" | "m" }> = [];
      if (gnssValido) medidas.push({ d: gnssRawKm, r: this.R.gnss, tipo: "g" });
      if (dt <= 60 && Number.isFinite(dopplerRawKm))
        medidas.push({ d: dopplerRawKm, r: this.R.doppler, tipo: "d" });
      if (mcuValido && mcuRawKm > 0) medidas.push({ d: mcuRawKm, r: this.R.mcu, tipo: "m" });

      if (medidas.length > 0) {
        const somaPesos = medidas.reduce((s, m) => s + 1 / m.r, 0);
        distanciaKm = medidas.reduce((s, m) => s + m.d / m.r, 0) / somaPesos;

        const pG = medidas.find((m) => m.tipo === "g");
        const pD = medidas.find((m) => m.tipo === "d");
        const pM = medidas.find((m) => m.tipo === "m");

        wGnss = pG ? 1 / pG.r / somaPesos : 0;
        wDop = pD ? 1 / pD.r / somaPesos : 0;
        wMcu = pM ? 1 / pM.r / somaPesos : 0;
      }
    }

    this.totalKm += Math.max(0, distanciaKm);
    this.anterior = { ...ping };
    this.mcuAnterior = ping.odometro_mcu_metros;

    return this.montar(
      distanciaKm * 1000.0,
      this.parado ? "PARADO_ZVU" : "MOVIMENTO",
      wGnss,
      wDop,
      wMcu,
      this.parado ? "EVIDENCIA_PARADA" : undefined,
    );
  }

  public equalizar(kmRealPainel: number): void {
    this.totalKm = kmRealPainel;
  }

  private montar(
    deltaM: number,
    estado: "MOVIMENTO" | "PARADO_ZVU" | "SALTO_DESCARTADO",
    wG: number,
    wD: number,
    wM: number,
    motivo?: string,
  ): LeituraMostrador {
    const km = Number(this.totalKm.toFixed(3));
    return {
      motorId: "b",
      titulo: "Mostrador B · Haversine Esférico",
      subtitulo: "Doppler Trapezoidal e Variâncias Fixas Provisórias",
      odometroKm: km,
      odometroMetros: Math.round(this.totalKm * 1000.0),
      deltaMetros: Number(deltaM.toFixed(2)),
      fatorCalibracaoK: 1.0,
      estadoZvu: estado,
      bloqueioMotivo: motivo,
      pesos: {
        gnssOuArco: Math.round(wG * 100),
        cinematico: Math.round(wD * 100),
        mcuJ16: Math.round(wM * 100),
      },
      divergenciaPainelKm: Number((km - 183421.0).toFixed(3)),
    };
  }
}

// ============================================================================
// PROPOSTA C: SIGO Guardião EKF 1D + Taylor 4ª Ordem + ZVU 6 Regras (Resposta 3)
// ============================================================================
export class MotorOdometroPropostaC {
  private static readonly WGS84_A = 6378137.0;
  private static readonly WGS84_E2 = 0.00669437999014;
  private static readonly DEG_TO_RAD = Math.PI / 180.0;
  private static readonly K_CALIB_DEFAULT = 1.00027267;

  private odometroRealMetros: number;
  private odometroBrutoMetros: number;
  private kCalib: number;
  private ultimoPing: TelemetriaPingComparativo | null = null;
  private contadorHisterese: number = 0;
  private ancoraPainelMetros: number;
  private ancoraBrutoMetros: number;

  constructor(kmInicial: number = 183421.0, kCalibInicial: number = 1.00027267) {
    this.odometroRealMetros = kmInicial * 1000.0;
    this.odometroBrutoMetros = (kmInicial / kCalibInicial) * 1000.0;
    this.kCalib = kCalibInicial;
    this.ancoraPainelMetros = this.odometroRealMetros;
    this.ancoraBrutoMetros = this.odometroBrutoMetros;
  }

  public processarPing(ping: TelemetriaPingComparativo): LeituraMostrador {
    const pingAnt = this.ultimoPing;
    if (!pingAnt || ping.timestamp <= pingAnt.timestamp) {
      this.ultimoPing = ping;
      return this.montar(0, "PARADO_ZVU", 0, 0, 0, "PING_INICIAL");
    }

    const dt = (ping.timestamp - pingAnt.timestamp) / 1000.0;

    // 1. Geodésia Elipsoidal Local
    const phi1 = pingAnt.latitude * MotorOdometroPropostaC.DEG_TO_RAD;
    const phi2 = ping.latitude * MotorOdometroPropostaC.DEG_TO_RAD;
    const dPhi = phi2 - phi1;
    const dLambda = (ping.longitude - pingAnt.longitude) * MotorOdometroPropostaC.DEG_TO_RAD;
    const phiMedia = 0.5 * (phi1 + phi2);

    const sinPhi = Math.sin(phiMedia);
    const cosPhi = Math.cos(phiMedia);
    const denom = 1.0 - MotorOdometroPropostaC.WGS84_E2 * sinPhi * sinPhi;
    const rM =
      (MotorOdometroPropostaC.WGS84_A * (1.0 - MotorOdometroPropostaC.WGS84_E2)) /
      Math.pow(denom, 1.5);
    const rN = MotorOdometroPropostaC.WGS84_A / Math.sqrt(denom);
    const dCorda = Math.hypot(dPhi * rM, dLambda * rN * cosPhi);

    // 2. Fator de Curvatura Kappa via Taylor de 4ª ordem
    const vMedia = 0.5 * (pingAnt.velocidade + ping.velocidade);
    let kappa = 1.0;
    if (vMedia >= 5.0) {
      const dPsi = Math.abs(
        Math.atan2(
          Math.sin((ping.curso - pingAnt.curso) * MotorOdometroPropostaC.DEG_TO_RAD),
          Math.cos((ping.curso - pingAnt.curso) * MotorOdometroPropostaC.DEG_TO_RAD),
        ),
      );
      if (dPsi <= (2.0 * Math.PI) / 3.0) {
        const half = 0.5 * dPsi;
        if (half < 0.025) {
          const psi2 = dPsi * dPsi;
          kappa = 1.0 + psi2 / 24.0 + (7.0 * psi2 * psi2) / 5760.0;
        } else {
          kappa = Math.min(half / Math.sin(half), 1.22);
        }
      }
    }
    const dsArco = dCorda * kappa;

    // 3. Cinemática Trapezoidal
    const dsCin = dt <= 180.0 ? (vMedia / 3.6) * dt : dsArco;

    // 4. Derivada MCU
    const dsMcuRaw = ping.odometro_mcu_metros - pingAnt.odometro_mcu_metros;
    const dsMcuValido = dsMcuRaw >= 0 && dsMcuRaw <= Math.max(dsArco * 1.35 + 25.0, 500.0);
    const dsMcu = dsMcuValido ? dsMcuRaw : dsArco;

    // 5. ZVU Rigoroso de 6 Regras
    const zvu = this.avaliarZVU(pingAnt, ping, dt, dCorda, dsMcuRaw);
    if (zvu.bloqueado) {
      this.ultimoPing = ping;
      return this.montar(0, "PARADO_ZVU", 0, 0, 0, zvu.motivo);
    }

    // 6. Covariâncias Dinâmicas e Fusão EKF
    const satFator = Math.max(4, ping.satelites);
    const varArco = Math.pow(5.5 / satFator, 2) + Math.pow(0.012 * dsArco, 2);
    const deltaVel = Math.abs(ping.velocidade - pingAnt.velocidade);
    const varCin = dt <= 180.0 ? Math.pow(0.11 * dt, 2) + Math.pow(0.022 * deltaVel * dt, 2) : 1e8;
    const desvioMcu = Math.abs(dsMcuRaw - dsArco);
    const varMcu =
      dsMcuValido && desvioMcu <= 0.12 * dsArco + 10.0 ? Math.pow(0.018 * dsMcu, 2) + 0.64 : 1e8;

    const wArco = 1.0 / varArco;
    const wCin = 1.0 / varCin;
    const wMcu = 1.0 / varMcu;
    const somaW = wArco + wCin + wMcu;

    const dsBruto = (wArco * dsArco + wCin * dsCin + wMcu * dsMcu) / somaW;
    const dsReal = dsBruto * this.kCalib;

    this.odometroBrutoMetros += dsBruto;
    this.odometroRealMetros += dsReal;
    this.ultimoPing = ping;

    return this.montar(dsReal, "MOVIMENTO", wArco / somaW, wCin / somaW, wMcu / somaW);
  }

  public equalizar(kmRealPainel: number): void {
    const metrosPainel = kmRealPainel * 1000.0;
    const deltaPainel = metrosPainel - this.ancoraPainelMetros;
    const deltaBruto = this.odometroBrutoMetros - this.ancoraBrutoMetros;

    if (deltaBruto >= 2000.0 && deltaPainel > 0) {
      const kObs = Math.max(0.94, Math.min(1.08, deltaPainel / deltaBruto));
      this.kCalib = (1.0 - 0.18) * this.kCalib + 0.18 * kObs;
    } else if (this.odometroBrutoMetros > 1000.0) {
      const kDireto = metrosPainel / this.odometroBrutoMetros;
      if (kDireto >= 0.94 && kDireto <= 1.08) this.kCalib = kDireto;
    }

    this.odometroRealMetros = metrosPainel;
    this.ancoraPainelMetros = metrosPainel;
    this.ancoraBrutoMetros = this.odometroBrutoMetros;
  }

  private avaliarZVU(
    ant: TelemetriaPingComparativo,
    atual: TelemetriaPingComparativo,
    dt: number,
    dCorda: number,
    dMcu: number,
  ): { bloqueado: boolean; motivo: string } {
    if (!atual.ignicao && !ant.ignicao && dCorda < 150.0) {
      this.contadorHisterese = 0;
      return { bloqueado: true, motivo: "IGNICAO_ACC_OFF" };
    }
    if (atual.satelites < 4) {
      return { bloqueado: true, motivo: "SATELITES_INSUFICIENTES" };
    }
    if (dt > 0 && dCorda / dt > 72.0) {
      return { bloqueado: true, motivo: "MULTIPATH_GLITCH_REJEITADO" };
    }
    if (atual.velocidade < 1.8 && ant.velocidade < 1.8 && dCorda < 6.5 && dMcu <= 2.0) {
      this.contadorHisterese = 0;
      return { bloqueado: true, motivo: "SEMAFORO_DOPPLER_ZERO" };
    }
    if (dCorda < 1.2 && atual.velocidade < 3.0) {
      this.contadorHisterese = 0;
      return { bloqueado: true, motivo: "MICRO_DRIFT_SUBMETRICO" };
    }
    this.contadorHisterese++;
    if (this.contadorHisterese === 1 && atual.velocidade < 4.5 && dCorda < 4.0 && dMcu < 4.0) {
      return { bloqueado: true, motivo: "HISTERESE_PARTIDA_AGUARDANDO" };
    }
    return { bloqueado: false, motivo: "" };
  }

  private montar(
    deltaM: number,
    estado: "MOVIMENTO" | "PARADO_ZVU" | "SALTO_DESCARTADO",
    wA: number,
    wC: number,
    wM: number,
    motivo?: string,
  ): LeituraMostrador {
    const km = Number((this.odometroRealMetros / 1000.0).toFixed(3));
    return {
      motorId: "c",
      titulo: "Mostrador C · EKF 1D Canônico",
      subtitulo: "Expansão Taylor 4ª Ordem e ZVU 6 Regras (SIGO Guardião)",
      odometroKm: km,
      odometroMetros: Math.round(this.odometroRealMetros),
      deltaMetros: Number(deltaM.toFixed(2)),
      fatorCalibracaoK: Number(this.kCalib.toFixed(8)),
      estadoZvu: estado,
      bloqueioMotivo: motivo,
      pesos: {
        gnssOuArco: Math.round(wA * 100),
        cinematico: Math.round(wC * 100),
        mcuJ16: Math.round(wM * 100),
      },
      divergenciaPainelKm: Number((km - 183421.0).toFixed(3)),
    };
  }
}

// ============================================================================
// SIMULADOR DE CENÁRIOS OPERACIONAIS REAIS (J16 4G / VOLVO AXH0E44)
// ============================================================================
export interface CenarioSimulacao {
  id: "reta_rodovia" | "curva_serra" | "semaforo_parado" | "estacionado_acc_off";
  nome: string;
  descricao: string;
  pings: TelemetriaPingComparativo[];
}

export function gerarCenariosSimulacao(): CenarioSimulacao[] {
  const agora = Date.now();

  return [
    {
      id: "reta_rodovia",
      nome: "🛣️ Reta em Rodovia (100 km/h contínuo)",
      descricao:
        "Trajeto reto de 10 km a 100 km/h (dt = 30s). Heading constante em 90° (Leste). Doppler alto e estável.",
      pings: [
        {
          imei: "863874085222366",
          timestamp: agora,
          latitude: -23.55052,
          longitude: -46.633308,
          velocidade: 100.0,
          curso: 90.0,
          ignicao: true,
          satelites: 11,
          odometro_mcu_metros: 183418000,
        },
        {
          imei: "863874085222366",
          timestamp: agora + 30000,
          latitude: -23.55052,
          longitude: -46.62515, // ~833 metros a Leste
          velocidade: 100.0,
          curso: 90.0,
          ignicao: true,
          satelites: 12,
          odometro_mcu_metros: 183418833,
        },
      ],
    },
    {
      id: "curva_serra",
      nome: "🔄 Curva Fechada em Serra (ANGLE,10,15#)",
      descricao:
        "Mudança rápida de proa de 90° para 135° em 10 segundos. O GNSS linear corta a corda, enquanto o arco elipsoidal reconstrói o traçado real da roda.",
      pings: [
        {
          imei: "863874085222366",
          timestamp: agora,
          latitude: -23.55052,
          longitude: -46.633308,
          velocidade: 60.0,
          curso: 90.0,
          ignicao: true,
          satelites: 10,
          odometro_mcu_metros: 183418000,
        },
        {
          imei: "863874085222366",
          timestamp: agora + 10000,
          latitude: -23.55165,
          longitude: -46.63185, // Curva de 45°
          velocidade: 58.0,
          curso: 135.0,
          ignicao: true,
          satelites: 10,
          odometro_mcu_metros: 183418172,
        },
      ],
    },
    {
      id: "semaforo_parado",
      nome: "🚦 Semáforo Parado (Motor Ligado / ACC=ON)",
      descricao:
        "Veículo imobilizado no semáforo com motor funcionando. Doppler oscilando entre 0 e 1.2 km/h por ruído ionosférico. ZVU deve travar 100% de acréscimo falso.",
      pings: [
        {
          imei: "863874085222366",
          timestamp: agora,
          latitude: -23.55052,
          longitude: -46.633308,
          velocidade: 0.8,
          curso: 90.0,
          ignicao: true,
          satelites: 9,
          odometro_mcu_metros: 183418000,
        },
        {
          imei: "863874085222366",
          timestamp: agora + 30000,
          latitude: -23.550535, // Deriva térmica de ~1.8 metros
          longitude: -46.63332,
          velocidade: 1.1,
          curso: 110.0,
          ignicao: true,
          satelites: 9,
          odometro_mcu_metros: 183418000,
        },
      ],
    },
    {
      id: "estacionado_acc_off",
      nome: "🅿️ Estacionado (Ignição ACC Desligada)",
      descricao:
        "Fio laranja físico ACCLINE=1 em nível baixo (chave OFF). Mesmo com satélites 'dançando' 8 metros por multi-caminho urbano, nenhum metro fantasma é aceito.",
      pings: [
        {
          imei: "863874085222366",
          timestamp: agora,
          latitude: -23.55052,
          longitude: -46.633308,
          velocidade: 0.0,
          curso: 90.0,
          ignicao: false,
          satelites: 7,
          odometro_mcu_metros: 183418000,
        },
        {
          imei: "863874085222366",
          timestamp: agora + 1800000, // 30 minutos depois
          latitude: -23.55058, // Oscilação GNSS de 7.5 metros
          longitude: -46.63336,
          velocidade: 0.0,
          curso: 270.0,
          ignicao: false,
          satelites: 6,
          odometro_mcu_metros: 183418000,
        },
      ],
    },
  ];
}

export function executarComparativoCompleto(): {
  mostradorA: LeituraMostrador;
  mostradorB: LeituraMostrador;
  mostradorC: LeituraMostrador;
} {
  const motorA = new MotorOdometroPropostaA(183421.0);
  const motorB = new MotorOdometroPropostaB(183421.0);
  const motorC = new MotorOdometroPropostaC(183421.0);

  const cenarios = gerarCenariosSimulacao();
  const cenarioReta = cenarios[0];

  motorA.processarPing(cenarioReta.pings[0]);
  const mA = motorA.processarPing(cenarioReta.pings[1]);

  motorB.processarPing(cenarioReta.pings[0]);
  const mB = motorB.processarPing(cenarioReta.pings[1]);

  motorC.processarPing(cenarioReta.pings[0]);
  const mC = motorC.processarPing(cenarioReta.pings[1]);

  return { mostradorA: mA, mostradorB: mB, mostradorC: mC };
}
