import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Fuel,
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  FileText,
  Car,
  History,
  PlusCircle,
  Calendar,
  Gauge,
  DollarSign,
  Building2,
  MapPin,
  Download,
  Clock,
  ChevronRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/context/AuthContext";
import {
  registrarAbastecimento,
  listarAbastecimentosCliente,
  listarMeusVeiculos,
  getMeuPerfilMotorista,
  sanitizarNumeroDecimal,
} from "@/features/motoristas/services/motoristasService";
import { extrairDadosNF } from "@/features/financeiro/services/ocrNfService";
import { converterImagemParaPdf } from "@/shared/lib/comprovantePdfHelper";
import { MoedaInput } from "@/shared/components/MoedaInput";
import { downloadNF } from "@/features/motoristas/services/nfStorageService";
import { TiltCard } from "@/shared/components/TiltCard";
import type {
  Abastecimento,
  AbastecimentoForm,
  TipoCombustivel,
  MotoristaVeiculo,
  PerfilMotorista,
} from "@/features/motoristas/types";

const COMBUSTIVEIS: { value: TipoCombustivel; label: string }[] = [
  { value: "gasolina", label: "Gasolina Comum" },
  { value: "gasolina_aditivada", label: "Gasolina Aditivada" },
  { value: "etanol", label: "Etanol" },
  { value: "diesel", label: "Diesel Comum" },
  { value: "diesel_s10", label: "Diesel S10" },
  { value: "gnv", label: "GNV" },
  { value: "eletrico", label: "Recarga Elétrica" },
];

const hoje = new Date().toISOString().split("T")[0];

