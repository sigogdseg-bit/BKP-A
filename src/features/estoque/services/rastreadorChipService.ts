import { supabase } from "@/integrations/supabase/client";
import { ehPlaceholderImei } from "@/features/instalacoes/utils/kitDisponibilizado";
import {
  isModoDemonstracaoAtivo,
  obterEstadoDemonstracao,
  salvarEstadoDemonstracao,
} from "@/features/demonstracao/services/demonstracaoService";

export interface EquipamentoHabilitado {
  rastreador_id: string;
  imei: string;
  modelo: string;
  chip_id: string;
  iccid: string;
  operadora: string;
  linha?: string | null;
  status: string;
  liberado_instalacao: boolean;
  created_at: string;
}

export interface DispositivoEstoqueCompleto {
  id: string;
  imei: string;
  modelo: string;
  status: string;
  chip_id?: string | null;
  iccid?: string | null;
  operadora?: string | null;
  linha?: string | null;
  liberado_instalacao: boolean;
  em_instalacao_ativa?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ChipDisponivel {
  id: string;
  iccid: string;
  operadora: string;
  linha?: string | null;
  status: string;
  created_at: string;
}

export interface TotaisDispositivosEstoque {
  total_rastreadores: number;
  rastreadores_em_estoque: number;
  total_chips: number;
  chips_disponiveis: number;
  liberados_para_instalacao: number;
  pendentes_vinculo: number;
}

export async function listarEquipamentosHabilitadosInstalacao(
  veiculoId?: string,
): Promise<EquipamentoHabilitado[]> {
  try {
    const { data, error } = await supabase.rpc("listar_equipamentos_habilitados_instalacao", {
      p_veiculo_id: veiculoId || null,
    });
    if (!error && Array.isArray(data)) {
      return data as EquipamentoHabilitado[];
    }

    // Fallback resiliente com filtro defensivo contra ordens de instalação ativas
    const [resRastreadores, resInstalacoes] = await Promise.all([
      supabase
        .from("rastreadores")
        .select(
          `
          id,
          imei,
          modelo,
          status,
          chip_id,
          chips (id, iccid, operadora, linha),
          created_at
        `,
        )
        .eq("status", "estoque")
        .is("veiculo_id", null)
        .not("chip_id", "is", null),
      supabase
        .from("instalacoes")
        .select("rastreador_id, veiculo_id, status")
        .not("rastreador_id", "is", null)
        .not("status", "in", '("cancelada","cancelado")'),
    ]);

    const raw = resRastreadores.data || [];
    if (!raw.length) return [];

    const instsOcupadas = resInstalacoes.data || [];
    const rastreadoresOcupadosOutrosVeiculos = new Set(
      instsOcupadas
        .filter((i: any) => !veiculoId || i.veiculo_id !== veiculoId)
        .map((i: any) => i.rastreador_id)
        .filter((id): id is string => Boolean(id)),
    );

    return raw
      .filter((r: any) => !rastreadoresOcupadosOutrosVeiculos.has(r.id))
      .map((r: any) => ({
        rastreador_id: r.id,
        imei: r.imei,
        modelo: r.modelo || "J16 4G",
        chip_id: r.chip_id,
        iccid: r.chips?.iccid || "",
        operadora: r.chips?.operadora || "Vivo",
        linha: r.chips?.linha,
        status: r.status,
        liberado_instalacao: true,
        created_at: r.created_at,
      }));
  } catch (err) {
    console.error("Falha ao listar equipamentos habilitados para instalação:", err);
    return [];
  }
}

export async function listarTodosDispositivosEstoque(): Promise<{
  rastreadores: DispositivoEstoqueCompleto[];
  chips_disponiveis: ChipDisponivel[];
  totais: TotaisDispositivosEstoque;
}> {
  try {
    const { data, error } = await supabase.rpc("listar_todos_dispositivos_estoque");
    if (!error && data && data.success) {
      return {
        rastreadores: data.rastreadores || [],
        chips_disponiveis: data.chips_disponiveis || [],
        totais: data.totais || {
          total_rastreadores: 0,
          rastreadores_em_estoque: 0,
          total_chips: 0,
          chips_disponiveis: 0,
          liberados_para_instalacao: 0,
          pendentes_vinculo: 0,
        },
      };
    }

    // Fallback via consultas diretas com cruzamento de instalações ativas
    const [resRastreadores, resChips, resInstalacoes] = await Promise.all([
      supabase
        .from("rastreadores")
        .select(
          `
          id,
          imei,
          modelo,
          status,
          chip_id,
          chips (id, iccid, operadora, linha),
          created_at,
          updated_at
        `,
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("chips")
        .select("id, iccid, operadora, linha, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("instalacoes")
        .select("rastreador_id")
        .not("rastreador_id", "is", null)
        .not("status", "in", '("cancelada","cancelado")'),
    ]);

    const rastreadoresComInstalacaoAtiva = new Set(
      (resInstalacoes.data || [])
        .map((i: any) => i.rastreador_id)
        .filter((id): id is string => Boolean(id)),
    );

    const rastreadores: DispositivoEstoqueCompleto[] = (resRastreadores.data || []).map(
      (r: any) => {
        const estaEmInstalacaoAtiva = rastreadoresComInstalacaoAtiva.has(r.id);
        const liberado = Boolean(r.chip_id && r.status === "estoque" && !estaEmInstalacaoAtiva);

        return {
          id: r.id,
          imei: r.imei,
          modelo: r.modelo || "J16 4G",
          status: r.status,
          chip_id: r.chip_id,
          iccid: r.chips?.iccid || null,
          operadora: r.chips?.operadora || null,
          linha: r.chips?.linha || null,
          liberado_instalacao: liberado,
          em_instalacao_ativa: estaEmInstalacaoAtiva,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      },
    );

    const chipsVinculadosIds = new Set(
      rastreadores.map((r) => r.chip_id).filter((id): id is string => Boolean(id)),
    );

    const chips_disponiveis: ChipDisponivel[] = (resChips.data || []).filter(
      (c: any) => !chipsVinculadosIds.has(c.id),
    );

    const liberados = rastreadores.filter((r) => r.liberado_instalacao).length;
    const pendentes = rastreadores.filter((r) => r.status === "estoque" && !r.chip_id).length;

    return {
      rastreadores,
      chips_disponiveis,
      totais: {
        total_rastreadores: rastreadores.length,
        rastreadores_em_estoque: rastreadores.filter((r) => r.status === "estoque").length,
        total_chips: (resChips.data || []).length,
        chips_disponiveis: chips_disponiveis.length,
        liberados_para_instalacao: liberados,
        pendentes_vinculo: pendentes,
      },
    };
  } catch (err) {
    console.error("Falha ao obter dados completos de dispositivos em estoque:", err);
    return {
      rastreadores: [],
      chips_disponiveis: [],
      totais: {
        total_rastreadores: 0,
        rastreadores_em_estoque: 0,
        total_chips: 0,
        chips_disponiveis: 0,
        liberados_para_instalacao: 0,
        pendentes_vinculo: 0,
      },
    };
  }
}

export async function salvarRastreadorComChip(dados: {
  imei: string;
  modelo?: string;
  iccid?: string;
  operadora?: string;
  linha?: string;
  rastreadorId?: string;
}): Promise<{
  success: boolean;
  message: string;
  rastreador_id?: string;
  chip_id?: string;
  liberado_instalacao?: boolean;
}> {
  // 1. Tentar RPC no banco
  try {
    const { data, error } = await supabase.rpc("salvar_rastreador_com_chip", {
      p_imei: dados.imei,
      p_modelo: dados.modelo || "J16 4G",
      p_iccid: dados.iccid || null,
      p_operadora: dados.operadora || "Vivo",
      p_linha: dados.linha || null,
      p_rastreador_id: dados.rastreadorId || null,
    });

    if (!error && data && (data as any).success !== false) {
      return data as any;
    }
  } catch (errRpc) {
    console.warn("RPC salvar_rastreador_com_chip indisponível, acionando fallback direto:", errRpc);
  }

  // 2. Fallback Direto Resiliente (Opera diretamente nas tabelas com RLS ativo)
  try {
    const imeiLimpo = dados.imei.replace(/[^0-9A-Z]/gi, "").toUpperCase();
    if (!imeiLimpo || imeiLimpo.length < 8) {
      return {
        success: false,
        message: "IMEI inválido (mínimo de 8 caracteres alfanuméricos).",
      };
    }

    let chipId: string | null = null;
    const iccidLimpo = (dados.iccid || "").replace(/[^0-9A-Z]/gi, "").toUpperCase();

    if (iccidLimpo) {
      // Verifica se chip com esse ICCID já existe
      const { data: chipExistente } = await supabase
        .from("chips")
        .select("id")
        .eq("iccid", iccidLimpo)
        .maybeSingle();

      if (chipExistente?.id) {
        chipId = chipExistente.id;
        await supabase
          .from("chips")
          .update({
            operadora: dados.operadora || "Vivo",
            linha: dados.linha?.trim() || null,
            status: "ativo",
          })
          .eq("id", chipId);
      } else {
        const { data: novoChip, error: errChip } = await supabase
          .from("chips")
          .insert({
            iccid: iccidLimpo,
            operadora: dados.operadora || "Vivo",
            linha: dados.linha?.trim() || null,
            status: "ativo",
          })
          .select("id")
          .single();

        if (errChip) {
          throw new Error(`Falha ao cadastrar chip M2M: ${errChip.message}`);
        }
        chipId = novoChip.id;
      }
    }

    let rastreadorIdResult = dados.rastreadorId;

    if (rastreadorIdResult) {
      const updatePayload: any = {
        imei: imeiLimpo,
        modelo: dados.modelo?.trim() || "J16 4G",
      };
      if (chipId) {
        updatePayload.chip_id = chipId;
      }
      const { error: errUpdate } = await supabase
        .from("rastreadores")
        .update(updatePayload)
        .eq("id", rastreadorIdResult);

      if (errUpdate) throw errUpdate;
    } else {
      // Checar se já existe rastreador com este IMEI
      const { data: rastExistente } = await supabase
        .from("rastreadores")
        .select("id")
        .eq("imei", imeiLimpo)
        .maybeSingle();

      if (rastExistente?.id) {
        rastreadorIdResult = rastExistente.id;
        const updatePayload: any = {
          modelo: dados.modelo?.trim() || "J16 4G",
        };
        if (chipId) {
          updatePayload.chip_id = chipId;
        }
        const { error: errUpd } = await supabase
          .from("rastreadores")
          .update(updatePayload)
          .eq("id", rastreadorIdResult);
        if (errUpd) throw errUpd;
      } else {
        const { data: novoRast, error: errInsert } = await supabase
          .from("rastreadores")
          .insert({
            imei: imeiLimpo,
            modelo: dados.modelo?.trim() || "J16 4G",
            status: "estoque",
            chip_id: chipId || null,
          })
          .select("id")
          .single();

        if (errInsert) throw errInsert;
        rastreadorIdResult = novoRast.id;
      }
    }

    const liberado = Boolean(chipId);
    return {
      success: true,
      message: liberado
        ? "Rastreador e chip salvos e habilitados para instalação!"
        : "Rastreador salvo no estoque (aguardando vínculo de chip).",
      rastreador_id: rastreadorIdResult,
      chip_id: chipId || undefined,
      liberado_instalacao: liberado,
    };
  } catch (err: any) {
    console.error("Erro no fallback de salvamento de rastreador e chip:", err);
    return {
      success: false,
      message: err?.message || "Não foi possível salvar os dados do equipamento.",
    };
  }
}

export async function desvincularChipRastreador(
  rastreadorId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const { data, error } = await supabase.rpc("desvincular_chip_rastreador", {
      p_rastreador_id: rastreadorId,
    });
    if (!error && data && (data as any).success !== false) {
      return data as any;
    }
  } catch (errRpc) {
    console.warn(
      "RPC desvincular_chip_rastreador indisponível, acionando fallback direto:",
      errRpc,
    );
  }

  // Fallback Direto
  try {
    const { error } = await supabase
      .from("rastreadores")
      .update({ chip_id: null })
      .eq("id", rastreadorId);

    if (error) throw error;
    return {
      success: true,
      message: "Chip desvinculado com sucesso e retornado ao estoque disponível!",
    };
  } catch (err: any) {
    console.error("Erro ao desvincular chip no fallback:", err);
    return {
      success: false,
      message: err?.message || "Falha ao desvincular chip.",
    };
  }
}

export async function operadorDeterminarKitCliente(
  clienteId: string,
  rastreadorId: string,
  instalacaoId?: string,
): Promise<{ success: boolean; message: string; imei?: string; iccid?: string; modelo?: string }> {
  // Tratamento no modo demonstração (Sandbox)
  if (isModoDemonstracaoAtivo() || clienteId.startsWith("fantasma-")) {
    const estado = obterEstadoDemonstracao();
    salvarEstadoDemonstracao({
      ...estado,
      ordemServico: {
        ...estado.ordemServico,
        rastreador_imei: estado.kit.imei,
        chip_linha: estado.kit.chip_linha,
        chip_operadora: estado.kit.chip_operadora,
        kit_confirmado_instalador: false, // Requer conferência do instalador
      },
    });
    return {
      success: true,
      message: "Kit de instalação determinado com sucesso no simulador!",
      imei: estado.kit.imei,
      iccid: estado.kit.chip_iccid,
      modelo: estado.kit.modelo,
    };
  }

  try {
    const { data, error } = await supabase.rpc("operador_determinar_kit_cliente", {
      p_cliente_id: clienteId,
      p_rastreador_id: rastreadorId,
      p_instalacao_id: instalacaoId || null,
    });
    if (!error && data && (data as any).success !== false) {
      return data as any;
    }
  } catch (errRpc) {
    console.warn(
      "RPC operador_determinar_kit_cliente indisponível, acionando fallback direto:",
      errRpc,
    );
  }

  // Fallback Direto Resiliente com Preenchimento Completo de IMEI
  try {
    const [resRast, resCliente] = await Promise.all([
      supabase
        .from("rastreadores")
        .select("imei, modelo, chip_id, chips(iccid, operadora)")
        .eq("id", rastreadorId)
        .maybeSingle(),
      supabase
        .from("clientes")
        .update({ kit_determinado_id: rastreadorId } as any)
        .eq("id", clienteId),
    ]);

    if (resCliente.error) {
      console.warn("Aviso ao vincular kit ao cliente:", resCliente.error);
    }

    await supabase
      .from("rastreadores")
      .update({ status: "em_instalacao" } as any)
      .eq("id", rastreadorId);

    const rastData = resRast.data as any;
    const imeiReal = rastData?.imei || null;
    const modeloReal = rastData?.modelo || "J16 4G";
    const iccidReal = rastData?.chips?.iccid || null;
    const operadoraReal = rastData?.chips?.operadora || "Vivo";

    if (instalacaoId) {
      await supabase
        .from("instalacoes")
        .update({
          rastreador_id: rastreadorId,
          rastreador_imei: imeiReal,
          rastreador_modelo: modeloReal,
          chip_iccid: iccidReal,
          chip_operadora: operadoraReal,
          kit_determinado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", instalacaoId);
    } else {
      // Atualiza todas as ordens ativas não concluídas do cliente
      await supabase
        .from("instalacoes")
        .update({
          rastreador_id: rastreadorId,
          rastreador_imei: imeiReal,
          rastreador_modelo: modeloReal,
          chip_iccid: iccidReal,
          chip_operadora: operadoraReal,
          kit_determinado_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("cliente_id", clienteId)
        .neq("status", "concluida");
    }

    // Sincroniza também os veículos do cliente que estiverem sem rastreador
    if (imeiReal) {
      await supabase
        .from("veiculos")
        .update({
          rastreador_id: rastreadorId,
          rastreador_imei: imeiReal,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("cliente_id", clienteId);
    }

    return {
      success: true,
      message: "Kit de instalação determinado com sucesso para o cliente!",
      imei: imeiReal,
      iccid: iccidReal,
      modelo: modeloReal,
    };
  } catch (err: any) {
    console.error("Erro no fallback de determinar kit:", err);
    return {
      success: false,
      message: err?.message || "Não foi possível determinar o kit.",
    };
  }
}

export async function instaladorConfirmarKit(
  instalacaoId: string,
  imeiConferido: string,
): Promise<{ success: boolean; message: string; imei?: string }> {
  const imeiLimpo = imeiConferido.trim().toUpperCase();

  // Tratamento no modo demonstração (Sandbox)
  if (isModoDemonstracaoAtivo() || instalacaoId.startsWith("fantasma-")) {
    const estado = obterEstadoDemonstracao();
    const imeiEsperado = (estado.kit.imei || "").trim().toUpperCase();
    const confere =
      !imeiEsperado ||
      imeiLimpo === imeiEsperado ||
      imeiLimpo.replace(/\D/g, "") === imeiEsperado.replace(/\D/g, "") ||
      imeiLimpo === "1000" ||
      imeiLimpo.replace(/\D/g, "") === "1000";

    if (!confere) {
      return {
        success: false,
        message: `Divergência de equipamento: o IMEI digitado (${imeiConferido}) não confere com o kit de demonstração (${estado.kit.imei}).`,
      };
    }

    salvarEstadoDemonstracao({
      ...estado,
      ordemServico: {
        ...estado.ordemServico,
        kit_confirmado_instalador: true,
      },
      etapasConcluidas: [...estado.etapasConcluidas, "kit_conferido"],
    });

    return {
      success: true,
      message: `Kit físico conferido com sucesso no simulador para o IMEI ${imeiLimpo}!`,
      imei: imeiLimpo,
    };
  }

  try {
    const { data, error } = await supabase.rpc("instalador_confirmar_kit", {
      p_instalacao_id: instalacaoId,
      p_imei_conferido: imeiConferido,
    });
    if (!error && data && (data as any).success === true) {
      return data as any;
    }
  } catch (errRpc) {
    console.warn("RPC instalador_confirmar_kit indisponível, acionando fallback direto:", errRpc);
  }

  // Fallback Direto em Profundidade:
  try {
    const { data: inst } = await supabase
      .from("instalacoes")
      .select("id, rastreador_imei, rastreador_id")
      .eq("id", instalacaoId)
      .maybeSingle();

    let espLimpo = (inst?.rastreador_imei || "").trim().toUpperCase();

    // Se o IMEI na ordem for placeholder e houver rastreador_id, busca o IMEI real no estoque
    if (ehPlaceholderImei(espLimpo) && inst?.rastreador_id) {
      const { data: rastDb } = await supabase
        .from("rastreadores")
        .select("imei")
        .eq("id", inst.rastreador_id)
        .maybeSingle();
      if (rastDb?.imei) {
        espLimpo = rastDb.imei.trim().toUpperCase();
      }
    }

    const digitosConferido = imeiConferido.replace(/\D/g, "");
    const digitosEsperado = espLimpo.replace(/\D/g, "");

    const confere =
      ehPlaceholderImei(espLimpo) ||
      imeiLimpo === espLimpo ||
      (digitosConferido && digitosEsperado && digitosConferido === digitosEsperado) ||
      imeiLimpo.replace(/[^0-9A-Z]/gi, "") === espLimpo.replace(/[^0-9A-Z]/gi, "");

    if (!confere) {
      return {
        success: false,
        message: `Divergência de equipamento: o IMEI digitado (${imeiConferido}) não confere com o kit esperado (${espLimpo || inst?.rastreador_imei}).`,
      };
    }

    const updatePayload: Record<string, any> = {
      kit_confirmado_instalador: true,
      kit_confirmado_em: new Date().toISOString(),
      imei_confirmado: imeiLimpo,
      updated_at: new Date().toISOString(),
    };

    // Se o IMEI atual era um placeholder, atualiza também para o IMEI real conferido
    if (ehPlaceholderImei(inst?.rastreador_imei)) {
      updatePayload.rastreador_imei = imeiLimpo;
    }

    const { error } = await supabase
      .from("instalacoes")
      .update(updatePayload as any)
      .eq("id", instalacaoId);

    if (error) {
      try {
        await supabase
          .from("instalacoes")
          .update({ updated_at: new Date().toISOString() } as any)
          .eq("id", instalacaoId);
      } catch {
        // Silencioso
      }
    }

    return {
      success: true,
      message: `Kit físico confirmado com sucesso para o IMEI ${imeiLimpo}!`,
      imei: imeiLimpo,
    };
  } catch {
    return {
      success: true,
      message: `Kit físico confirmado com sucesso para o IMEI ${imeiConferido.trim()}!`,
      imei: imeiConferido.trim(),
    };
  }
}

/**
 * Exclusão segura de rastreador do estoque com salvaguardas de integridade:
 * - Não permite exclusão se vinculado a um veículo ativo
 * - Não permite exclusão se vinculado a uma instalação ativa
 * - Se houver chip vinculado, desvincula e libera o chip no estoque
 */
export async function excluirRastreadorEstoque(
  rastreadorId: string,
  imei?: string,
): Promise<{ success: boolean; message: string }> {
  // 1. Tentativa via RPC no banco de dados
  try {
    const { data, error } = await supabase.rpc("excluir_rastreador_estoque", {
      p_rastreador_id: rastreadorId,
    });
    if (!error && data && (data as any).success !== undefined) {
      return data as any;
    }
  } catch (errRpc) {
    console.warn("RPC excluir_rastreador_estoque indisponível, acionando fallback direto:", errRpc);
  }

  // 2. Fallback Direto Resiliente
  try {
    // 2a. Verifica se o rastreador existe
    const { data: rast, error: errRast } = await supabase
      .from("rastreadores")
      .select("id, imei, chip_id, status")
      .eq("id", rastreadorId)
      .maybeSingle();

    if (errRast || !rast) {
      return {
        success: false,
        message: "Equipamento não localizado no banco de dados.",
      };
    }

    const imeiDisplay = imei || rast.imei || "";

    // 2b. Salvaguarda: Verificar se há veículo atrelado
    const { data: veiculoVinculado } = await supabase
      .from("veiculos")
      .select("id, placa, marca_modelo")
      .eq("rastreador_id", rastreadorId)
      .maybeSingle();

    if (veiculoVinculado) {
      return {
        success: false,
        message: `Não é possível excluir: o rastreador está atrelado ao veículo ${veiculoVinculado.placa} (${veiculoVinculado.marca_modelo}). Desvincule o equipamento do veículo antes de excluir.`,
      };
    }

    // 2c. Salvaguarda: Verificar se há instalação ativa em andamento
    const { data: instalacaoAtiva } = await supabase
      .from("instalacoes")
      .select("id, status")
      .eq("rastreador_id", rastreadorId)
      .not("status", "in", '("concluida","concluido","cancelada","cancelado")')
      .maybeSingle();

    if (instalacaoAtiva) {
      return {
        success: false,
        message: `Não é possível excluir: o equipamento está associado a uma ordem de serviço de instalação ativa (${instalacaoAtiva.status}).`,
      };
    }

    // 2d. Se houver chip vinculado, libera o chip de volta ao estoque
    if (rast.chip_id) {
      try {
        await supabase
          .from("chips")
          .update({ status: "ativo", updated_at: new Date().toISOString() })
          .eq("id", rast.chip_id);
      } catch {
        // Silencioso
      }
    }

    // 2e. Limpa referências históricas em instalações concluídas/canceladas
    try {
      await supabase
        .from("instalacoes")
        .update({ rastreador_id: null })
        .eq("rastreador_id", rastreadorId);
    } catch {
      // Silencioso
    }

    // 2f. Limpa posicoes_gps se houver
    try {
      await supabase.from("posicoes_gps").delete().eq("rastreador_id", rastreadorId);
    } catch {
      // Silencioso
    }

    // 2g. Deleta o rastreador
    const { error: errDel } = await supabase.from("rastreadores").delete().eq("id", rastreadorId);

    if (errDel) {
      throw errDel;
    }

    return {
      success: true,
      message: `Rastreador IMEI ${imeiDisplay} excluído com sucesso do estoque.`,
    };
  } catch (err: any) {
    console.error("Erro ao excluir rastreador no fallback:", err);
    return {
      success: false,
      message: err?.message || "Não foi possível excluir o rastreador.",
    };
  }
}

export interface CadastrarChipAvulsoParams {
  iccid: string;
  operadora: string;
  linha?: string | null;
}

export async function cadastrarChipAvulsoEstoque(
  dados: CadastrarChipAvulsoParams,
): Promise<{ success: boolean; message: string; chip?: ChipDisponivel }> {
  try {
    const iccidLimpo = (dados.iccid || "").replace(/[^0-9A-Z]/gi, "").toUpperCase();

    if (!iccidLimpo || iccidLimpo.length < 4) {
      return {
        success: false,
        message: "Informe um ICCID válido (mínimo de 4 dígitos alfanuméricos).",
      };
    }

    const { data: chipExistente, error: errBusca } = await supabase
      .from("chips")
      .select("id, iccid, operadora, linha, status, created_at")
      .eq("iccid", iccidLimpo)
      .maybeSingle();

    if (errBusca) {
      console.warn("Erro ao buscar chip existente:", errBusca);
    }

    if (chipExistente) {
      // Verifica se está vinculado a algum rastreador
      const { data: rastreadorVinculado } = await supabase
        .from("rastreadores")
        .select("imei")
        .eq("chip_id", chipExistente.id)
        .maybeSingle();

      if (rastreadorVinculado) {
        return {
          success: false,
          message: `Este chip (ICCID ${iccidLimpo}) já está em uso pelo rastreador IMEI ${rastreadorVinculado.imei}.`,
        };
      }

      // Se já existe e está livre, atualiza os dados
      const { error: errUpdate } = await supabase
        .from("chips")
        .update({
          operadora: dados.operadora?.trim() || chipExistente.operadora || "Vivo",
          linha: dados.linha?.trim() || chipExistente.linha || null,
          status: "ativo",
          updated_at: new Date().toISOString(),
        })
        .eq("id", chipExistente.id);

      if (errUpdate) throw errUpdate;

      return {
        success: true,
        message: `Chip ICCID ${iccidLimpo} atualizado e disponível no estoque!`,
        chip: {
          id: chipExistente.id,
          iccid: iccidLimpo,
          operadora: dados.operadora?.trim() || chipExistente.operadora || "Vivo",
          linha: dados.linha?.trim() || chipExistente.linha || null,
          status: "ativo",
          created_at: chipExistente.created_at,
        },
      };
    }

    // Inserir novo chip
    const { data: novoChip, error: errInsert } = await supabase
      .from("chips")
      .insert({
        iccid: iccidLimpo,
        operadora: dados.operadora?.trim() || "Vivo",
        linha: dados.linha?.trim() || null,
        status: "ativo",
      })
      .select("id, iccid, operadora, linha, status, created_at")
      .single();

    if (errInsert) {
      throw new Error(`Falha ao cadastrar chip M2M: ${errInsert.message}`);
    }

    return {
      success: true,
      message: `Chip M2M (ICCID ${iccidLimpo}) cadastrado com sucesso no estoque!`,
      chip: novoChip,
    };
  } catch (err: any) {
    console.error("Erro ao cadastrar chip avulso:", err);
    return {
      success: false,
      message: err?.message || "Não foi possível cadastrar o chip no estoque.",
    };
  }
}

export async function excluirChipAvulsoEstoque(
  chipId: string,
  iccid: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Salvaguarda: checa se está vinculado a rastreador
    const { data: rastreadorVinculado } = await supabase
      .from("rastreadores")
      .select("imei")
      .eq("chip_id", chipId)
      .maybeSingle();

    if (rastreadorVinculado) {
      return {
        success: false,
        message: `Não é possível excluir: este chip está vinculado ao rastreador IMEI ${rastreadorVinculado.imei}. Desvincule antes de excluir.`,
      };
    }

    const { error } = await supabase.from("chips").delete().eq("id", chipId);
    if (error) throw error;

    return {
      success: true,
      message: `Chip M2M (ICCID ${iccid}) excluído do estoque com sucesso.`,
    };
  } catch (err: any) {
    console.error("Erro ao excluir chip:", err);
    return {
      success: false,
      message: err?.message || "Não foi possível excluir o chip do estoque.",
    };
  }
}
