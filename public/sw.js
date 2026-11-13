// Service Worker — SIGO Guardião
// Escuta permanente de notificações push nativas (VAPID) — app fechado, tela desligada, outro app em uso
// Versão: 1.10.0.4

const CACHE_NAME = "sigo-guardiao-sw-v3";
const DEDUP_KEY = "sigo_sw_dedup";
const MAX_DEDUP = 150;

// ─── Lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verifica duplicata usando IndexedDB-like storage via Cache API como fallback simples.
 * Retorna true se for duplicata (já processou), false se for novo.
 */
async function isDuplicata(id) {
  try {
    const cache = await caches.open(DEDUP_KEY);
    const req = new Request(`https://sigo-dedup/${id}`);
    const hit = await cache.match(req);
    if (hit) return true;
    await cache.put(req, new Response("1", { status: 200 }));

    // Limpeza: remove entradas antigas quando excede limite
    const keys = await cache.keys();
    if (keys.length > MAX_DEDUP) {
      await cache.delete(keys[0]);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Monta as opções da notificação de forma compatível com Android e iOS 16.4+
 */
function montarOpcoes(data) {
  const tag = data.tag || `sigo-alerta-${Date.now()}`;
  const opcoes = {
    body: data.body || "Alerta de telemetria veicular ou anomalia operacional detectada.",
    icon: data.icon || "/logo.png",
    badge: data.badge || "/favicon.png",
    tag,
    renotify: true,
    data: {
      url: data.url || "/monitor-gps",
      dataHora: new Date().toISOString(),
    },
  };

  // vibrate, requireInteraction e actions causam falha silenciosa no iOS — omite no WebKit
  const isWebKit =
    typeof self.navigator !== "undefined" &&
    (/iphone|ipad|ipod/i.test(self.navigator.userAgent || "") ||
      (/safari|webkit/i.test(self.navigator.userAgent || "") &&
        !/chrome|chromium|edg/i.test(self.navigator.userAgent || "")));

  if (!isWebKit) {
    opcoes.vibrate = [300, 150, 300, 150, 300];
    opcoes.requireInteraction = true;
    const ehChat = data.url && data.url.includes("/chat");
    opcoes.actions = [
      { action: "abrir", title: ehChat ? "Abrir Conversa" : "Ver no Mapa" },
      { action: "fechar", title: "Dispensar" },
    ];
  }

  return opcoes;
}

// ─── 1. Push Nativo via VAPID ─────────────────────────────────────────────────
// Esta é a única forma de receber notificações com o app COMPLETAMENTE FECHADO ou
// com outro app em uso. O browser (Chrome/Firefox/Safari) mantém esta escuta ativo.

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: "Alerta Operacional — SIGO Guardião",
        body: event.data.text(),
      };
    }
  }

  const titulo = data.title || "Alerta de Segurança — SIGO Guardião";
  const corpo = (data.body || "").trim();

  // Normalização de Tag: garante prefixo único canônico 'sigo-notif-'
  const rawTag = String(data.tag || "").trim();
  let tag = rawTag;
  if (tag && !tag.startsWith("sigo-notif-")) {
    tag = `sigo-notif-${tag}`;
  }
  if (!tag) {
    tag = `sigo-notif-${Date.now()}`;
  }
  data.tag = tag;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Identifica se é dispositivo móvel (iOS ou Android)
      const isMobile =
        typeof self.navigator !== "undefined" &&
        /iphone|ipad|ipod|android/i.test(self.navigator.userAgent || "");

      // Se a notificação for de chat e a aba do chat estiver aberta, visível e focada no DESKTOP,
      // não exibe push na cara do usuário para não cobrir a digitação.
      // IMPORTANTE: Em dispositivos móveis (iOS/Android), os estados c.focused e c.visibilityState
      // são notoriamente instáveis quando o app é colocado em segundo plano ou a tela é bloqueada.
      // Portanto, em dispositivos móveis NUNCA suprimimos a notificação push para garantir entrega 100%!
      const ehChat = data.url && data.url.includes("/chat");
      const estaNoChatFocado =
        !isMobile &&
        windowClients.some(
          (c) => c.focused && c.visibilityState === "visible" && (c.url || "").includes("/chat"),
        );

      if (ehChat && estaNoChatFocado) {
        return;
      }

      // Deduplicação estrita: checa tanto a tag canônica quanto a assinatura semântica do alerta
      const chaveSemantica = `sem-${(titulo + ":" + corpo).replace(/[^a-zA-Z0-9]/g, "").slice(0, 60)}`;

      return Promise.all([isDuplicata(tag), isDuplicata(chaveSemantica)]).then(
        ([dupTag, dupSem]) => {
          if (dupTag || dupSem) return;
          return self.registration.showNotification(titulo, montarOpcoes(data)).catch(() => {
            return self.registration.showNotification(titulo, {
              body: data.body || "Nova mensagem recebida.",
              icon: "/logo.png",
              data: { url: data.url || "/" },
            });
          });
        },
      );
    }),
  );
});

// ─── 2. Clique na Notificação: Abre ou Foca a Janela ─────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "fechar") return;

  const urlDestino = event.notification.data?.url || "/monitor-gps";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && urlDestino) {
            return client.navigate(urlDestino);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlDestino);
      }
    }),
  );
});

// ─── 3. pushsubscriptionchange: Re-inscrição Automática ──────────────────────
// Disparado pelo browser quando a subscrição VAPID expira ou é invalidada pelo servidor push.
// Sem este handler, o dispositivo fica silencioso para sempre após a rotação de chaves.

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription
          ? event.oldSubscription.options.applicationServerKey
          : null,
      })
      .then((newSub) => {
        // Envia nova subscription ao servidor para atualizar o banco
        return fetch("/api/push/inscrever", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            userAgent: self.navigator?.userAgent || "service-worker",
          }),
        }).catch(() => {});
      })
      .catch(() => {}),
  );
});

// ─── 4. Message: Comunicação do App → SW ─────────────────────────────────────
// Permite que o React app envie mensagens para o SW (ex: notificar offline status)

self.addEventListener("message", (event) => {
  if (event.data && event.data.tipo === "ping") {
    if (event.source && "postMessage" in event.source) {
      event.source.postMessage({ tipo: "pong", ts: Date.now() });
    }
  }
});
