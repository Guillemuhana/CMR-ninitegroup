-- ============================================================
-- MIGRACIÓN: Agenda / Calendario del vendedor — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- Proyecto de PRODUCCIÓN: xeggotxdridyuwvxxfko
-- ============================================================
--
-- Objetivo: cada vendedor tiene un calendario (estilo Google
-- Calendar) donde agenda lo que tiene que hacer cada día:
-- reuniones, llamadas a clientes, visitas, seguimientos, etc.
-- Nicolás (CEO) también puede ver la agenda de cada vendedor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agenda_vendedor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id     UUID NOT NULL REFERENCES public.vendedores(id) ON DELETE CASCADE,
  vendedor_nombre TEXT NOT NULL,
  fecha           DATE NOT NULL,
  hora            TIME,                       -- opcional (evento sin hora = "todo el día")
  tipo            TEXT NOT NULL DEFAULT 'otro'
    CHECK (tipo IN ('reunion','llamada','visita','seguimiento','otro')),
  titulo          TEXT NOT NULL DEFAULT '',
  cliente_id      UUID,                       -- contacto vinculado (opcional)
  cliente_nombre  TEXT,                       -- snapshot del nombre para mostrar
  nota            TEXT,
  completado      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_vend_fecha
  ON public.agenda_vendedor (vendedor_id, fecha);
CREATE INDEX IF NOT EXISTS idx_agenda_fecha
  ON public.agenda_vendedor (fecha);

-- ── RLS (mismo patrón que diario/sesiones) ───────────────────
ALTER TABLE public.agenda_vendedor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_agenda" ON public.agenda_vendedor;
CREATE POLICY "auth_agenda"
  ON public.agenda_vendedor FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT vendedor_nombre, fecha, hora, tipo, titulo, cliente_nombre, completado
FROM public.agenda_vendedor
ORDER BY fecha DESC, hora
LIMIT 20;
