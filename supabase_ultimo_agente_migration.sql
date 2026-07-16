-- ============================================================
-- MIGRACIÓN: "Quién está en este chat" — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- ============================================================
--
-- Objetivo: que en la lista de conversaciones se vea, al lado del estado
-- (LEAD NUEVO, etc.), el nombre del vendedor que viene atendiendo ese chat,
-- para que otro vendedor no se meta encima.
--
-- `contactos.vendedor`       = asignación formal del CEO (manda si está puesta).
-- `contactos.ultimo_agente`  = el último HUMANO que respondió de hecho.
--                              Lo escribe solo el trigger de acá abajo.
--
-- Los mensajes del bot NO cuentan: solo los salientes con `agente` cargado
-- (los que manda un vendedor desde el CRM van con origen='agente').
-- ============================================================

-- 1. Columna
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS ultimo_agente TEXT;

-- 2. Trigger propio (NO toca fn_touch_contacto, que sigue como está)
CREATE OR REPLACE FUNCTION fn_ultimo_agente()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.contactos
     SET ultimo_agente = btrim(NEW.agente)
   WHERE id = NEW.contacto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_ultimo_agente ON public.mensajes;
CREATE TRIGGER trg_ultimo_agente
  AFTER INSERT ON public.mensajes
  FOR EACH ROW
  WHEN (
    NEW.direccion = 'out'
    AND btrim(coalesce(NEW.agente, '')) <> ''
    AND lower(coalesce(NEW.origen, '')) <> 'bot'
    AND lower(btrim(coalesce(NEW.agente, ''))) NOT IN ('bot', 'automático', 'automatico')
  )
  EXECUTE FUNCTION fn_ultimo_agente();

-- 3. Backfill: el último humano que habló en cada chat, con lo ya guardado
UPDATE public.contactos c
   SET ultimo_agente = m.agente
  FROM (
    SELECT DISTINCT ON (contacto_id) contacto_id, btrim(agente) AS agente
      FROM public.mensajes
     WHERE direccion = 'out'
       AND btrim(coalesce(agente, '')) <> ''
       AND lower(coalesce(origen, '')) <> 'bot'
       AND lower(btrim(coalesce(agente, ''))) NOT IN ('bot', 'automático', 'automatico')
     ORDER BY contacto_id, created_at DESC
  ) m
 WHERE m.contacto_id = c.id
   AND c.ultimo_agente IS DISTINCT FROM m.agente;

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT nombre, estado, vendedor AS asignado, ultimo_agente AS hablando
FROM public.contactos
WHERE ultimo_agente IS NOT NULL
ORDER BY updated_at DESC
LIMIT 20;
