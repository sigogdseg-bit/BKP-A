import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  excluirRevendedor,
  excluirVendedor,
} from "../../features/revendedores/services/revendedoresService";

describe("Hunter — Exclusão de Parceiros Comerciais e Filtros de Infográficos", () => {
  it("1. revendedoresService deve exportar excluirRevendedor e excluirVendedor", () => {
    assert.strictEqual(typeof excluirRevendedor, "function");
    assert.strictEqual(typeof excluirVendedor, "function");
  });

  it("2. excluirRevendedor e excluirVendedor devem rejeitar ID vazio ou ausente", async () => {
    const resRev = await excluirRevendedor("");
    assert.strictEqual(resRev.sucesso, false);
    assert.match(resRev.erro || "", /ID do revendedor não fornecido/i);

    const resVend = await excluirVendedor("");
    assert.strictEqual(resVend.sucesso, false);
    assert.match(resVend.erro || "", /ID do vendedor não fornecido/i);
  });

  it("3. server.ts deve implementar a rota segura /api/admin/excluir-parceiro", () => {
    const serverCode = fs.readFileSync(path.resolve(process.cwd(), "src/server.ts"), "utf-8");

    assert.ok(
      serverCode.includes("/api/admin/excluir-parceiro"),
      "server.ts deve conter o pathname /api/admin/excluir-parceiro",
    );
    assert.ok(
      serverCode.includes("handleApiAdminExcluirParceiro"),
      "server.ts deve conter a função handleApiAdminExcluirParceiro",
    );
    assert.ok(
      serverCode.includes("parceiroExclusaoResponse"),
      "server.ts deve interceptar parceiroExclusaoResponse no pipeline principal",
    );
  });

  it("4. RevendedoresView deve conter filtros interativos para todos os 6 infográficos", () => {
    const viewCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/revendedores/components/RevendedoresView.tsx"),
      "utf-8",
    );

    // Validação de todos os critérios de filtro dos 6 balões
    assert.ok(viewCode.includes("com_vendedores"), "Deve suportar filtro de vendedores");
    assert.ok(viewCode.includes("com_clientes"), "Deve suportar filtro de clientes");
    assert.ok(viewCode.includes("com_faturamento"), "Deve suportar filtro de faturamento");
    assert.ok(viewCode.includes("com_cota"), "Deve suportar filtro de cota matriz");
    assert.ok(viewCode.includes("com_comissao"), "Deve suportar filtro de comissão da rede");

    // Validação de botões de exclusão na UI
    assert.ok(
      viewCode.includes("parceiroParaExcluir"),
      "Deve possuir estado para controle do modal de exclusão",
    );
    assert.ok(
      viewCode.includes("handleConfirmarExclusaoParceiro"),
      "Deve possuir handler de exclusão confirmada",
    );
    assert.ok(
      viewCode.includes("Confirmar Exclusão de"),
      "Deve possuir modal com título de confirmação",
    );
  });

  it("5. ModalEditarVendedor deve conter suporte à exclusão do vendedor", () => {
    const modalCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/features/revendedores/components/ModalEditarVendedor.tsx"),
      "utf-8",
    );

    assert.ok(
      modalCode.includes("excluirVendedor"),
      "ModalEditarVendedor deve importar excluirVendedor",
    );
    assert.ok(
      modalCode.includes("confirmandoExclusao"),
      "ModalEditarVendedor deve possuir estado confirmandoExclusao",
    );
    assert.ok(
      modalCode.includes("Excluir Vendedor"),
      "ModalEditarVendedor deve renderizar botão Excluir Vendedor",
    );
  });

  it("6. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido nos arquivos alterados", () => {
    const arquivos = [
      "src/features/revendedores/services/revendedoresService.ts",
      "src/features/revendedores/components/RevendedoresView.tsx",
      "src/features/revendedores/components/ModalEditarVendedor.tsx",
    ];

    for (const arq of arquivos) {
      const conteudo = fs.readFileSync(path.resolve(process.cwd(), arq), "utf-8");
      const linhas = conteudo.split("\n");

      linhas.forEach((linha, idx) => {
        // Ignora operadores lógicos (&&), links de documentação web e entidades HTML (&quot;, &amp;, &nbsp;)
        const linhaSemOperadores = linha
          .replace(/&&/g, "")
          .replace(/&quot;/g, "")
          .replace(/&amp;/g, "")
          .replace(/&nbsp;/g, "");

        if (linhaSemOperadores.includes("&")) {
          // Se for dentro de string ou texto em português comercial
          assert.fail(
            `Arquivo ${arq} na linha ${idx + 1} contém o caractere comercial proibido: ${linha}`,
          );
        }
      });
    }
  });
});
