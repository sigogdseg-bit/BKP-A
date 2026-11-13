import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MANUAIS_MODULOS } from "../../features/manual/data/manualData";
import type { UserSession } from "../../features/auth/types";

describe("Hunter — Manuais Interativos, Módulos e Documentação Canônica (v1.11.0.47)", () => {
  const sessaoSuperAdm: UserSession = {
    userId: "adm-novaes",
    email: "novaes@adm.28bpm.local",
    nome: "SuperADM Blindado",
    role: "superadmin",
    isSuperAdmin: true,
    isAdmin: false,
    isOperador: false,
    isInstalador: false,
    isMotorista: false,
    isCliente: false,
    modulos: ["todos"],
  };

  const sessaoCliente: UserSession = {
    userId: "cli-1",
    clienteId: "cli-1",
    email: "cliente@frota.com",
    nome: "Cliente Titular",
    role: "cliente",
    isCliente: true,
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isInstalador: false,
    isMotorista: false,
    plano: "master",
    modulos: ["monitor-gps", "frota", "motoristas", "chat", "manutencao", "mensalidades"],
  };

  it("1. Todos os 20 módulos canônicos devem estar registrados no manual interativo", () => {
    const ids = MANUAIS_MODULOS.map((m) => m.id);

    // Módulos principais
    assert.ok(ids.includes("mapa-operacional"), "Deve conter mapa-operacional");
    assert.ok(ids.includes("frota-gestao"), "Deve conter frota-gestao");
    assert.ok(ids.includes("motoristas-portal"), "Deve conter motoristas-portal");
    assert.ok(ids.includes("chat-mensageria"), "Deve conter chat-mensageria");
    assert.ok(ids.includes("instalacoes-tecnicas"), "Deve conter instalacoes-tecnicas");
    assert.ok(ids.includes("clientes-planos"), "Deve conter clientes-planos");
    assert.ok(ids.includes("atendimento-cliente"), "Deve conter atendimento-cliente");
    assert.ok(ids.includes("estoque-suprimentos"), "Deve conter estoque-suprimentos");
    assert.ok(ids.includes("financeiro-caixa"), "Deve conter financeiro-caixa");
    assert.ok(ids.includes("mensalidades-cobranca"), "Deve conter mensalidades-cobranca");
    assert.ok(ids.includes("manutencao-preventiva"), "Deve conter manutencao-preventiva");
    assert.ok(ids.includes("dispositivos-autorizados"), "Deve conter dispositivos-autorizados");
    assert.ok(ids.includes("rastreador-j16"), "Deve conter rastreador-j16");
    assert.ok(ids.includes("temas-cards"), "Deve conter temas-cards");
    assert.ok(ids.includes("central-seguranca"), "Deve conter central-seguranca");
    assert.ok(ids.includes("logs-auditoria"), "Deve conter logs-auditoria");
    assert.ok(ids.includes("usuarios-acessos"), "Deve conter usuarios-acessos");
    assert.ok(ids.includes("revendedores-vendedores"), "Deve conter revendedores-vendedores");
    assert.ok(ids.includes("contratos-assinatura"), "Deve conter contratos-assinatura");
    assert.ok(
      ids.includes("auto-monitoramento-whatsapp"),
      "Deve conter auto-monitoramento-whatsapp",
    );

    assert.strictEqual(
      MANUAIS_MODULOS.length,
      20,
      "Devem existir exatamente 20 módulos cadastrados",
    );
  });

  it("2. Módulo de Mapa Operacional deve documentar Modo Stealth e Âncora Virtual", () => {
    const modMapa = MANUAIS_MODULOS.find((m) => m.id === "mapa-operacional");
    assert.ok(modMapa);

    // Compartilhamento com Modo Stealth
    const secaoCompartilhamento = modMapa.secoes.find((s) => s.id === "compartilhamento-ao-vivo");
    assert.ok(secaoCompartilhamento);
    assert.ok(secaoCompartilhamento.titulo.includes("Modo Stealth"));
    const passosCompartilhamento = secaoCompartilhamento.passos.map((p) => p.acao);
    assert.ok(passosCompartilhamento.some((a) => a.includes("Modo Stealth")));
    assert.ok(passosCompartilhamento.some((a) => a.includes("Auditoria de Visualizações")));

    // Âncora Virtual
    const secaoAncora = modMapa.secoes.find((s) => s.id === "ancora-virtual-seguranca");
    assert.ok(secaoAncora);
    assert.ok(secaoAncora.titulo.includes("Âncora Virtual"));
    assert.strictEqual(secaoAncora.passos.length, 3);
  });

  it("3. Módulo de Frota Operacional deve detalhar indicadores de disponibilidade e custos", () => {
    const modFrota = MANUAIS_MODULOS.find((m) => m.id === "frota-gestao");
    assert.ok(modFrota);
    assert.strictEqual(modFrota.rota, "/frota");
    assert.strictEqual(modFrota.tag, "Frota");

    const idsSecoes = modFrota.secoes.map((s) => s.id);
    assert.ok(idsSecoes.includes("indicadores-frota"));
    assert.ok(idsSecoes.includes("conformidade-custos"));
  });

  it("4. Módulo de Motoristas deve cobrir CNH e Portal do Motorista", () => {
    const modMotoristas = MANUAIS_MODULOS.find((m) => m.id === "motoristas-portal");
    assert.ok(modMotoristas);
    assert.strictEqual(modMotoristas.rota, "/motoristas");

    const idsSecoes = modMotoristas.secoes.map((s) => s.id);
    assert.ok(idsSecoes.includes("gestao-condutores"));
    assert.ok(idsSecoes.includes("portal-do-motorista"));
  });

  it("5. Módulo de Chat deve conter instruções de Web Push e Modo Supervisão", () => {
    const modChat = MANUAIS_MODULOS.find((m) => m.id === "chat-mensageria");
    assert.ok(modChat);
    assert.strictEqual(modChat.rota, "/chat");

    const idsSecoes = modChat.secoes.map((s) => s.id);
    assert.ok(idsSecoes.includes("troca-mensagens-push"));
    assert.ok(idsSecoes.includes("modo-supervisao-chat"));

    // Modo supervisão restrito a administradores
    const secaoSupervisao = modChat.secoes.find((s) => s.id === "modo-supervisao-chat");
    assert.ok(secaoSupervisao?.podeAcessar);
    assert.strictEqual(secaoSupervisao.podeAcessar(sessaoCliente), false);
    assert.strictEqual(secaoSupervisao.podeAcessar(sessaoSuperAdm), true);
  });

  it("6. Módulo de Instalações deve incluir convite e auto-cadastro de instalador", () => {
    const modInst = MANUAIS_MODULOS.find((m) => m.id === "instalacoes-tecnicas");
    assert.ok(modInst);

    const secaoConvite = modInst.secoes.find((s) => s.id === "convite-autocadastro-instalador");
    assert.ok(secaoConvite);
    assert.strictEqual(secaoConvite.podeAcessar?.(sessaoSuperAdm), true);
    assert.strictEqual(secaoConvite.podeAcessar?.(sessaoCliente), false);
  });

  it("7. Regra Pétrea: Zero ocorrências do caractere comercial proibido em todo o catálogo", () => {
    const jsonStr = JSON.stringify(MANUAIS_MODULOS);
    const matchAmp = jsonStr.match(/\s&\s/g);
    assert.strictEqual(
      matchAmp,
      null,
      "Não deve existir o caractere comercial em textos do manual modular",
    );
    assert.ok(!jsonStr.includes("&amp;"), "Não deve existir &amp; no catálogo");
  });

  it("8. Todos os módulos devem possuir rota válida e passos numerados sequencialmente", () => {
    for (const modulo of MANUAIS_MODULOS) {
      assert.ok(modulo.rota.startsWith("/"), `Rota inválida para ${modulo.id}: ${modulo.rota}`);
      assert.ok(modulo.titulo.length > 3, `Título muito curto para ${modulo.id}`);
      assert.ok(modulo.resumo.length > 10, `Resumo muito curto para ${modulo.id}`);

      for (const secao of modulo.secoes) {
        assert.ok(secao.passos.length > 0, `Seção ${secao.id} não possui passos`);
        secao.passos.forEach((p, idx) => {
          assert.strictEqual(
            p.ordem,
            idx + 1,
            `Ordem incorreta no passo ${p.acao} da seção ${secao.id}`,
          );
        });
      }
    }
  });
});
