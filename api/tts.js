// Vercel Serverless Function — Google Cloud TTS proxy
// El frontend llama POST /api/tts { text } y recibe audio/mpeg
import { GoogleAuth } from "google-auth-library";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { text, voice } = req.body ?? {};
  if (!text?.trim()) return res.status(400).json({ error: "Missing text" });

  const credsRaw = process.env.GOOGLE_TTS_CREDENTIALS;
  if (!credsRaw) return res.status(500).json({ error: "GOOGLE_TTS_CREDENTIALS no configurado en Vercel" });

  try {
    const credentials = JSON.parse(credsRaw);

    const auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client   = await auth.getClient();
    const tokenRes = await client.getAccessToken();
    const token    = tokenRes.token;

    const ttsRes = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: text.slice(0, 500) },
        voice: {
          languageCode: "es-AR",
          name: voice === "wavenet" ? "es-AR-Wavenet-C" : "es-AR-Journey-F",
        },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.json().catch(() => ({}));
      return res.status(ttsRes.status).json({ error: err.error?.message || "TTS falló" });
    }

    const { audioContent } = await ttsRes.json();
    const buffer = Buffer.from(audioContent, "base64");

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-cache");
    res.send(buffer);
  } catch (err) {
    console.error("TTS error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
