import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Hunter — Otimizacao de Bundles Secundarios e Decisao Arquitetural do Medidor 3 J16", () => {
  it("1. financeiroService nao deve possuir importacoes estaticas pesadas de jspdf ou exceljs na raiz do modulo", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/features/financeiro/services/financeiroService.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const topImports = lines.slice(0, 40).join("\n");
    assert.ok(
      !topImports.includes('import { jsPDF } from "jspdf"'),
      "financeiroService nao deve importar jsPDF estaticamente no topo",
    );
    assert.ok(
      !topImports.includes('import ExcelJS from "exceljs"'),
      "financeiroService nao deve importar ExcelJS estaticamente no topo",
    );
    assert.ok(
      !topImports.includes('import autoTable from "jspdf-autotable"'),
      "financeiroService nao deve importar autoTable estaticamente no topo",
    );

    assert.ok(
      content.includes('await import("exceljs")'),
      "financeiroService deve carregar ExcelJS dinamicamente sob demanda",
    );
    assert.ok(
      content.includes('await import("jspdf")'),
      "financeiroService deve carregar jsPDF dinamicamente sob demanda",
    );
  });

  it("2. comprovantePdfHelper nao deve importar jspdf estaticamente no topo", () => {
    const filePath = path.resolve(process.cwd(), "src/shared/lib/comprovantePdfHelper.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const topImports = lines.slice(0, 15).join("\n");
    assert.ok(
      !topImports.includes('import jsPDF from "jspdf"'),
      "comprovantePdfHelper nao deve importar jsPDF estaticamente no topo",
    );
    assert.ok(
      content.includes('await import("jspdf")'),
      "comprovantePdfHelper deve carregar jsPDF dinamicamente via import() assincrono",
    );
  });

  it("3. ocrNfService e pdfNfeParser nao devem importar unpdf estaticamente no topo", () => {
    const ocrPath = path.resolve(process.cwd(), "src/features/financeiro/services/ocrNfService.ts");
    const ocrContent = fs.readFileSync(ocrPath, "utf-8");
    assert.ok(
      !ocrContent.slice(0, 300).includes('import { extractText } from "unpdf"'),
      "ocrNfService nao deve importar unpdf no topo do arquivo",
    );
    assert.ok(
      ocrContent.includes('await import("unpdf")'),
      "ocrNfService deve carregar unpdf dinamicamente apenas quando arquivo for PDF",
    );

    const parserPath = path.resolve(process.cwd(), "src/features/estoque/utils/pdfNfeParser.ts");
    const parserContent = fs.readFileSync(parserPath, "utf-8");
    assert.ok(
      !parserContent.slice(0, 150).includes('import { extractText } from "unpdf"'),
      "pdfNfeParser nao deve importar unpdf no topo do arquivo",
    );
    assert.ok(
      parserContent.includes('await import("unpdf")'),
      "pdfNfeParser deve carregar unpdf dinamicamente sob demanda",
    );
  });

  it("4. PRD.md deve conter a decisao arquitetural do Medidor 3 (J16) como IMPLEMENTADA", () => {
    const prdPath = path.resolve(process.cwd(), "PRD.md");
    const content = fs.readFileSync(prdPath, "utf-8");

    assert.ok(
      content.includes("Leitura Manual MCU J16 (Comando `MILEAGE#`)"),
      "PRD.md deve referenciar o comando MILEAGE# do J16",
    );
    assert.ok(
      content.includes("[IMPLEMENTADA]"),
      "PRD.md deve marcar a leitura sob demanda do Medidor 3 como IMPLEMENTADA",
    );
    assert.ok(
      content.includes("preservando a franquia de dados") || content.includes("economia de dados"),
      "PRD.md deve documentar a motivacao arquitetural de preservacao de dados e vida util da flash",
    );
  });

  it("5. Regra Petrea Hunter-Guardian: Ausencia do caractere proibido nos arquivos tocados", () => {
    const arquivos = [
      "src/features/financeiro/services/financeiroService.ts",
      "src/shared/lib/comprovantePdfHelper.ts",
      "src/features/financeiro/services/ocrNfService.ts",
      "src/features/estoque/utils/pdfNfeParser.ts",
      "src/features/monitor-gps/components/ModalPlaybackTrajeto.tsx",
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
      "src/features/frota/components/FrotaAnalyticsView.tsx",
      "src/features/clientes/components/ClienteVeiculosAnalyticsModal.tsx",
      "src/features/financeiro/services/propostaPdfService.ts",
      "src/features/clientes/services/contratoPdfService.ts",
    ];

    const charProibido = String.fromCharCode(38);
    const operadorDuplo = charProibido + charProibido;

    arquivos.forEach((rel) => {
      const full = path.resolve(process.cwd(), rel);
      assert.ok(fs.existsSync(full), `Arquivo deve existir: ${rel}`);
      const lines = fs.readFileSync(full, "utf-8").split("\n");
      lines.forEach((linha, idx) => {
        const limpa = linha
          .split(operadorDuplo)
          .join("")
          .replace(/&[a-z0-9#]+;/gi, "");
        if (limpa.includes(charProibido)) {
          const isUrl =
            limpa.includes("http://") ||
            limpa.includes("https://") ||
            limpa.includes("?codigo=") ||
            limpa.includes(charProibido + "codigo=");
          assert.ok(
            isUrl,
            `Caractere proibido isolado encontrado no arquivo ${rel} linha ${idx + 1}: ${linha.trim()}`,
          );
        }
      });
    });
  });
});
