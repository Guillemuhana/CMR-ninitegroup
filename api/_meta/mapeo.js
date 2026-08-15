// ── Mapeo: estados del CRM → eventos de Meta ────────────────────────────────
//
// ESTE ES EL ÚNICO ARCHIVO QUE HAY QUE TOCAR para cambiar qué evento se manda
// en cada etapa. No hay nombres de evento sueltos en el resto del código.
//
// Los nombres NO son inventados. Salen de dos listas distintas de Meta:
//
//  a) Standard events del Pixel (17 en total): AddPaymentInfo, AddToCart,
//     AddToWishlist, CompleteRegistration, Contact, CustomizeProduct, Donate,
//     FindLocation, InitiateCheckout, Lead, Purchase, Schedule, Search,
//     StartTrial, SubmitApplication, Subscribe, ViewContent.
//     → https://developers.facebook.com/docs/meta-pixel/reference
//
//  b) Eventos soportados por Conversions API for Business Messaging:
//     Purchase, LeadSubmitted, InitiateCheckout, AddToCart, ViewContent,
//     OrderCreated, OrderShipped, OrderDelivered, OrderCanceled, OrderReturned,
//     CartAbandoned, QualifiedLead, RatingProvided, ReviewProvided.
//     → https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging/
//
// Por eso cada etapa define DOS nombres:
//   `evento`       → el que se manda cuando action_source = 'business_messaging'
//                    (o sea: el lead vino de Messenger / WhatsApp / Instagram).
//   `eventoOtro`   → el que se manda cuando NO hay atribución de mensajería y
//                    se cae al action_source de respaldo (ver capi.js).
//
// Ojo con `QualifiedLead`: figura en la lista de business messaging pero NO es
// un standard event del Pixel. Fuera de mensajería viaja como evento
// personalizado, y eso es correcto — no existe un estándar equivalente.

import { createHash } from "node:crypto";

/**
 * Etapas del CRM que le interesan a Meta.
 * La clave es el valor de `contactos.estado` (ver ESTADOS en src/lib.js).
 * Los estados que no aparecen acá (nuevo, pendiente, perdido, …) no generan
 * evento: `nuevo` ya lo conoce Meta (abrió la conversación) y `perdido` no
 * tiene un evento de conversión que aporte a la optimización.
 */
export const EVENTOS_POR_ESTADO = {
  // Contacto convertido en Lead: el vendedor lo tomó y hubo contacto real.
  contactado: {
    evento: "LeadSubmitted",   // business messaging
    eventoOtro: "Lead",        // standard event del Pixel
    estandar: true,
  },

  // Lead calificado / Opportunity: mostró interés concreto.
  interesado: {
    evento: "QualifiedLead",
    eventoOtro: "QualifiedLead", // custom event fuera de mensajería (no hay estándar)
    estandar: false,
  },

  // Cotización enviada. Meta no tiene un "QuoteSent" oficial en ninguna de las
  // dos listas; InitiateCheckout es el evento estándar que representa "arrancó
  // el proceso de compra" y SÍ está soportado en mensajería. Si preferís un
  // evento personalizado propio, cambiá las dos líneas por "QuoteSent" y poné
  // estandar: false — el resto del sistema no se entera.
  cotizacion: {
    evento: "InitiateCheckout",
    eventoOtro: "InitiateCheckout",
    estandar: true,
  },

  // Negociando: no manda evento propio (ya se mandó QualifiedLead y todavía no
  // hay compra). Se deja explícito para que se vea que es una decisión.
  negociando: null,

  // Venta concretada. Los tres estados significan lo mismo en el CRM
  // (ver AdminPanel.jsx: vendidos = pedido | cerrado | vendido), así que los
  // tres mandan Purchase — y el event_id determinístico hace que pasar de uno
  // a otro NO genere un segundo Purchase.
  vendido: { evento: "Purchase", eventoOtro: "Purchase", estandar: true },
  pedido:  { evento: "Purchase", eventoOtro: "Purchase", estandar: true },
  cerrado: { evento: "Purchase", eventoOtro: "Purchase", estandar: true },
};

/** Estados que representan una venta (llevan valor + moneda si se conocen). */
export const ESTADOS_VENTA = ["vendido", "pedido", "cerrado"];

/** Moneda por defecto del negocio (Miami, se factura en dólares). */
export const MONEDA_DEFAULT = "USD";

/**
 * Resuelve qué evento corresponde a una transición de estado.
 * Devuelve null si no hay que mandar nada.
 *
 * Reglas:
 *  - sin estado nuevo → nada
 *  - estado nuevo === estado anterior → nada (una edición que no cambia la
 *    etapa NO puede volver a emitir el evento)
 *  - estado sin mapeo → nada
 */
export function resolverTransicion({ estadoAnterior, estadoNuevo }) {
  const nuevo = normalizarEstado(estadoNuevo);
  if (!nuevo) return null;
  if (normalizarEstado(estadoAnterior) === nuevo) return null;

  const cfg = EVENTOS_POR_ESTADO[nuevo];
  if (!cfg) return null;

  return {
    estado: nuevo,
    evento: cfg.evento,
    eventoOtro: cfg.eventoOtro,
    estandar: cfg.estandar,
    esVenta: ESTADOS_VENTA.includes(nuevo),
  };
}

function normalizarEstado(v) {
  return String(v || "").trim().toLowerCase() || null;
}

/**
 * `event_id` determinístico — la pieza que evita duplicados.
 *
 * Meta deduplica por (event_name, event_id) dentro de una ventana de 48 h, pero
 * acá el id se usa además como clave única del outbox (meta_eventos.event_id),
 * que es lo que hace la deduplicación permanente y a prueba de concurrencia:
 * dos updates simultáneos generan el mismo id y el segundo INSERT choca.
 *
 * Depende sólo de datos estables: contacto + nombre del evento + una referencia
 * opcional (por ejemplo el id de un pedido, si algún día se quiere permitir una
 * segunda compra del mismo cliente). Sin fecha ni azar: el mismo hecho siempre
 * produce el mismo id.
 */
export function idEvento({ contactoId, evento, ref = "" }) {
  const base = `${contactoId || ""}|${evento || ""}|${ref || ""}`;
  return createHash("sha256").update(base).digest("hex");
}
