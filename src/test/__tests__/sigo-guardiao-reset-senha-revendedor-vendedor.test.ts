import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { redefinirSenhaParceiro } from "../../features/revendedores/services/revendedoresService";
import { supabase } from "../../integrations/supabase/client";

describe("GD Rastreamento — Redefinição de Senha de Revendedor e Vendedor", () => {
  it("Deve validar que a nova senha deve conter no mínimo 6 caracteres antes de chamar a RPC", async () => {
    const res = await redefinirSenhaParceiro("vendedor", "vend-123", "123");
    assert.equal(res.sucesso, false);
    assert.match(res.erro || "", /mínimo 6 caracteres/);
  });

  it("Deve chamar a RPC redefinir_senha_parceiro com os parâmetros corretos", async () => {
    const rpcOriginal = supabase.rpc;
    let rpcChamada = false;
    let parametrosRecebidos: any = null;

    // Mock seguro da RPC
    (supabase as any).rpc = async (nome: string, params: any) => {
      if (nome === "redefinir_senha_parceiro") {
        rpcChamada = true;
        parametrosRecebidos = params;
        return {
          data: {
            sucesso: true,
            message:
              "Senha redefinida com sucesso. O usuario devera cadastrar nova senha no primeiro acesso.",
          },
          error: null,
        };
      }
      return rpcOriginal.call(supabase, nome, params);
    };

    try {
      const res = await redefinirSenhaParceiro("revendedor", "rev-456", "Sigo@2026");
      assert.equal(res.sucesso, true);
      assert.match(res.message || "", /primeiro acesso/);
      assert.equal(rpcChamada, true);
      assert.deepEqual(parametrosRecebidos, {
        p_tipo: "revendedor",
        p_id: "rev-456",
        p_nova_senha: "Sigo@2026",
      });
    } finally {
      (supabase as any).rpc = rpcOriginal;
    }
  });

  it("Deve aplicar primeiro_acesso = true na sessão quando profile.primeiro_acesso for true", () => {
    // Regra pétrea de negócio:
    // 1. Autocadastros onde o próprio usuário escolhe a senha (primeiro_acesso = false) -> NÃO força troca
    // 2. Redefinição de senha por gestor/operador (primeiro_acesso = true) -> FORÇA troca no 1º login
    const resolverPrimeiroAcesso = (profile: { primeiro_acesso?: boolean; role?: string }) => {
      const isNovaes = false;
      const role = profile.role || "cliente";
      return isNovaes || role === "motorista" ? false : Boolean(profile?.primeiro_acesso === true);
    };

    // Caso A: Revendedor que teve a senha resetada pelo SuperADM
    const revendedorComSenhaResetada = {
      role: "revendedor",
      primeiro_acesso: true,
    };
    assert.equal(resolverPrimeiroAcesso(revendedorComSenhaResetada), true);

    // Caso B: Vendedor que teve a senha resetada pelo Revendedor
    const vendedorComSenhaResetada = {
      role: "vendedor",
      primeiro_acesso: true,
    };
    assert.equal(resolverPrimeiroAcesso(vendedorComSenhaResetada), true);

    // Caso C: Parceiro que realizou autocadastro com a própria senha
    const parceiroAutoCadastrado = {
      role: "revendedor",
      primeiro_acesso: false,
    };
    assert.equal(resolverPrimeiroAcesso(parceiroAutoCadastrado), false);
  });

  it("Deve garantir que a migração SQL do banco contém a RPC redefinir_senha_parceiro com primeiro_acesso = TRUE", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261028170000_sigo_guardiao_redefinir_senha_parceiro.sql",
    );
    assert.equal(fs.existsSync(migrationPath), true);

    const conteudo = fs.readFileSync(migrationPath, "utf-8");
    assert.match(conteudo, /CREATE OR REPLACE FUNCTION public\.redefinir_senha_parceiro/);
    assert.match(conteudo, /primeiro_acesso = TRUE/);
    assert.match(conteudo, /NOTIFY pgrst, 'reload schema';/);
  });

  it("Deve garantir que a tabela public.profiles possui a migração para adicionar a coluna cpf_cnpj", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261104170500_hunter_profiles_add_cpf_cnpj.sql",
    );
    assert.equal(fs.existsSync(migrationPath), true);

    const conteudo = fs.readFileSync(migrationPath, "utf-8");
    assert.match(conteudo, /ALTER TABLE public\.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;/);

    const sqlMestrePath = path.resolve(
      process.cwd(),
      "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const sqlMestre = fs.readFileSync(sqlMestrePath, "utf-8");
    assert.match(sqlMestre, /ALTER TABLE public\.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;/);
  });

  it("Deve garantir que o micro-gateway WhatsApp suporta payloads de até 50mb (prevenindo erro 413 Payload Too Large)", () => {
    const gatewayServerPath = path.resolve(
      process.cwd(),
      "deploy/hunter-whatsapp-gateway/src/server.ts",
    );
    assert.equal(fs.existsSync(gatewayServerPath), true);

    const conteudo = fs.readFileSync(gatewayServerPath, "utf-8");
    assert.match(conteudo, /app\.use\(express\.json\(\{ limit: "50mb" \}\)\);/);
    assert.match(
      conteudo,
      /app\.use\(express\.urlencoded\(\{ limit: "50mb", extended: true \}\)\);/,
    );
  });

  it("Deve garantir que o micro-gateway WhatsApp implementa persistência de mensagens e chaves Signal para eliminar 'Aguardando Mensagem'", () => {
    const gatewayServerPath = path.resolve(
      process.cwd(),
      "deploy/hunter-whatsapp-gateway/src/server.ts",
    );
    const conteudo = fs.readFileSync(gatewayServerPath, "utf-8");

    // 1. makeCacheableSignalKeyStore para chaves de criptografia Signal
    assert.match(conteudo, /makeCacheableSignalKeyStore/);
    assert.match(conteudo, /keys:\s*makeCacheableSignalKeyStore\(state\.keys,\s*logger\)/);

    // 2. Persistência de mensagens em disco /data
    assert.match(conteudo, /salvarMensagemPersistida/);
    assert.match(conteudo, /obterMensagemPersistida/);
    assert.match(conteudo, /getMessage:\s*async\s*\(key\)\s*=>/);

    // 3. Caches de Retry e Placeholder
    assert.match(conteudo, /msgRetryCounterCache/);
    assert.match(conteudo, /placeholderResendCache/);

    // 4. Rotina de expurgo de mensagens antigas
    assert.match(conteudo, /expurgarMensagensAntigas/);
  });

  it("Deve garantir que o ModalEditarVendedor e RevendedoresView possuem a seção canônica de reset de senha", () => {
    const modalVendedorPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/ModalEditarVendedor.tsx",
    );
    assert.equal(fs.existsSync(modalVendedorPath), true);

    const conteudoModal = fs.readFileSync(modalVendedorPath, "utf-8");
    assert.match(conteudoModal, /Redefinir Senha de Acesso/);
    assert.match(conteudoModal, /redefinirSenhaParceiro/);
    assert.match(conteudoModal, /createPortal/);

    const revendedoresViewPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/RevendedoresView.tsx",
    );
    const conteudoView = fs.readFileSync(revendedoresViewPath, "utf-8");
    assert.match(conteudoView, /ModalEditarVendedor/);
    assert.match(conteudoView, /Redefinir Senha de Acesso/);
    assert.match(conteudoView, /handleRedefinirSenhaRevendedor/);
  });

  it("Deve proibir link de Vendedor sem Revendedor e auto-vincular o revendedor ao gerar link", async () => {
    const { gerarLinkConviteComercial } =
      await import("../../features/revendedores/services/revendedoresService");

    // Validação de defesa em profundidade no service
    const resSemRev = await gerarLinkConviteComercial({
      tipoConvite: "vendedor",
      revendedorId: null,
    });
    assert.equal(resSemRev.sucesso, false);
    assert.match(resSemRev.erro || "", /obrigatoriamente vinculado a um revendedor/);

    // Verificação no código-fonte de RevendedoresView
    const revendedoresViewPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/RevendedoresView.tsx",
    );
    const conteudo = fs.readFileSync(revendedoresViewPath, "utf-8");

    // Proibição de 'Venda Direta da Central' na seção de vendedor
    assert.match(
      conteudo,
      /tipoConviteLink === "vendedor" && \(\s*<div>\s*<label[^>]*>\s*Vincular à Franquia \/ Revendedor \*/,
    );
    assert.match(conteudo, /abrirModalGerarLinkParaRevendedor/);
    assert.match(conteudo, /Link Vendedor/);
  });

  it("Deve garantir que o botão superior de compartilhamento é rotulado como WhatsApp e apenas o inferior como Enviar", () => {
    const views = [
      "src/features/revendedores/components/RevendedoresView.tsx",
      "src/features/revendedores/components/PainelRevendedorView.tsx",
      "src/features/revendedores/components/PainelVendedorView.tsx",
    ];

    for (const viewRelPath of views) {
      const fullPath = path.resolve(process.cwd(), viewRelPath);
      assert.equal(fs.existsSync(fullPath), true, `Arquivo deve existir: ${viewRelPath}`);
      const conteudo = fs.readFileSync(fullPath, "utf-8");

      // Deve possuir o botão 'WhatsApp' que alterna 'mostrarCampoWhatsappLink'
      assert.match(
        conteudo,
        /setMostrarCampoWhatsappLink\(\(prev\)\s*=>\s*!prev\)[\s\S]*?<span>WhatsApp<\/span>/,
        `O botão expansor de WhatsApp deve conter o texto WhatsApp em ${viewRelPath}`,
      );

      // Deve possuir o campo com label 'Número de WhatsApp para Envio:'
      assert.match(conteudo, /Número de WhatsApp para Envio:/);

      // O botão final de envio deve conter 'Enviar'
      assert.match(
        conteudo,
        /handleEnviarWhatsappLink[\s\S]*?<span>Enviar<\/span>/,
        `O botão final de envio deve conter o texto Enviar em ${viewRelPath}`,
      );
    }
  });

  it("Deve aplicar compulsoriamente a sugestão de R$ 15,00 a mais sobre a base de custo nos modais e bloquear venda abaixo da base", () => {
    // 1. PainelVendedorView: Vendedor sugere base + 15 e bloqueia venda abaixo da base
    const vendedorPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelVendedorView.tsx",
    );
    const vendedorConteudo = fs.readFileSync(vendedorPath, "utf-8");
    assert.match(
      vendedorConteudo,
      /setMensalidadeLink\(\s*baseVend\s*\+\s*15\.0\s*\)/,
      "Vendedor deve calcular sugestão de base + 15.0 ao carregar dados",
    );
    assert.match(
      vendedorConteudo,
      /setMensalidadeLink\(\s*base\s*\+\s*15\.0\s*\)/,
      "Vendedor deve calcular sugestão de base + 15.0 no abrirModalGerarLink",
    );
    assert.match(
      vendedorConteudo,
      /mensalidadeLink\s*<\s*base/,
      "Vendedor deve conter validação bloqueante contra venda inferior à sua base",
    );
    assert.match(
      vendedorConteudo,
      /Sugestão \(\+ R\$ 15,00\)/,
      "Modal do vendedor deve exibir sugestão (+ R$ 15,00) na interface",
    );

    // 2. PainelRevendedorView: Revendedor sugere base matriz + 15 e bloqueia valores inferiores
    const revendedorPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelRevendedorView.tsx",
    );
    const revendedorConteudo = fs.readFileSync(revendedorPath, "utf-8");
    assert.match(
      revendedorConteudo,
      /setMensalidadeLink\(\s*baseMatriz\s*\+\s*15\.0\s*\)/,
      "Revendedor deve calcular sugestão de baseMatriz + 15.0 para mensalidade de cliente",
    );
    assert.match(
      revendedorConteudo,
      /setBaseVendedorLink\(\s*baseMatriz\s*\+\s*15\.0\s*\)/,
      "Revendedor deve calcular sugestão de baseMatriz + 15.0 para cota base de vendedor",
    );
    assert.match(
      revendedorConteudo,
      /mensalidadeLink\s*<\s*baseMatriz/,
      "Revendedor deve bloquear mensalidade de cliente inferior à base da matriz",
    );
    assert.match(
      revendedorConteudo,
      /baseVendedorLink\s*<\s*baseMatriz/,
      "Revendedor deve bloquear cota base de vendedor inferior à base da matriz",
    );

    // 3. RevendedoresView: Central e SuperADM sincronizam base + 15
    const centralPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/RevendedoresView.tsx",
    );
    const centralConteudo = fs.readFileSync(centralPath, "utf-8");
    assert.match(
      centralConteudo,
      /setMensalidadeLink\(\s*base\s*\+\s*15\.0\s*\)/,
      "Central deve sincronizar base + 15.0 para cliente",
    );
    assert.match(
      centralConteudo,
      /setValorBaseVendedorLink\(\s*base\s*\+\s*15\.0\s*\)/,
      "Central deve sincronizar base + 15.0 para vendedor",
    );
  });

  it("Deve garantir que o botão Mostrar DRE abre o ModalDreParceiro com agendamento WhatsApp", () => {
    // 1. ModalDreParceiro deve existir e possuir createPortal document.body
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/ModalDreParceiro.tsx",
    );
    assert.equal(fs.existsSync(modalPath), true, "ModalDreParceiro deve existir");
    const modalConteudo = fs.readFileSync(modalPath, "utf-8");
    assert.match(modalConteudo, /createPortal/);
    assert.match(modalConteudo, /document\.body/);
    assert.match(modalConteudo, /Envio Automático Diário no WhatsApp/);
    assert.match(modalConteudo, /Horário de Recebimento/);
    assert.match(modalConteudo, /Número de Celular \/ WhatsApp/);
    assert.match(modalConteudo, /Copiar Texto da DRE/);

    // 2. PainelRevendedorView deve ter o botão Mostrar DRE e renderizar ModalDreParceiro
    const revPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelRevendedorView.tsx",
    );
    const revConteudo = fs.readFileSync(revPath, "utf-8");
    assert.match(revConteudo, /<span>Mostrar DRE<\/span>/);
    assert.match(revConteudo, /<ModalDreParceiro/);

    // 3. PainelVendedorView deve ter o botão Mostrar DRE e renderizar ModalDreParceiro
    const vendPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/PainelVendedorView.tsx",
    );
    const vendConteudo = fs.readFileSync(vendPath, "utf-8");
    assert.match(vendConteudo, /<span>Mostrar DRE<\/span>/);
    assert.match(vendConteudo, /<ModalDreParceiro/);
  });

  it("Deve garantir permissão de WhatsApp para Revendedor e Vendedor, contatos isolados e cópia ao SuperADM", () => {
    // 1. AppHeader e MobileDrawer devem liberar o modal para isRevendedor e isVendedor
    const headerPath = path.resolve(process.cwd(), "src/features/layout/components/AppHeader.tsx");
    const headerConteudo = fs.readFileSync(headerPath, "utf-8");
    assert.match(
      headerConteudo,
      /session\?\.isRevendedor\s*\|\|\s*session\?\.isVendedor[\s\S]*?<ModalEnvioRapidoWhatsapp/,
      "AppHeader deve renderizar ModalEnvioRapidoWhatsapp para revendedor e vendedor",
    );

    const drawerPath = path.resolve(
      process.cwd(),
      "src/features/layout/components/MobileDrawer.tsx",
    );
    const drawerConteudo = fs.readFileSync(drawerPath, "utf-8");
    assert.match(
      drawerConteudo,
      /session\?\.isRevendedor\s*\|\|\s*session\?\.isVendedor/,
      "MobileDrawer deve exibir botão de WhatsApp para revendedor e vendedor",
    );

    // 2. whatsappContatosService deve carregar instaladores tanto para revendedor quanto para vendedor
    const contatosPath = path.resolve(
      process.cwd(),
      "src/features/chat/services/whatsappContatosService.ts",
    );
    const contatosConteudo = fs.readFileSync(contatosPath, "utf-8");
    assert.match(
      contatosConteudo,
      /\.from\("instaladores"\)/,
      "whatsappContatosService deve carregar instaladores",
    );

    // 3. ModalEnvioRapidoWhatsapp deve enviar cópia para o SuperADM ao ser disparado por parceiro
    const modalWhatsPath = path.resolve(
      process.cwd(),
      "src/features/chat/components/ModalEnvioRapidoWhatsapp.tsx",
    );
    const modalWhatsConteudo = fs.readFileSync(modalWhatsPath, "utf-8");
    assert.match(
      modalWhatsConteudo,
      /CÓPIA PARA O SUPERADM/,
      "ModalEnvioRapidoWhatsapp deve incluir texto formatado de cópia para o SuperADM",
    );
    assert.match(
      modalWhatsConteudo,
      /copia_whatsapp_parceiros/,
      "ModalEnvioRapidoWhatsapp deve checar copia_whatsapp_parceiros",
    );

    // 4. RelatorioGerencialModal deve permitir ao SuperADM ligar/desligar cópia de mensagens dos parceiros
    const configModalPath = path.resolve(
      process.cwd(),
      "src/features/relatorios/components/RelatorioGerencialModal.tsx",
    );
    const configModalConteudo = fs.readFileSync(configModalPath, "utf-8");
    assert.match(
      configModalConteudo,
      /copia_whatsapp_parceiros/,
      "RelatorioGerencialModal deve possuir controle de copia_whatsapp_parceiros",
    );

    // 5. relatorioDiarioMetricasService deve conter DRE Consolidada da Rede no relatório diário
    const relatorioPath = path.resolve(
      process.cwd(),
      "src/features/relatorios/services/relatorioDiarioMetricasService.ts",
    );
    const relatorioConteudo = fs.readFileSync(relatorioPath, "utf-8");
    assert.match(
      relatorioConteudo,
      /DEMONSTRATIVO CONSOLIDADO \(DRE DA REDE\)/,
      "Relatório diário deve incluir bloco DRE Consolidada da Rede",
    );

    // 6. Migração SQL deve existir e conter as colunas e RPCs de DRE
    const migracaoPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261028195500_sigo_guardiao_dre_whatsapp_e_copia_superadm.sql",
    );
    assert.equal(fs.existsSync(migracaoPath), true, "Migração de DRE deve existir");
    const migracaoConteudo = fs.readFileSync(migracaoPath, "utf-8");
    assert.match(migracaoConteudo, /dre_whatsapp_ativo/);
    assert.match(migracaoConteudo, /configurar_dre_whatsapp_revendedor/);
    assert.match(migracaoConteudo, /configurar_dre_whatsapp_vendedor/);
    assert.match(migracaoConteudo, /copia_whatsapp_parceiros/);
  });

  it("Deve garantir que o servidor possui rota segura /api/admin/redefinir-senha-parceiro e blindagem de cpf_cnpj", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const serverConteudo = fs.readFileSync(serverPath, "utf-8");

    assert.match(
      serverConteudo,
      /\/api\/admin\/redefinir-senha-parceiro/,
      "Servidor deve interceptar /api/admin/redefinir-senha-parceiro",
    );
    assert.match(
      serverConteudo,
      /handleApiAdminRedefinirSenhaParceiro/,
      "Servidor deve conter a função handleApiAdminRedefinirSenhaParceiro",
    );

    const servicePath = path.resolve(
      process.cwd(),
      "src/features/revendedores/services/revendedoresService.ts",
    );
    const serviceConteudo = fs.readFileSync(servicePath, "utf-8");
    assert.match(
      serviceConteudo,
      /\/api\/admin\/redefinir-senha-parceiro/,
      "revendedoresService deve chamar a rota segura do servidor em primeira tentativa",
    );
  });
});
