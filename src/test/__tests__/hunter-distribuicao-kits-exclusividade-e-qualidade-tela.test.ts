import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

describe("Hunter — Exclusividade de Kits em Estoque e Qualidade Visual da Tela (/djrtela)", () => {
  test("1. RPC listar_equipamentos_habilitados_instalacao: filtra rastreadores atribuídos a instalações ativas", async () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261009160000_hunter_rpc_listar_equipamentos_habilitados.sql",
    );
    const sql = await fs.readFile(migrationPath, "utf-8");

    assert.ok(
      sql.includes("CREATE OR REPLACE FUNCTION public.listar_equipamentos_habilitados_instalacao"),
      "Deve definir a RPC listar_equipamentos_habilitados_instalacao",
    );
    assert.ok(
      sql.includes("NOT EXISTS ("),
      "Deve conter verificação NOT EXISTS em instalacoes ativas",
    );
    assert.ok(
      sql.includes("r.status = 'estoque'"),
      "Deve filtrar apenas rastreadores com status estoque",
    );
    assert.ok(
      sql.includes("r.veiculo_id IS NULL"),
      "Deve filtrar rastreadores sem veículo vinculado",
    );
  });

  test("2. Serviço rastreadorChipService.ts: fallback e stock counting excluem equipamentos já em ordens ativas", async () => {
    const servicePath = path.resolve(
      process.cwd(),
      "src/features/estoque/services/rastreadorChipService.ts",
    );
    const code = await fs.readFile(servicePath, "utf-8");

    assert.ok(
      code.includes("listar_equipamentos_habilitados_instalacao"),
      "Deve invocar a RPC listar_equipamentos_habilitados_instalacao",
    );
    assert.ok(
      code.includes("rastreadoresOcupadosOutrosVeiculos") || code.includes("instsOcupadas"),
      "Deve ter fallback com exclusão de rastreadores já atribuídos a ordens de serviço",
    );
    assert.ok(
      code.includes("rastreadoresComInstalacaoAtiva"),
      "listarTodosDispositivosEstoque deve descontar rastreadores em instalações ativas",
    );
  });

  test("3. ModalDistribuirInstalacoesVeiculos.tsx: impede alocação do mesmo kit para múltiplos veículos da frota", async () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    const code = await fs.readFile(modalPath, "utf-8");

    assert.ok(
      code.includes("obterKitsDisponiveisParaVeiculo"),
      "Deve possuir função de exclusividade de kits por veículo",
    );
    assert.ok(
      code.includes("kitsEmUsoOutros") || code.includes("kitsOcupados"),
      "Deve rastrear kits já escolhidos por outros veículos da tela",
    );
    assert.ok(
      code.includes("Conflito: o mesmo kit em estoque não pode ser atribuído a dois veículos"),
      "Deve conter validação antes de salvar contra duplicação de kits",
    );
  });

  test("4. ClientesView.tsx: botão Aprovar e Atribuir Instalador aciona diretamente o ModalDistribuirInstalacoesVeiculos", async () => {
    const viewPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ClientesView.tsx",
    );
    const code = await fs.readFile(viewPath, "utf-8");

    assert.ok(
      code.includes("onClick={() => setClienteDistribuir(cliente)}"),
      "Botão Aprovar e Atribuir Instalador deve acionar setClienteDistribuir diretamente",
    );
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido em ModalDistribuirInstalacoesVeiculos.tsx", async () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    const code = await fs.readFile(modalPath, "utf-8");

    // Procura por '&' solto fora de sintaxe JS (&& ou &amp;)
    const linhas = code.split("\n");
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (l.includes("&") && !l.includes("&&") && !l.includes("&amp;")) {
        assert.fail(`Caractere comercial proibido encontrado na linha ${i + 1}: ${l}`);
      }
    }
  });
});
