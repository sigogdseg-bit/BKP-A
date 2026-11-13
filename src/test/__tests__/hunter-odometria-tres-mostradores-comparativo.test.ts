import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MotorOdometroPropostaA,
  MotorOdometroPropostaB,
  MotorOdometroPropostaC,
  gerarCenariosSimulacao,
  executarComparativoCompleto,
} from "../../features/monitor-gps/lib/motoresOdometroComparativo";

describe("Odometria Fusional · Comparativo dos 3 Motores (A, B e C)", () => {
  it("1. Todos os 3 motores devem iniciar ancorados em 183.421,0 km", () => {
    const motorA = new MotorOdometroPropostaA(183421.0);
    const motorB = new MotorOdometroPropostaB(183421.0);
    const motorC = new MotorOdometroPropostaC(183421.0);

    const pingInicial = {
      imei: "863874085222366",
      timestamp: 1774000000000,
      latitude: -23.55052,
      longitude: -46.633308,
      velocidade: 0.0,
      curso: 90.0,
      ignicao: false,
      satelites: 8,
      odometro_mcu_metros: 183418000,
    };

    const resA = motorA.processarPing(pingInicial);
    const resB = motorB.processarPing(pingInicial);
    const resC = motorC.processarPing(pingInicial);

    assert.equal(resA.odometroKm, 183421.0);
    assert.equal(resB.odometroKm, 183421.0);
    assert.equal(resC.odometroKm, 183421.0);
  });

  it("2. Cenário Reta em Rodovia (100 km/h contínuo): os 3 motores devem somar deslocamento de ~833m", () => {
    const motorA = new MotorOdometroPropostaA(183421.0);
    const motorB = new MotorOdometroPropostaB(183421.0);
    const motorC = new MotorOdometroPropostaC(183421.0);

    const cenarios = gerarCenariosSimulacao();
    const cenarioReta = cenarios.find((c) => c.id === "reta_rodovia")!;

    motorA.processarPing(cenarioReta.pings[0]);
    const resA = motorA.processarPing(cenarioReta.pings[1]);

    motorB.processarPing(cenarioReta.pings[0]);
    const resB = motorB.processarPing(cenarioReta.pings[1]);

    motorC.processarPing(cenarioReta.pings[0]);
    const resC = motorC.processarPing(cenarioReta.pings[1]);

    // Em 30s a 100 km/h o deslocamento real é ~833.3m
    assert.ok(resA.deltaMetros > 800 && resA.deltaMetros < 850);
    assert.ok(resB.deltaMetros > 800 && resB.deltaMetros < 850);
    assert.ok(resC.deltaMetros > 800 && resC.deltaMetros < 850);

    assert.equal(resA.estadoZvu, "MOVIMENTO");
    assert.equal(resB.estadoZvu, "MOVIMENTO");
    assert.equal(resC.estadoZvu, "MOVIMENTO");
  });

  it("3. Cenário Semáforo Parado (Motor Ligado / ACC=ON): ZVU deve travar KM fantasma", () => {
    const motorA = new MotorOdometroPropostaA(183421.0);
    const motorB = new MotorOdometroPropostaB(183421.0);
    const motorC = new MotorOdometroPropostaC(183421.0);

    const cenarios = gerarCenariosSimulacao();
    const cenarioSemaforo = cenarios.find((c) => c.id === "semaforo_parado")!;

    motorA.processarPing(cenarioSemaforo.pings[0]);
    const resA = motorA.processarPing(cenarioSemaforo.pings[1]);

    motorB.processarPing(cenarioSemaforo.pings[0]);
    const resB = motorB.processarPing(cenarioSemaforo.pings[1]);

    motorC.processarPing(cenarioSemaforo.pings[0]);
    const resC = motorC.processarPing(cenarioSemaforo.pings[1]);

    // ZVU nos 3 motores deve zerar o incremento
    assert.equal(resA.deltaMetros, 0.0);
    assert.equal(resC.deltaMetros, 0.0);
    assert.equal(resC.estadoZvu, "PARADO_ZVU");
  });

  it("4. Cenário Estacionado com Chave Desligada (ACC=OFF): Bloqueio absoluto de deriva térmica", () => {
    const motorA = new MotorOdometroPropostaA(183421.0);
    const motorC = new MotorOdometroPropostaC(183421.0);

    const cenarios = gerarCenariosSimulacao();
    const cenarioEstacionado = cenarios.find((c) => c.id === "estacionado_acc_off")!;

    motorA.processarPing(cenarioEstacionado.pings[0]);
    const resA = motorA.processarPing(cenarioEstacionado.pings[1]);

    motorC.processarPing(cenarioEstacionado.pings[0]);
    const resC = motorC.processarPing(cenarioEstacionado.pings[1]);

    assert.equal(resA.deltaMetros, 0.0);
    assert.equal(resC.deltaMetros, 0.0);
    assert.equal(resA.odometroKm, 183421.0);
    assert.equal(resC.odometroKm, 183421.0);
  });

  it("5. Execução do comparativo completo deve retornar leituras consistentes para os 3 mostradores", () => {
    const comparativo = executarComparativoCompleto();
    assert.equal(comparativo.mostradorA.motorId, "a");
    assert.equal(comparativo.mostradorB.motorId, "b");
    assert.equal(comparativo.mostradorC.motorId, "c");

    assert.ok(comparativo.mostradorA.odometroKm > 183421.0);
    assert.ok(comparativo.mostradorB.odometroKm > 183421.0);
    assert.ok(comparativo.mostradorC.odometroKm > 183421.0);
  });
});
