// ============================================================================
// MÓDULO GESTÃO DE FUNCIONÁRIOS DO CLIENTE — SERVIÇO CANÔNICO
// Diretrizes: HUNTER-GUARDIAN / DJR-NEW · RLS Estrito · Anti-Polling
// ============================================================================
import { supabase } from "@/integrations/supabase/client";

export interface FuncionarioCliente {
  id: string;
  cliente_id: string;
  cliente_nome?: string;
  user_id: string;
  nome: string;
  email: string;
  telefone?: string | null;
  cargo?: string | null;
  modulos_permitidos: string[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
  // Campos complementares de presença/status
  ultimo_login?: string | null;
  sessao_ativa?: boolean;
}

export interface FuncionarioForm {
  nome: string;
  email: string;
  senha?: string;
  telefone?: string;
  cargo?: string;
  modulos: string[];
}

export const MODULOS_DELEGAVEIS_CLIENTE = [
  {
    id: "monitor-gps",
    nome: "Mapa Operacional e Telemetria",
    desc: "Acompanhamento em tempo real, velocidade e status de ignição",
  },
  {
    id: "rotas",
    nome: "Rotas e Trajetos Inteligentes",
    desc: "Planejamento de itinerários e navegação detalhada",
  },
  {
    id: "frota",
    nome: "Desempenho da Frota",
    desc: "Quilometragem, telemetria diária e score de condução",
  },
  {
    id: "abastecimento",
    nome: "Abastecimento e Despesas",
    desc: "Lançamento de combustível e notas fiscais",
  },
  {
    id: "manutencao",
    nome: "Manutenção Preventiva",
    desc: "Controle de revisões, troca de óleo e pneus",
  },
  {
    id: "motoristas",
    nome: "Gestão de Motoristas",
    desc: "Acompanhamento da equipe de condutores cadastrados",
  },
];

/**
 * Obtém a lista simplificada de clientes para seleção por administradores
 */
export async function obterClientesParaSelecao(): Promise<
  Array<{ id: string; nome_razao_social: string }>
> {
  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome_razao_social")
      .order("nome_razao_social", { ascending: true });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error("[HUNTER-FUNCIONARIOS] Erro ao carregar clientes para selecao:", err);
    return [];
  }
}

/**
 * Lista funcionários vinculados a um cliente ou de todos os clientes (para administradores)
 */
export async function listarFuncionariosCliente(clienteId?: string): Promise<FuncionarioCliente[]> {
  try {
    let query = supabase
      .from("funcionarios_cliente")
      .select("*, cliente:clientes!funcionarios_cliente_cliente_id_fkey(id, nome_razao_social)");

    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }

    const { data, error } = await query.order("nome", { ascending: true });

    if (error) {
      // Fallback sem join
      let fallbackQuery = supabase.from("funcionarios_cliente").select("*");
      if (clienteId) {
        fallbackQuery = fallbackQuery.eq("cliente_id", clienteId);
      }
      const { data: fbData, error: fbError } = await fallbackQuery.order("nome", {
        ascending: true,
      });
      if (fbError) {
        const msg = (fbError.message || "").toLowerCase();
        if (
          msg.includes("schema cache") ||
          msg.includes("could not find the table") ||
          msg.includes("relation") ||
          fbError.code === "PGRST205" ||
          fbError.code === "42P01"
        ) {
          console.warn(
            "[HUNTER-FUNCIONARIOS] Tabela funcionarios_cliente pendente de migração no Supabase.",
          );
          return [];
        }
        console.error("[HUNTER-FUNCIONARIOS] Erro ao listar funcionários:", fbError);
        throw new Error(fbError.message);
      }
      return (fbData || []).map((f: any) => ({
        ...f,
        modulos_permitidos: Array.isArray(f.modulos_permitidos) ? f.modulos_permitidos : [],
      }));
    }

    return (data || []).map((f: any) => ({
      ...f,
      cliente_nome: f.cliente?.nome_razao_social || undefined,
      modulos_permitidos: Array.isArray(f.modulos_permitidos) ? f.modulos_permitidos : [],
    }));
  } catch (err: any) {
    const msg = (err?.message || "").toLowerCase();
    if (
      msg.includes("schema cache") ||
      msg.includes("could not find the table") ||
      msg.includes("relation")
    ) {
      console.warn(
        "[HUNTER-FUNCIONARIOS] Tabela funcionarios_cliente pendente de migração no Supabase.",
      );
      return [];
    }
    console.error("[HUNTER-FUNCIONARIOS] Exceção ao listar funcionários:", err);
    throw err;
  }
}

/**
 * Cadastra um novo funcionário com credencial de acesso, senha inicial provisória e módulos
 */
export async function cadastrarFuncionario(
  clienteId: string,
  form: FuncionarioForm,
): Promise<{ success: boolean; funcionario_id?: string; user_id?: string; mensagem?: string }> {
  if (!clienteId) {
    throw new Error("Selecione o cliente titular ao qual este colaborador pertencerá.");
  }
  if (!form.nome?.trim()) throw new Error("O nome do colaborador é obrigatório.");
  if (!form.email?.trim()) throw new Error("O e-mail de acesso é obrigatório.");
  if (!form.senha || form.senha.length < 6) {
    throw new Error("A senha inicial provisória deve conter no mínimo 6 caracteres.");
  }

  const { data, error } = await supabase.rpc("cadastrar_funcionario", {
    p_cliente_id: clienteId,
    p_nome: form.nome.trim(),
    p_email: form.email.trim().toLowerCase(),
    p_senha: form.senha,
    p_telefone: form.telefone?.trim() || null,
    p_cargo: form.cargo?.trim() || null,
    p_modulos: form.modulos || [],
  });

  if (error) {
    console.error("[HUNTER-FUNCIONARIOS] Erro ao cadastrar funcionário:", error);
    throw new Error(error.message);
  }

  return (data as any) || { success: true };
}

/**
 * Atualiza dados e módulos permitidos do funcionário
 */
export async function atualizarFuncionario(
  funcionarioId: string,
  form: Partial<FuncionarioForm>,
  ativo: boolean = true,
): Promise<{ success: boolean; mensagem?: string }> {
  if (!funcionarioId) throw new Error("ID do funcionário não informado.");

  const { data, error } = await supabase.rpc("atualizar_funcionario", {
    p_funcionario_id: funcionarioId,
    p_nome: (form.nome || "").trim(),
    p_telefone: form.telefone?.trim() || null,
    p_cargo: form.cargo?.trim() || null,
    p_modulos: form.modulos || [],
    p_ativo: ativo,
  });

  if (error) {
    console.error("[HUNTER-FUNCIONARIOS] Erro ao atualizar funcionário:", error);
    throw new Error(error.message);
  }

  return (data as any) || { success: true };
}

/**
 * Exclui um funcionário e revoga seus acessos ao sistema
 */
export async function excluirFuncionario(
  funcionarioId: string,
): Promise<{ success: boolean; mensagem?: string }> {
  if (!funcionarioId) throw new Error("ID do funcionário não informado.");

  const { data, error } = await supabase.rpc("excluir_funcionario", {
    p_funcionario_id: funcionarioId,
  });

  if (error) {
    console.error("[HUNTER-FUNCIONARIOS] Erro ao excluir funcionário:", error);
    throw new Error(error.message);
  }

  return (data as any) || { success: true };
}
