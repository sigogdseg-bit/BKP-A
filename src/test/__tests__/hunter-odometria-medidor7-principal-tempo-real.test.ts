import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { calcularOdometroMedia1456 } from "@/features/monitor-gps/lib/motoresOdometroComparativo";

describe("Hunter — Medidor 7: Média Fusional dos Medidores 1, 4, 5 e 6 em Tempo Real", () => {
  it("1. Deve calcular a média aritmética exata dos 4 medidores (1, 4, 5 e 6)", () => {
    const m1 = 183421.0; // Medidor 1: WGS-84 Elipsoidal Base
    const m4 = 183422.5; // Medidor 4: Motor A Bayesiano 1D
    const m5 = 183420.8; // Medidor 5: Motor B Haversine Esférico
    const m6 = 183421.7; // Medidor 6: Motor C EKF Canônico

    // Média = (183421.0 + 183422.5 + 183420.8 + 183421.7) / 4 = 733686.0 / 4 = 183421.5 km
    const mediaCalculada = calcularOdometroMedia1456(m1, m4, m5, m6);
    const mediaEsperada = Number(((m1 + m4 + m5 + m6) / 4.0).toFixed(3));

    assert.strictEqual(mediaCalculada, mediaEsperada);
    assert.strictEqual(mediaCalculada, 183421.5);
  });

  it("2. Deve atualizar em tempo real a cada variação de telemetria recebida", () => {
    let m1 = 100.0;
    let m4 = 100.0;
    let m5 = 100.0;
    let m6 = 100.0;

    let media = calcularOdometroMedia1456(m1, m4, m5, m6);
    assert.strictEqual(media, 100.0, "Na largada equalizada, a média deve ser idêntica");

    // Ping 1 em tempo real: veículo avança 0.120 km no WGS-84 e 0.124 km no Motor A
    m1 += 0.12;
    m4 += 0.124;
    m5 += 0.119;
    m6 += 0.121;

    media = calcularOdometroMedia1456(m1, m4, m5, m6);
    const mediaEsperada = Number(((100.12 + 100.124 + 100.119 + 100.121) / 4.0).toFixed(3));
    assert.strictEqual(media, mediaEsperada);
    assert.ok(media > 100.0, "Odômetro consensual deve avançar estritamente em tempo real");
  });

  it("3. Lida com valores nulos ou indefinidos recorrendo ao valor base sem quebrar o cálculo", () => {
    const base = 50000.0;
    const media = calcularOdometroMedia1456(base, null, undefined, null);
    assert.strictEqual(
      media,
      base,
      "Quando os motores ainda não tiverem ping, recorre à base com segurança",
    );
  });

  it("4. Regra Pétrea: Usuários comuns devem ver somente o 7º medidor como odômetro acumulado no Cockpit", () => {
    const drawerPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
    );
    const drawerCode = fs.readFileSync(drawerPath, "utf-8");

    // Validação estrita no código-fonte
    assert.ok(
      drawerCode.includes("const odometroPrincipal7 = calcularOdometroMedia1456"),
      "VehicleTelemetryDrawer deve calcular odometroPrincipal7 via calcularOdometroMedia1456",
    );
    assert.ok(
      drawerCode.includes("odometroPrincipal7.toLocaleString("),
      "VehicleTelemetryDrawer deve exibir odometroPrincipal7 para usuários",
    );
    assert.ok(
      drawerCode.includes("BANCADA DE ODOMETRIA COMPARATIVA · 7 MOTORES SIMULTÂNEOS ATIVOS"),
      "Bancada do SuperADM deve declarar 7 motores simultâneos ativos",
    );
    assert.ok(
      drawerCode.includes("7. PRINCIPAL (1, 4, 5 E 6)"),
      "Bancada SuperADM deve conter o Card 7 com o consenso fusional",
    );
  });

  it("5. Banco de Dados: Migração e RPC registrar_posicao_gps_com_odometro persistem o 7º medidor como odometro_km", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261023153000_hunter_odometro_medidor7_principal_media_fusional.sql",
    );
    const sqlCode = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sqlCode.includes("odometro_wgs84_km NUMERIC(12, 3)"),
      "Migração deve criar odometro_wgs84_km",
    );
    assert.ok(
      sqlCode.includes("odometro_motor_media_km NUMERIC(12, 3)"),
      "Migração deve criar odometro_motor_media_km",
    );
    assert.ok(
      sqlCode.includes(
        "v_novo_media_7     := ROUND((v_novo_wgs84 + v_novo_motor_a + v_novo_motor_b + v_novo_motor_c) / 4.0, 3)",
      ),
      "RPC deve calcular v_novo_media_7 com a média exata dos medidores 1, 4, 5 e 6",
    );
    assert.ok(
      sqlCode.includes("odometro_km              = v_novo_media_7"),
      "RPC deve gravar o 7º medidor como odometro_km principal do veículo",
    );
    assert.ok(
      sqlCode.includes("NOTIFY pgrst, 'reload schema'"),
      "Migração deve invalidar o cache PostgREST",
    );

    const masterSqlPath = path.resolve(
      process.cwd(),
      "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const masterCode = fs.readFileSync(masterSqlPath, "utf-8");
    assert.ok(
      masterCode.includes("20261023153000_hunter_odometro_medidor7_principal_media_fusional.sql"),
      "Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a migração do 7º medidor",
    );
  });
});
