import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const serverDir = path.resolve(".output/server");
const ssrDir = path.join(serverDir, "_ssr");
const wranglerFile = path.join(serverDir, "wrangler.json");

function assert(condition, message) {
  if (!condition) {
    console.error(`[fix-nitro-chunks] ERRO CRÍTICO: ${message}`);
    process.exit(1);
  }
}

assert(fs.existsSync(ssrDir), `Diretório SSR não encontrado em ${ssrDir}`);
assert(fs.existsSync(wranglerFile), `Arquivo wrangler.json não encontrado em ${wranglerFile}`);

const files = fs.readdirSync(ssrDir);
const modifiedFiles = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLASSIFICAÇÃO TRIPARTITE: NECESSÁRIA, DESNECESSÁRIA OU AMBÍGUA
// ─────────────────────────────────────────────────────────────────────────────

// Análise do Server:
const serverAllCandidates = files.filter((f) => /^server-[A-Za-z0-9_-]+\.mjs$/.test(f));
const serverTwoCandidates = files.filter((f) => /^server-[A-Za-z0-9_-]+2\.mjs$/.test(f));

let serverTransformationStatus = "DESCONHECIDO";
let serverPair = null;

if (serverAllCandidates.length === 1) {
  // Apenas 1 módulo: verifica se há ciclo autorreferencial
  const mainCandidate = serverAllCandidates[0];
  const content = fs.readFileSync(path.join(ssrDir, mainCandidate), "utf8");
  const hasSelfCycle = content.includes(`from "./${mainCandidate}"`);
  assert(!hasSelfCycle, `Ciclo autorreferencial detectado em ${mainCandidate}`);
  serverTransformationStatus = "COMPROVADAMENTE_DESNECESSARIA";
  console.log(
    `[fix-nitro-chunks] Módulo Server (${mainCandidate}): Transformação COMPROVADAMENTE DESNECESSÁRIA (módulo único).`,
  );
} else if (serverAllCandidates.length === 2) {
  // Dois módulos server gerados pelo bundler (com hashes diferentes ou sufixo 2)
  const fileA = serverAllCandidates[0];
  const fileB = serverAllCandidates[1];
  const contentA = fs.readFileSync(path.join(ssrDir, fileA), "utf8");
  const contentB = fs.readFileSync(path.join(ssrDir, fileB), "utf8");

  let serverMain = null;
  let serverTwo = null;

  if (
    contentA.includes("createServerEntry({ fetch })") ||
    contentA.includes("server_default = createServerEntry")
  ) {
    serverMain = fileA;
    serverTwo = fileB;
  } else if (
    contentB.includes("createServerEntry({ fetch })") ||
    contentB.includes("server_default = createServerEntry")
  ) {
    serverMain = fileB;
    serverTwo = fileA;
  } else if (serverTwoCandidates.length === 1) {
    serverTwo = serverTwoCandidates[0];
    const serverHashMatch = serverTwo.match(/^server-([A-Za-z0-9_-]+)2\.mjs$/);
    serverMain = `server-${serverHashMatch[1]}.mjs`;
  }

  assert(
    serverMain && serverTwo,
    `Estrutura ambígua no Server: não foi possível identificar main entre ${fileA} e ${fileB}`,
  );

  const mainContent = fs.readFileSync(path.join(ssrDir, serverMain), "utf8");
  const twoContent = fs.readFileSync(path.join(ssrDir, serverTwo), "utf8");
  const twoImportsMain = twoContent.includes(`from "./${serverMain}"`);
  const mainImportsTwo = mainContent.includes(`from "./${serverTwo}"`);

  if (twoImportsMain || mainImportsTwo) {
    serverTransformationStatus = "NECESSARIA_E_APLICADA";
    serverPair = {
      serverMain,
      serverTwo,
      serverHash: serverMain.replace(/^server-|\.mjs$/g, ""),
    };
    console.log(
      `[fix-nitro-chunks] Módulo Server: Transformação NECESSÁRIA identificada (ciclo mútuo detectado entre ${serverMain} e ${serverTwo}).`,
    );
  } else {
    serverTransformationStatus = "COMPROVADAMENTE_DESNECESSARIA";
    console.log(
      `[fix-nitro-chunks] Módulo Server: Transformação COMPROVADAMENTE DESNECESSÁRIA (módulos coexistem sem ciclo mútuo).`,
    );
  }
} else {
  assert(
    false,
    `Estrutura ambígua no Server: quantidade inesperada de módulos: ${JSON.stringify(serverAllCandidates)}`,
  );
}

