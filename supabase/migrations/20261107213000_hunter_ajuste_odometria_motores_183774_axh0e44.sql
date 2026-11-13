-- ============================================================================
-- SIGO GUARDIÃO — AJUSTE CANÔNICO DE ODOMETRIA NOS MOTORES (AXH0E44)
-- Migração: 20261107213000_hunter_ajuste_odometria_motores_183774_axh0e44.sql
-- ============================================================================
-- 1. Sincronização oficial do Volvo XC60 AXH0E44 com o painel físico auditado:
--    Valor do painel: 183.774,2 km (183774.200 km)
-- 2. Equalização dos motores de odometria WGS-84 (1), Cinemático (2), Motor A (4),
--    Motor B (5), Motor C (6) e Medidor 7 (Média Fusional Principal).
-- 3. REGRA EXPRESSA DO USUÁRIO: O Motor 3 (odometro_hardware_km - leitura MCU
--    interna do rastreador físico J16) é preservado integralmente intacto.
-- ============================================================================

-- 1. Atualização dos motores no veículo AXH0E44
UPDATE public.veiculos
SET
  odometro_km             = 183774.200,
  odometro_motor_media_km = 183774.200,
  odometro_wgs84_km       = 183774.200,
  odometro_cinematico_km  = 183774.200,
  odometro_motor_a_km     = 183774.200,
  odometro_motor_b_km     = 183774.200,
  odometro_motor_c_km     = 183774.200,
  ultima_atualizacao      = NOW()
WHERE placa = 'AXH0E44';

-- 2. Sincroniza a última posição de telemetria para garantir continuidade nos deltas
UPDATE public.telemetria_posicoes
SET odometro = 183774.200
WHERE id = (
  SELECT id FROM public.telemetria_posicoes
  WHERE veiculo_id = (SELECT id FROM public.veiculos WHERE placa = 'AXH0E44' LIMIT 1)
  ORDER BY data_hora_gps DESC
  LIMIT 1
);

-- 3. Registro de auditoria operacional
INSERT INTO public.system_activity_logs (
  acao,
  detalhe
) VALUES (
  'AJUSTE_CALIBRACAO_ODOMETRO',
  'Odômetro do veículo AXH0E44 equalizado e sincronizado nos motores (1, 2, 4, 5, 6 e 7) para 183.774,2 km com o painel físico. Motor 3 (hardware MCU) preservado intacto.'
);

NOTIFY pgrst, 'reload schema';
