import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatarMensagemRelatorioDiario,
  MetricasSistemaDiarias,
} from "@/features/relatorios/services/relatorioDiarioMetricasService";

describe("HUNTER / SIGO GUARDIÃO — Anti-Repetição de Alertas de Geofence e Ciclo de Vida de NFs", () => {
  it("1. Máquina de Estados de Geofence: DDL deve criar veiculo_areas_estado e trigger deve respeitar transição de estado", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261019230000_hunter_anti_repeticao_geofence_e_ciclo_vida_nfs.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração deve existir");
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Valida tabela de estados
    assert.ok(
      sql.includes("CREATE TABLE IF NOT EXISTS public.veiculo_areas_estado"),
      "Deve criar veiculo_areas_estado",
    );
    assert.ok(
      sql.includes("CHECK (estado IN ('dentro', 'fora'))"),
      "Deve validar estado dentro e fora",
    );
    assert.ok(
      sql.includes("whatsapp_enviado BOOLEAN DEFAULT false"),
      "Deve ter controle de whatsapp_enviado",
    );

    // Valida transição estrita na trigger
    assert.ok(
      sql.includes(
        "v_estado_anterior = 'dentro' AND v_dist_area_new > (v_area.raio_metros + 15.0)",
      ),
      "Saída requer transição de dentro para fora com histerese",
    );
    assert.ok(
      sql.includes("UPDATE public.veiculo_areas_estado"),
      "Deve atualizar estado ao transitar",
    );
    assert.ok(
      sql.includes("v_estado_anterior = 'fora' AND v_dist_area_new <= v_area.raio_metros"),
      "Entrada requer transição de fora para dentro",
    );

    // Script mestre deve conter a migração
    const mestrePath = path.resolve(process.cwd(), "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");
    const mestreSql = fs.readFileSync(mestrePath, "utf-8");
    assert.ok(
      mestreSql.includes("veiculo_areas_estado"),
      "Script mestre deve espelhar veiculo_areas_estado",
    );
  });

  it("2. Servidor server.ts: despacharWhatsappAlertaServer deve verificar veiculo_areas_estado e aplicar dedup estendido", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    assert.ok(
      serverCode.includes(
        "veiculo_areas_estado?veiculo_id=eq.${veiculoId}&ultimo_evento_tipo=eq.${params.tipo}&whatsapp_enviado=eq.true",
      ),
      "Deve verificar no banco se WhatsApp já foi enviado para esta transição de área",
    );
    assert.ok(
      serverCode.includes("janelaDedupMs = isAlertaArea ? 43200000 : 300000"),
      "Deve aplicar janela estendida de 12 horas para alertas de área",
    );
    assert.ok(
      serverCode.includes("PATCH"),
      "Deve marcar whatsapp_enviado como true após despacho com sucesso",
    );
  });

  it("3. Relatório Diário de Métricas: Seção 4 deve detalhar Cliente e Veículo nos chips com alto consumo", () => {
    const mockMetricas: MetricasSistemaDiarias = {
      inicioCicloEgress: "18/10/2026",
      fimCicloEgress: "18/11/2026",
      egressCicloAtualMb: "120.00",
      egressCicloAntMb: "400.00",
      clientesAtivos: 40,
      clientesAguardando: 2,
      clientesBloqueados: 0,
      totalClientes: 42,
      clientesInadimplentes: 0,
      valorTotalInadimplente: "0.00",
      totalRecebidoMes: "3000.00",
      totalGastoMes: "1000.00",
      totalCaixaMes: "2000.00",
      inicioCicloChips: "23/10/2026",
      diasParaProximoCicloChips: 4,
      chipsMenor10Mb: 38,
      chipsEntre10e15Mb: 2,
      chipsAcima15Mb: 1,
      totalChips: 41,
      detalhesChips: [
        {
          linha: "24999990001",
          iccid: "8955000000001",
          consumoMb: 18.5,
          clienteNome: "Comando 28 BPM",
          veiculoPlaca: "AXH0E44",
          veiculoModelo: "Volvo XC 60",
        },
        {
          linha: "24999990002",
          iccid: "8955000000002",
          consumoMb: 12.3,
          clienteNome: "Dario Novaes",
          veiculoPlaca: "KXZ1234",
          veiculoModelo: "Corolla",
        },
      ],
      mesReferencia: "10/2026",
      whatsappMes: 150,
      whatsappTotal: 1200,
      suporteMes: 5,
      suporteTotal: 40,
      totalAlertas: 10,
      alertasNaoReconhecidos: 0,
      resumoTiposAlertas: {},
      infra: {
        supabaseEgressAtualMb: "120",
        supabaseEgressLimiteMb: 5000,
        supabaseEgressPercentual: "2.4",
        supabaseBancoAtualMb: 45,
        supabaseBancoLimiteMb: 500,
        supabaseBancoPercentual: "9.0",
        cloudflareReqDia: 1500,
        cloudflareReqLimiteDia: 100000,
        cloudflareReqPercentual: "1.5",
        flyVmsAtivas: 1,
        flyVmsLimite: 3,
        flyRamAtualMb: 140,
        flyRamLimiteMb: 256,
        flyVolumeAtualGb: 1,
        flyVolumeLimiteGb: 3,
        flyTrafegoLimiteGb: 100,
      },
      gateway: {
        conectado: true,
        status: "operacional",
        uptimeHoras: 72,
        memoriaRamMb: 120,
        numero: "5524992494030",
      },
      operacao: {
        veiculosComunicando24h: 30,
        veiculosIncomunicaveis24h: 0,
        rastreadoresEstoque: 5,
        rastreadoresInstalados: 30,
        chipsLivres: 6,
        instalacoesAgendadas: 2,
        instalacoesAAgendar: 0,
      },
    };

    const msg = formatarMensagemRelatorioDiario(mockMetricas, { chips: true });

    assert.ok(msg.includes("CONSUMO DE DADOS DOS CHIPS M2M"), "Deve conter a Seção de Chips");
    assert.ok(msg.includes("Comando 28 BPM"), "Deve exibir o nome do cliente");
    assert.ok(msg.includes("AXH0E44"), "Deve exibir a placa do veículo");
    assert.ok(msg.includes("Volvo XC 60"), "Deve exibir o modelo do veículo");
  });

  it("4. Ciclo de Vida de Notas Fiscais: RPC hunter_processar_ciclo_vida_nfs deve gerenciar os 4 estágios temporais", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261019230000_hunter_anti_repeticao_geofence_e_ciclo_vida_nfs.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    assert.ok(
      sql.includes("hunter_processar_ciclo_vida_nfs"),
      "Deve definir RPC hunter_processar_ciclo_vida_nfs",
    );
    assert.ok(
      sql.includes("alerta_nf_expurgo_24h"),
      "Estágio 1: 24h para expurgo (após 48h sem download)",
    );
    assert.ok(
      sql.includes("alerta_nf_expurgo_6h"),
      "Estágio 2: 6h para expurgo (após 72h sem download)",
    );
    assert.ok(
      sql.includes("alerta_nf_expurgo_30m"),
      "Estágio 3: 30min para expurgo (após 78h sem download)",
    );
    assert.ok(sql.includes("v_horas_passadas >= 78.5"), "Estágio 4: Expurgo definitivo aos 78.5h");
  });

  it("5. Modal de Ciência: ModalCienciaDesativarNfModal deve exigir ciência expressa para desativar", () => {
    const modalPath = path.resolve(
      process.cwd(),
      "src/features/configuracoes/components/ModalCienciaDesativarNfModal.tsx",
    );
    assert.ok(fs.existsSync(modalPath), "ModalCienciaDesativarNfModal.tsx deve existir");
    const code = fs.readFileSync(modalPath, "utf-8");

    assert.ok(code.includes("createPortal"), "Deve renderizar via createPortal");
    assert.ok(code.includes("document.body"), "Deve anexar ao document.body");
    assert.ok(code.includes("48 horas"), "Deve informar o prazo de 48 horas");
    assert.ok(
      code.includes("excluídas definitivamente"),
      "Deve conter o termo de exclusão definitiva",
    );
    assert.ok(
      code.includes("disabled={!cienteMarcado"),
      "Botão deve ficar desabilitado até marcar ciência",
    );
  });
});
