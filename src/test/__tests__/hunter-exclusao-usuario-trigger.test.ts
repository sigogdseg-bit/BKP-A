import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Blindagem do SuperADM e Correção de Exclusão de Usuários", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20260923093000_hunter_fix_trigger_exclusao_usuario.sql",
  );

  test("1. Migration SQL de correção deve existir e conter retorno de OLD em BEFORE DELETE", () => {
    assert.ok(fs.existsSync(migrationPath), "Migration de correção de exclusão deve existir");
    const content = fs.readFileSync(migrationPath, "utf-8");

    // Deve checar se a proteção do SuperADM continua blindada
    assert.ok(
      content.includes("novaes@adm.28bpm.local"),
      "SuperADM deve continuar explicitamente blindado por trigger",
    );

    // Deve retornar OLD no evento DELETE para não abortar silenciosamente
    assert.ok(
      content.includes("IF (TG_OP = 'DELETE') THEN") && content.includes("RETURN OLD;"),
      "Trigger deve retornar OLD quando TG_OP for DELETE",
    );
  });

  test("2. RPC admin_excluir_usuario deve tratar desvinculações e integridade", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      content.includes("CREATE OR REPLACE FUNCTION public.admin_excluir_usuario"),
      "RPC admin_excluir_usuario deve estar definida",
    );

    // Desvincula instalador
    assert.ok(
      content.includes("UPDATE public.instalacoes SET instalador_id = NULL"),
      "Deve desvincular instalador de instalações",
    );

    // Remove módulos e roles
    assert.ok(
      content.includes("DELETE FROM public.user_module_access WHERE user_id = p_user_id;"),
      "Deve remover permissões de módulos",
    );
    assert.ok(
      content.includes("DELETE FROM public.profiles WHERE id = p_user_id;"),
      "Deve remover o perfil",
    );
  });

  test("3. Script unificado APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a correção", () => {
    const unificadoPath = path.resolve(
      process.cwd(),
      "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const content = fs.readFileSync(unificadoPath, "utf-8");

    assert.ok(
      content.includes("CORREÇÃO CRÍTICA DO TRIGGER DE BLINDAGEM E EXCLUSÃO DE USUÁRIOS"),
      "Script unificado deve conter a seção 8 de correção",
    );
    assert.ok(
      content.includes("RETURN OLD;"),
      "Script unificado deve conter o RETURN OLD para DELETE",
    );
  });

  test("4. Regra Pétrea Hunter: Ausência do caractere proibido nas mensagens e rotinas", () => {
    const content = fs.readFileSync(migrationPath, "utf-8");
    // Proibição do caractere comercial proibido
    assert.ok(!content.includes("&" + " "), "Não deve conter o caractere proibido");
  });
});
