import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcularSaldoAnteriorTransportado,
  calcularProjecaoMensal12Meses,
  calcularMetricasExecutivas,
} from "../../features/financeiro/services/projecaoFinanceiraService";
import { calcularResumoFluxoCaixa } from "../../features/financeiro/services/financeiroService";
import type { TransacaoFinanceira } from "../../features/financeiro/types";

describe("Hunter Guardian - Projecoes Financeiras e Estatisticas Ativas", () => {
  const transacoesMock: TransacaoFinanceira[] = [
    // Mes 07/2026 (Passado) - Entrada Liquidada R$ 5.000, Saida Liquidada R$ 2.000 -> Saldo acumulado liquido = +3.000
    {
      id: "t-1",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidades Julho",
      valor: 5000,
      moeda: "BRL",
      data_competencia: "2026-07-10",
      status: "concluido",
      created_at: "2026-07-10T10:00:00Z",
      updated_at: "2026-07-10T10:00:00Z",
    },
    {
      id: "t-2",
      tipo: "saida",
      categoria: "chips_conectividade",
      descricao: "Chips Telefonia Julho",
      valor: 2000,
      moeda: "BRL",
      data_competencia: "2026-07-15",
      status: "concluido",
      created_at: "2026-07-15T10:00:00Z",
      updated_at: "2026-07-15T10:00:00Z",
    },
    // Mes 08/2026 (Passado imediato) - Entrada Liquidada R$ 6.000, Saida Liquidada R$ 1.500 -> Saldo liquido mes = +4.500
    // Saldo acumulado ate fim de agosto = 3.000 + 4.500 = +7.500
    {
      id: "t-3",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidades Agosto",
      valor: 6000,
      moeda: "BRL",
      data_competencia: "2026-08-10",
      status: "concluido",
      created_at: "2026-08-10T10:00:00Z",
      updated_at: "2026-08-10T10:00:00Z",
    },
    {
      id: "t-4",
      tipo: "saida",
      categoria: "infraestrutura_servidores",
      descricao: "Servidores Cloud Agosto",
      valor: 1500,
      moeda: "BRL",
      data_competencia: "2026-08-20",
      status: "concluido",
      created_at: "2026-08-20T10:00:00Z",
      updated_at: "2026-08-20T10:00:00Z",
    },
    // Transacao pendente no mes passado que NAO deve compor o caixa realizado transportado
    {
      id: "t-4-pend",
      tipo: "saida",
      categoria: "outros",
      descricao: "Despesa Cancelada/Pendente Agosto",
      valor: 500,
      moeda: "BRL",
      data_competencia: "2026-08-28",
      status: "pendente",
      created_at: "2026-08-28T10:00:00Z",
      updated_at: "2026-08-28T10:00:00Z",
    },
    // Mes 09/2026 (Atual) - Entrada Realizada R$ 2.000, Entrada Prevista R$ 5.000, Saida Realizada R$ 1.000
    {
      id: "t-5",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidade Setembro Paga",
      valor: 2000,
      moeda: "BRL",
      data_competencia: "2026-09-05",
      status: "concluido",
      created_at: "2026-09-05T10:00:00Z",
      updated_at: "2026-09-05T10:00:00Z",
    },
    {
      id: "t-6",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidade Setembro Pendente",
      valor: 5000,
      moeda: "BRL",
      data_competencia: "2026-09-25",
      status: "pendente",
      created_at: "2026-09-01T10:00:00Z",
      updated_at: "2026-09-01T10:00:00Z",
    },
    {
      id: "t-7",
      tipo: "saida",
      categoria: "chips_conectividade",
      descricao: "Chips Setembro Pago",
      valor: 1000,
      moeda: "BRL",
      data_competencia: "2026-09-10",
      status: "concluido",
      modalidade: "recorrente",
      created_at: "2026-09-10T10:00:00Z",
      updated_at: "2026-09-10T10:00:00Z",
    },
  ];

  test("1. deve calcular corretamente o saldo anterior transportado acumulado", () => {
    // Para Setembro/2026 (mes 9):
    // Saldo anterior = (5000 - 2000) de Julho + (6000 - 1500) de Agosto = 3000 + 4500 = 7500
    const saldoTransportadoSetembro = calcularSaldoAnteriorTransportado(
      transacoesMock,
      "2026",
      "9",
    );
    assert.equal(saldoTransportadoSetembro, 7500);

    // Para Agosto/2026 (mes 8):
    // Saldo anterior = apenas Julho = 3000
    const saldoTransportadoAgosto = calcularSaldoAnteriorTransportado(transacoesMock, "2026", "8");
    assert.equal(saldoTransportadoAgosto, 3000);

    // Para Julho/2026 (mes 7):
    // Saldo anterior = 0 (nao ha lancamentos antes de julho)
    const saldoTransportadoJulho = calcularSaldoAnteriorTransportado(transacoesMock, "2026", "7");
    assert.equal(saldoTransportadoJulho, 0);

    // Quando o filtro for 'todos' os meses, o transporte e 0 para evitar dupla contagem
    const saldoTodosMeses = calcularSaldoAnteriorTransportado(transacoesMock, "2026", "todos");
    assert.equal(saldoTodosMeses, 0);
  });

  test("2. deve incorporar o caixa transportado no resumo financeiro e projetar saldo final", () => {
    const transacoesSetembro = transacoesMock.filter((t) =>
      t.data_competencia.startsWith("2026-09"),
    );
    const saldoAnterior = calcularSaldoAnteriorTransportado(transacoesMock, "2026", "9"); // 7500

    const resumo = calcularResumoFluxoCaixa(transacoesSetembro, saldoAnterior);

    // Saldo atual = Caixa Anterior (7500) + Entradas Realizadas (2000) - Saidas Realizadas (1000) = 8500
    assert.equal(resumo.saldoAtual, 8500);
    assert.equal(resumo.saldoAnteriorTransportado, 7500);
    assert.equal(resumo.entradasRealizadas, 2000);
    assert.equal(resumo.entradasPrevistas, 5000);
    assert.equal(resumo.saidasRealizadas, 1000);

    // Saldo Projetado Final = Saldo Atual (8500) + Entradas Previstas (5000) - Saidas Previstas (0) = 13500
    assert.equal(resumo.saldoProjetadoFinal, 13500);
  });

  test("3. deve gerar projecao continua de 6 e 12 meses futuros conectando fluxo e caixa", () => {
    const projecao6 = calcularProjecaoMensal12Meses(transacoesMock, 7000, 6);
    assert.equal(projecao6.length, 6);

    // Cada mes futuro deve ter dados consistentes de receita, despesa e saldo projetado
    projecao6.forEach((p, idx) => {
      assert.ok(p.ano >= 2026);
      assert.ok(p.mes >= 1 && p.mes <= 12);
      assert.ok(p.receitasTotal > 0);
      assert.equal(p.resultadoLiquidoMes, Number((p.receitasTotal - p.despesasTotal).toFixed(2)));

      if (idx > 0) {
        // O saldo inicial do mes atual deve bater com o saldo final do mes anterior
        assert.equal(p.caixaInicialTransportado, projecao6[idx - 1].saldoFinalProjetado);
      }
    });

    const projecao12 = calcularProjecaoMensal12Meses(transacoesMock, 7000, 12);
    assert.equal(projecao12.length, 12);
  });

  test("4. deve calcular metricas executivas confiaveis (MRR, ARR, Despesas Fixas e Margem)", () => {
    const projecoes = calcularProjecaoMensal12Meses(transacoesMock, 7000, 12);
    const metricas = calcularMetricasExecutivas(transacoesMock, projecoes);

    assert.ok(metricas.mrrAtual > 0);
    assert.equal(metricas.arrProjetado, Number((metricas.mrrAtual * 12).toFixed(2)));
    assert.ok(metricas.despesasRecorrentesFixas >= 0);
    assert.ok(metricas.margemMediaProjetada > -100);
  });
});
