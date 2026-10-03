// Buscador de clientes potenciales en Estados Unidos y Córdoba, Argentina para NTG.
//
// Vive en una carpeta con "_": no gasta ninguna de las 12 funciones del plan
// Hobby. Lo despacha api/push.js (?accion=prospectos, rewrite /api/prospectos).
//
// CÓMO FUNCIONA
//  1. Sólo el CEO: se valida la sesión de Supabase del lado del servidor.
//  2. Busca negocios reales en la zona:
//       · Google Places (Text Search) si está GOOGLE_PLACES_API_KEY: trae
//         teléfono, web, reseñas y coordenadas de casi todos.
//       · Si no hay clave, OpenStreetMap (Nominatim): gratis y sin
//         configurar nada, pero con muchos menos teléfonos y webs cargados.
//  3. Puntúa cada negocio: primero con reglas (el rubro y los datos de
//     contacto, ver rubros.js) y después, si hay IA configurada, con la IA
//     leyendo la ficha comercial de api/_ntg.js. Si la IA falla o tarda, los
//     resultados salen igual con el puntaje de reglas: una búsqueda nunca se
//     pierde por la IA.
//
// No guarda nada ni le escribe a nadie: devuelve la lista y listo.

import { createClient } from "@supabase/supabase-js";
import { FICHA_BUSINESS } from "../_ntg.js";
import { vaOtroModelo } from "../_groq.js";
import { intentosIA, adaptarCuerpo } from "../_ia.js";
import { RUBROS, rubroDe } from "./rubros.js";
import { negocioDe, firmaDe, redactar, emailFinal } from "./redactar.js";

const CEO_EMAIL = "ninitgroup@gmail.com";
const GOOGLE_URL = "https://places.googleapis.com/v1/places:searchText";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// OpenStreetMap pide identificarse; sin esto rechaza los pedidos.
const USER_AGENT = "NiniTGroupCRM/1.0 (https://ninitgroup.com)";

// api/push.js tiene 30 s en vercel.json: se deja margen para contestar.
const PRESUPUESTO_MS = 25000;
const PAGINAS_GOOGLE = 2;       // 20 por página → hasta 40 negocios
const MAX_RESULTADOS = 40;
const MAX_IA = 30;              // los mejores por reglas pasan por la IA
const LOTE_IA = 15;

const CAMPOS_GOOGLE = [
  "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
  "places.location", "places.nationalPhoneNumber", "places.websiteUri", "places.rating",
  "places.userRatingCount", "places.primaryTypeDisplayName", "places.businessStatus",
  "places.googleMapsUri", "nextPageToken",
].join(",");

class ErrorBusqueda extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

const texto = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const acotar = (n, min, max) => Math.max(min, Math.min(max, n));
const restante = (vence) => vence - Date.now();

function paisDeZona(zona) {
  const normalizada = zona.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\bargentina\b|\bcordoba\b/.test(normalizada) ? "AR" : "US";
}

/** Valida lo que manda la pantalla y resuelve el rubro. null si no sirve. */
export function prepararBusqueda(body) {
  const busqueda = texto(body?.busqueda, 500);
  const zona = texto(body?.zona, 500);
  if (!busqueda || !zona || busqueda.length > 160 || zona.length > 160) return null;
  const rubro = rubroDe(busqueda);
  const pais = paisDeZona(zona);
  return {
    busqueda, zona, rubro, pais,
    consulta: `${rubro ? rubro.query : busqueda} in ${zona}`,
  };
}

// ── Google Places ────────────────────────────────────────────

function componente(p, tipo) {
  return (p.addressComponents || []).find((c) => (c.types || []).includes(tipo));
}

export function desdeGoogle(p, paisEsperado = "US") {
  if (!p?.id || !p.displayName?.text) return null;
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") return null;
  const pais = componente(p, "country")?.shortText ||
    (/\b(?:USA|United States)$/i.test(p.formattedAddress || "") ? "US" :
      (/\bArgentina$/i.test(p.formattedAddress || "") ? "AR" : ""));
  if (pais !== paisEsperado) return null;
  const ciudad = componente(p, "locality")?.longText || componente(p, "sublocality")?.longText || "";
  const estado = componente(p, "administrative_area_level_1")?.shortText || "";
  return {
    place_id: `g:${p.id}`,
    nombre: texto(p.displayName.text, 200),
    direccion: texto(p.formattedAddress).replace(/,\s*(?:USA|United States|Argentina)$/i, ""),
    ciudad: [ciudad, estado].filter(Boolean).join(", "),
    pais,
    telefono: texto(p.nationalPhoneNumber, 40),
    email: "",
    sitio_web: texto(p.websiteUri, 300),
    tipo_negocio: texto(p.primaryTypeDisplayName?.text, 80),
    latitud: Number.isFinite(p.location?.latitude) ? p.location.latitude : null,
    longitud: Number.isFinite(p.location?.longitude) ? p.location.longitude : null,
    calificacion: Number.isFinite(p.rating) ? p.rating : null,
    num_resenas: Number.isFinite(p.userRatingCount) ? p.userRatingCount : 0,
    maps_url: texto(p.googleMapsUri, 300),
  };
}

