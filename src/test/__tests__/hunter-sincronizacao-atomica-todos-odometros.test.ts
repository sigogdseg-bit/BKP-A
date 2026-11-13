import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter - Sincronização Atômica dos 7 Odômetros e Hardware J16", () => {
  const migracaoPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261027103000_hunter_ajustar_todos_odometros_canonicos.sql",
  );
  const masterSqlPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

  it("1. A migração SQL deve existir e atualizar atomicamente todos os 7 odômetros", () => {
    assert.ok(fs.existsSync(migracaoPath), "Arquivo de migração deve existir");
    const conteudo = fs.readFileSync(migracaoPath, "utf-8");

    // Valida atualização atômica de todos os 7 medidores canônicos
    assert.ok(/odometro_km\s*=\s*v_novo_km/.test(conteudo), "Deve atualizar odometro_km");
    assert.ok(
      /odometro_motor_media_km\s*=\s*v_novo_km/.test(conteudo),
      "Deve atualizar odometro_motor_media_km",
    );
    assert.ok(
      /odometro_wgs84_km\s*=\s*v_novo_km/.test(conteudo),
      "Deve atualizar odometro_wgs84_km",
    );
    assert.ok(
      /odometro_cinematico_km\s*=\s*v_novo_km/.test(conteudo),
      "Deve atualizar odometro_cinematico_km",
    );
    assert.ok(
      /odometro_motor_a_km\s*=\s*v_novo_km/.test(conteudo),
      "Deve atualizar odometro_motor_a_km",
    );
    assert.ok(
      /odometro_motor_b_km\s*=\s*v_novo_km/.test(conteudo),
      "Deve atualizar odometro_motor_b_km",
    );
    assert.ok(
      /odometro_motor_c_km\s*=\s*v_novo_km/.test(conteudo),
      "Deve atualizar odometro_motor_c_km",
    );
    assert.ok(
      /odometro_hardware_km\s*=\s*ROUND\(v_novo_km\)/.test(conteudo),
      "Deve atualizar odometro_hardware_km",
    );
    assert.ok(
      conteudo.includes("NOTIFY pgrst, 'reload schema';"),
      "Deve recarregar o schema cache PostgREST",
    );
  });

  it("2. O script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a RPC canônica atualizada", () => {
    assert.ok(fs.existsSync(masterSqlPath), "Script mestre deve existir");
    const master = fs.readFileSync(masterSqlPath, "utf-8");

    assert.ok(
      /odometro_motor_media_km\s*=\s*v_novo_km/.test(master),
      "Master SQL deve conter atualização de odometro_motor_media_km na RPC",
    );
    assert.ok(
      /odometro_wgs84_km\s*=\s*v_novo_km/.test(master),
      "Master SQL deve conter atualização de odometro_wgs84_km na RPC",
    );
  });

  it("3. Simulação matemática da equalização atômica dos 7 medidores", () => {
    // Estado inicial pré-sincronização com discrepância entre os motores
    const veiculoAntes = {
      odometro_km: 183420.5,
      odometro_motor_media_km: 183420.5,
      odometro_wgs84_km: 183419.0,
      odometro_cinematico_km: 183421.1,
      odometro_motor_a_km: 183420.2,
      odometro_motor_b_km: 183420.7,
      odometro_motor_c_km: 183420.6,
      odometro_hardware_km: 183418,
    };

    const novoOdometroPainel = 185000.0;

    // Função de equalização canônica
    const equalizarOdometros = (veiculo: typeof veiculoAntes, novoKm: number) => {
      return {
        ...veiculo,
        odometro_km: novoKm,
        odometro_motor_media_km: novoKm,
        odometro_wgs84_km: novoKm,
        odometro_cinematico_km: novoKm,
        odometro_motor_a_km: novoKm,
        odometro_motor_b_km: novoKm,
        odometro_motor_c_km: novoKm,
        odometro_hardware_km: Math.round(novoKm),
      };
    };

    const veiculoDepois = equalizarOdometros(veiculoAntes, novoOdometroPainel);

    assert.equal(veiculoDepois.odometro_km, 185000.0);
    assert.equal(veiculoDepois.odometro_motor_media_km, 185000.0);
    assert.equal(veiculoDepois.odometro_wgs84_km, 185000.0);
    assert.equal(veiculoDepois.odometro_cinematico_km, 185000.0);
    assert.equal(veiculoDepois.odometro_motor_a_km, 185000.0);
    assert.equal(veiculoDepois.odometro_motor_b_km, 185000.0);
    assert.equal(veiculoDepois.odometro_motor_c_km, 185000.0);
    assert.equal(veiculoDepois.odometro_hardware_km, 185000);

    // Quando o próximo ping GPS chegar e calcular a média consensual,
    // o valor base será exatamente 185000.0, prevenindo regressão para o valor antigo.
    const deltaAcumuladoPingGps = 0.05; // 50 metros
    const novoConsensualAposPing = veiculoDepois.odometro_motor_media_km + deltaAcumuladoPingGps;
    assert.equal(novoConsensualAposPing, 185000.05);
  });
});
