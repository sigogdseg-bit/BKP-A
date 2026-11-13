import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";

export function DlpWatermark() {
  const { session } = useAuth();
  const [perdeuFoco, setPerdeuFoco] = useState(false);
  const [dataHora, setDataHora] = useState("");

  useEffect(() => {
    setDataHora(new Date().toLocaleString("pt-BR"));
    const timer = setInterval(() => {
      setDataHora(new Date().toLocaleString("pt-BR"));
    }, 60000);

    // Em dispositivos móveis ou com tela de toque, o evento window.blur é disparado
    // frequentemente por interações nativas do sistema operacional (rolagem rápida,
    // retração da barra de navegação do Safari/Chrome, abertura de teclados virtuais).
    // Para evitar falsos positivos no celular, ativamos o bloqueio de foco apenas se
    // document.hidden for verdadeiro (troca de aba/minimização), ou em desktop para blur.
    const isMobileOuTouch = () => {
      if (typeof window === "undefined") return false;
      return window.innerWidth < 1024 || "ontouchstart" in window || navigator.maxTouchPoints > 0;
    };

    const onBlur = () => {
      if (!isMobileOuTouch()) {
        setPerdeuFoco(true);
      }
    };
    const onFocus = () => setPerdeuFoco(false);
    const onVisibilityChange = () => {
      if (document.hidden) setPerdeuFoco(true);
      else setPerdeuFoco(false);
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!session) return null;

  return (
    <>
      {/* 2. Ofuscamento (DLP Blur) ao perder foco da janela */}
      {perdeuFoco && (
        <div
          onClick={() => setPerdeuFoco(false)}
          onTouchStart={() => setPerdeuFoco(false)}
          className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-slate-950/80 select-none transition-all duration-200 cursor-pointer"
        >
          <div className="rounded-3xl border border-slate-300/80 dark:border-slate-800 bg-[#f0f4f9] dark:bg-slate-900 p-6 text-center shadow-[10px_10px_28px_#c3cfe2] dark:shadow-2xl max-w-sm mx-4">
            <div className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              {APP_NOME} — Proteção de Tela Ativa
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Toque ou clique na tela para restaurar a visualização confidencial.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
