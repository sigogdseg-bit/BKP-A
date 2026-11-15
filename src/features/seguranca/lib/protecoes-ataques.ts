export type NivelProtecao = "bloquear" | "detectar" | "exposto";

export interface ProtecaoAtaque {
  nome: string;
  nivel: NivelProtecao;
  como: string;
}

export interface CategoriaProtecao {
  categoria: string;
  itens: ProtecaoAtaque[];
}

export const PROTECOES_ATAQUES_BASE: CategoriaProtecao[] = [
  {
    categoria: "Injeção de código",
    itens: [
      {
        nome: "SQL Injection",
        nivel: "bloquear",
        como: "PostgREST + prepared statements + RLS estrito em 100% das tabelas do schema public.",
      },
      {
        nome: "NoSQL Injection",
        nivel: "bloquear",
        como: "Não há banco NoSQL exposto; API tipada e sanitizada pelo PostgREST.",
      },
      {
        nome: "Command Injection (RCE)",
        nivel: "bloquear",
        como: "Worker Cloudflare e Node serverless — sem shell, sem child_process, sem filesystem arbitrário.",
      },
      {
        nome: "LDAP / XPath / SSRF interno",
        nivel: "bloquear",
        como: "Não há conectores LDAP/XML; fetch server-side restrito a hosts permitidos e validados.",
      },
      {
        nome: "XSS refletido / armazenado",
        nivel: "bloquear",
        como: "React escapa por padrão; CSP restritiva; nenhum dangerouslySetInnerHTML com input de usuário.",
      },
      {
        nome: "XSS via DOM",
        nivel: "bloquear",
        como: "Sanitização por escape do React + CSP sem 'unsafe-inline' em scripts de terceiros.",
      },
      {
        nome: "HTML/CSS Injection",
        nivel: "bloquear",
        como: "Conteúdo renderizado por componentes tipados; CSS controlado por classes Tailwind estáticas.",
      },
    ],
  },
  {
    categoria: "Sessão, autenticação e credenciais",
    itens: [
      {
        nome: "Brute force de senha",
        nivel: "bloquear",
        como: "Lockout escalonado progressivo por identificador (5 falhas/15m, 10/1h, 20/24h) e por IP.",
      },
      {
        nome: "Credential stuffing",
        nivel: "bloquear",
        como: "Detecção algorítmica de falhas com múltiplos IPs em janela de 24h + lockout escalonado.",
      },
      {
        nome: "Password spraying",
        nivel: "bloquear",
        como: "Lockout por IP captura ataques distribuídos que tentam burlar o limite por identificador.",
      },
      {
        nome: "Roubo de sessão / hijack de token",
        nivel: "detectar",
        como: "JWT no navegador, TLS 1.3 e TOFU de dispositivo mitigam; XSS residual ainda pode capturar token.",
      },
      {
        nome: "Session fixation",
        nivel: "bloquear",
        como: "Supabase Auth rotaciona o refresh token a cada autenticação e renovação.",
      },
      {
        nome: "MFA bypass (client-only)",
        nivel: "bloquear",
        como: "Validação autoritativa no servidor; conferências client-side não são autoritativas.",
      },
      {
        nome: "JWT tampering / alg=none",
        nivel: "bloquear",
        como: "Tokens assinados criptograficamente; verificação rejeita alg=none e assinaturas inválidas.",
      },
      {
        nome: "Clickjacking (iframe overlay)",
        nivel: "bloquear",
        como: "CSP frame-ancestors com allowlist restrita + X-Frame-Options SAMEORIGIN.",
      },
      {
        nome: "CSRF em rotas sensíveis",
        nivel: "bloquear",
        como: "Autenticação por Bearer em cabeçalho (não em cookie) — CSRF clássico não se aplica; SameSite estrito.",
      },
      {
        nome: "Phishing / engenharia social",
        nivel: "detectar",
        como: "Política TOFU de aparelhos reduz impacto; anomalias de login são registradas. Vetor humano.",
      },
      {
        nome: "Enumeração de usuários",
        nivel: "bloquear",
        como: "Mensagem de erro genérica no login ('e-mail ou senha incorretos').",
      },
      {
        nome: "Recuperação de senha abusada",
        nivel: "detectar",
        como: "Rate-limit na autenticação e registro em system_login_logs para revisão de padrões.",
      },
    ],
  },
  {
    categoria: "Autorização e dados",
    itens: [
      {
        nome: "Broken Access Control (IDOR)",
        nivel: "bloquear",
        como: "RLS em 100% das tabelas públicas; cliente só acessa estritamente veículos e rastreadores do seu tenant.",
      },
      {
        nome: "Escalada de privilégio (user -> admin)",
        nivel: "bloquear",
        como: "Roles em tabela profiles e triggers PostgreSQL blindam contas oficiais contra rebaixamento.",
      },
      {
        nome: "Mass assignment",
        nivel: "bloquear",
        como: "Validação rígida de payloads nas rotas; campos sensíveis de controle nunca são aceitos do cliente.",
      },
      {
        nome: "Exposição de dados sensíveis",
        nivel: "bloquear",
        como: "TLS 1.3 em trânsito + AES-256 em repouso + RLS estrito + marca d'água persistente na tela.",
      },
      {
        nome: "Vazamento por logs / mensagens de erro",
        nivel: "bloquear",
        como: "Stacks sanitizados em produção; dados confidenciais nunca são impressos em log de aplicação.",
      },
    ],
  },
  {
    categoria: "Transporte e cabeçalhos HTTP",
    itens: [
      {
        nome: "MITM / downgrade HTTPS",
        nivel: "bloquear",
        como: "TLS 1.3 obrigatório, HSTS com preload e upgrade-insecure-requests no CSP.",
      },
      {
        nome: "MIME sniffing",
        nivel: "bloquear",
        como: "X-Content-Type-Options: nosniff.",
      },
      {
        nome: "Vazamento de referer",
        nivel: "bloquear",
        como: "Referrer-Policy: strict-origin-when-cross-origin.",
      },
      {
        nome: "Plugins/Flash legado",
        nivel: "bloquear",
        como: "CSP object-src 'none' e X-Permitted-Cross-Domain-Policies: none.",
      },
      {
        nome: "Sequestro de base tag",
        nivel: "bloquear",
        como: "CSP base-uri 'self'.",
      },
    ],
  },
  {
    categoria: "Rede e disponibilidade",
    itens: [
      {
        nome: "DDoS volumétrico (L3/L4)",
        nivel: "bloquear",
        como: "Mitigação de borda da Cloudflare antes de atingir o servidor de aplicação.",
      },
      {
        nome: "DDoS aplicação (L7) / Slowloris",
        nivel: "bloquear",
        como: "Regras gerenciadas da Cloudflare e limites de conexão do runtime.",
      },
      {
        nome: "Ataques via bots / scraping",
        nivel: "detectar",
        como: "Bot management bloqueia bots conhecidos; scraping anômalo aparece nos logs de acesso.",
      },
      {
        nome: "Abuso de API por usuário logado",
        nivel: "detectar",
        como: "Toda ação é registrada em system_activity_logs; rajadas volumétricas aparecem no UEBA.",
      },
      {
        nome: "Amplificação (DNS/NTP)",
        nivel: "bloquear",
        como: "Não há serviços UDP expostos; DNS operado com proteção contra amplificação.",
      },
    ],
  },
  {
    categoria: "Arquivos, upload e supply chain",
    itens: [
      {
        nome: "Upload malicioso executável",
        nivel: "bloquear",
        como: "Apenas tipos MIME permitidos; servidos sem execução direta no navegador.",
      },
      {
        nome: "Malware embutido em imagem",
        nivel: "exposto",
        como: "Sem antivírus no upload — risco residual assumido (imagens não são executadas pelo browser).",
      },
      {
        nome: "Path traversal em upload",
        nivel: "bloquear",
        como: "Storage gera nomes canônicos UUID; caminho não é montado a partir do input do usuário.",
      },
      {
        nome: "Dependência vulnerável (supply chain)",
        nivel: "detectar",
        como: "Scanner de segurança de dependências e auditoria em builds; lockfile estrito em produção.",
      },
      {
        nome: "Typosquatting de pacote",
        nivel: "detectar",
        como: "Instalação controlada via registro oficial npm; sem installs anônimos em CI de produção.",
      },
    ],
  },
  {
    categoria: "Cadeia de custódia e auditoria",
    itens: [
      {
        nome: "Adulteração de logs",
        nivel: "bloquear",
        como: "system_activity_logs protegido por políticas RLS imutáveis; laudo forense com SHA-256.",
      },
      {
        nome: "Adulteração de PDF emitido",
        nivel: "bloquear",
        como: "Hash pericial registrado no documento; conferência de integridade em tempo de leitura.",
      },
      {
        nome: "Repudiação de ação privilegiada",
        nivel: "bloquear",
        como: "Toda ação de admin fica registrada com quem, quando, IP e detalhe operacional.",
      },
      {
        nome: "Backup adulterado",
        nivel: "bloquear",
        como: "Backup local com controle de versão e integridade pericial de dados.",
      },
    ],
  },
  {
    categoria: "Defesa proativa e governança de dados",
    itens: [
      {
        nome: "Armadilhas e Honeytokens (Deception)",
        nivel: "bloquear",
        como: "Contas-armadilha e tabelas isca monitoradas; acesso indevido isola o IP e bloqueia no ato.",
      },
      {
        nome: "Governança e Estamparia Forense (DLP)",
        nivel: "bloquear",
        como: "Marca d'água com Documento, Nome, IP e Data/Hora gravada em tela e ofuscamento por blur ao perder foco.",
      },
      {
        nome: "Análise Comportamental (UEBA)",
        nivel: "bloquear",
        como: "Monitora rajadas atípicas de requisições (>25 req/janela) e varreduras anômalas com alerta imediato.",
      },
      {
        nome: "Monitoramento de Integridade de Schema (FIM)",
        nivel: "bloquear",
        como: "Checksums contínuos de integridade das rotas, RLS e gatilhos de proteção do banco.",
      },
    ],
  },
  {
    categoria: "Riscos residuais assumidos",
    itens: [
      {
        nome: "Insider threat (admin malicioso)",
        nivel: "detectar",
        como: "Todo ato de admin fica auditado na trilha forense; mitigação real é procedural (menor privilégio).",
      },
      {
        nome: "Aparelho perdido / roubado",
        nivel: "detectar",
        como: "Sessão expira, dispositivo revogável pelo admin via política TOFU; dados em cache dependem do bloqueio de tela.",
      },
      {
        nome: "Ransomware / malware no endpoint",
        nivel: "exposto",
        como: "Fora do escopo do sistema — depende de antivírus/EDR e política de endpoint do usuário.",
      },
      {
        nome: "Ataque físico ao servidor",
        nivel: "bloquear",
        como: "Infraestrutura em datacenter Tier-III com controle de acesso físico rigoroso e auditado.",
      },
    ],
  },
];

export const NIVEL_LABEL: Record<NivelProtecao, string> = {
  bloquear: "Bloqueia",
  detectar: "Detecta",
  exposto: "Exposto",
};

export const NIVEL_COR: Record<NivelProtecao, string> = {
  bloquear: "text-orange-600 dark:text-orange-400",
  detectar: "text-sky-600 dark:text-sky-400",
  exposto: "text-amber-600 dark:text-amber-400",
};

export function contarPorNivel(
  dados: CategoriaProtecao[] = PROTECOES_ATAQUES_BASE,
): Record<NivelProtecao, number> {
  const acc: Record<NivelProtecao, number> = { bloquear: 0, detectar: 0, exposto: 0 };
  for (const cat of dados) {
    for (const it of cat.itens) acc[it.nivel] += 1;
  }
  return acc;
}
