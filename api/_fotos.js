// Material de cada modelo: exterior, interior, plano, video y paleta.
//
// Archivo con "_", así que no gasta ninguna de las 12 funciones del plan
// Hobby (ver AGENTS.md). Es la ÚNICA fuente de estos links.
//
// Son los mismos links que el vendedor le manda al cliente desde el botón
// "Fotos" del CRM (FOTOS_MODELOS en src/App.jsx). Que la web pública y el
// vendedor muestren exactamente el mismo material no es un detalle: el
// cliente ve las dos cosas y cualquier diferencia se nota.
//
// REGLA: no se inventan URLs. Si una foto no está acá, no existe. Subirla a
// public/cotizacion/img o public/media y agregarla acá es el único camino.
//
// ── DE DÓNDE SALE EL MATERIAL ─────────────────────────────────────────────
//
// Antes, interior, plano, video y paleta se linkeaban a
// ninitgroup.com/wp-content/uploads. Ese WordPress se queda sin cuota
// ("509 Bandwidth Limit Exceeded", después 500) y se cae entero, así que el
// 29/09/2026 todo pasó a los archivos del propio CRM, servidos por Vercel:
//   - fotos:  https://ninit-crm.vercel.app/cotizacion/img/<modelo>/
//   - videos y fotos sueltas: https://ninit-crm.vercel.app/media/<modelo>/
// Son URLs absolutas a propósito: el chat de la landing y n8n/Meta las usan
// tal cual. Las rutas relativas ("img/...") son archivos de la landing.

const FOTOS = "https://ninit-crm.vercel.app/cotizacion/img/";
const MEDIA_URL = "https://ninit-crm.vercel.app/media/";
const foto = (...rutas) => rutas.map((r) => FOTOS + r);
const media = (...rutas) => rutas.map((r) => MEDIA_URL + r);

// La paleta es la misma en todos los modelos: el acabado no cambia.
const PALETA = foto(
  "finishes/01-pure-white.jpg", "finishes/02-snow-mountain-stone.jpg",
  "finishes/03-florence-black-gold.jpg", "finishes/04-florence-white-gold.jpg",
  "finishes/05-armani-gray.jpg", "finishes/06-pandora.jpg",
  "finishes/07-italian-gray.jpg", "finishes/08-fish-belly-white.jpg",
  "finishes/09-white-jade.jpg", "finishes/10-pure-black.jpg",
);

// Equipamiento: los mismos ocho detalles en todos los modelos, servidos por
// la landing. Responde la pregunta que más hace el comprador: "¿qué trae
// adentro?".
const DETALLE = [
  "img/feat/acheating.jpg", "img/feat/toilet.jpg", "img/feat/sinks.jpg",
  "img/feat/lighting.jpg", "img/feat/electrical.jpg", "img/feat/waterinlet.jpg",
  "img/feat/jacks.jpg", "img/feat/handrails.jpg",
];

// Tomas de interior de la propia landing. Las dos primeras SÍ son de un modelo
// puntual (lo dice el alt del HTML); las otras cuatro son genéricas y por eso
// los modelos que sólo tienen ésas van marcados con interiorGenerico.
const INT_2STALL = "img/int/5.jpg";
const INT_4STALL = "img/int/4.jpg";
const INT_GENERICO = ["img/int/1.jpg", "img/int/6.jpg", "img/int/2.jpg", "img/int/3.jpg"];

/**
 * Catálogo por modelo. Las claves son los slugs que escribe la IA.
 * Cada tipo es una lista: un modelo puede tener varias fotos de interior.
 */
