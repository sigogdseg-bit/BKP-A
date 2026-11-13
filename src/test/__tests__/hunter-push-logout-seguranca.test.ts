/**
 * Hunter — Segurança de Push Notification no Logout
 *
 * Garante que ao deslogar:
 * 1. A função cancelarInscricaoPushDispositivoAtual está exportada pelo webPushService.
 * 2. O encerrarSessao do authService importa e chama o cancelamento push.
 * 3. O servidor expõe o endpoint /api/push/cancelar (code inspection).
 * 4. O cancelamento não bloqueia o fluxo de logout em caso de erro.
 *
 * Root Cause protegido:
 *   Usuário que fez login em dispositivo emprestado e depois deslogou continuaria
 *   recebendo alertas pessoais (velocidade, ignição, etc.) naquele aparelho,
 *   pois o endpoint push permanecia registrado no banco de dados.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");

const lerArquivo = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf-8");

describe("Hunter — Segurança de Push Notification no Logout (DJR-NEW / HUNTER-GUARDIAN)", () => {
  test("1. webPushService deve exportar cancelarInscricaoPushDispositivoAtual", () => {
    const code = lerArquivo("shared/lib/webPushService.ts");
    assert.ok(
      code.includes("export async function cancelarInscricaoPushDispositivoAtual"),
      "webPushService deve exportar cancelarInscricaoPushDispositivoAtual",
    );
  });

  test("2. cancelarInscricaoPushDispositivoAtual deve cancelar no PushManager do navegador", () => {
    const code = lerArquivo("shared/lib/webPushService.ts");
    assert.ok(
      code.includes("sub.unsubscribe()"),
      "cancelarInscricaoPushDispositivoAtual deve chamar sub.unsubscribe() no PushManager",
    );
  });

  test("3. cancelarInscricaoPushDispositivoAtual deve remover endpoint do banco Supabase", () => {
    const code = lerArquivo("shared/lib/webPushService.ts");
    assert.ok(
      code.includes("user_push_subscriptions") &&
        code.includes(".delete()") &&
        code.includes('eq("endpoint"'),
      "cancelarInscricaoPushDispositivoAtual deve remover o endpoint da tabela user_push_subscriptions",
    );
  });

  test("4. authService.encerrarSessao deve importar e chamar cancelarInscricaoPushDispositivoAtual", () => {
    const code = lerArquivo("features/auth/services/authService.ts");
    assert.ok(
      code.includes("cancelarInscricaoPushDispositivoAtual"),
      "authService deve importar cancelarInscricaoPushDispositivoAtual",
    );
    assert.ok(
      code.includes("await cancelarInscricaoPushDispositivoAtual"),
      "encerrarSessao deve chamar await cancelarInscricaoPushDispositivoAtual() antes do signOut",
    );
  });

  test("5. authService.encerrarSessao deve chamar cancelamento ANTES do supabase.auth.signOut", () => {
    const code = lerArquivo("features/auth/services/authService.ts");
    const idxCancel = code.indexOf("await cancelarInscricaoPushDispositivoAtual");
    const idxSignOut = code.indexOf("supabase.auth.signOut");
    assert.ok(
      idxCancel !== -1 && idxSignOut !== -1,
      "Ambas as chamadas devem existir no authService",
    );
    assert.ok(
      idxCancel < idxSignOut,
      "cancelarInscricaoPushDispositivoAtual deve ser chamado ANTES de supabase.auth.signOut",
    );
  });

  test("6. O cancelamento push nunca deve bloquear o fluxo de logout (proteção .catch)", () => {
    const code = lerArquivo("features/auth/services/authService.ts");
    // O padrão seguro é: await cancelarInscricaoPushDispositivoAtual().catch(() => {})
    assert.ok(
      code.includes("cancelarInscricaoPushDispositivoAtual().catch"),
      "O cancelamento push deve ter .catch para nunca bloquear o logout em caso de falha",
    );
  });

  test("7. Servidor deve expor o endpoint POST /api/push/cancelar", () => {
    const code = lerArquivo("server.ts");
    assert.ok(
      code.includes('"/api/push/cancelar"'),
      "server.ts deve implementar o endpoint /api/push/cancelar",
    );
    assert.ok(
      code.includes("webPushSubscribers.delete(endpoint)"),
      "O endpoint deve remover a inscrição do mapa em memória do servidor",
    );
  });

  test("8. Regra Pétrea Hunter-Guardian: Arquivo de push não referencia sistemas externos", () => {
    const code = lerArquivo("shared/lib/webPushService.ts");
    // Garante que não há referências a sistemas externos proibidos (SIGOVTR, SIGOFROTA, etc.)
    assert.ok(
      !code.includes("SIGOVTR") && !code.includes("SIGOFROTA"),
      "webPushService não deve referenciar sistemas externos proibidos",
    );
  });
});
