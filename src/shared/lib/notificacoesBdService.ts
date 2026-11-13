// notificacoesBdService.ts — SIGO Guardião
// Sincronização e Disparo de Notificações em Tempo Real entre Dispositivos via Banco de Dados (Supabase Realtime)

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ehAlertaRestritoEquipeTecnica,
  normalizarTipoAlerta,
  obterItemCatalogoAlerta,
  resolverRegraEntregaAlerta,
  type RegraEntregaResolvida,
} from "@/features/monitor-gps/constants/alertasCatalogo";

export interface NotificacaoSistemaRegistro {
  id?: string;
  destinatario_user_id?: string | null;
  destinatario_cliente_id?: string | null;
  remetente_user_id?: string | null;
  remetente_nome?: string;
  dispositivo_origem?: string;
  titulo: string;
  mensagem: string;
  tipo?: string;
  url?: string;
  placa?: string;
  lida?: boolean;
  created_at?: string;
}

const notificacoesProcessadas = new Map<string, number>();
const CANAL_NOTIFICACOES_SISTEMA = "sigo_notificacoes_realtime";
const CACHE_REGRAS_ALERTA = new Map<string, { ts: number; regra: RegraEntregaResolvida }>();

if (typeof window !== "undefined") {
  window.addEventListener("hunter_configuracao_alertas_alterada", () =>
    CACHE_REGRAS_ALERTA.clear(),
  );
  window.addEventListener("hunter_configuracao_alertas_cliente_alterada", () =>
    CACHE_REGRAS_ALERTA.clear(),
  );
  window.addEventListener("hunter_configuracao_alertas_equipe_alterada", () =>
    CACHE_REGRAS_ALERTA.clear(),
  );
}

async function consultarRegraEntregaEquipeLocal(params: {
  tipo?: string | null;
  userId?: string | null;
}): Promise<RegraEntregaResolvida | null> {
  try {
    if (!params.tipo || !params.userId || !supabase || typeof supabase.from !== "function") {
      return null;
    }
    const tipoNorm = normalizarTipoAlerta(params.tipo);
    const itemCat = obterItemCatalogoAlerta(tipoNorm);
    if (!itemCat) return null;

    const chaveCache = `eq:${tipoNorm}:${params.userId}`;
    const cached = CACHE_REGRAS_ALERTA.get(chaveCache);
    if (cached && Date.now() - cached.ts < 30000) {
      return cached.regra;
    }

    const { data: cfg } = await supabase
      .from("notificacoes_configuracoes")
      .select("alertas_ativos")
      .eq("user_id", params.userId)
      .is("veiculo_id", null)
      .maybeSingle();

    const ativos = (cfg?.alertas_ativos as Record<string, any>) || null;
    if (!ativos) return null;

    const ops = ativos.alertas_operacionais || null;
    const eqp = ativos.alertas_equipe || null;
    const contatos = Array.isArray(ativos.contatos_alertas) ? ativos.contatos_alertas : null;

    if (itemCat.categoria === "conta" || itemCat.chave === "corte_nao_autorizado_sms") {
      if (!ops || (!ops[itemCat.chave] && !ops[tipoNorm])) return null;
      const resolvida = resolverRegraEntregaAlerta({
        tipo: tipoNorm,
        alertasOperacionais: ops,
        canaisGlobais:
          itemCat.chave === "corte_nao_autorizado_sms" && ops.corte_nao_autorizado_sms
            ? { por_alerta: { corte_nao_autorizado_sms: ops.corte_nao_autorizado_sms } }
            : null,
        contatosConta: contatos,
      });
      CACHE_REGRAS_ALERTA.set(chaveCache, { ts: Date.now(), regra: resolvida });
      return resolvida;
    }

    if (eqp && (eqp[itemCat.chave] || eqp[tipoNorm])) {
      const resolvida = resolverRegraEntregaAlerta({
        tipo: tipoNorm,
        canaisGlobais: { por_alerta: eqp },
        contatosConta: contatos,
      });
      CACHE_REGRAS_ALERTA.set(chaveCache, { ts: Date.now(), regra: resolvida });
      return resolvida;
    }

    return null;
  } catch {
    return null;
  }
}

