import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularResumoFluxoCaixa,
  podeLiquidarPeloCliente,
} from "@/features/financeiro/services/financeiroService";
import type { TransacaoFinanceira } from "@/features/financeiro/types";

describe("Hunter — Liquidação de Repasse Pago Diretamente pelo Cliente", () => {
  const root = process.cwd();
  const modalPath = path.join(
    root,
    "src/features/financeiro/components/ModalLiquidarTransacao.tsx",
  );
  const viewPath = path.join(root, "src/features/financeiro/components/FinanceiroView.tsx");
  const servicePath = path.join(root, "src/features/financeiro/services/financeiroService.ts");
  const migrationPath = path.join(
    root,
    "supabase/migrations/20261021113000_hunter_liquidacao_repasse_pelo_cliente.sql",
  );

  it("1. ModalLiquidarTransacao.tsx deve existir, usar ModalPortal e oferecer as duas opções", () => {
    assert.ok(fs.existsSync(modalPath), "ModalLiquidarTransacao.tsx deve existir");
    const code = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      code.includes("<ModalPortal>"),
      "Modal deve ser renderizado canonicamente dentro de ModalPortal",
    );
    assert.ok(
      code.includes("Liquidar pela Empresa"),
      "Modal deve conter opção de liquidar pela empresa",
    );
    assert.ok(
      code.includes("Liquidado pelo Cliente"),
      "Modal deve conter opção de liquidado pelo cliente",
    );
    assert.ok(
      code.includes("R$ 0,00"),
      "Modal deve indicar expressamente o valor zerado para pagamento pelo cliente",
    );
  });

  it("2. FinanceiroView.tsx deve integrar ModalLiquidarTransacao e passar a opção para atualizarStatusTransacao", () => {
    const code = fs.readFileSync(viewPath, "utf-8");

    assert.ok(
      code.includes("ModalLiquidarTransacao"),
      "FinanceiroView.tsx deve importar e renderizar ModalLiquidarTransacao",
    );
    assert.ok(
      code.includes("handleConfirmarLiquidacao"),
      "FinanceiroView.tsx deve implementar handleConfirmarLiquidacao",
    );
    assert.ok(
      code.includes("liquidadoPeloCliente: isCliente"),
      "Deve repassar a flag liquidadoPeloCliente para atualizarStatusTransacao",
    );
    assert.ok(
      code.includes("t.liquidado_pelo_cliente"),
      "Deve renderizar badge Liquidado pelo Cliente quando o repasse for zerado",
    );
  });

  it("3. financeiroService.ts deve tratar liquidadoPeloCliente e zerar o repasse no fluxo de caixa", () => {
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      code.includes("liquidadoPeloCliente"),
      "financeiroService.ts deve aceitar options.liquidadoPeloCliente em atualizarStatusTransacao",
    );
    assert.ok(
      code.includes("pago_direto_cliente"),
      "financeiroService.ts deve mapear a coluna pago_direto_cliente das instalações",
    );
    assert.ok(
      code.includes("liquidar_repasse_instalacao_pelo_cliente"),
      "Deve invocar a RPC canônica com fallback direto no banco",
    );
  });

  it("4. calcularResumoFluxoCaixa com transação liquidada pelo cliente não deve somar nas saídas e manter saldo intacto", () => {
    const transacaoLiquidadaEmpresa: TransacaoFinanceira = {
      id: "t-1",
      tipo: "saida",
      categoria: "repasse_instalador",
      descricao: "Repasse Empresa",
      valor: 120,
      status: "concluido",
      data_competencia: "2026-10-20",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const transacaoLiquidadaCliente: TransacaoFinanceira = {
      id: "t-2",
      tipo: "saida",
      categoria: "repasse_instalador",
      descricao: "Repasse Instalador - Liquidado pelo Cliente",
      valor: 0,
      liquidado_pelo_cliente: true,
      status: "concluido",
      data_competencia: "2026-10-20",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resumo = calcularResumoFluxoCaixa(
      [transacaoLiquidadaEmpresa, transacaoLiquidadaCliente],
      1000,
    );

    // O saldo deve abater apenas os 120 da empresa, sem descontar nada da transação do cliente
    assert.strictEqual(resumo.saidasRealizadas, 120);
    assert.strictEqual(resumo.saldoAtual, 880); // 1000 - 120
  });

  it("5. ModalLiquidarTransacao.tsx não deve conter o caractere comercial proibido em textos", () => {
    const code = fs.readFileSync(modalPath, "utf-8");
    const lines = code.split("\n");

    const forbiddenCharPattern = /&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-f\d]+;|\s*&))/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("&&") || line.includes("//") || line.includes("/*")) {
        continue;
      }
      if (forbiddenCharPattern.test(line)) {
        assert.fail(
          `Caractere comercial proibido encontrado na linha ${i + 1} de ModalLiquidarTransacao.tsx: ${line}`,
        );
      }
    }
  });

  it("6. Migração SQL deve conter DDL idempotente e comando de recarga do cache PostgREST", () => {
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração SQL deve existir");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("pago_direto_cliente"),
      "Migração deve adicionar coluna pago_direto_cliente em public.instalacoes",
    );
    assert.ok(
      sql.includes("liquidado_pelo_cliente"),
      "Migração deve adicionar coluna liquidado_pelo_cliente em public.transacoes_financeiras",
    );
    assert.ok(
      sql.includes("liquidar_repasse_instalacao_pelo_cliente"),
      "Migração deve definir a função liquidar_repasse_instalacao_pelo_cliente",
    );
    assert.ok(
      sql.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve conter o comando obrigatório de invalidação do cache",
    );
  });

  it("7. podeLiquidarPeloCliente deve retornar true APENAS para saídas de repasse ao instalador", () => {
    assert.strictEqual(
      podeLiquidarPeloCliente({
        id: "t-inst-1",
        tipo: "saida",
        categoria: "repasse_instalador",
        instalacao_id: null,
      }),
      true,
    );
    assert.strictEqual(
      podeLiquidarPeloCliente({
        id: "i-abc123",
        tipo: "saida",
        categoria: "outros",
        instalacao_id: null,
      }),
      true,
    );
    assert.strictEqual(
      podeLiquidarPeloCliente({
        id: "t-inst-2",
        tipo: "saida",
        categoria: "outros",
        instalacao_id: "inst-uuid-1",
      }),
      true,
    );

    // Despesas da empresa e receitas NUNCA podem exibir ou usar Liquidado pelo Cliente
    for (const cat of [
      "infraestrutura_servidores",
      "chips_conectividade",
      "despesa_administrativa",
      "aquisicao_equipamentos",
      "material_consumo",
      "repasse_revendedor",
      "repasse_vendedor",
      "outros",
    ] as const) {
      assert.strictEqual(
        podeLiquidarPeloCliente({
          id: `t-${cat}`,
          tipo: "saida",
          categoria: cat,
          instalacao_id: null,
        }),
        false,
        `Categoria ${cat} não deve permitir liquidação pelo cliente`,
      );
    }

    assert.strictEqual(
      podeLiquidarPeloCliente({
        id: "m-1",
        tipo: "entrada",
        categoria: "mensalidade",
        instalacao_id: "inst-uuid-1",
      }),
      false,
    );
  });

  it("8. ModalLiquidarTransacao e ModalNovaTransacao devem exigir caixa (Empresa ou ADM) em despesas e restringir Liquidado pelo Cliente", () => {
    const modalLiquidarCode = fs.readFileSync(modalPath, "utf-8");
    const modalNovaPath = path.join(
      root,
      "src/features/financeiro/components/ModalNovaTransacao.tsx",
    );
    const modalNovaCode = fs.readFileSync(modalNovaPath, "utf-8");
    const serviceCode = fs.readFileSync(servicePath, "utf-8");
    const guardMigrationPath = path.join(
      root,
      "supabase/migrations/20261112194000_hunter_financeiro_caixa_origem_e_guard_liquidacao_cliente.sql",
    );
    const masterSqlPath = path.join(root, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(
      modalLiquidarCode.includes("isRepasseInstalador &&") &&
        modalLiquidarCode.includes("podeLiquidarPeloCliente"),
      "ModalLiquidarTransacao deve condicionar Liquidado pelo Cliente a podeLiquidarPeloCliente",
    );
    assert.ok(
      modalLiquidarCode.includes("Pago por ADM / Operador"),
      "ModalLiquidarTransacao deve permitir escolher pagamento por ADM / Operador",
    );

    assert.ok(
      modalNovaCode.includes("De qual caixa sai esta despesa?") &&
        modalNovaCode.includes("Pago por ADM / Operador") &&
        modalNovaCode.includes("Caixa da Empresa"),
      "ModalNovaTransacao deve solicitar de qual caixa sai a despesa",
    );
    assert.ok(
      !/[^&]&[^&]/.test(modalNovaCode),
      "ModalNovaTransacao não pode conter & comercial isolado",
    );

    assert.ok(
      serviceCode.includes("fonte_pagamento") &&
        serviceCode.includes("status_ressarcimento") &&
        serviceCode.includes("ehRepasseInstalador"),
      "financeiroService deve buscar colunas de caixa/ressarcimento e validar guarda no backend",
    );

    assert.ok(fs.existsSync(guardMigrationPath), "Migration 20261112194000 deve existir");
    const guardSql = fs.readFileSync(guardMigrationPath, "utf-8");
    assert.ok(
      guardSql.includes(
        "Apenas repasses de instalação para pagamento ao instalador podem ser liquidados pelo cliente",
      ) && guardSql.includes("NOTIFY pgrst, 'reload schema';"),
      "Migration 20261112194000 deve blindar RPC e invalidar cache",
    );

    const masterSql = fs.readFileSync(masterSqlPath, "utf-8");
    assert.ok(
      masterSql.includes(
        "20261112194000_hunter_financeiro_caixa_origem_e_guard_liquidacao_cliente.sql",
      ),
      "Script mestre deve espelhar a migration 20261112194000",
    );
  });
});
