import { supabase } from "@/integrations/supabase/client";
import {
  enriquecerNumeracaoParcelasMensalidades,
  formatarParcelaMensalidade,
} from "@/features/mensalidades/services/mensalidadeService";
import type {
  Cliente,
  ItemHistoricoCliente,
  CategoriaHistoricoCliente,
  HistoricoClienteCompleto,
  ResumoHistoricoCliente,
} from "../types";

/**
 * Calcula os dias de atraso a partir de uma data de vencimento (YYYY-MM-DD)
 */
export function calcularDiasAtrasoData(dataVencimentoStr: string): number {
  if (!dataVencimentoStr) return 0;
  const [ano, mes, dia] = dataVencimentoStr.split("-").map(Number);
  const dataVenc = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dataVenc.setHours(0, 0, 0, 0);
  const diffMs = hoje.getTime() - dataVenc.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDias > 0 ? diffDias : 0;
}

/**
 * Filtra e ordena a lista de itens de histórico de forma pura e performática
 */
export function filtrarEOrdenarHistorico(
  itens: ItemHistoricoCliente[],
  categoria: CategoriaHistoricoCliente,
  ordem: "recente" | "antigo" = "recente",
  busca: string = "",
): ItemHistoricoCliente[] {
  let resultado = [...itens];

  // Filtro por categoria
  if (categoria !== "todos") {
    resultado = resultado.filter((item) => item.categoria === categoria);
  }

  // Filtro por termo de busca textual
  if (busca && busca.trim().length > 0) {
    const termo = busca.toLowerCase().trim();
    resultado = resultado.filter((item) => {
      const matchTitulo = item.titulo.toLowerCase().includes(termo);
      const matchDesc = item.descricao.toLowerCase().includes(termo);
      const matchPlaca = item.detalhes?.placa?.toLowerCase().includes(termo) || false;
      const matchProto = String(item.detalhes?.protocolo || "").includes(termo);
      return matchTitulo || matchDesc || matchPlaca || matchProto;
    });
  }

  // Ordenação temporal cronológica
  resultado.sort((a, b) => {
    const timeA = new Date(a.data).getTime() || 0;
    const timeB = new Date(b.data).getTime() || 0;
    return ordem === "recente" ? timeB - timeA : timeA - timeB;
  });

  return resultado;
}

/**
 * Carrega e consolida em tempo real todas as fontes de dados do cliente:
 * Chamados, Instalações, Pagamentos, Atrasos, Bloqueios e Adesão.
 */
