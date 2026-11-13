// ─────────────────────────────────────────────────────────────────────────────
// SIGO Guardião — Listagem de Instaladores Credenciados
// Visualização tática para Revendedor, Vendedor, Operador e Administrador
// Exibe Nome, Telefone (com 1 toque WhatsApp e chamada) e Endereço de Atendimento
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  Search,
  Phone,
  MapPin,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatarTelefone } from "@/shared/utils/mascaras";
import { TiltCard } from "@/shared/components/TiltCard";

export interface InstaladorCredenciadoItem {
  id: string;
  nome: string;
  telefone: string | null;
  endereco: string | null;
  email?: string | null;
  chave_pix?: string | null;
}

export function TabelaInstaladoresCredenciados() {
  const [instaladores, setInstaladores] = useState<InstaladorCredenciadoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");

  const carregarInstaladores = async () => {
    setCarregando(true);
    try {
      // 1. Busca em profiles (role = instalador e ativo = true)
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, nome, telefone, email, endereco_instalacao, chave_pix")
        .eq("role", "instalador")
        .eq("ativo", true)
        .order("nome", { ascending: true });

      const listaMapeada: InstaladorCredenciadoItem[] = [];

      if (Array.isArray(profilesData) && profilesData.length > 0) {
        for (const p of profilesData) {
          listaMapeada.push({
            id: p.id,
            nome: p.nome || "Instalador Credenciado",
            telefone: p.telefone || null,
            endereco: p.endereco_instalacao || null,
            email: p.email || null,
            chave_pix: p.chave_pix || null,
          });
        }
      } else {
        // Fallback resiliente para tabela instaladores caso profiles não tenha registros
        try {
          const { data: legData } = await supabase
            .from("instaladores" as any)
            .select("id, nome, telefone, celular, endereco, cidade, estado")
            .eq("ativo", true)
            .order("nome", { ascending: true });

          if (Array.isArray(legData)) {
            for (const l of legData as any[]) {
              const fone = l.telefone || l.celular || null;
              const end =
                l.endereco ||
                (l.cidade && l.estado ? `${l.cidade} - ${l.estado}` : l.cidade || null);
              listaMapeada.push({
                id: l.id,
                nome: l.nome || "Instalador Credenciado",
                telefone: fone,
                endereco: end,
              });
            }
          }
        } catch {
          // Silencioso
        }
      }

      setInstaladores(listaMapeada);
    } catch (err) {
      console.warn("Aviso ao carregar instaladores credenciados:", err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarInstaladores();
  }, []);

  const instaladoresFiltrados = useMemo(() => {
    const termo = termoBusca.trim().toLowerCase();
    if (!termo) return instaladores;
    return instaladores.filter((inst) => {
      const nomeMatch = inst.nome.toLowerCase().includes(termo);
      const telMatch = (inst.telefone || "").replace(/\D/g, "").includes(termo.replace(/\D/g, ""));
      const endMatch = (inst.endereco || "").toLowerCase().includes(termo);
      return nomeMatch || telMatch || endMatch;
    });
  }, [instaladores, termoBusca]);

  const abrirWhatsapp = (telefone: string, nome: string) => {
    const limpo = telefone.replace(/\D/g, "");
    const foneFinal = limpo.startsWith("55") ? limpo : `55${limpo}`;
    const texto = encodeURIComponent(
      `Olá, ${nome}! Sou parceiro credenciado do SIGO Guardião e gostaria de alinhar um agendamento de instalação veicular.`,
    );
    window.open(`https://wa.me/${foneFinal}?text=${texto}`, "_blank", "noopener,noreferrer");
  };

  const abrirMapa = (endereco: string) => {
    const query = encodeURIComponent(endereco);
    window.open(`https://maps.google.com/?q=${query}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      {/* Barra de Topo com Busca e Atualização */}
      <div className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-4 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Instaladores Credenciados
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold">
                  {instaladores.length} ativos
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Rede de técnicos e oficinas autorizadas para agendamentos e instalações presenciais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Buscar por nome, telefone ou cidade..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
            <button
              type="button"
              onClick={carregarInstaladores}
              title="Atualizar lista de instaladores"
              className="p-2 rounded-xl bg-white/80 dark:bg-slate-950 border border-slate-300/60 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition cursor-pointer active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Instaladores */}
      {carregando ? (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-[#eaf0f8]/60 dark:bg-slate-900/40 rounded-2xl border border-slate-300/60 dark:border-slate-800">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
          <span>Carregando instaladores credenciados...</span>
        </div>
      ) : instaladoresFiltrados.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-[#eaf0f8]/60 dark:bg-slate-900/40 rounded-2xl border border-slate-300/60 dark:border-slate-800">
          <Wrench className="h-8 w-8 mx-auto mb-2 text-slate-400 opacity-60" />
          <p className="font-bold text-slate-700 dark:text-slate-300">
            Nenhum instalador encontrado
          </p>
          <p className="mt-1 text-[11px]">
            {termoBusca
              ? "Tente ajustar os termos da pesquisa."
              : "Nenhum instalador credenciado cadastrado no momento."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {instaladoresFiltrados.map((inst) => {
            const temTel = Boolean(inst.telefone && inst.telefone.trim());
            const temEnd = Boolean(inst.endereco && inst.endereco.trim());

            return (
              <TiltCard
                key={inst.id}
                maxTilt={3}
                spotlightColor="rgba(245, 158, 11, 0.2)"
                className="bg-[#eaf0f8] dark:bg-slate-900/80 rounded-2xl border border-slate-300/60 dark:border-slate-800 p-4 shadow-[4px_4px_10px_#c3cfe2] dark:shadow-xl flex flex-col justify-between gap-3 hover:border-amber-500/40 transition"
              >
                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center shrink-0 border border-amber-500/30 text-xs">
                        {inst.nome
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {inst.nome}
                        </h4>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <ShieldCheck className="h-3 w-3" />
                          Credenciado Ativo
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes de Telefone e Endereço */}
                  <div className="mt-3.5 space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                      <Phone className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">
                          Telefone / WhatsApp
                        </span>
                        {temTel ? (
                          <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                            {formatarTelefone(inst.telefone!)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Não informado</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">
                          Endereço / Local de Atendimento
                        </span>
                        {temEnd ? (
                          <p className="text-slate-800 dark:text-slate-200 text-[11px] leading-snug line-clamp-2">
                            {inst.endereco}
                          </p>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            A combinar com o instalador
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ações de 1 Toque */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2">
                  {temTel && (
                    <>
                      <button
                        type="button"
                        onClick={() => abrirWhatsapp(inst.telefone!, inst.nome)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-xs active:scale-95 cursor-pointer"
                        title="Iniciar conversa no WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      <a
                        href={`tel:${inst.telefone!.replace(/\D/g, "")}`}
                        className="flex items-center justify-center p-2 rounded-xl text-xs font-bold bg-slate-200/70 hover:bg-slate-300/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition shadow-xs active:scale-95"
                        title="Ligar para o instalador"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}

                  {temEnd && (
                    <button
                      type="button"
                      onClick={() => abrirMapa(inst.endereco!)}
                      className="flex items-center justify-center p-2 rounded-xl text-xs font-bold bg-slate-200/70 hover:bg-slate-300/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition shadow-xs active:scale-95 cursor-pointer"
                      title="Abrir endereço no Google Maps"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </TiltCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
