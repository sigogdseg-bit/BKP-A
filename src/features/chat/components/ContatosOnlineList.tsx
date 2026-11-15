// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Chat Interativo: Lista de Contatos Neumórfica (Estilo Suave 3D)
// 100% Português-BR | Avatares com Inicial do Usuário | Filtros Neumórficos
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { MessageCircle, Search, Eye, EyeOff } from "lucide-react";
import type { ContatoOnline } from "../types";
import { obterInicialUsuario, obterGradienteAvatar } from "../utils/avatarUtils";

interface ContatosOnlineListProps {
  contatos: ContatoOnline[];
  contatoAtivo?: string | null;
  onSelecionarContato: (userId: string) => void;
  buscaTexto: string;
  onBuscaChange: (texto: string) => void;
  isCliente?: boolean;
  isAdmin?: boolean;
  visivelParaClientes?: boolean;
  onToggleVisibilidade?: (visivel: boolean) => void;
}

type AbaFiltro = "todas" | "nao_lidas" | "mencoes";

export function ContatosOnlineList({
  contatos,
  contatoAtivo,
  onSelecionarContato,
  buscaTexto,
  onBuscaChange,
  isCliente,
  isAdmin,
  visivelParaClientes = false,
  onToggleVisibilidade,
}: ContatosOnlineListProps) {
  const [abaAtiva, setAbaAtiva] = useState<AbaFiltro>("todas");

  // Contagem total de não lidas para o badge da aba
  const totalNaoLidas = contatos.reduce((acc, c) => acc + (c.naoLidas || 0), 0);

  // Filtragem combinada por busca e abas
  const contatosFiltrados = contatos.filter((c) => {
    const atendeBusca = c.nome.toLowerCase().includes(buscaTexto.toLowerCase());
    if (!atendeBusca) return false;

    if (abaAtiva === "nao_lidas") {
      return (c.naoLidas || 0) > 0;
    }
    if (abaAtiva === "mencoes") {
      // Exibe contatos com mensagens prioritárias ou não lidas em destaque
      return (c.naoLidas || 0) > 0 || c.role === "superadmin" || c.role === "adm";
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#fbf2e9] dark:bg-slate-900 select-none overflow-hidden">
      {/* Topo com Abas e Controle de Busca */}
      <div className="p-3 sm:p-4 space-y-3 shrink-0">
        {/* Abas Superiores Idênticas ao Padrão de Referência */}
        <div className="bg-[#fbf2e9] dark:bg-slate-800/80 p-1 rounded-full flex items-center justify-between border border-slate-300/50 dark:border-slate-700/50 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
          <button
            type="button"
            onClick={() => setAbaAtiva("todas")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all duration-200 cursor-pointer text-center ${
              abaAtiva === "todas"
                ? "bg-[#fbf2e9] dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Todas
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("nao_lidas")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all duration-200 cursor-pointer text-center ${
              abaAtiva === "nao_lidas"
                ? "bg-[#fbf2e9] dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Não lidas
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva("mencoes")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
              abaAtiva === "mencoes"
                ? "bg-[#fbf2e9] dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-[2px_2px_6px_rgba(0,0,0,0.4)]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <span>Menções</span>
            {totalNaoLidas > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF3B30] text-white text-[10px] font-black flex items-center justify-center shadow-[0_2px_6px_rgba(255,59,48,0.5)]">
                {totalNaoLidas > 99 ? "99+" : totalNaoLidas}
              </span>
            )}
          </button>
        </div>

        {/* Controle Exclusivo do ADM: Visibilidade no Chat */}
        {isAdmin && onToggleVisibilidade && (
          <div className="p-2.5 rounded-2xl bg-[#fbf2e9] dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-700/60 flex items-center justify-between gap-2 shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none">
            <div className="min-w-0 flex items-center gap-2">
              <div
                className={`p-1.5 rounded-xl shrink-0 ${
                  visivelParaClientes
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                }`}
              >
                {visivelParaClientes ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block truncate leading-tight">
                  Visibilidade para Clientes
                </span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 block truncate leading-tight mt-0.5">
                  {visivelParaClientes ? "Visível no chat" : "Invisível no chat"}
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={visivelParaClientes}
              onClick={() => onToggleVisibilidade(!visivelParaClientes)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                visivelParaClientes ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
              title="Alternar visibilidade para clientes"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  visivelParaClientes ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}

        {/* Campo de Busca Neumórfico Rebaixado */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar contato..."
            value={buscaTexto}
            onChange={(e) => onBuscaChange(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[#fbf2e9] dark:bg-slate-800/80 border border-slate-300/60 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] transition"
          />
        </div>
      </div>

      {/* Lista de Contatos Neumórficos */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-3 pb-3 space-y-1.5">
        {contatosFiltrados.length === 0 ? (
          <div className="p-6 text-center">
            <MessageCircle className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {contatos.length === 0
                ? isCliente
                  ? "Nenhum operador ou administrador disponível no momento."
                  : "Nenhum usuário cadastrado encontrado no sistema."
                : "Nenhum contato encontrado para este filtro."}
            </p>
          </div>
        ) : (
          contatosFiltrados.map((contato) => {
            const online = contato.online !== false;
            const isAtivo = contatoAtivo === contato.userId;
            const inicial = obterInicialUsuario(contato.nome);
            const gradiente = obterGradienteAvatar(contato.nome);

            return (
              <button
                key={contato.userId}
                type="button"
                onClick={() => onSelecionarContato(contato.userId)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all duration-200 cursor-pointer group ${
                  isAtivo
                    ? "bg-[#fbf2e9] dark:bg-slate-800/90 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700/80 transform scale-[1.01]"
                    : "hover:bg-slate-200/50 dark:hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                {/* Avatar Circular com Inicial do Usuário */}
                <div className="relative shrink-0">
                  <div
                    className={`h-11 w-11 rounded-full flex items-center justify-center text-white font-black text-sm bg-gradient-to-br ${gradiente} shadow-[0_4px_10px_rgba(0,0,0,0.12)] ring-2 ring-white/90 dark:ring-slate-800 transition-transform group-hover:scale-105`}
                  >
                    {inicial}
                  </div>

                  {/* Indicador de Status com Halo Suave */}
                  {online ? (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                  ) : (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-white dark:ring-slate-800" />
                  )}
                </div>

                {/* Nome do Contato */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                      {contato.nome}
                    </span>

                    {/* Badges de Contagem ou Alerta de Mensagem */}
                    {contato.naoLidas > 0 ? (
                      contato.naoLidas > 99 ? (
                        <span className="shrink-0 px-2 py-0.5 text-[10px] font-black rounded-full bg-[#FF3B30] text-white shadow-[0_4px_10px_rgba(255,59,48,0.45)]">
                          99+
                        </span>
                      ) : (
                        <span className="shrink-0 h-6 w-6 flex items-center justify-center text-xs font-black rounded-full bg-[#FF3B30] text-white shadow-[0_4px_10px_rgba(255,59,48,0.45)]">
                          {contato.naoLidas}
                        </span>
                      )
                    ) : (
                      // Ponto neutro sutil
                      <span className="shrink-0 h-2 w-2 rounded-full bg-slate-300/70 dark:bg-slate-700 opacity-60" />
                    )}
                  </div>

                  {/* Detalhe de Cargo ou Status */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 capitalize truncate">
                      {contato.role === "adm" || contato.role === "superadmin"
                        ? "Administrador"
                        : contato.role}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">•</span>
                    <span
                      className={`text-[10px] font-medium ${
                        online
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {online ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
