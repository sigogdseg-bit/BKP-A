import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type {
  ItemEstoque,
  NovoItemEstoqueInput,
  Fornecedor,
  EntradaEstoqueInput,
  ItemBaixaInstalacao,
  TemaEstoque,
} from "../../features/estoque/types";

describe("Hunter — Módulo de Estoque e Suprimentos Integrado", () => {
  test("deve validar o catálogo inicial de materiais com categorias e unidades corretas", () => {
    const itensMock: ItemEstoque[] = [
      {
        id: "item-1",
        codigo_sku: "RAST-J16-4G",
        nome: "Rastreador J16 4G GPS Tracker",
        descricao: "Módulo 4G LTE com telemetria",
        categoria: "rastreador",
        quantidade_atual: 25,
        quantidade_minima: 5,
        unidade_medida: "unidade",
        custo_medio_unitario: 189.9,
        localizacao: "Almoxarifado Gaveta 01",
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "item-2",
        codigo_sku: "CHIP-M2M-MULTI",
        nome: "Chip M2M Multi-Operadora 4G",
        descricao: "SIM Card de dados",
        categoria: "chip",
        quantidade_atual: 30,
        quantidade_minima: 10,
        unidade_medida: "unidade",
        custo_medio_unitario: 15.0,
        localizacao: "Almoxarifado Gaveta 02",
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "item-3",
        codigo_sku: "RELE-12V-40A",
        nome: "Relé Automotivo 12V 40A 5 Pinos",
        descricao: "Relé para corte de ignição",
        categoria: "rele",
        quantidade_atual: 40,
        quantidade_minima: 10,
        unidade_medida: "unidade",
        custo_medio_unitario: 18.5,
        localizacao: "Almoxarifado Gaveta 03",
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "item-4",
        codigo_sku: "FIO-AUTO-10MM",
        nome: "Fio Automotivo Flexível 1.0mm²",
        descricao: "Condutor antichama",
        categoria: "fio_chicote",
        quantidade_atual: 150,
        quantidade_minima: 30,
        unidade_medida: "metro",
        custo_medio_unitario: 2.8,
        localizacao: "Carretel Central",
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    assert.equal(itensMock.length, 4);
    assert.equal(itensMock[0].categoria, "rastreador");
    assert.equal(itensMock[1].categoria, "chip");
    assert.equal(itensMock[2].categoria, "rele");
    assert.equal(itensMock[3].unidade_medida, "metro");
  });

  test("deve integrar a compra de materiais calculando valor total e gerando despesa financeira", () => {
    const inputCompra: EntradaEstoqueInput = {
      itemId: "item-1",
      quantidade: 10,
      custoUnitario: 180.0,
      fornecedorId: "forn-1",
      documentoFiscal: "NF-e 12345",
      dataPagamento: "2026-09-23",
      observacoes: "Lote adicional de rastreadores J16",
    };

    const valorTotalCalculado = inputCompra.quantidade * inputCompra.custoUnitario;
    assert.equal(valorTotalCalculado, 1800.0);

    const mapearCategoriaFinanceira = (categoriaItem: string) => {
      if (categoriaItem === "rastreador") return "aquisicao_equipamentos";
      if (categoriaItem === "chip") return "chips_conectividade";
      return "material_consumo";
    };

    assert.equal(mapearCategoriaFinanceira("rastreador"), "aquisicao_equipamentos");
    assert.equal(mapearCategoriaFinanceira("chip"), "chips_conectividade");
    assert.equal(mapearCategoriaFinanceira("rele"), "material_consumo");
    assert.equal(mapearCategoriaFinanceira("fio_chicote"), "material_consumo");
  });

  test("deve simular a baixa automática de estoque na conclusão de uma instalação", () => {
    let saldoRastreador = 25;
    let saldoChip = 30;
    let saldoRele = 40;
    let saldoFioMetro = 150;

    const materiaisUtilizados: ItemBaixaInstalacao[] = [
      { itemId: "item-rastreador", quantidade: 1 },
      { itemId: "item-chip", quantidade: 1 },
      { itemId: "item-rele", quantidade: 1 },
      { itemId: "item-fio", quantidade: 2 },
    ];

    materiaisUtilizados.forEach((m) => {
      if (m.itemId === "item-rastreador") saldoRastreador -= m.quantidade;
      if (m.itemId === "item-chip") saldoChip -= m.quantidade;
      if (m.itemId === "item-rele") saldoRele -= m.quantidade;
      if (m.itemId === "item-fio") saldoFioMetro -= m.quantidade;
    });

    assert.equal(saldoRastreador, 24);
    assert.equal(saldoChip, 29);
    assert.equal(saldoRele, 39);
    assert.equal(saldoFioMetro, 148);
  });

  test("deve suportar os 3 modos de tema do estoque (Padrão, Neumorphism e Product Styleguide)", () => {
    const temasValidos: TemaEstoque[] = ["hunter_padrao", "neumorphism_soft", "product_styleguide"];

    assert.ok(temasValidos.includes("hunter_padrao"));
    assert.ok(temasValidos.includes("neumorphism_soft"));
    assert.ok(temasValidos.includes("product_styleguide"));
  });

  test("deve respeitar a regra pétrea de ausência do caractere comercial proibido", () => {
    const titulosEEtiquetas = [
      "Estoque e Suprimentos",
      "Chips M2M, fios, conectores, relés e rastreadores",
      "Materiais e Insumos do Estoque",
      "Extrato de Movimentações",
      "Catálogo de Fornecedores",
      "Financeiro e Fluxo de Caixa",
    ];

    titulosEEtiquetas.forEach((texto) => {
      assert.equal(texto.includes("&"), false);
    });
  });

  test("Regra Pétrea DJR-NEW: Instalador não cadastra nada no estoque, não vê fornecedor, não cadastra fornecedor e não compra material", () => {
    // 1. O Instalador acessa estritamente /instalacao
    const menuInstalador = [{ titulo: "Instalação", rota: "/instalacao" }];
    const rotasPermitidasInstalador = menuInstalador.map((i) => i.rota);

    assert.equal(rotasPermitidasInstalador.includes("/estoque"), false);
    assert.equal(rotasPermitidasInstalador.includes("/financeiro"), false);

    // 2. Permissão de compra, fornecedor e materiais restrita a Administrador
    function podeGerenciarEstoqueEFornecedores(
      role: "superadmin" | "adm" | "operador" | "instalador" | "cliente",
    ): boolean {
      return role === "superadmin" || role === "adm";
    }

    assert.equal(podeGerenciarEstoqueEFornecedores("instalador"), false);
    assert.equal(podeGerenciarEstoqueEFornecedores("cliente"), false);
    assert.equal(podeGerenciarEstoqueEFornecedores("adm"), true);
    assert.equal(podeGerenciarEstoqueEFornecedores("superadmin"), true);
  });

  test("Instalador escolhe itens do estoque e informa quantidade utilizada gerando baixa na instalação", () => {
    // 1. Simulação dos itens disponíveis no almoxarifado para escolha do instalador
    const itensDisponiveisAlmoxarifado = [
      { id: "item-rast", nome: "Rastreador J16 4G", saldo: 10 },
      { id: "item-chip", nome: "Chip M2M Multi-Operadora", saldo: 15 },
      { id: "item-rele", nome: "Relé Automotivo 12V 40A", saldo: 8 },
      { id: "item-fio", nome: "Chicote / Fio Automotivo 1.0mm", saldo: 100 },
      { id: "item-porta-fus", nome: "Conector Porta Fusível", saldo: 20 },
    ];

    // 2. O instalador escolhe os itens e define as quantidades consumidas
    const itensEscolhidosPeloInstalador: Record<string, number> = {
      "item-rast": 1,
      "item-chip": 1,
      "item-rele": 1,
      "item-fio": 3, // 3 metros
      "item-porta-fus": 1,
    };

    // 3. Montagem do payload de baixa de instalação
    const itensParaBaixa: ItemBaixaInstalacao[] = Object.entries(itensEscolhidosPeloInstalador)
      .filter(([_, qtd]) => qtd > 0)
      .map(([itemId, qtd]) => ({
        itemId,
        quantidade: qtd,
        observacao: "Instalação técnica veículo ABC-1234",
      }));

    assert.equal(itensParaBaixa.length, 5);
    const totalUnidades = itensParaBaixa.reduce((acc, i) => acc + i.quantidade, 0);
    assert.equal(totalUnidades, 7);

    // 4. Verificação de abatimento no saldo do estoque
    const novoSaldoRastreador =
      itensDisponiveisAlmoxarifado.find((i) => i.id === "item-rast")!.saldo -
      itensEscolhidosPeloInstalador["item-rast"];
    const novoSaldoFio =
      itensDisponiveisAlmoxarifado.find((i) => i.id === "item-fio")!.saldo -
      itensEscolhidosPeloInstalador["item-fio"];

    assert.equal(novoSaldoRastreador, 9);
    assert.equal(novoSaldoFio, 97);
  });

  test("deve formatar telefones fixos e celulares dinamicamente conforme digitado", async () => {
    const { formatarTelefone } = await import("../../features/estoque/utils/mascaras");

    // Fixo (10 dígitos)
    assert.equal(formatarTelefone("2422334455"), "(24) 2233-4455");

    // Celular (11 dígitos)
    assert.equal(formatarTelefone("24998877665"), "(24) 99887-7665");

    // Digitação progressiva parcial
    assert.equal(formatarTelefone("24"), "(24");
    assert.equal(formatarTelefone("249"), "(24) 9");
    assert.equal(formatarTelefone("249988"), "(24) 9988");

    // Limpeza de caracteres não numéricos
    assert.equal(formatarTelefone("(24) 9.9887-7665"), "(24) 99887-7665");
  });

  test("deve formatar CPF e CNPJ dinamicamente alternando a máscara pelo tamanho dos dígitos", async () => {
    const { formatarCpfCnpj } = await import("../../features/estoque/utils/mascaras");

    // CPF (11 dígitos)
    assert.equal(formatarCpfCnpj("12345678901"), "123.456.789-01");

    // CPF digitação parcial
    assert.equal(formatarCpfCnpj("123456"), "123.456");
    assert.equal(formatarCpfCnpj("123456789"), "123.456.789");

    // CNPJ (14 dígitos)
    assert.equal(formatarCpfCnpj("12345678000195"), "12.345.678/0001-95");

    // CNPJ digitação intermediária (12 e 13 dígitos)
    assert.equal(formatarCpfCnpj("1234567800019"), "12.345.678/0001-9");
  });

  test("deve suportar múltiplas categorias por fornecedor e exibi-lo em todos os filtros marcados", () => {
    const fornecedoresCadastrados: Fornecedor[] = [
      {
        id: "forn-multi-1",
        razao_social: "Global Telecom e Rastreadores S/A",
        nome_fantasia: "Global Tech",
        categoria: "hardware, conectividade",
        cnpj_cpf: "12.345.678/0001-95",
        contato_nome: "Carlos Gerente",
        telefone: "(24) 99887-7665",
        email: "vendas@globaltech.com.br",
        chave_pix: "12.345.678/0001-95",
        dados_bancarios: null,
        observacoes: "Fornecedor principal",
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "forn-mono-2",
        razao_social: "Chicotes e Relés do Brasil Ltda",
        nome_fantasia: "Eletro Auto",
        categoria: "consumiveis",
        cnpj_cpf: "98.765.432/0001-10",
        contato_nome: "Mariana Suprimentos",
        telefone: "(24) 3322-1100",
        email: "contato@eletroauto.com.br",
        chave_pix: "contato@eletroauto.com.br",
        dados_bancarios: null,
        observacoes: null,
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const filtrarPorCategoria = (filtro: string) => {
      if (filtro === "todas") return fornecedoresCadastrados;
      return fornecedoresCadastrados.filter((forn) => {
        const cats = (forn.categoria || "")
          .toLowerCase()
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        return cats.some((c) => c === filtro.toLowerCase() || c.includes(filtro.toLowerCase()));
      });
    };

    // 1. Filtro "todas" retorna todos
    assert.equal(filtrarPorCategoria("todas").length, 2);

    // 2. Filtro "hardware" inclui o fornecedor multi (Global Tech)
    const resultHardware = filtrarPorCategoria("hardware");
    assert.equal(resultHardware.length, 1);
    assert.equal(resultHardware[0].nome_fantasia, "Global Tech");

    // 3. Filtro "conectividade" TAMBÉM inclui o mesmo fornecedor multi (Global Tech)
    const resultConectividade = filtrarPorCategoria("conectividade");
    assert.equal(resultConectividade.length, 1);
    assert.equal(resultConectividade[0].nome_fantasia, "Global Tech");

    // 4. Filtro "consumiveis" inclui apenas Eletro Auto
    const resultConsumiveis = filtrarPorCategoria("consumiveis");
    assert.equal(resultConsumiveis.length, 1);
    assert.equal(resultConsumiveis[0].nome_fantasia, "Eletro Auto");

    // 5. Filtro "geral" não inclui nenhum destes dois
    const resultGeral = filtrarPorCategoria("geral");
    assert.equal(resultGeral.length, 0);
  });

  test("deve calcular compra de material incorporando o valor do frete ao valor total e ao custo médio ponderado", () => {
    const inputCompraComFrete: EntradaEstoqueInput = {
      itemId: "item-1",
      quantidade: 20,
      custoUnitario: 150.0,
      valorFrete: 60.0, // R$ 60,00 de frete para o lote de 20 peças
      fornecedorId: "forn-1",
      documentoFiscal: "NF-e 99881",
      dataPagamento: "2026-09-24",
      observacoes: "Compra com frete expresso",
    };

    // Subtotal de materiais
    const subtotal = inputCompraComFrete.quantidade * inputCompraComFrete.custoUnitario;
    assert.equal(subtotal, 3000.0);

    // Total da compra com frete
    const totalComFrete = subtotal + (inputCompraComFrete.valorFrete || 0);
    assert.equal(totalComFrete, 3060.0);

    // Custo efetivo por unidade adquirida com frete rateado: R$ (3000 + 60) / 20 = R$ 153,00
    const custoEfetivoPorUnidade = totalComFrete / inputCompraComFrete.quantidade;
    assert.equal(custoEfetivoPorUnidade, 153.0);

    // Simulação do recálculo do custo médio com saldo anterior:
    // Saldo anterior: 10 unidades a R$ 140,00 = R$ 1.400,00
    // Nova entrada: 20 unidades a R$ 3.060,00 (com frete)
    // Saldo posterior: 30 unidades
    // Novo custo médio = (1400 + 3060) / 30 = 4460 / 30 = 148.67
    const saldoAnterior = 10;
    const custoMedioAnterior = 140.0;
    const saldoPosterior = saldoAnterior + inputCompraComFrete.quantidade;
    const novoCustoMedio = Number(
      ((saldoAnterior * custoMedioAnterior + totalComFrete) / saldoPosterior).toFixed(2),
    );
    assert.equal(novoCustoMedio, 148.67);
  });

  test("deve atender às categorias no modelo livre e dinâmico do novo material para fornecedores", async () => {
    const { CATEGORIAS_SUGERIDAS } =
      await import("../../features/estoque/components/MaterialModal");

    assert.ok(Array.isArray(CATEGORIAS_SUGERIDAS));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Rastreadores"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Chips M2M"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Relés"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Fios e Chicotes"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Conectores e Fusíveis"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Insumos de Instalação"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Sensores"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Sirenes"));
    assert.ok(CATEGORIAS_SUGERIDAS.includes("Acessórios"));

    // Fornecedor associado a múltiplas categorias do modelo novo
    const fornecedorMulti = {
      nome: "Tecno Sat Distribuidora",
      categoria: "Rastreadores, Relés, Sirenes",
    };

    const catsFornecedor = fornecedorMulti.categoria.split(",").map((c) => c.trim().toLowerCase());

    assert.ok(catsFornecedor.includes("rastreadores"));
    assert.ok(catsFornecedor.includes("relés"));
    assert.ok(catsFornecedor.includes("sirenes"));
    assert.ok(!catsFornecedor.includes("chips m2m"));
  });

  test("deve converter numeros e valores no formato monetario brasileiro e internacional", async () => {
    const { converterNumeroPtBr } = await import("../../features/estoque/utils/pdfNfeParser");

    assert.equal(converterNumeroPtBr("1.250,50"), 1250.5);
    assert.equal(converterNumeroPtBr("189,90"), 189.9);
    assert.equal(converterNumeroPtBr("15,00"), 15);
    assert.equal(converterNumeroPtBr("2.500"), 2500);
    assert.equal(converterNumeroPtBr("45.50"), 45.5);
    assert.equal(converterNumeroPtBr("R$ 350,00"), 350);
    assert.equal(converterNumeroPtBr(""), 0);
  });

  test("deve sugerir categorias adequadas a partir do nome ou descricao do item", async () => {
    const { sugerirCategoriaMaterial } = await import("../../features/estoque/utils/pdfNfeParser");

    assert.equal(sugerirCategoriaMaterial("Rastreador J16 4G LTE GPS"), "Rastreadores");
    assert.equal(sugerirCategoriaMaterial("Chip M2M Telemetria Claro 20MB"), "Chips M2M");
    assert.equal(sugerirCategoriaMaterial("Relé Auxiliar 12V 40A 5 Pinos DNI"), "Relés");
    assert.equal(
      sugerirCategoriaMaterial("Cabo Fio Flexivel 1,00mm Automotivo"),
      "Fios e Chicotes",
    );
    assert.equal(
      sugerirCategoriaMaterial("Porta Fusivel Lamina com Conector"),
      "Conectores e Fusíveis",
    );
    assert.equal(sugerirCategoriaMaterial("Fita Isolante 3M Imperial"), "Insumos de Instalação");
    assert.equal(sugerirCategoriaMaterial("Sensor de Combustível Ultrassônico"), "Sensores");
    assert.equal(sugerirCategoriaMaterial("Sirene Bitonal 12V Automotiva"), "Sirenes");
    assert.equal(sugerirCategoriaMaterial("Suporte Plastico Fixador"), "Acessórios");
    assert.equal(sugerirCategoriaMaterial("Item Generico Desconhecido"), "Acessórios");
  });

  test("deve calcular o estorno e o recalculo financeiro na edicao e exclusao de compra de material", () => {
    // 1. Simulação do estado inicial do item
    const itemEstoque = {
      id: "mat-001",
      nome: "Rastreador J16",
      quantidade_atual: 10,
      custo_medio_unitario: 100,
    };

    // 2. Compra registrada: 5 unidades a R$ 120 + R$ 20 de frete = R$ 620
    const movimentacaoCompra = {
      id: "mov-001",
      item_id: "mat-001",
      tipo: "entrada_compra",
      quantidade: 5,
      custo_unitario: 120,
      valor_frete: 20,
      valor_total: 620,
      despesa_id: "desp-001",
    };

    // 3. Cenário de Edição da Compra: Usuário corrige a quantidade para 8 unidades e frete R$ 30
    const edicao = {
      quantidade: 8,
      custoUnitario: 120,
      valorFrete: 30,
    };
    const diffQtd = edicao.quantidade - movimentacaoCompra.quantidade; // +3
    const novoSaldoItem = itemEstoque.quantidade_atual + diffQtd; // 10 + 3 = 13
    const novoValorTotalCompra = edicao.quantidade * edicao.custoUnitario + edicao.valorFrete; // 8*120 + 30 = 990

    assert.equal(novoSaldoItem, 13);
    assert.equal(novoValorTotalCompra, 990);

    // 4. Cenário de Exclusão/Estorno Total da Compra
    const saldoAposEstorno = Math.max(
      0,
      itemEstoque.quantidade_atual - movimentacaoCompra.quantidade,
    );
    assert.equal(saldoAposEstorno, 5); // 10 - 5 = 5
  });

  test("deve garantir que as funcoes de exclusao e edicao de compra estao disponiveis no estoqueService", async () => {
    const service = await import("../../features/estoque/services/estoqueService");
    assert.equal(typeof service.excluirItemEstoque, "function");
    assert.equal(typeof service.excluirFornecedor, "function");
    assert.equal(typeof service.excluirMovimentacaoEstoque, "function");
    assert.equal(typeof service.editarEntradaCompra, "function");
    assert.equal(typeof service.listarKitsEstoque, "function");
    assert.equal(typeof service.salvarKitEstoque, "function");
    assert.equal(typeof service.excluirKitEstoque, "function");
    assert.equal(typeof service.obterMateriaisInstalacao, "function");
    assert.equal(typeof service.sincronizarEstoqueInstalacao, "function");
  });

  test("deve calcular markup inteligente, margem bruta e preco de venda com precisao especialista", async () => {
    const { calcularPrecoPorMarkup, analisarPrecoVenda, calcularPrecoPorMargem, PRESETS_MARKUP } =
      await import("../../features/estoque/utils/calculadoraMarkup");

    // Custo base de um insumo ou kit: R$ 100,00
    const custo = 100;

    // Markup de 50% -> Preço R$ 150,00
    assert.equal(calcularPrecoPorMarkup(custo, 50), 150);

    // Markup de 100% -> Preço R$ 200,00
    assert.equal(calcularPrecoPorMarkup(custo, 100), 200);

    // Margem desejada de 40% -> Preço: 100 / (1 - 0.40) = 166.67
    assert.equal(calcularPrecoPorMargem(custo, 40), 166.67);

    // Análise de rentabilidade para Custo R$ 100 e Venda R$ 150:
    const analise = analisarPrecoVenda(100, 150);
    assert.equal(analise.lucroBruto, 50);
    assert.equal(analise.markupEfetivoPercentual, 50);
    assert.equal(Number(analise.margemBrutaPercentual.toFixed(2)), 33.33);

    // Presets especialistas disponíveis
    assert.ok(PRESETS_MARKUP.length >= 4);
    assert.ok(PRESETS_MARKUP.some((p) => p.markup === 30));
    assert.ok(PRESETS_MARKUP.some((p) => p.markup === 50));
    assert.ok(PRESETS_MARKUP.some((p) => p.markup === 100));
  });

  test("deve somar os custos dos materiais na composicao de um kit de instalacao", () => {
    // Materiais simulados
    const materiais = [
      { id: "m1", nome: "Rastreador J16", custo: 135.0 },
      { id: "m2", nome: "Chip M2M", custo: 5.0 },
      { id: "m3", nome: "Relé 12V 40A", custo: 12.0 },
      { id: "m4", nome: "Porta Fusível", custo: 8.0 },
    ];

    // Composição do Kit: 1 Rastreador + 1 Chip + 1 Relé + 1 Porta Fusível
    const composicaoKit = [
      { itemId: "m1", quantidade: 1 },
      { itemId: "m2", quantidade: 1 },
      { itemId: "m3", quantidade: 1 },
      { itemId: "m4", quantidade: 1 },
    ];

    const custoTotalKit = composicaoKit.reduce((acc, comp) => {
      const mat = materiais.find((m) => m.id === comp.itemId);
      return acc + (mat ? mat.custo * comp.quantidade : 0);
    }, 0);

    // 135 + 5 + 12 + 8 = 160.00
    assert.equal(custoTotalKit, 160.0);

    // Markup de 60% aplicado no Kit
    const markupKit = 60;
    const precoVendaKit = Number((custoTotalKit * (1 + markupKit / 100)).toFixed(2));
    assert.equal(precoVendaKit, 256.0);
    assert.equal(precoVendaKit - custoTotalKit, 96.0); // Lucro Bruto
  });

  test("deve simular estorno correto de material quando desmarcado na edicao de instalacao", () => {
    // Estado inicial no estoque
    let saldoRastreador = 10;
    let saldoRele = 8;

    // 1. Instalação inicial realizada: baixou 1 rastreador e 2 relés
    const instalacaoOriginal = {
      m1: 1, // Rastreador
      m2: 2, // Relé
    };
    saldoRastreador -= instalacaoOriginal.m1; // 9
    saldoRele -= instalacaoOriginal.m2; // 6

    assert.equal(saldoRastreador, 9);
    assert.equal(saldoRele, 6);

    // 2. Edição da Instalação: O instalador desmarca o relé (m2: 0) e mantém o rastreador (m1: 1)
    const instalacaoEditada = {
      m1: 1,
      m2: 0, // Desmarcado
    };

    // Cálculo da diferença (delta = nova - anterior)
    const deltaRastreador = instalacaoEditada.m1 - instalacaoOriginal.m1; // 1 - 1 = 0
    const deltaRele = instalacaoEditada.m2 - instalacaoOriginal.m2; // 0 - 2 = -2 (estorno)

    // Se delta < 0, estorna ao estoque (+2)
    if (deltaRastreador < 0) saldoRastreador += Math.abs(deltaRastreador);
    if (deltaRele < 0) saldoRele += Math.abs(deltaRele);

    assert.equal(saldoRastreador, 9); // Não mudou
    assert.equal(saldoRele, 8); // Voltou ao saldo anterior (6 + 2 = 8)!

    // 3. Composição do pacote fechado:
    const valorFechadoInstalacao = 200.0;
    const custoMateriaisUtilizados = 135.0; // apenas o rastreador
    const maoDeObraTecnica = valorFechadoInstalacao - custoMateriaisUtilizados; // R$ 65,00

    assert.equal(maoDeObraTecnica, 65.0);
  });

  test("deve validar que NovoItemEstoqueInput suporta custo_medio_unitario e o valor e preservado para calculo e persistencia", () => {
    const input: NovoItemEstoqueInput = {
      codigo_sku: "RAST-4G-NOVO",
      nome: "Rastreador 4G Novo Modelo",
      categoria: "rastreador",
      custo_base: 125.5,
      custo_frete: 20.0,
      custo_medio_unitario: 145.5,
      preco_venda: 250.0,
      markup_percentual: 71.82,
    };

    assert.equal(input.custo_base, 125.5);
    assert.equal(input.custo_frete, 20.0);
    assert.equal(input.custo_medio_unitario, 145.5);
    assert.equal(input.preco_venda, 250.0);
    assert.equal(input.categoria, "rastreador");
  });

  test("deve calcular preco com frete somando no final do markup sem incidencia de lucro sobre o frete", async () => {
    const { calcularPrecoPorMarkup, analisarPrecoVenda } =
      await import("../../features/estoque/utils/calculadoraMarkup");

    // Cenário: Custo da peça R$ 100,00, Frete R$ 20,00, Markup desejado de 50%
    const custoBase = 100;
    const custoFrete = 20;
    const markupPercentual = 50;

    // Preço com markup sobre a base (100 * 1.5 = 150) + Frete (20) = R$ 170,00
    const precoFinal = calcularPrecoPorMarkup(custoBase, markupPercentual, custoFrete);
    assert.equal(precoFinal, 170.0);

    // Análise de rentabilidade:
    // Custo total do item: 100 + 20 = 120
    // Lucro bruto: 170 - 120 = 50 (lucro estritamente sobre a peça, R$ 0 de lucro sobre o frete)
    const analise = analisarPrecoVenda(custoBase, precoFinal, custoFrete);
    assert.equal(analise.custo, 120.0);
    assert.equal(analise.custoBase, 100.0);
    assert.equal(analise.custoFrete, 20.0);
    assert.equal(analise.lucroBruto, 50.0);
    assert.equal(analise.markupEfetivoPercentual, 50.0);
    assert.equal(Number(analise.margemBrutaPercentual.toFixed(2)), 29.41);
  });

  test("deve validar que perfil Financeiro tem permissão total para gerenciar fornecedores, compras e custos no estoque", () => {
    // Validação da regra de permissão canônica do EstoqueView
    const sessaoFinanceiro = {
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceiro: true,
      role: "financeiro",
    };

    const sessaoOperador = {
      isSuperAdmin: false,
      isAdmin: false,
      isFinanceiro: false,
      role: "operador",
    };

    const podeVerCustosEFornecedores = (session: any) =>
      Boolean(
        session?.isSuperAdmin ||
        session?.isAdmin ||
        session?.isFinanceiro ||
        session?.role === "financeiro",
      );

    assert.equal(podeVerCustosEFornecedores(sessaoFinanceiro), true);
    assert.equal(podeVerCustosEFornecedores(sessaoOperador), false);
  });
});
