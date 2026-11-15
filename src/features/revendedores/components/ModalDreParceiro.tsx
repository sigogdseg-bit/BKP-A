// ModalDreParceiro.tsx — GD Rastreamento
// Modal canônico de visualização da DRE e agendamento de recebimento via WhatsApp

import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Receipt,
  Copy,
  Clock,
  Smartphone,
  CheckCircle2,
  Send,
  Building,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatarTelefoneVisual } from "@/features/chat/services/whatsappContatosService";
import {
  normalizarTelefoneParaWhatsapp,
  enviarMensagemWhatsappOperador,
} from "@/shared/lib/chatbotxBridge";

export interface DadosDreParceiro {
  // Revendedor
  faturamentoBruto?: number;
  repasseAoMatriz?: number;
  lucroLiquidoRevendedor?: number;
  comissaoVendedores?: number;
  totalTaxasInstalacaoRecebidas?: number;
  totalRepassesInstaladoresPendentes?: number;
  totalContratos?: number;

  // Vendedor
  faturamentoMeusClientes?: number;
  custoBaseFranquia?: number;
  minhaComissaoTotal?: number;
  totalRepasseInstaladorVendedor?: number;
  ganhoLiquidoEstimado?: number;
  totalClientes?: number;
}

export interface ModalDreParceiroProps {
  aberto: boolean;
  onClose: () => void;
  tipo: "revendedor" | "vendedor";
  nomeParceiro: string;
  subtitulo?: string;
  dados: DadosDreParceiro;
  configInicial?: {
    ativo: boolean;
    horario: string;
    telefone: string;
  };
  onSalvarConfig: (config: {
    ativo: boolean;
    horario: string;
    telefone: string;
  }) => Promise<{ sucesso: boolean; erro?: string }>;
}

