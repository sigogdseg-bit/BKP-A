import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Rota Segura de Clientes e Blindagem Anti-Recursão RLS", () => {
  it("1. O servidor (src/server.ts) deve conter o handler handleApiClientes interceptando /api/clientes", () => {
    const serverPath = path.join(process.cwd(), "src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      serverContent.includes("async function handleApiClientes"),
      "handleApiClientes deve estar declarado em src/server.ts",
    );
    assert.ok(
      serverContent.includes(
        'url.pathname !== "/api/clientes" && url.pathname !== "/api/clientes/listar"',
      ),
      "handleApiClientes deve interceptar /api/clientes e /api/clientes/listar",
    );
    assert.ok(
      serverContent.includes("const clientesResponse = await handleApiClientes(request, env);"),
      "O roteador principal deve invocar handleApiClientes",
    );
    assert.ok(
      serverContent.includes("getSupabaseServerParams(env)"),
      "handleApiClientes deve utilizar Service Role para blindagem contra recursão RLS",
    );
  });

  it("2. O serviço clienteService.ts deve priorizar /api/clientes com Service Role antes do fallback direto", () => {
    const servicePath = path.join(
      process.cwd(),
      "src/features/clientes/services/clienteService.ts",
    );
    const serviceContent = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      serviceContent.includes('fetch("/api/clientes"'),
      "carregarClientes deve chamar /api/clientes para evitar erro 42P17 de recursão RLS",
    );
    assert.ok(
      serviceContent.includes("normalizarClienteRetorno"),
      "carregarClientes deve normalizar o retorno da rota /api/clientes",
    );
  });

  it("3. As regras de isolamento em handleApiClientes devem respeitar perfis de acesso", () => {
    const serverPath = path.join(process.cwd(), "src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      serverContent.includes('"superadmin"') &&
        serverContent.includes('"adm"') &&
        serverContent.includes('"operador"') &&
        serverContent.includes('"financeiro"'),
      "handleApiClientes deve permitir superadmin, adm, operador e financeiro",
    );
    assert.ok(
      serverContent.includes('query = query.eq("revendedor_id", userData.user.id);') &&
        serverContent.includes('query = query.eq("vendedor_id", userData.user.id);'),
      "handleApiClientes deve filtrar revendedor_id e vendedor_id isoladamente",
    );
  });
});
