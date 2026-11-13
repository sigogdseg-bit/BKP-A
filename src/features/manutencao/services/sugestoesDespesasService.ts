import { supabase } from "@/integrations/supabase/client";

export interface SugestaoServicoItem {
  label: string;
  categoria: string;
  isPersonalizada?: boolean;
}

export const SUGESTOES_BASE_PADRAO: SugestaoServicoItem[] = [
  { label: "Troca de Óleo e Filtro", categoria: "oleo_fluidos" },
  { label: "Palhetas do Limpador", categoria: "palhetas" },
  { label: "Pneus e Alinhamento", categoria: "pneus" },
  { label: "Pastilhas e Freios", categoria: "freios" },
  { label: "Lavagem e Limpeza", categoria: "lavagem" },
  { label: "Bateria e Elétrica", categoria: "outro" },
  { label: "Mecânica Geral", categoria: "outro" },
];

const STORAGE_KEY_PREFIX = "hunter_sugestoes_servicos_";

/**
 * Obtém as sugestões armazenadas localmente para o cliente ou gerais
 */
export function obterSugestoesLocais(clienteId?: string): SugestaoServicoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const key = `${STORAGE_KEY_PREFIX}${clienteId || "geral"}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) => item && typeof item.label === "string" && item.label.trim().length > 0,
      );
    }
  } catch (err) {
    console.warn("Erro ao ler sugestoes locais:", err);
  }
  return [];
}

/**
 * Salva uma nova sugestão automaticamente assim que um gasto é enviado
 */
export function salvarSugestaoLocal(
  label: string,
  categoria: string = "manutencao",
  clienteId?: string,
): SugestaoServicoItem[] {
  const limpo = label.trim();
  if (!limpo || typeof window === "undefined") return [];

  try {
    const key = `${STORAGE_KEY_PREFIX}${clienteId || "geral"}`;
    const atuais = obterSugestoesLocais(clienteId);

    // Remove ocorrência anterior do mesmo nome para posicionar no topo
    const filtrados = atuais.filter((it) => it.label.toLowerCase() !== limpo.toLowerCase());

    const novoItem: SugestaoServicoItem = {
      label: limpo,
      categoria: categoria || "manutencao",
      isPersonalizada: true,
    };

    const atualizados = [novoItem, ...filtrados].slice(0, 30);
    localStorage.setItem(key, JSON.stringify(atualizados));

    // Notifica outros componentes via evento customizado
    window.dispatchEvent(new CustomEvent("hunter_sugestoes_atualizadas", { detail: atualizados }));

    return atualizados;
  } catch (err) {
    console.warn("Erro ao salvar sugestao local:", err);
    return [];
  }
}

/**
 * Remove uma sugestão personalizada da lista
 */
export function removerSugestaoLocal(label: string, clienteId?: string): SugestaoServicoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const key = `${STORAGE_KEY_PREFIX}${clienteId || "geral"}`;
    const atuais = obterSugestoesLocais(clienteId);
    const atualizados = atuais.filter(
      (it) => it.label.toLowerCase() !== label.trim().toLowerCase(),
    );
    localStorage.setItem(key, JSON.stringify(atualizados));
    window.dispatchEvent(new CustomEvent("hunter_sugestoes_atualizadas", { detail: atualizados }));
    return atualizados;
  } catch (err) {
    console.warn("Erro ao remover sugestao local:", err);
    return [];
  }
}

/**
 * Carrega a lista mesclada e deduplicada de sugestões:
 * 1. Personalizadas locais (enviadas recentemente)
 * 2. Histórico de despesas já salvas no banco
 * 3. Sugestões base padrão
 */
export async function carregarSugestoesCompletas(
  clienteId?: string,
  veiculoId?: string,
): Promise<SugestaoServicoItem[]> {
  const mapa = new Map<string, SugestaoServicoItem>();

  // 1. Sugestões locais adicionadas pelo cliente/usuário
  const locais = obterSugestoesLocais(clienteId);
  for (const item of locais) {
    const chave = item.label.toLowerCase().trim();
    if (!mapa.has(chave)) {
      mapa.set(chave, { ...item, isPersonalizada: true });
    }
  }

  // 2. Busca despesas cadastradas no banco para o cliente ou veículo
  try {
    let query = supabase
      .from("motorista_despesas")
      .select("descricao, categoria")
      .order("created_at", { ascending: false })
      .limit(50);

    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    } else if (veiculoId) {
      query = query.eq("veiculo_id", veiculoId);
    }

    const { data: despesas } = await query;
    if (despesas) {
      for (const d of despesas) {
        if (!d.descricao) continue;
        const texto = d.descricao.trim();
        const chave = texto.toLowerCase();
        if (!mapa.has(chave)) {
          mapa.set(chave, {
            label: texto,
            categoria: d.tipo_despesa || d.categoria || "manutencao",
            isPersonalizada: true,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar sugestoes do banco de dados:", err);
  }

  // 3. Sugestões base padrão
  for (const padrao of SUGESTOES_BASE_PADRAO) {
    const chave = padrao.label.toLowerCase().trim();
    if (!mapa.has(chave)) {
      mapa.set(chave, { ...padrao, isPersonalizada: false });
    }
  }

  return Array.from(mapa.values());
}
