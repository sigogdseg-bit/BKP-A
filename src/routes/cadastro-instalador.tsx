import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Wrench,
  User,
  Mail,
  Lock,
  Phone,
  CreditCard,
  MapPin,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  validarConviteInstalador,
  cadastrarInstaladorPorConvite,
} from "@/features/seguranca/services/conviteInstaladorService";
import {
  isModoDemonstracaoAtivo,
  simularCadastroInstalador,
  CLIENTE_FANTASMA_PADRAO,
  KIT_FANTASMA_PADRAO,
  ORDEM_SERVICO_FANTASMA_PADRAO,
} from "@/features/demonstracao/services/demonstracaoService";
import { BarraModoDemonstracao } from "@/features/demonstracao/components/BarraModoDemonstracao";

export const Route = createFileRoute("/cadastro-instalador")({
  component: CadastroInstaladorPage,
});

function CadastroInstaladorPage() {
  const [token, setToken] = useState<string>("");
  const [validando, setValidando] = useState(true);
  const [conviteValido, setConviteValido] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Formulário
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [confirmarSenhaVisivel, setConfirmarSenhaVisivel] = useState(false);
  const [chavePix, setChavePix] = useState("");
  const [enderecoInstalacao, setEnderecoInstalacao] = useState("");
  const [valorSemBloqueador, setValorSemBloqueador] = useState("60,00");
  const [valorComBloqueador, setValorComBloqueador] = useState("90,00");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    // Extrai o token da URL
    const searchParams = new URLSearchParams(window.location.search);
    const t = searchParams.get("token") || "";
    const isDemo =
      searchParams.get("demo") === "true" || t.includes("demo") || isModoDemonstracaoAtivo();
    setToken(t);

    if (isDemo) {
      setValidando(false);
      setConviteValido(true);
      setNome("Marcos Ribeiro — Instalador Credenciado");
      setEmail("instalador.demo@sigoguardiao.com.br");
      setTelefone("(24) 99123-4567");
      setChavePix("instalador.demo@sigoguardiao.com.br");
      setEnderecoInstalacao("Av. Alberto Braune, 120 - Centro, Nova Friburgo - RJ");
      setSenha("Demo123456");
      setConfirmarSenha("Demo123456");
      setValorSemBloqueador("60,00");
      setValorComBloqueador("90,00");
      return;
    }

    if (!t) {
      setValidando(false);
      setConviteValido(false);
      setMensagemErro(
        "Link de convite incompleto ou sem código de autorização. Solicite um novo link a administração.",
      );
      return;
    }

    const checar = async () => {
      setValidando(true);
      const res = await validarConviteInstalador(t);
      setValidando(false);
      if (res.valido) {
        setConviteValido(true);
      } else {
        setConviteValido(false);
        setMensagemErro(res.mensagem);
      }
    };

    checar();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("Informe seu nome completo.");
      return;
    }

    if (!email.trim()) {
      toast.error("Informe seu e-mail institucional ou de login.");
      return;
    }

    if (!senha || senha.length < 6) {
      toast.error("A senha deve possuir no mínimo 6 caracteres.");
      return;
    }

    if (senha !== confirmarSenha) {
      toast.error("As senhas informadas não coincidem.");
      return;
    }

    if (!enderecoInstalacao.trim()) {
      toast.error("Informe o endereço da oficina ou ponto de atendimento.");
      return;
    }

    const parseValor = (val: string) => {
      const limpo = val.replace(/[^\d.,]/g, "").replace(",", ".");
      return Number(limpo) || 0;
    };

    setEnviando(true);

    // MODO DEMONSTRAÇÃO (SANDBOX): Simula credenciamento sem gravar no BD real
    if (isModoDemonstracaoAtivo() || token.includes("demo")) {
      try {
        const res = await simularCadastroInstalador({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.trim(),
          chavePix: chavePix.trim(),
          enderecoInstalacao: enderecoInstalacao.trim(),
          valorSemBloqueador,
          valorComBloqueador,
        });
        setSucesso(true);
        toast.success(res.mensagem);
      } finally {
        setEnviando(false);
      }
      return;
    }

    try {
      const res = await cadastrarInstaladorPorConvite({
        token,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        senha,
        telefone: telefone.trim() || undefined,
        chavePix: chavePix.trim() || undefined,
        enderecoInstalacao: enderecoInstalacao.trim(),
        valorInstalacaoSemBloqueador: parseValor(valorSemBloqueador),
        valorInstalacaoComBloqueador: parseValor(valorComBloqueador),
      });

      if (res.success) {
        setSucesso(true);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setEnviando(false);
    }
  };

  const isDemoAtivo = isModoDemonstracaoAtivo() || token.includes("demo");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col text-slate-100 select-none">
      {/* Barra Superior do Modo Demonstração */}
      <BarraModoDemonstracao />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl">
          {/* Cabeçalho de Marca */}
          <div className="text-center mb-6 space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Credenciamento Técnico GD Rastreamento</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Auto-Cadastro de Instalador
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              Preencha seus dados técnicos e de recebimento PIX para ter sua oficina credenciada.
            </p>
          </div>

          {/* Card Principal */}
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            {validando ? (
              <div className="text-center py-12 space-y-3">
                <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-mono">
                  Validando autorização do link de convite de uso único...
                </p>
              </div>
            ) : !conviteValido ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-rose-400">
                    Link de Convite Indisponível
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    {mensagemErro ||
                      "Este link de uso único já foi utilizado ou expirou. Solicite um novo link a administração."}
                  </p>
                </div>
                <div className="pt-2">
                  <a
                    href="/login"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
                  >
                    Ir para a Tela de Login
                  </a>
                </div>
              </div>
            ) : sucesso ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-black text-emerald-400">
                    Cadastro Realizado com Sucesso!
                  </h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                    Seus dados foram enviados para o sistema com o status inicial{" "}
                    <strong className="text-amber-400">Pendente de Habilitação</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-left space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>Próximas Etapas da Administração:</span>
                  </div>
                  <ul className="text-[11px] text-amber-300/80 space-y-1 list-disc list-inside">
                    <li>O operador ou administrador do sistema irá revisar e ativar sua conta.</li>
                    <li>
                      Após a ativação, você poderá fazer login com seu e-mail e senha cadastrados.
                    </li>
                    <li>Este link de convite foi queimado e não poderá ser reutilizado.</li>
                  </ul>
                </div>

                {isDemoAtivo ? (
                  <div className="p-4 rounded-2xl bg-indigo-950/70 border border-indigo-500/40 text-left space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                        <Sparkles className="h-4 w-4" /> Ordem de Serviço Fantasma Atribuída
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                        Kit J16 Liberado
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div>
                        <span className="text-slate-400 text-[10px] block">CLIENTE ATRIBUÍDO:</span>
                        <strong className="text-white">
                          {CLIENTE_FANTASMA_PADRAO.nome_razao_social}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">VEÍCULO / PLACA:</span>
                        <strong className="text-white">
                          {CLIENTE_FANTASMA_PADRAO.veiculos[0].marca_modelo} (
                          {CLIENTE_FANTASMA_PADRAO.veiculos[0].placa})
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">
                          KIT RASTREADOR J16:
                        </span>
                        <strong className="text-white">
                          IMEI {KIT_FANTASMA_PADRAO.imei} ({KIT_FANTASMA_PADRAO.chip_operadora})
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">NÚMERO DA OS:</span>
                        <strong className="text-sky-300">
                          {ORDEM_SERVICO_FANTASMA_PADRAO.numero_os}
                        </strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-indigo-500/30 flex flex-col sm:flex-row gap-2">
                      <a
                        href="/instalacao?demo=true"
                        className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition text-center shadow-md shadow-emerald-600/20"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                        <span>Abrir Módulo de Instalações e Executar OS Fantasma</span>
                      </a>
                      <a
                        href="/demonstracao"
                        className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-slate-700 text-center"
                      >
                        <span>Voltar ao Hub Demo</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3">
                    <a
                      href="/login"
                      className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition"
                    >
                      Ir para a Página de Login
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-300">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="text-xs leading-relaxed">
                    Link de uso único válido. Sua conta será criada no perfil{" "}
                    <strong>Instalador Técnico</strong> e passará por aprovação da administração
                    antes da ativação.
                  </p>
                </div>

                {/* Nome Completo */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Nome Completo *</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Carlos Eduardo Silva"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                {/* Grid: E-mail e Telefone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-indigo-400" />
                      <span>E-mail / Login *</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tecnico@oficina.com.br"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Telefone / Celular</span>
                    </label>
                    <input
                      type="tel"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      placeholder="(24) 99999-8888"
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                {/* Grid: Senha e Confirmação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Criar Senha de Acesso *</span>
                    </label>
                    <div className="relative">
                      <input
                        type={senhaVisivel ? "text" : "password"}
                        required
                        minLength={6}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setSenhaVisivel(!senhaVisivel)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                        title={senhaVisivel ? "Ocultar senha" : "Ver senha"}
                        aria-label={senhaVisivel ? "Ocultar senha" : "Ver senha"}
                      >
                        {senhaVisivel ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Confirmar Senha *</span>
                    </label>
                    <div className="relative">
                      <input
                        type={confirmarSenhaVisivel ? "text" : "password"}
                        required
                        minLength={6}
                        value={confirmarSenha}
                        onChange={(e) => setConfirmarSenha(e.target.value)}
                        placeholder="Repita sua senha"
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-3.5 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setConfirmarSenhaVisivel(!confirmarSenhaVisivel)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors p-1"
                        title={confirmarSenhaVisivel ? "Ocultar senha" : "Ver senha"}
                        aria-label={confirmarSenhaVisivel ? "Ocultar senha" : "Ver senha"}
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

                {/* Chave PIX */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Chave PIX para Recebimento de Repasses</span>
                  </label>
                  <input
                    type="text"
                    value={chavePix}
                    onChange={(e) => setChavePix(e.target.value)}
                    placeholder="CPF, CNPJ, Celular, E-mail ou Chave Aleatória"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                {/* Endereço da Oficina */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-rose-400" />
                    <span>Endereço da Oficina / Ponto de Atendimento *</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={enderecoInstalacao}
                    onChange={(e) => setEnderecoInstalacao(e.target.value)}
                    placeholder="Ex: Av. Brasil, 1500 - Centro, Rio de Janeiro - RJ"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    Endereço exibido para o cliente levar o veículo no momento do agendamento.
                  </span>
                </div>

                {/* Grid: Valores da Mão de Obra (Sem e Com Bloqueador) */}
                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                    <DollarSign className="h-4 w-4" />
                    <span>Seus Valores de Mão de Obra Técnica por Instalação</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">
                        Instalação SEM Bloqueador (R$) *
                      </label>
                      <input
                        type="text"
                        required
                        value={valorSemBloqueador}
                        onChange={(e) => setValorSemBloqueador(e.target.value)}
                        placeholder="60,00"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500 shadow-xs transition"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Apenas rastreador e telemetria básica.
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Instalação COM Bloqueador (R$) *
                      </label>
                      <input
                        type="text"
                        required
                        value={valorComBloqueador}
                        onChange={(e) => setValorComBloqueador(e.target.value)}
                        placeholder="90,00"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300/80 dark:border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500 shadow-xs transition"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Rastreador + relé de corte seguro.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botão de Envio */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={enviando}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Wrench className="h-4 w-4" />
                    <span>
                      {enviando ? "Processando Cadastro..." : "Concluir Meu Cadastro de Instalador"}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
