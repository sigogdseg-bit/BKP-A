import { supabase } from "@/integrations/supabase/client";
import { APP_NOME, APP_PUBLIC_URL } from "@/shared/lib/version";
import type {
  PropostaComercial,
  NovaPropostaInput,
  EditarPropostaInput,
  MetricasPropostas,
  StatusProposta,
  FaixaFrota,
} from "../types/proposta";

// Cálculo de Hash SHA-256 para integridade e rastreabilidade forense
export async function calcularHashProposta(conteudo: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dados = encoder.encode(conteudo);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dados);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
}

export function normalizarProposta(p: any): PropostaComercial {
  return {
    ...p,
    tipo_proposta: p.tipo_proposta || "individual",
    com_fidelidade_instalacao_cheia: Number(p.com_fidelidade_instalacao_cheia) || 380,
    com_fidelidade_mensalidade_cheia: Number(p.com_fidelidade_mensalidade_cheia) || 120,
    com_fidelidade_instalacao: Number(p.com_fidelidade_instalacao) || 0,
    com_fidelidade_mensalidade: Number(p.com_fidelidade_mensalidade) || 0,
    sem_fidelidade_instalacao_cheia: Number(p.sem_fidelidade_instalacao_cheia) || 420,
    sem_fidelidade_mensalidade_cheia: Number(p.sem_fidelidade_mensalidade_cheia) || 160,
    sem_fidelidade_instalacao: Number(p.sem_fidelidade_instalacao) || 0,
    sem_fidelidade_mensalidade: Number(p.sem_fidelidade_mensalidade) || 0,
    com_fidelidade_meses: Number(p.com_fidelidade_meses) || 12,
    aplicar_promocao: p.aplicar_promocao !== undefined ? Boolean(p.aplicar_promocao) : true,
    faixas_frota: p.faixas_frota || null,
    historico_contrapropostas: p.historico_contrapropostas || [],
    revendedor_id: p.revendedor_id || null,
    vendedor_id: p.vendedor_id || null,
    quantidade_veiculos: Number(p.quantidade_veiculos) || 1,
    origem_emissao: p.origem_emissao || "web",
    valor_base_repasse: Number(p.valor_base_repasse) || 0,
  } as PropostaComercial;
}

/**
 * Lista todas as propostas comerciais ordenadas pela data de criação decrescente.
 * Permite filtrar por vendedorId ou revendedorId para visão isolada da franquia/carteira.
 */
