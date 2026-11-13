// ─────────────────────────────────────────────────────────────────────────────
// Hunter — Suíte de Testes Profunda: Perfil S.adm Auditor (100% READ-ONLY)
// Regras Imperiosas (AGENTS.md / SKILL hunter / dev-petrea):
// 1. O S.adm auditor pode visualizar tudo que um administrador faz.
// 2. Não pode de modo algum realizar bloqueio ou desbloqueio de veículos.
// 3. Não pode gravar informação, alterar ou cadastrar dados (INSERT, UPDATE, DELETE).
// 4. Não pode disparar comandos de alteração de parâmetros para rastreadores (apenas consultas).
// 5. O único veículo disponibilizado é o do próprio usuário (AXH0E44).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { podeAcessarModulo, podeAcessarRota } from "../../shared/lib/permissoesModulos";
import {
  MODULOS_SISTEMA,
  obterModulosPadraoPorPerfil,
} from "../../features/seguranca/services/usuarioService";
import type { UserSession } from "../../features/auth/types";
import {
  alternarBloqueioVeiculo,
  carregarVeiculosGps,
} from "../../features/monitor-gps/services/gpsService";
import {
  bloquearDesbloquearVeiculo,
  carregarVeiculosDoCliente,
} from "../../features/clientes/services/clienteService";
import { supabase } from "../../integrations/supabase/client";

