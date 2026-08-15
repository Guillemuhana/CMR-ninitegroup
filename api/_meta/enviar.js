// ── Endpoint: manda a Meta el evento de una transición de estado del CRM ────
//
// Se llega acá por  POST /api/meta-evento   (rewrite → /api/push?accion=meta;
// ver el comentario de api/push.js: el plan Hobby de Vercel tope 12 funciones).
//
// Body:
//   { contacto_id, estado_anterior, estado_nuevo, valor?, moneda?, ref? }
//   { accion: "drain" }   → sólo reintenta los eventos que quedaron fallados
//
// Autenticación: token de sesión de Supabase (Authorization: Bearer …) o el
// secreto compartido x-meta-secret (para n8n / triggers).
//
// Requiere en Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   META_CAPI_TOKEN, META_DATASET_ID
//   META_PAGE_ID (Messenger) y/o META_WHATSAPP_BUSINESS_ACCOUNT_ID (CTWA)
//   META_GRAPH_VERSION, META_ACTION_SOURCE_FALLBACK, META_TEST_EVENT_CODE (opcionales)
//   META_WEBHOOK_SECRET (opcional, para llamadas server-to-server)
//
// GARANTÍAS:
//  - Nunca corta el flujo del CRM: el estado ya se guardó antes de llamar acá.
//  - Nunca manda dos veces el mismo evento: el outbox `meta_eventos` tiene
//    UNIQUE(event_id) y el event_id es determinístico.
//  - Nunca loguea el token ni datos personales.

import { createClient } from "@supabase/supabase-js";
import { resolverTransicion, idEvento, MONEDA_DEFAULT } from "./mapeo.js";
import { configMeta, metaConfigurado, construirEvento, enviarEventos } from "./capi.js";

