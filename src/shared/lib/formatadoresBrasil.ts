/**
 * SIGO Guardião — Módulo Canônico de Formatação Brasileira e Fuso Horário
 *
 * Diretrizes Inegociáveis (DJR-NEW / SIGO Guardião):
 * - Fuso Horário Oficial: Brasil / São Paulo ("America/Sao_Paulo", UTC-3).
 * - Formato de Data: dd/mm/aaaa.
 * - Formato de Hora: hh:mm (padrão) e hh:mm:ss (quando alta precisão/segundos forem necessários).
 * - Idioma e Localização: Português Brasileiro ("pt-BR").
 * - Separação Numérica: Milhar com ponto (.) e decimais com vírgula (,).
 * - Moeda: R$ positivo (ex: "R$ 1.250,00") e negativo estrito (ex: "-R$ 150,00").
 * - Proibição Absoluta de dedução, valores falsos ou datas mascaradas.
 */

const FUSO_BRASIL = "America/Sao_Paulo";
const LOCALE_BRASIL = "pt-BR";

/**
 * Converte qualquer entrada de data (Date, string ISO, timestamp number) para objeto Date válido.
 */
function normalizarData(valor: Date | string | number | null | undefined): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata data no padrão brasileiro canônico: dd/mm/aaaa
 * Exemplo: "13/10/2026"
 */
export function formatarDataBrasil(valor: Date | string | number | null | undefined): string {
  const d = normalizarData(valor);
  if (!d) return "—";

  return new Intl.DateTimeFormat(LOCALE_BRASIL, {
    timeZone: FUSO_BRASIL,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * Formata hora no fuso de Brasília/São Paulo: hh:mm ou hh:mm:ss
 * Exemplo: "22:36" ou "22:36:45"
 */
export function formatarHoraBrasil(
  valor: Date | string | number | null | undefined,
  comSegundos: boolean = false,
): string {
  const d = normalizarData(valor);
  if (!d) return "—";

  return new Intl.DateTimeFormat(LOCALE_BRASIL, {
    timeZone: FUSO_BRASIL,
    hour: "2-digit",
    minute: "2-digit",
    second: comSegundos ? "2-digit" : undefined,
    hour12: false,
  }).format(d);
}

/**
 * Formata data e hora completos no fuso oficial de São Paulo: dd/mm/aaaa às hh:mm[:ss]
 * Exemplo: "13/10/2026 às 22:36:45"
 */
export function formatarDataHoraBrasil(
  valor: Date | string | number | null | undefined,
  comSegundos: boolean = true,
): string {
  const d = normalizarData(valor);
  if (!d) return "—";

  const data = formatarDataBrasil(d);
  const hora = formatarHoraBrasil(d, comSegundos);
  return `${data} às ${hora}`;
}

/**
 * Formata valores monetários no padrão do Real Brasileiro:
 * Positivo: "R$ 1.500,00"
 * Negativo: "-R$ 150,00"
 */
export function formatarMoedaBrasil(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return "R$ 0,00";

  const isNegativo = valor < 0;
  const absoluto = Math.abs(valor);

  const formatado = new Intl.NumberFormat(LOCALE_BRASIL, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absoluto);

  return isNegativo ? `-${formatado}` : formatado;
}

/**
 * Formata números com separador de milhar com ponto (.) e decimal com vírgula (,).
 * Exemplo: 183270.19 -> "183.270,19"
 */
export function formatarNumeroBrasil(
  valor: number | null | undefined,
  casasDecimais: number = 2,
): string {
  if (valor === null || valor === undefined || isNaN(valor)) return "0";

  return new Intl.NumberFormat(LOCALE_BRASIL, {
    minimumFractionDigits: casasDecimais,
    maximumFractionDigits: casasDecimais,
  }).format(valor);
}

/**
 * Formata quilometragem no padrão brasileiro:
 * Exemplo: 183270.19 -> "183.270,2 km" ou "183.270 km"
 */
export function formatarKmBrasil(km: number | null | undefined, casasDecimais: number = 1): string {
  if (km === null || km === undefined || isNaN(km)) return "0 km";
  return `${formatarNumeroBrasil(km, casasDecimais)} km`;
}
