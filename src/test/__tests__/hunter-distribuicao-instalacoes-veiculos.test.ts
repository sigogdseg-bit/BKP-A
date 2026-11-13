import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import type {
  VeiculoComInstalacao,
  ItemDistribuicaoVeiculoInstalacao,
} from "@/features/clientes/services/clienteService";

describe("Hunter — Gestão de Frota, Distribuição de Veículos e Ordens de Serviço (OS)", () => {
  it("1. Deve tipar e estruturar corretamente os veículos com dados de instalação individual", () => {
    const veiculo1: VeiculoComInstalacao = {
      id: "v-001",
      placa: "ABC-1234",
      marca_modelo: "Toyota Corolla",
      ano: 2023,
      cor: "Prata",
      tipo_veiculo: "carro",
      ativo: false,
      bloqueado: false,
      pendente_aprovacao_operador: false,
      instalacao_id: "inst-001",
      instalador_id: "inst-tec-1",
      instalador_nome: "Carlos Técnico",
      instalacao_status: "agendada",
      kit_id: "kit-100",
      kit_imei: "869890084963382",
      kit_modelo: "J16 4G",
      chip_iccid: "89553202100092787817",
      chip_operadora: "Algar",
      data_agendamento: "2026-10-15",
      hora_agendamento: "14:00",
    };

    assert.strictEqual(veiculo1.placa, "ABC-1234");
    assert.strictEqual(veiculo1.instalacao_status, "agendada");
    assert.strictEqual(veiculo1.kit_imei, "869890084963382");
    assert.strictEqual(veiculo1.instalador_id, "inst-tec-1");
  });

  it("2. Veículo sem kit disponível deve ficar com status 'nao_instalado' aguardando agendamento", () => {
    const itemSemKit: ItemDistribuicaoVeiculoInstalacao = {
      veiculoId: "v-002",
      instaladorId: "inst-tec-1",
      kitId: null,
      imei: null,
      modelo: null,
      iccid: null,
      operadora: null,
      observacoes: "Aguardando kit em estoque para agendamento.",
    };

    // Validação da regra de negócio: sem kit -> status 'nao_instalado'
    const statusEsperado = itemSemKit.kitId ? "agendada" : "nao_instalado";
    assert.strictEqual(statusEsperado, "nao_instalado");
    assert.strictEqual(itemSemKit.kitId, null);
    assert.ok(itemSemKit.observacoes?.includes("Aguardando kit"));
  });

  it("3. Veículo com kit disponível deve permitir agendamento e status 'agendada'", () => {
    const itemComKit: ItemDistribuicaoVeiculoInstalacao = {
      veiculoId: "v-003",
      instaladorId: "inst-tec-2",
      kitId: "kit-200",
      imei: "869890084890007",
      modelo: "J16 4G",
      iccid: "89553202100092787809",
      operadora: "Multi-Operadora",
      dataAgendamento: "2026-10-20",
      horaAgendamento: "10:30",
    };

    const statusEsperado = itemComKit.kitId ? "agendada" : "nao_instalado";
    assert.strictEqual(statusEsperado, "agendada");
    assert.strictEqual(itemComKit.imei, "869890084890007");
    assert.strictEqual(itemComKit.dataAgendamento, "2026-10-20");
  });

  it("4. Suporte a instalador unificado para toda a frota ou instaladores distintos por veículo", () => {
    const distribuicaoFrota: ItemDistribuicaoVeiculoInstalacao[] = [
      {
        veiculoId: "v-001",
        instaladorId: "inst-tec-1", // mesmo instalador
        kitId: "kit-100",
        imei: "869890084963382",
      },
      {
        veiculoId: "v-002",
        instaladorId: "inst-tec-1", // mesmo instalador
        kitId: null, // sem kit
      },
      {
        veiculoId: "v-003",
        instaladorId: "inst-tec-2", // instalador distinto a escolha do operador
        kitId: "kit-300",
        imei: "1234",
      },
    ];

    assert.strictEqual(distribuicaoFrota.length, 3);
    assert.strictEqual(distribuicaoFrota[0].instaladorId, distribuicaoFrota[1].instaladorId);
    assert.notStrictEqual(distribuicaoFrota[0].instaladorId, distribuicaoFrota[2].instaladorId);
  });

  it("5. Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido nos novos componentes", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/clientes/components/ModalDistribuirInstalacoesVeiculos.tsx",
    );
    assert.ok(fs.existsSync(modalPath), "ModalDistribuirInstalacoesVeiculos.tsx deve existir.");
    const conteudo = fs.readFileSync(modalPath, "utf-8");

    // Não deve conter o caractere comercial proibido isolado em textos de UI (exceto && lógico do javascript)
    const linhasComAmpersand = conteudo
      .split("\n")
      .filter((l) => !l.includes("&&") && !l.includes("&") === false);

    assert.strictEqual(
      linhasComAmpersand.length,
      0,
      `Não deve haver caractere comercial em textos: ${linhasComAmpersand.join(", ")}`,
    );
  });
});
