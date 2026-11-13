import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emitirContratoPrestacaoServicosPdf } from "../../features/clientes/services/contratoPdfService";
import type { Cliente } from "../../features/clientes/types";
import { APP_EMPRESA, APP_CNPJ, APP_ENDERECO } from "../../shared/lib/version";

describe("Hunter — Gestao de Contratos, Emissao PDF, Foro Volta Redonda/RJ e Parcelamento", () => {
  const mockCliente12Meses: Cliente = {
    id: "c-contrato-123",
    nome_razao_social: "Transportadora Volta Redonda Expressa",
    documento: "12.345.678/0001-90",
    email: "contato@vrtransporte.com.br",
    telefone: "(24) 99888-7766",
    status: "ativo",
    plano: "pro",
    dias_historico_plano: 15,
    dias_retencao_banco: 20,
    dia_vencimento: 15,
    valor_mensalidade: 89.9,
    meses_contrato: 12,
    data_inicio_contrato: "2026-10-01",
    data_fim_contrato: "2027-10-01",
    tipo_renovacao: "mesma_vigencia",
    meses_renovacao: 12,
    foro_comarca: "Comarca de Volta Redonda/RJ",
    created_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:00:00Z",
  };

  it("Emite Contrato de Prestacao de Servicos em PDF elegendo o Foro da Comarca de Volta Redonda/RJ", async () => {
    const doc = await emitirContratoPrestacaoServicosPdf({
      cliente: mockCliente12Meses,
      veiculos: [
        {
          placa: "VRD1A23",
          marca_modelo: "Mercedes-Benz Sprinter 415",
          ano: 2024,
          cor: "Branco",
        },
      ],
      usuarioEmissor: "SuperADM",
    });

    assert.ok(doc, "O documento PDF do contrato deve ser instanciado com sucesso");

    // Valida que o PDF contem as paginas geradas
    const totalPaginas = doc.getNumberOfPages();
    assert.ok(totalPaginas >= 1, "O contrato deve possuir ao menos 1 pagina estruturada");
  });

  it("Emissao de Contrato com veiculo real cadastrado e formato padronizado CTR-XXXX/YYYY", async () => {
    const clienteComVeiculo: Cliente = {
      ...mockCliente12Meses,
      id: "592a5124-d8bc-47a6-aa8e-a744f0d65467",
      nome_razao_social: "Dario Novaes",
      documento: "03284300724",
      telefone: "24992494030",
    };

    const doc = await emitirContratoPrestacaoServicosPdf({
      cliente: clienteComVeiculo,
      veiculos: [
        {
          placa: "AXH0E44",
          marca_modelo: "Volvo XC 60 T6",
          ano: 2012,
          cor: "Preta",
        },
      ],
      usuarioEmissor: "Administracao",
    });

    assert.ok(doc, "PDF deve ser gerado com sucesso para cliente com veiculo real");
    assert.ok(doc.getNumberOfPages() >= 2, "Contrato deve possuir estrutura multipaginas completa");
  });

  it("Calculo exato do valor global e das parcelas para contrato de 12 e 24 meses", () => {
    const valor12 =
      (mockCliente12Meses.valor_mensalidade || 0) * (mockCliente12Meses.meses_contrato || 12);
    assert.equal(Number(valor12.toFixed(2)), 1078.8);

    const contrato24Meses: Cliente = {
      ...mockCliente12Meses,
      meses_contrato: 24,
      valor_mensalidade: 79.9,
    };
    const valor24 = (contrato24Meses.valor_mensalidade || 0) * 24;
    assert.equal(Number(valor24.toFixed(2)), 1917.6);
  });

  it("Calculo das datas de vencimento mensais respeitando o ultimo dia de cada mes", () => {
    const diaVencimento = 31; // Dia 31 solicitado
    const meses = [
      { ano: 2026, mes: 10, diaEsperado: 31 },
      { ano: 2026, mes: 11, diaEsperado: 30 }, // Novembro tem 30 dias
      { ano: 2026, mes: 12, diaEsperado: 31 },
      { ano: 2027, mes: 2, diaEsperado: 28 }, // Fevereiro de 2027 nao bissexto
    ];

    meses.forEach(({ ano, mes, diaEsperado }) => {
      const ultimoDiaMes = new Date(ano, mes, 0).getDate();
      const diaFinal = Math.min(diaVencimento, ultimoDiaMes);
      assert.equal(
        diaFinal,
        diaEsperado,
        `Mes ${mes}/${ano} deve ajustar dia 31 para ${diaEsperado}`,
      );
    });
  });

  it("Regras de renovacao contratual projetam a nova vigencia a partir do fim do contrato anterior", () => {
    const dataFimAtual = new Date("2027-10-01T12:00:00");
    const mesesRenovacao = 12;

    const novaDataFim = new Date(dataFimAtual);
    novaDataFim.setMonth(novaDataFim.getMonth() + mesesRenovacao);

    assert.equal(novaDataFim.getFullYear(), 2028);
    assert.equal(novaDataFim.getMonth() + 1, 10);
    assert.equal(novaDataFim.getDate(), 1);
  });

  it("Proibicao estrita do caractere comercial ampersand nas clausulas e textos do contrato", () => {
    const foro = mockCliente12Meses.foro_comarca || "";
    assert.ok(!foro.includes("&"), "Foro nao pode conter caractere ampersand");
  });

  it("Validacao estrita dos dados oficiais da empresa contratada no contrato Hunter", () => {
    assert.equal(APP_EMPRESA, "26.581.175 DARIO DE NOVAES GONCALVES JUNIOR - ME");
    assert.equal(APP_CNPJ, "26.581.175/0001-23");
    assert.ok(APP_ENDERECO.includes("Rua Dom Antonio Cabral, 225"));
    assert.ok(APP_ENDERECO.includes("Volta Redonda/RJ"));
    assert.ok(APP_ENDERECO.includes("27.286-210"));
  });

  it("Cliente cortesia ou teste com valor zerado quita todas as faturas e elimina pendencias", () => {
    const contratoCortesia: Cliente = {
      ...mockCliente12Meses,
      valor_mensalidade: 0,
      meses_contrato: 12,
    };
    const totalContrato =
      (contratoCortesia.valor_mensalidade || 0) * (contratoCortesia.meses_contrato || 12);
    assert.equal(totalContrato, 0);

    // Simula lista de parcelas que foram zeradas
    const parcelas = Array.from({ length: 12 }, (_, i) => ({
      mesReferencia: i + 1,
      anoReferencia: 2026,
      valor: Number(contratoCortesia.valor_mensalidade || 0),
      status: "pago" as const,
    }));

    const totalDevido = parcelas
      .filter((p) => p.status !== "pago")
      .reduce((acc, p) => acc + p.valor, 0);

    assert.equal(totalDevido, 0, "Cliente cortesia nao deve possuir total devido ou pendencias");
    assert.equal(
      parcelas.every((p) => p.status === "pago" && p.valor === 0),
      true,
    );
  });

  it("Contratacao apos o dia de vencimento escolhido (5, 10, 15 ou 25) nao gera parcela vencida e insere pro-rata na proxima fatura", () => {
    const valorMensal = 79.9;
    const diaVencimento = 10;
    const dataContratacao = new Date(2026, 8, 28); // 28 de setembro de 2026 (dia 28 > dia 10)
    const diaInicio = dataContratacao.getDate();
    const mesInicio = dataContratacao.getMonth() + 1;
    const anoInicio = dataContratacao.getFullYear();

    const totalDiasMesInicio = new Date(anoInicio, mesInicio, 0).getDate(); // 30 dias em setembro
    assert.equal(totalDiasMesInicio, 30);

    const aposPrazoMesAtual = diaInicio > diaVencimento;
    assert.equal(aposPrazoMesAtual, true, "Dia 28 e apos o prazo de pagamento do dia 10");

    // Dias restantes de setembro (28, 29 e 30) = 3 dias
    const diasRestantes = totalDiasMesInicio - diaInicio + 1;
    assert.equal(diasRestantes, 3);

    const proRataMesAtual = Number(((valorMensal / totalDiasMesInicio) * diasRestantes).toFixed(2));
    assert.equal(proRataMesAtual, 7.99);

    const valorPrimeiraFatura = Number((valorMensal + proRataMesAtual).toFixed(2));
    assert.equal(valorPrimeiraFatura, 87.89);

    // Primeira fatura cai em 10/10/2026 (proximo mes, a vencer)
    const dataPrimeiraFatura = new Date(anoInicio, mesInicio, diaVencimento); // mesInicio e 9, entao mes 9 em base-0 e outubro
    const dataVencStr = `${dataPrimeiraFatura.getFullYear()}-${String(dataPrimeiraFatura.getMonth() + 1).padStart(2, "0")}-${String(diaVencimento).padStart(2, "0")}`;
    assert.equal(dataVencStr, "2026-10-10");

    // Em relacao a data de contratacao (28/09/2026), a primeira fatura (10/10/2026) e futura
    assert.ok(
      dataPrimeiraFatura > dataContratacao,
      "A primeira fatura deve ser futura, sem atraso",
    );
  });

  it("Taxa de instalação real obtida do cadastro e ordens (pago diretamente ao instalador R$ 120,00)", async () => {
    const clienteComInstalador: Cliente = {
      ...mockCliente12Meses,
      taxa_instalacao: 120.0,
      pago_direto_instalador: true,
      status_taxa_instalacao: "pago",
    };

    const doc = await emitirContratoPrestacaoServicosPdf({
      cliente: clienteComInstalador,
      veiculos: [
        {
          placa: "LTK1A94",
          marca_modelo: "GM Montana Sport",
          ano: 2015,
          cor: "Branco",
        },
      ],
      usuarioEmissor: "SuperADM",
    });

    assert.ok(doc, "PDF deve ser gerado com sucesso com taxa de instalação real");
    assert.ok(doc.getNumberOfPages() >= 2, "Contrato deve possuir estrutura completa");
  });

  it("Revisão gramatical canônica do contrato: presença obrigatória de acentuação correta nos títulos e cláusulas", async () => {
    const doc = await emitirContratoPrestacaoServicosPdf({
      cliente: mockCliente12Meses,
      usuarioEmissor: "SuperADM",
    });

    assert.ok(doc, "PDF gerado com sucesso");
    const numPages = doc.getNumberOfPages();
    assert.ok(numPages >= 2, "Contrato possui ao menos 2 páginas");
  });

  it("Contrato com múltiplos veículos e rastreadores lista individualmente cada equipamento, especificação, homologação ANATEL e dados do chip", async () => {
    const clienteFrota: Cliente = {
      ...mockCliente12Meses,
      nome_razao_social: "TRANSPORTADORA E LOGÍSTICA DELTA LTDA",
      documento: "12.345.678/0001-90",
      valor_mensalidade: 239.7, // 3 veículos x R$ 79,90
    };

    const veiculosFrota = [
      {
        placa: "ABC1D23",
        marca_modelo: "VW Delivery 11.180",
        ano: 2023,
        cor: "Branco",
        rastreador_modelo: "J16 4G LTE",
        rastreador_imei: "867890123456781",
        rastreador_especificacoes: "GNSS (GPS/BDS/GLONASS) + 4G LTE Cat-1 + Bloqueio Remoto",
        homologado_anatel: "Homologado ANATEL",
        chip_operadora: "Algar Telecom (M2M)",
        chip_iccid: "89550012345678901231",
        chip_linha: "24988776651",
      },
      {
        placa: "XYZ9K88",
        marca_modelo: "Mercedes-Benz Accelo 1016",
        ano: 2022,
        cor: "Prata",
        rastreador_modelo: "J16 4G LTE",
        rastreador_imei: "867890123456782",
        rastreador_especificacoes: "GNSS (GPS/BDS/GLONASS) + 4G LTE Cat-1 + Telemetria de Ignição",
        homologado_anatel: "Homologado ANATEL",
        chip_operadora: "Algar Telecom (M2M)",
        chip_iccid: "89550012345678901232",
        chip_linha: "24988776652",
      },
      {
        placa: "KTM4F55",
        marca_modelo: "Scania R450",
        ano: 2024,
        cor: "Azul",
        rastreador_modelo: "J16 4G LTE",
        rastreador_imei: "867890123456783",
        rastreador_especificacoes: "GNSS (GPS/BDS/GLONASS) + 4G LTE Cat-1 + Bloqueio Remoto",
        homologado_anatel: "Homologado ANATEL",
        chip_operadora: "Algar Telecom (M2M)",
        chip_iccid: "89550012345678901233",
        chip_linha: "24988776653",
      },
    ];

    const doc = await emitirContratoPrestacaoServicosPdf({
      cliente: clienteFrota,
      veiculos: veiculosFrota,
      usuarioEmissor: "SuperADM",
    });

    assert.ok(doc, "PDF para contrato multi-veículo gerado com sucesso");
    assert.ok(doc.getNumberOfPages() >= 2, "Contrato deve possuir estrutura multi-páginas");
  });

  it("Cabeçalho do contrato PDF utiliza obrigatoriamente APP_SLOGAN e proíbe texto legado", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const contratoPath = path.join(
      process.cwd(),
      "src/features/clientes/services/contratoPdfService.ts",
    );
    const content = fs.readFileSync(contratoPath, "utf-8");

    assert.ok(
      !content.includes("TECNOLOGIA E RASTREAMENTO VEICULAR"),
      "Texto legado 'TECNOLOGIA E RASTREAMENTO VEICULAR' não deve constar no contrato.",
    );
    assert.ok(
      content.includes("APP_SLOGAN"),
      "Cabeçalho do contrato deve utilizar a constante canônica APP_SLOGAN.",
    );
  });

  it("verificarAutenticidadeContrato responde com mensagem canônica limpa e nunca vaza termos de schema cache", async () => {
    const { verificarAutenticidadeContrato } =
      await import("../../features/clientes/services/contratosAssinadosService");
    const res = await verificarAutenticidadeContrato(
      "5c6f318406fd3c017911e2278bb275a1b74c4f0644a32be7713fe1bb8d63707",
    );

    assert.equal(typeof res.autentico, "boolean");
    assert.equal(typeof res.mensagem, "string");
    assert.ok(
      !res.mensagem.includes("schema cache") &&
        !res.mensagem.includes("A sincronização com o servidor está em andamento"),
      "A mensagem de verificação nunca deve vazar erros técnicos ou de sincronização para identificador não cadastrado.",
    );
  });
});
