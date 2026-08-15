# Eventos del CRM → Meta (Conversions API)

Cierra el círculo de las campañas: Meta ya sabía que alguien **abría** una
conversación desde un anuncio, pero no qué pasaba después. Ahora el CRM le
devuelve los hitos comerciales (lead, cotización, lead calificado, venta) para
que optimice por gente que **compra**, no por gente que escribe.

---

## Mapeo de estados

Se configura en un solo lugar: [`api/_meta/mapeo.js`](api/_meta/mapeo.js).
Cambiar un nombre de evento ahí alcanza; no hay nombres sueltos en el resto del
código.

| Estado del CRM (`contactos.estado`) | Evento si el lead vino de mensajería | Evento en el resto de los casos | ¿Estándar? |
|---|---|---|---|
| `contactado` | `LeadSubmitted` | `Lead` | sí |
| `interesado` | `QualifiedLead` | `QualifiedLead` | no (personalizado fuera de mensajería) |
| `cotizacion` | `InitiateCheckout` | `InitiateCheckout` | sí |
| `vendido` / `pedido` / `cerrado` | `Purchase` (+ `value` y `currency`) | `Purchase` | sí |
| `nuevo`, `negociando`, `pendiente`, `perdido` | — | — | no manda nada |

Por qué dos columnas: Meta tiene **dos listas distintas** de nombres válidos.

- Los 17 *standard events* del Pixel (`Lead`, `Purchase`, `InitiateCheckout`, …)
  → https://developers.facebook.com/docs/meta-pixel/reference
- Los eventos soportados por *Conversions API for Business Messaging*
  (`LeadSubmitted`, `QualifiedLead`, `Purchase`, `InitiateCheckout`, …)
  → https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/

`QualifiedLead` existe en la segunda lista pero **no** es un standard event del
Pixel: fuera de mensajería viaja como evento personalizado, y está bien — no
hay estándar equivalente. Para "cotización enviada" Meta no tiene un `QuoteSent`
oficial en ninguna de las dos listas; se usa `InitiateCheckout`, que es el
estándar de "arrancó el proceso de compra". Si preferís un evento propio,
cambiá esas dos líneas del mapeo por `"QuoteSent"` y poné `estandar: false`.

## `action_source`: se elige según el origen real

Nunca se manda `website` — ninguna de estas conversiones pasa por la web.

| Situación del contacto | `action_source` | `messaging_channel` | Identificadores (sin hashear) |
|---|---|---|---|
| Vino por Messenger (tiene `messenger_id`) | `business_messaging` | `messenger` | `page_id` + `page_scoped_user_id` |
| Vino por Click-to-WhatsApp (tiene `meta_ctwa_clid`) | `business_messaging` | `whatsapp` | `whatsapp_business_account_id` + `ctwa_clid` |
| Vino por Instagram Direct | `business_messaging` | `instagram` | `instagram_business_account_id` + `ig_sid` |
| Sin atribución de mensajería | `META_ACTION_SOURCE_FALLBACK` (por defecto `chat`) | — | sólo datos personales hasheados |

**Qué se hashea (SHA-256, normalizado antes):** `em`, `ph`, `fn`, `ln`, `ct`,
`st`, `country`, `external_id`.
**Qué NO se hashea nunca:** `page_id`, `page_scoped_user_id`, `ctwa_clid`,
`whatsapp_business_account_id`, `ig_sid`. Hashearlos rompe el matching.

Detalle fino: en los contactos de Messenger la columna `telefono` guarda el
PSID, no un teléfono. Ese valor **no** se manda como `ph`.

## Cómo se evita mandar el mismo evento dos veces

Tres capas, de la más barata a la más fuerte:

1. **El front no pide nada si la etapa no cambió** (`src/metaEventos.js`).
2. **El server revalida la transición** (`resolverTransicion`): mismo estado →
   sin evento; estado sin mapeo → sin evento.
3. **`event_id` determinístico + `UNIQUE` en el outbox.** El id es
   `sha256(contacto_id | event_name | ref)`; antes de mandar nada se inserta la
   fila en `meta_eventos`. Si el `INSERT` choca con el índice único, el evento
   ya se había registrado y no se manda. Eso cubre doble click, dos pestañas,
   reintentos, webhooks repetidos y updates concurrentes — incluso entre dos
   invocaciones simultáneas de la función, porque el árbitro es Postgres.

Como los tres estados de venta comparten el evento `Purchase`, pasar de
`vendido` a `cerrado` no genera un segundo `Purchase`.

## Entrega confiable (outbox)

El proyecto no tiene colas ni workers, y los dos crons de Vercel Hobby ya están
ocupados por el reporte diario. En vez de inventar infraestructura:

- Cada evento se escribe **primero** en `meta_eventos` (`pendiente`) y recién
  después se manda; la fila queda en `enviado` o en `error` con el motivo.
- El envío tiene timeout (`META_CAPI_TIMEOUT_MS`), reintentos con backoff
  exponencial (400 ms → 800 ms → 1600 ms) y sólo reintenta lo reintentable
  (red caída, 429, 5xx). Un `400` no se reintenta.
