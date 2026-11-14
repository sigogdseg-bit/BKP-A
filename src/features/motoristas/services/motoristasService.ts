// ============================================================================
// MÓDULO MOTORISTAS — Serviço CRUD + OCR CNH
// Diretrizes: DJR-NEW · Anti-Polling · RLS Estrito · Zero Mock
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import {
  isModoDegustacao,
  obterAbastecimentosDegustacaoMaster,
  obterMotoristasDegustacaoMaster,
  obterVeiculosDegustacaoMaster,
} from "@/features/demonstracao/services/degustacaoMasterService";
import type {
  Motorista,
  MotoristaForm,
  MotoristaVeiculo,
  Abastecimento,
  AbastecimentoForm,
  Despesa,
  DespesaForm,
  AlertaCNH,
  PerfilMotorista,
  OcrCnhResultado,
} from "../types";
import { uploadNF, notificarUploadNF } from "./nfStorageService";

// ---------------------------------------------------------------------------
// SANITIZAÇÃO DE DADOS NUMÉRICOS E DECIMAIS (PT-BR / UNIVERSAL)
// ---------------------------------------------------------------------------

/**
 * Sanitiza valores monetários e volumétricos no formato brasileiro ou internacional.
 * Previne que strings com vírgula ("45,50") virem NaN e causem erro de NOT NULL no banco.
 */
export function sanitizarNumeroDecimal(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    return isNaN(valor) || !isFinite(valor) ? null : valor;
  }
  let str = String(valor).trim();
  if (!str) return null;

  // Se tiver vírgula e ponto (ex: "1.234,56" ou "1,234.56")
  if (str.includes(",") && str.includes(".")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      // Padrão brasileiro: 1.234,56 -> 1234.56
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Padrão internacional: 1,234.56 -> 1234.56
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Formato simples brasileiro: 45,50 -> 45.50
    str = str.replace(",", ".");
  }

  const num = Number(str);
  return isNaN(num) || !isFinite(num) ? null : num;
}

/**
 * Sanitiza odômetro inteiro, aceitando notação de milhar com ponto (ex: "183.646" -> 183646)
 */
export function sanitizarKmOdometro(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    return isNaN(valor) || !isFinite(valor) ? null : Math.round(valor);
  }
  const str = String(valor).trim();
  if (!str) return null;

  // Notação de milhar brasileira com exatamente 3 dígitos após o ponto (ex: "183.646")
  if (/^\d{1,3}\.\d{3}$/.test(str)) {
    const n = parseInt(str.replace(".", ""), 10);
    return isNaN(n) ? null : n;
  }

  const dec = sanitizarNumeroDecimal(str);
  return dec === null ? null : Math.round(dec);
}

// ---------------------------------------------------------------------------
// MOTORISTAS — CRUD
// ---------------------------------------------------------------------------

/** Lista motoristas (do cliente autenticado ou de todos se admin/operador) */
export async function listarMotoristas(clienteId?: string): Promise<Motorista[]> {
  const sessaoAtual = obterSessaoCacheada();
  if (isModoDegustacao(sessaoAtual)) {
    return obterMotoristasDegustacaoMaster() as Motorista[];
  }

  let query = supabase.from("motoristas").select(
    `
      id, cliente_id, user_id, nome, cpf, data_nascimento, telefone, email,
      cnh_numero, cnh_categoria, cnh_validade, cnh_primeira_habilitacao,
      cnh_renach, cnh_observacoes, cnh_foto_url,
      acesso_mapa, ativo, created_at, updated_at,
      clientes:cliente_id (id, nome_razao_social)
    `,
  );

  if (clienteId && clienteId.trim()) {
    query = query.eq("cliente_id", clienteId.trim());
  }

  const { data, error } = await query.order("nome", { ascending: true });

  if (error) throw new Error(`Erro ao listar motoristas: ${error.message}`);
  return (data ?? []).map((m: any) => ({
    ...m,
    cliente_nome: m.clientes?.nome_razao_social || null,
  })) as Motorista[];
}

