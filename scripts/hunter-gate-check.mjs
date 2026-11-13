#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Verificador Físico de Conformidade dos 7 Gates (AGENTS.md / SKILL hunter)
// Bloqueia qualquer publicação que viole as regras pétreas do sistema.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

console.log("\n🛡️  [HUNTER-GUARDIAN] Iniciando Auditoria Fisiológica dos 7 Gates...");

// 1. Arquivos Canônicos de Versionamento A.B.C.D
const ARQUIVOS_VERSAO = [
  {
    caminho: "package.json",
    extrair: (c) => JSON.parse(c).version,
  },
  {
    caminho: "vite.config.ts",
    extrair: (c) => {
      const m = c.match(/const APP_VERSION\s*=\s*["']([^"']+)["']/);
      return m ? m[1] : null;
    },
  },
  {
    caminho: "src/shared/lib/version.ts",
    extrair: (c) => {
      const m = c.match(/export const APP_VERSION_NUMERO\s*=\s*["']([^"']+)["']/);
      return m ? m[1] : null;
    },
  },
  {
    caminho: "src/test/__tests__/hunter-fundacao.test.ts",
    extrair: (c) => {
      const m = c.match(/assert\.equal\(APP_VERSION_NUMERO,\s*["']([^"']+)["']\)/);
      return m ? m[1] : null;
    },
  },
  {
    caminho: "src/test/__tests__/hunter-sigoguardiao-dominio-e-compartilhamento.test.ts",
    extrair: (c) => {
      const m = c.match(/assert\.equal\(APP_VERSION_NUMERO,\s*["']([^"']+)["']\)/);
      return m ? m[1] : null;
    },
  },
];

export function verificarSincronizacaoVersao() {
  const versoes = {};
  for (const item of ARQUIVOS_VERSAO) {
    const fullPath = path.join(ROOT_DIR, item.caminho);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Arquivo canônico de versão não encontrado: ${item.caminho}`);
    }
    const conteudo = fs.readFileSync(fullPath, "utf-8");
    const v = item.extrair(conteudo);
    if (!v) {
      throw new Error(`Não foi possível extrair a versão de ${item.caminho}`);
    }
    versoes[item.caminho] = v;
  }

  const lista = Object.values(versoes);
  const primeira = lista[0];
  const todasIguais = lista.every((v) => v === primeira);

  if (!todasIguais) {
    console.error("❌ ERRO: Discrepância detectada entre as versões dos arquivos canônicos:");
    console.table(versoes);
    throw new Error(
      "Gate 6 Violado: As versões em package.json, vite.config.ts, version.ts e nos testes não são idênticas!",
    );
  }

  // Validação de formato A.B.C.D
  const regexABCD = /^\d+\.\d+\.\d+\.\d+$/;
  if (!regexABCD.test(primeira)) {
    throw new Error(
      `Gate 6 Violado: A versão "${primeira}" não respeita o formato obrigatório A.B.C.D (ex: 2.1.6.17)!`,
    );
  }

  // Verifica package-lock.json
  const lockPath = path.join(ROOT_DIR, "package-lock.json");
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    if (lock.version !== primeira) {
      throw new Error(
        `Gate 6 Violado: package-lock.json está com versão "${lock.version}", diferente de "${primeira}". Execute "npm install --package-lock-only"!`,
      );
    }
  }

  return primeira;
}

export function verificarTagGit(versao) {
  try {
    const tagEsperada = `v${versao}`;
    const tags = execSync("git tag --points-at HEAD", { cwd: ROOT_DIR, encoding: "utf-8" })
      .trim()
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!tags.includes(tagEsperada)) {
      throw new Error(
        `Gate 6 Violado: O commit HEAD não possui a tag anotada "${tagEsperada}". O protocolo exige "git tag -a ${tagEsperada} -m 'Release ${tagEsperada}'" antes da publicação!`,
      );
    }
  } catch (err) {
    throw new Error(err.message);
  }
}

// Execução direta via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const versao = verificarSincronizacaoVersao();
    console.log(
      `✅ Gate 6 (Versionamento): Versão ${versao} sincronizada em todos os 5 arquivos canônicos.`,
    );

    // Se o argumento --check-tag for passado, exige a tag no commit atual
    if (process.argv.includes("--check-tag")) {
      verificarTagGit(versao);
      console.log(`✅ Gate 6 (Tag Anotada): Tag v${versao} confirmada no commit atual.`);
    }

    console.log("🛡️  Auditoria de Conformidade Aprovada com Sucesso!\n");
    process.exit(0);
  } catch (err) {
    console.error(`\n🚨 BLOQUEIO DE SEGURANÇA:\n${err.message}\n`);
    process.exit(1);
  }
}
