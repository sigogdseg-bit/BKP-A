import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  podeAcessarModulo,
  podeAcessarRota,
  MODULOS_PADRAO_FINANCEIRO,
} from "../../shared/lib/permissoesModulos";
import {
  obterModulosPadraoPorPerfil,
  MODULOS_SISTEMA,
} from "../../features/seguranca/services/usuarioService";
import type { UserSession } from "../../features/auth/types";
import type { HunterRole } from "../../integrations/supabase/types";

describe("Hunter — Perfil Financeiro Canônico e Isolamento Estrito (DJR-NEW)", () => {
  const sessaoFinanceiro: UserSession = {
    userId: "usr-fin-001",
    email: "financeiro@gdseguranca.com.br",
    nome: "Gestor Financeiro",
    role: "financeiro" as HunterRole,
    modulos: [...MODULOS_PADRAO_FINANCEIRO],
    isSuperAdmin: false,
    isSuperAdminAuditor: false,
    isAuditor: false,
    isReadOnly: false,
    isDegustacao: false,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    isFuncionario: false,
    isFinanceiro: true,
    isRevendedor: false,
    isVendedor: false,
  };

  it("1. Garante que o enum HunterRole suporta 'financeiro'", () => {
    const role: HunterRole = "financeiro";
    assert.equal(role, "financeiro");
  });

  it("2. Valida que a migration de criação no banco contém enum, RLS e RPCs atualizadas", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261115210000_hunter_perfil_financeiro.sql",
    );
    assert.equal(fs.existsSync(migrationPath), true);

    const conteudo = fs.readFileSync(migrationPath, "utf-8");
    assert.ok(conteudo.includes("ADD VALUE IF NOT EXISTS 'financeiro'"));
    assert.ok(conteudo.includes("is_financeiro"));
    assert.ok(conteudo.includes("admin_cadastrar_usuario"));
    assert.ok(conteudo.includes("admin_atualizar_usuario"));
    assert.ok(conteudo.includes("mensalidades"));
    assert.ok(conteudo.includes("propostas_comerciais"));
  });

  it("3. Valida que o schema consolidado mestre contém o perfil financeiro e o módulo de abastecimento", () => {
    const schemaMestrePath = path.resolve(
      process.cwd(),
      "supabase/CRIAR_BANCO_COMPLETO_NOVO_SUPABASE.sql",
    );
    const conteudo = fs.readFileSync(schemaMestrePath, "utf-8");
    assert.ok(conteudo.includes("ADD VALUE IF NOT EXISTS 'financeiro'"));
    assert.ok(conteudo.includes("is_financeiro"));
    assert.ok(conteudo.includes("financeiro_gerencia_abastecimentos"));
  });

  it("4. Verifica os módulos autorizados para o Perfil Financeiro (incluindo abastecimento e notas fiscais)", () => {
    const modulosLiberados = [
      "financeiro",
      "mensalidades",
      "propostas",
      "clientes",
      "revendedores",
      "instalacao",
      "abastecimento",
      "chat",
      "atendimento",
      "configuracoes",
      "temas",
    ];

    for (const mod of modulosLiberados) {
      assert.equal(
        podeAcessarModulo(sessaoFinanceiro, mod),
        true,
        `Módulo financeiro ${mod} deveria estar liberado`,
      );
    }
  });

  it("5. Bloqueia estritamente módulos operacionais, de rastreamento, estoque e segurança para o Financeiro", () => {
    const modulosBloqueados = [
      "monitor-gps",
      "rotas",
      "frota",
      "manutencao",
      "motoristas",
      "funcionarios",
      "estoque",
      "rastreadores",
      "usuarios",
      "central-seguranca",
      "dispositivos",
      "logs",
      "demonstracao",
    ];

    for (const mod of modulosBloqueados) {
      assert.equal(
        podeAcessarModulo(sessaoFinanceiro, mod),
        false,
        `Módulo ${mod} deveria estar bloqueado para financeiro`,
      );
    }
  });

  it("6. Valida acesso a rotas permitidas para o Perfil Financeiro (incluindo /abastecimento)", () => {
    const rotasPermitidas = [
      "/inicio",
      "",
      "/financeiro",
      "/mensalidades",
      "/propostas",
      "/clientes",
      "/revendedores",
      "/instalacao",
      "/abastecimento",
      "/motorista",
      "/atendimento",
      "/chat",
      "/configuracoes",
      "/configuracao/temas",
    ];

    for (const rota of rotasPermitidas) {
      assert.equal(
        podeAcessarRota(sessaoFinanceiro, rota),
        true,
        `Rota ${rota} deveria estar liberada para financeiro`,
      );
    }
  });

  it("7. Bloqueia estritamente rotas de telemetria GPS, comandos de bloqueio, gestão de acessos e hardware", () => {
    const rotasBloqueadas = [
      "/monitor-gps",
      "/rotas",
      "/frota",
      "/manutencao",
      "/motoristas",
      "/funcionarios",
      "/estoque",
      "/usuarios",
      "/dispositivos",
      "/configuracao/central-seguranca",
      "/configuracao/rastreador-j16",
      "/configuracao/logs",
      "/minha-franquia",
      "/minhas-vendas",
      "/onboarding/acompanhamento",
      "/demonstracao",
    ];

    for (const rota of rotasBloqueadas) {
      assert.equal(
        podeAcessarRota(sessaoFinanceiro, rota),
        false,
        `Rota ${rota} deveria estar bloqueada para financeiro`,
      );
    }
  });

  it("8. Garante que obterModulosPadraoPorPerfil retorna a lista canônica com 'abastecimento' para 'financeiro'", () => {
    const modulosPadrao = obterModulosPadraoPorPerfil("financeiro");
    assert.deepEqual(modulosPadrao, MODULOS_PADRAO_FINANCEIRO);
    assert.ok(modulosPadrao.includes("financeiro"));
    assert.ok(modulosPadrao.includes("mensalidades"));
    assert.ok(modulosPadrao.includes("propostas"));
    assert.ok(modulosPadrao.includes("clientes"));
    assert.ok(modulosPadrao.includes("revendedores"));
    assert.ok(modulosPadrao.includes("instalacao"));
    assert.ok(modulosPadrao.includes("abastecimento"));
    assert.ok(!modulosPadrao.includes("monitor-gps"));
    assert.ok(!modulosPadrao.includes("usuarios"));
    assert.ok(!modulosPadrao.includes("central-seguranca"));
  });

  it("9. Garante que sessao com role 'financeiro' não possui privilégios de Admin ou Operador", () => {
    assert.equal(sessaoFinanceiro.isAdmin, false);
    assert.equal(sessaoFinanceiro.isOperador, false);
    assert.equal(sessaoFinanceiro.isSuperAdmin, false);
    assert.equal(sessaoFinanceiro.isFinanceiro, true);
  });

  it("10. Valida que a migration de abastecimento para o perfil financeiro existe e possui RLS", () => {
    const migPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261115220000_hunter_perfil_financeiro_abastecimento.sql",
    );
    assert.equal(fs.existsSync(migPath), true);
    const content = fs.readFileSync(migPath, "utf-8");
    assert.ok(content.includes("financeiro_gerencia_abastecimentos"));
    assert.ok(content.includes("financeiro_gerencia_despesas"));
    assert.ok(content.includes("'abastecimento'"));
  });
});