export function ModalDreParceiro({
  aberto,
  onClose,
  tipo,
  nomeParceiro,
  subtitulo,
  dados,
  configInicial,
  onSalvarConfig,
}: ModalDreParceiroProps) {
  const [ativoWhatsapp, setAtivoWhatsapp] = useState(configInicial?.ativo ?? false);
  const [horarioWhatsapp, setHorarioWhatsapp] = useState(configInicial?.horario || "09:00");
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState(
    configInicial?.telefone ? formatarTelefoneVisual(configInicial.telefone) : "",
  );
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [disparandoAgora, setDisparandoAgora] = useState(false);
  const [copiado, setCopiado] = useState(false);

  if (!aberto || typeof document === "undefined") return null;

  const isRevendedor = tipo === "revendedor";

  // Gera o texto canônico formatado para WhatsApp e cópia
  const gerarTextoDre = () => {
    if (isRevendedor) {
      const faturamento = dados.faturamentoBruto || 0;
      const margemRev = dados.lucroLiquidoRevendedor || 0;
      const taxasDiretas = dados.totalTaxasInstalacaoRecebidas || 0;
      const repasseMatriz = dados.repasseAoMatriz || 0;
      const comissaoVend = dados.comissaoVendedores || 0;
      const repasseInst = dados.totalRepassesInstaladoresPendentes || 0;
      const liquidoEstimado = margemRev + taxasDiretas - repasseInst;
      const contratos = dados.totalContratos || 0;

      return `GD RASTREAMENTO - DEMONSTRATIVO FINANCEIRO DA FRANQUIA
Franquia: ${nomeParceiro}
Faturamento Mensal da Carteira: R$ ${faturamento.toFixed(2)}
Minha Margem Mensal Recorrente: R$ ${margemRev.toFixed(2)}
Taxas de Instalacao Recebidas (Diretas): R$ ${taxasDiretas.toFixed(2)}
Repasse Obrigatorio a Matriz GD Rastreamento: R$ ${repasseMatriz.toFixed(2)}
Comissoes a Repassar aos Vendedores: R$ ${comissaoVend.toFixed(2)}
Mao de Obra a Pagar aos Instaladores: R$ ${repasseInst.toFixed(2)}
--------------------------------------------------
LUCRO LIQUIDO ESTIMADO DA FRANQUIA: R$ ${liquidoEstimado.toFixed(2)}
Total de Contratos na Rede: ${contratos}`;
    }

    const faturamentoMeus = dados.faturamentoMeusClientes || 0;
    const custoBase = dados.custoBaseFranquia || 0;
    const comissaoMinha = dados.minhaComissaoTotal || 0;
    const repasseInstVend = dados.totalRepasseInstaladorVendedor || 0;
    const ganhoLiquido = dados.ganhoLiquidoEstimado || 0;
    const clientesQtd = dados.totalClientes || 0;

    return `GD RASTREAMENTO - DEMONSTRATIVO DO VENDEDOR
Vendedor: ${nomeParceiro}
${subtitulo ? `Franquia: ${subtitulo}\n` : ""}Faturamento Mensal da Minha Carteira: R$ ${faturamentoMeus.toFixed(2)}
Custo Base Repassado a Franquia: R$ ${custoBase.toFixed(2)}
Minha Comissao Mensal Recorrente: R$ ${comissaoMinha.toFixed(2)}
Mao de Obra a Pagar aos Instaladores: R$ ${repasseInstVend.toFixed(2)}
--------------------------------------------------
GANHO LIQUIDO ESTIMADO DO VENDEDOR: R$ ${ganhoLiquido.toFixed(2)}
Total de Clientes Ativos: ${clientesQtd}`;
  };

  const handleCopiarDre = () => {
    const texto = gerarTextoDre();
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    toast.success("DRE copiada com sucesso para a área de transferência!");
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleSalvarConfiguracao = async () => {
    const foneLimpo = normalizarTelefoneParaWhatsapp(telefoneWhatsapp);
    if (ativoWhatsapp && (!foneLimpo || foneLimpo.length < 10)) {
      toast.error("Informe um número de WhatsApp válido com DDD para agendamento.");
      return;
    }

    setSalvandoConfig(true);
    const res = await onSalvarConfig({
      ativo: ativoWhatsapp,
      horario: horarioWhatsapp || "09:00",
      telefone: foneLimpo,
    });
    setSalvandoConfig(false);

    if (res.sucesso) {
      toast.success(
        ativoWhatsapp
          ? `Configuração salva! A DRE será enviada diariamente às ${horarioWhatsapp} no WhatsApp.`
          : "Envio automático de DRE desativado com sucesso.",
      );
    } else {
      toast.error(res.erro || "Falha ao salvar configuração de envio da DRE.");
    }
  };

  const handleDispararAgora = async () => {
    const foneLimpo = normalizarTelefoneParaWhatsapp(telefoneWhatsapp);
    if (!foneLimpo || foneLimpo.length < 10) {
      toast.error("Informe o número de WhatsApp com DDD para envio da DRE.");
      return;
    }

    setDisparandoAgora(true);
    try {
      const texto = gerarTextoDre();
      const res = await enviarMensagemWhatsappOperador({
        clienteNome: nomeParceiro,
        telefone: foneLimpo,
        mensagem: texto,
        operadorNome: "GD Rastreamento DRE",
        tipoContato: "operador",
      });

      if (res.sucesso) {
        toast.success(
          `DRE transmitida com sucesso para o WhatsApp (${formatarTelefoneVisual(foneLimpo)})!`,
        );
      } else {
        toast.error(res.erro || "Falha ao transmitir DRE via WhatsApp Gateway.");
      }
    } catch (err: any) {
      toast.error(`Erro ao disparar DRE: ${err?.message || String(err)}`);
    } finally {
      setDisparandoAgora(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              {isRevendedor ? <Building className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  {isRevendedor ? "DRE da Franquia" : "DRE do Vendedor"}
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  {isRevendedor ? "Demonstrativo da Franquia" : "Demonstrativo Comercial"}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold truncate max-w-xs sm:max-w-md">
                {nomeParceiro} {subtitulo ? `• ${subtitulo}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo com rolagem interna */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
          {/* Card Discriminativo Financeiro */}
          <div className="bg-white/80 dark:bg-slate-950/60 rounded-2xl p-4 border border-slate-300/70 dark:border-slate-800 shadow-xs space-y-3 font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 font-sans">
              <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                Item Contábil
              </span>
              <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                Valor Recorrente
              </span>
            </div>

            {isRevendedor ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Faturamento Mensal da Carteira:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    R$ {(dados.faturamentoBruto || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Minha Margem Mensal Recorrente:
                  </span>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    + R$ {(dados.lucroLiquidoRevendedor || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Taxas de Instalação Recebidas (Diretas):
                  </span>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    + R$ {(dados.totalTaxasInstalacaoRecebidas || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Repasse Obrigatório à Matriz:
                  </span>
                  <span className="font-bold text-slate-600 dark:text-slate-400">
                    R$ {(dados.repasseAoMatriz || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Comissões da Equipe de Vendas:
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    R$ {(dados.comissaoVendedores || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Mão de Obra de Instaladores:
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    - R$ {(dados.totalRepassesInstaladoresPendentes || 0).toFixed(2)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm">
                  <span className="font-black text-slate-900 dark:text-white uppercase font-sans">
                    LUCRO LÍQUIDO ESTIMADO:
                  </span>
                  <span className="font-black text-orange-600 dark:text-orange-400 text-base">
                    R${" "}
                    {(
                      (dados.lucroLiquidoRevendedor || 0) +
                      (dados.totalTaxasInstalacaoRecebidas || 0) -
                      (dados.totalRepassesInstaladoresPendentes || 0)
                    ).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-sans">
                  Total de Contratos Ativos na Rede: {dados.totalContratos || 0}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Faturamento Mensal da Minha Carteira:
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    R$ {(dados.faturamentoMeusClientes || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Custo Base Repassado à Franquia:
                  </span>
                  <span className="font-bold text-slate-600 dark:text-slate-400">
                    R$ {(dados.custoBaseFranquia || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Minha Comissão Mensal Recorrente:
                  </span>
                  <span className="font-bold text-orange-600 dark:text-orange-400">
                    + R$ {(dados.minhaComissaoTotal || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300">
                    Mão de Obra de Instaladores:
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    - R$ {(dados.totalRepasseInstaladorVendedor || 0).toFixed(2)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm">
                  <span className="font-black text-slate-900 dark:text-white uppercase font-sans">
                    GANHO LÍQUIDO ESTIMADO:
                  </span>
                  <span className="font-black text-orange-600 dark:text-orange-400 text-base">
                    R$ {(dados.ganhoLiquidoEstimado || 0).toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-sans">
                  Total de Clientes Ativos: {dados.totalClientes || 0}
                </p>
              </>
            )}
          </div>

          {/* Botão Rápido de Copiar DRE */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCopiarDre}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              {copiado ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-orange-600" />
                  <span className="text-orange-600 font-black">DRE Copiada!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-slate-500" />
                  <span>Copiar Texto da DRE</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDispararAgora}
              disabled={disparandoAgora}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95"
            >
              <Send className="h-4 w-4" />
              <span>{disparandoAgora ? "Enviando..." : "Enviar no meu WhatsApp Agora"}</span>
            </button>
          </div>

          {/* Seção de Configuração do Envio Diário no WhatsApp */}
          <div className="p-4 bg-white/70 dark:bg-slate-950/50 rounded-2xl border border-slate-300/70 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Envio Automático Diário no WhatsApp
                </h4>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={ativoWhatsapp}
                  onChange={(e) => setAtivoWhatsapp(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {ativoWhatsapp
                ? "Ativo: você receberá a DRE consolidada diariamente no horário configurado."
                : "Desativado: marque o interruptor acima se desejar receber a DRE diariamente."}
            </p>

            {ativoWhatsapp && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 animate-in fade-in">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Horário de Recebimento
                  </label>
                  <input
                    type="time"
                    value={horarioWhatsapp}
                    onChange={(e) => setHorarioWhatsapp(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                    Número de Celular / WhatsApp
                  </label>
                  <div className="relative">
                    <Smartphone className="h-4 w-4 absolute left-3 top-2 text-slate-400" />
                    <input
                      type="tel"
                      value={telefoneWhatsapp}
                      onChange={(e) => setTelefoneWhatsapp(e.target.value)}
                      placeholder="(24) 99999-9999"
                      className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={handleSalvarConfiguracao}
                disabled={salvandoConfig}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-md shadow-amber-500/20 cursor-pointer active:scale-95"
              >
                {salvandoConfig ? "Salvando..." : "Salvar Configuração de Horário"}
              </button>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-3 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
