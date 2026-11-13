import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularEncargosAtraso,
  type ResultadoEncargos,
} from "../../features/mensalidades/utils/encargosLegais";
import {
  obterTaxaInstalacaoPadrao,
  definirTaxaInstalacaoPadrao,
} from "../../features/clientes/services/taxaInstalacaoService";

test("Hunter — Cálculo de Encargos Legais e Juros de Mora Diários", async (t) => {
  await t.test("Sem atraso (vencimento no dia ou futuro): sem multa e sem juros", () => {
    const hoje = new Date();
    const dataVenc = hoje.toISOString().split("T")[0];
    const enc = calcularEncargosAtraso(100.0, dataVenc, hoje);

    assert.equal(enc.estaEmAtraso, false);
    assert.equal(enc.diasAtraso, 0);
    assert.equal(enc.valorMulta, 0);
    assert.equal(enc.valorJuros, 0);
    assert.equal(enc.totalEncargos, 0);
    assert.equal(enc.valorTotalAtualizado, 100.0);
  });

  await t.test("Cliente Cortesia (valor zero): não incide multa nem juros mesmo com atraso", () => {
    const dataCalculo = new Date(2026, 8, 20); // 20/09/2026
    const dataVenc = "2026-08-10"; // 41 dias de atraso
    const enc = calcularEncargosAtraso(0, dataVenc, dataCalculo);

    assert.equal(enc.estaEmAtraso, false);
    assert.equal(enc.diasAtraso, 0);
    assert.equal(enc.valorTotalAtualizado, 0);
  });

  await t.test("Atraso de 30 dias com prestação de R$ 100,00: Multa 2% + Juros 1% a.m.", () => {
    const dataCalculo = new Date(2026, 8, 30); // 30/09/2026
    const dataVenc = "2026-08-31"; // 30 dias de atraso
    const enc = calcularEncargosAtraso(100.0, dataVenc, dataCalculo);

    assert.equal(enc.estaEmAtraso, true);
    assert.equal(enc.diasAtraso, 30);
    // Multa de 2%: 2,00
    assert.equal(enc.valorMulta, 2.0);
    // Juros de 1% em 30 dias pro rata die: 1,00
    assert.equal(enc.valorJuros, 1.0);
    assert.equal(enc.totalEncargos, 3.0);
    assert.equal(enc.valorTotalAtualizado, 103.0);
  });

  await t.test(
    "Atraso de 15 dias com prestação de R$ 350,00: Multa 2% + Juros proporcionais diários",
    () => {
      const dataCalculo = new Date(2026, 8, 25);
      const dataVenc = "2026-09-10"; // 15 dias de atraso
      const enc = calcularEncargosAtraso(350.0, dataVenc, dataCalculo);

      assert.equal(enc.estaEmAtraso, true);
      assert.equal(enc.diasAtraso, 15);
      // Multa 2% de 350,00 = 7,00
      assert.equal(enc.valorMulta, 7.0);
      // Juros: 350 * (1% / 30) * 15 = 1,75
      assert.equal(enc.valorJuros, 1.75);
      assert.equal(enc.totalEncargos, 8.75);
      assert.equal(enc.valorTotalAtualizado, 358.75);
    },
  );
});

test("Hunter — Gestão Canônica da Taxa de Instalação e Ativação", async (t) => {
  await t.test("Taxa de instalação padrão inicia em R$ 350,00", () => {
    const padrao = obterTaxaInstalacaoPadrao();
    assert.equal(padrao, 350.0);
  });

  await t.test("Atualização do valor padrão reflete nas chamadas subsequentes", () => {
    definirTaxaInstalacaoPadrao(380.0);
    assert.equal(obterTaxaInstalacaoPadrao(), 380.0);

    // Restaura o padrão oficial
    definirTaxaInstalacaoPadrao(350.0);
    assert.equal(obterTaxaInstalacaoPadrao(), 350.0);
  });

  await t.test(
    "Regra Pétrea: Ausência do caractere comercial proibido nas mensagens e contratos",
    () => {
      const clausula =
        "A taxa de ativação e instalação será quitada no ato da contratação pelo Contratante.";
      assert.ok(!clausula.includes("&"), "Proibido caractere &");
    },
  );
});