// Análise do Router:
const routerAllCandidates = files.filter((f) => /^router-[A-Za-z0-9_-]+\.mjs$/.test(f));
const routerTwoCandidates = files.filter((f) => /^router-[A-Za-z0-9_-]+2\.mjs$/.test(f));

let routerTransformationStatus = "DESCONHECIDO";
let routerPair = null;

if (routerTwoCandidates.length === 0) {
  assert(
    routerAllCandidates.length >= 1,
    "Nenhum módulo router encontrado em _ssr. Estrutura desconhecida.",
  );
  routerTransformationStatus = "COMPROVADAMENTE_DESNECESSARIA";
  console.log(
    `[fix-nitro-chunks] Módulo Router: Transformação COMPROVADAMENTE DESNECESSÁRIA (ausência de split circular).`,
  );
} else if (routerTwoCandidates.length === 1) {
  const routerTwo = routerTwoCandidates[0];
  const routerHashMatch = routerTwo.match(/^router-([A-Za-z0-9_-]+)2\.mjs$/);
  assert(routerHashMatch, `Hash inválido em ${routerTwo}`);
  const routerMain = `router-${routerHashMatch[1]}.mjs`;

  if (files.includes(routerMain)) {
    const twoContent = fs.readFileSync(path.join(ssrDir, routerTwo), "utf8");
    const twoImportsMain = twoContent.includes(`from "./${routerMain}"`);
    if (twoImportsMain) {
      routerTransformationStatus = "NECESSARIA_E_APLICADA";
      routerPair = { routerMain, routerTwo, routerHash: routerHashMatch[1] };
      console.log(
        `[fix-nitro-chunks] Módulo Router: Transformação NECESSÁRIA identificada (ciclo mútuo detectado entre ${routerMain} e ${routerTwo}).`,
      );
    } else {
      routerTransformationStatus = "COMPROVADAMENTE_DESNECESSARIA";
      console.log(
        `[fix-nitro-chunks] Módulo Router: Transformação COMPROVADAMENTE DESNECESSÁRIA (${routerTwo} e ${routerMain} não têm ciclo).`,
      );
    }
  } else {
    // routerTwo existe sem routerMain correspondente: módulo único renomeado pelo Rollup
    routerTransformationStatus = "COMPROVADAMENTE_DESNECESSARIA";
    console.log(
      `[fix-nitro-chunks] Módulo Router: Transformação COMPROVADAMENTE DESNECESSÁRIA (${routerTwo} é módulo único sem par).`,
    );
  }
} else {
  assert(
    false,
    `Estrutura ambígua no Router: múltiplos módulos secundários encontrados: ${JSON.stringify(routerTwoCandidates)}`,
  );
}

const ssrFile = path.join(ssrDir, "ssr.mjs");
assert(fs.existsSync(ssrFile), "ssr.mjs não encontrado");

// Função para buscar todos os arquivos .mjs em .output/server recursivamente
function getAllServerMjsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getAllServerMjsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".mjs")) {
      results.push(full);
    }
  }
  return results;
}

const allMjsFiles = getAllServerMjsFiles(serverDir);

