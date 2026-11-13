import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("Hunter — Arquitetura de Telas Dedicadas e Modos Exclusivos (DJR-NEW / HUNTER-GUARDIAN)", () => {
  test("1. Monitor GPS e Telemetria devem operar com modos de visualização exclusivos sem concorrência de espaço", async () => {
    const gpsMonitorCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // Deve possuir o estado de alternância exclusiva de visão
    assert.ok(
      gpsMonitorCode.includes('visaoAtiva === "mapa"'),
      "Monitor GPS deve possuir modo Mapa ao Vivo exclusivo",
    );
    assert.ok(
      gpsMonitorCode.includes('visaoAtiva === "cockpit"'),
      "Monitor GPS deve possuir modo Cockpit 3D exclusivo",
    );

    // O cabeçalho deve expor as abas de modo exclusivo
    assert.ok(
      gpsMonitorCode.includes("Mapa ao Vivo"),
      "Cabeçalho deve possuir aba tática 'Mapa ao Vivo'",
    );
    assert.ok(
      gpsMonitorCode.includes("Cockpit 3D"),
      "Cabeçalho deve possuir aba tática 'Cockpit 3D'",
    );
    assert.ok(
      gpsMonitorCode.includes("Central de Alertas"),
      "Central de Alertas deve estar acessível no cabeçalho operacional",
    );
  });

  test("2. VehicleTelemetryDrawer deve implementar Docking Bar compacta e menu de módulos categorizado", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );

    // Deve possuir menu suspenso de módulos
    assert.ok(
      drawerCode.includes("renderMenuAcoes"),
      "VehicleTelemetryDrawer deve possuir renderizador de menu de ações e módulos",
    );
    assert.ok(
      drawerCode.includes("Módulos e Funções do Veículo"),
      "Menu deve apresentar título categorizado de módulos e funções",
    );

    // Categorias do menu suspenso
    assert.ok(drawerCode.includes("Navegação e Trajetos"), "Deve categorizar navegação e trajetos");
    assert.ok(drawerCode.includes("Segurança e Proteção"), "Deve categorizar segurança e proteção");
    assert.ok(
      drawerCode.includes("Diagnóstico e Custódia"),
      "Deve categorizar diagnóstico e custódia",
    );
    assert.ok(drawerCode.includes("Operação"), "Deve categorizar operação e compartilhamento");

    // Botões principais na docking bar compacta
    assert.ok(
      drawerCode.includes("Cockpit 3D"),
      "Docking bar deve possuir atalho direto para Cockpit 3D",
    );
    assert.ok(
      drawerCode.includes("onAbrirPlayback"),
      "Docking bar deve possuir atalho direto para Refazer Trajeto",
    );
    assert.ok(
      drawerCode.includes("onBloquearToggle"),
      "Docking bar deve possuir atalho direto para comando crítico de relé",
    );
  });

  test("3. Modo Cockpit 3D deve conter seletor de frota e botão de retorno desobstruído ao mapa", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );

    assert.ok(
      drawerCode.includes("Voltar ao Mapa"),
      "Tela do Cockpit 3D deve conter botão proeminente de retorno ao mapa",
    );
    assert.ok(
      drawerCode.includes("Trocar de veículo no Cockpit"),
      "Tela do Cockpit 3D deve permitir alternar veículos da frota diretamente",
    );
    assert.ok(
      drawerCode.includes("<MostradoresCockpit3D"),
      "Tela do Cockpit 3D deve renderizar os mostradores 3D volumétricos",
    );
    assert.ok(
      drawerCode.includes("<ResumoDiarioCard"),
      "Tela do Cockpit 3D deve renderizar o resumo consolidado de viagens do dia",
    );
  });

  test("4. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido em rótulos e textos", async () => {
    const drawerCode = await fs.readFile(
      new URL(
        "../../../src/features/monitor-gps/components/VehicleTelemetryDrawer.tsx",
        import.meta.url,
      ),
      "utf-8",
    );
    const gpsMonitorCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // Proibição estrita de "Proteção & Limites" (deve ser "Proteção e Limites")
    assert.ok(
      !drawerCode.includes("Proteção & Limites"),
      "Proibido usar '&' em 'Proteção e Limites' no VehicleTelemetryDrawer",
    );
    assert.ok(
      !gpsMonitorCode.includes("Proteção & Limites"),
      "Proibido usar '&' em 'Proteção e Limites' no GpsMonitorView",
    );
    assert.ok(
      drawerCode.includes("Proteção e Limites"),
      "Deve utilizar a conjunção vernácula formal 'Proteção e Limites'",
    );
  });

  test("5. Regra Hunter: Mapa deve renderizar estritamente o veículo selecionado (sem empilhar múltiplos rastreadores)", async () => {
    const gpsMonitorCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // Deve possuir o cálculo de veiculosNoMapa baseado unicamente no veículo selecionado
    assert.ok(
      gpsMonitorCode.includes("veiculosNoMapa"),
      "Monitor GPS deve definir veiculosNoMapa para envio aos motores de mapa",
    );
    assert.ok(
      gpsMonitorCode.includes("veiculos={veiculosNoMapa}"),
      "Motores Leaflet e MapLibre devem receber estritamente veiculosNoMapa e não a frota inteira",
    );
    assert.ok(
      gpsMonitorCode.includes("Selecione um veículo na lista para visualizar no mapa"),
      "Deve exibir orientação tática quando nenhum veículo estiver selecionado em frotas múltiplas",
    );
  });

  test("6. Regra Hunter: Usuário com apenas um cadastrado é selecionado por padrão sem opção de desmarcar", async () => {
    const realtimeCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/hooks/useGpsRealtime.ts", import.meta.url),
      "utf-8",
    );
    const gpsMonitorCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // No hook useGpsRealtime: se houver 1 veículo, já seleciona por padrão
    assert.ok(
      realtimeCode.includes("lista.length === 1"),
      "useGpsRealtime deve verificar se há apenas 1 veículo cadastrado",
    );
    assert.ok(
      realtimeCode.includes("veiculos.length === 1 && veiculo === null"),
      "useGpsRealtime deve blindar desmarcação quando houver apenas 1 veículo",
    );

    // No GpsMonitorView: desmarcação só é habilitada quando houver mais de um veículo filtrado
    assert.ok(
      gpsMonitorCode.includes(
        "veiculosFiltrados.length > 1 ? () => setVeiculoSelecionado(null) : undefined",
      ) ||
        gpsMonitorCode.includes(
          "veiculos.length > 1 ? () => setVeiculoSelecionado(null) : undefined",
        ),
      "onDeselecionarVeiculo deve ser estritamente undefined quando houver apenas 1 veículo",
    );
  });
});
