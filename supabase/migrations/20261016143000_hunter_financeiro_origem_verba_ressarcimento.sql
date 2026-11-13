-- Hunter — Origem da Verba de Despesas (Caixa vs Operador/ADM) e Módulo de Ressarcimento
-- Permite indicar de onde saiu a verba (caixa da empresa ou de algum operador/adm) e controlar o ressarcimento

ALTER TABLE public.transacoes_financeiras 
  ADD COLUMN IF NOT EXISTS fonte_pagamento TEXT DEFAULT 'caixa_empresa';

ALTER TABLE public.transacoes_financeiras 
  ADD COLUMN IF NOT EXISTS responsavel_pagamento_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.transacoes_financeiras 
  ADD COLUMN IF NOT EXISTS responsavel_pagamento_nome TEXT;

ALTER TABLE public.transacoes_financeiras 
  ADD COLUMN IF NOT EXISTS status_ressarcimento TEXT DEFAULT 'nao_aplicavel';

ALTER TABLE public.transacoes_financeiras 
  ADD COLUMN IF NOT EXISTS data_ressarcimento TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transacoes_fonte_pagamento ON public.transacoes_financeiras(fonte_pagamento);
CREATE INDEX IF NOT EXISTS idx_transacoes_status_ressarcimento ON public.transacoes_financeiras(status_ressarcimento);
CREATE INDEX IF NOT EXISTS idx_transacoes_responsavel_pagamento_id ON public.transacoes_financeiras(responsavel_pagamento_id);

-- Invalidação obrigatória de cache PostgREST (Regra Pétrea)
NOTIFY pgrst, 'reload schema';
