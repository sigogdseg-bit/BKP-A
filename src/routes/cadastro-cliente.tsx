import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Users,
  User,
  Mail,
  Lock,
  Phone,
  CreditCard,
  Car,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Sparkles,
  Info,
  Wrench,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  validarConviteCliente,
  cadastrarClientePorConvite,
  type VeiculoCadastroConvite,
} from "@/features/clientes/services/conviteClienteService";
import { formatarCpfCnpj, formatarTelefone } from "@/shared/utils/mascaras";
import {
  LISTA_TIPOS_VEICULO,
  obterRotuloTipoVeiculo,
  type TipoVeiculo,
} from "@/features/monitor-gps/utils/vehicle3dIcons";
import {
  isModoDemonstracaoAtivo,
  simularAdesaoCliente,
  obterEstadoDemonstracao,
  INSTALADOR_FANTASMA_PADRAO,
} from "@/features/demonstracao/services/demonstracaoService";
import { BarraModoDemonstracao } from "@/features/demonstracao/components/BarraModoDemonstracao";

export const Route = createFileRoute("/cadastro-cliente")({
  component: CadastroClientePage,
});

function CadastroClientePage() {
  const [token, setToken] = useState<string>("");
  const [validando, setValidando] = useState(true);
  const [conviteValido, setConviteValido] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Dados do Cliente
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [diaVencimento, setDiaVencimento] = useState<number>(10);
  const [senha, setSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [confirmarSenhaVisivel, setConfirmarSenhaVisivel] = useState(false);

  // Lista de Veículos
  const [veiculos, setVeiculos] = useState<VeiculoCadastroConvite[]>([
    {
      placa: "",
      modelo: "",
      marca: "",
      ano: "",
      cor: "",
      tipo_veiculo: "carro",
      combustivel: "Flex",
      observacoes: "",
    },
  ]);

  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const t = searchParams.get("token") || "";
    const isDemo =
      searchParams.get("demo") === "true" || t.includes("demo") || isModoDemonstracaoAtivo();
    setToken(t);

    if (isDemo) {
      setValidando(false);
      setConviteValido(true);
      // Pré-preenche os dados da simulação caso vazios
      setNome("Carlos Eduardo — Cliente Demonstração");
      setDocumento("111.222.333-44");
      setEmail("cliente.demo@sigoguardiao.com.br");
      setTelefone("(24) 99876-5432");
      setSenha("Demo123456");
      setConfirmarSenha("Demo123456");
      setVeiculos([
        {
          placa: "DEM-2026",
          modelo: "Toyota Corolla Cross XRE",
          marca: "Toyota",
          ano: "2025",
          cor: "Branco Pérola",
          tipo_veiculo: "suv",
          combustivel: "Flex",
          observacoes: "Veículo configurado para o simulador de demonstração",
        },
      ]);
      return;
    }

    if (!t) {
      setValidando(false);
      setConviteValido(false);
      setMensagemErro(
        "Link de auto-cadastro incompleto ou sem código de autorização. Solicite um novo link a administração.",
      );
      return;
    }

    const checar = async () => {
      setValidando(true);
      const res = await validarConviteCliente(t);
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

  const handleAdicionarVeiculo = () => {
    setVeiculos((prev) => [
      ...prev,
      {
        placa: "",
        modelo: "",
        marca: "",
        ano: "",
        cor: "",
        tipo_veiculo: "carro",
        combustivel: "Flex",
        observacoes: "",
      },
    ]);
  };

  const handleRemoverVeiculo = (index: number) => {
    if (veiculos.length <= 1) {
      toast.error("É necessário cadastrar pelo menos um veículo para o serviço.");
      return;
    }
    setVeiculos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAtualizarVeiculo = (
    index: number,
    campo: keyof VeiculoCadastroConvite,
    valor: any,
  ) => {
    setVeiculos((prev) => {
      const novos = [...prev];
      novos[index] = { ...novos[index], [campo]: valor };
      return novos;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("Informe seu nome completo ou razão social.");
      return;
    }

    if (!email.trim()) {
      toast.error("Informe seu e-mail para acesso ao sistema.");
      return;
    }

    if (!senha || senha.length < 6) {
      toast.error("A senha de acesso deve ter pelo menos 6 caracteres.");
      return;
    }

    if (senha !== confirmarSenha) {
      toast.error("As senhas informadas não coincidem.");
      return;
    }

    // Validação dos veículos
    if (veiculos.length === 0) {
      toast.error("Cadastre pelo menos 1 veículo para prosseguir.");
      return;
    }

    for (let i = 0; i < veiculos.length; i++) {
      const v = veiculos[i];
      const tipoV = (v.tipo_veiculo || v.tipo || "carro").toLowerCase();
      const isSemPlaca =
        tipoV === "maquina" ||
        tipoV === "trator" ||
        tipoV === "equipamento" ||
        tipoV === "moto_eletrica";
      if (!isSemPlaca && !v.placa.trim()) {
        toast.error(`Informe a placa do veículo #${i + 1}.`);
        return;
      }
      if (!v.modelo.trim()) {
        toast.error(`Informe o modelo do veículo #${i + 1}${v.placa ? ` (${v.placa})` : ""}.`);
        return;
      }
    }

    setEnviando(true);

    // MODO DEMONSTRAÇÃO (SANDBOX): Simula que gravou mas NÃO altera o banco de dados real
    if (isModoDemonstracaoAtivo() || token.includes("demo")) {
      try {
        const res = await simularAdesaoCliente({
          nome: nome.trim(),
          documento: documento.trim(),
          email: email.trim().toLowerCase(),
          telefone: telefone.trim(),
          diaVencimento,
          veiculos: veiculos.map((v) => ({
            placa: v.placa.trim().toUpperCase() || "DEM-2026",
            modelo: v.modelo.trim() || "Toyota Corolla Cross XRE",
            cor: v.cor?.trim() || "Branco Pérola",
            ano: v.ano ? String(v.ano).trim() : "2025",
            tipo_veiculo: (v.tipo_veiculo || "suv").toLowerCase(),
          })),
        });
        setSucesso(true);
        toast.success(res.mensagem);
      } finally {
        setEnviando(false);
      }
      return;
    }

    try {
      const res = await cadastrarClientePorConvite({
        token,
        nome: nome.trim(),
        documento: documento.trim() || undefined,
        email: email.trim().toLowerCase(),
        senha,
        telefone: telefone.trim() || undefined,
        diaVencimento,
        veiculos: veiculos.map((v) => {
          const tipoV = (v.tipo_veiculo || v.tipo || "carro").toLowerCase();
          const isSemPlaca =
            tipoV === "maquina" ||
            tipoV === "trator" ||
            tipoV === "equipamento" ||
            tipoV === "moto_eletrica";
          const rawChassi = (v.chassi || "").trim().toUpperCase();
          const sufixoChassi = rawChassi.length >= 6 ? rawChassi.slice(-6) : null;
          const placaFinal =
            v.placa.trim().toUpperCase() ||
            (isSemPlaca ? sufixoChassi || "SEM PLACA" : "A DEFINIR");

          return {
            ...v,
            tipo_veiculo: tipoV as TipoVeiculo,
            placa: placaFinal,
            chassi: rawChassi || undefined,
            modelo: v.modelo.trim(),
            marca: v.marca?.trim() || undefined,
            ano: v.ano ? String(v.ano).trim() : undefined,
            cor: v.cor?.trim() || undefined,
            observacoes: v.observacoes?.trim() || undefined,
          };
        }),
      });

      if (!res.success) {
        let msg = res.message || "Erro ao processar cadastro.";
        if (msg.includes("schema cache") || msg.includes("column") || msg.includes("PGRST")) {
          msg =
            "Instabilidade temporária na estrutura de dados. O sistema já tentou se reajustar, por favor clique novamente em 'Concluir e Enviar Cadastro'.";
        }
        toast.error(msg);
        return;
      }

      setSucesso(true);
      toast.success(res.message);
    } catch (err: any) {
      let msg = err?.message || "Erro inesperado ao salvar cadastro.";
      if (msg.includes("schema cache") || msg.includes("column") || msg.includes("PGRST")) {
        msg =
          "Instabilidade temporária na comunicação. Por favor, tente novamente em alguns instantes.";
      }
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  const isDemoAtivo = isModoDemonstracaoAtivo() || token.includes("demo");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-start relative overflow-hidden">
      {/* Barra Superior do Modo Demonstração */}
      <BarraModoDemonstracao />

      <div className="flex-1 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
        {/* Background Decorativo */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
              <Users className="h-8 w-8" />
            </div>
          </div>
          <h2 className="text-center text-2xl sm:text-3xl font-black tracking-tight text-white">
            Auto-Cadastro de Cliente
          </h2>
          <p className="mt-2 text-center text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Preencha seus dados cadastrais e adicione os veículos para rastreamento e telemetria.
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-2xl relative z-10">
          <div className="bg-slate-900/90 border border-slate-800 shadow-2xl rounded-3xl p-5 sm:p-8 backdrop-blur-xl">
            {validando ? (
              <div className="py-16 text-center space-y-4">
                <Clock className="h-10 w-10 text-emerald-400 animate-spin mx-auto" />
                <p className="text-sm text-slate-400 font-medium">
                  Validando seu código de autorização...
                </p>
              </div>
            ) : !conviteValido ? (
              <div className="py-8 text-center space-y-4">
                <div className="h-16 w-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400 shadow-lg">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-white">Link Indisponível ou Expirado</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                  {mensagemErro ||
                    "Este link de auto-cadastro já foi utilizado ou ultrapassou a validade limite."}
                </p>
                <div className="pt-4">
                  <a
                    href="/login"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    Ir para Tela de Acesso
                  </a>
                </div>
              </div>
            ) : sucesso ? (
              <div className="py-8 text-center space-y-5">
                <div className="h-20 w-20 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/10">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Cadastro Enviado com Sucesso!</h3>
                  <p className="text-xs sm:text-sm text-emerald-400/90 font-medium mt-1">
                    Seus dados e seus veículos foram recebidos pela central operacional.
                  </p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 text-left space-y-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Próximas Etapas:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1.5 text-slate-400 text-[11px] leading-relaxed">
                    <li>O operador definirá as condições do plano contratado e a mensalidade.</li>
                    <li>
                      Ordens individuais de instalação foram abertas para cada um dos veículos
                      cadastrados ({veiculos.length}{" "}
                      {veiculos.length === 1 ? "veículo" : "veículos"}
                      ).
                    </li>
                    <li>
                      O instalador técnico responsável entrará em contato para agendar o serviço.
                    </li>
                    <li>
                      Você já pode acessar o sistema com o e-mail informado e sua senha cadastrada.
                    </li>
                  </ul>
                </div>

                <div className="pt-3 flex flex-col items-center gap-3">
                  {isDemoAtivo ? (
                    <div className="w-full p-4 rounded-2xl bg-indigo-950/70 border border-indigo-500/40 text-left space-y-3 shadow-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5 uppercase">
                          <Sparkles className="h-4 w-4" /> Agendamento Técnico Simulado
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                          Instalador Fantasma Atribuído
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div>
                          <span className="text-slate-400 text-[10px] block">
                            TÉCNICO INSTALADOR:
                          </span>
                          <strong className="text-white">{INSTALADOR_FANTASMA_PADRAO.nome}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">DATA E HORÁRIO:</span>
                          <strong className="text-white">Amanhã às 14:00 (Confirmado)</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">
                            CONTATO DO TÉCNICO:
                          </span>
                          <strong className="text-white">
                            {INSTALADOR_FANTASMA_PADRAO.telefone}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">STATUS DA ORDEM:</span>
                          <strong className="text-sky-300">Aguardando Execução Técnica</strong>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-indigo-500/30 flex flex-col sm:flex-row gap-2">
                        <a
                          href="/instalacao?demo=true"
                          className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition text-center shadow-md shadow-emerald-600/20"
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          <span>Simular Instalação Deste Veículo (Jornada Instalador)</span>
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
                    <a
                      href="/login"
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20"
                    >
                      <Lock className="h-4 w-4" />
                      <span>Acessar Painel do Cliente</span>
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Etapa 1: Dados do Cliente */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <User className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                      1. Dados do Titular / Cliente
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <span>Nome Completo / Razão Social</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          required
                          value={nome}
                          onChange={(e) => setNome(e.target.value)}
                          placeholder="Ex: Carlos Eduardo de Oliveira"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <span>CPF ou CNPJ</span>
                      </label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          value={documento}
                          onChange={(e) => setDocumento(formatarCpfCnpj(e.target.value))}
                          placeholder="000.000.000-00"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <span>Telefone / WhatsApp</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="text"
                          value={telefone}
                          onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                          placeholder="(00) 00000-0000"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <span>E-mail (Login de Acesso)</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="cliente@email.com"
                          className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Dia de Vencimento Preferencial
                      </label>
                      <select
                        value={diaVencimento}
                        onChange={(e) => setDiaVencimento(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                      >
                        <option value={5}>Todo dia 05</option>
                        <option value={10}>Todo dia 10 (Padrão)</option>
                        <option value={15}>Todo dia 15</option>
                        <option value={20}>Todo dia 20</option>
                        <option value={25}>Todo dia 25</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <span>Senha de Acesso</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type={senhaVisivel ? "text" : "password"}
                          required
                          value={senha}
                          onChange={(e) => setSenha(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
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
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <span>Confirmar Senha</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          type={confirmarSenhaVisivel ? "text" : "password"}
                          required
                          value={confirmarSenha}
                          onChange={(e) => setConfirmarSenha(e.target.value)}
                          placeholder="Repita a senha"
                          className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
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
                </div>

                {/* Etapa 2: Veículos Cadastrados */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Car className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                        2. Veículos para Rastreamento ({veiculos.length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleAdicionarVeiculo}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition shadow-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Adicionar Outro Veículo</span>
                    </button>
                  </div>

                  <div className="space-y-3.5">
                    {veiculos.map((veiculo, index) => (
                      <div
                        key={index}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                            <span className="h-5 w-5 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[11px] font-mono">
                              {index + 1}
                            </span>
                            <span>Veículo #{index + 1}</span>
                          </span>

                          {veiculos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoverVeiculo(index)}
                              className="text-slate-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 transition"
                              title="Remover este veículo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">
                              Tipo de Veículo
                            </label>
                            <select
                              value={veiculo.tipo_veiculo || "carro"}
                              onChange={(e) =>
                                handleAtualizarVeiculo(
                                  index,
                                  "tipo_veiculo",
                                  e.target.value as TipoVeiculo,
                                )
                              }
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                            >
                              {LISTA_TIPOS_VEICULO.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Placa (Opcional para Máquinas e Motos Elétricas) */}
                          {(() => {
                            const tipoAtual = (
                              veiculo.tipo_veiculo ||
                              veiculo.tipo ||
                              "carro"
                            ).toLowerCase();
                            const isSemPlaca =
                              tipoAtual === "maquina" ||
                              tipoAtual === "trator" ||
                              tipoAtual === "equipamento" ||
                              tipoAtual === "moto_eletrica";
                            return (
                              <>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                                    <span>Placa</span>
                                    {isSemPlaca ? (
                                      <span className="text-slate-500 font-normal">
                                        (Opcional p/ máquinas e motos elétricas)
                                      </span>
                                    ) : (
                                      <span className="text-rose-500">*</span>
                                    )}
                                  </label>
                                  <input
                                    type="text"
                                    required={!isSemPlaca}
                                    value={veiculo.placa}
                                    onChange={(e) =>
                                      handleAtualizarVeiculo(
                                        index,
                                        "placa",
                                        e.target.value.toUpperCase(),
                                      )
                                    }
                                    placeholder={
                                      isSemPlaca
                                        ? "Opcional (ou Chassi / Nº)"
                                        : "ABC-1234 ou ABC1D23"
                                    }
                                    maxLength={10}
                                    className="w-full px-2.5 py-1.5 font-mono uppercase bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                                    <span>Chassi</span>
                                    {isSemPlaca ? (
                                      <span className="text-slate-500 font-normal">
                                        (6 dígitos p/ mapa)
                                      </span>
                                    ) : null}
                                  </label>
                                  <input
                                    type="text"
                                    value={veiculo.chassi || ""}
                                    onChange={(e) =>
                                      handleAtualizarVeiculo(
                                        index,
                                        "chassi",
                                        e.target.value.toUpperCase(),
                                      )
                                    }
                                    placeholder="6 últimos dígitos p/ mapa"
                                    maxLength={25}
                                    className="w-full px-2.5 py-1.5 font-mono uppercase bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                                  />
                                </div>
                              </>
                            );
                          })()}

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                              <span>Modelo</span>
                              <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={veiculo.modelo}
                              onChange={(e) =>
                                handleAtualizarVeiculo(index, "modelo", e.target.value)
                              }
                              placeholder="Ex: Hilux, Gol, Fan 160"
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">
                              Marca / Fabricante
                            </label>
                            <input
                              type="text"
                              value={veiculo.marca || ""}
                              onChange={(e) =>
                                handleAtualizarVeiculo(index, "marca", e.target.value)
                              }
                              placeholder="Ex: Toyota, VW, Honda"
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">Ano</label>
                            <input
                              type="text"
                              value={veiculo.ano || ""}
                              onChange={(e) => handleAtualizarVeiculo(index, "ano", e.target.value)}
                              placeholder="Ex: 2023"
                              maxLength={4}
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">Cor</label>
                            <input
                              type="text"
                              value={veiculo.cor || ""}
                              onChange={(e) => handleAtualizarVeiculo(index, "cor", e.target.value)}
                              placeholder="Ex: Prata, Preto, Branco"
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                          </div>

                          <div className="sm:col-span-3 space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">
                              Observações do Veículo (opcional)
                            </label>
                            <input
                              type="text"
                              value={veiculo.observacoes || ""}
                              onChange={(e) =>
                                handleAtualizarVeiculo(index, "observacoes", e.target.value)
                              }
                              placeholder="Ex: Veículo possui chave presencial ou corta-corrente"
                              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Informações Operacionais e Termos */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-300 font-bold text-[11px]">
                    <Info className="h-4 w-4 text-sky-400 shrink-0" />
                    <span>Sobre o Atendimento e Instalação:</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Ao enviar o cadastro, a administração do SIGO Guardião definirá as condições do
                    contrato e despachará ordens de serviço individuais para que os técnicos
                    instaladores credenciados realizem a instalação de cada rastreador com
                    segurança.
                  </p>
                </div>

                {/* Botão de Envio */}
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {enviando ? (
                    <>
                      <Clock className="h-4 w-4 animate-spin" />
                      <span>Enviando Dados Cadastrais...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>
                        Concluir e Enviar Cadastro ({veiculos.length}{" "}
                        {veiculos.length === 1 ? "veículo" : "veículos"})
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
