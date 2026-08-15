// ── Endpoint: lista las plantillas de WhatsApp aprobadas en Meta ────────────
//
// Se llega acá por  GET /api/meta-plantillas   (rewrite → /api/push?accion=plantillas;
// ver el comentario de api/push.js: el plan Hobby de Vercel topa en 12 funciones).
//
// Para qué: en Promociones, el nombre de la plantilla se elegía tipeándolo a
// mano. Un typo, una plantilla todavía en revisión o una cantidad de variables
// que no coincide se traducen en un envío masivo rechazado — cientos de
// intentos fallidos seguidos, que es justo el patrón que le baja la calidad al
// número y termina en limitaciones o suspensión. Eligiendo de esta lista sólo
// se pueden mandar plantillas que Meta YA aprobó, con la cantidad exacta de
// variables que espera.
//
// Devuelve también el estado de salud del número (quality_rating y tier de
// envío): es la señal más directa de "estás por comerte una suspensión".
//
// Autenticación: token de sesión de Supabase, igual que /api/meta-evento.
//
// Requiere en Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID
//   META_WA_MANAGEMENT_TOKEN  (o META_CAPI_TOKEN como fallback)
//
// El token necesita el permiso `whatsapp_business_management`. El token de la
// Conversions API normalmente NO lo tiene: si falla, la app cae a escribir el
// nombre a mano y lo dice en pantalla, no se rompe.

import { createClient } from "@supabase/supabase-js";
import { configMeta } from "./capi.js";

// Sólo estas se pueden mandar desde el CRM. Las de AUTHENTICATION llevan un
// código de un solo uso y un botón de copiado: no tienen nada que hacer en una
// promoción.
const CATEGORIAS_VALIDAS = new Set(["MARKETING", "UTILITY"]);

// ── Parseo de una plantilla de Meta al formato que usa el CRM ───────────────
// Exportada aparte de la llamada HTTP para poder testearla sin red.
//
// Devuelve `soportada: false` cuando la plantilla necesita algo que el envío
// del CRM no manda hoy (variables en el encabezado o en los botones). Mostrarla
// como elegible sería prometer un envío que Meta va a rechazar.
export function parsearPlantilla(tpl) {
  const componentes = Array.isArray(tpl?.components) ? tpl.components : [];
  const de = (tipo) => componentes.find((c) => String(c?.type).toUpperCase() === tipo);

  const body = de("BODY");
  const header = de("HEADER");
  const footer = de("FOOTER");
  const botones = de("BUTTONS");

  const texto = String(body?.text || "");
  const variables = variablesDe(texto);

  const motivos = [];
  // Meta acepta variables con nombre ({{nombre}}) además de las numeradas. El
  // envío del CRM manda parámetros posicionales, así que las nombradas no las
  // puede completar.
  if (/\{\{\s*[a-z_][a-z0-9_]*\s*\}\}/i.test(texto))
    motivos.push("usa variables con nombre y el CRM manda variables numeradas");
  if (header && variablesDe(String(header.text || "")).length > 0)
    motivos.push("tiene variables en el encabezado");
  if (header && String(header.format || "TEXT").toUpperCase() !== "TEXT")
    motivos.push(`el encabezado es ${String(header.format).toLowerCase()} y hay que adjuntar el archivo`);
  if (botones?.buttons?.some((b) => variablesDe(String(b?.url || "")).length > 0))
    motivos.push("tiene un botón con URL variable");

  return {
    nombre: tpl?.name || "",
    idioma: tpl?.language || "",
    categoria: String(tpl?.category || "").toUpperCase(),
    estado: String(tpl?.status || "").toUpperCase(),
    texto,
    encabezado: header && String(header.format || "TEXT").toUpperCase() === "TEXT" ? String(header.text || "") : "",
    pie: footer ? String(footer.text || "") : "",
    variables: variables.length,
    // Los ejemplos que el dueño cargó al pedir la aprobación. Sirven para
    // prellenar los campos y que se vea de una qué va en cada variable.
    ejemplos: ejemplosDe(body),
    soportada: motivos.length === 0,
    motivos,
  };
}

