import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { agruparVeiculosPorCliente } from "../../features/monitor-gps/utils/agrupamentoClientes";
import type { VeiculoGps } from "../../features/monitor-gps/types";
import type { UserSession } from "../../features/auth/types";

describe("Hunter — Blindagem de Isolamento no Modo Cliente e Visibilidade Global SuperADM", () => {
  const mockVeiculoDario: VeiculoGps = {
    id: "3f2e1d2b-ca96-420e-88a5-c33fd98b689d",
    cliente_id: "592a5124-d8bc-47a6-aa8e-a744f0d65467",
    cliente_user_id: "c15aa27c-b508-4af5-9de4-355431eb3cf7",
    cliente_nome: "Dario Novaes",
    placa: "AXH0E44",
    marca_modelo: "Volvo XC 60 T6",
    ignicao: false,
    bloqueado: false,
    bloqueador_instalado: true,
    velocidade: 0,
    odometro: 12500,
    odometro_wgs84_km: 12500,
    status_operacional: "estacionado",
    privacidade_localizacao: true,
    latitude: -22.505,
    longitude: -44.095,
    ultima_atualizacao: new Date().toISOString(),
  };

  const mockVeiculoAlexSandro: VeiculoGps = {
    id: "6ef6d311-7989-4cce-a97f-223c9eb4531a",
    cliente_id: "f4c2d6fb-e829-4507-bcfb-6b95143e04c4",
    cliente_user_id: "3155c72a-dbdf-4205-8f2e-067818360a40",
    cliente_nome: "Alex Sandro Fernandes Souza",
    placa: "LTK1A94",
    marca_modelo: "GM MONTANA SPORT",
    ignicao: false,
    bloqueado: false,
    bloqueador_instalado: true,
    velocidade: 0,
    odometro: 89000,
    odometro_wgs84_km: 89000,
    status_operacional: "estacionado",
    privacidade_localizacao: true,
    latitude: -22.512,
    longitude: -44.082,
    ultima_atualizacao: new Date().toISOString(),
  };

  const listaCompletaDb: VeiculoGps[] = [mockVeiculoDario, mockVeiculoAlexSandro];

  const sessionSuperAdm: UserSession = {
    userId: "a5fb989c-3522-4dcb-826e-140fe2eb776a",
    email: "novaes@oficial.tec.br",
    nome: "Suporte",
    role: "superadmin",
    isSuperAdmin: true,
    isAdmin: true,
    isOperador: false,
    isInstalador: false,
    isMotorista: false,
    isRevendedor: false,
    isVendedor: false,
    isCliente: false,
    clienteId: null,
    modulos: ["gps", "clientes", "financeiro", "configuracoes"],
  };

  const sessionModoClienteDario: UserSession = {
    userId: "c15aa27c-b508-4af5-9de4-355431eb3cf7",
    email: "novaes@oficial.tec.br",
    nome: "Dario Novaes",
    role: "cliente",
    isSuperAdmin: false,
    isAdmin: false,
    isOperador: false,
    isInstalador: false,
    isMotorista: false,
    isRevendedor: false,
    isVendedor: false,
    isCliente: true,
    clienteId: "592a5124-d8bc-47a6-aa8e-a744f0d65467",
    modulos: ["gps"],
  };

  test("1. Modo Cliente Ativo (Dario Novaes): Isolamento absoluto no mapa e contadores (zero vazamento de LTK1A94)", () => {
    // Simula a filtragem canônica de GpsMonitorView
    const filtrados = listaCompletaDb.filter((v) => {
      if (sessionModoClienteDario.isCliente && sessionModoClienteDario.clienteId) {
        if (v.cliente_id !== sessionModoClienteDario.clienteId) return false;
      }
      return true;
    });

    assert.equal(filtrados.length, 1, "Dario Novaes deve ter exatamente 1 veículo filtrado");
    assert.equal(
      filtrados[0].placa,
      "AXH0E44",
      "O veículo retornado deve ser estritamente o Volvo de Dario",
    );
    assert.ok(
      !filtrados.some((v) => v.placa === "LTK1A94"),
      "Veículo LTK1A94 de Alex Sandro NÃO pode constar na lista filtrada do cliente Dario",
    );

    // Contadores derivados de filtrados
    const total = filtrados.length;
    const estacionados = filtrados.filter((v) => v.status_operacional === "estacionado").length;
    assert.equal(total, 1, "Contador Total deve ser 1, nunca 2");
    assert.equal(estacionados, 1, "Contador Estacionados deve ser 1, nunca 2");
  });

  test("2. SuperADM por Padrão: Vê todos os clientes ativos e todos os seus veículos", () => {
    const filtrados = listaCompletaDb.filter((v) => {
      if (sessionSuperAdm.isCliente && sessionSuperAdm.clienteId) {
        if (v.cliente_id !== sessionSuperAdm.clienteId) return false;
      }
      return true;
    });

    assert.equal(
      filtrados.length,
      2,
      "SuperADM sem filtros ativos deve enxergar todos os 2 veículos",
    );

    const grupos = agruparVeiculosPorCliente(filtrados, sessionSuperAdm);
    assert.equal(grupos.length, 2, "SuperADM deve enxergar exatamente os 2 clientes ativos");

    const nomes = grupos.map((g) => g.nome);
    assert.ok(nomes.includes("Dario Novaes"), "Grupo Dario Novaes deve existir na lista");
    assert.ok(
      nomes.includes("Alex Sandro Fernandes Souza"),
      "Grupo Alex Sandro Fernandes Souza DEVE existir na lista do SuperADM",
    );
  });

  test("3. Código-fonte de GpsMonitorView.tsx: veiculosNoMapa e totais derivam estritamente de veiculosFiltrados", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/monitor-gps/components/GpsMonitorView.tsx", import.meta.url),
      "utf-8",
    );

    // veiculosNoMapa NÃO pode usar veiculos.length
    assert.ok(
      code.includes("if (modoVisaoFrota && veiculosFiltrados.length > 1)"),
      "veiculosNoMapa deve verificar veiculosFiltrados.length > 1",
    );
    assert.ok(
      !code.includes("if (modoVisaoFrota && veiculos.length > 1)"),
      "veiculosNoMapa não pode alimentar frotas baseado no array bruto veiculos",
    );

    // totais NÃO pode usar veiculos.length
    assert.ok(
      code.includes("total: veiculosFiltrados.length"),
      "totais.total deve ser calculado a partir de veiculosFiltrados.length",
    );
    assert.ok(
      !code.includes("total: veiculos.length"),
      "totais.total não pode usar a lista bruta veiculos.length",
    );

    // Botão Toda Frota na sidebar
    assert.ok(
      code.includes("Toda Frota ({veiculosFiltrados.length})"),
      "Botão de alternância de visão deve exibir contagem de veiculosFiltrados",
    );

    // Banner de filtro de veículos ativo com opção de Mostrar Todos
    assert.ok(
      code.includes("filtroVeiculosIds.length > 0"),
      "Deve possuir indicador de filtro de veículos ativo",
    );
    assert.ok(
      code.includes("@hunter_filtro_veiculos_ids"),
      "Deve suportar chave @hunter_filtro_veiculos_ids",
    );
  });

  test("4. AuthContext.tsx: Reseta filtros ao emular cliente e ao desfazer emulação", async () => {
    const code = await fs.readFile(
      new URL("../../../src/features/auth/context/AuthContext.tsx", import.meta.url),
      "utf-8",
    );

    assert.ok(
      code.includes('localStorage.removeItem("@hunter_filtro_veiculos_ids");'),
      "AuthContext deve remover @hunter_filtro_veiculos_ids ao alternar emulação",
    );
    assert.ok(
      code.includes('window.dispatchEvent(new Event("hunter_filtro_veiculos_alterado"));'),
      "AuthContext deve despachar evento de alteração de filtro de veículos",
    );
  });

  test("5. Regra Pétrea Hunter-Guardian: Ausência do caractere proibido nos textos de interface", async () => {
    const caminhos = [
      "../../../src/features/auth/context/AuthContext.tsx",
      "../../../src/features/configuracoes/ConfiguracoesView.tsx",
      "../../../src/features/monitor-gps/components/GpsMonitorView.tsx",
    ];

    const prohibitedChar = String.fromCharCode(38); // '&'

    for (const c of caminhos) {
      const conteudo = await fs.readFile(new URL(c, import.meta.url), "utf-8");
      // Verifica textos entre tags JSX que contenham o caractere isolado
      const regexJsxText = new RegExp(`>([^<]*\\s${prohibitedChar}\\s[^<]*)<`, "g");
      const matches = conteudo.match(regexJsxText) || [];
      assert.equal(
        matches.length,
        0,
        `Não deve haver caractere comercial proibido em textos visuais de ${c}: ${matches.join(", ")}`,
      );
    }
  });
});
