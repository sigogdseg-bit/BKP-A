import { LOGO_EMBLEMA_BASE64 } from "./logoBase64Const";

/**
 * Helper compartilhado para carregar o logotipo oficial do GD Rastreamento
 * em formato Base64 para inclusao instantanea em documentos PDF (jsPDF).
 * Funciona de forma universal e imediata tanto no navegador quanto no backend/Cloudflare.
 */
let logoBase64Cache: string | null = LOGO_EMBLEMA_BASE64;

export async function carregarLogoEmblemaBase64(): Promise<string | null> {
  return logoBase64Cache || LOGO_EMBLEMA_BASE64;
}
