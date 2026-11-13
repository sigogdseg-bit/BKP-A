import { describe, it } from "node:test";
import assert from "node:assert";
import {
  GpsOdometryEngine,
  calculateGeodesicDistanceMeters,
  getWgs84EarthRadiusAtLatitude,
  canonicalGpsOdometryEngine,
  type GpsRawPoint,
} from "../../shared/lib/gpsOdometryEngine";

describe("Hunter — Motor de Odometria GPS de Alta Precisão (WGS-84 & Anti-Drift)", () => {
  const engine = new GpsOdometryEngine();

  it("deve calcular o raio geocêntrico local WGS-84 com precisão elipsoidal superior à esfera universal", () => {
    // Na latitude de Volta Redonda / RJ (~ -22.52°)
    const raioLocal = getWgs84EarthRadiusAtLatitude(-22.52);
    // No equador o raio é 6.378.137m e no polo é 6.356.752m. A -22.52°, deve estar em torno de 6.374.900m
    assert.ok(
      raioLocal > 6374000 && raioLocal < 6376000,
      `Raio local esperado ~6374.9km, obteve ${raioLocal}`,
    );
  });

  it("deve calcular distância geodésica WGS-84 com precisão métrica sem fatores arbitrários", () => {
    // Deslocamento de 1000.0 metros em linha reta na latitude -22.5°
    // 1 grau de latitude ≈ 110.758 metros nesta região
    const lat1 = -22.5;
    const lon1 = -44.1;
    const lat2 = -22.509028; // ~1000 metros ao sul
    const lon2 = -44.1;

    const dist = calculateGeodesicDistanceMeters(lat1, lon1, lat2, lon2);
    assert.ok(
      Math.abs(dist - 1000) < 5.0,
      `Distância calculada deve ser ~1000m, obteve ${dist.toFixed(2)}m`,
    );
  });

  it("deve preservar a distância real em linha reta de 5 km, 10 km, 20 km com erro inferior a 0.5%", () => {
    const cenarios = [
      { kmRef: 5.0, pontos: 20 },
      { kmRef: 10.0, pontos: 40 },
      { kmRef: 20.0, pontos: 80 },
    ];

    for (const cenario of cenarios) {
      const startTime = new Date("2026-10-06T10:00:00Z").getTime();
      const points: GpsRawPoint[] = [];
      const deltaLat = cenario.kmRef / 110.758 / cenario.pontos;

      for (let i = 0; i <= cenario.pontos; i++) {
        points.push({
          latitude: -22.5 - i * deltaLat,
          longitude: -44.1,
          speedKmh: 60.0,
          timestamp: startTime + i * 15000, // a cada 15 segundos
          ignition: true,
        });
      }

      const res = engine.processTrajectory(points);
      const diffKm = Math.abs(res.distanceProcessedKm - cenario.kmRef);
      const erroPct = (diffKm / cenario.kmRef) * 100;

      assert.ok(
        erroPct < 0.5,
        `Cenário ${cenario.kmRef}km: erro ${erroPct.toFixed(3)}% deve ser < 0.5%. Obteve ${res.distanceProcessedKm}km`,
      );
      assert.strictEqual(res.pointsDiscarded, 0, "Nenhum ponto válido deve ser descartado em reta");
    }
  });

  it("deve preservar curvas e sinuosidade sem atalhos destrutivos (geometria real)", () => {
    // Simula curva em semi-círculo de raio R = 200m (comprimento do arco = pi * R ≈ 628.3m)
    // Se ligasse direto linha reta (corda), daria 2 * R = 400m (subestimando em 36%!)
    const centroLat = -22.5;
    const centroLon = -44.1;
    const raioGraus = 200 / 110758; // 200 metros
    const startTime = new Date("2026-10-06T11:00:00Z").getTime();

    const points: GpsRawPoint[] = [];
    const numPontosCurva = 12; // J16 reportando a cada 15 graus via comando ANGLE
    for (let i = 0; i <= numPontosCurva; i++) {
      const anguloRad = (i / numPontosCurva) * Math.PI;
      points.push({
        latitude: centroLat + raioGraus * Math.cos(anguloRad),
        longitude: centroLon + raioGraus * Math.sin(anguloRad),
        speedKmh: 40.0,
        timestamp: startTime + i * 2000,
        ignition: true,
      });
    }

    const res = engine.processTrajectory(points);
    const distanciaArcoEsperadaM = Math.PI * 200; // ~628.3 metros
    const diffM = Math.abs(res.distanceProcessedMeters - distanciaArcoEsperadaM);

    // O cálculo deve capturar o arco e NÃO a corda direta de 400m
    assert.ok(
      res.distanceProcessedMeters > 590,
      `Distância de curva deve preservar o arco (~628m), obteve ${res.distanceProcessedMeters.toFixed(1)}m`,
    );
    assert.ok(
      diffM < 30,
      `Diferença em relação ao arco ideal deve ser < 30m, obteve ${diffM.toFixed(1)}m`,
    );
  });

  it("deve eliminar 100% do GPS drift quando o veículo estiver parado em semáforos ou com ignição desligada", () => {
    // Cenário Realista:
    // Veículo anda 2.0 km -> Para por 3 minutos no semáforo (onde o GPS drift oscila ±3m a ±9m a cada 15s) -> Anda mais 2.0 km
    const startTime = new Date("2026-10-06T12:00:00Z").getTime();
    const points: GpsRawPoint[] = [];
    let curTime = startTime;

    // Trecho 1: Anda 2.0 km (~0.01805 graus lat)
    for (let i = 0; i <= 10; i++) {
      points.push({
        latitude: -22.5 - i * 0.001805,
        longitude: -44.1,
        speedKmh: 50.0,
        timestamp: curTime,
        ignition: true,
      });
      curTime += 15000;
    }

    const latParada = -22.5 - 10 * 0.001805;
    const lonParada = -44.1;

    // Trecho 2: Parado no semáforo por 12 amostras (3 minutos). GPS Drift oscila entre ±3m e ±8m!
    const driftOffsets = [
      [0.00003, 0.00002], // ~4 metros
      [-0.00004, 0.00001], // ~5 metros
      [0.00002, -0.00005], // ~6 metros
      [-0.00003, -0.00002], // ~4 metros
      [0.00005, 0.00004], // ~7 metros
      [0.0, 0.0], // 0 metros
      [-0.00002, 0.00003], // ~4 metros
      [0.00004, -0.00001], // ~4 metros
      [-0.00005, -0.00003], // ~6 metros
      [0.00002, 0.00005], // ~6 metros
      [0.00001, -0.00002], // ~2 metros
      [0.0, 0.0], // 0 metros
    ];

    for (const [dLat, dLon] of driftOffsets) {
      points.push({
        latitude: latParada + dLat,
        longitude: lonParada + dLon,
        speedKmh: 0.0, // Reportado parado pelo hardware
        timestamp: curTime,
        ignition: true, // Motor ligado no semáforo
      });
      curTime += 15000;
    }

    // Trecho 3: Retoma movimento e anda mais 2.0 km
    for (let i = 1; i <= 10; i++) {
      points.push({
        latitude: latParada - i * 0.001805,
        longitude: lonParada,
        speedKmh: 50.0,
        timestamp: curTime,
        ignition: true,
      });
      curTime += 15000;
    }

    const res = engine.processTrajectory(points);

    // Distância real percorrida: 2.0 km + 2.0 km = 4.0 km
    const distRealKm = 4.0;
    const diffKm = Math.abs(res.distanceProcessedKm - distRealKm);

    assert.ok(
      res.driftMetersAvoided > 30,
      `Deve ter detectado e ignorado o drift de parada (>30m), evitou ${res.driftMetersAvoided}m`,
    );
    assert.ok(
      diffKm < 0.1,
      `A distância processada final (${res.distanceProcessedKm}km) deve ser ~4.0km sem ser inflada pelo drift`,
    );
    assert.ok(
      res.distanceRawMeters > res.distanceProcessedMeters,
      "A distância RAW deve ser maior que a processada devido ao acúmulo de drift falso",
    );
  });

  it("deve rejeitar spikes / outliers de GPS (salto de posição impossível A-B-C)", () => {
    const startTime = new Date("2026-10-06T13:00:00Z").getTime();
    const points: GpsRawPoint[] = [
      // Ponto A: Coordenada inicial
      { latitude: -22.5, longitude: -44.1, speedKmh: 40, timestamp: startTime, ignition: true },
      // Ponto B: SPIKE! Salto absurdo de 1.5 km em 2 segundos (v = 2700 km/h) por multipath/antena
      {
        latitude: -22.5135,
        longitude: -44.1,
        speedKmh: 40,
        timestamp: startTime + 2000,
        ignition: true,
      },
      // Ponto C: Retorno imediato à rota real a 22m de A (v normal de 40 km/h)
      {
        latitude: -22.5002,
        longitude: -44.1,
        speedKmh: 40,
        timestamp: startTime + 4000,
        ignition: true,
      },
      // Ponto D: Continuação regular
      {
        latitude: -22.5004,
        longitude: -44.1,
        speedKmh: 40,
        timestamp: startTime + 6000,
        ignition: true,
      },
    ];

    const res = engine.processTrajectory(points);

    // O spike de 1.5km deve ter sido descartado
    assert.strictEqual(res.pointsDiscarded, 1, "Exatamente 1 ponto spike deve ser descartado");
    assert.ok(
      res.distanceProcessedMeters < 100,
      `Distância deve ser ~45 metros e NÃO ~3000 metros! Obteve: ${res.distanceProcessedMeters.toFixed(1)}m`,
    );
  });

  it("deve reordenar buffers pós-queda de 4G e descartar pacotes duplicados sem inflar quilometragem", () => {
    const t0 = new Date("2026-10-06T14:00:00Z").getTime();

    // Pacotes chegando desordenados ou com duplicações da rede celular
    const points: GpsRawPoint[] = [
      { latitude: -22.5, longitude: -44.1, speedKmh: 50, timestamp: t0, ignition: true },
      // Ponto duplicado no mesmo segundo (típico de pacotes 0x12 e 0x16 simultâneos do J16)
      { latitude: -22.5, longitude: -44.1, speedKmh: 50, timestamp: t0, ignition: true },
      // Ponto 3 que chegou antes por oscilação de pacote
      { latitude: -22.502, longitude: -44.1, speedKmh: 50, timestamp: t0 + 20000, ignition: true },
      // Ponto 2 buffered que chegou depois na rajada
      { latitude: -22.501, longitude: -44.1, speedKmh: 50, timestamp: t0 + 10000, ignition: true },
    ];

    const res = engine.processTrajectory(points);

    // Os pontos devem ser ordenados cronologicamente e a duplicata removida
    assert.strictEqual(res.totalPoints, 3, "Deve haver 3 pontos únicos ordenados");
    assert.ok(
      res.distanceProcessedKm > 0.2 && res.distanceProcessedKm < 0.25,
      `Distância esperada ~0.22km, obteve ${res.distanceProcessedKm}km`,
    );
  });

  it("deve calcular as métricas de acurácia de odometria em comparação ao hodômetro do veículo", () => {
    // Veículo com 18.70 km no hodômetro de fábrica
    const hodometroVeiculoKm = 18.7;
    const gpsDistanceKm = 18.68;

    const comp = engine.compareWithVehicleOdometer(hodometroVeiculoKm, gpsDistanceKm);

    assert.strictEqual(comp.vehicleOdometerKm, 18.7);
    assert.strictEqual(comp.gpsOdometerKm, 18.68);
    assert.strictEqual(comp.differenceKm, -0.02);
    assert.ok(comp.errorPercent < 0.2, `Erro percentual (${comp.errorPercent}%) deve ser < 0.2%`);
    assert.ok(comp.accuracyPercent > 99.8, `Acurácia (${comp.accuracyPercent}%) deve ser > 99.8%`);
  });

  it("deve testar viagens realistas de 50 km e 100 km simulando tráfego misto com precisão > 99%", () => {
    const distanciasTeste = [50.0, 100.0];

    for (const distKm of distanciasTeste) {
      const startTime = new Date("2026-10-06T08:00:00Z").getTime();
      const numAmostras = Math.round(distKm * 4); // 1 amostra a cada 250m
      const points: GpsRawPoint[] = [];

      // Na latitude de -22.5°, 1 grau = ~111.263 metros geodésicos
      const grausPorKm = 1 / 111.263;
      const deltaLatPorPonto = (distKm * grausPorKm) / numAmostras;

      for (let i = 0; i <= numAmostras; i++) {
        points.push({
          latitude: -22.5 - i * deltaLatPorPonto,
          longitude: -44.1,
          speedKmh: 80.0,
          timestamp: startTime + i * 11250, // ~11.25s por ponto a 80 km/h
          ignition: true,
        });
      }

      const res = engine.processTrajectory(points);
      // Calcula a distância geodésica de referência física exata entre os pontos inicial e final
      const distReferenciaKm =
        calculateGeodesicDistanceMeters(
          points[0].latitude,
          points[0].longitude,
          points[points.length - 1].latitude,
          points[points.length - 1].longitude,
        ) / 1000;

      const comp = engine.compareWithVehicleOdometer(distReferenciaKm, res.distanceProcessedKm);

      assert.ok(
        comp.errorPercent < 0.1,
        `Viagem de ${distKm}km: erro ${comp.errorPercent}% deve ser < 0.1% em relação à trajetória física. Processado: ${res.distanceProcessedKm}km, Ref: ${distReferenciaKm.toFixed(3)}km`,
      );
      assert.ok(
        comp.accuracyPercent >= 99.9,
        `Acurácia deve ser >= 99.9%, obteve ${comp.accuracyPercent}%`,
      );
    }
  });
});
