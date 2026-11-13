import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

/**
 * Testes Unitários de Blindagem Anti-Duplicidade de Abastecimentos e Despesas
 * Diretrizes HUNTER / DJR-NEW:
 * - Proibição absoluta de duplicação de dados em relatórios, tabelas e cards de TCO.
 * - Deduplicação inteligente que prioriza registros completos (com anexo de NF/PDF).
 * - Proteção em profundidade a nível de banco de dados e de aplicação.
 */

interface AbastecimentoItem {
  id: string;
  veiculo_id: string;
  data_abastecimento: string;
  km_atual: number | null;
  litros: number;
  valor_total: number;
  combustivel: string;
  posto_nome?: string;
  nf_numero?: string | null;
  nf_foto_url?: string | null;
}

interface DespesaItem {
  id: string;
  veiculo_id: string;
  data_despesa: string;
  categoria: string;
  descricao: string;
  valor: number;
  km_atual?: number | null;
  nf_numero?: string | null;
  nf_foto_url?: string | null;
}

function deduplicarAbastecimentos(lista: AbastecimentoItem[]): AbastecimentoItem[] {
  const mapa = new Map<string, AbastecimentoItem>();
  for (const a of lista) {
    const chave =
      a.nf_numero && a.nf_numero.trim()
        ? `nf_${a.veiculo_id}_${a.nf_numero.trim().toUpperCase()}`
        : `sem_nf_${a.veiculo_id}_${a.data_abastecimento}_${Number(a.km_atual || 0)}_${Number(a.valor_total || 0)}`;

    const existente = mapa.get(chave);
    if (!existente) {
      mapa.set(chave, a);
    } else if (!existente.nf_foto_url && a.nf_foto_url) {
      mapa.set(chave, a);
    }
  }
  return Array.from(mapa.values());
}

function deduplicarDespesas(lista: DespesaItem[]): DespesaItem[] {
  const mapa = new Map<string, DespesaItem>();
  for (const d of lista) {
    const chave =
      d.nf_numero && d.nf_numero.trim()
        ? `nf_${d.veiculo_id}_${d.nf_numero.trim().toUpperCase()}`
        : `sem_nf_${d.veiculo_id}_${d.data_despesa}_${Number(d.valor || 0)}_${(d.descricao || "").trim().toUpperCase()}`;

    const existente = mapa.get(chave);
    if (!existente) {
      mapa.set(chave, d);
    } else if (!existente.nf_foto_url && d.nf_foto_url) {
      mapa.set(chave, d);
    }
  }
  return Array.from(mapa.values());
}

