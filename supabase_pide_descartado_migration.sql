-- ============================================================
-- MIGRACIÓN: "quitar de la lista" en Piden contacto — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- Proyecto de PRODUCCIÓN: xeggotxdridyuwvxxfko
-- ============================================================
--
-- La pantalla "Piden contacto" es un filtro automático sobre los contactos.
-- Con el botón "Atendido" el vendedor lo saca de la lista SIN borrar el
-- contacto: se guarda la fecha del descarte acá. El contacto vuelve a
-- aparecer solo si el cliente escribe un mensaje nuevo después de esa fecha.

ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS pide_descartado_at TIMESTAMPTZ;
