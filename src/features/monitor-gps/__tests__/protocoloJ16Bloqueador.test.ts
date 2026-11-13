import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Protocolo J16 / GT06: Resposta de Comandos 0x15", () => {
  function decodificarRespostaComandoJ16(respostaAscii: string) {
    if (
      respostaAscii.includes("DYD=Success") ||
      respostaAscii.includes("RELAY,1=Success") ||
      respostaAscii.includes("DYD,000000=Success")
    ) {
      return {
        status: "sucesso_bloqueado",
        bloqueado: true,
        releStatus: true,
        mensagem: respostaAscii,
      };
    }

    if (respostaAscii.includes("Speed Limit") || respostaAscii.includes("DYD=Speed")) {
      return {
        status: "aguardando_reducao_velocidade",
        bloqueado: false,
        releStatus: false,
        mensagem:
          "Veículo em velocidade superior a 20 km/h. Corte suspenso por segurança e aguardando desaceleração.",
      };
    }

    if (
      respostaAscii.includes("HFYD=Success") ||
      respostaAscii.includes("RELAY,0=Success") ||
      respostaAscii.includes("HFYD,000000=Success")
    ) {
      return {
        status: "sucesso_desbloqueado",
        bloqueado: false,
        releStatus: false,
        mensagem: respostaAscii,
      };
    }

    return {
      status: "resposta_generica",
      bloqueado: null,
      releStatus: null,
      mensagem: respostaAscii,
    };
  }

  it("deve confirmar bloqueio e armar relé com resposta DYD=Success!", () => {
    const res = decodificarRespostaComandoJ16("DYD=Success!");
    assert.equal(res.status, "sucesso_bloqueado");
    assert.equal(res.bloqueado, true);
    assert.equal(res.releStatus, true);
  });

  it("deve confirmar bloqueio e armar relé com resposta RELAY,1=Success!", () => {
    const res = decodificarRespostaComandoJ16("RELAY,1=Success!");
    assert.equal(res.status, "sucesso_bloqueado");
    assert.equal(res.bloqueado, true);
    assert.equal(res.releStatus, true);
  });

  it("deve interceptar trava de segurança J16 quando veículo estiver acima de 20 km/h", () => {
    const res = decodificarRespostaComandoJ16("DYD=Speed Limit, Speed 42km/h");
    assert.equal(res.status, "aguardando_reducao_velocidade");
    assert.equal(res.bloqueado, false);
    assert.equal(res.releStatus, false);
    assert.ok(
      res.mensagem.includes("superior a 20 km/h") || res.mensagem.includes("acima de 20 km/h"),
    );
  });

  it("deve confirmar desbloqueio e desarme do relé com resposta HFYD=Success!", () => {
    const res = decodificarRespostaComandoJ16("HFYD=Success!");
    assert.equal(res.status, "sucesso_desbloqueado");
    assert.equal(res.bloqueado, false);
    assert.equal(res.releStatus, false);
  });
});

describe("Hunter — Tecnologias de Bloqueador e Incompatibilidade Técnica", () => {
  interface VeiculoTeste {
    placa: string;
    bloqueadorInstalado: boolean;
    tipoBloqueador?: "rele_combustivel" | "outro" | "sem_bloqueador";
    bloqueadorDetalhes?: string;
  }

  function validarEnvioComandoCorte(veiculo: VeiculoTeste, comando: string) {
    const isCorte = comando.startsWith("DYD") || comando.startsWith("RELAY,1");
    if (isCorte && (!veiculo.bloqueadorInstalado || veiculo.tipoBloqueador === "sem_bloqueador")) {
      return {
        permitido: false,
        motivo:
          "Comando cancelado: Veículo cadastrado sem bloqueador por incompatibilidade técnica.",
      };
    }
    return {
      permitido: true,
      tipoDispositivo: veiculo.tipoBloqueador || "rele_combustivel",
      detalhes: veiculo.bloqueadorDetalhes,
    };
  }

  it("deve recusar comando de corte caso veículo não possua bloqueador instalado", () => {
    const veiculoEletrico: VeiculoTeste = {
      placa: "ABC-1234",
      bloqueadorInstalado: false,
      tipoBloqueador: "sem_bloqueador",
    };

    const res = validarEnvioComandoCorte(veiculoEletrico, "DYD,000000#");
    assert.equal(res.permitido, false);
    assert.ok(res.motivo?.includes("sem bloqueador"));
  });

  it("deve permitir bloqueio em veículo com relé de corte convencional", () => {
    const veiculoRele: VeiculoTeste = {
      placa: "BRA-2E19",
      bloqueadorInstalado: true,
      tipoBloqueador: "rele_combustivel",
    };

    const res = validarEnvioComandoCorte(veiculoRele, "DYD,000000#");
    assert.equal(res.permitido, true);
    assert.equal(res.tipoDispositivo, "rele_combustivel");
  });

  it("deve permitir bloqueio personalizado com detalhes informados pelo instalador", () => {
    const veiculoHibrido: VeiculoTeste = {
      placa: "XYZ-9988",
      bloqueadorInstalado: true,
      tipoBloqueador: "outro",
      bloqueadorDetalhes: "Interrupção Chicote Bomba de Baixa Pressão",
    };

    const res = validarEnvioComandoCorte(veiculoHibrido, "DYD,000000#");
    assert.equal(res.permitido, true);
    assert.equal(res.tipoDispositivo, "outro");
    assert.equal(res.detalhes, "Interrupção Chicote Bomba de Baixa Pressão");
  });
});

