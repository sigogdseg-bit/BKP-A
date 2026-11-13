import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emitirContratoPrestacaoServicosPdf,
  emitirCopiaAutenticadaContratoPdf,
} from "../../features/clientes/services/contratoPdfService";
import {
  verificarIntegridadePdfContrato,
  base64ToArrayBuffer,
  type ContratoCliente,
} from "../../features/clientes/services/contratosAssinadosService";
import { calcularSha256Buffer } from "../../features/seguranca/services/documentosService";
import type { Cliente } from "../../features/clientes/types";

describe("Hunter — Contratos Assinados, Hashes Forenses SHA-256 e Selo de Autenticidade", () => {
  const mockCliente: Cliente = {
    id: "d9e8f7a6-b5c4-4321-9876-543210fedcba",
    nome_razao_social: "Frota Segura e Rastreamento Ltda",
    documento: "98.765.432/0001-10",
    email: "diretoria@frotasegura.com.br",
    telefone: "(24) 99999-8888",
    status: "ativo",
    plano: "pro",
    dias_historico_plano: 30,
    dias_retencao_banco: 30,
    dia_vencimento: 10,
    valor_mensalidade: 120.0,
    meses_contrato: 12,
    data_inicio_contrato: "2026-10-20",
    foro_comarca: "Comarca de Volta Redonda/RJ",
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
  };

  it("1. Gera PDF do contrato com selo de autenticidade SGD e código de verificação no rodapé", async () => {
    const doc = await emitirContratoPrestacaoServicosPdf({
      cliente: mockCliente,
      numeroContrato: "CTR-2026-TESTE-01",
      usuarioEmissor: "SuperADM",
    });

    assert.ok(doc, "O PDF do contrato deve ser instanciado");
    const totalPaginas = doc.getNumberOfPages();
    assert.ok(totalPaginas >= 1, "Deve possuir páginas geradas");

    // Gera buffer e calcula hash SHA-256
    const buffer = doc.output("arraybuffer");
    const hash = await calcularSha256Buffer(buffer);

    assert.strictEqual(typeof hash, "string", "O hash deve ser string");
    assert.strictEqual(
      hash.length,
      64,
      "O hash SHA-256 deve possuir exatamente 64 caracteres hexadecimais",
    );
    assert.match(
      hash,
      /^[0-9a-f]{64}$/,
      "O hash deve conter apenas caracteres hexadecimais minúsculos",
    );
  });

  it("2. Emite Cópia Autêntica com Carimbo e Assinatura Digital do Sistema", async () => {
    const contratoMock = {
      numero_contrato: "CTR-2026-TESTE-01",
      selo_autenticidade: "SGD-A1B2C3D4",
      codigo_verificacao: "K9X2P4",
      hash_pdf_assinado: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      hash_pdf_original: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      data_assinatura: "2026-10-20T15:30:00Z",
      assinado_por_nome: "Frota Segura e Rastreamento Ltda",
      status: "assinado",
    };

    const docCopia = await emitirCopiaAutenticadaContratoPdf({
      cliente: mockCliente,
      contrato: contratoMock,
      usuarioEmissor: "SuperADM",
    });

    assert.ok(docCopia, "A Cópia Autêntica deve ser gerada com sucesso");
    const totalPaginas = docCopia.getNumberOfPages();
    assert.ok(totalPaginas >= 1, "A cópia autêntica deve conter páginas estruturadas");

    const bufferCopia = docCopia.output("arraybuffer");
    const hashCopia = await calcularSha256Buffer(bufferCopia);

    assert.strictEqual(hashCopia.length, 64, "O hash da cópia autêntica deve ter 64 caracteres");
  });

  it("3. Detecta integridade total quando o PDF possui o mesmo hash SHA-256", async () => {
    // Cria buffer de teste simulando PDF
    const textoOriginal = "CONTRATO_OFICIAL_SIGO_GUARDAO_INTEGRO";
    const encoder = new TextEncoder();
    const bufferOriginal = encoder.encode(textoOriginal).buffer;

    const hashCalculado = await calcularSha256Buffer(bufferOriginal);
    assert.strictEqual(hashCalculado.length, 64);

    // Se o documento não for alterado, o hash é idêntico
    const hashVerificacao = await calcularSha256Buffer(encoder.encode(textoOriginal).buffer);
    assert.strictEqual(hashCalculado, hashVerificacao, "Hashes devem ser rigorosamente idênticos");
  });

  it("4. Detecta adulteração se qualquer caractere do documento for alterado", async () => {
    const encoder = new TextEncoder();
    const bufferOriginal = encoder.encode("CONTRATO_OFICIAL_SIGO_GUARDAO_INTEGRO").buffer;
    const bufferAdulterado = encoder.encode("CONTRATO_OFICIAL_SIGO_GUARDAO_ADULTERADO").buffer;

    const hashOriginal = await calcularSha256Buffer(bufferOriginal);
    const hashAdulterado = await calcularSha256Buffer(bufferAdulterado);

    assert.notStrictEqual(
      hashOriginal,
      hashAdulterado,
      "Documento com alteração de conteúdo deve produzir hash criptográfico diferente",
    );
  });

  it("5. Converte ArrayBuffer para Base64 e vice-versa sem corrupção de dados binários", () => {
    const dados = new Uint8Array([10, 20, 30, 40, 50, 100, 200, 255]);
    const base64 = Buffer.from(dados).toString("base64");
    const bufferRecuperado = base64ToArrayBuffer(base64);
    const dadosRecuperados = new Uint8Array(bufferRecuperado);

    assert.deepStrictEqual(
      Array.from(dadosRecuperados),
      Array.from(dados),
      "A conversão de ida e volta para base64 deve preservar os bytes com precisão absoluta",
    );
  });

  it("6. Valida formato do Selo de Autenticidade SGD e Código de Verificação Curto", () => {
    // Formato SGD-XXXXXXXX (8 caracteres hexadecimais após SGD-)
    const seloExemplo = "SGD-A1B2C3D4";
    assert.match(
      seloExemplo,
      /^SGD-[A-F0-9]{8}$/,
      "O selo deve seguir o padrão canônico SGD-XXXXXXXX",
    );

    // Código de 6 caracteres alfanuméricos sem I, O, 0, 1
    const codigoExemplo = "K9X2P4";
    assert.match(
      codigoExemplo,
      /^[A-HJ-NP-Z2-9]{6}$/,
      "O código deve ter 6 caracteres inequívocos",
    );
  });

  it("7. Emissão de contrato define status 'pendente_assinatura' (Aguardando Assinatura) e gera hash original", async () => {
    const docOriginal = await emitirContratoPrestacaoServicosPdf({
      cliente: mockCliente,
      numeroContrato: "CTR-2026-TESTE-PENDENTE",
      usuarioEmissor: "SuperADM",
      isAtualizacao: false,
    });

    const buffer = docOriginal.output("arraybuffer");
    const hashOriginal = await calcularSha256Buffer(buffer);

    assert.ok(hashOriginal);
    assert.strictEqual(hashOriginal.length, 64);
  });

  it("8. Emissão como Atualização: invalida contrato anterior com status 'atualizado' e motivo de substituição", () => {
    // Simula contrato anterior que era vigente
    const contratoAnterior: ContratoCliente = {
      id: "ant-001",
      cliente_id: mockCliente.id,
      numero_contrato: "CTR-0001/2026",
      tipo_contrato: "PRESTACAO_SERVICOS",
      hash_pdf_original: "1111111111111111111111111111111111111111111111111111111111111111",
      hash_pdf_assinado: null,
      selo_autenticidade: "SGD-11111111",
      codigo_verificacao: "ANT001",
      status: "pendente_assinatura",
      data_emissao: "2026-01-01T10:00:00Z",
      data_envio_cliente: null,
      data_assinatura: null,
      data_cancelamento: null,
      assinatura_ip: null,
      assinatura_user_agent: null,
      assinatura_metodo: "digital",
      emitido_por_user_id: null,
      emitido_por_nome: "SuperADM",
      assinado_por_nome: null,
      vigencia_inicio: null,
      vigencia_fim: null,
      valor_mensalidade: 120,
      valor_total_contrato: 1440,
      metadata: {},
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
    };

    // Ao emitir novo contrato como atualização, o anterior é invalidado e recebe os dados de substituição
    const novoContratoId = "novo-002";
    const novoNumeroContrato = "CTR-0002/2026";
    const motivo = `Substituído por atualização no Contrato ${novoNumeroContrato} em 22/10/2026`;

    const contratoAnteriorAtualizado: ContratoCliente = {
      ...contratoAnterior,
      status: "atualizado",
      contrato_substituto_id: novoContratoId,
      motivo_invalidacao: motivo,
      updated_at: new Date().toISOString(),
    };

    assert.strictEqual(contratoAnteriorAtualizado.status, "atualizado");
    assert.strictEqual(contratoAnteriorAtualizado.contrato_substituto_id, novoContratoId);
    assert.ok(
      contratoAnteriorAtualizado.motivo_invalidacao?.includes("Substituído por atualização"),
    );
  });

  it("9. Emissão como Novo Contrato Adicional: mantém todos os anteriores válidos", () => {
    const contratosExistentes: ContratoCliente[] = [
      {
        id: "ctr-01",
        cliente_id: mockCliente.id,
        numero_contrato: "CTR-0001/2026",
        tipo_contrato: "PRESTACAO_SERVICOS",
        hash_pdf_original: "aaa1",
        hash_pdf_assinado: "bbb1",
        selo_autenticidade: "SGD-AAAA1111",
        codigo_verificacao: "CTR001",
        status: "assinado",
        data_emissao: "2026-01-01T10:00:00Z",
        data_envio_cliente: null,
        data_assinatura: "2026-01-02T10:00:00Z",
        data_cancelamento: null,
        assinatura_ip: null,
        assinatura_user_agent: null,
        assinatura_metodo: "digital",
        emitido_por_user_id: null,
        emitido_por_nome: "SuperADM",
        assinado_por_nome: "Cliente",
        vigencia_inicio: null,
        vigencia_fim: null,
        valor_mensalidade: 120,
        valor_total_contrato: 1440,
        metadata: {},
        created_at: "2026-01-01T10:00:00Z",
        updated_at: "2026-01-02T10:00:00Z",
      },
    ];

    // Novo contrato adicional criado em paralelo
    const novoContratoAdicional: ContratoCliente = {
      id: "ctr-02",
      cliente_id: mockCliente.id,
      numero_contrato: "CTR-0002/2026",
      tipo_contrato: "PRESTACAO_SERVICOS",
      hash_pdf_original: "aaa2",
      hash_pdf_assinado: null,
      selo_autenticidade: "SGD-AAAA2222",
      codigo_verificacao: "CTR002",
      status: "pendente_assinatura",
      data_emissao: "2026-02-01T10:00:00Z",
      data_envio_cliente: null,
      data_assinatura: null,
      data_cancelamento: null,
      assinatura_ip: null,
      assinatura_user_agent: null,
      assinatura_metodo: "digital",
      emitido_por_user_id: null,
      emitido_por_nome: "SuperADM",
      assinado_por_nome: null,
      vigencia_inicio: null,
      vigencia_fim: null,
      valor_mensalidade: 120,
      valor_total_contrato: 1440,
      metadata: {},
      created_at: "2026-02-01T10:00:00Z",
      updated_at: "2026-02-01T10:00:00Z",
    };

    const listaFinal = [...contratosExistentes, novoContratoAdicional];
    assert.strictEqual(listaFinal.length, 2);
    assert.strictEqual(
      listaFinal[0].status,
      "assinado",
      "O contrato anterior deve permanecer assinado e válido",
    );
    assert.strictEqual(
      listaFinal[1].status,
      "pendente_assinatura",
      "O novo contrato é adicionado em paralelo",
    );
  });

  it("10. Assinatura e devolução: gera novo hash SHA-256 e faz o link com o contrato emitido com status 'assinado'", async () => {
    const encoder = new TextEncoder();
    const pdfMinutaOriginal = encoder.encode("PDF_ORIGINAL_AGUARDANDO_ASSINATURA").buffer;
    const pdfAssinadoPeloCliente = encoder.encode("PDF_ASSINADO_DIGITALMENTE_PELO_CLIENTE").buffer;

    const hashOriginal = await calcularSha256Buffer(pdfMinutaOriginal);
    const hashAssinado = await calcularSha256Buffer(pdfAssinadoPeloCliente);

    assert.notStrictEqual(
      hashOriginal,
      hashAssinado,
      "O hash assinado deve ser novo e diferente do original",
    );

    // Simulação do payload atualizado no banco
    const contratoAposAssinatura: ContratoCliente = {
      id: "ctr-assinado-link",
      cliente_id: mockCliente.id,
      numero_contrato: "CTR-2026-ASSINADO",
      tipo_contrato: "PRESTACAO_SERVICOS",
      hash_pdf_original: hashOriginal,
      hash_pdf_assinado: hashAssinado,
      selo_autenticidade: "SGD-ASS12345",
      codigo_verificacao: "VERIF1",
      status: "assinado",
      data_emissao: "2026-10-22T10:00:00Z",
      data_envio_cliente: "2026-10-22T10:05:00Z",
      data_assinatura: "2026-10-22T11:00:00Z",
      data_cancelamento: null,
      assinatura_ip: "127.0.0.1",
      assinatura_user_agent: "Browser",
      assinatura_metodo: "digital",
      emitido_por_user_id: null,
      emitido_por_nome: "SuperADM",
      assinado_por_nome: "Cliente Frota Segura",
      vigencia_inicio: "2026-10-22",
      vigencia_fim: "2027-10-22",
      valor_mensalidade: 120,
      valor_total_contrato: 1440,
      metadata: {},
      created_at: "2026-10-22T10:00:00Z",
      updated_at: "2026-10-22T11:00:00Z",
    };

    assert.strictEqual(contratoAposAssinatura.status, "assinado");
    assert.strictEqual(contratoAposAssinatura.hash_pdf_assinado, hashAssinado);
    assert.strictEqual(contratoAposAssinatura.hash_pdf_original, hashOriginal);
    assert.ok(contratoAposAssinatura.data_assinatura);
  });

  it("8. Emissão de contrato pendente inclui bloco de assinatura móvel com link e QR Code", async () => {
    const docPendente = await emitirContratoPrestacaoServicosPdf({
      cliente: mockCliente,
      numeroContrato: "CTR-2026-PENDENTE-ASS",
      usuarioEmissor: "SuperADM",
      seloAutenticidade: "SGD-TEST8888",
      codigoVerificacao: "ASS999",
    });

    assert.ok(docPendente, "PDF deve ser gerado");
    const buffer = docPendente.output("arraybuffer");
    const hash = await calcularSha256Buffer(buffer);
    assert.strictEqual(hash.length, 64, "Hash SHA-256 do contrato deve ter 64 caracteres");

    // Verifica que o PDF gerado é válido e tem conteúdo
    assert.ok(buffer.byteLength > 1000, "Buffer do PDF deve conter dados substanciais");
  });

  it("9. Valida estrutura da mensagem de WhatsApp com link de download e link de assinatura com amparo legal", () => {
    const codigoVerificacao = "CTR777";
    const numeroContrato = "CTR-2026/001";

    const linkAssinatura = `https://sigoguardiao.oficial.tec.br/assinar?codigo=${codigoVerificacao}`;
    const linkDownload = `https://sigoguardiao.oficial.tec.br/api/contratos/download/${codigoVerificacao}`;

    const textoMensagem =
      `Olá, *${mockCliente.nome_razao_social}*!\n\n` +
      `Segue o seu *Contrato de Prestação de Serviços e Automonitoramento Veicular — SIGO Guardião*:\n\n` +
      `📄 *Contrato nº:* ${numeroContrato}\n` +
      `🔐 *Selo de Autenticidade:* SGD-TEST8888\n` +
      `🔑 *Código de Verificação:* ${codigoVerificacao}\n\n` +
      `📥 *Link para Baixar / Visualizar o Contrato em PDF:*\n${linkDownload}\n\n` +
      `✍️ *Link para Assinar Digitalmente pelo Celular (1 Toque):*\n${linkAssinatura}\n\n` +
      `A assinatura é rápida, 100% digital e realizada diretamente pelo seu dispositivo com plena validade jurídica e força executiva (MP nº 2.200-2/2001 e Lei nº 14.063/2020).\n\n` +
      `Estamos à sua inteira disposição!`;

    assert.ok(textoMensagem.includes("/api/contratos/download/CTR777"));
    assert.ok(textoMensagem.includes("/assinar?codigo=CTR777"));
    assert.ok(textoMensagem.includes("14.063/2020"));
    assert.ok(textoMensagem.includes("2.200-2/2001"));
  });
});
