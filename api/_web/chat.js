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

import { vaOtroModelo } from "../_groq.js";
import { intentosIA, adaptarCuerpo } from "../_ia.js";
import { FICHA_NTG, FICHA_BUSINESS } from "../_ntg.js";
import { MEDIA, mediaDe, tiposDe, modelosDisponibles } from "../_fotos.js";

// Tag interno para pedirle al widget que muestre el mini-formulario de
// contacto. Nunca debe llegar al visitante — se lee y se recorta acá mismo,
// el mismo criterio que ya usa el bot de WhatsApp con [ENVIAR_PRODUCTO].
const TAG_FORM = "[LEAD_FORM]";

// Fotos y videos de las unidades.
//
// Mismo mecanismo que TAG_FORM: el modelo escribe una marca, el servidor la
// lee, la valida y la recorta antes de que el texto llegue al visitante.
//
// El material sale de api/_fotos.js: los links oficiales de ninitgroup.com,
// los MISMOS que el vendedor manda desde el botón "Fotos" del CRM. Que la web
// pública y el vendedor muestren lo mismo no es un detalle — el cliente ve
// las dos cosas y cualquier diferencia se nota.
//
// Lo que NO va en la tarjeta es el precio: ya está en la ficha (FICHA_NTG) y
// el asistente lo dice en el texto. Ponerlo también acá crearía un CUARTO
// lugar donde cambiarlo cuando Nicolás toca un precio, y tarde o temprano uno
// queda viejo y el cliente ve dos precios distintos en la misma pantalla.
const MODELOS_CON_FOTO = Object.keys(MEDIA);

// Lo que los modelos escriben cuando no siguen la instrucción al pie de la
// letra. Más barato normalizar que perder la foto.
const ALIAS_MODELO = {
  "2stall": "2-stall", "2 stall": "2-stall", "2-stalls": "2-stall", "dos": "2-stall",
  "3stall": "3-stall", "3 stall": "3-stall", "3-stalls": "3-stall", "tres": "3-stall",
  "4stall": "4-stall", "4 stall": "4-stall", "4-stalls": "4-stall", "cuatro": "4-stall",
  "ada": "ada-2", "ada+2": "ada-2", "ada 2": "ada-2", "ada-plus-2": "ada-2", "ada2": "ada-2",
};

function slugDeModelo(crudo) {
  const clave = String(crudo).trim().toLowerCase().replace(/[_\s]+/g, " ");
  const guiones = clave.replace(/\s+/g, "-");
  if (MODELOS_CON_FOTO.includes(guiones)) return guiones;
  return ALIAS_MODELO[clave] || ALIAS_MODELO[clave.replace(/\s+/g, "")] || null;
}

/**
 * Saca las marcas [FOTO:modelo] y [FOTO:modelo:tipo] del texto y devuelve qué
 * material hay que mostrar, ya resuelto a URLs.
 *
 * El texto vuelve SIEMPRE limpio, incluso si el modelo escribió una marca que
 * no existe: una marca colgando en una burbuja delata la maquinaria y hace
 * que el asistente parezca roto.
 */
export function extraerFotos(texto) {
  const vistos = new Set();
  const medios = [];

  const limpio = String(texto || "").replace(/\[\s*FOTO\s*:?\s*([^\]]*)\]/gi, (_, crudo) => {
    const partes = String(crudo).split(":");
    const slug = slugDeModelo(partes[0]);
    if (!slug) return "";

    const item = mediaDe(slug, partes[1] || "exterior");
    if (!item) return "";

    // Una misma combinación modelo+tipo no se manda dos veces en la misma
    // respuesta, aunque el modelo escriba la marca repetida.
    const clave = `${item.slug}:${item.tipo}`;
    if (vistos.has(clave)) return "";
    vistos.add(clave);
    medios.push(item);
    return "";
  });

  // Tope de dos bloques: más que eso deja de ser una conversación y pasa a
  // ser una descarga de catálogo.
  return {
    texto: limpio.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    fotos: medios.slice(0, 2),
  };
}

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
You are a LEAD CAPTURER, not a help desk. Help the visitor understand the business-system offer, figure out which package and profile fits them, answer honestly — and steadily move them toward leaving their name and phone so an advisor can send the full written quote. Never toward a price or promise you don't actually have.

