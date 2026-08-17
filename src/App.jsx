// v2.1 — 2026-06-08
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import {
  Bell, Search, LogOut, MessageSquare, BarChart2,
  Pencil, Bot, User, Calendar, Send, X, Check, Plus,
  Sparkles, Phone, PhoneCall, Mail, Building2, MapPin, FileText,
  AlertCircle, Clock, ChevronLeft, ChevronRight, Zap, ShoppingBag, Shield, Trash2,
  BookOpen, Activity, Mic, MicOff, Volume2, VolumeX, Menu, Users, Eye, EyeOff,
  Image as ImageIcon, Languages, Reply, SlidersHorizontal, Star,
  PanelRight, PanelRightClose, CreditCard, Megaphone,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { SiGmail, SiGoogleads, SiMessenger } from "react-icons/si";
import { Receipt } from "@phosphor-icons/react";
import PedidosPanel, { NuevoPedidoModal, imprimirPedido } from "./Pedidos";
import {
  supabase, enviarPorCanal, LOGO_URL, C, FONT_DISPLAY, FONT_BODY,
  VENDEDORES, ESTADOS, ESTADOS_FIN, SOCIO_FIN, LINK_FIN, calcularAlertas, getRol, cargarPerfil,
  ELEVENLABS_KEY, ELEVENLABS_VOICE_ID, EMAIL_HABILITADO,
} from "./lib";
import { COLOR, RADIUS, SHADOW, L } from "./theme";
import { activarPush } from "./push";
import Reportes from "./Reportes";
import AdminPanel from "./AdminPanel";
import DiarioVendedor from "./DiarioVendedor";
import CEODashboard from "./CEODashboard";
import Agenda from "./Agenda";
import Directorio from "./Directorio";
import Promociones from "./Promociones";
import FiltrosModal, { FILTROS_INICIAL, contarActivos, aplicaFiltrosIA } from "./FiltrosModal";
import { cargarConsultaronFin } from "./finConsultas";
import { notificarCambioEstado } from "./metaEventos";

// ============================================================
// PALETA LIGHT — deriva de src/theme.js (fuente única de tokens)
// ============================================================
// Las claves no cambian: las leen cientos de estilos inline de este archivo.
// El color se controla desde theme.js.
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

// Formato corto con segundos para el cronómetro en vivo: "45s", "3:07", "2h 5m".
function cronoStr(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(s % 60).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
// Cronómetro de respuesta: tiempo desde el último mensaje del cliente hasta que
// alguien del equipo abre el chat (vendedor o administración). Al abrirlo se marca
// `atendido_at` y el reloj se detiene.
// null = ya lo leyó alguien (o no hay consulta pendiente del cliente).
function calcTiempoRespuesta(c) {
  if (!c.ultimo_in_at) return null;
  const atendido = c.atendido_at && new Date(c.atendido_at) >= new Date(c.ultimo_in_at);
  if (atendido) return null;
  return Date.now() - new Date(c.ultimo_in_at).getTime();
}
// Badge con el cronómetro corriendo en vivo (tick cada 1s, solo se re-renderiza él).
function CronometroRespuesta({ desde }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.now() - new Date(desde).getTime();
  const clr = tiempoClr(ms);
  return (
    <span title={`Consulta sin atender hace ${msToStr(ms)}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800,
        padding: "1px 6px", borderRadius: 6, color: clr, background: `${clr}1A`, border: `1px solid ${clr}40`,
        fontVariantNumeric: "tabular-nums", lineHeight: 1.6 }}>
      <Clock size={10} /> {cronoStr(ms)}
    </span>
  );
}

// ── Preview del último mensaje en la lista ──────────────────
// n8n re-guarda lo que el CRM ya mandó con el prefijo "*Nombre · NINIT Group:*".
// El chat oculta esos duplicados (ver ECHO_PREFIX_RE), pero `ultimo_msg` se
// queda con el eco y el prefijo se colaba en el preview de la lista. Acá se
// muestra solo el texto del mensaje.
const ECHO_PREFIX_STRIP = /^\*[^*]*NINIT Group:\*\s*/;
function previewMsg(txt) {
  const t = String(txt || "").replace(ECHO_PREFIX_STRIP, "").replace(/\s+/g, " ").trim();
  return t || "—";
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
  // Si el vendedor lo marcó como atendido ("quitar de la lista") y el cliente
  // no volvió a escribir desde entonces, no aparece. Si el cliente manda un
  // mensaje nuevo después del descarte, vuelve a aparecer (está pidiendo otra vez).
  if (c.pide_descartado_at && (!c.ultimo_in_at || new Date(c.pide_descartado_at) >= new Date(c.ultimo_in_at)))
    return { pide: false };
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
// QUIÉN ATIENDE EL CHAT
// ============================================================
// Para que dos vendedores no se metan en la misma conversación. La asignación
// del CEO (`vendedor`) manda; si nadie lo asignó, vale quien de hecho está
// hablando: el último humano que respondió, que el trigger de `mensajes` deja
// en `contactos.ultimo_agente` (ver supabase_ultimo_agente_migration.sql).
// Devuelve { nombre, asignado } o null si no lo agarró nadie todavía.
function quienAtiende(c) {
  const asignado = (c?.vendedor || "").trim();
  if (asignado) return { nombre: asignado, asignado: true };
  const hablando = (c?.ultimo_agente || "").trim();
  if (hablando) return { nombre: hablando, asignado: false };
  return null;
}
const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const mismoVendedor = (a, b) =>
  !!a && !!b && primerNombre(a).toLowerCase() === primerNombre(b).toLowerCase();

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
- 2-Stall   → USD 22,800
- 3-Stall   → USD 26,700  (el más popular, mejor balance)
- 4-Stall   → USD 31,700  (festivales / alto flujo)
- ADA + 2   → USD 33,500  (cumplimiento federal ADA)
Estos precios incluyen: producción, logística internacional, entrega al hub logístico de NTG más cercano, ensamblado, inspección y preparación para operar.
Catálogo: https://ninitgroup.com/wp-content/uploads/2026/04/NINITGROUP_CATALOG.pdf

NTG SOLO VENDE unidades — NO se ofrece alquiler. Si el cliente pregunta por alquiler/renta, aclará amablemente que trabajamos únicamente con venta y encaminá la charla hacia la compra. Nunca ofrezcas ni cotices alquiler.

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
- 2-Stall White Marble → https://ninitgroup.com/wp-content/uploads/2026/07/2.jpeg
- 3-Stall (el más popular) → https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-18-at-5.18.09-PM-2-1.jpeg
- 4-Stall → https://ninitgroup.com/wp-content/uploads/2026/07/exterior.jpeg · https://ninitgroup.com/wp-content/uploads/2026/07/exteriror2.jpeg
- ADA+2 → https://ninitgroup.com/wp-content/uploads/2026/05/ada22.png
- 6-Stall → https://ninitgroup.com/wp-content/uploads/2026/05/6bano.png
- Vista general / render → https://ninitgroup.com/wp-content/uploads/2026/05/ChatGPT-Image-21-may-2026-12_16_51-p.m.png
INTERIORES:
- 2-Stall:
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior2b.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior2c.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/2d.jpeg
  - (foto extra) https://ninitgroup.com/wp-content/uploads/2026/07/2s.jpeg
- 3-Stall:
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior01.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior02.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior03.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior04.jpeg
  - (foto extra) https://ninitgroup.com/wp-content/uploads/2026/07/extras.jpeg
  - (videos interior) https://ninitgroup.com/wp-content/uploads/2026/07/videointerior1.mp4 · https://ninitgroup.com/wp-content/uploads/2026/07/videointerior2.mp4 · https://ninitgroup.com/wp-content/uploads/2026/07/videointerior3.mp4
- 4-Stall:
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior01-1.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior2.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior3.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior4.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior5.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/07/interior6.jpeg
  - (foto extra) https://ninitgroup.com/wp-content/uploads/2026/07/extras.jpeg
- 5-Stall y 6-Stall (comparten el mismo interior):
  - https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.48-PM-1-1.jpeg
  - https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-3.jpeg
- ADA+2: https://ninitgroup.com/wp-content/uploads/2026/01/dfhxvb.png
PLANOS (floor plans):
- 2-Stall → https://ninitgroup.com/wp-content/uploads/2026/07/plano2.jpeg
- 3-Stall → https://ninitgroup.com/wp-content/uploads/2026/05/PHOTO-2026-01-08-01-13-01-1.jpg
- 4-Stall → https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-11-at-4.39.53-PM.jpeg
VIDEOS:
- 2-Stall → https://ninitgroup.com/wp-content/uploads/2026/07/video2puertas.mp4
- 3-Stall → https://ninitgroup.com/wp-content/uploads/2026/07/video03.mp4
PALETA DE COLORES (misma para todos los modelos):
- https://ninitgroup.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1.jpeg
Usá SOLO estos links. No inventes otras URLs de imágenes. En el chat el vendedor tiene un botón "Fotos" → elige el modelo → elige Exterior / Interior / Plano / Video / Paleta.
Features estándar: A/C, luces LED, inodoros con descarga, lavamanos, espejos, tanques de agua limpia/residual, sistema de bomba de agua, freno eléctrico, escalones plegables, gatos estabilizadores, pasamanos. No abrumar con detalle técnico salvo que lo pidan.

════ PIPELINE DE VENTAS (estados del CRM) ════
Lead Nuevo → Contactado → Interesado → Cotización Enviada → Negociando → Pendiente → Cerrado ✓ / Perdido

════ LEADS DE META ADS ════
- Son prospectos calientes — ya vieron el anuncio y se interesaron.
- Responder RÁPIDO (idealmente dentro de 5 min) aumenta mucho la tasa de cierre.
- Calificar con una pregunta a la vez: fecha del evento · ZIP/ciudad · cantidad de baños o personas. (NTG solo vende, no alquila.)
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
// THEME LOADER — aplica los tokens de src/theme.js al documento
// ============================================================
// Las fuentes ya vienen del <link> de index.html; antes se inyectaban acá otra
// vez y se pedían dos veces.
function FontLoader() {
  useEffect(() => {
    document.documentElement.style.setProperty("--radius-btn", `${RADIUS.btn}px`);
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
// LOGO CON BRILLO — muestra el logo y hace pasar un destello (sol) por su
// silueta cada 5s. El destello se recorta a la forma del logo con mask-image,
// así el brillo viaja "por el contorno" y no en un rectángulo.
// ============================================================
function LogoBrillo({ imgStyle = {}, alt = "NINIT Group" }) {
  const fit = imgStyle.objectFit || "contain";
  const pos = imgStyle.objectPosition || "center";
  return (
    <span style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
      <img src={LOGO_URL} alt={alt} style={imgStyle} />
      <span
        aria-hidden
        className="logo-brillo"
        style={{
          position: "absolute", left: 0, top: 0, right: 0, bottom: 0, pointerEvents: "none",
          WebkitMaskImage: `url(${LOGO_URL})`, maskImage: `url(${LOGO_URL})`,
          WebkitMaskSize: fit, maskSize: fit,
          WebkitMaskPosition: pos, maskPosition: pos,
          WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          borderRadius: imgStyle.borderRadius,
        }}
      />
    </span>
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
          <LogoBrillo imgStyle={{ width: "100%", maxWidth: 320, height: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 2px 14px rgba(58,141,194,0.45))" }} />
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
    // Si el asistente cambia la etapa, hay que saber de dónde venía para poder
    // avisarle a Meta (y para no emitir nada si en realidad no cambió).
    let antes = null;
    if (cambios.estado) {
      const { data } = await supabase.from("contactos").select("id,estado").eq("id", id).limit(1);
      antes = data?.[0] || null;
    }
    const { error } = await supabase.from("contactos").update(cambios).eq("id", id);
    if (error) return `Error: ${error.message}`;
    if (antes) notificarCambioEstado(antes, cambios);
    return `✅ Contacto actualizado.`;
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

    const briefingBase = () => {
      let b = `${saludo}, ${primerNombre}.`;
      if (urgentes > 0)       b += ` Hay ${urgentes} cliente${urgentes > 1 ? "s" : ""} esperando respuesta urgente.`;
      if (segVencidos > 0)    b += ` Tenés ${segVencidos} seguimiento${segVencidos > 1 ? "s" : ""} vencido${segVencidos > 1 ? "s" : ""}.`;
      if (sinRespuesta > 0 && urgentes === 0) b += ` Hay ${sinRespuesta} conversación${sinRespuesta > 1 ? "es" : ""} sin responder.`;
      if (urgentes === 0 && segVencidos === 0 && sinRespuesta === 0) b += ` Todo está al día. ¿En qué te ayudo?`;
      else b += ` ¿Arrancamos por eso?`;
      return b;
    };

    // Vendedores (y fallback): briefing corto de pendientes.
    if (rol !== "ceo") {
      const b = briefingBase();
      setMsgs([{ from: "ai", text: b }]);
      if (vozOnRef.current) hablar(b);
      return;
    }

    // CEO (Nicolás): reporte del día al instante, como un empleado que lo pone al tanto.
    (async () => {
      try {
        const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
        const { data } = await supabase
          .from("mensajes")
          .select("agente,direccion,created_at")
          .gte("created_at", inicioDia.toISOString())
          .order("created_at", { ascending: false })
          .limit(3000);
        const msgsHoy = data || [];
        const inHoy  = msgsHoy.filter((m) => m.direccion === "in").length;
        const outHoy = msgsHoy.filter((m) => m.direccion === "out");
        const nuevosHoy = contactos.filter((c) => c.created_at && new Date(c.created_at) >= inicioDia).length;
        const map = {};
        outHoy.forEach((m) => { const a = (m.agente && String(m.agente).trim()) || "el bot"; map[a] = (map[a] || 0) + 1; });
        const quien = Object.entries(map).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} (${n})`).join(", ");

        let b = `${saludo}, ${primerNombre}. Te pongo al día con lo de hoy:\n`;
        b += `• ${nuevosHoy} lead${nuevosHoy === 1 ? "" : "s"} nuevo${nuevosHoy === 1 ? "" : "s"}\n`;
        b += `• ${inHoy} consulta${inHoy === 1 ? "" : "s"} de clientes · ${outHoy.length} respuesta${outHoy.length === 1 ? "" : "s"} enviada${outHoy.length === 1 ? "" : "s"}\n`;
        b += `• Atendió: ${quien || "nadie todavía"}\n`;
        if (urgentes > 0)    b += `• ⚠️ ${urgentes} cliente${urgentes > 1 ? "s" : ""} esperando respuesta urgente\n`;
        if (segVencidos > 0) b += `• ⚠️ ${segVencidos} seguimiento${segVencidos > 1 ? "s" : ""} vencido${segVencidos > 1 ? "s" : ""}\n`;
        if (sinRespuesta > 0 && urgentes === 0) b += `• ${sinRespuesta} conversación${sinRespuesta > 1 ? "es" : ""} sin responder\n`;
        b += `¿Querés el informe completo del día o el desempeño del equipo?`;
        setMsgs([{ from: "ai", text: b }]);
        if (vozOnRef.current) hablar(b.replace(/•/g, "").replace(/\n+/g, ". "));
      } catch {
        const b = briefingBase();
        setMsgs([{ from: "ai", text: b }]);
        if (vozOnRef.current) hablar(b);
      }
    })();
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
    const inicioSemana = new Date(desde7); inicioSemana.setHours(0, 0, 0, 0);
    const desde7Str = `${desde7.getFullYear()}-${String(desde7.getMonth() + 1).padStart(2, "0")}-${String(desde7.getDate()).padStart(2, "0")}`;
    const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
    const inicioMesStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-01`;
    // Ventana de llamadas: la más amplia entre "inicio de mes" y "hace 7 días"
    // (por si la semana cruza de mes) para poder contar hoy / semana / mes.
    const desdeLlam = inicioMesStr < desde7Str ? inicioMesStr : desde7Str;
    const safe = async (p) => { try { const { data, error } = await p; return error ? [] : (data || []); } catch { return []; } };

    const [vends, pedidos, diarios, sesiones, agenda, msgsSemana, llamadasSem] = await Promise.all([
      safe(supabase.from("vendedores").select("id,nombre,role,activo").eq("activo", true)),
      safe(supabase.from("pedidos").select("vendedor,total,estado,created_at")),
      safe(supabase.from("diario_vendedor").select("vendedor_id,fecha,completado,estado_animo,valoracion_nota,valoracion_comentario").gte("fecha", desde7Str).order("fecha", { ascending: false })),
      safe(supabase.from("sesiones_vendedor").select("vendedor_id,duracion_seg,fecha").gte("fecha", desde7Str)),
      safe(supabase.from("agenda_vendedor").select("vendedor_id,fecha,hora,tipo,titulo,completado").gte("fecha", hoyStr).order("fecha").order("hora", { nullsFirst: true })),
      // Mensajes de la semana (in y out) para el resumen global. Orden desc + limit
      // alto: si hubiera muchísimos, se preservan los más recientes (los de hoy).
      safe(supabase.from("mensajes").select("agente,direccion,created_at").gte("created_at", inicioSemana.toISOString()).order("created_at", { ascending: false }).limit(5000)),
      // Llamadas del mes (eventos de agenda tipo llamada) para contar hechas hoy/semana/mes.
      safe(supabase.from("agenda_vendedor").select("vendedor_id,fecha,tipo,completado").eq("tipo", "llamada").gte("fecha", desdeLlam)),
    ]);
    // Salientes de HOY por agente: quién respondió cada mensaje (para el desglose por vendedor).
    const msgsHoy = msgsSemana.filter((m) => m.direccion === "out" && new Date(m.created_at) >= inicioDia);

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

    // ── Resumen GLOBAL del equipo (todos los chats, estén o no asignados) ──
    // Es lo que hacía falta: cuando los leads no están asignados a un vendedor,
    // los bloques individuales dan 0 y el reporte parecía "vacío". Acá se ven los
    // totales reales: consultas entrantes, respuestas y QUIÉN respondió, llamadas, etc.
    const msgsOut = msgsSemana.filter((m) => m.direccion === "out");
    const msgsIn  = msgsSemana.filter((m) => m.direccion === "in");
    const esDeHoy = (m) => new Date(m.created_at) >= inicioDia;
    const outHoy = msgsOut.filter(esDeHoy);
    const inHoy  = msgsIn.filter(esDeHoy);
    // Desglose "quién respondió": agrupa los salientes por agente (null = Bot).
    const porAgente = (arr) => {
      const map = {};
      arr.forEach((m) => { const a = (m.agente && String(m.agente).trim()) || "Bot/automático"; map[a] = (map[a] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}: ${n}`).join(", ");
    };
    const hechas        = llamadasSem.filter((l) => l.completado);
    const llamHoyHechas = hechas.filter((l) => l.fecha === hoyStr).length;
    const llamSemHechas = hechas.filter((l) => l.fecha >= desde7Str).length;
    const llamMesHechas = hechas.filter((l) => l.fecha >= inicioMesStr).length;
    const llamPend      = llamadasSem.filter((l) => !l.completado && l.fecha >= hoyStr).length;
    const reqLlamada    = contactos.filter((c) => c.requiere_llamada).length;
    // Quién hizo las llamadas de la semana (por vendedor).
    const nombrePorId = Object.fromEntries(vends.map((v) => [v.id, v.nombre]));
    const llamPorVend = {};
    hechas.filter((l) => l.fecha >= desde7Str).forEach((l) => { const n = nombrePorId[l.vendedor_id] || "otro"; llamPorVend[n] = (llamPorVend[n] || 0) + 1; });
    const llamPorVendTxt = Object.entries(llamPorVend).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}: ${c}`).join(", ");
    const totalLeads    = contactos.length;
    const sinAsignar    = contactos.filter((c) => !c.vendedor).length;
    const nuevosHoy     = contactos.filter((c) => c.created_at && new Date(c.created_at) >= inicioDia).length;
    const nuevosSem     = contactos.filter((c) => c.created_at && new Date(c.created_at) >= inicioSemana).length;
    const sinRespGlobal = contactos.filter((c) => !c.bot_activo && c.ultimo_in_at && (!c.ultimo_out_at || new Date(c.ultimo_in_at) > new Date(c.ultimo_out_at))).length;
    const estGlobal = {}; contactos.forEach((c) => { const k = c.estado || "nuevo"; estGlobal[k] = (estGlobal[k] || 0) + 1; });
    const estGlobalTxt = Object.entries(estGlobal).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${ESTADOS[k]?.label || k}`).join(", ");

    const globalTxt = `════ RESUMEN GLOBAL DEL EQUIPO (todos los chats, estén o no asignados) ════
HOY (${hoyStr}):
  • Leads nuevos: ${nuevosHoy}
  • Consultas entrantes de clientes: ${inHoy.length} mensajes
  • Respuestas enviadas: ${outHoy.length} mensajes
  • Quién respondió hoy: ${porAgente(outHoy) || "nadie respondió todavía"}
  • Llamadas hechas hoy: ${llamHoyHechas} | Llamadas agendadas pendientes: ${llamPend} | Clientes marcados "hay que llamar": ${reqLlamada}
ÚLTIMOS 7 DÍAS:
  • Leads nuevos: ${nuevosSem}
  • Consultas entrantes: ${msgsIn.length} | Respuestas enviadas: ${msgsOut.length}
  • Quién respondió (semana): ${porAgente(msgsOut) || "sin respuestas"}
  • Llamadas hechas: ${llamSemHechas}${llamPorVendTxt ? ` (por vendedor → ${llamPorVendTxt})` : ""}
ESTE MES:
  • Llamadas hechas: ${llamMesHechas}
CARTERA TOTAL: ${totalLeads} contactos | ${sinAsignar} sin asignar a un vendedor | ${sinRespGlobal} sin responder ahora mismo
  • Por estado: ${estGlobalTxt || "sin datos"}`;

    const texto = `\n\n${globalTxt}${vendedoresList.length
      ? `\n\n════ DATOS POR VENDEDOR (para desempeño individual) ════\n${bloques.join("\n\n")}`
      : ""}`;
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
      const pideReporte = /report|resumen|desempe|rendimiento|informe|equipo|vendedor|ranking|compar|c[oó]mo va|como va|c[oó]mo venimos|como venimos|c[oó]mo estamos|como estamos|c[oó]mo vamos|como vamos|productiv|ventas del|pipeline|m[eé]tricas?|kpi|acciones|actividad|llamad|del d[ií]a|de la semana|estad[íi]stica?s?|cu[aá]nt[oa]s?|qui[eé]n atend|qui[eé]n respond|qui[eé]n habl|atendi[oó]|respondi[oó]|mensajes?|contactos?|leads?|consultas?|n[uú]meros?|movimiento|entr[oó]|entraron|\bhoy\b/i.test(q);
      if (rol === "ceo" && pideReporte) {
        if (Date.now() - reporteCEORef.current.ts > 60000) { await cargarReporteCEO(); }
        sysExtra += reporteCEORef.current.texto;
        sysExtra += `\n\n════ CÓMO ARMAR EL REPORTE (sos CEO) ════
Hablás con Nicolás, el DUEÑO de NINIT Group. Comportate como su MANO DERECHA / jefe de operaciones: un empleado de máxima confianza que lo pone al día de TODO lo que pasó, con datos exactos, sin que él tenga que preguntar dos veces. Sos claro, directo y honesto: le decís lo bueno y lo que está flojo.
Cuando Nicolás pida un REPORTE, RESUMEN, "la estadística de hoy", "cuántos contactos/mensajes", "quién atendió", "cómo venimos/estamos", la ACTIVIDAD o el DESEMPEÑO del equipo o de un vendedor, armá un informe PROFESIONAL, COMPLETO y ordenado usando el RESUMEN GLOBAL y los DATOS POR VENDEDOR de arriba.
Empezá SIEMPRE por el panorama del día con NÚMEROS CONCRETOS (aunque los leads no estén asignados a un vendedor):
  1. Actividad de HOY: leads nuevos, consultas entrantes de clientes, respuestas enviadas y QUIÉN atendió cada cosa (desglose por agente/vendedor; si respondió el bot, decilo). Nombrá a cada vendedor aunque haya hecho 0.
  2. Llamadas: hechas HOY, en la SEMANA y en el MES (con quién las hizo), agendadas pendientes y clientes marcados "hay que llamar".
  3. Actividad de los ÚLTIMOS 7 DÍAS: leads nuevos, consultas, respuestas y quién respondió.
  4. Cartera total: cuántos contactos hay, cuántos sin asignar, cuántos sin responder y el desglose por estado.
Mantenelo claro y al grano para Nicolás: números concretos, nombres reales, cero relleno. Usá viñetas y negrita para que se lea de un vistazo.
Después, si pide desempeño individual, sumá por vendedor: pipeline, ventas del mes, actividad, diario y ánimo, tu valoración y agenda próxima.
Cerrá SIEMPRE con: (a) lo que necesita la atención de Nicolás HOY (urgencias, leads calientes, cosas sin responder) y (b) 1-2 recomendaciones concretas y accionables.
REGLAS DE ORO: NUNCA inventes ni digas "no hay nada registrado" si arriba hay números; usá SOLO los datos provistos. Si un dato puntual no está, decí "sin datos" — nunca digas que no tenés acceso ni le pidas a Nicolás que lo busque él. Si un número es 0, decilo con naturalidad (ej. "hoy todavía no entró ningún lead nuevo").`;
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

// Tabs de la lista de conversaciones. Antes había tres cosas distintas para
// filtrar (estos tabs, el botón del teléfono y el de la estrella), cada una con
// su propio estado: se combinaban entre sí y nadie entendía qué estaba viendo.
// Ahora es UNA sola tira: se elige un chip y la lista muestra eso.
const SIDEBAR_TABS = [
  { key: "todos",            label: "Todos",                            color: C.red },
  { key: "q:sinresponder",   label: "Sin responder",  icon: Clock,      color: "#B45309" },
  { key: "q:pidecontacto",   label: "Piden contacto", icon: PhoneCall,  color: C.red },
  { key: "q:financiamiento", label: "Financiamiento", icon: CreditCard, color: "#7C3AED" },
  { key: "q:seguimientos",   label: "Seguimientos",   icon: Calendar,   color: "#0E7490" },
  { key: "favoritos",        label: "Favoritos",      icon: Star,       color: "#B45309" },
];

// Cuántos días atrás se miran las campañas para marcar un chat como "está
// contestando la promo". Más viejo que eso no explica el mensaje que entró hoy.
//
// La lista de chats NO se toca por esto: sigue mostrando todo como siempre, y
// las respuestas a una campaña se trabajan en Promociones → Respuestas
// (decisión de Nicolás, 17-ago-2026). Acá sólo se marca la fila con un ícono.
const DIAS_PROMO_VIGENTE = 30;

// ============================================================
// TIEMPO — pestañas y encabezados de la lista
// ============================================================
// Cuántos DÍAS DE CALENDARIO atrás quedó una fecha. Se compara medianoche
// contra medianoche a propósito: un mensaje de anoche a las 23:50 tiene que
// decir "Ayer", no "hace 9 horas" (que caería en "hoy").
function diasAtras(fecha) {
  if (!fecha) return Infinity;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return Infinity;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const h = new Date();
  const b = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  return Math.round((b - a) / 86400000);
}

// Pestañas de tiempo. Son un eje DISTINTO de los chips de arriba: los chips
// dicen QUÉ chats (sin responder, favoritos…) y estas dicen DE CUÁNDO. Por eso
// van en su propia fila y no mezcladas en la misma tira.
// `label` es lo que se ve (tiene que entrar en el ancho del panel, que en
// escritorio son ~380px y en celular ~360px) y `titulo` lo que explica la
// pestaña al pasar el mouse.
const PERIODOS = [
  { key: "todos",  label: "Todos",  titulo: "Todas las conversaciones",       test: () => true },
  { key: "hoy",    label: "Hoy",    titulo: "Solo lo de hoy",                 test: (d) => d <= 0 },
  { key: "semana", label: "7 días", titulo: "Últimos 7 días",                 test: (d) => d <= 7 },
  { key: "mes",    label: "30 días", titulo: "Últimos 30 días",               test: (d) => d <= 30 },
  { key: "viejos", label: "Viejos", titulo: "Más viejos que 30 días",         test: (d) => d > 30 },
];

// Encabezado del tramo al que pertenece un chat. Los tramos son más finos que
// las pestañas (Hoy / Ayer / …) porque acá el objetivo es separar visualmente,
// no filtrar: aunque estés en "Todos", lo de hoy no se mezcla con lo de marzo.
function grupoTiempo(fecha) {
  const dias = diasAtras(fecha);
  if (dias === Infinity) return "Sin fecha";
  if (dias <= 0)  return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias <= 7)  return "Esta semana";
  if (dias <= 30) return "Este mes";
  const d = new Date(fecha);
  const mismoAnio = d.getFullYear() === new Date().getFullYear();
  const txt = d.toLocaleDateString("es-AR", { month: "long", ...(mismoAnio ? {} : { year: "numeric" }) });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// Corta una lista YA ORDENADA de más nuevo a más viejo en secciones por tramo.
// Al venir ordenada, los de un mismo tramo caen juntos y alcanza con comparar
// contra la sección anterior.
function agruparPorTiempo(items, campoFecha = "updated_at") {
  const out = [];
  for (const it of items) {
    const titulo = grupoTiempo(it[campoFecha]);
    if (!out.length || out[out.length - 1].titulo !== titulo) out.push({ titulo, items: [] });
    out[out.length - 1].items.push(it);
  }
  return out;
}

// ============================================================
// BOTTOM NAV — navegación de celular
// ============================================================
// Reemplaza a los tabs de arriba. Se oculta cuando hay un panel abierto (chat,
// reportes, etc.): esas pantallas son de pantalla completa y tienen su propio
// botón de volver, y acá taparía el cuadro de escritura del chat.
//
// Del diseño quedan afuera "Inicio" y "Tareas" (no tienen módulo). "Contactos"
// vive en Más porque hoy es solo del CEO.
const BOTTOM_NAV = [
  { key: "chat",      label: "Chats",    icon: MessageSquare, badge: "noLeidos" },
  { key: "prioridad", label: "Piden",    icon: PhoneCall,     badge: "pide" },
  { key: "agenda",    label: "Agenda",   icon: Calendar },
  { key: "pedidos",   label: "Pedidos",  icon: ShoppingBag },
];

function BottomNav({ vista, setVista, rol, contactos = [], userName, onLogout }) {
  const [mas, setMas] = useState(false);
  const nPide     = contactos.reduce((n, c) => n + (pideContacto(c).pide ? 1 : 0), 0);
  const nNoLeidos = contactos.reduce((n, c) => n + ((c.no_leidos || 0) > 0 ? 1 : 0), 0);
  const conteo    = (b) => (b === "pide" ? nPide : b === "noLeidos" ? nNoLeidos : 0);

  // Lo que no entra en la barra, por rol.
  const extras = NAV_ITEMS.filter((i) => i.roles.includes(rol) && !BOTTOM_NAV.some((b) => b.key === i.key));
  const masActivo = extras.some((i) => i.key === vista);

  const item = (key, label, Icon, n, activo, onClick) => (
    <button key={key} onClick={onClick} aria-current={activo ? "page" : undefined}
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "7px 2px 5px",
        border: "none", background: "none", cursor: "pointer", position: "relative", borderRadius: 0,
        color: activo ? C.red : L.muted, fontFamily: FONT_BODY, fontSize: 10, fontWeight: activo ? 700 : 500 }}>
      <span style={{ position: "relative", display: "flex" }}>
        <Icon size={21} />
        {n > 0 && (
          <span style={{ position: "absolute", top: -4, right: -7, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800,
            borderRadius: 8, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `1.5px solid ${L.white}` }}>
            {n}
          </span>
        )}
      </span>
      {label}
    </button>
  );

  return (
    <>
      <nav aria-label="Navegación"
        style={{ flexShrink: 0, display: "flex", alignItems: "stretch", background: L.white, borderTop: `1px solid ${L.border}`,
          paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 12px rgba(16,24,40,.06)" }}>
        {BOTTOM_NAV.map(({ key, label, icon, badge }) =>
          item(key, label, icon, badge ? conteo(badge) : 0, vista === key, () => setVista(key))
        )}
        {item("mas", "Más", Menu, 0, masActivo, () => setMas(true))}
      </nav>

      {/* Hoja "Más" */}
      {mas && (
        <div onClick={() => setMas(false)}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()}
            className="ninit-mas-sheet"
            style={{ width: "100%", background: L.white, borderRadius: "16px 16px 0 0", padding: "8px 0 max(10px, env(safe-area-inset-bottom))" }}>
            {/* Keyframe propio: el `ninitSheetUp` del Sidebar solo se inyecta
                cuando la vista es "chat", así que desde Pedidos o Agenda esta
                hoja no habría animado. */}
            <style>{`.ninit-mas-sheet{animation:ninitMasUp .2s ease}@keyframes ninitMasUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.ninit-mas-sheet{animation:none}}`}</style>
            <div style={{ width: 38, height: 4, borderRadius: 3, background: L.border, margin: "6px auto 10px" }} />
            {extras.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => { setVista(key); setMas(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "13px 20px", border: "none", cursor: "pointer",
                  background: vista === key ? L.soft : "none", borderRadius: 0,
                  fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: vista === key ? 700 : 500, color: vista === key ? C.red : L.text }}>
                <Icon size={19} color={vista === key ? C.red : L.muted} /> {label}
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${L.border}`, marginTop: 6, paddingTop: 6 }}>
              <button onClick={onLogout}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "13px 20px", border: "none", cursor: "pointer", background: "none", borderRadius: 0,
                  fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 500, color: L.muted }}>
                <LogOut size={19} /> Cerrar sesión · {userName}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// NAV RAIL — navegación lateral de escritorio (el rail oscuro del diseño)
// ============================================================
// Navegación de escritorio y tablet. En celular navega la BottomNav.
//
// Solo lista secciones que existen de verdad. Del sidebar propuesto faltan
// Inicio, Oportunidades, Cotizaciones, Catálogo, Automatizaciones y
// Configuración: no tienen módulo todavía, y un ítem que no lleva a ningún
// lado es peor que no tenerlo. Se agregan cuando exista a dónde ir.
const NAV_ITEMS = [
  { key: "chat",       label: "Conversaciones",  icon: MessageSquare, roles: ["ceo", "vendedor"], badge: "noLeidos" },
  { key: "prioridad",  label: "Piden contacto",  icon: PhoneCall,     roles: ["ceo", "vendedor"], badge: "pide" },
  { key: "directorio", label: "Contactos",       icon: Users,         roles: ["ceo"] },
  { key: "pedidos",    label: "Pedidos",         icon: ShoppingBag,   roles: ["ceo", "vendedor"] },
  { key: "agenda",     label: "Calendario",      icon: Calendar,      roles: ["ceo", "vendedor"] },
  { key: "diario",     label: "Mi Día",          icon: BookOpen,      roles: ["vendedor"] },
  // Solo CEO: un envío masivo compromete al número de WhatsApp de la empresa
  // entero, no a una conversación. No es una decisión de un vendedor.
  { key: "promos",     label: "Promociones",     icon: Megaphone,     roles: ["ceo"] },
  { key: "reportes",   label: "Reportes",        icon: BarChart2,     roles: ["ceo"] },
  { key: "control",    label: "Control",         icon: Activity,      roles: ["ceo"] },
  { key: "admin",      label: "Equipo Comercial", icon: Shield,       roles: ["ceo"] },
];

function NavRail({ vista, setVista, rol, contactos = [], userName, userEmail, onLogout }) {
  const nPide     = contactos.reduce((n, c) => n + (pideContacto(c).pide ? 1 : 0), 0);
  const nNoLeidos = contactos.reduce((n, c) => n + ((c.no_leidos || 0) > 0 ? 1 : 0), 0);
  const items     = NAV_ITEMS.filter((i) => i.roles.includes(rol));
  const conteo    = (b) => (b === "pide" ? nPide : b === "noLeidos" ? nNoLeidos : 0);

  return (
    <nav aria-label="Navegación principal"
      style={{ width: "100%", height: "100%", background: COLOR.navBg, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Logo */}
      <div className="rail-brand" style={{ padding: "16px 18px 14px", flexShrink: 0 }}>
        <LogoBrillo imgStyle={{ width: "100%", maxWidth: 168, height: 40, objectFit: "contain", objectPosition: "center", filter: "brightness(0) invert(1)", opacity: 0.96, display: "block", margin: "0 auto" }} />
        <div className="rail-label" style={{ fontSize: 8.5, fontWeight: 700, color: COLOR.navText, letterSpacing: 1.6, textTransform: "uppercase", marginTop: 5, paddingLeft: 2 }}>
          Sistema de CRM
        </div>
      </div>

      {/* Secciones */}
      <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map(({ key, label, icon: Icon, badge }) => {
          const activo = vista === key;
          const n = badge ? conteo(badge) : 0;
          return (
            <button key={key} onClick={() => setVista(key)} aria-current={activo ? "page" : undefined}
              className="rail-item" title={label}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", border: "none", cursor: "pointer", width: "100%",
                background: activo ? COLOR.navActive : "transparent",
                color: activo ? COLOR.navTextActive : COLOR.navText,
                fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: activo ? 700 : 500, textAlign: "left", transition: "background .15s, color .15s" }}
              onMouseEnter={(e) => { if (!activo) { e.currentTarget.style.background = COLOR.navBgHover; e.currentTarget.style.color = "#fff"; } }}
              onMouseLeave={(e) => { if (!activo) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = COLOR.navText; } }}>
              <Icon size={17} style={{ flexShrink: 0 }} />
              <span className="rail-label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
              {n > 0 && (
                <span className="rail-badge" style={{ flexShrink: 0, background: activo ? "rgba(255,255,255,.25)" : COLOR.navActive, color: "#fff", fontSize: 10.5, fontWeight: 800,
                  borderRadius: 9, minWidth: 19, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", fontVariantNumeric: "tabular-nums" }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Usuario · rol · estado */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${COLOR.navBorder}`, padding: 10 }}>
        <div className="rail-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 10, background: COLOR.navBgHover }}
          title={`${userName} · ${rol === "ceo" ? "Propietario" : "Vendedor"}`}>
          <Avatar nombre={userName} size={34} border="none" />
          <div className="rail-label" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLOR.success, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: COLOR.navText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rol === "ceo" ? "Propietario" : "Vendedor"} · En línea
              </span>
            </div>
          </div>
          <button onClick={onLogout} title={`Cerrar sesión (${userEmail})`} className="rail-label"
            style={{ background: "none", border: "none", cursor: "pointer", color: COLOR.navText, display: "flex", padding: 5, flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLOR.navText; }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </nav>
  );
}
// ============================================================
// PANTALLA "PIDEN CONTACTO" — clientes que solicitan que los llamen
// o hablar con un vendedor (filtro inteligente en su propia vista).
// ============================================================
function PrioridadPanel({ contactos = [], isMobile, onAbrirChat, onQuitar }) {
  const ORDEN = { llamada: 0, urgente: 1, ventas: 2 };
  const lista = contactos
    .map((c) => ({ c, pc: pideContacto(c) }))
    .filter((x) => x.pc.pide)
    .sort((a, b) => new Date(b.c.updated_at || 0) - new Date(a.c.updated_at || 0))
    .sort((a, b) => (ORDEN[a.pc.motivo] ?? 3) - (ORDEN[b.pc.motivo] ?? 3));

  return (
    <div style={{ height: "100%", overflowY: "auto", background: L.bg, fontFamily: FONT_BODY }}>
      {/* Cabecera */}
      <div style={{ padding: isMobile ? "14px 16px" : "20px 26px", background: L.white, borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 13 }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: "#FEF2F2", color: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <PhoneCall size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: isMobile ? 18 : 22, color: L.text, letterSpacing: 0.2 }}>Piden contacto</div>
          <div style={{ fontSize: 12.5, color: L.muted, marginTop: 1 }}>
            {lista.length === 0 ? "Ningún cliente esperando por ahora" : `${lista.length} cliente${lista.length === 1 ? "" : "s"} quiere${lista.length === 1 ? "" : "n"} que los contacten`}
          </div>
        </div>
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "70px 24px", color: L.light }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", background: L.white, border: `1px solid ${L.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#CBD5E1" }}>
            <PhoneCall size={30} />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 16, color: L.muted }}>Todo al día ✓</div>
          <div style={{ fontSize: 13.5, color: L.light, marginTop: 5 }}>Acá van a aparecer los clientes que pidan que los llames o hablar con ventas.</div>
        </div>
      ) : (
        <div style={{ padding: isMobile ? "12px 12px 24px" : "16px 22px 26px", display: "flex", flexDirection: "column", gap: 10 }}>
          {lista.map(({ c, pc }) => {
            const b = PIDE_BADGE[pc.motivo] || PIDE_BADGE.ventas;
            return (
              <div key={c.id} onClick={() => onAbrirChat?.(c)}
                style={{ display: "flex", alignItems: "center", gap: 13, background: L.white, border: `1px solid ${L.border}`, borderLeft: `4px solid ${b.color}`, borderRadius: 13, padding: isMobile ? "12px 13px" : "13px 16px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.04)", transition: "box-shadow .15s, transform .1s" }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,.09)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,.04)"; }}>
                <Avatar nombre={c.nombre || c.telefono || c.email} foto={c.foto_url} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontWeight: 800, fontSize: 14.5, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "55%" : "60%" }}>{c.nombre || c.telefono || c.email}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      <PhoneCall size={9} /> {b.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: L.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{previewMsg(c.ultimo_msg)}</div>
                  {c.telefono && <div style={{ fontSize: 11.5, color: L.light, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {c.telefono}</div>}
                </div>
                {/* Quitar de la lista (marcar como atendido) — no borra el contacto */}
                <button
                  onClick={(e) => { e.stopPropagation(); onQuitar?.(c); }}
                  title="Ya lo atendí — quitar de la lista"
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: isMobile ? "7px 9px" : "7px 12px", borderRadius: 9, border: `1.5px solid ${L.border}`, background: L.white, color: L.muted, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: FONT_DISPLAY }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#DCFCE7"; e.currentTarget.style.borderColor = "#86EFAC"; e.currentTarget.style.color = "#15803D"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = L.white; e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}>
                  <Check size={15} /> {isMobile ? "" : "Atendido"}
                </button>
                <ChevronRight size={20} color={L.light} style={{ flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      )}
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

// Se abre con click y NO con hover: ahora vive en la misma tira que los chips
// de la lista, y abrirse solo al pasar el mouse empujaba todos los chips al
// costado sin que nadie lo hubiera pedido.
function CanalSelector({ canal, setCanal }) {
  const [open, setOpen] = useState(false);
  const sel = CANALES.find((c) => c.key === canal) || CANALES[0];
  const otros = CANALES.filter((c) => c.key !== sel.key);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {/* Píldora del canal activo */}
      {/* El canal es un selector, no una alarma: va en gris salvo el ícono, que
          alcanza para saber si estás mirando WhatsApp, email o todo. */}
      <button onClick={() => setOpen((o) => !o)}
        style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7, padding: "6px 9px", borderRadius: 9, border: "none", cursor: "pointer", background: open ? L.active : "transparent", transition: "background .15s" }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = L.hover; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ color: sel.color, display: "flex", lineHeight: 1 }}>{sel.icon}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: L.muted, fontFamily: FONT_BODY, whiteSpace: "nowrap" }}>{sel.label}</span>
        <ChevronRight size={14} color={L.light} style={{ transition: "transform .25s", transform: open ? "rotate(90deg)" : "none" }} />
      </button>

      {/* Canales que se deslizan desde el costado */}
      <div style={{ display: "flex", gap: 6, overflow: "hidden", maxWidth: open ? 320 : 0, opacity: open ? 1 : 0, transition: "max-width .32s cubic-bezier(.34,1.2,.4,1), opacity .22s ease" }}>
        {otros.map((c, i) => (
          <button key={c.key} onClick={() => { setCanal(c.key); setOpen(false); }} title={c.label}
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
function Sidebar({ contactos, activo, onSelect, onToggleDestacado, onPatchContacto, onToggleLlamada, onMarcarLlamada, onAsignarVendedor, onLogout, userEmail, userName, vista, setVista, alertas, onDescartarAlerta, onDescartarTodasAlertas, isMobile, rol, perfil }) {
  const [filtro, setFiltro]       = useState("todos");
  // Pestaña de tiempo. Arranca SIEMPRE en "Hoy", incluso si en la sesión
  // anterior se dejó en otra: al abrir el CRM lo primero que importa es lo que
  // entró hoy, no las 369 conversaciones históricas. Por eso no se guarda la
  // elección: cambiarla es para mirar algo puntual, no para dejarla fija.
  const [periodo, setPeriodo]     = useState("hoy");
  const [busqueda, setBusqueda]   = useState("");
  const [canal, setCanal]         = useState("todos");
  const [filtrosIA, setFiltrosIA] = useState(FILTROS_INICIAL);
  const [modalFiltros, setModalFiltros] = useState(false);
  const [menu, setMenu]           = useState(null);   // menú contextual: { x, y, c }
  const [agendar, setAgendar]     = useState(null);   // contacto a agendar llamada
  const [now, setNow]             = useState(Date.now());
  // Vendedores activos para el submenú "Asignar a vendedor" (solo CEO).
  // Vendedores a los que se le puede pasar un chat. No es solo del CEO: un
  // vendedor también puede derivarle un cliente a un compañero. A uno mismo no,
  // así que el usuario actual queda fuera de la lista.
  const [vendedoresAsign, setVendedoresAsign] = useState([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("vendedores")
        .select("id,nombre,role,activo").eq("activo", true).order("nombre");
      setVendedoresAsign((data || []).filter((v) => v.role === "vendedor" && v.nombre !== perfil?.nombre));
    })();
  }, [perfil?.nombre]);

  // ── Quién recibió una promo, y cuándo ─────────────────────
  // A quién le salió una campaña vive en `campana_envios` (ver
  // supabase_promociones.sql). Acá se trae sólo lo que se entregó bien y de los
  // últimos DIAS_PROMO_VIGENTE días: una promo vieja no explica el mensaje que
  // entró hoy, y traer la tabla entera crece sin techo con cada campaña.
  //
  // Se guarda el envío MÁS RECIENTE por contacto: si alguien recibió dos
  // campañas, lo que dice si está contestando es la última, no la vieja.
  const [promoEnviadoA, setPromoEnviadoA] = useState(() => new Map());
  const cargarPromos = useCallback(async () => {
    const desde = new Date(Date.now() - DIAS_PROMO_VIGENTE * 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.from("campana_envios")
      .select("contacto_id, enviado_at")
      .eq("estado", "ok").gte("enviado_at", desde);
    const m = new Map();
    for (const e of data || []) {
      if (!e.contacto_id || !e.enviado_at) continue;
      const prev = m.get(e.contacto_id);
      if (!prev || new Date(e.enviado_at) > new Date(prev)) m.set(e.contacto_id, e.enviado_at);
    }
    setPromoEnviadoA(m);
  }, []);
  useEffect(() => { cargarPromos(); }, [cargarPromos]);

  // Contestó la promo: le llegó la campaña y escribió DESPUÉS de recibirla.
  //
  // La comparación es contra `ultimo_in_at` —el último mensaje del cliente— y no
  // contra un flag: así el chat sale solo del filtro cuando la conversación
  // siguió por otro lado, y no hay nada que marcar ni limpiar a mano.
  const respondioPromo = (c) => {
    const enviado = promoEnviadoA.get(c.id);
    if (!enviado || !c.ultimo_in_at) return false;
    return new Date(c.ultimo_in_at) > new Date(enviado);
  };
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

  // Clientes que en algún momento consultaron por financiamiento (ficha cargada
  // o el tema apareció en el chat). Se carga una vez; mientras tanto el chip
  // muestra 0 y no filtra nada de más.
  const [finIds, setFinIds] = useState(null);
  useEffect(() => {
    let vivo = true;
    cargarConsultaronFin()
      .then((s) => vivo && setFinIds(s))
      .catch(() => vivo && setFinIds(new Set()));
    return () => { vivo = false; };
  }, []);
  const esFin = useCallback((c) => !!finIds && finIds.has(c.id), [finIds]);

  // Los contadores de los chips tienen que contar EXACTAMENTE lo mismo que la
  // lista muestra, así que comparten este predicado. Si el número y el contenido
  // se calcularan por separado, terminarían diciendo cosas distintas.
  const cumpleFiltro = (c, f) => {
    if (f === "todos") return true;
    if (f === "favoritos")        return !!c.destacado;
    if (f === "q:pidecontacto")   return pideContacto(c).pide;
    if (f === "q:financiamiento") return esFin(c);
    if (f === "q:sinrevisar")     return calcSinRevisar(c) != null;
    if (f === "q:noleidos")       return c.no_leidos > 0;
    if (f === "q:sinresponder")   return calcEspera(c) != null;
    if (f === "q:seguimientos")   return !!c.seguimiento_at;
    if (f === "t:cliente")        return c.tipo === "cliente";
    if (f === "t:prospecto")      return !c.tipo || c.tipo === "prospecto";
    return c.estado === f;
  };

  const cumplePeriodo = (c, p) => {
    const def = PERIODOS.find((x) => x.key === p) || PERIODOS[0];
    return def.test(diasAtras(c.updated_at));
  };

  // Base común: lo que no depende ni del chip ni de la pestaña de tiempo
  // (canal, búsqueda y filtros IA). Los contadores se calculan sobre esto, así
  // reaccionan al canal y a la búsqueda como espera el vendedor.
  const base = contactos.filter((c) => {
    const porBusq  = !busqueda || (c.nombre || "").toLowerCase().includes(busqueda.toLowerCase()) || (c.telefono || "").includes(busqueda) || (c.email || "").toLowerCase().includes(busqueda.toLowerCase());
    const porCanal = canal === "todos" || (canal === "whatsapp" ? (c.canal || "whatsapp") === "whatsapp" : c.canal === canal);
    return porBusq && porCanal && aplicaFiltrosIA(c, filtrosIA, esFin);
  });

  // Cada contador cuenta sobre el OTRO eje ya aplicado: el número del chip
  // "Sin responder" respeta la pestaña de tiempo elegida, y el número de "Hoy"
  // respeta el chip elegido. Si no, los chips prometen chats que la lista no
  // muestra porque la pestaña los dejó afuera.
  const baseTabs    = base.filter((c) => cumplePeriodo(c, periodo));
  const basePeriodo = base.filter((c) => cumpleFiltro(c, filtro));

  const conteoTab    = (t) => baseTabs.filter((c) => cumpleFiltro(c, t)).length;
  const conteoPeriodo = (p) => basePeriodo.filter((c) => cumplePeriodo(c, p)).length;

  const lista = baseTabs.filter((c) => cumpleFiltro(c, filtro))
  // Orden estilo WhatsApp: lo más reciente arriba. Un mensaje nuevo o una
  // respuesta del vendedor toca `updated_at`, así que el chat sube solo.
  // La estrella y "pide contacto" ya no reordenan la lista (para eso están
  // los tabs/filtros); antes empujaban los chats activos hacia abajo.
  .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));

  // La lista se muestra cortada en tramos desplegables (Hoy / Ayer / Esta
  // semana / …): el orden no cambia, pero lo viejo arranca plegado y deja de
  // tapar lo de esta semana.
  const secciones = agruparPorTiempo(lista);

  // Qué tramos abrió o cerró el vendedor A MANO. Lo que no tocó no se guarda
  // acá: queda con el default de abajo, así un tramo nuevo ("Hoy" cuando entra
  // el primer mensaje del día) aparece abierto sin que nadie haga nada.
  const [tramosTocados, setTramosTocados] = useState({});
  const toggleSeccion = (titulo) =>
    setTramosTocados((t) => ({ ...t, [titulo]: !seccionAbierta(titulo) }));

  // Buscar es lo contrario de esconder: si hay búsqueda o un chip/período
  // activo, el vendedor está buscando algo puntual y se abre todo.
  const filtrando = !!busqueda || filtro !== "todos" || periodo !== "todos";
  const seccionAbierta = (titulo) => {
    if (titulo in tramosTocados) return tramosTocados[titulo];
    if (filtrando) return true;
    // Por defecto: lo reciente abierto, lo viejo plegado (es justo lo que
    // molestaba). Si NO hay nada reciente, se abre el primer tramo que haya
    // para no dejar la lista pareciendo vacía.
    const recientes = ["Hoy", "Ayer", "Esta semana"];
    if (recientes.includes(titulo)) return true;
    const hayReciente = secciones.some((s) => recientes.includes(s.titulo));
    return !hayReciente && secciones[0]?.titulo === titulo;
  };

  return (
    <div style={{ width: "100%", height: "100%", background: L.white, borderRight: `1px solid ${L.border}`, display: "flex", flexDirection: "column" }}>

      {/* ── Cabecera ── */}
      {/* Móvil: logo (no hay rail). Escritorio: título de la sección — el logo
          ya está en el NavRail y repetirlo era ruido. */}
      {isMobile ? (
        <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gradAI, borderBottom: `3px solid ${C.redDark}`, boxShadow: SHADOW.md, flexShrink: 0 }}>
          <LogoBrillo imgStyle={{ width: 210, height: 52, objectFit: "cover", objectPosition: "center 38%", filter: "brightness(0) invert(1)", opacity: 0.95 }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AlertasBtn alertas={alertas} onSelect={(c) => { setVista("chat"); onSelect(c); }}
              onDescartar={onDescartarAlerta} onDescartarTodas={onDescartarTodasAlertas} />
          </div>
        </div>
      ) : (
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: L.white, borderBottom: `1px solid ${L.border}`, flexShrink: 0 }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: L.text }}>
            {NAV_ITEMS.find((i) => i.key === vista)?.label || "Conversaciones"}
          </span>
          <AlertasBtn alertas={alertas} onSelect={(c) => { setVista("chat"); onSelect(c); }}
            onDescartar={onDescartarAlerta} onDescartarTodas={onDescartarTodasAlertas} />
        </div>
      )}


      {/* La navegación de móvil ahora es la BottomNav (ver App); en escritorio,
          el NavRail. El Sidebar ya no lleva tabs propios. */}

      {vista === "chat" && (
        <>
          {/* ── Fila 1: búsqueda + filtros avanzados ── */}
          {/* flexShrink:0 en las tres filas de arriba: con la lista pidiendo
              flex:1, en pantallas bajas el buscador se aplastaba y quedaba
              cortado. Lo que se achica es la lista, que para eso scrollea. */}
          <div style={{ padding: "12px 14px 9px", display: "flex", gap: 8, flexShrink: 0 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={15} color={L.light} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, teléfono o email…"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 30px 9px 34px", borderRadius: 10, border: `1.5px solid ${L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none" }} />
              {busqueda && (
                <button onClick={() => setBusqueda("")} title="Limpiar"
                  style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: L.light, display: "flex", padding: 3 }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={() => setModalFiltros(true)} title="Más filtros (ubicación, presupuesto, etapa…)"
              style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 800, letterSpacing: 0.2,
                border: contarActivos(filtrosIA) > 0 ? `1.5px solid ${C.ai}` : `1.5px solid ${L.border}`,
                background: contarActivos(filtrosIA) > 0 ? C.aiSoft : L.white,
                color: contarActivos(filtrosIA) > 0 ? C.ai : L.muted, transition: "all .15s" }}>
              <SlidersHorizontal size={15} />
              {contarActivos(filtrosIA) > 0 && (
                <span style={{ background: C.ai, color: "#fff", fontSize: 10.5, fontWeight: 800, borderRadius: 9, minWidth: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{contarActivos(filtrosIA)}</span>
              )}
            </button>
          </div>

          {/* ── Fila 2: canal + chips de la lista ── */}
          {/* Una sola tira: el canal a la izquierda y, al lado, QUÉ lista estoy
              viendo. Antes esto eran tres controles en tres filas distintas
              (tabs + botón teléfono + botón estrella) que además se combinaban
              entre sí; ahora se elige un chip y listo. */}
          <div className="strip" style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px 10px", borderBottom: `1px solid ${L.border}`, overflowX: "auto", flexShrink: 0 }}>
            <CanalSelector canal={canal} setCanal={setCanal} />
            <div style={{ flexShrink: 0, width: 1, height: 22, background: L.border, margin: "0 3px" }} />
            {SIDEBAR_TABS.map(({ key, label, icon: Icono, color }) => {
              const activa = filtro === key;
              const n = conteoTab(key);
              const col = color || L.muted;
              return (
                <button key={key} onClick={() => setFiltro(key)} aria-pressed={activa}
                  title={key === "q:financiamiento" ? "Consultaron por financiamiento (en el chat o con ficha cargada)" : label}
                  /* Sin borde propio ni relleno de color: el chip apagado es
                     solo texto y el elegido, un fondo suave. Siete píldoras de
                     colores compitiendo entre sí no ayudan a elegir ninguna. */
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 9, cursor: "pointer",
                    fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: activa ? 700 : 500,
                    border: "none",
                    background: activa ? L.active : "transparent",
                    color: activa ? col : L.muted,
                    whiteSpace: "nowrap", transition: "background .15s, color .15s" }}
                  onMouseEnter={(e) => { if (!activa) e.currentTarget.style.background = L.hover; }}
                  onMouseLeave={(e) => { if (!activa) e.currentTarget.style.background = "transparent"; }}>
                  {Icono && <Icono size={13} />}
                  {label}
                  {n > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: activa ? col : L.light, opacity: activa ? 1 : 0.8, fontVariantNumeric: "tabular-nums" }}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Fila 3: pestañas de tiempo ── */}
          {/* Estilo subrayado (no píldora) a propósito: se tiene que ver que es
              otro eje distinto de los chips de arriba y que se combinan. */}
          {/* Control segmentado: la opción elegida es una pastilla blanca que
              flota sobre el riel gris. Se lee de un vistazo cuál está activa
              sin depender de un subrayado fino, y las cinco se reparten el
              ancho en partes iguales, así ninguna queda fuera del panel (que en
              tablet son 304px). */}
          <style>{`
            .tab-tiempo:focus { outline: none; }
            .tab-tiempo:focus-visible { outline: 2px solid ${C.ai}; outline-offset: 1px; }
            .tab-tiempo:not(.on):hover { background: rgba(255,255,255,.6); }
          `}</style>
          <div style={{ padding: "0 12px 10px", flexShrink: 0, borderBottom: `1px solid ${L.border}` }}>
            <div role="tablist" aria-label="Período"
              style={{ display: "flex", gap: 2, padding: 3, borderRadius: 13, background: L.soft, border: `1px solid ${L.border}` }}>
              {PERIODOS.map(({ key, label, titulo }) => {
                const activa = periodo === key;
                const n = conteoPeriodo(key);
                return (
                  <button key={key} className={`tab-tiempo${activa ? " on" : ""}`} onClick={() => setPeriodo(key)}
                    role="tab" aria-selected={activa} title={titulo}
                    style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                      padding: "6px 2px 5px", cursor: "pointer", borderRadius: 10, border: "none",
                      background: activa ? L.white : "transparent",
                      boxShadow: activa ? "0 1px 3px rgba(15,23,42,.14), 0 0 0 1px rgba(15,23,42,.05)" : "none",
                      fontFamily: FONT_DISPLAY, letterSpacing: 0.1, whiteSpace: "nowrap", overflow: "hidden",
                      transition: "background .18s, box-shadow .18s, color .18s" }}>
                    <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11.5, fontWeight: activa ? 800 : 600,
                      color: activa ? C.red : L.muted }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1,
                      color: activa ? C.red : L.light, opacity: n > 0 ? 1 : 0.45 }}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {modalFiltros && (
            <FiltrosModal filtros={filtrosIA} setFiltros={setFiltrosIA} onClose={() => setModalFiltros(false)} />
          )}


          {/* ── Lista contactos ── */}
          <style>{`@keyframes ninitPhonePulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(220,38,38,.5)}50%{transform:scale(1.12);box-shadow:0 0 0 5px rgba(220,38,38,0)}}@keyframes ninitSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
          {/* minHeight:0 — sin esto, en una columna flex la lista crece con su
              contenido en vez de scrollear y empuja el pie fuera de pantalla. */}
          <div className="scroll-y" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {lista.length === 0 && (
              <div style={{ padding: 36, color: L.light, fontSize: 13.5, textAlign: "center" }}>
                {busqueda ? "Sin resultados para la búsqueda"
                  : filtro === "q:financiamiento"
                    ? (finIds === null ? "Buscando quién consultó por financiamiento…"
                                       : "Nadie consultó por financiamiento todavía")
                    : filtro !== "todos" ? `Sin conversaciones en “${SIDEBAR_TABS.find((t) => t.key === filtro)?.label}”${periodo !== "todos" ? ` dentro de “${PERIODOS.find((p) => p.key === periodo)?.label}”` : ""}`
                    : periodo !== "todos" ? `Sin conversaciones en “${PERIODOS.find((p) => p.key === periodo)?.label}”`
                    : "Sin conversaciones"}

                {/* Como ahora se entra parado en "Hoy", un día tranquilo se ve
                    igual que un CRM vacío. El atajo aclara que hay más atrás y
                    evita salir a buscar la pestaña. */}
                {!busqueda && periodo !== "todos" && base.length > 0 && (
                  <div style={{ display: "flex", gap: 7, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
                    {periodo !== "semana" && (
                      <button onClick={() => setPeriodo("semana")}
                        style={{ padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: `1.5px solid ${L.border}`,
                          background: L.white, color: L.text, fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700 }}>
                        Ver los últimos 7 días
                      </button>
                    )}
                    <button onClick={() => setPeriodo("todos")}
                      style={{ padding: "7px 13px", borderRadius: 999, cursor: "pointer", border: `1.5px solid ${C.red}`,
                        background: C.red, color: "#fff", fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700 }}>
                      Ver todas ({base.length})
                    </button>
                  </div>
                )}
              </div>
            )}
            {secciones.map((sec) => {
            // Con un solo tramo no hay nada que separar y el encabezado repetiría
            // lo que ya dice la pestaña de arriba ("Hoy 3" / "HOY 3").
            const conTramos = secciones.length > 1;
            const abierta = !conTramos || seccionAbierta(sec.titulo);
            return (
            <div key={sec.titulo}>
              {/* Encabezado desplegable y pegajoso: se hace click para abrir o
                  cerrar el tramo, y mientras scrolleás siempre se ve en cuál
                  estás parado. Lo viejo arranca cerrado. */}
              {conTramos && (
              <button onClick={() => toggleSeccion(sec.titulo)} aria-expanded={abierta}
                title={abierta ? `Ocultar ${sec.titulo}` : `Ver ${sec.items.length} de ${sec.titulo}`}
                style={{ position: "sticky", top: 0, zIndex: 2, width: "100%", boxSizing: "border-box",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer",
                  padding: "8px 14px", background: L.soft, border: "none", borderBottom: `1px solid ${L.border}`,
                  fontFamily: FONT_DISPLAY, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
                  color: abierta ? L.muted : L.text, textAlign: "left", backdropFilter: "blur(6px)", transition: "color .15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = L.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = L.soft; }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <ChevronRight size={13} style={{ flexShrink: 0, transform: abierta ? "rotate(90deg)" : "none", transition: "transform .18s" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.titulo}</span>
                </span>
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 17, padding: "0 6px",
                  borderRadius: 7, fontVariantNumeric: "tabular-nums", fontSize: 10.5,
                  background: abierta ? "transparent" : C.red, color: abierta ? L.light : "#fff" }}>
                  {sec.items.length}
                </span>
              </button>
              )}
              {abierta && sec.items.map((c) => {
              const est  = ESTADOS[c.estado] || ESTADOS.nuevo;
              const sel  = activo?.id === c.id;
              const llamar = c.requiere_llamada;
              const respPromo = respondioPromo(c);
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
                  /* La fila elegida se marca con fondo y una barra fina, y nada
                     más: antes se corría 10px, ganaba sombra, borde de 4px y
                     esquinas redondeadas: cuatro señales para decir lo mismo. */
                  style={{ padding: "12px 14px", borderBottom: `1px solid ${L.border}`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", background: sel ? L.active : (llamar ? "#FEF6F6" : "transparent"), borderLeft: `2px solid ${sel || llamar ? C.red : "transparent"}`, transition: "background .12s", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
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
                        {/* La lista no se reordena ni esconde nada por la promo:
                            este megáfono es la única marca, y distingue "me
                            escribió porque le llegó la campaña" de una consulta
                            espontánea — eso cambia con qué precio se le contesta
                            (ver src/nini_promo_prompt.md). El trabajo fino se
                            hace en Promociones → Respuestas. */}
                        {respPromo && (
                          <span title="Contestó a una promoción" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#EDE9FE", color: "#7C3AED" }}>
                            <Megaphone size={10} />
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
                        {calcTiempoRespuesta(c) != null && <CronometroRespuesta desde={c.ultimo_in_at} />}
                        {c.no_leidos > 0 && (
                          <span style={{ background: "#22C55E", color: "#fff", fontSize: 10, borderRadius: 10, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontWeight: 800 }}>{c.no_leidos}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, color: L.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 5 }}>
                      {previewMsg(c.ultimo_msg)}
                    </div>
                    {/* Una sola línea de contexto, en gris y sin cajas. El color
                        queda reservado para lo urgente ("quiere hablar"), que
                        es lo único que cambia lo que el vendedor hace ahora.
                        Antes cada fila tenía tres cajas de colores y ninguna
                        resaltaba, porque resaltaban todas. */}
                    {(() => {
                      const at = quienAtiende(c);
                      const mio = at && mismoVendedor(at.nombre, userName);
                      // "Lead Nuevo" lo tienen casi todos: decirlo en cada fila
                      // no distingue nada. El estado se muestra recién cuando
                      // el cliente avanzó en el embudo.
                      const mostrarEstado = c.estado && c.estado !== "nuevo";
                      const vencido = c.seguimiento_at && new Date(c.seguimiento_at) <= new Date();
                      const partes = [
                        mostrarEstado && est.label,
                        c.tipo === "cliente" && "Cliente",
                        at && primerNombre(at.nombre),
                      ].filter(Boolean);
                      if (!pc.pide && !partes.length && !vencido) return null;
                      return (
                        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: L.light, minWidth: 0 }}>
                          {pc.pide && (() => { const b = PIDE_BADGE[pc.motivo] || PIDE_BADGE.ventas; return (
                            <span title="Pidió hablar con un vendedor"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, color: b.color, fontWeight: 700 }}>
                              <PhoneCall size={11} /> {b.label}
                            </span>
                          ); })()}
                          {partes.length > 0 && (
                            <span title={at ? `${at.asignado ? "Asignado a" : "Está hablando"}: ${at.nombre}${mio ? " (vos)" : " — evitá meterte en este chat"}` : undefined}
                              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: at && !mio ? "#B45309" : L.light }}>
                              {partes.join(" · ")}
                            </span>
                          )}
                          {vencido && <span title="Seguimiento vencido" style={{ display: "flex" }}><Clock size={11} color={C.red} /></span>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
              })}
            </div>
            );
            })}
          </div>
        </>
      )}
      {vista === "reportes" && <div style={{ flex: 1 }} />}

      {/* ── Pie usuario ── (solo móvil: en escritorio vive en el NavRail) */}
      {isMobile && (
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
      )}

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
              <Phone size={iconSz} color={C.red} /> {c.requiere_llamada ? "Quitar aviso de llamada" : "Marcar: hay que llamar"}
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

            {/* Pasar el chat a otro vendedor: le queda asignado y le llega un aviso. */}
            <div style={{ borderTop: `1px solid ${L.border}`, margin: "5px 0 0", paddingTop: 7 }}>
              <div style={{ fontSize: isMobile ? 11 : 10, fontWeight: 800, color: L.light, textTransform: "uppercase", letterSpacing: 0.4, padding: "0 10px 6px" }}>
                {rol === "ceo" ? "Asignar a vendedor" : "Pasarle el chat a"}
              </div>
                {vendedoresAsign.length === 0 ? (
                <div style={{ fontSize: isMobile ? 12.5 : 11.5, color: L.light, padding: "0 10px 8px" }}>No hay otros vendedores activos</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 8px 6px" }}>
                  {vendedoresAsign.map((v) => {
                    const yaEs = c.vendedor === v.nombre;
                    return (
                      <button key={v.id} onClick={() => { if (!yaEs) onAsignarVendedor?.(c, v); setMenu(null); }}
                        title={yaEs ? "Ya está asignado a este vendedor" : `${rol === "ceo" ? "Asignar" : "Pasarle el chat"} a ${v.nombre}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: isMobile ? 12 : 10.5, fontWeight: 700, padding: isMobile ? "7px 11px" : "4px 9px", borderRadius: 7, cursor: yaEs ? "default" : "pointer",
                          border: `1px solid ${yaEs ? C.red : L.border}`, background: yaEs ? C.aiSoft : L.white, color: yaEs ? C.red : L.text }}>
                        {yaEs ? <Check size={iconSz - 3} color={C.red} /> : <User size={iconSz - 3} color={L.muted} />} {v.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
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
      let lista = data || [];
      // Asegurar que el usuario actual esté en la lista aunque no figure como
      // "activo" (p. ej. el CEO): así puede agendarse la llamada a sí mismo.
      if (perfil?.id && !lista.some((v) => v.id === perfil.id)) {
        lista = [{ id: perfil.id, nombre: perfil.nombre, role: perfil.role, activo: true }, ...lista];
      }
      setVendedores(lista);
      // Responsable por defecto: SIEMPRE el usuario actual (es donde va a mirar
      // su propia agenda). Antes caía en lista[0] —el primer vendedor alfabético—
      // y la llamada se guardaba en la agenda de otra persona.
      if (perfil?.id) setResp({ id: perfil.id, nombre: perfil.nombre });
      else if (lista[0]) setResp({ id: lista[0].id, nombre: lista[0].nombre });
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
// PLANTILLAS DE RESPUESTA RÁPIDA
// ============================================================
// {VENDEDOR} se reemplaza por el nombre de pila de quien está logueado.
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
        texto: `Hi! Thanks for reaching out to NINIT Group 🚐✨ I'm here to help! I saw you were interested in our luxury restroom trailers. Could you tell me a bit more about your needs?\n\n• What's the event date and location?\n• How many guests are you expecting?\n• Which model are you interested in?\n\nWe'll put together a custom quote for you right away!`,
      },
      {
        label: "Saludo + catálogo",
        texto: `Hi! Thanks for your interest in NINIT Group 🙌\n\nHere's our full catalog with all models and specs:\n👉 https://ninitgroup.com/wp-content/uploads/2026/04/NINITGROUP_CATALOG.pdf\n\nWe have 4 models available:\n• 2-Stall White Marble — boutique events\n• 3-Stall — our most popular unit ⭐\n• 4-Stall — large festivals & high traffic\n• ADA+2 — fully accessible option\n\nWhich one fits your event best?`,
      },
      {
        label: "Ready to Go + fabricación (ES)",
        texto: `Buenos días, mi nombre es Agustina, un gusto saludarte. Te cuento que actualmente disponemos de 2 unidades de 4 puertas (stalls) listas para entrega inmediata (Ready to Go) a USD 36.500 para que te las lleves hoy mismo.\n\nTambién tenemos la opción de fabricación personalizada por USD 31.500 (con tiempo de producción a coordinar).\n\nTe envié un mensaje al privado para pasarte fotos de los modelos, fichas técnicas y ver cuál opción te conviene más. ¡Quedo a tu disposición!`,
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
    ],
  },
  {
    grupo: "📋 Calificar lead",
    items: [
      {
        label: "Pedir datos del evento",
        texto: `To prepare your custom quote, I just need a few details:\n\n1. Event date?\n2. Event location (city)?\n3. Estimated number of guests?\n4. Any specific model in mind?\n\nWe'll get back to you with a tailored proposal right away! 🚐`,
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
// COTIZACIONES (links por modelo)
// ============================================================
const COTIZACIONES = [
  {
    label: "Cotización completa (todos los modelos)",
    texto: `Thank you for your interest in NINIT Group! 🚐\n\nHere's our full interactive quote, where you can browse every restroom trailer model and choose the one that best fits your event:\n\nhttps://ninitgroup.com/ninit_quote/\n\nInside you'll find:\n✅ All models (2-Stall, 3-Stall, 4-Stall and ADA+2) with photos\n✅ Full specifications of each unit\n✅ Pre-sale and ready-to-ship pricing\n✅ Shipping and delivery details\n\nTake a look, pick your favorite model, and let me know — I'll confirm availability and walk you through the next steps. Happy to answer any questions! 😊\n\n💳 *Financing available* — you don't need to pay it all upfront. Check your options with Ascentium Capital here:\n${LINK_FIN}`,
  },
];

// Mensaje con el link de financiamiento (Ascentium Capital).
// En inglés como el resto de lo que se le manda al cliente.
const TEXTO_FINANCIAMIENTO = `Great news — you don't have to pay for your trailer all at once! 💳\n\nWe work with Ascentium Capital, so you can finance your restroom trailer and start using it right away.\n\nApply here (takes just a few minutes):\n${LINK_FIN}\n\n✅ Quick online application\n✅ Flexible terms\n✅ No obligation to check your options\n\nOnce you apply, let me know and I'll follow up to make sure everything goes smoothly. Any questions, I'm here! 😊`;

// ============================================================
// ASISTENTE "AVANZAR" — etiquetas de visualización
// ============================================================

// Lectura del score de cierre (probabilidad_cierre, 0-100 que devuelve la IA).
function avScoreLectura(p) {
  if (p >= 80) return { label: "Muy alto", color: "#16A34A" };
  if (p >= 60) return { label: "Alto",     color: "#22C55E" };
  if (p >= 40) return { label: "Medio",    color: "#D97706" };
  if (p >= 20) return { label: "Bajo",     color: "#EA580C" };
  return { label: "Muy bajo", color: "#DC2626" };
}

// `senales_compra` viene de la IA como una lista plana de strings que mezcla
// señales de compra y de riesgo, sin marcar cuál es cuál. Como el contrato de
// /api/avanzar no se toca, la única forma de distinguirlas acá es leer la
// redacción. Es una heurística: ante la duda cuenta como señal de compra.
const RE_SENAL_RIESGO = /(a[uú]n\s+no|todav[ií]a\s+no|no\s+(ha|han|hay|solicit|pidi|respond|confirm|defini|mostr|dio|dej)|sin\s+(respuesta|definir|confirmar|fecha|presupuesto)|falta[n]?\s|no\s+quiso|dud|demor|silencio|compar(a|ando)\s+(con\s+)?(otros|proveedores|competencia)|se\s+enfri|riesgo|objeci[oó]n)/i;
function esSenalDeRiesgo(txt) {
  return RE_SENAL_RIESGO.test(String(txt || ""));
}

// Donut del score de cierre. SVG puro: sin dependencias y escala sin pixelarse.
function ScoreDonut({ valor, size = 82 }) {
  const r = (size - 9) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, valor));
  const { color } = avScoreLectura(pct);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, transform: "rotate(-90deg)" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={L.border} strokeWidth={7} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ - (circ * pct) / 100}
        style={{ transition: "stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)" }} />
    </svg>
  );
}

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
const FOTO_PALETA = `Here's our color palette 🎨 (same premium finish on every model) 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1.jpeg`;

// Cada modelo tiene varios assets: Exterior / Interior / Plano / Video / Paleta
// (solo se listan los assets disponibles para cada modelo)
const FOTOS_MODELOS = [
  {
    label: "2-Stall White Marble",
    assets: [
      { tipo: "Exterior", texto: `Here's our 2-Stall White Marble unit 👇\n${FOTO_PREFIX}2026/07/2.jpeg` },
      { tipo: "Interior", texto: `Here's the interior 👇\n${FOTO_PREFIX}2026/07/interior2b.jpeg\n${FOTO_PREFIX}2026/07/interior2c.jpeg\n${FOTO_PREFIX}2026/07/2d.jpeg` },
      { tipo: "Extra", texto: `Here's another view 👇\n${FOTO_PREFIX}2026/07/2s.jpeg` },
      { tipo: "Plano", texto: `Here's the floor plan of the 2-Stall 👇\n${FOTO_PREFIX}2026/07/plano2.jpeg` },
      { tipo: "Video", texto: `Here's a video walkthrough of the 2-Stall 👇\n${FOTO_PREFIX}2026/07/video2puertas.mp4` },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "3-Stall (most popular ⭐)",
    assets: [
      { tipo: "Exterior", texto: `Here's our 3-Stall unit — our most popular one ⭐ 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-18-at-5.18.09-PM-2-1.jpeg` },
      { tipo: "Video", texto: `Here's a video walkthrough of the 3-Stall ⭐ 👇\n${FOTO_PREFIX}2026/07/video03.mp4` },
      { tipo: "Interior", texto: `Here's the interior 👇\n${FOTO_PREFIX}2026/07/interior01.jpeg\n${FOTO_PREFIX}2026/07/interior02.jpeg\n${FOTO_PREFIX}2026/07/interior03.jpeg\n${FOTO_PREFIX}2026/07/interior04.jpeg` },
      { tipo: "Video interior 1", texto: `Here's a look inside on video 👇\n${FOTO_PREFIX}2026/07/videointerior1.mp4` },
      { tipo: "Video interior 2", texto: `Here's another look inside on video 👇\n${FOTO_PREFIX}2026/07/videointerior2.mp4` },
      { tipo: "Video interior 3", texto: `And one more from inside 👇\n${FOTO_PREFIX}2026/07/videointerior3.mp4` },
      { tipo: "Extra", texto: `Here's another view 👇\n${FOTO_PREFIX}2026/07/extras.jpeg` },
      { tipo: "Plano", texto: `Here's the floor plan of the 3-Stall 👇\n${FOTO_PREFIX}2026/05/PHOTO-2026-01-08-01-13-01-1.jpg` },
      { tipo: "Paleta de colores", texto: FOTO_PALETA },
    ],
  },
  {
    label: "4-Stall",
    assets: [
      { tipo: "Exterior", texto: `Here's our 4-Stall unit 👇\n${FOTO_PREFIX}2026/07/exterior.jpeg\n${FOTO_PREFIX}2026/07/exteriror2.jpeg` },
      { tipo: "Interior", texto: `Here's the interior 👇\n${FOTO_PREFIX}2026/07/interior01-1.jpeg\n${FOTO_PREFIX}2026/07/interior2.jpeg\n${FOTO_PREFIX}2026/07/interior3.jpeg\n${FOTO_PREFIX}2026/07/interior4.jpeg\n${FOTO_PREFIX}2026/07/interior5.jpeg\n${FOTO_PREFIX}2026/07/interior6.jpeg` },
      { tipo: "Extra", texto: `Here's another view 👇\n${FOTO_PREFIX}2026/07/extras.jpeg` },
      { tipo: "Plano", texto: `Here's the floor plan of the 4-Stall 👇\n${FOTO_PREFIX}2026/06/WhatsApp-Image-2026-06-11-at-4.39.53-PM.jpeg` },
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

// Mensajes sin nada que mostrar. Aparecen como burbujas vacías en el chat:
// con el bot pausado, el flujo de n8n igual deja la fila en `mensajes` con el
// contenido vacío. No hay columna de media aparte —texto e imágenes van los dos
// en `contenido`—, así que sin contenido no hay nada para renderizar.
const sinContenido = (m) => !String(m?.contenido ?? "").trim();

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
// ============================================================
// PANEL DERECHO — ficha del cliente (4ª columna de escritorio)
// ============================================================
// Solo muestra datos que existen en la tabla `contactos`. Del diseño quedan
// afuera "Modelo interesado", "Cantidad estimada", "Presupuesto estimado" y
// "Fecha probable de compra": no hay columnas para eso y agregarlas es una
// migración. Las pestañas Actividad y Archivos tampoco están: no hay de dónde
// sacar esos datos todavía.

// El embudo real del CRM, en orden. `pendiente` y `perdido` quedan fuera del
// stepper porque no son etapas de avance (se ven igual en la cabecera del chat).
const EMBUDO = ["nuevo", "contactado", "interesado", "cotizacion", "negociando", "vendido"];

// ============================================================
// FINANCIAMIENTO (Ascentium Capital)
// ============================================================
// Ficha de financiamiento del cliente. Vive en la tabla `financiamiento`
// (una fila por contacto) — ver supabase_financiamiento.sql.
//
// Al marcar "link enviado" se crean solos los dos recordatorios que pidió el
// CEO: primer seguimiento a las 24 h y segundo a los 3 días. Se guardan como
// eventos de agenda_vendedor, así aparecen en la Agenda que el vendedor ya usa.

const FIN_HORA_SEG = "10:00:00"; // los recordatorios caen a las 10 de la mañana

// Fecha (AAAA-MM-DD) sumando días a partir de hoy.
const finFechaEn = (dias) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Crea los dos recordatorios de seguimiento en la Agenda del vendedor.
// Best-effort: si falla, el estado del financiamiento igual queda guardado.
async function crearRecordatoriosFin(contacto, perfil) {
  const vendedorId = perfil?.id;
  if (!vendedorId) return;
  const cliente = contacto.nombre || contacto.telefono || contacto.email || "Cliente";
  const eventos = [
    { dias: 1, titulo: `Seguimiento financiamiento — ${cliente}`,
      nota: "Primer seguimiento (24 h del envío del link): preguntar si pudo abrirlo y si tiene dudas." },
    { dias: 3, titulo: `2º seguimiento financiamiento — ${cliente}`,
      nota: "Segundo seguimiento (3 días del envío del link): consultar si avanzó con la solicitud." },
  ];
  await supabase.from("agenda_vendedor").insert(
    eventos.map((e) => ({
      vendedor_id: vendedorId,
      vendedor_nombre: perfil?.nombre || null,
      fecha: finFechaEn(e.dias),
      hora: FIN_HORA_SEG,
      tipo: "seguimiento",
      titulo: e.titulo,
      cliente_nombre: cliente,
      nota: e.nota,
    }))
  );
}

function SeccionFinanciamiento({ contacto, perfil, seccion, cabecera, abierta }) {
  const [fin, setFin]         = useState(null);
  const [cargando, setCarg]   = useState(true);
  const [guardando, setGuard] = useState(false);
  const [aviso, setAviso]     = useState(null);

  // Cargar (o preparar) la ficha del cliente activo.
  useEffect(() => {
    let vivo = true;
    setCarg(true); setAviso(null);
    supabase.from("financiamiento").select("*").eq("contacto_id", contacto.id).limit(1)
      .then(({ data }) => { if (vivo) { setFin(data?.[0] || null); setCarg(false); } },
            () => { if (vivo) setCarg(false); });
    return () => { vivo = false; };
  }, [contacto.id]);

  // Guarda cambios parciales. La fila se crea recién cuando se toca algo.
  const guardar = async (campos) => {
    setGuard(true);
    const payload = {
      contacto_id: contacto.id,
      socio: SOCIO_FIN,
      vendedor_id: perfil?.id || null,
      ...fin, ...campos,
    };
    delete payload.created_at; delete payload.updated_at;
    const { data, error } = await supabase
      .from("financiamiento").upsert(payload, { onConflict: "contacto_id" }).select().limit(1);
    setGuard(false);
    if (error) { setAviso({ tipo: "error", texto: error.message }); return null; }
    setFin(data?.[0] || payload);
    return data?.[0] || payload;
  };

  // Marca el link como enviado y programa los dos seguimientos.
  const marcarLinkEnviado = async () => {
    const ok = await guardar({
      link_enviado: true,
      link_enviado_at: new Date().toISOString(),
      estado: fin?.estado && fin.estado !== "financing_offered" ? fin.estado : "link_sent",
      seguimiento_fecha: finFechaEn(1),
    });
    if (!ok) return;
    try {
      await crearRecordatoriosFin(contacto, perfil);
      setAviso({ tipo: "ok", texto: "Link marcado como enviado. Te agendé los seguimientos de 24 h y 3 días." });
    } catch {
      setAviso({ tipo: "ok", texto: "Link marcado como enviado (no se pudieron agendar los recordatorios)." });
    }
  };

  const lbl   = { fontSize: 11, color: L.light, width: 74, flexShrink: 0 };
  const linea = { display: "flex", gap: 8, padding: "5px 0", alignItems: "center" };
  const input = {
    flex: 1, minWidth: 0, fontFamily: FONT_BODY, fontSize: 12.5, color: L.text,
    border: `1px solid ${L.border}`, borderRadius: 8, padding: "5px 8px", background: L.white,
  };
  const est = ESTADOS_FIN[fin?.estado];

  return (
    <div style={seccion}>
      {cabecera("financiamiento", "Financiamiento",
        est ? (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: est.color, background: est.bg, borderRadius: 20, padding: "2px 8px" }}>
            {est.label}
          </span>
        ) : null
      )}

      {abierta && (cargando ? (
        <div style={{ fontSize: 12, color: L.light, marginTop: 6 }}>Cargando…</div>
      ) : (
        <div style={{ marginTop: 4, opacity: guardando ? 0.6 : 1, transition: "opacity .15s" }}>

          {/* Interés en financiamiento */}
          <div style={linea}>
            <span style={lbl}>Interés</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[["Sí", true], ["No", false]].map(([txt, val]) => (
                <button key={txt} onClick={() => guardar({ interes: val })}
                  style={{
                    padding: "3px 12px", borderRadius: 20, cursor: "pointer", fontSize: 11.5, fontWeight: 700, fontFamily: FONT_BODY,
                    border: `1.5px solid ${fin?.interes === val ? C.ai : L.border}`,
                    background: fin?.interes === val ? C.aiSoft : L.white,
                    color: fin?.interes === val ? C.ai : L.muted,
                  }}>{txt}</button>
              ))}
            </div>
          </div>

          {/* Estado de la solicitud */}
          <div style={linea}>
            <span style={lbl}>Estado</span>
            <select value={fin?.estado || ""} onChange={(e) => guardar({ estado: e.target.value || null })} style={input}>
              <option value="">Sin definir</option>
              {Object.entries(ESTADOS_FIN).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Link enviado */}
          <div style={linea}>
            <span style={lbl}>Link</span>
            {fin?.link_enviado ? (
              <span style={{ fontSize: 12, color: L.text }}>
                Enviado{fin.link_enviado_at ? ` el ${new Date(fin.link_enviado_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}
              </span>
            ) : (
              <button onClick={marcarLinkEnviado} disabled={guardando}
                style={{ ...input, cursor: "pointer", fontWeight: 700, color: C.ai, borderColor: "#C7D2FE", background: C.aiSoft, textAlign: "left" }}>
                Marcar como enviado
              </button>
            )}
          </div>

          {/* Monto solicitado */}
          <div style={linea}>
            <span style={lbl}>Monto</span>
            <input type="number" min="0" step="100" placeholder="USD" style={input}
              defaultValue={fin?.monto_estimado ?? ""}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== (fin?.monto_estimado ?? null)) guardar({ monto_estimado: v });
              }} />
          </div>

          {/* Modelo elegido */}
          <div style={linea}>
            <span style={lbl}>Modelo</span>
            <input type="text" placeholder="Ej. 3-Stall" style={input}
              defaultValue={fin?.modelo || ""}
              onBlur={(e) => { if (e.target.value !== (fin?.modelo || "")) guardar({ modelo: e.target.value || null }); }} />
          </div>

          {/* Socio financiero (hoy siempre el mismo) */}
          <div style={linea}>
            <span style={lbl}>Socio</span>
            <span style={{ fontSize: 12.5, color: L.text, fontWeight: 500 }}>{fin?.socio || SOCIO_FIN}</span>
          </div>

          {/* Próximo seguimiento */}
          <div style={linea}>
            <span style={lbl}>Seguimiento</span>
            <input type="date" style={input}
              value={fin?.seguimiento_fecha || ""}
              onChange={(e) => guardar({ seguimiento_fecha: e.target.value || null })} />
          </div>

          {/* Notas */}
          <textarea placeholder="Notas del financiamiento…" rows={2}
            defaultValue={fin?.notas || ""}
            onBlur={(e) => { if (e.target.value !== (fin?.notas || "")) guardar({ notas: e.target.value || null }); }}
            style={{ ...input, width: "100%", marginTop: 6, resize: "vertical", fontFamily: FONT_BODY }} />

          {fin?.detectado_por_ia && (
            <div style={{ fontSize: 11, color: L.muted, marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
              <Sparkles size={11} color={C.ai} /> Estado detectado por la IA en el chat.
            </div>
          )}
          {aviso && (
            <div style={{ fontSize: 11.5, marginTop: 6, fontWeight: 600, color: aviso.tipo === "ok" ? "#15803D" : "#DC2626" }}>
              {aviso.texto}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PanelDerecho({ contacto, perfil, onUpdateContacto, onEditar, onColapsar }) {
  const [notas, setNotas]       = useState(contacto.notas || "");
  const [guardando, setGuard]   = useState(false);
  const [guardado, setGuardado] = useState(false);

  // Al cambiar de cliente, recargar sus notas (si no, quedan las del anterior).
  useEffect(() => { setNotas(contacto.notas || ""); setGuardado(false); }, [contacto.id]);

  const upd = async (campos) => {
    await supabase.from("contactos").update(campos).eq("id", contacto.id);
    notificarCambioEstado(contacto, campos);   // embudo → evento a Meta
    onUpdateContacto({ ...contacto, ...campos });
  };

  const guardarNotas = async () => {
    setGuard(true);
    await upd({ notas });
    setGuard(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1800);
  };

  const idxActual = EMBUDO.indexOf(contacto.estado);
  const fila = (label, valor) => (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", alignItems: "baseline" }}>
      <span style={{ fontSize: 11, color: L.light, width: 74, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: valor ? L.text : L.light, fontWeight: valor ? 500 : 400, minWidth: 0, overflowWrap: "anywhere" }}>
        {valor || "—"}
      </span>
    </div>
  );

  const seccion = { background: L.white, border: `1px solid ${L.border}`, borderRadius: 12, padding: "11px 12px" };
  const titulo  = { fontFamily: FONT_DISPLAY, fontSize: 12.5, fontWeight: 700, color: L.text };

  // Cada sección se pliega/despliega tocando su título (menos altura ocupada).
  const [abiertas, setAbiertas] = useState({ datos: true, embudo: true, financiamiento: false, actividad: false, notas: false });
  const toggleSec = (k) => setAbiertas((s) => ({ ...s, [k]: !s[k] }));
  const cabecera = (id, label, extra) => (
    <div onClick={() => toggleSec(id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
      <span style={{ ...titulo, display: "flex", alignItems: "center", gap: 5 }}>
        <ChevronRight size={14} color={L.light} style={{ transform: abiertas[id] ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
        {label}
      </span>
      {extra}
    </div>
  );

  return (
    <aside style={{ width: "100%", height: "100%", background: L.bg, borderLeft: `1px solid ${L.border}`, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }} className="scroll-y">

      {/* Barra superior de la ficha: título + colapsar toda la columna */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 10.5, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.7 }}>Ficha del cliente</span>
        {onColapsar && (
          <button onClick={onColapsar} title="Ocultar ficha del cliente"
            style={{ background: L.white, border: `1px solid ${L.border}`, borderRadius: 8, height: 26, padding: "0 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: L.muted, fontSize: 11.5, fontWeight: 600, fontFamily: FONT_BODY, transition: "all .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#C7D2FE"; e.currentTarget.style.color = "#4F46E5"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}>
            <PanelRightClose size={14} /> Ocultar
          </button>
        )}
      </div>

      {/* Datos del contacto */}
      <div style={seccion}>
        {cabecera("datos", "Datos del contacto",
          <button onClick={(e) => { e.stopPropagation(); onEditar(); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: 12, fontWeight: 700, fontFamily: FONT_BODY, padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
            <Pencil size={12} /> Editar
          </button>
        )}
        {abiertas.datos && (
          <div style={{ marginTop: 4 }}>
            {fila("Nombre", contacto.nombre)}
            {fila("Teléfono", contacto.telefono)}
            {fila("Email", contacto.email)}
            {fila("Ubicación", contacto.direccion)}
            {fila("Empresa", contacto.empresa)}
            {fila("Ingreso", contacto.created_at ? new Date(contacto.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null)}
            {fila("Vendedor", contacto.vendedor)}
          </div>
        )}
      </div>

      {/* Embudo de ventas */}
      <div style={seccion}>
        {cabecera("embudo", "Embudo de ventas")}
        {abiertas.embudo && (<>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 6 }}>
          {EMBUDO.map((e, i) => {
            const est    = ESTADOS[e];
            const activo = e === contacto.estado;
            const pasado = idxActual > -1 && i < idxActual;
            return (
              <button key={e} onClick={() => upd({ estado: e })} title={`Marcar como ${est.label}`}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", border: "none", cursor: "pointer", background: activo ? est.bg : "transparent", borderRadius: 8, textAlign: "left", width: "100%", transition: "background .15s" }}
                onMouseEnter={(e2) => { if (!activo) e2.currentTarget.style.background = L.soft; }}
                onMouseLeave={(e2) => { if (!activo) e2.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  background: activo ? est.color : pasado ? COLOR.success : "transparent",
                  border: activo || pasado ? "none" : `1.5px solid ${L.border}` }}>
                  {(activo || pasado) && <Check size={10} color="#fff" />}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: activo ? 700 : 500, color: activo ? est.color : pasado ? L.text : L.muted }}>
                  {est.label}
                </span>
              </button>
            );
          })}
        </div>
        {!EMBUDO.includes(contacto.estado) && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: L.muted, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertCircle size={12} /> Estado actual: <strong>{(ESTADOS[contacto.estado] || {}).label || contacto.estado}</strong>
          </div>
        )}
        </>)}
      </div>

      {/* Financiamiento (Ascentium Capital) */}
      <SeccionFinanciamiento contacto={contacto} perfil={perfil}
        seccion={seccion} cabecera={cabecera} abierta={abiertas.financiamiento} />

      {/* Actividad comercial */}
      <div style={seccion}>
        {cabecera("actividad", "Actividad")}
        {abiertas.actividad && (<div style={{ marginTop: 4 }}>
        {fila("Últ. del cliente", contacto.ultimo_in_at ? `hace ${msToStr(Date.now() - new Date(contacto.ultimo_in_at).getTime())}` : null)}
        {fila("Últ. respuesta", contacto.ultimo_out_at ? `hace ${msToStr(Date.now() - new Date(contacto.ultimo_out_at).getTime())}` : null)}
        <div style={{ display: "flex", gap: 8, padding: "5px 0", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: L.light, width: 74, flexShrink: 0 }}>Seguimiento</span>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere", color: contacto.seguimiento_at ? (new Date(contacto.seguimiento_at) <= new Date() ? COLOR.warning : L.text) : L.light }}>
            {contacto.seguimiento_at
              ? new Date(contacto.seguimiento_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "Sin agendar"}
          </span>
        </div>
        {contacto.nota_seguimiento && (
          <div style={{ fontSize: 11.5, color: L.muted, marginTop: 2, fontStyle: "italic" }}>{contacto.nota_seguimiento}</div>
        )}
        </div>)}
      </div>

      {/* Notas */}
      <div style={seccion}>
        {cabecera("notas", "Notas")}
        {abiertas.notas && (<>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4}
          placeholder="Anotá lo que no puede perderse de este cliente…"
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", marginTop: 6, border: `1.5px solid ${L.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 12.5, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none", lineHeight: 1.5 }} />
        {notas !== (contacto.notas || "") && (
          <button onClick={guardarNotas} disabled={guardando}
            style={{ marginTop: 7, background: C.red, color: "#fff", border: "none", borderRadius: 8, padding: "6px 13px", fontSize: 12, fontWeight: 700, cursor: guardando ? "default" : "pointer", fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", gap: 5 }}>
            <Check size={12} /> {guardando ? "Guardando…" : "Guardar nota"}
          </button>
        )}
        {guardado && (
          <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 700, color: COLOR.success, display: "flex", alignItems: "center", gap: 4 }}>
            <Check size={12} /> Nota guardada
          </div>
        )}
        </>)}
      </div>
    </aside>
  );
}

function ChatPanel({ contacto, perfil, onUpdateContacto, onDeleteContacto, userName, onBack, isMobile, rol, fichaAbierta, onToggleFicha }) {
  // Los leads de Google Ads llegan por email, así que comparten el mismo canal
  // de salida (y la misma desactivación).
  const esCanalEmail = contacto.canal === "email" || contacto.canal === "google_ads";
  const emailBloqueado = esCanalEmail && !EMAIL_HABILITADO;

  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto]       = useState("");
  const [enviando, setEnviando]   = useState(false);
  const [err, setErr]             = useState("");
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
  const [avEnviado, setAvEnviado] = useState(false);   // confirmación del botón Enviar de la vista previa
  const [avEtapaOk, setAvEtapaOk] = useState(false);
  const [avMsgTrad, setAvMsgTrad]     = useState("");    // traducción al español del mensaje sugerido
  const [avTradOn, setAvTradOn]       = useState(false); // mostrar/ocultar traducción
  const [avTradLoading, setAvTradLoading] = useState(false);
  const [traducciones, setTraducciones] = useState({});      // { [msgId]: textoTraducido }
  const [tradLoading, setTradLoading] = useState({});        // { [msgId]: bool }
  const [replyTo, setReplyTo] = useState(null); // { id, contenido, esCliente } | null
  const [toolsOpen, setToolsOpen] = useState(false); // desplegable de herramientas del input
  const endRef = useRef(null);
  const toolsRef = useRef(null);   // envuelve el botón ＋ y todos sus paneles
  const fileInputRef = useRef(null);

  // El menú ＋ y sus paneles (plantillas / cotizaciones / fotos) son un único
  // desplegable: se cierran todos juntos, con click afuera o con Escape.
  const cerrarTools = useCallback(() => {
    setToolsOpen(false); setShowPlantillas(false); setShowCotizaciones(false); setShowFotos(false); setFotoModelo(null);
  }, []);

  useEffect(() => {
    if (!toolsOpen && !showPlantillas && !showCotizaciones && !showFotos) return;
    const click = (e) => { if (toolsRef.current && !toolsRef.current.contains(e.target)) cerrarTools(); };
    const esc = (e) => { if (e.key === "Escape") cerrarTools(); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", esc); };
  }, [toolsOpen, showPlantillas, showCotizaciones, showFotos, cerrarTools]);

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
    setAvEnviado(false);
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

  // Copiar: solo al portapapeles. (Antes también cargaba el input; ahora de eso
  // se encarga "Editar", que es lo que el vendedor espera de cada botón.)
  const copiarMensajeAv = async () => {
    if (!avData?.mensaje_whatsapp) return;
    try { await navigator.clipboard.writeText(avData.mensaje_whatsapp); }
    catch { /* clipboard no disponible */ }
    setAvCopiado(true);
    setTimeout(() => setAvCopiado(false), 2200);
  };

  // Editar: carga el mensaje en el cuadro de escritura y cierra la vista previa
  // para que el vendedor lo retoque antes de mandarlo.
  const editarMensajeAv = () => {
    if (!avData?.mensaje_whatsapp) return;
    setTexto(avData.mensaje_whatsapp);
    setAvOpen(false);
  };

  // Enviar: manda el mensaje tal cual por el canal del contacto. Pasa por
  // `enviarMensaje`, así hereda el guardado en el CRM, el ruteo de canal y el
  // corte del canal de email — no duplica nada de esa lógica.
  const enviarMensajeAv = async () => {
    const cuerpo = avData?.mensaje_whatsapp;
    if (!cuerpo || enviando || avEnviado) return;
    setEnviando(true);
    const ok = await enviarMensaje(cuerpo);
    setEnviando(false);
    if (ok) {
      setAvEnviado(true);
      setTimeout(() => { setAvOpen(false); setAvEnviado(false); }, 900);
    }
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
    const res = await fetch("/api/resumen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "traducir", texto: txt, destino }),
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
    // Al abrir el chat queda "revisado": alguien vio la consulta aunque no responda.
    // `atendido_at` frena el cronómetro de respuesta: lo marca cualquier rol
    // (vendedor o administración), porque el mensaje ya fue leído.
    const ahora = new Date().toISOString();
    const patch = { no_leidos: 0, revisado_at: ahora, atendido_at: ahora };
    onUpdateContacto?.({ ...contacto, ...patch }); // optimista: oculta el cronómetro ya
    await supabase.from("contactos").update(patch).eq("id", contacto.id);
  }, [contacto.id, rol]);

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
    // Email desactivado: cortar ANTES de guardar. Si se guardara igual, el
    // mensaje aparecería en el chat como enviado y el vendedor daría por hecho
    // que el cliente lo recibió. Cubre todas las vías de envío (texto, imagen,
    // fotos por modelo y el botón Enviar de Avanzar).
    if (esCanalEmail && !EMAIL_HABILITADO) {
      setErr("El canal de email está desactivado: el mensaje no se envió ni se guardó. Contactá al cliente por WhatsApp o teléfono.");
      return false;
    }

    // 1) Guardar en CRM (Supabase)
    const { error } = await supabase.from("mensajes").insert({
      contacto_id: contacto.id, direccion: "out", origen: "agente", agente: userName, contenido: cuerpo,
    });
    if (error) {
      setErr("Error al guardar el mensaje: " + error.message);
      return false;
    }

    // 2) Enviar por el canal correspondiente (email, Messenger o WhatsApp).
    // El ruteo vive en `enviarPorCanal` (src/lib.js), compartido con el envío
    // masivo de Promociones, así un canal nuevo se agrega en un solo lugar.
    const { ok, error: errEnvio } = await enviarPorCanal({ contacto, cuerpo, agente: userName });
    if (!ok) setErr(`Mensaje guardado en CRM, pero no se envió: ${errEnvio}`);
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

  // Envía la cotización directo al cliente, sin pasar por la caja de texto.
  const enviarCotizacion = async (texto) => {
    if (!texto || enviando) return;
    setEnviando(true); setErr("");
    await enviarMensaje(texto);
    setEnviando(false);
  };

  // Manda el link de financiamiento y, de paso, deja registrada la ficha:
  // marca el link como enviado y agenda los seguimientos de 24 h y 3 días.
  const enviarFinanciamiento = async () => {
    if (enviando) return;
    setEnviando(true); setErr("");
    await enviarMensaje(TEXTO_FINANCIAMIENTO);
    try {
      await supabase.from("financiamiento").upsert({
        contacto_id: contacto.id,
        socio: SOCIO_FIN,
        vendedor_id: perfil?.id || null,
        interes: true,
        link_enviado: true,
        link_enviado_at: new Date().toISOString(),
        estado: "link_sent",
        seguimiento_fecha: finFechaEn(1),
      }, { onConflict: "contacto_id" });
      await crearRecordatoriosFin(contacto, perfil);
    } catch { /* el mensaje ya salió: la ficha se puede completar a mano */ }
    setEnviando(false);
  };

  // Geometría común de los paneles del ＋: siempre por encima del compositor y
  // anclados al botón, así crecen hacia arriba aunque el textarea se agrande.
  // En mobile ocupan el ancho del compositor (padding de 12px por lado).
  const toolsAbierto = toolsOpen || showPlantillas || showCotizaciones || showFotos;
  const panelBase = {
    position: "absolute",
    left: 0,
    bottom: "calc(100% + 10px)",
    zIndex: 210,
    width: isMobile ? "calc(100vw - 24px)" : 340,
    maxHeight: isMobile ? "66vh" : 440,
    overflowY: "auto",
    background: L.white,
    border: `1px solid ${L.border}`,
    borderRadius: 16,
    boxShadow: "0 14px 46px rgba(15,23,42,.18)",
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

  // Videos: formatos que el chat renderiza y que WhatsApp/Messenger aceptan.
  // El tope de 16 MB es el de WhatsApp para media por URL — arriba de eso el
  // cliente no recibe nada, así que conviene frenarlo acá y avisar.
  const VIDEOS_OK = ["video/mp4", "video/quicktime", "video/webm"];
  const MAX_VIDEO_MB = 16;

  // Sube un video directo del navegador a Storage con una URL firmada: un
  // video no entra en el body de /api/upload (límite de Vercel ~4.5 MB).
  const subirVideo = async (file) => {
    const res = await fetch("/api/upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo: "firmar", contentType: file.type, size: file.size }),
    });
    const json = await res.json();
    if (!res.ok || !json.token) throw new Error(json.error || "No se pudo preparar la subida");
    const { error } = await supabase.storage
      .from(json.bucket)
      .uploadToSignedUrl(json.path, json.token, file, { contentType: file.type });
    if (error) throw new Error(error.message || "Falló la subida del video");
    return json.url;
  };

  // Adjuntar imagen o video: sube a Storage → envía la URL por el canal.
  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const esVideo = file.type.startsWith("video/");
    if (!esVideo && !file.type.startsWith("image/")) { setErr("Solo se pueden adjuntar imágenes o videos."); return; }
    if (esVideo && !VIDEOS_OK.includes(file.type)) { setErr("Formato de video no soportado. Usá MP4, MOV o WebM."); return; }
    if (esVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setErr(`El video pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_VIDEO_MB} MB. Recortalo o mandá el link.`);
      return;
    }
    if (enviando || subiendo) return;
    setSubiendo(true); setErr("");
    try {
      let url;
      if (esVideo) {
        url = await subirVideo(file);
      } else {
        const { dataBase64, contentType } = await comprimirImagen(file);
        const res = await fetch("/api/upload", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataBase64, contentType }),
        });
        const json = await res.json();
        if (!res.ok || !json.url) throw new Error(json.error || "No se pudo subir la imagen");
        url = json.url;
      }
      await enviarMensaje(url);
    } catch (e2) {
      setErr(`No se pudo enviar ${esVideo ? "el video" : "la imagen"}: ` + (e2.message || e2));
    } finally {
      setSubiendo(false);
    }
  };

  const upd = async (campos) => {
    await supabase.from("contactos").update(campos).eq("id", contacto.id);
    notificarCambioEstado(contacto, campos);   // etapa aplicada desde el chat/IA
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
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              <button onClick={avanzarIA} title="Asistente de ventas IA: diagnóstico del cliente + próximo paso + mensaje sugerido"
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(.96)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                style={{ height: 32, boxSizing: "border-box", background: C.gradBtn, border: "none", color: "#fff", borderRadius: 9, padding: "0 12px", cursor: "pointer", fontSize: 12, fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: 0.2, display: "flex", alignItems: "center", gap: 5, boxShadow: SHADOW.ai, transition: "transform .1s ease", flexShrink: 0 }}>
                <Sparkles size={13} /> Avanzar con IA
              </button>
              <button onClick={() => upd({ bot_activo: !contacto.bot_activo })} title={contacto.bot_activo ? "El bot atiende este chat — tocá para atenderlo vos" : "Vos atendés este chat — tocá para que lo tome el bot"}
                style={{ height: 32, boxSizing: "border-box", background: contacto.bot_activo ? "#DCFCE7" : "#FEF2F2", border: `1.5px solid ${contacto.bot_activo ? "#86EFAC" : "#FECACA"}`, color: contacto.bot_activo ? "#15803D" : C.red, borderRadius: 9, padding: "0 11px", cursor: "pointer", fontSize: 12, fontFamily: FONT_BODY, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, transition: "all .15s", flexShrink: 0 }}>
                {contacto.bot_activo ? <><Bot size={13} /> Bot</> : <><User size={13} /> Yo atiendo</>}
              </button>
              <button onClick={() => setDrawer(true)} title="Editar datos del contacto"
                style={{ height: 32, width: 32, boxSizing: "border-box", background: L.soft, border: `1.5px solid ${L.border}`, color: L.muted, borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s", flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.color = L.muted; }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => setConfirmElim((v) => !v)} title="Eliminar contacto"
                style={{ height: 32, width: 32, boxSizing: "border-box", background: confirmElim ? "#FEE2E2" : L.soft, border: `1.5px solid ${confirmElim ? "#FECACA" : L.border}`, color: confirmElim ? C.red : L.muted, borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s", flexShrink: 0 }}
                onMouseEnter={(e) => { if (!confirmElim) { e.currentTarget.style.borderColor = "#FECACA"; e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.color = C.red; } }}
                onMouseLeave={(e) => { if (!confirmElim) { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.background = L.soft; e.currentTarget.style.color = L.muted; } }}>
                <Trash2 size={14} />
              </button>
              {onToggleFicha && (
                <button className="ficha-toggle" onClick={onToggleFicha} title={fichaAbierta ? "Ocultar ficha del cliente" : "Mostrar ficha del cliente"}
                  style={{ height: 32, width: 32, boxSizing: "border-box", background: fichaAbierta ? "#EEF2FF" : L.soft, border: `1.5px solid ${fichaAbierta ? "#C7D2FE" : L.border}`, color: fichaAbierta ? "#4F46E5" : L.muted, borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s", flexShrink: 0 }}>
                  {fichaAbierta ? <PanelRightClose size={15} /> : <PanelRight size={15} />}
                </button>
              )}
            </div>
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
              style={{ ...btnSt, flexShrink: 0, fontSize: 13, padding: "8px 18px", borderRadius: 12, fontWeight: 700, gap: 7, background: C.gradBtn, color: "#fff", borderColor: "transparent", boxShadow: SHADOW.ai, transition: "transform .1s ease" }}>
              <Sparkles size={15} /> Avanzar con IA
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
      {/* Fondo liso: la trama de puntitos competía con el texto de cada burbuja
          sin aportar nada. */}
      <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 12px" : "18px 22px", background: L.bg, display: "flex", flexDirection: "column", gap: 11 }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: "center", color: L.light, fontSize: 13.5, marginTop: 40 }}>Sin mensajes en esta conversación aún.</div>
        )}
        {mensajes.filter((m) => !sinContenido(m) && !ECHO_PREFIX_RE.test(m.contenido || "")).map((m, i, visibles) => {
          const esCliente = m.direccion === "in";
          // Separador de día: se dibuja cuando este mensaje cae en una fecha
          // distinta de la del anterior. En chats largos (meses de historial)
          // era imposible ver dónde terminaba una conversación y empezaba otra.
          const dia = new Date(m.created_at);
          const previo = i > 0 ? new Date(visibles[i - 1].created_at) : null;
          const nuevoDia = !previo || dia.toDateString() !== previo.toDateString();
          const etiquetaDia = (() => {
            const d = diasAtras(m.created_at);
            if (d === Infinity) return "Sin fecha";
            if (d <= 0)  return "Hoy";
            if (d === 1) return "Ayer";
            const mismoAnio = dia.getFullYear() === new Date().getFullYear();
            const txt = dia.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", ...(mismoAnio ? {} : { year: "numeric" }) });
            return txt.charAt(0).toUpperCase() + txt.slice(1);
          })();
          // Las etiquetas "Bot ·" y "Agente ·" son de lo que MANDAMOS nosotros
          // (van alineadas a la derecha). Sin mirar la dirección, un mensaje
          // entrante guardado con origen "bot" salía firmado por el bot.
          const esBot     = !esCliente && m.origen === "bot";
          const esAgente  = !esCliente && m.origen === "agente";
          const hora      = (() => {
            const d = new Date(m.created_at);
            const hoy = new Date();
            const mismoAnio = d.getFullYear() === hoy.getFullYear();
            const time = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
            if (d.toDateString() === hoy.toDateString()) return time;
            return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", ...(mismoAnio ? {} : { year: "2-digit" }) }) + " · " + time;
          })();
          return (
            <Fragment key={m.id}>
            {/* Sin `sticky`: como son hermanos dentro del mismo contenedor, al
                scrollear se quedaban todos pegados arriba y se pisaban entre
                sí ("MIÉRCO…HOY…E JULIO" encimado). Ahora acompañan al scroll. */}
            {nuevoDia && (
              <div style={{ alignSelf: "center", margin: "6px 0 2px",
                padding: "2px 10px", fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600,
                color: L.light, background: L.white, borderRadius: 999 }}>
                {etiquetaDia}
              </div>
            )}
            <div
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
              {/* Quién escribió: texto gris, no una cápsula de color. Se repite
                  en cada mensaje nuestro, así que tiene que pesar poco. */}
              {esBot && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10.5, color: L.light, padding: "0 2px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <Bot size={11} /> Bot · NINIT Group
                  </span>
                </div>
              )}
              {esAgente && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 10.5, color: L.light, padding: "0 2px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <User size={11} /> {m.agente || "Agente"} · NINIT Group
                  </span>
                </div>
              )}
              {/* Burbuja */}
              {/* Dos fondos y nada más: blanco lo que dice el cliente, gris
                  suave lo que mandamos nosotros. Antes cada burbuja sumaba una
                  barra lateral de color, sombra y esquinas asimétricas para
                  repetir algo que la posición izquierda/derecha ya dice. */}
              <div style={{ background: esCliente ? L.white : (esAgente ? "#FDF1F1" : L.soft), borderRadius: 14, border: `1px solid ${esCliente ? L.border : "transparent"}`, padding: "10px 14px", fontSize: 14, color: L.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                <MensajeContenido texto={m.contenido} />
              </div>
              {/* Traducción al español del mensaje */}
              {traducciones[m.id] && (
                <div style={{ marginTop: 4, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 12, padding: "8px 12px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: C.ai, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                    <Languages size={11} /> Traducción
                  </div>
                  <div style={{ fontSize: 13.5, color: L.text }}>{traducciones[m.id]}</div>
                </div>
              )}
              {/* Hora + traducir + eliminar */}
              {/* Responder / Traducir / Eliminar aparecen al pasar el mouse por
                  el mensaje. Fijas, repetían tres botones por burbuja y en un
                  chat largo tapaban la conversación. En celular no hay hover,
                  así que ahí siguen siempre a la vista. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: esCliente ? "flex-start" : "flex-end", minHeight: 17 }}>
                <div style={{ fontSize: 10.5, color: L.light }}>{hora}</div>
                {(isMobile || hoverMsg === m.id || traducciones[m.id] || tradLoading[m.id]) && (<>
                <button onClick={() => setReplyTo({ id: m.id, contenido: m.contenido, esCliente })} title="Responder a este mensaje"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: L.light, fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, borderRadius: 4 }}>
                  <Reply size={12} /> Responder
                </button>
                <button onClick={() => toggleTraducirMensaje(m)} title="Traducir al español"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "1px 4px", color: L.light, fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, borderRadius: 4 }}>
                  <Languages size={12} /> {tradLoading[m.id] ? "…" : (traducciones[m.id] ? "Ver original" : "Traducir")}
                </button>
                </>)}
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
            </Fragment>
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
          <Reply size={15} color={C.ai} style={{ flexShrink: 0 }} />
          <div style={{ width: 3, alignSelf: "stretch", background: C.ai, borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.ai, textTransform: "uppercase", letterSpacing: 0.4 }}>
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

      {/* ── Canal de email desactivado: aviso en lugar del cuadro de escritura ── */}
      {emailBloqueado ? (
        <div style={{ padding: isMobile ? "14px 12px" : "16px 22px", borderTop: `1px solid ${L.border}`, background: L.soft, display: "flex", gap: 12, alignItems: "flex-start", flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: COLOR.warningSoft, color: COLOR.warning, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Mail size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13.5, fontWeight: 700, color: L.text }}>
              El canal de email está desactivado
            </div>
            <div style={{ fontSize: 12.5, color: L.muted, marginTop: 2, lineHeight: 1.5 }}>
              {contacto.canal === "google_ads" ? "Este lead entró por Google Ads, que responde por email." : "Este contacto escribió por email."}{" "}
              Podés seguir leyendo la conversación, pero no enviar respuestas.
              {contacto.telefono ? " Contactalo por WhatsApp o teléfono." : " No tiene teléfono cargado: agregalo con Editar para poder contactarlo."}
            </div>
          </div>
        </div>
      ) : (
      <div style={{ padding: isMobile ? "10px 12px" : "14px 22px", borderTop: `1px solid ${L.border}`, background: L.white, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0, position: "relative" }}>
        {/* Botón ＋ — despliega un menú vertical hacia arriba, una opción por fila */}
        <div ref={toolsRef} style={{ position: "relative", flexShrink: 0 }}>
          <style>{`
            .tools-pop{animation:toolsUp .18s cubic-bezier(.2,.85,.3,1);transform-origin:bottom left}
            @keyframes toolsUp{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}
            .tools-item{width:100%;display:flex;align-items:center;gap:11px;padding:9px 10px;background:none;border:none;border-radius:12px;cursor:pointer;text-align:left;font-family:inherit;transition:background .12s}
            .tools-item:disabled{opacity:.5;cursor:default}
            .tools-item:not(:disabled):hover{background:rgba(15,23,42,.06)}
            .tools-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
            .tools-row{width:100%;display:flex;align-items:center;gap:9px;padding:11px 15px;background:none;border:none;border-bottom:1px solid rgba(15,23,42,.06);cursor:pointer;text-align:left;font-family:inherit;font-size:13.5px;line-height:1.35;transition:background .12s}
            .tools-row:disabled{opacity:.5;cursor:default}
            .tools-row:not(:disabled):hover{background:rgba(15,23,42,.05)}
          `}</style>
          <button onClick={() => (toolsAbierto ? cerrarTools() : setToolsOpen(true))} title="Adjuntar y más opciones" aria-label="Más opciones" aria-expanded={toolsAbierto}
            style={{ background: toolsAbierto ? C.gradBtn : L.soft, color: toolsAbierto ? "#fff" : C.red, border: `1.5px solid ${toolsAbierto ? "transparent" : L.border}`, borderRadius: 11, width: 42, height: 42, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .18s" }}>
            <Plus size={20} style={{ transform: toolsAbierto ? "rotate(45deg)" : "none", transition: "transform .18s" }} />
          </button>

          {/* Menú principal */}
          {toolsOpen && (
            <div className="tools-pop" style={{ ...panelBase, width: isMobile ? "calc(100vw - 24px)" : 274, padding: 7 }}>
              <button className="tools-item" onClick={() => { setToolsOpen(false); setShowPlantillas(true); }}>
                <span className="tools-ico" style={{ background: C.red + "1A", color: C.red }}><Zap size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: L.text }}>Plantillas</span>
                  <span style={{ display: "block", fontSize: 11.5, color: L.muted, marginTop: 1 }}>Respuestas rápidas</span>
                </span>
                <ChevronRight size={16} color={L.muted} style={{ flexShrink: 0 }} />
              </button>

              <button className="tools-item" disabled={enviando}
                onClick={() => { if (COTIZACIONES.length === 1) { cerrarTools(); enviarCotizacion(COTIZACIONES[0].texto); } else { setToolsOpen(false); setShowCotizaciones(true); } }}>
                <span className="tools-ico" style={{ background: C.gold + "1A", color: C.gold }}><Receipt size={18} weight="duotone" /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: L.text }}>Cotización</span>
                  <span style={{ display: "block", fontSize: 11.5, color: L.muted, marginTop: 1 }}>{enviando ? "Enviando…" : COTIZACIONES.length === 1 ? "Se envía al cliente al toque" : "Elegí cuál enviar"}</span>
                </span>
                {COTIZACIONES.length === 1 ? <Send size={15} color={L.muted} style={{ flexShrink: 0 }} /> : <ChevronRight size={16} color={L.muted} style={{ flexShrink: 0 }} />}
              </button>

              <button className="tools-item" disabled={enviando}
                onClick={() => { cerrarTools(); enviarFinanciamiento(); }}>
                <span className="tools-ico" style={{ background: "#15803D1A", color: "#15803D" }}><CreditCard size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: L.text }}>Financiamiento</span>
                  <span style={{ display: "block", fontSize: 11.5, color: L.muted, marginTop: 1 }}>
                    {enviando ? "Enviando…" : "Manda el link y agenda los seguimientos"}
                  </span>
                </span>
                <Send size={15} color={L.muted} style={{ flexShrink: 0 }} />
              </button>

              <button className="tools-item" onClick={() => { setToolsOpen(false); setShowFotos(true); setFotoModelo(null); }}>
                <span className="tools-ico" style={{ background: "#0EA5E91A", color: "#0EA5E9" }}><ImageIcon size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: L.text }}>Fotos y videos</span>
                  <span style={{ display: "block", fontSize: 11.5, color: L.muted, marginTop: 1 }}>Por modelo de trailer</span>
                </span>
                <ChevronRight size={16} color={L.muted} style={{ flexShrink: 0 }} />
              </button>

              <button className="tools-item" disabled={subiendo || enviando} onClick={() => { cerrarTools(); fileInputRef.current?.click(); }}>
                <span className="tools-ico" style={{ background: "#16A34A1A", color: "#16A34A" }}><ImageIcon size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: L.text }}>Imagen o video</span>
                  <span style={{ display: "block", fontSize: 11.5, color: L.muted, marginTop: 1 }}>{subiendo ? "Subiendo…" : "Subir desde el dispositivo (video hasta 16 MB)"}</span>
                </span>
              </button>
            </div>
          )}

          {/* Panel: plantillas rápidas */}
          {showPlantillas && (
            <div className="tools-pop" style={{ ...panelBase, width: isMobile ? "calc(100vw - 24px)" : 380 }}>
              <div style={{ position: "sticky", top: 0, background: L.white, padding: "11px 10px 11px 6px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
                <button onClick={() => { setShowPlantillas(false); setToolsOpen(true); }} title="Volver"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: C.red }}>
                  <ChevronLeft size={18} />
                </button>
                <Zap size={14} color={C.red} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.8 }}>Plantillas rápidas</span>
              </div>
              {PLANTILLAS.map((grupo) => (
                <div key={grupo.grupo}>
                  <div style={{ padding: "9px 15px 5px", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{grupo.grupo}</div>
                  {grupo.items.map((item) => (
                    <button key={item.label} className="tools-row" style={{ color: L.text }}
                      onClick={() => { setTexto(item.texto.replaceAll("{VENDEDOR}", (userName || "").split(" ")[0])); cerrarTools(); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Panel: cotizaciones (solo aparece si hay más de una) */}
          {showCotizaciones && (
            <div className="tools-pop" style={{ ...panelBase, width: isMobile ? "calc(100vw - 24px)" : 340 }}>
              <div style={{ position: "sticky", top: 0, background: L.white, padding: "11px 10px 11px 6px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
                <button onClick={() => { setShowCotizaciones(false); setToolsOpen(true); }} title="Volver"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: C.gold }}>
                  <ChevronLeft size={18} />
                </button>
                <Receipt size={16} weight="duotone" color={C.gold} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.8 }}>Cotizaciones</span>
              </div>
              <div style={{ padding: "8px 15px 2px", fontSize: 11, color: L.muted }}>Tocá una para enviarla directo al cliente 👇</div>
              {COTIZACIONES.map((item) => (
                <button key={item.label} className="tools-row" disabled={enviando} style={{ color: L.text }}
                  onClick={() => { cerrarTools(); enviarCotizacion(item.texto); }}>
                  {item.label}
                  <Send size={14} color={L.muted} style={{ marginLeft: "auto", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* Panel: fotos y videos por modelo */}
          {showFotos && (
            <div className="tools-pop" style={{ ...panelBase, width: isMobile ? "calc(100vw - 24px)" : 340 }}>
              {fotoModelo == null ? (
                <>
                  <div style={{ position: "sticky", top: 0, background: L.white, padding: "11px 10px 11px 6px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
                    <button onClick={() => { setShowFotos(false); setToolsOpen(true); }} title="Volver"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "#0EA5E9" }}>
                      <ChevronLeft size={18} />
                    </button>
                    <ImageIcon size={14} color="#0EA5E9" />
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.8 }}>Fotos por modelo</span>
                  </div>
                  {FOTOS_MODELOS.map((item, i) => (
                    <button key={item.label} className="tools-row" style={{ color: L.text }} onClick={() => setFotoModelo(i)}>
                      <ImageIcon size={14} color="#0EA5E9" style={{ flexShrink: 0 }} /> {item.label}
                      <ChevronRight size={15} color={L.muted} style={{ marginLeft: "auto", flexShrink: 0 }} />
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ position: "sticky", top: 0, background: L.white, padding: "11px 10px 11px 6px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
                    <button onClick={() => setFotoModelo(null)} title="Volver"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "#0EA5E9" }}>
                      <ChevronLeft size={18} />
                    </button>
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.6 }}>{FOTOS_MODELOS[fotoModelo].label}</span>
                  </div>
                  <div style={{ padding: "8px 15px 2px", fontSize: 11, color: L.muted }}>Tocá una foto para enviarla directo al cliente 👇</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, padding: 11 }}>
                    {FOTOS_MODELOS[fotoModelo].assets.map((a) => {
                      const thumb = primeraImagen(a.texto);
                      return (
                        <button key={a.tipo} disabled={enviando}
                          onClick={() => { cerrarTools(); enviarFotoAsset(a.texto); }}
                          title={`Enviar ${a.tipo}`}
                          style={{ padding: 0, background: L.soft, border: `1px solid ${L.border}`, borderRadius: 10, cursor: enviando ? "default" : "pointer", overflow: "hidden", display: "flex", flexDirection: "column", transition: "all .15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0EA5E9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = L.border; e.currentTarget.style.transform = "none"; }}>
                          <div style={{ width: "100%", height: isMobile ? 120 : 100, background: "#0F172A0A", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                            {thumb
                              ? <img src={thumb} alt={a.tipo} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
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

          {/* Adjuntar media: lo dispara la opción "Imagen o video" del menú */}
          <input ref={fileInputRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm" onChange={onPickImage} style={{ display: "none" }} />
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
      )}

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
              <div style={{ width: 34, height: 34, borderRadius: 9, background: C.ai, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                <div style={{ textAlign: "center", color: C.ai, fontSize: 13.5, padding: "26px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
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
                  style={{ background: resumenCopiado ? COLOR.success : (resumenMensaje ? C.ai : L.light), color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: resumenMensaje ? "pointer" : "default", fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", gap: 6 }}>
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
                  {/* ── Estado del cliente: nivel + etapa + urgencia ── */}
                  {(() => {
                    const n = AV_NIVEL[avData.nivel_interes] || AV_NIVEL.tibio;
                    const u = AV_URGENCIA[avData.urgencia] || AV_URGENCIA.media;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 11px", borderRadius: 20, background: n.bg, color: n.color, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: n.color }} /> {n.label}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 11px", borderRadius: 20, background: C.aiSoft, color: C.ai }}>
                          {AV_ETAPA[avData.etapa_embudo] || avData.etapa_embudo}
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 11px", borderRadius: 20, background: u.bg, color: u.color, display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <Zap size={11} /> {u.label}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Situación del cliente */}
                  {avData.resumen_cliente && (
                    <div style={{ fontSize: 13.5, color: L.text, lineHeight: 1.55, marginBottom: 14 }}>{avData.resumen_cliente}</div>
                  )}

                  {/* ── Score de cierre + por qué ── */}
                  {(() => {
                    const prob = typeof avData.probabilidad_cierre === "number" ? avData.probabilidad_cierre : null;
                    const senales = avData.senales_compra || [];
                    if (prob == null && !senales.length) return null;
                    const lect = prob == null ? null : avScoreLectura(prob);
                    return (
                      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", background: L.soft, border: `1px solid ${L.border}`, borderRadius: 14, padding: "14px 15px", marginBottom: 16, flexWrap: "wrap" }}>
                        {prob != null && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <ScoreDonut valor={prob} />
                              <span style={{ position: "absolute", fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, color: lect.color, fontVariantNumeric: "tabular-nums" }}>{prob}%</span>
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 800, color: lect.color }}>{lect.label}</div>
                            <div style={{ fontSize: 9.5, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.5 }}>Score de cierre</div>
                          </div>
                        )}
                        {senales.length > 0 && (
                          <div style={{ flex: 1, minWidth: 168 }}>
                            <div style={avLbl}>¿Por qué este score?</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {senales.map((s, i) => {
                                const riesgo = esSenalDeRiesgo(s);
                                return (
                                  <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5, color: L.text, lineHeight: 1.4 }}>
                                    <span style={{ color: riesgo ? COLOR.warning : COLOR.success, flexShrink: 0, marginTop: 1, display: "flex" }}>
                                      {riesgo ? <AlertCircle size={13} /> : <Check size={13} />}
                                    </span>
                                    {s}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
                          style={{ background: "none", border: "none", cursor: avTradLoading ? "default" : "pointer", color: C.ai, fontSize: 11.5, fontWeight: 700, fontFamily: FONT_BODY, display: "inline-flex", alignItems: "center", gap: 4, padding: 0, flexShrink: 0 }}>
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
                      <div style={{ width: 24, height: 24, borderRadius: 8, background: C.aiSoft, color: C.ai, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
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
              <div style={{ padding: "12px 18px", borderTop: `1px solid ${L.border}`, display: "flex", flexDirection: "column", gap: 9 }}>
                <button onClick={aplicarEtapaAv} title="Cambiar el estado del cliente al sugerido por la IA"
                  style={{ background: avEtapaOk ? COLOR.success : L.soft, border: `1.5px solid ${avEtapaOk ? COLOR.success : L.border}`, borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: avEtapaOk ? "#fff" : L.muted, fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
                  {avEtapaOk ? <><Check size={14} /> Etapa aplicada</> : <>Aplicar etapa: {AV_ETAPA[avData.etapa_embudo] || avData.etapa_embudo}</>}
                </button>

                {/* Editar · Generar otra · Copiar · Enviar */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { key: "editar", label: "Editar", icon: <Pencil size={13} />, onClick: editarMensajeAv, disabled: !avData.mensaje_whatsapp,
                      title: "Cargar el mensaje en el cuadro de escritura para retocarlo" },
                    { key: "otra", label: "Generar otra", icon: <Sparkles size={13} />, onClick: avanzarIA, disabled: false,
                      title: "Volver a analizar la conversación y proponer otro mensaje" },
                    { key: "copiar", label: avCopiado ? "Copiado" : "Copiar", icon: avCopiado ? <Check size={13} /> : <FileText size={13} />, onClick: copiarMensajeAv, disabled: !avData.mensaje_whatsapp,
                      title: "Copiar el mensaje al portapapeles" },
                  ].map((b) => (
                    <button key={b.key} onClick={b.onClick} disabled={b.disabled} title={b.title}
                      style={{ flex: "1 1 auto", background: L.soft, border: `1.5px solid ${b.key === "copiar" && avCopiado ? COLOR.success : L.border}`, borderRadius: 9, padding: "9px 12px", fontSize: 13, fontWeight: 600,
                        cursor: b.disabled ? "default" : "pointer", opacity: b.disabled ? 0.5 : 1,
                        color: b.key === "copiar" && avCopiado ? COLOR.success : L.muted,
                        fontFamily: FONT_BODY, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {b.icon} {b.label}
                    </button>
                  ))}
                  <button onClick={enviarMensajeAv} disabled={!avData.mensaje_whatsapp || enviando || emailBloqueado}
                    title={emailBloqueado ? "El canal de email está desactivado" : `Enviar ahora por ${esCanalEmail ? "email" : contacto.canal === "messenger" ? "Messenger" : "WhatsApp"}`}
                    style={{ flex: "1 1 auto", background: avEnviado ? COLOR.success : (!avData.mensaje_whatsapp || emailBloqueado ? L.light : C.gradBtn), color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 700,
                      cursor: !avData.mensaje_whatsapp || enviando || emailBloqueado ? "default" : "pointer",
                      fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      boxShadow: avEnviado || !avData.mensaje_whatsapp || emailBloqueado ? "none" : SHADOW.ai }}>
                    {avEnviado ? <><Check size={14} /> Enviado</> : <><Send size={14} /> {enviando ? "Enviando…" : "Enviar"}</>}
                  </button>
                </div>
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
    <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 5000, width: "min(440px, calc(100vw - 24px))", background: L.white, border: "1px solid #FDE68A", borderLeft: "4px solid #F59E0B", borderRadius: 14, boxShadow: "0 10px 40px rgba(0,0,0,.18)", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12, fontFamily: FONT_BODY }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <BookOpen size={17} color="#B45309" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: L.text, marginBottom: 2 }}>
          Te falta el reporte de hoy
        </div>
        <div style={{ fontSize: 12.5, color: L.muted, lineHeight: 1.5 }}>
          {perfil?.nombre?.split(" ")[0] ? `${perfil.nombre.split(" ")[0]}, ` : ""}no te olvides de completar tu <b>Mi Día</b> antes de cerrar. Así Nicolás lo puede revisar.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={() => { onIr?.(); setVisible(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8, border: "none", background: C.red, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
            <BookOpen size={13} /> Escribir mi día
          </button>
          <button onClick={cerrar}
            style={{ padding: "6px 13px", borderRadius: 8, border: `1px solid ${L.border}`, background: L.white, color: L.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
            Más tarde
          </button>
        </div>
      </div>
      <button onClick={cerrar} title="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", color: L.light, padding: 2, flexShrink: 0 }}>
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

// Cartel para el VENDEDOR: "Se te asignó un cliente". Suena + vibra al aparecer.
function BannerAsignacion({ info, onVer, onClose }) {
  useEffect(() => {
    try { const a = new Audio("/Car.mp3"); a.play().catch(() => {}); } catch { /* autoplay */ }
    try { navigator.vibrate?.([200, 90, 200]); } catch { /* sin soporte */ }
    const t = setTimeout(onClose, 14000);
    return () => clearTimeout(t);
  }, []);
  const c = info.contacto || {};
  const nombre = c.nombre || c.telefono || "un cliente";
  return (
    <>
      <style>{`@keyframes ninitAsigDown{from{transform:translate(-50%,-120%);opacity:0}to{transform:translate(-50%,0);opacity:1}}`}</style>
      <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9000, width: "min(460px, calc(100vw - 24px))", background: "#FFFFFF", border: `1px solid ${L.border}`, borderLeft: `4px solid ${C.red}`, borderRadius: 14, boxShadow: "0 14px 48px rgba(0,0,0,.24)", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12, fontFamily: FONT_BODY, animation: "ninitAsigDown .28s ease" }}>
        <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", background: C.aiSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <User size={20} color={C.red} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: L.text, fontFamily: FONT_DISPLAY }}>
            {info.mas > 0 ? `Se te asignaron ${info.mas + 1} clientes` : "Se te asignó un cliente"}
          </div>
          <div style={{ fontSize: 13, color: L.muted, marginTop: 2 }}>
            {info.por ? <><b style={{ color: L.text }}>{info.por}</b> te asignó a </> : "Te asignaron a "}
            <b style={{ color: L.text }}>{nombre}</b>
            {info.mas > 0 && <> y {info.mas} {info.mas === 1 ? "cliente más" : "clientes más"}</>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={onVer}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.gradBtn, color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
              <MessageSquare size={14} /> Ver chat
            </button>
            <button onClick={onClose}
              style={{ background: "transparent", color: L.muted, border: `1.5px solid ${L.border}`, borderRadius: 9, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Después
            </button>
          </div>
        </div>
        <button onClick={onClose} title="Cerrar" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, lineHeight: 0, color: L.light }}>
          <X size={17} />
        </button>
      </div>
    </>
  );
}

// Confirmación breve para el CEO tras asignar (arriba a la derecha, se va sola).
function ToastAsignacion({ texto, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, []);
  return (
    <>
      <style>{`@keyframes ninitToastIn{from{transform:translateY(-14px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div style={{ position: "fixed", top: 18, right: 18, zIndex: 9000, background: L.text, color: "#fff", borderRadius: 11, padding: "11px 15px", display: "flex", alignItems: "center", gap: 9, fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, boxShadow: "0 10px 34px rgba(0,0,0,.28)", animation: "ninitToastIn .22s ease" }}>
        <Check size={17} color="#4ADE80" /> {texto}
      </div>
    </>
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
  const [fichaEdit,  setFichaEdit]  = useState(null);                   // contacto a editar desde el panel derecho
  const [fichaAbierta, setFichaAbierta] = useState(true);               // ficha derecha desplegada/colapsada (escritorio)
  const [asignacionRecibida, setAsignacionRecibida] = useState(null);  // banner al vendedor: { contacto, por }
  const [avisoCEO,  setAvisoCEO]  = useState("");                       // confirmación al CEO tras asignar
  const tuvoSesion   = useRef(false);
  const sesionDBId   = useRef(null);
  const heartbeatRef = useRef(null);
  const sesInicioRef = useRef(null);
  // Ref para leer los contactos actuales dentro de callbacks (evita closures viejos)
  const contactosRef = useRef([]);

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
      // Guillermo Muhana (programador): acceso TOTAL como el CEO. La elevación es
      // solo en memoria; su fila en `vendedores` sigue como "vendedor", así que
      // igual aparece en los listados y reportes de ventas.
      const nombreLc = (p?.nombre || "").trim().toLowerCase();
      if (/guillermo/.test(nombreLc) && /muhana/.test(nombreLc)) {
        p = { ...p, role: "ceo" };
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

      // Detecta EN VIVO cuando el CEO me asigna un cliente (con la app abierta)
      // y dispara el cartel "se te asignó un cliente". Con la app cerrada el
      // aviso llega por PUSH (/api/push-send con tipo:"asignacion").
      const onContactoChange = (payload) => {
        try {
          if (payload.eventType === "UPDATE" && payload.new && p?.nombre) {
            const nuevo = payload.new;
            const prev = contactosRef.current.find((x) => x.id === nuevo.id);
            const meAsignaron =
              nuevo.vendedor === p.nombre &&                 // ahora es mío
              prev && prev.vendedor !== nuevo.vendedor &&    // antes no lo era
              (nuevo.asignado_por || "") !== p.nombre;       // no me lo asigné yo
            if (meAsignaron) {
              setAsignacionRecibida({ contacto: nuevo, por: nuevo.asignado_por || null });
            }
          }
        } catch { /* ignore */ }
        cargar();
      };
      const ch = supabase.channel("contactos-feed")
        .on("postgres_changes", { event: "*", schema: "public", table: "contactos" }, onContactoChange).subscribe();

      cleanup = () => {
        supabase.removeChannel(ch);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      };
    };

    init();
    return () => cleanup();
  }, [session]);

  // Mantener el ref de contactos al día para leerlo dentro de callbacks
  useEffect(() => { contactosRef.current = contactos; }, [contactos]);

  // ── Clientes que me asignaron con el CRM CERRADO ──────────────────────
  // El cartel en vivo lo dispara el Realtime, pero si el vendedor no tenía la
  // app abierta cuando el CEO le pasó el cliente, al entrar no se enteraba de
  // nada. Acá comparamos "mis clientes" contra la lista que quedó guardada la
  // última vez (localStorage, por vendedor y dispositivo) y mostramos el mismo
  // cartel con lo que apareció nuevo. La primera vez solo sembramos la lista.
  useEffect(() => {
    if (!perfil?.nombre || getRol(perfil) === "ceo" || !contactos.length) return;
    const key = `ninit:mis-clientes:${perfil.nombre}`;
    const mios = contactos.filter((c) => c.vendedor === perfil.nombre);
    const ids = mios.map((c) => String(c.id));

    let previos = null;
    try { previos = JSON.parse(localStorage.getItem(key) || "null"); } catch { previos = null; }

    if (Array.isArray(previos)) {
      // Nuevos para mí y que no me asigné yo mismo (si falta la columna
      // asignado_por, queda undefined y el cliente cuenta igual).
      const nuevos = mios.filter((c) =>
        !previos.includes(String(c.id)) && (c.asignado_por || "") !== perfil.nombre);
      if (nuevos.length) {
        // El más reciente arriba; si llegaron varios, el cartel lo aclara.
        const orden = [...nuevos].sort((a, b) =>
          String(b.asignado_at || "").localeCompare(String(a.asignado_at || "")));
        setAsignacionRecibida({ contacto: orden[0], por: orden[0].asignado_por || null, mas: nuevos.length - 1 });
      }
    }

    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* sin espacio */ }
  }, [contactos, perfil]);

  // ── Notificaciones PUSH de nuevo mensaje del cliente ─────────
  // Con Web Push la notificación la muestra el service worker (src/sw.js),
  // así que llega AUNQUE la app/PWA esté cerrada. El disparo lo hace el
  // servidor (Supabase → /api/push-send) cuando entra un mensaje "in".
  // Acá solo (1) pedimos permiso y guardamos la suscripción del vendedor, y
  // (2) escuchamos al SW para abrir el chat cuando tocan la notificación.
  useEffect(() => {
    if (!session || !perfil) return;
    const rl = getRol(perfil);

    // Intento al cargar (si el permiso ya está dado, se suscribe solo) y
    // respaldo en el primer gesto (iOS exige gesto para pedir permiso).
    activarPush(perfil, rl);
    const onGesto = () => activarPush(perfil, rl);
    window.addEventListener("pointerdown", onGesto, { once: true });

    // Sonido propio (Car.mp3) cuando llega un mensaje con la app a la vista.
    // Lo dispara el service worker (que recibe el push siempre), así no depende
    // de Realtime. Con la app cerrada, el aviso usa el sonido del sistema (la
    // web no permite un audio propio en notificaciones de segundo plano).
    const audio = new Audio("/Car.mp3");
    audio.preload = "auto";
    // Desbloquear la reproducción en el primer gesto (política de autoplay).
    const desbloquear = () => { audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {}); };
    const gestos = ["pointerdown", "click", "touchend", "keydown"];
    gestos.forEach((e) => window.addEventListener(e, desbloquear, { once: true }));
    const sonar = () => { try { audio.currentTime = 0; audio.play().catch(() => {}); } catch { /* autoplay bloqueado */ } };

    // Mensajes desde el SW: abrir chat al tocar la notif, o reproducir el sonido.
    const onSWMsg = (ev) => {
      const t = ev.data?.type;
      if (t === "abrir-chat" && ev.data.contacto_id) {
        const cont = contactosRef.current.find((c) => c.id === ev.data.contacto_id);
        if (cont) { setActivo(cont); setVista("chat"); }
      } else if (t === "reproducir-sonido") {
        sonar();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSWMsg);

    return () => {
      window.removeEventListener("pointerdown", onGesto);
      gestos.forEach((e) => window.removeEventListener(e, desbloquear));
      navigator.serviceWorker?.removeEventListener("message", onSWMsg);
    };
  }, [session, perfil]);

  // Badge (número) en el ícono de la app: cantidad de chats con mensajes sin
  // leer. Se mantiene al día mientras la app está abierta; el service worker lo
  // actualiza cuando llega un push con la app cerrada.
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const n = contactos.reduce((a, c) => a + ((c.no_leidos || 0) > 0 ? 1 : 0), 0);
    try {
      if (n > 0) navigator.setAppBadge(n);
      else navigator.clearAppBadge?.();
    } catch { /* Badging API no disponible en este contexto */ }
  }, [contactos]);

  // Si la PWA se abrió desde una notificación (openWindow con ?chat=ID),
  // abrir ese chat cuando ya cargaron los contactos.
  useEffect(() => {
    const chatId = new URLSearchParams(window.location.search).get("chat");
    if (!chatId || !contactos.length) return;
    const cont = contactos.find((c) => String(c.id) === String(chatId));
    if (cont) {
      setActivo(cont);
      setVista("chat");
      window.history.replaceState({}, "", "/");
    }
  }, [contactos]);

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
    if (error) { console.warn("patchContacto:", error.message); return; }
    // Si cambió la etapa, avisarle a Meta (best-effort, no bloquea nada).
    notificarCambioEstado(c, campos);
  };

  // Asignar un cliente a un vendedor (solo CEO, desde el menú contextual).
  // Le "manda" el chat (columna vendedor), le deja registro de quién asignó, y
  // le avisa por PUSH (llega aunque tenga la app cerrada). Con la app abierta,
  // el cartel lo dispara el Realtime (ver onContactoChange).
  const asignarVendedor = async (c, vendedor) => {
    const nombreVend = typeof vendedor === "string" ? vendedor : vendedor?.nombre;
    if (!nombreVend || c.vendedor === nombreVend) return;
    const asignado_at = new Date().toISOString();
    const yo = perfil?.nombre || "CEO";

    updateContacto({ ...c, vendedor: nombreVend, asignado_por: yo, asignado_at }); // optimista

    // Núcleo + metadatos. Si faltan las columnas (migración no corrida), se
    // reintenta solo con `vendedor` para no romper la asignación.
    const { error } = await supabase.from("contactos")
      .update({ vendedor: nombreVend, asignado_por: yo, asignado_at }).eq("id", c.id);
    if (error) {
      const { error: error2 } = await supabase.from("contactos").update({ vendedor: nombreVend }).eq("id", c.id);
      // Si tampoco entró (permisos), no dejamos la pantalla mintiendo: se
      // vuelve al vendedor anterior y se avisa en vez de mandar el push.
      if (error2) {
        updateContacto(c);
        setAvisoCEO(`No se pudo pasar el cliente a ${nombreVend}`);
        console.warn("asignarVendedor:", error2.message);
        return;
      }
    }

    setAvisoCEO(getRol(perfil) === "ceo" ? `Cliente asignado a ${nombreVend}` : `Le pasaste el cliente a ${nombreVend}`);

    // Aviso PUSH al vendedor (app cerrada o en segundo plano).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/push-send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          tipo: "asignacion",
          contacto_id: c.id,
          vendedor: nombreVend,
          cliente: c.nombre || c.telefono || "un cliente",
          asignado_por: yo,
        }),
      });
    } catch (e) { console.warn("push asignacion:", e?.message || e); }
  };

  // Aviso "hay que llamar" — se guarda en la DB (columna requiere_llamada) para compartirlo entre vendedores
  const setLlamada = async (c, valor) => {
    updateContacto({ ...c, requiere_llamada: valor });        // optimista
    const { error } = await supabase.from("contactos").update({ requiere_llamada: valor }).eq("id", c.id);
    if (error) console.warn("setLlamada:", error.message);
  };
  const toggleLlamada = (c) => setLlamada(c, !c.requiere_llamada);
  const marcarLlamada = (c) => setLlamada(c, true);

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
    vista === "prioridad" || vista === "pedidos" || vista === "reportes" || vista === "admin" ||
    vista === "control" || vista === "diario" || vista === "agenda" || vista === "directorio" ||
    vista === "promos"
  );

  return (
    <div className={`app-layout${mobileInPanel ? " in-panel" : ""}`}
      style={{ fontFamily: FONT_BODY, background: L.bg }}>
      <FontLoader />
      {avisoCEO && <ToastAsignacion texto={avisoCEO} onClose={() => setAvisoCEO("")} />}
      {asignacionRecibida && (
        <BannerAsignacion info={asignacionRecibida}
          onVer={() => { setActivo(asignacionRecibida.contacto); setVista("chat"); setAsignacionRecibida(null); }}
          onClose={() => setAsignacionRecibida(null)} />
      )}

      {!isMobile && (
        <div className="app-rail">
          {/* El flyout es el que crece con el hover; el .app-rail de afuera
              mantiene fijos sus 72px para que el layout no se mueva. */}
          <div className="rail-flyout">
            <NavRail vista={vista} setVista={setVista} rol={rol} contactos={contactos}
              userName={userName} userEmail={userEmail} onLogout={handleLogout} />
          </div>
        </div>
      )}

      <div className="app-sidebar">
        <div style={{ flex: 1, minHeight: 0 }}>
        <Sidebar contactos={contactos} activo={activo}
          onSelect={(c) => setActivo(c)}
          onToggleDestacado={toggleDestacado}
          onPatchContacto={patchContacto}
          onAsignarVendedor={asignarVendedor}
          onToggleLlamada={toggleLlamada} onMarcarLlamada={marcarLlamada}
          onLogout={handleLogout}
          userEmail={userEmail} userName={userName}
          vista={vista} setVista={setVista} alertas={alertas}
          onDescartarAlerta={descartarAlerta} onDescartarTodasAlertas={descartarTodasAlertas}
          isMobile={isMobile} rol={rol} perfil={perfil} />
        </div>
        {/* Barra inferior: solo en la pantalla de listas. Con un panel abierto
            se oculta, porque esas pantallas son completas y taparía el cuadro
            de escritura del chat. */}
        {isMobile && !mobileInPanel && (
          <BottomNav vista={vista} setVista={setVista} rol={rol} contactos={contactos}
            userName={userName} onLogout={handleLogout} />
        )}
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
        ) : vista === "promos" && rol === "ceo" ? (
          <>
            {isMobile && <MobileBack title="Promociones" onBack={() => setVista("chat")} />}
            <Promociones userName={userName} isMobile={isMobile}
              onAbrirChat={(c) => { setActivo(c); setVista("chat"); }} />
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
        ) : vista === "prioridad" ? (
          <>
            {isMobile && <MobileBack title="Piden contacto" onBack={() => setVista("chat")} />}
            <div style={{ flex: 1, overflowY: "auto", height: "100%" }}>
              <PrioridadPanel contactos={contactos} isMobile={isMobile}
                onAbrirChat={(c) => { setActivo(c); setVista("chat"); }}
                onQuitar={(c) => patchContacto(c, { requiere_llamada: false, pide_descartado_at: new Date().toISOString() })} />
            </div>
          </>
        ) : vista === "pedidos" ? (
          <>
            {isMobile && <MobileBack title="Pedidos" onBack={() => setVista("chat")} />}
            <div className="scroll-y" style={{ flex: 1, overflowY: "auto" }}><PedidosPanel /></div>
          </>
        ) : activo ? (
          <ChatPanel contacto={activo} perfil={perfil} onUpdateContacto={updateContacto} onDeleteContacto={deleteContacto} userName={userName}
            onBack={isMobile ? () => setActivo(null) : undefined}
            isMobile={isMobile} rol={rol}
            fichaAbierta={fichaAbierta} onToggleFicha={() => setFichaAbierta((v) => !v)} />
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

      {/* Ficha del cliente: 4ª columna, solo en escritorio y con un chat abierto.
          En móvil y tablet se sigue usando el cajón (Editar en la cabecera). */}
      {!isMobile && activo && vista === "chat" && fichaAbierta && (
        <div className="app-right">
          <PanelDerecho contacto={activo} perfil={perfil} onUpdateContacto={updateContacto} onEditar={() => setFichaEdit(activo)} onColapsar={() => setFichaAbierta(false)} />
        </div>
      )}
      {/* Solapa lateral: aparece pegada al borde derecho cuando la ficha está
          oculta. Al tocarla, se despliega de nuevo. Solo en escritorio (>1180px). */}
      {!isMobile && activo && vista === "chat" && !fichaAbierta && (
        <button className="ficha-tab" onClick={() => setFichaAbierta(true)} title="Mostrar ficha del cliente"
          style={{ position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", zIndex: 150,
            background: C.gradBtn, color: "#fff", border: "none", borderRadius: "12px 0 0 12px",
            padding: "16px 6px", cursor: "pointer", boxShadow: "-3px 0 16px rgba(79,70,229,.28)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "padding .15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.paddingLeft = "10px"; }}
          onMouseLeave={(e) => { e.currentTarget.style.paddingLeft = "6px"; }}>
          <ChevronLeft size={18} />
          <span style={{ writingMode: "vertical-rl", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, letterSpacing: 1.5 }}>FICHA</span>
        </button>
      )}
      {fichaEdit && (
        <ContactoDrawer contacto={fichaEdit} onClose={() => setFichaEdit(null)} onSave={updateContacto} />
      )}

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
