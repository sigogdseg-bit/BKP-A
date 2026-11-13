import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { carregarViagensTrajetos } from "@/features/monitor-gps/services/gpsService";
import { obterDadosPreenchimentoInstalacaoCliente } from "@/features/instalacoes/services/instalacaoService";
import {
  saveCardThemeConfig,
  readCardThemeConfig,
  DEFAULT_CARD_THEME_CONFIG,
} from "@/shared/lib/card-theme";

describe("Hunter — Filtro Temporal de Trajetos, Pré-preenchimento do Instalador e Cores Multi-Dispositivo", () => {
  it("1. carregarViagensTrajetos deve aceitar e tratar filtro de ano, mês e dia", async () => {
    assert.strictEqual(typeof carregarViagensTrajetos, "function");

    // Chamada sem parâmetros e com filtro temporal
    const semFiltro = await carregarViagensTrajetos("fake-veiculo-id");
    assert.ok(Array.isArray(semFiltro));

    const comFiltro = await carregarViagensTrajetos("fake-veiculo-id", {
      ano: 2026,
      mes: 9,
      dia: 23,
    });
    assert.ok(Array.isArray(comFiltro));
  });

  it("2. obterDadosPreenchimentoInstalacaoCliente deve retornar função para pré-preenchimento", async () => {
    assert.strictEqual(typeof obterDadosPreenchimentoInstalacaoCliente, "function");

    const vazio = await obterDadosPreenchimentoInstalacaoCliente("");
    assert.strictEqual(vazio, null);
  });

  it("3. saveCardThemeConfig deve persistir localmente e sincronizar via evento e nuvem", () => {
    assert.strictEqual(typeof saveCardThemeConfig, "function");

    saveCardThemeConfig(DEFAULT_CARD_THEME_CONFIG, "user-teste-123");
    const lido = readCardThemeConfig("user-teste-123");
    assert.strictEqual(lido.mode, "duo");
    assert.strictEqual(lido.monoColor, "cyan");
  });

  it("4. NovoClienteModal não deve ter botões redundantes de PDF de contrato", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/NovoClienteModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    // O botão no rodapé "Emitir Contrato (PDF)" foi removido
    assert.ok(
      !content.includes("Emitir Contrato (PDF)"),
      "Não deve existir botão 'Emitir Contrato (PDF)' redundante no rodapé do modal de novo cliente",
    );

    // O botão legítimo na seção de contrato deve existir
    assert.ok(
      content.includes("Baixar Contrato (PDF)"),
      "Deve manter o botão 'Baixar Contrato (PDF)' na seção de vigência e contrato",
    );
  });

  it("5. RefazerTrajetoModal deve conter seletores de Ano e Mês", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/RefazerTrajetoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(content.includes("anoSelecionado"), "Deve conter estado anoSelecionado");
    assert.ok(content.includes("mesSelecionado"), "Deve conter estado mesSelecionado");
    assert.ok(content.includes("diaSelecionado"), "Deve conter estado diaSelecionado");
    assert.ok(content.includes("Período do Trajeto"), "Deve exibir seção Período do Trajeto");
  });

  it("6. NovaInstalacaoModal deve possuir auto-preenchimento de veículo, rastreador e chip", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    assert.ok(
      content.includes("obterDadosPreenchimentoInstalacaoCliente"),
      "Deve invocar obterDadosPreenchimentoInstalacaoCliente para puxar dados cadastrados",
    );
    assert.ok(
      content.includes("dadosPreCarregados"),
      "Deve exibir banner quando dados forem integrados do cliente",
    );
  });

  it("7. Blindagem anti-duplicação de viagens ativas e debounce de parada no gateway e banco", () => {
    const gatewayPath = path.resolve(process.cwd(), "scripts/hunter-gps-gateway.ts");
    const gatewayContent = fs.readFileSync(gatewayPath, "utf-8");

    assert.ok(
      gatewayContent.includes("mapaParadaIgnicao"),
      "Gateway deve implementar mapa de debounce de desligamento de ignição",
    );
    assert.ok(
      gatewayContent.includes("TEMPO_MINIMO_PARADA_CONCLUIR_VIAGEM_MS"),
      "Gateway deve possuir limiar de tempo mínimo de parada antes de concluir viagem",
    );
    const inicioFuncao = gatewayContent.indexOf("async function processarCicloIgnicaoViagem");
    const fimFuncao = gatewayContent.indexOf("async function registrarEventoVeiculoNoHunter");
    const corpoCiclo = gatewayContent.slice(inicioFuncao, fimFuncao);

    assert.ok(
      !corpoCiclo.includes(".maybeSingle()"),
      "Função processarCicloIgnicaoViagem NÃO deve utilizar .maybeSingle()",
    );

    const sqlPath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");

    assert.ok(
      sqlContent.includes("idx_viagens_uma_ativa_por_veiculo"),
      "Script mestre SQL deve conter índice único parcial idx_viagens_uma_ativa_por_veiculo",
    );
    assert.ok(
      sqlContent.includes("trg_viagens_garantir_uma_ativa"),
      "Script mestre SQL deve conter trigger de fechamento automático de viagem ativa anterior",
    );
  });
});