export async function listarPropostas(filtro?: {
  revendedorId?: string | null;
  vendedorId?: string | null;
}): Promise<PropostaComercial[]> {
  const queryParams = new URLSearchParams();
  if (filtro?.revendedorId) queryParams.set("revendedorId", filtro.revendedorId);
  if (filtro?.vendedorId) queryParams.set("vendedorId", filtro.vendedorId);
  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";

  // 1. Tenta API backend blindada com service_role
  try {
    const res = await fetch(`/api/propostas/listar${queryString}`, { method: "GET" });
    if (res.ok) {
      const json = await res.json();
      if (json?.success && Array.isArray(json?.propostas)) {
        return json.propostas.map(normalizarProposta);
      }
    }
  } catch {
    // prossegue para fallback direto
  }

  // 2. Fallback via cliente Supabase
  try {
    let query = supabase.from("propostas_comerciais" as any).select("*");

    if (filtro?.vendedorId) {
      query = query.eq("vendedor_id", filtro.vendedorId);
    } else if (filtro?.revendedorId) {
      query = query.eq("revendedor_id", filtro.revendedorId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao listar propostas comerciais:", error);
      return [];
    }

    return (data || []).map(normalizarProposta);
  } catch (err) {
    console.error("Exceção ao listar propostas comerciais:", err);
    return [];
  }
}

/**
 * Obtém a última proposta registrada para preenchimento de memória inteligente de valores e prazos.
 */
export async function obterUltimaProposta(): Promise<PropostaComercial | null> {
  try {
    const propostas = await listarPropostas();
    if (propostas && propostas.length > 0) {
      return propostas[0];
    }
    return null;
  } catch (err) {
    console.error("Exceção ao buscar última proposta comercial:", err);
    return null;
  }
}

/**
 * Cria uma nova proposta comercial salvando os dados e calculando o Hash SHA-256.
 */
export async function criarProposta(input: NovaPropostaInput): Promise<PropostaComercial> {
  const tipoProposta = input.tipo_proposta || "individual";
  const anoAtual = new Date().getFullYear();
  const randSeq = Math.floor(1000 + Math.random() * 9000);
  const numeroTemp = `PROP-${anoAtual}-${randSeq}`;
  const payloadHash = `${numeroTemp}|${tipoProposta}|${input.cliente_nome}|${input.cliente_telefone}|${input.com_fidelidade_instalacao}|${input.com_fidelidade_mensalidade}|${Date.now()}`;
  const hashSha256 = await calcularHashProposta(payloadHash);

  let userId: string | null = null;
  try {
    const sess = (await supabase.auth.getSession()).data?.session;
    userId = sess?.user?.id || (await supabase.auth.getUser()).data?.user?.id || null;
  } catch {
    // ignora
  }

  const payload = {
    tipo_proposta: tipoProposta,
    cliente_nome: input.cliente_nome.trim(),
    cliente_telefone: input.cliente_telefone.trim(),
    veiculo_marca:
      input.veiculo_marca?.trim() || (tipoProposta === "frota" ? "Frota Corporativa" : ""),
    veiculo_modelo:
      input.veiculo_modelo?.trim() || (tipoProposta === "frota" ? "Múltiplos Veículos" : ""),
    veiculo_ano: input.veiculo_ano?.trim() || (tipoProposta === "frota" ? "Diversos" : ""),
    com_fidelidade_meses: input.com_fidelidade_meses || 12,
    com_fidelidade_instalacao_cheia: input.com_fidelidade_instalacao_cheia ?? 380,
    com_fidelidade_mensalidade_cheia: input.com_fidelidade_mensalidade_cheia ?? 120,
    com_fidelidade_instalacao: input.com_fidelidade_instalacao,
    com_fidelidade_mensalidade: input.com_fidelidade_mensalidade,
    sem_fidelidade_instalacao_cheia: input.sem_fidelidade_instalacao_cheia ?? 420,
    sem_fidelidade_mensalidade_cheia: input.sem_fidelidade_mensalidade_cheia ?? 160,
    sem_fidelidade_instalacao: input.sem_fidelidade_instalacao,
    sem_fidelidade_mensalidade: input.sem_fidelidade_mensalidade,
    aplicar_promocao: input.aplicar_promocao !== undefined ? input.aplicar_promocao : true,
    faixas_frota: input.faixas_frota || null,
    observacoes: input.observacoes?.trim() || null,
    hash_sha256: hashSha256,
    created_by: userId,
    revendedor_id: input.revendedor_id || null,
    vendedor_id: input.vendedor_id || null,
    quantidade_veiculos: input.quantidade_veiculos || 1,
    origem_emissao: input.origem_emissao || "web",
    valor_base_repasse: input.valor_base_repasse || 0,
  };

  // 1. Tenta API backend blindada com service_role (elimina bloqueios de RLS e expiração de sessão)
  try {
    const res = await fetch("/api/propostas/salvar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.proposta) {
        return normalizarProposta(data.proposta);
      }
      if (data?.message) {
        throw new Error(data.message);
      }
    } else {
      const errJson = await res.json().catch(() => null);
      if (errJson?.message) {
        throw new Error(errJson.message);
      }
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes("Failed to fetch")) {
      console.warn("Aviso ao salvar proposta via /api/propostas/salvar:", apiErr.message);
    }
  }

  // 2. Fallback direto via cliente Supabase
  let numeroProposta = "";
  try {
    const { data: rpcNum } = await supabase.rpc("gerar_numero_proposta_comercial" as any);
    numeroProposta = rpcNum ? String(rpcNum) : numeroTemp;
  } catch {
    numeroProposta = numeroTemp;
  }

  const { data, error } = await supabase
    .from("propostas_comerciais" as any)
    .insert({
      ...payload,
      numero_proposta: numeroProposta,
      historico_contrapropostas: [],
      status: "pendente",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("Erro ao inserir proposta comercial no banco:", error);
    throw new Error(error?.message || "Erro ao salvar proposta comercial no banco de dados.");
  }

  return normalizarProposta(data);
}

/**
 * Atualiza/Edita uma proposta comercial existente, registrando contraproposta e rastro de auditoria.
 */
export async function editarProposta(
  id: string,
  input: EditarPropostaInput,
  propostaAtual: PropostaComercial,
): Promise<PropostaComercial> {
  const agoraIso = new Date().toISOString();
  const payloadHash = `${propostaAtual.numero_proposta}|${input.tipo_proposta}|${input.cliente_nome}|${input.com_fidelidade_instalacao}|${input.com_fidelidade_mensalidade}|${agoraIso}`;
  const novoHash = await calcularHashProposta(payloadHash);

  let operadorEmail = "Operador";
  try {
    const sess = (await supabase.auth.getSession()).data?.session;
    operadorEmail =
      sess?.user?.email || (await supabase.auth.getUser()).data?.user?.email || "Operador";
  } catch {
    // ignora
  }

  const payload = {
    id,
    operador: operadorEmail,
    tipo_proposta: input.tipo_proposta,
    cliente_nome: input.cliente_nome.trim(),
    cliente_telefone: input.cliente_telefone.trim(),
    veiculo_marca: input.veiculo_marca?.trim() || "",
    veiculo_modelo: input.veiculo_modelo?.trim() || "",
    veiculo_ano: input.veiculo_ano?.trim() || "",
    com_fidelidade_meses: input.com_fidelidade_meses || 12,
    com_fidelidade_instalacao_cheia:
      input.com_fidelidade_instalacao_cheia ?? propostaAtual.com_fidelidade_instalacao_cheia ?? 380,
    com_fidelidade_mensalidade_cheia:
      input.com_fidelidade_mensalidade_cheia ??
      propostaAtual.com_fidelidade_mensalidade_cheia ??
      120,
    com_fidelidade_instalacao: input.com_fidelidade_instalacao,
    com_fidelidade_mensalidade: input.com_fidelidade_mensalidade,
    sem_fidelidade_instalacao_cheia:
      input.sem_fidelidade_instalacao_cheia ?? propostaAtual.sem_fidelidade_instalacao_cheia ?? 420,
    sem_fidelidade_mensalidade_cheia:
      input.sem_fidelidade_mensalidade_cheia ??
      propostaAtual.sem_fidelidade_mensalidade_cheia ??
      160,
    sem_fidelidade_instalacao: input.sem_fidelidade_instalacao,
    sem_fidelidade_mensalidade: input.sem_fidelidade_mensalidade,
    aplicar_promocao:
      input.aplicar_promocao !== undefined
        ? input.aplicar_promocao
        : (propostaAtual.aplicar_promocao ?? true),
    faixas_frota: input.faixas_frota || null,
    observacoes: input.observacoes?.trim() || null,
    motivo_contraproposta: input.motivo_contraproposta || "Renegociação comercial",
    hash_sha256: novoHash,
  };

  // 1. Tenta API backend blindada com service_role
  try {
    const res = await fetch("/api/propostas/salvar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.proposta) {
        return normalizarProposta(data.proposta);
      }
      if (data?.message) {
        throw new Error(data.message);
      }
    } else {
      const errJson = await res.json().catch(() => null);
      if (errJson?.message) {
        throw new Error(errJson.message);
      }
    }
  } catch (apiErr: any) {
    if (apiErr?.message && !apiErr.message.includes("Failed to fetch")) {
      console.warn("Aviso ao editar proposta via /api/propostas/salvar:", apiErr.message);
    }
  }

  // 2. Fallback direto Supabase
  const novoItemHistorico = {
    data: agoraIso,
    operador: operadorEmail,
    motivo: input.motivo_contraproposta || "Reajuste / Contraproposta Comercial",
    resumo_alteracoes: `Atualização de valores. Com Fidelidade: R$ ${input.com_fidelidade_mensalidade}/mês. Sem Fidelidade: R$ ${input.sem_fidelidade_mensalidade}/mês.`,
  };

  const dadosAtualizacao: any = {
    ...payload,
    historico_contrapropostas: [
      novoItemHistorico,
      ...(propostaAtual.historico_contrapropostas || []),
    ],
    updated_at: agoraIso,
  };
  delete dadosAtualizacao.id;
  delete dadosAtualizacao.operador;
  delete dadosAtualizacao.motivo_contraproposta;

  const { data, error } = await supabase
    .from("propostas_comerciais" as any)
    .update(dadosAtualizacao)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    console.error("Erro ao atualizar proposta comercial no banco:", error);
    throw new Error(error?.message || "Erro ao atualizar proposta comercial no banco de dados.");
  }

  return normalizarProposta(data);
}

