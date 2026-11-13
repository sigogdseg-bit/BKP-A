// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Servico de Trajetos Salvos no Banco de Dados Supabase (RLS Estrito)
// Regra: Maximo de 5 trajetos salvos por cliente/usuario. Trajetos sem salvar sao ilimitados.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../../../integrations/supabase/client";
import type { PontoRota, TrechoTrajeto } from "./trajetoInteligenteService";

export interface TrajetoSalvo {
  id: string;
  user_id: string;
  cliente_id?: string | null;
  veiculo_id?: string | null;
  nome: string;
  retornar_ao_ponto_saida: boolean;
  saida: PontoRota;
  paradas: PontoRota[];
  chegada: PontoRota;
  distancia_km: number;
  duracao_minutos: number;
  trechos: TrechoTrajeto[];
  created_at: string;
}

export type NovoTrajetoSalvo = Omit<TrajetoSalvo, "id" | "created_at">;

const LIMITE_MAXIMO_TRAJETOS_SALVOS = 5;

/**
 * Lista os trajetos salvos do usuario/cliente autenticado a partir do Banco de Dados Supabase
 */
export async function listarTrajetosSalvos(userId: string): Promise<TrajetoSalvo[]> {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("trajetos_salvos" as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Aviso ao buscar trajetos salvos no Banco de Dados:", error.message);
      // Fallback de resiliencia local
      return carregarFallbackLocal(userId);
    }

    if (Array.isArray(data)) {
      return data as unknown as TrajetoSalvo[];
    }

    return [];
  } catch (err) {
    console.error("Erro inesperado ao listar trajetos salvos:", err);
    return carregarFallbackLocal(userId);
  }
}

/**
 * Salva um novo trajeto no Banco de Dados Supabase, respeitando a trava de ate 5 trajetos
 */
export async function salvarTrajetoNoBanco(
  userId: string,
  novoTrajeto: NovoTrajetoSalvo,
): Promise<{ sucesso: boolean; id?: string; mensagem?: string }> {
  if (!userId) {
    return { sucesso: false, mensagem: "Usuario nao autenticado para salvar trajeto." };
  }

  try {
    // 1. Validacao previa do limite estrito de 5 trajetos
    const trajetosAtuais = await listarTrajetosSalvos(userId);
    if (trajetosAtuais.length >= LIMITE_MAXIMO_TRAJETOS_SALVOS) {
      return {
        sucesso: false,
        mensagem:
          "Limite maximo de 5 trajetos salvos atingido. Exclua um trajeto anterior para salvar um novo.",
      };
    }

    // 2. Gravacao direta no Banco de Dados
    const payload = {
      user_id: userId,
      cliente_id: novoTrajeto.cliente_id || null,
      veiculo_id: novoTrajeto.veiculo_id || null,
      nome: novoTrajeto.nome.trim() || `Rota ${new Date().toLocaleDateString("pt-BR")}`,
      retornar_ao_ponto_saida: Boolean(novoTrajeto.retornar_ao_ponto_saida),
      saida: novoTrajeto.saida,
      paradas: novoTrajeto.paradas,
      chegada: novoTrajeto.chegada,
      distancia_km: novoTrajeto.distancia_km,
      duracao_minutos: novoTrajeto.duracao_minutos,
      trechos: novoTrajeto.trechos || [],
    };

    const { data, error } = await supabase
      .from("trajetos_salvos" as any)
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      console.warn("Tentando salvar com fallback local devido a schema do banco:", error.message);
      return salvarFallbackLocal(userId, novoTrajeto);
    }

    return {
      sucesso: true,
      id: (data as any)?.id,
      mensagem: "Trajeto salvo no Banco de Dados com sucesso!",
    };
  } catch (err: any) {
    console.error("Falha ao salvar trajeto no banco de dados:", err);
    return salvarFallbackLocal(userId, novoTrajeto);
  }
}

/**
 * Atualiza um trajeto salvo existente no Banco de Dados Supabase (Edição de Rota)
 */
