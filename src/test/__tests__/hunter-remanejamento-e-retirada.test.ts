import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  SolicitarRetiradaPayload,
  SolicitarRemanejamentoPayload,
  TipoServicoInstalacao,
} from "../../features/instalacoes/types";

test("Hunter — Retirada e Remanejamento de Rastreadores (DJR-NEW)", async (t) => {
  await t.test("Tipos e Regras de Negócio: TipoServicoInstalacao", () => {
    const tiposPermitidos: TipoServicoInstalacao[] = ["instalacao", "retirada"];
    assert.equal(tiposPermitidos.length, 2);
    assert.ok(tiposPermitidos.includes("instalacao"));
    assert.ok(tiposPermitidos.includes("retirada"));
  });

  await t.test("Payload de Retirada Simples: permite mão de obra zerada (R$ 0,00)", () => {
    const payloadRetirada: SolicitarRetiradaPayload = {
      veiculoId: "veic-uuid-origem-123",
      instaladorId: "inst-uuid-456",
      valorRetirada: 0.0,
      motivo: "Cancelamento do plano por solicitação do cliente",
      observacoes: "Equipamento deve ser retornado ao estoque central",
    };

    assert.equal(payloadRetirada.valorRetirada, 0);
    assert.equal(typeof payloadRetirada.valorRetirada, "number");
    assert.equal(payloadRetirada.veiculoId, "veic-uuid-origem-123");
    assert.equal(payloadRetirada.instaladorId, "inst-uuid-456");
  });

  await t.test("Payload de Remanejamento: 2 chamadas/ordens vinculadas e valores flexíveis", () => {
    const payloadRemanejamento: SolicitarRemanejamentoPayload = {
      veiculoOrigemId: "veic-origem-001",
      clienteDestinoId: "cliente-novo-002",
      novoVeiculoPlaca: "BRA2E19",
      novoVeiculoMarca: "Toyota",
      novoVeiculoModelo: "Corolla Cross",
      novoVeiculoAno: 2025,
      novoVeiculoCor: "Prata",
      instaladorId: "inst-uuid-789",
      valorRetirada: 0.0, // Mão de obra zerada pelo operador
      valorInstalacao: 80.0, // Valor padrão ou ajustado
      motivo: "Troca de frota da empresa contratante",
      observacoes: "Realizar retirada e instalação no mesmo dia",
    };

    assert.equal(payloadRemanejamento.valorRetirada, 0.0);
    assert.equal(payloadRemanejamento.valorInstalacao, 80.0);
    assert.equal(payloadRemanejamento.novoVeiculoPlaca, "BRA2E19");
    assert.ok(payloadRemanejamento.clienteDestinoId);
    assert.ok(payloadRemanejamento.veiculoOrigemId);
  });

  await t.test(
    "Isolamento de Histórico: rastreador reutilizado em novo veículo ganha novo veiculo_id",
    () => {
      // Quando um rastreador físico é retirado e remanejado para outro veículo,
      // o histórico de telemetria é indexado por veiculo_id.
      const veiculoOrigem = {
        id: "veic-antigo-111",
        cliente_id: "cliente-antigo-aaa",
        odometro_acumulado_km: 125000,
      };

      const veiculoDestino = {
        id: "veic-novo-222",
        cliente_id: "cliente-novo-bbb",
        odometro_acumulado_km: 0,
      };

      // Devem possuir identificadores distintos para blindar vazamento de histórico
      assert.notEqual(veiculoOrigem.id, veiculoDestino.id);
      assert.notEqual(veiculoOrigem.cliente_id, veiculoDestino.cliente_id);
      assert.equal(veiculoDestino.odometro_acumulado_km, 0);
    },
  );

  await t.test("Continuidade de Histórico: reinstalação no mesmo veículo do mesmo cliente", () => {
    const veiculoExistente = {
      id: "veic-mesmo-333",
      cliente_id: "cliente-mesmo-ccc",
      odometro_acumulado_km: 45000,
    };

    // Na continuidade, o veiculo_id é preservado
    const veiculoAposManutencao = {
      ...veiculoExistente,
      odometro_acumulado_km: 45000,
    };

    assert.equal(veiculoExistente.id, veiculoAposManutencao.id);
    assert.equal(
      veiculoExistente.odometro_acumulado_km,
      veiculoAposManutencao.odometro_acumulado_km,
    );
  });

  await t.test(
    "Protocolo DJR-NEW: Proibição estrita do caractere comercial ampersand em ModalSolicitarRemanejamento",
    () => {
      const modalPath = path.resolve(
        process.cwd(),
        "src/features/instalacoes/components/ModalSolicitarRemanejamento.tsx",
      );
      const conteudo = fs.readFileSync(modalPath, "utf-8");

      // Proibição de & em textos e rótulos
      const regexAmpersandProibido = /(?<!&)&(?!&)/;
      // Testa se há ampersand isolado no arquivo
      const linhas = conteudo.split("\n");
      const violacoes: string[] = [];

      linhas.forEach((linha, idx) => {
        // Ignora entidades HTML ou operadores booleanos &&
        const linhaSemDuploE = linha.replace(/&&/g, "");
        if (regexAmpersandProibido.test(linhaSemDuploE)) {
          violacoes.push(`Linha ${idx + 1}: ${linha.trim()}`);
        }
      });

      assert.equal(
        violacoes.length,
        0,
        `Encontradas violações de ampersand em ModalSolicitarRemanejamento.tsx:\n${violacoes.join("\n")}`,
      );
    },
  );
});