/**
 * Atualiza o status de uma proposta comercial.
 */
export async function atualizarStatusProposta(
  id: string,
  status: StatusProposta,
): Promise<boolean> {
  // 1. Tenta API backend
  try {
    const res = await fetch("/api/propostas/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success) return true;
    }
  } catch {
    // prossegue para fallback
  }

  // 2. Fallback Supabase
  try {
    const { error } = await supabase
      .from("propostas_comerciais" as any)
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("Erro ao atualizar status da proposta comercial:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exceção ao atualizar status da proposta comercial:", err);
    return false;
  }
}

/**
 * Exclui uma proposta comercial.
 */
export async function excluirProposta(id: string): Promise<boolean> {
  // 1. Tenta API backend
  try {
    const res = await fetch("/api/propostas/excluir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success) return true;
    }
  } catch {
    // prossegue para fallback
  }

  // 2. Fallback Supabase
  try {
    const { error } = await supabase
      .from("propostas_comerciais" as any)
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao excluir proposta comercial:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exceção ao excluir proposta comercial:", err);
    return false;
  }
}

/**
 * Calcula métricas de efetividade comercial e conversão das propostas.
 */
export function calcularMetricasPropostas(propostas: PropostaComercial[]): MetricasPropostas {
  const total = propostas.length;
  const pendentes = propostas.filter((p) => p.status === "pendente").length;
  const aceitas = propostas.filter((p) => p.status === "aceita").length;
  const recusadas = propostas.filter((p) => p.status === "recusada").length;
  const expiradas = propostas.filter((p) => p.status === "expirada").length;

  const taxaConversao = total > 0 ? (aceitas / total) * 100 : 0;

  return {
    total,
    pendentes,
    aceitas,
    recusadas,
    expiradas,
    taxaConversao,
  };
}

