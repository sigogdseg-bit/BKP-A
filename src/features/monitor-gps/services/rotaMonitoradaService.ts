import { supabase } from "@/integrations/supabase/client";
import { calcularDistanciaMetros } from "./protecaoVeiculoService";
import { enriquecerTrajetoComMalhaViaria } from "./trajetoInteligenteService";

export interface RotaMonitorada {
  id: string;
  veiculo_id: string;
  cliente_id: string | null;
  trajeto_salvo_id: string | null;
  nome: string;
  coordenadas_rota: [number, number][]; // [lat, lon]
  tolerancia_desvio_metros: number;
  status: "ativa" | "concluida" | "cancelada" | "em_desvio";
  desvio_detectado: boolean;
  ultima_distancia_desvio_m: number;
  iniciada_at: string;
  encerrada_at?: string | null;
}

/**
 * Normaliza coordenadas garantindo a ordem [lat, lon] ou [lon, lat] independente da origem.
 * No território brasileiro (especialmente RJ/SP/Sudeste):
 * - Latitude: entre -34 e +5 (típico RJ: ~-22.5)
 * - Longitude: entre -74 e -30 (típico RJ: ~-44.1)
 */
export function normalizarParCoordenadas(
  coord: [number, number],
  ordemDesejada: "lat_lon" | "lon_lat" = "lat_lon",
): [number, number] {
  if (!coord || coord.length < 2) return [0, 0];
  const c0 = Number(coord[0]);
  const c1 = Number(coord[1]);

  let lat: number;
  let lon: number;

  if (c0 < -30 && c1 > -30 && c1 < 10) {
    lon = c0;
    lat = c1;
  } else if (c1 < -30 && c0 > -30 && c0 < 10) {
    lat = c0;
    lon = c1;
  } else {
    lat = c0;
    lon = c1;
  }

  return ordemDesejada === "lat_lon" ? [lat, lon] : [lon, lat];
}

export function normalizarListaCoordenadas(
  coords: [number, number][],
  ordemDesejada: "lat_lon" | "lon_lat" = "lat_lon",
): [number, number][] {
  if (!Array.isArray(coords)) return [];
  return coords.map((c) => normalizarParCoordenadas(c, ordemDesejada));
}

/**
 * Calcula a distância mínima em metros entre um ponto P e um segmento de reta AB
 */
export function calcularDistanciaPontoSegmento(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  // Projeção métrica plana local para alta precisão em pequenos corredores
  const latMedia = ((aLat + bLat) / 2) * (Math.PI / 180);
  const mPorGrauLat = 111139;
  const mPorGrauLon = 111139 * Math.cos(latMedia);

  const px = (pLon - aLon) * mPorGrauLon;
  const py = (pLat - aLat) * mPorGrauLat;
  const bx = (bLon - aLon) * mPorGrauLon;
  const by = (bLat - aLat) * mPorGrauLat;

  const ab2 = bx * bx + by * by;
  if (ab2 === 0) {
    return Math.sqrt(px * px + py * py);
  }

  // Fator de projeção t normalizado [0, 1]
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / ab2));
  const projX = t * bx;
  const projY = t * by;

  const dx = px - projX;
  const dy = py - projY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calcula a menor distância entre o veículo e qualquer segmento da rota planejada
 */
export function calcularDistanciaMinimaDaRota(
  veiculoLat: number,
  veiculoLon: number,
  coordenadasRota: [number, number][],
): number {
  if (!coordenadasRota || coordenadasRota.length === 0) return 0;
  const coords = normalizarListaCoordenadas(coordenadasRota, "lat_lon");

  if (coords.length === 1) {
    return calcularDistanciaMetros(veiculoLat, veiculoLon, coords[0][0], coords[0][1]);
  }

  let menorDistancia = Infinity;

  for (let i = 0; i < coords.length - 1; i++) {
    const pA = coords[i];
    const pB = coords[i + 1];
    const d = calcularDistanciaPontoSegmento(veiculoLat, veiculoLon, pA[0], pA[1], pB[0], pB[1]);
    if (d < menorDistancia) {
      menorDistancia = d;
    }
  }

  return Math.round(menorDistancia);
}

