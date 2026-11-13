import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizarMensagemErro } from "../../shared/utils/erroAmigavel.js";
import { conferirCorrespondenciaIdentificador } from "../../shared/utils/conferenciaIdentificador.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "../../..");

describe("Hunter — Auditoria Global e Compulsória de TODAS as Regras Pétreas (AGENTS.md)", () => {
  // 1. REGRA PÉTREA: Blindagem contra Vazamento de Erros de Banco e Schema Cache
  it("Regra 1: Blindagem de Erros de Banco — Interceptor de Toast e Proxy Supabase ativos", () => {
    const toastIntPath = path.join(root, "src/shared/lib/toastInterceptor.ts");
    const clientPath = path.join(root, "src/integrations/supabase/client.ts");
    assert.ok(fs.existsSync(toastIntPath), "toastInterceptor.ts deve existir.");
    assert.ok(fs.existsSync(clientPath), "client.ts deve existir.");

    // Testa sanitização de mensagens de schema cache
    const msg1 = "Could not find the function public.teste in the schema cache";
    const limpa1 = sanitizarMensagemErro(msg1);
    assert.ok(!limpa1.includes("schema cache") && !limpa1.includes("public."));

    const msg2 = "PGRST204: column nao_existe does not exist";
    const limpa2 = sanitizarMensagemErro(msg2);
    assert.ok(!limpa2.includes("PGRST204"));
  });

  // 2. REGRA PÉTREA: Validação Absoluta de Identificador/IMEI se Bater com o Esperado
  it("Regra 2: Validação de Identificador/IMEI — se digitado for igual ao esperado, valida na hora", () => {
    // 4 dígitos (caso de teste do usuário)
    const r1 = conferirCorrespondenciaIdentificador("1234", "1234");
    assert.strictEqual(r1.confere, true);

    // 2 dígitos
    const r2 = conferirCorrespondenciaIdentificador("99", "99");
    assert.strictEqual(r2.confere, true);

    // 15 dígitos com pontuação
    const r3 = conferirCorrespondenciaIdentificador("869-890-084-890-007", "869890084890007");
    assert.strictEqual(r3.confere, true);

    // Divergente rejeita amigavelmente
    const r4 = conferirCorrespondenciaIdentificador("4321", "1234");
    assert.strictEqual(r4.confere, false);
  });

  // 3. REGRA PÉTREA: Isolamento Total de Marca e Sistemas (Zero SIGOVTR, Zero SIGOFROTA)
  it("Regra 3: Isolamento de Marca — Zero referências cruzadas a outros sistemas no código-fonte", () => {
    const arquivosParaAuditar = [
      "src/features/seguranca/components/CentralSegurancaView.tsx",
      "src/features/theme/components/ModuloTemasPage.tsx",
      "src/features/inicio/components/InicioHubView.tsx",
      "src/features/layout/components/AppHeader.tsx",
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
      "src/features/clientes/components/ClientesView.tsx",
      "src/features/instalacoes/components/InstalacoesView.tsx",
    ];

    arquivosParaAuditar.forEach((relPath) => {
      const fullPath = path.join(root, relPath);
      if (fs.existsSync(fullPath)) {
        const conteudo = fs.readFileSync(fullPath, "utf-8").toLowerCase();
        assert.ok(!conteudo.includes("sigovtr"), `${relPath} não pode mencionar SIGOVTR.`);
        assert.ok(!conteudo.includes("sigofrota"), `${relPath} não pode mencionar SIGOFROTA.`);
      }
    });
  });

  // 4. REGRA PÉTREA: Nomenclatura Oficial Exclusiva SuperADM (Proibido Mestre)
  it("Regra 4: SuperADM Imutável — Nomenclatura oficial SuperADM (proibido o uso de 'Mestre')", () => {
    const arquivos = [
      "src/features/inicio/components/InicioHubView.tsx",
      "src/features/layout/components/AppHeader.tsx",
      "src/features/auth/components/LoginView.tsx",
      "src/features/seguranca/components/UsuarioFormModal.tsx",
      "src/features/seguranca/components/UsuariosView.tsx",
    ];

    arquivos.forEach((relPath) => {
      const fullPath = path.join(root, relPath);
      if (fs.existsSync(fullPath)) {
        const conteudo = fs.readFileSync(fullPath, "utf-8");
        assert.ok(
          !conteudo.toLowerCase().includes("mestre"),
          `${relPath} não pode usar o termo 'mestre' para governança.`,
        );
      }
    });
  });

  // 5. REGRA PÉTREA: Ausência de Caractere Comercial Proibido (&)
  it("Regra 5: Ausência do Caractere Comercial Proibido em textos de interface e catálogo", () => {
    const modulosCatalogoPath = path.join(root, "src/shared/lib/modulosCatalogo.ts");
    assert.ok(fs.existsSync(modulosCatalogoPath));
    const content = fs.readFileSync(modulosCatalogoPath, "utf-8");

    // Proíbe conjunção " & " nos módulos e títulos
    assert.ok(!content.includes(" & "), "modulosCatalogo.ts não deve usar ' & ' em títulos.");
  });

  // 6. REGRA PÉTREA: Ergonomia de Modais via ModalPortal (Portal Global document.body)
  it("Regra 6: Ergonomia de Modais — renderização via ModalPortal / createPortal global", () => {
    const modalPortalPath = path.join(root, "src/shared/components/ModalPortal.tsx");
    assert.ok(fs.existsSync(modalPortalPath), "ModalPortal.tsx deve existir.");
    const content = fs.readFileSync(modalPortalPath, "utf-8");

    assert.ok(
      content.includes("createPortal") && content.includes("document.body"),
      "ModalPortal deve renderizar diretamente no document.body.",
    );
  });

  // 7. REGRA PÉTREA: Anti-Polling Total (Supabase Realtime via WebSockets)
  it("Regra 7: Anti-Polling Total — escutas reativas em tempo real sem setInterval de polling de banco", () => {
    const notificacoesPath = path.join(root, "src/shared/lib/notificacoesBdService.ts");
    assert.ok(fs.existsSync(notificacoesPath));
    const content = fs.readFileSync(notificacoesPath, "utf-8");

    assert.ok(
      content.includes("supabase.channel") && content.includes("postgres_changes"),
      "notificacoesBdService deve utilizar canais Realtime do Supabase por WebSockets.",
    );
    assert.ok(
      !content.includes("setInterval(") ||
        !content.includes(".from('notificacoes_sistema').select"),
      "Proibido polling cíclico com setInterval para consulta de notificações.",
    );
  });

  // 8. REGRA PÉTREA: Ponto de Controle Imutável em Repositório Isolado
  it("Regra 8: Ponto de Controle Imutável — scripts isolados e remote checkpoint protegido", () => {
    const pkgPath = path.join(root, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    assert.ok(pkg.scripts["checkpoint:save"], "Deve conter script checkpoint:save.");
    assert.ok(pkg.scripts["checkpoint:restore"], "Deve conter script checkpoint:restore.");

    const pontoControlePath = path.join(root, "PONTO_DE_CONTROLE.json");
    assert.ok(fs.existsSync(pontoControlePath), "PONTO_DE_CONTROLE.json deve existir.");
    const pc = JSON.parse(fs.readFileSync(pontoControlePath, "utf-8"));
    assert.strictEqual(pc.imutavel, true, "Ponto de controle deve ser imutável.");
  });

  // 9. REGRA PÉTREA: Proibição Absoluta de Contornar ou Mascarar Erros (Correção Obrigatória na Origem & Zero Workaround)
  it("Regra 9: Proibição Absoluta de Contornar ou Mascarar Erros — Correção Obrigatória na Origem e Zero Workaround", () => {
    const agentsPath = path.join(root, "AGENTS.md");
    const hunterSkillPath = path.join(root, ".agents/skills/hunter/SKILL.md");
    const devPetreaPath = "/Users/djrnovaes/.gemini/config/skills/dev-petrea/SKILL.md";

    const agentsContent = fs.readFileSync(agentsPath, "utf-8");
    const hunterSkillContent = fs.readFileSync(hunterSkillPath, "utf-8");

    assert.ok(
      agentsContent.includes("NUNCA contorne um erro no código ou mascare o erro: CORRIJA O ERRO"),
      "AGENTS.md deve conter a regra pétrea de proibição absoluta de contornar ou mascarar erros.",
    );
    assert.ok(
      agentsContent.includes(
        "É terminantemente proibido criar rotas fantasmas, aliases redundantes, adaptadores paliativos",
      ),
      "AGENTS.md deve proibir rotas fantasmas e contornos paliativos.",
    );
    assert.ok(
      hunterSkillContent.includes(
        "NUNCA contorne um erro no código ou mascare o erro: CORRIJA O ERRO",
      ),
      "hunter SKILL.md deve conter a regra pétrea de proibição de contornar erros.",
    );

    if (fs.existsSync(devPetreaPath)) {
      const petreaContent = fs.readFileSync(devPetreaPath, "utf-8");
      assert.ok(
        petreaContent.includes(
          "NUNCA contorne um erro no código ou mascare o erro: CORRIJA O ERRO",
        ),
        "dev-petrea/SKILL.md deve conter a regra pétrea inegociável de correção na raiz e zero contorno.",
      );
    }

    // Garante que não existem rotas fantasmas para contornar erros de digitação (ex: instalacoes.tsx)
    const rotaFantasma = path.join(root, "src/routes/_authenticated.instalacoes.tsx");
    assert.strictEqual(
      fs.existsSync(rotaFantasma),
      false,
      "Não pode existir rota fantasma para mascarar chamada errada. Deve-se corrigir na origem.",
    );
  });

  // 10. REGRA PÉTREA: Gate 1 de Auto-Auditoria Operacional (Anti-Declaração da Boca Para Fora)
  it("Regra 10: Gate 1 de Auto-Auditoria Operacional — Proibição de declaração da boca para fora e auditoria ativa antes de responder e antes de encerrar", () => {
    const agentsPath = path.join(root, "AGENTS.md");
    const rulePath = path.join(root, ".agents/rules/protocolo_7_gates_execucao_encerramento.md");
    const hunterSkillPath = path.join(root, ".agents/skills/hunter/SKILL.md");

    const agentsContent = fs.readFileSync(agentsPath, "utf-8");
    const ruleContent = fs.readFileSync(rulePath, "utf-8");
    const skillContent = fs.readFileSync(hunterSkillPath, "utf-8");
    const devPetreaPath = "/Users/djrnovaes/.gemini/config/skills/dev-petrea/SKILL.md";

    const arquivos = [
      { nome: "AGENTS.md", content: agentsContent },
      { nome: "protocolo_7_gates", content: ruleContent },
      { nome: "SKILL.md", content: skillContent },
    ];

    if (fs.existsSync(devPetreaPath)) {
      arquivos.push({
        nome: "dev-petrea/SKILL.md",
        content: fs.readFileSync(devPetreaPath, "utf-8"),
      });
    }

    arquivos.forEach(({ nome, content }) => {
      assert.ok(
        content.includes("Anti-Declaração da Boca Para Fora"),
        `${nome} deve proibir expressamente declaração da boca para fora no Gate 1.`,
      );
      assert.ok(
        content.includes("Investigação de Contexto e Histórico") &&
          content.includes("erros já descobertos anteriormente") &&
          content.includes("compreendendo a fundo o assunto no contexto do sistema"),
        `${nome} deve exigir investigação prévia de contexto e erros anteriores no Gate 1.`,
      );
      assert.ok(
        content.includes("Antes de responder") &&
          content.includes("Validar se há suposição ou dedução") &&
          content.includes("apagar e buscar o dado factual diretamente na raiz"),
        `${nome} deve exigir validação de deduções com busca factual na raiz antes de responder.`,
      );
      assert.ok(
        content.includes("Antes de encerrar") &&
          content.includes("Consulta Prévia Obrigatória de Publicação (Gate 6) foi formalizada"),
        `${nome} deve exigir checagem de formalização da consulta prévia do Gate 6 antes de encerrar.`,
      );
    });
  });
});
