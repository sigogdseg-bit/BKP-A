import { supabaseAdmin } from "../src/integrations/supabase/client.server";

interface ChecklistRow {
  id: string;
  prefixo_vtr: string | null;
  momento: string | null;
  itens: Record<string, unknown> | null;
  outras_alteracoes: string | null;
  user_id: string | null;
  ocorrido_em: string | null;
  created_at: string | null;
}

export async function migrarAlteracoesCameras() {
  console.log("Iniciando migração e sincronização de histórico de câmeras...");

  const { data: checklists, error: errChk } = await supabaseAdmin
    .from("smt_checklists")
    .select("id, prefixo_vtr, momento, itens, outras_alteracoes, user_id, ocorrido_em, created_at")
    .order("ocorrido_em", { ascending: true });

  if (errChk || !checklists) {
    console.error("Erro ao buscar checklists:", errChk);
    return;
  }

  const { data: existentes, error: errExist } = await supabaseAdmin
    .from("cameras_registros")
    .select("id, prefixo, tipo_camera, checklist_id");

  if (errExist) {
    console.error("Erro ao buscar registros existentes:", errExist);
    return;
  }

  const chkProcessados = new Set(
    (existentes || [])
      .filter((r) => r.checklist_id)
      .map((r) => `${r.checklist_id}_${r.tipo_camera}`),
  );

  let totalInseridos = 0;

  for (const c of checklists as ChecklistRow[]) {
    if (!c.prefixo_vtr) continue;
    const pref = c.prefixo_vtr.trim().toUpperCase();
    const dataProblema = c.ocorrido_em || c.created_at || new Date().toISOString();
    const responsavel = c.user_id || "00000000-0000-0000-0000-000000000000";
    const itens = (c.itens || {}) as Record<string, unknown>;

    // 1. Câmera Externa
    const ext = itens.camera_externa;
    const extStr = Array.isArray(ext) ? ext.join(", ") : String(ext || "");
    if (
      extStr &&
      (extStr.includes("INOPERANTE") ||
        extStr.includes("QUEBRADA") ||
        extStr.includes("DEFEITO") ||
        extStr.includes("DANIFICADA")) &&
      !chkProcessados.has(`${c.id}_externa`)
    ) {
      const { error: insErr } = await supabaseAdmin.from("cameras_registros").insert({
        prefixo: pref,
        tipo_camera: "externa",
        status: "aberto",
        alteracao: `[Check-list ${c.momento || "operacional"}] Status: ${extStr}`,
        providencias: null,
        data_problema: dataProblema,
        checklist_id: c.id,
        aberto_por: responsavel,
      });
      if (!insErr) {
        chkProcessados.add(`${c.id}_externa`);
        totalInseridos++;
      }
    }

    // 2. Câmera Interna
    const inter = itens.camera_interna;
    const interStr = Array.isArray(inter) ? inter.join(", ") : String(inter || "");
    if (
      interStr &&
      (interStr.includes("INOPERANTE") ||
        interStr.includes("QUEBRADA") ||
        interStr.includes("DEFEITO") ||
        interStr.includes("DANIFICADA")) &&
      !chkProcessados.has(`${c.id}_interna`)
    ) {
      const { error: insErr } = await supabaseAdmin.from("cameras_registros").insert({
        prefixo: pref,
        tipo_camera: "interna",
        status: "aberto",
        alteracao: `[Check-list ${c.momento || "operacional"}] Status: ${interStr}`,
        providencias: null,
        data_problema: dataProblema,
        checklist_id: c.id,
        aberto_por: responsavel,
      });
      if (!insErr) {
        chkProcessados.add(`${c.id}_interna`);
        totalInseridos++;
      }
    }

    // 3. Monitor
    const mon = itens.monitor_camera || itens.monitor;
    const monStr = Array.isArray(mon) ? mon.join(", ") : String(mon || "");
    if (
      monStr &&
      (monStr.includes("INOPERANTE") ||
        monStr.includes("QUEBRADO") ||
        monStr.includes("DEFEITO") ||
        monStr.includes("DANIFICADO")) &&
      !chkProcessados.has(`${c.id}_monitor`)
    ) {
      const { error: insErr } = await supabaseAdmin.from("cameras_registros").insert({
        prefixo: pref,
        tipo_camera: "monitor",
        status: "aberto",
        alteracao: `[Check-list ${c.momento || "operacional"}] Status: ${monStr}`,
        providencias: null,
        data_problema: dataProblema,
        checklist_id: c.id,
        aberto_por: responsavel,
      });
      if (!insErr) {
        chkProcessados.add(`${c.id}_monitor`);
        totalInseridos++;
      }
    }
  }

  console.log(
    `Migração concluída com sucesso. Total de novos registros inseridos: ${totalInseridos}`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("migrar_alteracoes_cameras.ts")) {
  migrarAlteracoesCameras().catch(console.error);
}
