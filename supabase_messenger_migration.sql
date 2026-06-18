-- ============================================================
-- MIGRACIÓN: Soporte de Messenger — NINIT Group CRM
-- Ejecutar en Supabase → SQL Editor → RUN (una sola vez)
-- Proyecto de PRODUCCIÓN: xeggotxdridyuwvxxfko
-- ============================================================
--
-- Problema: los mensajes entrantes de Messenger no se guardaban
-- porque la tabla contactos no tenía la columna messenger_id. El
-- webhook (api/messenger-webhook.js) busca/crea el contacto por
-- messenger_id; al no existir la columna, el insert falla (42703)
-- y el mensaje se descarta.
-- ============================================================

-- 1. Identificador de Messenger (PSID) del contacto
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS messenger_id TEXT;

-- 2. Foto de perfil (usada por el front para el avatar) — también faltaba
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- 3. Índice para buscar rápido el contacto entrante por su PSID
CREATE INDEX IF NOT EXISTS idx_contactos_messenger_id
  ON public.contactos (messenger_id);

-- 4. Tabla de logs del webhook (para depurar qué postea Meta) — opcional pero útil
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  body       JSONB,
  headers    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── VERIFICACIÓN ─────────────────────────────────────────────
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'contactos'
  AND column_name IN ('messenger_id', 'foto_url', 'canal');
