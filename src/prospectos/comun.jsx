// Piezas compartidas por la búsqueda (Prospectos.jsx) y la cartera de
// guardados (Guardados.jsx). Los estilos viven en el <style> de Prospectos.

/** Número para wa.me: sólo dígitos y con el 1 de USA adelante. */
export function numeroWhatsApp(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith("1")) return d;
  return "";
}

/** Emails del negocio: vienen como lista (búsqueda) o separados por coma (guardados). */
export const emailsDe = (r) =>
  (Array.isArray(r?.email) ? r.email : String(r?.email || "").split(","))
    .map((e) => String(e).trim())
    .filter((e) => e && e !== "No disponible");

export const telefonoDe = (r) => (r?.telefono && r.telefono !== "No disponible" ? r.telefono : "");

export const celdaCSV = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Descarga filas como CSV que Excel abre con los acentos bien. */
export function descargarCSV(nombre, encabezados, filas) {
  const csv = [encabezados, ...filas].map((f) => f.map(celdaCSV).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const PRIORIDAD = {
  ALTA:  { bg: "#fef2f2", text: "#b91c1c", borde: "#fecaca", barra: "linear-gradient(180deg,#ef4444,#b91c1c)", punto: "#ef4444" },
  MEDIA: { bg: "#fffbeb", text: "#b45309", borde: "#fde68a", barra: "linear-gradient(180deg,#f59e0b,#b45309)", punto: "#f59e0b" },
  BAJA:  { bg: "#f0fdf4", text: "#15803d", borde: "#bbf7d0", barra: "linear-gradient(180deg,#22c55e,#15803d)", punto: "#22c55e" },
};
export const colorPrioridad = (p) => PRIORIDAD[p] || PRIORIDAD.BAJA;

/** Link a Google Maps del negocio: su ficha si la hay, si no la ubicación. */
export function urlMapaNegocio(r) {
  if (r?.maps_url) return r.maps_url;
  const lat = Number(r?.latitud), lng = Number(r?.longitud);
  const q = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? `${lat},${lng}` : [r?.nombre, r?.direccion].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Anillo de score al estilo de un medidor, en vez del texto suelto. */
export function AnilloScore({ valor = 0, color }) {
  const pct = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className="anillo" style={{ background: `conic-gradient(${color} ${pct}%, #e9edf3 0)` }}>
      <div className="anillo-centro">
        <span style={{ color }}>{valor || 0}</span>
        <small>/100</small>
      </div>
    </div>
  );
}
