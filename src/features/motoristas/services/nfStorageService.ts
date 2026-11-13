// ============================================================================
// MÓDULO MOTORISTAS — Serviço de Storage de NFs (bucket: nfs-temp)
// Ciclo de vida: upload → 24h → alerta ao cliente → ciência → +24h → delete
// Diretrizes: DJR-NEW · Anti-Polling · Zero Mock · Zero Binário no BD
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import type { NfPendenteAlerta, StatusNF } from "../types";
import { calcularStatusNF } from "../types";
import { enviarMensagemWhatsappOperador } from "@/shared/lib/chatbotxBridge";
import type { DocumentoWhatsappEnvio } from "@/shared/lib/chatbotxBridge";
import {
  resolverRegraEntregaAlerta,
  type ContatoAlertaConta,
} from "@/features/monitor-gps/constants/alertasCatalogo";

const BUCKET = "nfs-temp";
const VINTE_QUATRO_H_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Compressão de imagem antes do upload (canvas, 1280px, JPEG 82%)
// ---------------------------------------------------------------------------
async function comprimirImagem(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1280;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w > h) {
          h = Math.round((h * MAX) / w);
          w = MAX;
        } else {
          w = Math.round((w * MAX) / h);
          h = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao comprimir imagem"))),
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Upload de NF (imagem ou PDF)
// Retorna o path no Storage que será salvo no BD.
// ---------------------------------------------------------------------------
export async function uploadNF(
  clienteId: string,
  motoristaId: string,
  registroId: string,
  tipo: "abastecimento" | "despesa",
  file: File,
): Promise<{ path: string; uploadEm: string }> {
  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.name.toLowerCase().endsWith(".png")
        ? "png"
        : "jpg";

  const path = `${clienteId}/${tipo}/${registroId}_${Date.now()}.${ext}`;

  let blob: Blob = file;
  // Comprimir apenas imagens (não PDFs)
  if (file.type.startsWith("image/")) {
    blob = await comprimirImagem(file);
  }

  // 1. Tenta upload direto pelo cliente Supabase
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: file.type || "application/pdf",
      upsert: true,
    });
    if (!error) {
      return { path, uploadEm: new Date().toISOString() };
    }
    console.warn(
      "[nfStorageService] Upload direto retornou erro, acionando proxy seguro:",
      error.message,
    );
  } catch (directErr) {
    console.warn("[nfStorageService] Falha no upload direto, acionando proxy seguro:", directErr);
  }

  // 2. Fallback garantido: upload pelo proxy de servidor com Service Role (imune a RLS ou restrições de cliente)
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const res = await fetch("/api/upload-nf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        base64,
        contentType: file.type || "application/pdf",
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error || `Falha no upload do arquivo (${res.status})`);
    }

    const resJson = await res.json();
    return {
      path: resJson.path || path,
      uploadEm: resJson.uploadEm || new Date().toISOString(),
    };
  } catch (proxyErr: any) {
    throw new Error(`Erro ao enviar arquivo: ${proxyErr?.message || "Serviço indisponível"}`);
  }
}

// ---------------------------------------------------------------------------
// Gerar Signed URL para download (TTL: 60 minutos)
// ---------------------------------------------------------------------------
export async function gerarSignedUrl(path: string): Promise<string> {
  if (!path || typeof path !== "string") {
    throw new Error("Caminho do arquivo não informado.");
  }

  // Se já for URL absoluta (http/https), retorna diretamente
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Sanitiza o path removendo eventual prefixo do bucket ou barras iniciais
  const cleanPath = path.replace(/^\/+/, "").replace(new RegExp(`^${BUCKET}\\/`, "i"), "");

  // 1. Tenta gerar a URL assinada temporária pelo Supabase Storage
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(cleanPath, 3600); // 1 hora
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (err) {
    console.warn("[nfStorageService] Erro ao criar signedUrl, usando fallback:", err);
  }

  // 2. Fallback garantido: URL pública do bucket nfs-temp
  const { data: pubData } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
  if (pubData?.publicUrl) {
    return pubData.publicUrl;
  }

  throw new Error("Erro ao gerar link de download do comprovante.");
}

