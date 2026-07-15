import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase, C, FONT_DISPLAY, FONT_BODY, ESTADOS, calcularAlertas, fmtFechaLarga, fmtDuracion } from "./lib";
import {
  Clock, MessageSquare, ShoppingBag, TrendingUp, Save, ChevronDown, ChevronUp,
  Target, AlertTriangle, ArrowUpRight, Users, BarChart2,
  Star, CheckCircle2, Send, Lock,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { L } from "./theme";

const ANIMOS = [
  { key: "excelente", emoji: "🚀", label: "Excelente" },
  { key: "bien",      emoji: "😊", label: "Bien"      },
  { key: "neutro",    emoji: "😐", label: "Normal"    },
  { key: "mal",       emoji: "😔", label: "Difícil"   },
  { key: "muy_mal",   emoji: "😤", label: "Mal día"   },
];

function Stars({ value = 0, size = 16 }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size}
          fill={n <= value ? "#F59E0B" : "none"}
          color={n <= value ? "#F59E0B" : "#CBD5E1"} />
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, color = C.red, sub }) {
  return (
    <div style={{ background: L.white, borderRadius: 14, padding: "16px 20px", border: `1px solid ${L.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: L.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONT_DISPLAY }}>
        <span style={{ color }}>{icon}</span> {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: L.text, fontFamily: FONT_DISPLAY, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: L.muted }}>{sub}</div>}
    </div>
  );
}

function SeccionCard({ icon, titulo, badge, children, isMobile }) {
  return (
    <div style={{ background: L.white, borderRadius: 16, border: `1px solid ${L.border}`, padding: isMobile ? "16px 14px" : "20px 22px", marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ color: C.red, display: "flex" }}>{icon}</span>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: L.text }}>{titulo}</span>
        {badge != null && badge > 0 && (
          <span style={{ background: C.red, color: "#fff", borderRadius: 20, padding: "1px 9px", fontSize: 11, fontWeight: 700 }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function DiarioVendedor({ perfil, isMobile, contactos = [], onAbrirChat }) {
  const hoy = new Date().toISOString().slice(0, 10);

  const [entrada, setEntrada]         = useState(null);  // registro del día de hoy
  const [contenido, setContenido]     = useState("");
  const [animo, setAnimo]             = useState("neutro");
  const [guardando, setGuardando]     = useState(false);
  const [guardado, setGuardado]       = useState(false);
  const [historial, setHistorial]     = useState([]);
  const [stats, setStats]             = useState(null);
  const [chartSemana, setChartSemana] = useState([]);
  const [entradaAbierta, setAbierta]  = useState(null);
  const autoSaveTimer                 = useRef(null);

  // ── Mis contactos (solo los asignados a este vendedor) ────
  const misContactos = useMemo(
    () => contactos.filter((c) => c.vendedor === perfil?.nombre),
    [contactos, perfil?.nombre]
  );

  // ── Pipeline propio: cantidad por estado ───────────────────
  const pipeline = useMemo(() => {
    const conteo = {};
    misContactos.forEach((c) => {
      const key = c.estado || "nuevo";
      conteo[key] = (conteo[key] || 0) + 1;
    });
    return Object.keys(ESTADOS)
      .filter((k) => conteo[k] > 0)
      .map((k) => ({ key: k, ...ESTADOS[k], count: conteo[k] }));
  }, [misContactos]);

  // ── Mis alertas / seguimientos pendientes ──────────────────
  const misAlertas = useMemo(() => calcularAlertas(misContactos), [misContactos]);

  // ── Conversaciones recientes propias ───────────────────────
  const recientes = useMemo(() => {
    return [...misContactos]
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, 6);
  }, [misContactos]);

  const leadsActivos = misContactos.filter((c) => c.estado !== "perdido" && c.estado !== "vendido" && c.estado !== "cerrado").length;

  // ── Cargar entrada de hoy ─────────────────────────────────
  useEffect(() => {
    if (!perfil?.id) return;
    const fetchHoy = async () => {
      const { data } = await supabase
        .from("diario_vendedor")
        .select("*")
        .eq("vendedor_id", perfil.id)
        .eq("fecha", hoy)
        .single();
      if (data) {
        setEntrada(data);
        setContenido(data.contenido || "");
        setAnimo(data.estado_animo || "neutro");
      }
    };
    fetchHoy();
  }, [perfil?.id, hoy]);

  // ── Historial últimas 14 entradas (excluyendo hoy) ────────
  useEffect(() => {
    if (!perfil?.id) return;
    const fetchHistorial = async () => {
      const { data } = await supabase
        .from("diario_vendedor")
        .select("*")
        .eq("vendedor_id", perfil.id)
        .neq("fecha", hoy)
        .order("fecha", { ascending: false })
        .limit(14);
      setHistorial(data || []);
    };
    fetchHistorial();
  }, [perfil?.id, hoy]);

  // ── Stats del día actual ───────────────────────────────────
  useEffect(() => {
    if (!perfil?.nombre) return;
    const fetchStats = async () => {
      const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
      const [{ count: msgEnviados }, { count: contactosAtendidos }, { count: pedidos }, sesionesHoy] =
        await Promise.all([
          supabase.from("mensajes").select("*", { count: "exact", head: true })
            .eq("agente", perfil.nombre).eq("direccion", "out")
            .gte("created_at", inicioDia.toISOString()),
          supabase.from("mensajes").select("contacto_id", { count: "exact", head: true })
            .eq("agente", perfil.nombre).eq("direccion", "out")
            .gte("created_at", inicioDia.toISOString()),
          supabase.from("pedidos").select("*", { count: "exact", head: true })
            .eq("vendedor", perfil.nombre)
            .gte("created_at", inicioDia.toISOString()),
          supabase.from("sesiones_vendedor").select("duracion_seg")
            .eq("vendedor_id", perfil.id)
            .eq("fecha", hoy),
        ]);

      const tiempoHoy = (sesionesHoy.data || []).reduce((acc, s) => acc + (s.duracion_seg || 0), 0);

      // Tiempo promedio de respuesta
      const { data: contactosVendedor } = await supabase
        .from("contactos")
        .select("ultimo_in_at, ultimo_out_at")
        .eq("vendedor", perfil.nombre)
        .not("ultimo_in_at", "is", null)
        .not("ultimo_out_at", "is", null);

      let tiempoRespProm = null;
      if (contactosVendedor?.length > 0) {
        const tiempos = contactosVendedor
          .map((c) => {
            const diff = new Date(c.ultimo_out_at) - new Date(c.ultimo_in_at);
            return diff > 0 ? diff : null;
          })
          .filter(Boolean);
        if (tiempos.length > 0) {
          tiempoRespProm = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length / 1000);
        }
      }

      setStats({ msgEnviados: msgEnviados || 0, contactosAtendidos: contactosAtendidos || 0, pedidos: pedidos || 0, tiempoHoy, tiempoRespProm });
    };
    fetchStats();
  }, [perfil?.id, perfil?.nombre, hoy]);

  // ── Mensajes enviados por día (últimos 7 días) ─────────────
  useEffect(() => {
    if (!perfil?.nombre) return;
    const fetchSemana = async () => {
      const inicio = new Date(); inicio.setDate(inicio.getDate() - 6); inicio.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("mensajes")
        .select("created_at")
        .eq("agente", perfil.nombre).eq("direccion", "out")
        .gte("created_at", inicio.toISOString());

      const dias = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dias.push({ fecha: d.toISOString().slice(0, 10), label: d.toLocaleDateString("es-AR", { weekday: "short" }), cantidad: 0 });
      }
      (data || []).forEach((m) => {
        const f = m.created_at.slice(0, 10);
        const dia = dias.find((d) => d.fecha === f);
        if (dia) dia.cantidad += 1;
      });
      setChartSemana(dias);
    };
    fetchSemana();
  }, [perfil?.nombre, hoy]);

  // ── Guardar con debounce automático ───────────────────────
  const guardar = useCallback(async (nuevoContenido, nuevoAnimo) => {
    if (!perfil?.id) return;
    setGuardando(true);
    const payload = {
      vendedor_id: perfil.id,
      vendedor_nombre: perfil.nombre,
      fecha: hoy,
      contenido: nuevoContenido,
      estado_animo: nuevoAnimo,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = entrada
      ? await supabase.from("diario_vendedor").update(payload).eq("id", entrada.id).select().single()
      : await supabase.from("diario_vendedor").upsert(payload, { onConflict: "vendedor_id,fecha" }).select().single();
    if (!error && data) {
      setEntrada(data);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    }
    setGuardando(false);
  }, [perfil, hoy, entrada]);

  const completado = !!entrada?.completado;

  // ── Completar el día (enviar a revisión de Nicolás) ───────
  const completarDia = useCallback(async () => {
    if (!perfil?.id) return;
    if (!contenido.trim()) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setGuardando(true);
    const payload = {
      vendedor_id: perfil.id,
      vendedor_nombre: perfil.nombre,
      fecha: hoy,
      contenido,
      estado_animo: animo,
      completado: true,
      completado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = entrada
      ? await supabase.from("diario_vendedor").update(payload).eq("id", entrada.id).select().single()
      : await supabase.from("diario_vendedor").upsert(payload, { onConflict: "vendedor_id,fecha" }).select().single();
    if (!error && data) {
      setEntrada(data);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    }
    setGuardando(false);
  }, [perfil, hoy, entrada, contenido, animo]);

  // ── Reabrir el día (volver a editar) ──────────────────────
  const reabrirDia = useCallback(async () => {
    if (!entrada?.id) return;
    setGuardando(true);
    const { data, error } = await supabase
      .from("diario_vendedor")
      .update({ completado: false, completado_at: null, updated_at: new Date().toISOString() })
      .eq("id", entrada.id).select().single();
    if (!error && data) setEntrada(data);
    setGuardando(false);
  }, [entrada]);

  const onCambioContenido = (val) => {
    if (completado) return;
    setContenido(val);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => guardar(val, animo), 1800);
  };

  const onCambioAnimo = (key) => {
    if (completado) return;
    setAnimo(key);
    guardar(contenido, key);
  };

  const msToStr = (ms) => {
    const m = Math.floor(ms / 60000);
    if (m < 1) return "< 1 min";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60 > 0 ? (m % 60) + "m" : ""}`.trim();
  };

  const tiempoDesde = (iso) => {
    if (!iso) return "—";
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h}h`;
    return `hace ${Math.floor(h / 24)}d`;
  };

  const fechaHoyLabel = new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: isMobile ? "16px 14px" : "24px 32px", background: L.bg, fontFamily: FONT_BODY }}>

      {/* ── Título ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: isMobile ? 20 : 24, color: L.text }}>
          Mi Día — {perfil?.nombre?.split(" ")[0] || "Vendedor"}
        </div>
        <div style={{ fontSize: 13, color: L.muted, marginTop: 4, textTransform: "capitalize" }}>{fechaHoyLabel}</div>
      </div>

      {/* ── Stats del día ── */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
          <StatCard icon={<MessageSquare size={15} />} label="Mensajes enviados" value={stats.msgEnviados} color={C.red} />
          <StatCard icon={<TrendingUp size={15} />}    label="Contactos atendidos" value={stats.contactosAtendidos} color="#7C3AED" />
          <StatCard icon={<ShoppingBag size={15} />}   label="Pedidos del día" value={stats.pedidos} color="#15803D" />
          <StatCard icon={<Users size={15} />}         label="Leads activos" value={leadsActivos} color="#0E7490" sub={`${misContactos.length} totales`} />
          <StatCard
            icon={<Clock size={15} />}
            label="Tiempo en app"
            value={fmtDuracion(stats.tiempoHoy)}
            color="#D97706"
            sub={stats.tiempoRespProm ? `Resp. prom: ${msToStr(stats.tiempoRespProm)}` : null}
          />
        </div>
      )}

      {/* ── Pipeline propio ── */}
      <SeccionCard icon={<BarChart2 size={16} />} titulo="Mi Pipeline" isMobile={isMobile}>
        {pipeline.length === 0 ? (
          <div style={{ fontSize: 13, color: L.light, textAlign: "center", padding: "10px 0" }}>Todavía no tenés contactos asignados.</div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {pipeline.map((p) => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 12, background: p.bg }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: p.color, fontFamily: FONT_DISPLAY }}>{p.count}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: p.color }}>{p.label}</span>
              </div>
            ))}
          </div>
        )}
      </SeccionCard>

      {/* ── Seguimientos pendientes ── */}
      <SeccionCard icon={<AlertTriangle size={16} />} titulo="Seguimientos pendientes" badge={misAlertas.length} isMobile={isMobile}>
        {misAlertas.length === 0 ? (
          <div style={{ fontSize: 13, color: L.light, textAlign: "center", padding: "10px 0" }}>Sin pendientes ✓ Todo al día.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {misAlertas.map((a) => (
              <div key={a.id} onClick={() => onAbrirChat?.(a.contacto)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 10, background: L.soft, cursor: onAbrirChat ? "pointer" : "default", transition: "background .12s" }}
                onMouseEnter={(e) => onAbrirChat && (e.currentTarget.style.background = L.hover)}
                onMouseLeave={(e) => onAbrirChat && (e.currentTarget.style.background = L.soft)}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{a.tipo === "sin_respuesta" ? "⏰" : a.tipo === "lead_sin_asignar" ? "👤" : "📌"}</span>
                  <span style={{ fontSize: 13, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.texto}</span>
                </div>
                {onAbrirChat && <ArrowUpRight size={14} color={L.muted} style={{ flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        )}
      </SeccionCard>

      {/* ── Conversaciones recientes ── */}
      <SeccionCard icon={<MessageSquare size={16} />} titulo="Conversaciones recientes" isMobile={isMobile}>
        {recientes.length === 0 ? (
          <div style={{ fontSize: 13, color: L.light, textAlign: "center", padding: "10px 0" }}>Sin actividad reciente.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recientes.map((c) => {
              const e = ESTADOS[c.estado] || ESTADOS.nuevo;
              return (
                <div key={c.id} onClick={() => onAbrirChat?.(c)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: onAbrirChat ? "pointer" : "default", transition: "background .12s" }}
                  onMouseEnter={(e2) => onAbrirChat && (e2.currentTarget.style.background = L.hover)}
                  onMouseLeave={(e2) => onAbrirChat && (e2.currentTarget.style.background = "transparent")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 140 : 260 }}>
                      {c.nombre || c.telefono || "Sin nombre"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: e.color, background: e.bg, borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>{e.label}</span>
                  </div>
                  <span style={{ fontSize: 11.5, color: L.light, flexShrink: 0 }}>{tiempoDesde(c.updated_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </SeccionCard>

      {/* ── Gráfico desempeño semanal ── */}
      <SeccionCard icon={<Target size={16} />} titulo="Mi desempeño — últimos 7 días" isMobile={isMobile}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartSemana} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={L.border} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fontFamily: FONT_BODY }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v) => [v, "Mensajes enviados"]} contentStyle={{ borderRadius: 10, border: `1px solid ${L.border}`, fontFamily: FONT_BODY, fontSize: 12 }} />
            <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} fill={C.red} />
          </BarChart>
        </ResponsiveContainer>
      </SeccionCard>

      {/* ── Editor del día ── */}
      <div style={{ background: L.white, borderRadius: 16, border: `1px solid ${completado ? "#16A34A55" : L.border}`, padding: isMobile ? "18px 16px" : "24px 28px", marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: L.text }}>¿Cómo fue el día?</span>
            {completado ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#DCFCE7", color: "#15803D", borderRadius: 20, padding: "3px 11px", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
                <CheckCircle2 size={13} /> Completado
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#FEF3C7", color: "#B45309", borderRadius: 20, padding: "3px 11px", fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
                <Clock size={13} /> Pendiente
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {guardando && <span style={{ fontSize: 12, color: L.muted }}>Guardando…</span>}
            {guardado && !guardando && <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 700 }}>✓ Guardado</span>}
            {completado ? (
              <button
                onClick={reabrirDia}
                disabled={guardando}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${L.border}`, background: L.white, color: L.muted, fontSize: 13, fontWeight: 700, cursor: guardando ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: guardando ? 0.6 : 1 }}>
                <Lock size={13} /> Reabrir para editar
              </button>
            ) : (
              <>
                <button
                  onClick={() => guardar(contenido, animo)}
                  disabled={guardando}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${L.border}`, background: L.white, color: L.text, fontSize: 13, fontWeight: 700, cursor: guardando ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: guardando ? 0.6 : 1 }}>
                  <Save size={14} /> Guardar borrador
                </button>
                <button
                  onClick={completarDia}
                  disabled={guardando || !contenido.trim()}
                  title={!contenido.trim() ? "Escribí el resumen del día antes de completar" : "Enviar a Nicolás"}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "none", background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: (guardando || !contenido.trim()) ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: (guardando || !contenido.trim()) ? 0.5 : 1 }}>
                  <Send size={14} /> Completar día
                </button>
              </>
            )}
          </div>
        </div>

        {/* Valoración de Nicolás */}
        {(entrada?.valoracion_nota || entrada?.valoracion_comentario) && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: entrada?.valoracion_comentario ? 8 : 0 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Valoración de {entrada?.valorado_por || "Nicolás"}
              </span>
              {entrada?.valoracion_nota && <Stars value={entrada.valoracion_nota} size={15} />}
            </div>
            {entrada?.valoracion_comentario && (
              <p style={{ margin: 0, fontSize: 13.5, color: "#78350F", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entrada.valoracion_comentario}</p>
            )}
          </div>
        )}

        {completado && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#15803D", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "9px 14px", marginBottom: 16 }}>
            <CheckCircle2 size={15} />
            Día enviado a Nicolás{entrada?.completado_at ? ` · ${new Date(entrada.completado_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}. Reabrí si necesitás corregir algo.
          </div>
        )}

        {/* Estado de ánimo */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Estado de ánimo</div>
          <div style={{ display: "flex", gap: 8 }}>
            {ANIMOS.map(({ key, emoji, label }) => (
              <button
                key={key}
                onClick={() => onCambioAnimo(key)}
                title={label}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 10px", borderRadius: 12, border: `2px solid ${animo === key ? C.red : L.border}`, background: animo === key ? "#FEF2F2" : L.soft, cursor: "pointer", transition: "all .15s", flex: 1, maxWidth: 72 }}>
                <span style={{ fontSize: 22 }}>{emoji}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: animo === key ? C.red : L.muted, textTransform: "uppercase", letterSpacing: 0.3, fontFamily: FONT_DISPLAY }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Resumen del día</div>
        <textarea
          value={contenido}
          onChange={(e) => onCambioContenido(e.target.value)}
          readOnly={completado}
          placeholder={`Contá cómo fue el día, ${perfil?.nombre?.split(" ")[0] || ""}. ¿Qué conversaciones tuviste? ¿Cuáles avanzaron? ¿Qué obstáculos encontraste? ¿Qué mejorarías para mañana?`}
          rows={isMobile ? 8 : 12}
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", border: `1.5px solid ${L.border}`, borderRadius: 10, padding: "14px 16px", fontSize: 14.5, fontFamily: FONT_BODY, color: L.text, background: completado ? "#F8FAFC" : L.soft, outline: "none", lineHeight: 1.7, minHeight: 200, cursor: completado ? "default" : "text" }}
        />
        <div style={{ marginTop: 8, fontSize: 11.5, color: L.light, textAlign: "right" }}>
          {completado
            ? `${contenido.length} caracteres · Completado (solo lectura)`
            : contenido.length > 0 ? `${contenido.length} caracteres · Autoguardado activado` : "Empezá a escribir — se guarda solo"}
        </div>
      </div>

      {/* ── Historial ── */}
      {historial.length > 0 && (
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: L.text, marginBottom: 14 }}>Entradas anteriores</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {historial.map((e) => {
              const animoObj = ANIMOS.find((a) => a.key === e.estado_animo);
              const abierta = entradaAbierta === e.id;
              const fechaLabel = new Date(e.fecha + "T12:00:00").toLocaleDateString("es-AR", {
                weekday: "long", day: "numeric", month: "long",
              });
              return (
                <div
                  key={e.id}
                  style={{ background: L.white, borderRadius: 12, border: `1px solid ${L.border}`, overflow: "hidden" }}>
                  <div
                    onClick={() => setAbierta(abierta ? null : e.id)}
                    style={{ padding: "13px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", justifyContent: "space-between" }}
                    onMouseEnter={(el) => { el.currentTarget.style.background = L.soft; }}
                    onMouseLeave={(el) => { el.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{animoObj?.emoji || "📝"}</span>
                      <div>
                        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 13.5, color: L.text, textTransform: "capitalize" }}>{fechaLabel}</div>
                        {!abierta && e.contenido && (
                          <div style={{ fontSize: 12, color: L.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 200 : 500 }}>
                            {e.contenido.slice(0, 100)}{e.contenido.length > 100 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {e.valoracion_nota
                        ? <Stars value={e.valoracion_nota} size={13} />
                        : !e.completado && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#B45309", background: "#FEF3C7", borderRadius: 20, padding: "2px 8px", textTransform: "uppercase", letterSpacing: 0.3 }}>Pendiente</span>}
                      {abierta ? <ChevronUp size={16} color={L.muted} /> : <ChevronDown size={16} color={L.muted} />}
                    </div>
                  </div>
                  {abierta && (
                    <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${L.border}`, paddingTop: 14 }}>
                      {e.contenido
                        ? <p style={{ margin: 0, fontSize: 14, color: L.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{e.contenido}</p>
                        : <p style={{ margin: 0, fontSize: 13, color: L.light, fontStyle: "italic" }}>Sin contenido registrado</p>}
                      {(e.valoracion_nota || e.valoracion_comentario) && (
                        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginTop: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: e.valoracion_comentario ? 6 : 0 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.4 }}>
                              Valoración de {e.valorado_por || "Nicolás"}
                            </span>
                            {e.valoracion_nota && <Stars value={e.valoracion_nota} size={14} />}
                          </div>
                          {e.valoracion_comentario && (
                            <p style={{ margin: 0, fontSize: 13, color: "#78350F", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{e.valoracion_comentario}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {historial.length === 0 && !entrada && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: L.light, fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📓</div>
          Esta es tu primera entrada. Escribí cómo fue el día.
        </div>
      )}
    </div>
  );
}
