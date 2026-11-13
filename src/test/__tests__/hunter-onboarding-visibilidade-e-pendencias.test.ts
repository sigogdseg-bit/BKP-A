import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { clientePossuiPendenciaInstalacaoOuAtivacao } from "../../features/clientes/services/clienteService";
import { obterEtapasOnboardingCliente } from "../../features/revendedores/services/revendedoresService";

describe("Hunter — Regras de Acesso e Governança da Esteira de Onboarding (DJR-NEW)", () => {
  it("1. clientePossuiPendenciaInstalacaoOuAtivacao deve ser exportada e retornar Promise<boolean>", async () => {
    assert.equal(typeof clientePossuiPendenciaInstalacaoOuAtivacao, "function");
    // Sem parâmetros, deve resolver de forma segura como boolean (falso por omissão de ID)
    const res = await clientePossuiPendenciaInstalacaoOuAtivacao();
    assert.equal(typeof res, "boolean");
    assert.equal(res, false);
  });

  it("2. obterEtapasOnboardingCliente: zero mock, retorna null se o cliente não possui etapas registradas", async () => {
    // Para um cliente sem registro, a função deve retornar null sem inventar UUIDs ou etapas
    const res = await obterEtapasOnboardingCliente("00000000-0000-0000-0000-000000000000");
    assert.equal(
      res,
      null,
      "Não deve gerar mock de onboarding quando não houver registro no banco",
    );
  });

  it("3. InicioHubView.tsx: 'Acompanhamento da Ativação' deve estar estritamente condicionado a session.isCliente e temPendenciaAtivacao", () => {
    const inicioPath = path.resolve(
      process.cwd(),
      "src/features/inicio/components/InicioHubView.tsx",
    );
    const content = fs.readFileSync(inicioPath, "utf-8");

    // Não pode estar incondicionalmente no array de cards
    assert.ok(
      content.includes("session?.isCliente && temPendenciaAtivacao"),
      "InicioHubView deve condicionar o card de acompanhamento a session.isCliente e temPendenciaAtivacao",
    );
    assert.ok(
      content.includes("clientePossuiPendenciaInstalacaoOuAtivacao"),
      "InicioHubView deve importar e executar clientePossuiPendenciaInstalacaoOuAtivacao",
    );
  });

  it("4. MobileDrawer.tsx: 'Acompanhamento da Ativação' no menu do cliente deve estar condicionado a temPendenciaAtivacao", () => {
    const drawerPath = path.resolve(
      process.cwd(),
      "src/features/layout/components/MobileDrawer.tsx",
    );
    const content = fs.readFileSync(drawerPath, "utf-8");

    assert.ok(
      content.includes("temPendenciaAtivacao"),
      "MobileDrawer deve verificar temPendenciaAtivacao",
    );
    assert.ok(
      content.includes("clientePossuiPendenciaInstalacaoOuAtivacao"),
      "MobileDrawer deve consultar se há pendências reais no banco de dados",
    );
  });

  it("5. OnboardingAcompanhamentoView.tsx: deve possuir 3 visões distintas (Gestão, Frota 100% Ativa e Esteira Pendente)", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/onboarding/components/OnboardingAcompanhamentoView.tsx",
    );
    const content = fs.readFileSync(viewPath, "utf-8");

    // 1. Visão de Gestão (Admin / Operador)
    assert.ok(
      content.includes("Visão Administrativa"),
      "Deve possuir cabeçalho e visão administrativa para administradores e operadores",
    );
    assert.ok(
      content.includes("/instalacao"),
      "Deve direcionar administradores para a Central de Instalações Técnicas (/instalacao)",
    );

    // 2. Visão de Cliente sem Pendências (Frota 100% Ativa)
    assert.ok(
      content.includes("Frota 100% Ativa"),
      "Deve possuir tela de confirmação de frota 100% homologada para clientes sem pendências",
    );
    assert.ok(
      content.includes("/monitor-gps"),
      "Deve oferecer atalho para o mapa de veículos para clientes ativos",
    );

    // 3. Esteira de 6 etapas factual
    assert.ok(
      content.includes("listaEtapas"),
      "Deve manter a lista de 6 etapas para clientes com pendências reais",
    );
  });

  it("6. Proibição de caracteres proibidos em textos e títulos de onboarding", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/onboarding/components/OnboardingAcompanhamentoView.tsx",
    );
    const content = fs.readFileSync(viewPath, "utf-8");
    // Não pode conter '&' em strings de texto (títulos, descrições, labels)
    const matchesTexto = content.match(/"[^"\r\n]*&[^"\r\n]*"|'[^'\r\n]*&[^'\r\n]*'/g);
    assert.equal(
      matchesTexto,
      null,
      "Não deve conter o caractere '&' em textos e strings (use a conjunção 'e')",
    );
  });

  it("7. clientePossuiPendenciaInstalacaoOuAtivacao: retorna false para cliente com frota ativa e instalada", async () => {
    // Dario Novaes (veículo ativo AXH0E44 com rastreador instalado e sem ordens pendentes)
    const res = await clientePossuiPendenciaInstalacaoOuAtivacao(
      "c15aa27c-b508-4af5-9de4-355431eb3cf7",
      "592a5124-d8bc-47a6-aa8e-a744f0d65467",
    );
    assert.equal(res, false, "Cliente com frota ativa não deve ter pendência de ativação");
  });
});
