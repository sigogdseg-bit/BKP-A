import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Distribuição de Frota, Resolução de Veículos e Edição de Cliente sem Bloco Redundante", () => {
  const root = process.cwd();

  it("1. clienteService.ts deve buscar 'marca_modelo' e 'bloqueado' na query de veículos (não nomes obsoletos)", () => {
    const code = fs.readFileSync(
      path.join(root, "src/features/clientes/services/clienteService.ts"),
      "utf-8",
    );

    // Deve usar as colunas reais da tabela veiculos
    assert.ok(
      code.includes("marca_modelo") && code.includes("bloqueado"),
      "clienteService.ts deve selecionar marca_modelo e bloqueado da tabela veiculos",
    );

    // Na consulta principal não deve selecionar veiculos (..., modelo, ...)
    assert.ok(
      !code.includes("veiculos (id, placa, modelo,"),
      "clienteService.ts não deve tentar selecionar a coluna inexistente 'modelo' de veiculos",
    );
  });

  it("2. NovoClienteModal.tsx deve ocultar o bloco de comodato/kit durante a edição de ficha", () => {
    const code = fs.readFileSync(
      path.join(root, "src/features/clientes/components/NovoClienteModal.tsx"),
      "utf-8",
    );

    assert.ok(
      code.includes("{!isEdicao && (") &&
        code.includes("Equipamento em Comodato e Conectividade M2M"),
      "NovoClienteModal.tsx deve renderizar o bloco de comodato apenas quando !isEdicao",
    );
  });

  it("3. ModalDistribuirInstalacoesVeiculos.tsx deve conter layout responsivo sem corte horizontal do botão", () => {
    const code = fs.readFileSync(
      path.join(root, "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx"),
      "utf-8",
    );

    assert.ok(
      code.includes("min-w-0") && code.includes("max-w-md"),
      "ModalDistribuirInstalacoesVeiculos.tsx deve aplicar min-w-0 e max-w-md para prevenir overflow horizontal",
    );
    assert.ok(
      code.includes("whitespace-nowrap") && code.includes("Adicionar Veículo à Frota"),
      "Botão de adicionar veículo à frota deve ter visibilidade garantida sem quebra imprópria",
    );
  });

  it("4. ClientesView.tsx deve organizar ações do card em duas fileiras balanceadas sem botão órfão", () => {
    const code = fs.readFileSync(
      path.join(root, "src/features/clientes/components/ClientesView.tsx"),
      "utf-8",
    );

    assert.ok(
      code.includes("grid-cols-2 sm:grid-cols-4") &&
        (code.includes("grid-cols-3") || code.includes("grid-cols-2")),
      "ClientesView.tsx deve estruturar os botões do card em fileiras proporcionais e ergonômicas",
    );
  });

  it("5. Proibição absoluta do caractere comercial nas interfaces e arquivos modificados", () => {
    const arquivos = [
      "src/features/clientes/components/ClientesView.tsx",
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    ];

    for (const arq of arquivos) {
      const conteudo = fs.readFileSync(path.join(root, arq), "utf-8");
      const linhasComercial = conteudo
        .split("\n")
        .filter(
          (l) =>
            l.includes("& ") &&
            !l.includes("&&") &&
            !l.includes("&amp;") &&
            !l.includes("//") &&
            !l.includes("/*"),
        );
      assert.equal(
        linhasComercial.length,
        0,
        `Arquivo ${arq} não pode conter o caractere comercial proibido solto em textos`,
      );
    }
  });
});
