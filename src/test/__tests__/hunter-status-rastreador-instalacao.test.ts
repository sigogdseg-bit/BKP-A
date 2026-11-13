import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

function lerArquivo(relPath: string): string {
  const fullPath = path.resolve(process.cwd(), relPath);
  return fs.readFileSync(fullPath, "utf-8");
}

describe("Hunter — Correção do Enum status_rastreador e RPC salvar_atendimento_instalacao", () => {
  test("1. Migration 20261002133000 deve conter ALTER TYPE para adicionar 'ativo' como valor defensivo", () => {
    const sql = lerArquivo(
      "supabase/migrations/20261002133000_hunter_fix_status_rastreador_enum_e_rpc_instalacao.sql",
    );
    assert.ok(
      sql.includes("ALTER TYPE public.status_rastreador ADD VALUE IF NOT EXISTS 'ativo';"),
      "Deve adicionar 'ativo' ao enum status_rastreador para compatibilidade e resiliência defensiva",
    );
  });

  test("2. A RPC salvar_atendimento_instalacao na migration deve usar 'instalado' e 'estoque' para rastreadores", () => {
    const sql = lerArquivo(
      "supabase/migrations/20261002133000_hunter_fix_status_rastreador_enum_e_rpc_instalacao.sql",
    );

    // Na retirada
    assert.ok(
      sql.includes("'estoque'::public.status_rastreador"),
      "Rastreador retirado deve ir para 'estoque'::public.status_rastreador",
    );

    // Na conclusão / vinculação
    assert.ok(
      sql.includes("'instalado'::public.status_rastreador"),
      "Rastreador instalado/vinculado deve ser 'instalado'::public.status_rastreador",
    );

    // Não deve conter a atribuição inválida status = 'em_estoque'
    assert.ok(
      !sql.includes("status = 'em_estoque'"),
      "Não deve conter o valor inexistente 'em_estoque'",
    );
  });

  test("3. APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a correção sincronizada da RPC e do ALTER TYPE", () => {
    const masterSql = lerArquivo("supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(
      masterSql.includes("ALTER TYPE public.status_rastreador ADD VALUE IF NOT EXISTS 'ativo';"),
      "Script mestre consolidado deve conter o ALTER TYPE",
    );
    assert.ok(
      !masterSql.includes("status = 'em_estoque'"),
      "Script mestre não deve conter 'em_estoque'",
    );
  });

  test("4. Regras Pétreas Hunter-Guardian: Arquivos modificados não devem conter marcas ou sistemas proibidos", () => {
    const arquivos = [
      "supabase/migrations/20261002133000_hunter_fix_status_rastreador_enum_e_rpc_instalacao.sql",
      "supabase/migrations/20261002165000_hunter_add_bloqueador_instalado_columns.sql",
    ];

    for (const arq of arquivos) {
      const conteudo = lerArquivo(arq);
      assert.ok(
        !conteudo.includes("SIGOVTR") && !conteudo.includes("SIGOFROTA"),
        `${arq} não deve conter referências proibidas`,
      );
    }
  });

  test("5. Colunas bloqueador_instalado devem existir em instalacoes e veiculos no script de migração e no mestre", () => {
    const migrationSql = lerArquivo(
      "supabase/migrations/20261002165000_hunter_add_bloqueador_instalado_columns.sql",
    );
    const masterSql = lerArquivo("supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.match(
      migrationSql,
      /ALTER\s+TABLE\s+public\.instalacoes\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+bloqueador_instalado\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE;/i,
      "Migração deve adicionar bloqueador_instalado em instalacoes",
    );
    assert.match(
      migrationSql,
      /ALTER\s+TABLE\s+public\.veiculos\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+bloqueador_instalado\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE;/i,
      "Migração deve adicionar bloqueador_instalado em veiculos",
    );
    assert.match(
      migrationSql,
      /ALTER\s+TABLE\s+public\.rastreadores\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+veiculo_id\s+UUID/i,
      "Migração deve adicionar veiculo_id em rastreadores",
    );

    assert.match(
      masterSql,
      /ALTER\s+TABLE\s+public\.instalacoes\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+bloqueador_instalado\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE;/i,
      "Script mestre deve adicionar bloqueador_instalado em instalacoes",
    );
    assert.match(
      masterSql,
      /ALTER\s+TABLE\s+public\.veiculos\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+bloqueador_instalado\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE;/i,
      "Script mestre deve adicionar bloqueador_instalado em veiculos",
    );
    assert.match(
      masterSql,
      /ALTER\s+TABLE\s+public\.rastreadores\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+veiculo_id\s+UUID/i,
      "Script mestre deve adicionar veiculo_id em rastreadores",
    );
  });
});
