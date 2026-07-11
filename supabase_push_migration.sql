-- ============================================================================
-- NOTIFICACIONES PUSH (funcionan con la app cerrada)
-- Correr en el SQL Editor del proyecto de PRODUCCIÓN (xeggotxdridyuwvxxfko).
-- ============================================================================

-- 1) Tabla donde se guardan las suscripciones push de cada vendedor/dispositivo
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  vendedor    text,               -- perfil.nombre (para filtrar por dueño del contacto)
  rol         text default 'vendedor',
  user_id     uuid,
  email       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists push_subscriptions_vendedor_idx on public.push_subscriptions (vendedor);
create index if not exists push_subscriptions_rol_idx       on public.push_subscriptions (rol);

-- 2) RLS: el CRM nunca lee/escribe esta tabla directo (usa el endpoint con
--    service_role, que ignora RLS). Igual la dejamos con RLS ON y sin políticas
--    para anon/authenticated, así nadie puede espiar/borrar suscripciones ajenas.
alter table public.push_subscriptions enable row level security;

-- 3) Extensión pg_net para que la base pueda hacer HTTP POST al endpoint.
create extension if not exists pg_net with schema extensions;

-- 4) Función + trigger: en cada mensaje ENTRANTE ('in'), avisar al endpoint
--    /api/push-send para que dispare las notificaciones.
--
--    ⚠️ REEMPLAZAR:
--      - la URL si tu dominio de producción cambia
--      - el x-push-secret debe ser EXACTAMENTE igual a PUSH_WEBHOOK_SECRET en Vercel
create or replace function public.notificar_push_mensaje()
returns trigger
language plpgsql
security definer
as $$
begin
  if (NEW.direccion = 'in') then
    perform net.http_post(
      url     := 'https://ninit-crm.vercel.app/api/push-send',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-push-secret', '3105a8aa43b38ad743d9d7fb175418c73186a4052e92c656'
                 ),
      body    := jsonb_build_object('record', to_jsonb(NEW))
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notificar_push_mensaje on public.mensajes;
create trigger trg_notificar_push_mensaje
  after insert on public.mensajes
  for each row
  execute function public.notificar_push_mensaje();

-- ============================================================================
-- Listo. A partir de acá, cada mensaje entrante dispara un POST a /api/push-send.
-- ============================================================================
