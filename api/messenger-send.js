const IMG_RE = /https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s]*)?/gi;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const PAGE_TOKEN = process.env.MESSENGER_PAGE_TOKEN || process.env.PAGE_ACCESS_TOKEN;
  if (!PAGE_TOKEN) {
    return res.status(500).json({ error: "MESSENGER_PAGE_TOKEN / PAGE_ACCESS_TOKEN is not configured" });
  }

  const { messenger_id, mensaje } = req.body || {};
  if (!messenger_id || !mensaje) {
    return res.status(400).json({ error: "Missing messenger_id or mensaje" });
  }

  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(PAGE_TOKEN)}`;
  const send = async (message) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: messenger_id }, message }),
    });
    const data = await r.json();
    return { ok: r.ok, data };
  };

  try {
    // Separar imágenes del texto: las imágenes se mandan como attachment real,
    // el texto restante como mensaje aparte (así el cliente ve la foto, no un link).
    const imagenes = mensaje.match(IMG_RE) || [];
    const texto = mensaje.replace(IMG_RE, "").trim();

    if (imagenes.length === 0) {
      const { ok, data } = await send({ text: mensaje });
      if (!ok) return res.status(500).json({ error: data.error?.message || "Facebook Messenger API error", detail: data });
      return res.status(200).json({ success: true, data });
    }

    let last;
    if (texto) last = await send({ text: texto });
    for (const img of imagenes) {
      last = await send({ attachment: { type: "image", payload: { url: img, is_reusable: true } } });
      if (!last.ok) return res.status(500).json({ error: last.data.error?.message || "Facebook Messenger API error (imagen)", detail: last.data });
    }
    return res.status(200).json({ success: true, data: last?.data });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Messenger send failed" });
  }
}
