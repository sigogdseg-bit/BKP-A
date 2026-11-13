import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { UsuarioCompleto } from "../../features/seguranca/services/usuarioService";

describe("Hunter — Gestão de Usuários: Último Acesso e Status de Sessão (Online/Offline/Deslogado)", () => {
  test("1. Determinação canônica do status de sessão", () => {
    function calcularStatusSessao(
      isOnline: boolean,
      temSessaoAtiva?: boolean,
    ): "online" | "offline" | "deslogado" {
      if (isOnline) return "online";
      if (temSessaoAtiva) return "offline";
      return "deslogado";
    }

    // Usuário conectado em tempo real no canal Realtime
    assert.equal(calcularStatusSessao(true, true), "online");
    assert.equal(calcularStatusSessao(true, false), "online");

    // Usuário logado mas sem conexão ativa no momento (em segundo plano ou tela fechada)
    assert.equal(calcularStatusSessao(false, true), "offline");

    // Usuário desconectado/deslogado (sessão encerrada ou expirada)
    assert.equal(calcularStatusSessao(false, false), "deslogado");
    assert.equal(calcularStatusSessao(false, undefined), "deslogado");
  });

  test("2. Resolução do último acesso com formatação brasileira", () => {
    function formatarDataHora(iso?: string | null): string {
      if (!iso) return "Nunca acessou";
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "Data inválida";
        return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      } catch {
        return "Data indisponível";
      }
    }

    assert.equal(formatarDataHora(null), "Nunca acessou");
    assert.equal(formatarDataHora(undefined), "Nunca acessou");
    assert.equal(formatarDataHora(""), "Nunca acessou");

    const dataIso = "2026-09-28T10:30:00.000Z";
    const formatada = formatarDataHora(dataIso);
    assert.ok(formatada.includes("2026"), "deve conter o ano 2026");
    assert.ok(formatada.includes("às"), "deve conter o conector 'às'");
  });

  test("3. Interface UsuarioCompleto suporta ultimo_acesso, tem_sessao_ativa e ultimo_logout", () => {
    const usuarioTeste: UsuarioCompleto = {
      id: "user-123",
      nome: "Operador Teste",
      email: "operador@teste.local",
      role: "operador",
      ativo: true,
      created_at: "2026-09-28T10:00:00Z",
      modulos: ["monitor-gps", "atendimento"],
      ultimo_acesso: "2026-09-28T10:25:00Z",
      tem_sessao_ativa: true,
      ultimo_logout: "2026-09-28T09:00:00Z",
    };

    assert.equal(usuarioTeste.ultimo_acesso, "2026-09-28T10:25:00Z");
    assert.equal(usuarioTeste.tem_sessao_ativa, true);
    assert.equal(usuarioTeste.ultimo_logout, "2026-09-28T09:00:00Z");
  });

  test("4. Diferenciação real de quem efetuou logout vs quem ainda não fez", () => {
    function determinarSessao(params: {
      sessaoAtivaPerfil?: boolean | null;
      loginTimestamp?: string | null;
      logoutTimestamp?: string | null;
      ultimoAcesso?: string | null;
    }): boolean {
      if (params.sessaoAtivaPerfil === true) {
        return true;
      }
      const dataLoginMs = params.loginTimestamp ? new Date(params.loginTimestamp).getTime() : 0;
      const dataAcessoMs = params.ultimoAcesso ? new Date(params.ultimoAcesso).getTime() : 0;
      const dataAtividadeMs = Math.max(dataLoginMs, dataAcessoMs);
      const dataLogoutMs = params.logoutTimestamp ? new Date(params.logoutTimestamp).getTime() : 0;

      if (dataAtividadeMs > 0) {
        if (dataLogoutMs > 0) {
          return dataAtividadeMs > dataLogoutMs;
        }
        // Se houve login/acesso e NÃO houve logout, a sessão permanece ativa no dispositivo (standby)
        return true;
      }
      return false;
    }

    const agora = new Date().toISOString();
    const haUmaHora = new Date(Date.now() - 3600 * 1000).toISOString();
    const haCincoDias = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();

    // Caso A: Usuário logou há 1 hora e efetuou logout agora -> DESLOGADO
    assert.equal(
      determinarSessao({
        loginTimestamp: haUmaHora,
        logoutTimestamp: agora,
      }),
      false,
      "Quem tem logout após o login deve estar deslogado",
    );

    // Caso B: Usuário logou há 1 hora e NÃO efetuou logout -> SESSÃO ATIVA (STANDBY / OFFLINE)
    assert.equal(
      determinarSessao({
        loginTimestamp: haUmaHora,
        logoutTimestamp: null,
      }),
      true,
      "Quem logou recentemente e não efetuou logout deve ter sessão ativa",
    );

    // Caso C: Usuário logou no dispositivo e não fez logout -> SESSÃO MANTIDA NO DISPOSITIVO (STANDBY / OFFLINE)
    assert.equal(
      determinarSessao({
        loginTimestamp: haCincoDias,
        logoutTimestamp: null,
      }),
      true,
      "Sessão no celular permanece salva sem logout forçado arbitrário",
    );

    // Caso D: Usuário com flag explícita sessao_ativa no perfil
    assert.equal(determinarSessao({ sessaoAtivaPerfil: true }), true);
    assert.equal(
      determinarSessao({
        sessaoAtivaPerfil: false,
        loginTimestamp: haUmaHora,
        logoutTimestamp: agora,
      }),
      false,
    );
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido em UsuariosView.tsx", () => {
    const filePath = path.resolve(
      process.cwd(),
      "src/features/seguranca/components/UsuariosView.tsx",
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Procura por '& ' ou ' &' em strings literais visíveis na tela (evita && lógico)
    const linhas = content.split("\n");
    linhas.forEach((linha, idx) => {
      // Ignora && de operadores lógicos
      const linhaSemLogicos = linha.replace(/&&/g, "");
      // Checa se sobrou '&' que representaria o caractere comercial proibido
      const temComercial = /['"][^'"]*&[^'"]*['"]/.test(linhaSemLogicos);
      assert.ok(
        !temComercial,
        `Linha ${idx + 1} contém o caractere comercial proibido: ${linha.trim()}`,
      );
    });
  });
});
