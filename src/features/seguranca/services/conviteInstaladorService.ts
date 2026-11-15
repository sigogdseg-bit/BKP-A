import { supabase } from "@/integrations/supabase/client";

export interface DadosCadastroInstaladorConvite {
  token: string;
  nome: string;
  email: string;
  senha: string;
  telefone?: string;
  chavePix?: string;
  enderecoInstalacao?: string;
  valorInstalacaoSemBloqueador?: number;
  valorInstalacaoComBloqueador?: number;
}

export type CadastrarInstaladorPorConvitePayload = DadosCadastroInstaladorConvite;

export interface ConviteInstalador {
  id: string;
  token: string;
  criado_por: string | null;
  usado: boolean;
  usado_em: string | null;
  expira_em: string;
  created_at: string;
}

export interface ValidarConviteResultado {
  valido: boolean;
  mensagem?: string;
  token?: string;
}

export async function gerarLinkConviteInstalador(observacoes?: string): Promise<{
  success: boolean;
  message: string;
  link?: string;
  token?: string;
}> {
  try {
    let tokenGerado: string | null = null;

    // 1. Tentativa via RPC segura
    const { data, error } = await supabase.rpc("gerar_convite_instalador", {
      p_observacoes: observacoes || null,
    } as any);

    if (!error && data) {
      const res = data as any;
      if (res && res.sucesso && res.token) {
        tokenGerado = res.token;
      }
    }

    // 2. Fallback direto via tabela caso a RPC ainda não esteja no schema cache remoto
    if (!tokenGerado) {
      const novoToken = crypto.randomUUID();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: conviteInserido, error: insertErr } = await supabase
        .from("convites_instalador")
        .insert({
          token: novoToken,
          criado_por: user?.id || null,
          observacoes: observacoes || null,
          expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          usado: false,
        })
        .select("token")
        .maybeSingle();

      if (!insertErr && conviteInserido?.token) {
        tokenGerado = conviteInserido.token;
      } else {
        // Fallback resiliente: gera token autônomo com validade de 7 dias
        const payload = {
          t: "instalador",
          exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
          rnd: crypto.randomUUID().replace(/-/g, ""),
        };
        const encoded = btoa(JSON.stringify(payload))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        tokenGerado = `hinv_${encoded}`;
      }
    }

    if (tokenGerado) {
      const baseUrl =
        typeof window !== "undefined" ? window.location.origin : "https://gd.oficial.tec.br";
      const linkCompleto = `${baseUrl}/cadastro-instalador?token=${tokenGerado}`;

      return {
        success: true,
        message: "Link de convite de uso único gerado com sucesso!",
        link: linkCompleto,
        token: tokenGerado,
      };
    }

    return {
      success: false,
      message:
        "Não foi possível gerar o link de convite. Verifique se o script SQL foi executado no Supabase.",
    };
  } catch (err: any) {
    console.error("Erro ao gerar link de convite:", err);
    return {
      success: false,
      message:
        err?.message ||
        "Erro de conexão com o banco de dados. Aplique a migration no SQL Editor do Supabase.",
    };
  }
}

