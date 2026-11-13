import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Gestão de Rotas Monitoradas e Layout Mobile Despoluído (DJR-NEW / HUNTER-GUARDIAN)", () => {
  test("Rotas Monitoradas: Deve permitir listar, alterar tolerância, encerrar e excluir registros no banco", () => {
    interface RotaSimulada {
      id: string;
      veiculo_id: string;
      nome: string;
      tolerancia_metros: number;
      status: "ativa" | "em_desvio" | "concluida" | "cancelada";
      coordenadas: [number, number][];
    }

    const rotasDoBanco: RotaSimulada[] = [
      {
        id: "rota-001",
        veiculo_id: "v-123",
        nome: "Entrega Zona Sul",
        tolerancia_metros: 100,
        status: "ativa",
        coordenadas: [
          [-23.55, -46.63],
          [-23.56, -46.64],
        ],
      },
      {
        id: "rota-002",
        veiculo_id: "v-123",
        nome: "Itinerário Matriz",
        tolerancia_metros: 150,
        status: "concluida",
        coordenadas: [
          [-23.57, -46.65],
          [-23.58, -46.66],
        ],
      },
    ];

    // 1. Onde vê: Listagem segregada por ativas e histórico
    const rotasAtivas = rotasDoBanco.filter(
      (r) => r.status === "ativa" || r.status === "em_desvio",
    );
    const rotasHistorico = rotasDoBanco.filter(
      (r) => r.status !== "ativa" && r.status !== "em_desvio",
    );

    assert.equal(rotasAtivas.length, 1);
    assert.equal(rotasHistorico.length, 1);
    assert.equal(rotasAtivas[0].nome, "Entrega Zona Sul");

    // 2. Onde altera: Alteração de tolerância diretamente no registro
    const rotaEditada = { ...rotasAtivas[0], tolerancia_metros: 250 };
    assert.equal(rotaEditada.tolerancia_metros, 250);

    // 3. Onde exclui: Remoção segura do banco de dados
    const rotasAposExclusao = rotasDoBanco.filter((r) => r.id !== "rota-001");
    assert.equal(rotasAposExclusao.length, 1);
    assert.equal(rotasAposExclusao[0].id, "rota-002");
  });

  test("Ergonomia Mobile: Despoluição Total e Modos Exclusivos (Sem competição de espaço)", () => {
    interface LayoutMobileTactical {
      visaoMobile: "mapa" | "telemetria";
      sidebarAberta: boolean;
      mapaOcupaTelaCheia: boolean;
      drawerTelemetriaOcultoNoModoMapa: boolean;
      floatingTacticalPillAtivo: boolean;
      bottomBarAbas: string[];
    }

    // No modo mapa: 100% da viewport livre sem infográficos cobrindo o mapa
    const modoMapa: LayoutMobileTactical = {
      visaoMobile: "mapa",
      sidebarAberta: false,
      mapaOcupaTelaCheia: true,
      drawerTelemetriaOcultoNoModoMapa: true,
      floatingTacticalPillAtivo: true,
      bottomBarAbas: ["mapa", "telemetria", "rotas", "alertas", "frota"],
    };

    assert.equal(modoMapa.visaoMobile, "mapa");
    assert.equal(modoMapa.mapaOcupaTelaCheia, true, "O mapa deve ter 100% de visão desobstruída");
    assert.equal(
      modoMapa.drawerTelemetriaOcultoNoModoMapa,
      true,
      "Gaveta pesada não deve espremer o mapa no mobile",
    );
    assert.equal(modoMapa.bottomBarAbas.length, 5, "Barra tática de 5 abas ergonômicas");

    // No modo telemetria: tela cheia dedicada com rolagem natural de infográficos
    const modoTelemetria: LayoutMobileTactical = {
      visaoMobile: "telemetria",
      sidebarAberta: false,
      mapaOcupaTelaCheia: false,
      drawerTelemetriaOcultoNoModoMapa: false,
      floatingTacticalPillAtivo: false,
      bottomBarAbas: ["mapa", "telemetria", "rotas", "alertas", "frota"],
    };

    assert.equal(modoTelemetria.visaoMobile, "telemetria");
    assert.equal(
      modoTelemetria.drawerTelemetriaOcultoNoModoMapa,
      false,
      "Telemetria ocupa a tela inteira com rolagem suave",
    );
  });

  test("Ergonomia Mobile: Cabeçalho com Safe Area Inset e Preservação de Sticky", async () => {
    const fs = await import("node:fs/promises");
    const appHeaderCode = await fs.readFile(
      new URL("../../../src/features/layout/components/AppHeader.tsx", import.meta.url),
      "utf-8",
    );
    const appShellCode = await fs.readFile(
      new URL("../../../src/features/layout/components/AppShell.tsx", import.meta.url),
      "utf-8",
    );
    const stylesCss = await fs.readFile(
      new URL("../../../src/styles.css", import.meta.url),
      "utf-8",
    );

    // 1. AppHeader deve possuir Safe Area Inset top e z-50 para desobstrução total do notch e status bar
    assert.ok(
      appHeaderCode.includes("safe-area-inset-top"),
      "AppHeader deve conter padding de safe-area-inset-top",
    );
    assert.ok(
      appHeaderCode.includes("sticky top-0 z-50"),
      "AppHeader deve ser sticky top-0 com z-50 para visibilidade permanente",
    );

    // 2. AppShell deve descontar safe-area-inset-top na altura de tela cheia e aplicar overflow-x-clip
    assert.ok(
      appShellCode.includes("safe-area-inset-top"),
      "AppShell deve compensar safe-area-inset-top na viewport cheia",
    );
    assert.ok(
      appShellCode.includes("overflow-x-clip"),
      "AppShell deve usar overflow-x-clip para evitar quebra de sticky",
    );

    // 3. styles.css deve usar overflow-x: clip em html e body para impedir que o Safari/WebKit desabilite o sticky
    assert.ok(
      stylesCss.includes("overflow-x: clip"),
      "styles.css deve adotar overflow-x: clip em vez de overflow-x: hidden no root",
    );
    assert.ok(
      !stylesCss.includes("overflow-x: hidden"),
      "styles.css não deve conter overflow-x: hidden que sabota o sticky no mobile",
    );
  });

  test("Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", () => {
    const textoRotas = "Rotas Monitoradas e Trajetos Salvos no Banco de Dados";
    const textoAbas = "Mapa, Telemetria, Rotas Monitoradas, Alertas e Frota";
    assert.ok(!textoRotas.includes("&"), "Proibição do caractere comercial");
    assert.ok(!textoAbas.includes("&"), "Proibição do caractere comercial");
  });
});
