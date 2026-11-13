import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularPrecoPorMarkup, analisarPrecoVenda } from "../../estoque/utils/calculadoraMarkup";

describe("Hunter — Mão de Obra no Kit e Precificação Especialista", () => {
  it("deve somar custo dos materiais com custo da mão de obra para compor o custo total", () => {
    const custoMateriais = 134.9;
    const custoMaoDeObra = 50.0;
    const custoTotal = custoMateriais + custoMaoDeObra;

    assert.equal(custoTotal, 184.9);

    // Markup de 50% sobre custo total
    const precoVenda = calcularPrecoPorMarkup(custoTotal, 50);
    assert.equal(precoVenda, 277.35);

    const analise = analisarPrecoVenda(custoTotal, precoVenda);
    assert.equal(analise.lucroBruto, 92.45);
    assert.equal(analise.margemBrutaPercentual, 33.33);
  });

  it("deve calcular markup de 100% (dobro) sobre materiais mais mão de obra", () => {
    const custoMateriais = 100;
    const custoMaoDeObra = 50;
    const custoTotal = custoMateriais + custoMaoDeObra;

    const precoVenda = calcularPrecoPorMarkup(custoTotal, 100);
    assert.equal(precoVenda, 300);

    const analise = analisarPrecoVenda(custoTotal, precoVenda);
    assert.equal(analise.lucroBruto, 150);
    assert.equal(analise.margemBrutaPercentual, 50);
  });
});

describe("Hunter — Protocolo Irrevogável de Bloqueio Seguro Veicular", () => {
  // Simulação dos critérios da máquina de estados do protocolo de bloqueio seguro
  function avaliarCondicaoBloqueioSeguro(params: {
    fase: "fase1_espera_parada" | "fase2_limite_10kmh" | "fase3_limite_20kmh";
    velocidadeAtual: number;
    comunicacaoAtiva: boolean;
    dadosDuvidososOuDesatualizados: boolean;
  }): { podeBloquear: boolean; motivo: string } {
    const { fase, velocidadeAtual, comunicacaoAtiva, dadosDuvidososOuDesatualizados } = params;

    // Regra Pétrea Inegociável: Em caso de dúvida ou falha de comunicação, NÃO realiza
    if (!comunicacaoAtiva || dadosDuvidososOuDesatualizados) {
      return {
        podeBloquear: false,
        motivo:
          "COMANDO DE BLOQUEIO RECUSADO POR SEGURANÇA: Ausência de comunicação ativa ou dados defasados.",
      };
    }

    if (fase === "fase1_espera_parada") {
      if (velocidadeAtual === 0) {
        return {
          podeBloquear: true,
          motivo: "Veículo parou completamente (0 km/h) e comunicação confirmada.",
        };
      }
      return {
        podeBloquear: false,
        motivo: `Aguardando parada total (Velocidade atual: ${velocidadeAtual} km/h).`,
      };
    }

    if (fase === "fase2_limite_10kmh") {
      if (velocidadeAtual < 10) {
        return {
          podeBloquear: true,
          motivo: `Veículo atingiu ${velocidadeAtual} km/h (< 10 km/h) após 20 min sem parada e comunicação confirmada.`,
        };
      }
      return {
        podeBloquear: false,
        motivo: `Aguardando velocidade < 10 km/h (Velocidade atual: ${velocidadeAtual} km/h).`,
      };
    }

    if (fase === "fase3_limite_20kmh") {
      if (velocidadeAtual < 20) {
        return {
          podeBloquear: true,
          motivo: `Veículo atingiu ${velocidadeAtual} km/h (< 20 km/h) após 30 min sem parada e comunicação confirmada.`,
        };
      }
      return {
        podeBloquear: false,
        motivo: `Aguardando velocidade < 20 km/h (Velocidade atual: ${velocidadeAtual} km/h).`,
      };
    }

    return { podeBloquear: false, motivo: "Parâmetros fora da política de segurança." };
  }

  it("Fase 1: Bloqueia imediatamente assim que o veículo parar (0 km/h) com comunicação ativa", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase1_espera_parada",
      velocidadeAtual: 0,
      comunicacaoAtiva: true,
      dadosDuvidososOuDesatualizados: false,
    });

    assert.equal(res.podeBloquear, true);
    assert.ok(res.motivo.includes("Veículo parou completamente"));
  });

  it("Fase 1: NÃO bloqueia enquanto o veículo estiver em movimento (> 0 km/h)", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase1_espera_parada",
      velocidadeAtual: 45,
      comunicacaoAtiva: true,
      dadosDuvidososOuDesatualizados: false,
    });

    assert.equal(res.podeBloquear, false);
    assert.ok(res.motivo.includes("Aguardando parada total"));
  });

  it("Regra Pétrea: Se o veículo parar mas a comunicação falhar, NÃO realiza o bloqueio", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase1_espera_parada",
      velocidadeAtual: 0,
      comunicacaoAtiva: false, // falha de teste de comunicação
      dadosDuvidososOuDesatualizados: false,
    });

    assert.equal(res.podeBloquear, false);
    assert.ok(res.motivo.includes("RECUSADO POR SEGURANÇA"));
  });

  it("Regra Pétrea: Em caso de dúvida ou dados defasados de telemetria, NÃO realiza o bloqueio", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase1_espera_parada",
      velocidadeAtual: 0,
      comunicacaoAtiva: true,
      dadosDuvidososOuDesatualizados: true, // pacote antigo ou duvidoso
    });

    assert.equal(res.podeBloquear, false);
    assert.ok(res.motivo.includes("RECUSADO POR SEGURANÇA"));
  });

  it("Fase 2 (após 20 min sem parada): Bloqueia assim que atingir < 10 km/h com comunicação confirmada", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase2_limite_10kmh",
      velocidadeAtual: 7,
      comunicacaoAtiva: true,
      dadosDuvidososOuDesatualizados: false,
    });

    assert.equal(res.podeBloquear, true);
    assert.ok(res.motivo.includes("< 10 km/h"));
  });

  it("Fase 2: Não bloqueia se estiver em velocidade >= 10 km/h", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase2_limite_10kmh",
      velocidadeAtual: 15,
      comunicacaoAtiva: true,
      dadosDuvidososOuDesatualizados: false,
    });

    assert.equal(res.podeBloquear, false);
    assert.ok(res.motivo.includes("Aguardando velocidade < 10 km/h"));
  });

  it("Fase 3 (após 10 min adicionais): Bloqueia assim que atingir < 20 km/h com comunicação confirmada", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase3_limite_20kmh",
      velocidadeAtual: 18,
      comunicacaoAtiva: true,
      dadosDuvidososOuDesatualizados: false,
    });

    assert.equal(res.podeBloquear, true);
    assert.ok(res.motivo.includes("< 20 km/h"));
  });

  it("Fase 3: Se houver dúvida na velocidade ou perda de sinal, aborta e não bloqueia", () => {
    const res = avaliarCondicaoBloqueioSeguro({
      fase: "fase3_limite_20kmh",
      velocidadeAtual: 15,
      comunicacaoAtiva: false,
      dadosDuvidososOuDesatualizados: true,
    });

    assert.equal(res.podeBloquear, false);
    assert.ok(res.motivo.includes("RECUSADO POR SEGURANÇA"));
  });
});
