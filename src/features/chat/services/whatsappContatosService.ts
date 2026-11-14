// whatsappContatosService.ts — GD Rastreamento
// Carregamento unificado e resiliente de contatos (Clientes, Motoristas, Instaladores e Usuários)
// para disparo ágil de mensagens via WhatsApp Gateway

import { supabase } from "@/integrations/supabase/client";
import { normalizarTelefoneParaWhatsapp } from "@/shared/lib/chatbotxBridge";
import type { UserSession } from "@/features/auth/types";

export interface ContatoWhatsappItem {
  id: string;
  nome: string;
  telefone: string;
  telefoneFormatado: string;
  tipo: "cliente" | "motorista" | "instalador" | "usuario" | "vendedor" | "revendedor";
  tipoRotulo: string;
  documento?: string | null;
  email?: string | null;
  veiculos?: string[];
  detalheExtra?: string | null;
  valorMensalidade?: number | null;
  diaVencimento?: number | null;
  statusCliente?: string | null;
  temVeiculoAtivo?: boolean;
}

/**
 * Formata número de telefone para padrão legível brasileiro (ex: (24) 99250-1512)
 */
export function formatarTelefoneVisual(telefone: string): string {
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos) return telefone;

  // Remove DDI 55 inicial se presente para formatação local
  let local = digitos;
  if (local.startsWith("55") && local.length >= 12) {
    local = local.substring(2);
  }

  if (local.length === 11) {
    return `(${local.substring(0, 2)}) ${local.substring(2, 7)}-${local.substring(7)}`;
  }
  if (local.length === 10) {
    return `(${local.substring(0, 2)}) ${local.substring(2, 6)}-${local.substring(6)}`;
  }
  return telefone;
}

/**
 * Carrega a lista consolidada de contatos telefônicos a partir do banco de dados,
 * aplicando isolamento estrito para Revendedores e Vendedores:
 * - Revendedor: estritamente seus vendedores e clientes diretos/indiretos.
 * - Vendedor: estritamente seus clientes diretos.
 */
