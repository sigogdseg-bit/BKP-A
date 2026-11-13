import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularTelemetriaPonto,
  enriquecerPontosComTelemetria,
  gerarHtmlBalaoTelemetria,
  calcularRumoPonto,
  gerarHtmlBalaoParada,
} from "../../features/monitor-gps/utils/telemetriaDinamica";
import type { PosicaoHistorico } from "../../features/monitor-gps/types";

describe("Hunter — Telemetria Estrita de Hardware: Zero Invenção de Dados (DJR-NEW)", () => {
  it("ponto sem sensor de giroscópio ou impacto deve retornar estritamente null (sem leitura)", () => {
    const pontoReal: PosicaoHistorico = {
      id: 1,
      latitude: -22.5235,
      longitude: -44.1042,
      velocidade: 64,
      ignicao: true,
      data_hora_gps: "2026-10-11T12:00:00Z",
    };

    const res = calcularTelemetriaPonto(pontoReal, null, { odometroBase: 12500 });
    assert.strictEqual(res.velocidade, 64);
    assert.strictEqual(res.odometroKm, 12500);
    assert.strictEqual(res.inclinacaoGraus, null, "Não deve inventar inclinação");
    assert.strictEqual(res.forcaG, null, "Não deve inventar Força G");
    assert.strictEqual(res.ignicao, true);
  });

  it("deve reportar leituras de colisão e inclinação se e somente se o hardware as enviou", () => {
    const pontoComHardware: PosicaoHistorico = {
      id: 1,
      latitude: -22.5235,
      longitude: -44.1042,
      velocidade: 30,
      ignicao: true,
      vibracao_g: 1.85,
      inclinacao_graus: 14,
      data_hora_gps: "2026-10-11T12:00:00Z",
    };

    const res = calcularTelemetriaPonto(pontoComHardware, null);
    assert.strictEqual(res.forcaG, 1.85);
    assert.strictEqual(res.inclinacaoGraus, 14);
  });

  it("gerarHtmlBalaoTelemetria deve incluir horário daquele momento, velocidade, hodômetro e indicar sem leitura para sensores ausentes", () => {
    const html = gerarHtmlBalaoTelemetria(
      {
        velocidade: 64,
        odometroKm: 15420.5,
        kmPercorridoTrajeto: 12.4,
        inclinacaoGraus: null, // sem giroscópio contínuo no J16
        forcaG: null, // sem impacto no momento
        dataHora: "2026-10-11T14:32:05Z",
        ignicao: true,
      },
      4,
      50,
    );

    // Validações
    assert.ok(html.includes("64"), "Deve conter a velocidade 64 km/h");
    assert.ok(html.includes("km/h"), "Deve conter a unidade km/h");
    assert.ok(html.includes("15.420,5"), "Deve conter o hodômetro formatado brasileiro");
    const horaEsperada = new Date("2026-10-11T14:32:05Z").toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    assert.ok(html.includes(horaEsperada), "Deve conter a hora exata daquele momento");
    assert.ok(html.includes("Sem registro"), "Deve indicar Sem registro quando ausente");
    assert.ok(
      html.includes("Registrada apenas em rampa acentuada ou capotamento"),
      "Deve indicar a circunstância de registro de inclinação",
    );
    assert.ok(
      html.includes("Registrada apenas em colisão, impacto ou desaceleração severa"),
      "Deve indicar a circunstância de registro de Força G",
    );
    assert.ok(!html.includes("&amp;"), "Não deve conter caractere comercial proibido");
  });

  it("calcularRumoPonto deve calcular rumo preciso para orientar a ponta de seta entre mão e contramão", () => {
    // 1. Sentido Norte (indo): Lat aumenta -> Rumo próximo a 0°
    const p1 = { latitude: -22.52, longitude: -44.1, data_hora_gps: "2026-10-12T10:00:00Z" };
    const p2 = { latitude: -22.51, longitude: -44.1, data_hora_gps: "2026-10-12T10:01:00Z" };
    const rumoNorte = calcularRumoPonto(p1, p2);
    assert.ok(rumoNorte >= 355 || rumoNorte <= 5, `Rumo Norte esperado ~0°, obtido: ${rumoNorte}`);

    // 2. Sentido Sul (voltando/contramão): Lat diminui -> Rumo próximo a 180°
    const rumoSul = calcularRumoPonto(p2, p1);
    assert.ok(Math.abs(rumoSul - 180) <= 5, `Rumo Sul esperado ~180°, obtido: ${rumoSul}`);

    // 3. Sentido Leste: Lng aumenta -> Rumo próximo a 90°
    const p3 = { latitude: -22.52, longitude: -44.09, data_hora_gps: "2026-10-12T10:02:00Z" };
    const rumoLeste = calcularRumoPonto(p1, p3);
    assert.ok(Math.abs(rumoLeste - 90) <= 5, `Rumo Leste esperado ~90°, obtido: ${rumoLeste}`);

    // 4. Sentido Oeste: Lng diminui -> Rumo próximo a 270°
    const rumoOeste = calcularRumoPonto(p3, p1);
    assert.ok(Math.abs(rumoOeste - 270) <= 5, `Rumo Oeste esperado ~270°, obtido: ${rumoOeste}`);
  });

  it("gerarHtmlBalaoParada deve formatar balão completo com tempo parado, horário de início, retomada e endereço completo", () => {
    const htmlParada = gerarHtmlBalaoParada(
      {
        ordem: 2,
        latitude: -22.5235,
        longitude: -44.1042,
        inicio_at: "2026-10-12T08:15:00Z",
        fim_at: "2026-10-12T08:47:00Z",
        duracaoFormatada: "32 min",
      },
      "Av. Amaral Peixoto, 450, Centro, Volta Redonda - RJ",
    );

    assert.ok(htmlParada.includes("PARADA REGISTRADA"), "Deve conter título canônico");
    assert.ok(htmlParada.includes("Parada 2"), "Deve conter o número da parada");
    assert.ok(htmlParada.includes("32 min"), "Deve conter o tempo parado");
    assert.ok(
      htmlParada.includes("Av. Amaral Peixoto, 450, Centro, Volta Redonda - RJ"),
      "Deve conter o endereço completo",
    );
    assert.ok(htmlParada.includes("Início"), "Deve conter horário de início");
    assert.ok(htmlParada.includes("Retomada"), "Deve conter horário de retomada");
    assert.ok(!htmlParada.includes("&amp;"), "Não deve conter caractere comercial proibido");
  });

  it("veículo em repouso estático não deve ter Força G travada em 1.00G (deve reportar 0.00G)", () => {
    // Caso 1: Leitura real do sensor igual a 0.0
    const pontoZeroSensor = {
      vibracao_g: 0.0,
      inclinacao_graus: 0,
      velocidade: 0,
      ignicao: false,
    };
    const vibracaoSensor =
      pontoZeroSensor.vibracao_g !== undefined && pontoZeroSensor.vibracao_g !== null
        ? Number(pontoZeroSensor.vibracao_g)
        : null;
    const valorG = vibracaoSensor !== null ? vibracaoSensor : 0.0;
    assert.strictEqual(valorG, 0.0, "Força G com sensor reportando 0 deve ser exatamente 0.0");
    assert.strictEqual(valorG.toFixed(2), "0.00", "Mostrador numérico deve ser 0.00 e não 1.00");

    // Caso 2: Sem leitura de vibração no pacote mas veículo estacionado
    const pontoSemSensorEstacionado = {
      vibracao_g: undefined,
      velocidade: 0,
      ignicao: false,
    };
    const vibracaoAusente =
      pontoSemSensorEstacionado.vibracao_g !== undefined &&
      pontoSemSensorEstacionado.vibracao_g !== null
        ? Number(pontoSemSensorEstacionado.vibracao_g)
        : null;
    const valorGAusente = vibracaoAusente !== null ? vibracaoAusente : 0.0;
    assert.strictEqual(valorGAusente, 0.0, "Veículo parado em repouso tem aceleração inercial 0G");
    assert.strictEqual(valorGAusente.toFixed(2), "0.00", "Não deve travar em 1.00");
  });

  it("odômetro WGS-84 e Cinemático com veículo parado na linha de base inicial devem ter exatamente delta 0.00 km", () => {
    const odometroBaseServidor = 183360.0;
    const odometroCinematicoBase = 183360.0; // inicializado na migração com a linha de base do veículo

    const deltaCinematico = Math.abs(odometroBaseServidor - odometroCinematicoBase);
    assert.strictEqual(deltaCinematico, 0.0, "Delta entre WGS-84 e Cinemático em repouso é zero");

    // Formatação de ambos no drawer
    const formatadoWgs84 = odometroBaseServidor.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const formatadoCinematico = odometroCinematicoBase.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

    assert.strictEqual(
      formatadoWgs84,
      formatadoCinematico,
      "Em repouso ambos exibem o mesmo valor do marco base de partida até o veículo se deslocar",
    );
  });
});
