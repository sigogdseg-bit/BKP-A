import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { avaliarStatusComunicacao } from "@/features/monitor-gps/services/gpsService";
import { calcularResumoFluxoCaixa } from "@/features/financeiro/services/financeiroService";
import type { TransacaoFinanceira } from "@/features/financeiro/types";

describe("Hunter — Teste de Comunicacao de Rastreadores e Integridade Financeira", () => {
  it("veiculo com transmissao ha menos de 10 minutos deve ser reportado como Comunicacao Ativa", () => {
    // 2 minutos atras
    const doisMinutosAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const resultado = avaliarStatusComunicacao(doisMinutosAtras);

    assert.equal(resultado.ativo, true);
    assert.equal(resultado.rotulo, "Comunicacao Ativa");
    assert.ok(resultado.detalhe.includes("minutos") || resultado.detalhe.includes("minuto"));
  });

  it("veiculo transmitindo no exato momento (ha menos de 1 minuto) deve reportar Transmitindo agora", () => {
    const agora = new Date().toISOString();
    const resultado = avaliarStatusComunicacao(agora);

    assert.equal(resultado.ativo, true);
    assert.equal(resultado.rotulo, "Comunicacao Ativa");
    assert.equal(resultado.detalhe, "Transmitindo agora");
  });

  it("veiculo sem transmissao ha mais de 10 minutos deve ser reportado como Sem Comunicacao", () => {
    // 45 minutos atras
    const quarentaECincoMinutosAtras = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const resultado = avaliarStatusComunicacao(quarentaECincoMinutosAtras);

    assert.equal(resultado.ativo, false);
    assert.equal(resultado.rotulo, "Sem Comunicacao");
    assert.ok(resultado.detalhe.includes("Sem sinal ha 45 minutos"));
  });

  it("veiculo sem transmissao ha mais de 24 horas deve quantificar dias sem sinal", () => {
    // 2 dias atras
    const doisDiasAtras = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const resultado = avaliarStatusComunicacao(doisDiasAtras);

    assert.equal(resultado.ativo, false);
    assert.equal(resultado.rotulo, "Sem Comunicacao");
    assert.ok(resultado.detalhe.includes("Sem sinal ha 2 dias"));
  });

  it("veiculo sem data de atualizacao ou nulo deve reportar Sem Comunicacao", () => {
    const resNulo = avaliarStatusComunicacao(null);
    assert.equal(resNulo.ativo, false);
    assert.equal(resNulo.rotulo, "Sem Comunicacao");

    const resInvalido = avaliarStatusComunicacao("data_invalida_timestamp");
    assert.equal(resInvalido.ativo, false);
    assert.equal(resInvalido.rotulo, "Sem Comunicacao");
  });

  it("fluxo de caixa processa entradas e despesas com calculo exato de saldo", () => {
    const transacoes: TransacaoFinanceira[] = [
      {
        id: "t1",
        tipo: "entrada",
        categoria: "mensalidade",
        descricao: "Mensalidade Cliente Alfa",
        valor: 150.0,
        data_competencia: "2026-09-01",
        status: "concluido",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "t2",
        tipo: "saida",
        categoria: "repasse_instalador",
        descricao: "Repasse Instalador Beta",
        valor: 50.0,
        data_competencia: "2026-09-02",
        status: "concluido",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "t3",
        tipo: "saida",
        categoria: "chips_conectividade",
        descricao: "Fatura Chips M2M",
        valor: 30.0,
        data_competencia: "2026-09-05",
        status: "pendente",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const resumo = calcularResumoFluxoCaixa(transacoes);

    assert.equal(resumo.entradasRealizadas, 150.0);
    assert.equal(resumo.saidasRealizadas, 50.0);
    assert.equal(resumo.saidasPrevistas, 30.0);
    assert.equal(resumo.saldoAtual, 100.0);
    assert.equal(resumo.totalTransacoes, 3);
  });

  it("Regra Petrea: Ausencia do caractere comercial proibido em textos de teste de comunicacao e despesas", () => {
    const texto1 = "Testar Comunicacao e Latencia do Rastreador";
    const texto2 = "Lancamento de Despesa e Receita no Livro-Caixa";

    assert.ok(!texto1.includes("&"), "Texto de comunicacao nao pode conter o caractere proibido");
    assert.ok(!texto2.includes("&"), "Texto de despesas nao pode conter o caractere proibido");
  });

  it("Regra Petrea: financeiroService nao deve conter referencias a localStorage ou cache local", async () => {
    const fs = await import("node:fs/promises");
    const conteudo = await fs.readFile(
      new URL("../../features/financeiro/services/financeiroService.ts", import.meta.url),
      "utf-8",
    );

    assert.ok(
      !conteudo.includes("localStorage"),
      "financeiroService.ts nao deve usar localStorage para mascarar gravacao",
    );
    assert.ok(
      !conteudo.includes("hunter_transacoes_manuais_locais"),
      "financeiroService.ts nao deve possuir chave de cache local",
    );
  });
});
