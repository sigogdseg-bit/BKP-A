import { supabase } from "@/integrations/supabase/client";
import type { CanalAlertaItemPreferencia, ContatoAlertaConta } from "../constants/alertasCatalogo";

export interface CanalItemConfig extends CanalAlertaItemPreferencia {
  ativo?: boolean;
  app: boolean;
  whatsapp: boolean;
  ligacao?: boolean;
  destinatarios?: string[];
  destinatarios_whatsapp?: string[];
  destinatarios_ligacao?: string[];
}

export interface CanaisAlertas {
  app: boolean;
  whatsapp: boolean;
  ligacao?: boolean;
  por_alerta?: Record<string, CanalItemConfig>;
}

export const CANAIS_ALERTAS_PADRAO: CanaisAlertas = {
  app: true,
  whatsapp: true,
  ligacao: false,
};

export interface ContatoAlertaWhatsapp extends ContatoAlertaConta {
  id: string;
  nome: string;
  telefone: string;
  tipo: "cliente" | "motorista" | "adicional";
  ativo: boolean;
  padrao?: boolean;
}

export interface PreferenciasNotificacao {
  movimento_fora_horario: boolean;
  ignicao_fora_horario: boolean;
  saida_area: boolean;
  entrada_area: boolean;
  excesso_velocidade: boolean;
  perda_comunicacao: boolean;
  baixa_tensao: boolean;
  bateria_desconectada: boolean; // Corte ou falta de alimentação da bateria principal
  desvio_rota: boolean;
  guincho: boolean; // Movimento com ignicao desligada
  suspeita_jammer: boolean;
  colisao_impacto: boolean;
  panico: boolean;
  violacao_dispositivo: boolean;
  capotamento_inclinacao: boolean;
  corte_nao_autorizado_sms: boolean;
  canais_alertas?: CanaisAlertas;
  canais_por_alerta?: Record<string, CanalItemConfig>;
  whatsapp_destinatarios?: ContatoAlertaWhatsapp[];
}

export const PREFERENCIAS_PADRAO: PreferenciasNotificacao = {
  movimento_fora_horario: true,
  ignicao_fora_horario: true,
  saida_area: true,
  entrada_area: false,
  excesso_velocidade: true,
  perda_comunicacao: true,
  baixa_tensao: true,
  bateria_desconectada: true,
  desvio_rota: true,
  guincho: true,
  suspeita_jammer: true,
  colisao_impacto: true,
  panico: true,
  violacao_dispositivo: true,
  capotamento_inclinacao: true,
  corte_nao_autorizado_sms: true,
  canais_alertas: CANAIS_ALERTAS_PADRAO,
  whatsapp_destinatarios: [],
};

export const CANAL_ALERTAS_CONFIG_REALTIME = "sigo_alertas_config_realtime";

/**
 * Carrega as preferências de notificações do veículo e usuário.
 * Prioriza estritamente as regras persistentes do veículo (regras_veiculo.alertas_ativos),
 * compartilhadas por todos os usuários e dispositivos com acesso ao veículo.
 */
export async function carregarPreferenciasNotificacao(
  userId?: string | null,
  veiculoId?: string | null,
): Promise<PreferenciasNotificacao> {
  // 1. Se veiculoId for fornecido, prioriza configuração persistente do veículo
  if (veiculoId) {
    try {
      const { data, error } = await supabase
        .from("regras_veiculo")
        .select("alertas_ativos, canais_alertas, whatsapp_destinatarios")
        .eq("veiculo_id", veiculoId)
        .maybeSingle();

      if (!error && data) {
        const ativos = (data.alertas_ativos as any) || {};
        const canais =
          (data.canais_alertas as any) || ativos.canais_alertas || CANAIS_ALERTAS_PADRAO;
        const porAlerta =
          (canais.por_alerta as any) || (ativos.canais_por_alerta as any) || undefined;
        const destinatarios =
          (data.whatsapp_destinatarios as any) || ativos.whatsapp_destinatarios || [];
        return {
          ...PREFERENCIAS_PADRAO,
          ...ativos,
          bateria_desconectada:
            ativos.bateria_desconectada !== undefined
              ? Boolean(ativos.bateria_desconectada)
              : ativos.baixa_tensao !== undefined
                ? Boolean(ativos.baixa_tensao)
                : true,
          canais_alertas: {
            app: canais.app !== undefined ? Boolean(canais.app) : true,
            whatsapp: canais.whatsapp !== undefined ? Boolean(canais.whatsapp) : true,
            ligacao: canais.ligacao !== undefined ? Boolean(canais.ligacao) : false,
            por_alerta: porAlerta,
          },
          canais_por_alerta: porAlerta,
          whatsapp_destinatarios: Array.isArray(destinatarios) ? destinatarios : [],
        };
      }
    } catch {
      // Fallback para próxima checagem
    }
  }

  // 2. Fallback para tabela de preferências globais da conta (somente registro veiculo_id IS NULL)
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("notificacoes_configuracoes")
        .select("alertas_ativos")
        .eq("user_id", userId)
        .is("veiculo_id", null)
        .maybeSingle();

      if (!error && data?.alertas_ativos) {
        const ativos = data.alertas_ativos as any;
        return {
          ...PREFERENCIAS_PADRAO,
          ...ativos,
          bateria_desconectada:
            ativos.bateria_desconectada !== undefined
              ? Boolean(ativos.bateria_desconectada)
              : ativos.baixa_tensao !== undefined
                ? Boolean(ativos.baixa_tensao)
                : true,
        };
      }
    } catch {
      return PREFERENCIAS_PADRAO;
    }
  }

  return PREFERENCIAS_PADRAO;
}

