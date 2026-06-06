import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell, Search, LogOut, MessageSquare, BarChart2, Package,
  Pencil, Bot, User, Calendar, Send, X, Check,
  Sparkles, Phone, Mail, Building2, MapPin, FileText,
  AlertCircle, Clock, ChevronDown, ChevronLeft, Zap, ShoppingBag, Shield, Trash2,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { SiGmail, SiGoogleads } from "react-icons/si";
import PedidosPanel, { NuevoPedidoModal, imprimirPedido } from "./Pedidos";
import {
  supabase, N8N_SEND_WEBHOOK, LOGO_URL, C, FONT_DISPLAY, FONT_BODY,
  VENDEDORES, ESTADOS, calcularAlertas, getRol,
} from "./lib";
import Reportes from "./Reportes";
import AdminPanel from "./AdminPanel";

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

// Prompt del sistema para Grok
const GROK_SYSTEM = `Sos el Asistente Ejecutivo de NINIT Group — una IA de alto rendimiento integrada al CRM de la empresa. Tu función es potenciar la productividad de Nicolás: ayudarlo a cerrar más ventas, gestionar su pipeline con precisión y tomar decisiones rápidas basadas en datos reales.

EMPRESA:
NINIT Group es una empresa premium de alquiler de baños químicos y remolques sanitarios de lujo en Miami. Opera con estándares de excelencia, rapidez y atención al cliente de primer nivel.

CAPACIDADES EN EL CRM:
- Gestión de contactos: registrar, editar, actualizar datos de clientes (nombre, email, empresa, teléfono, notas)
- Pipeline de ventas: mover leads entre estados (Nuevo → Contactado → Interesado → Pendiente → Vendido / Perdido / En conversación / Pedido)
- Seguimientos: agendar recordatorios con fecha y hora exacta para no perder ningún lead
- Pedidos: crear y gestionar pedidos vinculados a cada contacto
- WhatsApp: activar o desactivar el bot automático por contacto, cambiar a atención manual cuando se necesita
- Reportes: interpretar métricas de ventas, conversión por estado, actividad por vendedor
- Alertas: identificar leads sin respuesta, seguimientos vencidos, leads sin asignar

ESTILO DE RESPUESTA:
- Directo, ejecutivo y orientado a la acción
- Respuestas cortas cuando la pregunta es simple; detalladas cuando el contexto lo requiere
- Siempre en español
- Si el usuario comparte datos de un cliente, ayudalo a procesarlos de inmediato
- Si detectás una oportunidad de venta o un riesgo en el pipeline, mencionalo proactivamente
- Podés ayudar con cualquier tarea de negocio, no solo del CRM

CONTEXTO TÉCNICO:
- Base de datos: Supabase (contactos, mensajes, pedidos en tiempo real)
- WhatsApp integrado vía n8n con IA (bot Gemini para respuestas automáticas)
- Reportes exportables en PDF y CSV`;

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
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState("");
  const [err, setErr]       = useState("");
  const [loading, setLoad]  = useState(false);

  const handleLogin = async () => {
    setErr(""); setLoad(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass.trim() });
    if (error) setErr(error.message || "Email o contraseña incorrectos.");
    setLoad(false);
  };

  return (
    <div className="login-scroll" style={{ height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", background: "#fff", fontFamily: FONT_BODY, padding: "56px 20px 48px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <img
            src={LOGO_URL}
            alt="NINIT Group"
            style={{ width: "100%", maxWidth: 160, height: "auto", display: "block" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <div style={{ height: 1, width: 28, background: L.border }} />
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: 4, color: L.light, textTransform: "uppercase" }}>CRM</span>
            <div style={{ height: 1, width: 28, background: L.border }} />
          </div>
        </div>

        <div>
          {[
            { label: "Email", type: "email", val: email, set: setEmail, ph: "tu@ninitgroup.com" },
            { label: "Contraseña", type: "password", val: pass, set: setPass, ph: "••••••••" },
          ].map(({ label, type, val, set, ph }) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</label>
              <input type={type} value={val} onChange={(e) => set(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder={ph}
                style={{ width: "100%", boxSizing: "border-box", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${L.border}`, fontSize: 14, fontFamily: FONT_BODY, color: L.text, outline: "none", background: L.soft, transition: "border-color .2s" }} />
            </div>
          ))}
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
    nota_seguimiento: contacto.nota_seguimiento || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true); setErr("");
    const { error } = await supabase.from("contactos").update(form).eq("id", contacto.id);
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
          {fields.map(({ label, key, icon, type, ph }) => (
            <div key={key} style={{ marginBottom: 18 }}>
              <label style={labelSt}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{icon} {label}</span></label>
              <input type={type} value={form[key]} onChange={set(key)} placeholder={ph} style={inputSt} />
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
              {contacto.canal === "email" ? "Email" : "Teléfono WhatsApp"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: L.text }}>
              {contacto.canal === "email" ? contacto.email : contacto.telefono}
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
// ASISTENTE IA
// ============================================================
function AIAsistente({ contactoActivo }) {
  const isMobile = useIsMobile();
  const [open, setOpen]         = useState(false);
  const [msgs, setMsgs]         = useState([
    { from: "ai", text: `Buenos días, Nicolás.\n\nSoy tu asistente ejecutivo de IA — tengo acceso completo al contexto de tu CRM y estoy listo para ayudarte a cerrar más deals.\n\nPuedo gestionar contactos, mover leads en el pipeline, analizar tu embudo de ventas, agendar seguimientos y mucho más. Si tenés un cliente abierto, también veo su información en tiempo real.\n\n¿En qué arrancamos?` },
  ]);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const enviar = async () => {
    const q = input.trim();
    if (!q || typing) return;
    const historial = [...msgs];
    setMsgs((p) => [...p, { from: "user", text: q }]);
    setInput(""); setTyping(true);

    const GROK_KEY = import.meta.env.VITE_GROK_API_KEY;
    if (!GROK_KEY) {
      setMsgs((p) => [...p, { from: "ai", text: "⚠️ Clave de IA no configurada. Agregá VITE_GROK_API_KEY en Vercel." }]);
      setTyping(false);
      return;
    }
    try {
      let sysExtra = "";
      if (contactoActivo) {
        const est = ESTADOS[contactoActivo.estado];
        sysExtra = `\n\nCONTACTO ABIERTO AHORA: ${contactoActivo.nombre || contactoActivo.telefono} | Estado: ${est?.label || contactoActivo.estado} | Vendedor: ${contactoActivo.vendedor || "sin asignar"} | Tel: ${contactoActivo.telefono}`;
      }
      const apiMsgs = [
        { role: "system", content: GROK_SYSTEM + sysExtra },
        ...historial.map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
        { role: "user", content: q },
      ];
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROK_KEY}` },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: apiMsgs, max_tokens: 600 }),
      });
      if (res.ok) {
        const data = await res.json();
        setMsgs((p) => [...p, { from: "ai", text: data.choices[0].message.content }]);
      } else {
        const err = await res.json().catch(() => ({}));
        setMsgs((p) => [...p, { from: "ai", text: `Error IA (${res.status}): ${err?.error?.message || "Verificá tu clave en console.groq.com"}` }]);
      }
    } catch (e) {
      setMsgs((p) => [...p, { from: "ai", text: `Error de conexión con la IA: ${e.message}` }]);
    }
    setTyping(false);
  };

  const sugerencias = ["¿Cómo asigno un vendedor?", "¿Cómo funciona el bot?", "¿Cómo veo reportes?"];

  return (
    <>
      {/* Botón flotante */}
      <button onClick={() => setOpen((v) => !v)} title="Asistente IA"
        style={{ position: "fixed", bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom))" : 84, right: isMobile ? 16 : 24, width: isMobile ? 48 : 54, height: isMobile ? 48 : 54, borderRadius: "50%", background: open ? L.muted : C.red, border: "none", color: "#fff", cursor: "pointer", boxShadow: `0 4px 20px rgba(185,28,28,.45)`, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", transition: "background .25s, transform .2s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div style={{ position: "fixed", bottom: isMobile ? "calc(132px + env(safe-area-inset-bottom))" : 150, right: 16, ...(isMobile ? { left: 16 } : { width: 350 }), height: isMobile ? "72dvh" : 490, maxHeight: isMobile ? "calc(100% - 120px)" : 490, background: L.white, borderRadius: isMobile ? "20px 20px 16px 16px" : 20, boxShadow: "0 16px 60px rgba(0,0,0,.22)", border: `1px solid ${L.border}`, zIndex: 299, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: FONT_BODY }}>
          {/* Header */}
          <div style={{ background: C.red, color: "#fff", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: `3px solid ${C.gold}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <img src={LOGO_URL} alt="NM" style={{ height: 48, objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: 0.3, lineHeight: 1.2 }}>Asistente IA</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", marginTop: 2 }}>NINIT Group · {typing ? "Escribiendo…" : "Online"}</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div className="scroll-y" style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, background: L.bg }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.from === "user" ? "flex-end" : "flex-start" }}>
                {m.from === "ai" && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                    <Sparkles size={14} color="#fff" />
                  </div>
                )}
                <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: m.from === "user" ? "14px 3px 14px 14px" : "3px 14px 14px 14px", background: m.from === "user" ? C.red : L.white, color: m.from === "user" ? "#fff" : L.text, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap", boxShadow: "0 1px 4px rgba(0,0,0,.07)", border: m.from === "user" ? "none" : `1px solid ${L.border}` }}>
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkles size={14} color="#fff" />
                </div>
                <div style={{ padding: "10px 16px", background: L.white, borderRadius: "3px 14px 14px 14px", border: `1px solid ${L.border}` }}>
                  <span style={{ color: C.red, fontWeight: 700, letterSpacing: 3, fontSize: 16 }}>···</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Sugerencias */}
          {msgs.length <= 1 && !typing && (
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 6, flexWrap: "wrap", background: L.white }}>
              {sugerencias.map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  style={{ fontSize: 11, padding: "5px 11px", borderRadius: 20, border: `1.5px solid ${L.border}`, background: L.soft, color: C.red, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600 }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 8, background: L.white }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder="Preguntame algo…"
              style={{ flex: 1, padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, outline: "none", color: L.text, background: L.soft }} />
            <button onClick={enviar} disabled={typing}
              style={{ background: typing ? L.light : C.red, border: "none", color: "#fff", borderRadius: 10, padding: "9px 14px", cursor: typing ? "default" : "pointer", display: "flex", alignItems: "center" }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
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
// SIDEBAR
// ============================================================
function Sidebar({ contactos, activo, onSelect, onLogout, userEmail, userName, vista, setVista, alertas, isMobile, rol }) {
  const [filtro, setFiltro]       = useState("todos");
  const [busqueda, setBusqueda]   = useState("");
  const [canal, setCanal]         = useState("todos");
  const [quickFiltro, setQuick]   = useState(null);
  const [tipoFiltro, setTipo]     = useState(null);

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
        <img src={LOGO_URL} alt="NINIT Group" style={{ height: 48, objectFit: "contain" }} />
        <AlertasBtn alertas={alertas} onSelect={(c) => { setVista("chat"); onSelect(c); }} />
      </div>

      {/* ── Tabs ── */}
      <div className="strip" style={{ display: "flex", borderBottom: `1px solid ${L.border}`, overflowX: "auto" }}>
        {[
          ["chat",     <MessageSquare size={13} />, "Chats"],
          ["pedidos",  <Package size={13} />,       "Pedidos"],
          ["reportes", <BarChart2 size={13} />,     "Reportes"],
          ...(rol === "admin" ? [["admin", <Shield size={13} />, "Admin"]] : []),
        ].map(([k, icon, l]) => (
          <button key={k} onClick={() => setVista(k)}
            style={{ flex: 1, border: "none", cursor: "pointer", padding: "11px 0", fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4, transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, whiteSpace: "nowrap", minWidth: 60, color: vista === k ? C.red : L.muted, background: vista === k ? "#EFF6FF" : "transparent", borderBottom: vista === k ? `2px solid ${C.red}` : "2px solid transparent" }}>
            {icon} {l}
          </button>
        ))}
      </div>

      {vista === "chat" && (
        <>
          {/* ── Canal buttons ── */}
          <div style={{ padding: "10px 12px 8px", borderBottom: `1px solid ${L.border}`, display: "flex", gap: 6 }}>
            {[
              { key: "whatsapp",   label: "WhatsApp",  icon: <FaWhatsapp size={22} />,   color: "#25D366", bg: "#F0FDF4" },
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
                    {c.canal === "email"
                      ? <div style={{ position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: "50%", background: "#3B82F6", border: `2px solid ${L.white}` }} title="Canal Email" />
                      : !c.bot_activo && <div style={{ position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: "50%", background: "#F59E0B", border: `2px solid ${L.white}` }} title="Atendido por agente" />
                    }
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
  const endRef = useRef(null);

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

    // 2) Enviar por WhatsApp vía n8n (no bloquea si falla)
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
      <div style={{ padding: isMobile ? "10px 12px" : "14px 22px", borderTop: `1px solid ${L.border}`, background: L.white, display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
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
  const [contactos, setContactos] = useState([]);
  const [activo,    setActivo]    = useState(null);
  const [vista,     setVista]     = useState("chat");
  const [ready,     setReady]     = useState(false);
  // Ref para evitar mostrar login si hubo sesión previa y solo es un refresh
  const tuvoSesion = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Solo actualizar sesión en eventos explícitos, evitar flashes durante refresh
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const rolActual  = getRol(session.user.email);
    const userNombre = session.user.email.split("@")[0].replace(/^\w/, m => m.toUpperCase());
    const cargar = async () => {
      let query = supabase.from("contactos").select("*").order("updated_at", { ascending: false });
      // Vendedor solo ve los contactos que tiene asignados
      if (rolActual === "vendedor") {
        query = query.eq("vendedor", userNombre);
      }
      const { data } = await query;
      setContactos(data || []);
    };
    cargar();
    const ch = supabase.channel("contactos-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "contactos" }, cargar).subscribe();
    return () => supabase.removeChannel(ch);
  }, [session]);

  const updateContacto = (c) => {
    setContactos((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    if (activo?.id === c.id) setActivo(c);
  };

  const deleteContacto = (id) => {
    setContactos((prev) => prev.filter((x) => x.id !== id));
    setActivo(null);
  };

  if (session) tuvoSesion.current = true;
  if (!ready) return null;
  // No mostrar login si tuvo sesión previa y solo está refrescando token
  if (!session && !tuvoSesion.current) return (<><FontLoader /><Login /></>);
  if (!session) return null; // espera silenciosa si tuvo sesión (evita flash de login)

  const userEmail = session.user.email;
  const userName  = userEmail.split("@")[0].replace(/^\w/, (m) => m.toUpperCase());
  const rol       = getRol(userEmail); // "admin" solo para cristian, "vendedor" para el resto
  const alertas   = calcularAlertas(contactos);

  // En mobile: mostramos sidebar O panel, no ambos a la vez
  const mobileInPanel = isMobile && (activo !== null || vista === "pedidos" || vista === "reportes" || vista === "admin");

  return (
    // CSS media queries en index.html controlan qué panel es visible en mobile
    // .in-panel = hay panel activo → ocultar sidebar, mostrar app-main
    <div className={`app-layout${mobileInPanel ? " in-panel" : ""}`}
      style={{ fontFamily: FONT_BODY, background: L.bg }}>
      <FontLoader />

      {/* Sidebar — CSS lo oculta en mobile cuando hay .in-panel */}
      <div className="app-sidebar">
        <Sidebar contactos={contactos} activo={activo}
          onSelect={(c) => setActivo(c)}
          onLogout={() => supabase.auth.signOut()}
          userEmail={userEmail} userName={userName}
          vista={vista} setVista={setVista} alertas={alertas}
          isMobile={isMobile} rol={rol} />
      </div>

      {/* Panel principal — CSS lo muestra en mobile sólo con .in-panel */}
      <div className="app-main">
        {vista === "admin" && rol === "admin" ? (
          <>
            {isMobile && <MobileBack title="Admin" onBack={() => setVista("chat")} />}
            <AdminPanel userName={userName} isMobile={isMobile} />
          </>
        ) : vista === "reportes" ? (
          <>
            {isMobile && <MobileBack title="Reportes" onBack={() => setVista("chat")} />}
            <div className="scroll-y" style={{ flex: 1, overflowY: "auto" }}><Reportes /></div>
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
            <img src={LOGO_URL} alt="NINIT Group" style={{ height: 200, objectFit: "contain" }} />
            <div>
              <div style={{ color: L.text, fontSize: 20, fontFamily: FONT_DISPLAY, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700, textAlign: "center" }}>NINIT Group CRM</div>
              <div style={{ color: L.muted, fontSize: 14, textAlign: "center", marginTop: 8 }}>
                {rol === "admin" ? `Bienvenido, ${userName} · Panel de administración disponible` : `Seleccioná una conversación para comenzar`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center", padding: "0 20px" }}>
              {[[<MessageSquare size={16} />, "Chats en tiempo real"], [<Bot size={16} />, "Bot WhatsApp integrado"], [<BarChart2 size={16} />, "Reportes y métricas"]].map(([icon, txt]) => (
                <div key={txt} style={{ padding: "10px 18px", background: L.white, border: `1px solid ${L.border}`, borderRadius: 12, fontSize: 13, color: L.muted, display: "flex", alignItems: "center", gap: 8, fontWeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
                  <span style={{ color: C.red }}>{icon}</span> {txt}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AIAsistente contactoActivo={activo} />
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
