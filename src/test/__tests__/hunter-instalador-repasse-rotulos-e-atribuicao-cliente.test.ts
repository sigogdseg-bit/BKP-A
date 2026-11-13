import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Repasse do Instalador, Rótulos de Abas e Atribuição do Cliente", () => {
  const root = process.cwd();

  it("1. UsuarioFormModal.tsx deve formatar repasse com máscara monetária brasileira (,00)", () => {
    const modalPath = path.join(root, "src/features/seguranca/components/UsuarioFormModal.tsx");
    const content = fs.readFileSync(modalPath, "utf8");

    assert.ok(
      content.includes("minimumFractionDigits: 2") && content.includes("maximumFractionDigits: 2"),
      "UsuarioFormModal deve conter formatação com 2 casas decimais brasileiras (,00)",
    );
    assert.ok(
      content.includes('placeholder="0,00"'),
      "Inputs de valor de repasse devem conter placeholder '0,00'",
    );
  });

  it("2. InstalacoesView.tsx deve conter abas separadas 'A Instalar' e 'Instalados' para o instalador", () => {
    const viewPath = path.join(root, "src/features/instalacoes/components/InstalacoesView.tsx");
    const content = fs.readFileSync(viewPath, "utf8");

    assert.ok(
      content.includes("A Instalar") && content.includes("{totalAInstalar}"),
      "InstalacoesView deve conter aba específica 'A Instalar' com contador de totalAInstalar",
    );
    assert.ok(
      content.includes("Instalados") && content.includes("{totalInstalados}"),
      "InstalacoesView deve conter aba específica 'Instalados' com contador de totalInstalados",
    );
    assert.ok(
      !content.includes("<span>Veículos Instalados ({instalacoesFiltradas.length})</span>"),
      "InstalacoesView NÃO deve usar rótulo confuso 'Veículos Instalados' englobando ordens não instaladas",
    );
  });

  it("3. InstalacoesView.tsx deve formatar valores financeiros com vírgula (,00)", () => {
    const viewPath = path.join(root, "src/features/instalacoes/components/InstalacoesView.tsx");
    const content = fs.readFileSync(viewPath, "utf8");

    assert.ok(
      content.includes("formatarMoeda(resumoFinanceiro.aReceber"),
      "Card 'A Receber' deve utilizar formatarMoeda com duas casas decimais brasileiras",
    );
    assert.ok(
      content.includes("formatarMoeda(resumoFinanceiro.recebido"),
      "Card 'Recebido' deve utilizar formatarMoeda com duas casas decimais brasileiras",
    );
  });

  it("4. clienteService.ts deve calcular repasse do instalador a partir do perfil e atualizar clientes.instalador_id", () => {
    const servicePath = path.join(root, "src/features/clientes/services/clienteService.ts");
    const content = fs.readFileSync(servicePath, "utf8");

    assert.ok(
      content.includes("valor_instalacao_sem_bloqueador") &&
        content.includes("valor_instalacao_com_bloqueador"),
      "distribuirInstalacoesVeiculos deve consultar taxas do perfil do instalador",
    );
    assert.ok(
      content.includes("updateClientePayload.instalador_id = primeiroInstaladorId"),
      "distribuirInstalacoesVeiculos deve atualizar atomicamente clientes.instalador_id",
    );
    assert.ok(
      content.includes("profInstFallback"),
      "obterAgendamentoCliente deve conter fallback para recuperar perfil do instalador se join vier nulo",
    );
  });

  it("5. Migração de sincronização e RLS em instalacoes deve existir e recarregar schema", () => {
    const migPath = path.join(
      root,
      "supabase/migrations/20261009193000_hunter_sincronizacao_instalador_cliente_e_rls.sql",
    );
    assert.ok(fs.existsSync(migPath), "Arquivo de migração deve existir");
    const content = fs.readFileSync(migPath, "utf8");
    assert.ok(
      content.includes("Clientes visualizam ordens de instalacao de seus veiculos"),
      "Migração deve conter policy RLS para clientes em instalacoes",
    );
    assert.ok(
      content.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve invalidar o schema cache PostgREST",
    );
  });
});
