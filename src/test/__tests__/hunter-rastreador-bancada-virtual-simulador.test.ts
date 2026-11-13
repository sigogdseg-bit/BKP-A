import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { calcularOdometroMedia1456 } from "@/features/monitor-gps/lib/motoresOdometroComparativo";

describe("Hunter — Bancada Virtual e Simulador de Carga de Rastreadores (GT06)", () => {
  const caminhoAbaSimulador = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/AbaSimuladorCargaRastreadores.tsx",
  );
  const caminhoRastreadorView = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/RastreadorJ16View.tsx",
  );

  test("1. AbaSimuladorCargaRastreadores.tsx deve existir e exportar o componente canônico", () => {
    assert.equal(fs.existsSync(caminhoAbaSimulador), true);
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(conteudo, /export function AbaSimuladorCargaRastreadores/);
    assert.match(conteudo, /Bancada Virtual e Simulador de Carga de Rastreadores/);
  });

  test("2. RastreadorJ16View.tsx integra a 3ª aba de simulador no seletor principal", () => {
    const conteudo = fs.readFileSync(caminhoRastreadorView, "utf-8");
    assert.match(conteudo, /import { AbaSimuladorCargaRastreadores }/);
    assert.match(
      conteudo,
      /useState<"remoto" \| "usb" \| "simulador" \| "comparativo">\(\s*"remoto",?\s*\)/,
    );
    assert.match(conteudo, /setAbaPrincipal\("simulador"\)/);
    assert.match(
      conteudo,
      /\{abaPrincipal === "simulador" && <AbaSimuladorCargaRastreadores \/>\}/,
    );
  });

  test("3. Suporte aos 5 cenários de condução com física de trânsito, repouso e misto aleatório", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(conteudo, /"urbano"/);
    assert.match(conteudo, /"rodovia"/);
    assert.match(conteudo, /"repouso"/);
    assert.match(conteudo, /"sinuoso"/);
    assert.match(conteudo, /"misto"/);
    // Cenário sinuoso deve ser dedicado a estressar o 7º medidor
    assert.match(conteudo, /Estresse Odômetro 7/);
    // Cenário misto com alternância aleatória dinâmica
    assert.match(conteudo, /Misto \(Alternância Aleatória de Cenários\)/);
    assert.match(conteudo, /cenarioMistoAtual/);
  });

  test("4. Geração de pacotes GT06 autênticos (0x12 Login e 0x22 GPS) com header 78 78", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(conteudo, /gerarHexLoginGt06/);
    assert.match(conteudo, /gerarHexGpsGt06/);
    assert.match(conteudo, /78 78 0D 12/);
    assert.match(conteudo, /78 78 1F 22/);
  });

  test("5. Aferição do 7º Medidor Consensual de Odômetro na bancada virtual", () => {
    const m1 = 183450.0;
    const m4 = 183450.2;
    const m5 = 183450.4;
    const m6 = 183450.2;
    const m7 = calcularOdometroMedia1456(m1, m4, m5, m6);
    assert.equal(m7, 183450.2);
  });

  test("6. Regra Pétrea 5: Ausência estrita do caractere comercial proibido em textos de interface", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    // Procura por & comercial isolado ou em títulos/textos (permitindo apenas operadores lógicos &&)
    const linhas = conteudo.split("\n");
    linhas.forEach((linha, idx) => {
      if (linha.includes("//") || linha.includes("/*") || linha.includes("*")) return;
      const semLogicos = linha.replace(/&&/g, "").replace(/&quot;/g, "");
      assert.equal(
        semLogicos.includes("&"),
        false,
        `Caractere comercial proibido encontrado na linha ${idx + 1}: ${linha}`,
      );
    });
  });

  test("7. Odômetro de bancada deve iniciar rigorosamente em KM ZERO (0.00 km) para todos os motores", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(conteudo, /const kmInicialVeiculo = 0\.0;/);
    assert.match(conteudo, /const m1 = 0\.0;/);
    assert.match(conteudo, /const m4 = 0\.0;/);
    assert.match(conteudo, /const m5 = 0\.0;/);
    assert.match(conteudo, /const m6 = 0\.0;/);
    assert.match(conteudo, /const m7 = 0\.0;/);
    // Não pode conter multiplicadores de largada artificiais
    assert.equal(conteudo.includes("fatorA"), false);
    assert.equal(conteudo.includes("fatorB"), false);
  });

  test("8. Aceleração do tempo (Time Warp / Sim Speed) deve suportar 1x, 5x, 10x, 30x e 60x sem perda de dados", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(conteudo, /aceleracaoTempo/);
    assert.match(conteudo, /\[1, 5, 10, 30, 60\]/);
    assert.match(conteudo, /ACELERAÇÃO TEMPO/);
    assert.match(conteudo, /formatarTempoSimulado/);
  });

  test("9. Ausência estrita dos medidores 2 e 3 na interface (zero invenção e zero dedução)", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.equal(conteudo.includes("2. MOTOR J16"), false);
    assert.equal(conteudo.includes("3. ESTIMADOR"), false);
    assert.equal(conteudo.includes("odometroEstimado"), false);
  });

  test("10. Preservação de dados ao pausar: a pausa não deve disparar reinicialização da frota nem resetar odômetros", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    // Garante que o hook de inicialização checa se a quantidade mudou e não reinicia simplesmente por !simulacaoRodando
    assert.match(conteudo, /qtdFrotaRef/);
    assert.match(conteudo, /qtdFrotaRef\.current !== quantidadeVeiculos/);
    assert.match(conteudo, /NUNCA reinicializa ao pausar a simulação/);
  });

  test("11. Cenário Misto: Alternância aleatória dinâmica entre rodovia, urbano, sinuoso e repouso", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(
      conteudo,
      /opcoesCenarios:\s*Array<"urbano" \| "rodovia" \| "repouso" \| "sinuoso">\s*=\s*\[\s*"urbano",\s*"rodovia",\s*"sinuoso",\s*"repouso",?\s*\]/,
    );
    assert.match(conteudo, /novosPassosRestantes = Math\.floor\(Math\.random\(\) \* 7\) \+ 4/);
    assert.match(conteudo, /cenarioMistoAtual: novoCenarioMistoAtual/);
    assert.match(conteudo, /cenarioMistoPassosRestantes: novosPassosRestantes/);
  });

  test("12. Intervalo de Envio: Contador com incremento e decremento número por número", () => {
    const conteudo = fs.readFileSync(caminhoAbaSimulador, "utf-8");
    assert.match(conteudo, /frequenciaEnvioSegundos/);
    assert.match(conteudo, /INTERVALO DE ENVIO/);
    // Deve possuir botões de decrementar e incrementar número por número
    assert.match(conteudo, /setFrequenciaEnvioSegundos\(\(prev\) => Math\.max\(1, prev - 1\)\)/);
    assert.match(conteudo, /setFrequenciaEnvioSegundos\(\(prev\) => Math\.min\(120, prev \+ 1\)\)/);
    assert.match(conteudo, /<Minus/);
    assert.match(conteudo, /<Plus/);
    assert.match(conteudo, /type="number"/);
  });
});
