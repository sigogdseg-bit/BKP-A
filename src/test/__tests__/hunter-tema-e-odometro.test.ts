import { describe, it } from "node:test";
import assert from "node:assert";

// Cálculo de distância geodésica Haversine para simular o gateway e o odômetro incremental
function calcularDeslocamentoMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function processarOdometroIncremental(
  odometroAnteriorKm: number,
  latAnterior: number,
  lonAnterior: number,
  latNova: number,
  lonNova: number,
  velocidadeKmH: number,
  ignicao: boolean,
): { novoOdometroKm: number; deltaKm: number } {
  // Motor físico WGS-84 com máquina anti-drift (sem fatores arbitrários)
  if (latAnterior !== 0 && lonAnterior !== 0 && (velocidadeKmH > 2.5 || ignicao)) {
    const distMetros = calcularDeslocamentoMetros(latAnterior, lonAnterior, latNova, lonNova);
    // Anti-drift: ignora micro-deslocamento quando parado com velocidade <= 2.5
    if (distMetros < 15.0 && velocidadeKmH <= 2.5) {
      return { novoOdometroKm: odometroAnteriorKm, deltaKm: 0 };
    }
    if (distMetros >= 1.5 && distMetros < 15000) {
      const deltaKm = Number((distMetros / 1000).toFixed(4));
      const novoOdometroKm = Number((odometroAnteriorKm + deltaKm).toFixed(3));
      return { novoOdometroKm, deltaKm };
    }
  }
  return { novoOdometroKm: odometroAnteriorKm, deltaKm: 0 };
}

describe("Hunter — Odômetro Incremental e Deslocamento em Tempo Real", () => {
  it("deve incrementar o odômetro proporcionalmente à distância física percorrida pelo veículo", () => {
    const odometroInicial = 50200.0;
    // Ponto 1: Volta Redonda Centro (-22.5235, -44.1042)
    // Ponto 2: ~1.1 km de distância (-22.5150, -44.1100)
    const { novoOdometroKm, deltaKm } = processarOdometroIncremental(
      odometroInicial,
      -22.5235,
      -44.1042,
      -22.515,
      -44.11,
      45, // 45 km/h
      true, // ligado
    );

    assert.ok(deltaKm > 0.9 && deltaKm < 1.3, `Delta km esperado, obteve ${deltaKm}`);
    assert.strictEqual(novoOdometroKm, Number((odometroInicial + deltaKm).toFixed(3)));
    assert.ok(novoOdometroKm > odometroInicial, "Odômetro deve sempre avançar ao andar");
  });

  it("deve descartar GPS drift de antena quando o veículo estiver parado em semáforo ou desligado", () => {
    const odometroInicial = 50000.0;
    // Ponto parado com micro-oscilação de 8 metros de GPS drift
    const { novoOdometroKm, deltaKm } = processarOdometroIncremental(
      odometroInicial,
      -22.5,
      -44.1,
      -22.50007, // ~8 metros
      -44.1,
      0, // parado
      true, // ignição ligada no sinal
    );

    assert.strictEqual(deltaKm, 0, "Drift < 15m com velocidade 0 não deve somar ao odômetro");
    assert.strictEqual(novoOdometroKm, odometroInicial, "Odômetro deve permanecer inalterado");
  });

  it("deve permitir sincronizar e calibrar a virada de KM do painel físico eliminando offsets decimais", () => {
    // Cenário Real: Veículo cadastrado com valor inteiro 50230 km, quando no carro físico já estava em 50230,40 km.
    // Ao rodar 600m no asfalto, o painel do carro virou para 50231 km enquanto no sistema marcava ,94 km por causa do offset inicial.
    const odometroNoSistema = 50230.94;
    const kmViradoNoPainel = Math.ceil(odometroNoSistema); // 50231 km
    assert.strictEqual(
      kmViradoNoPainel,
      50231,
      "Deve sugerir exatamente o próximo inteiro cravado da virada",
    );

    // Sincronização direta aplicada pelo operador
    const odometroSincronizado = kmViradoNoPainel;
    assert.strictEqual(
      odometroSincronizado,
      50231.0,
      "Odômetro sincronizado deve zerar o offset inicial de cadastro",
    );
  });

  it("deve ignorar micro-oscilações de GPS quando o carro está parado (filtro anti-jitter)", () => {
    const odometroInicial = 34500.0;
    // Variação de apenas 2 metros (ruído natural de antena com carro estacionado)
    const { novoOdometroKm, deltaKm } = processarOdometroIncremental(
      odometroInicial,
      -22.5235,
      -44.1042,
      -22.52351, // ~1 metro de diferença
      -44.10421,
      0, // parado
      false, // desligado
    );

    assert.strictEqual(deltaKm, 0, "Ruído menor que 5 metros deve ser descartado");
    assert.strictEqual(novoOdometroKm, odometroInicial, "Odômetro não deve mudar parado");
  });

  it("deve descartar saltos anômalos de telemetria maiores que 15 km num único pacote", () => {
    const odometroInicial = 10000.0;
    // Salto absurdo de centenas de quilômetros (erro de antena/multipath)
    const { novoOdometroKm, deltaKm } = processarOdometroIncremental(
      odometroInicial,
      -22.5235,
      -44.1042,
      -20.0, // centenas de km de distância
      -40.0,
      60,
      true,
    );

    assert.strictEqual(
      deltaKm,
      0,
      "Salto anômalo > 15 km deve ser descartado para proteger o odômetro",
    );
    assert.strictEqual(novoOdometroKm, odometroInicial);
  });
});

describe("Hunter — Resiliência do Sistema de Tema Claro e Escuro", () => {
  it("deve resolver tema efetivo corretamente a partir das preferências", () => {
    const resolverTema = (temaEscolhido: string, prefersDarkSystem: boolean) => {
      if (temaEscolhido === "system") {
        return prefersDarkSystem ? "dark" : "light";
      }
      return temaEscolhido === "dark" ? "dark" : "light";
    };

    assert.strictEqual(resolverTema("light", true), "light", "Tema 'light' deve forçar light");
    assert.strictEqual(resolverTema("dark", false), "dark", "Tema 'dark' deve forçar dark");
    assert.strictEqual(resolverTema("system", true), "dark", "Sistema dark deve resultar em dark");
    assert.strictEqual(
      resolverTema("system", false),
      "light",
      "Sistema light deve resultar em light",
    );
  });
});
