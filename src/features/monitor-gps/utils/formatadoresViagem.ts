/**
 * Utilitários Canônicos de Formatação de Quilometragem, Distância e Tempo (DJR-NEW / HUNTER-GUARDIAN)
 *
 * Regras Pétreas de Precisão Operacional:
 * 1. Distância ("Metros até virar KM"):
 *    - Deslocamentos menores que 1 km (< 1000m) são exibidos em metros (ex: "410 m", "730 m", "50 m", "0 m").
 *    - A partir de 1 km (>= 1.0 km), são exibidos em km com até 2 casas decimais (ex: "1 km", "2,27 km", "31,11 km", "1.234,56 km").
 *    - Para odômetros absolutos, pode-se forçar a exibição em km via { forcarKm: true }.
 *
 * 2. Tempo / Duração ("Minutos até virar Hora"):
 *    - Períodos menores que 60 min são exibidos em minutos (ex: "0 min", "15 min", "45 min", "59 min").
 *    - Acima de 60 min, são exibidos em horas e minutos (ex: 60 min -> "1h", 120 min -> "2h", 322 min -> "5h 22min").
 */

export function formatarDistancia(
  km: number | string | null | undefined,
  maxDecimais = 2,
  opcoes?: { forcarKm?: boolean },
): string {
  if (km === null || km === undefined || km === "") {
    return opcoes?.forcarKm ? "0 km" : "0 m";
  }

  const valorKm = Number(km);
  if (isNaN(valorKm) || valorKm === 0) {
    return opcoes?.forcarKm ? "0 km" : "0 m";
  }

  // Deslocamento menor que 1 km é exibido em metros ("metros até virar km")
  if (!opcoes?.forcarKm && Math.abs(valorKm) < 1) {
    const metros = Math.round(valorKm * 1000);
    return `${metros} m`;
  }

  const formatado = valorKm.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimais,
  });

  return `${formatado} km`;
}

export function formatarKm(
  km: number | string | null | undefined,
  maxDecimais = 2,
  opcoes?: { forcarKm?: boolean },
): string {
  return formatarDistancia(km, maxDecimais, opcoes);
}

export function formatarDistanciaViagem(
  km: number | string | null | undefined,
  opcoes?: { forcarKm?: boolean },
): string {
  return formatarDistancia(km, 2, opcoes);
}

/**
 * Formata minutos na regra canônica "minutos até virar hora".
 * - Abaixo de 60 min: "X min"
 * - A partir de 60 min: "Xh Ymin" ou "Xh"
 */
export function formatarMinutos(minutos: number | string | null | undefined): string {
  if (minutos === null || minutos === undefined || minutos === "") {
    return "0 min";
  }

  const totalMin = Number(minutos);
  if (isNaN(totalMin) || totalMin <= 0) {
    return "0 min";
  }

  if (totalMin < 60) {
    return `${Math.round(totalMin)} min`;
  }

  const horas = Math.floor(totalMin / 60);
  const minRestantes = Math.round(totalMin % 60);

  if (minRestantes === 0) {
    return `${horas}h`;
  }

  return `${horas}h ${minRestantes}min`;
}