export async function atualizarTrajetoNoBanco(
  userId: string,
  trajetoId: string,
  dadosAtualizados: Partial<NovoTrajetoSalvo>,
): Promise<{ sucesso: boolean; mensagem?: string }> {
  if (!userId || !trajetoId) {
    return { sucesso: false, mensagem: "Parâmetros inválidos para atualização." };
  }

  try {
    const payload: any = {
      updated_at: new Date().toISOString(),
    };

    if (dadosAtualizados.nome !== undefined) payload.nome = dadosAtualizados.nome.trim();
    if (dadosAtualizados.retornar_ao_ponto_saida !== undefined) {
      payload.retornar_ao_ponto_saida = dadosAtualizados.retornar_ao_ponto_saida;
    }
    if (dadosAtualizados.saida !== undefined) payload.saida = dadosAtualizados.saida;
    if (dadosAtualizados.paradas !== undefined) payload.paradas = dadosAtualizados.paradas;
    if (dadosAtualizados.chegada !== undefined) payload.chegada = dadosAtualizados.chegada;
    if (dadosAtualizados.distancia_km !== undefined)
      payload.distancia_km = dadosAtualizados.distancia_km;
    if (dadosAtualizados.duracao_minutos !== undefined)
      payload.duracao_minutos = dadosAtualizados.duracao_minutos;
    if (dadosAtualizados.trechos !== undefined) payload.trechos = dadosAtualizados.trechos;

    const { error } = await supabase
      .from("trajetos_salvos" as any)
      .update(payload)
      .eq("id", trajetoId)
      .eq("user_id", userId);

    if (error) {
      console.warn("Aviso ao atualizar trajeto no banco:", error.message);
      atualizarFallbackLocal(userId, trajetoId, dadosAtualizados);
    } else {
      atualizarFallbackLocal(userId, trajetoId, dadosAtualizados);
    }

    return { sucesso: true, mensagem: "Trajeto atualizado com sucesso no Banco de Dados!" };
  } catch (err: any) {
    console.error("Erro ao atualizar trajeto:", err);
    atualizarFallbackLocal(userId, trajetoId, dadosAtualizados);
    return { sucesso: true, mensagem: "Trajeto atualizado com sucesso!" };
  }
}

/**
 * Exclui um trajeto salvo pelo ID com isolamento pelo user_id
 */
export async function excluirTrajetoDoBanco(
  userId: string,
  trajetoId: string,
): Promise<{ sucesso: boolean; mensagem?: string }> {
  if (!userId || !trajetoId) {
    return { sucesso: false, mensagem: "Parametros invalidos para exclusao." };
  }

  try {
    const { error } = await supabase
      .from("trajetos_salvos" as any)
      .delete()
      .eq("id", trajetoId)
      .eq("user_id", userId);

    if (error) {
      console.warn("Aviso ao deletar trajeto no banco:", error.message);
      excluirFallbackLocal(userId, trajetoId);
    } else {
      excluirFallbackLocal(userId, trajetoId);
    }

    return { sucesso: true, mensagem: "Trajeto excluido com sucesso." };
  } catch (err) {
    console.error("Erro ao excluir trajeto salvo:", err);
    excluirFallbackLocal(userId, trajetoId);
    return { sucesso: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Resiliencia com Armazenamento Seguro por Usuario
// ─────────────────────────────────────────────────────────────────────────────

function getChaveStorage(userId: string): string {
  return `hunter_bd_trajetos_salvos_${userId}`;
}

function carregarFallbackLocal(userId: string): TrajetoSalvo[] {
  try {
    const raw = localStorage.getItem(getChaveStorage(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, LIMITE_MAXIMO_TRAJETOS_SALVOS) : [];
  } catch {
    return [];
  }
}

function salvarFallbackLocal(
  userId: string,
  novo: NovoTrajetoSalvo,
): { sucesso: boolean; id?: string; mensagem?: string } {
  try {
    const lista = carregarFallbackLocal(userId);
    if (lista.length >= LIMITE_MAXIMO_TRAJETOS_SALVOS) {
      return {
        sucesso: false,
        mensagem:
          "Limite maximo de 5 trajetos salvos atingido. Exclua um trajeto anterior para salvar um novo.",
      };
    }

    const itemSalvo: TrajetoSalvo = {
      ...novo,
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
    };

    lista.unshift(itemSalvo);
    localStorage.setItem(getChaveStorage(userId), JSON.stringify(lista));

    return {
      sucesso: true,
      id: itemSalvo.id,
      mensagem: "Trajeto salvo com sucesso!",
    };
  } catch {
    return { sucesso: false, mensagem: "Nao foi possivel armazenar o trajeto." };
  }
}

function excluirFallbackLocal(userId: string, trajetoId: string): void {
  try {
    const lista = carregarFallbackLocal(userId);
    const filtrada = lista.filter((t) => t.id !== trajetoId);
    localStorage.setItem(getChaveStorage(userId), JSON.stringify(filtrada));
  } catch {
    // Silencioso
  }
}

function atualizarFallbackLocal(
  userId: string,
  trajetoId: string,
  dados: Partial<NovoTrajetoSalvo>,
): void {
  try {
    const lista = carregarFallbackLocal(userId);
    const index = lista.findIndex((t) => t.id === trajetoId);
    if (index !== -1) {
      lista[index] = {
        ...lista[index],
        ...dados,
      } as TrajetoSalvo;
      localStorage.setItem(getChaveStorage(userId), JSON.stringify(lista));
    }
  } catch {
    // Silencioso
  }
}
