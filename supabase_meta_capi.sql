-- ============================================================================
-- META CONVERSIONS API — atribución de campañas + outbox de eventos
-- Correr en el SQL Editor del proyecto de PRODUCCIÓN (xeggotxdridyuwvxxfko).
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================================
--
-- Para qué sirve: hoy Meta sabe que alguien abrió una conversación desde un
-- anuncio, pero no sabe qué pasó después. Con esto el CRM le devuelve los
-- eventos del ciclo comercial (lead, cotización, calificado, venta) para que
-- optimice las campañas por gente que compra, no por gente que escribe.
--
-- Ver META-CAPI.md para el mapeo de estados y las variables de entorno.

-- ── 1) Datos de atribución que manda Meta al abrirse la conversación ────────
-- Se guardan tal cual llegan (NO se hashean: Meta los espera en claro).
--   meta_ad_id            → referral.ad_id (Messenger) / ctwa ad id
--   meta_ctwa_clid        → click id de Click-to-WhatsApp (lo tiene que
--                           mandar n8n; ver META-CAPI.md)
--   meta_referral_ref     → referral.ref (el parámetro `ref` del m.me / anuncio)
--   meta_referral_source  → referral.source ('ADS', 'SHORTLINK', …)
--   meta_messaging_channel→ 'messenger' | 'whatsapp' | 'instagram'
--   meta_atribuido_at     → cuándo se capturó (para no pisarlo después)
alter table public.contactos add column if not exists meta_ad_id             text;
alter table public.contactos add column if not exists meta_ctwa_clid         text;
alter table public.contactos add column if not exists meta_referral_ref      text;
alter table public.contactos add column if not exists meta_referral_source   text;
alter table public.contactos add column if not exists meta_messaging_channel text;
alter table public.contactos add column if not exists meta_atribuido_at      timestamptz;

-- Exclusión publicitaria: si el cliente pide no ser usado para publicidad,
-- se marca acá y el CRM deja de mandar sus eventos a Meta.
alter table public.contactos add column if not exists publicidad_optout boolean not null default false;

create index if not exists idx_contactos_meta_ctwa on public.contactos (meta_ctwa_clid)
  where meta_ctwa_clid is not null;

-- ── 2) Outbox de eventos ───────────────────────────────────────────────────
-- Cada evento que el CRM le debe a Meta se escribe PRIMERO acá y recién
-- después se manda. Si Meta falla, la fila queda en 'error' y se reintenta;
-- el estado del contacto en el CRM nunca depende de que Meta responda.
--
-- `event_id` es UNIQUE: es la garantía anti-duplicado. Se calcula de forma
-- determinística (contacto + evento + referencia), así que dos clicks, dos
-- pestañas, un reintento o un webhook repetido colisionan en la misma fila.
create table if not exists public.meta_eventos (
  id              uuid primary key default gen_random_uuid(),
  contacto_id     uuid references public.contactos(id) on delete cascade,
  event_id        text not null unique,
  event_name      text not null,
  estado_anterior text,
  estado_nuevo    text,
  valor           numeric,
  moneda          text,
  action_source   text,
  canal           text,
  payload         jsonb,
  respuesta       jsonb,
  estado          text not null default 'pendiente',  -- pendiente|enviado|error|omitido
  intentos        int  not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  enviado_at      timestamptz
);

create index if not exists idx_meta_eventos_estado   on public.meta_eventos (estado, created_at);
create index if not exists idx_meta_eventos_contacto on public.meta_eventos (contacto_id, created_at desc);

-- ── 3) RLS ─────────────────────────────────────────────────────────────────
-- El outbox lo escribe/lee sólo el endpoint con service_role (que ignora RLS).
-- Se deja RLS ON con una política de sólo lectura para el equipo logueado, así
-- se puede auditar desde el SQL Editor / futuros reportes sin exponer nada a anon.
alter table public.meta_eventos enable row level security;

drop policy if exists "auth_meta_eventos_read" on public.meta_eventos;
create policy "auth_meta_eventos_read" on public.meta_eventos
  for select to authenticated using (true);

-- ── 4) Verificación ────────────────────────────────────────────────────────
select 'meta_eventos' as tabla, count(*) as filas from public.meta_eventos;