/** Cadastrar motorista via RPC segura */
export async function cadastrarMotorista(
  clienteId: string,
  form: MotoristaForm,
): Promise<{ motorista_id: string; user_id: string }> {
  const { data, error } = await supabase.rpc("cadastrar_motorista", {
    p_cliente_id: clienteId,
    p_nome: form.nome.trim(),
    p_email: form.email.trim().toLowerCase(),
    p_senha: form.senha,
    p_cpf: form.cpf || null,
    p_telefone: form.telefone || null,
    p_data_nascimento: normalizarDataCnh(form.data_nascimento) || null,
    p_cnh_numero: form.cnh_numero || null,
    p_cnh_categoria: form.cnh_categoria || null,
    p_cnh_validade: normalizarDataCnh(form.cnh_validade) || null,
    p_cnh_primeira: normalizarDataCnh(form.cnh_primeira_habilitacao) || null,
    p_cnh_renach: form.cnh_renach || null,
    p_cnh_observacoes: form.cnh_observacoes || null,
    p_cnh_foto_url: null,
  });

  if (error) throw new Error(error.message);
  return data as { motorista_id: string; user_id: string };
}

/** Atualizar dados do motorista (cliente ou superadm) */
export async function atualizarMotorista(
  motoristaId: string,
  campos: Partial<Omit<Motorista, "id" | "cliente_id" | "user_id" | "created_at" | "updated_at">>,
): Promise<void> {
  const { error } = await supabase
    .from("motoristas")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("id", motoristaId);

  if (error) throw new Error(`Erro ao atualizar motorista: ${error.message}`);
}

/** Inativar motorista (soft delete) */
export async function inativarMotorista(motoristaId: string): Promise<void> {
  await atualizarMotorista(motoristaId, { ativo: false });
}

/** Reativar motorista */
export async function reativarMotorista(motoristaId: string): Promise<void> {
  await atualizarMotorista(motoristaId, { ativo: true });
}

/** Habilitar ou desabilitar acesso ao mapa */
export async function alternarAcessoMapa(motoristaId: string, acesso: boolean): Promise<void> {
  await atualizarMotorista(motoristaId, { acesso_mapa: acesso });
}

/** Resetar senha do motorista via RPC segura do admin */
export async function resetarSenhaMotorista(userId: string, novaSenha: string): Promise<void> {
  const { error } = await supabase.rpc("admin_redefinir_senha", {
    p_user_id: userId,
    p_nova_senha: novaSenha,
  });
  if (error) throw new Error(`Erro ao redefinir senha: ${error.message}`);
}

/** Garantir login de motorista de forma atômica (auto-provisiona auth.users se não existir, atualiza email ou redefine senha) */
export async function garantirLoginMotorista(
  motoristaId: string,
  novaSenha?: string,
  novoEmail?: string,
): Promise<{ user_id: string; email?: string }> {
  const { data, error } = await supabase.rpc("garantir_login_motorista", {
    p_motorista_id: motoristaId,
    p_nova_senha: novaSenha || null,
    p_novo_email: novoEmail ? novoEmail.trim().toLowerCase() : null,
  });

  if (!error && data) {
    return data as { user_id: string; email?: string };
  }

  // Fallback defensivo caso a RPC ainda com 2 argumentos esteja em cache ou sendo chamada
  if (error && (error.code === "PGRST202" || error.message.includes("garantir_login_motorista"))) {
    // Tentar chamada com 2 parâmetros se não tiver novo email
    if (!novoEmail && novaSenha) {
      const { data: data2, error: err2 } = await supabase.rpc("garantir_login_motorista", {
        p_motorista_id: motoristaId,
        p_nova_senha: novaSenha,
      } as any);
      if (!err2 && data2) {
        return data2 as { user_id: string };
      }
    }

    const { data: mot } = await supabase
      .from("motoristas")
      .select("id, user_id, email")
      .eq("id", motoristaId)
      .maybeSingle();

    if (mot?.user_id && novaSenha) {
      const { error: errRedefinir } = await supabase.rpc("admin_redefinir_senha", {
        p_user_id: mot.user_id,
        p_nova_senha: novaSenha,
      });
      if (!errRedefinir) {
        return { user_id: mot.user_id };
      }
    }
  }

  throw new Error(
    `Erro ao garantir login do motorista: ${error?.message || "Falha na sincronização."}`,
  );
}

// ---------------------------------------------------------------------------
// ALERTAS DE CNH
// ---------------------------------------------------------------------------

