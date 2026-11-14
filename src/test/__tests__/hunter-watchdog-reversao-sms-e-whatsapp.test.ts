import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";

describe("Hunter — Watchdog de Defesa Ativa, Reversão Automática Anti-SMS e Alertas SuperADM", () => {
  const gatewayScriptPath = path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts");
  const gatewayDeployPath = path.resolve(
    process.cwd(),
    "deploy/hunter-gateway/src/hunter-gps-gateway.ts",
  );

  it("1. Gateway deve declarar bloqueadoEsperado e timestamps em ConexaoRastreador", async () => {
    const content = await fs.readFile(gatewayScriptPath, "utf-8");

    assert.ok(
      content.includes("bloqueadoEsperado?: boolean;"),
      "ConexaoRastreador deve conter bloqueadoEsperado",
    );
    assert.ok(
      content.includes("ultimoComandoBloqueioPlataformaTs?: number;"),
      "ConexaoRastreador deve conter ultimoComandoBloqueioPlataformaTs",
    );
    assert.ok(
      content.includes("tentativasReversaoContador?: number;"),
      "ConexaoRastreador deve conter tentativasReversaoContador",
    );
  });

  it("2. Gateway deve implementar auditarIntegridadeEstadoEReverter e despacharNotificacaoWhatsappSuperAdmGateway", async () => {
    const content = await fs.readFile(gatewayScriptPath, "utf-8");

    assert.ok(
      content.includes("async function auditarIntegridadeEstadoEReverter"),
      "Deve implementar auditarIntegridadeEstadoEReverter",
    );
    assert.ok(
      content.includes("async function despacharNotificacaoWhatsappSuperAdmGateway"),
      "Deve implementar despacharNotificacaoWhatsappSuperAdmGateway",
    );
    assert.ok(
      content.includes("hunter-guardiao-whatsapp-secret-key-2026"),
      "Deve autenticar no WhatsApp Gateway com o token canônico",
    );
  });

  it("3. Gateway deve reverter imediatamente via GPRS corte não autorizado por SMS (RELAY,0 e HFYD)", async () => {
    const content = await fs.readFile(gatewayScriptPath, "utf-8");

    assert.ok(
      content.includes('montarPacoteComandoGT06("HFYD,000000")'),
      "Deve enviar contra-comando HFYD ao detectar corte indevido",
    );
    assert.ok(
      content.includes('montarPacoteComandoGT06("RELAY,0")'),
      "Deve enviar contra-comando RELAY,0 ao detectar corte indevido",
    );
  });

  it("4. Gateway deve re-bloquear imediatamente via GPRS desbloqueio não autorizado de veículo roubado (RELAY,1 e DYD)", async () => {
    const content = await fs.readFile(gatewayScriptPath, "utf-8");

    assert.ok(
      content.includes('montarPacoteComandoGT06("DYD,000000")'),
      "Deve enviar contra-comando DYD ao detectar desarme indevido",
    );
    assert.ok(
      content.includes('montarPacoteComandoGT06("RELAY,1")'),
      "Deve enviar contra-comando RELAY,1 ao detectar desarme indevido",
    );
  });

  it("5. Gateway deve notificar imediatamente o SuperADM via WhatsApp em caso de manipulação externa", async () => {
    const content = await fs.readFile(gatewayScriptPath, "utf-8");

    assert.ok(
      content.includes("ALERTA DE SEGURANÇA MÁXIMA — GD RASTREAMENTO"),
      "Deve conter cabeçalho oficial do alerta de segurança máxima",
    );
    assert.ok(
      content.includes("Manipulação externa não autorizada via SMS detectada!"),
      "Deve identificar a manipulação externa por SMS",
    );
    assert.ok(
      content.includes("REVERSÃO IMEDIATA REALIZADA VIA GPRS"),
      "Deve informar a reversão executada no WhatsApp do SuperADM",
    );
  });

  it("6. Gateway deve auditar integridade tanto no Heartbeat (0x13) quanto no Alarme (0x16)", async () => {
    const content = await fs.readFile(gatewayScriptPath, "utf-8");

    assert.ok(
      content.includes('origem: "heartbeat_0x13"'),
      "Deve invocar auditarIntegridadeEstadoEReverter no pacote 0x13",
    );
    assert.ok(
      content.includes("origem: `alarme_0x"),
      "Deve invocar auditarIntegridadeEstadoEReverter no pacote 0x16/0x26",
    );
  });

  it("7. Arquivo deploy/hunter-gateway/src/hunter-gps-gateway.ts deve estar 100% sincronizado com scripts/", async () => {
    const scriptContent = await fs.readFile(gatewayScriptPath, "utf-8");
    const deployContent = await fs.readFile(gatewayDeployPath, "utf-8");

    assert.strictEqual(
      scriptContent,
      deployContent,
      "Scripts do Gateway e Deploy do Gateway devem ser estritamente idênticos",
    );
  });
});
