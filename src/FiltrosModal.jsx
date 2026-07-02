// ============================================================
// FILTRADO INTELIGENTE DE LEADS — Modal de filtros avanzados
// ============================================================
// Consume los metadatos que /api/analizar.js extrae con Groq y que quedan
// persistidos en columnas ia_* de `contactos` (ver SQL en el PR).
// Como App.jsx ya carga TODOS los contactos en memoria y filtra client-side,
// estos filtros corren instantáneos: solo leen columnas ya cargadas.
//
// Exporta:
//   - FILTROS_INICIAL        estado por defecto (todo en "todos")
//   - contarActivos(f)       cuántos filtros están aplicados (para el badge del botón)
//   - aplicaFiltrosIA(c, f)  predicado puro → se combina en el .filter() del Sidebar
//   - analizarContacto(c)    llama al backend y guarda los ia_* en Supabase
//   - FiltrosModal           el modal en sí
//
// Estilo: inline styles + tokens del proyecto (C, FONT_DISPLAY, FONT_BODY de ./lib).

import { useState } from "react";
import {
  X, MapPin, TrendingUp, PhoneCall, Zap, Smile, GitBranch,
  DollarSign, Radio, Clock, ChevronDown, RotateCcw, Sparkles, Check,
} from "lucide-react";
import { supabase, C, FONT_DISPLAY, FONT_BODY } from "./lib";

// Paleta clara local (espejo de L en App.jsx; lib no la exporta).
const P = {
  white: "#FFFFFF", border: "#E4E8ED", text: "#0F172A",
  muted: "#64748B", light: "#94A3B8", soft: "#F1F5F9",
};

// Canales reales del CRM (mismos que CANALES en App.jsx).
const CANALES_OPT = [
  { key: "todos",      label: "Todos" },
  { key: "whatsapp",   label: "WhatsApp",   color: "#25D366" },
  { key: "messenger",  label: "Messenger",  color: "#0084FF" },
  { key: "email",      label: "Gmail",      color: "#EA4335" },
  { key: "google_ads", label: "Google Ads", color: "#4285F4" },
];

// Opciones con color de badge. `color`=texto, `bg`=fondo.
const NIVEL = [
  { key: "todos",    label: "Todos" },
  { key: "bajo",     label: "Bajo",              color: "#64748B", bg: "#F1F5F9" },
  { key: "medio",    label: "Medio",             color: "#B45309", bg: "#FEF3C7" },
  { key: "avanzado", label: "Avanzado · Lead",   color: "#15803D", bg: "#DCFCE7" },
];
const INTENCION = [
  { key: "todos",              label: "Todas" },
  { key: "llamada_telefonica", label: "Llamada",         color: "#1D4ED8", bg: "#DBEAFE" },
  { key: "agente_ventas",      label: "Hablar c/ Ventas", color: "#7C3AED", bg: "#F3E8FF" },
  { key: "soporte_tecnico",    label: "Soporte",         color: "#0E7490", bg: "#CFFAFE" },
];
const URGENCIA = [
  { key: "todos",          label: "Todas" },
  { key: "baja",           label: "Baja",           color: "#15803D", bg: "#DCFCE7" },
  { key: "media",          label: "Media",          color: "#B45309", bg: "#FEF3C7" },
  { key: "alta_prioridad", label: "🔥 Alta prioridad", color: "#B91C1C", bg: "#FEE2E2" },
];
const SENTIMIENTO = [
  { key: "todos",      label: "Todos" },
  { key: "entusiasta", label: "Entusiasta", color: "#15803D", bg: "#DCFCE7" },
  { key: "neutral",    label: "Neutral",    color: "#64748B", bg: "#F1F5F9" },
  { key: "frustrado",  label: "Frustrado",  color: "#C2410C", bg: "#FFEDD5" },
  { key: "enojado",    label: "Enojado",    color: "#B91C1C", bg: "#FEE2E2" },
];
const ETAPA = [
  { key: "todos",       label: "Todas" },
  { key: "prospeccion", label: "Prospección", color: "#64748B", bg: "#F1F5F9" },
  { key: "calificacion",label: "Calificación",color: "#1D4ED8", bg: "#DBEAFE" },
  { key: "propuesta",   label: "Propuesta",   color: "#7C3AED", bg: "#F3E8FF" },
  { key: "cierre",      label: "Cierre",      color: "#B45309", bg: "#FEF3C7" },
  { key: "postventa",   label: "Postventa",   color: "#15803D", bg: "#DCFCE7" },
];
const ACTIVIDAD = [
  { key: "todas",         label: "Cualquiera" },
  { key: "hoy",           label: "Activos hoy" },
  { key: "sinresponder2", label: "Sin responder +2h" },
  { key: "sinresponder6", label: "Sin responder +6h" },
  { key: "sinresponder24",label: "Sin responder +24h" },
];

