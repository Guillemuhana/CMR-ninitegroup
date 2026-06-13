import { useState, useEffect, useMemo } from "react";
import { Search, Download, Phone, Mail, Users, Filter, X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { SiMessenger, SiGoogleads } from "react-icons/si";
import { supabase, C, FONT_DISPLAY, FONT_BODY, ESTADOS, exportarCSV, fmtFechaLarga } from "./lib";

const L = {
  bg: "#F5F6F8", white: "#FFFFFF", border: "#E4E8ED",
  text: "#0F172A", muted: "#64748B", light: "#94A3B8",
  soft: "#F1F5F9", hover: "#EFF6FF",
};

const CANAL_INFO = {
  whatsapp:   { label: "WhatsApp",   color: "#25D366", icon: <FaWhatsapp size={13} /> },
  messenger:  { label: "Messenger",  color: "#0099FF", icon: <SiMessenger size={13} /> },
  email:      { label: "Email",      color: "#EA4335", icon: <Mail size={13} /> },
  google_ads: { label: "Google Ads", color: "#FBBC04", icon: <SiGoogleads size={13} /> },
};

function CanalBadge({ canal }) {
  const info = CANAL_INFO[canal] || { label: canal || "WhatsApp", color: "#25D366", icon: <Phone size={13} /> };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: info.color + "18", color: info.color, fontSize: 11.5, fontWeight: 700 }}>
      {info.icon} {info.label}
    </span>
  );
}

function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { label: estado || "Nuevo", color: "#1e5a8a", bg: "#d6e8f5" };
  return (
    <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 20, background: e.bg, color: e.color, fontSize: 11, fontWeight: 700 }}>
      {e.label}
    </span>
  );
}

