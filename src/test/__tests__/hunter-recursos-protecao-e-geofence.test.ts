import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDistanciaMetros,
  verificarPontoNaAreaSegura,
  verificarHorarioPermitido,
  type AreaSegura,
  type HorarioUtilizacao,
} from "../../features/monitor-gps/services/protecaoVeiculoService";
import {
  calcularDistanciaPontoSegmento,
  calcularDistanciaMinimaDaRota,
  avaliarDesvioDeRota,
  normalizarParCoordenadas,
  normalizarListaCoordenadas,
  type RotaMonitorada,
} from "../../features/monitor-gps/services/rotaMonitoradaService";
import {
  avaliarComportamentoVeiculo,
  type BaselineHistoricoVeiculo,
} from "../../features/monitor-gps/services/anomaliaService";
import { formatarMinutosParaHorasEMinutos } from "../../features/monitor-gps/services/timelineService";

describe("Hunter — Recursos de Proteção, Geofencing e Corredores de Rota", () => {
  describe("1. Geofencing e Tolerância de Cercas Vivas", () => {
    it("deve calcular a distância métrica com precisão de Haversine", () => {
      // Ponto A: Centro de Volta Redonda (-22.5235, -44.1042)
      // Ponto B: Ponto ligeiramente a leste (~111m por 0.001 grau de longitude no equador, menos na latitude -22)
      const distMetros = calcularDistanciaMetros(-22.5235, -44.1042, -22.5235, -44.1052);
      assert.ok(
        distMetros > 90 && distMetros < 115,
        `Distância esperada ~102m, obtido: ${distMetros}`,
      );
    });

    it("deve identificar veículo dentro do raio da cerca circular incluindo tolerância", () => {
      const areaCircular: AreaSegura = {
        id: "area-1",
        veiculo_id: "veic-123",
        cliente_id: null,
        nome: "Garagem Central",
        tipo: "casa",
        latitude: -22.5235,
        longitude: -44.1042,
        raio_metros: 200,
        tolerancia_metros: 30, // Raio total efetivo: 230m
        ativo: true,
        regra_entrada: "permitida",
        regra_saida: "alertar",
      };

      // Ponto a ~150m do centro (dentro do raio original de 200m)
      const res1 = verificarPontoNaAreaSegura(-22.5222, -44.1042, areaCircular);
      assert.equal(res1.dentro, true, "Ponto a 150m deve estar dentro");

      // Ponto a ~215m do centro (fora dos 200m nominais, mas dentro dos 230m com tolerância)
      const resComTolerancia = verificarPontoNaAreaSegura(-22.5216, -44.1042, areaCircular);
      assert.equal(
        resComTolerancia.dentro,
        true,
        "Ponto a 215m deve ser absorvido pela tolerância de 30m",
      );

      // Ponto a ~350m do centro (claramente fora)
      const resFora = verificarPontoNaAreaSegura(-22.52, -44.1042, areaCircular);
      assert.equal(resFora.dentro, false, "Ponto a 350m deve estar fora da cerca");
    });
  });

  describe("2. Horário de Utilização e Bloqueio de Circulação Noturna", () => {
    const regraHorario: HorarioUtilizacao = {
      id: "horario-1",
      veiculo_id: "veic-123",
      cliente_id: null,
      ativo: true,
      dias_semana: [1, 2, 3, 4, 5], // Seg a Sex
      hora_inicio: "06:00:00",
      hora_fim: "18:00:00",
      permitir_fim_de_semana: false,
    };

    it("deve permitir circulação em dia útil dentro da faixa horária comercial", () => {
      // Terça-feira (dia 2), 14:30
      const dataValida = new Date("2026-09-22T14:30:00");
      const res = verificarHorarioPermitido([regraHorario], dataValida);
      assert.equal(res.permitido, true);
    });

    it("deve negar e emitir motivo quando em dia útil mas fora do horário permitido", () => {
      // Quarta-feira (dia 3), 22:45
      const dataNoite = new Date("2026-09-23T22:45:00");
      const res = verificarHorarioPermitido([regraHorario], dataNoite);
      assert.equal(res.permitido, false);
      assert.ok(res.motivo?.includes("fora do horário"));
    });

    it("deve negar circulação no final de semana se permitir_fim_de_semana for false", () => {
      // Domingo (dia 0), 10:00 da manhã
      const dataDomingo = new Date("2026-09-27T10:00:00");
      const res = verificarHorarioPermitido([regraHorario], dataDomingo);
      assert.equal(res.permitido, false);
      assert.ok(res.motivo?.includes("fim de semana"));
    });
  });

  describe("3. Rota Monitorada e Cálculo de Corredor com Alerta de Desvio", () => {
    // Linha reta de A a B: (-22.5000, -44.1000) até (-22.5000, -44.2000)
    const polylineRota: [number, number][] = [
      [-22.5, -44.1],
      [-22.5, -44.2],
    ];

    it("deve calcular a distância ortogonal mínima de um ponto a um segmento de reta", () => {
      // Ponto exatamente sobre a reta
      const distZero = calcularDistanciaPontoSegmento(-22.5, -44.15, -22.5, -44.1, -22.5, -44.2);
      assert.ok(distZero < 1, `Distância sobre a reta deve ser ~0m, obtido: ${distZero}`);

      // Ponto deslocado em latitude (~111m)
      const distDesvio = calcularDistanciaPontoSegmento(
        -22.501,
        -44.15,
        -22.5,
        -44.1,
        -22.5,
        -44.2,
      );
      assert.ok(
        distDesvio > 90 && distDesvio < 130,
        `Distância esperada ~111m, obtido: ${distDesvio}`,
      );
    });

    it("deve identificar desvio quando o veículo extrapola a tolerância do corredor", () => {
      const rotaToleranciaEstrita: RotaMonitorada = {
        id: "rota-1",
        veiculo_id: "veic-1",
        cliente_id: null,
        trajeto_salvo_id: null,
        nome: "Rota Teste 50m",
        coordenadas_rota: polylineRota,
        tolerancia_desvio_metros: 50,
        status: "ativa",
        desvio_detectado: false,
        ultima_distancia_desvio_m: null,
        iniciada_at: new Date().toISOString(),
      };

      // Ponto a ~111m da rota com tolerância de 50m -> deve desviar
      const avaliacaoDesvio = avaliarDesvioDeRota(-22.501, -44.15, rotaToleranciaEstrita);
      assert.equal(avaliacaoDesvio.emDesvio, true);
      assert.ok(avaliacaoDesvio.distanciaMetros > 50);

      // Rota com tolerância ampla de 200m -> dentro do corredor
      const rotaToleranciaAmpla: RotaMonitorada = {
        ...rotaToleranciaEstrita,
        tolerancia_desvio_metros: 200,
      };

      const avaliacaoDentro = avaliarDesvioDeRota(-22.501, -44.15, rotaToleranciaAmpla);
      assert.equal(avaliacaoDentro.emDesvio, false);
    });

    it("deve normalizar pares de coordenadas invertidas [lon, lat] salvos em GeoJSON sem quebrar o cálculo métrico", () => {
      // Coordenadas GeoJSON [lon, lat] como [-44.10, -22.50]
      const parGeoJson: [number, number] = [-44.1, -22.5];
      const normalizadoLatLon = normalizarParCoordenadas(parGeoJson, "lat_lon");
      assert.equal(normalizadoLatLon[0], -22.5);
      assert.equal(normalizadoLatLon[1], -44.1);

      // Rota com coordenadas invertidas em GeoJSON [lon, lat]
      const rotaInvertidaGeoJson: RotaMonitorada = {
        id: "rota-geojson",
        veiculo_id: "veic-1",
        cliente_id: null,
        trajeto_salvo_id: null,
        nome: "Rota GeoJSON Invertida",
        coordenadas_rota: [
          [-44.1, -22.5],
          [-44.2, -22.5],
        ],
        tolerancia_desvio_metros: 150,
        status: "ativa",
        desvio_detectado: false,
        ultima_distancia_desvio_m: null,
        iniciada_at: new Date().toISOString(),
      };

      // Carro trafegando sobre o traçado em (-22.5005, -44.15) -> dist ~55m, dentro dos 150m
      const avaliacao = avaliarDesvioDeRota(-22.5005, -44.15, rotaInvertidaGeoJson);
      assert.equal(avaliacao.emDesvio, false);
      assert.ok(
        avaliacao.distanciaMetros < 100,
        `Distância deve ser ~55m, obtido: ${avaliacao.distanciaMetros}`,
      );
    });
  });

  describe("4. Linha do Tempo e Resumo Diário de Operação", () => {
    it("deve formatar minutos em horas e minutos de forma legível", () => {
      assert.equal(formatarMinutosParaHorasEMinutos(0), "0 min");
      assert.equal(formatarMinutosParaHorasEMinutos(45), "45 min");
      assert.equal(formatarMinutosParaHorasEMinutos(60), "1h00");
      assert.equal(formatarMinutosParaHorasEMinutos(135), "2h15");
    });
  });

  describe("5. Anomalia Comportamental e Desvio de Padrão Não Punitivo", () => {
    const baselineMock: BaselineHistoricoVeiculo = {
      totalViagensAnalisadas: 10,
      duracaoMediaMinutos: 25,
      velocidadeMediaGeral: 40,
      velocidadeMaximaTipica: 80,
      horariosMaisFrequentes: [7, 8, 12, 17, 18],
    };

    it("deve sinalizar comportamento fora do padrão para horário de madrugada não frequente", () => {
      const dataMadrugada = new Date("2026-09-22T02:30:00");
      const anomalia = avaliarComportamentoVeiculo(baselineMock, {
        inicioAt: dataMadrugada,
      });

      assert.ok(anomalia !== null, "Deve detectar anomalia de horário incomum");
      assert.equal(anomalia?.tipo, "horario_incomum");
      // Regra pétrea: Nomenclatura não-punitiva obrigatória
      assert.ok(anomalia?.titulo.includes("Comportamento fora do padrão"));
    });

    it("deve sinalizar velocidade atípica consideravelmente acima do padrão do veículo", () => {
      const dataComercial = new Date("2026-09-22T14:00:00");
      const anomalia = avaliarComportamentoVeiculo(baselineMock, {
        inicioAt: dataComercial,
        velocidadeAtual: 125, // típica: 80 + 30 = 110 threshold
      });

      assert.ok(anomalia !== null, "Deve detectar velocidade atípica");
      assert.equal(anomalia?.tipo, "velocidade_fora_padrao");
      assert.ok(anomalia?.titulo.includes("Comportamento fora do padrão"));
    });

    it("deve retornar null quando a operação estiver dentro dos padrões históricos normais", () => {
      const dataNormal = new Date("2026-09-22T08:15:00");
      const anomalia = avaliarComportamentoVeiculo(baselineMock, {
        inicioAt: dataNormal,
        duracaoMinutosAtual: 20,
        velocidadeAtual: 50,
      });

      assert.equal(anomalia, null, "Operação normal não deve gerar anomalia");
    });
  });
});
