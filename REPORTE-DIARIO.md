# Reporte diario en PDF para el CEO

Todos los días a las **21:00 hora de Miami** el asistente de IA del CRM arma un
PDF con todo lo que pasó en el día y lo manda por email a **ninitgroup@gmail.com**.

## Qué trae el PDF

1. **Resumen ejecutivo** escrito por la IA (Groq): la foto del día en 2-4 frases.
2. **Números del día**: mensajes totales, entrantes/salientes, conversaciones,
   clientes nuevos, facturado, tasa de respuesta, tiempo de respuesta mediano,
   cerrados y % de automatización — cada uno con la variación contra el promedio
   de los 7 días previos.
3. **Actividad por hora** (gráfico), **bot vs. equipo** y **tendencia de 8 días**.
4. **Lectura del día**: lo que funcionó, puntos de atención y acciones para mañana.
5. **Rendimiento por vendedor**: quién atendió más y quién menos, con mensajes,
   chats, tiempo de respuesta, cobertura de su cartera, leads nuevos, cierres,
   facturación y un puntaje de **efectividad**.
6. **Conversaciones más activas** del día con su último mensaje.
7. **Pendientes al cierre**: clientes esperando respuesta, seguimientos vencidos
   y leads nuevos sin vendedor asignado.
8. **Pedidos cargados** en el día.

> **Efectividad** = 45 % velocidad de respuesta + 30 % cobertura de su cartera
> (chats de sus clientes que sí respondió) + 25 % resultados (cierres y pedidos),
> siempre relativo al mejor del día. Es un ranking del día, no una nota absoluta.

## Cómo funciona

| Pieza | Archivo |
| --- | --- |
| Endpoint que orquesta todo | `api/reporte-diario.js` |
| Cálculo de métricas | `api/_reporte/metricas.js` |
| Resumen ejecutivo con IA | `api/_reporte/ia.js` |
| Armado del PDF (jsPDF) | `api/_reporte/pdf.js` |
| Envío del mail (nodemailer) | `api/_reporte/mail.js` |
| Fechas y zona horaria | `api/_reporte/dia.js` |
| Log de envíos | `supabase_reporte_diario.sql` |

Vercel Cron dispara **en UTC y no ajusta por horario de verano**, así que en
`vercel.json` hay dos horarios (`0 1 * * *` y `0 2 * * *`) y el endpoint descarta
el que no cae a las 21 h de Miami. La tabla `reportes_diarios` evita que se mande
dos veces el mismo día.

Si Groq no responde o no hay `GROQ_API_KEY`, el reporte igual sale: el resumen se
arma con los mismos números, sin IA.

## Puesta en marcha (una sola vez)

### 1. Contraseña de aplicación de Gmail

1. Entrá a <https://myaccount.google.com/security> con **ninitgroup@gmail.com** y
   activá la verificación en dos pasos (si no está activa, el paso 2 no aparece).
2. Andá a <https://myaccount.google.com/apppasswords>, creá una app password con
   el nombre "NINIT CRM" y copiá los 16 caracteres.

### 2. Variables de entorno en Vercel

En *Settings → Environment Variables* del proyecto `ninit-crm` (entorno
**Production**):

| Variable | Valor | Obligatoria |
| --- | --- | --- |
| `GMAIL_USER` | `ninitgroup@gmail.com` | sí |
| `GMAIL_APP_PASSWORD` | los 16 caracteres del paso 1 | sí |
| `SUPABASE_URL` | URL del proyecto Supabase | sí (ya está) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key | sí (ya está) |
| `CRON_SECRET` | cualquier string largo al azar | sí |
| `GROQ_API_KEY` | key de Groq | opcional (ya está) |
| `REPORTE_EMAIL_TO` | destinatarios separados por coma | opcional (default `ninitgroup@gmail.com`) |
| `REPORTE_EMAIL_CC` | copias | opcional |
| `REPORTE_TZ` | zona horaria | opcional (default `America/New_York`) |
| `REPORTE_HORA` | hora local de envío | opcional (default `21`) |

`CRON_SECRET` lo agrega Vercel solo al header `Authorization` de sus crons: sin
él, cualquiera podría disparar el endpoint.

### 3. Tabla de log en Supabase

En el SQL Editor de Supabase, correr `supabase_reporte_diario.sql`.

### 4. Deploy

```bash
npm run build
vercel --prod
```

El cron queda activo con el deploy (se ve en *Settings → Cron Jobs*).

## Probar sin esperar a las 21 h

Desde el **Panel de Control** del CEO, pestaña *Resumen*, hay dos botones:

- **Ver PDF de hoy** — genera y abre el PDF sin mandar mail.
- **Enviar ahora** — genera y envía el mail en el momento.

Desde la terminal, con el `CRON_SECRET`:

```bash
# PDF del día de hoy, sin mandar mail
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://ninit-crm.vercel.app/api/reporte-diario?preview=1&forzar=1" -o reporte.pdf

# Enviar el reporte de otro día
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://ninit-crm.vercel.app/api/reporte-diario?fecha=2026-07-27&forzar=1"
```

En local, sin tocar Vercel:

```bash
node scripts/probar-reporte.mjs             # datos reales (necesita service role en .env)
node scripts/probar-reporte-demo.mjs        # datos de prueba, sólo para ver el diseño
```

Ambos dejan el PDF en la carpeta temporal y muestran la ruta al terminar.

## Si algo falla

- **No llega el mail** → revisá `reportes_diarios`: si hay una fila con
  `estado = 'error'`, la columna `error` dice qué pasó. `Invalid login` casi
  siempre es la app password mal copiada (va sin espacios).
- **Llegó sin resumen de IA** → se agotó la cuota de Groq ese día; los números
  del PDF son igual de completos.
- **Llegó dos veces** → falta correr `supabase_reporte_diario.sql`.
- **Llegó a otra hora** → los crons del plan Hobby de Vercel pueden atrasarse
  hasta una hora; el reporte igual cubre el día completo.
