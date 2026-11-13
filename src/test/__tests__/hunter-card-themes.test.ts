import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CARD_THEME_CONFIG,
  CARD_COLOR_OPTIONS,
  getCardThemeStorageKey,
  type CardThemeConfig,
} from "../../shared/lib/card-theme";
import {
  resolverTemaCardComConfig,
  CARD_COLOR_PALETTES,
} from "../../shared/components/hub-module-theme";

describe("Hunter — Sistema de Temas e Dinâmica de Cards Hunter", () => {
  test("Configuração padrão e opções de cores dos cards Hunter", () => {
    assert.equal(DEFAULT_CARD_THEME_CONFIG.variant, "neumorphic");
    assert.equal(DEFAULT_CARD_THEME_CONFIG.mode, "duo");
    assert.equal(DEFAULT_CARD_THEME_CONFIG.monoColor, "cyan");
    assert.deepEqual(DEFAULT_CARD_THEME_CONFIG.duoColors, ["cyan", "green"]);
    assert.deepEqual(DEFAULT_CARD_THEME_CONFIG.trioColors, ["cyan", "green", "blue"]);
    assert.deepEqual(DEFAULT_CARD_THEME_CONFIG.quadColors, ["cyan", "green", "blue", "orange"]);

    assert.equal(CARD_COLOR_OPTIONS.length, 8);
    const chaves = CARD_COLOR_OPTIONS.map((c) => c.key);
    assert.deepEqual(chaves, ["blue", "orange", "red", "green", "purple", "cyan", "amber", "pink"]);
  });

  test("Padrão do sistema para usuário novo é Modo Duas Cores (Ciano Ártico e Verde Esmeralda)", () => {
    const c0 = resolverTemaCardComConfig("/modulo1", "Mod 1", DEFAULT_CARD_THEME_CONFIG, 0);
    const c1 = resolverTemaCardComConfig("/modulo2", "Mod 2", DEFAULT_CARD_THEME_CONFIG, 1);
    const c2 = resolverTemaCardComConfig("/modulo3", "Mod 3", DEFAULT_CARD_THEME_CONFIG, 2);

    assert.equal(c0.glowRgb, CARD_COLOR_PALETTES.cyan.glowRgb);
    assert.equal(c1.glowRgb, CARD_COLOR_PALETTES.green.glowRgb);
    assert.equal(c2.glowRgb, CARD_COLOR_PALETTES.cyan.glowRgb);
  });

  test("Chave de armazenamento é isolada por usuário", () => {
    const keyUser = getCardThemeStorageKey("usr-uuid-1234");
    assert.equal(keyUser, "hunter-card-theme:usr-uuid-1234");

    const keyAnon = getCardThemeStorageKey(null);
    assert.equal(keyAnon, "hunter-card-theme-config");
  });

  test("Modo Multicor (Color) aplica temas ricos específicos de cada módulo", () => {
    const configColor: CardThemeConfig = {
      ...DEFAULT_CARD_THEME_CONFIG,
      mode: "color",
    };
    const temaAtendimento = resolverTemaCardComConfig(
      "/atendimento",
      "Atendimento ao Cliente",
      configColor,
      0,
    );
    assert.equal(temaAtendimento.glowRgb, "16, 185, 129"); // Esmeralda

    const temaSeguranca = resolverTemaCardComConfig(
      "/configuracao/central-seguranca",
      "Central de Segurança",
      configColor,
      1,
    );
    assert.equal(temaSeguranca.glowRgb, "220, 38, 38"); // Vermelho Rubi
  });

  test("Modo Monocromático (Mono) unifica a cor em todos os cards", () => {
    const configMono: CardThemeConfig = {
      ...DEFAULT_CARD_THEME_CONFIG,
      mode: "mono",
      monoColor: "purple",
    };

    const tema1 = resolverTemaCardComConfig("/inicio", "Card 1", configMono, 0);
    const tema2 = resolverTemaCardComConfig("/monitor-gps", "Card 2", configMono, 1);

    assert.equal(tema1.glowRgb, CARD_COLOR_PALETTES.purple.glowRgb);
    assert.equal(tema2.glowRgb, CARD_COLOR_PALETTES.purple.glowRgb);
  });

  test("Modo Duo e Trio alternam ciclicamente entre as cores configuradas", () => {
    const configDuo: CardThemeConfig = {
      ...DEFAULT_CARD_THEME_CONFIG,
      mode: "duo",
      duoColors: ["cyan", "amber"],
    };

    const c0 = resolverTemaCardComConfig("/modulo1", "Mod 1", configDuo, 0);
    const c1 = resolverTemaCardComConfig("/modulo2", "Mod 2", configDuo, 1);
    const c2 = resolverTemaCardComConfig("/modulo3", "Mod 3", configDuo, 2);

    assert.equal(c0.glowRgb, CARD_COLOR_PALETTES.cyan.glowRgb);
    assert.equal(c1.glowRgb, CARD_COLOR_PALETTES.amber.glowRgb);
    assert.equal(c2.glowRgb, CARD_COLOR_PALETTES.cyan.glowRgb);
  });
});
