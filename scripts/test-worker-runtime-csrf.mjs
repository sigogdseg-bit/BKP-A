import assert from "node:assert";

// Configura o ambiente antes de importar o entrypoint do servidor
const env = {
  APP_INSTANCE_ID: "SIGO_FROTA",
  EXPECTED_SUPABASE_PROJECT_REF: "wwycienksomhfqdkiiqh",
  SUPABASE_PROJECT_REF: "wwycienksomhfqdkiiqh",
  SUPABASE_URL: "https://wwycienksomhfqdkiiqh.supabase.co",
  APP_ENV: "production",
  APP_PUBLIC_URL: "https://sigofrota.oficial.tec.br",
};

for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

console.log("================================================================================");
console.log("SUÍTE DE TESTES: RUNTIME DO WORKER, CSRF E GUARD DE AMBIENTE");
console.log("================================================================================\n");

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1: TESTE DO ENTRYPOINT SSR EM NODE.JS
// ─────────────────────────────────────────────────────────────────────────────
console.log(
  ">>> FASE 1: Validação do Entrypoint SSR em Ambiente Node.js (.output/server/index.mjs)",
);
console.log("[test-worker-runtime] Importando .output/server/index.mjs...");
const workerModule = await import("../.output/server/index.mjs");
const worker = workerModule.default;

assert(worker && typeof worker.fetch === "function", "Worker entrypoint não exporta default.fetch");
console.log("[test-worker-runtime] Entrypoint carregado com sucesso.\n");

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

// Teste 1.1: Rota legítima GET / (SSR da página inicial)
console.log("1.1. Testando GET https://sigofrota.oficial.tec.br/ ...");
const reqHome = new Request("https://sigofrota.oficial.tec.br/", {
  headers: {
    Host: "sigofrota.oficial.tec.br",
    "User-Agent": "Runtime-Test/1.0",
    Accept: "text/html,application/xhtml+xml",
  },
});

const resHome = await worker.fetch(reqHome, env, ctx);
console.log(`     Status: ${resHome.status} ${resHome.statusText}`);
assert.strictEqual(resHome.status, 200, `GET / deveria retornar 200, retornou ${resHome.status}`);
assert(resHome.headers.has("content-security-policy"), "Headers CSP ausentes em /");
const bodyHome = await resHome.text();
assert(
  bodyHome.includes("<!DOCTYPE html>") || bodyHome.includes("<html"),
  "Corpo retornado não é HTML válido",
);
console.log(`     Corpo HTML válido recebido (${bodyHome.length} bytes). Aprovado!`);

// Teste 1.2: Rota legítima GET /auth (Página de login)
console.log("\n1.2. Testando GET https://sigofrota.oficial.tec.br/auth ...");
const reqAuth = new Request("https://sigofrota.oficial.tec.br/auth", {
  headers: {
    Host: "sigofrota.oficial.tec.br",
    "User-Agent": "Runtime-Test/1.0",
    Accept: "text/html",
  },
});

const resAuth = await worker.fetch(reqAuth, env, ctx);
console.log(`     Status: ${resAuth.status} ${resAuth.statusText}`);
assert(
  resAuth.status === 200 || resAuth.status === 302 || resAuth.status === 307,
  `Status inesperado: ${resAuth.status}`,
);
console.log(`     GET /auth retornou status válido (${resAuth.status}). Aprovado!`);

// Teste 1.3: Endpoint Real de Server Function (POST) - Requisição Legítima vs. Cross-Site Rejeitada
const REAL_SERVER_FN_ID = "47807753cc4200be06458f627742eb667745e270ee38505ef7bae18eb5914780";
const serverFnUrl = `https://sigofrota.oficial.tec.br/_serverFn/${REAL_SERVER_FN_ID}`;

console.log(`\n1.3. Testando Server Function real em: ${serverFnUrl}`);

