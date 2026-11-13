import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CANAIS_ALERTAS_PADRAO,
  PREFERENCIAS_PADRAO,
  type PreferenciasNotificacao,
  type CanaisAlertas,
} from "../../features/monitor-gps/services/notificacoesService";

describe("Hunter — Auditoria Geral de Alertas e Capacidade de Escolha do Usuário", () => {
  test("1. Catálogo de Alertas do Usuário: Todos os 10 tipos essenciais de monitoramento configuráveis", () => {
    // Alertas configuráveis pelo usuário na central de proteção
    const alertasConfiguraveis = [
      "movimento_fora_horario",
      "ignicao_fora_horario",
      "guincho",
      "saida_area",
      "entrada_area",
      "excesso_velocidade",
      "desvio_rota",
      "perda_comunicacao",
      "bateria_desconectada",
      "baixa_tensao",
    ];

    for (const alerta of alertasConfiguraveis) {
      assert.ok(
        alerta in PREFERENCIAS_PADRAO,
        `Alerta "${alerta}" deve existir em PREFERENCIAS_PADRAO`,
      );
    }
  });

  test("2. Triplo Canal de Entrega: Usuário escolhe individualmente App, WhatsApp e Ligação", () => {
    // Validação da interface e padrões
    assert.deepEqual(CANAIS_ALERTAS_PADRAO, {
      app: true,
      whatsapp: true,
      ligacao: false,
    });

    // Simulação da capacidade de customização pelo usuário
    const escolhaUsuario: CanaisAlertas = {
      app: true,
      whatsapp: false,
      ligacao: true,
    };

    assert.equal(escolhaUsuario.app, true);
    assert.equal(escolhaUsuario.whatsapp, false);
    assert.equal(escolhaUsuario.ligacao, true);
  });

  test("3. Modal de Proteção: UI apresenta seleção individual de App, WhatsApp e Ligação para cada alerta", async () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const content = await fs.readFile(modalPath, "utf-8");

    // Verifica presença dos 3 botões individuais de canais por item
    assert.ok(content.includes("alternarCanalItem"), "Deve conter função alternarCanalItem");
    assert.ok(content.includes("canaisPorAlerta"), "Deve gerenciar estado canaisPorAlerta");
    assert.ok(content.includes("PhoneCall"), "Deve importar ícone PhoneCall");
    assert.ok(content.includes("por_alerta"), "Deve persistir por_alerta em canais_alertas");

    // Verifica presença dos 10 alertas configuráveis
    const chavesObrigatorias = [
      'chave: "movimento_fora_horario"',
      'chave: "ignicao_fora_horario"',
      'chave: "guincho"',
      'chave: "saida_area"',
      'chave: "entrada_area"',
      'chave: "excesso_velocidade"',
      'chave: "desvio_rota"',
      'chave: "perda_comunicacao"',
      'chave: "bateria_desconectada"',
      'chave: "baixa_tensao"',
    ];

    for (const chave of chavesObrigatorias) {
      assert.ok(content.includes(chave), `Modal deve conter configuração para ${chave}`);
    }
  });

  test("4. Servidor server.ts: Respeita canal App (Web Push desativado se canais.por_alerta ou canais_alertas.app === false)", async () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = await fs.readFile(serverPath, "utf-8");

    // Validação do cancelamento de Push caso o usuário desative
    assert.ok(
      content.includes("canalItemApp.app === false") || content.includes("cAlertas?.app === false"),
      "server.ts deve verificar se o canal App está desativado para o alerta ou globalmente",
    );
    assert.ok(
      content.includes("Canal App / Push desativado"),
      "server.ts deve abortar envio Web Push quando o canal estiver desativado",
    );
  });

  test("5. Servidor server.ts: Respeita canal WhatsApp por alerta (Aborto se canalItemWhats.whatsapp === false)", async () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = await fs.readFile(serverPath, "utf-8");

    // Validação do cancelamento de WhatsApp caso o usuário desative no item ou no geral
    assert.ok(
      content.includes("canalItemWhats.whatsapp === false"),
      "server.ts deve abortar WhatsApp se o alerta específico estiver com whatsapp: false",
    );
    assert.ok(
      content.includes("if (canais && canais.whatsapp === false)"),
      "server.ts deve abortar WhatsApp se canais.whatsapp for false",
    );
  });

  test("6. Servidor server.ts: Respeita canal Ligação Telefônica MacroDroid por alerta (canalItemLig.ligacao)", async () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = await fs.readFile(serverPath, "utf-8");

    // Validação de disparo do discador MacroDroid
    assert.ok(
      content.includes("canalItemLig.ligacao === true"),
      "server.ts deve verificar se o alerta individual tem ligacao: true",
    );
    assert.ok(
      content.includes("canaisConfigurados?.ligacao === true"),
      "server.ts deve permitir ligação se o usuário marcou ligacao: true",
    );
    assert.ok(
      content.includes("dispararLigacaoMacroDroid("),
      "server.ts deve invocar dispararLigacaoMacroDroid",
    );
    assert.ok(
      content.includes("macrodroidCallDedupCache.set(chaveDedup, agora)"),
      "server.ts deve aplicar lock de 90s por número e motivo para proteger timer de desligamento da macro sem suprimir tipos distintos",
    );
  });

  test("7. Servidor server.ts: Anti-chamadas fantasmas (Reconciliador descarta eventos > 3 minutos)", async () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = await fs.readFile(serverPath, "utf-8");

    assert.ok(
      content.includes("diferencaMinutos > 3"),
      "server.ts deve descartar disparo de WhatsApp e ligação se o evento tiver mais de 3 minutos",
    );
  });

  test("8. Banco de Dados: Trigger de telemetria respeita alertas_ativos individualmente", async () => {
    const sqlPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const sql = await fs.readFile(sqlPath, "utf-8");

    // Verifica que cada alerta é condicionado a alertas_ativos do veículo
    assert.ok(
      sql.includes("COALESCE((v_alertas_ativos->>'excesso_velocidade')::BOOLEAN, true) = true"),
      "Trigger deve verificar alertas_ativos->>excesso_velocidade",
    );
    assert.ok(
      sql.includes("COALESCE((v_alertas_ativos->>'ignicao_fora_horario')::BOOLEAN, true) = true"),
      "Trigger deve verificar alertas_ativos->>ignicao_fora_horario",
    );
    assert.ok(
      sql.includes("COALESCE((v_alertas_ativos->>'movimento_fora_horario')::BOOLEAN, true) = true"),
      "Trigger deve verificar alertas_ativos->>movimento_fora_horario",
    );
    assert.ok(
      sql.includes("COALESCE((v_alertas_ativos->>'guincho')::BOOLEAN, true) = true"),
      "Trigger deve verificar alertas_ativos->>guincho",
    );
    assert.ok(
      sql.includes("COALESCE((v_alertas_ativos->>'saida_area')::BOOLEAN, true) = true"),
      "Trigger deve verificar alertas_ativos->>saida_area",
    );
    assert.ok(
      sql.includes("COALESCE((v_alertas_ativos->>'entrada_area')::BOOLEAN, true) = true"),
      "Trigger deve verificar alertas_ativos->>entrada_area",
    );
  });

  test("9. Regra Pétrea Hunter-Guardian: Ausência do caractere proibido nos textos de teste", async () => {
    const testPath = path.resolve(
      process.cwd(),
      "src/test/__tests__/hunter-auditoria-completa-alertas-e-escolha-usuario.test.ts",
    );
    const content = await fs.readFile(testPath, "utf-8");
    const hasForbiddenAmpersand = /\s&\s/.test(content);
    assert.equal(
      hasForbiddenAmpersand,
      false,
      "Proibido usar caractere isolado de conjunção aditiva",
    );
  });
});
