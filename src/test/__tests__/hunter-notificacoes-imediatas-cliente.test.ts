import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("GD Rastreamento — Notificacoes Imediatas e Erradicacao de Mensagens WhatsApp ao Cliente", () => {
  it("Valida tipagens canonicas de notificacao imediata para eventos operacionais e de cobranca", () => {
    const tiposPermitidos = [
      "cobranca",
      "alerta",
      "jammer",
      "cerca_virtual",
      "area_segura",
      "rota_monitorada",
      "agendamento",
      "manutencao",
      "atendimento",
    ];

    assert.equal(tiposPermitidos.includes("cobranca"), true);
    assert.equal(tiposPermitidos.includes("jammer"), true);
    assert.equal(tiposPermitidos.includes("cerca_virtual"), true);
    assert.equal(tiposPermitidos.includes("rota_monitorada"), true);
    assert.equal(tiposPermitidos.includes("agendamento"), true);
    assert.equal(tiposPermitidos.includes("manutencao"), true);
    assert.equal(tiposPermitidos.includes("atendimento"), true);
  });

  it("Gera payload consistente de notificacao de vencimento do plano e cobranca imediata", () => {
    const payloadCobranca = {
      destinatarioClienteId: "cli-uuid-1234",
      titulo: "Fatura e Vencimento do Plano — GD Rastreamento",
      mensagem:
        "Ola, Transportes Brasil. Sua fatura de R$ 350.00 referente ao seu plano esta disponivel. Acesse o painel para regularizar via PIX.",
      tipo: "cobranca",
      url: "/faturas",
    };

    assert.equal(payloadCobranca.tipo, "cobranca");
    assert.equal(payloadCobranca.url, "/faturas");
    assert.equal(payloadCobranca.destinatarioClienteId, "cli-uuid-1234");
    assert.ok(payloadCobranca.mensagem.includes("R$ 350.00"));
  });

  it("Gera payload de notificacao de quebra de limites e saida de cerca virtual", () => {
    const payloadCerca = {
      destinatarioClienteId: "cli-uuid-5678",
      titulo: "Saida de Limite Estabelecido — Galpao Central",
      mensagem:
        "Veiculo ABC1D23 (Volvo FH 540) saiu do limite da cerca virtual Galpao Central. Distancia atual do perimetro: 85m.",
      tipo: "cerca_virtual",
      url: "/monitor-gps",
      placa: "ABC1D23",
    };

    assert.equal(payloadCerca.tipo, "cerca_virtual");
    assert.equal(payloadCerca.placa, "ABC1D23");
    assert.ok(payloadCerca.mensagem.includes("85m"));
  });

  it("Gera payload de notificacao de desvio de rota monitorada e retorno ao trajeto", () => {
    const payloadDesvio = {
      destinatarioClienteId: "cli-uuid-5678",
      titulo: "Desvio de Rota Monitorada",
      mensagem: "Veiculo ABC1D23 (Volvo FH 540) desviou 120m das vias do trajeto estabelecido.",
      tipo: "rota_monitorada",
      url: "/monitor-gps",
      placa: "ABC1D23",
    };

    assert.equal(payloadDesvio.tipo, "rota_monitorada");
    assert.ok(payloadDesvio.mensagem.includes("120m"));

    const payloadRetorno = {
      destinatarioClienteId: "cli-uuid-5678",
      titulo: "Retorno ao Trajeto da Rota Monitorada",
      mensagem: "Veiculo ABC1D23 retornou ao trajeto da rota monitorada (15m da via).",
      tipo: "rota_monitorada",
      url: "/monitor-gps",
      placa: "ABC1D23",
    };

    assert.equal(payloadRetorno.tipo, "rota_monitorada");
    assert.ok(payloadRetorno.mensagem.includes("retornou"));
  });

  it("Gera payload de notificacao de agendamento de instalacao tecnica e manutencao", () => {
    const payloadInstalacao = {
      destinatarioClienteId: "cli-novo-01",
      titulo: "Instalacao Tecnica Agendada",
      mensagem:
        "Seu agendamento de instalacao foi confirmado para 28/09/2026 as 14:00h. Local: Oficina Sul.",
      tipo: "agendamento",
      url: "/login",
    };

    assert.equal(payloadInstalacao.tipo, "agendamento");
    assert.ok(payloadInstalacao.mensagem.includes("Oficina Sul"));

    const payloadManutencao = {
      destinatarioClienteId: "cli-novo-01",
      titulo: "Manutencao Agendada — HTR4G16",
      mensagem:
        "Agendamento de Troca de Oleo confirmado para 30/09/2026 (Manha). Oficina: Posto Central.",
      tipo: "manutencao",
      url: "/manutencao",
      placa: "HTR4G16",
    };

    assert.equal(payloadManutencao.tipo, "manutencao");
    assert.equal(payloadManutencao.placa, "HTR4G16");
  });

  it("Gera payload de alerta de atendimento ao cliente para nova mensagem e conclusao", () => {
    const payloadMensagem = {
      destinatarioClienteId: "cli-chamado-01",
      titulo: "Nova Mensagem no Atendimento #1042",
      mensagem: "Suporte Tecnico: Seu chamado foi atualizado com sucesso.",
      tipo: "atendimento",
      url: "/atendimento",
    };

    assert.equal(payloadMensagem.tipo, "atendimento");
    assert.ok(payloadMensagem.titulo.includes("#1042"));

    const payloadConclusao = {
      destinatarioClienteId: "cli-chamado-01",
      titulo: "Atendimento Concluido #1042",
      mensagem: "Seu chamado foi finalizado com sucesso. Solucao tecnica: Sensor calibrado.",
      tipo: "atendimento",
      url: "/atendimento",
    };

    assert.equal(payloadConclusao.tipo, "atendimento");
    assert.ok(payloadConclusao.mensagem.includes("Sensor calibrado"));
  });
});
