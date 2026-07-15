import { useState, useEffect, useCallback } from "react";
import {
  Package, Plus, Printer, X, Check, Clock, Zap,
  ChevronDown, Search, Phone, MapPin, FileText,
  Trash2, AlertCircle, User, CheckCircle, ShoppingBag, UserSearch,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  supabase, C, FONT_DISPLAY, FONT_BODY, VENDEDORES, fmtMoneda,
} from "./lib";
import { L } from "./theme";

// Estados del pedido
export const EP = {
  pendiente:  { label: "Pendiente",  color: "#92400E", bg: "#FEF3C7", Icon: Clock },
  confirmado: { label: "Confirmado", color: "#1D4ED8", bg: "#DBEAFE", Icon: Check },
  preparando: { label: "Preparando", color: "#7C3AED", bg: "#EDE9FE", Icon: Zap },
  listo:      { label: "Listo",      color: "#15803D", bg: "#DCFCE7", Icon: CheckCircle },
  entregado:  { label: "Entregado",  color: "#374151", bg: "#F3F4F6", Icon: Package },
  cancelado:  { label: "Cancelado",  color: "#B91C1C", bg: "#FEE2E2", Icon: X },
};

const PAGOS   = ["Efectivo", "Transferencia", "Tarjeta", "Mercado Pago"];
const ENTREGA = ["Retiro en local", "Delivery"];

// ── helpers ──────────────────────────────────────
export function parseDet(det) {
  if (!det) return { items: [], notas: "", entrega: "Retiro en local", direccion: "", pago: "Efectivo" };
  try {
    const p = JSON.parse(det);
    return p.items
      ? p
      : { items: [{ desc: det, qty: 1, precio: 0 }], notas: "", entrega: "Retiro en local", direccion: "", pago: "Efectivo" };
  } catch {
    return { items: [{ desc: det, qty: 1, precio: 0 }], notas: "", entrega: "Retiro en local", direccion: "", pago: "Efectivo" };
  }
}

const shortId = (id) => (id || "").slice(0, 6).toUpperCase();

