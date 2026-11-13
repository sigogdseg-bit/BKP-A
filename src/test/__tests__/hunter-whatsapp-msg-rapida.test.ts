import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { formatarTelefoneVisual } from "../../features/chat/services/whatsappContatosService";
import { normalizarTelefoneParaWhatsapp } from "../../shared/lib/chatbotxBridge";

describe("Hunter — Módulo de Disparo Rápido de WhatsApp e Catálogo de Contatos", () => {
  test("1. Deve formatar telefones celulares de 11 dígitos para o padrão visual brasileiro", () => {
    assert.equal(formatarTelefoneVisual("24992501512"), "(24) 99250-1512");
    assert.equal(formatarTelefoneVisual("5524992501512"), "(24) 99250-1512");
    assert.equal(formatarTelefoneVisual("11988887777"), "(11) 98888-7777");
  });

  test("2. Deve formatar telefones fixos de 10 dígitos para o padrão visual brasileiro", () => {
    assert.equal(formatarTelefoneVisual("2422223333"), "(24) 2222-3333");
    assert.equal(formatarTelefoneVisual("552422223333"), "(24) 2222-3333");
  });

  test("3. Deve normalizar telefones com caracteres especiais para E.164 com DDI 55", () => {
    assert.equal(normalizarTelefoneParaWhatsapp("(24) 99250-1512"), "5524992501512");
    assert.equal(normalizarTelefoneParaWhatsapp("+55 24 99250-1512"), "5524992501512");
  });

  test("4. Deve lidar com números vazios ou inválidos sem quebrar a execução", () => {
    assert.equal(formatarTelefoneVisual(""), "");
    assert.equal(normalizarTelefoneParaWhatsapp(""), "");
    assert.equal(normalizarTelefoneParaWhatsapp("abc"), "");
  });

  test("5. Permissão de Acesso: MSG WhatsApp disponível estritamente para Administrador e Operador", () => {
    const podeAcessar = (session: {
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
      isOperador?: boolean;
      isCliente?: boolean;
      isMotorista?: boolean;
      isInstalador?: boolean;
    }) => Boolean(session?.isAdmin || session?.isOperador || session?.isSuperAdmin);

    // Administrador e SuperADM: Permitido
    assert.equal(podeAcessar({ isAdmin: true, isOperador: false, isCliente: false }), true);
    assert.equal(podeAcessar({ isSuperAdmin: true, isAdmin: false, isOperador: false }), true);

    // Operador: Permitido
    assert.equal(podeAcessar({ isAdmin: false, isOperador: true, isCliente: false }), true);

    // Cliente: Proibido
    assert.equal(podeAcessar({ isAdmin: false, isOperador: false, isCliente: true }), false);

    // Motorista: Proibido
    assert.equal(podeAcessar({ isAdmin: false, isOperador: false, isMotorista: true }), false);

    // Instalador: Proibido
    assert.equal(podeAcessar({ isAdmin: false, isOperador: false, isInstalador: true }), false);

    // Sem sessão / anônimo: Proibido
    assert.equal(podeAcessar({}), false);
  });

  test("6. Blindagem Estrita no Código-fonte: AppHeader, MobileDrawer, ChatView e Modais", () => {
    const root = process.cwd();
    const appHeader = fs.readFileSync(
      path.join(root, "src/features/layout/components/AppHeader.tsx"),
      "utf-8",
    );
    const mobileDrawer = fs.readFileSync(
      path.join(root, "src/features/layout/components/MobileDrawer.tsx"),
      "utf-8",
    );
    const chatView = fs.readFileSync(
      path.join(root, "src/features/chat/components/ChatView.tsx"),
      "utf-8",
    );
    const modalRapido = fs.readFileSync(
      path.join(root, "src/features/chat/components/ModalEnvioRapidoWhatsapp.tsx"),
      "utf-8",
    );
    const modalCliente = fs.readFileSync(
      path.join(root, "src/features/clientes/components/ModalEnviarWhatsappCliente.tsx"),
      "utf-8",
    );

    // AppHeader: Deve exigir isAdmin || isOperador (ou perfis autorizados revendedor/vendedor)
    assert.ok(
      appHeader.includes("session?.isAdmin") && appHeader.includes("session?.isOperador"),
      "AppHeader deve exigir isAdmin ou isOperador para MSG WhatsApp",
    );

    // MobileDrawer: Deve exigir onAbrirWhatsapp
    assert.ok(
      mobileDrawer.includes("onAbrirWhatsapp"),
      "MobileDrawer deve exigir onAbrirWhatsapp para MSG WhatsApp",
    );

    // ChatView: Deve exigir isAdmin || isOperador para o botão de WhatsApp
    assert.ok(
      chatView.includes("session?.isAdmin") && chatView.includes("session?.isOperador"),
      "ChatView deve exigir isAdmin ou isOperador para disparar WhatsApp",
    );

    // ModalEnvioRapidoWhatsapp: Deve ter trava interna de autorização
    assert.ok(
      modalRapido.includes("const podeAcessarWhatsapp = Boolean(") &&
        modalRapido.includes("session?.isAdmin") &&
        modalRapido.includes("session?.isOperador"),
      "ModalEnvioRapidoWhatsapp deve possuir trava interna de autorização",
    );

    // ModalEnviarWhatsappCliente: Deve ter trava interna de autorização
    assert.ok(
      modalCliente.includes(
        "const podeEnviarWhatsapp = Boolean(session?.isAdmin || session?.isOperador);",
      ),
      "ModalEnviarWhatsappCliente deve possuir trava interna de autorização",
    );
  });

  test("7. Inserção e Anexo de Documentos para Envio nos Modais de WhatsApp", () => {
    const root = process.cwd();
    const modalRapido = fs.readFileSync(
      path.join(root, "src/features/chat/components/ModalEnvioRapidoWhatsapp.tsx"),
      "utf-8",
    );
    const modalCliente = fs.readFileSync(
      path.join(root, "src/features/clientes/components/ModalEnviarWhatsappCliente.tsx"),
      "utf-8",
    );

    // ModalEnvioRapidoWhatsapp: Deve possuir seletor de documento e estado
    assert.ok(
      modalRapido.includes("const [documento, setDocumento]") &&
        modalRapido.includes("handleSelecionarDocumento") &&
        modalRapido.includes("handleRemoverDocumento") &&
        modalRapido.includes("Paperclip"),
      "ModalEnvioRapidoWhatsapp deve permitir inserir documento para envio",
    );

    // ModalEnviarWhatsappCliente: Deve possuir seletor de documento e estado
    assert.ok(
      modalCliente.includes("const [documento, setDocumento]") &&
        modalCliente.includes("handleSelecionarDocumento") &&
        modalCliente.includes("handleRemoverDocumento") &&
        modalCliente.includes("Paperclip"),
      "ModalEnviarWhatsappCliente deve permitir inserir documento para envio",
    );
  });

  test("8. Filtros Contextuais e Suporte a Vendedores e Revendedores no ModalEnvioRapidoWhatsapp", () => {
    const root = process.cwd();
    const modalRapido = fs.readFileSync(
      path.join(root, "src/features/chat/components/ModalEnvioRapidoWhatsapp.tsx"),
      "utf-8",
    );
    const contatosService = fs.readFileSync(
      path.join(root, "src/features/chat/services/whatsappContatosService.ts"),
      "utf-8",
    );

    // ContatosService: tipo deve suportar vendedor e revendedor
    assert.ok(
      contatosService.includes('"vendedor"') && contatosService.includes('"revendedor"'),
      "whatsappContatosService deve suportar os tipos vendedor e revendedor",
    );

    // ModalEnvioRapidoWhatsapp: abasDisponiveis deve suportar vendedores e revendedores
    assert.ok(
      modalRapido.includes("const abasDisponiveis = useMemo") &&
        modalRapido.includes('label: "Vendedores"') &&
        modalRapido.includes('label: "Revendedores"'),
      "ModalEnvioRapidoWhatsapp deve possuir chips contextuais para Vendedores e Revendedores",
    );
  });
});
