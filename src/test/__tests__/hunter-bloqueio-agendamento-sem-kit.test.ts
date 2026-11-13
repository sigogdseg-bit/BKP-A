import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  temKitDisponibilizado,
  MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO,
} from "../../features/instalacoes/utils/kitDisponibilizado";

describe("Hunter — Bloqueio de Agendamento Sem Kit Disponibilizado", () => {
  it("deve retornar false para valores não disponibilizados ou pendentes de estoque", () => {
    assert.equal(temKitDisponibilizado(null), false);
    assert.equal(temKitDisponibilizado(undefined), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: null }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "   " }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "AGUARDANDO ESTOQUE" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "aguardando estoque" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "PENDENTE" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "A DEFINIR" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "SEM RASTREADOR" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "A CONFERIR" }), false);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "NENHUM" }), false);
  });

  it("deve retornar true para qualquer IMEI real de kit previamente disponibilizado", () => {
    assert.equal(temKitDisponibilizado({ rastreador_imei: "1234" }), true);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "860123456789012" }), true);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "  860123456789012  " }), true);
    assert.equal(temKitDisponibilizado({ rastreador_imei: "KIT-9901" }), true);
  });

  it("deve conter a mensagem canônica clara e amigável sem jargões de banco", () => {
    assert.ok(MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO.length > 0);
    assert.ok(
      !MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO.includes("schema cache"),
      "Não pode conter jargão de schema cache",
    );
    assert.ok(
      !MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO.includes("PGRST"),
      "Não pode conter código PostgREST",
    );
    assert.ok(
      !MENSAGEM_ERRO_SEM_KIT_DISPONIBILIZADO.includes("&"),
      "Não pode conter o caractere comercial proibido &",
    );
  });

  it("filtro da aba A Agendar deve descartar ordens sem kit mesmo se a data estiver vazia", () => {
    const instalacoesSimuladas = [
      {
        id: "1",
        status: "pendente",
        data_agendamento: null,
        rastreador_imei: "AGUARDANDO ESTOQUE",
      },
      { id: "2", status: "pendente", data_agendamento: null, rastreador_imei: "860123456789012" },
      {
        id: "3",
        status: "agendado",
        data_agendamento: "2026-10-15",
        rastreador_imei: "860123456789012",
      },
      {
        id: "4",
        status: "concluida",
        data_agendamento: "2026-10-01",
        rastreador_imei: "860123456789012",
      },
      { id: "5", status: "pendente", data_agendamento: null, rastreador_imei: "PENDENTE" },
    ];

    const aAgendar = instalacoesSimuladas.filter(
      (i) => i.status !== "concluida" && !i.data_agendamento && temKitDisponibilizado(i),
    );

    assert.equal(aAgendar.length, 1);
    assert.equal(aAgendar[0].id, "2");
  });

  it("migração da RPC de agendamento não deve referenciar tabelas inexistentes e deve usar colunas válidas", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sqlPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261010123000_hunter_fix_rpc_agendamento_instalacao_sem_erro.sql",
    );
    assert.ok(fs.existsSync(sqlPath), "Arquivo de migração corrigido deve existir.");
    const content = fs.readFileSync(sqlPath, "utf-8");

    assert.ok(
      !content.includes("INSERT INTO public.cliente_historico") &&
        !content.includes("FROM public.cliente_historico"),
      "Não pode referenciar tabela inexistente cliente_historico",
    );
    assert.ok(
      content.includes("destinatario_user_id"),
      "Deve usar destinatario_user_id em notificacoes_sistema",
    );
    assert.ok(
      content.includes("destinatario_cliente_id"),
      "Deve usar destinatario_cliente_id em notificacoes_sistema",
    );
    assert.ok(
      !content.includes("INSERT INTO public.notificacoes_sistema (\n      user_id,"),
      "Não pode usar coluna inexistente user_id em notificacoes_sistema",
    );
    assert.ok(
      content.includes("NOTIFY pgrst, 'reload schema';"),
      "Deve invalidar schema cache ao final",
    );
  });
});
