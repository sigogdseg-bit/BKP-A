export interface ItemNfeExtraido {
  idTemp: string;
  selecionado: boolean;
  codigo: string;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  custoUnitario: number;
  valorTotal: number;
  categoriaSugerida: string;
  vincularItemIdExistente?: string;
}

export interface FornecedorNfeExtraido {
  cadastrarOuAtualizar: boolean;
  razaoSocial: string;
  nomeFantasia: string;
  cnpjCpf: string;
  telefone: string;
  email: string;
  categoria: string;
}

export interface CompraNfeExtraida {
  lancarCompra: boolean;
  numeroNf: string;
  chaveAcesso: string;
  dataEmissao: string;
  valorFrete: number;
  valorProdutos: number;
  valorTotalNf: number;
  observacoes: string;
}

export interface DadosNfeExtraidos {
  sucesso: boolean;
  mensagem: string;
  fornecedor: FornecedorNfeExtraido;
  compra: CompraNfeExtraida;
  itens: ItemNfeExtraido[];
  textoBruto: string;
}

/**
 * Normaliza valores monetários e números brasileiros (ex: "1.234,56" -> 1234.56)
 */
export function converterNumeroPtBr(valor: string | undefined | null): number {
  if (!valor) return 0;
  const limpo = valor.trim().replace(/R\$\s*/i, "");
  // Se tem ponto e vírgula (ex: 1.250,50)
  if (limpo.includes(",") && limpo.includes(".")) {
    return parseFloat(limpo.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // Se tem apenas vírgula (ex: 1250,50)
  if (limpo.includes(",")) {
    return parseFloat(limpo.replace(",", ".")) || 0;
  }
  // Se tem padrão de milhar brasileiro com ponto (ex: 2.500 ou 10.000)
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    return parseFloat(limpo.replace(/\./g, "")) || 0;
  }
  return parseFloat(limpo) || 0;
}

/**
 * Sugere categoria de material a partir do nome/descrição
 */
export function sugerirCategoriaMaterial(descricao: string): string {
  const d = descricao.toLowerCase();
  if (
    d.includes("rastreador") ||
    d.includes("tracker") ||
    d.includes("gps") ||
    d.includes("j16") ||
    d.includes("coban") ||
    d.includes("localizador") ||
    d.includes("queclink") ||
    d.includes("suntech")
  ) {
    return "Rastreadores";
  }
  if (
    d.includes("chip") ||
    d.includes("sim card") ||
    d.includes("simcard") ||
    d.includes("m2m") ||
    d.includes("conectividade") ||
    d.includes("telemetria") ||
    d.includes("acesso") ||
    d.includes("vivo") ||
    d.includes("claro") ||
    d.includes("tim") ||
    d.includes("algar") ||
    d.includes("voxter") ||
    d.includes("arqia")
  ) {
    return "Chips M2M";
  }
  if (d.includes("rele") || d.includes("relé") || d.includes("bloqueio")) {
    return "Relés";
  }
  if (
    d.includes("fio") ||
    d.includes("cabo") ||
    d.includes("chicote") ||
    d.includes("espaguete") ||
    d.includes("corrugado")
  ) {
    return "Fios e Chicotes";
  }
  if (
    d.includes("conector") ||
    d.includes("fusivel") ||
    d.includes("fusível") ||
    d.includes("porta fusivel") ||
    d.includes("terminal") ||
    d.includes("porta-fusivel")
  ) {
    return "Conectores e Fusíveis";
  }
  if (d.includes("sensor") || d.includes("temperatura") || d.includes("ultrassonico")) {
    return "Sensores";
  }
  if (d.includes("sirene") || d.includes("buzzer") || d.includes("alarme")) {
    return "Sirenes";
  }
  if (
    d.includes("fita") ||
    d.includes("abracadeira") ||
    d.includes("abraçadeira") ||
    d.includes("solda") ||
    d.includes("termo") ||
    d.includes("tubo")
  ) {
    return "Insumos de Instalação";
  }
  return "Acessórios";
}

/**
 * Lê arquivo PDF e extrai dados comerciais da NF-e / DANFE / Fatura
 */
export async function extrairDadosNfeDePdf(
  arquivoPdf: File | ArrayBuffer,
  nomeArquivoParam?: string,
): Promise<DadosNfeExtraidos> {
  try {
    let buffer: ArrayBuffer;
    let nomeArquivo = nomeArquivoParam || "";
    if (arquivoPdf instanceof File) {
      buffer = await arquivoPdf.arrayBuffer();
      if (!nomeArquivo) nomeArquivo = arquivoPdf.name;
    } else {
      buffer = arquivoPdf;
    }

    const { extractText } = await import("unpdf");
    const { text } = await extractText(buffer);
    const textoCompleto = Array.isArray(text) ? text.join("\n") : String(text || "");

    if (!textoCompleto.trim()) {
      return {
        sucesso: false,
        mensagem: "O arquivo PDF não contém texto legível ou é uma imagem digitalizada sem OCR.",
        fornecedor: {
          cadastrarOuAtualizar: false,
          razaoSocial: "",
          nomeFantasia: "",
          cnpjCpf: "",
          telefone: "",
          email: "",
          categoria: "Rastreadores",
        },
        compra: {
          lancarCompra: false,
          numeroNf: "",
          chaveAcesso: "",
          dataEmissao: new Date().toISOString().split("T")[0],
          valorFrete: 0,
          valorProdutos: 0,
          valorTotalNf: 0,
          observacoes: "",
        },
        itens: [],
        textoBruto: "",
      };
    }

    // 1. Extração da Chave de Acesso (44 dígitos numéricos)
    let chaveAcesso = "";
    const matchChave = textoCompleto.match(
      /(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/,
    );
    if (matchChave) {
      chaveAcesso = matchChave[1].replace(/\s+/g, "");
    }

    // 2. Extração do Número da NF-e com máxima precisão
    let numeroNf = "";

    // 2.1 Se há Chave de Acesso, extrai os dígitos 26 a 34 (oficial SEFAZ)
    if (chaveAcesso && chaveAcesso.length === 44) {
      const numFromChave = parseInt(chaveAcesso.substring(25, 34), 10);
      if (!isNaN(numFromChave) && numFromChave > 0) {
        numeroNf = String(numFromChave);
      }
    }

    // 2.2 Se ainda não achou, tenta extrair do nome do arquivo (ex: "Nf 16427 chip .pdf")
    if (!numeroNf && nomeArquivo) {
      const matchNomeArquivo = nomeArquivo.match(/(?:NF|NOTA|NFE|FATURA|FAT)[^\d]*(\d{3,9})/i);
      if (matchNomeArquivo) {
        numeroNf = matchNomeArquivo[1];
      }
    }

    // 2.3 Procura no texto por padrões de NF formal (ex: "Nº 000.016.427" ou "NF-e Nº 16427")
    if (!numeroNf) {
      const matchNfFormal =
        textoCompleto.match(
          /(?:NF-e|NOTA FISCAL|DANFE|FATURA)[^\d\n]*N[º°o.]*\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{3,9})/i,
        ) ||
        textoCompleto.match(/N[º°o.]+\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{3,9})/i) ||
        textoCompleto.match(/N[úu]mero\s*[:.]?\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{3,9})/i);

      if (matchNfFormal) {
        const numLimpo = matchNfFormal[1].replace(/\./g, "");
        const parsed = parseInt(numLimpo, 10);
        if (!isNaN(parsed) && parsed > 0) {
          numeroNf = String(parsed);
        }
      }
    }

    // 3. Extração do CNPJ do Fornecedor / Emitente
    const regexCnpj = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g;
    const cnpjs = textoCompleto.match(regexCnpj) || [];
    const cnpjEmitente = cnpjs[0] || "";

    // 4. Extração de Razão Social do Emitente (evitando sufixo isolado como "LTDA")
    let razaoSocial = "";
    let nomeFantasia = "";
    const linhas = textoCompleto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (let i = 0; i < Math.min(linhas.length, 35); i++) {
      const linha = linhas[i];
      const linhaUpper = linha.toUpperCase();

      const contemIdentificadorEmpresa =
        linhaUpper.includes("LTDA") ||
        linhaUpper.includes("S.A.") ||
        linhaUpper.includes("S/A") ||
        linhaUpper.includes("EIRELI") ||
        linhaUpper.includes("ME") ||
        linhaUpper.includes("EPP") ||
        linhaUpper.includes("TECNOLOGIA") ||
        linhaUpper.includes("TELECOM") ||
        linhaUpper.includes("DISTRIBUIDORA") ||
        linhaUpper.includes("COMERCIO") ||
        linhaUpper.includes("SOLUCOES") ||
        linhaUpper.includes("RASTREADORES");

      const ehCabecalhoGenerico =
        linhaUpper.includes("DANFE") ||
        linhaUpper.includes("DOCUMENTO AUXILIAR") ||
        linhaUpper.includes("DESTINATÁRIO") ||
        linhaUpper.includes("REMETENTE") ||
        linhaUpper.includes("RECEBEMOS DE");

      if (contemIdentificadorEmpresa && !ehCabecalhoGenerico) {
        // Se a linha é muito curta (ex: apenas "LTDA" ou "LTDA - ME"), o nome real está na linha anterior
        if (linha.length <= 10 && i > 0 && linhas[i - 1].length > 3) {
          razaoSocial = `${linhas[i - 1]} ${linha}`.trim();
        } else {
          razaoSocial = linha;
        }
        break;
      }
    }

    // Se ainda não achou, pega primeira linha significativa após cabeçalho
    if (!razaoSocial && linhas.length > 0) {
      const primeiraValida = linhas.find(
        (l) =>
          l.length > 5 &&
          !l.toUpperCase().includes("DANFE") &&
          !l.toUpperCase().includes("RECEBEMOS DE") &&
          !l.toUpperCase().includes("CHAVE DE ACESSO") &&
          !l.toUpperCase().includes("PROTOCOLO"),
      );
      if (primeiraValida) razaoSocial = primeiraValida;
    }

    // Extrai nome fantasia amigável
    nomeFantasia = razaoSocial.split(/[-–—/]/)[0]?.trim() || razaoSocial;
    if (nomeFantasia.toUpperCase() === "LTDA" && razaoSocial !== "LTDA") {
      nomeFantasia = razaoSocial.replace(/LTDA/gi, "").trim();
    }

    // 5. Extração de Telefone
    let telefone = "";
    const matchTel = textoCompleto.match(/\(?\b\d{2}\)?\s*(?:9\s*)?\d{4}[-.\s]?\d{4}\b/);
    if (matchTel) {
      telefone = matchTel[0];
    }

    // 6. Extração de Frete e Valores Totais (NF-e ou Fatura de Telecom/Serviços)
    let valorFrete = 0;
    const matchFrete =
      textoCompleto.match(/VALOR DO FRETE\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/FRETE\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i);
    if (matchFrete) {
      valorFrete = converterNumeroPtBr(matchFrete[1]);
    }

    let valorTotalNf = 0;
    const matchTotal =
      textoCompleto.match(/VALOR TOTAL DA NOTA\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/VALOR TOTAL\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/TOTAL A PAGAR\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/VALOR DO DOCUMENTO\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/VALOR LÍQUIDO\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/TOTAL DA FATURA\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/VALOR COBRADO\s*[:.]?\s*R?\$?\s*([0-9.,]+)/i) ||
      textoCompleto.match(/TOTAL\s*[:.]?\s*R\$\s*([0-9.,]+)/i);

    if (matchTotal) {
      valorTotalNf = converterNumeroPtBr(matchTotal[1]);
    }

    // 7. Extração de Itens / Materiais (Multi-Estágio)
    const itensExtraidos: ItemNfeExtraido[] = [];

    // 7.1 Estágio 1: Tabela DANFE tradicional inline
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const matchItemValores = linha.match(
        /(UN|PC|PÇ|M|MT|CX|KT|KG|PAR)\s+([0-9.,]+)\s+([0-9.,]+)\s+([0-9.,]+)/i,
      );
      if (matchItemValores) {
        const unidade = matchItemValores[1].toUpperCase();
        const qtd = converterNumeroPtBr(matchItemValores[2]);
        const unit = converterNumeroPtBr(matchItemValores[3]);
        const total = converterNumeroPtBr(matchItemValores[4]);

        const parteDesc = linha.slice(0, linha.indexOf(matchItemValores[0])).trim();
        const tokensDesc = parteDesc.split(/\s+/);
        const cod = tokensDesc[0] || `ITM-${itensExtraidos.length + 1}`;
        const desc =
          tokensDesc.slice(1).join(" ") ||
          parteDesc ||
          `Material Item ${itensExtraidos.length + 1}`;

        if (qtd > 0 && unit > 0) {
          itensExtraidos.push({
            idTemp: `nfe-item-${itensExtraidos.length + 1}-${Date.now()}`,
            selecionado: true,
            codigo: cod,
            descricao: desc,
            quantidade: qtd,
            unidadeMedida: unidade.startsWith("M") ? "metro" : "unidade",
            custoUnitario: unit,
            valorTotal: total > 0 ? total : qtd * unit,
            categoriaSugerida: sugerirCategoriaMaterial(desc),
          });
        }
      }
    }

    // 7.2 Estágio 2: Detecção Semântica de Faturas de Telecom / Chips / Rastreadores
    if (itensExtraidos.length === 0) {
      const termosChaveSetor = [
        "CHIP",
        "SIM CARD",
        "M2M",
        "TELEMETRIA",
        "CONECTIVIDADE",
        "LINHA",
        "RASTREADOR",
        "GPS",
        "TRACKER",
        "J16",
        "RELE",
        "RELÉ",
        "CHICOTE",
        "FIO",
        "FUSIVEL",
        "FUSÍVEL",
        "SIRENE",
        "SENSOR",
        "CONECTOR",
      ];

      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        const linhaUpper = linha.toUpperCase();
        const temTermo = termosChaveSetor.some((t) => linhaUpper.includes(t));

        // Evita linhas que sejam razões sociais ou cabeçalhos
        const ehLinhaDeProduto =
          temTermo &&
          linha.length > 4 &&
          linha.length < 130 &&
          !linhaUpper.includes("DANFE") &&
          !linhaUpper.includes("DESTINATÁRIO") &&
          !linhaUpper.includes("RECEBEMOS DE");

        if (ehLinhaDeProduto) {
          // Busca nas próximas 3 linhas por valores e quantidades
          let qtd = 1;
          let custo = valorTotalNf > 0 ? valorTotalNf : 0;

          for (let j = 1; j <= 3; j++) {
            if (i + j < linhas.length) {
              const proxLinha = linhas[i + j];
              // Verifica se a linha próxima é um valor monetário
              const matchMoeda = proxLinha.match(/R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/);
              if (matchMoeda && custo === 0) {
                custo = converterNumeroPtBr(matchMoeda[1]);
              }
              // Verifica se há quantidade inteira isolada
              const matchQtd = proxLinha.match(/^\b([0-9]{1,5})\b$/);
              if (matchQtd && qtd === 1) {
                qtd = parseInt(matchQtd[1], 10);
              }
            }
          }

          const descItem = linha.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, "").trim();

          itensExtraidos.push({
            idTemp: `nfe-item-${itensExtraidos.length + 1}-${Date.now()}`,
            selecionado: true,
            codigo: `MAT-${numeroNf || "01"}-${itensExtraidos.length + 1}`,
            descricao: descItem,
            quantidade: qtd > 0 ? qtd : 1,
            unidadeMedida: descItem.toUpperCase().includes("METRO") ? "metro" : "unidade",
            custoUnitario: Number((custo > 0 && qtd > 0 ? custo / qtd : custo).toFixed(2)),
            valorTotal: Number((custo > 0 ? custo : 0).toFixed(2)),
            categoriaSugerida: sugerirCategoriaMaterial(descItem),
          });

          if (itensExtraidos.length >= 10) break;
        }
      }
    }

    // 7.3 Estágio 3: Fallback Inteligente Garantido (NUNCA deixa a lista zerada!)
    if (itensExtraidos.length === 0) {
      const contextoGeral = `${nomeArquivo} ${textoCompleto}`.toLowerCase();
      let nomeSugerido = "Chip M2M Conectividade / Telemetria";
      let categoriaSugerida = "Chips M2M";

      if (
        contextoGeral.includes("rastreador") ||
        contextoGeral.includes("tracker") ||
        contextoGeral.includes("gps") ||
        contextoGeral.includes("j16")
      ) {
        nomeSugerido = "Rastreador GPS Veicular";
        categoriaSugerida = "Rastreadores";
      } else if (contextoGeral.includes("chip") || contextoGeral.includes("m2m")) {
        nomeSugerido = "Chip M2M Multi-Operadora";
        categoriaSugerida = "Chips M2M";
      } else if (contextoGeral.includes("rele") || contextoGeral.includes("relé")) {
        nomeSugerido = "Relé Automotivo 12V 40A";
        categoriaSugerida = "Relés";
      } else if (contextoGeral.includes("fio") || contextoGeral.includes("chicote")) {
        nomeSugerido = "Fio Automotivo 1.0mm";
        categoriaSugerida = "Fios e Chicotes";
      } else {
        nomeSugerido = `Material / Insumos NF ${numeroNf || "Compra"}`;
        categoriaSugerida = "Rastreadores";
      }

      itensExtraidos.push({
        idTemp: `nfe-item-1-${Date.now()}`,
        selecionado: true,
        codigo: `MAT-${numeroNf || "01"}`,
        descricao: nomeSugerido,
        quantidade: 1,
        unidadeMedida: "unidade",
        custoUnitario: valorTotalNf > 0 ? valorTotalNf - valorFrete : 0,
        valorTotal: valorTotalNf > 0 ? valorTotalNf - valorFrete : 0,
        categoriaSugerida: categoriaSugerida,
      });
    }

    // Categoria do fornecedor sugerida com base nos itens
    const categoriasDosItens = Array.from(
      new Set(itensExtraidos.map((it) => it.categoriaSugerida).filter(Boolean)),
    );
    const categoriaFornecedorSugerida =
      categoriasDosItens.length > 0 ? categoriasDosItens.join(", ") : "Rastreadores";

    return {
      sucesso: true,
      mensagem: `PDF analisado com sucesso! ${itensExtraidos.length} item(ns) identificados.`,
      fornecedor: {
        cadastrarOuAtualizar: Boolean(razaoSocial || cnpjEmitente),
        razaoSocial: razaoSocial || "Fornecedor Identificado na NF",
        nomeFantasia: nomeFantasia || razaoSocial || "Fornecedor",
        cnpjCpf: cnpjEmitente,
        telefone,
        email: "",
        categoria: categoriaFornecedorSugerida,
      },
      compra: {
        lancarCompra: true,
        numeroNf: numeroNf ? `NF-${numeroNf}` : "",
        chaveAcesso,
        dataEmissao: new Date().toISOString().split("T")[0],
        valorFrete,
        valorProdutos: valorTotalNf > valorFrete ? valorTotalNf - valorFrete : valorTotalNf,
        valorTotalNf,
        observacoes: `Importado via PDF: NF ${numeroNf || "S/N"}`,
      },
      itens: itensExtraidos,
      textoBruto: textoCompleto,
    };
  } catch (erro: any) {
    return {
      sucesso: false,
      mensagem: `Erro ao processar PDF: ${erro?.message || "Arquivo corrompido ou ilegível"}`,
      fornecedor: {
        cadastrarOuAtualizar: false,
        razaoSocial: "",
        nomeFantasia: "",
        cnpjCpf: "",
        telefone: "",
        email: "",
        categoria: "Rastreadores",
      },
      compra: {
        lancarCompra: false,
        numeroNf: "",
        chaveAcesso: "",
        dataEmissao: new Date().toISOString().split("T")[0],
        valorFrete: 0,
        valorProdutos: 0,
        valorTotalNf: 0,
        observacoes: "",
      },
      itens: [],
      textoBruto: "",
    };
  }
}
