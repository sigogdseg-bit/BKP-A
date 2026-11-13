import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Blindagem Absoluta Anti-Duplicação de Ordens de Serviço na Edição de Clientes", () => {
  const root = process.cwd();
  const migrationPath = path.join(
    root,
    "supabase/migrations/20261021121500_hunter_blindagem_absoluta_anti_duplicacao_instalacoes_edicao_cliente.sql",
  );
  const sqlEditorPath = path.join(root, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
  const instalacaoServicePath = path.join(
    root,
    "src/features/instalacoes/services/instalacaoService.ts",
  );

  it("1. A migração SQL canônica deve existir e conter NOTIFY pgrst", () => {
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração deve existir");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      sql.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve conter NOTIFY pgrst ao final",
    );
  });

  it("2. O trigger trg_sync_cliente_instalador_instalacao deve blindar contra criação de ordens duplicadas", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      sql.includes("trg_sync_cliente_instalador_instalacao"),
      "Migração deve recriar a função trigger trg_sync_cliente_instalador_instalacao",
    );
    assert.ok(
      sql.includes("v_todos_veiculos_concluidos"),
      "Trigger deve verificar se todos os veículos já possuem instalação concluída",
    );
    assert.ok(
      sql.includes("status IN ('concluida', 'concluida_com_pendencia')"),
      "Trigger deve respeitar ordens com status concluida ou concluida_com_pendencia",
    );
    assert.ok(
      sql.includes("IF v_todos_veiculos_concluidos THEN"),
      "Trigger deve abortar criação de novas ordens caso todos os veículos estejam concluídos",
    );
  });

  it("3. A RPC admin_atualizar_cliente_completo deve preservar status concluido para clientes com veículos ativos", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      sql.includes("admin_atualizar_cliente_completo"),
      "Migração deve atualizar a RPC admin_atualizar_cliente_completo",
    );
    assert.ok(
      sql.includes("v_possui_instalacao_concluida"),
      "RPC deve checar se o cliente já possui instalação concluída antes de rebaixar status",
    );
    assert.ok(
      sql.includes("v_status_agendamento_final := 'concluido'"),
      "RPC deve fixar o status_agendamento em concluido caso já haja instalação concluída",
    );
  });

  it("4. O script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve espelhar as correções", () => {
    assert.ok(fs.existsSync(sqlEditorPath), "Script mestre deve existir");
    const mestre = fs.readFileSync(sqlEditorPath, "utf-8");
    assert.ok(
      mestre.includes("v_todos_veiculos_concluidos"),
      "Script mestre deve conter a checagem v_todos_veiculos_concluidos",
    );
    assert.ok(
      mestre.includes("v_possui_instalacao_concluida"),
      "Script mestre deve conter a checagem v_possui_instalacao_concluida",
    );
  });

  it("5. instalacaoService.ts deve blindar garantirSincronizacaoInstalacaoCliente contra duplicações", () => {
    const code = fs.readFileSync(instalacaoServicePath, "utf-8");
    assert.ok(
      code.includes("garantirSincronizacaoInstalacaoCliente"),
      "Deve exportar garantirSincronizacaoInstalacaoCliente",
    );
    assert.ok(
      code.includes("ordensConcluidas"),
      "Deve verificar se já existem ordens concluídas antes de qualquer inserção",
    );
    assert.ok(
      code.includes("todosVeiculosAtivos"),
      "Deve verificar se todos os veículos do cliente já estão ativos",
    );
  });
});