export async function buscarAlertasCNH(clienteId?: string): Promise<AlertaCNH[]> {
  let query = supabase
    .from("alertas_cnh_motoristas")
    .select("*")
    .in("status_cnh", ["vencida", "a_vencer"]);

  if (clienteId && clienteId.trim()) {
    query = query.eq("cliente_id", clienteId.trim());
  }

  const { data, error } = await query;

  if (error) throw new Error(`Erro ao buscar alertas CNH: ${error.message}`);
  return (data ?? []) as AlertaCNH[];
}

// ---------------------------------------------------------------------------
// VÍNCULO MOTORISTA ↔ VEÍCULO
// ---------------------------------------------------------------------------

export async function listarVeiculosDoMotorista(motoristaId: string): Promise<MotoristaVeiculo[]> {
  const { data, error } = await supabase
    .from("motorista_veiculos")
    .select(
      `
      id, motorista_id, veiculo_id, ativo, created_at,
      veiculos!inner(placa, marca_modelo, cor)
    `,
    )
    .eq("motorista_id", motoristaId)
    .eq("ativo", true);

  if (error) throw new Error(`Erro ao listar veículos: ${error.message}`);

  return (data ?? []).map((r: any) => ({
    id: r.id,
    motorista_id: r.motorista_id,
    veiculo_id: r.veiculo_id,
    ativo: r.ativo,
    created_at: r.created_at,
    veiculo_placa: r.veiculos?.placa,
    veiculo_modelo: r.veiculos?.marca_modelo,
    veiculo_cor: r.veiculos?.cor,
  }));
}

export async function vincularVeiculoMotorista(
  motoristaId: string,
  veiculoId: string,
): Promise<void> {
  const { error } = await supabase
    .from("motorista_veiculos")
    .upsert(
      { motorista_id: motoristaId, veiculo_id: veiculoId, ativo: true },
      { onConflict: "motorista_id,veiculo_id" },
    );
  if (error) throw new Error(`Erro ao vincular veículo: ${error.message}`);
}

export async function desvincularVeiculoMotorista(motoristaVeiculoId: string): Promise<void> {
  const { error } = await supabase
    .from("motorista_veiculos")
    .update({ ativo: false })
    .eq("id", motoristaVeiculoId);
  if (error) throw new Error(`Erro ao desvincular veículo: ${error.message}`);
}

// ---------------------------------------------------------------------------
// ABASTECIMENTOS
// ---------------------------------------------------------------------------

