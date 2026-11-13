import { useState, useEffect } from "react";
import { X, Plus, Headphones, AlertCircle } from "lucide-react";
import { useAuth } from "@/features/auth/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { criarAtendimento } from "../services/atendimentoService";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";

interface NovoAtendimentoModalProps {
  onFechar: () => void;
  onSucesso: () => void;
}

export function NovoAtendimentoModal({ onFechar, onSucesso }: NovoAtendimentoModalProps) {
  const { session } = useAuth();
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [veiculos, setVeiculos] = useState<{ id: string; placa: string }[]>([]);
  const [carregandoVeiculos, setCarregandoVeiculos] = useState(false);

  const [clienteId, setClienteId] = useState(session?.clienteId || "");
  const [veiculoId, setVeiculoId] = useState("");
  const [tipo, setTipo] = useState("Dúvida de Operação");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta" | "urgente">("media");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Se for equipe, busca lista de clientes ativos para seleção
    if (!session?.isCliente) {
      supabase
        .from("clientes")
        .select("id, nome_razao_social")
        .eq("status", "ativo")
        .order("nome_razao_social")
        .then(({ data }) => {
          if (data) setClientes(data.map((c) => ({ id: c.id, nome: c.nome_razao_social })));
        });
    }
  }, [session]);

  // Carrega estritamente os veículos vinculados ao cliente selecionado
  useEffect(() => {
    if (!clienteId) {
      setVeiculos([]);
      setVeiculoId("");
      return;
    }

    setCarregandoVeiculos(true);
    supabase
      .from("veiculos")
      .select("id, placa, marca_modelo")
      .eq("cliente_id", clienteId)
      .eq("ativo", true)
      .order("placa")
      .then(({ data, error }) => {
        if (!error && data) {
          setVeiculos(
            data.map((v) => ({
              id: v.id,
              placa: v.marca_modelo ? `${v.placa} (${v.marca_modelo})` : v.placa,
            })),
          );
        } else {
          setVeiculos([]);
        }
        setCarregandoVeiculos(false);
      });
  }, [clienteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !titulo || !descricao) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setSalvando(true);
    try {
      const res = await criarAtendimento({
        cliente_id: clienteId,
        veiculo_id: veiculoId || null,
        tipo,
        prioridade,
        titulo,
        descricao_inicial: descricao,
        usuario_id: session!.userId,
        usuario_role: session?.role,
        usuario_nome: session?.nome,
      });

      if (res) {
        toast.success(`Atendimento #${res.numero_protocolo || ""} registrado com sucesso!`);
        onSucesso();
      } else {
        toast.error("Falha ao registrar atendimento.");
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="bg-[#eaf0f8] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl overflow-hidden max-h-[calc(100dvh-2.5rem)] sm:max-h-[85vh] my-auto flex flex-col transition-colors">
          {/* Cabeçalho Fixo */}
          <div className="p-4 sm:p-5 border-b border-slate-300/60 dark:border-slate-800 bg-[#eaf0f8]/90 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs shrink-0">
                <Headphones className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Novo Atendimento / Chamado
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Registro automático de providências do usuário
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Formulário com Rolagem Interna e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
              {!session?.isCliente && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cliente *
                  </label>
                  <select
                    value={clienteId}
                    onChange={(e) => {
                      setClienteId(e.target.value);
                      setVeiculoId("");
                    }}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                  >
                    <option value="">Selecione o cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Veículo (Opcional)
                  </label>
                  <select
                    value={veiculoId}
                    onChange={(e) => setVeiculoId(e.target.value)}
                    disabled={!clienteId || carregandoVeiculos}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50 shadow-xs"
                  >
                    {!clienteId ? (
                      <option value="">Selecione primeiro um cliente...</option>
                    ) : carregandoVeiculos ? (
                      <option value="">Carregando veículos do cliente...</option>
                    ) : veiculos.length === 0 ? (
                      <option value="">Nenhum veículo vinculado a este cliente</option>
                    ) : (
                      <>
                        <option value="">Nenhum veículo específico</option>
                        {veiculos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.placa}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Prioridade
                  </label>
                  <select
                    value={prioridade}
                    onChange={(e) => setPrioridade(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de Ocorrência
                </label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                >
                  <option value="Dúvida de Operação">Dúvida de Operação</option>
                  <option value="Veículo Sem Sinal / Offline">Veículo Sem Sinal / Offline</option>
                  <option value="Solicitação de Bloqueio">Solicitação de Bloqueio</option>
                  <option value="Troca de Rastreador ou Chip">Troca de Rastreador ou Chip</option>
                  <option value="Financeiro / Mensalidade">Financeiro / Mensalidade</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Assunto / Título *
                </label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Veículo ABC-1234 sem atualizar posição"
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição Inicial do Problema *
                </label>
                <textarea
                  rows={4}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Relate detalhadamente o ocorrido..."
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300/70 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 shadow-xs"
                />
              </div>
            </div>

            {/* Rodapé Fixo de Ação */}
            <div className="p-3.5 sm:p-4 border-t border-slate-300/60 dark:border-slate-800 shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onFechar}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/70 dark:border-slate-700 transition shadow-xs flex items-center justify-center"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm disabled:opacity-50 flex items-center justify-center"
              >
                {salvando ? "Registrando..." : "Registrar Atendimento"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
