// Dos tareas de IA sobre la conversación, en un solo endpoint:
//   POST /api/resumen                         → resumen para el vendedor + mensaje sugerido
//   POST /api/resumen  { accion: "traducir" } → traduce un texto al idioma destino
//
// Van juntas porque el plan Hobby de Vercel permite como máximo 12 Serverless
// Functions por deploy y ya estamos en el tope (antes esto era /api/traducir).
//
// Usa Groq (gratis, API compatible con OpenAI).
// Requiere en Vercel: GROQ_API_KEY (Settings → Environment Variables).
//   Conseguí la key en https://console.groq.com/keys

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Cadena de modelos: si el principal se queda sin cuota diaria (rate limit / TPD),
// reintenta automáticamente con uno más liviano para que el resumen no se "agote".
const MODELOS = (process.env.GROQ_MODEL
  ? [process.env.GROQ_MODEL, "llama-3.1-8b-instant"]
  : ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
).filter((m, i, a) => a.indexOf(m) === i);

const DELIM = "|||MENSAJE|||";

// Llama a Groq recorriendo la cadena de modelos. Devuelve { texto } o { error }.
async function pedirAGroq({ messages, temperature, errorBase }) {
  let ultimoError = errorBase;
  for (const model of MODELOS) {
    try {
      const r = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model, temperature, max_tokens: 1024, messages }),
      });

      const data = await r.json().catch(() => ({}));
      if (r.ok) return { texto: (data?.choices?.[0]?.message?.content || "").trim() };

      ultimoError = data?.error?.message || `Groq devolvió ${r.status}`;
      // 429 = rate limit / sin cuota → probar el siguiente modelo. Otro error → cortar.
      const esRateLimit = r.status === 429 || /rate limit|quota|tokens per day|TPD/i.test(ultimoError);
      if (!esRateLimit) break;
    } catch (e) {
      ultimoError = e?.message || errorBase;
    }
  }
  return { error: ultimoError };
}

// ── Traducción (antes /api/traducir) ──────────────────────────
async function traducir(req, res) {
  const texto = (req.body?.texto || "").trim();
  const destino = req.body?.destino === "en" ? "en" : "es";
  if (!texto) return res.status(400).json({ error: "No hay texto para traducir." });

  const idioma = destino === "en" ? "English" : "español rioplatense (Argentina)";

  const { texto: traduccion, error } = await pedirAGroq({
    temperature: 0.2,
    errorBase: "Error al traducir.",
    messages: [
      {
        role: "system",
        content: `Sos un traductor profesional. Traducí el texto del usuario al ${idioma}. Devolvé ÚNICAMENTE la traducción: sin comillas, sin notas, sin explicaciones, sin el texto original. Mantené el tono, el sentido y los emojis. Si el texto ya está en ${idioma}, devolvelo tal cual.`,
      },
      { role: "user", content: texto },
    ],
  });

  if (error) return res.status(500).json({ error });
  return res.status(200).json({ traduccion });
}

// Detecta el idioma mirando SOLO los mensajes entrantes del cliente (direccion "in"),
// para no confundirse con el bot/vendedor que a veces responde en español.
function detectarIdioma(mensajes) {
  const texto = (mensajes || [])
    .filter((m) => m.direccion === "in")
    .map((m) => (m.contenido || ""))
    .join(" ")
    .toLowerCase();
  if (!texto.trim()) return "es"; // sin mensajes del cliente → español por defecto

  const esHits =
    (texto.match(/[áéíóúñ¿¡]/g) || []).length +
    (texto.match(/\b(que|qué|hola|gracias|necesito|necesita|precio|cuánto|cuanto|está|cómo|como|para|por|quiero|buenas|días|dias|usted|información|informacion|enviar|tienen|tenes|tenés|disculpa|estoy|quisiera|comprar|costo|valor)\b/g) || []).length;
  const enHits =
    (texto.match(/\b(the|you|i'm|hello|hi|hey|price|need|how|what|thanks|thank|please|want|good|morning|info|information|send|can|could|would|your|you're|is|are|for|with|about|interested|looking|quote|cost|buy|much|available)\b/g) || []).length;

  return enHits > esHits ? "en" : "es";
}

