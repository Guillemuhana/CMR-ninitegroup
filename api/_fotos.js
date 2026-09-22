// Material de cada modelo: exterior, interior, plano, video y paleta.
//
// Archivo con "_", así que no gasta ninguna de las 12 funciones del plan
// Hobby (ver AGENTS.md). Es la ÚNICA fuente de estos links.
//
// Son los links oficiales de ninitgroup.com, los mismos que el vendedor le
// manda al cliente desde el botón "Fotos" del CRM. Que la web pública y el
// vendedor muestren exactamente el mismo material no es un detalle: el
// cliente ve las dos cosas y cualquier diferencia se nota.
//
// REGLA: no se inventan URLs. Si una foto no está acá, no existe. Subir una
// nueva a ninitgroup.com y agregarla acá es el único camino.
//
// ── POR QUÉ HAY MATERIAL "LOCAL" Y MATERIAL "REMOTO" ──────────────────────
//
// El 22/09/2026, verificando estos 37 archivos uno por uno, ninitgroup.com
// devolvía "509 Bandwidth Limit Exceeded" — el sitio entero, no sólo las
// imágenes. O sea que el hosting de WordPress se queda sin cuota y TODO este
// material se cae junto.
//
// Una landing pública no puede depender de eso: si el prospecto pregunta
// "¿cómo es?" y recibe un recuadro roto, se fue.
//
// Por eso las fotos de exterior de los cuatro modelos principales salen de
// los archivos que la propia landing ya tiene (Vercel, mismo dominio, no se
// cae). El resto —interior, plano, video, paleta— sólo existe en WordPress, y
// se sirve únicamente si MEDIA_REMOTA=1.
//
// El default es APAGADO a propósito. Cuando ninitgroup.com esté estable, se
// pone MEDIA_REMOTA=1 en Vercel y aparecen los videos y los interiores sin
// tocar una línea de código. Lo definitivo es copiar ese material al mismo
// hosting que la landing, y ahí esto deja de hacer falta.

const P = "https://ninitgroup.com/wp-content/uploads/";

// ¿Se puede servir lo que vive en WordPress?
const hayRemoto = () => process.env.MEDIA_REMOTA === "1";

// Las rutas relativas las resuelve el widget contra su propia ubicación, así
// funcionan igual en / y en /es/ (ver assistant-widget.js).
const esRemoto = (u) => /^https?:/i.test(u);

// La paleta es la misma en todos los modelos: el acabado no cambia.
const PALETA = [`${P}2026/06/WhatsApp-Image-2026-06-13-at-3.33.46-PM-1.jpeg`];

// Interior compartido por los modelos grandes.
const INTERIOR_456 = [
  `${P}2026/06/WhatsApp-Image-2026-06-13-at-3.33.48-PM-1-1.jpeg`,
  `${P}2026/06/WhatsApp-Image-2026-06-13-at-3.33.47-PM-3.jpeg`,
];

/**
 * Catálogo por modelo. Las claves son los slugs que escribe la IA.
 * Cada tipo es una lista: un modelo puede tener varias fotos de interior.
 */