// ---------------------------------------------------------------------------
// Deletar arquivo do Storage (após download ou expiração)
// ---------------------------------------------------------------------------
export async function deletarArquivoStorage(path: string): Promise<void> {
  const cleanPath = path.replace(/^\/+/, "").replace(new RegExp(`^${BUCKET}\\/`, "i"), "");
  const { error } = await supabase.storage.from(BUCKET).remove([cleanPath]);
  if (error) console.warn("[nfStorageService] Aviso ao deletar arquivo:", error.message);
}

// ---------------------------------------------------------------------------
// Download da NF do Storage (Sem deleção)
// Apenas marca nf_baixado = true no BD.
// ---------------------------------------------------------------------------
export async function downloadNF(
  path: string,
  registroId: string,
  tipo: "abastecimento" | "despesa",
): Promise<void> {
  // 1. Gerar URL válida do comprovante
  const signedUrl = await gerarSignedUrl(path);
  const nomeArquivo = path.split("/").pop() ?? "comprovante.pdf";

  // 2. Disparar download de forma confiável (tenta fetch blob para forçar download local; fallback window.open)
  try {
    const resp = await fetch(signedUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = nomeArquivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } else {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    }
  } catch {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }

  // 3. Marcar como baixado no BD (mantendo o arquivo disponível no Storage)
  const tabela = tipo === "abastecimento" ? "motorista_abastecimentos" : "motorista_despesas";

  try {
    await supabase
      .from(tabela)
      .update({
        nf_baixado: true,
        nf_baixado_em: new Date().toISOString(),
      })
      .eq("id", registroId);
  } catch (dbErr) {
    console.warn("[nfStorageService] Aviso ao marcar nf_baixado:", dbErr);
  }
}

