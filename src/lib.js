import { createClient } from "@supabase/supabase-js";
import { COLOR, GRAD, FONT } from "./theme";

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
