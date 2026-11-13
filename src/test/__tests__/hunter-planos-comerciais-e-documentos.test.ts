import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  PLANOS_COMERCIAIS_CATALOGO,
  obterTextoPlanosComerciaisFormatado,
  obterTextoPlanoClienteFormatado,
  obterDescritivoFuncionalidadesContrato,
  obterDefinicaoPlano,
  normalizarTipoPlano,
} from "../../shared/lib/planosComerciais";

describe("Hunter — Governança Canônica dos Planos Comerciais e Documentos Oficiais (DJR-NEW)", () => {
  it("1. O catálogo de planos comerciais deve possuir exatamente os 3 planos em uso: Básico, Pro e Master", () => {
    assert.strictEqual(PLANOS_COMERCIAIS_CATALOGO.length, 3);
    const ids = PLANOS_COMERCIAIS_CATALOGO.map((p) => p.id);
    assert.deepStrictEqual(ids, ["basico", "pro", "master"]);

    // Garante que nenhum plano personalizado ou genérico existe
    assert.ok(!ids.includes("personalizado" as any));
  });

  it("2. Histórico de Trajetos visível no aplicativo deve ser estritamente 7, 15 e 30 dias", () => {
    const basico = obterDefinicaoPlano("basico");
    const pro = obterDefinicaoPlano("pro");
    const master = obterDefinicaoPlano("master");

    assert.strictEqual(basico.diasHistoricoVisivel, 7);
    assert.strictEqual(pro.diasHistoricoVisivel, 15);
    assert.strictEqual(master.diasHistoricoVisivel, 30);
  });

  it("3. Plano Básico deve conter exatamente as funcionalidades estipuladas pelo usuário", () => {
    const basico = obterDefinicaoPlano("basico");
    const nomes = basico.funcionalidades.map((f) => f.nome);

    assert.ok(nomes.some((n) => n.includes("Rastreamento em tempo real (24h)")));
    assert.ok(
      nomes.some((n) =>
        n.includes("Bloqueio e Desbloqueio remoto seguro (se disponivel para o veiculo)"),
      ),
    );
    assert.ok(nomes.some((n) => n.includes("Cercas virtuais (geofences)")));
    assert.ok(nomes.some((n) => n.includes("Trava virtual de estacionamento (Âncora)")));
    assert.ok(nomes.some((n) => n.includes("Auto-monitoramento interativo 24h via WhatsApp")));
    assert.ok(nomes.some((n) => n.includes("Mensalidade")));
    assert.ok(nomes.some((n) => n.includes("Histórico de Trajetos")));

    const itemBloqueio = basico.funcionalidades.find((f) => f.nome.includes("Bloqueio"));
    assert.ok(itemBloqueio?.detalhe.includes("0 km/h"));
  });

  it("4. Plano Pro deve conter tudo do Básico mais as funcionalidades exclusivas Pro", () => {
    const pro = obterDefinicaoPlano("pro");
    assert.strictEqual(pro.inclusoTexto, "Tudo incluso no Plano Básico, mais:");

    const nomes = pro.funcionalidades.map((f) => f.nome);
    assert.ok(nomes.some((n) => n.includes("Playback de viagens (Refazer Trajeto)")));
    assert.ok(nomes.some((n) => n.includes("Rotas e trajetos inteligentes")));
    assert.ok(nomes.some((n) => n.includes("Módulo de abastecimento")));
    assert.ok(nomes.some((n) => n.includes("Manutenção preventiva")));
    assert.ok(nomes.some((n) => n.includes("Histórico de Trajetos")));
    assert.ok(nomes.some((n) => n.includes("Compartilhamento de localização")));

    const itemRotas = pro.funcionalidades.find((f) => f.nome.includes("Compartilhamento"));
    assert.ok(itemRotas?.detalhe.includes("Waze, Google Maps e Apple Maps"));
  });

  it("5. Plano Master deve conter tudo do Pro mais as funcionalidades executivas e de frota", () => {
    const master = obterDefinicaoPlano("master");
    assert.strictEqual(master.inclusoTexto, "Tudo incluso no Plano Pro, mais:");

    const nomes = master.funcionalidades.map((f) => f.nome);
    assert.ok(nomes.some((n) => n.includes("Score de condução do motorista")));
    assert.ok(nomes.some((n) => n.includes("Gestão de equipe e funcionários")));
    assert.ok(nomes.some((n) => n.includes("Relatórios executivos e analíticos")));
    assert.ok(nomes.some((n) => n.includes("Visualização com clusterização no mapa")));
    assert.ok(nomes.some((n) => n.includes("Gestão de motoristas")));
    assert.ok(nomes.some((n) => n.includes("Desempenho da frota")));
    assert.ok(nomes.some((n) => n.includes("Histórico de Trajetos")));

    const itemRel = master.funcionalidades.find((f) => f.nome.includes("Relatórios executivos"));
    assert.ok(itemRel?.detalhe.includes("SGD e hash SHA-256"));
  });

  it("6. Texto do WhatsApp de Planos Comerciais deve conter todos os 3 planos sem inventar dados nem mencionar retenção de banco", () => {
    const texto = obterTextoPlanosComerciaisFormatado();

    assert.ok(texto.includes("PLANO BÁSICO"));
    assert.ok(texto.includes("PLANO PRO"));
    assert.ok(texto.includes("PLANO MASTER"));
    assert.ok(texto.includes("7 dias visíveis no aplicativo"));
    assert.ok(texto.includes("15 dias visíveis no aplicativo"));
    assert.ok(texto.includes("30 dias visíveis no aplicativo"));

    // Proibições estritas
    assert.ok(!texto.toLowerCase().includes("personalizado"));
    assert.ok(!texto.toLowerCase().includes("retenção"));
    assert.ok(!texto.toLowerCase().includes("retencao"));
  });

  it("7. Resumo do Plano para o Cliente deve exibir estritamente seu plano e incentivar upgrade se Básico ou Pro", () => {
    const txtBasico = obterTextoPlanoClienteFormatado("basico", 7);
    assert.ok(txtBasico.includes("PLANO BÁSICO"));
    assert.ok(txtBasico.includes("7 dias visíveis"));
    assert.ok(txtBasico.includes("upgrade"));

    const txtPro = obterTextoPlanoClienteFormatado("pro", 15);
    assert.ok(txtPro.includes("PLANO PRO"));
    assert.ok(txtPro.includes("15 dias visíveis"));
    assert.ok(txtPro.includes("upgrade para o Plano Master"));

    const txtMaster = obterTextoPlanoClienteFormatado("master", 30);
    assert.ok(txtMaster.includes("PLANO MASTER"));
    assert.ok(txtMaster.includes("30 dias visíveis"));
    assert.ok(!txtMaster.includes("upgrade"));
  });

  it("8. Descritivo para Contrato deve compilar funcionalidades sem quebrar sintaxe", () => {
    const descBasico = obterDescritivoFuncionalidadesContrato("basico");
    assert.ok(descBasico.includes("Rastreamento em tempo real (24h)"));
    assert.ok(descBasico.includes("7 dias visíveis"));

    const descPro = obterDescritivoFuncionalidadesContrato("pro");
    assert.ok(descPro.includes("Tudo incluso no Plano Básico, mais:"));
    assert.ok(descPro.includes("Playback de viagens"));

    const descMaster = obterDescritivoFuncionalidadesContrato("master");
    assert.ok(descMaster.includes("Tudo incluso no Plano Pro, mais:"));
    assert.ok(descMaster.includes("Score de condução"));
  });

  it("9. Governança de Acesso por Senha: Plano Básico é restrito a mapa e financeiro", async () => {
    const { podeAcessarModulo, podeAcessarRota } =
      await import("../../shared/lib/permissoesModulos");

    const sessionBasico: any = {
      userId: "cli-basico-1",
      role: "cliente",
      isCliente: true,
      plano: "basico",
      isTrialMaster: false,
    };

    // Módulos autorizados
    assert.ok(podeAcessarModulo(sessionBasico, "monitor-gps"));
    assert.ok(podeAcessarModulo(sessionBasico, "mensalidades"));
    assert.ok(podeAcessarModulo(sessionBasico, "atendimento"));

    // Módulos restritos ao Pro ou Master
    assert.strictEqual(podeAcessarModulo(sessionBasico, "rotas"), false);
    assert.strictEqual(podeAcessarModulo(sessionBasico, "abastecimento"), false);
    assert.strictEqual(podeAcessarModulo(sessionBasico, "manutencao"), false);
    assert.strictEqual(podeAcessarModulo(sessionBasico, "frota"), false);
    assert.strictEqual(podeAcessarModulo(sessionBasico, "motoristas"), false);
    assert.strictEqual(podeAcessarModulo(sessionBasico, "funcionarios"), false);

    // Rotas restritas
    assert.strictEqual(podeAcessarRota(sessionBasico, "/rotas"), false);
    assert.strictEqual(podeAcessarRota(sessionBasico, "/frota"), false);
    assert.strictEqual(podeAcessarRota(sessionBasico, "/abastecimento"), false);
    assert.strictEqual(podeAcessarRota(sessionBasico, "/funcionarios"), false);
  });

  it("10. Governança de Acesso por Senha: Plano Pro acessa Rotas e Abastecimento, mas bloqueia Frota e Equipe", async () => {
    const { podeAcessarModulo, podeAcessarRota } =
      await import("../../shared/lib/permissoesModulos");

    const sessionPro: any = {
      userId: "cli-pro-1",
      role: "cliente",
      isCliente: true,
      plano: "pro",
      isTrialMaster: false,
    };

    // Módulos do Pro liberados
    assert.ok(podeAcessarModulo(sessionPro, "monitor-gps"));
    assert.ok(podeAcessarModulo(sessionPro, "rotas"));
    assert.ok(podeAcessarModulo(sessionPro, "abastecimento"));
    assert.ok(podeAcessarModulo(sessionPro, "manutencao"));
    assert.ok(podeAcessarRota(sessionPro, "/rotas"));
    assert.ok(podeAcessarRota(sessionPro, "/abastecimento"));

    // Módulos exclusivos do Master bloqueados
    assert.strictEqual(podeAcessarModulo(sessionPro, "frota"), false);
    assert.strictEqual(podeAcessarModulo(sessionPro, "motoristas"), false);
    assert.strictEqual(podeAcessarModulo(sessionPro, "funcionarios"), false);
    assert.strictEqual(podeAcessarRota(sessionPro, "/frota"), false);
    assert.strictEqual(podeAcessarRota(sessionPro, "/funcionarios"), false);
  });

  it("11. Degustação Trial Master de 30 dias: Cliente Básico ou Pro novo usufrui de experiência Master", async () => {
    const { podeAcessarModulo, podeAcessarRota } =
      await import("../../shared/lib/permissoesModulos");

    const sessionTrial: any = {
      userId: "cli-novo-1",
      role: "cliente",
      isCliente: true,
      plano: "basico",
      isTrialMaster: true,
      diasRestantesTrial: 29,
    };

    // Com trial ativo, acessa tudo do Master
    assert.ok(podeAcessarModulo(sessionTrial, "rotas"));
    assert.ok(podeAcessarModulo(sessionTrial, "frota"));
    assert.ok(podeAcessarModulo(sessionTrial, "funcionarios"));
    assert.ok(podeAcessarRota(sessionTrial, "/rotas"));
    assert.ok(podeAcessarRota(sessionTrial, "/frota"));
    assert.ok(podeAcessarRota(sessionTrial, "/funcionarios"));
  });

  it("12. Buffer Interno de Histórico no Mapa: 10 dias (Básico), 20 dias (Pro) e 35 dias (Master)", async () => {
    const { obterRecursosPorPlano } =
      await import("../../features/monitor-gps/utils/planPermissions");

    const recBasico = obterRecursosPorPlano({
      userId: "cli-b",
      role: "cliente",
      isCliente: true,
      plano: "basico",
      isTrialMaster: false,
    } as any);
    assert.strictEqual(recBasico.diasHistorico, 10);
    assert.strictEqual(recBasico.compartilharLocalizacao, false);

    const recPro = obterRecursosPorPlano({
      userId: "cli-p",
      role: "cliente",
      isCliente: true,
      plano: "pro",
      isTrialMaster: false,
    } as any);
    assert.strictEqual(recPro.diasHistorico, 20);
    assert.strictEqual(recPro.compartilharLocalizacao, true);
    assert.strictEqual(recPro.montarRota, true);

    const recMaster = obterRecursosPorPlano({
      userId: "cli-m",
      role: "cliente",
      isCliente: true,
      plano: "master",
      isTrialMaster: false,
    } as any);
    assert.strictEqual(recMaster.diasHistorico, 35);
    assert.strictEqual(recMaster.compartilharLocalizacao, true);
    assert.strictEqual(recMaster.montarRota, true);
  });

  it("13. Regra Pétrea Hunter-Guardian: Ausência do caractere proibido nos arquivos tocados", () => {
    const arquivosParaVerificar = [
      "src/shared/lib/planosComerciais.ts",
      "src/shared/lib/permissoesModulos.ts",
      "src/features/monitor-gps/utils/planPermissions.ts",
      "src/features/chat/services/whatsappAutoMonitoramentoService.ts",
      "src/features/financeiro/services/propostaPdfService.ts",
      "src/features/clientes/services/contratoPdfService.ts",
      "src/features/clientes/services/geradorContratoPdfServer.ts",
    ];

    arquivosParaVerificar.forEach((relPath) => {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Arquivo deve existir: ${relPath}`);
      const conteudo = fs.readFileSync(fullPath, "utf-8");
      const linhas = conteudo.split("\n");

      linhas.forEach((linha, idx) => {
        // Ignora comentários de URL ou imports ou operadores booleanos '&&'
        const linhaSemBooleans = linha.replace(/&&/g, "").replace(/&[a-z0-9#]+;/gi, "");
        if (linhaSemBooleans.includes("&")) {
          // Permite apenas parâmetros de query string ou URLs
          const isUrlOrQuery =
            linhaSemBooleans.includes("http://") ||
            linhaSemBooleans.includes("https://") ||
            linhaSemBooleans.includes("?codigo=") ||
            linhaSemBooleans.includes("&codigo=");
          assert.ok(
            isUrlOrQuery,
            `Caractere proibido isolado encontrado no arquivo ${relPath} na linha ${idx + 1}: ${linha.trim()}`,
          );
        }
      });
    });
  });
});
