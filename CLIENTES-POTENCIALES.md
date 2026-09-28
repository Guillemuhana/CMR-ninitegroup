# Clientes potenciales — Nini T Group

La sección está en el menú del CEO y en Más desde el celular. Busca negocios por rubro y ciudad, estado o ZIP de Estados Unidos. Incluye filtros, selección, asignación de vendedores, rutas en Google Maps, CSV, PDF, impresión y compartir. La prioridad representa afinidad comercial; no confirma intención de compra.

## Conexión preparada; activación pendiente

El navegador llama a `POST /api/prospectos` con la sesión de Supabase. El servidor verifica el permiso CEO y llama al workflow propio de NTG. La ruta usa el dispatcher `api/push.js`, manteniendo el número de funciones de Vercel. Para probar la API localmente se necesita el runtime de Vercel; `npm run dev` solo sirve el frontend.

El proyecto de origen está en `C:/app/NM/munich-crm-VSCODE`. Su buscador llama al workflow remoto `munich-prospectos-buscar`; ese workflow no está exportado en los archivos revisados. No se modificó Munich ni su contador de pruebas.

Para activar búsquedas reales:

1. Duplicar/adaptar el workflow de origen en n8n para NTG: búsqueda de negocios de USA y clasificación para restroom trailers. Debe consumir `contexto_comercial` e `instrucciones` enviados por el servidor, en lugar de los criterios de alimentos de Munich. Verificar el país con la fuente de datos, no inferirlo del texto de búsqueda. No inventar contactos.
2. Configurar Header Auth en el webhook de n8n: nombre `X-Prospectos-Secret`, valor secreto elegido para esta integración.
3. Configurar `PROSPECTOS_WEBHOOK` (URL HTTPS propia de NTG) y `PROSPECTOS_WEBHOOK_SECRET` en el servidor/Vercel. La autenticación utiliza `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` existentes. No usar prefijo `VITE_` para el webhook ni el secreto.
4. Publicar y probar una búsqueda desde la cuenta CEO. La conexión remota y los resultados reales aún no fueron verificados.

## Contrato del workflow

Recibe POST JSON con `busqueda`, `zona`, `query_completo`, `pais: "US"`, `empresa`, `contexto_comercial` e `instrucciones`. La ficha se carga de `api/_ntg.js`, que sigue siendo la fuente comercial autorizada.

Responde con un array o con `{ "resultados": [...] }` / `{ "leads": [...] }`, máximo 100 negocios, en menos de 22 segundos. Si el workflow original tarda más, hay que adaptar el procesamiento o implementar trabajos asíncronos antes de activarlo.

Cada negocio requiere `place_id` único, `nombre` y `pais: "US"` verificado. Campos opcionales: `direccion`, `ciudad`, `telefono`, `email` (texto o lista), `sitio_web`, `tipo_negocio`, `latitud`/`longitud` (o `lat`/`lng`), `prioridad` (`ALTA`, `MEDIA`, `BAJA`), `lead_score` (0–100), `productos_sugeridos` y `enfoque_venta` (textos). Los datos desconocidos deben quedar vacíos. La API rechaza respuestas sin país US, normaliza los campos y elimina IDs repetidos.

No se importan automáticamente resultados al CRM ni se envían mensajes a clientes. Las asignaciones y resultados se mantienen mientras la pantalla está abierta. Nini no aplica el contador de pruebas de Munich.

## Verificación local

`node --test tests/prospectos.test.js` verifica permisos, configuración, consulta USA, respuestas incorrectas, duplicados y errores de red sin consumir búsquedas reales. `npm run build` verifica la compilación del frontend.
