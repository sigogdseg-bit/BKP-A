import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { isCicloViagemReal } from "../../features/monitor-gps/services/gpsService";

describe("GD Rastreamento — Validação de Ciclos Reais e Descarte de Falsas Viagens", () => {
  it("1. isCicloViagemReal deve classificar perfeitamente ciclos reais vs ruído de ignição", () => {
    // Casos exatos do dia 28/10 do veículo LTK1A94 reportados pelo usuário:
    const ciclo1 = { km_percorrido: 0.05, velocidade_maxima: 11 }; // 17:23 -> 17:25 (50m)
    const ciclo2 = { km_percorrido: 2.42, velocidade_maxima: 69 }; // 15:55 -> 16:02 (2,42 km - REAL)
    const ciclo3 = { km_percorrido: 0.04, velocidade_maxima: 0 }; // 09:22 -> 09:24 (40m)
    const ciclo4 = { km_percorrido: 0.01, velocidade_maxima: 0 }; // 07:30 -> 07:33 (10m)

    assert.strictEqual(
      isCicloViagemReal(ciclo1),
      false,
      "Ciclo de 50m com 11 km/h é ruído de parada/manobra de garagem",
    );
    assert.strictEqual(isCicloViagemReal(ciclo2), true, "Ciclo de 2,42 km a 69 km/h é viagem real");
    assert.strictEqual(
      isCicloViagemReal(ciclo3),
      false,
      "Ciclo de 40m com 0 km/h é falso ciclo com carro parado",
    );
    assert.strictEqual(
      isCicloViagemReal(ciclo4),
      false,
      "Ciclo de 10m com 0 km/h é falso ciclo com carro parado",
    );

    // Dentre os 4 ciclos, apenas 1 é real:
    const lista = [ciclo1, ciclo2, ciclo3, ciclo4];
    const apenasReais = lista.filter(isCicloViagemReal);
    assert.strictEqual(apenasReais.length, 1, "Dos 4 ciclos, exatamente 1 deve ser real");
    assert.strictEqual(apenasReais[0], ciclo2);
  });

  it("2. Gateway de telemetria deve descartar micro-ignições e usar sintaxe inteira para velocidade", () => {
    const gatewayDeployPath = path.resolve(
      process.cwd(),
      "deploy/hunter-gateway/src/hunter-gps-gateway.ts",
    );
    const gatewayScriptPath = path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts");

    const codeDeploy = fs.readFileSync(gatewayDeployPath, "utf-8");
    const codeScript = fs.readFileSync(gatewayScriptPath, "utf-8");

    // Ambos devem descartar a viagem se não for viagem real comprovada
    assert.ok(
      codeDeploy.includes("isViagemReal") &&
        codeDeploy.includes('from("viagens_trajetos").delete()'),
      "Gateway deploy deve conter descarte de falsos ciclos via delete",
    );
    assert.ok(
      codeScript.includes("isViagemReal") &&
        codeScript.includes('from("viagens_trajetos").delete()'),
      "Gateway script deve conter descarte de falsos ciclos via delete",
    );

    // A query de velocidade para média deve usar inteiro (gt 2) em vez de decimal (gt 2.5) para evitar erro 22P02 no Postgres
    assert.ok(
      codeDeploy.includes('.gt("velocidade", 2)'),
      "Gateway deploy deve consultar velocidade inteira com gt(velocidade, 2)",
    );
    assert.ok(
      codeScript.includes('.gt("velocidade", 2)'),
      "Gateway script deve consultar velocidade inteira com gt(velocidade, 2)",
    );
  });

  it("3. Script de migração DDL e saneamento deve existir e conter descarte em trigger", () => {
    const migracaoPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261029100000_hunter_descarte_ciclos_falsos_ignicao_e_saneamento.sql",
    );
    assert.ok(fs.existsSync(migracaoPath), "Arquivo de migração deve existir");

    const sql = fs.readFileSync(migracaoPath, "utf-8");
    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION public.trg_garantir_uma_viagem_em_andamento"),
      "Migração deve atualizar a trigger function trg_garantir_uma_viagem_em_andamento",
    );
    assert.ok(
      sql.includes("DELETE FROM public.viagens_trajetos"),
      "Migração deve conter saneamento e descarte de viagens falsas",
    );
    assert.ok(
      sql.includes("NOTIFY pgrst, 'reload schema'"),
      "Migração deve recarregar schema cache",
    );
  });

  it("4. Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a migração integrada", () => {
    const mestrePath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const mestre = fs.readFileSync(mestrePath, "utf-8");

    assert.ok(
      mestre.includes("20261029100000_hunter_descarte_ciclos_falsos_ignicao_e_saneamento.sql"),
      "Script mestre deve referenciar a migração de descarte de falsos ciclos",
    );
    assert.ok(
      mestre.includes("COALESCE(km_percorrido, 0) < 0.15 AND COALESCE(velocidade_maxima, 0) <= 15"),
      "Script mestre deve conter a regra de descarte de falsos ciclos",
    );
  });

  it("5. RefazerTrajetoModal deve autocura de velocidade_media e filtrar ciclos reais", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
    );
    const code = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      code.includes("precisaAutocuraVel"),
      "Modal deve conter autocura de velocidade_media se estiver zerada com pontos reais",
    );
    assert.ok(
      code.includes("isCicloViagemReal"),
      "Modal deve importar ou utilizar isCicloViagemReal para consistência",
    );
  });

  it("6. Ausência estrita do caractere comercial proibido nos novos arquivos", () => {
    const arqMigracao = path.resolve(
      process.cwd(),
      "supabase/migrations/20261029100000_hunter_descarte_ciclos_falsos_ignicao_e_saneamento.sql",
    );

    const charProibido = String.fromCharCode(38);
    const conteudo = fs.readFileSync(arqMigracao, "utf-8");
    const linhas = conteudo.split("\n");
    linhas.forEach((linha, idx) => {
      const semOperador = linha.replace(/&&/g, "").replace(/&quot;/g, "");
      assert.ok(
        !semOperador.includes(charProibido),
        `Caractere proibido detectado no arquivo de migração na linha ${idx + 1}: ${linha}`,
      );
    });
  });
});