// ── PDF ──────────────────────────────────────────
export function imprimirPedido(pedido, contacto) {
  const doc = new jsPDF({ format: "a4" });
  const det  = parseDet(pedido.detalle);
  const cont = contacto || {};
  const fecha = new Date(pedido.created_at).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // ── Header rojo ──
  doc.setFillColor(156, 27, 27);
  doc.rect(0, 0, 210, 40, "F");
  doc.setFillColor(212, 161, 58);
  doc.rect(0, 37, 210, 3, "F");

  // Logo placeholder (cuadrado blanco redondeado)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(13, 7, 26, 26, 3, 3, "F");
  doc.setTextColor(156, 27, 27);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("NINIT\nGROUP", 26, 16, { align: "center" });

  // Título
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("NINIT GROUP", 46, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Sistema de Gestión · Pedido de Venta", 46, 25);

  // N° pedido + fecha (derecha)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`#${shortId(pedido.id)}`, 196, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(fecha, 196, 22, { align: "right" });

  // Badge estado
  const ep = EP[pedido.estado] || EP.pendiente;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(151, 27, 45, 9, 2, 2, "F");
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(ep.label.toUpperCase(), 173, 33, { align: "center" });

  // ── Sección cliente ──
  let y = 52;
  doc.setTextColor(40, 30, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("DATOS DEL CLIENTE", 14, y);
  doc.setDrawColor(220, 210, 195);
  doc.setLineWidth(0.4);
  doc.line(14, y + 2, 196, y + 2);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(cont.nombre || "—", 14, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(100, 116, 139);
  y += 5;
  if (cont.telefono)          doc.text(`Tel: ${cont.telefono}`, 14, y);
  if (cont.empresa)           doc.text(`Empresa: ${cont.empresa}`, 100, y);
  y += 5;
  if (det.entrega === "Delivery" && det.direccion) doc.text(`Dirección entrega: ${det.direccion}`, 14, y);
  doc.text(`Vendedor: ${pedido.vendedor || "—"}`, 14, y + (det.entrega === "Delivery" && det.direccion ? 5 : 0));

  // Entrega + pago (derecha)
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(130, 52, 66, 18, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("ENTREGA", 136, 58);
  doc.text("PAGO", 174, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(det.entrega || "Retiro", 136, 64);
  doc.text(det.pago || "Efectivo", 174, 64);

  // ── Artículos ──
  y = det.entrega === "Delivery" && det.direccion ? y + 18 : y + 12;
  y = Math.max(y, 86);
  doc.setTextColor(40, 30, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("ARTÍCULOS DEL PEDIDO", 14, y);
  doc.setDrawColor(220, 210, 195);
  doc.line(14, y + 2, 196, y + 2);

  const items = det.items.filter((i) => i.desc?.trim());
  autoTable(doc, {
    startY: y + 5,
    head: [["Cant.", "Descripción", "Precio unit.", "Subtotal"]],
    body: items.map((i) => [
      String(i.qty || 1),
      i.desc || "",
      fmtMoneda(i.precio || 0),
      fmtMoneda((i.qty || 1) * (i.precio || 0)),
    ]),
    foot: [["", "", "TOTAL", fmtMoneda(pedido.total || 0)]],
    headStyles:  { fillColor: [156, 27, 27], fontSize: 9.5, fontStyle: "bold", halign: "center" },
    bodyStyles:  { fontSize: 10, cellPadding: 4 },
    footStyles:  { fillColor: [212, 161, 58], fontStyle: "bold", fontSize: 12, textColor: [40, 30, 20] },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 34, halign: "right" },
      3: { cellWidth: 34, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [252, 248, 240] },
    margin: { left: 14, right: 14 },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── Notas ──
  if (det.notas?.trim()) {
    doc.setFillColor(254, 249, 195);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(14, y, 182, 16, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(113, 63, 18);
    doc.text("Notas:", 18, y + 6.5);
    doc.setFont("helvetica", "normal");
    doc.text(det.notas.slice(0, 110), 36, y + 6.5);
    y += 22;
  }

  // ── Footer ──
  const pageH = doc.internal.pageSize.height;
  doc.setFillColor(245, 241, 234);
  doc.rect(0, pageH - 20, 210, 20, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 110, 95);
  doc.text("¡Gracias por su pedido!  ·  NINIT Group  ·  Luxury Restroom Trailers", 105, pageH - 12, { align: "center" });
  doc.setFontSize(7);
  doc.text(`Generado el ${new Date().toLocaleString("es-AR")} · NINIT CRM`, 105, pageH - 6, { align: "center" });

  doc.save(`pedido-NM-${shortId(pedido.id)}.pdf`);
}

// ═══════════════════════════════════════════════
// MODAL — Nuevo / Editar Pedido
// ═══════════════════════════════════════════════
export function NuevoPedidoModal({ contacto, vendedorActual, onClose, onGuardado }) {
  const [items, setItems]         = useState([{ desc: "", qty: 1, precio: "" }]);
  const [notas, setNotas]         = useState("");
  const [entrega, setEntrega]     = useState("Retiro en local");
  const [direccion, setDireccion] = useState(contacto?.direccion || "");
  const [pago, setPago]           = useState("Efectivo");
  const [estado, setEstado]       = useState("pendiente");
  const [vendedor, setVendedor]   = useState(vendedorActual || "");
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");

  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.precio) || 0), 0);

  const addItem    = () => setItems((p) => [...p, { desc: "", qty: 1, precio: "" }]);
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updItem    = (i, k, v) => setItems((p) => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x));

  const guardar = async (imprimir = false) => {
    const validos = items.filter((i) => i.desc.trim());
    if (!validos.length) { setErr("Agregá al menos un artículo con descripción."); return; }
    setSaving(true); setErr("");
    const detalleJSON = JSON.stringify({ items: validos, notas, entrega, direccion, pago });
    const { data, error } = await supabase.from("pedidos")
      .insert({ contacto_id: contacto.id, vendedor, detalle: detalleJSON, total, estado })
      .select("*").single();
    setSaving(false);
    if (error) { setErr("Error al guardar: " + error.message); return; }
    if (imprimir) imprimirPedido(data, contacto);
    onGuardado(data);
    onClose();
  };

  const inp = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${L.border}`, fontSize: 13.5, fontFamily: FONT_BODY, color: L.text, outline: "none", background: L.soft };
  const lbl = { display: "block", fontSize: 11, color: L.muted, marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 400 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(96vw,700px)", maxHeight: "92vh", background: L.white, borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.3)", zIndex: 401, display: "flex", flexDirection: "column", fontFamily: FONT_BODY, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 14px rgba(185,28,28,.35)` }}>
            <ShoppingBag size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, color: L.text }}>Nuevo Pedido</div>
            <div style={{ fontSize: 12.5, color: L.muted, marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <Phone size={11} /> {contacto.nombre || contacto.telefono} · {contacto.telefono}
            </div>
          </div>
          <button onClick={onClose} style={{ background: L.soft, border: `1px solid ${L.border}`, borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px" }}>

          {/* ── Artículos ── */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: L.text, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <Package size={15} color={C.red} /> Artículos del pedido
            </div>

            {/* Cabecera de columnas */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 68px 110px 88px 32px", gap: 6, marginBottom: 6, padding: "0 2px" }}>
              {["Descripción", "Cant.", "$ Precio unit.", "Subtotal", ""].map((h) => (
                <div key={h} style={{ fontSize: 10.5, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</div>
              ))}
            </div>

            {/* Filas */}
            {items.map((item, i) => {
              const sub = (Number(item.qty) || 0) * (Number(item.precio) || 0);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 68px 110px 88px 32px", gap: 6, marginBottom: 8, alignItems: "center" }}>
                  <input value={item.desc} onChange={(e) => updItem(i, "desc", e.target.value)}
                    placeholder="Ej: Empanadas de carne" style={inp} />
                  <input type="number" min="1" value={item.qty} onChange={(e) => updItem(i, "qty", e.target.value)}
                    style={{ ...inp, textAlign: "center" }} />
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: L.muted, fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>$</span>
                    <input type="number" min="0" value={item.precio} onChange={(e) => updItem(i, "precio", e.target.value)}
                      placeholder="0" style={{ ...inp, paddingLeft: 22, textAlign: "right" }} />
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: sub > 0 ? C.red : L.light, textAlign: "right", paddingRight: 4 }}>
                    {sub > 0 ? fmtMoneda(sub) : "—"}
                  </div>
                  <button onClick={() => removeItem(i)} disabled={items.length === 1}
                    style={{ background: "transparent", border: "none", cursor: items.length === 1 ? "not-allowed" : "pointer", color: items.length === 1 ? L.border : "#EF4444", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}

            <button onClick={addItem}
              style={{ width: "100%", background: "transparent", border: `1.5px dashed ${L.border}`, borderRadius: 9, padding: "9px", fontSize: 13.5, color: C.red, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 4 }}>
              <Plus size={16} /> Agregar artículo
            </button>

            {/* Total */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <div style={{ background: C.red, borderRadius: 12, padding: "12px 22px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 4px 16px rgba(185,28,28,.3)" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>TOTAL DEL PEDIDO</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, color: "#fff" }}>{fmtMoneda(total)}</span>
              </div>
            </div>
          </div>

          {/* ── Detalles ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {[
              { lbl: "Tipo de entrega", val: entrega, set: setEntrega, opts: ENTREGA },
              { lbl: "Forma de pago",   val: pago,    set: setPago,    opts: PAGOS },
              { lbl: "Vendedor",        val: vendedor, set: setVendedor, opts: null, vend: true },
              { lbl: "Estado inicial",  val: estado,  set: setEstado,  opts: null, ep: true },
            ].map(({ lbl: label, val, set, opts, vend, ep }) => (
              <div key={label}>
                <label style={lbl}>{label}</label>
                <select value={val} onChange={(e) => set(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  {vend && <option value="">Sin asignar</option>}
                  {opts && opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  {vend && VENDEDORES.map((v) => <option key={v} value={v}>{v}</option>)}
                  {ep && Object.entries(EP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          {entrega === "Delivery" && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={12} /> Dirección de entrega</span></label>
              <input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número, piso, localidad..." style={inp} />
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={lbl}><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><FileText size={12} /> Notas adicionales</span></label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3}
              placeholder="Ej: sin cebolla, bien cocido, para llevar, horario de entrega..."
              style={{ ...inp, resize: "vertical", lineHeight: 1.55 }} />
          </div>

          {err && (
            <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: C.red, fontSize: 13, fontWeight: 500, display: "flex", gap: 8, alignItems: "center" }}>
              <AlertCircle size={15} /> {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${L.border}`, display: "flex", gap: 10 }}>
          <button onClick={onClose}
            style={{ background: "transparent", border: `1.5px solid ${L.border}`, color: L.muted, borderRadius: 9, padding: "11px 20px", fontSize: 14, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600 }}>
            Cancelar
          </button>
          <button onClick={() => guardar(false)} disabled={saving}
            style={{ flex: 1, background: L.soft, border: `1.5px solid ${L.border}`, color: L.text, borderRadius: 9, padding: "11px", fontSize: 14, cursor: saving ? "default" : "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={() => guardar(true)} disabled={saving}
            style={{ flex: 2, background: C.red, border: "none", color: "#fff", borderRadius: 9, padding: "11px", fontSize: 14, cursor: saving ? "default" : "pointer", fontFamily: FONT_DISPLAY, fontWeight: 700, letterSpacing: 0.5, opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 2px 12px rgba(185,28,28,.35)" }}>
            <Printer size={17} /> Guardar e Imprimir
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════
// PANEL — Vista completa de pedidos
// ═══════════════════════════════════════════════
export default function PedidosPanel() {
  const [pedidos, setPedidos]       = useState([]);
  const [contactos, setContactos]   = useState({});
  const [filtro, setFiltro]         = useState("todos");
  const [busqueda, setBusqueda]     = useState("");
  const [loading, setLoading]       = useState(true);
  const [expandido, setExpandido]   = useState(null);
  const [nuevoPedidoModal, setNuevoPedidoModal] = useState(false);
  const [contactoSelec, setContactoSelec]       = useState(null);
  const [busqContacto, setBusqContacto]         = useState("");
  const [listaContactos, setListaContactos]     = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [pedRes, contRes] = await Promise.all([
      supabase.from("pedidos").select("*").order("created_at", { ascending: false }),
      supabase.from("contactos").select("id,nombre,telefono,foto_url,empresa,direccion"),
    ]);
    setPedidos(pedRes.data || []);
    const map = {};
    for (const c of contRes.data || []) map[c.id] = c;
    setContactos(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    const ch = supabase.channel("pedidos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [cargar]);

  const cambiarEstado = async (id, nuevoEstado) => {
    await supabase.from("pedidos").update({ estado: nuevoEstado }).eq("id", id);
    setPedidos((p) => p.map((x) => x.id === id ? { ...x, estado: nuevoEstado } : x));
  };

  const lista = pedidos.filter((p) => {
    const porEstado = filtro === "todos" || p.estado === filtro;
    const cont = contactos[p.contacto_id];
    const texto = `${cont?.nombre || ""} ${cont?.telefono || ""} ${p.vendedor || ""}`.toLowerCase();
    return porEstado && (!busqueda || texto.includes(busqueda.toLowerCase()));
  });

  const totalFact = lista.reduce((s, p) => s + (Number(p.total) || 0), 0);

  // Buscar contactos para el selector del modal
  const buscarContactos = async (q) => {
    setBusqContacto(q);
    if (!q.trim()) { setListaContactos([]); return; }
    const { data } = await supabase.from("contactos").select("id,nombre,telefono")
      .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`).limit(8);
    setListaContactos(data || []);
  };

  const abrirNuevoPedido = () => {
    setContactoSelec(null);
    setBusqContacto("");
    setListaContactos([]);
    setNuevoPedidoModal(true);
  };

  return (
    <div style={{ flex: 1, height: "100%", overflowY: "auto", background: L.bg, fontFamily: FONT_BODY }}>

      {/* ── Header ── */}
      <div style={{ background: L.white, borderBottom: `1px solid ${L.border}`, padding: "14px 18px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 1px 6px rgba(0,0,0,.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: C.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Package size={19} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: L.text, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Pedidos
              </div>
              <div style={{ fontSize: 11.5, color: L.muted }}>
                {lista.length} pedido{lista.length !== 1 ? "s" : ""} · <strong style={{ color: C.red }}>{fmtMoneda(totalFact)}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Búsqueda */}
            <div style={{ position: "relative" }}>
              <Search size={14} color={L.light} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente o vendedor…"
                style={{ width: 200, boxSizing: "border-box", padding: "8px 12px 8px 30px", borderRadius: 9, border: `1.5px solid ${L.border}`, fontSize: 13, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none" }} />
            </div>
            {/* Botón Nuevo Pedido */}
            <button onClick={abrirNuevoPedido}
              style={{ background: C.red, color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, display: "flex", alignItems: "center", gap: 7, boxShadow: "0 2px 10px rgba(185,28,28,.3)", whiteSpace: "nowrap" }}>
              <Plus size={16} /> Nuevo Pedido
            </button>
          </div>
        </div>

        {/* Filtros por estado */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => setFiltro("todos")}
            style={{ fontSize: 11.5, padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${filtro === "todos" ? C.red : L.border}`, cursor: "pointer", fontWeight: 700, background: filtro === "todos" ? "#FEF2F2" : L.white, color: filtro === "todos" ? C.red : L.muted, transition: "all .15s" }}>
            Todos <span style={{ background: filtro === "todos" ? C.red : L.light, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 3 }}>{pedidos.length}</span>
          </button>
          {Object.entries(EP).map(([k, v]) => {
            const cnt = pedidos.filter((p) => p.estado === k).length;
            if (cnt === 0 && filtro !== k) return null;
            const on = filtro === k;
            return (
              <button key={k} onClick={() => setFiltro(k)}
                style={{ fontSize: 11.5, padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${on ? v.color : L.border}`, cursor: "pointer", fontWeight: 700, background: on ? v.bg : L.white, color: on ? v.color : L.muted, transition: "all .15s" }}>
                {v.label} <span style={{ background: on ? v.color : L.light, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10, marginLeft: 3 }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Contenido ── */}
      {loading ? (
        <div style={{ padding: 80, textAlign: "center", color: L.muted, fontSize: 15 }}>Cargando pedidos…</div>
      ) : lista.length === 0 ? (
        <div style={{ padding: 80, textAlign: "center" }}>
          <ShoppingBag size={52} color={L.border} style={{ display: "block", margin: "0 auto 18px" }} />
          <div style={{ fontSize: 17, color: L.muted, fontWeight: 600 }}>Sin pedidos{filtro !== "todos" ? ` "${EP[filtro]?.label}"` : ""}</div>
          <div style={{ fontSize: 13.5, color: L.light, marginTop: 6 }}>Creá pedidos desde la conversación con el cliente</div>
        </div>
      ) : (
        <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 12 }}>
          {lista.map((ped) => {
            const cont = contactos[ped.contacto_id] || {};
            const det  = parseDet(ped.detalle);
            const ep   = EP[ped.estado] || EP.pendiente;
            const exp  = expandido === ped.id;
            const fecha = new Date(ped.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            const itemsValidos = det.items.filter((i) => i.desc?.trim());

            return (
              <div key={ped.id}
                style={{ background: L.white, borderRadius: 14, border: `1.5px solid ${L.border}`, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.05)", transition: "box-shadow .2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.05)"; }}>

                {/* ── Card row ── */}
                <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", borderBottom: exp ? `1px solid ${L.border}` : "none" }}
                  onClick={() => setExpandido(exp ? null : ped.id)}>
                  {/* Barra de color lateral */}
                  <div style={{ width: 5, height: 50, borderRadius: 4, background: ep.color, flexShrink: 0 }} />

                  {/* Info principal */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
                      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: L.text }}>
                        {cont.nombre || cont.telefono || "—"}
                      </span>
                      <span style={{ fontSize: 10.5, padding: "2px 10px", borderRadius: 10, background: ep.bg, color: ep.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>
                        {ep.label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
                      {cont.telefono && <span style={{ fontSize: 12, color: L.muted, display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{cont.telefono}</span>}
                      {ped.vendedor  && <span style={{ fontSize: 12, color: L.muted, display: "flex", alignItems: "center", gap: 4 }}><User size={11} />{ped.vendedor}</span>}
                      <span style={{ fontSize: 12, color: L.light }}>#{shortId(ped.id)} · {fecha}</span>
                    </div>
                    {/* Preview de items */}
                    <div style={{ fontSize: 12.5, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {itemsValidos.slice(0, 3).map((it, idx) => (
                        <span key={idx}>{idx > 0 ? " · " : ""}<strong>{it.qty}×</strong> {it.desc}</span>
                      ))}
                      {itemsValidos.length > 3 && ` +${itemsValidos.length - 3} más`}
                    </div>
                  </div>

                  {/* Total + acciones */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: C.red }}>{fmtMoneda(ped.total)}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={(e) => { e.stopPropagation(); imprimirPedido(ped, cont); }}
                        title="Descargar PDF"
                        style={{ background: L.soft, border: `1.5px solid ${L.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: L.muted, fontFamily: FONT_BODY, fontWeight: 600, transition: "all .15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = C.red; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = C.red; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = L.soft; e.currentTarget.style.color = L.muted; e.currentTarget.style.borderColor = L.border; }}>
                        <Printer size={13} /> PDF
                      </button>
                      <ChevronDown size={16} color={L.light} style={{ transform: exp ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                    </div>
                  </div>
                </div>

                {/* ── Detalle expandido ── */}
                {exp && (
                  <div style={{ padding: "18px 20px" }}>
                    {/* Tabla de artículos */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Artículos</div>
                      <div style={{ border: `1px solid ${L.border}`, borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 110px 110px", background: L.soft }}>
                          {["Cant.", "Descripción", "Precio unit.", "Subtotal"].map((h) => (
                            <div key={h} style={{ padding: "8px 12px", fontSize: 10.5, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>{h}</div>
                          ))}
                        </div>
                        {itemsValidos.map((item, i) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "52px 1fr 110px 110px", borderTop: `1px solid ${L.border}`, background: i % 2 === 0 ? L.white : "#FAFBFC" }}>
                            <div style={{ padding: "10px 12px", fontSize: 14, fontWeight: 700, color: L.text }}>{item.qty}</div>
                            <div style={{ padding: "10px 12px", fontSize: 14, color: L.text }}>{item.desc}</div>
                            <div style={{ padding: "10px 12px", fontSize: 13.5, color: L.muted }}>{fmtMoneda(item.precio || 0)}</div>
                            <div style={{ padding: "10px 12px", fontSize: 13.5, fontWeight: 600, color: L.text }}>{fmtMoneda((item.qty || 1) * (item.precio || 0))}</div>
                          </div>
                        ))}
                        {/* Total row */}
                        <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 110px 110px", borderTop: `2px solid ${L.border}`, background: "#FFF5F5" }}>
                          <div style={{ gridColumn: "1 / 4", padding: "10px 12px", fontWeight: 700, color: L.muted, fontSize: 12 }}>TOTAL</div>
                          <div style={{ padding: "10px 12px", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: C.red }}>{fmtMoneda(ped.total)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Meta: entrega, pago, notas */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                      <div style={{ padding: "10px 16px", background: L.soft, borderRadius: 9, border: `1px solid ${L.border}` }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Entrega</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: L.text }}>{det.entrega || "Retiro"}</div>
                        {det.entrega === "Delivery" && det.direccion && (
                          <div style={{ fontSize: 12, color: L.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{det.direccion}</div>
                        )}
                      </div>
                      <div style={{ padding: "10px 16px", background: L.soft, borderRadius: 9, border: `1px solid ${L.border}` }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: L.light, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Pago</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: L.text }}>{det.pago || "Efectivo"}</div>
                      </div>
                      {det.notas && (
                        <div style={{ flex: 1, minWidth: 180, padding: "10px 16px", background: "#FFFBEB", borderRadius: 9, border: "1px solid #FDE68A" }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Notas</div>
                          <div style={{ fontSize: 13.5, color: "#78350F" }}>{det.notas}</div>
                        </div>
                      )}
                    </div>

                    {/* Cambiar estado */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", paddingTop: 12, borderTop: `1px solid ${L.border}` }}>
                      <span style={{ fontSize: 11.5, color: L.muted, fontWeight: 600 }}>Cambiar estado:</span>
                      {Object.entries(EP).map(([k, v]) => {
                        const on = ped.estado === k;
                        return (
                          <button key={k} onClick={() => cambiarEstado(ped.id, k)}
                            style={{ fontSize: 11.5, padding: "5px 13px", borderRadius: 20, border: `1.5px solid ${on ? v.color : L.border}`, cursor: "pointer", fontWeight: 700, background: on ? v.bg : L.white, color: on ? v.color : L.muted, transition: "all .15s" }}>
                            {on && <Check size={11} style={{ display: "inline", marginRight: 4 }} />}{v.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ height: 32 }} />
        </div>
      )}

      {/* ── Modal: seleccionar contacto para nuevo pedido ── */}
      {nuevoPedidoModal && !contactoSelec && (
        <>
          <div onClick={() => setNuevoPedidoModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 400 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(95vw,440px)", background: L.white, borderRadius: 18, zIndex: 401, boxShadow: "0 24px 80px rgba(0,0,0,.3)", fontFamily: FONT_BODY, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${L.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <ShoppingBag size={18} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: L.text }}>Nuevo Pedido</div>
                <div style={{ fontSize: 12, color: L.muted }}>Buscá el cliente</div>
              </div>
              <button onClick={() => setNuevoPedidoModal(false)} style={{ background: L.soft, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: L.muted }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <Search size={14} color={L.light} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input value={busqContacto} onChange={(e) => buscarContactos(e.target.value)}
                  placeholder="Nombre o teléfono del cliente…"
                  autoFocus
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px 11px 32px", borderRadius: 10, border: `1.5px solid ${L.border}`, fontSize: 14, fontFamily: FONT_BODY, background: L.soft, color: L.text, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {listaContactos.length === 0 && busqContacto.length > 0 && (
                  <div style={{ padding: "20px 0", textAlign: "center", color: L.muted, fontSize: 13 }}>Sin resultados</div>
                )}
                {listaContactos.length === 0 && busqContacto.length === 0 && (
                  <div style={{ padding: "20px 0", textAlign: "center", color: L.light, fontSize: 13 }}>Escribí el nombre o teléfono para buscar</div>
                )}
                {listaContactos.map(c => (
                  <button key={c.id} onClick={() => setContactoSelec(c)}
                    style={{ background: L.soft, border: `1.5px solid ${L.border}`, borderRadius: 10, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", transition: "border-color .15s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.red}
                    onMouseLeave={e => e.currentTarget.style.borderColor = L.border}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.red, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, color: "#fff", fontSize: 14, flexShrink: 0 }}>
                      {(c.nombre || c.telefono)[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: L.text, fontSize: 14 }}>{c.nombre || c.telefono}</div>
                      <div style={{ fontSize: 11.5, color: L.muted }}>{c.telefono}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: formulario de pedido (una vez seleccionado el contacto) ── */}
      {nuevoPedidoModal && contactoSelec && (
        <NuevoPedidoModal
          contacto={contactoSelec}
          vendedorActual={contactoSelec.vendedor || ""}
          onClose={() => { setNuevoPedidoModal(false); setContactoSelec(null); }}
          onGuardado={() => { cargar(); setNuevoPedidoModal(false); setContactoSelec(null); }}
        />
      )}
    </div>
  );
}
