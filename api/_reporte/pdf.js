// Generación del PDF del reporte diario.
//
// Se dibuja con jsPDF + autoTable (ya estaban en el proyecto para exportar
// Reportes), usando la paleta de src/theme.js para que el PDF se vea como el
// CRM. Todo vectorial: pesa poco y se ve nítido impreso.
//
// Nota: las fuentes base de jsPDF (Helvetica) no soportan emojis. Los acentos
// del español sí, así que el texto va con acentos pero sin emojis.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fechaLarga, fechaHora, hhmm, TZ } from "./dia.js";

// ── Paleta (espejo de src/theme.js) ────────────────────────────────────
const COL = {
  nav: [23, 28, 47],
  ink: [23, 27, 38],
  muted: [107, 115, 131],
  faint: [152, 160, 176],
  border: [230, 233, 239],
  soft: [247, 248, 250],
  primary: [79, 98, 216],
  primarySoft: [238, 240, 252],
  ai: [109, 79, 224],
  aiSoft: [241, 237, 253],
  success: [34, 197, 94],
  successSoft: [230, 248, 238],
  warning: [217, 119, 6],
  warningSoft: [254, 243, 199],
  danger: [220, 38, 38],
  dangerSoft: [254, 226, 226],
  white: [255, 255, 255],
};

const M = 40;                 // margen
const W = 595.28;             // ancho A4 (pt)
const H = 841.89;             // alto A4 (pt)
const CW = W - M * 2;         // ancho útil

const usd = (n) => "US$ " + Math.round(n || 0).toLocaleString("en-US");
const pct = (n) => (n == null ? "—" : Math.round(n * 100) + "%");

function fmtMin(m) {
  if (m == null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Variación porcentual contra una referencia, lista para mostrar. */
function delta(hoy, ref) {
  if (ref == null || ref === 0) return hoy > 0 ? { txt: "nuevo", color: COL.success } : null;
  const d = Math.round((hoy - ref) / ref * 100);
  if (d === 0) return { txt: "igual", color: COL.muted };
  return { txt: `${d > 0 ? "+" : ""}${d}%`, color: d > 0 ? COL.success : COL.danger };
}

// ── Primitivas de dibujo ───────────────────────────────────────────────
function texto(doc, str, x, y, { size = 9, color = COL.ink, bold = false, align = "left", maxW } = {}) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const t = maxW ? doc.splitTextToSize(String(str), maxW) : String(str);
  doc.text(t, x, y, { align });
  return Array.isArray(t) ? t.length : 1;
}

/**
 * Parte un texto en líneas para un ancho dado.
 * Fija fuente y tamaño ANTES de medir: jsPDF mide con el estado actual, así que
 * calcular el ancho con otro tamaño activo hace que el texto se salga del margen.
 */
function envolver(doc, str, w, size = 9, bold = false) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  return doc.splitTextToSize(String(str), w);
}

function caja(doc, x, y, w, h, { fill, borde = COL.border, r = 8 } = {}) {
  if (fill) doc.setFillColor(...fill);
  doc.setDrawColor(...borde);
  doc.setLineWidth(0.7);
  doc.roundedRect(x, y, w, h, r, r, fill ? (borde ? "FD" : "F") : "S");
}

// ── Encabezado y pie ───────────────────────────────────────────────────
function encabezado(doc, metricas, primera) {
  const alto = primera ? 96 : 52;
  doc.setFillColor(...COL.nav);
  doc.rect(0, 0, W, alto, "F");
  // Filete de acento
  doc.setFillColor(...COL.primary);
  doc.rect(0, alto - 3, W * 0.42, 3, "F");
  doc.setFillColor(...COL.ai);
  doc.rect(W * 0.42, alto - 3, W * 0.58, 3, "F");

  if (primera) {
    texto(doc, "NINIT GROUP", M, 42, { size: 22, bold: true, color: COL.white });
    texto(doc, "Luxury Restroom Trailers", M, 57, { size: 8.5, color: [154, 163, 188] });
    texto(doc, "REPORTE DIARIO DE OPERACIONES", W - M, 36, {
      size: 10, bold: true, color: COL.white, align: "right",
    });
    texto(doc, fechaLarga(metricas.fecha, metricas.tz || TZ), W - M, 51, {
      size: 9, color: [154, 163, 188], align: "right",
    });
    texto(doc, `Generado ${fechaHora(metricas.generadoAt, metricas.tz || TZ)} h`, W - M, 64, {
      size: 7.5, color: [122, 131, 156], align: "right",
    });
    texto(doc, "CONFIDENCIAL - USO INTERNO", M, 76, { size: 7, color: [122, 131, 156] });
  } else {
    texto(doc, "NINIT GROUP", M, 30, { size: 11, bold: true, color: COL.white });
    texto(doc, `Reporte diario - ${fechaLarga(metricas.fecha, metricas.tz || TZ)}`, W - M, 30, {
      size: 8.5, color: [154, 163, 188], align: "right",
    });
  }
  return alto + (primera ? 26 : 22);
}

