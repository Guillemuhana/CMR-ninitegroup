-- ============================================================
-- PROMOCIONES — envío masivo de un mensaje a toda la base
-- ============================================================
-- Una campaña es "un mensaje que sale a muchos contactos de una vez".
-- Se guarda en la DB —y no solo en el navegador— por tres razones concretas:
--
--   1. Auditoría: quién mandó qué, a cuántos, y cuándo. Un envío masivo es la
--      acción más visible del CRM hacia afuera; tiene que quedar registrada.
--   2. Anti-duplicado: `campana_envios` tiene UNIQUE (campana_id, contacto_id).
--      Si el navegador se cierra a mitad del envío y se retoma la campaña, los
--      que ya recibieron NO vuelven a recibir. Sin esto, un F5 a destiempo le
--      manda la promo dos veces a media base.
--   3. Reanudar: el envío corre en el navegador (ver src/Promociones.jsx), así
--      que puede cortarse. El estado por contacto vive acá, no en memoria.
--
-- Ejecutar en Supabase → SQL Editor (proyecto de producción).
-- ============================================================

-- ── CAMPAÑAS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campanas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,

  -- Contenido. Una campaña puede llevar los dos: el texto libre va a los
  -- contactos dentro de la ventana de 24 h de WhatsApp y la plantilla a los que
  -- están fuera (ver PROMOCIONES.md). Messenger usa siempre el texto libre.
  mensaje           TEXT,           -- texto libre, admite {nombre}
  plantilla_nombre  TEXT,           -- template aprobado en Meta (ej: 'promo_verano')
  plantilla_idioma  TEXT DEFAULT 'es',
  plantilla_params  JSONB,          -- valores de {{1}}, {{2}}… en orden

  -- Cómo se armó la audiencia. Se guarda para poder explicar después a quién se
  -- le mandó, aunque los contactos hayan cambiado de estado desde entonces.
  filtros       JSONB,

  estado        TEXT NOT NULL DEFAULT 'borrador',
  total         INT  NOT NULL DEFAULT 0,   -- destinatarios al momento de disparar
  enviados      INT  NOT NULL DEFAULT 0,
  fallidos      INT  NOT NULL DEFAULT 0,

  creada_por    TEXT,                      -- nombre del vendedor/CEO
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminada_at  TIMESTAMPTZ,

  CONSTRAINT campanas_estado_valido CHECK (estado IN (
    'borrador',   -- se está redactando, todavía no salió nada
    'enviando',   -- envío en curso
    'pausada',    -- el usuario frenó a mitad; se puede retomar
    'enviada',    -- terminó de recorrer toda la lista
    'cancelada'
  )),
  -- Una campaña sin nada que mandar no debería poder existir.
  CONSTRAINT campanas_tiene_contenido CHECK (
    coalesce(mensaje, '') <> '' OR coalesce(plantilla_nombre, '') <> ''
  )
);

-- ── ENVÍOS (una fila por destinatario) ──────────────────────
CREATE TABLE IF NOT EXISTS public.campana_envios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id  UUID NOT NULL REFERENCES public.campanas(id) ON DELETE CASCADE,
  contacto_id UUID NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,

  canal       TEXT,        -- whatsapp | messenger
  modo        TEXT,        -- texto | plantilla  (cuál de los dos se usó)
  estado      TEXT NOT NULL DEFAULT 'pendiente',
  error       TEXT,        -- mensaje de error de Meta, tal cual, para diagnosticar
  enviado_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT campana_envios_estado_valido CHECK (estado IN ('pendiente', 'ok', 'error', 'omitido')),

  -- El seguro anti-duplicado. Es la razón principal por la que esta tabla existe.
  CONSTRAINT campana_envios_unico UNIQUE (campana_id, contacto_id)
);

CREATE INDEX IF NOT EXISTS idx_campana_envios_campana
  ON public.campana_envios (campana_id, estado);
CREATE INDEX IF NOT EXISTS idx_campana_envios_contacto
  ON public.campana_envios (contacto_id);
CREATE INDEX IF NOT EXISTS idx_campanas_fecha
  ON public.campanas (created_at DESC);

-- ── BAJA DE PROMOCIONES (opt-out) ───────────────────────────
-- Va en tabla aparte y no como columna de `contactos` por el mismo criterio que
-- `financiamiento`: `contactos` la leen casi todas las pantallas del CRM.
--
-- Es obligatorio respetarla: si un cliente pide que no le manden más promos y
-- igual le llega la siguiente, en WhatsApp eso se reporta como spam y le baja
-- la calidad al número de la empresa (Meta puede limitarlo o bloquearlo).
CREATE TABLE IF NOT EXISTS public.promos_baja (
  contacto_id UUID PRIMARY KEY REFERENCES public.contactos(id) ON DELETE CASCADE,
  motivo      TEXT,
  dado_por    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at automático en campañas
CREATE OR REPLACE FUNCTION public.campanas_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_campanas_touch ON public.campanas;
CREATE TRIGGER trg_campanas_touch
  BEFORE UPDATE ON public.campanas
  FOR EACH ROW EXECUTE FUNCTION public.campanas_touch();

-- ── RLS ─────────────────────────────────────────────────────
-- Mismo criterio que el resto del CRM: el equipo autenticado lee y escribe.
-- El acceso a la sección se restringe por rol en el front (NAV_ITEMS: solo CEO).
ALTER TABLE public.campanas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campana_envios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos_baja    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campanas_lectura" ON public.campanas;
CREATE POLICY "campanas_lectura"
  ON public.campanas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "campanas_escritura" ON public.campanas;
CREATE POLICY "campanas_escritura"
  ON public.campanas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "campana_envios_lectura" ON public.campana_envios;
CREATE POLICY "campana_envios_lectura"
  ON public.campana_envios FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "campana_envios_escritura" ON public.campana_envios;
CREATE POLICY "campana_envios_escritura"
  ON public.campana_envios FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "promos_baja_lectura" ON public.promos_baja;
CREATE POLICY "promos_baja_lectura"
  ON public.promos_baja FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "promos_baja_escritura" ON public.promos_baja;
CREATE POLICY "promos_baja_escritura"
  ON public.promos_baja FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.campanas IS
  'Envíos masivos de promociones. El envío corre en el navegador (src/Promociones.jsx) con throttle; el estado por destinatario vive en campana_envios.';
COMMENT ON TABLE public.campana_envios IS
  'Una fila por destinatario. El UNIQUE (campana_id, contacto_id) es lo que impide mandar dos veces la misma promo al mismo cliente si el envío se corta y se retoma.';
COMMENT ON TABLE public.promos_baja IS
  'Contactos que pidieron no recibir promociones. Se excluyen siempre del envío masivo, sin excepción.';
