// spedFiscalService.ts — GD Rastreamento
// Gerador do Arquivo Digital SPED Fiscal (EFD - Escrituração Fiscal Digital)
// Formata receitas, faturamentos, prestação de serviços de rastreamento e DRE
// em conformidade com o layout oficial da Receita Federal (Blocos 0, C, D, E e 9).

import type { TransacaoFinanceira } from "../types";

export interface DadosEmpresaSped {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual?: string;
  codigoMunicipioIbge?: string;
  uf?: string;
  perfilSped?: "A" | "B" | "C";
}

export interface ParametrosGeracaoSped {
  mes: number;
  ano: number;
  transacoes: TransacaoFinanceira[];
  dadosEmpresa?: DadosEmpresaSped;
}

export interface ResultadoSpedFiscal {
  conteudoTxt: string;
  totalLinhas: number;
  totalRegistrosPorBloco: Record<string, number>;
  valorTotalFaturado: number;
  nomeArquivoSugerido: string;
}

/**
 * Formata um valor numérico para o padrão de moeda do SPED Fiscal (duas casas decimais sem separador de milhar, vírgula decimal)
 * Ex: 1250.5 -> "1250,50"
 */
function formatarValorSped(valor: number): string {
  return Number(valor || 0)
    .toFixed(2)
    .replace(".", ",");
}

/**
 * Formata data no formato DDMMAAAA para o SPED
 */
function formatarDataSped(dataStr: string): string {
  if (!dataStr) return "";
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return "";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = String(d.getUTCFullYear());
  return `${dia}${mes}${ano}`;
}

/**
 * Gera o conteúdo oficial em texto plano do arquivo SPED Fiscal EFD
 */
