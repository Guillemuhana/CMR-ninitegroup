// v2.1 — 2026-06-08
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, Search, LogOut, MessageSquare, BarChart2, Package,
  Pencil, Bot, User, Calendar, Send, X, Check,
  Sparkles, Phone, Mail, Building2, MapPin, FileText,
  AlertCircle, Clock, ChevronDown, ChevronLeft, Zap, ShoppingBag, Shield, Trash2,
  BookOpen, Activity, Mic, MicOff, Volume2, VolumeX, Menu, Users, Eye, EyeOff,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { SiGmail, SiGoogleads, SiMessenger } from "react-icons/si";
import PedidosPanel, { NuevoPedidoModal, imprimirPedido } from "./Pedidos";
import {
  supabase, N8N_SEND_WEBHOOK, N8N_EMAIL_REPLY_WEBHOOK, MESSENGER_SEND_ENDPOINT, LOGO_URL, C, FONT_DISPLAY, FONT_BODY,
  VENDEDORES, ESTADOS, calcularAlertas, getRol, cargarPerfil,
  ELEVENLABS_KEY, ELEVENLABS_VOICE_ID,
} from "./lib";
import Reportes from "./Reportes";
import AdminPanel from "./AdminPanel";
import DiarioVendedor from "./DiarioVendedor";
import CEODashboard from "./CEODashboard";
import Directorio from "./Directorio";

// ============================================================
// PALETA LIGHT — tema claro profesional
// ============================================================
const L = {
  bg:     "#F5F6F8",
  white:  "#FFFFFF",
  border: "#E4E8ED",
  text:   "#0F172A",
  muted:  "#64748B",
  light:  "#94A3B8",
  soft:   "#F1F5F9",
  hover:  "#FEF2F2",
  active: "#FFF1F0",
};

// Avatares — colores consistentes por nombre
const AVT = [
  ["#B91C1C","#fff"],["#1D4ED8","#fff"],["#15803D","#fff"],
  ["#7C3AED","#fff"],["#B45309","#fff"],["#0E7490","#fff"],
  ["#9D174D","#fff"],["#374151","#fff"],["#C2410C","#fff"],
  ["#1E40AF","#fff"],
];

// ── Tiempo de respuesta ─────────────────────────────────────
function msToStr(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 > 0 ? (m % 60) + "m" : ""}`.trim();
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function tiempoClr(ms) {
  const m = ms / 60000;
  if (m < 10) return "#16A34A";
  if (m < 30) return "#D97706";
  if (m < 120) return "#EA580C";
  return "#DC2626";
}
function calcEspera(c) {
  if (!c.ultimo_in_at) return null;
  const enEspera = !c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at);
  if (!enEspera) return null;
  return Date.now() - new Date(c.ultimo_in_at).getTime();
}

// ============================================================
// MOBILE HOOK
// ============================================================
function useIsMobile(bp = 768) {
  const [v, setV] = useState(() => window.innerWidth < bp);
  useEffect(() => {
    const h = () => setV(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return v;
}

// Prompt del sistema para el Asistente IA
const GROK_SYSTEM = `Sos el Asistente Ejecutivo del equipo de ventas de NINIT GROUP (NTG) dentro del CRM. Trabajás codo a codo con quien esté logueado — sea Nico (CEO) o cualquier vendedor del equipo — como un especialista de máximo rendimiento: proactivo, preciso con los datos del negocio, siempre un paso adelante.

════ POSICIONAMIENTO DE LA EMPRESA ════
NINIT GROUP / NTG es una empresa con base en USA que trabaja con fabricantes seleccionados para vender y alquilar restroom trailers (remolques sanitarios) en todo el país, con foco fuerte en Miami, Florida. NTG da soporte local, coordinación logística, guía de documentación, inspección y entrega nacional.
NUNCA decir: "nosotros fabricamos", "nuestra fábrica", "made in USA".
SÍ decir: "trailers construidos por fabricantes seleccionados", "soporte con base en USA".
Web: ninitgroup.com · Email: sales@ninitgroup.com · WhatsApp: +1 786 385 9402.

════ CATÁLOGO Y PRECIOS OFICIALES (venta) ════
- 2-Stall   → USD 21,500
- 3-Stall   → USD 25,500  (el más popular, mejor balance)
- ADA + 2   → USD 28,500  (cumplimiento federal ADA)
- 4-Stall   → USD 31,500  (festivales / alto flujo)
Estos precios incluyen: producción, logística internacional, entrega al hub logístico de NTG más cercano, ensamblado, inspección y preparación para operar.
Catálogo: https://ninitgroup.com/wp-content/uploads/2026/04/NINITGROUP_CATALOG.pdf

ALQUILER: también disponible. Precio según fecha, modelo y duración del evento — se cotiza puntualmente.

════ HUBS LOGÍSTICOS Y ENVÍO FINAL ════
Hubs de NTG: Miami · Texas · Long Beach.
El envío final (hub → dirección del cliente) se estima aparte, aproximadamente USD 3.50 por milla desde el hub más cercano al ZIP code del cliente.
Lógica para estimar: 1) tomar el ZIP del cliente, 2) determinar el hub más cercano (Miami / Texas / Long Beach), 3) estimar la distancia en millas, 4) multiplicar por ~$3.50.
SIEMPRE presentarlo como estimado — nunca como precio exacto. Usar palabras como "estimado", "aproximadamente", "dependiendo de la ruta y el cronograma". Nunca inventar "envío gratis" salvo que Nico lo confirme explícitamente para un caso puntual.
Ejemplo correcto: "Para el ZIP 33166 lo despacharíamos desde el hub de Miami. El envío final sería aproximadamente $___, dependiendo de ruta y cronograma."

════ PLAZOS DE ENTREGA ════
Producción: aprox. 2–3 semanas. Entrega total estimada: 45–60 días aprox., según destino, logística, cronograma de envío y configuración del trailer. Nunca prometer una fecha exacta.

════ PAGO, IMPUESTOS Y DOCUMENTACIÓN ════
Estructura de pago estándar: 50% depósito para iniciar producción + 50% antes del despacho.
El cliente paga registro e impuestos directamente en su estado al registrar la unidad. NTG provee: Bill of Sale, MCO/MSO y soporte con la documentación del VIN.

════ GARANTÍA Y FINANCIAMIENTO ════
Garantía: 12 meses de fábrica. No prometer cobertura mayor salvo confirmación explícita de Nico.
NTG no financia directamente. Respuesta correcta: "Trabajamos con socios de financiamiento y podemos guiarlos en las opciones disponibles."

════ SHOWROOM Y FEATURES ════
No hay showroom tradicional — la mayoría de las unidades se construyen a pedido, pero se pueden compartir fotos, videos, layouts y avances de producción reales.
Features estándar: A/C, luces LED, inodoros con descarga, lavamanos, espejos, tanques de agua limpia/residual, sistema de bomba de agua, freno eléctrico, escalones plegables, gatos estabilizadores, pasamanos. No abrumar con detalle técnico salvo que lo pidan.

════ PIPELINE DE VENTAS (estados del CRM) ════
Lead Nuevo → Contactado → Interesado → Cotización Enviada → Negociando → Pendiente → Cerrado ✓ / Perdido

════ LEADS DE META ADS ════
- Son prospectos calientes — ya vieron el anuncio y se interesaron.
- Responder RÁPIDO (idealmente dentro de 5 min) aumenta mucho la tasa de cierre.
- Calificar con una pregunta a la vez: ¿compra o alquiler? · fecha del evento · ZIP/ciudad · cantidad de baños o personas.
- Si no responden → follow-up a las 24h y a las 72h.

════ LEADS CALIENTES → ESCALAR A NICO ════
Marcar como prioridad para Nico cuando el cliente: está listo para comprar · pide financiamiento · quiere múltiples unidades · pide contrato · es un proyecto custom · es una consulta de municipalidad/gobierno · maneja presupuesto arriba de USD 50,000.

════ REDACCIÓN DE MENSAJES PARA CLIENTES ════
Cuando te pidan redactar o traducir un mensaje para un cliente (WhatsApp, Messenger, email):
- Si el cliente escribió primero en inglés, redactá en inglés. Si escribió en español, redactá en español. No mezclar idiomas sin necesidad.
- Sonar como un vendedor profesional real de WhatsApp: calmo, natural, profesional, conversacional, confiable. NUNCA robótico, corporativo, desesperado o sobrevendiendo.
- Conciso: 1–3 párrafos cortos, respuesta directa, una sola pregunta de seguimiento útil si corresponde. Responder solo lo que el cliente preguntó.
- Evitar lenguaje de folleto de lujo repetido ("exclusive", "premium experience", "elite", "high-end") — sonar experimentado y claro, no una propaganda.

════ TU ROL EN EL CRM ════
- Ayudar a cerrar más ventas y no perder ningún lead, sea quien sea el vendedor logueado
- Alertar sobre leads sin respuesta, seguimientos vencidos, leads sin asignar
- Responder con los precios y datos EXACTOS de arriba — nunca inventar números
- Calcular estimados de envío con la lógica de hubs + millas cuando te den un ZIP
- Analizar el pipeline y sugerir acciones concretas con nombres reales
- Redactar o traducir mensajes para clientes siguiendo las reglas de arriba
- Actuar como compañero de equipo real, no como un chatbot genérico
- Ser proactivo: si ves algo importante en el contexto del CRM, mencionalo sin que te lo pidan

