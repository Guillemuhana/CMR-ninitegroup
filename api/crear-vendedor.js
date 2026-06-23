import { createClient } from "@supabase/supabase-js";

// Crea un vendedor completo desde el Panel Admin:
//  1. Verifica que quien llama sea CEO (vía su access token).
//  2. Crea el usuario en Supabase Auth con su contraseña (admin API, service role).
//  3. Inserta/actualiza la fila en la tabla `vendedores`.
//
// Requiere en Vercel (Environment Variables):
//   SUPABASE_URL                 (mismo proyecto que el front)
//   SUPABASE_SERVICE_ROLE_KEY    (Settings → API → service_role, secreto)

const CEO_EMAIL = "ninitgroup@gmail.com";

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

  // ── 1. Autorización: quien llama debe ser CEO ──────────────
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ error: "No autenticado." });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sesión inválida." });

  const callerEmail = (userData.user.email || "").toLowerCase();
  let esCeo = callerEmail === CEO_EMAIL;
  if (!esCeo) {
    const { data: perfil } = await admin
      .from("vendedores")
      .select("role")
      .eq("email", callerEmail)
      .single();
    esCeo = perfil?.role === "ceo";
  }
  if (!esCeo) return res.status(403).json({ error: "Solo el CEO puede crear vendedores." });

  // ── 2. Validar datos ───────────────────────────────────────
  const modo = req.body?.modo === "password" ? "password" : "crear";
  const nombre = (req.body?.nombre || "").trim();
  const email = (req.body?.email || "").trim().toLowerCase();
  const password = (req.body?.password || "").trim();

  if (!email) return res.status(400).json({ error: "El email es obligatorio." });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });

  // ── 2b. Modo "password": resetear/asignar contraseña de un vendedor existente ──
  if (modo === "password") {
    // Buscar el usuario de Auth por email (puede no existir si nunca se creó).
    let found = null;
    for (let page = 1; page <= 20 && !found; page++) {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (listErr) return res.status(400).json({ error: listErr.message || "No se pudo buscar el usuario." });
      found = (list?.users || []).find(u => (u.email || "").toLowerCase() === email);
      if (!list?.users || list.users.length < 200) break;
    }

    if (found) {
      const { error: updErr } = await admin.auth.admin.updateUserById(found.id, { password });
      if (updErr) return res.status(400).json({ error: updErr.message || "No se pudo cambiar la contraseña." });
    } else {
      // No tenía usuario de acceso: lo creamos ahora para que pueda entrar.
      const { error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre },
      });
      if (cErr) return res.status(400).json({ error: cErr.message || "No se pudo crear el acceso." });
    }
    return res.status(200).json({ success: true });
  }

  if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });

  // ── 3. Crear usuario en Auth ───────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (createErr) {
    const msg = /already.*registered|exists/i.test(createErr.message || "")
      ? "Ya existe un usuario con ese email."
      : createErr.message || "No se pudo crear el usuario.";
    return res.status(400).json({ error: msg });
  }

  // ── 4. Insertar/actualizar fila en vendedores ──────────────
  const { error: vendErr } = await admin
    .from("vendedores")
    .upsert({ nombre, email, role: "vendedor", activo: true }, { onConflict: "nombre" });

  if (vendErr) {
    // Revertir el usuario de Auth para no dejar basura si falla la tabla.
    if (created?.user?.id) await admin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: vendErr.message || "No se pudo guardar el vendedor." });
  }

  return res.status(200).json({ success: true });
}