export async function registrarAbastecimento(
  clienteId: string,
  motoristaId: string | null | undefined,
  form: AbastecimentoForm,
  nfFile?: File | null,
): Promise<string> {
  const agora = new Date().toISOString();

  // Se motoristaId foi informado, verifica se existe na tabela motoristas
  let motId: string | null = null;
  if (motoristaId) {
    const { data: existeMot } = await supabase
      .from("motoristas")
      .select("id")
      .eq("id", motoristaId)
      .maybeSingle();
    if (existeMot?.id) {
      motId = existeMot.id;
    }
  }

  // Se não foi passado ou não é motorista (ex: é o próprio cliente), busca motorista vinculado ao veículo
  if (!motId) {
    const { data: motVeic } = await supabase
      .from("motorista_veiculos")
      .select("motorista_id")
      .eq("veiculo_id", form.veiculo_id)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    motId = motVeic?.motorista_id || null;
  }

  // Se ainda não encontrou, busca se há algum motorista ativo deste cliente para vincular
  if (!motId && clienteId) {
    const { data: primeiroMot } = await supabase
      .from("motoristas")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (primeiroMot?.id) {
      motId = primeiroMot.id;
    }
  }

  const nfFormatada = form.nf_numero?.trim() ? form.nf_numero.trim().toUpperCase() : null;

  const litrosNum = sanitizarNumeroDecimal(form.litros);
  if (litrosNum === null || litrosNum <= 0) {
    throw new Error("A quantidade de litros abastecida é obrigatória e deve ser maior que zero.");
  }

  const valorTotalNum = sanitizarNumeroDecimal(form.valor_total);
  if (valorTotalNum === null || valorTotalNum <= 0) {
    throw new Error("O valor total do abastecimento é obrigatório e deve ser maior que zero.");
  }

  const kmNum = sanitizarKmOdometro(form.km_atual);
  const valorPorLitroNum =
    sanitizarNumeroDecimal(form.valor_por_litro) ||
    (litrosNum > 0 ? Number((valorTotalNum / litrosNum).toFixed(4)) : null);

  const payload: Record<string, unknown> = {
    veiculo_id: form.veiculo_id,
    cliente_id: clienteId,
    data_abastecimento: form.data_abastecimento,
    km_atual: kmNum,
    litros: litrosNum,
    valor_total: valorTotalNum,
    valor_por_litro: valorPorLitroNum,
    combustivel: form.combustivel,
    posto_nome: form.posto_nome?.trim() || null,
    posto_cidade: form.posto_cidade?.trim() || null,
    nf_numero: nfFormatada,
    observacoes: form.observacoes?.trim() || null,
  };

  if (motId) {
    payload.motorista_id = motId;
  }

  // Validação Anti-Duplicidade estrita de Nota Fiscal ou lançamento idêntico
  if (form.nf_numero && form.nf_numero.trim() && form.veiculo_id) {
    const { data: existente } = await supabase
      .from("motorista_abastecimentos")
      .select("id")
      .eq("veiculo_id", form.veiculo_id)
      .ilike("nf_numero", nfFormatada || form.nf_numero.trim())
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      throw new Error(
        `A Nota Fiscal nº ${form.nf_numero.trim()} já foi registrada anteriormente para este veículo. Não é permitido envio duplicado.`,
      );
    }
  } else if (!nfFormatada && form.veiculo_id && kmNum) {
    const { data: existente } = await supabase
      .from("motorista_abastecimentos")
      .select("id")
      .eq("veiculo_id", form.veiculo_id)
      .eq("data_abastecimento", form.data_abastecimento)
      .eq("km_atual", kmNum)
      .eq("valor_total", valorTotalNum)
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      throw new Error(
        `Já existe um abastecimento idêntico registrado para este veículo nesta data e odômetro. Não é permitido lançamento duplicado.`,
      );
    }
  }

  const { data, error } = await supabase
    .from("motorista_abastecimentos")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" || error.message?.includes("idx_abast_unico")) {
      throw new Error(
        "Este abastecimento já foi registrado no sistema (Nota Fiscal ou lançamento duplicado).",
      );
    }
    throw new Error(`Erro ao registrar abastecimento: ${error.message}`);
  }
  const id = data.id;

  // Upload de NF se houver arquivo
  if (nfFile) {
    const { path, uploadEm } = await uploadNF(
      clienteId,
      motId || clienteId,
      id,
      "abastecimento",
      nfFile,
    );
    await supabase
      .from("motorista_abastecimentos")
      .update({ nf_foto_url: path, nf_upload_em: uploadEm })
      .eq("id", id);

    // Notificação e registro de prazo para download (Momento 0: 48h) com envio de anexo no WhatsApp
    await notificarUploadNF(clienteId, form.veiculo_id, id, "abastecimento", {
      combustivel: form.combustivel,
      litros: litrosNum,
      valorTotal: valorTotalNum,
      postoNome: form.posto_nome,
      arquivoNf: nfFile,
      pathNf: path,
    });
  }

  // Se km_atual foi informado, atualiza o odômetro e painel do veículo no sistema
  if (kmNum && kmNum > 0 && form.veiculo_id) {
    await supabase
      .from("veiculos")
      .update({
        odometro_km: kmNum,
        hodometro_painel_km: kmNum,
        atualizado_em: agora,
      })
      .eq("id", form.veiculo_id)
      .then(() => {});
  }

  return id;
}

