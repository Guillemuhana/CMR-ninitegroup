import test from "node:test";
import assert from "node:assert/strict";
import {
  crearHandler, prepararBusqueda, desdeGoogle, desdeOSM, consultasOSM, radioZona, recuadro,
  puntuarBase, prepararLista, aplicarIA,
} from "../api/_prospectos/buscar.js";
import { RUBROS, rubroDe } from "../api/_prospectos/rubros.js";

const lugarGoogle = (id, extra = {}) => ({
  id, displayName: { text: `Negocio ${id}` }, formattedAddress: "1 Main St, Miami, FL 33132, USA",
  addressComponents: [
    { types: ["locality"], longText: "Miami" },
    { types: ["administrative_area_level_1"], shortText: "FL" },
    { types: ["country"], shortText: "US" },
  ],
  location: { latitude: 25.78, longitude: -80.19 }, nationalPhoneNumber: "(305) 555-0100",
  websiteUri: "https://example.com", rating: 4.6, userRatingCount: 120,
  primaryTypeDisplayName: { text: "Wedding venue" }, businessStatus: "OPERATIONAL", ...extra,
});

test("rubros: reconoce español, inglés y los accesos rápidos", () => {
  assert.equal(rubroDe("hoteles")?.id, "hoteles");
  assert.equal(rubroDe("Resort in Naples")?.id, "hoteles");
  assert.equal(rubroDe("salones de bodas")?.id, "bodas");
  assert.equal(rubroDe("Porta potty rentals")?.id, "banos");
  assert.equal(rubroDe("RV park")?.id, "campings");
  for (const r of RUBROS) assert.equal(rubroDe(r.etiqueta)?.id, r.id);
  assert.equal(rubroDe("dentistas"), null);
  const ids = RUBROS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("la consulta usa la versión en inglés del rubro y valida largos", () => {
  const c = prepararBusqueda({ busqueda: " hoteles ", zona: " Miami, FL " });
  assert.equal(c.consulta, "resort hotel with event space in Miami, FL");
  assert.equal(prepararBusqueda({ busqueda: "dentists", zona: "Tampa" }).consulta, "dentists in Tampa");
  assert.equal(prepararBusqueda({ busqueda: {}, zona: "Miami" }), null);
  assert.equal(prepararBusqueda({ busqueda: "x", zona: " " }), null);
  assert.equal(prepararBusqueda({ busqueda: "x".repeat(161), zona: "Miami" }), null);
});

test("Google: sólo negocios de USA y operativos", () => {
  const n = desdeGoogle(lugarGoogle("a"));
  assert.equal(n.place_id, "g:a");
  assert.equal(n.ciudad, "Miami, FL");
  assert.equal(n.direccion, "1 Main St, Miami, FL 33132");
  assert.equal(desdeGoogle(lugarGoogle("b", { businessStatus: "CLOSED_PERMANENTLY" })), null);
  assert.equal(desdeGoogle(lugarGoogle("c", { addressComponents: [{ types: ["country"], shortText: "MX" }], formattedAddress: "Cancún, Mexico" })), null);
});

test("OpenStreetMap: busca por etiqueta del rubro o por texto y lee los datos", () => {
  assert.deepEqual(consultasOSM({ rubro: rubroDe("campings") }), ["[tourism=caravan_site]", "[tourism=camp_site]"]);
  assert.deepEqual(consultasOSM({ rubro: null, busqueda: "ice rink" }), ["ice rink"]);
  const radio = radioZona(["25.7", "25.9", "-80.3", "-80.1"]);
  assert.ok(radio > 14000 && radio < 16000);
  assert.equal(radioZona(["24", "31", "-87", "-80"]), 50000);
  const [w, n, e, s] = recuadro(30, -97, 11100).split(",").map(Number);
  assert.ok(w < -97 && e > -97 && n > 30 && s < 30);
  const r = desdeOSM({ osm_type: "node", osm_id: 7, lat: "28.5", lon: "-81.4", name: "Lake RV", type: "caravan_site",
    extratags: { phone: "+1 407" }, address: { city: "Orlando", state: "Florida", country_code: "us" } });
  assert.equal(r.place_id, "osm:node/7");
  assert.equal(r.tipo_negocio, "caravan site");
  assert.equal(r.ciudad, "Orlando, Florida");
  assert.equal(desdeOSM({ osm_type: "way", osm_id: 1, name: "" }), null);
  assert.equal(desdeOSM({ osm_type: "way", osm_id: 2, name: "X", address: { country_code: "mx" } }), null);
});

test("puntaje: el rubro manda y los datos de contacto ajustan", () => {
  const completo = { telefono: "1", sitio_web: "x", email: "", num_resenas: 300, calificacion: 4.8 };
  const pelado = { telefono: "", sitio_web: "", email: "", num_resenas: 0, calificacion: null };
  assert.ok(puntuarBase(completo, rubroDe("banos")) > puntuarBase(completo, rubroDe("construccion")));
  assert.ok(puntuarBase(completo, rubroDe("hoteles")) > puntuarBase(pelado, rubroDe("hoteles")));
  assert.equal(puntuarBase(completo, rubroDe("banos")), 100);
});

test("lista: deduplica, reconoce el rubro de cada negocio y ordena", () => {
  const a = desdeGoogle(lugarGoogle("a", { displayName: { text: "Sunny Porta Potty" } }));
  const b = desdeGoogle(lugarGoogle("b", { displayName: { text: "Joe's Construction" }, primaryTypeDisplayName: { text: "General contractor" } }));
  const lista = prepararLista([b, a, { ...a }], null);
  assert.equal(lista.length, 2);
  assert.equal(lista[0].nombre, "Sunny Porta Potty");
  assert.equal(lista[0].rubro, "Baños portátiles");
  assert.equal(lista[0].prioridad, "ALTA");
  assert.ok(lista[0].enfoque_venta);
});

test("IA: mezcla el puntaje y descarta valores fuera de lo permitido", () => {
  const [n] = prepararLista([desdeGoogle(lugarGoogle("a"))], rubroDe("bodas"));
  const r = aplicarIA(n, { score: 10, unidad: "9-Stall", paquete: "managed", enfoque: "Hola", alerta: "Parece competencia" });
  assert.equal(r.lead_score, Math.round(n.lead_score * 0.4 + 6));
  assert.equal(r.prioridad, "BAJA");
  assert.equal(r.productos_sugeridos, "paquete Managed");
  assert.equal(r.alerta, "Parece competencia");
  assert.equal(aplicarIA(n, { score: "nada" }), n);
});

// ── Endpoint completo con red simulada ──────────────────────

function escenario({ email = "ninitgroup@gmail.com", role = "vendedor", valid = true, env = {}, red = {}, intentos = [] } = {}) {
  const llamadas = [];
  const cliente = () => ({
    auth: { getUser: async () => ({ data: { user: valid ? { email } : null }, error: !valid }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
  });
  const solicitar = async (url, init) => {
    llamadas.push([url, init]);
    const clave = Object.keys(red).find((k) => url.includes(k));
    const r = clave ? red[clave] : { status: 404, body: {} };
    if (r instanceof Error) throw r;
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => (typeof r.body === "function" ? r.body(init, url) : r.body) };
  };
  const handler = crearHandler({
    env: { SUPABASE_URL: "https://db.example.com", SUPABASE_SERVICE_ROLE_KEY: "test", ...env },
    cliente, solicitar, ia: () => intentos, espera: 0,
  });
  const res = { setHeader() {}, status(n) { this.codigo = n; return this; }, json(body) { this.body = body; return this; } };
  const req = { method: "POST", headers: { authorization: "Bearer session" }, body: { busqueda: "Wedding venues", zona: "Miami, FL" } };
  return { handler, res, req, llamadas };
}

test("sesiones ausentes, inválidas o de vendedores no disparan búsquedas", async () => {
  for (const options of [{ valid: false }, { email: "seller@example.com" }, { sinToken: true }]) {
    const s = escenario(options);
    if (options.sinToken) s.req.headers = {};
    await s.handler(s.req, s.res);
    assert.ok([401, 403].includes(s.res.codigo));
    assert.equal(s.llamadas.length, 0);
  }
});

test("con clave de Google busca ahí, pagina y la clave no sale al cliente", async () => {
  const s = escenario({
    email: "owner@example.com", role: "ceo",
    env: { GOOGLE_PLACES_API_KEY: "g-secret" },
    red: { "places.googleapis.com": { body: (init) => JSON.parse(init.body).pageToken
      ? { places: [lugarGoogle("b")] }
      : { places: [lugarGoogle("a")], nextPageToken: "p2" } } },
  });
  await s.handler(s.req, s.res);
  assert.equal(s.res.codigo, 200);
  assert.equal(s.res.body.fuente, "google");
  assert.equal(s.res.body.ia, false);
  assert.equal(s.res.body.resultados.length, 2);
  assert.equal(s.res.body.rubro.id, "bodas");
  assert.equal(s.llamadas.length, 2);
  assert.equal(JSON.parse(s.llamadas[0][1].body).textQuery, "wedding venue in Miami, FL");
  assert.ok(!JSON.stringify(s.res.body).includes("g-secret"));
});

test("sin clave cae a OpenStreetMap; zona desconocida da un error claro", async () => {
  const ok = escenario({ red: { "nominatim": { body: (init, url) => url.includes("viewbox")
    ? [{ osm_type: "node", osm_id: 1, lat: "25.8", lon: "-80.2", name: "Barn Venue", type: "events_venue", address: { country_code: "us" } }]
    : [{ lat: "25.77", lon: "-80.19", boundingbox: ["25.7", "25.9", "-80.3", "-80.1"] }] } } });
  await ok.handler(ok.req, ok.res);
  assert.equal(ok.res.codigo, 200);
  assert.equal(ok.res.body.fuente, "osm");
  assert.equal(ok.res.body.resultados[0].nombre, "Barn Venue");

  const mal = escenario({ red: { "nominatim": { body: [] } } });
  await mal.handler(mal.req, mal.res);
  assert.equal(mal.res.codigo, 400);
  assert.equal(mal.llamadas.length, 1);
});

test("la IA enriquece; si falla, los resultados salen igual por reglas", async () => {
  const red = { "places.googleapis.com": { body: { places: [lugarGoogle("a")] } } };
  const intentos = [{ proveedor: "groq", url: "https://ia.example/chat", apiKey: "k", model: "m" }];

  const bien = escenario({ env: { GOOGLE_PLACES_API_KEY: "g" }, intentos, red: { ...red,
    "ia.example": { body: { choices: [{ message: { content: JSON.stringify({ resultados: [{ id: "g:a", score: 95, unidad: "4-Stall", paquete: "Starter", enfoque: "Abrí con las bodas al aire libre." }] }) } }] } },
  } });
  await bien.handler(bien.req, bien.res);
  assert.equal(bien.res.body.ia, true);
  assert.equal(bien.res.body.resultados[0].enfoque_venta, "Abrí con las bodas al aire libre.");
  assert.equal(bien.res.body.resultados[0].productos_sugeridos, "4-Stall · paquete Starter");

  const caida = escenario({ env: { GOOGLE_PLACES_API_KEY: "g" }, intentos, red: { ...red, "ia.example": { status: 500, body: {} } } });
  await caida.handler(caida.req, caida.res);
  assert.equal(caida.res.codigo, 200);
  assert.equal(caida.res.body.ia, false);
  assert.equal(caida.res.body.resultados.length, 1);
});

test("errores de Google y timeouts tienen respuesta controlada", async () => {
  for (const [red, codigo] of [
    [{ "places.googleapis.com": { status: 403, body: { error: { message: "API key not valid" } } } }, 503],
    [{ "places.googleapis.com": { status: 429, body: {} } }, 429],
    [{ "places.googleapis.com": new DOMException("timeout", "TimeoutError") }, 504],
  ]) {
    const s = escenario({ env: { GOOGLE_PLACES_API_KEY: "g" }, red });
    await s.handler(s.req, s.res);
    assert.equal(s.res.codigo, codigo);
    assert.equal(s.res.body.resultados, undefined);
    assert.ok(s.res.body.error);
  }
});

// ── Mensaje de presentación ─────────────────────────────────

test("redactar: sin IA arma el mensaje del rubro, con firma y baja siempre", async () => {
  const s = escenario();
  s.req.body = { accion: "redactar", firma: "Nicolas · Nini T Group", negocio: { nombre: "Lake RV", rubro: "Campings y RV parks", ciudad: "Austin, TX" } };
  await s.handler(s.req, s.res);
  assert.equal(s.res.codigo, 200);
  assert.equal(s.res.body.ia, false);
  assert.match(s.res.body.asunto, /Lake RV/);
  assert.match(s.res.body.email, /peak season/);
  assert.match(s.res.body.email, /Nicolas · Nini T Group\n\nIf you'd rather not hear from us/);
  assert.ok(s.res.body.whatsapp.length < 400);
  assert.equal(s.llamadas.length, 0);
});

test("redactar: usa la IA, respeta al vendedor y valida el negocio", async () => {
  const intentos = [{ proveedor: "groq", url: "https://ia.example/chat", apiKey: "k", model: "m" }];
  const s = escenario({ intentos, red: { "ia.example": { body: { choices: [{ message: { content: JSON.stringify({ asunto: "Restrooms for your weddings", cuerpo: "Hi team, ...", whatsapp: "Hi!" }) } }] } } } });
  s.req.body = { accion: "redactar", negocio: { nombre: "Barn Venue" } };
  await s.handler(s.req, s.res);
  assert.equal(s.res.body.ia, true);
  assert.equal(s.res.body.asunto, "Restrooms for your weddings");
  assert.match(s.res.body.email, /^Hi team, \.\.\.\n\nNini T Group/);

  const vendedor = escenario({ email: "seller@example.com" });
  vendedor.req.body = { accion: "redactar", negocio: { nombre: "X" } };
  await vendedor.handler(vendedor.req, vendedor.res);
  assert.equal(vendedor.res.codigo, 403);

  const vacio = escenario();
  vacio.req.body = { accion: "redactar", negocio: {} };
  await vacio.handler(vacio.req, vacio.res);
  assert.equal(vacio.res.codigo, 400);
});