Every reply should leave the conversation one step closer to that. Answer what they asked, then open the next door: a clarifying question about their market, their timing or what they already have. When they show any real intent — pricing, timing, "how do I start", "what would it cost me" — ask for their details.

NEVER SEND THE VISITOR TO ANY INTERNAL TOOL — hard rule
NTG has an internal CRM that only the NINI team uses. The visitor must never be pointed at it, sent a link to it, told to "log in", "check the dashboard", "create an account" or "access the system". There is no customer portal and no login for them. The CRM appears on this page only as something INCLUDED IN THE PACKAGE THEY WOULD BUY — a tool they would get for their own future business — never as somewhere to go now.
If they ask how to see their information, how to log in, or where to track their inquiry: the answer is that an advisor follows up with them directly by phone, WhatsApp or email, and you offer the contact form. Never an URL, never a login.
The only place you ever send them is the contact form on this page.

LANGUAGE
${idioma === "es"
    ? "This visitor is writing in Spanish. Reply only in Spanish, naturally, even though the page itself is in English."
    : "Reply in English, matching the page. If the visitor clearly switches to Spanish, switch with them."}

STYLE
- 2-4 short sentences per reply. Conversational, warm, confident — never a brochure dump.
- Answer exactly what was asked first, then guide with at most one question or one next step.
- Never repeat something you already told them in this conversation.
- No markdown, no bullet lists, no headers — this renders as plain chat bubbles.

SHOWING PHOTOS AND VIDEOS OF A TRAILER
You can show the visitor real photos and video walkthroughs. Add the tag [FOTO:model:type] at the very end of your reply. These are the only models and the only types each one actually has:
${modelosDisponibles().map((slug) => `- ${slug} (${MEDIA[slug].nombre}) → ${tiposDe(slug).join(", ")}`).join("\n")}

If you leave the type out, [FOTO:3-stall] shows the exterior.

Pick the type from what they asked:
- "what does it look like", "show me the 3-Stall", or they just name a unit → exterior
- "what's it like inside", "how are the bathrooms" → interior
- "how big is it", "measurements", "layout" → plano
- "do you have a video", "can I see it in motion" → video
- "what does it include", "does it have A/C", "hot water", "what's the equipment like" → detalle
- "what colours", "what finish" → paleta

Rules:
- Only when a specific unit is on the table. A general "what do you sell" gets an answer, not a gallery.
- At most TWO tags in one reply, and only when they are genuinely comparing two units or you are showing outside and inside together. One is usually right.
- Only ask for a type the model actually has in the list above. The 4-Stall has no video; the ADA + 2 has no floor plan. If they ask for something that is not there, say so plainly and offer what you do have.
- Do not repeat material they were already shown unless they ask for it again.
- Write your reply as if the photo were already attached: "here it is", "this is the 3-Stall inside". NEVER say you cannot show photos, and NEVER paste a URL — you cannot write links, the tag is the only way and the page turns it into a real picture or video player.
- Never mention the tag, never explain it, never put it mid-sentence. It goes last, after the text.

WHEN TO OFFER THE CONTACT FORM
End your reply with the exact tag ${TAG_FORM} on its own, as the very last thing, when ANY of these is true:
- the visitor asks for pricing/a quote/next steps/how to move forward,
- the visitor says they want to talk to someone or get the full breakdown,
- the conversation has had a real back-and-forth (roughly 3+ visitor messages) and you have not offered it yet.
Do not offer it on a first "hi" or a single vague question, and do not offer it twice in the same conversation unless the visitor explicitly asks again later. Never mention this tag or explain it — it is invisible machinery, the widget reads it and shows a short contact form.`;
}

// Cómo se le pasa al modelo lo que el visitante estuvo haciendo en la página.
//
// La línea fina: saber que alguien pasó cuatro minutos en la calculadora con
// un 3-Stall sirve muchísimo para no hacerle preguntas que ya se contestó
// solo. Decírselo en la cara —"veo que estuviste mirando..."— lo espanta. Así
// que el contexto entra como algo que el asistente SABE, no como algo que
// menciona: cambia qué pregunta y qué da por sabido, nunca el tema.
function contextoPrompt(contexto) {
  return `WHAT THIS VISITOR HAS BEEN DOING ON THE PAGE (behavioural signals from the page itself — they did NOT tell you any of this):
