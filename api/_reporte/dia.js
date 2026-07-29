// Utilidades de fecha con zona horaria fija (por defecto Miami / America/New_York).
//
// Vercel Cron dispara SIEMPRE en UTC y no sabe de horario de verano, así que el
// día del reporte se calcula acá, en la zona de la operación: el reporte de
// "hoy" va de 00:00 a 23:59:59 hora de Miami, ajustando solo por DST.

export const TZ = process.env.REPORTE_TZ || "America/New_York";

function partes(date, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    anio: +p.year, mes: +p.month, dia: +p.day,
    // Algunos ICU devuelven "24" para la medianoche con hour12:false.
    hora: (+p.hour) % 24, min: +p.minute, seg: +p.second,
  };
}

// Diferencia (ms) entre la hora local de `tz` y UTC en ese instante.
function offsetMs(date, tz) {
  const p = partes(date, tz);
  const comoUTC = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.min, p.seg);
  return comoUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" del instante `date` en la zona `tz`. */
export function fechaLocal(date = new Date(), tz = TZ) {
  const p = partes(date, tz);
  return `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** Hora local (0-23) del instante `date`. */
export function horaLocal(date = new Date(), tz = TZ) {
  return partes(date, tz).hora;
}

/** Instante UTC correspondiente a las 00:00 locales de la fecha "YYYY-MM-DD". */
export function inicioDelDia(fechaStr, tz = TZ) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const tentativo = Date.UTC(y, m - 1, d, 0, 0, 0);
  let real = tentativo - offsetMs(new Date(tentativo), tz);
  // Segunda pasada: en el cambio de horario el offset del instante tentativo
  // puede no ser el del instante real.
  const ajuste = tentativo - offsetMs(new Date(real), tz);
  if (ajuste !== real) real = ajuste;
  return new Date(real);
}

/** Rango [inicio, fin) del día local `fechaStr`, más N días previos de contexto. */
export function rangoDia(fechaStr, tz = TZ, diasPrevios = 0) {
  const inicio = inicioDelDia(fechaStr, tz);
  const fin = inicioDelDia(sumarDias(fechaStr, 1), tz);
  const desde = diasPrevios > 0 ? inicioDelDia(sumarDias(fechaStr, -diasPrevios), tz) : inicio;
  return { inicio, fin, desde };
}

/** Suma (o resta) días a una fecha "YYYY-MM-DD" sin tocar la zona horaria. */
export function sumarDias(fechaStr, n) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** "lunes 28 de julio de 2026" */
export function fechaLarga(fechaStr, tz = TZ) {
  const d = new Date(inicioDelDia(fechaStr, tz).getTime() + 12 * 3600 * 1000);
  return d.toLocaleDateString("es-AR", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** "21:04" en la zona de la operación. */
export function hhmm(date, tz = TZ) {
  return new Date(date).toLocaleTimeString("es-AR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** "28/07 21:04" */
export function fechaHora(date, tz = TZ) {
  return new Date(date).toLocaleString("es-AR", {
    timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
