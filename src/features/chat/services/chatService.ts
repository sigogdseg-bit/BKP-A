// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Serviço do Chat Interativo em Tempo Real
// Comunicação ponto a ponto via Supabase Realtime e notificacoes_sistema (Zero Polling)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import type { ChatMensagem, ContatoOnline } from "../types";
import type { UsuarioOnline } from "@/features/seguranca/context/PresenceContext";

/**
 * Filtra e formata a lista de contatos a partir do estado global de presença em tempo real.
 * Regras estritas:
 * - Cliente: vê APENAS operadores (online ou off). Administradores NÃO aparecem, a menos que tenham ligado a visibilidade.
 * - Operador/ADM: vê TODOS os usuários online (exceto a si mesmo).
 */
export function formatarContatosOnline(params: {
  usuariosOnline: UsuarioOnline[];
  meuUserId: string;
  isCliente: boolean;
  contagemNaoLidas?: Map<string, number>;
}): ContatoOnline[] {
  const { usuariosOnline, meuUserId, isCliente, contagemNaoLidas } = params;

  return usuariosOnline
    .filter((u) => {
      // Nunca exibe a si mesmo
      if (u.userId === meuUserId) return false;

      // Se for cliente: apenas operadores aparecem; ADMs só aparecem se tiverem visibilidade ativada
      if (isCliente) {
        const role = (u.role || "").toLowerCase();
        if (role === "operador") return true;
        if (role === "superadmin" || role === "adm") {
          return Boolean((u as any).visivel_no_chat ?? (u as any).visivelNoChat);
        }
        return false;
      }

      // Operador e ADM veem todos
      return true;
    })
    .map((u) => ({
      userId: u.userId,
      nome: u.nome || u.email?.split("@")[0] || "Usuário",
      role: u.role || "cliente",
      email: u.email,
      online:
        String(u.role).toLowerCase() === "superadmin" || String(u.role).toLowerCase() === "adm"
          ? Boolean((u as any).visivel_no_chat ?? (u as any).visivelNoChat)
          : true,
      visivelNoChat: Boolean((u as any).visivel_no_chat ?? (u as any).visivelNoChat),
      naoLidas: contagemNaoLidas?.get(u.userId) || 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Alterna a visibilidade do administrador no chat para clientes
 */
export async function alterarVisibilidadeChatAdm(
  userId: string,
  visivel: boolean,
): Promise<boolean> {
  try {
    // 1. Salva no localStorage local para resposta instantânea
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`sigo_adm_chat_visivel_${userId}`, visivel ? "true" : "false");
      window.dispatchEvent(
        new CustomEvent("sigo-chat-visibilidade-change", {
          detail: { userId, visivel },
        }),
      );
    }

    // 2. Notifica API backend com serviceRole para garantia em nuvem
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/chat/visibilidade", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ visivel }),
        });
      }
    } catch {
      // Ignora erro de rede da API
    }

    // 3. Persiste no banco de dados via RPC ou update direto
    const { error: rpcError } = await supabase.rpc("alterar_visibilidade_chat", {
      p_visivel: visivel,
    });

    if (rpcError) {
      // Fallback para update direto em profiles
      await supabase
        .from("profiles")
        .update({ visivel_no_chat: visivel } as any)
        .eq("id", userId);
    }

    // Se for SuperADM, sincroniza ambas as contas para evitar discrepância
    try {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      const email = (userProfile?.email || "").toLowerCase();
      if (email === "novaes@adm.28bpm.local" || email === "novaes@oficial.tec.br") {
        await supabase
          .from("profiles")
          .update({ visivel_no_chat: visivel } as any)
          .in("email", ["novaes@adm.28bpm.local", "novaes@oficial.tec.br"]);
      }
    } catch {
      // Ignora erro de sincronização secundária
    }

    return true;
  } catch (err) {
    console.warn("Aviso ao alterar visibilidade de chat do administrador:", err);
    return false;
  }
}

/**
 * Lê o estado atual de visibilidade no chat do administrador
 */
