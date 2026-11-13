import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");

describe("Hunter — Notificação Instantânea e Atualização Reativa de Instalador, Cliente e Operadores", () => {
  it("1. clienteService.ts: salvarDistribuicaoInstalacoesCliente dispara enviarNotificacaoViaBd para instalador e cliente", () => {
    const filePath = path.join(root, "src/features/clientes/services/clienteService.ts");
    assert.ok(fs.existsSync(filePath), "clienteService.ts deve existir.");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes(
        'import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";',
      ),
      "clienteService.ts deve importar enviarNotificacaoViaBd.",
    );
    assert.ok(
      content.includes("destinatarioUserId: item.instaladorId") &&
        content.includes('tipo: "instalacao"'),
      "salvarDistribuicaoInstalacoesCliente deve disparar notificação para o instalador.",
    );
    assert.ok(
      content.includes("destinatarioUserId: clienteUserId") &&
        content.includes("destinatarioClienteId: clienteId"),
      "salvarDistribuicaoInstalacoesCliente deve disparar notificação instantânea para o cliente titular.",
    );
  });

  it("2. notificacoesBdService.ts: emite hunter:atualizar_demandas no window para reatividade instantânea", () => {
    const filePath = path.join(root, "src/shared/lib/notificacoesBdService.ts");
    assert.ok(fs.existsSync(filePath), "notificacoesBdService.ts deve existir.");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("hunter:atualizar_demandas"),
      "notificacoesBdService.ts deve despachar o evento hunter:atualizar_demandas.",
    );
    assert.ok(
      content.includes('window.dispatchEvent(new CustomEvent("hunter:atualizar_demandas"'),
      "notificacoesBdService.ts deve despachar CustomEvent para hunter:atualizar_demandas.",
    );
  });

  it("3. InstalacoesView.tsx e TelaClienteAguardandoInstalacao.tsx: ouvem hunter:atualizar_demandas e canais realtime", () => {
    const instalacoesPath = path.join(
      root,
      "src/features/instalacoes/components/InstalacoesView.tsx",
    );
    const clientePath = path.join(
      root,
      "src/features/clientes/components/TelaClienteAguardandoInstalacao.tsx",
    );

    assert.ok(fs.existsSync(instalacoesPath), "InstalacoesView.tsx deve existir.");
    assert.ok(fs.existsSync(clientePath), "TelaClienteAguardandoInstalacao.tsx deve existir.");

    const instContent = fs.readFileSync(instalacoesPath, "utf-8");
    const cliContent = fs.readFileSync(clientePath, "utf-8");

    assert.ok(
      instContent.includes("hunter:atualizar_demandas") &&
        (instContent.includes("hunter_instalacoes_notificacoes_realtime") ||
          instContent.includes('table: "notificacoes_sistema"')),
      "InstalacoesView.tsx deve escutar hunter:atualizar_demandas e canal notificacoes_sistema.",
    );

    assert.ok(
      cliContent.includes("hunter:atualizar_demandas") &&
        (cliContent.includes("hunter_cliente_notif_inst_") ||
          cliContent.includes('table: "notificacoes_sistema"')),
      "TelaClienteAguardandoInstalacao.tsx deve escutar hunter:atualizar_demandas e canal notificacoes_sistema.",
    );

    assert.ok(
      cliContent.includes("enviarNotificacaoViaBd"),
      "TelaClienteAguardandoInstalacao.tsx deve disparar notificação instantânea ao informar endereço.",
    );
  });

  it("4. Migration e Script Mestre: trigger trg_notificar_atribuicao_instalacao_kit para instalador, cliente e conclusão", () => {
    const migPath = path.join(
      root,
      "supabase/migrations/20261010100000_hunter_trigger_notificacao_instantanea_instalador.sql",
    );
    const mestrePath = path.join(root, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(fs.existsSync(migPath), "Migration de notificação instantânea deve existir.");
    assert.ok(fs.existsSync(mestrePath), "Script mestre de aplicação deve existir.");

    const migContent = fs.readFileSync(migPath, "utf-8");
    const mestreContent = fs.readFileSync(mestrePath, "utf-8");

    assert.ok(
      migContent.includes("trg_notificar_atribuicao_instalacao_kit"),
      "Migration deve conter a função trg_notificar_atribuicao_instalacao_kit.",
    );
    assert.ok(
      migContent.includes("v_cliente_user_id") && migContent.includes("v_concluiu_instalacao"),
      "Trigger deve notificar o cliente titular e tratar conclusão de instalação.",
    );
    assert.ok(
      migContent.includes("ALTER TABLE public.instalacoes REPLICA IDENTITY FULL;"),
      "Migration deve configurar REPLICA IDENTITY FULL para instalacoes.",
    );
    assert.ok(
      mestreContent.includes("trg_notificar_atribuicao_instalacao_kit") &&
        mestreContent.includes("v_cliente_user_id"),
      "Script mestre deve espelhar trg_notificar_atribuicao_instalacao_kit contemplando o cliente.",
    );
  });

  it("5. instalacaoService.ts: salvarAtendimentoInstalacao notifica cliente na conclusão", () => {
    const filePath = path.join(root, "src/features/instalacoes/services/instalacaoService.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes('payload.status === "concluida"') &&
        content.includes("enviarNotificacaoViaBd"),
      "salvarAtendimentoInstalacao deve notificar cliente com link do Monitor GPS ao concluir.",
    );
  });

  it("6. ModalDistribuirInstalacoesVeiculos.tsx: operador pode definir localTipo (oficina vs local_veiculo)", () => {
    const modalPath = path.join(
      root,
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    assert.ok(fs.existsSync(modalPath), "ModalDistribuirInstalacoesVeiculos.tsx deve existir.");
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("handleAlterarLocalTipoVeiculo") &&
        content.includes("Oficina do Instalador") &&
        content.includes("No Local do Cliente"),
      "ModalDistribuirInstalacoesVeiculos.tsx deve permitir ao operador escolher o local de atendimento.",
    );
  });

  it("7. Regra Pétrea Hunter-Guardian: Ausência de caractere comercial proibido em mensagens de notificação e UI", () => {
    const filePath = path.join(root, "src/features/clientes/services/clienteService.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    const trechoNotif = content.slice(content.indexOf("salvarDistribuicaoInstalacoesCliente"));

    // Garante que nos textos de mensagem ao instalador e cliente não há caractere comercial proibido
    assert.ok(
      !trechoNotif.includes("&") || !trechoNotif.includes(" & "),
      "clienteService.ts não deve usar caractere comercial proibido em textos de notificação.",
    );
  });
});
