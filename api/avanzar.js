// Botón "Avanzar" — Asistente de ventas inteligente para NINIT Group.
//
// Analiza la conversación de un cliente y devuelve un JSON estructurado con
// el diagnóstico comercial (interés, etapa del embudo, objeción), el próximo
// paso ideal y los mensajes listos para enviar (WhatsApp / email).
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

const SYSTEM = `You are a Senior Sales Executive at NINIT Group, specialized in B2B sales of Luxury Restroom Trailers in the United States. You are a master of SPIN Selling, The Challenger Sale, Sandler, and consultative closing.

You will receive a conversation between a customer and the sales team. Analyze the customer in depth and return the single best commercial move.

STYLE RULES (for the customer-facing messages "mensaje_whatsapp" and "mensaje_email"):
- Always write in professional English.
- Human, natural, consultative tone. Never desperate or aggressive. Do not over-pressure.
- Always steer toward the next logical step: a call, a quote, asking for location, asking for the model, or sending the catalog. One clear objective per message — do not stack three asks.
- If the customer asks for a price, DO NOT give a price yet: first ask for location, model and the configuration you need to quote accurately.
- If the customer asks for a call, propose a specific time window and confirm availability.
- If the customer is cold, respond softly and build interest.
- If the customer is hot, advance to a quote or a call.
- If there is a price objection, respond with value, quality, ROI and professionalism.
- If the customer has not replied for several days, craft a short, warm follow-up.
- Never invent prices, specs or data that are not in the conversation. No placeholders or brackets — use only real information.
- The message must feel written for THIS customer, never generic. Sign as the seller provided.

ANALYSIS FIELDS ("resumen_cliente", "intencion_cliente", "proximo_paso_recomendado", "nota_para_vendedor"): write these in SPANISH (rioplatense), because they are internal coaching for the seller.

Return ONLY a valid JSON object with EXACTLY these keys (no extra keys, no markdown):
{
  "resumen_cliente": "1-2 frases: qué busca el cliente y en qué situación está",
  "nivel_interes": "frio | tibio | caliente",
  "etapa_embudo": "primer_contacto | interesado | calificacion | cotizacion | objecion | seguimiento | cierre | perdido",
  "intencion_cliente": "qué quiere lograr el cliente ahora",
  "objecion_detectada": "precio | envio | tiempo | modelo | necesita_pensarlo | comparando_proveedores | falta_informacion | sin_objecion",
  "proximo_paso_recomendado": "el mejor próximo paso, en una frase",
  "accion_crm_sugerida": "agendar_llamada | enviar_catalogo | pedir_ubicacion | pedir_modelo | preparar_cotizacion | hacer_seguimiento | marcar_caliente | marcar_perdido",
  "mensaje_whatsapp": "el mensaje ideal para enviar ahora por WhatsApp, en inglés",
  "mensaje_email": "el mismo próximo paso adaptado a un email más formal, en inglés, con saludo y cierre",
  "nota_para_vendedor": "consejo táctico breve para el vendedor (técnica de venta a aplicar)"
}`;

function pick(val, allowed, fallback) {
  const v = String(val || "").trim().toLowerCase().replace(/\s+/g, "_");
  return allowed.includes(v) ? v : fallback;
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
          temperature: 0.55,
          max_tokens: 1400,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let parsed = {};
        try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); }
        catch { parsed = {}; }

        const result = {
          resumen_cliente: String(parsed.resumen_cliente || "").trim(),
          nivel_interes: pick(parsed.nivel_interes, NIVELES, "tibio"),
          etapa_embudo: pick(parsed.etapa_embudo, ETAPAS, "interesado"),
          intencion_cliente: String(parsed.intencion_cliente || "").trim(),
          objecion_detectada: pick(parsed.objecion_detectada, OBJECIONES, "sin_objecion"),
          proximo_paso_recomendado: String(parsed.proximo_paso_recomendado || "").trim(),
          accion_crm_sugerida: pick(parsed.accion_crm_sugerida, ACCIONES, "hacer_seguimiento"),
          mensaje_whatsapp: String(parsed.mensaje_whatsapp || "").trim().replace(/^["'*\s]+|["'*\s]+$/g, ""),
          mensaje_email: String(parsed.mensaje_email || "").trim(),
          nota_para_vendedor: String(parsed.nota_para_vendedor || "").trim(),
        };
        return res.status(200).json(result);
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
