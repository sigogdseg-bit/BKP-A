import { supabaseAdmin } from "../src/integrations/supabase/client.server";

interface CameraRow {
  id: string;
  prefixo: string;
  tipo_camera: string;
  status: string;
  alteracao: string | null;
  providencias: string | null;
  data_problema: string | null;
  data_solucao: string | null;
  resolvido_por: string | null;
  aberto_por: string | null;
  checklist_id: string | null;
  created_at: string | null;
}

export async function sanearDuplicidadesCameras() {
  console.log("=== INICIANDO SANEAMENTO SEGURO DE CÂMERAS EMBARCADAS ===");

  const { data: records, error } = await supabaseAdmin
    .from("cameras_registros")
    .select("*")
    .order("prefixo", { ascending: true })
    .order("tipo_camera", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !records) {
    console.error("Erro ao buscar registros de câmeras:", error);
    return;
  }

  console.log(`Total de registros analisados: ${records.length}`);

  // Agrupa por (prefixo | tipo_camera)
  const map = new Map<string, CameraRow[]>();
  for (const r of records as CameraRow[]) {
    const key = `${r.prefixo.trim().toUpperCase()} | ${r.tipo_camera.trim().toLowerCase()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  let totalConsolidados = 0;
  let totalDuplicatasRemovidas = 0;
  let totalProvidenciasPreservadas = 0;

  for (const [chave, lista] of map.entries()) {
    const abertos = lista.filter((r) => r.status === "aberto");

    if (abertos.length > 1) {
      console.log(`\n-------------------------------------------------------------`);
      console.log(`Saneando grupo: ${chave} (${abertos.length} registros abertos encontrados)`);

      // 1. Registro principal é o mais antigo (início do problema)
      const principal = abertos[0];
      const duplicatas = abertos.slice(1);

      let providenciasConcatenadas = (principal.providencias || "").trim();

      // 2. Preserva qualquer providência lançada nas duplicatas subsequentes
      for (const dup of duplicatas) {
        const provDup = (dup.providencias || "").trim();
        if (provDup.length > 0) {
          totalProvidenciasPreservadas++;
          if (!providenciasConcatenadas.includes(provDup)) {
            providenciasConcatenadas = providenciasConcatenadas
              ? `${providenciasConcatenadas}\n\n${provDup}`
              : provDup;
            console.log(
              `  -> Providência recuperada e fundida da duplicata [${dup.id.substring(0, 8)}]: "${provDup}"`,
            );
          }
        }
      }

      // 3. Atualiza o registro principal com as providências fundidas
      if (providenciasConcatenadas !== (principal.providencias || "").trim()) {
        const { error: updErr } = await supabaseAdmin
          .from("cameras_registros")
          .update({
            providencias: providenciasConcatenadas,
            updated_at: new Date().toISOString(),
          })
          .eq("id", principal.id);

        if (updErr) {
          console.error(
            `  [ERRO] Falha ao atualizar providências no registro principal ${principal.id}:`,
            updErr,
          );
          continue;
        }
        console.log(
          `  [OK] Registro principal [${principal.id.substring(0, 8)}] atualizado com providências completas.`,
        );
      }

      // 4. Remove as duplicatas redundantes de check-list
      const idsParaRemover = duplicatas.map((d) => d.id);
      const { error: delErr } = await supabaseAdmin
        .from("cameras_registros")
        .delete()
        .in("id", idsParaRemover);

      if (delErr) {
        console.error(`  [ERRO] Falha ao remover duplicatas de ${chave}:`, delErr);
      } else {
        totalDuplicatasRemovidas += idsParaRemover.length;
        totalConsolidados++;
        console.log(
          `  [OK] ${idsParaRemover.length} duplicatas redundantes removidas com segurança.`,
        );
      }
    }
  }

  console.log(`\n=============================================================`);
  console.log(`SANEAMENTO CONCLUÍDO COM SUCESSO:`);
  console.log(`- Grupos consolidados: ${totalConsolidados}`);
  console.log(`- Duplicatas removidas: ${totalDuplicatasRemovidas}`);
  console.log(`- Providências fundidas/preservadas: ${totalProvidenciasPreservadas}`);
}

if (process.argv[1] && process.argv[1].endsWith("saneamento_duplicidades_cameras.ts")) {
  sanearDuplicidadesCameras().catch(console.error);
}
