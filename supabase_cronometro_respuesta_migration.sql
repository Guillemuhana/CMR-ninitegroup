-- Cronómetro de tiempo de respuesta por chat.
-- `atendido_at` = cuándo alguien del equipo (vendedor o administración) abrió el
-- chat y leyó el mensaje. Frena el cronómetro.
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS atendido_at timestamptz;

-- Backfill: los chats ya revisados arrancan como "atendidos" para no encender
-- el cronómetro de golpe en todos al desplegar. Los nuevos mensajes de clientes
-- (ultimo_in_at más nuevo que atendido_at) volverán a iniciar el reloj.
UPDATE public.contactos
   SET atendido_at = revisado_at
 WHERE atendido_at IS NULL
   AND revisado_at IS NOT NULL;
