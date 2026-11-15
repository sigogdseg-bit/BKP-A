// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Chat Interativo: Tela Principal Completa
// Layout responsivo: sidebar de contatos + área de conversa
// Sincronização em tempo real via usePresence e Realtime Broadcast
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, BellRing, X, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import { usePresence } from "@/features/seguranca/context/PresenceContext";
import { supabase } from "@/integrations/supabase/client";
import { tocarAlertaSonoroTatico } from "@/shared/lib/notificacoesBdService";
import {
  solicitarPermissaoNotificacao,
  verificarSuporteWebPush,
  dispararNotificacaoNativaAlerta,
} from "@/shared/lib/webPushService";
import type { ChatMensagem, ContatoOnline, ConversaRealizada } from "../types";
import {
  carregarContatosCompletosParaChat,
  carregarHistoricoConversa,
  enviarMensagemChat,
  marcarMensagensComoLidas,
  carregarContagemNaoLidasPorRemetente,
  alterarVisibilidadeChatAdm,
  obterVisibilidadeChatAdm,
  carregarConversasRealizadasDoUsuario,
  limparNotificacoesChatInvalidas,
} from "../services/chatService";
import { ContatosOnlineList } from "./ContatosOnlineList";
import { ConversaChat } from "./ConversaChat";
import { ListaConversasRealizadas } from "./ListaConversasRealizadas";
import { ModalEnvioRapidoWhatsapp } from "./ModalEnvioRapidoWhatsapp";

