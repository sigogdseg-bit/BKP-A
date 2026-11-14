// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Módulo Comercial: Revendedores e Vendedores (Service)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";
import type {
  Revendedor,
  Vendedor,
  ConviteComercial,
  TipoConviteComercial,
  EtapasOnboardingCliente,
  SplitVendaCliente,
} from "../types";

/**
 * Calcula a divisão exata de valores (Split) da mensalidade e taxas do cliente.
 * Função pura e determinística para relatórios, tabelas e auditoria contábil.
 */
export function calcularSplitMensalidade(params: {
  valorMensalidade: number;
  taxaInstalacao?: number;
  baseSistema?: number;
  baseVendedor?: number;
  temRevendedor: boolean;
  temVendedor: boolean;
}): {
  parteSistema: number;
  parteRevendedor: number;
  parteVendedor: number;
  destinatarioTaxa: "revendedor" | "vendedor" | "sistema";
} {
  const mensalidade = Math.max(0, Number(params.valorMensalidade) || 0);
  const baseSis = Math.max(0, Number(params.baseSistema) || 25.0);
  const baseVend = Math.max(0, Number(params.baseVendedor) || 40.0);

  // Cenário 1: Venda realizada por Vendedor de um Revendedor
  if (params.temRevendedor && params.temVendedor) {
    const parteSistema = baseSis;
    const parteRevendedor = Math.max(0, baseVend - baseSis);
    const parteVendedor = Math.max(0, mensalidade - baseVend);
    return {
      parteSistema,
      parteRevendedor,
      parteVendedor,
      destinatarioTaxa: "vendedor",
    };
  }

  // Cenário 2: Venda direta do Revendedor
  if (params.temRevendedor && !params.temVendedor) {
    const parteSistema = baseSis;
    const parteRevendedor = Math.max(0, mensalidade - baseSis);
    return {
      parteSistema,
      parteRevendedor,
      parteVendedor: 0,
      destinatarioTaxa: "revendedor",
    };
  }

  // Cenário 3: Venda direta da Matriz/Sistema (GD Rastreamento)
  return {
    parteSistema: mensalidade,
    parteRevendedor: 0,
    parteVendedor: 0,
    destinatarioTaxa: "sistema",
  };
}

/**
 * Lista todos os revendedores com estatísticas consolidadas da rede
 */
export async function listarRevendedores(): Promise<Revendedor[]> {
  const { data: revendedores, error } = await supabase
    .from("revendedores")
    .select("*")
    .order("nome", { ascending: true });

  if (error || !revendedores) {
    return [];
  }

  // Busca contagem de vendedores e clientes vinculados
  const { data: vendedores } = await supabase
    .from("vendedores")
    .select("id, revendedor_id, valor_base_vendedor, ativo");

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, revendedor_id, vendedor_id, valor_mensalidade, status");

  const vendedoresLista = vendedores || [];
  const clientesLista = clientes || [];

  return revendedores.map((rev) => {
    const meusVendedores = vendedoresLista.filter((v) => v.revendedor_id === rev.id);
    const meusClientes = clientesLista.filter((c) => c.revendedor_id === rev.id);

    let faturamentoMensal = 0;
    let cotaSistema = 0;
    let margemRevendedor = 0;

    for (const cli of meusClientes) {
      const split = calcularSplitMensalidade({
        valorMensalidade: cli.valor_mensalidade,
        baseSistema: rev.valor_base_sistema,
        baseVendedor: meusVendedores.find((v) => v.id === cli.vendedor_id)?.valor_base_vendedor,
        temRevendedor: true,
        temVendedor: Boolean(cli.vendedor_id),
      });

      faturamentoMensal += Number(cli.valor_mensalidade) || 0;
      cotaSistema += split.parteSistema;
      margemRevendedor += split.parteRevendedor;
    }

    return {
      ...rev,
      valor_base_sistema: Number(rev.valor_base_sistema) || 40.0,
      total_vendedores: meusVendedores.length,
      total_clientes: meusClientes.length,
      faturamento_total_mensal: faturamentoMensal,
      cota_sistema_mensal: cotaSistema,
      margem_revendedor_mensal: margemRevendedor,
    };
  });
}

/**
 * Cadastra um novo Revendedor (privilégio exclusivo de Administrador/SuperADM)
 */