async function consultarRegraEntregaClienteLocal(params: {
  tipo?: string | null;
  placa?: string | null;
  clienteId?: string | null;
  userId?: string | null;
}): Promise<RegraEntregaResolvida | null> {
  try {
    if (!params.tipo || !supabase || typeof supabase.from !== "function") return null;
    const tipoNorm = normalizarTipoAlerta(params.tipo);
    const itemCat = obterItemCatalogoAlerta(tipoNorm);
    if (!itemCat) return null;

    const chaveCache = `${tipoNorm}:${params.placa || ""}:${params.clienteId || ""}:${params.userId || ""}`;
    const cached = CACHE_REGRAS_ALERTA.get(chaveCache);
    if (cached && Date.now() - cached.ts < 30000) {
      return cached.regra;
    }

    if (itemCat.categoria === "veiculo" && params.placa) {
      const { data: v } = await supabase
        .from("veiculos")
        .select("id, cliente_id")
        .eq("placa", params.placa)
        .maybeSingle();

      if (v?.id) {
        const { data: reg } = await supabase
          .from("regras_veiculo")
          .select("alertas_ativos, canais_alertas, whatsapp_destinatarios")
          .eq("veiculo_id", v.id)
          .maybeSingle();

        if (reg) {
          const resolvida = resolverRegraEntregaAlerta({
            tipo: tipoNorm,
            alertasAtivos: (reg as any).alertas_ativos || null,
            canaisGlobais: (reg as any).canais_alertas || null,
            contatosVeiculo: (reg as any).whatsapp_destinatarios || null,
          });
          CACHE_REGRAS_ALERTA.set(chaveCache, { ts: Date.now(), regra: resolvida });
          return resolvida;
        }
      }
    }

    let cId = params.clienteId || null;
    if (!cId && params.userId) {
      const { data: cliByUid } = await supabase
        .from("clientes")
        .select("id")
        .eq("user_id", params.userId)
        .maybeSingle();
      if (cliByUid?.id) cId = cliByUid.id;
    }

    if (!cId) return null;

    let cliData: any = null;
    const resCli = await supabase
      .from("clientes")
      .select(
        "notificar_nf_pendente, canais_notificacao_nf, alertas_operacionais, contatos_alertas",
      )
      .eq("id", cId)
      .maybeSingle();

    if (!resCli.error && resCli.data) {
      cliData = resCli.data;
    } else if (resCli.error) {
      const resFallback = await supabase
        .from("clientes")
        .select("notificar_nf_pendente, canais_notificacao_nf")
        .eq("id", cId)
        .maybeSingle();
      cliData = resFallback.data || null;
    }

    if (!cliData) return null;

    const resolvida = resolverRegraEntregaAlerta({
      tipo: tipoNorm,
      alertasOperacionais: cliData.alertas_operacionais || null,
      notificarNfPendente: cliData.notificar_nf_pendente,
      canaisNotificacaoNf: cliData.canais_notificacao_nf,
      contatosConta: Array.isArray(cliData.contatos_alertas) ? cliData.contatos_alertas : null,
    });
    CACHE_REGRAS_ALERTA.set(chaveCache, { ts: Date.now(), regra: resolvida });
    return resolvida;
  } catch {
    return null;
  }
}

/**
 * Limpa o cache de deduplicação (útil para suíte de testes)
 */
export function limparCacheNotificacoesProcessadas(): void {
  notificacoesProcessadas.clear();
}

/**
 * Deduplica notificações em tempo real.
 * Garante que mensagens enviadas via Broadcast e confirmadas via Postgres Changes (ou vice-versa)
 * sejam processadas e exibidas EXATAMENTE UMA VEZ no dispositivo.
 */