export function ChatView() {
  const { session } = useAuth();
  const { usuariosOnline, atualizarVisibilidadeChat } = usePresence();

  const [modalWhatsappAberto, setModalWhatsappAberto] = useState(false);
  const [contatoAtivo, setContatoAtivo] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("contato") || null;
    }
    return null;
  });
  const [mensagens, setMensagens] = useState<ChatMensagem[]>([]);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [contagemNaoLidas, setContagemNaoLidas] = useState<Map<string, number>>(new Map());
  const [contatos, setContatos] = useState<ContatoOnline[]>([]);
  const [visivelParaClientes, setVisivelParaClientes] = useState<boolean>(() => {
    if (typeof window !== "undefined" && session?.userId) {
      return window.localStorage.getItem(`sigo_adm_chat_visivel_${session.userId}`) === "true";
    }
    return false;
  });

  // Supervisão de Conversas (Exclusivo para SuperADM e Administradores)
  const [conversasRealizadas, setConversasRealizadas] = useState<ConversaRealizada[]>([]);
  const [carregandoConversasRealizadas, setCarregandoConversasRealizadas] = useState(false);
  const [conversaSupervisao, setConversaSupervisao] = useState<{
    interlocutorId: string;
    interlocutorNome: string;
    interlocutorRole: string;
  } | null>(null);

  // Status de Notificações Push do Aparelho
  const [permissaoPush, setPermissaoPush] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });
  const [ativandoPush, setAtivandoPush] = useState(false);
  const [mostrarModalIosPwa, setMostrarModalIosPwa] = useState(false);

  // Sincroniza permissão atualizada
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissaoPush(Notification.permission);
    }
  }, []);

  const handleAtivarNotificacoes = async () => {
    const status = verificarSuporteWebPush();
    if (status.isIos && !status.isStandalone) {
      setMostrarModalIosPwa(true);
      return;
    }

    setAtivandoPush(true);
    try {
      const perm = await solicitarPermissaoNotificacao(session?.clienteId);
      setPermissaoPush(perm);
      if (perm === "granted") {
        toast.success("Notificações em segundo plano ativadas com sucesso!");
        if (typeof window !== "undefined" && "serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && "showNotification" in reg) {
              await (reg as any).showNotification("🔔 GD Rastreamento — Notificações Ativadas", {
                body: "Seu aparelho agora receberá alertas e mensagens mesmo com a tela bloqueada.",
                icon: "/logo.png",
                badge: "/favicon.png",
                tag: "sigo-notificacoes-ativadas",
                renotify: false,
              });
            }
          } catch {
            // Silencia
          }
        }
      } else if (perm === "denied") {
        toast.error(
          "Notificações bloqueadas nas permissões do navegador. Habilite nas configurações.",
        );
      }
    } catch (err) {
      console.error("Falha ao ativar notificações:", err);
      toast.error("Não foi possível ativar as notificações.");
    } finally {
      setAtivandoPush(false);
    }
  };

  const contatoAtivoRef = useRef<string | null>(null);
  const conversaSupervisaoRef = useRef<{ interlocutorId: string } | null>(null);
  const somTocadosRef = useRef<Map<string, number>>(new Map());

  // Rastreia se a tela do chat está aberta e qual contato está em foco
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __sigoChatAberto?: boolean }).__sigoChatAberto = true;
    }
    return () => {
      if (typeof window !== "undefined") {
        (window as unknown as { __sigoChatAberto?: boolean }).__sigoChatAberto = false;
        (window as unknown as { __sigoChatContatoAtivo?: string | null }).__sigoChatContatoAtivo =
          null;
      }
    };
  }, []);

  useEffect(() => {
    contatoAtivoRef.current = contatoAtivo;
    if (typeof window !== "undefined") {
      (window as unknown as { __sigoChatContatoAtivo?: string | null }).__sigoChatContatoAtivo =
        contatoAtivo;
    }
  }, [contatoAtivo]);

  useEffect(() => {
    conversaSupervisaoRef.current = conversaSupervisao;
  }, [conversaSupervisao]);

  // Função auxiliar para trocar contato mantendo o parâmetro na URL
  const selecionarContato = useCallback((id: string | null) => {
    setContatoAtivo(id);
    setConversaSupervisao(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set("contato", id);
      } else {
        url.searchParams.delete("contato");
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Toca som de chat sem duplicar em rajadas de broadcast e postgres_changes
  const tocarSomChatDeduplicado = useCallback((remetenteId: string, texto: string) => {
    const agora = Date.now();
    const chave = `${remetenteId}:${texto.trim()}`;
    const ultimo = somTocadosRef.current.get(chave);
    if (ultimo && agora - ultimo < 10000) return;
    somTocadosRef.current.set(chave, agora);
    if (somTocadosRef.current.size > 50) {
      for (const [k, time] of somTocadosRef.current.entries()) {
        if (agora - time > 15000) somTocadosRef.current.delete(k);
      }
    }
    tocarAlertaSonoroTatico("alerta");
  }, []);

  // Deduplicação inteligente de mensagens recebidas
  const adicionarOuAtualizarMensagem = useCallback((novaMsg: ChatMensagem) => {
    setMensagens((antigas) => {
      // 1. Já existe pelo ID exato?
      if (antigas.some((m) => m.id === novaMsg.id)) return antigas;

      // 2. Já existe mensagem com mesmo remetente, destinatário e texto em janela de 10 segundos?
      const idxExistente = antigas.findIndex(
        (m) =>
          m.remetente_id === novaMsg.remetente_id &&
          m.destinatario_id === novaMsg.destinatario_id &&
          m.mensagem === novaMsg.mensagem &&
          Math.abs(new Date(m.created_at).getTime() - new Date(novaMsg.created_at).getTime()) <
            10000,
      );

      if (idxExistente !== -1) {
        // Atualiza com o ID definitivo do banco
        const atualizadas = [...antigas];
        atualizadas[idxExistente] = {
          ...atualizadas[idxExistente],
          id: novaMsg.id,
          lida: novaMsg.lida || atualizadas[idxExistente].lida,
        };
        return atualizadas;
      }

      return [...antigas, novaMsg];
    });
  }, []);

  // Recarrega contagem de não lidas do banco
  const recarregarNaoLidas = useCallback(async () => {
    if (!session?.userId) return;
    const contagens = await carregarContagemNaoLidasPorRemetente(session.userId);
    setContagemNaoLidas(contagens);
  }, [session?.userId]);

  useEffect(() => {
    if (session?.userId) {
      limparNotificacoesChatInvalidas(session.userId).finally(() => {
        recarregarNaoLidas();
      });
    } else {
      recarregarNaoLidas();
    }
  }, [session?.userId, recarregarNaoLidas]);

  // Carrega status salvo de visibilidade do ADM
  useEffect(() => {
    if (session?.userId && session?.isAdmin) {
      obterVisibilidadeChatAdm(session.userId).then((visivel) => {
        setVisivelParaClientes(visivel);
      });
    }
  }, [session?.userId, session?.isAdmin]);

  // Carrega catálogo completo de contatos:
  // - ADM e Operador veem TODOS os usuários cadastrados (inclusive offline)
  // - Cliente vê estritamente Operadores e Administradores com visibilidade ativada
  const recarregarContatos = useCallback(async () => {
    if (!session?.userId) return;
    try {
      const lista = await carregarContatosCompletosParaChat({
        meuUserId: session.userId,
        isCliente: session.isCliente,
        isAdminOuOperador: session.isAdmin || session.isOperador,
        usuariosOnline,
        contagemNaoLidas,
      });
      setContatos(lista);
    } catch (err) {
      console.warn("Erro ao recarregar contatos do chat:", err);
    }
  }, [session, usuariosOnline, contagemNaoLidas]);

  // Handler para o Administrador ligar ou desligar visibilidade no chat
  const handleToggleVisibilidade = useCallback(
    async (novoStatus: boolean) => {
      if (!session?.userId) return;
      setVisivelParaClientes(novoStatus);
      await atualizarVisibilidadeChat(novoStatus);
      const sucesso = await alterarVisibilidadeChatAdm(session.userId, novoStatus);
      if (sucesso) {
        toast.success(
          novoStatus
            ? "Visibilidade no Chat ativada: Você agora está visível para os clientes."
            : "Visibilidade no Chat desativada: Você está invisível para os clientes.",
        );
        recarregarContatos();
      } else {
        toast.error("Falha ao atualizar visibilidade no chat.");
      }
    },
    [session?.userId, atualizarVisibilidadeChat, recarregarContatos],
  );

  useEffect(() => {
    recarregarContatos();
  }, [recarregarContatos]);

  // Carrega lista de conversas realizadas do usuário selecionado (Exclusivo para Supervisão ADM)
  useEffect(() => {
    if (!session?.isAdmin || !contatoAtivo) {
      setConversasRealizadas([]);
      return;
    }

    let cancelado = false;
    setCarregandoConversasRealizadas(true);
    carregarConversasRealizadasDoUsuario(contatoAtivo).then((lista) => {
      if (!cancelado) {
        setConversasRealizadas(lista);
        setCarregandoConversasRealizadas(false);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [session?.isAdmin, contatoAtivo]);

  // Se o contato ativo selecionado estiver offline, mantém a conversa aberta para histórico e envio
  const contatoSelecionado = useMemo(() => {
    if (!contatoAtivo) return null;
    const encontrado = contatos.find((c) => c.userId === contatoAtivo);
    if (encontrado) {
      const isAdm = encontrado.role === "superadmin" || encontrado.role === "adm";
      if (session?.isCliente && isAdm && !encontrado.visivelNoChat) {
        return { ...encontrado, online: false };
      }
      return encontrado;
    }
    const userGeral = usuariosOnline.find((u) => u.userId === contatoAtivo);
    const isAdm = userGeral?.role === "superadmin" || userGeral?.role === "adm";
    const isOnline = Boolean(
      userGeral && (!session?.isCliente || !isAdm || userGeral.visivelNoChat),
    );
    return {
      userId: contatoAtivo,
      nome: userGeral?.nome || "Contato",
      role: userGeral?.role || "usuario",
      online: isOnline,
      visivelNoChat: Boolean(userGeral?.visivelNoChat),
      naoLidas: 0,
    };
  }, [contatoAtivo, contatos, usuariosOnline, session?.isCliente]);

  // 1. Carrega histórico ao selecionar um contato ou conversa realizada
  useEffect(() => {
    if (!session || !contatoAtivo) {
      setMensagens([]);
      return;
    }

    // Se for ADM e ainda não escolheu uma conversa realizada nem clicou para conversar diretamente, não carrega mensagens ainda
    if (session.isAdmin && !conversaSupervisao) {
      setMensagens([]);
      return;
    }

    let cancelado = false;
    setCarregandoMsgs(true);

    // Determina os dois participantes da conversa:
    // Caso 1: Supervisão ADM de diálogo entre terceiros
    // Caso 2: Conversa direta entre o usuário autenticado (session.userId) e o contato ativo
    const isSupervisaoTerceiros = Boolean(
      session.isAdmin && conversaSupervisao && conversaSupervisao.interlocutorId !== session.userId,
    );

    const userA = isSupervisaoTerceiros ? contatoAtivo : session.userId;
    const userB = isSupervisaoTerceiros ? conversaSupervisao!.interlocutorId : contatoAtivo;

    carregarHistoricoConversa({
      usuarioAId: userA,
      usuarioBId: userB,
    }).then((historico) => {
      if (!cancelado) {
        setMensagens(historico);
        setCarregandoMsgs(false);
      }
    });

    // Marca mensagens como lidas apenas se a janela estiver visível e com foco direto
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      (typeof document.hasFocus !== "function" || document.hasFocus())
    ) {
      marcarMensagensComoLidas({
        destinatarioId: session.userId,
        remetenteId: contatoAtivo,
      }).then(() => {
        recarregarNaoLidas();
      });
    }

    return () => {
      cancelado = true;
    };
  }, [session, contatoAtivo, conversaSupervisao, recarregarNaoLidas]);

  // Marca mensagens como lidas quando a janela ganha foco ou se torna visível na tela
  useEffect(() => {
    const marcarQuandoFocar = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        (typeof document.hasFocus !== "function" || document.hasFocus()) &&
        contatoAtivoRef.current &&
        session?.userId
      ) {
        marcarMensagensComoLidas({
          destinatarioId: session.userId,
          remetenteId: contatoAtivoRef.current,
        }).then(() => {
          recarregarNaoLidas();
        });
      }
    };

    window.addEventListener("focus", marcarQuandoFocar);
    document.addEventListener("visibilitychange", marcarQuandoFocar);
    return () => {
      window.removeEventListener("focus", marcarQuandoFocar);
      document.removeEventListener("visibilitychange", marcarQuandoFocar);
    };
  }, [session?.userId, recarregarNaoLidas]);

  // 2. Escuta mensagens em tempo real via Realtime Broadcast e Banco
  useEffect(() => {
    if (!session) return;

    const canalNotif = supabase
      .channel("chat-mensagens-realtime-view")
      .on("broadcast", { event: "notificacao_inter_dispositivos" }, (payload: any) => {
        const notif = payload?.payload;
        if (!notif || notif.tipo !== "chat") return;

        const remetenteId = notif.remetente_user_id;
        const destinatarioId = notif.destinatario_user_id;
        const ativoContato = contatoAtivoRef.current;
        const sup = conversaSupervisaoRef.current;

        // Verifica se a mensagem pertence a esta conversa aberta
        const isSupervisaoAtiva = Boolean(
          session.isAdmin && sup && sup.interlocutorId !== session.userId,
        );

        const pertenceAEstaConversa = isSupervisaoAtiva
          ? (remetenteId === ativoContato && destinatarioId === sup!.interlocutorId) ||
            (remetenteId === sup!.interlocutorId && destinatarioId === ativoContato)
          : (remetenteId === session.userId && destinatarioId === ativoContato) ||
            (remetenteId === ativoContato && destinatarioId === session.userId);

        if (pertenceAEstaConversa) {
          const novaMsg: ChatMensagem = {
            id: notif.id || `msg-${Date.now()}`,
            remetente_id: remetenteId,
            remetente_nome: notif.remetente_nome || "",
            destinatario_id: destinatarioId,
            mensagem: notif.mensagem,
            lida: false,
            created_at: notif.created_at || new Date().toISOString(),
          };

          adicionarOuAtualizarMensagem(novaMsg);

          // Toca som tático se a mensagem foi recebida de outro usuário
          if (remetenteId !== session.userId) {
            tocarSomChatDeduplicado(remetenteId, notif.mensagem);
            // SÓ marca como lida se a janela estiver realmente visível e com foco
            if (
              typeof document !== "undefined" &&
              document.visibilityState === "visible" &&
              (typeof document.hasFocus !== "function" || document.hasFocus())
            ) {
              marcarMensagensComoLidas({
                destinatarioId: session.userId,
                remetenteId: remetenteId,
              })
                .then(() => recarregarNaoLidas())
                .catch(() => {});
            }
          }
        } else {
          // Mensagem para outra conversa ou recebida em segundo plano
          if (destinatarioId === session.userId) {
            tocarSomChatDeduplicado(remetenteId, notif.mensagem);
            recarregarNaoLidas();
          }
        }

        // Se for ADM e pertencer ao contato ativo, atualiza conversas realizadas
        if (
          session.isAdmin &&
          ativoContato &&
          (remetenteId === ativoContato || destinatarioId === ativoContato)
        ) {
          carregarConversasRealizadasDoUsuario(ativoContato).then(setConversasRealizadas);
        }
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes_sistema",
          filter: `destinatario_user_id=eq.${session.userId}`,
        },
        (payload: any) => {
          const novo = payload.new;
          if (novo?.tipo !== "chat") return;

          if (novo.remetente_user_id === contatoAtivoRef.current) {
            const novaMsg: ChatMensagem = {
              id: novo.id,
              remetente_id: novo.remetente_user_id,
              remetente_nome: novo.remetente_nome || "",
              destinatario_id: novo.destinatario_user_id,
              mensagem: novo.mensagem,
              lida: !!novo.lida,
              created_at: novo.created_at,
            };
            adicionarOuAtualizarMensagem(novaMsg);
            if (
              typeof document !== "undefined" &&
              document.visibilityState === "visible" &&
              (typeof document.hasFocus !== "function" || document.hasFocus())
            ) {
              marcarMensagensComoLidas({
                destinatarioId: session.userId,
                remetenteId: novo.remetente_user_id,
              })
                .then(() => recarregarNaoLidas())
                .catch(() => {});
            }
          } else {
            recarregarNaoLidas();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notificacoes_sistema",
          filter: `remetente_user_id=eq.${session.userId}`,
        },
        (payload: any) => {
          const atualizado = payload.new;
          if (atualizado?.tipo !== "chat") return;
          if (atualizado.lida) {
            // Atualiza em tempo real as mensagens enviadas para 2 traços (lidas)
            setMensagens((antigas) =>
              antigas.map((m) =>
                m.id === atualizado.id ||
                (m.remetente_id === session.userId &&
                  m.destinatario_id === atualizado.destinatario_user_id &&
                  new Date(m.created_at).getTime() - 120000 <=
                    new Date(atualizado.created_at).getTime())
                  ? { ...m, lida: true }
                  : m,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canalNotif);
    };
  }, [session, recarregarNaoLidas, adicionarOuAtualizarMensagem, tocarSomChatDeduplicado]);

  // 3. Enviar Mensagem
  const handleEnviarMensagem = async (texto: string) => {
    if (!session || !contatoAtivo) return;

    // Destinatário alvo da mensagem (o contato ativo selecionado)
    const destId = contatoAtivo;

    // REGRA DE NEGÓCIO CANÔNICA: Administrador em modo oculto deve ficar online antes de enviar mensagem,
    // pois o usuário destinatário não consegue ver o contato nem responder se o ADM estiver offline/oculto.
    if (session.isAdmin && !visivelParaClientes) {
      setVisivelParaClientes(true);
      atualizarVisibilidadeChat(true).catch(() => {});
      alterarVisibilidadeChatAdm(session.userId, true).catch(() => {});
      recarregarContatos();
      toast.info(
        "Sua visibilidade foi ativada automaticamente para que o destinatário possa visualizar e responder suas mensagens.",
        { duration: 5000 },
      );
    }

    // Adiciona otimisticamente na tela
    const msgOtimista: ChatMensagem = {
      id: `temp-${Date.now()}`,
      remetente_id: session.userId,
      remetente_nome: session.nome || "Usuário",
      destinatario_id: destId,
      mensagem: texto,
      lida: false,
      created_at: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, msgOtimista]);

    const resultado = await enviarMensagemChat({
      remetenteId: session.userId,
      remetenteNome: session.nome || "Usuário",
      destinatarioId: destId,
      mensagem: texto,
    });

    if (resultado) {
      // Substitui o id temporário pelo definitivo
      setMensagens((prev) => prev.map((m) => (m.id === msgOtimista.id ? resultado : m)));
      if (session.isAdmin) {
        carregarConversasRealizadasDoUsuario(contatoAtivo).then(setConversasRealizadas);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-0 sm:p-3 md:p-4 max-w-7xl mx-auto overflow-hidden min-h-0">
      {/* Banner de Aviso de Notificações em Segundo Plano Desativadas */}
      {permissaoPush !== "granted" && (
        <div className="shrink-0 mb-2 px-3.5 py-2.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 flex items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-200 min-w-0">
            <BellRing className="h-5 w-5 text-amber-500 shrink-0 animate-pulse" />
            <div className="min-w-0">
              <p className="font-bold truncate">Notificações em Segundo Plano Desativadas</p>
              <p className="text-[11px] opacity-80 truncate">
                Ative para receber mensagens com a tela bloqueada ou em outro aplicativo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAtivarNotificacoes}
            disabled={ativandoPush}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 cursor-pointer text-xs shadow transition active:scale-95 disabled:opacity-50"
          >
            {ativandoPush ? "Ativando..." : "Ativar Notificações"}
          </button>
        </div>
      )}

      <div className="flex-1 bg-[#eaf0f8] dark:bg-slate-900 border-0 sm:border border-slate-300/60 dark:border-slate-800 rounded-none sm:rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-none overflow-hidden flex flex-col md:flex-row min-h-0 h-full">
        {/* Painel Lateral: Catálogo de Contatos (No mobile, esconde se houver conversa ativa) */}
        <div
          className={`w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-slate-300/60 dark:border-slate-800/70 shrink-0 bg-[#eaf0f8] dark:bg-slate-900 ${
            contatoAtivo ? "hidden md:flex flex-col" : "flex flex-col"
          } h-full min-h-0 overflow-hidden`}
        >
          <ContatosOnlineList
            contatos={contatos}
            contatoAtivo={contatoAtivo}
            onSelecionarContato={(id) => selecionarContato(id)}
            buscaTexto={buscaTexto}
            onBuscaChange={setBuscaTexto}
            isCliente={session?.isCliente || false}
            isAdmin={session?.isAdmin || false}
            visivelParaClientes={visivelParaClientes}
            onToggleVisibilidade={handleToggleVisibilidade}
          />
        </div>

        {/* Área Central: Conversa Ativa ou Lista de Conversas Realizadas */}
        <div
          className={`flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#eaf0f8] dark:bg-slate-900 ${
            !contatoAtivo ? "hidden md:flex" : "flex"
          }`}
        >
          {contatoSelecionado ? (
            session?.isAdmin && !conversaSupervisao ? (
              <ListaConversasRealizadas
                contato={contatoSelecionado}
                conversas={conversasRealizadas}
                carregando={carregandoConversasRealizadas}
                onSelecionarConversa={(interlocutorId, interlocutorNome, interlocutorRole) => {
                  setConversaSupervisao({
                    interlocutorId,
                    interlocutorNome,
                    interlocutorRole,
                  });
                }}
                onIniciarConversaDireta={() => {
                  setConversaSupervisao({
                    interlocutorId: session.userId,
                    interlocutorNome: session.nome || "Administrador",
                    interlocutorRole: "adm",
                  });
                }}
                onVoltar={() => selecionarContato(null)}
              />
            ) : (
              <ConversaChat
                mensagens={mensagens}
                userId={session?.userId || ""}
                contatoNome={
                  conversaSupervisao && conversaSupervisao.interlocutorId !== session?.userId
                    ? `${contatoSelecionado.nome} ↔ ${conversaSupervisao.interlocutorNome}`
                    : contatoSelecionado.nome
                }
                contatoRole={contatoSelecionado.role}
                contatoOnline={contatoSelecionado.online}
                onEnviar={handleEnviarMensagem}
                onVoltar={() => {
                  if (session?.isAdmin && conversaSupervisao) {
                    setConversaSupervisao(null);
                  } else {
                    selecionarContato(null);
                  }
                }}
                carregando={carregandoMsgs}
                modoSupervisao={Boolean(
                  session?.isAdmin &&
                  conversaSupervisao &&
                  conversaSupervisao.interlocutorId !== session.userId,
                )}
                supervisaoInfo={
                  conversaSupervisao && conversaSupervisao.interlocutorId !== session?.userId
                    ? {
                        usuarioANome: contatoSelecionado.nome,
                        usuarioARole: contatoSelecionado.role,
                        usuarioBNome: conversaSupervisao.interlocutorNome,
                        usuarioBRole: conversaSupervisao.interlocutorRole,
                      }
                    : undefined
                }
                onVoltarParaListaConversas={
                  session?.isAdmin && conversaSupervisao
                    ? () => setConversaSupervisao(null)
                    : undefined
                }
                permissaoPush={permissaoPush}
                onAtivarNotificacoes={handleAtivarNotificacoes}
                ativandoPush={ativandoPush}
                isAdmin={session?.isAdmin || false}
                visivelParaClientes={visivelParaClientes}
                onAtivarVisibilidadeAdm={() => handleToggleVisibilidade(true)}
              />
            )
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="p-5 rounded-full bg-[#eaf0f8] dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700/60 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-none text-[#007AFF] mb-4">
                <MessageCircle className="h-10 w-10 sm:h-12 sm:w-12" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                Chat em Tempo Real
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                {session?.isCliente
                  ? "Converse instantaneamente com os operadores e administradores da plataforma."
                  : session?.isAdmin
                    ? "Selecione qualquer cliente ou usuário na lista para auditar as conversas realizadas ou iniciar um diálogo."
                    : "Selecione qualquer usuário na lista para iniciar a conversa. Usuários offline receberão notificações no aparelho ao receber mensagens."}
              </p>

              {(session?.isAdmin || session?.isOperador) && (
                <button
                  type="button"
                  onClick={() => setModalWhatsappAberto(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 transition active:scale-95 cursor-pointer"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Disparar Mensagem via WhatsApp Gateway</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Canônico de Disparo Direto de Mensagem WhatsApp */}
      <ModalEnvioRapidoWhatsapp
        aberto={modalWhatsappAberto}
        onClose={() => setModalWhatsappAberto(false)}
      />

      {/* Modal Canônico de Instrução para PWA no iPhone / iPad (Zero corte de viewport) */}
      {mostrarModalIosPwa &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto my-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                  <BellRing className="h-5 w-5" />
                  <span>Notificações no iPhone e iPad</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarModalIosPwa(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                O sistema iOS da Apple requer que a aplicação seja adicionada à{" "}
                <strong>Tela de Início</strong> para habilitar o recebimento de notificações com
                tela bloqueada ou aplicativo em segundo plano:
              </p>
              <div className="space-y-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 text-xs">
                    1
                  </span>
                  <p className="text-slate-700 dark:text-slate-200 pt-0.5">
                    Toque no botão <strong>Compartilhar</strong> do Safari (o quadrado com seta para
                    cima na barra inferior do navegador).
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 text-xs">
                    2
                  </span>
                  <p className="text-slate-700 dark:text-slate-200 pt-0.5">
                    Role as opções para baixo e toque em{" "}
                    <strong>"Adicionar à Tela de Início"</strong>.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 text-xs">
                    3
                  </span>
                  <p className="text-slate-700 dark:text-slate-200 pt-0.5">
                    Abra o <strong>GD Rastreamento</strong> pelo novo ícone na tela de início do seu
                    aparelho e toque em <strong>"Ativar Notificações"</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMostrarModalIosPwa(false)}
                className="mt-6 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow transition active:scale-95 cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
