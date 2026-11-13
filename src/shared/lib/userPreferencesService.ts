import { supabase } from "@/integrations/supabase/client";
import {
  type CardThemeConfig,
  PRIMARY_STORAGE_KEY,
  readCardThemeConfig,
} from "@/shared/lib/card-theme";

export interface UserPreferences {
  icone_mapa_pin?: boolean;
  modo_placa_mapa?: "com_placa" | "sem_placa" | "auto";
  map_theme_preference?: string;
  card_theme_preference?: CardThemeConfig | null;
  theme_preference?: "light" | "dark";
}

/**
 * Aplica as preferências do usuário no armazenamento local e emite eventos de sincronização
 */
export function aplicarPreferenciasLocais(
  prefs: Partial<UserPreferences>,
  userId?: string | null,
): void {
  if (typeof window === "undefined") return;

  try {
    if (prefs.icone_mapa_pin !== undefined) {
      window.localStorage.setItem("@hunter_icone_mapa_generico", String(prefs.icone_mapa_pin));
    }

    if (prefs.modo_placa_mapa) {
      window.localStorage.setItem("@hunter_modo_placa_mapa", prefs.modo_placa_mapa);
    }

    if (prefs.map_theme_preference) {
      window.localStorage.setItem("hunter_map_theme", prefs.map_theme_preference);
    }

    if (prefs.card_theme_preference && typeof prefs.card_theme_preference === "object") {
      const json = JSON.stringify(prefs.card_theme_preference);
      window.localStorage.setItem(PRIMARY_STORAGE_KEY, json);
      if (userId) {
        window.localStorage.setItem(`hunter-card-theme:${userId}`, json);
      }
    }

    if (prefs.theme_preference) {
      window.localStorage.setItem("hunter-theme-preference", prefs.theme_preference);
      if (document?.documentElement) {
        if (prefs.theme_preference === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    }

    // Notifica emissores globais
    window.dispatchEvent(new CustomEvent("hunter_preferencia_mapa_alterada"));
    window.dispatchEvent(new CustomEvent("hunter-theme-sync", { detail: prefs.theme_preference }));
  } catch (err) {
    console.warn("Erro ao aplicar preferências locais:", err);
  }
}

/**
 * Salva as preferências de forma atômica no banco de dados e sincroniza localmente
 */
export async function salvarPreferenciaUsuario(
  novasPreferencias: Partial<UserPreferences>,
  userId?: string | null,
): Promise<boolean> {
  // 1. Aplicação imediata no cliente para resposta instantânea
  aplicarPreferenciasLocais(novasPreferencias, userId);

  // 2. Persistência direta no banco de dados das colunas existentes em profiles
  try {
    const payloadUpdate: Record<string, string> = {};
    if (novasPreferencias.map_theme_preference !== undefined) {
      payloadUpdate.map_theme_preference = novasPreferencias.map_theme_preference;
    }
    if (novasPreferencias.theme_preference !== undefined) {
      payloadUpdate.theme_preference = novasPreferencias.theme_preference;
    }

    let targetUid = userId;
    if (!targetUid) {
      const { data: authData } = await supabase.auth.getUser();
      targetUid = authData?.user?.id || null;
    }

    if (targetUid && Object.keys(payloadUpdate).length > 0) {
      const { error: updError } = await supabase
        .from("profiles")
        .update(payloadUpdate)
        .eq("id", targetUid);
      return !updError;
    }

    return true;
  } catch (err) {
    console.error("Erro ao salvar preferências no banco de dados:", err);
    return false;
  }
}

/**
 * Carrega as preferências armazenadas no banco para o usuário e sincroniza o dispositivo
 */
export async function carregarPreferenciasDoBanco(
  userId?: string | null,
): Promise<UserPreferences | null> {
  try {
    let targetUid = userId;
    if (!targetUid) {
      const { data: authData } = await supabase.auth.getUser();
      targetUid = authData?.user?.id || null;
    }
    if (!targetUid) return null;

    // Consulta direta às colunas que existem comprovadamente na tabela profiles
    const { data: profile, error: profError } = await supabase
      .from("profiles")
      .select("theme_preference, map_theme_preference")
      .eq("id", targetUid)
      .maybeSingle();

    if (!profError && profile) {
      const prefs: UserPreferences = {
        theme_preference: (profile as any).theme_preference || "light",
        map_theme_preference: (profile as any).map_theme_preference || "streets",
      };
      aplicarPreferenciasLocais(prefs, targetUid);
      return prefs;
    }

    return null;
  } catch (err) {
    console.error("Erro ao carregar preferências do usuário do banco:", err);
    return null;
  }
}