function pies(doc, metricas) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COL.border);
    doc.setLineWidth(0.7);
    doc.line(M, H - 34, W - M, H - 34);
    texto(doc, "NINIT CRM - Reporte automático generado por el asistente de IA", M, H - 22, {
      size: 7.5, color: COL.faint,
    });
    texto(doc, `Página ${i} de ${total}`, W - M, H - 22, { size: 7.5, color: COL.faint, align: "right" });
  }
}

/** Título de sección con barrita de acento. */
function seccion(doc, titulo, y, { color = COL.primary, sub } = {}) {
  doc.setFillColor(...color);
  doc.roundedRect(M, y - 9, 3.5, 12, 2, 2, "F");
  texto(doc, titulo.toUpperCase(), M + 10, y, { size: 10.5, bold: true, color: COL.ink });
  if (sub) texto(doc, sub, W - M, y, { size: 8, color: COL.muted, align: "right" });
  return y + 14;
}

// ── Bloques ────────────────────────────────────────────────────────────

/** Tarjetas de KPI en grilla de 4 columnas. */
function kpiGrid(doc, y, tarjetas, { cols = 4, alto = 58 } = {}) {
  const gap = 10;
  const w = (CW - gap * (cols - 1)) / cols;
  tarjetas.forEach((t, i) => {
    const fila = Math.floor(i / cols), col = i % cols;
    const x = M + col * (w + gap);
    const yy = y + fila * (alto + gap);
    caja(doc, x, yy, w, alto, { fill: t.destacado ? COL.primarySoft : COL.white });
    if (t.destacado) caja(doc, x, yy, w, alto, { borde: COL.primary, r: 8 });
    texto(doc, t.label.toUpperCase(), x + 11, yy + 16, { size: 6.8, bold: true, color: COL.muted });
    texto(doc, t.valor, x + 11, yy + 36, {
      size: String(t.valor).length > 9 ? 13 : 16.5, bold: true, color: t.color || COL.ink,
    });
    if (t.delta) texto(doc, t.delta.txt, x + w - 11, yy + 16, { size: 7.5, bold: true, color: t.delta.color, align: "right" });
    if (t.sub) texto(doc, t.sub, x + 11, yy + 49, { size: 7, color: COL.muted, maxW: w - 20 });
  });
  const filas = Math.ceil(tarjetas.length / cols);
  return y + filas * (alto + gap);
}

/** Gráfico de barras agrupadas por hora del día. */
function graficoHoras(doc, y, horas) {
  const alto = 116, base = y + alto;
  const max = Math.max(...horas.map((h) => Math.max(h.entrantes, h.salientes)), 1);
  const paso = CW / 24;
  const bw = Math.min(7, paso / 2 - 1.5);

  caja(doc, M, y - 4, CW, alto + 30, { fill: COL.soft, borde: COL.border });

  // Grilla horizontal
  doc.setDrawColor(...COL.border);
  doc.setLineWidth(0.5);
  for (let i = 0; i <= 3; i++) {
    const gy = base - (alto - 14) * (i / 3);
    doc.line(M + 26, gy, M + CW - 8, gy);
    texto(doc, String(Math.round(max * i / 3)), M + 22, gy + 2.5, { size: 6, color: COL.faint, align: "right" });
  }

  horas.forEach((h, i) => {
    const x = M + 30 + i * ((CW - 40) / 24);
    const hIn = (alto - 14) * (h.entrantes / max);
    const hOut = (alto - 14) * (h.salientes / max);
    doc.setFillColor(...COL.primary);
    if (hIn > 0) doc.roundedRect(x, base - hIn, bw, hIn, 1.5, 1.5, "F");
    doc.setFillColor(...COL.ai);
    if (hOut > 0) doc.roundedRect(x + bw + 1.5, base - hOut, bw, hOut, 1.5, 1.5, "F");
    if (i % 3 === 0) texto(doc, `${String(i).padStart(2, "0")}h`, x + bw, base + 10, { size: 6, color: COL.faint, align: "center" });
  });

  // Leyenda
  const ly = base + 22;
  doc.setFillColor(...COL.primary); doc.circle(M + 32, ly - 2.5, 3, "F");
  texto(doc, "Mensajes de clientes", M + 39, ly, { size: 7.5, color: COL.muted });
  doc.setFillColor(...COL.ai); doc.circle(M + 155, ly - 2.5, 3, "F");
  texto(doc, "Respuestas enviadas", M + 162, ly, { size: 7.5, color: COL.muted });

  return y + alto + 36;
}