async function buscarGoogle(consulta, { key, solicitar, vence }) {
  const lugares = [];
  let pageToken;
  for (let pagina = 0; pagina < PAGINAS_GOOGLE; pagina++) {
    if (restante(vence) < 6000) break;
    const r = await solicitar(GOOGLE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": CAMPOS_GOOGLE },
      body: JSON.stringify({
        textQuery: consulta.consulta,
        regionCode: consulta.pais,
        languageCode: consulta.pais === "AR" ? "es" : "en",
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (pagina > 0) break;   // la primera página ya alcanza para contestar
      const msg = data?.error?.message || "";
      if (r.status === 403 || r.status === 400 && /api key/i.test(msg)) {
        throw new ErrorBusqueda(503, "La clave de Google Places no es válida o no tiene habilitada la Places API (New).");
      }
      if (r.status === 429) throw new ErrorBusqueda(429, "Se alcanzó el límite de búsquedas de Google por ahora. Probá en unos minutos.");
      throw new ErrorBusqueda(502, "Google no respondió la búsqueda. Probá de nuevo.");
    }
    lugares.push(...(data.places || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return lugares.map((lugar) => desdeGoogle(lugar, consulta.pais)).filter(Boolean);
}

// ── OpenStreetMap ────────────────────────────────────────────

/** Radio de búsqueda en metros según el tamaño de la zona geocodificada. */
export function radioZona(bbox) {
  const [s, n, w, e] = (bbox || []).map(Number);
  if (![s, n, w, e].every(Number.isFinite)) return 25000;
  const alto = (n - s) * 111000;
  const ancho = (e - w) * 111000 * Math.cos(((s + n) / 2) * Math.PI / 180);
  return Math.round(acotar(Math.hypot(alto, ancho) / 2, 10000, 50000));
}

/** Recuadro "oeste,norte,este,sur" alrededor del centro de la zona. */
export function recuadro(lat, lon, radio) {
  const dLat = radio / 111000;
  const dLon = radio / (111000 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((v) => v.toFixed(4)).join(",");
}

/** Qué se le pregunta a Nominatim: etiquetas del rubro, o el texto libre. */
export function consultasOSM({ rubro, busqueda }) {
  const lista = rubro ? rubro.osm : [busqueda];
  return lista.map((q) => (q.includes("=") ? `[${q}]` : q));
}

export function desdeOSM(el, paisEsperado = "US") {
  const t = el?.extratags || {};
  const a = el?.address || {};
  const nombre = texto(el?.name || el?.namedetails?.name, 200);
  if (!nombre || !el?.osm_id) return null;
  const pais = (a.country_code || paisEsperado.toLowerCase()).toUpperCase();
  if (pais !== paisEsperado) return null;
  const lat = Number(el.lat), lon = Number(el.lon);
  const calle = [a.house_number, a.road].filter(Boolean).join(" ");
  const ciudad = [a.city || a.town || a.village || a.hamlet || a.county, a.state].filter(Boolean).join(", ");
  return {
    place_id: `osm:${el.osm_type}/${el.osm_id}`,
    nombre,
    direccion: [calle, ciudad, a.postcode].filter(Boolean).join(", "),
    ciudad,
    pais,
    telefono: texto(t.phone || t["contact:phone"], 40),
    email: texto(t.email || t["contact:email"], 120),
    sitio_web: texto(t.website || t["contact:website"] || t.url, 300),
    tipo_negocio: texto(el.type, 60).replace(/_/g, " "),
    latitud: Number.isFinite(lat) ? lat : null,
    longitud: Number.isFinite(lon) ? lon : null,
    calificacion: null,
    num_resenas: 0,
    maps_url: "",
  };
}

// Nominatim pide no pasar de un pedido por segundo.
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function nominatim(params, { solicitar, pais = "US" }) {
  const q = new URLSearchParams({ format: "jsonv2", countrycodes: pais.toLowerCase(), ...params });
  const r = await solicitar(`${NOMINATIM_URL}?${q}`, {
    signal: AbortSignal.timeout(7000),
    headers: { "User-Agent": USER_AGENT, "Accept-Language": pais === "AR" ? "es" : "en" },
  });
  if (r.status === 429 || r.status === 403) throw new ErrorBusqueda(429, "OpenStreetMap limitó las búsquedas por ahora. Probá en un minuto (o configurá Google Places).");
  if (!r.ok) throw new ErrorBusqueda(502, "OpenStreetMap no respondió. Probá de nuevo en un momento.");
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function buscarOSM(consulta, { solicitar, vence, espera = 1000 }) {
  const opciones = { solicitar, pais: consulta.pais };
  const [zona] = await nominatim({ q: consulta.zona, limit: "1" }, opciones);
  if (!zona) throw new ErrorBusqueda(400, "No encontramos esa zona en Estados Unidos o Argentina. Probá con una ciudad más específica.");

  const lat = Number(zona.lat), lon = Number(zona.lon);
  const viewbox = recuadro(lat, lon, radioZona(zona.boundingbox));
  const encontrados = [];
  for (const q of consultasOSM(consulta)) {
    if (restante(vence) < 9000) break;   // se guarda tiempo para la IA
    await pausa(espera);
    const lote = await nominatim(
      { q, viewbox, bounded: "1", limit: String(MAX_RESULTADOS), extratags: "1", addressdetails: "1" },
      opciones
    ).catch((e) => (encontrados.length ? [] : Promise.reject(e)));
    encontrados.push(...lote);
  }
  return encontrados.map((lugar) => desdeOSM(lugar, consulta.pais)).filter(Boolean);
}

// ── Puntaje ──────────────────────────────────────────────────

const prioridadDe = (score) => (score >= 72 ? "ALTA" : score >= 48 ? "MEDIA" : "BAJA");

/** Puntaje por reglas: afinidad del rubro + qué tan contactable es. */
export function puntuarBase(n, rubro) {
  let s = rubro ? rubro.base : 45;
  s += n.telefono ? 4 : -8;
  s += n.sitio_web ? 4 : -4;
  if (n.email) s += 2;
  if (n.num_resenas >= 50) s += 3;
  if (n.num_resenas >= 200) s += 2;
  if (n.calificacion != null && n.calificacion < 3.5) s -= 5;
  return Math.round(acotar(s, 0, 100));
}

function completarConReglas(n, rubroBusqueda) {
  // Si buscaron texto libre, se intenta reconocer el rubro por el negocio.
  const rubro = rubroBusqueda || rubroDe(`${n.nombre} ${n.tipo_negocio}`);
  const lead_score = puntuarBase(n, rubro);
  return {
    ...n,
    pais: n.pais || "US",
    rubro: rubro?.etiqueta || "",
    lead_score,
    prioridad: prioridadDe(lead_score),
    perfil: rubro?.perfil || "",
    productos_sugeridos: rubro ? `${rubro.unidad} · paquete ${rubro.paquete}` : "",
    enfoque_venta: rubro?.angulo || "Confirmar en la llamada si organiza eventos o alquila baños hoy.",
    motivo: "",
    alerta: "",
    ia: false,
  };
}

function promptIA() {
  return `Sos el analista de prospección de NINI T-GROUP (NTG). Te paso negocios reales de la zona indicada que salieron de un buscador de mapas. Para cada uno estimás qué tan buen comprador potencial es y le preparás al vendedor el ángulo para la primera llamada.

${FICHA_BUSINESS}

QUIÉN COMPRA (de más a menos afinidad)
· Ya vive de alquilar para eventos u obras (baños portátiles, party rentals, séptico): suma una línea de ticket alto a clientes que ya tiene.
· Hoy PAGA alquiler de baños seguido: venues de bodas al aire libre, hoteles/resorts con eventos en jardín o playa, campings y RV parks, fairgrounds, viñedos y granjas de eventos, golf.
· Contrata o deriva: organizadores de eventos, catering, constructoras.
Bajan: cadenas grandes con compras corporativas lejos del local, negocios chicos sin espacio exterior ni eventos, sucursales sin decisión local.
Talleres mecánicos: no se presume que necesiten un trailer; mantené el score bajo y dejá unidad/paquete sin sugerir si los datos no muestran una necesidad real.
Descartá (score menor a 20 y "alerta"): competencia que vende o fabrica restroom trailers, resultados que no son un negocio o no tienen nada que ver.
Unidades según público: 2-Stall ~100-150 personas · 3-Stall ~150-250 · 4-Stall ~250-300 · ADA+2 cuando piden accesibilidad.

REGLAS
· Castellano rioplatense, corto: lo lee un vendedor desde el celular.
· No inventes nada que no esté en los datos: ni eventos que hace, ni cantidad de invitados, ni que alquila baños hoy. Si lo suponés, decilo como hipótesis a confirmar ("si hacen bodas afuera…").
· Nunca precios, ingresos, retorno ni promesas: ni en "enfoque" ni en "motivo".
· "score" es afinidad con NTG de 0 a 100, no intención de compra confirmada.
· "motivo": una línea (máx. 140 caracteres) de por qué encaja o no.
· "enfoque": la frase con la que el vendedor abre la llamada (máx. 200 caracteres).
· "unidad": 2-Stall, 3-Stall, 4-Stall o ADA+2. "paquete": Starter, Business Launch o Managed.
· "alerta": vacío salvo algo raro (competencia, cerrado, no es negocio).

Devolvé SOLO JSON, sin markdown: {"resultados":[{"id":"","score":0,"perfil":"","unidad":"","paquete":"","motivo":"","enfoque":"","alerta":""}]} con un elemento por cada id recibido.`;
}

function entradaIA(lote, consulta) {
  return JSON.stringify({
    busqueda: consulta.busqueda,
    rubro_buscado: consulta.rubro?.etiqueta || null,
    zona: consulta.zona,
    negocios: lote.map((n) => ({
      id: n.place_id,
      nombre: n.nombre,
      tipo: n.tipo_negocio || null,
      ciudad: n.ciudad || n.direccion || null,
      web: n.sitio_web ? n.sitio_web.replace(/^https?:\/\//, "").split("/")[0] : null,
      tiene_telefono: !!n.telefono,
      rating: n.calificacion,
      resenas: n.num_resenas || 0,
    })),
  });
}

/** Una tanda a la IA. Devuelve Map id → análisis, vacío si no se pudo. */
async function analizarLote(lote, consulta, { intentos, solicitar, vence }) {
  const quemados = new Set();
  for (const { proveedor, url, apiKey, model } of intentos) {
    if (quemados.has(proveedor)) continue;
    const queda = restante(vence);
    if (queda < 2500) break;
    try {
      const r = await solicitar(url, {
        method: "POST",
        signal: AbortSignal.timeout(queda - 500),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(adaptarCuerpo(proveedor, {
          model,
          temperature: 0.3,
          max_tokens: 3500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: promptIA() },
            { role: "user", content: entradaIA(lote, consulta) },
          ],
        })),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        let parsed = {};
        try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }
        const lista = Array.isArray(parsed.resultados) ? parsed.resultados : [];
        return new Map(lista.filter((x) => x && typeof x.id === "string").map((x) => [x.id, x]));
      }
      if (!vaOtroModelo(r.status, data?.error?.message)) quemados.add(proveedor);
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") break;
      quemados.add(proveedor);
    }
  }
  return new Map();
}

const UNIDADES = ["2-Stall", "3-Stall", "4-Stall", "ADA+2"];
const PAQUETES = ["Starter", "Business Launch", "Managed"];

/** Mezcla el análisis de la IA con el puntaje de reglas. */
export function aplicarIA(n, a) {
  const scoreIA = Number(a?.score);
  if (!a || !Number.isFinite(scoreIA)) return n;
  // La IA pesa más (ve el nombre y el tipo del negocio puntual), las reglas
  // la mantienen con los pies en la tierra si se entusiasma con uno.
  const lead_score = Math.round(acotar(n.lead_score * 0.4 + acotar(scoreIA, 0, 100) * 0.6, 0, 100));
  const unidad = UNIDADES.find((u) => texto(a.unidad).toLowerCase() === u.toLowerCase());
  const paquete = PAQUETES.find((p) => texto(a.paquete).toLowerCase() === p.toLowerCase());
  return {
    ...n,
    lead_score,
    prioridad: prioridadDe(lead_score),
    perfil: texto(a.perfil, 60) || n.perfil,
    productos_sugeridos: unidad || paquete ? [unidad, paquete && `paquete ${paquete}`].filter(Boolean).join(" · ") : n.productos_sugeridos,
    enfoque_venta: texto(a.enfoque, 240) || n.enfoque_venta,
    motivo: texto(a.motivo, 180),
    alerta: texto(a.alerta, 160),
    ia: true,
  };
}

async function enriquecer(negocios, consulta, { intentos, solicitar, vence }) {
  if (!intentos.length || !negocios.length) return { lista: negocios, ia: false };
  const candidatos = negocios.slice(0, MAX_IA);
  const lotes = [];
  for (let i = 0; i < candidatos.length; i += LOTE_IA) lotes.push(candidatos.slice(i, i + LOTE_IA));
  const mapas = await Promise.all(lotes.map((l) => analizarLote(l, consulta, { intentos, solicitar, vence })));
  const analisis = new Map(mapas.flatMap((m) => [...m]));
  if (!analisis.size) return { lista: negocios, ia: false };
  return { lista: negocios.map((n) => aplicarIA(n, analisis.get(n.place_id))), ia: true };
}

/** Deduplica, puntúa por reglas y ordena. */
export function prepararLista(crudos, rubro) {
  const vistos = new Set();
  return crudos
    .filter((n) => {
      const clave = `${n.nombre.toLowerCase()}|${(n.direccion || "").toLowerCase().slice(0, 30)}`;
      if (vistos.has(n.place_id) || vistos.has(clave)) return false;
      vistos.add(n.place_id); vistos.add(clave);
      return true;
    })
    .map((n) => completarConReglas(n, rubro))
    .sort((a, b) => b.lead_score - a.lead_score)
    .slice(0, MAX_RESULTADOS);
}

// ── Endpoint ─────────────────────────────────────────────────

async function esCeo({ token, env, cliente }) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ErrorBusqueda(503, "Falta configurar la autenticación del buscador.");
  const db = cliente(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new ErrorBusqueda(401, "Tu sesión venció. Volvé a iniciar sesión.");
  const email = (data.user.email || "").toLowerCase();
  if (email === CEO_EMAIL) return true;
  const { data: perfil, error: perfilError } = await db.from("vendedores").select("role").eq("email", email).single();
  return !perfilError && perfil?.role === "ceo";
}

export function crearHandler({ env = process.env, cliente = createClient, solicitar = fetch, ia = intentosIA, espera } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Iniciá sesión para buscar clientes." });

    // Mensaje de presentación para un negocio que ya salió en la búsqueda.
    if (req.body?.accion === "redactar") {
      const negocio = negocioDe(req.body);
      if (!negocio) return res.status(400).json({ error: "Falta el negocio para redactar el mensaje." });
      try {
        if (!(await esCeo({ token, env, cliente }))) return res.status(403).json({ error: "Solo el CEO puede usar el buscador." });
        const m = await redactar(negocio, { intentos: ia(), solicitar });
        return res.status(200).json({ asunto: m.asunto, email: emailFinal(m, firmaDe(req.body)), whatsapp: m.whatsapp, ia: m.ia });
      } catch (error) {
        if (error instanceof ErrorBusqueda) return res.status(error.codigo).json({ error: error.message });
        return res.status(502).json({ error: "No se pudo redactar el mensaje. Probá de nuevo." });
      }
    }

    const consulta = prepararBusqueda(req.body);
    if (!consulta) return res.status(400).json({ error: "Ingresá un rubro y una ciudad o región de Estados Unidos o Argentina (máximo 160 caracteres cada uno)." });

    const vence = Date.now() + PRESUPUESTO_MS;
    try {
      if (!(await esCeo({ token, env, cliente }))) {
        return res.status(403).json({ error: "Solo el CEO puede buscar clientes potenciales." });
      }
      const key = env.GOOGLE_PLACES_API_KEY?.trim();
      const fuente = key ? "google" : "osm";
      const crudos = key
        ? await buscarGoogle(consulta, { key, solicitar, vence })
        : await buscarOSM(consulta, { solicitar, vence, espera });

      const base = prepararLista(crudos, consulta.rubro);
      const { lista, ia: conIA } = await enriquecer(base, consulta, { intentos: ia(), solicitar, vence });
      lista.sort((a, b) => b.lead_score - a.lead_score);

      return res.status(200).json({
        resultados: lista,
        fuente,
        ia: conIA,
        rubro: consulta.rubro ? { id: consulta.rubro.id, etiqueta: consulta.rubro.etiqueta } : null,
      });
    } catch (error) {
      if (error instanceof ErrorBusqueda) return res.status(error.codigo).json({ error: error.message });
      const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      return res.status(timeout ? 504 : 502).json({
        error: timeout
          ? "La búsqueda demoró demasiado. Probá con una zona más específica (ciudad o ZIP)."
          : "No se pudo completar la búsqueda. Probá de nuevo en un momento.",
      });
    }
  };
}

export { RUBROS };
export default crearHandler();