- **Cada llamada al endpoint drena hasta 5 eventos viejos que hayan quedado en
  `error`** (hasta 5 intentos por evento). Así el outbox se vacía solo con el
  uso normal del CRM.
- También se puede forzar: `POST /api/meta-evento` con `{"accion":"drain"}`.

Si Meta falla, el estado del contacto en el CRM ya está guardado: la llamada es
posterior al `UPDATE` y su resultado no revierte nada ni se le muestra al
vendedor.

## Exclusión publicitaria

`contactos.publicidad_optout = true` → no se manda ningún evento de ese
contacto (queda registrado en el outbox como `omitido`, para poder auditarlo).
Hoy se marca a mano desde Supabase; no hay todavía un botón en la UI.

## Variables de entorno

Todas en Vercel → Settings → Environment Variables. Ver [`.env.example`](.env.example).

| Variable | Obligatoria | Para qué |
|---|---|---|
| `META_CAPI_TOKEN` | sí | Token del dataset (Events Manager → Configuración → Generar token) |
| `META_DATASET_ID` | sí | Id del Dataset / Pixel |
| `META_GRAPH_VERSION` | no (`v22.0`) | Versión de la Graph API |
| `META_PAGE_ID` | para Messenger | Id de la página de Facebook (`769915269545554`) |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | para CTWA | Id de la cuenta de WhatsApp Business |
| `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` | para IG | Id de la cuenta profesional de Instagram |
| `META_ACTION_SOURCE_FALLBACK` | no (`chat`) | `action_source` sin atribución de mensajería |
| `META_PHONE_COUNTRY_CODE` | no (`1`) | Prefijo para teléfonos sin código de país |
| `META_CAPI_TIMEOUT_MS` | no (`8000`) | Timeout por intento |
| `META_CAPI_REINTENTOS` | no (`3`) | Intentos por envío |
| `META_TEST_EVENT_CODE` | no | Código de "Probar eventos". **Vaciar en producción** |
| `META_WEBHOOK_SECRET` | no | Permite llamar al endpoint desde n8n con `x-meta-secret` |

Sin `META_CAPI_TOKEN` + `META_DATASET_ID` el CRM funciona exactamente igual que
antes: el endpoint responde `{ enviado: false, motivo: "Meta CAPI sin configurar." }`.

## Migración

Correr [`supabase_meta_capi.sql`](supabase_meta_capi.sql) en el SQL Editor de
**producción**. Agrega:

- `contactos`: `meta_ad_id`, `meta_ctwa_clid`, `meta_referral_ref`,
  `meta_referral_source`, `meta_messaging_channel`, `meta_atribuido_at`,
  `publicidad_optout`.
- Tabla `meta_eventos` (outbox) con `event_id` único.

Es idempotente. Mientras no se corra, el CRM sigue andando: el webhook guarda la
atribución en un `UPDATE` aparte que falla en silencio, y el endpoint responde
`outbox_no_disponible`.

## De dónde salen los datos de atribución

- **Messenger (funciona hoy):** `api/messenger-webhook.js` lee el bloque
  `referral` que manda Meta (en `event.referral`, `event.postback.referral` o
  `event.message.referral`) y guarda `ad_id`, `ref` y `source`. Gana la primera
  atribución: si el cliente vuelve a clickear otro anuncio, no se pisa.
- **WhatsApp (falta un paso, ver abajo):** el `ctwa_clid` llega en el webhook de
  WhatsApp Cloud API, que hoy entra por n8n y no por el CRM.

### Pendiente para que WhatsApp atribuya

En el workflow de n8n que sincroniza WhatsApp, el mensaje entrante trae
`entry[].changes[].value.messages[].referral.ctwa_clid` cuando viene de un
anuncio Click-to-WhatsApp. Hay que persistirlo en `contactos.meta_ctwa_clid`
(un `PATCH` a `contactos?telefono=eq.{numero}` con la service_role key alcanza).
Sin ese dato, los eventos de contactos de WhatsApp igual se mandan, pero con el
`action_source` de respaldo y sin quedar asociados al anuncio.

## Probar en local

```bash
npm test                 # 25 tests, ninguno llama a Meta de verdad
```

Contra Meta de verdad, sin ensuciar la optimización:

1. Events Manager → tu dataset → pestaña **Probar eventos** → copiar el código.
2. Poner `META_TEST_EVENT_CODE=TESTxxxxx` en Vercel (o en `.env` + `vercel dev`).
3. Cambiar la etapa de un contacto en el CRM.
4. El evento aparece en vivo en esa pestaña.
5. **Borrar `META_TEST_EVENT_CODE` cuando termines** — con el código puesto los
   eventos no cuentan para optimización.

Para ver qué pasó con cada evento:

```sql
select created_at, event_name, estado_nuevo, action_source, canal,
       estado, intentos, error
from meta_eventos
order by created_at desc
limit 20;
```
