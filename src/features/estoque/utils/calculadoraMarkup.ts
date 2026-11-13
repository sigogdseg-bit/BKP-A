/**
 * Hunter — Módulo de Estoque: Calculadora Inteligente de Markup e Engenharia de Preços
 * Diretrizes: DJR-NEW e DJR-APP
 *
 * Fórmula do Markup sobre o Custo:
 *   Preço = Custo * (1 + Markup% / 100)
 *   Markup% = ((Preço - Custo) / Custo) * 100
 *
 * Fórmula da Margem de Contribuição Bruta (Divisor):
 *   Margem% = ((Preço - Custo) / Preço) * 100
 *   Preço = Custo / (1 - Margem% / 100)
 */

export interface MetricasPrecoVenda {
  custo: number;
  custoBase: number;
  custoFrete: number;
  precoVenda: number;
  lucroBruto: number;
  markupPercentual: number;
  markupEfetivoPercentual: number;
  margemLucroPercentual: number;
  margemBrutaPercentual: number;
  fatorMultiplicador: number;
}

export interface PresetMarkup {
  id: string;
  rotulo: string;
  markupPercentual: number;
  descricao: string;
}

export const PRESETS_MARKUP_ESPECIALISTA: PresetMarkup[] = [
  {
    id: "competitivo",
    rotulo: "30% (Competitivo)",
    markupPercentual: 30,
    descricao: "Margem bruta de ~23% para alto giro e frotas",
  },
  {
    id: "padrao",
    rotulo: "50% (Padrão)",
    markupPercentual: 50,
    descricao: "Margem comercial de 33,3% equilibrada",
  },
  {
    id: "rentavel",
    rotulo: "70% (Alta Margem)",
    markupPercentual: 70,
    descricao: "Margem de 41,2% com cobertura técnica",
  },
  {
    id: "dobro",
    rotulo: "100% (Dobro)",
    markupPercentual: 100,
    descricao: "Preço final correspondente a 2x o custo",
  },
  {
    id: "premium",
    rotulo: "150% (Premium)",
    markupPercentual: 150,
    descricao: "Margem de 60% com valor agregado e garantia estendida",
  },
];

export const PRESETS_MARKUP = PRESETS_MARKUP_ESPECIALISTA.map((p) => ({
  ...p,
  markup: p.markupPercentual,
}));

/**
 * Calcula o preço de venda sugerido a partir de um custo base, percentual de markup e custo de frete.
 * O markup incide estritamente sobre o custo base da peça (sem lucro sobre o frete),
 * e o frete é somado ao final no preço de venda.
 */
export function calcularPrecoPorMarkup(
  custoBase: number,
  markupPercentual: number,
  custoFrete: number = 0,
): number {
  const c = Math.max(0, Number(custoBase) || 0);
  const m = Math.max(0, Number(markupPercentual) || 0);
  const f = Math.max(0, Number(custoFrete) || 0);
  const preco = c * (1 + m / 100) + f;
  return Math.round(preco * 100) / 100;
}

/**
 * Calcula o preço de venda sugerido a partir de uma margem de lucro alvo (divisor)
 */
export function calcularPrecoPorMargem(custo: number, margemPercentual: number): number {
  const c = Math.max(0, Number(custo) || 0);
  const margem = Math.min(99.99, Math.max(0, Number(margemPercentual) || 0));
  if (margem >= 100) return c;
  const preco = c / (1 - margem / 100);
  return Math.round(preco * 100) / 100;
}

/**
 * Dado o custo base, o preço de venda final e o custo do frete,
 * extrai todas as métricas financeiras (Markup sobre base, Margem %, Lucro R$, Fator).
 * O frete compõe o custo total do material, mas não tem markup atribuído.
 */
export function analisarPrecoVenda(
  custoBase: number,
  precoVenda: number,
  custoFrete: number = 0,
): MetricasPrecoVenda {
  const cb = Math.max(0, Number(custoBase) || 0);
  const cf = Math.max(0, Number(custoFrete) || 0);
  const custoTotal = cb + cf;
  const p = Math.max(0, Number(precoVenda) || 0);
  const lucroBruto = Math.round((p - custoTotal) * 100) / 100;

  // Markup efetivo sobre o Custo Base (excluindo frete do lucro)
  const markupPercentual = cb > 0 ? Math.round(((p - cf - cb) / cb) * 10000) / 100 : 0;
  const margemLucroPercentual = p > 0 ? Math.round((lucroBruto / p) * 10000) / 100 : 0;
  const fatorMultiplicador = custoTotal > 0 ? Math.round((p / custoTotal) * 100) / 100 : 0;

  return {
    custo: custoTotal,
    custoBase: cb,
    custoFrete: cf,
    precoVenda: p,
    lucroBruto,
    markupPercentual,
    markupEfetivoPercentual: markupPercentual,
    margemLucroPercentual,
    margemBrutaPercentual: margemLucroPercentual,
    fatorMultiplicador,
  };
}
