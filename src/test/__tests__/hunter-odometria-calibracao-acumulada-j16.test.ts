import { describe, it } from "node:test";
import assert from "node:assert";
import {
  GpsOdometryEngine,
  calculateGeodesicDistanceMeters,
  getWgs84EarthRadiusAtLatitude,
  calculateTrapezoidalDistanceMeters,
  calculateInertialFusedDistanceMeters,
  decodificarPacoteJ16,
  calcularCrcItuLookup,
  type GpsRawPoint,
  type VehicleCalibrationSession,
  type ValidationStage,
} from "../../shared/lib/gpsOdometryEngine";

describe("Hunter — Motor de Odometria e Calibração Acumulada J16 4G (AT6558R)", () => {
  const engine = new GpsOdometryEngine();

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 1 & 2: AUDITORIA DO PROTOCOLO J16 E PERFIS DE TRANSMISSÃO
  // ───────────────────────────────────────────────────────────────────────────
  describe("Etapa 1 e 2: Auditoria e Decodificação dos Pacotes J16 4G", () => {
    it("deve decodificar pacote 0x12 de localização com campos reais e bit de fix GNSS (0x1000)", () => {
      // Coordenadas reais: Volta Redonda / RJ (-22.5185°, -44.1045°)
      const rawLat = Math.round(22.5185 * 1800000);
      const rawLon = Math.round(44.1045 * 1800000);

      const payload = Buffer.from([
        0x78,
        0x78, // Header
        0x1f, // Length
        0x12, // Protocolo 0x12
        26,
        10,
        11,
        12,
        0,
        0, // 2026-10-11 12:00:00 UTC
        0xcb, // Satélites = 11
        (rawLat >> 24) & 0xff,
        (rawLat >> 16) & 0xff,
        (rawLat >> 8) & 0xff,
        rawLat & 0xff,
        (rawLon >> 24) & 0xff,
        (rawLon >> 16) & 0xff,
        (rawLon >> 8) & 0xff,
        rawLon & 0xff,
        50, // Velocidade = 50 km/h (Doppler do AT6558R)
        0x18,
        0x5a, // Course Status: Bit 12 = 1 (Fix GNSS), Bit 11 = 1 (West), Bit 10 = 0 (South), Rumo = 90°
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x01, // Serial
      ]);

      const crc = calcularCrcItuLookup(payload.subarray(2));
      const pkt = Buffer.concat([
        payload,
        Buffer.from([(crc >> 8) & 0xff, crc & 0xff, 0x0d, 0x0a]),
      ]);

      const decodificado = decodificarPacoteJ16(pkt);
      assert.ok(decodificado !== null, "Pacote J16 deve ser decodificado");
      assert.strictEqual(decodificado?.protocolo, 0x12);
      assert.strictEqual(decodificado?.velocidadeKmh, 50);
      assert.strictEqual(decodificado?.gpsFixado, true);
      assert.strictEqual(decodificado?.rumoGraus, 90);
      assert.strictEqual(decodificado?.validoParaOdometria, true);
      assert.ok(Math.abs(decodificado!.latitude - -22.5185) < 0.0001);
      assert.ok(Math.abs(decodificado!.longitude - -44.1045) < 0.0001);
    });

    it("deve rejeitar coordenadas quando o Bit 12 (Fix GNSS) for 0 (posicionamento LBS)", () => {
      const payloadLbs = Buffer.from([
        0x78,
        0x78,
        0x1f,
        0x12,
        26,
        10,
        11,
        12,
        1,
        0,
        0xc4,
        0x02,
        0x6a,
        0x7e,
        0x34,
        0x04,
        0xbb,
        0x61,
        0xc4,
        0,
        0x08,
        0x5a, // Bit 12 = 0 (SEM FIX GNSS)
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x02,
      ]);
      const crc = calcularCrcItuLookup(payloadLbs.subarray(2));
      const pkt = Buffer.concat([
        payloadLbs,
        Buffer.from([(crc >> 8) & 0xff, crc & 0xff, 0x0d, 0x0a]),
      ]);

      const decodificado = decodificarPacoteJ16(pkt);
      assert.ok(decodificado !== null);
      assert.strictEqual(decodificado?.gpsFixado, false);
      assert.strictEqual(decodificado?.validoParaOdometria, false);
      assert.ok(decodificado?.descarteMotivo?.includes("Fix GNSS ausente"));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 3: COMPARAÇÃO ENTRE PERFIL LEGADO E PERFIL OTIMIZADO (10s + 15°)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Etapa 3: Comparação de Perfis de Transmissão (30s vs 10s + Ângulo 15°)", () => {
    it("deve demonstrar como o perfil otimizado (10s + 15° ângulo) reduz a subestimação em curvas acentuadas", () => {
      // Simula uma curva de 90° com raio de 80 metros percorrida a 36 km/h (10 m/s)
      // Comprimento real do arco = (pi / 2) * 80m ≈ 125.66 metros
      // Corda reta entre início e fim = sqrt(80^2 + 80^2) ≈ 113.14 metros (perda de ~10% na corda seca!)
      const startTime = new Date("2026-10-11T14:00:00Z").getTime();
      const points: GpsRawPoint[] = [];

      // Perfil otimizado: pontos a cada 2.5s (ou ângulo de 15° inserido pelo chipset J16)
      const numPontos = 6;
      for (let i = 0; i <= numPontos; i++) {
        const anguloRad = (i / numPontos) * (Math.PI / 2);
        const lat = -22.5 + (80 / 110758) * (1 - Math.cos(anguloRad));
        const lon = -44.1 + (80 / 110758) * Math.sin(anguloRad);
        points.push({
          latitude: lat,
          longitude: lon,
          speedKmh: 36.0,
          heading: Math.round((anguloRad * 180) / Math.PI),
          timestamp: startTime + i * 2100,
          ignition: true,
          gpsFixed: true,
        });
      }

      const resOtimizado = engine.processTrajectory(points);
      const arcoRealMetros = (Math.PI / 2) * 80; // 125.66m

      // O motor otimizado deve capturar a curvatura real com fusão inercial / trapezoidal
      assert.ok(
        resOtimizado.distanceProcessedMeters >= 120 && resOtimizado.distanceProcessedMeters <= 135,
        `Distância do trajeto em curva (${resOtimizado.distanceProcessedMeters.toFixed(1)}m) deve convergir para o arco real (~125.6m)`,
      );
    });

    it("deve comparar perfis e calcular a divergência evitada pelo simulador", () => {
      const startTime = new Date("2026-10-11T15:00:00Z").getTime();
      const points: GpsRawPoint[] = [];

      // Trajeto de 10 km misto (reta e curvas)
      for (let i = 0; i <= 100; i++) {
        points.push({
          latitude: -22.5 - i * 0.0009,
          longitude: -44.1 + Math.sin(i * 0.2) * 0.0002,
          speedKmh: 60,
          heading: 180 + Math.round(Math.cos(i * 0.2) * 20),
          timestamp: startTime + i * 10000, // 10 segundos
          ignition: true,
          gpsFixed: true,
        });
      }

      const comparativo = engine.simulateComparativeProfiles(points);
      assert.ok(comparativo.perfilOtimizado.distanciaKm > 0);
      assert.ok(comparativo.melhoriaPercentual >= 0);
      assert.strictEqual(comparativo.perfilOtimizado.configuracao, "TIMER,15,3600# | ANGLE,3,15#");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 4: MOTOR DE ODOMETRIA E SEPARAÇÃO DE DISTÂNCIAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Etapa 4: Motor de Odometria e Separação Estrita de Distâncias", () => {
    it("deve manter separadas a distância RAW, processada pelo filtro e com fator individual", () => {
      const engineComCalibracao = new GpsOdometryEngine({
        vehicleCalibrationFactor: 1.015, // Fator individual de +1.5% aferido
        referenceOdometerKm: 54320.0,
      });

      const t0 = new Date("2026-10-11T16:00:00Z").getTime();
      const points: GpsRawPoint[] = [
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.5045,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0 + 15000,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.509,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0 + 30000,
          ignition: true,
          gpsFixed: true,
        },
      ];

      const res = engineComCalibracao.processTrajectory(points);

      assert.ok(res.distanceRawMeters > 0, "Deve calcular distância RAW");
      assert.ok(res.distanceProcessedMeters > 0, "Deve calcular distância processada");
      assert.ok(res.distanceProcessedKm > 0, "Deve calcular distância processada em km");
      assert.ok(res.distanceCalibratedKm !== undefined, "Deve calcular distância calibrada");
      assert.strictEqual(res.calibrationFactorApplied, 1.015);
      assert.strictEqual(res.referenceOdometerKm, 54320.0);

      // Distância calibrada deve ser maior que a processada devido ao fator 1.015
      assert.ok(res.distanceCalibratedKm! >= res.distanceProcessedKm);
    });

    it("deve aplicar ZVU estrito (< 3m ou vel=0) e eliminar 100% do acúmulo de drift em paradas", () => {
      const t0 = new Date("2026-10-11T17:00:00Z").getTime();
      const points: GpsRawPoint[] = [
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 0,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        // Oscilações típicas de jitter de antena em semáforo (2.1m, 1.8m, 2.5m)
        {
          latitude: -22.500015,
          longitude: -44.10001,
          speedKmh: 0,
          timestamp: t0 + 10000,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.500005,
          longitude: -44.100018,
          speedKmh: 0,
          timestamp: t0 + 20000,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 0,
          timestamp: t0 + 30000,
          ignition: true,
          gpsFixed: true,
        },
      ];

      const res = engine.processTrajectory(points);
      assert.strictEqual(
        res.distanceProcessedMeters,
        0,
        "ZVU estrito deve zerar deslocamento parado",
      );
      assert.ok(res.driftMetersAvoided > 0, "Deve registrar metros de drift evitados");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 5: TRATAMENTO DE INTERVALOS, GAPS E FALHAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Etapa 5: Tratamento de Gaps de Sinal e Desduplicação de Rajadas", () => {
    it("deve segmentar a viagem em gaps temporais > 180s sem extrapolação cega", () => {
      const t0 = new Date("2026-10-11T18:00:00Z").getTime();
      const points: GpsRawPoint[] = [
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.505,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0 + 15000,
          ignition: true,
          gpsFixed: true,
        },
        // GAP DE 10 MINUTOS (Túnel longo / sombra de sinal celular)
        {
          latitude: -22.55,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0 + 600000,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.555,
          longitude: -44.1,
          speedKmh: 60,
          timestamp: t0 + 615000,
          ignition: true,
          gpsFixed: true,
        },
      ];

      const res = engine.processTrajectory(points);
      const pontoRecuperado = res.pointsEvaluated.find(
        (p) => p.classification === "PONTO_RECUPERADO",
      );
      assert.ok(
        pontoRecuperado !== null,
        "Ponto após gap > 180s deve ser classificado como PONTO_RECUPERADO",
      );
      assert.ok(pontoRecuperado?.exclusionReason?.includes("Gap temporal detectado"));
    });

    it("deve ordenar cronologicamente e remover pontos duplicados no mesmo instante", () => {
      const t0 = new Date("2026-10-11T19:00:00Z").getTime();
      const points: GpsRawPoint[] = [
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 40,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        // Duplicata no mesmo timestamp
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 40,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        // Ponto fora de ordem recebido antes
        {
          latitude: -22.508,
          longitude: -44.1,
          speedKmh: 40,
          timestamp: t0 + 20000,
          ignition: true,
          gpsFixed: true,
        },
        // Ponto recebido na rajada intermediária
        {
          latitude: -22.504,
          longitude: -44.1,
          speedKmh: 40,
          timestamp: t0 + 10000,
          ignition: true,
          gpsFixed: true,
        },
      ];

      const res = engine.processTrajectory(points);
      assert.strictEqual(res.totalPoints, 3, "Deve conter exatamente 3 pontos únicos cronológicos");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 6: CALIBRAÇÃO POR VEÍCULO
  // ───────────────────────────────────────────────────────────────────────────
  describe("Etapa 6: Calibração Individual por Veículo e Dispositivo", () => {
    it("deve calcular diferença_km e erro_percentual rigorosamente conforme a especificação", () => {
      const session: VehicleCalibrationSession = {
        veiculoId: "veic-uuid-001",
        hodometroInicialPainelKm: 85200.0,
        hodometroFinalPainelKm: 85250.0, // 50.0 km rodados no painel
        odometroInicialSigoKm: 1200.0,
        odometroFinalSigoKm: 1249.4, // 49.4 km no SIGO Guardião
      };

      const res = engine.calibrateVehicle(session);
      assert.strictEqual(res.distanciaPainelKm, 50.0);
      assert.strictEqual(res.distanciaSigoKm, 49.4);
      assert.strictEqual(res.diferencaKm, -0.6); // 49.4 - 50.0 = -0.6 km
      assert.strictEqual(res.erroPercentual, 1.2); // (0.6 / 50.0) * 100 = 1.2%
      assert.strictEqual(res.tendencia, "SUBESTIMADO");
      assert.ok(res.fatorCorrecaoCalculado > 1.0, "Subestimado exige fator > 1.0 para compensar");
    });

    it("deve exigir múltiplos percursos consistentes antes de recomendar fator de calibração", () => {
      const sessoes: VehicleCalibrationSession[] = [
        {
          veiculoId: "veic-uuid-002",
          hodometroInicialPainelKm: 10000.0,
          hodometroFinalPainelKm: 10050.0, // 50 km
          odometroInicialSigoKm: 500.0,
          odometroFinalSigoKm: 549.5, // 49.5 km
        },
        {
          veiculoId: "veic-uuid-002",
          hodometroInicialPainelKm: 10050.0,
          hodometroFinalPainelKm: 10120.0, // 70 km
          odometroInicialSigoKm: 549.5,
          odometroFinalSigoKm: 618.8, // 69.3 km
        },
        {
          veiculoId: "veic-uuid-002",
          hodometroInicialPainelKm: 10120.0,
          hodometroFinalPainelKm: 10200.0, // 80 km
          odometroInicialSigoKm: 618.8,
          odometroFinalSigoKm: 698.0, // 79.2 km
        },
      ];

      const analise = engine.evaluateCalibrationTendency(sessoes);
      assert.strictEqual(analise.totalSessoes, 3);
      assert.strictEqual(analise.distanciaTotalPainelKm, 200.0);
      assert.strictEqual(analise.distanciaTotalSigoKm, 198.0);
      assert.strictEqual(analise.diferencaAcumuladaKm, -2.0);
      assert.strictEqual(analise.tendenciaGlobal, "SUBESTIMADO");
      assert.strictEqual(
        analise.consistente,
        true,
        "3 sessões com erro médio de 1% devem ser consideradas consistentes",
      );
      assert.ok(analise.fatorGlobalRecomendado > 1.0 && analise.fatorGlobalRecomendado < 1.02);
    });

    it("não deve permitir calibração com distâncias zeradas ou valores inconsistentes", () => {
      assert.throws(() => {
        engine.calibrateVehicle({
          veiculoId: "veic-uuid-003",
          hodometroInicialPainelKm: 50000,
          hodometroFinalPainelKm: 50000, // 0 km
          odometroInicialSigoKm: 100,
          odometroFinalSigoKm: 110,
        });
      }, /maior que zero/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 7 & 8: VALIDAÇÃO ACUMULADA EM 5 ETAPAS (100km a 10.000km)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Etapa 7 e 8: Validação Acumulada em 5 Etapas e Critérios de Aprovação", () => {
    it("deve validar o plano acumulado de 100 km a 10.000 km com erro inferior a 0.5%", () => {
      const etapas: ValidationStage[] = [
        {
          etapaKm: 100,
          quilometragemHodometro: 100.0,
          quilometragemSigoGuardiao: 99.7,
          diferencaKm: -0.3,
          erroPercentual: 0.3,
          quantidadePontosRecebidos: 720,
          quantidadePontosDescartados: 12,
          configuracaoUtilizada: "TIMER,15,3600# | ANGLE,3,15#",
          condicoesPercurso: "Trecho urbano e rodovia",
          limitacoesObservadas: "Nenhuma oscilação relevante",
        },
        {
          etapaKm: 500,
          quilometragemHodometro: 500.0,
          quilometragemSigoGuardiao: 498.8,
          diferencaKm: -1.2,
          erroPercentual: 0.24,
          quantidadePontosRecebidos: 3600,
          quantidadePontosDescartados: 48,
          configuracaoUtilizada: "TIMER,15,3600# | ANGLE,3,15#",
          condicoesPercurso: "Perímetro urbano, serras e Dutra",
          limitacoesObservadas: "Curvas fechadas preservadas por compensação de ângulo",
        },
        {
          etapaKm: 1000,
          quilometragemHodometro: 1000.0,
          quilometragemSigoGuardiao: 997.5,
          diferencaKm: -2.5,
          erroPercentual: 0.25,
          quantidadePontosRecebidos: 7200,
          quantidadePontosDescartados: 95,
          configuracaoUtilizada: "TIMER,15,3600# | ANGLE,3,15#",
          condicoesPercurso: "Rotas intermunicipais mistas",
          limitacoesObservadas: "Zero drift em paradas prolongadas",
        },
        {
          etapaKm: 5000,
          quilometragemHodometro: 5000.0,
          quilometragemSigoGuardiao: 4988.0,
          diferencaKm: -12.0,
          erroPercentual: 0.24,
          quantidadePontosRecebidos: 36000,
          quantidadePontosDescartados: 420,
          configuracaoUtilizada: "TIMER,15,3600# | ANGLE,3,15#",
          condicoesPercurso: "Ciclo mensal de frota operacional",
          limitacoesObservadas: "Diferença contida abaixo de 15 km em 5.000 km",
        },
        {
          etapaKm: 10000,
          quilometragemHodometro: 10000.0,
          quilometragemSigoGuardiao: 9978.0,
          diferencaKm: -22.0,
          erroPercentual: 0.22,
          quantidadePontosRecebidos: 72000,
          quantidadePontosDescartados: 830,
          configuracaoUtilizada: "TIMER,15,3600# | ANGLE,3,15#",
          condicoesPercurso: "Ciclo de validação de longa duração",
          limitacoesObservadas: "Excelente convergência acumulada (< 0.25%)",
        },
      ];

      const relatorio = engine.validateAccumulatedStages(etapas);

      assert.strictEqual(relatorio.todasEtapasAprovadas, true);
      assert.ok(
        relatorio.erroMedioGeralPct < 0.35,
        `Erro médio (${relatorio.erroMedioGeralPct}%) deve ser < 0.35%`,
      );
      assert.strictEqual(relatorio.distanciaTotalTestadaKm, 16600.0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ETAPA 11: ABASTECIMENTO — VERIFICAÇÃO NO POSTO E PRÉ-PREENCHIMENTO TRUNCADO
  // ───────────────────────────────────────────────────────────────────────────
  describe("Abastecimento — Verificação no Posto e Calibração de Odômetro", () => {
    const extrairPrefixoKmSemUltimos3Digitos = (km: number | string | null | undefined): string => {
      if (!km) return "";
      const kmStr = String(Math.round(Number(km)));
      if (kmStr.length <= 3) return "";
      return kmStr.slice(0, -3);
    };

    it("deve extrair o prefixo removendo os 3 últimos dígitos quando veículo tem mais de 3 dígitos", () => {
      // Ex: 148.520 KM -> Prefixo 148 (usuário completa os 3 últimos dígitos ex: 520)
      assert.strictEqual(extrairPrefixoKmSemUltimos3Digitos(148520), "148");
      // Ex: 85.420 KM -> Prefixo 85
      assert.strictEqual(extrairPrefixoKmSemUltimos3Digitos(85420), "85");
      // Ex: 9.750 KM -> Prefixo 9
      assert.strictEqual(extrairPrefixoKmSemUltimos3Digitos(9750), "9");
    });

    it("deve retornar vazio se o veículo tiver 3 dígitos ou menos para preenchimento manual completo", () => {
      assert.strictEqual(extrairPrefixoKmSemUltimos3Digitos(850), "");
      assert.strictEqual(extrairPrefixoKmSemUltimos3Digitos(50), "");
      assert.strictEqual(extrairPrefixoKmSemUltimos3Digitos(null), "");
    });

    it("ao completar os 3 dígitos no posto, a quilometragem total é reconstituída perfeitamente", () => {
      const prefixo = extrairPrefixoKmSemUltimos3Digitos(148520); // "148"
      const digitosDigitadosNoPosto = "535"; // Usuário olhou no painel e viu 148.535
      const kmFinalReconstituido = Number(`${prefixo}${digitosDigitadosNoPosto}`);
      assert.strictEqual(kmFinalReconstituido, 148535);
    });
  });
});
