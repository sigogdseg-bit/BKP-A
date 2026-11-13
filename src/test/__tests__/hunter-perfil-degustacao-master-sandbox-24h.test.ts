// Hunter — Suíte Canônica de Testes: Perfil Degustação Master, Sandbox e Laudo com Selo SGD
// Validação de 24h de expiração, isolamento do banco de produção, zero vazamento do AXH0E44 e chancela
// Proibição Absoluta do caractere comercial proibido em todo o arquivo

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isModoDegustacao,
  obterVeiculosDegustacaoMaster,
  obterViagensDegustacaoMaster,
  obterPontosViagemDegustacaoMaster,
  obterClientesDegustacaoMaster,
  obterFinanceiroDegustacaoMaster,
  obterStatusSegurancaDegustacaoMaster,
  executarComandoBloqueioDegustacao,
  verificarExpiracaoDegustacao,
  sincronizarPrimeiroAcessoDegustacaoServidor,
  aplicarChancelaSimulacaoPdf,
  FROTA_DEGUSTACAO_MASTER_INICIAL,
} from "../../features/demonstracao/services/degustacaoMasterService";
import { gerarLaudoPericialForensePdf } from "../../features/seguranca/services/laudoPericialPdfService";
import { jsPDF } from "jspdf";
import type { UserSession } from "../../features/auth/types";
import { supabase } from "../../integrations/supabase/client";
import { podeAcessarModulo, podeAcessarRota } from "../../shared/lib/permissoesModulos";
import {
  obterModulosPadraoPorPerfil,
  MODULOS_CLIENTE_PLANO_MASTER,
} from "../../features/seguranca/services/usuarioService";
import {
  clientePossuiVeiculosAtivos,
  clientePossuiPendenciaInstalacaoOuAtivacao,
  carregarVeiculosDoCliente,
} from "../../features/clientes/services/clienteService";
import { listarAbastecimentosCliente } from "../../features/motoristas/services/motoristasService";
import {
  carregarItensManutencao,
  carregarAgendamentos,
  listarHistoricoDespesasVeiculo,
} from "../../features/manutencao/services/manutencaoService";

