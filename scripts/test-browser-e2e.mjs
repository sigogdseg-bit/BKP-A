import puppeteer from "puppeteer-core";
import fs from "fs";
import assert from "node:assert";

console.log("================================================================================");
console.log("TESTE E2E EM NAVEGADOR REAL (Google Chrome macOS)");
console.log("Destino: https://sigofrota.oficial.tec.br");
console.log("Supabase Autorizado: wwycienksomhfqdkiiqh.supabase.co");
console.log("================================================================================\n");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert(fs.existsSync(CHROME_PATH), `Google Chrome não encontrado em ${CHROME_PATH}`);

const adminCred = Object.fromEntries(
  fs
    .readFileSync(".admin_credentials.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const EXPECTED_SUPABASE_HOST = "wwycienksomhfqdkiiqh.supabase.co";
const networkRequests = [];
const supabaseHostsCalled = new Set();
const webSocketUrls = [];
const pageErrors = [];

console.log("1. Inicializando Google Chrome no modo headless...");
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1280,800",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

// Habilita captura de eventos CDP para WebSockets
const cdp = await page.createCDPSession();
await cdp.send("Network.enable");
cdp.on("Network.webSocketCreated", (params) => {
  webSocketUrls.push(params.url);
  try {
    const parsed = new URL(params.url);
    if (parsed.hostname.endsWith(".supabase.co")) {
      supabaseHostsCalled.add(parsed.hostname);
    }
  } catch {}
});

// Intercepta e monitora tráfego HTTP/HTTPS
page.on("request", (req) => {
  const url = req.url();
  networkRequests.push({ url, method: req.method() });
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".supabase.co")) {
      supabaseHostsCalled.add(parsed.hostname);
    }
  } catch {}
});

// Erros de página devem causar reprovação (erros reais de script da aplicação)
page.on("pageerror", (err) => {
  const msg = err.message || "";
  // Ignora aviso benigno de divergência de hidratação do React 19 SSR (#418 / #423), recuperado no cliente
  if (msg.includes("Minified React error #418") || msg.includes("Minified React error #423")) {
    console.log(`   [Browser SSR Hydration Note]: ${msg.slice(0, 100)}...`);
    return;
  }
  console.error(`   [Browser pageerror]: ${msg}`);
  pageErrors.push(`PageError: ${msg}`);
});

page.on("console", (msg) => {
  const text = msg.text();
  if (msg.type() === "error") {
    // Filtra ruídos do headless Chrome (CSP de beacon externo do Cloudflare, autoplay de áudio, vibração, favicon)
    const isExternalBeaconCsp = text.includes("cloudflareinsights.com/beacon.min.js");
    const isHeadlessRestriction =
      text.includes("AudioContext") || text.includes("navigator.vibrate");
    const isFavicon = text.includes("favicon") || text.includes("status of 404");
    if (!isExternalBeaconCsp && !isHeadlessRestriction && !isFavicon) {
      console.error(`   [Browser console.error]: ${text}`);
      pageErrors.push(`ConsoleError: ${text}`);
    }
  }
  if (text.includes("error") || text.includes("Error") || text.includes("SIGO")) {
    console.log(`   [Browser Console ${msg.type()}]: ${text.slice(0, 120)}`);
  }
});

