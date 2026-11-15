import { useState, useEffect, useRef } from "react";
import {
  X,
  ShieldAlert,
  Clock,
  Bell,
  Check,
  Sliders,
  Loader2,
  MessageSquare,
  PhoneCall,
  Plus,
  Trash2,
  Users,
  ChevronDown,
  ChevronUp,
  Layers,
  Lock,
  Info,
} from "lucide-react";
import type { VeiculoGps } from "../types";
import {
  carregarHorarioUtilizacao,
  salvarHorarioUtilizacao,
  carregarRegrasVeiculo,
  salvarRegrasVeiculo,
  carregarContatosAlertaVeiculo,
  carregarConfigAlertasCliente,
  salvarConfigAlertasCliente,
  ouvirAtualizacoesAlertasCliente,
  obterAlertasOperacionaisPadrao,
  carregarVeiculosFrotaCliente,
  aplicarConfigAlertasTodaFrota,
  type HorarioUtilizacao,
  type RegrasVeiculo,
} from "../services/protecaoVeiculoService";
import {
  carregarPreferenciasNotificacao,
  salvarPreferenciasNotificacao,
  ouvirAtualizacoesPreferenciasNotificacao,
  type PreferenciasNotificacao,
  type CanaisAlertas,
  type CanalItemConfig,
  type ContatoAlertaWhatsapp,
  CANAIS_ALERTAS_PADRAO,
  PREFERENCIAS_PADRAO,
} from "../services/notificacoesService";
import {
  ALERTAS_VEICULO_CATALOGO,
  ALERTAS_CONTA_OPERACIONAL_CATALOGO,
  normalizarTelefoneDigitosBR,
  filtrarContatosPermitidosPorTipo,
  filtrarAlertasCatalogoVisiveis,
  type AlertaCatalogoItem,
  type CanalAlertaItemPreferencia,
} from "../constants/alertasCatalogo";
import { normalizarTelefoneParaWhatsapp } from "@/shared/lib/chatbotxBridge";
import { formatarTelefoneVisual } from "@/features/chat/services/whatsappContatosService";
import { useAuth } from "@/features/auth/context/AuthContext";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { ModalCienciaDesativarNfModal } from "@/features/configuracoes/components/ModalCienciaDesativarNfModal";
import { toast } from "sonner";

interface ConfiguracaoProtecaoModalProps {
  veiculo: VeiculoGps;
  onFechar: () => void;
  abaInicial?: "horarios" | "regras" | "notificacoes" | "whatsapp";
}

const DIAS_ROTULOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MAPA_CATALOGO_VEICULO = new Map<string, AlertaCatalogoItem>(
  ALERTAS_VEICULO_CATALOGO.map((item) => [item.chave, item]),
);

const ITENS_ALERTAS: Array<{
  chave:
    | "movimento_fora_horario"
    | "ignicao_fora_horario"
    | "guincho"
    | "saida_area"
    | "entrada_area"
    | "excesso_velocidade"
    | "desvio_rota"
    | "suspeita_jammer"
    | "perda_comunicacao"
    | "bateria_desconectada"
    | "baixa_tensao"
    | "colisao_impacto"
    | "panico"
    | "violacao_dispositivo"
    | "capotamento_inclinacao"
    | "corte_nao_autorizado_sms";
  titulo: string;
  desc: string;
  origem: string;
  restritoEquipeTecnica?: boolean;
}> = [
  {
    chave: "movimento_fora_horario" as const,
    titulo: "Movimento fora do horário",
    desc: "Deslocamento fora da janela habitual configurada",
    origem: "Monitoramento GPS e Horários de Uso",
  },
  {
    chave: "ignicao_fora_horario" as const,
    titulo: "Ignição fora do horário",
    desc: "Partida do motor em horários incomuns ou fins de semana",
    origem: "Sensor de Ignição do Rastreador e Horários",
  },
  {
    chave: "guincho" as const,
    titulo: "Movimento com Ignição Desligada (Guincho)",
    desc: "Veículo em movimento com motor desligado — possível reboque não autorizado",
    origem: "Sensor de Movimento com Ignição Desligada",
  },
  {
    chave: "saida_area" as const,
    titulo: "Saída de área segura (Geofence)",
    desc: "Veículo saindo de Casa, Trabalho ou áreas cadastradas",
    origem: "Cercas Virtuais e Áreas Seguras",
  },
  {
    chave: "entrada_area" as const,
    titulo: "Entrada em área segura",
    desc: "Confirmação de chegada em locais cadastrados",
    origem: "Cercas Virtuais e Áreas Seguras",
  },
  {
    chave: "excesso_velocidade" as const,
    titulo: "Excesso de velocidade",
    desc: "Velocidade superior ao limite configurado com persistência",
    origem: "Monitoramento de Velocidade do Veículo",
  },
  {
    chave: "desvio_rota" as const,
    titulo: "Desvio de rota monitorada",
    desc: "Veículo saindo do corredor planejado do trajeto",
    origem: "Rotas Monitoradas no Mapa",
  },
  {
    chave: "suspeita_jammer" as const,
    titulo: "Suspeita de Jammer / Silenciamento Súbito",
    desc: "Perda abrupta de sinal em trânsito suspeita de bloqueador celular/GPS",
    origem: "Monitoramento Contínuo de Sinal",
  },
  {
    chave: "perda_comunicacao" as const,
    titulo: "Perda de comunicação",
    desc: "Rastreador sem sinal de dados por período prolongado",
    origem: "Supervisor de Conexão do Rastreador",
  },
  {
    chave: "bateria_desconectada" as const,
    titulo: "Corte / Desconexão da bateria principal",
    desc: "Aviso imediato se a alimentação for cortada, operando na reserva",
    origem: "Sensor de Alimentação Principal do Veículo",
  },
  {
    chave: "baixa_tensao" as const,
    titulo: "Baixa tensão da bateria",
    desc: "Queda na alimentação da bateria abaixo do limiar configurado",
    origem: "Sensor de Tensão da Bateria",
  },
  {
    chave: "colisao_impacto" as const,
    titulo: "Impacto / Colisão Detectada",
    desc: "Sensor de choque ou aceleração G anômala detectado pelo rastreador",
    origem: "Sensor de Impacto e Vibração do Rastreador",
  },
  {
    chave: "panico" as const,
    titulo: "Botão de Pânico / Emergência SOS",
    desc: "Acionamento emergencial do botão SOS pelo condutor do veículo",
    origem: "Botão de Pânico e Emergência SOS",
  },
  {
    chave: "violacao_dispositivo" as const,
    titulo: "Violação Física / Remoção do Rastreador",
    desc: "Tentativa de abertura, desligamento forçado ou violação do hardware",
    origem: "Sensor Anti-Violação do Rastreador",
  },
  {
    chave: "capotamento_inclinacao" as const,
    titulo: "Capotamento / Inclinação Crítica",
    desc: "Tombamento ou inclinação severa detectada na análise cinemática 3-eixos",
    origem: "Sensor Inercial de Inclinação e Tombamento",
  },
  {
    chave: "corte_nao_autorizado_sms" as const,
    titulo: "Defesa Ativa: Sabotagem de Relé via SMS",
    desc: "Corte ou desbloqueio não autorizado via SMS revertido automaticamente",
    origem: "Defesa Interna da Central Técnica",
    restritoEquipeTecnica: true,
  },
];

function clonarCanalPreferencia(
  origem?: Partial<CanalItemConfig | CanalAlertaItemPreferencia> | null,
  fallbackAtivo = true,
  fallbackCanais = { app: true, whatsapp: true, ligacao: false },
): CanalItemConfig {
  const temListaWhats = Array.isArray(origem?.destinatarios_whatsapp);
  const temListaLig = Array.isArray(origem?.destinatarios_ligacao);
  const temListaGenerica = Array.isArray(origem?.destinatarios);

  const app = origem?.app !== undefined ? Boolean(origem.app) : Boolean(fallbackCanais.app);
  const whatsapp =
    origem?.whatsapp !== undefined ? Boolean(origem.whatsapp) : Boolean(fallbackCanais.whatsapp);
  const ligacao =
    origem?.ligacao !== undefined ? Boolean(origem.ligacao) : Boolean(fallbackCanais.ligacao);

  const ativo =
    typeof origem?.ativo === "boolean"
      ? origem.ativo
      : origem
        ? Boolean(app || whatsapp || ligacao)
        : fallbackAtivo;

  return {
    ativo,
    app: ativo ? app : false,
    whatsapp: ativo ? whatsapp : false,
    ligacao: ativo ? ligacao : false,
    ...(temListaWhats
      ? { destinatarios_whatsapp: [...(origem?.destinatarios_whatsapp || [])] }
      : temListaGenerica
        ? { destinatarios_whatsapp: [...(origem?.destinatarios || [])] }
        : {}),
    ...(temListaLig
      ? { destinatarios_ligacao: [...(origem?.destinatarios_ligacao || [])] }
      : temListaGenerica
        ? { destinatarios_ligacao: [...(origem?.destinatarios || [])] }
        : {}),
  };
}

