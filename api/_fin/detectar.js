// Detecta en los mensajes entrantes que el cliente presentó la solicitud de
// financiamiento, y avisa al CEO y al vendedor.
//
// Lo llama api/push-send.js, que ya corre en cada mensaje entrante (trigger de
// Supabase). Va en `api/_fin/` porque los archivos con guion bajo NO cuentan
// como Serverless Functions y el plan Hobby de Vercel admite 12 como máximo.
//
// Requiere en Vercel: GROQ_API_KEY (la misma que usa el resto del CRM).

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODELO = "llama-3.1-8b-instant"; // barato y rápido: es una clasificación sí/no

// Estados donde ya no tiene sentido seguir escuchando: o ya avisamos, o el
// financiamiento terminó.
const ESTADOS_FINALES = [
  "application_submitted", "approved", "info_required",
  "declined", "funded", "closed_not_interested",
];

const PROMPT = `Sos un clasificador. Te paso UN mensaje que un cliente le mandó a una empresa que vende trailers de baños y que le ofreció financiamiento con Ascentium Capital.

Respondé SOLO con un JSON: {"aplico": true|false, "confianza": 0-100}

"aplico" es true SOLO si el cliente dice que YA completó, envió o presentó la solicitud de financiamiento (ej: "I submitted the application", "ya apliqué", "just finished the credit application", "sent it in").

"aplico" es false si solo pregunta por el financiamiento, dice que lo va a hacer más tarde, pide el link, está en duda, o habla de otra cosa. Ante la duda, false.`;

// Le pregunta a Groq si el mensaje dice que ya aplicó. Devuelve true/false.
async function pareceQueAplico(texto) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return false;

  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      max_tokens: 60,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: texto.slice(0, 1500) },
      ],
    }),
  });
  if (!r.ok) return false;

  const data = await r.json().catch(() => ({}));
  let out = {};
  try { out = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); } catch { return false; }
  // El umbral alto es a propósito: un aviso de más al CEO cuesta más que uno de menos.
  return out.aplico === true && Number(out.confianza ?? 0) >= 70;
}

/**
 * Revisa un mensaje entrante y, si el cliente avisó que presentó la solicitud,
 * actualiza la ficha y notifica. Best-effort: nunca lanza.
 *
 * @param admin    cliente de Supabase con service role
 * @param webpush  módulo web-push YA configurado con las VAPID keys
 * @param rec      la fila de `mensajes` que entró
 * @param contacto { id, nombre, telefono, vendedor } o null
 */
export async function detectarSolicitudFinanciamiento({ admin, webpush, rec, contacto }) {
  try {
    const texto = (rec?.contenido || "").toString().trim();
    if (!rec?.contacto_id || texto.length < 8) return { skipped: "sin texto" };

    // Solo miramos clientes con el link ya enviado y el trámite todavía abierto.
    const { data: filas } = await admin
      .from("financiamiento")
      .select("id, estado, link_enviado")
      .eq("contacto_id", rec.contacto_id)
      .limit(1);
    const fin = filas?.[0];
    if (!fin || !fin.link_enviado) return { skipped: "sin financiamiento en curso" };
    if (ESTADOS_FINALES.includes(fin.estado)) return { skipped: "ya cerrado" };

    if (!(await pareceQueAplico(texto))) return { detectado: false };

    await admin.from("financiamiento").update({
      estado: "application_submitted",
      detectado_por_ia: true,
    }).eq("id", fin.id);

    // Aviso al CEO y al vendedor que lo atiende.
    const cliente = contacto?.nombre || contacto?.telefono || "Un cliente";
    let q = admin.from("push_subscriptions").select("*");
    if (contacto?.vendedor) q = q.or(`rol.eq.ceo,vendedor.eq.${contacto.vendedor}`);
    else q = q.eq("rol", "ceo");
    const { data: subs } = await q;

    const payload = JSON.stringify({
      title: "💳 Solicitud de financiamiento presentada",
      body: `${cliente} avisó que presentó la solicitud con Ascentium Capital.`,
      tag: `fin-${rec.contacto_id}`,
      contacto_id: rec.contacto_id,
      url: `/?chat=${rec.contacto_id}`,
    });

    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch { /* suscripción vencida: la limpia el flujo normal de push-send */ }
    }));

    return { detectado: true, sent };
  } catch (e) {
    // Nunca romper el envío de notificaciones por culpa de la detección.
    console.warn("[detectar-financiamiento]", e?.message || e);
    return { error: e?.message || "error" };
  }
}
