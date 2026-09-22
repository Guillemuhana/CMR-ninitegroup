// Aviso por email cuando entra un lead de la landing.
//
// El lead ya cae en el CRM y les llega push a los vendedores (ver lead.js).
// Esto es la tercera vía: un mail a la casilla comercial, para que quede en
// la bandeja de quien no vive dentro del CRM y para tener registro buscable.
//
// Reusa el mismo Gmail SMTP que el reporte diario (api/_reporte/mail.js):
//   GMAIL_USER          cuenta que envía
//   GMAIL_APP_PASSWORD  contraseña de aplicación de Google
//   LEADS_EMAIL_TO      destinatario(s) separados por coma.
//                       Default: ninitgroup@gmail.com
//
// REGLA: esto NUNCA puede hacer fallar la carga del lead. Si el mail no sale
// —SMTP caído, credenciales vencidas, lo que sea— el contacto ya quedó
// guardado en Supabase y el vendedor ya recibió el push. Por eso quien llama
// hace `await` sobre un try/catch propio y descarta el error.

import nodemailer from "nodemailer";

const DESTINO_DEFAULT = "ninitgroup@gmail.com";

function destinatarios() {
  return (process.env.LEADS_EMAIL_TO || DESTINO_DEFAULT)
    .split(",").map((s) => s.trim()).filter(Boolean);
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Arma el mail. Separado del envío para poder probarlo sin SMTP.
 * `datos` es lo que llegó del formulario, ya validado por lead.js.
 */
export function armarAviso({ datos, contactoNuevo, from, calificacion }) {
  const nombre = datos.nombre || "Sin nombre";
  const origen = datos.origen || "landing";

  // El asunto es lo único que se ve desde la lista del celular, así que la
  // calificación manda: "🔥 87/100" adelante decide si lo abren ahora o a la
  // noche. Sin calificación, el asunto queda como era.
  const cal = calificacion || null;
  const sello = cal
    ? `${cal.temperatura === "caliente" ? "🔥" : cal.temperatura === "tibio" ? "🌤️" : "❄️"} ${cal.score}/100 · `
    : "🌐 ";
  const asunto = `${sello}Lead nuevo: ${nombre}${datos.paquete ? ` · ${datos.paquete}` : ""}`;

  const filas = [
    ["Nombre", datos.nombre],
    ["Teléfono", datos.telefono],
    ["Email", datos.email],
    ["Código postal", datos.zip],
    ["Paquete", datos.paquete],
    ["Perfil", datos.perfil],
    ["Origen", origen],
    ["Contacto", contactoNuevo ? "NUEVO en el CRM" : "Ya existía en el CRM"],
    ...(cal ? [
      ["Zona (IA)", cal.zona],
      ["Unidad (IA)", cal.unidad],
      ["Para cuándo (IA)", cal.plazo],
      ["Presupuesto (IA)", cal.presupuesto],
    ] : []),
  ].filter(([, v]) => String(v || "").trim());

  const texto = [
    `Entró una consulta desde ${origen}.`,
    "",
    cal ? `CALIFICACIÓN AUTOMÁTICA: ${cal.score}/100 (${cal.temperatura})` : "",
    cal && cal.resumen ? cal.resumen : "",
    cal && cal.objecion ? `Lo frena: ${cal.objecion}` : "",
    cal && cal.siguiente_paso ? `Siguiente paso: ${cal.siguiente_paso}` : "",
    cal && cal.alerta ? `OJO: ${cal.alerta}` : "",
    ...filas.map(([k, v]) => `${k}: ${v}`),
    datos.mensaje ? `\nMensaje:\n${datos.mensaje}` : "",
    datos.escenario ? `\nEscenario de la calculadora:\n${datos.escenario}` : "",
    datos.contexto ? `\nQué miró en la página:\n${datos.contexto}` : "",
    "",
    "Ya está cargado en el CRM: https://ninit-crm.vercel.app/",
  ].filter(Boolean).join("\n");

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;color:#131a24">
  <div style="background:#16365c;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#d9b978;font-weight:700">Lead nuevo</div>
    <div style="font-size:22px;font-weight:800;margin-top:4px">${esc(nombre)}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:2px">Desde ${esc(origen)}</div>
  </div>
  <div style="border:1px solid #e4e9f0;border-top:0;border-radius:0 0 12px 12px;padding:8px 24px 24px">
    ${cal ? `
    <div style="margin-top:16px;border:1px solid ${cal.temperatura === "caliente" ? "#f0c9a8" : cal.temperatura === "tibio" ? "#e8dcc0" : "#dfe6ef"};background:${cal.temperatura === "caliente" ? "#fff6ef" : cal.temperatura === "tibio" ? "#fffaf0" : "#f6f8fb"};border-radius:10px;padding:16px 18px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7789;font-weight:700">Calificación automática</div>
      <div style="font-size:19px;font-weight:800;margin-top:5px">
        ${cal.temperatura === "caliente" ? "🔥" : cal.temperatura === "tibio" ? "🌤️" : "❄️"}
        ${esc(cal.score)}/100 · ${esc(cal.temperatura)}
      </div>
      ${cal.resumen ? `<div style="margin-top:8px;font-size:15px;line-height:1.5">${esc(cal.resumen)}</div>` : ""}
      ${cal.objecion ? `<div style="margin-top:8px;font-size:14px;color:#3b4757">⚠️ Lo frena: ${esc(cal.objecion)}</div>` : ""}
      ${cal.siguiente_paso ? `<div style="margin-top:6px;font-size:14px;color:#3b4757">👉 ${esc(cal.siguiente_paso)}</div>` : ""}
      ${cal.alerta ? `<div style="margin-top:8px;font-size:14px;font-weight:700;color:#a3352b">🚩 ${esc(cal.alerta)}</div>` : ""}
      <div style="margin-top:10px;font-size:11.5px;color:#8a95a5">La escribió la IA leyendo la consulta. Es una ayuda para priorizar, no un dato confirmado.</div>
    </div>` : ""}
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${filas.map(([k, v]) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#6b7789;width:150px">${esc(k)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eef2f7;font-weight:600">${esc(v)}</td>
      </tr>`).join("")}
    </table>
    ${datos.mensaje ? `
    <div style="margin-top:20px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7789;font-weight:700;margin-bottom:8px">Mensaje</div>
      <div style="background:#f6f8fb;border-left:3px solid #b58d42;padding:14px 16px;border-radius:0 8px 8px 0;white-space:pre-wrap;line-height:1.55">${esc(datos.mensaje)}</div>
    </div>` : ""}
    ${datos.escenario ? `
    <div style="margin-top:18px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7789;font-weight:700;margin-bottom:8px">Escenario de la calculadora</div>
      <div style="background:#f6f8fb;padding:14px 16px;border-radius:8px;font-size:13.5px;line-height:1.6;color:#3b4757">${esc(datos.escenario)}</div>
    </div>` : ""}
    ${datos.contexto ? `
    <div style="margin-top:18px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7789;font-weight:700;margin-bottom:8px">Qué miró en la página</div>
      <div style="background:#f6f8fb;padding:14px 16px;border-radius:8px;font-size:13.5px;line-height:1.6;color:#3b4757">${esc(datos.contexto)}</div>
    </div>` : ""}
    <div style="margin-top:24px;text-align:center">
      <a href="https://ninit-crm.vercel.app/" style="display:inline-block;background:#16365c;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px;font-size:15px">Abrir el CRM</a>
    </div>
    <p style="margin:18px 0 0;font-size:12.5px;color:#6b7789;text-align:center">
      Ya quedó cargado como contacto y los vendedores recibieron la notificación.
    </p>
  </div>
</div>`.trim();

  return { from, to: destinatarios(), subject: asunto, text: texto, html };
}

/** Manda el aviso. Lanza si falta configuración o si SMTP rechaza. */
export async function enviarAvisoLead({ datos, contactoNuevo, calificacion }) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) throw new Error("Falta GMAIL_USER / GMAIL_APP_PASSWORD.");

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  const info = await transporter.sendMail(armarAviso({ datos, contactoNuevo, from: user, calificacion }));
  return { messageId: info.messageId };
}