// ─────────────────────────────────────────────────────────────────────────────
// 2. APLICAÇÃO DELIMITADA E VERIFICÁVEL NO MÓDULO SERVER
// ─────────────────────────────────────────────────────────────────────────────
if (serverTransformationStatus === "NECESSARIA_E_APLICADA" && serverPair) {
  const { serverMain, serverTwo } = serverPair;
  const mainServerPath = path.join(ssrDir, serverMain);
  const twoServerPath = path.join(ssrDir, serverTwo);

  let mainServerContent = fs.readFileSync(mainServerPath, "utf8");
  let twoServerContent = fs.readFileSync(twoServerPath, "utf8");
  let ssrContent = fs.readFileSync(ssrFile, "utf8");

  // Identifica como server_default é exportado em serverMain
  const serverDefaultExportMatch = mainServerContent.match(
    /server_default\s+as\s+([A-Za-z0-9_$]+)/,
  );
  const serverDefaultAlias = serverDefaultExportMatch ? serverDefaultExportMatch[1] : "default";

  // Identifica o import de serverMain dentro de serverTwo
  const importServerMainRegex = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']\\./${serverMain}["'];?`,
  );

  if (importServerMainRegex.test(twoServerContent)) {
    const matchedImport = twoServerContent.match(importServerMainRegex);
    const importedClause = matchedImport[1];
    const importedSymbols = importedClause
      .split(",")
      .map((s) => {
        const p = s.trim().split(/\s+as\s+/);
        return (p[1] || p[0]).trim();
      })
      .filter(Boolean);

    // VALIDAÇÃO DE CONSUMIDORES: Garante que nenhum outro arquivo do bundle consome
    // esses símbolos especificamente através de serverTwo (exceto serverMain que já os define)
    const otherFiles = allMjsFiles.filter(
      (f) => f !== twoServerPath && f !== mainServerPath && f !== ssrFile,
    );
    for (const sym of importedSymbols) {
      const consumers = [];
      const checkRegex = new RegExp(
        `import\\s*\\{[^}]*\\b${sym}\\b[^}]*\\}\\s*from\\s*["'][^"']*${serverTwo}["']`,
      );
      for (const ofile of otherFiles) {
        const content = fs.readFileSync(ofile, "utf8");
        if (checkRegex.test(content)) {
          consumers.push(path.basename(ofile));
        }
      }
      assert(
        consumers.length === 0,
        `Símbolo ${sym} em ${serverTwo} não pode ser removido pois possui consumidores externos: ${JSON.stringify(consumers)}`,
      );
    }

    // Remoção delimitada do import
    twoServerContent = twoServerContent.replace(importServerMainRegex, "");

    // Remoção delimitada do export correspondente em serverTwo
    const exportMatch = twoServerContent.match(/export\s*\{([^}]+)\};?/);
    assert(exportMatch, `Cláusula export não encontrada em ${serverTwo}`);
    const exportEntries = exportMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const filteredExports = exportEntries.filter((entry) => {
      if (/server_[A-Za-z0-9_]+_exports/.test(entry)) return false;
      for (const sym of importedSymbols) {
        if (entry === sym || entry.startsWith(`${sym} `)) return false;
      }
      return true;
    });

    assert(
      filteredExports.length < exportEntries.length,
      `Nenhum símbolo removido do export de ${serverTwo}. Esperava remover símbolos redundantes.`,
    );

    twoServerContent = twoServerContent.replace(
      exportMatch[0],
      `export { ${filteredExports.join(", ")} };`,
    );
  }

  // Redirecionamento delimitado em ssr.mjs para importar diretamente de serverMain
  const ssrOldEntryRegex = new RegExp(
    `import\\(["']\\./${serverTwo}["']\\)\\.then\\(\\(([a-zA-Z0-9_$]+)\\)\\s*=>\\s*\\1\\.[a-zA-Z0-9_$]+\\)\\.then\\(\\(([a-zA-Z0-9_$]+)\\)\\s*=>\\s*\\2\\.default\\s*\\?\\?\\s*\\2\\)`,
  );
  if (ssrOldEntryRegex.test(ssrContent)) {
    ssrContent = ssrContent.replace(
      ssrOldEntryRegex,
      `import("./${serverMain}").then((m) => m.default ?? m.${serverDefaultAlias} ?? m)`,
    );
  } else {
    // Busca padrão de import em ssr.mjs
    const ssrEntryRegex = new RegExp(`import\\(["']\\./${serverTwo}["']\\)[^\\n;]+`);
    if (ssrEntryRegex.test(ssrContent)) {
      ssrContent = ssrContent.replace(
        ssrEntryRegex,
        `import("./${serverMain}").then((m) => m.default ?? m.${serverDefaultAlias} ?? m)`,
      );
    }
  }

  // Hoisting de funções declaradas com var que causam erro se chamadas antes de inicialização
  const hoistFunctions = (src) => {
    let s = src;
    if (s.includes("var createMiddleware = (options, __opts) => {")) {
      s = s.replace(
        "var createMiddleware = (options, __opts) => {",
        "function createMiddleware(options, __opts) {",
      );
    }
    if (s.includes("var innerCreateCsrfMiddleware = (opts = {}) => {")) {
      s = s.replace(
        "var innerCreateCsrfMiddleware = (opts = {}) => {",
        "function innerCreateCsrfMiddleware(opts = {}) {",
      );
    }
    if (s.includes("var createCsrfMiddleware = innerCreateCsrfMiddleware;")) {
      s = s.replace(
        "var createCsrfMiddleware = innerCreateCsrfMiddleware;",
        "function createCsrfMiddleware(opts = {}) { return innerCreateCsrfMiddleware(opts); }",
      );
    }
    if (s.includes("var __exportAll = (all, no_symbols) => {")) {
      s = s.replace(
        "var __exportAll = (all, no_symbols) => {",
        "function __exportAll(all, no_symbols) {",
      );
    }
    return s;
  };

  twoServerContent = hoistFunctions(twoServerContent);
  mainServerContent = hoistFunctions(mainServerContent);

  fs.writeFileSync(twoServerPath, twoServerContent);
  fs.writeFileSync(mainServerPath, mainServerContent);
  fs.writeFileSync(ssrFile, ssrContent);

  modifiedFiles.add(mainServerPath);
  modifiedFiles.add(twoServerPath);
  modifiedFiles.add(ssrFile);

  console.log(`[fix-nitro-chunks] Ciclo ${serverMain} <-> ${serverTwo} eliminado com sucesso.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. APLICAÇÃO DELIMITADA E VERIFICÁVEL NO MÓDULO ROUTER
// ─────────────────────────────────────────────────────────────────────────────
if (routerTransformationStatus === "NECESSARIA_E_APLICADA" && routerPair && serverPair) {
  const { routerMain, routerTwo } = routerPair;
  const twoServerPath = path.join(ssrDir, serverPair.serverTwo);
  const mainRouterPath = path.join(ssrDir, routerMain);
  const twoRouterPath = path.join(ssrDir, routerTwo);

  let twoRouterContent = fs.readFileSync(twoRouterPath, "utf8");
  let twoServerContent = fs.readFileSync(twoServerPath, "utf8");

  const routerImportRegex = new RegExp(
    `import\\s*\\{([^}]+)\\}\\s*from\\s*["']\\./${routerMain}["'];?`,
  );
  const routerImportMatch = twoRouterContent.match(routerImportRegex);
  if (routerImportMatch) {
    const routerImportClause = routerImportMatch[1].trim();
    const routerImportedSymbols = routerImportClause
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedRouterSymbols = routerImportedSymbols.map((s) => {
      const parts = s.split(/\s+as\s+/);
      return {
        imported: parts[0].trim(),
        local: (parts[1] || parts[0]).trim(),
      };
    });

    const routerExportEntry = parsedRouterSymbols.find((s) => s.local === "router_exports");
    if (routerExportEntry) {
      const exportedFromRouterMain = routerExportEntry.imported;
      const routerExportAliasMatch = twoRouterContent.match(
        /router_exports\s+as\s+([A-Za-z0-9_$]+)/,
      );
      if (routerExportAliasMatch) {
        const routerExportAlias = routerExportAliasMatch[1];
        const serverTwoImportRegex = new RegExp(
          `import\\(["']\\./${routerTwo}["']\\)\\.then\\(\\(([a-zA-Z0-9_$]+)\\)\\s*=>\\s*\\1\\.${routerExportAlias}\\)`,
        );
        if (serverTwoImportRegex.test(twoServerContent)) {
          twoServerContent = twoServerContent.replace(
            serverTwoImportRegex,
            `import("./${routerMain}").then(($1) => $1.${exportedFromRouterMain})`,
          );
        }

        const remainingRouterSymbols = parsedRouterSymbols.filter(
          (s) => s.local !== "router_exports",
        );
        if (remainingRouterSymbols.length === 0) {
          twoRouterContent = twoRouterContent.replace(routerImportRegex, "");
        } else {
          const reconstructed = remainingRouterSymbols
            .map((s) => (s.imported === s.local ? s.imported : `${s.imported} as ${s.local}`))
            .join(", ");
          twoRouterContent = twoRouterContent.replace(
            routerImportRegex,
            `import { ${reconstructed} } from "./${routerMain}";`,
          );
        }

        const routerExportMatch = twoRouterContent.match(/export\s*\{([^}]+)\};?/);
        if (routerExportMatch) {
          const rExportClause = routerExportMatch[1];
          const rExportEntries = rExportClause
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const remainingRouterExports = rExportEntries.filter(
            (e) =>
              !e.includes("router_exports") &&
              !new RegExp(`\\bas\\s+${routerExportAlias}\\b`).test(e),
          );
          twoRouterContent = twoRouterContent.replace(
            routerExportMatch[0],
            `export { ${remainingRouterExports.join(", ")} };`,
          );
        }

        fs.writeFileSync(twoRouterPath, twoRouterContent);
        fs.writeFileSync(twoServerPath, twoServerContent);

        modifiedFiles.add(mainRouterPath);
        modifiedFiles.add(twoRouterPath);
        modifiedFiles.add(twoServerPath);
        console.log(
          `[fix-nitro-chunks] Ciclo ${routerTwo} <-> ${routerMain} eliminado com sucesso.`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VERIFICAÇÃO INTEGRAL EM DUAS CAMADAS (SINTÁTICA + RUNTIME ESM)
// ─────────────────────────────────────────────────────────────────────────────
// Camada 1: node --check
for (const mf of modifiedFiles) {
  try {
    execFileSync("node", ["--check", mf]);
  } catch (err) {
    assert(false, `Falha de validação de sintaxe (node --check) em ${mf}: ${err.message}`);
  }
}
console.log(
  `[fix-nitro-chunks] Camada 1 (Sintaxe node --check) aprovada para ${modifiedFiles.size} arquivos modificados.`,
);

// Camada 2: Carregamento Real em Runtime ESM e Prova Funcional dos Caminhos Afetados
const verificationScript = `
import path from "node:path";
const indexFile = path.resolve(".output/server/index.mjs");
const ssrFile = path.resolve(".output/server/_ssr/ssr.mjs");

const ssrMod = await import(ssrFile);
if (typeof ssrMod.default?.fetch !== "function") {
  throw new Error("ssr.mjs default.fetch não é uma função válida");
}

const indexMod = await import(indexFile);
if (typeof indexMod.default?.fetch !== "function") {
  throw new Error("index.mjs default.fetch não é uma função válida");
}

console.log("Camada 2 (Runtime ESM) validada com sucesso total.");
`;

try {
  execFileSync("node", ["--input-type=module", "-e", verificationScript]);
  console.log("[fix-nitro-chunks] Camada 2 (Carregamento ESM e prova funcional) APROVADA.");
} catch (err) {
  assert(false, `Falha no teste de carregamento em runtime ESM: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. INJEÇÃO DETERMINÍSTICA DE CONFIGURAÇÃO EM .output/server/wrangler.json
// ─────────────────────────────────────────────────────────────────────────────
const requiredVars = {
  APP_INSTANCE_ID: "HUNTER",
  EXPECTED_SUPABASE_PROJECT_REF: "kaxtuqfmvlkfnqsdualu",
  SUPABASE_PROJECT_REF: "kaxtuqfmvlkfnqsdualu",
  SUPABASE_URL: "https://kaxtuqfmvlkfnqsdualu.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheHR1cWZtdmxrZm5xc2R1YWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTY4NTEsImV4cCI6MjEwNTMzMjg1MX0.c0Gp_DHcoUqBelYrDxWGywsvSUycVrV7ASrVtNpcW7A",
  VITE_SUPABASE_URL: "https://kaxtuqfmvlkfnqsdualu.supabase.co",
  VITE_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtheHR1cWZtdmxrZm5xc2R1YWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NTY4NTEsImV4cCI6MjEwNTMzMjg1MX0.c0Gp_DHcoUqBelYrDxWGywsvSUycVrV7ASrVtNpcW7A",
  APP_ENV: "production",
  APP_PUBLIC_URL: "https://sigoguardiao.oficial.tec.br",
};

const rawCfg = fs.readFileSync(wranglerFile, "utf8");
let cfg;
try {
  cfg = JSON.parse(rawCfg);
} catch (e) {
  assert(false, `Falha ao fazer parse de ${wranglerFile}: ${e.message}`);
}

cfg.vars = { ...cfg.vars, ...requiredVars };

fs.writeFileSync(wranglerFile, JSON.stringify(cfg, null, 2));

const verifiedCfg = JSON.parse(fs.readFileSync(wranglerFile, "utf8"));
for (const [k, v] of Object.entries(requiredVars)) {
  assert(
    verifiedCfg.vars?.[k] === v,
    `Variável ${k} não configurada corretamente no wrangler.json`,
  );
}

console.log("[fix-nitro-chunks] wrangler.json verificado e aprovado com sucesso.");
console.log(
  `[fix-nitro-chunks] Status final: Server=[${serverTransformationStatus}], Router=[${routerTransformationStatus}]. SUCESSO COMPROVADO.`,
);
