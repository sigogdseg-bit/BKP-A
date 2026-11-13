import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  obterStatusDefesaCibernetica,
  obterMetricasSegurancaExecutivas,
  obterSnapshotAuditoriaBanco,
  obterHoneytokens,
  obterConfiguracaoDlp,
  salvarConfiguracaoDlp,
  obterIntegridadeFim,
} from "../../features/seguranca/services/segurancaModulosService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Hunter — Dev-Módulos SEG Suite (1, 2, 3, 4, 6, 7, 9, 12, 13, 16, 19)", () => {
  test("Módulo 19: Semáforo de Defesa Cibernética deve reportar estado geral e 7 camadas ativas", async () => {
    const sem = await obterStatusDefesaCibernetica();
    assert.equal(sem.statusGeral, "verde");
    assert.ok(sem.pilares.length >= 7, "Deve conter pelo menos 7 camadas de defesa no semáforo");

    const camadas = sem.pilares.map((p) => p.camada);
    assert.ok(
      camadas.some((c) => c.includes("TLS")),
      "Deve incluir Borda e TLS",
    );
    assert.ok(
      camadas.some((c) => c.includes("RLS")),
      "Deve incluir RLS 100%",
    );
    assert.ok(
      camadas.some((c) => c.includes("SuperADM")),
      "Deve incluir SuperADM",
    );
    assert.ok(
      camadas.some((c) => c.includes("DLP")),
      "Deve incluir DLP",
    );
    assert.ok(
      camadas.some((c) => c.includes("Honeytokens")),
      "Deve incluir Honeytokens",
    );
  });

  test("Módulo 16: Métricas de Segurança Executivas devem reportar 100% de conformidade RLS", async () => {
    const met = await obterMetricasSegurancaExecutivas();
    assert.equal(met.conformidadeRlsPercentual, 100);
    assert.ok(typeof met.totalLogins === "number");
    assert.ok(typeof met.taxaSucessoLogins === "string");
  });

  test("Módulo 03: Snapshot de Auditoria do Banco deve mapear tabelas públicas com RLS obrigatório", async () => {
    const aud = await obterSnapshotAuditoriaBanco();
    assert.equal(aud.percentualConformidade, 100);
    assert.ok(aud.tabelas.length >= 15);
    aud.tabelas.forEach((t) => {
      assert.equal(t.rlsAtivo, true, `Tabela ${t.nome} deve ter RLS ativo`);
      assert.equal(t.status, "Conforme");
    });
  });

  test("Módulo 06: Defesa Proativa Honeytokens deve manter armadilhas cibernéticas ativas", async () => {
    const ht = await obterHoneytokens();
    assert.ok(ht.length >= 3, "Deve possuir pelo menos 3 honeytokens ativos");
    assert.ok(ht.some((h) => h.tipoIsca === "conta_login"));
    assert.ok(ht.some((h) => h.tipoIsca === "tabela_fantasma"));
  });

  test("Módulo 09: Governança DLP deve suportar marca d'água forense e ofuscamento por perda de foco", async () => {
    const dlp = await obterConfiguracaoDlp();
    assert.equal(typeof dlp.watermarkAtivo, "boolean");
    assert.equal(typeof dlp.blurPerdaFocoAtivo, "boolean");
    assert.equal(typeof dlp.bloqueioPrintAtivo, "boolean");
    assert.ok(dlp.textoMarcaDagua.includes("SIGO"));

    const ok = await salvarConfiguracaoDlp({
      watermarkAtivo: false,
      blurPerdaFocoAtivo: true,
      bloqueioPrintAtivo: true,
      textoMarcaDagua: "SIGO GUARDIÃO • DOCUMENTO CONFIDENCIAL",
      opacidadeWatermark: 0.08,
    });
    assert.equal(ok, true, "salvarConfiguracaoDlp deve retornar true com persistencia resiliente");
  });

  test("Módulo 12: Integridade FIM deve auditar triggers de blindagem SuperADM e rotas essenciais", async () => {
    const fim = await obterIntegridadeFim();
    assert.ok(fim.length >= 5);
    assert.ok(fim.some((f) => f.componente.includes("SuperADM")));
    assert.ok(fim.some((f) => f.componente.includes("Proxy")));
  });

  test("Migração e Script Mestre: DDL das novas tabelas de segurança devem estar sincronizados", () => {
    const migracaoPath = path.resolve(
      __dirname,
      "../../../supabase/migrations/20261018140000_hunter_dev_modulos_seg_suite.sql",
    );
    assert.ok(fs.existsSync(migracaoPath), "Arquivo de migração deve existir");

    const sqlScriptPath = path.resolve(
      __dirname,
      "../../../supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql",
    );
    const sqlMestre = fs.readFileSync(sqlScriptPath, "utf-8");

    assert.ok(sqlMestre.includes("login_lockouts"), "Script mestre deve conter login_lockouts");
    assert.ok(
      sqlMestre.includes("honeytokens_deception"),
      "Script mestre deve conter honeytokens_deception",
    );
    assert.ok(
      sqlMestre.includes("lgpd_solicitacoes"),
      "Script mestre deve conter lgpd_solicitacoes",
    );
    assert.ok(
      sqlMestre.includes("seguranca_dlp_config"),
      "Script mestre deve conter seguranca_dlp_config",
    );
  });

  test("Regra Pétrea Hunter-Guardian: Ausência do caractere comercial proibido em CentralSegurancaView", () => {
    const viewPath = path.resolve(
      __dirname,
      "../../features/seguranca/components/CentralSegurancaView.tsx",
    );
    const conteudo = fs.readFileSync(viewPath, "utf-8");

    // Remove referências a operadores lógicos do JS (&&)
    const semLogicos = conteudo.replace(/&&/g, "");
    assert.ok(
      !semLogicos.includes("&"),
      "CentralSegurancaView.tsx não deve conter o caractere comercial proibido em strings de UI",
    );
  });
});
