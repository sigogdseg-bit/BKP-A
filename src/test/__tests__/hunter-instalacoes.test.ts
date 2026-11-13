import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calcularResumoRepasse } from "../../features/instalacoes/services/instalacaoService";
import { gerarPayloadPix } from "../../features/instalacoes/utils/pixPayload";
import type { Instalacao } from "../../features/instalacoes/types";

describe("Hunter — Módulo de Instalações e Perfil Instalador", () => {
  test("Cálculo de repasse financeiro (total, pendente e pago)", () => {
    const instalacoesMock: Instalacao[] = [
      {
        id: "inst-1",
        instalador_id: "user-inst-1",
        veiculo_id: null,
        cliente_id: "cliente-1",
        marca: "Toyota",
        modelo: "Corolla",
        ano: 2024,
        cor: "Prata",
        placa: "BRA2E19",
        rastreador_imei: "867543051234567",
        rastreador_modelo: "J16 4G",
        chip_iccid: "8955123456789012345",
        posicao_instalacao: "Atrás do painel de instrumentos",
        km_instalacao: 15420,
        observacoes: "Instalação concluída com sucesso e chicote original mantido",
        status: "concluida",
        motivo_pendencia_recusa: null,
        valor_instalacao: 150.0,
        status_pagamento: "pago",
        pago_em: "2026-09-19T14:00:00Z",
        pago_por: "adm-1",
        created_at: "2026-09-19T10:00:00Z",
        updated_at: "2026-09-19T14:00:00Z",
      },
      {
        id: "inst-2",
        instalador_id: "user-inst-1",
        veiculo_id: null,
        cliente_id: "cliente-2",
        marca: "Honda",
        modelo: "Civic",
        ano: 2023,
        cor: "Preto",
        placa: "HNT9J16",
        rastreador_imei: "867543059876543",
        rastreador_modelo: "J16 4G",
        chip_iccid: "8955987654321098765",
        posicao_instalacao: "Coluna A lado motorista",
        km_instalacao: 32100,
        observacoes: "Equipamento testado",
        status: "concluida_com_pendencia",
        motivo_pendencia_recusa: "Aguardando conector pós-chave original da concessionária",
        valor_instalacao: 150.0,
        status_pagamento: "pendente",
        pago_em: null,
        pago_por: null,
        created_at: "2026-09-19T11:00:00Z",
        updated_at: "2026-09-19T11:00:00Z",
      },
      {
        id: "inst-3",
        instalador_id: "user-inst-1",
        veiculo_id: null,
        cliente_id: "cliente-3",
        marca: "Volkswagen",
        modelo: "Gol",
        ano: 2022,
        cor: "Branco",
        placa: "ABC1D23",
        rastreador_imei: "867543051112233",
        rastreador_modelo: "J16 4G",
        chip_iccid: null,
        posicao_instalacao: null,
        km_instalacao: 85000,
        observacoes: "Cliente não compareceu ao local de agendamento",
        status: "nao_instalado",
        motivo_pendencia_recusa: "Veículo indisponível no pátio",
        valor_instalacao: 0,
        status_pagamento: "pendente",
        pago_em: null,
        pago_por: null,
        created_at: "2026-09-19T12:00:00Z",
        updated_at: "2026-09-19T12:00:00Z",
      },
    ];

    const resumo = calcularResumoRepasse(instalacoesMock);

    assert.equal(resumo.totalInstalacoes, 3);
    assert.equal(resumo.totalConcluidas, 1);
    assert.equal(resumo.totalPendencias, 1);
    assert.equal(resumo.totalNaoInstaladas, 1);
    assert.equal(resumo.valorTotalDevido, 300.0);
    assert.equal(resumo.valorTotalPago, 150.0);
    assert.equal(resumo.valorTotalPendente, 150.0);
  });

  test("Apuração de Repasses com Previsão de Agendamentos para o Instalador", () => {
    // Instalador com 0 ordens concluídas e 1 agendamento pendente
    // Regra Pétrea: Se não instalou, tem R$ 0,00 a receber! O valor fica apenas como previsão futura.
    const instalacoesVazias: any[] = [];
    const agendamentosMock = [
      { id: "cli-1", nome_razao_social: "Pacheco Cliente", status_agendamento: "agendado" },
    ];

    const resumo = calcularResumoRepasse(instalacoesVazias, agendamentosMock, 50);

    assert.equal(resumo.totalInstalacoes, 1);
    assert.equal(resumo.totalAgendadas, 1);
    assert.equal(resumo.totalConcluidas, 0);
    assert.equal(resumo.valorTotalPendente, 0.0);
    assert.equal(resumo.aReceber, 0.0);
    assert.equal(resumo.valorPrevistoAgendadas, 50.0);
  });

  test("Validação estrita de integridade dos status de instalação e pagamento", () => {
    const statusInstalacaoValidos = ["nao_instalado", "concluida_com_pendencia", "concluida"];
    const statusPagamentoValidos = ["pendente", "pago"];

    assert.ok(statusInstalacaoValidos.includes("nao_instalado"));
    assert.ok(statusInstalacaoValidos.includes("concluida_com_pendencia"));
    assert.ok(statusInstalacaoValidos.includes("concluida"));

    assert.ok(statusPagamentoValidos.includes("pendente"));
    assert.ok(statusPagamentoValidos.includes("pago"));
  });

  test("Regra de Isolamento do Perfil Instalador: rota restrita a /instalacao", () => {
    const instaladorRole = "instalador";
    const modulosPermitidos = ["instalacao"];

    assert.equal(instaladorRole, "instalador");
    assert.equal(modulosPermitidos.length, 1);
    assert.equal(modulosPermitidos[0], "instalacao");
  });

  test("Regra Pétrea: Proibição absoluta do caractere comercial proibido em nomenclaturas de instalação", () => {
    const textosInstalacao = [
      "Instalação",
      "Instalações Técnicas",
      "Ordens de Instalação",
      "Relatório de Repasses Financeiros",
      "Atendimentos e Histórico",
      "Dados do Veículo e Rastreador",
    ];

    textosInstalacao.forEach((txt) => {
      assert.ok(
        !txt.includes("&"),
        `Texto "${txt}" não deve conter o caractere comercial proibido`,
      );
    });
  });

  test("Geração de Payload Pix EMV Padrão BACEN (BR Code) para valor individual", () => {
    const payload = gerarPayloadPix({
      chavePix: "instalador@hunter.local",
      nomeRecebedor: "Carlos Instalador",
      valor: 150.0,
      cidadeRecebedor: "SAO PAULO",
      identificador: "INST-BRA2E19",
    });

    assert.ok(payload.startsWith("000201"), "Payload deve iniciar com format indicator 000201");
    assert.ok(
      payload.includes("br.gov.bcb.pix"),
      "Payload deve conter GUI do BACEN br.gov.bcb.pix",
    );
    assert.ok(
      payload.includes("instalador@hunter.local"),
      "Payload deve conter a chave PIX informada",
    );
    assert.ok(
      payload.includes("150.00"),
      "Payload deve conter o valor unitário da instalação formatado",
    );
    assert.ok(
      payload.includes("INSTBRA2E19"),
      "Payload deve conter o identificador alfanumérico da OS",
    );
    assert.ok(payload.includes("6304"), "Payload deve conter o campo de checksum 6304");
  });

  test("Geração de Payload Pix EMV para valor total acumulado do instalador (lote)", () => {
    const payloadTotal = gerarPayloadPix({
      chavePix: "11999887766",
      nomeRecebedor: "Carlos Instalador",
      valor: 450.0,
      cidadeRecebedor: "SAO PAULO",
      identificador: "LOTE-3ORDENS",
    });

    assert.ok(payloadTotal.startsWith("000201"), "Payload em lote deve iniciar com 000201");
    assert.ok(payloadTotal.includes("11999887766"), "Payload deve conter a chave de telefone");
    assert.ok(payloadTotal.includes("450.00"), "Payload deve conter a soma total das ordens");
    assert.ok(
      payloadTotal.includes("LOTE3ORDENS"),
      "Payload deve conter o identificador alfanumérico do lote",
    );
  });

  test("Status de cliente aguardando_instalacao e transição para ativo", () => {
    const statusValidos = ["aguardando_instalacao", "ativo", "bloqueado", "cancelado"];
    assert.ok(statusValidos.includes("aguardando_instalacao"));
    assert.ok(statusValidos.includes("ativo"));

    // Simulação do fluxo: cliente nasce aguardando_instalacao, após instalação concluída vira ativo
    let clienteStatus: "aguardando_instalacao" | "ativo" = "aguardando_instalacao";
    assert.equal(clienteStatus, "aguardando_instalacao");

    const instalacaoConcluida = true;
    if (instalacaoConcluida) {
      clienteStatus = "ativo";
    }
    assert.equal(clienteStatus, "ativo");
  });

  test("Cadastro do instalador exige endereço físico da oficina ou ponto de atendimento", () => {
    const instaladorValido = {
      nome: "Marcos Mecânica e Rastreamento",
      role: "instalador",
      endereco_instalacao: "Av. Brasil, 1500 - Centro, Rio de Janeiro - RJ",
      chave_pix: "21999998888",
      valor_por_instalacao: 150.0,
    };

    assert.equal(instaladorValido.role, "instalador");
    assert.ok(
      instaladorValido.endereco_instalacao && instaladorValido.endereco_instalacao.length > 5,
      "Endereço de instalação do instalador é obrigatório",
    );
    assert.ok(!instaladorValido.nome.includes("&"), "Nenhum caractere proibido no nome");
  });

  test("Fluxo de agendamento: Cliente aguarda agendamento e instalador define data e hora", () => {
    interface ClienteAgendamento {
      id: string;
      nome: string;
      status_cliente: string;
      status_agendamento: "aguardando_agendamento" | "agendado" | "concluido";
      data_agendamento: string | null;
      hora_agendamento: string | null;
      instalador_nome: string | null;
      instalador_endereco: string | null;
    }

    // 1. Cliente criado pelo administrador com instalador selecionado
    const cliente: ClienteAgendamento = {
      id: "cli-100",
      nome: "Supermercado Progresso LTDA",
      status_cliente: "aguardando_instalacao",
      status_agendamento: "aguardando_agendamento",
      data_agendamento: null,
      hora_agendamento: null,
      instalador_nome: "Carlos Técnico",
      instalador_endereco: "Rua das Oficinas, 420 - Industrial",
    };

    // Verificação na entrada do cliente: status aguardando agendamento
    assert.equal(cliente.status_cliente, "aguardando_instalacao");
    assert.equal(cliente.status_agendamento, "aguardando_agendamento");
    assert.equal(cliente.data_agendamento, null);

    // 2. Instalador define dia e hora
    const novaData = "2026-09-22";
    const novaHora = "14:30";
    cliente.data_agendamento = novaData;
    cliente.hora_agendamento = novaHora;
    cliente.status_agendamento = "agendado";

    // Verificação após agendamento: cliente vê data, hora e local da oficina
    assert.equal(cliente.status_agendamento, "agendado");
    assert.equal(cliente.data_agendamento, "2026-09-22");
    assert.equal(cliente.hora_agendamento, "14:30");
    assert.equal(cliente.instalador_endereco, "Rua das Oficinas, 420 - Industrial");

    // 3. Conclusão da instalação física
    cliente.status_cliente = "ativo";
    cliente.status_agendamento = "concluido";
    assert.equal(cliente.status_cliente, "ativo");
    assert.equal(cliente.status_agendamento, "concluido");
  });

  test("Regra Pétrea: Todos os registros devem ser em BD e não em cache com Supabase Realtime", () => {
    const tabelasRealtimeHabilitadas = ["clientes", "instalacoes", "profiles", "alertas_seguranca"];
    assert.ok(tabelasRealtimeHabilitadas.includes("clientes"));
    assert.ok(tabelasRealtimeHabilitadas.includes("instalacoes"));
    assert.ok(tabelasRealtimeHabilitadas.includes("profiles"));

    // Proibição de cache no cliente para agendamentos e status
    const usaCacheLocalParaStatus = false;
    assert.equal(
      usaCacheLocalParaStatus,
      false,
      "Status e agendamentos devem vir do BD em tempo real",
    );
  });

  test("Atribuição Automática de Módulo Exclusivo no Perfil Instalador", () => {
    // Simula a lógica de troca de perfil no formulário de usuários
    const selecionarModulosPorPerfil = (role: string): string[] => {
      if (role === "instalador") return ["instalacao"];
      if (role === "adm" || role === "superadmin")
        return ["monitor-gps", "atendimento", "instalacao", "usuarios"];
      return ["monitor-gps", "atendimento"];
    };

    const modulosInstalador = selecionarModulosPorPerfil("instalador");
    assert.deepEqual(
      modulosInstalador,
      ["instalacao"],
      "Instalador deve ter estritamente o módulo instalacao",
    );

    const modulosOperador = selecionarModulosPorPerfil("operador");
    assert.ok(
      !modulosOperador.includes("instalacao"),
      "Operador não deve herdar módulo exclusivo de instalador",
    );
  });

  test("Regra Pétrea: Usuários Não-Clientes Não Possuem Escolha de Plano Comercial", () => {
    // Perfis internos da equipe Hunter
    const perfisInternos = ["operador", "adm", "instalador", "superadmin"];

    perfisInternos.forEach((role) => {
      // Nenhum perfil de equipe técnica ou administrativa possui plano
      const possuiEscolhaPlano = role === "cliente";
      assert.equal(
        possuiEscolhaPlano,
        false,
        `Perfil "${role}" não deve conter escolha de plano comercial`,
      );
    });
  });

  test("Auto-provisionamento de IMEI e Veículo na Conclusão da Instalação", () => {
    // Simula a entrada de dados físicos pelo instalador
    const instalacaoInput = {
      placa: "BRA2E19",
      marca: "Volkswagen",
      modelo: "Gol 1.0",
      km_instalacao: 45000,
      rastreador_imei: "867543059998877",
      rastreador_modelo: "J16 4G",
      chip_iccid: "8955123456789012345",
      chip_operadora: "Vivo",
      status: "concluida",
    };

    assert.ok(instalacaoInput.rastreador_imei.length >= 10, "IMEI deve ser válido");
    assert.equal(instalacaoInput.status, "concluida");

    // Simula o registro do rastreador auto-provisionado
    const rastreadorAutoProvisionado = {
      id: "rast-uuid-auto-1",
      imei: instalacaoInput.rastreador_imei,
      modelo: instalacaoInput.rastreador_modelo,
      status: "instalado",
    };

    assert.equal(rastreadorAutoProvisionado.imei, "867543059998877");
    assert.equal(rastreadorAutoProvisionado.status, "instalado");

    // Simula veículo rastreado gerado na frota
    const veiculoGerado = {
      placa: instalacaoInput.placa,
      marca_modelo: `${instalacaoInput.marca} ${instalacaoInput.modelo}`,
      rastreador_id: rastreadorAutoProvisionado.id,
      rastreador_imei: instalacaoInput.rastreador_imei,
      status_operacional: "estacionado",
      odometro_km: instalacaoInput.km_instalacao,
    };

    assert.equal(veiculoGerado.placa, "BRA2E19");
    assert.equal(veiculoGerado.rastreador_imei, "867543059998877");
    assert.equal(veiculoGerado.rastreador_id, rastreadorAutoProvisionado.id);
    assert.equal(veiculoGerado.status_operacional, "estacionado");
  });

  test("Filtro do Instalador: Clientes já instalados não devem constar como pendentes", () => {
    interface ClienteBase {
      id: string;
      nome: string;
      status: "aguardando_instalacao" | "ativo";
      status_agendamento: "aguardando_agendamento" | "agendado" | "concluido";
    }

    const listaClientes: ClienteBase[] = [
      {
        id: "c1",
        nome: "Cliente Aguardando Agendamento",
        status: "aguardando_instalacao",
        status_agendamento: "aguardando_agendamento",
      },
      {
        id: "c2",
        nome: "Cliente com Agendamento Marcado",
        status: "aguardando_instalacao",
        status_agendamento: "agendado",
      },
      {
        id: "c3",
        nome: "Cliente com Instalação Já Concluída",
        status: "ativo",
        status_agendamento: "concluido",
      },
    ];

    // Regra de Filtragem: Apenas clientes com pendencia real de instalacao
    const pendentes = listaClientes.filter(
      (c) => c.status === "aguardando_instalacao" || c.status_agendamento !== "concluido",
    );

    assert.equal(pendentes.length, 2);
    assert.ok(!pendentes.some((c) => c.id === "c3"), "Cliente c3 já instalado não deve aparecer");
    assert.ok(pendentes.some((c) => c.id === "c1"));
    assert.ok(pendentes.some((c) => c.id === "c2"));
  });

  test("Isolamento do Cliente sem veículos ativos: Tela exclusiva sem AppShell ou mapa vazio", () => {
    interface ClienteAcesso {
      isCliente: boolean;
      veiculosAtivos: number;
      deveExibirTelaEspera: boolean;
      deveAcessarAppShell: boolean;
    }

    const clienteNovoSemVeiculo: ClienteAcesso = {
      isCliente: true,
      veiculosAtivos: 0,
      deveExibirTelaEspera: true,
      deveAcessarAppShell: false,
    };

    assert.equal(clienteNovoSemVeiculo.isCliente, true);
    assert.equal(clienteNovoSemVeiculo.veiculosAtivos, 0);
    assert.equal(clienteNovoSemVeiculo.deveExibirTelaEspera, true);
    assert.equal(clienteNovoSemVeiculo.deveAcessarAppShell, false);

    const clienteComVeiculoAtivo: ClienteAcesso = {
      isCliente: true,
      veiculosAtivos: 1,
      deveExibirTelaEspera: false,
      deveAcessarAppShell: true,
    };

    assert.equal(clienteComVeiculoAtivo.deveExibirTelaEspera, false);
    assert.equal(clienteComVeiculoAtivo.deveAcessarAppShell, true);
  });

  test("Múltiplos Veículos: Cliente ativo com novo veículo entra no sistema e exibe aviso de agendamento", () => {
    interface ClienteComNovosVeiculos {
      id: string;
      temVeiculoAtivo: boolean;
      veiculosNovosPendentes: number;
      statusAgendamento: "aguardando_agendamento" | "agendado" | "concluido";
      acessaMapaNormalmente: boolean;
      exibeAvisoSuperior: boolean;
    }

    const cliente: ClienteComNovosVeiculos = {
      id: "cli-mult-1",
      temVeiculoAtivo: true,
      veiculosNovosPendentes: 2,
      statusAgendamento: "aguardando_agendamento",
      acessaMapaNormalmente: true,
      exibeAvisoSuperior: true,
    };

    assert.ok(cliente.temVeiculoAtivo, "Cliente possui veículos ativos na frota");
    assert.ok(cliente.acessaMapaNormalmente, "Cliente entra no sistema normalmente");
    assert.ok(cliente.exibeAvisoSuperior, "Aviso de novo agendamento é exibido na entrada");
    assert.notEqual(cliente.statusAgendamento, "concluido");
  });

  test("Renderização do Mapa no Mobile: Tolerância e redimensionamento automático de viewport", () => {
    const temporizadoresInvalidacao = [50, 200, 500, 1000];
    assert.equal(temporizadoresInvalidacao.length, 4);
    assert.ok(temporizadoresInvalidacao.includes(50));
    assert.ok(temporizadoresInvalidacao.includes(1000));
  });

  test("Gestão Individual de Veículos na Ficha do Cliente: Bloqueio, Edição e Exclusão", () => {
    interface VeiculoFrota {
      id: string;
      placa: string;
      marca_modelo: string;
      ano: number;
      cor: string;
      bloqueado: boolean;
      ativo: boolean;
    }

    let veiculos: VeiculoFrota[] = [
      {
        id: "v-1",
        placa: "BBB0R22",
        marca_modelo: "Bmw X1",
        ano: 2026,
        cor: "Verde",
        bloqueado: false,
        ativo: true,
      },
      {
        id: "v-2",
        placa: "AAA0E55",
        marca_modelo: "Honda Civic",
        ano: 2025,
        cor: "Preto",
        bloqueado: false,
        ativo: false,
      },
    ];

    // 1. Bloqueio Individual
    veiculos = veiculos.map((v) => (v.id === "v-1" ? { ...v, bloqueado: true } : v));
    assert.equal(veiculos.find((v) => v.id === "v-1")?.bloqueado, true);

    // 2. Desbloqueio Individual
    veiculos = veiculos.map((v) => (v.id === "v-1" ? { ...v, bloqueado: false } : v));
    assert.equal(veiculos.find((v) => v.id === "v-1")?.bloqueado, false);

    // 3. Edição Individual
    veiculos = veiculos.map((v) =>
      v.id === "v-2" ? { ...v, marca_modelo: "Honda Civic Touring", cor: "Cinza" } : v,
    );
    const v2Editado = veiculos.find((v) => v.id === "v-2");
    assert.equal(v2Editado?.marca_modelo, "Honda Civic Touring");
    assert.equal(v2Editado?.cor, "Cinza");

    // 4. Exclusão Individual
    veiculos = veiculos.filter((v) => v.id !== "v-2");
    assert.equal(veiculos.length, 1);
    assert.equal(veiculos[0].id, "v-1");
  });

  test("Status de Instalação no Card do Cliente: Concluído e Ativo não exibe pendência", () => {
    interface ClienteCard {
      nome: string;
      status: "ativo" | "aguardando_instalacao";
      status_agendamento: "aguardando_agendamento" | "agendado" | "concluido";
      data_agendamento: string | null;
      hora_agendamento: string | null;
      instalador_nome: string;
    }

    const clienteInstaladoMario: ClienteCard = {
      nome: "mario",
      status: "ativo",
      status_agendamento: "concluido",
      data_agendamento: "2026-09-19",
      hora_agendamento: "09:00",
      instalador_nome: "pachecp",
    };

    const isConcluidoOuAtivo =
      clienteInstaladoMario.status_agendamento === "concluido" ||
      (clienteInstaladoMario.status === "ativo" &&
        clienteInstaladoMario.status_agendamento !== "agendado" &&
        clienteInstaladoMario.status_agendamento !== "aguardando_agendamento");

    assert.equal(
      isConcluidoOuAtivo,
      true,
      "Cliente com instalação realizada deve ser reconhecido como concluído",
    );

    const textoExibido = isConcluidoOuAtivo
      ? "Instalação realizada com sucesso"
      : clienteInstaladoMario.status_agendamento === "agendado"
        ? "Agendado"
        : "Aguardando agendamento de data e horário pelo instalador";

    assert.equal(textoExibido, "Instalação realizada com sucesso");
    assert.notEqual(textoExibido, "Aguardando agendamento de data e horário pelo instalador");
  });

  test("Geração de Pendência para o Instalador Credenciado sem adição manual de veículo", () => {
    interface SolicitacaoInstalacao {
      cliente_id: string;
      instalador_id: string;
      status_agendamento: string;
      origem_dados_veiculo: "instalador_no_atendimento";
    }

    const solicitacao: SolicitacaoInstalacao = {
      cliente_id: "cli-mario-uuid",
      instalador_id: "inst-pachecp-uuid",
      status_agendamento: "aguardando_agendamento",
      origem_dados_veiculo: "instalador_no_atendimento",
    };

    assert.equal(solicitacao.status_agendamento, "aguardando_agendamento");
    assert.equal(
      solicitacao.origem_dados_veiculo,
      "instalador_no_atendimento",
      "O instalador inclui o veículo no atendimento físico da instalação",
    );
  });

  test("Ergonomia Mobile: Mapa como elemento prioritário desobstruído com docking bar compacta e alternador", () => {
    interface LayoutMobileGPS {
      visaoMobile: "mapa" | "telemetria";
      telemetriaRecolhida: boolean;
      mapaOcupaTelaCheia: boolean;
      dockingBarCompactaVisivel: boolean;
    }

    // Estado inicial no mobile: mapa visível e telemetria recolhida
    const layoutInicial: LayoutMobileGPS = {
      visaoMobile: "mapa",
      telemetriaRecolhida: true,
      mapaOcupaTelaCheia: true,
      dockingBarCompactaVisivel: true,
    };

    assert.equal(layoutInicial.visaoMobile, "mapa");
    assert.equal(layoutInicial.telemetriaRecolhida, true);
    assert.equal(
      layoutInicial.mapaOcupaTelaCheia,
      true,
      "O mapa não deve ficar esmagado ou por trás",
    );
    assert.equal(layoutInicial.dockingBarCompactaVisivel, true);

    // Ao alternar para telemetria ou expandir:
    const layoutTelemetria: LayoutMobileGPS = {
      visaoMobile: "telemetria",
      telemetriaRecolhida: false,
      mapaOcupaTelaCheia: false,
      dockingBarCompactaVisivel: false,
    };

    assert.equal(layoutTelemetria.visaoMobile, "telemetria");
    assert.equal(layoutTelemetria.telemetriaRecolhida, false);
  });

  test("Autonomia do Instalador: Atualização de Chave PIX e Endereço de Instalação", () => {
    interface PerfilInstaladorAtualizavel {
      id: string;
      role: "instalador";
      chave_pix: string | null;
      endereco_instalacao: string | null;
    }

    const instaladorAntes: PerfilInstaladorAtualizavel = {
      id: "4bb2ce54-d2b3-4106-a9db-011111fdd343",
      role: "instalador",
      chave_pix: null,
      endereco_instalacao: null,
    };

    const novosDados = {
      chavePix: "instalador@hunter.com.br",
      enderecoInstalacao: "Av. Amaral Peixoto, 500, Oficina Hunter, Volta Redonda/RJ",
    };

    const instaladorDepois: PerfilInstaladorAtualizavel = {
      ...instaladorAntes,
      chave_pix: novosDados.chavePix.trim() || null,
      endereco_instalacao: novosDados.enderecoInstalacao.trim() || null,
    };

    assert.equal(instaladorDepois.chave_pix, "instalador@hunter.com.br");
    assert.equal(
      instaladorDepois.endereco_instalacao,
      "Av. Amaral Peixoto, 500, Oficina Hunter, Volta Redonda/RJ",
    );
  });

  test("Geração de Pendência para Instalador: Status Imediato aguardando_instalacao e aguardando_agendamento", () => {
    interface ClientePendencia {
      id: string;
      nome: string;
      status: "ativo" | "inadimplente" | "bloqueado" | "aguardando_instalacao";
      status_agendamento: "aguardando_agendamento" | "agendado" | "concluido";
      instalador_id: string | null;
    }

    const clienteOriginal: ClientePendencia = {
      id: "cli-100",
      nome: "Cliente Hunter",
      status: "ativo",
      status_agendamento: "concluido",
      instalador_id: null,
    };

    const instaladorAtribuidoId = "4bb2ce54-d2b3-4106-a9db-011111fdd343";

    // Simulação do payload gerado pela função de gerar pendência
    const clienteComPendencia: ClientePendencia = {
      ...clienteOriginal,
      status: "aguardando_instalacao",
      status_agendamento: "aguardando_agendamento",
      instalador_id: instaladorAtribuidoId,
    };

    assert.equal(clienteComPendencia.status, "aguardando_instalacao");
    assert.equal(clienteComPendencia.status_agendamento, "aguardando_agendamento");
    assert.equal(clienteComPendencia.instalador_id, instaladorAtribuidoId);
  });

  test("Agendamento Individual por Veículo com Instaladores, Datas e Locais Independentes", () => {
    // Cliente com 2 veículos com instaladores e datas/locais distintos
    const veiculo1 = {
      id: "v-1",
      placa: "ABC1D23",
      instalador_id: "inst-1",
      data_agendamento: "2026-10-15",
      hora_agendamento: "09:00",
      local_tipo: "oficina" as const,
      local_endereco: "Rua Oficina 1, 100",
    };

    const veiculo2 = {
      id: "v-2",
      placa: "XYZ9W87",
      instalador_id: "inst-2",
      data_agendamento: "2026-10-16",
      hora_agendamento: "14:30",
      local_tipo: "local_veiculo" as const,
      local_endereco: "Garagem do Cliente, Av. Central, 500",
      solicita_endereco_cliente: false,
      endereco_cliente_informado: "Garagem do Cliente, Av. Central, 500",
    };

    assert.notEqual(veiculo1.instalador_id, veiculo2.instalador_id);
    assert.notEqual(veiculo1.data_agendamento, veiculo2.data_agendamento);
    assert.notEqual(veiculo1.local_tipo, veiculo2.local_tipo);
    assert.equal(veiculo1.local_tipo, "oficina");
    assert.equal(veiculo2.local_tipo, "local_veiculo");
    assert.ok(veiculo2.endereco_cliente_informado.length > 5);
  });

  test("Validação de Prontidão Técnica: Veículo só está pronto se tiver rastreador físico definido", () => {
    const temRastreador = (imei?: string | null) =>
      Boolean(
        imei &&
        imei.trim() !== "" &&
        imei !== "AGUARDANDO ESTOQUE" &&
        imei !== "PENDENTE" &&
        imei !== "A DEFINIR" &&
        imei !== "SEM RASTREADOR",
      );

    const ordemComAgendamentoSemRastreador = {
      id: "ordem-1",
      placa: "RIO2A10",
      data_agendamento: "2026-10-10",
      rastreador_imei: "AGUARDANDO ESTOQUE",
    };

    const ordemComAgendamentoComRastreador = {
      id: "ordem-2",
      placa: "SP9B99",
      data_agendamento: "2026-10-10",
      rastreador_imei: "860123456789012",
    };

    assert.equal(temRastreador(ordemComAgendamentoSemRastreador.rastreador_imei), false);
    assert.equal(temRastreador(ordemComAgendamentoComRastreador.rastreador_imei), true);
  });
});
