// Tests de la integración con la Conversions API de Meta.
//   npm test        (usa el runner nativo de Node, sin dependencias nuevas)
//
// NINGÚN test llama a Meta de verdad: el `fetch` es inyectable y acá siempre
// se le pasa uno falso.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { resolverTransicion, idEvento, EVENTOS_POR_ESTADO } from "../api/_meta/mapeo.js";
import {
  configMeta, metaConfigurado, sha256, hashear,
  normalizarEmail, normalizarTelefono, normalizarNombre, normalizarCodigo2,
  construirUserData, construirEvento, enviarEventos,
} from "../api/_meta/capi.js";

const ENV = {
  META_CAPI_TOKEN: "TOKEN_FALSO",
  META_DATASET_ID: "999888777",
  META_PAGE_ID: "769915269545554",
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: "111222333",
  META_CAPI_REINTENTOS: "3",
  META_CAPI_TIMEOUT_MS: "500",
};
const cfg = () => configMeta({ env: ENV });

const CONTACTO_MESSENGER = {
  id: "11111111-1111-1111-1111-111111111111",
  canal: "messenger",
  messenger_id: "36089244930720766",
  telefono: "36089244930720766",   // el webhook guarda el PSID también acá
  nombre: "John Doe",
  email: "John.Doe@Example.com ",
};

const CONTACTO_WHATSAPP = {
  id: "22222222-2222-2222-2222-222222222222",
  canal: "whatsapp",
  telefono: "+1 (786) 555-1234",
  nombre: "María Pérez",
  meta_ctwa_clid: "ARBxyz123",
};

const CONTACTO_SIN_ATRIBUCION = {
  id: "33333333-3333-3333-3333-333333333333",
  canal: "whatsapp",
  telefono: "7865551234",
  nombre: "Sin Atribucion",
};

// ── Mapeo de estados ────────────────────────────────────────────────────────

test("mapeo: cada etapa del CRM produce el evento esperado", () => {
  const casos = [
    ["contactado", "LeadSubmitted", "Lead"],
    ["interesado", "QualifiedLead", "QualifiedLead"],
    ["cotizacion", "InitiateCheckout", "InitiateCheckout"],
    ["vendido", "Purchase", "Purchase"],
    ["pedido", "Purchase", "Purchase"],
    ["cerrado", "Purchase", "Purchase"],
  ];
  for (const [estado, evento, eventoOtro] of casos) {
    const t = resolverTransicion({ estadoAnterior: "nuevo", estadoNuevo: estado });
    assert.ok(t, `${estado} debería producir evento`);
    assert.equal(t.evento, evento);
    assert.equal(t.eventoOtro, eventoOtro);
  }
});

test("mapeo: los estados sin evento no emiten nada", () => {
  for (const estado of ["nuevo", "negociando", "pendiente", "perdido", "en_conversacion", "inventado"]) {
    assert.equal(resolverTransicion({ estadoAnterior: "contactado", estadoNuevo: estado }), null, estado);
  }
});

test("mapeo: sólo la venta se marca como venta (lleva valor + moneda)", () => {
  assert.equal(resolverTransicion({ estadoAnterior: "nuevo", estadoNuevo: "vendido" }).esVenta, true);
  assert.equal(resolverTransicion({ estadoAnterior: "nuevo", estadoNuevo: "cotizacion" }).esVenta, false);
});

test("mapeo: una actualización que NO cambia la etapa no genera evento", () => {
  assert.equal(resolverTransicion({ estadoAnterior: "vendido", estadoNuevo: "vendido" }), null);
  assert.equal(resolverTransicion({ estadoAnterior: "cotizacion", estadoNuevo: " Cotizacion " }), null);
  assert.equal(resolverTransicion({ estadoAnterior: "contactado", estadoNuevo: null }), null);
  assert.equal(resolverTransicion({ estadoAnterior: "contactado", estadoNuevo: "" }), null);
  assert.equal(resolverTransicion({ estadoAnterior: null, estadoNuevo: undefined }), null);
});

