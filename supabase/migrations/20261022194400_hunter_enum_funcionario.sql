-- Migration para adicionar 'funcionario' ao enum hunter_role em transação isolada
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'funcionario';
