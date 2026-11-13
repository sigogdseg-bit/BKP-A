import { supabaseAdmin } from "../src/integrations/supabase/client.server";

interface PrefixoRow {
  prefixo: string;
  tipo?: string | null;
  cia?: string | null;
  setor?: string | null;
  ativo?: boolean | null;
}

async function listarPrefixosPatio() {
  // 1. Todos os prefixos cadastrados ativos
  const { data: todosPrefixos, error: errPref } = await supabaseAdmin
    .from("prefixos")
    .select("prefixo, tipo, cia, setor, ativo")
    .eq("ativo", true)
    .order("prefixo");

  if (errPref || !todosPrefixos) {
    console.error("Erro ao buscar prefixos:", errPref);
    process.exit(1);
  }

  // 2. Todos os deslocamentos de assunção ou circulação (uso de QR Code / abertura de turno)
  const { data: todosDeslocamentos, error: errDesl } = await supabaseAdmin
    .from("deslocamentos")
    .select("prefixo, tipo_deslocamento")
    .in("tipo_deslocamento", ["Assunção", "Normal"]);

  if (errDesl) {
    console.error("Erro ao buscar deslocamentos:", errDesl);
    process.exit(1);
  }

  // 3. Todos os checklists existentes
  const { data: todosChecklists, error: errChk } = await supabaseAdmin
    .from("smt_checklists")
    .select("prefixo_vtr, momento, ocorrido_em, created_at");

  if (errChk) {
    console.error("Erro ao buscar checklists:", errChk);
    process.exit(1);
  }

  // Mapeamentos
  const prefixosComDeslocamento = new Set<string>();
  const prefixosComChecklist = new Set<string>();

  (todosDeslocamentos || []).forEach((d) => {
    if (d.prefixo) {
      prefixosComDeslocamento.add(d.prefixo.trim().toUpperCase());
      const base = d.prefixo.replace(/\D/g, "");
      if (base) prefixosComDeslocamento.add(base);
    }
  });

  (todosChecklists || []).forEach((c) => {
    if (c.prefixo_vtr) {
      prefixosComChecklist.add(c.prefixo_vtr.trim().toUpperCase());
      const base = c.prefixo_vtr.replace(/\D/g, "");
      if (base) prefixosComChecklist.add(base);
    }
  });

  console.log(`Total de prefixos cadastrados: ${todosPrefixos.length}`);
  console.log(`Prefixos com ao menos 1 assunção/deslocamento: ${prefixosComDeslocamento.size}`);
  console.log(`Prefixos com ao menos 1 checklist: ${prefixosComChecklist.size}`);

  const semNenhumRegistro: PrefixoRow[] = [];
  const semChecklistMasComDeslocamento: PrefixoRow[] = [];
  const semDeslocamentoMasComChecklist: PrefixoRow[] = [];

  for (const p of todosPrefixos) {
    const prefNorm = p.prefixo.trim().toUpperCase();
    const base = p.prefixo.replace(/\D/g, "");
    const temDesl =
      prefixosComDeslocamento.has(prefNorm) || (base ? prefixosComDeslocamento.has(base) : false);
    const temChk =
      prefixosComChecklist.has(prefNorm) || (base ? prefixosComChecklist.has(base) : false);

    if (!temDesl && !temChk) {
      semNenhumRegistro.push(p);
    } else if (temDesl && !temChk) {
      semChecklistMasComDeslocamento.push(p);
    } else if (!temDesl && temChk) {
      semDeslocamentoMasComChecklist.push(p);
    }
  }

  console.log("\n=======================================================");
  console.log(
    `PREFIXOS NO PÁTIO QUE NUNCA ABRIRAM FICHA E NUNCA FIZERAM CHECKLIST (Total: ${semNenhumRegistro.length}):`,
  );
  console.log("=======================================================");
  semNenhumRegistro.forEach((item) => {
    console.log(
      `- Prefixo: ${item.prefixo.padEnd(10)} | Tipo: ${(item.tipo || "carro").padEnd(6)} | CIA: ${(item.cia || "—").padEnd(8)} | Setor: ${(item.setor || "—").padEnd(12)} | Ativo: ${item.ativo ? "Sim" : "Não"}`,
    );
  });

  console.log("\n-------------------------------------------------------");
  console.log(
    `PREFIXOS COM DESLOCAMENTO MAS SEM CHECKLIST (Total: ${semChecklistMasComDeslocamento.length}):`,
  );
  semChecklistMasComDeslocamento.forEach((i) =>
    console.log(`- ${i.prefixo} (CIA: ${i.cia || "—"}, Setor: ${i.setor || "—"})`),
  );

  console.log("\n-------------------------------------------------------");
  console.log(
    `PREFIXOS COM CHECKLIST MAS SEM DESLOCAMENTO (Total: ${semDeslocamentoMasComChecklist.length}):`,
  );
  semDeslocamentoMasComChecklist.forEach((i) =>
    console.log(`- ${i.prefixo} (CIA: ${i.cia || "—"}, Setor: ${i.setor || "—"})`),
  );
}

void listarPrefixosPatio();
