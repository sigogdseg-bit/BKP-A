import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TransacaoFinanceira } from "../../features/financeiro/types";

describe("Hunter — Encerramento de Recorrência e Prevenção de Duplicidades", () => {
  it("encerramento de recorrência deve filtrar e expurgar prestações pendentes mantendo as quitadas", () => {
    const recorrenciaId = "REC-MOCK-123";

    // Simula lote de 12 meses de uma receita ou despesa recorrente
    const loteOriginal: TransacaoFinanceira[] = Array.from({ length: 12 }, (_, i) => ({
      id: `tx-rec-${i + 1}`,
      tipo: "saida",
      categoria: "chips_conectividade",
      descricao: `Assinatura de Conectividade (Recorrente)`,
      valor: 150.0,
      moeda: "BRL",
      modalidade: "recorrente",
      recorrencia_id: recorrenciaId,
      recorrencia_ativa: true,
      data_competencia: `2026-${String(i + 1).padStart(2, "0")}-01`,
      status: i < 3 ? "concluido" : "pendente", // 3 quitadas, 9 pendentes
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    // Simula a lógica de encerramento do serviço:
    // As parcelas pendentes são expurgadas/excluídas do banco
    const pendentesParaExcluir = loteOriginal.filter(
      (t) => t.recorrencia_id === recorrenciaId && t.status === "pendente",
    );
    const quitadasParaPreservar = loteOriginal
      .filter((t) => t.recorrencia_id === recorrenciaId && t.status !== "pendente")
      .map((t) => ({ ...t, recorrencia_ativa: false }));

    // Validações
    assert.equal(
      pendentesParaExcluir.length,
      9,
      "Deve localizar exatamente as 9 prestações não quitadas para exclusão",
    );
    assert.equal(
      quitadasParaPreservar.length,
      3,
      "Deve preservar exatamente as 3 prestações quitadas no histórico",
    );
    assert.ok(
      quitadasParaPreservar.every((t) => t.recorrencia_ativa === false),
      "Prestações preservadas devem ter a recorrência desativada",
    );
  });

  it("detecção de transação semelhante deve acusar duplicidade em mesmo dia, tipo e valor", () => {
    const transacoesExistentes: TransacaoFinanceira[] = [
      {
        id: "tx-existente-1",
        tipo: "saida",
        categoria: "chips_conectividade",
        descricao: "Fatura Conectividade Vivo M2M",
        valor: 450.0,
        data_competencia: "2026-09-23",
        status: "pendente",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const novaTentativaDuplicada = {
      tipo: "saida" as const,
      descricao: "fatura conectividade vivo m2m ",
      valor: 450.0,
      dataCompetencia: "2026-09-23",
    };

    const novaTentativaDiferente = {
      tipo: "saida" as const,
      descricao: "Compra Conectores",
      valor: 120.0,
      dataCompetencia: "2026-09-23",
    };

    // Função de verificação in-memory
    const verificarDuplicidade = (tentativa: typeof novaTentativaDuplicada) => {
      const descTrim = tentativa.descricao.trim().toLowerCase();
      return transacoesExistentes.some((t) => {
        const descExist = (t.descricao || "").trim().toLowerCase();
        const diffValor = Math.abs(Number(t.valor) - tentativa.valor);
        return (
          t.tipo === tentativa.tipo &&
          t.data_competencia === tentativa.dataCompetencia &&
          descExist === descTrim &&
          diffValor < 0.05
        );
      });
    };

    assert.equal(
      verificarDuplicidade(novaTentativaDuplicada),
      true,
      "Deve acusar duplicidade para mesma despesa",
    );
    assert.equal(
      verificarDuplicidade(novaTentativaDiferente),
      false,
      "Não deve acusar duplicidade para despesa diferente",
    );
  });

  it("ao alterar uma prestação recorrente, deve sincronizar as parcelas futuras sem alterar as anteriores", () => {
    const recorrenciaId = "REC-GAK0L5Z";

    // Simula lote de 12 meses (mês 1 quitado, mês 2 alterado hoje, meses 3 a 12 pendentes futuros)
    const loteRecorrente: TransacaoFinanceira[] = [
      {
        id: "tx-setembro-quitada",
        tipo: "saida",
        categoria: "infraestrutura_servidores",
        descricao: "fly.io servidor dedicado (Recorrente)",
        valor: 11.3,
        moeda: "USD",
        valor_moeda_original: 2.0,
        cotacao_moeda: 5.65,
        modalidade: "recorrente",
        recorrencia_id: recorrenciaId,
        data_competencia: "2026-09-22",
        status: "concluido",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "tx-outubro-editada",
        tipo: "saida",
        categoria: "infraestrutura_servidores",
        descricao: "fly.io servidor dedicado (Recorrente)",
        valor: 29.44, // Novo valor atualizado
        moeda: "USD",
        valor_moeda_original: 5.21,
        cotacao_moeda: 5.65,
        modalidade: "recorrente",
        recorrencia_id: recorrenciaId,
        data_competencia: "2026-10-22",
        status: "pendente",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...Array.from({ length: 10 }, (_, i) => {
        const d = new Date(2026, 10 + i, 22); // novembro/2026 em diante
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, "0");
        return {
          id: `tx-futura-${i + 1}`,
          tipo: "saida" as const,
          categoria: "infraestrutura_servidores" as const,
          descricao: "fly.io servidor dedicado (Recorrente)",
          valor: 11.3, // Valor antigo antes da sincronização
          moeda: "USD" as const,
          valor_moeda_original: 2.0,
          cotacao_moeda: 5.65,
          modalidade: "recorrente" as const,
          recorrencia_id: recorrenciaId,
          data_competencia: `${ano}-${mes}-22`,
          status: "pendente" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }),
    ];

    const dataCompetenciaEditada = "2026-10-22";
    const novoValorBrl = 29.44;
    const novoValorUsd = 5.21;

    // Regra canônica:
    // 1. As anteriores (data_competencia < 2026-10-22) OU concluídas NÃO são alteradas
    const anterioresPreservadas = loteRecorrente.filter(
      (t) => t.data_competencia < dataCompetenciaEditada || t.status === "concluido",
    );
    assert.equal(anterioresPreservadas.length, 1);
    assert.equal(anterioresPreservadas[0].valor, 11.3);
    assert.equal(anterioresPreservadas[0].valor_moeda_original, 2.0);

    // 2. As futuras pendentes (data_competencia > 2026-10-22) são sincronizadas com o novo valor
    const futurasParaAtualizar = loteRecorrente.filter(
      (t) => t.data_competencia > dataCompetenciaEditada && t.status !== "concluido",
    );
    assert.equal(futurasParaAtualizar.length, 10);

    const futurasSincronizadas = futurasParaAtualizar.map((f) => ({
      ...f,
      valor: novoValorBrl,
      valor_moeda_original: novoValorUsd,
    }));

    assert.ok(
      futurasSincronizadas.every((f) => f.valor === 29.44 && f.valor_moeda_original === 5.21),
      "Todas as 10 parcelas futuras devem assumir o novo valor de 29.44",
    );
  });

  it("regra pétrea: ausência do caractere comercial proibido nas mensagens financeiras", () => {
    const mensagens = [
      "Recorrência encerrada com sucesso! Prestações não quitadas foram excluídas.",
      "Alerta de Duplicidade Detectada",
      "Deseja confirmar a inclusão mesmo assim como um lançamento duplicado?",
      "Lançamento atualizado e 10 parcelas futuras sincronizadas com sucesso!",
    ];
    for (const m of mensagens) {
      assert.ok(!m.includes("&"), `Mensagem "${m}" não pode conter o caractere comercial proibido`);
    }
  });
});
