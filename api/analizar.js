// Analiza una conversación con Groq (JSON Mode) y extrae metadatos estructurados
// para el filtrado inteligente de leads (ubicación, interés, urgencia, sentimiento,
// etapa del embudo, presupuesto, etc.).
//
// Mismo patrón que /api/resumen.js y /api/asistente.js:
//   - Groq server-side (la key NUNCA viaja al navegador).
//   - Cadena de modelos con fallback si el principal se queda sin cuota (429/TPD).
//
// Requiere en Vercel: GROQ_API_KEY (Settings → Environment Variables).
//   Conseguí/rotá la key en https://console.groq.com/keys
//
// Devuelve: { metadata: { ...esquema... }, modelo }
// El cliente persiste el resultado en `contactos` (columnas ia_*) para que los
// filtros corran instantáneos en memoria. Ver src/FiltrosModal.jsx (analizarContacto).

import { cuerpoGroq, vaOtroModelo } from "./_groq.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const MODELOS = (process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL, "openai/gpt-oss-20b"]
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]
).filter((m, i, a) => a.indexOf(m) === i);

// ── Enums válidos (fuente de verdad, compartida conceptualmente con el frontend) ──
const ENUMS = {
  nivel_interes:      ["bajo", "medio", "avanzado"],
  intencion_contacto: ["ninguna", "llamada_telefonica", "agente_ventas", "soporte_tecnico"],
  urgencia:           ["baja", "media", "alta_prioridad"],
  sentimiento_cliente:["frustrado", "neutral", "entusiasta", "enojado"],
  etapa_embudo:       ["prospeccion", "calificacion", "propuesta", "cierre", "postventa"],
};

const SYSTEM = `Sos un analista comercial senior de NINIT Group (venta de restroom trailers / baños de lujo, base en USA, foco en Miami-Florida).
Te paso la transcripción de un chat entre un cliente y el equipo (bot + vendedor). Analizá SOLO lo que dijo el cliente para clasificar el lead.

Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con EXACTAMENTE este esquema y estos valores permitidos:
{
  "ubicacion": { "ciudad": "string o \\"\\" si no se menciona", "estado_provincia": "string o \\"\\"", "pais": "string o \\"\\"" },
  "nivel_interes": "bajo" | "medio" | "avanzado",
  "intencion_contacto": "ninguna" | "llamada_telefonica" | "agente_ventas" | "soporte_tecnico",
  "urgencia": "baja" | "media" | "alta_prioridad",
  "sentimiento_cliente": "frustrado" | "neutral" | "entusiasta" | "enojado",
  "etapa_embudo": "prospeccion" | "calificacion" | "propuesta" | "cierre" | "postventa",
  "presupuesto_estimado": "monto en USD si el cliente lo menciona (número o texto como '25k', 'entre 20 y 30 mil'), o null si no",
  "resumen_interes": "una frase breve (máx 15 palabras) de qué busca el cliente"
}

Criterios:
- nivel_interes: "bajo" = curioseando/pregunta suelta; "medio" = pide precio o detalles concretos; "avanzado" = lead calificado, habla de fechas/entrega/pago/cierre.
- urgencia: "alta_prioridad" solo si necesita respuesta ya (evento próximo, "urgente", "hoy/mañana", molesto por demora); "media" si tiene fecha pero con margen; "baja" el resto.
- sentimiento_cliente: leé el tono real del cliente. "enojado"/"frustrado" ante quejas o demoras; "entusiasta" ante ganas de comprar; "neutral" por defecto.
- etapa_embudo: "prospeccion" primer contacto; "calificacion" definiendo necesidad/modelo; "propuesta" ya se cotizó; "cierre" negociando/pagando; "postventa" ya compró.
- No inventes ubicación ni presupuesto: si el cliente no lo dijo, ciudad/estado/país = "" y presupuesto_estimado = null.`;

// Normaliza el output del modelo a valores seguros (defensa ante alucinaciones).
function normalizar(raw) {
  const pick = (val, allowed, fb) => {
    const v = String(val || "").toLowerCase().trim();
    return allowed.includes(v) ? v : fb;
  };
  const ubi = raw?.ubicacion || {};
  const s = (x) => (typeof x === "string" ? x.trim() : "");
  return {
    ubicacion: {
      ciudad: s(ubi.ciudad),
      estado_provincia: s(ubi.estado_provincia),
      pais: s(ubi.pais),
    },
    nivel_interes:       pick(raw?.nivel_interes, ENUMS.nivel_interes, "bajo"),
    intencion_contacto:  pick(raw?.intencion_contacto, ENUMS.intencion_contacto, "ninguna"),
    urgencia:            pick(raw?.urgencia, ENUMS.urgencia, "baja"),
    sentimiento_cliente: pick(raw?.sentimiento_cliente, ENUMS.sentimiento_cliente, "neutral"),
    etapa_embudo:        pick(raw?.etapa_embudo, ENUMS.etapa_embudo, "prospeccion"),
    presupuesto_estimado:
      raw?.presupuesto_estimado === null || raw?.presupuesto_estimado === undefined || raw?.presupuesto_estimado === ""
        ? null
        : raw.presupuesto_estimado,
    presupuesto_valor: parsePresupuesto(raw?.presupuesto_estimado),
    resumen_interes: s(raw?.resumen_interes).slice(0, 160),
  };
}

// Extrae un valor numérico en USD desde texto libre: "25k", "$28,500", "entre 20 y 30 mil".
function parsePresupuesto(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  const t = String(v).toLowerCase().replace(/[, ]/g, "");
  const m = t.match(/(\d+(?:\.\d+)?)(k|mil)?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2]) n *= 1000;               // "25k" / "25mil" → 25000
  else if (n > 0 && n < 1000) n *= 1000; // "28" suelto probablemente son miles
  return isFinite(n) ? Math.round(n) : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en el servidor." });

  const { mensajes } = req.body || {};
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return res.status(400).json({ error: "No hay mensajes para analizar." });
  }

  // Transcripción legible (mismo formato que resumen.js).
  const transcript = mensajes
    .map((m) => {
      const quien =
        m.direccion === "out"
          ? m.origen === "bot" ? "Bot/IA" : `Vendedor${m.agente ? ` (${m.agente})` : ""}`
          : "Cliente";
      const cuerpo = (m.contenido || "").trim();
      return cuerpo ? `${quien}: ${cuerpo}` : null;
    })
    .filter(Boolean)
    .join("\n");

  if (!transcript) return res.status(400).json({ error: "La conversación no tiene contenido." });

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Analizá esta conversación y devolvé el JSON:\n\n${transcript}` },
  ];

  let ultimoError = "Error al analizar la conversación.";
  for (const model of MODELOS) {
    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(cuerpoGroq({
          model,
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: "json_object" }, // ← JSON Mode
          messages,
        })),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let raw = {};
        try { raw = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); } catch { raw = {}; }
        return res.status(200).json({ metadata: normalizar(raw), modelo: model });
      }
      ultimoError = data?.error?.message || `Groq devolvió ${r.status}`;
      if (!vaOtroModelo(r.status, ultimoError)) break;
    } catch (e) {
      ultimoError = e?.message || "Error de conexión con Groq.";
    }
  }
  return res.status(500).json({ error: ultimoError });
}
