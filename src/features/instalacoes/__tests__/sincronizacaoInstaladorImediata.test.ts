import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  obterDemandasInstaladorCompleto,
  garantirSincronizacaoInstalacaoCliente,
} from "../services/instalacaoService";

describe("Hunter — Sincronização Imediata e Atômica Cliente <-> Instalador <-> Instalações", () => {
  it("1. instalacaoService deve exportar obterDemandasInstaladorCompleto e garantirSincronizacaoInstalacaoCliente", () => {
    assert.strictEqual(typeof obterDemandasInstaladorCompleto, "function");
    assert.strictEqual(typeof garantirSincronizacaoInstalacaoCliente, "function");
  });

  it("2. Script de migração 20261008151500 deve existir e conter triggers e RPC canônica", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261008151500_hunter_sync_instalador_ordem_imediata.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração não encontrado");

    const content = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      content.includes("trg_sync_cliente_instalador_instalacao"),
      "Deve conter a trigger trg_sync_cliente_instalador_instalacao",
    );
    assert.ok(
      content.includes("trg_sync_veiculo_instalacao"),
      "Deve conter a trigger trg_sync_veiculo_instalacao",
    );
    assert.ok(
      content.includes("instalador_obter_minhas_demandas"),
      "Deve conter a RPC instalador_obter_minhas_demandas com SECURITY DEFINER",
    );
    assert.ok(content.includes("SECURITY DEFINER"), "RPC deve ser blindada com SECURITY DEFINER");
    assert.ok(
      content.includes("supabase_realtime"),
      "Deve adicionar tabelas ao publication supabase_realtime",
    );
  });

  it("3. Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a migração integrada", () => {
    const masterPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    assert.ok(fs.existsSync(masterPath), "Script mestre não encontrado");

    const content = fs.readFileSync(masterPath, "utf-8");
    assert.ok(
      content.includes(
        "12. SINCRONIZAÇÃO IMEDIATA E ATÔMICA CLIENTE <-> INSTALADOR <-> INSTALAÇÕES",
      ),
      "Script mestre deve conter a seção 12",
    );
    assert.ok(
      content.includes("instalador_obter_minhas_demandas"),
      "Script mestre deve conter a RPC instalador_obter_minhas_demandas",
    );
  });

  it("4. InstalacoesView.tsx deve escutar canais realtime de instalacoes, clientes e veiculos", () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/InstalacoesView.tsx",
    );
    assert.ok(fs.existsSync(viewPath), "InstalacoesView.tsx não encontrado");

    const content = fs.readFileSync(viewPath, "utf-8");
    assert.ok(
      content.includes("obterDemandasInstaladorCompleto"),
      "InstalacoesView deve utilizar obterDemandasInstaladorCompleto",
    );
    assert.ok(
      content.includes("hunter_instalacoes_veiculos_realtime"),
      "Deve escutar canal realtime de veiculos",
    );
    assert.ok(
      content.includes("hunter_instalacoes_clientes_realtime"),
      "Deve escutar canal realtime de clientes",
    );
  });

  it("5. Migração 20261016202500 deve existir e conter sincronização de kit atribuído e veiculo_id", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261016202500_hunter_sincronizacao_instalacoes_veiculo_kit_atribuido.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração 20261016202500 não encontrado");

    const content = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      content.includes("Sincroniza retroativamente instalações que estavam com veiculo_id nulo"),
      "Deve conter a sincronização de kit e rastreadores legados",
    );
    assert.ok(
      content.includes("instalador_obter_minhas_demandas"),
      "Deve atualizar a RPC instalador_obter_minhas_demandas com fallback de rastreador_imei",
    );
    assert.ok(content.includes("NOTIFY pgrst, 'reload schema'"), "Deve recarregar cache PostgREST");
  });

  it("6. ModalDistribuirInstalacoesVeiculos deve repassar instalacaoId e vincular ordem existente", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");
    assert.ok(
      content.includes("instalacaoId: v.instalacao_id || null"),
      "ModalDistribuirInstalacoesVeiculos deve mapear instalacaoId vindo do veículo",
    );
    assert.ok(
      content.includes("instalacaoId: item?.instalacaoId || v.instalacao_id || null"),
      "ModalDistribuirInstalacoesVeiculos deve repassar instalacaoId ao salvar",
    );
  });

  it("7. Regra Pétrea Hunter-Guardian: Ausência do caractere proibido nos novos arquivos", () => {
    const migrationContent = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261016202500_hunter_sincronizacao_instalacoes_veiculo_kit_atribuido.sql",
      ),
      "utf-8",
    );
    assert.ok(!migrationContent.includes(" & "), "Não deve conter caractere comercial solto");
  });
});
