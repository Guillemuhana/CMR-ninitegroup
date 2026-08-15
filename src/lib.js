import { createClient } from "@supabase/supabase-js";
import { COLOR, GRAD, FONT } from "./theme";
import { firmaWhatsApp, traducirErrorMeta } from "./promos";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "ninit-crm-session",
    },
  }
);

export const N8N_SEND_WEBHOOK        = import.meta.env.VITE_N8N_SEND_WEBHOOK;

// Lista de plantillas de WhatsApp aprobadas + salud del número.
//
// Va por n8n y no por una función de Vercel a propósito: el token de Meta con
// permiso `whatsapp_business_management` ya vive en n8n (es el mismo que usa
// "NINIT CRM - Send"), así que pedirlo desde ahí evita tener que cargar el token
// y el WABA id como variables de entorno en Vercel.
//
// El webhook es público. Devuelve sólo nombres y cuerpos de plantillas de
// marketing —lo mismo que el cliente recibe— y nunca el token ni datos de
// clientes, así que la exposición es baja.
export const N8N_PLANTILLAS_WEBHOOK  =
  import.meta.env.VITE_N8N_PLANTILLAS_WEBHOOK ||
  "https://ntg-group.app.n8n.cloud/webhook/ninit-crm-plantillas";
export const N8N_EMAIL_REPLY_WEBHOOK = import.meta.env.VITE_N8N_EMAIL_REPLY_WEBHOOK;

// ─── Canal de email: DESACTIVADO (decisión de negocio, 15/07/2026) ──────────
// Los dos workflows de email están caídos: "NINIT CRM - Gmail Sync" (entrada)
// está inactivo y el webhook de respuesta `ninit-crm-email-reply` no existe.
// Con esto en false el CRM no ofrece responder por email, en vez de aceptar el
// mensaje y fallar después — que hacía creer al vendedor que el cliente le
// había llegado la respuesta.
//
// Para reactivarlo: poner true y revivir los dos workflows (o construir el
// endpoint propio). El código de envío por email sigue intacto más abajo.
export const EMAIL_HABILITADO = false;
export const MESSENGER_SEND_ENDPOINT = import.meta.env.VITE_MESSENGER_SEND_ENDPOINT || "/api/messenger-send";
export const ELEVENLABS_KEY          = import.meta.env.VITE_ELEVENLABS_API_KEY;
export const ELEVENLABS_VOICE_ID     = import.meta.env.VITE_ELEVENLABS_VOICE_ID || "ErXwobaYiN019PkySvjV";

// Logo oficial de NINIT Group
export const LOGO_URL = "/cmrlogo.png";

// Marca
export const BRAND_NAME = "NINIT GROUP";
export const BRAND_TAGLINE = "Luxury Restroom Trailers";

// Equipo de ventas — se carga dinámicamente desde la DB.
// Este array se usa como fallback y como lista para selects.
export const VENDEDORES = ["Nicolas"];

// ─── Roles ──────────────────────────────────────────────────
// Roles posibles: 'ceo' | 'vendedor'
// El perfil se carga desde la tabla vendedores por email tras login.
export function getRol(perfil) {
  return perfil?.role || "vendedor";
}

// Carga el perfil del vendedor logueado desde la DB
export async function cargarPerfil(email) {
  if (!email) return null;
  // limit(1) en vez de .single() para no devolver null si hay filas duplicadas.
  const { data } = await supabase
    .from("vendedores")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .limit(1);
  return (data && data[0]) || null;
}

