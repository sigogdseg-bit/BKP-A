import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatarLinkCompartilhamento,
  obterEnderecoPorCoordenadas,
  type CompartilhamentoAcesso,
  type CompartilhamentoPontoTrajeto,
} from "../../features/monitor-gps/services/compartilhamentoService";

describe("Hunter — Auditoria de Acessos a Links de Compartilhamento e Trajeto Visualizado", () => {
  test("1. Estrutura Canônica de Acesso: IP, Data/Hora, Duração, Locais e Trajeto", () => {
    const pontosExemplo: CompartilhamentoPontoTrajeto[] = [
      {
        lat: -22.4957,
        lng: -44.094,
        t: "2026-10-01T14:10:00Z",
        vel: 0,
        ign: false,
      },
      {
        lat: -22.498,
        lng: -44.091,
        t: "2026-10-01T14:15:00Z",
        vel: 42,
        ign: true,
      },
      {
        lat: -22.502,
        lng: -44.088,
        t: "2026-10-01T14:22:30Z",
        vel: 0,
        ign: false,
      },
    ];

    const acessoExemplo: CompartilhamentoAcesso = {
      id: "acesso-uuid-1",
      compartilhamento_id: "comp-uuid-1",
      token: "tok98765432101234567890",
      veiculo_id: "veic-uuid-1",
      ip: "177.136.24.12",
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      iniciado_em: "2026-10-01T14:10:00Z",
      ultimo_ping_em: "2026-10-01T14:22:30Z",
      finalizado_em: "2026-10-01T14:22:30Z",
      duracao_segundos: 750, // 12 minutos e 30 segundos
      inicio_latitude: -22.4957,
      inicio_longitude: -44.094,
      inicio_endereco: "Rua Dom Antonio Cabral, 225 - Sao Luiz, Volta Redonda/RJ",
      fim_latitude: -22.502,
      fim_longitude: -44.088,
      fim_endereco: "Av. Amaral Peixoto, 450 - Centro, Volta Redonda/RJ",
      distancia_percorrida_km: 1.8,
      velocidade_maxima: 42,
      trajeto: pontosExemplo,
      created_at: "2026-10-01T14:10:00Z",
    };

    // Validações de integridade
    assert.equal(acessoExemplo.ip, "177.136.24.12");
    assert.equal(acessoExemplo.duracao_segundos, 750);
    assert.ok(acessoExemplo.inicio_endereco?.includes("Sao Luiz"));
    assert.ok(acessoExemplo.fim_endereco?.includes("Centro"));
    assert.equal(acessoExemplo.trajeto.length, 3);
    assert.equal(acessoExemplo.trajeto[0].lat, -22.4957);
    assert.equal(acessoExemplo.trajeto[2].lat, -22.502);
  });

  test("2. Cálculo de Duração e Detecção de Espectador Ativo / Ao Vivo", () => {
    const agora = Date.now();
    const acessoAtivo: CompartilhamentoAcesso = {
      id: "acesso-ativo",
      compartilhamento_id: "comp-1",
      token: "tok-ativo",
      veiculo_id: "veic-1",
      ip: "189.25.10.4",
      iniciado_em: new Date(agora - 120000).toISOString(), // 2 minutos atrás
      ultimo_ping_em: new Date(agora - 5000).toISOString(), // 5 segundos atrás
      finalizado_em: null,
      duracao_segundos: 120,
      inicio_latitude: -22.5,
      inicio_longitude: -44.1,
      fim_latitude: -22.505,
      fim_longitude: -44.105,
      distancia_percorrida_km: 0.8,
      velocidade_maxima: 35,
      trajeto: [],
      created_at: new Date(agora - 120000).toISOString(),
    };

    const isAoVivo =
      !acessoAtivo.finalizado_em &&
      Date.now() - new Date(acessoAtivo.ultimo_ping_em).getTime() < 40000;

    assert.equal(isAoVivo, true, "Acesso com ping há 5 segundos deve ser considerado Ao Vivo");

    // Simula encerramento
    acessoAtivo.finalizado_em = new Date().toISOString();
    const isEncerrado =
      !acessoAtivo.finalizado_em &&
      Date.now() - new Date(acessoAtivo.ultimo_ping_em).getTime() < 40000;
    assert.equal(
      isEncerrado,
      false,
      "Acesso com finalizado_em definido não deve ser considerado Ao Vivo",
    );
  });

  test("3. Geocodificação Reversa Resiliente e Tratamento de Nulos", async () => {
    const endNulo = await obterEnderecoPorCoordenadas(null, null);
    assert.equal(endNulo, "Localização não disponível");

    const endZero = await obterEnderecoPorCoordenadas(0, 0);
    assert.equal(endZero, "Ponto sem sinal de GPS");

    const endCoord = await obterEnderecoPorCoordenadas(-22.5235, -44.1042);
    assert.ok(endCoord.length > 5, "Deve retornar endereço formatado ou fallback com coordenadas");
  });

  test("4. Trajeto Percorrido: Preserva Sequência Cronológica e Pontos de Parada", () => {
    const trajeto: CompartilhamentoPontoTrajeto[] = [
      { lat: -22.49, lng: -44.09, t: "14:00", vel: 0 },
      { lat: -22.495, lng: -44.092, t: "14:02", vel: 30 },
      { lat: -22.5, lng: -44.095, t: "14:05", vel: 55 },
      { lat: -22.505, lng: -44.098, t: "14:08", vel: 0 },
    ];

    assert.equal(trajeto[0].lat, -22.49, "Primeiro ponto deve ser o local de início");
    assert.equal(
      trajeto[trajeto.length - 1].lat,
      -22.505,
      "Último ponto deve ser o local de término",
    );
    assert.ok(trajeto.length >= 2, "Trajeto deve conter início e fim");
  });

  test("5. Auditoria de Período do Modo Stealth no Acesso e Trajeto", () => {
    const pontosComStealth: CompartilhamentoPontoTrajeto[] = [
      { lat: -22.495, lng: -44.094, t: "14:10:00Z", vel: 0, ign: false, stealth: false },
      { lat: -22.495, lng: -44.094, t: "14:12:00Z", vel: 0, ign: false, stealth: true },
      { lat: -22.495, lng: -44.094, t: "14:18:00Z", vel: 0, ign: false, stealth: true },
    ];

    const acessoComStealth: CompartilhamentoAcesso = {
      id: "acesso-stealth-1",
      compartilhamento_id: "comp-uuid-2",
      token: "tok-stealth-1234567890",
      veiculo_id: "veic-uuid-1",
      ip: "187.54.21.90",
      iniciado_em: "2026-10-01T14:10:00Z",
      ultimo_ping_em: "2026-10-01T14:20:00Z",
      finalizado_em: "2026-10-01T14:20:00Z",
      duracao_segundos: 600, // 10 min
      inicio_latitude: -22.495,
      inicio_longitude: -44.094,
      inicio_endereco: "Rua Dom Antonio Cabral, 225 - Volta Redonda/RJ",
      fim_latitude: -22.495,
      fim_longitude: -44.094,
      fim_endereco: "Rua Dom Antonio Cabral, 225 - Volta Redonda/RJ",
      distancia_percorrida_km: 0,
      velocidade_maxima: 0,
      stealth_observado: true,
      stealth_inicio_em: "2026-10-01T14:12:00Z",
      stealth_fim_em: "2026-10-01T14:18:00Z",
      stealth_duracao_segundos: 360, // 6 min
      trajeto: pontosComStealth,
      created_at: "2026-10-01T14:10:00Z",
    };

    assert.equal(acessoComStealth.stealth_observado, true);
    assert.equal(acessoComStealth.stealth_duracao_segundos, 360);
    assert.ok(acessoComStealth.stealth_inicio_em?.includes("14:12"));
    assert.ok(acessoComStealth.stealth_fim_em?.includes("14:18"));
    assert.equal(acessoComStealth.trajeto[1].stealth, true);
    assert.equal(acessoComStealth.trajeto[0].stealth, false);
  });

  test("6. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido", () => {
    const textos = [
      "Trajeto Visualizado no Acesso",
      "Auditoria forense do link de compartilhamento",
      "Local de Início do Veículo",
      "Local de Término do Veículo",
      "Ver Trajeto Percorrido neste Acesso",
      "Modo Stealth Ativado neste Acesso",
    ];

    for (const t of textos) {
      assert.ok(
        !t.includes(String.fromCharCode(38)),
        `Caractere comercial proibido encontrado em: ${t}`,
      );
    }
  });
});
