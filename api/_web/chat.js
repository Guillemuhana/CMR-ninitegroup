// Asistente conversacional de la landing pública /business/.
//
// Cuelga de api/push.js (accion=chat), igual que el lead de esa misma landing
// (api/_web/lead.js): el plan Hobby de Vercel topa en 12 funciones y api/ ya
// está en 12 (ver AGENTS.md). La URL igual queda limpia:
//   /api/business-chat -> /api/push?accion=chat   (rewrite en vercel.json)
//
// Usa Groq server-side, mismo proveedor y mismo patrón que api/asistente.js
// (la burbuja del CRM) y api/avanzar.js: la API key nunca viaja al navegador.
//
// Requiere en Vercel: GROQ_API_KEY (la misma que ya usan asistente/avanzar/resumen).
//
// A propósito NO toca Supabase ni la tabla contactos: cuando el visitante
// quiere dejar sus datos, el widget (public/business/assistant-widget.js)
// muestra el mismo mini-formulario que ya usa la landing y lo manda al
// endpoint de leads que YA existe (api/_web/lead.js, probado en producción).
// Este archivo solo conversa — así el chat nunca puede romper el flujo de
// leads que ya funciona.

import { cuerpoGroq, vaOtroModelo } from "../_groq.js";
import { FICHA_NTG, FICHA_BUSINESS } from "../_ntg.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODELOS = (process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL, "openai/gpt-oss-20b"]
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
).filter((m, i, a) => a.indexOf(m) === i);

// Tag interno para pedirle al widget que muestre el mini-formulario de
// contacto. Nunca debe llegar al visitante — se lee y se recorta acá mismo,
// el mismo criterio que ya usa el bot de WhatsApp con [ENVIAR_PRODUCTO].
const TAG_FORM = "[LEAD_FORM]";

function detectarIdioma(mensajesUsuario) {
  const texto = mensajesUsuario.join(" ").toLowerCase();
  if (!texto.trim()) return "en";
  const esHits = (texto.match(/[áéíóúñ¿¡]/g) || []).length +
    (texto.match(/\b(que|qué|hola|gracias|necesito|precio|cuánto|cuanto|está|cómo|para|por|quiero|buenas|información|paquete|negocio)\b/g) || []).length;
  const enHits = (texto.match(/\b(the|you|hello|hi|hey|price|need|how|what|thanks|want|package|business|cost|much|available|interested)\b/g) || []).length;
  return esHits > enHits ? "es" : "en";
}

function systemPrompt(idioma) {
  return `You are the virtual assistant embedded on NTG's business-packages landing page (the page itself, not the WhatsApp sales bot — different context, different job).

${FICHA_NTG}

${FICHA_BUSINESS}

YOUR JOB HERE
Help the visitor understand the business-system offer, figure out which package and profile fits them, answer honestly, and move them toward requesting the full written quote through the page's contact form — never toward a price or promise you don't actually have.

LANGUAGE
${idioma === "es"
    ? "This visitor is writing in Spanish. Reply only in Spanish, naturally, even though the page itself is in English."
    : "Reply in English, matching the page. If the visitor clearly switches to Spanish, switch with them."}

STYLE
- 2-4 short sentences per reply. Conversational, warm, confident — never a brochure dump.
- Answer exactly what was asked first, then guide with at most one question or one next step.
- Never repeat something you already told them in this conversation.
- No markdown, no bullet lists, no headers — this renders as plain chat bubbles.

WHEN TO OFFER THE CONTACT FORM
End your reply with the exact tag ${TAG_FORM} on its own, as the very last thing, when ANY of these is true:
- the visitor asks for pricing/a quote/next steps/how to move forward,
- the visitor says they want to talk to someone or get the full breakdown,
- the conversation has had a real back-and-forth (roughly 3+ visitor messages) and you have not offered it yet.
Do not offer it on a first "hi" or a single vague question, and do not offer it twice in the same conversation unless the visitor explicitly asks again later. Never mention this tag or explain it — it is invisible machinery, the widget reads it and shows a short contact form.`;
}

// ── Freno de abuso ────────────────────────────────────────────────────────
//
// Este endpoint es PÚBLICO y gasta plata: cada llamada es un pedido a Groq.
// Sin ningún límite, cualquiera puede scriptear la URL y consumir la cuota
// —que es la MISMA que usan las cuatro funciones de IA del CRM, así que
// vaciarla acá deja sin asistente a los vendedores.
//
// El contador vive en memoria del proceso. Es un freno parcial y conviene
// saberlo: Vercel levanta varias instancias, cada una con su propio Map, y
// una instancia fría arranca en cero. Frena el abuso ingenuo (un bucle desde
// una IP), no un ataque repartido. Un límite de verdad necesita un
// almacenamiento compartido —Supabase o Upstash— y es trabajo aparte.
const VENTANA_MS = 60 * 1000;
const TOPE_POR_VENTANA = 12;
const visitas = new Map();

function demasiadosPedidos(ip) {
  const ahora = Date.now();
  const previas = (visitas.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  previas.push(ahora);
  visitas.set(ip, previas);

  // Limpieza oportunista: sin esto el Map crece para siempre en una
  // instancia de larga vida.
  if (visitas.size > 500) {
    for (const [k, v] of visitas) {
      if (!v.length || ahora - v[v.length - 1] > VENTANA_MS) visitas.delete(k);
    }
  }
  return previas.length > TOPE_POR_VENTANA;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "sin-ip";
  if (demasiadosPedidos(ip)) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Demasiados mensajes seguidos. Esperá un minuto." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en el servidor." });

  const entrada = Array.isArray(req.body?.mensajes) ? req.body.mensajes : null;
  if (!entrada || !entrada.length) return res.status(400).json({ error: "Faltan mensajes." });

  // Historial acotado: esto es un widget de landing, no el CRM — no hace
  // falta el recorte inteligente de api/_transcript.js, alcanza con un techo
  // razonable de turnos y de largo por mensaje.
  const historial = entrada.slice(-20).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 1500),
  })).filter((m) => m.content.trim());

  if (!historial.length) return res.status(400).json({ error: "No hay contenido para responder." });
  if (historial[historial.length - 1].role !== "user") {
    return res.status(400).json({ error: "El último mensaje debe ser del visitante." });
  }

  const idioma = detectarIdioma(historial.filter((m) => m.role === "user").map((m) => m.content));
  const yaOfrecioFormulario = entrada.some((m) => m.role === "assistant" && m.formShown);

  const messages = [
    { role: "system", content: systemPrompt(idioma) },
    ...(yaOfrecioFormulario
      ? [{ role: "system", content: "The contact form was already offered earlier in this conversation. Do not add the tag again unless the visitor explicitly asks to talk to someone or for the form again." }]
      : []),
    ...historial.map((m) => ({ role: m.role, content: m.content })),
  ];

  let ultimoError = "Error al consultar el asistente.";
  for (const model of MODELOS) {
    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(cuerpoGroq({ model, temperature: 0.6, max_tokens: 500, messages })),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let contenido = (data?.choices?.[0]?.message?.content || "").trim();
        const mostrarFormulario = contenido.includes(TAG_FORM);
        if (mostrarFormulario) contenido = contenido.replace(TAG_FORM, "").trim();
        return res.status(200).json({ reply: contenido, mostrarFormulario });
      }
      ultimoError = data?.error?.message || `Groq devolvió ${r.status}`;
      if (!vaOtroModelo(r.status, ultimoError)) break;
    } catch (e) {
      ultimoError = e?.message || "Error de conexión con Groq.";
    }
  }
  return res.status(500).json({ error: ultimoError });
}
