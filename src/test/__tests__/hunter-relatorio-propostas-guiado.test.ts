import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { processarMensagemWhatsappRecebida } from "../../features/chat/services/whatsappAutoMonitoramentoService";

function criarMockSupabase(initialData: {
  profiles?: any[];
  revendedores?: any[];
  vendedores?: any[];
  propostas?: any[];
}) {
  const sessoes: any[] = [];
  const propostas = initialData.propostas || [];

  return {
    from: (tabela: string) => {
      const filtrosEq: Record<string, any> = {};
      let filtroOr = "";
      let filtroGte: { col: string; val: any } | null = null;
      let limitNum = 50;

      const qb: any = {
        select: () => qb,
        eq: (col: string, val: any) => {
          filtrosEq[col] = val;
          return qb;
        },
        gte: (col: string, val: any) => {
          filtroGte = { col, val };
          return qb;
        },
        is: () => qb,
        ilike: () => qb,
        order: () => qb,
        or: (cond: string) => {
          filtroOr = cond;
          return qb;
        },
        limit: (n: number) => {
          limitNum = n;
          return qb;
        },
        maybeSingle: async () => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            const achou = sessoes.find((s) => {
              if (filtrosEq.telefone && s.telefone !== filtrosEq.telefone) return false;
              if (
                filtroOr &&
                !(filtroOr.includes(s.telefone) || s.telefone.includes("999991111"))
              ) {
                return false;
              }
              return true;
            });
            return { data: achou || null, error: null };
          }
          if (tabela === "profiles") {
            const achou = (initialData.profiles || []).find((p) => {
              if (filtrosEq.telefone && p.telefone !== filtrosEq.telefone) return false;
              return true;
            });
            return { data: achou || null, error: null };
          }
          return { data: null, error: null };
        },
        delete: () => {
          return {
            eq: (_col: string, _val: any) => {
              if (tabela === "whatsapp_sessoes_dialogo") {
                sessoes.length = 0;
              }
              return Promise.resolve({ error: null });
            },
          };
        },
        upsert: async (payload: any) => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            const idx = sessoes.findIndex((s) => s.telefone === payload.telefone);
            if (idx >= 0) sessoes[idx] = { ...sessoes[idx], ...payload };
            else sessoes.push(payload);
          }
          return { error: null };
        },
        insert: async (payload: any) => {
          if (tabela === "whatsapp_sessoes_dialogo") {
            sessoes.push(payload);
          }
          return { error: null };
        },
        update: (payload: any) => {
          return {
            eq: (_col: string, _val: any) => {
              if (tabela === "whatsapp_sessoes_dialogo" && sessoes.length > 0) {
                sessoes[0] = { ...sessoes[0], ...payload };
              }
              return Promise.resolve({ error: null });
            },
          };
        },
        then: (resolve: any) => {
          if (tabela === "profiles") {
            resolve({ data: initialData.profiles || [], error: null });
          } else if (tabela === "revendedores") {
            let res = initialData.revendedores || [];
            if (filtrosEq.ativo !== undefined) {
              res = res.filter((r) => r.ativo === filtrosEq.ativo);
            }
            resolve({ data: res, error: null });
          } else if (tabela === "vendedores") {
            let res = initialData.vendedores || [];
            if (filtrosEq.ativo !== undefined) {
              res = res.filter((v) => v.ativo === filtrosEq.ativo);
            }
            if (filtrosEq.revendedor_id) {
              res = res.filter((v) => v.revendedor_id === filtrosEq.revendedor_id);
            }
            resolve({ data: res, error: null });
          } else if (tabela === "whatsapp_sessoes_dialogo") {
            resolve({ data: sessoes, error: null });
          } else if (tabela === "propostas_comerciais") {
            let res = [...propostas];
            if (filtrosEq.revendedor_id) {
              res = res.filter((p) => p.revendedor_id === filtrosEq.revendedor_id);
            }
            if (filtrosEq.vendedor_id) {
              res = res.filter((p) => p.vendedor_id === filtrosEq.vendedor_id);
            }
            if (filtroGte && filtroGte.col === "created_at") {
              res = res.filter((p) => p.created_at >= filtroGte!.val);
            }
            resolve({ data: res.slice(0, limitNum), error: null });
          } else {
            resolve({ data: [], error: null });
          }
        },
      };
      return qb;
    },
  } as any;
}

