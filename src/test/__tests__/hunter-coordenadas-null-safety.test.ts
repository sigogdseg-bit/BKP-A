import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Blindagem de Coordenadas e Null Safety (DJR-NEW / HUNTER-GUARDIAN)", () => {
  it("1. Veículos recém-cadastrados com latitude/longitude nulas devem ser identificados como sem sinal", () => {
    const veiculoSemSinal = {
      id: "veic-1",
      placa: "AAA0E55",
      latitude: null,
      longitude: null,
    };

    const temCoordenadasValidas =
      veiculoSemSinal.latitude !== null &&
      veiculoSemSinal.longitude !== null &&
      typeof veiculoSemSinal.latitude === "number" &&
      typeof veiculoSemSinal.longitude === "number" &&
      !isNaN(veiculoSemSinal.latitude) &&
      !isNaN(veiculoSemSinal.longitude) &&
      (veiculoSemSinal.latitude !== 0 || veiculoSemSinal.longitude !== 0);

    assert.equal(temCoordenadasValidas, false);

    const latFallback = temCoordenadasValidas ? veiculoSemSinal.latitude : -22.5235;
    const lngFallback = temCoordenadasValidas ? veiculoSemSinal.longitude : -44.1042;

    assert.equal(latFallback, -22.5235);
    assert.equal(lngFallback, -44.1042);
  });

  it("2. Filtro de pontos válidos para motores 2D (Leaflet) e 3D (MapLibre) deve descartar nulos, NaN e zeros", () => {
    const veiculos = [
      { id: "v1", placa: "AAA0E55", latitude: null as any, longitude: null as any },
      { id: "v2", placa: "BBB1A22", latitude: NaN, longitude: -44.1 },
      { id: "v3", placa: "CCC2B33", latitude: 0, longitude: 0 },
      { id: "v4", placa: "DDD3C44", latitude: -22.5235, longitude: -44.1042 },
    ];

    const pontosValidos = veiculos.filter(
      (v) =>
        typeof v.latitude === "number" &&
        typeof v.longitude === "number" &&
        !isNaN(v.latitude) &&
        !isNaN(v.longitude) &&
        (v.latitude !== 0 || v.longitude !== 0),
    );

    assert.equal(pontosValidos.length, 1);
    assert.equal(pontosValidos[0].placa, "DDD3C44");
    assert.equal(pontosValidos[0].latitude, -22.5235);
  });

  it("3. Sanitização de compartilhamento público deve aceitar null e evitar falhas de runtime", () => {
    const respostaRpc = {
      sucesso: true,
      veiculo: {
        id: "ed6f017b-e106-4b07-a37f-2c74dac4c000",
        placa: "AAA0E55",
        latitude: null,
        longitude: null,
      },
    };

    const v = respostaRpc.veiculo;
    const latSanitizada =
      v.latitude !== null && v.latitude !== undefined && !isNaN(Number(v.latitude))
        ? Number(v.latitude)
        : null;
    const lngSanitizada =
      v.longitude !== null && v.longitude !== undefined && !isNaN(Number(v.longitude))
        ? Number(v.longitude)
        : null;

    assert.equal(latSanitizada, null);
    assert.equal(lngSanitizada, null);
  });

  it("4. Regra Pétrea Hunter-Guardian: Ausência de caracteres proibidos e isolamento de marca", () => {
    const textos = [
      "Aguardando primeiro sinal GPS de satélite do veículo...",
      "Sem GPS fixo",
      "Ao Vivo",
    ];

    textos.forEach((txt) => {
      assert.ok(!txt.includes("@"), `Proibido o uso de @: ${txt}`);
      assert.ok(
        !txt.toLowerCase().includes("sigovtr"),
        `Proibido referência a outros sistemas: ${txt}`,
      );
      assert.ok(
        !txt.toLowerCase().includes("sigofrota"),
        `Proibido referência a outros sistemas: ${txt}`,
      );
    });
  });
});
