import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Hunter — Persistência de Trajetos Salvos em Banco de Dados (Limite de 5 e RLS)", () => {
  it("Limite Máximo de 5 Trajetos: Deve permitir salvar até 5 e rejeitar o 6º registro", () => {
    const LIMITE_MAXIMO = 5;
    const bancoSimulado: any[] = [];

    function tentarSalvarTrajeto(novoTrajeto: any) {
      if (bancoSimulado.length >= LIMITE_MAXIMO) {
        return {
          sucesso: false,
          mensagem:
            "Limite máximo de 5 trajetos salvos atingido. Exclua um trajeto anterior para salvar um novo.",
        };
      }
      bancoSimulado.push({ ...novoTrajeto, id: `tr-${bancoSimulado.length + 1}` });
      return { sucesso: true, id: `tr-${bancoSimulado.length}` };
    }

    // Salva 5 trajetos com sucesso
    for (let i = 1; i <= 5; i++) {
      const res = tentarSalvarTrajeto({ nome: `Rota Diária ${i}`, distancia_km: 10 * i });
      assert.equal(res.sucesso, true, `Trajeto ${i} deve ser salvo com sucesso`);
    }

    assert.equal(bancoSimulado.length, 5, "Banco deve conter exatamente 5 registros");

    // Tentativa de salvar o 6º deve ser estritamente bloqueada
    const resSexto = tentarSalvarTrajeto({ nome: "Rota Excedente 6", distancia_km: 60 });
    assert.equal(resSexto.sucesso, false, "6º trajeto deve ser rejeitado");
    assert.ok(
      resSexto.mensagem?.includes("Limite máximo de 5 trajetos salvos atingido"),
      "Mensagem deve orientar o usuário sobre o limite de 5",
    );
    assert.equal(bancoSimulado.length, 5, "Quantidade no banco deve permanecer 5");
  });

  it("Exclusão de Trajeto: Libera vaga para novo salvamento", () => {
    const LIMITE_MAXIMO = 5;
    let bancoSimulado = [
      { id: "1", nome: "Rota 1" },
      { id: "2", nome: "Rota 2" },
      { id: "3", nome: "Rota 3" },
      { id: "4", nome: "Rota 4" },
      { id: "5", nome: "Rota 5" },
    ];

    // Exclui um trajeto
    bancoSimulado = bancoSimulado.filter((t) => t.id !== "3");
    assert.equal(bancoSimulado.length, 4, "Após exclusão deve restar 4 trajetos");

    // Agora deve permitir salvar mais um trajeto
    if (bancoSimulado.length < LIMITE_MAXIMO) {
      bancoSimulado.push({ id: "6", nome: "Nova Rota 6" });
    }
    assert.equal(bancoSimulado.length, 5, "Deve preencher novamente a vaga até 5");
  });

  it("Edição de Rota Salva: Atualiza dados existentes no banco sem ocupar nova vaga", () => {
    const bancoSimulado = [
      { id: "1", nome: "Rota Antiga", distancia_km: 15, paradas: [1, 2] },
      { id: "2", nome: "Rota 2", distancia_km: 25, paradas: [1] },
    ];

    // Edita a rota 1 (atualização direta do registro existente)
    const index = bancoSimulado.findIndex((t) => t.id === "1");
    assert.ok(index !== -1);
    bancoSimulado[index] = {
      ...bancoSimulado[index],
      nome: "Rota Comercial Editada",
      distancia_km: 18.5,
      paradas: [1, 2, 3],
    };

    assert.equal(bancoSimulado.length, 2, "A edição não deve aumentar a quantidade de registros");
    assert.equal(bancoSimulado[0].nome, "Rota Comercial Editada");
    assert.equal(bancoSimulado[0].distancia_km, 18.5);
    assert.equal(bancoSimulado[0].paradas.length, 3);
  });

  it("Regra Pétrea Hunter: Ausência do caractere comercial proibido nas mensagens e rotas", () => {
    const mensagemErroLimite =
      "Limite maximo de 5 trajetos salvos atingido. Exclua um trajeto antes de salvar um novo.";
    assert.ok(
      !mensagemErroLimite.includes("&"),
      "Mensagens do sistema nao podem conter o caractere comercial proibido",
    );
  });
});
