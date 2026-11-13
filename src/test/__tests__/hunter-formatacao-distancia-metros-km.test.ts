import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatarDistanciaViagem,
  formatarDistancia,
  formatarKm,
  formatarMinutos,
} from "../../features/monitor-gps/utils/formatadoresViagem";

describe("Hunter — Regras Canônicas de Formatação: Metros até KM e Minutos até Hora (DJR-NEW)", () => {
  it("1. Deslocamento menor que 1 km deve exibir em metros até virar km (ex: 410 m)", () => {
    // Caso real 1: Viagem de 0.41 km => 410 m
    assert.strictEqual(formatarKm(0.41), "410 m", "0.41 km deve ser exibido como 410 m");

    // Caso real 2: Viagem de 0.73 km => 730 m
    assert.strictEqual(formatarKm(0.73), "730 m", "0.73 km deve ser exibido como 730 m");

    // Outros pequenos percursos
    assert.strictEqual(formatarKm(0.05), "50 m");
    assert.strictEqual(formatarKm(0.12), "120 m");
    assert.strictEqual(formatarKm(0.85), "850 m");
  });

  it("2. Deslocamento zerado ou sem movimento real deve exibir 0 m (ou 0 km se forçado para odômetro)", () => {
    assert.strictEqual(formatarKm(0), "0 m");
    assert.strictEqual(formatarKm(null), "0 m");
    assert.strictEqual(formatarKm(undefined), "0 m");
    assert.strictEqual(formatarKm(""), "0 m");
    assert.strictEqual(formatarKm(0, 2, { forcarKm: true }), "0 km");
  });

  it("3. Deslocamentos a partir de 1 km mantêm até 2 casas decimais em km", () => {
    assert.strictEqual(formatarKm(1.0), "1 km");
    assert.strictEqual(formatarKm(2.27), "2,27 km");
    assert.strictEqual(formatarKm(5.25), "5,25 km");
    assert.strictEqual(formatarKm(5.8), "5,8 km");
    assert.strictEqual(formatarKm(120), "120 km");
    assert.strictEqual(formatarKm(1234.5), "1.234,5 km");
    assert.strictEqual(formatarKm(1234.56), "1.234,56 km");
  });

  it("4. Suporte a strings numéricas e conversão segura", () => {
    assert.strictEqual(formatarKm("0.41"), "410 m");
    assert.strictEqual(formatarKm("5.25"), "5,25 km");
    assert.strictEqual(formatarKm("0"), "0 m");
  });

  it("5. formatarDistanciaViagem e formatarDistancia preservam metros até virar km", () => {
    assert.strictEqual(formatarDistanciaViagem(0.41), "410 m");
    assert.strictEqual(formatarDistanciaViagem(0.73), "730 m");
    assert.strictEqual(formatarDistanciaViagem(5.25), "5,25 km");
    assert.strictEqual(formatarDistanciaViagem(5.8), "5,8 km");
    assert.strictEqual(formatarDistanciaViagem(0), "0 m");
    assert.strictEqual(formatarDistancia(0.85), "850 m");
    assert.strictEqual(formatarDistancia(31.11), "31,11 km");
  });

  it("6. formatarMinutos: minutos até virar hora, e acima de 60 min exibe em horas e minutos", () => {
    // Casos nulos / zero
    assert.strictEqual(formatarMinutos(0), "0 min");
    assert.strictEqual(formatarMinutos(null), "0 min");
    assert.strictEqual(formatarMinutos(undefined), "0 min");
    assert.strictEqual(formatarMinutos(""), "0 min");

    // Menor que 60 min: em minutos
    assert.strictEqual(formatarMinutos(1), "1 min");
    assert.strictEqual(formatarMinutos(15), "15 min");
    assert.strictEqual(formatarMinutos(45), "45 min");
    assert.strictEqual(formatarMinutos(59), "59 min");

    // A partir de 60 min: em horas e minutos
    assert.strictEqual(formatarMinutos(60), "1h");
    assert.strictEqual(formatarMinutos(65), "1h 5min");
    assert.strictEqual(formatarMinutos(75), "1h 15min");
    assert.strictEqual(formatarMinutos(120), "2h");

    // Caso real relatado pelo usuário: 322 min => 5h 22min
    assert.strictEqual(formatarMinutos(322), "5h 22min");

    // Longas durações
    assert.strictEqual(formatarMinutos(1440), "24h");
    assert.strictEqual(formatarMinutos("322"), "5h 22min");
  });
});