// ---------------------------------------------------------------------------
// Exclusão após confirmação (Deleção do Storage e do Banco)
// ---------------------------------------------------------------------------
export async function excluirNFAposConfirmacao(
  path: string,
  registroId: string,
  tipo: "abastecimento" | "despesa",
): Promise<void> {
  const tabela = tipo === "abastecimento" ? "motorista_abastecimentos" : "motorista_despesas";

  // 1. Anular url no BD
  await supabase.from(tabela).update({ nf_foto_url: null }).eq("id", registroId);

  // 2. Deletar fisicamente do Storage
  await deletarArquivoStorage(path);
}
// ---------------------------------------------------------------------------
// Registrar ciência do cliente (modal bloqueante "Estou ciente")
// Inicia o contador de +24h antes da deleção automática.
// ---------------------------------------------------------------------------
export async function registrarCienciaNF(
  registroId: string,
  tipo: "abastecimento" | "despesa",
): Promise<void> {
  const tabela = tipo === "abastecimento" ? "motorista_abastecimentos" : "motorista_despesas";

  const { error } = await supabase
    .from(tabela)
    .update({ nf_ciente_em: new Date().toISOString() })
    .eq("id", registroId);

  if (error) throw new Error(`Erro ao registrar ciência: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Lazy Cleanup — executado ao abrir o painel do cliente
// Deleta do Storage e marca nf_expirado = true para registros onde:
//   - nf_ciente_em < NOW() - 24h
//   - nf_expirado = false
// ---------------------------------------------------------------------------
export async function executarLazyCleanup(clienteId: string): Promise<void> {
  const limite = new Date(Date.now() - VINTE_QUATRO_H_MS).toISOString();

  for (const tabela of ["motorista_abastecimentos", "motorista_despesas"] as const) {
    const { data } = await supabase
      .from(tabela)
      .select("id, nf_foto_url")
      .eq("cliente_id", clienteId)
      .eq("nf_expirado", false)
      .eq("nf_baixado", false)
      .not("nf_ciente_em", "is", null)
      .lt("nf_ciente_em", limite);

    if (!data?.length) continue;

    for (const row of data) {
      // Deletar do Storage se path existir
      if (row.nf_foto_url) {
        await deletarArquivoStorage(row.nf_foto_url);
      }
      // Marcar como expirado no BD
      await supabase.from(tabela).update({ nf_expirado: true, nf_foto_url: null }).eq("id", row.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Buscar NFs pendentes que requerem ação do cliente (modal bloqueante)
// Retorna registros que passaram de 24h do upload e ainda não receberam ciência
// OU passaram de 24h da ciência (cleanup pendente mas ainda no Storage)
// ---------------------------------------------------------------------------
export async function buscarNfsPendentesCliente(clienteId: string): Promise<NfPendenteAlerta[]> {
  const limite24h = new Date(Date.now() - VINTE_QUATRO_H_MS).toISOString();

  const pendentes: NfPendenteAlerta[] = [];

  // Abastecimentos
  const { data: abastecimentos } = await supabase
    .from("motorista_abastecimentos")
    .select(
      `
      id, valor_total, data_abastecimento, nf_foto_url,
      nf_upload_em, nf_baixado, nf_baixado_em, nf_ciente_em, nf_expirado,
      motoristas!inner(nome),
      veiculos!inner(placa)
    `,
    )
    .eq("cliente_id", clienteId)
    .eq("nf_baixado", false)
    .eq("nf_expirado", false)
    .not("nf_foto_url", "is", null)
    .lt("nf_upload_em", limite24h);

  if (abastecimentos) {
    for (const r of abastecimentos) {
      const status = calcularStatusNF({
        nf_foto_url: r.nf_foto_url,
        nf_upload_em: r.nf_upload_em,
        nf_baixado: r.nf_baixado,
        nf_baixado_em: r.nf_baixado_em,
        nf_ciente_em: r.nf_ciente_em,
        nf_expirado: r.nf_expirado,
      });
      if (status === "aguardando_ciencia" || status === "aguardando_expiracao") {
        pendentes.push({
          id: r.id,
          tipo: "abastecimento",
          motorista_nome: (r.motoristas as any)?.nome ?? "—",
          veiculo_placa: (r.veiculos as any)?.placa ?? "—",
          data_registro: r.data_abastecimento,
          valor: Number(r.valor_total),
          nf_upload_em: r.nf_upload_em,
          nf_ciente_em: r.nf_ciente_em,
          status,
          nf_foto_url: r.nf_foto_url,
        });
      }
    }
  }

  // Despesas
  const { data: despesas } = await supabase
    .from("motorista_despesas")
    .select(
      `
      id, valor, data_despesa, nf_foto_url,
      nf_upload_em, nf_baixado, nf_baixado_em, nf_ciente_em, nf_expirado,
      motoristas!inner(nome),
      veiculos!inner(placa)
    `,
    )
    .eq("cliente_id", clienteId)
    .eq("nf_baixado", false)
    .eq("nf_expirado", false)
    .not("nf_foto_url", "is", null)
    .lt("nf_upload_em", limite24h);

  if (despesas) {
    for (const r of despesas) {
      const status = calcularStatusNF({
        nf_foto_url: r.nf_foto_url,
        nf_upload_em: r.nf_upload_em,
        nf_baixado: r.nf_baixado,
        nf_baixado_em: r.nf_baixado_em,
        nf_ciente_em: r.nf_ciente_em,
        nf_expirado: r.nf_expirado,
      });
      if (status === "aguardando_ciencia" || status === "aguardando_expiracao") {
        pendentes.push({
          id: r.id,
          tipo: "despesa",
          motorista_nome: (r.motoristas as any)?.nome ?? "—",
          veiculo_placa: (r.veiculos as any)?.placa ?? "—",
          data_registro: r.data_despesa,
          valor: Number(r.valor),
          nf_upload_em: r.nf_upload_em,
          nf_ciente_em: r.nf_ciente_em,
          status,
          nf_foto_url: r.nf_foto_url,
        });
      }
    }
  }

  return pendentes;
}

// ---------------------------------------------------------------------------
// Interface e busca de TODAS as NFs para a tela de Gestão do Cliente
// ---------------------------------------------------------------------------
export interface NfItemCompleto {
  id: string;
  tipo: "abastecimento" | "despesa";
  motorista_id: string;
  motorista_nome: string;
  veiculo_id: string;
  veiculo_placa: string;
  data_registro: string;
  valor: number;
  nf_numero?: string;
  nf_foto_url: string;
  nf_upload_em: string;
  nf_baixado: boolean;
  nf_baixado_em?: string;
  nf_ciente_em?: string;
  nf_expirado: boolean;
  status: StatusNF;
  detalhes?: string;
  observacoes?: string;
}

export async function buscarTodasNfsCliente(clienteId?: string): Promise<NfItemCompleto[]> {
  const itens: NfItemCompleto[] = [];

  // 1. Abastecimentos
  let queryAbast = supabase
    .from("motorista_abastecimentos")
    .select(
      `
      id, motorista_id, veiculo_id, cliente_id, data_abastecimento, valor_total, litros, combustivel, posto_nome, nf_numero,
      nf_foto_url, nf_upload_em, nf_baixado, nf_baixado_em, nf_ciente_em, nf_expirado, observacoes,
      motoristas!inner(nome),
      veiculos!inner(placa)
    `,
    )
    .not("nf_foto_url", "is", null)
    .order("data_abastecimento", { ascending: false });

  if (clienteId) {
    queryAbast = queryAbast.eq("cliente_id", clienteId);
  }

  const { data: abastecimentos, error: errAbast } = await queryAbast;
  if (errAbast) console.warn("[buscarTodasNfsCliente] Erro abastecimentos:", errAbast);

  if (abastecimentos) {
    for (const r of abastecimentos) {
      const status = calcularStatusNF({
        nf_foto_url: r.nf_foto_url,
        nf_upload_em: r.nf_upload_em,
        nf_baixado: r.nf_baixado,
        nf_baixado_em: r.nf_baixado_em,
        nf_ciente_em: r.nf_ciente_em,
        nf_expirado: r.nf_expirado,
      });

      const detalhes = [
        r.combustivel ? r.combustivel.toUpperCase() : null,
        r.litros ? `${Number(r.litros).toFixed(1)} L` : null,
        r.posto_nome ? r.posto_nome : null,
      ]
        .filter(Boolean)
        .join(" · ");

      itens.push({
        id: r.id,
        tipo: "abastecimento",
        motorista_id: r.motorista_id,
        motorista_nome: (r.motoristas as any)?.nome ?? "—",
        veiculo_id: r.veiculo_id,
        veiculo_placa: (r.veiculos as any)?.placa ?? "—",
        data_registro: r.data_abastecimento,
        valor: Number(r.valor_total),
        nf_numero: r.nf_numero ?? undefined,
        nf_foto_url: r.nf_foto_url,
        nf_upload_em: r.nf_upload_em,
        nf_baixado: r.nf_baixado,
        nf_baixado_em: r.nf_baixado_em,
        nf_ciente_em: r.nf_ciente_em,
        nf_expirado: r.nf_expirado,
        status,
        detalhes,
        observacoes: r.observacoes ?? undefined,
      });
    }
  }

  // 2. Despesas
  let queryDesp = supabase
    .from("motorista_despesas")
    .select(
      `
      id, motorista_id, veiculo_id, cliente_id, data_despesa, valor, categoria, descricao, nf_numero,
      nf_foto_url, nf_upload_em, nf_baixado, nf_baixado_em, nf_ciente_em, nf_expirado, observacoes,
      motoristas(nome),
      veiculos!inner(placa)
    `,
    )
    .not("nf_foto_url", "is", null)
    .order("data_despesa", { ascending: false });

  if (clienteId) {
    queryDesp = queryDesp.eq("cliente_id", clienteId);
  }

  const { data: despesas, error: errDesp } = await queryDesp;
  if (errDesp) console.warn("[buscarTodasNfsCliente] Erro despesas:", errDesp);

  if (despesas) {
    for (const r of despesas) {
      const status = calcularStatusNF({
        nf_foto_url: r.nf_foto_url,
        nf_upload_em: r.nf_upload_em,
        nf_baixado: r.nf_baixado,
        nf_baixado_em: r.nf_baixado_em,
        nf_ciente_em: r.nf_ciente_em,
        nf_expirado: r.nf_expirado,
      });

      const detalhes = [
        r.categoria ? r.categoria.toUpperCase() : null,
        r.descricao ? r.descricao : null,
      ]
        .filter(Boolean)
        .join(" · ");

      itens.push({
        id: r.id,
        tipo: "despesa",
        motorista_id: r.motorista_id,
        motorista_nome: (r.motoristas as any)?.nome ?? "Administração / Frota",
        veiculo_id: r.veiculo_id,
        veiculo_placa: (r.veiculos as any)?.placa ?? "—",
        data_registro: r.data_despesa,
        valor: Number(r.valor),
        nf_numero: r.nf_numero ?? undefined,
        nf_foto_url: r.nf_foto_url,
        nf_upload_em: r.nf_upload_em,
        nf_baixado: r.nf_baixado,
        nf_baixado_em: r.nf_baixado_em,
        nf_ciente_em: r.nf_ciente_em,
        nf_expirado: r.nf_expirado,
        status,
        detalhes,
        observacoes: r.observacoes ?? undefined,
      });
    }
  }

  return itens.sort((a, b) =>
    (b.nf_upload_em || b.data_registro).localeCompare(a.nf_upload_em || a.data_registro),
  );
}

export interface DadosNotificacaoNF {
  combustivel?: string;
  litros?: number;
  valorTotal?: number;
  postoNome?: string;
  descricao?: string;
  arquivoNf?: File | Blob | null;
  pathNf?: string;
}

/**
 * Converte arquivo ou Blob para Base64 para envio como anexo no WhatsApp.
 */
async function extrairBase64Arquivo(
  arquivo?: File | Blob | null,
  path?: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    let blob: Blob | null = arquivo || null;
    let mimeType = arquivo?.type || "";

    if (!blob && path) {
      const url = await gerarSignedUrl(path);
      const resp = await fetch(url);
      if (resp.ok) {
        blob = await resp.blob();
        mimeType = resp.headers.get("content-type") || blob.type;
      }
    }

    if (!blob) return null;

    if (!mimeType) {
      if (path?.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf";
      else if (path?.toLowerCase().endsWith(".png")) mimeType = "image/png";
      else mimeType = "image/jpeg";
    }

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { base64, mimeType };
  } catch (err) {
    console.warn("[nfStorageService] Falha ao converter arquivo para base64:", err);
    return null;
  }
}

/**
 * Dispara notificacao imediata de Momento 0 ao anexar uma nova NF.
 * Respeita estritamente a escolha do usuario entre Web Push e WhatsApp (canais_notificacao_nf).
 * Quando o canal WhatsApp estiver ativo, envia o arquivo do comprovante em anexo.
 */
export async function notificarUploadNF(
  clienteId: string,
  veiculoId: string,
  registroId: string,
  tipo: "abastecimento" | "despesa",
  dadosAdicionais?: DadosNotificacaoNF,
): Promise<void> {
  try {
    // 1. Consulta preferencias de notificacao, alertas operacionais e contatos configurados pelo cliente
    let cliente: any = null;
    const resCliCompleta = await supabase
      .from("clientes")
      .select(
        "id, user_id, nome_razao_social, telefone, notificar_nf_pendente, canais_notificacao_nf, alertas_operacionais, contatos_alertas",
      )
      .eq("id", clienteId)
      .maybeSingle();

    if (!resCliCompleta.error && resCliCompleta.data) {
      cliente = resCliCompleta.data;
    } else {
      const resCliBasica = await supabase
        .from("clientes")
        .select(
          "id, user_id, nome_razao_social, telefone, notificar_nf_pendente, canais_notificacao_nf",
        )
        .eq("id", clienteId)
        .maybeSingle();
      cliente = resCliBasica.data || null;
    }

    if (!cliente) return;

    const canais = (cliente.canais_notificacao_nf as {
      push?: boolean;
      whatsapp?: boolean;
      ligacao?: boolean;
    } | null) || {
      push: true,
      whatsapp: true,
      ligacao: false,
    };

    // 2. Busca placa do veiculo, contatos da conta/motoristas e destinatarios especificos do veiculo
    let placaVeiculo = "Veículo";
    let contatosVeiculo: ContatoAlertaConta[] = [];

    if (veiculoId) {
      const { data: veiculo } = await supabase
        .from("veiculos")
        .select("placa, cliente_id")
        .eq("id", veiculoId)
        .maybeSingle();
      if (veiculo?.placa) placaVeiculo = veiculo.placa;

      const { data: regras } = await supabase
        .from("regras_veiculo")
        .select("canais_alertas, whatsapp_destinatarios")
        .eq("veiculo_id", veiculoId)
        .maybeSingle();

      if (Array.isArray(regras?.whatsapp_destinatarios)) {
        contatosVeiculo = regras.whatsapp_destinatarios
          .filter((d: any) => d && (d.telefone || d.celular || d.numero))
          .map((d: any, idx: number) => ({
            id: String(d.id || `vdest-${idx}`),
            nome: String(d.nome || "Destinatário"),
            telefone: String(d.telefone || d.celular || d.numero),
            tipo: (d.tipo || "adicional") as "cliente" | "motorista" | "adicional",
            ativo: d.ativo !== false,
            padrao: Boolean(d.padrao),
          }));
      }
    }

    let telefoneFallback = String(cliente.telefone || "").trim();
    if (!telefoneFallback && cliente.user_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("telefone, celular")
        .eq("id", cliente.user_id)
        .maybeSingle();
      telefoneFallback = String(prof?.telefone || prof?.celular || "").trim();
    }

    const contatosContaBase: ContatoAlertaConta[] = Array.isArray(cliente.contatos_alertas)
      ? [...cliente.contatos_alertas]
      : [];

    if (contatosContaBase.length === 0 && telefoneFallback) {
      contatosContaBase.push({
        id: `cli-${clienteId}`,
        nome: `${cliente.nome_razao_social || "Cliente Titular"} (Cliente Titular)`,
        telefone: telefoneFallback,
        tipo: "cliente",
        ativo: true,
        padrao: true,
      });
    }

    try {
      const { data: motoristas } = await supabase
        .from("motoristas")
        .select("id, nome, telefone")
        .eq("cliente_id", clienteId)
        .eq("ativo", true);
      for (const m of motoristas || []) {
        if (!m?.telefone) continue;
        const dig = String(m.telefone).replace(/\D/g, "");
        if (!contatosContaBase.some((c) => String(c.telefone || "").replace(/\D/g, "") === dig)) {
          contatosContaBase.push({
            id: `mot-${m.id}`,
            nome: `${m.nome} (Motorista)`,
            telefone: String(m.telefone),
            tipo: "motorista",
            ativo: false,
            padrao: false,
          });
        }
      }
    } catch {
      // fallback silencioso
    }

    const regraNf = resolverRegraEntregaAlerta({
      tipo: "nf_pronta_download",
      alertasOperacionais: cliente.alertas_operacionais || null,
      notificarNfPendente: cliente.notificar_nf_pendente,
      canaisNotificacaoNf: canais,
      contatosVeiculo,
      contatosConta: contatosContaBase,
      telefoneFallbackTitular: telefoneFallback || null,
    });

    const canalPush = regraNf.ativo && regraNf.app;
    const canalWhatsapp = regraNf.ativo && regraNf.whatsapp;
    const canalLigacao = regraNf.ativo && regraNf.ligacao;

    // Se alerta estiver desativado ou nenhum canal ativo, nao envia nada
    if (!canalPush && !canalWhatsapp && !canalLigacao) {
      return;
    }

    const agora = new Date().toISOString();
    const tipoRotulo = tipo === "abastecimento" ? "Abastecimento" : "Despesa";

    // 3. CANAL PUSH / APP: Se ativo, grava em notificacoes_sistema e dispara Web Push
    if (canalPush) {
      const tituloPush = `📄 Nova Nota Fiscal de ${tipoRotulo} — ${placaVeiculo}`;
      const mensagemPush = `Comprovante de ${tipoRotulo.toLowerCase()} do veículo ${placaVeiculo} disponível para download. Arquivo mantido por 48 horas antes do expurgo.`;

      await supabase.from("notificacoes_sistema").insert({
        destinatario_user_id: cliente.user_id,
        destinatario_cliente_id: clienteId,
        titulo: tituloPush,
        mensagem: mensagemPush,
        tipo: "nf_pronta_download",
        url: "/motoristas",
        placa: placaVeiculo,
        lida: false,
        created_at: agora,
      });

      // Disparo assincrono Web Push para acordar dispositivos moveis
      fetch("/api/push/disparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatarioUserId: cliente.user_id,
          destinatarioClienteId: clienteId,
          titulo: tituloPush,
          mensagem: mensagemPush,
          url: "/motoristas",
          tag: `sigo-notif-nf-${registroId}`,
          tipo: "nf_pronta_download",
          placa: placaVeiculo,
        }),
      }).catch(() => {});
    }

    // 4. CANAL WHATSAPP COM ARQUIVO ANEXO: Se ativo e houver telefones configurados
    if (canalWhatsapp && regraNf.telefonesWhatsapp.length > 0) {
      let documentoWhatsapp: DocumentoWhatsappEnvio | null = null;
      const dadosArquivo = await extrairBase64Arquivo(
        dadosAdicionais?.arquivoNf,
        dadosAdicionais?.pathNf,
      );

      if (dadosArquivo) {
        const ext = dadosArquivo.mimeType.includes("pdf") ? "pdf" : "jpg";
        const placaLimpa = placaVeiculo.replace(/[^a-zA-Z0-9]/g, "");
        documentoWhatsapp = {
          nome: `comprovante_${placaLimpa}_${registroId.slice(0, 8)}.${ext}`,
          base64: dadosArquivo.base64,
          mimetype: dadosArquivo.mimeType,
        };
      }

      const dataHoraBrasil = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());

      const linhasDetalhes: string[] = [
        `🚗 *Veículo:* ${placaVeiculo}`,
        dadosAdicionais?.combustivel
          ? `⛽ *Combustível:* ${dadosAdicionais.combustivel.toUpperCase()}`
          : "",
        dadosAdicionais?.litros
          ? `📦 *Volume:* ${Number(dadosAdicionais.litros).toFixed(2)} L`
          : "",
        dadosAdicionais?.valorTotal
          ? `💰 *Valor:* R$ ${Number(dadosAdicionais.valorTotal).toFixed(2).replace(".", ",")}`
          : "",
        dadosAdicionais?.postoNome
          ? `🏢 *Posto/Estabelecimento:* ${dadosAdicionais.postoNome}`
          : "",
        dadosAdicionais?.descricao ? `📝 *Descrição:* ${dadosAdicionais.descricao}` : "",
        `🕒 *Data/Hora:* ${dataHoraBrasil}`,
      ].filter(Boolean);

      const textoWhats = `📄 *Novo Comprovante de ${tipoRotulo} Anexado*\n\n${linhasDetalhes.join(
        "\n",
      )}\n\nO documento segue em anexo para conferência imediata e download.\n\n_SIGO Guardião — Gestão Inteligente de Frotas_`;

      for (const fone of regraNf.telefonesWhatsapp) {
        enviarMensagemWhatsappOperador({
          telefone: fone,
          mensagem: textoWhats,
          documento: documentoWhatsapp,
          tipoContato: "cliente",
          categoriaMensagem: "operacional",
        }).catch((err) =>
          console.warn("[notificarUploadNF] Falha ao enviar WhatsApp para", fone, err),
        );
      }
    }

    // 4.1 CANAL LIGACAO TELEFONICA (MACRODROID): Caso opt-in configurado pelo cliente
    if (canalLigacao && regraNf.telefonesLigacao.length > 0) {
      let authToken: string | undefined;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        authToken = session?.access_token;
      } catch {}

      const headersLig: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headersLig.Authorization = `Bearer ${authToken}`;
      }

      for (const foneLig of regraNf.telefonesLigacao) {
        fetch("/api/alerta/ligacao", {
          method: "POST",
          headers: headersLig,
          body: JSON.stringify({
            telefone: foneLig,
            motivo: "nf_pronta_download",
          }),
        }).catch(() => {});
      }
    }

    // 5. Marca nf_alerta_pronta_em na tabela correspondente
    const tabela = tipo === "abastecimento" ? "motorista_abastecimentos" : "motorista_despesas";
    await supabase.from(tabela).update({ nf_alerta_pronta_em: agora }).eq("id", registroId);
  } catch (errNotif) {
    console.warn("[notificarUploadNF] Falha ao despachar notificação de NF:", errNotif);
  }
}