export default function Directorio() {
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busqueda, setBusqueda]   = useState("");
  const [canal, setCanal]         = useState("todos");
  const [soloActivos, setSoloActivos] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("contactos")
        .select("id, nombre, telefono, email, messenger_id, canal, estado, vendedor, created_at, tipo")
        .order("created_at", { ascending: false });
      setContactos(data || []);
      setLoading(false);
    })();
  }, []);

  const lista = useMemo(() => {
    return contactos.filter((c) => {
      const q = busqueda.toLowerCase();
      const matchBusq = !q
        || (c.nombre || "").toLowerCase().includes(q)
        || (c.telefono || "").includes(q)
        || (c.email || "").toLowerCase().includes(q)
        || (c.messenger_id || "").includes(q);
      const matchCanal = canal === "todos" || (c.canal || "whatsapp") === canal;
      const matchActivo = !soloActivos || (c.estado !== "perdido" && c.estado !== "cerrado");
      return matchBusq && matchCanal && matchActivo;
    });
  }, [contactos, busqueda, canal, soloActivos]);

  // Estadísticas
  const stats = useMemo(() => {
    const total  = contactos.length;
    const wa     = contactos.filter((c) => (c.canal || "whatsapp") === "whatsapp").length;
    const msg    = contactos.filter((c) => c.canal === "messenger").length;
    const em     = contactos.filter((c) => c.canal === "email").length;
    const gads   = contactos.filter((c) => c.canal === "google_ads").length;
    const activos = contactos.filter((c) => c.estado !== "perdido" && c.estado !== "cerrado").length;
    return { total, wa, msg, em, gads, activos };
  }, [contactos]);

  const exportar = () => {
    const filas = lista.map((c) => ({
      Nombre:    c.nombre || "",
      Teléfono:  c.telefono || c.messenger_id || "",
      Email:     c.email || "",
      Canal:     CANAL_INFO[c.canal]?.label || c.canal || "WhatsApp",
      Estado:    ESTADOS[c.estado]?.label || c.estado || "",
      Vendedor:  c.vendedor || "",
      Ingresó:   c.created_at ? fmtFechaLarga(c.created_at) : "",
    }));
    exportarCSV(filas, "directorio-ninit-group.csv");
  };

  const exportarSeleccionados = () => {
    const filas = lista
      .filter((c) => seleccionados.has(c.id))
      .map((c) => ({
        Nombre:   c.nombre || "",
        Teléfono: c.telefono || c.messenger_id || "",
        Email:    c.email || "",
        Canal:    CANAL_INFO[c.canal]?.label || c.canal || "WhatsApp",
        Estado:   ESTADOS[c.estado]?.label || c.estado || "",
        Vendedor: c.vendedor || "",
        Ingresó:  c.created_at ? fmtFechaLarga(c.created_at) : "",
      }));
    exportarCSV(filas, "campania-ninit-group.csv");
  };

  const toggleSel = (id) => setSeleccionados((prev) => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const toggleTodos = () => {
    if (seleccionados.size === lista.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(lista.map((c) => c.id)));
    }
  };

  const statCard = (label, value, color) => (
    <div style={{ background: L.white, borderRadius: 12, padding: "14px 18px", border: `1px solid ${L.border}`, minWidth: 100, flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.red, fontFamily: FONT_DISPLAY }}>{value}</div>
      <div style={{ fontSize: 11, color: L.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: L.bg, fontFamily: FONT_BODY }}>

      {/* Header */}
      <div style={{ padding: "18px 24px 14px", background: L.white, borderBottom: `1px solid ${L.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20, color: L.text, display: "flex", alignItems: "center", gap: 9 }}>
              <Users size={20} color={C.red} /> Directorio de Contactos
            </div>
            <div style={{ fontSize: 12.5, color: L.muted, marginTop: 3 }}>
              Base de datos completa · {stats.total} contactos registrados
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {seleccionados.size > 0 && (
              <button onClick={exportarSeleccionados}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, border: "none", background: "#16A34A", color: "#fff", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                <Download size={14} /> Exportar {seleccionados.size} seleccionados
              </button>
            )}
            <button onClick={exportar}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, border: `1.5px solid ${C.red}`, background: L.white, color: C.red, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Download size={14} /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {statCard("Total", stats.total, C.red)}
          {statCard("Activos", stats.activos, "#16A34A")}
          {statCard("WhatsApp", stats.wa, "#25D366")}
          {stats.msg > 0 && statCard("Messenger", stats.msg, "#0099FF")}
          {stats.em > 0 && statCard("Email", stats.em, "#EA4335")}
          {stats.gads > 0 && statCard("Google Ads", stats.gads, "#FBBC04")}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: L.muted }} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, teléfono o email..."
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 9, border: `1.5px solid ${L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, color: L.text, outline: "none", background: L.soft }} />
            {busqueda && <button onClick={() => setBusqueda("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: L.muted }}><X size={13} /></button>}
          </div>

          <select value={canal} onChange={(e) => setCanal(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 9, border: `1.5px solid ${L.border}`, fontSize: 13, fontFamily: FONT_BODY, color: L.text, background: L.white, cursor: "pointer", outline: "none" }}>
            <option value="todos">Todos los canales</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
            <option value="email">Email</option>
            <option value="google_ads">Google Ads</option>
          </select>

          <button onClick={() => setSoloActivos((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1.5px solid ${soloActivos ? C.red : L.border}`, background: soloActivos ? "#FFF0F0" : L.white, color: soloActivos ? C.red : L.muted, fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 12.5, cursor: "pointer", transition: "all .15s" }}>
            <Filter size={13} /> Solo activos
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: L.muted, fontSize: 14 }}>Cargando contactos...</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: L.muted, fontSize: 14 }}>No hay contactos que coincidan</div>
        ) : (
          <div style={{ background: L.white, borderRadius: 14, border: `1px solid ${L.border}`, overflow: "hidden" }}>
            {/* Cabecera tabla */}
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 160px 130px 155px 120px 110px", gap: 0, padding: "10px 16px", background: L.soft, borderBottom: `1px solid ${L.border}` }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <input type="checkbox" checked={seleccionados.size === lista.length && lista.length > 0}
                  onChange={toggleTodos} style={{ cursor: "pointer", width: 15, height: 15 }} />
              </div>
              {["Contacto", "Teléfono / Email", "Canal", "Estado", "Vendedor", "Ingresó"].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</div>
              ))}
            </div>

            {/* Filas */}
            {lista.map((c, i) => {
              const contacto  = c.nombre || c.telefono || c.email || c.messenger_id || "Sin nombre";
              const numero    = c.telefono || c.messenger_id || "";
              const emailStr  = c.email || "";
              const sel       = seleccionados.has(c.id);
              return (
                <div key={c.id}
                  style={{ display: "grid", gridTemplateColumns: "40px 1fr 160px 130px 155px 120px 110px", gap: 0, padding: "12px 16px", borderBottom: i < lista.length - 1 ? `1px solid ${L.border}` : "none", background: sel ? "#EFF6FF" : "transparent", transition: "background .1s", alignItems: "center" }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = L.hover; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                  <div>
                    <input type="checkbox" checked={sel} onChange={() => toggleSel(c.id)} style={{ cursor: "pointer", width: 15, height: 15 }} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contacto}</div>
                  <div style={{ fontSize: 13, color: L.muted }}>
                    {numero && <div style={{ display: "flex", alignItems: "center", gap: 5 }}><Phone size={11} />{numero}</div>}
                    {emailStr && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: numero ? 3 : 0 }}><Mail size={11} />{emailStr}</div>}
                    {!numero && !emailStr && <span style={{ color: L.light, fontSize: 12 }}>—</span>}
                  </div>
                  <div><CanalBadge canal={c.canal} /></div>
                  <div><EstadoBadge estado={c.estado} /></div>
                  <div style={{ fontSize: 13, color: L.muted }}>{c.vendedor || <span style={{ color: L.light }}>—</span>}</div>
                  <div style={{ fontSize: 12, color: L.light }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info */}
        {!loading && lista.length > 0 && (
          <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12.5, color: L.light }}>
            {lista.length} contacto{lista.length !== 1 ? "s" : ""} · {seleccionados.size > 0 ? `${seleccionados.size} seleccionado${seleccionados.size !== 1 ? "s" : ""}` : "Seleccioná para exportar una lista para campaña"}
          </div>
        )}
      </div>
    </div>
  );
}
