import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LISTA_TIPOS_VEICULO,
  normalizarTipoVeiculo,
  obterRotuloTipoVeiculo,
  getVehicleSvg3DContent,
  gerarMarcador3DHtml,
  formatarPlacaOuChassi,
  type TipoVeiculo,
} from "../../features/monitor-gps/utils/vehicle3dIcons";
import {
  avaliarEstadoRotaDinamica,
  calcularPontoMaisProximoDaRota,
  type RotaMonitorada,
} from "../../features/monitor-gps/services/rotaMonitoradaService";

describe("Hunter — Tipos de Veículo e Símbolos 3D Modernos no Mapa", () => {
  const tiposEsperados: TipoVeiculo[] = [
    "jetski",
    "carro",
    "suv",
    "camionete",
    "van",
    "ambulancia",
    "caminhao",
    "onibus",
    "moto",
    "moto_eletrica",
    "quadriciculo",
    "triciclo",
    "maquina",
  ];

  it("deve conter exatamente os 13 tipos canônicos de veículo solicitados incluindo máquinas e moto elétrica", () => {
    assert.equal(LISTA_TIPOS_VEICULO.length, 13);
    for (const tipo of tiposEsperados) {
      const existe = LISTA_TIPOS_VEICULO.some((t) => t.id === tipo);
      assert.equal(existe, true, `Tipo de veículo ${tipo} deve estar presente`);
    }
  });

  it("deve normalizar aliases e variações dos tipos com segurança", () => {
    assert.equal(normalizarTipoVeiculo("jetski"), "jetski");
    assert.equal(normalizarTipoVeiculo("Jet Ski"), "jetski");
    assert.equal(normalizarTipoVeiculo("embarcacao"), "jetski");
    assert.equal(normalizarTipoVeiculo("picape"), "camionete");
    assert.equal(normalizarTipoVeiculo("pickup"), "camionete");
    assert.equal(normalizarTipoVeiculo("van"), "van");
    assert.equal(normalizarTipoVeiculo("furgão"), "van");
    assert.equal(normalizarTipoVeiculo("ambulancia"), "ambulancia");
    assert.equal(normalizarTipoVeiculo("ambulância"), "ambulancia");
    assert.equal(normalizarTipoVeiculo("samu"), "ambulancia");
    assert.equal(normalizarTipoVeiculo("resgate"), "ambulancia");
    assert.equal(normalizarTipoVeiculo("motocicleta"), "moto");
    assert.equal(normalizarTipoVeiculo("caminhão"), "caminhao");
    assert.equal(normalizarTipoVeiculo("ônibus"), "onibus");
    assert.equal(normalizarTipoVeiculo("moto_eletrica"), "moto_eletrica");
    assert.equal(normalizarTipoVeiculo("scooter eletrica"), "moto_eletrica");
    assert.equal(normalizarTipoVeiculo("e-bike"), "moto_eletrica");
    assert.equal(normalizarTipoVeiculo("ciclomotor"), "moto_eletrica");
    assert.equal(normalizarTipoVeiculo("quadriciclo"), "quadriciculo");
    assert.equal(normalizarTipoVeiculo("triciclo"), "triciclo");
    assert.equal(normalizarTipoVeiculo(null), "carro");
    assert.equal(normalizarTipoVeiculo(undefined), "carro");
  });

  it("deve obter o rótulo amigável oficial de cada tipo", () => {
    assert.equal(obterRotuloTipoVeiculo("jetski"), "Jet Ski");
    assert.equal(obterRotuloTipoVeiculo("carro"), "Carro");
    assert.equal(obterRotuloTipoVeiculo("suv"), "SUV");
    assert.equal(obterRotuloTipoVeiculo("camionete"), "Camionete");
    assert.equal(obterRotuloTipoVeiculo("van"), "Van");
    assert.equal(obterRotuloTipoVeiculo("ambulancia"), "Ambulância");
    assert.equal(obterRotuloTipoVeiculo("caminhao"), "Caminhão");
    assert.equal(obterRotuloTipoVeiculo("onibus"), "Ônibus");
    assert.equal(obterRotuloTipoVeiculo("moto"), "Moto");
    assert.equal(obterRotuloTipoVeiculo("moto_eletrica"), "Moto Elétrica");
    assert.equal(obterRotuloTipoVeiculo("quadriciculo"), "Quadriciclo");
    assert.equal(obterRotuloTipoVeiculo("triciclo"), "Triciclo");
    assert.equal(obterRotuloTipoVeiculo("maquina"), "Máquina");
  });

  it("deve renderizar elementos 3D volumétricos com perspectiva e sombra para todos os 11 tipos", () => {
    for (const tipo of tiposEsperados) {
      const svg = getVehicleSvg3DContent(tipo, "#10B981");
      assert.ok(svg.length > 50, `SVG 3D do tipo ${tipo} deve possuir conteúdo renderizado`);
      assert.ok(
        svg.includes("filter="),
        `SVG 3D do tipo ${tipo} deve possuir efeito de profundidade/sombra`,
      );
    }
  });

  it("deve gerar o HTML do marcador 3D com mini-placa Mercosul e rotação de rumo", () => {
    const html = gerarMarcador3DHtml({
      placa: "BRA2E19",
      tipo: "suv",
      corStatus: "#10B981",
      anguloRumo: 90,
      isSelected: true,
      temAlerta: false,
      isEmRota: true,
    });

    assert.ok(html.includes("BRA2E19"), "Deve exibir a placa Mercosul no marcador");
    assert.ok(html.includes("rotate(90deg)"), "Deve aplicar a rotação de rumo ao símbolo 3D");
    assert.ok(
      html.includes("BRASIL") || html.includes("#003399"),
      "Deve possuir a faixa azul Mercosul",
    );
  });

  it("deve formatar placa Mercosul ou usar os 6 últimos dígitos do chassi para identificar no mapa", () => {
    assert.equal(formatarPlacaOuChassi("ABC1D23", "9BWZZZ377VT012345"), "ABC1D23");
    assert.equal(formatarPlacaOuChassi(null, "9BWZZZ377VT012345"), "012345");
    assert.equal(formatarPlacaOuChassi("", "9BWZZZ377VT012345"), "012345");
    assert.equal(formatarPlacaOuChassi("SEM PLACA", "9BWZZZ377VT012345"), "012345");
    assert.equal(formatarPlacaOuChassi("SEMPLACA", "9BWZZZ377VT654321"), "654321");
    assert.equal(formatarPlacaOuChassi("A DEFINIR", "1234567"), "234567");
    assert.equal(formatarPlacaOuChassi(null, null), "SEM PLACA");

    const htmlChassi = gerarMarcador3DHtml({
      placa: "SEM PLACA",
      chassi: "9BWZZZ377VT012345",
      tipo: "moto_eletrica",
      corStatus: "#06B6D4",
    });
    assert.ok(
      htmlChassi.includes("012345"),
      "Marcador 3D deve exibir os 6 últimos dígitos do chassi no mapa",
    );
  });
});

