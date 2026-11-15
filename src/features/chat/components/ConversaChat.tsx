// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Chat Interativo: Conversa no Padrão Neumórfico Suave 3D
// 100% Português-BR | Bolha Azul Vibrante (Enviada) e Cartão Neumórfico (Recebida)
// Avatares com Inicial do Usuário | Header com Hora e Nome idênticos ao Modelo
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useEffect, useState, useCallback } from "react";
import { Send, ArrowLeft, Check, CheckCheck, BellRing } from "lucide-react";
import type { ChatMensagem } from "../types";
import { obterInicialUsuario, obterGradienteAvatar } from "../utils/avatarUtils";

interface ConversaChatProps {
  mensagens: ChatMensagem[];
  userId: string;
  contatoNome: string;
  contatoRole: string;
  contatoOnline?: boolean;
  onEnviar: (mensagem: string) => void;
  onVoltar: () => void;
  carregando: boolean;
  modoSupervisao?: boolean;
  supervisaoInfo?: {
    usuarioANome: string;
    usuarioARole?: string;
    usuarioBNome: string;
    usuarioBRole?: string;
  };
  onVoltarParaListaConversas?: () => void;
  permissaoPush?: NotificationPermission;
  onAtivarNotificacoes?: () => void;
  ativandoPush?: boolean;
  isAdmin?: boolean;
  visivelParaClientes?: boolean;
  onAtivarVisibilidadeAdm?: () => void;
}

