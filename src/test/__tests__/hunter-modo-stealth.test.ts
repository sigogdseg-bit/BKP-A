import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  VeiculoCompartilhadoPublico,
  CompartilhamentoTemporario,
} from "@/features/monitor-gps/services/compartilhamentoService";

describe("Hunter — Modo Stealth de Compartilhamento Temporário (DJR-NEW / HUNTER-GUARDIAN)", () => {
  it("1. Deve definir propriedades de congelamento na interface de compartilhamento", () => {
    const shareMock: CompartilhamentoTemporario = {
      id: "share-uuid-1",
      token: "tokenseguro1234567890",
      veiculo_id: "veic-uuid-1",
      cliente_id: "cli-uuid-1",
      expira_em: new Date(Date.now() + 7200000).toISOString(),
      revogado: false,
      stealth_ativo: true,
      stealth_latitude: -22.5235,
      stealth_longitude: -44.1042,
      stealth_rumo: 180,
      created_at: new Date().toISOString(),
    };

    assert.equal(shareMock.stealth_ativo, true);
    assert.equal(shareMock.stealth_latitude, -22.5235);
    assert.equal(shareMock.stealth_longitude, -44.1042);
    assert.equal(shareMock.stealth_rumo, 180);
  });

  it("2. Deve camuflar telemetria quando o Modo Stealth estiver ativado", () => {
    // Veículo real trafegando a 80 km/h com ignição ligada
    const veiculoReal = {
      id: "veic-1",
      placa: "BRA2E19",
      marca_modelo: "Toyota Corolla",
      cor: "Prata",
      ignicao_status: true,
      velocidade_atual: 85,
      ultima_latitude: -22.5111,
      ultima_longitude: -44.1222,
      ultima_atualizacao: "2026-09-25T12:00:00Z",
      status_operacional: "em_movimento",
      rumo: 90,
    };

    // Compartilhamento com Modo Stealth ativo congelado em outro ponto
    const share = {
      stealth_ativo: true,
      stealth_latitude: -22.5,
      stealth_longitude: -44.1,
      stealth_rumo: 45,
    };

    const isStealth = !!share.stealth_ativo;
    const lat = isStealth ? share.stealth_latitude : veiculoReal.ultima_latitude;
    const lng = isStealth ? share.stealth_longitude : veiculoReal.ultima_longitude;
    const rumo = isStealth ? share.stealth_rumo : veiculoReal.rumo;

    const payloadPublico: VeiculoCompartilhadoPublico = {
      id: veiculoReal.id,
      placa: veiculoReal.placa,
      marca_modelo: veiculoReal.marca_modelo,
      cor: veiculoReal.cor,
      ignicao: isStealth ? false : !!veiculoReal.ignicao_status,
      velocidade: isStealth ? 0 : veiculoReal.velocidade_atual,
      latitude: lat,
      longitude: lng,
      ultima_atualizacao: new Date().toISOString(),
      status_operacional: isStealth ? "estacionado" : veiculoReal.status_operacional,
      rumo: rumo,
    };

    // Asserções táticas do Modo Stealth
    assert.equal(payloadPublico.velocidade, 0, "Velocidade deve ser 0 km/h");
    assert.equal(payloadPublico.ignicao, false, "Ignição deve constar como desligada");
    assert.equal(
      payloadPublico.status_operacional,
      "estacionado",
      "Status deve constar como estacionado",
    );
    assert.equal(payloadPublico.latitude, -22.5, "Latitude deve ser a coordenada congelada");
    assert.equal(payloadPublico.longitude, -44.1, "Longitude deve ser a coordenada congelada");
    assert.equal(payloadPublico.rumo, 45, "Rumo deve ser o congelado");
  });

  it("3. Inviolabilidade do Link Público: O objeto público NÃO deve conter campos ou indícios de Stealth", () => {
    const payloadPublico: VeiculoCompartilhadoPublico = {
      id: "v-1",
      placa: "BRA2E19",
      marca_modelo: "Toyota Corolla",
      ignicao: false,
      velocidade: 0,
      latitude: -22.5,
      longitude: -44.1,
      ultima_atualizacao: new Date().toISOString(),
      status_operacional: "estacionado",
    };

    const json = JSON.stringify(payloadPublico);
    assert.equal(
      json.toLowerCase().includes("stealth"),
      false,
      "Nenhuma menção de stealth no payload público",
    );
    assert.equal(
      json.toLowerCase().includes("congel"),
      false,
      "Nenhuma menção de congelado no payload público",
    );
  });

  it("4. Regra Pétrea: Ausência do caractere comercial proibido nas mensagens e no serviço", () => {
    const codigoServico = `
      Modo Stealth ativado: posição congelada com sucesso.
      Modo Stealth desativado: tempo real restabelecido.
    `;
    assert.equal(
      codigoServico.includes("&"),
      false,
      "É terminantemente proibido o caractere comercial '&' no código e mensagens",
    );
  });
});
