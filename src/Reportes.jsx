import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  supabase, C, FONT_DISPLAY, FONT_BODY, VENDEDORES, ESTADOS,
  rangoFechas, fmtFecha, fmtFechaLarga, fmtMoneda, exportarCSV,
} from "./lib";

const PALETA = [C.red, C.gold, C.sage, "#6366f1", "#0891b2", "#ea580c", "#16a34a", "#be185d"];

function etiqueta(p) {
  return { dia: "Hoy", semana: "Últimos 7 días", mes: "Últimos 30 días", anio: "Este año" }[p] || p;
}

function fmtMin(min) {
  if (min === null || min === undefined || isNaN(min)) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────
function Kpi({ icon, label, valor, sub, color = C.charcoal, chico, alerta }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "14px 18px",
      border: `1px solid ${C.border}`,
      boxShadow: alerta ? `0 0 0 2px ${C.red}30` : "none",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: chico ? 20 : 24, fontWeight: 800, color, lineHeight: 1.1 }}>
          {valor}
        </div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PANEL
// ─────────────────────────────────────────────
function Panel({ titulo, children, style, badge }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.04)", ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13.5, fontWeight: 700, color: C.charcoal, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {titulo}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// FUNNEL HORIZONTAL
// ─────────────────────────────────────────────
function Funnel({ data }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((d, i) => (
        <div key={d.name}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.charcoal }}>{d.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: PALETA[i % PALETA.length] }}>{d.value}</span>
          </div>
          <div style={{ height: 24, background: "#f1f5f9", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 6,
              width: `${Math.round(d.value / max * 100)}%`,
              background: PALETA[i % PALETA.length],
              display: "flex", alignItems: "center", paddingLeft: 10,
              minWidth: d.value > 0 ? 36 : 0, transition: "width .6s ease",
            }}>
              {d.value > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
                  {Math.round(d.value / max * 100)}%
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TOOLTIP PERSONALIZADO
// ─────────────────────────────────────────────
function TooltipHoras({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12.5, boxShadow: "0 4px 20px rgba(0,0,0,.12)" }}>
      <div style={{ fontWeight: 700, color: C.charcoal, marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}</strong> mensajes
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function shortId(id) {
  return (id || "").slice(0, 6).toUpperCase();
}

function parseDet(det) {
  if (!det) return { items: [], notas: "", entrega: "Retiro en local", direccion: "", pago: "Efectivo" };
  try {
    const p = JSON.parse(det);
    return p.items ? p : { items: [{ desc: det, qty: 1, precio: 0 }], notas: "", entrega: "Retiro en local", direccion: "", pago: "Efectivo" };
  } catch {
    return { items: [{ desc: det, qty: 1, precio: 0 }], notas: "", entrega: "Retiro en local", direccion: "", pago: "Efectivo" };
  }
}

export default function Reportes() {
  const [vista, setVista]     = useState("stats"); // "stats" | "pedidos"
  const [periodo, setPeriodo] = useState("semana");
  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState(null);

  // ── Reporte pedidos ──
  const [pDesde, setPDesde]       = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [pHasta, setPHasta]       = useState(hoyISO);
  const [pedResult, setPedResult] = useState(null);
  const [loadingPed, setLoadingPed] = useState(false);

  // ── Reporte mensajes ──
  const [mDesde, setMDesde]         = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [mHasta, setMHasta]         = useState(hoyISO);
  const [msgResult, setMsgResult]   = useState(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  const buscarMensajes = async () => {
    setLoadingMsg(true);
    const { data: rows, error } = await supabase
      .from("mensajes")
      .select("*, contactos(nombre, telefono, empresa)")
      .gte("created_at", mDesde + "T00:00:00")
      .lte("created_at", mHasta + "T23:59:59")
      .order("created_at", { ascending: true });
    setLoadingMsg(false);
    if (!error) setMsgResult(rows || []);
  };

  const exportarMsgCSV = () => {
    if (!msgResult?.length) return;
    const filas = msgResult.map((m) => ({
      Fecha: new Date(m.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      Dirección: m.direccion === "in" ? "Cliente → CRM" : "CRM → Cliente",
      Origen: m.origen || "",
      Agente: m.agente || "",
      Cliente: m.contactos?.nombre || m.contactos?.telefono || "",
      Teléfono: m.contactos?.telefono || "",
      Empresa: m.contactos?.empresa || "",
      Mensaje: m.contenido || "",
    }));
    exportarCSV(filas, `mensajes-nm-${mDesde}-al-${mHasta}`);
  };

  const exportarMsgPDF = () => {
    if (!msgResult?.length) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFillColor(156, 27, 27);
    doc.rect(0, 0, 297, 22, "F");
    doc.setFillColor(212, 161, 58);
    doc.rect(0, 19, 297, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("NINIT Group — Historial de Mensajes", 14, 13);
    doc.setFontSize(9);
    doc.text(`${mDesde} al ${mHasta} · ${msgResult.length} mensajes`, 14, 19.5);
    autoTable(doc, {
      startY: 28,
      head: [["Fecha", "Dir.", "Origen", "Agente", "Cliente", "Teléfono", "Mensaje"]],
      body: msgResult.map((m) => [
        new Date(m.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        m.direccion === "in" ? "↙ Cliente" : "↗ Agente",
        m.origen || "—",
        m.agente || "—",
        m.contactos?.nombre || m.contactos?.telefono || "—",
        m.contactos?.telefono || "—",
        m.contenido || "",
      ]),
      headStyles: { fillColor: [156, 27, 27], fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 6: { cellWidth: 90 } },
      alternateRowStyles: { fillColor: [252, 248, 240] },
    });
    doc.setFontSize(7.5);
    doc.setTextColor(140, 132, 114);
    doc.text(`Generado el ${new Date().toLocaleString("es-AR")} · NINIT CRM`, 14, doc.lastAutoTable.finalY + 8);
    doc.save(`mensajes-nm-${mDesde}-al-${mHasta}.pdf`);
  };

  const buscarPedidos = async () => {
    setLoadingPed(true);
    // Pedidos en el rango
    const { data: pedidos, error } = await supabase
      .from("pedidos")
      .select("*")
      .gte("created_at", pDesde + "T00:00:00")
      .lte("created_at", pHasta + "T23:59:59")
      .order("created_at", { ascending: false });

    if (error || !pedidos) {
      setLoadingPed(false);
      setPedResult([]);
      return;
    }

    // Traer datos de contactos por separado
    const ids = [...new Set(pedidos.map((p) => p.contacto_id).filter(Boolean))];
    let contactosMap = {};
    if (ids.length > 0) {
      const { data: conts } = await supabase
        .from("contactos")
        .select("id, nombre, telefono, empresa")
        .in("id", ids);
      (conts || []).forEach((c) => { contactosMap[c.id] = c; });
    }

    const rows = pedidos.map((p) => ({ ...p, contactos: contactosMap[p.contacto_id] || null }));
    setLoadingPed(false);
    setPedResult(rows);
  };

  const exportarPedidosCSV = () => {
    if (!pedResult?.length) return;
    const filas = [];
    for (const p of pedResult) {
      const det = parseDet(p.detalle);
      const cliente = p.contactos?.nombre || p.contactos?.telefono || p.contacto_id;
      const telefono = p.contactos?.telefono || "";
      const empresa = p.contactos?.empresa || "";
      const fecha = new Date(p.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      if (det.items.length === 0) {
        filas.push({ "N° Pedido": shortId(p.id), Fecha: fecha, Cliente: cliente, Teléfono: telefono, Empresa: empresa, Vendedor: p.vendedor || "", Estado: p.estado || "", Artículo: "", Cantidad: "", "Precio unit.": "", Subtotal: "", Notas: det.notas, Entrega: det.entrega, Dirección: det.direccion, Pago: det.pago, Total: p.total || 0 });
      } else {
        det.items.forEach((it, idx) => {
          filas.push({ "N° Pedido": idx === 0 ? shortId(p.id) : "", Fecha: idx === 0 ? fecha : "", Cliente: idx === 0 ? cliente : "", Teléfono: idx === 0 ? telefono : "", Empresa: idx === 0 ? empresa : "", Vendedor: idx === 0 ? (p.vendedor || "") : "", Estado: idx === 0 ? (p.estado || "") : "", Artículo: it.desc, Cantidad: it.qty, "Precio unit.": it.precio, Subtotal: (Number(it.qty) || 0) * (Number(it.precio) || 0), Notas: idx === 0 ? det.notas : "", Entrega: idx === 0 ? det.entrega : "", Dirección: idx === 0 ? det.direccion : "", Pago: idx === 0 ? det.pago : "", Total: idx === 0 ? (p.total || 0) : "" });
        });
      }
    }
    exportarCSV(filas, `pedidos-nm-${pDesde}-al-${pHasta}`);
  };

  const exportarPedidosPDF = () => {
    if (!pedResult?.length) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFillColor(156, 27, 27);
    doc.rect(0, 0, 297, 22, "F");
    doc.setFillColor(212, 161, 58);
    doc.rect(0, 19, 297, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("NINIT Group — Reporte de Pedidos", 14, 13);
    doc.setFontSize(9);
    doc.text(`${pDesde} al ${pHasta} · ${pedResult.length} pedidos`, 14, 19.5);

    const body = [];
    for (const p of pedResult) {
      const det = parseDet(p.detalle);
      const cliente = p.contactos?.nombre || p.contactos?.telefono || "";
      const tel = p.contactos?.telefono || "";
      const fecha = new Date(p.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const articulos = det.items.map((i) => `${i.qty}x ${i.desc}`).join("\n") || "—";
      body.push([shortId(p.id), fecha, cliente, tel, p.vendedor || "—", p.estado || "—", articulos, det.entrega, det.pago, fmtMoneda(p.total)]);
    }

    autoTable(doc, {
      startY: 28,
      head: [["N°", "Fecha", "Cliente", "Teléfono", "Vendedor", "Estado", "Artículos", "Entrega", "Pago", "Total"]],
      body,
      headStyles: { fillColor: [156, 27, 27], fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 6: { cellWidth: 55 } },
      alternateRowStyles: { fillColor: [252, 248, 240] },
    });

    const tot = pedResult.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.setTextColor(40, 30, 20);
    doc.text(`Total facturado: ${fmtMoneda(tot)}`, 14, y);
    doc.setFontSize(7.5);
    doc.setTextColor(140, 132, 114);
    doc.text(`Generado el ${new Date().toLocaleString("es-AR")} · NINIT CRM`, 14, y + 6);
    doc.save(`pedidos-nm-${pDesde}-al-${pHasta}.pdf`);
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    const { inicio, fin } = rangoFechas(periodo);
    const iso = inicio.toISOString();

    const [msgsRes, contRes, pedRes] = await Promise.all([
      supabase.from("mensajes")
        .select("id,direccion,origen,agente,created_at,contacto_id")
        .gte("created_at", iso),
      supabase.from("contactos")
        .select("id,vendedor,estado,created_at,bot_activo,seguimiento_at,ultimo_in_at,ultimo_out_at"),
      supabase.from("pedidos")
        .select("vendedor,total,estado,created_at")
        .gte("created_at", iso),
    ]);

    const msgs      = msgsRes.data || [];
    const contactos = contRes.data || [];
    const pedidos   = pedRes.data  || [];

    // Nuevos contactos en el período
    const nuevos = contactos.filter((c) => new Date(c.created_at) >= inicio);

    // Contactos únicos activos (que escribieron al menos una vez)
    const activosSet = new Set(msgs.filter((m) => m.direccion === "in").map((m) => m.contacto_id));
    const contactosActivos = activosSet.size;

    // ── Serie temporal por día ──
    const dias = {};
    const cur = new Date(inicio);
    while (cur <= fin) {
      const k = cur.toISOString().slice(0, 10);
      dias[k] = { dia: fmtFecha(cur), clientes: 0, respuestas: 0, nuevos: 0 };
      cur.setDate(cur.getDate() + 1);
    }
    for (const m of msgs) {
      const k = m.created_at.slice(0, 10);
      if (dias[k]) {
        if (m.direccion === "in") dias[k].clientes++;
        else dias[k].respuestas++;
      }
    }
    for (const c of nuevos) {
      const k = c.created_at.slice(0, 10);
      if (dias[k]) dias[k].nuevos++;
    }
    const serie = Object.values(dias);

    // ── Actividad por hora del día ──
    const horarios = Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, "0")}h`, clientes: 0, respuestas: 0,
    }));
    for (const m of msgs) {
      const h = new Date(m.created_at).getHours();
      if (m.direccion === "in") horarios[h].clientes++;
      else horarios[h].respuestas++;
    }

    // ── Bot vs humano ──
    const botCount    = msgs.filter((m) => m.origen === "bot").length;
    const agenteCount = msgs.filter((m) => m.origen === "agente").length;
    const botPct      = botCount + agenteCount > 0
      ? Math.round(botCount / (botCount + agenteCount) * 100) : 0;

    // ── Por vendedor ──
    const porVendedor = VENDEDORES.map((v) => {
      const cont     = contactos.filter((c) => c.vendedor === v);
      const ped      = pedidos.filter((p) => p.vendedor === v);
      const msgsV    = msgs.filter((m) => m.agente === v).length;
      const nuevosV  = nuevos.filter((c) => c.vendedor === v).length;
      const cerrados = cont.filter((c) => ["pedido", "cerrado"].includes(c.estado)).length;
      return {
        vendedor: v,
        contactos: cont.length,
        nuevos: nuevosV,
        cerrados,
        conversion: cont.length ? Math.round(cerrados / cont.length * 100) : 0,
        pedidos: ped.length,
        facturacion: ped.reduce((s, p) => s + (Number(p.total) || 0), 0),
        mensajes: msgsV,
      };
    });
    // Ordenar por mensajes desc para mostrar los más activos primero
    const vendedoresActivos = porVendedor.filter((v) => v.contactos > 0 || v.mensajes > 0);

    // ── Embudo de estados ──
    const porEstado = Object.entries(ESTADOS).map(([k, v]) => ({
      name: v.label,
      value: contactos.filter((c) => c.estado === k).length,
    }));

    // ── Tasas globales ──
    const cerradosTot   = contactos.filter((c) => ["pedido", "cerrado"].includes(c.estado)).length;
    const tasaConversion = contactos.length ? Math.round(cerradosTot / contactos.length * 100) : 0;
    const botAutonomo   = contactos.filter((c) => c.bot_activo).length;
    const agenteManual  = contactos.filter((c) => !c.bot_activo).length;

    // ── Seguimientos vencidos ──
    const ahora = new Date();
    const segVencidos = contactos.filter(
      (c) => c.seguimiento_at && new Date(c.seguimiento_at) < ahora
    ).length;

    // ── Tiempo promedio de respuesta (aproximado por último par in/out) ──
    const tiemposMin = contactos
      .filter((c) => c.ultimo_in_at && c.ultimo_out_at)
      .map((c) => (new Date(c.ultimo_out_at) - new Date(c.ultimo_in_at)) / 60000)
      .filter((t) => t > 0 && t < 1440); // entre 0 y 24h
    const tiempoPromMin = tiemposMin.length
      ? tiemposMin.reduce((a, b) => a + b, 0) / tiemposMin.length
      : null;

    // ── KPIs finales ──
    const facturacion  = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const totalPedidos = pedidos.length;
    const ticket       = totalPedidos ? facturacion / totalPedidos : 0;

    setData({
      serie, horarios, porVendedor, vendedoresActivos, porEstado,
      kpis: {
        msgsIn: msgs.filter((m) => m.direccion === "in").length,
        msgsTotal: msgs.length,
        contactosActivos,
        nuevos: nuevos.length,
        totalContactos: contactos.length,
        cerradosTot,
        tasaConversion,
        totalPedidos, facturacion, ticket,
        botCount, agenteCount, botPct,
        botAutonomo, agenteManual,
        segVencidos,
        tiempoPromMin,
      },
      periodo, inicio, fin,
    });
    setLoading(false);
  }, [periodo]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Exportar PDF ──
  const exportarPDF = () => {
    if (!data) return;
    const { kpis, porVendedor } = data;
    const doc = new jsPDF();
    // Header rojo
    doc.setFillColor(156, 27, 27);
    doc.rect(0, 0, 210, 32, "F");
    doc.setFillColor(212, 161, 58);
    doc.rect(0, 29, 210, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("NINIT Group CRM — Reporte", 14, 14);
    doc.setFontSize(9);
    doc.text(`${etiqueta(periodo)} · ${fmtFechaLarga(data.inicio)} — ${fmtFechaLarga(data.fin)}`, 14, 24);
    // KPIs
    doc.setTextColor(40, 30, 20);
    doc.setFontSize(14);
    doc.text("Resumen del período", 14, 46);
    autoTable(doc, {
      startY: 50,
      head: [["Métrica", "Valor"]],
      body: [
        ["Mensajes de clientes", String(kpis.msgsIn)],
        ["Contactos únicos activos", String(kpis.contactosActivos)],
        ["Nuevos contactos", String(kpis.nuevos)],
        ["Total contactos (acumulado)", String(kpis.totalContactos)],
        ["Tasa de conversión global", `${kpis.tasaConversion}% (${kpis.cerradosTot} de ${kpis.totalContactos})`],
        ["Pedidos", String(kpis.totalPedidos)],
        ["Facturación", fmtMoneda(kpis.facturacion)],
        ["Ticket promedio", fmtMoneda(kpis.ticket)],
        ["Atendido por bot", `${kpis.botPct}% (${kpis.botCount} mensajes)`],
        ["Tiempo prom. respuesta", fmtMin(kpis.tiempoPromMin)],
        ["Seguimientos vencidos", String(kpis.segVencidos)],
      ],
      headStyles: { fillColor: [156, 27, 27] },
      styles: { fontSize: 10 },
      alternateRowStyles: { fillColor: [252, 248, 240] },
    });
    // Vendor table
    const y2 = doc.lastAutoTable.finalY + 14;
    doc.setFontSize(14);
    doc.text("Rendimiento por vendedor", 14, y2);
    autoTable(doc, {
      startY: y2 + 4,
      head: [["Vendedor", "Contactos", "Nuevos", "Cerrados", "Conv.%", "Pedidos", "Facturación", "Mensajes"]],
      body: porVendedor.map((v) => [
        v.vendedor, v.contactos, v.nuevos, v.cerrados,
        `${v.conversion}%`, v.pedidos, fmtMoneda(v.facturacion), v.mensajes,
      ]),
      headStyles: { fillColor: [212, 161, 58], textColor: [40, 30, 20] },
      styles: { fontSize: 8.5 },
      alternateRowStyles: { fillColor: [252, 248, 240] },
    });
    doc.setFontSize(8);
    doc.setTextColor(140, 132, 114);
    doc.text(`Generado el ${new Date().toLocaleString("es-AR")} · NINIT CRM`, 14, 285);
    doc.save(`reporte-nm-${periodo}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Exportar CSV ──
  const exportarCSVBtn = () => {
    if (!data) return;
    exportarCSV(
      data.porVendedor.map((v) => ({
        Vendedor: v.vendedor,
        Contactos: v.contactos,
        "Nuevos período": v.nuevos,
        Cerrados: v.cerrados,
        "Conversión %": v.conversion,
        Pedidos: v.pedidos,
        Facturación: v.facturacion,
        Mensajes: v.mensajes,
      })),
      `vendedores-nm-${periodo}`
    );
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={{ flex: 1, height: "100vh", overflowY: "auto", background: "#f8fafc", fontFamily: FONT_BODY }}>

      {/* ── HEADER ── */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${C.border}`, padding: "16px 28px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: C.charcoal, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {vista === "stats" ? "📊 Reportes y Estadísticas" : "📦 Reporte de Pedidos"}
            </div>
            {vista === "stats" && data && !loading && (
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                {etiqueta(periodo)} · {fmtFechaLarga(data.inicio)} — {fmtFechaLarga(data.fin)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Vista dropdown */}
            <select value={vista} onChange={(e) => setVista(e.target.value)}
              style={{ border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 700, color: C.charcoal, background: "#fff", cursor: "pointer", outline: "none" }}>
              <option value="stats">📊 Estadísticas</option>
              <option value="pedidos">📦 Pedidos</option>
            </select>
            {/* Período dropdown */}
            {vista === "stats" && (
              <>
                <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                  style={{ border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 700, color: C.red, background: "#fff", cursor: "pointer", outline: "none" }}>
                  <option value="dia">Hoy</option>
                  <option value="semana">Últimos 7 días</option>
                  <option value="mes">Últimos 30 días</option>
                  <option value="anio">Este año</option>
                </select>
                {/* Exportar dropdown */}
                <select defaultValue="" onChange={(e) => { if (e.target.value === "pdf") exportarPDF(); if (e.target.value === "csv") exportarCSVBtn(); e.target.value = ""; }}
                  style={{ border: `1.5px solid ${C.red}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: FONT_BODY, fontWeight: 700, color: C.red, background: "#fff", cursor: "pointer", outline: "none" }}>
                  <option value="" disabled>↓ Exportar</option>
                  <option value="pdf">↓ PDF</option>
                  <option value="csv">↓ CSV</option>
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          VISTA: PEDIDOS POR FECHA
      ══════════════════════════════════════════════ */}
      {vista === "pedidos" && (
        <div style={{ padding: "28px 28px" }}>
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "28px 28px", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>

            {/* Selectores de fecha */}
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>Desde</div>
                <input type="date" value={pDesde} onChange={(e) => setPDesde(e.target.value)}
                  style={{ padding: "11px 14px", borderRadius: 9, border: `2px solid ${C.border}`, fontSize: 15, fontFamily: FONT_BODY, color: C.charcoal, outline: "none", background: "#f8fafc" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 7 }}>Hasta</div>
                <input type="date" value={pHasta} onChange={(e) => setPHasta(e.target.value)}
                  style={{ padding: "11px 14px", borderRadius: 9, border: `2px solid ${C.border}`, fontSize: 15, fontFamily: FONT_BODY, color: C.charcoal, outline: "none", background: "#f8fafc" }} />
              </div>
              <button onClick={buscarPedidos} disabled={loadingPed}
                style={{ background: C.red, color: "#fff", border: "none", borderRadius: 9, padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, minWidth: 130 }}>
                {loadingPed ? "Buscando…" : "🔍 Buscar"}
              </button>
              {pedResult && pedResult.length > 0 && (
                <>
                  <button onClick={exportarPedidosPDF}
                    style={{ background: C.red, color: "#fff", border: "none", borderRadius: 9, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY }}>
                    ↓ Imprimir PDF
                  </button>
                  <button onClick={exportarPedidosCSV}
                    style={{ background: C.sage, color: "#fff", border: "none", borderRadius: 9, padding: "12px 24px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY }}>
                    ↓ Descargar CSV
                  </button>
                </>
              )}
            </div>

            {pedResult === null && (
              <div style={{ color: C.muted, fontSize: 15, padding: "40px 0", textAlign: "center" }}>
                Elegí un rango de fechas y hacé clic en <strong>Buscar</strong>.
              </div>
            )}
            {pedResult !== null && pedResult.length === 0 && (
              <div style={{ color: C.muted, fontSize: 15, padding: "40px 0", textAlign: "center" }}>
                No hay pedidos entre esas fechas.
              </div>
            )}
            {pedResult && pedResult.length > 0 && (
              <>
                {/* Resumen */}
                <div style={{ display: "flex", gap: 32, marginBottom: 20, padding: "16px 20px", background: "#f8fafc", borderRadius: 10, border: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, color: C.muted }}>Pedidos: <strong style={{ color: C.charcoal, fontSize: 18 }}>{pedResult.length}</strong></div>
                  <div style={{ fontSize: 13, color: C.muted }}>Total: <strong style={{ color: C.sage, fontSize: 18 }}>{fmtMoneda(pedResult.reduce((s, p) => s + (Number(p.total) || 0), 0))}</strong></div>
                  <div style={{ fontSize: 13, color: C.muted }}>Ticket promedio: <strong style={{ color: C.charcoal, fontSize: 18 }}>{fmtMoneda(pedResult.reduce((s, p) => s + (Number(p.total) || 0), 0) / pedResult.length)}</strong></div>
                </div>

                {/* Tabla */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.border}`, background: "#f8fafc" }}>
                        {["N°","Fecha y hora","Cliente","Teléfono","Vendedor","Estado","Productos","Notas","Entrega","Dirección","Pago","Total"].map((h) => (
                          <th key={h} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: C.muted, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pedResult.map((p, i) => {
                        const det = parseDet(p.detalle);
                        const cliente = p.contactos?.nombre || p.contactos?.telefono || "—";
                        const tel = p.contactos?.telefono || "—";
                        const fecha = new Date(p.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                        const eColor = { pendiente: "#92400E", confirmado: "#1D4ED8", preparando: "#7C3AED", listo: "#15803D", entregado: "#374151", cancelado: "#B91C1C" }[p.estado] || C.muted;
                        const eBg   = { pendiente: "#FEF3C7", confirmado: "#DBEAFE", preparando: "#EDE9FE", listo: "#DCFCE7", entregado: "#F3F4F6", cancelado: "#FEE2E2" }[p.estado] || "#f1f5f9";
                        return (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "10px 12px", fontWeight: 700, color: C.charcoal, whiteSpace: "nowrap", fontSize: 12 }}>{shortId(p.id)}</td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: C.muted, fontSize: 12 }}>{fecha}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: C.charcoal, whiteSpace: "nowrap" }}>{cliente}</td>
                            <td style={{ padding: "10px 12px", color: C.muted, whiteSpace: "nowrap", fontSize: 12 }}>{tel}</td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{p.vendedor || "—"}</td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <span style={{ background: eBg, color: eColor, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 11 }}>{p.estado || "—"}</span>
                            </td>
                            <td style={{ padding: "10px 12px", minWidth: 180 }}>
                              {det.items.length > 0
                                ? det.items.map((it, k) => (
                                    <div key={k} style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                                      <strong>{it.qty}×</strong> {it.desc}{it.precio ? <span style={{ color: C.muted }}> — {fmtMoneda(it.precio)}</span> : ""}
                                    </div>
                                  ))
                                : "—"}
                            </td>
                            <td style={{ padding: "10px 12px", color: C.muted, fontSize: 12, maxWidth: 150 }}>{det.notas || "—"}</td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{det.entrega || "—"}</td>
                            <td style={{ padding: "10px 12px", color: C.muted, fontSize: 12, maxWidth: 140 }}>{det.direccion || "—"}</td>
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{det.pago || "—"}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 800, color: C.sage, whiteSpace: "nowrap", fontSize: 14 }}>{fmtMoneda(p.total)}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: `2px solid ${C.border}`, background: "#f1f5f9", fontWeight: 700 }}>
                        <td colSpan={11} style={{ padding: "12px 12px", color: C.charcoal, fontSize: 13 }}>TOTAL — {pedResult.length} pedidos</td>
                        <td style={{ padding: "12px 12px", color: C.sage, fontWeight: 800, fontSize: 15 }}>{fmtMoneda(pedResult.reduce((s, p) => s + (Number(p.total) || 0), 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          VISTA: ESTADÍSTICAS
      ══════════════════════════════════════════════ */}
      {vista === "stats" && (loading || !data ? (
        <div style={{ padding: 80, textAlign: "center", color: C.muted, fontSize: 15 }}>
          Cargando estadísticas…
        </div>
      ) : (
        <div style={{ padding: "24px 28px" }}>

          {/* ── KPIs — FILA 1 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 14, marginBottom: 14 }}>
            <Kpi icon="💬" label="Mensajes de clientes" valor={data.kpis.msgsIn}
              sub={`${data.kpis.msgsTotal} mensajes totales`} color={C.red} />
            <Kpi icon="👥" label="Contactos activos" valor={data.kpis.contactosActivos}
              sub={`de ${data.kpis.totalContactos} totales`} color="#6366f1" />
            <Kpi icon="🆕" label="Nuevos contactos" valor={data.kpis.nuevos}
              sub="creados en el período" color={C.gold} />
            <Kpi icon="🎯" label="Tasa de conversión" valor={`${data.kpis.tasaConversion}%`}
              sub={`${data.kpis.cerradosTot} cerrados / ${data.kpis.totalContactos} contactos`} color={C.sage} />
          </div>

          {/* ── KPIs — FILA 2 ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 14, marginBottom: 24 }}>
            <Kpi icon="📦" label="Pedidos" valor={data.kpis.totalPedidos}
              sub="del período" color="#0891b2" />
            <Kpi icon="💰" label="Facturación" valor={fmtMoneda(data.kpis.facturacion)}
              color="#16a34a" chico />
            <Kpi icon="🧾" label="Ticket promedio" valor={fmtMoneda(data.kpis.ticket)}
              color="#ea580c" chico />
            <Kpi icon="⏱️" label="T. resp. promedio" valor={fmtMin(data.kpis.tiempoPromMin)}
              sub="tiempo hasta primera respuesta" color={C.charcoal} />
            <Kpi icon="🤖" label="Mensajes bot" valor={`${data.kpis.botPct}%`}
              sub={`${data.kpis.agenteCount} por agentes`} color="#8b5cf6" />
            {data.kpis.segVencidos > 0 && (
              <Kpi icon="📌" label="Seg. vencidos" valor={data.kpis.segVencidos}
                sub="requieren atención" color={C.red} alerta />
            )}
          </div>

          {/* ── ACTIVIDAD TEMPORAL ── */}
          <Panel titulo="Actividad diaria — mensajes y nuevos contactos" style={{ marginBottom: 18 }}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.serie} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <defs>
                  <linearGradient id="gClientes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.red}  stopOpacity={0.18} />
                    <stop offset="95%" stopColor={C.red}  stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gResp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.gold} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={C.gold} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gNuevos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.sage} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.sage} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: C.muted }} />
                <YAxis tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} />
                <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 8 }} />
                <Area type="monotone" dataKey="clientes" name="Clientes" stroke={C.red} fill="url(#gClientes)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="respuestas" name="Respuestas" stroke={C.gold} fill="url(#gResp)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="nuevos" name="Nuevos" stroke={C.sage} fill="url(#gNuevos)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* ── FILA: HORA PICO + FUNNEL ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18, marginBottom: 18 }}>

            {/* Hora pico */}
            <Panel titulo="Horas pico — cuándo escriben los clientes"
              badge={<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>por hora del día</span>}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.horarios} margin={{ top: 5, right: 5, left: -20, bottom: 5 }} barSize={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="hora" tick={{ fontSize: 9.5, fill: C.muted }}
                    interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} allowDecimals={false} />
                  <Tooltip content={<TooltipHoras />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="clientes" name="Clientes" fill={C.red} radius={[3,3,0,0]} />
                  <Bar dataKey="respuestas" name="Respuestas" fill={C.gold} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Funnel de estados */}
            <Panel titulo="Pipeline — embudo de contactos por estado"
              badge={<span style={{ fontSize: 11, background: C.cream, color: C.charcoal, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{data.kpis.totalContactos} total</span>}>
              <Funnel data={data.porEstado} />
              <div style={{ marginTop: 18, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  Estado del bot
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#22c55e", fontFamily: FONT_DISPLAY }}>{data.kpis.botAutonomo}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>🤖 Bot activo</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.red, fontFamily: FONT_DISPLAY }}>{data.kpis.agenteManual}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>✋ Agente manual</div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* ── RENDIMIENTO POR VENDEDOR — GRÁFICO ── */}
          <Panel titulo="Rendimiento por vendedor" style={{ marginBottom: 18 }}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.vendedoresActivos.length > 0 ? data.vendedoresActivos : data.porVendedor}
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="vendedor" tick={{ fontSize: 12, fill: C.muted }} />
                <YAxis tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} />
                <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 8 }} />
                <Bar dataKey="contactos" name="Contactos asignados" fill={`${C.gold}cc`} radius={[4,4,0,0]} />
                <Bar dataKey="cerrados"  name="Cerrados / Pedidos"  fill={C.red}  radius={[4,4,0,0]} />
                <Bar dataKey="mensajes"  name="Mensajes enviados"   fill={C.sage} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {/* ── TABLA DETALLE VENDEDORES ── */}
          <Panel titulo="Detalle por vendedor">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    {["Vendedor","Contactos","Nuevos","Cerrados","Conversión","Pedidos","Facturación","Mensajes"].map((h) => (
                      <th key={h} style={{ padding: "9px 12px", fontWeight: 700, fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4, color: C.muted, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.porVendedor.map((v, i) => {
                    const esMejor = data.porVendedor.reduce((best, x) => x.cerrados > best.cerrados ? x : best, data.porVendedor[0])?.vendedor === v.vendedor && v.cerrados > 0;
                    return (
                      <tr key={v.vendedor} style={{ borderBottom: `1px solid ${C.border}`, background: esMejor ? "#fef9c3" : i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: C.charcoal, whiteSpace: "nowrap" }}>
                          {esMejor && <span title="Top vendedor" style={{ marginRight: 6 }}>🏆</span>}
                          {v.vendedor}
                        </td>
                        <td style={{ padding: "10px 12px", color: C.ink }}>{v.contactos}</td>
                        <td style={{ padding: "10px 12px", color: C.ink }}>{v.nuevos}</td>
                        <td style={{ padding: "10px 12px", color: C.ink }}>{v.cerrados}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{
                            background: v.conversion >= 50 ? "#dcfce7" : v.conversion >= 25 ? "#fef9c3" : "#fee2e2",
                            color: v.conversion >= 50 ? "#15803d" : v.conversion >= 25 ? "#854d0e" : C.redDark,
                            padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12.5,
                          }}>
                            {v.conversion}%
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: C.ink }}>{v.pedidos}</td>
                        <td style={{ padding: "10px 12px", color: C.ink, fontWeight: 600 }}>{fmtMoneda(v.facturacion)}</td>
                        <td style={{ padding: "10px 12px", color: C.ink }}>{v.mensajes}</td>
                      </tr>
                    );
                  })}
                  {/* Totales */}
                  <tr style={{ borderTop: `2px solid ${C.border}`, background: "#f1f5f9", fontWeight: 700 }}>
                    <td style={{ padding: "10px 12px", color: C.charcoal }}>TOTAL</td>
                    <td style={{ padding: "10px 12px" }}>{data.porVendedor.reduce((s,v) => s+v.contactos, 0)}</td>
                    <td style={{ padding: "10px 12px" }}>{data.porVendedor.reduce((s,v) => s+v.nuevos, 0)}</td>
                    <td style={{ padding: "10px 12px" }}>{data.porVendedor.reduce((s,v) => s+v.cerrados, 0)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: "#f1f5f9", color: C.charcoal, padding: "3px 10px", borderRadius: 20, fontWeight: 700, fontSize: 12.5 }}>
                        {data.kpis.tasaConversion}%
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{data.kpis.totalPedidos}</td>
                    <td style={{ padding: "10px 12px", color: C.sage }}>{fmtMoneda(data.kpis.facturacion)}</td>
                    <td style={{ padding: "10px 12px" }}>{data.kpis.agenteCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          {/* ── DISTRIBUCIÓN PIE ── */}
          <Panel titulo="Distribución por estado (acumulado)" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
              <ResponsiveContainer width={260} height={220}>
                <PieChart>
                  <Pie data={data.porEstado.filter((e) => e.value > 0)} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={85} innerRadius={40}
                    label={false} labelLine={false}>
                    {data.porEstado.map((e, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12.5 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.porEstado.map((e, i) => (
                  <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: PALETA[i % PALETA.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, color: C.charcoal, fontWeight: 500 }}>{e.name}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: C.charcoal }}>{e.value}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>
                      ({data.kpis.totalContactos > 0 ? Math.round(e.value / data.kpis.totalContactos * 100) : 0}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <div style={{ height: 40 }} />
        </div>
      ))}

    </div>
  );
}
