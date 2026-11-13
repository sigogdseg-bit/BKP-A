import { supabase } from "@/integrations/supabase/client";
import { sanitizarMensagemErro } from "@/shared/utils/erroAmigavel";

export interface DestinatarioRelatorio {
  nome: string;
  telefone: string;
  padrao?: boolean;
}

export interface SecoesRelatorio {
  frota: boolean;
  alertas: boolean;
  financeiro: boolean;
  infraestrutura: boolean;
  chips: boolean;
  gateways: boolean;
  dre: boolean;
}

export interface RelatorioGerencialConfig {
  id?: string;
  ativo: boolean;
  horario_envio: string; // ex: "10:00"
  enviar_whatsapp: boolean;
  enviar_push: boolean;
  copia_whatsapp_parceiros?: boolean;
  telefones: DestinatarioRelatorio[];
  secoes_ativas: SecoesRelatorio;
  ultimo_envio_em?: string | null;
  ultimo_status?: string | null;
}

export const CONFIG_PADRAO_RELATORIO: RelatorioGerencialConfig = {
  ativo: true,
  horario_envio: "10:00",
  enviar_whatsapp: true,
  enviar_push: true,
  copia_whatsapp_parceiros: true,
  telefones: [
    {
      nome: "SuperADM",
      telefone: "5524992494030",
      padrao: true,
    },
  ],
  secoes_ativas: {
    frota: true,
    alertas: true,
    financeiro: true,
    infraestrutura: true,
    chips: true,
    gateways: true,
    dre: true,
  },
  ultimo_envio_em: null,
  ultimo_status: null,
};

const STORAGE_KEY = "@hunter_relatorio_gerencial_config";

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
    }
  } catch {
    /* fallback se getSession falhar */
  }
  return {
    "Content-Type": "application/json",
  };
}

export const relatorioGerencialConfigService = {
  async carregar(): Promise<RelatorioGerencialConfig> {
    // 1. Tenta carregar via API canônica do backend
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/relatorios/gerencial/config", {
        method: "GET",
        headers,
      });

      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.sucesso && json?.config) {
          const cfg = json.config;
          const merged: RelatorioGerencialConfig = {
            id: cfg.id,
            ativo: cfg.ativo ?? true,
            horario_envio: cfg.horario_envio || "10:00",
            enviar_whatsapp: cfg.enviar_whatsapp ?? true,
            enviar_push: cfg.enviar_push ?? true,
            copia_whatsapp_parceiros: cfg.copia_whatsapp_parceiros ?? true,
            telefones:
              Array.isArray(cfg.telefones) && cfg.telefones.length > 0
                ? cfg.telefones
                : [...CONFIG_PADRAO_RELATORIO.telefones],
            secoes_ativas: {
              ...CONFIG_PADRAO_RELATORIO.secoes_ativas,
              ...(cfg.secoes_ativas || {}),
            },
            ultimo_envio_em: cfg.ultimo_envio_em,
            ultimo_status: cfg.ultimo_status,
          };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          } catch {
            /* ignore */
          }
          return merged;
        }
      }
    } catch {
      /* segue para fallback */
    }

    // 2. Fallback: Consulta direta via Supabase client
    try {
      const { data, error } = await supabase
        .from("relatorio_gerencial_config")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        const merged: RelatorioGerencialConfig = {
          id: data.id,
          ativo: data.ativo ?? true,
          horario_envio: data.horario_envio || "10:00",
          enviar_whatsapp: data.enviar_whatsapp ?? true,
          enviar_push: data.enviar_push ?? true,
          copia_whatsapp_parceiros: data.copia_whatsapp_parceiros ?? true,
          telefones:
            Array.isArray(data.telefones) && data.telefones.length > 0
              ? data.telefones
              : [...CONFIG_PADRAO_RELATORIO.telefones],
          secoes_ativas: {
            ...CONFIG_PADRAO_RELATORIO.secoes_ativas,
            ...(data.secoes_ativas || {}),
          },
          ultimo_envio_em: data.ultimo_envio_em,
          ultimo_status: data.ultimo_status,
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {
          /* ignore */
        }
        return merged;
      }
    } catch {
      /* segue para fallback local */
    }

    // 3. Fallback: Cache local no LocalStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...CONFIG_PADRAO_RELATORIO,
          ...parsed,
          secoes_ativas: {
            ...CONFIG_PADRAO_RELATORIO.secoes_ativas,
            ...(parsed.secoes_ativas || {}),
          },
        };
      }
    } catch {
      /* ignore */
    }

    return { ...CONFIG_PADRAO_RELATORIO };
  },

  async salvar(config: RelatorioGerencialConfig): Promise<{ sucesso: boolean; mensagem?: string }> {
    // 1. Salva no cache local imediatamente
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* ignore */
    }

    // 2. Tenta salvar prioritariamente via API do backend (service role, contorna RLS e schema cache)
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/relatorios/gerencial/config", {
        method: "POST",
        headers,
        body: JSON.stringify(config),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.sucesso) {
        if (json?.config?.id) {
          config.id = json.config.id;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
          } catch {
            /* ignore */
          }
        }
        return { sucesso: true };
      }

      if (!res.ok && json?.erro) {
        // Se a API retornou erro específico, tenta o fallback pelo Supabase direto antes de desistir
        console.warn("API gerencial retornou erro, tentando fallback Supabase:", json.erro);
      }
    } catch (apiErr) {
      console.warn("Falha de rede na API gerencial, tentando fallback Supabase:", apiErr);
    }

    // 3. Fallback: Salva diretamente no Supabase client
    try {
      const payload = {
        ativo: config.ativo,
        horario_envio: config.horario_envio,
        enviar_whatsapp: config.enviar_whatsapp,
        enviar_push: config.enviar_push,
        copia_whatsapp_parceiros: config.copia_whatsapp_parceiros ?? true,
        telefones: config.telefones,
        secoes_ativas: config.secoes_ativas,
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        const { error } = await supabase
          .from("relatorio_gerencial_config")
          .update(payload)
          .eq("id", config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("relatorio_gerencial_config")
          .insert([payload])
          .select("id")
          .single();

        if (error) throw error;
        if (data?.id) config.id = data.id;
      }

      return { sucesso: true };
    } catch (err: unknown) {
      const dbError = err as { message?: string; details?: string; hint?: string } | null;
      const msgCrua =
        err instanceof Error
          ? err.message
          : dbError?.message || dbError?.details || "Erro ao persistir configurações no servidor.";

      return { sucesso: false, mensagem: sanitizarMensagemErro(msgCrua) };
    }
  },

  async dispararAgora(): Promise<{ sucesso: boolean; mensagem: string }> {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/relatorios/metricas-diarias/enviar", {
        method: "POST",
        headers,
        body: JSON.stringify({ manual: true }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        let msgErro = `Falha no envio HTTP ${response.status}`;
        if (typeof json?.erro === "string" && json.erro) {
          msgErro = json.erro;
        } else if (typeof json?.mensagem === "string" && json.mensagem) {
          msgErro = json.mensagem;
        } else if (typeof json?.message === "string" && json.message) {
          msgErro = json.message;
        } else if (typeof json?.error === "string" && json.error) {
          msgErro = json.error;
        }
        return {
          sucesso: false,
          mensagem: msgErro,
        };
      }

      return {
        sucesso: true,
        mensagem: "Relatório gerencial despachado com sucesso!",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha na requisição de disparo.";
      return { sucesso: false, mensagem: msg };
    }
  },
};