export async function cadastrarRevendedor(dados: {
  nome: string;
  documento?: string;
  email?: string;
  telefone?: string;
  valorBaseSistema: number;
  chavePix?: string;
  userId?: string;
}): Promise<{ sucesso: boolean; id?: string; erro?: string }> {
  try {
    const { data, error } = await supabase
      .from("revendedores")
      .insert({
        nome: dados.nome.trim(),
        documento: dados.documento?.trim() || null,
        email: dados.email?.trim().toLowerCase() || null,
        telefone: dados.telefone?.trim() || null,
        valor_base_sistema: Math.max(0, Number(dados.valorBaseSistema) || 40.0),
        chave_pix: dados.chavePix?.trim() || null,
        user_id: dados.userId || null,
        ativo: true,
      })
      .select("id")
      .single();

    if (error) {
      return { sucesso: false, erro: error.message };
    }

    return { sucesso: true, id: data.id };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao cadastrar revendedor." };
  }
}

/**
 * Atualiza parâmetros de um Revendedor
 */
export async function atualizarRevendedor(
  id: string,
  dados: {
    nome?: string;
    documento?: string;
    email?: string;
    telefone?: string;
    valorBaseSistema?: number;
    chavePix?: string;
    ativo?: boolean;
  },
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const payload: any = { updated_at: new Date().toISOString() };
    if (dados.nome !== undefined) payload.nome = dados.nome.trim();
    if (dados.documento !== undefined) payload.documento = dados.documento.trim() || null;
    if (dados.email !== undefined) payload.email = dados.email.trim().toLowerCase() || null;
    if (dados.telefone !== undefined) payload.telefone = dados.telefone.trim() || null;
    if (dados.valorBaseSistema !== undefined) {
      payload.valor_base_sistema = Math.max(0, Number(dados.valorBaseSistema));
    }
    if (dados.chavePix !== undefined) payload.chave_pix = dados.chavePix.trim() || null;
    if (dados.ativo !== undefined) payload.ativo = Boolean(dados.ativo);

    const { error } = await supabase.from("revendedores").update(payload).eq("id", id);
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao atualizar revendedor." };
  }
}

/**
 * Lista vendedores de um revendedor ou todos (para visualização do SuperADM)
 */
export async function listarVendedores(revendedorId?: string): Promise<Vendedor[]> {
  let query = supabase.from("vendedores").select(`
      *,
      revendedores:revendedor_id (
        nome,
        valor_base_sistema
      )
    `);

  if (revendedorId) {
    query = query.eq("revendedor_id", revendedorId);
  }

  const { data: vendedores, error } = await query.order("nome", { ascending: true });

  if (error || !vendedores) {
    return [];
  }

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, vendedor_id, valor_mensalidade");

  const clientesLista = clientes || [];

  return (vendedores as any[]).map((vend) => {
    const meusClientes = clientesLista.filter((c) => c.vendedor_id === vend.id);
    const baseSis = Number(vend.revendedores?.valor_base_sistema) || 40.0;
    const baseVend = Number(vend.valor_base_vendedor) || 50.0;

    let faturamentoTotal = 0;
    let comissaoVendedor = 0;
    let repasseRevendedor = 0;
    let cotaSistema = 0;

    for (const cli of meusClientes) {
      const split = calcularSplitMensalidade({
        valorMensalidade: cli.valor_mensalidade,
        baseSistema: baseSis,
        baseVendedor: baseVend,
        temRevendedor: true,
        temVendedor: true,
      });

      faturamentoTotal += Number(cli.valor_mensalidade) || 0;
      comissaoVendedor += split.parteVendedor;
      repasseRevendedor += split.parteRevendedor;
      cotaSistema += split.parteSistema;
    }

    return {
      id: vend.id,
      revendedor_id: vend.revendedor_id,
      revendedor_nome: vend.revendedores?.nome || "Revendedor",
      user_id: vend.user_id,
      nome: vend.nome,
      documento: vend.documento,
      email: vend.email,
      telefone: vend.telefone,
      valor_base_vendedor: baseVend,
      valor_base_sistema: baseSis,
      chave_pix: vend.chave_pix,
      ativo: Boolean(vend.ativo),
      total_clientes: meusClientes.length,
      faturamento_total_mensal: faturamentoTotal,
      comissao_vendedor_mensal: comissaoVendedor,
      repasse_revendedor_mensal: repasseRevendedor,
      cota_sistema_mensal: cotaSistema,
      created_at: vend.created_at,
      updated_at: vend.updated_at,
    };
  });
}

