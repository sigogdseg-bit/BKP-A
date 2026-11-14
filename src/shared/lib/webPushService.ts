import { salvarInscricaoPushNoBd, enviarNotificacaoViaBd } from "./notificacoesBdService";
import { supabase } from "@/integrations/supabase/client";

// webPushService.ts — GD Rastreamento
// Gerenciamento de Web Push API nativa (APNs / FCM) e Service Worker em Segundo Plano

export const VAPID_PUBLIC_KEY =
  "BJ_KK66CUDXUf5V3-i-Z7NWgjk4Estvz-ClwYsZey3IC5YjkyVG01ozLYIn_6uJa3RqlfznXEQD1WMWrTGNMn5U";

export interface WebPushStatus {
  suportado: boolean;
  permissao: NotificationPermission;
  serviceWorkerAtivo: boolean;
  isIos: boolean;
  isStandalone: boolean;
}

/**
 * Converte chave base64url do VAPID para Uint8Array exigido pelo PushManager
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Verifica se o ambiente suporta Service Worker e Notificações Push
 */
export function verificarSuporteWebPush(): WebPushStatus {
  if (typeof window === "undefined") {
    return {
      suportado: false,
      permissao: "default",
      serviceWorkerAtivo: false,
      isIos: false,
      isStandalone: false,
    };
  }

  const suportado = "serviceWorker" in navigator && "Notification" in window;
  const permissao = "Notification" in window ? Notification.permission : "denied";

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  return {
    suportado,
    permissao,
    serviceWorkerAtivo: !!navigator.serviceWorker?.controller,
    isIos,
    isStandalone,
  };
}

/**
 * Registra o Service Worker oficial do GD Rastreamento
 */
export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    return reg;
  } catch (err) {
    console.warn("Falha ao registrar Service Worker do GD Rastreamento:", err);
    return null;
  }
}

/**
 * Garante que a inscrição Push VAPID está ativa SILENCIOSAMENTE.
 * Chamado no boot do app se a permissão já foi concedida — sem pedir ao usuário novamente.
 * É a função-chave para garantir recebimento de notificações em segundo plano.
 */
export async function garantirInscricaoPushAtiva(clienteId?: string | null): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!("pushManager" in reg)) return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Permissão já concedida — re-inscreve sem pedir ao usuário
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      });
    }

    if (sub) {
      // Atualiza o endpoint no banco (pode ter mudado após browser update)
      await salvarInscricaoPushNoBd(sub, clienteId);

      // Obtém userId da sessão ativa para vincular a inscrição no servidor
      let userId: string | null = null;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      } catch {
        // Silencia
      }

      try {
        await fetch("/api/push/inscrever", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userAgent: navigator.userAgent || "",
            userId,
            clienteId: clienteId || null,
          }),
        });
      } catch {
        // Silencia
      }
    }
  } catch {
    // Silencia — não interrompe o boot do app
  }
}

/**
 * Inscreve o dispositivo no PushManager do navegador e envia inscrição ao servidor e banco de dados
 */
export async function inscreverDispositivoWebPush(
  reg: ServiceWorkerRegistration,
  clienteId?: string | null,
): Promise<PushSubscription | null> {
  if (!("pushManager" in reg)) {
    return null;
  }

  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
      });
    }

    if (sub) {
      // 1. Salva a inscrição diretamente no Banco de Dados (Supabase)
      await salvarInscricaoPushNoBd(sub, clienteId);

      // 2. Obtém userId para vincular inscrição no servidor
      let userId: string | null = null;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      } catch {
        // Silencia
      }

      // 3. Registra na API local do servidor como fallback garantido com serviceRoleKey
      try {
        await fetch("/api/push/inscrever", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
            userId,
            clienteId: clienteId || null,
          }),
        });
      } catch {
        // Silencia
      }
    }

    return sub;
  } catch (err) {
    console.warn("Falha ao criar PushSubscription nativo:", err);
    return null;
  }
}

/**
 * Solicita autorização explícita do usuário para receber notificações
 * REGRA APPLE/IOS: Deve ser acionado exclusivamente por um clique direto do usuário
 */
export async function solicitarPermissaoNotificacao(
  clienteId?: string | null,
): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  try {
    const permissao = await Notification.requestPermission();
    if (permissao === "granted") {
      await registrarServiceWorker();
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await inscreverDispositivoWebPush(reg, clienteId);
      }
    }
    return permissao;
  } catch (err) {
    console.error("Erro ao solicitar permissão de notificações:", err);
    return "denied";
  }
}

/**
 * Dispara uma notificação nativa no dispositivo móvel ou desktop via ServiceWorkerRegistration
 * NUNCA utiliza new Notification() diretamente para não quebrar no Android e iOS
 */
