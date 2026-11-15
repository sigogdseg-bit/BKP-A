import { useState, useEffect } from "react";
import {
  X,
  UserCheck,
  Mail,
  Phone,
  Briefcase,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Sparkles,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/shared/components/ModalPortal";
import {
  type FuncionarioCliente,
  type FuncionarioForm,
  MODULOS_DELEGAVEIS_CLIENTE,
  cadastrarFuncionario,
  atualizarFuncionario,
} from "../services/funcionarioService";

interface FuncionarioModalProps {
  aberto: boolean;
  onFechar: () => void;
  clienteId?: string;
  clientes?: Array<{ id: string; nome_razao_social: string }>;
  isGestorGlobal?: boolean;
  funcionarioEmEdicao?: FuncionarioCliente | null;
  onSucesso: () => void;
}

export function FuncionarioModal({
  aberto,
  onFechar,
  clienteId = "",
  clientes = [],
  isGestorGlobal = false,
  funcionarioEmEdicao,
  onSucesso,
}: FuncionarioModalProps) {
  const isEdicao = Boolean(funcionarioEmEdicao);

  const [clienteSelecionadoId, setClienteSelecionadoId] = useState(
    clienteId || (clientes.length > 0 ? clientes[0].id : ""),
  );
  const [nome, setNome] = useState(funcionarioEmEdicao?.nome || "");
  const [email, setEmail] = useState(funcionarioEmEdicao?.email || "");
  const [telefone, setTelefone] = useState(funcionarioEmEdicao?.telefone || "");
  const [cargo, setCargo] = useState(funcionarioEmEdicao?.cargo || "");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [ativo, setAtivo] = useState(funcionarioEmEdicao ? funcionarioEmEdicao.ativo : true);
  const [modulosSelecionados, setModulosSelecionados] = useState<string[]>(
    funcionarioEmEdicao?.modulos_permitidos || ["monitor-gps", "rotas"],
  );
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setNome(funcionarioEmEdicao?.nome || "");
      setEmail(funcionarioEmEdicao?.email || "");
      setTelefone(funcionarioEmEdicao?.telefone || "");
      setCargo(funcionarioEmEdicao?.cargo || "");
      setSenha("");
      setSenhaVisivel(false);
      setAtivo(funcionarioEmEdicao ? funcionarioEmEdicao.ativo : true);
      setModulosSelecionados(funcionarioEmEdicao?.modulos_permitidos || ["monitor-gps", "rotas"]);
      setClienteSelecionadoId(
        funcionarioEmEdicao?.cliente_id || clienteId || (clientes.length > 0 ? clientes[0].id : ""),
      );
    }
  }, [aberto, funcionarioEmEdicao, clienteId, clientes]);

  if (!aberto) return null;

  const alternarModulo = (id: string) => {
    setModulosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const selecionarTodosModulos = () => {
    setModulosSelecionados(MODULOS_DELEGAVEIS_CLIENTE.map((m) => m.id));
  };

  const limparModulos = () => {
    setModulosSelecionados([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const idTitular = isGestorGlobal ? clienteSelecionadoId || clienteId : clienteId;

    if (!idTitular) {
      toast.error("Selecione o cliente titular ao qual este colaborador pertencerá.");
      return;
    }

    if (!nome.trim()) {
      toast.error("Informe o nome do funcionário.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      toast.error("Informe um e-mail válido para o acesso.");
      return;
    }

    if (!isEdicao && (!senha || senha.length < 6)) {
      toast.error("A senha inicial provisória deve ter no mínimo 6 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      if (isEdicao && funcionarioEmEdicao) {
        const res = await atualizarFuncionario(
          funcionarioEmEdicao.id,
          {
            nome,
            telefone,
            cargo,
            modulos: modulosSelecionados,
          },
          ativo,
        );
        toast.success(res.mensagem || "Funcionário atualizado com sucesso!");
      } else {
        const res = await cadastrarFuncionario(idTitular, {
          nome,
          email,
          senha,
          telefone,
          cargo,
          modulos: modulosSelecionados,
        });
        toast.success(
          res.mensagem ||
            "Funcionário cadastrado com sucesso! No primeiro acesso ele trocará a senha.",
        );
      }
      onSucesso();
      onFechar();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar funcionário.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto select-none animate-fadeIn">
        <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto my-auto rounded-3xl bg-[#fbf2e9] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-5 sm:p-6 shadow-[6px_6px_20px_#c3cfe2] dark:shadow-2xl transition-all">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                <UserCheck className="h-5 w-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                  {isEdicao ? "Editar Colaborador" : "Novo Funcionário"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Defina os dados de identificação e os módulos autorizados
                </p>
              </div>
            </div>
            <button
              onClick={onFechar}
              disabled={salvando}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            {/* Aviso Protetivo sobre 1º acesso e isolamento estrito */}
            <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                  Isolamento Estrito aos Dados do Cliente:
                </span>{" "}
                Este usuário terá visibilidade exclusiva da frota e operações do cliente titular.{" "}
                {!isEdicao && (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    No 1º acesso, a troca de senha será exigida compulsoriamente.
                  </span>
                )}
              </div>
            </div>

            {/* Seleção do Cliente Titular (para Administradores e SuperADM) */}
            {isGestorGlobal && (
              <div className="space-y-1 p-3.5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Cliente Titular (Empresa/Conta) *</span>
                  </div>
                  {isEdicao && (
                    <span className="text-[10px] text-slate-500 font-medium">(Vínculo fixo)</span>
                  )}
                </label>
                {isEdicao ? (
                  <div className="px-3 py-2 rounded-xl bg-slate-200/60 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {funcionarioEmEdicao?.cliente_nome || "Cliente Titular Vinculado"}
                  </div>
                ) : (
                  <select
                    required
                    value={clienteSelecionadoId}
                    onChange={(e) => setClienteSelecionadoId(e.target.value)}
                    className="w-full h-10 px-3 text-xs sm:text-sm rounded-xl border border-indigo-400/40 dark:border-indigo-500/40 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  >
                    <option value="">Selecione o cliente titular...</option>
                    {clientes.map((cli) => (
                      <option key={cli.id} value={cli.id}>
                        {cli.nome_razao_social}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Dados Cadastrais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>Nome Completo *</span>
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Carlos Eduardo Silva"
                  className="w-full h-10 px-3 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>E-mail de Acesso *</span>
                </label>
                <input
                  type="email"
                  required
                  disabled={isEdicao}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colaborador@empresa.com"
                  className="w-full h-10 px-3 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>Telefone / WhatsApp</span>
                </label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full h-10 px-3 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                  <span>Cargo / Função</span>
                </label>
                <input
                  type="text"
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex: Gestor de Frotas, Logística"
                  className="w-full h-10 px-3 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            </div>

            {/* Senha Provisória (apenas no cadastro) */}
            {!isEdicao && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-slate-400" />
                  <span>Senha Inicial Provisória *</span>
                </label>
                <div className="relative">
                  <input
                    type={senhaVisivel ? "text" : "password"}
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres (o funcionário alterará no 1º login)"
                    className="w-full h-10 pl-3 pr-10 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setSenhaVisivel(!senhaVisivel)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                    title={senhaVisivel ? "Ocultar senha" : "Ver senha"}
                    aria-label={senhaVisivel ? "Ocultar senha" : "Ver senha"}
                  >
                    {senhaVisivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Status Ativo / Inativo na Edição */}
            {isEdicao && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300/50 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Status do Usuário:
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={(e) => setAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
                  <span className="ml-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {ativo ? "Ativo" : "Inativo"}
                  </span>
                </label>
              </div>
            )}

            {/* Módulos Permitidos */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                    Módulos Autorizados
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Marque quais ferramentas da sua conta o colaborador poderá acessar
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={selecionarTodosModulos}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 font-bold transition"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={limparModulos}
                    className="px-2.5 py-1 rounded-lg bg-slate-200/50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold transition"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {MODULOS_DELEGAVEIS_CLIENTE.map((m) => {
                  const marcado = modulosSelecionados.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => alternarModulo(m.id)}
                      className={`p-3 rounded-2xl border transition cursor-pointer flex items-start gap-3 select-none ${
                        marcado
                          ? "bg-indigo-500/10 border-indigo-500/40 text-slate-900 dark:text-slate-100 shadow-xs"
                          : "bg-white/40 dark:bg-slate-950/40 border-slate-300/60 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 transition ${
                          marcado
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-slate-400 dark:border-slate-600 bg-transparent"
                        }`}
                      >
                        {marcado && <CheckCircle2 className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold leading-tight">{m.nome}</p>
                        <p className="text-[10px] leading-snug opacity-75">{m.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rodapé com botões de ação */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={onFechar}
                disabled={salvando}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition shadow-[2px_2px_8px_rgba(79,70,229,0.35)] min-h-[44px]"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>{isEdicao ? "Salvar Alterações" : "Cadastrar Funcionário"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
