/**
 * Hunter — Utilitário de Encargos Legais e Recálculo de Prestações em Atraso
 *
 * Em estrita conformidade com a legislação brasileira vigente:
 * - Multa Moratória: 2% (dois por cento) sobre a prestação em atraso (Código de Defesa do Consumidor, art. 52, § 1º).
 * - Juros de Mora: 1% (um por cento) ao mês pro rata die (Código Civil, art. 406 c/c Código Tributário Nacional, art. 161, § 1º).
 * - Taxa diária de juros: (1% / 30 dias) = ~0,03333% ao dia corrido de atraso.
 */

export interface ResultadoEncargos {
  diasAtraso: number;
  estaEmAtraso: boolean;
  valorOriginal: number;
  multaPercentual: number;
  valorMulta: number;
  jurosPercentualTotal: number;
  valorJuros: number;
  totalEncargos: number;
  valorTotalAtualizado: number;
  dataCalculoFormatada: string;
}

/**
 * Calcula os encargos moratórios legais e o valor total atualizado de uma prestação
 * com base na data de vencimento e na data de acesso/cálculo.
 */
export function calcularEncargosAtraso(
  valorOriginal: number,
  dataVencimentoStr: string,
  dataCalculo: Date = new Date(),
): ResultadoEncargos {
  const dataHojeStr = dataCalculo.toISOString().split("T")[0];
  const dataHojeFormatada = dataCalculo.toLocaleDateString("pt-BR");

  const vOrig = Math.max(0, Number(valorOriginal) || 0);

  // Se o valor for 0 (cliente cortesia), não há encargos
  if (vOrig === 0) {
    return {
      diasAtraso: 0,
      estaEmAtraso: false,
      valorOriginal: 0,
      multaPercentual: 0,
      valorMulta: 0,
      jurosPercentualTotal: 0,
      valorJuros: 0,
      totalEncargos: 0,
      valorTotalAtualizado: 0,
      dataCalculoFormatada: dataHojeFormatada,
    };
  }

  // Normaliza as datas para meia-noite para contagem exata de dias corridos
  const [anoVenc, mesVenc, diaVenc] = dataVencimentoStr.split("T")[0].split("-").map(Number);
  const dataVenc = new Date(anoVenc, mesVenc - 1, diaVenc);
  dataVenc.setHours(0, 0, 0, 0);

  const dataAtual = new Date(dataCalculo);
  dataAtual.setHours(0, 0, 0, 0);

  const diffMs = dataAtual.getTime() - dataVenc.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias <= 0) {
    return {
      diasAtraso: 0,
      estaEmAtraso: false,
      valorOriginal: vOrig,
      multaPercentual: 0,
      valorMulta: 0,
      jurosPercentualTotal: 0,
      valorJuros: 0,
      totalEncargos: 0,
      valorTotalAtualizado: vOrig,
      dataCalculoFormatada: dataHojeFormatada,
    };
  }

  // Multa fixa legal de 2%
  const multaPercentual = 2.0;
  const valorMulta = Number(((vOrig * multaPercentual) / 100).toFixed(2));

  // Juros de mora legais de 1% a.m. pro rata die = (1% / 30) ao dia
  const taxaDiariaJuros = 1.0 / 30.0;
  const jurosPercentualTotal = Number((taxaDiariaJuros * diffDias).toFixed(4));
  const valorJuros = Number((vOrig * (taxaDiariaJuros / 100.0) * diffDias).toFixed(2));

  const totalEncargos = Number((valorMulta + valorJuros).toFixed(2));
  const valorTotalAtualizado = Number((vOrig + totalEncargos).toFixed(2));

  return {
    diasAtraso: diffDias,
    estaEmAtraso: true,
    valorOriginal: vOrig,
    multaPercentual,
    valorMulta,
    jurosPercentualTotal,
    valorJuros,
    totalEncargos,
    valorTotalAtualizado,
    dataCalculoFormatada: dataHojeFormatada,
  };
}