export const MEDIA = {
  "2-stall": {
    nombre: "2-Stall White Marble",
    exterior: ["img/2-stall.jpg", `${P}2026/07/2.jpeg`, `${P}2026/07/2s.jpeg`],
    interior: [`${P}2026/07/interior2b.jpeg`, `${P}2026/07/interior2c.jpeg`, `${P}2026/07/2d.jpeg`],
    plano: [`${P}2026/07/plano2.jpeg`],
    video: [`${P}2026/07/video2puertas.mp4`],
    paleta: PALETA,
  },
  "3-stall": {
    nombre: "3-Stall",
    exterior: ["img/3-stall.jpg", `${P}2026/06/WhatsApp-Image-2026-06-18-at-5.18.09-PM-2-1.jpeg`, `${P}2026/07/extras.jpeg`],
    interior: [
      `${P}2026/07/interior01.jpeg`, `${P}2026/07/interior02.jpeg`,
      `${P}2026/07/interior03.jpeg`, `${P}2026/07/interior04.jpeg`,
    ],
    plano: [`${P}2026/05/PHOTO-2026-01-08-01-13-01-1.jpg`],
    video: [
      `${P}2026/07/video03.mp4`,
      `${P}2026/07/videointerior1.mp4`,
      `${P}2026/07/videointerior2.mp4`,
      `${P}2026/07/videointerior3.mp4`,
    ],
    paleta: PALETA,
  },
  "4-stall": {
    nombre: "4-Stall",
    exterior: ["img/4-stall.jpg", `${P}2026/07/exterior.jpeg`, `${P}2026/07/exteriror2.jpeg`],
    interior: [
      `${P}2026/07/interior01-1.jpeg`, `${P}2026/07/interior2.jpeg`, `${P}2026/07/interior3.jpeg`,
      `${P}2026/07/interior4.jpeg`, `${P}2026/07/interior5.jpeg`, `${P}2026/07/interior6.jpeg`,
    ],
    plano: [`${P}2026/06/WhatsApp-Image-2026-06-11-at-4.39.53-PM.jpeg`],
    paleta: PALETA,
  },
  "ada-2": {
    nombre: "ADA + 2",
    exterior: ["img/ada-2.png", `${P}2026/05/ada22.png`],
    interior: [`${P}2026/01/dfhxvb.png`],
    paleta: PALETA,
  },
  "6-stall": {
    nombre: "6-Stall",
    exterior: [`${P}2026/05/6bano.png`],
    interior: INTERIOR_456,
    paleta: PALETA,
  },
};

export const TIPOS = ["exterior", "interior", "plano", "video", "paleta"];

// Sinónimos de cada tipo: los escriben los modelos y también los visitantes.
const ALIAS_TIPO = {
  afuera: "exterior", fuera: "exterior", outside: "exterior", out: "exterior", foto: "exterior",
  adentro: "interior", dentro: "interior", inside: "interior", in: "interior", bano: "interior",
  planos: "plano", plan: "plano", layout: "plano", "floor-plan": "plano", floorplan: "plano", medidas: "plano",
  videos: "video", walkthrough: "video", recorrido: "video", tour: "video",
  colores: "paleta", color: "paleta", colors: "paleta", palette: "paleta", terminacion: "paleta",
};

const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Normaliza lo que haya escrito el modelo. Devuelve null si no se entiende. */
export function normalizarTipo(crudo) {
  const t = sinTildes(crudo).trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (TIPOS.includes(t)) return t;
  return ALIAS_TIPO[t] || null;
}

/**
 * Qué mandar para un modelo y un tipo.
 *
 * `tope` existe porque en un chat la cantidad importa: seis fotos de interior
 * seguidas no es una respuesta, es una descarga. Tres alcanzan para que se
 * haga una idea y pida el resto.
 *
 * Si el tipo pedido no existe para ese modelo, cae a exterior en vez de
 * devolver nada: el ADA+2 no tiene plano, y ante "mostrame el plano del ADA"
 * es mucho mejor mostrar la unidad y que el asistente lo aclare por texto que
 * contestar con las manos vacías.
 */
/** Las URLs de un tipo que HOY se pueden servir. Vacío si no queda ninguna. */
function servibles(modelo, tipo) {
  const lista = Array.isArray(modelo[tipo]) ? modelo[tipo] : [];
  return hayRemoto() ? lista : lista.filter((u) => !esRemoto(u));
}

export function mediaDe(slug, tipo, tope = 3) {
  const modelo = MEDIA[slug];
  if (!modelo) return null;

  const pedido = normalizarTipo(tipo) || "exterior";
  let usado = pedido;
  let urls = servibles(modelo, pedido);

  if (!urls.length) {
    usado = "exterior";
    urls = servibles(modelo, "exterior");
  }
  if (!urls.length) return null;

  return { slug, nombre: modelo.nombre, tipo: usado, urls: urls.slice(0, tope) };
}

/**
 * Los tipos que ese modelo tiene DISPONIBLES ahora mismo. De acá sale la
 * lista que ve la IA en el prompt: así no ofrece un video que hoy no se
 * puede servir, en vez de prometerlo y quedar mal.
 */
export function tiposDe(slug) {
  const modelo = MEDIA[slug];
  if (!modelo) return [];
  return TIPOS.filter((t) => servibles(modelo, t).length > 0);
}

/** Modelos que hoy tienen algo para mostrar. */
export function modelosDisponibles() {
  return Object.keys(MEDIA).filter((slug) => tiposDe(slug).length > 0);
}
