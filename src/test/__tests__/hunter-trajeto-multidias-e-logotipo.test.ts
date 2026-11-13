import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { carregarLogoEmblemaBase64 } from "@/shared/lib/pdfLogoHelper";
import { consolidarJornadaMultiCiclos } from "@/features/monitor-gps/services/gpsService";
import type { TrajetoViagem, PosicaoHistorico } from "@/features/monitor-gps/types";

describe("Hunter — Trajeto Multi-Dias, Cruzamento de Madrugada e Visibilidade Máxima do Logotipo", () => {
  it("1. AppHeader deve exibir o logotipo ocupando do topo até a base do cabeçalho com altura proeminente", () => {
    const headerPath = path.resolve(process.cwd(), "src/features/layout/components/AppHeader.tsx");
    const content = fs.readFileSync(headerPath, "utf-8");

    assert.ok(
      content.includes("h-[56px] w-[56px] sm:h-[62px] sm:w-[62px]") ||
        content.includes("h-[58px]") ||
        content.includes("h-[62px]"),
      "Logotipo no cabeçalho deve possuir dimensões verticais que preencham de ponta a ponta a barra",
    );
    assert.ok(content.includes("logo-emblema.png"), "Deve carregar o logo-emblema.png oficial");
  });

  it("2. MobileDrawer e Compartilhar devem possuir logotipos ampliados para visibilidade máxima", () => {
    const drawerPath = path.resolve(
      process.cwd(),
      "src/features/layout/components/MobileDrawer.tsx",
    );
    const drawerContent = fs.readFileSync(drawerPath, "utf-8");
    assert.ok(
      drawerContent.includes("h-14 w-14"),
      "MobileDrawer deve exibir o logotipo ampliado com h-14 w-14",
    );

    const sharePath = path.resolve(process.cwd(), "src/routes/compartilhar.$token.tsx");
    const shareContent = fs.readFileSync(sharePath, "utf-8");
    assert.ok(
      shareContent.includes("h-14 w-14"),
      "Cabeçalho de compartilhamento público deve exibir o logotipo ampliado com h-14 w-14",
    );
  });

  it("3. Helper compartilhado pdfLogoHelper deve estar implementado para PDFs e relatórios", () => {
    const helperPath = path.resolve(process.cwd(), "src/shared/lib/pdfLogoHelper.ts");
    assert.ok(fs.existsSync(helperPath), "Arquivo pdfLogoHelper.ts deve existir");
    assert.strictEqual(typeof carregarLogoEmblemaBase64, "function");
  });

  it("4. Relatórios e Laudos em PDF devem incorporar o logotipo oficial no topo do cabeçalho", () => {
    const contratoPath = path.resolve(
      process.cwd(),
      "src/features/clientes/services/contratoPdfService.ts",
    );
    const contratoContent = fs.readFileSync(contratoPath, "utf-8");
    assert.ok(
      contratoContent.includes("carregarLogoEmblemaBase64"),
      "Contrato em PDF deve carregar e exibir o logotipo no cabeçalho",
    );

    const propostaPath = path.resolve(
      process.cwd(),
      "src/features/financeiro/services/propostaPdfService.ts",
    );
    const propostaContent = fs.readFileSync(propostaPath, "utf-8");
    assert.ok(
      propostaContent.includes("carregarLogoEmblemaBase64"),
      "Proposta Comercial em PDF deve carregar e exibir o logotipo no cabeçalho",
    );

    const trajetoPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
    );
    const trajetoContent = fs.readFileSync(trajetoPath, "utf-8");
    assert.ok(
      trajetoContent.includes("carregarLogoEmblemaBase64"),
      "Laudo do Trajeto em PDF deve carregar e exibir o logotipo no cabeçalho",
    );
  });

  it("5. RefazerTrajetoModal deve possuir seletores separados de Dia, Mês e Ano para Partida e Chegada", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(content.includes("anoPartida"), "Deve conter estado anoPartida");
    assert.ok(content.includes("mesPartida"), "Deve conter estado mesPartida");
    assert.ok(content.includes("diaPartida"), "Deve conter estado diaPartida");
    assert.ok(content.includes("viagensPartida"), "Deve conter listagem viagensPartida");

    assert.ok(content.includes("anoFim"), "Deve conter estado anoFim");
    assert.ok(content.includes("mesFim"), "Deve conter estado mesFim");
    assert.ok(content.includes("diaFim"), "Deve conter estado diaFim");
    assert.ok(content.includes("viagensFim"), "Deve conter listagem viagensFim");

    assert.ok(
      content.includes("carregarViagensPeriodo"),
      "Deve invocar carregarViagensPeriodo para buscar percursos completos entre datas distintas",
    );
  });

  it("6. Trajeto Multi-Dias / Madrugada: Consolidar viagem iniciada à noite e finalizada após meia-noite", () => {
    const viagensExemplo: TrajetoViagem[] = [
      {
        id: "v-dia1-noite",
        veiculo_id: "veic-1",
        inicio_at: "2026-10-03T23:00:00.000Z",
        fim_at: "2026-10-03T23:50:00.000Z",
        km_percorrido: 35.5,
        velocidade_media: 60,
        velocidade_maxima: 85,
        status: "concluida",
      },
      {
        id: "v-dia2-madrugada",
        veiculo_id: "veic-1",
        inicio_at: "2026-10-04T00:15:00.000Z",
        fim_at: "2026-10-04T01:30:00.000Z",
        km_percorrido: 42.0,
        velocidade_media: 55,
        velocidade_maxima: 90,
        status: "concluida",
      },
    ];

    const pontosExemplo: PosicaoHistorico[] = [
      {
        id: 1,
        latitude: -22.52,
        longitude: -44.1,
        velocidade: 60,
        ignicao: true,
        odometro: 1000,
        rumo: 90,
        inclinacao_graus: 0,
        vibracao_g: 0.1,
        data_hora_gps: "2026-10-03T23:10:00.000Z",
      },
      {
        id: 2,
        latitude: -22.55,
        longitude: -44.15,
        velocidade: 70,
        ignicao: true,
        odometro: 1040,
        rumo: 90,
        inclinacao_graus: 0,
        vibracao_g: 0.1,
        data_hora_gps: "2026-10-04T00:30:00.000Z",
      },
      {
        id: 3,
        latitude: -22.52001,
        longitude: -44.10002,
        velocidade: 0,
        ignicao: false,
        odometro: 1077.5,
        rumo: 90,
        inclinacao_graus: 0,
        vibracao_g: 0.0,
        data_hora_gps: "2026-10-04T01:30:00.000Z",
      },
    ];

    const jornada = consolidarJornadaMultiCiclos(
      "v-dia1-noite",
      "v-dia2-madrugada",
      viagensExemplo,
      pontosExemplo,
    );

    assert.ok(jornada !== null, "Jornada consolidada multi-dias deve ser calculada");
    assert.strictEqual(
      jornada.kmTotal,
      78,
      "Quilometragem total deve somar os ciclos de ambos os dias",
    );
    assert.strictEqual(
      jornada.velocidadeMaxima,
      90,
      "Velocidade máxima deve ser o pico da jornada",
    );
    assert.strictEqual(
      jornada.paradas.length,
      1,
      "Deve identificar a parada de transição entre os dois dias",
    );
    assert.strictEqual(
      jornada.retornouAoInicio,
      true,
      "Deve detectar retorno ao ponto de partida inicial",
    );
  });
});
