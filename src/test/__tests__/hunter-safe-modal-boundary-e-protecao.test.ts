import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { SafeModalBoundary } from "../../shared/components/SafeModalBoundary";

describe("Hunter — SafeModalBoundary e Resiliência do Modal de Proteção e Limites", () => {
  it("1. SafeModalBoundary deve capturar erro e renderizar fallback sem propagar exceção", () => {
    const boundary = new SafeModalBoundary({
      titulo: "Proteção e Limites Indisponível",
      fallback: (err) => React.createElement("div", { id: "fallback-capturado" }, err.message),
      children: null,
    });

    const erroSimulado = new Error("Simulação de falha catastrófica em sub-componente");
    const novoEstado = SafeModalBoundary.getDerivedStateFromError(erroSimulado);
    assert.strictEqual(novoEstado.hasError, true);
    assert.strictEqual(novoEstado.error, erroSimulado);

    boundary.state = novoEstado;
    const vnode = boundary.render() as React.ReactElement;
    assert.ok(vnode, "Deve retornar o nó de fallback");

    const html = ReactDOMServer.renderToString(vnode);
    assert.ok(html.includes("fallback-capturado"), "Deve renderizar o container de fallback");
    assert.ok(
      html.includes("Simulação de falha catastrófica em sub-componente"),
      "Deve conter a mensagem de erro no fallback",
    );
  });

  it("2. SafeModalBoundary deve renderizar filhos normalmente quando não há erro", () => {
    const ComponenteSaudavel = () =>
      React.createElement("div", { id: "filho-operacional" }, "Tudo funcionando 100%");

    const html = ReactDOMServer.renderToString(
      React.createElement(SafeModalBoundary, null, React.createElement(ComponenteSaudavel, null)),
    );

    assert.ok(
      html.includes("filho-operacional"),
      "Deve renderizar o filho operacional com sucesso",
    );
    assert.ok(html.includes("Tudo funcionando 100%"), "Deve exibir o texto original do filho");
  });

  it("3. VehicleTelemetryDrawer deve proteger ConfiguracaoProtecaoModal com SafeModalBoundary", () => {
    const drawerPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
    );
    const drawerCode = fs.readFileSync(drawerPath, "utf-8");

    assert.ok(
      drawerCode.includes("SafeModalBoundary"),
      "VehicleTelemetryDrawer deve importar e utilizar SafeModalBoundary",
    );
    assert.ok(
      drawerCode.includes("<SafeModalBoundary"),
      "VehicleTelemetryDrawer deve instanciar SafeModalBoundary no JSX",
    );
    assert.ok(
      drawerCode.includes("Proteção e Limites Indisponível"),
      "VehicleTelemetryDrawer deve definir título de resiliência para o modal de proteção",
    );
  });

  it("4. ConfiguracaoProtecaoModal deve conter parsing seguro para hora_inicio, hora_fim e dias_semana", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const modalCode = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      modalCode.includes("PREFERENCIAS_PADRAO"),
      "ConfiguracaoProtecaoModal deve importar e inicializar com PREFERENCIAS_PADRAO",
    );
    assert.ok(
      modalCode.includes("Array.isArray(diasSemana)"),
      "ConfiguracaoProtecaoModal deve verificar Array.isArray(diasSemana) antes de chamar .includes()",
    );
    assert.ok(
      modalCode.includes("if (!veiculo) return null;"),
      "ConfiguracaoProtecaoModal deve conter guarda de segurança contra veiculo nulo",
    );
  });

  it("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido (&) em SafeModalBoundary e ConfiguracaoProtecaoModal", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const boundaryPath = path.resolve(process.cwd(), "src/shared/components/SafeModalBoundary.tsx");

    const modalCode = fs.readFileSync(modalPath, "utf-8");
    const boundaryCode = fs.readFileSync(boundaryPath, "utf-8");

    // Proíbe uso em textos visíveis ao usuário
    const textosProibidos = [
      /Proteção\s*&\s*Limites/i,
      /Velocidade\s*&\s*Bateria/i,
      /Regras\s*&\s*Alertas/i,
    ];

    for (const regex of textosProibidos) {
      assert.ok(!regex.test(modalCode), `ConfiguracaoProtecaoModal não deve conter ${regex}`);
      assert.ok(!regex.test(boundaryCode), `SafeModalBoundary não deve conter ${regex}`);
    }
  });
});