/**
 * Formata o texto para envio via WhatsApp de forma amigável, concisa e focada no valor promocional,
 * despertando o interesse do cliente em abrir e conferir o documento oficial em PDF.
 * Elimina textos auxiliares extensos para que o cliente abra e visualize a proposta completa.
 */
export function formatarMensagemWhatsAppProposta(proposta: PropostaComercial): string {
  const isFrota = proposta.tipo_proposta === "frota";
  const primeiroNome = (proposta.cliente_nome || "Cliente").trim().split(" ")[0];

  const veiculoDesc = isFrota
    ? `sua frota corporativa${proposta.quantidade_veiculos && proposta.quantidade_veiculos > 1 ? ` (${proposta.quantidade_veiculos} veículos)` : ""}`
    : proposta.veiculo_marca || proposta.veiculo_modelo
      ? `o seu ${[proposta.veiculo_marca, proposta.veiculo_modelo].filter(Boolean).join(" ")}${proposta.veiculo_ano ? ` (${proposta.veiculo_ano})` : ""}`
      : "o seu veículo";

  const linhas: string[] = [
    `Olá, *${primeiroNome}*! Tudo bem? 😊`,
    ``,
    `Conforme combinamos, segue a sua proposta comercial com valor promocional especial para ${veiculoDesc}.`,
    ``,
    `📄 O documento oficial em PDF (*Ref.: #${proposta.numero_proposta}*) já está anexo com todos os detalhes, benefícios e condições exclusivas que preparamos para você.`,
    ``,
    `Dê uma olhadinha no PDF! Tenho certeza de que você vai adorar os valores promocionais.`,
  ];

  if (proposta.observacoes) {
    linhas.push(``, `📝 *Observação:* ${proposta.observacoes}`);
  }

  linhas.push(
    ``,
    `Qualquer dúvida ou para confirmarmos sua ativação, estou à sua inteira disposição por aqui. É só me responder! 🚗✨`,
    ``,
    `_(Para aceitar e agendar sua ativação, basta responder *ACEITO* a esta mensagem)_`,
  );

  return linhas.join("\n");
}

/**
 * Gera o link universal do WhatsApp pronto para abertura imediata no app ou web.
 */
export function gerarLinkWhatsAppProposta(proposta: PropostaComercial): string {
  const telLimpo = proposta.cliente_telefone.replace(/\D/g, "");
  const numFinal = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
  const texto = formatarMensagemWhatsAppProposta(proposta);
  return `https://wa.me/${numFinal}?text=${encodeURIComponent(texto)}`;
}

/**
 * Envia proposta comercial diretamente pelo WhatsApp Gateway do sistema
 * e notifica o SuperADM com rastro de auditoria.
 */
export async function enviarPropostaViaWhatsapp(
  proposta: PropostaComercial,
  destinatarioPersonalizado?: string,
  emissorNome?: string,
  pdfBase64?: string,
  pdfNome?: string,
): Promise<{ sucesso: boolean; mensagem: string }> {
  try {
    const res = await fetch("/api/propostas/enviar-whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposta_id: proposta.id,
        destinatario: destinatarioPersonalizado || proposta.cliente_telefone,
        emissor_nome: emissorNome || "Operador Autorizado",
        pdf_base64: pdfBase64,
        pdf_nome: pdfNome,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.success) {
        return { sucesso: true, mensagem: "Proposta enviada pelo WhatsApp com sucesso!" };
      }
    }

    // Fallback: abre link wa.me
    if (typeof window !== "undefined") {
      const link = gerarLinkWhatsAppProposta(proposta);
      window.open(link, "_blank");
      return {
        sucesso: true,
        mensagem: "WhatsApp aberto com os dados da proposta prontos para envio!",
      };
    }

    return { sucesso: false, mensagem: "Não foi possível enviar a proposta via WhatsApp." };
  } catch (err: any) {
    if (typeof window !== "undefined") {
      const link = gerarLinkWhatsAppProposta(proposta);
      window.open(link, "_blank");
      return {
        sucesso: true,
        mensagem: "WhatsApp aberto via link direto com os dados da proposta!",
      };
    }
    return { sucesso: false, mensagem: err?.message || "Falha ao enviar via WhatsApp." };
  }
}
