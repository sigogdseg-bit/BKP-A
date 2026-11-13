-- Remove STABLE marker from get_meu_perfil_motorista to fix auth.uid() being null in PostgREST cache.
-- PostgREST evaluates STABLE functions outside of the transaction where request.jwt.claims is set.

CREATE OR REPLACE FUNCTION public.get_meu_perfil_motorista()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',            m.id,
    'nome',          m.nome,
    'email',         m.email,
    'cpf',           m.cpf,
    'telefone',      m.telefone,
    'cnh_numero',    m.cnh_numero,
    'cnh_categoria', m.cnh_categoria,
    'cnh_validade',  m.cnh_validade,
    'cnh_foto_url',  m.cnh_foto_url,
    'acesso_mapa',   m.acesso_mapa,
    'cliente_id',    m.cliente_id,
    'cliente_nome',  c.nome_razao_social
  )
  INTO v_result
  FROM public.motoristas m
  INNER JOIN public.clientes c ON c.id = m.cliente_id
  WHERE m.user_id = auth.uid() AND m.ativo = TRUE
  LIMIT 1;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Perfil de motorista nao encontrado.';
  END IF;

  RETURN v_result;
END;
$$;

-- Também remover STABLE de get_motorista_id
CREATE OR REPLACE FUNCTION public.get_motorista_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
  SELECT id FROM public.motoristas
  WHERE user_id = auth.uid() AND ativo = TRUE
  LIMIT 1;
$$;
