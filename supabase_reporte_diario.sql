-- ============================================================
-- REPORTE DIARIO AL CEO — log de envíos
-- ============================================================
-- Registra el reporte PDF que sale todos los días a las 21:00 (hora de Miami)
-- a ninitgroup@gmail.com. Sirve para dos cosas:
--   1. Evitar duplicados: si el cron se dispara dos veces (Vercel programa dos
--      horarios UTC por el horario de verano), el segundo ve `estado = 'enviado'`
--      y no manda nada.
--   2. Historial: qué se envió cada día, con los KPIs y el resumen de IA.
--
-- Ejecutar en Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reportes_diarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           DATE NOT NULL UNIQUE,          -- día que cubre el reporte (hora local de la operación)
  estado          TEXT NOT NULL DEFAULT 'enviado', -- 'enviado' | 'error'
  enviado_at      TIMESTAMPTZ DEFAULT NOW(),
  destinatarios   TEXT,
  resumen         TEXT,                          -- resumen ejecutivo (el mismo del PDF)
  metricas        JSONB,                         -- KPIs del día
  generado_por_ia BOOLEAN DEFAULT FALSE,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reportes_diarios_fecha
  ON public.reportes_diarios (fecha DESC);

-- RLS: la escribe la función serverless con service role (que ignora RLS).
-- Se deja lectura al equipo autenticado para poder mostrar el historial en el CRM.
ALTER TABLE public.reportes_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reportes_diarios_lectura" ON public.reportes_diarios;
CREATE POLICY "reportes_diarios_lectura"
  ON public.reportes_diarios FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.reportes_diarios IS
  'Log del reporte diario en PDF que el asistente de IA envía al CEO cada noche (api/reporte-diario.js).';
