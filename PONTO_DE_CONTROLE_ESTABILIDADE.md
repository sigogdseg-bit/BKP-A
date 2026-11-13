# Ponto de Controle e Estabilidade Canônico — GD Segurança

> **Data de Registro:** 13/11/2026 14:00:00 -03:00  
> **Versão Oficial:** `v1.0.0.0`  
> **Repositório:** `https://github.com/sigogdseg-bit/main.git`

---

## 1. Identificadores do Ponto de Regresso

Este ponto foi marcado e sincronizado no repositório remoto como referência imutável de estabilidade do sistema:

| Tipo                         | Identificador                                            | Destino / Status  |
| ---------------------------- | -------------------------------------------------------- | :---------------: |
| **Git Tag Anotada**          | `v1.10.2.12-estabilidade`                                | Remoto (`origin`) |
| **Git Tag Alias**            | `ponto-de-controle-estabilidade`                         | Remoto (`origin`) |
| **Branch de Salvaguarda**    | `backup/ponto-de-controle-estabilidade-v1.10.2.12`       | Remoto (`origin`) |
| **Backup Físico Compactado** | `backups/hunter-estabilidade-v1.10.2.12-20260929.tar.gz` |  Local / Offline  |
| **Backup ZIP Standalone**    | `backups/hunter-estabilidade-v1.10.2.12-20260929.zip`    | Local / Artifact  |

---

## 2. Estado do Sistema neste Marco

- **5 Gates de Encerramento:** 100% aprovados (TypeScript 0 erros, Prettier 100%, 367 testes unitários passando, Build Nitro/Vite exit 0).
- **Módulo de Estoque:**
  - Suporte completo a **Custo Base**, **Custo de Frete Rateado (sem lucro)**, **Markup Inteligente** e **Preço de Venda Livre**.
  - Persistência das colunas `custo_base`, `custo_frete`, `custo_medio_unitario`, `preco_venda` e `markup_percentual` na tabela `public.estoque_itens`.
- **Motor de Alertas Server-Side:**
  - Migrations aplicadas e ativas no Supabase.
  - Alerta C de movimento fora do horário configurado com avaliação de motor ligado e velocidade > 0.
  - Cancelamento preventivo de Push VAPID ao efetuar logout.

---

## 3. Como Regressar a Este Exato Ponto (Instruções Rápidas)

Caso queira restaurar ou inspecionar o sistema exatamente neste marco, utilize um dos procedimentos abaixo no terminal do projeto:

### Opção A: Desfazer alterações locais e retornar a árvore de trabalho a este ponto

```bash
git fetch origin
git checkout main
git reset --hard v1.10.2.12-estabilidade
```

### Opção B: Criar uma nova branch a partir deste marco de estabilidade

```bash
git checkout -b restauracao-ponto-estabilidade v1.10.2.12-estabilidade
```

### Opção C: Restaurar via branch de backup dedicada

```bash
git checkout backup/ponto-de-controle-estabilidade-v1.10.2.12
```

### Opção D: Restaurar a partir do arquivo físico tar.gz (sem depender de Git)

```bash
tar -xzf backups/hunter-estabilidade-v1.10.2.12-20260929.tar.gz
```
