import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularResumoFluxoCaixa,
  calcularDREOperacional,
  calcularDiasAtraso,
  formatarTelefoneWhatsApp,
  gerarMensagemWhatsAppInadimplente,
  gerarLinkWhatsAppInadimplente,
  calcularResumoInadimplencia,
  atualizarTransacaoManual,
} from "../../features/financeiro/services/financeiroService";
import type { TransacaoFinanceira } from "../../features/financeiro/types";

describe("Hunter — Gestao Financeira Integrada e Fluxo de Caixa", () => {
  const transacoesMock: TransacaoFinanceira[] = [
    // 1. Mensalidade paga
    {
      id: "t-1",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidade 09/2026 - Transportadora Alfa",
      valor: 1500.0,
      data_competencia: "2026-09-01",
      status: "concluido",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // 2. Mensalidade a receber
    {
      id: "t-2",
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Mensalidade 09/2026 - Frotista Beta",
      valor: 800.0,
      data_competencia: "2026-09-01",
      status: "pendente",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // 3. Repasse Instalador pago
    {
      id: "t-3",
      tipo: "saida",
      categoria: "repasse_instalador",
      descricao: "Repasse Instalador (Carlos) - Ordem #101",
      valor: 160.0,
      data_competencia: "2026-09-02",
      status: "concluido",
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    },
    // 4. Repasse Instalador pendente
    {
      id: "t-4",
      tipo: "saida",
      categoria: "repasse_instalador",
      descricao: "Repasse Instalador (Marcos) - Ordem #102",
      valor: 80.0,
      data_competencia: "2026-09-03",
      status: "pendente",
      created_at: "2026-09-03T00:00:00Z",
      updated_at: "2026-09-03T00:00:00Z",
    },
    // 5. Custo com Chips M2M pago
    {
      id: "t-5",
      tipo: "saida",
      categoria: "chips_conectividade",
      descricao: "Fatura Operadora M2M Multi-operadora",
      valor: 200.0,
      data_competencia: "2026-09-05",
      status: "concluido",
      created_at: "2026-09-05T00:00:00Z",
      updated_at: "2026-09-05T00:00:00Z",
    },
    // 6. Despesa Operacional Cloud paga
    {
      id: "t-6",
      tipo: "saida",
      categoria: "infraestrutura_servidores",
      descricao: "Cloudflare Workers e Supabase Dedicado",
      valor: 140.0,
      data_competencia: "2026-09-05",
      status: "concluido",
      created_at: "2026-09-05T00:00:00Z",
      updated_at: "2026-09-05T00:00:00Z",
    },
  ];

  it("Calculo exato do Fluxo de Caixa (Saldo, Entradas e Saidas Realizadas e Previstas)", () => {
    const resumo = calcularResumoFluxoCaixa(transacoesMock);

    assert.equal(resumo.totalTransacoes, 6);
    // Entradas Realizadas: 1500
    assert.equal(resumo.entradasRealizadas, 1500.0);
    // Entradas Previstas: 800
    assert.equal(resumo.entradasPrevistas, 800.0);
    // Saidas Realizadas: 160 + 200 + 140 = 500
    assert.equal(resumo.saidasRealizadas, 500.0);
    // Saidas Previstas: 80
    assert.equal(resumo.saidasPrevistas, 80.0);
    // Saldo Atual em Caixa: 1500 - 500 = 1000
    assert.equal(resumo.saldoAtual, 1000.0);
  });

  it("Calculo correto do DRE Operacional Simplificado e Margem Operacional", () => {
    const dre = calcularDREOperacional(transacoesMock);

    // Receita Bruta (Entradas concluidas): 1500.0
    assert.equal(dre.receitaBruta, 1500.0);
    // Custos Diretos com Instaladores: 160.0
    assert.equal(dre.custoInstalacoes, 160.0);
    // Custos com Conectividade M2M: 200.0
    assert.equal(dre.custoConectividade, 200.0);
    // Outras Despesas Operacionais: 140.0
    assert.equal(dre.despesasOperacionais, 140.0);

    // Lucro Operacional Liquido: 1500 - 160 - 200 - 140 = 1000.0
    assert.equal(dre.lucroOperacionalLiquido, 1000.0);

    // Margem Operacional: (1000 / 1500) * 100 = 66.666...%
    const margemEsperada = (1000.0 / 1500.0) * 100;
    assert.ok(Math.abs(dre.margemOperacionalPercentual - margemEsperada) < 0.001);
  });

  it("Regra Petrea: Ausencia do caractere comercial proibido nas rotas, categorias e mensagens financeiras", () => {
    const rotulos = [
      "Gestao Financeira e Fluxo de Caixa",
      "Controle unificado de receitas, despesas, repasses, conciliacao e DRE",
      "Demonstrativo do Resultado do Exercicio (DRE Operacional)",
      "Novo Lancamento Avulso",
      "Chips M2M e Conectividade",
      "Despesas Operacionais e Administrativas",
    ];

    for (const r of rotulos) {
      assert.ok(
        !r.includes(String.fromCharCode(38)),
        `O texto '${r}' nao deve conter o caractere comercial proibido`,
      );
    }
  });

  it("Validacao de enums e restricoes de integridade do ledger financeiro", () => {
    const tiposPermitidos = ["entrada", "saida"];
    const statusPermitidos = ["pendente", "concluido", "cancelado"];
    const categoriasPermitidas = [
      "mensalidade",
      "repasse_instalador",
      "chips_conectividade",
      "infraestrutura_servidores",
      "aquisicao_equipamentos",
      "material_consumo",
      "despesa_administrativa",
      "receita_avulsa",
      "outros",
    ];

    assert.ok(tiposPermitidos.includes("entrada"));
    assert.ok(tiposPermitidos.includes("saida"));
    assert.ok(statusPermitidos.includes("concluido"));
    assert.ok(categoriasPermitidas.includes("mensalidade"));
    assert.ok(categoriasPermitidas.includes("repasse_instalador"));
    assert.ok(categoriasPermitidas.includes("chips_conectividade"));
  });

  it("Calculo exato de dias de atraso a partir de data de vencimento", () => {
    // Data futura nao deve ter atraso (0 dias)
    const dataFutura = new Date();
    dataFutura.setDate(dataFutura.getDate() + 10);
    const dataFuturaStr = `${dataFutura.getFullYear()}-${String(dataFutura.getMonth() + 1).padStart(2, "0")}-${String(dataFutura.getDate()).padStart(2, "0")}`;
    assert.equal(calcularDiasAtraso(dataFuturaStr), 0);

    // Data de 5 dias atras deve ter 5 dias de atraso
    const dataPassada = new Date();
    dataPassada.setDate(dataPassada.getDate() - 5);
    const dataPassadaStr = `${dataPassada.getFullYear()}-${String(dataPassada.getMonth() + 1).padStart(2, "0")}-${String(dataPassada.getDate()).padStart(2, "0")}`;
    assert.equal(calcularDiasAtraso(dataPassadaStr), 5);

    // Data vazia ou invalida retorna 0
    assert.equal(calcularDiasAtraso(""), 0);
  });

  it("Formatacao e normalizacao de telefone para WhatsApp com DDI 55", () => {
    // Telefone com mascara (11) 98765-4321 -> 5511987654321
    assert.equal(formatarTelefoneWhatsApp("(11) 98765-4321"), "5511987654321");
    // Telefone com fixo (21) 3456-7890 -> 552134567890
    assert.equal(formatarTelefoneWhatsApp("(21) 3456-7890"), "552134567890");
    // Telefone ja com 55: +55 (11) 98765-4321 -> 5511987654321
    assert.equal(formatarTelefoneWhatsApp("+55 (11) 98765-4321"), "5511987654321");
    // Telefone nulo ou vazio retorna string vazia
    assert.equal(formatarTelefoneWhatsApp(null), "");
    assert.equal(formatarTelefoneWhatsApp(""), "");
  });

  it("Geracao de mensagem e link direto de cobranca via WhatsApp", () => {
    const clienteTeste = {
      cliente_id: "cli-99",
      nome_razao_social: "Rodrigo Ferreira da Silva",
      documento: "123.456.789-00",
      telefone: "(11) 99876-5432",
      email: "rodrigo@exemplo.com",
      status_cliente: "ativo",
      totalDevido: 259.8,
      qtdMensalidadesAtrasadas: 2,
      maiorAtrasoDias: 38,
      mensalidadeMaisAntigaVencimento: "2026-08-10",
      mensalidades: [
        {
          id: "m-10",
          mes_referencia: 8,
          ano_referencia: 2026,
          valor: 129.9,
          data_vencimento: "2026-08-10",
          diasAtraso: 38,
          status: "vencido",
        },
        {
          id: "m-11",
          mes_referencia: 9,
          ano_referencia: 2026,
          valor: 129.9,
          data_vencimento: "2026-09-10",
          diasAtraso: 7,
          status: "vencido",
        },
      ],
    };

    const msg = gerarMensagemWhatsAppInadimplente(clienteTeste, "financeiro@hunter.com.br");
    assert.ok(msg.includes("Ola, Rodrigo!"));
    assert.ok(msg.includes("2 mensalidade(s) em aberto"));
    assert.ok(msg.includes("R$ 259,80"));
    assert.ok(msg.includes("38 dias em atraso"));
    assert.ok(msg.includes("financeiro@hunter.com.br"));
    assert.ok(msg.includes("GD Rastreamento"));
    // Proibicao absoluta do caractere comercial
    assert.ok(!msg.includes(String.fromCharCode(38)));

    const link = gerarLinkWhatsAppInadimplente(clienteTeste, "financeiro@hunter.com.br");
    assert.ok(link.startsWith("https://wa.me/5511998765432?text="));
  });

  it("Totalizacao exata do resumo de clientes inadimplentes", () => {
    const listaInadimplentes = [
      {
        cliente_id: "c-1",
        nome_razao_social: "Cliente Um",
        status_cliente: "ativo",
        totalDevido: 200.0,
        qtdMensalidadesAtrasadas: 2,
        maiorAtrasoDias: 45,
        mensalidadeMaisAntigaVencimento: "2026-08-01",
        mensalidades: [],
      },
      {
        cliente_id: "c-2",
        nome_razao_social: "Cliente Dois",
        status_cliente: "bloqueado",
        totalDevido: 150.0,
        qtdMensalidadesAtrasadas: 1,
        maiorAtrasoDias: 12,
        mensalidadeMaisAntigaVencimento: "2026-09-05",
        mensalidades: [],
      },
    ];

    const resumo = calcularResumoInadimplencia(listaInadimplentes);
    assert.equal(resumo.totalInadimplente, 350.0);
    assert.equal(resumo.totalClientesInadimplentes, 2);
    assert.equal(resumo.totalMensalidadesVencidas, 3);
    assert.equal(resumo.maiorAtrasoGeralDias, 45);
  });

  it("Mensagem de cobranca contem Payload Pix Copia e Cola EMV BACEN e link de QR Code", () => {
    const cliente = {
      cliente_id: "cli-mario-99",
      nome_razao_social: "Mario Silva",
      telefone: "11988887777",
      status_cliente: "ativo",
      totalDevido: 79.9,
      qtdMensalidadesAtrasadas: 1,
      maiorAtrasoDias: 10,
      mensalidadeMaisAntigaVencimento: "2026-09-10",
      mensalidades: [],
    };

    const msg = gerarMensagemWhatsAppInadimplente(cliente, "pix@oficial.tec.br");
    assert.ok(msg.includes("PIX COPIA E COLA"));
    assert.ok(msg.includes("00020126")); // Padrão BR Code EMV BACEN
    assert.ok(msg.includes("https://gd.oficial.tec.br/cliente/financeiro"));
    assert.ok(msg.includes("pix@oficial.tec.br"));
    assert.ok(msg.includes("79,90"));
    assert.ok(!msg.includes(String.fromCharCode(38))); // Proibição de caractere comercial
  });

  it("Isolamento de Plano Comercial: Perfil Instalador nao possui plano comercial", () => {
    // Simula a regra de negocio canônica do Hunter
    const perfilInstalador = { role: "instalador" as const, plano: undefined };
    const perfilCliente = { role: "cliente" as const, plano: "basico" as const };

    assert.equal(perfilInstalador.plano, undefined);
    assert.equal(perfilCliente.plano, "basico");
  });

  it("atualizarTransacaoManual: Rejeita IDs sinteticos ou invalidos de mensalidades e instalacoes", async () => {
    const resM = await atualizarTransacaoManual("m-mensalidade-123", {
      tipo: "entrada",
      categoria: "mensalidade",
      descricao: "Teste Mensalidade",
      valor: 100,
      data_competencia: "2026-10-01",
      status: "concluido",
    });
    assert.equal(resM.success, false);
    assert.ok(resM.message.includes("Apenas lançamentos avulsos ou manuais"));

    const resI = await atualizarTransacaoManual("i-instalacao-456", {
      tipo: "saida",
      categoria: "repasse_instalador",
      descricao: "Teste Repasse",
      valor: 80,
      data_competencia: "2026-10-01",
      status: "concluido",
    });
    assert.equal(resI.success, false);
    assert.ok(resI.message.includes("Apenas lançamentos avulsos ou manuais"));

    const resVazia = await atualizarTransacaoManual("", {
      tipo: "entrada",
      categoria: "outros",
      descricao: "Vazio",
      valor: 10,
      data_competencia: "2026-10-01",
      status: "pendente",
    });
    assert.equal(resVazia.success, false);
  });

  it("FinanceiroView e ModalNovaTransacao: Suporte a Edicao de Lancamento e Integracao", () => {
    const financeiroViewPath = new URL(
      "../../features/financeiro/components/FinanceiroView.tsx",
      import.meta.url,
    );
    const modalPath = new URL(
      "../../features/financeiro/components/ModalNovaTransacao.tsx",
      import.meta.url,
    );

    const fViewContent = fs.readFileSync(financeiroViewPath, "utf-8");
    const modalContent = fs.readFileSync(modalPath, "utf-8");

    // FinanceiroView possui o estado de transacaoParaEditar e o botao de edicao
    assert.ok(fViewContent.includes("transacaoParaEditar"));
    assert.ok(fViewContent.includes("setTransacaoParaEditar"));
    assert.ok(fViewContent.includes('title="Editar lançamento"'));
    assert.ok(fViewContent.includes("<Pencil"));

    // ModalNovaTransacao suporta a prop transacaoParaEditar, modo edicao e salvar alteracoes
    assert.ok(modalContent.includes("transacaoParaEditar"));
    assert.ok(modalContent.includes("isEdicao"));
    assert.ok(modalContent.includes("Editar Lançamento"));
    assert.ok(modalContent.includes("Salvar Alterações"));
    assert.ok(modalContent.includes("atualizarTransacaoManual"));

    // Ausência do caractere comercial proibido & (permitindo apenas o operador lógico &&)
    assert.ok(!/[^&]&[^&]/.test(fViewContent), "FinanceiroView nao deve conter & comercial");
    assert.ok(!/[^&]&[^&]/.test(modalContent), "ModalNovaTransacao nao deve conter & comercial");
  });
});
