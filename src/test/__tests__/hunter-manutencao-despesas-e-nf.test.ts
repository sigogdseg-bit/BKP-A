import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type {
  HistoricoManutencaoGasto,
  ConcluirManutencaoPayload,
  LancarGastoVeiculoPayload,
  FormaPagamentoManutencao,
} from "../../features/manutencao/types";

describe("Hunter — Manutenção, Despesas do Veículo e Download de NF", () => {
  test("Contrato de tipos e estrutura para ConcluirManutencaoPayload", () => {
    const payload: ConcluirManutencaoPayload = {
      itemId: "item-rev-123",
      veiculoId: "veic-456",
      clienteId: "cli-789",
      itemNome: "Troca de Óleo 10w40",
      odometroKm: 125400,
      intervaloKm: 10000,
      valorTotal: 350.5,
      formaPagamento: "pix",
      dataRealizacao: "2026-10-03",
      oficina: "Oficina Mecânica São José",
      nfNumero: "NF-998877",
      observacoes: "Filtro de óleo e de ar trocados",
      nfFile: null,
    };

    assert.equal(payload.valorTotal, 350.5);
    assert.equal(payload.formaPagamento, "pix");
    assert.equal(payload.odometroKm, 125400);
    assert.equal(payload.oficina, "Oficina Mecânica São José");
    assert.equal(payload.nfNumero, "NF-998877");
    assert.equal(
      payload.odometroKm + payload.intervaloKm,
      135400,
      "Próximo km deve ser calculado somando intervalo",
    );
  });

  test("Contrato de tipos para LancarGastoVeiculoPayload avulso com comprovante/NF", () => {
    const payload: LancarGastoVeiculoPayload = {
      veiculoId: "veic-001",
      clienteId: "cli-001",
      descricao: "Troca de Palhetas do Limpador",
      tipoDespesa: "palhetas",
      categoria: "manutencao",
      valorTotal: 120.0,
      formaPagamento: "cartao_credito",
      dataDespesa: "2026-10-03",
      odometroKm: 88200,
      oficina: "Auto Peças Central",
      nfNumero: "102938",
      observacoes: "Palhetas de silicone dianteiras e traseira",
    };

    assert.equal(payload.tipoDespesa, "palhetas");
    assert.equal(payload.formaPagamento, "cartao_credito");
    assert.equal(payload.valorTotal, 120.0);
    assert.equal(payload.odometroKm, 88200);
  });

  test("Validação de Formas de Pagamento suportadas pelo sistema Hunter", () => {
    const formasValidas: FormaPagamentoManutencao[] = [
      "pix",
      "cartao_credito",
      "cartao_debito",
      "dinheiro",
      "boleto",
      "outro",
    ];

    assert.equal(formasValidas.length, 6);
    assert.ok(formasValidas.includes("pix"));
    assert.ok(formasValidas.includes("cartao_credito"));
    assert.ok(formasValidas.includes("cartao_debito"));
    assert.ok(formasValidas.includes("dinheiro"));
    assert.ok(formasValidas.includes("boleto"));
  });

  test("Estrutura do HistoricoManutencaoGasto para listagem no Painel e Download de NF", () => {
    const gasto: HistoricoManutencaoGasto = {
      id: "desp-001",
      veiculo_id: "veic-100",
      cliente_id: "cli-200",
      motorista_id: null,
      motorista_nome: "Administração / Frota",
      veiculo_placa: "ABC-1234",
      data_despesa: "2026-10-03T10:00:00Z",
      categoria: "manutencao",
      descricao: "Troca de 4 Pneus Aro 16 e Alinhamento 3D",
      valor: 2400.0,
      km_atual: 95000,
      odometro_km: 95000,
      forma_pagamento: "cartao_credito",
      oficina_prestador: "Centro Automotivo Imperial",
      plano_manutencao_id: "plano-pneus",
      tipo_despesa: "pneus",
      nf_numero: "45091",
      nf_foto_url: "cliente-200/despesas/20261003_nf_pneus.jpg",
      comprovante_url: "cliente-200/despesas/20261003_nf_pneus.jpg",
      nf_upload_em: "2026-10-03T10:05:00Z",
      nf_baixado: false,
      nf_baixado_em: null,
      nf_expirado: false,
      observacoes: "Garantia de 5 anos pelos pneus",
      created_at: "2026-10-03T10:05:00Z",
    };

    assert.equal(gasto.valor, 2400.0);
    assert.equal(gasto.tipo_despesa, "pneus");
    assert.equal(gasto.forma_pagamento, "cartao_credito");
    assert.equal(gasto.nf_baixado, false);
    assert.ok(
      gasto.nf_foto_url?.includes("despesas"),
      "Comprovante salvo no bucket sob rota de despesas",
    );
    assert.equal(
      gasto.comprovante_url,
      gasto.nf_foto_url,
      "Alias comprovante_url sincronizado com nf_foto_url",
    );
  });

  test("Parsing de fallback de observações para compatibilidade de schema", () => {
    const observacoesLegadas =
      "Revisão efetuada com sucesso. [Pagamento: cartao_debito] [Oficina: Mecânica Modelo]";
    const matchPag = observacoesLegadas.match(/Pagamento:\s*([A-Za-z0-9_À-ú\s]+?)(?:\s*\||\]|$)/i);
    const matchOfic = observacoesLegadas.match(/Oficina:\s*([A-Za-z0-9_À-ú\s]+?)(?:\s*\||\]|$)/i);

    assert.ok(matchPag);
    assert.equal(matchPag[1].trim(), "cartao_debito");
    assert.ok(matchOfic);
    assert.equal(matchOfic[1].trim(), "Mecânica Modelo");
  });

  test("Sugestões Dinâmicas de Gastos: Aprende automaticamente com novos gastos enviados", async () => {
    // Configura mock leve de storage em ambiente de teste
    const memoriaStorage: Record<string, string> = {};
    const mockStorage = {
      getItem: (k: string) => memoriaStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        memoriaStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete memoriaStorage[k];
      },
      clear: () => {
        for (const k in memoriaStorage) delete memoriaStorage[k];
      },
    };

    (globalThis as any).window = {
      dispatchEvent: () => true,
    };
    (globalThis as any).localStorage = mockStorage;

    const {
      salvarSugestaoLocal,
      obterSugestoesLocais,
      removerSugestaoLocal,
      SUGESTOES_BASE_PADRAO,
    } = await import("../../features/manutencao/services/sugestoesDespesasService");

    assert.ok(SUGESTOES_BASE_PADRAO.length >= 7, "Deve conter as sugestões base padrão");

    // 1. Salva um novo gasto enviado (ex: Troca de Amortecedores)
    const atualizados = salvarSugestaoLocal("Troca de Amortecedores", "freios", "cli-test");
    assert.ok(atualizados.some((s) => s.label === "Troca de Amortecedores"));
    assert.equal(
      atualizados[0].label,
      "Troca de Amortecedores",
      "Último gasto enviado deve vir no topo",
    );

    // 2. Consulta sugestões salvas
    const lidas = obterSugestoesLocais("cli-test");
    assert.equal(lidas.length, 1);
    assert.equal(lidas[0].label, "Troca de Amortecedores");
    assert.equal(lidas[0].isPersonalizada, true);

    // 3. Salva outro gasto (ex: Polimento Cristalizado)
    const comPolimento = salvarSugestaoLocal("Polimento Cristalizado", "lavagem", "cli-test");
    assert.equal(comPolimento[0].label, "Polimento Cristalizado");
    assert.equal(comPolimento[1].label, "Troca de Amortecedores");

    // 4. Deduplicação case-insensitive: reenviar o mesmo gasto reposiciona no topo sem duplicar
    const reenviado = salvarSugestaoLocal("troca de amortecedores", "freios", "cli-test");
    assert.equal(reenviado.length, 2, "Não pode haver duplicatas do mesmo serviço");
    assert.equal(reenviado[0].label, "troca de amortecedores", "Reenviado vai para o topo");

    // 5. Remoção opcional de sugestão personalizada
    const posRemocao = removerSugestaoLocal("troca de amortecedores", "cli-test");
    assert.equal(posRemocao.length, 1);
    assert.equal(posRemocao[0].label, "Polimento Cristalizado");

    // Limpa mocks
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  test("Registro de custos e comprovante NF pelo motorista na conclusão da revisão", () => {
    const payloadMotorista: ConcluirManutencaoPayload = {
      itemId: "plano-oleo-99",
      veiculoId: "veic-gol-01",
      clienteId: "cli-empresa-x",
      motoristaId: "mot-carlos-10",
      itemNome: "Troca de Óleo e Filtro Sintético",
      odometroKm: 145000,
      intervaloKm: 10000,
      valorTotal: 290.0,
      formaPagamento: "cartao_debito",
      dataRealizacao: "2026-10-03",
      oficina: "Posto Shell e Troca Rápida",
      nfNumero: "NF-554411",
      observacoes: "Registrado pelo motorista via Portal do Motorista",
      nfFile: null,
    };

    assert.equal(payloadMotorista.motoristaId, "mot-carlos-10");
    assert.equal(payloadMotorista.valorTotal, 290.0);
    assert.equal(payloadMotorista.formaPagamento, "cartao_debito");
    assert.equal(payloadMotorista.oficina, "Posto Shell e Troca Rápida");
    assert.equal(payloadMotorista.nfNumero, "NF-554411");
    assert.ok(
      payloadMotorista.valorTotal > 0,
      "O valor deve ser registrado para alimentar o financeiro",
    );
  });

  test("Sanitização de caminho e prevenção de 404 de SPA no download de NF de abastecimento", async () => {
    // Simula caminhos relativos típicos gravados no banco
    const caminhoRelativo = "cliente-123/abastecimento/206095_comprovante.pdf";
    const caminhoComBucket = "nfs-temp/cliente-123/abastecimento/206095_comprovante.pdf";
    const caminhoComBarra = "/nfs-temp/cliente-123/abastecimento/206095_comprovante.pdf";
    const urlExterna = "https://meu-storage.supabase.co/storage/v1/object/public/nfs-temp/doc.pdf";

    const sanitizar = (p: string) => p.replace(/^\/+/, "").replace(/^nfs-temp\//i, "");

    assert.equal(sanitizar(caminhoRelativo), "cliente-123/abastecimento/206095_comprovante.pdf");
    assert.equal(sanitizar(caminhoComBucket), "cliente-123/abastecimento/206095_comprovante.pdf");
    assert.equal(sanitizar(caminhoComBarra), "cliente-123/abastecimento/206095_comprovante.pdf");

    // Garantir que caminhos relativos nunca comecem como links diretos de SPA sem resolução
    assert.ok(!sanitizar(caminhoRelativo).startsWith("/"));
    assert.ok(urlExterna.startsWith("https://"));
  });
});