export async function listarAbastecimentosCliente(
  clienteId: string,
  limite = 50,
): Promise<Abastecimento[]> {
  const sessaoAtual = obterSessaoCacheada();
  if (isModoDegustacao(sessaoAtual)) {
    return obterAbastecimentosDegustacaoMaster() as Abastecimento[];
  }

  const { data, error } = await supabase
    .from("motorista_abastecimentos")
    .select(
      `
      id, motorista_id, veiculo_id, cliente_id,
      data_abastecimento, km_atual, litros, valor_total, valor_por_litro,
      combustivel, posto_nome, posto_cidade, nf_numero,
      nf_foto_url, nf_upload_em, nf_baixado, nf_baixado_em, nf_ciente_em, nf_expirado,
      observacoes, created_at, updated_at,
      motoristas(nome),
      veiculos(placa)
    `,
    )
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })
    .limit(limite * 2);

  if (error) throw new Error(`Erro ao listar abastecimentos: ${error.message}`);

  const listaBruta = (data ?? []).map((r: any) => ({
    ...r,
    litros: Number(r.litros),
    valor_total: Number(r.valor_total),
    valor_por_litro: r.valor_por_litro ? Number(r.valor_por_litro) : null,
    km_atual: r.km_atual ? Number(r.km_atual) : null,
    motorista_nome: r.motoristas?.nome || "Lançamento Direto / Gestão",
    veiculo_placa: r.veiculos?.placa,
  })) as Abastecimento[];

  // Deduplicação inteligente de registros duplicados por NF ou veículo+data+valor, priorizando anexo
  const mapaDeduplicado = new Map<string, Abastecimento>();
  for (const item of listaBruta) {
    const chave =
      item.nf_numero && item.nf_numero.trim()
        ? `nf_${item.veiculo_id}_${item.nf_numero.trim().toUpperCase()}`
        : `sem_nf_${item.veiculo_id}_${item.data_abastecimento}_${item.valor_total}_${item.km_atual || 0}`;

    const existente = mapaDeduplicado.get(chave);
    if (!existente) {
      mapaDeduplicado.set(chave, item);
    } else if (!existente.nf_foto_url && item.nf_foto_url) {
      mapaDeduplicado.set(chave, item);
    }
  }

  const listaDeduplicada = Array.from(mapaDeduplicado.values());
  return listaDeduplicada.slice(0, limite);
}

// ---------------------------------------------------------------------------
// DESPESAS
// ---------------------------------------------------------------------------

export async function registrarDespesa(
  clienteId: string,
  motoristaId: string | null | undefined,
  form: DespesaForm,
  nfFile?: File | null,
): Promise<string> {
  const agora = new Date().toISOString();

  let motId: string | null = null;
  if (motoristaId) {
    const { data: existeMot } = await supabase
      .from("motoristas")
      .select("id")
      .eq("id", motoristaId)
      .maybeSingle();
    if (existeMot?.id) {
      motId = existeMot.id;
    }
  }

  if (!motId) {
    const { data: motVeic } = await supabase
      .from("motorista_veiculos")
      .select("motorista_id")
      .eq("veiculo_id", form.veiculo_id)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    motId = motVeic?.motorista_id || null;
  }

  if (!motId && clienteId) {
    const { data: primeiroMot } = await supabase
      .from("motoristas")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (primeiroMot?.id) {
      motId = primeiroMot.id;
    }
  }

  const nfFormatada = form.nf_numero?.trim() ? form.nf_numero.trim().toUpperCase() : null;

  const valorDespesaNum = sanitizarNumeroDecimal(form.valor);
  if (valorDespesaNum === null || valorDespesaNum <= 0) {
    throw new Error("O valor da despesa é obrigatório e deve ser maior que zero.");
  }
  const kmDespesaNum = sanitizarKmOdometro(form.km_atual);

  const payload: Record<string, unknown> = {
    veiculo_id: form.veiculo_id,
    cliente_id: clienteId,
    data_despesa: form.data_despesa,
    categoria: form.categoria,
    descricao: form.descricao.trim(),
    valor: valorDespesaNum,
    km_atual: kmDespesaNum,
    nf_numero: nfFormatada,
    observacoes: form.observacoes?.trim() || null,
  };

  if (motId) {
    payload.motorista_id = motId;
  }

  // Validação Anti-Duplicidade estrita de Despesa
  if (nfFormatada && form.veiculo_id) {
    const { data: existente } = await supabase
      .from("motorista_despesas")
      .select("id")
      .eq("veiculo_id", form.veiculo_id)
      .ilike("nf_numero", nfFormatada)
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      throw new Error(
        `A Nota Fiscal nº ${nfFormatada} já foi registrada anteriormente para este veículo. Não é permitido envio duplicado.`,
      );
    }
  } else if (!nfFormatada && form.veiculo_id) {
    const { data: existente } = await supabase
      .from("motorista_despesas")
      .select("id")
      .eq("veiculo_id", form.veiculo_id)
      .eq("data_despesa", form.data_despesa)
      .eq("valor", valorDespesaNum)
      .ilike("descricao", form.descricao.trim())
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      throw new Error(
        `Já existe uma despesa idêntica registrada para este veículo com o mesmo valor e descrição nesta data.`,
      );
    }
  }

  const { data, error } = await supabase
    .from("motorista_despesas")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" || error.message?.includes("idx_despesas_unico")) {
      throw new Error(
        "Esta despesa já foi registrada no sistema (Nota Fiscal ou lançamento duplicado).",
      );
    }
    throw new Error(`Erro ao registrar despesa: ${error.message}`);
  }
  const id = data.id;

  if (nfFile) {
    const { path, uploadEm } = await uploadNF(clienteId, motId || clienteId, id, "despesa", nfFile);
    await supabase
      .from("motorista_despesas")
      .update({ nf_foto_url: path, nf_upload_em: uploadEm })
      .eq("id", id);

    // Notificação e registro de prazo para download (Momento 0: 48h) com envio de anexo no WhatsApp
    await notificarUploadNF(clienteId, form.veiculo_id, id, "despesa", {
      descricao: form.descricao,
      valorTotal: valorDespesaNum,
      arquivoNf: nfFile,
      pathNf: path,
    });
  }

  return id;
}

