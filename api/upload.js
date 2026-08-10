// Sube media al bucket "chat-media" de Supabase Storage usando la
// service_role key (bypassa RLS) y devuelve la URL pública.
//
// Dos modos:
//  • Imágenes  → el front manda la imagen ya comprimida en base64 y esta
//    función la sube. Van comprimidas a ~1600px, así que entran de sobra en
//    el límite de body de Vercel (~4.5 MB).
//  • Videos    → NO pasan por acá: un video de 15 MB revienta ese límite. El
//    front pide { modo: "firmar" } y recibe una URL firmada para subir el
//    archivo directo del navegador a Storage, sin intermediario.
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const BUCKET = "chat-media";

const EXT_IMG = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const EXT_VID = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

// WhatsApp/Messenger no aceptan videos más grandes que esto cuando se envían
// por URL: si se pasa, el cliente no recibe nada y el vendedor no se entera.
const MAX_VIDEO = 16 * 1024 * 1024;

const nuevaRuta = (ext) => `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
const urlPublica = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "Storage no configurado" });

  const { modo, dataBase64, contentType, size } = req.body || {};

  // ── Modo firma: devuelve una URL para que el navegador suba el video solo ──
  if (modo === "firmar") {
    const ext = EXT_VID[contentType] || EXT_IMG[contentType];
    if (!ext) return res.status(400).json({ error: "Tipo de archivo no soportado" });
    if (Number(size) > MAX_VIDEO) return res.status(413).json({ error: "El video supera los 16 MB" });
    try {
      const path = nuevaRuta(ext);
      const sign = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!sign.ok) {
        const detail = await sign.text();
        return res.status(500).json({ error: "No se pudo firmar la subida", detail });
      }
      // Respuesta: { url: "/object/upload/sign/chat-media/2026-08-10/uuid.mp4?token=..." }
      // El front sube con supabase.storage.uploadToSignedUrl(path, token, file),
      // que arma el body como espera Storage; por eso devolvemos path y token.
      const { url } = await sign.json();
      const token = new URL(url, SUPABASE_URL).searchParams.get("token");
      if (!token) return res.status(500).json({ error: "La firma llegó sin token" });
      return res.status(200).json({ bucket: BUCKET, path, token, url: urlPublica(path) });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Error al firmar la subida" });
    }
  }

  // ── Modo directo (imágenes en base64) ──
  if (!dataBase64 || !contentType) return res.status(400).json({ error: "Falta dataBase64 o contentType" });
  const ext = EXT_IMG[contentType];
  if (!ext) return res.status(400).json({ error: "Tipo de imagen no soportado" });

  try {
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > 10 * 1024 * 1024) return res.status(413).json({ error: "Imagen demasiado grande" });

    const path = nuevaRuta(ext);
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": contentType, "x-upsert": "true" },
      body: buffer,
    });
    if (!up.ok) {
      const detail = await up.text();
      return res.status(500).json({ error: "Falló la subida", detail });
    }
    return res.status(200).json({ url: urlPublica(path) });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Error al subir" });
  }
}