function montarCanaisIniciais(
  n?: PreferenciasNotificacao | null,
  r?: RegrasVeiculo | null,
): Record<string, CanalItemConfig> {
  const porAlerta =
    (r?.canais_alertas?.por_alerta as Record<string, CanalItemConfig> | undefined) ||
    (n?.canais_alertas?.por_alerta as Record<string, CanalItemConfig> | undefined) ||
    (n?.canais_por_alerta as Record<string, CanalItemConfig> | undefined) ||
    {};

  const temPorAlerta = Object.keys(porAlerta).length > 0;
  const resultado: Record<string, CanalItemConfig> = {};

  for (const item of ITENS_ALERTAS) {
    const catalogoItem = MAPA_CATALOGO_VEICULO.get(item.chave);
    const salvoPorAlerta = porAlerta[item.chave];

    if (salvoPorAlerta) {
      const defaultsCatalogo = catalogoItem?.padraoCanais || {
        app: true,
        whatsapp: true,
        ligacao: false,
      };
      resultado[item.chave] = clonarCanalPreferencia(
        salvoPorAlerta,
        catalogoItem?.padraoAtivo ?? true,
        {
          app: Boolean(defaultsCatalogo.app),
          whatsapp: Boolean(defaultsCatalogo.whatsapp),
          ligacao: Boolean(defaultsCatalogo.ligacao),
        },
      );
    } else {
      const temFlagExplicita = n && typeof (n as any)[item.chave] === "boolean";
      const alertaAtivo = temFlagExplicita
        ? Boolean((n as any)[item.chave])
        : Boolean(catalogoItem?.padraoAtivo ?? (PREFERENCIAS_PADRAO as any)[item.chave]);

      if (temPorAlerta) {
        const defaultsCatalogo = catalogoItem?.padraoCanais || {
          app: true,
          whatsapp: true,
          ligacao: false,
        };
        resultado[item.chave] = {
          ativo: alertaAtivo,
          app: alertaAtivo
            ? Boolean(
                defaultsCatalogo.app || (!defaultsCatalogo.whatsapp && !defaultsCatalogo.ligacao),
              )
            : false,
          whatsapp: alertaAtivo ? Boolean(defaultsCatalogo.whatsapp) : false,
          ligacao: alertaAtivo ? Boolean(defaultsCatalogo.ligacao) : false,
        };
      } else {
        const globalApp = r?.canais_alertas?.app ?? n?.canais_alertas?.app ?? true;
        const globalWhats = r?.canais_alertas?.whatsapp ?? n?.canais_alertas?.whatsapp ?? true;
        const globalLig = r?.canais_alertas?.ligacao ?? n?.canais_alertas?.ligacao ?? false;

        resultado[item.chave] = {
          ativo: alertaAtivo,
          app: alertaAtivo ? globalApp : false,
          whatsapp: alertaAtivo ? globalWhats : false,
          ligacao: alertaAtivo ? globalLig : false,
        };
      }
    }
  }

  return resultado;
}

function mesclarContatosPorTelefone(
  base: ContatoAlertaWhatsapp[],
  extras: ContatoAlertaWhatsapp[],
): ContatoAlertaWhatsapp[] {
  const mapa = new Map<string, ContatoAlertaWhatsapp>();
  for (const c of base) {
    const d = normalizarTelefoneDigitosBR(c?.telefone);
    if (d) mapa.set(d, c);
  }
  for (const c of extras) {
    const d = normalizarTelefoneDigitosBR(c?.telefone);
    if (d && !mapa.has(d)) {
      mapa.set(d, c);
    }
  }
  return Array.from(mapa.values());
}

