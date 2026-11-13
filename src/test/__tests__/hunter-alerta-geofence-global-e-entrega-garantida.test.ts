import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Blindagem de Alertas de Cerca Virtual e Entrega Garantida", () => {
  it("1. AppShell deve renderizar AlertasAcidenteBanner globalmente para todas as telas", () => {
    const appShellPath = path.resolve(process.cwd(), "src/features/layout/components/AppShell.tsx");
    const content = fs.readFileSync(appShellPath, "utf-8");

    assert.ok(
      content.includes("AlertasAcidenteBanner"),
      "AppShell deve importar e renderizar AlertasAcidenteBanner",
    );
    assert.ok(
      content.includes("<AlertasAcidenteBanner podeVisualizarAlertas={true} />"),
      "AppShell deve incluir o banner de emergência em camada superior",
    );
  });

  it("2. GpsMonitorView deve responder ao evento hunter:focar_veiculo disparado pelo banner global", () => {
    const gpsViewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(gpsViewPath, "utf-8");

    assert.ok(
      content.includes("hunter:focar_veiculo"),
      "GpsMonitorView deve escutar o evento hunter:focar_veiculo para focar no mapa",
    );
    assert.ok(
      content.includes("focarVeiculoPorId"),
      "GpsMonitorView deve chamar focarVeiculoPorId ao receber o evento",
    );
  });

  it("3. AlertasAcidenteBanner deve suportar onFocarVeiculo opcional e disparar evento customizado", () => {
    const bannerPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/AlertasAcidenteBanner.tsx",
    );
    const content = fs.readFileSync(bannerPath, "utf-8");

    assert.ok(
      content.includes("onFocarVeiculo?: (veiculoId: string) => void;"),
      "onFocarVeiculo deve ser opcional para suportar uso no AppShell",
    );
    assert.ok(
      content.includes("hunter:focar_veiculo"),
      "AlertasAcidenteBanner deve disparar o evento hunter:focar_veiculo ao clicar em focar",
    );
  });

  it("4. Server server.ts deve conter reconciliarAlertasSegurancaServidor e rota /api/alertas/reconciliar", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      content.includes("reconciliarAlertasSegurancaServidor"),
      "server.ts deve conter a função reconciliarAlertasSegurancaServidor",
    );
    assert.ok(
      content.includes("/api/alertas/reconciliar"),
      "server.ts deve conter o endpoint /api/alertas/reconciliar",
    );
    assert.ok(
      content.includes("await reconciliarAlertasSegurancaServidor"),
      "scheduled deve invocar reconciliarAlertasSegurancaServidor",
    );
  });

  it("5. Regra Pétrea: Ausência estrita do caractere comercial proibido nos novos arquivos", () => {
    const arquivos = [
      "src/features/layout/components/AppShell.tsx",
      "src/features/monitor-gps/components/AlertasAcidenteBanner.tsx",
      "supabase/migrations/20261104130000_hunter_geofence_alerta_garantido_whatsapp_push.sql",
    ];

    for (const arq of arquivos) {
      const fullPath = path.resolve(process.cwd(), arq);
      const text = fs.readFileSync(fullPath, "utf-8");
      // Ignora URLs externas, operadores lógicos && e entidades html
      const limpo = text
        .replace(/https?:\/\/[^\s"'`]+/g, "")
        .replace(/&&/g, "")
        .replace(/&quot;|&amp;|&lt;|&gt;/g, "");
      assert.ok(
        !limpo.includes("&"),
        `Arquivo ${arq} não deve conter o caractere comercial proibido solto em texto`,
      );
    }
  });
});
