// ============================================================================
// HUNTER — SERVIÇO DE OCR DE NOTA FISCAL, CUPOM FISCAL E COMPROVANTES (IA e PDF)
// Suporta leitura nativa de PDFs (NFC-e / DANFE) e fotos de celular via Gemini 3.5 Flash
// Diretrizes: HUNTER-GUARDIAN / DJR-NEW · Anti-Mock · Zero Binário no BD
// ============================================================================

export interface OcrNfResultado {
  data?: string | null;
  hora?: string | null;
  valor_total?: number | null;
  litros?: number | null;
  valor_por_litro?: number | null;
  combustivel?: string | null;
  posto_nome?: string | null;
  posto_cidade?: string | null;
  nf_numero?: string | null;
  forma_pagamento?: string | null;
  categoria?: string | null;
  descricao_itens?: string | null;
}

/**
 * Converte um arquivo (File) para string Base64 limpa.
 * Em imagens de celulares (que podem ter 5-15MB e formatos como HEIC),
 * comprime e redimensiona via Canvas para max 1600px a 0.85 JPEG em milissegundos,
 * garantindo envio leve e processamento imediato pela IA sem estourar quotas.
 */
async function fileParaBase64Otimizado(file: File): Promise<{ base64: string; mimeType: string }> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve({ base64: result.split(",")[1], mimeType: "application/pdf" });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // Tratamento de imagem: decodificação universal e compressão JPEG
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1600;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return resolve({ base64: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg" });
          }
          ctx.drawImage(img, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve({ base64: compressedDataUrl.split(",")[1], mimeType: "image/jpeg" });
        } catch {
          resolve({ base64: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg" });
        }
      };
      img.onerror = () => {
        resolve({ base64: dataUrl.split(",")[1], mimeType: file.type || "image/jpeg" });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      resolve({ base64: "", mimeType: "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Tenta extrair dados estruturados a partir do texto nativo de um PDF de NFC-e / Danfe
 */
function parseTextoNfe(texto: string): Partial<OcrNfResultado> {
  const res: Partial<OcrNfResultado> = {};

  // Data (DD/MM/YYYY)
  const matchData = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (matchData) {
    res.data = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
  }

  // Hora (HH:MM:SS ou HH:MM)
  const matchHora = texto.match(/(\d{2}):(\d{2})(?::\d{2})?/);
  if (matchHora) {
    res.hora = `${matchHora[1]}:${matchHora[2]}`;
  }

  // Valor Total R$
  const matchTotal =
    texto.match(
      /(?:VALOR\s*(?:TOTAL|A\s*PAGAR|LIQUIDO)?|TOTAL\s*R\$|VLR\s*TOTAL)[\s:]*R?\$?\s*([0-9.,]+)/i,
    ) || texto.match(/R\$\s*([0-9]+[.,][0-9]{2})/);
  if (matchTotal) {
    const rawVal = matchTotal[1].replace(/\./g, "").replace(",", ".");
    const num = parseFloat(rawVal);
    if (!isNaN(num) && num > 0) res.valor_total = num;
  }

  // Litros / Quantidade (ex: 54,870 L ou QTD: 54,87)
  const matchLitros =
    texto.match(/(?:QTD|QUANTIDADE|VOLUME)[\s.:]*([0-9.,]+)\s*(?:L|LT|LTS|LITROS)?/i) ||
    texto.match(/([0-9]+[.,][0-9]{2,3})\s*(?:L|LT|LTS|LITROS)/i);
  if (matchLitros) {
    const rawL = matchLitros[1].replace(/\./g, "").replace(",", ".");
    const numL = parseFloat(rawL);
    if (!isNaN(numL) && numL > 0) res.litros = numL;
  }

  // Valor por litro
  const matchPrecoUnit = texto.match(
    /(?:VLR?\s*(?:UNIT|UNITARIO)|PRECO\s*LITRO|UN)[\s.:]*R?\$?\s*([0-9.,]+)/i,
  );
  if (matchPrecoUnit) {
    const rawP = matchPrecoUnit[1].replace(/\./g, "").replace(",", ".");
    const numP = parseFloat(rawP);
    if (!isNaN(numP) && numP > 0) res.valor_por_litro = numP;
  }

  // Combustível
  const upper = texto.toUpperCase();
  if (
    upper.includes("GASOLINA ADIT") ||
    upper.includes("GAS ADIT") ||
    upper.includes("V-POWER") ||
    upper.includes("GRID")
  ) {
    res.combustivel = "gasolina_aditivada";
  } else if (upper.includes("GASOLINA")) {
    res.combustivel = "gasolina";
  } else if (upper.includes("ETANOL") || upper.includes("ALCOOL")) {
    res.combustivel = "etanol";
  } else if (upper.includes("DIESEL S10") || upper.includes("S-10") || upper.includes("S10")) {
    res.combustivel = "diesel_s10";
  } else if (upper.includes("DIESEL")) {
    res.combustivel = "diesel";
  } else if (upper.includes("GNV")) {
    res.combustivel = "gnv";
  }

  // Número da NF
  const matchNf = texto.match(
    /(?:NFC-e\s*N[ºo]?|NF-e\s*N[ºo]?|EXTRATO\s*N[ºo]?|DOC(?:UMENTO)?\s*N[ºo]?|NUMERO)[\s:]*([0-9]+)/i,
  );
  if (matchNf) {
    res.nf_numero = matchNf[1];
  }

  return res;
}

/**
 * Extrai dados da Nota Fiscal, Cupom Fiscal ou comprovante de pagamento via IA ou PDF nativo
 */
export async function extrairDadosNF(file: File): Promise<OcrNfResultado> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  // Se for PDF, tenta primeiro ler a camada vetorial de texto do documento
  if (isPdf) {
    try {
      const { extractText } = await import("unpdf");
      const buffer = await file.arrayBuffer();
      const { text } = await extractText(new Uint8Array(buffer));
      const textoCompleto = Array.isArray(text) ? text.join("\n") : String(text || "");
      if (textoCompleto && textoCompleto.trim().length > 30) {
        const parsed = parseTextoNfe(textoCompleto);
        if (parsed.valor_total && (parsed.litros || parsed.data)) {
          return {
            data: parsed.data || null,
            hora: parsed.hora || null,
            valor_total: parsed.valor_total || null,
            litros: parsed.litros || null,
            valor_por_litro:
              parsed.valor_por_litro ||
              (parsed.valor_total && parsed.litros
                ? Number((parsed.valor_total / parsed.litros).toFixed(4))
                : null),
            combustivel: parsed.combustivel || null,
            posto_nome: parsed.posto_nome || null,
            posto_cidade: parsed.posto_cidade || null,
            nf_numero: parsed.nf_numero || null,
            forma_pagamento: parsed.forma_pagamento || null,
            categoria: parsed.litros ? "combustivel" : "manutencao",
            descricao_itens: parsed.descricao_itens || null,
          };
        }
      }
    } catch (pdfErr) {
      console.warn("Falha no parsing de texto de PDF local, recorrendo ao Vision:", pdfErr);
    }
  }

  // Extração visual multimodal com Gemini Vision (otimizada para mobile)
  const { base64, mimeType } = await fileParaBase64Otimizado(file);

  const response = await fetch("/api/ocr-nf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, mimeType }),
  });

  if (!response.ok) {
    const erroJson = await response.json().catch(() => ({}));
    throw new Error(erroJson?.error || `Falha na leitura da nota fiscal (${response.status})`);
  }

  const json = await response.json();
  if (!json?.ok || !json?.data) {
    throw new Error(json?.error || "Não foi possível extrair os dados da nota fiscal.");
  }

  return json.data as OcrNfResultado;
}