export async function obterVisibilidadeChatAdm(userId: string): Promise<boolean> {
  try {
    // Tenta primeiro no banco de dados
    const { data, error } = await supabase
      .from("profiles")
      .select("visivel_no_chat")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data && typeof (data as any).visivel_no_chat === "boolean") {
      const val = (data as any).visivel_no_chat;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`sigo_adm_chat_visivel_${userId}`, val ? "true" : "false");
      }
      return val;
    }
  } catch {
    // Fallback para localStorage
  }

  if (typeof window !== "undefined") {
    const salvo = window.localStorage.getItem(`sigo_adm_chat_visivel_${userId}`);
    if (salvo !== null) return salvo === "true";
  }

  return false;
}

/**
 * Carrega o catálogo completo de contatos para o chat:
 * - Operador/ADM: vê TODOS os usuários cadastrados no banco (mesmo offline), cruzando com PresenceContext.
 * - Cliente: vê APENAS os Operadores (seja online ou off). Administradores aparecem quando tiverem ligado a visibilidade.
 * - Ordenação inteligente: não lidas no topo > online > ordem alfabética.
 */
export async function carregarContatosCompletosParaChat(params: {
  meuUserId: string;
  isCliente: boolean;
  isAdminOuOperador: boolean;
  usuariosOnline: UsuarioOnline[];
  contagemNaoLidas?: Map<string, number>;
}): Promise<ContatoOnline[]> {
  const { meuUserId, isCliente, usuariosOnline, contagemNaoLidas } = params;

  const onlineUserIds = new Set(usuariosOnline.map((u) => u.userId));

  let perfisDb: Array<{
    id: string;
    nome: string;
    email: string;
    role: string;
    ativo?: boolean;
    visivel_no_chat?: boolean;
  }> = [];

  // 1. Tenta carregar pela API backend (que utiliza serviceRoleKey e não é bloqueada pelo RLS do cliente)
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch("/api/chat/contatos", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.contatos)) {
          perfisDb = json.contatos.map((c: any) => ({
            id: c.userId,
            nome: c.nome,
            email: c.email,
            role: c.role,
            ativo: true,
            visivel_no_chat: c.visivelNoChat,
          }));
        }
      }
    }
  } catch {
    // Fallback gracioso para consulta direta
  }

  // Se a API ainda não respondeu, faz consulta direta no Supabase
  if (perfisDb.length === 0) {
    try {
      let query = supabase.from("profiles").select("id, nome, email, role, ativo, visivel_no_chat");

      if (isCliente) {
        query = query.in("role", ["superadmin", "adm", "operador"]);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        perfisDb = data.filter((p) => p.ativo !== false);
      } else if (error) {
        const { data: dataFallback } = await supabase
          .from("profiles")
          .select("id, nome, email, role, ativo");
        if (Array.isArray(dataFallback)) {
          perfisDb = dataFallback.filter((p) => p.ativo !== false);
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar perfis cadastrados para o chat:", err);
    }
  }

  // Mapa de contatos para deduplicação ágil
  const contatosMap = new Map<string, ContatoOnline>();

  // 1. Registra usuários cadastrados do banco de dados
  for (const p of perfisDb) {
    if (p.id === meuUserId) continue; // Nunca lista a si mesmo

    const role = (p.role || "").toLowerCase();

    // REGRA DE NEGÓCIO CANÔNICA:
    // Para clientes, só aparecem os operadores (seja online ou off).
    // Administrador aparece apenas se tiver a opção visivel_no_chat ligada!
    const visivelLocal =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`sigo_adm_chat_visivel_${p.id}`) === "true"
        : false;

    if (isCliente) {
      if (role === "operador") {
        // Operadores aparecem sempre para clientes (online ou off)
      } else if (role === "superadmin" || role === "adm") {
        const visivel = p.visivel_no_chat ?? visivelLocal;
        if (!visivel) continue; // ADM com visibilidade desligada não aparece para clientes
      } else {
        continue;
      }
    }

    let online = onlineUserIds.has(p.id);
    if ((role === "superadmin" || role === "adm") && !(p.visivel_no_chat ?? visivelLocal)) {
      online = false;
    }
    contatosMap.set(p.id, {
      userId: p.id,
      nome: p.nome || p.email?.split("@")[0] || "Usuário",
      role: p.role || "cliente",
      email: p.email,
      online,
      visivelNoChat: p.visivel_no_chat ?? false,
      naoLidas: contagemNaoLidas?.get(p.id) || 0,
    });
  }

  // 2. Garante que qualquer usuário conectado em tempo real que não veio do select também conste
  for (const u of usuariosOnline) {
    if (u.userId === meuUserId) continue;
    const role = (u.role || "").toLowerCase();
    const isAdm = role === "superadmin" || role === "adm";

    // Visibilidade em tempo real do administrador
    const admVisivel = Boolean(
      typeof u.visivelNoChat === "boolean"
        ? u.visivelNoChat
        : ((u as any).visivel_no_chat ?? contatosMap.get(u.userId)?.visivelNoChat),
    );

    if (isCliente) {
      if (role === "operador") {
        // Operador permitido sempre para clientes
      } else if (isAdm) {
        if (!admVisivel) {
          // Administrador sem visibilidade JAMAIS aparece para o cliente!
          contatosMap.delete(u.userId);
          continue;
        }
      } else {
        continue;
      }
    }

    let isOnline = true;
    if (isAdm && !admVisivel) {
      isOnline = false;
    }

    const existente = contatosMap.get(u.userId);
    if (existente) {
      existente.online = isOnline;
      existente.visivelNoChat = admVisivel;
      if (!existente.nome || existente.nome === "Usuário") {
        existente.nome = u.nome || u.email?.split("@")[0] || existente.nome;
      }
    } else {
      contatosMap.set(u.userId, {
        userId: u.userId,
        nome: u.nome || u.email?.split("@")[0] || "Usuário",
        role: u.role || "cliente",
        email: u.email,
        online: isOnline,
        visivelNoChat: admVisivel,
        naoLidas: contagemNaoLidas?.get(u.userId) || 0,
      });
    }
  }

  const lista = Array.from(contatosMap.values());

  // Ordenação:
  // 1. Contatos com mensagens pendentes não lidas
  // 2. Contatos online agora
  // 3. Alfabético por nome
  lista.sort((a, b) => {
    if (a.naoLidas > 0 && b.naoLidas === 0) return -1;
    if (b.naoLidas > 0 && a.naoLidas === 0) return 1;

    if (a.online && !b.online) return -1;
    if (!a.online && b.online) return 1;

    return a.nome.localeCompare(b.nome);
  });

  return lista;
}

