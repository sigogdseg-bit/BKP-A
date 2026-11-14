import QRCode from "qrcode";

/**
 * Utilitário Canônico para Geração de Payload PIX (BR Code padrão BACEN / EMV)
 * e geração de QR Code escaneável para quitação de instalações.
 */

function formatarCampoEMV(id: string, valor: string): string {
  const tamanho = valor.length.toString().padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

function calcularCRC16(payload: string): string {
  let crc = 0xffff;
  const polinomio = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polinomio) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitizarTexto(texto: string, maxLen = 25): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .slice(0, maxLen);
}

export interface DadosPix {
  chavePix: string;
  nomeRecebedor: string;
  cidadeRecebedor?: string;
  valor: number;
  identificador?: string; // TXID
}

export function gerarPayloadPix({
  chavePix,
  nomeRecebedor,
  cidadeRecebedor = "BRASIL",
  valor,
  identificador = "GDRASTREAMENTO",
}: DadosPix): string {
  const chaveLimpa = chavePix.trim();
  const nomeLimpo = sanitizarTexto(nomeRecebedor || "Instalador Credenciado", 25);
  const cidadeLimpa = sanitizarTexto(cidadeRecebedor || "BRASIL", 15);
  const txidLimpo = sanitizarTexto(identificador || "GDRASTREAMENTO", 25) || "***";
  const valorFormatado = valor.toFixed(2);

  // 00 - Payload Format Indicator
  let payload = formatarCampoEMV("00", "01");

  // 26 - Merchant Account Information (GUI + Chave PIX)
  const gui = formatarCampoEMV("00", "br.gov.bcb.pix");
  const key = formatarCampoEMV("01", chaveLimpa);
  payload += formatarCampoEMV("26", `${gui}${key}`);

  // 52 - Merchant Category Code
  payload += formatarCampoEMV("52", "0000");

  // 53 - Transaction Currency (986 = BRL)
  payload += formatarCampoEMV("53", "986");

  // 54 - Transaction Amount (se maior que 0)
  if (valor > 0) {
    payload += formatarCampoEMV("54", valorFormatado);
  }

  // 58 - Country Code
  payload += formatarCampoEMV("58", "BR");

  // 59 - Merchant Name
  payload += formatarCampoEMV("59", nomeLimpo);

  // 60 - Merchant City
  payload += formatarCampoEMV("60", cidadeLimpa);

  // 62 - Additional Data Field Template (TXID)
  const txid = formatarCampoEMV("05", txidLimpo);
  payload += formatarCampoEMV("62", txid);

  // 63 - CRC16 (prefixo '6304')
  payload += "6304";
  const crc = calcularCRC16(payload);

  return `${payload}${crc}`;
}

export async function gerarQrCodePixDataUrl(payloadPix: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payloadPix, {
      width: 280,
      margin: 2,
      color: {
        dark: "#022c22", // Emerald bem escuro para alta legibilidade e contraste
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    });
  } catch (err) {
    console.error("Erro ao gerar QR Code PIX:", err);
    return "";
  }
}