export async function dispararNotificacaoNativaAlerta(alerta: {
  id?: string;
  titulo: string;
  mensagem: string;
  tipo?: string;
  placa?: string;
  url?: string;
  destinatarioClienteId?: string | null;
  destinatarioUserId?: string | null;
}): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  // REGRA DE SEGURANÇA: Não disparar sem destinatário definido
  if (!alerta.destinatarioClienteId && !alerta.destinatarioUserId) {
    console.warn("dispararNotificacaoNativaAlerta: Descartada por falta de destinatário.");
    return false;
  }

  try {
    if (!("serviceWorker" in navigator)) return false;
    await registrarServiceWorker();
    const reg = await navigator.serviceWorker.ready;

    if (reg && "showNotification" in reg) {
      const tituloFinal = alerta.placa
        ? `🚨 ${alerta.titulo} — ${alerta.placa}`
        : `🚨 ${alerta.titulo}`;

      await (reg as any).showNotification(tituloFinal, {
        body: alerta.mensagem,
        icon: "/logo.png",
        badge: "/favicon.png",
        tag: alerta.id ? `sigo-alerta-${alerta.id}` : `sigo-alerta-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [300, 150, 300, 150, 300],
        data: {
          url: alerta.url || "/monitor-gps",
          dataHora: new Date().toISOString(),
        },
        actions: [
          { action: "ver_mapa", title: "Ver no Mapa" },
          { action: "fechar", title: "Dispensar" },
        ],
      });

      // Grava no banco de dados para propagar em tempo real SOMENTE para o destinatário específico
      // (enviarNotificacaoViaBd já orquestra WebSocket Broadcast e Push VAPID com precisão)
      await enviarNotificacaoViaBd({
        destinatarioClienteId: alerta.destinatarioClienteId,
        destinatarioUserId: alerta.destinatarioUserId,
        titulo: alerta.titulo,
        mensagem: alerta.mensagem,
        tipo: alerta.tipo || "alerta",
        url: alerta.url || "/monitor-gps",
        placa: alerta.placa,
      });

      return true;
    }

    return false;
  } catch (err) {
    console.error("Erro ao exibir notificação nativa no dispositivo:", err);
    return false;
  }
}

/**
 * Dispara uma notificação de teste local e remota comprovando que o dispositivo móvel recebe alertas
 */
export async function dispararNotificacaoTeste(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  // 1. Verifica se a API de Notificação está disponível
  if (!("Notification" in window)) {
    console.warn("Notification API não suportada neste ambiente.");
    return false;
  }

  // 2. Se a permissão não foi concedida, solicita agora
  if (Notification.permission !== "granted") {
    const perm = await solicitarPermissaoNotificacao();
    if (perm !== "granted") return false;
  }

  try {
    // 3. Garante que o Service Worker está registrado e 100% ativo (reg.ready)
    await registrarServiceWorker();
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;

    // 4. Inscreve no push se ainda não estiver
    await inscreverDispositivoWebPush(reg);

    // 5. Exibe a notificação diretamente pelo ServiceWorkerRegistration (Compatível com Android e iOS PWA)
    await (reg as any).showNotification("🚨 GD Rastreamento — Teste de Notificação Nativa", {
      body: "Notificação em segundo plano ativada com sucesso no seu dispositivo móvel!",
      icon: "/logo.png",
      badge: "/favicon.png",
      tag: `sigo-teste-${Date.now()}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 150, 300, 150, 300],
      data: { url: "/monitor-gps" },
      actions: [
        { action: "ver_mapa", title: "Ver no Mapa" },
        { action: "fechar", title: "Dispensar" },
      ],
    });

    // 6. Obtém o userId da sessão atual para enviar a notificação de teste SOMENTE para si mesmo
    let userId: string | null = null;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      userId = session?.user?.id || null;
    } catch {
      // Silencia
    }

    if (userId) {
      // Grava no Banco de Dados para propagação Realtime SOMENTE para os demais dispositivos do próprio usuário
      await enviarNotificacaoViaBd({
        destinatarioUserId: userId,
        titulo: "Teste de Notificação entre Dispositivos",
        mensagem:
          "Dispositivo conectado e recebendo notificações em tempo real via Banco de Dados!",
        tipo: "teste",
        url: "/monitor-gps",
      });

      // 7. Dispara também pelo servidor via VAPID Push para testar a entrega nativa SOMENTE para o usuário
      fetch("/api/push/disparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatarioUserId: userId,
          titulo: "🚨 GD Rastreamento — Alerta de Teste Tático",
          mensagem: "Seu aparelho está pronto para receber alertas mesmo com o app fechado!",
          url: "/monitor-gps",
        }),
      }).catch(() => {});
    }

    return true;
  } catch (err) {
    console.error("Erro ao disparar notificação móvel de teste:", err);
    return false;
  }
}

/**
 * Cancela a inscrição push do dispositivo atual ao fazer logout.
 *
 * REGRA DE SEGURANÇA CRÍTICA:
 * - Remove o endpoint do PushManager do navegador (o dispositivo para de receber pushes)
 * - Remove o registro da tabela user_push_subscriptions no banco de dados
 * - Notifica a API do servidor para invalidar o endpoint no worker VAPID
 *
 * Motivos:
 *  1. O usuário pode ter mudado de aparelho — enviar para o endpoint antigo seria errado.
 *  2. O usuário pode ter logado em dispositivo emprestado — após deslogar, esse aparelho
 *     NÃO deve continuar recebendo alertas pessoais (velocidade, ignição, etc.).
 */
export async function cancelarInscricaoPushDispositivoAtual(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const reg = await Promise.race([
      navigator.serviceWorker.getRegistration(),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 800)),
    ]);
    if (!reg || !("pushManager" in reg)) return;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const endpoint = sub.endpoint;

    // 1. Cancela no PushManager do navegador (para de receber pushes neste dispositivo)
    try {
      await sub.unsubscribe();
    } catch {
      // Ignora: dispositivo pode já ter cancelado automaticamente
    }

    // 2. Remove o endpoint do banco de dados (Supabase)
    // Usa o endpoint como chave única (UNIQUE constraint em user_push_subscriptions.endpoint)
    try {
      await supabase.from("user_push_subscriptions").delete().eq("endpoint", endpoint);
    } catch {
      // Silencia — não bloqueia o logout por falha de limpeza
    }

    // 3. Notifica o servidor VAPID para invalidar o endpoint no worker (best-effort)
    try {
      fetch("/api/push/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    } catch {
      // Ignora falhas de rede — o banco já está limpo
    }
  } catch {
    // Nunca bloqueia o fluxo de logout por falha no cancelamento push
  }
}
