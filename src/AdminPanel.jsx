import { useState, useEffect, useCallback } from "react";
import {
  Shield, Users, UserPlus, Search, Edit2, Trash2,
  X, AlertCircle, Plus, TrendingUp, UserCheck,
  ChevronDown, Check, RefreshCw,
} from "lucide-react";
import { supabase, C, FONT_DISPLAY, FONT_BODY, VENDEDORES, ESTADOS, fmtMoneda } from "./lib";

const L = {
  bg: "#F5F6F8", white: "#FFFFFF", border: "#E4E8ED",
  text: "#0F172A", muted: "#64748B", light: "#94A3B8", soft: "#F1F5F9",
};

const inputSt = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px",
  borderRadius: 10, border: `1.5px solid ${L.border}`,
  fontSize: 14, fontFamily: FONT_BODY, color: L.text, outline: "none",
  background: L.soft,
};

// ── Avatar inicial ────────────────────────────────────────────
function Inicial({ nombre, size = 40 }) {
  const COLORES = ["#B91C1C","#1D4ED8","#15803D","#7C3AED","#B45309","#0E7490","#9D174D","#374151"];
  const idx = (nombre || "").charCodeAt(0) % COLORES.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: COLORES[idx],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT_DISPLAY, fontWeight: 700, color: "#fff",
      fontSize: Math.round(size * 0.38), flexShrink: 0,
    }}>
      {(nombre || "?")[0].toUpperCase()}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────
