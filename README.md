# CRM Nuevo Munich — Sistema completo

CRM propio estilo Chatwoot, a medida para **Nuevo Munich** (Artesanos del Sabor desde 1972).
El equipo ve los mensajes del cliente y del bot en tiempo real, toma la conversación cuando hace falta,
hace seguimiento de clientes, recibe alertas y analiza el negocio con reportes diarios/semanales/mensuales.

**Stack:** React + Vite → Vercel · Supabase (DB + Auth + Realtime) · n8n (envío WhatsApp) · recharts + jsPDF.

## Funcionalidades
- **Conversaciones**: bandeja en tiempo real, filtros por estado, no leídos, asignación de vendedor.
- **Bot/Humano**: toggle por conversación. Al tomarla, el bot se calla y el vendedor responde directo.
- **Seguimiento**: fecha de próximo contacto + nota por cliente.
- **Alertas** 🔔: clientes esperando respuesta >1h, leads nuevos sin asignar, seguimientos vencidos.
- **Reportes**: KPIs (mensajes, nuevos contactos, pedidos, facturación, ticket promedio, % bot),
  gráficos de actividad, rendimiento por vendedor y embudo de estados. Períodos: Hoy / Semana / Mes / Año.
- **Exportación**: PDF (reporte completo con tablas) y CSV (vendedores).
- **Seguridad**: RLS activo, solo usuarios autenticados acceden; manejo de errores en envío.

---

## 1. Supabase
1. SQL Editor → New query → pegá y ejecutá `supabase_schema.sql` completo.
2. Authentication → Users → Add user → creá los **3 usuarios** del equipo.
3. Settings → API → copiá `Project URL` y `anon public key`.

## 2. n8n — workflow de envío
1. Import from File → `n8n_MunichCRM-Send.json`.
2. Nodo "Enviar WhatsApp (Meta)" → asigná tu credencial de WhatsApp (la de NuevoMunich-Chat).
3. Activá el workflow y copiá la URL del webhook (production).

## 3. n8n — 2 cambios mínimos en `NuevoMunich-Chat`
(No se toca el Simple Memory ni el system prompt del agente.)

**A. Loguear mensajes en Supabase** — HTTP Request `POST` a
`https://TUPROYECTO.supabase.co/rest/v1/rpc/ingest_mensaje`
con headers `apikey` y `Authorization: Bearer <SERVICE_ROLE_KEY>`, body:
```json
{ "p_telefono": "={{ $json.messages[0].from }}",
  "p_nombre": "={{ $json.contacts?.[0]?.profile?.name || '' }}",
  "p_contenido": "={{ $json.messages[0].text?.body || '[media]' }}",
  "p_direccion": "in", "p_origen": "cliente" }
```
Repetí tras la respuesta del bot con `p_direccion:"out"`, `p_origen:"bot"`.

**B. Respetar el toggle** — antes del Agente IA, un HTTP `GET` a
`.../rest/v1/contactos?telefono=eq.{{ $json.messages[0].from }}&select=bot_activo`
y un nodo IF: si `bot_activo=false`, no responde (el vendedor atiende).

## 4. Vercel
1. Subí la carpeta a GitHub.
2. New Project → importá el repo → framework **Vite**.
3. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_N8N_SEND_WEBHOOK`.
4. Deploy.

## Pedidos y facturación
El schema ya incluye la tabla `pedidos` con campo `total`. Los reportes calculan facturación y ticket
promedio automáticamente. Para activarlo, cuando definas: insertá un registro en `pedidos` al confirmar
(se puede automatizar desde n8n o agregar un botón "Crear pedido" en el chat — avisá y lo sumo).

## Seguridad — checklist de producción
- RLS activo en las 3 tablas; sin sesión válida no se accede a datos.
- n8n usa **service_role key** (guardala solo en n8n, nunca en el frontend).
- El frontend usa **anon key** (pública, segura) + login obligatorio.
- Envío con manejo de errores: si WhatsApp falla, el texto se preserva y se avisa.
- Recomendado: en Supabase Auth desactivá "Allow new sign-ups" para que solo entren los 3 usuarios creados.
