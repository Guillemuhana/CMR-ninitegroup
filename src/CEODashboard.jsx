import { useState, useEffect } from "react";
import { supabase, C, FONT_DISPLAY, FONT_BODY, fmtDuracion, fmtFechaLarga } from "./lib";
import {
  Users, Clock, MessageSquare, ShoppingBag, TrendingUp,
  ChevronDown, ChevronUp, BookOpen, Activity, BarChart2, RefreshCw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const L = {
  bg:     "#F5F6F8",
  white:  "#FFFFFF",
  border: "#E4E8ED",
  text:   "#0F172A",
  muted:  "#64748B",
  light:  "#94A3B8",
  soft:   "#F1F5F9",
};

const ANIMOS = {
  excelente: { emoji: "🚀", label: "Excelente", color: "#15803D" },
  bien:      { emoji: "😊", label: "Bien",      color: "#3a8dc2" },
  neutro:    { emoji: "😐", label: "Normal",    color: "#64748B" },
  mal:       { emoji: "😔", label: "Difícil",   color: "#D97706" },
  muy_mal:   { emoji: "😤", label: "Mal día",   color: "#DC2626" },
};

const COLORES_VENDEDOR = ["#3a8dc2", "#7C3AED", "#15803D", "#D97706", "#0E7490", "#B91C1C"];

function KPICard({ icon, label, value, color = C.red, sub }) {
  return (
    <div style={{ background: L.white, borderRadius: 14, padding: "18px 22px", border: `1px solid ${L.border}`, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: L.muted, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONT_DISPLAY }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: L.text, fontFamily: FONT_DISPLAY, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: L.muted }}>{sub}</div>}
    </div>
  );
}

function TabBtn({ label, active, onClick, icon }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: `1.5px solid ${active ? C.red : L.border}`, background: active ? "#FEF2F2" : L.white, color: active ? C.red : L.muted, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all .15s", textTransform: "uppercase", letterSpacing: 0.3 }}>
      {icon} {label}
    </button>
  );
}

