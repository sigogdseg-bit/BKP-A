-- -----------------------------------------------------------------------------
-- Correção de RLS para notificações do chat
-- A política anterior usava auth_user_id que não existe na tabela clientes
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Usuarios podem ler suas proprias notificacoes ou administradores leem todas" ON public.notificacoes_sistema;
CREATE POLICY "Usuarios podem ler suas proprias notificacoes ou administradores leem todas"
  ON public.notificacoes_sistema FOR SELECT TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR (destinatario_user_id IS NULL AND destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    ))
    OR remetente_user_id = auth.uid()
    OR public.is_admin_or_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Usuarios podem marcar como lida suas notificacoes" ON public.notificacoes_sistema;
CREATE POLICY "Usuarios podem marcar como lida suas notificacoes"
  ON public.notificacoes_sistema FOR UPDATE TO authenticated
  USING (
    destinatario_user_id = auth.uid()
    OR (destinatario_user_id IS NULL AND destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    ))
    OR public.is_admin_or_superadmin(auth.uid())
  )
  WITH CHECK (
    destinatario_user_id = auth.uid()
    OR (destinatario_user_id IS NULL AND destinatario_cliente_id IN (
      SELECT id FROM public.clientes WHERE user_id = auth.uid()
    ))
    OR public.is_admin_or_superadmin(auth.uid())
  );
