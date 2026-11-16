// ─────────────────────────────────────────────────────────────────────────────
// Padrão Canônico Homologado do Sistema (Fábrica / Produção GD Rastreamento)
// Extraído de RastreadorJ16View para conformidade com React Fast Refresh
// ─────────────────────────────────────────────────────────────────────────────

export const VALORES_PADRAO_CANONICO_J16 = {
  servidorDns: "gps.oficial.tec.br",
  portaTcp: "7003",
  ipDedicado: "167.234.233.82",
  usarIpDireto: true, // Padrão Oficial Canônico: Conexão via IP Dedicado direto sem overhead DNS
  apnNome: "voxter.br",
  apnUser: "algar",
  apnPass: "1212",
  timerMovimento: "30", // Padrão Ouro Equilibrado: 30s em movimento em retas (economia de 50% de dados e curvas preservadas)
  timerParado: "3600", // Padrão Homologado Voxter: 3600s (1 hora) parado na garagem para cessar tráfego e proteger bateria
  hbtLigado: "300", // Padrão Homologado Voxter: 300s (5 min) mantém NAT e socket TCP sem desperdício de dados
  hbtDesligado: "300", // Padrão Homologado Voxter: 300s (5 min) repouso celular de baixo consumo e túnel aberto para comandos
  anguloHabilitarCmd: "SZCS#ANGLE,SEND=1",
  anguloIntervalo: "10",
  anguloGrau: "20", // Padrão Ouro: Inflexão de 20° desenha curvas perfeitas sem disparos em retas
  numeroSos: "5524992494030", // Padrão Canônico: WhatsApp do Cliente Titular (Dario Novaes)
  numeroCenter: "5524992494030", // Padrão Canônico: WhatsApp do Cliente Titular (Dario Novaes)
  senhaDispositivoPadrao: "123456", // Senha Mestre do Rastreador (Padrão 123456 ou definida pelo usuário)
  senhaDispositivoCmd: "PASSWORD,<senha antiga>,<nova senha>#", // Indicação canônica de parâmetros (sem senha fixa)
  ignicaoFisicaCmd: "SZCS#ACCLINE=1",
  medicaoInternaMeterCmd: "SZCS#GT06SEL=1#GT06METER=1",
  voltagemOdometroIexvolCmd: "SZCS#GT06IEXVOL=2",
  sleepMtkCmd: "SZCS#MTK_DISSLP=0",
  sleepGpsCmd: "SZCS#GPS_DISSLP=0",
  gmtComando: "GMT,W,0,0#",
  ledsComando: "SZCS#LED_ENABLE=0",
  paramComando: "PARAM#",
  statusComando: "STATUS#",
  relayConsultaComando: "RELAY#",
  alertaGuinchoCmd: "MOVING,ON,200,0#",
  defenseCmd: "DEFENSE,1#",
  senalmCmd: "SENALM,ON,0#",
  bateriaFracaCmd: "BATALM,ON,0#",
  bateriaCortadaCmd: "POWERALM,ON,0,5,10#",
  alertaIgnicaoImediataCmd: "ACCALM,ON,2#", // Alarme Instantâneo de Ignição / ACC (elimina lag de desligado)
  modoVeiculoSleepCmd: "SZCS#SLPDISCONNECT=0",
  economiaParadaCmd: "SENDS,1#",
  sensorGSensibilidadeCmd: "LEVEL,3#",
  resetFinalCmd: "RESET#",
};

export const CHECKBOXES_PADRAO_CANONICO_J16: Record<string, boolean> = {
  servidorDns: false, // DNS desmarcado no padrão oficial em favor do IP direto
  portaTcp: true,
  ipDedicado: true, // IP dedicado direto marcado por padrão
  apnNome: true,
  apnUser: true,
  apnPass: true,
  timerMovimento: true,
  timerParado: true,
  hbtLigado: true,
  hbtDesligado: true,
  anguloHabilitar: true, // Pré-requisito de hardware para detecção angular de curva
  anguloIntervalo: true,
  anguloGrau: true,
  numeroSos: false, // Opcional
  numeroCenter: false, // Opcional
  senhaDispositivoPadrao: false,
  senhaDispositivo: false, // Opcional (Senha master de proteção SMS)
  ignicaoFisica: true, // Pré-requisito físico (fio laranja) para sleep e alarmes
  medicaoInternaMeter: true, // Acumulador de odômetro da MCU J16
  voltagemOdometroIexvol: true, // Pré-requisito para pacote estendido GT06 com voltagem 12V e odômetro
  sleepMtk: true, // Sono da CPU MTK ao estacionar para economizar bateria
  sleepGps: true, // Repouso do GPS ao parar
  gmtUniversal: true,
  ledsDiagnostico: true,
  paramDiagnostico: false, // Desmarcado por padrão no lote inicial (leitura não deve rodar antes do RESET)
  statusDiagnostico: false, // Desmarcado por padrão no lote inicial (consulta não deve rodar antes do RESET)
  relayDiagnostico: false, // Desmarcado por padrão no lote inicial (auditoria não deve rodar antes do RESET)
  alertaGuincho: true,
  defenseAlarme: true,
  senalmVibracao: true,
  bateriaFraca: true,
  bateriaCortada: true,
  alertaIgnicaoImediata: true, // Alarme imediato de ignição ligada/desligada via GPRS
  modoVeiculoSleep: true,
  economiaParada: true,
  sensorGSensibilidade: true,
  resetFinal: true, // O ÚLTIMO COMANDO OBRIGATÓRIO (reinicia MCU e reconecta limpo à Lara)
};

