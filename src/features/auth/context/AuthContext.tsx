import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  useRef,
  useMemo,
} from "react";
import type { UserSession, ClienteEmulado } from "../types";
import type { HunterRole, PlanoCliente } from "@/integrations/supabase/types";
import {
  carregarSessaoUsuario,
  encerrarSessao,
  obterSessaoCacheada,
  restaurarSupabaseToken,
  limparSessaoCacheada,
} from "../services/authService";
import { supabase } from "@/integrations/supabase/client";
import { carregarPreferenciasDoBanco } from "@/shared/lib/userPreferencesService";

const STORAGE_KEY_CLIENTE_EMULADO = "hunter_cliente_emulado";

interface AuthContextValue {
  session: UserSession | null;
  sessaoOriginal: UserSession | null;
  carregando: boolean;
  recarregarSessao: () => Promise<UserSession | null>;
  logout: () => Promise<void>;
  clienteEmulado: ClienteEmulado | null;
  emularCliente: (cliente: ClienteEmulado) => void;
  desfazerEmulacao: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * REGRA DE NEGÓCIO CRÍTICA: O usuário NUNCA deve ser deslogado automaticamente.
 * O logout só acontece quando o próprio usuário clica em "Sair" (logout explícito).
 * Isso é obrigatório pois o app precisa manter o usuário logado para receber alertas
 * mesmo com inatividade, perda de foco, tela bloqueada ou app em segundo plano.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Inicialização instantânea via cache local persistido: previne qualquer logout acidental por inatividade
  const [session, setSession] = useState<UserSession | null>(() => obterSessaoCacheada());
  const [carregando, setCarregando] = useState<boolean>(() => !obterSessaoCacheada());
  const [, startTransition] = useTransition();

  // Emulação de Cliente para Super Administrador
  const [clienteEmulado, setClienteEmulado] = useState<ClienteEmulado | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const salvo = localStorage.getItem(STORAGE_KEY_CLIENTE_EMULADO);
        return salvo ? (JSON.parse(salvo) as ClienteEmulado) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const emularCliente = (cliente: ClienteEmulado) => {
    try {
      localStorage.setItem(STORAGE_KEY_CLIENTE_EMULADO, JSON.stringify(cliente));
      // Reseta filtros residuais de veículos e clientes para isolamento perfeito no perfil do cliente
      localStorage.removeItem("@hunter_filtro_veiculos_ids");
      localStorage.removeItem("@hunter_filtro_clientes_ids");
      window.dispatchEvent(new Event("hunter_filtro_veiculos_alterado"));
      window.dispatchEvent(new Event("hunter_filtro_clientes_alterado"));
    } catch {}
    setClienteEmulado(cliente);
  };