describe("Hunter — Relatório de Propostas Interativo (Período, Escopo e Data)", () => {
  const telAdmin = "5524999991111";
  const telVend = "5524999992222";

  const adminProfile = {
    id: "admin-1",
    nome: "Novaes",
    role: "admin",
    telefone: telAdmin,
  };

  const vendProfile = {
    id: "vend-1",
    nome: "Consultor Carlos",
    role: "vendedor",
    telefone: telVend,
  };

  const revendedores = [
    { id: "rev-1", nome: "Hunter Sul Fluminense", franquia: "Volta Redonda", ativo: true },
    { id: "rev-2", nome: "Hunter Barra Mansa", franquia: "Barra Mansa", ativo: true },
  ];

  const vendedores = [
    {
      id: "vend-1",
      nome: "Carlos Silva",
      telefone: telVend,
      revendedor_id: "rev-1",
      ativo: true,
      revendedores: { nome: "Hunter Sul Fluminense" },
    },
    {
      id: "vend-2",
      nome: "João Pereira",
      telefone: "5524999993333",
      revendedor_id: "rev-2",
      ativo: true,
      revendedores: { nome: "Hunter Barra Mansa" },
    },
  ];

  const propostasMock = [
    {
      id: "prop-1",
      numero_proposta: "PROP-2026-8091",
      cliente_nome: "Sérgio Ângelo de Souza",
      status: "enviada",
      com_fidelidade_mensalidade: 60,
      vendedor_id: "vend-1",
      revendedor_id: "rev-1",
      created_at: new Date().toISOString(),
    },
    {
      id: "prop-2",
      numero_proposta: "PROP-2026-8092",
      cliente_nome: "Transportadora Modelo Ltda",
      status: "aceita",
      com_fidelidade_mensalidade: 120,
      vendedor_id: null,
      revendedor_id: "rev-1",
      created_at: new Date().toISOString(),
    },
  ];

  it("1. SuperADM envia PROPOSTAS: deve iniciar diálogo solicitando o período (5 últimos, do mês, da semana, todos)", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: telAdmin,
        texto: "PROPOSTAS",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "relatorio_propostas_menu_periodo");
    assert.ok(res.resposta.includes("Escolha o período desejado:"), "Deve pedir o período");
    assert.ok(res.resposta.includes("5 Últimos"), "Deve ter opção 5 Últimos");
    assert.ok(res.resposta.includes("Do Mês"), "Deve ter opção Do Mês");
    assert.ok(res.resposta.includes("Da Semana"), "Deve ter opção Da Semana");
    assert.ok(res.resposta.includes("Todos"), "Deve ter opção Todos");
  });

  it("2. SuperADM escolhe período 2 (Do Mês): deve solicitar o escopo (Toda a Empresa, Revendedor ou Vendedor)", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    // Inicia sessão
    await processarMensagemWhatsappRecebida(
      {
        remetente: telAdmin,
        texto: "PROPOSTAS",
      },
      supabase,
    );

    // Escolhe opção 2 (Do Mês)
    const res = await processarMensagemWhatsappRecebida(
      {
        remetente: telAdmin,
        texto: "2",
      },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "relatorio_propostas_menu_escopo_admin");
    assert.ok(res.resposta.includes("Período selecionado: *Do Mês*"));
    assert.ok(res.resposta.includes("Toda a Empresa (Geral)"));
    assert.ok(res.resposta.includes("Escolher Revendedor"));
    assert.ok(res.resposta.includes("Escolher Vendedor"));
  });

  it("3. SuperADM escolhe escopo 1 (Toda a Empresa): gera relatório com data e nome do cliente", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "PROPOSTAS" }, supabase);
    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "2" }, supabase);

    const res = await processarMensagemWhatsappRecebida(
      { remetente: telAdmin, texto: "1" },
      supabase,
    );

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "relatorio_propostas_gerado_admin_geral");
    assert.ok(res.resposta.includes("Histórico Geral de Propostas da Empresa"));
    assert.ok(res.resposta.includes("Sérgio Ângelo de Souza"), "Deve conter o nome do cliente");
    assert.ok(res.resposta.includes("📅"), "Deve conter o ícone e a data da proposta");
    assert.ok(res.resposta.includes("Do Mês"), "Deve indicar o período filtrado");
  });

  it("4. SuperADM escolhe escopo 2 (Escolher Revendedor): deve listar revendedores cadastrados com números", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "PROPOSTAS" }, supabase);
    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "1" }, supabase); // 5 últimos

    const res = await processarMensagemWhatsappRecebida(
      { remetente: telAdmin, texto: "2" },
      supabase,
    ); // Escolher Revendedor

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "relatorio_propostas_lista_revendedores");
    assert.ok(res.resposta.includes("Selecionar Revendedor"));
    assert.ok(res.resposta.includes("Hunter Sul Fluminense"));
    assert.ok(res.resposta.includes("Hunter Barra Mansa"));
  });

  it("5. SuperADM seleciona o revendedor 1 da lista: gera relatório do revendedor com data e cliente", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "PROPOSTAS" }, supabase);
    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "4" }, supabase); // Todos
    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "2" }, supabase); // Revendedor

    const res = await processarMensagemWhatsappRecebida(
      { remetente: telAdmin, texto: "1" },
      supabase,
    ); // Seleciona Hunter Sul Fluminense

    assert.equal(res.sucesso, true);
    assert.equal(res.acaoExecutada, "relatorio_propostas_gerado_revendedor_escolhido");
    assert.ok(res.resposta.includes("Hunter Sul Fluminense"));
    assert.ok(res.resposta.includes("Sérgio Ângelo de Souza"));
    assert.ok(res.resposta.includes("📅"));
  });

  it("6. SuperADM escolhe escopo 3 (Escolher Vendedor): lista os vendedores e gera relatório ao escolher", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "PROPOSTAS" }, supabase);
    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "3" }, supabase); // Da Semana
    const menuVends = await processarMensagemWhatsappRecebida(
      { remetente: telAdmin, texto: "3" },
      supabase,
    ); // Vendedor

    assert.equal(menuVends.sucesso, true);
    assert.equal(menuVends.acaoExecutada, "relatorio_propostas_lista_vendedores");
    assert.ok(menuVends.resposta.includes("Carlos Silva"));

    const relVend = await processarMensagemWhatsappRecebida(
      { remetente: telAdmin, texto: "1" },
      supabase,
    );
    assert.equal(relVend.sucesso, true);
    assert.equal(relVend.acaoExecutada, "relatorio_propostas_gerado_vendedor_escolhido");
    assert.ok(relVend.resposta.includes("Carlos Silva"));
    assert.ok(relVend.resposta.includes("Sérgio Ângelo de Souza"));
  });

  it("7. Vendedor envia PROPOSTAS: após escolher o período, recebe imediatamente o relatório da sua carteira", async () => {
    const supabase = criarMockSupabase({
      profiles: [vendProfile],
      vendedores,
      propostas: propostasMock,
    });

    const resMenu = await processarMensagemWhatsappRecebida(
      {
        remetente: telVend,
        texto: "PROPOSTAS",
      },
      supabase,
    );

    assert.equal(resMenu.sucesso, true);
    assert.equal(resMenu.acaoExecutada, "relatorio_propostas_menu_periodo_vendedor");

    const resRel = await processarMensagemWhatsappRecebida(
      {
        remetente: telVend,
        texto: "1", // 5 últimos
      },
      supabase,
    );

    assert.equal(resRel.sucesso, true);
    assert.equal(resRel.acaoExecutada, "relatorio_propostas_gerado_vendedor");
    assert.ok(resRel.resposta.includes("Histórico de Propostas Comerciais"));
    assert.ok(resRel.resposta.includes("Sérgio Ângelo de Souza"));
    assert.ok(resRel.resposta.includes("📅"));
  });

  it("8. Cancelamento com CANCELAR encerra a sessão em qualquer etapa", async () => {
    const supabase = criarMockSupabase({
      profiles: [adminProfile],
      revendedores,
      vendedores,
      propostas: propostasMock,
    });

    await processarMensagemWhatsappRecebida({ remetente: telAdmin, texto: "PROPOSTAS" }, supabase);
    const resCancel = await processarMensagemWhatsappRecebida(
      {
        remetente: telAdmin,
        texto: "CANCELAR",
      },
      supabase,
    );

    assert.equal(resCancel.sucesso, true);
    assert.equal(resCancel.acaoExecutada, "relatorio_propostas_cancelado");
    assert.ok(resCancel.resposta.includes("Consulta de propostas cancelada"));
  });

  it("9. Regra Pétrea: Ausência estrita do caractere comercial proibido no arquivo de teste", () => {
    const testPath = path.resolve(
      process.cwd(),
      "src/test/__tests__/hunter-relatorio-propostas-guiado.test.ts",
    );
    const content = fs.readFileSync(testPath, "utf-8");
    const codigoLimpo = content.replace(/https?:\/\/[^\s"'`]+/g, "").replace(/&&/g, "");

    const linhas = codigoLimpo.split("\n");
    for (const linha of linhas) {
      if (linha.includes("caractere comercial proibido")) continue;
      assert.ok(
        !linha.includes(String.fromCharCode(38)),
        "Arquivo de teste não deve conter o caractere comercial proibido solto em texto",
      );
    }
  });
});