export const STORAGE_KEY_CONFIG_PADRAO_SISTEMA = "hunter_j16_config_padrao_sistema";
export const VERSAO_PADRAO_SISTEMA_J16 = "2.1.6.62-gd-seguranca-porta-7003-tcp-isolada";

export const obterConfigPadraoSistemaJ16 = (): {
  valores: typeof VALORES_PADRAO_CANONICO_J16;
  checkboxes: Record<string, boolean>;
} => {
  if (typeof window !== "undefined") {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed && typeof parsed === "object") {
          // Se for versão anterior ou possuir parâmetros legados, auto-migra compulsoriamente para o Padrão Voxter Homologado
          const timerParadoNum = Number(parsed.valores?.timerParado) || 0;
          const hbtDesligadoNum = Number(parsed.valores?.hbtDesligado) || 0;
          const hbtLigadoNum = Number(parsed.valores?.hbtLigado) || 0;

          const isLegado =
            parsed.versao !== VERSAO_PADRAO_SISTEMA_J16 ||
            parsed.valores?.portaTcp !== VALORES_PADRAO_CANONICO_J16.portaTcp ||
            parsed.valores?.servidorDns !== VALORES_PADRAO_CANONICO_J16.servidorDns ||
            parsed.valores?.ipDedicado !== VALORES_PADRAO_CANONICO_J16.ipDedicado ||
            timerParadoNum < 3600 ||
            hbtDesligadoNum < 300 ||
            hbtLigadoNum < 300 ||
            parsed.valores?.timerMovimento !== "30" ||
            parsed.valores?.usarIpDireto !== true ||
            parsed.checkboxes?.servidorDns === true ||
            parsed.checkboxes?.ipDedicado === false ||
            parsed.valores?.anguloGrau !== "20" ||
            parsed.valores?.senhaDispositivoCmd?.includes("161514") ||
            parsed.valores?.senhaDispositivoCmd?.includes("672904");

          if (isLegado) {
            const migrado = {
              versao: VERSAO_PADRAO_SISTEMA_J16,
              valores: {
                ...VALORES_PADRAO_CANONICO_J16,
                numeroSos: parsed.valores?.numeroSos || VALORES_PADRAO_CANONICO_J16.numeroSos,
                numeroCenter:
                  parsed.valores?.numeroCenter || VALORES_PADRAO_CANONICO_J16.numeroCenter,
                senhaDispositivoPadrao:
                  parsed.valores?.senhaDispositivoPadrao ||
                  VALORES_PADRAO_CANONICO_J16.senhaDispositivoPadrao,
                senhaDispositivoCmd: VALORES_PADRAO_CANONICO_J16.senhaDispositivoCmd,
              },
              checkboxes: {
                ...CHECKBOXES_PADRAO_CANONICO_J16,
              },
            };
            try {
              localStorage.setItem(STORAGE_KEY_CONFIG_PADRAO_SISTEMA, JSON.stringify(migrado));
              localStorage.setItem(
                "hunter_j16_batch_params_habilitados",
                JSON.stringify(CHECKBOXES_PADRAO_CANONICO_J16),
              );
            } catch {
              // Silencioso
            }
            return {
              valores: migrado.valores,
              checkboxes: migrado.checkboxes,
            };
          }

          return {
            valores: {
              ...VALORES_PADRAO_CANONICO_J16,
              ...(parsed.valores || {}),
              numeroSos: parsed.valores?.numeroSos || VALORES_PADRAO_CANONICO_J16.numeroSos,
              numeroCenter:
                parsed.valores?.numeroCenter || VALORES_PADRAO_CANONICO_J16.numeroCenter,
              usarIpDireto: true,
              timerMovimento: "30",
              anguloGrau: "20",
              senhaDispositivoCmd: "PASSWORD,<senha antiga>,<nova senha>#",
              timerParado: String(Math.min(3600, Math.max(60, timerParadoNum || 3600))),
              hbtLigado: String(Math.min(300, Math.max(30, hbtLigadoNum || 300))),
              hbtDesligado: String(Math.min(600, Math.max(30, hbtDesligadoNum || 300))),
            },
            checkboxes: {
              ...CHECKBOXES_PADRAO_CANONICO_J16,
              ...(parsed.checkboxes || {}),
              ipDedicado: true,
              servidorDns: false,
            },
          };
        }
      }
    } catch (err) {
      console.warn("Falha ao recuperar config padrão do sistema do localStorage", err);
    }
  }
  return {
    valores: VALORES_PADRAO_CANONICO_J16,
    checkboxes: CHECKBOXES_PADRAO_CANONICO_J16,
  };
};