export default function CEODashboard({ isMobile }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [tab, setTab]                 = useState("resumen");
  const [vendedores, setVendedores]   = useState([]);
  const [statsVend, setStatsVend]     = useState({});
  const [diarios, setDiarios]         = useState([]);
  const [diariosAbiertos, setAbiertos] = useState({});
  const [fechaDiario, setFechaDiario] = useState(hoy);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefresh]      = useState(0);

  // ── Cargar vendedores activos ─────────────────────────────
  useEffect(() => {
    supabase.from("vendedores").select("*").eq("activo", true).order("nombre")
      .then(({ data }) => setVendedores((data || []).filter((v) => v.role === "vendedor")));
  }, [refreshKey]);

  // ── Stats por vendedor ─────────────────────────────────────
  useEffect(() => {
    if (vendedores.length === 0) { setLoading(false); return; }

    const fetchStats = async () => {
      setLoading(true);
      const inicioDia    = new Date(); inicioDia.setHours(0, 0, 0, 0);
      const inicioSemana = new Date(); inicioSemana.setDate(inicioSemana.getDate() - 6); inicioSemana.setHours(0, 0, 0, 0);

      const nuevasStats = {};

      await Promise.all(vendedores.map(async (v) => {
        const [
          { count: msgsHoy },
          { count: msgsSem },
          { count: contactosTotales },
          { count: pedidosMes },
          { count: vendidos },
          { data: sesHoy },
          { data: sesSem },
          { data: contactosVend },
        ] = await Promise.all([
          supabase.from("mensajes").select("*", { count: "exact", head: true })
            .eq("agente", v.nombre).eq("direccion", "out").gte("created_at", inicioDia.toISOString()),
          supabase.from("mensajes").select("*", { count: "exact", head: true })
            .eq("agente", v.nombre).eq("direccion", "out").gte("created_at", inicioSemana.toISOString()),
          supabase.from("contactos").select("*", { count: "exact", head: true })
            .eq("vendedor", v.nombre),
          supabase.from("pedidos").select("*", { count: "exact", head: true })
            .eq("vendedor", v.nombre).gte("created_at", inicioSemana.toISOString()),
          supabase.from("contactos").select("*", { count: "exact", head: true })
            .eq("vendedor", v.nombre).eq("estado", "vendido"),
          supabase.from("sesiones_vendedor").select("duracion_seg")
            .eq("vendedor_id", v.id).eq("fecha", hoy),
          supabase.from("sesiones_vendedor").select("duracion_seg, fecha")
            .eq("vendedor_id", v.id).gte("fecha", inicioSemana.toISOString().slice(0, 10)),
          supabase.from("contactos").select("ultimo_in_at, ultimo_out_at")
            .eq("vendedor", v.nombre).not("ultimo_in_at", "is", null).not("ultimo_out_at", "is", null),
        ]);

        const tiempoHoy = (sesHoy || []).reduce((a, s) => a + (s.duracion_seg || 0), 0);
        const tiempoSem = (sesSem || []).reduce((a, s) => a + (s.duracion_seg || 0), 0);

        let tiempoRespProm = null;
        if (contactosVend?.length > 0) {
          const tiempos = contactosVend
            .map((c) => {
              const diff = new Date(c.ultimo_out_at) - new Date(c.ultimo_in_at);
              return diff > 0 ? diff : null;
            })
            .filter(Boolean);
          if (tiempos.length > 0) {
            tiempoRespProm = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 1000);
          }
        }

        nuevasStats[v.id] = {
          msgsHoy: msgsHoy || 0,
          msgsSem: msgsSem || 0,
          contactosTotales: contactosTotales || 0,
          pedidosMes: pedidosMes || 0,
          vendidos: vendidos || 0,
          tiempoHoy,
          tiempoSem,
          tiempoRespProm,
          convRate: contactosTotales > 0 ? Math.round(((vendidos || 0) / contactosTotales) * 100) : 0,
        };
      }));

      setStatsVend(nuevasStats);
      setLoading(false);
    };

    fetchStats();
  }, [vendedores, hoy, refreshKey]);

  // ── Diarios ───────────────────────────────────────────────
  useEffect(() => {
    const fetchDiarios = async () => {
      const { data } = await supabase
        .from("diario_vendedor")
        .select("*")
        .eq("fecha", fechaDiario)
        .order("vendedor_nombre");
      setDiarios(data || []);
    };
    fetchDiarios();
  }, [fechaDiario, refreshKey]);

  const msToStr = (ms) => {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "< 1 min";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60 > 0 ? (m % 60) + "m" : ""}`.trim();
  };

  // ── Datos para gráficos ───────────────────────────────────
  const chartMensajes = vendedores.map((v, i) => ({
    nombre: v.nombre.split(" ")[0],
    hoy: statsVend[v.id]?.msgsHoy || 0,
    semana: statsVend[v.id]?.msgsSem || 0,
    color: COLORES_VENDEDOR[i % COLORES_VENDEDOR.length],
  }));

  const chartTiempo = vendedores.map((v, i) => ({
    nombre: v.nombre.split(" ")[0],
    hoyMin: Math.round((statsVend[v.id]?.tiempoHoy || 0) / 60),
    semMin: Math.round((statsVend[v.id]?.tiempoSem || 0) / 60),
    color: COLORES_VENDEDOR[i % COLORES_VENDEDOR.length],
  }));

  const chartConversion = vendedores.map((v, i) => ({
    nombre: v.nombre.split(" ")[0],
    pct: statsVend[v.id]?.convRate || 0,
    color: COLORES_VENDEDOR[i % COLORES_VENDEDOR.length],
  }));

  const totalMsgsHoy = Object.values(statsVend).reduce((a, s) => a + s.msgsHoy, 0);
  const totalContactos = Object.values(statsVend).reduce((a, s) => a + s.contactosTotales, 0);
  const totalPedidos = Object.values(statsVend).reduce((a, s) => a + s.pedidosMes, 0);
  const mejorRespVend = vendedores.reduce((best, v) => {
    const t = statsVend[v.id]?.tiempoRespProm;
    if (t && (!best || t < best.t)) return { nombre: v.nombre.split(" ")[0], t };
    return best;
  }, null);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: isMobile ? "16px 14px" : "24px 32px", background: L.bg, fontFamily: FONT_BODY }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: isMobile ? 20 : 26, color: L.text }}>
            Panel de Control
          </div>
          <div style={{ fontSize: 13, color: L.muted, marginTop: 2 }}>
            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <button
          onClick={() => setRefresh((v) => v + 1)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${L.border}`, background: L.white, color: L.muted, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "all .15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = L.white; }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <TabBtn label="Resumen" icon={<BarChart2 size={13} />} active={tab === "resumen"} onClick={() => setTab("resumen")} />
        <TabBtn label="Vendedores" icon={<Users size={13} />} active={tab === "vendedores"} onClick={() => setTab("vendedores")} />
        <TabBtn label="Diarios" icon={<BookOpen size={13} />} active={tab === "diarios"} onClick={() => setTab("diarios")} />
        <TabBtn label="Actividad" icon={<Activity size={13} />} active={tab === "actividad"} onClick={() => setTab("actividad")} />
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: L.muted, fontSize: 14 }}>Cargando datos…</div>
      )}

      {!loading && (
        <>
          {/* ══════════════ TAB RESUMEN ══════════════ */}
          {tab === "resumen" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                <KPICard icon={<MessageSquare size={16} />} label="Mensajes hoy (equipo)" value={totalMsgsHoy} color={C.red} />
                <KPICard icon={<Users size={16} />} label="Contactos totales" value={totalContactos} color="#7C3AED" />
                <KPICard icon={<ShoppingBag size={16} />} label="Pedidos (semana)" value={totalPedidos} color="#15803D" />
                <KPICard
                  icon={<Clock size={16} />}
                  label="Mejor resp. prom."
                  value={mejorRespVend ? msToStr(mejorRespVend.t) : "—"}
                  color="#0E7490"
                  sub={mejorRespVend ? mejorRespVend.nombre : null}
                />
              </div>

              {/* Gráfico mensajes */}
              <div style={{ background: L.white, borderRadius: 16, border: `1px solid ${L.border}`, padding: "22px 24px", marginBottom: 20 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: L.text, marginBottom: 18 }}>Mensajes enviados por vendedor</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartMensajes} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={L.border} />
                    <XAxis dataKey="nombre" tick={{ fontSize: 12, fontFamily: FONT_BODY }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [v, name === "hoy" ? "Hoy" : "Esta semana"]} contentStyle={{ borderRadius: 10, border: `1px solid ${L.border}`, fontFamily: FONT_BODY, fontSize: 12 }} />
                    <Bar dataKey="hoy" name="Hoy" radius={[6, 6, 0, 0]}>
                      {chartMensajes.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                    <Bar dataKey="semana" name="Semana" radius={[6, 6, 0, 0]} opacity={0.45}>
                      {chartMensajes.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Gráfico conversión */}
              <div style={{ background: L.white, borderRadius: 16, border: `1px solid ${L.border}`, padding: "22px 24px" }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: L.text, marginBottom: 18 }}>Tasa de conversión (%) por vendedor</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartConversion} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={L.border} />
                    <XAxis dataKey="nombre" tick={{ fontSize: 12, fontFamily: FONT_BODY }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, "Conversión"]} contentStyle={{ borderRadius: 10, border: `1px solid ${L.border}`, fontFamily: FONT_BODY, fontSize: 12 }} />
                    <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                      {chartConversion.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ══════════════ TAB VENDEDORES ══════════════ */}
          {tab === "vendedores" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {vendedores.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 20px", color: L.muted, fontSize: 14 }}>
                  No hay vendedores activos. Agregá vendedores desde la pestaña Admin.
                </div>
              )}
              {vendedores.map((v, idx) => {
                const s = statsVend[v.id] || {};
                const color = COLORES_VENDEDOR[idx % COLORES_VENDEDOR.length];
                return (
                  <div key={v.id} style={{ background: L.white, borderRadius: 16, border: `1.5px solid ${L.border}`, overflow: "hidden" }}>
                    {/* Header del vendedor */}
                    <div style={{ background: color + "12", borderBottom: `1px solid ${color}30`, padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: "#fff", flexShrink: 0 }}>
                          {v.nombre[0]}
                        </div>
                        <div>
                          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: L.text }}>{v.nombre}</div>
                          <div style={{ fontSize: 12, color: L.muted }}>{v.email}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ padding: "4px 12px", borderRadius: 20, background: color + "20", color, fontSize: 11.5, fontWeight: 700, fontFamily: FONT_DISPLAY, textTransform: "uppercase", letterSpacing: 0.4 }}>
                          Vendedor
                        </span>
                        <span style={{ padding: "4px 12px", borderRadius: 20, background: v.activo ? "#DCFCE7" : "#F1F5F9", color: v.activo ? "#16A34A" : L.muted, fontSize: 11.5, fontWeight: 700, fontFamily: FONT_DISPLAY }}>
                          {v.activo ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </div>

                    {/* Métricas */}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 0, borderBottom: `1px solid ${L.border}` }}>
                      {[
                        { label: "Msgs hoy", val: s.msgsHoy ?? "—", sub: `${s.msgsSem ?? 0} esta semana` },
                        { label: "Contactos", val: s.contactosTotales ?? "—", sub: `${s.vendidos ?? 0} vendidos` },
                        { label: "Pedidos (sem.)", val: s.pedidosMes ?? "—", sub: `${s.convRate ?? 0}% conversión` },
                        { label: "Resp. promedio", val: s.tiempoRespProm ? msToStr(s.tiempoRespProm) : "—", sub: null },
                      ].map(({ label, val, sub }, i) => (
                        <div key={i} style={{ padding: "14px 18px", borderRight: i < 3 && !isMobile ? `1px solid ${L.border}` : "none", borderBottom: isMobile && i < 2 ? `1px solid ${L.border}` : "none" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5, fontFamily: FONT_DISPLAY }}>{label}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: L.text, fontFamily: FONT_DISPLAY }}>{val}</div>
                          {sub && <div style={{ fontSize: 11.5, color: L.muted, marginTop: 2 }}>{sub}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Tiempo en app */}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", padding: "14px 18px", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", gap: 5 }}>
                          <Clock size={12} /> Tiempo en app hoy
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.tiempoHoy > 0 ? "#0E7490" : L.light, fontFamily: FONT_DISPLAY }}>
                          {fmtDuracion(s.tiempoHoy)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, fontFamily: FONT_DISPLAY, display: "flex", alignItems: "center", gap: 5 }}>
                          <Clock size={12} /> Tiempo en app (semana)
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.tiempoSem > 0 ? "#0E7490" : L.light, fontFamily: FONT_DISPLAY }}>
                          {fmtDuracion(s.tiempoSem)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════ TAB DIARIOS ══════════════ */}
          {tab === "diarios" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Ver entradas del</label>
                <input
                  type="date"
                  value={fechaDiario}
                  max={hoy}
                  onChange={(e) => setFechaDiario(e.target.value)}
                  style={{ padding: "9px 14px", borderRadius: 10, border: `1.5px solid ${L.border}`, fontSize: 14, fontFamily: FONT_BODY, background: L.white, color: L.text, outline: "none", cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, color: L.muted }}>
                  {diarios.length === 0 ? "Sin entradas ese día" : `${diarios.length} entrada${diarios.length > 1 ? "s" : ""}`}
                </span>
              </div>

              {diarios.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: L.muted, fontSize: 14 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                  Ningún vendedor registró su día el {new Date(fechaDiario + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {diarios.map((d) => {
                    const animoObj = ANIMOS[d.estado_animo] || ANIMOS.neutro;
                    const abierto = diariosAbiertos[d.id] !== false;
                    const vIdx = vendedores.findIndex((v) => v.id === d.vendedor_id);
                    const color = COLORES_VENDEDOR[vIdx >= 0 ? vIdx % COLORES_VENDEDOR.length : 0];
                    return (
                      <div key={d.id} style={{ background: L.white, borderRadius: 14, border: `1px solid ${L.border}`, overflow: "hidden" }}>
                        <div
                          onClick={() => setAbiertos((prev) => ({ ...prev, [d.id]: !abierto }))}
                          style={{ padding: "15px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: abierto ? `1px solid ${L.border}` : "none", justifyContent: "space-between" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: "#fff", flexShrink: 0 }}>
                              {d.vendedor_nombre[0]}
                            </div>
                            <div>
                              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: L.text }}>
                                {d.vendedor_nombre}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <span style={{ fontSize: 16 }}>{animoObj.emoji}</span>
                                <span style={{ fontSize: 11.5, color: animoObj.color, fontWeight: 700 }}>{animoObj.label}</span>
                              </div>
                            </div>
                          </div>
                          {abierto ? <ChevronUp size={16} color={L.muted} /> : <ChevronDown size={16} color={L.muted} />}
                        </div>
                        {abierto && (
                          <div style={{ padding: "16px 20px" }}>
                            {d.contenido
                              ? <p style={{ margin: 0, fontSize: 14, color: L.text, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{d.contenido}</p>
                              : <p style={{ margin: 0, fontSize: 13, color: L.light, fontStyle: "italic" }}>El vendedor no escribió contenido este día.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ══════════════ TAB ACTIVIDAD ══════════════ */}
          {tab === "actividad" && (
            <>
              {/* Gráfico tiempo en app */}
              <div style={{ background: L.white, borderRadius: 16, border: `1px solid ${L.border}`, padding: "22px 24px", marginBottom: 20 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: L.text, marginBottom: 4 }}>Tiempo en app (minutos)</div>
                <div style={{ fontSize: 12, color: L.muted, marginBottom: 18 }}>Hoy vs. últimos 7 días</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartTiempo} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={L.border} />
                    <XAxis dataKey="nombre" tick={{ fontSize: 12, fontFamily: FONT_BODY }} />
                    <YAxis tick={{ fontSize: 11 }} unit="m" />
                    <Tooltip formatter={(v, name) => [`${v} min`, name === "hoyMin" ? "Hoy" : "Semana"]} contentStyle={{ borderRadius: 10, border: `1px solid ${L.border}`, fontFamily: FONT_BODY, fontSize: 12 }} />
                    <Bar dataKey="hoyMin" name="Hoy" radius={[6, 6, 0, 0]}>
                      {chartTiempo.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                    <Bar dataKey="semMin" name="Semana" radius={[6, 6, 0, 0]} opacity={0.45}>
                      {chartTiempo.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabla de actividad */}
              <div style={{ background: L.white, borderRadius: 16, border: `1px solid ${L.border}`, overflow: "hidden" }}>
                <div style={{ padding: "16px 22px", borderBottom: `1px solid ${L.border}`, fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: L.text }}>
                  Resumen de actividad por vendedor
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: FONT_BODY }}>
                    <thead>
                      <tr style={{ background: L.soft }}>
                        {["Vendedor", "Msgs hoy", "Msgs semana", "Resp. prom.", "Tiempo hoy", "Tiempo semana", "Conversión"].map((h) => (
                          <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", fontFamily: FONT_DISPLAY }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vendedores.map((v, idx) => {
                        const s = statsVend[v.id] || {};
                        const color = COLORES_VENDEDOR[idx % COLORES_VENDEDOR.length];
                        return (
                          <tr key={v.id} style={{ borderBottom: `1px solid ${L.border}` }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = L.soft; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                            <td style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 9 }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>{v.nombre[0]}</div>
                              <span style={{ fontWeight: 700, color: L.text }}>{v.nombre}</span>
                            </td>
                            <td style={{ padding: "12px 16px", fontWeight: 700, color: L.text }}>{s.msgsHoy ?? 0}</td>
                            <td style={{ padding: "12px 16px", color: L.muted }}>{s.msgsSem ?? 0}</td>
                            <td style={{ padding: "12px 16px", color: s.tiempoRespProm ? (s.tiempoRespProm < 1800 ? "#16A34A" : s.tiempoRespProm < 7200 ? "#D97706" : "#DC2626") : L.light, fontWeight: 700 }}>
                              {s.tiempoRespProm ? msToStr(s.tiempoRespProm) : "—"}
                            </td>
                            <td style={{ padding: "12px 16px", color: s.tiempoHoy > 0 ? "#0E7490" : L.light, fontWeight: 700 }}>
                              {fmtDuracion(s.tiempoHoy)}
                            </td>
                            <td style={{ padding: "12px 16px", color: L.muted }}>{fmtDuracion(s.tiempoSem)}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{ padding: "3px 10px", borderRadius: 20, background: s.convRate > 20 ? "#DCFCE7" : s.convRate > 10 ? "#FEF3C7" : L.soft, color: s.convRate > 20 ? "#16A34A" : s.convRate > 10 ? "#D97706" : L.muted, fontWeight: 700, fontSize: 12 }}>
                                {s.convRate ?? 0}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
