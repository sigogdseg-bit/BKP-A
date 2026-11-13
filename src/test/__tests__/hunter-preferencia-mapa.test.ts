import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MAP_THEME_STORAGE_KEY,
  MAP_THEME_DEFAULT,
} from "../../features/monitor-gps/context/MapThemeContext";

describe("Hunter — Persistência Universal do Tema de Mapa (DJR-NEW / HUNTER-GUARDIAN)", () => {
  it("1. Padrão canônico do sistema em geral deve ser estritamente Mapa Claro (streets)", () => {
    assert.equal(
      MAP_THEME_DEFAULT,
      "streets",
      "O padrão do sistema Hunter deve ser estritamente 'streets' (Mapa Claro).",
    );
    assert.equal(
      MAP_THEME_STORAGE_KEY,
      "hunter-map-theme-preference",
      "Chave de armazenamento local deve seguir a convenção oficial do Hunter.",
    );
  });

  it("2. Migration SQL deve criar coluna map_theme_preference com padrão 'streets' e RPC segura", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20260921223000_hunter_preferencia_tema_mapa.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração deve existir no repositório.");

    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sqlContent.includes(
        "ADD COLUMN IF NOT EXISTS map_theme_preference TEXT NOT NULL DEFAULT 'streets'",
      ),
      "Migration deve criar a coluna com NOT NULL DEFAULT 'streets'.",
    );
    assert.ok(
      sqlContent.includes("CREATE OR REPLACE FUNCTION public.salvar_preferencia_mapa"),
      "Migration deve disponibilizar a função RPC salvar_preferencia_mapa.",
    );
    assert.ok(
      sqlContent.includes("WHERE id = auth.uid()"),
      "A função RPC deve blindar o update estritamente para o auth.uid() do usuário autenticado.",
    );
    assert.ok(
      sqlContent.includes("p_mapa IN ('streets', 'dark', 'satellite')"),
      "A função RPC deve validar os valores permitidos para o tema de mapa.",
    );
  });

  it("3. Sessão do usuário deve carregar e expor mapThemePreference", () => {
    const authServicePath = path.resolve(
      process.cwd(),
      "src/features/auth/services/authService.ts",
    );
    const authServiceContent = fs.readFileSync(authServicePath, "utf-8");

    assert.ok(
      authServiceContent.includes("map_theme_preference"),
      "authService.ts deve buscar map_theme_preference na tabela profiles.",
    );
    assert.ok(
      authServiceContent.includes("mapThemePreference:"),
      "authService.ts deve preencher a propriedade mapThemePreference da sessão.",
    );
  });

  it("4. Monitor GPS e Modal Refazer Trajeto devem utilizar useMapTheme de forma reativa", () => {
    const gpsMonitorPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const gpsContent = fs.readFileSync(gpsMonitorPath, "utf-8");

    assert.ok(
      gpsContent.includes("useMapTheme"),
      "GpsMonitorView.tsx deve consumir useMapTheme para manter a escolha sincronizada.",
    );

    const refazerTrajetoPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
    );
    const refazerContent = fs.readFileSync(refazerTrajetoPath, "utf-8");

    assert.ok(
      refazerContent.includes("useMapTheme"),
      "RefazerTrajetoModal.tsx deve consumir useMapTheme para sincronizar o mapa.",
    );
  });

  it("5. Regra Pétrea Hunter: Proibição de referências a outros sistemas e ausência do caractere proibido", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20260921223000_hunter_preferencia_tema_mapa.sql",
    );
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      !sqlContent.includes("SIGOVTR") && !sqlContent.includes("SIGOFROTA"),
      "A migração não deve conter referências a outros sistemas.",
    );

    const mapContextPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/context/MapThemeContext.tsx",
    );
    const contextContent = fs.readFileSync(mapContextPath, "utf-8");

    assert.ok(
      !contextContent.includes("SIGOVTR") && !contextContent.includes("SIGOFROTA"),
      "MapThemeContext.tsx não deve conter referências a outros sistemas.",
    );
  });
});
