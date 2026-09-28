import { createClient } from "@supabase/supabase-js";
import { FICHA_NTG, FICHA_BUSINESS } from "../_ntg.js";

// El workflow de NTG debe consumir este contexto; el de Munich no es compatible.
export function prepararBusqueda(body) {
  const busqueda = typeof body?.busqueda === "string" ? body.busqueda.trim() : "";
  const zona = typeof body?.zona === "string" ? body.zona.trim() : "";
  if (!busqueda || !zona || busqueda.length > 160 || zona.length > 160) return null;
  return {
    busqueda, zona, pais: "US", empresa: "Nini T Group",
    query_completo: `${busqueda} in ${zona}, United States`,
    contexto_comercial: `${FICHA_NTG}\n\n${FICHA_BUSINESS}`,
    instrucciones: "Buscar únicamente negocios reales ubicados en Estados Unidos. Verificar el país de cada resultado. Priorizar compradores potenciales de restroom trailers: empresas de alquiler de eventos, baños portátiles, servicios sanitarios, espacios de bodas, campings y constructoras. Puntuar afinidad comercial, no intención de compra confirmada. No inventar negocios, teléfonos, emails ni necesidades. Devolver solo datos verificados y explicar en español la afinidad y el enfoque sugerido. No enviar mensajes. Devolver un objeto con resultados: array de negocios con place_id único, nombre, direccion, pais (US), telefono, email, sitio_web, latitud, longitud, prioridad (ALTA/MEDIA/BAJA), lead_score (0-100), productos_sugeridos y enfoque_venta.",
  };
}

export function validarResultados(data) {
  const lista = Array.isArray(data) ? data : data?.resultados ?? data?.leads;
  if (!Array.isArray(lista) || lista.length > 100) throw new Error("Respuesta inválida");
  const ids = new Set();
  return lista.filter((r) => {
    if (!r || typeof r.place_id !== "string" || !r.place_id.trim() ||
        typeof r.nombre !== "string" || !r.nombre.trim() ||
        r.pais !== "US") throw new Error("Falta identificación o país US");
    if (ids.has(r.place_id)) return false;
    ids.add(r.place_id);
    return true;
  }).map((r) => {
    const texto = (v) => typeof v === "string" ? v.slice(0, 4000) : "";
    const score = Math.round(Math.max(0, Math.min(100, Number(r.lead_score) || 0)));
    const coord = (v, max) => v !== null && v !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max ? Number(v) : null;
    let web = texto(r.sitio_web || r.website);
    if (web && !/^https?:\/\//i.test(web)) web = `https://${web}`;
    try { if (web) web = new URL(web).href; } catch { web = ""; }
    return {
      place_id: r.place_id, nombre: texto(r.nombre), pais: "US",
      direccion: texto(r.direccion), ciudad: texto(r.ciudad),
      telefono: texto(r.telefono), email: Array.isArray(r.email) ? r.email.filter((e) => typeof e === "string").slice(0, 5) : texto(r.email),
      sitio_web: web, tipo_negocio: texto(r.tipo_negocio),
      latitud: coord(r.latitud ?? r.lat, 90), longitud: coord(r.longitud ?? r.lng, 180),
      prioridad: ["ALTA", "MEDIA", "BAJA"].includes(r.prioridad) ? r.prioridad : score >= 70 ? "ALTA" : score >= 40 ? "MEDIA" : "BAJA",
      lead_score: score, productos_sugeridos: texto(r.productos_sugeridos), enfoque_venta: texto(r.enfoque_venta),
    };
  });
}

export function crearHandler({ env = process.env, cliente = createClient, solicitar = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ error: "Iniciá sesión para buscar clientes." });
    const consulta = prepararBusqueda(req.body);
    if (!consulta) return res.status(400).json({ error: "Ingresá un rubro y una ciudad, estado o ZIP de USA (máximo 160 caracteres cada uno)." });
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: "Falta configurar la autenticación del buscador." });
    try {
      const db = cliente(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ error: "Tu sesión venció. Volvé a iniciar sesión." });
      const email = (data.user.email || "").toLowerCase();
      let ceo = email === "ninitgroup@gmail.com";
      if (!ceo) {
        const { data: perfil, error: perfilError } = await db.from("vendedores").select("role").eq("email", email).single();
        ceo = !perfilError && perfil?.role === "ceo";
      }
      if (!ceo) return res.status(403).json({ error: "Solo el CEO puede buscar clientes potenciales." });
      const webhook = env.PROSPECTOS_WEBHOOK?.trim();
      if (!webhook || !env.PROSPECTOS_WEBHOOK_SECRET) return res.status(503).json({ error: "El buscador de USA todavía no está conectado. Falta configurar el workflow de Nini T Group." });
      // Nunca usar por accidente el workflow de alimentos de Munich.
      if (!webhook.startsWith("https://") || /munich/i.test(webhook)) return res.status(503).json({ error: "Configurá un workflow HTTPS propio de Nini T Group." });
      const respuesta = await solicitar(webhook, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(22000),
        headers: { "Content-Type": "application/json", "X-Prospectos-Secret": env.PROSPECTOS_WEBHOOK_SECRET },
        body: JSON.stringify(consulta),
      });
      if (!respuesta.ok) throw new Error("Workflow no disponible");
      return res.status(200).json({ resultados: validarResultados(await respuesta.json()) });
    } catch (error) {
      const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      return res.status(timeout ? 504 : 502).json({ error: timeout ? "La búsqueda demoró demasiado. Intentá con una zona más específica." : "No se pudo completar la búsqueda de USA. Revisá la conexión y el formato de respuesta del workflow." });
    }
  };
}

export default crearHandler();
