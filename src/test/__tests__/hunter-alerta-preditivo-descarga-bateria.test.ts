import test from "node:test";
import assert from "node:assert/strict";
import { detectarDescargaParasitaBateria } from "../../features/monitor-gps/services/anomaliaService";

test("HUNTER — Alerta Preditivo de Descarga Parasita de Bateria", async (t) => {
  await t.test(
    "1. Não deve disparar alerta quando o veículo está com bateria saudável e sem queda",
    () => {
      const veiculo = {
        id: "veic-1",
        placa: "ABC1D23",
        ignicao: false,
        bateria_veiculo_v: 12.5,
      };
      const historico = [
        { dataHora: new Date(Date.now() - 24 * 3600 * 1000), voltagem: 12.6, ignicao: false },
        { dataHora: new Date(), voltagem: 12.5, ignicao: false },
      ];

      const resultado = detectarDescargaParasitaBateria(veiculo, historico);
      assert.equal(resultado.detectado, false);
      assert.equal(resultado.anomalia, undefined);
    },
  );

  await t.test(
    "2. Deve disparar alerta preditivo quando a voltagem cai > 0.45V após 24h estacionado",
    () => {
      const veiculo = {
        id: "veic-2",
        placa: "AXH0E44",
        ignicao: false,
        bateria_veiculo_v: 12.0,
      };
      const historico = [
        { dataHora: new Date(Date.now() - 24 * 3600 * 1000), voltagem: 12.6, ignicao: false },
        { dataHora: new Date(), voltagem: 12.0, ignicao: false },
      ];

      const resultado = detectarDescargaParasitaBateria(veiculo, historico);
      assert.equal(resultado.detectado, true);
      assert.equal(resultado.anomalia?.tipo, "descarga_parasita_bateria");
      assert.equal(resultado.anomalia?.relevancia, "alta");
      assert.match(resultado.anomalia?.titulo || "", /Descarga Parasita/);
    },
  );

  await t.test("3. Deve disparar alerta crítico se a tensão cair abaixo de 11.6V", () => {
    const veiculo = {
      id: "veic-3",
      placa: "LTK1A94",
      ignicao: false,
      bateria_veiculo_v: 11.4,
    };
    const historico = [
      { dataHora: new Date(Date.now() - 12 * 3600 * 1000), voltagem: 12.2, ignicao: false },
      { dataHora: new Date(), voltagem: 11.4, ignicao: false },
    ];

    const resultado = detectarDescargaParasitaBateria(veiculo, historico);
    assert.equal(resultado.detectado, true);
    assert.equal(resultado.anomalia?.relevancia, "critica");
    assert.match(resultado.anomalia?.titulo || "", /Risco Iminente de Não Partida/);
  });

  await t.test(
    "4. Não deve disparar se houver pontos com ignição ligada (alternador carregando)",
    () => {
      const veiculo = {
        id: "veic-4",
        placa: "XYZ9K88",
        ignicao: true,
        bateria_veiculo_v: 14.1,
      };
      const historico = [
        { dataHora: new Date(Date.now() - 2 * 3600 * 1000), voltagem: 12.0, ignicao: true },
        { dataHora: new Date(), voltagem: 14.1, ignicao: true },
      ];

      const resultado = detectarDescargaParasitaBateria(veiculo, historico);
      assert.equal(resultado.detectado, false);
    },
  );
});
