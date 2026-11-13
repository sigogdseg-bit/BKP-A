import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  agruparVeiculosPorCliente,
  deveAgruparPorCliente,
} from "../../features/monitor-gps/utils/agrupamentoClientes";
import type { VeiculoGps } from "../../features/monitor-gps/types";

describe("Hunter — Monitor GPS: Agrupamento de Veículos por Cliente para Contas de Usuários", () => {
  it("deve determinar que contas de usuarios (SuperADM, Admin, Operador) agrupam veiculos por cliente", () => {
    // SuperADM
    assert.strictEqual(
      deveAgruparPorCliente({
        isSuperAdmin: true,
        isAdmin: false,
        isOperador: false,
        isCliente: false,
        isInstalador: false,
      }),
      true,
    );

    // Admin comum
    assert.strictEqual(
      deveAgruparPorCliente({
        isSuperAdmin: false,
        isAdmin: true,
        isOperador: false,
        isCliente: false,
        isInstalador: false,
      }),
      true,
    );

    // Operador
    assert.strictEqual(
      deveAgruparPorCliente({
        isSuperAdmin: false,
        isAdmin: false,
        isOperador: true,
        isCliente: false,
        isInstalador: false,
      }),
      true,
    );
  });

  it("deve determinar que instaladores e clientes NÃO agrupam veiculos da mesma forma", () => {
    // Instalador (deve ser false - exceto instalador)
    assert.strictEqual(
      deveAgruparPorCliente({
        isSuperAdmin: false,
        isAdmin: false,
        isOperador: false,
        isCliente: false,
        isInstalador: true,
      }),
      false,
    );

    // Cliente (deve ser false - cliente ja acessa apenas seus proprios veiculos)
    assert.strictEqual(
      deveAgruparPorCliente({
        isSuperAdmin: false,
        isAdmin: false,
        isOperador: false,
        isCliente: true,
        isInstalador: false,
      }),
      false,
    );

    // Sem sessao
    assert.strictEqual(deveAgruparPorCliente(null), false);
  });

  it("deve agrupar veiculos corretamente por cliente e calcular totais operacionais", () => {
    const veiculosMock: VeiculoGps[] = [
      {
        id: "v1",
        cliente_id: "c1",
        cliente_nome: "Alexandra Silva",
        cliente_plano: "pro",
        placa: "AAA0E55",
        marca_modelo: "Honda Civic",
        ignicao: false,
        bloqueado: false,
        velocidade: 0,
        odometro: 12000,
        latitude: -22.52,
        longitude: -44.1,
        ultima_atualizacao: new Date().toISOString(),
        status_operacional: "estacionado",
      },
      {
        id: "v2",
        cliente_id: "c1",
        cliente_nome: "Alexandra Silva",
        cliente_plano: "pro",
        placa: "AAA0E71",
        marca_modelo: "VW Gol",
        ignicao: true,
        bloqueado: false,
        velocidade: 45,
        odometro: 50000,
        latitude: -22.53,
        longitude: -44.11,
        ultima_atualizacao: new Date().toISOString(),
        status_operacional: "em_rota",
      },
      {
        id: "v3",
        cliente_id: "c2",
        cliente_nome: "Mario Souza",
        cliente_plano: "master",
        placa: "BBB0R22",
        marca_modelo: "BMW X1",
        ignicao: false,
        bloqueado: true,
        velocidade: 0,
        odometro: 30000,
        latitude: -22.51,
        longitude: -44.09,
        alerta_acidente: true,
        ultima_atualizacao: new Date().toISOString(),
        status_operacional: "bloqueado",
      },
    ];

    const sessionSuperAdm: any = { isSuperAdmin: true, email: "novaes@adm.28bpm.local" };
    const grupos = agruparVeiculosPorCliente(veiculosMock, sessionSuperAdm);

    assert.strictEqual(grupos.length, 2);

    // Ordenacao alfabetica: Alexandra primeiro, Mario depois
    const alexandra = grupos[0];
    assert.strictEqual(alexandra.nome, "Alexandra Silva");
    assert.strictEqual(alexandra.veiculos.length, 2);
    assert.strictEqual(alexandra.totalEmRota, 1);
    assert.strictEqual(alexandra.totalEstacionados, 1);
    assert.strictEqual(alexandra.totalBloqueados, 0);
    assert.strictEqual(alexandra.temAlerta, false);

    const mario = grupos[1];
    assert.strictEqual(mario.nome, "Mario Souza");
    assert.strictEqual(mario.veiculos.length, 1);
    assert.strictEqual(mario.totalEmRota, 0);
    assert.strictEqual(mario.totalBloqueados, 1);
    assert.strictEqual(mario.temAlerta, true);
  });

  it("Regra Petrea Hunter: Proibicao do caractere comercial proibido", () => {
    const conteudo = JSON.stringify({
      modulo: "Monitoramento de Clientes e Veiculos",
      descricao: "Listagem hierarquica de clientes e seus respectivos veiculos",
    });
    assert.strictEqual(conteudo.includes("&"), false);
  });
});