export function ConfiguracaoProtecaoModal({
  veiculo,
  onFechar,
  abaInicial = "horarios",
}: ConfiguracaoProtecaoModalProps) {
  const { session } = useAuth();
  const isEquipeTecnica = Boolean(session?.isSuperAdmin || session?.isAdmin || session?.isOperador);
  const [abaAtiva, setAbaAtiva] = useState<"horarios" | "regras" | "notificacoes" | "whatsapp">(
    abaInicial,
  );
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Estados dos Horários
  const [horario, setHorario] = useState<HorarioUtilizacao | null>(null);
  const [horaInicio, setHoraInicio] = useState("06:00");
  const [horaFim, setHoraFim] = useState("22:00");
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4, 5]);
  const [permitirFimDeSemana, setPermitirFimDeSemana] = useState(false);

  // Estados das Regras
  const [regras, setRegras] = useState<RegrasVeiculo | null>(null);
  const [limiteVelocidade, setLimiteVelocidade] = useState(110);
  const [toleranciaExcesso, setToleranciaExcesso] = useState(15);
  const [alertaMovimento, setAlertaMovimento] = useState(true);
  const [alertaIgricao, setAlertaIgricao] = useState(true);
  const [alertaBaixaTensao, setAlertaBaixaTensao] = useState(11.5);
  const [minutosSemSinal, setMinutosSemSinal] = useState(30);

  // Estados de Notificações Veiculares com valor padrão imediato (nunca nulo)
  const [notificacoes, setNotificacoes] = useState<PreferenciasNotificacao>(PREFERENCIAS_PADRAO);
  const [canaisPorAlerta, setCanaisPorAlerta] = useState<Record<string, CanalItemConfig>>(() =>
    montarCanaisIniciais(PREFERENCIAS_PADRAO, null),
  );
  const canaisAnterioresVeiculoRef = useRef<
    Record<string, { app: boolean; whatsapp: boolean; ligacao: boolean }>
  >({});

  // Estados de Alertas da Conta, NF e Financeiro (7 alertas reais)
  const [alertasOperacionais, setAlertasOperacionais] = useState<
    Record<string, CanalAlertaItemPreferencia>
  >(() => obterAlertasOperacionaisPadrao());
  const canaisAnterioresContaRef = useRef<
    Record<string, { app: boolean; whatsapp: boolean; ligacao: boolean }>
  >({});

  // Canais e Destinatários Autorizados (WhatsApp e Ligações)
  const [canaisAlertas, setCanaisAlertas] = useState<CanaisAlertas>(CANAIS_ALERTAS_PADRAO);
  const [destinatariosWhatsapp, setDestinatariosWhatsapp] = useState<ContatoAlertaWhatsapp[]>([]);
  const [contatosConta, setContatosConta] = useState<ContatoAlertaWhatsapp[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  // UI da Central de Alertas (filtro, seletor de destinatários expandido, aplicação em frota, ciência NF)
  const [filtroCategoriaAlertas, setFiltroCategoriaAlertas] = useState<
    "todos" | "veiculo" | "conta"
  >("todos");
  const [alertaDestinatariosAberto, setAlertaDestinatariosAberto] = useState<string | null>(null);
  const [frotaVeiculos, setFrotaVeiculos] = useState<
    Array<{ id: string; placa: string | null; cliente_id: string | null }>
  >([]);
  const [confirmarAplicarFrota, setConfirmarAplicarFrota] = useState(false);
  const [aplicandoFrota, setAplicandoFrota] = useState(false);
  const [modalCienciaNfAberto, setModalCienciaNfAberto] = useState(false);
  const [comCienciaExpurgoNf, setComCienciaExpurgoNf] = useState(false);
  const [acaoPendenteNf, setAcaoPendenteNf] = useState<{
    tipo: "ativo" | "canal";
    chave: string;
    canal?: "app" | "whatsapp" | "ligacao";
  } | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !modalCienciaNfAberto) {
        onFechar();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onFechar, modalCienciaNfAberto]);

  useEffect(() => {
    let ativo = true;

    async function carregarTudo() {
      if (!veiculo?.id) return;
      setCarregando(true);
      try {
        const [h, r, n, cfgCliente, veiculosFrota] = await Promise.all([
          carregarHorarioUtilizacao(veiculo.id),
          carregarRegrasVeiculo(veiculo.id),
          carregarPreferenciasNotificacao(session?.userId, veiculo.id),
          carregarConfigAlertasCliente(veiculo.cliente_id, session?.userId),
          carregarVeiculosFrotaCliente(veiculo.cliente_id),
        ]);

        if (!ativo) return;

        setFrotaVeiculos(veiculosFrota);

        if (h) {
          setHorario(h);
          const inicioStr = String(h.hora_inicio || "06:00:00");
          setHoraInicio(inicioStr.length >= 5 ? inicioStr.slice(0, 5) : "06:00");
          const fimStr = String(h.hora_fim || "22:00:00");
          setHoraFim(fimStr.length >= 5 ? fimStr.slice(0, 5) : "22:00");
          const diasValidos = Array.isArray(h.dias_semana)
            ? h.dias_semana.map(Number).filter((d) => !isNaN(d))
            : [1, 2, 3, 4, 5];
          setDiasSemana(diasValidos.length > 0 ? diasValidos : [1, 2, 3, 4, 5]);
          setPermitirFimDeSemana(Boolean(h.permitir_fim_de_semana));
        }

        if (r) {
          setRegras(r);
          setLimiteVelocidade(Number(r.limite_velocidade_geral) || 110);
          setToleranciaExcesso(Number(r.tolerancia_excesso_segundos) || 15);
          setAlertaMovimento(Boolean(r.alerta_movimento_nao_autorizado));
          setAlertaIgricao(Boolean(r.alerta_ignicao_fora_horario));
          setAlertaBaixaTensao(
            r.alerta_baixa_tensao_v !== undefined && r.alerta_baixa_tensao_v !== null
              ? Number(r.alerta_baixa_tensao_v)
              : 11.5,
          );
          setMinutosSemSinal(Number(r.minutos_limite_sem_comunicacao) || 30);
          if (r.canais_alertas) {
            setCanaisAlertas(r.canais_alertas);
          }
        }

        if (n) {
          setNotificacoes({
            ...PREFERENCIAS_PADRAO,
            ...n,
          });
          if (n.canais_alertas) {
            setCanaisAlertas(n.canais_alertas);
          }
        }

        // Inicializa canais individuais e destinatários por alerta (16 alertas veiculares)
        setCanaisPorAlerta(montarCanaisIniciais(n, r));

        // Carrega alertas da conta / NF / financeiro (alertas operacionais)
        if (cfgCliente?.alertasOperacionais) {
          setAlertasOperacionais(cfgCliente.alertasOperacionais);
        }

        // Carrega lista consolidada de contatos do veículo + conta
        const contatosIniciais = await carregarContatosAlertaVeiculo(
          veiculo.id,
          veiculo.cliente_id,
          r?.whatsapp_destinatarios || n?.whatsapp_destinatarios,
        );

        if (ativo) {
          const extrasConta = (cfgCliente?.contatosAlertas || []).filter(
            (c) => c.tipo === "adicional",
          );
          const mescladosVeiculo = mesclarContatosPorTelefone(contatosIniciais, extrasConta);
          const mescladosConta = mesclarContatosPorTelefone(
            cfgCliente?.contatosAlertas || contatosIniciais,
            mescladosVeiculo,
          );
          setDestinatariosWhatsapp(mescladosVeiculo);
          setContatosConta(mescladosConta);
        }
      } catch (err) {
        console.error("Erro ao carregar configurações de proteção:", err);
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarTudo();

    // Escuta atualizações de regras e alertas em tempo real vindas de qualquer dispositivo
    let unsub = () => {};
    let unsubCliente = () => {};
    try {
      unsub = ouvirAtualizacoesPreferenciasNotificacao((dados) => {
        if (!ativo || !dados || !dados.preferencias) return;
        if (!dados.veiculoId || dados.veiculoId === veiculo?.id) {
          setNotificacoes((antigas) => ({
            ...antigas,
            ...dados.preferencias,
          }));
          if (dados.preferencias.movimento_fora_horario !== undefined) {
            setAlertaMovimento(Boolean(dados.preferencias.movimento_fora_horario));
          }
          if (dados.preferencias.ignicao_fora_horario !== undefined) {
            setAlertaIgricao(Boolean(dados.preferencias.ignicao_fora_horario));
          }
          if (dados.preferencias.canais_alertas) {
            setCanaisAlertas(dados.preferencias.canais_alertas);
          }
          if (
            dados.preferencias.canais_alertas?.por_alerta ||
            dados.preferencias.canais_por_alerta
          ) {
            setCanaisPorAlerta(montarCanaisIniciais(dados.preferencias, null));
          }
          if (Array.isArray(dados.preferencias.whatsapp_destinatarios)) {
            setDestinatariosWhatsapp(dados.preferencias.whatsapp_destinatarios);
          }
        }
      });

      unsubCliente = ouvirAtualizacoesAlertasCliente((dados) => {
        if (!ativo || !dados) return;
        const mesmoCliente =
          !dados.clienteId || !veiculo?.cliente_id || dados.clienteId === veiculo.cliente_id;
        const mesmoUsuario = !dados.userId || !session?.userId || dados.userId === session.userId;
        if (!mesmoCliente || !mesmoUsuario) return;

        if (dados.alertasOperacionais) {
          setAlertasOperacionais((prev) => ({ ...prev, ...dados.alertasOperacionais }));
        }
        if (Array.isArray(dados.contatosAlertas)) {
          setContatosConta(dados.contatosAlertas);
        }
      });
    } catch (err) {
      console.warn("Falha ao registrar ouvinte de preferências:", err);
    }

    return () => {
      ativo = false;
      try {
        unsub();
        unsubCliente();
      } catch {
        // Ignora
      }
    };
  }, [veiculo?.id, veiculo?.cliente_id, session?.userId]);

  const alternarDiaSemana = (dia: number) => {
    const listaAtual = Array.isArray(diasSemana) ? diasSemana : [1, 2, 3, 4, 5];
    if (listaAtual.includes(dia)) {
      setDiasSemana(listaAtual.filter((d) => d !== dia));
    } else {
      setDiasSemana([...listaAtual, dia].sort((a, b) => a - b));
    }
  };

  const alternarContatoWhatsapp = (id: string) => {
    const target = destinatariosWhatsapp.find((c) => c.id === id);
    const digitosTarget = normalizarTelefoneDigitosBR(target?.telefone);

    setDestinatariosWhatsapp((lista) =>
      lista.map((c) => (c.id === id ? { ...c, ativo: !c.ativo } : c)),
    );
    if (digitosTarget) {
      setContatosConta((lista) =>
        lista.map((c) =>
          normalizarTelefoneDigitosBR(c.telefone) === digitosTarget ? { ...c, ativo: !c.ativo } : c,
        ),
      );
    }
  };

  const removerContatoAdicional = (id: string) => {
    const target = destinatariosWhatsapp.find((c) => c.id === id);
    const digitosTarget = normalizarTelefoneDigitosBR(target?.telefone);

    setDestinatariosWhatsapp((lista) => lista.filter((c) => c.id !== id));
    if (digitosTarget) {
      setContatosConta((lista) =>
        lista.filter((c) => normalizarTelefoneDigitosBR(c.telefone) !== digitosTarget),
      );
      setCanaisPorAlerta((prev) => {
        const atualizado = { ...prev };
        for (const k of Object.keys(atualizado)) {
          const item = atualizado[k];
          if (!item) continue;
          atualizado[k] = {
            ...item,
            ...(Array.isArray(item.destinatarios_whatsapp)
              ? {
                  destinatarios_whatsapp: item.destinatarios_whatsapp.filter(
                    (f) => normalizarTelefoneDigitosBR(f) !== digitosTarget,
                  ),
                }
              : {}),
            ...(Array.isArray(item.destinatarios_ligacao)
              ? {
                  destinatarios_ligacao: item.destinatarios_ligacao.filter(
                    (f) => normalizarTelefoneDigitosBR(f) !== digitosTarget,
                  ),
                }
              : {}),
          };
        }
        return atualizado;
      });
      setAlertasOperacionais((prev) => {
        const atualizado = { ...prev };
        for (const k of Object.keys(atualizado)) {
          const item = atualizado[k];
          if (!item) continue;
          atualizado[k] = {
            ...item,
            ...(Array.isArray(item.destinatarios_whatsapp)
              ? {
                  destinatarios_whatsapp: item.destinatarios_whatsapp.filter(
                    (f) => normalizarTelefoneDigitosBR(f) !== digitosTarget,
                  ),
                }
              : {}),
            ...(Array.isArray(item.destinatarios_ligacao)
              ? {
                  destinatarios_ligacao: item.destinatarios_ligacao.filter(
                    (f) => normalizarTelefoneDigitosBR(f) !== digitosTarget,
                  ),
                }
              : {}),
          };
        }
        return atualizado;
      });
    }
    toast.success("Número adicional removido dos alertas.");
  };

  const handleAdicionarContatoAdicional = () => {
    if (!novoNome.trim()) {
      toast.error("Informe um nome ou identificação para o contato.");
      return;
    }
    const foneNormalizado = normalizarTelefoneParaWhatsapp(novoTelefone);
    if (!foneNormalizado || foneNormalizado.length < 10) {
      toast.error("Informe um número de celular válido com DDD.");
      return;
    }

    const limpo = normalizarTelefoneDigitosBR(foneNormalizado);
    if (destinatariosWhatsapp.some((c) => normalizarTelefoneDigitosBR(c.telefone) === limpo)) {
      toast.error("Este número de telefone já está cadastrado na lista.");
      return;
    }

    const novoContato: ContatoAlertaWhatsapp = {
      id: `adic-${Date.now()}`,
      nome: novoNome.trim(),
      telefone: foneNormalizado,
      tipo: "adicional",
      ativo: true,
      padrao: false,
    };

    setDestinatariosWhatsapp((lista) => [...lista, novoContato]);
    setContatosConta((lista) => mesclarContatosPorTelefone(lista, [novoContato]));
    setNovoNome("");
    setNovoTelefone("");
    toast.success("Número adicional cadastrado para WhatsApp e Ligações!");
  };

  const atualizarEstadoCanaisVeiculo = (novoMapa: Record<string, CanalItemConfig>) => {
    setCanaisPorAlerta(novoMapa);
    setNotificacoes((notif) => {
      const proximo = { ...notif };
      for (const item of ITENS_ALERTAS) {
        const cfg = novoMapa[item.chave];
        (proximo as any)[item.chave] = Boolean(
          cfg && cfg.ativo !== false && (cfg.app || cfg.whatsapp || cfg.ligacao),
        );
      }
      return proximo;
    });
    setCanaisAlertas({
      app: Object.values(novoMapa).some((c) => Boolean(c.ativo !== false && c.app)),
      whatsapp: Object.values(novoMapa).some((c) => Boolean(c.ativo !== false && c.whatsapp)),
      ligacao: Object.values(novoMapa).some((c) => Boolean(c.ativo !== false && c.ligacao)),
      por_alerta: novoMapa,
    });
  };

  const alternarAlertaVeiculoAtivo = (chave: string) => {
    const atual = canaisPorAlerta[chave] || {
      ativo: true,
      app: true,
      whatsapp: true,
      ligacao: false,
    };
    const estavaAtivo =
      atual.ativo !== false && Boolean(atual.app || atual.whatsapp || atual.ligacao);

    if (estavaAtivo) {
      canaisAnterioresVeiculoRef.current[chave] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
      const desativado: CanalItemConfig = {
        ...atual,
        ativo: false,
        app: false,
        whatsapp: false,
        ligacao: false,
      };
      atualizarEstadoCanaisVeiculo({ ...canaisPorAlerta, [chave]: desativado });
    } else {
      const restaurado = canaisAnterioresVeiculoRef.current[chave];
      const catalogo = MAPA_CATALOGO_VEICULO.get(chave);
      const baseCanais = restaurado || {
        app: catalogo?.padraoAtivo ? Boolean(catalogo.padraoCanais.app) : true,
        whatsapp: catalogo?.padraoAtivo ? Boolean(catalogo.padraoCanais.whatsapp) : true,
        ligacao: Boolean(catalogo?.padraoCanais.ligacao),
      };
      const ativado: CanalItemConfig = {
        ...atual,
        ativo: true,
        app: baseCanais.app || (!baseCanais.whatsapp && !baseCanais.ligacao),
        whatsapp: baseCanais.whatsapp,
        ligacao: baseCanais.ligacao,
      };
      atualizarEstadoCanaisVeiculo({ ...canaisPorAlerta, [chave]: ativado });
    }
  };

  const alternarCanalItem = (chave: string, canal: "app" | "whatsapp" | "ligacao") => {
    const atual = canaisPorAlerta[chave] || {
      ativo: true,
      app: true,
      whatsapp: true,
      ligacao: false,
    };
    const novoValor = !atual[canal];
    const atualizadoRaw: CanalItemConfig = {
      ...atual,
      [canal]: novoValor,
    };
    const alertaAtivo = Boolean(
      atualizadoRaw.app || atualizadoRaw.whatsapp || atualizadoRaw.ligacao,
    );
    const atualizado: CanalItemConfig = {
      ...atualizadoRaw,
      ativo: alertaAtivo,
    };
    if (!alertaAtivo && (atual.app || atual.whatsapp || atual.ligacao)) {
      canaisAnterioresVeiculoRef.current[chave] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
    }

    const novoMapa = { ...canaisPorAlerta, [chave]: atualizado };
    atualizarEstadoCanaisVeiculo(novoMapa);
  };

  const aplicarMudancaConta = (
    chave: string,
    updater: (atual: CanalAlertaItemPreferencia) => CanalAlertaItemPreferencia,
  ) => {
    const base = alertasOperacionais[chave] || {
      ativo: true,
      app: true,
      whatsapp: true,
      ligacao: false,
    };
    const proximo = updater(base);
    const novoMapa = { ...alertasOperacionais, [chave]: proximo };
    const nfPronta = novoMapa.nf_pronta_download;
    const nfExpurgo = novoMapa.alerta_nf_expurgo;
    if (
      nfPronta?.ativo &&
      (nfPronta.app || nfPronta.whatsapp || nfPronta.ligacao) &&
      nfExpurgo?.ativo &&
      (nfExpurgo.app || nfExpurgo.whatsapp || nfExpurgo.ligacao)
    ) {
      setComCienciaExpurgoNf(false);
    }
    setAlertasOperacionais(novoMapa);
  };

  const alternarAlertaContaAtivo = (item: AlertaCatalogoItem) => {
    const atual = alertasOperacionais[item.chave] || item.padraoCanais;
    const estavaAtivo =
      atual.ativo !== false && Boolean(atual.app || atual.whatsapp || atual.ligacao);

    if (estavaAtivo && item.notaExclusao && !comCienciaExpurgoNf) {
      setAcaoPendenteNf({ tipo: "ativo", chave: item.chave });
      setModalCienciaNfAberto(true);
      return;
    }

    if (estavaAtivo) {
      canaisAnterioresContaRef.current[item.chave] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
      aplicarMudancaConta(item.chave, (a) => ({
        ...a,
        ativo: false,
        app: false,
        whatsapp: false,
        ligacao: false,
      }));
    } else {
      const restaurado = canaisAnterioresContaRef.current[item.chave];
      const base = restaurado || {
        app: Boolean(item.padraoCanais.app),
        whatsapp: Boolean(item.padraoCanais.whatsapp),
        ligacao: Boolean(item.padraoCanais.ligacao),
      };
      aplicarMudancaConta(item.chave, (a) => ({
        ...a,
        ativo: true,
        app: base.app || (!base.whatsapp && !base.ligacao),
        whatsapp: base.whatsapp,
        ligacao: base.ligacao,
      }));
    }
  };

  const alternarCanalContaItem = (
    item: AlertaCatalogoItem,
    canal: "app" | "whatsapp" | "ligacao",
  ) => {
    const atual = alertasOperacionais[item.chave] || item.padraoCanais;
    const novoValor = !atual[canal];
    const proxApp = canal === "app" ? novoValor : Boolean(atual.app);
    const proxWhats = canal === "whatsapp" ? novoValor : Boolean(atual.whatsapp);
    const proxLig = canal === "ligacao" ? novoValor : Boolean(atual.ligacao);
    const ficaraAtivo = Boolean(proxApp || proxWhats || proxLig);

    if (!ficaraAtivo && item.notaExclusao && !comCienciaExpurgoNf) {
      setAcaoPendenteNf({ tipo: "canal", chave: item.chave, canal });
      setModalCienciaNfAberto(true);
      return;
    }

    if (!ficaraAtivo && (atual.app || atual.whatsapp || atual.ligacao)) {
      canaisAnterioresContaRef.current[item.chave] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
    }

    aplicarMudancaConta(item.chave, (a) => ({
      ...a,
      ativo: ficaraAtivo,
      app: proxApp,
      whatsapp: proxWhats,
      ligacao: proxLig,
    }));
  };

  const confirmarCienciaDesativacaoNf = () => {
    setComCienciaExpurgoNf(true);
    const pendente = acaoPendenteNf;
    if (pendente) {
      const atual = alertasOperacionais[pendente.chave] || {
        ativo: true,
        app: true,
        whatsapp: true,
        ligacao: false,
      };
      canaisAnterioresContaRef.current[pendente.chave] = {
        app: Boolean(atual.app),
        whatsapp: Boolean(atual.whatsapp),
        ligacao: Boolean(atual.ligacao),
      };
      aplicarMudancaConta(pendente.chave, (a) => ({
        ...a,
        ativo: false,
        app: false,
        whatsapp: false,
        ligacao: false,
      }));
    }
    setAcaoPendenteNf(null);
    setModalCienciaNfAberto(false);
    toast.info("Desativação confirmada mediante ciência. Clique em Salvar para gravar.");
  };

  const atualizarDestinatariosPorAlerta = (
    categoria: "veiculo" | "conta",
    chave: string,
    campoCanal: "destinatarios_whatsapp" | "destinatarios_ligacao",
    novaLista: string[] | undefined,
  ) => {
    if (categoria === "veiculo") {
      const atual = canaisPorAlerta[chave] || {
        ativo: true,
        app: true,
        whatsapp: true,
        ligacao: false,
      };
      const novoItem: CanalItemConfig = { ...atual };
      if (novaLista === undefined) {
        delete novoItem[campoCanal];
        delete novoItem.destinatarios;
      } else {
        novoItem[campoCanal] = novaLista;
      }
      atualizarEstadoCanaisVeiculo({ ...canaisPorAlerta, [chave]: novoItem });
    } else {
      aplicarMudancaConta(chave, (atual) => {
        const novoItem: CanalAlertaItemPreferencia = { ...atual };
        if (novaLista === undefined) {
          delete novoItem[campoCanal];
          delete novoItem.destinatarios;
        } else {
          novoItem[campoCanal] = novaLista;
        }
        return novoItem;
      });
    }
  };

  const handleAplicarTodaFrota = async () => {
    if (frotaVeiculos.length <= 1) return;
    setAplicandoFrota(true);
    try {
      const canaisConsolidados: CanaisAlertas = {
        app: Object.values(canaisPorAlerta).some((c) => Boolean(c.ativo !== false && c.app)),
        whatsapp: Object.values(canaisPorAlerta).some((c) =>
          Boolean(c.ativo !== false && c.whatsapp),
        ),
        ligacao: Object.values(canaisPorAlerta).some((c) =>
          Boolean(c.ativo !== false && c.ligacao),
        ),
        por_alerta: canaisPorAlerta,
      };
      const prefsFrota: PreferenciasNotificacao = {
        ...notificacoes,
        canais_alertas: canaisConsolidados,
        canais_por_alerta: canaisPorAlerta,
        whatsapp_destinatarios: destinatariosWhatsapp,
      };
      for (const item of ITENS_ALERTAS) {
        const cfg = canaisPorAlerta[item.chave];
        (prefsFrota as any)[item.chave] = Boolean(
          cfg && cfg.ativo !== false && (cfg.app || cfg.whatsapp || cfg.ligacao),
        );
      }

      const res = await aplicarConfigAlertasTodaFrota({
        veiculos: frotaVeiculos,
        userId: session?.userId || "",
        preferencias: prefsFrota,
        destinatariosWhatsapp,
      });

      if (res.sucesso) {
        toast.success(
          `Alertas, canais e números aplicados a ${res.atualizados} veículo(s) da frota!`,
        );
        setConfirmarAplicarFrota(false);
      } else {
        toast.error("Não foi possível replicar os alertas para toda a frota.");
      }
    } catch {
      toast.error("Erro ao aplicar configurações de alertas para a frota.");
    } finally {
      setAplicandoFrota(false);
    }
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      // 1. Salva Horários
      const okHorario = await salvarHorarioUtilizacao({
        id: horario?.id,
        veiculo_id: veiculo.id,
        cliente_id: veiculo.cliente_id,
        dias_semana: diasSemana,
        hora_inicio: `${horaInicio}:00`,
        hora_fim: `${horaFim}:00`,
        permitir_fim_de_semana: permitirFimDeSemana,
        ativo: true,
      });

      const canaisConsolidados: CanaisAlertas = {
        app: Object.values(canaisPorAlerta).some((c) => Boolean(c.ativo !== false && c.app)),
        whatsapp: Object.values(canaisPorAlerta).some((c) =>
          Boolean(c.ativo !== false && c.whatsapp),
        ),
        ligacao: Object.values(canaisPorAlerta).some((c) =>
          Boolean(c.ativo !== false && c.ligacao),
        ),
        por_alerta: canaisPorAlerta,
      };

      for (const item of ITENS_ALERTAS) {
        const cfg = canaisPorAlerta[item.chave];
        (notificacoes as any)[item.chave] = Boolean(
          cfg && cfg.ativo !== false && (cfg.app || cfg.whatsapp || cfg.ligacao),
        );
      }

      // 2. Salva Regras com alertas_ativos persistentes por veículo
      const okRegras = await salvarRegrasVeiculo({
        id: regras?.id,
        veiculo_id: veiculo.id,
        cliente_id: veiculo.cliente_id,
        limite_velocidade_geral: limiteVelocidade,
        tolerancia_excesso_segundos: toleranciaExcesso,
        alerta_movimento_nao_autorizado: notificacoes
          ? notificacoes.movimento_fora_horario
          : alertaMovimento,
        alerta_ignicao_fora_horario: notificacoes
          ? notificacoes.ignicao_fora_horario
          : alertaIgricao,
        alerta_baixa_tensao_v: alertaBaixaTensao,
        minutos_limite_sem_comunicacao: minutosSemSinal,
        alertas_ativos: {
          ...notificacoes,
          canais_por_alerta: canaisPorAlerta,
          canais_alertas: canaisConsolidados,
          whatsapp_destinatarios: destinatariosWhatsapp,
        } as any,
        canais_alertas: canaisConsolidados,
        whatsapp_destinatarios: destinatariosWhatsapp,
      });

      // 3. Salva Notificações (persistência por veículo + usuário + broadcast Realtime)
      let okPrefs = false;
      if (notificacoes) {
        notificacoes.canais_alertas = canaisConsolidados;
        notificacoes.canais_por_alerta = canaisPorAlerta;
        notificacoes.whatsapp_destinatarios = destinatariosWhatsapp;
        if (await salvarPreferenciasNotificacao(session?.userId || "", notificacoes, veiculo.id)) {
          okPrefs = true;
        }
      }

      // 4. Salva Alertas da Conta, NF e Financeiro + catálogo de números da conta
      const contatosContaSincronizados = mesclarContatosPorTelefone(
        destinatariosWhatsapp,
        contatosConta,
      );
      const okConta = await salvarConfigAlertasCliente({
        clienteId: veiculo.cliente_id || null,
        userId: session?.userId || null,
        alertasOperacionais,
        contatosAlertas: contatosContaSincronizados,
        comCienciaExpurgoNf,
      });

      if (okHorario || okRegras || okPrefs || okConta) {
        toast.success("Parâmetros de proteção e alertas salvos com sucesso!");
        onFechar();
      } else {
        toast.error("Não foi possível gravar as alterações. Tente novamente.");
      }
    } catch {
      toast.error("Erro ao salvar parâmetros de proteção.");
    } finally {
      setSalvando(false);
    }
  };

  if (!veiculo) return null;

  const contatosBaseConta = mesclarContatosPorTelefone(contatosConta, destinatariosWhatsapp);
  const itensVeicularesVisiveis = filtrarAlertasCatalogoVisiveis(ITENS_ALERTAS, isEquipeTecnica);
  const itensContaVisiveis = filtrarAlertasCatalogoVisiveis(
    ALERTAS_CONTA_OPERACIONAL_CATALOGO,
    Boolean(isEquipeTecnica && !veiculo.cliente_id),
  );
  const totalVeicAtivos = itensVeicularesVisiveis.filter((item) => {
    const c = canaisPorAlerta[item.chave];
    return Boolean(c && c.ativo !== false && (c.app || c.whatsapp || c.ligacao));
  }).length;
  const totalContaAtivos = itensContaVisiveis.filter((item) => {
    const c = alertasOperacionais[item.chave];
    return Boolean(c && c.ativo !== false && (c.app || c.whatsapp || c.ligacao));
  }).length;

  const renderSeletorDestinatarios = (params: {
    categoria: "veiculo" | "conta";
    chave: string;
    whatsappAtivo: boolean;
    ligacaoAtiva: boolean;
    regra: CanalItemConfig | CanalAlertaItemPreferencia;
    financeiro?: boolean;
  }) => {
    const { categoria, chave, whatsappAtivo, ligacaoAtiva, regra, financeiro } = params;
    const listaBase = categoria === "veiculo" ? destinatariosWhatsapp : contatosBaseConta;
    const contatosPermitidos = filtrarContatosPermitidosPorTipo(listaBase, chave);
    const ativosPermitidos = contatosPermitidos
      .filter((c) => c.ativo !== false)
      .map((c) => normalizarTelefoneDigitosBR(c.telefone))
      .filter((d) => d.length >= 10);

    const renderBlocoCanal = (
      tituloCanal: string,
      campo: "destinatarios_whatsapp" | "destinatarios_ligacao",
      listaCustom?: string[],
    ) => {
      const modoEspecifico = Array.isArray(listaCustom);
      const setSelecionados = new Set(
        (listaCustom || []).map((f) => normalizarTelefoneDigitosBR(f)).filter(Boolean),
      );

      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              {tituloCanal}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => atualizarDestinatariosPorAlerta(categoria, chave, campo, undefined)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  !modoEspecifico
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950"
                    : "bg-white/80 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-700"
                }`}
              >
                Todos os ativos ({ativosPermitidos.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!modoEspecifico) {
                    atualizarDestinatariosPorAlerta(categoria, chave, campo, [...ativosPermitidos]);
                  }
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  modoEspecifico
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950"
                    : "bg-white/80 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-700"
                }`}
              >
                Escolher específicos
              </button>
            </div>
          </div>

          {modoEspecifico && (
            <div className="space-y-1 pt-1">
              {contatosPermitidos.length === 0 ? (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-2">
                  Nenhum número autorizado disponível para este alerta.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {contatosPermitidos.map((c) => {
                    const dig = normalizarTelefoneDigitosBR(c.telefone);
                    const marcado = setSelecionados.has(dig);
                    return (
                      <label
                        key={`${campo}-${c.id}`}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] cursor-pointer transition ${
                          marcado
                            ? "bg-emerald-500/10 border-emerald-500/40 text-slate-900 dark:text-slate-100"
                            : "bg-white/70 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-bold truncate flex items-center gap-1">
                            <span>{c.nome}</span>
                            {c.ativo === false && (
                              <span className="text-[9px] px-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                                Inativo no padrão
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono opacity-80">
                            +{formatarTelefoneVisual(c.telefone)}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => {
                            const prox = new Set(setSelecionados);
                            if (marcado) {
                              prox.delete(dig);
                            } else if (dig) {
                              prox.add(dig);
                            }
                            atualizarDestinatariosPorAlerta(
                              categoria,
                              chave,
                              campo,
                              Array.from(prox),
                            );
                          }}
                          className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 shrink-0"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
              {setSelecionados.size === 0 && contatosPermitidos.length > 0 && (
                <p className="text-[10px] text-amber-700 dark:text-amber-300 font-semibold">
                  Nenhum número selecionado para este canal no momento.
                </p>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="mt-2.5 pt-2.5 border-t border-slate-300/60 dark:border-slate-800 space-y-2.5 bg-slate-200/35 dark:bg-slate-900/50 rounded-xl p-2.5">
        {financeiro && (
          <div className="flex items-start gap-2 text-[10px] text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
            <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Blindagem Administrativa:</strong> alertas financeiros são restritos ao
              titular e contatos autorizados, nunca enviados a motoristas.
            </span>
          </div>
        )}

        {whatsappAtivo &&
          renderBlocoCanal(
            "Destinatários via WhatsApp",
            "destinatarios_whatsapp",
            regra.destinatarios_whatsapp,
          )}

        {ligacaoAtiva &&
          renderBlocoCanal(
            "Destinatários via Ligação Telefônica",
            "destinatarios_ligacao",
            regra.destinatarios_ligacao,
          )}

        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span>Precisa cadastrar ou ativar um telefone?</span>
          <button
            type="button"
            onClick={() => setAbaAtiva("whatsapp")}
            className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
          >
            Gerenciar números autorizados
          </button>
        </div>
      </div>
    );
  };

  const renderResumoDestinatariosBtn = (
    regra: CanalItemConfig | CanalAlertaItemPreferencia,
    chave: string,
    expandido: boolean,
    categoria: "veiculo" | "conta",
  ) => {
    if (!regra.whatsapp && !regra.ligacao) return null;
    const listaBase = categoria === "veiculo" ? destinatariosWhatsapp : contatosBaseConta;
    const ativosPermitidos = filtrarContatosPermitidosPorTipo(listaBase, chave).filter(
      (c) => c.ativo !== false,
    ).length;

    const customW = Array.isArray(regra.destinatarios_whatsapp);
    const customL = Array.isArray(regra.destinatarios_ligacao);
    const qtdW = customW ? regra.destinatarios_whatsapp?.length || 0 : ativosPermitidos;
    const qtdL = customL ? regra.destinatarios_ligacao?.length || 0 : ativosPermitidos;
    const avisoVazio = (regra.whatsapp && qtdW === 0) || (regra.ligacao && qtdL === 0);

    return (
      <button
        type="button"
        onClick={() => setAlertaDestinatariosAberto(expandido ? null : chave)}
        aria-expanded={expandido}
        aria-label={`Escolher números destinatários para ${chave}`}
        className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          avisoVazio
            ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40"
            : expandido
              ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 border-transparent shadow-xs"
              : "bg-white/70 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 border-slate-300/70 dark:border-slate-700 hover:border-emerald-500/50"
        }`}
      >
        <Users className="h-3.5 w-3.5 shrink-0" />
        <span>
          {customW || customL
            ? `Números (${regra.whatsapp ? `W:${qtdW}` : ""}${regra.whatsapp && regra.ligacao ? " " : ""}${regra.ligacao ? `L:${qtdL}` : ""})`
            : `Números: Todos (${ativosPermitidos})`}
        </span>
        {expandido ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
    );
  };

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-protecao-veiculo"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md select-none overflow-y-auto"
      >
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3
                  id="titulo-protecao-veiculo"
                  className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
                >
                  Proteção do Veículo
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700">
                    {veiculo.placa}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Horários habituais, limites e central de alertas em tempo real
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar configurações de proteção e alertas"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* SELETOR DE ABAS PRINCIPAIS (PADRÃO CANÔNICO DJR-TELA) */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          <div className="p-2 sm:p-2.5 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8] dark:bg-slate-950/60 shrink-0">
            <div
              role="tablist"
              aria-label="Seções de proteção e alertas"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-2xl shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl w-full"
            >
              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "horarios"}
                onClick={() => setAbaAtiva("horarios")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  abaAtiva === "horarios"
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                }`}
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span>Horários</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "regras"}
                onClick={() => setAbaAtiva("regras")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  abaAtiva === "regras"
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                }`}
              >
                <Sliders className="h-4 w-4 shrink-0" />
                <span>Velocidade</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "notificacoes"}
                onClick={() => setAbaAtiva("notificacoes")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  abaAtiva === "notificacoes"
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                }`}
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span>Notificações</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={abaAtiva === "whatsapp"}
                onClick={() => setAbaAtiva("whatsapp")}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[38px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  abaAtiva === "whatsapp"
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950 shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span>WhatsApp</span>
                {destinatariosWhatsapp.some((d) => d.ativo) && (
                  <span
                    className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 transition-colors ${
                      abaAtiva === "whatsapp"
                        ? "bg-white/20 text-white dark:bg-slate-900/40 dark:text-slate-950"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {destinatariosWhatsapp.filter((d) => d.ativo).length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {carregando ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Carregando configurações...
              </div>
            ) : (
              <>
                {/* ABA 1: HORÁRIOS DE USO */}
                {abaAtiva === "horarios" && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300">
                      Defina o período esperado de circulação. Caso ocorra ignição ou deslocamento
                      fora destas condições, o sistema emitirá alerta de uso incomum.
                    </div>

                    {/* Faixa Horária Habitual */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Horário Habitual de Utilização
                      </label>
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans mb-1">
                            Início Permitido
                          </span>
                          <input
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans mb-1">
                            Fim Permitido
                          </span>
                          <input
                            type="time"
                            value={horaFim}
                            onChange={(e) => setHoraFim(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Dias da Semana */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">
                        Dias com Uso Habitual
                      </label>
                      <div className="flex items-center justify-between gap-1">
                        {DIAS_ROTULOS.map((rotulo, idx) => {
                          const ativo = Array.isArray(diasSemana) && diasSemana.includes(idx);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => alternarDiaSemana(idx)}
                              className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${
                                ativo
                                  ? "bg-emerald-500 text-slate-950 font-black shadow-xs"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {rotulo}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Uso em Fim de Semana */}
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Permitir Circulação no Fim de Semana
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Se desativado, qualquer uso no sábado ou domingo gerará notificação.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={permitirFimDeSemana}
                        onChange={(e) => setPermitirFimDeSemana(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* ABA 2: VELOCIDADE E BATERIA */}
                {abaAtiva === "regras" && (
                  <div className="space-y-4">
                    {/* Limite de Velocidade Geral */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                        Limite de Velocidade Máxima Permitida (km/h)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="60"
                          max="180"
                          step="5"
                          value={limiteVelocidade}
                          onChange={(e) => setLimiteVelocidade(parseInt(e.target.value))}
                          className="flex-1 accent-emerald-500"
                        />
                        <span className="font-mono font-black text-sm px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
                          {limiteVelocidade} km/h
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Tolerância de permanência: {toleranciaExcesso} segundos (evita disparos
                        consecutivos em ultrapassagens breves).
                      </div>
                    </div>

                    {/* Limiar de Baixa Tensão e Perda de Sinal */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                          Baixa Tensão (Volts)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="9.0"
                          max="12.4"
                          value={alertaBaixaTensao}
                          onChange={(e) => setAlertaBaixaTensao(parseFloat(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Alerta de bateria fraca
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                          Limite Sem Sinal (min)
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="1440"
                          value={minutosSemSinal}
                          onChange={(e) => setMinutosSemSinal(parseInt(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Alerta de perda de conexão
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ABA 3: NOTIFICAÇÕES */}
                {abaAtiva === "notificacoes" && (
                  <div className="space-y-4">
                    {/* Cabeçalho e filtro da Central de Alertas */}
                    <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-950/60 border border-slate-300/60 dark:border-slate-800 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-[11px] uppercase text-slate-800 dark:text-slate-200 block">
                            Canais de Envio dos Alertas por Item
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            Ative cada alerta real, escolha App, WhatsApp ou Ligação e defina os
                            números destinatários.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAbaAtiva("whatsapp")}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                        >
                          Gerenciar Números ({destinatariosWhatsapp.filter((d) => d.ativo).length})
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFiltroCategoriaAlertas("todos")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            filtroCategoriaAlertas === "todos"
                              ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950"
                              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-800"
                          }`}
                        >
                          Todos ({itensVeicularesVisiveis.length + itensContaVisiveis.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiltroCategoriaAlertas("veiculo")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            filtroCategoriaAlertas === "veiculo"
                              ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950"
                              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-800"
                          }`}
                        >
                          Veículo ({totalVeicAtivos}/{itensVeicularesVisiveis.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFiltroCategoriaAlertas("conta")}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            filtroCategoriaAlertas === "conta"
                              ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950"
                              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300/70 dark:border-slate-800"
                          }`}
                        >
                          Conta, NF e Financeiro ({totalContaAtivos}/{itensContaVisiveis.length})
                        </button>
                      </div>
                    </div>

                    {/* SEÇÃO 1: ALERTAS DO VEÍCULO (15 PARA CLIENTE / 16 PARA EQUIPE TÉCNICA) */}
                    {(filtroCategoriaAlertas === "todos" || filtroCategoriaAlertas === "veiculo") &&
                      notificacoes && (
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                            <div>
                              <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-200">
                                Alertas do Veículo ({totalVeicAtivos}/
                                {itensVeicularesVisiveis.length} ativos)
                              </h4>
                              <p className="text-[10px] text-slate-500">
                                {isEquipeTecnica
                                  ? "Monitoramento efetivo via Telemetria SQL, CRON servidor e Gateway GT06/J16"
                                  : "Monitoramento ativo pelo rastreador e pela plataforma em tempo real"}
                              </p>
                            </div>

                            {frotaVeiculos.length > 1 && (
                              <div className="flex items-center gap-1.5">
                                {!confirmarAplicarFrota ? (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmarAplicarFrota(true)}
                                    disabled={aplicandoFrota}
                                    className="min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 flex items-center gap-1.5 transition cursor-pointer"
                                  >
                                    <Layers className="h-3.5 w-3.5 shrink-0" />
                                    <span>Aplicar em toda a frota ({frotaVeiculos.length})</span>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-xl px-2 py-1">
                                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                      Replicar para {frotaVeiculos.length} veículos?
                                    </span>
                                    <button
                                      type="button"
                                      onClick={handleAplicarTodaFrota}
                                      disabled={aplicandoFrota}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[10px] cursor-pointer"
                                    >
                                      {aplicandoFrota ? "Aplicando..." : "Sim"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmarAplicarFrota(false)}
                                      disabled={aplicandoFrota}
                                      className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] cursor-pointer"
                                    >
                                      Não
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            {itensVeicularesVisiveis.map((item) => {
                              const catalogoItem = MAPA_CATALOGO_VEICULO.get(item.chave);
                              const tituloVisivel = isEquipeTecnica
                                ? catalogoItem?.tituloEquipe || item.titulo
                                : item.titulo;
                              const descVisivel = isEquipeTecnica
                                ? catalogoItem?.descEquipe || item.desc
                                : item.desc;
                              const origemVisivel = isEquipeTecnica
                                ? catalogoItem?.origemTecnica || item.origem
                                : catalogoItem?.origemMonitoramento || item.origem;
                              const ehRestritoEquipe = Boolean(
                                item.restritoEquipeTecnica || catalogoItem?.restritoEquipeTecnica,
                              );
                              const canalItem = canaisPorAlerta[item.chave] || {
                                ativo: Boolean(notificacoes[item.chave]),
                                app: Boolean(notificacoes[item.chave]),
                                whatsapp: Boolean(notificacoes[item.chave]),
                                ligacao: false,
                              };
                              const algumAtivo =
                                canalItem.ativo !== false &&
                                Boolean(canalItem.app || canalItem.whatsapp || canalItem.ligacao);
                              const expandido = alertaDestinatariosAberto === item.chave;

                              return (
                                <div
                                  key={item.chave}
                                  className={`p-3 rounded-2xl border transition space-y-2.5 ${
                                    algumAtivo
                                      ? "bg-[#eaf0f8] dark:bg-slate-950/60 border-slate-300/60 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                                      : "bg-slate-100/50 dark:bg-slate-950/30 border-slate-200/50 dark:border-slate-800/40 opacity-80"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                                        <span>{tituloVisivel}</span>
                                        <span
                                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                            algumAtivo
                                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                              : "bg-slate-200 dark:bg-slate-800 text-slate-500 font-normal"
                                          }`}
                                        >
                                          {algumAtivo ? "Ativo" : "Desativado"}
                                        </span>
                                        {ehRestritoEquipe && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25 font-bold flex items-center gap-0.5">
                                            <Lock className="h-2.5 w-2.5" />
                                            <span>Restrito Equipe Técnica</span>
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                        {descVisivel}
                                      </div>
                                      <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                                        Origem: {origemVisivel}
                                      </div>
                                    </div>

                                    {/* Switch principal Opt-in / Opt-out */}
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={algumAtivo}
                                      aria-label={`Ativar ou desativar alerta ${tituloVisivel}`}
                                      onClick={() => alternarAlertaVeiculoAtivo(item.chave)}
                                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                        algumAtivo
                                          ? "bg-emerald-500"
                                          : "bg-slate-300 dark:bg-slate-700"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
                                          algumAtivo ? "translate-x-6" : "translate-x-1"
                                        }`}
                                      />
                                    </button>
                                  </div>

                                  {/* Marcação individual por canal + Destinatários */}
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        aria-pressed={canalItem.app}
                                        aria-label={`Canal App para ${tituloVisivel}`}
                                        onClick={() => alternarCanalItem(item.chave, "app")}
                                        className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                          canalItem.app
                                            ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                                            : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                        }`}
                                        title="Notificação no App e Web Push"
                                      >
                                        <Bell className="h-3 w-3 shrink-0" />
                                        <span>App</span>
                                        {canalItem.app && (
                                          <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        aria-pressed={canalItem.whatsapp}
                                        aria-label={`Canal WhatsApp para ${tituloVisivel}`}
                                        onClick={() => alternarCanalItem(item.chave, "whatsapp")}
                                        className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                          canalItem.whatsapp
                                            ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                                            : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                        }`}
                                        title="WhatsApp"
                                      >
                                        <MessageSquare className="h-3 w-3 shrink-0" />
                                        <span>WhatsApp</span>
                                        {canalItem.whatsapp && (
                                          <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        aria-pressed={Boolean(canalItem.ligacao)}
                                        aria-label={`Canal Ligação para ${tituloVisivel}`}
                                        onClick={() => alternarCanalItem(item.chave, "ligacao")}
                                        className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                          canalItem.ligacao
                                            ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs"
                                            : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                        }`}
                                        title="Ligação de Alarme"
                                      >
                                        <PhoneCall className="h-3 w-3 shrink-0" />
                                        <span>Ligação</span>
                                        {canalItem.ligacao && (
                                          <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />
                                        )}
                                      </button>
                                    </div>

                                    {renderResumoDestinatariosBtn(
                                      canalItem,
                                      item.chave,
                                      expandido,
                                      "veiculo",
                                    )}
                                  </div>

                                  {expandido &&
                                    (canalItem.whatsapp || canalItem.ligacao) &&
                                    renderSeletorDestinatarios({
                                      categoria: "veiculo",
                                      chave: item.chave,
                                      whatsappAtivo: Boolean(canalItem.whatsapp),
                                      ligacaoAtiva: Boolean(canalItem.ligacao),
                                      regra: canalItem,
                                    })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* SEÇÃO 2: ALERTAS DA CONTA, NF E FINANCEIRO (7 ITENS REAIS) */}
                    {(filtroCategoriaAlertas === "todos" || filtroCategoriaAlertas === "conta") && (
                      <div className="space-y-2.5 pt-2 border-t border-slate-300/60 dark:border-slate-800">
                        <div className="px-1">
                          <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-200">
                            Alertas da Conta, Notas Fiscais e Operação ({totalContaAtivos}/
                            {itensContaVisiveis.length} ativos)
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Preferências da sua conta: notas fiscais, mensalidades, manutenções,
                            agendamentos, suporte e chat.
                          </p>
                        </div>

                        <div className="space-y-2">
                          {itensContaVisiveis.map((item) => {
                            const regraConta = alertasOperacionais[item.chave] || item.padraoCanais;
                            const tituloContaVisivel = isEquipeTecnica
                              ? item.tituloEquipe || item.titulo
                              : item.titulo;
                            const descContaVisivel = isEquipeTecnica
                              ? item.descEquipe || item.desc
                              : item.desc;
                            const origemContaVisivel = isEquipeTecnica
                              ? item.origemTecnica || item.origemMonitoramento
                              : item.origemMonitoramento;
                            const ativoConta =
                              regraConta.ativo !== false &&
                              Boolean(regraConta.app || regraConta.whatsapp || regraConta.ligacao);
                            const expandido = alertaDestinatariosAberto === item.chave;

                            return (
                              <div
                                key={item.chave}
                                className={`p-3 rounded-2xl border transition space-y-2.5 ${
                                  ativoConta
                                    ? "bg-[#eaf0f8] dark:bg-slate-950/60 border-slate-300/60 dark:border-slate-800 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none"
                                    : "bg-slate-100/50 dark:bg-slate-950/30 border-slate-200/50 dark:border-slate-800/40 opacity-80"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                                      <span>{tituloContaVisivel}</span>
                                      <span
                                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                          ativoConta
                                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                            : "bg-slate-200 dark:bg-slate-800 text-slate-500 font-normal"
                                        }`}
                                      >
                                        {ativoConta ? "Ativo" : "Desativado"}
                                      </span>
                                      {item.financeiro && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 font-bold flex items-center gap-0.5">
                                          <Lock className="h-2.5 w-2.5" />
                                          <span>Blindagem ADM</span>
                                        </span>
                                      )}
                                      {item.notaExclusao && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25 font-bold flex items-center gap-0.5">
                                          <Info className="h-2.5 w-2.5" />
                                          <span>Expurgo 48h</span>
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                      {descContaVisivel}
                                    </div>
                                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                                      Origem: {origemContaVisivel}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={ativoConta}
                                    aria-label={`Ativar ou desativar alerta ${tituloContaVisivel}`}
                                    onClick={() => alternarAlertaContaAtivo(item)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                      ativoConta
                                        ? "bg-emerald-500"
                                        : "bg-slate-300 dark:bg-slate-700"
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none ${
                                        ativoConta ? "translate-x-6" : "translate-x-1"
                                      }`}
                                    />
                                  </button>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      aria-pressed={regraConta.app}
                                      aria-label={`Canal App para ${tituloContaVisivel}`}
                                      onClick={() => alternarCanalContaItem(item, "app")}
                                      className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                        regraConta.app
                                          ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                                          : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                      }`}
                                      title="Notificação no App e Web Push"
                                    >
                                      <Bell className="h-3 w-3 shrink-0" />
                                      <span>App</span>
                                      {regraConta.app && (
                                        <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      aria-pressed={regraConta.whatsapp}
                                      aria-label={`Canal WhatsApp para ${tituloContaVisivel}`}
                                      onClick={() => alternarCanalContaItem(item, "whatsapp")}
                                      className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                        regraConta.whatsapp
                                          ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs"
                                          : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                      }`}
                                      title="WhatsApp"
                                    >
                                      <MessageSquare className="h-3 w-3 shrink-0" />
                                      <span>WhatsApp</span>
                                      {regraConta.whatsapp && (
                                        <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      aria-pressed={Boolean(regraConta.ligacao)}
                                      aria-label={`Canal Ligação para ${tituloContaVisivel}`}
                                      onClick={() => alternarCanalContaItem(item, "ligacao")}
                                      className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                        regraConta.ligacao
                                          ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs"
                                          : "bg-white/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200"
                                      }`}
                                      title="Ligação Telefônica"
                                    >
                                      <PhoneCall className="h-3 w-3 shrink-0" />
                                      <span>Ligação</span>
                                      {regraConta.ligacao && (
                                        <Check className="h-2.5 w-2.5 ml-0.5 shrink-0" />
                                      )}
                                    </button>
                                  </div>

                                  {renderResumoDestinatariosBtn(
                                    regraConta,
                                    item.chave,
                                    expandido,
                                    "conta",
                                  )}
                                </div>

                                {expandido &&
                                  (regraConta.whatsapp || regraConta.ligacao) &&
                                  renderSeletorDestinatarios({
                                    categoria: "conta",
                                    chave: item.chave,
                                    whatsappAtivo: Boolean(regraConta.whatsapp),
                                    ligacaoAtiva: Boolean(regraConta.ligacao),
                                    regra: regraConta,
                                    financeiro: item.financeiro,
                                  })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 4: WHATSAPP E LIGAÇÕES */}
                {abaAtiva === "whatsapp" && (
                  <div className="space-y-4">
                    {/* Banner Informativo */}
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Destinatários de WhatsApp e Ligações</span>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        O celular cadastrado do cliente titular e os motoristas vinculados constam
                        abaixo. Estes telefones alimentam tanto os envios de WhatsApp quanto as
                        Ligações Telefônicas configurados por alerta na aba Notificações.
                      </p>
                    </div>

                    {/* Lista de Contatos Configurados */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                          Números Autorizados ({destinatariosWhatsapp.length})
                        </label>
                        <span className="text-[10px] text-slate-500">
                          {destinatariosWhatsapp.filter((d) => d.ativo).length} ativo(s)
                        </span>
                      </div>

                      {destinatariosWhatsapp.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800">
                          Nenhum telefone localizado para este veículo. Adicione um número abaixo.
                        </div>
                      ) : (
                        destinatariosWhatsapp.map((contato) => (
                          <div
                            key={contato.id}
                            className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-700 transition"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {contato.nome}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    contato.tipo === "cliente"
                                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                                      : contato.tipo === "motorista"
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                                  }`}
                                >
                                  {contato.tipo === "cliente"
                                    ? "Cliente Titular (Padrão)"
                                    : contato.tipo === "motorista"
                                      ? "Motorista"
                                      : "Número Adicional"}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                +{formatarTelefoneVisual(contato.telefone)}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                <span className="text-[10px] text-slate-500 font-semibold">
                                  {contato.ativo ? "Receber Alertas" : "Inativo"}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={contato.ativo}
                                  onChange={() => alternarContatoWhatsapp(contato.id)}
                                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                                />
                              </label>

                              {contato.tipo === "adicional" && (
                                <button
                                  type="button"
                                  onClick={() => removerContatoAdicional(contato.id)}
                                  aria-label={`Remover número ${contato.nome}`}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer"
                                  title="Remover este número adicional"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Formulário para Adicionar Número Adicional */}
                    <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950/80 border border-slate-300 dark:border-slate-800 space-y-2.5">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase block">
                        Adicionar Novo Número para Alertas
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="novo-contato-alerta-nome" className="sr-only">
                            Nome ou rótulo do contato
                          </label>
                          <input
                            id="novo-contato-alerta-nome"
                            type="text"
                            placeholder="Nome / Rótulo (ex: Gerente, Portaria)"
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="w-full min-h-[40px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label htmlFor="novo-contato-alerta-telefone" className="sr-only">
                            Telefone celular com DDD
                          </label>
                          <input
                            id="novo-contato-alerta-telefone"
                            type="tel"
                            placeholder="Telefone celular com DDD"
                            value={novoTelefone}
                            onChange={(e) => setNovoTelefone(e.target.value)}
                            className="w-full min-h-[40px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAdicionarContatoAdicional}
                        className="w-full min-h-[40px] py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Adicionar Número aos Alertas</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rodapé */}
          <div className="p-3.5 sm:p-5 border-t border-slate-300/60 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 bg-[#eaf0f8]/95 dark:bg-slate-950/90 shrink-0">
            <button
              type="button"
              onClick={onFechar}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || carregando}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Check className="h-4 w-4 shrink-0" />
              )}
              <span>{salvando ? "Salvando..." : "Salvar Configurações"}</span>
            </button>
          </div>
        </div>
      </div>

      <ModalCienciaDesativarNfModal
        aberto={modalCienciaNfAberto}
        carregando={false}
        onFechar={() => {
          setModalCienciaNfAberto(false);
          setAcaoPendenteNf(null);
        }}
        onConfirmar={confirmarCienciaDesativacaoNf}
      />
    </ModalPortal>
  );
}
