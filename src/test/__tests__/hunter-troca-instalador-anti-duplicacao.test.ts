import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { foiNotificacaoProcessada } from "@/shared/lib/notificacoesBdService";

describe("Hunter — Troca de Instalador, Exibição de Veículos e Anti-Duplicação de Notificações", () => {
  it("1. InstalacoesView: deve exibir veículos 'a_agendar' mesmo quando o kit/rastreador ainda não foi liberado", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/InstalacoesView.tsx",
    );
    const viewContent = fs.readFileSync(viewPath, "utf-8");

    // totalAAgendar não pode filtrar por temKitDisponibilizado
    assert.ok(
      viewContent.includes(
        'instalacoes.filter((i) => i.status !== "concluida" && !i.data_agendamento)',
      ),
      "totalAAgendar deve contabilizar todas as ordens não concluídas sem data de agendamento, sem ocultar por falta de kit.",
    );

    // Na aba a_agendar, base não pode excluir quem está sem kit
    assert.ok(
      viewContent.includes(
        'if (abaAtiva === "a_agendar") {\n        base = base.filter((i) => i.status !== "concluida" && !i.data_agendamento);',
      ),
      "Aba a_agendar deve listar ordens sem data de agendamento independentemente de ter rastreador definido.",
    );

    // Deve conter o indicador explicativo 'Aguardando Kit do Operador'
    assert.ok(
      viewContent.includes("Aguardando Kit do Operador"),
      "Card de instalação deve exibir badge Aguardando Kit do Operador quando o operador ainda não definiu o rastreador.",
    );
  });

  it("2. InstalacoesView: deve focar automaticamente na aba 'a_agendar' se o instalador não tiver ordens agendadas", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/InstalacoesView.tsx",
    );
    const viewContent = fs.readFileSync(viewPath, "utf-8");

    assert.ok(
      viewContent.includes("!temAgendadas && temAAgendar") &&
        viewContent.includes('setAbaAtiva((prev) => (prev === "a_instalar" ? "a_agendar" : prev))'),
      "InstalacoesView deve priorizar a aba a_agendar para o instalador quando totalAInstalar for zero e existirem novas ordens a agendar.",
    );
  });

  it("3. Anti-Duplicação no Frontend: foiNotificacaoProcessada deve deduplicar notificações por placa e destinatário", () => {
    const agora = Date.now();
    const notif1 = {
      id: `teste-${agora}-1`,
      destinatario_user_id: "user-instalador-123",
      tipo: "instalacao",
      titulo: "🔧 Nova Instalação: BRA2E19",
      mensagem: "Veículo atribuído à oficina",
      placa: "BRA2E19",
      created_at: new Date().toISOString(),
    };

    const notifDuplicada = {
      id: `teste-${agora}-2`,
      destinatario_user_id: "user-instalador-123",
      tipo: "instalacao",
      titulo: "🔧 Nova Instalação Atribuída: BRA2E19",
      mensagem: "Texto ligeiramente diferente gerado por outro disparador",
      placa: "BRA-2E19",
      created_at: new Date().toISOString(),
    };

    const processada1 = foiNotificacaoProcessada(notif1 as any);
    const processada2 = foiNotificacaoProcessada(notifDuplicada as any);

    assert.strictEqual(
      processada1,
      false,
      "A primeira notificação deve ser processada normalmente.",
    );
    assert.strictEqual(
      processada2,
      true,
      "A segunda notificação com a mesma placa e destinatário deve ser descartada como duplicada.",
    );
  });

  it("4. Migração e Script Mestre: trg_anti_duplicacao_notificacoes_sistema e admin_atualizar_cliente_completo", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261010163000_hunter_sincronizacao_troca_instalador_e_anti_duplicacao_notificacoes.sql",
    );
    const mestrePath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    const migContent = fs.readFileSync(migPath, "utf-8");
    const mestreContent = fs.readFileSync(mestrePath, "utf-8");

    // Ambos devem conter o trigger anti-duplicação global
    assert.ok(
      migContent.includes("trg_anti_duplicacao_notificacoes_sistema"),
      "Migração deve conter o trigger trg_anti_duplicacao_notificacoes_sistema.",
    );
    assert.ok(
      mestreContent.includes("trg_anti_duplicacao_notificacoes_sistema"),
      "Script mestre deve espelhar o trigger trg_anti_duplicacao_notificacoes_sistema.",
    );

    // Ambos devem atualizar ordens pendentes e gerar ordens para veículos sem ordem aberta
    assert.ok(
      migContent.includes("UPDATE public.instalacoes") &&
        migContent.includes("INSERT INTO public.instalacoes"),
      "Migração deve atualizar ordens existentes e gerar novas ordens para veículos pendentes do cliente.",
    );
    assert.ok(
      mestreContent.includes("UPDATE public.instalacoes") &&
        mestreContent.includes("INSERT INTO public.instalacoes"),
      "Script mestre deve espelhar o provisionamento de ordens na atualização de cliente.",
    );

    // Zero Schema Cache Error: NOTIFY pgrst
    assert.ok(
      migContent.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve finalizar com invalidação de cache PostgREST.",
    );
  });
});
