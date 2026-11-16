import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

describe("HUNTER-GUARDIAN — Correção de Recursão RLS de 'instalacoes' e Endpoint Seguro de Chips M2M", () => {
  it("1. O servidor (src/server.ts) deve conter o handler handleApiEstoque interceptando /api/estoque/chip", () => {
    const serverPath = path.join(ROOT_DIR, "src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      serverContent.includes("async function handleApiEstoque"),
      "src/server.ts deve declarar a função handleApiEstoque",
    );
    assert.ok(
      serverContent.includes('url.pathname.startsWith("/api/estoque")'),
      "handleApiEstoque deve interceptar a rota /api/estoque",
    );
    assert.ok(
      serverContent.includes('url.pathname === "/api/estoque/chip" && request.method === "POST"'),
      "handleApiEstoque deve suportar POST /api/estoque/chip",
    );
    assert.ok(
      serverContent.includes('url.pathname === "/api/estoque/chip" && request.method === "DELETE"'),
      "handleApiEstoque deve suportar DELETE /api/estoque/chip",
    );
  });

  it("2. O serviço rastreadorChipService.ts deve priorizar /api/estoque/chip com Service Role antes do fallback de tabela", () => {
    const servicePath = path.join(
      ROOT_DIR,
      "src/features/estoque/services/rastreadorChipService.ts",
    );
    const serviceContent = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      serviceContent.includes('fetch("/api/estoque/chip"'),
      "cadastrarChipAvulsoEstoque deve chamar /api/estoque/chip para evitar recursão RLS",
    );
    assert.ok(
      serviceContent.includes("fetch(`/api/estoque/chip?id="),
      "excluirChipAvulsoEstoque deve chamar /api/estoque/chip com método DELETE",
    );
  });

  it("3. O script de migração SQL deve quebrar o ciclo de recursão RLS com funções SECURITY DEFINER", () => {
    const migPath = path.join(
      ROOT_DIR,
      "supabase/migrations/20261116124500_hunter_fix_rls_recursao_instalacoes_e_chips.sql",
    );
    const sqlContent = fs.readFileSync(migPath, "utf-8");

    assert.ok(
      sqlContent.includes("check_instalacao_pertence_cliente"),
      "Migração deve criar helper SECURITY DEFINER check_instalacao_pertence_cliente",
    );
    assert.ok(
      sqlContent.includes("check_instalador_possui_ordem_cliente"),
      "Migração deve criar helper SECURITY DEFINER check_instalador_possui_ordem_cliente",
    );
    assert.ok(
      sqlContent.includes("cadastrar_chip_avulso_estoque"),
      "Migração deve criar RPC SECURITY DEFINER cadastrar_chip_avulso_estoque",
    );
  });
});
