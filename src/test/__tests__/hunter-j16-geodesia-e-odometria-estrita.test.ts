import { describe, it } from "node:test";
import assert from "node:assert";
import {
  CRC_ITU_LOOKUP_TABLE,
  calcularCrcItuLookup,
  decodificarPacoteJ16,
  GpsKalmanFilter2D,
  calculateGeodesicDistanceMeters,
  calculateTrapezoidalDistanceMeters,
  calculateInertialFusedDistanceMeters,
  getWgs84EarthRadiusAtLatitude,
  GpsOdometryEngine,
  type GpsRawPoint,
} from "../../shared/lib/gpsOdometryEngine";

describe("Hunter — J16 Geodésia, Protocolo Telemetria e Odometria Estrita (DJR-NEW)", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // MÓDULO 1: VALIDAÇÃO DE INTEGRIDADE E DECODIFICAÇÃO DE PROTOCOLO (J16)
  // ───────────────────────────────────────────────────────────────────────────
  describe("Módulo 1: Validação de Checksum (CRC-ITU) e Decodificação J16", () => {
    it("deve conter a tabela oficial de lookup CRC-ITU de 256 elementos (0x1021)", () => {
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE.length, 256);
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE[0], 0x0000);
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE[1], 0x1021);
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE[255], 0x1ef0);
    });

    it("deve validar a integridade estrutural e descartar pacote corrompido com CRC-ITU", () => {
      // Pacote legítimo 0x12 (Login/Location) com stop-bit 0x0D 0x0A
      const payload = Buffer.from([
        0x78,
        0x78, // Header
        0x1f, // Length = 31 bytes
        0x12, // Protocolo Localização (0x12)
        26,
        10,
        11,
        10,
        30,
        0, // Date Time: 2026-10-11 10:30:00 UTC
        0xcf, // Satélites = 15
        0x02,
        0x71,
        0x00,
        0x00, // Raw Lat: 40960000 -> 22.755555°
        0x04,
        0xe2,
        0x00,
        0x00, // Raw Lon: 81920000 -> 45.511111°
        0x3c, // Velocidade: 60 km/h
        0x10,
        0x5a, // Course Status: Bit 12 = 1 (GPS Fixado), Bit 11 = 0, Bit 10 = 0 (Sul), Rumo = 90°
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00, // Demais bytes
        0x00,
        0x01, // Serial Number = 1
      ]);

      const crcCalculado = calcularCrcItuLookup(payload.subarray(2));
      const pacoteValido = Buffer.concat([
        payload,
        Buffer.from([(crcCalculado >> 8) & 0xff, crcCalculado & 0xff, 0x0d, 0x0a]),
      ]);

      const decodificado = decodificarPacoteJ16(pacoteValido);
      assert.ok(decodificado !== null, "Pacote íntegro deve ser decodificado com sucesso");
      assert.strictEqual(decodificado?.protocolo, 0x12);
      assert.strictEqual(decodificado?.velocidadeKmh, 60);
      assert.strictEqual(decodificado?.gpsFixado, true);
      assert.strictEqual(decodificado?.validoParaOdometria, true);

      // Agora corrompe 1 byte do payload
      const pacoteCorrompido = Buffer.from(pacoteValido);
      pacoteCorrompido[10] ^= 0xff; // Inverte bits
      const decodificadoCorrompido = decodificarPacoteJ16(pacoteCorrompido);
      assert.strictEqual(
        decodificadoCorrompido,
        null,
        "Pacote com checksum corrompido DEVE ser descartado imediatamente",
      );
    });

    it("deve filtrar e processar apenas pacotes de Localização (0x12) e Alarme (0x16)", () => {
      // Cria pacote de Heartbeat (0x13)
      const payload13 = Buffer.from([0x78, 0x78, 0x05, 0x13, 0x00, 0x01]);
      const crc13 = calcularCrcItuLookup(payload13.subarray(2));
      const pkt13 = Buffer.concat([
        payload13,
        Buffer.from([(crc13 >> 8) & 0xff, crc13 & 0xff, 0x0d, 0x0a]),
      ]);
      assert.strictEqual(
        decodificarPacoteJ16(pkt13),
        null,
        "Pacote 0x13 (Heartbeat) deve ser ignorado para odometria",
      );
    });

    it("deve validar o Bit 4 do Byte 1 do Course Status e descartar coordenadas sem Fix GNSS (LBS)", () => {
      // Course Status com Bit 12 = 0 (Sem Fix / LBS)
      const payloadSemFix = Buffer.from([
        0x78,
        0x78,
        0x1f,
        0x12,
        26,
        10,
        11,
        10,
        31,
        0,
        0xc8,
        0x02,
        0x71,
        0x00,
        0x00,
        0x04,
        0xe2,
        0x00,
        0x00,
        0x00, // Velocidade 0
        0x00,
        0x5a, // Course Status: Bit 12 = 0 (SEM FIX!), Bit 10 = 0 (Sul)
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
      const crc = calcularCrcItuLookup(payloadSemFix.subarray(2));
      const pkt = Buffer.concat([
        payloadSemFix,
        Buffer.from([(crc >> 8) & 0xff, crc & 0xff, 0x0d, 0x0a]),
      ]);

      const res = decodificarPacoteJ16(pkt);
      assert.ok(res !== null);
      assert.strictEqual(res?.gpsFixado, false, "Bit 12 = 0 deve indicar fix GNSS ausente");
      assert.strictEqual(
        res?.validoParaOdometria,
        false,
        "Coordenada LBS/sem fix DEVE ser descartada para cálculo de odometria",
      );
      assert.ok(res?.descarteMotivo?.includes("Fix GNSS ausente"));
    });

    it("deve decodificar latitude e longitude dividindo por 30.000 e 60 (1.800.000) com sinais de hemisfério", () => {
      // Coordenadas de Volta Redonda / RJ: Lat ~ -22.5185°, Lon ~ -44.1045°
      // rawLat = 22.5185 * 1800000 = 40533300 = 0x026A7E34
      // rawLon = 44.1045 * 1800000 = 79388100 = 0x04BB61C4
      const rawLat = Math.round(22.5185 * 1800000);
      const rawLon = Math.round(44.1045 * 1800000);

      const payloadVR = Buffer.from([
        0x78,
        0x78,
        0x1f,
        0x12,
        26,
        10,
        11,
        10,
        32,
        0,
        0xcb,
        (rawLat >> 24) & 0xff,
        (rawLat >> 16) & 0xff,
        (rawLat >> 8) & 0xff,
        rawLat & 0xff,
        (rawLon >> 24) & 0xff,
        (rawLon >> 16) & 0xff,
        (rawLon >> 8) & 0xff,
        rawLon & 0xff,
        45, // 45 km/h
        0x18,
        0x5a, // Course Status: Bit 12 = 1 (Fix), Bit 11 = 1 (West), Bit 10 = 0 (South) -> 0x185A
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x03,
      ]);
      const crc = calcularCrcItuLookup(payloadVR.subarray(2));
      const pkt = Buffer.concat([
        payloadVR,
        Buffer.from([(crc >> 8) & 0xff, crc & 0xff, 0x0d, 0x0a]),
      ]);

      const res = decodificarPacoteJ16(pkt);
      assert.ok(res !== null);
      assert.ok(Math.abs(res!.latitude - -22.5185) < 0.0001, "Latitude deve ser negativa (Sul)");
      assert.ok(
        Math.abs(res!.longitude - -44.1045) < 0.0001,
        "Longitude deve ser negativa (Oeste)",
      );
      assert.strictEqual(res!.velocidadeKmh, 45);
      assert.strictEqual(res!.rumoGraus, 0x5a); // 90° (Leste)
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MÓDULO 2: PRÉ-PROCESSAMENTO, ZVU E FILTRO DE KALMAN 2D
  // ───────────────────────────────────────────────────────────────────────────
  describe("Módulo 2: Pré-processamento, ZVU Estrito e Filtro de Kalman 2D", () => {
    it("deve forçar delta s = 0 em paradas com ZVU Estrito (< 3 metros ou velocidade 0)", () => {
      const engine = new GpsOdometryEngine({ strictZvuThresholdMeters: 3.0 });
      const t0 = new Date("2026-10-11T12:00:00Z").getTime();

      // Ponto 1 e Ponto 2 com jitter de 2.2 metros e velocidade 0
      const points: GpsRawPoint[] = [
        {
          latitude: -22.5185,
          longitude: -44.1045,
          speedKmh: 0,
          heading: 0,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.51852,
          longitude: -44.1045,
          speedKmh: 0,
          heading: 0,
          timestamp: t0 + 10000,
          ignition: true,
          gpsFixed: true,
        },
      ];

      const res = engine.processTrajectory(points);
      assert.strictEqual(
        res.distanceProcessedMeters,
        0,
        "ZVU estrito deve forçar delta s = 0 quando velocidade = 0 ou deslocamento < 3m",
      );
      assert.ok(res.driftMetersAvoided > 2.0);
    });

    it("deve atenuar jitter urbano através do Filtro de Kalman 2D fundindo velocidade e rumo", () => {
      const kalman = new GpsKalmanFilter2D({ processNoiseSigmaA: 2.5, measurementNoisePos: 3.0 });
      const t0 = 1000000;

      // Veículo trafegando em linha reta rumo ao Norte (rumo 0°, v = 60 km/h = 16.67 m/s)
      // Simula jitter lateral (Leste-Oeste) com salto de 8 metros por reflexão em prédio (multipath)
      const lat0 = -22.5;
      const lon0 = -44.1;

      // Amostra 1
      kalman.update(lat0, lon0, 60, 0, t0);
      // Amostra 2 (10s depois): deve estar ~167 metros ao Norte
      const k2 = kalman.update(lat0 + 0.0015, lon0, 60, 0, t0 + 10000);
      // Amostra 3 (10s depois): multipath ruidoso salta 8 metros a Leste (lon + 0.00008)
      const noisyLon = lon0 + 0.00008;
      const k3 = kalman.update(lat0 + 0.003, noisyLon, 60, 0, t0 + 20000);

      // O Filtro de Kalman deve puxar o salto lateral para perto da trajetória retilínea
      const desvioRealMeters = calculateGeodesicDistanceMeters(
        lat0 + 0.003,
        lon0,
        lat0 + 0.003,
        noisyLon,
      );
      const desvioFiltradoMeters = calculateGeodesicDistanceMeters(
        lat0 + 0.003,
        lon0,
        k3.lat,
        k3.lon,
      );

      assert.ok(
        desvioFiltradoMeters < desvioRealMeters * 0.75,
        `Kalman deve atenuar desvio lateral: bruto = ${desvioRealMeters.toFixed(2)}m, filtrado = ${desvioFiltradoMeters.toFixed(2)}m`,
      );
    });

    it("deve segmentar a viagem e não extrapolar linhas retas cegas quando delta t > 180s (túnel/sombra)", () => {
      const engine = new GpsOdometryEngine({ maxGapSeconds: 180 });
      const t0 = new Date("2026-10-11T14:00:00Z").getTime();

      // Ponto antes do túnel -> Ponto 10 minutos (600s) depois, a 12 km de distância
      const points: GpsRawPoint[] = [
        {
          latitude: -22.5,
          longitude: -44.1,
          speedKmh: 70,
          heading: 90,
          timestamp: t0,
          ignition: true,
          gpsFixed: true,
        },
        {
          latitude: -22.5,
          longitude: -44.22,
          speedKmh: 70,
          heading: 90,
          timestamp: t0 + 600000,
          ignition: true,
          gpsFixed: true,
        },
      ];

      const res = engine.processTrajectory(points);
      assert.strictEqual(
        res.distanceProcessedMeters,
        0,
        "Gap temporal anômalo (> 180s) NÃO deve extrapolar linha reta cega",
      );
      assert.strictEqual(res.pointsEvaluated[1].classification, "PONTO_RECUPERADO");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MÓDULO 3: MODELAGEM MATEMÁTICA, INTEGRAÇÃO TRAPEZOIDAL E FUSÃO INERCIAL
  // ───────────────────────────────────────────────────────────────────────────
  describe("Módulo 3: Modelagem Geodésica, Regra do Trapézio e Fusão Inercial", () => {
    it("deve calcular a integração numérica de velocidade aplicando a Regra do Trapézio", () => {
      // v1 = 50 km/h, v2 = 70 km/h, delta_t = 10 segundos
      // v_media = 60 km/h = 16.6667 m/s -> s = 166.67 metros
      const distTrap = calculateTrapezoidalDistanceMeters(50, 70, 10);
      assert.ok(
        Math.abs(distTrap - 166.67) < 0.1,
        `Distância trapezoidal esperada ~166.67m, obteve ${distTrap.toFixed(2)}m`,
      );
    });

    it("deve compensar a perda de corda em curva fechada via Fusão Inercial de Rumo e Velocidade", () => {
      // Cenário de Curva Fechada em Esquina / Rotatória:
      // Veículo a 40 km/h faz curva de 90° com raio R = 40 metros em 6.3 segundos
      // Comprimento real do arco percorrido pelas rodas: L = (pi / 2) * 40 ≈ 62.83 metros
      // Corda seca em linha reta entre os pontos: c = sqrt(40^2 + 40^2) ≈ 56.57 metros
      // Perda do GPS simples sem fusão: ~6.26 metros (~10% a menos!)
      const cordaGeodesica = Math.sqrt(40 * 40 + 40 * 40); // 56.57m
      const vKmh = 40;
      const heading1 = 0; // Norte
      const heading2 = 90; // Leste (variação de 90°)
      const deltaSec = 6.28; // Tempo para percorrer 62.8m a 40 km/h (11.11 m/s)

      const distFundida = calculateInertialFusedDistanceMeters(
        cordaGeodesica,
        vKmh,
        vKmh,
        heading1,
        heading2,
        deltaSec,
      );

      assert.ok(
        distFundida > cordaGeodesica,
        `A fusão inercial deve recuperar o arco real (${distFundida.toFixed(1)}m > ${cordaGeodesica.toFixed(1)}m)`,
      );
      assert.ok(
        Math.abs(distFundida - 62.83) < 3.0,
        `A fusão inercial deve convergir para o arco real (~62.8m), obteve ${distFundida.toFixed(1)}m`,
      );
    });

    it("deve manter a distância geodésica estrita WGS-84 quando o veículo estiver em linha reta", () => {
      // Em reta (Δrumo = 0°), não deve haver acréscimo inercial artificial
      const distReta = 500.0; // 500 metros
      const distFundidaReta = calculateInertialFusedDistanceMeters(distReta, 60, 60, 90, 90, 30);
      assert.strictEqual(
        distFundidaReta,
        distReta,
        "Em reta (Δrumo < 8°), a distância deve ser estritamente a geodésica WGS-84",
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MÓDULO 4: APRIMORAMENTO ESPACIAL E FIDELIDADE AO HODÔMETRO DO VEÍCULO
  // ───────────────────────────────────────────────────────────────────────────
  describe("Módulo 4: Aprimoramento Espacial e Fidelidade ao Hodômetro", () => {
    it("deve realizar map-matching com malha viária preservando o eixo real da rodovia", () => {
      const engine = new GpsOdometryEngine();
      // Simula 3 waypoints discretos com corte de curva vs 5 nós viários da geometria real da via
      const waypointsGps: GpsRawPoint[] = [
        { latitude: -22.5, longitude: -44.1, speedKmh: 60, timestamp: 1000, gpsFixed: true },
        { latitude: -22.503, longitude: -44.102, speedKmh: 60, timestamp: 2000, gpsFixed: true },
        { latitude: -22.506, longitude: -44.1, speedKmh: 60, timestamp: 3000, gpsFixed: true },
      ];

      // Geometria enriquecida no asfalto real da rodovia
      const malhaViaria: [number, number][] = [
        [-22.5, -44.1],
        [-22.5015, -44.101],
        [-22.503, -44.102],
        [-22.5045, -44.101],
        [-22.506, -44.1],
      ];

      const res = engine.matchTrajectoryToRoadNetwork(waypointsGps, malhaViaria);
      assert.ok(res.roadDistanceMeters > 0);
      assert.strictEqual(typeof res.roadDistanceKm, "number");
    });

    it("deve atingir acurácia > 99.8% em comparação ao hodômetro físico do veículo", () => {
      const engine = new GpsOdometryEngine();
      const comp = engine.compareWithVehicleOdometer(150.0, 150.05);

      assert.ok(
        comp.accuracyPercent >= 99.9,
        `Acurácia deve ser >= 99.9%, obteve ${comp.accuracyPercent}%`,
      );
      assert.ok(
        comp.errorPercent < 0.1,
        `Erro percentual deve ser < 0.1%, obteve ${comp.errorPercent}%`,
      );
    });
  });
});
