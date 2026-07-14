-- Cronómetro de tiempo de respuesta por chat.
-- `atendido_at` = cuándo un VENDEDOR abrió el chat. Frena el cronómetro.
-- Si lo abre Nico (CEO) NO se toca, así el reloj sigue corriendo (es un control
-- de los tiempos de respuesta del equipo de ventas).
ALTER TABLE public.contactos
  ADD COLUMN IF NOT EXISTS atendido_at timestamptz;

-- Backfill: los chats ya revisados arrancan como "atendidos" para no encender
-- el cronómetro de golpe en todos al desplegar. Los nuevos mensajes de clientes
-- (ultimo_in_at más nuevo que atendido_at) volverán a iniciar el reloj.
UPDATE public.contactos
   SET atendido_at = revisado_at
 WHERE atendido_at IS NULL
   AND revisado_at IS NOT NULL;
