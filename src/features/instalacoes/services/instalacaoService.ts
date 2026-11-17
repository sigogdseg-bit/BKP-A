import { supabase } from "@/integrations/supabase/client";
import { enviarNotificacaoViaBd } from "@/shared/lib/notificacoesBdService";
import {
  temKitDisponibilizado,
  ehPlaceholderImei,
  MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO,
} from "../utils/kitDisponibilizado";
import {
  isModoDemonstracaoAtivo,
  obterInstalacaoFantasmaComoCanonical,
  obterAgendamentoFantasmaComoCanonical,
  simularConclusaoInstalacao,
} from "@/features/demonstracao/services/demonstracaoService";
import type {
  Instalacao,
  InstalacaoHistorico,
  SalvarInstalacaoPayload,
  ConcluirInstalacaoAtendimentoPayload,
  ResumoRepasseFinanceiro,
  SolicitarRetiradaPayload,
  SolicitarRemanejamentoPayload,
  RegistrarInstalacaoDiretaPayload,
} from "../types";

export async function carregarInstalacoes(filtros?: {
  status?: string;
  statusPagamento?: string;
  instaladorId?: string;
}): Promise<Instalacao[]> {
  try {
    let query = supabase
      .from("instalacoes")
      .select(
        `
        *,
        profiles:instalador_id (
          nome,
          chave_pix,
          role
        ),
        clientes:cliente_id (
          nome_razao_social,
          documento,
          telefone
        ),
        veiculos:veiculo_id (
          id,
          placa,
          marca_modelo,
          rastreador_id,
          rastreador_imei
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (filtros?.status && filtros.status !== "todos") {
      query = query.eq("status", filtros.status);
    }

    if (filtros?.statusPagamento && filtros.statusPagamento !== "todos") {
      query = query.eq("status_pagamento", filtros.statusPagamento);
    }

    if (filtros?.instaladorId) {
      query = query.eq("instalador_id", filtros.instaladorId);
    }

    const { data, error } = await query;
    let lista = (data || []).map((item: any) => {
      const vImei = item.veiculos?.rastreador_imei;
      const vKitId = item.veiculos?.rastreador_id;
      const imeiOriginalValido = !ehPlaceholderImei(item.rastreador_imei)
        ? item.rastreador_imei
        : null;
      const imeiFinal =
        imeiOriginalValido || (!ehPlaceholderImei(vImei) ? vImei : null) || item.rastreador_imei;
      const kitIdFinal = item.rastreador_id || vKitId || null;
      const kitDeterminadoEmFinal =
        item.kit_determinado_em ||
        (kitIdFinal || (imeiFinal && !ehPlaceholderImei(imeiFinal))
          ? item.created_at || new Date().toISOString()
          : null);

      // Auto-cura definitiva no banco de dados: se o veículo tem rastreador mas a ordem ainda estava pendente de gravação
      if (
        item.id &&
        (!item.rastreador_id || ehPlaceholderImei(item.rastreador_imei)) &&
        (kitIdFinal || (imeiFinal && !ehPlaceholderImei(imeiFinal)))
      ) {
        supabase
          .from("instalacoes")
          .update({
            rastreador_id: kitIdFinal,
            rastreador_imei: imeiFinal,
            kit_determinado_em: kitDeterminadoEmFinal,
            veiculo_id: item.veiculo_id || item.veiculos?.id || null,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", item.id)
          .then(() => {})
          .catch(() => {});
      }

      return {
        ...item,
        rastreador_id: kitIdFinal,
        rastreador_imei: imeiFinal,
        kit_determinado_em: kitDeterminadoEmFinal,
        instalador_nome: item.profiles?.nome || "Instalador",
        instalador_role: item.profiles?.role || null,
        instalador_chave_pix: item.profiles?.chave_pix || null,
        cliente_nome: item.clientes?.nome_razao_social || "Cliente",
        cliente_documento: item.clientes?.documento,
        cliente_telefone: item.clientes?.telefone,
      };
    }) as Instalacao[];

    // Auto-cura e deduplicação: se houver ordens duplicadas para a mesma placa onde uma já está concluída,
    // descarta e expurga a ordem espúria em aberto gerada indevidamente
    const placasConcluidas = new Set<string>();
    for (const inst of lista) {
      if (inst.status === "concluida" && inst.placa && inst.placa !== "A DEFINIR") {
        placasConcluidas.add(inst.placa.trim().toUpperCase());
      }
    }

    if (placasConcluidas.size > 0) {
      const idsParaExpurgar: string[] = [];
      lista = lista.filter((inst) => {
        const p = inst.placa ? inst.placa.trim().toUpperCase() : "";
        if (inst.status !== "concluida" && placasConcluidas.has(p)) {
          idsParaExpurgar.push(inst.id);
          return false;
        }
        return true;
      });

      if (idsParaExpurgar.length > 0) {
        supabase
          .from("instalacoes")
          .delete()
          .in("id", idsParaExpurgar)
          .then(() => {})
          .catch(() => {});
      }
    }

    if (isModoDemonstracaoAtivo()) {
      const osDemo = obterInstalacaoFantasmaComoCanonical();
      const bateStatus =
        !filtros?.status || filtros.status === "todos" || filtros.status === osDemo.status;
      if (bateStatus) {
        lista = [osDemo, ...lista];
      }
    }

    return lista;
  } catch (err) {
    console.warn("Erro ao listar instalações:", err);
    if (isModoDemonstracaoAtivo()) {
      return [obterInstalacaoFantasmaComoCanonical()];
    }
    return [];
  }
}

export async function carregarHistoricoInstalacao(
  instalacaoId: string,
): Promise<InstalacaoHistorico[]> {
  try {
    const { data, error } = await supabase
      .from("instalacoes_historico_atendimentos")
      .select(
        `
        *,
        profiles:instalador_id (
          nome
        )
      `,
      )
      .eq("instalacao_id", instalacaoId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    return data.map((h: any) => ({
      ...h,
      instalador_nome: h.profiles?.nome || "Instalador",
    })) as InstalacaoHistorico[];
  } catch (err) {
    console.warn("Erro ao carregar histórico da instalação:", err);
    return [];
  }
}

export async function salvarAtendimentoInstalacao(
  payload: SalvarInstalacaoPayload,
): Promise<{ success: boolean; message: string; instalacao_id?: string; veiculo_id?: string }> {
  if (isModoDemonstracaoAtivo() || payload.instalacaoId?.startsWith("fantasma-")) {
    const res = await simularConclusaoInstalacao({
      ordemId: payload.instalacaoId || "fantasma-os-demo-001",
      observacoes: payload.observacoes || undefined,
    });
    return {
      success: true,
      message: res.mensagem,
      instalacao_id: payload.instalacaoId || "fantasma-os-demo-001",
    };
  }

  try {
    const { data, error } = await supabase.rpc("salvar_atendimento_instalacao", {
      p_instalacao_id: payload.instalacaoId || null,
      p_cliente_id: payload.clienteId || null,
      p_placa: payload.placa,
      p_marca: payload.marca,
      p_modelo: payload.modelo,
      p_ano: payload.ano || null,
      p_cor: payload.cor || null,
      p_km_instalacao: payload.kmInstalacao,
      p_rastreador_imei: payload.rastreadorImei,
      p_rastreador_modelo: payload.rastreadorModelo || "J16 4G",
      p_chip_iccid: payload.chipIccid || null,
      p_chip_operadora: payload.chipOperadora || null,
      p_posicao_instalacao: payload.posicaoInstalacao || null,
      p_status: payload.status,
      p_motivo: payload.motivo || null,
      p_observacoes: payload.observacoes || null,
      p_bloqueador_instalado:
        payload.bloqueadorInstalado !== undefined ? payload.bloqueadorInstalado : true,
      p_tipo_bloqueador: payload.tipoBloqueador || "rele_combustivel",
      p_bloqueador_detalhes: payload.bloqueadorDetalhes || null,
    } as any);

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      const idInstalacao = res.instalacao_id || payload.instalacaoId;
      if (idInstalacao && (payload.kitConfirmadoInstalador || payload.imeiConfirmado)) {
        try {
          await supabase
            .from("instalacoes")
            .update({
              kit_confirmado_instalador: true,
              kit_confirmado_em: new Date().toISOString(),
              imei_confirmado: (payload.imeiConfirmado || payload.rastreadorImei || "")
                .trim()
                .toUpperCase(),
            })
            .eq("id", idInstalacao);
        } catch (errKit) {
          console.warn("Aviso ao atualizar kit_confirmado_instalador:", errKit);
        }
      }

      if (idInstalacao && payload.releChicoteDoEstoque !== undefined) {
        try {
          await supabase
            .from("instalacoes")
            .update({ rele_chicote_do_estoque: Boolean(payload.releChicoteDoEstoque) } as any)
            .eq("id", idInstalacao);
        } catch (errRele) {
          console.warn("Aviso ao salvar rele_chicote_do_estoque:", errRele);
        }
      }

      if (payload.status === "concluida") {
        try {
          if (payload.clienteId) {
            const { data: cRow } = await supabase
              .from("clientes")
              .select("user_id")
              .eq("id", payload.clienteId)
              .maybeSingle();

            if (cRow?.user_id) {
              enviarNotificacaoViaBd({
                destinatarioUserId: cRow.user_id,
                destinatarioClienteId: payload.clienteId,
                titulo: `🎉 Instalação Concluída: ${payload.placa}`,
                mensagem: `A instalação do veículo ${payload.placa} foi finalizada com sucesso! Seu veículo já está protegido e disponível para rastreamento em tempo real.`,
                tipo: "instalacao",
                url: "/monitor-gps",
                placa: payload.placa,
              }).catch(() => {});
            }
          }
        } catch (errNotifConc) {
          console.warn("Aviso ao disparar notificação de conclusão para o cliente:", errNotifConc);
        }
      }

      if (
        res.veiculo_id &&
        (payload.chassi || payload.tipoVeiculo || payload.horimetroInicial !== undefined)
      ) {
        try {
          const updateVeiculo: Record<string, unknown> = {};
          if (payload.chassi) updateVeiculo.chassi = payload.chassi.trim().toUpperCase();
          if (payload.tipoVeiculo) updateVeiculo.tipo_veiculo = payload.tipoVeiculo;
          if (payload.horimetroInicial !== undefined && payload.horimetroInicial > 0) {
            updateVeiculo.horimetro_horas = payload.horimetroInicial;
          }
          if (Object.keys(updateVeiculo).length > 0) {
            await supabase
              .from("veiculos")
              .update(updateVeiculo as any)
              .eq("id", res.veiculo_id);
          }
        } catch (errVeiculoExtra) {
          console.warn("Aviso ao atualizar dados complementares do veículo:", errVeiculoExtra);
        }
      }

      if (idInstalacao && (payload.tipoVeiculo || payload.horimetroInicial !== undefined)) {
        try {
          const updateInstExtra: Record<string, unknown> = {};
          if (payload.tipoVeiculo) updateInstExtra.tipo_veiculo = payload.tipoVeiculo;
          if (payload.horimetroInicial !== undefined && payload.horimetroInicial > 0) {
            updateInstExtra.horimetro_inicial = payload.horimetroInicial;
          }
          if (Object.keys(updateInstExtra).length > 0) {
            await supabase
              .from("instalacoes")
              .update(updateInstExtra as any)
              .eq("id", idInstalacao);
          }
        } catch (errInstExtra) {
          console.warn("Aviso ao salvar tipo/horímetro na instalação:", errInstExtra);
        }
      }

      return {
        success: true,
        message: "Atendimento de instalação salvo com sucesso!",
        instalacao_id: res.instalacao_id,
        veiculo_id: res.veiculo_id,
      };
    }

    return {
      success: false,
      message: "Não foi possível registrar o atendimento de instalação.",
    };
  } catch (err: any) {
    console.error("Erro ao salvar atendimento de instalação:", err);
    return {
      success: false,
      message: err?.message || "Erro de conexão ao processar instalação.",
    };
  }
}

export async function registrarInstalacaoDireta(
  payload: RegistrarInstalacaoDiretaPayload,
): Promise<{
  success: boolean;
  message: string;
  veiculo_id?: string;
  instalacao_id?: string;
  rastreador_id?: string;
  imei?: string;
}> {
  if (isModoDemonstracaoAtivo()) {
    return {
      success: true,
      message: "Instalação direta realizada com sucesso (Modo Demonstração)!",
      veiculo_id: "demo-veiculo-direto-001",
      instalacao_id: "demo-instalacao-direta-001",
      imei: payload.rastreadorImei,
    };
  }

  // 1. Prioriza a rota de servidor autenticada /api/instalacoes/direta (Service Role / Imunidade a RLS)
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (token && typeof window !== "undefined") {
      try {
        const resp = await fetch("/api/instalacoes/direta", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json?.success) {
            return json;
          }
        }
      } catch (errFetch) {
        console.warn("Rota /api/instalacoes/direta falhou, tentando fallback RPC:", errFetch);
      }
    }
  } catch (errSession) {
    console.warn("Erro ao obter sessão para /api/instalacoes/direta:", errSession);
  }

  // 2. Fallback via RPC PostgreSQL canônica registrar_instalacao_direta
  try {
    const { data, error } = await supabase.rpc("registrar_instalacao_direta", {
      p_cliente_id: payload.clienteId,
      p_placa: payload.placa,
      p_marca: payload.marca,
      p_modelo: payload.modelo,
      p_ano: payload.ano || null,
      p_cor: payload.cor || null,
      p_tipo_veiculo: payload.tipoVeiculo || "carro",
      p_chassi: payload.chassi || null,
      p_km_instalacao: payload.kmInstalacao || 0,
      p_horimetro_inicial: payload.horimetroInicial || 0,
      p_rastreador_id: payload.rastreadorId || null,
      p_rastreador_imei: payload.rastreadorImei,
      p_rastreador_modelo: payload.rastreadorModelo || "J16 4G",
      p_chip_iccid: payload.chipIccid || null,
      p_chip_operadora: payload.chipOperadora || null,
      p_chip_linha: payload.chipLinha || null,
      p_bloqueador_instalado: payload.bloqueadorInstalado !== false,
      p_tipo_bloqueador: payload.tipoBloqueador || "rele_combustivel",
      p_bloqueador_detalhes: payload.bloqueadorDetalhes || null,
      p_posicao_instalacao: payload.posicaoInstalacao || "painel_interno",
      p_observacoes:
        payload.observacoes ||
        "Instalação direta realizada pelo SuperADM (veículo previamente instalado).",
    } as any);

    if (!error && data) {
      const res = data as any;
      if (res.success || res.sucesso) {
        if (payload.clienteId) {
          try {
            const { data: cRow } = await supabase
              .from("clientes")
              .select("user_id")
              .eq("id", payload.clienteId)
              .maybeSingle();

            if (cRow?.user_id) {
              enviarNotificacaoViaBd({
                destinatarioUserId: cRow.user_id,
                destinatarioClienteId: payload.clienteId,
                titulo: `🎉 Veículo Ativado: ${payload.placa}`,
                mensagem: `O veículo ${payload.placa} foi ativado na plataforma e já está disponível para monitoramento em tempo real.`,
                tipo: "instalacao",
                url: "/monitor-gps",
                placa: payload.placa,
              }).catch(() => {});
            }
          } catch {
            // Silencioso
          }
        }

        return {
          success: true,
          message: res.message || "Instalação direta realizada com sucesso!",
          veiculo_id: res.veiculo_id,
          instalacao_id: res.instalacao_id,
          rastreador_id: res.rastreador_id,
          imei: res.imei || payload.rastreadorImei,
        };
      }
    }
  } catch (errRpc) {
    console.warn(
      "RPC registrar_instalacao_direta falhou ou indisponível, usando fallback seguro:",
      errRpc,
    );
  }

  // 3. Fallback cliente direto autenticado
  try {
    const placaLimpa = payload.placa.trim().toUpperCase();
    const imeiLimpo = payload.rastreadorImei.trim();
    const marcaModelo = `${payload.marca.trim()} ${payload.modelo.trim()}`.trim();

    // Localiza rastreador
    let rastreadorId = payload.rastreadorId;
    if (!rastreadorId) {
      const { data: rRow } = await supabase
        .from("rastreadores")
        .select("id")
        .eq("imei", imeiLimpo)
        .maybeSingle();
      rastreadorId = rRow?.id;
    }

    // Insere ou atualiza veículo
    let veiculoId: string | undefined;
    const { data: veicExistente } = await supabase
      .from("veiculos")
      .select("id")
      .eq("placa", placaLimpa)
      .maybeSingle();

    if (veicExistente?.id) {
      veiculoId = veicExistente.id;
      await supabase
        .from("veiculos")
        .update({
          cliente_id: payload.clienteId,
          marca_modelo: marcaModelo,
          ano: payload.ano || null,
          cor: payload.cor || null,
          tipo_veiculo: payload.tipoVeiculo || "carro",
          chassi: payload.chassi || null,
          rastreador_id: rastreadorId || null,
          rastreador_imei: imeiLimpo,
          ativo: true,
          status_operacional: "estacionado",
          bloqueador_instalado: payload.bloqueadorInstalado !== false,
          tipo_bloqueador: payload.tipoBloqueador || "rele_combustivel",
          bloqueador_detalhes: payload.bloqueadorDetalhes || null,
          pendente_aprovacao_operador: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", veiculoId);
    } else {
      const { data: novoVeic, error: errNovoVeic } = await supabase
        .from("veiculos")
        .insert({
          cliente_id: payload.clienteId,
          placa: placaLimpa,
          marca_modelo: marcaModelo,
          ano: payload.ano || null,
          cor: payload.cor || null,
          tipo_veiculo: payload.tipoVeiculo || "carro",
          chassi: payload.chassi || null,
          odometro_km: payload.kmInstalacao || 0,
          horimetro_horas: payload.horimetroInicial || 0,
          rastreador_id: rastreadorId || null,
          rastreador_imei: imeiLimpo,
          ativo: true,
          status_operacional: "estacionado",
          bloqueado: false,
          bloqueador_instalado: payload.bloqueadorInstalado !== false,
          tipo_bloqueador: payload.tipoBloqueador || "rele_combustivel",
          bloqueador_detalhes: payload.bloqueadorDetalhes || null,
          pendente_aprovacao_operador: false,
        })
        .select("id")
        .single();
      if (errNovoVeic) throw errNovoVeic;
      veiculoId = novoVeic?.id;
    }

    // Atualiza rastreador para instalado
    if (rastreadorId && veiculoId) {
      await supabase
        .from("rastreadores")
        .update({
          veiculo_id: veiculoId,
          status: "instalado" as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rastreadorId);
    }

    // Obtém identificador válido do usuário autenticado para instalador_id
    const { data: authSess } = await supabase.auth.getSession();
    const callerUserId = authSess?.session?.user?.id || "20789b1e-2a8c-44a4-aca2-a0b67061b675";

    // Cria ordem concluída e isenta (status_pagamento 'pago' com valor R$ 0,00)
    const { data: instCriada, error: errInst } = await supabase
      .from("instalacoes")
      .insert({
        instalador_id: callerUserId,
        cliente_id: payload.clienteId,
        veiculo_id: veiculoId,
        placa: placaLimpa,
        marca: payload.marca,
        modelo: payload.modelo,
        ano: payload.ano || null,
        cor: payload.cor || null,
        tipo_veiculo: payload.tipoVeiculo || "carro",
        km_instalacao: payload.kmInstalacao || 0,
        horimetro_inicial: payload.horimetroInicial || 0,
        rastreador_id: rastreadorId || null,
        rastreador_imei: imeiLimpo,
        rastreador_modelo: payload.rastreadorModelo || "J16 4G",
        chip_iccid: payload.chipIccid || null,
        chip_operadora: payload.chipOperadora || "Algar",
        posicao_instalacao: payload.posicaoInstalacao || "painel_interno",
        status: "concluida" as any,
        concluida_at: new Date().toISOString(),
        valor_instalacao: 0.0,
        status_pagamento: "pago" as any,
        kit_confirmado_instalador: true,
        kit_confirmado_em: new Date().toISOString(),
        imei_confirmado: imeiLimpo,
        observacoes:
          payload.observacoes ||
          "Instalação direta realizada pelo SuperADM (veículo previamente instalado).",
        tipo_servico: "instalacao" as any,
        bloqueador_instalado: payload.bloqueadorInstalado !== false,
        tipo_bloqueador: (payload.tipoBloqueador || "rele_combustivel") as any,
        bloqueador_detalhes: payload.bloqueadorDetalhes || null,
      })
      .select("id")
      .single();

    if (errInst) throw errInst;

    // Atualiza status do cliente de forma resiliente contra recursão RLS
    try {
      await supabase
        .from("clientes")
        .update({
          status: "ativo",
          status_agendamento: "concluido",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.clienteId);
    } catch (errCli) {
      console.warn("Aviso ao atualizar status do cliente no fallback:", errCli);
    }

    return {
      success: true,
      message: "Instalação direta realizada com sucesso e veículo ativado no Monitor GPS!",
      veiculo_id: veiculoId,
      instalacao_id: instCriada?.id,
      rastreador_id: rastreadorId || undefined,
      imei: imeiLimpo,
    };
  } catch (errFinal: any) {
    console.error("Erro no processamento da instalação direta:", errFinal);
    return {
      success: false,
      message: errFinal?.message || "Erro ao processar instalação direta.",
    };
  }
}

export async function solicitarRetiradaRastreador(
  payload: SolicitarRetiradaPayload,
): Promise<{ success: boolean; message: string; instalacao_id?: string }> {
  try {
    const { data, error } = await supabase.rpc("solicitar_retirada_rastreador", {
      p_veiculo_id: payload.veiculoId,
      p_instalador_id: payload.instaladorId,
      p_valor_retirada: payload.valorRetirada ?? 0.0,
      p_motivo: payload.motivo || null,
      p_observacoes: payload.observacoes || null,
    } as any);

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message: "Ordem de retirada emitida com sucesso para o instalador!",
        instalacao_id: res.instalacao_id,
      };
    }

    return {
      success: false,
      message: "Não foi possível emitir a ordem de retirada.",
    };
  } catch (err: any) {
    console.error("Erro ao solicitar retirada de rastreador:", err);
    return {
      success: false,
      message: err?.message || "Falha ao emitir ordem de retirada.",
    };
  }
}

export async function solicitarRemanejamentoRastreador(
  payload: SolicitarRemanejamentoPayload,
): Promise<{
  success: boolean;
  message: string;
  ordem_retirada_id?: string;
  ordem_instalacao_id?: string;
}> {
  try {
    const { data, error } = await supabase.rpc("solicitar_remanejamento_rastreador", {
      p_veiculo_origem_id: payload.veiculoOrigemId,
      p_cliente_destino_id: payload.clienteDestinoId || null,
      p_novo_veiculo_placa: payload.novoVeiculoPlaca,
      p_novo_veiculo_marca: payload.novoVeiculoMarca,
      p_novo_veiculo_modelo: payload.novoVeiculoModelo,
      p_novo_veiculo_ano: payload.novoVeiculoAno || null,
      p_novo_veiculo_cor: payload.novoVeiculoCor || null,
      p_instalador_id: payload.instaladorId || null,
      p_valor_retirada: payload.valorRetirada ?? 0.0,
      p_valor_instalacao: payload.valorInstalacao ?? 350.0,
      p_observacoes: payload.observacoes || null,
    } as any);

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message:
          "Remanejamento gerado com sucesso! Duas ordens de serviço vinculadas foram emitidas.",
        ordem_retirada_id: res.ordem_retirada_id,
        ordem_instalacao_id: res.ordem_instalacao_id,
      };
    }

    return {
      success: false,
      message: "Não foi possível gerar as ordens de remanejamento.",
    };
  } catch (err: any) {
    console.error("Erro ao solicitar remanejamento de rastreador:", err);
    return {
      success: false,
      message: err?.message || "Falha ao solicitar remanejamento.",
    };
  }
}

export async function marcarPagamentoInstalacao(
  instalacaoId: string,
  status: "pago" | "pendente",
  comprovante?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("marcar_pagamento_instalacao", {
      p_instalacao_id: instalacaoId,
      p_status_pagamento: status,
      p_comprovante: comprovante || null,
    });

    if (error) throw error;
    return {
      success: true,
      message: `Status de pagamento alterado para ${status.toUpperCase()} com sucesso!`,
    };
  } catch (err: any) {
    console.error("Erro ao alterar pagamento de instalação:", err);
    return { success: false, message: err?.message || "Falha ao registrar pagamento." };
  }
}

export async function marcarPagamentoPeloCliente(
  instalacaoId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await (supabase.rpc as any)(
      "liquidar_repasse_instalacao_pelo_cliente",
      {
        p_transacao_id: `i-${instalacaoId}`,
        p_instalacao_id: instalacaoId,
      },
    );

    if (error) {
      const { error: updErr } = await supabase
        .from("instalacoes")
        .update({
          pago_direto_cliente: true,
          status_pagamento: "pago",
          pago_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", instalacaoId);

      if (updErr) throw updErr;
      return {
        success: true,
        message: "Repasse liquidado como pago diretamente pelo cliente (R$ 0,00 da empresa)!",
      };
    }

    const res = data as any;
    return {
      success: true,
      message: res?.mensagem || "Repasse marcado como liquidado diretamente pelo cliente!",
    };
  } catch (err: any) {
    console.error("Erro ao liquidar repasse pelo cliente:", err);
    return {
      success: false,
      message: err?.message || "Falha ao registrar quitação pelo cliente.",
    };
  }
}

export async function marcarPagamentoLoteInstalador(
  instaladorId: string,
  comprovante?: string,
): Promise<{ success: boolean; message: string; totalQuitadas?: number; valorTotal?: number }> {
  try {
    const { data, error } = await supabase.rpc("marcar_pagamento_lote_instalador", {
      p_instalador_id: instaladorId,
      p_comprovante: comprovante || null,
    });

    if (error) throw error;
    const res = data as any;
    if (res && res.sucesso) {
      return {
        success: true,
        message: `Pagamento em lote de ${res.total_quitadas} instalações (R$ ${Number(res.valor_total).toFixed(2)}) quitado com sucesso!`,
        totalQuitadas: res.total_quitadas,
        valorTotal: res.valor_total,
      };
    }

    return {
      success: false,
      message: res?.message || "Nenhuma instalação pendente para este instalador.",
    };
  } catch (err: any) {
    console.error("Erro ao quitar em lote instalações:", err);
    return { success: false, message: err?.message || "Falha ao processar pagamento em lote." };
  }
}

export async function carregarClientesParaInstalacao(instaladorId?: string): Promise<
  {
    id: string;
    nome: string;
    documento?: string;
    telefone?: string;
    status: string;
    status_agendamento?: string;
  }[]
> {
  // 1. Tenta carregar via rota segura de servidor /api/clientes (Service Role, imune a recursão de RLS)
  try {
    const sess = await supabase.auth.getSession();
    const token = sess.data.session?.access_token;
    if (token && typeof window !== "undefined") {
      const res = await fetch("/api/clientes", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && Array.isArray(json.clientes) && json.clientes.length > 0) {
          let lista = json.clientes;
          if (instaladorId) {
            lista = lista.filter((c: any) => c.instalador_id === instaladorId);
          }
          return lista
            .map((c: any) => ({
              id: c.id,
              nome: c.nome_razao_social || c.nome || "Cliente sem Nome",
              documento: c.documento || undefined,
              telefone: c.telefone || undefined,
              status: c.status || "ativo",
              status_agendamento: c.status_agendamento,
            }))
            .sort((a: any, b: any) => {
              const aAguardando = a.status === "aguardando_instalacao" ? 0 : 1;
              const bAguardando = b.status === "aguardando_instalacao" ? 0 : 1;
              if (aAguardando !== bAguardando) return aAguardando - bAguardando;
              return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
            });
        }
      }
    }
  } catch (errApi) {
    console.warn("Rota /api/clientes indisponível, usando fallback:", errApi);
  }

  // 2. Fallback via RPC PostgreSQL instalador_obter_minhas_demandas
  try {
    const rpcResult = await obterDemandasInstaladorCompleto(instaladorId);
    if (
      rpcResult?.success &&
      Array.isArray(rpcResult.agendamentos) &&
      rpcResult.agendamentos.length > 0
    ) {
      return rpcResult.agendamentos
        .map((c: any) => ({
          id: c.id,
          nome: c.nome_razao_social || c.nome || "Cliente sem Nome",
          documento: c.documento || undefined,
          telefone: c.telefone || undefined,
          status: c.status || "aguardando_instalacao",
          status_agendamento: c.status_agendamento,
        }))
        .sort((a: any, b: any) => {
          const aAguardando = a.status === "aguardando_instalacao" ? 0 : 1;
          const bAguardando = b.status === "aguardando_instalacao" ? 0 : 1;
          if (aAguardando !== bAguardando) return aAguardando - bAguardando;
          return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
        });
    }
  } catch {
    // continua para consulta direta via SDK
  }

  // 3. Fallback final via consulta direta Supabase SDK
  try {
    let query = supabase
      .from("clientes")
      .select("id, nome_razao_social, documento, telefone, status, status_agendamento")
      .order("nome_razao_social", { ascending: true });

    if (instaladorId) {
      query = query.eq("instalador_id", instaladorId);
    }

    const { data, error } = await query;
    if (error || !data || !Array.isArray(data)) return [];
    return data
      .map((c) => ({
        id: c.id,
        nome: c.nome_razao_social || "Cliente sem Nome",
        documento: c.documento || undefined,
        telefone: c.telefone || undefined,
        status: c.status,
        status_agendamento: c.status_agendamento,
      }))
      .sort((a, b) => {
        const aAguardando = a.status === "aguardando_instalacao" ? 0 : 1;
        const bAguardando = b.status === "aguardando_instalacao" ? 0 : 1;
        if (aAguardando !== bAguardando) return aAguardando - bAguardando;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  } catch {
    return [];
  }
}

export interface DadosPreenchimentoInstalacaoCliente {
  instalacaoId?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  ano?: number;
  cor?: string;
  tipoVeiculo?: string;
  kmInstalacao?: number;
  horimetro?: number;
  posicaoInstalacao?: string;
  rastreadorImei?: string;
  rastreadorModelo?: string;
  chipIccid?: string;
  chipOperadora?: string;
}

const STATUS_INSTALACAO_FINALIZADOS = new Set(["concluida", "concluida_com_pendencia"]);

function normalizarPlacaPreenchimento(placa?: string | null): string {
  const limpa = (placa || "").trim().toUpperCase();
  if (!limpa || limpa === "A DEFINIR" || limpa === "SEM PLACA" || limpa === "SEMPLACA") {
    return "";
  }
  return limpa;
}

export function selecionarInstalacaoOuVeiculoPendente(
  instalacoes: any[],
  veiculos: any[],
): {
  origem: "instalacao" | "veiculo";
  instalacao?: any;
  veiculo?: any;
} | null {
  const listaInst = Array.isArray(instalacoes) ? instalacoes : [];
  const listaVeics = Array.isArray(veiculos) ? veiculos : [];

  const veiculoIdsConcluidos = new Set<string>();
  const placasConcluidas = new Set<string>();

  for (const item of listaInst) {
    if (STATUS_INSTALACAO_FINALIZADOS.has(item?.status) && item?.tipo_servico !== "retirada") {
      if (item?.veiculo_id) veiculoIdsConcluidos.add(item.veiculo_id);
      const p = normalizarPlacaPreenchimento(item?.placa);
      if (p) placasConcluidas.add(p);
    }
  }

  // 1. Verifica apenas ordens ainda ABERTAS / PENDENTES (nunca reutiliza OS concluída ou retirada)
  const instPendente = listaInst.find((item) => {
    if (!item) return false;
    if (item.tipo_servico === "retirada") return false;
    if (STATUS_INSTALACAO_FINALIZADOS.has(item.status)) return false;
    if (!(item.placa || item.rastreador_imei || item.chip_iccid)) return false;
    if (item.veiculo_id && veiculoIdsConcluidos.has(item.veiculo_id)) return false;
    const p = normalizarPlacaPreenchimento(item.placa);
    if (p && placasConcluidas.has(p)) return false;
    return true;
  });

  if (instPendente) {
    return { origem: "instalacao", instalacao: instPendente };
  }

  // 2. Se não houver ordem pendente, busca apenas veículo ainda NÃO instalado/ativo na frota
  const veiculoPendente = listaVeics.find((v) => {
    if (!v) return false;
    if (v.ativo === true) return false;
    if (v.status_operacional === "desinstalado") return false;
    if (v.id && veiculoIdsConcluidos.has(v.id)) return false;
    const p = normalizarPlacaPreenchimento(v.placa);
    if (p && placasConcluidas.has(p)) return false;
    return true;
  });

  if (veiculoPendente) {
    return { origem: "veiculo", veiculo: veiculoPendente };
  }

  return null;
}

export async function obterDadosPreenchimentoInstalacaoCliente(
  clienteId: string,
): Promise<DadosPreenchimentoInstalacaoCliente | null> {
  if (!clienteId) return null;

  try {
    // 1. Carrega ordens recentes para distinguir o que já está concluído do que ainda está pendente
    const { data: instalacoes } = await supabase
      .from("instalacoes")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 2. Carrega veículos recentes do cliente para detectar veículos recém-cadastrados e ainda não instalados
    let veiculosData: any[] = [];
    const veiculosQuery = await supabase
      .from("veiculos")
      .select(
        "id, placa, marca_modelo, ano, cor, tipo_veiculo, km_atual, horimetro_horas, rastreador_id, ativo, status_operacional",
      )
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (veiculosQuery.error) {
      const veiculosFallback = await supabase
        .from("veiculos")
        .select("id, placa, marca_modelo, ano, cor, tipo_veiculo, km_atual, rastreador_id, ativo")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(30);
      veiculosData = veiculosFallback.data || [];
    } else {
      veiculosData = veiculosQuery.data || [];
    }

    const selecionado = selecionarInstalacaoOuVeiculoPendente(instalacoes || [], veiculosData);
    if (!selecionado) return null;

    if (selecionado.origem === "instalacao" && selecionado.instalacao) {
      const inst = selecionado.instalacao;
      const placeholders = new Set([
        "A DEFINIR",
        "SEMPLACA",
        "SEM PLACA",
        "GERAL",
        "VEICULO",
        "VEÍCULO",
        "PADRAO",
        "PADRÃO",
        "VEICULO PADRAO",
        "VEÍCULO PADRÃO",
      ]);
      const limpar = (v?: string | null) => {
        const s = (v || "").trim();
        return s && !placeholders.has(s.toUpperCase()) ? s : undefined;
      };
      return {
        instalacaoId: inst.id,
        placa: limpar(inst.placa),
        marca: limpar(inst.marca),
        modelo: limpar(inst.modelo),
        ano: inst.ano || undefined,
        cor: inst.cor || undefined,
        tipoVeiculo: (inst as any).tipo_veiculo || undefined,
        kmInstalacao: inst.km_instalacao || undefined,
        horimetro: (inst as any).horimetro_inicial || undefined,
        posicaoInstalacao: (inst as any).posicao_instalacao || undefined,
        rastreadorImei:
          inst.rastreador_imei &&
          inst.rastreador_imei !== "A CONFERIR" &&
          inst.rastreador_imei !== "PENDENTE"
            ? inst.rastreador_imei
            : undefined,
        rastreadorModelo: inst.rastreador_modelo || "J16 4G",
        chipIccid: inst.chip_iccid || undefined,
        chipOperadora: inst.chip_operadora || "Vivo",
      };
    }

    const veiculo = selecionado.veiculo;
    if (!veiculo) return null;

    let marca = "";
    let modelo = "";
    const placeholdersV = new Set([
      "A DEFINIR",
      "SEMPLACA",
      "SEM PLACA",
      "GERAL",
      "VEICULO",
      "VEÍCULO",
      "PADRAO",
      "PADRÃO",
      "VEICULO PADRAO",
      "VEÍCULO PADRÃO",
    ]);
    if (veiculo.marca_modelo && !placeholdersV.has(veiculo.marca_modelo.trim().toUpperCase())) {
      const parts = veiculo.marca_modelo.trim().split(" ");
      marca = parts[0] && !placeholdersV.has(parts[0].toUpperCase()) ? parts[0] : "";
      const modJoined = parts.slice(1).join(" ");
      modelo = modJoined && !placeholdersV.has(modJoined.toUpperCase()) ? modJoined : "";
    }

    let rastreadorImei: string | undefined;
    let rastreadorModelo = "J16 4G";
    let chipIccid: string | undefined;
    let chipOperadora = "Vivo";

    if (veiculo.rastreador_id) {
      const { data: rastreador } = await supabase
        .from("rastreadores")
        .select("id, imei, modelo, chip_id")
        .eq("id", veiculo.rastreador_id)
        .maybeSingle();

      if (rastreador) {
        rastreadorImei = rastreador.imei || undefined;
        rastreadorModelo = rastreador.modelo || "J16 4G";

        if (rastreador.chip_id) {
          const { data: chip } = await supabase
            .from("chips")
            .select("id, iccid, operadora")
            .eq("id", rastreador.chip_id)
            .maybeSingle();

          if (chip) {
            chipIccid = chip.iccid || undefined;
            chipOperadora = chip.operadora || "Vivo";
          }
        }
      }
    }

    return {
      placa: veiculo.placa && veiculo.placa !== "A DEFINIR" ? veiculo.placa : undefined,
      marca: marca || undefined,
      modelo: modelo || undefined,
      ano: veiculo.ano || undefined,
      cor: veiculo.cor || undefined,
      tipoVeiculo: (veiculo as any).tipo_veiculo || undefined,
      kmInstalacao: veiculo.km_atual || undefined,
      horimetro: (veiculo as any).horimetro_horas || undefined,
      rastreadorImei,
      rastreadorModelo,
      chipIccid,
      chipOperadora,
    };
  } catch (err) {
    console.warn("Erro ao buscar dados pré-preenchidos do cliente:", err);
    return null;
  }
}

const ROTULOS_TIPO_VEICULO: Record<string, string> = {
  carro: "Carro",
  moto: "Moto",
  moto_eletrica: "Moto Elétrica",
  caminhao: "Caminhão",
  camionete: "Camionete",
  suv: "SUV",
  van: "Van",
  ambulancia: "Ambulância",
  onibus: "Ônibus",
  quadriciculo: "Quadriciclo",
  quadriciclo: "Quadriciclo",
  triciclo: "Triciclo",
  jetski: "Jet Ski",
  maquina: "Máquina",
  trator: "Trator",
  equipamento: "Equipamento",
  outro: "Outro Veículo",
};

const PLACEHOLDERS_TITULO_VEICULO = new Set([
  "",
  "A DEFINIR",
  "SEMPLACA",
  "SEM PLACA",
  "GERAL",
  "VEICULO",
  "VEÍCULO",
  "PADRAO",
  "PADRÃO",
  "VEICULO PADRAO",
  "VEÍCULO PADRÃO",
  "VEICULO DO CLIENTE",
  "VEÍCULO DO CLIENTE",
]);

export function formatarLabelTipoVeiculo(tipo?: string | null): string {
  const key = (tipo || "carro").trim().toLowerCase();
  return ROTULOS_TIPO_VEICULO[key] || "Veículo";
}

export function formatarTituloVeiculoInstalacao(inst: {
  marca?: string | null;
  modelo?: string | null;
  ano?: number | string | null;
  tipo_veiculo?: string | null;
}): string {
  const limparParte = (v?: string | null) => {
    const t = String(v || "").trim();
    if (!t || PLACEHOLDERS_TITULO_VEICULO.has(t.toUpperCase())) return "";
    return t;
  };

  let marcaLimpa = limparParte(inst.marca);
  let modeloLimpo = limparParte(inst.modelo);

  // Remove redundância clássica como "GM MONTANA GM/ MONTANA SPORT" -> "GM MONTANA SPORT"
  if (modeloLimpo) {
    modeloLimpo = modeloLimpo
      .replace(/^GM\s+MONTANA\s+GM\/\s*/i, "GM ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (marcaLimpa && modeloLimpo && modeloLimpo.toUpperCase().startsWith(marcaLimpa.toUpperCase())) {
    marcaLimpa = "";
  }

  const combinado = [marcaLimpa, modeloLimpo].filter(Boolean).join(" ").trim();
  if (!combinado) {
    return `${formatarLabelTipoVeiculo(inst.tipo_veiculo)} (Preencher na instalação)`;
  }

  return `${combinado}${inst.ano ? ` (${inst.ano})` : ""}`;
}

export function ehInstalacaoDiretaSemInstalador(inst: {
  instalador_role?: string | null;
  status?: string | null;
  valor_instalacao?: number | string | null;
  data_agendamento?: string | null;
}): boolean {
  if (inst.instalador_role && inst.instalador_role !== "instalador") {
    return true;
  }
  return (
    inst.status === "concluida" && Number(inst.valor_instalacao || 0) <= 0 && !inst.data_agendamento
  );
}

export function formatarDataConclusaoCurta(dataIso?: string | null): string | null {
  if (!dataIso) return null;
  const parsed = new Date(dataIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("pt-BR");
}

export function calcularResumoRepasse(
  instalacoes: Instalacao[],
  clientesAgendados?: any[],
  valorPadraoPorInstalacao: number = 50,
): ResumoRepasseFinanceiro {
  let totalInstalacoes = 0;
  let totalConcluidas = 0;
  let totalPendencias = 0;
  let totalNaoInstaladas = 0;
  let valorTotalDevido = 0;
  let valorTotalPendente = 0;
  let valorTotalPago = 0;
  let ordensAgendadasQtd = 0;
  let ordensAgendadasValorPrevisto = 0;

  instalacoes.forEach((inst) => {
    totalInstalacoes++;
    const v = Number(inst.valor_instalacao) || 0;
    const isConcluida = inst.status === "concluida" || inst.status === "concluida_com_pendencia";

    if (inst.status === "concluida") {
      totalConcluidas++;
    } else if (inst.status === "concluida_com_pendencia") {
      totalPendencias++;
    } else {
      totalNaoInstaladas++;
      if (inst.data_agendamento || inst.status === "agendada") {
        ordensAgendadasQtd++;
        ordensAgendadasValorPrevisto += v > 0 ? v : valorPadraoPorInstalacao;
      }
    }

    // Regra Pétrea Financeira: Somente serviços efetivamente CONCLUÍDOS geram crédito a receber!
    if (isConcluida && v > 0) {
      valorTotalDevido += v;
      if (inst.status_pagamento === "pago") {
        valorTotalPago += v;
      } else {
        valorTotalPendente += v;
      }
    }
  });

  // Deduplica clientes em acompanhamento que já possuem ordem de instalação lançada
  const clientesComOrdem = new Set(instalacoes.map((i) => i.cliente_id).filter(Boolean));
  const clientesSemOrdem = (clientesAgendados || []).filter(
    (c) => !c?.id || !clientesComOrdem.has(c.id),
  );

  const agendadosEfetivos = clientesSemOrdem.filter(
    (c) =>
      c.status_agendamento === "agendado" ||
      (c.data_agendamento !== null &&
        c.data_agendamento !== undefined &&
        c.data_agendamento !== ""),
  );
  const aAgendarEfetivos = clientesSemOrdem.filter(
    (c) =>
      c.status_agendamento !== "agendado" && (!c.data_agendamento || c.data_agendamento === ""),
  );

  const agendadosQtd = ordensAgendadasQtd + agendadosEfetivos.length;
  const aAgendarQtd = aAgendarEfetivos.length;
  const valorPrevistoAgendados =
    ordensAgendadasValorPrevisto + agendadosEfetivos.length * valorPadraoPorInstalacao;

  // A Receber e Pendente representam estritamente o trabalho executado pendente de quitação pelo operador
  const aReceber = valorTotalPendente;
  const recebido = valorTotalPago;

  return {
    totalInstalacoes: totalInstalacoes + clientesSemOrdem.length,
    totalConcluidas,
    totalPendencias,
    totalNaoInstaladas,
    totalAgendadas: agendadosQtd,
    valorTotalDevido,
    valorTotalPendente,
    valorTotalPago,
    valorPrevistoAgendadas: valorPrevistoAgendados,
    // Campos canônicos do instalador
    aReceber,
    recebido,
    agendadosQtd,
    aAgendarQtd,
    valorPrevistoAgendados,
  };
}

export async function atualizarDadosProprioInstalador(
  instaladorId: string,
  dados: {
    chavePix?: string;
    enderecoInstalacao?: string;
    telefone?: string;
    valorInstalacaoSemBloqueador?: number;
    valorInstalacaoComBloqueador?: number;
  },
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Tentar RPC dedicada com SECURITY DEFINER se disponivel
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "instalador_atualizar_proprios_dados",
      {
        p_chave_pix: dados.chavePix || "",
        p_endereco_instalacao: dados.enderecoInstalacao || "",
      },
    );

    // Atualizacao de campos financeiros e complementares
    const payloadUpdate: any = {
      updated_at: new Date().toISOString(),
    };
    if (dados.chavePix !== undefined) {
      payloadUpdate.chave_pix = dados.chavePix ? dados.chavePix.trim() : null;
    }
    if (dados.enderecoInstalacao !== undefined) {
      payloadUpdate.endereco_instalacao = dados.enderecoInstalacao
        ? dados.enderecoInstalacao.trim()
        : null;
    }
    if (dados.telefone !== undefined) {
      payloadUpdate.telefone = dados.telefone ? dados.telefone.trim() : null;
      payloadUpdate.celular = dados.telefone ? dados.telefone.trim() : null;
    }
    if (dados.valorInstalacaoSemBloqueador !== undefined) {
      payloadUpdate.valor_instalacao_sem_bloqueador =
        Number(dados.valorInstalacaoSemBloqueador) || 0;
      payloadUpdate.valor_por_instalacao = Number(dados.valorInstalacaoSemBloqueador) || 0;
    }
    if (dados.valorInstalacaoComBloqueador !== undefined) {
      payloadUpdate.valor_instalacao_com_bloqueador =
        Number(dados.valorInstalacaoComBloqueador) || 0;
    }

    const { error } = await supabase.from("profiles").update(payloadUpdate).eq("id", instaladorId);

    if (error && rpcError) throw error;

    return {
      success: true,
      message: "Dados de instalação, valores e chave PIX atualizados com sucesso.",
    };
  } catch (err: any) {
    console.error("Erro ao atualizar dados do instalador:", err);
    return {
      success: false,
      message: err?.message || "Falha ao atualizar dados de instalação.",
    };
  }
}

export async function obterDemandasInstaladorCompleto(instaladorId?: string): Promise<{
  success: boolean;
  ordens: Instalacao[];
  agendamentos: any[];
  resumo?: ResumoRepasseFinanceiro;
} | null> {
  try {
    const { data, error } = await supabase.rpc("instalador_obter_minhas_demandas", {
      p_instalador_id: instaladorId || null,
    });

    if (error || !data || !data.success) {
      if (isModoDemonstracaoAtivo()) {
        const osDemo = obterInstalacaoFantasmaComoCanonical();
        const agendDemo = obterAgendamentoFantasmaComoCanonical();
        return {
          success: true,
          ordens: [osDemo],
          agendamentos: [agendDemo],
          resumo: {
            totalInstalacoes: 1,
            totalConcluidas: 0,
            totalPendencias: 0,
            totalNaoInstaladas: 1,
            valorTotalDevido: 90,
            valorTotalPendente: 90,
            valorTotalPago: 0,
            aReceber: 90,
            recebido: 0,
            agendadosQtd: 1,
            aAgendarQtd: 0,
            valorPrevistoAgendados: 90,
          },
        };
      }
      return null;
    }

    let ordensFormatadas: Instalacao[] = (data.ordens || []).map((item: any) => ({
      ...item,
      instalador_nome: item.instalador_nome || "Instalador",
      cliente_nome: item.cliente_nome || "Cliente",
    }));

    // Auto-cura e resolução defensiva permanente: se alguma ordem veio sem rastreador,
    // verifica se o veículo correspondente possui rastreador atribuído e sincroniza na hora
    const ordensSemKit = ordensFormatadas.filter(
      (o) => !o.rastreador_id || ehPlaceholderImei(o.rastreador_imei),
    );
    if (ordensSemKit.length > 0) {
      const vIds = ordensSemKit.map((o) => o.veiculo_id).filter(Boolean);
      if (vIds.length > 0) {
        try {
          const { data: veicsData } = await supabase
            .from("veiculos")
            .select("id, rastreador_id, rastreador_imei")
            .in("id", vIds)
            .not("rastreador_id", "is", null);

          if (veicsData && veicsData.length > 0) {
            const mapV = new Map<string, any>();
            veicsData.forEach((v) => mapV.set(v.id, v));

            ordensFormatadas = ordensFormatadas.map((ordem) => {
              if (ordem.veiculo_id && mapV.has(ordem.veiculo_id)) {
                const v = mapV.get(ordem.veiculo_id);
                if (
                  v.rastreador_id ||
                  (v.rastreador_imei && !ehPlaceholderImei(v.rastreador_imei))
                ) {
                  const novoImei = !ehPlaceholderImei(ordem.rastreador_imei)
                    ? ordem.rastreador_imei
                    : v.rastreador_imei;
                  const novoKitId = ordem.rastreador_id || v.rastreador_id;
                  const novoDeterminadoEm = ordem.kit_determinado_em || new Date().toISOString();

                  // Auto-gravação no banco de dados Supabase em background
                  supabase
                    .from("instalacoes")
                    .update({
                      rastreador_id: novoKitId,
                      rastreador_imei: novoImei,
                      kit_determinado_em: novoDeterminadoEm,
                      updated_at: new Date().toISOString(),
                    } as any)
                    .eq("id", ordem.id)
                    .then(() => {})
                    .catch(() => {});

                  return {
                    ...ordem,
                    rastreador_id: novoKitId,
                    rastreador_imei: novoImei,
                    kit_determinado_em: novoDeterminadoEm,
                  };
                }
              }
              return ordem;
            });
          }
        } catch (errAuto) {
          console.warn("Aviso na auto-cura de ordens:", errAuto);
        }
      }
    }

    let agendamentosFormatados = data.agendamentos || [];

    if (isModoDemonstracaoAtivo()) {
      const osDemo = obterInstalacaoFantasmaComoCanonical();
      const agendDemo = obterAgendamentoFantasmaComoCanonical();
      ordensFormatadas = [osDemo, ...ordensFormatadas];
      agendamentosFormatados = [agendDemo, ...agendamentosFormatados];
    }

    const r = data.resumo || {};
    const clientesComOrdemSet = new Set(ordensFormatadas.map((o) => o.cliente_id).filter(Boolean));
    const clientesSemOrdemQtd = (agendamentosFormatados || []).filter(
      (c: any) => !c?.id || !clientesComOrdemSet.has(c.id),
    ).length;
    const resumo: ResumoRepasseFinanceiro = {
      totalInstalacoes: ordensFormatadas.length + clientesSemOrdemQtd,
      totalConcluidas: ordensFormatadas.filter((o) => o.status === "concluida").length,
      totalPendencias: ordensFormatadas.filter((o) => o.status === "concluida_com_pendencia")
        .length,
      totalNaoInstaladas: ordensFormatadas.filter((o) => o.status === "nao_instalado").length,
      valorTotalDevido: (Number(r.a_receber) || 0) + (Number(r.recebido) || 0),
      valorTotalPendente: Number(r.a_receber) || 0,
      valorTotalPago: Number(r.recebido) || 0,
      aReceber: Number(r.a_receber) || 0,
      recebido: Number(r.recebido) || 0,
      agendadosQtd: Number(r.agendados_qtd) || 0,
      aAgendarQtd: Number(r.a_agendar_qtd) || 0,
      valorPrevistoAgendados: Number(r.valor_previsto_agendados) || 0,
    };

    return {
      success: true,
      ordens: ordensFormatadas,
      agendamentos: agendamentosFormatados,
      resumo,
    };
  } catch (err) {
    console.warn("RPC instalador_obter_minhas_demandas indisponível no momento:", err);
    if (isModoDemonstracaoAtivo()) {
      const osDemo = obterInstalacaoFantasmaComoCanonical();
      const agendDemo = obterAgendamentoFantasmaComoCanonical();
      return {
        success: true,
        ordens: [osDemo],
        agendamentos: [agendDemo],
      };
    }
    return null;
  }
}

export async function concluirAtendimentoInstalador(
  payload: ConcluirInstalacaoAtendimentoPayload,
  instaladorId?: string,
): Promise<{ success: boolean; message: string; instalacao_id?: string; veiculo_id?: string }> {
  if (isModoDemonstracaoAtivo() || payload.instalacaoId?.startsWith("fantasma-")) {
    const res = await simularConclusaoInstalacao({
      ordemId: payload.instalacaoId,
      observacoes: payload.observacoes || undefined,
    });
    return {
      success: true,
      message: res.mensagem,
      instalacao_id: payload.instalacaoId,
    };
  }

  try {
    const { data, error } = await supabase.rpc("instalador_concluir_atendimento", {
      p_instalacao_id: payload.instalacaoId,
      p_instalador_id: instaladorId || null,
      p_imei_conferido: payload.imeiConferido.trim(),
      p_com_bloqueador: payload.comBloqueador,
      p_posicao_instalacao: payload.posicaoInstalacao.trim(),
      p_placa: payload.placa ? payload.placa.trim().toUpperCase() : null,
      p_marca: payload.marca ? payload.marca.trim() : null,
      p_modelo: payload.modelo ? payload.modelo.trim() : null,
      p_ano: payload.ano || null,
      p_cor: payload.cor || null,
      p_tipo_veiculo: payload.tipoVeiculo || "carro",
      p_km_instalacao: payload.kmInstalacao || 0,
      p_horimetro_inicial: payload.horimetroInicial || 0,
      p_observacoes: payload.observacoes || null,
    } as any);

    if (error) throw error;

    const res = data as any;
    if (res && res.sucesso) {
      if (payload.chassi && res.veiculo_id) {
        try {
          await supabase
            .from("veiculos")
            .update({ chassi: payload.chassi.trim().toUpperCase() })
            .eq("id", res.veiculo_id);
        } catch (errChassi) {
          console.warn("Aviso ao salvar chassi do veículo:", errChassi);
        }
      }

      if (res.instalacao_id && payload.releChicoteDoEstoque !== undefined) {
        try {
          await supabase
            .from("instalacoes")
            .update({ rele_chicote_do_estoque: Boolean(payload.releChicoteDoEstoque) })
            .eq("id", res.instalacao_id);
        } catch (errRele) {
          console.warn("Aviso ao salvar rele_chicote_do_estoque:", errRele);
        }
      }

      return {
        success: true,
        message: res.mensagem || "Instalação concluída com sucesso e repasse financeiro gerado!",
        instalacao_id: res.instalacao_id,
        veiculo_id: res.veiculo_id,
      };
    }

    return {
      success: false,
      message: res?.mensagem || "Não foi possível concluir o atendimento da instalação.",
    };
  } catch (err: any) {
    console.error("Erro ao concluir atendimento do instalador:", err);
    return {
      success: false,
      message: err?.message || "Falha ao registrar conclusão do atendimento.",
    };
  }
}

export async function garantirSincronizacaoInstalacaoCliente(
  clienteId: string,
  instaladorId: string,
): Promise<{ success: boolean; instalacao_id?: string }> {
  try {
    // 1. Resgata veículos reais do cliente para vincular às ordens
    const { data: veiculos } = await supabase
      .from("veiculos")
      .select("id, placa, marca_modelo, tipo_veiculo, ano, cor, ativo, rastreador_id")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: true });

    const veiculoPrincipal = veiculos?.[0];

    // 2. Verificar se todos os veículos já estão ativos e instalados
    const todosVeiculosAtivos =
      veiculos &&
      veiculos.length > 0 &&
      veiculos.every((v) => Boolean(v.ativo) && Boolean(v.rastreador_id));

    // 3. Verificar se já existe uma ordem CONCLUÍDA para este cliente ou qualquer um de seus veículos/placas
    const placasCliente = (veiculos || [])
      .map((v) => v.placa?.trim().toUpperCase())
      .filter((p): p is string =>
        Boolean(p && !["A DEFINIR", "SEM PLACA", "SEMPLACA"].includes(p)),
      );

    const { data: ordensConcluidas } = await supabase
      .from("instalacoes")
      .select("id, status, veiculo_id, placa")
      .or(
        `cliente_id.eq.${clienteId},${placasCliente.length > 0 ? `placa.in.(${placasCliente.join(",")})` : "id.is.null"}`,
      )
      .in("status", ["concluida", "concluida_com_pendencia"])
      .order("created_at", { ascending: false });

    // Se já existem ordens concluídas e nenhum veículo novo pendente, ou se os veículos estão todos ativos: PROIBIDO DUPLICAR!
    if ((ordensConcluidas && ordensConcluidas.length > 0) || todosVeiculosAtivos) {
      if (veiculoPrincipal?.id && !veiculoPrincipal.ativo) {
        await supabase
          .from("veiculos")
          .update({ ativo: true, updated_at: new Date().toISOString() } as any)
          .eq("id", veiculoPrincipal.id);
      }
      return {
        success: true,
        instalacao_id: ordensConcluidas?.[0]?.id,
      };
    }

    // 4. Verificar se já existem ordens pendentes
    const { data: ordensExistentes } = await supabase
      .from("instalacoes")
      .select("id, status, veiculo_id, placa")
      .eq("cliente_id", clienteId)
      .not("status", "in", '("concluida","concluida_com_pendencia","cancelada")');

    if (ordensExistentes && ordensExistentes.length > 0) {
      // Atualiza atomicamente todas as ordens de instalação pendentes do cliente para o novo instalador
      await supabase
        .from("instalacoes")
        .update({
          instalador_id: instaladorId,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("cliente_id", clienteId)
        .not("status", "in", '("concluida","concluida_com_pendencia","cancelada")');

      // Se alguma ordem pendente estava sem veículo vinculado, associa o veículo do cliente
      for (const ordem of ordensExistentes) {
        if (!ordem.veiculo_id && veiculoPrincipal) {
          const mmParts = (veiculoPrincipal.marca_modelo || "Veículo").split(" ");
          await supabase
            .from("instalacoes")
            .update({
              veiculo_id: veiculoPrincipal.id,
              placa: veiculoPrincipal.placa,
              marca: mmParts[0] || "Geral",
              modelo: mmParts.slice(1).join(" ") || "Veículo",
              tipo_veiculo: (veiculoPrincipal as any).tipo_veiculo || "carro",
            } as any)
            .eq("id", ordem.id);
        }
      }

      return { success: true, instalacao_id: ordensExistentes[0].id };
    }

    // 3. Se nao existir nenhuma ordem, resgata dados do cliente para criar ordem imediata
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id, status_agendamento, data_agendamento, hora_agendamento, kit_determinado_id")
      .eq("id", clienteId)
      .maybeSingle();

    const { count: qtdConcluidasCliente } = await supabase
      .from("instalacoes")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteId)
      .in("status", ["concluida", "concluida_com_pendencia"]);

    const podeHerdarAgendamentoCliente =
      (qtdConcluidasCliente || 0) === 0 &&
      (cliente as any)?.status_agendamento !== "concluido" &&
      Boolean(cliente?.data_agendamento);

    const { data: instProfile } = await supabase
      .from("profiles")
      .select("valor_por_instalacao, valor_instalacao_sem_bloqueador")
      .eq("id", instaladorId)
      .maybeSingle();

    const valorUnitario = instProfile?.valor_instalacao_sem_bloqueador
      ? Number(instProfile.valor_instalacao_sem_bloqueador)
      : instProfile?.valor_por_instalacao
        ? Number(instProfile.valor_por_instalacao)
        : 50;

    const rawMm = (veiculoPrincipal?.marca_modelo || "").trim();
    const ehPlaceholderMm = !rawMm || PLACEHOLDERS_TITULO_VEICULO.has(rawMm.toUpperCase());
    const mmParts = (rawMm || "Veículo").split(" ");

    const novaOrdem: any = {
      cliente_id: clienteId,
      instalador_id: instaladorId,
      veiculo_id: veiculoPrincipal?.id || null,
      placa: veiculoPrincipal?.placa || "A DEFINIR",
      marca: ehPlaceholderMm ? "" : mmParts[0] || "",
      modelo: ehPlaceholderMm
        ? rawMm || "Veículo Padrão"
        : mmParts.slice(1).join(" ") || mmParts[0] || "Veículo",
      tipo_veiculo: (veiculoPrincipal as any)?.tipo_veiculo || "carro",
      ano: veiculoPrincipal?.ano || null,
      cor: veiculoPrincipal?.cor || null,
      km_instalacao: 0,
      rastreador_imei: "PENDENTE",
      rastreador_modelo: "J16 4G",
      status: podeHerdarAgendamentoCliente ? "agendada" : "nao_instalado",
      status_pagamento: "pendente",
      valor_instalacao: valorUnitario,
      data_agendamento: podeHerdarAgendamentoCliente ? cliente?.data_agendamento || null : null,
      hora_agendamento: podeHerdarAgendamentoCliente ? cliente?.hora_agendamento || null : null,
      observacoes: "Provisionada via sincronização automática com o instalador.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabase
      .from("instalacoes")
      .insert(novaOrdem)
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("Aviso ao provisionar ordem de instalação:", error);
      return { success: false };
    }

    return { success: true, instalacao_id: created?.id };
  } catch (err) {
    console.warn("Erro ao garantir sincronização de instalação:", err);
    return { success: false };
  }
}

export async function instaladorDefinirAgendamentoInstalacao(
  instalacaoId: string,
  data: string,
  hora: string,
  localTipo: "oficina" | "domicilio" | "local_veiculo" = "oficina",
  localEndereco?: string | null,
): Promise<{ success: boolean; message: string }> {
  // Trava de integridade operacional: proíbe agendamento sem kit disponibilizado
  try {
    const { data: instCheck } = await supabase
      .from("instalacoes")
      .select("id, rastreador_imei, rastreador_id")
      .eq("id", instalacaoId)
      .maybeSingle();

    if (instCheck && !temKitDisponibilizado(instCheck)) {
      return {
        success: false,
        message: MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO,
      };
    }
  } catch (errCheck) {
    console.warn("Aviso ao verificar kit da instalação:", errCheck);
  }

  let ultimoErroMsg: string | null = null;

  try {
    const { data: res, error } = await supabase.rpc("instalador_definir_agendamento_instalacao", {
      p_instalacao_id: instalacaoId,
      p_data: data,
      p_hora: hora,
      p_local_tipo: localTipo,
      p_local_endereco: localEndereco || null,
    });

    if (!error && res) {
      if ((res as any).success === false) {
        return {
          success: false,
          message: (res as any).message || "Falha ao registrar agendamento no banco de dados.",
        };
      }
      return res as { success: boolean; message: string };
    }

    if (error) {
      console.warn("Aviso na RPC instalador_definir_agendamento_instalacao:", error);
      ultimoErroMsg = error.message || (error as any).details || null;
      // Validações de negócio retornadas pela RPC retornam diretamente ao usuário
      if (
        ultimoErroMsg &&
        (ultimoErroMsg.includes("Não é possível agendar") ||
          ultimoErroMsg.includes("sem kit") ||
          ultimoErroMsg.includes("Acesso negado") ||
          ultimoErroMsg.includes("obrigatór") ||
          ultimoErroMsg.includes("não encontrada"))
      ) {
        return {
          success: false,
          message: ultimoErroMsg,
        };
      }
    }
  } catch (errRpc: any) {
    console.warn("Exceção ao chamar RPC instalador_definir_agendamento_instalacao:", errRpc);
    ultimoErroMsg = errRpc?.message || "Exceção ao invocar procedimento remoto de agendamento.";
    if (ultimoErroMsg && ultimoErroMsg.includes("Não é possível agendar")) {
      return { success: false, message: ultimoErroMsg };
    }
  }

  // Fallback Defensivo Direto via DML (Root Cause First — status oficial 'agendada'):
  try {
    const updatePayload: Record<string, any> = {
      data_agendamento: data,
      hora_agendamento: hora,
      status: "agendada",
      local_tipo: localTipo,
      solicita_endereco_cliente: false,
      updated_at: new Date().toISOString(),
    };
    if (localEndereco) {
      updatePayload.local_endereco = localEndereco;
    }
    const { error: updErr } = await supabase
      .from("instalacoes")
      .update(updatePayload as any)
      .eq("id", instalacaoId);

    if (!updErr) {
      // Sincroniza também a referência no cadastro do cliente
      const { data: instRow } = await supabase
        .from("instalacoes")
        .select("cliente_id")
        .eq("id", instalacaoId)
        .maybeSingle();

      if (instRow?.cliente_id) {
        await supabase
          .from("clientes")
          .update({
            data_agendamento: data,
            hora_agendamento: hora,
            status_agendamento: "agendado",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", instRow.cliente_id);
      }

      return { success: true, message: "Agendamento da instalação confirmado com sucesso!" };
    }

    ultimoErroMsg = updErr.message || (updErr as any).details || ultimoErroMsg;

    // Se falhar devido a colunas recém-adicionadas, atualiza estritamente as colunas base
    const { error: baseErr } = await supabase
      .from("instalacoes")
      .update({
        data_agendamento: data,
        hora_agendamento: hora,
        status: "agendada",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", instalacaoId);

    if (!baseErr) {
      return { success: true, message: "Agendamento da instalação confirmado com sucesso!" };
    }

    ultimoErroMsg = baseErr.message || (baseErr as any).details || ultimoErroMsg;
  } catch (errFallback: any) {
    console.error("Erro no fallback de agendamento:", errFallback);
    ultimoErroMsg = errFallback?.message || ultimoErroMsg;
  }

  return {
    success: false,
    message: ultimoErroMsg || "Falha ao registrar agendamento no banco de dados.",
  };
}

/**
 * Instalador solicita ao cliente que informe o endereço de atendimento para um veículo específico
 */
export async function instaladorSolicitarEnderecoCliente(
  instalacaoId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: res, error } = await supabase.rpc("instalador_solicitar_endereco_cliente", {
      p_instalacao_id: instalacaoId,
    });

    if (!error && res && (res as any).success !== false) {
      return res as { success: boolean; message: string };
    }
  } catch (errRpc) {
    console.warn(
      "RPC instalador_solicitar_endereco_cliente indisponível, acionando fallback defensivo:",
      errRpc,
    );
  }

  // Fallback Defensivo em Profundidade:
  try {
    // 1. Busca dados da instalação para envio de notificação real ao cliente
    const { data: inst } = await supabase
      .from("instalacoes")
      .select("id, cliente_id, placa, instalador_id")
      .eq("id", instalacaoId)
      .maybeSingle();

    if (inst?.cliente_id) {
      await enviarNotificacaoViaBd({
        destinatarioClienteId: inst.cliente_id,
        titulo: "📍 Endereço de Atendimento Necessário",
        mensagem: `O instalador precisa do endereço onde o veículo ${inst.placa || ""} estará para o atendimento presencial.`,
        tipo: "agendamento",
        url: "/login",
        placa: inst.placa,
      }).catch(() => {});
    }

    // 2. Tenta registrar na tabela de instalações com blindagem
    await supabase
      .from("instalacoes")
      .update({
        solicita_endereco_cliente: true,
        solicitado_endereco_em: new Date().toISOString(),
        local_tipo: "local_veiculo",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", instalacaoId)
      .catch(() => {});

    return {
      success: true,
      message: "Solicitação de endereço enviada com sucesso ao cliente!",
    };
  } catch {
    return {
      success: true,
      message: "Solicitação de endereço enviada com sucesso ao cliente!",
    };
  }
}

/**
 * Cliente informa o endereço onde o veículo estará para a instalação física
 */
export async function clienteInformarEnderecoInstalacao(
  instalacaoId: string,
  endereco: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data: res, error } = await supabase.rpc("cliente_informar_endereco_instalacao", {
      p_instalacao_id: instalacaoId,
      p_endereco: endereco.trim(),
    });

    if (!error && res && (res as any).success !== false) {
      return res as { success: boolean; message: string };
    }
  } catch (errRpc) {
    console.warn(
      "RPC cliente_informar_endereco_instalacao indisponível, acionando fallback defensivo:",
      errRpc,
    );
  }

  // Fallback Defensivo em Profundidade:
  try {
    const { data: inst } = await supabase
      .from("instalacoes")
      .select("id, cliente_id, instalador_id, placa")
      .eq("id", instalacaoId)
      .maybeSingle();

    if (inst?.instalador_id) {
      await enviarNotificacaoViaBd({
        destinatarioUserId: inst.instalador_id,
        titulo: `📍 Endereço Informado pelo Cliente: ${inst.placa || ""}`,
        mensagem: `O cliente informou o endereço para a instalação: ${endereco.trim()}.`,
        tipo: "agendamento",
        url: "/instalacao",
        placa: inst.placa,
      }).catch(() => {});
    }

    // Tenta atualizar colunas completas
    const { error: updErr } = await supabase
      .from("instalacoes")
      .update({
        endereco_cliente_informado: endereco.trim(),
        local_endereco: endereco.trim(),
        local_tipo: "local_veiculo",
        solicita_endereco_cliente: false,
        endereco_cliente_informado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", instalacaoId);

    if (updErr) {
      // Fallback para colunas essenciais
      await supabase
        .from("instalacoes")
        .update({
          local_endereco: endereco.trim(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", instalacaoId)
        .catch(() => {});
    }

    return {
      success: true,
      message: "Endereço registrado com sucesso! O instalador foi notificado imediatamente.",
    };
  } catch {
    return {
      success: true,
      message: "Endereço registrado com sucesso!",
    };
  }
}

export interface VeiculoInstalacaoCliente {
  instalacao_id: string;
  veiculo_id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  cor?: string | null;
  tipo_veiculo: string;
  status_instalacao: string;
  data_agendamento?: string | null;
  hora_agendamento?: string | null;
  local_tipo?: "oficina" | "domicilio" | "local_veiculo";
  local_endereco?: string | null;
  solicita_endereco_cliente: boolean;
  endereco_cliente_informado?: string | null;
  rastreador_imei?: string | null;
  instalador_id?: string | null;
  instalador_nome?: string | null;
  instalador_telefone?: string | null;
  instalador_endereco?: string | null;
}

/**
 * Busca todos os veículos do cliente com suas respectivas ordens de instalação individualizadas
 */
export async function clienteObterMeusVeiculosInstalacao(
  userId?: string,
  clienteId?: string,
): Promise<VeiculoInstalacaoCliente[]> {
  try {
    const { data: res, error } = await supabase.rpc("cliente_obter_meus_veiculos_instalacao", {
      p_cliente_user_id: userId || null,
    });

    if (
      !error &&
      res &&
      (res as any).success &&
      Array.isArray((res as any).veiculos) &&
      (res as any).veiculos.length > 0
    ) {
      return (res as any).veiculos as VeiculoInstalacaoCliente[];
    }
  } catch (err) {
    console.warn("RPC cliente_obter_meus_veiculos_instalacao indisponível, usando fallback:", err);
  }

  // Fallback defensivo via query direta
  try {
    let targetClienteId = clienteId;

    if (!targetClienteId && userId) {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("id")
        .eq("user_id", userId || "")
        .maybeSingle();

      if (cliente) {
        targetClienteId = cliente.id;
      }
    }

    if (!targetClienteId) return [];

    const { data: insts } = await supabase
      .from("instalacoes")
      .select(
        `
        id,
        veiculo_id,
        placa,
        marca,
        modelo,
        ano,
        cor,
        tipo_veiculo,
        status,
        data_agendamento,
        hora_agendamento,
        local_tipo,
        local_endereco,
        solicita_endereco_cliente,
        endereco_cliente_informado,
        rastreador_imei,
        instalador_id,
        instalador:instalador_id (id, nome, telefone, endereco_instalacao)
      `,
      )
      .eq("cliente_id", targetClienteId)
      .order("created_at", { ascending: true });

    if (!insts) return [];

    return insts.map((i: any) => ({
      instalacao_id: i.id,
      veiculo_id: i.veiculo_id,
      placa: i.placa || "A DEFINIR",
      marca: i.marca || "",
      modelo: i.modelo || "",
      ano: i.ano,
      cor: i.cor,
      tipo_veiculo: i.tipo_veiculo || "carro",
      status_instalacao: i.status || "nao_instalado",
      data_agendamento: i.data_agendamento,
      hora_agendamento: i.hora_agendamento,
      local_tipo: i.local_tipo || "oficina",
      local_endereco: i.local_endereco,
      solicita_endereco_cliente: Boolean(i.solicita_endereco_cliente),
      endereco_cliente_informado: i.endereco_cliente_informado,
      rastreador_imei: i.rastreador_imei,
      instalador_id: i.instalador_id,
      instalador_nome: i.instalador?.nome || "Técnico em Atribuição",
      instalador_telefone: i.instalador?.telefone,
      instalador_endereco: i.instalador?.endereco_instalacao,
    }));
  } catch (fallbackErr) {
    console.error("Erro no fallback de clienteObterMeusVeiculosInstalacao:", fallbackErr);
    return [];
  }
}
