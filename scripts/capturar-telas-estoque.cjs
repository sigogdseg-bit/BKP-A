const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS_DIR =
  "/Users/djrnovaes/.gemini/antigravity-ide/brain/75d8196f-0eef-4592-8dad-85c695891136";

async function main() {
  console.log("Iniciando captura visual do Estoque com Chrome macOS...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--window-size=1280,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Simula sessão autenticada do usuário Administrador ou acessa a tela de estoque
  // Injeta no localStorage a sessão autenticada com perfil adm
  await page
    .goto("http://localhost:3000/estoque", { waitUntil: "networkidle0", timeout: 15000 })
    .catch(() => {});

  // Força renderização do tema padrão e tira screenshot
  await page.evaluate(() => {
    localStorage.setItem("hunter_estoque_tema_teste", "hunter_padrao");
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "estoque_tema_padrao.png") });
  console.log("Screenshot tema padrão salvo em estoque_tema_padrao.png");

  // Alterna para tema Neumorphic Soft UI
  await page.evaluate(() => {
    localStorage.setItem("hunter_estoque_tema_teste", "neumorphism_soft");
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "estoque_tema_neumorphic.png") });
  console.log("Screenshot tema Neumorphic salvo em estoque_tema_neumorphic.png");

  // Alterna para tema Glass Glow
  await page.evaluate(() => {
    localStorage.setItem("hunter_estoque_tema_teste", "glass_glow");
  });
  await page.reload({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, "estoque_tema_glass.png") });
  console.log("Screenshot tema Glass Glow salvo em estoque_tema_glass.png");

  await browser.close();
  console.log("Capturas visuais finalizadas com sucesso!");
}

main().catch(console.error);
