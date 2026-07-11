import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Envía notificaciones PUSH a los vendedores cuando entra un mensaje del
// cliente. Lo dispara Supabase (trigger pg_net → este endpoint) en cada INSERT
// de `mensajes` con direccion='in'. Ver supabase_push_migration.sql.
//
// Requiere en Vercel (Environment Variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//   PUSH_WEBHOOK_SECRET   (secreto compartido con el trigger de Supabase)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Seguridad: el trigger de Supabase manda este secreto en un header.
  const secret = req.headers["x-push-secret"] || "";
  if (!process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "No autorizado." });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:ninitgroup@gmail.com";
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno (SUPABASE_* / VAPID_*)." });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // El body puede venir como { record: {...} } o como el record directo.
  const rec = req.body?.record || req.body || {};
  if (rec.direccion !== "in") return res.status(200).json({ skipped: "no es entrante" });

  // Datos del contacto para armar el aviso y decidir a quién avisar.
  let contacto = null;
  if (rec.contacto_id) {
    const { data } = await admin
      .from("contactos")
      .select("id, nombre, telefono, vendedor")
      .eq("id", rec.contacto_id)
      .single();
    contacto = data || null;
  }

  const nombre = contacto?.nombre || contacto?.telefono || "Cliente nuevo";
  const cuerpo = (rec.contenido || "").toString().slice(0, 140) || "Nuevo mensaje";

  // Destinatarios: el CEO recibe todo; cada vendedor solo lo suyo.
  let query = admin.from("push_subscriptions").select("*");
  if (contacto?.vendedor) {
    query = query.or(`rol.eq.ceo,vendedor.eq.${contacto.vendedor}`);
  }
  // Si no sabemos de quién es el contacto, avisamos a todos (mejor de más que de menos).
  const { data: subs, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!subs?.length) return res.status(200).json({ sent: 0 });

  // Número para el badge del ícono = chats con mensajes sin leer.
  // El CEO ve el total; cada vendedor solo los suyos.
  const contarNoLeidos = async (vendedorFiltro) => {
    let q = admin.from("contactos").select("id", { count: "exact", head: true }).gt("no_leidos", 0);
    if (vendedorFiltro) q = q.eq("vendedor", vendedorFiltro);
    const { count } = await q;
    return count || 0;
  };
  const badgeCeo = await contarNoLeidos(null);
  const badgeVend = contacto?.vendedor ? await contarNoLeidos(contacto.vendedor) : badgeCeo;

  const base = {
    title: `💬 ${nombre}`,
    body: cuerpo,
    tag: `msg-${rec.contacto_id || "x"}`,
    contacto_id: rec.contacto_id || null,
    url: rec.contacto_id ? `/?chat=${rec.contacto_id}` : "/",
  };

  let sent = 0;
  const muertas = [];
  await Promise.all(
    subs.map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      const payload = JSON.stringify({ ...base, badge_count: s.rol === "ceo" ? badgeCeo : badgeVend });
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (e) {
        // 404/410 => la suscripción ya no existe (app desinstalada, permiso revocado)
        if (e.statusCode === 404 || e.statusCode === 410) muertas.push(s.endpoint);
      }
    })
  );

  if (muertas.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", muertas);
  }

  return res.status(200).json({ sent, limpiadas: muertas.length });
}
