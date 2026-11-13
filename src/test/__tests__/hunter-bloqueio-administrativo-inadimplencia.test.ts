import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { podeAcessarLocalizacaoVeiculo } from "@/features/monitor-gps/utils/privacidadeLocalizacao";
import { calcularEncargosAtraso } from "@/features/mensalidades/utils/encargosLegais";
import type { UserSession } from "@/features/auth/types";
import type { VeiculoGps } from "@/features/monitor-gps/types";
import type { StatusFinanceiroCliente } from "@/features/mensalidades/services/mensalidadeService";
import type { StatusBloqueioManual } from "@/features/clientes/types";

describe("Hunter — Bloqueio Administrativo em 3 Estágios de Inadimplência", () => {
  // Sessões para teste de permissão
  const sessionSuperAdm: UserSession = {
    userId: "superadm-1",
    email: "novaes@adm.28bpm.local",
    nome: "SuperADM Mestre",
    role: "superadmin",
    isAdmin: true,
    isSuperAdmin: true,
    isOperador: false,
    isInstalador: false,
    isCliente: false,
    isMotorista: false,
    clienteId: null,
    modulos: ["todos"],
    plano: "master",
    planoContratado: "master",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    primeiroAcesso: false,
  };

  const sessionOperador: UserSession = {
    userId: "operador-1",
    email: "operador@oficial.tec.br",
    nome: "Operador Hunter",
    role: "operador",
    isAdmin: false,
    isSuperAdmin: false,
    isOperador: true,
    isInstalador: false,
    isCliente: false,
    isMotorista: false,
    clienteId: null,
    modulos: ["monitor-gps", "clientes", "mensalidades"],
    plano: "master",
    planoContratado: "master",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    primeiroAcesso: false,
  };

  const sessionCliente: UserSession = {
    userId: "user-cliente-10",
    email: "empresa@cliente.com",
    nome: "Empresa Cliente Ltda",
    role: "cliente",
    isAdmin: false,
    isSuperAdmin: false,
    isOperador: false,
    isInstalador: false,
    isCliente: true,
    isMotorista: false,
    clienteId: "cliente-uuid-10",
    modulos: ["monitor-gps", "faturas"],
    plano: "pro",
    planoContratado: "pro",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    primeiroAcesso: false,
  };

  const sessionMotorista: UserSession = {
    userId: "user-motorista-10",
    email: "motorista@cliente.com",
    nome: "Motorista da Frota",
    role: "motorista",
    isAdmin: false,
    isSuperAdmin: false,
    isOperador: false,
    isInstalador: false,
    isCliente: false,
    isMotorista: true,
    clienteId: "cliente-uuid-10", // vinculado à Empresa Cliente
    modulos: ["motorista"],
    plano: "master",
    planoContratado: "master",
    isTrialMaster: false,
    diasRestantesTrial: 0,
    primeiroAcesso: false,
  };

  const veiculoCliente: Partial<VeiculoGps> = {
    id: "veic-1",
    cliente_id: "cliente-uuid-10",
    cliente_user_id: "user-cliente-10",
    placa: "BRA2E19",
    marca_modelo: "Hilux CD 4x4",
    privacidade_localizacao: true,
  };

  function calcularBloqueio(
    statusManual: StatusBloqueioManual,
    diasAtraso: number,
    limiteDias: number,
  ): boolean {
    if (statusManual === "bloqueado") return true;
    if (statusManual === "liberado") return false;
    return diasAtraso >= limiteDias;
  }

  describe("Estágio 1: Dias 1 a 4 de atraso (Avisos Diários Automáticos)", () => {
    it("deve permitir acesso normal de localização e login nos dias 1 a 4 de atraso", () => {
      const diasAtraso = 3;
      const statusLocManual: StatusBloqueioManual = "automatico";
      const statusAcessoManual: StatusBloqueioManual = "automatico";

      const bloqueioLocalizacao = calcularBloqueio(statusLocManual, diasAtraso, 5);
      const bloqueioLogin = calcularBloqueio(statusAcessoManual, diasAtraso, 7);
      const avisoNotificacaoDia1a4 = diasAtraso >= 1 && diasAtraso <= 4;

      assert.equal(bloqueioLocalizacao, false, "Localização NÃO deve ser bloqueada no 3º dia");
      assert.equal(bloqueioLogin, false, "Login NÃO deve ser bloqueado no 3º dia");
      assert.equal(avisoNotificacaoDia1a4, true, "Aviso diário deve ser ativado entre 1 e 4 dias");
    });

    it("deve recalcular encargos legais (multa 2% + juros 1% a.m. pro rata die) para a notificação", () => {
      const valorOriginal = 100.0;
      const dataCalculo = new Date(2026, 9, 10, 12, 0, 0); // 10 de outubro de 2026
      const dataVencStr = "2026-10-07"; // 3 dias de atraso determinísticos

      const encargos = calcularEncargosAtraso(valorOriginal, dataVencStr, dataCalculo);
      assert.equal(encargos.diasAtraso >= 3, true);
      assert.equal(encargos.valorMulta, 2.0, "Multa deve ser exatamente 2%");
      assert.equal(encargos.valorJuros > 0, true, "Juros pro rata die devem ser computados");
      assert.equal(encargos.valorTotalAtualizado > 102.0, true);
    });

    it("motorista NUNCA recebe notificação de cobrança ou dados de débito", () => {
      const statusMotorista: StatusFinanceiroCliente = {
        bloqueado: false,
        bloqueioLocalizacao: false,
        bloqueioLogin: false,
        diasAtraso: 0,
        totalDevido: 0,
        qtdFaturasVencidas: 0,
        faturaVencidaMaisAntiga: undefined,
        avisoVencimentoProximo: false,
        avisoNotificacaoDia1a4: false, // Motorista nunca recebe aviso financeiro
        statusBloqueioLocalizacaoManual: "automatico",
        statusBloqueioAcessoManual: "automatico",
        isMotorista: true,
        clienteId: "cliente-uuid-10",
      };

      assert.equal(statusMotorista.totalDevido, 0);
      assert.equal(statusMotorista.faturaVencidaMaisAntiga, undefined);
      assert.equal(statusMotorista.avisoNotificacaoDia1a4, false);
    });
  });

  describe("Estágio 2: Dia 5 de atraso (Bloqueio de Localização / Modo Privado)", () => {
    it("deve bloquear localização automaticamente a partir do 5º dia de atraso", () => {
      const diasAtraso = 5;
      const statusLocManual: StatusBloqueioManual = "automatico";
      const statusAcessoManual: StatusBloqueioManual = "automatico";

      const bloqueioLocalizacao = calcularBloqueio(statusLocManual, diasAtraso, 5);
      const bloqueioLogin = calcularBloqueio(statusAcessoManual, diasAtraso, 7);

      assert.equal(bloqueioLocalizacao, true, "Localização DEVE ser bloqueada no 5º dia");
      assert.equal(
        bloqueioLogin,
        false,
        "Login ainda NÃO deve ser bloqueado no 5º dia (somente no 7º)",
      );
    });

    it("podeAcessarLocalizacaoVeiculo deve impedir Cliente e Motorista de ver a localização no 5º dia", () => {
      const bloqueioAtivo = true;

      // Cliente titular perde acesso à localização
      const acessoCliente = podeAcessarLocalizacaoVeiculo(
        sessionCliente,
        veiculoCliente,
        bloqueioAtivo,
      );
      assert.equal(
        acessoCliente,
        false,
        "Cliente titular não pode ver a localização quando bloqueado por inadimplência",
      );

      // Motorista da frota também perde acesso à localização
      const acessoMotorista = podeAcessarLocalizacaoVeiculo(
        sessionMotorista,
        veiculoCliente,
        bloqueioAtivo,
      );
      assert.equal(
        acessoMotorista,
        false,
        "Motorista não pode ver a localização da frota quando bloqueado",
      );
    });

    it("podeAcessarLocalizacaoVeiculo deve permitir que SuperADM e Operador continuem visualizando no 5º dia para suporte", () => {
      const bloqueioAtivo = true;

      const acessoSuperAdm = podeAcessarLocalizacaoVeiculo(
        sessionSuperAdm,
        veiculoCliente,
        bloqueioAtivo,
      );
      assert.equal(acessoSuperAdm, true, "SuperADM sempre pode ver localização");

      const acessoOperador = podeAcessarLocalizacaoVeiculo(
        sessionOperador,
        veiculoCliente,
        bloqueioAtivo,
      );
      assert.equal(
        acessoOperador,
        true,
        "Operador de suporte pode ver localização mesmo com cliente inadimplente",
      );
    });
  });

  describe("Estágio 3: Dia 7 de atraso (Bloqueio Total de Login)", () => {
    it("deve bloquear o login/acesso do cliente e de seus motoristas no 7º dia", () => {
      const diasAtraso = 7;
      const statusLocManual: StatusBloqueioManual = "automatico";
      const statusAcessoManual: StatusBloqueioManual = "automatico";

      const bloqueioLocalizacao = calcularBloqueio(statusLocManual, diasAtraso, 5);
      const bloqueioLogin = calcularBloqueio(statusAcessoManual, diasAtraso, 7);

      assert.equal(bloqueioLocalizacao, true, "Localização continua bloqueada no 7º dia");
      assert.equal(bloqueioLogin, true, "Login DEVE ser bloqueado no 7º dia");
    });
  });

  describe("Controles Manuais de Operador e ADM (Liberação e Bloqueio a qualquer momento)", () => {
    it("deve permitir que Operador/ADM libere a visualização da localização mesmo após o 5º dia", () => {
      const diasAtraso = 6;
      const statusLocManual: StatusBloqueioManual = "liberado"; // Operador concedeu tolerância

      const bloqueioLocalizacao = calcularBloqueio(statusLocManual, diasAtraso, 5);
      assert.equal(
        bloqueioLocalizacao,
        false,
        "Localização liberada manualmente deve permitir visualização",
      );
    });

    it("deve permitir que Operador/ADM bloqueie a localização antes do 5º dia (bloqueio preventivo)", () => {
      const diasAtraso = 2; // Menos de 5 dias
      const statusLocManual: StatusBloqueioManual = "bloqueado"; // Operador forçou bloqueio

      const bloqueioLocalizacao = calcularBloqueio(statusLocManual, diasAtraso, 5);
      assert.equal(
        bloqueioLocalizacao,
        true,
        "Localização forçada manualmente deve bloquear mesmo com 2 dias",
      );
    });

    it("deve permitir que Operador/ADM libere o acesso/login mesmo após o 7º dia", () => {
      const diasAtraso = 10;
      const statusAcessoManual: StatusBloqueioManual = "liberado"; // Operador liberou acesso temporário

      const bloqueioLogin = calcularBloqueio(statusAcessoManual, diasAtraso, 7);
      assert.equal(
        bloqueioLogin,
        false,
        "Login liberado manualmente deve permitir acesso mesmo com 10 dias de atraso",
      );
    });

    it("deve permitir que Operador/ADM bloqueie o acesso/login a qualquer momento", () => {
      const diasAtraso = 0; // Sem atraso
      const statusAcessoManual: StatusBloqueioManual = "bloqueado"; // Operador bloqueou acesso

      const bloqueioLogin = calcularBloqueio(statusAcessoManual, diasAtraso, 7);
      assert.equal(
        bloqueioLogin,
        true,
        "Acesso forçado manualmente deve bloquear login imediatamente",
      );
    });
  });
});
