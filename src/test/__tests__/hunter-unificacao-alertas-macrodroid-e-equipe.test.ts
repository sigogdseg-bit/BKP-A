import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ALERTAS_VEICULO_CATALOGO,
  ALERTAS_CONTA_OPERACIONAL_CATALOGO,
  CATALOGO_COMPLETO_ALERTAS,
  ehAlertaOperacionalEquipe,
  ehAlertaRestritoEquipeTecnica,
  filtrarContatosPermitidosPorTipo,
  normalizarTipoAlerta,
  resolverRegraEntregaAlerta,
  type ContatoAlertaConta,
} from "../../features/monitor-gps/constants/alertasCatalogo";

describe("Hunter — Unificação Total de Alertas (30 tipos), Fila MacroDroid e Central da Equipe", () => {
  test("1. Regra de entrega: mapa por_alerta não herda ligacao global=true para alertas omitidos", () => {
    const contatos: ContatoAlertaConta[] = [
      { id: "c1", nome: "Titular", telefone: "24992494030", tipo: "cliente", ativo: true },
    ];

    const canaisComPorAlerta = {
      app: true,
      whatsapp: true,
      ligacao: true,
      por_alerta: {
        excesso_velocidade: { ativo: true, app: true, whatsapp: true, ligacao: true },
      },
    };

    const regraVelocidade = resolverRegraEntregaAlerta({
      tipo: "excesso_velocidade",
      canaisGlobais: canaisComPorAlerta,
      contatosVeiculo: contatos,
    });
    assert.equal(regraVelocidade.ativo, true);
    assert.equal(regraVelocidade.ligacao, true);

    const regraEntradaArea = resolverRegraEntregaAlerta({
      tipo: "entrada_area",
      canaisGlobais: canaisComPorAlerta,
      contatosVeiculo: contatos,
    });
    assert.equal(regraEntradaArea.ativo, false);
    assert.equal(regraEntradaArea.app, false);
    assert.equal(regraEntradaArea.whatsapp, false);
    assert.equal(regraEntradaArea.ligacao, false);

    for (const chaveOmitida of ["panico", "violacao_dispositivo", "capotamento_inclinacao"]) {
      const regra = resolverRegraEntregaAlerta({
        tipo: chaveOmitida,
        canaisGlobais: canaisComPorAlerta,
        contatosVeiculo: contatos,
      });
      assert.equal(regra.ativo, true, `${chaveOmitida} deve manter ativo padrão true`);
      assert.equal(regra.app, true, `${chaveOmitida} deve manter app padrão true`);
      assert.equal(regra.whatsapp, true, `${chaveOmitida} deve manter whatsapp padrão true`);
      assert.equal(
        regra.ligacao,
        false,
        `${chaveOmitida} omitido em por_alerta não deve herdar ligacao global=true`,
      );
    }

    // Legado sem por_alerta preserva ligacao global quando configurado expressamente
    const regraLegado = resolverRegraEntregaAlerta({
      tipo: "panico",
      canaisGlobais: { app: true, whatsapp: true, ligacao: true },
      contatosVeiculo: contatos,
    });
    assert.equal(regraLegado.ligacao, true);
  });

  test("2. Equipe Técnica e Blindagem Financeira: 7 alertas operacionais, aliases SQL/TS, opt-in e opt-out", () => {
    const aliasesEsperados: Array<[string, string]> = [
      ["novo_instalador_auto_cadastro", "cadastros_convites_veiculos"],
      ["novo_cliente_auto_cadastro", "cadastros_convites_veiculos"],
      ["novo_revendedor_cadastro", "cadastros_convites_veiculos"],
      ["novo_vendedor_cadastro", "cadastros_convites_veiculos"],
      ["nova_solicitacao_veiculo_cliente", "cadastros_convites_veiculos"],
      ["notificacao_proposta_emitida", "propostas_contratos"],
      ["notificacao_contrato_assinado_cliente", "propostas_contratos"],
      ["notificacao_contrato_assinado_recebido", "propostas_contratos"],
      ["mensalidade_pagamento_informado", "pagamento_informado"],
      ["degustacao_criada", "degustacao_bot"],
      ["degustacao_reativada", "degustacao_bot"],
      ["degustacao_cadastrada_whatsapp", "degustacao_bot"],
      ["degustacao_reativada_whatsapp", "degustacao_bot"],
      ["degustacao_revalidada_whatsapp", "degustacao_bot"],
      ["transbordo_humano_whatsapp", "atendimento_humano_bot"],
      ["lead_sem_vendedor_whatsapp", "atendimento_humano_bot"],
      ["indicacao_vendedor_whatsapp", "atendimento_humano_bot"],
      ["gerencial", "relatorio_gerencial"],
      ["relatorio_diario_metricas", "relatorio_gerencial"],
      ["comando_concluido", "comandos_j16"],
      ["comando_j16_concluido", "comandos_j16"],
      ["retorno_comando_j16", "comandos_j16"],
    ];

    for (const [alias, canonico] of aliasesEsperados) {
      assert.equal(
        normalizarTipoAlerta(alias),
        canonico,
        `Alias ${alias} deve normalizar para ${canonico}`,
      );
    }

    const chavesEquipe = [
      "cadastros_convites_veiculos",
      "propostas_contratos",
      "pagamento_informado",
      "degustacao_bot",
      "atendimento_humano_bot",
      "relatorio_gerencial",
      "comandos_j16",
    ];
    for (const chave of chavesEquipe) {
      assert.equal(ehAlertaOperacionalEquipe(chave), true, `${chave} é operacional da equipe`);
      assert.equal(
        ehAlertaRestritoEquipeTecnica(chave),
        true,
        `${chave} deve ser restrito à equipe técnica`,
      );
    }

    const contatosEquipe: ContatoAlertaConta[] = [
      { id: "adm1", nome: "SuperADM", telefone: "24992494030", tipo: "cliente", ativo: true },
      { id: "fin1", nome: "Plantão", telefone: "24992501512", tipo: "adicional", ativo: true },
      { id: "mot1", nome: "Motorista", telefone: "24988881111", tipo: "motorista", ativo: true },
    ];

    // Blindagem ADM: pagamento_informado nunca envia para motorista
    const permitidosPag = filtrarContatosPermitidosPorTipo(contatosEquipe, "pagamento_informado");
    assert.equal(
      permitidosPag.some((c) => c.tipo === "motorista"),
      false,
    );

    const regraPag = resolverRegraEntregaAlerta({
      tipo: "mensalidade_pagamento_informado",
      alertasOperacionais: {
        pagamento_informado: {
          ativo: true,
          app: false,
          whatsapp: true,
          ligacao: true,
          destinatarios_whatsapp: ["24988881111", "24992501512"],
          destinatarios_ligacao: ["24992494030"],
        },
      },
      contatosConta: contatosEquipe,
    });
    assert.equal(regraPag.chaveCanonica, "pagamento_informado");
    assert.equal(regraPag.financeiro, true);
    assert.equal(regraPag.app, false);
    assert.equal(regraPag.whatsapp, true);
    assert.equal(regraPag.ligacao, true);
    assert.deepEqual(regraPag.telefonesWhatsapp, ["5524992501512"]);
    assert.deepEqual(regraPag.telefonesLigacao, ["5524992494030"]);

    // Opt-out completo desativa todos os canais do alerta da equipe
    const regraBotOff = resolverRegraEntregaAlerta({
      tipo: "degustacao_cadastrada_whatsapp",
      alertasOperacionais: {
        degustacao_bot: { ativo: false, app: true, whatsapp: true, ligacao: true },
      },
      contatosConta: contatosEquipe,
    });
    assert.equal(regraBotOff.ativo, false);
    assert.equal(regraBotOff.app, false);
    assert.equal(regraBotOff.whatsapp, false);
    assert.equal(regraBotOff.ligacao, false);
  });

  test("3. Server Worker: fila serializada 17s no MacroDroid, dedup número+motivo, auth e anti-fanout Push", () => {
    const serverCode = fs.readFileSync(path.resolve(process.cwd(), "src/server.ts"), "utf-8");

    // Fila serializada 17s entre chamadas MacroDroid, timeout AbortController, validação res.ok e limpeza de dedup em falha
    assert.ok(serverCode.includes("async function aguardarSlotMacrodroid()"));
    assert.ok(serverCode.includes("const SLOT_INTERVAL_MS = 17000;"));
    assert.ok(serverCode.includes("await aguardarSlotMacrodroid();"));
    assert.ok(serverCode.includes("const chaveDedup = `${numeroFormatado}:${motivoNorm}`;"));
    assert.ok(serverCode.includes("macrodroidCallDedupCache.set(chaveDedup, agora);"));
    assert.ok(serverCode.includes("new AbortController()"));
    assert.ok(serverCode.includes("httpOk = Boolean(res?.ok);"));
    assert.ok(serverCode.includes("await res.text().catch"));
    assert.ok(serverCode.includes("macrodroidCallDedupCache.delete(chaveDedup);"));
    assert.ok(serverCode.includes("ligacao_emergencia_macrodroid_falha"));

    // Dinamismo: todos os 30 alertas do catálogo (veiculo e conta) resolvem dinamicamente via resolverRegraEntregaAlerta (zero hardcode)
    const contatosGeo: ContatoAlertaConta[] = [
      { id: "c1", nome: "Titular", telefone: "24992494030", tipo: "cliente", ativo: true },
    ];
    for (const def of CATALOGO_COMPLETO_ALERTAS) {
      const onLig = resolverRegraEntregaAlerta({
        tipo: def.chave,
        canaisGlobais:
          def.categoria === "veiculo"
            ? {
                app: true,
                whatsapp: true,
                ligacao: false,
                por_alerta: {
                  [def.chave]: { ativo: true, app: true, whatsapp: true, ligacao: true },
                },
              }
            : undefined,
        alertasOperacionais:
          def.categoria === "conta"
            ? { [def.chave]: { ativo: true, app: true, whatsapp: true, ligacao: true } }
            : undefined,
        contatosVeiculo: contatosGeo,
        contatosConta: contatosGeo,
      });
      const offLig = resolverRegraEntregaAlerta({
        tipo: def.chave,
        canaisGlobais:
          def.categoria === "veiculo"
            ? {
                app: true,
                whatsapp: true,
                ligacao: true,
                por_alerta: {
                  [def.chave]: { ativo: true, app: true, whatsapp: true, ligacao: false },
                },
              }
            : undefined,
        alertasOperacionais:
          def.categoria === "conta"
            ? { [def.chave]: { ativo: true, app: true, whatsapp: true, ligacao: false } }
            : undefined,
        contatosVeiculo: contatosGeo,
        contatosConta: contatosGeo,
      });
      assert.equal(onLig.ligacao, true, `${def.chave} deve respeitar ligacao=true dinâmico`);
      assert.equal(offLig.ligacao, false, `${def.chave} deve respeitar ligacao=false dinâmico`);
    }

    // Blindagem de autenticação e perfil auditor na rota /api/alerta/ligacao
    assert.ok(serverCode.includes('url.pathname === "/api/alerta/ligacao"'));
    assert.ok(serverCode.includes("Autenticação obrigatória para discagem."));
    assert.ok(serverCode.includes("superadmin_auditor"));
    assert.ok(serverCode.includes("perfilCaller?.ativo === false"));

    // Contexto unificado de equipe técnica e anti-fanout N x N de Push individual
    assert.ok(serverCode.includes("carregarContextoEquipeTecnica"));
    assert.ok(serverCode.includes("resolverRegraMembroEquipeServer"));
    assert.ok(serverCode.includes("despacharNotificacaoWhatsappSuperAdm"));
    assert.ok(serverCode.includes("ehAlertaInternoSigilo && destUserId && !destClienteId"));
    assert.ok(
      serverCode.includes("impede fan-out N x N") ||
        serverCode.includes("membroAlvo = ctxEquipeTarget.membros.find"),
    );
  });

  test("4. Clientes, Bot WhatsApp, Relatório Gerencial e NF: zero trigger direto no client e roteamento via /api/alerta/ligacao", () => {
    const arquivosSemMacrodroidDireto = [
      "src/features/seguranca/services/comandosEmAguardoService.ts",
      "src/features/seguranca/components/ModalConfiguracaoCanaisAlerta.tsx",
      "src/features/motoristas/services/nfStorageService.ts",
      "src/shared/lib/notificacoesBdService.ts",
      "src/features/configuracoes/components/ModalCentralAlertasConta.tsx",
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    ];
    for (const rel of arquivosSemMacrodroidDireto) {
      const code = fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
      assert.equal(
        code.includes("trigger.macrodroid.com"),
        false,
        `${rel} não deve expor nem chamar trigger.macrodroid.com diretamente`,
      );
    }

    const botCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/chat/services/whatsappAutoMonitoramentoService.ts"),
      "utf-8",
    );
    assert.equal(
      botCode.includes('.from("perfis")'),
      false,
      "Bot não deve consultar tabela inexistente perfis",
    );
    assert.ok(botCode.includes("despacharAlertaEquipeBot"));
    assert.ok(botCode.includes("propostas_contratos"));
    assert.ok(botCode.includes("degustacao_bot"));
    assert.ok(botCode.includes("atendimento_humano_bot"));
    assert.ok(botCode.includes("/api/alerta/ligacao"));

    const relCode = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/features/relatorios/services/relatorioDiarioMetricasService.ts",
      ),
      "utf-8",
    );
    assert.ok(relCode.includes("relatorio_gerencial"));
    assert.ok(relCode.includes("resolverRegraEntregaAlerta"));
    assert.ok(relCode.includes("/api/alerta/ligacao"));

    const nfCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/motoristas/services/nfStorageService.ts"),
      "utf-8",
    );
    assert.ok(nfCode.includes("resolverRegraEntregaAlerta"));
    assert.ok(nfCode.includes("/api/alerta/ligacao"));
  });

  test("5. UI Unificada (ModalCentralAlertasConta, ConfiguracoesView, GpsMonitorView) e Gateway TCP em paridade", () => {
    const modalConta = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/features/configuracoes/components/ModalCentralAlertasConta.tsx",
      ),
      "utf-8",
    );
    assert.ok(modalConta.includes("ModalPortal"));
    assert.ok(modalConta.includes('role="dialog"'));
    assert.ok(modalConta.includes('aria-modal="true"'));
    assert.ok(modalConta.includes("max-h-[90vh]"));
    assert.ok(modalConta.includes("overflow-y-auto"));
    assert.ok(modalConta.includes("my-auto"));
    assert.ok(modalConta.includes("ModalCienciaDesativarNfModal"));
    assert.ok(modalConta.includes("carregarConfigAlertasEquipe"));
    assert.ok(modalConta.includes("salvarConfigAlertasEquipe"));
    assert.ok(modalConta.includes("carregarConfigAlertasCliente"));
    assert.ok(modalConta.includes("salvarConfigAlertasCliente"));
    assert.ok(modalConta.includes("/api/alerta/ligacao"));

    const configView = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/configuracoes/ConfiguracoesView.tsx"),
      "utf-8",
    );
    assert.ok(configView.includes("ModalCentralAlertasConta"));
    assert.ok(configView.includes("salvar_preferencias_alertas_cliente"));

    const protService = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/monitor-gps/services/protecaoVeiculoService.ts"),
      "utf-8",
    );
    assert.ok(protService.includes("salvar_preferencias_alertas_cliente"));

    const gpsView = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/monitor-gps/components/GpsMonitorView.tsx"),
      "utf-8",
    );
    assert.ok(gpsView.includes("prefsPorVeiculoRef"));
    assert.ok(gpsView.includes("resolverRegraEntregaAlerta"));

    const gwRoot = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts"),
      "utf-8",
    );
    const gwDeploy = fs.readFileSync(
      path.resolve(process.cwd(), "deploy/hunter-gateway/src/hunter-gps-gateway.ts"),
      "utf-8",
    );
    assert.equal(gwRoot, gwDeploy, "Gateways raiz e deploy devem estar idênticos");
    assert.ok(gwRoot.includes("resolverDestinatariosEquipeGateway"));
    assert.ok(gwRoot.includes("/api/alerta/ligacao"));
    // Ordem correta na auditoria 0x13: auditarIntegridadeEstadoEReverter antes de sobrescrever alimentacaoExternaStatus
    const idxAudit0x13 = gwRoot.indexOf('origem: "heartbeat_0x13"');
    const idxSet0x13 = gwRoot.indexOf("conn.alimentacaoExternaStatus = alimentacaoExterna;");
    assert.ok(idxAudit0x13 > 0 && idxSet0x13 > idxAudit0x13);
    // Ordem correta na auditoria 0x16
    const idxAudit0x16 = gwRoot.indexOf("alarme_0x${protocolo.toString(16)}");
    const idxSet0x16 = gwRoot.indexOf(
      "conn.alimentacaoExternaStatus = alarmCode === 0x02 ? false : alimentacaoExterna;",
    );
    assert.ok(idxAudit0x16 > 0 && idxSet0x16 > idxAudit0x16);
  });

  test("6. Banco de Dados SQL: migration 20261110180000 e bundle unificados", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261110180000_hunter_unificacao_total_central_alertas_ligacao.sql",
    );
    assert.equal(fs.existsSync(migPath), true);
    const migSql = fs.readFileSync(migPath, "utf-8");
    const bundleSql = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql"),
      "utf-8",
    );

    const termosObrigatorios = [
      "hunter_alerta_pode_emitir",
      "salvar_preferencias_alertas_cliente",
      "registrar_alerta_seguranca",
      "superadmin_auditor",
      "degustacao_bot",
      "atendimento_humano_bot",
      "relatorio_gerencial",
      "comandos_j16",
      "NOTIFY pgrst, 'reload schema';",
    ];
    for (const termo of termosObrigatorios) {
      assert.ok(migSql.includes(termo), `Migration 20261110180000 deve conter ${termo}`);
      assert.ok(
        bundleSql.includes(termo),
        `APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter ${termo}`,
      );
    }

    assert.equal(ALERTAS_VEICULO_CATALOGO.length + ALERTAS_CONTA_OPERACIONAL_CATALOGO.length, 30);
    assert.equal(CATALOGO_COMPLETO_ALERTAS.length, 30);
  });

  test("7. Conformidade Pétrea: zero caractere comercial isolado no teste", () => {
    const selfPath = path.resolve(
      process.cwd(),
      "src/test/__tests__/hunter-unificacao-alertas-macrodroid-e-equipe.test.ts",
    );
    const selfCode = fs.readFileSync(selfPath, "utf-8");
    const linhas = selfCode.split("\n").filter((l) => !l.includes("&&") && !l.includes("&amp;"));
    for (const l of linhas) {
      assert.doesNotMatch(l, /\s&\s/);
    }
  });
});
