// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Serviço Canônico de Projeção Financeira e Transporte de Caixa
// ─────────────────────────────────────────────────────────────────────────────

import type { TransacaoFinanceira, ProjecaoMensal, MetricasExecutivas } from "../types";

const NOMES_MESES_ABREV = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/**
 * Calcula o saldo líquido acumulado realizado de todos os meses anteriores à competência informada.
 * Se ano/mês for informado como "todos", o saldo anterior é 0.
 */
export function calcularSaldoAnteriorTransportado(
  transacoes: TransacaoFinanceira[],
  ano?: string | number,
  mes?: string | number,
): number {
  if (!ano || ano === "todos" || !mes || mes === "todos") {
    return 0;
  }

  const anoNum = typeof ano === "string" ? parseInt(ano, 10) : ano;
  const mesNum = typeof mes === "string" ? parseInt(mes, 10) : mes;

  if (isNaN(anoNum) || isNaN(mesNum)) return 0;

  const limiteCompetenciaStr = `${anoNum}-${String(mesNum).padStart(2, "0")}-01`;

  let saldoAnterior = 0;

  for (const t of transacoes) {
    if (t.status !== "concluido") continue;
    if (!t.data_competencia) continue;

    // Apenas transações estritamente anteriores ao mês selecionado
    if (t.data_competencia < limiteCompetenciaStr) {
      const valor = Number(t.valor) || 0;
      if (t.tipo === "entrada") {
        saldoAnterior += valor;
      } else if (t.tipo === "saida") {
        saldoAnterior -= valor;
      }
    }
  }

  return Number(saldoAnterior.toFixed(2));
}

/**
 * Gera a projeção contínua mês a mês para os próximos 12 meses (ou 6 meses)
 * transportando o saldo acumulado de caixa de cada período.
 */
export function calcularProjecaoMensal12Meses(
  transacoes: TransacaoFinanceira[],
  mrrContratadoEstimado = 0,
  horizonteMeses = 12,
): ProjecaoMensal[] {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1; // 1-12

  // 1. Calcula o saldo inicial transportado antes do primeiro mês da projeção
  let caixaCorrente = calcularSaldoAnteriorTransportado(transacoes, anoAtual, mesAtual);

  const projecoes: ProjecaoMensal[] = [];

  for (let i = 0; i < horizonteMeses; i++) {
    const dataAlvo = new Date(anoAtual, mesAtual - 1 + i, 1);
    const ano = dataAlvo.getFullYear();
    const mes = dataAlvo.getMonth() + 1;
    const chaveMes = `${ano}-${String(mes).padStart(2, "0")}`;
    const mesRotulo = `${NOMES_MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;

    // Transações já existentes no banco para esse mês
    const transacoesMes = transacoes.filter((t) => {
      if (!t.data_competencia) return false;
      return t.data_competencia.startsWith(chaveMes);
    });

    let recRealizadas = 0;
    let recPrevistas = 0;
    let despRealizadas = 0;
    let despPrevistas = 0;

    for (const t of transacoesMes) {
      const valor = Number(t.valor) || 0;
      const isLiquidado = t.status === "concluido";

      if (t.tipo === "entrada") {
        if (isLiquidado) recRealizadas += valor;
        else if (t.status === "pendente") recPrevistas += valor;
      } else if (t.tipo === "saida") {
        if (isLiquidado) despRealizadas += valor;
        else if (t.status === "pendente") despPrevistas += valor;
      }
    }

    // Se a receita prevista for zero mas houver MRR contratado,
    // projeta a receita recorrente das mensalidades ativas
    if (recRealizadas + recPrevistas === 0 && mrrContratadoEstimado > 0) {
      recPrevistas = mrrContratadoEstimado;
    }

    const receitasTotal = Number((recRealizadas + recPrevistas).toFixed(2));
    const despesasTotal = Number((despRealizadas + despPrevistas).toFixed(2));
    const resultadoLiquidoMes = Number((receitasTotal - despesasTotal).toFixed(2));
    const caixaInicialTransportado = Number(caixaCorrente.toFixed(2));
    const saldoFinalProjetado = Number((caixaInicialTransportado + resultadoLiquidoMes).toFixed(2));

    projecoes.push({
      chaveMes,
      mesRotulo,
      ano,
      mes,
      caixaInicialTransportado,
      receitasRealizadas: Number(recRealizadas.toFixed(2)),
      receitasPrevistas: Number(recPrevistas.toFixed(2)),
      receitasTotal,
      despesasRealizadas: Number(despRealizadas.toFixed(2)),
      despesasPrevistas: Number(despPrevistas.toFixed(2)),
      despesasTotal,
      resultadoLiquidoMes,
      saldoFinalProjetado,
      isPassadoOuAtual: i === 0,
    });

    // O saldo final deste mês vira o saldo inicial transportado do próximo mês
    caixaCorrente = saldoFinalProjetado;
  }

  return projecoes;
}

/**
 * Calcula métricas executivas de inteligência financeira a partir do livro-caixa e projeções.
 */
export function calcularMetricasExecutivas(
  transacoes: TransacaoFinanceira[],
  projecoes: ProjecaoMensal[],
  mrrContratualBase = 0,
): MetricasExecutivas {
  // 1. Calcula o MRR a partir da média ou do valor contratual direto
  let mrr = mrrContratualBase;
  if (mrr <= 0 && projecoes.length > 0) {
    // Usa a média das receitas dos primeiros 3 meses
    const primeiros3 = projecoes.slice(0, 3);
    const somaReceitas = primeiros3.reduce((acc, p) => acc + p.receitasTotal, 0);
    mrr = primeiros3.length > 0 ? somaReceitas / primeiros3.length : 0;
  }

  // 2. Despesas Fixas Recorrentes mensais ativas
  const despesasRecorrentesUnicas = new Set<string>();
  let despesasFixas = 0;

  for (const t of transacoes) {
    if (t.tipo !== "saida") continue;
    if (t.modalidade === "recorrente" && t.recorrencia_ativa !== false) {
      const chaveRec = t.recorrencia_id || t.descricao;
      if (!despesasRecorrentesUnicas.has(chaveRec)) {
        despesasRecorrentesUnicas.add(chaveRec);
        despesasFixas += Number(t.valor) || 0;
      }
    }
  }

  // Se não houver despesas recorrentes com flag explícita, calcula a média das projeções
  if (despesasFixas <= 0 && projecoes.length > 0) {
    const somaDesp = projecoes.slice(0, 3).reduce((acc, p) => acc + p.despesasTotal, 0);
    despesasFixas = somaDesp / Math.min(3, projecoes.length);
  }

  const mrrAtual = Number(mrr.toFixed(2));
  const arrProjetado = Number((mrrAtual * 12).toFixed(2));
  const despesasFixasValor = Number(despesasFixas.toFixed(2));
  const lucroOperacionalProjetado = Number((mrrAtual - despesasFixasValor).toFixed(2));
  const margemMediaProjetada =
    mrrAtual > 0 ? Number(((lucroOperacionalProjetado / mrrAtual) * 100).toFixed(1)) : 0;

  return {
    mrrAtual,
    arrProjetado,
    despesasRecorrentesFixas: despesasFixasValor,
    lucroOperacionalProjetado,
    margemMediaProjetada,
    totalContratosAtivos: 0,
  };
}
