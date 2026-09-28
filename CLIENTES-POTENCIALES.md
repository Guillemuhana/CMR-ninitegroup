# Clientes potenciales — Nini T Group

Sección del menú del propietario (CEO), también en **Más** desde el celular.
Busca negocios reales en Estados Unidos que pueden comprar un restroom
trailer, los puntúa según su afinidad con NTG, redacta el primer contacto y
arma la hoja de ruta para visitarlos.

## Cómo se usa

1. Elegí un rubro (o escribí cualquiera, en español o inglés).
2. Elegí la zona: arranca en **Miami, FL** y despliega el sur de Florida, el
   resto de Florida, Texas, California y las áreas grandes de USA. También
   acepta cualquier ciudad, condado, estado o ZIP.
3. Cada negocio trae puntaje (0-100), prioridad, perfil de comprador, unidad
   y paquete sugeridos y el enfoque para la primera llamada.
4. **Contactar**: la IA redacta un email y un WhatsApp de presentación para
   ese negocio. Se revisan y se mandan desde el correo / WhatsApp del
   vendedor, uno por uno. También **Llamar**, y el negocio queda marcado como
   contactado en ese navegador.
5. **Hoja de ruta**: ordena por cercanía, abre Google Maps, exporta PDF/CSV y
   se comparte con el vendedor.

## Rubros

Definidos en `api/_prospectos/rubros.js` (fuente única para servidor y
pantalla): baños portátiles, alquiler para eventos, séptico, venues de bodas,
hoteles y resorts, campings y RV parks, fairgrounds, viñedos y granjas, golf,
organizadores, constructoras y catering. Cada uno tiene su puntaje base, el
perfil de comprador (sale de `FICHA_BUSINESS` en `api/_ntg.js`) y la unidad
sugerida con las capacidades de la ficha.

## De dónde salen los datos

`POST /api/prospectos` → `api/push.js?accion=prospectos` →
`api/_prospectos/buscar.js`. Sólo el CEO (se valida la sesión en el servidor).

- **Google Places** si está `GOOGLE_PLACES_API_KEY` en Vercel: teléfono, web,
  reseñas y coordenadas de casi todos los negocios. Habilitar "Places API
  (New)" en Google Cloud y restringir la clave a esa API. Google cobra por
  búsqueda después de la cuota gratis mensual; cada búsqueda del CRM son 1 o 2
  pedidos.
- **OpenStreetMap (Nominatim)** si no hay clave: gratis y sin configurar,
  pero con menos teléfonos y casi sin emails. Algunos rubros (baños
  portátiles) casi no están cargados ahí. Nominatim pide no pasar de un
  pedido por segundo: el código espera entre consultas.

Google Places no da emails; OpenStreetMap a veces. Cuando no hay email, el
mensaje se copia y se usa el formulario de la web del negocio.

## Puntaje

Primero reglas (rubro + datos de contacto + reseñas). Después, si hay IA
configurada (`GROQ_API_KEY` u `OPENAI_API_KEY`, ver `api/_ia.js`), la IA lee
la ficha de NTG y ajusta el puntaje de cada negocio. Si la IA falla o tarda,
la búsqueda sale igual con el puntaje de reglas.

## Por qué el contacto no es masivo

Son contactos fríos, que nunca le escribieron a NTG:

- **WhatsApp**: la API oficial de Meta exige opt-in y plantilla aprobada;
  mandar en masa a quien no lo pidió termina con el número bloqueado. Por eso
  se abre el WhatsApp del vendedor (`wa.me`) con el texto listo, uno a uno, y
  no pasa por `enviarPorCanal()`.
- **SMS**: el marketing por SMS en USA exige consentimiento previo (TCPA).
  No se ofrece.
- **Email**: B2B es válido bajo CAN-SPAM con asunto honesto, identificación y
  baja. La línea de baja la agrega el código. **La firma tiene que llevar una
  dirección postal real de NTG**: se edita en el modal de Contactar.

Los mensajes obedecen `api/_ntg.js` (nada de ingresos garantizados, "we
manufacture", franquicia, ni precios de paquetes).

## Guardados (cartera)

Botón **Guardar** en los resultados: guarda los tildados o, si no hay
ninguno tildado, todos los que están a la vista, en la tabla
`prospectos_guardados` (`supabase_prospectos_migration.sql`, **hay que
correrla una vez en producción** desde el SQL Editor). Si un negocio ya
estaba guardado no se duplica ni se pisa su estado, nota o vendedor
(upsert por `place_id` con `ignoreDuplicates`).

La pestaña **Guardados** lista la cartera con estado (nuevo → contactado →
respondió → interesado / descartado), vendedor, nota y CSV. Contactar desde
ahí, o desde la búsqueda si ya estaba guardado, suma el contacto en la base
(cuántos, canal, fecha) y pasa "nuevo" a "contactado". Código:
`src/prospectos/Guardados.jsx` y `src/prospectos/cartera.js`.

Es una tabla aparte de `contactos` a propósito: estos negocios nunca le
escribieron a NTG, y en `contactos` se mezclarían con los chats reales y con
los envíos masivos de Promociones, que a ellos no se les pueden mandar.

## Qué no hace

Una búsqueda que no se guardó se pierde al salir de la sección. La marca de
"contactado" de un negocio **no guardado** y la firma de los emails quedan
sólo en ese navegador (localStorage).
