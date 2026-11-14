// pedagioTagService.ts — GD Rastreamento
// Gestão de Tags Eletrônicas de Pedágio (Sem Parar, ConectCar, Veloe e MoveMais)
// Conciliação de Passagens nas Praças com a Telemetria GPS e Histórico de Viagens

export type OperadoraTag = "sem_parar" | "conectcar" | "veloe" | "move_mais";

export interface TagPedagio {
  id: string;
  veiculo_id: string;
  placa: string;
  operadora: OperadoraTag;
  numero_tag: string;
  status: "ativo" | "inativo" | "bloqueado";
  saldo_atual?: number;
  data_vinculo?: string;
}

export interface PassagemPedagio {
  id: string;
  tag_id?: string;
  veiculo_id?: string;
  placa: string;
  operadora: OperadoraTag;
  praca_nome: string;
  rodovia?: string;
  km?: number;
  valor: number;
  data_hora: string;
  latitude?: number;
  longitude?: number;
  conciliado_gps?: boolean;
}

export interface PontoGpsReferencia {
  dataHora: string | Date;
  latitude: number;
  longitude: number;
  velocidade: number;
}

/**
 * Calcula a distância métrica em metros via Haversine entre duas coordenadas
 */
function calcularDistanciaHaversineMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Cruza e concilia as passagens registradas na concessionária com os pontos de GPS do veículo
 * Um registro é considerado 'conciliado' quando existe um ponto de telemetria GPS no mesmo intervalo
 * de tempo (+- 15 minutos) a uma distância inferior a 1.500 metros da praça informada (se houver coordenadas)
 */
export function conciliarPassagensPedagioComGps(
  passagens: PassagemPedagio[],
  pontosGps: PontoGpsReferencia[],
  toleranciaMinutos = 15,
): Array<
  PassagemPedagio & {
    conciliado_gps: boolean;
    diferencaTempoMinutos?: number;
    distanciaAproximadaMetros?: number;
  }
> {
  return passagens.map((p) => {
    const tPassagem = new Date(p.data_hora).getTime();
    if (isNaN(tPassagem) || pontosGps.length === 0) {
      return { ...p, conciliado_gps: false };
    }

    let melhorPonto: PontoGpsReferencia | null = null;
    let menorDiffMs = Infinity;

    for (const pt of pontosGps) {
      const tGps = new Date(pt.dataHora).getTime();
      const diff = Math.abs(tPassagem - tGps);
      if (diff < menorDiffMs) {
        menorDiffMs = diff;
        melhorPonto = pt;
      }
    }

    const diffMinutos = Math.round(menorDiffMs / (1000 * 60));
    const tempoValido = diffMinutos <= toleranciaMinutos;

    let distanciaMetros: number | undefined;
    let distanciaValida = true;

    if (p.latitude && p.longitude && melhorPonto) {
      distanciaMetros = Math.round(
        calcularDistanciaHaversineMetros(
          p.latitude,
          p.longitude,
          melhorPonto.latitude,
          melhorPonto.longitude,
        ),
      );
      distanciaValida = distanciaMetros <= 2500; // tolerância de 2.5 km ao redor da antena da praça
    }

    const conciliado = tempoValido && distanciaValida;

    return {
      ...p,
      conciliado_gps: conciliado,
      diferencaTempoMinutos: diffMinutos,
      distanciaAproximadaMetros: distanciaMetros,
    };
  });
}

/**
 * Importa extrato em formato CSV exportado pelo portal das operadoras (Sem Parar, ConectCar, Veloe)
 */
export function importarExtratoPedagioCsv(
  csvConteudo: string,
  operadoraPadrao: OperadoraTag = "sem_parar",
): PassagemPedagio[] {
  if (!csvConteudo || !csvConteudo.trim()) return [];

  const linhas = csvConteudo.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length < 2) return [];

  const delimitador = linhas[0].includes(";") ? ";" : ",";

  const passagens: PassagemPedagio[] = [];
  // Pula linha de cabeçalho
  for (let i = 1; i < linhas.length; i++) {
    const colunas = linhas[i].split(delimitador).map((c) => c.replace(/^["']|["']$/g, "").trim());
    if (colunas.length < 4) continue;

    // Layout flexível: [DataHora, Placa, Praça/Local, Valor, ...]
    const dataHoraStr = colunas[0];
    const placa = colunas[1].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const pracaNome = colunas[2] || "Praça de Pedágio";
    const valorLimpo = colunas[3]
      .replace("R$", "")
      .replace(/\s+/g, "")
      .replace(/\.(?=\d{3})/g, "") // remove separador de milhar se houver
      .replace(",", "."); // converte vírgula decimal em ponto
    const valorNum = Number(valorLimpo) || 0;

    if (placa.length >= 7 && valorNum > 0) {
      passagens.push({
        id: `pedagio_${Date.now()}_${i}`,
        placa,
        operadora: operadoraPadrao,
        praca_nome: pracaNome,
        valor: valorNum,
        data_hora: new Date(dataHoraStr).toISOString() || new Date().toISOString(),
        conciliado_gps: false,
      });
    }
  }

  return passagens;
}

/**
 * Calcula totalizadores financeiros e operacionais do lote de passagens
 */
export function calcularTotalizadoresPedagio(passagens: PassagemPedagio[]): {
  totalGasto: number;
  qtdPassagens: number;
  mediaPorPassagem: number;
  totalConciliadoGps: number;
  porPraca: Record<string, { qtd: number; valorTotal: number }>;
} {
  let totalGasto = 0;
  let totalConciliado = 0;
  const porPraca: Record<string, { qtd: number; valorTotal: number }> = {};

  for (const p of passagens) {
    const valor = Number(p.valor || 0);
    totalGasto += valor;
    if (p.conciliado_gps) totalConciliado++;

    const praca = p.praca_nome || "Outras Praças";
    if (!porPraca[praca]) {
      porPraca[praca] = { qtd: 0, valorTotal: 0 };
    }
    porPraca[praca].qtd++;
    porPraca[praca].valorTotal += valor;
  }

  const qtdPassagens = passagens.length;
  const mediaPorPassagem =
    qtdPassagens > 0 ? Math.round((totalGasto / qtdPassagens) * 100) / 100 : 0;

  return {
    totalGasto: Math.round(totalGasto * 100) / 100,
    qtdPassagens,
    mediaPorPassagem,
    totalConciliadoGps: totalConciliado,
    porPraca,
  };
}