describe("Hunter — Perfil Degustação Master, Sandbox 24h e Laudo Pericial SGD", () => {
  const sessaoDegustacao: UserSession = {
    userId: "deg-user-uuid-001",
    email: "degustacao@adm.oficial.tec.br",
    nome: "Usuário Degustação Plano Master",
    role: "cliente",
    plano: "master",
    planoContratado: "master",
    isTrialMaster: true,
    isSuperAdmin: false,
    isSuperAdminAuditor: false,
    isAuditor: false,
    isReadOnly: false,
    isDegustacao: true,
    isAdmin: false,
    isOperador: false,
    isCliente: true,
    isInstalador: false,
    isMotorista: false,
    modulos: [
      "monitor-gps",
      "rotas",
      "frota",
      "abastecimento",
      "manutencao",
      "motoristas",
      "motorista",
      "funcionarios",
      "mensalidades",
      "atendimento",
      "chat",
      "configuracoes",
    ],
  };

  it("1. Identifica corretamente a sessão em Modo Degustação Master", () => {
    assert.equal(isModoDegustacao(sessaoDegustacao), true);

    const sessaoNormal: UserSession = {
      userId: "user-real-001",
      email: "cliente@empresa.com",
      nome: "Cliente Real",
      role: "cliente",
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
      modulos: ["monitor-gps"],
    };
    assert.equal(isModoDegustacao(sessaoNormal), false);
    assert.equal(isModoDegustacao(null), false);
  });

  it("2. Frota Fictícia Master não contém o veículo real do Novaes (AXH0E44)", () => {
    const veiculos = obterVeiculosDegustacaoMaster();
    assert.equal(veiculos.length, 3, "Deve conter exatamente 3 veículos na frota degustação");

    const placas = veiculos.map((v) => v.placa);
    assert.ok(placas.includes("DEG-2026"), "Deve conter veículo simulado DEG-2026");
    assert.ok(placas.includes("FLX-1010"), "Deve conter veículo simulado FLX-1010");
    assert.ok(placas.includes("COR-4040"), "Deve conter veículo simulado COR-4040");

    // Blindagem de privacidade absoluta: AXH0E44 jamais deve estar presente
    assert.equal(
      placas.includes("AXH0E44"),
      false,
      "AXH0E44 NUNCA deve constar na frota de degustação",
    );
    assert.equal(
      placas.includes("AXH-0E44"),
      false,
      "AXH-0E44 NUNCA deve constar na frota de degustação",
    );

    const ids = veiculos.map((v) => v.id);
    assert.equal(
      ids.includes("3f2e1d2b-ca96-420e-88a5-c33fd98b689d"),
      false,
      "O ID do veículo pessoal do Novaes jamais deve constar na frota de degustação",
    );
  });

  it("3. Controle de Expiração em 24 Horas após o 1º Acesso", () => {
    const agoraIso = new Date().toISOString();

    // Cenário 1: Primeiro acesso recente (1 hora atrás)
    const umaHoraAtrasIso = new Date(Date.now() - 3600 * 1000).toISOString();
    const statusAtivo = verificarExpiracaoDegustacao(
      "user-teste-1",
      "teste@deg.com",
      umaHoraAtrasIso,
    );
    assert.equal(statusAtivo.expirado, false, "Com 1 hora de uso, a degustação deve estar ativa");
    assert.ok(statusAtivo.horasRestantes >= 22, "Devem restar 22 ou 23 horas");
    assert.ok(statusAtivo.textoFormatado.includes("h"), "Deve formatar tempo restante em horas");

    // Cenário 2: Mais de 24 horas transcorridas (24 horas e 1 segundo atrás)
    const vinteQuatroHorasAtrasIso = new Date(Date.now() - 24 * 3600 * 1000 - 1000).toISOString();
    const statusExpirado = verificarExpiracaoDegustacao(
      "user-teste-2",
      "teste2@deg.com",
      vinteQuatroHorasAtrasIso,
    );
    assert.equal(
      statusExpirado.expirado,
      true,
      "Após 24h, a degustação deve ser marcada como expirada",
    );
    assert.equal(statusExpirado.textoFormatado, "Expirado");
    assert.equal(statusExpirado.horasRestantes, 0);
    assert.equal(statusExpirado.minutosRestantes, 0);
  });

  it("4. Execução de comando de bloqueio simulado atualiza o estado local sem persistência em banco", () => {
    const resBloqueio = executarComandoBloqueioDegustacao("deg-veic-001", true);
    assert.equal(resBloqueio.sucesso, true);
    assert.equal(resBloqueio.bloqueado, true);
    assert.match(resBloqueio.mensagem, /Degustacao|Simulacao/i);

    const veiculosAtualizados = obterVeiculosDegustacaoMaster();
    const v1 = veiculosAtualizados.find((v) => v.id === "deg-veic-001");
    assert.equal(v1?.bloqueado, true, "O veículo simulado deve refletir o bloqueio local");
    assert.equal(v1?.rele_status, true);

    const resDesbloqueio = executarComandoBloqueioDegustacao("deg-veic-001", false);
    assert.equal(resDesbloqueio.sucesso, true);
    assert.equal(resDesbloqueio.bloqueado, false);

    const v1Desbloqueado = obterVeiculosDegustacaoMaster().find((v) => v.id === "deg-veic-001");
    assert.equal(v1Desbloqueado?.bloqueado, false);
  });

  it("5. Disponibiliza histórico de viagens e pontos fictícios para Playback e Refazer Trajeto", () => {
    const viagens = obterViagensDegustacaoMaster("deg-veic-001");
    assert.ok(viagens.length >= 3, "Deve retornar viagens simuladas");
    assert.ok(viagens[0].km_percorrido > 0, "Quilometragem deve ser positiva");
    assert.ok(viagens[0].velocidade_media > 0, "Velocidade média deve ser positiva");

    const pontos = obterPontosViagemDegustacaoMaster("deg-veic-001");
    assert.ok(pontos.length >= 10, "Deve conter pelo menos 10 posições de telemetria");
    assert.ok(pontos[0].latitude !== 0, "Latitude deve ser coordenada válida");
    assert.ok(pontos[0].longitude !== 0, "Longitude deve ser coordenada válida");
  });

  it("6. Geração do Laudo Pericial Forense em PDF com Selo SGD e QR Code", async () => {
    const resultado = await gerarLaudoPericialForensePdf({
      emissor: "SuperADM (Governança e Perícia Digital)",
      perfilEmissor: "SuperAdmin Governança",
      isSimulacao: false,
      statusCibernetico: "verde",
      eficienciaGlobal: "4.35",
      matrizRiscoMedia: 4.35,
      totalModulosAtivos: 12,
      totalVetoresMitigados: 51,
    });

    assert.ok(
      Boolean(resultado.doc ? typeof (resultado.doc as any).save === "function" : false),
      "Deve retornar instância válida de PDF com método save",
    );
    assert.match(
      resultado.seloSgd,
      /^SGD-[A-F0-9]{8}$/,
      "Selo SGD oficial deve seguir formato canônico",
    );
    assert.match(
      resultado.codigoVerificacao,
      /^[A-F0-9]{6}$/,
      "Código curto deve conter 6 caracteres hex",
    );
    assert.equal(resultado.hashSha256.length, 64, "Hash SHA-256 deve ter 64 caracteres");
    assert.ok(resultado.linkVerificacao.includes("https://sigoguardiao.oficial.tec.br/verificar"));
  });

  it("7. Geração do Laudo Pericial no Modo Simulação incorpora Selo SGD-SIM e Chancela de Simulação", async () => {
    const resultadoSimulacao = await gerarLaudoPericialForensePdf({
      emissor: "Degustação Master (Avaliação Técnica)",
      perfilEmissor: "Degustação Master",
      isSimulacao: true,
      statusCibernetico: "verde",
      eficienciaGlobal: "4.35",
      matrizRiscoMedia: 4.35,
      totalModulosAtivos: 12,
      totalVetoresMitigados: 51,
    });

    assert.match(
      resultadoSimulacao.seloSgd,
      /^SGD-SIM-[A-F0-9]{8}$/,
      "Selo em simulação deve conter prefixo SGD-SIM-",
    );
    assert.ok(resultadoSimulacao.nomeArquivo.includes("SGD-SIM-"));
  });

  it("8. Aplicação da Chancela de Simulação em documento PDF", () => {
    const doc = new jsPDF();
    doc.text("Página de Teste", 10, 10);
    aplicarChancelaSimulacaoPdf(doc, "Teste de Laudo");

    const totalPaginas =
      typeof (doc.internal as any).getNumberOfPages === "function"
        ? (doc.internal as any).getNumberOfPages()
        : (doc as any).getNumberOfPages();
    assert.equal(totalPaginas, 1, "Documento deve possuir 1 página com a chancela aplicada");
  });

  it("9. Interceptador do Supabase Client: Modo Degustação Master simula sucesso em mutações e isola banco", async () => {
    // Configura sessão cacheada em localStorage como Degustação Master (não read-only)
    const mockStorage: Record<string, string> = {
      "hunter-cached-user-session-v1": JSON.stringify({
        role: "superadmin_auditor",
        isDegustacao: true,
        isReadOnly: false,
      }),
    };

    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    };
    (globalThis as any).window = globalThis;

    // Mutação simulada em tabela clientes: deve retornar sucesso sem tocar no banco
    const resInsert = await (supabase.from("clientes") as any).insert({
      nome_razao_social: "Cliente Teste Degustação",
    });
    assert.equal(resInsert.error, null, "Mutação em degustação deve simular sucesso sem erro");
    assert.ok(Array.isArray(resInsert.data), "Deve retornar array com registro simulado");

    // RPC simulada: deve retornar sucesso sem tocar no banco
    const resRpc = await (supabase.rpc as any)("bloquear_veiculo", {
      p_veiculo_id: "deg-veic-001",
    });
    assert.equal(resRpc.error, null);
    assert.equal(resRpc.data?.status, "sucesso");
  });

  it("10. Interceptador do Supabase Client: Mantém bloqueio 403_READ_ONLY_AUDITOR quando isReadOnly for true", async () => {
    const mockStorage: Record<string, string> = {
      "hunter-cached-user-session-v1": JSON.stringify({
        role: "superadmin_auditor",
        isReadOnly: true,
      }),
    };

    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    };
    (globalThis as any).window = globalThis;

    const resInsert = await (supabase.from("veiculos") as any).insert({ placa: "TEST-0000" });
    assert.equal(resInsert.data, null);
    assert.equal(resInsert.error?.code, "403_READ_ONLY_AUDITOR");
  });

  it("11. Degustador possui perfil estrito de Cliente no Plano Master sem acesso a módulos administrativos", () => {
    // Módulos do Cliente no Plano Master: PERMITIDOS
    assert.equal(podeAcessarModulo(sessaoDegustacao, "monitor-gps"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "rotas"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "frota"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "abastecimento"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "manutencao"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "motoristas"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "funcionarios"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "mensalidades"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "atendimento"), true);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "chat"), true);

    // Módulos Administrativos e de Governança Interna da Empresa: BLOQUEADOS
    assert.equal(podeAcessarModulo(sessaoDegustacao, "central-seguranca"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "rastreadores"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "usuarios"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "estoque"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "dispositivos"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "financeiro"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "clientes"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "revendedores"), false);
    assert.equal(podeAcessarModulo(sessaoDegustacao, "logs"), false);

    // Rotas do Cliente no Plano Master: PERMITIDAS
    assert.equal(podeAcessarRota(sessaoDegustacao, "/monitor-gps"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/rotas"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/frota"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/abastecimento"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/manutencao"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/motoristas"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/funcionarios"), true);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/mensalidades"), true);

    // Rotas Administrativas e de Governança Interna da Empresa: BLOQUEADAS
    assert.equal(podeAcessarRota(sessaoDegustacao, "/configuracao/central-seguranca"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/configuracao/rastreador-j16"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/usuarios"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/estoque"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/financeiro"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/clientes"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/revendedores"), false);
    assert.equal(podeAcessarRota(sessaoDegustacao, "/configuracao/logs"), false);
  });

  it("13. Modulos padrao para Degustacao Plano Master restringem-se estritamente aos 11 modulos de cliente", () => {
    const modulosPadrao = obterModulosPadraoPorPerfil("cliente_degustacao" as any);
    assert.deepEqual(
      modulosPadrao,
      MODULOS_CLIENTE_PLANO_MASTER,
      "Modulos padrao de cliente_degustacao devem ser identicos a MODULOS_CLIENTE_PLANO_MASTER",
    );
    assert.equal(modulosPadrao.length, 11, "Devem ser exatamente 11 modulos concedidos");

    // Zero modulos administrativos permitidos no perfil de degustacao
    assert.equal(modulosPadrao.includes("central-seguranca"), false);
    assert.equal(modulosPadrao.includes("logs"), false);
    assert.equal(modulosPadrao.includes("dispositivos"), false);
    assert.equal(modulosPadrao.includes("instalacao"), false);
    assert.equal(modulosPadrao.includes("estoque"), false);
    assert.equal(modulosPadrao.includes("usuarios"), false);
    assert.equal(modulosPadrao.includes("rastreadores"), false);
    assert.equal(modulosPadrao.includes("financeiro"), false);
    assert.equal(modulosPadrao.includes("clientes"), false);

    // Superadmin Auditor recebe todos os modulos do sistema
    const modulosAuditor = obterModulosPadraoPorPerfil("superadmin_auditor");
    assert.equal(modulosAuditor.length, 20);
  });

  it("14. Modo Degustacao ativa frota simulada sem espera de instalacao fisica e popula telemetria, manutencao e abastecimentos", async () => {
    // 1. Simula sessao ativa em localStorage para o modo degustacao
    const mockStorage: Record<string, string> = {
      "hunter-cached-user-session-v1": JSON.stringify(sessaoDegustacao),
    };
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    };
    (globalThis as any).window = globalThis;

    // 2. Verificacao de veiculos ativos e ausencia de pendencia de instalacao fisica
    const temVeiculos = await clientePossuiVeiculosAtivos("deg-cli-001");
    assert.equal(temVeiculos, true, "Degustador master deve possuir veiculos ativos de imediato");

    const temPendencia = await clientePossuiPendenciaInstalacaoOuAtivacao("deg-cli-001");
    assert.equal(
      temPendencia,
      false,
      "Degustador master nao deve possuir pendencia de instalacao fisica",
    );

    // 3. Carregamento de veiculos da frota simulada
    const veiculos = await carregarVeiculosDoCliente("deg-cli-001");
    assert.equal(veiculos.length, 3, "Frota degustacao deve retornar os 3 veiculos ativos");
    assert.equal(veiculos[0].placa, "DEG-2026");
    assert.equal(veiculos[1].placa, "FLX-1010");
    assert.equal(veiculos[2].placa, "COR-4040");

    // 4. Abastecimentos simulados com comprovantes de NF-e
    const abastecimentos = await listarAbastecimentosCliente("deg-cli-001");
    assert.ok(abastecimentos.length >= 3, "Deve retornar lista de abastecimentos simulados");
    assert.equal(abastecimentos[0].combustivel, "diesel_s10");

    // 5. Manutencao preventiva e revisoes programadas
    const itensManut = await carregarItensManutencao("deg-veic-001");
    assert.ok(itensManut.length >= 4, "Deve retornar os itens de manutencao preventiva");
    assert.ok(itensManut.some((item) => item.item_manutencao.includes("Oleo")));

    // 6. Agendamentos e despesas de oficina
    const agendamentos = await carregarAgendamentos("deg-veic-001");
    assert.ok(agendamentos.length >= 1, "Deve retornar agendamento de manutencao simulado");

    const despesas = await listarHistoricoDespesasVeiculo("deg-veic-001");
    assert.ok(despesas.length >= 1, "Deve retornar historico de despesas de manutencao");
  });

  it("15. Sincronizacao do 1o acesso no servidor e reinicio de 24h apos REVALIDA ignoram cache expirado", async () => {
    const userId = "deg-sync-server-001";
    const chaveStorage = `hunter_degustacao_primeiro_acesso_v1_${userId}`;
    const agoraMs = Date.now();
    const trintaHorasAtrasIso = new Date(agoraMs - 30 * 3600 * 1000).toISOString();
    const revalidadaAgoraIso = new Date(agoraMs - 10 * 1000).toISOString();
    const expira24hIso = new Date(agoraMs + 24 * 3600 * 1000).toISOString();

    const prevWindow = (globalThis as any).window;
    const prevLocalStorage = (globalThis as any).localStorage;
    const mockStorage: Record<string, string> = {
      [chaveStorage]: JSON.stringify({
        primeiroAcessoEm: trintaHorasAtrasIso,
        revalidadaEm: null,
      }),
    };

    try {
      (globalThis as any).localStorage = {
        getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
        setItem: (key: string, val: string) => {
          mockStorage[key] = val;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
      };
      (globalThis as any).window = globalThis;

      // Cenario A: Consulta direta com cache local expirado (30h atras), mas revalidadaEmIso mais recente no perfil
      const diretoPosRevalida = verificarExpiracaoDegustacao(userId, undefined, undefined, {
        revalidadaEmIso: revalidadaAgoraIso,
      });
      assert.equal(
        diretoPosRevalida.expirado,
        false,
        "Cache local antigo deve ser descartado quando revalidadaEmIso for mais recente",
      );
      assert.ok(
        new Date(diretoPosRevalida.primeiroAcessoEm).getTime() >= agoraMs - 5000,
        "Novo 1o acesso deve iniciar no momento da consulta apos revalidacao",
      );

      // Restaura cache antigo de 30h atras para testar fallback do servidor via sincronizarPrimeiroAcessoDegustacaoServidor
      mockStorage[chaveStorage] = JSON.stringify({
        primeiroAcessoEm: trintaHorasAtrasIso,
        revalidadaEm: null,
      });

      const updatesProfile: any[] = [];
      const updatesAuth: any[] = [];
      const mockSupabaseFallback: any = {
        rpc: async () => ({ data: null, error: { code: "PGRST202", message: "RPC ausente" } }),
        from: () => ({
          update: (payload: any) => {
            updatesProfile.push(payload);
            return { eq: async () => ({ data: null, error: null }) };
          },
        }),
        auth: {
          updateUser: async (payload: any) => {
            updatesAuth.push(payload);
            return { data: null, error: null };
          },
        },
      };

      const resFallback = await sincronizarPrimeiroAcessoDegustacaoServidor(
        mockSupabaseFallback,
        userId,
        {
          degustacao_primeiro_acesso_em: null,
          degustacao_expira_em: null,
          degustacao_revalidada_em: revalidadaAgoraIso,
        },
        null,
      );

      assert.equal(resFallback.expirado, false);
      assert.equal(resFallback.revalidadaEmIso, revalidadaAgoraIso);
      assert.ok(
        new Date(resFallback.primeiroAcessoEm).getTime() >= agoraMs - 5000,
        "Fallback deve iniciar nova janela de 24h a partir do 1o login apos REVALIDA",
      );
      assert.equal(updatesProfile.length, 1);
      assert.equal(updatesAuth.length, 1);

      const salvoLocal = JSON.parse(mockStorage[chaveStorage]);
      assert.equal(salvoLocal.primeiroAcessoEm, resFallback.primeiroAcessoEm);
      assert.equal(salvoLocal.revalidadaEm, revalidadaAgoraIso);

      // Cenario B: RPC oficial registrar_primeiro_acesso_degustacao retornando janela autoritativa do servidor
      const primeiroAcessoRpcIso = new Date(agoraMs - 2000).toISOString();
      const mockSupabaseRpc: any = {
        rpc: async (fnName: string, paramsRpc: any) => {
          assert.equal(fnName, "registrar_primeiro_acesso_degustacao");
          assert.equal(paramsRpc.p_user_id, userId);
          return {
            data: {
              sucesso: true,
              primeiro_acesso_em: primeiroAcessoRpcIso,
              expira_em: expira24hIso,
              revalidada_em: revalidadaAgoraIso,
              expirado: false,
            },
            error: null,
          };
        },
      };

      const resRpc = await sincronizarPrimeiroAcessoDegustacaoServidor(
        mockSupabaseRpc,
        userId,
        null,
        null,
      );
      assert.equal(resRpc.expirado, false);
      assert.equal(resRpc.primeiroAcessoEm, primeiroAcessoRpcIso);
      assert.equal(resRpc.expiraEmIso, expira24hIso);
      assert.equal(resRpc.revalidadaEmIso, revalidadaAgoraIso);
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).localStorage = prevLocalStorage;
    }
  });

  it("12. Verificação de Ausência Absoluta do Caractere Comercial Proibido nos Novos Arquivos", () => {
    const arquivosVerificar = [
      "src/features/demonstracao/services/degustacaoMasterService.ts",
      "src/features/seguranca/services/laudoPericialPdfService.ts",
      "src/test/__tests__/hunter-perfil-degustacao-master-sandbox-24h.test.ts",
    ];

    arquivosVerificar.forEach((relPath) => {
      const fullPath = path.join(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo ${relPath} deve existir`);
      const conteudo = fs.readFileSync(fullPath, "utf-8");
      const charProibido = String.fromCharCode(38);
      assert.equal(
        conteudo.includes(charProibido),
        false,
        `O arquivo ${relPath} jamais deve conter o caractere comercial proibido`,
      );
    });
  });
});
