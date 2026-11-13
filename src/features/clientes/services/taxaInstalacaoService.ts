import { supabase } from "@/integrations/supabase/client";

export const CHAVE_STORAGE_TAXA_PADRAO = "hunter_taxa_instalacao_padrao";
export const VALOR_PADRAO_TAXA_INSTALACAO = 350.0;

let taxaEmMemoria = VALOR_PADRAO_TAXA_INSTALACAO;

/**
 * Obtém o valor padrão configurado para a taxa de instalação e ativação.
 * Por padrão é R$ 350,00, a menos que o operador tenha salvo um novo padrão global.
 */
export function obterTaxaInstalacaoPadrao(): number {
  if (typeof window === "undefined") return taxaEmMemoria;
  try {
    const salvo = localStorage.getItem(CHAVE_STORAGE_TAXA_PADRAO);
    if (salvo !== null) {
      const num = Number(salvo);
      if (!isNaN(num) && num >= 0) {
        return num;
      }
    }
  } catch (e) {
    console.warn("Aviso ao ler taxa de instalação padrão:", e);
  }
  return VALOR_PADRAO_TAXA_INSTALACAO;
}

/**
 * Salva o novo valor padrão de taxa de instalação para todos os futuros cadastros.
 */
export function salvarTaxaInstalacaoPadrao(novoValor: number): void {
  taxaEmMemoria = novoValor;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHAVE_STORAGE_TAXA_PADRAO, String(novoValor));
  } catch (e) {
    console.warn("Aviso ao salvar nova taxa de instalação padrão:", e);
  }
}

// Alias de compatibilidade
export const definirTaxaInstalacaoPadrao = salvarTaxaInstalacaoPadrao;

/**
 * Registra a cobrança de taxa de instalação e ativação (paga no ato da contratação).
 * Utiliza mes_referencia = 0 para representar a taxa de adesão sem conflitar com as mensalidades regulares (1-12).
 */
export async function registrarCobrancaTaxaInstalacao(
  clienteId: string,
  valor: number,
  dataInicioStr?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!valor || valor <= 0) {
      // Se a taxa for zerada (cortesia), remove cobranca pendente de adesao (mes_referencia = 0)
      await supabase
        .from("mensalidades")
        .delete()
        .eq("cliente_id", clienteId)
        .eq("mes_referencia", 0)
        .neq("status", "pago");

      return { success: true, message: "Taxa zerada / cortesia de adesao." };
    }

    const dataBase = dataInicioStr ? new Date(dataInicioStr + "T12:00:00") : new Date();
    const ano = dataBase.getFullYear();
    const hojeStr = new Date().toISOString().split("T")[0];
    const dataVencStr = dataInicioStr || hojeStr;

    // Verifica se ja existe a cobranca da taxa para este cliente (mes_referencia = 0)
    const { data: existente } = await supabase
      .from("mensalidades")
      .select("id, status")
      .eq("cliente_id", clienteId)
      .eq("mes_referencia", 0)
      .eq("ano_referencia", ano)
      .maybeSingle();

    if (existente) {
      if (existente.status !== "pago") {
        await supabase
          .from("mensalidades")
          .update({ valor: valor, data_vencimento: dataVencStr })
          .eq("id", existente.id);
      }
      return { success: true, message: "Taxa de adesao sincronizada com sucesso." };
    }

    const { error } = await supabase.from("mensalidades").insert({
      cliente_id: clienteId,
      mes_referencia: 0,
      ano_referencia: ano,
      valor: valor,
      data_vencimento: dataVencStr,
      status: "pendente",
    });

    if (error) {
      console.warn("Aviso ao registrar taxa de instalação:", error);
      return { success: false, message: error.message };
    }

    return { success: true, message: "Taxa de instalação e ativação registrada com sucesso!" };
  } catch (err: any) {
    console.error("Erro inesperado ao registrar taxa de instalação:", err);
    return { success: false, message: err?.message || "Erro desconhecido." };
  }
}
