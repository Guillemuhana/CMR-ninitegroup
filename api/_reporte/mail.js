// Envío del reporte por email (Gmail SMTP vía nodemailer).
//
// Variables de entorno necesarias en Vercel:
//   GMAIL_USER          cuenta que envía, ej. ninitgroup@gmail.com
//   GMAIL_APP_PASSWORD  "contraseña de aplicación" de Google (16 caracteres),
//                       NO la contraseña normal. Se genera en
//                       https://myaccount.google.com/apppasswords (requiere 2FA).
//   REPORTE_EMAIL_TO    destinatario(s), separados por coma. Default: ninitgroup@gmail.com
//   REPORTE_EMAIL_CC    opcional

import nodemailer from "nodemailer";
import { fechaLarga } from "./dia.js";

const DESTINO_DEFAULT = "ninitgroup@gmail.com";

const usd = (n) => "US$ " + Math.round(n || 0).toLocaleString("en-US");

function fmtMin(m) {
  if (m == null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
}

/** Cuerpo HTML del mail: el PDF es el detalle, esto es el vistazo del celular. */
function html(metricas, resumenIA) {
  const k = metricas.kpis;
  const fecha = fechaLarga(metricas.fecha, metricas.tz);
  const tile = (label, valor, sub) => `
    <td style="padding:0 6px 12px 0;width:25%;vertical-align:top">
      <div style="border:1px solid #E6E9EF;border-radius:10px;padding:12px 14px;background:#fff">
        <div style="font:600 10px/1.2 Arial,sans-serif;color:#6B7383;letter-spacing:.5px;text-transform:uppercase">${label}</div>
        <div style="font:700 21px/1.3 Arial,sans-serif;color:#171B26;margin-top:4px">${valor}</div>
        <div style="font:400 11px/1.3 Arial,sans-serif;color:#98A0B0">${sub || ""}</div>
      </div>
    </td>`;

  const filas = metricas.porVendedor.slice(0, 8).map((v, i) => `
    <tr>
      <td style="padding:7px 8px;border-bottom:1px solid #EEF0F4;font:700 12px Arial,sans-serif;color:${i === 0 ? "#4F62D8" : "#171B26"}">${v.vendedor}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEF0F4;font:400 12px Arial,sans-serif;color:#6B7383;text-align:right">${v.mensajes}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEF0F4;font:400 12px Arial,sans-serif;color:#6B7383;text-align:right">${v.chats}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEF0F4;font:400 12px Arial,sans-serif;color:#6B7383;text-align:right">${fmtMin(v.respuestaMedianaMin)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #EEF0F4;font:700 12px Arial,sans-serif;color:${v.efectividad >= 70 ? "#15803D" : v.efectividad >= 45 ? "#D97706" : "#DC2626"};text-align:right">${v.efectividad}</td>
    </tr>`).join("");

  const bullets = (items, color) => items.length
    ? `<ul style="margin:6px 0 14px 0;padding-left:18px">${items.map((i) =>
        `<li style="font:400 13px/1.5 Arial,sans-serif;color:#171B26;margin-bottom:3px"><span style="color:${color}">&#9679;</span> ${i}</li>`).join("")}</ul>`
    : "";

  return `<div style="background:#F7F8FA;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E6E9EF">
    <div style="background:#171C2F;padding:22px 24px">
      <div style="font:700 19px Arial,sans-serif;color:#fff;letter-spacing:.5px">NINIT GROUP</div>
      <div style="font:400 12px Arial,sans-serif;color:#9AA3BC;margin-top:2px">Reporte diario de operaciones · ${fecha}</div>
    </div>
    <div style="height:3px;background:#4F62D8"></div>
    <div style="padding:22px 24px">
      <div style="font:400 14px/1.6 Arial,sans-serif;color:#171B26;background:#F1EDFD;border-radius:10px;padding:14px 16px">
        ${resumenIA.resumen}
      </div>

      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-top:18px">
        <tr>
          ${tile("Mensajes", k.mensajes, `${k.entrantes} de clientes`)}
          ${tile("Chats", k.chatsActivos, `${k.chatsSinResponder} sin responder`)}
          ${tile("Nuevos", k.clientesNuevos, `${k.leadsSinAsignar} sin asignar`)}
          ${tile("Facturado", usd(k.facturacion), `${k.pedidos} pedidos`)}
        </tr>
      </table>

      ${metricas.porVendedor.length ? `
      <div style="font:700 12px Arial,sans-serif;color:#171B26;text-transform:uppercase;letter-spacing:.6px;margin:14px 0 6px">Vendedores</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
        <tr>
          <th style="text-align:left;font:700 10px Arial,sans-serif;color:#98A0B0;padding:0 8px 6px;text-transform:uppercase">Vendedor</th>
          <th style="text-align:right;font:700 10px Arial,sans-serif;color:#98A0B0;padding:0 8px 6px;text-transform:uppercase">Msj</th>
          <th style="text-align:right;font:700 10px Arial,sans-serif;color:#98A0B0;padding:0 8px 6px;text-transform:uppercase">Chats</th>
          <th style="text-align:right;font:700 10px Arial,sans-serif;color:#98A0B0;padding:0 8px 6px;text-transform:uppercase">Resp.</th>
          <th style="text-align:right;font:700 10px Arial,sans-serif;color:#98A0B0;padding:0 8px 6px;text-transform:uppercase">Efect.</th>
        </tr>
        ${filas}
      </table>` : ""}

      ${resumenIA.riesgos.length ? `<div style="font:700 12px Arial,sans-serif;color:#DC2626;text-transform:uppercase;letter-spacing:.6px;margin:18px 0 0">Puntos de atención</div>${bullets(resumenIA.riesgos, "#DC2626")}` : ""}
      ${resumenIA.recomendaciones.length ? `<div style="font:700 12px Arial,sans-serif;color:#4F62D8;text-transform:uppercase;letter-spacing:.6px;margin:6px 0 0">Acciones para mañana</div>${bullets(resumenIA.recomendaciones, "#4F62D8")}` : ""}

      <div style="margin-top:18px;padding:14px 16px;background:#F7F8FA;border-radius:10px;font:400 12px/1.5 Arial,sans-serif;color:#6B7383">
        El detalle completo —actividad por hora, ranking de vendedores, conversaciones y pendientes— está en el PDF adjunto.
      </div>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #E6E9EF;font:400 11px Arial,sans-serif;color:#98A0B0">
      Generado automáticamente por el asistente de IA de NINIT CRM.
    </div>
  </div>
</div>`;
}

function textoPlano(metricas, resumenIA) {
  const k = metricas.kpis;
  return [
    `NINIT GROUP - Reporte diario ${fechaLarga(metricas.fecha, metricas.tz)}`,
    "",
    resumenIA.resumen,
    "",
    `Mensajes: ${k.mensajes} (${k.entrantes} de clientes)`,
    `Conversaciones: ${k.chatsActivos} - sin responder: ${k.chatsSinResponder}`,
    `Clientes nuevos: ${k.clientesNuevos} - sin asignar: ${k.leadsSinAsignar}`,
    `Pedidos: ${k.pedidos} por ${usd(k.facturacion)}`,
    `Respuesta mediana del equipo: ${fmtMin(k.respuestaMedianaMin)}`,
    "",
    ...metricas.porVendedor.map((v) => `- ${v.vendedor}: ${v.mensajes} msj, ${v.chats} chats, respuesta ${fmtMin(v.respuestaMedianaMin)}, efectividad ${v.efectividad}`),
    "",
    "El detalle completo está en el PDF adjunto.",
  ].join("\n");
}

export function destinatarios() {
  return (process.env.REPORTE_EMAIL_TO || DESTINO_DEFAULT)
    .split(",").map((s) => s.trim()).filter(Boolean);
}

/** Arma el mail completo (separado del envío para poder probarlo sin SMTP). */
export function armarMensaje({ metricas, resumenIA, pdf, from }) {
  const k = metricas.kpis;
  return {
    from: `"NINIT CRM" <${from}>`,
    to: destinatarios(),
    cc: (process.env.REPORTE_EMAIL_CC || "").split(",").map((s) => s.trim()).filter(Boolean),
    subject: `Reporte diario NINIT - ${fechaLarga(metricas.fecha, metricas.tz)} - ${k.mensajes} mensajes, ${k.clientesNuevos} clientes nuevos`,
    text: textoPlano(metricas, resumenIA),
    html: html(metricas, resumenIA),
    attachments: [{
      filename: `NINIT-reporte-diario-${metricas.fecha}.pdf`,
      content: pdf,
      contentType: "application/pdf",
    }],
  };
}

export async function enviarReporte({ metricas, resumenIA, pdf }) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""); // Google la muestra con espacios
  if (!user || !pass) {
    throw new Error("Falta configurar GMAIL_USER / GMAIL_APP_PASSWORD en el servidor.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  const mensaje = armarMensaje({ metricas, resumenIA, pdf, from: user });
  const info = await transporter.sendMail(mensaje);
  return { messageId: info.messageId, destinatarios: mensaje.to };
}
