import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { MapTheme } from "../types";

interface MapThemeContextValue {
  theme: MapTheme;
  setTheme: (t: MapTheme) => void;
}

const MapThemeContext = createContext<MapThemeContextValue | undefined>(undefined);

export const MAP_THEME_STORAGE_KEY = "hunter-map-theme-preference";
export const MAP_THEME_DEFAULT: MapTheme = "streets";

function parseMapTheme(val: string | null | undefined): MapTheme | null {
  if (val === "streets" || val === "dark" || val === "satellite") {
    return val;
  }
  return null;
}

export function MapThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  const [theme, setThemeState] = useState<MapTheme>(() => {
    if (typeof window !== "undefined") {
      const stored = parseMapTheme(localStorage.getItem(MAP_THEME_STORAGE_KEY));
      if (stored) return stored;
    }
    return MAP_THEME_DEFAULT;
  });

  // Sincroniza preferência do perfil em nuvem quando a sessão carrega
  useEffect(() => {
    if (session?.mapThemePreference) {
      const perfilTheme = parseMapTheme(session.mapThemePreference);
      if (perfilTheme) {
        setThemeState((current) => {
          if (current !== perfilTheme) {
            if (typeof window !== "undefined") {
              localStorage.setItem(MAP_THEME_STORAGE_KEY, perfilTheme);
            }
            return perfilTheme;
          }
          return current;
        });
      }
    }
  }, [session?.mapThemePreference]);

  const setTheme = useCallback(
    (novoTema: MapTheme) => {
      setThemeState(novoTema);
      if (typeof window !== "undefined") {
        localStorage.setItem(MAP_THEME_STORAGE_KEY, novoTema);
      }

      // Sincroniza no perfil via RPC quando autenticado
      if (session?.userId) {
        (async () => {
          try {
            await (supabase.rpc as any)("salvar_preferencia_mapa", { p_mapa: novoTema });
          } catch {
            // Silencioso se offline ou sem permissão
          }
        })();
      }
    },
    [session?.userId],
  );

  return (
    <MapThemeContext.Provider value={{ theme, setTheme }}>{children}</MapThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMapTheme(): MapThemeContextValue {
  const ctx = useContext(MapThemeContext);
  if (!ctx) {
    throw new Error("useMapTheme deve ser utilizado dentro de um MapThemeProvider");
  }
  return ctx;
}
