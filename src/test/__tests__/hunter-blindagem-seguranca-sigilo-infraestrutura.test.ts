import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Blindagem de Segurança, Sigilo de Infraestrutura e Interface Canônica", () => {
  const root = process.cwd();

  it("1. client.ts não deve conter publishable key ou URLs hardcoded no código", () => {
    const clientPath = path.join(root, "src/integrations/supabase/client.ts");
    const content = fs.readFileSync(clientPath, "utf-8");

    // Proíbe tokens JWT reais assinados no código
    assert.ok(
      !content.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
      "client.ts não pode conter token JWT hardcoded em código.",
    );
    // Proíbe URL do projeto hardcoded como fallback
    assert.ok(
      !content.includes("kaxtuqfmvlkfnqsdualu.supabase.co") &&
        !content.includes("pflzopmxxawyqkgrlapq.supabase.co"),
      "client.ts não pode expor URL de projeto Supabase hardcoded.",
    );
  });

  it("2. server.ts não deve conter service_role key ou Gemini API key hardcoded", () => {
    const serverPath = path.join(root, "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      !content.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
      "server.ts não pode conter tokens JWT hardcoded.",
    );
    assert.ok(
      !/AQ\.[A-Za-z0-9_-]{30,}/.test(content),
      "server.ts não pode conter chave Gemini hardcoded.",
    );
  });

  it("3. relatorioDiarioMetricasService.ts não deve conter service_role key hardcoded", () => {
    const servicePath = path.join(
      root,
      "src/features/relatorios/services/relatorioDiarioMetricasService.ts",
    );
    const content = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      !content.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
      "relatorioDiarioMetricasService.ts não pode conter token JWT hardcoded.",
    );
  });

  it("4. VehicleTelemetryDrawer.tsx não deve expor porta 7002 ou URL de gateway na interface", () => {
    const drawerPath = path.join(
      root,
      "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
    );
    const content = fs.readFileSync(drawerPath, "utf-8");

    // Proíbe exposição de portas internas e URLs do servidor na tela
    assert.ok(
      !content.includes("Porta 7002"),
      "VehicleTelemetryDrawer.tsx não deve exibir 'Porta 7002' em tela.",
    );
    assert.ok(
      !content.includes("gps.sigoguardiao.oficial.tec.br") &&
        !content.includes("gps.oficial.tec.br"),
      "VehicleTelemetryDrawer.tsx não deve expor URL interna do gateway no cockpit.",
    );
    assert.ok(
      content.includes("Conexão Segura Criptografada • Telemetria Ativa"),
      "VehicleTelemetryDrawer.tsx deve exibir selo de Conexão Segura Criptografada.",
    );
  });

  it("5. Veículo Drawer deve blindar clientes contra comandos MCU e poluição de diagnósticos", () => {
    const drawerPath = path.join(
      root,
      "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
    );
    const content = fs.readFileSync(drawerPath, "utf-8");

    // Verifica que clientes recebem o card oficial limpo
    assert.ok(
      content.includes("if (!isEquipeTecnica)"),
      "Deve haver separação entre visualização de cliente e equipe técnica.",
    );
    assert.ok(
      content.includes("ODÔMETRO ACUMULADO"),
      "Cliente deve ver o Odômetro Acumulado Oficial.",
    );
  });

  it("6. .env.production não deve vazar chave secreta de IA Gemini", () => {
    const envProdPath = path.join(root, ".env.production");
    if (fs.existsSync(envProdPath)) {
      const content = fs.readFileSync(envProdPath, "utf-8");
      assert.ok(
        !content.includes("VITE_GEMINI_API_KEY"),
        ".env.production não pode conter VITE_GEMINI_API_KEY pública.",
      );
    }
  });
});
