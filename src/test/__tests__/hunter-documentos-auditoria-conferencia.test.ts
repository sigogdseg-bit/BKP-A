import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcularSha256Buffer,
  extrairHashesCandidatosPdf,
  verificarDocumentoPdf,
  verificarDocumentoPorHash,
} from "../../features/seguranca/services/documentosService";
import {
  podeAcessarModulo,
  podeAcessarRota,
  MODULOS_PADRAO_OPERADOR,
} from "../../shared/lib/permissoesModulos";
import type { UserSession } from "../../features/auth/types";
import type { DocumentoEmitido } from "../../features/seguranca/types/documento";

describe("Hunter — Registro Forense de Documentos e Conferência de Integridade de PDFs", () => {
  test("1. Deve calcular hash SHA-256 idêntico e consistente via Web Crypto API", async () => {
    const encoder = new TextEncoder();
    const dados1 = encoder.encode("CONTRATO_OFICIAL_HUNTER_12345");
    const dados2 = encoder.encode("CONTRATO_OFICIAL_HUNTER_12345");
    const dadosAdulterados = encoder.encode("CONTRATO_OFICIAL_HUNTER_12345_ADULTERADO");

    const hash1 = await calcularSha256Buffer(dados1.buffer);
    const hash2 = await calcularSha256Buffer(dados2.buffer);
    const hashAdulterado = await calcularSha256Buffer(dadosAdulterados.buffer);

    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2, "Dados idênticos devem gerar hash SHA-256 idêntico");
    assert.notEqual(
      hash1,
      hashAdulterado,
      "Qualquer alteração nos dados deve gerar hash completamente distinto",
    );
  });

  test("2. Deve extrair hashes SHA-256 embutidos no corpo do documento PDF", () => {
    const hashExemplo = "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0";
    const textoPdfSimulado = `
      %PDF-1.4
      1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
      2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
      3 0 obj << /Type /Page /Contents 4 0 R >> endobj
      4 0 obj << /Length 120 >> stream
      BT /F1 12 Tf (Hash Forense SHA-256: ${hashExemplo}) Tj ET
      endstream endobj
    `;

    const buffer = new TextEncoder().encode(textoPdfSimulado).buffer;
    const hashesEncontrados = extrairHashesCandidatosPdf(buffer);

    assert.equal(hashesEncontrados.length, 1);
    assert.equal(hashesEncontrados[0], hashExemplo);
  });

  test("3. Permissões de Acesso: Operador e Administrador acessam Auditoria e Logs, enquanto Cliente e Instalador são bloqueados", () => {
    const sessaoOperador: UserSession = {
      userId: "op-1",
      email: "operador@hunter.local",
      nome: "Operador de Auditoria",
      role: "operador",
      modulos: MODULOS_PADRAO_OPERADOR,
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: true,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
    };

    const sessaoAdmin: UserSession = {
      userId: "adm-1",
      email: "novaes@oficial.tec.br",
      nome: "Super Administrador",
      role: "superadmin",
      modulos: ["todos"],
      isSuperAdmin: true,
      isAdmin: true,
      isOperador: true,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
    };

    const sessaoCliente: UserSession = {
      userId: "cli-1",
      email: "cliente@empresa.com",
      nome: "Cliente Titular",
      role: "cliente",
      modulos: ["monitor-gps", "mensalidades"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
    };

    const sessaoInstalador: UserSession = {
      userId: "inst-1",
      email: "instalador@hunter.local",
      nome: "Instalador Externo",
      role: "instalador",
      modulos: ["instalacao"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: false,
      isInstalador: true,
      isMotorista: false,
    };

    // Operador e Administrador têm permissão
    assert.equal(podeAcessarModulo(sessaoOperador, "logs"), true);
    assert.equal(podeAcessarRota(sessaoOperador, "/configuracao/logs"), true);

    assert.equal(podeAcessarModulo(sessaoAdmin, "logs"), true);
    assert.equal(podeAcessarRota(sessaoAdmin, "/configuracao/logs"), true);

    // Cliente e Instalador são ESTRITAMENTE bloqueados
    assert.equal(podeAcessarModulo(sessaoCliente, "logs"), false);
    assert.equal(podeAcessarRota(sessaoCliente, "/configuracao/logs"), false);

    assert.equal(podeAcessarModulo(sessaoInstalador, "logs"), false);
    assert.equal(podeAcessarRota(sessaoInstalador, "/configuracao/logs"), false);

    // Sessão nula / deslogado é bloqueada
    assert.equal(podeAcessarModulo(null, "logs"), false);
    assert.equal(podeAcessarRota(null, "/configuracao/logs"), false);
  });

  test("4. Interface e Estrutura Forense: Documento emitido possui todos os campos solicitados", () => {
    const docExemplo: DocumentoEmitido = {
      id: "doc-uuid-1",
      nome_arquivo: "Contrato_SIGO_Guardiao_Cliente_Exemplo_001.pdf",
      hash_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      tipo_documento: "CONTRATO_PRESTACAO_SERVICOS",
      descricao: "Contrato de Adesão Hunter - Cliente Exemplo (001/2026)",
      emissor_nome: "Operador Central",
      emissor_email: "operador@oficial.tec.br",
      emissor_role: "operador",
      tamanho_bytes: 145230,
      created_at: new Date().toISOString(),
    };

    assert.ok(docExemplo.nome_arquivo, "Deve possuir nome do arquivo");
    assert.ok(docExemplo.hash_sha256, "Deve possuir hash forense SHA-256");
    assert.ok(docExemplo.descricao, "Deve informar do que se trata");
    assert.ok(docExemplo.emissor_nome, "Deve informar quem emitiu");
    assert.ok(docExemplo.created_at, "Deve registrar data e hora da emissão");
    assert.equal(docExemplo.hash_sha256.length, 64);
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido nos serviços de documentos e auditoria", async () => {
    const fs = await import("fs/promises");
    const caminhos = [
      "src/features/seguranca/services/documentosService.ts",
      "src/features/seguranca/types/documento.ts",
      "src/features/seguranca/components/LogsView.tsx",
      "supabase/migrations/20260930180000_hunter_documentos_emitidos_e_auditoria.sql",
    ];

    for (const caminho of caminhos) {
      const conteudo = await fs.readFile(caminho, "utf-8");
      // Verifica ausência do caractere comercial proibido fora de imports e URLs permitidas
      const linhas = conteudo.split("\n");
      linhas.forEach((linha, idx) => {
        // Ignora imports de módulos do projeto com prefixo de alias
        if (linha.includes('from "@/') || linha.includes('import "@/')) return;
        // Permite em emails como @oficial.tec.br ou @hunter.local
        const linhaSemEmail = linha.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "");
        assert.ok(
          !linhaSemEmail.includes("@"),
          `Caractere proibido '@' encontrado no arquivo ${caminho} na linha ${idx + 1}: ${linha}`,
        );
      });
    }
  });
});