export function foiNotificacaoProcessada(notif: NotificacaoSistemaRegistro): boolean {
  if (!notif) return true;
  const agora = Date.now();
  const TTL_MS = 20000; // 20 segundos

  // Limpeza periódica de registros antigos (> 20s)
  for (const [chave, tempo] of notificacoesProcessadas.entries()) {
    if (agora - tempo > TTL_MS) {
      notificacoesProcessadas.delete(chave);
    }
  }

  // 1. Chave por ID explícito (com e sem prefixo canônico)
  if (notif.id) {
    const rawId = String(notif.id);
    const idNormalizado = rawId.startsWith("sigo-notif-") ? rawId : `sigo-notif-${rawId}`;
    if (
      notificacoesProcessadas.has(`id:${rawId}`) ||
      notificacoesProcessadas.has(`id:${idNormalizado}`)
    ) {
      return true;
    }
  }

  // 2. Chave Semântica (destinatário + tipo + mensagem)
  // Desacoplada do remetente_user_id porque no broadcast vem o id do operador logado,
  // enquanto no insert do banco/trigger pode vir id de sistema ou null.
  const destinatario = notif.destinatario_user_id || notif.destinatario_cliente_id || "todos";
  const tipo = notif.tipo || "alerta";
  const mensagem = (notif.mensagem || "").trim();
  const chaveSemantica = `sem:${destinatario}:${tipo}:${mensagem}`;

  if (notificacoesProcessadas.has(chaveSemantica)) {
    return true;
  }
  if (
    notif.destinatario_user_id &&
    notificacoesProcessadas.has(`sem:${notif.destinatario_user_id}:${tipo}:${mensagem}`)
  ) {
    return true;
  }
  if (
    notif.destinatario_cliente_id &&
    notificacoesProcessadas.has(`sem:${notif.destinatario_cliente_id}:${tipo}:${mensagem}`)
  ) {
    return true;
  }

  // 3. Chave Semântica por Veículo / Placa (destinatário + tipo + placa)
  // Blindagem anti-duplicação: previne disparos concorrentes onde o texto varia ligeiramente
  // entre o trigger do PostgreSQL e o serviço frontend para a mesma placa/evento
  if (notif.placa && (tipo === "instalacao" || tipo === "agendamento")) {
    const placaLimpa = notif.placa
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const chavePlaca = `placa:${destinatario}:${tipo}:${placaLimpa}`;
    if (notificacoesProcessadas.has(chavePlaca)) {
      return true;
    }
    if (
      notif.destinatario_user_id &&
      notificacoesProcessadas.has(`placa:${notif.destinatario_user_id}:${tipo}:${placaLimpa}`)
    ) {
      return true;
    }
    if (
      notif.destinatario_cliente_id &&
      notificacoesProcessadas.has(`placa:${notif.destinatario_cliente_id}:${tipo}:${placaLimpa}`)
    ) {
      return true;
    }
  }

  // Registra chaves semânticas
  notificacoesProcessadas.set(chaveSemantica, agora);
  if (notif.destinatario_user_id) {
    notificacoesProcessadas.set(`sem:${notif.destinatario_user_id}:${tipo}:${mensagem}`, agora);
  }
  if (notif.destinatario_cliente_id) {
    notificacoesProcessadas.set(`sem:${notif.destinatario_cliente_id}:${tipo}:${mensagem}`, agora);
  }
  if (notif.placa && (tipo === "instalacao" || tipo === "agendamento")) {
    const placaLimpa = notif.placa
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    notificacoesProcessadas.set(`placa:${destinatario}:${tipo}:${placaLimpa}`, agora);
    if (notif.destinatario_user_id) {
      notificacoesProcessadas.set(
        `placa:${notif.destinatario_user_id}:${tipo}:${placaLimpa}`,
        agora,
      );
    }
    if (notif.destinatario_cliente_id) {
      notificacoesProcessadas.set(
        `placa:${notif.destinatario_cliente_id}:${tipo}:${placaLimpa}`,
        agora,
      );
    }
  }
  if (notif.id) {
    const rawId = String(notif.id);
    const idNormalizado = rawId.startsWith("sigo-notif-") ? rawId : `sigo-notif-${rawId}`;
    notificacoesProcessadas.set(`id:${rawId}`, agora);
    notificacoesProcessadas.set(`id:${idNormalizado}`, agora);
  }

  return false;
}

/**
 * Verifica se a interface do chat está aberta e visível na tela
 */
