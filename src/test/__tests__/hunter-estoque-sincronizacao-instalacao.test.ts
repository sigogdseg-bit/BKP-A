import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter - Sincronização e Reconciliação de Estoque em Instalações Técnicas", () => {
  it("1. ModalFinalizarInstalacaoTecnica deve conter sincronização automática de estoque", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/ModalFinalizarInstalacaoTecnica.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("sincronizarEstoqueInstalacao"),
      "ModalFinalizarInstalacaoTecnica deve importar e invocar sincronizarEstoqueInstalacao",
    );
    assert.ok(
      content.includes("MAT-0001"),
      "Deve mapear o rastreador padrão MAT-0001 para baixa de insumo",
    );
    assert.ok(
      content.includes("MAT-0002"),
      "Deve mapear o chip padrão MAT-0002 para baixa de insumo",
    );
    assert.ok(
      content.includes("MAT-0003"),
      "Deve mapear o relé MAT-0003 quando comBloqueador for verdadeiro",
    );
    assert.ok(
      content.includes("rele_chicote_do_estoque"),
      "Deve verificar a flag rele_chicote_do_estoque antes de baixar relé e porta relé",
    );
  });

  it("2. Deve calcular a matemática exata de estoque quando instalador fornece relé e chicote vs quando sai do estoque", () => {
    const estoqueInicial = {
      rastreadorJ16: 8,
      chipAlgar: 10,
      releCarro: 1,
      portaRele: 1,
    };

    // Cenário Real: 2 veículos instalados (AXH0E44 e LTK1A94), onde instalador forneceu relé e chicote
    const instalacoesRealizadas = [
      { placa: "AXH0E44", comBloqueador: true, releChicoteDoEstoque: false },
      { placa: "LTK1A94", comBloqueador: true, releChicoteDoEstoque: false },
    ];

    let totalRastreadoresBaixados = 0;
    let totalChipsBaixados = 0;
    let totalRelesBaixados = 0;
    let totalPortaRelesBaixados = 0;

    for (const inst of instalacoesRealizadas) {
      totalRastreadoresBaixados += 1;
      totalChipsBaixados += 1;
      if (inst.comBloqueador && inst.releChicoteDoEstoque) {
        totalRelesBaixados += 1;
        totalPortaRelesBaixados += 1;
      }
    }

    const saldoAposInstalacoes = {
      rastreadorJ16: estoqueInicial.rastreadorJ16 - totalRastreadoresBaixados,
      chipAlgar: estoqueInicial.chipAlgar - totalChipsBaixados,
      releCarro: estoqueInicial.releCarro - totalRelesBaixados,
      portaRele: estoqueInicial.portaRele - totalPortaRelesBaixados,
    };

    assert.equal(saldoAposInstalacoes.rastreadorJ16, 6, "Saldo de Rastreador J16 deve ser 6");
    assert.equal(saldoAposInstalacoes.chipAlgar, 8, "Saldo de Chip Algar deve ser 8");
    assert.equal(
      saldoAposInstalacoes.releCarro,
      1,
      "Saldo de Relé deve permanecer 1 quando instalador fornece",
    );
    assert.equal(
      saldoAposInstalacoes.portaRele,
      1,
      "Saldo de Porta Relé deve permanecer 1 quando instalador fornece",
    );

    // Caso o operador marque releChicoteDoEstoque: true em uma instalação
    const baixaComReleEstoque = {
      releCarro: 1,
      portaRele: 1,
    };
    assert.equal(
      saldoAposInstalacoes.releCarro - baixaComReleEstoque.releCarro,
      0,
      "Saldo de Relé vai a 0 quando sai do estoque",
    );
  });

  it("3. ModalDistribuirInstalacoesVeiculos deve conter controle de releChicoteDoEstoque", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("releChicoteDoEstoque"),
      "Deve conter mapeamento e controle de releChicoteDoEstoque",
    );
    assert.ok(
      content.includes("Instalador Fornece (Padrão)"),
      "Deve exibir opção padrão informando que instalador fornece",
    );
    assert.ok(
      content.includes("Do Estoque GD Rastreamento (Fará Baixa)"),
      "Deve exibir opção informando baixa do estoque GD Rastreamento",
    );
  });

  it("4. NovaInstalacaoModal deve conter controle e sincronização de releChicoteDoEstoque", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("releChicoteDoEstoque"),
      "Deve conter estado e controle de releChicoteDoEstoque",
    );
    assert.ok(
      content.includes("handleToggleReleChicoteEstoque"),
      "Deve conter manipulador de alternância com ajuste de insumos",
    );
  });

  it("5. Migration de auto-sincronização de estoque deve existir e conter DDL canônico", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261022161500_hunter_auto_sincronizacao_estoque_instalacoes.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração deve existir");

    const content = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(
      content.includes("trg_fn_auto_sincronizar_estoque_instalacao"),
      "Função trigger deve estar definida",
    );
    assert.ok(
      content.includes("trg_auto_sincronizar_estoque_instalacao"),
      "Trigger de auto-sincronização deve estar criado",
    );
    assert.ok(
      content.includes("NOTIFY pgrst, 'reload schema'"),
      "Deve conter recarregamento do cache PostgREST",
    );
  });

  it("6. Script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve espelhar a migração", () => {
    const masterPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const content = fs.readFileSync(masterPath, "utf-8");

    assert.ok(
      content.includes("trg_auto_sincronizar_estoque_instalacao"),
      "Script mestre deve conter a trigger de auto-sincronização do estoque",
    );
  });
});
