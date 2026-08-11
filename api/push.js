// Despachador de las notificaciones push.
//
// Antes esto eran dos funciones serverless (api/push-subscribe.js y
// api/push-send.js). El plan Hobby de Vercel admite 12 como máximo y ya
// estábamos en el tope, así que se unieron en esta: la lógica de cada una
// quedó intacta en api/_push/ y acá solo se elige cuál corre.
//
// Las URL viejas siguen funcionando igual — vercel.json redirige
//   /api/push-subscribe -> /api/push?accion=subscribe
//   /api/push-send      -> /api/push?accion=send
// así que ni la app, ni el service worker, ni el trigger de Supabase que
// dispara los avisos tuvieron que cambiar.

import suscribir from "./_push/suscribir.js";
import enviar from "./_push/enviar.js";

export default async function handler(req, res) {
  const accion = String(req.query?.accion || "");

  if (accion === "subscribe") return suscribir(req, res);
  if (accion === "send") return enviar(req, res);

  return res.status(404).json({ error: "Acción de push desconocida." });
}
