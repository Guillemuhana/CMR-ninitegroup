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
