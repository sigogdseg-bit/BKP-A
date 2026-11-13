import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcularAzimuteGraus,
  normalizarGraus,
  obterRumoVeiculo,
  definirRumoVeiculoEstacionado,
  girarVeiculoEstacionado,
} from "../../features/monitor-gps/services/orientacaoRuaService.ts";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Hunter — Orientação de Veículo Estacionado e Alinhamento com a Via", () => {
  test("Cálculo canônico de azimute geodésico (Norte, Leste, Sul e Oeste)", () => {
    // Vetor apontando para o Norte
    const norte = calcularAzimuteGraus(-22.4769, -44.0658, -22.4759, -44.0658);
    assert.equal(norte, 0);

    // Vetor apontando para o Leste
    const leste = calcularAzimuteGraus(-22.4769, -44.0658, -22.4769, -44.0648);
    assert.equal(leste, 90);

    // Vetor apontando para o Sul
    const sul = calcularAzimuteGraus(-22.4759, -44.0658, -22.4769, -44.0658);
    assert.equal(sul, 180);

    // Vetor apontando para o Oeste
    const oeste = calcularAzimuteGraus(-22.4769, -44.0648, -22.4769, -44.0658);
    assert.equal(oeste, 270);
  });

  test("Normalização estrita de graus entre 0 e 360", () => {
    assert.equal(normalizarGraus(0), 0);
    assert.equal(normalizarGraus(360), 0);
    assert.equal(normalizarGraus(450), 90);
    assert.equal(normalizarGraus(-90), 270);
    assert.equal(normalizarGraus(-45), 315);
  });

  test("Veículo em rota com rumo válido atualiza o rumo e memoriza para parada", () => {
    const veiculoEmRota: VeiculoGps = {
      id: "v-teste-01",
      cliente_id: "c-01",
      placa: "AXH0E44",
      marca_modelo: "Volvo XC 60 T6",
      latitude: -22.4769,
      longitude: -44.0658,
      velocidade: 45,
      ignicao: true,
      bloqueado: false,
      odometro: 12500,
      ultima_atualizacao: new Date().toISOString(),
      status_operacional: "em_rota",
      rumo: 62,
    };

    const rumo = obterRumoVeiculo(veiculoEmRota);
    assert.equal(rumo, 62);

    // Quando o veículo passa a ficar estacionado e o GPS reporta rumo 0 ou nulo
    const veiculoEstacionou: VeiculoGps = {
      ...veiculoEmRota,
      velocidade: 0,
      ignicao: false,
      status_operacional: "estacionado",
      rumo: 0,
    };

    const rumoPreservado = obterRumoVeiculo(veiculoEstacionou);
    assert.equal(
      rumoPreservado,
      62,
      "Deve preservar o último rumo em trânsito para não ficar atravessado na rua",
    );
  });

  test("Giro tático de 90 graus para vagas transversais ou inversão de sentido", () => {
    const veiculoVaga: VeiculoGps = {
      id: "v-teste-02",
      cliente_id: "c-01",
      placa: "TST9999",
      marca_modelo: "Toyota Corolla",
      latitude: -22.5,
      longitude: -44.1,
      velocidade: 0,
      ignicao: false,
      bloqueado: false,
      odometro: 8400,
      ultima_atualizacao: new Date().toISOString(),
      status_operacional: "estacionado",
      rumo: 60,
    };

    definirRumoVeiculoEstacionado(veiculoVaga, 60);
    assert.equal(obterRumoVeiculo(veiculoVaga), 60);

    const novoRumo = girarVeiculoEstacionado(veiculoVaga, 90);
    assert.equal(novoRumo, 150);
    assert.equal(obterRumoVeiculo(veiculoVaga), 150);
  });

  test("Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const caminhoServico = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/services/orientacaoRuaService.ts",
    );
    const conteudo = await fs.readFile(caminhoServico, "utf-8");

    const caractereProibido = String.fromCharCode(38);
    assert.equal(
      conteudo.includes(caractereProibido),
      false,
      "orientacaoRuaService não deve conter o caractere comercial proibido",
    );
  });
});