describe("Hunter — Protocolo J16: Pacote de Alarme 0x16 e Telemetria GSM/Relé", () => {
  function decodificarAlarmeJ16(dados: {
    terminalInfo: number;
    voltageLevel: number;
    gsmSignal: number;
    alarmCode: number;
  }) {
    const releStatus = (dados.terminalInfo & 0x80) !== 0;
    const ignicao = (dados.terminalInfo & 0x02) !== 0;
    const alimentacaoExterna = (dados.terminalInfo & 0x04) !== 0 && dados.alarmCode !== 0x02;
    const gsmNivel = Math.min(4, Math.max(0, dados.gsmSignal));

    const temAlarmeAtivo = dados.alarmCode !== 0x00;
    let tipoAlerta = "posicao_normal";
    let severidade: "info" | "aviso" | "critico" = "info";

    if (dados.alarmCode !== 0x00) {
      tipoAlerta = "alarme_geral";
      severidade = "aviso";

      switch (dados.alarmCode) {
        case 0x01:
          tipoAlerta = "panico";
          severidade = "critico";
          break;
        case 0x02:
          tipoAlerta = "bateria_desconectada";
          severidade = "critico";
          break;
        case 0x03:
          tipoAlerta = "colisao_impacto";
          severidade = "critico";
          break;
        case 0x04:
          tipoAlerta = "cerca_entrada";
          severidade = "info";
          break;
        case 0x05:
          tipoAlerta = "cerca_saida";
          severidade = "aviso";
          break;
        case 0x06:
          tipoAlerta = "excesso_velocidade";
          severidade = "aviso";
          break;
        case 0x13:
          tipoAlerta = "violacao_dispositivo";
          severidade = "critico";
          break;
        default:
          break;
      }
    }

    return {
      releStatus,
      ignicao,
      alimentacaoExterna,
      gsmNivel,
      tipoAlerta,
      severidade,
      temAlarmeAtivo,
    };
  }

  it("deve tratar alarmCode 0x00 como transmissão normal sem entrar em condição de alerta", () => {
    const telemetria = decodificarAlarmeJ16({
      terminalInfo: 0x06, // ACC ligado, alimentação externa conectada
      voltageLevel: 6,
      gsmSignal: 4,
      alarmCode: 0x00,
    });

    assert.equal(telemetria.temAlarmeAtivo, false);
    assert.equal(telemetria.tipoAlerta, "posicao_normal");
    assert.equal(telemetria.severidade, "info");
    assert.equal(telemetria.ignicao, true);
    assert.equal(telemetria.alimentacaoExterna, true);
  });

  it("deve decodificar alarme de corte de energia 0x02 com severidade crítica", () => {
    const alarme = decodificarAlarmeJ16({
      terminalInfo: 0x02, // ACC ligado, alimentação externa cortada
      voltageLevel: 4,
      gsmSignal: 3,
      alarmCode: 0x02,
    });

    assert.equal(alarme.tipoAlerta, "bateria_desconectada");
    assert.equal(alarme.severidade, "critico");
    assert.equal(alarme.alimentacaoExterna, false);
    assert.equal(alarme.gsmNivel, 3);
  });

  it("deve decodificar alarme de pânico SOS 0x01 e refletir status do relé", () => {
    const alarme = decodificarAlarmeJ16({
      terminalInfo: 0x86, // Bit 7 (relé acionado), Bit 2 (alim ext), Bit 1 (ignicao)
      voltageLevel: 6,
      gsmSignal: 4,
      alarmCode: 0x01,
    });

    assert.equal(alarme.tipoAlerta, "panico");
    assert.equal(alarme.severidade, "critico");
    assert.equal(alarme.releStatus, true);
    assert.equal(alarme.gsmNivel, 4);
  });

  it("deve normalizar sinal GSM dentro da faixa 0 a 4 barras", () => {
    const alarme1 = decodificarAlarmeJ16({
      terminalInfo: 0x06,
      voltageLevel: 6,
      gsmSignal: 5, // Fora do intervalo
      alarmCode: 0x06,
    });
    assert.equal(alarme1.gsmNivel, 4);

    const alarme2 = decodificarAlarmeJ16({
      terminalInfo: 0x06,
      voltageLevel: 6,
      gsmSignal: 0,
      alarmCode: 0x06,
    });
    assert.equal(alarme2.gsmNivel, 0);
  });
});

