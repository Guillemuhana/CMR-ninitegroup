-- ============================================================
-- FIX: Soporte de Email como canal — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- ============================================================

-- 1. Agregar columna canal a contactos
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'whatsapp';

-- 2. Agregar empresa, direccion, tipo por si no existen
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS empresa   TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE public.contactos ADD COLUMN IF NOT EXISTS tipo      TEXT DEFAULT 'prospecto';

-- 3. Hacer telefono nullable (email contacts no tienen teléfono)
--    Primero quitamos el NOT NULL
ALTER TABLE public.contactos ALTER COLUMN telefono DROP NOT NULL;

-- 4. El UNIQUE en telefono debe ignorar NULLs (Postgres ya lo hace por defecto)
--    pero necesitamos un índice unique parcial para emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_contactos_email_unico
  ON public.contactos (email)
  WHERE email IS NOT NULL AND (canal = 'email' OR canal = 'google_ads');

-- 5. Función ingest_email — llamada por n8n cuando llega un email/formulario
CREATE OR REPLACE FUNCTION ingest_email(
  p_email     TEXT,
  p_nombre    TEXT,
  p_contenido TEXT,
  p_direccion TEXT,   -- 'in' o 'out'
  p_origen    TEXT,   -- 'cliente', 'bot', 'agente'
  p_canal     TEXT DEFAULT 'email'  -- 'email' o 'google_ads'
) RETURNS VOID AS $$
DECLARE v_id UUID;
BEGIN
  -- Upsert por email
  INSERT INTO public.contactos (email, nombre, canal, telefono)
  VALUES (
    p_email,
    nullif(p_nombre, ''),
    p_canal,
    -- telefono NULL para email contacts; usamos email como fallback de display
    NULL
  )
  ON CONFLICT (email) WHERE email IS NOT NULL AND (canal = 'email' OR canal = 'google_ads')
  DO UPDATE
    SET nombre = coalesce(nullif(excluded.nombre, ''), public.contactos.nombre)
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.contactos
    WHERE email = p_email
      AND (canal = 'email' OR canal = 'google_ads')
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.mensajes (contacto_id, direccion, origen, contenido)
  VALUES (v_id, p_direccion, p_origen, p_contenido);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Permisos: solo service_role puede llamar (desde n8n con la service key)
REVOKE EXECUTE ON FUNCTION ingest_email(text,text,text,text,text,text) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION ingest_email(text,text,text,text,text,text) TO service_role;

-- También darle acceso al service_role a ingest_mensaje existente
GRANT EXECUTE ON FUNCTION ingest_mensaje(text,text,text,text,text) TO service_role;

-- 6. Actualizar contactos WhatsApp existentes para que tengan canal = 'whatsapp'
UPDATE public.contactos SET canal = 'whatsapp' WHERE canal IS NULL AND telefono IS NOT NULL;

-- 7. Índice para búsquedas por canal
CREATE INDEX IF NOT EXISTS idx_contactos_canal ON public.contactos (canal);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT canal, count(*) FROM public.contactos GROUP BY canal ORDER BY canal;
