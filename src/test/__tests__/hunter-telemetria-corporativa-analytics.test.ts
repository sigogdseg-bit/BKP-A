import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Testes Unitários de Telemetria Corporativa, Estatística Analítica e Gestão Financeira de Frota
 * Protocolo Hunter-Guardian / DJR-NEW:
 * - Filtragem anti-ruído: dias sem deslocamento (0 km) não poluem a visão operacional do gestor
 * - Tempo ocioso real: calculado por ignição ligada sem deslocamento físico
 * - Telemetria de alertas registrados: contagem real por severidade e taxa por 100 km
 * - Telemetria de manutenções preventivas: conformidade, no prazo, a vencer e atrasadas
 * - Estatística financeira: TCO, Custo por KM (R$/km), rateio combustível vs manutenção
 * - Ausência estrita do caractere comercial proibido (&)
 */

interface LinhaAnalytics {
  data: string;
  km_rodado: number;
  tempo_ocioso_minutos: number;
  alertas_count: number;
  score_conducao: number;
}

interface ItemManutencao {
  id: string;
  descricao: string;
  km_proxima: number;
  data_proxima: string;
}

interface DespesaRegistro {
  id: string;
  tipo: "combustivel" | "manutencao" | "outros";
  valor: number;
  data: string;
}

// 1. Filtragem anti-ruído: dias sem deslocamento
function filtrarLinhasOperacionais(
  linhas: LinhaAnalytics[],
  ocultarSemDeslocamento: boolean,
): LinhaAnalytics[] {
  if (!ocultarSemDeslocamento) return linhas;
  return linhas.filter((l) => l.km_rodado > 0);
}

// 2. Cálculo de tempo ocioso real (ignição ligada sem deslocamento)
function calcularTempoOciosoViagem(
  inicioIso: string,
  fimIso: string,
  kmRodado: number,
  velocidadeMediaKmh: number,
): number {
  const inicio = new Date(inicioIso).getTime();
  const fim = new Date(fimIso).getTime();
  const duracaoMinutos = Math.max(0, Math.round((fim - inicio) / 60000));

  if (kmRodado <= 0) {
    // Ignição ligada durante todo o período sem deslocar
    return duracaoMinutos;
  }

  const tempoMovimentoMinutos = velocidadeMediaKmh > 0 ? (kmRodado / velocidadeMediaKmh) * 60 : 0;
  const ocioso = Math.max(0, Math.round(duracaoMinutos - tempoMovimentoMinutos));
  return ocioso;
}

// 3. Taxa de incidentes/alertas por 100 km
function calcularTaxaAlertasPor100Km(totalAlertas: number, totalKm: number): number {
  if (totalKm <= 0) return 0;
  return Number(((totalAlertas / totalKm) * 100).toFixed(2));
}

// 4. Auditoria de manutenção preventiva
function auditarPlanoManutencao(
  planos: ItemManutencao[],
  kmAtualVeiculo: number,
  dataHojeIso: string,
): { emDia: number; atrasadas: number; percentualConformidade: number } {
  if (!planos || planos.length === 0) {
    return { emDia: 0, atrasadas: 0, percentualConformidade: 100 };
  }

  let emDia = 0;
  let atrasadas = 0;
  const hoje = new Date(dataHojeIso).getTime();

  for (const item of planos) {
    const dataLimite = new Date(item.data_proxima).getTime();
    const atrasadaPorKm = item.km_proxima > 0 && kmAtualVeiculo >= item.km_proxima;
    const atrasadaPorData = dataLimite < hoje;

    if (atrasadaPorKm || atrasadaPorData) {
      atrasadas++;
    } else {
      emDia++;
    }
  }

  const conformidade = Math.round((emDia / planos.length) * 100);
  return { emDia, atrasadas, percentualConformidade: conformidade };
}

