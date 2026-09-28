// ============================================================
// Impresión de documentos PDF
// ------------------------------------------------------------
// Toda la app genera los PDF con jsPDF. Este módulo agrega la
// posibilidad de mandarlos directo al diálogo de impresión, en vez
// de solamente descargar el archivo.
// ============================================================

const LOGO_URL = import.meta.env.VITE_LOGO_URL;

const MARCA = { rojo: [156, 27, 27], oro: [212, 161, 58], tinta: [40, 30, 20], gris: [140, 132, 114] };

// En el APK de Android la impresión desde la webview no está disponible,
// así que ahí siempre cae en descargar el archivo.
function esNativo() {
  return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
}


// ── Logo para los PDF ───────────────────────────────────────
// jsPDF no puede bajarse una imagen por su cuenta: necesita los datos ya
// cargados. Así que lo precargamos una sola vez al abrir la app y lo
// dejamos guardado acá.
//
// De paso lo achicamos: el logo original pesa 2,3 MB y meterlo entero en
// cada PDF daría archivos enormes para imprimir una hoja.
let logoDatos = null;

export function logoPDF() {
  return logoDatos;
}

export function precargarLogo() {
  if (!LOGO_URL || logoDatos || typeof window === "undefined") return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const ancho = 420;                                   // suficiente para imprimir nítido
      const alto = Math.round((img.height / img.width) * ancho);
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext("2d");
      ctx.drawImage(img, 0, 0, ancho, alto);
      logoDatos = { url: lienzo.toDataURL("image/png"), ancho, alto };
    } catch {
      // Si el navegador no deja leer el canvas, seguimos sin logo: los
      // documentos se generan igual con la cabecera de texto.
    }
  };
  img.src = LOGO_URL;
}

// Arranca apenas se carga el módulo: cuando alguien imprima, ya está listo.
precargarLogo();

/**
 * Manda un documento jsPDF al diálogo de impresión del sistema.
 * Si algo falla (o estamos en el APK), descarga el PDF como antes.
 *
 * @param {import("jspdf").jsPDF} doc  documento ya armado
 * @param {string} nombreArchivo       nombre para el caso de descarga
 */
export function imprimirDoc(doc, nombreArchivo) {
  if (esNativo()) return descargarDoc(doc, nombreArchivo);

  try {
    // autoPrint hace que el visor abra el diálogo de impresión solo.
    doc.autoPrint();
    const url = doc.output("bloburl");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    // No usamos display:none — algunos navegadores no imprimen iframes ocultos así.
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;";
    iframe.src = url;

    let listo = false;
    iframe.onload = () => {
      listo = true;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        // El visor de PDF ya dispara la impresión por su cuenta (autoPrint).
      }
      // Se limpia después de un rato: si se saca antes, el diálogo se cierra.
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60000);
    };

    document.body.appendChild(iframe);

    // Red de seguridad: si el iframe nunca cargó, ofrecemos la descarga.
    setTimeout(() => {
      if (!listo) {
        iframe.remove();
        descargarDoc(doc, nombreArchivo);
      }
    }, 4000);
  } catch {
    descargarDoc(doc, nombreArchivo);
  }
}

/** Descarga el PDF como archivo (comportamiento clásico). */
export function descargarDoc(doc, nombreArchivo) {
  doc.save(nombreArchivo.endsWith(".pdf") ? nombreArchivo : `${nombreArchivo}.pdf`);
}

/**
 * Abre el PDF para mirarlo, sin bajarlo ni mandarlo a la impresora.
 * Es lo que uno quiere el 90% de las veces: chusmear cómo quedó.
 *
 * En el APK la webview no abre pestañas nuevas, así que ahí se descarga.
 */
export function verDoc(doc, nombreArchivo) {
  if (esNativo()) return descargarDoc(doc, nombreArchivo);
  try {
    const url = doc.output("bloburl");
    const ventana = window.open(url, "_blank", "noopener,noreferrer");
    // Bloqueador de pop-ups: mejor bajarlo que dejar a la persona sin nada.
    if (!ventana) return descargarDoc(doc, nombreArchivo);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    descargarDoc(doc, nombreArchivo);
  }
}

/**
 * Manda el PDF por donde la persona quiera: WhatsApp, mail, Drive.
 *
 * En el celular sale el menú de compartir de siempre con el archivo
 * adjunto. En una compu de escritorio eso no existe, así que se baja el
 * PDF y se abre WhatsApp con el resumen escrito, para adjuntarlo a mano.
 *
 * @param {import("jspdf").jsPDF} doc
 * @param {string} nombreArchivo
 * @param {string} texto  resumen que acompaña al archivo
 * @returns {Promise<"nativo"|"cancelado"|"descargado">}
 */
export async function enviarDoc(doc, nombreArchivo, texto = "") {
  const nombre = nombreArchivo.endsWith(".pdf") ? nombreArchivo : `${nombreArchivo}.pdf`;

  try {
    const archivo = new File([doc.output("blob")], nombre, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombre, text: texto });
        return "nativo";
      } catch (e) {
        // Si cerró el menú a propósito no le bajamos el archivo de prepo.
        if (e?.name === "AbortError") return "cancelado";
      }
    }
  } catch {
    // Navegador viejo sin File/canShare: seguimos con el plan B.
  }

  descargarDoc(doc, nombre);
  if (texto) {
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
  }
  return "descargado";
}

// ── Piezas visuales compartidas por todos los documentos ────────

/**
 * Cabecera roja con la marca. Devuelve la coordenada Y donde seguir.
 * @param {"p"|"l"} orientacion  vertical u horizontal
 */
export function cabecera(doc, titulo, subtitulo, orientacion = "p") {
  const w = orientacion === "l" ? 297 : 210;
  doc.setFillColor(...MARCA.rojo);
  doc.rect(0, 0, w, 32, "F");
  doc.setFillColor(...MARCA.oro);
  doc.rect(0, 29, w, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(titulo, 14, 15);

  if (subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(subtitulo, 14, 24);
  }

  doc.setTextColor(...MARCA.tinta);
  return 44;
}

/** Pie de página con la fecha de generación, en todas las hojas. */
export function pie(doc, orientacion = "p") {
  const w = orientacion === "l" ? 297 : 210;
  const h = orientacion === "l" ? 210 : 297;
  const total = doc.internal.getNumberOfPages();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MARCA.gris);
    doc.text(
      `Nini T Group · Generado el ${new Date().toLocaleString("es-AR")}`,
      14, h - 8
    );
    doc.text(`Página ${i} de ${total}`, w - 14, h - 8, { align: "right" });
  }
}

/** Título de sección con línea debajo. Devuelve la Y siguiente. */
export function seccion(doc, texto, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...MARCA.rojo);
  doc.text(texto, 14, y);
  doc.setDrawColor(230, 225, 215);
  doc.line(14, y + 2, doc.internal.pageSize.width - 14, y + 2);
  doc.setTextColor(...MARCA.tinta);
  return y + 9;
}

/** Estilos por defecto de las tablas, para que todos los PDF se vean igual. */
export const TABLA = {
  headStyles: { fillColor: MARCA.rojo, fontSize: 9.5, fontStyle: "bold" },
  bodyStyles: { fontSize: 9.5, cellPadding: 3 },
  alternateRowStyles: { fillColor: [252, 248, 240] },
  margin: { left: 14, right: 14 },
};
