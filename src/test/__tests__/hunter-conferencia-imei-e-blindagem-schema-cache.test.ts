import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizarMensagemErro } from "../../shared/utils/erroAmigavel.js";
import { conferirCorrespondenciaIdentificador } from "../../shared/utils/conferenciaIdentificador.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");

describe("Hunter — Conferência Instantânea de IMEI e Blindagem Absoluta contra Schema Cache", () => {
  it("1. conferenciaIdentificador.ts: valida qualquer código que coincidir com o esperado (1, 2, 4 ou 15 dígitos)", () => {
    // Caso do usuário: código de teste curto '1234'
    const res1234 = conferirCorrespondenciaIdentificador("1234", "1234");
    assert.strictEqual(res1234.confere, true, "IMEI curto '1234' igual ao esperado DEVE validar.");
    assert.strictEqual(res1234.valorFormatado, "1234");

    // Código ultra-curto (2 dígitos)
    const res2Digitos = conferirCorrespondenciaIdentificador("99", "99");
    assert.strictEqual(res2Digitos.confere, true, "Código '99' igual ao esperado DEVE validar.");

    // Código longo tradicional (15 dígitos) com traços
    const res15 = conferirCorrespondenciaIdentificador("869-890-084-890-007", "869890084890007");
    assert.strictEqual(res15.confere, true, "IMEI de 15 dígitos com traços DEVE validar.");

    // Alfanumérico case-insensitive
    const resAlnum = conferirCorrespondenciaIdentificador("j16-4g", "J16-4G");
    assert.strictEqual(resAlnum.confere, true, "Alfanumérico case-insensitive DEVE validar.");

    // Divergência real deve rejeitar amigavelmente
    const resDiv = conferirCorrespondenciaIdentificador("9999", "1234");
    assert.strictEqual(resDiv.confere, false, "Código divergente deve ser rejeitado.");
    assert.ok(
      resDiv.mensagem.includes("diverge do esperado"),
      "Mensagem deve informar divergência claramente.",
    );
  });

  it("2. CameraBarcodeScannerModal.tsx: utiliza conferirCorrespondenciaIdentificador e remove restrições de tamanho", () => {
    const filePath = path.join(root, "src/shared/components/CameraBarcodeScannerModal.tsx");
    assert.ok(fs.existsSync(filePath), "CameraBarcodeScannerModal.tsx deve existir.");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("conferirCorrespondenciaIdentificador"),
      "CameraBarcodeScannerModal.tsx deve integrar o módulo canônico conferirCorrespondenciaIdentificador.",
    );

    assert.ok(
      content.includes("handleSubmitManual") &&
        content.includes("processarCodigoLido(codigoDigitado, true)"),
      "Digitação manual deve processar sem restrições artificiais.",
    );
  });

  it("3. erroAmigavel.ts: sanitizarMensagemErro blinda e higieniza qualquer jargão de schema cache ou PostgREST", () => {
    const erroCache =
      "Could not find the function public.instalador_solicitar_endereco_cliente(p_instalacao_id) in the schema cache";
    const sanitizado = sanitizarMensagemErro(erroCache);

    assert.ok(
      !sanitizado.toLowerCase().includes("schema cache"),
      "Mensagem não deve conter termo 'schema cache'.",
    );
    assert.ok(
      !sanitizado.toLowerCase().includes("p_instalacao_id"),
      "Mensagem não deve expor parâmetros de RPC.",
    );
    assert.strictEqual(
      sanitizado,
      "A sincronização com o servidor está em andamento. A solicitação foi registrada.",
    );

    const erroPgrst = { message: "PGRST204: column solicita_endereco_cliente does not exist" };
    const sanitizadoPgrst = sanitizarMensagemErro(erroPgrst);
    assert.ok(!sanitizadoPgrst.includes("PGRST204"), "Mensagem não deve expor códigos PGRST.");
  });

  it("4. toastInterceptor.ts: interceptor global existe e está ativo no root", () => {
    const interceptorPath = path.join(root, "src/shared/lib/toastInterceptor.ts");
    const rootPath = path.join(root, "src/routes/__root.tsx");

    assert.ok(fs.existsSync(interceptorPath), "toastInterceptor.ts deve existir.");
    assert.ok(fs.existsSync(rootPath), "__root.tsx deve existir.");

    const interceptorContent = fs.readFileSync(interceptorPath, "utf-8");
    const rootContent = fs.readFileSync(rootPath, "utf-8");

    assert.ok(
      interceptorContent.includes("ativarInterceptorGlobalDeToast") &&
        interceptorContent.includes("sanitizarMensagemErro"),
      "toastInterceptor deve monkey-patchar os toasts com sanitizarMensagemErro.",
    );

    assert.ok(
      rootContent.includes('import "@/shared/lib/toastInterceptor";'),
      "__root.tsx deve importar o interceptor global compulsoriamente.",
    );
  });

  it("5. client.ts: Proxy do Supabase intercepta chamadas RPC e sanitiza erros na raiz", () => {
    const clientPath = path.join(root, "src/integrations/supabase/client.ts");
    assert.ok(fs.existsSync(clientPath), "client.ts deve existir.");
    const content = fs.readFileSync(clientPath, "utf-8");

    assert.ok(
      content.includes('prop === "rpc"') &&
        content.includes("res.error.message = sanitizarMensagemErro(msgCrua)"),
      "client.ts deve interceptar erros de RPC e sanitizar message compulsoriamente.",
    );
  });

  it("6. instalacaoService.ts: possui fallbacks defensivos resilientes para agendamento e endereço", () => {
    const filePath = path.join(root, "src/features/instalacoes/services/instalacaoService.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("instaladorSolicitarEnderecoCliente") &&
        content.includes("enviarNotificacaoViaBd") &&
        content.includes("destinatarioClienteId: inst.cliente_id"),
      "instaladorSolicitarEnderecoCliente deve notificar cliente diretamente via BD no fallback defensivo.",
    );

    assert.ok(
      content.includes("clienteInformarEnderecoInstalacao") &&
        content.includes("destinatarioUserId: inst.instalador_id"),
      "clienteInformarEnderecoInstalacao deve notificar técnico via BD no fallback defensivo.",
    );
  });

  it("7. rastreadorChipService.ts: instaladorConfirmarKit aceita IMEI igual ao esperado mesmo com 4 dígitos", () => {
    const filePath = path.join(root, "src/features/estoque/services/rastreadorChipService.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("instaladorConfirmarKit") && content.includes("imeiLimpo === espLimpo"),
      "instaladorConfirmarKit deve validar correspondência direta de IMEI sem bloqueio de tamanho.",
    );
  });

  it("8. Migrações e Script Mestre: instalador_confirmar_kit atualizada sem bloqueio LENGTH < 8", () => {
    const migPath = path.join(
      root,
      "supabase/migrations/20261010110000_hunter_fix_confirmacao_imei_e_rpc_endereco.sql",
    );
    const mestrePath = path.join(root, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(fs.existsSync(migPath), "Nova migration deve existir.");
    assert.ok(fs.existsSync(mestrePath), "Script mestre deve existir.");

    const migContent = fs.readFileSync(migPath, "utf-8");
    const mestreContent = fs.readFileSync(mestrePath, "utf-8");

    assert.ok(
      !migContent.includes("LENGTH(v_imei_limpo) < 8"),
      "Nova migration não deve conter bloqueio rígido de 8 dígitos para IMEI esperado.",
    );
    assert.ok(
      migContent.includes("v_conferido_limpo = v_esperado_limpo"),
      "Nova migration deve validar correspondência com o IMEI esperado.",
    );
    assert.ok(
      mestreContent.includes("v_conferido_limpo = v_esperado_limpo"),
      "Script mestre deve conter a versão atualizada da função de confirmação de kit.",
    );
  });
});
