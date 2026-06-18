// Sube una imagen al bucket "chat-media" de Supabase Storage usando la
// service_role key (bypassa RLS) y devuelve la URL pública.
// El front manda la imagen ya comprimida en base64.
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const BUCKET = "chat-media";

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "Storage no configurado" });

  const { dataBase64, contentType } = req.body || {};
  if (!dataBase64 || !contentType) return res.status(400).json({ error: "Falta dataBase64 o contentType" });
  const ext = EXT[contentType];
  if (!ext) return res.status(400).json({ error: "Tipo de imagen no soportado" });

  try {
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: "Imagen demasiado grande" });

    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": contentType, "x-upsert": "true" },
      body: buffer,
    });
    if (!up.ok) {
      const detail = await up.text();
      return res.status(500).json({ error: "Falló la subida", detail });
    }
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error al subir" });
  }
}
