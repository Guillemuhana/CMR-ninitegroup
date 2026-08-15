// ── Servicio Meta Conversions API ───────────────────────────────────────────
//
// Módulo independiente y reutilizable: no sabe nada del CRM ni de Supabase.
// Recibe datos, arma el payload que pide Meta y lo manda con timeout,
// reintentos y backoff. Se puede usar desde cualquier endpoint.
//
// Endpoint oficial (Graph API):
//   POST https://graph.facebook.com/{VERSION}/{DATASET_ID}/events
//   body: { data: [ …eventos… ], access_token, test_event_code? }
//
// Docs:
//   https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/
//   https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/
//
// PRIVACIDAD: acá no se loguea nunca el token ni un dato personal en claro.
// Lo único que sale por consola es nombre de evento, estado HTTP y el prefijo
// del event_id (que ya es un hash).

import { createHash } from "node:crypto";

// ── Configuración por entorno ───────────────────────────────────────────────
// Todo viene de variables de entorno; no hay credenciales en el código.
// `overrides` existe para los tests (que nunca llaman a Meta de verdad).
export function configMeta(overrides = {}) {
  const env = overrides.env || process.env;
  return {
    token: env.META_CAPI_TOKEN || env.META_ACCESS_TOKEN || "",
    datasetId: env.META_DATASET_ID || env.META_PIXEL_ID || "",
    version: env.META_GRAPH_VERSION || "v22.0",
    pageId: env.META_PAGE_ID || env.MESSENGER_PAGE_ID || "",
    wabaId: env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || "",
    igId: env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID || "",
    testEventCode: env.META_TEST_EVENT_CODE || "",
    // Cuando el contacto NO tiene atribución de mensajería no se puede usar
    // 'business_messaging' (Meta exige page_id/PSID o WABA/ctwa_clid). Se cae a
    // 'chat', que es un action_source válido y describe el origen real: la
    // conversión ocurrió conversando, no en un sitio web.
    actionSourceFallback: env.META_ACTION_SOURCE_FALLBACK || "chat",
    // Prefijo telefónico por defecto para números sin código de país
    // (NINIT opera en Miami → 1).
    codigoPais: env.META_PHONE_COUNTRY_CODE || "1",
    timeoutMs: Number(env.META_CAPI_TIMEOUT_MS || 8000),
    reintentos: Number(env.META_CAPI_REINTENTOS || 3),
    ...overrides,
  };
}

export function metaConfigurado(cfg = configMeta()) {
  return Boolean(cfg.token && cfg.datasetId);
}

// ── Normalización + hashing ─────────────────────────────────────────────────
// Meta exige SHA-256 (hex, minúsculas) SOLO sobre los datos personales:
// em, ph, fn, ln, ct, st, zp, country, external_id.
// NO se hashean: page_id, page_scoped_user_id, ctwa_clid,
// whatsapp_business_account_id, ig_sid, fbc, fbp, client_ip_address,
// client_user_agent. Hashearlos rompe el matching.

export function sha256(valor) {
  return createHash("sha256").update(String(valor)).digest("hex");
}

/** Hashea sólo si hay algo que hashear. Devuelve null para vacíos. */
export function hashear(valor) {
  const v = valor == null ? "" : String(valor).trim();
  return v ? sha256(v) : null;
}

