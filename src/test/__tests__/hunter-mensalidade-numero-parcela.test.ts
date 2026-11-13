import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  enriquecerNumeracaoParcelasMensalidades,
  formatarParcelaMensalidade,
  dispararLembretePreventivoMensalidadeWhatsApp,
} from "../../features/mensalidades/services/mensalidadeService";

describe("Hunter — Numeração de Parcelas de Mensalidades (01/12, 02/12...)", () => {
  const root = process.cwd();

  it("1. formatarParcelaMensalidade deve formatar com dois dígitos (01/12, 02/12, 12/12) e ignorar valores inválidos", () => {
    assert.strictEqual(formatarParcelaMensalidade(1, 12), "01/12");
    assert.strictEqual(formatarParcelaMensalidade(2, 12), "02/12");
    assert.strictEqual(formatarParcelaMensalidade(9, 12), "09/12");
    assert.strictEqual(formatarParcelaMensalidade(12, 12), "12/12");
    assert.strictEqual(formatarParcelaMensalidade(3, 6), "03/06");
    assert.strictEqual(formatarParcelaMensalidade(1, null), "01/12");
    assert.strictEqual(formatarParcelaMensalidade(null, 12), "");
    assert.strictEqual(formatarParcelaMensalidade(0, 12), "");
    assert.strictEqual(formatarParcelaMensalidade(-1, 12), "");
  });

  it("2. enriquecerNumeracaoParcelasMensalidades deve numerar cronologicamente por cliente e excluir Taxa de Ativação (mês 0)", () => {
    const lista: Array<{
      id: string;
      cliente_id: string;
      mes_referencia: number;
      ano_referencia: number;
      data_vencimento: string;
      numero_parcela?: number | null;
      total_parcelas?: number | null;
    }> = [
      {
        id: "m-taxa",
        cliente_id: "cli-1",
        mes_referencia: 0,
        ano_referencia: 2026,
        data_vencimento: "2026-10-10",
      },
      {
        id: "m-dez",
        cliente_id: "cli-1",
        mes_referencia: 12,
        ano_referencia: 2026,
        data_vencimento: "2026-12-10",
      },
      {
        id: "m-nov",
        cliente_id: "cli-1",
        mes_referencia: 11,
        ano_referencia: 2026,
        data_vencimento: "2026-11-10",
      },
      {
        id: "m-jan",
        cliente_id: "cli-1",
        mes_referencia: 1,
        ano_referencia: 2027,
        data_vencimento: "2027-01-10",
      },
      {
        id: "m-b1",
        cliente_id: "cli-2",
        mes_referencia: 12,
        ano_referencia: 2026,
        data_vencimento: "2026-12-10",
      },
    ];

    const enriquecida = enriquecerNumeracaoParcelasMensalidades(lista);
    const porId = new Map(enriquecida.map((item) => [item.id, item]));

    // Taxa de Ativação não recebe número de parcela
    assert.strictEqual(porId.get("m-taxa")?.numero_parcela, null);
    assert.strictEqual(porId.get("m-taxa")?.total_parcelas, null);

    // Cliente 1: cronológico através da virada de ano (11/2026 -> 01/12, 12/2026 -> 02/12, 01/2027 -> 03/12)
    assert.strictEqual(porId.get("m-nov")?.numero_parcela, 1);
    assert.strictEqual(porId.get("m-nov")?.total_parcelas, 12);
    assert.strictEqual(porId.get("m-dez")?.numero_parcela, 2);
    assert.strictEqual(porId.get("m-dez")?.total_parcelas, 12);
    assert.strictEqual(porId.get("m-jan")?.numero_parcela, 3);
    assert.strictEqual(porId.get("m-jan")?.total_parcelas, 12);

    // Cliente 2: contagem independente iniciando em 01/12
    assert.strictEqual(porId.get("m-b1")?.numero_parcela, 1);
    assert.strictEqual(porId.get("m-b1")?.total_parcelas, 12);
  });

  it("3. enriquecerNumeracaoParcelasMensalidades deve preservar numero_parcela e total_parcelas já persistidos no banco", () => {
    const lista: Array<{
      id: string;
      cliente_id: string;
      mes_referencia: number;
      ano_referencia: number;
      data_vencimento: string;
      numero_parcela?: number | null;
      total_parcelas?: number | null;
    }> = [
      {
        id: "m-1",
        cliente_id: "cli-persist",
        mes_referencia: 5,
        ano_referencia: 2027,
        data_vencimento: "2027-05-10",
        numero_parcela: 7,
        total_parcelas: 12,
      },
    ];

    const [res] = enriquecerNumeracaoParcelasMensalidades(lista);
    assert.strictEqual(res.numero_parcela, 7);
    assert.strictEqual(res.total_parcelas, 12);
    assert.strictEqual(formatarParcelaMensalidade(res.numero_parcela, res.total_parcelas), "07/12");
  });

  it("4. dispararLembretePreventivoMensalidadeWhatsApp deve incluir 02/12 quando informado", async () => {
    const originalFetch = globalThis.fetch;
    let bodyCapturado: any = null;

    globalThis.fetch = (async (_url: any, opts: any) => {
      bodyCapturado = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({ id: "msg-parcela-1", success: true }),
      };
    }) as any;

    try {
      const res = await dispararLembretePreventivoMensalidadeWhatsApp(
        { id: "cli-test-p", nome: "Alex Sandro", telefone: "(24) 99999-1111" },
        {
          id: "fat-test-p",
          valor: 45,
          dataVencimento: "2026-12-10",
          mesReferencia: 12,
          anoReferencia: 2026,
          numeroParcela: 2,
          totalParcelas: 12,
        },
      );

      assert.strictEqual(res.sucesso, true);
      assert.ok(bodyCapturado);
      assert.match(bodyCapturado.message, /DEZ\/2026 · 02\/12/);
      assert.match(bodyCapturado.message, /\(Parcela 02\/12\)/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("5. Arquivos de UI, serviços e migração SQL devem implementar e propagar numero_parcela/total_parcelas sem '&'", () => {
    const financeiroServiceCode = fs.readFileSync(
      path.join(root, "src/features/financeiro/services/financeiroService.ts"),
      "utf-8",
    );
    const financeiroViewCode = fs.readFileSync(
      path.join(root, "src/features/financeiro/components/FinanceiroView.tsx"),
      "utf-8",
    );
    const mensalidadesViewCode = fs.readFileSync(
      path.join(root, "src/features/mensalidades/components/MensalidadesView.tsx"),
      "utf-8",
    );
    const modalContratoCode = fs.readFileSync(
      path.join(root, "src/features/clientes/components/ModalParcelasContratoCliente.tsx"),
      "utf-8",
    );
    const migrationPath = path.join(
      root,
      "supabase/migrations/20261112200000_hunter_mensalidades_numero_parcela.sql",
    );
    const masterSqlCode = fs.readFileSync(
      path.join(root, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql"),
      "utf-8",
    );

    assert.ok(
      financeiroServiceCode.includes("enriquecerNumeracaoParcelasMensalidades") &&
        financeiroServiceCode.includes("formatarParcelaMensalidade"),
      "financeiroService deve enriquecer e formatar parcelas 01/12..12/12 no Livro-Caixa",
    );
    assert.ok(
      financeiroViewCode.includes("formatarParcelaMensalidade") &&
        financeiroViewCode.includes('t.categoria === "mensalidade"'),
      "FinanceiroView deve exibir badge de parcela em lançamentos de mensalidade",
    );
    assert.ok(
      mensalidadesViewCode.includes("formatarParcelaMensalidade"),
      "MensalidadesView deve exibir numeração XX/YY nas faturas e modais",
    );
    assert.ok(
      modalContratoCode.includes("formatarParcelaMensalidade") &&
        !/\.select\([^)]*meses_contrato/.test(modalContratoCode),
      "ModalParcelasContratoCliente deve exibir parcela XX/YY e não consultar coluna inexistente meses_contrato",
    );

    assert.ok(fs.existsSync(migrationPath), "Migration 20261112200000 deve existir");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      migrationSql.includes("ADD COLUMN IF NOT EXISTS numero_parcela") &&
        migrationSql.includes("ADD COLUMN IF NOT EXISTS total_parcelas") &&
        migrationSql.includes("trg_sync_mensalidade_transacao") &&
        migrationSql.includes("NOTIFY pgrst, 'reload schema';"),
      "Migration 20261112200000 deve criar colunas, atualizar trigger e recarregar cache",
    );
    assert.ok(
      masterSqlCode.includes("20261112200000_hunter_mensalidades_numero_parcela.sql"),
      "APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve espelhar a migration 20261112200000",
    );
  });
});
