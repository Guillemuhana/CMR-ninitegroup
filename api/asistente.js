// Asistente Ejecutivo IA del CRM (la burbuja flotante).
// Usa Groq server-side con la MISMA key que el botón "Avanzar" (/api/resumen.js)
// y /api/traducir.js → rápido, preciso y sin exponer la clave en el navegador.
//
// Requiere en Vercel: GROQ_API_KEY (Settings → Environment Variables).
//   Conseguí la key en https://console.groq.com/keys

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en el servidor." });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messages || !messages.length) return res.status(400).json({ error: "Faltan mensajes." });

  const maxTokens = Math.min(Number(req.body?.max_tokens) || 700, 2000);
  const temperature = typeof req.body?.temperature === "number" ? req.body.temperature : 0.5;

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(500).json({ error: data?.error?.message || `Groq devolvió ${r.status}` });
    }
    const contenido = (data?.choices?.[0]?.message?.content || "").trim();
    return res.status(200).json({ contenido });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error al consultar el asistente." });
  }
}
