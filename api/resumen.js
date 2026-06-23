// Genera un resumen IA de la conversación de un cliente para que el vendedor
// se ponga al día rápido y tenga un mensaje listo para enviarle.
//
// Usa Groq (gratis, API compatible con OpenAI).
// Requiere en Vercel: GROQ_API_KEY (Settings → Environment Variables).
//   Conseguí la key en https://console.groq.com/keys

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const SYSTEM = `Sos un asistente del equipo de ventas de NINIT Group (baños y trailers de lujo).
Te paso la conversación entre un cliente y el equipo (vendedor + bot). Generá un resumen
breve y accionable EN ESPAÑOL (rioplatense) para que el vendedor entienda todo de un vistazo
antes de escribirle como humano.

Respondé directo, sin preámbulos, con este formato:

📋 *Resumen:* 1-2 frases de qué busca el cliente.
💬 *Lo que pidió:* viñetas con lo que consultó o necesita.
✅ *Lo que ya se respondió:* viñetas de lo que se le contestó u ofreció.
📌 *En qué quedó / próximo paso:* el estado actual y qué conviene decirle ahora.

✍️ *Mensaje sugerido para el cliente:*
Escribí un mensaje LISTO PARA COPIAR Y ENVIAR, redactado como lo mandaría el vendedor (humano, cordial y cercano). Debe arrancar saludando y presentándose con el nombre del vendedor (por ej. "Hola [cliente], ¿cómo estás? Soy [vendedor] de NINIT Group..."), retomar el tema de la conversación y proponer el próximo paso concreto. Usá el nombre del cliente si lo conocés. No uses corchetes ni placeholders: completá los datos reales que tengas.

Sé conciso y concreto. No inventes datos que no estén en la conversación.`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en el servidor." });
  }

  const { mensajes, contacto } = req.body || {};
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return res.status(400).json({ error: "No hay mensajes para resumir." });
  }

  // Armar la transcripción legible para el modelo.
  const transcript = mensajes
    .map((m) => {
      const quien =
        m.direccion === "out"
          ? m.origen === "bot"
            ? "Bot/IA"
            : `Vendedor${m.agente ? ` (${m.agente})` : ""}`
          : "Cliente";
      const fecha = m.created_at ? new Date(m.created_at).toLocaleString("es-AR") : "";
      const cuerpo = (m.contenido || "").trim();
      if (!cuerpo) return null;
      return `[${fecha}] ${quien}: ${cuerpo}`;
    })
    .filter(Boolean)
    .join("\n");

  if (!transcript) {
    return res.status(400).json({ error: "La conversación no tiene contenido para resumir." });
  }

  const nombre = contacto?.nombre || contacto?.telefono || contacto?.email || "el cliente";
  const vendedor = (req.body?.vendedor || "").trim();

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.5,
        max_tokens: 1024,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Cliente: ${nombre}\nVendedor que va a escribir: ${vendedor || "(sin especificar)"}\n\nConversación (orden cronológico):\n${transcript}`,
          },
        ],
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detalle = data?.error?.message || `Groq devolvió ${r.status}`;
      return res.status(500).json({ error: detalle });
    }

    const resumen = (data?.choices?.[0]?.message?.content || "").trim();
    return res.status(200).json({ resumen: resumen || "El asistente no devolvió un resumen." });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error al generar el resumen." });
  }
}
