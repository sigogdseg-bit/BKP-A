import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  aplicarPreferenciasLocais,
  type UserPreferences,
} from "@/shared/lib/userPreferencesService";

describe("Hunter — Preferências de Mapa e Painel Multi-Dispositivo Salvas em BD", () => {
  const root = process.cwd();
  const servicePath = path.join(root, "src/shared/lib/userPreferencesService.ts");
  const configViewPath = path.join(root, "src/features/configuracoes/ConfiguracoesView.tsx");
  const authServicePath = path.join(root, "src/features/auth/services/authService.ts");
  const authContextPath = path.join(root, "src/features/auth/context/AuthContext.tsx");
  const cardThemePath = path.join(root, "src/shared/lib/card-theme.ts");
  const migrationPath = path.join(
    root,
    "supabase/migrations/20261021115500_hunter_preferencias_usuario_multi_device.sql",
  );

  it("1. userPreferencesService.ts deve existir e exportar funções canônicas", () => {
    assert.ok(fs.existsSync(servicePath), "userPreferencesService.ts deve existir");
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      code.includes("aplicarPreferenciasLocais"),
      "Deve exportar aplicarPreferenciasLocais",
    );
    assert.ok(code.includes("salvarPreferenciaUsuario"), "Deve exportar salvarPreferenciaUsuario");
    assert.ok(
      code.includes("carregarPreferenciasDoBanco"),
      "Deve exportar carregarPreferenciasDoBanco",
    );
  });

  it("2. aplicarPreferenciasLocais deve persistir no localStorage e disparar evento do mapa", () => {
    let eventoDisparado = false;
    const mockHandler = () => {
      eventoDisparado = true;
    };

    if (typeof window !== "undefined") {
      window.addEventListener("hunter_preferencia_mapa_alterada", mockHandler);
    }

    const mockPrefs: UserPreferences = {
      icone_mapa_pin: true,
      modo_placa_mapa: "sem_placa",
      theme_preference: "dark",
    };

    aplicarPreferenciasLocais(mockPrefs, "user-teste-1");

    if (typeof window !== "undefined") {
      assert.strictEqual(
        window.localStorage.getItem("@hunter_icone_mapa_generico"),
        "true",
        "Deve persistir @hunter_icone_mapa_generico como 'true'",
      );
      assert.strictEqual(
        window.localStorage.getItem("@hunter_modo_placa_mapa"),
        "sem_placa",
        "Deve persistir @hunter_modo_placa_mapa como 'sem_placa'",
      );
      assert.ok(eventoDisparado, "Deve ter disparado hunter_preferencia_mapa_alterada");
      window.removeEventListener("hunter_preferencia_mapa_alterada", mockHandler);
    }
  });

  it("3. ConfiguracoesView.tsx deve invocar salvarPreferenciaUsuario ao alterar ícone do mapa e modo da placa", () => {
    const code = fs.readFileSync(configViewPath, "utf-8");

    assert.ok(
      code.includes("salvarPreferenciaUsuario({ icone_mapa_pin: val }"),
      "handleSetIconeGenerico deve persistir icone_mapa_pin no banco",
    );
    assert.ok(
      code.includes("salvarPreferenciaUsuario({ modo_placa_mapa: val }"),
      "handleSetModoPlaca deve persistir modo_placa_mapa no banco",
    );
    assert.ok(
      code.includes("carregarPreferenciasDoBanco(session.userId)"),
      "Deve carregar preferências frescas do banco ao montar a tela de configurações",
    );
  });

  it("4. authService.ts e AuthContext.tsx devem sincronizar preferências do banco no login e na sessão", () => {
    const authServiceCode = fs.readFileSync(authServicePath, "utf-8");
    const authContextCode = fs.readFileSync(authContextPath, "utf-8");

    assert.ok(
      authServiceCode.includes("icone_mapa_pin") && authServiceCode.includes("modo_placa_mapa"),
      "authService.ts deve consultar colunas icone_mapa_pin e modo_placa_mapa de profiles",
    );
    assert.ok(
      authServiceCode.includes("aplicarPreferenciasLocais"),
      "authService.ts deve chamar aplicarPreferenciasLocais para disponibilização imediata",
    );
    assert.ok(
      authContextCode.includes("carregarPreferenciasDoBanco"),
      "AuthContext.tsx deve invocar carregarPreferenciasDoBanco",
    );
  });

  it("5. card-theme.ts deve sincronizar com salvar_preferencias_usuario e consultar profiles", () => {
    const code = fs.readFileSync(cardThemePath, "utf-8");

    assert.ok(
      code.includes("salvar_preferencias_usuario"),
      "saveCardThemeConfig deve chamar salvar_preferencias_usuario",
    );
    assert.ok(
      code.includes('select("card_theme_preference")'),
      "useCardTheme deve buscar card_theme_preference de profiles no Supabase",
    );
  });

  it("6. Migração SQL deve conter as colunas canônicas e recarregar o schema cache", () => {
    assert.ok(fs.existsSync(migrationPath), "Migração SQL deve existir");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("icone_mapa_pin BOOLEAN NOT NULL DEFAULT FALSE"),
      "Deve adicionar coluna icone_mapa_pin",
    );
    assert.ok(
      sql.includes("modo_placa_mapa TEXT NOT NULL DEFAULT 'auto'"),
      "Deve adicionar coluna modo_placa_mapa",
    );
    assert.ok(
      sql.includes("salvar_preferencias_usuario"),
      "Deve criar a RPC salvar_preferencias_usuario",
    );
    assert.ok(
      sql.includes("obter_preferencias_usuario"),
      "Deve criar a RPC obter_preferencias_usuario",
    );
    assert.ok(
      sql.includes("NOTIFY pgrst, 'reload schema';"),
      "Deve invalidar o schema cache com NOTIFY pgrst",
    );
  });

  it("7. Regra Pétrea: Ausência do caractere comercial proibido em userPreferencesService.ts", () => {
    const code = fs.readFileSync(servicePath, "utf-8");
    const lines = code.split("\n");

    const forbiddenCharPattern = /&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-f\d]+;|\s*&))/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("&&") || line.includes("//") || line.includes("/*")) {
        continue;
      }
      if (forbiddenCharPattern.test(line)) {
        assert.fail(
          `Caractere comercial proibido encontrado na linha ${i + 1} de userPreferencesService.ts: ${line}`,
        );
      }
    }
  });
});
