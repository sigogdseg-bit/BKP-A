const fs = require("fs");
const path = require("path");
const PNG = require("pngjs").PNG;

function applyBoxBlur(png, x, y, width, height, radius = 6) {
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  width = Math.min(png.width - x, Math.floor(width));
  height = Math.min(png.height - y, Math.floor(height));

  const data = png.data;
  const copy = Buffer.from(data);

  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      let r = 0,
        g = 0,
        b = 0,
        count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(Math.max(px + dx, 0), png.width - 1);
          const ny = Math.min(Math.max(py + dy, 0), png.height - 1);
          const idx = (ny * png.width + nx) * 4;
          r += copy[idx];
          g += copy[idx + 1];
          b += copy[idx + 2];
          count++;
        }
      }
      const targetIdx = (py * png.width + px) * 4;
      data[targetIdx] = Math.round(r / count);
      data[targetIdx + 1] = Math.round(g / count);
      data[targetIdx + 2] = Math.round(b / count);
    }
  }
}

function processImage(filePath, regions) {
  if (!fs.existsSync(filePath)) {
    console.log("Arquivo não encontrado:", filePath);
    return;
  }
  const fileData = fs.readFileSync(filePath);
  const png = PNG.sync.read(fileData);

  for (const reg of regions) {
    applyBoxBlur(png, reg.x, reg.y, reg.w, reg.h, reg.r || 7);
  }

  const outputBuffer = PNG.sync.write(png);
  fs.writeFileSync(filePath, outputBuffer);
  console.log(`Aplicado blur cirúrgico em ${regions.length} regiões: ${filePath}`);
}

// 1. Checklist - Formulário
processImage(
  path.join(__dirname, "../public/capturas/17_Checklist/01_01_formulario_checklist.png"),
  [
    { x: 380, y: 310, w: 280, h: 32 }, // Nome Motorista
    { x: 680, y: 310, w: 160, h: 32 }, // RG Motorista
    { x: 380, y: 370, w: 280, h: 32 }, // Nome Encarregado
    { x: 680, y: 370, w: 160, h: 32 }, // RG Encarregado
    { x: 860, y: 310, w: 180, h: 32 }, // Telefone se houver
  ],
);

// 2. Checklist - Histórico
processImage(path.join(__dirname, "../public/capturas/17_Checklist/02_02_historico_sessoes.png"), [
  { x: 420, y: 270, w: 320, h: 26 }, // Linha 1 Guarnição / RG
  { x: 420, y: 310, w: 320, h: 26 }, // Linha 2
  { x: 420, y: 350, w: 320, h: 26 }, // Linha 3
  { x: 420, y: 390, w: 320, h: 26 }, // Linha 4
  { x: 420, y: 430, w: 320, h: 26 }, // Linha 5
  { x: 420, y: 470, w: 320, h: 26 }, // Linha 6
  { x: 420, y: 510, w: 320, h: 26 }, // Linha 7
  { x: 420, y: 550, w: 320, h: 26 }, // Linha 8
  { x: 420, y: 590, w: 320, h: 26 }, // Linha 9
  { x: 420, y: 630, w: 320, h: 26 }, // Linha 10
]);

// 3. Deslocamento - Painel
processImage(
  path.join(__dirname, "../public/capturas/18_Deslocamento/01_01_painel_deslocamentos.png"),
  [
    { x: 400, y: 280, w: 300, h: 32 }, // Nome Motorista
    { x: 720, y: 280, w: 160, h: 32 }, // RG Motorista
    { x: 400, y: 330, w: 300, h: 32 }, // Nome Encarregado
    { x: 720, y: 330, w: 160, h: 32 }, // RG Encarregado
    { x: 400, y: 380, w: 480, h: 32 }, // Patrulheiros
  ],
);

// 4. Deslocamento - Mapa Circulação
processImage(path.join(__dirname, "../public/capturas/18_Deslocamento/02_02_mapa_circulacao.png"), [
  { x: 450, y: 250, w: 340, h: 26 }, // Linha 1 Guarnição
  { x: 450, y: 290, w: 340, h: 26 }, // Linha 2
  { x: 450, y: 330, w: 340, h: 26 }, // Linha 3
  { x: 450, y: 370, w: 340, h: 26 }, // Linha 4
  { x: 450, y: 410, w: 340, h: 26 }, // Linha 5
  { x: 450, y: 450, w: 340, h: 26 }, // Linha 6
  { x: 450, y: 490, w: 340, h: 26 }, // Linha 7
  { x: 450, y: 530, w: 340, h: 26 }, // Linha 8
]);
