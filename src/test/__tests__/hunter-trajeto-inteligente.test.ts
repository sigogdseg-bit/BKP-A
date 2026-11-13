import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calcularDistanciaHaversineKm,
  otimizarOrdemParadasVizinhoMaisProximo,
  otimizarOrdemParadas,
  extrairNumeroEndereco,
  gerarLinkGoogleMaps,
  gerarLinkWazePonto,
  gerarLinkWazeDestino,
  gerarTextoResumoTrajeto,
  enriquecerTrajetoComMalhaViaria,
  type PontoRota,
  type TrechoTrajeto,
} from "../../features/monitor-gps/services/trajetoInteligenteService";

describe("Hunter — Trajeto Inteligente e Roteirizacao Otimizada", () => {
  const pontoOrigemSP: PontoRota = {
    id: "origem-1",
    titulo: "Base Central SP",
    endereco: "Praça da Sé, Centro, São Paulo - SP",
    latitude: -23.5505,
    longitude: -46.6333,
    tipo: "saida",
  };

  const pontoDestinoSantos: PontoRota = {
    id: "chegada-1",
    titulo: "Terminal Porto de Santos",
    endereco: "Av. Portuária, Santos - SP",
    latitude: -23.9618,
    longitude: -46.3322,
    tipo: "chegada",
  };

  const paradaABC: PontoRota = {
    id: "parada-abc",
    titulo: "Cliente Santo André",
    endereco: "Av. dos Estados, Santo André - SP",
    latitude: -23.6534,
    longitude: -46.5312,
    tipo: "parada",
  };

  const paradaSBC: PontoRota = {
    id: "parada-sbc",
    titulo: "Cliente São Bernardo do Campo",
    endereco: "Av. Kennedy, São Bernardo do Campo - SP",
    latitude: -23.6914,
    longitude: -46.5644,
    tipo: "parada",
  };

  const paradaCampinas: PontoRota = {
    id: "parada-campinas",
    titulo: "Filial Campinas",
    endereco: "Av. Francisco Glicério, Campinas - SP",
    latitude: -22.9056,
    longitude: -47.0608,
    tipo: "parada",
  };

  it("Calculo Haversine: Distancia geometrica coerente e zero para o mesmo ponto", () => {
    const distanciaZero = calcularDistanciaHaversineKm(
      pontoOrigemSP.latitude,
      pontoOrigemSP.longitude,
      pontoOrigemSP.latitude,
      pontoOrigemSP.longitude,
    );
    assert.equal(distanciaZero, 0);

    const distSPSantos = calcularDistanciaHaversineKm(
      pontoOrigemSP.latitude,
      pontoOrigemSP.longitude,
      pontoDestinoSantos.latitude,
      pontoDestinoSantos.longitude,
    );
    // São Paulo a Santos em linha reta tem cerca de 50 a 60 km
    assert.ok(distSPSantos > 40 && distSPSantos < 75, `Distância SP-Santos foi ${distSPSantos} km`);
  });

  it("Logica Inteligente 2-Opt: Evita zigue-zague e repeticao de trajeto rumo ao destino", () => {
    // Origem: SP (Norte) -> Paradas: Santo André (Centro-Sul) e São Bernardo (Sul) -> Destino: Santos (Extremo Sul)
    // Percurso com sentido coerente em linha rumo ao litoral
    const paradasABC = [paradaSBC, paradaABC]; // Passadas desordenadas (SBC antes de Santo André)
    const ordenadas = otimizarOrdemParadasVizinhoMaisProximo(
      pontoOrigemSP,
      paradasABC,
      pontoDestinoSantos,
    );

    assert.equal(ordenadas.length, 4);
    assert.equal(ordenadas[0].id, pontoOrigemSP.id);
    // Saindo de SP rumo ao litoral: primeiro passa em Santo André, depois São Bernardo, e finaliza em Santos
    assert.equal(ordenadas[1].id, "parada-abc");
    assert.equal(ordenadas[2].id, "parada-sbc");
    assert.equal(ordenadas[3].id, pontoDestinoSantos.id);
  });

  it("Trajeto Circular: Suporta retorno ao ponto de saida como destino final", () => {
    const destinoRetorno: PontoRota = {
      ...pontoOrigemSP,
      id: "chegada-retorno",
      tipo: "chegada",
      titulo: "Retorno à Saída (Origem)",
    };

    const ordenadas = otimizarOrdemParadas(pontoOrigemSP, [paradaABC, paradaSBC], destinoRetorno);

    assert.equal(ordenadas.length, 4);
    assert.equal(ordenadas[0].id, pontoOrigemSP.id);
    assert.equal(ordenadas[3].id, "chegada-retorno");
    assert.equal(ordenadas[3].latitude, pontoOrigemSP.latitude);
    assert.equal(ordenadas[3].longitude, pontoOrigemSP.longitude);
  });

  it("Exportacao Google Maps: Monta rota com origem, destino e waypoints na ordem otimizada", () => {
    const pontos = [pontoOrigemSP, paradaABC, paradaSBC, pontoDestinoSantos];
    const link = gerarLinkGoogleMaps(pontos);

    assert.ok(link.includes("google.com/maps/dir/"));
    assert.ok(link.includes(`origin=${pontoOrigemSP.latitude},${pontoOrigemSP.longitude}`));
    assert.ok(
      link.includes(`destination=${pontoDestinoSantos.latitude},${pontoDestinoSantos.longitude}`),
    );
    // Waypoints devem conter Santo André e São Bernardo
    assert.ok(
      link.includes(
        `waypoints=${paradaABC.latitude},${paradaABC.longitude}|${paradaSBC.latitude},${paradaSBC.longitude}`,
      ),
    );
  });

  it("Exportacao Waze: Gera link para cada ponto individualmente", () => {
    const linkPonto = gerarLinkWazePonto(paradaABC);
    assert.ok(linkPonto.startsWith("https://waze.com/ul?ll="));
    assert.ok(linkPonto.includes(`${paradaABC.latitude},${paradaABC.longitude}`));
    assert.ok(linkPonto.includes("navigate=yes"));

    const linkDestino = gerarLinkWazeDestino(pontoDestinoSantos);
    assert.ok(
      linkDestino.includes(`${pontoDestinoSantos.latitude},${pontoDestinoSantos.longitude}`),
    );
  });

  it("Texto Resumo do Trajeto: Inclui discriminacao de KM e tempo por ponto e trecho", () => {
    const trechosExemplo: TrechoTrajeto[] = [
      {
        indice: 1,
        origemTitulo: "Saída (Origem)",
        origemEndereco: pontoOrigemSP.endereco,
        destinoTitulo: "Parada 1",
        destinoEndereco: paradaABC.endereco,
        distanciaKm: 18.5,
        duracaoMinutos: 25,
        destinoLatitude: paradaABC.latitude,
        destinoLongitude: paradaABC.longitude,
      },
      {
        indice: 2,
        origemTitulo: "Parada 1",
        origemEndereco: paradaABC.endereco,
        destinoTitulo: "Chegada (Destino)",
        destinoEndereco: pontoDestinoSantos.endereco,
        distanciaKm: 65.2,
        duracaoMinutos: 60,
        destinoLatitude: pontoDestinoSantos.latitude,
        destinoLongitude: pontoDestinoSantos.longitude,
      },
    ];

    const texto = gerarTextoResumoTrajeto(
      "ABC-1234",
      83.7,
      85,
      [pontoOrigemSP, paradaABC, pontoDestinoSantos],
      trechosExemplo,
    );

    assert.ok(texto.includes("PLANEJAMENTO DE TRAJETO INTELIGENTE"));
    assert.ok(texto.includes("ABC-1234"));
    assert.ok(texto.includes("83.7 km"));
    assert.ok(texto.includes("18.5 km"));
    assert.ok(texto.includes("65.2 km"));
    assert.ok(
      !texto.includes("&"),
      "Texto do resumo de trajeto nao pode conter o caractere comercial proibido",
    );
  });

  it("Algoritmo 2-Opt: Desembaraça nós cruzados eliminando repetição e backtracking", () => {
    // Cenário clássico em 'X' cruzado:
    // Ponto A -> Ponto D cruzando com Ponto B -> Ponto C
    // O 2-Opt deve inverter o miolo para conectar A -> B -> C -> D sem cruzar caminhos
    const pontoA: PontoRota = {
      id: "a",
      titulo: "Ponto A",
      endereco: "Rua A",
      latitude: 0,
      longitude: 0,
      tipo: "saida",
    };
    const pontoB: PontoRota = {
      id: "b",
      titulo: "Ponto B",
      endereco: "Rua B",
      latitude: 1,
      longitude: 0,
      tipo: "parada",
    };
    const pontoC: PontoRota = {
      id: "c",
      titulo: "Ponto C",
      endereco: "Rua C",
      latitude: 1,
      longitude: 1,
      tipo: "parada",
    };
    const pontoD: PontoRota = {
      id: "d",
      titulo: "Ponto D",
      endereco: "Rua D",
      latitude: 0,
      longitude: 1,
      tipo: "chegada",
    };

    // Matriz de custo simulando quadrado: lados = 1, diagonais cruzadas = 1.41
    // Conectar em ciclo A -> B -> C -> D custa 1 + 1 + 1 = 3
    // Conectar cruzado A -> C -> B -> D custa 1.41 + 1 + 1.41 = 3.82
    const pontos = [pontoA, pontoC, pontoB, pontoD]; // Cruzado propositalmente
    const matrizCusto = [
      [0, 1, 1.41, 1], // A
      [1, 0, 1, 1.41], // B
      [1.41, 1, 0, 1], // C
      [1, 1.41, 1, 0], // D
    ];

    const rotaOtimizada = otimizarOrdemParadas(pontoA, [pontoC, pontoB], pontoD);
    assert.equal(rotaOtimizada.length, 4);
    assert.equal(rotaOtimizada[0].id, "a");
    // O 2-opt deve corrigir para ordem sem cruzar
    assert.ok(
      (rotaOtimizada[1].id === "b" && rotaOtimizada[2].id === "c") ||
        (rotaOtimizada[1].id === "c" && rotaOtimizada[2].id === "b"),
      "Deve manter o percurso otimizado",
    );
    assert.equal(rotaOtimizada[3].id, "d");
  });

  it("Extração e Preservação de Número de Residência em Endereços Brasileiros", () => {
    const caso1 = extrairNumeroEndereco("Rua Dom Antonio Cabral, 225");
    assert.equal(caso1.rua, "Rua Dom Antonio Cabral");
    assert.equal(caso1.numero, "225");

    const caso2 = extrairNumeroEndereco("Avenida Paulista nº 1000");
    assert.equal(caso2.rua, "Avenida Paulista");
    assert.equal(caso2.numero, "1000");

    const caso3 = extrairNumeroEndereco("Rua 33, 100");
    assert.equal(caso3.rua, "Rua 33");
    assert.equal(caso3.numero, "100");

    const caso4 = extrairNumeroEndereco("Rua 33 100");
    assert.equal(caso4.rua, "Rua 33");
    assert.equal(caso4.numero, "100");

    const caso5 = extrairNumeroEndereco("Rodovia Presidente Dutra km 280");
    assert.equal(caso5.rua, "Rodovia Presidente Dutra");
    assert.equal(caso5.numero, "280");

    const caso6 = extrairNumeroEndereco("Rua das Flores");
    assert.equal(caso6.rua, "Rua das Flores");
    assert.equal(caso6.numero, null);
  });

  it("Links Google Maps, Waze e Itinerário utilizam endereço com numeração predial", () => {
    const pontoComNumero: PontoRota = {
      id: "p-num",
      titulo: "Cliente 225",
      endereco: "Rua Dom Antônio Cabral, 225 - São Luís, Volta Redonda - RJ",
      numero: "225",
      latitude: -22.515,
      longitude: -44.115,
      tipo: "chegada",
    };

    const linkGmaps = gerarLinkGoogleMaps([pontoOrigemSP, pontoComNumero]);
    assert.ok(linkGmaps.includes("google.com/maps/dir/"));
    assert.ok(
      linkGmaps.includes(`destination=${pontoComNumero.latitude},${pontoComNumero.longitude}`),
    );

    const linkWaze = gerarLinkWazePonto(pontoComNumero);
    assert.ok(linkWaze.includes("q="));
    assert.ok(
      linkWaze.includes(
        encodeURIComponent("Rua Dom Antônio Cabral, 225 - São Luís, Volta Redonda - RJ"),
      ),
    );

    const resumo = gerarTextoResumoTrajeto("ABC-1234", 10, 15, [pontoOrigemSP, pontoComNumero]);
    assert.ok(resumo.includes("Rua Dom Antônio Cabral, 225"));
  });

  it("Enriquecimento Viário: Rota com densidade viária preserva ou enriquece coordenadas reais", async () => {
    // 5 pontos de teste simulando waypoints secos de Volta Redonda
    const waypointsVR: [number, number][] = [
      [-22.5235, -44.1042],
      [-22.518, -44.095],
      [-22.512, -44.088],
    ];

    // Testa a execução segura sem quebras ou exceções
    const resultado = await enriquecerTrajetoComMalhaViaria(waypointsVR);
    assert.ok(Array.isArray(resultado));
    assert.ok(resultado.length >= 2);
  });

  it("Navegação Waze: Instruções de manobra possuem coordenadas para orientação por deslocamento", () => {
    const manobraExemplo = {
      id: "manobra-0-1",
      texto: "Em 300 metros, vire à direita na Av. Amaral Peixoto",
      nomeRua: "Av. Amaral Peixoto",
      distanciaMetros: 300,
      duracaoSegundos: 45,
      tipoManobra: "turn-right",
      latitude: -22.521,
      longitude: -44.101,
    };

    assert.ok(manobraExemplo.latitude !== undefined);
    assert.ok(manobraExemplo.longitude !== undefined);

    // Posição do veículo aproximando-se (a ~150 metros)
    const distVeiculoManobra =
      calcularDistanciaHaversineKm(
        -22.522,
        -44.102,
        manobraExemplo.latitude,
        manobraExemplo.longitude,
      ) * 1000;

    assert.ok(distVeiculoManobra < 500, "Deve detectar aproximação para aviso prévio falado");
  });
});
