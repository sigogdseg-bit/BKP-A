import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Correção Canônica da Odometria em Tempo Real e updated_at em viagens_trajetos", () => {
  const root = process.cwd();
  const migrationPath = path.resolve(
    root,
    "supabase/migrations/20261023144500_hunter_correcao_viagens_trajetos_updated_at_e_odometro.sql",
  );
  const masterPath = path.resolve(root, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

  it("1. Arquivo de migração DDL deve existir e conter ADD COLUMN updated_at em viagens_trajetos", () => {
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração não encontrado");
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(
      sql,
      /ALTER TABLE public\.viagens_trajetos\s+ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ/i,
      "Deve adicionar a coluna updated_at em viagens_trajetos",
    );
    assert.match(
      sql,
      /NOTIFY pgrst, 'reload schema';/i,
      "Deve conter a invalidação canônica NOTIFY pgrst",
    );
  });

  it("2. Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve espelhar a migração", () => {
    assert.ok(fs.existsSync(masterPath), "Script mestre não encontrado");
    const masterSql = fs.readFileSync(masterPath, "utf8");
    assert.match(
      masterSql,
      /20261023144500_hunter_correcao_viagens_trajetos_updated_at_e_odometro\.sql/,
      "Script mestre deve referenciar a migração 20261023144500",
    );
    assert.match(
      masterSql,
      /ALTER TABLE public\.viagens_trajetos\s+ADD COLUMN IF NOT EXISTS updated_at/i,
      "Script mestre deve conter a adição de updated_at em viagens_trajetos",
    );
  });

  it("3. RPC registrar_posicao_gps_com_odometro deve atualizar updated_at em viagens_trajetos", () => {
    const migrationRpcPath = path.resolve(
      root,
      "supabase/migrations/20261023130000_hunter_odometria_motores_abc_persistente.sql",
    );
    const rpcSql = fs.readFileSync(migrationRpcPath, "utf8");
    assert.match(
      rpcSql,
      /UPDATE public\.viagens_trajetos\s+SET\s+km_percorrido\s*=\s*km_percorrido\s*\+\s*v_delta_km,\s*updated_at\s*=\s*NOW\(\)/i,
      "A RPC deve atualizar km_percorrido e updated_at atomicamente na viagem em andamento",
    );
  });
});
