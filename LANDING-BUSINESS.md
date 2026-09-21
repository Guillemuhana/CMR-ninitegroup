# Landing de negocio — `/business/`

Página pública "Own the trailer. Launch the business.": no vendemos un trailer
suelto, vendemos una operación de renta armada (activo + tecnología + captación
+ operación) en tres niveles de involucramiento.

Es material comercial, no una pantalla del CRM. Se lee antes de tocarla.

## Dónde vive

| Qué | Dónde |
|---|---|
| Página | `public/business/index.html` |
| Estilos | `public/business/business.css` |
| Calculadora + formulario | `public/business/business.js` |
| Endpoint del formulario | `api/_web/lead.js` |
| Ruteo | `vercel.json` |

URL en producción: `https://ninit-crm.vercel.app/business`

## Por qué es HTML suelto y no un componente de React

Las tres razones, en orden de peso:

1. **Es pública.** El CRM entero está detrás del login de Supabase. Una landing
   que necesita que un desconocido la abra no puede vivir ahí adentro.
2. **Cambia mucho más seguido que el CRM.** Corregir una frase no debería
   obligar a rebuildear y redeployar la aplicación de los vendedores.
3. **Es portable.** El día que esto se mude a `ninitgroup.com` (WordPress), se
   copian los tres archivos y anda igual: no hay imports, ni build, ni React.

Es el mismo criterio que ya seguía `public/cotizacion/` con el Purchase
Agreement, y a propósito comparte su paleta: el prospecto ve primero la landing
y después la cotización, y las dos tienen que sentirse el mismo documento de la
misma empresa.

## Reglas de contenido que NO se pueden romper

Salen de `api/_ntg.js` — la ficha comercial autorizada que también obedece la
IA del CRM. Si la landing y la IA dicen cosas distintas, el cliente lo nota.

- **Nunca** "we manufacture", "our factory" ni "made in USA". Se dice
  *factory-built*, *selected manufacturing partners*, *USA-based support*.
- Los valores de renta (~US$1.100 / ~US$1.400-1.500 / ~US$1.800 por día) son
  **referencias de mercado**, nunca ingreso garantizado ni promesa de retorno.
  Varían por ubicación, temporada, servicios incluidos y demanda.
- **No es una franquicia.** No hay territorio, exclusividad ni regalía, y la
  página lo dice explícitamente en el FAQ y en el pie.
- No se promete fecha exacta de entrega, aprobación de financiamiento, tasa,
  plazo ni cuota. El financiamiento lo resuelve Acorn Finance, no NTG.
- No se inventa stock, disponibilidad ni costo de flete por milla.

### Precios

Base: 2-Stall 21.500 · 3-Stall 25.500 · 4-Stall 31.500 · ADA+2 30.500.
No hay precio publicable para 5-Stall ni 6-Stall.

Cuando Nicolás cambia un precio hay que tocarlo en **tres** lugares o el bot,
el CRM y la web se contradicen:

1. `public/business/index.html` (tarjetas de unidades y `<option>` de la
   calculadora, atributo `data-price`)
2. `api/_ntg.js`
3. `public/nini_master_prompt.md`

## La calculadora

Corre entera en el navegador: no manda nada a ningún lado mientras el visitante
juega con ella.

- Las tarifas por defecto de cada modelo salen del `data-rate` de cada
  `<option>` y son las referencias de mercado de la ficha.
- Si el visitante escribe su propia tarifa, cambiar de modelo ya **no** se la
  pisa. Pisarle un número que puso a mano es grosero.
- El escenario por defecto arranca bajo a propósito (3 rentas de 1 día). Con
  números altos por defecto la página se lee como una promesa, y el descargo
  legal no alcanza para compensar esa primera impresión.
- El financiamiento usa cuota francesa. La tasa y el plazo los elige el
  visitante: no son una oferta.

## El formulario

`POST /api/lead` → rewrite a `/api/push?accion=lead` → `api/_web/lead.js`.

Cuelga del despachador de push y no de su propia función porque **Vercel Hobby
topa en 12 funciones serverless y `api/` ya está en 12**. Las carpetas que
empiezan con `_` no cuentan: por eso la lógica vive en `api/_web/`.

Qué hace, en orden:

1. **Trampa anti-bot.** El campo `company` está escondido con CSS. Si viene
   lleno, devolvemos `200` como si todo hubiera salido bien — avisarle al bot
   que lo detectamos sólo le enseña a esquivarlo.
2. **Upsert del contacto por teléfono** (normalizado con
   `normalizarTelefono()` de `api/_meta/capi.js`, el mismo que usa Meta CAPI).
   Si el contacto ya existe **no se pisa** su nombre, vendedor ni estado:
   puede ser un cliente que un vendedor viene trabajando hace semanas. Sólo se
   completan huecos y se agrega una línea a `notas`.
3. **Inserta la consulta como mensaje entrante.** De ahí en más funciona todo
   lo que ya existía: `trg_touch_contacto` sube `no_leidos` y `ultimo_msg`, y
   `trg_notificar_push_mensaje` dispara el push a los vendedores. El lead
   aparece en la lista por Realtime, como cualquier otra consulta.

### El detalle de `ultimo_in_at` — importa

Después de insertar el mensaje, el endpoint **devuelve `ultimo_in_at` al valor
que tenía antes**. No es una rareza: es lo único que mira `dentroDeVentana()`
en `src/promos.js` para decidir si se le puede mandar texto libre por WhatsApp.

Esa ventana de 24 h la abre Meta cuando el cliente escribe **por WhatsApp**.
Llenar un formulario web no la abre. Si dejáramos el `ultimo_in_at` que pone el
trigger, el CRM le diría al vendedor "dale, escribile", Meta rechazaría el
mensaje y nadie entendería por qué.

Así que se aprovecha el trigger para el push y después se deshace esa columna
sola. `no_leidos` y `ultimo_msg` sí quedan: esos son correctos.

Ver `PROMOCIONES.md` antes de tocar cualquier cosa relacionada con envíos.

### Variables de entorno

Las mismas que ya usa el resto de `api/`, no hay ninguna nueva:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Ruteo

En `vercel.json`:

```json
{ "source": "/api/lead",  "destination": "/api/push?accion=lead" },
{ "source": "/business",  "destination": "/business/index.html" },
{ "source": "/business/", "destination": "/business/index.html" },
{ "source": "/((?!api/|cotizacion/|business/).*)", "destination": "/index.html" }
```

La landing queda excluida del catch-all del SPA (igual que las cotizaciones) y
en `vite.config.js` está excluida del precache del service worker: no tiene
sentido que la página comercial se le descargue al celular de cada vendedor.

## Qué falta (segunda vuelta)

Lo que está afuera a propósito, para poder salir a vender ya:

- **Precios de los paquetes.** Hoy dice "quoted per configuration" porque no
  hay una lista definida. Cuando exista, van en las tres tarjetas.
- **Pixel de Meta / Google Ads.** La página no trackea nada todavía. El CRM ya
  tiene Conversions API (`META-CAPI.md`); lo natural es disparar un `Lead`
  desde `api/_web/lead.js` reusando `api/_meta/`.
- **Prueba social.** No hay testimonios ni casos porque todavía no hay
  compradores de este producto. En cuanto haya uno, va arriba del formulario.
- **Campañas por perfil.** Nico quiere landings separadas para "retirement",
  "own a pickup", "already in events". Son variantes de esta misma página con
  hero y FAQ distintos; la estructura ya lo permite.
- **Dashboard real del dueño.** Lo que se muestra es una maqueta estática y la
  página lo aclara. El dashboard de verdad es desarrollo aparte.
