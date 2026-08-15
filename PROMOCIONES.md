# Promociones — envío masivo

Sección del CRM (solo CEO) para mandarle **una promoción a todos los clientes
que nos escribieron**, de una sola vez.

- UI: [`src/Promociones.jsx`](src/Promociones.jsx)
- Reglas de envío: [`src/promos.js`](src/promos.js) · tests en [`tests/promos.test.js`](tests/promos.test.js)
- Salida por canal: `enviarPorCanal()` en [`src/lib.js`](src/lib.js)
- Base de datos: [`supabase_promociones.sql`](supabase_promociones.sql)

---

## ⚠️ Lo primero que hay que entender: la ventana de 24 h

El WhatsApp del CRM sale por la **API oficial de Meta** (WhatsApp Business
Cloud, vía el workflow `NINIT CRM - Send` en n8n). Eso impone una regla que no
es nuestra y no se puede esquivar:

> Solo se le puede mandar **texto libre** a alguien que escribió en las
> **últimas 24 horas**. Pasado ese plazo, Meta rechaza el mensaje (error
> `131047`) salvo que sea una **plantilla previamente aprobada**.

En la práctica, "mandarle a todos los que nos escribieron alguna vez" se parte
en dos grupos, y el CRM te los muestra separados:

| Grupo | Qué recibe | Requisito |
|---|---|---|
| Escribieron hace **menos de 24 h** | El texto libre que escribís | Nada |
| Escribieron hace **más de 24 h** (WhatsApp) | Una plantilla aprobada | Crearla y que Meta la apruebe |
| Escribieron hace **más de 24 h** (Messenger) | **Nada.** Se saltean | No hay forma: Meta no permite promociones fuera de la ventana en Messenger |

Sin plantilla configurada, una campaña típica alcanza solo a un puñado de
contactos. **Eso no es un bug del CRM**: el panel te dice cuántos quedan afuera
y por qué.

---

## Crear la plantilla en Meta (se hace una sola vez por promo)

1. Entrá a **Meta Business Manager → WhatsApp Manager → Plantillas de mensajes**.
2. **Crear plantilla** → categoría **Marketing**.
3. Ponele un nombre en minúsculas y con guiones bajos: `promo_black_friday`.
   Ese nombre exacto es el que va en el CRM.
4. Escribí el cuerpo. Si querés partes variables, usá `{{1}}`, `{{2}}`…
   Ejemplo: `Hola! Este mes tenemos {{1}} de descuento en trailers. Válido hasta {{2}}.`
5. Enviala a aprobación. Suele tardar de minutos a unas horas.
6. Cuando figure **Aprobada**, en el CRM tildá *"Usar plantilla para los de más
   de 24 h"* y cargá:
   - **Nombre**: `promo_black_friday` (exacto)
   - **Idioma**: el código del idioma de la plantilla (`es`, `en_US`…)
   - **Variables**: los valores de `{{1}}`, `{{2}}`… separados por `|`
     → `15% | 30 de septiembre`

> Si la cantidad de variables no coincide con la plantilla aprobada, Meta
> rechaza el envío con un `132000`. El CRM te lo muestra traducido.

---

## Cómo usar la sección

1. **Nav lateral → Promociones** (solo la ve el CEO).
2. Ponele nombre a la campaña — es solo para el historial, el cliente no lo ve.
3. Escribí el mensaje. `{nombre}` se reemplaza por el nombre de cada cliente;
   si el contacto no tiene nombre cargado queda vacío, así que escribí el saludo
   de forma que igual se entienda.
4. Elegí la audiencia: canal, hace cuánto escribieron, y qué estados excluir.
   El contador de la derecha se actualiza solo.
5. **Mandate una prueba a tu propio número** antes de disparar. Está el campo
   para eso.
6. Revisá el desglose (texto libre / plantilla / omitidos) y apretá **Enviar**.
7. Confirmá. Aparece una barra de progreso con **Pausar** y **Frenar**.

### Ritmo de envío

El desplegable de ritmo no está por un límite técnico —la API de Meta aguanta
mucho más— sino de **reputación**. Cientos de mensajes idénticos disparados de
golpe es el patrón que Meta marca como spam, y lo que está en juego es el número
de WhatsApp de la empresa. Ante la duda, "Prudente".

### La pestaña tiene que quedar abierta

El envío corre en el navegador, no en el servidor. Motivo: el proyecto está en
el tope de **12 funciones serverless** del plan Hobby de Vercel (ver
`AGENTS.md`), y una función Hobby corta a los 60 s, que no alcanza para recorrer
cientos de contactos con pausa entre uno y otro.

