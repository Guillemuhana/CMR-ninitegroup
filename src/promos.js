// ============================================================
// REGLAS DE ENVÍO — lógica pura, sin Supabase ni fetch
// ============================================================
// Vive separado de `lib.js` a propósito: lib.js crea el cliente de Supabase al
// importarse y lee `import.meta.env`, que solo existe bajo Vite. Con las reglas
// acá, `npm test` puede importarlas en Node sin levantar media app.
//
// `lib.js` re-exporta todo esto, así que los componentes siguen importando de
// un solo lugar y no hay que acordarse de cuál módulo tiene qué.

// Ventana de servicio de WhatsApp / Messenger.
//
// Meta solo permite mandar texto libre a alguien que escribió en las últimas
// 24 h. Pasado ese plazo, WhatsApp exige una PLANTILLA aprobada y Messenger
// directamente no admite contenido promocional. Esto no es una convención
// nuestra: es la regla de la API, y afuera de la ventana Meta responde con el
// error 131047 y el mensaje no llega.
export const VENTANA_MS = 24 * 60 * 60 * 1000;

// ¿Le podemos escribir texto libre a este contacto ahora mismo?
export function dentroDeVentana(contacto, ahora = Date.now()) {
  if (!contacto?.ultimo_in_at) return false;
  const t = new Date(contacto.ultimo_in_at).getTime();
  if (Number.isNaN(t)) return false;
  return ahora - t < VENTANA_MS;
}

// Con qué se le puede escribir hoy a un contacto, para el envío masivo.
//
// Un contacto puede quedar "omitido": no es una falla del CRM, es que Meta no
// deja escribirle. Messenger no tiene salida fuera de la ventana —no existe una
// etiqueta que cubra promociones—, y WhatsApp solo con plantilla aprobada.
export function planDeEnvio(contacto, hayPlantilla, ahora = Date.now()) {
  const canal = contacto?.canal || "whatsapp";
  if (dentroDeVentana(contacto, ahora)) return { modo: "texto" };
  if (canal === "messenger")
    return { modo: "omitido", motivo: "Messenger no permite promociones pasadas 24 h" };
  if (hayPlantilla) return { modo: "plantilla" };
  return { modo: "omitido", motivo: "Pasaron más de 24 h y no hay plantilla configurada" };
}

// Ojo: es "NINIT Group" y no BRAND_NAME ("NINIT GROUP"). La diferencia de
// mayúsculas es la que ya está en los chats históricos y en el regex que el
// chat usa para ocultar el eco de n8n (ECHO_PREFIX_RE en App.jsx).
const FIRMA_MARCA = "NINIT Group";
export function firmaWhatsApp(agente, cuerpo) {
  return `*${agente} · ${FIRMA_MARCA}:*\n${cuerpo}`;
}

// Reemplaza las variables del mensaje con los datos del contacto.
// Hoy solo {nombre}; el fallback evita el clásico "Hola {nombre}," a secas
// cuando el contacto entró sin nombre.
export function personalizar(texto, contacto, fallbackNombre = "") {
  const nombre = (contacto?.nombre || "").trim() || fallbackNombre;
  return String(texto || "").replace(/\{nombre\}/gi, nombre);
}

// Los errores de Meta llegan en inglés y con códigos. Los que aparecen de
// verdad en un envío masivo se traducen a algo accionable; el resto se muestra
// tal cual para no esconder información al diagnosticar.
export function traducirErrorMeta(err) {
  const t = String(err || "").trim();
  if (!t) return "El envío fue rechazado por Meta.";
  if (/131047|re-?engagement/i.test(t))
    return "Pasaron más de 24 h desde el último mensaje del cliente: hay que usar una plantilla aprobada.";
  if (/131026|not.*valid.*whatsapp|undeliverable/i.test(t))
    return "El número no tiene WhatsApp o no es válido.";
  if (/13200[0-9]|13201[0-9]|template/i.test(t))
    return "Problema con la plantilla: revisá que esté aprobada y que la cantidad de variables coincida.";
  if (/13005|spam|blocked|policy/i.test(t))
    return "Meta bloqueó el envío por política. Frená la campaña y revisá la calidad del número.";
  if (/rate.?limit|too many/i.test(t))
    return "Meta está limitando el ritmo de envío. Subí la pausa entre mensajes.";
  return t.slice(0, 300);
}
