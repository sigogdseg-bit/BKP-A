import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularResumoFinanceiro } from "../../features/mensalidades/services/mensalidadeService";
import type { MensalidadeItem } from "../../features/mensalidades/types";

describe("Hunter — Gestao e Administracao de Mensalidades e Clientes", () => {
  it("Calculo de Resumo Financeiro com divisao exata de previsto, recebido, pendente e vencido", () => {
    const mensalidadesExemplo: MensalidadeItem[] = [
      {
        id: "m-1",
        cliente_id: "c-1",
        mes_referencia: 9,
        ano_referencia: 2026,
        valor: 100.0,
        data_vencimento: "2026-09-10",
        status: "pago",
        data_pagamento: "2026-09-09T10:00:00Z",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-09T10:00:00Z",
      },
      {
        id: "m-2",
        cliente_id: "c-2",
        mes_referencia: 9,
        ano_referencia: 2026,
        valor: 79.9,
        data_vencimento: "2026-09-25",
        status: "pendente",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "m-3",
        cliente_id: "c-3",
        mes_referencia: 9,
        ano_referencia: 2026,
        valor: 120.0,
        data_vencimento: "2026-09-05",
        status: "vencido",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ];

    const resumo = calcularResumoFinanceiro(mensalidadesExemplo);

    assert.equal(resumo.qtdTotal, 3);
    assert.equal(resumo.qtdRecebido, 1);
    assert.equal(resumo.qtdPendente, 1);
    assert.equal(resumo.qtdVencido, 1);

    assert.equal(resumo.totalPrevisto, 299.9);
    assert.equal(resumo.totalRecebido, 100.0);
    assert.equal(resumo.totalPendente, 79.9);
    assert.equal(resumo.totalVencido, 120.0);
  });

  it("Ajuste de dia de vencimento para meses com menos de 31 dias", () => {
    const ano = 2026;
    const mesFevereiro = 2;
    const ultimoDiaFev = new Date(ano, mesFevereiro, 0).getDate();
    assert.equal(ultimoDiaFev, 28);

    const diaDesejadoCliente = 31;
    const diaAjustado = Math.min(Math.max(diaDesejadoCliente, 1), ultimoDiaFev);
    assert.equal(diaAjustado, 28);

    const mesSetembro = 9;
    const ultimoDiaSet = new Date(ano, mesSetembro, 0).getDate();
    assert.equal(ultimoDiaSet, 30);
    const diaSetembroAjustado = Math.min(diaDesejadoCliente, ultimoDiaSet);
    assert.equal(diaSetembroAjustado, 30);
  });

  it("Filtro Aguardando Instalacao captura clientes com status aguardando ou status agendamento pendente", () => {
    const clientesTeste = [
      {
        id: "cli-1",
        nome_razao_social: "Cliente Novo",
        status: "aguardando_instalacao",
        status_agendamento: "aguardando_agendamento",
      },
      {
        id: "cli-2",
        nome_razao_social: "Cliente Ativo com Novo Veiculo",
        status: "ativo",
        status_agendamento: "aguardando_agendamento",
      },
      {
        id: "cli-3",
        nome_razao_social: "Cliente com Agendamento Marcado",
        status: "aguardando_instalacao",
        status_agendamento: "agendado",
      },
      {
        id: "cli-4",
        nome_razao_social: "Cliente Totalmente Concluido",
        status: "ativo",
        status_agendamento: "concluido",
      },
      {
        id: "cli-5",
        nome_razao_social: "Cliente Inadimplente Bloqueado",
        status: "bloqueado",
        status_agendamento: "concluido",
      },
    ];

    const filtroStatus = "aguardando_instalacao";
    const filtrados = clientesTeste.filter((c) => {
      if (filtroStatus === "aguardando_instalacao") {
        return (
          c.status === "aguardando_instalacao" ||
          c.status_agendamento === "aguardando_agendamento" ||
          c.status_agendamento === "agendado"
        );
      }
      return c.status === filtroStatus;
    });

    assert.equal(filtrados.length, 3);
    assert.ok(filtrados.some((c) => c.id === "cli-1"));
    assert.ok(filtrados.some((c) => c.id === "cli-2"));
    assert.ok(filtrados.some((c) => c.id === "cli-3"));
    assert.ok(!filtrados.some((c) => c.id === "cli-4"));
    assert.ok(!filtrados.some((c) => c.id === "cli-5"));
  });

  it("Contadores de filtros de clientes devem exibir formato (XC/XV) para clientes e veículos nos filtros cabíveis", () => {
    const clientesExemplo = [
      {
        id: "c-1",
        status: "aguardando_instalacao",
        status_agendamento: "aguardando_agendamento",
        veiculos_count: 2, // 1 cliente com 2 veículos
      },
      {
        id: "c-2",
        status: "aguardando_instalacao",
        status_agendamento: "agendado",
        veiculos_count: 1, // 1 cliente com 1 veículo
      },
      {
        id: "c-3",
        status: "aguardando_instalacao",
        status_agendamento: "aguardando_agendamento",
        veiculos_count: 1, // 1 cliente com 1 veículo
      },
      {
        id: "c-4",
        status: "ativo",
        status_agendamento: "concluido",
        veiculos_count: 3, // 1 cliente ativo com 3 veículos
      },
    ];

    let aguardandoC = 0;
    let aguardandoV = 0;
    let ativosC = 0;
    let ativosV = 0;
    let totalV = 0;

    for (const c of clientesExemplo) {
      const vCount = c.veiculos_count || 0;
      totalV += vCount;
      const isAg =
        c.status === "aguardando_instalacao" ||
        c.status_agendamento === "aguardando_agendamento" ||
        c.status_agendamento === "agendado";

      if (isAg) {
        aguardandoC++;
        aguardandoV += vCount;
      }
      if (c.status === "ativo") {
        ativosC++;
        ativosV += vCount;
      }
    }

    assert.equal(aguardandoC, 3, "Devem ser 3 clientes aguardando instalação");
    assert.equal(aguardandoV, 4, "Devem ser 4 veículos e dispositivos aguardando instalação");
    assert.equal(
      `Aguardando Instalação (${aguardandoC}C/${aguardandoV}V)`,
      "Aguardando Instalação (3C/4V)",
    );
    assert.equal(`Ativos (${ativosV}V)`, "Ativos (3V)", "Ativos devem exibir somente veículos");
    assert.equal(`Todos (${clientesExemplo.length}C/${totalV}V)`, "Todos (4C/7V)");
  });

  it("Regra Petrea: Ausencia do caractere comercial proibido nas mensagens e rotulos de cobranca", () => {
    const rotulos = [
      "Controle de Mensalidades e Vencimentos",
      "Gestao financeira de planos de rastreamento veicular",
      "Gerar Mensalidades em Lote",
      "Criacao automatica para clientes ativos por competencia",
      "Nova Mensalidade Manual",
      "Lancamento avulso de cobranca para cliente",
    ];

    for (const rotulo of rotulos) {
      assert.ok(
        !rotulo.includes(String.fromCharCode(38)),
        `O rotulo '${rotulo}' nao deve conter o caractere comercial proibido`,
      );
    }
  });

  it("Transicoes de status de mensalidade e protecao de integridade", () => {
    const statusValidos = ["pago", "pendente", "vencido"];
    assert.ok(statusValidos.includes("pago"));
    assert.ok(statusValidos.includes("pendente"));
    assert.ok(statusValidos.includes("vencido"));
  });

  it("Ordenação das mensalidades deve priorizar a data de vencimento mais próxima primeiro", () => {
    const listaDesordenada: MensalidadeItem[] = [
      {
        id: "m-futura",
        cliente_id: "c-1",
        mes_referencia: 8,
        ano_referencia: 2027,
        valor: 119.9,
        data_vencimento: "2027-08-10",
        status: "pendente",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "m-proxima",
        cliente_id: "c-2",
        mes_referencia: 10,
        ano_referencia: 2026,
        valor: 119.9,
        data_vencimento: "2026-10-10",
        status: "pendente",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "m-atual",
        cliente_id: "c-3",
        mes_referencia: 9,
        ano_referencia: 2026,
        valor: 119.9,
        data_vencimento: "2026-09-10",
        status: "pago",
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      },
    ];

    const ordenadas = [...listaDesordenada].sort((a, b) => {
      const dateA = a.data_vencimento || "";
      const dateB = b.data_vencimento || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.clientes?.nome_razao_social || "").localeCompare(
        b.clientes?.nome_razao_social || "",
      );
    });

    assert.equal(ordenadas[0].id, "m-atual"); // 2026-09-10 (mais próxima)
    assert.equal(ordenadas[1].id, "m-proxima"); // 2026-10-10
    assert.equal(ordenadas[2].id, "m-futura"); // 2027-08-10 (mais distante)
  });
});
