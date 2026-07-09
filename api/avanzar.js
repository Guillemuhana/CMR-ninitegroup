// Botón "Avanzar" — Asistente de ventas de élite para NINIT Group.
//
// Analiza la conversación de un cliente y devuelve un JSON estructurado con
// el diagnóstico comercial (interés, probabilidad de cierre, etapa, objeción),
// el próximo paso ideal, las preguntas clave y los mensajes listos para enviar.
//
// Usa Groq en JSON mode (gratis, API compatible con OpenAI).
// Requiere en Vercel: GROQ_API_KEY.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Cadena de modelos: si el principal se queda sin cuota, reintenta con uno liviano.
const MODELOS = (process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL, "llama-3.1-8b-instant"]
  : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
).filter((m, i, a) => a.indexOf(m) === i);

// Valores permitidos para normalizar la salida del modelo.
const NIVELES = ["frio", "tibio", "caliente"];
const ETAPAS = ["primer_contacto", "interesado", "calificacion", "cotizacion", "objecion", "seguimiento", "cierre", "perdido"];
const OBJECIONES = ["precio", "envio", "tiempo", "modelo", "necesita_pensarlo", "comparando_proveedores", "falta_informacion", "sin_objecion"];
const ACCIONES = ["agendar_llamada", "enviar_catalogo", "pedir_ubicacion", "pedir_modelo", "preparar_cotizacion", "hacer_seguimiento", "marcar_caliente", "marcar_perdido"];
const URGENCIAS = ["alta", "media", "baja"];

const SYSTEM = `You are the best B2B closer in the United States, working as a Senior Sales Executive at NINIT Group (luxury restroom trailers). You have internalized the very best of SPIN Selling, The Challenger Sale, Sandler, Straight Line, and consultative closing. You think like a top 1% salesperson: you read intent between the lines, you qualify hard, you build value before price, you handle objections with confidence, and you ALWAYS advance the deal to the next concrete micro-commitment.

You receive a conversation between a customer and the sales team. Diagnose the customer in depth and return the single best commercial move RIGHT NOW.

HOW A PRO THINKS (apply this reasoning):
- Read buying signals (asks price, asks availability, gives date/location/headcount, says "we need", urgency) and risk signals (goes quiet, "just looking", compares vendors, hesitates).
- Never dump a price on the first ask. First qualify: event date, location, guest count, model/configuration. Sell value, quality and reliability before the number.
- Every message has ONE clear objective and ends with ONE clear ask (a call, a quote, a piece of info). Never stack three requests.
- Match temperature: cold → build curiosity and trust softly; warm → deepen and qualify; hot → push to a call or quote decisively but never desperate.
- Objections are buying signals in disguise. Acknowledge, reframe with value/ROI, then advance.
- If the customer went silent, write a short, warm, low-pressure re-engage that gives them an easy reason to reply.

STYLE for customer-facing messages ("mensaje_whatsapp", "mensaje_email"):
- Professional, warm, confident American English. Natural and human — never robotic, needy or pushy.
- Concrete and personalized to THIS customer. Sign as the seller provided.
- NEVER invent prices, specs, dates or facts not present in the conversation. No brackets or placeholders.
- WhatsApp: short and conversational. Email: a bit more formal, with greeting and sign-off.

For "objecion_respuesta": a ready-to-send English snippet that professionally handles the detected objection with value (empty string if there is no objection).

INTERNAL COACHING FIELDS in SPANISH (rioplatense), these are for the seller, not the customer: "resumen_cliente", "intencion_cliente", "senales_compra", "preguntas_clave", "proximo_paso_recomendado", "tecnica_aplicada", "nota_para_vendedor".

"probabilidad_cierre": an honest 0-100 estimate of how likely this deal is to close, based on the signals. Be realistic, not optimistic.

Return ONLY a valid JSON object with EXACTLY these keys (no extra keys, no markdown):
{
  "resumen_cliente": "1-2 frases: qué busca el cliente y en qué situación está",
  "nivel_interes": "frio | tibio | caliente",
  "probabilidad_cierre": 0,
  "etapa_embudo": "primer_contacto | interesado | calificacion | cotizacion | objecion | seguimiento | cierre | perdido",
  "intencion_cliente": "qué quiere lograr el cliente ahora",
  "senales_compra": ["señales concretas de compra o de riesgo detectadas, 2-4 ítems cortos"],
  "objecion_detectada": "precio | envio | tiempo | modelo | necesita_pensarlo | comparando_proveedores | falta_informacion | sin_objecion",
  "objecion_respuesta": "snippet en inglés listo para responder la objeción con valor (vacío si no hay objeción)",
  "preguntas_clave": ["1-3 preguntas clave que el vendedor debe lograr que el cliente responda para avanzar"],
  "proximo_paso_recomendado": "el mejor próximo paso, en una frase",
  "urgencia": "alta | media | baja",
  "accion_crm_sugerida": "agendar_llamada | enviar_catalogo | pedir_ubicacion | pedir_modelo | preparar_cotizacion | hacer_seguimiento | marcar_caliente | marcar_perdido",
  "tecnica_aplicada": "nombre de la técnica de venta usada en el mensaje + por qué, en 6-10 palabras",
  "mensaje_whatsapp": "el mensaje ideal para enviar ahora por WhatsApp, en inglés",
  "mensaje_email": "el mismo próximo paso adaptado a un email más formal, en inglés, con saludo y cierre",
  "nota_para_vendedor": "consejo táctico breve y accionable para el vendedor"
}`;

