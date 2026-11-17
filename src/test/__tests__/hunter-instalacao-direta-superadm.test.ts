import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registrarInstalacaoDireta } from "../../features/instalacoes/services/instalacaoService";

describe("Hunter — Instalação Direta para SuperADM (Veículos Já Instalados)", () => {
  const rootDir = process.cwd();

  it("1. instalacaoService deve exportar a função registrarInstalacaoDireta", () => {
    assert.equal(
      typeof registrarInstalacaoDireta,
      "function",
      "registrarInstalacaoDireta deve ser uma função exportada",
    );
  });

  it("2. ModalInstalacaoDireta deve renderizar via ModalPortal e conter seções de cliente, veículo e rastreadores em estoque", () => {
    const modalPath = path.join(
      rootDir,
      "src/features/instalacoes/components/ModalInstalacaoDireta.tsx",
    );
    assert.ok(fs.existsSync(modalPath), "ModalInstalacaoDireta.tsx deve existir");

    const content = fs.readFileSync(modalPath, "utf-8");
    assert.ok(
      content.includes("ModalPortal"),
      "ModalInstalacaoDireta deve usar o ModalPortal canônico",
    );
    assert.ok(
      content.includes("Instalação Direta (Veículo Já Instalado)"),
      "Deve conter o título canônico de Instalação Direta",
    );
    assert.ok(
      content.includes("listarEquipamentosHabilitadosInstalacao"),
      "Deve listar os rastreadores disponíveis em estoque",
    );
    assert.ok(
      content.includes("registrarInstalacaoDireta"),
      "Deve invocar a função registrarInstalacaoDireta",
    );
    assert.ok(
      content.includes("max-h-[90vh]"),
      "Deve respeitar a ergonomia canônica de altura máxima de 90vh",
    );
  });

  it("3. InstalacoesView deve conter botão de Instalação Direta exclusivo para SuperADM e Administrador", () => {
    const viewPath = path.join(rootDir, "src/features/instalacoes/components/InstalacoesView.tsx");
    const content = fs.readFileSync(viewPath, "utf-8");

    assert.ok(
      content.includes("ModalInstalacaoDireta"),
      "InstalacoesView deve importar e renderizar ModalInstalacaoDireta",
    );
    assert.ok(
      content.includes("modalInstalacaoDiretaAberto"),
      "InstalacoesView deve controlar o estado de abertura do modal",
    );
    assert.ok(
      content.includes("session?.isSuperAdmin || session?.isAdmin"),
      "Botão de Instalação Direta deve ser condicionado ao SuperADM ou ADM",
    );
    assert.ok(
      content.includes("<span>Instalação Direta</span>"),
      "Deve conter o botão de Instalação Direta",
    );
  });

  it("4. NovaInstalacaoModal deve conter atalho opcional para Instalação Direta", () => {
    const novaPath = path.join(
      rootDir,
      "src/features/instalacoes/components/NovaInstalacaoModal.tsx",
    );
    const content = fs.readFileSync(novaPath, "utf-8");

    assert.ok(
      content.includes("onAbrirInstalacaoDireta"),
      "NovaInstalacaoModal deve aceitar a prop onAbrirInstalacaoDireta",
    );
    assert.ok(
      content.includes("O veículo já está instalado?"),
      "Deve orientar o SuperADM para alternar para a Instalação Direta se o veículo já estiver pronto",
    );
  });

  it("5. Migração SQL e script mestre devem conter a RPC registrar_instalacao_direta com NOTIFY pgrst", () => {
    const migracaoPath = path.join(
      rootDir,
      "supabase/migrations/20261117100000_hunter_instalacao_direta_superadm.sql",
    );
    const mestrePath = path.join(rootDir, "supabase/APLICAR_NO_SQL_EDITOR_SUPABASE.sql");

    assert.ok(fs.existsSync(migracaoPath), "Arquivo de migração 20261117100000 deve existir");
    assert.ok(fs.existsSync(mestrePath), "Script mestre deve existir");

    const migContent = fs.readFileSync(migracaoPath, "utf-8");
    const mestreContent = fs.readFileSync(mestrePath, "utf-8");

    assert.ok(
      migContent.includes("FUNCTION public.registrar_instalacao_direta"),
      "Migração deve criar a função registrar_instalacao_direta",
    );
    assert.ok(
      migContent.includes("NOTIFY pgrst, 'reload schema';"),
      "Migração deve conter a invalidação compulsória de cache PostgREST",
    );
    assert.ok(
      migContent.includes("valor_instalacao,\n    status_pagamento") ||
        (migContent.includes("valor_instalacao,") && migContent.includes("'isento'")),
      "Ordem deve ser isenta de repasse de mão de obra",
    );
    assert.ok(
      mestreContent.includes("FUNCTION public.registrar_instalacao_direta"),
      "Script mestre consolidado deve conter a RPC registrar_instalacao_direta",
    );
  });

  it("6. Proibição estrita do caractere comercial comercial em ModalInstalacaoDireta", () => {
    const modalPath = path.join(
      rootDir,
      "src/features/instalacoes/components/ModalInstalacaoDireta.tsx",
    );
    const content = fs.readFileSync(modalPath, "utf-8");

    // Procura por '&' que não seja operador lógico '&&'
    const regexAmpersandProibido = /(?<!&)&(?!&)/g;
    const ocorrencias = content.match(regexAmpersandProibido);
    assert.equal(
      ocorrencias,
      null,
      "ModalInstalacaoDireta não pode conter o caractere comercial em textos ou labels",
    );
  });

  it("7. carregarClientesParaInstalacao e ModalInstalacaoDireta devem suportar fallback seguro e clientesIniciais", () => {
    const servicePath = path.join(
      rootDir,
      "src/features/instalacoes/services/instalacaoService.ts",
    );
    const serviceContent = fs.readFileSync(servicePath, "utf-8");
    assert.ok(
      serviceContent.includes("/api/clientes"),
      "carregarClientesParaInstalacao deve consultar /api/clientes para imunidade contra RLS",
    );

    const modalPath = path.join(
      rootDir,
      "src/features/instalacoes/components/ModalInstalacaoDireta.tsx",
    );
    const modalContent = fs.readFileSync(modalPath, "utf-8");
    assert.ok(
      modalContent.includes("clientesIniciais"),
      "ModalInstalacaoDireta deve suportar a prop clientesIniciais",
    );

    const viewPath = path.join(rootDir, "src/features/instalacoes/components/InstalacoesView.tsx");
    const viewContent = fs.readFileSync(viewPath, "utf-8");
    assert.ok(
      viewContent.includes("clientesIniciais={clientesAgendamento}"),
      "InstalacoesView deve repassar clientesAgendamento como clientesIniciais ao ModalInstalacaoDireta",
    );
  });
});
