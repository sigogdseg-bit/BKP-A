import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck,
  LogOut,
  Fuel,
  Receipt,
  Wrench,
  Map,
  ChevronRight,
  Clock,
  AlertTriangle,
  Car,
  Navigation,
  RefreshCw,
  ArrowLeft,
  LayoutDashboard,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/context/AuthContext";
import { limparSessaoCacheada } from "@/features/auth/services/authService";
import { getMeuPerfilMotorista, listarMeusVeiculos } from "../services/motoristasService";
import type { PerfilMotorista, MotoristaVeiculo } from "../types";
import { AbastecimentoPanel } from "@/features/motoristas/components/painel/AbastecimentoPanel";
import { DespesaPanel } from "@/features/motoristas/components/painel/DespesaPanel";
import { ManutencaoPanel } from "@/features/motoristas/components/painel/ManutencaoPanel";
import { TrajetoInteligenteModal } from "@/features/monitor-gps/components/TrajetoInteligenteModal";
import { GpsMonitorView } from "@/features/monitor-gps/components/GpsMonitorView";
import { carregarVeiculosGps } from "@/features/monitor-gps/services/gpsService";
import type { VeiculoGps } from "@/features/monitor-gps/types";

type PainelAtivo = "inicio" | "abastecimento" | "despesa" | "manutencao" | "mapa";

