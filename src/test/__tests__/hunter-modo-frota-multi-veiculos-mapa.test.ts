import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

describe("Hunter — Visualização Multi-Veículo no Mapa Operacional (Modo Frota)", () => {
  test("1. GpsMonitorView deve prover estado e controles para alternar entre Foco Individual e Visão de Frota", async () => {
    const gpsMonitorCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // Estado modoVisaoFrota
    assert.ok(
      gpsMonitorCode.includes("const [modoVisaoFrota, setModoVisaoFrota] = useState(false);"),
      "GpsMonitorView deve possuir o estado modoVisaoFrota",
    );

    // veiculosNoMapa deve suportar múltiplos veículos no modo frota com respeito à privacidade e isolamento estrito
    assert.ok(
      gpsMonitorCode.includes("if (modoVisaoFrota && veiculosFiltrados.length > 1)"),
      "veiculosNoMapa deve alimentar os mapas estritamente com os veículos filtrados e autorizados quando modoVisaoFrota estiver ativo",
    );
    assert.ok(
      gpsMonitorCode.includes("podeAcessarLocalizacaoVeiculo(session, v)"),
      "veiculosNoMapa deve validar privacidade individual de cada veículo ao exibir a frota",
    );

    // Botão nos cabeçalhos desktop e mobile
    assert.ok(
      gpsMonitorCode.includes("Frota Completa"),
      "Cabeçalho desktop deve exibir rótulo de Frota Completa quando o modo estiver ativo",
    );
    assert.ok(
      gpsMonitorCode.includes("Ver Frota"),
      "Cabeçalho deve possuir atalho para Ver Frota quando houver múltiplos veículos",
    );

    // Alternância na sidebar de veículos
    assert.ok(
      gpsMonitorCode.includes("Visão no Mapa:"),
      "Sidebar deve apresentar seletor tático de Visão no Mapa (Foco vs Toda Frota)",
    );

    // Banner de instrução e atalho quando nenhum veículo estiver selecionado
    assert.ok(
      gpsMonitorCode.includes("Selecione um veículo na lista para visualizar no mapa"),
      "Deve manter a instrução canônica para quando nenhum veículo estiver selecionado",
    );
    assert.ok(
      gpsMonitorCode.includes("Ver toda a frota"),
      "Banner flutuante deve prover botão de 1 toque para Ver toda a frota",
    );
  });

  test("2. Motores Leaflet e MapLibre devem implementar enquadramento da frota via fitBounds", async () => {
    const leafletCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/LeafletEngine.tsx", import.meta.url),
      "utf-8",
    );
    const maplibreCode = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/MapLibre3DEngine.tsx", import.meta.url),
      "utf-8",
    );

    assert.ok(
      leafletCode.includes("ajustarVisaoFrota"),
      "LeafletEngine deve possuir função ajustarVisaoFrota",
    );
    assert.ok(
      leafletCode.includes("fitBounds: ajustarVisaoFrota"),
      "LeafletEngine deve expor fitBounds via useImperativeHandle",
    );

    assert.ok(
      maplibreCode.includes("ajustarVisaoFrota"),
      "MapLibre3DEngine deve possuir função ajustarVisaoFrota",
    );
    assert.ok(
      maplibreCode.includes("fitBounds: ajustarVisaoFrota"),
      "MapLibre3DEngine deve expor fitBounds via useImperativeHandle",
    );
  });
});