/**
 * Calcula o ponto projetado no segmento AB mais próximo do ponto P
 */
export function calcularPontoProjetadoSegmento(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): { ponto: [number, number]; distancia: number } {
  const latMedia = ((aLat + bLat) / 2) * (Math.PI / 180);
  const mPorGrauLat = 111139;
  const mPorGrauLon = 111139 * Math.cos(latMedia);

  const px = (pLon - aLon) * mPorGrauLon;
  const py = (pLat - aLat) * mPorGrauLat;
  const bx = (bLon - aLon) * mPorGrauLon;
  const by = (bLat - aLat) * mPorGrauLat;

  const ab2 = bx * bx + by * by;
  if (ab2 === 0) {
    const d = Math.sqrt(px * px + py * py);
    return { ponto: [aLat, aLon], distancia: d };
  }

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / ab2));
  const projLat = aLat + t * (bLat - aLat);
  const projLon = aLon + t * (bLon - aLon);
  const dx = px - t * bx;
  const dy = py - t * by;
  const d = Math.sqrt(dx * dx + dy * dy);

  return { ponto: [projLat, projLon], distancia: d };
}

/**
 * Encontra o ponto exato da rota mais próximo da coordenada informada
 */
export function calcularPontoMaisProximoDaRota(
  veiculoLat: number,
  veiculoLon: number,
  coordenadasRota: [number, number][],
): { ponto: [number, number]; distancia: number } {
  if (!coordenadasRota || coordenadasRota.length === 0) {
    return { ponto: [veiculoLat, veiculoLon], distancia: 0 };
  }
  const coords = normalizarListaCoordenadas(coordenadasRota, "lat_lon");
  if (coords.length === 1) {
    const d = calcularDistanciaMetros(veiculoLat, veiculoLon, coords[0][0], coords[0][1]);
    return { ponto: coords[0], distancia: d };
  }

  let menorDistancia = Infinity;
  let melhorPonto: [number, number] = coords[0];

  for (let i = 0; i < coords.length - 1; i++) {
    const res = calcularPontoProjetadoSegmento(
      veiculoLat,
      veiculoLon,
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1],
    );
    if (res.distancia < menorDistancia) {
      menorDistancia = res.distancia;
      melhorPonto = res.ponto;
    }
  }

  return { ponto: melhorPonto, distancia: Math.round(menorDistancia) };
}

export type EstadoCromaticoRota = "normal" | "atencao" | "desvio_critico";

export interface AvaliacaoRotaDinamica {
  distanciaMetros: number;
  toleranciaMetros: number;
  estadoCromatico: EstadoCromaticoRota;
  pontoMaisProximo: [number, number];
  caminhoRetomada: [number, number][];
  emDesvio: boolean;
}

/**
 * Avalia a dinâmica da rota monitorada segundo o protocolo Hunter:
 * - Dentro da rota (<= 40m): normal (Azul Cintilante)
 * - Saindo da rota (> 40m e <= tolerância): atencao (Laranja)
 * - Além da tolerância (> tolerância): desvio_critico (Vermelho com caminho de retomada em Verde)
 */
export function avaliarEstadoRotaDinamica(
  veiculoLat: number,
  veiculoLon: number,
  rota: RotaMonitorada,
): AvaliacaoRotaDinamica {
  const { ponto, distancia } = calcularPontoMaisProximoDaRota(
    veiculoLat,
    veiculoLon,
    rota.coordenadas_rota,
  );

  const tolerancia = rota.tolerancia_desvio_metros || 100;
  const emDesvio = distancia > tolerancia;

  let estadoCromatico: EstadoCromaticoRota = "normal";
  if (distancia > tolerancia) {
    estadoCromatico = "desvio_critico";
  } else if (distancia > 40) {
    estadoCromatico = "atencao";
  }

  const caminhoRetomada: [number, number][] = [[veiculoLat, veiculoLon], ponto];

  return {
    distanciaMetros: distancia,
    toleranciaMetros: tolerancia,
    estadoCromatico,
    pontoMaisProximo: ponto,
    caminhoRetomada,
    emDesvio,
  };
}

