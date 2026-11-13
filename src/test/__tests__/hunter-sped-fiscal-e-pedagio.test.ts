import test from "node:test";
import assert from "node:assert/strict";
import { gerarSpedFiscalTxt } from "../../features/financeiro/services/spedFiscalService";
import {
  conciliarPassagensPedagioComGps,
  importarExtratoPedagioCsv,
  calcularTotalizadoresPedagio,
  PassagemPedagio,
} from "../../features/frota/services/pedagioTagService";
import type { TransacaoFinanceira } from "../../features/financeiro/types";

test("HUNTER — Exportador Contábil SPED Fiscal e Gestão de Pedágios", async (t) => {
  await t.test("1. SPED Fiscal: Deve gerar blocos 0, C, D, E e 9 com totalizadores exatos", () => {
    const transacoes: TransacaoFinanceira[] = [
      {
        id: "tr-1",
        tipo: "entrada",
        categoria: "mensalidade",
        descricao: "Mensalidade Plano Hunter - Cliente Teste",
        valor: 150.0,
        data_competencia: "2026-11-01",
        data_vencimento: "2026-11-10",
        data_pagamento: "2026-11-10",
        status: "concluido",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      },
      {
        id: "tr-2",
        tipo: "entrada",
        categoria: "mensalidade",
        descricao: "Mensalidade Frota - Cliente Corporativo",
        valor: 350.0,
        data_competencia: "2026-11-01",
        data_vencimento: "2026-11-15",
        data_pagamento: "2026-11-15",
        status: "concluido",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      },
    ];

    const resultado = gerarSpedFiscalTxt({
      mes: 11,
      ano: 2026,
      transacoes,
    });

    assert.ok(resultado.conteudoTxt.includes("|0000|018|0|01112026|30112026|"));
    assert.ok(resultado.conteudoTxt.includes("|C001|0|"));
    assert.ok(resultado.conteudoTxt.includes("|C100|"));
    assert.ok(resultado.conteudoTxt.includes("|E001|0|"));
    assert.ok(resultado.conteudoTxt.includes("|9999|"));
    assert.equal(resultado.valorTotalFaturado, 500.0);
    assert.equal(resultado.totalLinhas > 10, true);
  });

  await t.test(
    "2. Tags de Pedágio: Deve conciliar passagem com histórico de GPS dentro da janela de tempo",
    () => {
      const agora = new Date("2026-11-07T14:30:00Z");
      const passagens: PassagemPedagio[] = [
        {
          id: "ped-1",
          placa: "AXH0E44",
          operadora: "sem_parar",
          praca_nome: "Praça Viambas - Rodovia Presidente Dutra",
          valor: 16.2,
          data_hora: agora.toISOString(),
          latitude: -22.5038,
          longitude: -44.0831,
        },
      ];

      const pontosGps = [
        {
          dataHora: new Date("2026-11-07T14:32:00Z"), // 2 minutos depois
          latitude: -22.5039,
          longitude: -44.0832,
          velocidade: 80,
        },
      ];

      const conciliadas = conciliarPassagensPedagioComGps(passagens, pontosGps, 10);
      assert.equal(conciliadas.length, 1);
      assert.equal(conciliadas[0].conciliado_gps, true);
      assert.equal(conciliadas[0].diferencaTempoMinutos, 2);
    },
  );

  await t.test(
    "3. Tags de Pedágio: Deve importar extrato CSV e calcular totalizadores corretamente",
    () => {
      const csv = `DataHora;Placa;Praca;Valor\n2026-11-07 10:00;AXH0E44;Serra das Araras;R$ 16,20\n2026-11-07 12:30;LTK1A94;Itatiaia;R$ 16,20`;
      const passagens = importarExtratoPedagioCsv(csv, "sem_parar");

      assert.equal(passagens.length, 2);
      assert.equal(passagens[0].placa, "AXH0E44");
      assert.equal(passagens[0].valor, 16.2);

      const totais = calcularTotalizadoresPedagio(passagens);
      assert.equal(totais.totalGasto, 32.4);
      assert.equal(totais.qtdPassagens, 2);
      assert.equal(totais.mediaPorPassagem, 16.2);
    },
  );
});
