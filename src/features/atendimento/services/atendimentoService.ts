import { supabase } from "@/integrations/supabase/client";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import type { Atendimento, AtendimentoProvidencia } from "../types";

/**
 * Busca todos os user IDs com perfil de operador/adm/superadmin para envio de notificações
 * quando um CLIENTE emite um chamado ou mensagem.
 */
async function notificarOperadoresSobreCliente(params: {
  titulo: string;
  mensagem: string;
  tipo: string;
  url: string;
}): Promise<void> {
  try {
    const { data: operadores } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["superadmin", "adm", "operador"])
      .eq("ativo", true);

    if (operadores && operadores.length > 0) {
      for (const op of operadores) {
        enviarNotificacaoViaBd({
          destinatarioUserId: op.id,
          titulo: params.titulo,
          mensagem: params.mensagem,
          tipo: params.tipo,
          url: params.url,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("Falha ao notificar operadores:", err);
  }
}

export async function carregarAtendimentos(): Promise<Atendimento[]> {
  try {
    const { data, error } = await supabase
      .from("atendimentos")
      .select(
        `
        id,
        numero_protocolo,
        cliente_id,
        veiculo_id,
        tipo,
        prioridade,
        status,
        titulo,
        descricao_inicial,
        solucao_conclusao,
        aberto_por,
        finalizado_por,
        finalizado_at,
        created_at,
        updated_at,
        clientes (
          nome_razao_social
        ),
        veiculos (
          id,
          placa,
          ativo,
          cliente_id
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error || !data) {
      console.warn("Erro ao carregar atendimentos:", error);
      return [];
    }

    return data.map((d: any) => {
      // Validação estrita de integridade:
      // O veículo só é exibido se existir no banco, pertencer ao mesmo cliente e estiver ativo
      const veiculoValido =
        d.veiculos &&
        d.veiculos.ativo !== false &&
        (!d.veiculos.cliente_id || d.veiculos.cliente_id === d.cliente_id);

      // Se havia um veículo inválido ou desvinculado gravado, higieniza no banco
      if (!veiculoValido && d.veiculo_id) {
        supabase
          .from("atendimentos")
          .update({ veiculo_id: null })
          .eq("id", d.id)
          .then(() => {});
      }

      return {
        id: d.id,
        numero_protocolo: d.numero_protocolo,
        cliente_id: d.cliente_id,
        cliente_nome: d.clientes?.nome_razao_social || "Cliente",
        veiculo_id: veiculoValido ? d.veiculo_id : null,
        veiculo_placa: veiculoValido ? d.veiculos?.placa : undefined,
        tipo: d.tipo,
        prioridade: d.prioridade,
        status: d.status,
        titulo: d.titulo,
        descricao_inicial: d.descricao_inicial,
        solucao_conclusao: d.solucao_conclusao,
        aberto_por: d.aberto_por,
        finalizado_por: d.finalizado_por,
        finalizado_at: d.finalizado_at,
        created_at: d.created_at,
        updated_at: d.updated_at,
      };
    });
  } catch (err) {
    console.error("Exceção ao listar atendimentos:", err);
    return [];
  }
}

export async function criarAtendimento(payload: {
  cliente_id: string;
  veiculo_id?: string | null;
  tipo: string;
  prioridade: Atendimento["prioridade"];
  titulo: string;
  descricao_inicial: string;
  usuario_id: string;
  usuario_role?: string;
  usuario_nome?: string;
}): Promise<Atendimento | null> {
  try {
    const { data, error } = await supabase
      .from("atendimentos")
      .insert({
        cliente_id: payload.cliente_id,
        veiculo_id: payload.veiculo_id || null,
        tipo: payload.tipo,
        prioridade: payload.prioridade,
        status: "aberto",
        titulo: payload.titulo,
        descricao_inicial: payload.descricao_inicial,
        aberto_por: payload.usuario_id,
      })
      .select()
      .single();

    if (error) throw error;

    // Notificação imediata inter-dispositivos e Web Push
    const isCliente = payload.usuario_role === "cliente";
    if (isCliente) {
      // Cliente abriu chamado → notificar TODOS os ADMs/Operadores
      notificarOperadoresSobreCliente({
        titulo: `💬 Novo Chamado de Suporte: ${payload.titulo}`,
        mensagem: `${payload.usuario_nome ? `${payload.usuario_nome}: ` : ""}${payload.descricao_inicial.slice(0, 150)}`,
        tipo: "atendimento",
        url: "/atendimento",
      });
    } else {
      // ADM/Operador abriu atendimento → notificar o CLIENTE específico
      enviarNotificacaoViaBd({
        destinatarioClienteId: payload.cliente_id,
        titulo: `💬 Atendimento Aberto: ${payload.titulo}`,
        mensagem: `${payload.usuario_nome ? `${payload.usuario_nome}: ` : ""}${payload.descricao_inicial.slice(0, 150)}`,
        tipo: "atendimento",
        url: "/atendimento",
      }).catch(() => {});
    }

    return data as Atendimento;
  } catch (err) {
    console.error("Erro ao criar atendimento:", err);
    return null;
  }
}

export async function carregarProvidencias(
  atendimentoId: string,
): Promise<AtendimentoProvidencia[]> {
  try {
    const { data, error } = await supabase
      .from("atendimento_providencias")
      .select("*")
      .eq("atendimento_id", atendimentoId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as AtendimentoProvidencia[];
  } catch (err) {
    console.warn("Erro ao buscar providências:", err);
    return [];
  }
}

export async function adicionarProvidenciaComCarimbo(params: {
  atendimento_id: string;
  providencia: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_role: string;
  cliente_id?: string;
  numero_protocolo?: number | string;
}): Promise<boolean> {
  try {
    // Insere a providência com carimbo automático inalterável
    const { error } = await supabase.from("atendimento_providencias").insert({
      atendimento_id: params.atendimento_id,
      usuario_id: params.usuario_id,
      usuario_nome: params.usuario_nome,
      usuario_role: params.usuario_role,
      providencia: params.providencia,
      ip_address: null,
    });

    if (error) throw error;

    // Atualiza status do atendimento para em_andamento se estiver aberto
    await supabase
      .from("atendimentos")
      .update({
        status: "em_andamento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.atendimento_id)
      .eq("status", "aberto");

    // Resgata dados para notificação se não informados
    let targetClienteId = params.cliente_id;
    let protocolo = params.numero_protocolo;
    if (!targetClienteId || !protocolo) {
      try {
        const { data: at } = await supabase
          .from("atendimentos")
          .select("cliente_id, numero_protocolo")
          .eq("id", params.atendimento_id)
          .maybeSingle();
        if (at) {
          targetClienteId = targetClienteId || at.cliente_id;
          protocolo = protocolo || at.numero_protocolo;
        }
      } catch {
        // Segue com o que tiver
      }
    }

    const isCliente = params.usuario_role === "cliente";
    const rotuloProtocolo = protocolo ? `#${protocolo}` : `#${params.atendimento_id.slice(0, 8)}`;

    if (isCliente) {
      // Cliente respondeu → notificar TODOS os ADMs/Operadores
      notificarOperadoresSobreCliente({
        titulo: `💬 Nova Mensagem do Cliente no Chamado ${rotuloProtocolo}`,
        mensagem: `${params.usuario_nome}: ${params.providencia.slice(0, 150)}`,
        tipo: "atendimento",
        url: "/atendimento",
      });
    } else {
      // ADM/Operador respondeu → notificar o CLIENTE específico
      enviarNotificacaoViaBd({
        destinatarioClienteId: targetClienteId,
        titulo: `💬 Nova Mensagem no Atendimento ${rotuloProtocolo}`,
        mensagem: `${params.usuario_nome}: ${params.providencia.slice(0, 150)}`,
        tipo: "atendimento",
        url: "/atendimento",
      }).catch((err) => console.warn("Falha no disparo de notificação de atendimento:", err));
    }

    return true;
  } catch (err) {
    console.error("Erro ao adicionar providência:", err);
    return false;
  }
}

export async function finalizarAtendimento(params: {
  atendimento_id: string;
  solucao_conclusao: string;
  finalizado_por: string;
  usuario_nome: string;
  usuario_role: string;
  cliente_id?: string;
  numero_protocolo?: number | string;
}): Promise<boolean> {
  try {
    // 1. Registra última providência automática de encerramento
    await supabase.from("atendimento_providencias").insert({
      atendimento_id: params.atendimento_id,
      usuario_id: params.finalizado_por,
      usuario_nome: params.usuario_nome,
      usuario_role: params.usuario_role,
      providencia: `ATENDIMENTO FINALIZADO: ${params.solucao_conclusao}`,
    });

    // 2. Atualiza registro principal
    const { error } = await supabase
      .from("atendimentos")
      .update({
        status: "resolvido",
        solucao_conclusao: params.solucao_conclusao,
        finalizado_por: params.finalizado_por,
        finalizado_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.atendimento_id);

    if (error) throw error;

    // Resgata dados para notificação do cliente se necessário
    let targetClienteId = params.cliente_id;
    let protocolo = params.numero_protocolo;
    if (!targetClienteId || !protocolo) {
      try {
        const { data: at } = await supabase
          .from("atendimentos")
          .select("cliente_id, numero_protocolo")
          .eq("id", params.atendimento_id)
          .maybeSingle();
        if (at) {
          targetClienteId = targetClienteId || at.cliente_id;
          protocolo = protocolo || at.numero_protocolo;
        }
      } catch {
        // Segue com o que tiver
      }
    }

    const rotuloProtocolo = protocolo ? `#${protocolo}` : `#${params.atendimento_id.slice(0, 8)}`;

    enviarNotificacaoViaBd({
      destinatarioClienteId: targetClienteId,
      titulo: `✅ Atendimento Concluído ${rotuloProtocolo}`,
      mensagem: `Seu chamado foi finalizado com sucesso. Solução técnica: ${params.solucao_conclusao.slice(0, 150)}`,
      tipo: "atendimento",
      url: "/atendimento",
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error("Erro ao finalizar atendimento:", err);
    return false;
  }
}