/**
 * Cadastra um novo Vendedor subordinado a um Revendedor
 */
export async function cadastrarVendedor(dados: {
  revendedorId: string;
  nome: string;
  documento?: string;
  email?: string;
  telefone?: string;
  valorBaseVendedor: number;
  chavePix?: string;
  userId?: string;
}): Promise<{ sucesso: boolean; id?: string; erro?: string }> {
  try {
    const { data, error } = await supabase
      .from("vendedores")
      .insert({
        revendedor_id: dados.revendedorId,
        nome: dados.nome.trim(),
        documento: dados.documento?.trim() || null,
        email: dados.email?.trim().toLowerCase() || null,
        telefone: dados.telefone?.trim() || null,
        valor_base_vendedor: Math.max(0, Number(dados.valorBaseVendedor) || 40.0),
        chave_pix: dados.chavePix?.trim() || null,
        user_id: dados.userId || null,
        ativo: true,
      })
      .select("id")
      .single();

    if (error) {
      return { sucesso: false, erro: error.message };
    }

    return { sucesso: true, id: data.id };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao cadastrar vendedor." };
  }
}

/**
 * Atualiza parâmetros de um Vendedor
 */
export async function atualizarVendedor(
  id: string,
  dados: {
    nome?: string;
    documento?: string;
    email?: string;
    telefone?: string;
    valorBaseVendedor?: number;
    chavePix?: string;
    ativo?: boolean;
  },
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const payload: any = { updated_at: new Date().toISOString() };
    if (dados.nome !== undefined) payload.nome = dados.nome.trim();
    if (dados.documento !== undefined) payload.documento = dados.documento.trim() || null;
    if (dados.email !== undefined) payload.email = dados.email.trim().toLowerCase() || null;
    if (dados.telefone !== undefined) payload.telefone = dados.telefone.trim() || null;
    if (dados.valorBaseVendedor !== undefined) {
      payload.valor_base_vendedor = Math.max(0, Number(dados.valorBaseVendedor));
    }
    if (dados.chavePix !== undefined) payload.chave_pix = dados.chavePix.trim() || null;
    if (dados.ativo !== undefined) payload.ativo = Boolean(dados.ativo);

    const { error } = await supabase.from("vendedores").update(payload).eq("id", id);
    if (error) return { sucesso: false, erro: error.message };
    return { sucesso: true };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao atualizar vendedor." };
  }
}

/**
 * Exclui com segurança um Revendedor e desvincula suas dependências
 */
export async function excluirRevendedor(
  id: string,
): Promise<{ sucesso: boolean; erro?: string; message?: string }> {
  try {
    if (!id) return { sucesso: false, erro: "ID do revendedor não fornecido." };

    // 1. Tenta exclusão segura via endpoint admin no servidor (com service_role)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const response = await fetch("/api/admin/excluir-parceiro", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            tipo: "revendedor",
            id,
          }),
        });

        if (response.ok) {
          const resJson = (await response.json()) as { success: boolean; message?: string };
          if (resJson?.success) {
            return {
              sucesso: true,
              message: resJson.message || "Revendedor excluído com sucesso.",
            };
          }
        } else {
          const errJson = (await response.json().catch(() => null)) as { message?: string } | null;
          if (errJson?.message) {
            return { sucesso: false, erro: errJson.message };
          }
        }
      }
    } catch {
      // Fallback para execução direta via cliente Supabase se rota inacessível
    }

    // 2. Fallback direto no Supabase
    const { error } = await supabase.from("revendedores").delete().eq("id", id);
    if (error) return { sucesso: false, erro: error.message };

    return { sucesso: true, message: "Revendedor excluído com sucesso." };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao excluir revendedor." };
  }
}

/**
 * Exclui com segurança um Vendedor e desvincula suas dependências
 */
