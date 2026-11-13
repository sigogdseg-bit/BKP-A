import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import "@/shared/lib/toastInterceptor";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import { ThemeProvider, useTheme } from "@/features/theme/context/ThemeContext";
import { MapThemeProvider } from "@/features/monitor-gps/context/MapThemeContext";
import appCss from "../styles.css?url";
import { APP_NOME, APP_SLOGAN } from "@/shared/lib/version";
import { registrarServiceWorker, garantirInscricaoPushAtiva } from "@/shared/lib/webPushService";

const queryClient = new QueryClient();

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: `${APP_NOME} — ${APP_SLOGAN}` },
      { name: "description", content: APP_SLOGAN },
      {
        name: "theme-color",
        content: "#eaf0f8",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#0c121c",
        media: "(prefers-color-scheme: dark)",
      },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: APP_NOME },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", href: "/logo.png" },
    ],
    scripts: [
      {
        children: `(function(){try{var t=localStorage.getItem('hunter-theme-preference');var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var isDark=t==='dark'||(t==='system'&&prefersDark);var root=document.documentElement;if(isDark){root.classList.add('dark');root.classList.remove('light');root.style.colorScheme='dark';}else{root.classList.add('light');root.classList.remove('dark');root.style.colorScheme='light';}}catch(e){}})();`,
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: RootErrorComponent,
});

function AppContent() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    // 1. Registra o Service Worker (necessário para push em background)
    registrarServiceWorker().catch(() => {});

    // 2. Se permissão push já foi concedida anteriormente, renova a inscrição
    //    silenciosamente — garante que o dispositivo continua no banco de dados
    //    e recebe alertas mesmo com o app fechado ou em segundo plano.
    garantirInscricaoPushAtiva().catch(() => {});
  }, []);

  return (
    <>
      <Outlet />
      <Toaster position="top-right" richColors theme={resolvedTheme} />
    </>
  );
}

function RootComponent() {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-300 transition-colors duration-200"
      >
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <MapThemeProvider>
                <AppContent />
              </MapThemeProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none transition-colors">
      <div className="text-center max-w-md space-y-4 p-8 bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl">
        <div className="text-6xl font-black font-mono text-emerald-600 dark:text-emerald-400">
          404
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Página não encontrada
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          O recurso que você tentou acessar não existe ou está restrito ao seu nível de permissão.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition"
        >
          Voltar para Início
        </Link>
      </div>
    </div>
  );
}

function RootErrorComponent({ error, reset }: { error: any; reset: () => void }) {
  console.error("[RootErrorComponent] Erro inesperado capturado:", error);

  const isChunkError =
    typeof window !== "undefined" &&
    (/Failed to fetch dynamically imported module/i.test(error?.message || "") ||
      /Importing a module script failed/i.test(error?.message || "") ||
      /error loading dynamically imported module/i.test(error?.message || ""));

  useEffect(() => {
    if (isChunkError && typeof window !== "undefined") {
      const lastReload = sessionStorage.getItem("hunter_chunk_reload_ts");
      const now = Date.now();
      // Previne loop infinito: se recarregou ha menos de 10s, nao forca outro reload automatico
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem("hunter_chunk_reload_ts", String(now));
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#eaf0f8] dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none transition-colors">
      <div className="text-center max-w-md space-y-4 p-8 bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Instabilidade de Carregamento
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {isChunkError
            ? "Uma nova versão do sistema foi disponibilizada. Clique abaixo para atualizar o aplicativo."
            : "Ocorreu um erro inesperado ao renderizar esta tela. Você pode recarregar ou retornar ao início."}
        </p>
        {!isChunkError && error?.message && (
          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 font-mono text-[11px] text-slate-600 dark:text-slate-300 break-all text-left">
            {error.message}
          </div>
        )}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Recarregar Sistema</span>
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            Ir para Início
          </Link>
        </div>
      </div>
    </div>
  );
}
