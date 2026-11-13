import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TETO_FRANQUIA_M2M_MB } from "@/features/seguranca/lib/comparativoPadroesConstantes";
import {
  executarVarreduraUniversalJ16,
  calcularMetricasFisicasJ16,
} from "@/features/seguranca/lib/autoOtimizadorJ16Engine";
import {
  gerarScriptComandosDispositivoJ16,
  formatarComandosParaCopia,
} from "@/features/seguranca/lib/comandosDispositivoHelper";

describe("Hunter — Comparativo de Padrões de Rastreamento J16 (Teste A/B e Franquia 20MB)", () => {
  const caminhoConstantes = path.resolve(
    process.cwd(),
    "src/features/seguranca/lib/comparativoPadroesConstantes.ts",
  );
  const caminhoAbaComparativo = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/AbaComparativoPadroesRastreador.tsx",
  );
  const caminhoRastreadorView = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/RastreadorJ16View.tsx",
  );
  const caminhoEngine = path.resolve(
    process.cwd(),
    "src/features/seguranca/lib/autoOtimizadorJ16Engine.ts",
  );
  const caminhoHelperComandos = path.resolve(
    process.cwd(),
    "src/features/seguranca/lib/comandosDispositivoHelper.ts",
  );
  const caminhoModalComandos = path.resolve(
    process.cwd(),
    "src/features/seguranca/components/ModalScriptComandosDispositivo.tsx",
  );

  test("1. AbaComparativoPadroesRastreador.tsx deve existir e exportar o componente canônico", () => {
    assert.equal(fs.existsSync(caminhoAbaComparativo), true);
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /export function AbaComparativoPadroesRastreador/);
    assert.match(conteudo, /Comparativo de Padrões de Rastreamento \(Teste A\/B\)/);
  });

  test("2. RastreadorJ16View.tsx integra a 4ª aba comparativa no seletor e na renderização", () => {
    const conteudo = fs.readFileSync(caminhoRastreadorView, "utf-8");
    assert.match(conteudo, /import {[\s\S]*?AbaComparativoPadroesRastreador[\s\S]*?} from/);
    assert.match(conteudo, /"remoto" \| "usb" \| "simulador" \| "comparativo"/);
    assert.match(conteudo, /setAbaPrincipal\("comparativo"\)/);
    assert.match(conteudo, /Comparativo de Padrões A\/B/);
    assert.match(
      conteudo,
      /\{abaPrincipal === "comparativo" && \(\s*<AbaComparativoPadroesRastreador|<AbaComparativoPadroesRastreador \/>/,
    );
  });

  test("3. Teto inegociável da franquia M2M deve ser estritamente 20.0 MB / mês", () => {
    assert.equal(TETO_FRANQUIA_M2M_MB, 20.0);
    const conteudoConstantes = fs.readFileSync(caminhoConstantes, "utf-8");
    const conteudoAba = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudoConstantes, /TETO_FRANQUIA_M2M_MB = 20\.0/);
    assert.match(conteudoAba, /TETO_FRANQUIA_M2M_MB/);
    assert.match(conteudoAba, /TETO 20 MB\/MÊS/);
  });

  test("4. Deve apresentar gráficos comparativos visuais de consumo M2M e qualidade viária", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /GRÁFICO DE CONSUMO M2M \(TETO 20 MB\/MÊS\)/);
    assert.match(conteudo, /GRÁFICO DE QUALIDADE DOS DADOS \(FIDELIDADE VIÁRIA\)/);
    assert.match(conteudo, /Linha Vermelha = Franquia Máxima \(20\.0 MB\)/);
  });

  test("5. Matriz de Diagnóstico com Problemas, Vantagens e Veredito Oficial", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /PROBLEMAS E RISCOS DETECTADOS/);
    assert.match(conteudo, /VANTAGENS E PONTOS POSITIVOS/);
    assert.match(conteudo, /VEREDITO DO TESTE COMPARATIVO/);
    assert.match(conteudo, /campeaoEconomia/);
    assert.match(conteudo, /campeaoQualidade/);
    assert.match(conteudo, /vereditoEquilibrio/);
  });

  test("6. Suporte aos 2 padrões simultâneos (A Oficial vs B Candidato) com presets e edição", () => {
    const conteudoConstantes = fs.readFileSync(caminhoConstantes, "utf-8");
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /PADRÃO A:/);
    assert.match(conteudo, /PADRÃO B:/);
    assert.match(conteudo, /PRESETS_COMPARATIVOS/);
    assert.match(conteudoConstantes, /Super Econômico/);
    assert.match(conteudoConstantes, /Ângulo 10°/);
    assert.match(conteudoConstantes, /Sem Curvas/);
  });

  test("7. Bancada Dinâmica de Teste Simultâneo com 2 veículos virtuais e física contínua", () => {
    const conteudoConstantes = fs.readFileSync(caminhoConstantes, "utf-8");
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /VEÍCULO 1 · PADRÃO A/);
    assert.match(conteudo, /VEÍCULO 2 · PADRÃO B/);
    assert.match(conteudo, /aceleracaoTempo/);
    assert.match(conteudo, /FastForward/);
    assert.match(conteudoConstantes, /TETO_SEGURO_ENGENHARIA_MB = 16\.0/);
    assert.match(conteudoConstantes, /CONSUMO_BASAL_FIXO_OPERADORA_MB = 2\.8/);
    assert.match(conteudo, /TETO_SEGURO_ENGENHARIA_MB/);
    assert.match(conteudo, /CONSUMO_BASAL_FIXO_OPERADORA_MB/);
  });

  test("8. Regra Pétrea 5: Ausência estrita do caractere comercial proibido em textos de interface", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
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

  test("9. Bloqueio estrito de homologação e rejeição sumária quando houver riscos/vícios técnicos", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /problemasB\.length > 0/);
    assert.match(conteudo, /PADRÃO A \(RECOMENDADO · B REJEITADO POR VÍCIO\)/);
    assert.match(conteudo, /Bloqueado \(Padrão B com Vícios Detectados\)/);
  });

  test("10. Gráficos de Barras Verticais para cada parâmetro posicionados acima de Padrão A e B", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /Comparativo Visual de Parâmetros \(Padrão Oficial vs Simulado\)/);
    assert.match(conteudo, /graficosVerticaisParametros/);
    assert.match(conteudo, /Timer Movimento/);
    assert.match(conteudo, /Ângulo de Curva/);
    assert.match(conteudo, /Janela de Filtro/);
    assert.match(conteudo, /Modo Garagem/);
    assert.match(conteudo, /Pings Falsos \/ Dia/);
  });

  test("11. Opção de Motocicleta na Simulação com física de corredor e risco elétrico", () => {
    const conteudoConstantes = fs.readFileSync(caminhoConstantes, "utf-8");
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudoConstantes, /tipoVeiculo: "carro" \| "moto"/);
    assert.match(conteudo, /Modo Moto ativo/);
    assert.match(conteudo, /Física de Moto Ativa/);
    assert.match(conteudo, /JITTER SEVERO EM MOTO/);
    assert.match(conteudo, /Bateria de moto \(5Ah a 9Ah\)/);
  });

  test("12. Presets com rótulos descritivos e botão Restaurar Padrão Oficial no A", () => {
    const conteudoConstantes = fs.readFileSync(caminhoConstantes, "utf-8");
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudoConstantes, /rotuloCurto/);
    assert.match(conteudo, /Restaurar Padrão no A/);
    assert.match(conteudoConstantes, /Sem Sleep Garagem/);
    assert.match(conteudoConstantes, /Sem Ângulo Curva/);
    // Assegura que nenhum botão de preset usa truncamento cego .split(" ")[0]
    assert.equal(conteudo.includes('p.nome.split(" ")[0]'), false);
  });

  test("13. Slider de Ângulo suporta resolução fina de 1° (grau a grau, ex: 12°, 13°, 14°)", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    // Sliders de ângulo do Padrão A e B devem ter step="1"
    assert.match(conteudo, /step="1"/);
    // Suporte a transição suave na faixa fina 11°-12°
    assert.match(conteudo, /p\.anguloGrau <= 12/);
  });

  test("14. Auto-Otimizador de Parâmetros com perfil de horas/dia configurável (padrão 8h/dia)", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /Auto-Otimizador de Parâmetros/);
    assert.match(conteudo, /autoOtimizadorHorasDia, setAutoOtimizadorHorasDia\] = useState\(8\)/);
    assert.match(conteudo, /BRUTE-FORCE[\s\S]*?\{autoOtimizadorHorasDia\}H\/DIA/);
    assert.match(conteudo, /\[2, 4, 6, 8, 10, 12, 16\]/);
    assert.match(conteudo, /executarAutoOtimizador/);
    assert.match(conteudo, /Aberrações Descartadas/);
    assert.match(conteudo, /Aprovadas e Analisadas/);
    assert.match(conteudo, /Top \{autoOtimizadorResultados\.length\} Melhores Combinações/);
  });

  test("15. Varredura Universal de Todos os 10 Parâmetros com Descarte de Aberrações Conhecidas", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    const conteudoEngine = fs.readFileSync(caminhoEngine, "utf-8");

    // Todos os 10 parâmetros presentes no resultado canônico
    assert.match(conteudoEngine, /timerMovimento: number/);
    assert.match(conteudoEngine, /timerParado: number/);
    assert.match(conteudoEngine, /anguloHabilitado: boolean/);
    assert.match(conteudoEngine, /anguloGrau: number/);
    assert.match(conteudoEngine, /anguloIntervalo: number/);
    assert.match(conteudoEngine, /hbtLigado: number/);
    assert.match(conteudoEngine, /hbtDesligado: number/);
    assert.match(conteudoEngine, /modoEconomiaParada: boolean/);
    assert.match(conteudoEngine, /sensibilidadeGSensor: number/);
    assert.match(conteudoEngine, /pacoteEstendidoIexvol: boolean/);

    // Descarte de aberrações conhecidas presente no componente e motor
    assert.match(conteudo, /semModoGaragem/);
    assert.match(conteudo, /sensorInstavel/);
    assert.match(conteudo, /semInflexao/);
    assert.match(conteudo, /temJitterReta/);
    assert.match(conteudo, /perdeCurvasCriticas/);
    assert.match(conteudo, /filtroIncoerente/);
    assert.match(conteudo, /filtroCurto/);
    assert.match(conteudo, /ehAberracaoConhecida/);

    // Sweet Spot imparcial 15° a 18° imune a ruídos de pista no componente e motor
    assert.match(conteudo, /Sweet Spot/);
  });

  test("16. Execução Factual do Motor de Varredura: Comprovação Matemática Real (Perfil 8h/dia)", () => {
    // Executa a varredura universal real de 87.941.700 combinações passo a passo
    const resultado = executarVarreduraUniversalJ16(8, "carro", "urbano");

    // 1. Espaço amostral total e segregação factual
    assert.equal(resultado.totalTestadas, 87941700);
    assert.equal(resultado.totalDescartadas, 87440208);
    assert.equal(resultado.totalAprovadas, 501492);
    assert.equal(resultado.totalDescartadas + resultado.totalAprovadas, resultado.totalTestadas);

    // 2. Contadores reais cascateados de descarte por aberração física comprovada no teste
    const d = resultado.contadoresDescarte;
    assert.equal(d.semModoGaragem, 43970850); // SENDS=0 (falta de economia na garagem)
    assert.equal(d.semMcu, 21985425); // 0x22 sem odômetro MCU
    assert.equal(d.sensorInstavel, 8794170); // G-Sensor LEVEL 1 ou 2
    assert.equal(d.timerParadoInadequado, 4796820); // Timer garagem < 1800s
    assert.equal(d.hbtParadoInadequado, 1865430); // Heartbeat garagem < 240s
    assert.equal(d.hbtMovInadequado, 2176335); // Heartbeat em movimento < 90s ou > 240s
    assert.equal(d.semInflexao, 18522); // Inflexão de curva desativada
    assert.equal(d.temJitterReta, 770868); // Disparos espúrios na reta comprovados pelo teste cinemático
    assert.equal(d.perdeCurvasCriticas, 1203930); // Ângulo > 20° que perde esquinas e alças
    assert.equal(d.filtroIncoerente, 240786); // Janela do filtro >= timer de movimento
    assert.equal(d.filtroCurto, 481572); // Filtro de curva < 5s (pings duplicados)
    assert.equal(d.timerInadequado, 1135134); // Timer de movimento < 12s ou > 22s
    assert.equal(d.violouMargemSeguranca, 366); // Combinações descartadas por exceder a margem de 16 MB

    // 3. Campeão de Máxima Qualidade Refinado Automaticamente (Score 100/100 dentro de 16 MB)
    const c = resultado.campeao;
    assert.equal(c.timerMovimento, 10);
    assert.equal(c.anguloGrau, 18);
    assert.equal(c.anguloIntervalo, 8);
    assert.equal(c.hbtLigado, 240);
    assert.equal(c.hbtDesligado, 600);
    assert.equal(c.timerParado, 3600);
    assert.equal(c.modoEconomiaParada, true);
    assert.equal(c.sensibilidadeGSensor, 3);
    assert.equal(c.pacoteEstendidoIexvol, true);
    assert.equal(c.mbTotaisMes, 15.07);
    assert.equal(c.percentualFranquia, 75.4);
    assert.equal(c.scoreQualidadeTotal, 100);
    assert.equal(c.pingsEspuriosRetaDia, 0);

    // 4. Padrão Oficial do Sistema (Padrão Voxter Homologado)
    const o = resultado.padraoOficial;
    assert.equal(o.timerMovimento, 30);
    assert.equal(o.anguloGrau, 20);
    assert.equal(o.anguloIntervalo, 10);
    assert.equal(o.hbtLigado, 300);
    assert.equal(o.hbtDesligado, 300);
    assert.equal(o.timerParado, 3600);
    assert.equal(o.modoEconomiaParada, true);
    assert.equal(o.mbTotaisMes, 9.62);
    assert.equal(o.percentualFranquia, 48.1);
    assert.equal(o.scoreQualidadeTotal, 76);
    assert.equal(o.pingsEspuriosRetaDia, 0);

    // 5. Comparativo Factual: Campeão e Padrão Oficial possuem alta qualidade e zero ruído em reta
    assert.equal(c.scoreQualidadeTotal >= 95, true);
    assert.equal(o.scoreQualidadeTotal >= 70, true);
    assert.equal(o.pingsEspuriosRetaDia, 0);
    assert.equal(c.mbTotaisMes <= 16.0, true); // Permanece com folga segura dentro da margem de 16 MB
    assert.equal(o.mbTotaisMes <= 16.0, true);
  });

  test("17. Validação de Dinâmica em Motocicletas: Ruído de Pista e Jitter em Ângulos Baixos", () => {
    const paramsJitter = {
      nome: "Jitter Moto",
      timerMovimento: 15,
      timerParado: 1800,
      anguloHabilitado: true,
      anguloGrau: 10,
      anguloIntervalo: 10,
      hbtLigado: 120,
      hbtDesligado: 240,
      modoEconomiaParada: true,
      sensibilidadeGSensor: 3,
      pacoteEstendidoIexvol: true,
    };

    // Cenário 8h/dia: comprovação de ruído viário elevado e sobreconsumo de dados em moto
    const calcCarro8h = calcularMetricasFisicasJ16(paramsJitter, {
      horasMovimentoPorDia: 8,
      diasPorMes: 30,
      cenarioTrajeto: "urbano",
      tipoVeiculo: "carro",
    });
    const calcMoto8h = calcularMetricasFisicasJ16(paramsJitter, {
      horasMovimentoPorDia: 8,
      diasPorMes: 30,
      cenarioTrajeto: "urbano",
      tipoVeiculo: "moto",
    });

    assert.equal(calcCarro8h.pingsEspuriosRetaDia, 221);
    assert.equal(calcMoto8h.pingsEspuriosRetaDia, 441); // Ruído de pista e corredor viário comprovado no teste empírico
    assert.equal(calcMoto8h.mbTotaisMes, 15.28);
    assert.equal(calcCarro8h.mbTotaisMes, 14.62);
    assert.equal(calcMoto8h.mbTotaisMes > calcCarro8h.mbTotaisMes, true);

    // Cenário 2h/dia: comprovação da degradação de fidelidade/qualidade por ruído
    const calcCarro2h = calcularMetricasFisicasJ16(paramsJitter, {
      horasMovimentoPorDia: 2,
      diasPorMes: 30,
      cenarioTrajeto: "urbano",
      tipoVeiculo: "carro",
    });
    const calcMoto2h = calcularMetricasFisicasJ16(paramsJitter, {
      horasMovimentoPorDia: 2,
      diasPorMes: 30,
      cenarioTrajeto: "urbano",
      tipoVeiculo: "moto",
    });

    assert.equal(calcCarro2h.pingsEspuriosRetaDia, 55);
    assert.equal(calcMoto2h.pingsEspuriosRetaDia, 110);
    assert.equal(calcCarro2h.scoreQualidadeTotal, 81);
    assert.equal(calcMoto2h.scoreQualidadeTotal, 70); // Queda na qualidade devido ao ruído comprovado
    assert.equal(calcMoto2h.scoreQualidadeTotal < calcCarro2h.scoreQualidadeTotal, true);
  });

  test("21. gerarScriptComandosDispositivoJ16 gera comandos canônicos sanitizados para hardware J16", () => {
    const params = {
      timerMovimento: 15,
      timerParado: 180,
      anguloGrau: 20,
      anguloIntervalo: 12,
      hbtLigado: 60,
      hbtDesligado: 300,
      modoEconomiaParada: true,
      sensibilidadeGSensor: 4,
      pacoteEstendidoIexvol: true,
    };

    const script = gerarScriptComandosDispositivoJ16(params, "Padrão Teste");
    assert.equal(script.length, 8);

    // 1. TIMER
    assert.equal(script[0].comando, "TIMER,15,180#");
    // 2. HBT
    assert.equal(script[1].comando, "HBT,60,300#");
    // 3. ANGLE SEND
    assert.equal(script[2].comando, "SZCS#ANGLE,SEND=1");
    // 4. ANGLEVALUE (com amostragem mínima de 10s e grau formatado com 3 dígitos)
    assert.equal(script[3].comando, "SZCS#ANGLEVALUE=12-020");
    // 5. SENDS
    assert.equal(script[4].comando, "SENDS,1#");
    // 6. LEVEL
    assert.equal(script[5].comando, "LEVEL,4#");
    // 7. IEXVOL
    assert.equal(script[6].comando, "SZCS#GT06IEXVOL=2");
    // 8. RESET
    assert.equal(script[7].comando, "RESET#");

    // Verificar sanitização estrita de comandos SZCS# (nunca devem conter '#' final)
    for (const item of script) {
      if (item.comando.startsWith("SZCS#")) {
        assert.equal(
          item.comando.endsWith("#"),
          false,
          `Comando SZCS não pode terminar com #: ${item.comando}`,
        );
      }
    }
  });

  test("22. formatarComandosParaCopia formata em linhas e formato SMS concatenado", () => {
    const params = {
      timerMovimento: 10,
      timerParado: 120,
      anguloGrau: 15,
      anguloIntervalo: 10,
      hbtLigado: 60,
      hbtDesligado: 180,
      modoEconomiaParada: false,
      sensibilidadeGSensor: 2,
      pacoteEstendidoIexvol: false,
    };

    const textoLinhas = formatarComandosParaCopia(params, "linhas");
    assert.match(textoLinhas, /^TIMER,10,120#\nHBT,60,180#/);
    assert.match(textoLinhas, /SZCS#ANGLEVALUE=10-015/);
    assert.match(textoLinhas, /SENDS,0#/);
    assert.match(textoLinhas, /SZCS#GT06IEXVOL=0/);
    assert.match(textoLinhas, /RESET#$/);

    const textoSms = formatarComandosParaCopia(params, "sms");
    assert.match(textoSms, /TIMER,10,120#;HBT,60,180#/);
    assert.match(textoSms, /;RESET#$/);
  });

  test("23. AbaComparativoPadroesRastreador.tsx possui ações para usar nos parâmetros e copiar comandos", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    assert.match(conteudo, /onAplicarParametrosCanonicos/);
    assert.match(conteudo, /Usar nos Parâmetros Canônicos/);
    assert.match(conteudo, /Copiar Comandos/);
    assert.match(conteudo, /ModalScriptComandosDispositivo/);
  });

  test("24. RastreadorJ16View.tsx conecta a aplicação de parâmetros canônicos e cópia de comandos", () => {
    const conteudo = fs.readFileSync(caminhoRastreadorView, "utf-8");
    assert.match(conteudo, /handleAplicarParametrosDoComparativo/);
    assert.match(conteudo, /origemParametrosComparativo/);
    assert.match(conteudo, /onAplicarParametrosCanonicos=\{handleAplicarParametrosDoComparativo\}/);
    assert.match(conteudo, /handleCopiarComandosBatchAtivos/);
    assert.match(conteudo, /Copiar Comandos/);
  });

  test("25. ModalScriptComandosDispositivo.tsx utiliza ModalPortal e dimensionamento sem corte de viewport", () => {
    assert.equal(fs.existsSync(caminhoModalComandos), true);
    const conteudo = fs.readFileSync(caminhoModalComandos, "utf-8");
    assert.match(conteudo, /ModalPortal/);
    assert.match(conteudo, /max-h-\[90vh\]/);
    assert.match(conteudo, /overflow-y-auto/);
    assert.match(conteudo, /Copiar Todos os Comandos/);
    assert.match(conteudo, /Copiar SMS/);
  });

  test("26. Conformidade com regras pétreas: ausência do caractere comercial proibido em módulos de comandos", () => {
    const conteudoModal = fs.readFileSync(caminhoModalComandos, "utf-8");
    const conteudoHelper = fs.readFileSync(caminhoHelperComandos, "utf-8");

    // Proibir & isolado em strings/textos de UI
    assert.doesNotMatch(
      conteudoModal,
      /(['"`][^'"`]*\s&\s[^'"`]*['"`])/,
      "Proibido o uso do caractere comercial isolado em strings de UI do Modal",
    );
    assert.doesNotMatch(
      conteudoHelper,
      /(['"`][^'"`]*\s&\s[^'"`]*['"`])/,
      "Proibido o uso do caractere comercial isolado em strings de UI do Helper",
    );
  });

  test("27. Esteira Canônica de 5 Passos e Selo de Estabilização Estatística Invariante com o Tempo", () => {
    const conteudo = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    // Stepper e sequência canônica
    assert.match(conteudo, /Esteira de Homologação de Padrões J16 \(5 Passos Sequenciais\)/);
    assert.match(conteudo, /Passo 1[\s\S]*?Auto-Otimizador Fino/);
    assert.match(conteudo, /Passo 2[\s\S]*?Alocação A vs B/);
    assert.match(conteudo, /Passo 3[\s\S]*?Bancada em Pista/);
    assert.match(conteudo, /Passo 4[\s\S]*?Gráficos Estabilizados/);
    assert.match(conteudo, /Passo 5[\s\S]*?Modo Canônico/);

    // Selo de Estabilização Estatística
    assert.match(conteudo, /TESTE ESTABILIZADO/);
    assert.match(conteudo, /Convergência estatística atingida/);
    assert.match(conteudo, /Invariante no Tempo/);
  });

  test("28. executarRefinamentoFinoJ16 executa refinamento fino automático com teste empírico de ruído", () => {
    const engineModule = fs.readFileSync(caminhoEngine, "utf-8");
    assert.match(engineModule, /export function executarRefinamentoFinoJ16/);
    assert.match(engineModule, /r\.pingsEspuriosRetaDia > 0/);
  });

  test("29. Paridade Canônica Total entre Card Campeão e Linha 1 do Top 10, e Passos Canônicos sem Anomalias", () => {
    const conteudoAba = fs.readFileSync(caminhoAbaComparativo, "utf-8");
    const engineModule = fs.readFileSync(caminhoEngine, "utf-8");

    // Ambos devem encabeçar o Top 10 com o campeão refinado
    assert.match(
      conteudoAba,
      /top10ComRefinado\.push\(campeaoRefinado\)/,
      "AbaComparativoPadroesRastreador deve encabeçar o Top 10 com o campeão refinado",
    );
    assert.match(
      engineModule,
      /top10ComRefinado\.push\(campeaoRefinado\)/,
      "Engine deve encabeçar o Top 10 com o campeão refinado",
    );

    // Ausência absoluta de anomalias quebradas geradas por delta bruto
    assert.doesNotMatch(
      conteudoAba,
      /delta = -5; delta <= 5/,
      "Proibido loop com delta bruto que gera 595s ou 3595s",
    );
  });

  test("30. Isolamento Total de Veículos Reais, Padrão A Oficial do Sistema, Padrão B com Campeão Refinado e Teste Simultâneo nos 2 Veículos", () => {
    const conteudoAba = fs.readFileSync(caminhoAbaComparativo, "utf-8");

    // 1. Proibido o uso de placas ou clientes reais na tela comparativa
    assert.doesNotMatch(
      conteudoAba,
      /LTK1A94|AXH0E44|DispositivoRealAuditoria|carregarAuditoriaChipsReais/,
      "Proibido o uso ou menção a placas ou clientes reais no Comparativo",
    );

    // 2. No A: Padrão Atual do Sistema homologado (configOficial)
    assert.match(
      conteudoAba,
      /setPadraoA\(configOficial\)/,
      "Padrão A deve ser rigorosamente cravado no Padrão Atual do Sistema",
    );

    // 3. No B: Salvar o resultado campeão refinado
    assert.match(
      conteudoAba,
      /setPadraoB\(\(prev\) => \([\s\S]*?Padrão Candidato Refinado[\s\S]*?campeaoRefinado\.timerMovimento/,
      "Padrão B deve salvar o resultado campeão refinado do auto-otimizador",
    );

    // 4. Rodar os testes nos 2: Disparo automático da bancada de pista nos dois veículos simultaneamente
    assert.match(
      conteudoAba,
      /setIniciarDueloAutomatico\(true\)/,
      "Auto-otimizador deve acionar o disparo automático do teste de bancada",
    );
    assert.match(
      conteudoAba,
      /handleReiniciarSimulacaoAoVivo\(\)[\s\S]*?setSimulacaoAoVivo\(true\)/,
      "Bancada deve ser reiniciada e colocada em execução ao vivo para testar os dois veículos",
    );
  });
});
