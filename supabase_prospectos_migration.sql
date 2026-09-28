-- ============================================================
-- MIGRACIÓN: Clientes potenciales guardados — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- Proyecto de PRODUCCIÓN: xeggotxdridyuwvxxfko
-- ============================================================
--
-- Objetivo: los negocios que salen del buscador de Clientes
-- potenciales (src/prospectos/) se pueden guardar en una cartera
-- para trabajarlos después: estado, vendedor, nota y registro de
-- cada contacto. Ver CLIENTES-POTENCIALES.md.
--
-- Es una tabla aparte de `contactos` a propósito: estos negocios
-- NUNCA le escribieron a NTG. Meterlos en contactos los mezclaría
-- con los chats reales y con los envíos masivos de Promociones,
-- que no se les pueden mandar (no dieron su permiso).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prospectos_guardados (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id            TEXT NOT NULL UNIQUE,      -- id de Google ("g:…") u OpenStreetMap ("osm:…")
  nombre              TEXT NOT NULL,
  direccion           TEXT,
  ciudad              TEXT,
  telefono            TEXT,
  email               TEXT,
  sitio_web           TEXT,
  tipo_negocio        TEXT,
  rubro               TEXT,
  perfil              TEXT,
  lead_score          INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  prioridad           TEXT NOT NULL DEFAULT 'MEDIA' CHECK (prioridad IN ('ALTA','MEDIA','BAJA')),
  productos_sugeridos TEXT,
  enfoque_venta       TEXT,
  motivo              TEXT,
  latitud             DOUBLE PRECISION,
  longitud            DOUBLE PRECISION,
  maps_url            TEXT,
  calificacion        NUMERIC(2,1),
  num_resenas         INTEGER,
  -- de qué búsqueda salió
  busqueda            TEXT,
  zona                TEXT,
  fuente              TEXT,                      -- 'google' | 'osm'
  -- seguimiento
  estado              TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (estado IN ('nuevo','contactado','respondio','interesado','descartado')),
  vendedor            TEXT,
  nota                TEXT,
  contactos           INTEGER NOT NULL DEFAULT 0,
  ultimo_contacto_at  TIMESTAMPTZ,
  ultimo_canal        TEXT,                      -- 'email' | 'WhatsApp' | 'llamada'
  guardado_por        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospectos_estado  ON public.prospectos_guardados (estado);
CREATE INDEX IF NOT EXISTS idx_prospectos_creado  ON public.prospectos_guardados (created_at DESC);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.prospectos_tocar_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prospectos_updated_at ON public.prospectos_guardados;
CREATE TRIGGER trg_prospectos_updated_at
  BEFORE UPDATE ON public.prospectos_guardados
  FOR EACH ROW EXECUTE FUNCTION public.prospectos_tocar_updated_at();

-- ── RLS (mismo patrón que agenda/diario) ─────────────────────
-- Son datos públicos de negocios (lo que muestra Google Maps);
-- la pantalla ya está limitada al CEO.
ALTER TABLE public.prospectos_guardados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_prospectos" ON public.prospectos_guardados;
CREATE POLICY "auth_prospectos"
  ON public.prospectos_guardados FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT COUNT(*) AS guardados FROM public.prospectos_guardados;
