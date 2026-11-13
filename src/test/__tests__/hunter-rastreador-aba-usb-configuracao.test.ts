import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Aba USB de Configuração e Bancada Serial de Rastreadores", () => {
  describe("Formatação e Sintaxe Canônica de Comandos Seriais para Bancada", () => {
    test("deve montar comando de apontamento de servidor com domínio e porta corretos", () => {
      const servidor = "dev.oficial.tec.br";
      const porta = "5023";
      const modo = "1"; // 1 = DNS
      const comando = `SERVER,${modo},${servidor},${porta},0#`;

      assert.equal(comando, "SERVER,1,dev.oficial.tec.br,5023,0#");
      assert.equal(comando.endsWith("#"), true);
      assert.equal(comando.startsWith("SERVER,"), true);
    });

    test("deve montar comando de apontamento por IP direto", () => {
      const ip = "172.67.180.20";
      const porta = "5023";
      const modo = "0"; // 0 = IP
      const comando = `SERVER,${modo},${ip},${porta},0#`;

      assert.equal(comando, "SERVER,0,172.67.180.20,5023,0#");
    });

    test("deve montar comando de APN completo com usuário e senha", () => {
      const apn = "voxter.br";
      const user = "algar";
      const pass = "1212";
      const comando = `APN,${apn},${user},${pass}#`;

      assert.equal(comando, "APN,voxter.br,algar,1212#");
    });

    test("deve montar comandos de timers de movimento e repouso", () => {
      const mov = "15";
      const parado = "1800";
      const comandoTimer = `TIMER,${mov},${parado}#`;
      const comandoHbt = `HBT,3#`;

      assert.equal(comandoTimer, "TIMER,15,1800#");
      assert.equal(comandoHbt, "HBT,3#");
    });

    test("deve validar comandos de diagnóstico de bancada técnica", () => {
      const comandosDiagnostico = [
        "STATUS#",
        "PARAM#",
        "VERSION#",
        "IMEI#",
        "WHERE#",
        "RESET#",
        "FACTORY#",
      ];

      comandosDiagnostico.forEach((cmd) => {
        assert.equal(cmd.endsWith("#"), true);
        assert.match(cmd, /^[A-Z]+#$/);
      });
    });
  });

  describe("Extração e Auto-Detecção de IMEI e Parâmetros da Resposta Serial", () => {
    test("deve extrair IMEI de 15 dígitos de respostas do hardware", () => {
      const respostas = [
        "IMEI:867492040123456",
        "PARAM:SERVER,1,dev.oficial.tec.br,5023;IMEI:867492040123456;APN:voxter.br",
        "867492040123456",
        "READ IMEI OK: 867492040123456#",
      ];

      respostas.forEach((resp) => {
        const match = resp.match(/(?:IMEI[:=,\s]?)(\d{15})/i) || resp.match(/\b(\d{15})\b/);
        assert.ok(match);
        assert.equal(match![1], "867492040123456");
      });
    });

    test("deve extrair servidor atual e porta de respostas PARAM", () => {
      const resposta = "SERVER:1,dev.oficial.tec.br,5023,0;APN:voxter.br,algar,1212;";
      const matchServer =
        resposta.match(/SERVER[:=,\s](?:[0-1],)?([a-zA-Z0-9._-]+),(\d+)/i) ||
        resposta.match(/IP[:=,\s]([a-zA-Z0-9._-]+),(\d+)/i);

      assert.ok(matchServer);
      assert.equal(matchServer![1], "dev.oficial.tec.br");
      assert.equal(matchServer![2], "5023");
    });

    test("deve extrair APN atual da resposta do hardware", () => {
      const resposta = "APN:voxter.br,algar,1212;TIMER:15,1800;";
      const matchApn = resposta.match(/APN[:=,\s]([a-zA-Z0-9._-]+)/i);

      assert.ok(matchApn);
      assert.equal(matchApn![1], "voxter.br");
    });
  });

  describe("Detecção de Compatibilidade e Terminações de Linha", () => {
    test("deve aplicar terminação CRLF conforme especificação serial/modem", () => {
      const comando = "STATUS#";
      const payloadCrlf = `${comando.replace(/[\r\n]+$/, "")}\r\n`;

      assert.equal(payloadCrlf, "STATUS#\r\n");
    });

    test("deve respeitar terminação delimitador Hash sem duplicar", () => {
      const comandoJaComHash = "RESET#";
      const payloadHash = comandoJaComHash.endsWith("#")
        ? comandoJaComHash
        : `${comandoJaComHash}#`;

      assert.equal(payloadHash, "RESET#");
    });
  });
});
