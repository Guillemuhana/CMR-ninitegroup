-- ────────────────────────────────────────────────────────────────
-- Asignación de clientes a vendedores (click derecho en el chat → "Asignar
-- a vendedor"). Guarda quién asignó y cuándo, para el aviso "se te asignó
-- un cliente" y para dejar registro.
--
-- Correr UNA sola vez en el SQL Editor de Supabase (proyecto de producción).
-- NOTA: la app funciona igual sin correr esto (la asignación en sí usa la
-- columna `vendedor`, que ya existe). Estas columnas solo agregan el nombre
-- de quién asignó al aviso. El PUSH al vendedor lo dispara el navegador del
-- CEO vía /api/push-send (tipo:"asignacion"), así que NO hace falta trigger acá.
-- ────────────────────────────────────────────────────────────────

alter table public.contactos add column if not exists asignado_por text;
alter table public.contactos add column if not exists asignado_at  timestamptz;