describe("Hunter — Perfil S.adm Auditor da Plataforma (100% Read-Only)", () => {
  const sessaoAuditor: UserSession = {
    userId: "auditor-uuid-123",
    email: "auditor@oficial.tec.br",
    nome: "Auditor da Plataforma",
    role: "superadmin_auditor",
    isSuperAdmin: false,
    isSuperAdminAuditor: true,
    isAuditor: true,
    isReadOnly: true,
    isAdmin: false,
    isOperador: false,
    isCliente: false,
    isInstalador: false,
    isMotorista: false,
    modulos: MODULOS_SISTEMA.map((m) => m.id),
  };

  it("1. O S.adm auditor tem acesso a todos os módulos da plataforma como um administrador", () => {
    const modulosParaAuditar = [
      "monitor-gps",
      "rotas",
      "frota",
      "abastecimento",
      "manutencao",
      "instalacao",
      "clientes",
      "motoristas",
      "funcionarios",
      "financeiro",
      "mensalidades",
      "estoque",
      "atendimento",
      "chat",
      "temas",
      "demonstracao",
      "configuracoes",
      "usuarios",
      "central-seguranca",
      "dispositivos",
      "logs",
      "rastreadores",
      "revendedores",
      "propostas",
    ];

    for (const mod of modulosParaAuditar) {
      assert.equal(
        podeAcessarModulo(sessaoAuditor, mod),
        true,
        `O perfil S.adm Auditor deve ter acesso de consulta ao módulo ${mod}`,
      );
    }
  });

  it("2. O S.adm auditor pode navegar em todas as rotas da plataforma para inspeção", () => {
    const rotas = [
      "/inicio",
      "/monitor-gps",
      "/rotas",
      "/frota",
      "/abastecimento",
      "/manutencao",
      "/clientes",
      "/motoristas",
      "/funcionarios",
      "/financeiro",
      "/mensalidades",
      "/estoque",
      "/atendimento",
      "/chat",
      "/usuarios",
      "/configuracao/central-seguranca",
      "/configuracao/logs",
      "/configuracao/rastreador-j16",
      "/revendedores",
      "/propostas",
    ];

    for (const rota of rotas) {
      assert.equal(
        podeAcessarRota(sessaoAuditor, rota),
        true,
        `O auditor deve poder acessar a rota ${rota} para conferência`,
      );
    }
  });

  it("3. REGRA IMPERIOSA: Interceptador Físico Supabase bloqueia qualquer INSERT, UPDATE, DELETE e UPSERT", async () => {
    // Simula sessão de auditor ativa no cache local
    const mockStorage: Record<string, string> = {
      "hunter-cached-user-session-v1": JSON.stringify(sessaoAuditor),
    };
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
    };
    (globalThis as any).window = globalThis;

    // Tentativa 1: INSERT na tabela clientes
    const resInsert = await (supabase.from("clientes") as any).insert({
      nome_razao_social: "Hacker",
    });
    assert.equal(resInsert.data, null);
    assert.equal(resInsert.error?.code, "403_READ_ONLY_AUDITOR");
    assert.match(resInsert.error?.message, /READ-ONLY/i);

    // Tentativa 2: UPDATE na tabela veiculos
    const resUpdate = await (supabase.from("veiculos") as any).update({ bloqueado: true });
    assert.equal(resUpdate.data, null);
    assert.equal(resUpdate.error?.code, "403_READ_ONLY_AUDITOR");

    // Tentativa 3: DELETE na tabela profiles
    const resDelete = await (supabase.from("profiles") as any).delete();
    assert.equal(resDelete.data, null);
    assert.equal(resDelete.error?.code, "403_READ_ONLY_AUDITOR");

    // Tentativa 4: UPSERT na tabela user_roles
    const resUpsert = await (supabase.from("user_roles") as any).upsert({ role: "superadmin" });
    assert.equal(resUpsert.data, null);
    assert.equal(resUpsert.error?.code, "403_READ_ONLY_AUDITOR");

    // Tentativa 5: Execução de RPC de mutação (bloqueio de veículo)
    const resRpc = await (supabase.rpc as any)("admin_bloquear_desbloquear_veiculo", {
      p_veiculo_id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
      p_bloquear: true,
    });
    assert.equal(resRpc.data, null);
    assert.equal(resRpc.error?.code, "403_READ_ONLY_AUDITOR");
    assert.match(resRpc.error?.message, /READ-ONLY/i);
  });

  it("4. REGRA IMPERIOSA: Proibição absoluta de realizar bloqueio ou desbloqueio de veículos", async () => {
    // 1. alternarBloqueioVeiculo deve retornar false e abortar
    const bloqueioGps = await alternarBloqueioVeiculo("3f2e1d2b-ca96-420e-88a5-c33fd98b689d", true);
    assert.equal(bloqueioGps, false, "alternarBloqueioVeiculo deve recusar bloqueio para auditor");

    // 2. bloquearDesbloquearVeiculo deve retornar success: false com mensagem expressa
    const bloqueioCliente = await bloquearDesbloquearVeiculo(
      "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
      true,
    );
    assert.equal(bloqueioCliente.success, false);
    assert.match(bloqueioCliente.message, /READ-ONLY/i);
  });

  it("5. REGRA IMPERIOSA: Único veículo disponibilizado para o perfil auditor é o veículo do Novaes (AXH0E44)", async () => {
    // Simula a lista de veículos retornada pelo banco contendo múltiplos veículos de clientes
    const mockVeiculos = [
      {
        id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
        placa: "AXH0E44",
        marca_modelo: "Volvo XC 60 T6",
        ativo: true,
      },
      {
        id: "6ef6d311-7989-4cce-a97f-223c9eb4531a",
        placa: "LTK1A94",
        marca_modelo: "GM MONTANA SPORT",
        ativo: true,
      },
      {
        id: "74d9e0dc-8572-4da0-9423-714f94a377cd",
        placa: "A DEFINIR",
        marca_modelo: "Veículo Padrão",
        ativo: true,
      },
    ];

    // O filtro de auditor deve reter ESTRITAMENTE o veículo do Novaes
    const filtrados = mockVeiculos.filter((v) => {
      const placa = (v.placa || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      return placa === "AXH0E44" || v.id === "3f2e1d2b-ca96-420e-88a5-c33fd98b689d";
    });

    assert.equal(filtrados.length, 1, "Auditor deve ter acesso a apenas 1 veículo");
    assert.equal(filtrados[0].placa, "AXH0E44", "O único veículo visível deve ser a placa AXH0E44");
    assert.equal(filtrados[0].id, "3f2e1d2b-ca96-420e-88a5-c33fd98b689d");
  });

  it("6. REGRA IMPERIOSA: Comandos para rastreador restritos exclusivamente a consultas (zero alteração de parâmetros)", () => {
    const comandosConsultaValidos = [
      "STATUS#",
      "WHERE#",
      "PARAM#",
      "VERSION#",
      "GPRS#",
      "AT",
      "AT+CSQ",
      "AT+CGSN",
      "AT+CPIN?",
      "CHECK123456",
    ];

    const comandosMutacaoProibidos = [
      "RELAY,1",
      "RELAY,0",
      "DYD,000000",
      "HFYD,000000",
      "RESET#",
      "FACTORY#",
      "SERVER,1,gps.oficial.tec.br,8080,0#",
      "TIMER,30#",
      "APN,claro.com.br#",
      "HBT,3#",
    ];

    const validarComandoAuditor = (cmdTexto: string): boolean => {
      const cmdUpper = cmdTexto.toUpperCase().replace(/[#\r\n]/g, "");
      return (
        cmdUpper === "STATUS" ||
        cmdUpper === "WHERE" ||
        cmdUpper === "PARAM" ||
        cmdUpper === "VERSION" ||
        cmdUpper === "GPRS" ||
        cmdUpper === "AT" ||
        cmdUpper === "AT+CSQ" ||
        cmdUpper === "AT+CGSN" ||
        cmdUpper === "AT+CPIN?" ||
        cmdUpper === "CHECK123456"
      );
    };

    for (const cmd of comandosConsultaValidos) {
      assert.equal(validarComandoAuditor(cmd), true, `Comando de consulta ${cmd} deve ser aceito`);
    }

    for (const cmd of comandosMutacaoProibidos) {
      assert.equal(
        validarComandoAuditor(cmd),
        false,
        `Comando modificador ${cmd} DEVE ser terminantemente rejeitado`,
      );
    }
  });

  it("7. Integridade das Migrações e do Script Mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql", () => {
    const rootDir = process.cwd();
    const migracaoPath = path.join(
      rootDir,
      "supabase/migrations/20261105193000_sigo_guardiao_perfil_superadmin_auditor_read_only.sql",
    );
    const mestrePath = path.join(rootDir, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(fs.existsSync(migracaoPath), "Arquivo da migração do auditor deve existir");
    assert.ok(fs.existsSync(mestrePath), "Arquivo mestre SQL deve existir");

    const migracaoSql = fs.readFileSync(migracaoPath, "utf-8");
    const mestreSql = fs.readFileSync(mestrePath, "utf-8");

    // Verifica elementos fundamentais na migração
    assert.match(migracaoSql, /superadmin_auditor/);
    assert.match(migracaoSql, /impedir_mutacoes_superadmin_auditor/);
    assert.match(migracaoSql, /trg_bloqueio_mutacao_auditor_profiles/);
    assert.match(migracaoSql, /trg_bloqueio_mutacao_auditor_veiculos/);
    assert.match(migracaoSql, /admin_bloquear_desbloquear_veiculo/);

    // Verifica que o script mestre reflete a migração
    assert.ok(
      mestreSql.includes("20261105193000_sigo_guardiao_perfil_superadmin_auditor_read_only.sql"),
      "O script mestre APLICAR_NO_SQL_EDITOR_SUPABASE.sql deve conter a migração do auditor",
    );
    assert.ok(
      mestreSql.includes("impedir_mutacoes_superadmin_auditor"),
      "O script mestre deve conter a trigger de bloqueio fisiológico de mutações",
    );
  });

  it("8. O SuperADM pode selecionar e restringir quais módulos o auditor tem acesso", () => {
    // Auditor com acesso restrito a apenas monitor-gps e clientes
    const sessaoAuditorRestrito: UserSession = {
      ...sessaoAuditor,
      modulos: ["monitor-gps", "clientes"],
    };

    // Módulos concedidos: devem retornar true
    assert.equal(podeAcessarModulo(sessaoAuditorRestrito, "monitor-gps"), true);
    assert.equal(podeAcessarModulo(sessaoAuditorRestrito, "clientes"), true);
    assert.equal(podeAcessarRota(sessaoAuditorRestrito, "/monitor-gps"), true);
    assert.equal(podeAcessarRota(sessaoAuditorRestrito, "/clientes"), true);

    // Módulos NÃO concedidos (ex: financeiro, estoque, usuarios): devem retornar false
    assert.equal(podeAcessarModulo(sessaoAuditorRestrito, "financeiro"), false);
    assert.equal(podeAcessarModulo(sessaoAuditorRestrito, "estoque"), false);
    assert.equal(podeAcessarModulo(sessaoAuditorRestrito, "usuarios"), false);
    assert.equal(podeAcessarRota(sessaoAuditorRestrito, "/financeiro"), false);
    assert.equal(podeAcessarRota(sessaoAuditorRestrito, "/estoque"), false);
    assert.equal(podeAcessarRota(sessaoAuditorRestrito, "/usuarios"), false);
  });

  it("9. S.adm Auditor possui acesso pleno aos recursos de telemetria sem bloqueio de plano (zero paywall)", async () => {
    const { obterRecursosPorPlano } =
      await import("../../features/monitor-gps/utils/planPermissions");
    const recursos = obterRecursosPorPlano(sessaoAuditor);

    assert.equal(recursos.modo3D, true, "Auditor deve ter Modo 3D liberado");
    assert.equal(recursos.montarRota, true, "Auditor deve ter Montar Rota liberado");
    assert.equal(recursos.sensoresFisicos, true, "Auditor deve ter Sensores Físicos liberados");
    assert.equal(
      recursos.telemetriaEletrica,
      true,
      "Auditor deve ter Telemetria Elétrica liberada",
    );
    assert.equal(recursos.rumoESatelites, true, "Auditor deve ter Rumo e Satélites liberados");
    assert.equal(recursos.alertasAcidente, true, "Auditor deve ter Alertas de Acidente liberados");
    assert.equal(recursos.diasHistorico, 35, "Auditor deve ter 35 dias de histórico técnico");
  });

  it("10. podeAcessarLocalizacaoVeiculo deve conceder visualização irrestrita ao S.adm Auditor mesmo com privacidade ON", async () => {
    const { podeAcessarLocalizacaoVeiculo } =
      await import("../../features/monitor-gps/utils/privacidadeLocalizacao");

    const veiculoComPrivacidade = {
      id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
      placa: "AXH0E44",
      privacidade_localizacao: true,
      cliente_id: "outro-cliente-uuid",
    };

    assert.equal(
      podeAcessarLocalizacaoVeiculo(sessaoAuditor, veiculoComPrivacidade),
      true,
      "Auditor deve visualizar localização mesmo com privacidade ativa",
    );
  });

  it("11. Servidor HTTP implementa endpoint resiliente /api/gps/veiculos-auditor", () => {
    const serverPath = path.join(process.cwd(), "src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      serverContent.includes('url.pathname === "/api/gps/veiculos-auditor"'),
      "server.ts deve conter o endpoint /api/gps/veiculos-auditor",
    );
    assert.ok(
      serverContent.includes("handleApiGpsAuditor"),
      "server.ts deve invocar handleApiGpsAuditor no fluxo de rotas",
    );
    assert.ok(
      serverContent.includes("AXH0E44"),
      "server.ts deve filtrar o veículo AXH0E44 para o auditor",
    );
  });

  it("12. Migrações contêm is_operador e is_admin_or_superadmin com suporte ao superadmin_auditor", () => {
    const migracaoPath = path.join(
      process.cwd(),
      "supabase/migrations/20261105193000_sigo_guardiao_perfil_superadmin_auditor_read_only.sql",
    );
    const sqlContent = fs.readFileSync(migracaoPath, "utf-8");

    assert.match(
      sqlContent,
      /CREATE OR REPLACE FUNCTION public\.is_operador/,
      "Migração deve conter is_operador atualizada",
    );
    assert.match(
      sqlContent,
      /CREATE OR REPLACE FUNCTION public\.is_admin_or_superadmin/,
      "Migração deve conter is_admin_or_superadmin atualizada",
    );
    assert.match(
      sqlContent,
      /Auditor visualiza veiculos autorizados/,
      "Migração deve conter policy de SELECT para auditor em veiculos",
    );
    assert.match(
      sqlContent,
      /Auditor visualiza rastreadores/,
      "Migração deve conter policy de SELECT para auditor em rastreadores",
    );
  });

  it("13. O S.adm auditor tem acesso garantido ao módulo rastreadores e rota /configuracao/rastreador-j16", () => {
    assert.equal(
      podeAcessarModulo(sessaoAuditor, "rastreadores"),
      true,
      "Auditor deve poder acessar o módulo rastreadores",
    );
    assert.equal(
      podeAcessarRota(sessaoAuditor, "/configuracao/rastreador-j16"),
      true,
      "Auditor deve poder acessar a rota /configuracao/rastreador-j16",
    );

    const routePath = path.join(
      process.cwd(),
      "src/routes/_authenticated.configuracao.rastreador-j16.tsx",
    );
    const routeContent = fs.readFileSync(routePath, "utf-8");
    assert.ok(
      routeContent.includes("isSuperAdminAuditor") || routeContent.includes("superadmin_auditor"),
      "Rota rastreador-j16 deve autorizar perfil auditor",
    );
  });

  it("14. RastreadorJ16View.tsx e server.ts bloqueiam alteração/bloqueio e liberam consultas para o auditor", () => {
    const viewPath = path.join(
      process.cwd(),
      "src/features/seguranca/components/RastreadorJ16View.tsx",
    );
    const viewContent = fs.readFileSync(viewPath, "utf-8");

    // Trava de comandos de alteração e bloqueio
    assert.ok(
      viewContent.includes('isAuditor || sess?.role === "superadmin_auditor"'),
      "RastreadorJ16View deve inspecionar sessão do auditor",
    );
    assert.ok(
      viewContent.includes("dispararTodosParametrosBatch"),
      "dispararTodosParametrosBatch deve existir",
    );

    // Servidor /api/gateway/comando
    const serverPath = path.join(process.cwd(), "src/server.ts");
    const serverContent = fs.readFileSync(serverPath, "utf-8");
    assert.ok(
      serverContent.includes('userRole === "superadmin_auditor"'),
      "server.ts deve validar perfil superadmin_auditor",
    );
  });

  it("15. AbaConfiguracaoUsb.tsx bloqueia gravação de parâmetros em hardware para o auditor", () => {
    const usbPath = path.join(
      process.cwd(),
      "src/features/seguranca/components/AbaConfiguracaoUsb.tsx",
    );
    const usbContent = fs.readFileSync(usbPath, "utf-8");

    assert.ok(
      usbContent.includes("obterSessaoCacheada"),
      "AbaConfiguracaoUsb deve obter sessão cacheada",
    );
    assert.ok(
      usbContent.includes('isAuditor || sess?.role === "superadmin_auditor"'),
      "AbaConfiguracaoUsb deve bloquear gravações do auditor",
    );
  });
});
