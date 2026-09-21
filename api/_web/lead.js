import { createClient } from "@supabase/supabase-js";
import { normalizarTelefono } from "../_meta/capi.js";
import { enviarAvisoLead } from "./aviso-mail.js";

// Entrada de leads de la landing pública /business/ al CRM.
//
// Cuelga de api/push.js (accion=lead) y no de su propio archivo: el plan Hobby
// de Vercel topa en 12 funciones y api/ ya está en 12. Las carpetas con "_"
// no cuentan, por eso la lógica vive acá. La URL igual queda limpia:
//   /api/lead -> /api/push?accion=lead   (rewrite en vercel.json)
//
// Requiere en Vercel:
//   SUPABASE_URL                 (mismo proyecto que el front)
//   SUPABASE_SERVICE_ROLE_KEY    (secreto, jamás en el cliente)
//
// Qué hace, en orden:
//   1. Upsert del contacto por teléfono (nunca pisa el nombre, vendedor ni
//      estado de un cliente que ya existe: un lead web no puede degradar una
//      ficha que un vendedor viene trabajando).
//   2. Inserta el pedido como mensaje ENTRANTE. De ahí en más funciona todo
//      lo que ya existe: trg_touch_contacto sube no_leidos y ultimo_msg, y
//      trg_notificar_push_mensaje manda el push a los vendedores. El lead
//      aparece en la lista por Realtime, como cualquier consulta.
//   3. Restaura ultimo_in_at — ver el comentario largo más abajo, importa.

/** Endpoint público: no hay sesión, así que la validación la hacemos acá. */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body || {};

  // Trampa anti-bot: el campo "company" está escondido con CSS, un humano no
  // lo ve. Si viene lleno, contestamos 200 como si todo hubiera salido bien
  // (avisarle al bot que lo detectamos sólo le enseña a esquivarlo).
  if (String(b.company || "").trim()) return res.status(200).json({ success: true });

  const nombre = String(b.nombre || "").trim().slice(0, 120);
  const telefono = normalizarTelefono(b.telefono);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 160);

  if (!nombre) return res.status(400).json({ error: "Falta el nombre." });
  if (!telefono) return res.status(400).json({ error: "El teléfono no parece válido." });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "El email no parece válido." });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el servidor." });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── El texto que va a leer el vendedor en el chat ──────────────────────
  // Se arma como un mensaje, no como un volcado de JSON: el vendedor lo abre
  // desde el celular y tiene que entenderlo de un vistazo.
  const lineas = ["🌐 New inquiry from the business landing page", ""];
  const dato = (etiqueta, valor) => {
    const v = String(valor || "").trim();
    if (v) lineas.push(`${etiqueta}: ${v.slice(0, 400)}`);
  };
  dato("Name", nombre);
  dato("Phone", b.telefono);
  dato("Email", email);
  dato("ZIP", b.zip);
  dato("Package", b.paquete);
  dato("Profile", b.perfil);
  if (String(b.mensaje || "").trim()) {
    lineas.push("", `"${String(b.mensaje).trim().slice(0, 1200)}"`);
  }
  if (String(b.escenario || "").trim()) {
    lineas.push("", "📊 Calculator scenario they asked us to review:", String(b.escenario).slice(0, 900));
  }
  if (String(b.referrer || "").trim()) {
    lineas.push("", `Came from: ${String(b.referrer).slice(0, 200)}`);
  }
  const contenido = lineas.join("\n");

  try {
    // ── 1. Contacto ───────────────────────────────────────────────────────
    const { data: existente, error: errBusca } = await admin
      .from("contactos")
      .select("id, nombre, email, notas, ultimo_in_at")
      .eq("telefono", telefono)
      .maybeSingle();
    if (errBusca) throw errBusca;

    const notaLead = [
      `[${new Date().toISOString().slice(0, 10)}] Landing /business`,
      b.paquete ? `· package: ${b.paquete}` : "",
      b.perfil ? `· profile: ${b.perfil}` : "",
      b.zip ? `· ZIP: ${b.zip}` : "",
    ].filter(Boolean).join(" ");

    let contactoId = existente?.id;
    // ultimo_in_at previo: si el contacto es nuevo queda null, y eso es
    // exactamente lo que queremos restaurar después.
    const ultimoInPrevio = existente?.ultimo_in_at ?? null;

    if (contactoId) {
      // Ya existe: sólo completamos huecos. Nombre, vendedor y estado no se
      // tocan — puede ser un cliente que un vendedor ya está atendiendo.
      const parche = { updated_at: new Date().toISOString() };
      if (!existente.nombre && nombre) parche.nombre = nombre;
      if (!existente.email && email) parche.email = email;
      parche.notas = existente.notas ? `${existente.notas}\n${notaLead}` : notaLead;

      const { error } = await admin.from("contactos").update(parche).eq("id", contactoId);
      if (error) throw error;
    } else {
      const { data, error } = await admin
        .from("contactos")
        .insert({
          telefono,
          nombre,
          email: email || null,
          estado: "nuevo",
          notas: notaLead,
        })
        .select("id")
        .single();
      if (error) throw error;
      contactoId = data.id;
    }

    // ── 2. Mensaje entrante (dispara push + no_leidos + ultimo_msg) ───────
    const { error: errMsg } = await admin.from("mensajes").insert({
      contacto_id: contactoId,
      direccion: "in",
      origen: "web",
      contenido,
    });
    if (errMsg) throw errMsg;

    // ── 3. Devolver ultimo_in_at a como estaba ────────────────────────────
    //
    // Esto NO es un detalle: ultimo_in_at es lo único que mira
    // dentroDeVentana() en src/promos.js para decidir si se le puede mandar
    // texto libre por WhatsApp. Esa ventana de 24 h la abre Meta cuando el
    // cliente escribe POR WHATSAPP — llenar un formulario web no la abre.
    //
    // Si dejáramos el ultimo_in_at que puso trg_touch_contacto, el CRM le
    // diría al vendedor "dale, escribile" y Meta rechazaría el mensaje. Así
    // que aprovechamos el trigger para el push y después deshacemos esa
    // columna. no_leidos y ultimo_msg sí quedan: esos son correctos.
    const { error: errFix } = await admin
      .from("contactos")
      .update({ ultimo_in_at: ultimoInPrevio })
      .eq("id", contactoId);
    if (errFix) throw errFix;

    // ── 4. Aviso por mail a la casilla comercial ──────────────────────────
    //
    // Tercera vía, además del CRM y del push: que quede en la bandeja de
    // quien no vive adentro del CRM.
    //
    // Va DESPUÉS de todo lo importante y con su propio try/catch: el lead ya
    // está guardado y el push ya salió. Si el mail falla —SMTP caído,
    // contraseña de aplicación vencida— se registra y se sigue. Perder el
    // aviso es molesto; perder el lead por un problema de mail, no se puede.
    try {
      await enviarAvisoLead({
        datos: { nombre, telefono, email, zip: b.zip, paquete: b.paquete,
                 perfil: b.perfil, mensaje: b.mensaje, escenario: b.escenario,
                 origen: b.origen },
        contactoNuevo: !existente,
      });
    } catch (e) {
      console.error("[lead] no se pudo mandar el aviso por mail:", e?.message || e);
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("[lead] ", e);
    return res.status(500).json({ error: e?.message || "No se pudo registrar la consulta." });
  }
}