const MAX_INTENTOS = 5;      // tope de reintentos por evento
const MAX_DRAIN = 5;         // cuántos pendientes se reintentan por llamada
const PRESUPUESTO_DRAIN_MS = 5000; // hasta acá se drena; lo que sobre, la próxima

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY." });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Autenticación ────────────────────────────────────────────────────────
  const secreto = req.headers["x-meta-secret"] || "";
  const conSecreto = Boolean(process.env.META_WEBHOOK_SECRET) && secreto === process.env.META_WEBHOOK_SECRET;
  if (!conSecreto) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "No autenticado." });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Sesión inválida." });
  }

  const cfg = configMeta();
  if (!metaConfigurado(cfg)) {
    // No es un error del CRM: simplemente todavía no se cargaron las claves.
    return res.status(200).json({ enviado: false, motivo: "Meta CAPI sin configurar." });
  }

  const body = req.body || {};

  // ── Modo drenaje: sólo reintentar lo que quedó fallado ───────────────────
  if (body.accion === "drain") {
    const reintentados = await reintentarPendientes(admin, cfg);
    return res.status(200).json({ enviado: false, reintentados });
  }

  const { contacto_id, estado_anterior, estado_nuevo, valor, moneda, ref } = body;
  if (!contacto_id) return res.status(400).json({ error: "Falta contacto_id." });

  // ── ¿Esta transición genera evento? ──────────────────────────────────────
  const transicion = resolverTransicion({ estadoAnterior: estado_anterior, estadoNuevo: estado_nuevo });
  if (!transicion) {
    return res.status(200).json({ enviado: false, motivo: "La transición no genera evento." });
  }

  // ── Contacto (con sus datos de atribución) ───────────────────────────────
  const { data: contacto, error: errContacto } = await admin
    .from("contactos").select("*").eq("id", contacto_id).single();
  if (errContacto || !contacto) {
    return res.status(404).json({ error: "Contacto no encontrado." });
  }

  // Exclusión publicitaria: si el cliente pidió no ser usado para publicidad,
  // no se manda nada (queda registrado como 'omitido' para poder auditarlo).
  const optout = contacto.publicidad_optout === true;

  const eventId = idEvento({ contactoId: contacto_id, evento: transicion.evento, ref });

  // ── Outbox: reservar la fila ANTES de mandar ─────────────────────────────
  // Si el INSERT choca con el UNIQUE, el evento ya existe → no se manda de
  // nuevo. Esto cubre reintentos, doble click, dos pestañas y webhooks
  // repetidos, incluso si ocurren en paralelo.
  const { data: filas, error: errInsert } = await admin
    .from("meta_eventos")
    .insert({
      contacto_id,
      event_id: eventId,
      event_name: transicion.evento,
      estado_anterior: estado_anterior || null,
      estado_nuevo: transicion.estado,
      estado: optout ? "omitido" : "pendiente",
      error: optout ? "publicidad_optout" : null,
    })
    .select("id")
    .limit(1);

  if (errInsert) {
    // 23505 = unique_violation → ya se había registrado este evento.
    if (errInsert.code === "23505") {
      return res.status(200).json({ enviado: false, duplicado: true, event_id: eventId });
    }
    console.error("meta: no se pudo escribir el outbox", errInsert.code || errInsert.message);
    return res.status(200).json({ enviado: false, motivo: "outbox_no_disponible" });
  }

  if (optout) {
    return res.status(200).json({ enviado: false, motivo: "publicidad_optout" });
  }

  const filaId = filas?.[0]?.id;

  // ── Importe de la venta ──────────────────────────────────────────────────
  let importe = valor;
  let divisa = moneda;
  if (transicion.esVenta && importe == null) {
    importe = await totalDelUltimoPedido(admin, contacto_id);
  }
  if (importe != null && !divisa) divisa = MONEDA_DEFAULT;

  const { evento, action_source, messaging_channel } = construirEvento({
    contacto,
    eventName: transicion.evento,
    eventNameOtro: transicion.eventoOtro,
    eventId,
    valor: importe,
    moneda: divisa,
  }, cfg);

  const resultado = await enviarEventos([evento], { cfg });

  await cerrarFila(admin, filaId, {
    evento,
    action_source,
    messaging_channel,
    valor: importe,
    moneda: divisa,
    resultado,
  });

  // Aprovechamos el viaje para reintentar lo que hubiera quedado colgado.
  const reintentados = await reintentarPendientes(admin, cfg, filaId);

  // Ojo: siempre 200. Un fallo de Meta no es un fallo del CRM; el front no
  // debe mostrar error ni revertir nada. El detalle viaja en el body.
  return res.status(200).json({
    enviado: resultado.ok,
    event_id: eventId,
    event_name: evento.event_name,
    action_source,
    intentos: resultado.intentos,
    error: resultado.ok ? null : resultado.error,
    reintentados,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Marca la fila del outbox como enviada o fallada. Best-effort. */
async function cerrarFila(admin, filaId, { evento, action_source, messaging_channel, valor, moneda, resultado }) {
  if (!filaId) return;
  const patch = {
    action_source,
    canal: messaging_channel || null,
    valor: valor != null ? Number(valor) : null,
    moneda: valor != null ? (moneda || MONEDA_DEFAULT) : null,
    event_name: evento.event_name,
    // Se guarda el payload SIN el token (nunca viajó en el evento) y con los
    // datos personales ya hasheados por capi.js.
    payload: evento,
    intentos: resultado.intentos,
    estado: resultado.ok ? "enviado" : "error",
    error: resultado.ok ? null : String(resultado.error || "").slice(0, 500),
    enviado_at: resultado.ok ? new Date().toISOString() : null,
    respuesta: resultado.body || null,
  };
  const { error } = await admin.from("meta_eventos").update(patch).eq("id", filaId);
  if (error) console.error("meta: no se pudo cerrar la fila del outbox", error.code || error.message);
}

/**
 * Reintenta los eventos que quedaron en 'error' (o 'pendiente' huérfanos, por
 * ejemplo si la función se cortó a mitad de camino). Se ejecuta de a poco y en
 * cada llamada, así el outbox se drena solo sin necesidad de un cron nuevo
 * (Vercel Hobby ya tiene los suyos ocupados).
 */
async function reintentarPendientes(admin, cfg, excluirId = null) {
  const haceUnMinuto = new Date(Date.now() - 60_000).toISOString();
  let q = admin
    .from("meta_eventos")
    .select("id, contacto_id, event_id, event_name, estado_nuevo, valor, moneda, intentos")
    .in("estado", ["error", "pendiente"])
    .lt("intentos", MAX_INTENTOS)
    .lt("created_at", haceUnMinuto)
    .order("created_at", { ascending: true })
    .limit(MAX_DRAIN);
  if (excluirId) q = q.neq("id", excluirId);

  const { data: filas, error } = await q;
  if (error || !filas?.length) return 0;

  let ok = 0;
  const hasta = Date.now() + PRESUPUESTO_DRAIN_MS;
  for (const fila of filas) {
    // Si el drenaje se está comiendo el tiempo de la función, se corta: las
    // filas siguen en el outbox y se reintentan en la próxima llamada.
    if (Date.now() > hasta) break;

    const { data: contacto } = await admin.from("contactos").select("*").eq("id", fila.contacto_id).single();
    if (!contacto) continue;
    if (contacto.publicidad_optout === true) {
      await admin.from("meta_eventos").update({ estado: "omitido", error: "publicidad_optout" }).eq("id", fila.id);
      continue;
    }

    const transicion = resolverTransicion({ estadoAnterior: null, estadoNuevo: fila.estado_nuevo });
    const { evento, action_source, messaging_channel } = construirEvento({
      contacto,
      eventName: transicion?.evento || fila.event_name,
      eventNameOtro: transicion?.eventoOtro || fila.event_name,
      eventId: fila.event_id,
      valor: fila.valor,
      moneda: fila.moneda,
    }, cfg);

    const resultado = await enviarEventos([evento], { cfg });
    resultado.intentos += fila.intentos || 0;
    await cerrarFila(admin, fila.id, {
      evento, action_source, messaging_channel,
      valor: fila.valor, moneda: fila.moneda, resultado,
    });
    if (resultado.ok) ok++;
  }
  return ok;
}

/** Importe de la venta: el total del pedido más reciente del contacto. */
async function totalDelUltimoPedido(admin, contactoId) {
  const { data } = await admin
    .from("pedidos")
    .select("total")
    .eq("contacto_id", contactoId)
    .order("created_at", { ascending: false })
    .limit(1);
  const total = Number(data?.[0]?.total);
  return Number.isFinite(total) && total > 0 ? total : null;
}
