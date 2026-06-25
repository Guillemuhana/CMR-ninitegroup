import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const PAGE_TOKEN = process.env.MESSENGER_PAGE_TOKEN || process.env.PAGE_ACCESS_TOKEN;

// Messenger NO manda el nombre dentro del mensaje: solo el PSID. Hay que pedirle
// el perfil (nombre + foto) a la Graph API usando el PSID y el Page Token.
// Si falla (token vencido, sin permiso, etc.) devuelve null y se sigue sin cortar.
async function obtenerPerfil(psid) {
  if (!PAGE_TOKEN) return null;
  try {
    const url = `https://graph.facebook.com/v22.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${encodeURIComponent(PAGE_TOKEN)}`;
    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Graph profile fetch error", JSON.stringify(data?.error || data));
      return null;
    }
    const nombre = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
    return { nombre: nombre || null, foto_url: data.profile_pic || null };
  } catch (e) {
    console.error("Graph profile fetch exception", e?.message || e);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge || "ok");
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase service environment is not configured" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = req.body;

  // Log every incoming POST for debugging
  await supabase.from("webhook_logs").insert({ body: body || null, headers: { "x-hub-signature": req.headers["x-hub-signature-256"] || null, "user-agent": req.headers["user-agent"] || null } });

  if (!body || body.object !== "page") {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  try {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.sender?.id || !event.message || event.message.is_echo) continue;

        const senderId = event.sender.id;
        // Texto + URLs de imágenes/archivos que mande el cliente (para verlas inline en el CRM)
        const adjuntos = (event.message.attachments || []).map((a) => a?.payload?.url).filter(Boolean);
        const contenido = [event.message.text || "", ...adjuntos].filter(Boolean).join("\n") || "[media]";

        const { data: existingContact, error: selectError } = await supabase
          .from("contactos")
          .select("id,no_leidos,nombre")
          .or(`messenger_id.eq.${senderId},telefono.eq.${senderId}`)
          .single();

        if (selectError && selectError.code !== "PGRST116") {
          console.error("Supabase select error", JSON.stringify(selectError));
        }

        let contactoId = existingContact?.id;
        const previousNoLeidos = existingContact?.no_leidos || 0;
        if (!contactoId) {
          // Contacto nuevo: traer nombre + foto del perfil de Facebook.
          const perfil = await obtenerPerfil(senderId);
          contactoId = randomUUID();
          const { error: insertError } = await supabase
            .from("contactos")
            .insert({ id: contactoId, telefono: senderId, messenger_id: senderId, canal: "messenger", nombre: perfil?.nombre || null, foto_url: perfil?.foto_url || null, no_leidos: 1, ultimo_in_at: new Date().toISOString() });

          if (insertError) {
            console.error("Supabase insert contacto error", JSON.stringify(insertError));
            continue;
          }
        } else if (!existingContact.nombre) {
          // Contacto viejo que quedó sin nombre (PSID solo): completarlo ahora.
          const perfil = await obtenerPerfil(senderId);
          if (perfil?.nombre || perfil?.foto_url) {
            const patch = {};
            if (perfil.nombre) patch.nombre = perfil.nombre;
            if (perfil.foto_url) patch.foto_url = perfil.foto_url;
            await supabase.from("contactos").update(patch).eq("id", contactoId);
          }
        }

        if (!contactoId) continue;

        const { error: msgError } = await supabase.from("mensajes").insert({
          contacto_id: contactoId,
          direccion: "in",
          origen: "cliente",
          contenido,
        });

        if (msgError) {
          console.error("Supabase insert mensaje error", msgError);
          continue;
        }

        if (existingContact?.id) {
          const { error: updateError } = await supabase
            .from("contactos")
            .update({
              no_leidos: previousNoLeidos + 1,
              ultimo_in_at: new Date().toISOString(),
            })
            .eq("id", contactoId);
          if (updateError) {
            console.error("Supabase update contacto error", updateError);
          }
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Messenger webhook error", error);
    return res.status(500).json({ error: error.message || "Webhook processing failed" });
  }
}
