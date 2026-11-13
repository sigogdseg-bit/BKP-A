import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDistanciaMetrosGps,
  formatarMinutosJornada,
  extrairParadasJornada,
  consolidarJornadaMultiCiclos,
} from "../../features/monitor-gps/services/gpsService";
import type { TrajetoViagem, PosicaoHistorico } from "../../features/monitor-gps/types";

describe("Hunter — Jornada Completa da Saída ao Retorno e Balões de Paradas", () => {
  it("deve calcular a distância em metros com precisão para verificação de retorno à origem", () => {
    // Coordenadas idênticas: 0 metros
    const dZero = calcularDistanciaMetrosGps(-22.5235, -44.1035, -22.5235, -44.1035);
    assert.strictEqual(dZero, 0);

    // Coordenadas a ~111 metros (0.001 grau de latitude)
    const dPerto = calcularDistanciaMetrosGps(-22.5235, -44.1035, -22.5245, -44.1035);
    assert.ok(dPerto > 100 && dPerto < 120, `Esperado ~111m, obtido: ${dPerto}`);

    // Coordenadas distantes (outro bairro/cidade)
    const dLonge = calcularDistanciaMetrosGps(-22.5235, -44.1035, -22.58, -44.2);
    assert.ok(dLonge > 5000, `Esperado > 5km, obtido: ${dLonge}`);
  });

  it("deve formatar durações em minutos de forma canônica e legível", () => {
    assert.strictEqual(formatarMinutosJornada(0), "Menos de 1 min");
    assert.strictEqual(formatarMinutosJornada(15), "15 min");
    assert.strictEqual(formatarMinutosJornada(59), "59 min");
    assert.strictEqual(formatarMinutosJornada(60), "1h");
    assert.strictEqual(formatarMinutosJornada(75), "1h 15min");
    assert.strictEqual(formatarMinutosJornada(132), "2h 12min");
  });

  it("deve extrair paradas intermediárias entre ciclos consecutivos de ignição", () => {
    const ciclo1: TrajetoViagem = {
      id: "c1",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T08:00:00Z",
      fim_at: "2026-09-23T08:30:00Z",
      km_percorrido: 12.5,
      velocidade_media: 25,
      velocidade_maxima: 60,
      status: "concluido",
    };

    const ciclo2: TrajetoViagem = {
      id: "c2",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T09:15:00Z", // Parada de 45 min entre c1 (08:30) e c2 (09:15)
      fim_at: "2026-09-23T09:45:00Z",
      km_percorrido: 8.0,
      velocidade_media: 30,
      velocidade_maxima: 65,
      status: "concluido",
    };

    const ciclo3: TrajetoViagem = {
      id: "c3",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T10:00:00Z", // Parada de 15 min entre c2 (09:45) e c3 (10:00)
      fim_at: "2026-09-23T10:30:00Z",
      km_percorrido: 10.0,
      velocidade_media: 28,
      velocidade_maxima: 58,
      status: "concluido",
    };

    const pontosMock: PosicaoHistorico[] = [
      {
        id: 1,
        latitude: -22.5235,
        longitude: -44.1035,
        velocidade: 30,
        ignicao: true,
        data_hora_gps: "2026-09-23T08:15:00Z",
      },
      {
        id: 2,
        latitude: -22.531,
        longitude: -44.112,
        velocidade: 0,
        ignicao: false,
        data_hora_gps: "2026-09-23T08:45:00Z", // Durante parada 1
      },
      {
        id: 3,
        latitude: -22.545,
        longitude: -44.12,
        velocidade: 0,
        ignicao: false,
        data_hora_gps: "2026-09-23T09:50:00Z", // Durante parada 2
      },
      {
        id: 4,
        latitude: -22.5234,
        longitude: -44.1034,
        velocidade: 20,
        ignicao: true,
        data_hora_gps: "2026-09-23T10:20:00Z",
      },
    ];

    const paradas = extrairParadasJornada([ciclo1, ciclo2, ciclo3], pontosMock);

    assert.strictEqual(paradas.length, 2, "Devem ser detectadas exatamente 2 paradas");
    assert.strictEqual(paradas[0].ordem, 1);
    assert.strictEqual(paradas[0].duracaoMinutos, 45);
    assert.strictEqual(paradas[0].duracaoFormatada, "45 min");

    assert.strictEqual(paradas[1].ordem, 2);
    assert.strictEqual(paradas[1].duracaoMinutos, 15);
    assert.strictEqual(paradas[1].duracaoFormatada, "15 min");
  });

  it("deve consolidar jornada multi-ciclos detectando retorno ao ponto de partida inicial", () => {
    // Viagem de saída de casa até o trabalho
    const vSaida: TrajetoViagem = {
      id: "v-saida",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T07:00:00Z",
      fim_at: "2026-09-23T07:30:00Z",
      km_percorrido: 15.2,
      velocidade_media: 32,
      velocidade_maxima: 70,
      status: "concluido",
    };

    // Viagem do trabalho ao restaurante
    const vAlmoco: TrajetoViagem = {
      id: "v-almoco",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T12:00:00Z",
      fim_at: "2026-09-23T12:15:00Z",
      km_percorrido: 3.5,
      velocidade_media: 20,
      velocidade_maxima: 50,
      status: "concluido",
    };

    // Viagem de retorno para casa (mesmo ponto de partida da manhã)
    const vRetorno: TrajetoViagem = {
      id: "v-retorno",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T18:00:00Z",
      fim_at: "2026-09-23T18:40:00Z",
      km_percorrido: 16.0,
      velocidade_media: 30,
      velocidade_maxima: 68,
      status: "concluido",
    };

    const todasViagens = [vSaida, vAlmoco, vRetorno];

    // Pontos onde o primeiro e o último estão a ~10 metros um do outro (em casa)
    const pontosJornada: PosicaoHistorico[] = [
      {
        id: 101,
        latitude: -22.5235,
        longitude: -44.1035,
        velocidade: 0,
        ignicao: true,
        data_hora_gps: "2026-09-23T07:00:00Z",
      },
      {
        id: 102,
        latitude: -22.56,
        longitude: -44.15,
        velocidade: 45,
        ignicao: true,
        data_hora_gps: "2026-09-23T07:20:00Z",
      },
      {
        id: 103,
        latitude: -22.52352, // Apenas ~2 metros de diferença
        longitude: -44.10351,
        velocidade: 0,
        ignicao: false,
        data_hora_gps: "2026-09-23T18:40:00Z",
      },
    ];

    const jornada = consolidarJornadaMultiCiclos(
      "v-saida",
      "v-retorno",
      todasViagens,
      pontosJornada,
    );

    assert.ok(jornada !== null, "Jornada deve ser consolidada com sucesso");
    assert.strictEqual(jornada.ciclos.length, 3);
    assert.strictEqual(jornada.kmTotal, 35); // 15.2 + 3.5 + 16.0 = 34.7 -> arredondado para inteiro 35
    assert.strictEqual(jornada.velocidadeMaxima, 70);
    assert.strictEqual(
      jornada.retornouAoInicio,
      true,
      "Deve detectar retorno ao ponto inicial de casa",
    );
    assert.ok(jornada.distanciaRetornoMetros <= 50, "Distância de retorno deve ser desprezível");
    assert.strictEqual(jornada.paradas.length, 2, "Devem existir 2 paradas intermediárias");
  });

  it("deve consolidar jornada multi-ciclos que NÃO retorna ao ponto inicial", () => {
    const v1: TrajetoViagem = {
      id: "v-cidade-a",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T06:00:00Z",
      fim_at: "2026-09-23T08:00:00Z",
      km_percorrido: 100.0,
      velocidade_media: 60,
      velocidade_maxima: 90,
      status: "concluido",
    };

    const v2: TrajetoViagem = {
      id: "v-cidade-b",
      veiculo_id: "v1",
      inicio_at: "2026-09-23T09:00:00Z",
      fim_at: "2026-09-23T11:00:00Z",
      km_percorrido: 120.0,
      velocidade_media: 70,
      velocidade_maxima: 95,
      status: "concluido",
    };

    const pontosOrigemDestinoDistintos: PosicaoHistorico[] = [
      {
        id: 201,
        latitude: -22.5235,
        longitude: -44.1035,
        velocidade: 0,
        ignicao: true,
        data_hora_gps: "2026-09-23T06:00:00Z",
      },
      {
        id: 202,
        latitude: -23.5505, // São Paulo
        longitude: -46.6333,
        velocidade: 0,
        ignicao: false,
        data_hora_gps: "2026-09-23T11:00:00Z",
      },
    ];

    const jornada = consolidarJornadaMultiCiclos(
      "v-cidade-a",
      "v-cidade-b",
      [v1, v2],
      pontosOrigemDestinoDistintos,
    );

    assert.ok(jornada !== null);
    assert.strictEqual(jornada.retornouAoInicio, false, "Não deve marcar retorno ao início");
    assert.ok(jornada.distanciaRetornoMetros > 10000, "Distância deve ser quilométrica");
    assert.strictEqual(jornada.kmTotal, 220.0);
    assert.strictEqual(jornada.paradas.length, 1);
    assert.strictEqual(jornada.paradas[0].duracaoMinutos, 60);
  });
});
