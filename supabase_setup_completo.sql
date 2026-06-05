-- ============================================================
-- SETUP COMPLETO — NINIT Group CRM
-- Pegá TODO esto en Supabase → SQL Editor → RUN (una sola vez)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── TABLAS PRINCIPALES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contactos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono      TEXT UNIQUE NOT NULL,
  nombre        TEXT,
  vendedor      TEXT,
  estado        TEXT NOT NULL DEFAULT 'nuevo',
  bot_activo    BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_msg    TEXT,
  no_leidos     INT NOT NULL DEFAULT 0,
  seguimiento_at TIMESTAMPTZ,
  nota_seguimiento TEXT,
  email         TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_in_at  TIMESTAMPTZ,
  ultimo_out_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.mensajes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id   UUID NOT NULL REFERENCES public.contactos(id) ON DELETE CASCADE,
  direccion     TEXT NOT NULL,
  origen        TEXT NOT NULL DEFAULT 'bot',
  agente        TEXT,
  contenido     TEXT,
  wa_message_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pedidos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id   UUID REFERENCES public.contactos(id) ON DELETE SET NULL,
  vendedor      TEXT,
  detalle       TEXT,
  total         NUMERIC DEFAULT 0,
  estado        TEXT NOT NULL DEFAULT 'pendiente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendedores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL UNIQUE,
  email      TEXT,
  activo     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.vendedores (nombre, email) VALUES
  ('Nicolas', 'nicolas@ninitgroup.com')
ON CONFLICT (nombre) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.historial_clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id UUID REFERENCES public.contactos(id) ON DELETE CASCADE,
  vendedor    TEXT,
  accion      TEXT NOT NULL,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mensajes_contacto ON public.mensajes (contacto_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mensajes_fecha    ON public.mensajes (created_at);
CREATE INDEX IF NOT EXISTS idx_contactos_updated ON public.contactos (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactos_creado  ON public.contactos (created_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha      ON public.pedidos (created_at);
CREATE INDEX IF NOT EXISTS idx_historial_contacto ON public.historial_clientes (contacto_id, created_at);

-- ── TRIGGER: actualizar contacto al entrar/salir un mensaje ──
CREATE OR REPLACE FUNCTION fn_touch_contacto()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.contactos
     SET ultimo_msg = left(coalesce(NEW.contenido, '[media]'), 120),
         updated_at = NOW(),
         no_leidos  = CASE WHEN NEW.direccion = 'in' THEN no_leidos + 1 ELSE no_leidos END,
         ultimo_in_at  = CASE WHEN NEW.direccion = 'in'  THEN NOW() ELSE ultimo_in_at END,
         ultimo_out_at = CASE WHEN NEW.direccion = 'out' THEN NOW() ELSE ultimo_out_at END
   WHERE id = NEW.contacto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_touch_contacto ON public.mensajes;
CREATE TRIGGER trg_touch_contacto
  AFTER INSERT ON public.mensajes
  FOR EACH ROW EXECUTE FUNCTION fn_touch_contacto();

-- ── FUNCIÓN ingest desde n8n ────────────────────────────────
CREATE OR REPLACE FUNCTION ingest_mensaje(
  p_telefono TEXT, p_nombre TEXT, p_contenido TEXT,
  p_direccion TEXT, p_origen TEXT
) RETURNS VOID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.contactos (telefono, nombre)
  VALUES (p_telefono, nullif(p_nombre,''))
  ON CONFLICT (telefono) DO UPDATE
    SET nombre = coalesce(nullif(excluded.nombre,''), public.contactos.nombre)
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.contactos WHERE telefono = p_telefono;
  END IF;

  INSERT INTO public.mensajes (contacto_id, direccion, origen, contenido)
  VALUES (v_id, p_direccion, p_origen, p_contenido);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION ingest_mensaje(text,text,text,text,text) FROM anon, authenticated, public;

-- ── REALTIME ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contactos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendedores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.historial_clientes;

-- ── SEGURIDAD (RLS) ─────────────────────────────────────────
ALTER TABLE public.contactos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_contactos"  ON public.contactos;
DROP POLICY IF EXISTS "auth_mensajes"   ON public.mensajes;
DROP POLICY IF EXISTS "auth_pedidos"    ON public.pedidos;
DROP POLICY IF EXISTS "auth_vendedores" ON public.vendedores;
DROP POLICY IF EXISTS "auth_historial"  ON public.historial_clientes;

CREATE POLICY "auth_contactos"  ON public.contactos          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_mensajes"   ON public.mensajes           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_pedidos"    ON public.pedidos            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_vendedores" ON public.vendedores         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_historial"  ON public.historial_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── VERIFICACIÓN ────────────────────────────────────────────
SELECT 'contactos' t, count(*) n FROM public.contactos
UNION ALL SELECT 'mensajes', count(*) FROM public.mensajes
UNION ALL SELECT 'pedidos', count(*) FROM public.pedidos
UNION ALL SELECT 'vendedores', count(*) FROM public.vendedores
UNION ALL SELECT 'historial_clientes', count(*) FROM public.historial_clientes;
