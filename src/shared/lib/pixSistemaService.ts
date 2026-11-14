import { supabase } from "@/integrations/supabase/client";
import { APP_CHAVE_PIX_PADRAO, APP_PUBLIC_URL } from "@/shared/lib/version";
import { gerarPayloadPix, gerarQrCodePixDataUrl } from "@/features/instalacoes/utils/pixPayload";

export interface ConfigPixSistema {
  chavePix: string;
  titular: string;
  cidade: string;
  tipoChave: "email" | "cpf_cnpj" | "telefone" | "aleatoria";
}

export interface DocumentoQrCodeWhatsapp {
  nome: string;
  base64: string;
  mimetype: string;
  tamanho: number;
}

export const CONFIG_PIX_PADRAO: ConfigPixSistema = {
  chavePix: APP_CHAVE_PIX_PADRAO || "pix@oficial.tec.br",
  titular: "GD Rastreamento Tecnologia",
  cidade: "Volta Redonda",
  tipoChave: "email",
};

export const STORAGE_KEY_PIX_SISTEMA = "@hunter_chave_pix_sistema";

// Cache em memória para ambientes SSR/Node.js/Testes
let cachePixMemoria: ConfigPixSistema | null = null;

/**
 * Obtém sincronamente a configuração da Chave Pix do Sistema (armazenada em localStorage com fallback seguro).
 */
export function obterConfigPixSistemaSync(): ConfigPixSistema {
  if (typeof window !== "undefined") {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_PIX_SISTEMA);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed?.chavePix) {
          return {
            chavePix: String(parsed.chavePix).trim() || CONFIG_PIX_PADRAO.chavePix,
            titular: String(parsed.titular || CONFIG_PIX_PADRAO.titular).trim(),
            cidade: String(parsed.cidade || CONFIG_PIX_PADRAO.cidade).trim(),
            tipoChave: parsed.tipoChave || "email",
          };
        }
      }
    } catch {
      /* fallback */
    }
  } else if (cachePixMemoria) {
    return { ...cachePixMemoria };
  }
  return { ...CONFIG_PIX_PADRAO };
}

/**
 * Obtém assincronamente a configuração da Chave Pix do Sistema, sincronizando do Supabase quando disponível.
 */
export async function obterConfigPixSistema(): Promise<ConfigPixSistema> {
  const local = obterConfigPixSistemaSync();
  try {
    const { data: wpp } = await supabase
      .from("whatsapp_config")
      .select("chave_pix, titular_pix, cidade_pix" as any)
      .limit(1)
      .maybeSingle();

    const wppObj = wpp as any;
    if (wppObj?.chave_pix) {
      const cfg: ConfigPixSistema = {
        chavePix: String(wppObj.chave_pix).trim(),
        titular: String(wppObj.titular_pix || local.titular).trim(),
        cidade: String(wppObj.cidade_pix || local.cidade).trim(),
        tipoChave: local.tipoChave,
      };
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY_PIX_SISTEMA, JSON.stringify(cfg));
        } catch {
          /* silencioso */
        }
      } else {
        cachePixMemoria = cfg;
      }
      return cfg;
    }
  } catch {
    /* fallback local */
  }
  return local;
}

/**
 * Salva a Chave Pix Oficial do Sistema localmente e no banco de dados.
 */
export async function salvarConfigPixSistema(
  config: Partial<ConfigPixSistema>,
): Promise<ConfigPixSistema> {
  const atual = obterConfigPixSistemaSync();
  const nova: ConfigPixSistema = {
    chavePix: (config.chavePix || atual.chavePix).trim(),
    titular: (config.titular || atual.titular).trim() || "GD Rastreamento Tecnologia",
    cidade: (config.cidade || atual.cidade).trim() || "Volta Redonda",
    tipoChave: config.tipoChave || atual.tipoChave || "email",
  };

  cachePixMemoria = { ...nova };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_PIX_SISTEMA, JSON.stringify(nova));
    } catch (e) {
      console.warn("Falha ao salvar Chave Pix no localStorage", e);
    }
  }

  try {
    await supabase
      .from("whatsapp_config")
      .update({
        chave_pix: nova.chavePix,
        titular_pix: nova.titular,
        cidade_pix: nova.cidade,
      } as any)
      .neq("id", "00000000-0000-0000-0000-000000000000");
  } catch {
    /* Silencioso caso colunas ainda não estejam adicionadas na tabela */
  }

  return nova;
}

/**
 * Formata mensagem profissional e leve de lembrete de pagamento preventivo (ex: 3 dias antes do vencimento).
 * Segue estritamente as diretrizes canônicas:
 * - Acentuação correta da língua portuguesa.
 * - Modelo de negócio correto: "aluguel de rastreador com automonitoramento" (sem termo de proteção).
 * - Tom profissional e respeitoso (sem termo "com carinho").
 * - Instruções claras com Chave PIX, Pix Copia e Cola e imagem de QR Code.
 */