function buildSystem(vendedor, idioma) {
  const firma = vendedor && vendedor !== "(sin especificar)" ? vendedor : "el vendedor";
  const idiomaNombre = idioma === "en" ? "INGLÉS (English)" : "ESPAÑOL rioplatense";
  const T = idioma === "en"
    ? { r: "Summary", p: "What they asked", a: "Already answered", n: "Where it stands / next step" }
    : { r: "Resumen", p: "Lo que pidió", a: "Lo que ya se respondió", n: "En qué quedó / próximo paso" };
  return `Sos un vendedor experto y asesor comercial de NINIT Group (baños y trailers de lujo).
Te paso la conversación entre un cliente y el equipo (vendedor + bot). Tu trabajo es ENTENDER al cliente a fondo y diseñar el mensaje exacto para avanzar con la venta. Producí DOS partes.

IDIOMA — OBLIGATORIO: escribí ABSOLUTAMENTE TODO tu output en ${idiomaNombre}. Esto incluye el resumen, los títulos de las secciones (traducidos) y el mensaje al cliente. No uses ningún otro idioma bajo ninguna circunstancia. La ÚNICA excepción es la línea separadora, que va siempre exactamente así: ${DELIM}

Antes de escribir, analizá mentalmente: ¿qué necesita realmente el cliente?, ¿en qué etapa está (recién consulta, comparando, casi decidido, traba/objeción)?, ¿qué lo frena o qué dato falta?, ¿cuál es el ÚNICO mejor próximo paso para acercarlo a la compra?

PARTE 1 — Resumen para el vendedor, directo y sin preámbulos. Usá EXACTAMENTE estos títulos con sus emojis (el contenido va en ${idiomaNombre}):
📋 *${T.r}:* 1-2 frases de qué busca el cliente y en qué etapa está.
💬 *${T.p}:* viñetas con lo que consultó o necesita.
✅ *${T.a}:* viñetas de lo que se le contestó u ofreció.
📌 *${T.n}:* el estado actual, qué lo frena o qué dato falta, y cuál es el mejor próximo paso.

Después escribí EXACTAMENTE esta línea sola, sin nada más en ella:
${DELIM}

PARTE 2 — La RESPUESTA IDEAL para mandarle ahora al cliente por WhatsApp, escrita por ${firma} (el vendedor). Diseñá el mensaje exacto —la pregunta, propuesta o respuesta— que tiene MÁS probabilidad de hacer avanzar a ESTE cliente desde donde está parado. Tiene que sentirse pensado para él, nunca genérico. Reglas:
- Enfocate en UN solo objetivo claro para avanzar (responder la duda que frena, pasar la cotización, agendar una llamada/visita, pedir el dato que falta, o cerrar). No metas tres pedidos a la vez: una sola movida bien hecha.
- Basate en "lo que pidió" y "en qué quedó / próximo paso": respondé lo pendiente, retomá lo último que dijo el cliente y empujá con naturalidad hacia ese próximo paso.
- Es un mensaje DE ${firma} (vendedor) HACIA el cliente. No confundas los roles: saludás al cliente y firmás vos como ${firma}. El nombre del cliente y el del vendedor te los paso aparte abajo: no los mezcles.
- El mensaje va en el idioma del cliente (español o inglés, el que detectaste). Saludá al cliente por su nombre SOLO si te paso un nombre real del cliente; si no, saludá sin nombre (ej. "Hola, ¿cómo estás?" / "Hi, how are you?").
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

  if (req.body?.accion === "traducir") return traducir(req, res);

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
  const idioma = detectarIdioma(mensajes);

  const messages = [
    { role: "system", content: buildSystem(vendedor, idioma) },
    {
      role: "user",
      content: `Nombre del cliente: ${clienteNombre || "(desconocido — saludar sin nombre)"}\nVendedor que firma el mensaje: ${vendedor || "(sin especificar)"}\n\nConversación (orden cronológico):\n${transcript}`,
    },
  ];

  const { texto: full, error } = await pedirAGroq({
    messages,
    temperature: 0.6,
    errorBase: "Error al generar el resumen.",
  });
  if (error) return res.status(500).json({ error });

  let resumen = full;
  let mensaje = "";
  const i = full.indexOf(DELIM);
  if (i >= 0) {
    resumen = full.slice(0, i).trim();
    mensaje = full.slice(i + DELIM.length).trim().replace(/^["'*\s]+|["'*\s]+$/g, "");
  }
  return res.status(200).json({ resumen: resumen || "Sin resumen.", mensaje });
}
