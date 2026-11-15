// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Chat: Lista de Conversas Realizadas por um Usuário / Cliente
// Exclusivo para SuperADM e Administradores (Supervisão e Auditoria de Conversas)
// 100% Português-BR | Padrão Neumórfico Suave 3D | Avatares com Inicial do Usuário
// ─────────────────────────────────────────────────────────────────────────────

import { MessageCircle, ArrowLeft, Send, Clock, Eye } from "lucide-react";
import type { ConversaRealizada, ContatoOnline } from "../types";
import { obterInicialUsuario, obterGradienteAvatar } from "../utils/avatarUtils";

interface ListaConversasRealizadasProps {
  contato: ContatoOnline;
  conversas: ConversaRealizada[];
  carregando: boolean;
  onSelecionarConversa: (
    interlocutorId: string,
    interlocutorNome: string,
    interlocutorRole: string,
  ) => void;
  onIniciarConversaDireta: () => void;
  onVoltar: () => void;
}

function rotuloRole(role: string): string {
  switch (role?.toLowerCase()) {
    case "superadmin":
    case "adm":
      return "Administrador";
    case "operador":
      return "Operador";
    case "instalador":
      return "Instalador";
    case "cliente":
      return "Cliente";
    default:
      return role || "Usuário";
  }
}

function corRole(role: string): string {
  switch (role?.toLowerCase()) {
    case "superadmin":
    case "adm":
      return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
    case "operador":
      return "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/25";
    case "instalador":
      return "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25";
    default:
      return "text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/25";
  }
}

function formatarHoraData(isoDate: string): string {
  if (!isoDate) return "";
  try {
    const data = new Date(isoDate);
    const hoje = new Date();
    if (data.toDateString() === hoje.toDateString()) {
      return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ListaConversasRealizadas({
  contato,
  conversas,
  carregando,
  onSelecionarConversa,
  onIniciarConversaDireta,
  onVoltar,
}: ListaConversasRealizadasProps) {
  const online = contato.online !== false;
  const inicialContato = obterInicialUsuario(contato.nome);
  const gradienteContato = obterGradienteAvatar(contato.nome);

  return (
    <div className="relative flex flex-col h-full min-h-0 w-full bg-[#fbf2e9] dark:bg-slate-900 overflow-hidden">
      {/* Cabeçalho do Perfil Selecionado */}
      <div className="p-3.5 sm:p-4 border-b border-slate-300/60 dark:border-slate-800/70 bg-[#fbf2e9] dark:bg-slate-900 shrink-0 flex flex-col gap-2">
        {/* Linha 1: Atalho de Voltar (Acima dos dados) */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onVoltar}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition cursor-pointer md:hidden active:scale-95 group -ml-1 px-2 py-1 rounded-lg hover:bg-emerald-500/10"
            aria-label="Voltar para a lista de contatos"
            title="Voltar para contatos"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para contatos</span>
          </button>
        </div>

        {/* Linha 2: Avatar + Nome + Botão de Ação Direta */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div
                className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center text-white font-black text-sm bg-gradient-to-br ${gradienteContato} shadow-[0_4px_10px_rgba(0,0,0,0.12)] ring-2 ring-white/90 dark:ring-slate-800`}
              >
                {inicialContato}
              </div>
              {online ? (
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800 shadow-[0_0_8px_rgba(16,185,129,0.85)]" />
              ) : (
                <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-white dark:ring-slate-800" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {contato.nome}
                </h2>
                <span
                  className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${corRole(
                    contato.role,
                  )}`}
                >
                  {rotuloRole(contato.role)}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {contato.email || (online ? "Online Agora" : "Offline")}
              </p>
            </div>
          </div>

          {/* Botão de Ação Direta */}
          <button
            type="button"
            onClick={onIniciarConversaDireta}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-br from-[#007AFF] to-[#0056D2] text-white shadow-[0_6px_16px_rgba(0,122,255,0.42)] hover:shadow-[0_8px_20px_rgba(0,122,255,0.55)] transition cursor-pointer shrink-0 active:scale-95"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Conversar Diretamente</span>
            <span className="sm:hidden">Conversar</span>
          </button>
        </div>
      </div>

      {/* Conteúdo: Lista de Conversas Realizadas */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[#007AFF]" />
              Conversas Realizadas ({conversas.length})
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#fbf2e9] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700/60 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
              Supervisão de Diálogos
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Selecione uma das conversas realizadas abaixo para ler a íntegra das mensagens trocadas:
          </p>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center p-12">
            <div className="text-xs text-slate-500 dark:text-slate-400 animate-pulse font-medium">
              Carregando conversas realizadas...
            </div>
          </div>
        ) : conversas.length === 0 ? (
          <div className="p-8 text-center bg-[#fbf2e9] dark:bg-slate-800/80 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700/80">
            <MessageCircle className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
              Nenhuma conversa registrada
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-4 leading-relaxed">
              Este usuário ainda não possui histórico de conversas com operadores ou administradores
              no sistema.
            </p>
            <button
              type="button"
              onClick={onIniciarConversaDireta}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-br from-[#007AFF] to-[#0056D2] text-white shadow-[0_6px_16px_rgba(0,122,255,0.4)] transition cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              Iniciar Primeira Conversa com {contato.nome}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {conversas.map((c) => {
              const inicialInterlocutor = obterInicialUsuario(c.interlocutorNome);
              const gradienteInterlocutor = obterGradienteAvatar(c.interlocutorNome);

              return (
                <div
                  key={c.interlocutorId}
                  onClick={() =>
                    onSelecionarConversa(c.interlocutorId, c.interlocutorNome, c.interlocutorRole)
                  }
                  className="group p-3.5 bg-[#fbf2e9] dark:bg-slate-800 rounded-2xl shadow-[3px_3px_8px_#c3cfe2] dark:shadow-none hover:shadow-[5px_5px_14px_#b8c6da] border border-slate-300/60 dark:border-slate-700/80 transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 transform hover:scale-[1.005]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-black text-sm bg-gradient-to-br ${gradienteInterlocutor} shadow-[0_3px_8px_rgba(0,0,0,0.12)] ring-2 ring-white/90 dark:ring-slate-800 shrink-0`}
                    >
                      {inicialInterlocutor}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#007AFF] transition">
                          Conversa com {c.interlocutorNome}
                        </span>
                        <span
                          className={`inline-block px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider rounded border ${corRole(
                            c.interlocutorRole,
                          )}`}
                        >
                          {rotuloRole(c.interlocutorRole)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-md">
                        {c.ultimaMensagem ? `"${c.ultimaMensagem}"` : "Sem texto"}
                      </p>

                      <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatarHoraData(c.ultimaData)}
                        </span>
                        <span>•</span>
                        <span>
                          {c.totalMensagens} mensagem{c.totalMensagens !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-200/70 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 group-hover:bg-[#007AFF] group-hover:text-white transition cursor-pointer shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Ler Conversa</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
