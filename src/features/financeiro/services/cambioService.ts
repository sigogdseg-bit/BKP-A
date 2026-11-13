// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Serviço Canônico de Câmbio e Cotação de Moedas
// ─────────────────────────────────────────────────────────────────────────────

export interface CotacaoDolarResult {
  cotacao: number;
  dataHora: string;
  fonte: string;
  sucesso: boolean;
}

const STORAGE_KEY_COTACAO = "hunter_cotacao_usd_brl";
const STORAGE_KEY_TIMESTAMP = "hunter_cotacao_usd_brl_time";
const COTACAO_PADRAO_SEGURANCA = 5.65;

let cotacaoMemoria = COTACAO_PADRAO_SEGURANCA;
let timestampMemoria = new Date().toISOString();

/**
 * Consulta a cotação comercial atual do Dólar Americano (USD/BRL).
 * Utiliza a API oficial do AwesomeAPI com fallback resiliente para cache local
 * e contingência caso não haja conexão externa disponível.
 */
export async function obterCotacaoDolarHoje(): Promise<CotacaoDolarResult> {
  // 1. Tenta recuperar cache recente (válido por 10 minutos)
  if (typeof window !== "undefined") {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_COTACAO);
      const timeSalvo = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
      if (salvo && timeSalvo) {
        const diffMs = Date.now() - new Date(timeSalvo).getTime();
        // Se tem menos de 10 minutos, aproveita o cache rápido
        if (diffMs < 10 * 60 * 1000) {
          const valor = Number(salvo);
          if (!isNaN(valor) && valor > 0) {
            return {
              cotacao: valor,
              dataHora: timeSalvo,
              fonte: "Cache Local Recente",
              sucesso: true,
            };
          }
        }
      }
    } catch {
      // Ignora erro de storage
    }
  }

  // 2. Consulta a API em tempo real
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const resp = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      const usdBrl = data?.USDBRL;
      if (usdBrl && usdBrl.bid) {
        const cotacaoNum = Number(Number(usdBrl.bid).toFixed(4));
        const dataHoraStr = usdBrl.create_date || new Date().toISOString();

        cotacaoMemoria = cotacaoNum;
        timestampMemoria = dataHoraStr;

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(STORAGE_KEY_COTACAO, String(cotacaoNum));
            localStorage.setItem(STORAGE_KEY_TIMESTAMP, dataHoraStr);
          } catch {
            // Ignora
          }
        }

        return {
          cotacao: cotacaoNum,
          dataHora: dataHoraStr,
          fonte: "AwesomeAPI / Banco Central",
          sucesso: true,
        };
      }
    }
  } catch (err) {
    console.warn("Consulta à API de câmbio USD/BRL indisponível, aplicando contingência:", err);
  }

  // 3. Fallback: Retorna cotação em memória ou padrão
  return {
    cotacao: cotacaoMemoria,
    dataHora: timestampMemoria,
    fonte: "Contingência Padrão do Sistema",
    sucesso: false,
  };
}

/**
 * Converte valor em Dólar (USD) para Reais (BRL) com base na cotação.
 */
export function converterUsdParaBrl(valorUsd: number, cotacao: number): number {
  if (!valorUsd || valorUsd <= 0) return 0;
  const taxa = cotacao > 0 ? cotacao : COTACAO_PADRAO_SEGURANCA;
  return Number((valorUsd * taxa).toFixed(2));
}

/**
 * Converte valor em Reais (BRL) para Dólar (USD) com base na cotação.
 */
export function converterBrlParaUsd(valorBrl: number, cotacao: number): number {
  if (!valorBrl || valorBrl <= 0) return 0;
  const taxa = cotacao > 0 ? cotacao : COTACAO_PADRAO_SEGURANCA;
  return Number((valorBrl / taxa).toFixed(2));
}

/**
 * Formata valor de acordo com a moeda de origem.
 */
export function formatarValorMoeda(valor: number, moeda: "BRL" | "USD" = "BRL"): string {
  if (moeda === "USD") {
    return `US$ ${Number(valor || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
