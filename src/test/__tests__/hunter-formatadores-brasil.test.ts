import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  formatarDataBrasil,
  formatarHoraBrasil,
  formatarDataHoraBrasil,
  formatarMoedaBrasil,
  formatarNumeroBrasil,
  formatarKmBrasil,
} from "../../shared/lib/formatadoresBrasil";

describe("Hunter — Formatadores Canônicos do Brasil (Fuso America/Sao_Paulo e Padrão Monetário)", () => {
  test("1. Formatação de Data e Hora no fuso de São Paulo (UTC-3)", () => {
    // 2026-10-14T01:36:45Z UTC é exatamente 13/10/2026 às 22:36:45 no fuso de Brasília/São Paulo
    const isoUtc = "2026-10-14T01:36:45.000Z";

    assert.equal(formatarDataBrasil(isoUtc), "13/10/2026");
    assert.equal(formatarHoraBrasil(isoUtc, false), "22:36");
    assert.equal(formatarHoraBrasil(isoUtc, true), "22:36:45");
    assert.equal(formatarDataHoraBrasil(isoUtc, true), "13/10/2026 às 22:36:45");
    assert.equal(formatarDataHoraBrasil(isoUtc, false), "13/10/2026 às 22:36");
  });

  test("2. Formatação Monetária: R$ positivo e -R$ estrito para valores negativos", () => {
    assert.equal(formatarMoedaBrasil(1500), "R$\u00A01.500,00");
    assert.equal(formatarMoedaBrasil(1234567.89), "R$\u00A01.234.567,89");
    assert.equal(formatarMoedaBrasil(-150), "-R$\u00A0150,00");
    assert.equal(formatarMoedaBrasil(-2500.5), "-R$\u00A02.500,50");
    assert.equal(formatarMoedaBrasil(0), "R$\u00A00,00");
    assert.equal(formatarMoedaBrasil(null), "R$ 0,00");
  });

  test("3. Formatação Numérica com separador de milhar (.) e decimal (,)", () => {
    assert.equal(formatarNumeroBrasil(183270.19, 2), "183.270,19");
    assert.equal(formatarNumeroBrasil(183270.19, 1), "183.270,2");
    assert.equal(formatarNumeroBrasil(1000, 0), "1.000");
    assert.equal(formatarKmBrasil(183270.19, 1), "183.270,2 km");
    assert.equal(formatarKmBrasil(null), "0 km");
  });

  test("4. Resiliência e Null-Safety contra valores inválidos", () => {
    assert.equal(formatarDataBrasil(null), "—");
    assert.equal(formatarDataBrasil(undefined), "—");
    assert.equal(formatarDataBrasil("data_invalida"), "—");
    assert.equal(formatarHoraBrasil(null), "—");
    assert.equal(formatarDataHoraBrasil(null), "—");
  });
});
