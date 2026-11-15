import { useState, useEffect, useRef, useCallback } from "react";
import {
  Usb,
  Cpu,
  Terminal,
  RefreshCw,
  Send,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Wifi,
  Radio,
  Radar,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { obterSessaoCacheada } from "@/features/auth/services/authService";
import { formatarHoraBrasil } from "@/shared/lib/formatadoresBrasil";
import {
  ehComandoConsultaSomenteLeitura,
  sanitizarComandoHardware,
} from "@/shared/lib/hunterHardwareComandos";
import { obterConfigPadraoSistemaJ16 } from "../lib/rastreadorJ16Constantes";
import {
  type FamiliaProtocolo,
  type ProtocoloHardwareDef,
  PROTOCOLOS_BANCADA,
} from "../lib/protocolosBancada";

interface LogLinhaSerial {
  id: string;
  dataHora: string;
  tipo: "TX" | "RX" | "SISTEMA" | "ERRO";
  conteudo: string;
}

interface DadosDispositivoBancada {
  imei?: string | null;
  iccid?: string | null;
  operadora?: string | null;
  modelo?: string | null;
  versaoFirmware?: string | null;
  servidorAtual?: string | null;
  portaAtual?: string | null;
  apnAtual?: string | null;
  sinalCsq?: string | null;
  cadastradoNoSistema?: boolean;
  veiculoVinculado?: string | null;
  statusEstoque?: string | null;
}

export function AbaConfiguracaoUsb() {
  // Suporte Unificado: WebUSB Direto + Web Serial API
  const [suportado, setSuportado] = useState<boolean>(true);
  const [tipoConexao, setTipoConexao] = useState<"webusb" | "webserial" | null>(null);
  const [conectado, setConectado] = useState<boolean>(false);
  const [conectando, setConectando] = useState<boolean>(false);
  const [infoPorta, setInfoPorta] = useState<string>("");
  const [interfaceAtivaUsb, setInterfaceAtivaUsb] = useState<number | null>(null);
  const [interfacesDisponiveisUsb, setInterfacesDisponiveisUsb] = useState<number[]>([]);

  // Família de Protocolo Homologado (WanWay/Concox GT06, Modem Celular AT, Coban/TK)
  const [familiaProtocolo, setFamiliaProtocolo] = useState<FamiliaProtocolo>("concox_wanway");
  const familiaProtocoloRef = useRef<FamiliaProtocolo>(familiaProtocolo);
  useEffect(() => {
    familiaProtocoloRef.current = familiaProtocolo;
  }, [familiaProtocolo]);
  const protocoloAtivoDef = PROTOCOLOS_BANCADA[familiaProtocolo];

  // Parâmetros de Conexão Serial
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [terminador, setTerminador] = useState<string>("HASH"); // Padrão 4G: HASH (#), CRLF (\r\n), LF (\n), NENHUM

  // Auto-Detecção Inteligente de Protocolo e Handshake
  const [varreduraAtiva, setVarreduraAtiva] = useState<boolean>(false);
  const [protocoloDetectado, setProtocoloDetectado] = useState<string | null>(null);
  const varreduraCanceladaRef = useRef<boolean>(false);
  const ultimaRespostaRxRef = useRef<{ timestamp: number; conteudo: string } | null>(null);

  // Logs e Terminal
  const [logs, setLogs] = useState<LogLinhaSerial[]>([]);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [comandoManual, setComandoManual] = useState<string>("");
  const [historicoComandos, setHistoricoComandos] = useState<string[]>([]);
  const [indiceHistorico, setIndiceHistorico] = useState<number>(-1);
  const [copiado, setCopiado] = useState<boolean>(false);

  // Campos de Configuração Rápida sincronizados com os Parâmetros Canônicos do Sistema
  const configPadrao = obterConfigPadraoSistemaJ16();
  const [servidorDns, setServidorDns] = useState<string>(
    configPadrao.valores.usarIpDireto
      ? configPadrao.valores.ipDedicado
      : configPadrao.valores.servidorDns || "gps.oficial.tec.br",
  );
  const [portaTcp, setPortaTcp] = useState<string>(configPadrao.valores.portaTcp || "7002");
  const [modoIpDns, setModoIpDns] = useState<string>(configPadrao.valores.usarIpDireto ? "0" : "1"); // 1 = DNS, 0 = IP
  const [apnNome, setApnNome] = useState<string>(configPadrao.valores.apnNome || "voxter.br");
  const [apnUser, setApnUser] = useState<string>(configPadrao.valores.apnUser || "algar");
  const [apnPass, setApnPass] = useState<string>(configPadrao.valores.apnPass || "1212");
  const [timerMovimento, setTimerMovimento] = useState<string>(
    configPadrao.valores.timerMovimento || "30",
  );
  const [timerParado, setTimerParado] = useState<string>(
    configPadrao.valores.timerParado || "3600",
  );
  const [heartbeatTempo, setHeartbeatTempo] = useState<string>(
    configPadrao.valores.hbtLigado || "300",
  );

  // Estado para Gravação em Lote do Padrão Canônico
  const [gravandoPadraoCanonico, setGravandoPadraoCanonico] = useState<boolean>(false);
  const [autoGravarAoConectar, setAutoGravarAoConectar] = useState<boolean>(() => {
    try {
      const salvo = localStorage.getItem("hunter_usb_autograve_padrao");
      return salvo !== null ? salvo === "true" : true;
    } catch {
      return true;
    }
  });
  const autoGravarAoConectarRef = useRef<boolean>(autoGravarAoConectar);
  useEffect(() => {
    autoGravarAoConectarRef.current = autoGravarAoConectar;
  }, [autoGravarAoConectar]);

  const gravarPadraoCanonicoCompletoRef = useRef<(() => Promise<void>) | null>(null);

  const [progressoCanonico, setProgressoCanonico] = useState<{
    passo: number;
    total: number;
    descricao: string;
  } | null>(null);

  // Detecção Automática do IMEI e Equipamento na Bancada
  const [dadosBancada, setDadosBancada] = useState<DadosDispositivoBancada>({});
  const [verificandoImei, setVerificandoImei] = useState<boolean>(false);
  const [filtroUmToque, setFiltroUmToque] = useState<"todos" | "consulta" | "acao">("todos");
  const [gravandoViaGatewayTcp, setGravandoViaGatewayTcp] = useState<boolean>(false);

  // Referências para Web Serial
  const portaSerialRef = useRef<any>(null);
  const leitorRef = useRef<any>(null);
  const escritorRef = useRef<any>(null);

  // Referências para WebUSB Nativo (Sem necessidade de drivers no OS)
  const usbDeviceRef = useRef<any>(null);
  const interfaceEscolhidaRef = useRef<number | null>(null);
  const epInRef = useRef<number | null>(null);
  const epOutRef = useRef<number | null>(null);

  const loopLeituraAtivoRef = useRef<boolean>(false);
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  // Consulta do IMEI no Supabase
  const consultarImeiNoSistema = useCallback(async (imei: string) => {
    setVerificandoImei(true);
    try {
      const { data: rastreador, error } = await supabase
        .from("rastreadores")
        .select("id, imei, modelo, status")
        .eq("imei", imei)
        .maybeSingle();

      if (error) {
        console.warn("Erro ao consultar rastreador no banco:", error);
        return;
      }

      if (rastreador) {
        // Busca instalação vinculada se houver
        const { data: instalacao } = await supabase
          .from("instalacoes")
          .select("id, veiculo_id, veiculos(placa, modelo)")
          .eq("rastreador_id", rastreador.id)
          .eq("status", "instalado")
          .maybeSingle();

        const veiculoDesc = (instalacao?.veiculos as any)?.placa
          ? `${(instalacao?.veiculos as any)?.placa} (${(instalacao?.veiculos as any)?.modelo || "Veículo"})`
          : null;

        setDadosBancada((prev) => ({
          ...prev,
          cadastradoNoSistema: true,
          modelo: rastreador.modelo,
          statusEstoque: rastreador.status,
          veiculoVinculado: veiculoDesc,
        }));

        toast.success(
          `Dispositivo identificado: IMEI ${imei} já cadastrado no sistema (${rastreador.status}).`,
        );
      } else {
        setDadosBancada((prev) => ({
          ...prev,
          cadastradoNoSistema: false,
          statusEstoque: "Novo / Não Cadastrado",
          veiculoVinculado: null,
        }));
        toast.info(
          `IMEI ${imei} detectado na bancada serial. Pronto para configuração e cadastro no GD Rastreamento.`,
        );
      }
    } catch (e: any) {
      console.warn("Falha ao verificar IMEI:", e);
    } finally {
      setVerificandoImei(false);
    }
  }, []);

  // Analisador de respostas seriais do rastreador
  const analisarRespostaHardware = useCallback(
    async (texto: string) => {
      const limpo = texto.trim();
      if (!limpo) return;

      // Detecção de IMEI (sequência de 15 dígitos com ou sem prefixo)
      const matchImei = limpo.match(/(?:IMEI[:=,\s]?)(\d{15})/i) || limpo.match(/\b(\d{15})\b/);
      if (matchImei && matchImei[1]) {
        const imeiDetectado = matchImei[1];
        setDadosBancada((prev) => ({ ...prev, imei: imeiDetectado }));
        consultarImeiNoSistema(imeiDetectado);
      }

      // Detecção de ICCID do Chip M2M (+CCID: 8955... ou ICCID: ...)
      const matchIccid =
        limpo.match(/\+?I?CCID[:=\s]+(\d{18,22})/i) || limpo.match(/\b(89\d{16,20})\b/);
      if (matchIccid && matchIccid[1]) {
        setDadosBancada((prev) => ({
          ...prev,
          iccid: matchIccid[1],
        }));
      }

      // Detecção de Operadora (+COPS: 0,0,"Vivo",7)
      const matchCops = limpo.match(/\+COPS:\s*\d+,\d+,"([^"]+)"/i);
      if (matchCops && matchCops[1]) {
        setDadosBancada((prev) => ({
          ...prev,
          operadora: matchCops[1].trim(),
        }));
      }

      // Detecção de Servidor / IP / Porta
      const matchServer =
        limpo.match(/SERVER[:=,\s](?:[0-1],)?([a-zA-Z0-9._-]+),(\d+)/i) ||
        limpo.match(/IP[:=,\s]([a-zA-Z0-9._-]+)[;,]\s*Port[:=,\s]*(\d+)/i) ||
        limpo.match(/IP[:=,\s]([a-zA-Z0-9._-]+),(\d+)/i);
      if (matchServer) {
        setDadosBancada((prev) => ({
          ...prev,
          servidorAtual: matchServer[1],
          portaAtual: matchServer[2],
        }));
      }

      // Detecção de APN (Concox APN: ou Modem AT +CGDCONT: 1,"IP","voxter.br")
      const matchCgDcont = limpo.match(/\+CGDCONT:\s*\d+,"[^"]*","([^"]+)"/i);
      const matchApn = limpo.match(/APN[:=,\s]([a-zA-Z0-9._-]+)/i);
      const apnExtraida = matchCgDcont?.[1] || matchApn?.[1];
      if (apnExtraida && !apnExtraida.toUpperCase().includes("OK")) {
        setDadosBancada((prev) => ({
          ...prev,
          apnAtual: apnExtraida.trim(),
        }));
      }

      // Detecção de Sinal Celular (+CSQ: 24,99)
      const matchCsq = limpo.match(/\+CSQ:\s*(\d+)(?:,\d+)?/i);
      if (matchCsq) {
        const csqVal = parseInt(matchCsq[1], 10);
        let desc = `${csqVal}/31`;
        if (csqVal === 99) desc += " (Sem Sinal)";
        else if (csqVal >= 20) desc += " (Excelente)";
        else if (csqVal >= 14) desc += " (Bom)";
        else if (csqVal >= 8) desc += " (Regular)";
        else desc += " (Fraco)";

        setDadosBancada((prev) => ({
          ...prev,
          sinalCsq: desc,
        }));
      }

      // Detecção de Fabricante / Modelo do Chipset via ATI
      const matchChip =
        limpo.match(/(?:Model|Manufacturer|Product|Chipset)[:=\s]+([^\r\n#;]+)/i) ||
        (limpo.startsWith("SIMCOM") ||
        limpo.startsWith("QUECTEL") ||
        limpo.startsWith("ASR") ||
        limpo.startsWith("MARVELL") ||
        limpo.startsWith("CONCOX") ||
        limpo.startsWith("WANWAY")
          ? [null, limpo]
          : null);

      if (matchChip && matchChip[1]) {
        const modDetectado = matchChip[1].trim();
        setDadosBancada((prev) => ({
          ...prev,
          modelo: prev.modelo || modDetectado,
        }));
      }

      // Detecção de Versão de Firmware (Concox VERSION: ou SIMCom Revision:)
      const matchVer =
        limpo.match(/VER(?:SION)?[:=,\s]([^\r\n#;]+)/i) ||
        limpo.match(/Revision[:=\s]+([^\r\n#;]+)/i);
      if (matchVer) {
        setDadosBancada((prev) => ({
          ...prev,
          versaoFirmware: matchVer[1].trim(),
        }));
      }
    },
    [consultarImeiNoSistema],
  );

  const adicionarLog = useCallback(
    (tipo: "TX" | "RX" | "SISTEMA" | "ERRO", conteudo: string) => {
      const novaLinha: LogLinhaSerial = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        dataHora: formatarHoraBrasil(new Date()),
        tipo,
        conteudo,
      };

      setLogs((prev) => {
        // Mantém as últimas 500 linhas no terminal para não sobrecarregar memória
        const atualizados = [...prev, novaLinha];
        if (atualizados.length > 500) {
          return atualizados.slice(atualizados.length - 500);
        }
        return atualizados;
      });

      // Tenta analisar respostas RX para extrair IMEI e dados de configuração
      if (tipo === "RX") {
        ultimaRespostaRxRef.current = {
          timestamp: Date.now(),
          conteudo,
        };
        analisarRespostaHardware(conteudo);
      }
    },
    [analisarRespostaHardware],
  );

  // Comutação canônica e atômica da Família de Protocolo
  const alternarFamiliaProtocolo = useCallback(
    (novaFamilia: FamiliaProtocolo, silencioso = false) => {
      setFamiliaProtocolo(novaFamilia);
      familiaProtocoloRef.current = novaFamilia;
      const def = PROTOCOLOS_BANCADA[novaFamilia];
      setTerminador(def.terminador);
      if (!silencioso) {
        adicionarLog("SISTEMA", `🎯 Protocolo ativo comutado para: ${def.nome} (${def.badge}).`);
        toast.info(`Protocolo alterado para ${def.nome}`);
      }
    },
    [adicionarLog],
  );

  // Desconectar dispositivo (WebUSB ou Web Serial)
  const desconectarDispositivo = useCallback(
    async (mostrarToast = true) => {
      varreduraCanceladaRef.current = true;
      setVarreduraAtiva(false);
      setProtocoloDetectado(null);
      loopLeituraAtivoRef.current = false;

      // Desconexão WebUSB
      if (usbDeviceRef.current) {
        try {
          if (interfaceEscolhidaRef.current !== null) {
            await usbDeviceRef.current.releaseInterface(interfaceEscolhidaRef.current);
          }
          await usbDeviceRef.current.close();
        } catch (err) {
          console.debug("Erro ao fechar WebUSB:", err);
        }
        usbDeviceRef.current = null;
        interfaceEscolhidaRef.current = null;
        epInRef.current = null;
        epOutRef.current = null;
      }

      // Desconexão Web Serial
      if (leitorRef.current) {
        try {
          await leitorRef.current.cancel();
        } catch (err) {
          console.debug("Leitor serial cancelado:", err);
        }
        try {
          leitorRef.current.releaseLock();
        } catch (err) {
          console.debug("Lock do leitor liberado:", err);
        }
        leitorRef.current = null;
      }

      if (escritorRef.current) {
        try {
          await escritorRef.current.releaseLock();
        } catch (err) {
          console.debug("Lock do escritor liberado:", err);
        }
        escritorRef.current = null;
      }

      if (portaSerialRef.current) {
        try {
          await portaSerialRef.current.close();
        } catch (err) {
          console.warn("Erro ao fechar porta serial:", err);
        }
        portaSerialRef.current = null;
      }

      setTipoConexao(null);
      setConectado(false);
      setInfoPorta("");
      setInterfaceAtivaUsb(null);
      setInterfacesDisponiveisUsb([]);
      adicionarLog("SISTEMA", "Dispositivo desconectado.");
      if (mostrarToast) {
        toast.info("Dispositivo desconectado.");
      }
    },
    [adicionarLog],
  );

  // Checagem de suporte à WebUSB e Web Serial na inicialização
  useEffect(() => {
    const hasSerial = "serial" in navigator;
    const hasUsb = "usb" in navigator;
    const isSupported = hasSerial || hasUsb;
    setSuportado(isSupported);

    if (isSupported) {
      adicionarLog(
        "SISTEMA",
        "Suporte USB Nativo Operacional (WebUSB e Web Serial). Conecte o cabo USB do rastreador ao Mac/PC e clique em 'Conectar Cabo USB Direto'.",
      );
    } else {
      adicionarLog(
        "ERRO",
        "WebUSB e Web Serial não suportadas neste navegador. Utilize Google Chrome, Microsoft Edge, Opera ou Brave para comunicação USB direta.",
      );
    }

    return () => {
      desconectarDispositivo(false);
    };
  }, [adicionarLog, desconectarDispositivo]);

  // Rolagem automática do terminal
  useEffect(() => {
    if (autoScroll && terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Loop de leitura da porta serial (Web Serial)
  const iniciarLoopLeituraSerial = async (porta: any) => {
    loopLeituraAtivoRef.current = true;
    let bufferAcumulado = "";

    try {
      while (porta.readable && loopLeituraAtivoRef.current) {
        leitorRef.current = porta.readable.getReader();
        try {
          while (true) {
            const { value, done } = await leitorRef.current.read();
            if (done) break;
            if (value) {
              const textoDecodificado = new TextDecoder().decode(value);
              bufferAcumulado += textoDecodificado;

              if (
                bufferAcumulado.includes("\n") ||
                bufferAcumulado.includes("\r") ||
                bufferAcumulado.includes("#")
              ) {
                const linhas = bufferAcumulado.split(/(?<=\n|\r|#)/);
                bufferAcumulado = linhas.pop() || "";

                for (const linha of linhas) {
                  const limpa = linha.trim();
                  if (limpa) adicionarLog("RX", limpa);
                }
              }
            }
          }
        } catch (readErr: any) {
          if (loopLeituraAtivoRef.current) {
            console.warn("Erro temporário na leitura serial:", readErr);
          }
        } finally {
          if (leitorRef.current) {
            try {
              leitorRef.current.releaseLock();
            } catch (err) {
              console.debug("Lock de leitura liberado:", err);
            }
            leitorRef.current = null;
          }
        }
      }
    } catch (err: any) {
      if (loopLeituraAtivoRef.current) {
        adicionarLog("ERRO", `Interrupção no canal serial: ${err.message || String(err)}`);
      }
    }
  };

  // Loop de leitura de dados via WebUSB Nativo
  const iniciarLoopLeituraUsb = async (device: any, epIn: number) => {
    loopLeituraAtivoRef.current = true;
    let bufferAcumulado = "";

    try {
      while (loopLeituraAtivoRef.current && device.opened) {
        try {
          const result = await device.transferIn(epIn, 4096);
          if (result.data && result.data.byteLength > 0) {
            const textoDecodificado = new TextDecoder().decode(result.data);
            bufferAcumulado += textoDecodificado;

            if (
              bufferAcumulado.includes("\n") ||
              bufferAcumulado.includes("\r") ||
              bufferAcumulado.includes("#")
            ) {
              const linhas = bufferAcumulado.split(/(?<=\n|\r|#)/);
              bufferAcumulado = linhas.pop() || "";

              for (const linha of linhas) {
                const limpa = linha.trim();
                if (limpa) adicionarLog("RX", limpa);
              }
            }
          }
        } catch (readErr: any) {
          const msg = String(readErr?.message || "").toLowerCase();
          // Desconexão real do hardware USB
          if (
            msg.includes("the device was disconnected") ||
            msg.includes("device is closed") ||
            (device && !device.opened)
          ) {
            loopLeituraAtivoRef.current = false;
            desconectarDispositivo(false);
            adicionarLog(
              "ERRO",
              "⚠️ Conexão USB encerrada pelo sistema operacional. O dispositivo foi desconectado.",
            );
            break;
          }

          // Se for stall, babble ou erro transitório do endpoint IN, limpa a condição de halt
          try {
            if (device && device.opened) {
              await device.clearHalt("in", epIn);
            }
          } catch (haltErr) {
            if (!device || !device.opened) {
              loopLeituraAtivoRef.current = false;
              desconectarDispositivo(false);
              break;
            }
          }

          if (loopLeituraAtivoRef.current) {
            // Pequeno delay para proteger CPU em caso de buffer vazio
            await new Promise((resolve) => setTimeout(resolve, 60));
          }
        }
      }
    } catch (err: any) {
      if (loopLeituraAtivoRef.current) {
        adicionarLog("ERRO", `Interrupção no canal WebUSB: ${err.message || String(err)}`);
      }
    }
  };

  // Alternar entre canais/interfaces do modem USB (ex: Interface 5 e 4)
  const alternarInterfaceUsb = async (novaInterfaceNum: number) => {
    if (!usbDeviceRef.current || tipoConexao !== "webusb") return;
    const device = usbDeviceRef.current;
    adicionarLog("SISTEMA", `Alternando canal para Interface #${novaInterfaceNum}...`);

    try {
      loopLeituraAtivoRef.current = false;
      if (interfaceEscolhidaRef.current !== null) {
        try {
          await device.releaseInterface(interfaceEscolhidaRef.current);
        } catch (e) {
          console.debug("Release interface anterior:", e);
        }
      }

      const iface = device.configuration.interfaces.find(
        (i: any) => i.interfaceNumber === novaInterfaceNum,
      );
      const alt = iface?.alternates?.[0];
      const inEndpoint = alt?.endpoints?.find(
        (e: any) => e.direction === "in" && e.type === "bulk",
      );
      const outEndpoint = alt?.endpoints?.find(
        (e: any) => e.direction === "out" && e.type === "bulk",
      );

      if (!inEndpoint || !outEndpoint) {
        throw new Error(`Endpoints Bulk não encontrados na Interface #${novaInterfaceNum}.`);
      }

      await device.claimInterface(novaInterfaceNum);

      // Ativa linhas CDC DTR e RTS
      try {
        await device.controlTransferOut({
          requestType: "class",
          recipient: "interface",
          request: 0x22,
          value: 0x03,
          index: novaInterfaceNum,
        });
      } catch (e) {
        console.debug("Aviso CDC Control:", e);
      }

      interfaceEscolhidaRef.current = novaInterfaceNum;
      epInRef.current = inEndpoint.endpointNumber;
      epOutRef.current = outEndpoint.endpointNumber;
      setInterfaceAtivaUsb(novaInterfaceNum);

      adicionarLog(
        "SISTEMA",
        `Interface #${novaInterfaceNum} ativada com sucesso (Endpoints Bulk IN: ${inEndpoint.endpointNumber}, OUT: ${outEndpoint.endpointNumber}).`,
      );
      toast.success(`Canal alterado para Interface #${novaInterfaceNum}.`);

      iniciarLoopLeituraUsb(device, inEndpoint.endpointNumber);

      // Sonda com AT e STATUS
      setTimeout(() => {
        enviarComandoSerial("AT");
      }, 200);
      setTimeout(() => {
        enviarComandoSerial("STATUS#");
      }, 600);
    } catch (err: any) {
      console.error("Erro ao alternar interface:", err);
      adicionarLog("ERRO", `Falha ao alternar interface: ${err.message || String(err)}`);
      toast.error(`Erro ao alternar interface: ${err.message}`);
    }
  };

  // Conectar via WebUSB Nativo (Cabo USB direto no rastreador/modem)
  const conectarWebUsb = async () => {
    const navUsb = (navigator as any).usb;
    if (!navUsb) {
      toast.error("WebUSB não suportada neste navegador. Use Google Chrome ou Microsoft Edge.");
      return;
    }

    setConectando(true);
    try {
      adicionarLog("SISTEMA", "Solicitando dispositivo USB direto ao sistema operacional...");
      const device = await navUsb.requestDevice({ filters: [] });

      adicionarLog(
        "SISTEMA",
        `Dispositivo selecionado: ${device.productName || "Modem USB"} (${device.manufacturerName || "USB"}). Abrindo conexão...`,
      );
      await device.open();

      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      // Coleta todas as interfaces com endpoints bulk IN e OUT
      const interfacesCandidatas: { num: number; inEp: number; outEp: number }[] = [];

      if (device.configuration && device.configuration.interfaces) {
        for (const iface of device.configuration.interfaces) {
          const alt = iface.alternates?.[0];
          if (!alt) continue;
          const inEndpoint = alt.endpoints?.find(
            (e: any) => e.direction === "in" && e.type === "bulk",
          );
          const outEndpoint = alt.endpoints?.find(
            (e: any) => e.direction === "out" && e.type === "bulk",
          );

          if (inEndpoint && outEndpoint) {
            interfacesCandidatas.push({
              num: iface.interfaceNumber,
              inEp: inEndpoint.endpointNumber,
              outEp: outEndpoint.endpointNumber,
            });
          }
        }
      }

      if (interfacesCandidatas.length === 0) {
        throw new Error(
          "Não foi encontrada uma interface com endpoints de comunicação serial/AT no dispositivo selecionado.",
        );
      }

      setInterfacesDisponiveisUsb(interfacesCandidatas.map((c) => c.num));

      // Prioridade 1: Interface #5 (AT Command Interface em modems celulares ASR / Simcom / Marvell)
      // Prioridade 2: Interface #4 (Modem Data)
      // Prioridade 3: Primeira candidata encontrada
      let escolhida = interfacesCandidatas.find((c) => c.num === 5);
      if (!escolhida) {
        escolhida = interfacesCandidatas.find((c) => c.num === 4);
      }
      if (!escolhida) {
        escolhida = interfacesCandidatas[0];
      }

      adicionarLog(
        "SISTEMA",
        `Reivindicando Interface #${escolhida.num} (Endpoints Bulk IN: ${escolhida.inEp}, OUT: ${escolhida.outEp})...`,
      );
      await device.claimInterface(escolhida.num);

      // Ativa linhas de controle CDC DTR & RTS no modem
      try {
        await device.controlTransferOut({
          requestType: "class",
          recipient: "interface",
          request: 0x22,
          value: 0x03,
          index: escolhida.num,
        });
        adicionarLog(
          "SISTEMA",
          `Linhas de controle CDC DTR/RTS ativadas na Interface #${escolhida.num}.`,
        );
      } catch (cdcErr) {
        console.debug("Aviso CDC Control:", cdcErr);
      }

      // Configura Line Coding (Baud Rate)
      try {
        const lineCoding = new Uint8Array([
          baudRate & 0xff,
          (baudRate >> 8) & 0xff,
          (baudRate >> 16) & 0xff,
          (baudRate >> 24) & 0xff,
          0x00,
          0x00,
          0x08,
        ]);
        await device.controlTransferOut(
          {
            requestType: "class",
            recipient: "interface",
            request: 0x20,
            value: 0,
            index: escolhida.num,
          },
          lineCoding,
        );
      } catch (lcErr) {
        console.debug("Aviso Line Coding:", lcErr);
      }

      usbDeviceRef.current = device;
      interfaceEscolhidaRef.current = escolhida.num;
      epInRef.current = escolhida.inEp;
      epOutRef.current = escolhida.outEp;

      setInterfaceAtivaUsb(escolhida.num);
      setTipoConexao("webusb");
      setConectado(true);

      const desc = `${device.productName || "Modem USB"} [VID: 0x${device.vendorId.toString(16).toUpperCase()} | PID: 0x${device.productId.toString(16).toUpperCase()}]`;
      setInfoPorta(desc);
      adicionarLog("SISTEMA", `Conexão WebUSB Direta estabelecida com sucesso! [${desc}].`);
      toast.success("Rastreador conectado via USB Direto (WebUSB)!");

      // Inicia loop de leitura contínuo
      iniciarLoopLeituraUsb(device, escolhida.inEp);

      // Executa verificação inicial suave de presença e leitura do IMEI
      setTimeout(() => {
        executarHandshakeInicial();
      }, 400);
    } catch (err: any) {
      console.error("Falha ao conectar via WebUSB:", err);
      if (err.name === "NotFoundError") {
        adicionarLog("SISTEMA", "Nenhum dispositivo selecionado pelo usuário na caixa de diálogo.");
      } else {
        adicionarLog("ERRO", `Erro ao conectar via WebUSB: ${err.message || String(err)}`);
        toast.error(
          `Falha na conexão USB: ${err.message || "Dispositivo ocupado ou inacessível."}`,
        );
      }
    } finally {
      setConectando(false);
    }
  };

  // Conectar à porta serial via Web Serial API (Adaptadores USB-TTL)
  const conectarPortaSerial = async () => {
    const navSerial = (navigator as any).serial;
    if (!navSerial) {
      toast.error("Web Serial não suportada neste navegador. Use Google Chrome ou Microsoft Edge.");
      return;
    }

    setConectando(true);
    try {
      adicionarLog("SISTEMA", "Solicitando permissão de porta serial ao sistema operacional...");
      const porta = await navSerial.requestPort();

      adicionarLog("SISTEMA", `Abrindo conexão serial com Baud Rate ${baudRate} bps (8N1)...`);
      await porta.open({ baudRate });

      portaSerialRef.current = porta;
      setTipoConexao("webserial");
      setConectado(true);

      // Obtém informações de USB se disponíveis
      const info = porta.getInfo ? porta.getInfo() : {};
      const descPorta = info.usbVendorId
        ? `VID: 0x${info.usbVendorId.toString(16).toUpperCase()} | PID: 0x${(info.usbProductId || 0).toString(16).toUpperCase()}`
        : "Porta Serial Padrão";
      setInfoPorta(descPorta);

      adicionarLog(
        "SISTEMA",
        `Conexão serial estabelecida com sucesso! [${descPorta}] @ ${baudRate} bps.`,
      );

      // Alerta se o usuário selecionou uma porta virtual de console ou bluetooth do Mac
      if (!info.usbVendorId) {
        adicionarLog(
          "ERRO",
          "Atenção: A porta selecionada aparenta ser uma porta virtual do sistema operacional (Bluetooth/Console de Depuração) e não um cabo de dados de rastreador. Caso o rastreador esteja plugado pelo cabo USB comum, utilize o botão 'Conectar Cabo USB Direto'.",
        );
      }

      toast.success(`Porta serial conectada com sucesso (${baudRate} bps).`);

      // Inicia o loop contínuo de leitura de dados seriais
      iniciarLoopLeituraSerial(porta);

      // Executa verificação inicial suave de presença e leitura do IMEI
      setTimeout(() => {
        executarHandshakeInicial();
      }, 400);
    } catch (err: any) {
      console.error("Falha ao conectar na porta serial:", err);
      if (err.name === "NotFoundError") {
        adicionarLog(
          "SISTEMA",
          "Nenhuma porta selecionada pelo usuário na caixa de diálogo do sistema operacional.",
        );
      } else {
        adicionarLog("ERRO", `Erro ao abrir porta serial: ${err.message || String(err)}`);
        toast.error(`Falha na conexão serial: ${err.message || "Porta ocupada ou inacessível."}`);
      }
    } finally {
      setConectando(false);
    }
  };

  // Enviar comando pela interface ativa (WebUSB ou Web Serial)
  const enviarComandoSerial = async (
    comandoTexto: string,
    terminadorForcado?: string,
    omitirHistorico = false,
  ) => {
    if (!conectado || (!portaSerialRef.current && !usbDeviceRef.current)) {
      if (!omitirHistorico) toast.error("Conecte a porta USB antes de enviar comandos.");
      return;
    }

    const textoBase = comandoTexto.trim();
    if (!textoBase) return;

    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      const isConsulta = ehComandoConsultaSomenteLeitura(textoBase);

      if (!isConsulta) {
        if (!omitirHistorico) {
          toast.error(
            "Comando não autorizado: O perfil S.adm Auditor só pode disparar consultas de leitura (AT, STATUS#, PARAM#, SERVER#, GPRSSET#, CXZT#, CXCS#, etc.). Proibido gravar parâmetros no hardware.",
          );
        }
        return;
      }
    }

    const term = terminadorForcado || terminador;
    const upper = textoBase.toUpperCase();
    const ehComandoAtOuCoban =
      upper === "AT" ||
      upper.startsWith("AT+") ||
      upper.startsWith("ATE") ||
      upper.startsWith("ATI") ||
      upper.includes("123456");

    const ehConcoxMcu =
      !ehComandoAtOuCoban &&
      (familiaProtocoloRef.current === "concox_wanway" ||
        /^(SZCS#|CXCS#|SCXSZ#|RELAY|DYD|HFYD|SERVER|APN|TIMER|HBT|PARAM|STATUS|WHERE|VERSION|GPRS|MILEAGE|SENDS|CENTER|SOS|CXZT|URL|MOVING|POWERALM|BATALM|DEFENSE|SENALM|ACCALM|LEVEL|GMT|RESET|FACTORY|PASSWORD)/i.test(
          upper,
        ));

    // Aplica sanitização canônica GT06/J16 quando comando Concox (evita # em SZCS#/CXCS#/RELAY,1)
    let comandoFormatado = textoBase;
    let payloadEnvio = textoBase;

    if (ehConcoxMcu) {
      comandoFormatado = sanitizarComandoHardware(textoBase);
      if (term === "LF") {
        payloadEnvio = `${comandoFormatado.replace(/[\r\n]+$/, "")}\n`;
      } else {
        payloadEnvio = `${comandoFormatado.replace(/[\r\n]+$/, "")}\r\n`;
      }
    } else if (term === "CRLF") {
      if (!payloadEnvio.endsWith("\r\n")) {
        payloadEnvio = `${payloadEnvio.replace(/[\r\n]+$/, "")}\r\n`;
      }
    } else if (term === "LF") {
      if (!payloadEnvio.endsWith("\n")) {
        payloadEnvio = `${payloadEnvio.replace(/[\r\n]+$/, "")}\n`;
      }
    } else if (term === "HASH") {
      let base = payloadEnvio.replace(/[\r\n]+$/, "");
      if (!base.endsWith("#")) {
        base = `${base}#`;
      }
      payloadEnvio = `${base}\r\n`;
    }

    try {
      const encoder = new TextEncoder();
      const dadosBytes = encoder.encode(payloadEnvio);

      if (tipoConexao === "webusb" && usbDeviceRef.current && epOutRef.current !== null) {
        await usbDeviceRef.current.transferOut(epOutRef.current, dadosBytes);
        adicionarLog("TX", comandoFormatado);
      } else if (tipoConexao === "webserial" && portaSerialRef.current) {
        const writer = portaSerialRef.current.writable.getWriter();
        escritorRef.current = writer;
        await writer.write(dadosBytes);
        writer.releaseLock();
        escritorRef.current = null;
        adicionarLog("TX", comandoFormatado);
      }

      if (!omitirHistorico) {
        // Adiciona ao histórico para navegação com setas
        setHistoricoComandos((prev) => {
          const filtrado = prev.filter((cmd) => cmd !== comandoFormatado);
          return [comandoFormatado, ...filtrado].slice(0, 30);
        });
        setIndiceHistorico(-1);
        setComandoManual("");
      }
    } catch (err: any) {
      console.error("Erro ao enviar comando USB:", err);
      const msg = String(err?.message || "").toLowerCase();
      const ehDesconexaoReal =
        msg.includes("the device was disconnected") ||
        msg.includes("device is closed") ||
        (tipoConexao === "webusb" && usbDeviceRef.current && !usbDeviceRef.current.opened);

      adicionarLog("ERRO", `Falha ao transmitir comando: ${err.message || String(err)}`);

      if (escritorRef.current) {
        try {
          escritorRef.current.releaseLock();
        } catch (lockErr) {
          console.debug("Lock de escrita liberado:", lockErr);
        }
        escritorRef.current = null;
      }

      if (ehDesconexaoReal) {
        varreduraCanceladaRef.current = true;
        setVarreduraAtiva(false);
        setGravandoPadraoCanonico(false);
        desconectarDispositivo(false);
        adicionarLog(
          "ERRO",
          "⚠️ O dispositivo USB foi desconectado pelo sistema operacional. Por favor, reconecte o cabo USB.",
        );
        toast.error("Dispositivo USB desconectado.");
        throw err;
      }

      // Se for apenas stall no envio em WebUSB, limpa o halt do endpoint OUT
      if (tipoConexao === "webusb" && usbDeviceRef.current && epOutRef.current !== null) {
        try {
          if (usbDeviceRef.current.opened) {
            await usbDeviceRef.current.clearHalt("out", epOutRef.current);
          }
        } catch (clearErr) {
          console.debug("Clear halt out:", clearErr);
        }
      }

      if (!omitirHistorico) {
        toast.error(`Erro de transmissão USB: ${err.message || "Falha de hardware"}`);
      }
    }
  };

  // Enviar comando aguardando a respectiva resposta RX (Request-Response síncrono com confirmação)
  const enviarComandoComResposta = async (
    comandoTexto: string,
    terminadorForcado?: string,
    timeoutMs = 1200,
  ): Promise<string> => {
    if (!conectado || (!portaSerialRef.current && !usbDeviceRef.current)) {
      return "";
    }

    ultimaRespostaRxRef.current = null;
    const momentoEnvio = Date.now();

    await enviarComandoSerial(comandoTexto, terminadorForcado, true);

    const inicioEspera = Date.now();
    let resposta = "";

    while (Date.now() - inicioEspera < timeoutMs) {
      if (!conectado) break;
      await new Promise((r) => setTimeout(r, 40));

      const rx = ultimaRespostaRxRef.current;
      if (rx && rx.timestamp >= momentoEnvio) {
        resposta = rx.conteudo;
        break;
      }
    }

    // Pequeno intervalo de respiro para o hardware descarregar o buffer
    await new Promise((r) => setTimeout(r, 120));
    return resposta;
  };

  // Cancelar varredura de protocolo
  const cancelarVarredura = () => {
    varreduraCanceladaRef.current = true;
    setVarreduraAtiva(false);
    adicionarLog("SISTEMA", "Varredura automática interrompida pelo operador.");
    toast.info("Busca de protocolo cancelada.");
  };

  // Varredura de Protocolo na interface ativa até receber confirmação positiva
  const iniciarVarreduraAutomatica = async () => {
    if (!conectado || (!portaSerialRef.current && !usbDeviceRef.current)) {
      toast.error("Conecte a porta USB antes de iniciar a busca de protocolo.");
      return;
    }

    setVarreduraAtiva(true);
    varreduraCanceladaRef.current = false;
    setProtocoloDetectado(null);

    const ifaceAtual = interfaceAtivaUsb || 5;

    adicionarLog(
      "SISTEMA",
      `🔍 Iniciando detecção de protocolo na Interface #${ifaceAtual}... O sistema testará os padrões de comunicação homologados.`,
    );

    interface SondaConfig {
      nome: string;
      baud: number;
      delimitador: "HASH" | "CRLF" | "LF";
      comando: string;
    }

    // Conjunto canônico otimizado: Modem AT (CRLF), WanWay / Concox (Hash #), Coban e 9600 bps
    const sondas: SondaConfig[] = [
      {
        nome: `Modem Celular AT (115200 bps | CRLF)`,
        baud: 115200,
        delimitador: "CRLF",
        comando: "AT",
      },
      {
        nome: `WanWay / Concox J16 (115200 bps | Hash #)`,
        baud: 115200,
        delimitador: "HASH",
        comando: "STATUS#",
      },
      {
        nome: `WanWay / Concox PARAM (115200 bps | Hash #)`,
        baud: 115200,
        delimitador: "HASH",
        comando: "PARAM#",
      },
      {
        nome: `Concox com CRLF (115200 bps | CRLF)`,
        baud: 115200,
        delimitador: "CRLF",
        comando: "STATUS#",
      },
      {
        nome: `Rastreador 9600 bps (Hash #)`,
        baud: 9600,
        delimitador: "HASH",
        comando: "STATUS#",
      },
      {
        nome: `Modem Celular 9600 bps (CRLF)`,
        baud: 9600,
        delimitador: "CRLF",
        comando: "AT",
      },
      {
        nome: `Coban / TK103 (9600 bps | CRLF)`,
        baud: 9600,
        delimitador: "CRLF",
        comando: "check123456",
      },
    ];

    let protocoloAchado = false;

    for (let idx = 0; idx < sondas.length; idx++) {
      if (varreduraCanceladaRef.current || !conectado) break;

      const sonda = sondas[idx];

      setBaudRate(sonda.baud);
      setTerminador(sonda.delimitador);

      // Limpa última resposta
      ultimaRespostaRxRef.current = null;
      const momentoEnvio = Date.now();

      adicionarLog(
        "SISTEMA",
        `📡 [SONDA ${idx + 1}/${sondas.length}] Testando: ${sonda.nome} -> TX: "${sonda.comando}"`,
      );

      try {
        await enviarComandoSerial(sonda.comando, sonda.delimitador, true);
      } catch (cmdErr) {
        // Se houve erro de desconexão, interrompe imediatamente a varredura
        break;
      }

      // Aguarda até 1500ms (30 passos de 50ms) verificando se há resposta positiva
      let respostaRecebida = "";
      for (let passo = 0; passo < 30; passo++) {
        if (varreduraCanceladaRef.current || !conectado) break;
        await new Promise((r) => setTimeout(r, 50));

        const rx = ultimaRespostaRxRef.current;
        if (rx && rx.timestamp >= momentoEnvio) {
          const txt = rx.conteudo.toUpperCase().trim();

          const ehErro =
            txt === "ERROR" ||
            txt.startsWith("ERROR") ||
            txt.includes("+CME ERROR") ||
            txt.includes("+CMS ERROR");

          if (!ehErro) {
            const positiva =
              txt === "OK" ||
              txt.endsWith("OK") ||
              txt.includes("\r\nOK") ||
              txt.includes("STATUS:") ||
              txt.includes("STATUS,") ||
              txt.includes("PARAM") ||
              txt.includes("BATTERY") ||
              txt.includes("GPS") ||
              txt.includes("GPRS") ||
              txt.includes("ACC") ||
              txt.includes("VER") ||
              txt.includes("IMEI") ||
              txt.includes("POWER") ||
              txt.includes("+CSQ:") ||
              txt.includes("+CPIN:") ||
              txt.includes("+CGSN:") ||
              txt.includes("WANWAY") ||
              txt.includes("CONCOX");

            if (positiva) {
              respostaRecebida = rx.conteudo;
              protocoloAchado = true;
              break;
            }
          }
        }
      }

      if (protocoloAchado) {
        setProtocoloDetectado(sonda.nome);
        adicionarLog(
          "SISTEMA",
          `✅ SUCESSO! Resposta positiva recebida do rastreador: "${respostaRecebida}".`,
        );
        adicionarLog(
          "SISTEMA",
          `🎯 Protocolo Travado e Homologado: ${sonda.baud} bps | Fim de Linha: ${sonda.delimitador} | Interface #${ifaceAtual}.`,
        );
        toast.success(`Protocolo identificado: ${sonda.nome}!`);

        // Comuta automaticamente a família de comandos de acordo com o hardware identificado
        if (sonda.comando === "AT") {
          alternarFamiliaProtocolo("modem_at", true);
          setTimeout(() => {
            adicionarLog("SISTEMA", "Consultando IMEI direto do modem celular (AT+CGSN)...");
            enviarComandoSerial("AT+CGSN", "CRLF", true);
          }, 300);
          setTimeout(() => {
            adicionarLog("SISTEMA", "Consultando nível de sinal celular (AT+CSQ)...");
            enviarComandoSerial("AT+CSQ", "CRLF", true);
          }, 700);
          setTimeout(() => {
            adicionarLog("SISTEMA", "Consultando status do chip SIM (AT+CPIN?)...");
            enviarComandoSerial("AT+CPIN?", "CRLF", true);
          }, 1200);
        } else if (sonda.comando.includes("123456")) {
          alternarFamiliaProtocolo("coban_tk", true);
          setTimeout(() => {
            adicionarLog("SISTEMA", "Consultando status Coban (check123456)...");
            enviarComandoSerial("check123456", "CRLF", true);
          }, 300);
        } else {
          alternarFamiliaProtocolo("concox_wanway", true);
          setTimeout(() => {
            adicionarLog("SISTEMA", "Consultando parâmetros operacionais (PARAM#)...");
            enviarComandoSerial("PARAM#", sonda.delimitador, true);
          }, 300);
        }

        if (autoGravarAoConectarRef.current && gravarPadraoCanonicoCompletoRef.current) {
          setTimeout(() => {
            adicionarLog(
              "SISTEMA",
              "⚡ [AUTO-GRAVAÇÃO] Protocolo homologado com sucesso! Aplicando Padrão Canônico automaticamente...",
            );
            gravarPadraoCanonicoCompletoRef.current?.();
          }, 1800);
        }
        break;
      }
    }

    if (!protocoloAchado && !varreduraCanceladaRef.current && conectado) {
      adicionarLog(
        "ERRO",
        "⚠️ Nenhuma resposta positiva foi obtida nas velocidades e protocolos testados. Verifique se o rastreador está com alimentação elétrica conectada e chave/LEDs ligados.",
      );
      toast.warning("Nenhum protocolo respondeu. Certifique-se de que o rastreador está ligado.");
    }

    setVarreduraAtiva(false);
  };

  // Handshake Inicial de Boas-Vindas sem comutação agressiva de interface
  const executarHandshakeInicial = async () => {
    // Aguarda 500ms para estabilização do barramento serial
    await new Promise((r) => setTimeout(r, 500));
    if (!conectado || !loopLeituraAtivoRef.current) return;
    if (tipoConexao === "webusb" && (!usbDeviceRef.current || !usbDeviceRef.current.opened)) return;

    adicionarLog(
      "SISTEMA",
      "Conexão inicializada. Verificando canal de comunicação com o rastreador...",
    );

    try {
      // 1. Testa se é modem celular Hayes (ex: chipset Marvell / Quectel / SIMCom / ASR)
      ultimaRespostaRxRef.current = null;
      const t0 = Date.now();
      await enviarComandoSerial("AT", "CRLF", true);

      // Aguarda até 900ms por resposta OK
      let respondeuAt = false;
      for (let i = 0; i < 18; i++) {
        if (!conectado) return;
        await new Promise((r) => setTimeout(r, 50));
        const rx = ultimaRespostaRxRef.current;
        if (rx && rx.timestamp >= t0) {
          const txt = rx.conteudo.toUpperCase().trim();
          if (txt === "OK" || txt.endsWith("OK")) {
            respondeuAt = true;
            break;
          }
        }
      }

      if (respondeuAt) {
        alternarFamiliaProtocolo("modem_at", true);
        setProtocoloDetectado(
          `Modem Celular AT (115200 bps | Interface #${interfaceEscolhidaRef.current || 5})`,
        );
        adicionarLog(
          "SISTEMA",
          `✅ Modem Celular AT respondendo na Interface #${interfaceEscolhidaRef.current || 5}! Canal operacional.`,
        );
        toast.success("Rastreador identificado via comandos AT!");

        setTimeout(() => {
          adicionarLog("SISTEMA", "Consultando IMEI direto do modem celular (AT+CGSN)...");
          enviarComandoSerial("AT+CGSN", "CRLF", true);
        }, 300);
        setTimeout(() => {
          adicionarLog("SISTEMA", "Consultando nível de sinal celular (AT+CSQ)...");
          enviarComandoSerial("AT+CSQ", "CRLF", true);
        }, 700);
        setTimeout(() => {
          adicionarLog("SISTEMA", "Consultando status do chip SIM (AT+CPIN?)...");
          enviarComandoSerial("AT+CPIN?", "CRLF", true);
        }, 1200);

        if (autoGravarAoConectarRef.current && gravarPadraoCanonicoCompletoRef.current) {
          setTimeout(() => {
            adicionarLog(
              "SISTEMA",
              "⚡ [AUTO-GRAVAÇÃO] Dispositivo identificado com sucesso! Aplicando Padrão Canônico automaticamente...",
            );
            gravarPadraoCanonicoCompletoRef.current?.();
          }, 1800);
        }
        return;
      }

      // 2. Se não respondeu OK ao AT, testa STATUS# com protocolo WanWay / Concox
      const t1 = Date.now();
      await enviarComandoSerial("STATUS#", "HASH", true);

      let respondeuStatus = false;
      for (let i = 0; i < 18; i++) {
        if (!conectado) return;
        await new Promise((r) => setTimeout(r, 50));
        const rx = ultimaRespostaRxRef.current;
        if (rx && rx.timestamp >= t1) {
          const txt = rx.conteudo.toUpperCase().trim();
          if (txt && !txt.includes("ERROR")) {
            respondeuStatus = true;
            break;
          }
        }
      }

      if (respondeuStatus) {
        alternarFamiliaProtocolo("concox_wanway", true);
        setProtocoloDetectado(
          `WanWay / Concox (115200 bps | Interface #${interfaceEscolhidaRef.current || 5})`,
        );
        adicionarLog(
          "SISTEMA",
          `✅ Rastreador WanWay / Concox respondendo na Interface #${interfaceEscolhidaRef.current || 5}!`,
        );
        toast.success("Rastreador WanWay / Concox identificado!");
        setTimeout(() => {
          adicionarLog("SISTEMA", "Consultando parâmetros operacionais (PARAM#)...");
          enviarComandoSerial("PARAM#", "HASH", true);
        }, 300);

        if (autoGravarAoConectarRef.current && gravarPadraoCanonicoCompletoRef.current) {
          setTimeout(() => {
            adicionarLog(
              "SISTEMA",
              "⚡ [AUTO-GRAVAÇÃO] Dispositivo identificado com sucesso! Aplicando Padrão Canônico automaticamente...",
            );
            gravarPadraoCanonicoCompletoRef.current?.();
          }, 1800);
        }
      } else {
        adicionarLog(
          "SISTEMA",
          "Canal USB aberto e pronto para envio de comandos e gravação do Padrão Canônico.",
        );
      }
    } catch (e: any) {
      console.debug("Aviso no handshake inicial:", e);
    }
  };

  // Navegação no histórico de comandos manuais com teclas Up/Down
  const handleKeyDownComando = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      enviarComandoSerial(comandoManual);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historicoComandos.length > 0) {
        const proximo = Math.min(indiceHistorico + 1, historicoComandos.length - 1);
        setIndiceHistorico(proximo);
        setComandoManual(historicoComandos[proximo]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (indiceHistorico > 0) {
        const anterior = indiceHistorico - 1;
        setIndiceHistorico(anterior);
        setComandoManual(historicoComandos[anterior]);
      } else if (indiceHistorico === 0) {
        setIndiceHistorico(-1);
        setComandoManual("");
      }
    }
  };

  // Copiar log do terminal
  const copiarLogTerminal = () => {
    const textoCompleto = logs.map((l) => `[${l.dataHora}] [${l.tipo}] ${l.conteudo}`).join("\n");
    navigator.clipboard.writeText(textoCompleto);
    setCopiado(true);
    toast.success("Log completo do terminal copiado para a área de transferência.");
    setTimeout(() => setCopiado(false), 2000);
  };

  // Limpar logs do terminal
  const limparLogsTerminal = () => {
    setLogs([]);
    adicionarLog("SISTEMA", "Terminal limpo pelo operador.");
  };

  // Ações de Presets Rápidos
  const dispararComandoRapido = (cmd: string, descricaoToast: string) => {
    enviarComandoSerial(cmd, protocoloAtivoDef.terminador);
    toast.info(`Comando enviado: ${cmd} (${descricaoToast})`);
  };

  // Disparo auxiliar no Gateway TCP (para IMEI detectado via USB Modem AT que não grava MCU GT06 via AT)
  const despacharComandoGatewayTcp = async (imeiAlvo: string, comandoGt06: string) => {
    const cmdSanitizado = sanitizarComandoHardware(comandoGt06);
    const { data: sessaoAuth } = await supabase.auth.getSession();
    const token = sessaoAuth?.session?.access_token;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/gateway/comando", {
      method: "POST",
      headers,
      body: JSON.stringify({
        imei: imeiAlvo,
        comando: cmdSanitizado,
        origem: "painel_j16_usb_bancada",
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.mensagem || `HTTP ${res.status}`);
    }
    return res.json();
  };

  // Gravar Servidor no Rastreador
  const gravarServidor = async () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Gravação de parâmetros no hardware é restrita ao SuperADM.",
      );
      return;
    }
    const srv = servidorDns.trim();
    const porta = portaTcp.trim();
    if (!srv || !porta) {
      toast.error("Informe o servidor e a porta TCP antes de gravar.");
      return;
    }
    const { cmd, terminador: term } = protocoloAtivoDef.gerarComandoServidor(srv, porta, modoIpDns);

    if (protocoloAtivoDef.suportaServidorViaSerial === false) {
      try {
        await navigator.clipboard?.writeText(cmd);
      } catch {
        // Clipboard opcional em contexto não focado
      }
      adicionarLog(
        "SISTEMA",
        `⚠️ [MODEM AT] A porta USB AT (SIMCom A76XX) grava APN e energia do modem, mas não grava servidor GT06 na flash da MCU. Comando canônico copiado: ${cmd}`,
      );

      if (dadosBancada.imei) {
        try {
          adicionarLog(
            "SISTEMA",
            `📡 [GATEWAY TCP] Tentando despachar "${cmd}" para o IMEI ${dadosBancada.imei} conectado à nuvem...`,
          );
          const gw = await despacharComandoGatewayTcp(dadosBancada.imei, cmd);
          if (gw?.enviado || gw?.resposta) {
            adicionarLog(
              "RX",
              `[GATEWAY TCP] IMEI ${dadosBancada.imei}: ${gw.resposta || "Comando entregue via socket ativo!"}`,
            );
            toast.success(
              `Comando "${cmd}" enviado via Gateway TCP para IMEI ${dadosBancada.imei}!`,
            );
          } else {
            adicionarLog(
              "SISTEMA",
              `⏳ [SPOOLER GATEWAY] IMEI ${dadosBancada.imei} offline no TCP. Comando retido no spooler e copiado para SMS/USB-TTL: ${cmd}`,
            );
            toast.info(
              `Porta AT não grava SERVER na MCU. Comando "${cmd}" enfileirado no Gateway e copiado!`,
            );
          }
          return;
        } catch (gwErr: any) {
          adicionarLog(
            "ERRO",
            `Falha ao despachar via Gateway TCP: ${gwErr?.message || String(gwErr)}. Envie "${cmd}" via SMS ou adaptador USB-TTL (WanWay/Concox).`,
          );
        }
      }

      toast.info(
        `Porta AT não grava servidor GT06 na MCU. Use USB-TTL (WanWay/Concox) ou SMS: ${cmd}`,
      );
      return;
    }

    enviarComandoSerial(cmd, term);
    toast.success(`Gravando servidor no protocolo ${protocoloAtivoDef.nome}: ${cmd}`);
  };

  // Gravar APN no Rastreador
  const gravarApn = () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Gravação de parâmetros no hardware é restrita ao SuperADM.",
      );
      return;
    }
    const apn = apnNome.trim();
    const user = apnUser.trim();
    const pass = apnPass.trim();
    if (!apn) {
      toast.error("Informe o nome da APN.");
      return;
    }
    const { cmd, terminador: term } = protocoloAtivoDef.gerarComandoApn(apn, user, pass);
    enviarComandoSerial(cmd, term);
    toast.success(`Gravando APN no protocolo ${protocoloAtivoDef.nome}: ${cmd}`);
  };

  // Gravar Timers de Transmissão
  const gravarTimers = () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Gravação de parâmetros no hardware é restrita ao SuperADM.",
      );
      return;
    }
    const mov = timerMovimento.trim();
    const parado = timerParado.trim();
    const hbt = heartbeatTempo.trim() || "300";
    if (protocoloAtivoDef.suportaTimersMovimento !== false && (!mov || !parado)) {
      toast.error("Informe os intervalos de movimento e parado.");
      return;
    }
    const { cmd, terminador: term } = protocoloAtivoDef.gerarComandoTimers(mov, parado, hbt);
    enviarComandoSerial(cmd, term);

    if (familiaProtocolo === "concox_wanway" && hbt) {
      setTimeout(() => {
        enviarComandoSerial(`HBT,${hbt},${hbt}#`, "HASH");
      }, 300);
    }
    toast.success(
      protocoloAtivoDef.suportaTimersMovimento === false
        ? `Configurando gerenciamento de energia: ${cmd}`
        : `Gravando timers no protocolo ${protocoloAtivoDef.nome}: ${cmd}`,
    );
  };

  // Restaurar Campos com o Padrão Canônico
  const restaurarCamposPadraoCanonico = () => {
    const padrao = obterConfigPadraoSistemaJ16();
    setServidorDns(
      padrao.valores.usarIpDireto
        ? padrao.valores.ipDedicado
        : padrao.valores.servidorDns || "gps.oficial.tec.br",
    );
    setPortaTcp(padrao.valores.portaTcp || "7002");
    setModoIpDns(padrao.valores.usarIpDireto ? "0" : "1");
    setApnNome(padrao.valores.apnNome || "voxter.br");
    setApnUser(padrao.valores.apnUser || "algar");
    setApnPass(padrao.valores.apnPass || "1212");
    setTimerMovimento(padrao.valores.timerMovimento || "30");
    setTimerParado(padrao.valores.timerParado || "3600");
    setHeartbeatTempo(padrao.valores.hbtLigado || "300");
    toast.success("Campos restaurados com o Padrão Canônico homologado do sistema.");
  };

  // Gravar Padrão Canônico J16 Completo via Gateway TCP para o IMEI detectado
  const gravarPadraoCanonicoViaGatewayTcp = async () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Gravação em lote é restrita ao SuperADM.",
      );
      return;
    }
    if (!dadosBancada.imei) {
      toast.error("IMEI ainda não identificado na bancada.");
      return;
    }

    const imeiAlvo = dadosBancada.imei;
    const srv = servidorDns.trim() || "167.234.233.82";
    const porta = portaTcp.trim() || "7002";
    const apn = apnNome.trim() || "voxter.br";
    const user = apnUser.trim();
    const pass = apnPass.trim();
    const mov = timerMovimento.trim() || "30";
    const parado = timerParado.trim() || "3600";
    const hbt = heartbeatTempo.trim() || "300";

    const filaConcox = PROTOCOLOS_BANCADA.concox_wanway
      .gerarFilaPadraoCanonico({
        srv,
        porta,
        modo: modoIpDns,
        apn,
        user,
        pass,
        mov,
        parado,
        hbt,
      })
      .filter((item) => item.cmd !== "PARAM#" && item.cmd !== "STATUS#");

    setGravandoViaGatewayTcp(true);
    adicionarLog(
      "SISTEMA",
      `🚀 [GATEWAY TCP] Enviando lote canônico J16 (${filaConcox.length} comandos) para IMEI ${imeiAlvo}...`,
    );

    let entregues = 0;
    let enfileirados = 0;
    let falhas = 0;

    try {
      for (let i = 0; i < filaConcox.length; i++) {
        const item = filaConcox[i];
        adicionarLog("TX", `[GATEWAY ${i + 1}/${filaConcox.length}] (${item.nome}) -> ${item.cmd}`);
        try {
          const gw = await despacharComandoGatewayTcp(imeiAlvo, item.cmd);
          if (gw?.resposta) {
            entregues++;
            adicionarLog("RX", `[GATEWAY] ${gw.resposta}`);
          } else if (gw?.enviado) {
            entregues++;
            adicionarLog("SISTEMA", `✅ [GATEWAY] Entregue ao socket TCP (${item.cmd})`);
          } else if (gw?.enfileirado) {
            enfileirados++;
            adicionarLog(
              "SISTEMA",
              `⏳ [SPOOLER] Rastreador offline no TCP; retido no spooler (${item.cmd})`,
            );
          } else {
            falhas++;
            adicionarLog("ERRO", `❌ [GATEWAY] Sem confirmação para "${item.cmd}"`);
          }
        } catch (errStep: any) {
          falhas++;
          adicionarLog(
            "ERRO",
            `❌ [GATEWAY] Erro em "${item.cmd}": ${errStep?.message || String(errStep)}`,
          );
        }
        if (i < filaConcox.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      if (entregues > 0 && falhas === 0) {
        toast.success(
          `Lote canônico despachado via Gateway TCP (${entregues} entregues, ${enfileirados} enfileirados)!`,
        );
      } else if (enfileirados > 0 && falhas === 0) {
        toast.info(
          `IMEI ${imeiAlvo} offline no TCP. ${enfileirados} comandos enfileirados no spooler para envio automático no login.`,
        );
      } else {
        toast.warning(
          `Gateway TCP finalizado: ${entregues} entregues, ${enfileirados} em fila e ${falhas} falhas.`,
        );
      }
    } finally {
      setGravandoViaGatewayTcp(false);
    }
  };

  // Gravar Padrão Canônico Completo (1-Clique)
  const gravarPadraoCanonicoCompleto = async () => {
    const sess = obterSessaoCacheada();
    if (sess?.isAuditor || sess?.role === "superadmin_auditor" || sess?.isSuperAdminAuditor) {
      toast.error(
        "Ação não autorizada: O perfil S.adm Auditor possui permissão estritamente de consulta (Read-Only). Gravação de parâmetros em lote é restrita ao SuperADM.",
      );
      return;
    }
    if (!conectado || (!portaSerialRef.current && !usbDeviceRef.current)) {
      toast.error("Conecte a porta USB antes de gravar as configurações.");
      return;
    }

    const familia = familiaProtocoloRef.current;
    const def = PROTOCOLOS_BANCADA[familia];

    setGravandoPadraoCanonico(true);
    adicionarLog(
      "SISTEMA",
      `🚀 [PADRÃO CANÔNICO] Iniciando gravação completa do padrão GD Rastreamento via ${def.nome}...`,
    );

    const srv = servidorDns.trim() || "167.234.233.82";
    const porta = portaTcp.trim() || "7002";
    const apn = apnNome.trim() || "voxter.br";
    const user = apnUser.trim();
    const pass = apnPass.trim();
    const mov = timerMovimento.trim() || "30";
    const parado = timerParado.trim() || "3600";
    const hbt = heartbeatTempo.trim() || "300";

    const filaComandos = def.gerarFilaPadraoCanonico({
      srv,
      porta,
      modo: modoIpDns,
      apn,
      user,
      pass,
      mov,
      parado,
      hbt,
    });

    let errosHardware = 0;

    try {
      for (let i = 0; i < filaComandos.length; i++) {
        if (!conectado) break;

        const item = filaComandos[i];
        setProgressoCanonico({
          passo: i + 1,
          total: filaComandos.length,
          descricao: item.nome,
        });

        adicionarLog(
          "SISTEMA",
          `📡 [CANÔNICO ${i + 1}/${filaComandos.length}] Transmitindo: ${item.nome} -> TX: "${item.cmd}"`,
        );

        // Envia aguardando a resposta do hardware por até 1000ms de forma síncrona
        const rx = await enviarComandoComResposta(item.cmd, item.tipo, 1000);
        if (rx && /(?:\bERROR\b|\+CME ERROR|\+CMS ERROR)/i.test(rx)) {
          errosHardware++;
        }
      }

      if (familia === "modem_at") {
        adicionarLog(
          errosHardware > 0 ? "ERRO" : "SISTEMA",
          errosHardware > 0
            ? `⚠️ [MODEM AT] Rotina finalizada com ${errosHardware} erro(s) retornado(s) pelo modem. APN/Energia configurados via AT; comandos GT06 da MCU (SERVER, TIMER, SZCS#) exigem Gateway TCP ou USB-TTL.`
            : "✅ [MODEM AT] APN e configurações celulares gravadas no modem LTE! Para gravar parâmetros GT06 da placa MCU (SERVER, TIMER, SZCS#), use o botão 'Gravar MCU via Gateway TCP' (com 12V conectado) ou adaptador USB-TTL.",
        );
        toast.success(
          errosHardware > 0
            ? `Modem AT concluído com ${errosHardware} alerta(s). Verifique o terminal.`
            : "Modem AT configurado (APN e energia)! Veja o console para gravar a MCU GT06.",
        );
      } else if (errosHardware > 0) {
        adicionarLog(
          "ERRO",
          `⚠️ [ATENÇÃO] Gravação finalizada com ${errosHardware} retorno(s) ERROR do hardware. Revise o console serial acima.`,
        );
        toast.warning(`Gravação concluída com ${errosHardware} erro(s) reportado(s) pela MCU.`);
      } else {
        adicionarLog(
          "SISTEMA",
          "✅ [SUCESSO] Todos os parâmetros do Padrão Canônico foram gravados com sucesso no rastreador!",
        );
        toast.success(
          "Padrão Canônico gravado com sucesso! O rastreador está 100% operacional no GD Rastreamento.",
        );
      }
    } catch (err: any) {
      console.error("Erro na gravação em lote:", err);
      adicionarLog(
        "ERRO",
        `Falha durante gravação do padrão canônico: ${err.message || String(err)}`,
      );
      toast.error(`Falha ao gravar parâmetros: ${err.message || "Erro de comunicação USB"}`);
    } finally {
      setGravandoPadraoCanonico(false);
      setProgressoCanonico(null);
    }
  };
  gravarPadraoCanonicoCompletoRef.current = gravarPadraoCanonicoCompleto;

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* AVISO SE NAVEGADOR NÃO SUPORTAR WEBUSB / WEB SERIAL */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!suportado && (
        <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-3 shadow-md">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">
                Navegador sem suporte nativo a WebUSB e Web Serial
              </h3>
              <p className="text-xs mt-0.5 opacity-90">
                O navegador atual não permite conexão direta à porta USB. Para usar a bancada serial
                diretamente pelo GD Rastreamento, utilize o <strong>Google Chrome</strong>,{" "}
                <strong>Microsoft Edge</strong>, <strong>Opera</strong> ou <strong>Brave</strong> no
                Mac, Windows ou Linux.
              </p>
            </div>
          </div>
          <div className="bg-slate-950/90 text-slate-200 p-3.5 rounded-2xl font-mono text-xs space-y-2 border border-slate-800">
            <div className="text-emerald-400 font-bold">
              Como configurar via Terminal do macOS (Alternativa Direta):
            </div>
            <div>
              1. Localize a porta USB conectada:{" "}
              <code className="text-amber-300">ls -la /dev/cu.usb*</code>
            </div>
            <div>
              2. Conecte pelo terminal a 115200 bps:{" "}
              <code className="text-amber-300">screen /dev/cu.usbserial-XXXXX 115200</code>
            </div>
            <div>
              3. Digite o comando de apontamento e pressione Enter:{" "}
              <code className="text-emerald-300">SERVER,0,167.234.233.82,7002,0#</code>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CARD 1: BARRA DE CONTROLE E CONEXÃO SERIAL USB */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border transition ${
                conectado
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-md shadow-emerald-500/20"
                  : "bg-slate-500/10 border-slate-500/20 text-slate-500 dark:text-slate-400"
              }`}
            >
              <Usb className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Bancada de Configuração Serial USB
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border flex items-center gap-1 ${
                    conectado
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${conectado ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`}
                  />
                  {conectado
                    ? tipoConexao === "webusb"
                      ? "USB DIRETO (WebUSB)"
                      : "PORTA SERIAL (WebSerial)"
                    : "DESCONECTADO"}
                </span>
                {infoPorta && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                    {infoPorta}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Comunicação direta nativa via cabo USB direto (WebUSB) ou adaptador serial (TTL
                CH340 / CP2102 / FTDI) para recuperar, diagnosticar e apontar rastreadores no Mac,
                Windows e Linux.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {/* Seletor de Baud Rate */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Baud Rate:
              </span>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                disabled={conectado}
                className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer disabled:opacity-60"
              >
                <option value={115200}>115200 bps (J16/4G WanWay)</option>
                <option value={9600}>9600 bps (GPS Padrão/TK)</option>
                <option value={19200}>19200 bps</option>
                <option value={38400}>38400 bps</option>
                <option value={57600}>57600 bps</option>
              </select>
            </div>

            {/* Seletor de Terminador */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fim de Linha:
              </span>
              <select
                value={terminador}
                onChange={(e) => setTerminador(e.target.value)}
                className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
              >
                <option value="CRLF">CRLF (\r\n) Padrão Modem</option>
                <option value="HASH">Delimitador Hash (#)</option>
                <option value="LF">LF (\n)</option>
                <option value="NENHUM">Nenhum (Bruto)</option>
              </select>
            </div>

            {/* Botões Conectar / Desconectar */}
            {!conectado ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={conectarWebUsb}
                  disabled={conectando || !suportado}
                  title="Conecta diretamente ao modem/rastreador via cabo USB (Mac, Windows e Linux, sem driver)"
                  className="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/20 active:scale-95"
                >
                  {conectando ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Usb className="h-4 w-4" />
                  )}
                  <span>Conectar Cabo USB Direto</span>
                </button>

                <button
                  type="button"
                  onClick={conectarPortaSerial}
                  disabled={conectando || !suportado}
                  title="Para adaptadores seriais USB-TTL CH340 / CP2102 com fios no chicote"
                  className="px-3.5 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  <Terminal className="h-4 w-4" />
                  <span>Porta Serial COM / TTL</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const novo = !autoGravarAoConectar;
                    setAutoGravarAoConectar(novo);
                    autoGravarAoConectarRef.current = novo;
                    try {
                      localStorage.setItem("hunter_usb_autograve_padrao", novo ? "true" : "false");
                    } catch (errStorage) {
                      console.debug("Falha ao salvar preferência no localStorage:", errStorage);
                    }
                    if (novo) {
                      toast.success(
                        "⚡ Gravação Automática ativada: ao conectar qualquer rastreador, o Padrão Canônico será gravado automaticamente!",
                      );
                    } else {
                      toast.info("Gravação Automática desativada.");
                    }
                  }}
                  title="Aplica automaticamente o Padrão Canônico assim que o cabo for plugado e o rastreador for identificado"
                  className={`px-3 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border active:scale-95 ${
                    autoGravarAoConectar
                      ? "bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/20 shadow-md shadow-amber-500/10"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <Zap
                    className={`h-4 w-4 ${autoGravarAoConectar ? "fill-amber-400 text-amber-400" : ""}`}
                  />
                  <span>Auto-Gravar: {autoGravarAoConectar ? "Ativado" : "Manual"}</span>
                </button>

                <button
                  type="button"
                  onClick={varreduraAtiva ? cancelarVarredura : iniciarVarreduraAutomatica}
                  title="Testa automaticamente as velocidades, delimitadores e comandos até obter confirmação positiva de STATUS do rastreador"
                  className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-md ${
                    varreduraAtiva
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse border border-amber-300 shadow-amber-500/20"
                      : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border border-emerald-400 shadow-emerald-500/20"
                  }`}
                >
                  <Radar className={`h-4 w-4 ${varreduraAtiva ? "animate-spin" : ""}`} />
                  <span>{varreduraAtiva ? "Buscando... (Parar)" : "Auto-Detectar Protocolo"}</span>
                </button>

                {tipoConexao === "webusb" && interfacesDisponiveisUsb.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Canal USB:
                    </span>
                    <select
                      value={interfaceAtivaUsb || ""}
                      onChange={(e) => alternarInterfaceUsb(Number(e.target.value))}
                      className="bg-transparent text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden cursor-pointer"
                    >
                      {interfacesDisponiveisUsb.map((num) => (
                        <option key={num} value={num}>
                          Interface #{num}{" "}
                          {num === 5
                            ? "(Comando AT - Recomendada)"
                            : num === 4
                              ? "(Modem / Dados)"
                              : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => desconectarDispositivo(true)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Desconectar USB</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Banner de Informações do Equipamento Detectado na Bancada */}
        {dadosBancada.imei && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 text-white border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    IMEI Identificado:
                  </span>
                  <span className="text-sm font-mono font-black text-emerald-400">
                    {dadosBancada.imei}
                  </span>
                  {dadosBancada.cadastradoNoSistema ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Cadastrado no Sistema ({dadosBancada.statusEstoque})
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Novo / Não Cadastrado
                    </span>
                  )}
                  {dadosBancada.sinalCsq && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-mono">
                      <Wifi className="h-3 w-3 text-sky-400" />
                      Sinal 4G: {dadosBancada.sinalCsq}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-300 mt-1 flex-wrap font-mono">
                  {dadosBancada.modelo && (
                    <span>
                      Módulo: <strong className="text-amber-300">{dadosBancada.modelo}</strong>
                    </span>
                  )}
                  {dadosBancada.operadora && (
                    <span>
                      Operadora:{" "}
                      <strong className="text-emerald-300">{dadosBancada.operadora}</strong>
                    </span>
                  )}
                  {dadosBancada.iccid && (
                    <span>
                      ICCID: <strong className="text-sky-300">{dadosBancada.iccid}</strong>
                    </span>
                  )}
                  {dadosBancada.servidorAtual && (
                    <span>
                      Servidor Atual:{" "}
                      <strong className="text-cyan-400">
                        {dadosBancada.servidorAtual}:{dadosBancada.portaAtual}
                      </strong>
                    </span>
                  )}
                  {dadosBancada.apnAtual && (
                    <span>
                      APN Atual: <strong className="text-cyan-400">{dadosBancada.apnAtual}</strong>
                    </span>
                  )}
                  {dadosBancada.versaoFirmware && (
                    <span>
                      Firmware:{" "}
                      <strong className="text-purple-400">{dadosBancada.versaoFirmware}</strong>
                    </span>
                  )}
                  {dadosBancada.veiculoVinculado && (
                    <span className="text-sky-300">
                      Veículo: <strong>{dadosBancada.veiculoVinculado}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
              <button
                type="button"
                onClick={() => consultarImeiNoSistema(dadosBancada.imei!)}
                disabled={verificandoImei}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${verificandoImei ? "animate-spin" : ""}`} />
                <span>Revalidar no Sistema</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* GRID COM TERMINAL SERIAL E PAINEL DE PRESETS RÁPIDOS */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA (7 COLS): TERMINAL SERIAL EM TEMPO REAL */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-[#110e0c] border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col h-[580px]">
            {/* Header do Terminal */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex items-center gap-2 ml-2 flex-wrap">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    Console Serial USB
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({baudRate} bps | {terminador})
                  </span>
                  {protocoloDetectado && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Auto: {protocoloDetectado}
                    </span>
                  )}
                  {varreduraAtiva && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                      Auto-Detectando...
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={varreduraAtiva ? cancelarVarredura : iniciarVarreduraAutomatica}
                  disabled={!conectado}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono transition cursor-pointer border flex items-center gap-1 ${
                    varreduraAtiva
                      ? "bg-amber-500 text-slate-950 border-amber-400 animate-pulse font-bold"
                      : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30"
                  }`}
                  title="Testa automaticamente as velocidades e comandos até receber resposta positiva de STATUS"
                >
                  <Radar className={`h-3 w-3 ${varreduraAtiva ? "animate-spin" : ""}`} />
                  <span>{varreduraAtiva ? "Parar Busca" : "Auto-Detectar"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoScroll((prev) => !prev)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono transition cursor-pointer border ${
                    autoScroll
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}
                  title={autoScroll ? "Pausar rolagem automática" : "Ativar rolagem automática"}
                >
                  Auto-scroll: {autoScroll ? "ON" : "OFF"}
                </button>

                <button
                  type="button"
                  onClick={copiarLogTerminal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                  title="Copiar log do terminal"
                >
                  {copiado ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={limparLogsTerminal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                  title="Limpar terminal"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Área de Visualização dos Logs com Rolagem */}
            <div
              ref={terminalScrollRef}
              className="flex-1 overflow-y-auto space-y-1.5 pr-2 font-mono text-[11px] select-text scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
            >
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                  <Terminal className="h-8 w-8 opacity-40" />
                  <p className="text-xs">Terminal pronto. Conecte o USB para iniciar a escuta.</p>
                </div>
              ) : (
                logs.map((log) => {
                  let corTexto = "text-slate-300";
                  let prefixo = "SYS";
                  let corBadge = "bg-slate-800 text-slate-400 border-slate-700";

                  if (log.tipo === "TX") {
                    corTexto = "text-cyan-300 font-semibold";
                    prefixo = "TX ->";
                    corBadge = "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
                  } else if (log.tipo === "RX") {
                    corTexto = "text-emerald-400";
                    prefixo = "RX <-";
                    corBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                  } else if (log.tipo === "ERRO") {
                    corTexto = "text-rose-400";
                    prefixo = "ERR";
                    corBadge = "bg-rose-500/15 text-rose-400 border-rose-500/30";
                  }

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 py-0.5 hover:bg-slate-800/40 rounded px-1"
                    >
                      <span className="text-slate-500 shrink-0 text-[10px]">{log.dataHora}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono shrink-0 border ${corBadge}`}
                      >
                        {prefixo}
                      </span>
                      <span className={`break-all ${corTexto}`}>{log.conteudo}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Input de Envio de Comando Manual */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={comandoManual}
                  onChange={(e) => setComandoManual(e.target.value)}
                  onKeyDown={handleKeyDownComando}
                  placeholder={
                    conectado
                      ? "Digite o comando (ex: STATUS#, PARAM#, SERVER,1,...) e aperte Enter"
                      : "Conecte a porta USB para habilitar o envio de comandos..."
                  }
                  disabled={!conectado}
                  className="w-full bg-slate-950/80 text-slate-100 placeholder:text-slate-600 font-mono text-xs px-3.5 py-2.5 rounded-xl border border-slate-800 focus:outline-hidden focus:border-emerald-500 transition disabled:opacity-50"
                />
              </div>

              <button
                type="button"
                onClick={() => enviarComandoSerial(comandoManual)}
                disabled={!conectado || !comandoManual.trim()}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
                title="Enviar comando"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Enviar</span>
              </button>
            </div>

            {/* Comandos Rápidos de 1 Clique */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-800/60">
              <span className="text-[10px] font-mono text-slate-500 mr-1 font-bold uppercase tracking-wider">
                Atalhos ({protocoloAtivoDef.nome}):
              </span>
              {protocoloAtivoDef.atalhos.map((at) => (
                <button
                  key={at.cmd}
                  type="button"
                  onClick={() => enviarComandoSerial(at.cmd, protocoloAtivoDef.terminador, false)}
                  disabled={!conectado}
                  className={`px-2 py-1 rounded-lg text-[10px] font-mono bg-slate-800/90 hover:bg-slate-700 ${at.cor} border border-slate-700/80 transition cursor-pointer disabled:opacity-40 active:scale-95`}
                  title={at.desc}
                >
                  {at.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA (5 COLS): PRESETS RÁPIDOS E FORMULÁRIOS DE APONTAMENTO */}
        <div className="lg:col-span-5 space-y-4">
          {/* CARD MASTER: GRAVAÇÃO EM 1-CLIQUE DO PADRÃO CANÔNICO */}
          <div className="bg-gradient-to-br from-emerald-500/10 via-[#fbf2e9] to-teal-500/10 dark:from-emerald-950/30 dark:via-slate-900 dark:to-teal-950/30 border-2 border-emerald-500/40 p-4 sm:p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-2xl bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 shrink-0">
                  <Zap className="h-5 w-5 fill-slate-950" />
                </span>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                      Gravar Padrão Canônico (1-Clique)
                    </h3>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40">
                      HOMOLOGADO
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Aplica em lote toda a parametrização oficial: Servidor {portaTcp}, APN {apnNome}
                    , Timers {timerMovimento}s/{timerParado}s adaptados ao protocolo ativo.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={restaurarCamposPadraoCanonico}
                className="px-2 py-1 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-white/80 dark:bg-slate-800 border border-slate-300/80 dark:border-slate-700 transition cursor-pointer active:scale-95 shrink-0"
                title="Restaura todos os campos abaixo para os valores canônicos oficiais"
              >
                Restaurar Padrão
              </button>
            </div>

            {/* Seletor Manual e Governança da Família de Protocolo */}
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/80 dark:bg-slate-950/80 border border-emerald-500/30 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Protocolo em Uso:
                </span>
                <select
                  value={familiaProtocolo}
                  onChange={(e) => alternarFamiliaProtocolo(e.target.value as FamiliaProtocolo)}
                  className="bg-transparent text-xs font-bold text-emerald-700 dark:text-emerald-300 focus:outline-hidden cursor-pointer"
                >
                  <option value="concox_wanway">WanWay / Concox (GT06 - Hash #)</option>
                  <option value="modem_at">Modem Celular AT (Hayes - CRLF)</option>
                  <option value="coban_tk">Coban / TK (TK103 - CRLF)</option>
                </select>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30 shrink-0">
                {protocoloAtivoDef.badge}
              </span>
            </div>

            {/* Barra de Progresso durante a gravação */}
            {gravandoPadraoCanonico && progressoCanonico && (
              <div className="space-y-1.5 bg-white/90 dark:bg-slate-950/80 p-3 rounded-2xl border border-emerald-500/30">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin text-emerald-500" />
                    <span>{progressoCanonico.descricao}</span>
                  </span>
                  <span className="text-slate-500">
                    {progressoCanonico.passo} / {progressoCanonico.total}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{
                      width: `${(progressoCanonico.passo / progressoCanonico.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={gravarPadraoCanonicoCompleto}
              disabled={!conectado || gravandoPadraoCanonico}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shadow-lg shadow-emerald-500/25"
            >
              <Zap className="h-4 w-4 fill-slate-950" />
              <span>
                {gravandoPadraoCanonico
                  ? `Gravando ${protocoloAtivoDef.nome}...`
                  : protocoloAtivoDef.suportaServidorViaSerial === false
                    ? "Configurar Modem LTE via USB AT (APN e Energia)"
                    : "Gravar Padrão Canônico no Rastreador (1-Clique)"}
              </span>
            </button>

            {protocoloAtivoDef.suportaServidorViaSerial === false && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-900 dark:text-amber-200 space-y-2">
                <p className="leading-snug">
                  <strong>Aviso de Arquitetura J16 4G:</strong> O cabo USB direto acessa apenas a
                  interface AT do modem SIMCom (APN, IMEI, ICCID e sinal 4G). Parâmetros da placa
                  MCU (Servidor, Timers, Curva, Sono e Ignição) devem ser gravados via{" "}
                  <strong>Gateway TCP</strong> (com 12V ligado) ou adaptador{" "}
                  <strong>USB-TTL</strong>.
                </p>
                {dadosBancada.imei && (
                  <button
                    type="button"
                    onClick={gravarPadraoCanonicoViaGatewayTcp}
                    disabled={gravandoViaGatewayTcp}
                    className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                  >
                    <Radio
                      className={`h-3.5 w-3.5 ${gravandoViaGatewayTcp ? "animate-spin" : ""}`}
                    />
                    <span>
                      {gravandoViaGatewayTcp
                        ? `Enviando Lote GT06 para ${dadosBancada.imei}...`
                        : `Gravar Padrão GT06 Completo via Gateway TCP (IMEI ${dadosBancada.imei})`}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* GRUPO 1: RESGATE E APONTAMENTO PARA O SERVIDOR GD RASTREAMENTO */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Wifi className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  1. Apontar Servidor do GD Rastreamento
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Direciona o rastreador de outro servidor para a infraestrutura do GD Rastreamento
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Servidor DNS / Domínio
                </label>
                <input
                  type="text"
                  value={servidorDns}
                  onChange={(e) => setServidorDns(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Porta TCP
                </label>
                <input
                  type="text"
                  value={portaTcp}
                  onChange={(e) => setPortaTcp(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Modo Conexão
                </label>
                <select
                  value={modoIpDns}
                  onChange={(e) => setModoIpDns(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="1">1 = DNS (Nome)</option>
                  <option value="0">0 = IP Direto</option>
                </select>
              </div>
            </div>

            {/* Preview do comando que será transmitido */}
            <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                {protocoloAtivoDef.suportaServidorViaSerial === false
                  ? "Comando GT06 (MCU):"
                  : `Comando TX (${protocoloAtivoDef.nome}):`}
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[240px]">
                {protocoloAtivoDef.gerarComandoServidor(servidorDns, portaTcp, modoIpDns).cmd}
              </span>
            </div>

            <button
              type="button"
              onClick={gravarServidor}
              disabled={!conectado}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shadow-md shadow-emerald-500/20"
            >
              <Play className="h-3.5 w-3.5 fill-slate-950" />
              <span>
                {protocoloAtivoDef.suportaServidorViaSerial === false
                  ? dadosBancada.imei
                    ? "Enviar Servidor via Gateway TCP ou Copiar"
                    : "Copiar Comando SERVER GT06 (MCU)"
                  : "Gravar Servidor no Rastreador"}
              </span>
            </button>
          </div>

          {/* GRUPO 2: CONFIGURAR APN DO CHIP M2M */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500">
                  <Radio className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    2. Configurar APN do Chip M2M
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Dados de conexão celular GPRS / 4G
                  </p>
                </div>
              </div>

              {/* Botões rápidos de APN comum */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setApnNome("voxter.br");
                    setApnUser("algar");
                    setApnPass("1212");
                  }}
                  className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  title="Algar / Voxter"
                >
                  Algar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApnNome("claro.com.br");
                    setApnUser("claro");
                    setApnPass("claro");
                  }}
                  className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  title="Claro M2M"
                >
                  Claro
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApnNome("zap.vivo.com.br");
                    setApnUser("vivo");
                    setApnPass("vivo");
                  }}
                  className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                  title="Vivo M2M"
                >
                  Vivo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  APN
                </label>
                <input
                  type="text"
                  value={apnNome}
                  onChange={(e) => setApnNome(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Usuário
                </label>
                <input
                  type="text"
                  value={apnUser}
                  onChange={(e) => setApnUser(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Senha
                </label>
                <input
                  type="text"
                  value={apnPass}
                  onChange={(e) => setApnPass(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-sky-500"
                />
              </div>
            </div>

            {/* Preview do comando que será transmitido */}
            <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Comando TX ({protocoloAtivoDef.nome}):
              </span>
              <span className="font-bold text-sky-600 dark:text-sky-400 truncate max-w-[240px]">
                {protocoloAtivoDef.gerarComandoApn(apnNome, apnUser, apnPass).cmd}
              </span>
            </div>

            <button
              type="button"
              onClick={gravarApn}
              disabled={!conectado}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shadow-md shadow-sky-500/20"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>Gravar APN no Rastreador</span>
            </button>
          </div>

          {/* GRUPO 3: TIMERS OU GERENCIAMENTO DE ENERGIA */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  {protocoloAtivoDef.tituloTimers || "3. Timers e Frequência de Transmissão"}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {protocoloAtivoDef.descTimers ||
                    "Intervalos canônicos de rastreamento (segundos)"}
                </p>
              </div>
            </div>

            {protocoloAtivoDef.suportaTimersMovimento !== false ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Movimento (s)
                  </label>
                  <input
                    type="text"
                    value={timerMovimento}
                    onChange={(e) => setTimerMovimento(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Parado (s)
                  </label>
                  <input
                    type="text"
                    value={timerParado}
                    onChange={(e) => setTimerParado(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Heartbeat (s)
                  </label>
                  <input
                    type="text"
                    value={heartbeatTempo}
                    onChange={(e) => setHeartbeatTempo(e.target.value)}
                    className="w-full bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-purple-500"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                <span className="font-bold text-purple-600 dark:text-purple-400 block mb-0.5">
                  Conexão Ativa sem Repouso Profundo (PSM)
                </span>
                Modems celulares mantêm transmissão via contexto de dados. Este comando desativa a
                economia de energia para que o modem permaneça 100% online na rede celular.
              </div>
            )}

            {/* Preview do comando que será transmitido */}
            <div className="p-2 rounded-xl bg-white/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono">
              <span className="text-[10px] font-bold text-slate-500 uppercase">
                Comando TX ({protocoloAtivoDef.nome}):
              </span>
              <span className="font-bold text-purple-600 dark:text-purple-400 truncate max-w-[240px]">
                {
                  protocoloAtivoDef.gerarComandoTimers(timerMovimento, timerParado, heartbeatTempo)
                    .cmd
                }
              </span>
            </div>

            <button
              type="button"
              onClick={gravarTimers}
              disabled={!conectado}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 shadow-md shadow-purple-500/20"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              <span>{protocoloAtivoDef.labelBotaoTimers || "Gravar Timers e Heartbeat"}</span>
            </button>
          </div>

          {/* GRUPO 4: COMANDOS DE 1 TOQUE (CONSULTAS, DIAGNÓSTICO E RESET) */}
          <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-5 rounded-3xl shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  <Cpu className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    4. Comandos de 1 Toque ({protocoloAtivoDef.nome})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Consultas de auditoria, diagnóstico e reinicialização
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-300/60 dark:border-slate-700 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setFiltroUmToque("todos")}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                      filtroUmToque === "todos"
                        ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Todos ({protocoloAtivoDef.comandosUmToque.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroUmToque("consulta")}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                      filtroUmToque === "consulta"
                        ? "bg-sky-500 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Consultas (
                    {protocoloAtivoDef.comandosUmToque.filter((c) => c.categoria !== "acao").length}
                    )
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroUmToque("acao")}
                    className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                      filtroUmToque === "acao"
                        ? "bg-amber-500 text-slate-950 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    Ações (
                    {protocoloAtivoDef.comandosUmToque.filter((c) => c.categoria === "acao").length}
                    )
                  </button>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
                  {protocoloAtivoDef.badge}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[430px] overflow-y-auto pr-1">
              {protocoloAtivoDef.comandosUmToque.map((item) => {
                const categoriaItem = item.categoria || "consulta";
                if (filtroUmToque !== "todos" && categoriaItem !== filtroUmToque) {
                  return null;
                }
                return (
                  <button
                    key={item.cmd}
                    type="button"
                    onClick={() => {
                      if (
                        item.cmd === "FACTORY#" ||
                        item.cmd === "RESET#" ||
                        item.cmd === "AT+CFUN=1,1" ||
                        item.cmd === "reset123456"
                      ) {
                        if (
                          !window.confirm(
                            `Deseja enviar o comando "${item.titulo}" (${item.cmd}) para o rastreador?`,
                          )
                        ) {
                          return;
                        }
                      }
                      dispararComandoRapido(item.cmd, item.desc);
                    }}
                    disabled={!conectado}
                    className={`p-3 rounded-2xl text-left transition flex flex-col justify-between cursor-pointer disabled:opacity-50 border shadow-sm ${
                      item.estilo ||
                      "bg-white/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-800 dark:text-slate-100 border-slate-200/80 dark:border-slate-700/80"
                    }`}
                    title={`${item.titulo} (${item.cmd}): ${item.desc}`}
                  >
                    <div className="flex items-center justify-between w-full gap-1 mb-1">
                      <span className="text-xs font-black truncate">{item.titulo}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-900/60 font-bold opacity-80 shrink-0">
                        {item.cmd}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-tight">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