export async function listarDespesasCliente(clienteId: string, limite = 50): Promise<Despesa[]> {
  const { data, error } = await supabase
    .from("motorista_despesas")
    .select(
      `
      id, motorista_id, veiculo_id, cliente_id,
      data_despesa, categoria, descricao, valor, km_atual, nf_numero,
      nf_foto_url, nf_upload_em, nf_baixado, nf_baixado_em, nf_ciente_em, nf_expirado,
      observacoes, created_at, updated_at,
      motoristas(nome),
      veiculos(placa)
    `,
    )
    .eq("cliente_id", clienteId)
    .order("data_despesa", { ascending: false })
    .limit(limite * 2);

  if (error) throw new Error(`Erro ao listar despesas: ${error.message}`);

  const listaBruta = (data ?? []).map((r: any) => ({
    ...r,
    valor: Number(r.valor),
    km_atual: r.km_atual ? Number(r.km_atual) : null,
    motorista_nome: r.motoristas?.nome || "Lançamento Direto / Gestão",
    veiculo_placa: r.veiculos?.placa,
  })) as Despesa[];

  // Deduplicação inteligente de despesas
  const mapaDeduplicado = new Map<string, Despesa>();
  for (const item of listaBruta) {
    const chave =
      item.nf_numero && item.nf_numero.trim()
        ? `nf_${item.veiculo_id}_${item.nf_numero.trim().toUpperCase()}`
        : `sem_nf_${item.veiculo_id}_${item.data_despesa}_${item.valor}_${(item.descricao || "").trim().toUpperCase()}`;

    const existente = mapaDeduplicado.get(chave);
    if (!existente) {
      mapaDeduplicado.set(chave, item);
    } else if (!existente.nf_foto_url && item.nf_foto_url) {
      mapaDeduplicado.set(chave, item);
    }
  }

  return Array.from(mapaDeduplicado.values()).slice(0, limite);
}

// ---------------------------------------------------------------------------
// PORTAL DO MOTORISTA — Perfil próprio
// ---------------------------------------------------------------------------

export async function getMeuPerfilMotorista(): Promise<PerfilMotorista> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  // 1. Tenta motorista cadastrado na tabela motoristas
  const { data: mot } = await supabase
    .from("motoristas")
    .select(
      `
      id, nome, email, cpf, telefone,
      cnh_numero, cnh_categoria, cnh_validade, cnh_foto_url,
      acesso_mapa, cliente_id,
      clientes:cliente_id (nome_razao_social)
    `,
    )
    .eq("user_id", user.id)
    .eq("ativo", true)
    .maybeSingle();

  if (mot) {
    return {
      id: mot.id,
      nome: mot.nome,
      email: mot.email,
      cpf: mot.cpf,
      telefone: mot.telefone,
      cnh_numero: mot.cnh_numero,
      cnh_categoria: mot.cnh_categoria,
      cnh_validade: mot.cnh_validade,
      cnh_foto_url: mot.cnh_foto_url,
      acesso_mapa: Boolean(mot.acesso_mapa),
      cliente_id: mot.cliente_id,
      cliente_nome: (mot as any).clientes?.nome_razao_social || "Cliente GD Rastreamento",
    };
  }

  // 2. Se não encontrou motorista, busca na tabela clientes (cliente titular logado operando o próprio veículo)
  const { data: cli } = await supabase
    .from("clientes")
    .select("id, nome_razao_social, email, documento, telefone, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cli) {
    return {
      id: cli.id,
      nome: cli.nome_razao_social,
      email: cli.email || user.email || "",
      cpf: cli.documento,
      telefone: cli.telefone,
      cnh_numero: null,
      cnh_categoria: null,
      cnh_validade: null,
      cnh_foto_url: null,
      acesso_mapa: true,
      cliente_id: cli.id,
      cliente_nome: cli.nome_razao_social,
    };
  }

  // 3. Se for SuperADM / ADM / Operador, provê acesso administrativo com o primeiro cliente
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (prof && ["superadmin", "adm", "operador"].includes(prof.role)) {
    const { data: primeiroCli } = await supabase
      .from("clientes")
      .select("id, nome_razao_social, email, documento, telefone")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (primeiroCli) {
      return {
        id: primeiroCli.id,
        nome: `Gestão (${primeiroCli.nome_razao_social})`,
        email: user.email || primeiroCli.email || "",
        cpf: primeiroCli.documento,
        telefone: primeiroCli.telefone,
        cnh_numero: null,
        cnh_categoria: null,
        cnh_validade: null,
        cnh_foto_url: null,
        acesso_mapa: true,
        cliente_id: primeiroCli.id,
        cliente_nome: primeiroCli.nome_razao_social,
      };
    }
  }

  throw new Error("Perfil de motorista ou cliente não encontrado.");
}