function formatarHora(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatarData(isoDate: string): string {
  try {
    const data = new Date(isoDate);
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    if (data.toDateString() === hoje.toDateString()) return "Hoje";
    if (data.toDateString() === ontem.toDateString()) return "Ontem";

    return data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function ConversaChat({
  mensagens,
  userId,
  contatoNome,
  contatoRole: _contatoRole,
  contatoOnline = true,
  onEnviar,
  onVoltar,
  carregando,
  modoSupervisao = false,
  supervisaoInfo,
  onVoltarParaListaConversas,
  permissaoPush,
  onAtivarNotificacoes,
  ativandoPush = false,
  isAdmin = false,
  visivelParaClientes = true,
  onAtivarVisibilidadeAdm,
}: ConversaChatProps) {
  const [textoMensagem, setTextoMensagem] = useState("");
  const [alturaViewport, setAlturaViewport] = useState<number | null>(null);
  const [topOffset, setTopOffset] = useState<number>(0);
  const [tecladoAberto, setTecladoAberto] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const rolarParaFim = useCallback((suave: boolean = false) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: suave ? "smooth" : "auto",
      });
    }
  }, []);

  // Rastreia redimensionamento do viewport pelo teclado virtual mobile
  useEffect(() => {
    if (typeof window === "undefined") return;

    const atualizarAltura = () => {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;

      if (window.visualViewport) {
        const vv = window.visualViewport;
        const h = vv.height;
        setAlturaViewport(h);
        setTopOffset(vv.offsetTop || 0);
        const aberto = window.innerHeight - h > 80;
        setTecladoAberto(aberto);
        if (aberto) {
          rolarParaFim(true);
        }
      }
    };

    atualizarAltura();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", atualizarAltura);
      vv.addEventListener("scroll", atualizarAltura);
    }
    window.addEventListener("resize", atualizarAltura);
    window.addEventListener("scroll", atualizarAltura);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", atualizarAltura);
        vv.removeEventListener("scroll", atualizarAltura);
      }
      window.removeEventListener("resize", atualizarAltura);
      window.removeEventListener("scroll", atualizarAltura);
    };
  }, [rolarParaFim]);

  // Auto-scroll ao receber nova mensagem ou trocar de contato
  useEffect(() => {
    rolarParaFim(false);
    const timer = setTimeout(() => rolarParaFim(false), 50);
    return () => clearTimeout(timer);
  }, [mensagens.length, contatoNome, rolarParaFim]);

  // Focus no input em Desktop
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [contatoNome]);

  const handleFocusInput = () => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }
    setTimeout(() => {
      rolarParaFim(true);
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
      }
    }, 100);
  };

  const handleEnviar = () => {
    const texto = textoMensagem.trim();
    if (!texto) return;
    onEnviar(texto);
    setTextoMensagem("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        inputRef.current.focus();
      }
    }
    setTimeout(() => rolarParaFim(true), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  let ultimaData = "";
  const inicialContato = obterInicialUsuario(contatoNome);
  const gradienteContato = obterGradienteAvatar(contatoNome);

  return (
    <div className="relative flex flex-col w-full h-full min-h-0 bg-[#fbf2e9] dark:bg-slate-900 overflow-hidden">
      {/* Cabeçalho da Conversa Neumórfico com Atalho de Voltar Superior */}
      <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-slate-300/60 dark:border-slate-800/70 bg-[#fbf2e9] dark:bg-slate-900 shrink-0 flex flex-col gap-2">
        {/* Linha 1: Atalho de Voltar (Acima dos dados do contato) */}
        <div className="flex items-center justify-between">
          {modoSupervisao && onVoltarParaListaConversas ? (
            <button
              type="button"
              onClick={onVoltarParaListaConversas}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition cursor-pointer active:scale-95 group -ml-1 px-2 py-1 rounded-lg hover:bg-emerald-500/10"
              title="Voltar para a lista de conversas deste usuário"
            >
              <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Voltar para conversas de {supervisaoInfo?.usuarioANome || contatoNome}</span>
            </button>
          ) : (
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
          )}

          {modoSupervisao && (
            <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 ml-auto">
              Supervisão ADM
            </span>
          )}
        </div>

        {/* Linha 2: Avatar + Nome do Usuário + Status em largura completa */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar Circular com Inicial do Usuário e Halo Suave */}
          <div className="relative shrink-0">
            <div
              className={`h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center text-white font-black text-sm bg-gradient-to-br ${gradienteContato} shadow-[0_4px_10px_rgba(0,0,0,0.12)] ring-2 ring-white/90 dark:ring-slate-800`}
            >
              {inicialContato}
            </div>

            {contatoOnline ? (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800 shadow-[0_0_8px_rgba(16,185,129,0.85)]" />
            ) : (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600 ring-2 ring-white dark:ring-slate-800" />
            )}
          </div>

          {/* Nome do Contato e Status */}
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
              <span>{contatoNome}</span>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              {modoSupervisao && supervisaoInfo ? (
                <span>
                  Diálogo: {supervisaoInfo.usuarioANome} ↔ {supervisaoInfo.usuarioBNome}
                </span>
              ) : contatoOnline ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Online Agora
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  Offline (Receberá notificação no aparelho)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Banner de Ativação de Notificações em Segundo Plano */}
      {permissaoPush !== "granted" && onAtivarNotificacoes && (
        <div className="shrink-0 px-3 py-2 bg-amber-500/10 dark:bg-amber-950/30 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 min-w-0">
            <BellRing className="h-4 w-4 text-amber-500 shrink-0 animate-pulse" />
            <p className="font-semibold text-[11px] truncate">
              Ative notificações para receber mensagens com a tela bloqueada ou em outro app.
            </p>
          </div>
          <button
            type="button"
            onClick={onAtivarNotificacoes}
            disabled={ativandoPush}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 text-[11px] cursor-pointer shadow-sm transition active:scale-95 disabled:opacity-50"
          >
            {ativandoPush ? "Ativando..." : "Ativar"}
          </button>
        </div>
      )}

      {/* Área de Mensagens com Fundo Neumórfico Limpo */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-[#fbf2e9] dark:bg-slate-900 flex flex-col"
      >
        {carregando ? (
          <div className="flex items-center justify-center my-auto h-full">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Carregando mensagens...
            </div>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center my-auto h-full gap-2">
            <div className="h-14 w-14 rounded-full bg-[#fbf2e9] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700/60 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none flex items-center justify-center text-[#007AFF]">
              <Send className="h-6 w-6" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-[260px] font-medium leading-relaxed">
              {modoSupervisao
                ? "Nenhuma mensagem trocada nesta conversa."
                : `Inicie uma conversa com ${contatoNome}`}
              {!contatoOnline && !modoSupervisao && (
                <span className="block mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  O usuário está offline e receberá uma notificação imediata.
                </span>
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Espaçador flexível: alinha as mensagens na base */}
            <div className="flex-1 min-h-0" />
            <div className="space-y-4">
              {mensagens.map((msg) => {
                const ehMinha = msg.remetente_id === userId;
                const dataMensagem = formatarData(msg.created_at);
                let mostrarSeparadorData = false;

                if (dataMensagem !== ultimaData) {
                  ultimaData = dataMensagem;
                  mostrarSeparadorData = true;
                }

                const alinhamentoDireita =
                  ehMinha ||
                  (modoSupervisao &&
                    supervisaoInfo &&
                    msg.remetente_nome === supervisaoInfo.usuarioBNome);

                const remetenteExibicao = ehMinha ? "Você" : msg.remetente_nome || contatoNome;

                const horaFormatada = formatarHora(msg.created_at);

                return (
                  <div key={msg.id}>
                    {/* Separador de Data Neumórfico */}
                    {mostrarSeparadorData && (
                      <div className="flex justify-center my-4">
                        <span className="px-3.5 py-1 text-[10px] font-bold rounded-full bg-[#fbf2e9] dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300/60 dark:border-slate-700/60 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                          {dataMensagem}
                        </span>
                      </div>
                    )}

                    {/* Bloco da Mensagem: Cabeçalho com Nome e Hora idênticos ao Modelo */}
                    <div
                      className={`flex flex-col ${
                        alinhamentoDireita ? "items-end" : "items-start"
                      }`}
                    >
                      {/* Linha de Identificação Acima da Bolha */}
                      <div
                        className={`text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 px-1 flex items-center gap-1.5 ${
                          alinhamentoDireita ? "justify-end" : "justify-start"
                        }`}
                      >
                        {alinhamentoDireita ? (
                          <>
                            <span>{horaFormatada}</span>
                            <span>{remetenteExibicao}</span>
                          </>
                        ) : (
                          <>
                            <span>{remetenteExibicao}</span>
                            <span>{horaFormatada}</span>
                          </>
                        )}
                      </div>

                      {/* Bolha da Mensagem */}
                      <div
                        className={`relative max-w-[85%] sm:max-w-[70%] px-4 py-3 rounded-2xl sm:rounded-[20px] text-sm leading-relaxed break-words transition-all ${
                          alinhamentoDireita
                            ? "bg-gradient-to-r from-[#007AFF] to-[#0056D2] text-white shadow-[0_10px_24px_-4px_rgba(0,122,255,0.42),0_4px_8px_-2px_rgba(0,122,255,0.25)] rounded-tr-sm"
                            : "bg-[#fbf2e9] dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none border border-slate-300/60 dark:border-slate-700/60 rounded-tl-sm"
                        }`}
                      >
                        <span className="whitespace-pre-wrap">{msg.mensagem}</span>

                        {/* Confirmação de Leitura Sutil */}
                        {ehMinha && (
                          <span className="inline-flex items-center ml-2 float-right mt-1 text-white/80">
                            {msg.lida ? (
                              <CheckCheck className="h-3.5 w-3.5 text-white" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-white/70" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Alerta Tático para Administrador em Modo Oculto */}
      {isAdmin && !visivelParaClientes && (
        <div className="px-3.5 py-2.5 bg-amber-500/15 border-t border-amber-500/30 flex items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 animate-ping" />
            <p className="text-[11px] leading-tight">
              <strong>Modo Oculto:</strong> Ao enviar uma mensagem, você ficará online
              automaticamente para que o destinatário possa visualizar e responder.
            </p>
          </div>
          {onAtivarVisibilidadeAdm && (
            <button
              type="button"
              onClick={onAtivarVisibilidadeAdm}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] shrink-0 cursor-pointer shadow transition active:scale-95"
            >
              Ficar Online Agora
            </button>
          )}
        </div>
      )}

      {/* Barra de Digitação Neumórfica */}
      <div
        className={`px-3 py-2.5 sm:px-5 sm:py-3.5 border-t border-slate-300/60 dark:border-slate-800/70 bg-[#fbf2e9] dark:bg-slate-900 shrink-0 z-20 transition-all ${
          tecladoAberto ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="flex items-end gap-2.5 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={textoMensagem}
            onChange={(e) => setTextoMensagem(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocusInput}
            placeholder="Digite uma mensagem..."
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none px-4 py-2.5 text-sm rounded-2xl bg-[#fbf2e9] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] transition max-h-[100px] overflow-y-auto"
            style={{
              height: "auto",
              minHeight: "42px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 100) + "px";
            }}
          />

          <button
            type="button"
            onClick={handleEnviar}
            disabled={!textoMensagem.trim()}
            className="shrink-0 rounded-full bg-gradient-to-br from-[#007AFF] to-[#0056D2] text-white shadow-[0_6px_16px_rgba(0,122,255,0.42)] hover:shadow-[0_8px_20px_rgba(0,122,255,0.55)] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95 flex items-center justify-center h-[42px] w-[42px]"
            aria-label="Enviar mensagem"
            title="Enviar mensagem"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
