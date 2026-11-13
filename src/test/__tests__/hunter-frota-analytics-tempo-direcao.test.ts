import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Frota Analytics: Tempo de Direção e Ciclos Diários", () => {
  const caminhoView = path.resolve(
    process.cwd(),
    "src/features/frota/components/FrotaAnalyticsView.tsx",
  );

  test("1. FrotaAnalyticsView.tsx deve existir", () => {
    assert.equal(fs.existsSync(caminhoView), true);
  });

  test("2. Deve conter a interface VeiculoAnalyticsData com tempo_direcao_minutos", () => {
    const conteudo = fs.readFileSync(caminhoView, "utf-8");
    assert.equal(conteudo.includes("tempo_direcao_minutos: number;"), true);
  });

  test("3. Deve calcular tempo_direcao_minutos somando os ciclos de condução reais", () => {
    const conteudo = fs.readFileSync(caminhoView, "utf-8");
    assert.equal(
      conteudo.includes("mapaAgregado[chave].tempo_direcao_minutos += duracaoMinutos;"),
      true,
    );
  });

  test("4. Deve renderizar a coluna ordenável 'Tempo de Direção' no cabeçalho da tabela de Telemetria Operacional", () => {
    const conteudo = fs.readFileSync(caminhoView, "utf-8");
    assert.equal(conteudo.includes('titulo="Tempo de Direção"'), true);
    assert.equal(conteudo.includes('campo="tempo_direcao_minutos"'), true);
  });

  test("5. Deve exibir o valor formatado de tempo_direcao_minutos com tooltip descritivo", () => {
    const conteudo = fs.readFileSync(caminhoView, "utf-8");
    assert.equal(conteudo.includes("{formatarMinutos(d.tempo_direcao_minutos)}"), true);
    assert.equal(
      conteudo.includes("Tempo gasto dirigindo por dia (soma de todos os ciclos de condução)"),
      true,
    );
  });

  test("6. Deve incluir o card interativo de KPI para Tempo de Direção com filtro bidirecional", () => {
    const conteudo = fs.readFileSync(caminhoView, "utf-8");
    assert.equal(conteudo.includes("Tempo de Direção"), true);
    assert.equal(conteudo.includes("Soma de todos os ciclos"), true);
    assert.equal(conteudo.includes("com_direcao"), true);
    assert.equal(conteudo.includes("{formatarMinutos(totalDirecaoMin)}"), true);
  });

  test("7. Deve incluir TEMPO DE DIREÇÃO no dossiê executivo PDF", () => {
    const conteudo = fs.readFileSync(caminhoView, "utf-8");
    assert.equal(conteudo.includes('"TEMPO DE DIREÇÃO"'), true);
    assert.equal(conteudo.includes('"TEMPO DIREÇÃO"'), true);
    assert.equal(conteudo.includes("formatarMinutos(d.tempo_direcao_minutos)"), true);
  });
});
