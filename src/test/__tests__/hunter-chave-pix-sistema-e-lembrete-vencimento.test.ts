import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  obterConfigPixSistemaSync,
  salvarConfigPixSistema,
  gerarMensagemLembreteVencimentoLeve,
  gerarLembreteVencimentoComQrCode,
  CONFIG_PIX_PADRAO,
} from "../../shared/lib/pixSistemaService";
import { obterDadosCobrancaClienteFactual } from "../../features/chat/services/whatsappContatosService";
import { VALORES_PADRAO_CANONICO_J16 } from "../../features/seguranca/lib/rastreadorJ16Constantes";
import { APP_PUBLIC_URL } from "../../shared/lib/version";

describe("Hunter — Chave PIX Oficial do Sistema e Lembrete Leve de Vencimento (3 Dias)", () => {
  test("1. Deve obter a configuração padrão da Chave PIX com fallback canônico", () => {
    const config = obterConfigPixSistemaSync();
    assert.ok(config.chavePix, "Chave Pix padrão deve existir");
    assert.equal(config.chavePix, CONFIG_PIX_PADRAO.chavePix);
    assert.ok(config.titular, "Titular padrão deve existir");
    assert.ok(config.cidade, "Cidade padrão deve existir");
  });

  test("2. Deve salvar e recuperar a Chave PIX do Sistema de forma síncrona", async () => {
    const novaChave = "financeiro@sigoguardiao.oficial.tec.br";
    const novoTitular = "GD Rastreamento Tecnologia Ltda";
    const novaCidade = "Volta Redonda";

    await salvarConfigPixSistema({
      chavePix: novaChave,
      titular: novoTitular,
      cidade: novaCidade,
      tipoChave: "email",
    });

    const recuperado = obterConfigPixSistemaSync();
    assert.equal(recuperado.chavePix, novaChave);
    assert.equal(recuperado.titular, novoTitular);
    assert.equal(recuperado.cidade, novaCidade);

    // Restaura padrão canônico
    await salvarConfigPixSistema(CONFIG_PIX_PADRAO);
  });

  test("3. Deve gerar mensagem profissional, com acentuação e aluguel de rastreador com automonitoramento", () => {
    const { mensagem, payloadPix } = gerarMensagemLembreteVencimentoLeve({
      clienteNome: "Dario Novaes",
      valor: 89.9,
      dataVencimentoFormatada: "10/11/2026",
      diasRestantes: 3,
      veiculoIdentificacao: "AXH0E44",
      chavePixCustomizada: "pix@oficial.tec.br",
    });

    // Verificações funcionais essenciais
    assert.ok(mensagem.includes("Dario"), "Mensagem deve conter primeiro nome amigável do cliente");
    assert.ok(
      mensagem.includes("Olá, Dario!"),
      "Mensagem deve conter saudação devidamente acentuada ('Olá')",
    );
    assert.ok(mensagem.includes("3 dias"), "Mensagem deve mencionar o prazo de 3 dias");
    assert.ok(
      mensagem.includes("10/11/2026"),
      "Mensagem deve indicar a data de vencimento correta",
    );
    assert.ok(mensagem.includes("89,90"), "Mensagem deve indicar o valor da fatura");
    assert.ok(mensagem.includes("pix@oficial.tec.br"), "Mensagem deve conter a Chave Pix Oficial");
    assert.ok(mensagem.includes("PIX COPIA E COLA"), "Mensagem deve conter instrução Copia e Cola");
    assert.ok(payloadPix.startsWith("000201"), "Payload EMVCo Copia e Cola deve ser válido");
    assert.ok(
      mensagem.includes(`${APP_PUBLIC_URL}/cliente/financeiro`),
      "Mensagem deve conter link do portal para visualização do QR Code",
    );

    // Regras de negócio estritas solicitadas pelo Usuário:
    assert.ok(
      mensagem.includes("aluguel de rastreador com automonitoramento"),
      "Mensagem deve utilizar estritamente o modelo de aluguel de rastreador com automonitoramento",
    );
    assert.ok(
      !mensagem.toLowerCase().includes("proteção") && !mensagem.toLowerCase().includes("protecao"),
      "Mensagem não pode falar de proteção veicular",
    );
    assert.ok(
      !mensagem.toLowerCase().includes("com carinho"),
      "Mensagem não pode usar 'com carinho'",
    );

    // Acentuação escorreita
    assert.ok(mensagem.includes("veículo"), "Palavra 'veículo' deve estar acentuada");
    assert.ok(mensagem.includes("já"), "Palavra 'já' deve estar acentuada");
    assert.ok(
      mensagem.includes("GD Rastreamento") || mensagem.includes("Rastreamento"),
      "Identidade 'GD Rastreamento' deve estar presente",
    );

    // Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido
    assert.ok(
      !mensagem.includes("&"),
      "Mensagem não pode conter o caractere comercial proibido (&)",
    );
  });

  test("4. Deve gerar a imagem do QR Code Pix e o documento pronto para despacho no WhatsApp", async () => {
    const res = await gerarLembreteVencimentoComQrCode({
      clienteNome: "Dario Novaes",
      valor: 59.9,
      dataVencimentoFormatada: "10/11/2026",
      diasRestantes: 3,
      veiculoIdentificacao: "AXH0E44",
      chavePixCustomizada: "pix@oficial.tec.br",
    });

    assert.ok(
      res.mensagem.includes("QR Code para pagamento instantâneo segue em anexo"),
      "Mensagem deve avisar que o QR Code segue em anexo",
    );
    assert.ok(res.payloadPix.startsWith("000201"), "Payload Pix deve ser válido");
    assert.ok(
      res.qrCodeDataUrl.startsWith("data:image/png;base64,"),
      "QR Code DataUrl deve ser uma imagem PNG em base64",
    );
    assert.ok(res.documento, "Objeto documento deve ser gerado");
    assert.equal(res.documento?.mimetype, "image/png", "Mimetype do QR Code deve ser image/png");
    assert.ok(
      res.documento?.base64.startsWith("data:image/png;base64,"),
      "Base64 do QR Code deve estar presente",
    );
    assert.ok(res.documento?.tamanho > 100, "Tamanho do QR Code deve ser válido");
  });

  test("5. No Rastreador J16, o padrão canônico para SOS e Admin usa por padrão o WhatsApp do cliente titular", () => {
    // Regra do Usuário: "por padrão sempre use o número associado ao whatsapp [cliente, não do whatsapp do sistema]"
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.numeroSos,
      "5524992494030",
      "numeroSos deve utilizar por padrão o WhatsApp do Cliente Titular (5524992494030)",
    );
    assert.equal(
      VALORES_PADRAO_CANONICO_J16.numeroCenter,
      "5524992494030",
      "numeroCenter deve utilizar por padrão o WhatsApp do Cliente Titular (5524992494030)",
    );
  });

  test("6. obterDadosCobrancaClienteFactual identifica cliente isento (R$ 0,00) e não inventa cobrança de 59.90", async () => {
    // Dario Novaes possui valor_mensalidade: 0 cadastrado
    const dados = await obterDadosCobrancaClienteFactual(
      "592a5124-d8bc-47a6-aa8e-a744f0d65467",
      0,
      10,
    );

    assert.equal(dados.isento, true, "Cliente com mensalidade 0 deve ser identificado como isento");
    assert.equal(dados.valor, 0, "Valor a cobrar deve ser 0 (zero invenção de dados)");
    assert.notEqual(dados.valor, 59.9, "Nunca deve forçar fallback arbitrário de 59.90");
  });

  test("7. obterDadosCobrancaClienteFactual utiliza o valor factual do cadastro (R$ 45,00) de clientes com veículo ativo", async () => {
    // Alex Sandro possui veículo ativo (LTK1A94) e mensalidade 45
    const dados = await obterDadosCobrancaClienteFactual(
      "f4c2d6fb-e829-4507-bcfb-6b95143e04c4",
      45,
      10,
    );

    assert.equal(dados.isento, false, "Cliente com mensalidade 45 e veículo ativo não é isento");
    assert.equal(dados.valor, 45, "Deve respeitar rigorosamente o valor factual de R$ 45,00");
    assert.notEqual(dados.valor, 59.9, "Não deve inventar 59.90 para clientes de 45.00");
  });

  test("8. Regra Pétrea de Cobrança: Cliente aguardando instalação sem veículo ativo não inicia cobrança", async () => {
    // Weidisson está como aguardando_instalacao e sem veículo ativo
    const dados = await obterDadosCobrancaClienteFactual(
      "ee7f9f7d-7ab6-4ade-9fa1-313751cd1213",
      45,
      10,
    );

    assert.equal(
      dados.isento,
      true,
      "Cliente aguardando instalação não deve ter cobrança iniciada antes da ativação do 1º veículo",
    );
    assert.equal(dados.valor, 0, "Valor a cobrar deve ser 0");
    assert.ok(
      dados.mensagemAviso?.includes("Aguardando Instalação"),
      "Mensagem deve informar que a cobrança só inicia após ativação do 1º veículo",
    );
  });
});
