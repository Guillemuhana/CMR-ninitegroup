// Despachador de avisos salientes: notificaciones push + eventos a Meta.
//
// Antes esto eran dos funciones serverless (api/push-subscribe.js y
// api/push-send.js). El plan Hobby de Vercel admite 12 como máximo y ya
// estábamos en el tope, así que se unieron en esta: la lógica de cada una
// quedó intacta en api/_push/ y acá solo se elige cuál corre.
//
// Por la misma razón (12/12 funciones) los eventos de la Conversions API de
// Meta cuelgan de acá en vez de tener su propia función: la lógica vive
// completa en api/_meta/ y este archivo sólo enruta.
//
// Las URL siguen siendo limpias — vercel.json redirige
//   /api/push-subscribe -> /api/push?accion=subscribe
//   /api/push-send      -> /api/push?accion=send
//   /api/meta-evento    -> /api/push?accion=meta
// así que ni la app, ni el service worker, ni el trigger de Supabase que
// dispara los avisos tuvieron que cambiar.

import suscribir from "./_push/suscribir.js";
import enviar from "./_push/enviar.js";
import metaEvento from "./_meta/enviar.js";

export default async function handler(req, res) {
  const accion = String(req.query?.accion || "");

  if (accion === "subscribe") return suscribir(req, res);
  if (accion === "send") return enviar(req, res);
  if (accion === "meta") return metaEvento(req, res);

  return res.status(404).json({ error: "Acción de push desconocida." });
}
