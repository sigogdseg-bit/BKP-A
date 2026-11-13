import { useState, useEffect, useMemo } from "react";
import {
  X,
  ArrowRightLeft,
  ArrowDownLeft,
  Car,
  User,
  Wrench,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  FileText,
  Boxes,
  Package,
} from "lucide-react";
import { ModalPortal } from "@/shared/components/ModalPortal";
import { supabase } from "@/integrations/supabase/client";
import {
  solicitarRetiradaRastreador,
  solicitarRemanejamentoRastreador,
} from "../services/instalacaoService";
import { toast } from "sonner";

interface VeiculoItem {
  id: string;
  placa: string;
  marca_modelo: string;
  ano?: number | null;
  cor?: string | null;
  odometro_km?: number | null;
  rastreador_id?: string | null;
  rastreador_imei?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string;
  cliente_documento?: string;
}

interface ClienteItem {
  id: string;
  nome: string;
  documento?: string;
  telefone?: string;
}

interface InstaladorItem {
  id: string;
  nome: string;
  valor_por_instalacao?: number | null;
}

interface ModalSolicitarRemanejamentoProps {
  aberto: boolean;
  onFechar?: () => void;
  onClose?: () => void;
  onSucesso?: () => void;
  veiculoInicialId?: string;
}

export function ModalSolicitarRemanejamento({
  aberto,
  onFechar,
  onClose,
  onSucesso,
  veiculoInicialId,
}: ModalSolicitarRemanejamentoProps) {
  const handleFechar = () => {
    if (onFechar) onFechar();
    if (onClose) onClose();
  };

  const [modalidade, setModalidade] = useState<"retirada" | "remanejamento">("remanejamento");
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Listagens
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState<VeiculoItem[]>([]);
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteItem[]>([]);
  const [instaladores, setInstaladores] = useState<InstaladorItem[]>([]);

  // Formulário: Origem
  const [veiculoOrigemId, setVeiculoOrigemId] = useState<string>(veiculoInicialId || "");
  const [buscaOrigem, setBuscaOrigem] = useState("");

  // Formulário: Se "Apenas Retirada"
  const [motivoRetirada, setMotivoRetirada] = useState("Cancelamento do plano");
  const [valorRetirada, setValorRetirada] = useState<number>(0);

  // Formulário: Se "Remanejamento"
  const [destinoMesmoCliente, setDestinoMesmoCliente] = useState(true);
  const [clienteDestinoId, setClienteDestinoId] = useState("");
  const [novaPlaca, setNovaPlaca] = useState("");
  const [novaMarca, setNovaMarca] = useState("");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoAno, setNovoAno] = useState<number>(new Date().getFullYear());
  const [novaCor, setNovaCor] = useState("");
  const [valorInstalacao, setValorInstalacao] = useState<number>(350);

  // Formulário: Técnico e Observações
  const [instaladorId, setInstaladorId] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Componentes do Kit instalados no veículo de origem
  const [itensKitInstalados, setItensKitInstalados] = useState<
    { item_id: string; nome: string; codigo_sku: string; quantidade: number }[]
  >([]);
  const [carregandoItensKit, setCarregandoItensKit] = useState(false);

  useEffect(() => {
    if (!veiculoOrigemId) {
      setItensKitInstalados([]);
      return;
    }

    let ativo = true;
    async function carregarItens() {
      setCarregandoItensKit(true);
      try {
        const { data, error } = await supabase.rpc("obter_itens_instalados_veiculo", {
          p_veiculo_id: veiculoOrigemId,
        });
        if (ativo && !error && Array.isArray(data)) {
          setItensKitInstalados(data);
        }
      } catch (e) {
        console.warn("Aviso ao consultar componentes do veículo:", e);
      } finally {
        if (ativo) setCarregandoItensKit(false);
      }
    }

    carregarItens();
    return () => {
      ativo = false;
    };
  }, [veiculoOrigemId]);

  // Carga inicial dos dados
  useEffect(() => {
    if (!aberto) return;

    let ativo = true;
    async function carregarTudo() {
      setCarregandoDados(true);
      try {
        // 1. Veículos com rastreador vinculado
        const { data: vData } = await supabase
          .from("veiculos")
          .select(
            `
            id,
            placa,
            marca_modelo,
            ano,
            cor,
            odometro_km,
            rastreador_id,
            rastreador_imei,
            cliente_id,
            clientes (
              nome_razao_social,
              documento
            )
          `,
          )
          .or("rastreador_id.not.is.null,rastreador_imei.not.is.null")
          .order("placa");

        // 2. Clientes para destino
        const { data: cData } = await supabase
          .from("clientes")
          .select("id, nome_razao_social, documento, telefone")
          .order("nome_razao_social");

        // 3. Instaladores credenciados
        const { data: iData } = await supabase
          .from("profiles")
          .select("id, nome, valor_por_instalacao")
          .eq("role", "instalador")
          .eq("ativo", true)
          .order("nome");

        if (ativo) {
          const vFormatados: VeiculoItem[] = (vData || []).map((v: any) => ({
            id: v.id,
            placa: v.placa,
            marca_modelo: v.marca_modelo,
            ano: v.ano,
            cor: v.cor,
            odometro_km: v.odometro_km,
            rastreador_id: v.rastreador_id,
            rastreador_imei: v.rastreador_imei,
            cliente_id: v.cliente_id,
            cliente_nome: v.clientes?.nome_razao_social || "Sem cliente",
            cliente_documento: v.clientes?.documento,
          }));
          setVeiculosDisponiveis(vFormatados);

          const cFormatados: ClienteItem[] = (cData || []).map((c: any) => ({
            id: c.id,
            nome: c.nome_razao_social,
            documento: c.documento,
            telefone: c.telefone,
          }));
          setClientesDisponiveis(cFormatados);

          const iFormatados: InstaladorItem[] = (iData || []).map((i: any) => ({
            id: i.id,
            nome: i.nome,
            valor_por_instalacao: i.valor_por_instalacao,
          }));
          setInstaladores(iFormatados);

          if (iFormatados.length > 0) {
            setInstaladorId((prev) => {
              if (prev) return prev;
              if (iFormatados[0].valor_por_instalacao) {
                setValorInstalacao(Number(iFormatados[0].valor_por_instalacao));
              }
              return iFormatados[0].id;
            });
          }

          if (veiculoInicialId) {
            setVeiculoOrigemId(veiculoInicialId);
          } else if (vFormatados.length > 0) {
            setVeiculoOrigemId((prev) => prev || vFormatados[0].id);
          }
        }
      } catch (err) {
        console.error("Falha ao carregar dados para remanejamento:", err);
      } finally {
        if (ativo) setCarregandoDados(false);
      }
    }

    carregarTudo();

    return () => {
      ativo = false;
    };
  }, [aberto, veiculoInicialId]);

  // Veículo de origem selecionado
  const veiculoOrigemSelecionado = useMemo(() => {
    return veiculosDisponiveis.find((v) => v.id === veiculoOrigemId) || null;
  }, [veiculosDisponiveis, veiculoOrigemId]);

  // Ao alterar o instalador, mantém o valor informado pelo operador
  const handleSelecionarInstalador = (id: string) => {
    setInstaladorId(id);
    const inst = instaladores.find((i) => i.id === id);
    // Apenas sugere taxa de instalação se estiver no modo remanejamento e o campo ainda não tiver sido preenchido
    if (
      modalidade === "remanejamento" &&
      (!valorInstalacao || valorInstalacao === 0) &&
      inst?.valor_por_instalacao
    ) {
      setValorInstalacao(Number(inst.valor_por_instalacao));
    }
  };

  const veiculosFiltrados = useMemo(() => {
    if (!buscaOrigem.trim()) return veiculosDisponiveis;
    const b = buscaOrigem.toLowerCase();
    return veiculosDisponiveis.filter(
      (v) =>
        v.placa.toLowerCase().includes(b) ||
        v.marca_modelo.toLowerCase().includes(b) ||
        (v.cliente_nome && v.cliente_nome.toLowerCase().includes(b)),
    );
  }, [veiculosDisponiveis, buscaOrigem]);

  if (!aberto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!veiculoOrigemId) {
      toast.error("Por favor, selecione o veículo de origem com o rastreador.");
      return;
    }

    if (!instaladorId) {
      toast.error("Por favor, selecione o instalador responsável.");
      return;
    }

    setSalvando(true);
    try {
      if (modalidade === "retirada") {
        const res = await solicitarRetiradaRastreador({
          veiculoId: veiculoOrigemId,
          instaladorId,
          valorRetirada: Number(valorRetirada) || 0,
          motivo: motivoRetirada,
          observacoes,
        });

        if (res.success) {
          toast.success(res.message);
          onSucesso?.();
          handleFechar();
        } else {
          toast.error(res.message);
        }
      } else {
        // Remanejamento Completo
        const placaFormatada = novaPlaca.trim().toUpperCase();
        if (!placaFormatada) {
          toast.error("Informe a placa do novo veículo.");
          setSalvando(false);
          return;
        }

        if (!novaMarca.trim() || !novoModelo.trim()) {
          toast.error("Informe a marca e o modelo do novo veículo.");
          setSalvando(false);
          return;
        }

        const clienteDestinoFinal = destinoMesmoCliente
          ? veiculoOrigemSelecionado?.cliente_id
          : clienteDestinoId;

        const res = await solicitarRemanejamentoRastreador({
          veiculoOrigemId,
          clienteDestinoId: clienteDestinoFinal || undefined,
          novoVeiculoPlaca: placaFormatada,
          novoVeiculoMarca: novaMarca.trim(),
          novoVeiculoModelo: novoModelo.trim(),
          novoVeiculoAno: novoAno || undefined,
          novoVeiculoCor: novaCor.trim() || undefined,
          instaladorId,
          valorRetirada: Number(valorRetirada) || 0,
          valorInstalacao: Number(valorInstalacao) || 0,
          observacoes,
        });

        if (res.success) {
          toast.success(res.message);
          onSucesso?.();
          handleFechar();
        } else {
          toast.error(res.message);
        }
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-in fade-in duration-150">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 transition-colors">
          {/* Cabeçalho */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Troca de Dispositivo e Ordens Técnicas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Emissão de ordens de serviço para retirada ou remanejamento de rastreadores
                </p>
              </div>
            </div>
            <button
              onClick={handleFechar}
              disabled={salvando}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Abas de Modalidade */}
          <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalidade("remanejamento")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                modalidade === "remanejamento"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>Remanejar para Novo Veículo (2 Chamadas)</span>
            </button>

            <button
              type="button"
              onClick={() => setModalidade("retirada")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                modalidade === "retirada"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-600/20"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>Somente Retirada (Cancelamento / Inadimplência)</span>
            </button>
          </div>

          {/* Corpo do Formulário com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
              {carregandoDados ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Carregando veículos e instaladores credenciados...
                </div>
              ) : (
                <>
                  {/* 1. SEÇÃO DE ORIGEM: VEÍCULO ATUAL */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Car className="h-3.5 w-3.5 text-indigo-500" />
                        <span>Veículo Atual com Rastreador (Origem da Retirada) *</span>
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {veiculosDisponiveis.length} veículos com rastreador
                      </span>
                    </div>

                    <select
                      value={veiculoOrigemId}
                      onChange={(e) => setVeiculoOrigemId(e.target.value)}
                      required
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Selecione o veículo...</option>
                      {veiculosDisponiveis.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.placa} — {v.marca_modelo} ({v.cliente_nome}) — IMEI:{" "}
                          {v.rastreador_imei || "A conferir"}
                        </option>
                      ))}
                    </select>

                    {veiculoOrigemSelecionado && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span className="font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
                              {veiculoOrigemSelecionado.placa}
                            </span>
                            <span>{veiculoOrigemSelecionado.marca_modelo}</span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                            Proprietário: {veiculoOrigemSelecionado.cliente_nome} • Rastreador IMEI:{" "}
                            <span className="font-mono">
                              {veiculoOrigemSelecionado.rastreador_imei || "A conferir"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. SEÇÃO DE DESTINO OU CANCELAMENTO */}
                  {modalidade === "retirada" ? (
                    /* Modo: Apenas Retirada */
                    <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-4 w-4" />
                        <span>Detalhes da Desinstalação e Coleta de Equipamento</span>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                          Motivo da Retirada *
                        </label>
                        <select
                          value={motivoRetirada}
                          onChange={(e) => setMotivoRetirada(e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                        >
                          <option value="Cancelamento do plano">
                            Cancelamento do plano a pedido do cliente
                          </option>
                          <option value="Inadimplência financeira">
                            Recolhimento por Inadimplência financeira
                          </option>
                          <option value="Devolução amigável">
                            Devolução amigável de equipamento em comodato
                          </option>
                          <option value="Troca por modelo superior">
                            Troca ou substituição de tecnologia
                          </option>
                          <option value="Venda do veículo sem rastreador">
                            Venda do veículo desprovido de rastreador
                          </option>
                          <option value="Outro motivo">Outro motivo operacional</option>
                        </select>
                      </div>

                      {/* Componentes do Kit Vinculados ao Veículo */}
                      <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Boxes className="h-4 w-4 text-amber-500" />
                            Itens e Componentes do Kit Instalados no Veículo:
                          </span>
                          {carregandoItensKit && (
                            <span className="text-[10px] text-slate-400">Verificando...</span>
                          )}
                        </div>

                        {itensKitInstalados.length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap gap-1.5">
                              {itensKitInstalados.map((it) => (
                                <span
                                  key={it.item_id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                                >
                                  <Package className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                  <span>{it.nome}</span>
                                  <span className="font-mono font-bold bg-amber-500/20 px-1 rounded">
                                    x{it.quantidade}
                                  </span>
                                </span>
                              ))}
                            </div>
                            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                              ✓ Todos os itens do kit acima retornarão automaticamente com estorno
                              ao estoque disponível na conclusão da desinstalação.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Rastreador padrão instalado (apenas o rastreador físico retornará ao
                            estoque). Se houver kit adicional desmontado, o instalador poderá
                            registrá-lo no encerramento.
                          </p>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        ℹ️ Ao concluir a retirada, o veículo será inativado no mapa, o rastreador
                        físico e todos os insumos do kit retornarão ao{" "}
                        <strong>Estoque Disponível</strong>. O histórico do cliente será
                        integralmente preservado.
                      </div>
                    </div>
                  ) : (
                    /* Modo: Remanejamento Completo */
                    <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                          <Car className="h-4 w-4" />
                          <span>Dados do Novo Veículo de Destino (Instalação)</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={destinoMesmoCliente}
                              onChange={(e) => setDestinoMesmoCliente(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-300">
                              Mesmo cliente proprietário
                            </span>
                          </label>
                        </div>
                      </div>

                      {!destinoMesmoCliente && (
                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                            Novo Cliente Titular *
                          </label>
                          <select
                            value={clienteDestinoId}
                            onChange={(e) => setClienteDestinoId(e.target.value)}
                            required={!destinoMesmoCliente}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Selecione o novo cliente...</option>
                            {clientesDisponiveis.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome} {c.documento ? `(${c.documento})` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                            Placa do Novo Carro *
                          </label>
                          <input
                            type="text"
                            value={novaPlaca}
                            onChange={(e) => setNovaPlaca(e.target.value.toUpperCase())}
                            placeholder="ABC1D23"
                            maxLength={8}
                            required
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 uppercase"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                            Marca *
                          </label>
                          <input
                            type="text"
                            value={novaMarca}
                            onChange={(e) => setNovaMarca(e.target.value)}
                            placeholder="Ex: Fiat, Toyota"
                            required
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                            Modelo *
                          </label>
                          <input
                            type="text"
                            value={novoModelo}
                            onChange={(e) => setNovoModelo(e.target.value)}
                            placeholder="Ex: Strada, Corolla"
                            required
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                            Ano Fabricação
                          </label>
                          <input
                            type="number"
                            value={novoAno}
                            onChange={(e) => setNovoAno(Number(e.target.value))}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">
                            Cor
                          </label>
                          <input
                            type="text"
                            value={novaCor}
                            onChange={(e) => setNovaCor(e.target.value)}
                            placeholder="Ex: Prata, Preto"
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <div className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          O novo veículo iniciará com telemetria, rotas e odômetro 100% zerados e
                          segregados.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 3. SEÇÃO DE VALORES DE MÃO DE OBRA E REPASSE AO INSTALADOR */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        <span>Valores de Mão de Obra e Repasse Técnico</span>
                      </label>
                      <span className="text-[11px] text-slate-400">
                        Permitido zerar ou alterar conforme acordo
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Valor da Retirada */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Taxa de Retirada (R$)
                          </label>
                          <button
                            type="button"
                            onClick={() => setValorRetirada(0)}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                          >
                            Zerar (R$ 0,00)
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={valorRetirada}
                          onChange={(e) => setValorRetirada(Math.max(0, Number(e.target.value)))}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      {/* Valor da Instalação (se remanejamento) */}
                      {modalidade === "remanejamento" && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                              Taxa de Nova Instalação (R$)
                            </label>
                            <button
                              type="button"
                              onClick={() => setValorInstalacao(0)}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                            >
                              Zerar (R$ 0,00)
                            </button>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={valorInstalacao}
                            onChange={(e) =>
                              setValorInstalacao(Math.max(0, Number(e.target.value)))
                            }
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. SEÇÃO DO INSTALADOR RESPONSÁVEL */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Instalador Credenciado Encarregado *</span>
                    </label>
                    <select
                      value={instaladorId}
                      onChange={(e) => handleSelecionarInstalador(e.target.value)}
                      required
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Selecione o técnico instalador...</option>
                      {instaladores.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome} (Ref. contratual: R${" "}
                          {Number(i.valor_por_instalacao || 50).toFixed(2)})
                        </option>
                      ))}
                    </select>

                    {/* Confirmação Visual em Tempo Real do Valor Efetivo que Será Lançado */}
                    {modalidade === "retirada" ? (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-150">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                            <DollarSign className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                              Valor efetivo a ser lançado nesta Ordem de Retirada:
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              O valor informado no campo acima prevalece sobre a referência
                              contratual do técnico.
                            </span>
                          </div>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <span
                            className={`font-mono text-sm font-black ${
                              Number(valorRetirada) === 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            R$ {Number(valorRetirada || 0).toFixed(2)}
                          </span>
                          {Number(valorRetirada) === 0 && (
                            <span className="block text-[9px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400">
                              (Isento / Sem Custo)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 space-y-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between border-b border-indigo-500/20 pb-1.5">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-indigo-500" />
                            <span>Resumo dos Valores que Serão Lançados nas 2 Ordens:</span>
                          </span>
                          <span className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                            Total: R${" "}
                            {(Number(valorRetirada || 0) + Number(valorInstalacao || 0)).toFixed(2)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">
                              1. Ordem de Retirada:
                            </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              R$ {Number(valorRetirada || 0).toFixed(2)}{" "}
                              {Number(valorRetirada) === 0 ? "(Isento)" : ""}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">
                              2. Ordem de Instalação:
                            </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              R$ {Number(valorInstalacao || 0).toFixed(2)}{" "}
                              {Number(valorInstalacao) === 0 ? "(Isento)" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. OBSERVAÇÕES OPERACIONAIS */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <span>Observações e Orientações Técnicas</span>
                    </label>
                    <textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      rows={2}
                      placeholder="Instruções para o técnico, pontos de atenção ou motivo específico..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 resize-none"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Rodapé Fixo de Ação */}
            <div className="p-3.5 sm:p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleFechar}
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || carregandoDados || !veiculoOrigemId}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
              >
                {salvando ? (
                  <span>Emitindo Ordens...</span>
                ) : modalidade === "retirada" ? (
                  <span>Emitir Ordem de Retirada</span>
                ) : (
                  <span>Emitir Remanejamento (2 Ordens)</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
