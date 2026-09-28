// Mensaje de presentación para un cliente potencial que salió del buscador.
//
// Lo llama api/_prospectos/buscar.js cuando la pantalla pide
// { accion: "redactar" }. Devuelve un email (asunto + cuerpo) y un WhatsApp
// corto, en inglés porque se le escribe a negocios de Estados Unidos.
//
// POR QUÉ NO SE MANDA SOLO
// Son contactos fríos que nunca le escribieron a NTG:
//  · WhatsApp por la API oficial de Meta exige opt-in y plantilla aprobada, y
//    mandar en masa a quien no lo pidió termina en el número bloqueado.
//  · SMS de marketing en USA exige consentimiento previo (TCPA).
//  · Email B2B sí se puede (CAN-SPAM) si el asunto es honesto, se identifica
//    quién escribe y se ofrece la baja.
// Por eso esto sólo REDACTA: el vendedor lo revisa y lo manda uno por uno
// desde su propio correo o WhatsApp. La línea de baja la pega el código,
// no la IA, para que no falte nunca.
//
// Es texto que lee un cliente: obedece api/_ntg.js.

import { FICHA_NTG, FICHA_BUSINESS } from "../_ntg.js";
import { vaOtroModelo } from "../_groq.js";
import { adaptarCuerpo } from "../_ia.js";
import { rubroDe } from "./rubros.js";

export const LANDING_URL = "https://ntg-business.vercel.app/";
export const LINEA_BAJA = "If you'd rather not hear from us, just reply \"no thanks\" and we won't write again.";

const texto = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Los datos del negocio que manda la pantalla, saneados. null si no sirven. */
export function negocioDe(body) {
  const n = body?.negocio;
  const nombre = texto(n?.nombre, 200);
  if (!nombre) return null;
  return {
    nombre,
    tipo: texto(n.tipo_negocio, 80),
    rubro: texto(n.rubro, 80),
    ciudad: texto(n.ciudad || n.direccion, 160),
    web: texto(n.sitio_web, 200),
    unidad: texto(n.productos_sugeridos, 120),
  };
}

/** Firma del vendedor: texto libre de la pantalla, con un mínimo decente. */
export function firmaDe(body) {
  return texto(body?.firma, 400) || "Nini T Group · https://ninitgroup.com";
}

/** El mensaje sin IA, armado con la frase del rubro. */
export function mensajeBase(n) {
  const rubro = rubroDe(`${n.rubro} ${n.nombre} ${n.tipo}`);
  const pitch = rubro?.pitch || "We help businesses that host or serve events add comfortable, climate-controlled restroom trailers.";
  return {
    asunto: `Restroom trailers for ${n.nombre}`,
    cuerpo: `Hi ${n.nombre} team,\n\nI'm reaching out from Nini T Group, a U.S.-based company specializing in restroom trailers for events and rental businesses. ${pitch}\n\nWe offer 2, 3 and 4-stall units with climate control, hot water and flush toilets, plus support to run them as a rental line if you want to.\n\nWould it make sense to send you the models and a quick overview? You can also see how it works here: ${LANDING_URL}`,
    whatsapp: `Hi! This is Nini T Group, restroom trailers for events and rental businesses. ${pitch} Could I send you the models and a quick overview?`,
  };
}

function prompt() {
  return `You write the FIRST outreach message from NINI T-GROUP (NTG) to a U.S. business found on a map search. They have never contacted NTG. A salesperson will review and send it personally.

${FICHA_NTG}

${FICHA_BUSINESS}

RULES FOR THIS COLD MESSAGE
· English, warm and plain, like a real person — not a brochure. No hype words (exclusive, luxury, premium, elite, revolutionary).
· Personalize ONLY with the data given (name, type of business, city, website). Never claim you know their events, guest counts, needs or that they rent restrooms today; if you suggest a use, phrase it as "if you host…".
· One clear reason why a restroom trailer fits THIS kind of business, and ONE soft call to action (reply / quick call / send models). No pressure, no fake urgency.
· You may mention base trailer prices only if it helps; never package prices, never income, ROI or guaranteed bookings. Rental figures only as market references. Never "we manufacture", "our factory" or "made in USA". Not a franchise.
· Email subject: honest and specific, max 60 characters, no clickbait, no ALL CAPS.
· Email body: 70-120 words, no signature and no unsubscribe line (they are added after), you may include this link once: ${LANDING_URL}
· WhatsApp: 2-3 short sentences, max 320 characters, no link.

Return ONLY JSON: {"asunto":"","cuerpo":"","whatsapp":""}`;
}

/** Redacta con la IA; si no se puede, devuelve el mensaje base. Nunca lanza. */
export async function redactar(n, { intentos, solicitar = fetch, limiteMs = 15000 } = {}) {
  const base = mensajeBase(n);
  const vence = Date.now() + limiteMs;
  const quemados = new Set();
  for (const { proveedor, url, apiKey, model } of intentos || []) {
    if (quemados.has(proveedor)) continue;
    const queda = vence - Date.now();
    if (queda < 2000) break;
    try {
      const r = await solicitar(url, {
        method: "POST",
        signal: AbortSignal.timeout(queda),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(adaptarCuerpo(proveedor, {
          model, temperature: 0.6, max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: prompt() }, { role: "user", content: JSON.stringify(n) }],
        })),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let p = {};
        try { p = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); } catch { p = {}; }
        const m = { asunto: texto(p.asunto, 90), cuerpo: texto(p.cuerpo, 1500), whatsapp: texto(p.whatsapp, 400) };
        if (m.asunto && m.cuerpo && m.whatsapp) return { ...m, ia: true };
        return { ...base, ia: false };
      }
      if (!vaOtroModelo(r.status, data?.error?.message)) quemados.add(proveedor);
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") break;
      quemados.add(proveedor);
    }
  }
  return { ...base, ia: false };
}

/** Email final: cuerpo + firma + baja. Lo que se abre en el correo. */
export function emailFinal({ cuerpo }, firma) {
  return `${cuerpo.trim()}\n\n${firma.trim()}\n\n${LINEA_BAJA}`;
}