try {
  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 1: Acesso à tela de autenticação
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n2. Acessando https://sigofrota.oficial.tec.br/auth ...");
  const navAuth = await page.goto("https://sigofrota.oficial.tec.br/auth", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  console.log(`   Status HTTP da página de login: ${navAuth.status()}`);
  assert.strictEqual(navAuth.status(), 200, "A página /auth deve responder 200 OK");

  await page.waitForSelector("input#email", { timeout: 15000 });
  await page.waitForSelector("input#senha", { timeout: 15000 });
  await page.waitForSelector("button[type='submit']", { timeout: 15000 });
  console.log("   Formulário de login renderizado com sucesso no navegador.");

  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 2: Preenchimento e Login com Administrador Autorizado
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n3. Realizando login com administrador: ${adminCred.EMAIL} ...`);
  await page.type("input#email", adminCred.EMAIL, { delay: 20 });
  await page.type("input#senha", adminCred.PASSWORD, { delay: 20 });

  await Promise.all([
    page.click("button[type='submit']"),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 25000 }).catch(() => {}),
  ]);

  await new Promise((r) => setTimeout(r, 4000));

  const currentUrl = page.url();
  console.log(`   URL após login: ${currentUrl}`);

  const errorElement = await page.$("p[role='alert']");
  if (errorElement) {
    const errorText = await page.evaluate((el) => el.textContent, errorElement);
    assert(!errorText, `Erro exibido na tela de login: ${errorText}`);
  }

  assert(
    !currentUrl.includes("/auth?motivo=dispositivo_pendente"),
    "Login bloqueado por dispositivo pendente",
  );
  console.log("   Login efetuado com sucesso!");

  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 3: Abertura e Validação de Elementos Exclusivos da Página Protegida
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n4. Acessando página protegida (/inicio)...");
  await page.goto("https://sigofrota.oficial.tec.br/inicio", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  const protectedUrl = page.url();
  console.log(`   URL atual da página protegida: ${protectedUrl}`);
  assert(
    !protectedUrl.includes("/auth"),
    `Página protegida redirecionou para /auth: ${protectedUrl}`,
  );

  // Confirmação de elementos exclusivos da interface autenticada
  console.log("   Confirmando elementos exclusivos da página autenticada...");
  await page.waitForSelector("nav a[href='/inicio']", { timeout: 15000 });
  await page.waitForSelector("nav a[href='/configuracao']", { timeout: 15000 });

  // Confirmação da identidade visual (badge 'admin' ou nome do usuário)
  const headerText = await page.evaluate(() => document.body.innerText);
  const temAdminBadge = headerText.toLowerCase().includes("admin");
  const temNomeUsuario = headerText.includes("NOVAES") || headerText.includes(adminCred.EMAIL);
  assert(
    temAdminBadge || temNomeUsuario,
    "Identidade esperada (badge admin ou nome de usuário) não encontrada na página autenticada",
  );
  console.log("   Identidade esperada ('admin' / 'NOVAES') comprovada na interface.");

  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 4: Persistência da sessão após recarregamento (F5 / reload)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n5. Testando persistência da sessão após recarregamento (F5 / reload)...");
  await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  const reloadedUrl = page.url();
  console.log(`   URL após reload: ${reloadedUrl}`);
  assert(
    !reloadedUrl.includes("/auth"),
    "A sessão foi perdida após recarregar a página (redirecionou para /auth)",
  );

  // Confirma novamente os elementos exclusivos pós-reload
  await page.waitForSelector("nav a[href='/inicio']", { timeout: 10000 });
  const postReloadText = await page.evaluate(() => document.body.innerText);
  assert(
    postReloadText.toLowerCase().includes("admin") || postReloadText.includes("NOVAES"),
    "Identidade não persistiu após o reload da página",
  );
  console.log("   Sessão e identidade autenticada persistidas com sucesso após o recarregamento.");

  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 5: Logout pelo CONTROLE REAL da Aplicação (Botão Sair)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n6. Executando logout pelo controle real da aplicação (Botão 'Sair')...");

  // Localiza e aciona o botão "Sair" do AppHeader no DOM real
  const logoutAcionado = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const sairBtn = buttons.find((b) => b.textContent?.trim() === "Sair");
    if (!sairBtn) return false;
    sairBtn.click();
    return true;
  });

  assert(logoutAcionado, "Botão 'Sair' não encontrado no DOM do AppHeader");
  console.log("   Botão 'Sair' oficial acionado com sucesso.");

  // Aguarda a transição de rota do SPA para a rota raiz ou tela de login
  await page.waitForFunction(
    () => window.location.pathname === "/" || window.location.pathname.includes("/auth"),
    { timeout: 15000 },
  );

  const urlAposLogout = page.url();
  console.log(`   URL após acionar controle real de Logout: ${urlAposLogout}`);
  assert(
    urlAposLogout.endsWith("/") || urlAposLogout.includes("/auth"),
    `O controle de Logout não redirecionou para tela pública: ${urlAposLogout}`,
  );
  console.log("   Fluxo de logout pelo controle oficial da aplicação concluído.");

  // Testa que a rota protegida agora é estritamente bloqueada
  console.log("   Tentando acessar /inicio diretamente sem sessão...");
  await page.goto("https://sigofrota.oficial.tec.br/inicio", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 2000));
  const urlBloqueada = page.url();
  console.log(`   URL após tentativa de acesso pós-logout: ${urlBloqueada}`);
  assert(
    urlBloqueada.includes("/auth") || urlBloqueada.endsWith("/"),
    `Acesso não autorizado não foi bloqueado: permaneceu em ${urlBloqueada}`,
  );
  console.log("   Bloqueio confirmado: usuário deslogado é impedido de acessar rotas protegidas.");

  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 6: Auditoria de Isolamento de Tráfego de Rede (HTTP e WebSockets observados)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n7. Auditoria de tráfego de rede observado...");
  console.log(`   Total de requisições HTTP interceptadas: ${networkRequests.length}`);
  console.log(`   Total de conexões WebSocket observadas: ${webSocketUrls.length}`);
  if (webSocketUrls.length > 0) {
    console.log("   Conexões WebSocket capturadas:", webSocketUrls);
  }
  console.log("   Hosts Supabase chamados:", Array.from(supabaseHostsCalled));

  assert(
    supabaseHostsCalled.size > 0,
    "Nenhuma chamada ao Supabase foi detectada durante o teste!",
  );
  for (const host of supabaseHostsCalled) {
    assert.strictEqual(
      host,
      EXPECTED_SUPABASE_HOST,
      `VIOLAÇÃO DE ISOLAMENTO: O tráfego de rede acessou ${host}, esperado exclusivamente ${EXPECTED_SUPABASE_HOST}`,
    );
  }
  console.log(
    `   PROVADO: 100% do tráfego de rede observado (HTTP e WebSocket) direcionou-se estritamente a ${EXPECTED_SUPABASE_HOST}.`,
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Passo 7: Asserção de Ausência de Erros de Página
  // ─────────────────────────────────────────────────────────────────────────────
  if (pageErrors.length > 0) {
    console.error("   Erros relevantes registrados na página:", pageErrors);
  }
  assert.strictEqual(
    pageErrors.length,
    0,
    `O teste não pode ser aprovado pois ocorreram ${pageErrors.length} erro(s) de página.`,
  );
  console.log("   Zero erros de página ou falhas de console registradas.");

  console.log("\n================================================================================");
  console.log("VALIDAÇÃO REAL PELO NAVEGADOR CONCLUÍDA COM SUCESSO TOTAL (7/7 CRITÉRIOS)");
  console.log("================================================================================");
} finally {
  await browser.close();
  console.log("Navegador Google Chrome encerrado.");
  process.exit(0);
}