describe("Hunter — Sigilo Operacional: Ocultação do Tipo de Bloqueador em Tela", () => {
  function podeVisualizarTipoBloqueador(
    session:
      | {
          isSuperAdmin?: boolean;
          isAdmin?: boolean;
          isOperador?: boolean;
          isCliente?: boolean;
          isMotorista?: boolean;
          role?: string;
        }
      | null
      | undefined,
  ): boolean {
    return Boolean(session?.isSuperAdmin || session?.isAdmin || session?.isOperador);
  }

  it("NUNCA deve permitir que cliente visualize a informação de tipo de bloqueio", () => {
    const sessionCliente = {
      isCliente: true,
      isMotorista: false,
      isAdmin: false,
      isSuperAdmin: false,
      isOperador: false,
      role: "cliente",
    };
    assert.equal(
      podeVisualizarTipoBloqueador(sessionCliente),
      false,
      "Cliente não deve ter acesso a dados do tipo de bloqueador",
    );
  });

  it("NUNCA deve permitir que motorista visualize a informação de tipo de bloqueio", () => {
    const sessionMotorista = {
      isCliente: false,
      isMotorista: true,
      isAdmin: false,
      isSuperAdmin: false,
      isOperador: false,
      role: "motorista",
    };
    assert.equal(
      podeVisualizarTipoBloqueador(sessionMotorista),
      false,
      "Motorista não deve ter acesso a dados do tipo de bloqueador",
    );
  });

  it("DEVE permitir que SuperADM visualize a informação técnica de bloqueio", () => {
    const sessionSuperAdmin = {
      isCliente: false,
      isMotorista: false,
      isAdmin: true,
      isSuperAdmin: true,
      isOperador: false,
      role: "superadmin",
    };
    assert.equal(podeVisualizarTipoBloqueador(sessionSuperAdmin), true);
  });

  it("DEVE permitir que Administrador visualize a informação técnica de bloqueio", () => {
    const sessionAdmin = {
      isCliente: false,
      isMotorista: false,
      isAdmin: true,
      isSuperAdmin: false,
      isOperador: false,
      role: "admin",
    };
    assert.equal(podeVisualizarTipoBloqueador(sessionAdmin), true);
  });

  it("DEVE permitir que Operador visualize a informação técnica de bloqueio", () => {
    const sessionOperador = {
      isCliente: false,
      isMotorista: false,
      isAdmin: false,
      isSuperAdmin: false,
      isOperador: true,
      role: "operador",
    };
    assert.equal(podeVisualizarTipoBloqueador(sessionOperador), true);
  });

  it("deve bloquear visualização se usuário for anônimo ou sem sessão", () => {
    assert.equal(podeVisualizarTipoBloqueador(null), false);
    assert.equal(podeVisualizarTipoBloqueador(undefined), false);
  });
});