export function gerarSpedFiscalTxt(params: ParametrosGeracaoSped): ResultadoSpedFiscal {
  const { mes, ano, transacoes } = params;
  const mesStr = String(mes).padStart(2, "0");
  const dataInicio = `01${mesStr}${ano}`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dataFim = `${String(ultimoDia).padStart(2, "0")}${mesStr}${ano}`;

  const empresa: DadosEmpresaSped = {
    razaoSocial: params.dadosEmpresa?.razaoSocial || "DARIO DE NOVAES GONCALVES JUNIOR",
    cnpj: (params.dadosEmpresa?.cnpj || "26581175000123").replace(/\D/g, ""),
    inscricaoEstadual: params.dadosEmpresa?.inscricaoEstadual || "ISENTO",
    codigoMunicipioIbge: params.dadosEmpresa?.codigoMunicipioIbge || "3306305", // Volta Redonda/RJ
    uf: params.dadosEmpresa?.uf || "RJ",
    perfilSped: params.dadosEmpresa?.perfilSped || "B",
  };

  const linhas: string[] = [];
  const contagemBlocos: Record<string, number> = {
    "0": 0,
    C: 0,
    D: 0,
    E: 0,
    "9": 0,
  };

  function addLinha(registro: string, bloco: string) {
    linhas.push(registro);
    contagemBlocos[bloco] = (contagemBlocos[bloco] || 0) + 1;
  }

  // ── BLOCO 0: ABERTURA, IDENTIFICAÇÃO E REFERÊNCIAS ──────────────────────────
  // Registro 0000: Abertura do Arquivo Digital e Identificação da Entidade
  addLinha(
    `|0000|018|0|${dataInicio}|${dataFim}|${empresa.razaoSocial}|${empresa.cnpj}||${empresa.uf}|${empresa.inscricaoEstadual}|${empresa.codigoMunicipioIbge}|||${empresa.perfilSped}|1|`,
    "0",
  );

  // Registro 0001: Abertura do Bloco 0 (0 = Com Dados)
  addLinha(`|0001|0|`, "0");

  // Registro 0005: Dados Complementares da Entidade
  addLinha(
    `|0005|GD RASTREAMENTO TELEMETRIA|27286210|RUA DOM ANTONIO CABRAL|225||SAO LUIZ|24992494030||novaes@oficial.tec.br|`,
    "0",
  );

  // Registro 0100: Dados do Contabilista
  addLinha(
    `|0100|CONTABILIDADE CENTRAL|11122233344|CRC-RJ 000000/O|00000000000191|27286210|AVENIDA CENTRAL|100||CENTRO|2433445566||contabilidade@oficial.tec.br|3306305|`,
    "0",
  );

  // ── BLOCO C: DOCUMENTOS FISCAIS I - MERCADORIAS E SERVIÇOS ─────────────────
  addLinha(`|C001|0|`, "C");

  // Filtra transações do tipo 'entrada' concluidas no período
  const receitasMes = transacoes.filter(
    (t) =>
      t.tipo === "entrada" &&
      t.status === "concluido" &&
      new Date(t.data_vencimento || t.created_at).getMonth() + 1 === mes &&
      new Date(t.data_vencimento || t.created_at).getFullYear() === ano,
  );

  let valorTotalFaturado = 0;
  let numeroNf = 1;

  for (const r of receitasMes) {
    const valor = Number(r.valor || 0);
    valorTotalFaturado += valor;
    const dataEmissao = formatarDataSped(r.data_pagamento || r.data_vencimento || r.created_at);

    // Registro C100: Nota Fiscal de Prestação de Serviços de Rastreamento / Monitoramento
    addLinha(
      `|C100|0|1||55|00|1|${String(numeroNf).padStart(6, "0")}||${dataEmissao}|${dataEmissao}|${formatarValorSped(
        valor,
      )}|2|0,00|0,00|${formatarValorSped(valor)}|99|0,00|0,00|0,00|0,00|${formatarValorSped(
        valor,
      )}|0,00|0,00|0,00|0,00|`,
      "C",
    );

    // Registro C190: Registro Analítico do Documento (CST, CFOP e Alíquota)
    addLinha(
      `|C190|090|5949|0,00|${formatarValorSped(valor)}|0,00|0,00|0,00|0,00|0,00|0,00||`,
      "C",
    );

    numeroNf++;
  }

  // Registro C990: Encerramento do Bloco C
  contagemBlocos["C"] += 1; // contabiliza a própria linha C990
  linhas.push(`|C990|${contagemBlocos["C"]}|`);

  // ── BLOCO D: SERVIÇOS DE COMUNICAÇÃO E TRANSPORTE ──────────────────────────
  addLinha(`|D001|1|`, "D"); // 1 = Bloco sem dados
  contagemBlocos["D"] += 1;
  linhas.push(`|D990|${contagemBlocos["D"]}|`);

  // ── BLOCO E: APURAÇÃO DO ICMS E DO IPI ─────────────────────────────────────
  addLinha(`|E001|0|`, "E");
  addLinha(`|E100|${dataInicio}|${dataFim}|`, "E");
  addLinha(`|E110|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|0,00|`, "E");
  contagemBlocos["E"] += 1;
  linhas.push(`|E990|${contagemBlocos["E"]}|`);

  // Encerramento do Bloco 0 (precisa ser feito com a contagem exata)
  contagemBlocos["0"] += 1;
  // Inserir 0990 no Bloco 0 antes do C001
  const idxBlocoC = linhas.findIndex((l) => l.startsWith("|C001|"));
  linhas.splice(idxBlocoC, 0, `|0990|${contagemBlocos["0"]}|`);

  // ── BLOCO 9: CONTROLE E ENCERRAMENTO DO ARQUIVO DIGITAL ─────────────────────
  addLinha(`|9001|0|`, "9");

  // Registros 9900: Totalizadores por tipo de registro
  const registrosExistentes = [
    "0000",
    "0001",
    "0005",
    "0100",
    "0990",
    "C001",
    "C990",
    "D001",
    "D990",
    "E001",
    "E100",
    "E110",
    "E990",
    "9001",
    "9900",
    "9990",
    "9999",
  ];
  if (receitasMes.length > 0) {
    registrosExistentes.push("C100", "C190");
  }

  for (const reg of registrosExistentes) {
    const qtd =
      linhas.filter((l) => l.startsWith(`|${reg}|`)).length +
      (reg === "9900" ? registrosExistentes.length : reg.startsWith("9") ? 1 : 0);
    addLinha(`|9900|${reg}|${Math.max(1, qtd)}|`, "9");
  }

  contagemBlocos["9"] += 2; // contabiliza 9990 e 9999
  linhas.push(`|9990|${contagemBlocos["9"]}|`);

  const totalGeralLinhas = linhas.length + 1; // + 9999
  linhas.push(`|9999|${totalGeralLinhas}|`);

  const conteudoTxt = linhas.join("\r\n") + "\r\n";
  const nomeArquivoSugerido = `SPED_EFD_${empresa.cnpj}_${ano}${mesStr}.txt`;

  return {
    conteudoTxt,
    totalLinhas: totalGeralLinhas,
    totalRegistrosPorBloco: contagemBlocos,
    valorTotalFaturado,
    nomeArquivoSugerido,
  };
}

/**
 * Dispara o download automático do arquivo gerado no navegador
 */
export function baixarArquivoSpedFiscal(conteudoTxt: string, nomeArquivo = "SPED_EFD.txt"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([conteudoTxt], { type: "text/plain;charset=latin1" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
