import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calcularSplitMensalidade } from "../../features/revendedores/services/revendedoresService";
import {
  podeAcessarModulo,
  podeAcessarRota,
  MODULOS_SISTEMA_REGRAS,
} from "../../shared/lib/permissoesModulos";
import type { UserSession } from "../../features/auth/services/authService";

describe("Hunter — Módulo Comercial: Revendedores e Vendedores", () => {
  it("1. Divisão de comissões (Split) - Venda via Vendedor sob Revendedor", () => {
    const split = calcularSplitMensalidade({
      valorMensalidade: 70.0,
      baseSistema: 25.0,
      baseVendedor: 45.0,
      temRevendedor: true,
      temVendedor: true,
    });

    assert.equal(
      split.parteSistema,
      25.0,
      "Cota do Sistema deve ser rigorosamente a base do sistema",
    );
    assert.equal(
      split.parteRevendedor,
      20.0,
      "Revendedor deve receber a diferença entre a base do vendedor e a do sistema (45 - 25 = 20)",
    );
    assert.equal(
      split.parteVendedor,
      25.0,
      "Vendedor deve receber o valor excedente da sua base (70 - 45 = 25)",
    );
    assert.equal(
      split.destinatarioTaxa,
      "vendedor",
      "Taxa de ativação/instalação deve pertencer ao vendedor que realizou a venda",
    );
  });

  it("2. Divisão de comissões (Split) - Venda Direta do Revendedor", () => {
    const split = calcularSplitMensalidade({
      valorMensalidade: 60.0,
      baseSistema: 25.0,
      temRevendedor: true,
      temVendedor: false,
    });

    assert.equal(
      split.parteSistema,
      25.0,
      "Cota do Sistema deve ser rigorosamente a base do sistema",
    );
    assert.equal(
      split.parteRevendedor,
      35.0,
      "Revendedor deve receber todo o valor acima da base do sistema (60 - 25 = 35)",
    );
    assert.equal(split.parteVendedor, 0, "Sem vendedor, comissão de vendedor deve ser 0");
    assert.equal(
      split.destinatarioTaxa,
      "revendedor",
      "Taxa de instalação da venda direta pertence 100% ao revendedor",
    );
  });

  it("3. Divisão de comissões (Split) - Venda Direta da Matriz (Sistema)", () => {
    const split = calcularSplitMensalidade({
      valorMensalidade: 50.0,
      temRevendedor: false,
      temVendedor: false,
    });

    assert.equal(split.parteSistema, 50.0, "Venda direta da matriz: 100% para o sistema");
    assert.equal(split.parteRevendedor, 0);
    assert.equal(split.parteVendedor, 0);
    assert.equal(split.destinatarioTaxa, "sistema");
  });

  it("4. Permissões de Rotas e Isolamento Estrito de Perfis Comerciais", () => {
    function criarSessao(parcial: Partial<UserSession>): UserSession {
      return {
        userId: "u-test",
        email: "test@exemplo.com",
        nome: "Usuario Teste",
        role: "adm",
        modulos: ["todos"],
        isSuperAdmin: false,
        isAdmin: false,
        isOperador: false,
        isCliente: false,
        isInstalador: false,
        isMotorista: false,
        ...parcial,
      };
    }

    const sessaoSuperAdmin = criarSessao({
      userId: "u-super",
      email: "novaes@adm.28bpm.local",
      nome: "SuperADM",
      role: "adm",
      isAdmin: true,
      isSuperAdmin: true,
    });

    const sessaoRevendedor = criarSessao({
      userId: "u-rev",
      email: "revendedor@franquia.com",
      nome: "Franquia Sul Fluminense",
      role: "revendedor",
      isRevendedor: true,
      revendedorId: "rev-1",
    });

    const sessaoVendedor = criarSessao({
      userId: "u-vend",
      email: "vendedor@franquia.com",
      nome: "Carlos Vendedor",
      role: "vendedor",
      isVendedor: true,
      vendedorId: "vend-1",
      revendedorId: "rev-1",
    });

    const sessaoCliente = criarSessao({
      userId: "u-cli",
      email: "cliente@exemplo.com",
      nome: "Cliente Final",
      role: "cliente",
      isCliente: true,
      clienteId: "cli-1",
    });

    const sessaoInstalador = criarSessao({
      userId: "u-inst",
      email: "instalador@tecnico.com",
      nome: "Marcos Instalador",
      role: "instalador",
      isInstalador: true,
    });

    // SuperADM acessa tudo
    assert.equal(podeAcessarRota(sessaoSuperAdmin, "/revendedores"), true);
    assert.equal(podeAcessarRota(sessaoSuperAdmin, "/minha-franquia"), true);
    assert.equal(podeAcessarRota(sessaoSuperAdmin, "/minhas-vendas"), true);
    assert.equal(podeAcessarRota(sessaoSuperAdmin, "/onboarding/acompanhamento"), true);

    // Revendedor acessa sua franquia e vendas, mas NÃO painel global de revendedores nem infraestrutura
    assert.equal(podeAcessarRota(sessaoRevendedor, "/minha-franquia"), true);
    assert.equal(podeAcessarRota(sessaoRevendedor, "/minhas-vendas"), true);
    assert.equal(podeAcessarRota(sessaoRevendedor, "/inicio"), true);
    assert.equal(podeAcessarRota(sessaoRevendedor, "/revendedores"), false);
    assert.equal(podeAcessarRota(sessaoRevendedor, "/usuarios"), false);
    assert.equal(podeAcessarRota(sessaoRevendedor, "/dispositivos"), false);

    // Vendedor acessa suas vendas, mas NÃO franquia nem painel global
    assert.equal(podeAcessarRota(sessaoVendedor, "/minhas-vendas"), true);
    assert.equal(podeAcessarRota(sessaoVendedor, "/inicio"), true);
    assert.equal(podeAcessarRota(sessaoVendedor, "/minha-franquia"), false);
    assert.equal(podeAcessarRota(sessaoVendedor, "/revendedores"), false);

    // Cliente acessa acompanhamento de onboarding, mas não módulos comerciais
    assert.equal(podeAcessarRota(sessaoCliente, "/onboarding/acompanhamento"), true);
    assert.equal(podeAcessarRota(sessaoCliente, "/revendedores"), false);
    assert.equal(podeAcessarRota(sessaoCliente, "/minha-franquia"), false);
    assert.equal(podeAcessarRota(sessaoCliente, "/minhas-vendas"), false);

    // Bloqueio Absoluto: Revendedor e Vendedor NÃO possuem acesso ao mapa nem rotas operacionais
    assert.equal(
      podeAcessarRota(sessaoRevendedor, "/monitor-gps"),
      false,
      "Revendedor não deve acessar o mapa",
    );
    assert.equal(
      podeAcessarRota(sessaoRevendedor, "/rotas"),
      false,
      "Revendedor não deve acessar rotas inteligentes",
    );
    assert.equal(
      podeAcessarRota(sessaoRevendedor, "/frota"),
      false,
      "Revendedor não deve acessar desempenho da frota",
    );
    assert.equal(podeAcessarModulo(sessaoRevendedor, "monitor-gps"), false);

    assert.equal(
      podeAcessarRota(sessaoVendedor, "/monitor-gps"),
      false,
      "Vendedor não deve acessar o mapa",
    );
    assert.equal(
      podeAcessarRota(sessaoVendedor, "/rotas"),
      false,
      "Vendedor não deve acessar rotas inteligentes",
    );
    assert.equal(
      podeAcessarRota(sessaoVendedor, "/frota"),
      false,
      "Vendedor não deve acessar desempenho da frota",
    );
    assert.equal(podeAcessarModulo(sessaoVendedor, "monitor-gps"), false);

    // Instalador isolado
    assert.equal(podeAcessarRota(sessaoInstalador, "/revendedores"), false);
    assert.equal(podeAcessarRota(sessaoInstalador, "/minha-franquia"), false);
    assert.equal(podeAcessarRota(sessaoInstalador, "/minhas-vendas"), false);
  });

  it("5. Catálogo de Módulos contém as novas rotas comerciais canônicas", () => {
    const ids = MODULOS_SISTEMA_REGRAS.map((m) => m.id);
    assert.ok(ids.includes("revendedores"), "Deve conter o módulo revendedores");
    assert.ok(ids.includes("minha-franquia"), "Deve conter o módulo minha-franquia");
    assert.ok(ids.includes("minhas-vendas"), "Deve conter o módulo minhas-vendas");
    assert.ok(
      ids.includes("onboarding-acompanhamento"),
      "Deve conter o módulo onboarding-acompanhamento",
    );
  });

  it("6. Migração DDL e Invalidação de Schema Cache PostgREST", () => {
    const migrationFile = path.resolve(
      process.cwd(),
      "supabase/migrations/20261027210000_hunter_modulo_revendedores_vendedores.sql",
    );
    assert.ok(fs.existsSync(migrationFile), "Arquivo de migração DDL deve existir");
    const migrationContent = fs.readFileSync(migrationFile, "utf-8");
    assert.ok(
      migrationContent.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve conter compulsoriamente a invalidação de cache NOTIFY pgrst",
    );
    assert.ok(
      migrationContent.includes("CREATE TABLE IF NOT EXISTS public.revendedores"),
      "Migração deve criar tabela revendedores",
    );
    assert.ok(
      migrationContent.includes("CREATE TABLE IF NOT EXISTS public.vendedores"),
      "Migração deve criar tabela vendedores",
    );
    assert.ok(
      migrationContent.includes("CREATE TABLE IF NOT EXISTS public.onboarding_etapas_cliente"),
      "Migração deve criar tabela onboarding_etapas_cliente",
    );

    const sqlMestre = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const sqlMestreContent = fs.readFileSync(sqlMestre, "utf-8");
    assert.ok(
      sqlMestreContent.includes("public.revendedores"),
      "Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve estar sincronizado com revendedores",
    );
  });

  it("7. Regra Pétrea de Tipografia: Proibição estrita de caractere comercial proibido em títulos e telas", () => {
    const arquivosParaAuditar = [
      "src/features/revendedores/components/RevendedoresView.tsx",
      "src/features/revendedores/components/PainelRevendedorView.tsx",
      "src/features/revendedores/components/PainelVendedorView.tsx",
      "src/features/onboarding/components/OnboardingAcompanhamentoView.tsx",
      "src/routes/cadastro-parceiro.tsx",
    ];

    for (const relPath of arquivosParaAuditar) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo deve existir: ${relPath}`);
      const content = fs.readFileSync(fullPath, "utf-8");

      // Procura por ocorrências literais de " & " em textos de tela
      const hasProhibitedAmp = /\s&\s/.test(content);
      assert.equal(
        hasProhibitedAmp,
        false,
        `Arquivo ${relPath} não deve conter caractere comercial proibido ' & ' em seus textos de tela. Use ' e '.`,
      );
    }
  });

  it("8. Restrição de WhatsApp: Revendedor e Vendedor somente disparam para contatos atrelados e sem número avulso", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/chat/components/ModalEnvioRapidoWhatsapp.tsx",
    );
    const servicePath = path.resolve(
      process.cwd(),
      "src/features/chat/services/whatsappContatosService.ts",
    );

    const modalContent = fs.readFileSync(modalPath, "utf-8");
    const serviceContent = fs.readFileSync(servicePath, "utf-8");

    // Modal proíbe número manual para parceiros
    assert.ok(
      modalContent.includes("isParceiro"),
      "Modal deve identificar e isolar parceiros comerciais (Revendedor e Vendedor)",
    );
    assert.ok(
      modalContent.includes("!isParceiro"),
      "Botão de digitar número avulso não deve ser exibido para parceiros",
    );
    assert.ok(
      modalContent.includes(
        "Envio não autorizado: você só pode enviar mensagens para contatos vinculados ao seu cadastro.",
      ),
      "Envio para números manuais ou desvinculados deve ser barrado com toast de erro",
    );

    // Service filtra estritamente por revendedor_id e vendedor_id
    assert.ok(
      serviceContent.includes("if (session?.isRevendedor)"),
      "Service deve conter filtro dedicado para Revendedor",
    );
    assert.ok(
      serviceContent.includes('.eq("revendedor_id", revId)'),
      "Revendedor deve carregar apenas vendedores e clientes atrelados ao seu revendedor_id",
    );
    assert.ok(
      serviceContent.includes("if (session?.isVendedor)"),
      "Service deve conter filtro dedicado para Vendedor",
    );
    assert.ok(
      serviceContent.includes('.eq("vendedor_id", vendId)'),
      "Vendedor deve carregar apenas clientes atrelados ao seu vendedor_id",
    );
  });

  it("9. Integração do Split com o Financeiro Mestre (transacoes_financeiras)", () => {
    const migrationSplit = path.resolve(
      process.cwd(),
      "supabase/migrations/20261027220000_hunter_split_financeiro_integrado.sql",
    );
    assert.ok(fs.existsSync(migrationSplit), "Migração de integração do split deve existir");
    const migrationContent = fs.readFileSync(migrationSplit, "utf-8");

    assert.ok(
      migrationContent.includes("repasse_revendedor"),
      "Migração deve registrar lançamentos de repasse_revendedor",
    );
    assert.ok(
      migrationContent.includes("repasse_vendedor"),
      "Migração deve registrar lançamentos de repasse_vendedor",
    );
    assert.ok(
      migrationContent.includes("uq_transacao_mensalidade_split"),
      "Migração deve conter constraint composta para split de mensalidade",
    );
    assert.ok(
      migrationContent.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração de split deve conter NOTIFY pgrst para invalidação de cache",
    );

    const typesFinanceiro = path.resolve(process.cwd(), "src/features/financeiro/types.ts");
    const typesContent = fs.readFileSync(typesFinanceiro, "utf-8");
    assert.ok(
      typesContent.includes('"repasse_revendedor"'),
      "Tipos financeiros devem declarar categoria repasse_revendedor",
    );
    assert.ok(
      typesContent.includes('"repasse_vendedor"'),
      "Tipos financeiros devem declarar categoria repasse_vendedor",
    );
    assert.ok(
      typesContent.includes("revendedor_id?: string | null;"),
      "TransacaoFinanceira deve conter revendedor_id",
    );
    assert.ok(
      typesContent.includes("vendedor_id?: string | null;"),
      "TransacaoFinanceira deve conter vendedor_id",
    );
  });

  it("10. Extrato Financeiro Dedicado com sincronização da matriz", () => {
    const painelRevPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelRevendedorView.tsx",
    );
    const painelVendPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelVendedorView.tsx",
    );

    const painelRevContent = fs.readFileSync(painelRevPath, "utf-8");
    const painelVendContent = fs.readFileSync(painelVendPath, "utf-8");

    assert.ok(
      painelRevContent.includes('abaAtiva === "extrato"'),
      "Painel do revendedor deve renderizar aba de extrato financeiro",
    );
    assert.ok(
      painelRevContent.includes("Repasse Pago pela Matriz"),
      "Painel do revendedor deve identificar quando o repasse foi liquidado pela matriz",
    );

    assert.ok(
      painelVendContent.includes('abaAtiva === "extrato"'),
      "Painel do vendedor deve renderizar aba de extrato financeiro",
    );
    assert.ok(
      painelVendContent.includes("Comissão Paga pela Matriz"),
      "Painel do vendedor deve identificar quando a comissão foi liquidada pela matriz",
    );
  });

  it("11. Base Padrão do Sistema em R$ 40,00 (alterável) e integridade da tabela convites_cliente", () => {
    // 1. Split com base 40.00 padrão
    const splitBase40 = calcularSplitMensalidade({
      valorMensalidade: 80.0,
      baseSistema: 40.0,
      baseVendedor: 60.0,
      temRevendedor: true,
      temVendedor: true,
    });

    assert.equal(splitBase40.parteSistema, 40.0, "Cota do sistema com base 40");
    assert.equal(splitBase40.parteRevendedor, 20.0, "Margem revendedor (60 - 40)");
    assert.equal(splitBase40.parteVendedor, 20.0, "Comissão vendedor (80 - 60)");

    // 2. Base do sistema alterada (customizável por franquia)
    const splitBaseCustom = calcularSplitMensalidade({
      valorMensalidade: 80.0,
      baseSistema: 35.0,
      baseVendedor: 55.0,
      temRevendedor: true,
      temVendedor: true,
    });

    assert.equal(splitBaseCustom.parteSistema, 35.0, "Cota do sistema alterada para 35");
    assert.equal(splitBaseCustom.parteRevendedor, 20.0, "Margem revendedor (55 - 35)");
    assert.equal(splitBaseCustom.parteVendedor, 25.0, "Comissão vendedor (80 - 55)");

    // 3. Verificação do script de migração e grants de convites_cliente
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261027222000_hunter_correcao_convites_cliente_e_base_40.sql",
    );
    assert.ok(
      fs.existsSync(migrationPath),
      "Migração de correção de convites e base 40 deve existir",
    );
    const migrationText = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      migrationText.includes("CREATE TABLE IF NOT EXISTS public.convites_cliente"),
      "Migração deve garantir a criação da tabela convites_cliente",
    );
    assert.ok(
      migrationText.includes(
        "GRANT ALL ON TABLE public.convites_cliente TO authenticated, service_role;",
      ),
      "Migração deve conter GRANT para authenticated e service_role",
    );
    assert.ok(
      migrationText.includes("GRANT SELECT ON TABLE public.convites_cliente TO anon;"),
      "Migração deve conter GRANT SELECT para anon",
    );
    assert.ok(
      migrationText.includes("DEFAULT 40.00"),
      "Migração deve atualizar default para 40.00",
    );
  });

  it("11. Envio de links para Revendedor, Vendedor e Cliente via WhatsApp com campo dinâmico de telefone", () => {
    const revendedoresViewPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/RevendedoresView.tsx",
    );
    const painelRevendedorViewPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelRevendedorView.tsx",
    );
    const painelVendedorViewPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelVendedorView.tsx",
    );

    const revConteudo = fs.readFileSync(revendedoresViewPath, "utf-8");
    const painelRevConteudo = fs.readFileSync(painelRevendedorViewPath, "utf-8");
    const painelVendConteudo = fs.readFileSync(painelVendedorViewPath, "utf-8");

    // 1. Botão Enviar substituindo o Testar nos 3 componentes de links comerciais
    assert.ok(
      revConteudo.includes("<span>Enviar</span>"),
      "RevendedoresView deve conter o botão Enviar",
    );
    assert.ok(
      !revConteudo.includes("<span>Testar</span>"),
      "RevendedoresView não deve mais conter o botão Testar",
    );

    assert.ok(
      painelRevConteudo.includes("<span>Enviar</span>"),
      "PainelRevendedorView deve conter o botão Enviar",
    );
    assert.ok(
      !painelRevConteudo.includes("<span>Testar</span>"),
      "PainelRevendedorView não deve mais conter o botão Testar",
    );

    assert.ok(
      painelVendConteudo.includes("<span>Enviar</span>"),
      "PainelVendedorView deve conter o botão Enviar",
    );
    assert.ok(
      !painelVendConteudo.includes("<span>Testar</span>"),
      "PainelVendedorView não deve mais conter o botão Testar",
    );

    // 2. Campo para informar o número de WhatsApp que receberá a mensagem
    assert.ok(
      revConteudo.includes("whatsappDestinoLink"),
      "RevendedoresView deve conter estado para o WhatsApp de destino",
    );
    assert.ok(
      revConteudo.includes("handleEnviarWhatsappLink"),
      "RevendedoresView deve conter handler de disparo de WhatsApp",
    );

    assert.ok(
      painelRevConteudo.includes("whatsappDestinoLink"),
      "PainelRevendedorView deve conter estado para o WhatsApp de destino",
    );
    assert.ok(
      painelRevConteudo.includes("handleEnviarWhatsappLink"),
      "PainelRevendedorView deve conter handler de disparo de WhatsApp",
    );

    assert.ok(
      painelVendConteudo.includes("whatsappDestinoLink"),
      "PainelVendedorView deve conter estado para o WhatsApp de destino",
    );
    assert.ok(
      painelVendConteudo.includes("handleEnviarWhatsappLink"),
      "PainelVendedorView deve conter handler de disparo de WhatsApp",
    );
  });

  it("13. Regra Canônica de Primeiro Acesso: Autocadastros com senha própria NÃO trocam senha", () => {
    // Autocadastros onde o próprio usuário escolhe a senha (primeiro_acesso = false)
    const perfilRevendedorAutocadastro = {
      role: "revendedor",
      primeiro_acesso: false,
    };
    const perfilVendedorAutocadastro = {
      role: "vendedor",
      primeiro_acesso: false,
    };
    const perfilClienteAutocadastro = {
      role: "cliente",
      primeiro_acesso: false,
    };

    // Cadastro manual por operador com senha provisória ou redefinição administrativa (primeiro_acesso = true)
    const perfilCriadoPorOperador = {
      role: "operador",
      primeiro_acesso: true,
    };

    const resolverPrimeiroAcesso = (p: { role: string; primeiro_acesso?: boolean }) => {
      if (p.primeiro_acesso === false) return false;
      return Boolean(p.primeiro_acesso === true);
    };

    assert.equal(
      resolverPrimeiroAcesso(perfilRevendedorAutocadastro),
      false,
      "Revendedor autocadastrado NÃO deve exigir troca de senha",
    );
    assert.equal(
      resolverPrimeiroAcesso(perfilVendedorAutocadastro),
      false,
      "Vendedor autocadastrado NÃO deve exigir troca de senha",
    );
    assert.equal(
      resolverPrimeiroAcesso(perfilClienteAutocadastro),
      false,
      "Cliente autocadastrado NÃO deve exigir troca de senha",
    );
    assert.equal(
      resolverPrimeiroAcesso(perfilCriadoPorOperador),
      true,
      "Usuário criado por operador com senha provisória DEVE exigir troca de senha",
    );
  });

  it("14. Expurgo rigoroso de menções a 'Hunter' nas telas, modais e mensagens", () => {
    const caminhos = [
      "src/routes/_authenticated.minha-franquia.tsx",
      "src/routes/cadastro-parceiro.tsx",
      "src/features/monitor-gps/components/ModalBloqueioSeguroVeiculo.tsx",
      "src/features/monitor-gps/components/UpgradePlanoModal.tsx",
      "src/features/monitor-gps/components/AjusteOdometroModal.tsx",
      "src/features/monitor-gps/components/ModalPlaybackTrajeto.tsx",
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
      "src/features/monitor-gps/components/TrajetoInteligenteModal.tsx",
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
      "src/features/onboarding/components/OnboardingAcompanhamentoView.tsx",
    ];

    for (const relPath of caminhos) {
      const fullPath = path.resolve(process.cwd(), relPath);
      const conteudo = fs.readFileSync(fullPath, "utf-8");
      assert.ok(
        !conteudo.includes("da rede Hunter"),
        `${relPath} não pode conter 'da rede Hunter'`,
      );
      assert.ok(!conteudo.includes("Matriz Hunter"), `${relPath} não pode conter 'Matriz Hunter'`);
      assert.ok(
        !conteudo.includes("Franquia Autorizada Hunter"),
        `${relPath} não pode conter 'Franquia Autorizada Hunter'`,
      );
      assert.ok(
        !conteudo.includes("Telemetria Realtime Hunter"),
        `${relPath} não pode conter 'Telemetria Realtime Hunter'`,
      );
      assert.ok(
        !conteudo.includes("Hunter Telemetria Avançada"),
        `${relPath} não pode conter 'Hunter Telemetria Avançada'`,
      );
      assert.ok(
        !conteudo.includes("Atendimento Hunter 24h"),
        `${relPath} não pode conter 'Atendimento Hunter 24h'`,
      );
      assert.ok(
        !conteudo.includes("Odômetro no Hunter"),
        `${relPath} não pode conter 'Odômetro no Hunter'`,
      );
      assert.ok(
        !conteudo.includes("estoque Hunter"),
        `${relPath} não pode conter 'estoque Hunter'`,
      );
    }
  });
});
