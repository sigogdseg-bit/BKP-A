import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { podeAcessarModulo, podeAcessarRota } from "../../shared/lib/permissoesModulos";
import type { UserSession } from "../../features/auth/types";
import { MODULOS_DELEGAVEIS_CLIENTE } from "../../features/funcionarios/services/funcionarioService";

describe("Hunter — Perfil de Funcionário e Gestão de Funcionários do Cliente", () => {
  it("1. Deve listar módulos delegáveis válidos para o cliente selecionar", () => {
    assert.ok(MODULOS_DELEGAVEIS_CLIENTE.length > 0);
    const modulosIds = MODULOS_DELEGAVEIS_CLIENTE.map((m) => m.id);
    assert.ok(modulosIds.includes("monitor-gps"));
    assert.ok(modulosIds.includes("rotas"));
    assert.ok(modulosIds.includes("frota"));
    assert.ok(modulosIds.includes("abastecimento"));
    assert.ok(modulosIds.includes("manutencao"));
    // O módulo de gestão de funcionários NÃO deve ser delegável para o próprio funcionário gerenciar
    assert.ok(!modulosIds.includes("funcionarios"));
  });

  it("2. Cliente titular tem acesso ao módulo de Gestão de Funcionários", () => {
    const sessionCliente: UserSession = {
      userId: "user-cli-1",
      email: "cliente@teste.com",
      nome: "Cliente Titular",
      role: "cliente",
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: true,
      isInstalador: false,
      isMotorista: false,
      clienteId: "cli-uuid-123",
      modulos: [],
    };

    assert.equal(podeAcessarRota(sessionCliente, "/funcionarios"), true);
    assert.equal(podeAcessarModulo(sessionCliente, "funcionarios"), true);
  });

  it("3. Funcionário tem acesso estritamente aos módulos liberados pelo cliente", () => {
    const sessionFuncionario: UserSession = {
      userId: "user-func-1",
      email: "operador@empresa.com",
      nome: "Operador Logística",
      role: "funcionario",
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
      isFuncionario: true,
      clienteId: "cli-uuid-123",
      modulos: ["monitor-gps", "abastecimento"],
    };

    // Acessos permitidos
    assert.equal(podeAcessarRota(sessionFuncionario, "/monitor-gps"), true);
    assert.equal(podeAcessarModulo(sessionFuncionario, "monitor-gps"), true);
    assert.equal(podeAcessarRota(sessionFuncionario, "/abastecimento"), true);
    assert.equal(podeAcessarModulo(sessionFuncionario, "abastecimento"), true);
    assert.equal(podeAcessarRota(sessionFuncionario, "/inicio"), true); // Hub comum sempre liberado

    // Acessos bloqueados (não concedidos)
    assert.equal(podeAcessarRota(sessionFuncionario, "/rotas"), false);
    assert.equal(podeAcessarModulo(sessionFuncionario, "rotas"), false);
    assert.equal(podeAcessarRota(sessionFuncionario, "/manutencao"), false);
    assert.equal(podeAcessarModulo(sessionFuncionario, "manutencao"), false);
    assert.equal(podeAcessarRota(sessionFuncionario, "/financeiro"), false);
    assert.equal(podeAcessarModulo(sessionFuncionario, "financeiro"), false);
    assert.equal(podeAcessarRota(sessionFuncionario, "/usuarios"), false);
    assert.equal(podeAcessarModulo(sessionFuncionario, "usuarios"), false);
    assert.equal(podeAcessarRota(sessionFuncionario, "/funcionarios"), false);
    assert.equal(podeAcessarModulo(sessionFuncionario, "funcionarios"), false);
  });

  it("4. Motorista não tem acesso ao módulo de Gestão de Funcionários", () => {
    const sessionMotorista: UserSession = {
      userId: "user-mot-1",
      email: "motorista@empresa.com",
      nome: "Motorista Silva",
      role: "motorista",
      isSuperAdmin: false,
      isAdmin: false,
      isOperador: false,
      isCliente: false,
      isInstalador: false,
      isMotorista: true,
      modulos: [],
    };

    assert.equal(podeAcessarRota(sessionMotorista, "/funcionarios"), false);
    assert.equal(podeAcessarModulo(sessionMotorista, "funcionarios"), false);
  });

  it("5. Administrador e SuperAdmin possuem acesso irrestrito ao módulo", () => {
    const sessionAdmin: UserSession = {
      userId: "user-adm-1",
      email: "adm@teste.com",
      nome: "Administrador",
      role: "adm",
      isSuperAdmin: false,
      isAdmin: true,
      isOperador: false,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
      modulos: [],
    };

    assert.equal(podeAcessarRota(sessionAdmin, "/funcionarios"), true);
    assert.equal(podeAcessarModulo(sessionAdmin, "funcionarios"), true);

    const sessionSuperAdmin: UserSession = {
      userId: "user-super-1",
      email: "novaes@oficial.tec.br",
      nome: "SuperADM",
      role: "adm",
      isSuperAdmin: true,
      isAdmin: true,
      isOperador: false,
      isCliente: false,
      isInstalador: false,
      isMotorista: false,
      modulos: [],
    };

    assert.equal(podeAcessarRota(sessionSuperAdmin, "/funcionarios"), true);
    assert.equal(podeAcessarModulo(sessionSuperAdmin, "funcionarios"), true);
  });
});
