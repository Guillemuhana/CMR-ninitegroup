// Traduce un texto al idioma destino usando Groq (gratis).
// Requiere en Vercel: GROQ_API_KEY.

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

  const texto = (req.body?.texto || "").trim();
  const destino = req.body?.destino === "en" ? "en" : "es";
  if (!texto) return res.status(400).json({ error: "No hay texto para traducir." });

  const idioma = destino === "en" ? "English" : "español rioplatense (Argentina)";

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `Sos un traductor profesional. Traducí el texto del usuario al ${idioma}. Devolvé ÚNICAMENTE la traducción: sin comillas, sin notas, sin explicaciones, sin el texto original. Mantené el tono, el sentido y los emojis. Si el texto ya está en ${idioma}, devolvelo tal cual.`,
          },
          { role: "user", content: texto },
        ],
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(500).json({ error: data?.error?.message || `Groq devolvió ${r.status}` });
    }
    const traduccion = (data?.choices?.[0]?.message?.content || "").trim();
    return res.status(200).json({ traduccion });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error al traducir." });
  }
}