describe("Hunter — Rota Monitorada: Dinâmica Cromática e Caminho de Retomada em Verde", () => {
  // Rota de teste: Reta da Av. Brasil (RJ)
  const rotaMock: RotaMonitorada = {
    id: "rota-001",
    veiculo_id: "v-001",
    cliente_id: "c-001",
    trajeto_salvo_id: null,
    nome: "Rota Transporte Seguro",
    coordenadas_rota: [
      [-22.85, -43.3],
      [-22.86, -43.3],
      [-22.87, -43.3],
    ],
    tolerancia_desvio_metros: 100,
    status: "ativa",
    desvio_detectado: false,
    ultima_distancia_desvio_m: 0,
    iniciada_at: new Date().toISOString(),
  };

  it("deve manter rota Azul Cintilante (normal) quando veículo estiver no trajeto (<= 40m)", () => {
    // Veículo exatamente em cima da rota
    const res = avaliarEstadoRotaDinamica(-22.855, -43.3, rotaMock);
    assert.equal(res.estadoCromatico, "normal");
    assert.equal(res.emDesvio, false);
    assert.ok(res.distanciaMetros <= 40);
  });

  it("deve alterar a rota para Laranja (atencao) quando o veículo sair da rota entre 40m e a tolerância", () => {
    // Veículo a ~60 metros a leste da rota (longitude deslocada levemente)
    // 0.0006 graus de longitude no RJ (~-22.85°) equivale a ~60 metros
    const res = avaliarEstadoRotaDinamica(-22.855, -43.2994, rotaMock);
    assert.equal(res.estadoCromatico, "atencao");
    assert.equal(res.emDesvio, false); // Ainda não ultrapassou a tolerância estipulada de 100m
    assert.ok(res.distanciaMetros > 40 && res.distanciaMetros <= 100);
  });

  it("deve alterar a rota para Vermelho e gerar caminho de retomada em Verde quando exceder a tolerância estipulada", () => {
    // Veículo a ~300 metros da rota
    const res = avaliarEstadoRotaDinamica(-22.855, -43.297, rotaMock);
    assert.equal(res.estadoCromatico, "desvio_critico");
    assert.equal(res.emDesvio, true);
    assert.ok(res.distanciaMetros > 100);

    // Caminho de retomada deve conectar o veículo de volta à rota correta
    assert.equal(res.caminhoRetomada.length, 2);
    assert.deepEqual(res.caminhoRetomada[0], [-22.855, -43.297]); // Posição atual do veículo
    assert.ok(Math.abs(res.caminhoRetomada[1][1] - -43.3) < 0.001); // Ponto de reingresso na rota original
  });

  it("deve calcular o ponto de reingresso exato na perpendicular da rota", () => {
    const { ponto, distancia } = calcularPontoMaisProximoDaRota(
      -22.855,
      -43.297,
      rotaMock.coordenadas_rota,
    );
    assert.ok(distancia > 250);
    // Ponto mais próximo na reta longitudinal deve ter latitude próxima de -22.8550 e longitude -43.3000
    assert.ok(Math.abs(ponto[0] - -22.855) < 0.001);
    assert.ok(Math.abs(ponto[1] - -43.3) < 0.0001);
  });
});
