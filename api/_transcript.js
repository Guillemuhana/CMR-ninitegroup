// Armado de la transcripción que se le manda a la IA (Groq).
//
// El motivo de existir: Groq cobra por tokens por minuto y el tier gratuito
// corta en 12.000. Una conversación larga —sobre todo las que tienen fotos,
// porque cada foto viaja como una URL de Supabase Storage de 200 caracteres—
// se pasaba del límite y el botón devolvía "Request too large".
//
// La respuesta NO es mandar menos conversación a lo bruto: un vendedor
// profesional necesita saber cómo empezó el lead y qué pasó recién. Así que se
// conservan los primeros mensajes (cómo entró) y los últimos (dónde está la
// negociación hoy), y se recorta el medio, que es lo que menos cambia la
// recomendación.

// Cuánto texto de conversación entra. ~9.000 caracteres ≈ 2.500 tokens, que
// sumados al prompt de sistema y a la respuesta dejan margen cómodo bajo los
// 12.000 del tier gratuito.
const PRESUPUESTO_CHARS = 9000;
// Un mensaje suelto no puede comerse el presupuesto de todos los demás.
const MAX_CHARS_MENSAJE = 700;
// Cuántos mensajes del arranque se preservan siempre.
const CABEZA = 3;

// Las URLs largas (fotos, PDFs, links firmados de storage) no le dicen nada al
// modelo y cuestan cientos de tokens cada una.
export function limpiarContenido(txt) {
  return String(txt || "")
    .replace(/https?:\/\/\S+\.(?:jpe?g|png|webp|gif|mp4|mov|pdf)\b\S*/gi, "[archivo adjunto]")
    .replace(/https?:\/\/\S{60,}/g, "[enlace]")
    .replace(/\s+/g, " ")
    .trim();
}

function quienEscribe(m) {
  if (m.direccion !== "out") return "Cliente";
  return m.origen === "bot" ? "Bot/IA" : `Vendedor${m.agente ? ` (${m.agente})` : ""}`;
}

/**
 * Devuelve { transcript, incluidos, omitidos } listo para el prompt.
 * `mensajes` viene en orden cronológico (más viejo primero).
 */
export function construirTranscript(mensajes, { presupuesto = PRESUPUESTO_CHARS } = {}) {
  const lineas = (mensajes || [])
    .map((m) => {
      const cuerpo = limpiarContenido(m.contenido);
      if (!cuerpo) return null;
      const fecha = m.created_at ? new Date(m.created_at).toLocaleString("es-AR") : "";
      const recortado = cuerpo.length > MAX_CHARS_MENSAJE
        ? cuerpo.slice(0, MAX_CHARS_MENSAJE) + "…"
        : cuerpo;
      return `[${fecha}] ${quienEscribe(m)}: ${recortado}`;
    })
    .filter(Boolean);

  const total = lineas.reduce((n, l) => n + l.length + 1, 0);
  if (total <= presupuesto) {
    return { transcript: lineas.join("\n"), incluidos: lineas.length, omitidos: 0 };
  }

  // Primero se reservan los mensajes de apertura, después se llena hacia atrás
  // desde el final hasta agotar el presupuesto.
  const cabeza = lineas.slice(0, Math.min(CABEZA, lineas.length));
  let usado = cabeza.reduce((n, l) => n + l.length + 1, 0);
  const cola = [];
  for (let i = lineas.length - 1; i >= cabeza.length; i--) {
    const l = lineas[i];
    if (usado + l.length + 1 > presupuesto) break;
    cola.unshift(l);
    usado += l.length + 1;
  }

  const omitidos = lineas.length - cabeza.length - cola.length;
  const partes = [...cabeza];
  if (omitidos > 0) {
    partes.push(`[… se omiten ${omitidos} mensajes intermedios por longitud; la conversación sigue abajo …]`);
  }
  partes.push(...cola);

  return { transcript: partes.join("\n"), incluidos: cabeza.length + cola.length, omitidos };
}

// ── Idioma del cliente ────────────────────────────────────────
//
// Se mira SOLO lo que escribió el cliente (direccion "in"): el bot y el
// vendedor a veces contestan en español a un lead que escribe en inglés, y si
// se contaran esos mensajes la IA le respondería en el idioma equivocado.
//
// Regla del master prompt de NTG: si el cliente escribe en inglés se le
// responde SOLO en inglés; si escribe en español, SOLO en español.
export function detectarIdioma(mensajes) {
  const texto = (mensajes || [])
    .filter((m) => m.direccion === "in")
    .map((m) => (m.contenido || ""))
    .join(" ")
    .toLowerCase();
  if (!texto.trim()) return "es"; // sin mensajes del cliente → español por defecto

  const esHits =
    (texto.match(/[áéíóúñ¿¡]/g) || []).length +
    (texto.match(/\b(que|qué|hola|gracias|necesito|necesita|precio|cuánto|cuanto|está|cómo|como|para|por|quiero|buenas|días|dias|usted|información|informacion|enviar|tienen|tenes|tenés|disculpa|estoy|quisiera|comprar|costo|valor)\b/g) || []).length;
  const enHits =
    (texto.match(/\b(the|you|i'm|hello|hi|hey|price|need|how|what|thanks|thank|please|want|good|morning|info|information|send|can|could|would|your|you're|is|are|for|with|about|interested|looking|quote|cost|buy|much|available)\b/g) || []).length;

  return enHits > esHits ? "en" : "es";
}

