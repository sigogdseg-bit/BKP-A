import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Correções de Filtro de Instalações, Repasses a Pagar e Fornecedor Voxter", () => {
  const root = process.cwd();
  const instalacoesViewPath = path.join(
    root,
    "src/features/instalacoes/components/InstalacoesView.tsx",
  );
  const financeiroServicePath = path.join(
    root,
    "src/features/financeiro/services/financeiroService.ts",
  );
  const migrationPath = path.join(
    root,
    "supabase/migrations/20261021133000_hunter_correcoes_instalacoes_voxter_repasses.sql",
  );

  it("1. InstalacoesView: filtro de Pendências / Não Inst. deve suportar com_pendencia sem esvaziar a lista", () => {
    const code = fs.readFileSync(instalacoesViewPath, "utf-8");

    assert.ok(
      code.includes('filtroStatus === "com_pendencia"'),
      "InstalacoesView deve tratar filtroStatus === 'com_pendencia'",
    );
    assert.ok(
      code.includes('inst.status === "concluida_com_pendencia"') &&
        code.includes('inst.status === "nao_instalado"'),
      "com_pendencia deve abranger ordens com pendência e não instaladas",
    );
    assert.ok(
      code.includes("calcularResumoRepasse(instalacoes,"),
      "resumoFinanceiro deve calcular os totais sobre a base íntegra de instalações",
    );
  });

  it("2. InstalacoesView: Select de status deve conter a opção Pendências / Não Inst.", () => {
    const code = fs.readFileSync(instalacoesViewPath, "utf-8");
    assert.ok(
      code.includes('<option value="com_pendencia">Pendências / Não Inst.</option>'),
      "Select de status deve conter a opção canônica 'Pendências / Não Inst.'",
    );
  });

  it("3. financeiroService: Repasses de instalações concluídas devem ser mesclados no fluxo a pagar", () => {
    const code = fs.readFileSync(financeiroServicePath, "utf-8");

    assert.ok(
      code.includes("dadosInstalacoes"),
      "Deve utilizar dadosInstalacoes com fallback de resiliência",
    );
    assert.ok(
      code.includes('categoria: "repasse_instalador"'),
      "Deve gerar transações de repasse_instalador",
    );
    assert.ok(
      code.includes("isConcluida"),
      "Deve verificar se a instalação está concluída para gerar obrigação a pagar",
    );
  });

  it("4. financeiroService: Mensalidades com valor pro-rata devem conter indicação explícita", () => {
    const code = fs.readFileSync(financeiroServicePath, "utf-8");

    assert.ok(
      code.includes("isProRata"),
      "Deve calcular se o valor da mensalidade difere do valor base contratual",
    );
    assert.ok(
      code.includes("(Pró-rata + Mensalidade)"),
      "Deve indicar explicitamente '(Pró-rata + Mensalidade)' na descrição",
    );
  });

  it("5. Migração SQL: Deve corrigir nome do fornecedor para Voxter e ter colunas de liquidação", () => {
    assert.ok(fs.existsSync(migrationPath), "Migração de correções deve existir");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("REPLACE(descricao, 'Vortexm', 'Voxter')"),
      "Deve substituir todas as ocorrências de Vortexm por Voxter",
    );
    assert.ok(
      sql.includes("pago_direto_cliente"),
      "Deve garantir coluna pago_direto_cliente em public.instalacoes",
    );
    assert.ok(
      sql.includes("NOTIFY pgrst, 'reload schema';"),
      "Deve invalidar cache PostgREST ao final",
    );
  });

  it("6. ModalPagamentoPixInstalacao deve permitir marcar 'Pago pelo Cliente (R$ 0,00)'", () => {
    const modalPixPath = path.join(
      root,
      "src/features/instalacoes/components/ModalPagamentoPixInstalacao.tsx",
    );
    assert.ok(fs.existsSync(modalPixPath), "ModalPagamentoPixInstalacao deve existir");
    const code = fs.readFileSync(modalPixPath, "utf-8");

    assert.ok(
      code.includes("Pago pelo Cliente (R$ 0,00)"),
      "Modal PIX deve conter botão explícito 'Pago pelo Cliente (R$ 0,00)'",
    );
    assert.ok(
      code.includes("Liquidar pela Empresa"),
      "Modal PIX deve conter botão 'Liquidar pela Empresa'",
    );
    assert.ok(
      code.includes("marcarPagamentoPeloCliente"),
      "Modal PIX deve invocar marcarPagamentoPeloCliente",
    );
  });
});