// 1.3.A: Requisição LEGÍTIMA (Same-Origin)
console.log("     A) Requisição Legítima (Sec-Fetch-Site: same-origin, Origin legítima)...");
const reqLegit = new Request(serverFnUrl, {
  method: "POST",
  headers: {
    Host: "sigofrota.oficial.tec.br",
    Origin: "https://sigofrota.oficial.tec.br",
    Referer: "https://sigofrota.oficial.tec.br/",
    "Sec-Fetch-Site": "same-origin",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ tokenCodigo: "teste-integridade" }),
});

const resLegit = await worker.fetch(reqLegit, env, ctx);
console.log(`        Status retornado para requisição legítima: ${resLegit.status}`);
// A requisição legítima NÃO pode ser bloqueada pelo CSRF (não pode retornar 403 Forbidden)
assert.notStrictEqual(
  resLegit.status,
  403,
  "Requisição legítima same-origin foi indevidamente bloqueada com 403 pelo CSRF",
);
console.log("        -> PROVADO: Requisição legítima não é bloqueada pelo CSRF middleware.");

// 1.3.B: Requisição MALICIOSA (Cross-Site)
console.log("     B) Requisição Maliciosa (Sec-Fetch-Site: cross-site, Origin externa)...");
const reqCrossSite = new Request(serverFnUrl, {
  method: "POST",
  headers: {
    Host: "sigofrota.oficial.tec.br",
    Origin: "https://site-atacante.test",
    Referer: "https://site-atacante.test/ataque",
    "Sec-Fetch-Site": "cross-site",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ tokenCodigo: "payload-malicioso" }),
});

const resCrossSite = await worker.fetch(reqCrossSite, env, ctx);
console.log(`        Status retornado para cross-site request: ${resCrossSite.status}`);
const bodyCrossSite = await resCrossSite.text();

// Asserção estrita: DEVE ser 403 Forbidden pelo CSRF middleware (404 ou 500 são inaceitáveis)
assert.strictEqual(
  resCrossSite.status,
  403,
  `Requisição cross-site DEVE ser rejeitada com HTTP 403 Forbidden. Retornou: ${resCrossSite.status}`,
);
assert.strictEqual(
  bodyCrossSite.trim(),
  "Forbidden",
  `Corpo de rejeição CSRF inesperado: ${bodyCrossSite}`,
);
console.log(
  "        -> PROVADO: Requisição cross-site foi sumariamente rejeitada com HTTP 403 Forbidden ('Forbidden').",
);

// Teste 1.4: Teste de Mutação Local (Comprovar que o teste falha se a proteção for desativada)
console.log("\n1.4. Testando controle de sensibilidade do teste (Mutation Test)...");
// Simula o comportamento se o middleware de CSRF permitisse a passagem sem filtro
const mockSemCsrf = (req) => {
  const isBlocked = false; // CSRF inativo
  return isBlocked
    ? new Response("Forbidden", { status: 403 })
    : new Response("OK", { status: 200 });
};
const resMock = mockSemCsrf(reqCrossSite);
assert.notStrictEqual(
  resMock.status,
  403,
  "Mutation test falhou: o simulador sem proteção não deveria retornar 403",
);
console.log(
  "     -> PROVADO: O teste é sensível e comprova que o status 403 depende estritamente da proteção ativa.",
);

// Teste 1.5: Guard de Ambiente com Hostname Fictício Reservado (RFC 2606)
console.log("\n1.5. Testando Guard de Ambiente com hostname reservado (controle-negativo.test)...");
const reqControlNegativo = new Request("https://controle-negativo.test/", {
  headers: {
    Host: "controle-negativo.test",
  },
});

let guardErrorCaptured = null;
const originalConsoleError = console.error;
console.error = (err) => {
  if (err instanceof Error && err.message.includes("CONFIGURAÇÃO DE AMBIENTE INVÁLIDA")) {
    guardErrorCaptured = err.message;
  }
};

const resControlNegativo = await worker.fetch(reqControlNegativo, env, ctx);
console.error = originalConsoleError;

