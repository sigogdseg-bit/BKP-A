import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("HUNTER / GD RASTREAMENTO — Fix Login Motoristas (GoTrue NULLs) & Lógica Canônica de Alertas", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261020183000_hunter_fix_login_motoristas_auth_users_e_alertas_ciclo_geofence.sql",
  );
  const mestrePath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
  const serverPath = path.resolve(process.cwd(), "src/server.ts");

  it("1. Saneamento e Blindagem de auth.users: deve sanear NULLs e criar trigger global", () => {
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração deve existir");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Saneamento de NULLs
    assert.ok(
      sql.includes("UPDATE auth.users"),
      "Deve conter comando de saneamento UPDATE auth.users",
    );
    assert.ok(
      sql.includes("confirmation_token = COALESCE(confirmation_token, '')"),
      "Deve converter confirmation_token NULL para string vazia",
    );
    assert.ok(
      sql.includes("recovery_token = COALESCE(recovery_token, '')"),
      "Deve converter recovery_token NULL para string vazia",
    );

    // Trigger global BEFORE INSERT OR UPDATE
    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION auth.trg_sanitizar_auth_users_nulls()"),
      "Deve criar função trg_sanitizar_auth_users_nulls",
    );
    assert.ok(
      sql.includes("BEFORE INSERT OR UPDATE ON auth.users"),
      "Deve disparar BEFORE INSERT OR UPDATE ON auth.users",
    );
  });

  it("2. cadastrar_motorista: deve inserir todas as colunas GoTrue para prevenir Database error querying schema", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION public.cadastrar_motorista("),
      "Deve recriar a função public.cadastrar_motorista",
    );
    assert.ok(
      sql.includes("confirmation_token, recovery_token, email_change_token_new, email_change"),
      "Deve especificar confirmation_token e recovery_token no INSERT",
    );
    assert.ok(sql.includes("auth.identities"), "Deve inserir identity canônica em auth.identities");
    assert.ok(
      sql.includes("'role', 'motorista'"),
      "Deve associar role motorista no raw_user_meta_data",
    );
    assert.ok(
      sql.includes("public.profiles"),
      "Deve criar perfil na tabela public.profiles com role motorista",
    );
  });

  it("3. Alerta de Deslocamento Fora do Horário: estritamente 1 alerta por ciclo de ignição", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Reset ao desligar a chave
    assert.ok(
      sql.includes("IF NEW.ignicao_status = false THEN"),
      "Deve tratar evento de chave desligada",
    );
    assert.ok(
      sql.includes("DELETE FROM public.alertas_telemetria_cooldown"),
      "Deve apagar cooldown de movimento_fora_horario ao desligar a chave",
    );

    // Verificação sem limite temporal de 5 min enquanto chave ligada
    assert.ok(
      sql.includes("tipo_alerta = 'movimento_fora_horario'"),
      "Deve verificar se já foi alertado movimento_fora_horario",
    );
    assert.ok(
      sql.includes(
        "-- SEM limite temporal de 5 minutos: enquanto ignicao_status = true, trava absolutamente",
      ) ||
        sql.includes(
          "SEM limite temporal de 5 min: enquanto a ignição estiver true, o bloqueio é absoluto",
        ) ||
        (sql.includes("SELECT (") &&
          sql.includes("NOT EXISTS (") &&
          sql.includes("WHERE veiculo_id = NEW.id") &&
          sql.includes("tipo_alerta = 'movimento_fora_horario'")),
      "Não deve expirar por 5 min enquanto a ignição estiver ativa",
    );
  });

  it("4. Alerta de Saída e Entrada em Área Monitorada: máquina de estados estrita com histerese", () => {
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Histerese com tolerância
    assert.ok(
      sql.includes("v_tolerancia := GREATEST(COALESCE(v_area.tolerancia_metros, 30.0), 20.0);"),
      "Deve usar tolerância mínima de 20m para histerese",
    );
    assert.ok(
      sql.includes("v_raio_saida := v_area.raio_metros + v_tolerancia;"),
      "Raio de saída deve considerar raio + histerese de tolerância",
    );

    // Transição de saída
    assert.ok(
      sql.includes("v_estado_anterior = 'dentro' AND v_dist_area_new > v_raio_saida"),
      "Saída requer estado anterior dentro e distância além do raio com histerese",
    );
    assert.ok(
      sql.includes("ultimo_evento_tipo = 'saida_area'"),
      "Deve marcar ultimo_evento_tipo como saida_area",
    );

    // Transição de entrada
    assert.ok(
      sql.includes("v_estado_anterior = 'fora' AND v_dist_area_new <= v_raio_entrada"),
      "Entrada requer estado anterior fora e distância dentro do raio",
    );
    assert.ok(
      sql.includes("ultimo_evento_tipo = 'entrada_area'"),
      "Deve marcar ultimo_evento_tipo como entrada_area",
    );
  });

  it("5. Script Mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter todas as atualizações", () => {
    const mestreSql = fs.readFileSync(mestrePath, "utf-8");

    assert.ok(
      mestreSql.includes("trg_sanitizar_auth_users_nulls"),
      "Script mestre deve conter trg_sanitizar_auth_users_nulls",
    );
    assert.ok(
      mestreSql.includes("FUNCTION public.cadastrar_motorista("),
      "Script mestre deve conter cadastrar_motorista corrigido",
    );
    assert.ok(
      mestreSql.includes("ultimo_evento_tipo = 'saida_area'"),
      "Script mestre deve conter maquina de estados de geofence com saida_area",
    );
    assert.ok(
      mestreSql.includes("NOTIFY pgrst, 'reload schema';"),
      "Script mestre deve finalizar com NOTIFY pgrst",
    );
  });

  it("6. Servidor server.ts: deduplicação de geofence deve isolar área e verificar eventos pendentes", () => {
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      serverCode.includes("resPendente"),
      "Deve consultar se há evento pendente de despacho no banco",
    );
    assert.ok(
      serverCode.includes("matchArea"),
      "Deve isolar o nome da área na chave de deduplicação",
    );
    assert.ok(serverCode.includes("areaKey"), "Deve incluir areaKey na chave de deduplicação");
  });
});