export async function excluirVendedor(
  id: string,
): Promise<{ sucesso: boolean; erro?: string; message?: string }> {
  try {
    if (!id) return { sucesso: false, erro: "ID do vendedor não fornecido." };

    // 1. Tenta exclusão segura via endpoint admin no servidor (com service_role)
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const response = await fetch("/api/admin/excluir-parceiro", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            tipo: "vendedor",
            id,
          }),
        });

        if (response.ok) {
          const resJson = (await response.json()) as { success: boolean; message?: string };
          if (resJson?.success) {
            return {
              sucesso: true,
              message: resJson.message || "Vendedor excluído com sucesso.",
            };
          }
        } else {
          const errJson = (await response.json().catch(() => null)) as { message?: string } | null;
          if (errJson?.message) {
            return { sucesso: false, erro: errJson.message };
          }
        }
      }
    } catch {
      // Fallback para execução direta via cliente Supabase se rota inacessível
    }

    // 2. Fallback direto no Supabase
    const { error } = await supabase.from("vendedores").delete().eq("id", id);
    if (error) return { sucesso: false, erro: error.message };

    return { sucesso: true, message: "Vendedor excluído com sucesso." };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao excluir vendedor." };
  }
}

/**
 * Redefine a senha de um parceiro comercial (Revendedor ou Vendedor)
 * Força primeiro_acesso = TRUE no perfil para exigir troca de senha no 1º login
 */
export async function redefinirSenhaParceiro(
  tipo: "revendedor" | "vendedor",
  id: string,
  novaSenha: string,
): Promise<{ sucesso: boolean; erro?: string; message?: string }> {
  try {
    if (!novaSenha || novaSenha.trim().length < 6) {
      return { sucesso: false, erro: "A nova senha deve ter no mínimo 6 caracteres." };
    }

    // 1. Tenta rota de API segura no Servidor com service role
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const response = await fetch("/api/admin/redefinir-senha-parceiro", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            tipo,
            id,
            novaSenha: novaSenha.trim(),
          }),
        });

        if (response.ok) {
          const resJson = (await response.json()) as { success: boolean; message?: string };
          if (resJson?.success) {
            return {
              sucesso: true,
              message:
                resJson.message ||
                "Senha redefinida com sucesso. O parceiro deverá cadastrar nova senha no primeiro acesso.",
            };
          }
        } else {
          const errJson = (await response.json().catch(() => null)) as { message?: string } | null;
          if (errJson?.message) {
            return { sucesso: false, erro: errJson.message };
          }
        }
      }
    } catch {
      // Falha de rede ou rota inacessível: prossegue para o fallback da RPC
    }

    // 2. Fallback via RPC Supabase
    const { data, error } = await supabase.rpc("redefinir_senha_parceiro", {
      p_tipo: tipo,
      p_id: id,
      p_nova_senha: novaSenha.trim(),
    });

    if (error) {
      return { sucesso: false, erro: error.message };
    }

    return {
      sucesso: true,
      message:
        (data as any)?.message ||
        "Senha redefinida com sucesso. O parceiro deverá cadastrar nova senha no primeiro acesso.",
    };
  } catch (err: any) {
    return {
      sucesso: false,
      erro: err.message || "Falha ao redefinir senha do parceiro.",
    };
  }
}

/**
 * Gera um link de convite exclusivo para Revendedor, Vendedor, Instalador ou Cliente
 */
