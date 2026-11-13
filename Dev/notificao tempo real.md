# 🔍 Análise de Causa Raiz — Push Notifications em Segundo Plano

## Diagnóstico: Por que as notificações SÓ chegam com o app aberto?

### Arquitetura Atual (Fluxo)

```mermaid
sequenceDiagram
    participant BD as Supabase BD
    participant RT as Supabase Realtime
    participant App as App (Foreground)
    participant SW as Service Worker
    participant FCM as FCM/APNs (Push Service)
    participant Worker as Cloudflare Worker

    Note over App: App ABERTO → funciona ✅
    App->>RT: WebSocket conectado
    BD->>RT: INSERT notificacoes_sistema
    RT->>App: postgres_changes / broadcast
    App->>App: Toast + showNotification()

    Note over App: App FECHADO → falha ❌
    App--xRT: WebSocket MORTO
    BD->>RT: INSERT notificacoes_sistema
    RT--xApp: Ninguém ouvindo!
```

### 3 Bugs Críticos Identificados

#### Bug 1 — URL com duplo `?` impede consulta de assinaturas (CRÍTICO)

```javascript
// server.ts linha 1843 — BUGADO
const urlBusca = `${supabaseUrl}/rest/v1/user_push_subscriptions${filtroUrl}?select=...`;
// Quando filtroUrl = "?user_id=eq.xxx", gera:
// "...?user_id=eq.xxx?select=id,endpoint,p256dh,auth"  ← SEGUNDO ? INVALIDA A QUERY
```

**Efeito:** O PostgREST **nunca retorna** as assinaturas push do banco. Lista vazia = zero push enviado.

#### Bug 2 — Inscrição no servidor não persiste userId (CRÍTICO)

```javascript
// webPushService.ts linha 107 — NÃO envia userId
fetch("/api/push/inscrever", {
  body: JSON.stringify({
    subscription: sub.toJSON(),
    userAgent: navigator.userAgent,
    // userId: ??? ← FALTA!
  }),
});
```

**Efeito:** O endpoint `/api/push/inscrever` no servidor nunca grava `user_id` no banco, logo a busca filtrada por usuário retorna vazio.

#### Bug 3 — Nenhum mecanismo server-side dispara push automaticamente

O push SÓ é disparado quando o CLIENTE chama `fetch("/api/push/disparar")`. Se nenhum cliente está aberto, **nenhum push é enviado**. Falta um trigger no banco que dispare push automaticamente ao inserir notificação.

### Solução Implementada

```mermaid
sequenceDiagram
    participant BD as Supabase BD
    participant Trigger as pg_net Trigger
    participant Worker as Cloudflare Worker
    participant FCM as FCM/APNs
    participant SW as Service Worker
    participant Phone as 📱 Tela Bloqueada

    BD->>BD: INSERT notificacoes_sistema
    BD->>Trigger: AFTER INSERT
    Trigger->>Worker: POST /api/push/disparar (via pg_net)
    Worker->>BD: Busca subscriptions do user
    Worker->>FCM: VAPID Push (buildPushPayload)
    FCM->>SW: push event (background)
    SW->>Phone: showNotification() ← TELA BLOQUEADA ✅
```