/** Barra apilada: bot vs equipo humano. */
function barraBotHumano(doc, x, y, w, k) {
  const total = k.porBot + k.porHumano;
  const h = 16;
  if (!total) {
    caja(doc, x, y, w, h, { fill: COL.soft });
    texto(doc, "Sin mensajes salientes", x + w / 2, y + 11, { size: 7.5, color: COL.faint, align: "center" });
    return y + h + 16;
  }
  const wBot = w * (k.porBot / total);
  doc.setFillColor(...COL.ai);
  doc.roundedRect(x, y, w, h, 4, 4, "F");
  if (wBot > 6) {
    doc.setFillColor(...COL.primary);
    doc.roundedRect(x, y, Math.max(wBot, 8), h, 4, 4, "F");
  }
  if (wBot > 40) texto(doc, `Bot ${k.botPct}%`, x + 8, y + 11, { size: 7.5, bold: true, color: COL.white });
  if (w - wBot > 60) texto(doc, `Equipo ${100 - k.botPct}%`, x + w - 8, y + 11, { size: 7.5, bold: true, color: COL.white, align: "right" });
  texto(doc, `${k.porBot} mensajes automáticos`, x, y + h + 12, { size: 7.5, color: COL.muted });
  texto(doc, `${k.porHumano} escritos por vendedores`, x + w, y + h + 12, { size: 7.5, color: COL.muted, align: "right" });
  return y + h + 18;
}

/** Mini gráfico de los últimos 8 días (7 previos + hoy). */
function graficoTendencia(doc, x, y, w, comparativa) {
  const dias = [...comparativa.serie7, comparativa.hoy];
  const alto = 54, base = y + alto;
  const max = Math.max(...dias.map((d) => d.mensajes), 1);
  const paso = w / dias.length;
  dias.forEach((d, i) => {
    const bh = Math.max((alto - 10) * (d.mensajes / max), 1.5);
    const bx = x + i * paso + paso * 0.2;
    const bw = paso * 0.6;
    const esHoy = i === dias.length - 1;
    doc.setFillColor(...(esHoy ? COL.primary : [214, 219, 232]));
    doc.roundedRect(bx, base - bh, bw, bh, 1.5, 1.5, "F");
    texto(doc, d.fecha.slice(8), bx + bw / 2, base + 9, {
      size: 6, color: esHoy ? COL.primary : COL.faint, bold: esHoy, align: "center",
    });
    if (esHoy) texto(doc, String(d.mensajes), bx + bw / 2, base - bh - 3, { size: 6.5, bold: true, color: COL.primary, align: "center" });
  });
  return base + 14;
}

/** Lista con viñetas de colores (destacados / riesgos / recomendaciones). */
function listaBullets(doc, x, y, w, items, color) {
  for (const it of items) {
    const lineas = envolver(doc, it, w - 14, 8.5);
    doc.setFillColor(...color);
    doc.circle(x + 3, y - 2.5, 2, "F");
    texto(doc, lineas, x + 11, y, { size: 8.5, color: COL.ink });
    y += lineas.length * 11 + 3;
  }
  return y;
}

function nuevaPagina(doc, metricas) {
  doc.addPage();
  return encabezado(doc, metricas, false);
}

