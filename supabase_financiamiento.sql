-- ============================================================
-- FINANCIAMIENTO (Ascentium Capital) — ficha por cliente
-- ============================================================
-- Una fila por contacto. Va en tabla aparte y no como columnas de `contactos`
-- porque `contactos` la leen casi todas las pantallas del CRM y varias queries
-- rompen si aparecen columnas nuevas (ver el fallback de columnas en
-- api/_reporte/metricas.js).
--
-- Ejecutar en Supabase → SQL Editor (proyecto de producción).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financiamiento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id         UUID NOT NULL UNIQUE
                        REFERENCES public.contactos(id) ON DELETE CASCADE,

  -- Los 9 campos que pidió el CEO
  interes             BOOLEAN,        -- Financing interest: Yes / No
  link_enviado        BOOLEAN NOT NULL DEFAULT FALSE,  -- Financing link sent
  link_enviado_at     TIMESTAMPTZ,    -- Link sent date (lo setea el CRM al enviarlo)
  estado              TEXT,           -- Financing status (ver CHECK abajo)
  monto_estimado      NUMERIC(12,2),  -- Estimated amount requested (USD)
  modelo              TEXT,           -- Selected trailer model
  socio               TEXT NOT NULL DEFAULT 'Ascentium Capital', -- Assigned financial partner
  seguimiento_fecha   DATE,           -- Follow-up date
  notas               TEXT,           -- Notes

  -- Operativos
  vendedor_id         UUID,           -- quién lo está trabajando (para notificar)
  detectado_por_ia    BOOLEAN NOT NULL DEFAULT FALSE, -- el estado lo puso la IA, no una persona
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Los 10 estados del CEO. Se guardan en inglés (es el vocabulario que usan él
  -- y Ascentium); la app los muestra traducidos al español — ver ESTADOS_FIN en src/lib.js.
  CONSTRAINT financiamiento_estado_valido CHECK (estado IS NULL OR estado IN (
    'financing_offered',
    'link_sent',
    'customer_reviewing',
    'application_started',
    'application_submitted',
    'approved',
    'info_required',
    'declined',
    'funded',
    'closed_not_interested'
  ))
);

CREATE INDEX IF NOT EXISTS idx_financiamiento_contacto
  ON public.financiamiento (contacto_id);
CREATE INDEX IF NOT EXISTS idx_financiamiento_estado
  ON public.financiamiento (estado);
-- Para la pantalla de pendientes: "a quién le toca seguimiento hoy".
CREATE INDEX IF NOT EXISTS idx_financiamiento_seguimiento
  ON public.financiamiento (seguimiento_fecha)
  WHERE seguimiento_fecha IS NOT NULL;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.financiamiento_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_financiamiento_touch ON public.financiamiento;
CREATE TRIGGER trg_financiamiento_touch
  BEFORE UPDATE ON public.financiamiento
  FOR EACH ROW EXECUTE FUNCTION public.financiamiento_touch();

-- ── RLS ─────────────────────────────────────────────────────
-- Mismo criterio que el resto del CRM: el equipo autenticado lee y escribe.
ALTER TABLE public.financiamiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financiamiento_lectura" ON public.financiamiento;
CREATE POLICY "financiamiento_lectura"
  ON public.financiamiento FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "financiamiento_escritura" ON public.financiamiento;
CREATE POLICY "financiamiento_escritura"
  ON public.financiamiento FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.financiamiento IS
  'Ficha de financiamiento por cliente (socio: Ascentium Capital). Los recordatorios de seguimiento a 24h y 3 días se crean en agenda_vendedor al marcar link_enviado.';