export async function listarMeusVeiculos(): Promise<MotoristaVeiculo[]> {
  const sessaoAtual = obterSessaoCacheada();
  if (isModoDegustacao(sessaoAtual)) {
    const veics = obterVeiculosDegustacaoMaster();
    return veics.map((v) => ({
      id: v.id,
      motorista_id: "deg-mot-001",
      veiculo_id: v.id,
      ativo: true,
      created_at: new Date().toISOString(),
      veiculo_placa: v.placa,
      veiculo_modelo: v.marca_modelo,
      veiculo_cor: v.cor || "Prata",
      odometro_km: v.odometro || 18450,
    }));
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc("listar_veiculos_portal_motorista");
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return rpcData as MotoristaVeiculo[];
  }

  // Fallback: busca diretamente na tabela veiculos (isolado por RLS do usuário autenticado)
  const { data: veics, error: veicError } = await supabase
    .from("veiculos")
    .select("id, placa, marca_modelo, cor, created_at, odometro_km, ativo")
    .eq("ativo", true)
    .order("placa", { ascending: true });

  if (veicError) throw new Error(`Erro ao listar meus veículos: ${veicError.message}`);

  return (veics ?? []).map((v: any) => ({
    id: v.id,
    motorista_id: "",
    veiculo_id: v.id,
    ativo: true,
    created_at: v.created_at,
    veiculo_placa: v.placa,
    veiculo_modelo: v.marca_modelo,
    veiculo_cor: v.cor,
    odometro_km: v.odometro_km,
  }));
}

// ---------------------------------------------------------------------------
// OCR CNH — via Gemini Vision (PDF ou Foto da CNH Física)
// ---------------------------------------------------------------------------

