import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Wrench,
  X,
  Camera,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Shield,
  Layers,
  MapPin,
  Car,
  Cpu,
  FileText,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ativarCobrancaPrimeiroVeiculo } from "@/features/clientes/services/clienteService";
import {
  isModoDemonstracaoAtivo,
  simularConclusaoInstalacao,
} from "@/features/demonstracao/services/demonstracaoService";
import type { Instalacao } from "../types";
import { PASSOS_FOTOS_GUIA, type PassoFotoGuia } from "../constants/fotosGuia";
import { ehPlaceholderImei } from "../utils/kitDisponibilizado";
import { sincronizarEstoqueInstalacao } from "@/features/estoque/services/estoqueService";
import type { ItemBaixaInstalacao } from "@/features/estoque/types";

interface ModalFinalizarInstalacaoTecnicaProps {
  aberto: boolean;
  instalacao: Instalacao;
  onFechar: () => void;
  onConcluido: () => void;
}

const PLACEHOLDERS_VEICULO = new Set([
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

function limparPlaceholderVeiculo(valor?: string | null): string {
  if (!valor) return "";
  const limpo = valor.trim();
  if (!limpo) return "";
  return PLACEHOLDERS_VEICULO.has(limpo.toUpperCase()) ? "" : limpo;
}

export function ModalFinalizarInstalacaoTecnica({
  aberto,
  instalacao,
  onFechar,
  onConcluido,
}: ModalFinalizarInstalacaoTecnicaProps) {
  // Dados do Veículo (Preenchimento pelo Instalador)
  const [tipoVeiculo, setTipoVeiculo] = useState<string>(() => {
    const raw = (instalacao.tipo_veiculo || "carro").trim().toLowerCase();
    return raw === "quadriciclo" ? "quadriciculo" : raw;
  });
  const [semPlaca, setSemPlaca] = useState<boolean>(() => {
    const p = (instalacao.placa || "").trim().toUpperCase();
    return p === "SEMPLACA" || p === "SEM PLACA";
  });
  const [placa, setPlaca] = useState<string>(() =>
    limparPlaceholderVeiculo(instalacao.placa).toUpperCase(),
  );
  const [chassi, setChassi] = useState<string>((instalacao as any).chassi || "");
  const [marca, setMarca] = useState<string>(() => limparPlaceholderVeiculo(instalacao.marca));
  const [modelo, setModelo] = useState<string>(() => limparPlaceholderVeiculo(instalacao.modelo));
  const [ano, setAno] = useState<string>(instalacao.ano ? String(instalacao.ano) : "");
  const [cor, setCor] = useState<string>(instalacao.cor || "");

  // Dados do Instalador e Veículo
  const [comBloqueador, setComBloqueador] = useState<boolean>(
    instalacao.com_bloqueador !== false && instalacao.bloqueador_instalado !== false,
  );
  const [kmInstalacao, setKmInstalacao] = useState<number>(instalacao.km_instalacao || 0);
  const [posicaoInstalacao, setPosicaoInstalacao] = useState<string>(
    instalacao.posicao_instalacao || "",
  );
  const [circuitoCortado, setCircuitoCortado] = useState<string>(
    instalacao.bloqueador_detalhes || "",
  );
  const [posicaoRele, setPosicaoRele] = useState<string>("");

  // Valor do Repasse resgatado estritamente do cadastro do instalador (sem valores inventados)
  const obterRepasseDoCadastro = (com: boolean) => {
    if (com) {
      if (
        instalacao.instalador_valor_com_bloqueador !== null &&
        instalacao.instalador_valor_com_bloqueador !== undefined &&
        Number(instalacao.instalador_valor_com_bloqueador) > 0
      ) {
        return Number(instalacao.instalador_valor_com_bloqueador);
      }
      return Number(instalacao.valor_instalacao) || 0;
    } else {
      if (
        instalacao.instalador_valor_sem_bloqueador !== null &&
        instalacao.instalador_valor_sem_bloqueador !== undefined &&
        Number(instalacao.instalador_valor_sem_bloqueador) > 0
      ) {
        return Number(instalacao.instalador_valor_sem_bloqueador);
      }
      return Number(instalacao.valor_instalacao) || 0;
    }
  };

  const [valorRepasse, setValorRepasse] = useState<number>(() => {
    const isCom = instalacao.com_bloqueador !== false && instalacao.bloqueador_instalado !== false;
    return obterRepasseDoCadastro(isCom);
  });

  const alternarBloqueador = (com: boolean) => {
    setComBloqueador(com);
    setValorRepasse(obterRepasseDoCadastro(com));
  };
  const [observacoes, setObservacoes] = useState<string>(instalacao.observacoes || "");

  // Estado das Fotos Capturadas
  const [fotos, setFotos] = useState<{
    placa?: string;
    rastreador?: string;
    local?: string;
    bloqueador?: string;
  }>({
    placa: instalacao.foto_placa_url || instalacao.fotos_instalacao?.placa || undefined,
    rastreador:
      instalacao.foto_rastreador_url || instalacao.fotos_instalacao?.rastreador || undefined,
    local:
      instalacao.foto_local_instalacao_url ||
      instalacao.fotos_instalacao?.local_instalacao ||
      undefined,
    bloqueador:
      instalacao.foto_bloqueador_url || instalacao.fotos_instalacao?.bloqueador || undefined,
  });

  const [passoAtivoIndex, setPassoAtivoIndex] = useState<number>(0);
  const [processandoFoto, setProcessandoFoto] = useState<boolean>(false);
  const [salvando, setSalvando] = useState<boolean>(false);
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!aberto) return null;

  // Passos ativos (se sem bloqueador, dispensa a foto 4)
  const passosFiltrados = PASSOS_FOTOS_GUIA.filter(
    (p) => !p.requerBloqueador || (p.requerBloqueador && comBloqueador),
  );

  const passoAtual = passosFiltrados[passoAtivoIndex] || passosFiltrados[0];

  // Verifica se todas as fotos obrigatórias foram tiradas
  const todasFotosTiradas = passosFiltrados.every((p) => Boolean(fotos[p.id]));

  // Comprime a imagem em canvas no cliente para economizar banda e acelerar upload
  const comprimirImagem = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const maxDim = 1400;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isDemo = isModoDemonstracaoAtivo() || instalacao.id?.startsWith("fantasma-");
    setProcessandoFoto(true);
    try {
      const compressedDataUrl = await comprimirImagem(file);
      const passoId = passoAtual.id;

      let urlFinal = compressedDataUrl;

      // Upload assíncrono para o Storage Supabase apenas no Modo Real (em demonstração é 100% virtual)
      if (!isDemo) {
        try {
          const nomeArquivo = `inst_${instalacao.id}_${passoId}_${Date.now()}.jpg`;
          // Converte base64 para blob
          const res = await fetch(compressedDataUrl);
          const blob = await res.blob();

          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from("instalacoes-fotos")
            .upload(nomeArquivo, blob, { contentType: "image/jpeg", upsert: true });

          if (!uploadErr && uploadData?.path) {
            const { data: pubData } = supabase.storage
              .from("instalacoes-fotos")
              .getPublicUrl(uploadData.path);
            if (pubData?.publicUrl) {
              urlFinal = pubData.publicUrl;
            }
          }
        } catch (errStorage) {
          console.warn("Armazenando foto comprimida em fallback:", errStorage);
        }
      }

      setFotos((prev) => ({
        ...prev,
        [passoId]: urlFinal,
      }));

      toast.success(`Foto ${passoAtual.numero} (${passoAtual.titulo}) capturada com sucesso!`);

      // Se houver próximo passo, avança automaticamente
      if (passoAtivoIndex < passosFiltrados.length - 1) {
        setPassoAtivoIndex((prev) => prev + 1);
      }
    } catch (err: any) {
      toast.error("Falha ao processar a foto. Tente novamente.");
    } finally {
      setProcessandoFoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFinalizarInstalacao = async () => {
    const isTipoSemPlaca = ["maquina", "trator", "equipamento", "moto_eletrica", "outro"].includes(
      tipoVeiculo,
    );

    if (!semPlaca && !isTipoSemPlaca && !placa.trim()) {
      toast.error("Informe a placa do veículo ou marque a opção Sem Placa.");
      return;
    }

    if (!marca.trim() || !modelo.trim()) {
      toast.error("Preencha a marca e o modelo do veículo atendido.");
      return;
    }

    if (!todasFotosTiradas) {
      toast.error("Capture todas as fotos obrigatórias no guia antes de finalizar a instalação.");
      return;
    }

    if (comBloqueador) {
      if (!circuitoCortado.trim()) {
        toast.error("Informe o que o relé está cortando (circuito interrompido).");
        return;
      }
      if (!posicaoRele.trim()) {
        toast.error("Informe onde o relé foi instalado (local de fixação).");
        return;
      }
    }

    const rawChassi = chassi.trim().toUpperCase();
    const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
    const placaFinal = semPlaca
      ? sufixoChassi || "SEMPLACA"
      : placa
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, "") ||
        (isTipoSemPlaca ? sufixoChassi || "SEMPLACA" : "A DEFINIR");
    const marcaFinal = marca.trim();
    const modeloFinal = modelo.trim();
    const anoFinal = ano.trim() ? Number(ano.trim()) : null;
    const corFinal = cor.trim() || null;

    const isDemo = isModoDemonstracaoAtivo() || instalacao.id?.startsWith("fantasma-");

    // ── ISOLAMENTO TOTAL NO MODO DEMONSTRAÇÃO (ZERO ESCRITA NO BANCO REAL) ──
    if (isDemo) {
      setSalvando(true);
      try {
        await simularConclusaoInstalacao({
          ordemId: instalacao.id,
          fotos: Object.values(fotos).filter(Boolean) as string[],
          observacoes:
            observacoes.trim() ||
            "Instalação concluída no modo demonstração com comprovação fotográfica.",
          comBloqueador,
          circuitoCortado: comBloqueador ? circuitoCortado.trim() : undefined,
          posicaoRele: comBloqueador ? posicaoRele.trim() : undefined,
          kmInstalacao: Number(kmInstalacao) || 0,
          posicaoInstalacao: posicaoInstalacao.trim() || undefined,
          valorRepasse,
        });

        toast.success("Instalação técnica concluída com sucesso! (Modo Demonstração)");
        onConcluido();
        onFechar();
      } catch (errDemo: any) {
        console.error("Erro ao simular conclusão no modo demonstração:", errDemo);
        toast.error("Erro ao concluir instalação no simulador.");
      } finally {
        setSalvando(false);
      }
      return;
    }

    setSalvando(true);
    try {
      const detalhesRelFormatado = comBloqueador
        ? `Circuito: ${circuitoCortado.trim()} | Local Relé: ${posicaoRele.trim()}`
        : null;

      // 1. Atualiza a instalação com dados do veículo, fotos, status concluída e repasse calibrado
      const payloadUpdate: Record<string, any> = {
        status: "concluida",
        tipo_veiculo: tipoVeiculo || "carro",
        placa: placaFinal,
        marca: marcaFinal,
        modelo: modeloFinal,
        ano: anoFinal,
        cor: corFinal,
        com_bloqueador: comBloqueador,
        bloqueador_instalado: comBloqueador,
        bloqueador_detalhes: detalhesRelFormatado,
        circuito_cortado: comBloqueador ? circuitoCortado.trim() : null,
        posicao_rele: comBloqueador ? posicaoRele.trim() : null,
        valor_instalacao: valorRepasse,
        km_instalacao: Number(kmInstalacao) || 0,
        posicao_instalacao: posicaoInstalacao.trim() || null,
        observacoes: observacoes.trim() || "Instalação concluída com comprovação fotográfica.",
        concluida_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        foto_placa_url: fotos.placa || null,
        foto_rastreador_url: fotos.rastreador || null,
        foto_local_instalacao_url: fotos.local || null,
        foto_bloqueador_url: comBloqueador ? fotos.bloqueador || null : null,
        fotos_instalacao: {
          placa: fotos.placa,
          rastreador: fotos.rastreador,
          local_instalacao: fotos.local,
          bloqueador: comBloqueador ? fotos.bloqueador : null,
        },
      };

      const { error: errInst } = await supabase
        .from("instalacoes")
        .update(payloadUpdate as any)
        .eq("id", instalacao.id);

      // Defesa em profundidade contra erro de schema cache (PGRST204)
      if (errInst) {
        console.warn("Tentando fallback de conclusão com payload canônico essencial:", errInst);
        const payloadEssencial: Record<string, any> = {
          status: "concluida",
          tipo_veiculo: tipoVeiculo || "carro",
          placa: placaFinal,
          marca: marcaFinal,
          modelo: modeloFinal,
          ano: anoFinal,
          cor: corFinal,
          concluida_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          valor_instalacao: valorRepasse,
          km_instalacao: Number(kmInstalacao) || 0,
          posicao_instalacao: posicaoInstalacao.trim() || null,
          observacoes: observacoes.trim() || "Instalação concluída com comprovação fotográfica.",
        };
        const { error: errFallback } = await supabase
          .from("instalacoes")
          .update(payloadEssencial as any)
          .eq("id", instalacao.id);

        if (errFallback) throw errFallback;
      }

      // 2. Resolução resiliente do veículo (mesmo se veiculo_id não estiver amarrado na ordem)
      let targetVeiculoId = instalacao.veiculo_id || null;
      const placaLimpa = placaFinal
        ? placaFinal
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
        : "";

      if (
        !targetVeiculoId &&
        placaLimpa &&
        placaLimpa !== "ADEFINIR" &&
        placaLimpa !== "SEMPLACA"
      ) {
        const { data: vPlaca } = await supabase
          .from("veiculos")
          .select("id")
          .eq("placa", placaFinal)
          .maybeSingle();
        if (vPlaca?.id) targetVeiculoId = vPlaca.id;
      }

      if (!targetVeiculoId && instalacao.cliente_id) {
        const { data: vCliente } = await supabase
          .from("veiculos")
          .select("id")
          .eq("cliente_id", instalacao.cliente_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (vCliente?.id) targetVeiculoId = vCliente.id;
      }

      if (targetVeiculoId) {
        // Amarra o veículo na própria ordem de instalação se estava desvinculado
        if (!instalacao.veiculo_id) {
          await supabase
            .from("instalacoes")
            .update({ veiculo_id: targetVeiculoId } as any)
            .eq("id", instalacao.id);
        }

        const marcaModeloConcat = `${marcaFinal} ${modeloFinal}`.trim();
        const payloadVeiculo: Record<string, any> = {
          ativo: true,
          placa: placaFinal,
          chassi: rawChassi || null,
          marca_modelo: marcaModeloConcat,
          ano: anoFinal,
          cor: corFinal,
          tipo_veiculo: tipoVeiculo || "carro",
          bloqueador_instalado: comBloqueador,
          bloqueador_detalhes: detalhesRelFormatado,
          circuito_cortado: comBloqueador ? circuitoCortado.trim() : null,
          posicao_rele: comBloqueador ? posicaoRele.trim() : null,
          odometro_km: Number(kmInstalacao) || 0,
          odometro_cinematico_km: Number(kmInstalacao) || 0,
          updated_at: new Date().toISOString(),
        };

        if (instalacao.rastreador_id) payloadVeiculo.rastreador_id = instalacao.rastreador_id;
        if (instalacao.rastreador_imei && !ehPlaceholderImei(instalacao.rastreador_imei)) {
          payloadVeiculo.rastreador_imei = instalacao.rastreador_imei.trim();
        }

        const { error: errVeiculo } = await supabase
          .from("veiculos")
          .update(payloadVeiculo as any)
          .eq("id", targetVeiculoId);

        if (errVeiculo) {
          console.warn("Aviso ao atualizar veículo completo, aplicando fallback base:", errVeiculo);
          await supabase
            .from("veiculos")
            .update({
              ativo: true,
              placa: placaFinal,
              chassi: rawChassi || null,
              marca_modelo: marcaModeloConcat,
              ano: anoFinal,
              cor: corFinal,
              tipo_veiculo: tipoVeiculo || "carro",
              bloqueador_instalado: comBloqueador,
              odometro_km: Number(kmInstalacao) || 0,
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", targetVeiculoId);
        }

        // Ativa o rastreador e vincula ao veículo e cliente
        if (instalacao.rastreador_id) {
          await supabase
            .from("rastreadores")
            .update({
              status: "ativo",
              veiculo_id: targetVeiculoId,
              cliente_id: instalacao.cliente_id || null,
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", instalacao.rastreador_id);
        } else if (instalacao.rastreador_imei && !ehPlaceholderImei(instalacao.rastreador_imei)) {
          await supabase
            .from("rastreadores")
            .update({
              status: "ativo",
              veiculo_id: targetVeiculoId,
              cliente_id: instalacao.cliente_id || null,
              updated_at: new Date().toISOString(),
            } as any)
            .eq("imei", instalacao.rastreador_imei.trim());
        }
      }

      // 3. Atualiza o status do cliente e expurga ordens duplicadas espúrias
      if (instalacao.cliente_id) {
        // Expurga ordens pendentes duplicadas desta mesma placa
        if (placaLimpa && placaLimpa !== "ADEFINIR" && placaLimpa !== "SEMPLACA") {
          await supabase
            .from("instalacoes")
            .delete()
            .eq("cliente_id", instalacao.cliente_id)
            .eq("placa", placaFinal)
            .neq("id", instalacao.id)
            .neq("status", "concluida");
        }

        const { data: pendentes } = await supabase
          .from("instalacoes")
          .select("id")
          .eq("cliente_id", instalacao.cliente_id)
          .neq("status", "concluida");

        if (!pendentes || pendentes.length === 0) {
          await supabase
            .from("clientes")
            .update({
              status: "ativo",
              status_agendamento: "concluido",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", instalacao.cliente_id);
        }

        // Regra Canônica Hunter-Guardian:
        // A partir da data da instalação e ativação no sistema começam a contar os dias para cobrança.
        try {
          await ativarCobrancaPrimeiroVeiculo(
            instalacao.cliente_id,
            new Date().toISOString().split("T")[0],
          );
        } catch (e) {
          console.warn("Aviso ao ativar cobrança do primeiro veículo:", e);
        }
      }

      // 4. Sincronização Canônica com o Estoque (Baixa de Insumos da Instalação Concluída)
      try {
        const { data: itensEstoque } = await supabase
          .from("estoque_itens")
          .select("id, codigo_sku, categoria");

        if (itensEstoque && itensEstoque.length > 0) {
          const itensParaSincronizar: ItemBaixaInstalacao[] = [];
          const placaRef = placaFinal || "VEÍCULO";

          const itemRastreador = itensEstoque.find(
            (i) => i.codigo_sku === "MAT-0001" || i.categoria?.toLowerCase().includes("rastreador"),
          );
          if (itemRastreador) {
            itensParaSincronizar.push({
              itemId: itemRastreador.id,
              quantidade: 1,
              observacao: `Baixa de material por instalação do veículo placa ${placaRef} (Rastreador)`,
            });
          }

          const itemChip = itensEstoque.find(
            (i) => i.codigo_sku === "MAT-0002" || i.categoria?.toLowerCase().includes("chip"),
          );
          if (itemChip) {
            itensParaSincronizar.push({
              itemId: itemChip.id,
              quantidade: 1,
              observacao: `Baixa de material por instalação do veículo placa ${placaRef} (Chip)`,
            });
          }

          // Relé e Chicote/Porta Relé são baixados SOMENTE se o operador definiu que saíram do estoque da Hunter
          if (comBloqueador && Boolean(instalacao.rele_chicote_do_estoque)) {
            const itemRele = itensEstoque.find(
              (i) =>
                i.codigo_sku === "MAT-0003" ||
                i.categoria?.toLowerCase().includes("rele") ||
                i.categoria?.toLowerCase().includes("relé"),
            );
            if (itemRele) {
              itensParaSincronizar.push({
                itemId: itemRele.id,
                quantidade: 1,
                observacao: `Baixa de material por instalação do veículo placa ${placaRef} (Relé de Bloqueio)`,
              });
            }

            const itemPortaRele = itensEstoque.find(
              (i) =>
                i.codigo_sku === "MAT-0004" ||
                i.codigo_sku?.toLowerCase().includes("porta") ||
                i.categoria?.toLowerCase().includes("chicote") ||
                i.categoria?.toLowerCase().includes("fios"),
            );
            if (itemPortaRele) {
              itensParaSincronizar.push({
                itemId: itemPortaRele.id,
                quantidade: 1,
                observacao: `Baixa de material por instalação do veículo placa ${placaRef} (Porta Relé)`,
              });
            }
          }

          if (itensParaSincronizar.length > 0) {
            await sincronizarEstoqueInstalacao(
              instalacao.id,
              itensParaSincronizar,
              instalacao.instalador_id || undefined,
            );
          }
        }
      } catch (errEstoque) {
        console.warn("Aviso ao sincronizar estoque da instalação:", errEstoque);
      }

      toast.success("Instalação técnica concluída com sucesso! Comprovação fotográfica arquivada.");
      onConcluido();
      onFechar();
    } catch (err: any) {
      console.error("Erro ao concluir instalação:", err);
      toast.error(err?.message || "Erro ao salvar a conclusão da instalação.");
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn">
      {/* Input de arquivo invisível para acionar a câmera ou arquivo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSelecionarArquivo}
      />

      {/* Modal Card */}
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* 1. Header do Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  Realizar Instalação Física
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  TÉCNICO
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Veículo:{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {semPlaca ? "SEM PLACA" : placa || "A DEFINIR"}
                </strong>{" "}
                — {marca || "Veículo"} {modelo || ""} ({instalacao.cliente_nome})
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2. Corpo do Modal com Rolagem Interna */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Card de Resumo de Peças Pré-determinadas pelo Operador */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-sky-500" />
                Equipamento Pré-Atribuído pelo Operador
              </span>
              <span className="text-[10px] text-orange-600 dark:text-orange-400 font-mono font-bold bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                Fixado
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Rastreador IMEI</span>
                <span className="font-mono font-black text-slate-900 dark:text-slate-100 truncate block mt-0.5">
                  {instalacao.rastreador_imei || "A CONFERIR"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Modelo do GPS</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                  {instalacao.rastreador_modelo || "J16 4G"}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-400 block">Chip / Operadora</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                  {instalacao.chip_operadora || "M2M"}{" "}
                  {instalacao.chip_iccid ? `(${instalacao.chip_iccid.slice(-6)})` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Card de Dados do Veículo (Preenchimento pelo Instalador) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5 uppercase tracking-wider">
                <Car className="h-4 w-4 text-orange-500" />
                Dados do Veículo (Preenchimento pelo Instalador)
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                Obrigatório
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Tipo de Veículo *
                </label>
                <select
                  value={tipoVeiculo}
                  onChange={(e) => setTipoVeiculo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[40px]"
                >
                  <option value="carro">Automóvel / Passeio</option>
                  <option value="moto">Motocicleta</option>
                  <option value="moto_eletrica">Moto Elétrica / E-Bike</option>
                  <option value="caminhao">Caminhão / Pesado</option>
                  <option value="van">Van / Utilitário</option>
                  <option value="onibus">Ônibus</option>
                  <option value="maquina">Máquina Agrícola / Industrial</option>
                  <option value="trator">Trator</option>
                  <option value="jetski">Jet Ski / Náutico</option>
                  <option value="quadriciculo">Quadriciclo</option>
                  <option value="outro">Outro Veículo</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Placa{" "}
                    {!semPlaca &&
                    !["maquina", "trator", "equipamento", "moto_eletrica", "outro"].includes(
                      tipoVeiculo,
                    )
                      ? "*"
                      : "(Opcional)"}
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={semPlaca}
                      onChange={(e) => setSemPlaca(e.target.checked)}
                      className="rounded border-slate-300 text-orange-600"
                    />
                    <span>Sem Placa</span>
                  </label>
                </div>
                <input
                  type="text"
                  disabled={semPlaca}
                  value={semPlaca ? "" : placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  placeholder={semPlaca ? "SEMPLACA" : "ABC1D23"}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-black text-xs uppercase text-slate-900 dark:text-slate-100 disabled:opacity-50 focus:border-orange-500 focus:outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Chassi (Opcional)
                </label>
                <input
                  type="text"
                  maxLength={25}
                  value={chassi}
                  onChange={(e) => setChassi(e.target.value.toUpperCase())}
                  placeholder="6 últimos dígitos p/ mapa"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono font-bold text-xs uppercase text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Marca *
                </label>
                <input
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Ex: Fiat, Chevrolet, Honda"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Modelo *
                </label>
                <input
                  type="text"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Ex: Onix 1.0, CG 160"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[40px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Ano
                  </label>
                  <input
                    type="number"
                    value={ano}
                    onChange={(e) => setAno(e.target.value)}
                    placeholder="2024"
                    className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Cor
                  </label>
                  <input
                    type="text"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    placeholder="Branco"
                    className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[40px]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dados Técnicos da Instalação */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-500" />
              Parâmetros Técnicos do Atendimento
            </h3>

            {/* Bloqueador Seleção */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Instalação do Bloqueador / Relé de Corte:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => alternarBloqueador(true)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
                    comBloqueador
                      ? "bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 ring-2 ring-orange-500/20"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  Com Bloqueador (Relé)
                </button>
                <button
                  type="button"
                  onClick={() => alternarBloqueador(false)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border ${
                    !comBloqueador
                      ? "bg-slate-200 dark:bg-slate-800 border-slate-400 text-slate-900 dark:text-slate-100 ring-2 ring-slate-400/20"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Sem Bloqueador (Apenas GPS)
                </button>
              </div>
            </div>

            {/* Informações Obrigatórias do Relé (se com bloqueador) */}
            {comBloqueador && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-fadeIn">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                    O que está cortando (Circuito Interrompido) *
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Bomba de combustível",
                      "Motor de partida / arranque",
                      "Pós-chave / ignição",
                    ].map((circ) => (
                      <button
                        key={circ}
                        type="button"
                        onClick={() => setCircuitoCortado(circ)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold transition border ${
                          circuitoCortado === circ
                            ? "bg-amber-500 text-slate-950 border-amber-500 shadow-xs"
                            : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800 hover:border-amber-500/50"
                        }`}
                      >
                        {circ}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    required
                    value={circuitoCortado}
                    onChange={(e) => setCircuitoCortado(e.target.value)}
                    placeholder="Informe o circuito cortado pelo relé (ex: Bomba de combustível)"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none min-h-[44px]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                    Onde instalou o relé (Ponto de fixação do relé) *
                  </label>
                  <input
                    type="text"
                    required
                    value={posicaoRele}
                    onChange={(e) => setPosicaoRele(e.target.value)}
                    placeholder="Informe o ponto exato onde o relé foi fixado/escondido"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* KM do Veículo */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  KM do Hodômetro Atual *
                </label>
                <input
                  type="number"
                  min="0"
                  value={kmInstalacao}
                  onChange={(e) => setKmInstalacao(Number(e.target.value))}
                  placeholder="Ex: 85200"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[44px]"
                />
              </div>

              {/* Local Onde Foi Instalado */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ponto de Instalação do Rastreador *
                </label>
                <input
                  type="text"
                  value={posicaoInstalacao}
                  onChange={(e) => setPosicaoInstalacao(e.target.value)}
                  placeholder="Informe o ponto onde o rastreador foi instalado"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Observações Técnicas do Instalador (Opcional)
              </label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Observações sobre fiação do veículo, estado da bateria, etc."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* 3. GUIA VISUAL DE COMPROVAÇÃO FOTOGRÁFICA */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Camera className="h-4 w-4 text-orange-500" />
                  Guia Fotográfico Obrigatório (
                  {passosFiltrados.filter((p) => Boolean(fotos[p.id])).length}/
                  {passosFiltrados.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fotografe cada item obrigatório para comprovação técnica da instalação.
                </p>
              </div>

              {todasFotosTiradas && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                  <CheckCircle2 className="h-3 w-3" />
                  100% Concluído
                </span>
              )}
            </div>

            {/* Barra de Seleção / Stepper dos 4 Itens */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {passosFiltrados.map((passo, idx) => {
                const jaTirou = Boolean(fotos[passo.id]);
                const isAtivo = idx === passoAtivoIndex;

                return (
                  <button
                    key={passo.id}
                    type="button"
                    onClick={() => setPassoAtivoIndex(idx)}
                    className={`p-2 rounded-xl border text-left transition flex items-center justify-between gap-1.5 min-h-[44px] ${
                      isAtivo
                        ? "bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/30 text-amber-900 dark:text-amber-200"
                        : jaTirou
                          ? "bg-orange-500/10 border-orange-500/30 text-orange-800 dark:text-orange-300"
                          : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          jaTirou
                            ? "bg-orange-500 text-slate-950"
                            : isAtivo
                              ? "bg-amber-500 text-slate-950"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {passo.numero}
                      </span>
                      <span className="text-[11px] font-bold truncate">
                        {passo.titulo.split(" ")[0]}
                      </span>
                    </div>

                    {jaTirou && <CheckCircle2 className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Card Ativo com o Modelo e Área de Captura */}
            <div className="p-4 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                      {passoAtual.numero}
                    </span>
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      {passoAtual.titulo}
                    </h4>
                  </div>
                </div>
              </div>

              {/* Comparativo Visual: Modelo vs Foto Real Capturada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Imagem Modelo de Referência */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Modelo de Referência:
                  </span>
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center group">
                    <img
                      src={passoAtual.imagemModeloUrl}
                      alt={passoAtual.titulo}
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  </div>
                </div>

                {/* 2. Foto Real Tirada pelo Instalador */}
                <div className="space-y-1.5 flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Sua Foto:
                  </span>
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center">
                    {fotos[passoAtual.id] ? (
                      <>
                        <img
                          src={fotos[passoAtual.id]}
                          alt={`Foto ${passoAtual.titulo}`}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setModalPreviewUrl(fotos[passoAtual.id] || null)}
                        />
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setModalPreviewUrl(fotos[passoAtual.id] || null)}
                            className="p-1.5 rounded-lg bg-slate-950/70 text-white hover:bg-slate-950 transition"
                            title="Ampliar Foto"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-slate-950 flex items-center gap-1 shadow-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            OK
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-4 space-y-2">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center">
                          <Camera className="h-6 w-6" />
                        </div>
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                          Nenhuma foto tirada para este item ainda.
                        </p>
                        <span className="text-[10px] text-slate-400 block">
                          Clique no botão fotografar abaixo
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Botão de Ação: Fotografar / Refazer */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={processandoFoto}
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-md min-h-[44px] ${
                        fotos[passoAtual.id]
                          ? "bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                          : "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/20"
                      }`}
                    >
                      <Camera className="h-4 w-4" />
                      <span>
                        {processandoFoto
                          ? "Processando Foto..."
                          : fotos[passoAtual.id]
                            ? `Refazer Foto ${passoAtual.numero}`
                            : `📸 Fotografar Item ${passoAtual.numero}`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Controles de Navegação Anterior / Próximo */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  disabled={passoAtivoIndex === 0}
                  onClick={() => setPassoAtivoIndex((prev) => Math.max(0, prev - 1))}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 disabled:opacity-30 flex items-center gap-1 transition min-h-[40px]"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>

                <button
                  type="button"
                  disabled={passoAtivoIndex === passosFiltrados.length - 1}
                  onClick={() =>
                    setPassoAtivoIndex((prev) => Math.min(passosFiltrados.length - 1, prev + 1))
                  }
                  className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 disabled:opacity-30 flex items-center gap-1 transition min-h-[40px]"
                >
                  Próximo
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Rodapé do Modal com Botão de Finalização */}
        <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Repasse do Técnico:{" "}
            <strong className="text-orange-600 dark:text-orange-400 font-mono text-sm">
              R${" "}
              {Number(valorRepasse || 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="w-1/2 sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={salvando || !todasFotosTiradas}
              onClick={handleFinalizarInstalacao}
              className={`w-1/2 sm:w-auto px-5 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 shadow-lg ${
                todasFotosTiradas
                  ? "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/25"
                  : "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed shadow-none"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{salvando ? "Salvando..." : "Concluir Instalação Física"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Zoom da Foto Capturada */}
      {modalPreviewUrl && (
        <div
          onClick={() => setModalPreviewUrl(null)}
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={modalPreviewUrl}
              alt="Ampliação da foto"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-slate-700"
            />
            <button
              onClick={() => setModalPreviewUrl(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-slate-800 text-white border border-slate-700 hover:bg-slate-700 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
