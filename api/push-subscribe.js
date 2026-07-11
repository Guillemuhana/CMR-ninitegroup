import { createClient } from "@supabase/supabase-js";

// Guarda la suscripción PUSH de un vendedor para poder avisarle cuando entra
// un mensaje del cliente (aunque tenga la app cerrada).
//
// Requiere en Vercel (Environment Variables):
//   SUPABASE_URL                 (mismo proyecto que el front)
//   SUPABASE_SERVICE_ROLE_KEY    (Settings → API → service_role, secreto)
//
// Tabla necesaria: push_subscriptions (ver supabase_push_migration.sql)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor." });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Autorización: quien llama debe tener una sesión válida del CRM.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "No autenticado." });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sesión inválida." });

  const { subscription, vendedor, rol, user_id } = req.body || {};
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: "Suscripción inválida." });
  }

  // Upsert por endpoint (único). Si el mismo dispositivo se re-suscribe,
  // actualiza los datos en vez de duplicar.
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        endpoint,
        p256dh,
        auth,
        vendedor: vendedor || null,
        rol: rol || "vendedor",
        user_id: user_id || userData.user.id,
        email: (userData.user.email || "").toLowerCase(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) return res.status(400).json({ error: error.message || "No se pudo guardar la suscripción." });
  return res.status(200).json({ success: true });
}