export function gerarMensagemLembreteVencimentoLeve(params: {
  clienteNome: string;
  valor: number;
  dataVencimentoFormatada: string;
  diasRestantes?: number;
  veiculoIdentificacao?: string;
  chavePixCustomizada?: string;
  temQrCodeAnexo?: boolean;
}): { mensagem: string; payloadPix: string } {
  const cfg = obterConfigPixSistemaSync();
  const chavePixFinal = (params.chavePixCustomizada || cfg.chavePix).trim();
  const primeiroNome = (params.clienteNome || "Cliente").split(" ")[0].trim();
  const dias = params.diasRestantes ?? 3;
  const valorFmt = params.valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let payloadPix = "";
  try {
    payloadPix = gerarPayloadPix({
      chavePix: chavePixFinal,
      nomeRecebedor: cfg.titular || "GD Rastreamento",
      cidadeRecebedor: cfg.cidade || "BRASIL",
      valor: params.valor,
      identificador: "LEMBRETE3D",
    });
  } catch (err) {
    console.warn("Falha ao gerar payload Pix para lembrete leve:", err);
  }

  const veiculoTexto = params.veiculoIdentificacao
    ? ` do seu veículo (${params.veiculoIdentificacao})`
    : "";

  let texto = `Olá, ${primeiroNome}! Tudo bem? Esperamos que esteja tendo um ótimo dia.\n\n`;
  texto += `Lembramos que a mensalidade do serviço de aluguel de rastreador com automonitoramento GD Rastreamento${veiculoTexto} vence em ${dias} dias (dia ${params.dataVencimentoFormatada}).\n\n`;
  texto += `💵 *Valor:* R$ ${valorFmt}\n`;
  texto += `🔑 *Chave PIX Oficial:* ${chavePixFinal}\n`;
  if (cfg.titular) {
    texto += `👤 *Titular:* ${cfg.titular}\n`;
  }
  texto += `\n`;

  if (payloadPix) {
    texto += `📱 *PIX COPIA E COLA (Basta copiar e colar no aplicativo do seu banco):*\n${payloadPix}\n\n`;
  }

  if (params.temQrCodeAnexo) {
    texto += `🖼️ *A imagem do QR Code para pagamento instantâneo segue em anexo nesta mensagem.*\n\n`;
  }

  texto += `🔗 *Acesse o portal para ver o QR Code e emitir o comprovante:*\n${APP_PUBLIC_URL}/cliente/financeiro\n\n`;
  texto += `Se o pagamento já tiver sido efetuado, por gentileza desconsidere este lembrete. Agradecemos pela parceria e confiança!\n\n`;
  texto += `Atenciosamente,\nEquipe GD Rastreamento`;

  return { mensagem: texto, payloadPix };
}

/**
 * Gera de forma completa e assíncrona a mensagem do lembrete preventivo
 * acompanhada da imagem oficial do QR Code em DataURL e do objeto documento pronto para despacho.
 */
export async function gerarLembreteVencimentoComQrCode(params: {
  clienteNome: string;
  valor: number;
  dataVencimentoFormatada: string;
  diasRestantes?: number;
  veiculoIdentificacao?: string;
  chavePixCustomizada?: string;
}): Promise<{
  mensagem: string;
  payloadPix: string;
  qrCodeDataUrl: string;
  documento: DocumentoQrCodeWhatsapp | null;
}> {
  const { mensagem, payloadPix } = gerarMensagemLembreteVencimentoLeve({
    ...params,
    temQrCodeAnexo: true,
  });

  let qrCodeDataUrl = "";
  let documento: DocumentoQrCodeWhatsapp | null = null;

  if (payloadPix) {
    try {
      qrCodeDataUrl = await gerarQrCodePixDataUrl(payloadPix);
      if (qrCodeDataUrl) {
        const primeiroNome = (params.clienteNome || "cliente")
          .split(" ")[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const dataSlug = (params.dataVencimentoFormatada || "vencimento").replace(/\D/g, "-");
        documento = {
          nome: `qrcode-pix-${primeiroNome}-${dataSlug}.png`,
          base64: qrCodeDataUrl,
          mimetype: "image/png",
          tamanho: Math.round((qrCodeDataUrl.length * 3) / 4),
        };
      }
    } catch (err) {
      console.warn("Falha ao gerar QR Code DataUrl para lembrete:", err);
    }
  }

  return { mensagem, payloadPix, qrCodeDataUrl, documento };
}