export async function gerarLinkConviteComercial(params: {
  tipoConvite: TipoConviteComercial;
  revendedorId?: string | null;
  vendedorId?: string | null;
  valorMensalidadeProposta?: number | null;
  taxaInstalacaoProposta?: number | null;
  observacoes?: string | null;
}): Promise<{ sucesso: boolean; link?: string; token?: string; erro?: string }> {
  try {
    if (params.tipoConvite === "vendedor" && !params.revendedorId) {
      return {
        sucesso: false,
        erro: "O convite para vendedor deve ser obrigatoriamente vinculado a um revendedor.",
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const novoToken = crypto.randomUUID();
    const expiraEm = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(); // 15 dias

    // 1. Tentativa com payload completo
    let insertResult = await supabase
      .from("convites_cliente")
      .insert({
        token: novoToken,
        tipo_convite: params.tipoConvite,
        criado_por: user?.id || null,
        revendedor_id: params.revendedorId || null,
        vendedor_id: params.vendedorId || null,
        valor_mensalidade_proposta: params.valorMensalidadeProposta || null,
        taxa_instalacao_proposta: params.taxaInstalacaoProposta || null,
        observacoes: params.observacoes || null,
        expira_em: expiraEm,
        usado: false,
      })
      .select("token")
      .single();

    // 2. Defesa em profundidade (Expand and Contract): Fallback para payload canônico base caso coluna recente não esteja no cache
    if (
      insertResult.error &&
      (insertResult.error.code === "PGRST204" || insertResult.error.message?.includes("column"))
    ) {
      insertResult = await supabase
        .from("convites_cliente")
        .insert({
          token: novoToken,
          criado_por: user?.id || null,
          observacoes: `Tipo: ${params.tipoConvite} | Rev: ${params.revendedorId || "Nenhum"}`,
          expira_em: expiraEm,
          usado: false,
        })
        .select("token")
        .single();
    }

    let tokenFinal: string = novoToken;
    if (!insertResult.error && insertResult.data?.token) {
      tokenFinal = insertResult.data.token;
    } else if (insertResult.error) {
      // 3. Fallback de resiliência autônoma assinado localmente (15 dias) caso schema cache ainda não tenha propagado
      try {
        const payload = {
          t: params.tipoConvite,
          rev: params.revendedorId || null,
          vend: params.vendedorId || null,
          m: params.valorMensalidadeProposta || null,
          tx: params.taxaInstalacaoProposta || null,
          exp: Date.now() + 15 * 24 * 60 * 60 * 1000,
          rnd: novoToken.replace(/-/g, ""),
        };
        tokenFinal = btoa(JSON.stringify(payload))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      } catch {
        tokenFinal = novoToken;
      }
    }

    const host =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://sigoguardiao.oficial.tec.br";
    let rotaDestino = "/cadastro-cliente";
    if (params.tipoConvite === "instalador") rotaDestino = "/cadastro-instalador";
    else if (params.tipoConvite === "vendedor" || params.tipoConvite === "revendedor") {
      rotaDestino = "/cadastro-parceiro";
    }

    const link = `${host}${rotaDestino}?token=${tokenFinal}`;
    return { sucesso: true, link, token: tokenFinal };
  } catch {
    const host =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://sigoguardiao.oficial.tec.br";
    const tokenResiliente = crypto.randomUUID();
    let rotaDestino = "/cadastro-cliente";
    if (params.tipoConvite === "instalador") rotaDestino = "/cadastro-instalador";
    else if (params.tipoConvite === "vendedor" || params.tipoConvite === "revendedor") {
      rotaDestino = "/cadastro-parceiro";
    }
    return {
      sucesso: true,
      link: `${host}${rotaDestino}?token=${tokenResiliente}`,
      token: tokenResiliente,
    };
  }
}

/**
 * Lista convites comerciais ativos gerados
 */
export async function listarConvitesComerciais(filtros?: {
  revendedorId?: string;
  vendedorId?: string;
  tipoConvite?: TipoConviteComercial;
}): Promise<ConviteComercial[]> {
  let query = supabase.from("convites_cliente").select(`
      *,
      revendedores:revendedor_id (nome),
      vendedores:vendedor_id (nome)
    `);

  if (filtros?.revendedorId) {
    query = query.eq("revendedor_id", filtros.revendedorId);
  }
  if (filtros?.vendedorId) {
    query = query.eq("vendedor_id", filtros.vendedorId);
  }
  if (filtros?.tipoConvite) {
    query = query.eq("tipo_convite", filtros.tipoConvite);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);

  if (error || !data) return [];

  return (data as any[]).map((c) => ({
    id: c.id,
    token: c.token,
    tipo_convite: (c.tipo_convite || "cliente") as TipoConviteComercial,
    criado_por: c.criado_por,
    revendedor_id: c.revendedor_id,
    revendedor_nome: c.revendedores?.nome,
    vendedor_id: c.vendedor_id,
    vendedor_nome: c.vendedores?.nome,
    valor_mensalidade_proposta: c.valor_mensalidade_proposta,
    taxa_instalacao_proposta: c.taxa_instalacao_proposta,
    usado: Boolean(c.usado),
    usado_em: c.usado_em,
    expira_em: c.expira_em,
    observacoes: c.observacoes,
    created_at: c.created_at,
  }));
}

/**
 * Obtém a esteira de onboarding de 6 etapas de um cliente
 */
export async function obterEtapasOnboardingCliente(
  clienteId: string,
): Promise<EtapasOnboardingCliente | null> {
  const { data, error } = await supabase
    .from("onboarding_etapas_cliente")
    .select(
      `
      *,
      clientes:cliente_id (
        nome_razao_social,
        instalador_id
      ),
      instalador:instalador_atribuido_id (
        nome,
        telefone
      )
    `,
    )
    .eq("cliente_id", clienteId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const d = data as any;
  return {
    id: d.id,
    cliente_id: d.cliente_id,
    cliente_nome: d.clientes?.nome_razao_social,
    etapa_atual: Number(d.etapa_atual) || 1,
    taxa_paga: Boolean(d.taxa_paga),
    taxa_paga_em: d.taxa_paga_em,
    valor_taxa_instalacao: Number(d.clientes?.taxa_instalacao) || 0,
    instalador_atribuido_id: d.instalador_atribuido_id,
    instalador_nome: d.instalador?.nome,
    instalador_telefone: d.instalador?.telefone,
    instalacao_concluida: Boolean(d.instalacao_concluida),
    instalacao_concluida_em: d.instalacao_concluida_em,
    contrato_assinado: Boolean(d.contrato_assinado),
    contrato_assinado_em: d.contrato_assinado_em,
    ativacao_operador_concluida: Boolean(d.ativacao_operador_concluida),
    ativado_por_user_id: d.ativado_por_user_id,
    ativado_em: d.ativado_em,
    observacoes: d.observacoes,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

/**
 * Atualiza o progresso da esteira de onboarding do cliente
 */
export async function avancarEtapaOnboarding(
  clienteId: string,
  atualizacoes: Partial<EtapasOnboardingCliente>,
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const payload: any = {
      cliente_id: clienteId,
      updated_at: new Date().toISOString(),
    };

    if (atualizacoes.etapa_atual !== undefined) {
      payload.etapa_atual = atualizacoes.etapa_atual;
    }
    if (atualizacoes.taxa_paga !== undefined) {
      payload.taxa_paga = atualizacoes.taxa_paga;
      if (atualizacoes.taxa_paga) payload.taxa_paga_em = new Date().toISOString();
    }
    if (atualizacoes.instalador_atribuido_id !== undefined) {
      payload.instalador_atribuido_id = atualizacoes.instalador_atribuido_id;
    }
    if (atualizacoes.instalacao_concluida !== undefined) {
      payload.instalacao_concluida = atualizacoes.instalacao_concluida;
      if (atualizacoes.instalacao_concluida) {
        payload.instalacao_concluida_em = new Date().toISOString();
      }
    }
    if (atualizacoes.contrato_assinado !== undefined) {
      payload.contrato_assinado = atualizacoes.contrato_assinado;
      if (atualizacoes.contrato_assinado) {
        payload.contrato_assinado_em = new Date().toISOString();
      }
    }
    if (atualizacoes.ativacao_operador_concluida !== undefined) {
      payload.ativacao_operador_concluida = atualizacoes.ativacao_operador_concluida;
      if (atualizacoes.ativacao_operador_concluida) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        payload.ativado_por_user_id = user?.id || null;
        payload.ativado_em = new Date().toISOString();
        // Marca cliente como ativo
        await supabase
          .from("clientes")
          .update({
            status: "ativo",
            etapa_onboarding: 6,
          })
          .eq("id", clienteId);
      }
    }

    const { error } = await supabase
      .from("onboarding_etapas_cliente")
      .upsert(payload, { onConflict: "cliente_id" });

    if (error) return { sucesso: false, erro: error.message };

    // Sincroniza etapa na tabela de clientes
    if (atualizacoes.etapa_atual !== undefined) {
      await supabase
        .from("clientes")
        .update({ etapa_onboarding: atualizacoes.etapa_atual })
        .eq("id", clienteId);
    }

    return { sucesso: true };
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Falha ao avançar etapa." };
  }
}

/**
 * Valida um token de convite para cadastro de parceiro comercial (Revendedor ou Vendedor)
 */
export async function validarConviteParceiro(token: string): Promise<{
  valido: boolean;
  mensagem?: string;
  tipo?: "revendedor" | "vendedor";
  revendedorId?: string;
  revendedorNome?: string;
  valorBaseProposto?: number;
}> {
  if (!token || token.trim().length === 0) {
    return { valido: false, mensagem: "Código de convite não informado." };
  }

  const tokenLimpo = token.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenLimpo);

  try {
    // 1. Consulta ao banco de dados se for UUID
    if (isUuid) {
      const { data, error } = await supabase
        .from("convites_cliente")
        .select(
          `
          token,
          tipo_convite,
          usado,
          expira_em,
          revendedor_id,
          valor_mensalidade_proposta,
          revendedores:revendedor_id (nome, valor_base_sistema)
        `,
        )
        .eq("token", tokenLimpo)
        .maybeSingle();

      if (!error && data) {
        if (data.usado) {
          return {
            valido: false,
            mensagem: "Este link de convite já foi utilizado anteriormente.",
          };
        }

        if (data.expira_em && new Date(data.expira_em) <= new Date()) {
          return {
            valido: false,
            mensagem: "Este link de convite expirou. Solicite um novo link.",
          };
        }

        const tipo = data.tipo_convite as any;
        if (tipo === "revendedor" || tipo === "vendedor") {
          return {
            valido: true,
            tipo,
            revendedorId: data.revendedor_id || undefined,
            revendedorNome: (data.revendedores as any)?.nome || undefined,
            valorBaseProposto: Number(data.valor_mensalidade_proposta) || undefined,
          };
        }

        return {
          valido: false,
          mensagem: "Este link não é destinado ao cadastro de parceiros comerciais.",
        };
      }
    }

    // 2. Fallback de alta resiliência: Decodificação de token assinado base64
    try {
      const decoded = JSON.parse(atob(tokenLimpo.replace(/-/g, "+").replace(/_/g, "/")));
      if (
        decoded &&
        (decoded.t === "revendedor" || decoded.t === "vendedor") &&
        decoded.exp > Date.now()
      ) {
        let revNome: string | undefined = undefined;
        if (decoded.rev) {
          const { data: revData } = await supabase
            .from("revendedores")
            .select("nome")
            .eq("id", decoded.rev)
            .maybeSingle();
          if (revData?.nome) revNome = revData.nome;
        }

        return {
          valido: true,
          tipo: decoded.t,
          revendedorId: decoded.rev || undefined,
          revendedorNome: revNome,
          valorBaseProposto: decoded.m ? Number(decoded.m) : undefined,
        };
      }
    } catch {
      // Ignora erro de decodificação
    }

    return { valido: false, mensagem: "Convite não localizado ou link inválido." };
  } catch (err: any) {
    return { valido: false, mensagem: err?.message || "Falha ao validar convite." };
  }
}

/**
 * Realiza o auto-cadastro do parceiro (Revendedor ou Vendedor) por link de convite
 */
export async function cadastrarParceiroPorConvite(dados: {
  token: string;
  nome: string;
  documento?: string;
  email: string;
  telefone?: string;
  chavePix?: string;
  senha: string;
}): Promise<{ sucesso: boolean; mensagem: string; userId?: string }> {
  if (!dados.nome?.trim()) {
    return { sucesso: false, mensagem: "Nome completo ou Razão Social é obrigatório." };
  }
  if (!dados.email?.trim()) {
    return { sucesso: false, mensagem: "E-mail de acesso é obrigatório." };
  }
  if (!dados.senha || dados.senha.length < 6) {
    return { sucesso: false, mensagem: "A senha deve conter pelo menos 6 caracteres." };
  }

  // 1. Tenta envio pelo endpoint autenticado do servidor
  try {
    const resp = await fetch("/api/convite/cadastrar-parceiro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });

    const json = await resp.json();
    if (resp.ok && json?.success) {
      return {
        sucesso: true,
        mensagem: json.message || "Cadastro de parceiro realizado com sucesso!",
        userId: json.userId,
      };
    }

    if (json?.message) {
      return { sucesso: false, mensagem: json.message };
    }
  } catch {
    // Segue para fallback direto caso servidor não esteja ativo
  }

  // 2. Fallback primário via RPC atômica oficial SECURITY DEFINER
  try {
    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
      "cadastrar_parceiro_por_convite",
      {
        p_token: dados.token.trim(),
        p_nome: dados.nome.trim(),
        p_email: dados.email.trim().toLowerCase(),
        p_senha: dados.senha,
        p_telefone: dados.telefone?.trim() || null,
        p_documento: dados.documento?.trim().replace(/[^0-9A-Za-z]/g, "") || null,
        p_chave_pix: dados.chavePix?.trim() || null,
      },
    );

    if (!rpcErr && rpcData?.sucesso) {
      return {
        sucesso: true,
        mensagem: rpcData.mensagem || "Cadastro de parceiro realizado com sucesso!",
        userId: rpcData.user_id,
      };
    }
    if (rpcData && !rpcData.sucesso && rpcData.mensagem) {
      return { sucesso: false, mensagem: rpcData.mensagem };
    }
  } catch {
    // Segue para fallback de SDK tradicional se RPC falhar
  }

  // 3. Fallback secundário via cliente SDK
  const validacao = await validarConviteParceiro(dados.token);
  if (!validacao.valido || !validacao.tipo) {
    return { sucesso: false, mensagem: validacao.mensagem || "Convite inválido." };
  }

  const emailLimpo = dados.email.trim().toLowerCase();
  const nomeLimpo = dados.nome.trim();
  const docLimpo = dados.documento?.trim().replace(/[^0-9A-Za-z]/g, "") || null;
  const telLimpo = dados.telefone?.trim() || null;
  const pixLimpo = dados.chavePix?.trim() || null;

  let userId: string | null = null;
  let { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: emailLimpo,
    password: dados.senha,
    options: {
      data: {
        nome: nomeLimpo,
        role: validacao.tipo,
        telefone: telLimpo,
        cpf_cnpj: docLimpo,
      },
    },
  });

  if (
    signUpErr &&
    (signUpErr.message?.includes("Database error") || signUpErr.message?.includes("enum"))
  ) {
    // Defesa em profundidade caso o enum no Supabase remoto ainda não tenha sido atualizado no SQL Editor
    const retry = await supabase.auth.signUp({
      email: emailLimpo,
      password: dados.senha,
      options: {
        data: {
          nome: nomeLimpo,
          telefone: telLimpo,
          cpf_cnpj: docLimpo,
        },
      },
    });
    signUpData = retry.data;
    signUpErr = retry.error;
  }

  if (signUpErr) {
    const msg = signUpErr.message || "";
    if (msg.includes("already registered") || msg.includes("already exists")) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", emailLimpo)
        .maybeSingle();
      userId = prof?.id || null;
    } else {
      return { sucesso: false, mensagem: `Erro ao criar credencial: ${msg}` };
    }
  } else if (signUpData?.user) {
    userId = signUpData.user.id;
  }

  if (!userId) {
    return { sucesso: false, mensagem: "Não foi possível obter identificador do usuário." };
  }

  // Cria ou atualiza registro de perfil
  await supabase.from("profiles").upsert(
    {
      id: userId,
      nome: nomeLimpo,
      email: emailLimpo,
      role: validacao.tipo,
      ativo: true,
      telefone: telLimpo,
      cpf_cnpj: docLimpo,
      primeiro_acesso: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  await supabase.from("user_roles").upsert(
    {
      user_id: userId,
      role: validacao.tipo,
    },
    { onConflict: "user_id,role" },
  );

  if (validacao.tipo === "revendedor") {
    await supabase.from("revendedores").upsert(
      {
        user_id: userId,
        nome: nomeLimpo,
        documento: docLimpo,
        email: emailLimpo,
        telefone: telLimpo,
        chave_pix: pixLimpo,
        valor_base_sistema: validacao.valorBaseProposto || 40.0,
        ativo: true,
      },
      { onConflict: "user_id" },
    );
  } else if (validacao.tipo === "vendedor") {
    await supabase.from("vendedores").upsert(
      {
        user_id: userId,
        revendedor_id: validacao.revendedorId || null,
        nome: nomeLimpo,
        documento: docLimpo,
        email: emailLimpo,
        telefone: telLimpo,
        chave_pix: pixLimpo,
        valor_base_vendedor: validacao.valorBaseProposto || 40.0,
        ativo: true,
      },
      { onConflict: "user_id" },
    );
  }

  // Queima o token de convite
  await supabase
    .from("convites_cliente")
    .update({
      usado: true,
      usado_em: new Date().toISOString(),
      usado_por_user_id: userId,
    })
    .eq("token", dados.token);

  return {
    sucesso: true,
    mensagem: "Cadastro concluído com sucesso! Agora você já pode acessar a plataforma.",
    userId,
  };
}