export function isChatVisivelNaTela(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  // Se a aba estiver oculta ou tela desligada, o chat não está em visualização ativa direta
  if (document.visibilityState === "hidden") return false;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;

  const pathname = window.location.pathname || "";
  const estaNaRotaChat = pathname.startsWith("/chat");
  const flagChatAberto = Boolean(
    (window as unknown as { __sigoChatAberto?: boolean }).__sigoChatAberto,
  );

  return estaNaRotaChat || flagChatAberto;
}

/**
 * Retorna o ID do usuário/contato com quem o chat está atualmente em conversa aberta
 */
export function getChatContatoAtivo(): string | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { __sigoChatContatoAtivo?: string | null }).__sigoChatContatoAtivo || null
  );
}

/**
 * Emite um bipe de alerta tático via Web Audio API (funciona em qualquer navegador sem depender de arquivos externos)
 */
export function tocarAlertaSonoroTatico(tipo: string = "alerta") {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = tipo === "acidente" || tipo === "socorro" ? "sawtooth" : "sine";

    const freqInicial = tipo === "acidente" || tipo === "socorro" ? 900 : 750;
    osc.frequency.setValueAtTime(freqInicial, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      tipo === "acidente" ? 400 : 950,
      ctx.currentTime + 0.35,
    );

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Silencia se o navegador bloquear autoplay de áudio
  }
}

/**
 * Salva ou atualiza a inscrição Web Push do dispositivo diretamente no banco de dados (Supabase)
 */