export async function carregarContatosParaWhatsapp(
  session?: UserSession | null,
): Promise<ContatoWhatsappItem[]> {
  const contatosMap = new Map<string, ContatoWhatsappItem>();

  // ─────────────────────────────────────────────────────────────────────────
  // CENÁRIO 1: Isolamento do Perfil Revendedor
  // ─────────────────────────────────────────────────────────────────────────
  if (session?.isRevendedor) {
    let revId = session.revendedorId;
    if (!revId && session.userId) {
      const { data: revData } = await supabase
        .from("revendedores")
        .select("id")
        .eq("user_id", session.userId)
        .maybeSingle();
      revId = revData?.id;
    }

    if (!revId) return [];

    try {
      // 1. Carrega os vendedores vinculados a este revendedor
      const { data: vendsData } = await supabase
        .from("vendedores")
        .select("id, nome, telefone, email, documento")
        .eq("revendedor_id", revId)
        .eq("ativo", true)
        .order("nome", { ascending: true });

      if (Array.isArray(vendsData)) {
        for (const vend of vendsData) {
          if (!vend.telefone?.trim()) continue;
          const foneLimpo = normalizarTelefoneParaWhatsapp(vend.telefone);
          if (!foneLimpo || foneLimpo.length < 10) continue;

          const chave = `${foneLimpo}_vendedor_${vend.id}`;
          contatosMap.set(chave, {
            id: vend.id,
            nome: vend.nome || "Vendedor",
            telefone: foneLimpo,
            telefoneFormatado: formatarTelefoneVisual(vend.telefone),
            tipo: "vendedor",
            tipoRotulo: "Vendedor da Franquia",
            documento: vend.documento || null,
            email: vend.email || null,
            detalheExtra: "Equipe de Vendas da sua Franquia",
          });
        }
      }

      // 2. Carrega clientes vinculados direta ou indiretamente ao revendedor
      const { data: clisData } = await supabase
        .from("clientes")
        .select(
          "id, nome_razao_social, status, telefone, documento, email, vendedor_id, valor_mensalidade, dia_vencimento, veiculos(placa, marca_modelo, ativo)",
        )
        .eq("revendedor_id", revId)
        .order("nome_razao_social", { ascending: true });

      if (Array.isArray(clisData)) {
        for (const cli of clisData) {
          if (!cli.telefone?.trim()) continue;
          const foneLimpo = normalizarTelefoneParaWhatsapp(cli.telefone);
          if (!foneLimpo || foneLimpo.length < 10) continue;

          const placas: string[] = [];
          let temVeiculoAtivo = false;
          if (Array.isArray(cli.veiculos)) {
            for (const v of cli.veiculos) {
              if (v?.placa) placas.push(v.placa);
              if (v?.ativo === true) temVeiculoAtivo = true;
            }
          }

          const chave = `${foneLimpo}_cliente_${cli.id}`;
          contatosMap.set(chave, {
            id: cli.id,
            nome: cli.nome_razao_social || "Cliente",
            telefone: foneLimpo,
            telefoneFormatado: formatarTelefoneVisual(cli.telefone),
            tipo: "cliente",
            tipoRotulo: cli.vendedor_id ? "Cliente via Vendedor" : "Cliente Direto da Franquia",
            documento: cli.documento || null,
            email: cli.email || null,
            veiculos: placas,
            detalheExtra:
              placas.length > 0 ? `Veículos: ${placas.join(", ")}` : "Cliente sem veículo",
            valorMensalidade:
              (cli as any).valor_mensalidade !== null &&
              (cli as any).valor_mensalidade !== undefined
                ? Number((cli as any).valor_mensalidade)
                : null,
            diaVencimento:
              (cli as any).dia_vencimento !== null && (cli as any).dia_vencimento !== undefined
                ? Number((cli as any).dia_vencimento)
                : null,
            statusCliente: cli.status || null,
            temVeiculoAtivo,
          });
        }
      }

      // 3. Carrega instaladores ativos para suporte operacional da franquia
      let instData: any[] | null = null;
      try {
        const { data: instProfiles } = await supabase
          .from("profiles")
          .select("id, nome, telefone, email")
          .eq("role", "instalador")
          .eq("ativo", true)
          .order("nome", { ascending: true });
        if (Array.isArray(instProfiles) && instProfiles.length > 0) {
          instData = instProfiles;
        } else {
          const { data: instLegado } = await supabase
            .from("instaladores")
            .select("id, nome, telefone, celular, cidade, estado")
            .eq("ativo", true);
          instData = instLegado;
        }
      } catch {
        // Silencioso
      }

      if (Array.isArray(instData)) {
        for (const inst of instData) {
          const tel = inst.telefone?.trim() || inst.celular?.trim();
          if (!tel) continue;
          const foneLimpo = normalizarTelefoneParaWhatsapp(tel);
          if (!foneLimpo || foneLimpo.length < 10) continue;

          const chave = `${foneLimpo}_instalador_${inst.id}`;
          contatosMap.set(chave, {
            id: inst.id,
            nome: inst.nome || "Instalador",
            telefone: foneLimpo,
            telefoneFormatado: formatarTelefoneVisual(tel),
            tipo: "instalador",
            tipoRotulo: "Instalador Credenciado",
            email: inst.email || null,
            detalheExtra:
              inst.cidade && inst.estado
                ? `Técnico credenciado (${inst.cidade}/${inst.estado})`
                : "Técnico credenciado",
          });
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar contatos do revendedor para WhatsApp:", err);
    }

    const lista = Array.from(contatosMap.values());
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CENÁRIO 2: Isolamento do Perfil Vendedor
  // ─────────────────────────────────────────────────────────────────────────
  if (session?.isVendedor) {
    let vendId = session.vendedorId;
    if (!vendId && session.userId) {
      const { data: vendData } = await supabase
        .from("vendedores")
        .select("id")
        .eq("user_id", session.userId)
        .maybeSingle();
      vendId = vendData?.id;
    }

    if (!vendId) return [];

    try {
      // Carrega estritamente os clientes diretos vinculados ao vendedor
      const { data: clisData } = await supabase
        .from("clientes")
        .select(
          "id, nome_razao_social, status, telefone, documento, email, valor_mensalidade, dia_vencimento, veiculos(placa, marca_modelo, ativo)",
        )
        .eq("vendedor_id", vendId)
        .order("nome_razao_social", { ascending: true });

      if (Array.isArray(clisData)) {
        for (const cli of clisData) {
          if (!cli.telefone?.trim()) continue;
          const foneLimpo = normalizarTelefoneParaWhatsapp(cli.telefone);
          if (!foneLimpo || foneLimpo.length < 10) continue;

          const placas: string[] = [];
          let temVeiculoAtivo = false;
          if (Array.isArray(cli.veiculos)) {
            for (const v of cli.veiculos) {
              if (v?.placa) placas.push(v.placa);
              if (v?.ativo === true) temVeiculoAtivo = true;
            }
          }

          const chave = `${foneLimpo}_cliente_${cli.id}`;
          contatosMap.set(chave, {
            id: cli.id,
            nome: cli.nome_razao_social || "Cliente",
            telefone: foneLimpo,
            telefoneFormatado: formatarTelefoneVisual(cli.telefone),
            tipo: "cliente",
            tipoRotulo: "Cliente Direto",
            documento: cli.documento || null,
            email: cli.email || null,
            veiculos: placas,
            detalheExtra:
              placas.length > 0 ? `Veículos: ${placas.join(", ")}` : "Cliente sem veículo",
            valorMensalidade:
              (cli as any).valor_mensalidade !== null &&
              (cli as any).valor_mensalidade !== undefined
                ? Number((cli as any).valor_mensalidade)
                : null,
            diaVencimento:
              (cli as any).dia_vencimento !== null && (cli as any).dia_vencimento !== undefined
                ? Number((cli as any).dia_vencimento)
                : null,
            statusCliente: cli.status || null,
            temVeiculoAtivo,
          });
        }
      }

      // 2. Carrega instaladores credenciados (vendedor pode contatar instalador para agendar e acompanhar clientes)
      let instData: any[] | null = null;
      try {
        const { data: instProfiles } = await supabase
          .from("profiles")
          .select("id, nome, telefone, email")
          .eq("role", "instalador")
          .eq("ativo", true)
          .order("nome", { ascending: true });
        if (Array.isArray(instProfiles) && instProfiles.length > 0) {
          instData = instProfiles;
        } else {
          const { data: instLegado } = await supabase
            .from("instaladores")
            .select("id, nome, telefone, celular, cidade, estado")
            .eq("ativo", true);
          instData = instLegado;
        }
      } catch {
        // Silencioso
      }

      if (Array.isArray(instData)) {
        for (const inst of instData) {
          const tel = inst.telefone?.trim() || inst.celular?.trim();
          if (!tel) continue;
          const foneLimpo = normalizarTelefoneParaWhatsapp(tel);
          if (!foneLimpo || foneLimpo.length < 10) continue;

          const chave = `${foneLimpo}_instalador_${inst.id}`;
          contatosMap.set(chave, {
            id: inst.id,
            nome: inst.nome || "Instalador",
            telefone: foneLimpo,
            telefoneFormatado: formatarTelefoneVisual(tel),
            tipo: "instalador",
            tipoRotulo: "Instalador Credenciado",
            email: inst.email || null,
            detalheExtra:
              inst.cidade && inst.estado
                ? `Técnico credenciado (${inst.cidade}/${inst.estado})`
                : "Técnico credenciado",
          });
        }
      }

      // 3. Carrega o Revendedor (Franquia) vinculado ao vendedor
      const rId = session?.revendedorId;
      if (rId) {
        const { data: revData } = await supabase
          .from("revendedores")
          .select("id, nome, telefone, email")
          .eq("id", rId)
          .maybeSingle();

        if (revData && revData.telefone?.trim()) {
          const foneLimpo = normalizarTelefoneParaWhatsapp(revData.telefone);
          if (foneLimpo && foneLimpo.length >= 10) {
            const chave = `${foneLimpo}_revendedor_${revData.id}`;
            contatosMap.set(chave, {
              id: revData.id,
              nome: revData.nome || "Franquia",
              telefone: foneLimpo,
              telefoneFormatado: formatarTelefoneVisual(revData.telefone),
              tipo: "revendedor",
              tipoRotulo: "Sua Franquia",
              email: revData.email || null,
              detalheExtra: "Franquia Vinculada",
            });
          }
        }
      }
    } catch (err) {
      console.warn("Aviso ao carregar clientes do vendedor para WhatsApp:", err);
    }

    const lista = Array.from(contatosMap.values());
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CENÁRIO 3: Perfis Operacionais Globais (SuperADM, Adm e Operador)
  // ─────────────────────────────────────────────────────────────────────────
  try {
    // 1. Carrega Clientes e seus Veículos vinculados
    const { data: clientesData, error: errCli } = await supabase
      .from("clientes")
      .select(
        "id, nome_razao_social, status, telefone, documento, email, valor_mensalidade, dia_vencimento, veiculos(placa, marca_modelo, ativo)",
      )
      .order("nome_razao_social", { ascending: true });

    if (!errCli && Array.isArray(clientesData)) {
      for (const cli of clientesData) {
        if (!cli.telefone || !cli.telefone.trim()) continue;

        const foneLimpo = normalizarTelefoneParaWhatsapp(cli.telefone);
        if (!foneLimpo || foneLimpo.length < 10) continue;

        const placas: string[] = [];
        let temVeiculoAtivo = false;
        if (Array.isArray(cli.veiculos)) {
          for (const v of cli.veiculos) {
            if (v?.placa) placas.push(v.placa);
            if (v?.ativo === true) temVeiculoAtivo = true;
          }
        }

        const chave = `${foneLimpo}_cliente_${cli.id}`;
        contatosMap.set(chave, {
          id: cli.id,
          nome: cli.nome_razao_social || "Cliente",
          telefone: foneLimpo,
          telefoneFormatado: formatarTelefoneVisual(cli.telefone),
          tipo: "cliente",
          tipoRotulo: "Cliente Titular",
          documento: cli.documento || null,
          email: cli.email || null,
          veiculos: placas,
          detalheExtra:
            placas.length > 0 ? `Veículos: ${placas.join(", ")}` : "Cliente sem veículo",
          valorMensalidade:
            (cli as any).valor_mensalidade !== null && (cli as any).valor_mensalidade !== undefined
              ? Number((cli as any).valor_mensalidade)
              : null,
          diaVencimento:
            (cli as any).dia_vencimento !== null && (cli as any).dia_vencimento !== undefined
              ? Number((cli as any).dia_vencimento)
              : null,
          statusCliente: cli.status || null,
          temVeiculoAtivo,
        });
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar clientes para WhatsApp:", err);
  }

  try {
    // 2. Carrega Motoristas
    const { data: motoristasData, error: errMot } = await supabase
      .from("motoristas")
      .select("id, nome, telefone, cpf, email, clientes:cliente_id(nome_razao_social)")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (!errMot && Array.isArray(motoristasData)) {
      for (const mot of motoristasData) {
        if (!mot.telefone || !mot.telefone.trim()) continue;

        const foneLimpo = normalizarTelefoneParaWhatsapp(mot.telefone);
        if (!foneLimpo || foneLimpo.length < 10) continue;

        const cliNome = (mot.clientes as any)?.nome_razao_social || null;
        const chave = `${foneLimpo}_motorista_${mot.id}`;

        contatosMap.set(chave, {
          id: mot.id,
          nome: mot.nome || "Motorista",
          telefone: foneLimpo,
          telefoneFormatado: formatarTelefoneVisual(mot.telefone),
          tipo: "motorista",
          tipoRotulo: "Motorista",
          documento: mot.cpf || null,
          email: mot.email || null,
          detalheExtra: cliNome ? `Frota: ${cliNome}` : "Motorista credenciado",
        });
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar motoristas para WhatsApp:", err);
  }

  try {
    // 3. Carrega Revendedores (Franquias)
    const { data: revendedoresData } = await supabase
      .from("revendedores")
      .select("id, nome, email, telefone, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (Array.isArray(revendedoresData)) {
      for (const rev of revendedoresData) {
        if (!rev.telefone || !rev.telefone.trim()) continue;

        const foneLimpo = normalizarTelefoneParaWhatsapp(rev.telefone);
        if (!foneLimpo || foneLimpo.length < 10) continue;

        const chave = `${foneLimpo}_revendedor_${rev.id}`;
        contatosMap.set(chave, {
          id: rev.id,
          nome: rev.nome || "Revendedor / Franquia",
          telefone: foneLimpo,
          telefoneFormatado: formatarTelefoneVisual(rev.telefone),
          tipo: "revendedor",
          tipoRotulo: "Franquia / Revendedor",
          email: rev.email || null,
          detalheExtra: "Franquia Parceira GD Rastreamento",
        });
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar revendedores para WhatsApp:", err);
  }

  try {
    // 4. Carrega Vendedores de todas as franquias
    const { data: vendedoresData } = await supabase
      .from("vendedores")
      .select("id, nome, email, telefone, documento, revendedor_id, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (Array.isArray(vendedoresData)) {
      for (const vend of vendedoresData) {
        if (!vend.telefone || !vend.telefone.trim()) continue;

        const foneLimpo = normalizarTelefoneParaWhatsapp(vend.telefone);
        if (!foneLimpo || foneLimpo.length < 10) continue;

        const chave = `${foneLimpo}_vendedor_${vend.id}`;
        contatosMap.set(chave, {
          id: vend.id,
          nome: vend.nome || "Vendedor",
          telefone: foneLimpo,
          telefoneFormatado: formatarTelefoneVisual(vend.telefone),
          tipo: "vendedor",
          tipoRotulo: "Vendedor de Franquia",
          documento: vend.documento || null,
          email: vend.email || null,
          detalheExtra: "Equipe Comercial de Franquia",
        });
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar vendedores para WhatsApp:", err);
  }

  try {
    // 5. Carrega Perfis (Instaladores, Operadores e Administradores)
    const { data: perfisData, error: errPerfis } = await supabase
      .from("profiles")
      .select("id, nome, email, role, telefone")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (!errPerfis && Array.isArray(perfisData)) {
      for (const p of perfisData) {
        if (!p.telefone || !p.telefone.trim()) continue;

        const foneLimpo = normalizarTelefoneParaWhatsapp(p.telefone);
        if (!foneLimpo || foneLimpo.length < 10) continue;

        const role = (p.role || "operador").toLowerCase();
        let tipo: "instalador" | "usuario" = "usuario";
        let tipoRotulo = "Operador Interno";

        if (role === "instalador") {
          tipo = "instalador";
          tipoRotulo = "Instalador Técnico";
        } else if (role === "superadmin" || role === "adm") {
          tipo = "usuario";
          tipoRotulo = "Administrador";
        }

        const chave = `${foneLimpo}_perfil_${p.id}`;
        if (!contatosMap.has(chave)) {
          contatosMap.set(chave, {
            id: p.id,
            nome: p.nome || "Usuário",
            telefone: foneLimpo,
            telefoneFormatado: formatarTelefoneVisual(p.telefone),
            tipo,
            tipoRotulo,
            email: p.email || null,
            detalheExtra: tipoRotulo,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Aviso ao carregar perfis para WhatsApp:", err);
  }

  // Converte Map para Array e ordena por Nome
  const lista = Array.from(contatosMap.values());
  lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return lista;
}

async function obterSupabaseConsulta() {
  if (typeof process !== "undefined" && typeof window === "undefined") {
    try {
      let supabaseUrl = process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL;
      let serviceRoleKey =
        process.env?.SUPABASE_SERVICE_ROLE_KEY ||
        process.env?.SUPABASE_SERVICE_KEY ||
        process.env?.SERVICE_ROLE_KEY;

      if ((!supabaseUrl || !serviceRoleKey) && typeof process !== "undefined") {
        const fs = (globalThis as any).process?.getBuiltinModule?.("fs");
        if (fs) {
          const cwd = process.cwd();
          for (const file of [".env.local", ".env.production"]) {
            const p = `${cwd}/${file}`;
            if (fs.existsSync(p)) {
              const raw = fs.readFileSync(p, "utf-8");
              for (const line of raw.split("\n")) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith("#")) {
                  const eqIdx = trimmed.indexOf("=");
                  if (eqIdx > 0) {
                    const k = trimmed.substring(0, eqIdx).trim();
                    const v = trimmed
                      .substring(eqIdx + 1)
                      .replace(/^["']|["']$/g, "")
                      .trim();
                    if ((k === "SUPABASE_URL" || k === "VITE_SUPABASE_URL") && !supabaseUrl)
                      supabaseUrl = v;
                    if (
                      (k === "SUPABASE_SERVICE_ROLE_KEY" ||
                        k === "SUPABASE_SERVICE_KEY" ||
                        k === "SERVICE_ROLE_KEY") &&
                      !serviceRoleKey
                    ) {
                      serviceRoleKey = v;
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (supabaseUrl && serviceRoleKey) {
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
    } catch {}
  }
  return supabase;
}

export interface DadosCobrancaClienteFactual {
  valor: number;
  dataVencimentoFormatada: string;
  diasRestantes: number;
  isento: boolean;
  temFaturaAberta: boolean;
  mensagemAviso?: string;
}

/**
 * Obtém os dados factuais de cobrança do cliente:
 * 1. Prioriza faturas reais em aberto na tabela `mensalidades` (status pendente, atrasado ou vencido).
 * 2. Em seguida, utiliza o `valor_mensalidade` e `dia_vencimento` cadastrados no cliente.
 * 3. Se o valor for <= 0 ou inexistente, marca como isento (zero invenção de dados).
 */
export async function obterDadosCobrancaClienteFactual(
  clienteId: string,
  valorMensalidadeCadastrada?: number | null,
  diaVencimentoCadastrado?: number | null,
  contextoExtra?: {
    statusCliente?: string | null;
    temVeiculoAtivo?: boolean;
  } | null,
): Promise<DadosCobrancaClienteFactual> {
  const hoje = new Date();
  const dbClient = await obterSupabaseConsulta();

  try {
    const { data: faturas, error } = await dbClient
      .from("mensalidades")
      .select("id, valor, data_vencimento, status")
      .eq("cliente_id", clienteId)
      .in("status", ["pendente", "atrasado", "vencido"])
      .order("data_vencimento", { ascending: true })
      .limit(1);

    if (!error && Array.isArray(faturas) && faturas.length > 0) {
      const fatura = faturas[0];
      const valFatura = Number(fatura.valor || 0);
      if (valFatura > 0 && fatura.data_vencimento) {
        const [anoF, mesF, diaF] = String(fatura.data_vencimento).split("-");
        const dataVencFmt = `${diaF}/${mesF}/${anoF}`;
        const dtVenc = new Date(Number(anoF), Number(mesF) - 1, Number(diaF));
        const diffMs =
          dtVenc.getTime() -
          new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
        const diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));

        return {
          valor: valFatura,
          dataVencimentoFormatada: dataVencFmt,
          diasRestantes,
          isento: false,
          temFaturaAberta: true,
        };
      }
    }
  } catch (err) {
    console.warn("Aviso ao buscar fatura em aberto do cliente:", err);
  }

  // Se não houver fatura em aberto com valor > 0, checa o cadastro do cliente e veículos ativos
  if (
    valorMensalidadeCadastrada !== null &&
    valorMensalidadeCadastrada !== undefined &&
    valorMensalidadeCadastrada > 0
  ) {
    // Regra Canônica Hunter-Guardian (Migração 20261016120000):
    // Débitos de mensalidade e cobrança só iniciam após a instalação e ativação do 1º veículo.
    let ehAguardando = contextoExtra?.statusCliente === "aguardando_instalacao";
    let temVeiculoAtivo = contextoExtra?.temVeiculoAtivo ?? false;

    try {
      const { data: cliData } = await dbClient
        .from("clientes")
        .select("status, veiculos(id, ativo)")
        .eq("id", clienteId)
        .maybeSingle();

      if (cliData) {
        const cliObj = cliData as any;
        ehAguardando = cliObj?.status === "aguardando_instalacao";
        const veiculos = Array.isArray(cliObj?.veiculos) ? cliObj.veiculos : [];
        temVeiculoAtivo = veiculos.some((v: any) => v.ativo === true);
      }
    } catch (errCheck) {
      console.warn("Aviso ao checar veículo ativo do cliente para cobrança:", errCheck);
    }

    if (ehAguardando || !temVeiculoAtivo) {
      return {
        valor: 0,
        dataVencimentoFormatada: "",
        diasRestantes: 0,
        isento: true,
        temFaturaAberta: false,
        mensagemAviso:
          "Este cliente está com status 'Aguardando Instalação' (sem veículo ativo). Pela regra do sistema, a cobrança de mensalidade só inicia após a ativação do primeiro veículo.",
      };
    }

    const diaVenc =
      diaVencimentoCadastrado && diaVencimentoCadastrado > 0 ? diaVencimentoCadastrado : 10;
    let mes = hoje.getMonth() + 1;
    let ano = hoje.getFullYear();
    // Se hoje já passou do dia de vencimento, aponta para o próximo mês
    if (hoje.getDate() > diaVenc) {
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    const dataVencFmt = `${String(diaVenc).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
    const dtVenc = new Date(ano, mes - 1, diaVenc);
    const diffMs =
      dtVenc.getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    const diasRestantes = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    return {
      valor: valorMensalidadeCadastrada,
      dataVencimentoFormatada: dataVencFmt,
      diasRestantes,
      isento: false,
      temFaturaAberta: false,
    };
  }

  // Cliente isento, cortesia ou sem valor a cobrar
  return {
    valor: 0,
    dataVencimentoFormatada: "",
    diasRestantes: 0,
    isento: true,
    temFaturaAberta: false,
    mensagemAviso:
      "Este cliente possui cadastro isento de mensalidade (R$ 0,00) e não possui faturas pendentes.",
  };
}
