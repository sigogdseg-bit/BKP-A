-- SIGO Guardião — Adicionar valor 'cliente_degustacao' ao enum hunter_role
-- Migration: 20261109150000_hunter_role_cliente_degustacao.sql

ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'cliente_degustacao';

NOTIFY pgrst, 'reload schema';
