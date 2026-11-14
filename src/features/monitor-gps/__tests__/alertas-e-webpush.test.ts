import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("GD Rastreamento — Alertas Flutuantes, Deduplicação e Web Push em Segundo Plano", () => {
  it("1. O banner de alerta deve possuir posicionamento flutuante desvinculado do canvas do mapa", () => {
    const bannerPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/AlertasAcidenteBanner.tsx",
    );
    const content = fs.readFileSync(bannerPath, "utf-8");

    // Deve possuir classe flutuante fixed e alto z-index
    assert.match(
      content,
      /fixed top-20 right-3 sm:right-6 z-40/,
      "Banner deve ser posicionado com fixed top-20 e z-40",
    );
    // Deve possuir suporte a expandir/recolher
    assert.match(content, /expandido \? "Recolher" : "Expandir"/);
    // Deve renderizar modal via createPortal para document.body
    assert.match(content, /createPortal/);
    assert.match(content, /document\.body/);
  });

  it("2. O Service Worker oficial deve escutar os eventos push e notificationclick nativos", () => {
    const swPath = path.resolve(process.cwd(), "public/sw.js");
    const content = fs.readFileSync(swPath, "utf-8");

    assert.match(content, /self\.addEventListener\("push"/);
    assert.match(content, /self\.registration\.showNotification/);
    assert.match(content, /self\.addEventListener\("notificationclick"/);
    assert.match(content, /clients\.openWindow/);
  });

  it("3. O endpoint de Digital Asset Links para Android TWA deve existir e estar formatado", () => {
    const assetlinksPath = path.resolve(process.cwd(), "public/.well-known/assetlinks.json");
    const content = fs.readFileSync(assetlinksPath, "utf-8");
    const json = JSON.parse(content);

    assert.ok(Array.isArray(json), "assetlinks deve ser um array JSON");
    assert.equal(json[0].target.package_name, "br.tec.oficial.sigoguardiao");
    assert.ok(
      json[0].target.sha256_cert_fingerprints.length > 0,
      "Deve possuir impressões digitais SHA-256",
    );
  });

  it("4. O servidor HTTP deve interceptar /.well-known/assetlinks.json e /sw.js", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    assert.match(content, /\/\.well-known\/assetlinks\.json/);
    assert.match(content, /\/sw\.js/);
    assert.match(content, /handleStaticPwaAssets/);
  });

  it("5. Ausência estrita do caractere comercial proibido em textos de interface e componentes", () => {
    const bannerPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/AlertasAcidenteBanner.tsx",
    );
    const content = fs.readFileSync(bannerPath, "utf-8");
    // Proíbe & comercial em textos de interface (exceto && lógico do JavaScript)
    const linhasComTexto = content
      .split("\n")
      .filter((l) => !l.includes("&&") && !l.includes("&amp;"));
    for (const linha of linhasComTexto) {
      assert.doesNotMatch(linha, /\s&\s/, `Linha contém o caractere comercial proibido: ${linha}`);
    }
  });
});
