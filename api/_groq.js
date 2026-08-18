// Cosas compartidas por todo lo que llama a Groq (asistente, resumen,
// traducción, avanzar, analizar).
//
// El prefijo `_` es a propósito: Vercel no lo toma como endpoint, así que no
// gasta una de las 12 funciones del plan Hobby (ver AGENTS.md).

// Los modelos gpt-oss RAZONAN antes de contestar, y ese razonamiento se
// descuenta del mismo `max_tokens` que la respuesta. Sin bajar el esfuerzo, un
// pedido con presupuesto corto vuelve con `content` vacío y finish_reason
// "length": el modelo gastó todo pensando y no le quedó nada para escribir.
// Resumir, traducir o extraer datos no necesita más que esfuerzo bajo.
//
// El parámetro se manda SÓLO a los modelos que lo soportan: a uno que no razona,
// Groq rechaza el pedido entero por un parámetro desconocido.
export function cuerpoGroq(body) {
  return /gpt-oss|qwen3|reasoning/i.test(String(body?.model || ""))
    ? { ...body, reasoning_effort: "low" }
    : body;
}

// ¿Conviene reintentar con el modelo siguiente de la cadena?
//
//  · 429 / sin cuota diaria → el modelo de respaldo tiene su propia cuota.
//  · modelo inexistente o dado de baja → Groq jubila modelos sin avisar. Eso es
//    lo que dejó toda la IA del CRM muerta en agosto de 2026: los dos Llama
//    desaparecieron de un día para el otro y el código cortaba en el primer
//    error, así que el respaldo estaba configurado pero nunca se probaba.
//
// Cualquier otro error (key mal, pedido inválido) NO se reintenta: con otro
// modelo da exactamente el mismo error, y sólo agrega demora.
export function vaOtroModelo(status, mensaje) {
  return status === 429 || status === 404 ||
    /rate limit|quota|tokens per day|\bTPD\b|does not exist|decommission|not found/i.test(String(mensaje || ""));
}
