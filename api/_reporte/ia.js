// Resumen ejecutivo del día escrito por el asistente de IA del CRM (Groq).
//
// Recibe las métricas ya calculadas (no transcripciones completas) y devuelve
// texto para la primera página del PDF. Si Groq falla o no hay API key, se
// devuelve un resumen determinístico armado con los mismos números: el reporte
// siempre sale, con IA o sin ella.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODELOS = (process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL, "llama-3.1-8b-instant"]
  : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
).filter((m, i, a) => a.indexOf(m) === i);

const SYSTEM = `Sos el analista de operaciones de NINIT Group (alquiler de baños y trailers de lujo en Miami).
Escribís el resumen ejecutivo del día para Nicolás, el CEO. Él lee esto una vez por día y espera claridad, no relleno.

Reglas:
- Español rioplatense, profesional y directo. Sin saludos, sin "espero que estés bien", sin cerrar con ofrecimientos.
- Usá SOLO los números que te paso. No inventes datos, nombres ni montos. Si un dato falta, no lo menciones.
- Nombrá vendedores concretos cuando el dato lo respalde (quién respondió más rápido, quién dejó chats sin atender).
- Nada de markdown, asteriscos, emojis ni títulos: solo el texto que te piden en cada campo.

Devolvé EXCLUSIVAMENTE un JSON válido con esta forma exacta:
{
  "resumen": "2 a 4 frases con la foto del día: volumen, quién lo movió y el resultado comercial.",
  "destacados": ["3 a 4 hechos positivos concretos, con número. Una línea cada uno, máx 140 caracteres."],
  "riesgos": ["2 a 3 problemas o cosas que quedaron sin resolver hoy, con número. Máx 140 caracteres."],
  "recomendaciones": ["2 a 3 acciones concretas para mañana, cada una empezando con un verbo. Máx 140 caracteres."]
}`;

function fmtMin(m) {
  if (m == null) return "sin dato";
  if (m < 1) return "menos de 1 min";
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
}

const usd = (n) => `US$ ${Math.round(n || 0).toLocaleString("en-US")}`;

/** Contexto compacto (pocos tokens) con lo que el modelo necesita para opinar. */
function contexto(m) {
  const k = m.kpis, c = m.comparativa;
  const lineas = [
    `Fecha: ${m.fecha} (zona ${m.tz})`,
    `Mensajes: ${k.mensajes} (entrantes ${k.entrantes}, salientes ${k.salientes}; bot ${k.porBot}, vendedores ${k.porHumano} => bot ${k.botPct}%)`,
    `Ayer: ${c.ayer?.mensajes ?? "sin dato"} mensajes. Promedio 7 días previos: ${Math.round(c.prom7.mensajes)} mensajes.`,
    `Conversaciones activas: ${k.chatsActivos}. Clientes que escribieron: ${k.chatsConEntrante}. Sin responder al cierre: ${k.chatsSinResponder}. Tasa de respuesta: ${k.tasaRespuesta ?? "sin dato"}%`,
    `Tiempo de respuesta del equipo: mediana ${fmtMin(k.respuestaMedianaMin)} sobre ${k.primerasRespuestas} respuestas.`,
    `Clientes nuevos: ${k.clientesNuevos} (sin asignar: ${k.leadsSinAsignar}). Cerrados hoy: ${k.cerrados}.`,
    `Pedidos: ${k.pedidos} por ${usd(k.facturacion)} (ticket ${usd(k.ticket)}). Promedio diario 7 días: ${usd(c.prom7.facturacion)}.`,
    `Seguimientos vencidos acumulados: ${k.seguimientosVencidos}. Hora pico: ${k.horaPico != null ? k.horaPico + "h" : "sin dato"}.`,
    "",
    "Rendimiento por vendedor (efectividad 0-100 = 45% velocidad + 30% cobertura de su cartera + 25% resultados):",
    ...m.porVendedor.map((v) =>
      `- ${v.vendedor}: efectividad ${v.efectividad}, ${v.mensajes} mensajes en ${v.chats} chats, ` +
      `respuesta mediana ${fmtMin(v.respuestaMedianaMin)}, cobertura ${v.cobertura != null ? Math.round(v.cobertura * 100) + "%" : "sin dato"}, ` +
      `${v.chatsPendientesCartera} chats de su cartera sin responder, ${v.nuevosAsignados} leads nuevos, ` +
      `${v.cerrados} cerrados, ${v.pedidos} pedidos (${usd(v.facturacion)}), conectado ${v.conectadoMin} min`
    ),
  ];
  if (m.inactivos.length) lineas.push(`Vendedores sin actividad hoy: ${m.inactivos.join(", ")}.`);
  if (m.pendientes.sinResponder.length) {
    lineas.push("", "Clientes que quedaron esperando respuesta:");
    lineas.push(...m.pendientes.sinResponder.slice(0, 6).map(
      (p) => `- ${p.nombre} (${p.vendedor}, estado ${p.estado}) esperando ${fmtMin(p.esperaMin)}`
    ));
  }
  if (m.conversaciones.length) {
    lineas.push("", "Conversaciones más activas del día:");
    lineas.push(...m.conversaciones.slice(0, 8).map(
      (c) => `- ${c.nombre}${c.empresa ? " (" + c.empresa + ")" : ""}: ${c.mensajes} mensajes, vendedor ${c.vendedor}, estado ${c.estado}${c.nuevo ? ", cliente nuevo" : ""}. Último: "${c.ultimoTexto}"`
    ));
  }
  return lineas.join("\n");
}