════ ESTILO (para hablar con el vendedor/CEO, no con el cliente) ════
- Español rioplatense natural. Tutear siempre. Tono profesional pero cercano.
- NUNCA empieces con "¡Claro!", "¡Por supuesto!", "Entendido" — ir directo al punto.
- MODO VOZ: máximo 2 oraciones cortas, conversacionales, sin listas ni markdown, lenguaje hablado natural.
- MODO TEXTO: podés extenderte, usar listas y negrita cuando ayude a la claridad.
- Cuando termines una respuesta útil, ofrecé siempre el siguiente paso lógico.`;

// ============================================================
// FONT LOADER
// ============================================================
function FontLoader() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    document.body.style.background = L.bg;
  }, []);
  return null;
}

// ============================================================
// AVATAR
// ============================================================
function Avatar({ nombre, foto, size = 40, border }) {
  const initials = (nombre || "?").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const idx = nombre ? (nombre.charCodeAt(0) * 3 + (nombre.charCodeAt(1) || 0) * 7) % AVT.length : 0;
  const [bg, fg] = AVT[idx];
  if (foto) return (
    <img src={foto} alt={nombre}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: border || `2px solid ${L.border}` }} />
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg, color: fg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: Math.round(size * 0.37),
      flexShrink: 0, border: border || `2px solid rgba(255,255,255,.6)`,
      letterSpacing: 0.5, userSelect: "none",
    }}>
      {initials}
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function Login() {
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [err, setErr]         = useState("");
  const [loading, setLoad]    = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    setErr(""); setLoad(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass.trim() });
    if (error) setErr(error.message || "Email o contraseña incorrectos.");
    setLoad(false);
  };

  const inputSt = { width: "100%", boxSizing: "border-box", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${L.border}`, fontSize: 14, fontFamily: FONT_BODY, color: L.text, outline: "none", background: L.soft, transition: "border-color .2s" };
  const labelSt = { display: "block", fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 };

  return (
    <div className="login-scroll" style={{ minHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", fontFamily: FONT_BODY, padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 36 }}>
          <img src={LOGO_URL} alt="NINIT Group"
            style={{ width: "100%", maxWidth: 320, height: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 2px 14px rgba(58,141,194,0.45))" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div style={{ height: 1, width: 28, background: L.border }} />
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: 4, color: L.light, textTransform: "uppercase" }}>CRM</span>
            <div style={{ height: 1, width: 28, background: L.border }} />
          </div>
        </div>

        <div>
          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="tu@ninitgroup.com"
              style={inputSt} />
          </div>

          {/* Contraseña con ojo */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Contraseña</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="••••••••"
                style={{ ...inputSt, paddingRight: 46 }} />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: L.muted, display: "flex", alignItems: "center", padding: 0 }}>
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {err && (
            <div style={{ color: C.red, fontSize: 13, marginBottom: 14, padding: "10px 14px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={15} /> {err}
            </div>
          )}
          <button onClick={handleLogin} disabled={loading}
            style={{ width: "100%", marginTop: 8, background: loading ? L.light : C.red, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: FONT_DISPLAY, letterSpacing: 1.5, boxShadow: loading ? "none" : "0 4px 16px rgba(156,27,27,.3)", transition: "all .2s" }}>
            {loading ? "Entrando…" : "ENTRAR"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MOBILE BACK HEADER
// ============================================================
function MobileBack({ title, onBack }) {
  return (
    <div style={{ padding: "11px 16px", background: L.white, borderBottom: `3px solid ${C.gold}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <button onClick={onBack}
        style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted, flexShrink: 0 }}>
        <ChevronLeft size={20} />
      </button>
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: L.text, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
    </div>
  );
}

// ============================================================
// ALERTAS BTN
// ============================================================
function AlertasBtn({ alertas, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ position: "relative", background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.35)", color: "#fff", borderRadius: 10, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
        <Bell size={17} />
        {alertas.length > 0 && (
          <span style={{ position: "absolute", top: -5, right: -5, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 10, minWidth: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `2px solid ${L.white}` }}>
            {alertas.length}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: 46, width: 340, maxHeight: 400, overflowY: "auto", background: L.white, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,.15)", border: `1px solid ${L.border}`, zIndex: 100 }}>
          <div style={{ padding: "13px 18px", borderBottom: `1px solid ${L.border}`, fontFamily: FONT_DISPLAY, fontWeight: 600, color: L.text, textTransform: "uppercase", fontSize: 12, letterSpacing: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={14} color={C.red} /> Alertas
            {alertas.length > 0 && <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{alertas.length}</span>}
          </div>
          {alertas.length === 0
            ? <div style={{ padding: 24, color: L.muted, fontSize: 14, textAlign: "center" }}>Sin alertas pendientes ✓</div>
            : alertas.map((a) => (
              <div key={a.id} onClick={() => { onSelect(a.contacto); setOpen(false); }}
                style={{ padding: "12px 18px", borderBottom: `1px solid ${L.border}`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", transition: "background .12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = L.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                  {a.tipo === "sin_respuesta" ? "⏰" : a.tipo === "lead_sin_asignar" ? "👤" : "📌"}
                </span>
                <span style={{ fontSize: 13, color: L.text, lineHeight: 1.45 }}>{a.texto}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONTACT DRAWER
// ============================================================
function ContactoDrawer({ contacto, onClose, onSave }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    nombre: contacto.nombre || "", email: contacto.email || "",
    empresa: contacto.empresa || "", direccion: contacto.direccion || "",
    canal: contacto.canal || "whatsapp", messenger_id: contacto.messenger_id || "",
    nota_seguimiento: contacto.nota_seguimiento || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true); setErr("");
    const updateData = { ...form };
    // For existing schema compatibility, keep telefono if messenger contact doesn't have a phone
    if (updateData.canal === "messenger" && !updateData.telefono && updateData.messenger_id) {
      updateData.telefono = updateData.messenger_id;
    }
    const { error } = await supabase.from("contactos").update(updateData).eq("id", contacto.id);
    if (error) {
      if (error.code === "PGRST204" || (error.message && error.message.includes("column"))) {
        const { error: e2 } = await supabase.from("contactos")
          .update({ nombre: form.nombre, nota_seguimiento: form.nota_seguimiento }).eq("id", contacto.id);
        if (!e2) { onSave({ ...contacto, nombre: form.nombre, nota_seguimiento: form.nota_seguimiento }); setSaved(true); setTimeout(() => setSaved(false), 2500); }
        else setErr("Ejecutá la migración en supabase_schema.sql para guardar todos los campos.");
      } else setErr("Error: " + error.message);
    } else {
      onSave({ ...contacto, ...form }); setSaved(true); setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  const inputSt = { width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 9, border: `1.5px solid ${L.border}`, fontSize: 14, fontFamily: FONT_BODY, color: L.text, outline: "none", background: L.soft };
  const labelSt = { display: "block", fontSize: 11, color: L.muted, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" };
  const fields = [
    { label: "Nombre completo", key: "nombre", icon: <User size={14} />, type: "text", ph: "Ej: Juan García" },
    { label: "Email", key: "email", icon: <Mail size={14} />, type: "email", ph: "juan@empresa.com" },
    { label: "Canal", key: "canal", icon: <MessageSquare size={14} />, type: "select", options: [
      { value: "whatsapp", label: "WhatsApp" },
      { value: "messenger", label: "Messenger" },
      { value: "email", label: "Email" },
      { value: "google_ads", label: "Google Ads" },
    ] },
    { label: "Messenger ID", key: "messenger_id", icon: <MessageSquare size={14} />, type: "text", ph: "123456789012345" },
    { label: "Empresa", key: "empresa", icon: <Building2 size={14} />, type: "text", ph: "Nombre de la empresa" },
    { label: "Dirección", key: "direccion", icon: <MapPin size={14} />, type: "text", ph: "Calle, Ciudad, Provincia" },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 200 }} />
      <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: isMobile ? "100%" : 390, background: L.white, boxShadow: "-6px 0 40px rgba(0,0,0,.18)", zIndex: 201, display: "flex", flexDirection: "column", fontFamily: FONT_BODY }}>
        {/* Header */}
        <div style={{ padding: "20px 22px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar nombre={contacto.nombre || contacto.telefono || contacto.email} foto={contacto.foto_url} size={52} border={`2px solid ${C.gold}`} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: L.text }}>{contacto.nombre || "Nuevo contacto"}</div>
            <div style={{ fontSize: 12.5, color: L.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              {contacto.canal === "email"
                ? <><Mail size={12} /> {contacto.email}</>
                : <><Phone size={12} /> {contacto.telefono}</>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
            <X size={18} />
          </button>
        </div>
        {/* Body */}
        <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: "22px" }}>
          <div style={{ fontSize: 11, color: L.light, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 18, paddingBottom: 10, borderBottom: `1px solid ${L.border}` }}>
            Datos del contacto
          </div>
          {fields.map(({ label, key, icon, type, ph, options }) => (
            <div key={key} style={{ marginBottom: 18 }}>
              <label style={labelSt}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{icon} {label}</span></label>
              {type === "select" ? (
                <select value={form[key]} onChange={set(key)} style={inputSt}>
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input type={type} value={form[key]} onChange={set(key)} placeholder={ph} style={inputSt} />
              )}
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><FileText size={14} /> Notas internas</span></label>
            <textarea value={form.nota_seguimiento} onChange={set("nota_seguimiento")}
              placeholder="Notas, preferencias, observaciones sobre el contacto..."
              rows={4} style={{ ...inputSt, resize: "vertical", lineHeight: 1.55 }} />
          </div>
          <div style={{ padding: "13px 16px", background: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
              {contacto.canal === "email" ? "Email" : contacto.canal === "messenger" ? "Messenger ID" : "Teléfono WhatsApp"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: L.text }}>
              {contacto.canal === "email" ? contacto.email : contacto.canal === "messenger" ? (contacto.messenger_id || contacto.telefono) : contacto.telefono}
            </div>
            <div style={{ fontSize: 11, color: L.muted, marginTop: 2 }}>No editable — identificador único</div>
          </div>
          {err && <div style={{ marginTop: 14, padding: "10px 14px", background: "#FEF2F2", borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 500, display: "flex", gap: 8, alignItems: "center" }}>
            <AlertCircle size={15} /> {err}
          </div>}
        </div>
        {/* Footer */}
        <div style={{ padding: "16px 22px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: `1.5px solid ${L.border}`, color: L.muted, borderRadius: 9, padding: 11, fontSize: 14, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, background: saved ? "#16A34A" : C.red, color: "#fff", border: "none", borderRadius: 9, padding: 11, fontSize: 14, cursor: "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: 0.5, opacity: saving ? 0.75 : 1, transition: "background .3s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saved ? <><Check size={16} /> Guardado</> : saving ? "Guardando…" : "Guardar Contacto"}
          </button>
        </div>
      </div>
    </>
  );
}

// ============================================================
// ASISTENTE IA  (ElevenLabs TTS + Web Speech STT + proactivo)
// ============================================================
// ── Ejecutor de acciones CEO ──────────────────────────────────
// Cada función intenta la operación completa; si falla por columna faltante,
// hace fallback a los campos mínimos garantizados.
const esErrorColumna = (msg) => msg && (
  msg.includes("column") || msg.includes("schema cache") ||
  msg.includes("Could not find") || msg.includes("does not exist")
);

const EJECUTAR_ACCION = {
  agregar_vendedor: async ({ nombre, email, role }) => {
    if (!nombre?.trim()) return "⚠️ Necesito el nombre del vendedor.";
    const insertCompleto = { nombre: nombre.trim() };
    if (email) insertCompleto.email = email.toLowerCase().trim();
    if (role)  insertCompleto.role  = role;
    const { error } = await supabase.from("vendedores").insert(insertCompleto);
    if (error && esErrorColumna(error.message)) {
      // Fallback: solo nombre (tabla sin columnas email/role aún)
      const { error: e2 } = await supabase.from("vendedores").insert({ nombre: nombre.trim() });
      return e2 ? `Error: ${e2.message}` : `✅ Vendedor **${nombre}** agregado.`;
    }
    return error ? `Error: ${error.message}` : `✅ Vendedor **${nombre}** agregado.`;
  },

  actualizar_vendedor: async ({ nombre_actual, nombre, email, role }) => {
    if (!nombre_actual?.trim()) return "⚠️ Necesito el nombre actual del vendedor.";
    const cambios = {};
    if (nombre) cambios.nombre = nombre.trim();
    if (email)  cambios.email  = email.toLowerCase().trim();
    if (role)   cambios.role   = role;
    if (!Object.keys(cambios).length) return "⚠️ No especificaste qué cambiar.";
    const { error } = await supabase.from("vendedores")
      .update(cambios).eq("nombre", nombre_actual.trim());
    if (error && esErrorColumna(error.message)) {
      const camposBasicos = {};
      if (nombre) camposBasicos.nombre = nombre.trim();
      const { error: e2 } = await supabase.from("vendedores")
        .update(camposBasicos).eq("nombre", nombre_actual.trim());
      return e2 ? `Error: ${e2.message}` : `✅ Vendedor **${nombre_actual}** actualizado.`;
    }
    return error ? `Error: ${error.message}` : `✅ Vendedor **${nombre_actual}** actualizado.`;
  },

  eliminar_vendedor: async ({ nombre }) => {
    if (!nombre?.trim()) return "⚠️ Necesito el nombre del vendedor a eliminar.";
    const { error } = await supabase.from("vendedores").delete().eq("nombre", nombre.trim());
    return error ? `Error: ${error.message}` : `✅ Vendedor **${nombre}** eliminado.`;
  },

  agregar_contacto: async ({ nombre, telefono, email, vendedor, estado = "nuevo", canal = "whatsapp", messenger_id }) => {
    if (!nombre?.trim() && !telefono?.trim() && !email?.trim() && !messenger_id?.trim())
      return "⚠️ Necesito al menos nombre, teléfono, email o Messenger ID.";
    const insert = { estado, canal };
    if (nombre)       insert.nombre       = nombre.trim();
    if (telefono)     insert.telefono     = telefono.trim();
    if (email)        insert.email        = email.toLowerCase().trim();
    if (vendedor)     insert.vendedor     = vendedor.trim();
    if (messenger_id) insert.messenger_id = messenger_id.trim();
    if (canal === "messenger" && !insert.telefono && messenger_id) insert.telefono = messenger_id.trim();
    const { error } = await supabase.from("contactos").insert(insert);
    return error ? `Error: ${error.message}` : `✅ Contacto **${nombre || telefono || email || messenger_id}** creado.`;
  },

  actualizar_contacto: async ({ id, ...cambios }) => {
    if (!id) return "⚠️ Falta el id del contacto.";
    const { error } = await supabase.from("contactos").update(cambios).eq("id", id);
    return error ? `Error: ${error.message}` : `✅ Contacto actualizado.`;
  },

  eliminar_contacto: async ({ id }) => {
    if (!id) return "⚠️ Falta el id del contacto.";
    const { error } = await supabase.from("contactos").delete().eq("id", id);
    return error ? `Error: ${error.message}` : `✅ Contacto eliminado.`;
  },
};

function AIAsistente({ contactoActivo, alertas = [], contactos = [], nombreUsuario = "", rol = "vendedor", onRefrescar }) {
  const isMobile   = useIsMobile();
  const [open, setOpen]           = useState(false);
  const [msgs, setMsgs]           = useState([]);
  const [input, setInput]         = useState("");
  const [typing, setTyping]       = useState(false);
  const [grabando, setGrabando]   = useState(false);
  const [hablando, setHablando]   = useState(false);
  const [vozOn, setVozOn]         = useState(true);
  const [sttOk, setSttOk]         = useState(false);
  const [transcrib, setTranscrib] = useState("");
  const [briefingHecho, setBriefing] = useState(false);
  const bottomRef      = useRef(null);
  const recognitionRef = useRef(null);
  const audioCtxRef    = useRef(null);  // AudioContext — desbloqueado por gesto del usuario
  const audioSrcRef    = useRef(null);  // AudioBufferSourceNode activo
  const vozOnRef       = useRef(vozOn);
  const saludadoRef    = useRef(false);

  useEffect(() => { vozOnRef.current = vozOn; }, [vozOn]);
  useEffect(() => { setSttOk(!!(window.SpeechRecognition || window.webkitSpeechRecognition)); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);

  // ── Desbloquear AudioContext (iOS/Android requieren gesto) ──
  const unlockAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    // Buffer silencioso para desbloquear el contexto
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    audioCtxRef.current = ctx;
  }, []);

  // ── Fallback: Web Speech API ─────────────────────────────
  const hablarWebSpeech = useCallback((texto) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const limpio = texto.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,3}\s/g, "").replace(/[-•]\s/g, "").slice(0, 500);
    const utt = new SpeechSynthesisUtterance(limpio);
    utt.lang  = "es-AR"; utt.rate = 1.05; utt.pitch = 1.0;
    const voces = window.speechSynthesis.getVoices();
    const voz = voces.find((v) => v.lang === "es-AR")
      || voces.find((v) => v.lang === "es-419")
      || voces.find((v) => v.lang === "es-MX")
      || voces.find((v) => v.lang === "es-US")
      || voces.find((v) => v.lang.startsWith("es"));
    if (voz) utt.voice = voz;
    utt.onstart = () => setHablando(true);
    utt.onend   = () => setHablando(false);
    utt.onerror = () => setHablando(false);
    window.speechSynthesis.speak(utt);
  }, []);

  // ── TTS principal: Google Cloud TTS via /api/tts ─────────
  // Usa AudioContext (funciona en móvil) con fallback a Web Speech
  const hablar = useCallback(async (texto) => {
    if (!vozOnRef.current) return;
    const limpio = texto.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,3}\s/g, "").replace(/[-•]\s/g, "").slice(0, 480);

    // Detener audio anterior
    try { audioSrcRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();

    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = audioCtxRef.current || (AC ? new AC() : null);
    if (ctx && !audioCtxRef.current) audioCtxRef.current = ctx;

    if (!ctx) { hablarWebSpeech(limpio); return; }

    setHablando(true);
    try {
      if (ctx.state === "suspended") await ctx.resume();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: limpio }),
      });
      if (!res.ok) throw new Error("TTS " + res.status);

      const arrayBuffer = await res.arrayBuffer();
      const decoded     = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => setHablando(false);
      audioSrcRef.current = source;
      source.start(0);
    } catch {
      setHablando(false);
      hablarWebSpeech(limpio);
    }
  }, [hablarWebSpeech]);

  // ── Limpiar audio al cerrar panel ────────────────────────
  useEffect(() => {
    if (!open) {
      try { audioSrcRef.current?.stop(); } catch {}
      window.speechSynthesis?.cancel();
      setHablando(false);
    }
  }, [open]);

  // ── Saludo al abrir el panel por primera vez (gesto → OK en móvil) ──
  useEffect(() => {
    if (!open || saludadoRef.current || !nombreUsuario) return;
    saludadoRef.current = true;
    const hora   = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    const nombre = nombreUsuario.split(" ")[0];
    // Pequeño delay para que el AudioContext esté desbloqueado
    const t = setTimeout(() => {
      hablar(`${saludo} ${nombre}. ¿Cómo estás? ¿Puedo ayudarte en algo?`);
    }, 400);
    return () => clearTimeout(t);
  }, [open, nombreUsuario, hablar]);

  // ── Briefing proactivo al abrir ──────────────────────────
  useEffect(() => {
    if (!open || briefingHecho || msgs.length > 0) return;
    setBriefing(true);
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    const sinRespuesta = contactos.filter((c) =>
      !c.bot_activo && c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at))
    ).length;
    const segVencidos = alertas.filter((a) => a.tipo === "seguimiento").length;
    const urgentes    = alertas.filter((a) => a.tipo === "sin_respuesta").length;

    let briefing = `${saludo}, Nicolás.`;
    if (urgentes > 0)       briefing += ` Hay ${urgentes} cliente${urgentes > 1 ? "s" : ""} esperando respuesta urgente.`;
    if (segVencidos > 0)    briefing += ` Tenés ${segVencidos} seguimiento${segVencidos > 1 ? "s" : ""} vencido${segVencidos > 1 ? "s" : ""}.`;
    if (sinRespuesta > 0 && urgentes === 0) briefing += ` Hay ${sinRespuesta} conversación${sinRespuesta > 1 ? "es" : ""} sin responder.`;
    if (urgentes === 0 && segVencidos === 0 && sinRespuesta === 0) briefing += ` Todo está al día. ¿En qué te ayudo?`;
    else briefing += ` ¿Arrancamos por eso?`;

    setMsgs([{ from: "ai", text: briefing }]);
    hablar(briefing);
  }, [open]);  // eslint-disable-line

  // ── STT ──────────────────────────────────────────────────
  const iniciarGrabacion = () => {
    if (grabando) { recognitionRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setHablando(false);
    const rec = new SR();
    rec.lang = "es-AR"; rec.continuous = false; rec.interimResults = true;
    rec.onstart  = () => { setGrabando(true); setTranscrib(""); };
    rec.onresult = (e) => {
      const p = Array.from(e.results).map((r) => r[0].transcript).join("");
      setTranscrib(p);
      if (e.results[e.results.length - 1].isFinal) { setInput(p); setTranscrib(""); }
    };
    rec.onerror = () => { setGrabando(false); setTranscrib(""); };
    rec.onend   = () => { setGrabando(false); setTranscrib(""); };
    recognitionRef.current = rec;
    rec.start();
  };

  // ── Auto-enviar tras grabar ──────────────────────────────
  useEffect(() => {
    if (!grabando && input.trim() && !typing) {
      const t = setTimeout(() => enviar(input.trim()), 350);
      return () => clearTimeout(t);
    }
  }, [grabando]); // eslint-disable-line

  // ── Enviar mensaje ────────────────────────────────────────
  const enviar = useCallback(async (textoForzado) => {
    const q = (textoForzado || input).trim();
    if (!q || typing) return;
    const historial = [...msgs];
    setMsgs((p) => [...p, { from: "user", text: q }]);
    setInput(""); setTranscrib(""); setTyping(true);

    const GROK_KEY = import.meta.env.VITE_GROK_API_KEY;
    if (!GROK_KEY) {
      const t = "Clave de IA no configurada. Agregá VITE_GROK_API_KEY en Vercel.";
      setMsgs((p) => [...p, { from: "ai", text: t }]);
      setTyping(false); return;
    }
    try {
      // Contexto del CRM
      const sinResp  = contactos.filter((c) => !c.bot_activo && c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at))).length;
      const segVenc  = alertas.filter((a) => a.tipo === "seguimiento").length;
      let sysExtra = `\n\nUSUARIO ACTUAL: ${nombreUsuario || "Usuario"} (${rol === "ceo" ? "CEO" : "Vendedor"}).`;
      sysExtra += `\nESTADO ACTUAL DEL CRM: ${contactos.length} contactos totales | ${sinResp} sin respuesta | ${segVenc} seguimientos vencidos | ${alertas.length} alertas activas.`;
      if (contactoActivo) {
        const est = ESTADOS[contactoActivo.estado];
        sysExtra += `\nCONTACTO ABIERTO: ${contactoActivo.nombre || contactoActivo.telefono} (id: ${contactoActivo.id}) | ${est?.label || contactoActivo.estado} | vendedor: ${contactoActivo.vendedor || "sin asignar"}`;
      }
      if (vozOnRef.current) sysExtra += "\nMODO VOZ ACTIVO: máximo 2 oraciones, sin listas, sin markdown, lenguaje natural hablado.";
      if (rol === "ceo") sysExtra += `\n\n════ ACCIONES DISPONIBLES (sos CEO) ════
Podés ejecutar cambios REALES en la base de datos del CRM. Cuando el usuario pida hacer algo, incluí AL FINAL de tu respuesta un bloque exactamente así (JSON válido, una sola línea):
<ACCION>{"tipo":"nombre_accion","campo":"valor"}</ACCION>

ACCIONES Y CAMPOS REQUERIDOS:
- agregar_vendedor: { "nombre": "...", "email": "...(opcional)", "role": "vendedor|ceo (opcional)" }
- actualizar_vendedor: { "nombre_actual": "nombre existente", "nombre": "nuevo nombre (opcional)", "role": "nuevo rol (opcional)" }
- eliminar_vendedor: { "nombre": "nombre exacto" }
- agregar_contacto: { "nombre": "...", "telefono": "...(opcional)", "email": "...(opcional)", "vendedor": "...(opcional)", "estado": "nuevo|contactado|interesado|pendiente|vendido|perdido" }
- actualizar_contacto: { "id": "uuid del contacto", "estado": "...(opcional)", "vendedor": "...(opcional)", "nombre": "...(opcional)" }
- eliminar_contacto: { "id": "uuid del contacto" }

REGLAS ESTRICTAS:
1. Incluí <ACCION> SIEMPRE que el usuario pida un cambio concreto, aunque te falte algún dato opcional.
2. Si el dato es REQUERIDO y falta, preguntá PRIMERO y ejecutá cuando lo tengas.
3. Para ELIMINAR: confirmá en la respuesta antes de incluir <ACCION>.
4. El bloque <ACCION> va SOLO en la última línea, sin texto después.
5. Solo un <ACCION> por respuesta.`;

      const apiMsgs = [
        { role: "system", content: GROK_SYSTEM + sysExtra },
        ...historial.map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
        { role: "user", content: q },
      ];
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROK_KEY}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: apiMsgs, max_tokens: vozOnRef.current ? 130 : 700 }),
      });
      if (res.ok) {
        const data = await res.json();
        let resp = data.choices[0].message.content;

        // ── Detectar y ejecutar acciones CEO ──────────────────
        const accionMatch = resp.match(/<ACCION>([\s\S]*?)<\/ACCION>/);
        if (accionMatch && rol === "ceo") {
          resp = resp.replace(/<ACCION>[\s\S]*?<\/ACCION>/, "").trim();
          setMsgs((p) => [...p, { from: "ai", text: resp }]);
          if (resp && !vozOnRef.current) {} else if (resp) hablar(resp);
          try {
            const accion = JSON.parse(accionMatch[1].trim());
            const { tipo, ...params } = accion;
            const fn = EJECUTAR_ACCION[tipo];
            if (fn) {
              setMsgs((p) => [...p, { from: "sistema", text: `⏳ Ejecutando: ${tipo}…` }]);
              const resultado = await fn(params);
              setMsgs((p) => [
                ...p.filter((m) => !m.text?.startsWith("⏳ Ejecutando")),
                { from: "sistema", text: `✅ ${resultado}` },
              ]);
              onRefrescar?.();
            } else {
              setMsgs((p) => [...p, { from: "sistema", text: `⚠️ Acción desconocida: ${tipo}` }]);
            }
          } catch {
            setMsgs((p) => [...p, { from: "sistema", text: "⚠️ Error al parsear la acción." }]);
          }
        } else {
          setMsgs((p) => [...p, { from: "ai", text: resp }]);
          hablar(resp);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setMsgs((p) => [...p, { from: "ai", text: `Error (${res.status}): ${err?.error?.message || "Verificá la clave"}` }]);
      }
    } catch (e) {
      setMsgs((p) => [...p, { from: "ai", text: `Sin conexión: ${e.message}` }]);
    }
    setTyping(false);
  }, [input, msgs, typing, contactoActivo, alertas, contactos, hablar]);

  // ── Sugerencias contextuales ─────────────────────────────
  const sugerencias = [
    alertas.some((a) => a.tipo === "sin_respuesta") ? "¿A quién tengo que responder?" : null,
    alertas.some((a) => a.tipo === "seguimiento")   ? "¿Qué seguimientos vencieron?"  : null,
    "Resumime el pipeline de hoy",
    "Consejos para cerrar más rápido",
  ].filter(Boolean).slice(0, 3);

  const statusLabel = grabando
    ? `Escuchando… ${transcrib ? `"${transcrib.slice(0, 28)}…"` : ""}`
    : hablando ? "Hablando (Google TTS)…"
    : typing   ? "Pensando…"
    : "Online · Voz Google es-AR";

  return (
    <>
      {/* Botón flotante */}
      <button onClick={() => { unlockAudio(); setOpen((v) => !v); }} title="Asistente IA"
        style={{ position: "fixed", bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom))" : 84, right: isMobile ? 16 : 24, width: isMobile ? 50 : 56, height: isMobile ? 50 : 56, borderRadius: "50%", background: grabando ? "#DC2626" : open ? L.muted : C.red, border: grabando ? "3px solid #FCA5A5" : "none", color: "#fff", cursor: "pointer", boxShadow: grabando ? "0 0 0 8px rgba(220,38,38,.2), 0 4px 20px rgba(185,28,28,.5)" : hablando ? "0 0 0 6px rgba(22,163,74,.25), 0 4px 20px rgba(58,141,194,.5)" : "0 4px 20px rgba(185,28,28,.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .25s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
        {open ? <X size={22} /> : grabando ? <Mic size={22} /> : hablando ? <Volume2 size={22} /> : <Sparkles size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div style={{ position: "fixed", bottom: isMobile ? "calc(136px + env(safe-area-inset-bottom))" : 148, right: 16, ...(isMobile ? { left: 16 } : { width: 530 }), height: isMobile ? "72dvh" : 680, maxHeight: isMobile ? "calc(100% - 124px)" : "calc(100vh - 160px)", background: L.white, borderRadius: isMobile ? "20px 20px 16px 16px" : 20, boxShadow: "0 20px 70px rgba(0,0,0,.25)", border: `1px solid ${L.border}`, zIndex: 299, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: FONT_BODY }}>

          {/* Header */}
          <div style={{ background: `linear-gradient(135deg, ${C.redDark} 0%, ${C.red} 100%)`, color: "#fff", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${C.redDark}`, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1.5px solid rgba(255,255,255,.35)" }}>
              {hablando ? <Volume2 size={15} /> : <Sparkles size={15} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 13, letterSpacing: 0.2 }}>Asistente Ejecutivo IA</div>
              <div style={{ fontSize: 9.5, color: grabando ? "#FEF08A" : hablando ? "#86EFAC" : "rgba(255,255,255,.6)", marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                {(grabando || hablando) && <span style={{ width: 5, height: 5, borderRadius: "50%", background: grabando ? "#FEF08A" : "#86EFAC", flexShrink: 0, animation: "pulseDot 1s infinite" }} />}
                {statusLabel}
              </div>
            </div>
            <button onClick={() => { setVozOn((v) => !v); audioRef.current?.pause(); window.speechSynthesis?.cancel(); setHablando(false); }}
              title={vozOn ? "Silenciar voz" : "Activar voz"}
              style={{ background: vozOn ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.08)", border: `1.5px solid ${vozOn ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.15)"}`, color: "#fff", borderRadius: 8, width: 29, height: 29, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
              {vozOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#fff", borderRadius: 8, width: 29, height: 29, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>

          {/* Banner grabando */}
          {grabando && (
            <div style={{ background: "#FEF08A", padding: "9px 16px", display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontWeight: 700, color: "#713F12", flexShrink: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#DC2626", flexShrink: 0, animation: "pulseDot 0.8s infinite" }} />
              {transcrib ? `"${transcrib.slice(0, 65)}${transcrib.length > 65 ? "…" : ""}"` : "Escuchando… hablá ahora"}
            </div>
          )}

          {/* Mensajes */}
          <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 11, background: "#F8FAFC" }}>
            {msgs.map((m, i) => {
              if (m.from === "sistema") return (
                <div key={i} style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{ fontSize: 12, color: m.text?.startsWith("✅") ? "#15803D" : m.text?.startsWith("⚠️") ? "#92400E" : "#1D4ED8", background: m.text?.startsWith("✅") ? "#DCFCE7" : m.text?.startsWith("⚠️") ? "#FEF3C7" : "#DBEAFE", border: `1px solid ${m.text?.startsWith("✅") ? "#86EFAC" : m.text?.startsWith("⚠️") ? "#FDE68A" : "#BFDBFE"}`, borderRadius: 20, padding: "5px 14px", fontWeight: 600 }}>
                    {m.text}
                  </div>
                </div>
              );
              return (
                <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 7 }}>
                  {m.from === "ai" && (
                    <div style={{ width: 28, height: 28, borderRadius: 9, background: hablando && i === msgs.length - 1 ? "#16A34A" : C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .3s", boxShadow: hablando && i === msgs.length - 1 ? "0 0 0 4px rgba(22,163,74,.2)" : "none" }}>
                      {hablando && i === msgs.length - 1 ? <Volume2 size={14} color="#fff" /> : <Sparkles size={14} color="#fff" />}
                    </div>
                  )}
                  <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: m.from === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", background: m.from === "user" ? C.red : L.white, color: m.from === "user" ? "#fff" : L.text, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", boxShadow: "0 1px 5px rgba(0,0,0,.08)", border: m.from === "user" ? "none" : `1px solid ${L.border}` }}>
                    {m.text}
                  </div>
                  {m.from === "ai" && vozOn && i === msgs.length - 1 && !hablando && (
                    <button onClick={() => hablar(m.text)} title="Escuchar respuesta"
                      style={{ background: "none", border: `1.5px solid ${L.border}`, borderRadius: 7, padding: "4px 7px", cursor: "pointer", color: L.muted, display: "flex", alignItems: "center", flexShrink: 0, transition: "all .15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = C.red; e.currentTarget.style.borderColor = C.red; e.currentTarget.style.background = "#FEF2F2"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = L.muted; e.currentTarget.style.borderColor = L.border; e.currentTarget.style.background = "none"; }}>
                      <Volume2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
            {typing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={14} color="#fff" />
                </div>
                <div style={{ padding: "11px 16px", background: L.white, borderRadius: "4px 16px 16px 16px", border: `1px solid ${L.border}`, display: "flex", gap: 5, alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: C.red, display: "inline-block", animation: `dotBounce 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Sugerencias contextuales */}
          {msgs.length <= 1 && !typing && (
            <div style={{ padding: "8px 12px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 5, flexWrap: "wrap", background: L.white, flexShrink: 0 }}>
              {sugerencias.map((s) => (
                <button key={s} onClick={() => enviar(s)}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${L.border}`, background: L.soft, color: C.red, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600, transition: "all .15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.borderColor = C.red; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = L.soft; e.currentTarget.style.borderColor = L.border; }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 8, background: L.white, alignItems: "center", flexShrink: 0 }}>
            {/* Botón micrófono — siempre visible, grande y claro */}
            <button onClick={() => { unlockAudio(); iniciarGrabacion(); }} disabled={typing}
              title={!sttOk ? "Tu navegador no soporta voz — usá Chrome" : grabando ? "Detener grabación" : "Hablar con el asistente (voz)"}
              style={{ background: grabando ? C.red : sttOk ? "#EFF6FF" : L.light, border: `2px solid ${grabando ? C.red : sttOk ? C.red : L.border}`, color: grabando ? "#fff" : sttOk ? C.red : L.muted, borderRadius: 12, width: 46, height: 46, cursor: typing || !sttOk ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s", boxShadow: grabando ? `0 0 0 5px rgba(58,141,194,.25)` : sttOk ? `0 2px 8px rgba(58,141,194,.2)` : "none" }}>
              {grabando ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input value={transcrib || input}
              onChange={(e) => { if (!grabando) setInput(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !grabando) enviar(); }}
              placeholder={grabando ? "Escuchando…" : "Escribí o usá el micrófono…"}
              readOnly={grabando}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${grabando ? "#FDE68A" : L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, outline: "none", color: grabando ? "#713F12" : L.text, background: grabando ? "#FFFBEB" : L.soft, transition: "all .2s" }} />
            <button onClick={() => { unlockAudio(); enviar(); }} disabled={typing || grabando}
              style={{ background: typing || grabando ? L.light : C.red, border: "none", color: "#fff", borderRadius: 10, width: 42, height: 42, cursor: typing || grabando ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .2s" }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .4; transform: scale(.7); }
        }
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: .5; }
          40%           { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ============================================================
// NAV DROPDOWN
// ============================================================
const NAV_ITEMS = [
  { k: "chat",     icon: <MessageSquare size={15} />, label: "Chats" },
  { k: "pedidos",  icon: <Package size={15} />,       label: "Pedidos" },
  { k: "reportes", icon: <BarChart2 size={15} />,     label: "Reportes" },
  { k: "admin",    icon: <Shield size={15} />,        label: "Admin" },
];

function NavDropdown({ vista, setVista, rol }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const items = NAV_ITEMS.filter((i) => i.k !== "admin" || rol === "admin");
  const actual = items.find((i) => i.k === vista) || items[0];

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", borderBottom: `1px solid ${L.border}` }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", border: "none", background: open ? L.soft : L.white, cursor: "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, color: C.red, textTransform: "uppercase", letterSpacing: 0.5, transition: "background .15s" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {actual.icon} {actual.label}
        </span>
        <ChevronDown size={15} style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: L.white, border: `1px solid ${L.border}`, borderTop: "none", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,.1)" }}>
          {items.map(({ k, icon, label }) => (
            <button key={k} onClick={() => { setVista(k); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", border: "none", background: vista === k ? "#FFF0F0" : L.white, cursor: "pointer", fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 12, color: vista === k ? C.red : L.muted, textTransform: "uppercase", letterSpacing: 0.5, borderLeft: vista === k ? `3px solid ${C.red}` : "3px solid transparent", transition: "all .12s" }}
              onMouseEnter={(e) => { if (vista !== k) e.currentTarget.style.background = L.soft; }}
              onMouseLeave={(e) => { if (vista !== k) e.currentTarget.style.background = L.white; }}>
              {icon} {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// NAV TABS (con hamburguesa para secciones secundarias)
// ============================================================
function NavTabs({ vista, setVista, rol }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const primary = [
    ["chat",    <MessageSquare size={13} />, "Chats"],
    ["pedidos", <Package size={13} />,       "Pedidos"],
  ];
  const secondary = rol === "ceo"
    ? [
        ["directorio", <Users size={14} />,    "Directorio"],
        ["reportes",   <BarChart2 size={14} />, "Reportes"],
        ["admin",      <Shield size={14} />,    "Admin"],
        ["control",    <Activity size={14} />,  "Control"],
      ]
    : [["diario", <BookOpen size={14} />, "Mi Día"]];

  const secActivo = secondary.some(([k]) => k === vista);
  const secLabel  = secondary.find(([k]) => k === vista)?.[2];

  const tabSt = (k) => ({
    flex: 1, border: "none", cursor: "pointer", padding: "11px 0",
    fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 10.5,
    textTransform: "uppercase", letterSpacing: 0.4, transition: "all .15s",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
    whiteSpace: "nowrap", minWidth: 60,
    color: vista === k ? C.red : L.muted,
    background: vista === k ? "#EFF6FF" : "transparent",
    borderBottom: vista === k ? `2px solid ${C.red}` : "2px solid transparent",
  });

  return (
    <div className="strip" style={{ display: "flex", borderBottom: `1px solid ${L.border}` }}>
      {primary.map(([k, icon, l]) => (
        <button key={k} onClick={() => setVista(k)} style={tabSt(k)}>
          {icon} {l}
        </button>
      ))}

      <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
        <button onClick={() => setOpen((v) => !v)}
          style={{
            border: "none", cursor: "pointer", padding: "11px 14px", height: "100%",
            fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 10.5, letterSpacing: 0.4,
            display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
            color: secActivo ? C.red : L.muted,
            background: secActivo ? "#EFF6FF" : "transparent",
            borderBottom: secActivo ? `2px solid ${C.red}` : "2px solid transparent",
            transition: "all .15s",
          }}>
          <Menu size={14} />
          {secActivo && <span style={{ fontSize: 10.5, textTransform: "uppercase" }}>{secLabel}</span>}
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "100%", right: 0, minWidth: 180,
            background: L.white, border: `1px solid ${L.border}`,
            borderRadius: "0 0 10px 10px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", zIndex: 100,
          }}>
            {secondary.map(([k, icon, l]) => (
              <button key={k} onClick={() => { setVista(k); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 18px", border: "none", cursor: "pointer",
                  fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13,
                  color: vista === k ? C.red : L.text,
                  background: vista === k ? "#EFF6FF" : L.white,
                  borderLeft: vista === k ? `3px solid ${C.red}` : "3px solid transparent",
                  transition: "all .12s",
                }}
                onMouseEnter={(e) => { if (vista !== k) e.currentTarget.style.background = L.soft; }}
                onMouseLeave={(e) => { if (vista !== k) e.currentTarget.style.background = L.white; }}>
                {icon} {l}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SIDEBAR
// ============================================================
function Sidebar({ contactos, activo, onSelect, onLogout, userEmail, userName, vista, setVista, alertas, isMobile, rol, perfil }) {
  const [filtro, setFiltro]       = useState("todos");
  const [busqueda, setBusqueda]   = useState("");
  const [canal, setCanal]         = useState("todos");
  const [quickFiltro, setQuick]   = useState(null);
  const [tipoFiltro, setTipo]     = useState(null);
  const [now, setNow]             = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const lista = contactos.filter((c) => {
    const porEstado = filtro === "todos" || c.estado === filtro;
    const porBusq   = !busqueda || (c.nombre || "").toLowerCase().includes(busqueda.toLowerCase()) || (c.telefono || "").includes(busqueda) || (c.email || "").toLowerCase().includes(busqueda.toLowerCase());
    const porCanal  = canal === "todos" || (canal === "whatsapp" ? (c.canal || "whatsapp") === "whatsapp" : c.canal === canal);
    const porQuick  = !quickFiltro
      || (quickFiltro === "noleidos"     && c.no_leidos > 0)
      || (quickFiltro === "sinresponder" && c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at)));
    const porTipo   = !tipoFiltro || (c.tipo || "prospecto") === tipoFiltro;
    return porEstado && porBusq && porCanal && porQuick && porTipo;
  });

  const cntNoLeidos     = contactos.filter((c) => c.no_leidos > 0).length;
  const cntSinResponder = contactos.filter((c) => c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at))).length;
  const cntClientes     = contactos.filter((c) => c.tipo === "cliente").length;
  const cntProspectos   = contactos.filter((c) => !c.tipo || c.tipo === "prospecto").length;

  return (
    <div style={{ width: "100%", height: "100%", background: L.white, borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}>

      {/* ── Brand bar ── */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.red, borderBottom: `3px solid ${C.redDark}` }}>
        <img src={LOGO_URL} alt="NINIT Group" style={{ width: 210, height: 52, objectFit: "cover", objectPosition: "center 38%", filter: "brightness(0) invert(1)", opacity: 0.95 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <AlertasBtn alertas={alertas} onSelect={(c) => { setVista("chat"); onSelect(c); }} />
        </div>
      </div>


      {/* ── Tabs ── */}
      <NavTabs vista={vista} setVista={setVista} rol={rol} />

      {vista === "chat" && (
        <>
          {/* ── Canal buttons ── */}
          <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${L.border}`, display: "flex", gap: 6 }}>
            {[
              { key: "whatsapp",   label: "WhatsApp",  icon: <FaWhatsapp size={22} />,   color: "#25D366", bg: "#F0FDF4" },
              { key: "messenger",  label: "Messenger", icon: <SiMessenger size={20} />, color: "#0084FF", bg: "#D8EAFF" },
              { key: "email",      label: "Gmail",      icon: <SiGmail size={20} />,       color: "#EA4335", bg: "#FFF5F5" },
              { key: "google_ads", label: "Google Ads", icon: <SiGoogleads size={20} />,   color: "#4285F4", bg: "#EFF6FF" },
            ].map(({ key, label, icon, color, bg }) => {
              const active = canal === key;
              return (
                <button key={key} onClick={() => setCanal(active ? "todos" : key)}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 4px 9px", borderRadius: 14, border: "none", background: active ? color : bg, cursor: "pointer", transition: "all .2s", boxShadow: active ? `0 4px 14px ${color}55` : "inset 0 0 0 1.5px ${L.border}", transform: active ? "translateY(-1px)" : "none" }}>
                  <span style={{ color: active ? "#fff" : color, display: "flex", lineHeight: 1 }}>{icon}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: active ? "#fff" : color, fontFamily: FONT_DISPLAY, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
                </button>
              );
            })}
          </div>

          {/* ── Filtros rápidos ── */}
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${L.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            {[
              { key: "noleidos",     label: "No leídos",     cnt: cntNoLeidos,     color: C.red,      set: setQuick, val: quickFiltro },
              { key: "sinresponder", label: "Sin responder",  cnt: cntSinResponder, color: "#F59E0B",  set: setQuick, val: quickFiltro },
              { key: "cliente",      label: "★ Clientes",     cnt: cntClientes,     color: "#16A34A",  set: setTipo,  val: tipoFiltro },
              { key: "prospecto",    label: "◎ Prospectos",   cnt: cntProspectos,   color: "#6366F1",  set: setTipo,  val: tipoFiltro },
            ].map(({ key, label, cnt, color, set, val }) => {
              const active = val === key;
              return (
                <button key={key} onClick={() => set(active ? null : key)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, padding: "5px 9px", borderRadius: 8, border: `1.5px solid ${active ? color : L.border}`, background: active ? color : active ? L.soft : L.soft, color: active ? "#fff" : color, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 11, cursor: "pointer", transition: "all .15s", boxShadow: active ? `0 2px 8px ${color}44` : "none" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  <span style={{ background: active ? "rgba(255,255,255,.25)" : color + "20", color: active ? "#fff" : color, borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 800, flexShrink: 0, minWidth: 18, textAlign: "center" }}>{cnt}</span>
                </button>
              );
            })}
          </div>

          {/* ── Búsqueda ── */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${L.border}` }}>
            <div style={{ position: "relative" }}>
              <Search size={15} color={L.light} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar contacto o número…"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10, border: `1.5px solid ${L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none" }} />
            </div>
          </div>

          {/* ── Filtros estado ── */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${L.border}` }}>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${filtro !== "todos" ? C.red : L.border}`, fontSize: 13, fontFamily: FONT_BODY, fontWeight: 700, color: filtro !== "todos" ? C.red : L.muted, background: L.white, cursor: "pointer", outline: "none" }}>
              {["todos", ...Object.keys(ESTADOS)].map((f) => (
                <option key={f} value={f}>{f === "todos" ? "Todos los estados" : ESTADOS[f].label}</option>
              ))}
            </select>
          </div>

          {/* ── Lista contactos ── */}
          <div className="scroll-y" style={{ overflowY: "auto", flex: 1 }}>
            {lista.length === 0 && (
              <div style={{ padding: 36, color: L.light, fontSize: 13.5, textAlign: "center" }}>
                {busqueda ? "Sin resultados para la búsqueda" : "Sin conversaciones"}
              </div>
            )}
            {lista.map((c) => {
              const est  = ESTADOS[c.estado] || ESTADOS.nuevo;
              const sel  = activo?.id === c.id;
              const hora = c.updated_at ? (() => {
                const d = new Date(c.updated_at);
                const hoy = new Date();
                const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
                const mismoAnio = d.getFullYear() === hoy.getFullYear();
                if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
                if (d.toDateString() === ayer.toDateString()) return "Ayer";
                return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", ...(mismoAnio ? {} : { year: "2-digit" }) });
              })() : "";
              return (
                <div key={c.id} onClick={() => onSelect(c)}
                  style={{ padding: "13px 14px", borderBottom: `1px solid ${L.border}`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", background: sel ? L.active : "transparent", borderLeft: sel ? `3px solid ${C.red}` : "3px solid transparent", transition: "background .12s" }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = L.hover; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <Avatar nombre={c.nombre || c.telefono || c.email} foto={c.foto_url} size={46} />
                    {c.canal === "email" ? (
                      <div style={{ position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: "50%", background: "#3B82F6", border: `2px solid ${L.white}` }} title="Canal Email" />
                    ) : c.canal === "messenger" ? (
                      <div style={{ position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: "50%", background: "#0084FF", border: `2px solid ${L.white}` }} title="Canal Messenger" />
                    ) : !c.bot_activo ? (
                      <div style={{ position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: "50%", background: "#F59E0B", border: `2px solid ${L.white}` }} title="Atendido por agente" />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, color: L.text, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "62%" }}>
                        {c.nombre || c.telefono || c.email}
                      </span>
                      <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: L.light }}>{hora}</span>
                        {c.no_leidos > 0 && (
                          <span style={{ background: "#22C55E", color: "#fff", fontSize: 10, borderRadius: 10, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontWeight: 800 }}>{c.no_leidos}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, color: L.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 5 }}>
                      {c.ultimo_msg || "—"}
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9.5, padding: "2px 8px", borderRadius: 4, background: est.bg, color: est.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{est.label}</span>
                      {c.tipo === "cliente" && <span style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 4, background: "#DCFCE7", color: "#16A34A", fontWeight: 700 }}>★ Cliente</span>}
                      {c.vendedor && <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>{c.vendedor}</span>}
                      {c.seguimiento_at && new Date(c.seguimiento_at) <= new Date() && <span title="Seguimiento vencido"><Clock size={12} color={C.red} /></span>}
                      {(() => {
                        const espera = calcEspera(c);
                        if (!espera || espera < 60000) return null;
                        const clr = tiempoClr(espera);
                        return (
                          <span title="Tiempo sin responder" style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 4, background: clr + "18", color: clr, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 3 }}>
                            ⏱ {msToStr(espera)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {vista === "reportes" && <div style={{ flex: 1 }} />}

      {/* ── Pie usuario ── */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 11, background: L.white }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.red, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0 }}>
          {(userName || "U")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>
          <div style={{ fontSize: 11, color: L.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
        </div>
        <button onClick={onLogout} title="Cerrar sesión"
          style={{ background: "transparent", border: `1.5px solid ${L.border}`, color: L.muted, borderRadius: 9, width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = L.hover; e.currentTarget.style.color = C.red; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = L.muted; }}>
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PLANTILLAS DE RESPUESTA RÁPIDA
// ============================================================
const PLANTILLAS = [
  {
    grupo: "🟢 Primer contacto",
    items: [
      {
        label: "Bienvenida Meta Ads",
        texto: `Hi! Thanks for reaching out to NINIT Group 🚐✨ I'm here to help! I saw you were interested in our luxury restroom trailers. Could you tell me a bit more about your needs?\n\n• Are you looking to buy or rent?\n• What's the event date and location?\n• How many guests are you expecting?\n\nWe'll put together a custom quote for you right away!`,
      },
      {
        label: "Saludo + catálogo",
        texto: `Hi! Thanks for your interest in NINIT Group 🙌\n\nHere's our full catalog with all models and specs:\n👉 https://ninitgroup.com/wp-content/uploads/2026/04/NINITGROUP_CATALOG.pdf\n\nWe have 4 models available:\n• 2-Stall White Marble — boutique events\n• 3-Stall — our most popular unit ⭐\n• 4-Stall — large festivals & high traffic\n• ADA+2 — fully accessible option\n\nWhich one fits your event best?`,
      },
    ],
  },
  {
    grupo: "💰 Precios y modelos",
    items: [
      {
        label: "Precios de venta",
        texto: `Here's a quick overview of our pricing:\n\n🏆 2-Stall White Marble: $21,500 (pre-sale) / $24,000 (ready to ship)\n⭐ 3-Stall (most popular): $25,000 (pre-sale) / $27,500 (ready to ship)\n🔥 4-Stall: $32,500 (pre-sale) / $35,000 (ready to ship)\n♿ ADA+2 Accessible: $29,500 (pre-sale) / $32,000 (ready to ship)\n\n📦 FREE shipping for Florida clients!\n\nReady-to-ship units have limited stock. Want to reserve yours with a deposit?`,
      },
      {
        label: "Solicitar cotización alquiler",
        texto: `For rental pricing, it depends on the event date, duration, and model. Could you share:\n\n1️⃣ Event date?\n2️⃣ City / location?\n3️⃣ How many hours/days?\n4️⃣ Estimated number of guests?\n\nI'll get you a custom rental quote ASAP 🙌`,
      },
    ],
  },
  {
    grupo: "📋 Calificar lead",
    items: [
      {
        label: "Pedir datos del evento",
        texto: `To prepare your custom quote, I just need a few details:\n\n1. Buy or rent?\n2. Event date?\n3. Event location (city)?\n4. Estimated number of guests?\n5. Any specific model in mind?\n\nWe'll get back to you with a tailored proposal right away! 🚐`,
      },
    ],
  },
  {
    grupo: "🔔 Seguimiento",
    items: [
      {
        label: "Follow-up 24h",
        texto: `Hi! Just following up on your inquiry about our luxury restroom trailers 😊 We still have units available and would love to help with your event. Any questions I can answer for you?`,
      },
      {
        label: "Urgencia (stock limitado)",
        texto: `Quick heads up — our ready-to-ship units are moving fast! 🚨 If you want to lock in availability for your event, now is the perfect time to secure your unit with a deposit. Want me to send over the details to get started?`,
      },
    ],
  },
];

// ============================================================
// CHAT PANEL
// ============================================================
function ChatPanel({ contacto, onUpdateContacto, onDeleteContacto, userName, onBack, isMobile }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto]       = useState("");
  const [enviando, setEnviando]   = useState(false);
  const [err, setErr]             = useState("");
  const [panelSeg, setPanelSeg]   = useState(false);
  const [drawer, setDrawer]       = useState(false);
  const [pedidoModal, setPedido]  = useState(false);
  const [hoverMsg, setHoverMsg]   = useState(null);
  const [confirmElim, setConfirmElim] = useState(false);
  const [eliminando, setEliminando]   = useState(false);
  const [showPlantillas, setShowPlantillas] = useState(false);
  const endRef = useRef(null);
  const plantillasRef = useRef(null);

  useEffect(() => {
    if (!showPlantillas) return;
    const h = (e) => { if (plantillasRef.current && !plantillasRef.current.contains(e.target)) setShowPlantillas(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPlantillas]);

  const eliminarContacto = async () => {
    setEliminando(true);
    const { error } = await supabase.from("contactos").delete().eq("id", contacto.id);
    if (!error) {
      onDeleteContacto(contacto.id);
    } else {
      setErr("Error al eliminar: " + error.message);
      setEliminando(false);
      setConfirmElim(false);
    }
  };

  const eliminarMensaje = async (id) => {
    if (!window.confirm("¿Eliminar este mensaje del CRM?")) return;
    await supabase.from("mensajes").delete().eq("id", id);
    setMensajes((prev) => prev.filter((m) => m.id !== id));
  };

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("mensajes").select("*").eq("contacto_id", contacto.id).order("created_at", { ascending: true });
    setMensajes(data || []);
    await supabase.from("contactos").update({ no_leidos: 0 }).eq("id", contacto.id);
  }, [contacto.id]);

  useEffect(() => {
    cargar();
    const ch = supabase.channel(`msg-${contacto.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", filter: `contacto_id=eq.${contacto.id}` },
        (p) => setMensajes((m) => m.some((x) => x.id === p.new.id) ? m : [...m, p.new]))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [contacto.id, cargar]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  const enviar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true); setErr(""); setTexto("");

    // 1) Guardar en CRM (Supabase)
    const { error } = await supabase.from("mensajes").insert({
      contacto_id: contacto.id, direccion: "out", origen: "agente", agente: userName, contenido: cuerpo,
    });
    if (error) {
      setErr("Error al guardar el mensaje: " + error.message);
      setTexto(cuerpo);
      setEnviando(false);
      return;
    }

    // 2) Enviar por el canal correspondiente (email, Messenger o WhatsApp)
    const esEmail = contacto.canal === "email" || contacto.canal === "google_ads";
    const esMessenger = contacto.canal === "messenger";
    if (esEmail) {
      // Respuesta por email
      if (N8N_EMAIL_REPLY_WEBHOOK) {
        try {
          const res = await fetch(N8N_EMAIL_REPLY_WEBHOOK, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: contacto.email, nombre: contacto.nombre, mensaje: cuerpo, agente: userName }),
          });
          if (!res.ok) setErr("Mensaje guardado en CRM, pero falló el envío del email.");
        } catch {
          setErr("Mensaje guardado en CRM, pero no se pudo enviar el email.");
        }
      }
    } else if (esMessenger) {
      const messengerId = contacto.messenger_id || contacto.telefono;
      if (!MESSENGER_SEND_ENDPOINT) {
        setErr("Mensaje guardado en CRM, pero falta configurar el endpoint de Messenger.");
      } else if (!messengerId) {
        setErr("Mensaje guardado en CRM, pero falta el identificador de Messenger del contacto.");
      } else {
        try {
          const res = await fetch(MESSENGER_SEND_ENDPOINT, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contacto_id: contacto.id, messenger_id: messengerId, mensaje: cuerpo, agente: userName, nombre: contacto.nombre || "" }),
          });
          if (!res.ok) setErr("Mensaje guardado en CRM, pero falló el envío por Messenger.");
        } catch {
          setErr("Mensaje guardado en CRM, pero no se pudo conectar con Messenger.");
        }
      }
    } else {
      // Respuesta por WhatsApp
      if (N8N_SEND_WEBHOOK) {
        try {
          const msgWA = `*${userName} · NINIT Group:*\n${cuerpo}`;
          const res = await fetch(N8N_SEND_WEBHOOK, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ telefono: contacto.telefono, mensaje: msgWA, agente: userName }),
          });
          if (!res.ok) setErr("Mensaje guardado en CRM, pero falló el envío por WhatsApp.");
        } catch {
          setErr("Mensaje guardado en CRM, pero no se pudo conectar con WhatsApp.");
        }
      }
    }

    setEnviando(false);
  };

  const upd = async (campos) => {
    await supabase.from("contactos").update(campos).eq("id", contacto.id);
    onUpdateContacto({ ...contacto, ...campos });
  };

  const est = ESTADOS[contacto.estado] || ESTADOS.nuevo;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: L.bg, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{ padding: isMobile ? "10px 14px" : "12px 22px", borderBottom: `1px solid ${L.border}`, background: L.white, boxShadow: "0 1px 6px rgba(0,0,0,.06)", flexShrink: 0 }}>
        {/* Fila 1: contacto info */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 14 }}>
          {isMobile && onBack && (
            <button onClick={onBack}
              style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 9, width: 34, height: 34, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted, flexShrink: 0 }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <Avatar nombre={contacto.nombre || contacto.telefono || contacto.email} foto={contacto.foto_url} size={isMobile ? 38 : 48} border={`2px solid ${C.gold}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: isMobile ? 15 : 18, fontWeight: 700, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 160 : "none" }}>{contacto.nombre || contacto.telefono || contacto.email}</span>
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: est.bg, color: est.color, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{est.label}</span>
              {contacto.canal === "email" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "#EFF6FF", color: "#3B82F6", fontWeight: 700, display: "flex", alignItems: "center", gap: 3 }}><Mail size={9} /> Email</span>}
            </div>
            <div style={{ fontSize: 11.5, color: L.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {contacto.canal === "email"
                ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Mail size={11} /> {contacto.email}</span>
                : <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {contacto.telefono}</span>}
              {contacto.empresa && !isMobile && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Building2 size={11} /> {contacto.empresa}</span>}
            </div>
          </div>
          {!isMobile && (
            <>
              <button onClick={() => setDrawer(true)}
                style={{ background: L.soft, border: `1.5px solid ${L.border}`, color: L.muted, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all .15s", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}>
                <Pencil size={14} /> Editar
              </button>
              <button onClick={() => setPedido(true)}
                style={{ background: C.red, border: "none", color: "#fff", borderRadius: 9, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 10px rgba(185,28,28,.3)", transition: "all .15s", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.redDark; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = C.red; }}>
                <ShoppingBag size={14} /> Nuevo Pedido
              </button>
              <button onClick={() => setConfirmElim((v) => !v)} title="Eliminar contacto"
                style={{ background: confirmElim ? "#FEE2E2" : L.soft, border: `1.5px solid ${confirmElim ? "#FECACA" : L.border}`, color: confirmElim ? C.red : L.muted, borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s", flexShrink: 0 }}
                onMouseEnter={(e) => { if (!confirmElim) { e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = C.red; } }}
                onMouseLeave={(e) => { if (!confirmElim) { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.background = L.soft; e.currentTarget.style.color = L.muted; } }}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
        {/* Fila 2: acciones (scrollable en mobile) */}
        <div className={isMobile ? "strip" : ""} style={{ display: "flex", gap: 7, alignItems: "center", marginTop: isMobile ? 9 : 10, overflowX: isMobile ? "auto" : "visible", flexWrap: isMobile ? "nowrap" : "wrap", paddingBottom: isMobile ? 2 : 0 }}>
          {isMobile && (
            <>
              <button onClick={() => setDrawer(true)}
                style={{ ...btnSt, flexShrink: 0, fontSize: 12, padding: "6px 11px", background: L.soft, color: L.muted, borderColor: L.border }}>
                <Pencil size={13} /> Editar
              </button>
              <button onClick={() => setPedido(true)}
                style={{ ...btnSt, flexShrink: 0, fontSize: 12, padding: "6px 11px", background: C.red, color: "#fff", borderColor: C.red }}>
                <ShoppingBag size={13} /> Pedido
              </button>
              <button onClick={() => setConfirmElim((v) => !v)} title="Eliminar contacto"
                style={{ ...btnSt, flexShrink: 0, fontSize: 12, padding: "6px 10px", background: confirmElim ? "#FEF2F2" : L.soft, color: confirmElim ? C.red : L.muted, borderColor: confirmElim ? "#FECACA" : L.border }}>
                <Trash2 size={13} />
              </button>
            </>
          )}
          <button onClick={() => upd({ tipo: (contacto.tipo || "prospecto") === "cliente" ? "prospecto" : "cliente" })}
            style={{ ...btnSt, flexShrink: 0, fontSize: 12, background: contacto.tipo === "cliente" ? "#DCFCE7" : "#EEF2FF", color: contacto.tipo === "cliente" ? "#16A34A" : "#6366F1", borderColor: contacto.tipo === "cliente" ? "#86EFAC" : "#C7D2FE" }}>
            {contacto.tipo === "cliente" ? "★ Cliente" : "◎ Prospecto"}
          </button>
          <select value={contacto.vendedor || ""} onChange={(e) => upd({ vendedor: e.target.value })} style={{ ...selSt, flexShrink: 0, fontSize: 12 }}>
            <option value="">Sin vendedor</option>
            {VENDEDORES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={contacto.estado} onChange={(e) => upd({ estado: e.target.value })} style={{ ...selSt, flexShrink: 0, fontSize: 12 }}>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => setPanelSeg((v) => !v)}
            style={{ ...btnSt, flexShrink: 0, fontSize: 12, background: panelSeg ? C.gold : L.soft, color: panelSeg ? "#fff" : L.muted, borderColor: panelSeg ? C.gold : L.border }}>
            <Calendar size={13} /> {isMobile ? "" : "Seguimiento"}
          </button>
          <button onClick={() => upd({ bot_activo: !contacto.bot_activo })}
            style={{ ...btnSt, flexShrink: 0, fontSize: 12, background: contacto.bot_activo ? "#DCFCE7" : "#FEF2F2", color: contacto.bot_activo ? "#15803D" : C.red, borderColor: contacto.bot_activo ? "#86EFAC" : "#FECACA" }}>
            {contacto.bot_activo ? <><Bot size={13} /> Bot</> : <><User size={13} /> {isMobile ? "Agente" : "Yo atiendo"}</>}
          </button>
        </div>
      </div>

      {/* ── Alerta tiempo de respuesta ── */}
      {(() => {
        const espera = calcEspera(contacto);
        if (!espera || espera < 120000) return null; // solo si > 2 min
        const clr = tiempoClr(espera);
        const urgente = espera > 7200000; // > 2 horas
        return (
          <div style={{ background: clr + "12", borderBottom: `2px solid ${clr}40`, padding: isMobile ? "7px 14px" : "7px 22px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>{urgente ? "🚨" : "⏱"}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: clr, flex: 1 }}>
              {urgente ? "¡URGENTE! " : ""}Cliente esperando respuesta hace <strong>{msToStr(espera)}</strong>
            </span>
            <span style={{ fontSize: 11, color: clr, opacity: 0.7, fontWeight: 600 }}>
              {espera < 600000 ? "Normal" : espera < 3600000 ? "Demorado" : "Muy demorado"}
            </span>
          </div>
        );
      })()}

      {/* ── Panel seguimiento ── */}
      {panelSeg && (
        <div style={{ background: "#FFFBEB", borderBottom: `1px solid #FDE68A`, padding: isMobile ? "12px 14px" : "13px 22px", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={lblSt}>Próximo contacto</label>
            <input type="datetime-local" style={{ ...inpSt, width: 215 }}
              defaultValue={contacto.seguimiento_at ? new Date(contacto.seguimiento_at).toISOString().slice(0, 16) : ""}
              onChange={(e) => upd({ seguimiento_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={lblSt}>Nota</label>
            <input style={inpSt} placeholder="Ej: confirmar pedido del finde" defaultValue={contacto.nota_seguimiento || ""} onBlur={(e) => upd({ nota_seguimiento: e.target.value })} />
          </div>
        </div>
      )}

      {/* ── Banner confirmar eliminación ── */}
      {confirmElim && (
        <div style={{ background: "#FEF2F2", borderBottom: `1px solid #FECACA`, padding: isMobile ? "10px 14px" : "10px 22px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Trash2 size={15} color={C.red} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.red, flex: 1 }}>
            ¿Eliminar <strong>{contacto.nombre || contacto.telefono || contacto.email}</strong> y todos sus mensajes? Esta acción no se puede deshacer.
          </span>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={() => setConfirmElim(false)} disabled={eliminando}
              style={{ padding: "6px 14px", borderRadius: 7, border: `1.5px solid ${L.border}`, background: L.white, color: L.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY }}>
              Cancelar
            </button>
            <button onClick={eliminarContacto} disabled={eliminando}
              style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 700, cursor: eliminando ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: eliminando ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={13} /> {eliminando ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        </div>
      )}

      {/* ── Banner bot pausado ── */}
      {!contacto.bot_activo && (
        <div style={{ background: "#FFFBEB", color: "#92400E", fontSize: 12.5, padding: isMobile ? "8px 14px" : "8px 22px", borderBottom: `1px solid #FDE68A`, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <User size={14} /> <strong>{userName}</strong> — estás atendiendo esta conversación directamente.
        </div>
      )}

      {/* ── Mensajes ── */}
      <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 12px" : "18px 22px", background: L.bg, backgroundImage: `radial-gradient(${L.border} 0.5px, transparent 0.5px)`, backgroundSize: "20px 20px", display: "flex", flexDirection: "column", gap: 11 }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: "center", color: L.light, fontSize: 13.5, marginTop: 40 }}>Sin mensajes en esta conversación aún.</div>
        )}
        {mensajes.map((m) => {
          const esCliente = m.direccion === "in";
          const esBot     = m.origen === "bot";
          const esAgente  = m.origen === "agente";
          const hora      = (() => {
            const d = new Date(m.created_at);
            const hoy = new Date();
            const mismoAnio = d.getFullYear() === hoy.getFullYear();
            const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
            if (d.toDateString() === hoy.toDateString()) return time;
            return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", ...(mismoAnio ? {} : { year: "2-digit" }) }) + " · " + time;
          })();
          return (
            <div key={m.id}
              onMouseEnter={() => setHoverMsg(m.id)}
              onMouseLeave={() => setHoverMsg(null)}
              style={{ alignSelf: esCliente ? "flex-start" : "flex-end", maxWidth: "70%", display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
              {/* Remitente */}
              {esCliente && (
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Avatar nombre={contacto.nombre || contacto.telefono} foto={contacto.foto_url} size={20} border="none" />
                  <span style={{ fontSize: 11.5, color: L.muted, fontWeight: 700 }}>{contacto.nombre || contacto.telefono}</span>
                </div>
              )}
              {esBot && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10.5, background: "#FEF9C3", color: "#713F12", padding: "2px 9px", borderRadius: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <Bot size={11} /> Bot · NINIT Group
                  </span>
                </div>
              )}
              {esAgente && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10.5, background: "#FEE2E2", color: C.red, padding: "2px 9px", borderRadius: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                    <User size={11} /> {m.agente || "Agente"} · NINIT Group
                  </span>
                </div>
              )}
              {/* Burbuja */}
              <div style={{ background: esCliente ? L.white : esAgente ? "#FEF2F2" : "#FFFBEB", borderRadius: esCliente ? "3px 14px 14px 14px" : "14px 3px 14px 14px", borderLeft: esCliente ? `3px solid ${L.border}` : "none", borderRight: !esCliente ? `3px solid ${esAgente ? C.red : C.gold}` : "none", padding: "10px 14px", fontSize: 14, color: L.text, boxShadow: "0 1px 4px rgba(0,0,0,.07)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {m.contenido}
              </div>
              {/* Hora + eliminar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: esCliente ? "flex-start" : "flex-end" }}>
                <div style={{ fontSize: 10.5, color: L.light }}>{hora}</div>
                {hoverMsg === m.id && (
                  <button onClick={() => eliminarMensaje(m.id)} title="Eliminar mensaje"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "#EF4444", display: "flex", alignItems: "center", borderRadius: 4, opacity: 0.75 }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0.75}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {err && <div style={{ background: "#FEF2F2", color: C.red, fontSize: 12.5, padding: "9px 22px", fontWeight: 600, borderTop: `1px solid #FECACA`, display: "flex", gap: 8, alignItems: "center" }}>
        <AlertCircle size={15} /> {err}
      </div>}

      {/* ── Input ── */}
      <div style={{ padding: isMobile ? "10px 12px" : "14px 22px", borderTop: `1px solid ${L.border}`, background: L.white, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0, position: "relative" }}>
        {/* Plantillas rápidas */}
        <div ref={plantillasRef} style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setShowPlantillas((v) => !v)} title="Plantillas de respuesta rápida"
            style={{ background: showPlantillas ? C.red : L.soft, color: showPlantillas ? "#fff" : C.red, border: `1.5px solid ${showPlantillas ? C.red : C.red + "55"}`, borderRadius: 11, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, transition: "all .15s", flexShrink: 0 }}>
            <Zap size={15} />
            {!isMobile && <span>Plantillas</span>}
          </button>
          {showPlantillas && (
            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: isMobile ? "calc(100vw - 24px)" : 380, maxHeight: 460, overflowY: "auto", background: L.white, borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,.18)", border: `1px solid ${L.border}`, zIndex: 200 }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={14} color={C.red} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.8 }}>Plantillas rápidas</span>
              </div>
              {PLANTILLAS.map((grupo) => (
                <div key={grupo.grupo}>
                  <div style={{ padding: "8px 16px 4px", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{grupo.grupo}</div>
                  {grupo.items.map((item) => (
                    <button key={item.label} onClick={() => { setTexto(item.texto); setShowPlantillas(false); }}
                      style={{ width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13.5, color: L.text, fontFamily: FONT_BODY, transition: "background .1s", borderBottom: `1px solid ${L.border}40` }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder={isMobile ? "Escribí un mensaje…" : "Escribí un mensaje… (Enter para enviar · Shift+Enter = nueva línea)"} rows={1}
          style={{ flex: 1, resize: "none", border: `1.5px solid ${L.border}`, borderRadius: 11, padding: "11px 14px", fontSize: 14, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none", maxHeight: 120, lineHeight: 1.5 }} />
        <button onClick={enviar} disabled={enviando}
          style={{ background: enviando ? L.light : C.red, color: "#fff", border: "none", borderRadius: 11, padding: isMobile ? "11px 16px" : "11px 22px", fontSize: 14, fontWeight: 700, cursor: enviando ? "default" : "pointer", fontFamily: FONT_DISPLAY, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 7, boxShadow: enviando ? "none" : "0 2px 10px rgba(185,28,28,.3)", transition: "all .2s", flexShrink: 0 }}>
          <Send size={16} /> {enviando || isMobile ? (enviando ? "…" : "") : "Enviar"}
        </button>
      </div>

      {drawer && <ContactoDrawer contacto={contacto} onClose={() => setDrawer(false)} onSave={onUpdateContacto} />}
      {pedidoModal && (
        <NuevoPedidoModal
          contacto={contacto}
          vendedorActual={contacto.vendedor}
          onClose={() => setPedido(false)}
          onGuardado={() => {}}
        />
      )}
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const isMobile = useIsMobile();
  const [session,   setSession]   = useState(null);
  const [perfil,    setPerfil]    = useState(null);
  const [contactos, setContactos] = useState([]);
  const [activo,    setActivo]    = useState(null);
  const [vista,     setVista]     = useState("chat");
  const [ready,     setReady]     = useState(false);
  const tuvoSesion   = useRef(false);
  const sesionDBId   = useRef(null);
  const heartbeatRef = useRef(null);
  const sesInicioRef = useRef(null);

  // ── Auth ─────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); }).catch(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Perfil + contactos + tracking al iniciar sesión ──────
  useEffect(() => {
    if (!session) { setPerfil(null); return; }
    let cleanup = () => {};

    const init = async () => {
      const email = session.user.email;
      let p = await cargarPerfil(email);
      // Si no está en vendedores pero es el dueño, darle acceso CEO completo
      if (!p) {
        p = { nombre: email.split("@")[0], email, role: email === "ninitgroup@gmail.com" ? "ceo" : "vendedor" };
      }
      // Asegurar que ninitgroup@gmail.com SIEMPRE sea CEO aunque la DB diga otra cosa
      if (email === "ninitgroup@gmail.com") p = { ...p, role: "ceo" };
      setPerfil(p);

      const cargar = async () => {
        const { data } = await supabase.from("contactos").select("*").order("updated_at", { ascending: false });
        setContactos(data || []);
      };
      await cargar();

      // Registrar inicio de sesión
      if (p?.id) {
        const ahora = new Date().toISOString();
        sesInicioRef.current = ahora;
        const { data: sesData } = await supabase.from("sesiones_vendedor").insert({
          vendedor_id: p.id,
          vendedor_nombre: p.nombre,
          inicio_sesion: ahora,
          fecha: ahora.slice(0, 10),
        }).select().single();
        if (sesData) sesionDBId.current = sesData.id;

        // Heartbeat cada 2 min
        heartbeatRef.current = setInterval(async () => {
          if (sesionDBId.current && sesInicioRef.current) {
            const durSeg = Math.round((Date.now() - new Date(sesInicioRef.current).getTime()) / 1000);
            await supabase.from("sesiones_vendedor").update({ duracion_seg: durSeg }).eq("id", sesionDBId.current);
          }
        }, 120000);
      }

      const ch = supabase.channel("contactos-feed")
        .on("postgres_changes", { event: "*", schema: "public", table: "contactos" }, cargar).subscribe();

      cleanup = () => {
        supabase.removeChannel(ch);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      };
    };

    init();
    return () => cleanup();
  }, [session]);

  // ── Cerrar sesión + tracking ─────────────────────────────
  const handleLogout = useCallback(async () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (sesionDBId.current && sesInicioRef.current) {
      const durSeg = Math.round((Date.now() - new Date(sesInicioRef.current).getTime()) / 1000);
      await supabase.from("sesiones_vendedor")
        .update({ fin_sesion: new Date().toISOString(), duracion_seg: durSeg })
        .eq("id", sesionDBId.current);
    }
    await supabase.auth.signOut();
  }, []);

  // ── Guardar sesión al cerrar pestaña ─────────────────────
  useEffect(() => {
    const onUnload = () => {
      if (sesionDBId.current && sesInicioRef.current) {
        const durSeg = Math.round((Date.now() - new Date(sesInicioRef.current).getTime()) / 1000);
        supabase.from("sesiones_vendedor")
          .update({ fin_sesion: new Date().toISOString(), duracion_seg: durSeg })
          .eq("id", sesionDBId.current);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const updateContacto = (c) => {
    setContactos((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    if (activo?.id === c.id) setActivo(c);
  };

  const deleteContacto = (id) => {
    setContactos((prev) => prev.filter((x) => x.id !== id));
    setActivo(null);
  };

  // Recarga contactos desde la DB (para que el asistente actualice tras cambios)
  const recargarContactos = useCallback(async () => {
    let query = supabase.from("contactos").select("*").order("updated_at", { ascending: false });
    if (perfil?.role === "vendedor") query = query.eq("vendedor", perfil.nombre);
    const { data } = await query;
    if (data) setContactos(data);
  }, [perfil]);

  if (session) tuvoSesion.current = true;
  if (!ready) return null;
  if (!session && !tuvoSesion.current) return (<><FontLoader /><Login /></>);
  if (!session) return null;

  const userEmail = session.user.email;
  const userName  = perfil?.nombre || userEmail.split("@")[0].replace(/^\w/, (m) => m.toUpperCase());
  const rol       = getRol(perfil);
  const alertas   = calcularAlertas(contactos);

  const mobileInPanel = isMobile && (
    activo !== null ||
    vista === "pedidos" || vista === "reportes" || vista === "admin" ||
    vista === "control" || vista === "diario" || vista === "directorio"
  );

  return (
    <div className={`app-layout${mobileInPanel ? " in-panel" : ""}`}
      style={{ fontFamily: FONT_BODY, background: L.bg }}>
      <FontLoader />

      <div className="app-sidebar">
        <Sidebar contactos={contactos} activo={activo}
          onSelect={(c) => setActivo(c)}
          onLogout={handleLogout}
          userEmail={userEmail} userName={userName}
          vista={vista} setVista={setVista} alertas={alertas}
          isMobile={isMobile} rol={rol} perfil={perfil} />
      </div>

      <div className="app-main">
        {vista === "directorio" && rol === "ceo" ? (
          <>
            {isMobile && <MobileBack title="Directorio" onBack={() => setVista("chat")} />}
            <div style={{ flex: 1, overflowY: "auto", height: "100%" }}><Directorio /></div>
          </>
        ) : vista === "admin" && rol === "ceo" ? (
          <>
            {isMobile && <MobileBack title="Admin" onBack={() => setVista("chat")} />}
            <AdminPanel userName={userName} isMobile={isMobile} />
          </>
        ) : vista === "reportes" && rol === "ceo" ? (
          <>
            {isMobile && <MobileBack title="Reportes" onBack={() => setVista("chat")} />}
            <div className="scroll-y" style={{ flex: 1, overflowY: "auto" }}><Reportes /></div>
          </>
        ) : vista === "control" && rol === "ceo" ? (
          <>
            {isMobile && <MobileBack title="Control" onBack={() => setVista("chat")} />}
            <div style={{ flex: 1, overflowY: "auto", height: "100%" }}>
              <CEODashboard isMobile={isMobile} />
            </div>
          </>
        ) : vista === "diario" && rol === "vendedor" ? (
          <>
            {isMobile && <MobileBack title="Mi Día" onBack={() => setVista("chat")} />}
            <div style={{ flex: 1, overflowY: "auto", height: "100%" }}>
              <DiarioVendedor perfil={perfil} isMobile={isMobile} contactos={contactos}
                onAbrirChat={(c) => { setActivo(c); setVista("chat"); }} />
            </div>
          </>
        ) : vista === "pedidos" ? (
          <>
            {isMobile && <MobileBack title="Pedidos" onBack={() => setVista("chat")} />}
            <div className="scroll-y" style={{ flex: 1, overflowY: "auto" }}><PedidosPanel /></div>
          </>
        ) : activo ? (
          <ChatPanel contacto={activo} onUpdateContacto={updateContacto} onDeleteContacto={deleteContacto} userName={userName}
            onBack={isMobile ? () => setActivo(null) : undefined}
            isMobile={isMobile} />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: L.bg, flexDirection: "column", gap: 20 }}>
            <img src={LOGO_URL} alt="NINIT Group" style={{ width: "min(340px, 62%)", objectFit: "contain", filter: "drop-shadow(0 4px 20px rgba(58,141,194,0.5))" }} />
            <div>
              <div style={{ color: L.muted, fontSize: 14, textAlign: "center", marginTop: 8 }}>
                {rol === "ceo"
                  ? `Bienvenido, ${userName} · Panel CEO activo`
                  : `Hola ${userName} · Seleccioná una conversación para comenzar`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center", padding: "0 20px" }}>
              {rol === "ceo"
                ? [[<MessageSquare size={16} />, "Chats en tiempo real"], [<Bot size={16} />, "Bot WhatsApp integrado"], [<Activity size={16} />, "Control de vendedores"]].map(([icon, txt]) => (
                    <div key={txt} style={{ padding: "10px 18px", background: L.white, border: `1px solid ${L.border}`, borderRadius: 12, fontSize: 13, color: L.muted, display: "flex", alignItems: "center", gap: 8, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
                      <span style={{ color: C.red }}>{icon}</span> {txt}
                    </div>
                  ))
                : [[<MessageSquare size={16} />, "Tus conversaciones"], [<Bot size={16} />, "Bot WhatsApp integrado"], [<BookOpen size={16} />, "Mi Día — diario personal"]].map(([icon, txt]) => (
                    <div key={txt} style={{ padding: "10px 18px", background: L.white, border: `1px solid ${L.border}`, borderRadius: 12, fontSize: 13, color: L.muted, display: "flex", alignItems: "center", gap: 8, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
                      <span style={{ color: C.red }}>{icon}</span> {txt}
                    </div>
                  ))
              }
            </div>
          </div>
        )}
      </div>

      <AIAsistente contactoActivo={activo} alertas={alertas} contactos={contactos} nombreUsuario={userName} rol={rol} onRefrescar={recargarContactos} />
    </div>
  );
}

// ============================================================
// ESTILOS BASE
// ============================================================
const lblSt  = { display: "block", fontSize: 11.5, color: L.muted, marginBottom: 6, fontWeight: 700, letterSpacing: 0.3 };
const inpSt  = { width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: 8, border: `1.5px solid ${L.border}`, fontSize: 14, fontFamily: FONT_BODY, background: L.white, color: L.text, outline: "none" };
const selSt  = { border: `1.5px solid ${L.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: FONT_BODY, background: L.white, color: L.text, cursor: "pointer", fontWeight: 500, outline: "none" };
const btnSt  = { border: "1.5px solid", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6, transition: "all .15s" };
