import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Visualização de Clientes em Modo Lista e Card Individual Modal", () => {
  const root = process.cwd();
  const clientesViewPath = path.join(root, "src/features/clientes/components/ClientesView.tsx");

  it("1. ClientesView.tsx deve possuir chave de persistência de visualização no localStorage", () => {
    const code = fs.readFileSync(clientesViewPath, "utf-8");

    assert.ok(
      code.includes("hunter_clientes_modo_exibicao"),
      "ClientesView.tsx deve conter a chave hunter_clientes_modo_exibicao para persistência do modo escolhido",
    );
    assert.ok(
      code.includes('useState<"cards" | "lista">'),
      "ClientesView.tsx deve definir estado modoExibicao como 'cards' ou 'lista'",
    );
  });

  it("2. ClientesView.tsx deve conter botões alternadores de visão Cards e Lista na barra de filtros", () => {
    const code = fs.readFileSync(clientesViewPath, "utf-8");

    assert.ok(
      code.includes("LayoutGrid") && code.includes("List"),
      "ClientesView.tsx deve importar e renderizar ícones LayoutGrid e List",
    );
    assert.ok(
      code.includes('setModoExibicao("cards")') && code.includes('setModoExibicao("lista")'),
      "ClientesView.tsx deve possuir handlers para alternar entre 'cards' e 'lista'",
    );
  });

  it("3. ClientesView.tsx deve renderizar tabela de alta densidade quando modoExibicao for 'lista'", () => {
    const code = fs.readFileSync(clientesViewPath, "utf-8");

    assert.ok(
      code.includes('modoExibicao === "cards"') &&
        code.includes("<table") &&
        code.includes("</table>"),
      "ClientesView.tsx deve conter estrutura de tabela com layout responsivo",
    );
    assert.ok(
      code.includes("Cliente") &&
        code.includes("Status / Plano") &&
        code.includes("Veículos") &&
        code.includes("Instalador / Agendamento"),
      "Tabela deve conter cabeçalhos informativos para suportar centenas de clientes",
    );
  });

  it("4. Ao clicar na linha da tabela ou no botão de visualização, deve abrir o card individual original", () => {
    const code = fs.readFileSync(clientesViewPath, "utf-8");

    assert.ok(
      code.includes("setClienteCardModal(cliente)"),
      "Clique na linha do cliente ou botão de ação rápida deve acionar setClienteCardModal",
    );
    assert.ok(
      code.includes("renderCardCliente(clienteCardModal, true)"),
      "Modal deve reutilizar a função canônica renderCardCliente sem criar layout divergente",
    );
    assert.ok(
      code.includes("<ModalPortal>"),
      "Card individual deve ser montado dentro de ModalPortal conforme regras canônicas de modais",
    );
  });

  it("5. ClientesView.tsx não deve conter o caractere comercial proibido em textos de interface", () => {
    const code = fs.readFileSync(clientesViewPath, "utf-8");
    const lines = code.split("\n");

    const forbiddenCharPattern = /&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[a-f\d]+;|\s*&))/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("&&") || line.includes("//") || line.includes("/*")) {
        continue;
      }
      if (forbiddenCharPattern.test(line)) {
        assert.fail(
          `Caractere comercial proibido encontrado na linha ${i + 1} de ClientesView.tsx: ${line}`,
        );
      }
    }
  });

  it("6. ClientesView.tsx deve suprimir automaticamente a informação 'A agendar' para instalações já realizadas sem agendar", () => {
    const code = fs.readFileSync(clientesViewPath, "utf-8");

    assert.ok(
      code.includes("isInstalacaoRealizada"),
      "ClientesView.tsx deve definir e utilizar isInstalacaoRealizada para identificar clientes com instalação realizada",
    );
    assert.ok(
      code.includes("if (isInstalacaoRealizada(cliente))") && code.includes("return null;"),
      "A coluna Instalador / Agendamento deve retornar null e suprimir 'A agendar' se a instalação já foi realizada",
    );
    assert.ok(
      code.includes("!instalacaoRealizada &&"),
      "Os filtros e contadores não devem contabilizar clientes com instalação realizada na categoria aguardando_instalacao",
    );
  });
});
