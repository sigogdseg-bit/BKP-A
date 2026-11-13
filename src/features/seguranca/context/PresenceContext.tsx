import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import { toast } from "sonner";

export interface UsuarioOnline {
  userId: string;
  email: string;
  nome: string;
  role: string;
  onlineAt: string;
  visivelNoChat?: boolean;
}

interface PresenceContextValue {
  usuariosOnline: UsuarioOnline[];
  totalOnline: number;
  isUsuarioOnline: (userId?: string, ignoreVisibility?: boolean) => boolean;
  forcarDeslogarUsuario: (userId: string, email?: string) => Promise<boolean>;
  atualizarVisibilidadeChat: (visivel: boolean) => Promise<void>;
}

const PresenceContext = createContext<PresenceContextValue>({
  usuariosOnline: [],
  totalOnline: 0,
  isUsuarioOnline: () => false,
  forcarDeslogarUsuario: async () => false,
  atualizarVisibilidadeChat: async () => {},
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const [usuariosOnline, setUsuariosOnline] = useState<UsuarioOnline[]>([]);
  const canalRef = useRef<any>(null);

  const obterVisibilidadeInicial = useCallback(() => {
    if (typeof session?.visivelNoChat === "boolean") {
      return session.visivelNoChat;
    }
    if (typeof window !== "undefined" && session?.userId) {
      return window.localStorage.getItem(`sigo_adm_chat_visivel_${session.userId}`) === "true";
    }
    return false;
  }, [session?.userId, session?.visivelNoChat]);

  const [minhaVisibilidadeChat, setMinhaVisibilidadeChat] =
    useState<boolean>(obterVisibilidadeInicial);

  useEffect(() => {
    setMinhaVisibilidadeChat(obterVisibilidadeInicial());
  }, [obterVisibilidadeInicial]);

  useEffect(() => {
    if (!session?.userId) return;

    let canalAtivo = true;

    const canal = supabase.channel("hunter_presence_canal", {
      config: {
        presence: {
          key: session.userId,
        },
      },
    });

    canalRef.current = canal;

    canal
      .on("presence", { event: "sync" }, () => {
        if (!canalAtivo) return;
        try {
          const estadoPresenca = canal.presenceState();
          const lista: UsuarioOnline[] = [];

          if (estadoPresenca) {
            Object.keys(estadoPresenca).forEach((chave) => {
              const presencas = estadoPresenca[chave] as any[];
              if (Array.isArray(presencas) && presencas.length > 0) {
                const p = presencas[0];
                if (p) {
                  lista.push({
                    userId: p.userId || chave,
                    email: p.email || "",
                    nome: p.nome || "Usuário SIGO Guardião",
                    role: p.role || "usuario",
                    onlineAt: p.onlineAt || new Date().toISOString(),
                    visivelNoChat: Boolean(p.visivelNoChat ?? p.visivel_no_chat),
                  });
                }
              }
            });
          }

          setUsuariosOnline(lista);
        } catch (err) {
          console.warn("Aviso na sincronização de presença:", err);
        }
      })
      .on("broadcast", { event: "chat_visibilidade_mudou" }, (payload: any) => {
        const { userId, visivel } = payload?.payload || {};
        if (userId) {
          setUsuariosOnline((antigos) =>
            antigos.map((u) =>
              u.userId === userId ? { ...u, visivelNoChat: Boolean(visivel) } : u,
            ),
          );
        }
      })
      .on("broadcast", { event: "force_logout" }, (payload: any) => {
        const alvoUserId = payload?.payload?.userId;
        const alvoEmail = payload?.payload?.email;

        if (alvoUserId === session.userId || (alvoEmail && alvoEmail === session.email)) {
          toast.error("Sua sessão foi encerrada pelo Administrador do Sistema.", {
            duration: 8000,
          });
          setTimeout(() => {
            logout();
          }, 1500);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && canalAtivo) {
          try {
            await canal.track({
              userId: session.userId,
              email: session.email || "",
              nome: session.nome || "Usuário SIGO Guardião",
              role: session.role || "usuario",
              onlineAt: new Date().toISOString(),
              visivelNoChat: minhaVisibilidadeChat,
            });

            // Garante estado de sessão ativa e último acesso no banco via RPC
            supabase
              .rpc("registrar_acesso_usuario")
              .then(() => {})
              .catch(() => {});
          } catch (e) {
            console.warn("Aviso ao registrar presença:", e);
          }
        }
      });

    return () => {
      canalAtivo = false;
      canalRef.current = null;
      try {
        canal.untrack();
        supabase.removeChannel(canal);
      } catch (e) {
        // Ignora encerramento seguro
      }
    };
  }, [
    session?.userId,
    session?.email,
    session?.nome,
    session?.role,
    minhaVisibilidadeChat,
    logout,
  ]);

  const atualizarVisibilidadeChat = useCallback(
    async (visivel: boolean) => {
      setMinhaVisibilidadeChat(visivel);
      if (typeof window !== "undefined" && session?.userId) {
        window.localStorage.setItem(
          `sigo_adm_chat_visivel_${session.userId}`,
          visivel ? "true" : "false",
        );
      }

      if (canalRef.current && session?.userId) {
        try {
          await canalRef.current.track({
            userId: session.userId,
            email: session.email || "",
            nome: session.nome || "Usuário SIGO Guardião",
            role: session.role || "usuario",
            onlineAt: new Date().toISOString(),
            visivelNoChat: visivel,
          });

          await canalRef.current.send({
            type: "broadcast",
            event: "chat_visibilidade_mudou",
            payload: { userId: session.userId, visivel },
          });
        } catch (e) {
          console.warn("Aviso ao atualizar visibilidade no canal de presença:", e);
        }
      }
    },
    [session?.userId, session?.email, session?.nome, session?.role],
  );

  const forcarDeslogarUsuario = useCallback(
    async (userId: string, email?: string): Promise<boolean> => {
      try {
        const canal = supabase.channel("hunter_presence_canal");
        await canal.send({
          type: "broadcast",
          event: "force_logout",
          payload: { userId, email },
        });

        // Remove imediatamente da lista local de online
        setUsuariosOnline((prev) => prev.filter((u) => u.userId !== userId));

        const sessionId = "force_logout_" + Math.random().toString(36).substring(2, 15);
        await Promise.allSettled([
          supabase.from("system_login_logs").insert({
            session_id: sessionId,
            user_id: userId,
            email: email || "usuario",
            role: "autenticado",
            status: "logout",
            user_agent: "Desconexão Remota SuperADM",
          }),
          supabase.from("system_activity_logs").insert({
            user_id: userId,
            acao: "logout",
            detalhe: `Sessão encerrada administrativamente pelo SuperADM`,
          }),
          supabase
            .from("profiles")
            .update({ sessao_ativa: false, ultimo_logout: new Date().toISOString() })
            .eq("id", userId),
        ]);

        return true;
      } catch (err) {
        console.error("Erro ao forçar logout:", err);
        return false;
      }
    },
    [],
  );

  const isUsuarioOnline = useCallback(
    (userId?: string, ignoreVisibility: boolean = false) => {
      if (!userId) return false;
      return usuariosOnline.some((u) => {
        if (u.userId !== userId) return false;
        if (!ignoreVisibility) {
          const isAdm =
            String(u.role).toLowerCase() === "superadmin" || String(u.role).toLowerCase() === "adm";
          if (isAdm && !u.visivelNoChat) return false;
        }
        return true;
      });
    },
    [usuariosOnline],
  );

  return (
    <PresenceContext.Provider
      value={{
        usuariosOnline,
        totalOnline: usuariosOnline.length,
        isUsuarioOnline,
        forcarDeslogarUsuario,
        atualizarVisibilidadeChat,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePresence() {
  return useContext(PresenceContext);
}