test("mapeo: la config no tiene nombres de evento fuera de las listas de Meta", () => {
  // Standard events del Pixel + eventos soportados en business messaging.
  const PERMITIDOS = new Set([
    "AddPaymentInfo", "AddToCart", "AddToWishlist", "CompleteRegistration", "Contact",
    "CustomizeProduct", "Donate", "FindLocation", "InitiateCheckout", "Lead", "Purchase",
    "Schedule", "Search", "StartTrial", "SubmitApplication", "Subscribe", "ViewContent",
    "LeadSubmitted", "QualifiedLead", "OrderCreated", "OrderShipped", "OrderDelivered",
    "OrderCanceled", "OrderReturned", "CartAbandoned", "RatingProvided", "ReviewProvided",
  ]);
  for (const [estado, cfgEstado] of Object.entries(EVENTOS_POR_ESTADO)) {
    if (!cfgEstado) continue;
    assert.ok(PERMITIDOS.has(cfgEstado.evento), `${estado}: ${cfgEstado.evento} no está en las listas de Meta`);
    assert.ok(PERMITIDOS.has(cfgEstado.eventoOtro), `${estado}: ${cfgEstado.eventoOtro} no está en las listas de Meta`);
  }
});

// ── event_id ────────────────────────────────────────────────────────────────

