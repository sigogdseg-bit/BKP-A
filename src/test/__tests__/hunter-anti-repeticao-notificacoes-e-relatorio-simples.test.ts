import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  formatarMensagemRelatorioDiario,
  type MetricasSistemaDiarias,
} from "../../features/relatorios/services/relatorioDiarioMetricasService";

describe("Hunter — Relatório Diário Simples, Informativo e Anti-Repetição (DJR-NEW)", () => {
  const baseMetricas: MetricasSistemaDiarias = {
    inicioCicloEgress: "18/10/2026",
    fimCicloEgress: "17/11/2026",
    egressCicloAtualMb: "150.25",
    egressCicloAntMb: "220.10",
    clientesAtivos: 10,
    clientesAguardando: 2,
    clientesBloqueados: 0,
    totalClientes: 12,
    clientesInadimplentes: 0,
    valorTotalInadimplente: "0.00",
    totalRecebidoMes: "5000.00",
    totalGastoMes: "1200.00",
    totalCaixaMes: "3800.00",
    inicioCicloChips: "23/09/2026",
    diasParaProximoCicloChips: 5,
    chipsMenor10Mb: 9,
    chipsEntre10e15Mb: 1,
    chipsAcima15Mb: 0,
    totalChips: 10,
    detalhesChips: [],
    mesReferencia: "10/2026",
    whatsappMes: 120,
    whatsappTotal: 450,
    suporteMes: 2,
    suporteTotal: 15,
    totalAlertas: 40,
    alertasNaoReconhecidos: 0,
    resumoTiposAlertas: {},
    infra: {
      supabaseEgressAtualMb: "150.25",
      supabaseEgressLimiteMb: 5000,
      supabaseEgressPercentual: "3.0",
      supabaseBancoAtualMb: 35,
      supabaseBancoLimiteMb: 500,
      supabaseBancoPercentual: "7.0",
      cloudflareReqDia: 8500,
      cloudflareReqLimiteDia: 100000,
      cloudflareReqPercentual: "8.5",
      flyVmsAtivas: 2,
      flyVmsLimite: 3,
      flyRamAtualMb: 130,
      flyRamLimiteMb: 512,
      flyVolumeAtualGb: 1,
      flyVolumeLimiteGb: 3,
      flyTrafegoLimiteGb: 160,
    },
    gateway: {
      conectado: true,
      status: "conectado",
      numero: "+55 24 99250-1512",
      uptimeHoras: 72,
      memoriaRamMb: 85,
    },
    operacao: {
      veiculosComunicando24h: 12,
      veiculosIncomunicaveis24h: 0,
      rastreadoresEstoque: 5,
      rastreadoresInstalados: 12,
      chipsLivres: 3,
      instalacoesAgendadas: 2,
      instalacoesAAgendar: 1,
    },
  };

  test("1. formatarMensagemRelatorioDiario deve destacar em vermelho valores negativos ou fora do limite", () => {
    // Cenário com caixa negativo, inadimplência, chip acima de 15MB e incomunicáveis
    const metricasComProblemas: MetricasSistemaDiarias = {
      ...baseMetricas,
      totalCaixaMes: "-1500.50",
      clientesInadimplentes: 3,
      valorTotalInadimplente: "1500.50",
      chipsAcima15Mb: 2,
      detalhesChips: [
        {
          linha: "5524999990001",
          iccid: "895501",
          consumoMb: 22.5,
          clienteNome: "Cliente Alfa",
          veiculoPlaca: "RIO2A10",
        },
      ],
      alertasNaoReconhecidos: 1,
      gateway: {
        ...baseMetricas.gateway,
        conectado: false,
      },
      operacao: {
        ...baseMetricas.operacao,
        veiculosIncomunicaveis24h: 2,
      },
      clientesBloqueados: 1,
    };

    const texto = formatarMensagemRelatorioDiario(metricasComProblemas);

    // Saldo do Caixa negativo em vermelho destacado
    assert.ok(
      texto.includes("🔴 • Saldo do Caixa: -R$ 1.500,50 (NEGATIVO)"),
      "Caixa negativo deve ser destacado em vermelho com indicador NEGATIVO",
    );

    // Inadimplência em vermelho destacado
    assert.ok(
      texto.includes("🔴 • Inadimplência: R$ 1500,50 (3 inadimplente(s) em atraso)"),
      "Inadimplência deve ser destacada em vermelho com quantidade e valor",
    );

    // Chips acima de 15MB em vermelho destacado identificando Placa/Chassi e Cliente
    assert.ok(
      texto.includes("🔴 • Acima de 15 MB: 2 chip"),
      "Chips acima de 15MB devem ser destacados em vermelho",
    );
    assert.ok(texto.includes("(FORA DO LIMITE)"), "Deve indicar FORA DO LIMITE");
    assert.ok(
      texto.includes("Placa RIO2A10"),
      "Deve exibir a Placa do veículo vinculado ao invés do número da linha",
    );
    assert.ok(texto.includes("Cliente: Cliente Alfa"), "Deve exibir o Nome do cliente vinculado");

    // Incomunicáveis em vermelho destacado
    assert.ok(
      texto.includes("🔴 • Incomunicáveis (>24h): 2 veículo(s)"),
      "Veículos incomunicáveis devem ser destacados em vermelho",
    );

    // Gateway desconectado em vermelho destacado
    assert.ok(
      texto.includes("🔴 • Conexão: 🔴 Desconectado"),
      "Gateway desconectado deve ser destacado em vermelho",
    );

    // Emergências em vermelho destacado
    assert.ok(
      texto.includes("🔴 • Emergências Pendentes: 1"),
      "Emergências pendentes devem ser destacadas em vermelho",
    );

    // Clientes bloqueados em vermelho
    assert.ok(
      texto.includes("🔴 • Bloqueados: 1 (BLOQUEADO)"),
      "Clientes bloqueados devem ser destacados em vermelho",
    );
  });

  test("2. formatarMensagemRelatorioDiario deve separar itens por linha e exibir verde para itens 100% em dia", () => {
    const texto = formatarMensagemRelatorioDiario(baseMetricas);

    // Itens normais devem estar com indicador verde
    assert.ok(texto.includes("🟢 • Saldo do Caixa: R$ 3.800,00 (Positivo)"));
    assert.ok(texto.includes("🟢 • Inadimplência: R$ 0,00 (100% em dia)"));
    assert.ok(texto.includes("🟢 • Acima de 15 MB: 0 chip (100% no limite)"));
    assert.ok(texto.includes("🟢 • Emergências Pendentes: Nenhuma (100% tratadas)"));
    assert.ok(texto.includes("🟢 • Conexão: 🟢 Conectado"));
    assert.ok(texto.includes("🟢 • Incomunicáveis (>24h): 0"));

    // Separação estrita por linha (não aglomera múltiplos bullets na mesma linha)
    const linhas = texto.split("\n");
    for (const linha of linhas) {
      // Cada linha não deve ter múltiplos tópicos '•' repetidos em clientes ou financeiro
      if (linha.includes("CLIENTES POR STATUS") || linha.includes("INADIMPLÊNCIA E FINANCEIRO"))
        continue;
      const countBullets = (linha.match(/•/g) || []).length;
      assert.ok(
        countBullets <= 2,
        `Linha deve ter no máximo 1 ou 2 bullets pontuais, encontrada com ${countBullets}: ${linha}`,
      );
    }
  });

  test("3. server.ts e relatorioDiarioMetricasService devem possuir travas atômicas anti-duplicação diária", async () => {
    const serverCode = await fs.readFile(
      new URL("../../../src/server.ts", import.meta.url),
      "utf-8",
    );
    const serviceCode = await fs.readFile(
      new URL(
        "../../../src/features/relatorios/services/relatorioDiarioMetricasService.ts",
        import.meta.url,
      ),
      "utf-8",
    );

    // Pre-lock atômico no cron do servidor
    assert.ok(
      serverCode.includes("PRE-LOCK ATÔMICO"),
      "server.ts deve implementar pre-lock atômico antes de despachar o relatório",
    );
    assert.ok(
      serverCode.includes("notificacoes_sistema"),
      "server.ts deve verificar se já existe notificação gerencial gerada hoje",
    );

    // Trava de idempotência no service
    assert.ok(
      serviceCode.includes("notifExistente"),
      "relatorioDiarioMetricasService deve verificar se já existe notificação de hoje",
    );
  });

  test("4. Migration SQL deve implementar trg_anti_duplicacao_notificacoes_sistema com bloqueio de 20 horas para relatórios", async () => {
    const migCode = await fs.readFile(
      new URL(
        "../../../supabase/migrations/20261020190000_hunter_anti_repeticao_relatorio_gerencial_e_notificacoes.sql",
        import.meta.url,
      ),
      "utf-8",
    );

    assert.ok(
      migCode.includes("INTERVAL '20 hours'"),
      "Trigger do banco deve descartar silenciosamente relatórios duplicados em janela de 20 horas",
    );
    assert.ok(
      migCode.includes("NEW.tipo IN ('gerencial', 'relatorio')"),
      "Trigger deve tratar tipos gerencial e relatorio",
    );
  });
});