${contexto}

HOW TO USE IT — read carefully, this is easy to get wrong:
- Use it to CHOOSE what to talk about and what to skip. If they spent time on the calculator, don't explain that there is a calculator — go straight to their numbers. If they were reading the packages, get concrete about which one fits instead of re-pitching the offer.
- NEVER say out loud that you can see what they viewed, how long they stayed, or that they were here before. No "I noticed you were looking at…", no "I see you've used our calculator". Being watched is creepy and it costs us the lead.
- NEVER treat these signals as facts they stated. If the signal says they looked at the 4-Stall, that is interest, not a decision — ask, don't assume.
- If a signal contradicts what they type, what they type wins, always.`;
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

  // `publico: true` — cualquiera puede llamar a este endpoint desde internet,
  // así que acá se respeta OPENAI_EN_CHAT. Ver la nota larga en api/_ia.js.
  const intentos = intentosIA({ publico: true });
  if (!intentos.length) {
    return res.status(500).json({ error: "Falta configurar GROQ_API_KEY (u OPENAI_API_KEY) en el servidor." });
  }

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

  // Qué fotos ya vio. El widget las devuelve con cada mensaje del asistente,
  // igual que formShown: sin esto, el modelo le manda la misma foto del
  // 3-Stall tres veces y parece que no está escuchando.
  const fotosYaVistas = [...new Set(
    entrada.flatMap((m) => (Array.isArray(m.fotos) ? m.fotos : []))
      .map((f) => (f && f.slug ? `${f.slug} ${f.tipo || "exterior"}` : null))
      .filter(Boolean)
  )];

  // Señales de navegación que manda el widget (secciones que miró, si usó la
  // calculadora y con qué números, cuánto hace que está, si ya había entrado
  // antes). No es algo que el visitante nos haya dicho: es contexto para que
  // el asistente hable de lo que la persona está mirando en vez de arrancar
  // de cero. Cómo se usa —y cómo NO— está en el bloque de abajo.
  const contexto = String(req.body?.contexto || "").trim().slice(0, 700);

  const messages = [
    { role: "system", content: systemPrompt(idioma) },
    ...(contexto ? [{ role: "system", content: contextoPrompt(contexto) }] : []),
    ...(yaOfrecioFormulario
      ? [{ role: "system", content: "The contact form was already offered earlier in this conversation. Do not add the tag again unless the visitor explicitly asks to talk to someone or for the form again." }]
      : []),
    ...(fotosYaVistas.length
      ? [{ role: "system", content: `The visitor has already been shown photos of: ${fotosYaVistas.join(", ")}. Do not send those again unless they ask to see them once more.` }]
      : []),
    ...historial.map((m) => ({ role: m.role, content: m.content })),
  ];

  let ultimoError = "Error al consultar el asistente.";
  // Un error que no se arregla reintentando quema a ESE proveedor, no a la
  // fila: si la clave de OpenAI está vencida, Groq todavía tiene que poder
  // contestarle al prospecto.
  const quemados = new Set();

  for (const { proveedor, url, apiKey, model } of intentos) {
    if (quemados.has(proveedor)) continue;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(adaptarCuerpo(proveedor, { model, temperature: 0.6, max_tokens: 500, messages })),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let contenido = (data?.choices?.[0]?.message?.content || "").trim();
        const mostrarFormulario = contenido.includes(TAG_FORM);
        if (mostrarFormulario) contenido = contenido.replace(TAG_FORM, "").trim();

        const { texto, fotos } = extraerFotos(contenido);
        return res.status(200).json({ reply: texto, mostrarFormulario, fotos });
      }
      ultimoError = data?.error?.message || `${proveedor} devolvió ${r.status}`;
      if (!vaOtroModelo(r.status, ultimoError)) quemados.add(proveedor);
    } catch (e) {
      ultimoError = e?.message || `Error de conexión con ${proveedor}.`;
      quemados.add(proveedor);
    }
  }
  return res.status(500).json({ error: ultimoError });
}