export async function salvarInscricaoPushNoBd(
  sub: PushSubscription,
  clienteId?: string | null,
): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return false;

    const json = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = json.keys?.p256dh || "";
    const authKey = json.keys?.auth || "";
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

    const { error } = await supabase.from("user_push_subscriptions").upsert(
      {
        user_id: session.user.id,
        cliente_id: clienteId || null,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.warn("Falha ao salvar push subscription no banco de dados:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn("Erro ao registrar push subscription no Supabase:", err);
    return false;
  }
}

/**
 * Envia uma notificação gravando no Banco de Dados e propagando via Realtime WebSocket Broadcast.
 * Isso garante que TODOS os outros aparelhos conectados recebam instantaneamente em milissegundos!
 */
export async function enviarNotificacaoViaBd(params: {
  destinatarioUserId?: string | null;
  destinatarioClienteId?: string | null;
  titulo: string;
  mensagem: string;
  tipo?: string;
  url?: string;
  placa?: string;
}): Promise<string | boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /android|iphone|ipad|ipod/i.test(userAgent);
    const dispositivoNome = isMobile ? "Dispositivo Móvel" : "Computador / Desktop";
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // REGRA DE SEGURANÇA: Se nenhum destinatário foi especificado, a notificação NÃO deve ser enviada.
    // Isso impede que notificações sem alvo sejam propagadas para todos os usuários.
    const destUserId = params.destinatarioUserId || null;
    const destClienteId = params.destinatarioClienteId || null;

    if (!destUserId && !destClienteId) {
      console.warn(
        "Notificação descartada: nenhum destinatário (destinatarioUserId ou destinatarioClienteId) informado.",
      );
      return false;
    }

    const regraDestinatario = await consultarRegraEntregaClienteLocal({
      tipo: params.tipo,
      placa: params.placa,
      clienteId: destClienteId,
      userId: destUserId,
    });

    if (
      regraDestinatario &&
      (!regraDestinatario.ativo ||
        (!regraDestinatario.app && !regraDestinatario.whatsapp && !regraDestinatario.ligacao))
    ) {
      return false;
    }

    const registroNotif: NotificacaoSistemaRegistro = {
      id: notifId,
      destinatario_user_id: destUserId,
      destinatario_cliente_id: destClienteId,
      remetente_user_id: userId || null,
      remetente_nome: session?.user?.email?.split("@")[0] || "SIGO Guardião",
      dispositivo_origem: dispositivoNome,
      titulo: params.titulo,
      mensagem: params.mensagem,
      tipo: params.tipo || "alerta",
      url: params.url || "/monitor-gps",
      placa: params.placa || null,
      created_at: new Date().toISOString(),
    };

    // 1. DISPARO INSTANTÂNEO VIA WEBSOCKET REALTIME BROADCAST
    try {
      const canalEnvio = supabase.channel(CANAL_NOTIFICACOES_SISTEMA);
      const enviarMsg = () => {
        try {
          canalEnvio
            .send({
              type: "broadcast",
              event: "notificacao_inter_dispositivos",
              payload: registroNotif,
            })
            .catch(() => {});
        } catch {
          // Ignora falha de envio broadcast
        }
      };

      if (canalEnvio.state === "joined") {
        enviarMsg();
      } else {
        canalEnvio.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            enviarMsg();
          }
        });
      }
    } catch (errBroadcast) {
      console.warn("Aviso: Falha ao enviar broadcast direto:", errBroadcast);
    }

    let idDefinitivo = notifId;

    // 2. PERSISTÊNCIA NO BANCO DE DADOS (Supabase RPC ou Tabela)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("enviar_notificacao_sistema", {
        p_destinatario_user_id: destUserId,
        p_destinatario_cliente_id: destClienteId,
        p_titulo: params.titulo,
        p_mensagem: params.mensagem,
        p_tipo: params.tipo || "alerta",
        p_url: params.url || "/monitor-gps",
        p_placa: params.placa || null,
        p_dispositivo_origem: dispositivoNome,
      });

      if (!rpcError && rpcData?.success && rpcData.notificacao_id) {
        idDefinitivo = rpcData.notificacao_id;
      } else if (rpcError || !rpcData?.success) {
        // Fallback: inserção direta na tabela notificacoes_sistema
        const { data: insertData } = await supabase
          .from("notificacoes_sistema")
          .insert({
            destinatario_user_id: destUserId,
            destinatario_cliente_id: destClienteId,
            remetente_user_id: userId || null,
            remetente_nome: session?.user?.email?.split("@")[0] || "SIGO Guardião",
            dispositivo_origem: dispositivoNome,
            titulo: params.titulo,
            mensagem: params.mensagem,
            tipo: params.tipo || "alerta",
            url: params.url || "/monitor-gps",
            placa: params.placa || null,
          })
          .select("id")
          .single();

        if (insertData?.id) {
          idDefinitivo = insertData.id;
        }
      }
    } catch {
      // Silencia para não interromper a aplicação
    }

    // 3. Disparo Push VAPID Nativo do Servidor (acorda aparelhos móveis em segundo plano ou tela desligada)
    // O backend (server.ts) irá interceptar `isChat=true` e aguardar 2.6s para checar `lida` antes de disparar.
    try {
      const tagUniforme = String(idDefinitivo).startsWith("sigo-notif-")
        ? String(idDefinitivo)
        : `sigo-notif-${idDefinitivo}`;

      // Fire and forget - não bloqueamos o cliente com await para disparo push nativo e WhatsApp centralizado
      fetch("/api/push/disparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatarioUserId: destUserId,
          destinatarioClienteId: destClienteId,
          titulo: params.placa ? `${params.titulo} — ${params.placa}` : params.titulo,
          mensagem: params.mensagem,
          url: params.url || "/monitor-gps",
          tag: tagUniforme,
          notificacaoId: idDefinitivo,
          isChat: params.tipo === "chat",
          tipo: params.tipo || "alerta",
          placa: params.placa || null,
        }),
      }).catch(() => {});
    } catch {
      // Ignora falha de disparo push nativo
    }

    return idDefinitivo;
  } catch (err) {
    console.warn("Aviso ao emitir notificação no banco de dados:", err);
    return false;
  }
}

let ouvinteConfigurado = false;
let canalAtivo: ReturnType<typeof supabase.channel> | null = null;
let dadosUsuarioAtual: {
  userId?: string | null;
  clienteId?: string | null;
  isAdmin?: boolean;
} = {};

/**
 * Reseta o estado do ouvinte para permitir reconexão
 * (usado ao retornar do segundo plano ou ao detectar WebSocket fechado)
 */
export function resetarOuvinteNotificacoes(): void {
  ouvinteConfigurado = false;
  if (canalAtivo) {
    try {
      supabase.removeChannel(canalAtivo);
    } catch {
      // Ignora erro ao remover canal
    }
    canalAtivo = null;
  }
}

