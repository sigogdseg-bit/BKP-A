import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Laptop, ChevronDown } from "lucide-react";
import { useTheme, type Theme } from "../context/ThemeContext";

interface ThemeToggleProps {
  compacto?: boolean;
}

export function ThemeToggle({ compacto = false }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    if (aberto) {
      document.addEventListener("mousedown", handleClickFora);
      return () => document.removeEventListener("mousedown", handleClickFora);
    }
  }, [aberto]);

  const opcoes: { valor: Theme; label: string; icone: typeof Sun }[] = [
    { valor: "dark", label: "Escuro (Tático)", icone: Moon },
    { valor: "light", label: "Claro (Corporativo)", icone: Sun },
    { valor: "system", label: "Automático (Sistema)", icone: Laptop },
  ];

  const IconeAtual = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-label="Alternar tema visual"
        title="Alternar tema visual"
        className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 min-h-[40px] min-w-[40px] rounded-xl border transition-all duration-200 text-xs font-semibold cursor-pointer active:scale-95 ${
          resolvedTheme === "dark"
            ? "bg-slate-900/80 hover:bg-slate-800 text-slate-200 border-slate-700/80 hover:border-slate-600"
            : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300 shadow-sm"
        }`}
      >
        <IconeAtual className="h-4 w-4 text-orange-500 transition-transform duration-200" />
        {!compacto && (
          <>
            <span className="hidden sm:inline">
              {theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Sistema"}
            </span>
            <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
          </>
        )}
      </button>

      {aberto && (
        <div
          className={`absolute right-0 mt-1.5 w-48 rounded-2xl border p-1.5 shadow-2xl z-[9999] transition-all duration-150 animate-in fade-in zoom-in-95 ${
            resolvedTheme === "dark"
              ? "bg-slate-900 border-slate-800 text-slate-200 shadow-black/90"
              : "bg-white border-slate-200 text-slate-800 shadow-slate-400/50"
          }`}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 mb-1">
            Modo Visual
          </div>
          {opcoes.map((op) => {
            const Icone = op.icone;
            const selecionado = theme === op.valor;
            return (
              <button
                key={op.valor}
                type="button"
                onClick={() => {
                  setTheme(op.valor);
                  setAberto(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  selecionado
                    ? "bg-orange-500/15 text-orange-500 font-bold"
                    : resolvedTheme === "dark"
                      ? "hover:bg-slate-800 text-slate-300 hover:text-slate-100"
                      : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icone className="h-3.5 w-3.5" />
                  <span>{op.label}</span>
                </div>
                {selecionado && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
