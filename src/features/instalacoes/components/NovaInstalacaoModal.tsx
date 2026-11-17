import { useState, useEffect, useMemo } from "react";
import {
  X,
  Wrench,
  Car,
  Radio,
  AlertTriangle,
  CheckCircle2,
  FileText,
  User,
  Search,
  Phone,
  Clock,
  Check,
  RefreshCw,
  Sparkles,
  PowerOff,
  RotateCcw,
  UserPlus,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/context/AuthContext";
import type { Instalacao, StatusInstalacao } from "../types";
import {
  salvarAtendimentoInstalacao,
  carregarClientesParaInstalacao,
  obterDadosPreenchimentoInstalacaoCliente,
  concluirAtendimentoInstalador,
} from "../services/instalacaoService";
import {
  listarItensEstoque,
  registrarBaixaInstalacao,
  obterMateriaisInstalacao,
  sincronizarEstoqueInstalacao,
  listarKitsEstoque,
} from "@/features/estoque/services/estoqueService";
import type { ItemEstoque, ItemBaixaInstalacao, KitEstoque } from "@/features/estoque/types";
import { Boxes, Package, Layers, TrendingUp, ScanLine, Cpu } from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { CameraBarcodeScannerModal } from "@/shared/components/CameraBarcodeScannerModal";
import { instaladorConfirmarKit } from "@/features/estoque/services/rastreadorChipService";

interface NovaInstalacaoModalProps {
  instalacaoParaEdicao?: Instalacao | null;
  clientePreSelecionadoId?: string | null;
  onSalvo: () => void;
  onFechar: () => void;
  onAbrirInstalacaoDireta?: () => void;
}

export function NovaInstalacaoModal({
  instalacaoParaEdicao,
  clientePreSelecionadoId,
  onSalvo,
  onFechar,
  onAbrirInstalacaoDireta,
}: NovaInstalacaoModalProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const isEdicao = !!instalacaoParaEdicao;
  const isRetirada = instalacaoParaEdicao?.tipo_servico === "retirada";
  const isInstalador = session?.isInstalador;
  const podeCriarDemanda = session?.isSuperAdmin || session?.isAdmin || session?.isOperador;

  const irParaCadastroNovoCliente = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sigo_abrir_novo_cliente", "1");
    }
    onFechar();
    navigate({ to: "/clientes" });
  };

  const [clienteId, setClienteId] = useState(
    instalacaoParaEdicao?.cliente_id || clientePreSelecionadoId || "",
  );
  const [clientes, setClientes] = useState<
    { id: string; nome: string; documento?: string; telefone?: string; status: string }[]
  >([]);
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<{
    id: string;
    nome: string;
    documento?: string;
    telefone?: string;
    status: string;
  } | null>(null);

  const PLACEHOLDERS_VEICULO_MODAL = new Set([
    "A DEFINIR",
    "SEMPLACA",
    "SEM PLACA",
    "VEICULO",
    "VEÍCULO",
    "PADRAO",
    "PADRÃO",
    "GERAL",
    "VEICULO PADRAO",
    "VEÍCULO PADRÃO",
  ]);
  const limparPlaceholderCampo = (v?: string | null) => {
    const t = (v || "").trim();
    if (!t) return "";
    return PLACEHOLDERS_VEICULO_MODAL.has(t.toUpperCase()) ? "" : t;
  };

  const [tipoVeiculo, setTipoVeiculo] = useState<string>(
    instalacaoParaEdicao?.tipo_veiculo || "carro",
  );
  const [placa, setPlaca] = useState(() =>
    isInstalador
      ? limparPlaceholderCampo(instalacaoParaEdicao?.placa)
      : instalacaoParaEdicao?.placa || "",
  );
  const [chassi, setChassi] = useState((instalacaoParaEdicao as any)?.chassi || "");
  const [marca, setMarca] = useState(() =>
    isInstalador
      ? limparPlaceholderCampo(instalacaoParaEdicao?.marca)
      : instalacaoParaEdicao?.marca || "",
  );
  const [modelo, setModelo] = useState(() =>
    isInstalador
      ? limparPlaceholderCampo(instalacaoParaEdicao?.modelo)
      : instalacaoParaEdicao?.modelo || "",
  );
  const [ano, setAno] = useState<number | undefined>(
    instalacaoParaEdicao?.ano || new Date().getFullYear(),
  );
  const [cor, setCor] = useState(instalacaoParaEdicao?.cor || "");
  const [kmInstalacao, setKmInstalacao] = useState<number>(
    instalacaoParaEdicao?.km_instalacao || 0,
  );
  const [horimetroInicial, setHorimetroInicial] = useState<number>(
    (instalacaoParaEdicao as any)?.horimetro_inicial || 0,
  );

  // Bloqueador / Corte de Combustível (definido pelo Instalador)
  const [bloqueadorInstalado, setBloqueadorInstalado] = useState<boolean>(
    instalacaoParaEdicao?.bloqueador_instalado !== undefined
      ? instalacaoParaEdicao.bloqueador_instalado
      : (instalacaoParaEdicao as any)?.com_bloqueador !== undefined
        ? (instalacaoParaEdicao as any)?.com_bloqueador
        : true,
  );
  const [tipoBloqueador, setTipoBloqueador] = useState<"rele_combustivel" | "outro">(
    instalacaoParaEdicao?.tipo_bloqueador === "outro" ? "outro" : "rele_combustivel",
  );
  const [bloqueadorDetalhes, setBloqueadorDetalhes] = useState(
    instalacaoParaEdicao?.bloqueador_detalhes || "",
  );
  const [releChicoteDoEstoque, setReleChicoteDoEstoque] = useState<boolean>(
    Boolean(instalacaoParaEdicao?.rele_chicote_do_estoque),
  );

  // Dados do Rastreador
  const [rastreadorImei, setRastreadorImei] = useState(instalacaoParaEdicao?.rastreador_imei || "");
  const [rastreadorModelo, setRastreadorModelo] = useState(
    instalacaoParaEdicao?.rastreador_modelo || "J16 4G",
  );
  const [chipIccid, setChipIccid] = useState(instalacaoParaEdicao?.chip_iccid || "");
  const [chipOperadora, setChipOperadora] = useState(
    instalacaoParaEdicao?.chip_operadora || "Vivo",
  );
  const [posicaoInstalacao, setPosicaoInstalacao] = useState(
    instalacaoParaEdicao?.posicao_instalacao || "Atrás do painel de instrumentos",
  );

  // Status e Motivo
  const [status, setStatus] = useState<StatusInstalacao>(
    instalacaoParaEdicao?.status || "concluida",
  );
  const [motivo, setMotivo] = useState(instalacaoParaEdicao?.motivo_pendencia_recusa || "");
  const [observacoes, setObservacoes] = useState(instalacaoParaEdicao?.observacoes || "");

  // Materiais de Estoque e Kits utilizados na Instalação
  const [materiaisEstoque, setMateriaisEstoque] = useState<ItemEstoque[]>([]);
  const [kitsDisponiveis, setKitsDisponiveis] = useState<KitEstoque[]>([]);
  const [kitSelecionadoId, setKitSelecionadoId] = useState<string>("");
  const [itensUtilizados, setItensUtilizados] = useState<Record<string, number>>({});
  const [itensOriginaisInstalacao, setItensOriginaisInstalacao] = useState<Record<string, number>>(
    {},
  );
  const [carregandoMateriais, setCarregandoMateriais] = useState(true);
  const [buscaMaterial, setBuscaMaterial] = useState("");
  const [apenasComSaldo, setApenasComSaldo] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [kitConfirmado, setKitConfirmado] = useState<boolean>(
    Boolean(instalacaoParaEdicao?.kit_confirmado_instalador),
  );
  const [scannerImeiAberto, setScannerImeiAberto] = useState(false);
  const [imeiEsperadoKit, setImeiEsperadoKit] = useState<string>(
    instalacaoParaEdicao?.rastreador_imei || "",
  );

  const temImeiEsperado = Boolean(
    imeiEsperadoKit && imeiEsperadoKit !== "A CONFERIR" && imeiEsperadoKit !== "PENDENTE",
  );
  const imeiDigitadoLimpo = rastreadorImei.trim().toUpperCase();
  const imeiEsperadoLimpo = imeiEsperadoKit.trim().toUpperCase();

  const imeiConfere = temImeiEsperado
    ? imeiDigitadoLimpo === imeiEsperadoLimpo
    : imeiDigitadoLimpo.length >= 8;

  const imeiDivergente = temImeiEsperado && imeiDigitadoLimpo.length > 0 && !imeiConfere;

  // Repasse financeiro do instalador (calculado dinamicamente com base na presença do bloqueador)
  const valorRepasseCalculado = bloqueadorInstalado
    ? Number(session?.valor_instalacao_com_bloqueador) ||
      Number(instalacaoParaEdicao?.valor_instalacao) ||
      80
    : Number(session?.valor_instalacao_sem_bloqueador) ||
      (Number(instalacaoParaEdicao?.valor_instalacao) > 30
        ? Number(instalacaoParaEdicao.valor_instalacao) - 30
        : 50);

  const conferirKitFisico = async (imeiLido: string) => {
    const limpo = imeiLido.trim().toUpperCase();
    if (!limpo) return;
    setRastreadorImei(limpo);

    if (temImeiEsperado) {
      if (limpo === imeiEsperadoLimpo) {
        setKitConfirmado(true);
        if (instalacaoParaEdicao?.id) {
          await instaladorConfirmarKit(instalacaoParaEdicao.id, limpo);
        }
        toast.success(
          "Rastreador conferido com sucesso! O IMEI coincide com o equipamento determinado pelo operador.",
        );
      } else {
        setKitConfirmado(false);
        toast.error(
          `Rastreador não confere com o disponibilizado para este veículo! Esperado: ${imeiEsperadoKit}.`,
        );
      }
    } else {
      setKitConfirmado(true);
      if (instalacaoParaEdicao?.id) {
        await instaladorConfirmarKit(instalacaoParaEdicao.id, limpo);
      }
      toast.success(`IMEI ${limpo} registrado para o kit.`);
    }
  };

  const aplicarKitCadastrado = (kitId: string) => {
    setKitSelecionadoId(kitId);
    if (!kitId) return;
    const kit = kitsDisponiveis.find((k) => k.id === kitId);
    if (!kit) return;

    const novos: Record<string, number> = { ...itensUtilizados };
    kit.itens.forEach((it) => {
      novos[it.item_id] = it.quantidade;
    });
    setItensUtilizados(novos);
    toast.success(`Kit "${kit.nome}" aplicado à instalação.`);
  };

  const handleToggleReleChicoteEstoque = (doEstoque: boolean) => {
    setReleChicoteDoEstoque(doEstoque);
    if (!doEstoque) {
      setItensUtilizados((prev) => {
        const novos = { ...prev };
        materiaisEstoque.forEach((item) => {
          const cat = (item.categoria || "").toLowerCase();
          if (
            cat.includes("relé") ||
            cat.includes("rele") ||
            cat.includes("porta") ||
            item.codigo_sku === "MAT-0003" ||
            item.codigo_sku === "MAT-0004"
          ) {
            delete novos[item.id];
          }
        });
        return novos;
      });
      toast.info("Insumos de corte (relé e chicote) marcados como fornecidos pelo instalador.");
    } else {
      setItensUtilizados((prev) => {
        const novos = { ...prev };
        materiaisEstoque.forEach((item) => {
          const cat = (item.categoria || "").toLowerCase();
          if (
            cat.includes("relé") ||
            cat.includes("rele") ||
            cat.includes("porta") ||
            item.codigo_sku === "MAT-0003" ||
            item.codigo_sku === "MAT-0004"
          ) {
            novos[item.id] = 1;
          }
        });
        return novos;
      });
      toast.success(
        "Insumos de corte (relé e chicote) adicionados para baixa do estoque do GD Rastreamento.",
      );
    }
  };

  const aplicarKitPadrao = () => {
    const padrao: Record<string, number> = {};
    materiaisEstoque.forEach((item) => {
      const cat = (item.categoria || "").toLowerCase();
      if (cat.includes("rastreador") || item.codigo_sku === "MAT-0001") padrao[item.id] = 1;
      if (cat.includes("chip") || item.codigo_sku === "MAT-0002") padrao[item.id] = 1;
      if (releChicoteDoEstoque) {
        if (cat.includes("relé") || cat.includes("rele") || item.codigo_sku === "MAT-0003")
          padrao[item.id] = 1;
        if (cat.includes("porta") || item.codigo_sku === "MAT-0004") padrao[item.id] = 1;
      }
      if (item.codigo_sku === "FIO-AUTO-10MM") padrao[item.id] = 2;
    });
    setItensUtilizados(padrao);
    toast.info("Kit padrão de insumos aplicado para instalação.");
  };

  const zerarMateriais = () => {
    setItensUtilizados({});
    toast.info(
      "Seleção de insumos zerada. Itens desmarcados serão devolvidos ao estoque ao salvar.",
    );
  };

  const materiaisFiltrados = useMemo(() => {
    return materiaisEstoque.filter((mat) => {
      const emUsoAqui = (itensUtilizados[mat.id] || 0) > 0;
      if (apenasComSaldo && mat.quantidade_atual <= 0 && !emUsoAqui) return false;
      if (!buscaMaterial.trim()) return true;
      const termo = buscaMaterial.toLowerCase();
      return (
        mat.nome.toLowerCase().includes(termo) ||
        mat.codigo_sku.toLowerCase().includes(termo) ||
        mat.categoria.toLowerCase().includes(termo)
      );
    });
  }, [materiaisEstoque, buscaMaterial, apenasComSaldo, itensUtilizados]);

  const totalItensSelecionados = useMemo(() => {
    return Object.values(itensUtilizados).filter((qtd) => qtd > 0).length;
  }, [itensUtilizados]);

  const totalUnidadesSelecionadas = useMemo(() => {
    return Object.values(itensUtilizados).reduce((acc, qtd) => acc + (qtd > 0 ? qtd : 0), 0);
  }, [itensUtilizados]);

  // Custo total somado de todos os materiais utilizados nesta instalação
  const custoTotalMateriaisUtilizados = useMemo(() => {
    return Object.entries(itensUtilizados).reduce((acc, [itemId, qtd]) => {
      if (qtd <= 0) return acc;
      const mat = materiaisEstoque.find((m) => m.id === itemId);
      const custo = mat ? Number(mat.custo_medio_unitario || 0) : 0;
      return acc + qtd * custo;
    }, 0);
  }, [itensUtilizados, materiaisEstoque]);

  const valorFechadoInstalacao = Number(instalacaoParaEdicao?.valor_instalacao || 0);
  const margemBrutaInstalacao = valorFechadoInstalacao - custoTotalMateriaisUtilizados;

  useEffect(() => {
    let ativo = true;
    async function carregarDadosEstoque() {
      setCarregandoMateriais(true);
      try {
        const [listaItens, listaKits] = await Promise.all([
          listarItensEstoque(),
          listarKitsEstoque(),
        ]);
        if (!ativo) return;
        setMateriaisEstoque(listaItens);
        setKitsDisponiveis(listaKits);

        if (instalacaoParaEdicao?.id) {
          // Edição de instalação: carregar EXATAMENTE os materiais utilizados que foram gravados no banco
          const matsGravados = await obterMateriaisInstalacao(instalacaoParaEdicao.id);
          if (!ativo) return;
          const preenchido: Record<string, number> = {};
          matsGravados.forEach((m) => {
            if (m.quantidade > 0) {
              preenchido[m.item_id] = m.quantidade;
            }
          });
          setItensUtilizados(preenchido);
          setItensOriginaisInstalacao(preenchido);
        } else {
          // Nova instalação: se houver kit padrão ou primeiro kit, deixa limpo ou pronto
          setItensUtilizados({});
          setItensOriginaisInstalacao({});
        }
      } catch (err) {
        console.warn("Erro ao carregar estoque para instalação:", err);
      } finally {
        if (ativo) setCarregandoMateriais(false);
      }
    }
    carregarDadosEstoque();
    return () => {
      ativo = false;
    };
  }, [instalacaoParaEdicao?.id]);

  useEffect(() => {
    const instaladorFiltroId = session?.isInstalador ? session.userId : undefined;
    carregarClientesParaInstalacao(instaladorFiltroId).then((lista) => {
      setClientes(lista);
      const targetId = instalacaoParaEdicao?.cliente_id || clientePreSelecionadoId;
      if (targetId) {
        const encontrado = lista.find((c) => c.id === targetId);
        if (encontrado) {
          setClienteSelecionado(encontrado);
          setClienteId(encontrado.id);
        } else if (instalacaoParaEdicao?.cliente_nome) {
          setClienteSelecionado({
            id: instalacaoParaEdicao.cliente_id,
            nome: instalacaoParaEdicao.cliente_nome,
            documento: instalacaoParaEdicao.cliente_documento,
            telefone: instalacaoParaEdicao.cliente_telefone,
            status: "ativo",
          });
        }
      }
      setCarregandoClientes(false);
    });
  }, [instalacaoParaEdicao, clientePreSelecionadoId, session?.isInstalador, session?.userId]);

  const [dadosPreCarregados, setDadosPreCarregados] = useState(false);

  const limparDadosNovoVeiculoEquipamento = () => {
    setTipoVeiculo("carro");
    setPlaca("");
    setChassi("");
    setMarca("");
    setModelo("");
    setAno(new Date().getFullYear());
    setCor("");
    setKmInstalacao(0);
    setHorimetroInicial(0);
    setPosicaoInstalacao("Atrás do painel de instrumentos");
    setRastreadorImei("");
    setImeiEsperadoKit("");
    setRastreadorModelo("J16 4G");
    setChipIccid("");
    setChipOperadora("Vivo");
    setKitConfirmado(false);
    setDadosPreCarregados(false);
  };

  // Efeito de pré-preenchimento automático inteligente apenas com base em ordem/veículo PENDENTE do cliente
  useEffect(() => {
    if (isEdicao || !clienteId) return;

    let ativo = true;
    obterDadosPreenchimentoInstalacaoCliente(clienteId).then((dados) => {
      if (!ativo || !dados) return;

      let preencheu = false;
      if (dados.placa) {
        setPlaca((atual) => {
          if (!atual || atual === "A DEFINIR") {
            preencheu = true;
            return dados.placa!;
          }
          return atual;
        });
      }
      if (dados.marca) {
        setMarca((atual) => {
          if (!atual || atual === "Geral") {
            preencheu = true;
            return dados.marca!;
          }
          return atual;
        });
      }
      if (dados.modelo) {
        setModelo((atual) => {
          if (!atual || atual === "Veículo") {
            preencheu = true;
            return dados.modelo!;
          }
          return atual;
        });
      }
      if (dados.ano) {
        setAno((atual) => {
          if (!atual || atual === new Date().getFullYear()) {
            preencheu = true;
            return dados.ano!;
          }
          return atual;
        });
      }
      if (dados.cor) {
        setCor((atual) => {
          if (!atual) {
            preencheu = true;
            return dados.cor!;
          }
          return atual;
        });
      }
      if (dados.tipoVeiculo) {
        setTipoVeiculo(dados.tipoVeiculo);
      }
      if (dados.kmInstalacao) {
        setKmInstalacao(dados.kmInstalacao);
      }
      if (dados.horimetro) {
        setHorimetroInicial(dados.horimetro);
      }
      if (dados.posicaoInstalacao) {
        setPosicaoInstalacao(dados.posicaoInstalacao);
      }
      if (dados.rastreadorImei) {
        setImeiEsperadoKit(dados.rastreadorImei);
        setRastreadorImei((atual) => {
          if (!atual || atual === "A CONFERIR" || atual === "PENDENTE") {
            preencheu = true;
            return dados.rastreadorImei!;
          }
          return atual;
        });
      }
      if (dados.rastreadorModelo) {
        setRastreadorModelo(dados.rastreadorModelo);
      }
      if (dados.chipIccid) {
        setChipIccid((atual) => {
          if (!atual) {
            preencheu = true;
            return dados.chipIccid!;
          }
          return atual;
        });
      }
      if (dados.chipOperadora) {
        setChipOperadora(dados.chipOperadora);
      }

      if (preencheu) {
        setDadosPreCarregados(true);
        toast.info(
          "Dados do veículo, rastreador (IMEI) e chip M2M pendentes pré-preenchidos do cadastro do cliente!",
        );
      }
    });

    return () => {
      ativo = false;
    };
  }, [clienteId, isEdicao]);

  const clientesFiltrados = useMemo(() => {
    if (!buscaCliente.trim()) return clientes;
    const termo = buscaCliente.toLowerCase().trim();
    const termoLimpo = termo.replace(/[^a-zA-Z0-9]/g, "");

    return clientes.filter((c) => {
      const nomeMatch = c.nome.toLowerCase().includes(termo);
      const docLimpo = (c.documento || "").replace(/[^a-zA-Z0-9]/g, "");
      const docMatch = docLimpo.includes(termoLimpo);
      const telLimpo = (c.telefone || "").replace(/[^a-zA-Z0-9]/g, "");
      const telMatch = telLimpo.includes(termoLimpo);
      return nomeMatch || docMatch || telMatch;
    });
  }, [clientes, buscaCliente]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEdicao && !clientePreSelecionadoId && isInstalador && !podeCriarDemanda) {
      toast.error(
        "Instaladores não podem criar novas demandas de instalação. Esta demanda é criada exclusivamente por operadores e administradores.",
      );
      return;
    }

    if (!clienteId) {
      toast.error("Selecione o cliente proprietário do veículo.");
      return;
    }

    if (!rastreadorImei.trim()) {
      toast.error("Informe o IMEI do rastreador.");
      return;
    }

    // Validação estrita para o instalador
    if (isInstalador) {
      if (temImeiEsperado && !imeiConfere) {
        toast.error(
          `Rastreador não confere com o disponibilizado para este veículo! O IMEI informado (${rastreadorImei}) difere do esperado (${imeiEsperadoKit}).`,
        );
        return;
      }

      const isSemPlaca =
        tipoVeiculo === "maquina" ||
        tipoVeiculo === "trator" ||
        tipoVeiculo === "equipamento" ||
        tipoVeiculo === "moto_eletrica";

      if (!isSemPlaca && !placa.trim()) {
        toast.error("Informe a placa do veículo.");
        return;
      }

      if (!marca.trim() || !modelo.trim()) {
        toast.error("Informe a marca e o modelo do veículo.");
        return;
      }

      if (!posicaoInstalacao.trim()) {
        toast.error("Informe onde o rastreador foi instalado fisicamente no veículo.");
        return;
      }

      const rawChassi = chassi.trim().toUpperCase();
      const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
      const placaFinal =
        placa.trim().toUpperCase() || (isSemPlaca ? sufixoChassi || "SEM PLACA" : "A DEFINIR");

      setSalvando(true);
      try {
        const idAlvo = instalacaoParaEdicao?.id || clienteId;
        const res = await concluirAtendimentoInstalador(
          {
            instalacaoId: idAlvo,
            imeiConferido: imeiDigitadoLimpo,
            comBloqueador: bloqueadorInstalado,
            posicaoInstalacao: posicaoInstalacao.trim(),
            placa: placaFinal,
            chassi: rawChassi || undefined,
            marca: marca.trim(),
            modelo: modelo.trim(),
            ano: ano ? Number(ano) : undefined,
            cor: cor.trim() || undefined,
            tipoVeiculo,
            kmInstalacao: tipoVeiculo === "maquina" ? 0 : Number(kmInstalacao) || 0,
            horimetroInicial: tipoVeiculo === "maquina" ? Number(horimetroInicial) || 0 : 0,
            observacoes: observacoes.trim() || undefined,
            releChicoteDoEstoque,
          },
          session?.userId,
        );

        if (res.success) {
          if (Object.keys(itensUtilizados).length > 0) {
            try {
              const itensParaSincronizar: ItemBaixaInstalacao[] = Object.entries(
                itensUtilizados,
              ).map(([itemId, qtd]) => ({
                itemId,
                quantidade: Math.max(0, qtd),
                observacao: `Instalação do veículo placa ${placa.trim().toUpperCase()}`,
              }));
              await sincronizarEstoqueInstalacao(idAlvo, itensParaSincronizar, session?.userId);
            } catch (errEst) {
              console.warn("Aviso ao baixar estoque:", errEst);
            }
          }

          toast.success(
            res.message ||
              "Instalação concluída com sucesso! Pendência de repasse financeiro enviada para o operador.",
          );
          onSalvo();
        } else {
          toast.error(res.message);
        }
      } finally {
        setSalvando(false);
      }
      return;
    }

    const isSemPlaca =
      tipoVeiculo === "maquina" ||
      tipoVeiculo === "trator" ||
      tipoVeiculo === "equipamento" ||
      tipoVeiculo === "moto_eletrica" ||
      tipoVeiculo === "outro";

    const exigirDadosVeiculo =
      Boolean(isInstalador) || status === "concluida" || status === "concluida_com_pendencia";

    if (exigirDadosVeiculo && !isSemPlaca && !placa.trim()) {
      toast.error("Informe a placa do veículo.");
      return;
    }

    if (exigirDadosVeiculo && (!marca.trim() || !modelo.trim())) {
      toast.error("Informe a marca e o modelo do veículo.");
      return;
    }

    if ((status === "nao_instalado" || status === "concluida_com_pendencia") && !motivo.trim()) {
      toast.error("Para status com pendência ou não instalado, é obrigatório detalhar o motivo.");
      return;
    }

    const rawChassi = chassi.trim().toUpperCase();
    const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
    const placaFinal =
      placa.trim().toUpperCase() || (isSemPlaca ? sufixoChassi || "SEMPLACA" : "A DEFINIR");
    const marcaFinal = marca.trim() || "Veículo";
    const modeloFinal = modelo.trim() || "Padrão";

    setSalvando(true);

    try {
      const res = await salvarAtendimentoInstalacao({
        instalacaoId: instalacaoParaEdicao?.id,
        clienteId,
        placa: placaFinal,
        chassi: rawChassi || undefined,
        marca: marcaFinal,
        modelo: modeloFinal,
        ano: ano ? Number(ano) : undefined,
        cor: cor.trim() || undefined,
        tipoVeiculo,
        kmInstalacao: tipoVeiculo === "maquina" ? 0 : Number(kmInstalacao) || 0,
        horimetroInicial: tipoVeiculo === "maquina" ? Number(horimetroInicial) || 0 : 0,
        rastreadorImei: rastreadorImei.trim(),
        rastreadorModelo,
        chipIccid: chipIccid.trim() || undefined,
        chipOperadora: chipOperadora.trim() || undefined,
        posicaoInstalacao: posicaoInstalacao.trim() || undefined,
        bloqueadorInstalado,
        releChicoteDoEstoque,
        tipoBloqueador: bloqueadorInstalado ? tipoBloqueador : "sem_bloqueador",
        bloqueadorDetalhes:
          bloqueadorInstalado && tipoBloqueador === "outro"
            ? bloqueadorDetalhes.trim() || undefined
            : undefined,
        status,
        motivo: motivo.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        kitConfirmadoInstalador: kitConfirmado,
        imeiConfirmado: rastreadorImei.trim(),
      });

      if (res.success) {
        // Sincronização inteligente com o estoque (baixas e estornos automáticos ao desmarcar ou alterar)
        const idInstalacaoAlvo = res.instalacao_id || instalacaoParaEdicao?.id;
        if (idInstalacaoAlvo) {
          const itensParaSincronizar: ItemBaixaInstalacao[] = Object.entries(itensUtilizados).map(
            ([itemId, qtd]) => ({
              itemId,
              quantidade: Math.max(0, qtd),
              observacao: `Instalação do veículo placa ${placa.trim().toUpperCase()}`,
            }),
          );

          try {
            const resSinc = await sincronizarEstoqueInstalacao(
              idInstalacaoAlvo,
              itensParaSincronizar,
              session?.userId,
            );
            if (resSinc.success) {
              if ((resSinc.itens_estornados || 0) > 0 && (resSinc.itens_baixados || 0) > 0) {
                toast.success(
                  `Estoque atualizado: ${resSinc.itens_baixados} material(is) baixado(s) e ${resSinc.itens_estornados} devolvido(s) ao estoque.`,
                );
              } else if ((resSinc.itens_estornados || 0) > 0) {
                toast.success(
                  `Estoque atualizado: ${resSinc.itens_estornados} material(is) desmarcado(s) devolvido(s) ao estoque.`,
                );
              } else if ((resSinc.itens_baixados || 0) > 0) {
                toast.success(
                  `Estoque atualizado: ${resSinc.itens_baixados} material(is) baixado(s) do almoxarifado.`,
                );
              }
            }
          } catch (err) {
            console.warn("Aviso ao sincronizar estoque:", err);
          }
        }

        toast.success(res.message);
        onSalvo();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="relative w-full max-w-3xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col rounded-3xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          {/* Header Fixo */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/80 dark:bg-slate-950/80">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  {isRetirada
                    ? "Atendimento Técnico: Retirada de Equipamento"
                    : isEdicao
                      ? "Atualizar / Reabrir Instalação"
                      : "Registrar Nova Instalação Física"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isRetirada
                    ? "Desinstalação física do rastreador e devolução do dispositivo ao estoque da empresa."
                    : "Identificação do veículo, fixação do rastreador J16 e status do atendimento."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onFechar}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {/* Banner de Alternância para Instalação Direta (SuperADM) */}
              {onAbrirInstalacaoDireta &&
                (session?.isSuperAdmin || session?.isAdmin) &&
                !isEdicao && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200 shadow-xs">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>
                        O veículo já está instalado? Ative diretamente no Monitor GPS com isenção de
                        repasse e sem tramitação de instalador técnico.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onFechar();
                        onAbrirInstalacaoDireta();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 transition shadow-xs cursor-pointer"
                    >
                      Instalação Direta
                    </button>
                  </div>
                )}

              {/* 1. Seleção Inteligente do Cliente Previamente Cadastrado */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-sky-500" /> Cliente / Proprietário Previamente
                    Cadastrado *
                  </label>
                  <div className="flex items-center gap-2">
                    {!isEdicao && !clienteSelecionado && podeCriarDemanda && (
                      <button
                        type="button"
                        onClick={irParaCadastroNovoCliente}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-300 border border-orange-500/30 text-[11px] font-bold transition cursor-pointer"
                        title="Ir para a tela de Clientes para cadastrar um novo cliente"
                      >
                        <UserPlus className="h-3 w-3" />
                        <span>Cadastrar Novo Cliente</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                    {clienteSelecionado && !isEdicao && (
                      <button
                        type="button"
                        onClick={() => {
                          setClienteSelecionado(null);
                          setClienteId("");
                          limparDadosNovoVeiculoEquipamento();
                        }}
                        className="text-[11px] text-sky-500 hover:underline font-semibold"
                      >
                        Trocar Cliente
                      </button>
                    )}
                  </div>
                </div>

                {carregandoClientes ? (
                  <div className="text-xs text-slate-400 font-mono py-2">
                    Carregando clientes cadastrados...
                  </div>
                ) : clienteSelecionado ? (
                  <div className="space-y-2">
                    {/* Card do Cliente Selecionado */}
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-orange-500/40 flex items-center justify-between gap-3 shadow-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {clienteSelecionado.nome}
                          </span>
                          {clienteSelecionado.status === "aguardando_instalacao" ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30">
                              <Clock className="h-2.5 w-2.5" />
                              <span>Aguardando Instalação</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-500 border border-orange-500/30">
                              <Check className="h-2.5 w-2.5" />
                              <span>Cliente Ativo</span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {clienteSelecionado.documento && (
                            <span>Doc: {clienteSelecionado.documento}</span>
                          )}
                          {clienteSelecionado.telefone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {clienteSelecionado.telefone}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-orange-500">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    </div>

                    {!isEdicao && dadosPreCarregados ? (
                      <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-sky-800 dark:text-sky-300">
                        <span>
                          Veículo ou equipamento pendente pré-carregado do cadastro do cliente.
                        </span>
                        <button
                          type="button"
                          onClick={limparDadosNovoVeiculoEquipamento}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-sky-500/40 text-sky-700 dark:text-sky-300 font-bold hover:bg-sky-500/15 transition shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Limpar para Cadastrar Outro Veículo</span>
                        </button>
                      </div>
                    ) : !isEdicao && clienteSelecionado.status === "ativo" ? (
                      <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-[11px] text-orange-800 dark:text-orange-300 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
                        <span>
                          Novo veículo para cliente ativo: informe o IMEI, chip M2M e placa do novo
                          veículo abaixo. As instalações já concluídas deste cliente permanecem
                          preservadas.
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  /* Busca e Listagem de Clientes */
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={buscaCliente}
                        onChange={(e) => setBuscaCliente(e.target.value)}
                        placeholder="Buscar cliente por nome parcial, telefone ou CPF/CNPJ..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-orange-500 focus:outline-none"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1 divide-y divide-slate-100 dark:divide-slate-900">
                      {clientesFiltrados.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400 space-y-2">
                          <div>Nenhum cliente encontrado com os dados digitados.</div>
                          {podeCriarDemanda && (
                            <button
                              type="button"
                              onClick={irParaCadastroNovoCliente}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold transition shadow-xs cursor-pointer"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              <span>Ir para Cadastro de Novo Cliente</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        clientesFiltrados.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              limparDadosNovoVeiculoEquipamento();
                              setClienteSelecionado(c);
                              setClienteId(c.id);
                              setBuscaCliente("");
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-orange-500/10 hover:border-orange-500/30 transition flex items-center justify-between gap-2 group"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 group-hover:text-orange-500 truncate">
                                {c.nome}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                                {c.documento && <span>Doc: {c.documento}</span>}
                                {c.telefone && <span>Tel: {c.telefone}</span>}
                              </div>
                            </div>

                            {c.status === "aguardando_instalacao" ? (
                              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30">
                                <Clock className="h-2.5 w-2.5" />
                                <span>Aguardando</span>
                              </span>
                            ) : c.status === "bloqueado" || c.status === "inativo" ? (
                              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-500 border border-rose-500/30">
                                {c.status}
                              </span>
                            ) : (
                              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20">
                                Ativo
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>
                        Selecione o cliente na lista acima ({clientesFiltrados.length} de{" "}
                        {clientes.length} clientes) para vincular o veículo e o rastreador.
                      </span>
                      {podeCriarDemanda && (
                        <button
                          type="button"
                          onClick={irParaCadastroNovoCliente}
                          className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline font-bold shrink-0 cursor-pointer"
                        >
                          <UserPlus className="h-3 w-3" />
                          <span>Ir para Cadastro de Novo Cliente</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Card de Repasse ao Instalador */}
              {isInstalador && (
                <div className="p-4 rounded-3xl bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-slate-900 border border-orange-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                      Extrato do Atendimento · Repasse Previsto
                    </span>
                    <div className="text-xl font-black text-orange-700 dark:text-orange-300 flex items-center gap-2">
                      <span>R$ {valorRepasseCalculado.toFixed(2)}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-800 dark:text-orange-200">
                        {bloqueadorInstalado ? "Com Bloqueador" : "Sem Bloqueador"}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug max-w-sm">
                    O valor ajusta automaticamente conforme sua declaração de montagem do relé. Ao
                    concluir, a pendência financeira é gerada automaticamente para o operador.
                  </div>
                </div>
              )}

              {/* 2. Conferência de Equipamento e IMEI do Rastreador */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-300/70 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <Radio className="h-4 w-4 text-orange-600 dark:text-orange-400" /> Conferência
                    do Rastreador e Conectividade
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 self-start sm:self-auto">
                    CONFERÊNCIA OBRIGATÓRIA
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                        IMEI do Rastreador Físico *
                      </label>
                      <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase">
                        Ler no Aparelho ou Caixa
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        required
                        value={rastreadorImei}
                        onChange={(e) => {
                          const val = e.target.value.trim().toUpperCase();
                          setRastreadorImei(val);
                          if (kitConfirmado && val !== imeiEsperadoKit) {
                            setKitConfirmado(false);
                          }
                        }}
                        placeholder="Ex: 869402051234567"
                        className={`w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border font-mono text-sm font-black focus:outline-none shadow-inner transition ${
                          imeiDivergente
                            ? "border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/30"
                            : imeiConfere && temImeiEsperado
                              ? "border-orange-500 text-orange-700 dark:text-orange-400 bg-orange-50/30"
                              : "border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setScannerImeiAberto(true)}
                        className="px-3 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 text-xs font-bold transition flex items-center gap-1 shrink-0"
                        title="Usar câmera para escanear código de barras do aparelho/caixa"
                      >
                        <ScanLine className="h-4 w-4" />
                        <span>Câmera / Leitor</span>
                      </button>
                    </div>

                    {/* Feedback visual de conferência do IMEI */}
                    {imeiDivergente ? (
                      <div className="mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 animate-pulse">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <div>
                          <strong>
                            Rastreador não confere com o disponibilizado para este veículo!
                          </strong>
                          <div className="text-[11px] text-rose-800 dark:text-rose-300">
                            O IMEI digitado/lido difere do determinado pelo operador (Esperado:{" "}
                            <strong>{imeiEsperadoKit}</strong>). A conclusão permanece bloqueada.
                          </div>
                        </div>
                      </div>
                    ) : imeiConfere && temImeiEsperado ? (
                      <div className="mt-2 p-2 rounded-xl bg-orange-500/15 border border-orange-500/40 text-orange-800 dark:text-orange-300 text-xs flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
                        <span>
                          <strong>Rastreador conferido com sucesso!</strong> O IMEI coincide
                          exatamente com o equipamento determinado pelo operador. Dados do veículo
                          liberados para preenchimento.
                        </span>
                      </div>
                    ) : (
                      temImeiEsperado && (
                        <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-2">
                          <span>
                            Equipamento determinado pelo operador:{" "}
                            <strong>{imeiEsperadoKit}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => conferirKitFisico(rastreadorImei)}
                            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] shrink-0"
                          >
                            Conferir
                          </button>
                        </div>
                      )
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 block mb-0.5 font-medium">
                      Modelo do Rastreador
                    </label>
                    <input
                      type="text"
                      value={rastreadorModelo}
                      onChange={(e) => setRastreadorModelo(e.target.value)}
                      placeholder="J16 4G"
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 block mb-0.5 font-medium">
                      Operadora do Chip SIM
                    </label>
                    <select
                      value={chipOperadora}
                      onChange={(e) => setChipOperadora(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none shadow-inner"
                    >
                      <option value="Vivo">Vivo M2M</option>
                      <option value="Claro">Claro M2M</option>
                      <option value="Tim">Tim M2M</option>
                      <option value="Algar">Algar Telecom</option>
                      <option value="Arqia">Arqia / Datora</option>
                      <option value="Vodafone">Vodafone / Kore</option>
                      <option value="Multi-Operadora">Multi-Operadora (eSIM)</option>
                      <option value="Outra">Outra Operadora</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-700 dark:text-slate-300 block mb-0.5 font-medium">
                      ICCID do Chip M2M
                    </label>
                    <input
                      type="text"
                      value={chipIccid}
                      onChange={(e) => setChipIccid(e.target.value.trim())}
                      placeholder="8955..."
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none shadow-inner"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Dados do Veículo (Bloqueado para o instalador se o IMEI não bater com o esperado) */}
              <div
                className={`p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3 transition-opacity ${
                  isInstalador && !imeiConfere
                    ? "opacity-50 pointer-events-none select-none"
                    : "opacity-100"
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                    <Car className="h-3.5 w-3.5 text-orange-500" /> Dados do Veículo e Local da
                    Instalação
                  </div>
                  {isInstalador && !imeiConfere && (
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      Conferir IMEI acima para liberar
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      Tipo de Veículo *
                    </label>
                    <select
                      value={tipoVeiculo}
                      onChange={(e) => setTipoVeiculo(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="carro">Automóvel / Passeio</option>
                      <option value="moto">Motocicleta</option>
                      <option value="moto_eletrica">🛵 Moto Elétrica / E-Bike</option>
                      <option value="caminhao">Caminhão / Pesado</option>
                      <option value="van">Van / Utilitário</option>
                      <option value="maquina">🚜 Máquina (Agrícola / Industrial)</option>
                      <option value="trator">🚜 Trator</option>
                      <option value="outro">Outro Veículo</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      {tipoVeiculo === "maquina" ||
                      tipoVeiculo === "trator" ||
                      tipoVeiculo === "moto_eletrica" ||
                      tipoVeiculo === "outro"
                        ? "Placa (Opcional p/ máquinas e motos elétricas)"
                        : isInstalador ||
                            status === "concluida" ||
                            status === "concluida_com_pendencia"
                          ? "Placa *"
                          : "Placa (Opcional — Instalador preenche)"}
                    </label>
                    <input
                      type="text"
                      required={
                        (Boolean(isInstalador) ||
                          status === "concluida" ||
                          status === "concluida_com_pendencia") &&
                        tipoVeiculo !== "maquina" &&
                        tipoVeiculo !== "trator" &&
                        tipoVeiculo !== "moto_eletrica" &&
                        tipoVeiculo !== "outro"
                      }
                      value={placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                      placeholder={
                        tipoVeiculo === "maquina" ||
                        tipoVeiculo === "trator" ||
                        tipoVeiculo === "moto_eletrica"
                          ? "Opcional (Chassi/Nº)"
                          : isInstalador ||
                              status === "concluida" ||
                              status === "concluida_com_pendencia"
                            ? "ABC1D23"
                            : "Opcional (A DEFINIR)"
                      }
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono font-black text-xs text-slate-900 dark:text-slate-100 uppercase focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      Chassi{" "}
                      {tipoVeiculo === "moto_eletrica" ||
                      tipoVeiculo === "maquina" ||
                      tipoVeiculo === "trator"
                        ? "(6 dígitos p/ mapa)"
                        : ""}
                    </label>
                    <input
                      type="text"
                      maxLength={25}
                      value={chassi}
                      onChange={(e) => setChassi(e.target.value.toUpperCase())}
                      placeholder="6 últimos dígitos p/ mapa"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono font-black text-xs text-slate-900 dark:text-slate-100 uppercase focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      {isInstalador ||
                      status === "concluida" ||
                      status === "concluida_com_pendencia"
                        ? "Marca *"
                        : "Marca (Opcional)"}
                    </label>
                    <input
                      type="text"
                      required={
                        Boolean(isInstalador) ||
                        status === "concluida" ||
                        status === "concluida_com_pendencia"
                      }
                      value={marca}
                      onChange={(e) => setMarca(e.target.value)}
                      placeholder="Ex: Fiat, Caterpillar, John Deere"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      {isInstalador ||
                      status === "concluida" ||
                      status === "concluida_com_pendencia"
                        ? "Modelo *"
                        : "Modelo (Opcional)"}
                    </label>
                    <input
                      type="text"
                      required={
                        Boolean(isInstalador) ||
                        status === "concluida" ||
                        status === "concluida_com_pendencia"
                      }
                      value={modelo}
                      onChange={(e) => setModelo(e.target.value)}
                      placeholder="Ex: Onix 1.0, Retroescavadeira 310L"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      Ano
                    </label>
                    <input
                      type="number"
                      value={ano || ""}
                      onChange={(e) => setAno(Number(e.target.value))}
                      placeholder="2024"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                      Cor
                    </label>
                    <input
                      type="text"
                      value={cor}
                      onChange={(e) => setCor(e.target.value)}
                      placeholder="Amarelo, Branco, Preto"
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  {/* Odômetro KM ou Horímetro em Horas */}
                  {tipoVeiculo === "maquina" || tipoVeiculo === "trator" ? (
                    <div className="col-span-2 sm:col-span-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-amber-800 dark:text-amber-300">
                          Horímetro Inicial (Horas de Operação) *
                        </label>
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">
                          🚜 Operação por Horas (Sem KM)
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required
                        value={horimetroInicial}
                        onChange={(e) => setHorimetroInicial(Number(e.target.value))}
                        placeholder="Ex: 150.5"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-400 dark:border-amber-600 font-mono font-black text-sm text-amber-900 dark:text-amber-200 focus:outline-none"
                      />
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 block">
                        Máquinas e implementos operam exclusivamente por Horímetro (horas) e não
                        possuem odômetro em KM.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5 font-medium">
                        {isRetirada
                          ? "KM na Retirada (Odômetro) *"
                          : "KM da Instalação (Odômetro) *"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={kmInstalacao}
                        onChange={(e) => setKmInstalacao(Number(e.target.value))}
                        placeholder="Ex: 45200"
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Local de Instalação Física (Onde Instalou) */}
                  <div className="col-span-2 sm:col-span-3">
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                        Local de Instalação Física no Veículo (Onde Instalou) *
                      </label>
                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
                        Obrigatório para o Instalador
                      </span>
                    </div>
                    <input
                      type="text"
                      required={
                        Boolean(isInstalador) ||
                        status === "concluida" ||
                        status === "concluida_com_pendencia"
                      }
                      value={posicaoInstalacao}
                      onChange={(e) => setPosicaoInstalacao(e.target.value)}
                      placeholder="Ex: Atrás do painel de instrumentos, Coluna A lado motorista, Sob o banco traseiro, Chicote da bomba"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Seletor de Bloqueador / Corte de Combustível (Definição do Instalador) */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-300/70 dark:border-slate-800 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <PowerOff className="h-4 w-4 text-amber-500" /> Relé de Bloqueio e Corte de
                    Combustível
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20">
                    DEFINIDO PELO INSTALADOR
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Informe se o veículo foi instalado com o relé atuador de corte de
                  ignição/combustível. Esta escolha atualiza seu repasse financeiro e os kits de
                  insumos aplicados.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setBloqueadorInstalado(true)}
                    className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                      bloqueadorInstalado
                        ? "bg-orange-50 dark:bg-orange-950/30 border-orange-500 text-emerald-900 dark:text-orange-200 ring-2 ring-orange-500/20"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                        bloqueadorInstalado
                          ? "border-orange-600 bg-orange-600 text-white"
                          : "border-slate-400"
                      }`}
                    >
                      {bloqueadorInstalado && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-1">
                        <span>Com Bloqueador Instalado</span>
                        {isInstalador && (
                          <span className="text-[10px] font-black text-orange-600 dark:text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                            R$ {(Number(session?.valor_instalacao_com_bloqueador) || 80).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Relé de corte acoplado ao corte de bomba/ignição. Permite acionamento do
                        Modo Segurança.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBloqueadorInstalado(false)}
                    className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                      !bloqueadorInstalado
                        ? "bg-amber-50 dark:bg-amber-950/30 border-amber-500 text-amber-900 dark:text-amber-200 ring-2 ring-amber-500/20"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                        !bloqueadorInstalado
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-slate-400"
                      }`}
                    >
                      {!bloqueadorInstalado && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center justify-between gap-1">
                        <span>Sem Bloqueador (Apenas Rastreamento)</span>
                        {isInstalador && (
                          <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            R$ {(Number(session?.valor_instalacao_sem_bloqueador) || 50).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Veículo sem relé. Botão de corte/bloqueio permanecerá desabilitado por
                        segurança.
                      </div>
                    </div>
                  </button>
                </div>

                {bloqueadorInstalado && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Origem do Relé e Chicote (Bloqueador) *</span>
                      </label>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {releChicoteDoEstoque
                          ? "Baixará 1 Relé e 1 Chicote do estoque do GD Rastreamento"
                          : "Fornecido pelo instalador (não consome estoque do GD Rastreamento)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleReleChicoteEstoque(false)}
                        className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                          !releChicoteDoEstoque
                            ? "bg-indigo-500/15 border-indigo-500 text-indigo-700 dark:text-indigo-400 font-bold shadow-xs"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Wrench className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>Instalador Fornece (Padrão)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleReleChicoteEstoque(true)}
                        className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                          releChicoteDoEstoque
                            ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400 font-bold shadow-xs"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Do Estoque GD Rastreamento (Fará Baixa)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Materiais e Insumos do Estoque Utilizados ou Devolução na Retirada */}
              {isRetirada ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <RotateCcw className="h-4 w-4 text-amber-500" />
                    <span>Procedimento de Retirada de Equipamento</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                    Esta ordem é de <strong>desinstalação física</strong>. Ao salvar e concluir o
                    atendimento, o rastreador IMEI{" "}
                    <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                      {rastreadorImei || "do veículo"}
                    </span>{" "}
                    e o chip M2M serão desvinculados e transferidos imediatamente para o estoque de
                    dispositivos disponíveis. Nenhum insumo novo é baixado.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Boxes className="h-3.5 w-3.5 text-amber-500" /> Materiais do Estoque
                      Utilizados
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                        {totalItensSelecionados > 0
                          ? `${totalItensSelecionados} itens (${totalUnidadesSelecionadas} un.)`
                          : "Nenhum material selecionado"}
                      </span>
                      <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium hidden sm:inline">
                        Sincronização com estorno automático
                      </span>
                    </div>
                  </div>

                  {/* Controles: Seleção de Kits Cadastrados, Kit Padrão, Zerar e Busca */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                      {/* Seletor de Kits de Instalação Cadastrados no Estoque */}
                      <div className="flex items-center gap-1.5 flex-1">
                        <div className="relative flex-1">
                          <select
                            value={kitSelecionadoId}
                            onChange={(e) => aplicarKitCadastrado(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-orange-500/40 text-xs font-semibold text-orange-800 dark:text-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-500"
                          >
                            <option value="">-- Escolher Kit de Instalação Cadastrado --</option>
                            {kitsDisponiveis.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.nome} ({k.codigo_sku}) - Custo R$ {k.custo_total.toFixed(2)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={aplicarKitPadrao}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] font-bold border border-amber-500/30 transition flex items-center gap-1 shrink-0"
                          title="Preencher com os insumos padrão de rastreador, chip, relé e conector"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Kit Padrão</span>
                        </button>

                        <button
                          type="button"
                          onClick={zerarMateriais}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition shrink-0"
                          title="Zerar todos os insumos selecionados"
                        >
                          Zerar
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={apenasComSaldo}
                            onChange={(e) => setApenasComSaldo(e.target.checked)}
                            className="rounded text-amber-500"
                          />
                          <span>Com saldo</span>
                        </label>
                      </div>
                    </div>

                    {/* Barra de Busca de Materiais */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={buscaMaterial}
                        onChange={(e) => setBuscaMaterial(e.target.value)}
                        placeholder="Pesquisar material por nome, código SKU ou categoria..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Aviso Informativo de Integridade de Estoque */}
                  <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[11px] text-orange-800 dark:text-orange-300 flex items-center justify-between">
                    <span>
                      {isEdicao
                        ? "Materiais utilizados nesta instalação carregados. Caso algum item seja desmarcado ou reduzido, ele voltará automaticamente ao estoque."
                        : "Selecione o kit ou insumos individuais. O abatimento de estoque ocorre de forma sincronizada e transparente."}
                    </span>
                  </div>

                  {carregandoMateriais ? (
                    <div className="text-center py-6 text-xs text-slate-500">
                      Carregando materiais do estoque...
                    </div>
                  ) : materiaisEstoque.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                      Nenhum produto cadastrado no estoque pela administração.
                    </div>
                  ) : materiaisFiltrados.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                      Nenhum material encontrado com o filtro "{buscaMaterial}".
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {materiaisFiltrados.map((mat) => {
                        const qtdSelecionada = itensUtilizados[mat.id] || 0;
                        const qtdOriginal = itensOriginaisInstalacao[mat.id] || 0;
                        const semSaldo = mat.quantidade_atual <= 0 && qtdOriginal === 0;

                        return (
                          <div
                            key={mat.id}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                              qtdSelecionada > 0
                                ? "bg-amber-500/10 border-amber-500/40 text-slate-900 dark:text-slate-100 shadow-xs"
                                : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            <div className="truncate mr-2">
                              <div className="font-bold truncate text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span>{mat.nome}</span>
                                {mat.codigo_sku && (
                                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    {mat.codigo_sku}
                                  </span>
                                )}
                                {qtdOriginal > 0 && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                                    gravado: {qtdOriginal} un.
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] opacity-80 mt-0.5">
                                Saldo no Almoxarifado:{" "}
                                <span
                                  className={`font-mono font-bold ${
                                    semSaldo
                                      ? "text-rose-500"
                                      : "text-orange-600 dark:text-orange-400"
                                  }`}
                                >
                                  {mat.quantidade_atual} {mat.unidade_medida}
                                </span>
                                {mat.custo_medio_unitario > 0 && (
                                  <span className="ml-1 text-slate-400">
                                    (Custo un.: R$ {Number(mat.custo_medio_unitario).toFixed(2)})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setItensUtilizados((prev) => ({
                                    ...prev,
                                    [mat.id]: Math.max(0, (prev[mat.id] || 0) - 1),
                                  }))
                                }
                                disabled={qtdSelecionada <= 0}
                                className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition disabled:opacity-40"
                                title="Diminuir ou desmarcar item (volta ao estoque ao salvar)"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={qtdSelecionada}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value));
                                  setItensUtilizados((prev) => ({
                                    ...prev,
                                    [mat.id]: val,
                                  }));
                                }}
                                className="w-12 text-center py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono font-bold text-xs focus:border-amber-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setItensUtilizados((prev) => ({
                                    ...prev,
                                    [mat.id]: (prev[mat.id] || 0) + 1,
                                  }))
                                }
                                className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                                title="Adicionar ou aumentar quantidade"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Composição Financeira da Instalação (Pacote Fechado) */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Composição do Pacote de Instalação
                      </span>
                      <span className="text-slate-600 dark:text-slate-300">
                        Custo dos Materiais / Kit:{" "}
                        <strong className="font-mono text-amber-600 dark:text-amber-400">
                          R$ {custoTotalMateriaisUtilizados.toFixed(2)}
                        </strong>
                      </span>
                    </div>

                    {valorFechadoInstalacao > 0 && (
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">
                            Valor Fechado Cobrado
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                            R$ {valorFechadoInstalacao.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-right pl-3 border-l border-slate-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-400 block">
                            Mão de Obra Técnica
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              margemBrutaInstalacao >= 0
                                ? "text-orange-600 dark:text-orange-400"
                                : "text-rose-500"
                            }`}
                          >
                            R$ {margemBrutaInstalacao.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. Status da Instalação e Motivo / Pendência */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <CheckCircle2 className="h-3.5 w-3.5 text-orange-500" /> Status do Atendimento
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer text-xs font-bold transition ${
                      status === "concluida"
                        ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300 shadow-xs"
                        : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status_inst"
                      value="concluida"
                      checked={status === "concluida"}
                      onChange={() => setStatus("concluida")}
                      className="text-orange-600"
                    />
                    <span>Concluída com Sucesso</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer text-xs font-bold transition ${
                      status === "concluida_com_pendencia"
                        ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs"
                        : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status_inst"
                      value="concluida_com_pendencia"
                      checked={status === "concluida_com_pendencia"}
                      onChange={() => setStatus("concluida_com_pendencia")}
                      className="text-amber-600"
                    />
                    <span>Concluída com Pendência</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer text-xs font-bold transition ${
                      status === "nao_instalado"
                        ? "bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs"
                        : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="status_inst"
                      value="nao_instalado"
                      checked={status === "nao_instalado"}
                      onChange={() => setStatus("nao_instalado")}
                      className="text-rose-600"
                    />
                    <span>Não Instalado</span>
                  </label>
                </div>

                {/* Motivo Obrigatório se não concluída plena */}
                {(status === "nao_instalado" || status === "concluida_com_pendencia") && (
                  <div className="pt-2 animate-fadeIn">
                    <label className="text-xs font-bold text-rose-600 dark:text-rose-400 block mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Motivo da Pendência ou Não
                      Instalação *
                    </label>
                    <input
                      type="text"
                      required
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex: Cliente ausente no endereço / Falta conector pós-chave / Aguardando troca de chicote"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-rose-300 dark:border-rose-900/80 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Este registro ficará gravado no histórico de atendimentos e poderá ser
                      reaberto para saneamento.
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1 font-medium">
                    Observações Adicionais do Instalador
                  </label>
                  <textarea
                    rows={2}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Observações do teste de bloqueio, leitura de ignição, chicote, etc."
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Rodapé Fixo na Base do Modal com Botões Responsivos */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition min-h-[44px] flex items-center justify-center"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={
                  salvando ||
                  (isInstalador && temImeiEsperado && !imeiConfere) ||
                  (isInstalador && !posicaoInstalacao.trim())
                }
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/20 transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">
                  {salvando
                    ? "Processando..."
                    : isInstalador
                      ? `Concluir Atendimento e Emitir Repasse (R$ ${valorRepasseCalculado.toFixed(2)})`
                      : isRetirada
                        ? "Concluir Retirada e Recolher ao Estoque"
                        : isEdicao
                          ? "Salvar e Gravar Histórico"
                          : "Concluir Instalação"}
                </span>
                <span className="sm:hidden">
                  {salvando
                    ? "Processando..."
                    : isInstalador
                      ? `Concluir (R$ ${valorRepasseCalculado.toFixed(2)})`
                      : isRetirada
                        ? "Concluir Retirada"
                        : isEdicao
                          ? "Salvar Histórico"
                          : "Concluir Instalação"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {scannerImeiAberto && (
        <CameraBarcodeScannerModal
          open={scannerImeiAberto}
          onClose={() => setScannerImeiAberto(false)}
          onScanSucesso={(codigo) => {
            setScannerImeiAberto(false);
            conferirKitFisico(codigo);
          }}
          titulo="Ler Código de Barras do Rastreador (IMEI)"
          subtitulo="Aponte a câmera para o código de barras no aparelho ou na caixa, ou digite o número manualmente."
          valorEsperado={imeiEsperadoKit || undefined}
        />
      )}
    </ModalPortal>
  );
}