// ── Datos que el cliente YA dio ───────────────────────────────
//
// Los leads que entran por Facebook / Messenger llegan con el formulario ya
// completo en el primer mensaje, en líneas "Etiqueta: valor":
//
//   Hello! I filled out your form and would like to know more about your business.
//   Which trailer size fits your needs best?: 2-Stall Luxury Trailer ($19,500 Promo)
//   Full name: El Compa Chuy II
//   Phone number: (714) 914-3720
//   Email: chuy@example.com
//   Zip code: 92505
//
// La IA leía eso como texto suelto y arrancaba preguntando el nombre, el modelo
// o el ZIP que el cliente acababa de mandar: la forma más rápida de perder un
// lead. Acá se extraen esos datos y se le pasan al modelo aparte, para que los
// dé por sabidos y pregunte sólo lo que de verdad falta.

const CAMPOS_LEAD = [
  { clave: "Nombre", re: /(?:full name|nombre completo|nombre y apellido|your name|name|nombre)\s*[:=]\s*([^\n]{2,80})/i },
  { clave: "Teléfono", re: /(?:phone number|phone|mobile|whatsapp|tel[ée]fono|telefono|celular)\s*[:=]\s*([^\n]{5,40})/i },
  { clave: "Email", re: /(?:e-?mail|correo(?: electr[oó]nico)?)\s*[:=]\s*([^\s\n]{5,80})/i },
  { clave: "Código postal (ZIP)", re: /(?:zip code|zipcode|zip|postal code|c[oó]digo postal)\s*[:=]\s*([^\n]{3,20})/i },
  { clave: "Modelo que le interesa", re: /(?:which trailer size[^:\n]{0,40}|trailer size|which model[^:\n]{0,40}|modelo[^:\n]{0,30}|qu[ée] tama[nñ]o[^:\n]{0,40})\s*[:=]\s*([^\n]{2,80})/i },
  { clave: "Ubicación", re: /(?:city and state|city|ciudad|state|location|ubicaci[oó]n|direcci[oó]n)\s*[:=]\s*([^\n]{2,60})/i },
  { clave: "Fecha del evento", re: /(?:event date|date of (?:the )?event|fecha del evento|fecha)\s*[:=]\s*([^\n]{3,40})/i },
  { clave: "Cantidad de personas", re: /(?:guest count|number of guests|guests|invitados|cantidad de (?:personas|invitados)|personas)\s*[:=]\s*([^\n]{1,40})/i },
  { clave: "Uso / negocio", re: /(?:business type|type of business|what is your business|uso|rubro|negocio)\s*[:=]\s*([^\n]{2,60})/i },
];

const BASURA = /^(n\/?a|none|ninguno|no|-{1,3}|\.+|\?+)$/i;

function limpiarValor(v) {
  return String(v || "").replace(/\s+/g, " ").trim().replace(/^["'*]+|["'*,.;]+$/g, "").trim();
}

/**
 * Devuelve un array de líneas "Campo: valor" con todo lo que el cliente ya
 * aportó en la conversación (formulario de anuncio o texto libre).
 * Se mira SOLO lo que escribió el cliente (direccion "in").
 */
export function datosDelLead(mensajes) {
  const texto = (mensajes || [])
    .filter((m) => m.direccion === "in")
    .map((m) => String(m.contenido || "").replace(/\r\n?/g, "\n"))
    .join("\n");
  if (!texto.trim()) return [];

  const datos = new Map();

  for (const { clave, re } of CAMPOS_LEAD) {
    const val = limpiarValor(texto.match(re)?.[1]);
    if (val && !BASURA.test(val)) datos.set(clave, val);
  }

  // Respaldos por si el dato vino sin etiqueta (el cliente lo tipeó suelto).
  if (!datos.has("Email")) {
    const mail = texto.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0];
    if (mail) datos.set("Email", mail);
  }
  if (!datos.has("Modelo que le interesa")) {
    const modelo = texto.match(/\b(?:ada\s*\+?\s*\d|\d\s*[-–\s]?stall)\b[^\n,.]{0,40}/i)?.[0];
    if (modelo) datos.set("Modelo que le interesa", limpiarValor(modelo));
  }

  return [...datos].map(([k, v]) => `${k}: ${v}`);
}