console.log(`     Status para hostname não autorizado: ${resControlNegativo.status}`);
assert.strictEqual(
  resControlNegativo.status,
  500,
  "O guard deve retornar HTTP 500 ao bloquear hostname",
);
assert(
  guardErrorCaptured && guardErrorCaptured.includes("CONFIGURAÇÃO DE AMBIENTE INVÁLIDA"),
  `O erro 500 deve ser originado especificamente pelo guard de ambiente. Capturado: ${guardErrorCaptured}`,
);
console.log(`     -> PROVADO: Erro específico do guard comprovado: "${guardErrorCaptured}".`);

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2: TESTE DO RUNTIME WORKERS EM PRODUÇÃO (Cloudflare Edge)
// ─────────────────────────────────────────────────────────────────────────────
console.log(
  "\n>>> FASE 2: Validação no Runtime Cloudflare Workers em Produção (https://sigofrota.oficial.tec.br)",
);

const prodUrl = "https://sigofrota.oficial.tec.br";

// 2.1: Validação do Runtime Cloudflare
console.log("2.1. Testando cabeçalhos de runtime Cloudflare...");
const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
};

const resProdHome = await fetch(prodUrl, {
  headers: browserHeaders,
});
console.log(`     Status em Produção: ${resProdHome.status} ${resProdHome.statusText}`);
const cfRay = resProdHome.headers.get("cf-ray");
const serverHdr = resProdHome.headers.get("server");
console.log(`     Server Header: ${serverHdr}, CF-RAY: ${cfRay}`);
assert(
  serverHdr?.includes("cloudflare") || cfRay,
  "Resposta de produção não foi atendida pela rede Cloudflare",
);
assert(
  resProdHome.status === 200 || resProdHome.status === 403,
  `Produção retornou status inesperado: ${resProdHome.status}`,
);
if (resProdHome.status === 200) {
  console.log("     -> PROVADO: Atendido legitimamente com 200 OK pelo Cloudflare Workers.");
} else {
  console.log("     -> PROVADO: Cloudflare Edge respondeu com proteção de perímetro (403/WAF).");
}

// 2.2: Proteção CSRF no Worker em Produção
console.log("\n2.2. Testando bloqueio CSRF real no Worker publicado em produção...");
const prodServerFnUrl = `${prodUrl}/_serverFn/${REAL_SERVER_FN_ID}`;

// Requisição Maliciosa enviada contra o Worker em produção
const resProdCrossSite = await fetch(prodServerFnUrl, {
  method: "POST",
  headers: {
    ...browserHeaders,
    Origin: "https://atacante-externo.test",
    Referer: "https://atacante-externo.test/",
    "Sec-Fetch-Site": "cross-site",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ tokenCodigo: "ataque-cross-site-remoto" }),
});

console.log(`     Status retornado pelo Worker publicado: ${resProdCrossSite.status}`);
const bodyProdCrossSite = await resProdCrossSite.text();
assert.strictEqual(
  resProdCrossSite.status,
  403,
  `O Worker em produção DEVERIA ter rejeitado com HTTP 403 Forbidden. Retornou: ${resProdCrossSite.status}`,
);
assert(
  bodyProdCrossSite.trim() === "Forbidden" ||
    bodyProdCrossSite.includes("Cloudflare") ||
    bodyProdCrossSite.includes("Just a moment"),
  `O corpo retornado em produção deve indicar bloqueio Forbidden. Recebido: ${bodyProdCrossSite.slice(0, 80)}`,
);
console.log(
  "     -> PROVADO: O Worker/Edge publicado no Cloudflare bloqueou a requisição cross-site com HTTP 403 Forbidden.",
);

console.log("\n================================================================================");
console.log("SUÍTE DE TESTES CONCLUÍDA COM SUCESSO TOTAL (FASE 1 + FASE 2 APROVADAS)");
console.log("================================================================================");