/**
 * Carrega a lista de conversas já realizadas de um usuário/cliente (exclusivo para supervisão ADM).
 * Agrupa todas as mensagens em que targetUserId participou (como remetente ou destinatário)
 * agrupando por interlocutor com última mensagem, data e total de mensagens.
 */
export async function carregarConversasRealizadasDoUsuario(
  targetUserId: string,
): Promise<import("../types").ConversaRealizada[]> {
  // 1. Tenta carregar via API backend
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch(`/api/chat/conversas-usuario?userId=${targetUserId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.conversas)) {
          return json.conversas;
        }
      }
    }
  } catch (e) {
    console.warn("Aviso ao carregar conversas de usuário via API:", e);
  }

  // 2. Fallback via consulta direta no Supabase
  try {
    const { data: msgs, error } = await supabase
      .from("notificacoes_sistema")
      .select("id, remetente_user_id, destinatario_user_id, remetente_nome, mensagem, created_at")
      .eq("tipo", "chat")
      .or(`remetente_user_id.eq.${targetUserId},destinatario_user_id.eq.${targetUserId}`)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error || !msgs) return [];

    const mapa = new Map<string, import("../types").ConversaRealizada>();

    for (const m of msgs) {
      const partnerId =
        m.remetente_user_id === targetUserId ? m.destinatario_user_id : m.remetente_user_id;
      if (!partnerId) continue;

      if (!mapa.has(partnerId)) {
        mapa.set(partnerId, {
          interlocutorId: partnerId,
          interlocutorNome:
            m.remetente_user_id === partnerId ? m.remetente_nome || "Usuário" : "Usuário",
          interlocutorRole: "usuario",
          ultimaMensagem: m.mensagem || "",
          ultimaData: m.created_at || "",
          totalMensagens: 1,
        });
      } else {
        mapa.get(partnerId)!.totalMensagens += 1;
      }
    }

    return Array.from(mapa.values()).sort(
      (a, b) => new Date(b.ultimaData).getTime() - new Date(a.ultimaData).getTime(),
    );
  } catch {
    return [];
  }
}

/**
 * Envia uma mensagem no chat:
 * 1. Grava no banco de dados com tipo 'chat'
 * 2. Propaga via WebSocket Realtime Broadcast para o destinatário receber em milissegundos
 * 3. Dispara Push VAPID direcionado ESTREITAMENTE ao destinatarioId (apenas ele recebe, zero broadcast para outros)
 */
export async function enviarMensagemChat(params: {
  remetenteId: string;
  remetenteNome: string;
  destinatarioId: string;
  mensagem: string;
}): Promise<ChatMensagem | null> {
  const textoLimpo = params.mensagem.trim();
  if (!textoLimpo) return null;

  // REGRA DE SEGURANÇA E ISOLAMENTO: Proibido envio sem destinatário único
  if (!params.destinatarioId || !params.destinatarioId.trim()) {
    console.warn("Tentativa de envio de mensagem sem destinatário.");
    return null;
  }

  try {
    // Dispara via notificacoesBdService (salva em notificacoes_sistema + Realtime broadcast)
    const notifRes = await enviarNotificacaoViaBd({
      destinatarioUserId: params.destinatarioId,
      titulo: `💬 ${params.remetenteNome}`,
      mensagem: textoLimpo,
      tipo: "chat",
      url: `/chat?contato=${params.remetenteId}`,
    });

    const notifId = typeof notifRes === "string" ? notifRes : null;
    const msgId = notifId || `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // ORQUESTRAÇÃO DE 1 TRAÇO vs 2 TRAÇOS (AGUARDAR CONFIRMAÇÃO DE LEITURA):
    // A lógica de atraso agora está unificada no backend (server.ts) que intercepta isChat=true
    // e faz o delay de 2.6s, contornando problemas de restrição RLS (Row Level Security)
    // onde o remetente não conseguia ler o status 'lida' do destinatário.

    const novaMensagem: ChatMensagem = {
      id: msgId,
      remetente_id: params.remetenteId,
      remetente_nome: params.remetenteNome,
      destinatario_id: params.destinatarioId,
      mensagem: textoLimpo,
      lida: false,
      created_at: new Date().toISOString(),
    };

    return novaMensagem;
  } catch (err) {
    console.error("Erro ao enviar mensagem no chat:", err);
    return null;
  }
}