export const FILTROS_INICIAL = {
  ciudad: "",
  estadoProvincia: "",
  nivelInteres: "todos",
  intencion: "todos",
  urgencia: "todos",
  sentimiento: "todos",
  etapa: "todos",
  presupuestoMin: "",
  presupuestoMax: "",
  canal: "todos",
  actividad: "todas",
};

// Cuántos filtros hay activos (para el badge del botón "Filtros").
export function contarActivos(f) {
  let n = 0;
  if (f.ciudad.trim()) n++;
  if (f.estadoProvincia.trim()) n++;
  if (f.nivelInteres !== "todos") n++;
  if (f.intencion !== "todos") n++;
  if (f.urgencia !== "todos") n++;
  if (f.sentimiento !== "todos") n++;
  if (f.etapa !== "todos") n++;
  if (f.presupuestoMin || f.presupuestoMax) n++;
  if (f.canal !== "todos") n++;
  if (f.actividad !== "todas") n++;
  return n;
}

const HORA = 3600000;
function horasSinResponder(c) {
  // Espera = un humano debe responder (bot inactivo). Reusa la lógica de App.jsx.
  if (!c.ultimo_in_at || c.bot_activo) return null;
  if (c.ultimo_out_at) {
    const diff = new Date(c.ultimo_in_at).getTime() - new Date(c.ultimo_out_at).getTime();
    if (diff <= 90000) return null; // ya respondido
  }
  return (Date.now() - new Date(c.ultimo_in_at).getTime()) / HORA;
}
function esDeHoy(c) {
  if (!c.updated_at) return false;
  return new Date(c.updated_at).toDateString() === new Date().toDateString();
}

// Predicado puro: ¿el contacto pasa los filtros avanzados?
export function aplicaFiltrosIA(c, f) {
  const inc = (a, b) => (a || "").toLowerCase().includes(b.trim().toLowerCase());
  if (f.ciudad.trim() && !inc(c.ia_ciudad, f.ciudad)) return false;
  if (f.estadoProvincia.trim() && !inc(c.ia_estado_provincia, f.estadoProvincia)) return false;
  if (f.nivelInteres !== "todos" && c.ia_nivel_interes !== f.nivelInteres) return false;
  if (f.intencion !== "todos" && c.ia_intencion !== f.intencion) return false;
  if (f.urgencia !== "todos" && c.ia_urgencia !== f.urgencia) return false;
  if (f.sentimiento !== "todos" && c.ia_sentimiento !== f.sentimiento) return false;
  if (f.etapa !== "todos" && c.ia_etapa !== f.etapa) return false;

  const min = parseFloat(f.presupuestoMin), max = parseFloat(f.presupuestoMax);
  if ((f.presupuestoMin || f.presupuestoMax)) {
    const v = c.ia_presupuesto_valor;
    if (v == null) return false;
    if (!isNaN(min) && v < min) return false;
    if (!isNaN(max) && v > max) return false;
  }

  if (f.canal !== "todos") {
    const canal = c.canal || "whatsapp";
    if (canal !== f.canal) return false;
  }

  if (f.actividad !== "todas") {
    if (f.actividad === "hoy" && !esDeHoy(c)) return false;
    if (f.actividad.startsWith("sinresponder")) {
      const h = horasSinResponder(c);
      const min = { sinresponder2: 2, sinresponder6: 6, sinresponder24: 24 }[f.actividad];
      if (h == null || h < min) return false;
    }
  }
  return true;
}

