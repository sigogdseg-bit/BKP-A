import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { verificarStatusFinanceiroCliente } from "../../features/mensalidades/services/mensalidadeService";

describe("Hunter — Regra Canônica de Cobrança: Apenas Após 1º Veículo Ativo", () => {
  it("1. verificarStatusFinanceiroCliente deve considerar cliente sem veículo ativo ou aguardando_instalacao como em dia", async () => {
    // Para cliente sem débito ou ainda aguardando instalação
    const status = await verificarStatusFinanceiroCliente("cliente-sem-veiculo-mock-id");
    assert.strictEqual(status.bloqueado, false);
    assert.strictEqual(status.bloqueioLogin, false);
    assert.strictEqual(status.bloqueioLocalizacao, false);
    assert.strictEqual(status.qtdFaturasVencidas, 0);
    assert.strictEqual(status.totalDevido, 0);
  });

  it("2. Migration SQL deve conter bloqueio de parcelas para clientes sem veículo ativo", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261016120000_hunter_cobranca_apos_primeiro_veiculo_ativo.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração deve existir");

    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    // Valida admin_gerar_parcelas_contrato
    assert.ok(
      sqlContent.includes("v.ativo = TRUE"),
      "Deve verificar se o veículo está ativo com v.ativo = TRUE",
    );
    assert.ok(
      sqlContent.includes("aguardando_instalacao"),
      "Deve ignorar ou postergar parcelas de clientes em status aguardando_instalacao",
    );

    // Valida admin_gerar_mensalidades_mes
    assert.ok(
      sqlContent.includes("AND v.ativo = TRUE"),
      "Lote de mensalidades do mês deve filtrar apenas veículos ativos",
    );

    // Valida exclusão de débitos prematuros
    assert.ok(
      sqlContent.includes("DELETE FROM public.mensalidades"),
      "Deve conter limpeza de mensalidades prematuras de clientes sem veículo ativo",
    );

    // Valida invalidação de cache PostgREST
    assert.ok(
      sqlContent.includes("NOTIFY pgrst, 'reload schema';"),
      "Deve conter comando NOTIFY pgrst para invalidação de cache",
    );
  });

  it("3. Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve espelhar a regra canônica", () => {
    const mestrePath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    assert.ok(fs.existsSync(mestrePath), "Script mestre deve existir");

    const mestreContent = fs.readFileSync(mestrePath, "utf-8");
    assert.ok(
      mestreContent.includes("v.ativo = TRUE"),
      "Script mestre deve conter a checagem v.ativo = TRUE",
    );
    assert.ok(
      mestreContent.includes("aguardando_instalacao"),
      "Script mestre deve conter verificação de status aguardando_instalacao",
    );
  });

  it("4. clienteService.ts deve exportar ativarCobrancaPrimeiroVeiculo e vincular à data de instalação", () => {
    const servicePath = path.resolve(
      process.cwd(),
      "src/features/clientes/services/clienteService.ts",
    );
    const content = fs.readFileSync(servicePath, "utf-8");

    assert.ok(
      content.includes("export async function ativarCobrancaPrimeiroVeiculo"),
      "clienteService deve exportar ativarCobrancaPrimeiroVeiculo",
    );
    assert.ok(
      content.includes("data_inicio_contrato"),
      "ativarCobrancaPrimeiroVeiculo deve registrar data_inicio_contrato na data de ativação",
    );
  });

  it("5. ModalFinalizarInstalacaoTecnica deve disparar ativarCobrancaPrimeiroVeiculo", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/ModalFinalizarInstalacaoTecnica.tsx",
    );
    const modalContent = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      modalContent.includes("ativarCobrancaPrimeiroVeiculo"),
      "ModalFinalizarInstalacaoTecnica deve chamar ativarCobrancaPrimeiroVeiculo na conclusão",
    );
  });

  it("6. Ausência do caractere comercial proibido na tela de finalização de instalação", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/ModalFinalizarInstalacaoTecnica.tsx",
    );
    const modalContent = fs.readFileSync(modalPath, "utf-8");
    const proibido = " " + String.fromCharCode(38) + " ";
    assert.strictEqual(modalContent.includes(proibido), false);
  });
});