/**
 * Salva as preferências de notificações de forma persistente e unificada:
 * 1. Persiste no banco de dados na tabela regras_veiculo (para o veículo)
 * 2. Persiste na tabela notificacoes_configuracoes (para o usuário)
 * 3. Notifica instantaneamente todos os dispositivos via Supabase Realtime (Anti-Polling Total)
 */
export async function salvarPreferenciasNotificacao(
  userId: string,
  preferencias: PreferenciasNotificacao,
  veiculoId?: string | null,
): Promise<boolean> {
  let sucessoPersistencia = false;

  try {
    // 1. Persistência prioritária por veículo em regras_veiculo
    if (veiculoId) {
      const { data: existenteRegra } = await supabase
        .from("regras_veiculo")
        .select("id")
        .eq("veiculo_id", veiculoId)
        .maybeSingle();

      const payloadRegra: Record<string, any> = {
        alertas_ativos: preferencias as any,
        canais_alertas: preferencias.canais_alertas || CANAIS_ALERTAS_PADRAO,
        whatsapp_destinatarios: preferencias.whatsapp_destinatarios || [],
        updated_at: new Date().toISOString(),
      };

      if (existenteRegra?.id) {
        const { error: erroUpdate } = await supabase
          .from("regras_veiculo")
          .update(payloadRegra)
          .eq("id", existenteRegra.id);

        if (!erroUpdate) {
          sucessoPersistencia = true;
        } else {
          // Fallback defensivo para payload essencial caso ocorra erro transitório de schema cache
          const { error: erroFallback } = await supabase
            .from("regras_veiculo")
            .update({
              alertas_ativos: preferencias as any,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existenteRegra.id);
          if (!erroFallback) sucessoPersistencia = true;
        }
      } else {
        const { error: erroInsert } = await supabase.from("regras_veiculo").insert({
          veiculo_id: veiculoId,
          ...payloadRegra,
        });

        if (!erroInsert) {
          sucessoPersistencia = true;
        } else {
          const { error: erroFallback } = await supabase.from("regras_veiculo").insert({
            veiculo_id: veiculoId,
            alertas_ativos: preferencias as any,
          });
          if (!erroFallback) sucessoPersistencia = true;
        }
      }
    }

    // 2. Persistência de preferências globais por usuário em notificacoes_configuracoes (apenas quando não é regra de veículo específico)
    if (userId && !veiculoId) {
      const { data: existenteUser } = await supabase
        .from("notificacoes_configuracoes")
        .select("id, alertas_ativos")
        .eq("user_id", userId)
        .is("veiculo_id", null)
        .maybeSingle();

      const alertasMesclados = {
        ...((existenteUser?.alertas_ativos as Record<string, any>) || {}),
        ...(preferencias as any),
      };

      if (existenteUser?.id) {
        const { error: erroUserUpdate } = await supabase
          .from("notificacoes_configuracoes")
          .update({
            alertas_ativos: alertasMesclados,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existenteUser.id);

        if (!erroUserUpdate) sucessoPersistencia = true;
      } else {
        const { error: erroUserInsert } = await supabase.from("notificacoes_configuracoes").insert({
          user_id: userId,
          veiculo_id: null,
          alertas_ativos: alertasMesclados,
        });

        if (!erroUserInsert) sucessoPersistencia = true;
      }
    }

    // 3. Notificação Local Imediata (mesma aba/janela)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("hunter_configuracao_alertas_alterada", {
          detail: { veiculoId, preferencias, alteradoPor: userId, timestamp: Date.now() },
        }),
      );
    }

    // 4. Notificação Instantânea Inter-Dispositivos via Supabase Realtime Broadcast
    try {
      const canal = garantirCanalAlertasAtivo() || supabase.channel(CANAL_ALERTAS_CONFIG_REALTIME);
      canal.send({
        type: "broadcast",
        event: "alertas_atualizados",
        payload: {
          veiculoId,
          preferencias,
          alteradoPor: userId,
          timestamp: Date.now(),
        },
      });
    } catch {
      // Ignora erro no canal broadcast se desconectado
    }

    return sucessoPersistencia;
  } catch {
    return false;
  }
}

