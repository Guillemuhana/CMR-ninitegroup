import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cabecera, pie, TABLA } from "./imprimir";

export function docHojaRutaProspectos(paradas, opciones = {}) {
  const { zona = "", busqueda = "", enlaces = [], vendedores = {} } = opciones;
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const hoy = new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const subtitulo = [busqueda, zona].filter(Boolean).join(" · ");

  let y = cabecera(doc, "Hoja de ruta — Clientes potenciales", `${subtitulo}${subtitulo ? " · " : ""}${hoy}`, "l");

  if (!paradas.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.setTextColor(130, 122, 105);
    doc.text("No hay clientes para armar la hoja de ruta.", 14, y + 6);
    pie(doc, "l");
    return doc;
  }

  autoTable(doc, {
    ...TABLA,
    startY: y,
    head: [["", "#", "Negocio", "Dirección", "Teléfono", "Prioridad", "Vendedor", "Notas de la visita"]],
    body: paradas.map((p, i) => [
      "",                         // casilla para tildar la visita
      String(i + 1),
      p.nombre || "Sin nombre",
      p.direccion || "Sin dirección",
      p.telefono && p.telefono !== "No disponible" ? p.telefono : "—",
      `${p.prioridad || "—"}${p.lead_score ? ` (${p.lead_score}/100)` : ""}`,
      vendedores[p.place_id] || "Sin asignar",
      "",
    ]),
    bodyStyles: { ...TABLA.bodyStyles, fontSize: 9, minCellHeight: 12 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 9, halign: "center" },
      2: { cellWidth: 50 },
      3: { cellWidth: 66 },
      4: { cellWidth: 28 },
      5: { cellWidth: 25 },
      6: { cellWidth: 24 },
    },
    didDrawCell: (dc) => {
      if (dc.section === "body" && dc.column.index === 0) {
        doc.setDrawColor(120, 112, 98);
        doc.setLineWidth(0.4);
        doc.rect(dc.cell.x + 2.5, dc.cell.y + dc.cell.height / 2 - 2.5, 5, 5);
      }
    },
  });

  let y2 = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(40, 30, 20);
  doc.text(`Total de visitas: ${paradas.length}`, 14, y2);

  // Los links del recorrido: se tocan desde el PDF y abren Google Maps
  // con las paradas en este mismo orden.
  enlaces.forEach((enlace, i) => {
    if (y2 > 185) { doc.addPage(); y2 = 24; }
    y2 += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(40, 30, 20);
    const etiqueta = enlaces.length > 1 ? `Recorrido en Google Maps — tramo ${i + 1}:` : "Recorrido en Google Maps:";
    doc.text(etiqueta, 14, y2);
    doc.setTextColor(30, 90, 190);
    doc.textWithLink("abrir mapa", 14 + doc.getTextWidth(etiqueta) + 3, y2, { url: enlace });
  });

  pie(doc, "l");
  return doc;
}
