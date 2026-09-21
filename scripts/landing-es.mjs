// Genera la versión en castellano de la landing a partir de la inglesa.
//
//   node scripts/landing-es.mjs           -> escribe public/business/es/index.html
//   node scripts/landing-es.mjs --faltan  -> sólo lista las frases sin traducir
//
// POR QUÉ ASÍ Y NO CON UN BOTÓN QUE TRADUZCA EN EL NAVEGADOR
//
// Un selector de idioma en JavaScript cambia lo que ve la persona pero no lo
// que ve Google: el buscador indexa el HTML que llega del servidor, así que
// la versión en castellano sencillamente no existiría para él. Como Miami es
// mercado hispanohablante, esa página tiene que ser una URL propia,
// indexable, con su hreflang. De ahí /es/.
//
// Y para no terminar manteniendo dos páginas a mano —que es como se
// desincronizan— la de castellano se GENERA. La fuente única de verdad es
// public/business/index.html; este script la lee, cambia los textos y escribe
// la copia. Si se toca una frase en inglés, se corre el script de nuevo.
//
// CÓMO REEMPLAZA
//
// No usa un parser de HTML (sería una dependencia más en un proyecto que a
// propósito no tiene ninguna). Parte el archivo en "adentro de una etiqueta"
// y "afuera", y sólo toca lo de afuera: los nodos de texto. Eso hace
// imposible romper el marcado, porque nunca escribe dentro de un <tag>.
// Los atributos que sí hay que traducir (title, description, alt, aria-label,
// placeholder, og:*) se listan aparte y se reemplazan por separado.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aca = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aca, "..");
const ENTRADA = resolve(raiz, "public/business/index.html");
const SALIDA = resolve(raiz, "public/business/es/index.html");
const DICC = resolve(raiz, "public/business/i18n-es.json");

const soloFaltan = process.argv.includes("--faltan");

const html = readFileSync(ENTRADA, "utf8");
const diccionario = JSON.parse(readFileSync(DICC, "utf8"));

/* ── 1. Partir en texto / etiquetas ──────────────────────────────────────
   Se saltean <script>, <style> y los comentarios: ahí adentro no hay copia
   para el visitante, y traducir un comentario en español a español sería
   absurdo. */
const SALTAR = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;

const bloques = [];
let ultimo = 0;
for (const m of html.matchAll(SALTAR)) {
  bloques.push({ tipo: "crudo", txt: html.slice(ultimo, m.index) });
  bloques.push({ tipo: "intacto", txt: m[0] });
  ultimo = m.index + m[0].length;
}
bloques.push({ tipo: "crudo", txt: html.slice(ultimo) });

const usadas = new Set();
const faltantes = new Map();

function traducir(frase) {
  const limpia = frase.replace(/\s+/g, " ").trim();
  if (!limpia) return null;
  // Sin letras (números sueltos, "·", "01") no hay nada que traducir. Se
  // sacan primero las entidades HTML, si no "&mdash;" parece una palabra.
  const conLetras = limpia.replace(/&[a-z]+;|&#\d+;/gi, " ");
  if (!/[a-zA-Z]{2}/.test(conLetras)) return null;
  if (Object.prototype.hasOwnProperty.call(diccionario, limpia)) {
    usadas.add(limpia);
    return diccionario[limpia];
  }
  faltantes.set(limpia, (faltantes.get(limpia) || 0) + 1);
  return null;
}

/* ── 2. Reemplazar sólo los nodos de texto ─────────────────────────────── */
const salida = bloques
  .map((b) => {
    if (b.tipo === "intacto") return b.txt;
    // Todo lo que está entre ">" y "<" es texto; el resto son etiquetas.
    return b.txt.replace(/>([^<]+)</g, (todo, texto) => {
      const es = traducir(texto);
      if (es === null) return todo;
      // Respetar el espaciado original de alrededor para no pegotear el HTML.
      const antes = texto.match(/^\s*/)[0];
      const despues = texto.match(/\s*$/)[0];
      return ">" + antes + es + despues + "<";
    });
  })
  .join("");

/* ── 3. Atributos con copia visible ──────────────────────────────────────
   "content" NO va en la lista general: la mayoría de los <meta content="">
   son configuración (el viewport, el theme-color, la ruta de la imagen para
   compartir) y traducirlos rompería la página. Los pocos que sí son copia se
   toman aparte, por nombre. */
const ATRIBUTOS = ["alt", "aria-label", "placeholder", "title"];
let conAtributos = salida;
for (const attr of ATRIBUTOS) {
  const re = new RegExp(`(\\s${attr}=")([^"]+)(")`, "g");
  conAtributos = conAtributos.replace(re, (todo, a, valor, c) => {
    const es = traducir(valor);
    return es === null ? todo : a + es + c;
  });
}

const METAS_CON_COPIA = ["description", "og:title", "og:description", "twitter:title", "twitter:description"];
conAtributos = conAtributos.replace(/<meta\s+[^>]*>/gi, (tag) => {
  const clave = (tag.match(/(?:name|property)="([^"]+)"/i) || [])[1];
  if (!METAS_CON_COPIA.includes(clave)) return tag;
  return tag.replace(/content="([^"]+)"/i, (todo, valor) => {
    const es = traducir(valor);
    return es === null ? todo : `content="${es}"`;
  });
});

