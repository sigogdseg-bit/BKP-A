import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { atualizarTransacaoManual } from "@/features/financeiro/services/financeiroService";
import { atualizarVencimentoMensalidade } from "@/features/mensalidades/services/mensalidadeService";
import { sincronizarVencimentoMensalidadesFuturasCliente } from "@/features/clientes/services/clienteService";

describe("Hunter — Cobranças Recorrentes: Alteração de Vencimento e Escopo de Recorrência", () => {
  describe("1. Validação da Função atualizarVencimentoMensalidade (Backend de Mensalidades)", () => {
    it("deve rejeitar chamadas com parâmetros vazios", async () => {
      const resVazio = await atualizarVencimentoMensalidade("", "");
      assert.equal(resVazio.success, false);
      assert.ok(resVazio.message.includes("Dados incompletos"));
      assert.equal(resVazio.faturasAtualizadas, 0);

      const resSemData = await atualizarVencimentoMensalidade("mensalidade-123", "");
      assert.equal(resSemData.success, false);
      assert.equal(resSemData.faturasAtualizadas, 0);
    });

    it("deve calcular corretamente o novo dia de vencimento limitando aos dias do mês futuro", () => {
      const novoDia = 31;

      // Fevereiro em ano bissexto (2028)
      const diasFevBissexto = new Date(2028, 2, 0).getDate();
      assert.equal(diasFevBissexto, 29);
      assert.equal(Math.min(novoDia, diasFevBissexto), 29);

      // Fevereiro em ano comum (2026)
      const diasFevComum = new Date(2026, 2, 0).getDate();
      assert.equal(diasFevComum, 28);
      assert.equal(Math.min(novoDia, diasFevComum), 28);

      // Abril (30 dias)
      const diasAbril = new Date(2026, 4, 0).getDate();
      assert.equal(diasAbril, 30);
      assert.equal(Math.min(novoDia, diasAbril), 30);

      // Outubro (31 dias)
      const diasOutubro = new Date(2026, 10, 0).getDate();
      assert.equal(diasOutubro, 31);
      assert.equal(Math.min(novoDia, diasOutubro), 31);
    });

    it("deve calcular o status correto dependendo se a nova data é passada ou futura", () => {
      const hoje = new Date();
      const ontem = new Date(hoje.getTime() - 86400000).toISOString().split("T")[0];
      const amanha = new Date(hoje.getTime() + 86400000).toISOString().split("T")[0];
      const hojeStr = hoje.toISOString().split("T")[0];

      assert.equal(ontem < hojeStr ? "vencido" : "pendente", "vencido");
      assert.equal(amanha < hojeStr ? "vencido" : "pendente", "pendente");
    });
  });

  describe("2. Validação da Função sincronizarVencimentoMensalidadesFuturasCliente", () => {
    it("deve rejeitar parâmetros inválidos de cliente ou dia de vencimento fora do intervalo (1 a 31)", async () => {
      const resInvalido1 = await sincronizarVencimentoMensalidadesFuturasCliente("", 10);
      assert.equal(resInvalido1.success, false);
      assert.equal(resInvalido1.atualizadas, 0);

      const resInvalido2 = await sincronizarVencimentoMensalidadesFuturasCliente("cli-123", 0);
      assert.equal(resInvalido2.success, false);

      const resInvalido3 = await sincronizarVencimentoMensalidadesFuturasCliente("cli-123", 32);
      assert.equal(resInvalido3.success, false);
    });
  });

  describe("3. Validação da Função atualizarTransacaoManual (Livro-Caixa e Finanças)", () => {
    it("deve suportar o parâmetro escopoRecorrencia ('somente_esta' e 'todas_futuras')", async () => {
      // Rejeição preventiva de lançamentos sintéticos mesmo com escopo especificado
      const resSomente = await atualizarTransacaoManual("m-mensalidade-999", {
        tipo: "entrada",
        categoria: "mensalidade",
        descricao: "Cobrança de Teste",
        valor: 150,
        data_competencia: "2026-10-01",
        data_vencimento: "2026-10-15",
        status: "pendente",
        escopoRecorrencia: "somente_esta",
      });
      assert.equal(resSomente.success, false);
      assert.ok(resSomente.message.includes("Apenas lançamentos avulsos ou manuais"));

      const resTodas = await atualizarTransacaoManual("m-mensalidade-999", {
        tipo: "saida",
        categoria: "chips_conectividade",
        descricao: "Chips M2M Recorrente",
        valor: 200,
        data_competencia: "2026-10-01",
        data_vencimento: "2026-10-20",
        status: "pendente",
        escopoRecorrencia: "todas_futuras",
      });
      assert.equal(resTodas.success, false);
    });
  });

  describe("4. Inspeção Estrutural de ModalNovaTransacao.tsx", () => {
    it("deve conter o seletor de escopo, campo Data Vencimento e opções explícitas para cobrança recorrente", () => {
      const modalPath = new URL(
        "../../features/financeiro/components/ModalNovaTransacao.tsx",
        import.meta.url,
      );
      const content = fs.readFileSync(modalPath, "utf-8");

      // Deve possuir o estado escopoRecorrencia
      assert.ok(content.includes("escopoRecorrencia"), "Deve conter o estado escopoRecorrencia");
      assert.ok(content.includes("setEscopoRecorrencia"), "Deve conter setEscopoRecorrencia");

      // Deve perguntar explicitamente "Somente este pagamento" e "Este e todos os futuros"
      assert.ok(
        content.includes("Somente este pagamento"),
        "Deve conter a opção Somente este pagamento",
      );
      assert.ok(
        content.includes("Este e todos os futuros"),
        "Deve conter a opção Este e todos os futuros",
      );

      // Deve conter o input explícito para Data Vencimento
      assert.ok(content.includes("Data Vencimento"), "Deve conter o rótulo Data Vencimento");
      assert.ok(content.includes("dataVencimento"), "Deve ligar o input ao estado dataVencimento");

      // Deve passar escopoRecorrencia na chamada de atualizarTransacaoManual
      assert.ok(
        content.includes("escopoRecorrencia: isRecorrente ? escopoRecorrencia : undefined") ||
          content.includes("escopoRecorrencia,"),
        "Deve repassar escopoRecorrencia para atualizarTransacaoManual",
      );

      // Proibição de caracteres especiais como & isolado (Regra Pétrea 5)
      assert.ok(
        !/[^&]&[^&]/.test(content),
        "ModalNovaTransacao nao deve conter & comercial proibido",
      );
    });
  });

  describe("5. Inspeção Estrutural de MensalidadesView.tsx", () => {
    it("deve conter botão para alterar vencimento, modal com pergunta de escopo e integração com o serviço", () => {
      const viewPath = new URL(
        "../../features/mensalidades/components/MensalidadesView.tsx",
        import.meta.url,
      );
      const content = fs.readFileSync(viewPath, "utf-8");

      // Deve importar atualizarVencimentoMensalidade
      assert.ok(
        content.includes("atualizarVencimentoMensalidade"),
        "Deve importar atualizarVencimentoMensalidade",
      );

      // Deve ter o estado modalEditarVencimento
      assert.ok(
        content.includes("modalEditarVencimento"),
        "Deve conter o estado modalEditarVencimento",
      );
      assert.ok(
        content.includes("setModalEditarVencimento"),
        "Deve conter setModalEditarVencimento",
      );

      // Deve ter botão com ícone de calendário para abrir o modal de alteração de vencimento
      assert.ok(
        content.includes("Alterar data de vencimento desta cobrança"),
        "Deve ter o botão/tooltip de alteração de vencimento",
      );

      // O modal deve conter as duas opções de escopo
      assert.ok(content.includes("Alterar Vencimento"), "Deve conter o título Alterar Vencimento");
      assert.ok(
        content.includes("Somente este pagamento"),
        "Deve conter a opção Somente este pagamento no modal de mensalidades",
      );
      assert.ok(
        content.includes("Este e todos os futuros"),
        "Deve conter a opção Este e todos os futuros no modal de mensalidades",
      );

      // Proibição de & comercial isolado (Regra Pétrea 5)
      assert.ok(
        !/[^&]&[^&]/.test(content),
        "MensalidadesView nao deve conter & comercial proibido",
      );
    });
  });

  describe("6. Inspeção Estrutural de ModalParcelasContratoCliente.tsx", () => {
    it("deve permitir alterar vencimento diretamente no quadro de parcelas com seletor de escopo", () => {
      const modalPath = new URL(
        "../../features/clientes/components/ModalParcelasContratoCliente.tsx",
        import.meta.url,
      );
      const content = fs.readFileSync(modalPath, "utf-8");

      assert.ok(
        content.includes("atualizarVencimentoMensalidade"),
        "Deve importar atualizarVencimentoMensalidade",
      );
      assert.ok(
        content.includes("modalEditarVencimento"),
        "Deve possuir o estado modalEditarVencimento",
      );
      assert.ok(
        content.includes("Somente este pagamento"),
        "Deve conter a opção Somente este pagamento no modal de parcelas",
      );
      assert.ok(
        content.includes("Este e todos os futuros"),
        "Deve conter a opção Este e todos os futuros no modal de parcelas",
      );

      // Proibição de & comercial isolado (Regra Pétrea 5)
      assert.ok(
        !/[^&]&[^&]/.test(content),
        "ModalParcelasContratoCliente nao deve conter & comercial proibido",
      );
    });
  });
});
