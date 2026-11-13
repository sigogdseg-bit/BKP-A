import { describe, it } from "node:test";
import assert from "node:assert/strict";
import serverHandler from "@/server";
import { getSupabaseClientConfig } from "@/integrations/supabase/client";

describe("Hunter — Auditoria de Integridade de Invocação de Chaves e Rotas da API", () => {
  it("getSupabaseClientConfig deve sempre retornar URL e Key válidas e não-vazias", () => {
    const config = getSupabaseClientConfig();
    assert.ok(config.url, "URL do Supabase não pode ser vazia");
    assert.ok(config.url.startsWith("https://"), "URL do Supabase deve ser https");
    assert.ok(config.key, "Chave do Supabase não pode ser vazia");
    assert.ok(config.key.length > 20, "Chave do Supabase deve ser válida");
    assert.notStrictEqual(
      config.url,
      "https://auth.sigoguardiao.local",
      "Não deve cair em domínio fictício",
    );
    assert.notStrictEqual(
      config.key,
      "sb_publishable_anon_token_env_required",
      "Não deve cair em token fictício",
    );
  });

  it("Rotas de Relatório Gerencial: GET e POST /api/relatorios/gerencial/config devem responder com segurança", async () => {
    // 1. Sem autenticação deve retornar 401
    const reqSemAuth = new Request(
      "https://sigoguardiao.oficial.tec.br/api/relatorios/gerencial/config",
      {
        method: "GET",
      },
    );
    const resSemAuth = await serverHandler.fetch(reqSemAuth, {}, {});
    assert.strictEqual(resSemAuth.status, 401, "Requisição sem token deve retornar 401");

    // 2. Com CRON_SECRET válido deve permitir acesso às rotas
    const reqComCron = new Request(
      "https://sigoguardiao.oficial.tec.br/api/relatorios/gerencial/config",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer hunter-cron-jammer-2026",
        },
      },
    );
    const resComCron = await serverHandler.fetch(reqComCron, {}, {});
    assert.strictEqual(
      resComCron.status,
      200,
      "Requisição com credencial autorizada deve retornar 200",
    );
    const json = await resComCron.json();
    assert.strictEqual(json.sucesso, true);

    // 3. Disparo manual via rota /api/relatorios/metricas-diarias/enviar (com dryRun para não contactar gateway real em testes)
    const reqDisparo = new Request(
      "https://sigoguardiao.oficial.tec.br/api/relatorios/metricas-diarias/enviar",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer hunter-cron-jammer-2026",
        },
        body: JSON.stringify({ manual: true, dryRun: true }),
      },
    );
    const resDisparo = await serverHandler.fetch(reqDisparo, {}, {});
    assert.strictEqual(
      resDisparo.status,
      200,
      "Disparo com credencial autorizada deve retornar 200",
    );
    const jsonDisparo = await resDisparo.json();
    assert.strictEqual(jsonDisparo.sucesso, true);
  });

  it("Rota /api/convite/validar deve validar ausência de token sem estourar 500", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/convite/validar", {
      method: "GET",
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.valido, false);
  });

  it("Rota /api/cliente/solicitar-veiculo deve responder validação sem quebra de chaves", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/cliente/solicitar-veiculo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(
      json.message.includes("Cadastro de cliente") || json.message.includes("não localizado"),
    );
  });

  it("Rota /api/propostas/listar deve responder adequadamente com 200", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/propostas/listar", {
      method: "GET",
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.ok("propostas" in json || "sucesso" in json);
  });

  it("Rota /api/push/status deve retornar status das chaves VAPID sem erro", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/push/status", {
      method: "GET",
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.ativo, true);
    assert.ok(json.vapidPublicKey);
  });

  it("Rota /api/chat/contatos deve barrar requisição anônima com 401 sem quebra de runtime", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/chat/contatos", {
      method: "GET",
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 401);
  });

  it("Rota /api/ocr-cnh deve responder adequadamente sem erro de ausência de chaves de IA", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/ocr-cnh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("base64") || json.error.includes("não fornecido"));
  });

  it("Rota /api/ocr-nf deve responder adequadamente sem erro de ausência de chaves de IA", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/ocr-nf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("base64") || json.error.includes("não fornecido"));
  });

  it("Rota /api/upload-nf deve validar payload sem falha de conexão de chaves", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/upload-nf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes("não fornecidos"));
  });

  it("Rota /api/compartilhamento/acessos deve validar parâmetros sem crash", async () => {
    const req = new Request("https://sigoguardiao.oficial.tec.br/api/compartilhamento/acessos", {
      method: "GET",
    });
    const res = await serverHandler.fetch(req, {}, {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.sucesso, false);
  });
});
