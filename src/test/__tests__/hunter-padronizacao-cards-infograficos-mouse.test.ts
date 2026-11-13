import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Padronização Canônica do Comportamento do Mouse sobre Cards e Infográficos", () => {
  const hubModuleCardPath = path.resolve(process.cwd(), "src/shared/components/HubModuleCard.tsx");
  const inicioHubViewPath = path.resolve(
    process.cwd(),
    "src/features/inicio/components/InicioHubView.tsx",
  );

  it("1. HubModuleCard deve ter comportamento de mouse uniforme e feixe dinâmico sem bifurcações", () => {
    assert.ok(fs.existsSync(hubModuleCardPath), "HubModuleCard.tsx deve existir");
    const conteudo = fs.readFileSync(hubModuleCardPath, "utf-8");

    // Eventos do mouse obrigatórios
    assert.ok(conteudo.includes("onMouseMove={handleMouseMove}"), "Deve possuir onMouseMove");
    assert.ok(conteudo.includes("onMouseEnter={handleMouseEnter}"), "Deve possuir onMouseEnter");
    assert.ok(conteudo.includes("onMouseLeave={handleMouseLeave}"), "Deve possuir onMouseLeave");

    // Feixe luminoso dinâmico (radial-gradient com glowRgb e ponto focal)
    assert.ok(
      conteudo.includes("radial-gradient(350px circle at"),
      "Deve conter feixe luminoso radial dinâmico",
    );
    assert.ok(
      conteudo.includes("radial-gradient(130px circle at"),
      "Deve conter ponto focal translúcido",
    );

    // Transição de hover tátil e elevação uniforme
    assert.ok(
      conteudo.includes("hover:-translate-y-1.5"),
      "Deve ter elevação padronizada no hover",
    );
    assert.ok(conteudo.includes("cursor-pointer"), "Deve possuir cursor-pointer");
  });

  it("2. InicioHubView deve utilizar TiltCard no banner principal com feedback de mouse", () => {
    assert.ok(fs.existsSync(inicioHubViewPath), "InicioHubView.tsx deve existir");
    const conteudo = fs.readFileSync(inicioHubViewPath, "utf-8");

    assert.ok(
      conteudo.includes('import { TiltCard } from "@/shared/components/TiltCard";'),
      "Deve importar TiltCard",
    );
    assert.ok(conteudo.includes("<TiltCard"), "Banner principal deve ser envolvido por TiltCard");
    assert.ok(conteudo.includes("maxTilt={2}"), "Deve configurar inclinação tátil suave");
  });

  it("3. Padronização Global: Módulos do sistema devem utilizar TiltCard em cards e infográficos", () => {
    const modulosParaValidar = [
      "src/features/instalacoes/components/InstalacoesView.tsx",
      "src/features/atendimento/components/AtendimentoView.tsx",
      "src/features/financeiro/components/FinanceiroView.tsx",
      "src/features/estoque/components/EstoqueView.tsx",
      "src/features/frota/components/FrotaAnalyticsView.tsx",
      "src/features/clientes/components/ClientesView.tsx",
      "src/features/monitor-gps/components/ResumoDiarioCard.tsx",
    ];

    for (const relPath of modulosParaValidar) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `${relPath} deve existir`);
      const conteudo = fs.readFileSync(fullPath, "utf-8");

      assert.ok(
        conteudo.includes("TiltCard"),
        `${relPath} deve importar e utilizar TiltCard para padronização visual`,
      );
      assert.ok(conteudo.includes("<TiltCard"), `${relPath} deve renderizar componentes TiltCard`);
    }
  });

  it("4. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", () => {
    const arquivos = [
      hubModuleCardPath,
      inicioHubViewPath,
      path.resolve(process.cwd(), "src/features/instalacoes/components/InstalacoesView.tsx"),
      path.resolve(process.cwd(), "src/features/atendimento/components/AtendimentoView.tsx"),
      path.resolve(process.cwd(), "src/features/financeiro/components/FinanceiroView.tsx"),
      path.resolve(process.cwd(), "src/features/estoque/components/EstoqueView.tsx"),
      path.resolve(process.cwd(), "src/features/frota/components/FrotaAnalyticsView.tsx"),
      path.resolve(process.cwd(), "src/features/clientes/components/ClientesView.tsx"),
      path.resolve(process.cwd(), "src/features/monitor-gps/components/ResumoDiarioCard.tsx"),
    ];

    for (const arq of arquivos) {
      const conteudo = fs.readFileSync(arq, "utf-8");
      assert.ok(
        !conteudo.includes(" & ") && !conteudo.includes(" e & "),
        `${path.basename(arq)} não deve conter caractere comercial solto`,
      );
    }
  });
});
