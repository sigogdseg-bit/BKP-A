import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  converterUsdParaBrl,
  converterBrlParaUsd,
  formatarValorMoeda,
  obterCotacaoDolarHoje,
} from "@/features/financeiro/services/cambioService";
import {
  calcularResumoFluxoCaixa,
  calcularDREOperacional,
} from "@/features/financeiro/services/financeiroService";
import type { TransacaoFinanceira } from "@/features/financeiro/types";

describe("Hunter — Módulo de Despesas Recorrentes, Parceladas e Câmbio USD", () => {
  describe("Serviço de Câmbio (cambioService)", () => {
    it("deve converter valor de USD para BRL corretamente com cotação fornecida", () => {
      const valorUsd = 100;
      const cotacao = 5.65;
      const valorBrl = converterUsdParaBrl(valorUsd, cotacao);
      assert.equal(valorBrl, 565.0);
    });

    it("deve converter valor fracionado com arredondamento em 2 casas decimais", () => {
      const valorUsd = 12.34;
      const cotacao = 5.6789;
      const valorBrl = converterUsdParaBrl(valorUsd, cotacao);
      assert.equal(valorBrl, 70.08);
    });

    it("deve retornar 0 quando o valor em USD for menor ou igual a 0", () => {
      assert.equal(converterUsdParaBrl(0, 5.65), 0);
      assert.equal(converterUsdParaBrl(-10, 5.65), 0);
    });

    it("deve converter BRL para USD com base na cotação", () => {
      const valorBrl = 565;
      const cotacao = 5.65;
      const valorUsd = converterBrlParaUsd(valorBrl, cotacao);
      assert.equal(valorUsd, 100.0);
    });

    it("deve formatar moedas BRL e USD adequadamente", () => {
      const fmtBrl = formatarValorMoeda(1500.5, "BRL");
      assert.ok(fmtBrl.includes("R$"));
      assert.ok(fmtBrl.includes("1.500,50") || fmtBrl.includes("1500,50"));

      const fmtUsd = formatarValorMoeda(250.75, "USD");
      assert.ok(fmtUsd.includes("US$"));
      assert.ok(fmtUsd.includes("250.75"));
    });

    it("deve retornar cotação comercial resiliente com fallback em caso de offline", async () => {
      const resultado = await obterCotacaoDolarHoje();
      assert.ok(resultado);
      assert.ok(resultado.cotacao > 0);
      assert.equal(typeof resultado.fonte, "string");
    });
  });

  describe("Integração de Parcelamento e Despesas Recorrentes no Livro-Caixa e DRE", () => {
    it("deve consolidar valores convertidos em BRL nas saídas do fluxo de caixa", () => {
      // Simulação de transações: 1 avulsa em USD convertida para BRL, 1 parcelada em BRL
      const transacoes: TransacaoFinanceira[] = [
        {
          id: "tx-usd-1",
          tipo: "saida",
          categoria: "infraestrutura_servidores",
          descricao: "Servidores Cloud AWS (US$ 100.00)",
          valor: 565.0, // Convertido para BRL
          moeda: "USD",
          valor_moeda_original: 100.0,
          cotacao_moeda: 5.65,
          data_competencia: "2026-10-01",
          status: "concluido",
          modalidade: "avulsa",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "tx-parc-1",
          tipo: "saida",
          categoria: "aquisicao_equipamentos",
          descricao: "Lote de Rastreadores 4G (Parcela 1/6)",
          valor: 350.0,
          moeda: "BRL",
          modalidade: "parcelada",
          parcela_atual: 1,
          total_parcelas: 6,
          data_competencia: "2026-10-01",
          status: "pendente",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "tx-rec-1",
          tipo: "saida",
          categoria: "chips_conectividade",
          descricao: "Chips M2M Multi-operadora",
          valor: 200.0,
          moeda: "BRL",
          modalidade: "recorrente",
          recorrencia_id: "rec_chips_001",
          recorrencia_ativa: true,
          data_competencia: "2026-10-01",
          status: "concluido",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "tx-ent-1",
          tipo: "entrada",
          categoria: "mensalidade",
          descricao: "Mensalidade Frota Alpha",
          valor: 2500.0,
          moeda: "BRL",
          modalidade: "avulsa",
          data_competencia: "2026-10-01",
          status: "concluido",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const resumo = calcularResumoFluxoCaixa(transacoes);

      // Entradas realizadas = 2500
      assert.equal(resumo.entradasRealizadas, 2500.0);
      // Saídas realizadas = 565 (USD convertido) + 200 (recorrente chips) = 765
      assert.equal(resumo.saidasRealizadas, 765.0);
      // Saídas previstas pendentes = 350 (parcela 1/6)
      assert.equal(resumo.saidasPrevistas, 350.0);
      // Saldo líquido em caixa = 2500 - 765 = 1735
      assert.equal(resumo.saldoAtual, 1735.0);

      const dre = calcularDREOperacional(transacoes);
      assert.equal(dre.receitaBruta, 2500.0);
      assert.equal(dre.custoConectividade, 200.0);
      assert.equal(dre.despesasOperacionais, 565.0);
      assert.equal(dre.lucroOperacionalLiquido, 1735.0);
      assert.ok(dre.margemOperacionalPercentual > 69);
    });

    it("competências futuras de despesas recorrentes canceladas não devem compor despesas ativas", () => {
      const transacoes: TransacaoFinanceira[] = [
        {
          id: "tx-rec-fechada",
          tipo: "saida",
          categoria: "material_consumo",
          descricao: "Assinatura Software Descontinuada",
          valor: 150.0,
          moeda: "BRL",
          modalidade: "recorrente",
          recorrencia_id: "rec_soft_99",
          recorrencia_ativa: false, // Recorrência encerrada
          data_competencia: "2026-11-01",
          status: "cancelado",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const resumo = calcularResumoFluxoCaixa(transacoes);
      assert.equal(resumo.saidasRealizadas, 0);
      assert.equal(resumo.saidasPrevistas, 0);
    });

    it("deve filtrar transações por ano e mês específicos com precisão", () => {
      const lista: TransacaoFinanceira[] = [
        {
          id: "t1",
          tipo: "saida",
          categoria: "outros",
          descricao: "Compra Setembro 2026",
          valor: 100,
          data_competencia: "2026-09-15",
          status: "concluido",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "t2",
          tipo: "saida",
          categoria: "outros",
          descricao: "Compra Outubro 2026",
          valor: 200,
          data_competencia: "2026-10-10",
          status: "concluido",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "t3",
          tipo: "saida",
          categoria: "outros",
          descricao: "Compra Setembro 2025",
          valor: 300,
          data_competencia: "2025-09-20",
          status: "concluido",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // Filtrar Ano: 2026, Mês: 9 (Setembro)
      const filtradasSet2026 = lista.filter((t) => {
        const partes = t.data_competencia.split("-");
        const ano = partes[0];
        const mes = String(parseInt(partes[1], 10));
        return ano === "2026" && mes === "9";
      });
      assert.equal(filtradasSet2026.length, 1);
      assert.equal(filtradasSet2026[0].id, "t1");

      // Filtrar Ano: 2026, Todos os Meses
      const filtradasAno2026 = lista.filter((t) => {
        const partes = t.data_competencia.split("-");
        return partes[0] === "2026";
      });
      assert.equal(filtradasAno2026.length, 2);
    });

    it("lançamentos recorrentes devem ser perpétuos com total_parcelas nulo (sem prazo final pré-fixado)", () => {
      const transacaoRecorrente: TransacaoFinanceira = {
        id: "tx-recorrente-1",
        tipo: "saida",
        categoria: "infraestrutura_servidores",
        descricao: "fly.io servidor dedicado (Recorrente)",
        valor: 29.44,
        moeda: "USD",
        valor_moeda_original: 5.21,
        cotacao_moeda: 5.65,
        modalidade: "recorrente",
        recorrencia_id: "REC-GAK0L5Z",
        recorrencia_ativa: true,
        parcela_atual: null,
        total_parcelas: null, // Perpétuo, sem prazo final
        data_competencia: "2026-10-22",
        status: "pendente",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      assert.equal(transacaoRecorrente.modalidade, "recorrente");
      assert.equal(
        transacaoRecorrente.total_parcelas,
        null,
        "Recorrência perpétua não deve ter total de parcelas fixo",
      );
      assert.equal(
        transacaoRecorrente.parcela_atual,
        null,
        "Recorrência perpétua não deve ter índice de fração finita",
      );
      assert.equal(
        transacaoRecorrente.recorrencia_ativa,
        true,
        "Recorrência deve estar ativa continuamente",
      );
    });
  });
});
