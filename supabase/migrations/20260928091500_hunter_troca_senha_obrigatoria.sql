-- Adiciona a coluna primeiro_acesso para forçar a troca de senha
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT true;

-- RPC para marcar o primeiro acesso como concluído de forma segura (apenas o próprio usuário)
CREATE OR REPLACE FUNCTION public.marcar_primeiro_acesso_concluido()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET primeiro_acesso = false, updated_at = NOW()
    WHERE id = auth.uid();
END;
$$;