/** Resumen de reserva cuando no hay IA disponible. */
export function resumenFallback(m) {
  const k = m.kpis;
  const top = m.porVendedor[0];
  const resumen =
    `Se registraron ${k.mensajes} mensajes en ${k.chatsActivos} conversaciones: ${k.entrantes} de clientes y ` +
    `${k.salientes} de salida (${k.botPct}% del bot). Entraron ${k.clientesNuevos} clientes nuevos y se cerraron ${k.cerrados}. ` +
    (k.pedidos ? `Se cargaron ${k.pedidos} pedidos por ${usd(k.facturacion)}. ` : "No se cargaron pedidos. ") +
    (top ? `El vendedor más activo fue ${top.vendedor} con ${top.mensajes} mensajes.` : "");
  const destacados = [];
  if (top) destacados.push(`${top.vendedor} lideró el día: ${top.mensajes} mensajes en ${top.chats} chats.`);
  if (k.respuestaMedianaMin != null) destacados.push(`Tiempo de respuesta mediano del equipo: ${fmtMin(k.respuestaMedianaMin)}.`);
  if (k.tasaRespuesta != null) destacados.push(`Se respondió al ${k.tasaRespuesta}% de los clientes que escribieron.`);
  const riesgos = [];
  if (k.chatsSinResponder) riesgos.push(`${k.chatsSinResponder} conversaciones quedaron sin respuesta al cierre del día.`);
  if (k.leadsSinAsignar) riesgos.push(`${k.leadsSinAsignar} leads nuevos quedaron sin vendedor asignado.`);
  if (k.seguimientosVencidos) riesgos.push(`${k.seguimientosVencidos} seguimientos están vencidos.`);
  const recomendaciones = [];
  if (k.chatsSinResponder) recomendaciones.push("Responder mañana temprano los chats que quedaron esperando.");
  if (k.leadsSinAsignar) recomendaciones.push("Asignar los leads nuevos sin vendedor antes del mediodía.");
  if (!recomendaciones.length) recomendaciones.push("Sostener el ritmo de respuesta y avanzar los chats en negociación.");
  return { resumen, destacados, riesgos, recomendaciones, generadoPorIA: false };
}

function parsearJSON(txt) {
  const limpio = txt.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const i = limpio.indexOf("{"), f = limpio.lastIndexOf("}");
  if (i < 0 || f < 0) return null;
  try { return JSON.parse(limpio.slice(i, f + 1)); } catch { return null; }
}

const lista = (v) => (Array.isArray(v) ? v : [])
  .map((x) => String(x).replace(/^[-•*\s]+/, "").trim())
  .filter(Boolean)
  .slice(0, 5);

export async function resumenEjecutivo(metricas) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return resumenFallback(metricas);
  if (!metricas.kpis.mensajes && !metricas.kpis.pedidos) return resumenFallback(metricas);

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Datos del día:\n\n${contexto(metricas)}` },
  ];

  for (const model of MODELOS) {
    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0.4, max_tokens: 1200, messages,
          response_format: { type: "json_object" },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = data?.error?.message || `Groq ${r.status}`;
        if (!/rate limit|quota|tokens per day|TPD/i.test(msg) && r.status !== 429) break;
        continue;
      }
      const json = parsearJSON(data?.choices?.[0]?.message?.content || "");
      if (!json?.resumen) continue;
      return {
        resumen: String(json.resumen).trim(),
        destacados: lista(json.destacados),
        riesgos: lista(json.riesgos),
        recomendaciones: lista(json.recomendaciones),
        generadoPorIA: true,
      };
    } catch {
      /* siguiente modelo */
    }
  }
  return resumenFallback(metricas);
}
