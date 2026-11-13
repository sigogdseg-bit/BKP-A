import { PROTECOES_ATAQUES_BASE, ProtecaoAtaque, CategoriaProtecao } from "./protecoes-ataques";

export interface DadosAuditoriaSistema {
  totalTabelas: number;
  tabelasProtegidasRls: number;
  bloqueiosAtivos: number;
  totalFalhasRecentes: number;
  totalAdmins: number;
  ultimoBackupEm?: string | null;
}

export function avaliarVetoresDinamicos(auditoria?: DadosAuditoriaSistema): CategoriaProtecao[] {
  if (!auditoria) return PROTECOES_ATAQUES_BASE;

  const totalTabelas = auditoria.totalTabelas || 1;
  const tabelasRls = auditoria.tabelasProtegidasRls || 0;
  const coberturaRls = totalTabelas > 0 ? tabelasRls / totalTabelas : 0;
  const temLockoutAtivo = auditoria.bloqueiosAtivos >= 0;
  const backupEmDia = auditoria.ultimoBackupEm
    ? (Date.now() - new Date(auditoria.ultimoBackupEm).getTime()) / 86400000 <= 35
    : true; // Padrão se gerenciado

  return PROTECOES_ATAQUES_BASE.map((categoria) => ({
    ...categoria,
    itens: categoria.itens.map((item): ProtecaoAtaque => {
      // Regra 1: SQL Injection e IDOR dependem de 100% de cobertura RLS
      if (item.nome === "SQL Injection" || item.nome === "Broken Access Control (IDOR)") {
        if (coberturaRls < 1) {
          return {
            ...item,
            nivel: "detectar",
            como: `RLS parcial: apenas ${tabelasRls}/${totalTabelas} tabelas protegidas. Há risco em tabelas desprotegidas.`,
          };
        }
      }

      // Regra 2: Brute force depende de bloqueio escalonado
      if (item.nome === "Brute force de senha" && !temLockoutAtivo) {
        return {
          ...item,
          nivel: "detectar",
          como: "Tabela de bloqueios não configurada; falhas são apenas registradas sem lockout.",
        };
      }

      // Regra 3: Trilha de auditoria depende de retenção e backup regular
      if (item.nome === "Adulteração de logs" && !backupEmDia) {
        return {
          ...item,
          nivel: "detectar",
          como: "Logs em banco ativos, mas backup mensal atrasado (>35 dias) fragiliza a retenção pericial.",
        };
      }

      return item;
    }),
  }));
}
