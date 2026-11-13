import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Discador MacroDroid (Combo Despertador) e Entrega BD / Push", () => {
  it("1. server.ts deve conter normalizarNumeroDiscadorClaro com prefixo 021", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("function normalizarNumeroDiscadorClaro"),
      "server.ts deve conter a função normalizarNumeroDiscadorClaro",
    );
    assert.ok(
      content.includes("021"),
      "normalizarNumeroDiscadorClaro deve utilizar o prefixo 021 da operadora Claro",
    );
  });

  it("2. server.ts deve implementar dispararLigacaoMacroDroid com disparo unico sem segunda chamada", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("async function dispararLigacaoMacroDroid"),
      "server.ts deve conter a função dispararLigacaoMacroDroid",
    );
    assert.ok(
      content.includes("macrodroidCallDedupCache"),
      "dispararLigacaoMacroDroid deve possuir cache de deduplicação",
    );
    assert.ok(
      content.includes(
        "https://trigger.macrodroid.com/ba91741e-4025-401c-a3c6-cab080e519e3/discar",
      ),
      "server.ts deve conter o webhook oficial do MacroDroid como fallback",
    );
    assert.ok(
      content.includes("tentativa=1"),
      "dispararLigacaoMacroDroid deve marcar tentativa explicita 1 com anti-cache",
    );
    assert.ok(
      !content.includes("tentativa=2"),
      "dispararLigacaoMacroDroid NAO deve conter segunda chamada tentativa=2",
    );
    assert.ok(
      !content.includes("setTimeout(resolve, 3000)"),
      "dispararLigacaoMacroDroid NAO deve conter espera de 3000ms para segunda chamada",
    );
    assert.ok(
      content.includes("await res.text().catch"),
      "dispararLigacaoMacroDroid deve consumir o corpo da resposta HTTP para fechar o stream",
    );
  });

  it("3. despacharWhatsappAlertaServer deve acionar dispararLigacaoMacroDroid para todo alerta veicular com await", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("await dispararLigacaoMacroDroid("),
      "server.ts deve conter await dispararLigacaoMacroDroid para garantir execucao no Cloudflare Workers",
    );
    assert.ok(
      content.includes("await despacharWhatsappAlertaServer("),
      "handleApiWebPush deve conter await despacharWhatsappAlertaServer para nao encerrar o worker prematuramente",
    );
    assert.ok(
      content.includes("Combo Despertador Tático"),
      "despacharWhatsappAlertaServer deve documentar o Combo Despertador Tático",
    );
  });

  it("4. reconciliarAlertasSegurancaServidor deve persistir em alertas_seguranca e notificacoes_sistema", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("alertas_seguranca"),
      "reconciliação deve persistir alerta em alertas_seguranca",
    );
    assert.ok(
      content.includes("notificacoes_sistema"),
      "reconciliação deve persistir notificação em notificacoes_sistema",
    );
    assert.ok(
      content.includes("clienteUserId"),
      "reconciliação deve resolver clienteUserId para endereçamento correto",
    );
  });

  it("5. notificacoesBdService.ts deve entregar alertas operacionais para administradores conectados", () => {
    const notifPath = path.resolve(process.cwd(), "src/shared/lib/notificacoesBdService.ts");
    const content = fs.readFileSync(notifPath, "utf-8");

    assert.ok(
      content.includes("ehAdmin") && content.includes('notif.tipo !== "chat"'),
      "notificacoesBdService deve permitir que administradores recebam alertas operacionais",
    );
  });

  it("6. Regra Pétrea: Ausência estrita do caractere comercial proibido no arquivo de teste", () => {
    const testPath = path.resolve(
      process.cwd(),
      "src/test/__tests__/hunter-discador-macrodroid-e-reconciliacao-bd-push.test.ts",
    );
    const content = fs.readFileSync(testPath, "utf-8");
    const codigoLimpo = content.replace(/https?:\/\/[^\s"'`]+/g, "").replace(/&&/g, "");

    // Procura por ocorrência do caractere proibido fora de comentários
    const linhas = codigoLimpo.split("\n");
    for (const linha of linhas) {
      if (linha.includes("caractere comercial proibido")) continue;
      assert.ok(
        !linha.includes(String.fromCharCode(38)),
        "Arquivo de teste não deve conter o caractere comercial proibido solto em texto",
      );
    }
  });
});