Si la pestaña se cierra a mitad de camino, **no se pierde nada**: cada
destinatario se marca en `campana_envios` apenas se resuelve. La campaña queda
en estado `pausada` y desde **Historial → Retomar** sigue exactamente donde
quedó, sin repetirle el mensaje a nadie.

---

## Qué pasa por debajo

```
Promociones.jsx
   │  arma la audiencia y el plan por contacto (planDeEnvio)
   ├─► crea la fila en `campanas`
   ├─► reserva TODOS los destinatarios en `campana_envios` (estado 'pendiente')
   │      └─ el UNIQUE (campana_id, contacto_id) es el seguro anti-duplicado
   │
   └─► para cada uno, de a uno y con pausa:
          enviarPorCanal()  ──►  n8n `ninit-crm-send`  ──►  Graph API de Meta
                                       └─► responde { ok } o { ok:false, error }
          inserta en `mensajes`  (queda en el chat del cliente)
          marca la fila de `campana_envios` como 'ok' o 'error'
```

Los mensajes quedan en la conversación de cada cliente a propósito: el vendedor
que abra ese chat tiene que ver que le llegó la promo, o va a responder sin
saber de qué le están hablando.

### Baja de promociones (opt-out)

La tabla `promos_baja` lista a los contactos que pidieron no recibir más promos.
**Se excluyen siempre**, sin excepción. Hoy se cargan por SQL:

```sql
insert into promos_baja (contacto_id, motivo, dado_por)
values ('<uuid del contacto>', 'Pidió no recibir promociones', 'Nicolas');
```

No es un capricho: si alguien pide que pare y le llega la siguiente igual, en
WhatsApp eso se reporta como spam y le baja la calidad al número de la empresa.

---

## El cambio en n8n (`NINIT CRM - Send`)

Se modificó el workflow de producción, en dos puntos:

1. **Plantillas.** El nodo `Enviar WhatsApp` ahora acepta un campo `plantilla`
   en el body del webhook y arma un mensaje `type: template`. Sin ese campo,
   el comportamiento es exactamente el de antes (texto / imagen / video).

2. **Errores reales.** `Responder CRM` devolvía `{ ok: true }` **siempre**,
   incluso cuando Meta rechazaba el mensaje (el HTTP Request tiene
   `neverError: true`, así que el rechazo llega como una respuesta normal). Un
   envío masivo habría reportado 100 % de éxito con 0 mensajes entregados. Ahora
   inspecciona la respuesta de Meta y devuelve `{ ok: false, error }` con el
   mensaje y el código reales. Se agregó un nodo IF para que el log a Supabase
   corra solo cuando el mensaje salió de verdad.

Contrato del webhook `POST /webhook/ninit-crm-send`:

```jsonc
// texto libre
{ "telefono": "1305...", "mensaje": "*Nicolas · NINIT Group:*\nHola!", "agente": "Nicolas" }

// plantilla (mandá igual `mensaje`: es lo que se registra en el historial)
{ "telefono": "1305...", "mensaje": "*Nicolas · NINIT Group:*\n📣 Plantilla…",
  "plantilla": { "nombre": "promo_black_friday", "idioma": "es", "params": ["15%", "30 de septiembre"] },
  "agente": "Nicolas" }
```

Respuesta: `{ "ok": true, "id": "wamid..." }` o `{ "ok": false, "error": "(#132001) Template name does not exist… [132001]" }`.

La versión anterior del workflow queda en el historial de versiones de n8n por
si hay que volver atrás.

---

## Instalación

1. Ejecutar [`supabase_promociones.sql`](supabase_promociones.sql) en
   **Supabase → SQL Editor** del proyecto de producción. Crea `campanas`,
   `campana_envios` y `promos_baja` con RLS.
2. Desplegar el front (`vercel --prod`).
3. El cambio de n8n ya está publicado en producción.

No hay variables de entorno nuevas.

---

## Pendiente / conocido

- **La baja de promociones se carga a mano por SQL.** Falta un botón en el chat
  y detectar automáticamente un "STOP"/"no me escribas más" en los mensajes
  entrantes.
- **`enviados` puede quedar corto si se cierra la pestaña de golpe**, porque el
  recuento final de la campaña se hace al terminar el recorrido. Las filas de
  `campana_envios` sí quedan bien, y "Retomar" las recalcula.
- **Hay un token de Meta hardcodeado** en el nodo `Enviar WhatsApp` de n8n (ya
  estaba antes de este cambio). Debería moverse a una credencial de n8n; n8n lo
  reporta como `HARDCODED_CREDENTIALS`.