/**
 * Avalia se o veículo está fora da rota monitorada com base na tolerância
 */
export function avaliarDesvioDeRota(
  veiculoLat: number,
  veiculoLon: number,
  rota: RotaMonitorada,
): { emDesvio: boolean; distanciaMetros: number } {
  const distancia = calcularDistanciaMinimaDaRota(veiculoLat, veiculoLon, rota.coordenadas_rota);

  const emDesvio = distancia > rota.tolerancia_desvio_metros;
  return { emDesvio, distanciaMetros: distancia };
}

/**
 * Carrega rota monitorada ativa para o veículo com autocura viária imediata
 * Se a rota salva contiver apenas waypoints secos em linha reta, refaz pelas ruas reais do OSRM.
 */
export async function carregarRotaMonitoradaAtiva(
  veiculoId: string,
): Promise<RotaMonitorada | null> {
  try {
    const { data, error } = await supabase
      .from("rotas_monitoradas")
      .select("*")
      .eq("veiculo_id", veiculoId)
      .in("status", ["ativa", "em_desvio"])
      .order("iniciada_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Regra Operacional SIGO Guardião:
    // Se a rota foi criada há mais de 24 horas e ainda está 'ativa' ou 'em_desvio', encerra automaticamente
    if (data?.iniciada_at) {
      const iniciadaEm = new Date(data.iniciada_at).getTime();
      if (Date.now() - iniciadaEm > 24 * 60 * 60 * 1000) {
        supabase
          .from("rotas_monitoradas")
          .update({
            status: "cancelada",
            encerrada_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id)
          .then(() => {});
        return null;
      }
    }

    let coords = (data.coordenadas_rota as any) || [];

    // Autocura Viária: Se a rota tiver poucos pontos (como os 5 pontos retos da imagem),
    // tenta enriquecer pelas ruas reais do OSRM
    if (Array.isArray(coords) && coords.length >= 2 && coords.length < 50) {
      try {
        const viarias = await enriquecerTrajetoComMalhaViaria(coords);
        if (viarias && viarias.length > coords.length) {
          coords = viarias;
          // Persiste a autocura viária em background no Supabase
          supabase
            .from("rotas_monitoradas")
            .update({
              coordenadas_rota: viarias,
              updated_at: new Date().toISOString(),
            })
            .eq("id", data.id)
            .then(() => {});
        }
      } catch {
        // Preserva coords se houver oscilação
      }
    }

    return {
      ...data,
      coordenadas_rota: coords,
    } as RotaMonitorada;
  } catch {
    return null;
  }
}

/**
 * Inicia uma nova rota monitorada para o veículo
 */
export async function iniciarRotaMonitorada(params: {
  veiculoId: string;
  clienteId?: string | null;
  nome: string;
  coordenadasRota: [number, number][];
  toleranciaMetros?: number;
  trajetoSalvoId?: string | null;
}): Promise<RotaMonitorada> {
  // 1. Garante cliente_id para atender a RLS da tabela rotas_monitoradas
  let clienteId = params.clienteId;
  if (!clienteId) {
    const { data: v } = await supabase
      .from("veiculos")
      .select("cliente_id")
      .eq("id", params.veiculoId)
      .maybeSingle();
    clienteId = v?.cliente_id || null;
  }

  // 2. Encerra qualquer rota ativa anterior para o veículo
  await supabase
    .from("rotas_monitoradas")
    .update({
      status: "cancelada",
      encerrada_at: new Date().toISOString(),
    })
    .eq("veiculo_id", params.veiculoId)
    .in("status", ["ativa", "em_desvio"]);

  // 3. Garante enriquecimento viário real para nunca salvar reta seca no banco
  let coordenadasFinais = params.coordenadasRota;
  if (coordenadasFinais && coordenadasFinais.length >= 2 && coordenadasFinais.length < 50) {
    try {
      const viarias = await enriquecerTrajetoComMalhaViaria(coordenadasFinais);
      if (viarias && viarias.length > coordenadasFinais.length) {
        coordenadasFinais = viarias;
      }
    } catch {
      // Mantém as coordenadas originais se houver falha
    }
  }

  // 4. Cria a nova rota monitorada
  const { data, error } = await supabase
    .from("rotas_monitoradas")
    .insert({
      veiculo_id: params.veiculoId,
      cliente_id: clienteId,
      trajeto_salvo_id: params.trajetoSalvoId || null,
      nome: params.nome,
      coordenadas_rota: coordenadasFinais as any,
      tolerancia_desvio_metros: params.toleranciaMetros || 250,
      status: "ativa",
      desvio_detectado: false,
      ultima_distancia_desvio_m: 0,
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao inserir rota monitorada:", error);
    throw new Error(error.message || "Falha ao gravar rota monitorada no banco");
  }

  return {
    ...data,
    coordenadas_rota: (data.coordenadas_rota as any) || [],
  } as RotaMonitorada;
}

/**
 * Atualiza status e distância de desvio da rota monitorada
 */
export async function atualizarStatusDesvioRota(
  rotaId: string,
  desvioDetectado: boolean,
  distanciaMetros: number,
): Promise<void> {
  try {
    await supabase
      .from("rotas_monitoradas")
      .update({
        status: desvioDetectado ? "em_desvio" : "ativa",
        desvio_detectado: desvioDetectado,
        ultima_distancia_desvio_m: distanciaMetros,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rotaId);
  } catch (err) {
    console.warn("Erro ao atualizar status de desvio da rota:", err);
  }
}

/**
 * Conclui ou cancela a rota monitorada
 */
export async function encerrarRotaMonitorada(
  rotaId: string,
  status: "concluida" | "cancelada" = "concluida",
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("rotas_monitoradas")
      .update({
        status,
        encerrada_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", rotaId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Lista todas as rotas monitoradas (ativas e histórico) para um veículo ou geral do cliente
 */
export async function listarRotasMonitoradas(veiculoId?: string): Promise<RotaMonitorada[]> {
  try {
    let query = supabase
      .from("rotas_monitoradas")
      .select("*")
      .order("iniciada_at", { ascending: false });

    if (veiculoId) {
      query = query.eq("veiculo_id", veiculoId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((item: any) => ({
      ...item,
      coordenadas_rota: Array.isArray(item.coordenadas_rota) ? item.coordenadas_rota : [],
    })) as RotaMonitorada[];
  } catch (err) {
    console.warn("Erro ao listar rotas monitoradas:", err);
    return [];
  }
}

/**
 * Exclui definitivamente uma rota monitorada do Banco de Dados
 */
export async function excluirRotaMonitorada(rotaId: string): Promise<boolean> {
  if (!rotaId) return false;
  try {
    const { error } = await supabase.from("rotas_monitoradas").delete().eq("id", rotaId);
    return !error;
  } catch (err) {
    console.error("Erro ao excluir rota monitorada:", err);
    return false;
  }
}

/**
 * Atualiza nome, tolerância ou malha viária de uma rota monitorada
 */
export async function atualizarRotaMonitorada(
  rotaId: string,
  dados: { nome?: string; toleranciaMetros?: number; coordenadasRota?: [number, number][] },
): Promise<boolean> {
  if (!rotaId) return false;
  try {
    const payload: any = {
      updated_at: new Date().toISOString(),
    };
    if (dados.nome !== undefined) payload.nome = dados.nome.trim();
    if (dados.toleranciaMetros !== undefined) {
      payload.tolerancia_desvio_metros = dados.toleranciaMetros;
    }
    if (dados.coordenadasRota !== undefined) {
      payload.coordenadas_rota = dados.coordenadasRota;
    }

    const { error } = await supabase.from("rotas_monitoradas").update(payload).eq("id", rotaId);
    return !error;
  } catch (err) {
    console.error("Erro ao atualizar rota monitorada:", err);
    return false;
  }
}
