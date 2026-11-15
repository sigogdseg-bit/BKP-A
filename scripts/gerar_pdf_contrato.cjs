const { jsPDF } = require("jspdf");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const envContent = fs.readFileSync(".env.local", "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["\x27](.*)["\x27]$/, "$1");
});

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const adminClient = createClient(url, key);

function formatarDocumento(doc) {
  if (!doc) return "Não informado";
  const limpo = doc.replace(/\D/g, "");
  if (limpo.length === 11) {
    return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (limpo.length === 14) {
    return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

function formatarTelefone(tel) {
  if (!tel) return "Não informado";
  const limpo = tel.replace(/\D/g, "");
  if (limpo.length === 11) {
    return limpo.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return tel;
}

function gerarContratoPdfBuffer({ contrato, cliente, veiculos }) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const numeroContrato = contrato.numero_contrato || "CTR-0001/2026";
  const selo = contrato.selo_autenticidade || "SGD-OFICIAL";
  const codigo = contrato.codigo_verificacao || "SGA7M9";
  const dataHoje = new Date();
  const dataFormatada = dataHoje.toLocaleDateString("pt-BR");

  let y = 18;

  // Cabeçalho institucional
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, y, 182, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("GD RASTREAMENTO — CONTRATO OFICIAL DE LOCAÇÃO", 18, y + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text("Rastreamento Veicular e Cortesia de Automonitoramento", 18, y + 14);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(`Nº ${numeroContrato}`, 190, y + 8, { align: "right" });
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Selo: ${selo} | Cód: ${codigo}`, 190, y + 14, { align: "right" });

  y += 28;

  // Preâmbulo
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const preambulo = `Pelo presente instrumento particular, as partes qualificadas têm entre si justo e acordado o presente CONTRATO DE LOCAÇÃO DE EQUIPAMENTO ELETRÔNICO PARA RASTREAMENTO VEICULAR E AUTOMONITORAMENTO, em conformidade com o Código Civil Brasileiro (Lei nº 10.406/2002 — arts. 565 a 578), a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), a Lei do Software (Lei nº 9.609/1998) e o Código de Defesa do Consumidor (Lei nº 8.078/1990), regendo-se pelas cláusulas a seguir sob os princípios da probidade e da boa-fé objetiva (art. 422 do CC).`;
  const splitPreambulo = doc.splitTextToSize(preambulo, 182);
  doc.text(splitPreambulo, 14, y);
  y += splitPreambulo.length * 3.8 + 5;

  // 1. Partes Contratantes
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("1. IDENTIFICAÇÃO DAS PARTES CONTRATANTES", 16, y + 4.5);
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

  const locadoraTexto = `LOCADORA: DARIO DE NOVAES GONÇALVES JÚNIOR - MEI, CNPJ nº 26.581.175/0001-23, com sede na Rua Dom Antônio Cabral, nº 225, Bairro São Luiz, Volta Redonda/RJ, CEP 27286-210, detentora da plataforma digital GD Rastreamento (https://gd.oficial.tec.br).`;
  const splitLocadora = doc.splitTextToSize(locadoraTexto, 182);
  doc.text(splitLocadora, 14, y);
  y += splitLocadora.length * 3.6 + 3;

  const locatarioTexto = `LOCATÁRIO: ${cliente?.nome_razao_social || "Cliente"}, inscrito(a) no CPF/CNPJ sob o nº ${formatarDocumento(cliente?.documento)}, Telefone/WhatsApp: ${formatarTelefone(cliente?.telefone)}, residente/sediado no endereço informado no cadastro da plataforma.`;
  const splitLocatario = doc.splitTextToSize(locatarioTexto, 182);
  doc.text(splitLocatario, 14, y);
  y += splitLocatario.length * 3.6 + 5;

  // 2. Do Objeto
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("2. DO OBJETO DO CONTRATO E MODALIDADE DE SERVIÇO", 16, y + 4.5);
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  const objetoTexto = `Constitui objeto deste instrumento a locação onerosa de equipamento eletrônico de rastreamento veicular telemático GPS/GNSS devidamente HOMOLOGADO PELA ANATEL, acompanhado de chip SIM Card M2M/LTE dedicado para transmissão de dados (bens móveis infungíveis de propriedade da LOCADORA). A plataforma web e mobile GD Rastreamento é disponibilizada A TÍTULO GRATUITO E CORTESIA ao LOCATÁRIO para que este realize diretamente seu automonitoramento veicular, sem taxa adicional de software (SaaS).`;
  const splitObjeto = doc.splitTextToSize(objetoTexto, 182);
  doc.text(splitObjeto, 14, y);
  y += splitObjeto.length * 3.6 + 5;

  // 3. Veículos e Equipamentos
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("3. VEÍCULOS VINCULADOS E ESPECIFICAÇÕES DOS BENS LOCADOS", 16, y + 4.5);
  y += 8;

  if (veiculos && veiculos.length > 0) {
    veiculos.forEach((v, i) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Veículo ${i + 1}: Placa ${v.placa || "SEM PLACA"} - ${v.modelo || v.marca_modelo || "Veículo Cadastrado"}`,
        16,
        y,
      );
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Rastreador: J16 4G LTE | IMEI: ${v.rastreador_imei || v.imei || "Vinculado na Ativação"} | Homologado ANATEL`,
        16,
        y,
      );
      y += 5;
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Veículo e rastreador cadastrados no sistema e vinculados a este contrato.", 16, y);
    y += 5;
  }
  y += 2;

  // 4. Cláusulas Gerais
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("4. CLÁUSULAS E CONDIÇÕES GERAIS DO CONTRATO", 16, y + 4.5);
  y += 8;

  const clausulas = [
    "CLÁUSULA 1ª - DA NÃO INCIDÊNCIA DE SEGURANÇA PRIVADA: A presente contratação restringe-se exclusivamente à LOCAÇÃO DE BEM MÓVEL. A LOCADORA NÃO PRESTA SERVIÇOS DE SEGURANÇA PRIVADA, vigilância armada, pronta resposta ou escolta armada, não se enquadrando nas atividades da Lei nº 14.967/2024 e não estando sujeita a registro ou fiscalização pela Polícia Federal.",
    "CLÁUSULA 2ª - DA AUSÊNCIA DE SEGURO PATRIMONIAL: Este contrato NÃO CONSTITUI SEGURO OU PROTEÇÃO VEICULAR e não garante a recuperação do veículo em caso de furto, roubo ou sinistro. O sistema é uma ferramenta de auxílio ao automonitoramento pelo próprio contratante.",
    "CLÁUSULA 3ª - DO AUTOMONITORAMENTO E LIMITAÇÕES TÉCNICAS: O funcionamento do equipamento depende de cobertura satelital (GPS) e sinais de telefonia móvel celular (LTE/GPRS). Interferências externas como áreas de sombra, subsolos, túneis ou uso de bloqueadores de sinal (jammers) podem degradar temporariamente a precisão ou o envio dos dados.",
    "CLÁUSULA 4ª - DA VIGÊNCIA E RESCISÃO: O contrato possui vigência inicial de 12 meses, prorrogável automaticamente por iguais períodos, salvo manifestação em contrário com antecedência de 30 dias. O encerramento imotivado antes do prazo inicial sujeita à multa compensatória de 20% do saldo restante.",
    "CLÁUSULA 5ª - DO REGIME DE LOCAÇÃO E DEVOLUÇÃO: Os rastreadores e chips M2M permanecem como propriedade exclusiva da LOCADORA. Encerrado o contrato por qualquer motivo, o LOCATÁRIO compromete-se a devolver os equipamentos no prazo de 10 dias úteis, sob pena de indenização de R$ 450,00 por rastreador e R$ 50,00 por chip.",
    "CLÁUSULA 6ª - DA PROTEÇÃO DE DADOS (LGPD): Em conformidade com a Lei nº 13.709/2018, os dados de posicionamento são tratados exclusivamente para a execução do contrato de automonitoramento, sendo mantidos sob rígidos controles de segurança cibernética e sigilo.",
    "CLÁUSULA 7ª - DA ASSINATURA ELETRÔNICA E FORÇA EXECUTIVA: As partes reconhecem a plena validade jurídica, integridade e eficácia executiva do presente instrumento assinado eletronicamente por meio digital (Art. 10, § 2º da MP nº 2.200-2/2001 e Art. 784, III do CPC).",
    "CLÁUSULA 8ª - DO FORO DE ELEIÇÃO: Fica eleito o Foro da Comarca de Volta Redonda/RJ para dirimir eventuais dúvidas ou controvérsias decorrentes deste contrato, com renúncia de qualquer outro.",
  ];

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);

  clausulas.forEach((cl) => {
    const splitCl = doc.splitTextToSize(cl, 182);
    if (y + splitCl.length * 3.5 > 275) {
      doc.addPage();
      y = 20;
    }
    doc.text(splitCl, 14, y);
    y += splitCl.length * 3.5 + 2.5;
  });

  // Declaração de aceite
  if (y + 25 > 275) {
    doc.addPage();
    y = 20;
  } else {
    y += 3;
  }

  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, 182, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const decTexto = `DECLARAÇÃO FORMAL: O(A) Contratante declara que leu integralmente e compreendeu todas as cláusulas e condições estipuladas neste instrumento, aceitando-as em sua totalidade de forma irrevogável e vinculante.`;
  const splitDec = doc.splitTextToSize(decTexto, 178);
  doc.text(splitDec, 16, y + 5);
  y += 22;

  // Bloco de Assinaturas
  if (y + 35 > 275) {
    doc.addPage();
    y = 25;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(`Volta Redonda/RJ, ${dataFormatada}.`, 14, y);
  y += 14;

  const col1X = 20;
  const col2X = 115;
  const lineW = 75;

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(col1X, y, col1X + lineW, y);
  doc.line(col2X, y, col2X + lineW, y);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("DARIO DE NOVAES GONÇALVES JÚNIOR - MEI", col1X + lineW / 2, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text("CONTRATADA (GD RASTREAMENTO)", col1X + lineW / 2, y + 8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.text((cliente?.nome_razao_social || "CONTRATANTE").toUpperCase(), col2X + lineW / 2, y + 4, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  doc.text(`CPF/CNPJ: ${formatarDocumento(cliente?.documento)}`, col2X + lineW / 2, y + 8, {
    align: "center",
  });
  doc.text("CONTRATANTE", col2X + lineW / 2, y + 12, { align: "center" });

  // Rodapé em todas as páginas
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(
      `GD Rastreamento • Contrato nº ${numeroContrato} • Selo: ${selo} • Cód: ${codigo}`,
      14,
      290,
    );
    doc.text(`Página ${i} de ${pageCount}`, 196, 290, { align: "right" });
  }

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

module.exports = { gerarContratoPdfBuffer };
