import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { sanitizarMensagemErro } from "@/shared/utils/erroAmigavel";

export function getSupabaseClientConfig() {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const env = typeof process !== "undefined" ? process.env : {};
  const browser = typeof window !== "undefined";
  let url = browser
    ? meta?.VITE_SUPABASE_URL || ""
    : env.SUPABASE_URL || env.VITE_SUPABASE_URL || meta?.VITE_SUPABASE_URL || "";
  let key = browser
    ? meta?.VITE_SUPABASE_PUBLISHABLE_KEY || meta?.VITE_SUPABASE_ANON_KEY || ""
    : env.SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      env.SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      meta?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      meta?.VITE_SUPABASE_ANON_KEY ||
      "";

  if ((!url || !key) && typeof process !== "undefined") {
    try {
      const fs = (globalThis as any).process?.getBuiltinModule?.("fs");
      if (fs) {
        const cwd = process.cwd();
        for (const file of [".env.production", ".env.local", ".env"]) {
          const p = `${cwd}/${file}`;
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8");
            for (const line of raw.split("\n")) {
              const [k, ...v] = line.split("=");
              if (k && v.length) {
                const trimmedK = k.trim();
                const trimmedV = v.join("=").trim();
                if (trimmedK === "VITE_SUPABASE_URL" && !url) url = trimmedV;
                if (trimmedK === "VITE_SUPABASE_ANON_KEY" && !key) key = trimmedV;
              }
            }
          }
        }
        if ((!url || !key) && fs.existsSync(`${cwd}/wrangler.json`)) {
          const wRaw = fs.readFileSync(`${cwd}/wrangler.json`, "utf-8");
          const wParsed = JSON.parse(wRaw);
          if (!url && wParsed?.vars?.VITE_SUPABASE_URL) url = wParsed.vars.VITE_SUPABASE_URL;
          if (!key && wParsed?.vars?.VITE_SUPABASE_ANON_KEY)
            key = wParsed.vars.VITE_SUPABASE_ANON_KEY;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { url: url || "", key: key || "" };
}

function createSupabaseClient() {
  const { url, key } = getSupabaseClientConfig();
  return createClient<Database>(url, key, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      storageKey: "hunter-auth-token-v1",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  });
}

function obterSessaoAuditorInfo(): {
  isAtivo: boolean;
  isReadOnly: boolean;
  isDegustacao: boolean;
} {
  if (typeof window === "undefined") {
    return { isAtivo: false, isReadOnly: false, isDegustacao: false };
  }
  try {
    const raw = localStorage.getItem("hunter-cached-user-session-v1");
    if (!raw) {
      return { isAtivo: false, isReadOnly: false, isDegustacao: false };
    }
    const sess = JSON.parse(raw);
    const isAtivo = Boolean(
      sess?.role === "superadmin_auditor" ||
      sess?.isSuperAdminAuditor ||
      sess?.isAuditor ||
      sess?.isReadOnly ||
      sess?.isDegustacao,
    );
    const isReadOnly = Boolean(sess?.isReadOnly);
    const isDegustacao = Boolean(sess?.isDegustacao || (isAtivo ? !isReadOnly : false));
    return { isAtivo, isReadOnly, isDegustacao };
  } catch {
    return { isAtivo: false, isReadOnly: false, isDegustacao: false };
  }
}

let clientInstance: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!clientInstance) clientInstance = createSupabaseClient();
    const val = Reflect.get(clientInstance, prop, receiver);

    // Interceptador Global de Tabela (from): Blinda mutações e suporta Degustação Master sem contaminar BD
    if (prop === "from") {
      if (typeof val === "function") {
        return (tableName: string) => {
          const queryBuilder = val.call(clientInstance, tableName);
          return new Proxy(queryBuilder, {
            get(target, methodProp, methodReceiver) {
              if (
                methodProp === "insert" ||
                methodProp === "update" ||
                methodProp === "delete" ||
                methodProp === "upsert"
              ) {
                const info = obterSessaoAuditorInfo();
                if (info.isAtivo) {
                  // Se for estritamente Read-Only, aplica o bloqueio com erro 403
                  if (info.isReadOnly) {
                    console.warn(
                      `[SIGO Guardião] Bloqueio físico ativado: Tentativa de ${String(methodProp)} na tabela ${tableName} recusada para o perfil S.adm Auditor.`,
                    );
                    return () =>
                      Promise.resolve({
                        data: null,
                        error: {
                          message:
                            "REGRA IMPERIOSA: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Proibido cadastrar, alterar ou excluir dados.",
                          code: "403_READ_ONLY_AUDITOR",
                          details:
                            "Operação interceptada pela blindagem física de governança da plataforma.",
                          hint: null,
                        },
                      });
                  }

                  // Modo Degustação Master: simula sucesso para permitir navegação interativa sem tocar no BD
                  if (info.isDegustacao) {
                    return (..._args: any[]) =>
                      Promise.resolve({
                        data: [{ id: "deg-simulado-" + Date.now() }],
                        error: null,
                        count: 1,
                      });
                  }
                }
              }
              const orig = Reflect.get(target, methodProp, methodReceiver);
              return typeof orig === "function" ? orig.bind(target) : orig;
            },
          });
        };
      }
    }

    // Interceptador Global de RPC: blinda erros e simula sucesso em Degustação Master
    if (prop === "rpc") {
      if (typeof val === "function") {
        return (fnName: string, args?: any, options?: any) => {
          const info = obterSessaoAuditorInfo();
          if (info.isAtivo) {
            const fnLower = (fnName || "").toLowerCase();
            const isMutacao =
              fnLower.includes("bloquear") ||
              fnLower.includes("desbloquear") ||
              fnLower.includes("cadastrar") ||
              fnLower.includes("atualizar") ||
              fnLower.includes("excluir") ||
              fnLower.includes("inserir") ||
              fnLower.includes("deletar") ||
              fnLower.includes("redefinir");

            if (isMutacao) {
              if (info.isReadOnly) {
                console.warn(
                  `[SIGO Guardião] Bloqueio físico RPC: ${fnName} recusada para perfil S.adm Auditor.`,
                );
                return Promise.resolve({
                  data: null,
                  error: {
                    message:
                      "REGRA IMPERIOSA: Perfil S.adm Auditor possui acesso 100% READ-ONLY. Proibido executar procedimentos de escrita ou alteração de dados.",
                    code: "403_READ_ONLY_AUDITOR",
                  },
                });
              }

              if (info.isDegustacao) {
                return Promise.resolve({
                  data: {
                    status: "sucesso",
                    ack: true,
                    simulacao: true,
                    mensagem: "Comando simulado executado com sucesso no modo Degustação Master",
                  },
                  error: null,
                });
              }
            }
          }

          const promise = val.call(clientInstance, fnName, args, options);
          if (promise && typeof promise.then === "function") {
            return promise.then((res: any) => {
              if (res && res.error) {
                const msgCrua = res.error.message || "";
                res.error.originalMessage = msgCrua;
                if (
                  msgCrua.toLowerCase().includes("schema cache") ||
                  msgCrua.toLowerCase().includes("could not find the function") ||
                  res.error.code === "PGRST202" ||
                  res.error.code === "PGRST204"
                ) {
                  console.warn(
                    `[Supabase Interceptor] Aviso de schema cache/RPC capturado (${fnName}):`,
                    msgCrua,
                  );
                  res.error.message = sanitizarMensagemErro(msgCrua);
                }
              }
              return res;
            });
          }
          return promise;
        };
      }
    }

    return val;
  },
  set(_, prop, value) {
    if (!clientInstance) clientInstance = createSupabaseClient();
    return Reflect.set(clientInstance, prop, value);
  },
});
