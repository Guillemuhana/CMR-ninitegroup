// v2.1 — 2026-06-08
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, Search, LogOut, MessageSquare, BarChart2, Package,
  Pencil, Bot, User, Calendar, Send, X, Check, Plus,
  Sparkles, Phone, PhoneCall, Mail, Building2, MapPin, FileText,
  AlertCircle, Clock, ChevronDown, ChevronLeft, ChevronRight, Zap, ShoppingBag, Shield, Trash2,
  BookOpen, Activity, Mic, MicOff, Volume2, VolumeX, Menu, Users, Eye, EyeOff,
  Image as ImageIcon, Languages, Reply, SlidersHorizontal, Star,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { SiGmail, SiGoogleads, SiMessenger } from "react-icons/si";
import { Receipt } from "@phosphor-icons/react";
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
import Agenda from "./Agenda";
import Directorio from "./Directorio";
import FiltrosModal, { FILTROS_INICIAL, contarActivos, aplicaFiltrosIA } from "./FiltrosModal";

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
// Margen para ignorar el artefacto de orden in/out: si el bot/agente respondió
// dentro de este lapso del último inbound, se considera ya respondido.
const ESPERA_TOLERANCIA_MS = 90000; // 1.5 min
// "Espera" = un HUMANO debe responder. Si el bot está activo, él contesta solo
// y no hay espera (para ese caso se usa "sin revisar").
function calcEspera(c) {
  if (!c.ultimo_in_at) return null;
  if (c.bot_activo) return null;
  if (c.ultimo_out_at) {
    const diff = new Date(c.ultimo_in_at).getTime() - new Date(c.ultimo_out_at).getTime();
    if (diff <= ESPERA_TOLERANCIA_MS) return null; // ya respondido (o casi simultáneo)
  }
  return Date.now() - new Date(c.ultimo_in_at).getTime();
}
// Tiempo que la consulta lleva SIN que el vendedor la haya visto/abierto,
// aunque el bot ya haya respondido. null = ya revisada (o sin mensajes del cliente).
function calcSinRevisar(c) {
  if (!c.ultimo_in_at) return null;
  const revisada = c.revisado_at && new Date(c.revisado_at) >= new Date(c.ultimo_in_at);
  if (revisada) return null;
  return Date.now() - new Date(c.ultimo_in_at).getTime();
}

// ── Filtro inteligente: clientes que piden contacto humano ──────
// Detecta a los que piden que los llamen o quieren hablar con un vendedor/ventas.
// Combina las señales de IA (columnas ia_* si el chat fue analizado) con una
// heurística instantánea sobre el último mensaje del cliente (sin análisis previo).
const RE_PIDE_LLAMADA = /(ll[aá]m(a|e)me|me\s+llam(en|e|an|as|ás)|(quiero|necesito|puede[ns]?|podr[ií]a[ns]?)\s+(una\s+)?llam(ada|arme|en)|ll[aá]menme|call\s+me|give\s+me\s+a\s+call|can\s+you\s+call|phone\s+call|reach\s+me\s+by\s+phone|mi\s+(n[uú]mero|tel[eé]fono)\s+(es|:))/i;
const RE_PIDE_HUMANO = /(hablar\s+con\s+(un[oa]?\s+)?(humano|persona|alguien|vendedor|agente|representante|asesor|ventas)|con\s+un\s+(humano|vendedor|asesor|agente|representante)|talk\s+to\s+(a\s+)?(human|person|someone|sales|agent|representative|rep)|speak\s+(to|with)\s+(a\s+)?(human|sales|someone|agent|representative)|quiero\s+hablar\s+con\s+ventas|atenci[oó]n\s+humana)/i;

