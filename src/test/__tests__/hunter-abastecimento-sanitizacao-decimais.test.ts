import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizarNumeroDecimal,
  sanitizarKmOdometro,
} from "../../features/motoristas/services/motoristasService";

describe("Hunter — Sanitização de Dados Decimais e Odômetro em Abastecimentos (DJR-NEW)", () => {
  it("deve converter corretamente números com vírgula (padrão brasileiro) para formato decimal válido", () => {
    assert.equal(sanitizarNumeroDecimal("45,50"), 45.5);
    assert.equal(sanitizarNumeroDecimal("12,345"), 12.345);
    assert.equal(sanitizarNumeroDecimal("100,0"), 100);
    assert.equal(sanitizarNumeroDecimal("0,75"), 0.75);
  });

  it("deve preservar números em formato com ponto ou número nativo", () => {
    assert.equal(sanitizarNumeroDecimal("45.50"), 45.5);
    assert.equal(sanitizarNumeroDecimal(45.5), 45.5);
    assert.equal(sanitizarNumeroDecimal(100), 100);
    assert.equal(sanitizarNumeroDecimal("100"), 100);
  });

  it("deve converter corretamente números formatados com separadores de milhar e decimal", () => {
    // Formato brasileiro: 1.234,56
    assert.equal(sanitizarNumeroDecimal("1.234,56"), 1234.56);
    // Formato internacional: 1,234.56
    assert.equal(sanitizarNumeroDecimal("1,234.56"), 1234.56);
  });

  it("deve retornar null para valores vazios, indefinidos ou inválidos evitando envio de NaN ao banco", () => {
    assert.equal(sanitizarNumeroDecimal(""), null);
    assert.equal(sanitizarNumeroDecimal(null), null);
    assert.equal(sanitizarNumeroDecimal(undefined), null);
    assert.equal(sanitizarNumeroDecimal("abc"), null);
    assert.equal(sanitizarNumeroDecimal(NaN), null);
  });

  it("deve sanitizar o odômetro arredondando e tratando notação de milhar com ponto", () => {
    // Digitação comum com ponto de milhar: 183.646
    assert.equal(sanitizarKmOdometro("183.646"), 183646);
    assert.equal(sanitizarKmOdometro("183646"), 183646);
    assert.equal(sanitizarKmOdometro(183646), 183646);
    assert.equal(sanitizarKmOdometro(183646.4), 183646);
    assert.equal(sanitizarKmOdometro(""), null);
    assert.equal(sanitizarKmOdometro(null), null);
  });

  it("deve consolidar gasolina aditivada e gasolina comum na contagem e filtro de gasolina", () => {
    const abastecimentosExemplo = [
      { id: "1", combustivel: "gasolina_aditivada", valor_total: 428.36, litros: 59.49 },
      { id: "2", combustivel: "gasolina_aditivada", valor_total: 455.0, litros: 64.0 },
      { id: "3", combustivel: "gasolina", valor_total: 400.0, litros: 54.87 },
      { id: "4", combustivel: "diesel_s10", valor_total: 300.0, litros: 50.0 },
      { id: "5", combustivel: "etanol", valor_total: 150.0, litros: 40.0 },
    ];

    const totalGasolina = abastecimentosExemplo.filter(
      (h) => h.combustivel === "gasolina" || h.combustivel === "gasolina_aditivada",
    ).length;
    const totalDiesel = abastecimentosExemplo.filter(
      (h) => h.combustivel === "diesel" || h.combustivel === "diesel_s10",
    ).length;
    const totalEtanol = abastecimentosExemplo.filter((h) => h.combustivel === "etanol").length;

    assert.equal(
      totalGasolina,
      3,
      "Gasolina aditivada deve somar com gasolina comum totalizando 3",
    );
    assert.equal(totalDiesel, 1, "Diesel S10 deve contar como 1");
    assert.equal(totalEtanol, 1, "Etanol deve contar como 1");

    // Teste de filtro
    const filtradosGasolina = abastecimentosExemplo.filter(
      (h) => h.combustivel === "gasolina" || h.combustivel === "gasolina_aditivada",
    );
    assert.equal(filtradosGasolina.length, 3);
  });
});
