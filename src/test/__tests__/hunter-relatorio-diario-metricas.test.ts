import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularInicioCiclo,
  calcularFimCiclo,
  formatarDataCivilBR,
  formatarMensagemRelatorioDiario,
  type MetricasSistemaDiarias,
} from "../../features/relatorios/services/relatorioDiarioMetricasService.ts";

describe("HUNTER-GUARDIAN — Relatório Diário de Métricas do Sistema", () => {
  const mockMetricas: MetricasSistemaDiarias = {
    inicioCicloEgress: "18/10/2026",
    fimCicloEgress: "17/11/2026",
    egressCicloAtualMb: "0.51",
    egressCicloAntMb: "22.78",
    clientesAtivos: 1,
    clientesAguardando: 2,
    clientesBloqueados: 0,
    totalClientes: 3,
    clientesInadimplentes: 0,
    valorTotalInadimplente: "0.00",
    totalRecebidoMes: "1250.00",
    totalGastoMes: "450.00",
    totalCaixaMes: "800.00",
    inicioCicloChips: "23/09/2026",
    diasParaProximoCicloChips: 5,
    chipsMenor10Mb: 9,
    chipsEntre10e15Mb: 0,
    chipsAcima15Mb: 1,
    totalChips: 10,
    detalhesChips: [{ linha: "5516910198056", iccid: "89553202100092787858", consumoMb: 38.11 }],
    mesReferencia: "10/2026",
    whatsappMes: 51,
    whatsappTotal: 158,
    suporteMes: 0,
    suporteTotal: 1,
    totalAlertas: 25,
    alertasNaoReconhecidos: 0,
    resumoTiposAlertas: { saida_area: 6, ignicao_fora_horario: 7 },
    infra: {
      supabaseEgressAtualMb: "0.51",
      supabaseEgressLimiteMb: 5000,
      supabaseEgressPercentual: "0.01",
      supabaseBancoAtualMb: 45,
      supabaseBancoLimiteMb: 500,
      supabaseBancoPercentual: "9.0",
      cloudflareReqDia: 4250,
      cloudflareReqLimiteDia: 100000,
      cloudflareReqPercentual: "4.3",
      flyVmsAtivas: 2,
      flyVmsLimite: 3,
      flyRamAtualMb: 143,
      flyRamLimiteMb: 512,
      flyVolumeAtualGb: 1,
      flyVolumeLimiteGb: 3,
      flyTrafegoLimiteGb: 160,
    },
    gateway: {
      conectado: true,
      status: "conectado",
      numero: "+55 24 99250-1512",
      uptimeHoras: 38,
      memoriaRamMb: 99,
    },
    operacao: {
      veiculosComunicando24h: 1,
      veiculosIncomunicaveis24h: 0,
      rastreadoresEstoque: 7,
      rastreadoresInstalados: 1,
      chipsLivres: 2,
      instalacoesAgendadas: 2,
      instalacoesAAgendar: 1,
    },
  };

  it("deve calcular o início e fim de ciclo corretamente para dia 18 (Egress)", () => {
    // Caso 1: Data é 18/10/2026 -> Ciclo inicia em 18/10/2026
    const ref18Out = new Date("2026-10-18T13:00:00Z");
    const inicio18Out = calcularInicioCiclo(18, ref18Out);
    assert.equal(formatarDataCivilBR(inicio18Out), "18/10/2026");

    const fim18Out = calcularFimCiclo(inicio18Out, 18);
    assert.equal(formatarDataCivilBR(fim18Out), "17/11/2026");

    // Caso 2: Data é 05/10/2026 -> Ciclo iniciou em 18/09/2026
    const ref05Out = new Date("2026-10-05T13:00:00Z");
    const inicio05Out = calcularInicioCiclo(18, ref05Out);
    assert.equal(formatarDataCivilBR(inicio05Out), "18/09/2026");
  });

  it("deve calcular o início e fim de ciclo corretamente para dia 23 (Chips M2M)", () => {
    // Caso 1: Data é 18/10/2026 (antes do dia 23) -> Ciclo iniciou em 23/09/2026
    const ref18Out = new Date("2026-10-18T13:00:00Z");
    const inicio18Out = calcularInicioCiclo(23, ref18Out);
    assert.equal(formatarDataCivilBR(inicio18Out), "23/09/2026");

    const fim18Out = calcularFimCiclo(inicio18Out, 23);
    assert.equal(formatarDataCivilBR(fim18Out), "22/10/2026");

    // Caso 2: Data é 25/10/2026 (depois do dia 23) -> Ciclo iniciou em 23/10/2026
    const ref25Out = new Date("2026-10-25T13:00:00Z");
    const inicio25Out = calcularInicioCiclo(23, ref25Out);
    assert.equal(formatarDataCivilBR(inicio25Out), "23/10/2026");
  });

  it("deve formatar o relatório com todas as 10 seções completas incluindo limites, gateway e frota/estoque", () => {
    const texto = formatarMensagemRelatorioDiario(mockMetricas);

    // Verificações estruturais dos tópicos modulares
    assert.ok(texto.includes("RELATÓRIO DIÁRIO DE MÉTRICAS"));
    assert.ok(texto.includes("SuperADM (Dario Novaes)"));
    assert.ok(texto.includes("FINANCEIRO E MENSALIDADES"));
    assert.ok(texto.includes("DEMONSTRATIVO CONSOLIDADO (DRE DA REDE)"));
    assert.ok(texto.includes("ALERTAS E SEGURANÇA OPERACIONAL"));
    assert.ok(texto.includes("FROTA, CLIENTES E OPERAÇÃO"));
    assert.ok(texto.includes("CONSUMO DE DADOS DOS CHIPS M2M"));
    assert.ok(texto.includes("GATEWAYS E COMUNICAÇÃO"));
    assert.ok(texto.includes("LIMITES FREE TIER E INFRAESTRUTURA"));

    assert.ok(texto.includes("Total Recebido: R$ 1.250,00"));
    assert.ok(texto.includes("Total Gasto: R$ 450,00"));
    assert.ok(texto.includes("Total do Caixa: R$ 800,00"));
    assert.ok(texto.includes("Ativos: 1"));
    assert.ok(texto.includes("Acima de 15 MB: 1 chip (38,11 MB"));
    assert.ok(texto.includes("Disparadas no Mês: 51 mensagens"));
    assert.ok(texto.includes("Supabase:"));
    assert.ok(texto.includes("Cloudflare:"));
    assert.ok(texto.includes("Oracle Cloud Always Free:"));
    assert.ok(texto.includes("Conexão: 🟢 Conectado (+55 24 99250-1512)"));
    assert.ok(texto.includes("7 rastreadores • 2 chips livres"));
    assert.ok(texto.includes("2 agendadas • 1 a agendar"));

    // Regras Pétreas: Isolamento e SuperADM
    assert.ok(!texto.includes("SIGOVTR"), "Proibido citar outros sistemas");
    assert.ok(!texto.includes("SIGOFROTA"), "Proibido citar outros sistemas");
    assert.ok(!texto.includes("SuperAdmin Mestre"), "Uso estrito de SuperADM");
    assert.ok(texto.includes("GD Rastreamento"));
  });

  it("deve incluir contas a pagar e a receber a partir de 3 dias de antecedência com subtotais diários e total geral", () => {
    const mockMetricasComPrevisao: MetricasSistemaDiarias = {
      inicioCicloEgress: "18/10/2026",
      fimCicloEgress: "17/11/2026",
      egressCicloAtualMb: "1.20",
      egressCicloAntMb: "15.00",
      clientesAtivos: 5,
      clientesAguardando: 0,
      clientesBloqueados: 0,
      totalClientes: 5,
      clientesInadimplentes: 0,
      valorTotalInadimplente: "0.00",
      totalRecebidoMes: "5000.00",
      totalGastoMes: "1200.00",
      totalCaixaMes: "3800.00",
      contasAPagar: {
        hoje: {
          data: "2026-10-23",
          dataFmt: "23/10/2026",
          rotulo: "Hoje",
          valor: 250.0,
          valorFmt: "250,00",
        },
        amanha: {
          data: "2026-10-24",
          dataFmt: "24/10/2026",
          rotulo: "Amanhã",
          valor: 100.0,
          valorFmt: "100,00",
        },
        depoisAmanha: {
          data: "2026-10-25",
          dataFmt: "25/10/2026",
          rotulo: "Depois de amanhã",
          valor: 450.0,
          valorFmt: "450,00",
        },
        total: 800.0,
        totalFmt: "800,00",
      },
      contasAReceber: {
        hoje: {
          data: "2026-10-23",
          dataFmt: "23/10/2026",
          rotulo: "Hoje",
          valor: 750.0,
          valorFmt: "750,00",
        },
        amanha: {
          data: "2026-10-24",
          dataFmt: "24/10/2026",
          rotulo: "Amanhã",
          valor: 300.0,
          valorFmt: "300,00",
        },
        depoisAmanha: {
          data: "2026-10-25",
          dataFmt: "25/10/2026",
          rotulo: "Depois de amanhã",
          valor: 1500.0,
          valorFmt: "1.500,00",
        },
        total: 2550.0,
        totalFmt: "2.550,00",
      },
      inicioCicloChips: "23/09/2026",
      diasParaProximoCicloChips: 5,
      chipsMenor10Mb: 10,
      chipsEntre10e15Mb: 0,
      chipsAcima15Mb: 0,
      totalChips: 10,
      detalhesChips: [],
      mesReferencia: "10/2026",
      whatsappMes: 20,
      whatsappTotal: 100,
      suporteMes: 0,
      suporteTotal: 0,
      totalAlertas: 0,
      alertasNaoReconhecidos: 0,
      resumoTiposAlertas: {},
      infra: {
        supabaseEgressAtualMb: "1.20",
        supabaseEgressLimiteMb: 5000,
        supabaseEgressPercentual: "0.02",
        supabaseBancoAtualMb: 40,
        supabaseBancoLimiteMb: 500,
        supabaseBancoPercentual: "8.0",
        cloudflareReqDia: 1000,
        cloudflareReqLimiteDia: 100000,
        cloudflareReqPercentual: "1.0",
        flyVmsAtivas: 1,
        flyVmsLimite: 3,
        flyRamAtualMb: 100,
        flyRamLimiteMb: 512,
        flyVolumeAtualGb: 1,
        flyVolumeLimiteGb: 3,
        flyTrafegoLimiteGb: 160,
      },
      gateway: {
        conectado: true,
        status: "conectado",
        numero: "+55 24 99250-1512",
        uptimeHoras: 24,
        memoriaRamMb: 80,
      },
      operacao: {
        veiculosComunicando24h: 5,
        veiculosIncomunicaveis24h: 0,
        rastreadoresEstoque: 10,
        rastreadoresInstalados: 5,
        chipsLivres: 5,
        instalacoesAgendadas: 0,
        instalacoesAAgendar: 0,
      },
    };

    const texto = formatarMensagemRelatorioDiario(mockMetricasComPrevisao);

    // Validações da seção A PAGAR
    assert.ok(texto.includes("A PAGAR (3 Dias de Antecedência):"));
    assert.ok(texto.includes("• 23/10/2026 (Hoje) - R$ 250,00"));
    assert.ok(texto.includes("• 24/10/2026 (Amanhã) - R$ 100,00"));
    assert.ok(texto.includes("• 25/10/2026 (Depois de amanhã) - R$ 450,00"));
    assert.ok(texto.includes("• *Total a Pagar:* R$ 800,00"));

    // Validações da seção A RECEBER
    assert.ok(texto.includes("A RECEBER (3 Dias de Antecedência):"));
    assert.ok(texto.includes("• 23/10/2026 (Hoje) - R$ 750,00"));
    assert.ok(texto.includes("• 24/10/2026 (Amanhã) - R$ 300,00"));
    assert.ok(texto.includes("• 25/10/2026 (Depois de amanhã) - R$ 1.500,00"));
    assert.ok(texto.includes("• *Total a Receber:* R$ 2.550,00"));
  });

  it("Regra Pétrea: Seção de Chips lista apenas quantidades nas faixas e lista clientes APENAS se consumo for > 15MB", () => {
    // Cenário A: Todos os chips abaixo de 15MB (ex: 10 chips no limite)
    const metricasSemExcesso = {
      ...mockMetricas,
      totalChips: 10,
      chipsMenor10Mb: 10,
      chipsEntre10e15Mb: 0,
      chipsAcima15Mb: 0,
      detalhesChips: [
        {
          linha: "24999990001",
          iccid: "8955000000001",
          consumoMb: 4.99,
          clienteNome: "Cliente Normal 1",
          veiculoPlaca: "AXH0E44",
          veiculoModelo: "Volvo XC 60",
        },
        {
          linha: "24999990002",
          iccid: "8955000000002",
          consumoMb: 3.58,
          clienteNome: "Cliente Normal 2",
          veiculoPlaca: "LTK1A94",
          veiculoModelo: "Montana",
        },
      ],
    };

    const textoSemExcesso = formatarMensagemRelatorioDiario(metricasSemExcesso);
    assert.ok(textoSemExcesso.includes("CONSUMO DE DADOS DOS CHIPS M2M"));
    assert.ok(textoSemExcesso.includes("• Menor que 10 MB: 10"));
    assert.ok(textoSemExcesso.includes("• De 10 a 15 MB: 0"));
    assert.ok(textoSemExcesso.includes("🟢 • Acima de 15 MB: 0 chip (100% no limite)"));
    assert.ok(
      !textoSemExcesso.includes("Cliente Normal 1"),
      "Não deve listar clientes quando o consumo for menor ou igual a 15MB",
    );
    assert.ok(
      !textoSemExcesso.includes("Cliente Normal 2"),
      "Não deve listar clientes quando o consumo for menor ou igual a 15MB",
    );
    assert.ok(
      !textoSemExcesso.includes("Clientes Acima de 15 MB:"),
      "Não deve exibir seção de detalhamento de clientes se não houver chips acima de 15MB",
    );

    // Cenário B: Chip acima de 15MB deve listar estritamente o cliente excedente
    const metricasComExcesso = {
      ...mockMetricas,
      totalChips: 10,
      chipsMenor10Mb: 9,
      chipsEntre10e15Mb: 0,
      chipsAcima15Mb: 1,
      detalhesChips: [
        {
          linha: "24999990001",
          iccid: "8955000000001",
          consumoMb: 4.99,
          clienteNome: "Cliente Normal 1",
          veiculoPlaca: "AXH0E44",
          veiculoModelo: "Volvo XC 60",
        },
        {
          linha: "24999990002",
          iccid: "8955000000002",
          consumoMb: 18.75,
          clienteNome: "Cliente Excedente",
          veiculoPlaca: "EXC1234",
          veiculoModelo: "Caminhão Scania",
        },
      ],
    };

    const textoComExcesso = formatarMensagemRelatorioDiario(metricasComExcesso);
    assert.ok(textoComExcesso.includes("🔴 • Acima de 15 MB: 1 chip"));
    assert.ok(textoComExcesso.includes("Clientes Acima de 15 MB:"));
    assert.ok(
      textoComExcesso.includes("Cliente Excedente"),
      "Deve listar o cliente com consumo acima de 15MB",
    );
    assert.ok(
      textoComExcesso.includes("EXC1234"),
      "Deve listar a placa do veículo do chip acima de 15MB",
    );
    assert.ok(
      !textoComExcesso.includes("Cliente Normal 1"),
      "Não deve listar clientes cujo consumo esteja dentro do limite de 15MB",
    );
  });
});
