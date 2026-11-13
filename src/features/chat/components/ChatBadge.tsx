// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Chat Interativo: Badge de Mensagens Não Lidas (AppHeader)
// Ícone de mensagens no cabeçalho com contador de mensagens pendentes
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { contarMensagensNaoLidas } from "../services/chatService";
import { supabase } from "@/integrations/supabase/client";

interface ChatBadgeProps {
  userId: string;
}

export function ChatBadge({ userId }: ChatBadgeProps) {
  const [naoLidas, setNaoLidas] = useState(0);

  const recarregarContagem = useCallback(async () => {
    if (!userId) return;
    const total = await contarMensagensNaoLidas(userId);
    setNaoLidas(total);
  }, [userId]);

  useEffect(() => {
    recarregarContagem();

    // Escuta em tempo real via Realtime Broadcast e Banco (zero polling)
    const canal = supabase
      .channel("chat-badge-realtime-listener")
      .on("broadcast", { event: "notificacao_inter_dispositivos" }, (payload: any) => {
        const notif = payload?.payload;
        if (notif?.tipo === "chat" && notif?.destinatario_user_id === userId) {
          recarregarContagem();
        }
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes_sistema",
          filter: `destinatario_user_id=eq.${userId}`,
        },
        () => {
          recarregarContagem();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId, recarregarContagem]);

  return (
    <Link
      to="/chat"
      className="relative p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-emerald-500 hover:bg-emerald-500/10 border border-slate-200 dark:border-slate-800 transition active:scale-95 cursor-pointer shadow-2xs"
      title="Chat em Tempo Real"
      aria-label="Chat em Tempo Real"
    >
      <MessageCircle className="h-4 w-4" />

      {/* Badge de contagem com animação */}
      {naoLidas > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[9px] font-black rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white dark:ring-slate-900 animate-in zoom-in duration-200">
          {naoLidas > 99 ? "99+" : naoLidas}
        </span>
      )}
    </Link>
  );
}
