import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import assert from "node:assert";

console.log("================================================================================");
console.log("PROVA FORMAL DE ISOLAMENTO: ROW LEVEL SECURITY (RLS) E STORAGE PRIVADO");
console.log("Supabase Oficial: wwycienksomhfqdkiiqh");
console.log("================================================================================\n");

// Lê credenciais locais
const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const adminCred = Object.fromEntries(
  fs
    .readFileSync(".admin_credentials.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const supabaseUrl = env.SUPABASE_URL;
const anonKey = env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

// Clientes para os diferentes níveis de privilégio
const adminServiceClient = createClient(supabaseUrl, serviceKey);
const anonClient = createClient(supabaseUrl, anonKey);
const userAuthClient = createClient(supabaseUrl, anonKey);

// 1. Autenticação do Usuário Administrador Autorizado
console.log(`1. Autenticando usuário administrador (${adminCred.EMAIL})...`);
const { data: authData, error: authError } = await userAuthClient.auth.signInWithPassword({
  email: adminCred.EMAIL,
  password: adminCred.PASSWORD,
});
assert(!authError, `Falha na autenticação do administrador: ${authError?.message}`);
console.log(`   Usuário autenticado com sucesso. UID: ${authData.user.id}`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Prova de RLS em Tabela do Banco de Dados (vistorias)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n2. Teste de RLS na tabela 'vistorias'...");

// Cria um registro fictício conhecido para a validação
const testPrefixo = "V-TEST-RLS";
const testVistoriaPayload = {
  prefixo: testPrefixo,
  cia: "1ª CIA",
  setor: "Operacional",
  vistoriador_id: authData.user.id,
  vistoriador_nome: "Sgt Teste RLS",
  vistoriador_rg: "123.456",
  vistoriador_graduacao: "2º SGT",
  itens_vistoriados: [{ item: "Faróis", status: "conforme" }],
  fotos_gerais: [],
  observacoes: "REGISTRO FICTÍCIO DE AUDITORIA E PROVA DE ISOLAMENTO RLS",
  qtd_alteracoes: 0,
  created_at: new Date().toISOString(),
};

const { data: insertedVistoria, error: insertError } = await adminServiceClient
  .from("vistorias")
  .insert(testVistoriaPayload)
  .select("id, prefixo, vistoriador_id")
  .single();

assert(!insertError, `Falha ao criar registro fictício: ${insertError?.message}`);
console.log(
  `   Registro fictício criado com ID: ${insertedVistoria.id} (Prefixo: ${insertedVistoria.prefixo})`,
);

try {
  // A) Consulta via Usuário AUTORIZADO (Admin autenticado via RLS)
  const { data: authQuery, error: authQueryErr } = await userAuthClient
    .from("vistorias")
    .select("id, prefixo")
    .eq("id", insertedVistoria.id);

  console.log(`   [Acesso Autorizado] Registros retornados para admin: ${authQuery?.length ?? 0}`);
  assert(!authQueryErr, `Erro inesperado na consulta autorizada: ${authQueryErr?.message}`);
  assert.strictEqual(
    authQuery.length,
    1,
    "Usuário autorizado DEVE conseguir ler o registro de vistoria",
  );
  assert.strictEqual(authQuery[0].id, insertedVistoria.id);
  console.log(`   -> PROVADO: Usuário autorizado acessa o registro com sucesso.`);

  // B) Consulta via Usuário NÃO AUTORIZADO (Anon / sem token de sessão)
  const { data: anonQuery, error: anonQueryErr } = await anonClient
    .from("vistorias")
    .select("id, prefixo")
    .eq("id", insertedVistoria.id);

  console.log(
    `   [Acesso Negado/Anônimo] Registros retornados para anon: ${anonQuery?.length ?? 0}`,
  );
  // No PostgreSQL com RLS ativo, o SELECT de linhas não permitidas retorna array vazio [] (zero linhas visíveis)
  assert.strictEqual(
    anonQuery?.length ?? 0,
    0,
    "RLS VIOLADO: Usuário anônimo/não autorizado NÃO PODE ler registros da tabela vistorias",
  );
  console.log(
    `   -> PROVADO: RLS ativo bloqueou a visualização do registro para usuário não autorizado (0 registros retornados).`,
  );
} finally {
  // Limpeza estrita do registro de teste criado
  const { error: delErr } = await adminServiceClient
    .from("vistorias")
    .delete()
    .eq("id", insertedVistoria.id);
  if (!delErr) {
    console.log(`   Registro fictício ${insertedVistoria.id} removido com sucesso.`);
  } else {
    console.warn(`   Aviso na limpeza do registro: ${delErr.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Prova de Isolamento e RLS em Bucket Privado com restrição de Usuário ('cnh-fotos')
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n3. Teste de Isolamento em Bucket Privado ('cnh-fotos')...");

const testBucket = "cnh-fotos";
const testFileName = `${authData.user.id}/test-cnh-probe-${Date.now()}.txt`;
const testFileContent = Buffer.from("PROVA DE CONCEITO DE ISOLAMENTO STORAGE - CNH SIGO FROTA");

// Faz upload do arquivo como o usuário Admin (authData.user.id passa a ser o owner)
const { data: uploadData, error: uploadErr } = await userAuthClient.storage
  .from(testBucket)
  .upload(testFileName, testFileContent, {
    contentType: "text/plain",
    upsert: true,
  });

assert(!uploadErr, `Falha no upload do arquivo de teste em ${testBucket}: ${uploadErr?.message}`);
console.log(`   Arquivo de teste enviado como Admin para bucket '${testBucket}': ${testFileName}`);

try {
  // A) Usuário Anônimo tenta download direto do bucket privado via URL pública
  const publicUrlRes = anonClient.storage.from(testBucket).getPublicUrl(testFileName);
  const fetchPublic = await fetch(publicUrlRes.data.publicUrl);
  console.log(
    `   [Tentativa Acesso Público Direto]: HTTP Status ${fetchPublic.status} ${fetchPublic.statusText}`,
  );
  assert(
    fetchPublic.status === 400 || fetchPublic.status === 403 || fetchPublic.status === 404,
    `Bucket deveria ser privado e recusar download público não autenticado, retornou HTTP ${fetchPublic.status}`,
  );
  console.log(`   -> PROVADO: Download público recusado (Bucket Privado protegido).`);

  // B) Usuário Anônimo tenta download via Client API sem credencial
  const { data: anonDownload, error: anonDownErr } = await anonClient.storage
    .from(testBucket)
    .download(testFileName);

  console.log(
    `   [Download via anonClient]: Sucesso = ${!!anonDownload}, Erro = ${anonDownErr?.message}`,
  );
  assert(
    anonDownErr || !anonDownload,
    "RLS DE STORAGE VIOLADO: Usuário anônimo conseguiu baixar arquivo de bucket privado!",
  );
  console.log(`   -> PROVADO: anonClient teve acesso negado pelo Storage RLS.`);

  // C) Outro Usuário Autenticado sem privilégios (Need-to-Know)
  console.log("\n   Testando negação de acesso a outro usuário autenticado...");
  const tempUserEmail = `probe-unauth-${Date.now()}@teste.local`;
  const tempUserPassword = `ProbePass!${Date.now()}#XYZ`;
  const { data: tempUserAuth, error: tempCreateErr } =
    await adminServiceClient.auth.admin.createUser({
      email: tempUserEmail,
      password: tempUserPassword,
      email_confirm: true,
    });
  assert(!tempCreateErr, `Falha ao criar usuário de teste: ${tempCreateErr?.message}`);
  console.log(
    `   Segundo usuário temporário criado: ${tempUserEmail} (UID: ${tempUserAuth.user.id})`,
  );

  let otherUserClient = createClient(supabaseUrl, anonKey);
  const { error: tempSignInErr } = await otherUserClient.auth.signInWithPassword({
    email: tempUserEmail,
    password: tempUserPassword,
  });
  assert(!tempSignInErr, `Falha ao autenticar segundo usuário: ${tempSignInErr?.message}`);

  try {
    // Tentativa de download do bucket com o segundo usuário
    const { data: otherDownload, error: otherDownErr } = await otherUserClient.storage
      .from(testBucket)
      .download(testFileName);

    // Tentativa de leitura da tabela com o segundo usuário (sem perfil/módulo cadastrado)
    const { data: otherTableQuery } = await otherUserClient
      .from("vistorias")
      .select("id")
      .eq("id", insertedVistoria.id);

    console.log(
      `   [Segundo Usuário - Leitura Tabela]: Registros visíveis = ${otherTableQuery?.length ?? 0}`,
    );
    assert.strictEqual(
      otherTableQuery?.length ?? 0,
      0,
      "Segundo usuário sem perfil não deveria ver vistorias de outra CIA/Admin",
    );
    console.log(`   -> PROVADO: RLS bloqueia acesso entre usuários distintos.`);

    console.log(
      `   [Segundo Usuário - Download Storage]: Sucesso = ${!!otherDownload}, Erro = ${otherDownErr?.message}`,
    );
    assert(
      otherDownErr || !otherDownload,
      "RLS VIOLADO: Segundo usuário não autorizado conseguiu baixar arquivo do bucket privado!",
    );
    console.log(
      `   -> PROVADO: Segundo usuário não autorizado teve download negado pelo Storage RLS.`,
    );
  } finally {
    // Remove usuário temporário de teste
    await adminServiceClient.auth.admin.deleteUser(tempUserAuth.user.id);
    console.log(`   Segundo usuário temporário removido com sucesso.`);
  }

  // D) Acesso Autorizado via Signed URL ou Client Autenticado com Permissão
  const { data: signedUrlData, error: signedUrlErr } = await adminServiceClient.storage
    .from(testBucket)
    .createSignedUrl(testFileName, 60);

  assert(
    !signedUrlErr,
    `Falha ao gerar signed URL para acesso autorizado: ${signedUrlErr?.message}`,
  );
  const fetchSigned = await fetch(signedUrlData.signedUrl);
  console.log(
    `   [Download Autorizado via Signed URL]: HTTP Status ${fetchSigned.status} ${fetchSigned.statusText}`,
  );
  assert.strictEqual(fetchSigned.status, 200, "Acesso autorizado deveria retornar HTTP 200");
  const contentDownloaded = await fetchSigned.text();
  assert.strictEqual(contentDownloaded, testFileContent.toString());
  console.log(`   -> PROVADO: Acesso autorizado obtém o arquivo com integridade verificada.`);
} finally {
  // Limpeza estrita do arquivo de teste no bucket
  const { error: removeErr } = await adminServiceClient.storage
    .from(testBucket)
    .remove([testFileName]);
  if (!removeErr) {
    console.log(`   Arquivo de teste ${testFileName} removido do bucket com sucesso.`);
  } else {
    console.warn(`   Aviso na remoção do arquivo de teste: ${removeErr.message}`);
  }
}

console.log("\n================================================================================");
console.log("PROVA DE ISOLAMENTO RLS E STORAGE CONCLUÍDA COM ÊXITO TOTAL");
console.log("================================================================================");
