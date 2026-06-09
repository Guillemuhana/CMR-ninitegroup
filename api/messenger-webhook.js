import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

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
  if (!body || body.object !== "page") {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  try {
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.sender?.id || !event.message || event.message.is_echo) continue;

        const senderId = event.sender.id;
        const contenido = event.message.text || "[media]";

        const { data: existingContact, error: selectError } = await supabase
          .from("contactos")
          .select("id,no_leidos")
          .or(`messenger_id.eq.${senderId},telefono.eq.${senderId}`)
          .single();

        if (selectError && selectError.message !== "No rows found") {
          console.error("Supabase select error", selectError);
        }

        let contactoId = existingContact?.id;
        const previousNoLeidos = existingContact?.no_leidos || 0;
        if (!contactoId) {
          const { data: insertedContact, error: insertError } = await supabase
            .from("contactos")
            .insert({ telefono: senderId, messenger_id: senderId, canal: "messenger", no_leidos: 1, ultimo_in_at: new Date().toISOString() })
            .select("id")
            .single();

          if (insertError) {
            console.error("Supabase insert contacto error", insertError);
            continue;
          }
          contactoId = insertedContact?.id;
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
