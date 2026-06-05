import { createClient } from "@supabase/supabase-js";

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

export const N8N_SEND_WEBHOOK = import.meta.env.VITE_N8N_SEND_WEBHOOK;

// Logo oficial de NINIT Group
export const LOGO_URL = "/logo.png";

// Marca
export const BRAND_NAME = "NINIT GROUP";
export const BRAND_TAGLINE = "Luxury Restroom Trailers";

// Equipo de ventas (NINIT). Editar según corresponda.
export const VENDEDORES = ["Nicolas"];

// ─── Roles ──────────────────────────────────────────────────
// NINIT lo maneja Nicolás: todos los usuarios autenticados ven todo.
export function getRol() {
  return "admin";
}

// ─── Estados del pipeline CRM ───────────────────────────────
export const ESTADOS = {
  nuevo:       { label: "Nuevo",        color: "#1e5a8a", bg: "#d6e8f5" },
  contactado:  { label: "Contactado",   color: "#1D4ED8", bg: "#DBEAFE" },
  interesado:  { label: "Interesado",   color: "#7C3AED", bg: "#EDE9FE" },
  pendiente:   { label: "Pendiente",    color: "#92400E", bg: "#FEF3C7" },
  vendido:     { label: "Vendido",      color: "#15803D", bg: "#DCFCE7" },
  perdido:     { label: "Perdido",      color: "#9b2c2c", bg: "#f5dcdc" },
  // Legacy
  en_conversacion: { label: "En conversación", color: "#1e5a8a", bg: "#d6e8f5" },
  pedido:      { label: "Pedido",       color: "#15803D", bg: "#DCFCE7" },
  cerrado:     { label: "Cerrado",      color: "#4a4a4a", bg: "#e3e3e3" },
};

// Paleta de marca NINIT (azul corporativo / blanco / grafito)
export const C = {
  red: "#3a8dc2",        // azul principal (del logo) — mantengo la clave "red" por compatibilidad con los componentes
  redDark: "#2c6e9c",    // azul oscuro
  gold: "#3a8dc2",       // acento = mismo azul (no hay dorado en NINIT)
  goldSoft: "#9fc6e0",
  cream: "#f4f6f8",      // fondo gris muy claro
  paper: "#ffffff",      // blanco limpio
  ink: "#1f2933",        // grafito texto
  charcoal: "#1a1d23",   // casi negro
  border: "#dde3e9",
  muted: "#7b8794",
  sage: "#2c8a6b",       // verde para acentos positivos
};

export const FONT_DISPLAY = "'Manrope', system-ui, sans-serif";
export const FONT_BODY = "'Inter', system-ui, sans-serif";

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
      alertas.push({ id: `resp-${c.id}`, tipo: "sin_respuesta", contacto: c,
        texto: `${nombre} espera respuesta hace más de 1 h`, prioridad: 1 });
    }
    if (c.estado === "nuevo" && !c.vendedor && ahora - new Date(c.created_at).getTime() > 2 * HORA) {
      alertas.push({ id: `lead-${c.id}`, tipo: "lead_sin_asignar", contacto: c,
        texto: `Lead nuevo sin asignar: ${nombre}`, prioridad: 2 });
    }
    if (c.seguimiento_at && new Date(c.seguimiento_at).getTime() <= ahora) {
      alertas.push({ id: `seg-${c.id}`, tipo: "seguimiento", contacto: c,
        texto: `Seguimiento pendiente: ${nombre}${c.nota_seguimiento ? " — " + c.nota_seguimiento : ""}`, prioridad: 1 });
    }
  }
  return alertas.sort((a, b) => a.prioridad - b.prioridad);
}
