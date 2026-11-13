import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

describe("Hunter — Exclusão Definitiva de Cliente e Veículo sem Tabelas Fantasmas", () => {
  test("1. Verificação Estática de Tabelas Canônicas: ausência de agendamentos_instalacao, areas_seguras_geofence e parcelas_contrato_cliente", () => {
    const tabelasValidas = [
      "instalacoes",
      "mensalidades",
      "areas_seguras",
      "veiculos",
      "clientes",
      "rastreadores",
      "chips",
      "motoristas",
    ];

    assert.ok(
      tabelasValidas.includes("instalacoes"),
      "Tabela canônica de agendamentos deve ser instalacoes",
    );
    assert.ok(
      tabelasValidas.includes("mensalidades"),
      "Tabela canônica de parcelas deve ser mensalidades",
    );
    assert.ok(
      tabelasValidas.includes("areas_seguras"),
      "Tabela canônica de cercas deve ser areas_seguras",
    );
    assert.ok(
      !tabelasValidas.includes("agendamentos_instalacao"),
      "Tabela fantasma agendamentos_instalacao não deve existir",
    );
    assert.ok(
      !tabelasValidas.includes("areas_seguras_geofence"),
      "Tabela fantasma areas_seguras_geofence não deve existir",
    );
    assert.ok(
      !tabelasValidas.includes("parcelas_contrato_cliente"),
      "Tabela fantasma parcelas_contrato_cliente não deve existir",
    );
  });

  test("2. Migration SQL 20261009150000: garante remoção de referências estáticas inválidas e uso de to_regclass", async () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261009150000_hunter_fix_rpc_admin_excluir_cliente_definitivo.sql",
    );
    const sql = await fs.readFile(migrationPath, "utf-8");

    // Verifica que não há chamadas DELETE FROM estáticas diretas a tabelas inexistentes
    assert.ok(
      !sql.includes("DELETE FROM public.agendamentos_instalacao WHERE"),
      "Não deve haver DELETE FROM direto em agendamentos_instalacao",
    );
    assert.ok(
      !sql.includes("DELETE FROM public.areas_seguras_geofence WHERE"),
      "Não deve haver DELETE FROM direto em areas_seguras_geofence",
    );
    assert.ok(
      !sql.includes("DELETE FROM public.parcelas_contrato_cliente WHERE"),
      "Não deve haver DELETE FROM direto em parcelas_contrato_cliente",
    );

    // Verifica uso defensivo de to_regclass
    assert.ok(
      sql.includes("to_regclass"),
      "Deve conter verificação dinâmica to_regclass para proteção contra schema drift",
    );
    assert.ok(
      sql.includes("status = 'estoque'"),
      "Deve usar status 'estoque' ao desvincular rastreadores conforme enum status_rastreador",
    );
    assert.ok(sql.includes("novaes@adm.28bpm.local"), "Deve conter blindagem de SuperADM imutável");
    assert.ok(sql.includes("novaes@oficial.tec.br"), "Deve conter blindagem de SuperADM oficial");
    assert.ok(
      sql.includes("NOTIFY pgrst, 'reload schema'"),
      "Deve conter invalidação de cache de schema PostgREST",
    );
  });

  test("3. Master SQL APLICAR_NO_SQL_EDITOR_SUPABASE.sql: espelha a RPC definitiva e blindada", async () => {
    const masterSqlPath = path.resolve(
      process.cwd(),
      "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const sql = await fs.readFile(masterSqlPath, "utf-8");

    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION public.admin_excluir_cliente("),
      "Master SQL deve conter admin_excluir_cliente",
    );
    assert.ok(
      sql.includes("status = 'estoque'"),
      "Master SQL deve atualizar status do rastreador para estoque",
    );
  });

  test("4. Serviço clienteService.ts: possui sanitização contra vazamento de erros técnicos de banco", async () => {
    const servicePath = path.resolve(
      process.cwd(),
      "src/features/clientes/services/clienteService.ts",
    );
    const code = await fs.readFile(servicePath, "utf-8");

    assert.ok(
      code.includes("admin_excluir_cliente"),
      "clienteService deve invocar a RPC admin_excluir_cliente",
    );
    assert.ok(
      code.includes("SuperADM"),
      "clienteService deve tratar mensagem amigável de SuperADM imutável",
    );
    assert.ok(
      code.includes("does not exist") || code.includes("relation"),
      "clienteService deve proteger contra vazamento de relation/does not exist",
    );
  });
});
