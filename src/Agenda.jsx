import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, C, FONT_DISPLAY, FONT_BODY } from "./lib";
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, Trash2, Check,
  CalendarDays, Phone, Users, MapPin, RefreshCw, CircleDot, Pencil,
} from "lucide-react";

const L = {
  bg: "#F5F6F8", white: "#FFFFFF", border: "#E4E8ED",
  text: "#0F172A", muted: "#64748B", light: "#94A3B8", soft: "#F1F5F9", hover: "#EFF6FF",
};

export const TIPOS = {
  reunion:     { label: "Reunión",     color: "#7C3AED", bg: "#F3E8FF", icon: Users },
  llamada:     { label: "Llamada",     color: "#0EA5E9", bg: "#E0F2FE", icon: Phone },
  visita:      { label: "Visita",      color: "#15803D", bg: "#DCFCE7", icon: MapPin },
  seguimiento: { label: "Seguimiento", color: "#D97706", bg: "#FEF3C7", icon: RefreshCw },
  otro:        { label: "Otro",        color: "#64748B", bg: "#F1F5F9", icon: CircleDot },
};

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// fecha local -> "YYYY-MM-DD" (sin corrimiento de zona horaria)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoyStr = () => ymd(new Date());

export default function Agenda({ vendedorId, vendedorNombre, isMobile, contactos = [], onAbrirChat, readOnly = false }) {
  const [cursor, setCursor]   = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [diaSel, setDiaSel]   = useState(null);   // "YYYY-MM-DD" del día abierto
  const [editando, setEdit]   = useState(null);   // evento en edición (o {} nuevo) o null
  const [guardando, setGuard] = useState(false);

  // Rango del mes visible
  const primerDia = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const ultimoDia = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  // ── Cargar eventos del mes ────────────────────────────────
  const cargar = useCallback(async () => {
    if (!vendedorId) return;
    setLoading(true);
    const { data } = await supabase
      .from("agenda_vendedor")
      .select("*")
      .eq("vendedor_id", vendedorId)
      .gte("fecha", ymd(primerDia))
      .lte("fecha", ymd(ultimoDia))
      .order("hora", { ascending: true, nullsFirst: true });
    setEventos(data || []);
    setLoading(false);
  }, [vendedorId, cursor]); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  // Eventos agrupados por fecha
  const porDia = useMemo(() => {
    const m = {};
    eventos.forEach((e) => { (m[e.fecha] ||= []).push(e); });
    return m;
  }, [eventos]);

  // ── Grilla de 6 semanas (lunes primero) ───────────────────
  const celdas = useMemo(() => {
    const offset = (primerDia.getDay() + 6) % 7; // 0=lunes
    const arr = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset + i);
      arr.push(d);
    }
    return arr;
  }, [cursor]); // eslint-disable-line

  const mesActual = (d) => d.getMonth() === cursor.getMonth();
  const irMes = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  const irHoy = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); };

  // ── Guardar (crear o editar) ──────────────────────────────
  const guardar = async (ev) => {
    if (!ev.titulo?.trim()) return;
    setGuard(true);
    const cli = contactos.find((c) => c.id === ev.cliente_id);
    const payload = {
      vendedor_id: vendedorId,
      vendedor_nombre: vendedorNombre,
      fecha: ev.fecha,
      hora: ev.hora || null,
      tipo: ev.tipo || "otro",
      titulo: ev.titulo.trim(),
      cliente_id: ev.cliente_id || null,
      cliente_nombre: cli ? (cli.nombre || cli.telefono) : (ev.cliente_nombre || null),
      nota: ev.nota?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (ev.id) {
      await supabase.from("agenda_vendedor").update(payload).eq("id", ev.id);
    } else {
      await supabase.from("agenda_vendedor").insert(payload);
    }
    setGuard(false);
    setEdit(null);
    cargar();
  };

  const borrar = async (id) => {
    await supabase.from("agenda_vendedor").delete().eq("id", id);
    setEdit(null);
    cargar();
  };

  const toggleCompletado = async (e) => {
    if (readOnly) return;
    await supabase.from("agenda_vendedor").update({ completado: !e.completado, updated_at: new Date().toISOString() }).eq("id", e.id);
    cargar();
  };

  const abrirDia = (d) => {
    if (!mesActual(d) && false) return;
    setDiaSel(ymd(d));
  };

  const eventosDiaSel = diaSel ? (porDia[diaSel] || []) : [];

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: isMobile ? "14px 12px" : "22px 28px", background: L.bg, fontFamily: FONT_BODY }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: isMobile ? 18 : 23, color: L.text }}>
            {MESES[cursor.getMonth()]} {cursor.getFullYear()}
          </div>
          {loading && <RefreshCw size={15} color={L.light} className="spin" />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => irMes(-1)} style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={irHoy} style={{ ...navBtn, width: "auto", padding: "0 14px", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 12.5 }}>Hoy</button>
          <button onClick={() => irMes(1)} style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Cabecera de días */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {DIAS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONT_DISPLAY }}>
            {isMobile ? d[0] : d}
          </div>
        ))}
      </div>

      {/* Grilla */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: isMobile ? "minmax(64px, auto)" : "minmax(98px, auto)", gap: 6 }}>
        {celdas.map((d, i) => {
          const key = ymd(d);
          const evs = porDia[key] || [];
          const esHoy = key === hoyStr();
          const delMes = mesActual(d);
          return (
            <div key={i} onClick={() => abrirDia(d)}
              style={{
                background: delMes ? L.white : "#FAFBFC", borderRadius: 10,
                border: `1px solid ${esHoy ? C.red : L.border}`,
                boxShadow: esHoy ? `0 0 0 1px ${C.red}` : "none",
                padding: isMobile ? "5px 5px" : "6px 8px", cursor: "pointer",
                opacity: delMes ? 1 : 0.55, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3,
                transition: "background .1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = L.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = delMes ? L.white : "#FAFBFC"; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: 12.5, fontWeight: esHoy ? 800 : 600,
                  color: esHoy ? "#fff" : L.text, fontFamily: FONT_DISPLAY,
                  background: esHoy ? C.red : "transparent", borderRadius: "50%",
                  width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                }}>{d.getDate()}</span>
                {!readOnly && delMes && !isMobile && (
                  <button onClick={(ev) => { ev.stopPropagation(); setDiaSel(key); setEdit({ fecha: key, tipo: "reunion" }); }}
                    title="Agregar" style={{ background: "none", border: "none", cursor: "pointer", color: L.light, padding: 0, display: "flex", opacity: 0.6 }}>
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {/* Eventos (máx 3 visibles) */}
              {evs.slice(0, isMobile ? 2 : 3).map((e) => {
                const t = TIPOS[e.tipo] || TIPOS.otro;
                return (
                  <div key={e.id} style={{
                    display: "flex", alignItems: "center", gap: 3, background: t.bg, borderRadius: 5,
                    padding: isMobile ? "1px 3px" : "2px 5px", minWidth: 0,
                    opacity: e.completado ? 0.5 : 1,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                    {!isMobile && e.hora && <span style={{ fontSize: 9.5, fontWeight: 700, color: t.color, flexShrink: 0 }}>{e.hora.slice(0, 5)}</span>}
                    <span style={{ fontSize: isMobile ? 9 : 10.5, color: L.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: e.completado ? "line-through" : "none" }}>
                      {e.titulo}
                    </span>
                  </div>
                );
              })}
              {evs.length > (isMobile ? 2 : 3) && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: L.muted }}>+{evs.length - (isMobile ? 2 : 3)} más</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal del día ── */}
      {diaSel && (
        <div onClick={() => { setDiaSel(null); setEdit(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 6000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: L.white, borderRadius: 18, width: "min(520px, 100%)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            {/* Cabecera modal */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${L.border}`, position: "sticky", top: 0, background: L.white, borderRadius: "18px 18px 0 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <CalendarDays size={18} color={C.red} />
                <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 16, color: L.text, textTransform: "capitalize" }}>
                  {new Date(diaSel + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                </span>
              </div>
              <button onClick={() => { setDiaSel(null); setEdit(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: L.muted, padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {/* Lista de eventos del día */}
              {eventosDiaSel.length === 0 && !editando && (
                <div style={{ textAlign: "center", color: L.light, fontSize: 13.5, padding: "20px 0" }}>
                  Sin tareas para este día.
                </div>
              )}
              {!editando && eventosDiaSel.map((e) => {
                const t = TIPOS[e.tipo] || TIPOS.otro;
                const Icon = t.icon;
                return (
                  <div key={e.id} style={{ display: "flex", gap: 11, padding: "11px 0", borderBottom: `1px solid ${L.border}55` }}>
                    {!readOnly && (
                      <button onClick={() => toggleCompletado(e)} title={e.completado ? "Marcar pendiente" : "Marcar hecho"}
                        style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, border: `2px solid ${e.completado ? "#16A34A" : L.border}`, background: e.completado ? "#16A34A" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, marginTop: 1 }}>
                        {e.completado && <Check size={13} color="#fff" />}
                      </button>
                    )}
                    <div style={{ flex: 1, minWidth: 0, opacity: e.completado ? 0.55 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: t.bg, color: t.color, borderRadius: 6, padding: "2px 8px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3 }}>
                          <Icon size={11} /> {t.label}
                        </span>
                        {e.hora && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: L.muted }}><Clock size={12} /> {e.hora.slice(0, 5)}</span>}
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: L.text, marginTop: 4, textDecoration: e.completado ? "line-through" : "none" }}>{e.titulo}</div>
                      {e.cliente_nombre && (
                        <div onClick={() => { const c = contactos.find((x) => x.id === e.cliente_id); if (c && onAbrirChat) { onAbrirChat(c); } }}
                          style={{ fontSize: 12.5, color: e.cliente_id && onAbrirChat ? "#0EA5E9" : L.muted, marginTop: 2, cursor: e.cliente_id && onAbrirChat ? "pointer" : "default", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Users size={12} /> {e.cliente_nombre}
                        </div>
                      )}
                      {e.nota && <div style={{ fontSize: 12.5, color: L.muted, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{e.nota}</div>}
                    </div>
                    {!readOnly && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setEdit({ ...e })} title="Editar" style={iconBtn}><Pencil size={14} /></button>
                        <button onClick={() => borrar(e.id)} title="Borrar" style={{ ...iconBtn, color: "#DC2626" }}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Botón agregar */}
              {!readOnly && !editando && (
                <button onClick={() => setEdit({ fecha: diaSel, tipo: "reunion" })}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginTop: 14, padding: "11px", borderRadius: 10, border: `1.5px dashed ${C.red}66`, background: "#FEF2F2", color: C.red, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
                  <Plus size={16} /> Agregar tarea
                </button>
              )}

              {/* Formulario */}
              {!readOnly && editando && (
                <EventoForm
                  ev={editando}
                  contactos={contactos}
                  guardando={guardando}
                  onCancel={() => setEdit(null)}
                  onSave={guardar}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Formulario de evento ────────────────────────────────────
function EventoForm({ ev, contactos, guardando, onCancel, onSave }) {
  const [f, setF] = useState({ fecha: ev.fecha, hora: ev.hora ? ev.hora.slice(0, 5) : "", tipo: ev.tipo || "reunion", titulo: ev.titulo || "", cliente_id: ev.cliente_id || "", nota: ev.nota || "", id: ev.id });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const inputSt = { width: "100%", boxSizing: "border-box", border: `1.5px solid ${L.border}`, borderRadius: 9, padding: "9px 11px", fontSize: 13.5, fontFamily: FONT_BODY, color: L.text, background: L.soft, outline: "none" };
  const lblSt = { fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5, display: "block" };

  return (
    <div style={{ marginTop: 8 }}>
      {/* Tipo */}
      <div style={{ marginBottom: 12 }}>
        <label style={lblSt}>Tipo</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(TIPOS).map(([k, t]) => {
            const Icon = t.icon; const sel = f.tipo === k;
            return (
              <button key={k} onClick={() => up("tipo", k)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${sel ? t.color : L.border}`, background: sel ? t.bg : "#fff", color: sel ? t.color : L.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={lblSt}>Título *</label>
          <input value={f.titulo} onChange={(e) => up("titulo", e.target.value)} placeholder="Ej: Llamar a Juan" style={inputSt} autoFocus />
        </div>
        <div style={{ width: 110 }}>
          <label style={lblSt}>Hora</label>
          <input type="time" value={f.hora} onChange={(e) => up("hora", e.target.value)} style={inputSt} />
        </div>
      </div>

      {/* Cliente */}
      <div style={{ marginBottom: 12 }}>
        <label style={lblSt}>Cliente (opcional)</label>
        <select value={f.cliente_id} onChange={(e) => up("cliente_id", e.target.value)} style={{ ...inputSt, cursor: "pointer" }}>
          <option value="">— Sin cliente —</option>
          {contactos.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre || c.telefono || "Sin nombre"}</option>
          ))}
        </select>
      </div>

      {/* Nota */}
      <div style={{ marginBottom: 14 }}>
        <label style={lblSt}>Nota (opcional)</label>
        <textarea value={f.nota} onChange={(e) => up("nota", e.target.value)} rows={2} placeholder="Detalle…" style={{ ...inputSt, resize: "vertical", lineHeight: 1.5 }} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "8px 16px", borderRadius: 9, border: `1.5px solid ${L.border}`, background: "#fff", color: L.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY }}>Cancelar</button>
        <button onClick={() => onSave({ ...f, hora: f.hora || null })} disabled={guardando || !f.titulo.trim()}
          style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: C.red, color: "#fff", fontSize: 13, fontWeight: 700, cursor: (guardando || !f.titulo.trim()) ? "default" : "pointer", fontFamily: FONT_DISPLAY, opacity: (guardando || !f.titulo.trim()) ? 0.5 : 1 }}>
          {guardando ? "Guardando…" : ev.id ? "Guardar" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

const navBtn = { width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${L.border}`, background: L.white, color: L.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const iconBtn = { width: 28, height: 28, borderRadius: 7, border: `1px solid ${L.border}`, background: "#fff", color: L.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