  const desfazerEmulacao = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_CLIENTE_EMULADO);
      // Reseta filtros ao voltar para SuperADM para restaurar visão global de toda a frota
      localStorage.removeItem("@hunter_filtro_veiculos_ids");
      localStorage.removeItem("@hunter_filtro_clientes_ids");
      window.dispatchEvent(new Event("hunter_filtro_veiculos_alterado"));
      window.dispatchEvent(new Event("hunter_filtro_clientes_alterado"));
    } catch {}
    setClienteEmulado(null);
  };

  // Sessão Efetiva: quando emulação estiver ativa para SuperADM/Admin, comporta-se 100% como Cliente
  const sessionEfetiva: UserSession | null = useMemo(() => {
    if (!session) return null;
    if (!clienteEmulado) return session;

    // Apenas SuperAdmin ou Admin tem permissão para emular clientes
    if (!session.isSuperAdmin && !session.isAdmin) {
      return session;
    }

    return {
      ...session,
      userId: clienteEmulado.userId || session.userId,
      nome: clienteEmulado.nome,
      role: "cliente" as HunterRole,
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isInstalador: false,
      isMotorista: false,
      isRevendedor: false,
      isVendedor: false,
      isCliente: true,
      clienteId: clienteEmulado.id,
      plano: (clienteEmulado.plano || session.plano || "basico") as PlanoCliente,
      planoContratado: (clienteEmulado.plano ||
        session.planoContratado ||
        "basico") as PlanoCliente,
    };
  }, [session, clienteEmulado]);

  // Flag que impede que o GoTrue-js desconecte o usuário por erros de rede/background.
  // Só é ativada quando o PRÓPRIO usuário clica em "Sair".
  const logoutExplicitoRef = useRef(false);

  const recarregarSessao = async (): Promise<UserSession | null> => {
    try {
      // Timeout de segurança de 3.5s para evitar que chamadas de rede lentas travem o boot
      const sessaoPromise = carregarSessaoUsuario();
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
      const sess = await Promise.race([sessaoPromise, timeoutPromise]);

      startTransition(() => {
        if (sess) {
          setSession(sess);
          // Sincroniza preferências do perfil em banco (pin vs veículo, cores do painel, etc.)
          carregarPreferenciasDoBanco(sess.userId).catch(() => {});
          // Registra atomicamente o acesso no banco via RPC
          supabase
            .rpc("registrar_acesso_usuario")
            .then(() => {})
            .catch(() => {});
        } else {
          // Se falhou ou deu timeout mas temos cache, mantém a sessão ativa (nunca desloga automaticamente)
          const cache = obterSessaoCacheada();
          if (cache) {
            setSession(cache);
            if (cache.userId) {
              carregarPreferenciasDoBanco(cache.userId).catch(() => {});
            }
          }
          // NÃO setSession(null) — o usuário não pediu logout
        }
        setCarregando(false);
      });

      return sess ?? obterSessaoCacheada();
    } catch {
      startTransition(() => {
        // Em caso de erro (rede, etc), mantém a sessão do cache
        const cache = obterSessaoCacheada();
        if (cache) {
          setSession(cache);
        }
        // NÃO setSession(null) — o usuário não pediu logout
        setCarregando(false);
      });
      return obterSessaoCacheada();
    }
  };

  useEffect(() => {
    // Watchdog global: garante que 'carregando' nunca fique preso além de 3.5s
    const watchdog = setTimeout(() => {
      setCarregando(false);
    }, 3500);

    // 1. Carrega ou valida a sessão em segundo plano
    recarregarSessao();

    // 2. Escuta eventos oficiais de autenticação do Supabase
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_OUT") {
        if (logoutExplicitoRef.current) {
          // Logout intencional: limpa tudo imediatamente
          limparSessaoCacheada();
          setSession(null);
          logoutExplicitoRef.current = false;
          return;
        }

        // Logout NÃO intencional: executa fora do lock interno do GoTrue (evita deadlock em setSession/signOut)
        setTimeout(async () => {
          if (logoutExplicitoRef.current) return;
          try {
            const ok = await restaurarSupabaseToken();
            if (ok) {
              recarregarSessao();
            } else {
              const cache = obterSessaoCacheada();
              if (cache) {
                setSession(cache);
              }
            }
          } catch {
            const cache = obterSessaoCacheada();
            if (cache) {
              setSession(cache);
            }
          }
        }, 0);
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        if (newSession?.user) {
          setTimeout(() => {
            recarregarSessao();
          }, 0);
        }
      }
    });

    // 3. Ao retornar de tela bloqueada ou app em segundo plano, revalida sessão sem desconectar
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        // Tenta renovar o token silenciosamente. Se falhar, mantém cache.
        supabase.auth
          .getSession()
          .then(({ data }) => {
            if (data?.session) {
              recarregarSessao();
            }
            // Se data.session é null, NÃO desloga — pode ser um hiato temporário de rede
          })
          .catch(() => {
            // Erro de rede ao voltar do background — ignora silenciosamente
          });
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      subscription.unsubscribe();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, []);

  const logout = async () => {
    logoutExplicitoRef.current = true;
    limparSessaoCacheada();
    setSession(null);
    try {
      await Promise.race([encerrarSessao(), new Promise((resolve) => setTimeout(resolve, 1200))]);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY_CLIENTE_EMULADO);
        localStorage.removeItem("hunter-auth-token-v1");
        localStorage.removeItem("hunter-cached-user-session-v1");
        localStorage.removeItem("hunter-supabase-token-backup-v1");
        sessionStorage.clear();
        window.location.replace("/login");
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session: sessionEfetiva,
        sessaoOriginal: session,
        carregando,
        recarregarSessao,
        logout,
        clienteEmulado,
        emularCliente,
        desfazerEmulacao,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser utilizado dentro de um AuthProvider");
  }
  return ctx;
}