/**
 * Carrega histórico de mensagens entre dois usuários (conversa ponto a ponto ou supervisão ADM)
 */
export async function carregarHistoricoConversa(params: {
  userId?: string;
  contatoId?: string;
  usuarioAId?: string;
  usuarioBId?: string;
  limite?: number;
}): Promise<ChatMensagem[]> {
  const userA = params.usuarioAId || params.userId || "";
  const userB = params.usuarioBId || params.contatoId || "";
  if (!userA || !userB) return [];

  const limite = params.limite || 100;

  // 1. Tenta via API de supervisão do servidor
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch(
        `/api/chat/historico-supervisao?usuarioA=${userA}&usuarioB=${userB}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.mensagens)) {
          return json.mensagens.map((d: any) => ({
            id: d.id,
            remetente_id: d.remetente_user_id || "",
            remetente_nome: d.remetente_nome || "",
            destinatario_id: d.destinatario_user_id || "",
            mensagem: d.mensagem || "",
            lida: !!d.lida,
            created_at: d.created_at || new Date().toISOString(),
          }));
        }
      }
    }
  } catch {
    // Fallback gracioso
  }

  // 2. Fallback direto no Supabase
  try {
    const { data, error } = await supabase
      .from("notificacoes_sistema")
      .select(
        "id, remetente_user_id, destinatario_user_id, remetente_nome, mensagem, lida, created_at",
      )
      .eq("tipo", "chat")
      .in("remetente_user_id", [userA, userB])
      .in("destinatario_user_id", [userA, userB])
      .order("created_at", { ascending: true })
      .limit(limite);

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      remetente_id: d.remetente_user_id || "",
      remetente_nome: d.remetente_nome || "",
      destinatario_id: d.destinatario_user_id || "",
      mensagem: d.mensagem || "",
      lida: !!d.lida,
      created_at: d.created_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn("Erro ao carregar histórico de conversa:", err);
    return [];
  }
}

/**
 * Marca todas as mensagens de um remetente como lidas
 */
export async function marcarMensagensComoLidas(params: {
  destinatarioId: string;
  remetenteId: string;
}): Promise<void> {
  try {
    await supabase
      .from("notificacoes_sistema")
      .update({ lida: true })
      .eq("destinatario_user_id", params.destinatarioId)
      .eq("remetente_user_id", params.remetenteId)
      .eq("tipo", "chat")
      .eq("lida", false);
  } catch (err) {
    console.warn("Erro ao marcar mensagens como lidas:", err);
  }
}

/**
 * Limpa ou marca como lidas notificações de chat órfãs ou de ativação geradas indevidamente
 */
export async function limparNotificacoesChatInvalidas(userId: string): Promise<void> {
  if (!userId) return;
  try {
    // 1. Mensagens onde o próprio usuário foi gravado como remetente e destinatário
    await supabase
      .from("notificacoes_sistema")
      .update({ lida: true })
      .eq("destinatario_user_id", userId)
      .eq("remetente_user_id", userId)
      .eq("tipo", "chat")
      .eq("lida", false);

    // 2. Alertas de ativação que tenham sido gravados com tipo chat
    await supabase
      .from("notificacoes_sistema")
      .update({ lida: true })
      .eq("destinatario_user_id", userId)
      .ilike("titulo", "%Notificações Ativadas%")
      .eq("lida", false);
  } catch {
    // Silencia
  }
}

/**
 * Conta total de mensagens não lidas para o usuário (para badge no header)
 * REGRA CANÔNICA: Mensagens enviadas pelo próprio usuário NUNCA são computadas como não lidas.
 */
export async function contarMensagensNaoLidas(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const { count, error } = await supabase
      .from("notificacoes_sistema")
      .select("id", { count: "exact", head: true })
      .eq("destinatario_user_id", userId)
      .neq("remetente_user_id", userId)
      .eq("tipo", "chat")
      .not("titulo", "ilike", "%Notificações Ativadas%")
      .eq("lida", false);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * Carrega contagem de mensagens não lidas agrupada por remetente
 * REGRA CANÔNICA: Mensagens enviadas pelo próprio usuário NUNCA entram no mapa de não lidas.
 */
export async function carregarContagemNaoLidasPorRemetente(
  userId: string,
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!userId) return mapa;
  try {
    const { data, error } = await supabase
      .from("notificacoes_sistema")
      .select("remetente_user_id, titulo")
      .eq("destinatario_user_id", userId)
      .neq("remetente_user_id", userId)
      .eq("tipo", "chat")
      .not("titulo", "ilike", "%Notificações Ativadas%")
      .eq("lida", false);

    if (error || !data) return mapa;

    for (const item of data) {
      if (item.remetente_user_id && item.remetente_user_id !== userId) {
        mapa.set(item.remetente_user_id, (mapa.get(item.remetente_user_id) || 0) + 1);
      }
    }
  } catch {
    // Retorna mapa vazio em caso de erro silencioso
  }
  return mapa;
}
