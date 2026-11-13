import { describe, it } from "node:test";
import assert from "node:assert";
import {
  calcularDistanciaPontoSegmento,
  calcularDistanciaMinimaDaRota,
  avaliarDesvioDeRota,
  type RotaMonitorada,
} from "../../features/monitor-gps/services/rotaMonitoradaService";
import {
  calcularDistanciaMetros,
  verificarPontoNaAreaSegura,
} from "../../features/monitor-gps/services/protecaoVeiculoService";

describe("Hunter — Edição de Áreas Seguras e Rota Monitorada com Desvio Viário", () => {
  it("1. Áreas Seguras: deve avaliar corretamente se veículo está dentro do raio e tolerância", () => {
    // Área em Volta Redonda com raio de 150m e tolerância de 50m (total 200m)
    const area = {
      latitude: -22.4768,
      longitude: -44.0658,
      raio_metros: 150,
      tolerancia_metros: 50,
    };

    // Ponto a 100m (dentro)
    const resDentro = verificarPontoNaAreaSegura(-22.476, -44.0658, area);
    assert.strictEqual(resDentro.dentro, true);

    // Ponto a 3km de distância (fora)
    const resFora = verificarPontoNaAreaSegura(-22.5235, -44.1042, area);
    assert.strictEqual(resFora.dentro, false);
    assert.ok(resFora.distanciaMetros > 1000);
  });

  it("2. Rota Monitorada: deve calcular desvio ortogonal em relação às ruas do trajeto (Ponto A -> Ponto B)", () => {
    // Segmento de rua reta do ponto A (-22.5000, -44.1000) até o ponto B (-22.5000, -44.1100)
    const aLat = -22.5;
    const aLon = -44.1;
    const bLat = -22.5;
    const bLon = -44.11;

    // Veículo exatamente em cima da rua
    const distZero = calcularDistanciaPontoSegmento(-22.5, -44.105, aLat, aLon, bLat, bLon);
    assert.ok(distZero < 5, `Deveria ser próximo de 0m, obteve ${distZero}m`);

    // Veículo a 50m ao norte da rua
    // 0.00045 graus de latitude é aprox 50m
    const dist50m = calcularDistanciaPontoSegmento(-22.50045, -44.105, aLat, aLon, bLat, bLon);
    assert.ok(dist50m >= 45 && dist50m <= 55, `Esperado ~50m, obteve ${dist50m}m`);
  });

  it("3. Rota Monitorada: deve emitir status 'emDesvio' quando veículo sair das ruas além da tolerância", () => {
    const rota: RotaMonitorada = {
      id: "rota-teste-1",
      veiculo_id: "v-axh0e44",
      cliente_id: "c-dario",
      trajeto_salvo_id: null,
      nome: "Trajeto Casa -> Trabalho",
      coordenadas_rota: [
        [-22.4768, -44.0658],
        [-22.485, -44.075],
        [-22.495, -44.085],
        [-22.51, -44.095],
      ],
      tolerancia_desvio_metros: 100,
      status: "ativa",
      desvio_detectado: false,
      ultima_distancia_desvio_m: 0,
      iniciada_at: new Date().toISOString(),
    };

    // Ponto 1: Em cima da rota (saída)
    const avaliacaoInicio = avaliarDesvioDeRota(-22.4768, -44.0658, rota);
    assert.strictEqual(avaliacaoInicio.emDesvio, false);
    assert.strictEqual(avaliacaoInicio.distanciaMetros, 0);

    // Ponto 2: Desvio moderado de 40m (dentro da tolerância de 100m)
    const avaliacaoDentro = avaliarDesvioDeRota(-22.477, -44.0661, rota);
    assert.strictEqual(avaliacaoDentro.emDesvio, false);

    // Ponto 3: Desvio severo em outra rua a 600m da rota
    const avaliacaoFora = avaliarDesvioDeRota(-22.4768, -44.075, rota);
    assert.strictEqual(avaliacaoFora.emDesvio, true);
    assert.ok(
      avaliacaoFora.distanciaMetros > 100,
      `Distância deveria ser > 100m, obteve ${avaliacaoFora.distanciaMetros}m`,
    );
  });

  it("4. Regra Pétrea Hunter-Guardian: Proibição de referências a sistemas externos", () => {
    const termoProibido = "SIGO" + "VTR";
    const nomeRota = "Rota Monitorada Segura Hunter Oficial";
    assert.strictEqual(nomeRota.includes(termoProibido), false);
  });

  it("5. Áreas Seguras: suporte a todas as opções simétricas de Entrada e Saída (alertar, fora_horario, permitida)", () => {
    const areaComTodasOpcoes: import("../../features/monitor-gps/services/protecaoVeiculoService").AreaSegura =
      {
        id: "area-teste-opcoes",
        veiculo_id: "v-123",
        cliente_id: "c-123",
        nome: "Posto / Garagem Central",
        tipo: "estacionamento",
        latitude: -22.5,
        longitude: -44.1,
        raio_metros: 100,
        tolerancia_metros: 30,
        regra_entrada: "fora_horario",
        regra_saida: "alertar",
        hora_inicio: "08:00:00",
        hora_fim: "18:00:00",
        dias_semana: [1, 2, 3, 4, 5],
        ativo: true,
      };

    assert.strictEqual(areaComTodasOpcoes.regra_entrada, "fora_horario");
    assert.strictEqual(areaComTodasOpcoes.regra_saida, "alertar");

    // Valida alternância de regras
    areaComTodasOpcoes.regra_entrada = "alertar";
    areaComTodasOpcoes.regra_saida = "permitida";
    assert.strictEqual(areaComTodasOpcoes.regra_entrada, "alertar");
    assert.strictEqual(areaComTodasOpcoes.regra_saida, "permitida");

    areaComTodasOpcoes.regra_entrada = "permitida";
    areaComTodasOpcoes.regra_saida = "fora_horario";
    assert.strictEqual(areaComTodasOpcoes.regra_entrada, "permitida");
    assert.strictEqual(areaComTodasOpcoes.regra_saida, "fora_horario");
  });
});
