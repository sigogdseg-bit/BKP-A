import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Lock,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
  Briefcase,
  Building,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  validarConviteParceiro,
  cadastrarParceiroPorConvite,
} from "@/features/revendedores/services/revendedoresService";
import { formatarCpfCnpj, formatarTelefone } from "@/shared/utils/mascaras";
import { APP_NOME, APP_SLOGAN, APP_VERSION_NUMERO } from "@/shared/lib/version";
import { ThemeToggle } from "@/features/theme/components/ThemeToggle";

export const Route = createFileRoute("/cadastro-parceiro")({
  component: CadastroParceiroPage,
});

function CadastroParceiroPage() {
  const [token, setToken] = useState<string>("");
  const [validando, setValidando] = useState(true);
  const [conviteValido, setConviteValido] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [tipoParceiro, setTipoParceiro] = useState<"revendedor" | "vendedor">("revendedor");
  const [revendedorNome, setRevendedorNome] = useState<string | undefined>();
  const [valorBase, setValorBase] = useState<number | undefined>();

  // Formulário
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [confirmarSenhaVisivel, setConfirmarSenhaVisivel] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const t = searchParams.get("token") || "";
    setToken(t);

    if (!t) {
      setValidando(false);
      setConviteValido(false);
      setMensagemErro(
        "Link de credenciamento incompleto ou sem código de autorização. Solicite um novo link à administração da Matriz GD Rastreamento.",
      );
      return;
    }

    const checar = async () => {
      setValidando(true);
      const res = await validarConviteParceiro(t);
      setValidando(false);
      if (res.valido && res.tipo) {
        setConviteValido(true);
        setTipoParceiro(res.tipo);
        setRevendedorNome(res.revendedorNome);
        setValorBase(res.valorBaseProposto);
      } else {
        setConviteValido(false);
        setMensagemErro(res.mensagem || "Este link de convite é inválido ou já expirou.");
      }
    };

    checar();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("Informe seu nome completo ou razão social.");
      return;
    }
    if (!email.trim()) {
      toast.error("Informe um e-mail válido para acesso.");
      return;
    }
    if (!senha || senha.length < 6) {
      toast.error("A senha de acesso deve ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      toast.error("As senhas digitadas não coincidem.");
      return;
    }

    try {
      setEnviando(true);
      const res = await cadastrarParceiroPorConvite({
        token,
        nome: nome.trim(),
        documento: documento.trim() || undefined,
        email: email.trim().toLowerCase(),
        telefone: telefone.trim() || undefined,
        chavePix: chavePix.trim() || undefined,
        senha,
      });

      if (res.sucesso) {
        setSucesso(true);
        toast.success(res.mensagem || "Credenciamento realizado com sucesso!");
      } else {
        toast.error(res.mensagem || "Não foi possível concluir o credenciamento.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro inesperado ao cadastrar parceiro.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#fbf2e9] dark:bg-[#110e0c] text-slate-800 dark:text-slate-100 relative overflow-hidden font-sans select-none transition-colors duration-200">
      {/* Botão de Alternância de Tema Flutuante no Canto Superior */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Luz ambiente de fundo Neumorphic Canônica */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-sky-500/10 dark:bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-xl bg-[#f0f4f9] dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[12px_12px_28px_#c3cfe2,-12px_-12px_28px_#ffffff] dark:shadow-2xl backdrop-blur-xl transition-all duration-200">
        {/* Header Oficial GD Rastreamento com Emblema Real */}
        <div className="text-center space-y-2 mb-6">
          <div className="mx-auto flex items-center justify-center">
            <div className="h-24 w-24 sm:h-28 sm:w-28 flex items-center justify-center rounded-3xl overflow-hidden p-0 bg-transparent hover:scale-105 transition-transform duration-200">
              <img
                src="/logo-emblema.png"
                alt={APP_NOME}
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-contain drop-shadow-2xl"
              />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 uppercase mt-1">
              {APP_NOME}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{APP_SLOGAN}</p>
          </div>

          <div className="pt-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-[11px] font-mono font-bold uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>
                {tipoParceiro === "revendedor"
                  ? "Credenciamento de Franquia Revendedora"
                  : "Credenciamento de Consultor Comercial"}
              </span>
            </div>
          </div>
        </div>

        {validando ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="h-9 w-9 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono font-bold">
              Validando autorização do convite comercial...
            </span>
          </div>
        ) : !conviteValido ? (
          <div className="py-6 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Convite Não Disponível
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              {mensagemErro || "Este link de convite é inválido ou já expirou."}
            </p>
            <div className="pt-2">
              <a
                href="/login"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider transition shadow-sm"
              >
                Ir para Tela de Acesso
              </a>
            </div>
          </div>
        ) : sucesso ? (
          <div className="py-6 text-center space-y-4">
            <div className="h-16 w-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/15">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Credenciamento Concluído!
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Seu perfil oficial de{" "}
              <strong className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                {tipoParceiro}
              </strong>{" "}
              foi ativado na rede comercial do {APP_NOME}. Agora você já pode acessar seu painel de
              gestão.
            </p>
            <div className="pt-4">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
              >
                <span>Acessar Meu Painel Agora</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        ) : (
          /* Formulário de Cadastro Comercial */
          <div className="space-y-4">
            {/* Box de Condições Comerciais Acordadas */}
            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-950/70 border border-slate-300/70 dark:border-slate-800 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  {tipoParceiro === "revendedor" ? (
                    <Building className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Briefcase className="h-4 w-4 text-blue-500" />
                  )}
                  <span>
                    {tipoParceiro === "revendedor"
                      ? "Franquia Autorizada GD Rastreamento"
                      : `Equipe Comercial • ${revendedorNome || "Matriz GD Rastreamento"}`}
                  </span>
                </span>
                {valorBase !== undefined && (
                  <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/25">
                    Cota Base: R$ {valorBase.toFixed(2)}/un
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {tipoParceiro === "revendedor"
                  ? "Sua franquia terá autonomia para cadastrar vendedores, emitir links próprios e gerenciar sua carteira com repasses transparentes."
                  : `Você integrará a equipe de vendas de ${revendedorNome || "sua franquia"}, recebendo comissões pelas assinaturas e taxas de adesão.`}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo ou Razão Social *
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: João da Silva ou Silva Rastreamento Ltda"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    CPF ou CNPJ
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={documento}
                      onChange={(e) => setDocumento(formatarCpfCnpj(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] font-mono transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Telefone ou WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={telefone}
                      onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                      placeholder="(24) 99999-9999"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] font-mono transition"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    E-mail de Acesso *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] font-mono transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Chave PIX para Comissões
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={chavePix}
                      onChange={(e) => setChavePix(e.target.value)}
                      placeholder="E-mail, CPF ou chave aleatória"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] font-mono transition"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Criar Senha de Acesso *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type={senhaVisivel ? "text" : "password"}
                      required
                      minLength={6}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo 6 dígitos"
                      className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setSenhaVisivel(!senhaVisivel)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {senhaVisivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                    Confirmar Senha *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type={confirmarSenhaVisivel ? "text" : "password"}
                      required
                      minLength={6}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full pl-10 pr-10 py-2.5 bg-white dark:bg-slate-950 border border-slate-300/80 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.04)] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setConfirmarSenhaVisivel(!confirmarSenhaVisivel)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {confirmarSenhaVisivel ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                >
                  {enviando ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                      <span>Concluindo Credenciamento...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Concluir Credenciamento de {tipoParceiro}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Rodapé Seguro */}
        <div className="mt-6 pt-4 border-t border-slate-200/80 dark:border-slate-800 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Ambiente Seguro • Canal Oficial da Rede {APP_NOME}</span>
          </div>
          <div>
            <a
              href="/login"
              className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-bold transition underline"
            >
              Já possui credencial de acesso? Entrar na conta
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
