#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Instalador Canônico de Git Hooks de Blindagem
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const HOOKS_DIR = path.join(ROOT_DIR, ".git", "hooks");

if (fs.existsSync(HOOKS_DIR)) {
  const prePushPath = path.join(HOOKS_DIR, "pre-push");
  const scriptContent = `#!/bin/bash
# ==============================================================================
# HUNTER-GUARDIAN — BARREIRA FÍSICA BLOQUEANTE PRE-PUSH (AGENTS.MD / SKILL HUNTER)
# ==============================================================================

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! node scripts/hunter-gate-check.mjs --check-tag; then
  echo ""
  echo "🚨 [HUNTER-GUARDIAN] PUSH BLOQUEADO FISICAMENTE PELO SISTEMA OPERACIONAL!"
  echo "   O protocolo de release da skill hunter não foi cumprido."
  echo "   Execute compulsoriamente: npm run release"
  echo ""
  exit 1
fi

exit 0
`;

  fs.writeFileSync(prePushPath, scriptContent, { mode: 0o755 });
  fs.chmodSync(prePushPath, 0o755);
  console.log("🛡️  [HUNTER-GUARDIAN] Git Hook pre-push ativo e configurado com sucesso.");
}