/** Salta de página si no entran `alto` puntos. */
function asegurar(doc, y, alto, metricas) {
  return y + alto > H - 50 ? nuevaPagina(doc, metricas) : y;
}

// ── Documento ──────────────────────────────────────────────────────────
export function generarPDF(metricas, resumenIA) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({
    title: `NINIT - Reporte diario ${metricas.fecha}`,
    subject: "Resumen de operaciones del día",
    author: "NINIT CRM",
    creator: "NINIT CRM - Asistente de IA",
  });

  const k = metricas.kpis;
  const c = metricas.comparativa;
  let y = encabezado(doc, metricas, true);

  // ── 1. Resumen ejecutivo ─────────────────────────────────────────────
  y = seccion(doc, "Resumen ejecutivo", y, {
    color: COL.ai,
    sub: resumenIA.generadoPorIA ? "Análisis del asistente de IA" : "Resumen automático",
  });
  const lineasRes = envolver(doc, resumenIA.resumen, CW - 28, 9);
  const altoRes = lineasRes.length * 11.5 + 22;
  caja(doc, M, y - 4, CW, altoRes, { fill: COL.aiSoft, borde: [225, 217, 250] });
  texto(doc, lineasRes, M + 14, y + 11, { size: 9, color: COL.ink });
  y += altoRes + 16;

  // ── 2. KPIs del día ──────────────────────────────────────────────────
  y = seccion(doc, "Números del día", y, { sub: "Variación vs. promedio de los 7 días previos" });
  y = kpiGrid(doc, y, [
    { label: "Mensajes totales", valor: String(k.mensajes), delta: delta(k.mensajes, c.prom7.mensajes),
      sub: `${k.entrantes} de clientes · ${k.salientes} enviados`, destacado: true },
    { label: "Conversaciones", valor: String(k.chatsActivos), delta: delta(k.chatsActivos, c.prom7.chats),
      sub: `${k.chatsConEntrante} clientes escribieron` },
    { label: "Clientes nuevos", valor: String(k.clientesNuevos), delta: delta(k.clientesNuevos, c.prom7.nuevos),
      sub: k.leadsSinAsignar ? `${k.leadsSinAsignar} sin asignar` : "todos asignados",
      color: k.clientesNuevos ? COL.success : COL.ink },
    { label: "Facturado", valor: usd(k.facturacion), delta: delta(k.facturacion, c.prom7.facturacion),
      sub: `${k.pedidos} pedidos · ticket ${usd(k.ticket)}`, color: k.facturacion ? COL.success : COL.ink },
    { label: "Tasa de respuesta", valor: k.tasaRespuesta == null ? "—" : `${k.tasaRespuesta}%`,
      sub: `${k.chatsSinResponder} chats sin responder`,
      color: k.tasaRespuesta != null && k.tasaRespuesta < 80 ? COL.warning : COL.ink },
    { label: "Respuesta (mediana)", valor: fmtMin(k.respuestaMedianaMin),
      sub: `${k.primerasRespuestas} respuestas del equipo`,
      color: k.respuestaMedianaMin != null && k.respuestaMedianaMin > 60 ? COL.warning : COL.ink },
    { label: "Cerrados hoy", valor: String(k.cerrados), sub: `${k.seguimientosVencidos} seguimientos vencidos`,
      color: k.cerrados ? COL.success : COL.ink },
    { label: "Automatización", valor: `${k.botPct}%`, sub: `bot ${k.porBot} · equipo ${k.porHumano}`, color: COL.ai },
  ]);
  y += 8;

  // ── 3. Actividad por hora + tendencia ────────────────────────────────
  y = asegurar(doc, y, 200, metricas);
  y = seccion(doc, "Actividad por hora", y, {
    sub: k.horaPico != null ? `Hora pico: ${String(k.horaPico).padStart(2, "0")}:00 h` : "Sin actividad",
  });
  y = graficoHoras(doc, y, metricas.horas);

  y = asegurar(doc, y, 130, metricas);
  const colW = (CW - 18) / 2;
  const yBloque = seccion(doc, "Bot vs. equipo", y);
  const yBot = barraBotHumano(doc, M, yBloque + 4, colW, k);
  texto(doc, "Tendencia de mensajes (8 días)", M + colW + 18, y, { size: 10.5, bold: true, color: COL.ink });
  const yTend = graficoTendencia(doc, M + colW + 18, yBloque + 4, colW, c);
  y = Math.max(yBot, yTend) + 12;

  // ── 4. Destacados / riesgos / acciones ───────────────────────────────
  if (resumenIA.destacados.length || resumenIA.riesgos.length || resumenIA.recomendaciones.length) {
    y = asegurar(doc, y, 150, metricas);
    y = seccion(doc, "Lectura del día", y, { color: COL.ai });
    if (resumenIA.destacados.length) {
      texto(doc, "LO QUE FUNCIONÓ", M, y + 6, { size: 7.5, bold: true, color: COL.success });
      y = listaBullets(doc, M, y + 20, CW, resumenIA.destacados, COL.success) + 4;
    }
    if (resumenIA.riesgos.length) {
      y = asegurar(doc, y, 60, metricas);
      texto(doc, "PUNTOS DE ATENCIÓN", M, y + 6, { size: 7.5, bold: true, color: COL.danger });
      y = listaBullets(doc, M, y + 20, CW, resumenIA.riesgos, COL.danger) + 4;
    }
    if (resumenIA.recomendaciones.length) {
      y = asegurar(doc, y, 60, metricas);
      texto(doc, "ACCIONES PARA MAÑANA", M, y + 6, { size: 7.5, bold: true, color: COL.primary });
      y = listaBullets(doc, M, y + 20, CW, resumenIA.recomendaciones, COL.primary) + 4;
    }
  }

  // ── 5. Rendimiento por vendedor ──────────────────────────────────────
  y = asegurar(doc, y, 180, metricas);
  y = seccion(doc, "Rendimiento por vendedor", y, {
    sub: metricas.porVendedor.length ? `${metricas.porVendedor.length} con actividad` : "Sin actividad",
  });

  if (metricas.porVendedor.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["#", "Vendedor", "Efectividad", "Msj", "Chats", "Respuesta", "Cobertura", "Nuevos", "Cerr.", "Facturado"]],
      body: metricas.porVendedor.map((v, i) => [
        String(i + 1), v.vendedor, v.efectividad, v.mensajes, v.chats,
        fmtMin(v.respuestaMedianaMin), pct(v.cobertura), v.nuevosAsignados, v.cerrados,
        v.facturacion ? usd(v.facturacion) : "—",
      ]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 6, bottom: 6, left: 5, right: 5 }, textColor: COL.ink },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: COL.muted, fillColor: COL.soft, lineWidth: { bottom: 0.7 }, lineColor: COL.border },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: {
        0: { cellWidth: 16, textColor: COL.faint },
        1: { cellWidth: 74, fontStyle: "bold" },
        2: { cellWidth: 72 },
        3: { cellWidth: 28, halign: "right" },
        4: { cellWidth: 32, halign: "right" },
        5: { cellWidth: 48, halign: "right" },
        6: { cellWidth: 48, halign: "right" },
        7: { cellWidth: 38, halign: "right" },
        8: { cellWidth: 28, halign: "right" },
        9: { cellWidth: "auto", halign: "right" },
      },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 2) d.cell.text = [];
        if (d.section === "body" && d.column.index === 0 && d.row.index === 0) {
          d.cell.styles.textColor = COL.primary;
          d.cell.styles.fontStyle = "bold";
        }
      },
      didDrawCell: (d) => {
        // Barra de efectividad dibujada a mano dentro de la celda.
        if (d.section !== "body" || d.column.index !== 2) return;
        const v = metricas.porVendedor[d.row.index];
        const bw = d.cell.width - 34;
        const by = d.cell.y + d.cell.height / 2 - 3.5;
        const color = v.efectividad >= 70 ? COL.success : v.efectividad >= 45 ? COL.warning : COL.danger;
        doc.setFillColor(...COL.border);
        doc.roundedRect(d.cell.x + 4, by, bw, 7, 3.5, 3.5, "F");
        if (v.efectividad > 0) {
          doc.setFillColor(...color);
          doc.roundedRect(d.cell.x + 4, by, Math.max(bw * v.efectividad / 100, 4), 7, 3.5, 3.5, "F");
        }
        texto(doc, String(v.efectividad), d.cell.x + d.cell.width - 4, by + 6.5, {
          size: 7.5, bold: true, color, align: "right",
        });
      },
    });
    y = doc.lastAutoTable.finalY + 10;

    const lider = metricas.porVendedor[0];
    const ultimo = metricas.porVendedor[metricas.porVendedor.length - 1];
    const notas = [
      `Mejor desempeño: ${lider.vendedor} (efectividad ${lider.efectividad}, ${lider.mensajes} mensajes, respuesta ${fmtMin(lider.respuestaMedianaMin)}).`,
    ];
    if (metricas.porVendedor.length > 1) {
      notas.push(`Menor desempeño: ${ultimo.vendedor} (efectividad ${ultimo.efectividad}, ${ultimo.mensajes} mensajes${ultimo.chatsPendientesCartera ? `, ${ultimo.chatsPendientesCartera} chats sin responder` : ""}).`);
    }
    if (metricas.inactivos.length) notas.push(`Sin actividad hoy: ${metricas.inactivos.join(", ")}.`);
    caja(doc, M, y, CW, notas.length * 11 + 14, { fill: COL.soft });
    let ny = y + 15;
    for (const n of notas) { texto(doc, n, M + 12, ny, { size: 7.8, color: COL.muted, maxW: CW - 24 }); ny += 11; }
    y = y + notas.length * 11 + 22;

    texto(doc, "Efectividad = 45% velocidad de respuesta + 30% cobertura de su cartera + 25% resultados (cierres y pedidos), relativo al mejor del día.",
      M, y, { size: 6.8, color: COL.faint, maxW: CW });
    y += 16;
  } else {
    caja(doc, M, y, CW, 34, { fill: COL.soft });
    texto(doc, "Ningún vendedor registró actividad en el día.", M + 12, y + 21, { size: 8.5, color: COL.muted });
    y += 46;
  }

  // ── 6. Conversaciones del día ────────────────────────────────────────
  if (metricas.conversaciones.length) {
    y = asegurar(doc, y, 150, metricas);
    y = seccion(doc, "Conversaciones más activas", y, { sub: `${metricas.conversaciones.length} conversaciones en total` });
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Cliente", "Vendedor", "Estado", "Msj", "Últ.", "Último mensaje"]],
      body: metricas.conversaciones.slice(0, 14).map((c) => [
        c.nombre + (c.nuevo ? "  (nuevo)" : ""),
        c.vendedor, c.estado, c.mensajes,
        c.ultimoAt ? hhmm(c.ultimoAt, metricas.tz) : "—",
        c.ultimoTexto || "—",
      ]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: { top: 5, bottom: 5, left: 5, right: 5 }, textColor: COL.ink, overflow: "ellipsize" },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: COL.muted, fillColor: COL.soft, lineWidth: { bottom: 0.7 }, lineColor: COL.border },
      alternateRowStyles: { fillColor: [252, 252, 254] },
      columnStyles: {
        0: { cellWidth: 104, fontStyle: "bold" },
        1: { cellWidth: 62 },
        2: { cellWidth: 58, textColor: COL.muted },
        3: { cellWidth: 26, halign: "right" },
        4: { cellWidth: 38, halign: "right", textColor: COL.muted },
        5: { cellWidth: "auto", textColor: COL.muted },
      },
    });
    y = doc.lastAutoTable.finalY + 18;
  }

  // ── 7. Pendientes que quedaron abiertos ──────────────────────────────
  const p = metricas.pendientes;
  const hayPendientes = p.sinResponder.length || p.seguimientos.length || p.leadsSinAsignar.length;
  if (hayPendientes) {
    y = asegurar(doc, y, 140, metricas);
    y = seccion(doc, "Pendientes al cierre del día", y, { color: COL.danger });

    if (p.sinResponder.length) {
      texto(doc, `CLIENTES ESPERANDO RESPUESTA (${p.sinResponder.length})`, M, y + 4, { size: 7.5, bold: true, color: COL.danger });
      autoTable(doc, {
        startY: y + 10,
        margin: { left: M, right: M },
        head: [["Cliente", "Vendedor", "Estado", "Escribió", "Esperando"]],
        body: p.sinResponder.map((s) => [
          s.nombre, s.vendedor, s.estado, hhmm(s.desde, metricas.tz), fmtMin(s.esperaMin),
        ]),
        theme: "plain",
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 } },
        headStyles: { fontStyle: "bold", fontSize: 6.8, textColor: COL.muted, fillColor: COL.dangerSoft },
        columnStyles: {
          0: { cellWidth: 150, fontStyle: "bold" },
          1: { cellWidth: 90 },
          2: { cellWidth: 90, textColor: COL.muted },
          3: { cellWidth: 60, halign: "right", textColor: COL.muted },
          4: { cellWidth: "auto", halign: "right", textColor: COL.danger, fontStyle: "bold" },
        },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    if (p.seguimientos.length) {
      y = asegurar(doc, y, 90, metricas);
      texto(doc, `SEGUIMIENTOS VENCIDOS (${k.seguimientosVencidos})`, M, y + 4, { size: 7.5, bold: true, color: COL.warning });
      autoTable(doc, {
        startY: y + 10,
        margin: { left: M, right: M },
        head: [["Cliente", "Vendedor", "Estado", "Venció", "Nota"]],
        body: p.seguimientos.map((s) => [
          s.nombre, s.vendedor, s.estado, fechaHora(s.seguimiento_at, metricas.tz), s.nota || "—",
        ]),
        theme: "plain",
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: { top: 4.5, bottom: 4.5, left: 5, right: 5 }, overflow: "ellipsize" },
        headStyles: { fontStyle: "bold", fontSize: 6.8, textColor: COL.muted, fillColor: COL.warningSoft },
        columnStyles: {
          0: { cellWidth: 120, fontStyle: "bold" },
          1: { cellWidth: 70 },
          2: { cellWidth: 70, textColor: COL.muted },
          3: { cellWidth: 78, halign: "right", textColor: COL.muted },
          4: { cellWidth: "auto", textColor: COL.muted },
        },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    if (p.leadsSinAsignar.length) {
      y = asegurar(doc, y, 70, metricas);
      texto(doc, `LEADS NUEVOS SIN VENDEDOR (${p.leadsSinAsignar.length})`, M, y + 4, { size: 7.5, bold: true, color: COL.primary });
      let ly = y + 18;
      for (const l of p.leadsSinAsignar) {
        texto(doc, `${l.nombre} - entró ${hhmm(l.created_at, metricas.tz)} h (${l.estado})`, M + 4, ly, { size: 8, color: COL.ink });
        ly += 11;
      }
      y = ly + 8;
    }
  }

  // ── 8. Cierres y pedidos del día ─────────────────────────────────────
  if (metricas.pedidosDelDia.length) {
    y = asegurar(doc, y, 120, metricas);
    y = seccion(doc, "Pedidos cargados hoy", y, { color: COL.success, sub: usd(k.facturacion) });
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [["Cliente", "Vendedor", "Estado", "Total"]],
      body: metricas.pedidosDelDia.map((p2) => [p2.cliente, p2.vendedor, p2.estado, usd(p2.total)]),
      foot: [["", "", "TOTAL", usd(k.facturacion)]],
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 5, right: 5 } },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: COL.muted, fillColor: COL.successSoft },
      footStyles: { fontStyle: "bold", fontSize: 8.5, textColor: COL.ink, fillColor: COL.soft },
      columnStyles: {
        0: { cellWidth: 190, fontStyle: "bold" },
        1: { cellWidth: 110 },
        2: { cellWidth: 100, textColor: COL.muted },
        3: { cellWidth: "auto", halign: "right", fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // ── 9. Cierre ────────────────────────────────────────────────────────
  y = asegurar(doc, y, 60, metricas);
  caja(doc, M, y, CW, 40, { fill: COL.soft });
  texto(doc, `Reporte del ${fechaLarga(metricas.fecha, metricas.tz)} - día completo de 00:00 a 23:59 (${metricas.tz}).`,
    M + 12, y + 17, { size: 7.8, color: COL.muted, maxW: CW - 24 });
  texto(doc, "Los datos salen directo de la base del CRM en el momento de la generación. Para el detalle en vivo, entrá al panel de Reportes.",
    M + 12, y + 29, { size: 7.8, color: COL.muted, maxW: CW - 24 });

  pies(doc, metricas);
  return Buffer.from(doc.output("arraybuffer"));
}
