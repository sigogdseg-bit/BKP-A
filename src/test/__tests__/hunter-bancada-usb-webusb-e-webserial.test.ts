import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Bancada de Configuração USB Nativa (WebUSB e Web Serial)", () => {
  const caminhoComponente = path.join(
    process.cwd(),
    "src/features/seguranca/components/AbaConfiguracaoUsb.tsx",
  );

  const caminhoProtocolos = path.join(
    process.cwd(),
    "src/features/seguranca/lib/protocolosBancada.ts",
  );

  test("1. AbaConfiguracaoUsb.tsx deve existir e implementar WebUSB nativo", () => {
    assert.equal(fs.existsSync(caminhoComponente), true);
    assert.equal(fs.existsSync(caminhoProtocolos), true);
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    // Deve suportar WebUSB para conexão direta sem drivers no SO
    assert.match(conteudo, /conectarWebUsb/);
    assert.match(conteudo, /navUsb\.requestDevice/);
    assert.match(conteudo, /claimInterface/);
    assert.match(conteudo, /transferIn/);
    assert.match(conteudo, /transferOut/);
  });

  test("2. Deve manter suporte dual a Web Serial para adaptadores USB-TTL tradicionais", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    assert.match(conteudo, /conectarPortaSerial/);
    assert.match(conteudo, /navSerial\.requestPort/);
    assert.match(conteudo, /tipoConexao/);
  });

  test("3. Deve priorizar interface 5 (AT Command) e ativar linhas CDC DTR e RTS", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    // Identifica e prioriza interface 5 em modems LTE/4G
    assert.match(conteudo, /c\.num === 5/);
    assert.match(conteudo, /alternarInterfaceUsb/);
    assert.match(conteudo, /SET_CONTROL_LINE_STATE|0x22/);
  });

  test("4. Deve alertar caso o usuário selecione portas virtuais do macOS no Web Serial", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    assert.match(conteudo, /Bluetooth\/Console de Depuração/);
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido na tela", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    // Proibido & em strings de exibição (permitido && lógico do JavaScript)
    const linhasComTexto = conteudo.split("\n").filter((l) => {
      const trim = l.trim();
      return (
        (trim.startsWith("<") || trim.startsWith('"') || trim.startsWith("'")) &&
        !trim.includes("&&")
      );
    });

    for (const linha of linhasComTexto) {
      assert.doesNotMatch(linha, /\s&\s/, `Caractere comercial proibido encontrado: ${linha}`);
    }
  });

  test("6. Deve implementar Auto-Detecção Inteligente de Protocolo (Auto-Probe e Handshake)", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    // Certifica a presença da função de varredura autônoma e cancelamento
    assert.match(conteudo, /iniciarVarreduraAutomatica/);
    assert.match(conteudo, /cancelarVarredura/);
    assert.match(conteudo, /varreduraAtiva/);
    assert.match(conteudo, /protocoloDetectado/);

    // Certifica que testa STATUS#, AT, PARAM# e as velocidades 115200 e 9600
    assert.match(conteudo, /STATUS#/);
    assert.match(conteudo, /115200/);
    assert.match(conteudo, /9600/);
    assert.match(conteudo, /Auto-Detectar Protocolo/);
  });

  test("7. Deve implementar Gravação em 1-Clique do Padrão Canônico do GD Rastreamento", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    assert.match(conteudo, /obterConfigPadraoSistemaJ16/);
    assert.match(conteudo, /gravarPadraoCanonicoCompleto/);
    assert.match(conteudo, /restaurarCamposPadraoCanonico/);
    assert.match(conteudo, /Gravar Padrão Canônico/);
    assert.match(conteudo, /Restaurar Padrão/);
  });

  test("8. isInstalacaoRealizada em ClientesView.tsx deve retornar false se status for aguardando_instalacao", async () => {
    const { isInstalacaoRealizada } =
      await import("../../features/clientes/components/ClientesView");

    // Cliente cadastrado com veículo preenchido, mas ainda aguardando instalação física
    const clienteAguardando = {
      status: "aguardando_instalacao",
      status_agendamento: "aguardando_agendamento",
      veiculos_resumo: [{ placa: "RIO2A18", pendente_aprovacao_operador: false }],
    };

    assert.equal(
      isInstalacaoRealizada(clienteAguardando),
      false,
      "Cliente em aguardando_instalacao jamais deve ser marcado como instalação realizada",
    );

    // Cliente ativo com veículo
    const clienteAtivo = {
      status: "ativo",
      status_agendamento: "concluido",
      veiculos_resumo: [{ placa: "RIO2A18", pendente_aprovacao_operador: false }],
    };

    assert.equal(isInstalacaoRealizada(clienteAtivo), true);
  });

  test("9. Deve suportar gravação automática do Padrão Canônico ao conectar e handshake síncrono", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    assert.match(conteudo, /autoGravarAoConectar/);
    assert.match(conteudo, /hunter_usb_autograve_padrao/);
    assert.match(conteudo, /enviarComandoComResposta/);
    assert.match(conteudo, /Auto-Gravar/);
  });

  test("10. Deve extrair nível de sinal CSQ e módulo chipset das respostas seriais", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    assert.match(conteudo, /sinalCsq/);
    assert.match(conteudo, /\+CSQ/);
    assert.match(conteudo, /Sinal 4G/);
  });

  test("11. Deve implementar Polimorfismo Dinâmico de Comandos (WanWay GT06, Modem AT e Coban/TK)", () => {
    const conteudo = fs.readFileSync(caminhoComponente, "utf-8");

    // Certifica a existência do catálogo de protocolos
    assert.match(conteudo, /PROTOCOLOS_BANCADA/);
    assert.match(conteudo, /concox_wanway/);
    assert.match(conteudo, /modem_at/);
    assert.match(conteudo, /coban_tk/);

    // Certifica a comutação automática
    assert.match(conteudo, /alternarFamiliaProtocolo/);
    assert.match(conteudo, /protocoloAtivoDef/);

    // Certifica que Cards 1, 2, 3 e 4 utilizam geradores dinâmicos
    assert.match(conteudo, /protocoloAtivoDef\.gerarComandoServidor/);
    assert.match(conteudo, /protocoloAtivoDef\.gerarComandoApn/);
    assert.match(conteudo, /protocoloAtivoDef\.gerarComandoTimers/);
    assert.match(conteudo, /protocoloAtivoDef\.comandosUmToque\.map/);
    assert.match(conteudo, /protocoloAtivoDef\.atalhos\.map/);
  });

  test("12. Fila canônica deve compulsoriamente finalizar com reset para atualizar o Lara e ter comandos úteis e claros", () => {
    const conteudoComponente = fs.readFileSync(caminhoComponente, "utf-8");
    const conteudoProtocolos = fs.readFileSync(caminhoProtocolos, "utf-8");

    // Certifica o reset final para cada família homologada
    assert.match(conteudoProtocolos, /Reinicialização para Atualizar Lara/);
    assert.match(conteudoProtocolos, /RESET#/);
    assert.match(conteudoProtocolos, /AT\+CFUN=1,1/);
    assert.match(conteudoProtocolos, /reset123456/);

    // Certifica que os comandos de 1 toque têm títulos claros, comandos e descrições para o operador
    assert.match(conteudoComponente, /item\.titulo/);
    assert.match(conteudoComponente, /item\.cmd/);
    assert.match(conteudoComponente, /item\.desc/);

    // Certifica que WebUSB opera com buffer seguro (4096) para evitar erro de babble/overflow
    assert.match(conteudoComponente, /transferIn\(epIn,\s*4096\)/);
  });

  test("13. Correção de comandos: zero AT+CIPSTART, SZCS# sem HASH e fila canônica completa", async () => {
    const conteudoComponente = fs.readFileSync(caminhoComponente, "utf-8");
    const conteudoProtocolos = fs.readFileSync(caminhoProtocolos, "utf-8");

    assert.doesNotMatch(conteudoProtocolos, /AT\+CIPSTART/);
    assert.doesNotMatch(conteudoComponente, /AT\+CIPSTART/);
    assert.match(conteudoComponente, /sanitizarComandoHardware/);
    assert.match(conteudoComponente, /ehComandoConsultaSomenteLeitura/);
    assert.match(conteudoComponente, /gravarPadraoCanonicoViaGatewayTcp/);

    const { PROTOCOLOS_BANCADA } = await import("../../features/seguranca/lib/protocolosBancada");

    const filaConcox = PROTOCOLOS_BANCADA.concox_wanway.gerarFilaPadraoCanonico({
      srv: "167.234.233.82",
      porta: "7002",
      modo: "0",
      apn: "voxter.br",
      user: "algar",
      pass: "1212",
      mov: "30",
      parado: "3600",
      hbt: "300",
    });

    assert.ok(filaConcox.some((c) => c.cmd === "HBT,300,300#"));
    assert.ok(filaConcox.some((c) => c.cmd === "SZCS#ANGLEVALUE=10-020"));
    assert.ok(filaConcox.some((c) => c.cmd === "DEFENSE,1#"));
    assert.ok(filaConcox.some((c) => c.cmd === "SENALM,ON,0#"));
    assert.ok(filaConcox.some((c) => c.cmd === "ACCALM,ON,2#"));

    for (const item of filaConcox) {
      if (item.cmd.toUpperCase().startsWith("SZCS#")) {
        assert.equal(
          item.tipo,
          "CRLF",
          `Comando ${item.cmd} nunca deve usar tipo HASH na fila serial`,
        );
      }
    }

    const filaModem = PROTOCOLOS_BANCADA.modem_at.gerarFilaPadraoCanonico({
      srv: "167.234.233.82",
      porta: "7002",
      modo: "0",
      apn: "voxter.br",
      user: "algar",
      pass: "1212",
      mov: "30",
      parado: "3600",
      hbt: "300",
    });

    assert.equal(
      filaModem.some((c) => c.cmd.includes("CIPSTART")),
      false,
    );
    assert.ok(filaModem.some((c) => c.cmd === 'AT+CGDCONT=1,"IP","voxter.br"'));
    assert.ok(filaModem.some((c) => c.cmd === "AT+CPSMS=0"));
    assert.ok(filaModem.some((c) => c.cmd === "AT+CFUN=1,1"));
  });

  test("14. Catálogo completo de comandos de consulta em WanWay/Concox e Modem AT", async () => {
    const { PROTOCOLOS_BANCADA } = await import("../../features/seguranca/lib/protocolosBancada");

    const cmdsConcox = new Set(
      PROTOCOLOS_BANCADA.concox_wanway.comandosUmToque.map((item) => item.cmd),
    );
    for (const consultaObrigatoria of [
      "STATUS#",
      "PARAM#",
      "SERVER#",
      "GPRSSET#",
      "APN#",
      "CXZT#",
      "SCXSZ#",
      "WHERE#",
      "URL#",
      "RELAY#",
      "MILEAGE#",
      "TIMER#",
      "HBT#",
      "SENDS#",
      "CENTER#",
      "SOS#",
      "VERSION#",
      "CXCS#ACCLINE",
      "CXCS#MTK_DISSLP",
      "CXCS#GPS_DISSLP",
      "CXCS#SLPDISCONNECT",
      "CXCS#GT06METER",
      "CXCS#GT06IEXVOL",
      "CXCS#ANGLEVALUE",
      "CXCS#LED_ENABLE",
    ]) {
      assert.ok(
        cmdsConcox.has(consultaObrigatoria),
        `Consulta ${consultaObrigatoria} deve constar nos comandos de 1 toque WanWay/Concox`,
      );
    }

    const cmdsModem = new Set(PROTOCOLOS_BANCADA.modem_at.comandosUmToque.map((item) => item.cmd));
    for (const consultaAt of [
      "AT",
      "ATI",
      "AT+CGMM",
      "AT+CGMR",
      "AT+CGSN",
      "AT+CCID",
      "AT+CPIN?",
      "AT+COPS?",
      "AT+CSQ",
      "AT+CREG?",
      "AT+CEREG?",
      "AT+CGDCONT?",
      "AT+CGATT?",
      "AT+CGACT?",
      "AT+CGPADDR=1",
      "AT+CPSMS?",
      "AT+NETOPEN?",
      "AT+CIPOPEN?",
      "AT+CGNSSINFO",
    ]) {
      assert.ok(
        cmdsModem.has(consultaAt),
        `Consulta AT ${consultaAt} deve constar nos comandos de 1 toque Modem AT`,
      );
    }
  });
});