describe("Blindagem Anti-Duplicidade de Lançamentos Financeiros (DJR-NEW)", () => {
  it("deve deduplicar os 3 lançamentos idênticos da NF 206095 mantendo estritamente 1 registro com anexo", () => {
    const registrosDuplicados: AbastecimentoItem[] = [
      {
        id: "bb39ba9c-a7f8-40b9-9e11-651f492c5682",
        veiculo_id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
        data_abastecimento: "2026-10-03",
        km_atual: 182974,
        litros: 54.87,
        valor_total: 400.0,
        combustivel: "gasolina_aditivada",
        posto_nome: "Ap",
        nf_numero: "206095",
        nf_foto_url: null,
      },
      {
        id: "10b96b7f-4752-4969-836d-59a8bfa1ae20",
        veiculo_id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
        data_abastecimento: "2026-10-03",
        km_atual: 182974,
        litros: 54.87,
        valor_total: 400.0,
        combustivel: "gasolina_aditivada",
        posto_nome: "AP AMARAL PEIXOTO",
        nf_numero: "206095",
        nf_foto_url: null,
      },
      {
        id: "4a1edd34-1855-4017-9094-e27d0b201ba6",
        veiculo_id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
        data_abastecimento: "2026-10-03",
        km_atual: 182974,
        litros: 54.87,
        valor_total: 400.0,
        combustivel: "gasolina_aditivada",
        posto_nome: "AP AMARAL PEIXOTO",
        nf_numero: "206095",
        nf_foto_url: "cliente/abastecimento/4a1edd34_comprovante.pdf",
      },
    ];

    const deduplicados = deduplicarAbastecimentos(registrosDuplicados);

    assert.equal(deduplicados.length, 1, "Deve restar exatamente 1 registro");
    assert.equal(deduplicados[0].id, "4a1edd34-1855-4017-9094-e27d0b201ba6");
    assert.equal(deduplicados[0].nf_foto_url, "cliente/abastecimento/4a1edd34_comprovante.pdf");
    assert.equal(deduplicados[0].valor_total, 400.0);
    assert.equal(deduplicados[0].litros, 54.87);

    // Soma do TCO e Litros corrigida
    const totalGasto = deduplicados.reduce((acc, a) => acc + a.valor_total, 0);
    const totalLitros = deduplicados.reduce((acc, a) => acc + a.litros, 0);

    assert.equal(totalGasto, 400.0, "O gasto total deve ser R$ 400.00 e não R$ 1200.00");
    assert.equal(
      Number(totalLitros.toFixed(2)),
      54.87,
      "O total de litros deve ser 54.87 L e não 164.6 L",
    );
  });

  it("deve deduplicar despesas idênticas com mesma NF preservando comprovante", () => {
    const despesas: DespesaItem[] = [
      {
        id: "d1",
        veiculo_id: "v1",
        data_despesa: "2026-10-01",
        categoria: "manutencao",
        descricao: "Alinhamento e Balanceamento",
        valor: 150.0,
        nf_numero: "9988",
        nf_foto_url: null,
      },
      {
        id: "d2",
        veiculo_id: "v1",
        data_despesa: "2026-10-01",
        categoria: "manutencao",
        descricao: "Alinhamento e Balanceamento",
        valor: 150.0,
        nf_numero: "9988",
        nf_foto_url: "comprovante.pdf",
      },
    ];

    const deduplicadas = deduplicarDespesas(despesas);
    assert.equal(deduplicadas.length, 1);
    assert.equal(deduplicadas[0].id, "d2");
    assert.equal(deduplicadas[0].valor, 150.0);
  });

  it("deve deduplicar despesas sem NF que tenham mesma data, valor e descrição", () => {
    const despesasSemNf: DespesaItem[] = [
      {
        id: "d1",
        veiculo_id: "v1",
        data_despesa: "2026-10-02",
        categoria: "lavagem",
        descricao: "Ducha simples",
        valor: 40.0,
        nf_numero: null,
      },
      {
        id: "d2",
        veiculo_id: "v1",
        data_despesa: "2026-10-02",
        categoria: "lavagem",
        descricao: "Ducha simples",
        valor: 40.0,
        nf_numero: "",
      },
    ];

    const deduplicadas = deduplicarDespesas(despesasSemNf);
    assert.equal(deduplicadas.length, 1);
    assert.equal(deduplicadas[0].valor, 40.0);
  });

  it("deve garantir que os arquivos de migração e mestre SQL contêm os índices únicos de anti-duplicidade", () => {
    const migrationSql = fs.readFileSync(
      "supabase/migrations/20261005120000_hunter_anti_duplicidade_abastecimentos_e_despesas.sql",
      "utf8",
    );
    const masterSql = fs.readFileSync("supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql", "utf8");

    assert.ok(
      migrationSql.includes("idx_abast_unico_nf"),
      "Migração deve conter idx_abast_unico_nf",
    );
    assert.ok(
      migrationSql.includes("idx_despesas_unico_nf"),
      "Migração deve conter idx_despesas_unico_nf",
    );
    assert.ok(
      masterSql.includes("idx_abast_unico_nf"),
      "Script mestre deve conter idx_abast_unico_nf",
    );
    assert.ok(
      masterSql.includes("idx_despesas_unico_nf"),
      "Script mestre deve conter idx_despesas_unico_nf",
    );
  });
});
