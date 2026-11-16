import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PROTOCOLOS_BANCADA } from "@/features/seguranca/lib/protocolosBancada";
import { obterMenuPublicoDevBot } from "@/features/chat/services/whatsappAutoMonitoramentoService";

describe("HUNTER-GUARDIAN — Homologação do Rastreador G900L 4G e Isolamento WhatsApp GD", () => {
  it("G900L: Deve estar presente no catálogo de protocolos homologados de bancada USB", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    assert.ok(g900l, "Protocolo g900l deve existir no catálogo PROTOCOLOS_BANCADA");
    assert.equal(g900l.id, "g900l");
    assert.equal(g900l.nome, "G900L / A76XX (GT06 4G LTE)");
    assert.equal(g900l.terminador, "CRLF");
    assert.equal(g900l.suportaServidorViaSerial, true);
    assert.equal(g900l.suportaTimersMovimento, true);
  });

  it("G900L: Deve gerar comando canônico de APN M2M via AT Hayes para modem SIMCom A76XX", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const apnCmd = g900l.gerarComandoApn("voxter.br", "algar", "1212");
    assert.equal(apnCmd.cmd, 'AT+CGDCONT=1,"IP","voxter.br"');
    assert.equal(apnCmd.terminador, "CRLF");
  });

  it("G900L: Deve gerar comando canônico de Servidor para porta 7003", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const srvCmd = g900l.gerarComandoServidor("167.234.233.82", "7003", "0");
    assert.equal(srvCmd.cmd, "adminip123456 167.234.233.82 7003");
    assert.equal(srvCmd.terminador, "CRLF");
  });

  it("G900L: Deve gerar fila canônica com 20 comandos AT diretos via USB com autenticação APN e socket", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const fila = g900l.gerarFilaPadraoCanonico({
      srv: "167.234.233.82",
      porta: "7003",
      modo: "0",
      apn: "voxter.br",
      user: "algar",
      pass: "1212",
      mov: "30",
      parado: "3600",
      hbt: "300",
    });

    assert.ok(Array.isArray(fila));
    assert.equal(fila.length, 20);
    // 1. Sincronismo
    assert.equal(fila[0].cmd, "AT");
    // 5. ICCID SIMCom A76XX
    assert.equal(fila[4].cmd, "AT+CICCID");
    // 9. APN
    assert.equal(fila[8].cmd, 'AT+CGDCONT=1,"IP","voxter.br"');
    // 10. Autenticação APN (PAP/Algar)
    assert.equal(fila[9].cmd, 'AT+CGAUTH=1,1,"algar","1212"');
    // 15. Configurar Socket no Contexto 1
    assert.equal(fila[14].cmd, "AT+CSOCKSETPN=1");
    // 16. Ativação PDP
    assert.equal(fila[15].cmd, "AT+CGACT=1,1");
    // 18. Iniciar Stack TCP/IP
    assert.equal(fila[17].cmd, "AT+NETOPEN");
    // 19. Socket TCP GD Porta 7003
    assert.equal(fila[18].cmd, 'AT+CIPOPEN=0,"TCP","167.234.233.82",7003');
    // Todos comandos devem usar terminação CRLF
    for (const item of fila) {
      assert.equal(item.tipo, "CRLF");
    }
  });

  it("G900L: Atalhos rápidos e comandos de um toque devem conter leitura de IMEI, ICCID, sinal e auditoria", () => {
    const g900l = PROTOCOLOS_BANCADA.g900l;
    const cmdsAtalhos = g900l.atalhos.map((a) => a.cmd);
    assert.ok(cmdsAtalhos.includes("AT"));
    assert.ok(cmdsAtalhos.includes("AT+CGSN"));
    assert.ok(cmdsAtalhos.includes("AT+CICCID"));
    assert.ok(cmdsAtalhos.includes("AT+CCID"));
    assert.ok(cmdsAtalhos.includes("AT+CPIN?"));
    assert.ok(cmdsAtalhos.includes("AT+CSQ"));
    assert.ok(cmdsAtalhos.includes("check123456"));
    assert.ok(cmdsAtalhos.includes("status123456"));
    assert.ok(cmdsAtalhos.includes("PARAM#"));
    assert.ok(cmdsAtalhos.includes("STATUS#"));
  });

  it("Isolamento WhatsApp: Menu público deve identificar exclusivamente como Assistente GD", () => {
    const menu = obterMenuPublicoDevBot("Dario");
    assert.ok(menu.includes("Assistente GD"), "Deve conter 'Assistente GD'");
    assert.ok(!menu.includes("Guardião Virtual"), "NÃO pode conter 'Guardião Virtual'");
    assert.ok(menu.includes("GD Rastreamento"));
  });
});
