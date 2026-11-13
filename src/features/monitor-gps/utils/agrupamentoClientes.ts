import type { VeiculoGps } from "../types";
import { podeAcessarLocalizacaoVeiculo } from "./privacidadeLocalizacao";
import type { UserSession } from "@/features/auth/types";

export interface ClienteAgrupado {
  id: string;
  nome: string;
  plano?: string;
  veiculos: VeiculoGps[];
  totalEmRota: number;
  totalParados: number;
  totalEstacionados: number;
  totalBloqueados: number;
  temAlerta: boolean;
}

/**
 * Agrupa veículos monitorados por seus respectivos clientes.
 * Permite que usuários e administradores visualizem a frota organizada por cliente e seus veículos.
 * Regra Hunter: Veículos com privacidade ativa que o usuário não pode ver a localização
 * não têm sua situação (em rota, parado, estacionado) exposta nas contagens operacionais.
 */
export function agruparVeiculosPorCliente(
  veiculos: VeiculoGps[],
  session?: UserSession | null,
): ClienteAgrupado[] {
  const mapa = new Map<string, ClienteAgrupado>();

  veiculos.forEach((v) => {
    const chave = v.cliente_id || v.cliente_nome || "sem_cliente";
    const nomeCliente = v.cliente_nome || "Cliente sem Identificacao";
    const podeVerSituacao = podeAcessarLocalizacaoVeiculo(session, v);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        id: chave,
        nome: nomeCliente,
        plano: v.cliente_plano,
        veiculos: [],
        totalEmRota: 0,
        totalParados: 0,
        totalEstacionados: 0,
        totalBloqueados: 0,
        temAlerta: false,
      });
    }

    const grupo = mapa.get(chave)!;
    grupo.veiculos.push(v);

    if (podeVerSituacao) {
      if (v.status_operacional === "em_rota" && !v.bloqueado) {
        grupo.totalEmRota++;
      } else if (v.status_operacional === "parado_ligado") {
        grupo.totalParados++;
      } else if (v.status_operacional === "estacionado") {
        grupo.totalEstacionados++;
      }

      if (v.bloqueado) {
        grupo.totalBloqueados++;
      }

      if (v.alerta_acidente) {
        grupo.temAlerta = true;
      }
    }
  });

  // Ordena os clientes por nome em ordem alfabetica crescente
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Determina se a listagem deve ser agrupada por cliente com base no perfil do usuario autenticado.
 * Regra: Contas de usuarios (SuperADM, Admin, Operador) agrupam por cliente; Instalador e Clientes nao.
 */
export function deveAgruparPorCliente(
  session?: {
    isCliente?: boolean;
    isInstalador?: boolean;
    isMotorista?: boolean;
    role?: string;
    isSuperAdmin?: boolean;
    isAdmin?: boolean;
    isOperador?: boolean;
  } | null,
): boolean {
  if (!session) return false;
  // Exceto instalador, cliente e motorista (contas que acessam um único cliente)
  if (session.isInstalador) return false;
  if (session.isCliente) return false;
  if (session.isMotorista || session.role === "motorista") return false;
  return true;
}
