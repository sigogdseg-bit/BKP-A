import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { obterRecursosPorPlano } from "../utils/planPermissions";
import type { UserSession } from "@/features/auth/types";

describe("Hunter — Telemetria Avançada, Modo 3D e Planos Comerciais", () => {
  test("Plano Básico possui acesso estritamente a 2D e histórico de 7 dias", () => {
    const sessionClienteBasico: UserSession = {
      userId: "user-1",
      email: "cliente1@teste.com",
      nome: "Cliente Básico",
      role: "cliente",
      plano: "basico",
      modulos: ["gps"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
    };

    const recursos = obterRecursosPorPlano(sessionClienteBasico);
    assert.equal(recursos.modo3D, false, "Plano básico não deve ter acesso ao Modo 3D");
    assert.equal(recursos.refazerTrajeto, false, "Plano básico não deve acessar refazer trajeto");
    assert.equal(
      recursos.telemetriaEletrica,
      false,
      "Plano básico não deve acessar telemetria elétrica",
    );
    assert.equal(recursos.rumoESatelites, false, "Plano básico não deve acessar satélites e rumo");
    assert.equal(
      recursos.alertasAcidente,
      false,
      "Plano básico não deve acessar alertas de sensores",
    );
    assert.equal(recursos.montarRota, false, "Plano básico não deve ter acesso a Montar Rota");
    assert.equal(
      recursos.compartilharLocalizacao,
      false,
      "Plano básico não deve acessar compartilhamento de localização",
    );
    assert.equal(recursos.diasHistorico, 10, "Plano básico deve ter histórico interno de 10 dias");
  });

  test("Plano Pro possui acesso a Modo 3D, Viagens e Refazer Trajeto com 20 dias", () => {
    const sessionClientePro: UserSession = {
      userId: "user-2",
      email: "pro@teste.com",
      nome: "Cliente Pro",
      role: "cliente",
      plano: "pro",
      modulos: ["gps"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
    };

    const recursos = obterRecursosPorPlano(sessionClientePro);
    assert.equal(recursos.modo3D, true, "Plano Pro deve ter acesso ao Modo 3D");
    assert.equal(recursos.refazerTrajeto, true, "Plano Pro deve acessar refazer trajeto");
    assert.equal(recursos.viagensConsolidadas, true, "Plano Pro deve acessar viagens");
    assert.equal(recursos.montarRota, true, "Plano Pro deve ter acesso a Montar Rota");
    assert.equal(
      recursos.compartilharLocalizacao,
      true,
      "Plano Pro deve ter acesso a Compartilhamento",
    );
    assert.equal(recursos.alertasAcidente, false, "Plano Pro não acessa sensores de acidente");
    assert.equal(recursos.diasHistorico, 20, "Plano Pro deve ter histórico de 20 dias");
  });

  test("Plano Master possui acesso pleno a Sensores Físicos, Montar Rota e Alertas", () => {
    const sessionClienteMaster: UserSession = {
      userId: "user-3",
      email: "master@teste.com",
      nome: "Cliente Master",
      role: "cliente",
      plano: "master",
      planoContratado: "master",
      isTrialMaster: false,
      modulos: ["gps"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
    };

    const recursos = obterRecursosPorPlano(sessionClienteMaster);
    assert.equal(recursos.modo3D, true, "Plano Master deve ter Modo 3D");
    assert.equal(recursos.montarRota, true, "Plano Master deve ter acesso exclusivo a Montar Rota");
    assert.equal(recursos.sensoresFisicos, true, "Plano Master deve ter sensores físicos");
    assert.equal(recursos.alertasAcidente, true, "Plano Master deve ter alertas de acidente");
    assert.equal(recursos.diasHistorico, 35, "Plano Master deve ter 35 dias");
  });

  test("Cliente Novo no Trial Master de 30 dias possui acesso total a Montar Rota mesmo com plano basico contratado", () => {
    const sessionClienteNovoTrial: UserSession = {
      userId: "user-novo",
      email: "novocliente@teste.com",
      nome: "Novo Cliente Hunter",
      role: "cliente",
      plano: "basico",
      planoContratado: "basico",
      isTrialMaster: true,
      diasRestantesTrial: 28,
      modulos: ["gps"],
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
    };

    const recursos = obterRecursosPorPlano(sessionClienteNovoTrial);
    assert.equal(
      recursos.montarRota,
      true,
      "Cliente novo no trial de 30 dias deve ter Montar Rota liberado",
    );
    assert.equal(
      recursos.modo3D,
      true,
      "Cliente novo no trial de 30 dias deve ter Modo 3D liberado",
    );
    assert.equal(
      recursos.sensoresFisicos,
      true,
      "Cliente novo no trial de 30 dias deve ter sensores liberados",
    );
  });

  test("SuperAdmin e Operadores possuem visão irrestrita a todos os recursos incluindo Montar Rota", () => {
    const sessionAdmin: UserSession = {
      userId: "admin-master",
      email: "novaes@adm.28bpm.local",
      nome: "SuperADM",
      role: "superadmin",
      modulos: ["*"],
      isSuperAdmin: true,
      isAdmin: true,
      isOperador: false,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
    };

    const recursos = obterRecursosPorPlano(sessionAdmin);
    assert.equal(recursos.modo3D, true);
    assert.equal(recursos.refazerTrajeto, true);
    assert.equal(recursos.montarRota, true, "SuperADM deve ter Montar Rota liberado");
    assert.equal(recursos.alertasAcidente, true);
    assert.equal(recursos.sensoresFisicos, true);
    assert.equal(recursos.diasHistorico, 35);
  });
});
