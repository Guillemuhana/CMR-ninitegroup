// Purchase Agreement firmado, en PDF.
//
// Port de includes/pdf.php del plugin (que usaba FPDF) a jsPDF, respetando la
// misma paleta, las mismas secciones y el mismo orden de páginas:
//   1. Portada (banda navy, FROM / BILL TO, meta, modelo, foto exterior)
//   2. Interior Gallery
//   3. Trailer Specifications + plano
//   4. Your Trailer Price
//   5. Terms & Down Payment
//   6. Client Configuration
//   7. Features & Equipment
//   8. Purchase Summary (el contrato completo)
//   9. Acceptance & Signatures + rastro de auditoría de la firma
//
// Las fotos se leen del disco (public/cotizacion/img), que es la misma carpeta
// que sirve la página web, así que documento y PDF nunca se desincronizan.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";

import { empresa, logo, firmaRep, terminos, contrato, usd } from "./datos.js";

// Paleta de includes/pdf.php.
const NAVY = [22, 54, 92];
const GOLD = [181, 141, 66];
const INK = [25, 28, 33];
const MUTED = [107, 114, 128];
const LINE = [226, 230, 236];
const SOFT = [246, 248, 251];

const IZQ = 12;
const DER = 202;
const ANCHO = DER - IZQ; // 190 mm
const PAGINA_ALTO = 279.4; // Letter
const PIE = 20;

