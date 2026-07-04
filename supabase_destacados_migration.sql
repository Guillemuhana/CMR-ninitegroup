-- ============================================================
-- MIGRACIÓN: Chats importantes (destacados / favoritos)
-- NINIT Group CRM — ejecutar en Supabase SQL Editor
-- ============================================================

-- Marca un contacto como importante para identificarlo rápido en la lista.
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS destacado BOOLEAN DEFAULT FALSE;

-- Índice parcial: acelera el filtro "Solo importantes".
CREATE INDEX IF NOT EXISTS idx_contactos_destacado
  ON public.contactos (destacado)
  WHERE destacado = TRUE;
