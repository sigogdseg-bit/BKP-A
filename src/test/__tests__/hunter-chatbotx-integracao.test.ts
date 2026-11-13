import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarTelefoneParaWhatsapp,
  montarPayloadAlertaJ16,
  dispararAlertaParaChatbotX,
  obterUrlChatbotX,
  gerarLinkWhatsappWeb,
  enviarMensagemWhatsappOperador,
} from "../../shared/lib/chatbotxBridge";

describe("Hunter — Integração com Microsserviço ChatbotX (Omnichannel)", () => {
  test("1. Deve normalizar telefones para o padrão internacional canônico (E.164)", () => {
    // Celular de SP sem DDI
    assert.equal(normalizarTelefoneParaWhatsapp("(11) 99876-5432"), "5511998765432");
    // Telefone com traços e espaços
    assert.equal(normalizarTelefoneParaWhatsapp("21 98888 7777"), "5521988887777");
    // Telefone já com DDI 55
    assert.equal(normalizarTelefoneParaWhatsapp("+55 (31) 98765-4321"), "5531987654321");
    // Telefone vazio
    assert.equal(normalizarTelefoneParaWhatsapp(""), "");
  });

  test("2. Deve montar o payload canônico para alertas do Hardware J16 com fuso horário do Brasil", () => {
    const payload = montarPayloadAlertaJ16({
      tipo: "POWERALM",
      placa: "axh0e44",
      veiculo: "Volvo XC60",
      imei: "863874085222366",
      telefone: "(11) 99999-8888",
      endereco: "Av. Paulista, 1578 - São Paulo/SP",
      linkRastreamento: "https://sigo.oficial.tec.br/compartilhar/xyz123",
      dataHoraIso: "2026-10-13T23:30:00.000Z",
    });

    assert.equal(payload.evento, "ALERTA_J16");
    assert.equal(payload.tipo, "POWERALM");
    assert.equal(payload.placa, "AXH0E44");
    assert.equal(payload.veiculo, "Volvo XC60");
    assert.equal(payload.imei, "863874085222366");
    assert.equal(payload.telefone_destinatario, "5511999998888");
    assert.ok(payload.titulo.includes("Corte de Alimentação Externa"));
    assert.equal(payload.endereco, "Av. Paulista, 1578 - São Paulo/SP");
    assert.equal(payload.link_rastreamento, "https://sigo.oficial.tec.br/compartilhar/xyz123");
    assert.ok(payload.data_hora.includes("13/10/2026"));
  });

  test("3. Deve disparar o alerta via fetch com sucesso e receber ID de mensagem", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, options: any) => {
      assert.ok(String(url).includes("/api/v1/webhooks/hunter-alertas"));
      assert.equal(options.headers["Authorization"], "Bearer meu_token_secreto");
      return {
        ok: true,
        json: async () => ({ id: "msg_cbx_998877" }),
      } as any;
    }) as any;

    try {
      const payload = montarPayloadAlertaJ16({
        tipo: "SOS",
        placa: "AXH0E44",
        imei: "863874085222366",
        telefone: "11988887777",
      });

      const resposta = await dispararAlertaParaChatbotX(payload, "meu_token_secreto");

      assert.equal(resposta.sucesso, true);
      assert.equal(resposta.mensagemId, "msg_cbx_998877");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("4. Deve tratar falhas de rede de forma graciosa sem quebrar a execução", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("Conexão recusada ao conectar ao ChatbotX");
    }) as any;

    try {
      const payload = montarPayloadAlertaJ16({
        tipo: "SPEED",
        placa: "AXH0E44",
        imei: "863874085222366",
        telefone: "11988887777",
      });

      const resposta = await dispararAlertaParaChatbotX(payload);

      assert.equal(resposta.sucesso, false);
      assert.ok(resposta.erro?.includes("Erro de rede ao conectar ao ChatbotX"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("5. Deve retornar a URL padrão caso a variável de ambiente não esteja definida", () => {
    const url = obterUrlChatbotX();
    assert.ok(url.startsWith("https://"));
  });

  test("6. Deve gerar link canônico do WhatsApp Web (wa.me) codificado corretamente", () => {
    const link = gerarLinkWhatsappWeb("(11) 98888-7777", "Olá, sua fatura está disponível!");
    assert.ok(link.startsWith("https://wa.me/5511988887777?text="));
    assert.ok(link.includes("Ol%C3%A1"));
  });

  test("7. Deve enviar mensagem de operador via ChatbotX com payload estruturado", async () => {
    const originalFetch = globalThis.fetch;
    let urlChamada = "";
    let bodyEnviado: any = null;

    globalThis.fetch = (async (url: any, options: any) => {
      urlChamada = String(url);
      bodyEnviado = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: "msg_operador_123" }),
      } as any;
    }) as any;

    try {
      const res = await enviarMensagemWhatsappOperador({
        clienteNome: "João da Silva",
        telefone: "11999998888",
        mensagem: "Olá João, seu rastreador está funcionando perfeitamente.",
        operadorNome: "Novaes",
        clienteId: "cli_123",
      });

      assert.equal(res.sucesso, true);
      assert.equal(res.mensagemId, "msg_operador_123");
      assert.ok(urlChamada.includes("/api/v1/messages/send"));
      assert.equal(bodyEnviado.channel, "whatsapp");
      assert.equal(bodyEnviado.recipient, "5511999998888");
      assert.equal(bodyEnviado.metadata.operador, "Novaes");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("8. Deve rejeitar envio de operador quando telefone for vazio", async () => {
    const res = await enviarMensagemWhatsappOperador({
      clienteNome: "João",
      telefone: "",
      mensagem: "Teste",
    });

    assert.equal(res.sucesso, false);
    assert.ok(res.erro?.includes("Telefone do destinatário inválido"));
  });

  test("9. Deve enviar mensagem de operador com documento anexo estruturado", async () => {
    const originalFetch = globalThis.fetch;
    let urlChamada = "";
    let bodyEnviado: any = null;

    globalThis.fetch = (async (url: any, options: any) => {
      urlChamada = String(url);
      bodyEnviado = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: "msg_doc_456" }),
      } as any;
    }) as any;

    try {
      const res = await enviarMensagemWhatsappOperador({
        clienteNome: "Maria Santos",
        telefone: "24992501512",
        mensagem: "Segue em anexo o relatório mensal de telemetria.",
        operadorNome: "Supervisor",
        clienteId: "cli_789",
        documento: {
          nome: "relatorio_mensal.pdf",
          base64: "data:application/pdf;base64,JVBERi0xLjQK...",
          mimetype: "application/pdf",
          tamanho: 10240,
        },
      });

      assert.equal(res.sucesso, true);
      assert.equal(res.mensagemId, "msg_doc_456");
      assert.ok(urlChamada.includes("/api/v1/messages/send"));
      assert.equal(bodyEnviado.channel, "whatsapp");
      assert.equal(bodyEnviado.recipient, "5524992501512");
      assert.equal(bodyEnviado.metadata.tem_documento, true);
      assert.ok(bodyEnviado.documento);
      assert.equal(bodyEnviado.documento.nome, "relatorio_mensal.pdf");
      assert.equal(bodyEnviado.documento.mimetype, "application/pdf");
      assert.equal(bodyEnviado.document.nome, "relatorio_mensal.pdf");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("10. Deve permitir envio exclusivo de documento sem texto obrigatório", async () => {
    const originalFetch = globalThis.fetch;
    let bodyEnviado: any = null;

    globalThis.fetch = (async (_url: any, options: any) => {
      bodyEnviado = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ id: "msg_doc_sozinho" }),
      } as any;
    }) as any;

    try {
      const res = await enviarMensagemWhatsappOperador({
        clienteNome: "Carlos",
        telefone: "11999998888",
        mensagem: "",
        documento: {
          nome: "comprovante.png",
          base64: "data:image/png;base64,iVBORw0KGgo...",
          mimetype: "image/png",
          tamanho: 2048,
        },
      });

      assert.equal(res.sucesso, true);
      assert.equal(bodyEnviado.message, "");
      assert.equal(bodyEnviado.documento.nome, "comprovante.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
