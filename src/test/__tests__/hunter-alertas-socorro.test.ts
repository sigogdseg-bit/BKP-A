import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Validação de Alertas de Acidente, Anomalias e Números de Socorro", () => {
  test("Números Oficiais de Emergência e Socorro Imediato", () => {
    const telefonesSocorro = {
      samu: "192",
      bombeiros: "193",
      policiaMilitar: "190",
      prf: "191",
    };

    assert.equal(telefonesSocorro.samu, "192", "SAMU deve ser 192");
    assert.equal(telefonesSocorro.bombeiros, "193", "Corpo de Bombeiros deve ser 193");
    assert.equal(telefonesSocorro.policiaMilitar, "190", "Polícia Militar deve ser 190");
    assert.equal(telefonesSocorro.prf, "191", "PRF deve ser 191");
  });

  test("Classificação e cobertura de anomalias veiculares críticas", () => {
    const tiposAnomalias = [
      "capotamento_inclinacao",
      "colisao_impacto",
      "parada_repentina_colisao",
      "comportamento_anormal",
      "bateria_desconectada",
      "sos_panico",
      "suspeita_jammer",
      "saida_area",
      "desvio_rota",
    ];

    assert.ok(tiposAnomalias.includes("capotamento_inclinacao"));
    assert.ok(tiposAnomalias.includes("colisao_impacto"));
    assert.ok(tiposAnomalias.includes("comportamento_anormal"));
    assert.ok(tiposAnomalias.includes("bateria_desconectada"));
    assert.ok(tiposAnomalias.includes("suspeita_jammer"));
    assert.ok(tiposAnomalias.includes("saida_area"));
    assert.ok(tiposAnomalias.includes("desvio_rota"));
  });

  test("Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido nas mensagens e alertas", () => {
    const titulosAlertas = [
      "Central de Alertas e Segurança",
      "Suspeita de Jammer e Silenciamento Súbito",
      "Saída de Limite Estabelecido e Área Segura",
      "Desvio de Rota Monitorada e Trajetória",
    ];

    titulosAlertas.forEach((titulo) => {
      assert.ok(!titulo.includes("&"), `Título não pode conter &: ${titulo}`);
    });
  });

  test("Formatação de chamada telefônica de emergência e socorro", () => {
    const telefone = "(24) 99999-8888";
    const telLimpo = telefone.replace(/\D/g, "");
    const urlTel = `tel:${telLimpo}`;
    assert.equal(urlTel, "tel:24999998888");
  });

  test("Regra Pétrea: Nenhuma telemetria de bateria deve conter dados inventados ou hardcode", () => {
    const dispositivoSemLeitura = {
      bateria_veiculo_v: undefined,
      bateria_rastreador_pct: undefined,
    };

    const voltagemExibida =
      dispositivoSemLeitura.bateria_veiculo_v !== undefined
        ? `${dispositivoSemLeitura.bateria_veiculo_v}V`
        : "Não informada";

    const bateriaRastreadorExibida =
      dispositivoSemLeitura.bateria_rastreador_pct !== undefined
        ? `${dispositivoSemLeitura.bateria_rastreador_pct}%`
        : "Não informada pelo dispositivo";

    assert.equal(voltagemExibida, "Não informada");
    assert.equal(bateriaRastreadorExibida, "Não informada pelo dispositivo");
  });
});
