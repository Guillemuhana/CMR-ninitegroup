-- ============================================================
-- MIGRACIÓN: Sistema de Roles — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- ============================================================

-- 1. Agregar columna role a vendedores
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'vendedor'
  CHECK (role IN ('vendedor', 'ceo'));

-- 2. Nicolas es CEO
UPDATE public.vendedores SET role = 'ceo' WHERE nombre = 'Nicolas';

-- 3. Agregar vendedores iniciales (los vas a renombrar desde Admin)
INSERT INTO public.vendedores (nombre, email, role) VALUES
  ('Vendedor 1', 'vendedor1@ninitgroup.com', 'vendedor'),
  ('Vendedor 2', 'vendedor2@ninitgroup.com', 'vendedor'),
  ('Vendedor 3', 'vendedor3@ninitgroup.com', 'vendedor')
ON CONFLICT (nombre) DO NOTHING;

-- ── DIARIO DE VENDEDOR ───────────────────────────────────────
-- Una entrada por día por vendedor (editable el mismo día)
CREATE TABLE IF NOT EXISTS public.diario_vendedor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  vendedor_nombre TEXT NOT NULL,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  contenido       TEXT NOT NULL DEFAULT '',
  estado_animo    TEXT DEFAULT 'neutro'
    CHECK (estado_animo IN ('excelente', 'bien', 'neutro', 'mal', 'muy_mal')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendedor_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_diario_fecha
  ON public.diario_vendedor (vendedor_id, fecha DESC);

-- ── SESIONES / TIEMPO EN APP ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sesiones_vendedor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  vendedor_nombre TEXT NOT NULL,
  inicio_sesion   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin_sesion      TIMESTAMPTZ,
  duracion_seg    INTEGER,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_sesiones_fecha
  ON public.sesiones_vendedor (vendedor_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_sesiones_all_fecha
  ON public.sesiones_vendedor (fecha DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.diario_vendedor   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_vendedor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_diario"   ON public.diario_vendedor;
DROP POLICY IF EXISTS "auth_sesiones" ON public.sesiones_vendedor;

CREATE POLICY "auth_diario"
  ON public.diario_vendedor FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_sesiones"
  ON public.sesiones_vendedor FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── REALTIME ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.diario_vendedor;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sesiones_vendedor;

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT nombre, email, role, activo FROM public.vendedores ORDER BY role DESC, nombre;
