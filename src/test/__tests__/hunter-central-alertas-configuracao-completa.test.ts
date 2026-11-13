import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ALERTAS_VEICULO_CATALOGO,
  ALERTAS_CONTA_OPERACIONAL_CATALOGO,
  CATALOGO_COMPLETO_ALERTAS,
  ehAlertaRestritoEquipeTecnica,
  filtrarAlertasCatalogoVisiveis,
  normalizarTelefoneDigitosBR,
  normalizarTipoAlerta,
  filtrarContatosPermitidosPorTipo,
  resolverRegraEntregaAlerta,
  type ContatoAlertaConta,
} from "../../features/monitor-gps/constants/alertasCatalogo";
import { PREFERENCIAS_PADRAO } from "../../features/monitor-gps/services/notificacoesService";
import { obterAlertasOperacionaisPadrao } from "../../features/monitor-gps/services/protecaoVeiculoService";

describe("Hunter — Central de Alertas Reais, Canais Independentes e Seleção de Telefones", () => {
  test("1. Catálogo real: 16 alertas veiculares e 14 de conta/equipe (30 no total) alinhados aos emissores reais", () => {
    assert.equal(ALERTAS_VEICULO_CATALOGO.length, 16);
    assert.equal(ALERTAS_CONTA_OPERACIONAL_CATALOGO.length, 14);
    assert.equal(CATALOGO_COMPLETO_ALERTAS.length, 30);

    const chavesVeicEsperadas = [
      "movimento_fora_horario",
      "ignicao_fora_horario",
      "guincho",
      "saida_area",
      "entrada_area",
      "excesso_velocidade",
      "desvio_rota",
      "suspeita_jammer",
      "perda_comunicacao",
      "bateria_desconectada",
      "baixa_tensao",
      "colisao_impacto",
      "panico",
      "violacao_dispositivo",
      "capotamento_inclinacao",
      "corte_nao_autorizado_sms",
    ];
    for (const chave of chavesVeicEsperadas) {
      assert.ok(
        ALERTAS_VEICULO_CATALOGO.some((i) => i.chave === chave),
        `Catálogo veicular deve conter ${chave}`,
      );
      assert.ok(chave in PREFERENCIAS_PADRAO, `PREFERENCIAS_PADRAO deve conter ${chave}`);
    }

    const chavesContaEsperadas = [
      "nf_pronta_download",
      "alerta_nf_expurgo",
      "cobranca",
      "manutencao",
      "instalacao",
      "atendimento",
      "chat",
      "cadastros_convites_veiculos",
      "propostas_contratos",
      "pagamento_informado",
      "degustacao_bot",
      "atendimento_humano_bot",
      "relatorio_gerencial",
      "comandos_j16",
    ];
    for (const chave of chavesContaEsperadas) {
      assert.ok(
        ALERTAS_CONTA_OPERACIONAL_CATALOGO.some((i) => i.chave === chave),
        `Catálogo de conta deve conter ${chave}`,
      );
    }

    assert.equal(
      "panico" in PREFERENCIAS_PADRAO,
      true,
      "panico deve existir em PREFERENCIAS_PADRAO",
    );
    assert.equal(
      "violacao_dispositivo" in PREFERENCIAS_PADRAO,
      true,
      "violacao_dispositivo deve existir em PREFERENCIAS_PADRAO",
    );
    assert.equal(
      "capotamento_inclinacao" in PREFERENCIAS_PADRAO,
      true,
      "capotamento_inclinacao deve existir em PREFERENCIAS_PADRAO",
    );
    assert.equal(
      CATALOGO_COMPLETO_ALERTAS.some(
        (i) =>
          i.chave === "panico" ||
          i.chave === "violacao_dispositivo" ||
          i.chave === "capotamento_inclinacao",
      ),
      true,
    );

    assert.equal(PREFERENCIAS_PADRAO.entrada_area, false);
    const opsPadrao = obterAlertasOperacionaisPadrao();
    assert.equal(opsPadrao.chat.app, true);
    assert.equal(opsPadrao.chat.whatsapp, false);
    assert.equal(opsPadrao.chat.ligacao, false);
  });

  test("2. Normalização brasileira de telefones e resolução de aliases reais", () => {
    assert.equal(normalizarTelefoneDigitosBR("(24) 99250-1512"), "5524992501512");
    assert.equal(normalizarTelefoneDigitosBR("02124992501512"), "5524992501512");
    assert.equal(normalizarTelefoneDigitosBR("+55 (24) 99250-1512"), "5524992501512");

    assert.equal(normalizarTipoAlerta("cerca_saida"), "saida_area");
    assert.equal(normalizarTipoAlerta("cerca_entrada"), "entrada_area");
    assert.equal(normalizarTipoAlerta("impacto"), "colisao_impacto");
    assert.equal(
      normalizarTipoAlerta("desbloqueio_nao_autorizado_sms"),
      "corte_nao_autorizado_sms",
    );
    assert.equal(normalizarTipoAlerta("alerta_nf_expurgo_24h"), "alerta_nf_expurgo");
  });

  test("3. Opt-in, Opt-out e canais desacoplados para alertas veiculares (incluindo Jammer, Impacto e Defesa SMS)", () => {
    const contatos: ContatoAlertaConta[] = [
      { id: "c1", nome: "Titular", telefone: "24992501512", tipo: "cliente", ativo: true },
      { id: "m1", nome: "Motorista", telefone: "24988881111", tipo: "motorista", ativo: true },
      { id: "a1", nome: "Central", telefone: "24977772222", tipo: "adicional", ativo: false },
    ];

    // Opt-out via por_alerta.ativo = false bloqueia todos os canais
    const optOut = resolverRegraEntregaAlerta({
      tipo: "suspeita_jammer",
      alertasAtivos: { suspeita_jammer: true },
      canaisGlobais: {
        app: true,
        whatsapp: true,
        ligacao: true,
        por_alerta: {
          suspeita_jammer: { ativo: false, app: true, whatsapp: true, ligacao: true },
        },
      },
      contatosVeiculo: contatos,
    });
    assert.equal(optOut.ativo, false);
    assert.equal(optOut.app, false);
    assert.equal(optOut.whatsapp, false);
    assert.equal(optOut.ligacao, false);

    // Opt-out via flag booleana direta (colisao_impacto / corte_nao_autorizado_sms)
    const optOutSms = resolverRegraEntregaAlerta({
      tipo: "corte_nao_autorizado_sms",
      alertasAtivos: { corte_nao_autorizado_sms: false },
      contatosVeiculo: contatos,
    });
    assert.equal(optOutSms.ativo, false);
    assert.equal(optOutSms.whatsapp, false);

    // Canais desacoplados e seleção granular de telefones distintos por WhatsApp x Ligação
    const granular = resolverRegraEntregaAlerta({
      tipo: "colisao_impacto",
      alertasAtivos: { colisao_impacto: true },
      canaisGlobais: {
        por_alerta: {
          colisao_impacto: {
            ativo: true,
            app: false,
            whatsapp: true,
            ligacao: true,
            destinatarios_whatsapp: ["(24) 98888-1111"],
            destinatarios_ligacao: ["(24) 97777-2222", "(24) 99250-1512"],
          },
        },
      },
      contatosVeiculo: contatos,
    });
    assert.equal(granular.ativo, true);
    assert.equal(granular.app, false);
    assert.equal(granular.whatsapp, true);
    assert.equal(granular.ligacao, true);
    assert.deepEqual(granular.telefonesWhatsapp, ["5524988881111"]);
    assert.deepEqual(granular.telefonesLigacao, ["5524977772222", "5524992501512"]);
  });

  test("4. Blindagem Administrativa: cobrança nunca permite nem envia para motorista", () => {
    const contatos: ContatoAlertaConta[] = [
      { id: "c1", nome: "Titular", telefone: "24992501512", tipo: "cliente", ativo: true },
      { id: "m1", nome: "Motorista", telefone: "24988881111", tipo: "motorista", ativo: true },
      { id: "a1", nome: "Financeiro", telefone: "24977773333", tipo: "adicional", ativo: true },
    ];

    const permitidosCobranca = filtrarContatosPermitidosPorTipo(contatos, "cobranca");
    assert.equal(permitidosCobranca.length, 2);
    assert.equal(
      permitidosCobranca.some((c) => c.tipo === "motorista"),
      false,
    );

    const regraCobranca = resolverRegraEntregaAlerta({
      tipo: "cobranca",
      alertasOperacionais: {
        cobranca: {
          ativo: true,
          app: true,
          whatsapp: true,
          ligacao: true,
          destinatarios_whatsapp: ["24992501512", "24988881111", "24977773333"],
          destinatarios_ligacao: ["24988881111"],
        },
      },
      contatosConta: contatos,
    });

    assert.equal(regraCobranca.financeiro, true);
    assert.deepEqual(regraCobranca.telefonesWhatsapp, ["5524992501512", "5524977773333"]);
    assert.deepEqual(regraCobranca.telefonesLigacao, []);
  });

  test("5. Alertas de Conta, NF (expurgo/download) e Chat respeitam canais independentes e legado", () => {
    const contatos: ContatoAlertaConta[] = [
      { id: "c1", nome: "Titular", telefone: "24992501512", tipo: "cliente", ativo: true },
    ];

    // Fallback legado de NF sem alertas_operacionais salvos
    const nfLegado = resolverRegraEntregaAlerta({
      tipo: "alerta_nf_expurgo_6h",
      notificarNfPendente: true,
      canaisNotificacaoNf: { push: false, whatsapp: true, ligacao: true },
      contatosConta: contatos,
    });
    assert.equal(nfLegado.chaveCanonica, "alerta_nf_expurgo");
    assert.equal(nfLegado.ativo, true);
    assert.equal(nfLegado.app, false);
    assert.equal(nfLegado.whatsapp, true);
    assert.equal(nfLegado.ligacao, true);

    // Chat por padrão não envia WhatsApp nem Ligação sem opt-in explícito
    const chatPadrao = resolverRegraEntregaAlerta({
      tipo: "chat",
      contatosConta: contatos,
    });
    assert.equal(chatPadrao.app, true);
    assert.equal(chatPadrao.whatsapp, false);
    assert.equal(chatPadrao.ligacao, false);
  });

  test("6. Modal Proteção e Limites: UI unificada com os 30 alertas, acessibilidade e ciência de NF", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const modalCode = fs.readFileSync(modalPath, "utf-8");

    const termoAmpersandProibido = [" ", "&", " "].join("");
    assert.equal(
      modalCode.includes(termoAmpersandProibido),
      false,
      "Proibido caractere comercial isolado",
    );
    assert.ok(modalCode.includes('role="dialog"'));
    assert.ok(modalCode.includes('aria-modal="true"'));
    assert.ok(modalCode.includes('role="switch"'));
    assert.ok(modalCode.includes("ALERTAS_CONTA_OPERACIONAL_CATALOGO"));
    assert.ok(modalCode.includes("ModalCienciaDesativarNfModal"));
    assert.ok(modalCode.includes("aplicarConfigAlertasTodaFrota"));
    assert.ok(modalCode.includes("destinatarios_whatsapp"));
    assert.ok(modalCode.includes("destinatarios_ligacao"));
    assert.ok(modalCode.includes('chave: "suspeita_jammer"'));
    assert.ok(modalCode.includes('chave: "colisao_impacto"'));
    assert.ok(modalCode.includes('chave: "panico"'));
    assert.ok(modalCode.includes('chave: "violacao_dispositivo"'));
    assert.ok(modalCode.includes('chave: "capotamento_inclinacao"'));
    assert.ok(modalCode.includes('chave: "corte_nao_autorizado_sms"'));
  });

  test("7. Backend, Cliente, Gateway GPS e Migrations SQL respeitam escolhas e integridade de schema", () => {
    const configPath = path.resolve(
      process.cwd(),
      "src/features/configuracoes/ConfiguracoesView.tsx",
    );
    const configCode = fs.readFileSync(configPath, "utf-8");
    assert.equal(
      configCode.includes("ConfiguracaoProtecaoModal"),
      false,
      "ConfiguracoesView não deve importar ConfiguracaoProtecaoModal",
    );
    assert.ok(configCode.includes("alertas_operacionais"));

    const modalCienciaPath = path.resolve(
      process.cwd(),
      "src/features/configuracoes/components/ModalCienciaDesativarNfModal.tsx",
    );
    const modalCienciaCode = fs.readFileSync(modalCienciaPath, "utf-8");
    assert.ok(modalCienciaCode.includes("z-[100000]"));

    const bdServicePath = path.resolve(process.cwd(), "src/shared/lib/notificacoesBdService.ts");
    const bdCode = fs.readFileSync(bdServicePath, "utf-8");
    assert.equal(
      bdCode.includes('fetch("/api/whatsapp/send"'),
      false,
      "Bloco incondicional legado de WhatsApp no notificacoesBdService deve permanecer removido",
    );
    assert.ok(bdCode.includes("consultarRegraEntregaClienteLocal"));

    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const serverCode = fs.readFileSync(serverPath, "utf-8");
    assert.ok(serverCode.includes("targetEhTerceiroSemCliente"));
    assert.ok(serverCode.includes("reconciliarAlertasSegurancaServidor"));
    assert.equal(
      serverCode.includes("nome_razao_social,telefone,celular"),
      false,
      "public.clientes não possui coluna celular; selecionar celular quebraria PostgREST",
    );

    const nfServicePath = path.resolve(
      process.cwd(),
      "src/features/motoristas/services/nfStorageService.ts",
    );
    const nfCode = fs.readFileSync(nfServicePath, "utf-8");
    assert.equal(
      nfCode.includes("nome_razao_social, telefone, celular"),
      false,
      "nfStorageService não deve consultar coluna inexistente celular em clientes",
    );
    assert.ok(nfCode.includes("/api/alerta/ligacao"));

    const gwRoot = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts"),
      "utf-8",
    );
    const gwDeploy = fs.readFileSync(
      path.resolve(process.cwd(), "deploy/hunter-gateway/src/hunter-gps-gateway.ts"),
      "utf-8",
    );
    assert.equal(gwRoot, gwDeploy, "Gateways raiz e deploy devem estar 100% idênticos");
    assert.ok(gwRoot.includes('tipoAlerta = "guincho"'));
    assert.equal(gwRoot.includes('tipo = "baixa_tensao" ? "bateria_desconectada"'), false);

    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261110120000_hunter_central_configuracao_alertas_canais_numeros.sql",
    );
    assert.ok(fs.existsSync(migrationPath));
    const migSql = fs.readFileSync(migrationPath, "utf-8");
    assert.equal(migSql.includes('"panico":true'), false);
    assert.equal(migSql.includes('"violacao_dispositivo":true'), false);
    assert.ok(migSql.includes("NOTIFY pgrst, 'reload schema';"));
  });

  test("8. Sigilo Operacional SMS, rotulagem amigável ao cliente e blindagem multinível", () => {
    const smsItem = ALERTAS_VEICULO_CATALOGO.find((i) => i.chave === "corte_nao_autorizado_sms");
    assert.ok(smsItem);
    assert.equal(smsItem.restritoEquipeTecnica, true);
    assert.equal(ehAlertaRestritoEquipeTecnica("corte_nao_autorizado_sms"), true);
    assert.equal(ehAlertaRestritoEquipeTecnica("desbloqueio_nao_autorizado_sms"), true);
    assert.equal(ehAlertaRestritoEquipeTecnica("excesso_velocidade"), false);

    const visiveisCliente = filtrarAlertasCatalogoVisiveis(ALERTAS_VEICULO_CATALOGO, false);
    const visiveisEquipe = filtrarAlertasCatalogoVisiveis(ALERTAS_VEICULO_CATALOGO, true);
    assert.equal(visiveisCliente.length, 15);
    assert.equal(visiveisEquipe.length, 16);
    assert.equal(
      visiveisCliente.some((i) => i.chave === "corte_nao_autorizado_sms"),
      false,
    );

    const visiveisContaCliente = filtrarAlertasCatalogoVisiveis(
      ALERTAS_CONTA_OPERACIONAL_CATALOGO,
      false,
    );
    const visiveisContaEquipe = filtrarAlertasCatalogoVisiveis(
      ALERTAS_CONTA_OPERACIONAL_CATALOGO,
      true,
    );
    assert.equal(visiveisContaCliente.length, 7);
    assert.equal(visiveisContaEquipe.length, 14);
    assert.equal(
      visiveisContaCliente.some((i) => i.restritoEquipeTecnica === true),
      false,
    );

    const atendimentoItem = ALERTAS_CONTA_OPERACIONAL_CATALOGO.find(
      (i) => i.chave === "atendimento",
    );
    assert.ok(atendimentoItem);
    assert.equal(atendimentoItem.titulo, "Suporte e Meus Chamados");
    assert.equal(atendimentoItem.origemMonitoramento, "Central de Suporte ao Cliente");
    assert.equal(atendimentoItem.tituloEquipe, "Chamados e Atendimento ao Cliente");

    const jargoesInternos = [
      "Trigger Telemetria SQL",
      "verificar_jammers_servidor",
      "verificar_perda_comunicacao_servidor",
      "auditarIntegridadeEstadoEReverter",
      "nfStorageService",
      "hunter_processar_ciclo_vida_nfs",
      "POWERALM",
      "notificacoesBdService",
      "0x09",
      "0x06",
      "0x0E",
      "0x03",
    ];
    for (const item of CATALOGO_COMPLETO_ALERTAS) {
      for (const jargao of jargoesInternos) {
        assert.equal(
          item.origemMonitoramento.includes(jargao),
          false,
          `origemMonitoramento de ${item.chave} não deve expor símbolo interno ${jargao}`,
        );
      }
    }

    const serverCode = fs.readFileSync(path.resolve(process.cwd(), "src/server.ts"), "utf-8");
    assert.ok(serverCode.includes("ehAlertaRestritoEquipeTecnica"));
    assert.ok(serverCode.includes("role=in.(superadmin,adm,operador)"));
    assert.equal(serverCode.includes("role=in.(superadmin,adm,admin,operador)"), false);
    assert.ok(serverCode.includes("if (condicoes.length > 0)"));

    const bdCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/shared/lib/notificacoesBdService.ts"),
      "utf-8",
    );
    assert.ok(bdCode.includes("ehAlertaRestritoEquipeTecnica(notif.tipo)"));

    const authRouteCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/routes/_authenticated.tsx"),
      "utf-8",
    );
    assert.ok(authRouteCode.includes("isEquipeTecnicaRealtime"));

    const uiArquivos = [
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
      "src/features/monitor-gps/components/AlertasAcidenteBanner.tsx",
      "src/features/monitor-gps/components/CentralAlertasModal.tsx",
      "src/features/monitor-gps/components/TimelineVeiculoDrawer.tsx",
      "src/features/frota/components/FrotaAnalyticsView.tsx",
    ];
    for (const arq of uiArquivos) {
      const code = fs.readFileSync(path.resolve(process.cwd(), arq), "utf-8");
      assert.ok(
        code.includes("ehAlertaRestritoEquipeTecnica") ||
          code.includes("filtrarAlertasCatalogoVisiveis"),
        `${arq} deve aplicar filtragem de sigilo técnico`,
      );
    }

    const sigiloMigPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261110150000_hunter_sigilo_alerta_sms_equipe_tecnica.sql",
    );
    assert.ok(fs.existsSync(sigiloMigPath));
    const sigiloSql = fs.readFileSync(sigiloMigPath, "utf-8");
    assert.ok(sigiloSql.includes("is_equipe_tecnica_sigilo"));
    assert.ok(sigiloSql.includes("AS RESTRICTIVE"));
    assert.ok(sigiloSql.includes("ON public.alertas_seguranca"));
    assert.ok(sigiloSql.includes("ON public.eventos_veiculo"));
    assert.ok(sigiloSql.includes("ON public.notificacoes_sistema"));
    assert.ok(sigiloSql.includes("destinatario_cliente_id"));
    assert.ok(sigiloSql.includes("NOTIFY pgrst, 'reload schema';"));

    const bundleSql = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql"),
      "utf-8",
    );
    assert.ok(bundleSql.includes("20261110150000_hunter_sigilo_alerta_sms_equipe_tecnica.sql"));
  });

  test("9. Conformidade estrita: arquivo de teste sem caractere isolado de conjunção", () => {
    const selfPath = path.resolve(
      process.cwd(),
      "src/test/__tests__/hunter-central-alertas-configuracao-completa.test.ts",
    );
    const selfCode = fs.readFileSync(selfPath, "utf-8");
    const linhas = selfCode.split("\n").filter((l) => !l.includes("&&") && !l.includes("&amp;"));
    for (const l of linhas) {
      assert.doesNotMatch(l, /\s&\s/);
    }
  });
});