test("event_id: es determinístico y con forma de sha256", () => {
  const a = idEvento({ contactoId: "abc", evento: "Purchase" });
  const b = idEvento({ contactoId: "abc", evento: "Purchase" });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("event_id: cambia con el contacto, con el evento y con la referencia", () => {
  const base = idEvento({ contactoId: "abc", evento: "Purchase" });
  assert.notEqual(base, idEvento({ contactoId: "xyz", evento: "Purchase" }));
  assert.notEqual(base, idEvento({ contactoId: "abc", evento: "Lead" }));
  assert.notEqual(base, idEvento({ contactoId: "abc", evento: "Purchase", ref: "pedido-1" }));
});

test("event_id: pasar por vendido → pedido → cerrado da SIEMPRE el mismo id", () => {
  // Los tres estados mapean a Purchase, así que el id no cambia y el UNIQUE del
  // outbox impide que se mande un segundo Purchase.
  const ids = ["vendido", "pedido", "cerrado"].map((estado) => {
    const t = resolverTransicion({ estadoAnterior: "cotizacion", estadoNuevo: estado });
    return idEvento({ contactoId: CONTACTO_MESSENGER.id, evento: t.evento });
  });
  assert.equal(new Set(ids).size, 1);
});

// ── Normalización y hashing ────────────────────────────────────────────────

test("hashing: sha256 en hexadecimal minúscula", () => {
  assert.equal(sha256("john.doe@example.com"), createHash("sha256").update("john.doe@example.com").digest("hex"));
  assert.match(sha256("x"), /^[0-9a-f]{64}$/);
  assert.equal(hashear("  "), null);
  assert.equal(hashear(null), null);
});

test("normalización: email en minúsculas y sin espacios", () => {
  assert.equal(normalizarEmail("  John.Doe@Example.COM "), "john.doe@example.com");
  assert.equal(normalizarEmail("no-es-un-email"), null);
  assert.equal(normalizarEmail(""), null);
});

test("normalización: teléfono a dígitos con código de país", () => {
  assert.equal(normalizarTelefono("+1 (786) 555-1234"), "17865551234");
  assert.equal(normalizarTelefono("7865551234"), "17865551234");     // agrega el código
  assert.equal(normalizarTelefono("7865551234", "54"), "547865551234");
  assert.equal(normalizarTelefono("0054 11 5555 4444"), "541155554444");
  assert.equal(normalizarTelefono("123"), null);                     // muy corto
  assert.equal(normalizarTelefono("36089244930720766"), null);       // PSID, no es teléfono
  assert.equal(normalizarTelefono(""), null);
});

test("normalización: nombres y códigos de 2 letras", () => {
  assert.equal(normalizarNombre("  Pérez-López "), "pérezlópez");
  assert.equal(normalizarNombre("O'Brien"), "obrien");
  assert.equal(normalizarNombre("  "), null);
  assert.equal(normalizarCodigo2(" FL "), "fl");
  assert.equal(normalizarCodigo2("Florida"), null);
});

test("user_data: se hashea SOLO lo personal; los ids de Meta van en claro", () => {
  const { user_data, action_source, messaging_channel } = construirUserData(CONTACTO_MESSENGER, cfg());

  assert.equal(action_source, "business_messaging");
  assert.equal(messaging_channel, "messenger");

  // Sin hashear (si se hashearan, Meta no podría matchear).
  assert.equal(user_data.page_id, ENV.META_PAGE_ID);
  assert.equal(user_data.page_scoped_user_id, CONTACTO_MESSENGER.messenger_id);

  // Hasheado y normalizado antes de hashear.
  assert.deepEqual(user_data.em, [sha256("john.doe@example.com")]);
  assert.deepEqual(user_data.fn, [sha256("john")]);
  assert.deepEqual(user_data.ln, [sha256("doe")]);
  assert.deepEqual(user_data.external_id, [sha256(CONTACTO_MESSENGER.id)]);

  // El "teléfono" de un contacto de Messenger es el PSID: no se manda como ph.
  assert.equal(user_data.ph, undefined);

  // Ningún dato personal viaja en claro.
  const plano = JSON.stringify(user_data);
  assert.ok(!plano.includes("John"));
  assert.ok(!plano.includes("example.com"));
});

test("user_data: WhatsApp usa ctwa_clid + WABA, sin hashear", () => {
  const { user_data, action_source, messaging_channel } = construirUserData(CONTACTO_WHATSAPP, cfg());
  assert.equal(action_source, "business_messaging");
  assert.equal(messaging_channel, "whatsapp");
  assert.equal(user_data.ctwa_clid, "ARBxyz123");
  assert.equal(user_data.whatsapp_business_account_id, ENV.META_WHATSAPP_BUSINESS_ACCOUNT_ID);
  assert.deepEqual(user_data.ph, [sha256("17865551234")]);
});

test("user_data: sin atribución de mensajería cae al action_source de respaldo, no a 'website'", () => {
  const { action_source, messaging_channel, user_data } = construirUserData(CONTACTO_SIN_ATRIBUCION, cfg());
  assert.equal(action_source, "chat");
  assert.equal(messaging_channel, null);
  assert.equal(user_data.page_id, undefined);
  assert.deepEqual(user_data.ph, [sha256("17865551234")]);
});

// ── Armado del evento ───────────────────────────────────────────────────────

test("evento: campos obligatorios y nombre según el canal", () => {
  const { evento } = construirEvento({
    contacto: CONTACTO_MESSENGER,
    eventName: "LeadSubmitted", eventNameOtro: "Lead",
    eventId: "abc123",
  }, cfg());

  assert.equal(evento.event_name, "LeadSubmitted");    // business messaging
  assert.equal(evento.event_id, "abc123");
  assert.equal(evento.action_source, "business_messaging");
  assert.equal(evento.messaging_channel, "messenger");
  assert.ok(Number.isInteger(evento.event_time));
  assert.ok(evento.event_time > 1_600_000_000 && evento.event_time < 4_000_000_000); // segundos, no ms
  assert.equal(evento.custom_data, undefined);          // sin importe no hay custom_data

  const otro = construirEvento({
    contacto: CONTACTO_SIN_ATRIBUCION,
    eventName: "LeadSubmitted", eventNameOtro: "Lead",
    eventId: "abc123",
  }, cfg()).evento;
  assert.equal(otro.event_name, "Lead");                // fuera de mensajería, el estándar
  assert.equal(otro.messaging_channel, undefined);
});

test("evento: la venta con importe lleva value + currency", () => {
  const { evento } = construirEvento({
    contacto: CONTACTO_MESSENGER,
    eventName: "Purchase", eventNameOtro: "Purchase",
    eventId: "v1", valor: 48500, moneda: "usd",
  }, cfg());
  assert.equal(evento.custom_data.value, 48500);
  assert.equal(evento.custom_data.currency, "USD");
});

// ── Envío: errores, reintentos y backoff ───────────────────────────────────

function fetchFalso(respuestas) {
  const llamadas = [];
  const fn = async (url, opts) => {
    llamadas.push({ url, body: JSON.parse(opts.body) });
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    if (typeof r === "function") return r();
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body || {} };
  };
  fn.llamadas = llamadas;
  return fn;
}

const EVENTO = { event_name: "Lead", event_time: 1, event_id: "x", action_source: "chat", user_data: {} };

test("envío: caso feliz, una sola llamada al endpoint correcto", async () => {
  const f = fetchFalso([{ status: 200, body: { events_received: 1 } }]);
  const r = await enviarEventos([EVENTO], { cfg: cfg(), fetch: f });

  assert.equal(r.ok, true);
  assert.equal(r.intentos, 1);
  assert.equal(f.llamadas.length, 1);
  assert.equal(f.llamadas[0].url, `https://graph.facebook.com/v22.0/${ENV.META_DATASET_ID}/events`);
  assert.deepEqual(f.llamadas[0].body.data, [EVENTO]);
  assert.equal(f.llamadas[0].body.access_token, ENV.META_CAPI_TOKEN);
});

test("envío: un 500 se reintenta con backoff hasta el tope y devuelve error", async () => {
  const f = fetchFalso([{ status: 500, body: { error: { message: "boom" } } }]);
  const t0 = Date.now();
  const r = await enviarEventos([EVENTO], { cfg: cfg(), fetch: f });

  assert.equal(r.ok, false);
  assert.equal(r.intentos, 3);
  assert.equal(f.llamadas.length, 3);
  assert.equal(r.error, "boom");
  assert.ok(Date.now() - t0 >= 1200, "tiene que haber esperado 400ms + 800ms de backoff");
});

test("envío: un 429 se reintenta; si después sale bien, devuelve ok", async () => {
  const f = fetchFalso([
    { status: 429, body: { error: { message: "rate limit" } } },
    { status: 200, body: { events_received: 1 } },
  ]);
  const r = await enviarEventos([EVENTO], { cfg: cfg(), fetch: f });
  assert.equal(r.ok, true);
  assert.equal(r.intentos, 2);
});

test("envío: un 400 NO se reintenta (el payload está mal, insistir no lo arregla)", async () => {
  const f = fetchFalso([{ status: 400, body: { error: { message: "Invalid parameter" } } }]);
  const r = await enviarEventos([EVENTO], { cfg: cfg(), fetch: f });
  assert.equal(r.ok, false);
  assert.equal(f.llamadas.length, 1);
  assert.equal(r.error, "Invalid parameter");
});

test("envío: si la red falla nunca lanza, devuelve ok:false", async () => {
  const f = fetchFalso([() => { throw new Error("ECONNRESET"); }]);
  const r = await enviarEventos([EVENTO], { cfg: cfg(), fetch: f });
  assert.equal(r.ok, false);
  assert.equal(r.error, "ECONNRESET");
  assert.equal(f.llamadas.length, 3);
});

test("envío: sin token ni dataset no se llama a Meta", async () => {
  const f = fetchFalso([{ status: 200 }]);
  const vacio = configMeta({ env: {} });
  assert.equal(metaConfigurado(vacio), false);
  const r = await enviarEventos([EVENTO], { cfg: vacio, fetch: f });
  assert.equal(r.ok, false);
  assert.equal(f.llamadas.length, 0);
});

test("envío: el test_event_code viaja sólo si está configurado", async () => {
  const f = fetchFalso([{ status: 200 }]);
  await enviarEventos([EVENTO], { cfg: cfg(), fetch: f });
  assert.equal(f.llamadas[0].body.test_event_code, undefined);

  const f2 = fetchFalso([{ status: 200 }]);
  await enviarEventos([EVENTO], { cfg: configMeta({ env: { ...ENV, META_TEST_EVENT_CODE: "TEST123" } }), fetch: f2 });
  assert.equal(f2.llamadas[0].body.test_event_code, "TEST123");
});

// ── Deduplicación de punta a punta ─────────────────────────────────────────

test("dedup: una transición válida produce UN solo evento aunque se repita", async () => {
  // Reproduce el contrato del outbox (meta_eventos.event_id UNIQUE) que usa
  // api/_meta/enviar.js: reservar la fila antes de mandar, y si el id ya
  // existía, no mandar.
  const outbox = new Set();
  const f = fetchFalso([{ status: 200, body: { events_received: 1 } }]);

  const avanzar = async (estadoAnterior, estadoNuevo) => {
    const t = resolverTransicion({ estadoAnterior, estadoNuevo });
    if (!t) return "sin-evento";
    const id = idEvento({ contactoId: CONTACTO_MESSENGER.id, evento: t.evento });
    if (outbox.has(id)) return "duplicado";
    outbox.add(id);
    const { evento } = construirEvento({
      contacto: CONTACTO_MESSENGER, eventName: t.evento, eventNameOtro: t.eventoOtro, eventId: id,
    }, cfg());
    await enviarEventos([evento], { cfg: cfg(), fetch: f });
    return "enviado";
  };

  assert.equal(await avanzar("nuevo", "cotizacion"), "enviado");
  assert.equal(await avanzar("cotizacion", "cotizacion"), "sin-evento"); // update sin cambio real
  assert.equal(await avanzar("negociando", "cotizacion"), "duplicado");  // volvió atrás y re-avanzó
  assert.equal(await avanzar("cotizacion", "vendido"), "enviado");
  assert.equal(await avanzar("vendido", "cerrado"), "duplicado");        // sigue siendo la misma venta

  assert.equal(f.llamadas.length, 2, "sólo InitiateCheckout y Purchase");
});
