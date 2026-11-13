import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validarConviteCliente,
  type VeiculoCadastroConvite,
  type DadosAutoCadastroCliente,
} from "../../features/clientes/services/conviteClienteService";
import type { Cliente, VeiculoResumoCliente } from "../../features/clientes/types";

describe("Hunter - Auto-Cadastro de Cliente Multi-Veículo e Pendências do Operador", () => {
  it("deve validar que links sem token retornam erro descritivo", async () => {
    const resVazio = await validarConviteCliente("");
    assert.equal(resVazio.valido, false);
    assert.match(resVazio.mensagem || "", /ausente|inválido|incompleto/i);
  });

  it("deve validar a estrutura de dados para auto-cadastro com múltiplos veículos", () => {
    const veiculos: VeiculoCadastroConvite[] = [
      {
        tipo_veiculo: "carro",
        placa: "ABC1D23",
        modelo: "Corolla XEi",
        marca: "Toyota",
        ano: 2023,
        cor: "Prata",
      },
      {
        tipo_veiculo: "moto",
        placa: "XYZ9K88",
        modelo: "CG 160 Titan",
        marca: "Honda",
        ano: 2024,
        cor: "Vermelha",
      },
    ];

    const payload: DadosAutoCadastroCliente = {
      token: "test-token-uuid-1234",
      nome: "Transportadora Modelo Ltda",
      documento: "12.345.678/0001-90",
      email: "contato@transpmodelo.com",
      telefone: "(24) 99999-8888",
      senha: "senhaSegura123",
      diaVencimento: 15,
      veiculos,
    };

    assert.equal(payload.veiculos.length, 2);
    assert.equal(payload.veiculos[0].placa, "ABC1D23");
    assert.equal(payload.veiculos[1].tipo_veiculo, "moto");
    assert.equal(payload.diaVencimento, 15);
  });

  it("deve garantir que o modelo de Cliente suporta pendente_configuracao_operador e veiculos_resumo", () => {
    const veiculosResumo: VeiculoResumoCliente[] = [
      {
        id: "v-1",
        placa: "RIO2A19",
        modelo: "Hilux CD",
        tipo_veiculo: "camionete",
        pendente_aprovacao_operador: true,
      },
      {
        id: "v-2",
        placa: "VOL4E20",
        modelo: "Onix Plus",
        tipo_veiculo: "carro",
        pendente_aprovacao_operador: false,
      },
    ];

    const cliente: Cliente = {
      id: "cli-123",
      nome_razao_social: "Auto Posto Aliança",
      status: "aguardando_instalacao",
      plano: "pro",
      dias_historico_plano: 30,
      dias_retencao_banco: 60,
      dia_vencimento: 10,
      valor_mensalidade: 159.8,
      pendente_configuracao_operador: true,
      veiculos_count: 2,
      veiculos_resumo: veiculosResumo,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    assert.equal(cliente.pendente_configuracao_operador, true);
    assert.equal(cliente.veiculos_resumo?.length, 2);
    assert.equal(cliente.veiculos_resumo?.[0].pendente_aprovacao_operador, true);
    assert.equal(cliente.veiculos_resumo?.[1].pendente_aprovacao_operador, false);
  });

  it("deve simular a criação de ordens individuais separadas por veículo", () => {
    const veiculos = [
      { id: "veic-1", placa: "ABC1234", modelo: "Fiorino", tipo: "van" },
      { id: "veic-2", placa: "DEF5678", modelo: "Constellation", tipo: "caminhao" },
    ];

    // Cada veículo gera um registro isolado em 'instalacoes'
    const ordensGeradas = veiculos.map((v) => ({
      cliente_id: "cli-multi",
      veiculo_id: v.id,
      placa: v.placa,
      modelo: v.modelo,
      tipo_veiculo: v.tipo,
      instalador_id: null, // Operador atribuirá depois
      status: "nao_instalado",
      pendente_atribuicao: true,
    }));

    assert.equal(ordensGeradas.length, 2);
    assert.notEqual(ordensGeradas[0].veiculo_id, ordensGeradas[1].veiculo_id);
    assert.equal(ordensGeradas[0].instalador_id, null);
    assert.equal(ordensGeradas[1].instalador_id, null);

    // Operador atribui instalador 1 para a Fiorino e instalador 2 para o Constellation
    ordensGeradas[0].instalador_id = "inst-eletrica-norte";
    ordensGeradas[1].instalador_id = "inst-truck-service";

    assert.equal(ordensGeradas[0].instalador_id, "inst-eletrica-norte");
    assert.equal(ordensGeradas[1].instalador_id, "inst-truck-service");
  });

  it("deve permitir cadastro de máquinas e tratores sem placa (placa opcional)", () => {
    const veiculosComMaquina: VeiculoCadastroConvite[] = [
      {
        tipo_veiculo: "maquina",
        placa: "", // Máquina não tem placa
        modelo: "Trator 5075E",
        marca: "John Deere",
        ano: 2021,
        cor: "Verde",
        horimetroInicial: 1450,
      },
      {
        tipo_veiculo: "carro",
        placa: "BRA2E19",
        modelo: "Strada Freedom",
        marca: "Fiat",
        ano: 2023,
      },
    ];

    // Simula a normalização canônica aplicada no sistema
    const veiculosNormalizados = veiculosComMaquina.map((v) => {
      const isMaquina =
        v.tipo_veiculo === "maquina" ||
        v.tipo_veiculo === "trator" ||
        (v as any).tipo === "maquina";
      const placaFormatada =
        v.placa?.trim().toUpperCase() || (isMaquina ? "SEM PLACA" : "A DEFINIR");
      return {
        ...v,
        placa: placaFormatada,
        isMaquina,
      };
    });

    assert.equal(veiculosNormalizados[0].placa, "SEM PLACA");
    assert.equal(veiculosNormalizados[0].isMaquina, true);
    assert.equal(veiculosNormalizados[1].placa, "BRA2E19");
    assert.equal(veiculosNormalizados[1].isMaquina, false);
  });
});
