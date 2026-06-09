export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const PAGE_TOKEN = process.env.MESSENGER_PAGE_TOKEN;
  if (!PAGE_TOKEN) {
    return res.status(500).json({ error: "MESSENGER_PAGE_TOKEN is not configured" });
  }

  const { messenger_id, mensaje } = req.body || {};
  if (!messenger_id || !mensaje) {
    return res.status(400).json({ error: "Missing messenger_id or mensaje" });
  }

  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(PAGE_TOKEN)}`;
  try {
    const fbRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: messenger_id },
        message: { text: mensaje },
      }),
    });

    const fbData = await fbRes.json();
    if (!fbRes.ok) {
      return res.status(500).json({ error: fbData.error?.message || "Facebook Messenger API error", detail: fbData });
    }

    return res.status(200).json({ success: true, data: fbData });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Messenger send failed" });
  }
}