// Formatea segundos en texto legible
export function fmtDuracion(seg) {
  if (!seg || seg < 60) return "< 1 min";
  const m = Math.floor(seg / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 > 0 ? (m % 60) + "m" : ""}`.trim();
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

// ─── Estados del pipeline CRM ───────────────────────────────
export const ESTADOS = {
  nuevo:       { label: "Lead Nuevo",          color: "#1e5a8a", bg: "#d6e8f5" },
  contactado:  { label: "Contactado",          color: "#1D4ED8", bg: "#DBEAFE" },
  interesado:  { label: "Interesado",          color: "#7C3AED", bg: "#EDE9FE" },
  cotizacion:  { label: "Cotización Enviada",  color: "#9333EA", bg: "#F3E8FF" },
  negociando:  { label: "Negociando",          color: "#D97706", bg: "#FEF9C3" },
  pendiente:   { label: "Pendiente",           color: "#92400E", bg: "#FEF3C7" },
  vendido:     { label: "Cerrado ✓",           color: "#15803D", bg: "#DCFCE7" },
  perdido:     { label: "Perdido",             color: "#9b2c2c", bg: "#f5dcdc" },
  // Legacy
  en_conversacion: { label: "En conversación", color: "#1e5a8a", bg: "#d6e8f5" },
  pedido:      { label: "Pedido",              color: "#15803D", bg: "#DCFCE7" },
  cerrado:     { label: "Cerrado",             color: "#4a4a4a", bg: "#e3e3e3" },
};

// ─── Financiamiento (Ascentium Capital) ─────────────────────
// Las claves son las que se guardan en la tabla `financiamiento` (en inglés,
// que es el vocabulario del CEO y del socio financiero); el label es lo que ve
// el vendedor en la app. El orden es el del recorrido real de una solicitud.
export const ESTADOS_FIN = {
  financing_offered:     { label: "Financiamiento ofrecido",    color: "#1D4ED8", bg: "#DBEAFE" },
  link_sent:             { label: "Link enviado",               color: "#7C3AED", bg: "#EDE9FE" },
  customer_reviewing:    { label: "Cliente evaluando",          color: "#9333EA", bg: "#F3E8FF" },
  application_started:   { label: "Solicitud iniciada",         color: "#D97706", bg: "#FEF9C3" },
  application_submitted: { label: "Solicitud presentada",       color: "#0E7490", bg: "#CFFAFE" },
  approved:              { label: "Aprobado",                   color: "#15803D", bg: "#DCFCE7" },
  info_required:         { label: "Falta información",          color: "#92400E", bg: "#FEF3C7" },
  declined:              { label: "Rechazado",                  color: "#9b2c2c", bg: "#f5dcdc" },
  funded:                { label: "Desembolsado ✓",             color: "#15803D", bg: "#BBF7D0" },
  closed_not_interested: { label: "Cerrado / ya no interesa",   color: "#4a4a4a", bg: "#e3e3e3" },
};

// Socio financiero por defecto (hoy el único).
export const SOCIO_FIN = "Ascentium Capital";

// Link de la solicitud de financiamiento (Ascentium Capital / iCalc).
// Es el único lugar donde vive el link: cambiándolo acá se actualiza el botón del
// chat, el texto de la cotización y los mensajes de seguimiento.
export const LINK_FIN = "https://icalcpayment.com/customericalc/99c2d069-0666-4798-8c3d-8d32787b0d5f";

// Paleta de marca NINIT — deriva de src/theme.js (fuente única de tokens).
// Las claves se mantienen tal cual (incluida "red", que hoy es azul y viene de
// una marca anterior) porque las leen ~1.100 estilos inline. Renombrarlas es
// trabajo de la fase de componentes; el color ya se controla desde theme.js.
export const C = {
  red: COLOR.primary,        // color de acción principal
  redDark: COLOR.primaryDark,
  gold: COLOR.primary,       // acento = mismo primario (no hay dorado en NINIT)
  goldSoft: COLOR.primarySoft,
  cream: COLOR.canvas,
  paper: COLOR.surface,
  ink: COLOR.ink,
  charcoal: COLOR.navBg,
  border: COLOR.border,
  muted: COLOR.inkMuted,
  sage: COLOR.success,
  // ── Acentos "IA" ──────────────────────────────────────────
  ai: COLOR.ai,
  aiSoft: COLOR.aiSoft,
  gradAI: GRAD.ai,
  gradBtn: GRAD.btn,
};

export const FONT_DISPLAY = FONT.display;
export const FONT_BODY = FONT.body;

// ============================================================
// ENVÍO POR CANAL — única salida de mensajes del CRM
// ============================================================
// Lo usan el chat (src/App.jsx) y las promociones masivas
// (src/Promociones.jsx). Antes esta lógica vivía suelta dentro del componente
// del chat; se extrajo acá para que un cambio de ruteo (un canal nuevo, un
// endpoint que se muda) no haya que hacerlo en dos lugares y quede uno viejo.
//
// NO guarda nada en Supabase: solo entrega el mensaje al canal. Guardar en
// `mensajes` es responsabilidad de quien llama, porque el chat y las campañas
// necesitan guardar cosas distintas.

// Las reglas puras (ventana de 24 h, plan de envío, personalización, traducción
// de errores de Meta) viven en ./promos.js para que `npm test` pueda importarlas
// sin arrastrar el cliente de Supabase. Se re-exportan acá para que los
// componentes sigan importando todo desde "./lib".
export {
  VENTANA_MS, dentroDeVentana, planDeEnvio, firmaWhatsApp, personalizar,
  parsearPlantilla, plantillasUsables, CATEGORIAS_PLANTILLA,
} from "./promos";

// Devuelve { ok, error }. `error` es texto listo para mostrarle a una persona.
//
// `plantilla` (opcional, solo WhatsApp): { nombre, idioma, params: [] }. Si
// viene, se manda el template aprobado en vez del texto libre — es la única
// forma de alcanzar a un contacto fuera de la ventana de 24 h.
export async function enviarPorCanal({ contacto, cuerpo, agente, plantilla = null }) {
  const canal = contacto?.canal || "whatsapp";
  const esEmail = canal === "email" || canal === "google_ads";

  if (esEmail && !EMAIL_HABILITADO)
    return { ok: false, canal, error: "El canal de email está desactivado." };

  if (esEmail) {
    if (!N8N_EMAIL_REPLY_WEBHOOK)
      return { ok: false, canal, error: "Falta configurar el webhook de email." };
    try {
      const res = await fetch(N8N_EMAIL_REPLY_WEBHOOK, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contacto.email, nombre: contacto.nombre, mensaje: cuerpo, agente }),
      });
      if (!res.ok) return { ok: false, canal, error: "Falló el envío del email." };
      return { ok: true, canal, error: null };
    } catch {
      return { ok: false, canal, error: "No se pudo conectar con el servicio de email." };
    }
  }

  if (canal === "messenger") {
    const messengerId = contacto.messenger_id || contacto.telefono;
    if (!MESSENGER_SEND_ENDPOINT)
      return { ok: false, canal, error: "Falta configurar el endpoint de Messenger." };
    if (!messengerId)
      return { ok: false, canal, error: "Falta el identificador de Messenger del contacto." };
    try {
      const res = await fetch(MESSENGER_SEND_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacto_id: contacto.id, messenger_id: messengerId,
          mensaje: cuerpo, agente, nombre: contacto.nombre || "",
        }),
      });
      if (!res.ok) {
        const detalle = await leerError(res);
        return { ok: false, canal, error: detalle || "Falló el envío por Messenger." };
      }
      return { ok: true, canal, error: null };
    } catch {
      return { ok: false, canal, error: "No se pudo conectar con Messenger." };
    }
  }

  // WhatsApp
  if (!N8N_SEND_WEBHOOK)
    return { ok: false, canal, error: "Falta configurar el webhook de WhatsApp." };
  if (!contacto.telefono)
    return { ok: false, canal, error: "El contacto no tiene teléfono." };
  try {
    // `mensaje` va SIEMPRE, incluso cuando se manda una plantilla: n8n arma el
    // pedido a Meta con `plantilla` pero registra `mensaje` en el historial.
    // Va firmado para que ese registro sea el mismo eco que el chat ya sabe
    // ocultar (ECHO_PREFIX_RE) y no aparezca duplicado en la conversación.
    const body = { telefono: contacto.telefono, mensaje: firmaWhatsApp(agente, cuerpo), agente };
    if (plantilla) body.plantilla = plantilla;
    const res = await fetch(N8N_SEND_WEBHOOK, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detalle = await leerError(res);
      return { ok: false, canal, error: detalle || "Falló el envío por WhatsApp." };
    }
    // El workflow de n8n responde { ok, error }. Antes respondía { ok: true }
    // siempre, incluso cuando Meta rechazaba el mensaje — por eso acá se mira el
    // cuerpo y no solo el status HTTP. Si un n8n viejo no manda `ok`, se asume
    // que salió bien (comportamiento anterior) en vez de romper el chat.
    const data = await res.json().catch(() => null);
    if (data && data.ok === false)
      return { ok: false, canal, error: traducirErrorMeta(data.error) };
    return { ok: true, canal, error: null };
  } catch {
    return { ok: false, canal, error: "No se pudo conectar con WhatsApp." };
  }
}

async function leerError(res) {
  try {
    const t = await res.text();
    return t ? t.slice(0, 300) : "";
  } catch { return ""; }
}

// ---------- Utilidades de fecha ----------
export function rangoFechas(periodo) {
  const ahora = new Date();
  const fin = new Date(ahora);
  const inicio = new Date(ahora);
  if (periodo === "dia") {
    inicio.setHours(0, 0, 0, 0);
  } else if (periodo === "semana") {
    inicio.setDate(inicio.getDate() - 6);
    inicio.setHours(0, 0, 0, 0);
  } else if (periodo === "mes") {
    inicio.setDate(inicio.getDate() - 29);
    inicio.setHours(0, 0, 0, 0);
  } else if (periodo === "anio") {
    inicio.setMonth(0, 1);
    inicio.setHours(0, 0, 0, 0);
  }
  return { inicio, fin };
}

export function fmtFecha(d) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
export function fmtFechaLarga(d) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}
export function fmtMoneda(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}

// ---------- Exportación CSV ----------
export function exportarCSV(filas, nombreArchivo) {
  if (!filas || filas.length === 0) return;
  const cols = Object.keys(filas[0]);
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    cols.join(";"),
    ...filas.map((f) => cols.map((c) => escape(f[c])).join(";")),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  descargar(blob, nombreArchivo.endsWith(".csv") ? nombreArchivo : nombreArchivo + ".csv");
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Alertas ----------
export function calcularAlertas(contactos) {
  const ahora = Date.now();
  const HORA = 3600 * 1000;
  const alertas = [];
  for (const c of contactos) {
    const nombre = c.nombre || c.telefono;
    if (
      !c.bot_activo &&
      c.ultimo_in_at &&
      (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at)) &&
      ahora - new Date(c.ultimo_in_at).getTime() > HORA
    ) {
      // El id incluye ultimo_in_at: si el cliente vuelve a escribir, es una alerta NUEVA
      // (aunque se haya descartado la anterior).
      alertas.push({ id: `resp-${c.id}-${c.ultimo_in_at}`, tipo: "sin_respuesta", contacto: c,
        texto: `${nombre} espera respuesta hace más de 1 h`, prioridad: 1 });
    }
    if (c.estado === "nuevo" && !c.vendedor && ahora - new Date(c.created_at).getTime() > 2 * HORA) {
      alertas.push({ id: `lead-${c.id}`, tipo: "lead_sin_asignar", contacto: c,
        texto: `Lead nuevo sin asignar: ${nombre}`, prioridad: 2 });
    }
    if (c.seguimiento_at && new Date(c.seguimiento_at).getTime() <= ahora) {
      // El id incluye seguimiento_at: si se reprograma el seguimiento, es una alerta nueva.
      alertas.push({ id: `seg-${c.id}-${c.seguimiento_at}`, tipo: "seguimiento", contacto: c,
        texto: `Seguimiento pendiente: ${nombre}${c.nota_seguimiento ? " — " + c.nota_seguimiento : ""}`, prioridad: 1 });
    }
  }
  return alertas.sort((a, b) => a.prioridad - b.prioridad);
}