/** email → minúsculas, sin espacios. */
export function normalizarEmail(email) {
  const v = String(email || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : null;
}

/**
 * teléfono → sólo dígitos, con código de país, sin '+' ni ceros iniciales.
 * Un número de 10 dígitos (formato local US) recibe el código de país.
 * Devuelve null si no parece un teléfono (evita mandar un PSID de Messenger,
 * que es un número larguísimo, como si fuera un teléfono).
 */
export function normalizarTelefono(telefono, codigoPais = "1") {
  let d = String(telefono || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  if (d.length === 10) d = `${codigoPais}${d}`;
  if (d.length < 8 || d.length > 15) return null;   // E.164: máximo 15 dígitos
  return d;
}

/** nombre/apellido/ciudad → minúsculas, sin espacios ni puntuación. */
export function normalizarNombre(txt) {
  const v = String(txt || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  return v || null;
}

/** país / estado → código de 2 letras en minúscula. */
export function normalizarCodigo2(txt) {
  const v = String(txt || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return v.length === 2 ? v : null;
}

// ── user_data + action_source ───────────────────────────────────────────────

/**
 * Decide el action_source real y arma el user_data del contacto.
 *
 * Prioridad (de más a menos preciso para Meta):
 *   1. Messenger  → business_messaging + page_id + page_scoped_user_id
 *   2. WhatsApp   → business_messaging + whatsapp_business_account_id + ctwa_clid
 *   3. Instagram  → business_messaging + instagram_business_account_id + ig_sid
 *   4. Sin atribución de mensajería → actionSourceFallback ('chat') con los
 *      datos personales hasheados (advanced matching).
 *
 * Nunca se fuerza 'website': ninguna de estas conversiones ocurre en la web.
 */
export function construirUserData(contacto = {}, cfg = configMeta()) {
  const canal = String(contacto.canal || "").trim().toLowerCase();
  const canalMeta = String(contacto.meta_messaging_channel || "").trim().toLowerCase();

  // 1) Messenger: el PSID lo tenemos siempre que el lead haya entrado por ahí.
  if (cfg.pageId && contacto.messenger_id && (canal === "messenger" || canalMeta === "messenger" || !canal)) {
    return {
      action_source: "business_messaging",
      messaging_channel: "messenger",
      user_data: {
        page_id: String(cfg.pageId),
        page_scoped_user_id: String(contacto.messenger_id),
        ...datosPersonales(contacto, cfg),
      },
    };
  }

  // 2) WhatsApp: hace falta el click id del anuncio (ctwa_clid). Sin él Meta
  //    procesa el evento pero no lo asocia al anuncio, y además exige la WABA.
  if (cfg.wabaId && contacto.meta_ctwa_clid) {
    return {
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        whatsapp_business_account_id: String(cfg.wabaId),
        ctwa_clid: String(contacto.meta_ctwa_clid),
        ...datosPersonales(contacto, cfg),
      },
    };
  }

  // 3) Instagram Direct.
  if (cfg.igId && contacto.instagram_id) {
    return {
      action_source: "business_messaging",
      messaging_channel: "instagram",
      user_data: {
        instagram_business_account_id: String(cfg.igId),
        ig_sid: String(contacto.instagram_id),
        ...datosPersonales(contacto, cfg),
      },
    };
  }

  // 4) Sin atribución de mensajería.
  return {
    action_source: cfg.actionSourceFallback,
    messaging_channel: null,
    user_data: datosPersonales(contacto, cfg),
  };
}

/** Datos personales normalizados y hasheados (los únicos que Meta exige hashear). */
function datosPersonales(contacto = {}, cfg = configMeta()) {
  const out = {};

  const em = normalizarEmail(contacto.email);
  if (em) out.em = [sha256(em)];

  // El teléfono de un contacto de Messenger es en realidad el PSID (así lo
  // guarda el webhook), así que ahí no se manda como teléfono.
  const esPsid = contacto.messenger_id && String(contacto.messenger_id) === String(contacto.telefono);
  if (!esPsid) {
    const ph = normalizarTelefono(contacto.telefono, cfg.codigoPais);
    if (ph) out.ph = [ph].map(sha256);
  }

  const partes = String(contacto.nombre || "").trim().split(/\s+/).filter(Boolean);
  const fn = normalizarNombre(partes[0]);
  const ln = normalizarNombre(partes.slice(1).join(""));
  if (fn) out.fn = [sha256(fn)];
  if (ln) out.ln = [sha256(ln)];

  const ct = normalizarNombre(contacto.ia_ciudad);
  if (ct) out.ct = [sha256(ct)];
  const st = normalizarCodigo2(contacto.ia_estado_provincia);
  if (st) out.st = [sha256(st)];
  const country = normalizarCodigo2(contacto.ia_pais);
  if (country) out.country = [sha256(country)];

  // external_id: el id del contacto en el CRM. Meta recomienda hashearlo.
  if (contacto.id) out.external_id = [sha256(String(contacto.id))];

  return out;
}

// ── Armado del evento ───────────────────────────────────────────────────────

/**
 * Arma un server event completo.
 * Devuelve { evento, action_source, messaging_channel } — el evento es el
 * objeto que va dentro de `data[]`.
 */
export function construirEvento({ contacto, eventName, eventNameOtro, eventId, eventTime, valor, moneda, custom }, cfg = configMeta()) {
  const { action_source, messaging_channel, user_data } = construirUserData(contacto, cfg);

  // Fuera de mensajería puede corresponder otro nombre (ver _meta/mapeo.js).
  const nombre = action_source === "business_messaging" ? eventName : (eventNameOtro || eventName);

  const evento = {
    event_name: nombre,
    event_time: Math.floor((eventTime ? new Date(eventTime).getTime() : Date.now()) / 1000),
    event_id: eventId,
    action_source,
    user_data,
  };
  if (messaging_channel) evento.messaging_channel = messaging_channel;

  const custom_data = { ...(custom || {}) };
  if (valor != null && Number.isFinite(Number(valor))) {
    custom_data.value = Number(valor);
    custom_data.currency = String(moneda || "USD").toUpperCase();
  }
  if (Object.keys(custom_data).length) evento.custom_data = custom_data;

  return { evento, action_source, messaging_channel };
}

// ── Envío con timeout, reintentos y backoff ────────────────────────────────

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** ¿Vale la pena reintentar? Sí en red caída, 429 y 5xx. No en 400/401/403. */
function esReintentable(status) {
  return status == null || status === 429 || (status >= 500 && status < 600);
}

/**
 * Manda uno o más eventos al dataset.
 *
 * @param {Array<object>} eventos  objetos ya armados por construirEvento()
 * @param {object} opts  { cfg, fetch, onIntento }  (fetch inyectable para tests)
 * @returns {Promise<{ok:boolean, status:number|null, body:object|null, intentos:number, error:string|null}>}
 *
 * NUNCA lanza: el llamador decide qué hacer con `ok === false`. Un fallo de
 * Meta jamás debe frenar al CRM.
 */
export async function enviarEventos(eventos, opts = {}) {
  const cfg = opts.cfg || configMeta();
  const doFetch = opts.fetch || globalThis.fetch;

  if (!metaConfigurado(cfg)) {
    return { ok: false, status: null, body: null, intentos: 0, error: "Meta CAPI no configurado (faltan META_CAPI_TOKEN / META_DATASET_ID)." };
  }
  if (!eventos?.length) {
    return { ok: true, status: null, body: null, intentos: 0, error: null };
  }

  const url = `https://graph.facebook.com/${cfg.version}/${cfg.datasetId}/events`;
  const body = { data: eventos, access_token: cfg.token };
  if (cfg.testEventCode) body.test_event_code = cfg.testEventCode;

  const maxIntentos = Math.max(1, cfg.reintentos);
  let ultimoError = null;
  let ultimoStatus = null;

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
    try {
      const r = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = await r.json().catch(() => ({}));
      ultimoStatus = r.status;

      if (r.ok) {
        return { ok: true, status: r.status, body: json, intentos: intento, error: null };
      }

      // Mensaje de error sin datos personales ni token.
      ultimoError = json?.error?.message || `Meta devolvió ${r.status}`;
      if (!esReintentable(r.status)) {
        return { ok: false, status: r.status, body: json, intentos: intento, error: ultimoError };
      }
    } catch (e) {
      ultimoStatus = null;
      ultimoError = e?.name === "AbortError" ? `Timeout de ${cfg.timeoutMs} ms` : (e?.message || "Error de red");
    } finally {
      clearTimeout(t);
    }

    if (intento < maxIntentos) {
      // Backoff exponencial con jitter: 400ms, 800ms, 1600ms…
      const espera = 400 * 2 ** (intento - 1) + Math.floor(Math.random() * 200);
      await dormir(espera);
    }
  }

  return { ok: false, status: ultimoStatus, body: null, intentos: maxIntentos, error: ultimoError };
}