function normalizarDataCnh(d: any): string | null {
  if (!d || typeof d !== "string") return null;
  const limpo = d.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo;
  const m = limpo.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function normalizarCpfCnh(c: any): string | null {
  if (!c || typeof c !== "string") return null;
  const nums = c.replace(/\D/g, "");
  if (nums.length === 11) {
    return nums.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return nums.length > 0 ? nums : null;
}

export async function extrairDadosCNH(file: File): Promise<OcrCnhResultado> {
  // SEGURANÇA: Nunca incluir chave de API no bundle do cliente.
  // O OCR é executado via proxy seguro /api/ocr-cnh (same-origin).
  // A chave VITE_GEMINI_API_KEY permanece apenas no servidor.
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? "";

  if (!apiKey) {
    console.warn("[OCR CNH] Chave de API não configurada no cliente. Usando proxy interno.");
  }

  // Converter arquivo para base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  let mimeType = file.type || "";
  const nomeMinusculo = (file.name || "").toLowerCase();

  if (mimeType.includes("pdf") || nomeMinusculo.endsWith(".pdf")) {
    mimeType = "application/pdf";
  } else if (mimeType.includes("png") || nomeMinusculo.endsWith(".png")) {
    mimeType = "image/png";
  } else if (mimeType.includes("webp") || nomeMinusculo.endsWith(".webp")) {
    mimeType = "image/webp";
  } else {
    mimeType = "image/jpeg";
  }

  let extracted: any = null;

  // 1. Tenta via proxy interno de alta performance (/api/ocr-cnh)
  // Esse proxy roda no mesmo domínio (same-origin), sendo imune a bloqueios de CSP, CORS e adblockers
  try {
    const res = await fetch("/api/ocr-cnh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, mimeType }),
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      if (json?.ok && json.data) {
        extracted = json.data;
      }
    }
  } catch (err) {
    console.warn("[OCR CNH] Proxy interno indisponível, tentando chamada direta:", err);
  }

  // 2. Se o proxy não retornou, tenta chamada direta
  if (!extracted) {
    const prompt = `Você é um perito oficial e especialista em leitura de documentos brasileiros de trânsito (CNH - Carteira Nacional de Habilitação).
O documento pode ser:
1. Documento Digital Oficial em PDF (Senatran / CNH Digital / Vio);
2. Foto de CNH física impressa em papel (modelo clássico verde, modelo novo verde-amarelo, aberta, dobrada, ou apenas a parte de dados/frente);
3. Foto tirada pela câmera de celular ou captura de tela.

Extraia com máxima precisão e fidelidade todos os campos disponíveis:
- nome: Nome completo do condutor / titular (se houver MRZ no rodapé, verifique a linha 3 como DARIO<<NOVAES<GONCALVES<JUNIOR)
- cpf: Os 11 dígitos do CPF (ex: 000.000.000-00 ou números puros)
- data_nascimento: Data de nascimento no formato YYYY-MM-DD
- cnh_numero: Número do Registro da CNH (campo "N° REGISTRO", 11 dígitos numéricos, ou linha 1 do MRZ)
- cnh_categoria: Categoria de habilitação (ex: A, B, AB, C, D, E, ACC)
- cnh_validade: Data de validade da CNH no formato YYYY-MM-DD
- cnh_primeira_habilitacao: Data da primeira habilitação no formato YYYY-MM-DD
- cnh_renach: Código RENACH do formulário (ex: RJ7409048M3 ou similar)
- cnh_observacoes: Campo de observações (ex: "EAR", "A", restrições médicas) se houver

REGRAS:
- Retorne EXCLUSIVAMENTE um objeto JSON válido com essas chaves.
- Se algum campo não estiver legível ou não existir no modelo da foto, atribua null a ele.
- Não invente dados.
- Sem markdown ou explicações fora do JSON.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              maxOutputTokens: 1024,
            },
          }),
        },
      );
    } catch (fetchErr: any) {
      throw new Error(
        `Falha de conexão ao enviar o documento: ${fetchErr?.message || "Verifique sua rede ou preencha manualmente."}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const erroTxt = await response.text();
      console.error("[OCR CNH] Erro na API Gemini:", response.status, erroTxt);
      throw new Error(
        `Falha no leitor de CNH (${response.status}). Preencha os dados manualmente.`,
      );
    }

    const json = await response.json();
    const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extrair JSON da resposta
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OCR não retornou dados estruturados.");

    extracted = JSON.parse(match[0]);
  }

  // Normalização refinada de datas e CPF
  const resultadoNormalizado = {
    nome: extracted.nome ? String(extracted.nome).trim() : null,
    cpf: normalizarCpfCnh(extracted.cpf),
    data_nascimento: normalizarDataCnh(extracted.data_nascimento),
    cnh_numero: extracted.cnh_numero ? String(extracted.cnh_numero).replace(/\D/g, "") : null,
    cnh_categoria: extracted.cnh_categoria
      ? String(extracted.cnh_categoria).trim().toUpperCase()
      : null,
    cnh_validade: normalizarDataCnh(extracted.cnh_validade),
    cnh_primeira_habilitacao: normalizarDataCnh(extracted.cnh_primeira_habilitacao),
    cnh_renach: extracted.cnh_renach ? String(extracted.cnh_renach).trim() : null,
    cnh_observacoes: extracted.cnh_observacoes ? String(extracted.cnh_observacoes).trim() : null,
  };

  const camposExtraidos = Object.entries(resultadoNormalizado)
    .filter(([, v]) => v !== null && v !== "")
    .map(([k]) => k);

  const confianca =
    camposExtraidos.length >= 5 ? "alta" : camposExtraidos.length >= 3 ? "media" : "baixa";

  return {
    ...resultadoNormalizado,
    confianca,
    campos_extraidos: camposExtraidos,
  } as OcrCnhResultado;
}
