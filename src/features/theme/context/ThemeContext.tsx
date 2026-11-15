import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const THEME_STORAGE_KEY = "hunter-theme-preference";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
      if (stored === "dark" || stored === "light" || stored === "system") {
        return stored;
      }
    }
    return "light"; // Padrão canônico do sistema: Claro (light) para novo usuário
  });

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
      if (stored === "light") return "light";
      if (stored === "dark") return "dark";
      if (stored === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    }
    return "light";
  });

  const applyThemeToDOM = useCallback((targetTheme: Theme) => {
    if (typeof window === "undefined") return "light" as const;

    const root = document.documentElement;
    let effective: "dark" | "light" = "light";

    if (targetTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      effective = prefersDark ? "dark" : "light";
    } else {
      effective = targetTheme;
    }

    setResolvedTheme(effective);

    if (effective === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.style.colorScheme = "dark";
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }

    try {
      const corTemaHeader = effective === "dark" ? "#0a0a0c" : "#eaf0f8";
      const metas = document.querySelectorAll('meta[name="theme-color"]');
      metas.forEach((m) => m.setAttribute("content", corTemaHeader));
    } catch {
      // Falha silenciosa caso o DOM de metas esteja inacessível
    }

    return effective;
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      if (typeof window !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, t);
        applyThemeToDOM(t);

        // Persistência em camada tripla (RPC + Direct Update em profiles)
        supabase
          .rpc("salvar_preferencia_tema", { p_tema: t })
          .then(() => {
            // Sincronizado com sucesso via RPC
          })
          .catch(async () => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (user) {
                await supabase
                  .from("profiles")
                  .update({ theme_preference: t, updated_at: new Date().toISOString() })
                  .eq("id", user.id);
              }
            } catch (err) {
              console.warn("Fallback persistência tema:", err);
            }
          });
      }
    },
    [applyThemeToDOM],
  );

  // Listener para sincronização remota do tema vindo de authService ou realtime
  useEffect(() => {
    const handleSync = (e: CustomEvent<Theme>) => {
      const remoteTheme = e.detail;
      if (
        remoteTheme &&
        (remoteTheme === "dark" || remoteTheme === "light" || remoteTheme === "system")
      ) {
        setThemeState(remoteTheme);
        if (typeof window !== "undefined") {
          localStorage.setItem(THEME_STORAGE_KEY, remoteTheme);
          applyThemeToDOM(remoteTheme);
        }
      }
    };

    window.addEventListener("hunter-theme-sync" as any, handleSync);
    return () => window.removeEventListener("hunter-theme-sync" as any, handleSync);
  }, [applyThemeToDOM]);

  useEffect(() => {
    applyThemeToDOM(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyThemeToDOM("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme, applyThemeToDOM]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme deve ser utilizado dentro de um ThemeProvider");
  }
  return ctx;
}
