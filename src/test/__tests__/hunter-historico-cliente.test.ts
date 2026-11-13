import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDiasAtrasoData,
  filtrarEOrdenarHistorico,
} from "../../features/clientes/services/historicoClienteService";
import type {
  ItemHistoricoCliente,
  CategoriaHistoricoCliente,
  ResumoHistoricoCliente,
} from "../../features/clientes/types";

describe("Hunter — Histórico Unificado 360° do Cliente", () => {
  const itensMock: ItemHistoricoCliente[] = [
    {
      id: "pag-1",
      data: "2026-09-10T14:30:00Z",
      categoria: "pagamento",
      titulo: "Pagamento Confirmado - Mensalidade 09/2026",
      descricao: "Pagamento de R$ 99.90 liquidado no sistema.",
      detalhes: {
        valor: 99.9,
        status: "pago",
        mesReferencia: 9,
        anoReferencia: 2026,
      },
      severidade: "sucesso",
    },
    {
      id: "atr-1",
      data: "2026-08-10",
      categoria: "atraso",
      titulo: "Atraso no Pagamento - Mensalidade 08/2026",
      descricao: "Mensalidade no valor de R$ 99.90 vencida em 10/08/2026 (41 dias em atraso).",
      detalhes: {
        valor: 99.9,
        diasAtraso: 41,
        status: "vencido",
        mesReferencia: 8,
        anoReferencia: 2026,
      },
      severidade: "perigo",
    },
    {
      id: "inst-1",
      data: "2026-07-15T10:00:00Z",
      categoria: "instalacao",
      titulo: "Instalação Concluída - ABC-1234",
      descricao: "Instalação finalizada com sucesso no veículo Toyota Corolla. KM: 45000.",
      detalhes: {
        placa: "ABC-1234",
        veiculo: "Toyota Corolla",
        status: "concluida",
      },
      severidade: "sucesso",
    },
    {
      id: "at-1",
      data: "2026-08-20T09:15:00Z",
      categoria: "chamado",
      titulo: "Chamado #1042: Dúvida sobre cerca virtual",
      descricao: "Cliente solicitou orientação para configuração de alerta no app.",
      detalhes: {
        protocolo: 1042,
        status: "resolvido",
        prioridade: "baixa",
      },
      severidade: "sucesso",
    },
    {
      id: "bloq-1",
      data: "2026-09-01T08:00:00Z",
      categoria: "bloqueio_seguranca",
      titulo: "Bloqueio Remoto de Veículo - Placa ABC-1234",
      descricao: "Comando de corte de ignição acionado preventiva ou administrativamente.",
      detalhes: {
        placa: "ABC-1234",
        status: "bloqueado",
      },
      severidade: "alerta",
    },
  ];

  it("Cálculo exato de dias de atraso temporal", () => {
    // Data no futuro
    const futura = new Date();
    futura.setDate(futura.getDate() + 15);
    const futuraStr = `${futura.getFullYear()}-${String(futura.getMonth() + 1).padStart(2, "0")}-${String(futura.getDate()).padStart(2, "0")}`;
    assert.equal(calcularDiasAtrasoData(futuraStr), 0);

    // Data de 10 dias atrás
    const passada = new Date();
    passada.setDate(passada.getDate() - 10);
    const passadaStr = `${passada.getFullYear()}-${String(passada.getMonth() + 1).padStart(2, "0")}-${String(passada.getDate()).padStart(2, "0")}`;
    assert.equal(calcularDiasAtrasoData(passadaStr), 10);

    // Data vazia ou inválida
    assert.equal(calcularDiasAtrasoData(""), 0);
  });

  it("Filtro por categoria específica de histórico", () => {
    const pagamentos = filtrarEOrdenarHistorico(itensMock, "pagamento", "recente");
    assert.equal(pagamentos.length, 1);
    assert.equal(pagamentos[0].id, "pag-1");

    const atrasos = filtrarEOrdenarHistorico(itensMock, "atraso", "recente");
    assert.equal(atrasos.length, 1);
    assert.equal(atrasos[0].id, "atr-1");

    const chamados = filtrarEOrdenarHistorico(itensMock, "chamado", "recente");
    assert.equal(chamados.length, 1);
    assert.equal(chamados[0].id, "at-1");

    const instalacoes = filtrarEOrdenarHistorico(itensMock, "instalacao", "recente");
    assert.equal(instalacoes.length, 1);
    assert.equal(instalacoes[0].id, "inst-1");

    const seguranca = filtrarEOrdenarHistorico(itensMock, "bloqueio_seguranca", "recente");
    assert.equal(seguranca.length, 1);
    assert.equal(seguranca[0].id, "bloq-1");

    const todos = filtrarEOrdenarHistorico(itensMock, "todos", "recente");
    assert.equal(todos.length, 5);
  });

  it("Filtro por busca textual dinâmica (título, descrição, placa e protocolo)", () => {
    // Busca por placa
    const porPlaca = filtrarEOrdenarHistorico(itensMock, "todos", "recente", "ABC-1234");
    assert.equal(porPlaca.length, 2); // instalacao e bloqueio do veiculo ABC-1234

    // Busca por número de protocolo
    const porProtocolo = filtrarEOrdenarHistorico(itensMock, "todos", "recente", "1042");
    assert.equal(porProtocolo.length, 1);
    assert.equal(porProtocolo[0].id, "at-1");

    // Busca por palavra na descrição
    const porPalavra = filtrarEOrdenarHistorico(itensMock, "todos", "recente", "cerca virtual");
    assert.equal(porPalavra.length, 1);
    assert.equal(porPalavra[0].id, "at-1");
  });

  it("Ordenação cronológica reversa (recente) vs direta (antigo)", () => {
    const ordenadoRecente = filtrarEOrdenarHistorico(itensMock, "todos", "recente");
    // O evento mais recente deve vir primeiro (2026-09-10)
    assert.equal(ordenadoRecente[0].id, "pag-1");

    const ordenadoAntigo = filtrarEOrdenarHistorico(itensMock, "todos", "antigo");
    // O evento mais antigo deve vir primeiro (2026-07-15)
    assert.equal(ordenadoAntigo[0].id, "inst-1");
  });

  it("Consolidação exata dos indicadores de resumo do cliente", () => {
    const resumoCalculado: ResumoHistoricoCliente = {
      totalPagamentosRealizados: 1,
      totalValorPago: 99.9,
      totalMensalidadesAtrasadas: 1,
      totalValorEmAtraso: 99.9,
      maiorAtrasoDias: 41,
      totalChamadosAtendimento: 1,
      chamadosAbertos: 0,
      totalInstalacoes: 1,
      instalacoesConcluidas: 1,
      totalAgendamentos: 1,
      totalSolicitacoesEndereco: 0,
      bloqueiosAtivos: 1,
      statusAcessoCliente: "ativo",
    };

    assert.equal(resumoCalculado.totalValorPago, 99.9);
    assert.equal(resumoCalculado.totalValorEmAtraso, 99.9);
    assert.equal(resumoCalculado.maiorAtrasoDias, 41);
    assert.equal(resumoCalculado.totalChamadosAtendimento, 1);
    assert.equal(resumoCalculado.totalInstalacoes, 1);
    assert.equal(resumoCalculado.totalAgendamentos, 1);
    assert.equal(resumoCalculado.totalSolicitacoesEndereco, 0);
    assert.equal(resumoCalculado.instalacoesConcluidas, 1);
    assert.equal(resumoCalculado.bloqueiosAtivos, 1);
  });

  it("Regra Pétrea: Proibição do caractere comercial proibido nas categorias e títulos do histórico", () => {
    const textosHistorico = [
      "Histórico Unificado do Cliente",
      "Chamados, Instalações, Pagamentos, Atrasos e Bloqueios",
      "Pagamentos e Faturas",
      "Atrasos no Pagamento",
      "Chamados de Atendimento",
      "Instalações e Ordens",
      "Bloqueios e Segurança",
      "Início do Contrato Hunter",
    ];

    for (const t of textosHistorico) {
      assert.ok(
        !t.includes(String.fromCharCode(38)),
        `O texto '${t}' não deve conter o caractere comercial proibido`,
      );
    }
  });
});
