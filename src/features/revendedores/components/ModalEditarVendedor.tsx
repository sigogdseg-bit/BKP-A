import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Edit2,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { MoedaInput } from "@/shared/components/MoedaInput";
import {
  atualizarVendedor,
  redefinirSenhaParceiro,
  excluirVendedor,
} from "../services/revendedoresService";
import type { Vendedor } from "../types";

interface ModalEditarVendedorProps {
  vendedor: Vendedor | null;
  aberto: boolean;
  onFechar: () => void;
  onSucesso: () => void;
  valorBaseMinimo?: number;
}

export function ModalEditarVendedor({
  vendedor,
  aberto,
  onFechar,
  onSucesso,
  valorBaseMinimo = 0,
}: ModalEditarVendedorProps) {
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valorBaseVendedor, setValorBaseVendedor] = useState<number>(40);
  const [chavePix, setChavePix] = useState("");
  const [ativo, setAtivo] = useState(true);

  // Estados da Redefinição de Senha
  const [novaSenha, setNovaSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [redefinindoSenha, setRedefinindoSenha] = useState(false);
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindoVendedor, setExcluindoVendedor] = useState(false);

  useEffect(() => {
    if (vendedor) {
      setNome(vendedor.nome || "");
      setDocumento(vendedor.documento || "");
      setEmail(vendedor.email || "");
      setTelefone(vendedor.telefone || "");
      setValorBaseVendedor(Number(vendedor.valor_base_vendedor) || 40);
      setChavePix(vendedor.chave_pix || "");
      setAtivo(Boolean(vendedor.ativo));
      setNovaSenha("");
      setMostrarSenha(false);
      setConfirmandoExclusao(false);
    }
  }, [vendedor, aberto]);

  if (!aberto || !vendedor || typeof document === "undefined") {
    return null;
  }

  const gerarSenhaAleatoria = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let randomStr = "";
    for (let i = 0; i < 6; i++) {
      randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const senhaGerada = `Sigo@${randomStr}`;
    setNovaSenha(senhaGerada);
    setMostrarSenha(true);
  };

  const handleRedefinirSenha = async () => {
    if (!vendedor.id) return;
    if (!novaSenha || novaSenha.trim().length < 6) {
      toast.error("A nova senha provisória deve conter no mínimo 6 caracteres.");
      return;
    }

    setRedefinindoSenha(true);
    try {
      const res = await redefinirSenhaParceiro("vendedor", vendedor.id, novaSenha.trim());
      if (res.sucesso) {
        toast.success(
          "Senha do vendedor redefinida com sucesso! Ele será obrigado a alterá-la no primeiro acesso.",
        );
        setNovaSenha("");
      } else {
        toast.error(res.erro || "Falha ao redefinir senha do vendedor.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao redefinir senha.");
    } finally {
      setRedefinindoSenha(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendedor.id) return;
    if (!nome.trim()) {
      toast.error("O nome do vendedor é obrigatório.");
      return;
    }

    if (valorBaseMinimo > 0 && valorBaseVendedor < valorBaseMinimo) {
      toast.error(
        `A cota base do vendedor (R$ ${valorBaseVendedor.toFixed(2)}) não pode ser inferior à cota base da franquia (R$ ${valorBaseMinimo.toFixed(2)}).`,
      );
      return;
    }

    setSalvandoDados(true);
    try {
      const res = await atualizarVendedor(vendedor.id, {
        nome: nome.trim(),
        documento: documento.trim() || undefined,
        email: email.trim() || undefined,
        telefone: telefone.trim() || undefined,
        valorBaseVendedor,
        chavePix: chavePix.trim() || undefined,
        ativo,
      });

      if (res.sucesso) {
        toast.success("Dados do vendedor atualizados com sucesso!");
        onSucesso();
        onFechar();
      } else {
        toast.error(res.erro || "Falha ao atualizar dados do vendedor.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao salvar alterações.");
    } finally {
      setSalvandoDados(false);
    }
  };

  const handleExcluirVendedorConfirmado = async () => {
    if (!vendedor.id) return;
    setExcluindoVendedor(true);
    try {
      const res = await excluirVendedor(vendedor.id);
      if (res.sucesso) {
        toast.success(res.message || `Vendedor '${vendedor.nome}' excluído com sucesso.`);
        onSucesso();
        onFechar();
      } else {
        toast.error(res.erro || "Falha ao excluir vendedor.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao excluir vendedor.");
    } finally {
      setExcluindoVendedor(false);
      setConfirmandoExclusao(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] my-auto flex flex-col shadow-[8px_8px_24px_#b8c6da] dark:shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 border-b border-slate-300/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Edit2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Editar Vendedor da Equipe
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Atualize dados cadastrais, comissões ou redefina a senha de acesso.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corpo com Rolagem Interna */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300 mb-1">
              Nome Completo do Vendedor *
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do vendedor"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-[inset_1px_1px_3px_#c8d4e4] dark:shadow-none font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                CPF / CNPJ
              </label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(24) 99999-9999"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              E-mail de Acesso
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendedor@empresa.com.br"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>

          <div className="p-3 bg-blue-500/10 dark:bg-blue-950/20 rounded-2xl border border-blue-500/30 space-y-1.5">
            <label className="block text-[11px] font-bold uppercase text-blue-800 dark:text-blue-300">
              Cota Base do Vendedor (R$) *
            </label>
            <MoedaInput
              value={valorBaseVendedor}
              onChange={setValorBaseVendedor}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-blue-500/40 text-slate-900 dark:text-slate-100 font-mono font-black text-sm"
            />
            <p className="text-[10.5px] text-slate-600 dark:text-slate-400">
              Valor mínimo da mensalidade que remunera a franquia. Toda quantia vendida acima desta
              cota é comissão líquida direta do vendedor.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Chave PIX
              </label>
              <input
                type="text"
                value={chavePix}
                onChange={(e) => setChavePix(e.target.value)}
                placeholder="pix@vendedor.com"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Status Operacional
              </label>
              <select
                value={ativo ? "ativo" : "inativo"}
                onChange={(e) => setAtivo(e.target.value === "ativo")}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-bold"
              >
                <option value="ativo">Ativo (Operacional)</option>
                <option value="inativo">Inativo (Bloqueado)</option>
              </select>
            </div>
          </div>

          {/* SEÇÃO CANÔNICA: Redefinição de Senha e Troca Obrigatória no Primeiro Acesso */}
          <div className="pt-2 border-t border-slate-300/60 dark:border-slate-800">
            <div className="p-3 bg-amber-500/10 dark:bg-amber-950/20 rounded-2xl border border-amber-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold text-[11px] uppercase">
                  <Key className="h-4 w-4" />
                  <span>Redefinir Senha de Acesso</span>
                </div>
                <button
                  type="button"
                  onClick={gerarSenhaAleatoria}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[10px] font-bold transition cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Gerar Senha</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Digite a nova senha provisória"
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-500/40 text-slate-900 dark:text-slate-100 font-mono text-xs shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-start gap-1.5 p-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-[10px] text-amber-900 dark:text-amber-200 leading-tight">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Aviso:</strong> No primeiro acesso com esta senha, o sistema obrigará o
                  vendedor a criar sua própria senha definitiva antes de acessar o painel.
                </span>
              </div>

              <button
                type="button"
                disabled={redefinindoSenha || !novaSenha || novaSenha.trim().length < 6}
                onClick={handleRedefinirSenha}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-md shadow-amber-600/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {redefinindoSenha ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Redefinindo Senha...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Confirmar Redefinição de Senha</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Confirmação de Exclusão de Segurança */}
          {confirmandoExclusao && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Confirmar Exclusão Definitiva</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Tem certeza que deseja excluir o vendedor <strong>{vendedor.nome}</strong>? Os
                clientes vinculados permanecerão na carteira geral e o acesso do vendedor será
                revogado.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={excluindoVendedor}
                  onClick={handleExcluirVendedorConfirmado}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm active:scale-95 cursor-pointer flex items-center gap-1"
                >
                  {excluindoVendedor ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3 w-3" />
                      <span>Sim, Excluir Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Rodapé de Ações */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-300/60 dark:border-slate-800">
            <div>
              {!confirmandoExclusao && (
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(true)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
                  title="Excluir este vendedor"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Excluir Vendedor</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onFechar}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvandoDados || confirmandoExclusao}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
