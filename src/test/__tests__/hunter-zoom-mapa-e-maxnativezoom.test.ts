import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

function lerArquivo(relPath: string): string {
  const fullPath = path.resolve(process.cwd(), relPath);
  return fs.readFileSync(fullPath, "utf-8");
}

describe("Hunter — Blindagem de Zoom Alto nos Mapas (Prevenção de Tela Cinza)", () => {
  test("1. LeafletEngine.tsx deve configurar maxNativeZoom: 19 e maxZoom: 21 para streets e dark", () => {
    const code = lerArquivo("src/features/monitor-gps/components/LeafletEngine.tsx");

    assert.ok(
      code.includes("maxNativeZoom: 19"),
      "LeafletEngine deve possuir maxNativeZoom: 19 para permitir overzoom sem tela cinza",
    );
    assert.ok(code.includes("maxZoom: 21"), "LeafletEngine deve possuir maxZoom: 21 sincronizado");
  });

  test("2. RefazerTrajetoModal.tsx deve suportar maxNativeZoom: 19 e maxZoom: 21 na camada padrão", () => {
    const code = lerArquivo("src/features/monitor-gps/components/RefazerTrajetoModal.tsx");

    assert.ok(
      code.includes("maxNativeZoom: 19"),
      "RefazerTrajetoModal deve possuir maxNativeZoom: 19 na camada padrão",
    );
  });

  test("3. TrajetoInteligenteModal e TrajetoVisualizadoModal devem possuir maxNativeZoom", () => {
    const codeInteligente = lerArquivo(
      "src/features/monitor-gps/components/TrajetoInteligenteModal.tsx",
    );
    const codeVisualizado = lerArquivo(
      "src/features/monitor-gps/components/TrajetoVisualizadoModal.tsx",
    );

    assert.ok(
      codeInteligente.includes("maxNativeZoom: 19"),
      "TrajetoInteligenteModal deve possuir maxNativeZoom: 19",
    );
    assert.ok(
      codeVisualizado.includes("maxNativeZoom: 19"),
      "TrajetoVisualizadoModal deve possuir maxNativeZoom: 19",
    );
  });

  test("4. compartilhar.$token.tsx deve possuir maxNativeZoom: 19 e maxZoom: 21", () => {
    const codePublico = lerArquivo("src/routes/compartilhar.$token.tsx");

    assert.ok(
      codePublico.includes("maxNativeZoom: 19"),
      "Mapa público deve possuir maxNativeZoom: 19",
    );
    assert.ok(codePublico.includes("maxZoom: 21"), "Mapa público deve possuir maxZoom: 21");
  });
});
