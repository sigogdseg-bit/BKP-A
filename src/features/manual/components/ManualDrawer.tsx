import { useState, useEffect, useMemo } from "react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { Link } from "@tanstack/react-router";
import {
  X,
  BookOpen,
  Search,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { MANUAIS_MODULOS, type ModuloManual } from "../data/manualData";
import { APP_NOME, APP_VERSION_NUMERO } from "@/shared/lib/version";

interface ManualDrawerProps {
  aberto: boolean;
  onFechar: () => void;
}

export function ManualDrawer({ aberto, onFechar }: ManualDrawerProps) {
  const { session } = useAuth();
  const [busca, setBusca] = useState("");
  const [moduloIdAtivo, setModuloIdAtivo] = useState<string>("");

  // Filtra apenas os módulos que o perfil do usuário atual tem permissão para acessar
  // Regra: O Operador, Administrador e SuperADM acessam tudo sem restrição!
  const modulosPermitidos = useMemo(() => {
    return MANUAIS_MODULOS.filter((m) => m.podeAcessar(session));
  }, [session]);

  // Pré-seleciona automaticamente o módulo baseado na rota atual da tela onde o usuário está
  useEffect(() => {
    if (!aberto || modulosPermitidos.length === 0) return;

    if (typeof window !== "undefined") {
      const pathname = window.location.pathname;
      const moduloCorrespondente = modulosPermitidos.find((m) => {
        if (m.rota === pathname) return true;
        if (m.rota !== "/inicio" && pathname.startsWith(m.rota)) return true;
        return false;
      });

      if (moduloCorrespondente) {
        setModuloIdAtivo(moduloCorrespondente.id);
        return;
      }
    }

    if (!moduloIdAtivo || !modulosPermitidos.some((m) => m.id === moduloIdAtivo)) {
      setModuloIdAtivo(modulosPermitidos[0]?.id || "");
    }
  }, [aberto, modulosPermitidos, moduloIdAtivo]);

  // Tecla ESC para fechar e bloqueio do scroll do body
  useEffect(() => {
    if (!aberto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };

    document.addEventListener("keydown", handleKeyDown);
    const scrollOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = scrollOriginal;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const moduloAtivo = modulosPermitidos.find((m) => m.id === moduloIdAtivo) || modulosPermitidos[0];

  // Filtro de busca textual e permissão de acesso nos títulos, subtítulos, ações e detalhes do módulo ativo
  const termo = busca.trim().toLowerCase();
  const secoesFiltradas = moduloAtivo?.secoes
    .filter((secao) => !secao.podeAcessar || secao.podeAcessar(session))
    .filter((secao) => {
      if (!termo) return true;
      const matchTitulo = secao.titulo.toLowerCase().includes(termo);
      const matchSubtitulo = secao.subtitulo.toLowerCase().includes(termo);
      const matchPassos = secao.passos.some(
        (p) =>
          p.acao.toLowerCase().includes(termo) ||
          p.detalhe.toLowerCase().includes(termo) ||
          (p.dica && p.dica.toLowerCase().includes(termo)),
      );
      const matchDicas = secao.dicasSeguranca?.some((d) => d.toLowerCase().includes(termo));
      return matchTitulo || matchSubtitulo || matchPassos || matchDicas;
    });

  return (
    <ModalPortal>
      <div
        data-testid="manual-drawer-backdrop"
        className="fixed inset-0 z-[99999] flex justify-end bg-slate-950/85 backdrop-blur-md select-none transition-opacity animate-in fade-in duration-200"
        onClick={onFechar}
      >
        <div
          data-testid="manual-drawer-panel"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full sm:max-w-xl md:max-w-2xl h-full bg-[#f8fafc] dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
        >
          {/* Topo do Drawer */}
          <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                      Manual do Usuário
                    </h2>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                      v{APP_VERSION_NUMERO}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Instruções didáticas, passos operacionais e telas do {APP_NOME}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onFechar}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="Fechar Manual"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="mt-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar passo, tela, botão ou ação..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500 transition"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Limpar
                </button>
              )}
            </div>

            {/* Chips de Navegação Horizontal pelos Módulos Permitidos */}
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {modulosPermitidos.map((modulo) => {
                const ModuloIcone = modulo.icone;
                const ativo = modulo.id === moduloIdAtivo;
                return (
                  <button
                    key={modulo.id}
                    type="button"
                    onClick={() => {
                      setModuloIdAtivo(modulo.id);
                      setBusca("");
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
                      ativo
                        ? "bg-orange-600 text-white shadow-xs"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700/60"
                    }`}
                  >
                    <ModuloIcone className="h-3.5 w-3.5" />
                    <span>{modulo.titulo}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Corpo Rolável com os Tópicos do Módulo Ativo */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {moduloAtivo ? (
              <>
                {/* Resumo do Módulo */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 p-4 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        {moduloAtivo.tag}
                      </span>
                      <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">
                        {moduloAtivo.titulo}
                      </h3>
                    </div>

                    <Link
                      to={moduloAtivo.rota}
                      onClick={onFechar}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      <span>Ir para Tela</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {moduloAtivo.resumo}
                  </p>
                </div>

                {/* Seções e Passos Didáticos */}
                {secoesFiltradas && secoesFiltradas.length > 0 ? (
                  secoesFiltradas.map((secao) => (
                    <div
                      key={secao.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 p-4 sm:p-5 shadow-2xs space-y-4"
                    >
                      <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3">
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-orange-500 shrink-0" />
                          <span>{secao.titulo}</span>
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {secao.subtitulo}
                        </p>
                      </div>

                      {/* Lista de Passos Sequenciais */}
                      <div className="space-y-3">
                        {secao.passos.map((passo) => (
                          <div
                            key={passo.ordem}
                            className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-black shrink-0 border border-orange-500/20">
                              {passo.ordem}
                            </span>
                            <div className="space-y-1">
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {passo.acao}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                {passo.detalhe}
                              </p>
                              {passo.dica && (
                                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                                  <Lightbulb className="h-3 w-3 shrink-0" />
                                  <span>Dica: {passo.dica}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Dicas de Segurança Operacional */}
                      {secao.dicasSeguranca && secao.dicasSeguranca.length > 0 && (
                        <div className="p-3 rounded-xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 text-xs space-y-1.5 text-rose-700 dark:text-rose-300">
                          <div className="flex items-center gap-1.5 font-bold">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                            <span>Avisos de Segurança Operacional</span>
                          </div>
                          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                            {secao.dicasSeguranca.map((dica, idx) => (
                              <li key={idx}>{dica}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-slate-400">
                    <p className="text-xs font-medium">
                      Nenhum passo encontrado para o termo "{busca}".
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                Selecione um módulo no menu superior.
              </div>
            )}
          </div>

          {/* Rodapé Informativo */}
          <div className="shrink-0 p-3.5 px-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-orange-500" />
              <span>GD Rastreamento · Sistema de Rastreamento</span>
            </div>
            <button
              type="button"
              onClick={onFechar}
              className="font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
