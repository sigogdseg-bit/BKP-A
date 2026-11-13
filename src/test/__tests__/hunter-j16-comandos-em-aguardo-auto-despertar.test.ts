import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

describe("Hunter J16 — Comandos em Aguardo, Probe Ativo 15s e Fila Sequencial", () => {
  const servicePath = resolve(
    process.cwd(),
    "src/features/seguranca/services/comandosEmAguardoService.ts",
  );
  const bannerPath = resolve(
    process.cwd(),
    "src/features/seguranca/components/BannerComandosAguardoGlobal.tsx",
  );
  const viewPath = resolve(
    process.cwd(),
    "src/features/seguranca/components/RastreadorJ16View.tsx",
  );
  const modalPath = resolve(
    process.cwd(),
    "src/features/seguranca/components/ModalConfiguracaoCanaisAlerta.tsx",
  );
  const serverPath = resolve(process.cwd(), "src/server.ts");

  it("1. O serviço de comandos em aguardo deve implementar fila sequencial e disparo imediato do próximo comando", () => {
    assert.strictEqual(existsSync(servicePath), true);
    const content = readFileSync(servicePath, "utf-8");

    // Estados suportados
    assert.match(content, /"aguardando" \| "transmitindo" \| "aguardando_retorno" \| "concluido"/);

    // Fila sequencial (não descarta comandos anteriores do mesmo IMEI)
    assert.match(content, /fila_sequencial_j16_acordado/);
    assert.match(content, /Fila sequencial/);

    // Probe ativo a cada 15 segundos
    assert.match(content, /probe_ativo_15s/);
    assert.match(content, /segundosAteProximoProbe/);

    // Normalização Claro e roteamento exclusivo via proxy autenticado /api/alerta/ligacao (zero webhook direto no client)
    assert.match(content, /normalizarNumeroDiscadorClaro/);
    assert.match(content, /\/api\/alerta\/ligacao/);
    assert.doesNotMatch(content, /trigger\.macrodroid\.com/);

    // Alertas exclusivos para comandos agendados em aguardo
    assert.match(content, /if \(!tevePendente\) return false;/);
  });

  it("2. server.ts deve implementar a rota POST /api/alerta/ligacao conectada ao MacroDroid com liberacao no roteador e CSP", () => {
    assert.strictEqual(existsSync(serverPath), true);
    const serverContent = readFileSync(serverPath, "utf-8");

    assert.match(serverContent, /\/api\/alerta\/ligacao/);
    assert.match(serverContent, /dispararLigacaoMacroDroid/);
    assert.match(serverContent, /url\.pathname !== "\/api\/alerta\/ligacao"/);
    assert.match(serverContent, /trigger\.macrodroid\.com/);
    assert.match(serverContent, /forcarSemDedup/);
  });

  it("3. RastreadorJ16View e Banner devem renderizar ModalConfiguracaoCanaisAlerta com botões de teste", () => {
    assert.strictEqual(existsSync(modalPath), true);
    const modalContent = readFileSync(modalPath, "utf-8");
    assert.match(modalContent, /Testar Envio WhatsApp/);
    assert.match(modalContent, /Testar Ligação/);
    assert.match(modalContent, /\/api\/alerta\/ligacao/);
    assert.doesNotMatch(modalContent, /trigger\.macrodroid\.com/);

    const viewContent = readFileSync(viewPath, "utf-8");
    assert.match(viewContent, /ModalConfiguracaoCanaisAlerta/);
    assert.match(viewContent, /modalConfigurarCanaisAberto/);

    const bannerContent = readFileSync(bannerPath, "utf-8");
    assert.match(bannerContent, /ModalConfiguracaoCanaisAlerta/);
  });

  it("4. Regra Pétrea 5: Ausência estrita do caractere comercial proibido nos novos arquivos", () => {
    const arquivos = [servicePath, bannerPath, modalPath];
    for (const arq of arquivos) {
      const linhas = readFileSync(arq, "utf-8").split("\n");
      linhas.forEach((linha, idx) => {
        // Ignora operadores lógicos (&&), comentários normais, URLs ou HTML entities
        const semOperador = linha
          .replace(/&&/g, "")
          .replace(/&quot;/g, "")
          .replace(/&amp;/g, "")
          .replace(/&numero=/g, "")
          .replace(/&tentativa=/g, "")
          .replace(/&t=/g, "")
          .replace(/\/\/.*$/, "");
        assert.doesNotMatch(
          semOperador,
          /[^a-zA-Z0-9_]&[^a-zA-Z0-9_]/,
          `Caractere proibido encontrado no arquivo ${arq} na linha ${idx + 1}: "${linha}"`,
        );
      });
    }
  });
});
