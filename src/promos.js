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

// ============================================================
// PLANTILLAS DE WHATSAPP
// ============================================================
// El CRM lee las plantillas reales de Meta (a través del workflow de n8n
// "NINIT CRM - Plantillas") y sólo deja elegir las que puede mandar de verdad.
//
// Por qué importa: si se manda una plantilla que no existe, que está en
// revisión, o con una cantidad de variables distinta a la aprobada, Meta rechaza
// TODOS los envíos. Cientos de rechazos seguidos es el patrón que le baja la
// calidad al número y termina en una limitación o suspensión.

// Sólo estas categorías se pueden usar en una promoción. Las de AUTHENTICATION
// llevan un código de un solo uso y un botón de copiado: no tienen nada que
// hacer acá.
export const CATEGORIAS_PLANTILLA = ["MARKETING", "UTILITY"];

// Pasa una plantilla como la devuelve la Graph API al formato que usa la UI.
//
// Devuelve `soportada: false` cuando la plantilla necesita algo que el envío del
// CRM no manda hoy (variables en el encabezado, imagen adjunta, botones con URL
// variable). Mostrarla como elegible sería prometer un envío que Meta rechaza.
export function parsearPlantilla(tpl) {
  const componentes = Array.isArray(tpl?.components) ? tpl.components : [];
  const de = (tipo) => componentes.find((c) => String(c?.type).toUpperCase() === tipo);

  const body = de("BODY");
  const header = de("HEADER");
  const footer = de("FOOTER");
  const botones = de("BUTTONS");

  const texto = String(body?.text || "");
  const variables = variablesDe(texto);

  const motivos = [];
  // Meta acepta variables con nombre ({{nombre}}) además de las numeradas. El
  // envío del CRM manda parámetros posicionales, así que no las puede completar.
  if (/\{\{\s*[a-z_][a-z0-9_]*\s*\}\}/i.test(texto))
    motivos.push("usa variables con nombre y el CRM manda variables numeradas");
  if (header && variablesDe(String(header.text || "")).length > 0)
    motivos.push("tiene variables en el encabezado");
  if (header && String(header.format || "TEXT").toUpperCase() !== "TEXT")
    motivos.push(`el encabezado es ${String(header.format).toLowerCase()} y hay que adjuntar el archivo`);
  if (botones?.buttons?.some((b) => variablesDe(String(b?.url || "")).length > 0))
    motivos.push("tiene un botón con URL variable");

  return {
    nombre: tpl?.name || "",
    idioma: tpl?.language || "",
    categoria: String(tpl?.category || "").toUpperCase(),
    estado: String(tpl?.status || "").toUpperCase(),
    texto,
    encabezado: header && String(header.format || "TEXT").toUpperCase() === "TEXT" ? String(header.text || "") : "",
    pie: footer ? String(footer.text || "") : "",
    variables: variables.length,
    // Los ejemplos que se cargaron al pedir la aprobación. Sirven para
    // prellenar los campos y que se vea de una qué va en cada variable.
    ejemplos: ejemplosDe(body),
    soportada: motivos.length === 0,
    motivos,
  };
}

// Números de las variables {{1}}, {{2}}… presentes en un texto, sin repetir.
// Se devuelve la CANTIDAD de distintas, no el número más alto: una plantilla con
// {{1}} y {{3}} está mal armada y mandarle 3 valores la haría rechazar.
function variablesDe(texto) {
  const nums = new Set();
  for (const m of String(texto).matchAll(/\{\{\s*(\d+)\s*\}\}/g)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

function ejemplosDe(body) {
  const ej = body?.example?.body_text;
  if (Array.isArray(ej) && Array.isArray(ej[0])) return ej[0].map((v) => String(v));
  return [];
}

// Deja sólo las que se pueden ofrecer: aprobadas y de una categoría usable.
export function plantillasUsables(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map(parsearPlantilla)
    .filter((p) => p.estado === "APPROVED" && CATEGORIAS_PLANTILLA.includes(p.categoria))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
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
