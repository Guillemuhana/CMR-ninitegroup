// Genera un resumen IA de la conversación de un cliente para que el vendedor
// se ponga al día rápido y tenga un mensaje listo para enviarle.
//
// Usa Groq (gratis, API compatible con OpenAI).
// Requiere en Vercel: GROQ_API_KEY (Settings → Environment Variables).
//   Conseguí la key en https://console.groq.com/keys

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const DELIM = "|||MENSAJE|||";

function buildSystem(vendedor) {
  const firma = vendedor && vendedor !== "(sin especificar)" ? vendedor : "el vendedor";
  return `Sos un asistente del equipo de ventas de NINIT Group (baños y trailers de lujo).
Te paso la conversación entre un cliente y el equipo (vendedor + bot). Tenés que producir DOS partes.

PARTE 1 — Resumen para el vendedor (español rioplatense, directo, sin preámbulos):
📋 *Resumen:* 1-2 frases de qué busca el cliente.
💬 *Lo que pidió:* viñetas con lo que consultó o necesita.
✅ *Lo que ya se respondió:* viñetas de lo que se le contestó u ofreció.
📌 *En qué quedó / próximo paso:* el estado actual y qué conviene decirle ahora.

Después escribí EXACTAMENTE esta línea sola, sin nada más en ella:
${DELIM}

PARTE 2 — La RESPUESTA IDEAL para mandarle ahora al cliente por WhatsApp, escrita por ${firma} (el vendedor). Construila a partir del análisis de la PARTE 1: tiene que ser el mejor mensaje posible para ESTE cliente en ESTE punto de la conversación, no algo genérico. Reglas:
- Basate en "lo que pidió" y sobre todo en "en qué quedó / próximo paso": respondé lo que quedó pendiente, retomá lo último que dijo el cliente y empujá con naturalidad hacia el próximo paso concreto (responder una duda, pasar una cotización, agendar, pedir un dato que falta, cerrar la venta, etc.).
- Es un mensaje DE ${firma} (vendedor) HACIA el cliente. No confundas los roles: saludás al cliente y firmás vos como ${firma}. El nombre del cliente y el del vendedor te los paso aparte abajo: no los mezcles.
- Saludá al cliente por su nombre SOLO si te paso un nombre real del cliente; si no, saludá sin nombre (ej. "Hola, ¿cómo estás?").
- Presentate de forma natural y humana como ${firma} de NINIT Group. Escribilo bien redactado, con espacios y acentos correctos. No suene a guion ni repitas frases armadas; variá la redacción.
- Tono cordial y cercano, como un vendedor humano real. Sin corchetes ni placeholders (completá con datos reales), sin encabezados, sin asteriscos ni comillas: solo el texto del mensaje, tal cual se manda.

No inventes datos ni precios que no estén en la conversación.`;
}

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

  // Nombre real del cliente solo si parece un nombre (tiene letras y no es un teléfono).
  const rawNombre = (contacto?.nombre || "").trim();
  const clienteNombre = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(rawNombre) && rawNombre.length <= 40 ? rawNombre : "";
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
        temperature: 0.6,
        max_tokens: 1024,
        messages: [
          { role: "system", content: buildSystem(vendedor) },
          {
            role: "user",
            content: `Nombre del cliente: ${clienteNombre || "(desconocido — saludar sin nombre)"}\nVendedor que firma el mensaje: ${vendedor || "(sin especificar)"}\n\nConversación (orden cronológico):\n${transcript}`,
          },
        ],
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detalle = data?.error?.message || `Groq devolvió ${r.status}`;
      return res.status(500).json({ error: detalle });
    }

    const full = (data?.choices?.[0]?.message?.content || "").trim();
    let resumen = full;
    let mensaje = "";
    const i = full.indexOf(DELIM);
    if (i >= 0) {
      resumen = full.slice(0, i).trim();
      mensaje = full.slice(i + DELIM.length).trim().replace(/^["'*\s]+|["'*\s]+$/g, "");
    }
    return res.status(200).json({ resumen: resumen || "Sin resumen.", mensaje });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error al generar el resumen." });
  }
}
