-- ============================================================
-- MIGRACIÓN: Completar día + valoración del CEO — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- ============================================================
--
-- Objetivo: el vendedor "completa" su día en Mi Día (lo envía a
-- revisión). Mientras no lo complete, queda PENDIENTE. Nicolás (CEO)
-- lo ve, lo valora con una nota (1-5) y un comentario, y el vendedor
-- ve esa valoración en su Mi Día.
-- ============================================================

-- 1. Estado de completado (el vendedor envió su día)
ALTER TABLE public.diario_vendedor
  ADD COLUMN IF NOT EXISTS completado BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.diario_vendedor
  ADD COLUMN IF NOT EXISTS completado_at TIMESTAMPTZ;

-- 2. Valoración del CEO
ALTER TABLE public.diario_vendedor
  ADD COLUMN IF NOT EXISTS valoracion_nota SMALLINT
  CHECK (valoracion_nota BETWEEN 1 AND 5);

ALTER TABLE public.diario_vendedor
  ADD COLUMN IF NOT EXISTS valoracion_comentario TEXT;

ALTER TABLE public.diario_vendedor
  ADD COLUMN IF NOT EXISTS valorado_at TIMESTAMPTZ;

ALTER TABLE public.diario_vendedor
  ADD COLUMN IF NOT EXISTS valorado_por TEXT;

-- 3. Índice para listar/filtrar rápido por fecha + estado
CREATE INDEX IF NOT EXISTS idx_diario_fecha_completado
  ON public.diario_vendedor (fecha, completado);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT vendedor_nombre, fecha, completado, completado_at,
       valoracion_nota, valorado_por
FROM public.diario_vendedor
ORDER BY fecha DESC
LIMIT 20;
