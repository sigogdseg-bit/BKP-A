import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_PADRAO_RELATORIO,
  relatorioGerencialConfigService,
} from "@/features/relatorios/services/relatorioGerencialConfigService";
import {
  formatarMensagemRelatorioDiario,
  MetricasSistemaDiarias,
} from "@/features/relatorios/services/relatorioDiarioMetricasService";

describe("HUNTER / SIGO GUARDIÃO — Relatório Gerencial e Módulo MODO", () => {
  it("deve carregar configuração padrão canônica com telefone do SuperADM e seções ativas", () => {
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.ativo, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.horario_envio, "10:00");
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.enviar_whatsapp, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.enviar_push, true);

    // Telefone padrão SuperADM
    assert.ok(Array.isArray(CONFIG_PADRAO_RELATORIO.telefones));
    assert.ok(CONFIG_PADRAO_RELATORIO.telefones.length >= 1);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.telefones[0].telefone, "5524992494030");
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.telefones[0].padrao, true);

    // Seções ativas
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.frota, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.alertas, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.financeiro, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.infraestrutura, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.chips, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.gateways, true);
    assert.strictEqual(CONFIG_PADRAO_RELATORIO.secoes_ativas.dre, true);
  });

  it("deve formatar a mensagem de relatório respeitando seções ativas e inativas", () => {
    const mockMetricas: MetricasSistemaDiarias = {
      inicioCicloEgress: "18/10/2026",
      fimCicloEgress: "18/11/2026",
      egressCicloAtualMb: "120.50",
      egressCicloAntMb: "450.20",
      clientesAtivos: 42,
      clientesAguardando: 3,
      clientesBloqueados: 1,
      totalClientes: 46,
      clientesInadimplentes: 0,
      valorTotalInadimplente: "0.00",
      totalRecebidoMes: "3450.00",
      totalGastoMes: "1200.00",
      totalCaixaMes: "2250.00",
      inicioCicloChips: "23/10/2026",
      diasParaProximoCicloChips: 4,
      chipsMenor10Mb: 40,
      chipsEntre10e15Mb: 2,
      chipsAcima15Mb: 1,
      totalChips: 43,
      detalhesChips: [{ linha: "24999990000", iccid: "8955000000", consumoMb: 18.4 }],
      mesReferencia: "10/2026",
      whatsappMes: 215,
      whatsappTotal: 1420,
      suporteMes: 12,
      suporteTotal: 98,
      totalAlertas: 0,
      alertasNaoReconhecidos: 0,
      resumoTiposAlertas: {},
      infra: {
        supabaseEgressAtualMb: "120.5",
        supabaseEgressLimiteMb: 5000,
        supabaseEgressPercentual: "2.4",
        supabaseBancoAtualMb: 85,
        supabaseBancoLimiteMb: 500,
        supabaseBancoPercentual: "17.0",
        cloudflareReqDia: 4500,
        cloudflareReqLimiteDia: 100000,
        cloudflareReqPercentual: "4.5",
        flyVmsAtivas: 1,
        flyVmsLimite: 3,
        flyRamAtualMb: 128,
        flyRamLimiteMb: 256,
        flyVolumeAtualGb: 1,
        flyVolumeLimiteGb: 3,
        flyTrafegoLimiteGb: 100,
      },
      gateway: {
        conectado: true,
        status: "open",
        numero: "5524992494030",
        uptimeHoras: 72,
        memoriaRamMb: 85,
      },
      operacao: {
        veiculosComunicando24h: 38,
        veiculosIncomunicaveis24h: 2,
        rastreadoresEstoque: 15,
        rastreadoresInstalados: 40,
        chipsLivres: 8,
        instalacoesAgendadas: 2,
        instalacoesAAgendar: 1,
      },
    };

    // Caso 1: Todas as seções ativas
    const msgCompleta = formatarMensagemRelatorioDiario(mockMetricas, {
      frota: true,
      alertas: true,
      financeiro: true,
      infraestrutura: true,
      chips: true,
      gateways: true,
      dre: true,
    });

    assert.ok(msgCompleta.includes("RELATÓRIO DIÁRIO DE MÉTRICAS"));
    assert.ok(msgCompleta.includes("1. FINANCEIRO E MENSALIDADES"));
    assert.ok(msgCompleta.includes("2. DEMONSTRATIVO CONSOLIDADO (DRE DA REDE)"));
    assert.ok(msgCompleta.includes("3. ALERTAS E SEGURANÇA OPERACIONAL"));
    assert.ok(msgCompleta.includes("4. FROTA, CLIENTES E OPERAÇÃO"));
    assert.ok(msgCompleta.includes("5. CONSUMO DE DADOS DOS CHIPS M2M"));
    assert.ok(msgCompleta.includes("6. GATEWAYS E COMUNICAÇÃO"));
    assert.ok(msgCompleta.includes("7. LIMITES FREE TIER E INFRAESTRUTURA"));

    // Caso 2: Apenas Frota e Alertas ativos (desmarcando Financeiro, Infra, Chips, Gateways e DRE)
    const msgFiltrada = formatarMensagemRelatorioDiario(mockMetricas, {
      frota: true,
      alertas: true,
      financeiro: false,
      infraestrutura: false,
      chips: false,
      gateways: false,
      dre: false,
    });

    assert.ok(msgFiltrada.includes("1. ALERTAS E SEGURANÇA OPERACIONAL"));
    assert.ok(msgFiltrada.includes("2. FROTA, CLIENTES E OPERAÇÃO"));
    assert.ok(!msgFiltrada.includes("FINANCEIRO E MENSALIDADES"));
    assert.ok(!msgFiltrada.includes("DEMONSTRATIVO CONSOLIDADO (DRE DA REDE)"));
    assert.ok(!msgFiltrada.includes("CONSUMO DE DADOS DOS CHIPS M2M"));
    assert.ok(!msgFiltrada.includes("LIMITES FREE TIER E INFRAESTRUTURA"));
  });

  it("deve conter a seção de DRE no modal de configuração e na migração SQL", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/relatorios/components/RelatorioGerencialModal.tsx",
    );
    const modalConteudo = fs.readFileSync(modalPath, "utf-8");
    assert.ok(modalConteudo.includes("Demonstrativo DRE da Rede"));
    assert.ok(modalConteudo.includes("config.secoes_ativas.dre"));

    const migracaoPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261029143000_sigo_guardiao_relatorio_gerencial_dre.sql",
    );
    assert.ok(fs.existsSync(migracaoPath));
    const migracaoConteudo = fs.readFileSync(migracaoPath, "utf-8");
    assert.ok(migracaoConteudo.includes('"dre": true'));
    assert.ok(migracaoConteudo.includes("reload schema"));
  });

  it("deve garantir que o serviço de configuração possui métodos canônicos", () => {
    assert.strictEqual(typeof relatorioGerencialConfigService.carregar, "function");
    assert.strictEqual(typeof relatorioGerencialConfigService.salvar, "function");
    assert.strictEqual(typeof relatorioGerencialConfigService.dispararAgora, "function");
  });
});
