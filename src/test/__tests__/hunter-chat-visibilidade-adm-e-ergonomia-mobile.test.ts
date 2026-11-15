import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Chat: Visibilidade do ADM, Não Lidas e Ergonomia Mobile (DJR-NEW)", () => {
  const chatViewPath = path.resolve(process.cwd(), "src/features/chat/components/ChatView.tsx");
  const conversaChatPath = path.resolve(
    process.cwd(),
    "src/features/chat/components/ConversaChat.tsx",
  );
  const listaConversasPath = path.resolve(
    process.cwd(),
    "src/features/chat/components/ListaConversasRealizadas.tsx",
  );
  const chatServicePath = path.resolve(process.cwd(), "src/features/chat/services/chatService.ts");
  const appHeaderPath = path.resolve(process.cwd(), "src/features/layout/components/AppHeader.tsx");

  const chatViewCode = fs.readFileSync(chatViewPath, "utf-8");
  const conversaChatCode = fs.readFileSync(conversaChatPath, "utf-8");
  const listaConversasCode = fs.readFileSync(listaConversasPath, "utf-8");
  const chatServiceCode = fs.readFileSync(chatServicePath, "utf-8");
  const appHeaderCode = fs.readFileSync(appHeaderPath, "utf-8");

  it("1. Ergonomia Mobile: ConversaChat e ListaConversasRealizadas não devem ficar presas em fixed z-40 sob o AppHeader", () => {
    assert.ok(
      !conversaChatCode.includes("fixed left-0 right-0 z-40"),
      "ConversaChat não deve ter fixed left-0 right-0 z-40 que sobrepõe o AppHeader e esconde o botão de voltar",
    );
    assert.ok(
      !listaConversasCode.includes("fixed inset-0 z-40"),
      "ListaConversasRealizadas não deve ter fixed inset-0 z-40 que oculta o botão de voltar sob o AppHeader",
    );
    assert.ok(
      conversaChatCode.includes("Voltar"),
      "ConversaChat deve possuir botão Voltar com texto visível no mobile",
    );
    assert.ok(
      listaConversasCode.includes("Voltar"),
      "ListaConversasRealizadas deve possuir botão Voltar com texto visível no mobile",
    );
  });

  it("2. Eliminação de Blur no Topo: AppHeader deve possuir cor de fundo sólida sem backdrop-blur", () => {
    assert.ok(
      !appHeaderCode.includes("backdrop-blur-md"),
      "AppHeader não deve conter backdrop-blur-md gerando névoa no topo da tela do iOS",
    );
    assert.ok(
      appHeaderCode.includes("bg-[#fbf2e9] dark:bg-[#110e0c]"),
      "AppHeader deve usar background 100% sólido",
    );
  });

  it("3. Blindagem de Mensagens Não Lidas: Remetente nunca deve contar mensagens enviadas por ele mesmo", () => {
    assert.ok(
      chatServiceCode.includes('.neq("remetente_user_id", userId)'),
      "contarMensagensNaoLidas deve filtrar estritamente mensagens enviadas pelo próprio usuário",
    );
    assert.ok(
      chatServiceCode.includes("Notificações Ativadas"),
      "chatService deve desconsiderar notificações de ativação para não inflar badge de chat",
    );
    assert.ok(
      chatServiceCode.includes("limparNotificacoesChatInvalidas"),
      "chatService deve exportar função de autocura para limpar notificações inválidas",
    );
  });

  it("4. Regra de Negócio Canônica: Administrador em modo oculto deve ficar online ao enviar mensagem no chat", () => {
    assert.ok(
      chatViewCode.includes("session.isAdmin && !visivelParaClientes"),
      "ChatView deve checar se o Administrador está invisível antes do envio",
    );
    assert.ok(
      chatViewCode.includes("setVisivelParaClientes(true)"),
      "ChatView deve ativar a visibilidade do ADM antes de disparar a mensagem",
    );
    assert.ok(
      conversaChatCode.includes("Modo Oculto"),
      "ConversaChat deve alertar o Administrador de que ele ficará online automaticamente ao enviar mensagem",
    );
  });

  it("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", () => {
    const todosCodigos = [
      chatViewCode,
      conversaChatCode,
      listaConversasCode,
      chatServiceCode,
      appHeaderCode,
    ];
    for (const codigo of todosCodigos) {
      // Ignora operadores lógicos (&&) e entidades HTML (&quot;, etc se houver)
      const semOperadoresLogicos = codigo.replace(/&&/g, "").replace(/&amp;/g, "");
      const ocorrenciasComerciais = semOperadoresLogicos.match(/\s&\s/g);
      assert.strictEqual(
        ocorrenciasComerciais,
        null,
        "Não deve conter caractere comercial proibido solto como conjunção (usar sempre 'e')",
      );
    }
  });
});
