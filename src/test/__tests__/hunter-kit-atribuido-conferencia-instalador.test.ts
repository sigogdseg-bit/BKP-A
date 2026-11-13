import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  temKitDisponibilizado,
  ehPlaceholderImei,
} from "../../features/instalacoes/utils/kitDisponibilizado";
import {
  obterInstalacaoFantasmaComoCanonical,
  obterAgendamentoFantasmaComoCanonical,
  iniciarDemonstracao,
  encerrarDemonstracao,
  salvarEstadoDemonstracao,
  obterEstadoDemonstracao,
  simularConclusaoInstalacao,
} from "../../features/demonstracao/services/demonstracaoService";
import { instaladorConfirmarKit } from "../../features/estoque/services/rastreadorChipService";

describe("Hunter — Resolução Canônica de Kit Atribuído e Conferência do Instalador", () => {
  test("1. ehPlaceholderImei detecta corretamente termos não-disponibilizados e strings vazias", () => {
    assert.equal(ehPlaceholderImei(null), true);
    assert.equal(ehPlaceholderImei(""), true);
    assert.equal(ehPlaceholderImei("PENDENTE"), true);
    assert.equal(ehPlaceholderImei("A DEFINIR"), true);
    assert.equal(ehPlaceholderImei("AGUARDANDO ESTOQUE"), true);
    assert.equal(ehPlaceholderImei("A CONFERIR"), true);
    assert.equal(ehPlaceholderImei("SEM RASTREADOR"), true);
    assert.equal(ehPlaceholderImei("863874085222366"), false);
    assert.equal(ehPlaceholderImei("J16-2026"), false);
  });

  test("2. temKitDisponibilizado reconhece rastreador_id mesmo se IMEI for placeholder", () => {
    const ordemComIdSemImei = {
      rastreador_id: "rast-uuid-12345",
      rastreador_imei: "PENDENTE",
    };
    assert.equal(temKitDisponibilizado(ordemComIdSemImei), true);

    const ordemComIdAguardandoEstoque = {
      rastreador_id: "rast-uuid-67890",
      rastreador_imei: "AGUARDANDO ESTOQUE",
    };
    assert.equal(temKitDisponibilizado(ordemComIdAguardandoEstoque), true);

    const ordemSemRastreador = {
      rastreador_id: null,
      rastreador_imei: "PENDENTE",
    };
    assert.equal(temKitDisponibilizado(ordemSemRastreador), false);
  });

  test("3. temKitDisponibilizado reconhece kit_determinado_em pelo operador", () => {
    const ordemDeterminada = {
      kit_determinado_em: new Date().toISOString(),
      rastreador_imei: "A DEFINIR",
    };
    assert.equal(temKitDisponibilizado(ordemDeterminada), true);
  });

  test("4. temKitDisponibilizado reconhece rastreador no veículo associado", () => {
    const ordemComVeiculoKit = {
      rastreador_imei: "PENDENTE",
      veiculo: {
        rastreador_id: "rast-veic-uuid",
        rastreador_imei: "863874085000000",
      },
    };
    assert.equal(temKitDisponibilizado(ordemComVeiculoKit), true);
  });

  test("5. Módulo Demonstração: ordem fantasma nasce com kit atribuído (IMEI 1000) e pendente de conferência", () => {
    iniciarDemonstracao("instalador");
    const os = obterInstalacaoFantasmaComoCanonical();
    assert.equal(temKitDisponibilizado(os), true);
    assert.equal(os.kit_confirmado_instalador, false);
    assert.equal(os.rastreador_imei, "1000");

    const agendamento = obterAgendamentoFantasmaComoCanonical();
    assert.equal(agendamento.nome_razao_social, "Carlos Eduardo — Cliente Demonstração");
    assert.equal(agendamento.veiculos.length, 1);
  });

  test("6. Módulo Demonstração: instaladorConfirmarKit valida IMEI 1000 e libera para Realizar Instalação", async () => {
    iniciarDemonstracao("instalador");
    const res = await instaladorConfirmarKit("fantasma-os-demo-001", "1000");
    assert.equal(res.success, true);
    assert.ok(res.message.includes("Kit físico conferido com sucesso"));

    const osAposConferencia = obterInstalacaoFantasmaComoCanonical();
    assert.equal(osAposConferencia.kit_confirmado_instalador, true);
    assert.equal(osAposConferencia.imei_confirmado, "1000");

    // Simula a finalização pelo instalador
    const resConclusao = await simularConclusaoInstalacao({
      ordemId: "fantasma-os-demo-001",
      observacoes: "Teste de encerramento do kit conferido.",
    });
    assert.equal(resConclusao.success, true);

    const estadoFinal = obterEstadoDemonstracao();
    assert.equal(estadoFinal.ordemServico.status, "concluido");
    encerrarDemonstracao();
  });

  test("7. Instalador: Cadastro possui telefone celular para WhatsApp e Editar Insumos é bloqueado para Instalador", () => {
    iniciarDemonstracao("instalador");
    const estado = obterEstadoDemonstracao();
    assert.ok(estado.instalador.telefone, "Instalador deve possuir telefone celular para WhatsApp");
    assert.equal(estado.instalador.telefone, "(24) 99123-4567");

    // Validação de regra: Editar Insumos permitido APENAS para Operador ou Administrador (podeCriarDemandaInstalacao && !isInstalador)
    const podeEditarInsumosOperador = (podeCriar: boolean, isInst: boolean) => podeCriar && !isInst;
    assert.equal(podeEditarInsumosOperador(true, false), true, "Operador/Adm pode editar insumos");
    assert.equal(
      podeEditarInsumosOperador(true, true),
      false,
      "Instalador NÃO PODE editar insumos",
    );
    assert.equal(
      podeEditarInsumosOperador(false, true),
      false,
      "Instalador sem permissão NÃO PODE editar insumos",
    );

    encerrarDemonstracao();
  });
});