export async function carregarHistoricoCliente(
  clienteId: string,
): Promise<HistoricoClienteCompleto | null> {
  try {
    const hojeStr = new Date().toISOString().split("T")[0];

    // Carrega todas as tabelas em paralelo
    const [clienteRes, mensalidadesRes, instalacoesRes, atendimentosRes, veiculosRes] =
      await Promise.all([
        supabase.from("clientes").select("*").eq("id", clienteId).single(),
        supabase
          .from("mensalidades")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("data_vencimento", { ascending: false }),
        supabase
          .from("instalacoes")
          .select("*, instalador:instalador_id (nome)")
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("atendimentos")
          .select("*")
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false }),
        supabase.from("veiculos").select("*").eq("cliente_id", clienteId),
      ]);

    if (clienteRes.error || !clienteRes.data) {
      console.warn("Cliente nao encontrado ao carregar historico:", clienteRes.error);
      return null;
    }

    const cliente = clienteRes.data as Cliente;
    const mensalidades = enriquecerNumeracaoParcelasMensalidades(
      (mensalidadesRes.data || []) as any[],
    );
    const instalacoes = instalacoesRes.data || [];
    const atendimentos = atendimentosRes.data || [];
    const veiculos = veiculosRes.data || [];

    // Carrega o histórico de eventos de agendamento e atendimento das ordens de instalação
    const instalacoesIds = (instalacoes as any[]).map((i) => i.id).filter(Boolean);
    let historicoAtendimentos: any[] = [];
    if (instalacoesIds.length > 0) {
      const { data: histData } = await supabase
        .from("instalacoes_historico_atendimentos")
        .select("*, instalador:instalador_id (nome)")
        .in("instalacao_id", instalacoesIds)
        .order("created_at", { ascending: false });
      historicoAtendimentos = histData || [];
    }

    const itens: ItemHistoricoCliente[] = [];

    let totalPagamentosRealizados = 0;
    let totalValorPago = 0;
    let totalMensalidadesAtrasadas = 0;
    let totalValorEmAtraso = 0;
    let maiorAtrasoDias = 0;
    let totalAgendamentos = 0;
    let totalSolicitacoesEndereco = 0;

    // 1. Processamento de Mensalidades (Pagamentos e Atrasos)
    for (const m of mensalidades as any[]) {
      const valor = Number(m.valor || 0);
      const dataVenc = m.data_vencimento;
      const isPago = m.status === "pago" || !!m.data_pagamento;
      const isAtrasado = !isPago && (m.status === "vencido" || dataVenc < hojeStr);
      const parcelaFmt = formatarParcelaMensalidade(m.numero_parcela, m.total_parcelas);
      const rotuloMensalidade =
        Number(m.mes_referencia) === 0
          ? `Taxa de Ativação (${m.ano_referencia})`
          : `Mensalidade ${String(m.mes_referencia).padStart(2, "0")}/${m.ano_referencia}${parcelaFmt ? ` (${parcelaFmt})` : ""}`;

      if (isPago) {
        totalPagamentosRealizados++;
        totalValorPago += valor;

        itens.push({
          id: `pag-${m.id}`,
          data: m.data_pagamento || m.created_at,
          categoria: "pagamento",
          titulo: `Pagamento Confirmado - ${rotuloMensalidade}`,
          descricao: `Pagamento de R$ ${valor.toFixed(2)} liquidado no sistema.${m.comprovante_url ? " Comprovante anexado." : ""}`,
          detalhes: {
            valor,
            status: "pago",
            mesReferencia: m.mes_referencia,
            anoReferencia: m.ano_referencia,
            comprovante_url: m.comprovante_url,
          },
          severidade: "sucesso",
        });
      } else if (isAtrasado) {
        const diasAtraso = calcularDiasAtrasoData(dataVenc);
        totalMensalidadesAtrasadas++;
        totalValorEmAtraso += valor;
        if (diasAtraso > maiorAtrasoDias) {
          maiorAtrasoDias = diasAtraso;
        }

        itens.push({
          id: `atr-${m.id}`,
          data: dataVenc,
          categoria: "atraso",
          titulo: `Atraso no Pagamento - ${rotuloMensalidade}`,
          descricao: `Mensalidade no valor de R$ ${valor.toFixed(2)} vencida em ${dataVenc.split("-").reverse().join("/")} (${diasAtraso} dias em atraso).`,
          detalhes: {
            valor,
            diasAtraso,
            status: "vencido",
            mesReferencia: m.mes_referencia,
            anoReferencia: m.ano_referencia,
          },
          severidade: diasAtraso > 30 ? "perigo" : "alerta",
        });
      } else {
        // Fatura a vencer
        itens.push({
          id: `fat-${m.id}`,
          data: dataVenc,
          categoria: "pagamento",
          titulo: `Fatura Programada - ${rotuloMensalidade}`,
          descricao: `Vencimento previsto para ${dataVenc.split("-").reverse().join("/")} no valor de R$ ${valor.toFixed(2)}.`,
          detalhes: {
            valor,
            status: "pendente",
            mesReferencia: m.mes_referencia,
            anoReferencia: m.ano_referencia,
          },
          severidade: "info",
        });
      }
    }

    // Mapa de instalações para associação rápida
    const mapaInstalacoes = new Map<string, any>();
    for (const inst of instalacoes as any[]) {
      mapaInstalacoes.set(inst.id, inst);
    }

    // 2. Processamento do Histórico de Agendamentos e Eventos Operacionais
    const idsInstalacaoComEventoAgendamento = new Set<string>();

    for (const h of historicoAtendimentos as any[]) {
      const inst = mapaInstalacoes.get(h.instalacao_id);
      const placa = inst?.placa || "Sem Placa";
      const veiculoNome = `${inst?.marca || ""} ${inst?.modelo || ""}`.trim() || "Veículo";
      const statusAtend = (h.status_atendimento || "").toLowerCase();
      const motivo = (h.motivo || "").toLowerCase();
      const descricaoTexto = h.observacoes || h.descricao || "";
      const responsavel =
        h.instalador?.nome || h.autor_nome || inst?.instalador?.nome || "Equipe SIGO Guardião";

      if (
        statusAtend === "agendada" ||
        statusAtend.includes("agend") ||
        motivo.includes("agend") ||
        h.tipo_evento === "agendamento"
      ) {
        totalAgendamentos++;
        idsInstalacaoComEventoAgendamento.add(h.instalacao_id);
        const ehReagendamento =
          motivo.includes("reagend") ||
          descricaoTexto.toLowerCase().includes("reagend") ||
          h.dados_extras?.reagendamento === true;
        const titulo = ehReagendamento
          ? `Reagendamento de Instalação - ${placa}`
          : `Agendamento de Instalação - ${placa}`;

        itens.push({
          id: `hist-agend-${h.id}`,
          data: h.created_at,
          categoria: "agendamento",
          titulo,
          descricao:
            descricaoTexto ||
            `Instalação definida para ${inst?.data_agendamento ? inst.data_agendamento.split("-").reverse().join("/") : ""} às ${inst?.hora_agendamento || ""}h. Local: ${inst?.local_endereco || "Oficina"}.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            responsavel,
            dataAgendamento: inst?.data_agendamento,
            horaAgendamento: inst?.hora_agendamento,
            localTipo: inst?.local_tipo,
            endereco: inst?.local_endereco || inst?.endereco_instalacao,
          },
          severidade: "sucesso",
        });
      } else if (
        statusAtend === "solicitacao_endereco" ||
        motivo.includes("solicita") ||
        h.tipo_evento === "solicitacao_endereco"
      ) {
        totalSolicitacoesEndereco++;
        itens.push({
          id: `hist-solic-${h.id}`,
          data: h.created_at,
          categoria: "agendamento",
          titulo: `Solicitação de Localização - ${placa}`,
          descricao:
            descricaoTexto ||
            `O técnico solicitou o endereço onde o veículo estará para instalação presencial.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            responsavel,
          },
          severidade: "alerta",
        });
      } else if (
        statusAtend === "endereco_informado" ||
        motivo.includes("informado") ||
        h.tipo_evento === "endereco_informado"
      ) {
        itens.push({
          id: `hist-end-${h.id}`,
          data: h.created_at,
          categoria: "agendamento",
          titulo: `Localização Informada pelo Cliente - ${placa}`,
          descricao:
            descricaoTexto ||
            `Endereço informado pelo cliente para atendimento: ${inst?.endereco_cliente_informado || inst?.local_endereco || ""}.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            endereco: inst?.endereco_cliente_informado || inst?.local_endereco,
            responsavel: cliente.nome_razao_social || responsavel,
          },
          severidade: "info",
        });
      } else {
        // Outros eventos operacionais
        itens.push({
          id: `hist-evt-${h.id}`,
          data: h.created_at,
          categoria: "instalacao",
          titulo: `${h.motivo || "Evento Operacional"} - ${placa}`,
          descricao: descricaoTexto || `Atualização de status da ordem técnica.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            responsavel,
          },
          severidade: "info",
        });
      }
    }

    // 3. Processamento de Instalações (Ordens Principais)
    let instalacoesConcluidas = 0;
    for (const inst of instalacoes as any[]) {
      const placa = inst.placa || "Sem Placa";
      const veiculoNome = `${inst.marca || ""} ${inst.modelo || ""}`.trim() || "Veículo";
      const statusInst = inst.status;

      // Se possui agendamento na ordem mas não tem registro histórico correspondente, adiciona retrocompatível
      if (
        inst.data_agendamento &&
        inst.hora_agendamento &&
        !idsInstalacaoComEventoAgendamento.has(inst.id)
      ) {
        totalAgendamentos++;
        itens.push({
          id: `agend-legado-${inst.id}`,
          data: inst.updated_at || inst.created_at,
          categoria: "agendamento",
          titulo: `Agendamento de Instalação - ${placa}`,
          descricao: `Instalação agendada para ${inst.data_agendamento.split("-").reverse().join("/")} às ${inst.hora_agendamento}h (${inst.local_tipo === "local_veiculo" ? "Local do Veículo" : "Oficina"}: ${inst.endereco_instalacao || "Oficina"}).`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            responsavel: inst.instalador?.nome || "Oficina Credenciada",
            dataAgendamento: inst.data_agendamento,
            horaAgendamento: inst.hora_agendamento,
            localTipo: inst.local_tipo,
            endereco: inst.endereco_instalacao,
          },
          severidade: "sucesso",
        });
      }

      if (statusInst === "concluida") {
        instalacoesConcluidas++;
        itens.push({
          id: `inst-${inst.id}`,
          data: inst.concluida_at || inst.updated_at || inst.created_at,
          categoria: "instalacao",
          titulo: `Instalação Concluída - ${placa}`,
          descricao: `Instalação finalizada com sucesso no veículo ${veiculoNome}. Rastreador IMEI ${inst.rastreador_imei}. KM: ${inst.km_instalacao}. Técnico: ${inst.instalador?.nome || "Oficina Credenciada"}.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            status: "concluida",
            responsavel: inst.instalador?.nome,
          },
          severidade: "sucesso",
        });
      } else if (statusInst === "concluida_com_pendencia") {
        itens.push({
          id: `inst-${inst.id}`,
          data: inst.updated_at || inst.created_at,
          categoria: "instalacao",
          titulo: `Instalação com Pendência - ${placa}`,
          descricao: `Ordem técnica finalizada com ressalva: ${inst.motivo_pendencia_recusa || inst.observacoes || "Aguardando ajuste técnico"}.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            status: "concluida_com_pendencia",
          },
          severidade: "alerta",
        });
      } else {
        itens.push({
          id: `inst-${inst.id}`,
          data: inst.created_at,
          categoria: "instalacao",
          titulo: `Ordem de Instalação Aberta - ${placa}`,
          descricao: `Agendamento ou ordem de serviço iniciada para ${veiculoNome}. Técnico designado: ${inst.instalador?.nome || "A designar"}.`,
          detalhes: {
            placa,
            veiculo: veiculoNome,
            status: "nao_instalado",
          },
          severidade: "info",
        });
      }
    }

    // 3. Processamento de Chamados de Atendimento
    let chamadosAbertos = 0;
    for (const at of atendimentos as any[]) {
      const isFechado = at.status === "resolvido" || at.status === "cancelado";
      if (!isFechado) chamadosAbertos++;

      itens.push({
        id: `at-${at.id}`,
        data: at.created_at,
        categoria: "chamado",
        titulo: `Chamado #${at.numero_protocolo}: ${at.titulo}`,
        descricao: `${at.descricao_inicial}${at.solucao_conclusao ? " · Solução: " + at.solucao_conclusao : ""}`,
        detalhes: {
          protocolo: at.numero_protocolo,
          status: at.status,
          prioridade: at.prioridade,
        },
        severidade:
          at.status === "resolvido"
            ? "sucesso"
            : at.prioridade === "urgente" || at.prioridade === "alta"
              ? "perigo"
              : "alerta",
      });
    }

    // 4. Bloqueios e Segurança
    let bloqueiosAtivos = 0;

    if (cliente.status === "bloqueado") {
      bloqueiosAtivos++;
      itens.push({
        id: `bloq-cliente-${cliente.id}`,
        data: cliente.updated_at || new Date().toISOString(),
        categoria: "bloqueio_seguranca",
        titulo: "Bloqueio de Acesso SIGO Guardião Ativo",
        descricao:
          "O acesso do cliente ao aplicativo e painel encontra-se bloqueado por determinação administrativa ou inadimplência.",
        detalhes: {
          status: "bloqueado",
        },
        severidade: "perigo",
      });
    }

    for (const v of veiculos as any[]) {
      if (v.bloqueado) {
        bloqueiosAtivos++;
        itens.push({
          id: `bloq-veic-${v.id}`,
          data: v.updated_at || v.created_at,
          categoria: "bloqueio_seguranca",
          titulo: `Bloqueio Remoto de Veículo - Placa ${v.placa}`,
          descricao: `Comando de corte de ignição / combustível ativado para o veículo ${v.marca_modelo || v.placa}.`,
          detalhes: {
            placa: v.placa,
            veiculo: v.marca_modelo,
            status: "bloqueado",
          },
          severidade: "alerta",
        });
      }
    }

    // 5. Adesão e Cadastro Contratual Inicial
    itens.push({
      id: `cad-${cliente.id}`,
      data: cliente.created_at,
      categoria: "instalacao",
      titulo: "Início do Contrato SIGO Guardião",
      descricao: `Cadastro do cliente efetuado no plano comercial ${String(cliente.plano || "basico").toUpperCase()} com dia de vencimento ${cliente.dia_vencimento}.`,
      detalhes: {
        status: cliente.status,
      },
      severidade: "info",
    });

    // Ordenação inicial padrão: mais recentes primeiro
    itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    const resumo: ResumoHistoricoCliente = {
      totalPagamentosRealizados,
      totalValorPago,
      totalMensalidadesAtrasadas,
      totalValorEmAtraso,
      maiorAtrasoDias,
      totalChamadosAtendimento: atendimentos.length,
      chamadosAbertos,
      totalInstalacoes: instalacoes.length,
      instalacoesConcluidas,
      totalAgendamentos,
      totalSolicitacoesEndereco,
      bloqueiosAtivos,
      statusAcessoCliente: cliente.status,
    };

    return {
      cliente,
      itens,
      resumo,
    };
  } catch (err) {
    console.error("Excecao ao carregar historico do cliente:", err);
    return null;
  }
}
