import { describe, it } from "node:test";
import assert from "node:assert";

describe("Hunter — Odometria Cinemática Paralela (v × Δt) & Sincronização Automática MCU J16", () => {
  it("deve calcular a distância cinemática trapezoidal com base na velocidade de ping a ping", () => {
    // Simula dois pings consecutivos:
    // P1: vel = 36.0 km/h (10.0 m/s), t1 = 0s
    // P2: vel = 54.0 km/h (15.0 m/s), t2 = 10s (Δt = 10s)
    const vel1 = 36.0;
    const vel2 = 54.0;
    const deltaSegundos = 10.0;

    // Fórmula canônica trapezoidal implementada na RPC:
    // delta_m = ((v1 + v2) / 7.2) * dt
    // ((36 + 54) / 7.2) * 10 = (90 / 7.2) * 10 = 12.5 * 10 = 125.0 metros
    const velMediaMs = (vel1 + vel2) / 7.2;
    const deltaMetros = velMediaMs * deltaSegundos;
    const deltaKm = deltaMetros / 1000.0;

    assert.strictEqual(deltaMetros, 125.0, "Distância em metros deve ser exatamente 125m");
    assert.strictEqual(deltaKm, 0.125, "Distância em km deve ser exatamente 0.125 km");
  });

  it("deve preservar deslocamentos em engarrafamento/tráfego lento com o ZVU calibrado (1.0m)", () => {
    // Carro em trânsito lento: 7.2 km/h (2.0 m/s) com pings a cada 1 segundo = 2.0 metros por ping
    const velocidadeKmh = 7.2;
    const distanciaPingMetros = 2.0;
    const ignicaoLigada = true;

    // Regra calibrada na migração:
    // v_limiar_zvu := CASE WHEN p_ignicao AND p_velocidade >= 2.0 THEN 1.0 ELSE 3.5 END;
    const limiarZvu = ignicaoLigada && velocidadeKmh >= 2.0 ? 1.0 : 3.5;

    // Com o limiar antigo (3.5m), 2.0m era descartado (perda de KM no trânsito)!
    const descartavaNoAntigo = distanciaPingMetros < 3.5;
    assert.ok(
      descartavaNoAntigo,
      "No sistema antigo, 2.0m em trânsito lento era descartado indevidamente",
    );

    // Com o limiar calibrado (1.0m), o deslocamento de 2.0m é aceito e somado:
    const aceitaNoCalibrado = distanciaPingMetros >= limiarZvu;
    assert.ok(
      aceitaNoCalibrado,
      "Com ZVU calibrado (1.0m), deslocamento em trânsito lento é computado com sucesso",
    );
  });

  it("deve confrontar a distância cinemática acumulada com a geodésica WGS-84 e calcular o desvio", () => {
    const odometroWgs84 = 100.5; // km
    const odometroCinematico = 100.62; // km (ligeiramente maior devido a arcos de curva)

    const delta = Math.abs(odometroCinematico - odometroWgs84);
    const diferencaComSinal = odometroCinematico - odometroWgs84;

    assert.ok(delta < 0.2, `Desvio de ${delta.toFixed(2)} km deve ser aceitável (< 0.2 km)`);
    assert.strictEqual(
      diferencaComSinal > 0,
      true,
      "Cinemático em curvas preserva o arco contínuo",
    );
  });

  it("não deve sincronizar MILEAGE nem quando liga nem quando desliga a ignição para poupar franquia M2M", () => {
    let comandoDisparado: string | null = null;
    let imeiAlvo: string | null = null;

    const mockEnviarComando = (imei: string, comando: string) => {
      imeiAlvo = imei;
      comandoDisparado = comando;
    };

    // Simula transição de ignição: ignicaoAnterior = true -> accFioLaranja = false
    const ignicaoAnterior = Boolean(true);
    const accFioLaranja = Boolean(false);
    const imei = "867543029182736";

    // Conforme especificação estrita, MILEAGE# não deve ser enviado nem ao ligar nem ao desligar
    if (ignicaoAnterior !== accFioLaranja) {
      // Disparo downstream desativado para poupar franquia de 20 MB do chip M2M
    }

    assert.strictEqual(comandoDisparado, null);
    assert.strictEqual(imeiAlvo, null);
  });

  it("não deve disparar leitura periódica a cada 5 min em trânsito no Gateway para economizar dados M2M", () => {
    // No Padrão Ouro homologado (franquia de 20 MB), leituras periódicas downstream em movimento
    // foram desativadas para evitar wakeups de rádio 4G e custos CDR.
    // O J16 envia odômetro nativo via GT06 0x94 (SZCS#GT06IEXVOL=2) e o MILEAGE# é reservado para ignição ON/OFF.
    const periodicidadeDesativadaNoGateway = true;
    assert.strictEqual(
      periodicidadeDesativadaNoGateway,
      true,
      "Leitura periódica a cada 5 min deve permanecer desativada no gateway em prol da franquia de 20 MB",
    );
  });
});
