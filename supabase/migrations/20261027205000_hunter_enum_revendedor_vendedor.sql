-- SIGO Guardião — Adicionar valores 'revendedor' e 'vendedor' ao enum hunter_role
-- Migration: 20261027205000_hunter_enum_revendedor_vendedor.sql

ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'revendedor';
ALTER TYPE public.hunter_role ADD VALUE IF NOT EXISTS 'vendedor';