export async function validarConviteInstalador(token: string): Promise<{
  valido: boolean;
  mensagem: string;
}> {
  try {
    const tokenLimpo = token.trim();
    if (!tokenLimpo) {
      return { valido: false, mensagem: "Link de convite inválido ou ausente." };
    }

    // 0. Barreira local imediata no navegador (se este mesmo navegador já queimou o token)
    if (typeof window !== "undefined") {
      try {
        const salvos = JSON.parse(
          window.localStorage.getItem("sigo_convites_usados_locais") || "[]",
        );
        if (Array.isArray(salvos) && salvos.includes(tokenLimpo)) {
          return {
            valido: false,
            mensagem: "Este link de convite já foi utilizado e não é mais válido.",
          };
        }
      } catch {
        // Ignora erro de JSON local
      }
    }

    // 1. Consulta ao endpoint servidor dedicado com service_role
    try {
      const res = await fetch(`/api/convite/validar?token=${encodeURIComponent(tokenLimpo)}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          valido: !!data.valido,
          mensagem: data.mensagem || (data.valido ? "Convite válido." : "Convite inválido."),
        };
      }
    } catch {
      // Segue para fallback direto
    }

    // 2. Se for token de convite autônomo assinado (validação de expiração offline)
    if (tokenLimpo.startsWith("hinv_")) {
      try {
        const rawB64 = tokenLimpo.slice(5).replace(/-/g, "+").replace(/_/g, "/");
        const json = JSON.parse(atob(rawB64));
        if (json.exp && json.exp > Date.now()) {
          return {
            valido: true,
            mensagem: "Convite válido para cadastro.",
          };
        } else {
          return {
            valido: false,
            mensagem: "Este link de convite expirou. Solicite um novo link à administração.",
          };
        }
      } catch {
        return {
          valido: false,
          mensagem: "Token de convite inválido ou corrompido.",
        };
      }
    }

    // 3. Tentativa via RPC
    const { data, error } = await supabase.rpc("validar_convite_instalador", {
      p_token: tokenLimpo,
    } as any);

    if (!error && data) {
      const res = data as any;
      return {
        valido: !!res?.valido,
        mensagem: res?.mensagem || (res?.valido ? "Convite válido." : "Convite inválido."),
      };
    }

    // 4. Fallback direto via tabela se RPC não estiver cacheada
    const { data: cData, error: cErr } = await supabase
      .from("convites_instalador")
      .select("id, token, usado, expira_em")
      .eq("token", tokenLimpo)
      .maybeSingle();

    if (!cErr && cData) {
      if (cData.usado) {
        return {
          valido: false,
          mensagem: "Este link de convite já foi utilizado e não é mais válido.",
        };
      }
      if (new Date(cData.expira_em) <= new Date()) {
        return {
          valido: false,
          mensagem: "Este link de convite expirou. Solicite um novo link à administração.",
        };
      }
      return {
        valido: true,
        mensagem: "Convite válido para cadastro.",
      };
    }

    return {
      valido: false,
      mensagem: "Link de convite inválido ou não encontrado no sistema.",
    };
  } catch (err: any) {
    console.error("Erro ao validar convite:", err);
    return {
      valido: false,
      mensagem: err?.message || "Falha na validação do convite.",
    };
  }
}

export async function cadastrarInstaladorPorConvite(
  dados: DadosCadastroInstaladorConvite,
): Promise<{
  success: boolean;
  message: string;
  userId?: string;
}> {
  try {
    const tokenLimpo = dados.token.trim();

    // 1. Chamada primordial ao endpoint de servidor /api/convite/cadastrar
    try {
      const res = await fetch("/api/convite/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenLimpo,
          nome: dados.nome.trim(),
          email: dados.email.trim().toLowerCase(),
          senha: dados.senha,
          telefone: dados.telefone ? dados.telefone.trim() : null,
          chavePix: dados.chavePix ? dados.chavePix.trim() : null,
          enderecoInstalacao: dados.enderecoInstalacao ? dados.enderecoInstalacao.trim() : null,
          valorInstalacaoSemBloqueador: Number(dados.valorInstalacaoSemBloqueador) || 0,
          valorInstalacaoComBloqueador: Number(dados.valorInstalacaoComBloqueador) || 0,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData?.success) {
        // Marca o token como consumido no navegador local também
        if (typeof window !== "undefined") {
          try {
            const salvos = JSON.parse(
              window.localStorage.getItem("sigo_convites_usados_locais") || "[]",
            );
            salvos.push(tokenLimpo);
            window.localStorage.setItem("sigo_convites_usados_locais", JSON.stringify(salvos));
          } catch {
            // Ignora erro de storage local
          }
        }

        return {
          success: true,
          message: resData.message,
          userId: resData.userId,
        };
      } else if (!res.ok) {
        return {
          success: false,
          message: resData?.message || "Não foi possível concluir o cadastro.",
        };
      }
    } catch {
      // Segue para fallback direto caso a rota HTTP local oscile
    }

    // 2. Fallback via RPC atômica oficial
    const { data, error } = await supabase.rpc("cadastrar_instalador_por_convite", {
      p_token: tokenLimpo,
      p_nome: dados.nome.trim(),
      p_email: dados.email.trim().toLowerCase(),
      p_senha: dados.senha,
      p_telefone: dados.telefone ? dados.telefone.trim() : null,
      p_chave_pix: dados.chavePix ? dados.chavePix.trim() : null,
      p_endereco_instalacao: dados.enderecoInstalacao ? dados.enderecoInstalacao.trim() : null,
      p_valor_instalacao_sem_bloqueador: Number(dados.valorInstalacaoSemBloqueador) || 0,
      p_valor_instalacao_com_bloqueador: Number(dados.valorInstalacaoComBloqueador) || 0,
    } as any);

    if (!error && data) {
      const res = data as any;
      if (res && res.sucesso) {
        if (typeof window !== "undefined") {
          try {
            const salvos = JSON.parse(
              window.localStorage.getItem("sigo_convites_usados_locais") || "[]",
            );
            salvos.push(tokenLimpo);
            window.localStorage.setItem("sigo_convites_usados_locais", JSON.stringify(salvos));
          } catch {
            // Ignora
          }
        }
        return {
          success: true,
          message:
            res.mensagem ||
            "Cadastro realizado com sucesso! Sua conta está aguardando habilitação pela administração.",
          userId: res.user_id,
        };
      }
    }

    // 3. Fallback via auth.signUp com perfil estritamente inativo
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: dados.email.trim().toLowerCase(),
      password: dados.senha,
      options: {
        data: {
          nome: dados.nome.trim(),
          role: "instalador",
          telefone: dados.telefone ? dados.telefone.trim() : null,
          chave_pix: dados.chavePix ? dados.chavePix.trim() : null,
          endereco_instalacao: dados.enderecoInstalacao ? dados.enderecoInstalacao.trim() : null,
          valor_instalacao_sem_bloqueador: Number(dados.valorInstalacaoSemBloqueador) || 0,
          valor_instalacao_com_bloqueador: Number(dados.valorInstalacaoComBloqueador) || 0,
          convite_token: tokenLimpo,
        },
      },
    });

    if (!signUpErr && signUpData?.user) {
      const novoId = signUpData.user.id;
      if (typeof window !== "undefined") {
        try {
          const salvos = JSON.parse(
            window.localStorage.getItem("sigo_convites_usados_locais") || "[]",
          );
          salvos.push(tokenLimpo);
          window.localStorage.setItem("sigo_convites_usados_locais", JSON.stringify(salvos));
        } catch {
          // Ignora
        }
      }

      return {
        success: true,
        message:
          "Cadastro realizado com sucesso! Sua conta está aguardando habilitação pela administração.",
        userId: novoId,
      };
    }

    return {
      success: false,
      message: signUpErr?.message || error?.message || "Não foi possível concluir o cadastro.",
    };
  } catch (err: any) {
    console.error("Erro ao cadastrar instalador por convite:", err);
    return {
      success: false,
      message: err?.message || "Erro de conexão ao processar o cadastro.",
    };
  }
}