function pick(val, allowed, fallback) {
  const v = String(val || "").trim().toLowerCase().replace(/\s+/g, "_");
  return allowed.includes(v) ? v : fallback;
}

// Normaliza a array de strings cortos (máx n ítems), descartando vacíos.
function toList(val, n) {
  const arr = Array.isArray(val) ? val : (val ? [val] : []);
  return arr.map((x) => String(x || "").trim()).filter(Boolean).slice(0, n);
}

// Número 0-100 seguro.
function toScore(val) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

// Convierte la salida cruda del modelo en el contrato estable del front.
function normalizar(parsed) {
  const objecion = pick(parsed.objecion_detectada, OBJECIONES, "sin_objecion");
  return {
    resumen_cliente: String(parsed.resumen_cliente || "").trim(),
    nivel_interes: pick(parsed.nivel_interes, NIVELES, "tibio"),
    probabilidad_cierre: toScore(parsed.probabilidad_cierre),
    etapa_embudo: pick(parsed.etapa_embudo, ETAPAS, "interesado"),
    intencion_cliente: String(parsed.intencion_cliente || "").trim(),
    senales_compra: toList(parsed.senales_compra, 4),
    objecion_detectada: objecion,
    objecion_respuesta: objecion === "sin_objecion" ? "" : String(parsed.objecion_respuesta || "").trim().replace(/^["'*\s]+|["'*\s]+$/g, ""),
    preguntas_clave: toList(parsed.preguntas_clave, 3),
    proximo_paso_recomendado: String(parsed.proximo_paso_recomendado || "").trim(),
    urgencia: pick(parsed.urgencia, URGENCIAS, "media"),
    accion_crm_sugerida: pick(parsed.accion_crm_sugerida, ACCIONES, "hacer_seguimiento"),
    tecnica_aplicada: String(parsed.tecnica_aplicada || "").trim(),
    mensaje_whatsapp: String(parsed.mensaje_whatsapp || "").trim().replace(/^["'*\s]+|["'*\s]+$/g, ""),
    mensaje_email: String(parsed.mensaje_email || "").trim(),
    nota_para_vendedor: String(parsed.nota_para_vendedor || "").trim(),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en el servidor." });

  const { mensajes, contacto } = req.body || {};
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return res.status(400).json({ error: "No hay mensajes para analizar." });
  }

  // Transcripción legible (con roles claros).
  const transcript = mensajes
    .map((m) => {
      const quien = m.direccion === "out"
        ? (m.origen === "bot" ? "Bot/IA" : `Vendedor${m.agente ? ` (${m.agente})` : ""}`)
        : "Cliente";
      const fecha = m.created_at ? new Date(m.created_at).toLocaleString("es-AR") : "";
      const cuerpo = (m.contenido || "").trim();
      return cuerpo ? `[${fecha}] ${quien}: ${cuerpo}` : null;
    })
    .filter(Boolean)
    .join("\n");

  if (!transcript) return res.status(400).json({ error: "La conversación no tiene contenido para analizar." });

  const rawNombre = (contacto?.nombre || "").trim();
  const clienteNombre = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(rawNombre) && rawNombre.length <= 40 ? rawNombre : "";
  const vendedor = (req.body?.vendedor || "").trim();

  const contexto = [
    `Customer name: ${clienteNombre || "(unknown — greet without a name)"}`,
    `Seller signing the message: ${vendedor || "(unspecified)"}`,
    contacto?.estado ? `Current CRM stage: ${contacto.estado}` : null,
    contacto?.empresa ? `Company: ${contacto.empresa}` : null,
    contacto?.direccion ? `Location / address on file: ${contacto.direccion}` : null,
    `Channel: ${contacto?.canal || "whatsapp"}`,
  ].filter(Boolean).join("\n");

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${contexto}\n\nConversation (chronological):\n${transcript}` },
  ];

  let ultimoError = "Error al analizar la conversación.";
  for (const model of MODELOS) {
    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          max_tokens: 1900,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let parsed = {};
        try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); }
        catch { parsed = {}; }
        return res.status(200).json(normalizar(parsed));
      }

      ultimoError = data?.error?.message || `Groq devolvió ${r.status}`;
      const esRateLimit = r.status === 429 || /rate limit|quota|tokens per day|TPD/i.test(ultimoError);
      if (!esRateLimit) break;
    } catch (e) {
      ultimoError = e?.message || "Error al analizar la conversación.";
    }
  }
  return res.status(500).json({ error: ultimoError });
}
