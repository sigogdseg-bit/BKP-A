import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PREFERENCIAS_PADRAO,
  type PreferenciasNotificacao,
} from "../../features/monitor-gps/services/notificacoesService";

describe("Hunter — Alertas de Bateria, Fallback de Coordenadas e Notificação ao Cliente", () => {
  test("1. Preferências de Proteção: bateria_desconectada existe e vem ativada por padrão", () => {
    assert.ok(
      "bateria_desconectada" in PREFERENCIAS_PADRAO,
      "Chave bateria_desconectada deve existir em PREFERENCIAS_PADRAO",
    );
    assert.equal(
      PREFERENCIAS_PADRAO.bateria_desconectada,
      true,
      "bateria_desconectada deve ser true por padrão",
    );
  });

  test("2. Modal de Proteção: possui opção para o cliente ativar/desativar notificação de falta de bateria", async () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const content = await fs.readFile(modalPath, "utf-8");

    assert.ok(
      content.includes('chave: "bateria_desconectada"'),
      "ConfiguracaoProtecaoModal deve ter item com chave bateria_desconectada",
    );
    assert.ok(
      content.includes("Corte / Desconexão da bateria principal"),
      "ConfiguracaoProtecaoModal deve exibir título claro de Corte / Desconexão da bateria principal",
    );
    const linhasSemOperadorLogico = content
      .split("\n")
      .filter((l) => !l.includes("&&") && !l.includes("&amp;"));
    for (const linha of linhasSemOperadorLogico) {
      assert.doesNotMatch(linha, /\s&\s/, `Linha contém & comercial proibido: ${linha}`);
    }
  });

  test("3. Anti-Null Island: AlertasAcidenteBanner valida coordenadas antes de exibir", async () => {
    const bannerPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/AlertasAcidenteBanner.tsx",
    );
    const content = await fs.readFile(bannerPath, "utf-8");

    assert.ok(
      content.includes("temCoordsValidas"),
      "AlertasAcidenteBanner deve conter helper temCoordsValidas",
    );
    assert.ok(
      content.includes("Localização GPS pendente / sem sinal no evento"),
      "Deve exibir mensagem clara de pendência quando coordenadas forem zeradas",
    );
    const linhasBanner = content
      .split("\n")
      .filter((l) => !l.includes("&&") && !l.includes("&amp;"));
    for (const linha of linhasBanner) {
      assert.doesNotMatch(linha, /\s&\s/, `Linha contém & comercial proibido: ${linha}`);
    }
  });

  test("4. gpsService: fallback de coordenadas herda última posição do veículo quando zeradas", async () => {
    const servicePath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/services/gpsService.ts",
    );
    const content = await fs.readFile(servicePath, "utf-8");

    assert.ok(
      content.includes("ultima_latitude"),
      "gpsService deve selecionar ultima_latitude do veículo",
    );
    assert.ok(
      content.includes("fallbackLat"),
      "carregarAlertasSeguranca deve usar fallbackLat quando latitude for 0",
    );
    assert.ok(
      content.includes("salvarAlertaSeguranca"),
      "salvarAlertaSeguranca deve estar exportada",
    );
  });

  test("5. Hunter Gateway: rastreador registra e repassa coordenadas reais e emite bateria_desconectada", async () => {
    const gatewayPath = path.resolve(
      process.cwd(),
      "deploy/hunter-gateway/src/hunter-gps-gateway.ts",
    );
    const content = await fs.readFile(gatewayPath, "utf-8");

    assert.ok(
      content.includes("conn.ultimoLat = latitude"),
      "Gateway deve atualizar ultimoLat ao receber posições GPS",
    );
    assert.ok(
      content.includes('tipo: "bateria_desconectada"'),
      "Gateway deve registrar bateria_desconectada na transição de alimentação externa",
    );
    assert.ok(
      content.includes("lat: conn.ultimoLat"),
      "Gateway deve repassar conn.ultimoLat nos eventos de corte de bateria",
    );
  });

  test("6. Migration SQL: RPC registrar_alerta_seguranca grava em notificacoes_sistema e valida regras_veiculo", async () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261002120000_hunter_alerta_bateria_notificacao_e_coords_fix.sql",
    );
    const content = await fs.readFile(migrationPath, "utf-8");

    assert.ok(
      content.includes("INSERT INTO public.notificacoes_sistema"),
      "RPC registrar_alerta_seguranca deve inserir em notificacoes_sistema para entrega automática",
    );
    assert.ok(
      content.includes("v_alertas_ativos->>'bateria_desconectada'"),
      "RPC deve validar a preferência bateria_desconectada do cliente",
    );
    assert.ok(
      content.includes("ignorado_por_preferencia"),
      "RPC deve ignorar alerta quando o cliente desativar nas configurações",
    );
    assert.ok(
      content.includes("p_latitude := v_ult_lat"),
      "RPC deve aplicar fallback de latitude quando p_latitude for 0",
    );
  });
});
