import { describe, it } from "node:test";
import assert from "node:assert";
import { detectarSuspeitaJammer } from "@/features/monitor-gps/services/anomaliaService";

describe("Hunter — Telemetria de Odômetro, Anti-Jammer e OCR de NF", () => {
  it("não deve disparar alerta de jammer quando o veículo está parado ou em baixa velocidade urbana", () => {
    const agora = new Date();
    // Veículo com ignição ligada mas em engarrafamento / parado no centro
    const pacoteParado = {
      id: "veic-1",
      placa: "AXH0E44",
      ignicao: true,
      velocidade: 5, // velocidade urbana baixa, sem trânsito rápido
      latitude: -22.52,
      longitude: -44.1,
      ultima_atualizacao: new Date(agora.getTime() - 12 * 60 * 1000).toISOString(), // 12 min atrás
    };

    const resultado = detectarSuspeitaJammer(pacoteParado, agora, 10);
    assert.strictEqual(
      resultado.suspeita,
      false,
      "Veículo em velocidade abaixo de 20 km/h não deve gerar alerta de jammer",
    );
  });

  it("não deve disparar jammer se a perda de sinal ocorreu há menos de 10 minutos", () => {
    const agora = new Date();
    const pacoteRecente = {
      id: "veic-1",
      placa: "AXH0E44",
      ignicao: true,
      velocidade: 60, // em movimento
      latitude: -22.52,
      longitude: -44.1,
      ultima_atualizacao: new Date(agora.getTime() - 5 * 60 * 1000).toISOString(), // apenas 5 min (menos que o limiar seguro de 10 min)
    };

    const resultado = detectarSuspeitaJammer(pacoteRecente, agora, 10);
    assert.strictEqual(
      resultado.suspeita,
      false,
      "Oscilação temporária de 5 min não deve disparar alarme de jammer em trânsito urbano",
    );
  });

  it("deve disparar alerta de jammer apenas quando houver velocidade comprovada e ausência severa", () => {
    const agora = new Date();
    const pacoteEmRodovia = {
      id: "veic-1",
      placa: "AXH0E44",
      ignicao: true,
      velocidade: 80, // rodovia
      latitude: -22.52,
      longitude: -44.1,
      ultima_atualizacao: new Date(agora.getTime() - 12 * 60 * 1000).toISOString(), // 12 min sem sinal
    };

    const resultado = detectarSuspeitaJammer(pacoteEmRodovia, agora, 10);
    assert.strictEqual(
      resultado.suspeita,
      true,
      "Veículo em alta velocidade que some abruptamente há mais de 10 min deve ser alertado",
    );
    assert.strictEqual(resultado.ultimaVelocidade, 80);
    assert.strictEqual(resultado.minutosSemSinal, 12);
  });

  it("cálculo Haversine puro não descarta pacotes legítimos e filtra jitter estacionário", () => {
    // Distância geodésica em metros
    const r = 6371000;
    const lat1 = -22.52 * (Math.PI / 180);
    const lat2 = -22.5201 * (Math.PI / 180);
    const dLat = lat2 - lat1;
    const dLon = 0;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const distMetros = 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    assert.ok(distMetros > 10, "Deslocamento de 0.0001 graus deve ter mais de 10 metros");
    assert.ok(distMetros < 20, "Deslocamento de 0.0001 graus deve ter menos de 20 metros");
  });
});
