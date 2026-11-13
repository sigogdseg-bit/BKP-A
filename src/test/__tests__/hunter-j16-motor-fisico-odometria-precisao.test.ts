import { describe, it } from "node:test";
import assert from "node:assert";
import {
  calcularCrcItu,
  CRC_ITU_LOOKUP_TABLE,
  J16BinaryParser,
  Wgs84PhysicsEngine,
  J16PrecisionOdometerEngine,
  type KinematicPoint,
} from "../../shared/lib/j16PrecisionOdometerEngine";

describe("Hunter — Motor Físico-Matemático de Odometria de Precisão J16 (WGS-84 / GT06)", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // 1. CHECKSUM CRC-ITU OFICIAL (16 BITS)
  // ───────────────────────────────────────────────────────────────────────────
  describe("1. Validador e Checksum CRC-ITU (Lookup Table)", () => {
    it("deve possuir a tabela oficial CRC-ITU de 256 elementos", () => {
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE.length, 256);
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE[0], 0x0000);
      assert.strictEqual(CRC_ITU_LOOKUP_TABLE[1], 0x1189);
    });

    it("deve calcular o CRC-ITU de forma determinística e exata", () => {
      const bufferTeste = new Uint8Array([0x05, 0x13, 0x00, 0x01]);
      const crc = calcularCrcItu(bufferTeste);
      assert.ok(typeof crc === "number" && crc >= 0 && crc <= 0xffff);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. PARSER BINÁRIO J16 (0x01, 0x12, 0x13, 0x16)
  // ───────────────────────────────────────────────────────────────────────────
  describe("2. Parser Binário J16 Estrito", () => {
    it("deve rejeitar pacotes com CRC incorreto ou tamanho menor que 10 bytes", () => {
      const pacoteInvalido = new Uint8Array([0x78, 0x78, 0x01, 0x00, 0x0d, 0x0a]);
      assert.strictEqual(J16BinaryParser.parse(pacoteInvalido), null);

      const pacoteCrcCorrompido = new Uint8Array([
        0x78, 0x78, 0x05, 0x13, 0x00, 0x01, 0xaa, 0xbb, 0x0d, 0x0a,
      ]);
      assert.strictEqual(J16BinaryParser.parse(pacoteCrcCorrompido), null);
    });

    it("deve decodificar pacote 0x13 Heartbeat e registrar estado da ignição ACC", () => {
      // Pacote 0x13 Heartbeat com ACC Ligado (Terminal Info = 0x02)
      const dataPayload = new Uint8Array([
        0x05, // Length
        0x13, // Protocolo Heartbeat
        0x02, // Terminal Info (Bit 1 = 1 -> Ignição Ligada)
        0x05, // Nível Bateria
        0x03, // Nível GSM
        0x00,
        0x01, // Serial
      ]);
      const crc = calcularCrcItu(dataPayload);
      const pacote13 = new Uint8Array([
        0x78,
        0x78,
        ...dataPayload,
        (crc >> 8) & 0xff,
        crc & 0xff,
        0x0d,
        0x0a,
      ]);

      const decoded = J16BinaryParser.parse(pacote13);
      assert.ok(decoded !== null);
      if (decoded && decoded.tipoPacote === "HEARTBEAT") {
        assert.strictEqual(decoded.protocolo, 0x13);
        assert.strictEqual(decoded.ignicaoAcc, true);
        assert.strictEqual(decoded.bateriaNivel, 5);
        assert.strictEqual(decoded.gsmSinalNivel, 3);
      }
    });

    it("deve decodificar pacote 0x12 Location com cálculo correto de latitude, longitude e azimute", () => {
      // Dados para teste de localização: 2026-10-19 22:30:15 UTC
      // Lat: -22.755555°, Lon: -45.511111°
      // rawLat = Math.round(22.755555 * 1800000) = 40960000 = 0x02710000
      // rawLon = Math.round(45.511111 * 1800000) = 81920000 = 0x04E20000
      const dataPayload = new Uint8Array([
        0x1f, // Length = 31 bytes
        0x12, // Protocolo Location
        26,
        10,
        19,
        22,
        30,
        15, // Data/Hora: 2026-10-19 22:30:15
        0xc9, // 9 Satélites
        0x02,
        0x71,
        0x00,
        0x00, // Raw Lat = 40960000
        0x04,
        0xe2,
        0x00,
        0x00, // Raw Lon = 81920000
        0x3c, // Velocidade: 60 km/h (16.66 m/s)
        0x10,
        0x5a, // Status: Bit 4=1 (Fix), Bit 3=0 (Oeste -), Bit 2=0 (Sul -), Curso = 90°
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x07, // Serial = 7
      ]);
      const crc = calcularCrcItu(dataPayload);
      const pacote12 = new Uint8Array([
        0x78,
        0x78,
        ...dataPayload,
        (crc >> 8) & 0xff,
        crc & 0xff,
        0x0d,
        0x0a,
      ]);

      const decoded = J16BinaryParser.parse(pacote12);
      assert.ok(decoded !== null);
      if (decoded && decoded.tipoPacote === "LOCATION") {
        assert.strictEqual(decoded.protocolo, 0x12);
        assert.strictEqual(decoded.satelites, 9);
        assert.strictEqual(decoded.velocidadeKmh, 60);
        assert.strictEqual(decoded.gpsFixed, true);
        assert.strictEqual(decoded.cursoGraus, 90);
        assert.ok(decoded.latitude < 0, "Latitude sul deve ser negativa");
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FÍSICA GEODÉSICA WGS-84 E COMPENSAÇÃO DE CURVAS
  // ───────────────────────────────────────────────────────────────────────────
  describe("3. Modelagem Física WGS-84, Altitude e Curvatura Diferencial", () => {
    it("deve calcular raios de curvatura meridional M e primeiro vertical N com fidelidade WGS-84", () => {
      const phiRio = (-22.9 * Math.PI) / 180.0;
      const M = Wgs84PhysicsEngine.raioCurvaturaMeridional(phiRio);
      const N = Wgs84PhysicsEngine.raioCurvaturaPrimeiroVertical(phiRio);

      assert.ok(M > 6330000 && M < 6390000, `M deve estar na faixa geodésica: ${M}`);
      assert.ok(N > 6370000 && N < 6400000, `N deve estar na faixa geodésica: ${N}`);
      assert.ok(N > M, "No elipsoide oblato WGS-84, N > M");
    });

    it("deve calcular distância de corda local ENU exata entre coordenadas próximas", () => {
      const lat1 = -22.9068;
      const lon1 = -43.1729;
      // Deslocamento de ~0.001 grau (~110 metros)
      const lat2 = -22.9078;
      const lon2 = -43.1729;

      const dCorda = Wgs84PhysicsEngine.calcularDistanciaCordaWgs84(lat1, lon1, lat2, lon2);
      assert.ok(dCorda > 105 && dCorda < 115, `Distância esperada ~110m, calculada: ${dCorda}`);
    });

    it("deve reconstruir o arco real da curva recuperando distância superior à corda reta (Δθ = 90°)", () => {
      const dCorda = 141.42; // Corda de um quarto de círculo com raio R ~ 100m
      const curso1 = 0; // Norte
      const curso2 = 90; // Leste (curva de 90 graus)
      const deltaT = 10; // 10 segundos

      const resCurva = Wgs84PhysicsEngine.reconstruirArcoCurva(dCorda, curso1, curso2, deltaT);
      assert.strictEqual(resCurva.curvaCompensada, true);
      // Para arco de 90°: arco / corda = (pi/4) / sin(pi/4) = 0.785398 / 0.707106 = 1.1107 (+11.07%)
      assert.ok(resCurva.dArco > dCorda, "Arco deve ser estritamente maior que a corda reta");
      assert.ok(
        resCurva.ganhoPercentual > 10.0 && resCurva.ganhoPercentual < 12.0,
        `Ganho em curva de 90° deve ser ~11.1%: ${resCurva.ganhoPercentual}%`,
      );
    });

    it("deve manter dSuperficie inalterada em linha reta (Δθ < 0.05 rad)", () => {
      const dCorda = 100.0;
      const resReta = Wgs84PhysicsEngine.reconstruirArcoCurva(dCorda, 10, 11, 5);
      assert.strictEqual(resReta.curvaCompensada, false);
      assert.strictEqual(resReta.dArco, 100.0);
      assert.strictEqual(resReta.ganhoPercentual, 0);
    });

    it("deve fundir medição com Doppler cinemático (75% arco + 25% cinemática) quando divergência <= 15%", () => {
      const dArco = 100.0;
      const v1 = 10.0; // 10 m/s
      const v2 = 10.0; // 10 m/s
      const dt = 10; // dCinematica = 100m -> divergência = 0%
      const fusao = Wgs84PhysicsEngine.fundirComDoppler(dArco, v1, v2, dt);

      assert.strictEqual(fusao.fusaoAplicada, true);
      assert.strictEqual(fusao.dFusao, 100.0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. MOTOR INTEGRADO E TRAVAS ANTI-DRIFT (ZERO KM FANTASMA)
  // ───────────────────────────────────────────────────────────────────────────
  describe("4. Motor J16PrecisionOdometerEngine e Travas Anti-Drift", () => {
    it("deve rejeitar 100% de GPS Drift quando o veículo está parado com ignição desligada", () => {
      const engine = new J16PrecisionOdometerEngine({
        veiculoId: "v-test-1",
        odometroBaseKm: 183360.0,
      });

      const p1: KinematicPoint = {
        t: 1000,
        latitude: -22.9068,
        longitude: -43.1729,
        speedKmh: 0,
        speedMs: 0,
        courseDegrees: 90,
        satellites: 8,
        gpsFixed: true,
        ignition: false,
      };

      const res1 = engine.processarPonto(p1);
      assert.strictEqual(res1.deltaDistanceMeters, 0);

      // Ponto 2 com oscilação de antena de 8 metros (Drift de satélite)
      const p2: KinematicPoint = {
        t: 1010,
        latitude: -22.90687,
        longitude: -43.17297,
        speedKmh: 0,
        speedMs: 0,
        courseDegrees: 90,
        satellites: 8,
        gpsFixed: true,
        ignition: false, // Ignição desligada
      };

      const res2 = engine.processarPonto(p2);
      assert.strictEqual(
        res2.deltaDistanceMeters,
        0,
        "Drift com veículo estacionado DEVE ser 0.0 metros",
      );
      assert.ok(
        res2.descarteMotivo?.includes("estacionado") || res2.descarteMotivo?.includes("ZVU"),
        `Motivo deve indicar repouso: ${res2.descarteMotivo}`,
      );
      assert.strictEqual(
        engine.getEstado().odometroAtualKm,
        183360.0,
        "Odômetro deve permanecer inalterado",
      );
    });

    it("deve rejeitar saltos absurdos de antena / multipath (aceleração > 6 m/s² ou v > 220 km/h)", () => {
      const engine = new J16PrecisionOdometerEngine({
        veiculoId: "v-test-2",
        odometroBaseKm: 50000.0,
      });

      const p1: KinematicPoint = {
        t: 1000,
        latitude: -22.9068,
        longitude: -43.1729,
        speedKmh: 40,
        speedMs: 11.11,
        courseDegrees: 0,
        satellites: 9,
        gpsFixed: true,
        ignition: true,
      };
      engine.processarPonto(p1);

      // Salto instantâneo de 3 km em 2 segundos (v_aparente = 5400 km/h)
      const p2: KinematicPoint = {
        t: 1002,
        latitude: -22.88,
        longitude: -43.1729,
        speedKmh: 40,
        speedMs: 11.11,
        courseDegrees: 0,
        satellites: 9,
        gpsFixed: true,
        ignition: true,
      };

      const res2 = engine.processarPonto(p2);
      assert.strictEqual(res2.deltaDistanceMeters, 0);
      assert.ok(res2.descarteMotivo?.includes("Multipath"));
      assert.strictEqual(engine.getEstado().odometroAtualKm, 50000.0);
    });

    it("deve acumular quilometragem com precisão em deslocamento real válido", () => {
      const engine = new J16PrecisionOdometerEngine({
        veiculoId: "v-test-3",
        odometroBaseKm: 100.0,
        fatorCalibracaoK: 1.0,
      });

      const p1: KinematicPoint = {
        t: 1000,
        latitude: -22.9068,
        longitude: -43.1729,
        speedKmh: 60,
        speedMs: 16.66,
        courseDegrees: 90,
        satellites: 10,
        gpsFixed: true,
        ignition: true,
      };
      engine.processarPonto(p1);

      // Deslocamento de ~100 metros a 60 km/h em 6 segundos
      const p2: KinematicPoint = {
        t: 1006,
        latitude: -22.9068,
        longitude: -43.17195,
        speedKmh: 60,
        speedMs: 16.66,
        courseDegrees: 90,
        satellites: 10,
        gpsFixed: true,
        ignition: true,
      };

      const res2 = engine.processarPonto(p2);
      assert.ok(res2.deltaDistanceMeters > 90 && res2.deltaDistanceMeters < 110);
      assert.ok(engine.getEstado().odometroAtualKm > 100.09);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. AUTO-CALIBRAÇÃO DO FATOR K DO PNEU/PAINEL (CONTRAN/ECE R39)
  // ───────────────────────────────────────────────────────────────────────────
  describe("5. Algoritmo de Auto-Tuning do Fator K do Pneu/Painel", () => {
    it("deve exigir percurso mínimo de 100 km para convergência estatística", () => {
      const engine = new J16PrecisionOdometerEngine({
        veiculoId: "v-test-calib",
        odometroBaseKm: 10000.0,
      });

      const res = engine.autoCalibrarPainel(10050.0, 50.0);
      assert.strictEqual(res.sucesso, false);
      assert.ok(res.motivo?.includes("100 km"));
    });

    it("deve calibrar o Fator K com amortecimento exponencial e clamping seguro [0.95, 1.10]", () => {
      const engine = new J16PrecisionOdometerEngine({
        veiculoId: "v-test-calib-2",
        odometroBaseKm: 10000.0,
        fatorCalibracaoK: 1.0,
      });

      // Painel marcou 101.5 km onde o GPS registrou 100 km (K_obs = 1.015)
      const res = engine.autoCalibrarPainel(10101.5, 100.0);
      assert.strictEqual(res.sucesso, true);
      // K_novo = 0.7 * 1.015 + 0.3 * 1.0 = 0.7105 + 0.3 = 1.0105
      assert.ok(Math.abs(res.fatorKNovo - 1.0105) < 0.001);
      assert.strictEqual(engine.getEstado().fatorCalibracaoK, res.fatorKNovo);
      assert.strictEqual(engine.getEstado().odometroAtualKm, 10101.5);
    });
  });
});