/* ── 4. Lo que no es texto: rutas, idioma, SEO ───────────────────────────
   La página en castellano vive un nivel más abajo (/es/), así que todas las
   rutas relativas necesitan un "../". Y los metadatos de idioma tienen que
   apuntar al revés que en la inglesa, o Google indexa las dos como si
   fueran la misma. */
const BASE = "https://ntg-business.vercel.app";

conAtributos = conAtributos
  // Idioma del documento.
  .replace('<html lang="en">', '<html lang="es">')
  // Rutas relativas -> un nivel arriba.
  .replace(/(src|href)="(img\/|business\.css|business\.js)/g, '$1="../$2')
  .replace(/url\('img\//g, "url('../img/")
  // Canónica y alternas: acá la canónica es la española.
  .replace(`<link rel="canonical" href="${BASE}/">`, `<link rel="canonical" href="${BASE}/es/">`)
  // Metadatos sociales propios del idioma.
  .replace('<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="es_US">\n<meta property="og:locale:alternate" content="en_US">')
  .replace(`<meta property="og:url" content="${BASE}/">`, `<meta property="og:url" content="${BASE}/es/">`)
  // El selector: se invierte cuál está activo.
  .replace(
    '<a class="on" href="/" hreflang="en" aria-current="page">EN</a>\n\t\t\t<a href="/es/" hreflang="es">ES</a>',
    '<a href="/" hreflang="en">EN</a>\n\t\t\t<a class="on" href="/es/" hreflang="es" aria-current="page">ES</a>'
  )
  // El idioma declarado en los datos estructurados.
  .replace('"inLanguage": "en-US"', '"inLanguage": "es-US"')
  .replace(`"url": "${BASE}/",\n      "name": "Restroom Trailer Rental Business in Miami — NINI T-GROUP"`,
           `"url": "${BASE}/es/",\n      "name": "Negocio de Alquiler de Baños Móviles en Miami — NINI T-GROUP"`);

/* ── 4b. Los datos estructurados ─────────────────────────────────────────
   El bloque JSON-LD queda fuera del reemplazo de texto porque está dentro de
   un <script>. Pero es justamente el que Google usa para armar el resultado
   enriquecido: si queda en inglés, el desplegable de preguntas de la página
   española sale en inglés. Así que se traduce aparte, recorriendo el objeto
   ya parseado y cambiando sólo los campos que son copia. */
const CAMPOS_TRADUCIBLES = new Set(["name", "text", "description", "slogan", "about"]);

function traducirJsonLd(valor, clave) {
  if (Array.isArray(valor)) return valor.map((v) => traducirJsonLd(v, clave));
  if (valor && typeof valor === "object") {
    const salida = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = traducirJsonLd(v, k);
    return salida;
  }
  if (typeof valor === "string" && CAMPOS_TRADUCIBLES.has(clave)) {
    const es = traducir(valor);
    if (es !== null) return es;
  }
  return valor;
}

conAtributos = conAtributos.replace(
  /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
  (todo, abre, json, cierra) => {
    try {
      const datos = JSON.parse(json);
      return abre + "\n" + JSON.stringify(traducirJsonLd(datos), null, 2) + "\n" + cierra;
    } catch (e) {
      console.error("⚠ El JSON-LD no parsea, queda sin traducir:", e.message);
      return todo;
    }
  }
);

// Aviso si algún reemplazo estructural no encontró su objetivo: sin esto, un
// cambio en el HTML inglés rompería la versión española en silencio.
const controles = [
  ['lang="es"', "el idioma del documento"],
  [`canonical" href="${BASE}/es/`, "la URL canónica"],
  ['class="on" href="/es/"', "el selector de idioma"],
  ['href="../business.css', "la ruta de los estilos"],
  ['src="../business.js', "la ruta del script"],
];
const rotos = controles.filter(([aguja]) => !conAtributos.includes(aguja));
if (rotos.length) {
  console.error("\n⚠ No se pudo aplicar:");
  rotos.forEach(([, que]) => console.error("   · " + que));
  console.error("  Cambió el HTML inglés y este script quedó desactualizado.");
  process.exitCode = 1;
}

/* ── 5. Informe ────────────────────────────────────────────────────────── */
if (faltantes.size) {
  console.log(`\nSin traducir (${faltantes.size}):\n`);
  for (const [frase] of [...faltantes].sort((a, b) => b[1] - a[1])) {
    console.log(JSON.stringify(frase) + ": \"\",");
  }
} else {
  console.log("Todas las frases tienen traducción.");
}

const sinUsar = Object.keys(diccionario).filter((k) => !usadas.has(k));
if (sinUsar.length) {
  console.log(`\nEn el diccionario pero ya no en la página (${sinUsar.length}):`);
  sinUsar.forEach((k) => console.log("  " + JSON.stringify(k)));
}

if (soloFaltan) process.exit(faltantes.size ? 1 : 0);

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, conAtributos, "utf8");
console.log(`\nEscrito: ${SALIDA}`);
console.log(`Traducidas ${usadas.size} frases · ${faltantes.size} sin traducir.`);