/**
 * Inicializa a escuta em tempo real (Supabase Realtime WebSockets) da tabela de notificações do BD.
 * Quando QUALQUER dispositivo (ou o servidor) insere uma notificação no BD ou dispara via broadcast,
 * TODOS os outros aparelhos conectados recebem instantaneamente!
 */
export function inicializarOuvinteNotificacoesBd(
  currentUserId?: string | null,
  currentClienteId?: string | null,
  isAdmin?: boolean,
) {
  if (typeof window === "undefined" || !supabase) return () => {};

  dadosUsuarioAtual = {
    userId: currentUserId,
    clienteId: currentClienteId,
    isAdmin,
  };

  if (ouvinteConfigurado) {
    return () => {};
  }

  try {
    const canal = supabase.channel(CANAL_NOTIFICACOES_SISTEMA, {
      config: {
        broadcast: { self: false },
      },
    });

    const processarRecebimentoNotificacao = async (notif: NotificacaoSistemaRegistro) => {
      try {
        if (!notif) return;

        // Deduplicação semântica e por ID para impedir notificações repetidas
        // (Broadcast e Postgres Changes chegam simultaneamente)
        if (foiNotificacaoProcessada(notif)) return;

        const uId = dadosUsuarioAtual.userId;
        const cId = dadosUsuarioAtual.clienteId;
        const ehAdmin = dadosUsuarioAtual.isAdmin;

        // REGRA DE SEGURANÇA: Notificação sem destinatário definido só é entregue para Administradores (alertas de sistema / relatórios)
        if (!notif.destinatario_user_id && !notif.destinatario_cliente_id && !ehAdmin) return;

        // REGRA DE SEGURANÇA: O remetente NUNCA recebe sua própria notificação (evita eco)
        if (uId && notif.remetente_user_id === uId) return;

        // REGRA DE SIGILO OPERACIONAL: Alertas internos de defesa técnica (ex.: sabotagem via SMS)
        // nunca são entregues em sessão de cliente, motorista, auditor ou emulação de cliente.
        if (!ehAdmin && ehAlertaRestritoEquipeTecnica(notif.tipo)) return;

        // 1. Filtragem estrita: notificação é direcionada ao destinatário especificado ou a administradores se for alerta operacional
        const ehDestinatarioDirecto =
          (uId && notif.destinatario_user_id === uId) ||
          (cId && notif.destinatario_cliente_id === cId) ||
          (ehAdmin && notif.tipo !== "chat");

        if (!ehDestinatarioDirecto) return;

        // Evita duplicidade N-vezes no navegador de cada operador/adm quando o alerta técnico foi endereçado individualmente a cada membro da equipe
        if (
          ehAdmin &&
          !notif.destinatario_cliente_id &&
          notif.destinatario_user_id &&
          uId &&
          notif.destinatario_user_id !== uId &&
          ehAlertaRestritoEquipeTecnica(notif.tipo)
        ) {
          return;
        }

        const ehChat = notif.tipo === "chat";
        const contatoAtivo = getChatContatoAtivo();
        const chatVisivel = isChatVisivelNaTela();

        // REGRA DE RECEBIDO VS NÃO RECEBIDO (1 TRAÇO vs 2 TRAÇOS):
        // Se a notificação for de chat e a tela do chat estiver aberta, visível, com foco na janela
        // e especificamente na conversa com o remetente, o usuário está olhando a mensagem ao vivo (ela será marcada como lida / 2 traços).
        // CASO CONTRÁRIO (tela bloqueada, minimizado, outro app, aba em segundo plano ou em outra conversa/parte do sistema):
        // a mensagem NÃO foi vista/lida (permanece com 1 traço), logo DEVE MANDAR a notificação exatamente da mesma forma dos testes:
        // alerta sonoro tático, vibração de hardware, toast e notificação nativa do SO via Service Worker!
        const estaVendoConversa =
          ehChat &&
          chatVisivel &&
          Boolean(contatoAtivo && notif.remetente_user_id === contatoAtivo);

        if (estaVendoConversa) {
          return;
        }

        // Respeita a preferência App configurada pelo usuário cliente ou membro da equipe para o tipo recebido
        if (!ehAdmin) {
          const regraRecebimento = await consultarRegraEntregaClienteLocal({
            tipo: notif.tipo,
            placa: notif.placa || null,
            clienteId: notif.destinatario_cliente_id || cId || null,
            userId: notif.destinatario_user_id || uId || null,
          });
          if (regraRecebimento && (!regraRecebimento.ativo || !regraRecebimento.app)) {
            return;
          }
        } else if (uId) {
          const regraEquipe = await consultarRegraEntregaEquipeLocal({
            tipo: notif.tipo,
            userId: uId,
          });
          if (regraEquipe && (!regraEquipe.ativo || !regraEquipe.app)) {
            return;
          }
        }

        // Disparo de evento customizado para atualização instantânea reativa de telas e módulos
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("hunter:nova_notificacao", { detail: notif }));
          if (
            notif.tipo === "instalacao" ||
            notif.tipo === "agendamento" ||
            notif.url?.includes("instalacao")
          ) {
            window.dispatchEvent(new CustomEvent("hunter:atualizar_demandas", { detail: notif }));
          }
        }

        // 2. Alerta Sonoro Tático e Vibração no Aparelho que Recebeu
        tocarAlertaSonoroTatico(notif.tipo || "alerta");
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([300, 150, 300, 150, 300]);
        }

        // 3. Notificação Visual na Tela via Toast Sonner (em outras partes do sistema)
        const tituloFormatado = notif.placa ? `${notif.titulo} — ${notif.placa}` : notif.titulo;

        toast(tituloFormatado, {
          description: notif.mensagem,
          duration: 8000,
          action: {
            label: "Visualizar",
            onClick: () => {
              if (notif.url) {
                window.location.href = notif.url;
              }
            },
          },
        });

        // 4. Notificação Nativa do Sistema Operacional via Service Worker
        // Se a janela estiver ativa e visível em primeiro plano com foco, o usuário já está visualizando
        // o toast do Sonner e ouvindo o áudio tático. Evitamos poluir o SO com um banner duplicado.
        const estaEmPrimeiroPlano =
          typeof document !== "undefined" &&
          document.visibilityState === "visible" &&
          (typeof document.hasFocus === "function" ? document.hasFocus() : true);

        if (
          !estaEmPrimeiroPlano &&
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            if ("serviceWorker" in navigator) {
              const reg = await navigator.serviceWorker.ready;
              if (reg && "showNotification" in reg) {
                const rawId = notif.id || `${Date.now()}`;
                const tagUniforme = String(rawId).startsWith("sigo-notif-")
                  ? String(rawId)
                  : `sigo-notif-${rawId}`;

                await (reg as any).showNotification(`🚨 ${tituloFormatado}`, {
                  body: notif.mensagem,
                  icon: "/logo.png",
                  badge: "/favicon.png",
                  tag: tagUniforme,
                  renotify: true,
                  requireInteraction: true,
                  vibrate: [300, 150, 300, 150, 300],
                  data: {
                    url: notif.url || (ehChat ? "/chat" : "/monitor-gps"),
                    notificacaoId: notif.id,
                  },
                });
              }
            }
          } catch (err) {
            console.warn("Falha ao invocar showNotification nativo no Service Worker:", err);
          }
        }
      } catch (errProc) {
        console.warn("Erro ao processar recebimento de notificação:", errProc);
      }
    };

    // Escuta 1: Canal Realtime Broadcast Direto (Instantâneo entre celulares e PCs)
    canal.on(
      "broadcast",
      { event: "notificacao_inter_dispositivos" },
      (payload: { payload: NotificacaoSistemaRegistro }) => {
        processarRecebimentoNotificacao(payload.payload);
      },
    );

    // Escuta 2: Postgres Changes da Tabela notificacoes_sistema no Banco de Dados
    try {
      canal.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacoes_sistema",
        },
        (payload) => {
          processarRecebimentoNotificacao(payload.new as NotificacaoSistemaRegistro);
        },
      );
    } catch {
      // Ignora falha na subscricao de mudancas da tabela
    }

    canal.subscribe();
    canalAtivo = canal;
    ouvinteConfigurado = true;

    return () => {};
  } catch (errSetup) {
    console.warn("Falha ao inicializar canal de escuta de notificações:", errSetup);
    return () => {};
  }
}
