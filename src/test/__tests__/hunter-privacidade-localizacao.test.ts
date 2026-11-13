import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  podeAcessarLocalizacaoVeiculo,
  podeAlterarPrivacidadeVeiculo,
} from "../../features/monitor-gps/utils/privacidadeLocalizacao";
import type { UserSession } from "../../features/auth/types";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Hunter - Modo de Privacidade Canônica (Privacidade ON por Padrão)", () => {
  const mockVeiculoComPrivacidade: Partial<VeiculoGps> = {
    id: "veic-001",
    cliente_id: "cli-123",
    cliente_user_id: "user-cli-123",
    placa: "ABC1D23",
    marca_modelo: "Toyota Hilux",
    privacidade_localizacao: true,
  };

  const mockVeiculoSemPrivacidade: Partial<VeiculoGps> = {
    id: "veic-002",
    cliente_id: "cli-456",
    cliente_user_id: "user-cli-456",
    placa: "XYZ9K88",
    marca_modelo: "VW Gol",
    privacidade_localizacao: false,
  };

  const mockVeiculoPadraoIndefinido: Partial<VeiculoGps> = {
    id: "veic-003",
    cliente_id: "cli-789",
    cliente_user_id: "user-cli-789",
    placa: "HTR4G16",
    marca_modelo: "Chevrolet S10",
    privacidade_localizacao: undefined, // Deve assumir TRUE por padrão
  };

  const mockVeiculoProprioSemPrivacidade: Partial<VeiculoGps> = {
    id: "veic-004",
    cliente_id: "cli-123",
    cliente_user_id: "user-cli-123",
    placa: "ABC1D99",
    marca_modelo: "Toyota Corolla",
    privacidade_localizacao: false,
  };

  const sessionSuperAdmin: UserSession = {
    userId: "super-001",
    email: "novaes@adm.28bpm.local",
    nome: "SuperADM Novaes",
    role: "superadmin",
    isSuperAdmin: true,
    isAdmin: true,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: ["todos"],
  };

  const sessionClienteProprietario: UserSession = {
    userId: "user-cli-123",
    email: "cliente.titular@empresa.com",
    nome: "Cliente Titular",
    role: "cliente",
    clienteId: "cli-123",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: true,
    isInstalador: false,
    isMotorista: false,
    modulos: ["monitoramento"],
  };

  const sessionOutroCliente: UserSession = {
    userId: "outro-cli-999",
    email: "outro.cliente@gmail.com",
    nome: "Outro Cliente",
    role: "cliente",
    clienteId: "cli-999",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isCliente: true,
    isInstalador: false,
    isMotorista: false,
    modulos: ["monitoramento"],
  };

  const sessionOperador: UserSession = {
    userId: "op-001",
    email: "operador.central@hunter.com",
    nome: "Operador de Monitoramento",
    role: "operador",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: true,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: ["monitoramento"],
  };

  const sessionAdminGeral: UserSession = {
    userId: "adm-001",
    email: "admin.comum@hunter.com",
    nome: "Administrador Comum",
    role: "adm",
    isSuperAdmin: false,
    isAdmin: true,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: ["todos"],
  };

  it("1. Deve conceder acesso total ao SuperADM mesmo com privacidade ativada (novaes@adm e novaes@oficial.tec.br)", () => {
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionSuperAdmin, mockVeiculoComPrivacidade), true);
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionSuperAdmin, mockVeiculoPadraoIndefinido),
      true,
    );

    const sessionNovaesOficial: UserSession = {
      ...sessionSuperAdmin,
      userId: "super-002",
      email: "novaes@oficial.tec.br",
    };
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionNovaesOficial, mockVeiculoComPrivacidade),
      true,
    );
    assert.equal(
      podeAlterarPrivacidadeVeiculo(sessionNovaesOficial, mockVeiculoComPrivacidade),
      true,
    );
  });

  it("2. Deve conceder acesso ao Cliente proprietário do veículo", () => {
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionClienteProprietario, mockVeiculoComPrivacidade),
      true,
    );
  });

  it("3. Deve BLOQUEAR outro cliente de ver a localização", () => {
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionOutroCliente, mockVeiculoComPrivacidade),
      false,
    );
  });

  it("4. Deve BLOQUEAR operadores de ver a localização de veículo com privacidade ativa", () => {
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionOperador, mockVeiculoComPrivacidade), false);
    // Também deve bloquear se privacidade_localizacao for undefined (pois o padrão é ON)
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionOperador, mockVeiculoPadraoIndefinido),
      false,
    );
  });

  it("5. Deve BLOQUEAR administradores comuns de ver localização com privacidade ativa", () => {
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionAdminGeral, mockVeiculoComPrivacidade),
      false,
    );
  });

  it("6. Deve LIBERAR acesso a operadores e administradores quando privacidade_localizacao for explicitamente false", () => {
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionOperador, mockVeiculoSemPrivacidade), true);
    assert.equal(podeAcessarLocalizacaoVeiculo(sessionAdminGeral, mockVeiculoSemPrivacidade), true);
  });

  it("7. Deve PERMITIR que o SuperADM altere/desmarque a privacidade do veículo", () => {
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionSuperAdmin, mockVeiculoComPrivacidade), true);
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionSuperAdmin, mockVeiculoSemPrivacidade), true);
  });

  it("8. Deve PERMITIR que o Cliente titular do veículo marque ou desmarque a privacidade no mapa", () => {
    assert.equal(
      podeAlterarPrivacidadeVeiculo(sessionClienteProprietario, mockVeiculoComPrivacidade),
      true,
    );
    assert.equal(
      podeAlterarPrivacidadeVeiculo(sessionClienteProprietario, mockVeiculoProprioSemPrivacidade),
      true,
    );
  });

  it("9. Deve BLOQUEAR cliente de alterar a privacidade de um veículo que pertence a outro cliente", () => {
    assert.equal(
      podeAlterarPrivacidadeVeiculo(sessionClienteProprietario, mockVeiculoSemPrivacidade),
      false,
    );
    assert.equal(
      podeAlterarPrivacidadeVeiculo(sessionOutroCliente, mockVeiculoComPrivacidade),
      false,
    );
  });

  it("10. Deve BLOQUEAR operadores e administradores comuns de desmarcar ou alterar a privacidade", () => {
    assert.equal(podeAlterarPrivacidadeVeiculo(sessionOperador, mockVeiculoComPrivacidade), false);
    assert.equal(
      podeAlterarPrivacidadeVeiculo(sessionAdminGeral, mockVeiculoComPrivacidade),
      false,
    );
  });

  it("11. Deve PERMITIR que motorista autorizado vinculado ao cliente visualize veículo com privacidade ativa", () => {
    const sessionMotoristaAutorizado: UserSession = {
      userId: "mot-001",
      email: "mot@dario.local",
      nome: "Motorista Autorizado",
      role: "motorista",
      clienteId: "cli-123",
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: false,
      isInstalador: false,
      isMotorista: true,
      modulos: [],
    };
    const sessionMotoristaOutroCliente: UserSession = {
      ...sessionMotoristaAutorizado,
      userId: "mot-999",
      clienteId: "cli-999",
    };

    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionMotoristaAutorizado, mockVeiculoComPrivacidade),
      true,
    );
    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessionMotoristaOutroCliente, mockVeiculoComPrivacidade),
      false,
    );
  });
});