// Llama al backend Groq y persiste los metadatos en `contactos` (columnas ia_*).
// `mensajes` = array del chat (mismo shape que usa resumen.js).
export async function analizarContacto(contacto, mensajes) {
  const r = await fetch("/api/analizar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensajes }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "Error al analizar.");
  const m = data.metadata;

  const cambios = {
    ia_ciudad: m.ubicacion.ciudad || null,
    ia_estado_provincia: m.ubicacion.estado_provincia || null,
    ia_pais: m.ubicacion.pais || null,
    ia_nivel_interes: m.nivel_interes,
    ia_intencion: m.intencion_contacto,
    ia_urgencia: m.urgencia,
    ia_sentimiento: m.sentimiento_cliente,
    ia_etapa: m.etapa_embudo,
    ia_presupuesto_texto: m.presupuesto_estimado != null ? String(m.presupuesto_estimado) : null,
    ia_presupuesto_valor: m.presupuesto_valor,
    ia_resumen: m.resumen_interes || null,
    ia_analizado_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("contactos").update(cambios).eq("id", contacto.id);
  if (error) throw error;
  return cambios;
}

// ── UI primitives ───────────────────────────────────────────

function Seccion({ icon, titulo, activo, children, abiertoInit = false }) {
  const [open, setOpen] = useState(abiertoInit);
  return (
    <div style={{ borderBottom: `1px solid ${P.border}` }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 4px", background: "none", border: "none", cursor: "pointer", fontFamily: FONT_DISPLAY }}>
        <span style={{ color: C.red, display: "flex" }}>{icon}</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 13.5, fontWeight: 800, color: P.text, letterSpacing: 0.2 }}>{titulo}</span>
        {activo && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EF4444" }} />}
        <ChevronDown size={16} color={P.light} style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && <div style={{ padding: "2px 4px 15px" }}>{children}</div>}
    </div>
  );
}

// Grupo de chips seleccionables (single select). value/onChange + opciones con color.
function Chips({ value, onChange, opciones }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {opciones.map((o) => {
        const sel = value === o.key;
        const col = o.color || P.muted;
        const bg = o.bg || P.soft;
        return (
          <button key={o.key} onClick={() => onChange(o.key)}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9,
              fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY,
              border: sel ? `1.5px solid ${col}` : `1.5px solid ${P.border}`,
              background: sel ? bg : P.white, color: sel ? col : P.muted,
              boxShadow: sel ? `0 1px 4px ${col}22` : "none", transition: "all .15s",
            }}>
            {sel && <Check size={13} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Modal principal ─────────────────────────────────────────

export default function FiltrosModal({ filtros, setFiltros, onClose }) {
  // Estado local: se aplica al confirmar (evita re-render de toda la lista en cada tecla).
  const [f, setF] = useState(filtros);
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const activos = contarActivos(f);

  const aplicar = () => { setFiltros(f); onClose(); };
  const limpiar = () => setF(FILTROS_INICIAL);

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", background: P.white, borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 70px rgba(15,23,42,.35)", fontFamily: FONT_BODY }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", background: C.gradAI || "linear-gradient(135deg,#3A8DC2,#7C3AED)", color: "#fff", display: "flex", alignItems: "center", gap: 11 }}>
          <Sparkles size={19} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: 0.3 }}>Filtrado inteligente</div>
            <div style={{ fontSize: 11.5, opacity: 0.85 }}>Metadatos extraídos por IA de cada conversación</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.18)", border: "none", borderRadius: 9, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}><X size={17} /></button>
        </div>

        {/* Body scrollable */}
        <div className="scroll-y" style={{ overflowY: "auto", padding: "4px 18px", flex: 1 }}>

          <Seccion icon={<MapPin size={16} />} titulo="Ubicación geográfica" abiertoInit
            activo={!!(f.ciudad.trim() || f.estadoProvincia.trim())}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={f.ciudad} onChange={(e) => set({ ciudad: e.target.value })} placeholder="Ciudad (ej. Miami)"
                style={inp} />
              <input value={f.estadoProvincia} onChange={(e) => set({ estadoProvincia: e.target.value })} placeholder="Estado / Provincia"
                style={inp} />
            </div>
          </Seccion>

          <Seccion icon={<TrendingUp size={16} />} titulo="Nivel de interés" activo={f.nivelInteres !== "todos"}>
            <Chips value={f.nivelInteres} onChange={(v) => set({ nivelInteres: v })} opciones={NIVEL} />
          </Seccion>

          <Seccion icon={<PhoneCall size={16} />} titulo="Intención de acción" activo={f.intencion !== "todos"}>
            <Chips value={f.intencion} onChange={(v) => set({ intencion: v })} opciones={INTENCION} />
          </Seccion>

          <Seccion icon={<Zap size={16} />} titulo="Nivel de urgencia" activo={f.urgencia !== "todos"}>
            <Chips value={f.urgencia} onChange={(v) => set({ urgencia: v })} opciones={URGENCIA} />
          </Seccion>

          <Seccion icon={<Smile size={16} />} titulo="Sentimiento del lead" activo={f.sentimiento !== "todos"}>
            <Chips value={f.sentimiento} onChange={(v) => set({ sentimiento: v })} opciones={SENTIMIENTO} />
          </Seccion>

          <Seccion icon={<GitBranch size={16} />} titulo="Etapa del embudo" activo={f.etapa !== "todos"}>
            <Chips value={f.etapa} onChange={(v) => set({ etapa: v })} opciones={ETAPA} />
          </Seccion>

          <Seccion icon={<DollarSign size={16} />} titulo="Rango de presupuesto (USD)" activo={!!(f.presupuestoMin || f.presupuestoMax)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min="0" value={f.presupuestoMin} onChange={(e) => set({ presupuestoMin: e.target.value })} placeholder="Mín" style={inp} />
              <span style={{ color: P.light }}>—</span>
              <input type="number" min="0" value={f.presupuestoMax} onChange={(e) => set({ presupuestoMax: e.target.value })} placeholder="Máx" style={inp} />
            </div>
            <div style={{ fontSize: 11, color: P.light, marginTop: 6 }}>Solo muestra chats donde la IA detectó un monto.</div>
          </Seccion>

          <Seccion icon={<Radio size={16} />} titulo="Canal de origen" activo={f.canal !== "todos"}>
            <Chips value={f.canal} onChange={(v) => set({ canal: v })} opciones={CANALES_OPT} />
          </Seccion>

          <Seccion icon={<Clock size={16} />} titulo="Última actividad" activo={f.actividad !== "todas"}>
            <Chips value={f.actividad} onChange={(v) => set({ actividad: v })} opciones={ACTIVIDAD} />
          </Seccion>
        </div>

        {/* Footer */}
        <div style={{ padding: "13px 18px", borderTop: `1px solid ${P.border}`, display: "flex", gap: 10, alignItems: "center", background: P.soft }}>
          <button onClick={limpiar}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${P.border}`, background: P.white, color: P.muted, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY }}>
            <RotateCcw size={14} /> Limpiar
          </button>
          <button onClick={aplicar}
            style={{ flex: 1, padding: "11px 16px", borderRadius: 10, border: "none", background: C.gradAI || "linear-gradient(135deg,#3A8DC2,#7C3AED)", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: FONT_DISPLAY, letterSpacing: 0.3, boxShadow: "0 4px 14px rgba(58,141,194,.3)" }}>
            Aplicar {activos > 0 ? `(${activos})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9,
  border: `1.5px solid ${P.border}`, fontSize: 13, fontFamily: FONT_BODY,
  background: P.white, color: P.text, outline: "none",
};