export function AbastecimentoView() {
  const { session } = useAuth();
  const podeVerHistorico = Boolean(
    session?.isCliente || session?.isAdmin || session?.isSuperAdmin || session?.role === "operador",
  );
  const [abaAtiva, setAbaAtiva] = useState<"novo" | "historico">("novo");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ocrLendo, setOcrLendo] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Perfil e Veículos
  const [perfil, setPerfil] = useState<PerfilMotorista | null>(null);
  const [veiculos, setVeiculos] = useState<MotoristaVeiculo[]>([]);
  const [veiculoSelecionadoId, setVeiculoSelecionadoId] = useState<string>("");
  const [estaNoPosto, setEstaNoPosto] = useState<boolean | null>(null);

  const extrairPrefixoKmSemUltimos3Digitos = (km: number | string | null | undefined): string => {
    if (!km) return "";
    const kmStr = String(Math.round(Number(km)));
    if (kmStr.length <= 3) return "";
    return kmStr.slice(0, -3);
  };

  // Histórico
  const [historico, setHistorico] = useState<Abastecimento[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [baixandoNfId, setBaixandoNfId] = useState<string | null>(null);
  const [filtroCombustivel, setFiltroCombustivel] = useState<string>("todos");

  const historicoFiltrado = React.useMemo(() => {
    if (filtroCombustivel === "todos") return historico;
    if (filtroCombustivel === "gasolina") {
      return historico.filter(
        (h) => h.combustivel === "gasolina" || h.combustivel === "gasolina_aditivada",
      );
    }
    if (filtroCombustivel === "diesel") {
      return historico.filter((h) => h.combustivel === "diesel" || h.combustivel === "diesel_s10");
    }
    return historico.filter((h) => h.combustivel === filtroCombustivel);
  }, [historico, filtroCombustivel]);

  const totaisHistorico = React.useMemo(() => {
    const totalRegistros = historico.length;
    const totalValor = historico.reduce(
      (acc, h) => acc + (parseFloat(String(h.valor_total).replace(",", ".")) || 0),
      0,
    );
    const totalLitros = historico.reduce(
      (acc, h) => acc + (parseFloat(String(h.litros).replace(",", ".")) || 0),
      0,
    );
    const mediaPorLitro = totalLitros > 0 ? totalValor / totalLitros : 0;
    const totalGasolina = historico.filter(
      (h) => h.combustivel === "gasolina" || h.combustivel === "gasolina_aditivada",
    ).length;
    const totalDiesel = historico.filter(
      (h) => h.combustivel === "diesel" || h.combustivel === "diesel_s10",
    ).length;
    const totalEtanol = historico.filter((h) => h.combustivel === "etanol").length;
    return {
      totalRegistros,
      totalValor,
      totalLitros,
      mediaPorLitro,
      totalGasolina,
      totalDiesel,
      totalEtanol,
    };
  }, [historico]);

  const handleBaixarNf = async (path: string, id: string) => {
    setBaixandoNfId(id);
    const toastId = toast.loading("Iniciando download do comprovante...");
    try {
      await downloadNF(path, id, "abastecimento");
      toast.success("Download iniciado com sucesso!", { id: toastId });
    } catch (err: any) {
      console.error("[AbastecimentoView] Erro ao baixar NF:", err);
      toast.error(`Falha ao abrir comprovante: ${err?.message || "Arquivo indisponível"}`, {
        id: toastId,
      });
    } finally {
      setBaixandoNfId(null);
    }
  };

  // Formulário
  const [form, setForm] = useState<AbastecimentoForm>({
    veiculo_id: "",
    data_abastecimento: hoje,
    km_atual: "",
    litros: "",
    valor_total: "",
    valor_por_litro: "",
    combustivel: "gasolina",
    posto_nome: "",
    posto_cidade: "",
    nf_numero: "",
    observacoes: "",
  });

  const [nfFile, setNfFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Carrega perfil e veículos disponíveis para o usuário
  const carregarDadosIniciais = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [p, vs] = await Promise.all([
        getMeuPerfilMotorista().catch(() => null),
        listarMeusVeiculos().catch(() => []),
      ]);
      setPerfil(p);
      setVeiculos(vs);

      if (vs.length > 0) {
        const primeiroId = vs[0].veiculo_id || vs[0].id;
        setVeiculoSelecionadoId(primeiroId);
        setForm((f) => ({
          ...f,
          veiculo_id: primeiroId,
          km_atual: "",
        }));
      }
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível carregar os veículos para abastecimento.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDadosIniciais();
  }, [carregarDadosIniciais]);

  // Carrega histórico quando a aba for ativada
  const carregarHistorico = useCallback(async () => {
    const cid = perfil?.cliente_id || session?.clienteId;
    if (!cid) return;
    setCarregandoHistorico(true);
    try {
      const dados = await listarAbastecimentosCliente(cid, 60);
      setHistorico(dados);
    } catch (err: any) {
      console.error(err);
      toast.error("Não foi possível carregar o histórico de abastecimentos.");
    } finally {
      setCarregandoHistorico(false);
    }
  }, [perfil?.cliente_id, session?.clienteId]);

  useEffect(() => {
    if (abaAtiva === "historico") {
      carregarHistorico();
    }
  }, [abaAtiva, carregarHistorico]);

  // Trata resposta se o usuário está ou não no posto de combustível
  const handleRespostaPosto = (noPosto: boolean) => {
    setEstaNoPosto(noPosto);
    const veic = veiculos.find((v) => (v.veiculo_id || v.id) === veiculoSelecionadoId);
    const kmBase = veic?.odometro_km;

    if (noPosto) {
      if (kmBase && Number(kmBase) > 999) {
        const prefixo = extrairPrefixoKmSemUltimos3Digitos(kmBase);
        setForm((f) => ({ ...f, km_atual: prefixo }));
        toast.info(
          `Prefixo (${prefixo}) preenchido do sistema. Complete com os 3 últimos dígitos do painel!`,
        );
      } else {
        setForm((f) => ({ ...f, km_atual: "" }));
        toast.info("Digite o KM completo exibido no painel do veículo.");
      }
    } else {
      setForm((f) => ({
        ...f,
        km_atual: kmBase ? String(Math.round(Number(kmBase))) : "",
      }));
    }
  };

  // Atualiza odômetro quando o veículo selecionado mudar
  const handleSelecionarVeiculo = (vId: string) => {
    setVeiculoSelecionadoId(vId);
    const veic = veiculos.find((v) => (v.veiculo_id || v.id) === vId);
    const kmBase = veic?.odometro_km;
    setForm((f) => {
      let novoKm = "";
      if (estaNoPosto === true) {
        novoKm = kmBase && Number(kmBase) > 999 ? extrairPrefixoKmSemUltimos3Digitos(kmBase) : "";
      } else if (estaNoPosto === false) {
        novoKm = kmBase ? String(Math.round(Number(kmBase))) : "";
      }
      return {
        ...f,
        veiculo_id: vId,
        km_atual: novoKm,
      };
    });
  };

  const setCampo = (campo: keyof AbastecimentoForm, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  // Cálculo automático de valor por litro
  const handleValorOuLitros = (campo: "valor_total" | "litros", valor: string) => {
    setForm((f) => {
      const novo = { ...f, [campo]: valor };
      const litros = sanitizarNumeroDecimal(campo === "litros" ? valor : f.litros);
      const total = sanitizarNumeroDecimal(campo === "valor_total" ? valor : f.valor_total);
      if (litros && total && litros > 0 && total > 0) {
        novo.valor_por_litro = (total / litros).toFixed(3);
      }
      return novo;
    });
  };

  // Upload e leitura OCR do comprovante
  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }
    e.target.value = "";

    // Converte automaticamente para PDF canônico do comprovante
    let fileFinal = file;
    try {
      fileFinal = await converterImagemParaPdf(file, {
        tipo: "Abastecimento",
        placa: veiculoAtual?.veiculo_placa || "Frota",
        data: form.data_abastecimento,
      });
    } catch (pdfErr) {
      console.warn("Conversão para PDF falhou, mantendo arquivo original:", pdfErr);
    }

    setNfFile(fileFinal);

    // Leitura inteligente de dados da NF via OCR
    setOcrLendo(true);
    const toastId = toast.loading("Lendo nota fiscal com inteligência artificial...");
    try {
      const dados = await extrairDadosNF(file);
      setForm((f) => {
        const novo = { ...f };
        if (dados.data) novo.data_abastecimento = dados.data;
        if (dados.litros && Number(dados.litros) > 0) {
          novo.litros = String(Number(dados.litros).toFixed(2));
        }
        if (dados.valor_total && Number(dados.valor_total) > 0) {
          novo.valor_total = String(Number(dados.valor_total).toFixed(2));
        }
        if (dados.valor_por_litro && Number(dados.valor_por_litro) > 0) {
          novo.valor_por_litro = String(Number(dados.valor_por_litro).toFixed(4));
        } else if (novo.litros && novo.valor_total) {
          const l = parseFloat(novo.litros.replace(",", "."));
          const t = parseFloat(novo.valor_total.replace(",", "."));
          if (l > 0 && t > 0) novo.valor_por_litro = (t / l).toFixed(4);
        }
        if (dados.combustivel && COMBUSTIVEIS.some((c) => c.value === dados.combustivel)) {
          novo.combustivel = dados.combustivel as TipoCombustivel;
        }
        if (dados.posto_nome) novo.posto_nome = dados.posto_nome;
        if (dados.posto_cidade) novo.posto_cidade = dados.posto_cidade;
        if (dados.nf_numero) novo.nf_numero = dados.nf_numero;
        if (dados.forma_pagamento) {
          const tag = `Pagamento: ${dados.forma_pagamento.toUpperCase()}`;
          novo.observacoes = novo.observacoes ? `${novo.observacoes} | ${tag}` : tag;
        }
        return novo;
      });
      toast.success(
        `Nota Fiscal lida com sucesso! Litros: ${dados.litros || "—"} · Total: R$ ${
          dados.valor_total || "—"
        }`,
        { id: toastId },
      );
    } catch {
      toast.info("Comprovante anexado. Preencha os campos para concluir.", { id: toastId });
    } finally {
      setOcrLendo(false);
    }
  };

  const removerArquivo = () => {
    setNfFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const vId = form.veiculo_id || veiculoSelecionadoId;
    if (!vId) {
      setErro("Selecione o veículo a ser abastecido.");
      return;
    }
    const litros = sanitizarNumeroDecimal(form.litros);
    const valorTotal = sanitizarNumeroDecimal(form.valor_total);

    if (!litros || litros <= 0) {
      setErro("Informe a quantidade de litros abastecida.");
      return;
    }
    if (!valorTotal || valorTotal <= 0) {
      setErro("Informe o valor total do abastecimento.");
      return;
    }

    const cid = perfil?.cliente_id || session?.clienteId;
    if (!cid) {
      setErro("Identificador do cliente não encontrado. Recarregue a página.");
      return;
    }

    setSalvando(true);
    try {
      const motId = perfil?.id || (session?.isMotorista ? session.userId : undefined);
      await registrarAbastecimento(
        cid,
        motId,
        {
          ...form,
          veiculo_id: vId,
        },
        nfFile || undefined,
      );

      // Atualiza o odômetro do veículo no estado local se informado
      if (form.km_atual && Number(form.km_atual) > 0) {
        setVeiculos((lista) =>
          lista.map((v) =>
            (v.veiculo_id || v.id) === vId ? { ...v, odometro_km: Number(form.km_atual) } : v,
          ),
        );
      }

      setSucesso(true);
      toast.success("Abastecimento registrado com sucesso!");
    } catch (err: any) {
      console.error(err);
      setErro(err?.message || "Erro ao salvar abastecimento. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  const veiculoAtual = veiculos.find((v) => (v.veiculo_id || v.id) === veiculoSelecionadoId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto select-none pb-12">
      {/* Banner Superior Canônico Neumorphism Suave */}
      <div className="relative overflow-hidden rounded-3xl bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 sm:p-6 md:p-8 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl transition-all duration-300">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-semibold mb-1">
              <Fuel className="h-3.5 w-3.5" />
              <span>Módulo Canônico de Gestão de Combustível</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Abastecimento de Veículos
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl">
              {podeVerHistorico
                ? "Registro com leitura inteligente de comprovantes, controle de odômetro e histórico unificado para motoristas e clientes."
                : "Registro com leitura inteligente de comprovantes, foto da nota fiscal e controle de odômetro do veículo."}
            </p>
          </div>

          {/* Alternador de Abas (Exclusivo para Gestores e Clientes Titulares - Motorista NÃO acessa histórico de NFs) */}
          {podeVerHistorico && (
            <div className="inline-flex p-1 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 self-start sm:self-auto shrink-0 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)]">
              <button
                type="button"
                onClick={() => setAbaAtiva("novo")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  abaAtiva === "novo"
                    ? "bg-[#eaf0f8] dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-800"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <PlusCircle className="h-4 w-4" />
                <span>Registrar</span>
              </button>
              <button
                type="button"
                onClick={() => setAbaAtiva("historico")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  abaAtiva === "historico"
                    ? "bg-[#eaf0f8] dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none border border-slate-300/40 dark:border-slate-800"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <History className="h-4 w-4" />
                <span>Histórico</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500 mb-3" />
          <p className="text-sm font-medium">Carregando dados da frota...</p>
        </div>
      ) : veiculos.length === 0 ? (
        <div className="rounded-3xl p-8 sm:p-12 text-center bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Car className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Nenhum veículo vinculado
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Não encontramos veículos ativos atribuídos à sua conta para lançamento de combustível.
              Entre em contato com o gestor da frota.
            </p>
          </div>
        </div>
      ) : !podeVerHistorico || abaAtiva === "novo" ? (
        // ── FORMULÁRIO DE ABASTECIMENTO ──
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Seleção de Veículo e Resumo */}
          <div className="space-y-4">
            <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-300/40 dark:border-slate-800 pb-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Veículo Selecionado
                </span>
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                  {veiculos.length} {veiculos.length === 1 ? "veículo" : "veículos"}
                </span>
              </div>

              {veiculos.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950/60 border border-slate-300/50 dark:border-slate-800 text-center space-y-1.5 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none">
                  <Car className="h-6 w-6 text-slate-400 dark:text-slate-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nenhum veículo cadastrado
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Cadastre um veículo para lançar abastecimentos.
                  </p>
                </div>
              ) : veiculos.length === 1 ? (
                <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-950/60 border border-slate-300/50 dark:border-slate-800 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                    <Car className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-black text-slate-900 dark:text-slate-100 font-mono">
                      {veiculos[0].veiculo_placa}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {veiculos[0].veiculo_modelo || "Veículo de Frota"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {veiculos.map((v) => {
                    const vId = v.veiculo_id || v.id;
                    const ativo = vId === veiculoSelecionadoId;
                    return (
                      <button
                        key={vId}
                        type="button"
                        onClick={() => handleSelecionarVeiculo(vId)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition cursor-pointer ${
                          ativo
                            ? "bg-orange-500/10 border-orange-500/40 text-orange-700 dark:text-orange-400 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none"
                            : "bg-[#eaf0f8] dark:bg-slate-950/60 border-slate-300/50 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Car
                            className={`h-4 w-4 shrink-0 ${
                              ativo
                                ? "text-orange-600 dark:text-orange-400"
                                : "text-slate-400 dark:text-slate-500"
                            }`}
                          />
                          <div className="truncate">
                            <div className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                              {v.veiculo_placa}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {v.veiculo_modelo || "Veículo de Frota"}
                            </div>
                          </div>
                        </div>
                        {ativo && (
                          <CheckCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Informações adicionais do veículo selecionado */}
              {veiculoAtual && (
                <div className="pt-2 border-t border-slate-300/40 dark:border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Odômetro Registrado:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-200">
                      {veiculoAtual.odometro_km
                        ? `${Math.round(Number(veiculoAtual.odometro_km)).toLocaleString("pt-BR")} KM`
                        : "Não informado"}
                    </span>
                  </div>
                  {perfil?.cliente_nome && (
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Titular da Frota:</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-200 truncate max-w-[150px]">
                        {perfil.cliente_nome}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Caixa de Dica de IA */}
            <div className="p-4 rounded-2xl bg-[#eaf0f8] dark:bg-slate-900/60 border border-orange-500/30 text-xs text-slate-600 dark:text-slate-400 space-y-2 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
              <div className="flex items-center gap-2 font-bold text-orange-700 dark:text-orange-400">
                <Sparkles className="h-4 w-4" />
                <span>Leitura Inteligente por IA</span>
              </div>
              <p className="leading-relaxed">
                Envie uma foto do cupom fiscal ou nota fiscal de abastecimento. Nossa IA extrai o
                valor total, litros abastecidos, preço por litro, posto e número da nota
                automaticamente.
              </p>
            </div>
          </div>

          {/* Coluna 2 e 3: Formulário de Lançamento */}
          <div className="lg:col-span-2">
            {sucesso ? (
              <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center space-y-5 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl">
                <div className="w-16 h-16 mx-auto rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none">
                  <CheckCircle className="h-9 w-9" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">
                    Abastecimento Registrado com Sucesso!
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {nfFile
                      ? "O comprovante foi convertido em PDF oficial e disponibilizado para conferência e auditoria."
                      : "Os dados de combustível foram lançados e o odômetro do veículo atualizado."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSucesso(false);
                      setForm((f) => ({
                        ...f,
                        litros: "",
                        valor_total: "",
                        valor_por_litro: "",
                        nf_numero: "",
                        observacoes: "",
                      }));
                      removerArquivo();
                    }}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs bg-orange-600 hover:bg-orange-500 text-white shadow-[2px_2px_5px_#c3cfe2] active:shadow-[inset_2px_2px_4px_#c2410c] transition cursor-pointer"
                  >
                    Registrar Outro Abastecimento
                  </button>
                  {podeVerHistorico && (
                    <button
                      type="button"
                      onClick={() => setAbaAtiva("historico")}
                      className="px-5 py-2.5 rounded-xl font-bold text-xs bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition cursor-pointer"
                    >
                      Ver Histórico
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-6"
              >
                {erro && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2 shadow-[inset_1px_1px_3px_#c8d4e4]">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{erro}</span>
                  </div>
                )}

                {/* Upload e Foto da NF / Comprovante */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Comprovante / Nota Fiscal</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Foto ou PDF da Bomba / Cupom
                    </span>
                  </label>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleArquivo}
                  />

                  {nfFile ? (
                    <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8] dark:bg-slate-950/60 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-none">
                      {preview ? (
                        <img
                          src={preview}
                          alt="Preview NF"
                          className="h-14 w-14 rounded-xl object-cover border border-slate-300 dark:border-slate-700 shrink-0 shadow-[2px_2px_5px_#c3cfe2]"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-rose-500 shrink-0 shadow-[2px_2px_5px_#c3cfe2]">
                          <FileText className="h-6 w-6" />
                          <span className="text-[8px] font-black uppercase mt-0.5">PDF</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {nfFile.name}
                        </div>
                        {ocrLendo ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold animate-pulse mt-0.5">
                            <Sparkles className="h-3.5 w-3.5 animate-spin" />
                            <span>Extraindo dados com IA...</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {(nfFile.size / 1024).toFixed(1)} KB · Pronto para envio
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={removerArquivo}
                        disabled={ocrLendo}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Remover arquivo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={ocrLendo}
                      className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-orange-500/60 dark:hover:border-orange-500/60 bg-[#eaf0f8] dark:bg-slate-950/40 hover:bg-orange-500/5 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] transition cursor-pointer text-slate-600 dark:text-slate-400"
                    >
                      <div className="p-3 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Clique para anexar a foto ou PDF da nota fiscal
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Formatos aceitos: JPG, PNG, PDF (preenchimento automático inteligente)
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Pergunta de Verificação no Posto de Combustível */}
                <div className="p-4 rounded-2xl border border-slate-300/50 dark:border-slate-800 bg-[#eaf0f8] dark:bg-slate-900/80 shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 shrink-0 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                        <Fuel className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          Você está no posto de combustível agora?
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Se sim, preenchemos os primeiros dígitos do odômetro para você apenas
                          completar os 3 últimos do painel.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleRespostaPosto(true)}
                        className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] sm:min-h-0 ${
                          estaNoPosto === true
                            ? "bg-orange-600 text-white shadow-[2px_2px_5px_#c3cfe2]"
                            : "bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                        }`}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Sim, estou no posto</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRespostaPosto(false)}
                        className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] sm:min-h-0 ${
                          estaNoPosto === false
                            ? "bg-slate-700 text-white shadow-[2px_2px_5px_#c3cfe2]"
                            : "bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4]"
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>Não, lançamento posterior</span>
                      </button>
                    </div>
                  </div>

                  {estaNoPosto === true && (
                    <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center gap-2 text-xs text-orange-700 dark:text-orange-300 font-medium animate-in fade-in duration-150">
                      <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
                      <span>
                        Modo de calibração ativo: complete o campo <strong>KM do Odômetro</strong>{" "}
                        com os 3 dígitos finais que aparecem no painel do carro para atualizar o
                        odômetro real do veículo!
                      </span>
                    </div>
                  )}
                </div>

                {/* Linha 1: Data + Odômetro */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>Data do Abastecimento</span>
                    </label>
                    <input
                      type="date"
                      value={form.data_abastecimento}
                      onChange={(e) => setCampo("data_abastecimento", e.target.value)}
                      required
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 text-slate-400" />
                        <span>KM do Odômetro</span>
                      </label>
                      {estaNoPosto === true && (
                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                          Complete os 3 dígitos
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      placeholder={
                        estaNoPosto === true ? "Digite os 3 dígitos finais" : "Ex: 85400"
                      }
                      value={form.km_atual}
                      onChange={(e) => setCampo("km_atual", e.target.value)}
                      className={`w-full h-11 px-3.5 rounded-xl border text-xs font-mono font-medium outline-none transition shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] ${
                        estaNoPosto === true
                          ? "border-orange-500 bg-orange-50/20 dark:bg-orange-950/20 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500"
                          : "border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-orange-500"
                      }`}
                    />
                    {estaNoPosto === true && (
                      <p className="text-[10px] text-orange-600 dark:text-orange-400">
                        * Prefixo preenchido pelo sistema. Digite os 3 últimos dígitos para
                        registrar o KM exato do painel.
                      </p>
                    )}
                  </div>
                </div>

                {/* Linha 2: Tipo de Combustível */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Fuel className="h-3.5 w-3.5 text-slate-400" />
                    <span>Tipo de Combustível</span>
                  </label>
                  <select
                    value={form.combustivel}
                    onChange={(e) => setCampo("combustivel", e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition cursor-pointer"
                  >
                    {COMBUSTIVEIS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Linha 3: Litros, Valor Total e Preço por Litro */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Litros Abastecidos
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 45.50"
                      value={form.litros}
                      onChange={(e) => handleValorOuLitros("litros", e.target.value)}
                      required
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono font-medium focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Valor Total (R$)
                    </label>
                    <MoedaInput
                      value={Number(form.valor_total) || 0}
                      onChange={(v) => handleValorOuLitros("valor_total", String(v))}
                      placeholder="R$ 0,00"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono font-bold focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Preço / Litro (R$)
                    </label>
                    <input
                      type="text"
                      readOnly
                      placeholder="Calculado"
                      value={form.valor_por_litro ? `R$ ${form.valor_por_litro}` : ""}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300/40 dark:border-slate-800 bg-slate-200/50 dark:bg-slate-900/70 text-slate-600 dark:text-slate-400 text-xs font-mono font-semibold outline-none cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Linha 4: Posto e Número da NF */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>Nome do Posto / Razão</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Posto Ipiranga Shell BR"
                      value={form.posto_nome}
                      onChange={(e) => setCampo("posto_nome", e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      <span>Nº da Nota / Cupom</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 0045821"
                      value={form.nf_numero}
                      onChange={(e) => setCampo("nf_numero", e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono font-medium focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition"
                    />
                  </div>
                </div>

                {/* Observações */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Observações Operacionais (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Informações adicionais sobre o trajeto, rota ou abastecimento..."
                    value={form.observacoes}
                    onChange={(e) => setCampo("observacoes", e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-slate-300/60 dark:border-slate-700 bg-[#eaf0f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-orange-500 shadow-[inset_2px_2px_4px_#c8d4e4,inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.6)] outline-none transition resize-none"
                  />
                </div>

                {/* Botão de Envio */}
                <button
                  type="submit"
                  disabled={salvando || ocrLendo}
                  className="w-full h-12 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm shadow-[3px_3px_8px_#b8c6da] hover:shadow-[4px_4px_12px_#a6b8d0] active:shadow-[inset_2px_2px_4px_#c2410c] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {salvando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Salvando Abastecimento...</span>
                    </>
                  ) : (
                    <>
                      <Fuel className="h-4 w-4" />
                      <span>Salvar e Registrar Abastecimento</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        // ── HISTÓRICO DE ABASTECIMENTOS ──
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-[5px_5px_14px_#c3cfe2] dark:shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-300/40 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Histórico Consolidado de Abastecimentos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoria de notas fiscais, volume abastecido e consumo por veículo.
              </p>
            </div>
            <button
              type="button"
              onClick={carregarHistorico}
              disabled={carregandoHistorico}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#eaf0f8] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              {carregandoHistorico ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Filter className="h-3.5 w-3.5" />
              )}
              <span>Atualizar</span>
            </button>
          </div>

          {/* Métricas Infográficas com Filtro Bidirecional por Combustível */}
          {historico.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TiltCard
                spotlightColor="rgba(16, 185, 129, 0.2)"
                onClick={() => setFiltroCombustivel("todos")}
                className={`p-3.5 sm:p-4 rounded-2xl cursor-pointer text-left transition-all ${
                  filtroCombustivel === "todos"
                    ? "ring-2 ring-orange-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
                    : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Total Faturado
                  </span>
                  <Fuel className="h-4 w-4 text-orange-500" />
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-orange-600 dark:text-orange-400 mt-1">
                  {totaisHistorico.totalValor.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                  {totaisHistorico.totalRegistros} abastecimentos ·{" "}
                  {totaisHistorico.totalLitros.toFixed(1)} L
                </span>
              </TiltCard>

              <TiltCard
                spotlightColor="rgba(56, 189, 248, 0.2)"
                onClick={() =>
                  setFiltroCombustivel((prev) => (prev === "gasolina" ? "todos" : "gasolina"))
                }
                className={`p-3.5 sm:p-4 rounded-2xl cursor-pointer text-left transition-all ${
                  filtroCombustivel === "gasolina"
                    ? "ring-2 ring-sky-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
                    : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Gasolina
                  </span>
                  <span className="text-[10px] font-bold uppercase text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded">
                    Filtro
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-sky-600 dark:text-sky-400 mt-1">
                  {totaisHistorico.totalGasolina}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                  Lançamentos de gasolina
                </span>
              </TiltCard>

              <TiltCard
                spotlightColor="rgba(245, 158, 11, 0.2)"
                onClick={() =>
                  setFiltroCombustivel((prev) => (prev === "diesel" ? "todos" : "diesel"))
                }
                className={`p-3.5 sm:p-4 rounded-2xl cursor-pointer text-left transition-all ${
                  filtroCombustivel === "diesel"
                    ? "ring-2 ring-amber-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
                    : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Diesel (S10)
                  </span>
                  <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    Filtro
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
                  {totaisHistorico.totalDiesel}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                  Lançamentos de diesel
                </span>
              </TiltCard>

              <TiltCard
                spotlightColor="rgba(168, 85, 247, 0.2)"
                onClick={() =>
                  setFiltroCombustivel((prev) => (prev === "etanol" ? "todos" : "etanol"))
                }
                className={`p-3.5 sm:p-4 rounded-2xl cursor-pointer text-left transition-all ${
                  filtroCombustivel === "etanol"
                    ? "ring-2 ring-purple-500 bg-[#dfe9f5] dark:bg-slate-800/90 shadow-[4px_4px_12px_#b8c7db]"
                    : "bg-[#eaf0f8] dark:bg-slate-900/80 border border-slate-300/50 dark:border-slate-800/80 shadow-[3px_3px_8px_#c3cfe2]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                    Etanol
                  </span>
                  <span className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                    Filtro
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mt-1">
                  {totaisHistorico.totalEtanol}
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mt-0.5">
                  Lançamentos de etanol
                </span>
              </TiltCard>
            </div>
          )}

          {filtroCombustivel !== "todos" && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Filtrando por combustível:{" "}
                <strong className="capitalize text-orange-600 dark:text-orange-400">
                  {filtroCombustivel === "gasolina"
                    ? "Gasolina (Comum e Aditivada)"
                    : filtroCombustivel === "diesel"
                      ? "Diesel (Comum e S10)"
                      : filtroCombustivel}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setFiltroCombustivel("todos")}
                className="text-xs text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 underline font-semibold cursor-pointer"
              >
                Limpar filtro (Ver todos)
              </button>
            </div>
          )}

          {carregandoHistorico ? (
            <div className="py-16 text-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto mb-2" />
              <p className="text-xs">Consultando abastecimentos no banco de dados...</p>
            </div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-500">
              <Fuel className="h-10 w-10 mx-auto opacity-40 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {historico.length === 0
                  ? "Nenhum abastecimento registrado até o momento."
                  : "Nenhum abastecimento encontrado para este filtro de combustível."}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {historico.length === 0
                  ? "Utilize a aba 'Registrar' para efetuar o primeiro lançamento com nota fiscal e odômetro."
                  : "Clique em 'Limpar filtro' para visualizar os demais abastecimentos cadastrados."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {historicoFiltrado.map((item) => (
                <TiltCard
                  key={item.id}
                  spotlightColor={
                    item.combustivel === "gasolina" || item.combustivel === "gasolina_aditivada"
                      ? "rgba(56, 189, 248, 0.16)"
                      : item.combustivel === "diesel" || item.combustivel === "diesel_s10"
                        ? "rgba(245, 158, 11, 0.16)"
                        : "rgba(16, 185, 129, 0.16)"
                  }
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#eaf0f8] dark:bg-slate-900/60 border border-slate-300/40 dark:border-slate-800/80 p-4 rounded-2xl shadow-[2px_2px_6px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_9px_#b8c6da] transition"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none">
                      <Fuel className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-[#eaf0f8] dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300/50 dark:border-slate-700 shadow-[1px_1px_3px_#c3cfe2] dark:shadow-none">
                          {item.veiculo_placa || "Sem Placa"}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 capitalize">
                          {item.combustivel?.replace("_", " ")}
                        </span>
                        {item.nf_numero && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            NF: {item.nf_numero}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>{item.posto_nome || "Posto não identificado"}</span>
                        <span>·</span>
                        <span>{new Date(item.data_abastecimento).toLocaleDateString("pt-BR")}</span>
                        {item.motorista_nome && (
                          <>
                            <span>·</span>
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {item.motorista_nome}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-5">
                    <div className="text-right">
                      <div className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">
                        {Number(item.valor_total).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {item.litros} L {item.km_atual ? `· ${item.km_atual} KM` : ""}
                      </div>
                    </div>

                    {item.nf_foto_url ? (
                      <button
                        type="button"
                        onClick={() => handleBaixarNf(item.nf_foto_url!, item.id)}
                        disabled={baixandoNfId === item.id}
                        className="p-2.5 rounded-xl bg-[#eaf0f8] hover:bg-slate-200/60 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300/60 dark:border-slate-700 shadow-[2px_2px_5px_#c3cfe2] dark:shadow-none hover:shadow-[3px_3px_8px_#b8c6da] active:shadow-[inset_2px_2px_4px_#c8d4e4] transition shrink-0 cursor-pointer disabled:opacity-50"
                        title="Baixar Comprovante / PDF"
                      >
                        {baixandoNfId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <span
                        className="p-2.5 rounded-xl opacity-30 text-slate-400 cursor-not-allowed"
                        title="Sem comprovante anexado"
                      >
                        <FileText className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </TiltCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