function KpiCard({ icon, label, valor, color = C.red, sub }) {
  return (
    <div style={{
      background: L.white, borderRadius: 14, padding: "16px 18px",
      border: `1px solid ${L.border}`, borderTop: `4px solid ${color}`,
      boxShadow: "0 2px 8px rgba(0,0,0,.04)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 10.5, color: L.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, lineHeight: 1.4 }}>
          {label}
        </div>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color, marginTop: 8, lineHeight: 1.1 }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 11, color: L.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Badge de estado ───────────────────────────────────────────
function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] || { label: estado, color: L.muted, bg: L.soft };
  return (
    <span style={{
      fontSize: 9.5, padding: "2px 8px", borderRadius: 5,
      background: e.bg, color: e.color, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap",
    }}>
      {e.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function AdminPanel({ userName, isMobile }) {
  const [tab, setTab]                   = useState("resumen");
  const [contactos, setContactos]       = useState([]);
  const [vendedoresList, setVendedoresList] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [busqueda, setBusqueda]         = useState("");
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  // Modal vendedor
  const [modalV, setModalV]     = useState(null); // null | "nuevo" | {id,nombre,...}
  const [formV, setFormV]       = useState({ nombre: "", email: "", password: "" });
  const [guardandoV, setGuardandoV] = useState(false);
  const [errorV, setErrorV]     = useState("");
  const [confirmarElim, setConfirmarElim] = useState(null);

  // Modal reasignar
  const [reasignar, setReasignar]       = useState(null);
  const [nuevoVendedorReas, setNuevoVendedorReas] = useState("");
  const [guardandoReas, setGuardandoReas] = useState(false);

  // ── Carga de datos ──────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true);
    const [contRes, vendRes] = await Promise.all([
      supabase.from("contactos").select("*").order("updated_at", { ascending: false }),
      supabase.from("vendedores").select("*").order("nombre"),
    ]);
    setContactos(contRes.data || []);
    if (vendRes.data && vendRes.data.length > 0) {
      setVendedoresList(vendRes.data.filter(v => v.activo !== false));
    } else {
      // Fallback al array hardcodeado si la tabla no existe
      setVendedoresList(VENDEDORES.map(n => ({ id: n, nombre: n, activo: true })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Stats por vendedor ──────────────────────────────────────
  const statsVendedor = vendedoresList.map(v => {
    const cont     = contactos.filter(c => c.vendedor === v.nombre);
    const vendidos = cont.filter(c => ["pedido","cerrado","vendido"].includes(c.estado)).length;
    const perdidos = cont.filter(c => c.estado === "perdido").length;
    const activos  = cont.filter(c => !["pedido","cerrado","vendido","perdido"].includes(c.estado)).length;
    return {
      ...v,
      total: cont.length,
      vendidos,
      perdidos,
      activos,
      conv: cont.length ? Math.round(vendidos / cont.length * 100) : 0,
    };
  });

  // ── Stats globales ──────────────────────────────────────────
  const totalC     = contactos.length;
  const sinAsignar = contactos.filter(c => !c.vendedor).length;
  const totalVend  = contactos.filter(c => ["pedido","cerrado","vendido"].includes(c.estado)).length;
  const totalPerd  = contactos.filter(c => c.estado === "perdido").length;
  const convGlobal = totalC ? Math.round(totalVend / totalC * 100) : 0;

  // ── Clientes filtrados ──────────────────────────────────────
  const clientesFiltrados = contactos.filter(c => {
    const porV = filtroVendedor === "todos"
      || (filtroVendedor === "__sin__" && !c.vendedor)
      || c.vendedor === filtroVendedor;
    const porE = filtroEstado === "todos" || c.estado === filtroEstado;
    const porB = !busqueda
      || (c.nombre || "").toLowerCase().includes(busqueda.toLowerCase())
      || (c.telefono || "").includes(busqueda);
    return porV && porE && porB;
  });

  // ── CRUD vendedor ───────────────────────────────────────────
  const abrirNuevoV = () => { setModalV("nuevo"); setFormV({ nombre: "", email: "", password: "" }); setErrorV(""); };
  const abrirEditarV = (v) => { setModalV(v); setFormV({ nombre: v.nombre, email: v.email || "", password: "" }); setErrorV(""); };

  const guardarVendedor = async () => {
    if (!formV.nombre.trim()) { setErrorV("El nombre es obligatorio."); return; }
    if (modalV === "nuevo") {
      if (!formV.email.trim()) { setErrorV("El email es obligatorio (es el usuario de acceso)."); return; }
      if (formV.password.trim().length < 6) { setErrorV("La contraseña debe tener al menos 6 caracteres."); return; }
    }
    setGuardandoV(true); setErrorV("");
    try {
      if (modalV === "nuevo") {
        // Crea el usuario de acceso (con contraseña) + la fila de vendedor vía API segura.
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch("/api/crear-vendedor", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: JSON.stringify({
            nombre: formV.nombre.trim(),
            email: formV.email.trim(),
            password: formV.password.trim(),
          }),
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(out.error || "No se pudo crear el vendedor.");
      } else {
        const { error } = await supabase.from("vendedores")
          .update({ nombre: formV.nombre.trim(), email: formV.email.trim() || null })
          .eq("id", modalV.id);
        if (error) throw error;
        // Si se cargó una contraseña nueva, resetear/crear el acceso del vendedor.
        if (formV.password.trim()) {
          if (!formV.email.trim()) throw new Error("Para asignar contraseña hace falta el email.");
          if (formV.password.trim().length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
          const { data: { session } } = await supabase.auth.getSession();
          const resp = await fetch("/api/crear-vendedor", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token || ""}`,
            },
            body: JSON.stringify({
              modo: "password",
              nombre: formV.nombre.trim(),
              email: formV.email.trim(),
              password: formV.password.trim(),
            }),
          });
          const out = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(out.error || "No se pudo cambiar la contraseña.");
        }
      }
      await cargar();
      setModalV(null);
    } catch (e) {
      setErrorV(e.message || "Error al guardar.");
    }
    setGuardandoV(false);
  };

  const eliminarVendedor = async (v) => {
    await supabase.from("vendedores").update({ activo: false }).eq("id", v.id);
    setConfirmarElim(null);
    cargar();
  };

  // ── Reasignar cliente ────────────────────────────────────────
  const confirmarReasignacion = async () => {
    if (!reasignar) return;
    setGuardandoReas(true);
    await supabase.from("contactos")
      .update({ vendedor: nuevoVendedorReas || null })
      .eq("id", reasignar.id);
    setReasignar(null); setNuevoVendedorReas("");
    setGuardandoReas(false);
    cargar();
  };

  const TABS = [
    { k: "resumen",   label: "📊 Resumen" },
    { k: "vendedores",label: "👥 Vendedores" },
    { k: "clientes",  label: "📋 Clientes" },
  ];

  return (
    <div className="scroll-y" style={{ flex: 1, overflowY: "auto", background: L.bg, fontFamily: FONT_BODY }}>

      {/* ── HEADER ── */}
      <div style={{
        background: L.white, borderBottom: `3px solid ${C.gold}`,
        padding: isMobile ? "12px 14px" : "16px 24px",
        position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 2px 8px rgba(0,0,0,.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Shield size={20} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: isMobile ? 16 : 19, fontWeight: 700, color: L.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Panel Admin
            </div>
            <div style={{ fontSize: 11, color: L.muted }}>Hola, {userName} · Acceso completo</div>
          </div>
          <button onClick={cargar} title="Actualizar"
            style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="strip" style={{ display: "flex", gap: 2, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{
                border: "none", background: "transparent", cursor: "pointer", flexShrink: 0,
                padding: isMobile ? "8px 14px" : "9px 18px",
                fontFamily: FONT_DISPLAY, fontWeight: 700,
                fontSize: isMobile ? 11 : 12, textTransform: "uppercase", letterSpacing: 0.4,
                color: tab === t.k ? C.red : L.muted,
                borderBottom: tab === t.k ? `2px solid ${C.red}` : "2px solid transparent",
                transition: "all .15s", whiteSpace: "nowrap",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: L.muted, fontSize: 14 }}>
          Cargando datos…
        </div>
      ) : (
        <div style={{ padding: isMobile ? "14px 12px" : "24px 24px" }}>

          {/* ════════ RESUMEN ════════ */}
          {tab === "resumen" && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 22 }}>
                <KpiCard icon="👥" label="Total clientes" valor={totalC} color={C.red} />
                <KpiCard icon="✅" label="Vendidos" valor={totalVend} color="#15803D" sub={`${convGlobal}% conversión`} />
                <KpiCard icon="⚠️" label="Sin asignar" valor={sinAsignar} color="#D97706" />
                <KpiCard icon="❌" label="Perdidos" valor={totalPerd} color="#DC2626" />
              </div>

              {/* Ranking vendedores */}
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Rendimiento por vendedor
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {statsVendedor
                  .sort((a, b) => b.total - a.total)
                  .map(v => (
                    <div key={v.id || v.nombre} style={{
                      background: L.white, borderRadius: 14, padding: "14px 16px",
                      border: `1px solid ${L.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.04)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Inicial nombre={v.nombre} size={44} />
                        <div style={{ flex: 1, minWidth: 80 }}>
                          <div style={{ fontWeight: 700, color: L.text, fontSize: 15 }}>{v.nombre}</div>
                          <div style={{ fontSize: 11, color: L.muted }}>{v.total} clientes en total</div>
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {[
                            { val: v.vendidos, label: "Vendidos",  color: "#15803D" },
                            { val: v.activos,  label: "Activos",   color: "#1D4ED8" },
                            { val: v.perdidos, label: "Perdidos",  color: "#DC2626" },
                            { val: `${v.conv}%`, label: "Conv.",   color: C.red },
                          ].map(({ val, label, color }) => (
                            <div key={label} style={{ textAlign: "center", minWidth: 44 }}>
                              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color }}>{val}</div>
                              <div style={{ fontSize: 9.5, color: L.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Barra de progreso conversión */}
                      <div style={{ marginTop: 10, height: 5, background: L.soft, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          width: `${v.conv}%`, background: C.red,
                          transition: "width .6s ease",
                        }} />
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* ════════ VENDEDORES ════════ */}
          {tab === "vendedores" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: L.text, textTransform: "uppercase" }}>
                  Gestión de vendedores
                </div>
                <button onClick={abrirNuevoV}
                  style={{ background: C.red, color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 10px rgba(185,28,28,.3)" }}>
                  <Plus size={15} /> Nuevo vendedor
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {vendedoresList.map(v => {
                  const sv = statsVendedor.find(s => s.nombre === v.nombre) || {};
                  return (
                    <div key={v.id || v.nombre} style={{
                      background: L.white, borderRadius: 14, padding: "14px 16px",
                      border: `1px solid ${L.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.04)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Inicial nombre={v.nombre} size={46} />
                        <div style={{ flex: 1, minWidth: 80 }}>
                          <div style={{ fontWeight: 700, color: L.text, fontSize: 15 }}>{v.nombre}</div>
                          {v.email && <div style={{ fontSize: 11.5, color: L.muted, marginTop: 1 }}>{v.email}</div>}
                          <div style={{ fontSize: 11, color: L.light, marginTop: 3 }}>
                            {sv.total || 0} clientes · {sv.vendidos || 0} vendidos · {sv.conv || 0}% conv.
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                          <button onClick={() => abrirEditarV(v)}
                            style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 12, color: L.muted, display: "flex", alignItems: "center", gap: 5, fontFamily: FONT_BODY }}>
                            <Edit2 size={13} /> {isMobile ? "" : "Editar"}
                          </button>
                          <button onClick={() => setConfirmarElim(v)}
                            style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "7px 11px", cursor: "pointer", fontSize: 12, color: C.red, display: "flex", alignItems: "center", gap: 5 }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {vendedoresList.length === 0 && (
                  <div style={{ padding: 40, textAlign: "center", color: L.light }}>
                    No hay vendedores. Agregá uno con el botón de arriba.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════ CLIENTES ════════ */}
          {tab === "clientes" && (
            <>
              {/* Filtros */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                  <Search size={14} color={L.light} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar nombre o teléfono…"
                    style={{ ...inputSt, paddingLeft: 34 }} />
                </div>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                  style={{ ...inputSt, width: "auto", minWidth: 140 }}>
                  <option value="todos">Todos los vendedores</option>
                  <option value="__sin__">Sin asignar</option>
                  {vendedoresList.map(v => <option key={v.id || v.nombre} value={v.nombre}>{v.nombre}</option>)}
                </select>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  style={{ ...inputSt, width: "auto", minWidth: 130 }}>
                  <option value="todos">Todos los estados</option>
                  {Object.entries(ESTADOS).slice(0,6).map(([k,v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: 11, color: L.muted, marginBottom: 10, fontWeight: 600 }}>
                {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {clientesFiltrados.map(c => (
                  <div key={c.id} style={{
                    background: L.white, borderRadius: 12, padding: "12px 14px",
                    border: `1px solid ${L.border}`, boxShadow: "0 1px 4px rgba(0,0,0,.04)",
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  }}>
                    <Inicial nombre={c.nombre || c.telefono} size={36} />
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ fontWeight: 700, color: L.text, fontSize: 14 }}>{c.nombre || c.telefono}</div>
                      <div style={{ fontSize: 11, color: L.muted }}>{c.telefono}</div>
                    </div>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <EstadoBadge estado={c.estado} />
                      <span style={{ fontSize: 11.5, color: c.vendedor ? C.red : L.light, fontWeight: 600 }}>
                        {c.vendedor || "Sin asignar"}
                      </span>
                      <button
                        onClick={() => { setReasignar(c); setNuevoVendedorReas(c.vendedor || ""); }}
                        style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: L.muted, fontFamily: FONT_BODY, fontWeight: 600 }}>
                        Reasignar
                      </button>
                    </div>
                  </div>
                ))}
                {clientesFiltrados.length === 0 && (
                  <div style={{ padding: 40, textAlign: "center", color: L.light }}>
                    Sin clientes para este filtro.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════ MODAL: NUEVO / EDITAR VENDEDOR ════════ */}
      {modalV && (
        <>
          <div onClick={() => setModalV(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: isMobile ? "calc(100% - 28px)" : 420,
            background: L.white, borderRadius: 20, zIndex: 501,
            boxShadow: "0 24px 80px rgba(0,0,0,.3)", fontFamily: FONT_BODY, overflow: "hidden",
          }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${L.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: L.text }}>
                {modalV === "nuevo" ? "Nuevo vendedor" : `Editar · ${modalV.nombre}`}
              </div>
              <button onClick={() => setModalV(null)} style={{ background: L.soft, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>Nombre *</label>
                <input value={formV.nombre} onChange={e => setFormV(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: María García" style={inputSt} autoFocus />
              </div>
              <div style={{ marginBottom: modalV === "nuevo" ? 14 : 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
                  {modalV === "nuevo" ? "Email * (usuario de acceso)" : "Email (opcional)"}
                </label>
                <input value={formV.email} onChange={e => setFormV(f => ({ ...f, email: e.target.value }))}
                  placeholder="maria@ninitgroup.com" type="email" style={inputSt} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>
                  {modalV === "nuevo" ? "Contraseña *" : "Contraseña (dejar vacío para no cambiar)"}
                </label>
                <input value={formV.password} onChange={e => setFormV(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres" type="text" autoComplete="new-password" style={inputSt} />
                <div style={{ fontSize: 11, color: L.light, marginTop: 6 }}>
                  {modalV === "nuevo"
                    ? "Con este email y contraseña el vendedor podrá iniciar sesión."
                    : "Si escribís una contraseña, se asigna/resetea el acceso de este vendedor."}
                </div>
              </div>
              {errorV && (
                <div style={{ padding: "9px 13px", background: "#FEF2F2", borderRadius: 8, color: C.red, fontSize: 13, marginBottom: 14, display: "flex", gap: 7, alignItems: "center" }}>
                  <AlertCircle size={14} /> {errorV}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setModalV(null)}
                  style={{ flex: 1, background: "transparent", border: `1.5px solid ${L.border}`, borderRadius: 10, padding: 12, fontSize: 14, cursor: "pointer", color: L.muted, fontFamily: FONT_BODY, fontWeight: 600 }}>
                  Cancelar
                </button>
                <button onClick={guardarVendedor} disabled={guardandoV}
                  style={{ flex: 2, background: guardandoV ? L.light : C.red, color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, cursor: guardandoV ? "default" : "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: 0.5 }}>
                  {guardandoV ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════════ MODAL: CONFIRMAR ELIMINACIÓN ════════ */}
      {confirmarElim && (
        <>
          <div onClick={() => setConfirmarElim(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: isMobile ? "calc(100% - 28px)" : 380,
            background: L.white, borderRadius: 20, zIndex: 501,
            boxShadow: "0 24px 80px rgba(0,0,0,.3)", fontFamily: FONT_BODY, overflow: "hidden",
          }}>
            <div style={{ padding: "22px 22px 18px" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: L.text, marginBottom: 10 }}>
                ¿Desactivar vendedor?
              </div>
              <div style={{ fontSize: 14, color: L.muted, lineHeight: 1.5, marginBottom: 20 }}>
                ¿Seguro que querés desactivar a <strong>{confirmarElim.nombre}</strong>? Sus clientes no se eliminarán.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setConfirmarElim(null)}
                  style={{ flex: 1, background: "transparent", border: `1.5px solid ${L.border}`, borderRadius: 10, padding: 12, fontSize: 14, cursor: "pointer", color: L.muted, fontFamily: FONT_BODY }}>
                  Cancelar
                </button>
                <button onClick={() => eliminarVendedor(confirmarElim)}
                  style={{ flex: 1, background: "#DC2626", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, cursor: "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700 }}>
                  Desactivar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════════ MODAL: REASIGNAR CLIENTE ════════ */}
      {reasignar && (
        <>
          <div onClick={() => setReasignar(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 500 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: isMobile ? "calc(100% - 28px)" : 380,
            background: L.white, borderRadius: 20, zIndex: 501,
            boxShadow: "0 24px 80px rgba(0,0,0,.3)", fontFamily: FONT_BODY, overflow: "hidden",
          }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${L.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: L.text }}>Reasignar cliente</div>
                <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{reasignar.nombre || reasignar.telefono}</div>
              </div>
              <button onClick={() => setReasignar(null)} style={{ background: L.soft, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                Asignar a
              </label>
              <select value={nuevoVendedorReas} onChange={e => setNuevoVendedorReas(e.target.value)}
                style={{ ...inputSt, marginBottom: 16 }}>
                <option value="">Sin asignar</option>
                {vendedoresList.map(v => <option key={v.id || v.nombre} value={v.nombre}>{v.nombre}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setReasignar(null)}
                  style={{ flex: 1, background: "transparent", border: `1.5px solid ${L.border}`, borderRadius: 10, padding: 12, fontSize: 14, cursor: "pointer", color: L.muted, fontFamily: FONT_BODY }}>
                  Cancelar
                </button>
                <button onClick={confirmarReasignacion} disabled={guardandoReas}
                  style={{ flex: 2, background: guardandoReas ? L.light : C.red, color: "#fff", border: "none", borderRadius: 10, padding: 12, fontSize: 14, cursor: "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700 }}>
                  {guardandoReas ? "Guardando…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
