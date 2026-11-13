// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Isolamento de Mensalidades, Informar Pagamento e Alerta Veicular (DJR-NEW)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Isolamento de Mensalidades, Informar Pagamento e Alerta Veicular", () => {
  it("1. MensalidadesView: Isolamento estrito de faturas para o perfil Cliente", () => {
    const filePath = path.resolve(
      __dirname,
      "../../features/mensalidades/components/MensalidadesView.tsx",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Deve chamar listarMensalidades com filtro de cliente
    assert.ok(
      content.includes("listarMensalidades(clienteIdFiltro)"),
      "MensalidadesView deve repassar o clienteIdFiltro para listarMensalidades",
    );

    // Deve conter blindagem defensiva no filtro filtrados
    assert.ok(
      content.includes(
        "if (session?.isCliente && session?.clienteId && m.cliente_id !== session.clienteId)",
      ),
      "MensalidadesView deve conter filtro defensivo isolando faturas pelo clienteId autenticado",
    );

    // Botão Notificar deve estar restrito ao Administrador
    assert.ok(content.includes("isAdm ? ("), "Botão de notificar deve estar condicionado a isAdm");

    // Cliente deve visualizar botão Informar Pagamento ou status de Aguardando Baixa
    assert.ok(
      content.includes("Informar Pagamento"),
      "Deve conter o botão Informar Pagamento para o cliente",
    );
    assert.ok(
      content.includes("Aguardando Baixa"),
      "Deve conter indicador de Aguardando Baixa para cobranças com pagamento informado",
    );
  });

  it("2. ModalInformarPagamento: Componente permite anexo, data, observações e atalho PIX", () => {
    const filePath = path.resolve(
      __dirname,
      "../../features/mensalidades/components/ModalInformarPagamento.tsx",
    );
    assert.ok(fs.existsSync(filePath), "ModalInformarPagamento.tsx deve existir");

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      content.includes("informarPagamentoCliente"),
      "Deve invocar a função de serviço informarPagamentoCliente",
    );
    assert.ok(
      content.includes("handleCopiarChavePix"),
      "Deve fornecer botão com cópia rápida da chave PIX",
    );
    assert.ok(
      content.includes("handleArquivoSelecionado"),
      "Deve suportar seleção de arquivo de comprovante (imagem ou PDF)",
    );
  });

  it("3. BannerPagamentosAguardandoBaixa: Banner permanente no topo para o SuperADM", () => {
    const filePath = path.resolve(
      __dirname,
      "../../features/mensalidades/components/BannerPagamentosAguardandoBaixa.tsx",
    );
    assert.ok(fs.existsSync(filePath), "BannerPagamentosAguardandoBaixa.tsx deve existir");

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      content.includes("obterMensalidadesAguardandoBaixa"),
      "Deve buscar mensalidades aguardando baixa",
    );
    assert.ok(
      content.includes("hunter_mensalidades_aguardando_baixa_realtime"),
      "Deve escutar canal de tempo real no Supabase para sincronização instantânea",
    );
    assert.ok(
      content.includes("darBaixaPagamento"),
      "Deve permitir confirmar baixa de pagamento com um toque",
    );

    // Verifica montagem no layout autenticado
    const layoutPath = path.resolve(__dirname, "../../routes/_authenticated.tsx");
    const layoutContent = fs.readFileSync(layoutPath, "utf-8");
    assert.ok(
      layoutContent.includes("<BannerPagamentosAguardandoBaixa />"),
      "Banner deve estar montado no layout autenticado para administradores",
    );
  });

  it("4. Backend Server: Endpoints /api/mensalidades/informar-pagamento e aguardando-baixa", () => {
    const filePath = path.resolve(__dirname, "../../server.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("/api/mensalidades/informar-pagamento"),
      "Servidor deve conter rota POST /api/mensalidades/informar-pagamento",
    );
    assert.ok(
      content.includes("/api/mensalidades/aguardando-baixa"),
      "Servidor deve conter rota GET /api/mensalidades/aguardando-baixa",
    );
    assert.ok(
      content.includes("despacharNotificacaoWhatsappSuperAdm"),
      "Deve despachar mensagem WhatsApp imediata para o SuperADM ao informar pagamento",
    );
  });

  it("5. Backend Server: Extração heurística resiliente de placa veicular no push", () => {
    const filePath = path.resolve(__dirname, "../../server.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Regex de captura de placa Mercosul e cinza caso payload venha nulo
    assert.ok(
      content.includes("matchPlaca"),
      "Servidor deve conter extração de placa veicular via regex em /api/push/disparar",
    );
    assert.ok(
      content.includes("excesso_velocidade"),
      "Servidor deve inferir o tipo canônico de alerta caso enviado como genérico",
    );
  });

  it("6. Migração SQL: Colunas, RLS e inclusão compulsória de placa e tipo na trigger", () => {
    const migrationPath = path.resolve(
      __dirname,
      "../../../supabase/migrations/20261109140000_hunter_mensalidades_informar_pagamento_e_alerta_placa.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração SQL deve existir");

    const content = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      content.includes("pagamento_informado_em TIMESTAMPTZ"),
      "Deve adicionar coluna pagamento_informado_em",
    );
    assert.ok(
      content.includes("pagamento_informado_obs TEXT"),
      "Deve adicionar coluna pagamento_informado_obs",
    );
    assert.ok(
      content.includes("'placa', NEW.placa"),
      "Trigger deve repassar explicitamente a placa no payload net.http_post",
    );
    assert.ok(
      content.includes("'tipo', COALESCE(NEW.tipo"),
      "Trigger deve repassar explicitamente o tipo de alerta no payload",
    );
  });

  it("7. Regra Pétrea Hunter-Guardian: Ausência estrita do caractere comercial proibido", () => {
    const filesToCheck = [
      path.resolve(__dirname, "../../features/mensalidades/components/MensalidadesView.tsx"),
      path.resolve(__dirname, "../../features/mensalidades/components/ModalInformarPagamento.tsx"),
      path.resolve(
        __dirname,
        "../../features/mensalidades/components/BannerPagamentosAguardandoBaixa.tsx",
      ),
      path.resolve(__dirname, "../../features/mensalidades/services/mensalidadeService.ts"),
    ];

    for (const file of filesToCheck) {
      const content = fs.readFileSync(file, "utf-8");
      // Remove operadores lógicos legítimos &&
      const sanitized = content.replace(/&&/g, "");
      assert.ok(
        !sanitized.includes("&"),
        `O arquivo ${path.basename(file)} não pode conter o caractere comercial proibido`,
      );
    }
  });
});
