// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Testes de Visibilidade Financeira e Layout do Cabeçalho (v1.10.0.1)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolverStatusFinanceiroCardCliente,
  type StatusFinanceiroCliente,
} from "../../features/mensalidades/services/mensalidadeService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function criarStatusBase(
  overrides: Partial<StatusFinanceiroCliente> = {},
): StatusFinanceiroCliente {
  return {
    bloqueado: false,
    bloqueioLocalizacao: false,
    bloqueioLogin: false,
    diasAtraso: 0,
    totalDevido: 0,
    qtdFaturasVencidas: 0,
    avisoVencimentoProximo: false,
    avisoNotificacaoDia1a4: false,
    statusBloqueioLocalizacaoManual: "automatico",
    statusBloqueioAcessoManual: "automatico",
    isMotorista: false,
    clienteId: "cli-teste",
    clienteStatus: "ativo",
    ...overrides,
  };
}

describe("Hunter — Regra Pétrea: Ocultação de Faturado/Pago/A Vencer para Clientes, Status Financeiro e Header Sem Truncamento", () => {
  it("1. MensalidadesView: 'Total Faturado', 'Recebido (Pago)' e 'A Vencer (Pendente)' não são exibidos para o cliente; cliente vê 'Status Financeiro'", () => {
    const filePath = path.resolve(
      __dirname,
      "../../features/mensalidades/components/MensalidadesView.tsx",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Deve checar session?.isCliente para ocultar os cards contábeis
    assert.ok(
      content.includes("!session?.isCliente"),
      "MensalidadesView deve conter a trava !session?.isCliente para os cards",
    );

    // Ocultos estritamente para o perfil Cliente
    assert.ok(
      content.includes("Ocultos estritamente para o perfil Cliente"),
      "Deve haver comentário indicando a regra de negócio",
    );

    // O card A Vencer (Pendente) deve estar antes do fechamento de {!session?.isCliente && (...)}
    const blocoAdminInicio = content.indexOf("{!session?.isCliente && (");
    const cardAVencerPos = content.indexOf("A Vencer (Pendente)");
    const cardStatusFinanceiroPos = content.indexOf("Status Financeiro");
    assert.ok(blocoAdminInicio !== -1, "Deve existir bloco !session?.isCliente");
    assert.ok(
      cardAVencerPos > blocoAdminInicio && cardAVencerPos < cardStatusFinanceiroPos,
      "A Vencer (Pendente) deve permanecer restrito ao bloco !session?.isCliente",
    );
    assert.ok(
      content.includes("resolverStatusFinanceiroCardCliente"),
      "MensalidadesView deve usar resolverStatusFinanceiroCardCliente para exibir Status Financeiro ao cliente",
    );
  });

  it("2. AppHeader: Versão posicionada abaixo do nome sem truncamento no mobile", () => {
    const filePath = path.resolve(__dirname, "../../features/layout/components/AppHeader.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Deve empilhar nome e versão verticalmente (flex flex-col)
    assert.ok(
      content.includes("flex flex-col justify-center"),
      "AppHeader deve conter container flex-col para empilhar nome e versão",
    );
    assert.ok(
      content.includes("whitespace-nowrap leading-tight"),
      "AppHeader deve usar whitespace-nowrap no título para evitar corte no mobile",
    );
  });

  it("3. resolverStatusFinanceiroCardCliente: retorna 'Em dia' quando não há faturas vencidas nem bloqueio", () => {
    const res = resolverStatusFinanceiroCardCliente({
      statusFinanceiro: criarStatusBase(),
      qtdVencido: 0,
    });
    assert.equal(res.situacao, "em_dia");
    assert.equal(res.label, "Em dia");
    assert.equal(res.descricao, "Nenhuma fatura em atraso");
  });

  it("4. resolverStatusFinanceiroCardCliente: retorna 'Atrasado' quando há fatura vencida sem bloqueio ativo", () => {
    const res = resolverStatusFinanceiroCardCliente({
      statusFinanceiro: criarStatusBase({
        diasAtraso: 3,
        qtdFaturasVencidas: 1,
      }),
      qtdVencido: 1,
    });
    assert.equal(res.situacao, "atrasado");
    assert.equal(res.label, "Atrasado");
    assert.equal(res.descricao, "1 fatura vencida em aberto");
  });

  it("5. resolverStatusFinanceiroCardCliente: retorna 'Bloqueado' por atraso automático (5+ dias) ou bloqueio administrativo", () => {
    const resAuto = resolverStatusFinanceiroCardCliente({
      statusFinanceiro: criarStatusBase({
        bloqueioLocalizacao: true,
        diasAtraso: 6,
        qtdFaturasVencidas: 2,
      }),
      qtdVencido: 2,
    });
    assert.equal(resAuto.situacao, "bloqueado");
    assert.equal(resAuto.label, "Bloqueado");
    assert.ok(resAuto.descricao.includes("6 dia(s) de atraso"));

    const resManual = resolverStatusFinanceiroCardCliente({
      statusFinanceiro: criarStatusBase({
        bloqueioLogin: true,
        bloqueado: true,
        statusBloqueioAcessoManual: "bloqueado",
      }),
      qtdVencido: 0,
    });
    assert.equal(resManual.situacao, "bloqueado");
    assert.equal(resManual.label, "Bloqueado");
    assert.equal(resManual.descricao, "Bloqueio administrativo ativo");

    const resCadastro = resolverStatusFinanceiroCardCliente({
      statusFinanceiro: criarStatusBase({
        clienteStatus: "bloqueado",
      }),
      qtdVencido: 0,
    });
    assert.equal(resCadastro.situacao, "bloqueado");
    assert.equal(resCadastro.label, "Bloqueado");
  });
});
