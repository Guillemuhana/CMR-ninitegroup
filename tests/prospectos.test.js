import test from "node:test";
import assert from "node:assert/strict";
import { crearHandler, prepararBusqueda, validarResultados } from "../api/_prospectos/buscar.js";

const negocio = { place_id: "us-1", nombre: "Event Rentals", pais: "US", lead_score: 82 };

test("consulta fija USA y contexto NTG, valida los campos", () => {
  const body = prepararBusqueda({ busqueda: " Event rentals ", zona: " Miami, FL ", pais: "AR", contexto_comercial: "alimentos" });
  assert.equal(body.query_completo, "Event rentals in Miami, FL, United States");
  assert.equal(body.pais, "US");
  assert.match(body.contexto_comercial, /restroom trailers/);
  assert.equal(prepararBusqueda({ busqueda: {}, zona: "Miami" }), null);
  assert.equal(prepararBusqueda({ busqueda: "x", zona: " " }), null);
  assert.equal(prepararBusqueda({ busqueda: "x".repeat(161), zona: "Miami" }), null);
});

test("respuestas inválidas o sin país US se rechazan; IDs repetidos se eliminan", () => {
  assert.throws(() => validarResultados({ error: "fallo" }));
  for (const pais of ["AR", undefined]) assert.throws(() => validarResultados([{ ...negocio, pais }]));
  assert.throws(() => validarResultados([{ nombre: "Sin ID", pais: "US" }]));
  assert.equal(validarResultados({ leads: [negocio, negocio] }).length, 1);
  const [r] = validarResultados([{ ...negocio, lead_score: 200, latitud: 999, longitud: -80, enfoque_venta: {} }]);
  assert.equal(r.lead_score, 100);
  assert.equal(r.prioridad, "ALTA");
  assert.equal(r.latitud, null);
  assert.equal(r.longitud, -80);
  assert.equal(r.enfoque_venta, "");
  assert.deepEqual(validarResultados([]), []);
});

function escenario({ email = "ninitgroup@gmail.com", role = "vendedor", valid = true, envExtra = {}, respuesta = [negocio], fallo } = {}) {
  const llamadas = [];
  const env = { SUPABASE_URL: "https://db.example.com", SUPABASE_SERVICE_ROLE_KEY: "test", PROSPECTOS_WEBHOOK: "https://example.com/ntg", PROSPECTOS_WEBHOOK_SECRET: "secret", ...envExtra };
  const cliente = () => ({
    auth: { getUser: async () => ({ data: { user: valid ? { email } : null }, error: !valid }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
  });
  const handler = crearHandler({ env, cliente, solicitar: async (...args) => {
    llamadas.push(args);
    if (fallo) throw fallo;
    return { ok: true, json: async () => respuesta };
  } });
  const res = { setHeader() {}, status(n) { this.codigo = n; return this; }, json(body) { this.body = body; return this; } };
  const req = { method: "POST", headers: { authorization: "Bearer session" }, body: { busqueda: "Event rentals", zona: "Miami, FL" } };
  return { handler, res, req, llamadas };
}

test("sesiones ausentes, inválidas o vendedores no disparan búsquedas", async () => {
  for (const options of [{ valid: false }, { email: "seller@example.com" }, { sinToken: true }]) {
    const s = escenario(options);
    if (options.sinToken) s.req.headers = {};
    await s.handler(s.req, s.res);
    assert.ok([401, 403].includes(s.res.codigo));
    assert.equal(s.llamadas.length, 0);
  }
});

test("CEO por email o perfil obtiene resultados con secreto solo en servidor", async () => {
  for (const options of [{}, { email: "owner@example.com", role: "ceo" }]) {
    const s = escenario(options);
    await s.handler(s.req, s.res);
    assert.equal(s.res.codigo, 200);
    const [, init] = s.llamadas[0];
    assert.equal(init.headers["X-Prospectos-Secret"], "secret");
    assert.equal(JSON.parse(init.body).pais, "US");
    assert.equal(s.res.body.resultados[0].nombre, negocio.nombre);
    assert.ok(!JSON.stringify(s.res.body).includes("secret"));
  }
});

test("configuración ausente, insegura o de Munich no dispara búsquedas", async () => {
  for (const envExtra of [{ PROSPECTOS_WEBHOOK: "" }, { PROSPECTOS_WEBHOOK_SECRET: "" }, { PROSPECTOS_WEBHOOK: "http://example.com" }, { PROSPECTOS_WEBHOOK: "https://example.com/munich-prospectos-buscar" }]) {
    const s = escenario({ envExtra });
    await s.handler(s.req, s.res);
    assert.equal(s.res.codigo, 503);
    assert.equal(s.llamadas.length, 0);
  }
});

test("errores del proveedor y timeouts tienen respuesta controlada", async () => {
  for (const [options, codigo] of [[{ respuesta: { error: "upstream" } }, 502], [{ fallo: new DOMException("timeout", "TimeoutError") }, 504]]) {
    const s = escenario(options);
    await s.handler(s.req, s.res);
    assert.equal(s.res.codigo, codigo);
    assert.equal(s.res.body.resultados, undefined);
  }
});