type CallbackNotificacao = (dados: {
  veiculoId?: string | null;
  preferencias: PreferenciasNotificacao;
  alteradoPor?: string;
}) => void;

const ouvintesPreferencias = new Set<CallbackNotificacao>();
let canalAlertasAtivo: ReturnType<typeof supabase.channel> | null = null;

function garantirCanalAlertasAtivo() {
  if (typeof window === "undefined" || !supabase) return null;
  if (canalAlertasAtivo) return canalAlertasAtivo;

  try {
    // Se porventura já existir canal com esse tópico no registry interno, remove antes
    const topic = `realtime:${CANAL_ALERTAS_CONFIG_REALTIME}`;
    const existente = supabase.getChannels().find((c) => c.topic === topic);
    if (existente) {
      try {
        supabase.removeChannel(existente);
      } catch {
        // Ignora
      }
    }

    const canal = supabase.channel(CANAL_ALERTAS_CONFIG_REALTIME, {
      config: { broadcast: { self: false } },
    });

    canal
      .on("broadcast", { event: "alertas_atualizados" }, (payload: any) => {
        if (payload?.payload) {
          ouvintesPreferencias.forEach((cb) => {
            try {
              cb(payload.payload);
            } catch (err) {
              console.warn("[notificacoesService] Erro no callback de broadcast:", err);
            }
          });
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "regras_veiculo" },
        (payload: any) => {
          const novo = payload.new as any;
          if (novo && novo.alertas_ativos) {
            const dados = {
              veiculoId: novo.veiculo_id,
              preferencias: { ...PREFERENCIAS_PADRAO, ...novo.alertas_ativos },
            };
            ouvintesPreferencias.forEach((cb) => {
              try {
                cb(dados);
              } catch (err) {
                console.warn("[notificacoesService] Erro no callback de postgres_changes:", err);
              }
            });
          }
        },
      )
      .subscribe();

    canalAlertasAtivo = canal;
    return canal;
  } catch (err) {
    console.warn("[notificacoesService] Falha ao inicializar canal Realtime:", err);
    return null;
  }
}

/**
 * Escuta atualizações de configurações de alertas em tempo real:
 * - Broadcasts inter-dispositivos
 * - Postgres changes da tabela regras_veiculo
 * - Eventos locais da janela
 */
export function ouvirAtualizacoesPreferenciasNotificacao(
  callback: CallbackNotificacao,
): () => void {
  // 1. Ouvinte de evento local da janela
  const handlerLocal = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail) {
      try {
        callback(custom.detail);
      } catch (err) {
        console.warn("[notificacoesService] Erro no callback local:", err);
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("hunter_configuracao_alertas_alterada", handlerLocal);
  }

  // 2. Registra o callback no conjunto de ouvintes do singleton Realtime
  ouvintesPreferencias.add(callback);
  garantirCanalAlertasAtivo();

  // Função de limpeza/desinscrição
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("hunter_configuracao_alertas_alterada", handlerLocal);
    }
    ouvintesPreferencias.delete(callback);

    // Se não houver mais ouvintes, fecha e limpa o canal
    if (ouvintesPreferencias.size === 0 && canalAlertasAtivo) {
      try {
        supabase.removeChannel(canalAlertasAtivo);
      } catch {
        // Ignora
      }
      canalAlertasAtivo = null;
    }
  };
}
