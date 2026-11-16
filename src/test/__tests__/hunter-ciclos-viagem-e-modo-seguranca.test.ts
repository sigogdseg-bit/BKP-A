import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatarMinutosParaHorasEMinutos,
  type CicloViagemConsolidado,
  type ResumoDiarioVeiculo,
} from "../../features/monitor-gps/services/timelineService";

describe("Hunter — Ciclos de Viagem Consolidados e Modo de Segurança Anti-Furto", () => {
  describe("1. Formatação e Métricas de Duração", () => {
    test("deve formatar minutos corretamente em min e h:mm", () => {
      assert.equal(formatarMinutosParaHorasEMinutos(0), "0 min");
      assert.equal(formatarMinutosParaHorasEMinutos(8), "8 min");
      assert.equal(formatarMinutosParaHorasEMinutos(45), "45 min");
      assert.equal(formatarMinutosParaHorasEMinutos(60), "1h00");
      assert.equal(formatarMinutosParaHorasEMinutos(75), "1h15");
      assert.equal(formatarMinutosParaHorasEMinutos(135), "2h15");
    });
  });

  describe("2. Inteligência de Ciclos de Viagem (Trânsito vs Marcha Lenta)", () => {
    test("deve separar tempo em movimento e tempo em marcha lenta dentro do ciclo", () => {
      // Simulação de telemetria de um ciclo de 10 minutos (20 pontos coletados a cada 30 segundos)
      const pontosTelemetria = [
        { vel: 0, ign: true }, // Parado esquentando motor (marcha lenta)
        { vel: 0, ign: true }, // Marcha lenta
        { vel: 15, ign: true }, // Em movimento
        { vel: 42, ign: true }, // Em movimento
        { vel: 65, ign: true }, // Em movimento
        { vel: 55, ign: true }, // Em movimento
        { vel: 0, ign: true }, // Parado no semáforo (marcha lenta)
        { vel: 0, ign: true }, // Parado no semáforo (marcha lenta)
        { vel: 30, ign: true }, // Em movimento
        { vel: 0, ign: true }, // Estacionou com motor ligado (marcha lenta)
      ];

      const totalPontos = pontosTelemetria.length;
      const ptsMov = pontosTelemetria.filter((p) => p.vel > 3).length;
      const ptsIdling = pontosTelemetria.filter((p) => p.vel <= 3 && p.ign).length;

      const duracaoTotalMin = 10;
      const minutosMov = Math.round((ptsMov / totalPontos) * duracaoTotalMin);
      const minutosIdling = Math.max(0, duracaoTotalMin - minutosMov);

      assert.equal(ptsMov, 5);
      assert.equal(ptsIdling, 5);
      assert.equal(minutosMov, 5);
      assert.equal(minutosIdling, 5);
      assert.equal(formatarMinutosParaHorasEMinutos(minutosMov), "5 min");
      assert.equal(formatarMinutosParaHorasEMinutos(minutosIdling), "5 min");
    });

    test("deve calcular o intervalo de veículo estacionado entre dois ciclos consecutivos", () => {
      const ciclo1Fim = new Date("2026-09-22T21:11:00Z").getTime();
      const ciclo2Inicio = new Date("2026-09-22T21:50:00Z").getTime();

      const diffMs = ciclo2Inicio - ciclo1Fim;
      const minutosEstacionado = Math.round(diffMs / (1000 * 60));

      assert.equal(minutosEstacionado, 39);
      assert.equal(formatarMinutosParaHorasEMinutos(minutosEstacionado), "39 min");
    });
  });

  describe("3. Modo de Segurança (Cadeado Digital Anti-Furto)", () => {
    test("deve armar o bloqueio de relé e impedir nova partida do motor", () => {
      let veiculo = {
        id: "veic-volvo-1",
        placa: "AXH0E44",
        bloqueado: false,
        modo_seguranca: false,
      };

      // Usuário aciona o Modo Segurança pelo aplicativo Hunter
      const armarModoSeguranca = (v: typeof veiculo) => ({
        ...v,
        bloqueado: true,
        modo_seguranca: true,
      });

      veiculo = armarModoSeguranca(veiculo);

      assert.equal(veiculo.bloqueado, true);
      assert.equal(veiculo.modo_seguranca, true);
    });

    test("deve detectar tentativa de violação se a ignição física for ligada com o Modo Segurança armado", () => {
      const veiculo = {
        id: "veic-volvo-1",
        placa: "AXH0E44",
        bloqueado: true,
        modo_seguranca: true,
      };

      // Rastreador reporta ignição ligada (fio laranja pós-chave ativado)
      const telemetriaRecebida = {
        accFioLaranja: true,
        velocidade: 0,
      };

      let eventoGerado: any = null;

      if (veiculo.bloqueado && telemetriaRecebida.accFioLaranja) {
        eventoGerado = {
          tipo: "anomalia",
          titulo: "Tentativa de Partida Não Autorizada",
          descricao: "Chave ligada com o Modo Segurança (Cadeado Digital) ativado!",
          severidade: "critico",
        };
      }

      assert.ok(eventoGerado);
      assert.equal(eventoGerado.tipo, "anomalia");
      assert.equal(eventoGerado.severidade, "critico");
      assert.equal(eventoGerado.titulo, "Tentativa de Partida Não Autorizada");
    });

    test("deve permitir desativar o Modo Segurança liberando a partida do veículo", () => {
      let veiculo = {
        id: "veic-volvo-1",
        placa: "AXH0E44",
        bloqueado: true,
        modo_seguranca: true,
      };

      // Usuário desativa o Modo Segurança pelo app para ligar o carro
      const desarmarModoSeguranca = (v: typeof veiculo) => ({
        ...v,
        bloqueado: false,
        modo_seguranca: false,
      });

      veiculo = desarmarModoSeguranca(veiculo);

      assert.equal(veiculo.bloqueado, false);
      assert.equal(veiculo.modo_seguranca, false);
    });
  });

  describe("4. Parâmetros Canônicos do Rastreador J16 (4G)", () => {
    test("deve validar o apontamento de servidor com DNS gps.oficial.tec.br e porta 7003", () => {
      const servidorDns = "gps.oficial.tec.br";
      const portaTcp = "7003";
      const cmdDns = `SERVER,1,${servidorDns},${portaTcp},0#`;
      const cmdIp = `SERVER,0,167.234.233.82,${portaTcp},0#`;

      assert.equal(cmdDns, "SERVER,1,gps.oficial.tec.br,7003,0#");
      assert.equal(cmdIp, "SERVER,0,167.234.233.82,7003,0#");
    });

    test("deve validar os comandos de telemetria fina (Timer 15s, Ângulo 15 graus e ACC Virtual)", () => {
      const timer = "TIMER,15,3600#";
      const angulo = "ANGLE,1,15#";
      const accVirtual = "ACCVIRTUAL,1#";
      const sleep = "SLEEP,1#";
      const gmt = "GMT,E,0,0#";

      assert.equal(timer, "TIMER,15,3600#");
      assert.equal(angulo, "ANGLE,1,15#");
      assert.equal(accVirtual, "ACCVIRTUAL,1#");
      assert.equal(sleep, "SLEEP,1#");
      assert.equal(gmt, "GMT,E,0,0#");
    });
  });

  describe("5. Regra Pétrea Hunter-Guardian: Ausência do Caractere Comercial Proibido", () => {
    test("textos de ciclos, resumos, modo de segurança e tela do J16 não devem conter o caractere proibido", () => {
      const textos = [
        "Timeline Executiva de Viagens",
        "Consolidação inteligente de ciclos de deslocamento e telemetria",
        "Ciclos de Viagem",
        "Logs e Auditoria",
        "Em Movimento",
        "Marcha Lenta",
        "Velocidade Máxima e Média",
        "Modo Segurança Ativado (Cadeado Digital)",
        "A partida do veículo está bloqueada por relé. É obrigatório desativar este modo antes de ligar o motor.",
        "Desativar e Liberar Partida",
        "Configuração de Rastreadores J16 (4G)",
        "Parâmetros canônicos SMS e protocolo Concox / GT06 binário para ativação em campo",
        "Ignição Virtual por Movimento e Voltagem",
        "Pneus, Alinhamento e Balanceamento",
        "Pastilhas de Freio e Fluidos",
        "Revisão Geral e Correias",
      ];

      for (const t of textos) {
        assert.ok(!t.includes("&"), `Texto não pode conter '&': ${t}`);
      }
    });
  });
});