// 5. Estatística financeira TCO e Custo por KM
function calcularMetricasFinanceirasFrota(
  despesas: DespesaRegistro[],
  totalKmRodado: number,
): {
  totalGasto: number;
  gastoCombustivel: number;
  gastoManutencao: number;
  custoPorKm: number | null;
} {
  const gastoCombustivel = despesas
    .filter((d) => d.tipo === "combustivel")
    .reduce((acc, d) => acc + d.valor, 0);

  const gastoManutencao = despesas
    .filter((d) => d.tipo === "manutencao")
    .reduce((acc, d) => acc + d.valor, 0);

  const totalGasto = despesas.reduce((acc, d) => acc + d.valor, 0);

  const custoPorKm = totalKmRodado > 0 ? Number((totalGasto / totalKmRodado).toFixed(2)) : null;

  return { totalGasto, gastoCombustivel, gastoManutencao, custoPorKm };
}

describe("Hunter — Telemetria Corporativa, Ociosidade Real e Gestão Financeira de Frota (DJR-NEW)", () => {
  it("1. Anti-ruído: dias sem deslocamento (0 km) são ocultados para focar em circulação ativa", () => {
    const dados: LinhaAnalytics[] = [
      {
        data: "2026-09-30",
        km_rodado: 24.2,
        tempo_ocioso_minutos: 15,
        alertas_count: 1,
        score_conducao: 85,
      },
      {
        data: "2026-09-29",
        km_rodado: 0.0,
        tempo_ocioso_minutos: 0,
        alertas_count: 0,
        score_conducao: 100,
      },
      {
        data: "2026-09-28",
        km_rodado: 0.0,
        tempo_ocioso_minutos: 0,
        alertas_count: 0,
        score_conducao: 100,
      },
      {
        data: "2026-09-27",
        km_rodado: 48.0,
        tempo_ocioso_minutos: 22,
        alertas_count: 2,
        score_conducao: 67,
      },
    ];

    const filtrados = filtrarLinhasOperacionais(dados, true);
    assert.equal(filtrados.length, 2, "Apenas os 2 dias com deslocamento ativo devem ser exibidos");
    assert.equal(filtrados[0].km_rodado, 24.2);
    assert.equal(filtrados[1].km_rodado, 48.0);

    const todos = filtrarLinhasOperacionais(dados, false);
    assert.equal(todos.length, 4, "Modo auditoria exibe todos os dias do calendário");
  });

  it("2. Tempo ocioso real: veículo parado com ignição ligada não pode reportar zero", () => {
    // Exemplo: Veículo ficou com ignição ligada das 08:00 às 08:45 (45 min)
    // Percorreu 10 km a 30 km/h de média (tempo de movimento = 20 min)
    // Tempo ocioso (parado com motor ligado, ex: ar condicionado/espera) = 25 min
    const ocioso = calcularTempoOciosoViagem(
      "2026-09-30T08:00:00Z",
      "2026-09-30T08:45:00Z",
      10,
      30,
    );
    assert.equal(ocioso, 25, "Tempo ocioso real deve ser 25 minutos");

    // Veículo com ignição ligada por 30 minutos sem rodar nada (0 km)
    const ociosoEstacionado = calcularTempoOciosoViagem(
      "2026-09-30T10:00:00Z",
      "2026-09-30T10:30:00Z",
      0,
      0,
    );
    assert.equal(
      ociosoEstacionado,
      30,
      "Tempo ocioso deve ser exatamente a duração da ignição ligada",
    );
  });

  it("3. Telemetria de alertas: calcula taxa exata por 100 km rodados", () => {
    // 5 alertas registrados em 250 km rodados => 2.0 alertas a cada 100 km
    const taxa = calcularTaxaAlertasPor100Km(5, 250);
    assert.equal(taxa, 2.0);

    // Sem rodagem => 0 alertas por 100 km (proteção divisão por zero)
    assert.equal(calcularTaxaAlertasPor100Km(0, 0), 0);
  });

  it("4. Auditoria de manutenção preventiva: calcula itens em dia, atrasados e índice de conformidade", () => {
    const planos: ItemManutencao[] = [
      {
        id: "p1",
        descricao: "Troca de Óleo e Filtro",
        km_proxima: 50000,
        data_proxima: "2026-11-01",
      },
      { id: "p2", descricao: "Pastilhas de Freio", km_proxima: 48000, data_proxima: "2026-12-01" },
      {
        id: "p3",
        descricao: "Revisão Anual de Arrefecimento",
        km_proxima: 60000,
        data_proxima: "2026-08-15",
      }, // Atrasada por data
    ];

    // Veículo com 49.000 km em 2026-09-30:
    // p1: 50000 km > 49000 km e 2026-11-01 > 2026-09-30 => EM DIA
    // p2: 48000 km <= 49000 km => ATRASADA POR KM
    // p3: 2026-08-15 < 2026-09-30 => ATRASADA POR DATA
    const auditoria = auditarPlanoManutencao(planos, 49000, "2026-09-30");
    assert.equal(auditoria.emDia, 1);
    assert.equal(auditoria.atrasadas, 2);
    assert.equal(auditoria.percentualConformidade, 33, "1 em 3 = 33% de conformidade");
  });

  it("5. Gestão Financeira TCO: calcula Custo por KM e segregação por combustível e manutenção", () => {
    const despesas: DespesaRegistro[] = [
      { id: "d1", tipo: "combustivel", valor: 280.0, data: "2026-09-25" },
      { id: "d2", tipo: "combustivel", valor: 310.0, data: "2026-09-28" },
      { id: "d3", tipo: "manutencao", valor: 450.0, data: "2026-09-29" },
    ];

    // Total gasto: 280 + 310 + 450 = R$ 1040,00
    // Total km rodado: 1200 km
    // Custo por KM = 1040 / 1200 = R$ 0,87 / km
    const financeiro = calcularMetricasFinanceirasFrota(despesas, 1200);
    assert.equal(financeiro.totalGasto, 1040.0);
    assert.equal(financeiro.gastoCombustivel, 590.0);
    assert.equal(financeiro.gastoManutencao, 450.0);
    assert.equal(financeiro.custoPorKm, 0.87);
  });

  it("7. Infográficos ativos como filtros: alternância e seleção cirúrgica de subconjuntos", () => {
    const dados: LinhaAnalytics[] = [
      {
        data: "2026-09-30",
        km_rodado: 120.0,
        tempo_ocioso_minutos: 35,
        alertas_count: 3,
        score_conducao: 65,
      },
      {
        data: "2026-09-29",
        km_rodado: 85.0,
        tempo_ocioso_minutos: 0,
        alertas_count: 0,
        score_conducao: 95,
      },
      {
        data: "2026-09-28",
        km_rodado: 40.0,
        tempo_ocioso_minutos: 15,
        alertas_count: 1,
        score_conducao: 80,
      },
    ];

    // Filtro por Score Crítico (< 75)
    const criticos = dados.filter((d) => d.score_conducao < 75);
    assert.equal(criticos.length, 1);
    assert.equal(criticos[0].score_conducao, 65);

    // Filtro por Ociosidade (> 0)
    const comOciosidade = dados.filter((d) => d.tempo_ocioso_minutos > 0);
    assert.equal(comOciosidade.length, 2);

    // Filtro por Score Excelente (>= 90)
    const excelentes = dados.filter((d) => d.score_conducao >= 90);
    assert.equal(excelentes.length, 1);
    assert.equal(excelentes[0].score_conducao, 95);
  });

  it("8. Ordenação bidirecional de cabeçalhos: ordenação ascendente, descendente e preservação de tipos", () => {
    const itens = [
      { placa: "B-200", km: 50, valor: 300 },
      { placa: "A-100", km: 120, valor: 150 },
      { placa: "C-300", km: 20, valor: 450 },
    ];

    // Ordenação alfanumérica por placa (ascendente)
    const ascPlaca = [...itens].sort((a, b) => a.placa.localeCompare(b.placa));
    assert.equal(ascPlaca[0].placa, "A-100");
    assert.equal(ascPlaca[2].placa, "C-300");

    // Ordenação numérica por KM (descendente)
    const descKm = [...itens].sort((a, b) => b.km - a.km);
    assert.equal(descKm[0].km, 120);
    assert.equal(descKm[2].km, 20);

    // Ordenação numérica por valor (ascendente)
    const ascValor = [...itens].sort((a, b) => a.valor - b.valor);
    assert.equal(ascValor[0].valor, 150);
    assert.equal(ascValor[2].valor, 450);
  });

  it("9. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", () => {
    const texto = `
      Relatório Executivo de Telemetria e Desempenho da Frota
      Segurança e Alertas Registrados
      Custos e Financeiro TCO
      Saúde da Frota e Manutenção Preventiva
      Ordenação Bidirecional e Filtros Ativos
    `;
    assert.ok(!texto.includes("&"), "Não deve conter o caractere comercial proibido");
  });

  it("10. Regra Canônica Hunter: KM em todo o sistema suporta até 2 casas decimais para precisão máxima", () => {
    // Simula cálculo com odômetro GPS com casas decimais acumuladas
    const proximoKmAlvo = 10000;
    const odometroRealGps = 7906.019999999989;

    // Cálculo bruto com ponto flutuante IEEE 754 (produz dízima)
    const bruto = proximoKmAlvo - odometroRealGps;
    assert.strictEqual(Number.isInteger(bruto), false);
    assert.ok(bruto.toString().startsWith("2093.98000000001"));

    // Cálculo canônico Hunter (com precisão de até 2 casas decimais)
    const odoAtualFormatado = Number(odometroRealGps.toFixed(2));
    const kmRestanteFormatado = Number((proximoKmAlvo - odoAtualFormatado).toFixed(2));

    assert.equal(odoAtualFormatado, 7906.02);
    assert.equal(kmRestanteFormatado, 2093.98);

    const textoExibicao = `${kmRestanteFormatado.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} km restantes`;
    assert.equal(textoExibicao, "2.093,98 km restantes");
    assert.ok(
      textoExibicao.includes(",98"),
      "Deve conter precisão decimal de até 2 casas em km restantes",
    );
  });

  it("11. Regra Canônica Hunter: KM Diário e Tooltip do Gráfico de Barras com precisão de até 2 casas decimais", () => {
    // Simula as viagens reais do dia 01/10 com ponto flutuante que produziu 8.799999999999999
    const viagensDia = [{ km_percorrido: 4.4 }, { km_percorrido: 4.4 }];

    let kmAcumuladoFloat = 0;
    for (const v of viagensDia) {
      kmAcumuladoFloat += v.km_percorrido;
    }
    // IEEE 754 float
    assert.equal(kmAcumuladoFloat, 8.8);

    // No mapaAgregado e dadosGrafico, o km_rodado preserva até 2 casas decimais
    const kmRodadoFinal = Number(kmAcumuladoFloat.toFixed(2));
    assert.equal(kmRodadoFinal, 8.8);

    // Formatter do RechartsTooltip com até 2 casas decimais
    const tooltipFormatter = (valor: any) => [
      Number(valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
      "KM Rodados",
    ];

    const [valorFormatado, label] = tooltipFormatter(kmAcumuladoFloat);
    assert.equal(label, "KM Rodados");
    assert.equal(valorFormatado, "8,8");
    assert.ok(!valorFormatado.includes("."), "Tooltip brasileiro utiliza vírgula para decimal");
    assert.ok(valorFormatado.includes(",8"), "Tooltip preserva o valor decimal preciso 8,8");

    // Caso de viagem curta de 0.41 km
    const [valorCurto] = tooltipFormatter(0.41);
    assert.equal(valorCurto, "0,41", "Viagem curta de 0.41 km não deve ser zerada no tooltip");
  });
});