/** Lee una imagen de public/ y la deja lista para jsPDF. */
function leerImagen(url) {
  try {
    const rel = url.replace(/^\//, "");
    const data = readFileSync(join(process.cwd(), "public", rel));
    const tipo = /\.png$/i.test(url) ? "PNG" : "JPEG";
    return { data: "data:image/" + tipo.toLowerCase() + ";base64," + data.toString("base64"), tipo };
  } catch {
    return null; // una foto que falte no puede tumbar el acuerdo
  }
}

function medir(doc, img) {
  try {
    const p = doc.getImageProperties(img.data);
    return { w: p.width, h: p.height };
  } catch {
    return null;
  }
}

/**
 * Dibuja una imagen dentro de una caja, sin deformarla y centrada.
 * Devuelve el alto realmente ocupado (mm).
 */
function ponerImagen(doc, url, x, y, maxW, maxH, centrar = true) {
  const img = leerImagen(url);
  if (!img) return 0;
  const dim = medir(doc, img);
  if (!dim) return 0;

  const escala = Math.min(maxW / dim.w, maxH / dim.h);
  const w = dim.w * escala;
  const h = dim.h * escala;
  const px = centrar ? x + (maxW - w) / 2 : x;

  try {
    doc.addImage(img.data, img.tipo, px, y, w, h, undefined, "FAST");
    return h;
  } catch {
    return 0;
  }
}

export function construirPDF({ modelo, cliente, d, firma }) {
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "p" });
  const tituloDoc = `Quote ${d.quote_number} - ${modelo.name}`;

  const fechaCorta = (ymd) => {
    const [a, m, dd] = ymd.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, dd)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  let y = 0;
  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

  /** Banda navy fina, en todas las páginas menos la portada. */
  function encabezado(etiqueta) {
    setFill(NAVY);
    doc.rect(0, 0, 216, 16, "F");
    doc.setFont("helvetica", "bold").setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text("NINI T-GROUP", IZQ, 9.5);
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.setTextColor(210, 220, 232);
    doc.text(etiqueta, DER, 9.5, { align: "right" });
    y = 24;
  }

  function tituloSeccion(texto, subtitulo = "") {
    y += 2;
    doc.setFont("helvetica", "bold").setFontSize(15);
    setColor(NAVY);
    doc.text(texto, IZQ, y + 5.5);
    y += 8;
    if (subtitulo) {
      doc.setFont("helvetica", "normal").setFontSize(10);
      setColor(MUTED);
      doc.text(subtitulo, IZQ, y + 3.5);
      y += 5;
    }
    setDraw(GOLD);
    doc.setLineWidth(0.6);
    doc.line(IZQ, y + 1, IZQ + 24, y + 1);
    doc.setLineWidth(0.2);
    y += 7;
  }

  function subtitulo(texto) {
    y += 3;
    doc.setFont("helvetica", "bold").setFontSize(10.5);
    setColor(NAVY);
    doc.text(texto.toUpperCase(), IZQ, y + 4);
    y += 6;
  }

  /** Salta de página si lo que viene no entra. */
  function asegurar(alto, etiqueta) {
    if (y + alto > PAGINA_ALTO - PIE) {
      doc.addPage();
      encabezado(etiqueta);
      return true;
    }
    return false;
  }

  function parrafo(texto, { size = 10, alto = 4.6, x = IZQ, ancho = ANCHO, estilo = "normal", color = [45, 49, 55], etiqueta = "" } = {}) {
    doc.setFont("helvetica", estilo).setFontSize(size);
    setColor(color);
    for (const linea of doc.splitTextToSize(String(texto), ancho)) {
      asegurar(alto, etiqueta);
      doc.text(linea, x, y + alto - 1.2);
      y += alto;
    }
  }

  /** Ítem de lista: "+" (incluido), "-" (excluido) o viñeta dorada. */
  function item(texto, modo = "plain", x = IZQ, ancho = ANCHO, etiqueta = "") {
    const alto = 4.6;
    doc.setFont("helvetica", "normal").setFontSize(10);
    const lineas = doc.splitTextToSize(String(texto), ancho - 5);
    asegurar(lineas.length * alto, etiqueta);

    const y0 = y;
    if (modo === "yes") {
      doc.setFont("helvetica", "bold").setFontSize(10.5);
      doc.setTextColor(26, 138, 74);
      doc.text("+", x, y0 + 3.4);
    } else if (modo === "no") {
      doc.setFont("helvetica", "bold").setFontSize(10.5);
      doc.setTextColor(176, 71, 63);
      doc.text("-", x, y0 + 3.4);
    } else {
      setFill(GOLD);
      doc.circle(x + 1.5, y0 + 2.6, 0.9, "F");
    }

    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.setTextColor(45, 49, 55);
    for (const linea of lineas) {
      doc.text(linea, x + 5, y + alto - 1.2);
      y += alto;
    }
  }

  // ============ PÁGINA 1 — PORTADA ============
  setFill(NAVY);
  doc.rect(0, 0, 216, 34, "F");
  setFill(GOLD);
  doc.rect(0, 34, 216, 1.4, "F");

  ponerImagen(doc, logo, IZQ, 11, 30, 13, false);

  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("PURCHASE AGREEMENT", DER, 19, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.setTextColor(205, 216, 230);
  doc.text("Restroom Trailers - USA", DER, 25.5, { align: "right" });

  // Tarjetas FROM / BILL TO
  const tarjetaY = 42;
  const tarjetaH = 30;
  setFill(SOFT);
  setDraw(LINE);
  doc.rect(IZQ, tarjetaY, 92, tarjetaH, "FD");
  doc.rect(108, tarjetaY, 82, tarjetaH, "FD");

  const tarjeta = (x, ancho, rotulo, titulo, lineas) => {
    doc.setFont("helvetica", "bold").setFontSize(8.5);
    setColor(MUTED);
    doc.text(rotulo, x, tarjetaY + 7);
    doc.setFont("helvetica", "bold").setFontSize(10.5);
    setColor(INK);
    doc.text(doc.splitTextToSize(titulo, ancho)[0], x, tarjetaY + 12.5);
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    doc.setTextColor(70, 76, 84);
    lineas.filter(Boolean).forEach((l, i) => {
      doc.text(doc.splitTextToSize(l, ancho)[0], x, tarjetaY + 17.6 + i * 4.6);
    });
  };
  tarjeta(16, 84, "FROM", empresa.name, [empresa.phone, empresa.email, empresa.address, empresa.website]);
  tarjeta(112, 74, "BILL TO", cliente.nombre, [cliente.telefono, cliente.email, cliente.ubicacion]);

  // Cajas de meta
  const metaY = tarjetaY + tarjetaH + 6;
  const meta = [
    ["AGREEMENT NO.", d.quote_number],
    ["AGREEMENT DATE", fechaCorta(d.quote_date)],
    ["DELIVERY TIME", d.delivery_time],
  ];
  const cw = (ANCHO - 2 * 4) / 3;
  meta.forEach(([rotulo, valor], i) => {
    const x = IZQ + i * (cw + 4);
    setFill(NAVY);
    doc.rect(x, metaY, cw, 18, "F");
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.setTextColor(175, 195, 220);
    doc.text(rotulo, x + cw / 2, metaY + 6, { align: "center" });
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(String(valor), x + cw / 2, metaY + 13.5, { align: "center" });
  });

  y = metaY + 24;
  doc.setFont("helvetica", "bold").setFontSize(17);
  setColor(INK);
  for (const linea of doc.splitTextToSize(modelo.name, ANCHO)) {
    doc.text(linea, IZQ, y + 5.5);
    y += 7;
  }
  const nota = cliente.config_note || modelo.config_note;
  if (nota) {
    doc.setFont("helvetica", "italic").setFontSize(10);
    setColor(MUTED);
    for (const linea of doc.splitTextToSize(nota, ANCHO)) {
      doc.text(linea, IZQ, y + 3.8);
      y += 5;
    }
  }
  y += 2;
  if (modelo.hero) {
    y += ponerImagen(doc, modelo.hero, IZQ, y, ANCHO, PAGINA_ALTO - PIE - y);
  }

  // ============ INTERIOR GALLERY ============
  if (modelo.interior?.length) {
    doc.addPage();
    encabezado("Interior Gallery");
    tituloSeccion("Interior Gallery", modelo.name);

    const colW = (ANCHO - 6) / 2;
    const imgH = 55;
    for (let i = 0; i < modelo.interior.length; i += 2) {
      asegurar(imgH + 6, "Interior Gallery (cont.)");
      const filaY = y;
      ponerImagen(doc, modelo.interior[i], IZQ, filaY, colW, imgH);
      if (modelo.interior[i + 1]) {
        ponerImagen(doc, modelo.interior[i + 1], IZQ + colW + 6, filaY, colW, imgH);
      }
      y = filaY + imgH + 6;
    }
  }

  // ============ SPECIFICATIONS ============
  doc.addPage();
  encabezado("Specifications");
  tituloSeccion("Trailer Specifications", modelo.name);

  if (modelo.floorplan) {
    y += ponerImagen(doc, modelo.floorplan, IZQ, y, ANCHO, 68) + 6;
  }
  for (const s of modelo.specs) item(s, "plain", IZQ, ANCHO, "Specifications");

  // ============ PRICE ============
  doc.addPage();
  encabezado("Price");
  tituloSeccion("Your Trailer Price");

  const colDesc = 118;
  const colQty = 22;
  const colAmt = ANCHO - colDesc - colQty;

  setFill(NAVY);
  doc.rect(IZQ, y, ANCHO, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Description", IZQ + 3, y + 5.5);
  doc.text("Qty", IZQ + colDesc + colQty / 2, y + 5.5, { align: "center" });
  doc.text("Amount", DER - 3, y + 5.5, { align: "right" });
  y += 8;

  const filaPrecio = (desc, sub, qty, monto) => {
    doc.setFont("helvetica", "bold").setFontSize(10.5);
    setColor(INK);
    const lineasDesc = doc.splitTextToSize(desc, colDesc - 6);
    const lineasSub = sub ? doc.splitTextToSize(sub, colDesc - 6) : [];
    const alto = Math.max(10, lineasDesc.length * 5 + lineasSub.length * 4.2 + 5);

    setDraw(LINE);
    doc.line(IZQ, y + alto, DER, y + alto);

    let yy = y + 5;
    for (const l of lineasDesc) {
      doc.text(l, IZQ + 3, yy);
      yy += 5;
    }
    if (lineasSub.length) {
      doc.setFont("helvetica", "normal").setFontSize(8.8);
      setColor(MUTED);
      for (const l of lineasSub) {
        doc.text(l, IZQ + 3, yy);
        yy += 4.2;
      }
    }
    doc.setFont("helvetica", "normal").setFontSize(10.5);
    setColor(INK);
    doc.text(String(qty), IZQ + colDesc + colQty / 2, y + 5, { align: "center" });
    doc.text(String(monto), DER - 3, y + 5, { align: "right" });
    y += alto;
  };

  filaPrecio(modelo.name, nota, d.quantity, usd(d.unit_price));
  if (d.discount > 0) {
    filaPrecio(
      "Discount",
      d.discount_note || "Special discount applied to this quotation.",
      1,
      `-${usd(d.discount)}`
    );
  }
  filaPrecio(
    "Shipping & Logistics",
    "Free pickup at our Miami, FL and Long Beach, CA hubs. Direct Turnkey Delivery to your address is quoted separately by ground freight.",
    1,
    d.shipping_cost === 0 ? "Per Delivery Method Selected" : usd(d.shipping_cost)
  );

  setFill(SOFT);
  doc.rect(IZQ, y, ANCHO, 11, "F");
  doc.setFont("helvetica", "bold").setFontSize(11.5);
  setColor(NAVY);
  doc.text(
    `Total Amount (Unit${d.shipping_cost > 0 ? " + Shipping/Logistics" : ""}${d.discount > 0 ? " - Discount" : ""})`,
    IZQ + 3,
    y + 7.2
  );
  doc.text(usd(d.total), DER - 3, y + 7.2, { align: "right" });
  y += 11 + 6;

  // ============ TERMS & DOWN PAYMENT ============
  tituloSeccion("Terms & Down Payment");
  doc.setFont("helvetica", "bold").setFontSize(11.5);
  setColor(INK);
  doc.text(`Down Payment: ${usd(d.down_payment)}  (${d.down_pct}%)`, IZQ, y + 4);
  y += 6;
  doc.text(`Remaining Balance: ${usd(d.balance)}`, IZQ, y + 4);
  y += 8;
  for (const t of terminos) item(t, "plain", IZQ, ANCHO, "Terms");

  // ============ CLIENT CONFIGURATION ============
  asegurar(40, "Client Configuration");
  tituloSeccion("Client Configuration");
  const config = [
    ["Client", cliente.nombre],
    ["Company", cliente.empresa],
    ["Email", cliente.email],
    ["Phone", cliente.telefono],
    ["Delivery Location", cliente.ubicacion],
    ["Unit", modelo.name],
    ["Quantity", String(d.quantity)],
    // Lo que eligió el cliente en la cotización abierta (color, terminación,
    // forma de entrega). En las emitidas no hay opciones y no aparece nada.
    ...(cliente.opciones || []),
  ].filter(([, v]) => v);

  for (const [rotulo, valor] of config) {
    asegurar(7, "Client Configuration");
    doc.setFont("helvetica", "normal").setFontSize(9.5);
    setColor(MUTED);
    doc.text(rotulo, IZQ, y + 4);
    doc.setFont("helvetica", "bold").setFontSize(10);
    setColor(INK);
    doc.text(doc.splitTextToSize(String(valor), ANCHO - 55)[0], IZQ + 55, y + 4);
    setDraw(LINE);
    doc.line(IZQ, y + 6, DER, y + 6);
    y += 8;
  }

  if (firma?.mensaje) {
    y += 2;
    subtitulo("Additional notes from the client");
    parrafo(firma.mensaje, { etiqueta: "Client Configuration" });
  }

  // ============ FEATURES & EQUIPMENT ============
  if (modelo.features?.length) {
    doc.addPage();
    encabezado("Features & Equipment");
    tituloSeccion("Features & Equipment", "What comes standard on every unit");

    const colW = (ANCHO - 8) / 2;
    const imgH = 38;
    for (let i = 0; i < modelo.features.length; i += 2) {
      const par = modelo.features.slice(i, i + 2);
      doc.setFont("helvetica", "normal").setFontSize(8.6);
      const altoTexto = Math.max(
        ...par.map((f) => doc.splitTextToSize(f.desc, colW).length * 3.6)
      );
      const altoFila = imgH + 6 + altoTexto + 7;

      asegurar(altoFila, "Features & Equipment (cont.)");
      const filaY = y;

      par.forEach((f, j) => {
        const x = IZQ + j * (colW + 8);
        ponerImagen(doc, f.img, x, filaY, colW, imgH);
        doc.setFont("helvetica", "bold").setFontSize(10);
        setColor(NAVY);
        doc.text(f.title, x, filaY + imgH + 5);
        doc.setFont("helvetica", "normal").setFontSize(8.6);
        doc.setTextColor(60, 64, 70);
        doc.splitTextToSize(f.desc, colW).forEach((l, k) => {
          doc.text(l, x, filaY + imgH + 9.6 + k * 3.6);
        });
      });

      y = filaY + altoFila;
    }
  }

  // ============ PURCHASE SUMMARY (contrato) ============
  doc.addPage();
  encabezado("Purchase Summary");
  tituloSeccion(contrato.section_title, "Ready to move forward");

  const resumen = [
    ["Project", modelo.name],
    ["Total Price", usd(d.total)],
    ["Payment Terms", `${usd(d.down_payment)} deposit (${d.down_pct}%) · ${usd(d.balance)} balance before dispatch`],
    ["Estimated Delivery", d.delivery_time],
  ];
  setFill(SOFT);
  setDraw(LINE);
  const resumenH = resumen.length * 8 + 4;
  doc.rect(IZQ, y, ANCHO, resumenH, "FD");
  resumen.forEach(([rotulo, valor], i) => {
    const yy = y + 4 + i * 8;
    doc.setFont("helvetica", "normal").setFontSize(9);
    setColor(MUTED);
    doc.text(rotulo, IZQ + 4, yy + 4);
    doc.setFont("helvetica", "bold").setFontSize(10);
    setColor(INK);
    doc.text(doc.splitTextToSize(String(valor), ANCHO - 62)[0], IZQ + 58, yy + 4);
  });
  y += resumenH + 6;

  parrafo(contrato.scope_of_work, { etiqueta: "Purchase Summary" });
  y += 2;

  subtitulo("What's Included");
  for (const i of contrato.included) item(i, "yes", IZQ, ANCHO, "Purchase Summary");
  subtitulo("What's Not Included");
  for (const i of contrato.excluded) item(i, "no", IZQ, ANCHO, "Purchase Summary");

  subtitulo("Warranty");
  parrafo(contrato.warranty, { etiqueta: "Purchase Summary" });

  subtitulo("Included Documentation");
  for (const i of contrato.included_documentation) item(i, "yes", IZQ, ANCHO, "Purchase Summary");

  subtitulo("Payment Schedule");
  for (const l of contrato.payment_schedule.split("\n")) parrafo(l, { etiqueta: "Purchase Summary" });

  subtitulo("Client Responsibilities");
  for (const i of contrato.client_resp) item(i, "plain", IZQ, ANCHO, "Purchase Summary");
  subtitulo("NINIT Group Responsibilities");
  for (const i of contrato.company_resp) item(i, "plain", IZQ, ANCHO, "Purchase Summary");

  subtitulo("Procedure After Acceptance");
  for (const l of contrato.procedure.split("\n")) parrafo(l, { etiqueta: "Purchase Summary" });

  subtitulo("Terms & Conditions");
  for (const t of contrato.terms) {
    const m = /^([A-Z][A-Za-z0-9 ()/'&-]{2,60}):\s([\s\S]+)$/.exec(t);
    if (m) {
      asegurar(10, "Purchase Summary");
      setFill(GOLD);
      doc.circle(IZQ + 1.5, y + 2.6, 0.9, "F");
      doc.setFont("helvetica", "bold").setFontSize(10);
      setColor(NAVY);
      doc.text(m[1], IZQ + 5, y + 3.4);
      y += 5;
      parrafo(m[2], { x: IZQ + 5, ancho: ANCHO - 5, etiqueta: "Purchase Summary" });
      y += 1.5;
    } else {
      item(t, "plain", IZQ, ANCHO, "Purchase Summary");
    }
  }

  subtitulo("Contact");
  parrafo(`${empresa.name} · ${empresa.phone} · ${empresa.email} · ${empresa.website}`, {
    etiqueta: "Purchase Summary",
  });

  // ============ ACCEPTANCE & SIGNATURES ============
  doc.addPage();
  encabezado("Signatures");
  tituloSeccion("Acceptance & Signatures");

  setFill(SOFT);
  doc.rect(IZQ, y, 4, 10, "F");
  doc.setFont("helvetica", "normal").setFontSize(11);
  setColor(INK);
  doc.text(firma ? "[X]" : "[ ]", 20, y + 6);
  doc.text(
    doc.splitTextToSize(
      contrato.acceptance_text + (firma ? "  (Signed electronically)" : ""),
      ANCHO - 20
    ),
    28,
    y + 6
  );
  y += 20;

  const colFirma = 89;
  const x2 = IZQ + colFirma + 12;

  doc.setFont("helvetica", "bold").setFontSize(11);
  setColor(NAVY);
  doc.text("Client", IZQ, y + 4);
  doc.text("NINIT Group Representative", x2, y + 4);
  y += 8;

  const inicioY = y;
  const fechaFirma = firma?.firmadoEl || fechaCorta(d.quote_date);

  /** Filas "rótulo / valor / línea" de cada columna de firma. */
  function columnaFirma(x, filas) {
    let yy = inicioY;
    const posiciones = [];
    for (const [rotulo, valor, altoVacio = 7] of filas) {
      posiciones.push(yy);
      doc.setFont("helvetica", "normal").setFontSize(9);
      setColor(MUTED);
      doc.text(rotulo, x, yy + 3);
      yy += 4;
      if (valor) {
        doc.setFont("helvetica", "bold").setFontSize(10.5);
        setColor(INK);
        doc.text(String(valor), x, yy + 4);
        yy += 5;
      } else {
        yy += altoVacio;
      }
      doc.setDrawColor(150, 155, 163);
      doc.line(x, yy - 1, x + colFirma, yy - 1);
      yy += 3;
    }
    return { fin: yy, posiciones };
  }

  const izq = columnaFirma(IZQ, [
    ["Client Name", cliente.nombre],
    ["Company", cliente.empresa || ""],
    ["Printed Name", cliente.nombre],
    ["Signature", "", 12],
    ["Date", fechaFirma],
  ]);

  const der = columnaFirma(x2, [
    ["Representative Name", empresa.rep],
    ["Title", "Sales Representative"],
    ["Signature", "", 34],
    ["Date", fechaCorta(d.quote_date)],
  ]);

  // La firma del cliente, tal como la dibujó en la página.
  if (firma?.imagen) {
    try {
      doc.addImage(firma.imagen, "PNG", IZQ + 2, izq.posiciones[3] + 5, 55, 10);
    } catch {
      /* si el trazo no es una imagen válida, el PDF igual sale */
    }
  }
  // NTG ya tiene firmado su lado del acuerdo.
  ponerImagen(doc, firmaRep, x2 + 2, der.posiciones[2] + 6, 50, 28, false);

  y = Math.max(izq.fin, der.fin) + 8;
  doc.setFont("helvetica", "italic").setFontSize(9.5);
  setColor(MUTED);
  const auditoria = firma
    ? `Signed electronically on ${fechaFirma}${firma.ip ? "  ·  IP: " + firma.ip : ""}. This electronic signature has the same legal validity and binding effect as a handwritten signature.`
    : "This Agreement can be signed electronically through the secure link provided, or printed, signed, and returned. Electronic signatures have the same legal validity and binding effect as handwritten signatures.";
  for (const l of doc.splitTextToSize(auditoria, ANCHO)) {
    doc.text(l, IZQ, y + 3.4);
    y += 4.6;
  }

  // ---- Pie con numeración, ya sabiendo el total de páginas ----
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setDraw(LINE);
    doc.line(IZQ, PAGINA_ALTO - 15, DER, PAGINA_ALTO - 15);
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    setColor(MUTED);
    doc.text(tituloDoc, IZQ, PAGINA_ALTO - 10);
    doc.text(`Page ${p} / ${total}`, DER, PAGINA_ALTO - 10, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
