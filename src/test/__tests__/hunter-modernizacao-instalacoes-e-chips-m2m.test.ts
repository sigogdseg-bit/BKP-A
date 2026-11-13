import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatarMensagemRelatorioDiario,
  type MetricasSistemaDiarias,
} from "../../features/relatorios/services/relatorioDiarioMetricasService.ts";

describe("HUNTER-GUARDIAN — Modernização de Telas e Calibração dos Chips M2M", () => {
  const rootDir = process.cwd();

  it("1. InstalacoesView.tsx deve possuir seletor de abas canônico tático com alto contraste (padrão Rastreadores J16)", () => {
    const filePath = path.join(rootDir, "src/features/instalacoes/components/InstalacoesView.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Deve usar bg-slate-900 text-white no ativo do modo claro e dark:bg-emerald-500
    assert.ok(
      content.includes("bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"),
      "Abas devem possuir alto contraste tático e destaque visual idêntico ao Rastreador J16.",
    );
    assert.ok(
      content.includes("uppercase tracking-wider"),
      "Rótulos das abas devem ser em caixa alta com espaçamento tático.",
    );
    assert.ok(
      content.includes("rounded-2xl shadow-[4px_4px_10px_#c3cfe2]"),
      "Contêiner das abas deve possuir elevação canônica com sombra suave e borda.",
    );
  });

  it("2. InstalacoesView.tsx deve conter cards blindados contra overflow e agrupamento em blocos táteis", () => {
    const filePath = path.join(rootDir, "src/features/instalacoes/components/InstalacoesView.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Cards devem possuir overflow-hidden para não vazar badges
    assert.ok(
      content.includes("relative overflow-hidden"),
      "Card de instalação deve possuir overflow-hidden para proteger contra vazamento de badges.",
    );
    assert.ok(
      content.includes("min-w-0 flex-1"),
      "Cabeçalho do card deve permitir truncate correto de placa e modelo sem empurrar badges fora.",
    );
    assert.ok(
      content.includes("shrink-0 flex flex-col items-end"),
      "Badges de status devem ser isolados com shrink-0 para não serem comprimidos.",
    );
    assert.ok(
      content.includes("Bloco Operacional (Cliente e Técnico)"),
      "Card deve agrupar dados em bloco operacional tático.",
    );
    assert.ok(
      content.includes("Bloco Hardware, Kit e Local Físico"),
      "Card deve agrupar dados de hardware e rastreador em sub-painel visual.",
    );
    assert.ok(
      content.includes("Bloco Agendamento e Repasse Financeiro"),
      "Card deve agrupar agendamento e mão de obra de forma estruturada.",
    );
  });

  it("3. relatorioDiarioMetricasService.ts deve conter calibração com medições reais da operadora e texto canônico de ciclo", () => {
    const filePath = path.join(
      rootDir,
      "src/features/relatorios/services/relatorioDiarioMetricasService.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(
      content.includes("MEDICOES_REAIS_OPERADORA"),
      "Deve incorporar medições reais aferidas na operadora celular M2M.",
    );
    assert.ok(
      content.includes("863874085222366"),
      "Deve conter calibração do IMEI do Volvo AXH0E44 (Dario Novaes).",
    );
    assert.ok(
      content.includes("869890084959182"),
      "Deve conter calibração do IMEI da Montana LTK1A94 (Alex Sandro).",
    );
    assert.ok(
      content.includes("Ciclo M2M: Virada no Dia 23"),
      "Rótulo do ciclo deve especificar 'Ciclo M2M: Virada no Dia 23'.",
    );
  });

  it("4. formatarMensagemRelatorioDiario deve alertar com precisão quando há múltiplos chips acima de 15 MB", () => {
    const mock: MetricasSistemaDiarias = {
      inicioCicloEgress: "18/10/2026",
      fimCicloEgress: "17/11/2026",
      egressCicloAtualMb: "7.93",
      egressCicloAntMb: "22.78",
      clientesAtivos: 2,
      clientesAguardando: 1,
      clientesBloqueados: 0,
      totalClientes: 3,
      clientesInadimplentes: 0,
      valorTotalInadimplente: "0.00",
      totalRecebidoMes: "0.00",
      totalGastoMes: "45.20",
      totalCaixaMes: "-45.20",
      inicioCicloChips: "23/10/2026",
      diasParaProximoCicloChips: 15,
      chipsMenor10Mb: 8,
      chipsEntre10e15Mb: 0,
      chipsAcima15Mb: 2,
      totalChips: 10,
      detalhesChips: [
        {
          linha: "5516910198056",
          iccid: "89553202100092787858",
          consumoMb: 16.45,
          clienteNome: "Dario Novaes",
          veiculoPlaca: "AXH0E44",
          veiculoModelo: "Volvo XC 60 T6",
        },
        {
          linha: "5516910198024",
          iccid: "89553202100092787791",
          consumoMb: 15.8,
          clienteNome: "Alex Sandro Fernandes Souza",
          veiculoPlaca: "LTK1A94",
          veiculoModelo: "GM MONTANA GM/ MONTANA SPORT",
        },
        {
          linha: "5516910197996",
          iccid: "89553202100092787817",
          consumoMb: 0.0,
        },
      ],
      mesReferencia: "11/2026",
      whatsappMes: 62,
      whatsappTotal: 334,
      suporteMes: 0,
      suporteTotal: 1,
      totalAlertas: 0,
      alertasNaoReconhecidos: 0,
      resumoTiposAlertas: {},
      infra: {
        supabaseEgressAtualMb: "7.93",
        supabaseEgressLimiteMb: 5000,
        supabaseEgressPercentual: "0.16",
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
        numero: "+5524992501512",
        uptimeHoras: 107,
        memoriaRamMb: 74,
      },
      operacao: {
        veiculosComunicando24h: 2,
        veiculosIncomunicaveis24h: 0,
        rastreadoresEstoque: 6,
        rastreadoresInstalados: 2,
        chipsLivres: 2,
        instalacoesAgendadas: 1,
        instalacoesAAgendar: 0,
      },
    };

    const texto = formatarMensagemRelatorioDiario(mock);

    assert.ok(
      texto.includes("• Ciclo M2M: Virada no Dia 23 (Faltam 15 dias)"),
      "Texto deve conter a virada no dia 23.",
    );
    assert.ok(
      texto.includes("🔴 • Acima de 15 MB: 2 chips (FORA DO LIMITE)"),
      "Deve indicar alerta vermelho para 2 chips acima de 15 MB.",
    );
    assert.ok(
      texto.includes("Dario Novaes • Placa AXH0E44 (Volvo XC 60 T6) | Consumo: 16,45 MB"),
      "Deve detalhar o consumo de 16,45 MB do Volvo de Dario Novaes.",
    );
    assert.ok(
      texto.includes("Alex Sandro Fernandes Souza • Placa LTK1A94"),
      "Deve detalhar o consumo da Montana de Alex Sandro.",
    );
    assert.ok(
      texto.includes("• Menor que 10 MB: 8"),
      "Deve reportar 8 chips restantes em estoque/menor que 10 MB.",
    );
  });

  it("5. Regra Pétrea: Ausência estrita do caractere comercial proibido nos arquivos alterados", () => {
    const arquivosParaChecar = [
      "src/features/instalacoes/components/InstalacoesView.tsx",
      "src/features/relatorios/services/relatorioDiarioMetricasService.ts",
      "supabase/migrations/20261108110000_hunter_calibracao_consumo_chips_operadora.sql",
    ];

    for (const relPath of arquivosParaChecar) {
      const fullPath = path.join(rootDir, relPath);
      const text = fs.readFileSync(fullPath, "utf-8");
      // Ignora apenas operadores lógicos no código como && ou URLs
      const linhas = text.split("\n");
      linhas.forEach((linha, idx) => {
        // Remove operadores lógicos JS '&&' ou URLs
        const semOperadoresLogicos = linha.replace(/&&/g, "").replace(/https?:\/\/[^\s]+/g, "");
        assert.ok(
          !semOperadoresLogicos.includes("&"),
          `Caractere comercial proibido encontrado em ${relPath}:${idx + 1}: ${linha.trim()}`,
        );
      });
    }
  });
});
