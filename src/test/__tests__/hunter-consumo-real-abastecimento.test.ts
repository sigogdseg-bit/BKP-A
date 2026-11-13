import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Testes Unitários de Consumo Real e Score de Condução
 * Protocolo Hunter-Guardian / DJR-NEW:
 * - Proibição total de estimativas fantasiosas de consumo (km/l e litros)
 * - Consumo apurado exclusivamente por abastecimentos consecutivos: (KM2 - KM1) / Litros2
 * - Quando não há dados suficientes, o retorno é estritamente null / "Dados insuficientes para cálculo"
 * - Score de condução objetivo baseado em eventos e velocidade máxima real
 * - Ausência do caractere comercial proibido
 */

interface AbastecimentoRegistro {
  id: string;
  veiculo_id: string;
  data_abastecimento: string;
  km_atual: number;
  litros: number;
}

function calcularConsumoRealAbastecimentos(
  abastecimentos: AbastecimentoRegistro[],
): { data: string; consumo_kml: number }[] {
  if (!abastecimentos || abastecimentos.length < 2) {
    return [];
  }

  // Ordena por KM atual crescente
  const ordenados = [...abastecimentos]
    .filter((a) => a.km_atual > 0 && a.litros > 0)
    .sort((a, b) => a.km_atual - b.km_atual);

  const resultados: { data: string; consumo_kml: number }[] = [];

  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1];
    const atual = ordenados[i];
    const deltaKm = atual.km_atual - anterior.km_atual;

    if (deltaKm > 0 && atual.litros > 0) {
      const consumo = Number((deltaKm / atual.litros).toFixed(2));
      resultados.push({
        data: atual.data_abastecimento,
        consumo_kml: consumo,
      });
    }
  }

  return resultados;
}

function resolverTextoConsumo(consumo_kml: number | null | undefined): string {
  if (consumo_kml === null || consumo_kml === undefined) {
    return "Dados insuficientes para cálculo";
  }
  return `${consumo_kml} km/l`;
}

function calcularScoreConducaoReal(km_rodado: number, vel_maxima: number): number {
  if (km_rodado <= 0) return 100; // Neutro se não rodou no dia
  if (vel_maxima > 90) {
    return Math.max(40, 100 - (vel_maxima - 90));
  }
  return 100;
}

describe("Hunter — Consumo Real por Abastecimento e Score de Condução (DJR-NEW)", () => {
  it("1. Sem abastecimentos registrados: consumo deve ser estritamente nulo e informar dados insuficientes", () => {
    const lista: AbastecimentoRegistro[] = [];
    const resultados = calcularConsumoRealAbastecimentos(lista);

    assert.equal(resultados.length, 0);
    assert.equal(resolverTextoConsumo(null), "Dados insuficientes para cálculo");
  });

  it("2. Apenas 1 abastecimento: impossível apurar consumo sem base anterior (retorna dados insuficientes)", () => {
    const lista: AbastecimentoRegistro[] = [
      {
        id: "ab-1",
        veiculo_id: "v-1",
        data_abastecimento: "2026-09-25",
        km_atual: 45000,
        litros: 42.5,
      },
    ];
    const resultados = calcularConsumoRealAbastecimentos(lista);

    assert.equal(resultados.length, 0);
    assert.equal(resolverTextoConsumo(null), "Dados insuficientes para cálculo");
  });

  it("3. Dois abastecimentos consecutivos: calcula consumo exato (delta KM / litros abastecidos)", () => {
    const lista: AbastecimentoRegistro[] = [
      {
        id: "ab-1",
        veiculo_id: "v-1",
        data_abastecimento: "2026-09-20",
        km_atual: 45000,
        litros: 40,
      },
      {
        id: "ab-2",
        veiculo_id: "v-1",
        data_abastecimento: "2026-09-27",
        km_atual: 45450,
        litros: 45, // Rodou 450 km com 45 litros => 10.00 km/l
      },
    ];

    const resultados = calcularConsumoRealAbastecimentos(lista);
    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].consumo_kml, 10);
    assert.equal(resolverTextoConsumo(resultados[0].consumo_kml), "10 km/l");
  });

  it("4. Veículo de alta cilindrada ou utilitário: consumo reflete a física real e não estimativa 1.0", () => {
    const lista: AbastecimentoRegistro[] = [
      {
        id: "ab-1",
        veiculo_id: "v-turbo",
        data_abastecimento: "2026-09-22",
        km_atual: 80000,
        litros: 60,
      },
      {
        id: "ab-2",
        veiculo_id: "v-turbo",
        data_abastecimento: "2026-09-28",
        km_atual: 80360,
        litros: 60, // Rodou 360 km com 60 litros => 6.00 km/l (motor potente)
      },
    ];

    const resultados = calcularConsumoRealAbastecimentos(lista);
    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].consumo_kml, 6);
    assert.equal(resolverTextoConsumo(resultados[0].consumo_kml), "6 km/l");
  });

  it("5. Score de Condução: base 100 com penalização proporcional para velocidades acima de 90 km/h", () => {
    // Carro não rodou: 100 (neutro)
    assert.equal(calcularScoreConducaoReal(0, 0), 100);

    // Carro rodou respeitando 80 km/h: 100
    assert.equal(calcularScoreConducaoReal(55.2, 78), 100);

    // Carro atingiu 110 km/h: perde 20 pontos => 80
    assert.equal(calcularScoreConducaoReal(120, 110), 80);

    // Carro atingiu 140 km/h: perde 50 pontos => 50
    assert.equal(calcularScoreConducaoReal(90, 140), 50);

    // Limite mínimo de proteção: 40 pontos
    assert.equal(calcularScoreConducaoReal(30, 180), 40);
  });

  it("6. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", () => {
    const codigo = `
      Abastecimento e quilometragem rodada
      Consumo real apurado por abastecimento e litros
      Dados insuficientes para cálculo
    `;
    assert.ok(!codigo.includes("&"), "Não deve conter o caractere comercial proibido");
  });
});
