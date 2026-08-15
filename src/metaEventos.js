// ── Eventos del ciclo comercial → Meta (Conversions API) ────────────────────
//
// Cuando un cliente avanza en el embudo, Meta se tiene que enterar: así puede
// optimizar las campañas por gente que compra y no sólo por gente que abre una
// conversación. Toda la lógica pesada (mapeo, hashing, atribución, reintentos)
// vive en el server: api/_meta/. Acá sólo se avisa.
//
// Reglas de este helper:
//  - Es best-effort: NUNCA lanza ni bloquea. Si Meta o la red fallan, el estado
//    del contacto ya quedó guardado igual.
//  - Si el estado no cambió de verdad, no se manda nada (el server lo vuelve a
//    verificar, pero así ni siquiera se hace el request).
//  - Los duplicados los corta el server con un event_id determinístico.

import { supabase } from "./lib";

export const META_EVENTO_ENDPOINT = "/api/meta-evento";

/**
 * Avisa a Meta que un contacto cambió de etapa.
 *
 * @param {object} contactoAntes  el contacto TAL COMO ESTABA antes del update
 * @param {object} campos         los campos que se actualizaron
 * @param {object} [extra]        { valor, moneda, ref } — opcionales; si es una
 *                                venta y no se pasa valor, el server lo busca
 *                                en el último pedido del cliente.
 */
export function notificarCambioEstado(contactoAntes, campos, extra = {}) {
  const estadoNuevo = campos?.estado;
  const estadoAnterior = contactoAntes?.estado ?? null;

  // Sin cambio real de etapa no hay evento.
  if (!estadoNuevo || estadoNuevo === estadoAnterior) return Promise.resolve(null);
  if (!contactoAntes?.id) return Promise.resolve(null);

  return enviar({
    contacto_id: contactoAntes.id,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    valor: extra.valor ?? null,
    moneda: extra.moneda ?? null,
    ref: extra.ref ?? null,
  });
}

async function enviar(payload) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const r = await fetch(META_EVENTO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    // No es un error de cara al usuario: se deja rastro en consola y listo.
    if (!r.ok || data?.error) console.warn("meta evento:", data?.error || r.status);
    return data;
  } catch (e) {
    console.warn("meta evento:", e?.message || e);
    return null;
  }
}
