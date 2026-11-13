// hunter-rota-monitorada-anti-falso-positivo-e-tabela-revendedores.test.ts
// Testes para validação da correção de falsos positivos em Rotas Monitoradas,
// anti-duplicação de alertas WhatsApp e modo tabela padrão na Rede de Revendedores

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("SIGO Guardião — Correção Rota Monitorada, Anti-Duplicação e Padrão Tabela Revendedores", () => {
  it("1. Rede de Revendedores: modo padrão de exibição deve ser tabela ('lista') e não cards ao entrar", () => {
    const revendedoresViewPath = path.resolve(
      process.cwd(),
      "src/features/revendedores/components/RevendedoresView.tsx",
    );
    const content = fs.readFileSync(revendedoresViewPath, "utf-8");

    // Verifica que o fallback de modoExibicao é 'lista'
    assert.match(
      content,
      /localStorage\.getItem\("hunter_revendedores_modo_exibicao"\) as "cards" \| "lista"\) \|\| "lista"/,
      "RevendedoresView deve definir o modo de exibição padrão como 'lista' (tabela).",
    );
  });

  it("2. GpsMonitorView: Proíbe estritamente disparo de desvio de rota com veículo estacionado / ignição desligada", () => {
    const gpsMonitorViewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(gpsMonitorViewPath, "utf-8");

    // Verifica que exige movimento real ou ignição ligada
    assert.match(
      content,
      /const veiculoEmMovimento =\s*Boolean\(veiculoSelecionado\.ignicao\) \|\| \(Number\(veiculoSelecionado\.velocidade\) \|\| 0\) > 3;/,
      "Deve verificar se o veículo está de fato em movimento ou com ignição ligada antes de avaliar desvio de rota.",
    );
    assert.match(
      content,
      /if \(!veiculoEmMovimento\) \{\s*return;\s*\}/,
      "Deve abortar avaliação de desvio se o veículo estiver estacionado/desligado.",
    );
  });

  it("3. GpsMonitorView: Proíbe avaliação de desvio de rota se a telemetria for antiga (> 10min) ou sem comunicação", () => {
    const gpsMonitorViewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(gpsMonitorViewPath, "utf-8");

    assert.match(
      content,
      /const statusCom = avaliarStatusComunicacao\(veiculoSelecionado\.ultima_atualizacao\);/,
      "Deve avaliar a saúde da comunicação antes de avaliar desvio de rota.",
    );
    assert.match(
      content,
      /if \(!statusCom\.ativo \|\| \(statusCom\.minutos !== null && statusCom\.minutos > 10\)\)/,
      "Deve abortar se a comunicação estiver inativa ou se o pacote GPS tiver mais de 10 minutos de defasagem.",
    );
  });

  it("4. GpsMonitorView: Elimina chamada duplicada de notificação (apenas salvarAlertaSeguranca atômico)", () => {
    const gpsMonitorViewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(gpsMonitorViewPath, "utf-8");

    // Localiza o bloco do desvio de rota
    const blocoDesvio = content.substring(
      content.indexOf("if (emDesvio && !rotaMonitoradaAtiva.desvio_detectado)"),
      content.indexOf("setRotaMonitoradaAtiva((prev)"),
    );

    assert.ok(
      blocoDesvio.includes("salvarAlertaSeguranca"),
      "Deve persistir via salvarAlertaSeguranca.",
    );
    assert.ok(
      !blocoDesvio.includes("enviarNotificacaoViaBd"),
      "NÃO deve chamar enviarNotificacaoViaBd em duplicidade após salvarAlertaSeguranca.",
    );
  });

  it("5. GpsMonitorView: Conclui a rota automaticamente ao se aproximar do destino final", () => {
    const gpsMonitorViewPath = path.resolve(
      process.cwd(),
      "src/features/monitor-gps/components/GpsMonitorView.tsx",
    );
    const content = fs.readFileSync(gpsMonitorViewPath, "utf-8");

    assert.match(
      content,
      /distDestino <= Math\.max\(120, rotaMonitoradaAtiva\.tolerancia_desvio_metros\)/,
      "Deve detectar chegada no destino final e concluir a rota automaticamente.",
    );
    assert.match(
      content,
      /encerrarRotaMonitorada\(rotaMonitoradaAtiva\.id, "concluida"\)/,
      "Deve encerrar a rota como concluída ao atingir o destino.",
    );
  });

  it("6. server.ts: Deduplicação unificada de desvio_rota / rota_monitorada com janela de 15 minutos e limpeza de placa duplicada", () => {
    const serverPath = path.resolve(process.cwd(), "src/server.ts");
    const content = fs.readFileSync(serverPath, "utf-8");

    // Unificação de tipos para desvio de rota no WhatsApp
    assert.match(
      content,
      /const isAlertaRota = params\.tipo === "desvio_rota" \|\| params\.tipo === "rota_monitorada";/,
      "Deve reconhecer desvio_rota e rota_monitorada sob o mesmo canal de rota.",
    );
    assert.match(
      content,
      /janelaDedupMs\s*=\s*900000;/,
      "Janela de deduplicação de desvio de rota deve ser de 15 minutos (900000 ms).",
    );
    assert.match(
      content,
      /const tipoDedupCanonico = isAlertaRota \? "desvio_rota" : params\.tipo;/,
      "Chave de deduplicação deve usar tipo canônico desvio_rota para ambas as chamadas.",
    );
    assert.match(
      content,
      /tituloFormatado\.replace\(regexPlacaDupla, ` — \${params\.placa}`\)/,
      "Deve higienizar título para eliminar placas repetidas como '— AXH0E44 — AXH0E44'.",
    );
  });

  it("7. Banco de Dados: Trigger trg_anti_duplicacao_notificacoes_sistema com janela de 15 minutos para desvio de rota", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261028211500_sigo_guardiao_anti_duplicacao_desvio_rota.sql",
    );
    assert.ok(fs.existsSync(migrationPath), "Arquivo de migração SQL deve existir.");
    const sqlContent = fs.readFileSync(migrationPath, "utf-8");

    assert.match(
      sqlContent,
      /NEW\.tipo IN \('desvio_rota', 'rota_monitorada'\)/,
      "Trigger deve tratar desvio_rota e rota_monitorada no mesmo grupo.",
    );
    assert.match(
      sqlContent,
      /created_at > NOW\(\) - INTERVAL '15 minutes'/,
      "Janela do trigger no banco deve ser de 15 minutos para desvio de rota.",
    );
    assert.match(
      sqlContent,
      /NOTIFY pgrst, 'reload schema';/,
      "Migração deve conter NOTIFY pgrst reload schema.",
    );
  });
});