// Números de las variables {{1}}, {{2}}… presentes en un texto, sin repetir.
// Se devuelve la CANTIDAD real de distintas, no el número más alto: una
// plantilla con {{1}} y {{3}} está mal armada y no queremos mandar 3 valores.
function variablesDe(texto) {
  const nums = new Set();
  for (const m of String(texto).matchAll(/\{\{\s*(\d+)\s*\}\}/g)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

function ejemplosDe(body) {
  const ej = body?.example?.body_text;
  if (Array.isArray(ej) && Array.isArray(ej[0])) return ej[0].map((v) => String(v));
  return [];
}

// ── Handler HTTP ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY)
    return res.status(500).json({ error: "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY." });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "No autenticado." });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sesión inválida." });

  const cfg = configMeta();
  const wabaId = cfg.wabaId;
  const metaToken = process.env.META_WA_MANAGEMENT_TOKEN || cfg.token;

  // Sin configurar no es un error: la app cae a escribir el nombre a mano.
  if (!wabaId || !metaToken) {
    return res.status(200).json({
      disponible: false,
      motivo: !wabaId
        ? "Falta META_WHATSAPP_BUSINESS_ACCOUNT_ID en Vercel."
        : "Falta META_WA_MANAGEMENT_TOKEN en Vercel.",
      plantillas: [],
    });
  }

  const base = `https://graph.facebook.com/${cfg.version}`;
  const auth = { Authorization: `Bearer ${metaToken}` };

  try {
    const r = await fetch(
      `${base}/${wabaId}/message_templates?limit=200&fields=name,language,status,category,components`,
      { headers: auth }
    );
    const data = await r.json();

    if (!r.ok || data?.error) {
      const msg = data?.error?.message || `Meta respondió ${r.status}`;
      // El caso más común y el más confuso: el token de la Conversions API no
      // sirve para listar plantillas. Se dice explícito para no mandar a nadie
      // a revisar la plantilla cuando el problema es el permiso del token.
      const permiso = /permission|OAuth|whatsapp_business_management|\(#200\)|\(#10\)/i.test(msg);
      return res.status(200).json({
        disponible: false,
        motivo: permiso
          ? "El token no tiene el permiso whatsapp_business_management. Generá uno de un Usuario del Sistema con ese permiso y cargalo como META_WA_MANAGEMENT_TOKEN."
          : msg,
        plantillas: [],
      });
    }

    const plantillas = (data.data || [])
      .map(parsearPlantilla)
      .filter((p) => p.estado === "APPROVED" && CATEGORIAS_VALIDAS.has(p.categoria))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return res.status(200).json({
      disponible: true,
      plantillas,
      salud: await saludDelNumero(base, wabaId, auth),
    });
  } catch (e) {
    return res.status(200).json({
      disponible: false,
      motivo: "No se pudo consultar Meta: " + String(e?.message || e).slice(0, 200),
      plantillas: [],
    });
  }
}

// Calidad del número y tope de envío. Es lo que hay que mirar ANTES de un envío
// masivo: con la calidad en rojo, sumar cientos de mensajes promocionales es
// como pedir la suspensión. Si falla, se devuelve null y la UI no muestra nada
// — nunca bloquea el resto de la respuesta.
async function saludDelNumero(base, wabaId, auth) {
  try {
    const r = await fetch(
      `${base}/${wabaId}/phone_numbers?fields=display_phone_number,quality_rating,messaging_limit_tier,status`,
      { headers: auth }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const n = d?.data?.[0];
    if (!n) return null;
    return {
      numero: n.display_phone_number || "",
      calidad: n.quality_rating || "",      // GREEN | YELLOW | RED | UNKNOWN
      tope: n.messaging_limit_tier || "",   // TIER_250 | TIER_1K | TIER_10K | …
      estado: n.status || "",               // CONNECTED | FLAGGED | RESTRICTED
    };
  } catch {
    return null;
  }
}
