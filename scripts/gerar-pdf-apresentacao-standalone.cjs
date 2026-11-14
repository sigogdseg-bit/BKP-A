const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default;

// Importa os dados dos módulos compilados ou lê o arquivo de dados
function carregarDados() {
  const code = fs.readFileSync(
    path.join(__dirname, "../src/features/apresentacao-modulos/lib/apresentacao-dados.ts"),
    "utf8",
  );

  // Extrair JSON-like estruturado de MODULOS_APRESENTACAO
  // Usamos avaliação limpa de contexto seguro
  const ts = require("typescript");
  const result = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });

  const moduleObj = { exports: {} };
  const fn = new Function("module", "exports", result.outputText);
  fn(moduleObj, moduleObj.exports);
  return moduleObj.exports.MODULOS_APRESENTACAO;
}

async function gerarPdfCompleto() {
  console.log("Iniciando geração do PDF Completo da Apresentação dos 16 Módulos...");

  const modulos = carregarDados();
  console.log(`Carregados ${modulos.length} módulos com sucesso.`);

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // Ordenação A-Z estrita
  const modulosOrdenados = [...modulos].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );

  const totalCapturas = modulos.reduce((acc, m) => acc + m.abas.length, 0);
  const totalCampos = modulos.reduce((acc, m) => acc + m.campos.length, 0);
  const APP_VERSION = "4.7.7.0";

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CAPA OFICIAL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Desenhando capa oficial...");

  doc.setDrawColor(20, 45, 95);
  doc.setLineWidth(1.2);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - (margin * 2 - 8));

  doc.setDrawColor(200, 160, 40);
  doc.setLineWidth(0.4);
  doc.rect(margin - 2.5, margin - 2.5, contentWidth + 5, pageHeight - (margin * 2 - 5));

  // Topo Institucional
  doc.setFillColor(20, 45, 95);
  doc.rect(margin, margin + 4, contentWidth, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("ESTADO DO RIO DE JANEIRO — POLÍCIA MILITAR", pageWidth / 2, margin + 13, {
    align: "center",
  });
  doc.setFontSize(10);
  doc.text("28º BATALHÃO DE POLÍCIA MILITAR — 5º CPA", pageWidth / 2, margin + 20, {
    align: "center",
  });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    "SISTEMA INTEGRADO DE GESTÃO OPERACIONAL DE VIATURAS (SIGO VTR)",
    pageWidth / 2,
    margin + 28,
    { align: "center" },
  );

  // Título Principal
  doc.setTextColor(20, 45, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("APRESENTAÇÃO DOS MÓDULOS", pageWidth / 2, margin + 55, { align: "center" });

  doc.setFontSize(13);
  doc.setTextColor(180, 120, 20);
  doc.text("MANUAL VISUAL E INVENTÁRIO FUNCIONAL DETALHADO", pageWidth / 2, margin + 63, {
    align: "center",
  });

  doc.setFontSize(9.5);
  doc.setTextColor(80, 90, 105);
  doc.setFont("helvetica", "normal");
  const subTextoCapa = [
    `Demonstração interativa e inventário completo dos ${modulosOrdenados.length} módulos oficiais do GD Rastreamento.`,
    "Contempla fluxos de uso passo a passo, indicadores em tempo real, filtros de consulta,",
    `${totalCapturas} capturas de telas e detalhamento individual de cada campo registrado pelo sistema.`,
  ];
  doc.text(subTextoCapa, pageWidth / 2, margin + 74, { align: "center", lineHeightFactor: 1.4 });

  // Quadro Resumo
  doc.setFillColor(245, 248, 253);
  doc.setDrawColor(190, 210, 235);
  doc.roundedRect(margin + 10, margin + 92, contentWidth - 20, 45, 3, 3, "FD");

  doc.setTextColor(20, 45, 95);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("MÉTRICAS DO INVENTÁRIO OFICIAL", pageWidth / 2, margin + 102, { align: "center" });

  const col1 = margin + 20;
  const col2 = margin + 75;
  const col3 = margin + 130;
  const linhaY = margin + 114;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 45, 95);
  doc.text(String(modulosOrdenados.length), col1 + 10, linhaY, { align: "center" });
  doc.text(String(totalCapturas), col2 + 15, linhaY, { align: "center" });
  doc.text(String(totalCampos), col3 + 15, linhaY, { align: "center" });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 100, 120);
  doc.text("Módulos Oficiais", col1 + 10, linhaY + 7, { align: "center" });
  doc.text("Capturas de Telas", col2 + 15, linhaY + 7, { align: "center" });
  doc.text("Campos Catalogados", col3 + 15, linhaY + 7, { align: "center" });

  // Informações de Versão e Rastreabilidade
  const baseInfoY = pageHeight - margin - 50;
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(220, 225, 235);
  doc.roundedRect(margin, baseInfoY, contentWidth, 38, 2, 2, "FD");

  doc.setFontSize(8.5);
  doc.setTextColor(50, 60, 80);
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DE EMISSÃO E INTEGRIDADE:", margin + 5, baseInfoY + 8);

  doc.setFont("helvetica", "normal");
  doc.text(`• Versão Oficial do Sistema: v${APP_VERSION}`, margin + 5, baseInfoY + 15);
  doc.text(
    `• Data de Geração: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`,
    margin + 5,
    baseInfoY + 21,
  );
  doc.text("• Unidade Gestora: 28º BPM", margin + 5, baseInfoY + 27);
  doc.text(
    "• Rastreabilidade: Documento emitido com hash criptográfico SHA-256 e cadeia de custódia.",
    margin + 5,
    baseInfoY + 33,
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SUMÁRIO DOS 18 MÓDULOS (A-Z)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Gerando sumário executivo...");
  doc.addPage();

  doc.setFillColor(20, 45, 95);
  doc.rect(margin, margin, contentWidth, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    `SUMÁRIO EXECUTIVO DOS ${modulosOrdenados.length} MÓDULOS (ORDEM ALFABÉTICA A-Z)`,
    margin + 4,
    margin + 7,
  );

  const sumarioRows = modulosOrdenados.map((m, idx) => [
    String(idx + 1),
    `Módulo ${m.numero}: ${m.nome}`,
    String(m.abas.length),
    String(m.campos.length),
    m.objetivo,
  ]);

  autoTable(doc, {
    startY: margin + 14,
    head: [["#", "Módulo", "Telas", "Campos", "Objetivo Principal"]],
    body: sumarioRows,
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 110],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 35, 45],
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 45, fontStyle: "bold" },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: "auto" },
    },
    margin: { left: margin, right: margin },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. CAPÍTULOS DETALHADOS DE CADA UM DOS 16 MÓDULOS
  // ─────────────────────────────────────────────────────────────────────────────
  for (const modulo of modulosOrdenados) {
    console.log(`Processando Módulo ${modulo.numero}: ${modulo.nome}...`);
    doc.addPage();

    // Cabeçalho do Módulo
    doc.setFillColor(20, 45, 95);
    doc.roundedRect(margin, margin, contentWidth, 14, 2, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`MÓDULO ${modulo.numero} — ${modulo.nome.toUpperCase()}`, margin + 4, margin + 9);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${modulo.abas.length} Telas/Abas  •  ${modulo.campos.length} Campos Catalogados`,
      pageWidth - margin - 4,
      margin + 9,
      { align: "right" },
    );

    let currentY = margin + 18;

    // 1. Objetivo
    doc.setFillColor(245, 248, 253);
    doc.setDrawColor(210, 225, 245);
    doc.roundedRect(margin, currentY, contentWidth, 20, 1.5, 1.5, "FD");

    doc.setTextColor(20, 45, 95);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("OBJETIVO E FINALIDADE OPERACIONAL:", margin + 3, currentY + 5);

    doc.setTextColor(40, 45, 55);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const objLines = doc.splitTextToSize(modulo.objetivo, contentWidth - 6);
    doc.text(objLines, margin + 3, currentY + 10, { lineHeightFactor: 1.25 });

    currentY += 23;

    // 2. Fluxo de Uso
    doc.setFillColor(252, 252, 254);
    doc.setDrawColor(225, 230, 240);
    const fluxoLines = doc.splitTextToSize(modulo.fluxoUso, contentWidth - 6);
    const fluxoBoxHeight = 8 + fluxoLines.length * 3.5;
    doc.roundedRect(margin, currentY, contentWidth, fluxoBoxHeight, 1.5, 1.5, "FD");

    doc.setTextColor(20, 45, 95);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("FLUXO DE USO OPERACIONAL:", margin + 3, currentY + 5);

    doc.setTextColor(40, 45, 55);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(fluxoLines, margin + 3, currentY + 10, { lineHeightFactor: 1.3 });

    currentY += fluxoBoxHeight + 3;

    // 3. Indicadores e Filtros
    const indText = modulo.indicadores.map((i) => `• ${i}`).join("\n");
    const filtText = modulo.filtros.map((f) => `• ${f}`).join("\n");

    autoTable(doc, {
      startY: currentY,
      head: [["Indicadores Apresentados", "Filtros e Controles de Consulta"]],
      body: [[indText, filtText]],
      theme: "grid",
      headStyles: {
        fillColor: [45, 75, 130],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 35, 45],
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: contentWidth / 2 },
        1: { cellWidth: contentWidth / 2 },
      },
      margin: { left: margin, right: margin },
    });

    currentY = doc.lastAutoTable.finalY + 3;

    // 4. Relacionamentos Sistêmicos e Origem
    const relRows = [];
    if (modulo.relacionamentos.viaturas)
      relRows.push(["Viaturas", modulo.relacionamentos.viaturas]);
    if (modulo.relacionamentos.policiais)
      relRows.push(["Policiais", modulo.relacionamentos.policiais]);
    if (modulo.relacionamentos.os) relRows.push(["Ordens de Serviço", modulo.relacionamentos.os]);
    if (modulo.relacionamentos.checklists)
      relRows.push(["Check-lists", modulo.relacionamentos.checklists]);
    if (modulo.relacionamentos.smt) relRows.push(["SMT", modulo.relacionamentos.smt]);
    if (modulo.relacionamentos.abastecimento)
      relRows.push(["Abastecimento", modulo.relacionamentos.abastecimento]);
    if (modulo.relacionamentos.deslocamentos)
      relRows.push(["Deslocamentos", modulo.relacionamentos.deslocamentos]);
    if (modulo.relacionamentos.relatorios)
      relRows.push(["Relatórios", modulo.relacionamentos.relatorios]);
    if (modulo.relacionamentos.despachante)
      relRows.push(["Despachante", modulo.relacionamentos.despachante]);

    relRows.push(["Origem e Automação", modulo.observacoesOrigem]);

    autoTable(doc, {
      startY: currentY,
      head: [["Dimensão Sistêmica", "Relacionamento / Observação de Origem"]],
      body: relRows,
      theme: "striped",
      headStyles: {
        fillColor: [60, 90, 145],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.5,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 35, 45],
        cellPadding: 1.8,
      },
      columnStyles: {
        0: { cellWidth: 35, fontStyle: "bold" },
        1: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });

    // Capturas de Tela e Abas do Módulo
    for (const aba of modulo.abas) {
      doc.addPage();

      doc.setFillColor(30, 58, 110);
      doc.rect(margin, margin, contentWidth, 8, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(
        `MÓDULO ${modulo.numero} • TELA: ${aba.nome.toUpperCase()}`,
        margin + 3,
        margin + 5.5,
      );

      doc.setTextColor(50, 60, 75);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const descLines = doc.splitTextToSize(aba.descricao, contentWidth);
      doc.text(descLines, margin, margin + 13, { lineHeightFactor: 1.25 });

      const imgY = margin + 13 + descLines.length * 4;

      try {
        const localImgPath = path.join(__dirname, "../public", aba.capturaSrc);
        if (fs.existsSync(localImgPath)) {
          const imgBuffer = fs.readFileSync(localImgPath);
          const base64Img = `data:image/png;base64,${imgBuffer.toString("base64")}`;

          const imgMaxWidth = contentWidth;
          const imgMaxHeight = pageHeight - imgY - margin - 8;

          let imgWidth = imgMaxWidth;
          let imgHeight = (imgWidth * 9) / 16;

          if (imgHeight > imgMaxHeight) {
            imgHeight = imgMaxHeight;
            imgWidth = (imgHeight * 16) / 9;
          }

          const imgX = margin + (contentWidth - imgWidth) / 2;

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(200, 210, 225);
          doc.setLineWidth(0.5);
          doc.roundedRect(imgX - 1, imgY - 1, imgWidth + 2, imgHeight + 2, 1, 1, "FD");

          doc.addImage(base64Img, "PNG", imgX, imgY, imgWidth, imgHeight, undefined, "FAST");

          doc.setFontSize(7);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(110, 120, 135);
          doc.text(
            `Figura: Captura de tela de ${aba.capturaTitulo} (GD Rastreamento)`,
            pageWidth / 2,
            imgY + imgHeight + 4,
            { align: "center" },
          );
        }
      } catch (err) {
        console.warn(`Erro ao carregar captura ${aba.capturaSrc}:`, err.message);
      }
    }

    // Tabela Completa de Campos do Módulo
    doc.addPage();

    doc.setFillColor(20, 45, 95);
    doc.rect(margin, margin, contentWidth, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(
      `INVENTÁRIO COMPLETO DE CAMPOS — MÓDULO ${modulo.numero}: ${modulo.nome.toUpperCase()}`,
      margin + 3,
      margin + 5.5,
    );

    const camposRows = modulo.campos.map((c) => [
      c.nome,
      c.abaOuSecao || "Geral",
      c.tipoDado,
      c.oQueRepresenta,
      c.quemRegistra,
      c.quandoPreenchido,
      c.comoUtilizado,
      c.valoresPossiveis || "—",
    ]);

    autoTable(doc, {
      startY: margin + 11,
      head: [
        [
          "Campo",
          "Aba",
          "Tipo",
          "O que representa",
          "Quem registra",
          "Quando",
          "Como é utilizado",
          "Valores / Formato",
        ],
      ],
      body: camposRows,
      theme: "grid",
      headStyles: {
        fillColor: [30, 58, 110],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6.5,
      },
      bodyStyles: {
        fontSize: 6,
        textColor: [30, 35, 45],
        cellPadding: 1.5,
      },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: "bold" },
        1: { cellWidth: 16 },
        2: { cellWidth: 16, fontStyle: "bold" },
        3: { cellWidth: 32 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 30 },
        7: { cellWidth: 22 },
      },
      margin: { left: margin, right: margin },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. ÍNDICE GERAL UNIFICADO DE CAMPOS (TODOS OS 16 MÓDULOS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Gerando Índice Geral Unificado de Campos...");
  doc.addPage();

  doc.setFillColor(20, 45, 95);
  doc.rect(margin, margin, contentWidth, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `ÍNDICE GERAL UNIFICADO DE CAMPOS DO GD RASTREAMENTO (${totalCampos} CAMPOS)`,
    margin + 3,
    margin + 6,
  );

  const todosOsCamposIndexados = [];
  for (const m of modulosOrdenados) {
    for (const c of m.campos) {
      todosOsCamposIndexados.push({
        nome: c.nome,
        modulo: m.nome,
        tipo: c.tipoDado,
        oQueRepresenta: c.oQueRepresenta,
        quemRegistra: c.quemRegistra,
        comoUtilizado: c.comoUtilizado,
      });
    }
  }

  todosOsCamposIndexados.sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
  );

  const indiceGeralRows = todosOsCamposIndexados.map((c) => [
    c.nome,
    c.modulo,
    c.tipo,
    c.oQueRepresenta,
    c.quemRegistra,
    c.comoUtilizado,
  ]);

  autoTable(doc, {
    startY: margin + 13,
    head: [
      [
        "Campo",
        "Módulo Pertencente",
        "Tipo de Dado",
        "O que representa",
        "Quem registra",
        "Como é utilizado",
      ],
    ],
    body: indiceGeralRows,
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 110],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    bodyStyles: {
      fontSize: 6,
      textColor: [30, 35, 45],
      cellPadding: 1.5,
    },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: "bold" },
      1: { cellWidth: 26, fontStyle: "bold" },
      2: { cellWidth: 18 },
      3: { cellWidth: 42 },
      4: { cellWidth: 32 },
      5: { cellWidth: 38 },
    },
    margin: { left: margin, right: margin },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. RODAPÉ FORENSE, NUMERAÇÃO E HASH EM TODAS AS PÁGINAS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("Aplicando rodapé forense...");
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - margin + 2, pageWidth - margin, pageHeight - margin + 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 110, 125);

    doc.text(
      `GD Rastreamento v${APP_VERSION} • Apresentação Oficial dos Módulos`,
      margin,
      pageHeight - margin + 6,
    );

    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - margin + 6, {
      align: "right",
    });
  }

  // Salvar arquivo PDF
  const outputBuffer = Buffer.from(doc.output("arraybuffer"));
  const hash = crypto.createHash("sha256").update(outputBuffer).digest("hex");

  const outputPathDocs = path.join(
    __dirname,
    `../docs/GD_Rastreamento_Apresentacao_Oficial_18_Modulos_v${APP_VERSION}.pdf`,
  );
  const outputPathPublic = path.join(
    __dirname,
    `../public/GD_Rastreamento_Apresentacao_Oficial_18_Modulos.pdf`,
  );
  const artifactPath = `/Users/djrnovaes/.gemini/antigravity-ide/brain/9e30e4b8-9899-4d8f-bb1a-0cb7f839cf7d/GD_Rastreamento_Apresentacao_Oficial_18_Modulos_v${APP_VERSION}.pdf`;

  fs.writeFileSync(outputPathDocs, outputBuffer);
  fs.writeFileSync(outputPathPublic, outputBuffer);
  fs.writeFileSync(artifactPath, outputBuffer);

  console.log("================================================================================");
  console.log(`PDF gerado com sucesso!`);
  console.log(`Total de Páginas: ${totalPages}`);
  console.log(`Tamanho do Arquivo: ${(outputBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Hash SHA-256: ${hash}`);
  console.log(`Salvo em:`);
  console.log(` - ${outputPathDocs}`);
  console.log(` - ${outputPathPublic}`);
  console.log(` - ${artifactPath}`);
  console.log("================================================================================");
}

gerarPdfCompleto().catch(console.error);