export const MEDIA = {
  "2-stall": {
    nombre: "2-Stall White Marble",
    exterior: ["img/2-stall.jpg", ...media("2-stall/principal.jpeg", "2-stall/exterior.png")],
    interior: [
      INT_2STALL, ...INT_GENERICO.slice(0, 2),
      ...foto("2-stall/int-1.jpg", "2-stall/int-2.jpg", "2-stall/int-3.jpg", "2-stall/int-4.jpg"),
      ...media("2-stall/foto-1.jpeg"),
    ],
    detalle: DETALLE,
    plano: foto("2-stall/floorplan.jpg"),
    video: media("2-stall/video-1.mp4", "2-stall/video-2.mp4"),
    paleta: PALETA,
  },
  "3-stall": {
    nombre: "3-Stall",
    exterior: ["img/3-stall.jpg", ...foto("3-stall/exterior.jpg")],
    interior: [
      ...INT_GENERICO,
      ...foto("3-stall/interior-1.jpg", "3-stall/interior-2.jpg", "3-stall/interior-3.jpg", "3-stall/interior-4.jpg"),
      ...media("3-stall/foto-1.jpeg", "3-stall/foto-2.jpeg", "3-stall/foto-3.jpeg", "3-stall/foto-4.jpeg"),
    ],
    interiorGenerico: true,
    detalle: DETALLE,
    plano: foto("3-stall/floorplan.jpg"),
    video: media("3-stall/video-1.mp4"),
    paleta: PALETA,
  },
  "4-stall": {
    nombre: "4-Stall",
    exterior: ["img/4-stall.jpg", ...foto("4-stall/hero.jpg")],
    interior: [
      INT_4STALL, ...INT_GENERICO.slice(0, 2),
      ...foto("4-stall/int-1.jpg", "4-stall/int-2.jpg", "4-stall/int-3.jpg",
        "4-stall/int-4.jpg", "4-stall/int-5.jpg", "4-stall/int-6.jpg"),
    ],
    detalle: DETALLE,
    plano: foto("4-stall/floorplan.jpg"),
    video: media("4-stall/video-1.mp4"),
    paleta: PALETA,
  },
  "ada-2": {
    nombre: "ADA + 2",
    exterior: ["img/ada-2.png", ...foto("ada-2/hero.png")],
    interior: [...INT_GENERICO.slice(0, 2), ...foto("ada-2/int-1.png")],
    interiorGenerico: true,
    detalle: DETALLE,
    video: media("ada-2/video-1.mp4", "ada-2/video-2.mp4"),
    paleta: PALETA,
  },
  "6-stall": {
    nombre: "6-Stall",
    exterior: foto("6-stall/hero.png"),
    interior: [...INT_GENERICO.slice(0, 2), ...foto("6-stall/int-1.jpg", "6-stall/int-2.jpg")],
    interiorGenerico: true,
    detalle: DETALLE,
    paleta: PALETA,
  },
};

export const TIPOS = ["exterior", "interior", "detalle", "plano", "video", "paleta"];

// Sinónimos de cada tipo: los escriben los modelos y también los visitantes.
const ALIAS_TIPO = {
  afuera: "exterior", fuera: "exterior", outside: "exterior", out: "exterior", foto: "exterior",
  adentro: "interior", dentro: "interior", inside: "interior", in: "interior", bano: "interior",
  planos: "plano", plan: "plano", layout: "plano", "floor-plan": "plano", floorplan: "plano", medidas: "plano",
  videos: "video", walkthrough: "video", recorrido: "video", tour: "video",
  equipamiento: "detalle", equipo: "detalle", features: "detalle", detalles: "detalle",
  incluye: "detalle", trae: "detalle", equipment: "detalle",
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
/** Las URLs de un tipo. Vacío si el modelo no tiene ese material. */
function servibles(modelo, tipo) {
  return Array.isArray(modelo[tipo]) ? modelo[tipo] : [];
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

  // Honestidad: el 3-Stall y el ADA+2 no tienen tomas propias de interior en
  // la landing, y el equipamiento es el mismo en toda la línea. Si mostramos
  // esas fotos bajo el título "3-Stall · Interior", le estamos diciendo al
  // cliente que está viendo SU unidad. El pie lo aclara.
  const generico = (usado === "interior" && modelo.interiorGenerico === true) ||
    usado === "detalle" || usado === "paleta";

  return { slug, nombre: modelo.nombre, tipo: usado, generico, urls: urls.slice(0, tope) };
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

/**
 * Modelos que hoy se pueden ofrecer.
 *
 * Se exige EXTERIOR, no "algo": el interior y el equipamiento son casi los
 * mismos en toda la línea, así que un modelo del que sólo tenemos esas fotos
 * no se puede mostrar de verdad — y ofrecerlo para después no tener con qué
 * responder es peor que no nombrarlo.
 */
export function modelosDisponibles() {
  return Object.keys(MEDIA).filter((slug) => servibles(MEDIA[slug], "exterior").length > 0);
}
