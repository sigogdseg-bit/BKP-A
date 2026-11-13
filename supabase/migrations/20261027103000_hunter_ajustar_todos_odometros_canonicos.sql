-- ─────────────────────────────────────────────────────────────────────────────
-- Hunter — Sincronização Canônica Atômica de Todos os Odômetros do Veículo
-- Versão: 2.1.4.6
-- Data: 27/10/2026
-- Objetivo: Atualizar atomicamente todos os 7 odômetros (Medidor 7 Principal,
--           WGS-84, Cinemático, Motores A, B, C e MCU J16) ao calibrar o odômetro.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ajustar_odometro_veiculo(
  p_veiculo_id UUID,
  p_novo_odometro NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_odometro_anterior NUMERIC(12, 2);
  v_placa TEXT;
  v_eh_dono BOOLEAN := FALSE;
  v_eh_admin BOOLEAN := FALSE;
  v_novo_km NUMERIC(12, 2);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  IF p_novo_odometro IS NULL OR p_novo_odometro < 0 THEN
    RAISE EXCEPTION 'Quilometragem inválida. Deve ser maior ou igual a zero.';
  END IF;

  v_novo_km := ROUND(p_novo_odometro::NUMERIC, 2);

  -- Verifica permissão: SuperADM/Equipe OU titular do veículo
  SELECT 
    COALESCE(v.odometro_motor_media_km, v.odometro_km, 0),
    v.placa,
    (c.user_id = v_user_id)
  INTO 
    v_odometro_anterior,
    v_placa,
    v_eh_dono
  FROM public.veiculos v
  JOIN public.clientes c ON c.id = v.cliente_id
  WHERE v.id = p_veiculo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Veículo não encontrado.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = v_user_id AND role::text IN ('adm', 'superadmin', 'operador')
  ) INTO v_eh_admin;

  IF NOT (v_eh_dono OR v_eh_admin) THEN
    RAISE EXCEPTION 'Permissão negada. Apenas o proprietário ou a administração podem calibrar o odômetro.';
  END IF;

  -- 1. Atualiza ATOMICAMENTE TODOS os odômetros no veículo (Medidor 7 Principal e os Motores Subjacentes)
  UPDATE public.veiculos
  SET 
    odometro_km                     = v_novo_km,
    odometro_motor_media_km         = v_novo_km,
    odometro_wgs84_km               = v_novo_km,
    odometro_cinematico_km          = v_novo_km,
    odometro_motor_a_km             = v_novo_km,
    odometro_motor_b_km             = v_novo_km,
    odometro_motor_c_km             = v_novo_km,
    odometro_hardware_km            = ROUND(v_novo_km),
    odometro_hardware_atualizado_em = NOW(),
    ultima_atualizacao              = NOW()
  WHERE id = p_veiculo_id;

  -- 2. Sincroniza a última posição de telemetria
  UPDATE public.telemetria_posicoes
  SET odometro = v_novo_km
  WHERE id = (
    SELECT id FROM public.telemetria_posicoes
    WHERE veiculo_id = p_veiculo_id
    ORDER BY data_hora_gps DESC
    LIMIT 1
  );

  -- 3. Registra log forense de auditoria
  INSERT INTO public.system_activity_logs (
    acao,
    usuario_id,
    detalhe
  ) VALUES (
    'AJUSTE_CALIBRACAO_ODOMETRO',
    v_user_id,
    format('Odômetro do veículo %s equalizado e sincronizado em todos os 7 motores de %s km para %s km com o painel físico.',
           v_placa,
           COALESCE(v_odometro_anterior::TEXT, '0.00'),
           v_novo_km::TEXT)
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'veiculo_id', p_veiculo_id,
    'placa', v_placa,
    'odometro_anterior', v_odometro_anterior,
    'novo_odometro', v_novo_km
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ajustar_odometro_veiculo TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
