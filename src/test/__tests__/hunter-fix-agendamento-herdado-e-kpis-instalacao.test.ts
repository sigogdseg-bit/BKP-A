import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularResumoRepasse,
  formatarLabelTipoVeiculo,
  formatarTituloVeiculoInstalacao,
  ehInstalacaoDiretaSemInstalador,
  formatarDataConclusaoCurta,
} from "../../features/instalacoes/services/instalacaoService";
import type { Instalacao } from "../../features/instalacoes/types";

const raiz = path.resolve(process.cwd());

describe("Hunter — Correção de Agendamento Herdado, Deduplicação de KPIs e Títulos de Veículos", () => {
  test("calcularResumoRepasse deduplica clientes que já possuem ordem lançada e calcula previsto em abertas", () => {
    const instalacoes: Instalacao[] = [
      {
        id: "787186cf-e411-4632-b32b-8dd6fbcab75e",
        cliente_id: "cli-alex",
        instalador_id: "inst-filipe",
        veiculo_id: "veic-moto",
        marca: "",
        modelo: "Veículo Padrão",
        ano: null,
        cor: null,
        placa: "SEMPLACA",
        tipo_veiculo: "moto_eletrica",
        rastreador_imei: "865893084725342",
        rastreador_modelo: "J16 4G",
        chip_iccid: null,
        posicao_instalacao: null,
        km_instalacao: 0,
        observacoes: null,
        status: "agendada",
        motivo_pendencia_recusa: null,
        valor_instalacao: 60,
        status_pagamento: "pendente",
        data_agendamento: "2026-11-13",
        hora_agendamento: "09:00",
        pago_em: null,
        pago_por: null,
        created_at: "2026-11-12T22:00:00Z",
        updated_at: "2026-11-12T23:17:00Z",
      },
      {
        id: "6577b629-2557-4a22-99ba-4e0467ef30e7",
        cliente_id: "cli-alex",
        instalador_id: "inst-filipe",
        veiculo_id: "veic-montana",
        marca: "GM",
        modelo: "MONTANA SPORT",
        ano: 2026,
        cor: null,
        placa: "LTK1A94",
        tipo_veiculo: "carro",
        rastreador_imei: "869890084959182",
        rastreador_modelo: "J16 4G",
        chip_iccid: null,
        posicao_instalacao: "Atrás do painel",
        km_instalacao: 151451,
        observacoes: null,
        status: "concluida",
        motivo_pendencia_recusa: null,
        valor_instalacao: 120,
        status_pagamento: "pago",
        data_agendamento: "2026-10-20",
        hora_agendamento: "09:00",
        pago_em: "2026-10-21T10:00:00Z",
        pago_por: "adm-1",
        created_at: "2026-10-20T09:00:00Z",
        updated_at: "2026-10-20T10:00:00Z",
      },
      {
        id: "9c82f0cd-8a5a-4d18-b8b9-d14e2269dba3",
        cliente_id: "cli-weidisson",
        instalador_id: "inst-gilmar",
        veiculo_id: "veic-weidisson",
        marca: "Veículo",
        modelo: "Padrão",
        ano: 2026,
        cor: null,
        placa: "A DEFINIR",
        tipo_veiculo: "carro",
        rastreador_imei: "869890084963382",
        rastreador_modelo: "J16 4G",
        chip_iccid: null,
        posicao_instalacao: null,
        km_instalacao: 0,
        observacoes: null,
        status: "agendada",
        motivo_pendencia_recusa: null,
        valor_instalacao: 150,
        status_pagamento: "pendente",
        data_agendamento: "2026-10-10",
        hora_agendamento: "10:00",
        pago_em: null,
        pago_por: null,
        created_at: "2026-10-10T10:00:00Z",
        updated_at: "2026-10-10T10:00:00Z",
      },
      {
        id: "9fabe5c7-15fc-4d35-a2c1-4c67fd1a0c15",
        cliente_id: "cli-dario",
        instalador_id: "inst-novaes",
        veiculo_id: "veic-volvo",
        marca: "Volvo",
        modelo: "XC 60 T6",
        ano: 2012,
        cor: null,
        placa: "AXH0E44",
        tipo_veiculo: "carro",
        rastreador_imei: "863874085222366",
        rastreador_modelo: "J16 4G",
        chip_iccid: null,
        posicao_instalacao: "abaixo da grelha",
        km_instalacao: 182759,
        observacoes: null,
        status: "concluida",
        motivo_pendencia_recusa: null,
        valor_instalacao: 50,
        status_pagamento: "pago",
        data_agendamento: null,
        hora_agendamento: null,
        pago_em: "2026-10-01T10:00:00Z",
        pago_por: "adm-1",
        created_at: "2026-10-01T10:00:00Z",
        updated_at: "2026-10-01T10:00:00Z",
      },
    ];

    const clientesAgendamento = [
      { id: "cli-alex", status_agendamento: "agendado", data_agendamento: "2026-11-13" },
      { id: "cli-weidisson", status_agendamento: "aguardando_agendamento", data_agendamento: null },
    ];

    const resumo = calcularResumoRepasse(instalacoes, clientesAgendamento, 50);

    // 4 ordens reais, sem dupla contagem de cli-alex ou cli-weidisson
    assert.equal(resumo.totalInstalacoes, 4);
    assert.equal(resumo.totalConcluidas, 2);
    assert.equal(resumo.totalNaoInstaladas, 2);
    assert.equal(resumo.totalAgendadas, 2);
    // Somente concluidas contam em aPagar/aReceber (ambas já pagas = 0)
    assert.equal(resumo.valorTotalPendente, 0);
    assert.equal(resumo.valorTotalPago, 170);
    // Ordens em aberto agendadas somam previsão de R$ 60 + R$ 150 = R$ 210
    assert.equal(resumo.valorPrevistoAgendadas, 210);
  });

  test("formatarLabelTipoVeiculo e formatarTituloVeiculoInstalacao higienizam placeholders e duplicações", () => {
    assert.equal(formatarLabelTipoVeiculo("moto_eletrica"), "Moto Elétrica");
    assert.equal(formatarLabelTipoVeiculo("carro"), "Carro");
    assert.equal(formatarLabelTipoVeiculo("caminhao"), "Caminhão");

    assert.equal(
      formatarTituloVeiculoInstalacao({
        marca: "A DEFINIR",
        modelo: "Veículo Padrão",
        ano: null,
        tipo_veiculo: "moto_eletrica",
      }),
      "Moto Elétrica (Preencher na instalação)",
    );

    assert.equal(
      formatarTituloVeiculoInstalacao({
        marca: "Veículo",
        modelo: "Padrão",
        ano: 2026,
        tipo_veiculo: "carro",
      }),
      "Carro (Preencher na instalação)",
    );

    assert.equal(
      formatarTituloVeiculoInstalacao({
        marca: "A DEFINIR",
        modelo: "GM MONTANA GM/ MONTANA SPORT",
        ano: 2026,
        tipo_veiculo: "carro",
      }),
      "GM MONTANA SPORT (2026)",
    );

    assert.equal(
      formatarTituloVeiculoInstalacao({
        marca: "Volvo",
        modelo: "XC 60 T6",
        ano: 2012,
        tipo_veiculo: "carro",
      }),
      "Volvo XC 60 T6 (2012)",
    );
  });

  test("Identificação de instalação direta/própria e formatação de conclusão", () => {
    // Instalação com instalador_role='superadmin' ou 'adm' é direta
    assert.equal(
      ehInstalacaoDiretaSemInstalador({
        instalador_role: "superadmin",
        status: "concluida",
        valor_instalacao: 0,
      }),
      true,
    );

    // Instalação concluída com valor zero e sem agendamento é direta
    assert.equal(
      ehInstalacaoDiretaSemInstalador({
        instalador_role: "instalador",
        status: "concluida",
        valor_instalacao: 0,
        data_agendamento: null,
      }),
      true,
    );

    // Instalação terceirizada padrão com instalador
    assert.equal(
      ehInstalacaoDiretaSemInstalador({
        instalador_role: "instalador",
        status: "concluida",
        valor_instalacao: 120,
        data_agendamento: "2026-10-20",
      }),
      false,
    );

    const formatado = formatarDataConclusaoCurta("2026-10-03T12:00:00Z");
    assert.ok(formatado === "03/10/2026" || formatado === "02/10/2026");
  });

  test("Integridade estrutural da UI, serviços e migração SQL 20261112203000 e 20261112204500", () => {
    const viewPath = path.join(raiz, "src/features/instalacoes/components/InstalacoesView.tsx");
    const servicePath = path.join(raiz, "src/features/instalacoes/services/instalacaoService.ts");
    const clienteServicePath = path.join(raiz, "src/features/clientes/services/clienteService.ts");
    const migrationPath = path.join(
      raiz,
      "supabase/migrations/20261112203000_hunter_fix_agendamento_herdado_e_marca_instalacao.sql",
    );
    const bundlePath = path.join(raiz, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    const viewSrc = fs.readFileSync(viewPath, "utf8");
    const serviceSrc = fs.readFileSync(servicePath, "utf8");
    const clienteSrc = fs.readFileSync(clienteServicePath, "utf8");
    const migrationSrc = fs.readFileSync(migrationPath, "utf8");
    const bundleSrc = fs.readFileSync(bundlePath, "utf8");

    assert.ok(viewSrc.includes("formatarTituloVeiculoInstalacao(inst)"));
    assert.ok(viewSrc.includes("formatarLabelTipoVeiculo((inst as any).tipo_veiculo)"));
    assert.ok(viewSrc.includes("Previsto em abertas: R$"));
    assert.ok(viewSrc.includes("getStatusBadge(inst.status, inst.data_agendamento)"));
    assert.ok(viewSrc.includes("Instalado (Direto)"));
    assert.ok(viewSrc.includes("Kit Instalado (Direto)"));
    assert.ok(viewSrc.includes("Isenta (Direta)"));
    assert.ok(viewSrc.includes("ehInstalacaoDiretaSemInstalador(inst)"));

    assert.ok(serviceSrc.includes("clientesSemOrdem"));
    assert.ok(serviceSrc.includes("clientesSemOrdemQtd"));
    assert.ok(serviceSrc.includes("ehInstalacaoDiretaSemInstalador"));
    assert.ok(clienteSrc.includes("ehPlaceholderMm"));
    assert.ok(clienteSrc.includes('const marcaFinal = ehPlaceholderMm ? ""'));

    assert.ok(migrationSrc.includes("v_todos_veiculos_concluidos"));
    assert.ok(migrationSrc.includes("v_pode_herdar_agendamento"));
    assert.ok(migrationSrc.includes("c.status_agendamento IS DISTINCT FROM 'concluido'"));
    assert.ok(migrationSrc.includes("NOTIFY pgrst, 'reload schema';"));
    assert.ok(
      bundleSrc.includes(
        "Migration: 20261112203000_hunter_fix_agendamento_herdado_e_marca_instalacao.sql",
      ),
    );
    assert.ok(
      bundleSrc.includes(
        "Migration: 20261112204500_hunter_instalacao_direta_axh0e44_sem_repasse.sql",
      ),
    );
    const mig2045 = fs.readFileSync(
      path.join(
        raiz,
        "supabase/migrations/20261112204500_hunter_instalacao_direta_axh0e44_sem_repasse.sql",
      ),
      "utf8",
    );
    assert.ok(mig2045.includes("'instalador_role', p.role::TEXT"));
    assert.ok(mig2045.includes("NOTIFY pgrst, 'reload schema';"));
  });
});