// ============================================================================
// MotoristaPortal — Portal exclusivo do motorista (rota /motorista)
// Layout dedicado mobile-first com isolamento estrito por cliente.
// ============================================================================
export function MotoristaPortal() {
  const { logout, session } = useAuth();
  const isGestorOuCliente = Boolean(
    session?.isCliente || session?.isAdmin || session?.isSuperAdmin || session?.role === "operador",
  );
  const [perfil, setPerfil] = useState<PerfilMotorista | null>(null);
  const [veiculos, setVeiculos] = useState<MotoristaVeiculo[]>([]);
  const [veiculoAtivo, setVeiculoAtivo] = useState<MotoristaVeiculo | null>(null);
  const [veiculoGpsAtivo, setVeiculoGpsAtivo] = useState<VeiculoGps | null>(null);
  const [painel, setPainel] = useState<PainelAtivo>("inicio");
  const [modalTrajetoAberto, setModalTrajetoAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const handleLogout = useCallback(async () => {
    try {
      limparSessaoCacheada();
      if (typeof window !== "undefined") {
        localStorage.removeItem("hunter-auth-token-v1");
        localStorage.removeItem("hunter-cached-user-session-v1");
        localStorage.removeItem("hunter-supabase-token-backup-v1");
        sessionStorage.clear();
      }
      await Promise.race([logout(), new Promise((resolve) => setTimeout(resolve, 1200))]);
    } catch (e) {
      console.error(e);
    } finally {
      if (typeof window !== "undefined") {
        window.location.replace("/login");
      }
    }
  }, [logout]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      // Valida o token real no servidor Auth (evita usar token revogado preso no localStorage)
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        limparSessaoCacheada();
        if (typeof window !== "undefined") {
          localStorage.removeItem("hunter-auth-token-v1");
          localStorage.removeItem("hunter-cached-user-session-v1");
          localStorage.removeItem("hunter-supabase-token-backup-v1");
          sessionStorage.clear();
          window.location.replace("/login");
        }
        return;
      }

      const [p, vs] = await Promise.all([getMeuPerfilMotorista(), listarMeusVeiculos()]);
      setPerfil(p);
      setVeiculos(vs);
      if (vs.length === 1) {
        setVeiculoAtivo(vs[0]);
      }
    } catch (e: any) {
      const msg = e?.message || "Não foi possível carregar o perfil do motorista.";
      setErro(msg);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Suporte a abertura direta de painel via URL (ex: /motorista?painel=abastecimento)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("painel") as PainelAtivo;
      if (p && ["abastecimento", "despesa", "manutencao", "mapa"].includes(p)) {
        setPainel(p);
      }
    }
  }, []);

  // Carrega dados GPS completos do veículo ativo para uso no Trajeto Inteligente
  useEffect(() => {
    if (!veiculoAtivo) {
      setVeiculoGpsAtivo(null);
      return;
    }
    let ativo = true;
    carregarVeiculosGps()
      .then((lista) => {
        if (!ativo) return;
        const encontrado = lista.find((v) => v.id === veiculoAtivo.veiculo_id) || lista[0] || null;
        setVeiculoGpsAtivo(encontrado);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [veiculoAtivo]);

  // CNH vencida/a vencer
  const cnhVencida = perfil?.cnh_validade ? new Date(perfil.cnh_validade) < new Date() : false;
  const cnhAVencer = perfil?.cnh_validade
    ? !cnhVencida &&
      new Date(perfil.cnh_validade) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : false;

  if (carregando) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Truck className="h-10 w-10 text-blue-400 animate-bounce" />
          <p className="text-slate-400 text-sm">Carregando portal do motorista…</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-slate-200 font-semibold">Acesso negado</p>
          <p className="text-slate-400 text-sm">{erro}</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={carregar}
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Se múltiplos veículos e nenhum selecionado → tela de seleção
  if (!veiculoAtivo && veiculos.length > 1) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Truck className="h-10 w-10 text-blue-400 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-slate-100">Olá, {perfil?.nome.split(" ")[0]}!</h1>
            <p className="text-sm text-slate-400 mt-1">Selecione o veículo para esta operação:</p>
          </div>
          <div className="space-y-2">
            {veiculos.map((v) => (
              <button
                key={v.id}
                id={`btn-veiculo-${v.veiculo_id}`}
                onClick={() => setVeiculoAtivo(v)}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-800 border border-slate-700/60
                  hover:border-blue-500/40 hover:bg-slate-700/80 transition-colors text-left"
              >
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <Car className="h-5 w-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{v.veiculo_placa}</p>
                  {v.veiculo_modelo && (
                    <p className="text-xs text-slate-400">
                      {v.veiculo_modelo} {v.veiculo_cor ? `· ${v.veiculo_cor}` : ""}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-sm py-2
              text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    );
  }

  if (veiculos.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 text-center">
        <Car className="h-12 w-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-300 font-semibold">Nenhum veículo disponível</p>
        <p className="text-slate-500 text-sm mt-1">
          Não há veículos ativos cadastrados para o seu cliente no momento.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    );
  }

  // ── Portal principal ──
  return (
    <div id="motorista-portal" className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {/* Header */}
      <header className="bg-[#0f172a] border-b border-slate-700/40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-1.5">
            <Truck className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-200 leading-tight">{perfil?.cliente_nome}</p>
            <p className="text-[10px] text-slate-400">{perfil?.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isGestorOuCliente && (
            <Link
              to="/inicio"
              id="btn-voltar-ao-sistema"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 transition-colors"
              title="Voltar ao Painel Geral"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Voltar ao Sistema</span>
              <span className="sm:hidden">Sistema</span>
            </Link>
          )}
          {painel !== "inicio" && (
            <button
              id="btn-voltar-painel-header"
              type="button"
              onClick={() => setPainel("inicio")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors cursor-pointer"
              title="Voltar ao início"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Painel</span>
            </button>
          )}
          {veiculoAtivo && veiculos.length > 1 && (
            <button
              id="btn-trocar-veiculo"
              onClick={() => {
                setVeiculoAtivo(null);
                setPainel("inicio");
              }}
              className="text-xs px-2 py-1 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600/40 hover:bg-slate-700 transition-colors"
            >
              {veiculoAtivo.veiculo_placa} ↩
            </button>
          )}
          {veiculoAtivo && veiculos.length === 1 && (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold">
              {veiculoAtivo.veiculo_placa}
            </span>
          )}
          <button
            id="btn-logout-motorista"
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors cursor-pointer"
            title="Sair"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Alertas CNH inline */}
      {cnhVencida && (
        <div
          id="banner-cnh-vencida"
          className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300">
            Sua CNH está VENCIDA. Regularize antes de operar o veículo.
          </p>
        </div>
      )}
      {!cnhVencida && cnhAVencer && (
        <div
          id="banner-cnh-a-vencer"
          className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2"
        >
          <Clock className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Sua CNH vence em{" "}
            {Math.ceil(
              (new Date(perfil!.cnh_validade!).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )}{" "}
            dias. Providencie a renovação.
          </p>
        </div>
      )}

      {/* Corpo */}
      <main className={`flex-1 overflow-y-auto ${painel === "mapa" ? "p-0 flex flex-col" : "p-4"}`}>
        {painel === "inicio" && perfil && veiculoAtivo && (
          <InicioMotorista
            perfil={perfil}
            veiculo={veiculoAtivo}
            onNavegar={setPainel}
            onAbrirTrajeto={() => setModalTrajetoAberto(true)}
            temAcessoMapa={perfil.acesso_mapa}
          />
        )}
        {painel === "abastecimento" && perfil && veiculoAtivo && (
          <AbastecimentoPanel
            clienteId={perfil.cliente_id}
            motoristaId={perfil.id}
            veiculoId={veiculoAtivo.veiculo_id}
            veiculoPlaca={veiculoAtivo.veiculo_placa ?? ""}
            onVoltar={() => setPainel("inicio")}
          />
        )}
        {painel === "despesa" && perfil && veiculoAtivo && (
          <DespesaPanel
            clienteId={perfil.cliente_id}
            motoristaId={perfil.id}
            veiculoId={veiculoAtivo.veiculo_id}
            veiculoPlaca={veiculoAtivo.veiculo_placa ?? ""}
            onVoltar={() => setPainel("inicio")}
          />
        )}
        {painel === "manutencao" && perfil && veiculoAtivo && (
          <ManutencaoPanel
            clienteId={perfil.cliente_id}
            motoristaId={perfil.id}
            motoristaNome={perfil.nome}
            veiculoId={veiculoAtivo.veiculo_id}
            veiculoPlaca={veiculoAtivo.veiculo_placa ?? ""}
            onVoltar={() => setPainel("inicio")}
          />
        )}
        {painel === "mapa" && perfil?.acesso_mapa && (
          <div className="flex-1 h-[calc(100dvh-7.5rem)] min-h-[450px] flex flex-col relative overflow-hidden">
            {/* Botão flutuante de alta visibilidade para sair do mapa instantaneamente */}
            <button
              id="btn-voltar-flutuante-mapa"
              type="button"
              onClick={() => setPainel("inicio")}
              className="absolute top-2 left-2 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white text-xs font-bold border border-slate-700 shadow-2xl backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              title="Voltar ao Painel do Motorista"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-blue-400" />
              <span>Voltar ao Portal</span>
            </button>

            <GpsMonitorView
              onVoltar={() => setPainel("inicio")}
              voltarLabel="Voltar ao Portal"
              alturaCustomizada="h-full rounded-none border-0"
            />
          </div>
        )}
      </main>

      {/* Modal de Trajeto Inteligente */}
      {modalTrajetoAberto && (
        <TrajetoInteligenteModal
          veiculo={veiculoGpsAtivo}
          onFechar={() => setModalTrajetoAberto(false)}
        />
      )}

      {/* Barra de navegação inferior permanente (mobile-first, sticky com z-50) */}
      <nav
        id="nav-motorista-bottom"
        className="bg-[#0f172a] border-t border-slate-700/40 px-2 py-2 flex items-center justify-around z-50 shrink-0 sticky bottom-0"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <NavBtn
          icon={<Truck className="h-5 w-5" />}
          label="Início"
          onClick={() => setPainel("inicio")}
          id="nav-inicio"
          ativo={painel === "inicio"}
        />
        <NavBtn
          icon={<Fuel className="h-5 w-5" />}
          label="Abastecer"
          onClick={() => setPainel("abastecimento")}
          id="nav-abastecimento"
          ativo={painel === "abastecimento"}
        />
        <NavBtn
          icon={<Receipt className="h-5 w-5" />}
          label="Despesas"
          onClick={() => setPainel("despesa")}
          id="nav-despesas"
          ativo={painel === "despesa"}
        />
        <NavBtn
          icon={<Wrench className="h-5 w-5" />}
          label="Manutenção"
          onClick={() => setPainel("manutencao")}
          id="nav-manutencao"
          ativo={painel === "manutencao"}
        />
        <NavBtn
          icon={<Navigation className="h-5 w-5" />}
          label="Trajeto"
          onClick={() => setModalTrajetoAberto(true)}
          id="nav-trajeto"
          ativo={modalTrajetoAberto}
        />
        {perfil?.acesso_mapa && (
          <NavBtn
            icon={<Map className="h-5 w-5" />}
            label="Mapa"
            onClick={() => setPainel("mapa")}
            id="nav-mapa"
            ativo={painel === "mapa"}
          />
        )}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tela de Início do Motorista
// ---------------------------------------------------------------------------
function InicioMotorista({
  perfil,
  veiculo,
  onNavegar,
  onAbrirTrajeto,
  temAcessoMapa,
}: {
  perfil: PerfilMotorista;
  veiculo: MotoristaVeiculo;
  onNavegar: (p: PainelAtivo) => void;
  onAbrirTrajeto: () => void;
  temAcessoMapa: boolean;
}) {
  const agora = new Date();
  const hora = agora.getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const acoes: {
    id: string;
    label: string;
    desc: string;
    icon: React.ReactNode;
    cor: string;
    onClick: () => void;
    visivel: boolean;
  }[] = [
    {
      id: "acao-abastecimento",
      label: "Registrar Abastecimento",
      desc: "Foto da NF ou preenchimento manual",
      icon: <Fuel className="h-6 w-6" />,
      cor: "text-orange-400 bg-orange-500/10",
      onClick: () => onNavegar("abastecimento"),
      visivel: true,
    },
    {
      id: "acao-despesa",
      label: "Registrar Despesa",
      desc: "Foto da NF de gastos, pedágio, estacionamento…",
      icon: <Receipt className="h-6 w-6" />,
      cor: "text-blue-400 bg-blue-500/10",
      onClick: () => onNavegar("despesa"),
      visivel: true,
    },
    {
      id: "acao-manutencao",
      label: "Manutenção Preventiva e Revisões",
      desc: "Registrar troca de óleo, revisões e atualizar alertas",
      icon: <Wrench className="h-6 w-6" />,
      cor: "text-amber-400 bg-amber-500/10",
      onClick: () => onNavegar("manutencao"),
      visivel: true,
    },
    {
      id: "acao-trajeto",
      label: "Trajeto Inteligente",
      desc: "Planejamento de rotas, paradas e navegação otimizada",
      icon: <Navigation className="h-6 w-6" />,
      cor: "text-orange-400 bg-orange-500/10",
      onClick: onAbrirTrajeto,
      visivel: true,
    },
    {
      id: "acao-mapa",
      label: "Mapa Operacional com Cockpit",
      desc: "Telemetria e rastreamento em tempo real",
      icon: <Map className="h-6 w-6" />,
      cor: "text-purple-400 bg-purple-500/10",
      onClick: () => onNavegar("mapa"),
      visivel: temAcessoMapa,
    },
  ];

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Saudação */}
      <div>
        <h2 className="text-xl font-bold text-slate-100">
          {saudacao}, {perfil.nome.split(" ")[0]}!
        </h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
          <Car className="h-4 w-4 text-blue-400" />
          <span>
            Veículo: <strong className="text-slate-200">{veiculo.veiculo_placa}</strong>
          </span>
          {veiculo.veiculo_modelo && (
            <span className="text-slate-500">· {veiculo.veiculo_modelo}</span>
          )}
        </div>
      </div>

      {/* Cards de ação */}
      <div className="space-y-3">
        {acoes
          .filter((a) => a.visivel)
          .map((a) => (
            <button
              key={a.id}
              id={a.id}
              onClick={a.onClick}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-800/60 border border-slate-700/40
              hover:border-slate-600/60 hover:bg-slate-800 active:scale-[0.98] transition-all text-left"
            >
              <div className={`rounded-xl p-3 ${a.cor}`}>{a.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-200">{a.label}</p>
                <p className="text-xs text-slate-400">{a.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
            </button>
          ))}
      </div>

      {/* Perfil resumido */}
      <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-4 space-y-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {perfil.cnh_numero ? "Seu perfil" : "Gestor / Titular do Veículo"}
        </p>
        <p className="text-sm text-slate-200">{perfil.nome}</p>
        <p className="text-xs text-slate-500">{perfil.email}</p>
        {perfil.cnh_numero ? (
          <p className="text-xs text-slate-500">
            CNH {perfil.cnh_numero} · Cat. {perfil.cnh_categoria}
            {perfil.cnh_validade && (
              <>
                {" "}
                · Válida até{" "}
                {new Date(perfil.cnh_validade + "T00:00:00").toLocaleDateString("pt-BR")}
              </>
            )}
          </p>
        ) : (
          <p className="text-xs text-orange-400 font-medium pt-0.5">
            Acesso com permissão total para abastecimento, despesas e manutenções.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavBtn — botão da barra inferior com estado ativo
// ---------------------------------------------------------------------------
function NavBtn({
  icon,
  label,
  onClick,
  id,
  ativo = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  id: string;
  ativo?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl transition-colors cursor-pointer ${
        ativo
          ? "text-blue-400 bg-blue-500/10"
          : "text-slate-500 hover:text-blue-400 hover:bg-slate-700/40"
      }`}
    >
      {icon}
      <span className="text-[10px] leading-none font-semibold">{label}</span>
    </button>
  );
}
