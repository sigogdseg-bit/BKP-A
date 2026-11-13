import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularResumoRessarcimento,
  listarResponsaveisPagamento,
  efetivarRessarcimento,
  exportarRelatorioRessarcimentoPDF,
  exportarRelatorioRessarcimentoExcel,
} from "../../features/financeiro/services/financeiroService";
import type { TransacaoFinanceira } from "../../features/financeiro/types";

describe("Hunter — Origem da Verba e Ressarcimento de Despesas (Caixa vs Operador/ADM)", () => {
  const transacoesMock: TransacaoFinanceira[] = [
    // 1. Despesa paga pelo Caixa da Empresa
    {
      id: "t-caixa-1",
      tipo: "saida",
      categoria: "infraestrutura_servidores",
      descricao: "Internet Fibra Óptica - Central",
      valor: 250.0,
      data_competencia: "2026-10-01",
      status: "concluido",
      fonte_pagamento: "caixa_empresa",
      status_ressarcimento: "nao_aplicavel",
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    // 2. Despesa paga do próprio bolso pelo Operador Carlos (Pendente de Ressarcimento)
    {
      id: "t-operador-1",
      tipo: "saida",
      categoria: "despesa_administrativa",
      descricao: "Combustível para atendimento emergencial VTR",
      valor: 180.5,
      data_competencia: "2026-10-05",
      status: "concluido",
      fonte_pagamento: "operador_adm",
      responsavel_pagamento_id: "user-op-carlos",
      responsavel_pagamento_nome: "Carlos Eduardo (Operador)",
      status_ressarcimento: "pendente",
      created_at: "2026-10-05T00:00:00Z",
      updated_at: "2026-10-05T00:00:00Z",
    },
    // 3. Outra despesa paga pelo Operador Carlos (Pendente de Ressarcimento)
    {
      id: "t-operador-2",
      tipo: "saida",
      categoria: "despesa_administrativa",
      descricao: "Pedágio ida e volta atendimento cliente",
      valor: 45.0,
      data_competencia: "2026-10-06",
      status: "concluido",
      fonte_pagamento: "operador_adm",
      responsavel_pagamento_id: "user-op-carlos",
      responsavel_pagamento_nome: "Carlos Eduardo (Operador)",
      status_ressarcimento: "pendente",
      created_at: "2026-10-06T00:00:00Z",
      updated_at: "2026-10-06T00:00:00Z",
    },
    // 4. Despesa paga pelo ADM Roberto (Já Ressarcida)
    {
      id: "t-adm-1",
      tipo: "saida",
      categoria: "outros",
      descricao: "Almoço da equipe técnica em campo",
      valor: 120.0,
      data_competencia: "2026-10-02",
      status: "concluido",
      fonte_pagamento: "operador_adm",
      responsavel_pagamento_id: "user-adm-roberto",
      responsavel_pagamento_nome: "Roberto Silva (ADM)",
      status_ressarcimento: "ressarcido",
      data_ressarcimento: "2026-10-04",
      created_at: "2026-10-02T00:00:00Z",
      updated_at: "2026-10-04T00:00:00Z",
    },
    // 5. Entrada comum (não gera ressarcimento mesmo se tiver campos preenchidos por equívoco)
    {
      id: "t-entrada-1",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidade Cliente X",
      valor: 500.0,
      data_competencia: "2026-10-10",
      status: "concluido",
      fonte_pagamento: "caixa_empresa",
      status_ressarcimento: "nao_aplicavel",
      created_at: "2026-10-10T00:00:00Z",
      updated_at: "2026-10-10T00:00:00Z",
    },
  ];

  it("calcula corretamente o resumo de ressarcimento geral e por responsável", () => {
    const resumo = calcularResumoRessarcimento(transacoesMock);

    // Total pendente: 180.5 + 45.0 = 225.5
    assert.equal(resumo.totalPendente, 225.5);
    assert.equal(resumo.quantidadePendente, 2);

    // Total ressarcido: 120.0
    assert.equal(resumo.totalRessarcido, 120.0);
    assert.equal(resumo.quantidadeRessarcida, 1);

    // Total adiantado geral pela equipe: 225.5 + 120.0 = 345.5
    assert.equal(resumo.totalGeral, 345.5);
    assert.equal(resumo.quantidadeTotal, 3);

    // Agrupamento por responsável
    assert.equal(resumo.porResponsavel.length, 2);

    const carlos = resumo.porResponsavel.find((r) => r.nome.includes("Carlos"));
    assert.ok(carlos, "Carlos Eduardo deve constar no resumo por responsável");
    assert.equal(carlos?.totalPendente, 225.5);
    assert.equal(carlos?.quantidadePendente, 2);
    assert.equal(carlos?.totalRessarcido, 0);

    const roberto = resumo.porResponsavel.find((r) => r.nome.includes("Roberto"));
    assert.ok(roberto, "Roberto Silva deve constar no resumo por responsável");
    assert.equal(roberto?.totalPendente, 0);
    assert.equal(roberto?.totalRessarcido, 120.0);
    assert.equal(roberto?.quantidadeRessarcida, 1);
  });

  it("ignora saídas do caixa_empresa no cálculo de ressarcimento a operadores", () => {
    const apenasCaixa: TransacaoFinanceira[] = [
      {
        id: "t-caixa-apenas",
        tipo: "saida",
        categoria: "chips_conectividade",
        descricao: "Fatura Chips M2M",
        valor: 990.0,
        data_competencia: "2026-10-10",
        status: "concluido",
        fonte_pagamento: "caixa_empresa",
        status_ressarcimento: "nao_aplicavel",
        created_at: "2026-10-10T00:00:00Z",
        updated_at: "2026-10-10T00:00:00Z",
      },
    ];

    const resumo = calcularResumoRessarcimento(apenasCaixa);
    assert.equal(resumo.totalPendente, 0);
    assert.equal(resumo.totalRessarcido, 0);
    assert.equal(resumo.totalGeral, 0);
    assert.equal(resumo.quantidadePendente, 0);
    assert.equal(resumo.quantidadeTotal, 0);
    assert.equal(resumo.porResponsavel.length, 0);
  });

  it("exporta as funções operacionais de prestação de contas e relatórios", () => {
    assert.equal(typeof listarResponsaveisPagamento, "function");
    assert.equal(typeof efetivarRessarcimento, "function");
    assert.equal(typeof exportarRelatorioRessarcimentoPDF, "function");
    assert.equal(typeof exportarRelatorioRessarcimentoExcel, "function");
  });

  it("garante que o script de migração DDL de ressarcimento foi criado com reload de schema", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261016143000_hunter_financeiro_origem_verba_ressarcimento.sql",
    );

    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração DDL deve existir");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      migrationSql.includes("fonte_pagamento"),
      "Migração deve adicionar coluna fonte_pagamento",
    );
    assert.ok(
      migrationSql.includes("status_ressarcimento"),
      "Migração deve adicionar coluna status_ressarcimento",
    );
    assert.ok(
      migrationSql.includes("responsavel_pagamento_nome"),
      "Migração deve adicionar coluna responsavel_pagamento_nome",
    );
    assert.ok(
      migrationSql.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve conter NOTIFY pgrst obrigatório",
    );
  });

  it("garante que o script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql contém as colunas de verba e ressarcimento", () => {
    const masterPath = path.join(process.cwd(), "supabase", "APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(fs.existsSync(masterPath), "Script mestre de banco deve existir");
    const masterSql = fs.readFileSync(masterPath, "utf-8");

    assert.ok(
      masterSql.includes("ORIGEM DA VERBA DE DESPESAS E CONTROLE DE RESSARCIMENTO"),
      "Script mestre deve espelhar a seção de origem de verba e ressarcimento",
    );
    assert.ok(
      masterSql.includes("fonte_pagamento"),
      "Script mestre deve conter a coluna fonte_pagamento",
    );
    assert.ok(
      masterSql.includes("idx_transacoes_status_ressarcimento"),
      "Script mestre deve conter índice de ressarcimento",
    );
  });
});
