import { describe, test, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  foiNotificacaoProcessada,
  limparCacheNotificacoesProcessadas,
} from "../../shared/lib/notificacoesBdService";

function lerArquivo(relPath: string): string {
  const fullPath = path.resolve(process.cwd(), relPath);
  return fs.readFileSync(fullPath, "utf-8");
}

describe("Blindagem Anti-Duplicação de Notificações e Web Push (HUNTER-GUARDIAN)", () => {
  beforeEach(() => {
    limparCacheNotificacoesProcessadas();
  });

  test("1. foiNotificacaoProcessada deve impedir duplicata com a mesma chave semântica (destinatário + tipo + mensagem)", () => {
    const notif1 = {
      id: "notif-broadcast-123",
      destinatario_cliente_id: "cliente-abc",
      remetente_user_id: "operador-xyz",
      tipo: "bateria_desconectada",
      mensagem: "O veículo está sem alimentação da bateria principal.",
      titulo: "🚨 ALERTA: BATERIA DESCONECTADA",
    };

    // Primeira vez: deve retornar false (não processada)
    assert.strictEqual(
      foiNotificacaoProcessada(notif1),
      false,
      "Primeira ocorrência deve ser aceita",
    );

    // Segunda vez: mesma notificação vinda via Postgres Changes (com id diferente ou sem remetente)
    const notif2 = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      destinatario_cliente_id: "cliente-abc",
      remetente_user_id: null,
      tipo: "bateria_desconectada",
      mensagem: "O veículo está sem alimentação da bateria principal.",
      titulo: "🚨 ALERTA: BATERIA DESCONECTADA",
    };

    assert.strictEqual(
      foiNotificacaoProcessada(notif2),
      true,
      "Segunda ocorrência com o mesmo destinatário, tipo e mensagem deve ser deduplicada",
    );
  });

  test("2. foiNotificacaoProcessada deve tratar IDs com ou sem o prefixo 'sigo-notif-' de forma equivalente", () => {
    const notifSemPrefixo = {
      id: "uuid-teste-999",
      destinatario_cliente_id: "cliente-1",
      tipo: "socorro",
      mensagem: "Botão de pânico acionado.",
      titulo: "SOCORRO",
    };

    assert.strictEqual(foiNotificacaoProcessada(notifSemPrefixo), false);

    const notifComPrefixo = {
      id: "sigo-notif-uuid-teste-999",
      destinatario_cliente_id: "cliente-2",
      tipo: "outro",
      mensagem: "Mensagem diferente",
      titulo: "Outro Alerta",
    };

    assert.strictEqual(
      foiNotificacaoProcessada(notifComPrefixo),
      true,
      "Mesmo UUID normalizado com 'sigo-notif-' deve ser reconhecido como já processado",
    );
  });

  test("3. server.ts deve implementar pushDispatchDedupCache e rejeitar disparos repetidos", () => {
    const serverCode = lerArquivo("src/server.ts");

    assert.ok(
      serverCode.includes("pushDispatchDedupCache"),
      "server.ts deve conter o mapa pushDispatchDedupCache para evitar disparos paralelos",
    );
    assert.ok(
      serverCode.includes("canonicalTag") && serverCode.includes("sigo-notif-"),
      "server.ts deve normalizar tags para o prefixo canônico sigo-notif-",
    );
    assert.ok(
      serverCode.includes("duplicado: true"),
      "server.ts deve retornar status de duplicado: true quando a notificação já foi enviada recentemente",
    );
  });

  test("4. notificacoesBdService.ts deve enviar tag uniforme 'sigo-notif-' no fetch para /api/push/disparar", () => {
    const serviceCode = lerArquivo("src/shared/lib/notificacoesBdService.ts");

    assert.ok(
      serviceCode.includes("tagUniforme") && serviceCode.includes("sigo-notif-"),
      "notificacoesBdService deve padronizar tag com prefixo sigo-notif-",
    );
  });

  test("5. public/sw.js deve normalizar a tag e possuir verificação semântica de duplicata", () => {
    const swCode = lerArquivo("public/sw.js");

    assert.ok(swCode.includes("sigo-notif-"), "sw.js deve normalizar tags para sigo-notif-");
    assert.ok(
      swCode.includes("chaveSemantica") && swCode.includes("isDuplicata"),
      "sw.js deve verificar isDuplicata com a chave semântica do alerta",
    );
  });

  test("6. Regras Pétreas Hunter-Guardian: Nenhum arquivo modificado deve conter referências cruzadas ou caractere comercial proibido", () => {
    const arquivos = ["src/server.ts", "src/shared/lib/notificacoesBdService.ts", "public/sw.js"];

    for (const arq of arquivos) {
      const conteudo = lerArquivo(arq);
      assert.ok(
        !conteudo.includes("SIGOVTR") && !conteudo.includes("SIGOFROTA"),
        `${arq} não deve conter referências a sistemas externos proibidos`,
      );
    }
  });

  test("7. notificar_equipe_operacao deve gravar destinatario_cliente_id como NULL para não vazar aos clientes", () => {
    const migCode = lerArquivo(
      "supabase/migrations/20261010142500_hunter_notificacao_operadores_historico_cliente.sql",
    );
    const mestreCode = lerArquivo("supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    const trechoMig = migCode.slice(migCode.indexOf("FUNCTION public.notificar_equipe_operacao"));
    const trechoMestre = mestreCode.slice(
      mestreCode.indexOf("FUNCTION public.notificar_equipe_operacao"),
    );

    assert.ok(
      trechoMig.includes(
        "NULL, -- Destinatário é estritamente a equipe interna (r.id), NUNCA o cliente",
      ),
      "Migration notificar_equipe_operacao deve definir destinatario_cliente_id como NULL",
    );
    assert.ok(
      trechoMestre.includes(
        "NULL, -- Destinatário é estritamente a equipe interna (r.id), NUNCA o cliente",
      ),
      "Script mestre notificar_equipe_operacao deve definir destinatario_cliente_id como NULL",
    );
  });

  test("8. TelaClienteAguardandoInstalacao deve possuir anti-eco, validação de destinatário e deduplicação", () => {
    const clienteCode = lerArquivo(
      "src/features/clientes/components/TelaClienteAguardandoInstalacao.tsx",
    );

    assert.ok(
      clienteCode.includes("notif.remetente_user_id === session.userId"),
      "TelaClienteAguardandoInstalacao deve descartar notificações do próprio remetente (anti-eco)",
    );
    assert.ok(
      clienteCode.includes("foiNotificacaoProcessada(notif)"),
      "TelaClienteAguardandoInstalacao deve usar foiNotificacaoProcessada para evitar sons/toasts duplicados",
    );
    assert.ok(
      clienteCode.includes("ehParaMim"),
      "TelaClienteAguardandoInstalacao deve filtrar estritamente o destinatário",
    );
  });

  test("9. Rota canônica /instalacao deve ser utilizada estritamente sem divergências de plural", () => {
    const migCode = lerArquivo(
      "supabase/migrations/20261010142500_hunter_notificacao_operadores_historico_cliente.sql",
    );
    const mestreCode = lerArquivo("supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const historicoCode = lerArquivo("src/features/clientes/components/HistoricoClienteModal.tsx");

    assert.ok(
      migCode.includes("p_url TEXT DEFAULT '/instalacao'"),
      "Migration notificar_equipe_operacao deve usar a rota canônica /instalacao",
    );
    assert.ok(
      mestreCode.includes("p_url TEXT DEFAULT '/instalacao'"),
      "Script mestre notificar_equipe_operacao deve usar a rota canônica /instalacao",
    );
    assert.ok(
      !historicoCode.includes('"/instalacoes"'),
      "HistoricoClienteModal não deve referenciar rota inexistente no plural",
    );
    assert.ok(
      historicoCode.includes('"/instalacao"'),
      "HistoricoClienteModal deve referenciar a rota canônica correta /instalacao",
    );
  });
});
