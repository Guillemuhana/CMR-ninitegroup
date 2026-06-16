-- ============================================================
-- MIGRACIÓN: Revisión de consultas (tiempo de atención) — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- ============================================================
--
-- Objetivo: que el vendedor "vea" cada consulta aunque el bot ya
-- haya respondido. Una conversación queda "sin revisar" mientras
-- el último mensaje del cliente (ultimo_in_at) sea más nuevo que la
-- última vez que el vendedor abrió el chat (revisado_at).
-- ============================================================

-- 1. Marca de la última revisión humana del chat
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS revisado_at TIMESTAMPTZ;

-- 2. Índice para listar/contar rápido las conversaciones sin revisar
CREATE INDEX IF NOT EXISTS idx_contactos_revisado
  ON public.contactos (vendedor, revisado_at);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT id, nombre, vendedor, ultimo_in_at, revisado_at
FROM public.contactos
WHERE ultimo_in_at IS NOT NULL
ORDER BY ultimo_in_at DESC
LIMIT 20;
