import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PREFERENCIAS_PADRAO,
  CANAL_ALERTAS_CONFIG_REALTIME,
  type PreferenciasNotificacao,
} from "../../features/monitor-gps/services/notificacoesService";

describe("Hunter — Persistência de Alertas por Veículo e Sincronização Realtime Multi-Dispositivo (DJR-NEW)", () => {
  test("1. PREFERENCIAS_PADRAO: Contém todas as 10 chaves canônicas de alertas de segurança", () => {
    const chavesEsperadas: (keyof PreferenciasNotificacao)[] = [
      "movimento_fora_horario",
      "ignicao_fora_horario",
      "saida_area",
      "entrada_area",
      "excesso_velocidade",
      "perda_comunicacao",
      "baixa_tensao",
      "bateria_desconectada",
      "desvio_rota",
      "guincho",
    ];

    for (const chave of chavesEsperadas) {
      assert.ok(
        chave in PREFERENCIAS_PADRAO,
        `Chave de alerta '${chave}' deve estar definida nas preferências padrão`,
      );
    }
  });

  test("2. Regras do Veículo: Arquitetura suporta alertas_ativos no banco e sincronização Realtime", async () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261001115000_hunter_alertas_veiculo_realtime_e_persistente.sql",
    );
    const sqlContent = await fs.readFile(migrationPath, "utf-8");

    // 1. Adiciona coluna alertas_ativos em regras_veiculo
    assert.ok(
      sqlContent.includes("ALTER TABLE public.regras_veiculo"),
      "Migration deve alterar a tabela regras_veiculo",
    );
    assert.ok(
      sqlContent.includes("ADD COLUMN IF NOT EXISTS alertas_ativos JSONB"),
      "Migration deve adicionar a coluna alertas_ativos JSONB em regras_veiculo",
    );

    // 2. Habilita Realtime para regras_veiculo e horarios_utilizacao
    assert.ok(
      sqlContent.includes("ALTER PUBLICATION supabase_realtime ADD TABLE public.regras_veiculo"),
      "Deve adicionar regras_veiculo à publicação supabase_realtime",
    );
    assert.ok(
      sqlContent.includes(
        "ALTER PUBLICATION supabase_realtime ADD TABLE public.horarios_utilizacao",
      ),
      "Deve adicionar horarios_utilizacao à publicação supabase_realtime",
    );

    // 3. Trigger do servidor respeita as preferências salvas
    assert.ok(
      sqlContent.includes("trigger_avaliar_alertas_telemetria"),
      "Deve atualizar o trigger_avaliar_alertas_telemetria",
    );
    assert.ok(
      sqlContent.includes("v_alertas_ativos->>'excesso_velocidade'"),
      "Trigger deve validar a preferência de excesso_velocidade antes de disparar",
    );
    assert.ok(
      sqlContent.includes("v_alertas_ativos->>'ignicao_fora_horario'"),
      "Trigger deve validar a preferência de ignição fora de horário antes de disparar",
    );
    assert.ok(
      sqlContent.includes("v_alertas_ativos->>'movimento_fora_horario'"),
      "Trigger deve validar a preferência de movimento fora de horário antes de disparar",
    );
    assert.ok(
      sqlContent.includes("v_alertas_ativos->>'guincho'"),
      "Trigger deve validar a preferência de guincho antes de disparar",
    );
  });

  test("3. NotificacoesService: Exporta canal de broadcast e ouvintes Realtime para múltiplos dispositivos", async () => {
    assert.equal(
      CANAL_ALERTAS_CONFIG_REALTIME,
      "sigo_alertas_config_realtime",
      "Canal Realtime oficial deve ser sigo_alertas_config_realtime",
    );

    const servicePath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/services/notificacoesService.ts",
    );
    const serviceContent = await fs.readFile(servicePath, "utf-8");

    // Valida que carregarPreferenciasNotificacao prioriza o veículo
    assert.ok(
      serviceContent.includes("regras_veiculo"),
      "carregarPreferenciasNotificacao deve consultar regras_veiculo",
    );
    assert.ok(
      serviceContent.includes("ouvirAtualizacoesPreferenciasNotificacao"),
      "notificacoesService deve exportar ouvirAtualizacoesPreferenciasNotificacao",
    );
    assert.ok(
      serviceContent.includes("hunter_configuracao_alertas_alterada"),
      "Deve emitir evento local para sincronização instantânea na mesma janela",
    );
  });

  test("4. ConfiguracaoProtecaoModal: Sincroniza em tempo real e persiste por veículo", async () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/ConfiguracaoProtecaoModal.tsx",
    );
    const modalContent = await fs.readFile(modalPath, "utf-8");

    // Passa veiculo.id ao carregar e salvar
    assert.ok(
      modalContent.includes("carregarPreferenciasNotificacao(session?.userId, veiculo.id)"),
      "Deve carregar preferências passando o ID do veículo",
    );
    assert.ok(
      modalContent.includes(
        'salvarPreferenciasNotificacao(session?.userId || "", notificacoes, veiculo.id)',
      ),
      "Deve salvar preferências passando o ID do veículo",
    );
    assert.ok(
      modalContent.includes("ouvirAtualizacoesPreferenciasNotificacao"),
      "Deve escutar atualizações Realtime de outros dispositivos e usuários",
    );
  });

  test("5. GpsMonitorView: Recarrega preferências ao alternar veículo e assina Realtime", async () => {
    const gpsPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const gpsContent = await fs.readFile(gpsPath, "utf-8");

    assert.ok(
      gpsContent.includes(
        "carregarPreferenciasNotificacao(session?.userId, veiculoSelecionado?.id)",
      ),
      "GpsMonitorView deve carregar preferências por veículo selecionado",
    );
    assert.ok(
      gpsContent.includes("ouvirAtualizacoesPreferenciasNotificacao"),
      "GpsMonitorView deve assinar atualizações Realtime inter-dispositivos",
    );
  });
});
