const fs = require("fs");
const path = require("path");
const PNG = require("pngjs").PNG;

// Função para aplicar blur cirúrgico em regiões
function applyBlur(png, x, y, width, height, radius = 6) {
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

// Converte imagem escura para modo claro com alto contraste e nitidez
function convertToLightMode(png) {
  const data = png.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Se o fundo for muito escuro (dark mode), converte para tons de cinza claro / branco
    const brightness = (r + g + b) / 3;
    if (brightness < 60) {
      // Fundo escuro -> Fundo claro (off-white / slate-50)
      const lightVal = 245 + Math.round((brightness / 60) * 10);
      data[i] = lightVal;
      data[i + 1] = lightVal;
      data[i + 2] = Math.min(255, lightVal + 3);
    } else if (brightness > 180) {
      // Texto branco/claro no dark mode -> Texto escuro no light mode (slate-900)
      data[i] = 20;
      data[i + 1] = 25;
      data[i + 2] = 35;
    } else {
      // Cores intermediárias (badges, botões azuis, verdes, amarelos)
      // Ajusta saturação e contraste para combinar com o tema claro
      data[i] = Math.min(255, Math.round(r * 0.9));
      data[i + 1] = Math.min(255, Math.round(g * 0.9));
      data[i + 2] = Math.min(255, Math.round(b * 0.9));
    }
  }
}

// Processamento de todas as 44 capturas
const capturasDir = path.join(process.cwd(), "public/capturas");

function processAllCapturas(dir) {
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      processAllCapturas(fullPath);
    } else if (item.endsWith(".png")) {
      const fileData = fs.readFileSync(fullPath);
      const png = PNG.sync.read(fileData);

      // Converte para Modo Claro
      convertToLightMode(png);

      // Aplica blur cirúrgico padrão em áreas centrais de tabelas / nomes / RGs
      applyBlur(png, 400, 220, 480, 520, 8);

      const outBuffer = PNG.sync.write(png);
      fs.writeFileSync(fullPath, outBuffer);
      console.log(
        `Processada captura em Modo Claro com Blur Cirúrgico: ${path.relative(process.cwd(), fullPath)}`,
      );
    }
  }
}

processAllCapturas(capturasDir);
console.log("Todas as capturas foram convertidas para Modo Claro com blur cirúrgico.");
