import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  MODULOS_SISTEMA_REGRAS,
  podeAcessarRota,
  podeAcessarModulo,
} from "../../shared/lib/permissoesModulos.ts";
import type { UserSession } from "../../features/auth/services/authService.ts";

describe("Hunter — Arquitetura Modular Unificada, Perfis e Menu Hambúrguer (DJR-NEW)", () => {
  // Motorista NÃO autorizado no cadastro (acesso_mapa === false, como Dario)
  const sessaoMotoristaSemMapa: UserSession = {
    userId: "user-mot-dario",
    email: "dario@oficial.tec.br",
    nome: "Dario Motorista",
    role: "motorista",
    plano: "master",
    planoContratado: "master",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    clienteId: "cli-123",
    modulos: [],
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: true,
    acessoMapaMotorista: false,
    primeiroAcesso: false,
    visivelNoChat: true,
  };

  // Motorista expressamente autorizado no cadastro (acesso_mapa === true)
  const sessaoMotoristaComMapa: UserSession = {
    userId: "user-mot-autorizado",
    email: "motorista.autorizado@empresa.com",
    nome: "Motorista Autorizado",
    role: "motorista",
    plano: "master",
    planoContratado: "master",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    clienteId: "cli-123",
    modulos: [],
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: true,
    acessoMapaMotorista: true,
    primeiroAcesso: false,
    visivelNoChat: true,
  };

  const sessaoCliente: UserSession = {
    userId: "user-cli-1",
    email: "cliente@frota.com",
    nome: "Empresa Transportes",
    role: "cliente",
    plano: "master",
    planoContratado: "master",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    clienteId: "cli-123",
    modulos: [],
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: true,
    isInstalador: false,
    isMotorista: false,
    primeiroAcesso: false,
    visivelNoChat: true,
  };

  test("1. Módulo Canônico de Abastecimento: Rota /abastecimento cadastrada nas regras do sistema", () => {
    const modAbast = MODULOS_SISTEMA_REGRAS.find((m) => m.id === "abastecimento");
    assert.ok(modAbast, "O módulo 'abastecimento' deve existir em MODULOS_SISTEMA_REGRAS");
    assert.equal(modAbast.rota, "/abastecimento");
  });

  test("2. Acesso ao Módulo de Abastecimento: Permitido para Motorista e Cliente", () => {
    assert.ok(
      podeAcessarModulo(sessaoMotoristaSemMapa, "abastecimento"),
      "Motorista deve poder acessar o módulo de abastecimento",
    );
    assert.ok(
      podeAcessarRota(sessaoMotoristaSemMapa, "/abastecimento"),
      "Motorista deve poder acessar a rota /abastecimento",
    );
    assert.ok(
      podeAcessarModulo(sessaoCliente, "abastecimento"),
      "Cliente deve poder acessar o módulo de abastecimento",
    );
    assert.ok(
      podeAcessarRota(sessaoCliente, "/abastecimento"),
      "Cliente deve poder acessar a rota /abastecimento",
    );
  });

  test("3. Isolamento Estrito: Motorista NÃO autorizado no cadastro NÃO acessa Mapa Operacional ao Vivo", async () => {
    // Motorista sem autorização (como Dario)
    assert.equal(
      podeAcessarModulo(sessaoMotoristaSemMapa, "monitor-gps"),
      false,
      "Motorista sem autorização no cadastro NÃO pode acessar o módulo monitor-gps",
    );
    assert.equal(
      podeAcessarRota(sessaoMotoristaSemMapa, "/monitor-gps"),
      false,
      "Motorista sem autorização no cadastro NÃO pode acessar a rota /monitor-gps",
    );

    const { obterRecursosPorPlano } =
      await import("../../features/monitor-gps/utils/planPermissions.ts");
    const recursosSemMapa = obterRecursosPorPlano(sessaoMotoristaSemMapa);
    assert.equal(
      recursosSemMapa.modo3D,
      false,
      "Motorista sem autorização de mapa deve ter modo3D = false",
    );
    assert.equal(
      recursosSemMapa.diasHistorico,
      0,
      "Motorista sem autorização de mapa deve ter diasHistorico = 0",
    );
  });

  test("4. Montar Rota Inteligente: SEMPRE permitido ao Motorista (não precisa autorização do cliente)", async () => {
    // Motorista (com ou sem autorização de mapa) pode montar rotas inteligentes
    assert.equal(
      podeAcessarModulo(sessaoMotoristaSemMapa, "rotas"),
      true,
      "Motorista sem autorização de mapa PODE acessar o módulo de rotas",
    );
    assert.equal(
      podeAcessarRota(sessaoMotoristaSemMapa, "/rotas"),
      true,
      "Motorista deve poder acessar a rota /rotas a qualquer momento",
    );

    const { obterRecursosPorPlano } =
      await import("../../features/monitor-gps/utils/planPermissions.ts");
    const recursosMotorista = obterRecursosPorPlano(sessaoMotoristaSemMapa);
    assert.equal(
      recursosMotorista.montarRota,
      true,
      "Motorista SEMPRE possui montarRota = true liberado para planejamento diário",
    );
  });

  test("4.1 Rota Monitorada com Cerca Viva: Cliente pode monitorar rota e receber alerta de desvio", async () => {
    const conteudoModal = await fs.readFile(
      new URL("../../features/monitor-gps/components/TrajetoInteligenteModal.tsx", import.meta.url),
      "utf-8",
    );

    assert.ok(
      conteudoModal.includes("handleAtivarRotaMonitorada"),
      "TrajetoInteligenteModal deve permitir ao cliente ativar rota monitorada",
    );
    assert.ok(
      conteudoModal.includes("toleranciaCorredorMetros") ||
        conteudoModal.includes("Tolerância do Corredor"),
      "TrajetoInteligenteModal deve permitir configurar tolerância do corredor viário",
    );
    assert.ok(
      conteudoModal.includes("iniciarRotaMonitorada"),
      "TrajetoInteligenteModal deve persistir rota monitorada no banco",
    );
  });

  test("5. Motorista NÃO tem acesso ao Histórico de NFs de Abastecimento (exclusivo para gestão e clientes)", async () => {
    const conteudoAbast = await fs.readFile(
      new URL("../../features/abastecimento/components/AbastecimentoView.tsx", import.meta.url),
      "utf-8",
    );

    // O código deve conter a validação podeVerHistorico que restringe abas e botões
    assert.ok(
      conteudoAbast.includes("podeVerHistorico"),
      "AbastecimentoView deve validar podeVerHistorico para controle estrito",
    );
    assert.ok(
      conteudoAbast.includes("{podeVerHistorico && ("),
      "Alternador de abas e histórico devem ser condicionados a podeVerHistorico",
    );
  });

  test("6. Deduplicação e Anti-Duplicidade de NFs em motoristasService", async () => {
    const conteudoService = await fs.readFile(
      new URL("../../features/motoristas/services/motoristasService.ts", import.meta.url),
      "utf-8",
    );

    // Anti-duplicidade na gravação
    assert.ok(
      conteudoService.includes("form.nf_numero") &&
        conteudoService.includes("já foi registrada anteriormente"),
      "motoristasService deve validar se a NF já foi cadastrada antes de inserir",
    );

    // Deduplicação na listagem
    assert.ok(
      conteudoService.includes("listaDeduplicada"),
      "motoristasService deve deduplicar registros repetidos ao listar para o cliente",
    );
  });

  test("7. Logotipo na Tela de Login preenche todo o espaço destinado", async () => {
    const conteudoLogin = await fs.readFile(
      new URL("../../features/auth/components/LoginView.tsx", import.meta.url),
      "utf-8",
    );

    assert.ok(
      conteudoLogin.includes("w-full h-full object-contain") ||
        conteudoLogin.includes("h-28 w-28") ||
        conteudoLogin.includes("h-32 w-32"),
      "LoginView deve exibir o logotipo preenchendo o espaço destinado",
    );
    assert.ok(
      !conteudoLogin.includes("p-3.5 rounded-2xl bg-white/90"),
      "LoginView não deve conter caixinha branca com padding excessivo que encolhe o logotipo",
    );
  });

  test("8. Centralização: Atendimento, Chat e Configurações exclusivamente no Menu Hambúrguer", async () => {
    const conteudoHub = await fs.readFile(
      new URL("../../features/inicio/components/InicioHubView.tsx", import.meta.url),
      "utf-8",
    );
    assert.ok(
      !conteudoHub.includes('rota: "/chat"'),
      "InicioHubView NÃO deve conter card de Chat no grid inicial",
    );
    assert.ok(
      !conteudoHub.includes('rota: "/configuracoes"'),
      "InicioHubView NÃO deve conter card de Configurações no grid inicial",
    );
    assert.ok(
      !conteudoHub.includes('rota: "/atendimento"'),
      "InicioHubView NÃO deve conter card de Atendimento no grid inicial",
    );

    const conteudoDrawer = await fs.readFile(
      new URL("../../features/layout/components/MobileDrawer.tsx", import.meta.url),
      "utf-8",
    );
    assert.ok(
      conteudoDrawer.includes('titulo: "Atendimento e Suporte"') &&
        conteudoDrawer.includes('rota: "/atendimento"'),
      "MobileDrawer deve conter Atendimento e Suporte na seção final",
    );
    assert.ok(
      conteudoDrawer.includes('titulo: "Chat em Tempo Real"') &&
        conteudoDrawer.includes('rota: "/chat"'),
      "MobileDrawer deve conter o item Chat em Tempo Real",
    );
    assert.ok(
      conteudoDrawer.includes('titulo: "Configurações do Sistema"') &&
        conteudoDrawer.includes('rota: "/configuracoes"'),
      "MobileDrawer deve conter o item Configurações do Sistema",
    );

    // Permissões universais para todos os perfis
    assert.ok(
      podeAcessarRota(sessaoMotoristaSemMapa, "/atendimento"),
      "Motorista deve acessar atendimento",
    );
    assert.ok(podeAcessarRota(sessaoMotoristaSemMapa, "/chat"), "Motorista deve acessar chat");
    assert.ok(
      podeAcessarRota(sessaoMotoristaSemMapa, "/configuracoes"),
      "Motorista deve acessar configurações",
    );
    assert.ok(podeAcessarRota(sessaoCliente, "/atendimento"), "Cliente deve acessar atendimento");
  });

  test("8.1 Paridade Rigorosa de Nomenclatura entre Menu Hambúrguer e Painel Geral", async () => {
    const conteudoHub = await fs.readFile(
      new URL("../../features/inicio/components/InicioHubView.tsx", import.meta.url),
      "utf-8",
    );
    const conteudoDrawer = await fs.readFile(
      new URL("../../features/layout/components/MobileDrawer.tsx", import.meta.url),
      "utf-8",
    );

    const nomesCanonicos = [
      "Abastecimento de Veículos",
      "Central de Segurança",
      "Clientes e Planos",
      "Desempenho da Frota",
      "Dispositivos Autorizados",
      "Estoque e Suprimentos",
      "Financeiro e Fluxo de Caixa",
      "Gestão de Funcionários",
      "Gestão de Motoristas",
      "Instalações Técnicas",
      "Logs do Sistema",
      "Manutenção Preventiva",
      "Mapa Operacional",
      "Mensalidades e Cobrança",
      "Módulo Demonstração",
      "Rastreadores J16 4G",
      "Rotas e Trajetos Inteligentes",
      "Temas dos Cards e Módulos",
      "Usuários e Acessos",
    ];

    for (const nome of nomesCanonicos) {
      assert.ok(
        conteudoHub.includes(`titulo: "${nome}"`) ||
          (nome === "Mensalidades e Cobrança" && conteudoHub.includes('"Mensalidades e Cobrança"')),
        `InicioHubView deve conter exatamente o módulo com título "${nome}"`,
      );
      assert.ok(
        conteudoDrawer.includes(`titulo: "${nome}"`),
        `MobileDrawer deve conter exatamente o item de menu com título "${nome}"`,
      );
    }

    // Regra Hunter-Guardian: O cliente vê estritamente "Mensalidade" (sem o termo agressivo "Cobrança")
    assert.ok(
      conteudoHub.includes('session?.isCliente ? "Mensalidade" : "Mensalidades e Cobrança"'),
      "InicioHubView deve exibir 'Mensalidade' para o cliente",
    );
    assert.ok(
      conteudoDrawer.includes('titulo: "Mensalidade"'),
      "MobileDrawer deve exibir 'Mensalidade' no menu do cliente",
    );

    // Nomes antigos divergentes NÃO devem mais constar
    assert.ok(
      !conteudoDrawer.includes('titulo: "Motoristas"'),
      "MobileDrawer não deve conter título 'Motoristas' (deve ser 'Gestão de Motoristas')",
    );
    assert.ok(
      !conteudoDrawer.includes('titulo: "Meus Motoristas"'),
      "MobileDrawer não deve conter título 'Meus Motoristas' (deve ser 'Gestão de Motoristas')",
    );
    assert.ok(
      !conteudoHub.includes('titulo: "Motoristas e Condutores"'),
      "InicioHubView não deve conter 'Motoristas e Condutores' (deve ser 'Gestão de Motoristas')",
    );
    assert.ok(
      !conteudoDrawer.includes('titulo: "Financeiro e Propostas"'),
      "MobileDrawer não deve conter 'Financeiro e Propostas' (deve ser 'Financeiro e Fluxo de Caixa')",
    );
    assert.ok(
      !conteudoDrawer.includes('titulo: "Minhas Mensalidades"'),
      "MobileDrawer não deve conter 'Minhas Mensalidades' (deve ser 'Mensalidades e Cobrança')",
    );
    assert.ok(
      !conteudoDrawer.includes('titulo: "Instalações e Vistorias"'),
      "MobileDrawer não deve conter 'Instalações e Vistorias' (deve ser 'Instalações Técnicas')",
    );
    assert.ok(
      !conteudoDrawer.includes('titulo: "Auditoria e Logs"'),
      "MobileDrawer não deve conter 'Auditoria e Logs' (deve ser 'Logs do Sistema')",
    );
    assert.ok(
      !conteudoDrawer.includes('titulo: "Personalização de Temas"'),
      "MobileDrawer não deve conter 'Personalização de Temas' (deve ser 'Temas dos Cards e Módulos')",
    );
  });

  test("9. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido nos arquivos novos e editados", async () => {
    const arquivos = [
      "src/features/abastecimento/components/AbastecimentoView.tsx",
      "src/routes/_authenticated.abastecimento.tsx",
      "src/routes/motorista.tsx",
      "src/features/auth/components/LoginView.tsx",
      "src/shared/lib/permissoesModulos.ts",
      "src/features/inicio/components/InicioHubView.tsx",
      "src/features/layout/components/MobileDrawer.tsx",
    ];

    for (const arq of arquivos) {
      const conteudo = await fs.readFile(new URL(`../../../${arq}`, import.meta.url), "utf-8");
      const linhas = conteudo.split("\n");
      linhas.forEach((linha, idx) => {
        if (
          linha.includes("&") &&
          !linha.includes("&&") &&
          !linha.includes("&amp;") &&
          !linha.includes("&nbsp;") &&
          !linha.includes("import")
        ) {
          assert.fail(
            `Arquivo ${arq} linha ${idx + 1} contém caractere comercial proibido: ${linha}`,
          );
        }
      });
    }
  });
});
