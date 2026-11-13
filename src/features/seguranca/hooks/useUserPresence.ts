import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import { toast } from "sonner";

export interface UsuarioOnline {
  userId: string;
  email: string;
  nome: string;
  role: string;
  onlineAt: string;
}

/**
 * Hook de monitoramento de presenca online em tempo real via Supabase Realtime Presence
 * e escuta de comandos de encerramento forcado de sessao.
 */
export function useUserPresence() {
  const { session, logout } = useAuth();
  const [usuariosOnline, setUsuariosOnline] = useState<UsuarioOnline[]>([]);

  useEffect(() => {
    if (!session?.userId) return;

    const canal = supabase.channel("hunter_presence_canal", {
      config: {
        presence: {
          key: session.userId,
        },
      },
    });

    canal
      .on("presence", { event: "sync" }, () => {
        const estadoPresenca = canal.presenceState();
        const lista: UsuarioOnline[] = [];

        Object.keys(estadoPresenca).forEach((chave) => {
          const presencas = estadoPresenca[chave] as any[];
          if (presencas && presencas.length > 0) {
            const p = presencas[0];
            lista.push({
              userId: p.userId || chave,
              email: p.email || "",
              nome: p.nome || "Usuario",
              role: p.role || "usuario",
              onlineAt: p.onlineAt || new Date().toISOString(),
            });
          }
        });

        setUsuariosOnline(lista);
      })
      .on("broadcast", { event: "force_logout" }, (payload: any) => {
        const alvoUserId = payload?.payload?.userId;
        const alvoEmail = payload?.payload?.email;

        if (alvoUserId === session.userId || (alvoEmail && alvoEmail === session.email)) {
          toast.error("Sua sessao foi encerrada pelo Administrador do Sistema.", {
            duration: 8000,
          });
          setTimeout(() => {
            logout();
          }, 1500);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await canal.track({
            userId: session.userId,
            email: session.email,
            nome: session.nome,
            role: session.role,
            onlineAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      canal.untrack();
      supabase.removeChannel(canal);
    };
  }, [session?.userId, session?.email, session?.nome, session?.role, logout]);

  /**
   * Forca a desconexao remota imediata de um usuario conectado
   */
  const forcarDeslogarUsuario = useCallback(
    async (userId: string, email?: string): Promise<boolean> => {
      try {
        const canal = supabase.channel("hunter_presence_canal");
        await canal.send({
          type: "broadcast",
          event: "force_logout",
          payload: { userId, email },
        });

        // Remove imediatamente da lista local
        setUsuariosOnline((prev) => prev.filter((u) => u.userId !== userId));

        const sessionId = "force_logout_" + Math.random().toString(36).substring(2, 15);
        await Promise.allSettled([
          supabase.from("system_login_logs").insert({
            session_id: sessionId,
            user_id: userId,
            email: email || "usuario",
            role: "autenticado",
            status: "logout",
            user_agent: "Desconexao Remota SuperADM",
          }),
          supabase.from("system_activity_logs").insert({
            user_id: userId,
            acao: "logout",
            detalhe: `Sessao encerrada administrativamente pelo SuperADM`,
          }),
          supabase
            .from("profiles")
            .update({ sessao_ativa: false, ultimo_logout: new Date().toISOString() })
            .eq("id", userId),
        ]);

        return true;
      } catch (err) {
        console.error("Erro ao forcar logout:", err);
        return false;
      }
    },
    [],
  );

  const isUsuarioOnline = useCallback(
    (userId: string) => {
      return usuariosOnline.some((u) => u.userId === userId);
    },
    [usuariosOnline],
  );

  return {
    usuariosOnline,
    totalOnline: usuariosOnline.length,
    isUsuarioOnline,
    forcarDeslogarUsuario,
  };
}