// Devuelve { pide, motivo } donde motivo ∈ "llamada" | "ventas" | "urgente".
function pideContacto(c) {
  if (!c) return { pide: false };
  if (c.ia_intencion === "llamada_telefonica") return { pide: true, motivo: "llamada" };
  if (c.ia_intencion === "agente_ventas")      return { pide: true, motivo: "ventas" };
  if (c.ia_urgencia === "alta_prioridad")       return { pide: true, motivo: "urgente" };
  // Heurística solo si el ÚLTIMO mensaje es del cliente (entrante), para no
  // matchear cuando el que escribió "te llamo" fue el vendedor.
  const ultimoEsEntrante = c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) >= new Date(c.ultimo_out_at));
  if (ultimoEsEntrante) {
    const t = c.ultimo_msg || "";
    if (RE_PIDE_LLAMADA.test(t)) return { pide: true, motivo: "llamada" };
    if (RE_PIDE_HUMANO.test(t))  return { pide: true, motivo: "ventas" };
  }
  return { pide: false };
}
const PIDE_BADGE = {
  llamada: { label: "Pide llamada", color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5" },
  ventas:  { label: "Quiere hablar", color: "#6D28D9", bg: "#F3E8FF", border: "#DDD6FE" },
  urgente: { label: "Urgente",      color: "#B45309", bg: "#FEF3C7", border: "#FDE68A" },
};

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
No hay showroom tradicional — la mayoría de las unidades se construyen a pedido, pero se pueden compartir fotos reales, el catálogo y avances de producción.
IMÁGENES POR MODELO (links oficiales — el vendedor las manda al cliente; vos podés sugerir cuál usar). Cada modelo tiene exterior, y según el modelo: interior, plano y/o video. La paleta de colores es la misma para todos los modelos.
EXTERIORES:
- 2-Stall White Marble → https://ninitgroup.com/wp-content/uploads/2026/05/2bano.png
- 3-Stall (el más popular) → https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.48-PM.jpeg
- 4-Stall → https://ninitgroup.com/wp-content/uploads/2026/05/4bano.png
- ADA+2 → https://ninitgroup.com/wp-content/uploads/2026/05/ada22.png
- 6-Stall → https://ninitgroup.com/wp-content/uploads/2026/05/6bano.png
- Vista general / render → https://ninitgroup.com/wp-content/uploads/2026/05/ChatGPT-Image-21-may-2026-12_16_51-p.m.png
INTERIORES:
- 2-Stall y 3-Stall (comparten el mismo interior):
  - https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-1-1.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-1.jpeg
- 4-Stall, 5-Stall y 6-Stall (comparten el mismo interior):
  - https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.48-PM-1-1.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-3.jpeg
- ADA+2: https://ninitgroup.com/wp-content/uploads/2026/01/dfhxvb.png
PLANOS (floor plans):
- 2-Stall → https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1-1.jpeg
- 3-Stall → https://ninitgroup.com/wp-content/uploads/2026/05/PHOTO-2026-01-08-01-13-01-1.jpg
- 4-Stall → https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-11-at-4.39.53-PM.jpeg
VIDEO:
- 2-Stall (walkthrough) → https://ninitgroup.com/wp-content/uploads/2026/06/2_stalls_con_musica.mp4
PALETA DE COLORES (misma para todos los modelos):
- https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1.jpeg
Usá SOLO estos links. No inventes otras URLs de imágenes. En el chat el vendedor tiene un botón "Fotos" → elige el modelo → elige Exterior / Interior / Plano / Video / Paleta.
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
// WELCOME SPLASH — bienvenida al iniciar sesión (fade + zoom)
// ============================================================
function WelcomeSplash({ onDone }) {
  const [phase, setPhase] = useState("in"); // in → hold → out
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 60);   // disparar entrada
    const t2 = setTimeout(() => setPhase("out"), 2200);  // empezar salida
    const t3 = setTimeout(() => onDone(), 3050);         // desmontar
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const isIn  = phase === "in";
  const isOut = phase === "out";

  return (
    <div onClick={() => setPhase("out")}
      style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        background: "radial-gradient(circle at 50% 42%, #0a1726 0%, #03070e 60%, #000 100%)",
        opacity: isIn || isOut ? 0 : 1, transition: "opacity .8s ease" }}>
      <img src="/bienvenida.png" alt="NinitGroup — Sistema de CMR"
        style={{ width: "min(74vw, 460px)", maxHeight: "82vh", objectFit: "contain",
          opacity: isIn || isOut ? 0 : 1,
          transform: isIn ? "scale(.82)" : isOut ? "scale(1.1)" : "scale(1)",
          transition: "transform 1s cubic-bezier(.22,1,.36,1), opacity .85s ease",
          filter: "drop-shadow(0 0 55px rgba(56,170,255,.4))" }} />
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
function AlertasBtn({ alertas, onSelect, onDescartar, onDescartarTodas }) {
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
            {alertas.length > 0 && onDescartarTodas && (
              <button onClick={(e) => { e.stopPropagation(); onDescartarTodas(); }}
                title="Marcar todas como vistas"
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: C.red, fontFamily: FONT_BODY, fontWeight: 700, fontSize: 11, textTransform: "none", letterSpacing: 0, display: "flex", alignItems: "center", gap: 4 }}>
                <Check size={13} /> Marcar todas
              </button>
            )}
          </div>
          {alertas.length === 0
            ? <div style={{ padding: 24, color: L.muted, fontSize: 14, textAlign: "center" }}>Sin alertas pendientes ✓</div>
            : alertas.map((a) => (
              <div key={a.id}
                style={{ padding: "12px 18px", borderBottom: `1px solid ${L.border}`, display: "flex", gap: 10, alignItems: "flex-start", transition: "background .12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = L.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                  {a.tipo === "sin_respuesta" ? "⏰" : a.tipo === "lead_sin_asignar" ? "👤" : "📌"}
                </span>
                <span onClick={() => { onSelect(a.contacto); onDescartar?.(a.id); setOpen(false); }}
                  style={{ flex: 1, fontSize: 13, color: L.text, lineHeight: 1.45, cursor: "pointer" }}>{a.texto}</span>
                {onDescartar && (
                  <button onClick={(e) => { e.stopPropagation(); onDescartar(a.id); }}
                    title="Marcar como vista" aria-label="Descartar alerta"
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: L.light, padding: 2, display: "flex", borderRadius: 6 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; e.currentTarget.style.color = C.red; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = L.light; }}>
                    <X size={14} />
                  </button>
                )}
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

  // Agenda: crea un evento (reunión, llamada, visita, etc.) en agenda_vendedor.
  // El front inyecta vendedor_id/vendedor_nombre del usuario logueado por defecto.
  agregar_evento: async ({ fecha, hora, titulo, tipo = "reunion", cliente_nombre, nota, vendedor_id, vendedor_nombre }) => {
    if (!fecha || !titulo?.trim()) return "⚠️ Necesito al menos la fecha y el título del evento.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "⚠️ La fecha debe ser AAAA-MM-DD.";
    // Si dieron un nombre de vendedor en vez de id, resolverlo.
    if (vendedor_nombre && !vendedor_id) {
      const { data } = await supabase.from("vendedores").select("id,nombre").ilike("nombre", `%${vendedor_nombre}%`).limit(1);
      if (data && data[0]) { vendedor_id = data[0].id; vendedor_nombre = data[0].nombre; }
    }
    if (!vendedor_id) return "⚠️ No pude identificar a quién asignar el evento.";
    const tiposOk = ["reunion", "llamada", "visita", "seguimiento", "otro"];
    const horaNorm = hora ? (hora.length === 5 ? `${hora}:00` : hora) : null;
    const payload = {
      vendedor_id,
      vendedor_nombre: vendedor_nombre || null,
      fecha,
      hora: horaNorm,
      tipo: tiposOk.includes(tipo) ? tipo : "otro",
      titulo: titulo.trim(),
      cliente_nombre: cliente_nombre || null,
      nota: nota?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("agenda_vendedor").insert(payload);
    return error ? `Error: ${error.message}` : `✅ Agendado en tu Agenda: "${titulo.trim()}" el ${fecha}${hora ? " a las " + hora : ""}.`;
  },

  // Modifica un evento existente de la agenda (por id).
  actualizar_evento: async ({ id, fecha, hora, titulo, tipo, cliente_nombre, nota }) => {
    if (!id) return "⚠️ Falta el id del evento (buscalo primero con buscar_agenda).";
    const cambios = { updated_at: new Date().toISOString() };
    if (fecha) { if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "⚠️ La fecha debe ser AAAA-MM-DD."; cambios.fecha = fecha; }
    if (hora !== undefined) cambios.hora = hora ? (hora.length === 5 ? `${hora}:00` : hora) : null;
    if (titulo) cambios.titulo = titulo.trim();
    if (tipo) cambios.tipo = ["reunion", "llamada", "visita", "seguimiento", "otro"].includes(tipo) ? tipo : "otro";
    if (cliente_nombre !== undefined) cambios.cliente_nombre = cliente_nombre || null;
    if (nota !== undefined) cambios.nota = nota || null;
    const { error } = await supabase.from("agenda_vendedor").update(cambios).eq("id", id);
    return error ? `Error: ${error.message}` : `✅ Evento actualizado.`;
  },

  // Marca un evento como hecho / pendiente.
  completar_evento: async ({ id, completado = true }) => {
    if (!id) return "⚠️ Falta el id del evento.";
    const { error } = await supabase.from("agenda_vendedor").update({ completado: !!completado, updated_at: new Date().toISOString() }).eq("id", id);
    return error ? `Error: ${error.message}` : `✅ Evento marcado como ${completado ? "hecho" : "pendiente"}.`;
  },

  eliminar_evento: async ({ id }) => {
    if (!id) return "⚠️ Falta el id del evento.";
    const { error } = await supabase.from("agenda_vendedor").delete().eq("id", id);
    return error ? `Error: ${error.message}` : `✅ Evento eliminado de la Agenda.`;
  },
};

// ── Consultas de solo lectura (para TODOS los roles) ──────────
// Devuelven texto con los datos reales para que la IA arme la respuesta.
const CONSULTAR_ACCION = {
  // Busca eventos en la agenda (llamadas, reuniones, visitas, seguimientos).
  buscar_agenda: async ({ vendedor_id, vendedor_nombre, desde, hasta, tipo_evento, solo_pendientes, todos }) => {
    let q = supabase.from("agenda_vendedor")
      .select("id,fecha,hora,tipo,titulo,cliente_nombre,nota,completado,vendedor_nombre")
      .order("fecha", { ascending: true }).order("hora", { ascending: true, nullsFirst: true }).limit(40);
    if (!todos && vendedor_id) q = q.eq("vendedor_id", vendedor_id);
    else if (!todos && vendedor_nombre) q = q.ilike("vendedor_nombre", `%${vendedor_nombre}%`);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (tipo_evento) q = q.eq("tipo", tipo_evento);
    if (solo_pendientes) q = q.or("completado.is.null,completado.eq.false");
    const { data, error } = await q;
    if (error) return `Error consultando la agenda: ${error.message}`;
    if (!data?.length) return "No hay eventos que coincidan con esa búsqueda.";
    return data.map((e) =>
      `• [id ${e.id}] ${e.fecha}${e.hora ? " " + e.hora.slice(0, 5) : ""} — ${e.tipo}: ${e.titulo}` +
      `${e.cliente_nombre ? ` (cliente: ${e.cliente_nombre})` : ""}${e.completado ? " ✔hecho" : ""}` +
      `${todos && e.vendedor_nombre ? ` — ${e.vendedor_nombre}` : ""}`
    ).join("\n");
  },

  // Busca contactos/clientes por nombre, teléfono, email, estado o vendedor.
  buscar_contactos: async ({ texto, estado, vendedor, limit = 10 }) => {
    let q = supabase.from("contactos")
      .select("id,nombre,telefono,email,estado,vendedor,ultimo_msg,seguimiento_at")
      .order("updated_at", { ascending: false }).limit(Math.min(Number(limit) || 10, 20));
    if (estado) q = q.eq("estado", estado);
    if (vendedor) q = q.ilike("vendedor", `%${vendedor}%`);
    if (texto) {
      const t = String(texto).replace(/[%,()]/g, " ").trim();
      if (t) q = q.or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,email.ilike.%${t}%`);
    }
    const { data, error } = await q;
    if (error) return `Error consultando contactos: ${error.message}`;
    if (!data?.length) return "No encontré contactos que coincidan.";
    return data.map((c) =>
      `• [id ${c.id}] ${c.nombre || c.telefono || c.email || "Sin nombre"} — estado: ${c.estado || "?"}` +
      `${c.vendedor ? ` — vendedor: ${c.vendedor}` : ""}${c.telefono ? ` — tel: ${c.telefono}` : ""}` +
      `${c.seguimiento_at ? ` — seguimiento: ${String(c.seguimiento_at).slice(0, 10)}` : ""}`
    ).join("\n");
  },
};

function AIAsistente({ contactoActivo, alertas = [], contactos = [], nombreUsuario = "", perfilId = null, rol = "vendedor", onRefrescar, niniPrompt = "" }) {
  const isMobile   = useIsMobile();
  const [open, setOpen]           = useState(false);
  const [msgs, setMsgs]           = useState([]);
  const [input, setInput]         = useState("");
  const [typing, setTyping]       = useState(false);
  const [grabando, setGrabando]   = useState(false);
  const [hablando, setHablando]   = useState(false);
  const [vozOn, setVozOn]         = useState(false);
  const [sttOk, setSttOk]         = useState(false);
  const [transcrib, setTranscrib] = useState("");
  const [briefingHecho, setBriefing] = useState(false);
  const bottomRef      = useRef(null);
  const recognitionRef = useRef(null);
  const audioCtxRef    = useRef(null);  // AudioContext — desbloqueado por gesto del usuario
  const audioSrcRef    = useRef(null);  // AudioBufferSourceNode activo
  const audioRef       = useRef(null);
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
  // Desactivado: no enviar saludos automáticos
  /* useEffect(() => {
    if (!open || saludadoRef.current || !nombreUsuario) return;
    saludadoRef.current = true;
    const hora   = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    const nombre = nombreUsuario.split(" ")[0];
    // Pequeño delay para que el AudioContext esté desbloqueado
    const t = setTimeout(() => {
      const mensaje = `${saludo} ${nombre}. ¿Cómo estás? ¿Puedo ayudarte en algo?`;
      if (vozOnRef.current) {
        hablar(mensaje);
      } else {
        setMsgs((p) => [...p, { from: "ai", text: mensaje }]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [open, nombreUsuario, hablar]); */

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

    const primerNombre = (nombreUsuario || "").split(" ")[0] || "equipo";
    let briefing = `${saludo}, ${primerNombre}.`;
    if (urgentes > 0)       briefing += ` Hay ${urgentes} cliente${urgentes > 1 ? "s" : ""} esperando respuesta urgente.`;
    if (segVencidos > 0)    briefing += ` Tenés ${segVencidos} seguimiento${segVencidos > 1 ? "s" : ""} vencido${segVencidos > 1 ? "s" : ""}.`;
    if (sinRespuesta > 0 && urgentes === 0) briefing += ` Hay ${sinRespuesta} conversación${sinRespuesta > 1 ? "es" : ""} sin responder.`;
    if (urgentes === 0 && segVencidos === 0 && sinRespuesta === 0) briefing += ` Todo está al día. ¿En qué te ayudo?`;
    else briefing += ` ¿Arrancamos por eso?`;

    setMsgs([{ from: "ai", text: briefing }]);
    if (vozOnRef.current) hablar(briefing);
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

  // ── Reporte por vendedor (solo CEO) — datos para informes ──
  const reporteCEORef = useRef({ ts: 0, texto: "" });
  const cargarReporteCEO = useCallback(async () => {
    const hoy = new Date();
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
    const desde7 = new Date(); desde7.setDate(desde7.getDate() - 6);
    const desde7Str = `${desde7.getFullYear()}-${String(desde7.getMonth() + 1).padStart(2, "0")}-${String(desde7.getDate()).padStart(2, "0")}`;
    const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
    const safe = async (p) => { try { const { data, error } = await p; return error ? [] : (data || []); } catch { return []; } };

    const [vends, pedidos, diarios, sesiones, agenda, msgsHoy] = await Promise.all([
      safe(supabase.from("vendedores").select("id,nombre,role,activo").eq("activo", true)),
      safe(supabase.from("pedidos").select("vendedor,total,estado,created_at")),
      safe(supabase.from("diario_vendedor").select("vendedor_id,fecha,completado,estado_animo,valoracion_nota,valoracion_comentario").gte("fecha", desde7Str).order("fecha", { ascending: false })),
      safe(supabase.from("sesiones_vendedor").select("vendedor_id,duracion_seg,fecha").gte("fecha", desde7Str)),
      safe(supabase.from("agenda_vendedor").select("vendedor_id,fecha,hora,tipo,titulo,completado").gte("fecha", hoyStr).order("fecha").order("hora", { nullsFirst: true })),
      safe(supabase.from("mensajes").select("agente,created_at").eq("direccion", "out").gte("created_at", inicioDia.toISOString())),
    ]);

    const vendedoresList = vends.filter((v) => v.role === "vendedor");
    const ANIMO = { excelente: "excelente", bien: "bien", neutro: "normal", mal: "difícil", muy_mal: "mal día" };

    const bloques = vendedoresList.map((v) => {
      const misC = contactos.filter((c) => c.vendedor === v.nombre);
      const porEstado = {}; misC.forEach((c) => { const k = c.estado || "nuevo"; porEstado[k] = (porEstado[k] || 0) + 1; });
      const activos  = misC.filter((c) => !["vendido", "perdido", "cerrado"].includes(c.estado)).length;
      const vendidos = misC.filter((c) => c.estado === "vendido" || c.estado === "cerrado").length;
      const perdidos = misC.filter((c) => c.estado === "perdido").length;
      const sinResp  = misC.filter((c) => !c.bot_activo && c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at))).length;
      const pedV     = pedidos.filter((p) => p.vendedor === v.nombre);
      const pedMes   = pedV.filter((p) => { const d = new Date(p.created_at); return d.getMonth() === mesActual && d.getFullYear() === anioActual; });
      const montoMes = pedMes.reduce((s, p) => s + (Number(p.total) || 0), 0);
      const minWeek  = Math.round(sesiones.filter((s) => s.vendedor_id === v.id).reduce((a, s) => a + (s.duracion_seg || 0), 0) / 60);
      const diarioHoy = diarios.find((d) => d.vendedor_id === v.id && d.fecha === hoyStr);
      const ultimaVal = diarios.find((d) => d.vendedor_id === v.id && d.valoracion_nota);
      const msgsV     = msgsHoy.filter((m) => m.agente === v.nombre).length;
      const agV       = agenda.filter((a) => a.vendedor_id === v.id && !a.completado);
      const proxAg    = agV.slice(0, 3).map((a) => `${a.fecha}${a.hora ? " " + a.hora.slice(0, 5) : ""} ${a.titulo}`).join("; ");
      const pipelineTxt = Object.entries(porEstado).map(([k, n]) => `${n} ${ESTADOS[k]?.label || k}`).join(", ") || "sin leads";

      let b = `▸ ${v.nombre}:\n`;
      b += `  Pipeline: ${activos} activos (${pipelineTxt}) | ${vendidos} vendidos | ${perdidos} perdidos\n`;
      b += `  Pendientes: ${sinResp} sin responder\n`;
      b += `  Ventas: ${pedMes.length} pedidos este mes${montoMes ? " ($" + montoMes.toLocaleString("en-US") + ")" : ""} | ${pedV.length} total histórico\n`;
      b += `  Actividad: ${msgsV} mensajes enviados hoy | ${minWeek} min en app (últimos 7 días)\n`;
      b += diarioHoy
        ? `  Diario hoy: ${diarioHoy.completado ? "completado" : "pendiente/borrador"} (ánimo: ${ANIMO[diarioHoy.estado_animo] || "-"})\n`
        : `  Diario hoy: sin registrar\n`;
      if (ultimaVal) b += `  Última valoración de Nicolás: ${ultimaVal.valoracion_nota}/5${ultimaVal.valoracion_comentario ? ` "${ultimaVal.valoracion_comentario}"` : ""}\n`;
      b += `  Agenda próxima: ${agV.length} tareas pendientes${proxAg ? " → " + proxAg : ""}`;
      return b;
    });

    const texto = vendedoresList.length
      ? `\n\n════ DATOS POR VENDEDOR (usalos cuando Nicolás pida un reporte/desempeño) ════\n${bloques.join("\n\n")}`
      : "";
    reporteCEORef.current = { ts: Date.now(), texto };
    return texto;
  }, [contactos]);

  // ── Enviar mensaje ────────────────────────────────────────
  const enviar = useCallback(async (textoForzado) => {
    const q = (textoForzado || input).trim();
    if (!q || typing) return;
    const historial = [...msgs];
    setMsgs((p) => [...p, { from: "user", text: q }]);
    setInput(""); setTranscrib(""); setTyping(true);

    try {
      // Contexto del CRM
      const sinResp  = contactos.filter((c) => !c.bot_activo && c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at))).length;
      const segVenc  = alertas.filter((a) => a.tipo === "seguimiento").length;
      const _hoy = new Date();
      const _hoyISO = `${_hoy.getFullYear()}-${String(_hoy.getMonth() + 1).padStart(2, "0")}-${String(_hoy.getDate()).padStart(2, "0")}`;
      let sysExtra = `\n\nFECHA DE HOY: ${_hoy.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (ISO: ${_hoyISO}). Usá esta fecha para calcular fechas relativas como "hoy", "mañana" o "el 27 de junio".`;
      sysExtra += `\nUSUARIO ACTUAL: ${nombreUsuario || "Usuario"} (${rol === "ceo" ? "CEO" : "Vendedor"}).`;
      sysExtra += `\nESTADO ACTUAL DEL CRM: ${contactos.length} contactos totales | ${sinResp} sin respuesta | ${segVenc} seguimientos vencidos | ${alertas.length} alertas activas.`;
      if (contactoActivo) {
        const est = ESTADOS[contactoActivo.estado];
        sysExtra += `\nCONTACTO ABIERTO: ${contactoActivo.nombre || contactoActivo.telefono} (id: ${contactoActivo.id}) | ${est?.label || contactoActivo.estado} | vendedor: ${contactoActivo.vendedor || "sin asignar"}`;
      }
      if (vozOnRef.current) sysExtra += "\nMODO VOZ ACTIVO: máximo 2 oraciones, sin listas, sin markdown, lenguaje natural hablado.";
      // El reporte por vendedor es MUY pesado en tokens. Solo lo incluimos cuando
      // la consulta es sobre reportes/desempeño/equipo, para no agotar la cuota de Groq.
      const pideReporte = /report|resumen|desempe|rendimiento|informe|equipo|vendedor|ranking|compar|c[oó]mo va|como va|productiv|ventas del|pipeline|m[eé]tricas?|kpi/i.test(q);
      if (rol === "ceo" && pideReporte) {
        if (Date.now() - reporteCEORef.current.ts > 60000) { await cargarReporteCEO(); }
        sysExtra += reporteCEORef.current.texto;
        sysExtra += `\n\n════ REPORTES DE VENDEDORES (sos CEO) ════
Cuando Nicolás pida un REPORTE, RESUMEN o el DESEMPEÑO de un vendedor (ej: "dame un reporte de Fernando") o de todo el equipo, armá un informe PROFESIONAL, completo y ordenado usando los DATOS POR VENDEDOR de arriba. Incluí: pipeline y leads activos, pendientes sin responder, ventas del mes, actividad (mensajes/tiempo), estado del diario (si lo completó y su ánimo), tu última valoración, y la agenda próxima. Estructuralo con secciones o viñetas claras, destacá lo positivo y lo que hay que mejorar, y cerrá con 1-2 recomendaciones concretas. Si comparás vendedores, hacelo de forma objetiva. NUNCA inventes números: usá solo los datos provistos; si falta un dato, decí "sin datos".`;
      }
      // Consultas de solo lectura — disponibles para TODOS (vendedores y CEO).
      sysExtra += `\n\n════ CONSULTAR EL CRM (podés buscar datos reales) ════
Cuando el usuario quiera VER o BUSCAR algo del CRM (su agenda, llamadas, seguimientos, clientes), NO digas que no tenés acceso: pedí los datos con UNA SOLA LÍNEA final:
<ACCION>{"tipo":"buscar_agenda", ...}</ACCION>   o   <ACCION>{"tipo":"buscar_contactos", ...}</ACCION>
Yo ejecuto la consulta y te devuelvo los datos reales para que armes la respuesta. Nunca inventes: usá SOLO lo que te devuelvo.
- buscar_agenda: { "desde":"AAAA-MM-DD (opcional)", "hasta":"AAAA-MM-DD (opcional)", "tipo_evento":"llamada|reunion|visita|seguimiento (opcional)", "solo_pendientes":true (opcional), "vendedor_nombre":"(opcional; por defecto TU agenda)", "todos":true (opcional; solo CEO, agenda de todo el equipo) }
- buscar_contactos: { "texto":"nombre/tel/email (opcional)", "estado":"(opcional)", "vendedor":"(opcional)", "limit":10 }
Calculá "hoy", "mañana", "esta semana" con la FECHA DE HOY de arriba. Ej: "¿qué llamadas tengo hoy?" → buscar_agenda con tipo_evento "llamada", desde y hasta = hoy.`;

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
- agregar_evento: { "fecha": "AAAA-MM-DD", "hora": "HH:MM 24hs (opcional)", "titulo": "...", "tipo": "reunion|llamada|visita|seguimiento|otro (opcional, default reunion)", "cliente_nombre": "...(opcional, si es con un cliente)", "nota": "...(opcional)", "vendedor_nombre": "...(opcional; por defecto se agenda para vos)" }
- actualizar_evento: { "id": "id del evento (buscalo con buscar_agenda)", "fecha": "...(opcional)", "hora": "...(opcional)", "titulo": "...(opcional)", "tipo": "...(opcional)", "nota": "...(opcional)" }
- completar_evento: { "id": "id del evento", "completado": true }
- eliminar_evento: { "id": "id del evento" }

REGLAS ESTRICTAS:
0. Para agenda SÍ tenés acceso: agregar/modificar/completar/eliminar eventos y buscar_agenda. Convertí fecha/hora al formato AAAA-MM-DD y HH:MM con la FECHA DE HOY. Para modificar/completar/eliminar un evento, PRIMERO buscalo con buscar_agenda para obtener su id.
1. Incluí <ACCION> SIEMPRE que el usuario pida un cambio concreto, aunque te falte algún dato opcional.
2. Si el dato es REQUERIDO y falta, preguntá PRIMERO y ejecutá cuando lo tengas.
3. Para ELIMINAR: confirmá en la respuesta antes de incluir <ACCION>.
4. El bloque <ACCION> va SOLO en la última línea, sin texto después.
5. Solo un <ACCION> por respuesta.`;

      // NO incluimos niniPrompt acá: ese es el master prompt del BOT que atiende
      // clientes (ventas), no lo necesita el asistente ejecutivo interno y hace que
      // el request supere el límite de tokens/minuto de Groq. Limitamos el historial
      // a los últimos turnos para mantener el request liviano.
      const apiMsgs = [
        { role: "system", content: GROK_SYSTEM + sysExtra },
        ...historial.slice(-6).map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
        { role: "user", content: q },
      ];
      // Misma IA que el botón "Avanzar": Groq server-side vía /api/asistente
      // (usa GROQ_API_KEY, sin exponer la clave en el navegador).
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, max_tokens: vozOnRef.current ? 130 : (rol === "ceo" ? 1400 : 700) }),
      });
      if (res.ok) {
        const data = await res.json();
        let resp = data.contenido || "";

        // ── Detectar acción: consulta (todos) o cambio (CEO) ──
        const accionMatch = resp.match(/<ACCION>([\s\S]*?)<\/ACCION>/);
        let accion = null;
        if (accionMatch) { try { accion = JSON.parse(accionMatch[1].trim()); } catch { accion = null; } }
        const tipo = accion?.tipo;
        const params = accion ? (() => { const { tipo: _t, ...r } = accion; return r; })() : {};

        if (tipo && CONSULTAR_ACCION[tipo]) {
          // ── Consulta de solo lectura (vendedores y CEO) ──
          resp = resp.replace(/<ACCION>[\s\S]*?<\/ACCION>/, "").trim();
          if (resp) setMsgs((p) => [...p, { from: "ai", text: resp }]);
          // Por defecto la agenda es la del usuario actual (salvo "todos" o un vendedor pedido).
          if (tipo === "buscar_agenda" && !params.vendedor_id && !params.vendedor_nombre && !params.todos) {
            params.vendedor_id = perfilId;
          }
          if (params.todos && rol !== "ceo") delete params.todos; // solo el CEO ve todo el equipo
          setMsgs((p) => [...p, { from: "sistema", text: "🔎 Buscando en el CRM…" }]);
          let datos;
          try { datos = await CONSULTAR_ACCION[tipo](params); }
          catch (e) { datos = `Error: ${e.message}`; }
          setMsgs((p) => p.filter((m) => !m.text?.startsWith("🔎 Buscando")));
          // Segunda pasada: la IA arma la respuesta usando SOLO los datos reales.
          try {
            const seg = [
              { role: "system", content: GROK_SYSTEM + sysExtra + `\n\n════ RESULTADO DE LA CONSULTA (usá SOLO estos datos, no inventes) ════\n${datos}\n\nRespondé al usuario de forma clara y concisa en español, listando de forma ordenada. NO incluyas ningún bloque <ACCION>.` },
              { role: "user", content: q },
            ];
            const r2 = await fetch("/api/asistente", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: seg, max_tokens: vozOnRef.current ? 140 : 900 }),
            });
            const d2 = await r2.json().catch(() => ({}));
            const ans = (d2.contenido || "").replace(/<ACCION>[\s\S]*?<\/ACCION>/, "").trim() || datos;
            setMsgs((p) => [...p, { from: "ai", text: ans }]);
            hablar(ans);
          } catch {
            setMsgs((p) => [...p, { from: "ai", text: datos }]);
          }
        } else if (tipo && EJECUTAR_ACCION[tipo] && rol === "ceo") {
          // ── Cambio real en la base (solo CEO) ──
          resp = resp.replace(/<ACCION>[\s\S]*?<\/ACCION>/, "").trim();
          if (resp) { setMsgs((p) => [...p, { from: "ai", text: resp }]); hablar(resp); }
          if (tipo === "agregar_evento" && !params.vendedor_id && !params.vendedor_nombre) {
            params.vendedor_id = perfilId; params.vendedor_nombre = nombreUsuario;
          }
          setMsgs((p) => [...p, { from: "sistema", text: `⏳ Ejecutando: ${tipo}…` }]);
          const resultado = await EJECUTAR_ACCION[tipo](params);
          setMsgs((p) => [
            ...p.filter((m) => !m.text?.startsWith("⏳ Ejecutando")),
            { from: "sistema", text: `✅ ${resultado}` },
          ]);
          onRefrescar?.();
        } else if (tipo && EJECUTAR_ACCION[tipo] && rol !== "ceo") {
          // Vendedor pidió un cambio que requiere CEO.
          resp = resp.replace(/<ACCION>[\s\S]*?<\/ACCION>/, "").trim();
          setMsgs((p) => [...p, { from: "ai", text: resp || "Esa acción la puede hacer solo Nicolás (CEO)." }]);
          hablar(resp || "Esa acción la puede hacer solo el CEO.");
        } else {
          // Respuesta normal (sin acción).
          resp = resp.replace(/<ACCION>[\s\S]*?<\/ACCION>/, "").trim();
          setMsgs((p) => [...p, { from: "ai", text: resp }]);
          hablar(resp);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const detalle = err?.error || "";
        const sinCuota = /rate limit|quota|tokens per|too large|TPM|TPD/i.test(detalle);
        setMsgs((p) => [...p, { from: "ai", text: sinCuota
          ? "Estoy a full en este momento (se llegó al límite de la IA gratuita). Probá de nuevo en un ratito 🙏"
          : `No pude responder: ${detalle || "error del servidor"}.` }]);
      }
    } catch (e) {
      setMsgs((p) => [...p, { from: "ai", text: `Sin conexión: ${e.message}` }]);
    }
    setTyping(false);
  }, [input, msgs, typing, contactoActivo, alertas, contactos, hablar, niniPrompt, rol, cargarReporteCEO, perfilId, nombreUsuario, onRefrescar]);

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
    : "Online · Modo texto";

  return (
    <>
      {/* Botón flotante */}
      <button onClick={() => { setOpen((v) => !v); }} title="Asistente IA"
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
            <button onClick={() => { document.getElementById('nini-input')?.focus(); }} disabled={typing}
              title={"Modo solo texto — escribí tu consulta"}
              style={{ background: L.soft, border: `2px solid ${L.border}`, color: L.muted, borderRadius: 12, width: 46, height: 46, cursor: typing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
              <Sparkles size={20} />
            </button>
            <input id="nini-input" value={transcrib || input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder={"Escribí tu consulta..."}
              readOnly={false}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${grabando ? "#FDE68A" : L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, outline: "none", color: grabando ? "#713F12" : L.text, background: grabando ? "#FFFBEB" : L.soft, transition: "all .2s" }} />
            <button onClick={() => { enviar(); }} disabled={typing}
              style={{ background: typing ? L.light : C.red, border: "none", color: "#fff", borderRadius: 10, width: 42, height: 42, cursor: typing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background .2s" }}>
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
        ["agenda",     <Calendar size={14} />,  "Agenda"],
        ["directorio", <Users size={14} />,    "Directorio"],
        ["reportes",   <BarChart2 size={14} />, "Reportes"],
        ["admin",      <Shield size={14} />,    "Admin"],
        ["control",    <Activity size={14} />,  "Control"],
      ]
    : [
        ["diario", <BookOpen size={14} />, "Mi Día"],
        ["agenda", <Calendar size={14} />, "Agenda"],
      ];

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
// CANAL SELECTOR — flyout horizontal (se despliega desde el costado)
// ============================================================
const CANALES = [
  { key: "todos",      label: "Todos",      icon: <Users size={18} />,         color: "#7C3AED", bg: "#F5F3FF" },
  { key: "whatsapp",   label: "WhatsApp",   icon: <FaWhatsapp size={18} />,    color: "#25D366", bg: "#F0FDF4" },
  { key: "messenger",  label: "Messenger",  icon: <SiMessenger size={17} />,   color: "#0084FF", bg: "#D8EAFF" },
  { key: "email",      label: "Gmail",      icon: <SiGmail size={17} />,       color: "#EA4335", bg: "#FFF5F5" },
  { key: "google_ads", label: "Google Ads", icon: <SiGoogleads size={17} />,   color: "#4285F4", bg: "#EFF6FF" },
];

function CanalSelector({ canal, setCanal }) {
  const [open, setOpen] = useState(false);
  const closeT = useRef(null);
  const sel = CANALES.find((c) => c.key === canal) || CANALES[0];
  const otros = CANALES.filter((c) => c.key !== sel.key);

  const abrir  = () => { if (closeT.current) clearTimeout(closeT.current); setOpen(true); };
  const cerrar = () => { closeT.current = setTimeout(() => setOpen(false), 160); };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} onMouseEnter={abrir} onMouseLeave={cerrar}>
      {/* Píldora del canal activo */}
      <button onClick={() => setOpen((o) => !o)}
        style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 11, border: "none", cursor: "pointer", background: sel.bg, boxShadow: `inset 0 0 0 1.5px ${sel.color}33`, transition: "all .2s" }}>
        <span style={{ color: sel.color, display: "flex", lineHeight: 1 }}>{sel.icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: sel.color, fontFamily: FONT_DISPLAY, letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap" }}>{sel.label}</span>
        <ChevronRight size={15} color={sel.color} style={{ transition: "transform .25s", transform: open ? "rotate(90deg)" : "none" }} />
      </button>

      {/* Canales que se deslizan desde el costado */}
      <div style={{ display: "flex", gap: 6, overflow: "hidden", maxWidth: open ? 320 : 0, opacity: open ? 1 : 0, transition: "max-width .32s cubic-bezier(.34,1.2,.4,1), opacity .22s ease" }}>
        {otros.map((c, i) => (
          <button key={c.key} onClick={() => { setCanal(c.key); }} title={c.label}
            onMouseEnter={(e) => { e.currentTarget.style.background = c.color; e.currentTarget.firstChild.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = c.bg; e.currentTarget.firstChild.style.color = c.color; }}
            style={{ flexShrink: 0, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 11, border: "none", cursor: "pointer", background: c.bg, boxShadow: `inset 0 0 0 1.5px ${c.color}33`, transform: open ? "translateX(0)" : "translateX(-14px)", transition: `transform .3s cubic-bezier(.34,1.2,.4,1) ${open ? i * 45 : 0}ms, background .15s`, }}>
            <span style={{ color: c.color, display: "flex", lineHeight: 1, transition: "color .15s" }}>{c.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SIDEBAR
// ============================================================
function Sidebar({ contactos, activo, onSelect, onToggleDestacado, onPatchContacto, requiereLlamada, onToggleLlamada, onMarcarLlamada, onLogout, userEmail, userName, vista, setVista, alertas, onDescartarAlerta, onDescartarTodasAlertas, isMobile, rol, perfil }) {
  const [filtro, setFiltro]       = useState("todos");
  const [busqueda, setBusqueda]   = useState("");
  const [soloDestacados, setSoloDestacados] = useState(false);
  const [soloPide, setSoloPide]   = useState(false);   // solo los que piden contacto
  const [canal, setCanal]         = useState("todos");
  const [filtrosIA, setFiltrosIA] = useState(FILTROS_INICIAL);
  const [modalFiltros, setModalFiltros] = useState(false);
  const [menu, setMenu]           = useState(null);   // menú contextual: { x, y, c }
  const [agendar, setAgendar]     = useState(null);   // contacto a agendar llamada
  const [now, setNow]             = useState(Date.now());
  // Long-press (mantener presionado) para abrir el menú en celular, donde no
  // existe el click derecho. Se cancela si el dedo se mueve (>10px = scroll).
  const press = useRef({ timer: null, x: 0, y: 0 });
  const pressFired = useRef(false);
  const abrirMenu = (c, x, y) => setMenu({ x, y, c });
  const iniciarPress = (c, e) => {
    const t = e.touches?.[0];
    pressFired.current = false;
    press.current.x = t?.clientX || 0;
    press.current.y = t?.clientY || 0;
    clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => {
      pressFired.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      abrirMenu(c, press.current.x, press.current.y);
    }, 450);
  };
  const moverPress = (e) => {
    const t = e.touches?.[0];
    if (t && (Math.abs(t.clientX - press.current.x) > 10 || Math.abs(t.clientY - press.current.y) > 10)) {
      clearTimeout(press.current.timer);
    }
  };
  const cancelarPress = () => clearTimeout(press.current.timer);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Clientes que piden contacto (para el contador y el filtro de prioridad).
  const nPide = contactos.reduce((n, c) => n + (pideContacto(c).pide ? 1 : 0), 0);

  const lista = contactos.filter((c) => {
    const porBusq   = !busqueda || (c.nombre || "").toLowerCase().includes(busqueda.toLowerCase()) || (c.telefono || "").includes(busqueda) || (c.email || "").toLowerCase().includes(busqueda.toLowerCase());
    const porCanal  = canal === "todos" || (canal === "whatsapp" ? (c.canal || "whatsapp") === "whatsapp" : c.canal === canal);
    const porDest   = !soloDestacados || c.destacado;
    const porPide   = !soloPide || pideContacto(c).pide;
    let porFiltro = true;
    if (filtro === "todos") porFiltro = true;
    else if (filtro === "q:sinrevisar")   porFiltro = calcSinRevisar(c) != null;
    else if (filtro === "q:noleidos")     porFiltro = c.no_leidos > 0;
    else if (filtro === "q:sinresponder") porFiltro = calcEspera(c) != null;
    else if (filtro === "t:cliente")      porFiltro = c.tipo === "cliente";
    else if (filtro === "t:prospecto")    porFiltro = !c.tipo || c.tipo === "prospecto";
    else porFiltro = c.estado === filtro;
    return porBusq && porCanal && porDest && porPide && porFiltro && aplicaFiltrosIA(c, filtrosIA);
  })
  // Prioridad: primero los que piden contacto, luego los destacados; respeta el orden por fecha.
  .sort((a, b) => (pideContacto(b).pide ? 1 : 0) - (pideContacto(a).pide ? 1 : 0))
  .sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0));

  return (
    <div style={{ width: "100%", height: "100%", background: L.white, borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}>

      {/* ── Brand bar ── */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gradAI, borderBottom: `3px solid ${C.redDark}`, boxShadow: "0 4px 18px rgba(58,141,194,.22)" }}>
        <img src={LOGO_URL} alt="NINIT Group" style={{ width: 210, height: 52, objectFit: "cover", objectPosition: "center 38%", filter: "brightness(0) invert(1)", opacity: 0.95 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <AlertasBtn alertas={alertas} onSelect={(c) => { setVista("chat"); onSelect(c); }}
            onDescartar={onDescartarAlerta} onDescartarTodas={onDescartarTodasAlertas} />
        </div>
      </div>


      {/* ── Tabs ── */}
      <NavTabs vista={vista} setVista={setVista} rol={rol} />

      {vista === "chat" && (
        <>
          {/* ── Canal selector (desplegable) ── */}
          <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${L.border}` }}>
            <CanalSelector canal={canal} setCanal={setCanal} />
          </div>

          {/* ── Búsqueda + Filtros IA ── */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${L.border}`, display: "flex", gap: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={15} color={L.light} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar contacto o número…"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10, border: `1.5px solid ${L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none" }} />
            </div>
            <button onClick={() => setModalFiltros(true)} title="Filtrado inteligente"
              style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 800, letterSpacing: 0.2,
                border: contarActivos(filtrosIA) > 0 ? `1.5px solid ${C.ai}` : `1.5px solid ${L.border}`,
                background: contarActivos(filtrosIA) > 0 ? C.aiSoft : L.white,
                color: contarActivos(filtrosIA) > 0 ? C.ai : L.muted, transition: "all .15s" }}>
              <SlidersHorizontal size={15} />
              {contarActivos(filtrosIA) > 0 && (
                <span style={{ background: C.ai, color: "#fff", fontSize: 10.5, fontWeight: 800, borderRadius: 9, minWidth: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{contarActivos(filtrosIA)}</span>
              )}
            </button>
            <button onClick={() => setSoloPide((v) => !v)}
              title={`Piden contacto (llamada / hablar con ventas)${nPide ? ` — ${nPide}` : ""}`}
              style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "0 11px", borderRadius: 10, cursor: "pointer", transition: "all .15s",
                border: (soloPide || nPide > 0) ? `1.5px solid ${C.red}` : `1.5px solid ${L.border}`,
                background: soloPide ? C.red : (nPide > 0 ? "#FEF2F2" : L.white),
                color: soloPide ? "#fff" : (nPide > 0 ? C.red : L.muted) }}>
              <PhoneCall size={16} />
              {nPide > 0 && (
                <span style={{ background: soloPide ? "#fff" : C.red, color: soloPide ? C.red : "#fff", fontSize: 10.5, fontWeight: 800, borderRadius: 9, minWidth: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{nPide}</span>
              )}
            </button>
            <button onClick={() => setSoloDestacados(v => !v)}
              title={soloDestacados ? "Mostrar todos" : "Mostrar solo importantes"}
              style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 40, borderRadius: 10, cursor: "pointer",
                border: soloDestacados ? "1.5px solid #F59E0B" : `1.5px solid ${L.border}`,
                background: soloDestacados ? "#FFFBEB" : L.white, transition: "all .15s" }}>
              <Star size={16} fill={soloDestacados ? "#F59E0B" : "none"} color={soloDestacados ? "#F59E0B" : L.muted} />
            </button>
          </div>

          {modalFiltros && (
            <FiltrosModal filtros={filtrosIA} setFiltros={setFiltrosIA} onClose={() => setModalFiltros(false)} />
          )}


          {/* ── Lista contactos ── */}
          <style>{`@keyframes ninitPhonePulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(220,38,38,.5)}50%{transform:scale(1.12);box-shadow:0 0 0 5px rgba(220,38,38,0)}}@keyframes ninitSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
          <div className="scroll-y" style={{ overflowY: "auto", flex: 1 }}>
            {lista.length === 0 && (
              <div style={{ padding: 36, color: L.light, fontSize: 13.5, textAlign: "center" }}>
                {busqueda ? "Sin resultados para la búsqueda" : "Sin conversaciones"}
              </div>
            )}
            {lista.map((c) => {
              const est  = ESTADOS[c.estado] || ESTADOS.nuevo;
              const sel  = activo?.id === c.id;
              const llamar = requiereLlamada?.has(c.id) || c.requiere_llamada;
              const pc = pideContacto(c);
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
                <div key={c.id}
                  onClick={() => { if (pressFired.current) { pressFired.current = false; return; } onSelect(c); }}
                  onContextMenu={(e) => { e.preventDefault(); abrirMenu(c, e.clientX, e.clientY); }}
                  onTouchStart={(e) => iniciarPress(c, e)}
                  onTouchMove={(e) => moverPress(e)}
                  onTouchEnd={cancelarPress}
                  onTouchCancel={cancelarPress}
                  style={{ padding: "13px 14px", borderBottom: `1px solid ${L.border}`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", background: sel ? L.active : (llamar ? "#FEF2F2" : "transparent"), borderLeft: sel ? `4px solid ${C.red}` : (llamar ? `3px solid ${C.red}` : "3px solid transparent"), transform: sel ? "translateX(10px)" : "translateX(0)", boxShadow: sel ? `-2px 0 0 ${C.red}, 0 2px 10px rgba(0,0,0,.06)` : "none", borderRadius: sel ? "0 10px 10px 0" : 0, transition: "transform .18s ease, background .12s, box-shadow .18s", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = L.hover; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = llamar ? "#FEF2F2" : "transparent"; }}>
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
                      <span style={{ fontWeight: 700, color: L.text, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "62%", display: "flex", alignItems: "center", gap: 6 }}>
                        {(sel || llamar) && (
                          <span title="Hay que llamar a este cliente" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: C.red, color: "#fff", animation: "ninitPhonePulse 1.4s ease-in-out infinite" }}>
                            <Phone size={11} />
                          </span>
                        )}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre || c.telefono || c.email}</span>
                      </span>
                      <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleDestacado?.(c); }}
                          title={c.destacado ? "Quitar de importantes" : "Marcar como importante"}
                          style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", display: "flex", alignItems: "center", lineHeight: 0 }}>
                          <Star size={15} fill={c.destacado ? "#F59E0B" : "none"} color={c.destacado ? "#F59E0B" : L.light} />
                        </button>
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
                      {pc.pide && (() => { const b = PIDE_BADGE[pc.motivo] || PIDE_BADGE.ventas; return (
                        <span style={{ fontSize: 9.5, padding: "2px 8px", borderRadius: 4, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <PhoneCall size={9} /> {b.label}
                        </span>
                      ); })()}
                      <span style={{ fontSize: 9.5, padding: "2px 8px", borderRadius: 4, background: est.bg, color: est.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>{est.label}</span>
                      {c.tipo === "cliente" && <span style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 4, background: "#DCFCE7", color: "#16A34A", fontWeight: 700 }}>★ Cliente</span>}
                      {c.vendedor && <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>{c.vendedor}</span>}
                      {c.seguimiento_at && new Date(c.seguimiento_at) <= new Date() && <span title="Seguimiento vencido"><Clock size={12} color={C.red} /></span>}
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

      {/* ── Menú contextual (click derecho en PC / mantener presionado en celular) ── */}
      {menu && (() => {
        const c = menu.c;
        const itemSt = isMobile ? { ...menuItemSt, padding: "13px 12px", fontSize: 14.5 } : menuItemSt;
        const iconSz = isMobile ? 18 : 15;
        const hoverOn  = (e) => { if (!isMobile) e.currentTarget.style.background = L.hover; };
        const hoverOff = (e) => { if (!isMobile) e.currentTarget.style.background = "transparent"; };
        const contenido = (
          <>
            <div style={{ padding: isMobile ? "4px 12px 12px" : "7px 10px 8px", borderBottom: `1px solid ${L.border}`, marginBottom: 5 }}>
              <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 800, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.nombre || c.telefono || c.email}
              </div>
              <div style={{ fontSize: isMobile ? 12 : 10.5, color: L.light, marginTop: 1 }}>Acciones rápidas</div>
            </div>

            <button onClick={() => { setAgendar(c); setMenu(null); }} style={itemSt} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <Calendar size={iconSz} color={C.red} /> Agendar llamada
            </button>
            <button onClick={() => { onToggleLlamada?.(c); setMenu(null); }} style={itemSt} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <Phone size={iconSz} color={C.red} /> {requiereLlamada?.has(c.id) ? "Quitar aviso de llamada" : "Marcar: hay que llamar"}
            </button>
            <button onClick={() => { onToggleDestacado?.(c); setMenu(null); }} style={itemSt} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <Star size={iconSz} color="#F59E0B" fill={c.destacado ? "#F59E0B" : "none"} /> {c.destacado ? "Quitar de importantes" : "Marcar importante"}
            </button>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); onPatchContacto?.(c, { seguimiento_at: d.toISOString() }); setMenu(null); }} style={itemSt} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
              <Clock size={iconSz} color="#0EA5E9" /> Recordar seguimiento mañana
            </button>

            <div style={{ borderTop: `1px solid ${L.border}`, margin: "5px 0", paddingTop: 7 }}>
              <div style={{ fontSize: isMobile ? 11 : 10, fontWeight: 800, color: L.light, textTransform: "uppercase", letterSpacing: 0.4, padding: "0 10px 6px" }}>Estado</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 8px 4px" }}>
                {["nuevo", "contactado", "interesado", "negociando", "vendido", "perdido"].map((k) => {
                  const est = ESTADOS[k]; const activoEst = c.estado === k;
                  return (
                    <button key={k} onClick={() => { onPatchContacto?.(c, { estado: k }); setMenu(null); }}
                      style={{ fontSize: isMobile ? 12 : 10, fontWeight: 700, padding: isMobile ? "6px 11px" : "3px 8px", borderRadius: 6, cursor: "pointer",
                        border: `1px solid ${activoEst ? est.color : "transparent"}`, background: est.bg, color: est.color }}>
                      {est.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );

        if (isMobile) {
          // Bottom sheet: se desliza desde abajo
          return (
            <div onClick={() => setMenu(null)}
              style={{ position: "fixed", inset: 0, zIndex: 7000, background: "rgba(15,23,42,.4)", display: "flex", alignItems: "flex-end" }}>
              <div onClick={(e) => e.stopPropagation()}
                style={{ width: "100%", background: L.white, borderRadius: "18px 18px 0 0", padding: "10px 8px calc(14px + env(safe-area-inset-bottom))", boxShadow: "0 -8px 40px rgba(0,0,0,.25)", fontFamily: FONT_BODY, animation: "ninitSheetUp .22s ease" }}>
                <div style={{ width: 40, height: 4, borderRadius: 3, background: L.border, margin: "2px auto 10px" }} />
                {contenido}
                <button onClick={() => setMenu(null)} style={{ ...menuItemSt, padding: "13px 12px", fontSize: 14.5, justifyContent: "center", color: L.muted, fontWeight: 700, marginTop: 4, background: L.soft }}>
                  Cancelar
                </button>
              </div>
            </div>
          );
        }
        // Popover posicionado (escritorio)
        return (
          <>
            <div onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
              style={{ position: "fixed", inset: 0, zIndex: 7000 }} />
            <div style={{
              position: "fixed",
              left: Math.min(menu.x, window.innerWidth - 258),
              top: Math.min(menu.y, window.innerHeight - 320),
              zIndex: 7001, width: 244, background: L.white, borderRadius: 12,
              border: `1px solid ${L.border}`, boxShadow: "0 12px 40px rgba(15,23,42,.22)",
              padding: 6, fontFamily: FONT_BODY, overflow: "hidden",
            }}>
              {contenido}
            </div>
          </>
        );
      })()}

      {/* ── Modal: agendar llamada ── */}
      {agendar && (
        <QuickLlamadaModal contacto={agendar} perfil={perfil} userName={userName} isMobile={isMobile}
          onFlagLlamada={(c) => onMarcarLlamada?.(c)}
          onClose={() => setAgendar(null)} />
      )}
    </div>
  );
}

// Estilo de cada ítem del menú contextual
const menuItemSt = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
  padding: "9px 10px", border: "none", background: "transparent", borderRadius: 8,
  fontSize: 13, fontWeight: 600, color: L.text, cursor: "pointer", fontFamily: FONT_BODY,
  transition: "background .1s",
};

// ── Modal rápido para agendar una llamada en el calendario ──
function QuickLlamadaModal({ contacto, perfil, userName, isMobile, onFlagLlamada, onClose }) {
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hoy = new Date();
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);

  const [vendedores, setVendedores] = useState([]);
  const [fecha, setFecha]   = useState(ymd(hoy));
  const [hora, setHora]     = useState("10:00");
  const [resp, setResp]     = useState(perfil ? { id: perfil.id, nombre: perfil.nombre } : null);
  const [nota, setNota]     = useState("");
  const [guardando, setGuard] = useState(false);

  const nombreCliente = contacto.nombre || contacto.telefono || contacto.email || "Cliente";

  // Cargar vendedores activos para elegir responsable de la llamada
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("vendedores")
        .select("id,nombre,role,activo").eq("activo", true).order("nombre");
      const lista = data || [];
      setVendedores(lista);
      // Responsable por defecto: el usuario actual si está en la lista
      if (perfil?.id) {
        const yo = lista.find((v) => v.id === perfil.id);
        if (yo) setResp({ id: yo.id, nombre: yo.nombre });
        else if (lista[0]) setResp({ id: lista[0].id, nombre: lista[0].nombre });
      } else if (lista[0]) setResp({ id: lista[0].id, nombre: lista[0].nombre });
    })();
  }, [perfil]);

  const textoWhatsApp = () => {
    const fechaTxt = new Date(fecha + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    return [
      "*NINIT GROUP — Agenda*", "",
      `*Llamada: ${nombreCliente}*`,
      `Fecha: ${cap(fechaTxt)}${hora ? `, ${hora} hs` : ""}`,
      resp?.nombre ? `Responsable: ${resp.nombre}` : null,
      contacto.telefono ? `Tel: ${contacto.telefono}` : null,
      nota.trim() ? `Nota: ${nota.trim()}` : null,
      "", `Agendado por ${userName || "NINIT Group"}`,
    ].filter((l) => l !== null).join("\n");
  };

  const guardar = async (compartir) => {
    if (!resp?.id) { alert("Elegí quién hará la llamada."); return; }
    setGuard(true);
    const payload = {
      vendedor_id: resp.id,
      vendedor_nombre: resp.nombre || "",
      fecha,
      hora: hora || null,
      tipo: "llamada",
      titulo: `Llamar a ${nombreCliente}`,
      cliente_id: contacto.id || null,
      cliente_nombre: nombreCliente,
      nota: nota.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("agenda_vendedor").insert(payload);
    setGuard(false);
    if (error) { alert("No se pudo agendar: " + error.message); return; }
    onFlagLlamada?.(contacto);   // marca el chat con el aviso de llamada
    if (compartir) window.open(`https://wa.me/?text=${encodeURIComponent(textoWhatsApp())}`, "_blank");
    onClose();
  };

  const inputSt = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${L.border}`, borderRadius: 9, padding: "9px 11px", fontSize: 13.5, fontFamily: FONT_BODY, color: L.text, background: L.soft, outline: "none" };
  const lblSt = { fontSize: 11, fontWeight: 800, color: L.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6, display: "block" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 8000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: L.white, borderRadius: isMobile ? "18px 18px 0 0" : 18, width: isMobile ? "100%" : "min(440px, 100%)", maxHeight: isMobile ? "92vh" : "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)", fontFamily: FONT_BODY, overflow: "hidden", animation: isMobile ? "ninitSheetUp .22s ease" : "none" }}>
        {/* Cabecera */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: C.red, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#fff" }}>
            <Phone size={18} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 16 }}>Agendar llamada</span>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", cursor: "pointer", color: "#fff", padding: 5, borderRadius: 7, display: "flex" }}><X size={17} /></button>
        </div>

        <div style={{ padding: "18px 20px", overflowY: "auto" }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: L.text, marginBottom: 16 }}>
            Llamar a <span style={{ color: C.red }}>{nombreCliente}</span>
          </div>

          {/* Fecha */}
          <div style={{ marginBottom: 14 }}>
            <label style={lblSt}>¿Cuándo?</label>
            <div style={{ display: "flex", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
              {[{ k: ymd(hoy), t: "Hoy" }, { k: ymd(manana), t: "Mañana" }].map((o) => {
                const sel = fecha === o.k;
                return (
                  <button key={o.k} onClick={() => setFecha(o.k)}
                    style={{ padding: "9px 16px", borderRadius: 8, border: `1.5px solid ${sel ? C.red : L.border}`, background: sel ? "#FEF2F2" : "#fff", color: sel ? C.red : L.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
                    {o.t}
                  </button>
                );
              })}
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ ...inputSt, width: "auto", flex: 1, minWidth: 140 }} />
            </div>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={inputSt} />
          </div>

          {/* Responsable */}
          <div style={{ marginBottom: 14 }}>
            <label style={lblSt}>¿Quién hace la llamada?</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {vendedores.length === 0 && <span style={{ fontSize: 12.5, color: L.light }}>Cargando…</span>}
              {vendedores.map((v) => {
                const sel = resp?.id === v.id;
                return (
                  <button key={v.id} onClick={() => setResp({ id: v.id, nombre: v.nombre })}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 9, border: `1.5px solid ${sel ? C.red : L.border}`, background: sel ? "#FEF2F2" : "#fff", color: sel ? C.red : L.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
                    {sel && <Check size={13} />} {v.nombre}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nota */}
          <div style={{ marginBottom: 18 }}>
            <label style={lblSt}>Nota (opcional)</label>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Ej: recordar cotización enviada…" style={{ ...inputSt, resize: "vertical", lineHeight: 1.5 }} />
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", gap: 8, justifyContent: isMobile ? "stretch" : "flex-end", flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
            <button onClick={() => guardar(false)} disabled={guardando}
              style={{ order: isMobile ? 1 : 3, padding: isMobile ? "13px 18px" : "9px 18px", borderRadius: 9, border: "none", background: C.red, color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: guardando ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: guardando ? 0.6 : 1, width: isMobile ? "100%" : "auto" }}>
              {guardando ? "Guardando…" : "Agendar"}
            </button>
            <button onClick={() => guardar(true)} disabled={guardando}
              style={{ order: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? "13px 16px" : "9px 16px", borderRadius: 9, border: `1.5px solid #25D366`, background: "#fff", color: "#128C4A", fontSize: 13.5, fontWeight: 700, cursor: guardando ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: guardando ? 0.6 : 1, width: isMobile ? "100%" : "auto" }}>
              <FaWhatsapp size={15} /> Agendar y compartir
            </button>
            <button onClick={onClose} style={{ order: isMobile ? 3 : 1, padding: isMobile ? "13px 16px" : "9px 16px", borderRadius: 9, border: `1.5px solid ${L.border}`, background: "#fff", color: L.muted, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY, width: isMobile ? "100%" : "auto" }}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COTIZACIONES (links por modelo)
// ============================================================
const COTIZACIONES = [
  {
    label: "Cotización completa (todos los modelos)",
    texto: `Thank you for your interest in NINIT Group. Please find our full quote below, including all restroom trailer models, specifications and pricing:\n\nhttps://ninitgroup.com/ninit_quote/\n\nWe remain at your disposal for any questions.`,
  },
];

// ============================================================
// ASISTENTE "AVANZAR" — etiquetas de visualización
// ============================================================
const AV_NIVEL = {
  frio:     { label: "Frío",     color: "#0369A1", bg: "#E0F2FE" },
  tibio:    { label: "Tibio",    color: "#B45309", bg: "#FEF3C7" },
  caliente: { label: "Caliente", color: "#B91C1C", bg: "#FEE2E2" },
};
const AV_ETAPA = {
  primer_contacto: "Primer contacto", interesado: "Interesado", calificacion: "Calificación",
  cotizacion: "Cotización", objecion: "Objeción", seguimiento: "Seguimiento",
  cierre: "Cierre", perdido: "Perdido",
};
const AV_OBJECION = {
  precio: "Precio", envio: "Envío", tiempo: "Tiempo", modelo: "Modelo",
  necesita_pensarlo: "Necesita pensarlo", comparando_proveedores: "Comparando proveedores",
  falta_informacion: "Falta información", sin_objecion: "Sin objeción",
};
const AV_URGENCIA = {
  alta:  { label: "Actuar ya", color: "#B91C1C", bg: "#FEE2E2" },
  media: { label: "Pronto",    color: "#B45309", bg: "#FEF3C7" },
  baja:  { label: "Sin apuro", color: "#15803D", bg: "#DCFCE7" },
};
// Ícono/etiqueta por acción sugerida (para el CTA del próximo paso)
const AV_ACCION = {
  agendar_llamada:     "Agendar llamada",
  enviar_catalogo:     "Enviar catálogo",
  pedir_ubicacion:     "Pedir ubicación",
  pedir_modelo:        "Pedir modelo",
  preparar_cotizacion: "Preparar cotización",
  hacer_seguimiento:   "Hacer seguimiento",
  marcar_caliente:     "Marcar caliente",
  marcar_perdido:      "Marcar perdido",
};

// ============================================================
// FOTOS POR MODELO (links de imagen para enviar al cliente)
// ============================================================
const FOTO_PREFIX = "https://ninitgroup.com/wp-content/uploads/";

// Assets compartidos entre modelos
const FOTO_INTERIOR_456 = `Here's the interior 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.48-PM-1-1.jpeg\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-3.jpeg`;
const FOTO_INTERIOR_23 = `Here's the interior 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-1-1.jpeg\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-1.jpeg`;
const FOTO_PALETA = `Here's our color palette 🎨 (same premium finish on every model) 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1.jpeg`;

// Cada modelo tiene varios assets: Exterior / Interior / Plano / Video / Paleta
// (solo se listan los assets disponibles para cada modelo)
const FOTOS_MODELOS = [
  {
    label: "2-Stall White Marble",
    assets: [
      { tipo: "Exterior", texto: `Here's our 2-Stall White Marble unit 👇\n${FOTO_PREFIX}2026/05/2bano.png` },
      { tipo: "Interior", texto: FOTO_INTERIOR_23 },
      { tipo: "Plano", texto: `Here's the floor plan of the 2-Stall 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1-1.jpeg` },
      { tipo: "Video", texto: `Here's a video walkthrough of the 2-Stall 👇\n${FOTO_PREFIX}2026/06/2_stalls_con_musica.mp4` },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "3-Stall (most popular ⭐)",
    assets: [
      { tipo: "Exterior", texto: `Here's our 3-Stall unit — our most popular one ⭐ 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-18-at-5.18.09-PM-2.jpeg` },
      { tipo: "Interior", texto: `Here's the interior 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-18-at-5.18.09-PM-1.jpeg\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-18-at-5.18.09-PM.jpeg\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-18-at-5.18.10-PM.jpeg` },
      { tipo: "Plano", texto: `Here's the floor plan of the 3-Stall 👇\n${FOTO_PREFIX}2026/05/PHOTO-2026-01-08-01-13-01-1.jpg` },
      { tipo: "Video", texto: `Here's a video walkthrough of the 3-Stall 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Video-2026-06-18-at-5.18.10-PM.mp4` },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "4-Stall",
    assets: [
      { tipo: "Exterior", texto: `Here's our 4-Stall unit 👇\n${FOTO_PREFIX}2026/05/4bano.png` },
      { tipo: "Interior", texto: FOTO_INTERIOR_456 },
      { tipo: "Plano", texto: `Here's the floor plan of the 4-Stall 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-11-at-4.39.53-PM.jpeg` },
      { tipo: "Video", texto: `Here's a video walkthrough of the 4-Stall 👇\n${FOTO_PREFIX}2026/06/video2_con_musica_avicii.mp4` },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "ADA+2 Accessible",
    assets: [
      { tipo: "Exterior", texto: `Here's our ADA+2 fully accessible unit 👇\n${FOTO_PREFIX}2026/05/ada22.png` },
      { tipo: "Interior", texto: `Here's the interior of the ADA+2 👇\n${FOTO_PREFIX}2026/01/dfhxvb.png` },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "6-Stall",
    assets: [
      { tipo: "Exterior", texto: `Here's our 6-Stall unit 👇\n${FOTO_PREFIX}2026/05/6bano.png` },
      { tipo: "Interior", texto: FOTO_INTERIOR_456 },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "Render / vista general",
    assets: [
      { tipo: "Render", texto: `Here's a look at our restroom trailers 👇\n${FOTO_PREFIX}2026/05/ChatGPT-Image-21-may-2026-12_16_51-p.m.png` },
    ],
  },
];

// ============================================================
// PLANTILLAS DE RESPUESTA RÁPIDA
// ============================================================
const PLANTILLAS = [
  {
    grupo: "🟢 Primer contacto",
    items: [
      {
        label: "Saludo (ES)",
        texto: `Hola, mucho gusto, mi nombre es {VENDEDOR} con Ninit Group. Te puedo ayudar a partir de aquí en la compra de la unidad que estás buscando, dejame saber las preguntas que pudieras tener. ¡Gracias! 🚐✨`,
      },
      {
        label: "Saludo (EN)",
        texto: `Hi, nice to meet you! My name is {VENDEDOR} with Ninit Group. I can help you from here with the purchase of the unit you're looking for. Let me know any questions you may have. Thank you! 🚐✨`,
      },
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
// RENDER DE CONTENIDO DEL MENSAJE (imágenes/videos inline)
// El vendedor ve la imagen real, igual que el cliente — sin links sueltos.
// ============================================================
const URL_RE = /(https?:\/\/[^\s]+)/g;
const esImagenURL = (u) => /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(u);
const esVideoURL  = (u) => /\.(mp4|webm|mov)(\?.*)?$/i.test(u);
// Eco de WhatsApp: n8n re-guarda lo que el CRM ya mandó, con el prefijo
// "*Nombre · NINIT Group:*". El CRM ya guardó la versión limpia, así que
// estos son duplicados y no se muestran (evita imágenes/mensajes repetidos).
const ECHO_PREFIX_RE = /^\*.*NINIT Group:\*/;
const primeraImagen = (txt) => (String(txt).match(URL_RE) || []).find(esImagenURL);

function MensajeContenido({ texto }) {
  if (!texto) return null;
  const partes = String(texto).split(URL_RE);
  return (
    <>
      {partes.map((p, i) => {
        if (i % 2 === 1) {
          if (esImagenURL(p))
            return <img key={i} src={p} alt="imagen" loading="lazy"
              onClick={() => window.open(p, "_blank")}
              style={{ display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 10, marginTop: 4, marginBottom: 2, cursor: "zoom-in", objectFit: "cover" }} />;
          if (esVideoURL(p))
            return <video key={i} src={p} controls
              style={{ display: "block", maxWidth: "100%", maxHeight: 320, borderRadius: 10, marginTop: 4, marginBottom: 2 }} />;
          return <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "#0EA5E9", wordBreak: "break-all" }}>{p}</a>;
        }
        return p ? <span key={i}>{p}</span> : null;
      })}
    </>
  );
}

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
  const [showCotizaciones, setShowCotizaciones] = useState(false);
  const [showFotos, setShowFotos] = useState(false);
  const [fotoModelo, setFotoModelo] = useState(null);
  const [subiendo, setSubiendo]   = useState(false);
  const [resumenOpen, setResumenOpen]   = useState(false);
  const [resumenTexto, setResumenTexto] = useState("");
  const [resumenMensaje, setResumenMensaje] = useState("");
  const [resumenLoading, setResumenLoading] = useState(false);
  const [resumenErr, setResumenErr]     = useState("");
  const [resumenCopiado, setResumenCopiado] = useState(false);
  const [resumenTextoTrad, setResumenTextoTrad] = useState("");  // traducción al español del resumen
  const [resumenMsgTrad, setResumenMsgTrad] = useState("");      // traducción al español del mensaje sugerido
  const [resumenTradOn, setResumenTradOn] = useState(false);     // mostrar/ocultar traducción
  const [resumenTradLoading, setResumenTradLoading] = useState(false);
  // ── Botón "Avanzar": asistente de ventas IA (JSON estructurado) ──
  const [avOpen, setAvOpen]       = useState(false);
  const [avData, setAvData]       = useState(null);   // resultado estructurado
  const [avLoading, setAvLoading] = useState(false);
  const [avErr, setAvErr]         = useState("");
  const [avCopiado, setAvCopiado] = useState(false);
  const [avEtapaOk, setAvEtapaOk] = useState(false);
  const [avMsgTrad, setAvMsgTrad]     = useState("");    // traducción al español del mensaje sugerido
  const [avTradOn, setAvTradOn]       = useState(false); // mostrar/ocultar traducción
  const [avTradLoading, setAvTradLoading] = useState(false);
  const [traducciones, setTraducciones] = useState({});      // { [msgId]: textoTraducido }
  const [tradLoading, setTradLoading] = useState({});        // { [msgId]: bool }
  const [replyTo, setReplyTo] = useState(null); // { id, contenido, esCliente } | null
  const [toolsOpen, setToolsOpen] = useState(false); // desplegable de herramientas del input
  const endRef = useRef(null);
  const plantillasRef = useRef(null);
  const cotizacionesRef = useRef(null);
  const fotosRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!showPlantillas) return;
    const h = (e) => { if (plantillasRef.current && !plantillasRef.current.contains(e.target)) setShowPlantillas(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showPlantillas]);

  useEffect(() => {
    if (!showCotizaciones) return;
    const h = (e) => { if (cotizacionesRef.current && !cotizacionesRef.current.contains(e.target)) setShowCotizaciones(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showCotizaciones]);

  useEffect(() => {
    if (!showFotos) return;
    const h = (e) => { if (fotosRef.current && !fotosRef.current.contains(e.target)) { setShowFotos(false); setFotoModelo(null); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showFotos]);

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

  const generarResumen = async () => {
    setResumenOpen(true);
    setResumenErr("");
    setResumenCopiado(false);
    if (!mensajes.length) { setResumenErr("Todavía no hay mensajes en esta conversación."); return; }
    setResumenLoading(true);
    setResumenTexto("");
    setResumenMensaje("");
    setResumenTextoTrad("");
    setResumenMsgTrad("");
    setResumenTradOn(false);
    try {
      const res = await fetch("/api/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacto: { nombre: contacto.nombre, telefono: contacto.telefono, email: contacto.email },
          // Firma con el nombre del usuario logueado (perfil.nombre).
          vendedor: userName,
          mensajes: mensajes.map((m) => ({
            direccion: m.direccion, origen: m.origen, agente: m.agente,
            contenido: m.contenido, created_at: m.created_at,
          })),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "No se pudo generar el resumen.");
      setResumenTexto(out.resumen || "El asistente no devolvió un resumen.");
      setResumenMensaje(out.mensaje || "");
    } catch (e) {
      setResumenErr(e.message || "Error al generar el resumen.");
    }
    setResumenLoading(false);
  };

  // ── Botón "Avanzar": llama al asistente de ventas IA ──────────
  const avanzarIA = async () => {
    setAvOpen(true);
    setAvErr("");
    setAvCopiado(false);
    setAvEtapaOk(false);
    setAvMsgTrad("");
    setAvTradOn(false);
    if (!mensajes.length) { setAvErr("Todavía no hay mensajes en esta conversación."); return; }
    setAvLoading(true);
    setAvData(null);
    try {
      const res = await fetch("/api/avanzar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacto: {
            nombre: contacto.nombre, telefono: contacto.telefono, email: contacto.email,
            estado: contacto.estado, empresa: contacto.empresa, direccion: contacto.direccion,
            canal: contacto.canal,
          },
          vendedor: userName,
          mensajes: mensajes.map((m) => ({
            direccion: m.direccion, origen: m.origen, agente: m.agente,
            contenido: m.contenido, created_at: m.created_at,
          })),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "No se pudo analizar la conversación.");
      setAvData(out);
    } catch (e) {
      setAvErr(e.message || "Error al analizar la conversación.");
    }
    setAvLoading(false);
  };

  const copiarMensajeAv = async () => {
    if (!avData?.mensaje_whatsapp) return;
    try { await navigator.clipboard.writeText(avData.mensaje_whatsapp); }
    catch { /* clipboard no disponible */ }
    // Además lo dejo cargado en el input para enviarlo directo.
    setTexto(avData.mensaje_whatsapp);
    setAvCopiado(true);
    setTimeout(() => setAvCopiado(false), 2200);
  };

  // Mapea la etapa del embudo IA → estado del CRM y lo aplica al contacto.
  const ETAPA_A_ESTADO = {
    primer_contacto: "contactado", interesado: "interesado", calificacion: "interesado",
    cotizacion: "cotizacion", objecion: "negociando", seguimiento: "pendiente",
    cierre: "negociando", perdido: "perdido",
  };
  const aplicarEtapaAv = () => {
    const nuevo = ETAPA_A_ESTADO[avData?.etapa_embudo];
    if (!nuevo) return;
    upd({ estado: nuevo });
    setAvEtapaOk(true);
    setTimeout(() => setAvEtapaOk(false), 2200);
  };

  const avLbl = { fontSize: 10.5, fontWeight: 800, color: L.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 };

  // Traduce el mensaje sugerido (inglés) al español para que el vendedor lo entienda.
  // El mensaje original NO se toca: "Copiar mensaje" sigue copiando el texto en inglés.
  const toggleTraducirAv = async () => {
    if (avTradOn) { setAvTradOn(false); return; }
    if (avMsgTrad) { setAvTradOn(true); return; }         // ya traducido (cache)
    if (!avData?.mensaje_whatsapp) return;
    setAvTradLoading(true);
    try { setAvMsgTrad(await traducirTexto(avData.mensaje_whatsapp, "es")); setAvTradOn(true); }
    catch { /* traducción no disponible */ }
    setAvTradLoading(false);
  };

  const traducirTexto = async (txt, destino) => {
    const res = await fetch("/api/traducir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: txt, destino }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "No se pudo traducir.");
    return out.traduccion || "";
  };

  // Traduce un mensaje entrante del cliente al español (toggle).
  const toggleTraducirMensaje = async (m) => {
    if (traducciones[m.id]) { setTraducciones((p) => { const n = { ...p }; delete n[m.id]; return n; }); return; }
    setTradLoading((p) => ({ ...p, [m.id]: true }));
    try { const t = await traducirTexto(m.contenido || "", "es"); setTraducciones((p) => ({ ...p, [m.id]: t })); }
    catch (e) { setErr(e.message || "Error al traducir."); }
    setTradLoading((p) => ({ ...p, [m.id]: false }));
  };

  // Traduce todo el resumen al español (por si salió en inglés) — solo para entender qué dice.
  // El mensaje original NO se toca: "Copiar mensaje" sigue copiando el texto en el idioma del cliente.
  const toggleTraducirResumen = async () => {
    if (resumenTradOn) { setResumenTradOn(false); return; }
    if (resumenTextoTrad || resumenMsgTrad) { setResumenTradOn(true); return; } // ya traducido (cache)
    setResumenTradLoading(true);
    try {
      const [tTexto, tMsg] = await Promise.all([
        resumenTexto ? traducirTexto(resumenTexto, "es") : Promise.resolve(""),
        resumenMensaje ? traducirTexto(resumenMensaje, "es") : Promise.resolve(""),
      ]);
      setResumenTextoTrad(tTexto);
      setResumenMsgTrad(tMsg);
      setResumenTradOn(true);
    } catch (e) { setResumenErr(e.message || "Error al traducir."); }
    setResumenTradLoading(false);
  };

  const copiarResumen = async () => {
    const aCopiar = resumenMensaje || resumenTexto;
    try {
      await navigator.clipboard.writeText(aCopiar);
      setResumenCopiado(true);
      setTimeout(() => setResumenCopiado(false), 2000);
    } catch { /* sin clipboard */ }
  };

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("mensajes").select("*").eq("contacto_id", contacto.id).order("created_at", { ascending: true });
    setMensajes(data || []);
    // Al abrir el chat queda "revisado": el vendedor vio la consulta aunque no responda
    await supabase.from("contactos").update({ no_leidos: 0, revisado_at: new Date().toISOString() }).eq("id", contacto.id);
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

  // Envía un contenido (texto o URL de imagen) por el canal del contacto.
  // Devuelve true si se guardó en el CRM.
  const enviarMensaje = async (cuerpo) => {
    // 1) Guardar en CRM (Supabase)
    const { error } = await supabase.from("mensajes").insert({
      contacto_id: contacto.id, direccion: "out", origen: "agente", agente: userName, contenido: cuerpo,
    });
    if (error) {
      setErr("Error al guardar el mensaje: " + error.message);
      return false;
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
    return true;
  };

  const enviar = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo || enviando) return;
    // Si estás respondiendo a un mensaje específico, citá esa consulta arriba.
    let cuerpoFinal = cuerpo;
    if (replyTo) {
      const raw = (replyTo.contenido || "").replace(/\s+/g, " ").trim();
      const snippet = raw.slice(0, 140) + (raw.length > 140 ? "…" : "");
      cuerpoFinal = `↪️ Respondiendo a: "${snippet}"\n\n${cuerpo}`;
    }
    setEnviando(true); setErr(""); setTexto("");
    const ok = await enviarMensaje(cuerpoFinal);
    if (!ok) setTexto(cuerpo);
    else setReplyTo(null);
    setEnviando(false);
  };

  // Envía un asset de "Fotos por modelo": si trae varias imágenes/videos, manda
  // una por mensaje (así en WhatsApp llegan TODAS como media, no solo la primera).
  const enviarFotoAsset = async (texto) => {
    if (!texto || enviando) return;
    const urls = String(texto).match(URL_RE) || [];
    setEnviando(true); setErr("");
    if (urls.length <= 1) {
      await enviarMensaje(texto);
    } else {
      const caption = String(texto).replace(URL_RE, "").trim();
      await enviarMensaje(caption ? `${caption}\n${urls[0]}` : urls[0]);
      for (let i = 1; i < urls.length; i++) await enviarMensaje(urls[i]);
    }
    setEnviando(false);
  };

  // Comprime/redimensiona la imagen en el navegador antes de subirla (máx 1600px, JPEG).
  const comprimirImagen = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1600;
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r); height = Math.round(height * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ dataBase64: dataUrl.split(",")[1], contentType: "image/jpeg" });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // Adjuntar imagen: comprime → sube a Storage → envía la URL por el canal.
  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Solo se pueden adjuntar imágenes."); return; }
    if (enviando || subiendo) return;
    setSubiendo(true); setErr("");
    try {
      const { dataBase64, contentType } = await comprimirImagen(file);
      const res = await fetch("/api/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataBase64, contentType }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "No se pudo subir la imagen");
      await enviarMensaje(json.url);
    } catch (e2) {
      setErr("No se pudo enviar la imagen: " + (e2.message || e2));
    } finally {
      setSubiendo(false);
    }
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
              <button onClick={() => setPanelSeg((v) => !v)} title="Programar seguimiento"
                style={{ background: panelSeg ? C.gold : L.soft, border: `1.5px solid ${panelSeg ? C.gold : L.border}`, color: panelSeg ? "#fff" : L.muted, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, transition: "all .15s", flexShrink: 0 }}>
                <Calendar size={14} /> Seguimiento
              </button>
              <button onClick={() => upd({ bot_activo: !contacto.bot_activo })} title={contacto.bot_activo ? "El bot atiende este chat — tocá para atenderlo vos" : "Vos atendés este chat — tocá para que lo tome el bot"}
                style={{ background: contacto.bot_activo ? "#DCFCE7" : "#FEF2F2", border: `1.5px solid ${contacto.bot_activo ? "#86EFAC" : "#FECACA"}`, color: contacto.bot_activo ? "#15803D" : C.red, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, transition: "all .15s", flexShrink: 0 }}>
                {contacto.bot_activo ? <><Bot size={14} /> Bot</> : <><User size={14} /> Yo atiendo</>}
              </button>
              <button onClick={avanzarIA} title="Asistente de ventas IA: diagnóstico del cliente + próximo paso + mensaje sugerido"
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(.94)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(99,102,241,.3)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 8px 22px rgba(99,102,241,.34)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 8px 22px rgba(99,102,241,.34)"; }}
                style={{ background: C.gradBtn, border: "none", color: "#fff", borderRadius: 13, padding: "11px 24px", cursor: "pointer", fontSize: 14.5, fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: 0.2, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 22px rgba(99,102,241,.34)", transition: "transform .1s ease, box-shadow .12s ease", flexShrink: 0 }}>
                <Sparkles size={17} /> Avanzar
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
        {/* Fila 2: acciones (solo móvil; en desktop ya están arriba) */}
        {isMobile && (
          <div className="strip" style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 9, overflowX: "auto", flexWrap: "nowrap", paddingBottom: 2 }}>
            <button onClick={() => setDrawer(true)}
              style={{ ...btnSt, flexShrink: 0, fontSize: 12, padding: "6px 11px", background: L.soft, color: L.muted, borderColor: L.border }}>
              <Pencil size={13} /> Editar
            </button>
            <button onClick={avanzarIA}
              onTouchStart={(e) => { e.currentTarget.style.transform = "scale(.94)"; }}
              onTouchEnd={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              style={{ ...btnSt, flexShrink: 0, fontSize: 13, padding: "8px 18px", borderRadius: 12, fontWeight: 700, gap: 7, background: C.gradBtn, color: "#fff", borderColor: "transparent", boxShadow: "0 6px 16px rgba(99,102,241,.3)", transition: "transform .1s ease" }}>
              <Sparkles size={15} /> Avanzar
            </button>
            <button onClick={() => setPanelSeg((v) => !v)}
              style={{ ...btnSt, flexShrink: 0, fontSize: 12, background: panelSeg ? C.gold : L.soft, color: panelSeg ? "#fff" : L.muted, borderColor: panelSeg ? C.gold : L.border }}>
              <Calendar size={13} /> Seguimiento
            </button>
            <button onClick={() => upd({ bot_activo: !contacto.bot_activo })}
              style={{ ...btnSt, flexShrink: 0, fontSize: 12, fontWeight: 700, background: contacto.bot_activo ? "#DCFCE7" : "#FEF2F2", color: contacto.bot_activo ? "#15803D" : C.red, borderColor: contacto.bot_activo ? "#86EFAC" : "#FECACA" }}>
              {contacto.bot_activo ? <><Bot size={13} /> Bot</> : <><User size={13} /> Yo atiendo</>}
            </button>
            <button onClick={() => setConfirmElim((v) => !v)} title="Eliminar contacto"
              style={{ ...btnSt, flexShrink: 0, fontSize: 12, padding: "6px 10px", background: confirmElim ? "#FEF2F2" : L.soft, color: confirmElim ? C.red : L.muted, borderColor: confirmElim ? "#FECACA" : L.border }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

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
        {mensajes.filter((m) => !ECHO_PREFIX_RE.test(m.contenido || "")).map((m) => {
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
                <MensajeContenido texto={m.contenido} />
              </div>
              {/* Traducción al español del mensaje */}
              {traducciones[m.id] && (
                <div style={{ marginTop: 4, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 12, padding: "8px 12px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    <Languages size={11} /> Traducción
                  </div>
                  <div style={{ fontSize: 13.5, color: L.text }}>{traducciones[m.id]}</div>
                </div>
              )}
              {/* Hora + traducir + eliminar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: esCliente ? "flex-start" : "flex-end" }}>
                <div style={{ fontSize: 10.5, color: L.light }}>{hora}</div>
                <button onClick={() => setReplyTo({ id: m.id, contenido: m.contenido, esCliente })} title="Responder a este mensaje"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: L.muted, fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 3, borderRadius: 4 }}>
                  <Reply size={12} /> Responder
                </button>
                <button onClick={() => toggleTraducirMensaje(m)} title="Traducir al español"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: "#7C3AED", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 3, borderRadius: 4 }}>
                  <Languages size={12} /> {tradLoading[m.id] ? "…" : (traducciones[m.id] ? "Ver original" : "Traducir")}
                </button>
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

      {/* ── Barra: respondiendo a un mensaje específico ── */}
      {replyTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "8px 12px" : "8px 22px", borderTop: `1px solid ${L.border}`, background: "#F5F3FF" }}>
          <Reply size={15} color="#7C3AED" style={{ flexShrink: 0 }} />
          <div style={{ width: 3, alignSelf: "stretch", background: "#7C3AED", borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Respondiendo a {replyTo.esCliente ? "el cliente" : "tu mensaje"}
            </div>
            <div style={{ fontSize: 12.5, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {(replyTo.contenido || "").replace(/\s+/g, " ").trim().slice(0, 100) || "(sin texto)"}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} title="Cancelar respuesta"
            style={{ background: "none", border: "none", cursor: "pointer", color: L.muted, display: "flex", padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Input ── */}
      <div style={{ padding: isMobile ? "10px 12px" : "14px 22px", borderTop: `1px solid ${L.border}`, background: L.white, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0, position: "relative" }}>
        {/* Botón ＋ con desplegable de herramientas */}
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 8, flexShrink: 0 }}
          onMouseEnter={() => setToolsOpen(true)}
          onMouseLeave={() => { if (!showCotizaciones && !showFotos && !showPlantillas) setToolsOpen(false); }}>
          <style>{`.tools-pop{animation:toolsIn .18s ease}@keyframes toolsIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}`}</style>
          <button onClick={() => setToolsOpen((v) => !v)} title="Adjuntar y más opciones"
            style={{ background: toolsOpen ? C.gradBtn : L.soft, color: toolsOpen ? "#fff" : C.red, border: `1.5px solid ${toolsOpen ? "transparent" : L.border}`, borderRadius: 11, width: 42, height: 42, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .18s" }}>
            <Plus size={20} style={{ transform: toolsOpen ? "rotate(45deg)" : "none", transition: "transform .18s" }} />
          </button>
          {toolsOpen && (
          <div className="tools-pop" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        {/* Cotizaciones */}
        <div ref={cotizacionesRef} style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setShowCotizaciones((v) => !v)} title="Enviar link de cotización"
            style={{
              background: showCotizaciones ? C.red : L.white,
              color: showCotizaciones ? "#fff" : C.red,
              border: `1.5px solid ${showCotizaciones ? C.red : C.red + "40"}`,
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.1,
              boxShadow: showCotizaciones ? `0 2px 8px ${C.red}33` : "none",
              transition: "all .15s",
              flexShrink: 0,
            }}>
            <Receipt size={17} weight={showCotizaciones ? "fill" : "regular"} />
            {!isMobile && <span>Cotizaciones</span>}
          </button>
          {showCotizaciones && (
            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: isMobile ? "calc(100vw - 24px)" : 320, maxHeight: 460, overflowY: "auto", background: L.white, borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,.18)", border: `1px solid ${L.border}`, zIndex: 200 }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                <Receipt size={16} weight="duotone" color={C.gold} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.8 }}>Cotizaciones</span>
              </div>
              {COTIZACIONES.map((item) => (
                <button key={item.label} onClick={() => { setTexto(item.texto); setShowCotizaciones(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13.5, color: L.text, fontFamily: FONT_BODY, transition: "background .1s", borderBottom: `1px solid ${L.border}40` }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Fotos por modelo */}
        <div ref={fotosRef} style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => { setShowFotos((v) => !v); setFotoModelo(null); }} title="Enviar foto del modelo al cliente"
            style={{ background: showFotos ? "#0EA5E9" : L.soft, color: showFotos ? "#fff" : "#0EA5E9", border: `1.5px solid ${showFotos ? "#0EA5E9" : "#0EA5E955"}`, borderRadius: 11, padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, transition: "all .15s", flexShrink: 0 }}>
            <ImageIcon size={15} />
            {!isMobile && <span>Fotos</span>}
          </button>
          {showFotos && (
            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: isMobile ? "calc(100vw - 24px)" : 320, maxHeight: 460, overflowY: "auto", background: L.white, borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,.18)", border: `1px solid ${L.border}`, zIndex: 200 }}>
              {fotoModelo == null ? (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <ImageIcon size={14} color="#0EA5E9" />
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.8 }}>Fotos por modelo</span>
                  </div>
                  {FOTOS_MODELOS.map((item, i) => (
                    <button key={item.label} onClick={() => setFotoModelo(i)}
                      style={{ width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13.5, color: L.text, fontFamily: FONT_BODY, transition: "background .1s", borderBottom: `1px solid ${L.border}40`, display: "flex", alignItems: "center", gap: 8 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                      <ImageIcon size={13} color="#0EA5E9" style={{ flexShrink: 0 }} /> {item.label}
                      <ChevronRight size={15} color={L.muted} style={{ marginLeft: "auto", flexShrink: 0 }} />
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ padding: "10px 12px 10px 8px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => setFotoModelo(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "#0EA5E9" }}>
                      <ChevronLeft size={18} />
                    </button>
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.6 }}>{FOTOS_MODELOS[fotoModelo].label}</span>
                  </div>
                  <div style={{ padding: "8px 16px 2px", fontSize: 11, color: L.muted }}>Tocá una foto para enviarla directo al cliente 👇</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, padding: 11 }}>
                    {FOTOS_MODELOS[fotoModelo].assets.map((a) => {
                      const thumb = primeraImagen(a.texto);
                      return (
                        <button key={a.tipo} disabled={enviando}
                          onClick={() => { enviarFotoAsset(a.texto); setShowFotos(false); setFotoModelo(null); }}
                          title={`Enviar ${a.tipo}`}
                          style={{ padding: 0, background: L.soft, border: `1px solid ${L.border}`, borderRadius: 10, cursor: enviando ? "default" : "pointer", overflow: "hidden", display: "flex", flexDirection: "column", transition: "all .15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0EA5E9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.transform = "none"; }}>
                          <div style={{ width: "100%", height: 92, background: "#0F172A0A", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            {thumb
                              ? <img src={thumb} alt={a.tipo} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <span style={{ fontSize: 26 }}>🎬</span>}
                          </div>
                          <div style={{ padding: "6px 6px 7px", fontSize: 11.5, fontWeight: 700, color: L.text, textAlign: "center", lineHeight: 1.2 }}>{a.tipo}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* Adjuntar imagen (subir desde el dispositivo) */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={subiendo || enviando} title="Adjuntar imagen"
          style={{ background: subiendo ? C.gold : L.soft, color: subiendo ? "#fff" : "#16A34A", border: `1.5px solid ${subiendo ? C.gold : "#16A34A55"}`, borderRadius: 11, padding: "10px 12px", cursor: subiendo || enviando ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, transition: "all .15s", flexShrink: 0 }}>
          <ImageIcon size={15} />
          {!isMobile && <span>{subiendo ? "Subiendo…" : "Imagen"}</span>}
        </button>
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
                    <button key={item.label} onClick={() => { setTexto(item.texto.replaceAll("{VENDEDOR}", (userName || "").split(" ")[0])); setShowPlantillas(false); }}
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

      {/* ── Modal: Resumen IA ── */}
      {resumenOpen && (
        <>
          <div onClick={() => setResumenOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 600 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: isMobile ? "calc(100% - 28px)" : 480, maxHeight: "80vh",
            background: L.white, borderRadius: 18, zIndex: 601,
            boxShadow: "0 24px 80px rgba(0,0,0,.3)", fontFamily: FONT_BODY,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Sparkles size={17} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: L.text }}>Resumen IA</div>
                <div style={{ fontSize: 11.5, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contacto.nombre || contacto.telefono || contacto.email}</div>
              </div>
              <button onClick={() => setResumenOpen(false)} style={{ background: L.soft, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
                <X size={16} />
              </button>
            </div>
            <div className="scroll-y" style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
              {resumenLoading && (
                <div style={{ textAlign: "center", color: "#7C3AED", fontSize: 13.5, padding: "26px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <style>{`.spin-slow{animation:spinSlow 1.4s linear infinite}@keyframes spinSlow{to{transform:rotate(360deg)}}`}</style>
                  <Sparkles size={26} className="spin-slow" />
                  Generando resumen de la conversación…
                </div>
              )}
              {resumenErr && !resumenLoading && (
                <div style={{ padding: "10px 13px", background: "#FEF2F2", borderRadius: 8, color: C.red, fontSize: 13, display: "flex", gap: 7, alignItems: "center" }}>
                  <AlertCircle size={14} /> {resumenErr}
                </div>
              )}
              {resumenTexto && !resumenLoading && (
                <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{resumenTexto}</div>
              )}
              {resumenTradOn && resumenTextoTrad && !resumenLoading && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #DDD6FE" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: "#6D28D9", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <Languages size={11} /> Traducción al español
                  </div>
                  <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{resumenTextoTrad}</div>
                </div>
              )}
              {resumenMensaje && !resumenLoading && (
                <div style={{ marginTop: 14, background: C.aiSoft, border: "1px solid #DDD6FE", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: "#6D28D9", fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <MessageSquare size={13} /> Mensaje para el cliente
                  </div>
                  <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{resumenMensaje}</div>
                  {resumenTradOn && resumenMsgTrad && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C4B5FD" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: "#6D28D9", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        <Languages size={11} /> Traducción al español
                      </div>
                      <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{resumenMsgTrad}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {resumenTexto && !resumenLoading && (
              <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={toggleTraducirResumen} disabled={resumenTradLoading} title="Traducir el resumen al español (solo para entenderlo)"
                  style={{ background: resumenTradOn ? "#EDE9FE" : L.soft, border: `1.5px solid ${resumenTradOn ? "#C4B5FD" : L.border}`, borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: resumenTradLoading ? "default" : "pointer", color: resumenTradOn ? "#6D28D9" : L.muted, fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6, marginRight: "auto" }}>
                  <Languages size={14} /> {resumenTradLoading ? "Traduciendo…" : (resumenTradOn ? "Ver original" : "Traducir")}
                </button>
                <button onClick={generarResumen}
                  style={{ background: L.soft, border: `1.5px solid ${L.border}`, borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: L.muted, fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={13} /> Regenerar
                </button>
                <button onClick={copiarResumen} disabled={!resumenMensaje}
                  style={{ background: resumenCopiado ? "#15803D" : (resumenMensaje ? "#7C3AED" : L.light), color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: resumenMensaje ? "pointer" : "default", fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", gap: 6 }}>
                  {resumenCopiado ? <><Check size={14} /> Copiado</> : <><FileText size={14} /> Copiar mensaje</>}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tarjeta "Avanzar": asistente de ventas IA ── */}
      {avOpen && (
        <>
          <div onClick={() => setAvOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 600 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: isMobile ? "calc(100% - 24px)" : 500, maxHeight: "86vh",
            background: L.white, borderRadius: 18, zIndex: 601,
            boxShadow: "0 24px 80px rgba(0,0,0,.3)", fontFamily: FONT_BODY,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Cabecera */}
            <div style={{ padding: "15px 18px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.gradBtn, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Sparkles size={17} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: L.text }}>Asistente de ventas</div>
                <div style={{ fontSize: 11.5, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contacto.nombre || contacto.telefono || contacto.email}</div>
              </div>
              <button onClick={() => setAvOpen(false)} style={{ background: L.soft, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
                <X size={16} />
              </button>
            </div>

            <div className="scroll-y" style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
              {avLoading && (
                <div style={{ textAlign: "center", color: C.red, fontSize: 13.5, padding: "30px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <style>{`.spin-slow{animation:spinSlow 1.4s linear infinite}@keyframes spinSlow{to{transform:rotate(360deg)}}`}</style>
                  <Sparkles size={26} className="spin-slow" />
                  Analizando la conversación…
                </div>
              )}
              {avErr && !avLoading && (
                <div style={{ padding: "10px 13px", background: "#FEF2F2", borderRadius: 8, color: C.red, fontSize: 13, display: "flex", gap: 7, alignItems: "center" }}>
                  <AlertCircle size={14} /> {avErr}
                </div>
              )}
              {avData && !avLoading && (
                <>
                  {/* ── Termómetro del negocio: probabilidad + nivel + urgencia ── */}
                  {(() => {
                    const n = AV_NIVEL[avData.nivel_interes] || AV_NIVEL.tibio;
                    const prob = typeof avData.probabilidad_cierre === "number" ? avData.probabilidad_cierre : null;
                    const barColor = prob == null ? L.light : prob >= 66 ? "#15803D" : prob >= 33 ? "#B45309" : "#B91C1C";
                    const u = AV_URGENCIA[avData.urgencia] || AV_URGENCIA.media;
                    return (
                      <div style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 14, padding: "13px 15px", marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: prob == null ? 0 : 9, flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 11px", borderRadius: 20, background: n.bg, color: n.color, display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", background: n.color }} /> {n.label}
                            </span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 11px", borderRadius: 20, background: "#EEF2FF", color: "#4338CA" }}>
                              {AV_ETAPA[avData.etapa_embudo] || avData.etapa_embudo}
                            </span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 11px", borderRadius: 20, background: u.bg, color: u.color, display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <Zap size={11} /> {u.label}
                            </span>
                          </div>
                          {prob != null && (
                            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, color: barColor, flexShrink: 0 }}>{prob}%</span>
                          )}
                        </div>
                        {prob != null && (
                          <>
                            <div style={{ height: 8, borderRadius: 6, background: "#E5E7EB", overflow: "hidden" }}>
                              <div style={{ width: `${prob}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width .5s ease" }} />
                            </div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 }}>Probabilidad de cierre</div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* Situación del cliente */}
                  {avData.resumen_cliente && (
                    <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.55, marginBottom: 14 }}>{avData.resumen_cliente}</div>
                  )}

                  {/* Señales detectadas — chips */}
                  {avData.senales_compra?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={avLbl}>Señales detectadas</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {avData.senales_compra.map((s, i) => (
                          <span key={i} style={{ fontSize: 12, fontWeight: 600, color: "#166534", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "4px 9px", lineHeight: 1.3 }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Objeción + cómo responderla — bloque de acción */}
                  {avData.objecion_detectada && avData.objecion_detectada !== "sin_objecion" && (
                    <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: "12px 15px", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#B91C1C", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: avData.objecion_respuesta ? 8 : 0 }}>
                        <AlertCircle size={13} /> Objeción: {AV_OBJECION[avData.objecion_detectada] || avData.objecion_detectada}
                      </div>
                      {avData.objecion_respuesta && (
                        <>
                          <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{avData.objecion_respuesta}</div>
                          <button onClick={() => { setTexto(avData.objecion_respuesta); setAvCopiado(true); setTimeout(() => setAvCopiado(false), 1600); }}
                            style={{ marginTop: 9, background: "#fff", border: "1px solid #FCA5A5", color: "#B91C1C", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <FileText size={12} /> Usar esta respuesta
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Mensaje sugerido — protagonista */}
                  {avData.mensaje_whatsapp && (
                    <div style={{ background: C.aiSoft, border: "1px solid #DDD6FE", borderRadius: 14, padding: "13px 15px", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#6D28D9", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 }}>
                          <MessageSquare size={13} /> Mensaje para enviar
                        </span>
                        <button onClick={toggleTraducirAv} disabled={avTradLoading} title="Traducir el mensaje al español (el original en inglés no se toca)"
                          style={{ background: "none", border: "none", cursor: avTradLoading ? "default" : "pointer", color: "#7C3AED", fontSize: 11.5, fontWeight: 700, fontFamily: FONT_BODY, display: "inline-flex", alignItems: "center", gap: 4, padding: 0, flexShrink: 0 }}>
                          <Languages size={13} /> {avTradLoading ? "Traduciendo…" : (avTradOn ? "Ver original" : "Traducir")}
                        </button>
                      </div>
                      <div style={{ fontSize: 14, color: L.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{avData.mensaje_whatsapp}</div>
                      {avTradOn && avMsgTrad && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C4B5FD" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#6D28D9", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                            <Languages size={10} /> En español
                          </div>
                          <div style={{ fontSize: 13.5, color: L.muted, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{avMsgTrad}</div>
                        </div>
                      )}
                      {avData.tecnica_aplicada && (
                        <div style={{ marginTop: 10, fontSize: 11.5, color: "#6D28D9", display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                          <Sparkles size={12} /> {avData.tecnica_aplicada}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Próximo paso — destacado con acción */}
                  {avData.proximo_paso_recomendado && (
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "11px 13px", marginBottom: 14 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 8, background: "#15803D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <ChevronRight size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...avLbl, color: "#15803D", marginBottom: 3 }}>Próximo paso · {AV_ACCION[avData.accion_crm_sugerida] || "Avanzar"}</div>
                        <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.5 }}>{avData.proximo_paso_recomendado}</div>
                      </div>
                    </div>
                  )}

                  {/* Preguntas clave — checklist */}
                  {avData.preguntas_clave?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={avLbl}>Preguntas clave para avanzar</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {avData.preguntas_clave.map((q, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: L.text, lineHeight: 1.45 }}>
                            <span style={{ color: C.red, fontWeight: 800, flexShrink: 0 }}>?</span> {q}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Consejo del coach */}
                  {avData.nota_para_vendedor && (
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 8, background: "#EEF2FF", color: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <Sparkles size={13} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={avLbl}>Consejo del coach</div>
                        <div style={{ fontSize: 12.5, color: L.muted, lineHeight: 1.5 }}>{avData.nota_para_vendedor}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Acciones */}
            {avData && !avLoading && (
              <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={aplicarEtapaAv} title="Cambiar el estado del cliente al sugerido por la IA"
                  style={{ background: avEtapaOk ? "#15803D" : L.soft, border: `1.5px solid ${avEtapaOk ? "#15803D" : L.border}`, borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: avEtapaOk ? "#fff" : L.muted, fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6, marginRight: "auto" }}>
                  {avEtapaOk ? <><Check size={14} /> Etapa aplicada</> : <>Aplicar etapa: {AV_ETAPA[avData.etapa_embudo] || avData.etapa_embudo}</>}
                </button>
                <button onClick={avanzarIA}
                  style={{ background: L.soft, border: `1.5px solid ${L.border}`, borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: L.muted, fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={13} /> Regenerar
                </button>
                <button onClick={copiarMensajeAv} disabled={!avData.mensaje_whatsapp}
                  style={{ background: avCopiado ? "#15803D" : (avData.mensaje_whatsapp ? "#7C3AED" : L.light), color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: avData.mensaje_whatsapp ? "pointer" : "default", fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", gap: 6 }}>
                  {avCopiado ? <><Check size={14} /> Copiado</> : <><FileText size={14} /> Copiar mensaje</>}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// RECORDATORIO DIARIO (avisar al vendedor ~20hs que escriba su Mi Día)
// ============================================================
function RecordatorioDiario({ perfil, rol, onIr }) {
  const [visible, setVisible] = useState(false);
  const HORA_RECORDATORIO = 20; // 20hs

  useEffect(() => {
    if (rol !== "vendedor" || !perfil?.id) { setVisible(false); return; }
    let cancel = false;
    const check = async () => {
      const ahora = new Date();
      const hoy = ahora.toISOString().slice(0, 10);
      // Antes de las 20hs, o si ya lo cerró hoy → no mostrar
      if (ahora.getHours() < HORA_RECORDATORIO) { if (!cancel) setVisible(false); return; }
      if (localStorage.getItem(`diario_recordatorio_${perfil.id}_${hoy}`)) { if (!cancel) setVisible(false); return; }
      const { data } = await supabase
        .from("diario_vendedor")
        .select("completado")
        .eq("vendedor_id", perfil.id)
        .eq("fecha", hoy)
        .limit(1);
      if (!cancel) setVisible(!data?.[0]?.completado);
    };
    check();
    const timer = setInterval(check, 3 * 60 * 1000); // re-chequear cada 3 min
    return () => { cancel = true; clearInterval(timer); };
  }, [perfil?.id, rol]);

  if (!visible) return null;

  const cerrar = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`diario_recordatorio_${perfil.id}_${hoy}`, "1");
    setVisible(false);
  };

  return (
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 5000, width: "min(440px, calc(100vw - 24px))", background: "#FFFFFF", border: "1px solid #FDE68A", borderLeft: "4px solid #F59E0B", borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,.18)", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12, fontFamily: FONT_BODY }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <BookOpen size={17} color="#B45309" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: "#0F172A", marginBottom: 2 }}>
          Te falta el reporte de hoy
        </div>
        <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.5 }}>
          {perfil?.nombre?.split(" ")[0] ? `${perfil.nombre.split(" ")[0]}, ` : ""}no te olvides de completar tu <b>Mi Día</b> antes de cerrar. Así Nicolás lo puede revisar.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => { onIr?.(); setVisible(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
            <BookOpen size={13} /> Escribir mi día
          </button>
          <button onClick={cerrar}
            style={{ padding: "6px 13px", borderRadius: 8, border: "1px solid #E4E8ED", background: "#fff", color: "#64748B", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
            Más tarde
          </button>
        </div>
      </div>
      <button onClick={cerrar} title="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
}

// ============================================================
// BIENVENIDA — primer ingreso de un vendedor al CRM
// ============================================================
function BienvenidaVendedor({ perfil, rol }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rol !== "vendedor" || !perfil?.id) { setVisible(false); return; }
    const key = `ninit_bienvenida_${perfil.id}`;
    if (!localStorage.getItem(key)) setVisible(true);
  }, [perfil?.id, rol]);

  if (!visible) return null;

  const primerNombre = perfil?.nombre?.split(" ")[0] || "";
  const cerrar = () => {
    if (perfil?.id) localStorage.setItem(`ninit_bienvenida_${perfil.id}`, new Date().toISOString());
    setVisible(false);
  };

  return (
    <div onClick={cerrar}
      style={{ position: "fixed", inset: 0, zIndex: 6000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT_BODY }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(460px, 100%)", background: "#fff", borderRadius: 20, boxShadow: "0 20px 70px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`, padding: "30px 26px 24px", textAlign: "center" }}>
          <img src={LOGO_URL} alt="NINIT Group" style={{ height: 46, marginBottom: 12, filter: "brightness(0) invert(1)" }} />
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: 0.3 }}>
            ¡Te damos la bienvenida{primerNombre ? `, ${primerNombre}` : ""}! 🎉
          </div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.92)", marginTop: 5 }}>
            Este es tu CRM de <b>NINIT Group</b>
          </div>
        </div>
        <div style={{ padding: "22px 26px 26px" }}>
          <div style={{ fontSize: 14, color: L.text, lineHeight: 1.6, marginBottom: 16 }}>
            Desde acá vas a gestionar todo tu trabajo con los clientes. Esto es lo que podés hacer:
          </div>
          {[
            { icon: <MessageSquare size={16} color={C.red} />, t: "Chatear con tus clientes", d: "Respondé consultas de WhatsApp y Messenger en tiempo real." },
            { icon: <BookOpen size={16} color={C.red} />, t: "Registrar tu día en \"Mi Día\"", d: "Contá cómo te fue para que Nicolás pueda hacer el seguimiento." },
            { icon: <Calendar size={16} color={C.red} />, t: "Organizar tu agenda", d: "Anotá tus reuniones y recordatorios." },
          ].map((it) => (
            <div key={it.t} style={{ display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 13 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "#EAF3FA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{it.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: L.text }}>{it.t}</div>
                <div style={{ fontSize: 12.5, color: L.muted, lineHeight: 1.45 }}>{it.d}</div>
              </div>
            </div>
          ))}
          <button onClick={cerrar}
            style={{ width: "100%", marginTop: 10, background: C.red, color: "#fff", border: "none", borderRadius: 11, padding: "12px", fontSize: 14.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY, letterSpacing: 0.4, boxShadow: "0 4px 14px rgba(58,141,194,.35)" }}>
            Comenzar ✨
          </button>
        </div>
      </div>
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
  const [niniPrompt, setNiniPrompt] = useState("");
  const [alertasVistas, setAlertasVistas] = useState(() => new Set()); // ids de alertas ya vistas/descartadas
  const [welcome,   setWelcome]   = useState(false);
  const tuvoSesion   = useRef(false);
  const welcomeShown = useRef(false);
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
      // Bienvenida solo al iniciar sesión (una vez por carga de la app)
      if (event === "SIGNED_IN" && s && !welcomeShown.current) {
        welcomeShown.current = true;
        setWelcome(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Cargar prompt maestro NINI BOT (si existe en public)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('/nini_master_prompt.md');
        if (!r.ok) return;
        const txt = await r.text();
        if (mounted) setNiniPrompt(txt);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── Alertas vistas/descartadas (persisten por usuario en este navegador) ──
  const vistasKey = session?.user?.id ? `ninit_alertas_vistas_${session.user.id}` : "ninit_alertas_vistas";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(vistasKey);
      setAlertasVistas(new Set(raw ? JSON.parse(raw) : []));
    } catch { setAlertasVistas(new Set()); }
  }, [vistasKey]);

  // Limpiar de localStorage las alertas descartadas que ya no existen (mantiene el storage chico).
  useEffect(() => {
    if (!contactos.length) return;
    const rawIds = new Set(calcularAlertas(contactos).map((a) => a.id));
    setAlertasVistas((prev) => {
      const filtrado = new Set([...prev].filter((id) => rawIds.has(id)));
      if (filtrado.size !== prev.size) {
        try { localStorage.setItem(vistasKey, JSON.stringify([...filtrado])); } catch {}
        return filtrado;
      }
      return prev;
    });
  }, [contactos, vistasKey]);

  // ── Perfil + contactos + tracking al iniciar sesión ──────
  useEffect(() => {
    if (!session) { setPerfil(null); return; }
    let cleanup = () => {};

    const init = async () => {
      const email = session.user.email;
      const emailLc = email.trim().toLowerCase();
      let p = await cargarPerfil(email);
      // El usuario DEBE tener un id real de vendedores: la Agenda, sesiones, etc.
      // referencian vendedores.id (agenda_vendedor.vendedor_id es NOT NULL + FK).
      if (!p) {
        // El CEO suele estar sembrado como "Nicolas" pero sin este email → buscarlo
        // por rol/nombre y vincularle el email para futuros logins.
        if (emailLc === "ninitgroup@gmail.com") {
          const { data: existentes } = await supabase.from("vendedores")
            .select("*").or("role.eq.ceo,nombre.eq.Nicolas").limit(1);
          if (existentes && existentes[0]) {
            p = existentes[0];
            if (p.email !== emailLc) {
              await supabase.from("vendedores").update({ email: emailLc, role: "ceo" }).eq("id", p.id);
              p = { ...p, email: emailLc, role: "ceo" };
            }
          }
        }
        // Si sigue sin encontrarse, crear el registro.
        if (!p) {
          const role = emailLc === "ninitgroup@gmail.com" ? "ceo" : "vendedor";
          const nombre = emailLc === "ninitgroup@gmail.com" ? "Nicolas" : email.split("@")[0];
          const { data: creado } = await supabase.from("vendedores")
            .insert({ email: emailLc, nombre, role }).select().single();
          p = creado || { nombre, email, role };
        }
      }
      // Asegurar que ninitgroup@gmail.com SIEMPRE sea CEO aunque la DB diga otra cosa,
      // y darle un nombre lindo (en vez de "ninitgroup") si la DB no tiene uno.
      if (email === "ninitgroup@gmail.com") {
        const nombreLindo = p.nombre && p.nombre !== "ninitgroup" ? p.nombre : "Nicolas";
        p = { ...p, role: "ceo", nombre: nombreLindo };
      }
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

  const toggleDestacado = async (c) => {
    const nuevo = !c.destacado;
    updateContacto({ ...c, destacado: nuevo });          // optimista
    await supabase.from("contactos").update({ destacado: nuevo }).eq("id", c.id);
  };

  // Actualiza uno o varios campos de un contacto (optimista + persistencia)
  const patchContacto = async (c, campos) => {
    updateContacto({ ...c, ...campos });                 // optimista
    const { error } = await supabase.from("contactos").update(campos).eq("id", c.id);
    if (error) console.warn("patchContacto:", error.message);
  };

  // Aviso "hay que llamar" — se guarda en el navegador (no requiere columna en la DB)
  const LLAMAR_KEY = "ninit_requiere_llamada";
  const [requiereLlamada, setRequiereLlamada] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LLAMAR_KEY) || "[]")); } catch { return new Set(); }
  });
  const persistLlamar = (set) => { try { localStorage.setItem(LLAMAR_KEY, JSON.stringify([...set])); } catch {} };
  const toggleLlamada = (c) => setRequiereLlamada((prev) => {
    const n = new Set(prev);
    if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
    persistLlamar(n); return n;
  });
  const marcarLlamada = (c) => setRequiereLlamada((prev) => {
    const n = new Set(prev); n.add(c.id); persistLlamar(n); return n;
  });

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
  const alertas   = calcularAlertas(contactos).filter((a) => !alertasVistas.has(a.id));

  const persistVistas = (set) => {
    setAlertasVistas(new Set(set));
    try { localStorage.setItem(vistasKey, JSON.stringify([...set])); } catch {}
  };
  const descartarAlerta = (id) => { const n = new Set(alertasVistas); n.add(id); persistVistas(n); };
  const descartarTodasAlertas = () => { const n = new Set(alertasVistas); alertas.forEach((a) => n.add(a.id)); persistVistas(n); };

  const mobileInPanel = isMobile && (
    activo !== null ||
    vista === "pedidos" || vista === "reportes" || vista === "admin" ||
    vista === "control" || vista === "diario" || vista === "agenda" || vista === "directorio"
  );

  return (
    <div className={`app-layout${mobileInPanel ? " in-panel" : ""}`}
      style={{ fontFamily: FONT_BODY, background: L.bg }}>
      <FontLoader />
      {welcome && <WelcomeSplash onDone={() => setWelcome(false)} />}

      <div className="app-sidebar">
        <Sidebar contactos={contactos} activo={activo}
          onSelect={(c) => setActivo(c)}
          onToggleDestacado={toggleDestacado}
          onPatchContacto={patchContacto}
          requiereLlamada={requiereLlamada} onToggleLlamada={toggleLlamada} onMarcarLlamada={marcarLlamada}
          onLogout={handleLogout}
          userEmail={userEmail} userName={userName}
          vista={vista} setVista={setVista} alertas={alertas}
          onDescartarAlerta={descartarAlerta} onDescartarTodasAlertas={descartarTodasAlertas}
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
              <CEODashboard isMobile={isMobile} perfil={perfil} />
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
        ) : vista === "agenda" ? (
          <>
            {isMobile && <MobileBack title="Agenda" onBack={() => setVista("chat")} />}
            <div style={{ flex: 1, overflowY: "auto", height: "100%" }}>
              <Agenda vendedorId={perfil?.id} vendedorNombre={perfil?.nombre} isMobile={isMobile} contactos={contactos}
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

      <AIAsistente contactoActivo={activo} alertas={alertas} contactos={contactos} nombreUsuario={userName} perfilId={perfil?.id} rol={rol} onRefrescar={recargarContactos} niniPrompt={niniPrompt} />

      <RecordatorioDiario perfil={perfil} rol={rol} onIr={() => setVista("diario")} />
      <BienvenidaVendedor perfil={perfil} rol={rol} />
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
